/**
 * Sprint Estudos-Coach-Biblio-2 — RF-4 Coach session insights prompts.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-4.3
 * ADR  : 134 (DRY de prompts — lesson #10)
 */

export const COACH_SESSION_INSIGHTS_PROMPT_VERSION = "v1";

export const COACH_SESSION_INSIGHTS_SYSTEM_PROMPT = `Voce eh o Coach AI da Grindfy, especialista em performance de poker MTT.
Sua tarefa: analisar uma SESSAO /grind-live finalizada do jogador e gerar INSIGHTS estruturados.

Regras de output:
- Responda APENAS via tool_use 'coachSessionInsights' (output JSON).
- summary: 1-2 frases (max 200 char) destacando o ponto chave da sessao.
- topHands: max 3. handId DEVE pertencer ao whitelist 'sessionSpotIds' (NAO inventar).
  - rationale: max 200 char. Cite stats, range, ou EV/range concretos.
  - action: 'review' (volta nessa mao) ou 'study' (linkar aula).
  - ctaUrl: URL Wouter relativa (/estudos/spots/<spotId>) ou (/biblioteca/curso/X/Y/play).
- suggestedLessons: max 2. lessonId DEVE pertencer ao whitelist 'availableLessons'.
  - rationale: max 150 char. Conecta a uma decisao da sessao.
- spotsToReview: lista TODOS os spots da sessao (mesmo que NAO escolhidos para topHands).
  - suggestedAction: 'add_insight' (gravar nota), 'link_theme' (ligar a tema), 'review_later' (volta depois).
- focusStatsHighlight: max 3. Use stats foco do mes do jogador.
- Idioma: portugues do Brasil.

Anti-hallucinacao:
- NAO invente handId. Use apenas IDs de sessionSpotIds.
- NAO invente lessonId. Use apenas IDs de availableLessons.
- Se contexto for muito magro (poucas torneios, sem spots), summary pode ser breve mas DEVE existir.
- NAO use placeholders 'XXX' ou 'TBD'.
`;

export interface SessionInsightsUserContext {
  sessionDate: string;
  tournamentsCount: number;
  durationHours: number;
  profitUsd: number;
  spots: Array<{ id: string; label: string }>;
  sessionSpotIds: string[];
  focusStats: Array<{ statId: string; statName: string }>;
  availableLessons: Array<{
    id: string;
    title: string;
    courseSlug: string;
    lessonSlug: string;
  }>;
}

export function buildSessionInsightsUserBlock(
  ctx: SessionInsightsUserContext,
): string {
  const spotsBlock =
    ctx.spots.length > 0
      ? ctx.spots
          .map((s) => `- id=${s.id} | ${s.label}`)
          .join("\n")
      : "(sem spots gravados nesta sessao)";
  const focusBlock =
    ctx.focusStats.length > 0
      ? ctx.focusStats
          .map((f) => `- ${f.statName} (${f.statId})`)
          .join("\n")
      : "(nenhum)";
  const lessonsBlock =
    ctx.availableLessons.length > 0
      ? ctx.availableLessons
          .map((l) => `- id=${l.id} | ${l.title}`)
          .join("\n")
      : "(catalogo vazio)";

  return `Sessao analisada:

Data: ${ctx.sessionDate}
Torneios jogados: ${ctx.tournamentsCount}
Duracao: ${ctx.durationHours.toFixed(1)}h
Resultado: $${ctx.profitUsd.toFixed(2)}

Spots gravados (whitelist — use apenas estes IDs em handId/spotId):
${spotsBlock}

Stats foco do mes:
${focusBlock}

Aulas disponiveis (whitelist — use apenas estes IDs em lessonId):
${lessonsBlock}

Gere insights estruturados via tool 'coachSessionInsights'.`;
}
