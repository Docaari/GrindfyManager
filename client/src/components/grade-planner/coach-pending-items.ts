/**
 * Sprint coach-page-reform-1 RF-04 — Lista de pendencias para o founder validar.
 *
 * Quando founder confirmar que o item esta OK em producao, remova do array.
 * Quando array ficar vazio, o banner CoachPendingBanner faz early return null
 * (nao renderiza). Sem nenhum logica aqui — apenas dados.
 *
 * Ordem segue spec sprint-coach-page-reform-1.md §RF-04 (8 items).
 */

export interface PendingItem {
  /** ID estavel para data-testid e key React. */
  id: string;
  /** Texto exibido no banner. */
  label: string;
  /** Slug da aba alvo (`planner` | `selector` | `flights` | `variance`). */
  targetTab?: string;
  /** Anchor opcional dentro da aba alvo (id de elemento para scrollIntoView). */
  targetAnchor?: string;
}

export const pendingItems: PendingItem[] = [
  {
    id: 'biblioteca-quick-filters',
    label: 'Filtros da Biblioteca: novos quick buttons plataforma + dia da semana (RF-05)',
    targetTab: 'planner',
  },
  {
    id: 'grade-hover-delete',
    label: 'Grade: hover X delete em torneios com 1s protection (RF-06)',
    targetTab: 'planner',
  },
  {
    id: 'variance-add-remove',
    label: 'Variance Calculator: testar add/remove manual de torneios (futuro)',
    targetTab: 'variance',
  },
  {
    id: 'variance-extras',
    label: 'Variance Calculator: revisar features extras',
    targetTab: 'variance',
  },
  {
    id: 'selector-review',
    label: 'Tournament Selector: revisar e ajustar filtros/scoring',
    targetTab: 'selector',
  },
  {
    id: 'flights-review',
    label: 'Flights: revisar fluxo + UX',
    targetTab: 'flights',
  },
  {
    id: 'biblioteca-review',
    label: 'Biblioteca: revisar UX (filtros, sort, empty states, cards)',
    targetTab: 'planner',
  },
  {
    id: 'grade-review',
    label: 'Grade: revisar todas funcoes (drag, copy day, settings, comparar perfis)',
    targetTab: 'planner',
  },
];
