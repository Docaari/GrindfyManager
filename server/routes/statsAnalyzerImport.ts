// =============================================================================
// Sprint Stats-V2 — Paste import preview endpoint (RF-05)
//
// POST /api/hud-stat-snapshots/preview
//   body: { pasted: string }
//   resp: { matched, unmatched, invalid }
//
// Handler isolado (testavel sem app Express completo). Wiring opcional:
//   import { handlePostPasteImportPreview } from './statsAnalyzerImport';
//   app.post('/api/hud-stat-snapshots/preview', requireAuth, handler);
// =============================================================================

import { parsePastedSnapshot } from "../../shared/snapshot-import-parser";

const MAX_PASTE_BYTES = 50 * 1024; // 50KB

export async function handlePostPasteImportPreview(
  req: any,
  res: any,
): Promise<void> {
  // Auth fail-safe (caso handler chamado sem middleware)
  const userId = req?.user?.userPlatformId;
  if (!userId) {
    res.status(401).json({ message: "Nao autenticado." });
    return;
  }

  const body = req?.body ?? {};
  const pasted = body.pasted;

  if (typeof pasted !== "string") {
    res.status(400).json({
      message: "Body invalido: campo `pasted` ausente ou nao string.",
    });
    return;
  }

  if (Buffer.byteLength(pasted, "utf8") > MAX_PASTE_BYTES) {
    res
      .status(413)
      .json({ message: `Paste maior que ${MAX_PASTE_BYTES} bytes.` });
    return;
  }

  try {
    const result = parsePastedSnapshot(pasted);
    res.status(200).json({
      matched: result.matched,
      unmatched: result.unmatched,
      invalid: result.invalid,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[stats-v2-import] preview parse failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ message: "Falha ao processar paste." });
  }
}
