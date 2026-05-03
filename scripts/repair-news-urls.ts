/**
 * One-shot repair — Sprint home-reform-4 item 11.
 *
 * Para cada news_item existente:
 *   1. HEAD check no URL atual
 *   2. Se quebrado, substitui por homepage_url da source
 *   3. Loga acoes
 *
 * Run: npx tsx --env-file=.env scripts/repair-news-urls.ts
 */
import { Pool } from "pg";
import { isUrlReachable } from "../server/services/urlValidator";

interface Row {
  id: string;
  url: string;
  source_id: string;
  homepage_url: string | null;
  title: string;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query<Row>(`
      SELECT i.id, i.url, i.source_id, s.homepage_url, i.title
      FROM news_items i
      LEFT JOIN news_sources s ON s.id = i.source_id
      ORDER BY i.published_at DESC
    `);
    console.log(`Avaliando ${r.rows.length} items...`);

    let kept = 0;
    let replaced = 0;
    let skipped = 0;

    for (const row of r.rows) {
      const ok = await isUrlReachable(row.url);
      if (ok) {
        kept += 1;
        continue;
      }
      if (!row.homepage_url) {
        skipped += 1;
        console.warn("  SKIP (sem homepage_url):", row.source_id, row.url);
        continue;
      }
      await pool.query(`UPDATE news_items SET url = $1 WHERE id = $2`, [
        row.homepage_url,
        row.id,
      ]);
      replaced += 1;
      console.log(
        `  REPL ${row.source_id} :: ${row.url} -> ${row.homepage_url} (${row.title.slice(0, 50)})`,
      );
    }

    console.log(`\nDONE — kept=${kept} replaced=${replaced} skipped=${skipped}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
