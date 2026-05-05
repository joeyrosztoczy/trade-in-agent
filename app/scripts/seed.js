import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, closePool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const seedsDir = path.join(root, 'db/seeds');

try {
  const files = fs.readdirSync(seedsDir).filter(file => file.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
    console.log(`Applying seed ${file}`);
    await query(sql);
  }
  console.log('Seeds complete');
} finally {
  await closePool();
}
