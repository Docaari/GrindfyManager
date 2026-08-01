/**
 * Estado dos filtros do dashboard.
 *
 * Reforma 2026-08-01: cada grupo passou a ter DOIS conjuntos — o que inclui e o
 * que exclui. O jogador escolhe o modo (Incluir/Excluir) no topo do painel e
 * clica nas opcoes; a mesma opcao nunca fica nos dois conjuntos ao mesmo tempo.
 *
 * As chaves antigas (`sites`, `categories`, `speeds`, `participantMin/Max`,
 * `keyword`) mantiveram nome e significado — URLs salvas antes da reforma
 * continuam abrindo.
 */
export interface DashboardFiltersState {
  // ── Incluir ──
  sites?: string[];
  categories?: string[];
  speeds?: string[];
  /** Ids de `BUYIN_BANDS` (shared/dashboard-filter-bands). */
  buyinBands?: string[];
  /** Ids de `FIELD_BANDS`. */
  fieldBands?: string[];
  /** 'satellite' | 'flight' — modificadores ortogonais ao Tipo (ADR-031). */
  modifiers?: string[];

  // ── Excluir ──
  sitesExclude?: string[];
  categoriesExclude?: string[];
  speedsExclude?: string[];
  buyinBandsExclude?: string[];
  fieldBandsExclude?: string[];
  modifiersExclude?: string[];

  // ── Faixas manuais ──
  /** Buy-in digitado a mao (complementa as faixas rapidas). */
  buyinRange?: { min?: number; max?: number };
  participantMin?: number;
  participantMax?: number;

  // ── Demais ──
  keyword?: string;
  keywordType?: 'contains' | 'not_contains';
  dateFrom?: string;
  dateTo?: string;
  profileBased?: boolean;
}

/** Grupos que aceitam Incluir/Excluir por clique. */
export type FilterGroupKey =
  | 'sites'
  | 'categories'
  | 'speeds'
  | 'buyinBands'
  | 'fieldBands'
  | 'modifiers';

export type FilterMode = 'include' | 'exclude';

export interface AvailableOptions {
  sites: string[];
  categories: string[];
  speeds: string[];
}

export interface DashboardTab {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  emoji: string;
  active: boolean;
}
