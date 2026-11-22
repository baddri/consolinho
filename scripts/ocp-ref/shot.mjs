// Screenshots one route of the local OCP reference console (scripts/ocp-ref/run-console.sh) in light and dark,
// so UI parity is judged against the rendered OCP page rather than memory (UX.md §0).
// Usage: node scripts/ocp-ref/shot.mjs <route> <name> <outDir> [width=1280]  → <outDir>/ocp-<name>-<light|dark>.png
// Write into the scratchpad. Never commit screenshots.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const [route, name, outDir, width = '1280'] = process.argv.slice(2);
if (!route || !name || !outDir) { console.error('usage: shot.mjs <route> <name> <outDir> [width]'); process.exit(2); }
const browser = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: Number(width), height: 800 }, colorScheme: scheme });
  // The console keeps watch connections open, so 'networkidle' never fires: wait for load + heading + settle time.
  await page.goto(`http://127.0.0.1:9000${route}`, { waitUntil: 'load', timeout: 60000 });
  await page.locator('h1').first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${outDir}/ocp-${name}-${scheme}.png` });
  await page.close();
}
await browser.close();
