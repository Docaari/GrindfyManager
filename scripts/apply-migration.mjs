#!/usr/bin/env node
// Apply a raw SQL migration file using the DATABASE_URL from .env.
// Usage: node --env-file=.env scripts/apply-migration.mjs migrations/<file>.sql
import fs from 'node:fs';
import pg from 'pg';

const [, , file] = process.argv;
if (!file) {
  console.error('Usage: node --env-file=.env scripts/apply-migration.mjs <path.sql>');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = fs.readFileSync(file, 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log(`Applied ${file}`);
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
