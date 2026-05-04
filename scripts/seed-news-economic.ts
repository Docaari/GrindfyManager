/**
 * @deprecated Sprint News-3 (RF-12) — provider Grok-LLM removido.
 *
 * Substituido pelo orchestrator (server/services/news/orchestrator.ts).
 * Para popular DB manualmente, use:
 *   POST /api/admin/news/refresh
 * Ou chame `runOrchestration()` direto do node REPL com env vars setadas.
 */

import { runOrchestration } from "../server/services/news/orchestrator";

async function main() {
  console.log("[seed] News-3 orchestrator — chamando runOrchestration()");
  const result = await runOrchestration();
  console.log(`[seed] DONE. Inserido: ${result.inserted}`);
  console.log(`       Skipped layer1=${result.skipped.layer1} layer2=${result.skipped.layer2} layer3=${result.skipped.layer3}`);
  console.log(`       Errors: ${result.errors.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] erro top-level", err);
  process.exit(1);
});
