import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildOpenApiDocument } from '../src/contracts/openapi.js';

const outputPath = resolve(process.cwd(), 'openapi.json');
const document = buildOpenApiDocument();

await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Generated ${outputPath}`);

