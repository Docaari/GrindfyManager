/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-4 / Item 7 — RF-06 (FocusStatsCard)
 *
 * Spec : Docs/specs/home-reform-4-item-7-focus-stats.md §RF-06 + §RF-09
 * ADRs : 116 (schema) + 118 (zona Estudos)
 * Pad. : CoachRecommendationCard.test.tsx (mesmo padrao mock apiRequest +
 *        wouter + tracker + lazy loader).
 *
 * Cobertura RF-06:
 *   - Loading state: skeleton 3 slots (data-testid="home-focus-stats-loading")
 *   - Empty state (items=[]): "Defina suas 3 stats foco do mes" + CTA "define"
 *   - Estado parcial 1 item: 1 entry + 2 EmptyFocusStatSlot
 *   - Estado parcial 2 items: 2 entries + 1 EmptyFocusStatSlot
 *   - Estado completo 3 items: 3 entries
 *   - Cada entry com:
 *     - Nome stat + unidade
 *     - Valor atual + delta colorido (verde improving / rose degrading)
 *     - Bloco theme: nome + tempo dedicado (Xh Ymin) + botao "Estudar agora"
 *   - Theme removido (theme=null): placeholder "Tema removido"
 *   - Snapshot mes anterior ausente (delta=null): "—" / "Sem dado"
 *   - currentValue=null: "Sem dado este mes"
 *   - Stat sem statLabel real (catalog removeu): warning + botao "Remover marcacao"
 *   - Botao "Estudar agora" -> /estudos/temas/:id (Wouter Link)
 *   - CTA empty -> /estudos/stats
 *   - data-testids: home-focus-stats-{card,empty,loading,slot,cta-mark,
 *     cta-study,cta-define}
 *
 * Lessons aplicadas:
 *   #1  hooks ANTES de early return
 *   #2  data-testid estavel
 *   #11 NAO criar acoes default decorativas
 *   #13 apiRequest retorna JSON parseado
 *   #14 await import(...) — ESM compat
 *
 * Status RED: `client/src/components/home/FocusStatsCard.tsx` NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Mock wouter Link
// =============================================================================
const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  Link: ({ href, children, onClick, ...rest }: any) => (
    <a
      href={href}
      onClick={(e: any) => {
        mockNavigate(href);
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
  useLocation: () => ['/', vi.fn()],
}));

// =============================================================================
// Mock tracker
// =============================================================================
const mockEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => mockEmit(...args),
}));

// =============================================================================
// Mock apiRequest — retorna JSON parseado direto (lesson #13)
// =============================================================================
const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', async () => {
  const actual = await vi.importActual<any>('@/lib/queryClient');
  return {
    ...actual,
    apiRequest: (...args: any[]) => mockApiRequest(...args),
  };
});

beforeEach(() => {
  mockNavigate.mockReset();
  mockEmit.mockReset();
  mockApiRequest.mockReset();
});

// Lazy loader — escapa de static analysis (mesmo padrao
// CoachRecommendationCard.test.tsx).
async function loadCard(): Promise<{ default: React.ComponentType<any> }> {
  const path = '../' + 'FocusStatsCard';
  return await import(/* @vite-ignore */ path);
}

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// =============================================================================
// Fixtures
// =============================================================================
function entry(overrides: any = {}) {
  return {
    id: 'ufs-1',
    statId: 'cbet_flop_ip',
    statLabel: 'C-Bet Flop IP',
    statUnit: 'pct',
    currentValue: 62.4,
    previousValue: 58.1,
    delta: 4.3,
    deltaDirection: 'improving',
    theme: { id: 'th-1', name: 'C-Bet Heads-Up', color: '#16a34a', emoji: 'C', progress: 35 },
    studyMinutesMonth: 78,
    ...overrides,
  };
}

const fullPayload = {
  month: '2026-05',
  previousMonth: '2026-04',
  items: [
    entry({ id: 'ufs-1', statId: 'cbet_flop_ip', statLabel: 'C-Bet Flop IP' }),
    entry({ id: 'ufs-2', statId: 'vpip', statLabel: 'VPIP', theme: { id: 'th-2', name: 'Tighten up', color: '#dc2626', emoji: 'V', progress: 10 } }),
    entry({ id: 'ufs-3', statId: 'pfr', statLabel: 'PFR', theme: { id: 'th-3', name: 'PFR', color: '#0ea5e9', emoji: 'P', progress: 0 } }),
  ],
  meta: { limitReached: true, generatedAt: '2026-05-21T03:14:01Z' },
};

const emptyPayload = {
  month: '2026-05',
  previousMonth: '2026-04',
  items: [],
  meta: { limitReached: false, generatedAt: '2026-05-21T03:14:01Z' },
};

// =============================================================================
// Loading state
// =============================================================================
describe('<FocusStatsCard /> — loading state', () => {
  it('renderiza skeleton com data-testid="home-focus-stats-loading" enquanto query pendente', async () => {
    mockApiRequest.mockReturnValue(new Promise(() => {}));
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    expect(screen.getByTestId('home-focus-stats-loading')).toBeInTheDocument();
  });
});

// =============================================================================
// Empty state
// =============================================================================
describe('<FocusStatsCard /> — empty state', () => {
  it('items=[] -> renderiza data-testid="home-focus-stats-empty"', async () => {
    mockApiRequest.mockResolvedValue(emptyPayload);
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-empty')).toBeInTheDocument();
    });
    const empty = screen.getByTestId('home-focus-stats-empty');
    expect(empty.textContent ?? '').toMatch(/Defina suas 3 stats foco|stats foco do mes/i);
  });

  it('CTA empty tem testid="home-focus-stats-cta-define" + link /estudos/stats', async () => {
    mockApiRequest.mockResolvedValue(emptyPayload);
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-cta-define')).toBeInTheDocument();
    });
    const cta = screen.getByTestId('home-focus-stats-cta-define');
    const href = cta.getAttribute('href') || cta.querySelector('a')?.getAttribute('href') || '';
    expect(href).toContain('/estudos/stats');
  });
});

// =============================================================================
// Estado parcial — 1 ou 2 items + slots vazios
// =============================================================================
describe('<FocusStatsCard /> — estado parcial', () => {
  it('1 item -> 1 entry + 2 EmptyFocusStatSlot', async () => {
    mockApiRequest.mockResolvedValue({
      ...fullPayload,
      items: [entry({ id: 'ufs-1', statId: 'cbet_flop_ip', statLabel: 'C-Bet Flop IP' })],
      meta: { limitReached: false, generatedAt: '2026-05-21T03:14:01Z' },
    });
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-card')).toBeInTheDocument();
    });
    // 1 entry visivel
    expect(screen.getByText(/C-Bet Flop IP/i)).toBeInTheDocument();
    // 2 slots vazios — testids home-focus-stats-slot-empty-{idx}
    const slot1 = screen.queryByTestId('home-focus-stats-slot-empty-1');
    const slot2 = screen.queryByTestId('home-focus-stats-slot-empty-2');
    // Aceita pelo menos 2 slots vazios (idx 1 e 2 OU idx 0 e 1)
    const allSlots = screen.queryAllByTestId(/home-focus-stats-slot-empty-/);
    expect(allSlots.length).toBe(2);
  });

  it('2 items -> 2 entries + 1 EmptyFocusStatSlot', async () => {
    mockApiRequest.mockResolvedValue({
      ...fullPayload,
      items: [
        entry({ id: 'ufs-1', statId: 'cbet_flop_ip', statLabel: 'C-Bet Flop IP' }),
        entry({ id: 'ufs-2', statId: 'vpip', statLabel: 'VPIP' }),
      ],
      meta: { limitReached: false, generatedAt: '2026-05-21T03:14:01Z' },
    });
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-card')).toBeInTheDocument();
    });
    expect(screen.getByText(/C-Bet Flop IP/i)).toBeInTheDocument();
    expect(screen.getByText(/VPIP/i)).toBeInTheDocument();
    const allSlots = screen.queryAllByTestId(/home-focus-stats-slot-empty-/);
    expect(allSlots.length).toBe(1);
  });
});

// =============================================================================
// Estado completo — 3 items
// =============================================================================
describe('<FocusStatsCard /> — estado completo', () => {
  it('3 items -> 3 entries, sem slots vazios', async () => {
    mockApiRequest.mockResolvedValue(fullPayload);
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-card')).toBeInTheDocument();
    });
    // 3 entries visiveis
    expect(screen.getByText(/C-Bet Flop IP/i)).toBeInTheDocument();
    expect(screen.getByText(/VPIP/i)).toBeInTheDocument();
    expect(screen.getByText(/PFR/i)).toBeInTheDocument();
    // Zero slots vazios
    const allSlots = screen.queryAllByTestId(/home-focus-stats-slot-empty-/);
    expect(allSlots.length).toBe(0);
  });
});

// =============================================================================
// Render entry — stat label + unit + valor + delta
// =============================================================================
describe('<FocusStatsCard /> — render entry detalhada', () => {
  it('renderiza statLabel + valor atual + delta', async () => {
    mockApiRequest.mockResolvedValue({
      ...fullPayload,
      items: [entry({ id: 'ufs-1', statId: 'cbet_flop_ip', statLabel: 'C-Bet Flop IP', currentValue: 62.4, delta: 4.3 })],
    });
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-card')).toBeInTheDocument();
    });
    const card = screen.getByTestId('home-focus-stats-card');
    expect(card.textContent ?? '').toMatch(/C-Bet Flop IP/);
    expect(card.textContent ?? '').toMatch(/62[.,]4/);
    expect(card.textContent ?? '').toMatch(/\+?4[.,]3/);
  });

  it('renderiza bloco theme (nome + tempo) + botao "Estudar agora"', async () => {
    mockApiRequest.mockResolvedValue({
      ...fullPayload,
      items: [entry({
        id: 'ufs-1',
        theme: { id: 'th-1', name: 'C-Bet Heads-Up', color: '#16a34a', emoji: 'C', progress: 35 },
        studyMinutesMonth: 78,
      })],
    });
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-card')).toBeInTheDocument();
    });
    const card = screen.getByTestId('home-focus-stats-card');
    expect(card.textContent ?? '').toMatch(/C-Bet Heads-Up/);
    // 78min — aceita "78min", "1h 18min", "78 min"
    expect(card.textContent ?? '').toMatch(/78\s*min|1h\s*18\s*min/i);
    // Botao "Estudar agora" data-testid="home-focus-stats-cta-study-th-1"
    expect(screen.getByTestId('home-focus-stats-cta-study-th-1')).toBeInTheDocument();
  });

  it('botao "Estudar agora" navega para /estudos/temas/:id (Wouter Link)', async () => {
    mockApiRequest.mockResolvedValue({
      ...fullPayload,
      items: [entry({
        id: 'ufs-1',
        theme: { id: 'th-1', name: 'C-Bet Heads-Up', color: '#16a34a', emoji: 'C', progress: 35 },
      })],
    });
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-cta-study-th-1')).toBeInTheDocument();
    });
    const cta = screen.getByTestId('home-focus-stats-cta-study-th-1');
    const href = cta.getAttribute('href') || cta.querySelector('a')?.getAttribute('href') || '';
    expect(href).toContain('/estudos/temas/th-1');
  });
});

// =============================================================================
// Edge: theme removido (cascade SET NULL ou tema deletado)
// =============================================================================
describe('<FocusStatsCard /> — theme removido', () => {
  it('theme=null -> placeholder "Tema removido"', async () => {
    mockApiRequest.mockResolvedValue({
      ...fullPayload,
      items: [entry({ id: 'ufs-1', theme: null })],
    });
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-card')).toBeInTheDocument();
    });
    expect(screen.getByText(/Tema removido/i)).toBeInTheDocument();
    // Sem botao "Estudar agora" (sem themeId)
    expect(screen.queryByTestId(/home-focus-stats-cta-study-/)).not.toBeInTheDocument();
  });
});

// =============================================================================
// Edge: snapshot mes anterior ausente (delta=null)
// =============================================================================
describe('<FocusStatsCard /> — sem snapshot mes anterior', () => {
  it('delta=null -> render placeholder "—" no lugar do delta', async () => {
    mockApiRequest.mockResolvedValue({
      ...fullPayload,
      items: [entry({ id: 'ufs-1', currentValue: 62.4, previousValue: null, delta: null, deltaDirection: null })],
    });
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-card')).toBeInTheDocument();
    });
    const card = screen.getByTestId('home-focus-stats-card');
    // currentValue 62.4 visivel
    expect(card.textContent ?? '').toMatch(/62[.,]4/);
    // delta nao deve aparecer como numero +X — em vez disso "—" ou "Sem dado"
    expect(card.textContent ?? '').toMatch(/—|Sem dado|sem snapshot/i);
  });
});

// =============================================================================
// Edge: currentValue null
// =============================================================================
describe('<FocusStatsCard /> — sem snapshot mes corrente', () => {
  it('currentValue=null -> "Sem dado este mes"', async () => {
    mockApiRequest.mockResolvedValue({
      ...fullPayload,
      items: [entry({
        id: 'ufs-1',
        currentValue: null,
        previousValue: null,
        delta: null,
        deltaDirection: null,
      })],
    });
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-card')).toBeInTheDocument();
    });
    expect(screen.getByText(/Sem dado este mes|sem snapshot/i)).toBeInTheDocument();
  });
});

// =============================================================================
// Edge: stat removida do catalog (statLabel = statId)
// =============================================================================
describe('<FocusStatsCard /> — stat removida do catalog', () => {
  it('quando statLabel === statId (catalog removido) -> warning + botao "Remover marcacao"', async () => {
    mockApiRequest.mockResolvedValue({
      ...fullPayload,
      items: [entry({
        id: 'ufs-1',
        statId: 'codigo_inexistente_xyz',
        statLabel: 'codigo_inexistente_xyz',
        statUnit: null,
      })],
    });
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-card')).toBeInTheDocument();
    });
    // Warning visivel
    expect(screen.getByText(/Stat removida|removida do cat[aá]logo/i)).toBeInTheDocument();
    // Botao "Remover marcacao" data-testid="home-focus-stats-cta-remove-ufs-1"
    expect(screen.getByTestId('home-focus-stats-cta-remove-ufs-1')).toBeInTheDocument();
  });
});

// =============================================================================
// Cores delta — improving verde / degrading rose / neutral cinza
// =============================================================================
describe('<FocusStatsCard /> — cores delta', () => {
  it('deltaDirection="improving" -> classe verde (text-green-* OU emerald)', async () => {
    mockApiRequest.mockResolvedValue({
      ...fullPayload,
      items: [entry({ id: 'ufs-1', delta: 4.3, deltaDirection: 'improving' })],
    });
    const { default: FocusStatsCard } = await loadCard();
    const { container } = renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-card')).toBeInTheDocument();
    });
    const html = container.innerHTML;
    expect(html).toMatch(/text-(emerald|green)-/);
  });

  it('deltaDirection="degrading" -> classe vermelha (text-red-* OU rose)', async () => {
    mockApiRequest.mockResolvedValue({
      ...fullPayload,
      items: [entry({ id: 'ufs-1', delta: -3.0, deltaDirection: 'degrading' })],
    });
    const { default: FocusStatsCard } = await loadCard();
    const { container } = renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-card')).toBeInTheDocument();
    });
    const html = container.innerHTML;
    expect(html).toMatch(/text-(red|rose)-/);
  });
});

// =============================================================================
// MEDIUM-3 reviewer — error state separado de empty
// =============================================================================
describe('<FocusStatsCard /> — error state (5xx / network)', () => {
  it('quando query falha (rejected) -> renderiza data-testid="home-focus-stats-error" + retry', async () => {
    mockApiRequest.mockRejectedValue(new Error('500 Internal Server Error'));
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-focus-stats-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('home-focus-stats-retry')).toBeInTheDocument();
  });
});

// =============================================================================
// Telemetria emit
// =============================================================================
describe('<FocusStatsCard /> — telemetria', () => {
  it('emit("home_focus_stats_view") quando data carrega (1x)', async () => {
    mockApiRequest.mockResolvedValue(fullPayload);
    const { default: FocusStatsCard } = await loadCard();
    renderWithQuery(<FocusStatsCard />);
    await waitFor(() => {
      const calls = mockEmit.mock.calls.filter((c) => c[0] === 'home_focus_stats_view');
      expect(calls.length).toBe(1);
    });
  });
});
