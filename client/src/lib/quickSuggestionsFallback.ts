// =============================================================================
// quickSuggestionsFallback — Sprint AI-1B / RF-12 (ADR-158)
//
// Fallback estatico no frontend pro endpoint GET /api/coach/suggestions.
// Quando o endpoint falha (lesson #9 — degrade graceful), os chips usam este
// mapa por rota. Mesma forma dos itens do endpoint: { id, text, sendOnClick }.
// =============================================================================

import { getLensSuggestions } from '@/lib/coachLensMeta';
import type { CoachType } from '@/hooks/useCoachChat';

export type QuickSuggestion = { id: string; text: string; sendOnClick: true };

function s(id: string, text: string): QuickSuggestion {
  return { id, text, sendOnClick: true };
}

const GENERIC: QuickSuggestion[] = [
  s("g-week", "O que mudou na minha semana?"),
  s("g-leaks", "Quais meus leaks?"),
  s("g-next", "Sugira meu próximo passo"),
];

export const QUICK_SUGGESTIONS_FALLBACK: Record<string, QuickSuggestion[]> = {
  "/dashboard": [
    s("d-roi", "Como está meu ROI por site?"),
    s("d-leaks", "Quais meus leaks principais?"),
    s("d-focus", "Sugira foco de estudo pra essa semana"),
  ],
  "/inicio": [
    s("d-roi", "Como está meu ROI por site?"),
    s("d-leaks", "Quais meus leaks principais?"),
    s("d-focus", "Sugira foco de estudo pra essa semana"),
  ],
  "/bankroll": [
    s("bk-banca", "Como está minha banca?"),
    s("bk-sacar", "Quanto posso sacar com segurança?"),
    s("bk-sim", "Simular: e se eu perder 10 buy-ins?"),
  ],
  // `/coach` = rota REGISTRADA do Grade Planner (lesson #19); `/grade-planner`/`/grade` = aliases (so chave do mapa).
  "/coach": [
    s("gp-sug", "Sugira uma grade pra essa semana"),
    s("gp-cabe", "Esses torneios cabem na minha banca?"),
    s("gp-hora", "Qual o melhor horário pra eu jogar?"),
  ],
  "/grade-planner": [
    s("gp-sug", "Sugira uma grade pra essa semana"),
    s("gp-cabe", "Esses torneios cabem na minha banca?"),
    s("gp-hora", "Qual o melhor horário pra eu jogar?"),
  ],
  "/grade": [
    s("gp-sug", "Sugira uma grade pra essa semana"),
    s("gp-cabe", "Esses torneios cabem na minha banca?"),
  ],
  "/grind": [
    s("gr-last", "Como foi minha última sessão?"),
    s("gr-spot", "Tem algum spot que vale revisar?"),
    s("gr-mental", "Como está meu mental hoje?"),
  ],
  "/grind-live": [
    s("gr-last", "Como foi minha última sessão?"),
    s("gr-spot", "Tem algum spot que vale revisar?"),
  ],
  "/estudos": [
    s("es-what", "O que devo estudar agora?"),
    s("es-prog", "Como está meu progresso no foco do mês?"),
    s("es-min", "Quanto tempo de estudo eu registrei?"),
  ],
  "/biblioteca": [
    s("bi-rec", "Qual aula você recomenda pra mim?"),
    s("bi-foco", "Tem conteúdo sobre o meu foco do mês?"),
  ],
  // stats vivem em `/estudos/stats`; `/stats` = alias.
  "/estudos/stats": [
    s("st-batem", "Meus stats batem com o esperado?"),
    s("st-fora", "Algum stat fora do padrão?"),
  ],
  "/stats": [
    s("st-batem", "Meus stats batem com o esperado?"),
    s("st-fora", "Algum stat fora do padrão?"),
  ],
  // #3 — empty-state vende ACAO (demonstra tools), nao chat passivo.
  "/coach-ai": [
    s("ca-grade", "Monta minha grade de amanha"),
    s("ca-leaks", "Quais meus 3 maiores leaks?"),
    s("ca-downswing", "To em downswing, o que faco?"),
    s("ca-field", "Como ta meu ROI vs o field BR?"),
  ],
};

export function getFallbackSuggestions(
  route?: string | null,
  coachType?: CoachType | null,
): QuickSuggestion[] {
  const r = (route ?? "").trim().split("?")[0];
  // #11 — no chat (/coach-ai) a lente ativa muda os chips de forma visivel.
  if ((r === "/coach-ai" || !r) && coachType) {
    const lens = getLensSuggestions(coachType);
    if (lens.length > 0) return lens.map((l) => s(l.id, l.text));
  }
  if (!r) return QUICK_SUGGESTIONS_FALLBACK["/coach-ai"] ?? GENERIC;
  return QUICK_SUGGESTIONS_FALLBACK[r] ?? GENERIC;
}

export default QUICK_SUGGESTIONS_FALLBACK;
