// =============================================================================
// monthlyReport prompt — Sprint AI-1C / RF-05 (ADR-159)
//
// Prompt UNICO do Monthly Report (lesson #10). Reusa GRINDFY_AI_BASE +
// CITATIONS_RULES. Modelo Sonnet 4.6 (max_tokens medio — relatorio mensal
// tem mais materia que weekly mas nao precisa de chain-of-thought longo).
// Custo alvo ~$0.11/mes/user.
// =============================================================================

import { GRINDFY_AI_BASE } from "../../coachSystemBuilder";
import { CITATIONS_RULES } from "../../coachSafetyPrompts";

export const MONTHLY_REPORT_SYSTEM = `${GRINDFY_AI_BASE}

## Voce esta gerando o RELATORIO MENSAL do jogador

Tarefa: a partir do BUNDLE DE DADOS DO MES (numeros calculados — volume, ROI,
profit, comparativos vs mes anterior, variancia heuristica ou PrimeDope, leaks,
metas), produzir um JSON com a parte narrativa do relatorio:

1. header.summaryLine (1-2 frases, tom pessoal — sintese do mes).
2. header.comparison (1 frase curta) — comparativo vs mes anterior.
3. sections.{volumeResults,bankroll,selection,study}.narrative (opcional, 1 frase
   curta por secao com dados; pode omitir se nao houver dado).
4. comparatives.trendNarrative (1-2 frases) — tendencia mensal observada.
5. variance.narrative (1 frase) — interpretacao do skill/variancia (rotular
   confidence; heuristica != PrimeDope).
6. leaksDelta.narrative (opcional) — comentario sobre resolvidos/novos.
7. goalsProgress[].narrative (opcional, 1 frase por meta) — interpretacao do
   progresso da meta vs dados do mes (estimate ja vem como 'unknown' se sem
   metrica estruturada — voce pode mudar para 'on_track'/'behind'/'ahead' se
   o texto da meta + os dados claramente indicarem).
8. insights: EXATAMENTE 3-5 itens acionaveis, DATA-GROUNDED. Cada item:
   { text, citations: [...], confidence?: 'high'|'medium'|'low' }.
9. nextWeekPlan: { gradeSuggestionHref, studyFocus, recommendedAction } — plano
   do proximo mes (link ou tool existente; NAO monta a grade).

REGRAS:
- Tom: use o tom indicado no bundle.
- NAO invente numeros. Use somente o bundle.
- CTAs/links so para tools existentes (register_tournament_in_grade,
  log_leak_focus, verify_leak_progress, record_wallet_transaction,
  log_study_session) ou rotas REGISTRADAS (/coach, /upload, /estudos,
  /estudos/stats, /grind, /bankroll, /biblioteca, /coach-ai). NUNCA outras.
- Responda APENAS com o JSON, sem texto antes ou depois.

${CITATIONS_RULES}
`.trim();

export function buildMonthlyReportPrompt(args: {
  tone: string;
  level: string | null;
  bundle: any;
}): string {
  const { tone, level, bundle } = args;
  return [
    `Tom: ${tone}`,
    `Nivel: ${level ?? "(nao definido)"}`,
    "",
    "BUNDLE DO MES (JSON):",
    "```json",
    JSON.stringify(bundle, null, 2),
    "```",
    "",
    'Responda APENAS com JSON do formato:',
    '{',
    '  "header": { "summaryLine": "...", "comparison": "..." },',
    '  "sections": { "volumeResults": {"narrative":"..."}, "bankroll": {"narrative":"..."}, "selection": {"narrative":"..."}, "study": {"narrative":"..."} },',
    '  "comparatives": { "trendNarrative": "..." },',
    '  "variance": { "narrative": "..." },',
    '  "leaksDelta": { "narrative": "..." },',
    '  "goalsProgress": [{ "goalId": "...", "estimate": "on_track|behind|ahead|unknown", "narrative": "..." }],',
    '  "insights": [{ "text": "...", "citations": ["[fonte: ...]"], "confidence": "low" }],',
    '  "nextWeekPlan": { "gradeSuggestionHref": null, "studyFocus": "...", "recommendedAction": "..." }',
    '}',
  ].join("\n");
}
