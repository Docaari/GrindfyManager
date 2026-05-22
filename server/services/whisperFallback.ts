// Sprint Mini Player 3.2 / W-A3 (ADR-200) — Whisper local fallback (PLACEHOLDER).
//
// Quando Mux nao tem track ready apos 24h OU preview vier ruim, fallback
// Whisper local (CPU-friendly modelo `small`). Gate por env
// WHISPER_FALLBACK_ENABLED=true (default false — sem surpresas deploy).
//
// ADR-200 marca a decisao entre whisper.cpp (binary) e openai-whisper
// (Python). Esta implementacao e placeholder com gate apenas — a invocacao
// real do subprocess fica deferred para sprint futuro se demanda emergir.

export interface WhisperFallbackInput {
  playbackId: string;
  lang?: string;
  timeoutMs?: number;
}

export interface WhisperFallbackResult {
  ok: boolean;
  preview?: string | null;
  reason?: "whisper_disabled" | "whisper_not_implemented" | "timeout" | "subprocess_error";
}

function whisperEnabled(): boolean {
  return process.env.WHISPER_FALLBACK_ENABLED === "true";
}

/**
 * Tenta gerar preview via Whisper local. Gate por env. Atualmente retorna
 * `whisper_disabled` ou `whisper_not_implemented` — placeholder. Futuro:
 * baixar audio.m4a do Mux + spawn whisper.cpp + parse output -> preview.
 */
export async function tryWhisperFallback(
  input: WhisperFallbackInput,
): Promise<WhisperFallbackResult> {
  if (!whisperEnabled()) {
    return { ok: false, reason: "whisper_disabled" };
  }
  // Placeholder ate decisao final ADR-200 + implementacao real.
  return { ok: false, reason: "whisper_not_implemented" };
}
