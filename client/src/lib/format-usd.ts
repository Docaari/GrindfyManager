// =============================================================================
// formatUsd — front-only helper para renderizar valores em USD com 2 decimais.
//
// Por que NAO usar @shared/platform-currency?
//   - `formatBuyIn(buyIn, site)` aplica simbolo da rede (ex: "R$ 100" para
//     redes BR), nao o "$X.XX" puro que os cards do dashboard/day-zoom usam.
//   - Calmente coexistem: este eh display agnostico de rede (USD ja normalizado),
//     enquanto `formatBuyIn` traduz site -> simbolo nativo.
//
// Callsites: DayDetailZoom, DayDetailDrawer, DayHoverTooltip.
// =============================================================================

export function formatUsd(v: number | null | undefined): string {
  return `$${(v ?? 0).toFixed(2)}`;
}

export default formatUsd;
