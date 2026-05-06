/**
 * Sample news_items por aba — dump pra confirmar categorizacao + thumbnail.
 * Run: npx tsx --env-file=.env scripts/news-sample.ts
 */
import { db } from "../server/db";
import { newsItems } from "../shared/schema";
import { desc } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      title: newsItems.title,
      category: newsItems.category,
      platform: newsItems.platform,
      thumbnailUrl: newsItems.thumbnailUrl,
      url: newsItems.url,
    })
    .from(newsItems)
    .orderBy(desc(newsItems.publishedAt))
    .limit(30);

  for (const r of rows) {
    const t = r.thumbnailUrl ? "[IMG] " : "[--- ] ";
    console.log(`${t}${r.category}\t${r.title.slice(0, 80)}`);
  }
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
