import { fetchXSource } from "../server/services/news/xSearchProvider";

async function main() {
  const handles = ["PokerStars", "GGPoker", "888poker"];
  for (const h of handles) {
    console.log(`\n=== @${h} ===`);
    const out = await fetchXSource({
      id: h.toLowerCase(),
      name: h,
      category: "sites",
      platform: h.toLowerCase(),
      enabled: true,
      rssUrl: null,
      homepageUrl: null,
      scrapeStrategy: "x_only",
      xHandle: h,
    } as any);
    console.log(`  count: ${out.length}`);
    for (const i of out) {
      console.log(`  - ${i.publishedAt} | ${i.url}`);
      console.log(`    ${i.title.slice(0, 80)}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
