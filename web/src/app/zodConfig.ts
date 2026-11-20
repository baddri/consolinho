// Side-effect module, imported first by main.tsx. zod 4 probes `new Function('')` when a `z.object()` schema is created to decide
// whether to JIT-compile parsers; under the Api's CSP (`script-src 'self'`, no 'unsafe-eval' — ADR-0029) that probe is
// blocked and reported as a CSP violation. `jitless` skips the probe and uses the interpreted parser (T-0104). So this must run before any schema is created.
import { z } from 'zod';

z.config({ jitless: true });
