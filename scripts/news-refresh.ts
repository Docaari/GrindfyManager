/**
 * Manual news refresh — invoca orchestrator + clear cache.
 * Run: npx tsx --env-file=.env scripts/news-refresh.ts
 */
import { runOrchestration } from "../server/services/news/orchestrator";

async function main() {
  console.log("[news-refresh] starting...");
  const result = await runOrchestration();
  console.log("[news-refresh] done:", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("[news-refresh] FAILED", err);
  process.exit(1);
});
