// =============================================================================
// dailyDebrief prompt — Sprint AI-1C / RF-03 (ADR-159)
//
// Prompt UNICO do Daily Debrief (lesson #10). Reusa GRINDFY_AI_BASE +
// CITATIONS_RULES (AI-0A). Modelo Sonnet 4.6 (max_tokens baixo — debrief eh
// curto; alvo ~$0.013/debrief). Devolve JSON com a parte narrativa: header
// summary, 1-2 insights data-grounded com citacao, 1 acao recomendada opcional.
// =============================================================================

import { GRINDFY_AI_BASE } from "../../coachSystemBuilder";
import { CITATIONS_RULES } from "../../coachSafetyPrompts";

export const DAILY_DEBRIEF_SYSTEM = `${GRINDFY_AI_BASE}

## Voce esta gerando o DAILY DEBRIEF (relatorio curto pos-sessao) do jogador

Tarefa: a partir do BUNDLE DA SESSAO DO DIA fornecido pelo usuario (numeros ja
calculados — ROI, ITM, FTs, cravadas, profit USD, spots), produzir um JSON
COMPACTO com a parte narrativa do debrief:

1. header.summaryLine (1 frase, tom pessoal — "Sessao de DD/mes: ..." com
   o resultado principal + 1 contexto se relevante).
2. header.comparison (opcional, 1 frase curta) — "acima/abaixo do seu ritmo
   recente" se houver baseline comparativa no bundle.
3. insights: 1-2 itens acionaveis, DATA-GROUNDED. Cada item:
   { text, citations: [...], confidence?: 'high'|'medium'|'low' }.
   - 1 sessao = amostra pequena -> confidence quase sempre 'low'.
   - Cite a fonte (CITATIONS_RULES). NAO tire conclusoes de 1 sessao isolada
     como se fosse padrao.
4. recommendedAction (opcional, 1 frase) — proximo passo curto. Pode citar
   tools existentes (register_tournament_in_grade, log_leak_focus,
   verify_leak_progress, log_study_session) OU links de paginas REGISTRADAS
   (/coach, /upload, /estudos, /estudos/stats, /grind, /bankroll, /biblioteca,
   /coach-ai). NUNCA tools fora dessa lista.

REGRAS:
- Tom: use o tom indicado no bundle (gentle / balanced / direct).
- 1 sessao = amostra pequena. NAO faca afirmacoes categoricas sobre selecao,
  leak ou variancia baseado em 1 sessao. Confidence baixo.
- NAO invente numeros. Use somente o que esta no bundle.
- Sessao com 0 torneios e 0 spots -> debrief minimalista: 1 linha de header
  ("Sessao registrada sem torneios — tudo certo?") + 0 insights + 0 action.
- Responda APENAS com o JSON, sem texto antes ou depois.

${CITATIONS_RULES}
`.trim();

/** Monta o user message com o bundle compacto da sessao do dia. */
export function buildDailyDebriefPrompt(args: {
  tone: string;
  level: string | null;
  bundle: any;
}): string {
  const { tone, level, bundle } = args;
  return [
    `Tom: ${tone}`,
    `Nivel: ${level ?? "(nao definido)"}`,
    "",
    "BUNDLE DA SESSAO DO DIA (JSON):",
    "```json",
    JSON.stringify(bundle, null, 2),
    "```",
    "",
    'Responda APENAS com o JSON do formato:',
    '{',
    '  "header": { "summaryLine": "...", "comparison": "..." },',
    '  "insights": [{ "text": "...", "citations": ["[fonte: ...]"], "confidence": "low" }],',
    '  "recommendedAction": "..." | null',
    '}',
  ].join("\n");
}
