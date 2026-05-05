import pg from 'pg';

const { Pool } = pg;

export function databaseUrl() {
  return process.env.DATABASE_URL || 'postgres://trade_in_agent:trade_in_agent@localhost:5432/trade_in_agent_dev';
}

export const pool = new Pool({
  connectionString: databaseUrl()
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
