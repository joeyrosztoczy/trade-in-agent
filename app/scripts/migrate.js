import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, closePool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const migrationsDir = path.join(root, 'db/migrations');

try {
  const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying migration ${file}`);
    await query(sql);
  }
  console.log('Migrations complete');
} finally {
  await closePool();
}
