// Generates src/shared/api/schema.gen.ts from the FleetConsole Api OpenAPI document.
//
// Usage: `npm run gen:api` with the Api running (e.g. under `aspire run`).
// Override the Api location with API_URL, e.g. `API_URL=https://localhost:7001 npm run gen:api`.
// The generated file is committed so the SPA builds without a running backend.
import { spawnSync } from 'node:child_process';

const apiUrl = (process.env.API_URL ?? 'http://localhost:5000').replace(/\/+$/, '');
const source = `${apiUrl}/openapi/v1.json`;
const output = 'src/shared/api/schema.gen.ts';

console.log(`Generating ${output} from ${source}`);
const result = spawnSync('npx', ['openapi-typescript', source, '--output', output], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
