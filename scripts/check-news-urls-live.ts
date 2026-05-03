/**
 * HEAD check current news_items URLs to see how many actually resolve.
 */
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function head(url: string): Promise<{ ok: boolean; status: number | string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    return { ok: r.ok, status: r.status };
  } catch (e: any) {
    return { ok: false, status: e?.message ?? "ERR" };
  }
}

(async () => {
  const r = await pool.query(
    `SELECT id, url, source_id FROM news_items ORDER BY published_at DESC`,
  );
  const out: any[] = [];
  for (const row of r.rows) {
    const res = await head(row.url);
    out.push({ id: row.id.slice(0, 8), source_id: row.source_id, url: row.url, ...res });
  }
  console.table(out);
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
