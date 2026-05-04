// =============================================================================
// Coach lesson-recommendation prompt — Sprint home-reform-4 / Item 4 / RF-03.
//
// Extraido de server/coach/recommendLessonForUser.ts apos achado MEDIUM do
// reviewer: prompt inline diverge do cache da Anthropic (lesson #10) e dificulta
// versionamento. Manter aqui em arquivo unico evita drift silencioso.
//
// Versionamento:
//   - Mude `version` quando o prompt muda; isso invalida cache propositadamente.
//   - Comentario inline `// version: YYYY-MM-DD-vN` ajuda diff/blame.
// =============================================================================

import type { CatalogLessonInput } from "../recommendLessonForUser";

// version: 2026-05-03-v1
export function getCoachLessonRecommendationSystemPrompt(): string {
  return [
    "Voce eh o Coach IA do Grindfy, especialista em torneios MTT online.",
    "Sua tarefa: escolher 1 licao do catalogo abaixo que melhor atenda ao",
    "leak prioritario do jogador. Considere o perfil ativo e o ROI recente.",
    "Responda APENAS um JSON valido (sem prosa antes ou depois):",
    '{ "lesson_id": "...", "reason": "..." }',
    "Regras do reason: portugues brasileiro, 1-2 frases, max 240 caracteres,",
    "tom conversacional e direto. Foque no porque essa licao ajuda.",
  ].join(" ");
}

export function formatLessonRecommendationCatalog(
  lessons: CatalogLessonInput[],
): string {
  return lessons
    .map((l) => {
      const tags = (l.tags ?? []).join(",");
      const ct = l.courseTitle ? ` — ${l.courseTitle}` : "";
      return `- ${l.id} — ${l.title}${ct} — [${tags}]`;
    })
    .join("\n");
}
