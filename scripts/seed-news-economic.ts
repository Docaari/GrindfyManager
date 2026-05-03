/**
 * Popula DB com 1 source de cada categoria (4 chamadas Grok total).
 * Custo estimado: ~$0.05.
 *
 * Usage: npx tsx --env-file=.env scripts/seed-news-economic.ts
 */
import { fetchGrokNews } from "../server/services/grokNewsProvider";
import { listNewsSources, upsertNewsItem } from "../server/storage";

const PICK_ONE_PER_CATEGORY = ["hand2note", "mundopoker", "cravadas-br", "gto-wizard-studies"];

async function main() {
  console.log("[seed] iniciando — 4 chamadas Grok\n");
  const all = await listNewsSources();
  const picked = all.filter((s) => PICK_ONE_PER_CATEGORY.includes(s.id));

  let totalInserted = 0;
  for (const src of picked) {
    console.log(`[seed] chamando ${src.id} (${src.category})...`);
    const items = await fetchGrokNews({
      category: src.category as any,
      platform: src.platform,
      promptTemplate: src.queryTemplate ?? "",
      liveSearchHandle: src.liveSearchHandle,
      limit: 5,
    });
    console.log(`[seed]   retornou ${items.length} items`);
    for (const it of items) {
      const ok = await upsertNewsItem({ ...it, sourceId: src.id });
      if (ok) totalInserted += 1;
    }
  }
  console.log(`\n[seed] DONE. Total inserido (best-effort): ${totalInserted}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] erro top-level", err);
  process.exit(1);
});
