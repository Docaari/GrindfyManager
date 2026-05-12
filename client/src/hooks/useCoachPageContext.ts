/**
 * useCoachPageContext — Sprint AI-0B / RF-04 (ADR-149).
 *
 * Hook leve que monta o objeto de "page context" que o frontend envia no body
 * do POST /api/coach/chat. Cada pagina instrumentada chama
 *   useCoachPageContext('bankroll', { walletsCount, selectedWalletId, activeTab, dateRange })
 * e passa o resultado adiante (para useCoachChat / MiniChat).
 *
 * Contrato:
 *   - rota instrumentada (existe no pageContextSchema do server) ->
 *     retorna { route, ...fields } com os campos undefined removidos.
 *   - rota nao instrumentada (ou vazia) -> retorna undefined (o caller nao
 *     manda pageContext no body).
 *
 * NAO faz fetch nem leitura de URL — o componente passa os campos que ja tem.
 */

import { useMemo } from 'react';

// Rotas instrumentadas — espelha as variantes do pageContextSchema em
// server/coachPageContext.ts. Manter em sincronia ao adicionar variantes novas.
export const INSTRUMENTED_COACH_ROUTES = [
  'grade-planner',
  'grind-live',
  'dashboard',
  'coach-ai',
  'cooldown-log',
  'bankroll',
  'estudos',
  'stats',
  'biblioteca',
  'upload',
] as const;

export type CoachPageContextRoute = (typeof INSTRUMENTED_COACH_ROUTES)[number];

export function useCoachPageContext(
  route: string,
  fields?: Record<string, any>,
): Record<string, any> | undefined {
  return useMemo(() => {
    if (!route || !(INSTRUMENTED_COACH_ROUTES as readonly string[]).includes(route)) {
      return undefined;
    }
    const out: Record<string, any> = { route };
    if (fields) {
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) out[k] = v;
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, JSON.stringify(fields ?? null)]);
}
