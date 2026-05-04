/**
 * Re-categorize existing news_items via Sprint News-3.5 heuristica.
 *
 * Run once apos Sprint News-3.5 deploy. Items futuros sao categorizados
 * automaticamente pelo orchestrator no insert.
 */
import { db } from "../server/db";
import { newsItems } from "../shared/schema";
import { eq } from "drizzle-orm";
import { categorizeItem } from "../server/services/news/categorizeItem";

async function main() {
  // Apenas items de sources gossip (mundopoker, superpoker) precisam reclassify.
  const rows = await db
    .select()
    .from(newsItems)
    .where(eq(newsItems.category, "gossip"));

  console.log(`Found ${rows.length} gossip items to evaluate`);

  let toResults = 0;
  let stayGossip = 0;

  for (const r of rows) {
    const cat = categorizeItem({
      title: r.title,
      summary: r.summary,
      sourceCategory: "gossip",
    });
    if (cat === "tournament-results") {
      await db
        .update(newsItems)
        .set({ category: "tournament-results" })
        .where(eq(newsItems.id, r.id));
      toResults++;
      console.log(` → RESULT: ${r.title.slice(0, 70)}`);
    } else {
      stayGossip++;
    }
  }

  console.log(
    `\nDone. ${toResults} → tournament-results, ${stayGossip} → stay gossip`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
