import { readFileSync } from "fs";
import { scrapeGgPoker } from "../server/services/news/htmlAdapters/scrapeGgPoker";
import { scrapePokerStars } from "../server/services/news/htmlAdapters/scrapePokerStars";

const gg = readFileSync("tests/fixtures/news-html-real/ggpoker.html", "utf8");
const ggOut = scrapeGgPoker(gg, "https://ggpoker.com");
console.log("=== GGPoker:", ggOut.length, "items");
ggOut.slice(0, 5).forEach((i) =>
  console.log(" -", i.title.slice(0, 70)),
);

const ps = readFileSync("tests/fixtures/news-html-real/pokerstars.html", "utf8");
const psOut = scrapePokerStars(ps, "https://www.pokerstars.com");
console.log("\n=== PokerStars:", psOut.length, "items");
psOut.slice(0, 5).forEach((i) =>
  console.log(" -", i.title.slice(0, 70)),
);
