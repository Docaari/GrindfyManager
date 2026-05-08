import pg from 'pg';
import fs from 'fs';
import 'dotenv/config';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const sql = fs.readFileSync('migrations/0059_curated_themes_v2.sql', 'utf8');
try {
  await c.query(sql);
  console.log('OK migration 0059 applied');
  const cnt = await c.query(
    "SELECT is_curated, COUNT(*)::int AS n FROM study_themes GROUP BY is_curated ORDER BY is_curated"
  );
  console.log('study_themes by is_curated:', cnt.rows);
  const slugs = await c.query(
    "SELECT slug, COUNT(*)::int AS n FROM study_themes WHERE is_curated = true GROUP BY slug ORDER BY slug"
  );
  console.log('curated slugs remaining:', slugs.rows.length, 'distinct');
} catch (e) {
  console.error('FAIL', e.message);
  process.exit(1);
} finally {
  await c.end();
}
