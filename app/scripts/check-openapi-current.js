import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildOpenApiDocument } from '../src/contracts/openapi.js';

const outputPath = resolve(process.cwd(), 'openapi.json');
const expected = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
let actual;

try {
  actual = await readFile(outputPath, 'utf8');
} catch (error) {
  throw new Error(`OpenAPI file is missing. Run npm run contracts:openapi. ${error.message}`);
}

if (actual !== expected) {
  console.error('app/openapi.json is not current. Run npm run contracts:openapi and commit the result.');
  process.exit(1);
}

console.log('app/openapi.json is current.');

