// Sprint MP3.1 Wave A / H1 — CLI one-shot backfill.
// Uso: tsx --env-file=.env scripts/backfill-transcription-preview.ts [--limit=N] [--lesson=ID]
//
// Pre-req: .env com MUX_TOKEN_ID + MUX_TOKEN_SECRET. Sem env -> aborta cedo
// (ingestor retorna reason='mux_not_configured' por lesson, mas o orchestrator
// nao desperdica round-trips).

import { backfillTranscriptionPreviews } from "../server/storage/transcriptionPreviewStorage";

interface Args {
  limit?: number;
  lessonIds?: string[];
}

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (const a of argv.slice(2)) {
    if (a.startsWith("--limit=")) {
      const n = parseInt(a.split("=")[1], 10);
      if (Number.isFinite(n) && n > 0) out.limit = n;
    } else if (a.startsWith("--lesson=")) {
      const id = a.split("=")[1];
      if (id) {
        out.lessonIds = out.lessonIds ?? [];
        out.lessonIds.push(id);
      }
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
    // eslint-disable-next-line no-console
    console.error(
      "[backfill] MUX_TOKEN_ID/MUX_TOKEN_SECRET ausentes — abortando.",
    );
    process.exit(2);
  }
  // eslint-disable-next-line no-console
  console.log("[backfill] iniciando...", args);
  const result = await backfillTranscriptionPreviews({
    lessonIds: args.lessonIds,
    limit: args.limit,
    onProgress(n, total, lessonId) {
      if (n % 5 === 0 || n === total) {
        // eslint-disable-next-line no-console
        console.log(`[backfill] ${n}/${total} (lesson=${lessonId})`);
      }
    },
  });
  // eslint-disable-next-line no-console
  console.log("[backfill] done", result);
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[backfill] fatal", err);
  process.exit(1);
});
