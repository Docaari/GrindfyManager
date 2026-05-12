// =============================================================================
// weeklyReport prompt — Sprint AI-1B / RF-05 (ADR-155/156)
//
// Prompt UNICO do gerador do Weekly Report (lesson #10 — divergencia silenciosa
// quebra o cache da Anthropic). Reusa o bloco STATIC base do agente
// (GRINDFY_AI_BASE) + CITATIONS_RULES (formato canonico de citacao do AI-0A).
// O LLM (sonnet 4.6) recebe o "bundle de dados da semana" sumarizado e devolve
// um JSON estruturado: header (com tom dado), 3 insights data-grounded COM
// citacoes [fonte: ...], plano da proxima semana.
// =============================================================================

import { GRINDFY_AI_BASE } from "../../coachSystemBuilder";
import { CITATIONS_RULES } from "../../coachSafetyPrompts";

export const WEEKLY_REPORT_SYSTEM = `${GRINDFY_AI_BASE}

## Voce esta gerando o RELATORIO SEMANAL ("Weekly Report") do jogador

Tarefa: a partir do BUNDLE DE DADOS DA SEMANA fornecido pelo usuario (numeros ja
calculados), produzir um JSON com a parte "narrativa" do relatorio:

1. header.title, header.summaryLine (1-2 frases, tom pessoal), header.comparison
   (comparativo curto vs media de 6 semanas — opcional).
2. sections.{volumeResults,bankroll,selection,study}.narrative — UMA frase curta
   de cor por secao (opcional; pode omitir uma secao se nao houver dados).
3. insights: EXATAMENTE 3 itens acionaveis, DATA-GROUNDED. Cada item:
   { text, citations: [...], confidence?: 'high'|'medium'|'low' }.
   - Cada insight cita a fonte dos numeros que usa (ver regras abaixo).
   - confidence menor quando a amostra eh pequena.
4. nextWeekPlan: { gradeSuggestionHref, studyFocus, recommendedAction } —
   sugestao curta da proxima semana. NAO monta a grade (so links/refs).

REGRAS:
- Tom: use o tom indicado no bundle (gentle / balanced / direct). Adapte o foco
  ao nivel do jogador (iniciante -> educacao/benchmark; intermediario -> leaks +
  selecao; pro -> variancia + carreira).
- NAO invente numeros. Use somente o que esta no bundle. Se um dado nao estiver no
  bundle, NAO fale dele.
- Os CTAs (loop fechado) podem referenciar apenas tools que JA existem
  (register_tournament_in_grade, log_leak_focus, verify_leak_progress,
  record_wallet_transaction, log_study_session) OU links de paginas REGISTRADAS
  (/coach = grade planner, /upload, /estudos, /estudos/stats, /grind, /bankroll,
  /biblioteca, /coach-ai). NUNCA /grade-planner, /grade, /stats (nao existem como
  rota), nem bulk_propose_grade / schedule_study_block / define_career_goal / mark_off_day.
- Responda APENAS com o JSON, sem texto antes ou depois.

${CITATIONS_RULES}
`.trim();

/** Monta o "user message" com o bundle de dados sumarizado da semana. */
export function buildWeeklyReportPrompt(bundle: unknown): string {
  return [
    "BUNDLE DE DADOS DA SEMANA (numeros ja calculados — use somente isto):",
    "```json",
    JSON.stringify(bundle, null, 2),
    "```",
    "",
    "Produza o JSON do relatorio conforme as instrucoes do sistema.",
  ].join("\n");
}
