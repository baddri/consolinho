// UI parity probe: measures our mock UI against the local OCP reference console and prints a TEXT diff of computed
// styles, so parity is checked with numbers ("gap 15px vs 7px") instead of eyeballing full-page screenshots, which
// stay in an agent's context for the rest of its session (CLAUDE.md "Screenshots", T-0137/T-0138).
//
// Usage:
//   node scripts/ui-probe.mjs <ours-route> <ocp-route> [--pair '<ourSel>=<ocpSel>' ...] [--props a,b,...]
//        [--width 1280] [--theme light|dark|both] [--shot <outDir>] [--user admin|alice]
//   node scripts/ui-probe.mjs --stop          # stop the mock server this script started
// Pass '-' as the OCP route to probe only our side.
//
// Our side is the mock UI on a FIXED port (5199). It is started once, detached, and left running so later calls
// reuse it; agents never start or kill dev servers by hand. The OCP side is scripts/ocp-ref/run-console.sh on
// 127.0.0.1:9000. It runs with the user's token, so this script only navigates and reads: it never clicks anything.
// Screenshots (--shot) are clipped to the probed elements and belong in the scratchpad; never commit them.
import { spawn } from 'node:child_process';
import { openSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const OURS = 'http://127.0.0.1:5199';
const OCP = 'http://127.0.0.1:9000';
const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));
const PID_FILE = join(tmpdir(), 'fleetconsole-ui-probe-vite.pid');
const LOG_FILE = join(tmpdir(), 'fleetconsole-ui-probe-vite.log');
const DEFAULT_PROPS = [
  'font-family', 'font-size', 'font-weight', 'line-height', 'color', 'background-color', 'padding', 'margin', 'gap',
  'border', 'border-radius', 'width', 'height',
];
const USAGE =
  "usage: ui-probe.mjs <ours-route> <ocp-route|-> [--pair 'ourSel=ocpSel' ...] [--props a,b] [--width 1280]\n" +
  '                    [--theme light|dark|both] [--shot <outDir>] [--user admin|alice]   |   ui-probe.mjs --stop';

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

/** Parses argv into routes + options; any malformed flag is a usage error (exit 2). */
function parseArgs(argv) {
  const opts = { pairs: [], props: DEFAULT_PROPS, width: 1280, themes: ['light'], shot: null, user: null, stop: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i] ?? fail(`${a} needs a value\n${USAGE}`);
    if (a === '--stop') opts.stop = true;
    else if (a === '--pair') {
      const v = val();
      const eq = v.indexOf('=');
      if (eq <= 0 || eq === v.length - 1) fail(`--pair must be 'ourSel=ocpSel', got '${v}'`);
      opts.pairs.push([v.slice(0, eq), v.slice(eq + 1)]);
    } else if (a === '--props') opts.props = val().split(',').map((p) => p.trim()).filter(Boolean);
    else if (a === '--width') opts.width = Number(val()) || fail('--width must be a number');
    else if (a === '--theme') {
      const t = val();
      if (!['light', 'dark', 'both'].includes(t)) fail('--theme must be light, dark or both');
      opts.themes = t === 'both' ? ['light', 'dark'] : [t];
    } else if (a === '--shot') opts.shot = val();
    else if (a === '--user') opts.user = val();
    else if (a.startsWith('--')) fail(`unknown option ${a}\n${USAGE}`);
    else positional.push(a);
  }
  if (opts.stop) return opts;
  if (positional.length !== 2) fail(USAGE);
  [opts.oursRoute, opts.ocpRoute] = positional;
  return opts;
}

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Reuses the mock server on 5199, or starts it detached and waits until it answers; it keeps running afterwards. */
async function ensureMockServer() {
  if (await isUp(OURS)) return;
  const log = openSync(LOG_FILE, 'a');
  const child = spawn('npx', ['vite', '--mode', 'mock', '--port', '5199', '--strictPort', '--host', '127.0.0.1'], {
    cwd: WEB_DIR, detached: true, stdio: ['ignore', log, log],
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isUp(OURS)) return;
  }
  fail(`mock server did not come up on 5199 within 60s; see ${LOG_FILE}`);
}

/** Stops only the server this script started (its process group), identified by the pid file. */
function stopMockServer() {
  let pid;
  try { pid = Number(readFileSync(PID_FILE, 'utf8')); } catch { console.log('no probe-started mock server'); return; }
  try { process.kill(-pid, 'SIGTERM'); console.log(`stopped mock server (pgid ${pid})`); }
  catch { console.log('mock server was not running'); }
  rmSync(PID_FILE, { force: true });
}

function withUser(route, user) {
  if (!user) return route;
  return `${route}${route.includes('?') ? '&' : '?'}mockUser=${encodeURIComponent(user)}`;
}

/** Opens a route like scripts/ocp-ref/shot.mjs does: load + first h1 + settle (OCP never reaches networkidle). */
async function open(browser, url, width, theme) {
  const page = await browser.newPage({ viewport: { width, height: 800 }, colorScheme: theme });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.locator('h1').first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(url.startsWith(OCP) ? 4000 : 1500);
  return page;
}

/** Computed styles + box of the first element matching `sel`, and the gap to its previous element sibling. */
async function measure(page, sel, props) {
  const el = page.locator(sel).first();
  if ((await el.count()) === 0) return null;
  return el.evaluate((node, wanted) => {
    const cs = getComputedStyle(node);
    const out = {};
    for (const p of wanted) out[p] = cs.getPropertyValue(p);
    const box = node.getBoundingClientRect();
    out['box'] = `${Math.round(box.width)}x${Math.round(box.height)}`;
    const prev = node.previousElementSibling;
    if (prev) {
      const pb = prev.getBoundingClientRect();
      const sameRow = Math.abs(pb.top - box.top) < box.height / 2;
      out['gap-to-prev'] = `${Math.round(sameRow ? box.left - pb.right : box.top - pb.bottom)}px ${sameRow ? 'x' : 'y'}`;
    }
    return out;
  }, props);
}

async function clip(page, sel, path) {
  const el = page.locator(sel).first();
  if ((await el.count()) > 0) await el.screenshot({ path });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.stop) return stopMockServer();

  await ensureMockServer();
  const probeOcp = opts.ocpRoute !== '-';
  const ocpUp = probeOcp && (await isUp(OCP));
  if (probeOcp && !ocpUp) {
    console.log('OCP reference console is not running on :9000; ask the orchestrator to start scripts/ocp-ref/run-console.sh. Probing our side only.');
  }
  if (opts.shot) mkdirSync(opts.shot, { recursive: true });

  const browser = await chromium.launch();
  let mismatches = 0;
  let checked = 0;
  try {
    for (const theme of opts.themes) {
      const ours = await open(browser, OURS + withUser(opts.oursRoute, opts.user), opts.width, theme);
      const ocp = ocpUp ? await open(browser, OCP + opts.ocpRoute, opts.width, theme) : null;
      console.log(`== ${theme} @${opts.width}: ours ${opts.oursRoute}${ocp ? `  vs  ocp ${opts.ocpRoute}` : ''}`);

      for (const [i, [ourSel, ocpSel]] of opts.pairs.entries()) {
        const a = await measure(ours, ourSel, opts.props);
        const b = ocp ? await measure(ocp, ocpSel, opts.props) : null;
        if (!a) console.log(`${ourSel}: not found (ours)`);
        if (ocp && !b) console.log(`${ocpSel}: not found (ocp)`);
        if (a && !ocp) {
          // No reference to diff against: print our values so the caller can compare with the task's OCP numbers.
          console.log(`${ourSel} | ${Object.entries(a).map(([k, v]) => `${k}=${v}`).join('; ')}`);
        } else if (a && b) {
          for (const k of Object.keys(a)) {
            checked++;
            if (a[k] !== b[k]) {
              mismatches++;
              console.log(`${ourSel} | ${k}: ours=${a[k]} ocp=${b[k] ?? '(none)'}`);
            }
          }
        }
        if (opts.shot) {
          await clip(ours, ourSel, join(opts.shot, `ours-${i}-${theme}.png`));
          if (ocp) await clip(ocp, ocpSel, join(opts.shot, `ocp-${i}-${theme}.png`));
        }
      }
      if (opts.shot && opts.pairs.length === 0) {
        await ours.screenshot({ path: join(opts.shot, `ours-${theme}.png`) });
        if (ocp) await ocp.screenshot({ path: join(opts.shot, `ocp-${theme}.png`) });
      }
      await ours.close();
      if (ocp) await ocp.close();
    }
  } finally {
    await browser.close();
  }
  if (ocpUp && opts.pairs.length) console.log(`${mismatches} mismatches / ${checked} checked`);
}

await main();
