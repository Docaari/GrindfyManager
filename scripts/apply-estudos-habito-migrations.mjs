import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}
const pool = new Pool({ connectionString: url });

const migrations = [
  'migrations/0052_study_sessions_v2.sql',
  'migrations/0053_user_focus_stats_nullable_theme.sql',
  'migrations/0054_users_habit_columns.sql',
];

(async () => {
  for (const file of migrations) {
    const path = resolve(process.cwd(), file);
    const sql = readFileSync(path, 'utf8');
    console.log(`-> Applying ${file}`);
    try {
      await pool.query(sql);
      console.log('   OK');
    } catch (err) {
      console.error('   FAILED:', err.message);
      process.exit(1);
    }
  }
  await pool.end();
  console.log('All migrations applied');
})();
