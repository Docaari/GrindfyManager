// =============================================================================
// coachLensMeta — Coach AI UX Overhaul (Wave 1 / #3 + #11)
//
// Fonte unica (client) dos metadados das 3 lentes do chat (mental / tournament /
// technical): placeholder contextual do input + sugestoes ACIONAVEIS que
// demonstram as tools do agente (montar grade, registrar foco, analisar
// variancia...). Reusado por:
//   - CoachAI.tsx          (placeholder do textarea + chips do empty-state)
//   - quickSuggestionsFallback.ts (fallback lens-aware quando o endpoint cai)
//
// O servidor tem uma copia equivalente em server/coach/quickSuggestions.ts
// (bundles separados — mesmo padrao da duplicacao GENERIC/BY_ROUTE ja existente).
//
// Lessons: #11 (sem default decorativo — cada lente muda visivelmente o que o
// usuario ve), #3 (vende ACAO, nao chat passivo).
// =============================================================================

import type { CoachType } from '@/hooks/useCoachChat';

export type LensSuggestion = { id: string; text: string };

// Placeholder contextual por lente — guia o jogador pro que a lente faz melhor.
export const LENS_PLACEHOLDER: Record<CoachType, string> = {
  mental:
    'Fala do teu mental, tilt, downswing — ou peca "registra meu foco de leak do mes"',
  tournament:
    'Peca "monta minha grade de amanha", pergunte sobre selecao, rake, horarios...',
  technical:
    'Pergunta sobre leaks, ROI, variancia — ou peca "quais meus 3 maiores leaks?"',
};

// Sugestoes acionaveis por lente (demonstram tools). 3 por lente, ids estaveis
// (lesson #2), conjuntos distintos entre lentes (lesson #11 — lente muda chips).
export const LENS_SUGGESTIONS: Record<CoachType, ReadonlyArray<LensSuggestion>> = {
  mental: [
    { id: 'lens-mental-downswing', text: 'To em downswing, o que faco?' },
    { id: 'lens-mental-focus', text: 'Registra meu foco de leak do mes' },
    { id: 'lens-mental-abc', text: 'Como ta meu A/B/C-game?' },
  ],
  tournament: [
    { id: 'lens-tour-grade', text: 'Monta minha grade de amanha' },
    { id: 'lens-tour-banca', text: 'Esses torneios cabem na minha banca?' },
    { id: 'lens-tour-rake', text: 'Qual meu rake efetivo por site?' },
  ],
  technical: [
    { id: 'lens-tech-leaks', text: 'Quais meus 3 maiores leaks?' },
    { id: 'lens-tech-field', text: 'Como ta meu ROI vs o field BR?' },
    { id: 'lens-tech-var', text: 'Analisa minha variancia do mes' },
  ],
};

export function getLensSuggestions(coachType: CoachType | undefined | null): ReadonlyArray<LensSuggestion> {
  if (!coachType) return [];
  return LENS_SUGGESTIONS[coachType] ?? [];
}
