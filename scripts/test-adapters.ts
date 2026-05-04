import { readFileSync } from "fs";
import { scrapeSuperPoker } from "../server/services/news/htmlAdapters/scrapeSuperPoker";
import { scrapeHrc } from "../server/services/news/htmlAdapters/scrapeHrc";

const sp = readFileSync("tests/fixtures/news-html-real/superpoker.html", "utf8");
const spOut = scrapeSuperPoker(sp, "https://superpoker.com.br");
console.log("=== SuperPoker:", spOut.length, "items");
spOut.slice(0, 5).forEach((i) =>
  console.log(" -", i.title.slice(0, 60), "|", i.url.slice(34, 90)),
);

const hrc = readFileSync("tests/fixtures/news-html-real/hrc.html", "utf8");
const hrcOut = scrapeHrc(hrc, "https://www.holdemresources.net");
console.log("\n=== HRC:", hrcOut.length, "items");
hrcOut.slice(0, 5).forEach((i) =>
  console.log(" -", i.publishedAt.slice(0, 10), "|", i.title.slice(0, 60)),
);
