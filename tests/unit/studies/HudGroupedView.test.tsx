// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3 — HudGroupedView (RF-01, RF-04, RF-14)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-01..RF-04, RF-14)
// ADR  : 064 (Hand2Note grouped layout rendering)
//        066 (3-way comparison semantics)
//
// Componente NAO existe ainda — Implementer criara em
// `client/src/components/studies/stats/HudGroupedView.tsx`.
//
// Render shape:
//   - 16 cards (HUD_GROUP_IDS) com header verde + count + chevron expand
//   - Single mode: tabela 3-col (Stat | target | hero)
//   - Three-way mode: tabela 5-col (Stat | target | snap1 | snap2 | delta)
//   - LocalStorage key: stats-v3-expand-state
//   - Customs com isCustom=true mostram badge
//
// Lessons aplicadas:
//   #2  data-testid estavel: hud-group-{groupId}, hud-cell-{statId}
//   #8  evitar length === N do catalog (pode crescer); usar getStatById
//   #12 expand state em localStorage (nao React Query — local-only)
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock toast (alguns paths usam) — defensivo
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
}));

// Componente NAO existe ainda — red phase
import HudGroupedView from '@/components/studies/stats/HudGroupedView';
import { HUD_GROUP_IDS, HUD_GROUP_LABELS, getStatsByGroup } from '../../../shared/hud-stat-catalog';

beforeEach(() => {
  // Reset localStorage entre testes para previsibilidade
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

function renderWith(props: any) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HudGroupedView {...props} />
    </QueryClientProvider>,
  );
}

const baseLayout = {
  id: 'lyt-1',
  name: 'PT4 V3',
  isDefault: true,
  fields_json: [],
  // V2 compat — sections preservadas (catalog-only por default V3)
  sections: [],
};

const baseSnapshot = {
  id: 'snap-1',
  layoutId: 'lyt-1',
  capturedAt: new Date('2026-05-01').toISOString(),
  source: 'manual',
  values: {
    vpip: 22,
    pfr: 18,
    wwsf_pct: 50,
  },
  sampleSize: 5400,
};

const baseProps = {
  layout: baseLayout,
  snapshot: baseSnapshot,
  filters: { searchQuery: '', activeGroups: new Set(HUD_GROUP_IDS), preset: null },
  onEditTarget: vi.fn(),
  onEditValue: vi.fn(),
  onAddCustom: vi.fn(),
  comparisonMode: 'single' as const,
};

// =============================================================================
// RF-01 — render 16 cards
// =============================================================================

describe('<HudGroupedView /> — render group cards', () => {
  it('renderiza 16 cards (um por grupo)', () => {
    renderWith(baseProps);
    for (const g of HUD_GROUP_IDS) {
      expect(screen.getByTestId(`stats-v3-group-${g}`)).toBeInTheDocument();
    }
  });

  it('header verde por grupo com label PT-BR', () => {
    renderWith(baseProps);
    const basicsHeader = screen.getByTestId('stats-v3-group-basics-header');
    expect(basicsHeader.textContent).toContain(HUD_GROUP_LABELS.basics);
    // Cor verde — classe Tailwind emerald no header
    expect(basicsHeader.className).toMatch(/emerald/);
  });

  it('badge mostra count de stats no grupo (>=1)', () => {
    renderWith(baseProps);
    const expectedCount = getStatsByGroup('basics').length;
    expect(expectedCount).toBeGreaterThanOrEqual(1);
    const badge = screen.getByTestId('stats-v3-group-basics-count');
    expect(badge.textContent).toContain(String(expectedCount));
  });

  it('renderiza cells de stats por grupo (data-testid stats-v3-cell-{statId})', () => {
    renderWith(baseProps);
    expect(screen.getByTestId('stats-v3-cell-vpip')).toBeInTheDocument();
    expect(screen.getByTestId('stats-v3-cell-pfr')).toBeInTheDocument();
  });
});

// =============================================================================
// RF-01 — single mode 3-col layout
// =============================================================================

describe('<HudGroupedView /> — single mode (target | hero)', () => {
  it('cell renderiza target + hero value', () => {
    renderWith(baseProps);
    const cell = screen.getByTestId('stats-v3-cell-vpip');
    // target em formato min-max% (catalog: vpip 20-25 pct)
    expect(cell.textContent).toMatch(/20.*25/);
    // hero value
    expect(cell.textContent).toContain('22');
  });

  it('value=null renderiza — em cinza', () => {
    const propsWithNull = {
      ...baseProps,
      snapshot: { ...baseSnapshot, values: { ...baseSnapshot.values, vpip: null } },
    };
    renderWith(propsWithNull);
    const cell = screen.getByTestId('stats-v3-cell-vpip');
    expect(cell.textContent).toContain('—');
  });

  it('mostra apenas 2 colunas mobile (<640px) — sem coluna target visivel', () => {
    // jsdom nao reflete viewport real — testamos via hint hidden class no DOM
    renderWith(baseProps);
    const targetCell = screen.getByTestId('stats-v3-cell-vpip-target');
    // classe responsive hidden em mobile
    expect(targetCell.className).toMatch(/hidden|sm:|md:/);
  });
});

// =============================================================================
// RF-14 — three-way mode 4-col
// =============================================================================

describe('<HudGroupedView /> — three-way mode (target | snap1 | snap2 | delta)', () => {
  const snap2 = {
    id: 'snap-2',
    layoutId: 'lyt-1',
    capturedAt: new Date('2026-05-15').toISOString(),
    source: 'ocr',
    values: { vpip: 24, pfr: 19, wwsf_pct: 52 },
    sampleSize: 7200,
  };

  it('renderiza colunas snap1 + snap2 + delta', () => {
    renderWith({ ...baseProps, snap2, comparisonMode: 'three_way' });
    const cell = screen.getByTestId('stats-v3-cell-vpip');
    // snap1=22, snap2=24, delta=+2
    expect(cell.textContent).toContain('22');
    expect(cell.textContent).toContain('24');
    expect(cell.textContent).toMatch(/\+?2/);
  });

  it('cor verde (both_in_target) quando ambos in target context', () => {
    // vpip target 20-25, snap1=22 in, snap2=24 in -> verde
    renderWith({ ...baseProps, snap2, comparisonMode: 'three_way' });
    const cell = screen.getByTestId('stats-v3-cell-vpip');
    expect(cell.className).toMatch(/emerald|green/);
  });

  it('cor laranja (improving) quando snap1 fora -> snap2 dentro (higher_better)', () => {
    // wwsf_pct target 45-55 higher_better, snap1=40 fora, snap2=48 dentro
    const improvingSnap = { ...baseSnapshot, values: { wwsf_pct: 40 } };
    const improvingSnap2 = { ...snap2, values: { wwsf_pct: 48 } };
    renderWith({
      ...baseProps,
      snapshot: improvingSnap,
      snap2: improvingSnap2,
      comparisonMode: 'three_way',
    });
    const cell = screen.getByTestId('stats-v3-cell-wwsf_pct');
    expect(cell.className).toMatch(/orange/);
  });

  it('cor vermelha (regressing) quando snap1 dentro -> snap2 fora (lower_better)', () => {
    // fold_to_3bet target 50-60 lower_better, snap1=55 dentro, snap2=70 fora
    const regSnap = { ...baseSnapshot, values: { fold_to_3bet: 55 } };
    const regSnap2 = { ...snap2, values: { fold_to_3bet: 70 } };
    renderWith({
      ...baseProps,
      snapshot: regSnap,
      snap2: regSnap2,
      comparisonMode: 'three_way',
    });
    const cell = screen.getByTestId('stats-v3-cell-fold_to_3bet');
    expect(cell.className).toMatch(/red/);
  });

  it('cor cinza (gray) quando direction context mesmo improving', () => {
    // pfr direction context, mesmo dentro/fora -> gray (Coach interpreta)
    renderWith({ ...baseProps, snap2, comparisonMode: 'three_way' });
    const cell = screen.getByTestId('stats-v3-cell-pfr');
    // Direction context -> cinza por status special context_ambiguous
    expect(cell.className).toMatch(/slate|gray/);
  });
});

// =============================================================================
// RF-04 — Expand/Collapse persistente
// =============================================================================

describe('<HudGroupedView /> — expand/collapse', () => {
  it('toggle clicando no header expand/collapse', () => {
    renderWith(baseProps);
    const toggle = screen.getByTestId('stats-v3-group-basics-toggle');
    // body inicialmente expanded
    expect(screen.getByTestId('stats-v3-group-basics-body')).toBeVisible();
    fireEvent.click(toggle);
    // apos click -> collapsed (aria-expanded false ou className hide)
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('botao expand-all expande todos', () => {
    renderWith(baseProps);
    const expandAll = screen.getByTestId('stats-v3-expand-all');
    fireEvent.click(expandAll);
    for (const g of HUD_GROUP_IDS) {
      const toggle = screen.getByTestId(`stats-v3-group-${g}-toggle`);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    }
  });

  it('botao collapse-all recolhe todos', () => {
    renderWith(baseProps);
    const collapseAll = screen.getByTestId('stats-v3-collapse-all');
    fireEvent.click(collapseAll);
    for (const g of HUD_GROUP_IDS) {
      const toggle = screen.getByTestId(`stats-v3-group-${g}-toggle`);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
    }
  });

  it('persiste estado em localStorage[stats-v3-expand-state]', () => {
    renderWith(baseProps);
    const toggle = screen.getByTestId('stats-v3-group-basics-toggle');
    fireEvent.click(toggle);
    // localStorage deve conter "basics: false"
    const raw = window.localStorage.getItem('stats-v3-expand-state');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.basics).toBe(false);
  });

  it('localStorage indisponivel (QuotaExceeded) nao quebra render', () => {
    const origSet = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      const err: any = new Error('QuotaExceeded');
      err.name = 'QuotaExceededError';
      throw err;
    };
    expect(() => renderWith(baseProps)).not.toThrow();
    window.localStorage.setItem = origSet;
  });
});

// =============================================================================
// RF-07 — custom stats badge
// =============================================================================

describe('<HudGroupedView /> — custom stats', () => {
  it('renderiza custom field com badge "custom"', () => {
    const layoutWithCustom = {
      ...baseLayout,
      fields_json: [
        {
          id: 'custom_a8b3c9d1',
          group: 'basics',
          label: 'Avg Stack BB',
          targetMin: 20,
          targetMax: 100,
          direction: 'context',
          unit: 'bb',
          isCustom: true,
        },
      ],
    };
    const propsCustom = {
      ...baseProps,
      layout: layoutWithCustom,
      snapshot: { ...baseSnapshot, values: { ...baseSnapshot.values, custom_a8b3c9d1: 50 } },
    };
    renderWith(propsCustom);
    const cell = screen.getByTestId('stats-v3-cell-custom_a8b3c9d1');
    expect(cell.textContent?.toLowerCase()).toContain('custom');
  });
});

// =============================================================================
// A11y
// =============================================================================

describe('<HudGroupedView /> — a11y', () => {
  it('toggle buttons tem role=button + aria-expanded', () => {
    renderWith(baseProps);
    const toggle = screen.getByTestId('stats-v3-group-basics-toggle');
    // role=button ou button element nativo
    const role = toggle.getAttribute('role');
    expect(role === 'button' || toggle.tagName.toLowerCase() === 'button').toBe(true);
    expect(toggle.hasAttribute('aria-expanded')).toBe(true);
  });

  it('toggle responde a Enter/Space (keyboard)', () => {
    renderWith(baseProps);
    const toggle = screen.getByTestId('stats-v3-group-basics-toggle');
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});

// =============================================================================
// Performance — render 200 stats < 500ms (smoke)
// =============================================================================

describe('<HudGroupedView /> — performance', () => {
  it('render do catalog completo (200+ stats) <500ms', () => {
    const fullValues: Record<string, number> = {};
    for (const g of HUD_GROUP_IDS) {
      for (const s of getStatsByGroup(g)) {
        fullValues[s.id] = (s.targetMin + s.targetMax) / 2;
      }
    }
    const fullSnap = { ...baseSnapshot, values: fullValues };
    const t0 = Date.now();
    renderWith({ ...baseProps, snapshot: fullSnap });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(500);
  });
});
