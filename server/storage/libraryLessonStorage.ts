// Sprint Mini Player 3.2 / W-A4 (ADR-201) — Library lesson API serializer.
//
// Centraliza a logica de resolver multi-lang previews para o shape esperado
// pelo client (string single-lang). O server escolhe lang via user.preferredLanguage.

import { resolveTranscriptionPreview } from "./transcriptionPreviewStorage";

export interface LessonRowLike {
  id: string;
  slug?: string;
  transcriptionPreviews?: Record<string, string> | null;
  transcriptionPreview?: string | null;
  [key: string]: any;
}

export interface UserLike {
  preferredLanguage?: string | null;
}

/**
 * Serializa uma lesson para o response da API publica.
 *
 * Resolve `transcriptionPreview` a partir de `transcriptionPreviews` (JSONB
 * multi-lang) usando o `preferredLanguage` do user. Mantem todos os outros
 * campos da lesson intactos. Remove `transcriptionPreviews` do output (UI
 * recebe so a string single-lang).
 */
export function serializeLessonForApi(
  lesson: LessonRowLike,
  user: UserLike | null | undefined,
): LessonRowLike {
  const userLang = user?.preferredLanguage ?? null;
  const resolved = resolveTranscriptionPreview(
    {
      transcriptionPreviews: lesson.transcriptionPreviews ?? null,
      transcriptionPreview: lesson.transcriptionPreview ?? null,
    },
    userLang,
  );
  // Shallow clone + remove campo multi-lang interno.
  const out: LessonRowLike = { ...lesson };
  delete out.transcriptionPreviews;
  out.transcriptionPreview = resolved;
  return out;
}
