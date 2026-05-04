/**
 * @deprecated Sprint News-3 (RF-12) — provider Grok-LLM removido.
 *
 * Smoke test substituido. Use `runOrchestration()` direto:
 *   npx tsx --env-file=.env scripts/test-news-fetch.ts
 */

import { fetchBlogSource } from "../server/services/news/blogScraperProvider";
import { fetchXSource } from "../server/services/news/xSearchProvider";

async function main() {
  console.log("[test] XAI_API_KEY presente:", !!process.env.XAI_API_KEY);
  console.log("[test] XAI_MODEL:", process.env.XAI_MODEL ?? "(default)");

  console.log("\n[test] BlogScraper hand2note (html_and_x)...");
  const blogItems = await fetchBlogSource({
    id: "hand2note",
    category: "tools",
    platform: "hand2note",
    rssUrl: null,
    homepageUrl: "https://hand2note.com/Blog",
    scrapeStrategy: "html",
    xHandle: null,
  });
  console.log(`[test] blog: ${blogItems.length} items`);
  for (const it of blogItems.slice(0, 3)) {
    console.log("---");
    console.log("title:", it.title);
    console.log("url:", it.url);
    console.log("publishedAt:", it.publishedAt);
  }

  console.log("\n[test] XSearch sharkscope (x_only)...");
  const xItems = await fetchXSource({
    id: "sharkscope",
    category: "tools",
    platform: "sharkscope",
    rssUrl: null,
    homepageUrl: null,
    scrapeStrategy: "x_only",
    xHandle: "sharkscope",
  });
  console.log(`[test] x: ${xItems.length} items`);
  for (const it of xItems.slice(0, 3)) {
    console.log("---");
    console.log("title:", it.title);
    console.log("url:", it.url);
    console.log("publishedAt:", it.publishedAt);
  }
}

main().catch((err) => {
  console.error("[test] erro top-level", err);
  process.exit(1);
});
