/**
 * Backfill thumbnails — items news_items com thumbnail_url IS NULL.
 *
 * Para cada item, fetch da pagina + extract og:image / twitter:image.
 * UPDATE direto no DB. Concurrency 5, timeout 8s.
 *
 * Run: npx tsx --env-file=.env scripts/news-backfill-thumbnails.ts
 */
import { db } from "../server/db";
import { newsItems } from "../shared/schema";
import { isNull, eq } from "drizzle-orm";

const USER_AGENT = "GrindfyNewsBot/1.0 (+https://grindfy.com)";
const TIMEOUT_MS = 8000;
const CONCURRENCY = 5;

const IMAGE_RES = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
  /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  /"image"\s*:\s*"([^"]+)"/,
];

async function fetchImage(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: ctrl.signal,
    } as any);
    if (!res.ok) return null;
    const text = await res.text();
    for (const re of IMAGE_RES) {
      const m = re.exec(text);
      if (m && m[1]) {
        try {
          return new URL(m[1].trim(), url).toString();
        } catch {
          continue;
        }
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log("[backfill] querying items sem thumbnail...");
  const rows = await db
    .select({ id: newsItems.id, url: newsItems.url, sourceId: newsItems.sourceId })
    .from(newsItems)
    .where(isNull(newsItems.thumbnailUrl));

  console.log(`[backfill] ${rows.length} items pra processar`);

  let i = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;

  async function worker(workerId: number) {
    while (i < rows.length) {
      const idx = i++;
      const row = rows[idx];
      // X tweets nao tem og:image acessivel sem login — skip
      if (row.url.startsWith("https://x.com/") || row.url.startsWith("https://twitter.com/")) {
        skipped++;
        continue;
      }
      const img = await fetchImage(row.url);
      if (img) {
        try {
          await db.update(newsItems).set({ thumbnailUrl: img }).where(eq(newsItems.id, row.id));
          updated++;
          if (updated % 10 === 0) console.log(`[backfill] progress: ${updated} updated, ${failed} failed, ${skipped} skipped`);
        } catch (err) {
          console.error(`[backfill] update failed ${row.id}`, err);
          failed++;
        }
      } else {
        failed++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, (_, n) => worker(n)),
  );

  console.log(`[backfill] DONE: ${updated} updated, ${failed} no-image, ${skipped} skipped (X tweets)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] FAILED", err);
  process.exit(1);
});
