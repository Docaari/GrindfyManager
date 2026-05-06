/**
 * Stats news_items — total + thumbnails populated.
 * Run: npx tsx --env-file=.env scripts/news-stats.ts
 */
import { db } from "../server/db";
import { newsItems } from "../shared/schema";
import { isNull, isNotNull, sql } from "drizzle-orm";

async function main() {
  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(newsItems);
  const [withThumb] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(newsItems)
    .where(isNotNull(newsItems.thumbnailUrl));
  const [noThumb] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(newsItems)
    .where(isNull(newsItems.thumbnailUrl));

  console.log(`Total       : ${total.count}`);
  console.log(`With thumb  : ${withThumb.count}`);
  console.log(`Without     : ${noThumb.count}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
