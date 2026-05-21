// =============================================================================
// quarterlyReport prompt — Sprint AI-3 / RF-01 (ADR-174 §2.1)
//
// Paridade monthlyReport. Reusa GRINDFY_AI_BASE + CITATIONS_RULES +
// REPORT_DISCLAIMER. Modelo Sonnet 4.6, max_tokens=4000 (trimestre maior).
// Custo alvo ~$0.25/Q/user.
// =============================================================================

import { GRINDFY_AI_BASE } from "../../coachSystemBuilder";
import { CITATIONS_RULES } from "../../coachSafetyPrompts";
import { REPORT_DISCLAIMER } from "../disclaimers";

export const QUARTERLY_REPORT_SYSTEM = `${GRINDFY_AI_BASE}

## Voce esta gerando o RELATORIO TRIMESTRAL do jogador (Quarterly Career Review)

Tarefa: a partir do BUNDLE DE DADOS DO TRIMESTRE (numeros calculados — volume, ROI,
profit, comparativos vs trimestre/ano anterior, variancia, leaks, metas,
C-game, mental hands, IRPF — BR-only), produzir um JSON com a parte narrativa
do relatorio:

1. header.summaryLine (1-2 frases — sintese do trimestre).
2. header.comparison (1 frase) — comparativo vs trimestre anterior.
3. comparatives.trendNarrative (1-2 frases) — tendencia trimestral observada.
4. variance.narrative (1 frase) — interpretacao do skill/variancia (confidence rotulado).
5. insights: EXATAMENTE 3-5 itens acionaveis, DATA-GROUNDED. Cada item:
   { text, citations: [...], confidence: 'high'|'medium'|'low' }.
6. nextWeekPlan: { gradeSuggestionHref, studyFocus, recommendedAction } — plano
   dos proximos 90 dias (semantico "proximo trimestre").
7. careerGoalsProgress[].narrative (1 frase por meta) — interpretacao do
   progresso vs dados do trimestre. estimate ∈ {'on_track','behind','ahead','unknown'}.
8. cgameNarrative (opcional, 1-2 frases) — interpretacao do C-game snapshot.
9. mentalNarrative (opcional, 1-2 frases) — padrao observado nos top mental hands.
10. irpfNarrative (opcional, 1 frase, BR-only) — resumo informativo do extrato fiscal.

REGRAS:
- Tom: use o tom indicado no bundle.
- NAO invente numeros. Use somente o bundle.
- CTAs/links so para tools existentes ou rotas REGISTRADAS (/coach, /upload,
  /estudos, /estudos/stats, /grind, /bankroll, /biblioteca, /coach-ai). NUNCA outras.
- Responda APENAS com o JSON, sem texto antes ou depois.

${CITATIONS_RULES}

---

${REPORT_DISCLAIMER}
`.trim();

const ALLOWED_TONES = new Set(["gentle", "balanced", "direct"]);
const ALLOWED_LEVELS = new Set([
  "iniciante",
  "intermediario",
  "avancado",
  "alto_volume",
  "micro_ascensao",
  "low_to_mid",
  "mid_to_high",
  "high",
]);

export function buildQuarterlyReportPrompt(args: {
  tone: string;
  level: string | null;
  bundle: any;
}): string {
  const { tone, level, bundle } = args;
  // AI-3 reviewer MEDIUM-3: whitelist tone/level antes de interpolar — bloqueia
  // prompt injection via `users.ai_structured_profile.nivel` (campo user-input).
  const safeTone = ALLOWED_TONES.has(tone) ? tone : "balanced";
  const safeLevel = level != null && ALLOWED_LEVELS.has(level) ? level : null;
  return [
    `Tom: ${safeTone}`,
    `Nivel: ${safeLevel ?? "(nao definido)"}`,
    "",
    "BUNDLE DO TRIMESTRE (JSON):",
    "```json",
    JSON.stringify(bundle, null, 2),
    "```",
    "",
    'Responda APENAS com JSON do formato:',
    '{',
    '  "header": { "summaryLine": "...", "comparison": "..." },',
    '  "comparatives": { "trendNarrative": "..." },',
    '  "variance": { "narrative": "..." },',
    '  "insights": [{ "text": "...", "citations": ["[fonte: ...]"], "confidence": "high|medium|low" }],',
    '  "nextWeekPlan": { "gradeSuggestionHref": null, "studyFocus": "...", "recommendedAction": "..." },',
    '  "careerGoalsProgress": [{ "goalId": "...", "estimate": "on_track|behind|ahead|unknown", "narrative": "..." }],',
    '  "cgameNarrative": "...",',
    '  "mentalNarrative": "...",',
    '  "irpfNarrative": "..."',
    '}',
  ].join("\n");
}
