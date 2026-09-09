import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from './db.js';

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

export async function migrate() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.version));

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const pending = files.filter((name) => !applied.has(name));

  if (pending.length === 0) {
    console.log('migrations: schema is up to date, nothing to apply');
    return [];
  }

  for (const file of pending) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`migrations: applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${error.message}`, { cause: error });
    } finally {
      client.release();
    }
  }

  return pending;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    await migrate();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
