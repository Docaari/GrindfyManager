import pg from 'pg';
import 'dotenv/config';
import { nanoid } from 'nanoid';

const FOUNDER_ID = process.argv[2] ?? 'USER-0005';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const seed = await import('../server/seeds/study-themes-seed.ts');
const themes = seed.CURATED_STUDY_THEMES;

let inserted = 0;
const now = new Date();
for (const t of themes) {
  const r = await c.query(
    `INSERT INTO study_themes (id, user_id, name, color, emoji, is_favorite, sort_order, progress,
       slug, is_curated, category, linked_stats, linked_lessons, seeded_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, false, 0, 0, $6, true, $7, $8::jsonb, $9::jsonb, $10, $10, $10)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      nanoid(),
      FOUNDER_ID,
      t.name,
      t.color,
      t.emoji,
      t.slug,
      t.category,
      JSON.stringify(t.linkedStats),
      JSON.stringify(t.linkedLessonSlugs),
      now,
    ]
  );
  if (r.rowCount > 0) inserted++;
}

console.log(`Inserted ${inserted}/${themes.length} curated themes for ${FOUNDER_ID}`);

const total = await c.query(
  "SELECT category, COUNT(*)::int AS n FROM study_themes WHERE user_id = $1 AND is_curated = true GROUP BY category ORDER BY category",
  [FOUNDER_ID]
);
console.log('By category:', total.rows);

await c.end();
