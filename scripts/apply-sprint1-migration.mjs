import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL nao encontrada. Rode com: node --env-file=.env scripts/apply-sprint1-migration.mjs');
  process.exit(1);
}

const sql = readFileSync(new URL('../migrations/0003_sprint1_tournament_types.sql', import.meta.url), 'utf-8');

const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  console.log('[migration] aplicando 0003_sprint1_tournament_types.sql...');
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('[migration] OK — todas as ALTER TABLE/UPDATE aplicadas (idempotente).');

  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'tournaments'
      AND column_name IN ('is_flight','is_live','satellite_reward_type','flight_day','package_buy_in','entered_via_satellite')
    ORDER BY column_name;
  `);
  console.log('[verify] colunas em tournaments:', cols.rows.map(r => r.column_name));

  const colsP = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'planned_tournaments'
      AND column_name IN ('is_flight','is_live','category','flight_day','satellite_reward_type')
    ORDER BY column_name;
  `);
  console.log('[verify] colunas em planned_tournaments:', colsP.rows.map(r => r.column_name));

  const idx = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'tournaments'
      AND indexname IN ('tournaments_satellite_target_idx','tournaments_flight_parent_idx','tournaments_live_idx')
    ORDER BY indexname;
  `);
  console.log('[verify] indexes parciais:', idx.rows.map(r => r.indexname));
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[migration] FALHA:', err.message);
  process.exit(2);
} finally {
  client.release();
  await pool.end();
}
