// =============================================================================
// shared/library-format-helpers.ts — Sprint Biblioteca-1 / simplify F12.
//
// Helpers compartilhados entre server (routes/library.ts, recommendLesson.ts,
// htmlSanitizer.ts) e client (LessonViewer.tsx). Centraliza:
//   - LIBRARY_ASSETS_URL_PREFIX (constante usada para validar src de imagem)
//   - assetUrl(key) -> URL HTTP do asset
//   - durationMinutesFromLesson(lesson) -> minutos arredondados (max audio/video)
//   - computeStartPositionForFormatSwitch(...) -> D5 sync cross-format
//
// Evita drift de string literal "/api/library/assets/" e logica duplicada.
// =============================================================================

export const LIBRARY_ASSETS_URL_PREFIX = "/api/library/assets/";

export function assetUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `${LIBRARY_ASSETS_URL_PREFIX}${key}`;
}

export interface LessonDurationFields {
  audioDurationSeconds?: number | null;
  videoDurationSeconds?: number | null;
}

export function durationMinutesFromLesson(lesson: LessonDurationFields | null | undefined): number {
  if (!lesson) return 0;
  const dur = Math.max(
    Number(lesson.audioDurationSeconds ?? 0),
    Number(lesson.videoDurationSeconds ?? 0),
  );
  return Math.round(dur / 60);
}

export interface FormatSwitchInput {
  sourceLastPositionSeconds: number | undefined;
  destinationTotalDurationSeconds: number | undefined;
}

/**
 * D5 cross-format sync — start position absoluta em segundos.
 * Se posicao no source excede totalDuration do destino, fallback para 0.
 */
export function computeStartPositionForFormatSwitch(input: FormatSwitchInput): number {
  const src = input.sourceLastPositionSeconds;
  const dst = input.destinationTotalDurationSeconds;
  if (typeof src !== "number" || !Number.isFinite(src) || src <= 0) return 0;
  if (typeof dst !== "number" || !Number.isFinite(dst) || dst <= 0) return 0;
  if (src > dst) return 0;
  return src;
}
