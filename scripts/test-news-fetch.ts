/**
 * Smoke test economico: 1 source so, limit=3, sem live search.
 * Roda standalone via:
 *   npx tsx --env-file=.env scripts/test-news-fetch.ts
 */
import { fetchGrokNews } from "../server/services/grokNewsProvider";

async function main() {
  console.log("[test] XAI_API_KEY presente:", !!process.env.XAI_API_KEY);
  console.log("[test] XAI_MODEL:", process.env.XAI_MODEL ?? "(default)");
  console.log("[test] chamando fetchGrokNews(market / hand2note, limit=3)...\n");

  const items = await fetchGrokNews({
    category: "market",
    platform: "hand2note",
    promptTemplate:
      "Atualizacoes recentes da plataforma Hand2Note (perfil X @Hand2Note + site oficial) nos ultimos 7 dias.",
    liveSearchHandle: "Hand2Note",
    limit: 3,
  });

  console.log(`[test] retornou ${items.length} items:\n`);
  for (const it of items) {
    console.log("---");
    console.log("title:", it.title);
    console.log("summary:", it.summary);
    console.log("url:", it.url);
    console.log("publishedAt:", it.publishedAt);
    console.log("platform:", it.platform);
    if (it.engagement) console.log("engagement:", it.engagement);
  }

  if (items.length === 0) {
    console.log("\n[test] zero items — pode ser: prompt sem hits, allowlist bloqueou URLs, ou JSON malformado.");
  }
}

main().catch((err) => {
  console.error("[test] erro top-level", err);
  process.exit(1);
});
