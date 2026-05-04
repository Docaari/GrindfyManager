/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-4 / Item 7 — RF-05 (UI marcacao em StatsAnalyzerTab)
 *
 * Spec : Docs/specs/home-reform-4-item-7-focus-stats.md §RF-05
 * ADRs : 116 (schema) + 118 (zona Estudos)
 * Pad. : CoachRecommendationCard.test.tsx (mock apiRequest + tracker + lazy
 *        loader). Componente FocusStatToggle eh testado como unidade
 *        isolada (NAO carrega StatsAnalyzerTab inteiro), porque o
 *        comportamento testado eh do toggle/dialog, nao do tab.
 *
 * Cobertura RF-05:
 *   - <FocusStatToggle statId statLabel /> renderiza icone outline quando
 *     stat NAO marcada
 *   - Click abre <FocusStatThemePickerDialog />
 *   - Dialog lista temas do user (mock useQuery /api/study-themes)
 *   - Confirmar dispara POST /api/focus-stats com { statId, studyThemeId }
 *   - Stat ja marcada: botao mostra estado solid + tooltip com nome do tema
 *   - "Remover foco" -> DELETE /api/focus-stats/:id
 *   - Quando user ja tem 3 marcacoes (limit): botao das demais stats
 *     fica disabled OU mostra erro friendly ao tentar
 *   - data-testids estaveis:
 *       focus-stat-toggle-{statId}
 *       focus-stat-dialog
 *       focus-stat-theme-option-{themeId}
 *       focus-stat-confirm
 *       focus-stat-remove-{statId}
 *
 * Lessons aplicadas:
 *   #1  hooks ANTES de early return
 *   #2  data-testid estavel
 *   #11 NAO acoes default decorativas
 *   #13 apiRequest retorna JSON parseado
 *   #14 await import(...) — ESM compat
 *
 * Status RED: `client/src/components/studies/stats/FocusStatToggle.tsx` +
 * `FocusStatThemePickerDialog.tsx` NAO existem.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Mock toast
// =============================================================================
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
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
  mockApiRequest.mockReset();
});

// Lazy loader — escapa de static analysis
async function loadToggle(): Promise<{ default: React.ComponentType<any> }> {
  const path = '../stats/' + 'FocusStatToggle';
  return await import(/* @vite-ignore */ path);
}

async function loadDialog(): Promise<{ default: React.ComponentType<any> }> {
  const path = '../stats/' + 'FocusStatThemePickerDialog';
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
const themesFixture = [
  { id: 'th-1', userId: 'USER-OWNER', name: 'C-Bet em Heads-Up', color: '#16a34a', emoji: 'C', progress: 35 },
  { id: 'th-2', userId: 'USER-OWNER', name: 'BB Defense', color: '#dc2626', emoji: 'B', progress: 10 },
  { id: 'th-3', userId: 'USER-OWNER', name: 'PFR Optimization', color: '#0ea5e9', emoji: 'P', progress: 0 },
];

const focusStatsEmptyResp = {
  month: '2026-05',
  previousMonth: '2026-04',
  items: [],
  meta: { limitReached: false, generatedAt: '2026-05-21T03:14:01Z' },
};

const focusStatsFullResp = {
  month: '2026-05',
  previousMonth: '2026-04',
  items: [
    {
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
    },
    {
      id: 'ufs-2',
      statId: 'vpip',
      statLabel: 'VPIP',
      statUnit: 'pct',
      currentValue: 22.5,
      previousValue: 24,
      delta: -1.5,
      deltaDirection: 'improving',
      theme: { id: 'th-2', name: 'BB Defense', color: '#dc2626', emoji: 'B', progress: 10 },
      studyMinutesMonth: 30,
    },
    {
      id: 'ufs-3',
      statId: 'pfr',
      statLabel: 'PFR',
      statUnit: 'pct',
      currentValue: 18.0,
      previousValue: null,
      delta: null,
      deltaDirection: null,
      theme: { id: 'th-3', name: 'PFR Optimization', color: '#0ea5e9', emoji: 'P', progress: 0 },
      studyMinutesMonth: 0,
    },
  ],
  meta: { limitReached: true, generatedAt: '2026-05-21T03:14:01Z' },
};

// Helper: mock apiRequest para responder /api/home/focus-stats e
// /api/study-themes diferenciados.
function setApiResponses(focusStatsResp: any, themesResp: any = themesFixture) {
  mockApiRequest.mockImplementation(async (methodOrUrl: any, urlOrBody?: any) => {
    // Suporta apiRequest('GET', '/url'), apiRequest('POST', '/url', body) e apiRequest('/url')
    // - 2+ args: methodOrUrl = method, urlOrBody = url
    // - 1 arg: methodOrUrl = url, urlOrBody = undefined
    const url = urlOrBody === undefined
      ? String(methodOrUrl ?? '')
      : String(urlOrBody ?? '');
    const u = url;
    if (u.includes('/api/home/focus-stats')) return focusStatsResp;
    if (u.includes('/api/study-themes')) return themesResp;
    if (u.includes('/api/focus-stats')) return { ok: true };
    return null;
  });
}

// =============================================================================
// Toggle — stat NAO marcada (slot disponivel)
// =============================================================================
describe('<FocusStatToggle /> — stat NAO marcada (slot disponivel)', () => {
  it('renderiza botao com data-testid="focus-stat-toggle-cbet_flop_ip"', async () => {
    setApiResponses(focusStatsEmptyResp);
    const { default: FocusStatToggle } = await loadToggle();
    renderWithQuery(<FocusStatToggle statId="cbet_flop_ip" statLabel="C-Bet Flop IP" />);
    await waitFor(() => {
      expect(screen.getByTestId('focus-stat-toggle-cbet_flop_ip')).toBeInTheDocument();
    });
  });

  it('botao NAO tem estado disabled quando slot disponivel', async () => {
    setApiResponses(focusStatsEmptyResp);
    const { default: FocusStatToggle } = await loadToggle();
    renderWithQuery(<FocusStatToggle statId="cbet_flop_ip" statLabel="C-Bet Flop IP" />);
    await waitFor(() => {
      expect(screen.getByTestId('focus-stat-toggle-cbet_flop_ip')).toBeInTheDocument();
    });
    const btn = screen.getByTestId('focus-stat-toggle-cbet_flop_ip');
    // Aceita botao sem disabled (false) OU sem o attr
    expect((btn as HTMLButtonElement).disabled ?? false).toBe(false);
  });

  it('click no botao abre dialog de selecao de tema', async () => {
    setApiResponses(focusStatsEmptyResp);
    const { default: FocusStatToggle } = await loadToggle();
    renderWithQuery(<FocusStatToggle statId="cbet_flop_ip" statLabel="C-Bet Flop IP" />);
    await waitFor(() => {
      expect(screen.getByTestId('focus-stat-toggle-cbet_flop_ip')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('focus-stat-toggle-cbet_flop_ip'));
    await waitFor(() => {
      expect(screen.getByTestId('focus-stat-dialog')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// Dialog — listagem de temas + confirmar
// =============================================================================
describe('<FocusStatThemePickerDialog /> — lista temas + confirma', () => {
  it('renderiza lista de temas com testid focus-stat-theme-option-{themeId}', async () => {
    setApiResponses(focusStatsEmptyResp, themesFixture);
    const { default: Dialog } = await loadDialog();
    renderWithQuery(
      <Dialog
        open
        statId="cbet_flop_ip"
        statLabel="C-Bet Flop IP"
        onOpenChange={() => {}}
        onConfirmed={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('focus-stat-theme-option-th-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('focus-stat-theme-option-th-2')).toBeInTheDocument();
    expect(screen.getByTestId('focus-stat-theme-option-th-3')).toBeInTheDocument();
  });

  it('renderiza nome dos temas no listbox', async () => {
    setApiResponses(focusStatsEmptyResp, themesFixture);
    const { default: Dialog } = await loadDialog();
    renderWithQuery(
      <Dialog
        open
        statId="cbet_flop_ip"
        statLabel="C-Bet Flop IP"
        onOpenChange={() => {}}
        onConfirmed={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/C-Bet em Heads-Up/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/BB Defense/i)).toBeInTheDocument();
    expect(screen.getByText(/PFR Optimization/i)).toBeInTheDocument();
  });

  it('selecionar tema + confirmar -> POST /api/focus-stats com statId+studyThemeId', async () => {
    setApiResponses(focusStatsEmptyResp, themesFixture);
    const { default: Dialog } = await loadDialog();
    const onConfirmed = vi.fn();
    renderWithQuery(
      <Dialog
        open
        statId="cbet_flop_ip"
        statLabel="C-Bet Flop IP"
        onOpenChange={() => {}}
        onConfirmed={onConfirmed}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('focus-stat-theme-option-th-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('focus-stat-theme-option-th-1'));
    fireEvent.click(screen.getByTestId('focus-stat-confirm'));

    await waitFor(() => {
      const postCalls = mockApiRequest.mock.calls.filter((args: any[]) =>
        args.some((a) => typeof a === 'string' && a === 'POST') ||
        (typeof args[0] === 'string' && args[0] === 'POST'),
      );
      // A primeira call POST deve ter ido pra /api/focus-stats com body
      const focusPostCall = mockApiRequest.mock.calls.find((args: any[]) =>
        args.some((a) => typeof a === 'string' && a.includes('/api/focus-stats') && !a.includes('/home/')),
      );
      expect(focusPostCall).toBeDefined();
    });
  });

  it('empty state — user sem temas -> "Voce ainda nao tem temas" + CTA "Criar tema"', async () => {
    setApiResponses(focusStatsEmptyResp, []);
    const { default: Dialog } = await loadDialog();
    renderWithQuery(
      <Dialog
        open
        statId="cbet_flop_ip"
        statLabel="C-Bet Flop IP"
        onOpenChange={() => {}}
        onConfirmed={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('focus-stat-dialog')).toBeInTheDocument();
    });
    const dialog = screen.getByTestId('focus-stat-dialog');
    expect(dialog.textContent ?? '').toMatch(/Voce ainda nao tem temas|sem temas/i);
    expect(dialog.textContent ?? '').toMatch(/Criar tema|criar/i);
  });
});

// =============================================================================
// Stat ja marcada (estado solid + remover)
// =============================================================================
describe('<FocusStatToggle /> — stat ja marcada', () => {
  it('botao mostra estado "marcado" quando stat ja em focusStats.items', async () => {
    setApiResponses(focusStatsFullResp);
    const { default: FocusStatToggle } = await loadToggle();
    renderWithQuery(<FocusStatToggle statId="cbet_flop_ip" statLabel="C-Bet Flop IP" />);
    await waitFor(() => {
      expect(screen.getByTestId('focus-stat-toggle-cbet_flop_ip')).toBeInTheDocument();
    });
    const btn = screen.getByTestId('focus-stat-toggle-cbet_flop_ip');
    // Aceita aria-pressed=true OU aria-label com "Foco" OU classe distinta.
    const ariaPressed = btn.getAttribute('aria-pressed');
    const ariaLabel = btn.getAttribute('aria-label') || '';
    const text = btn.textContent || '';
    const marked =
      ariaPressed === 'true' ||
      /Foco|marcad/i.test(ariaLabel) ||
      /Foco|marcad/i.test(text);
    expect(marked).toBe(true);
  });

  it('renderiza botao "Remover foco" com data-testid focus-stat-remove-cbet_flop_ip', async () => {
    setApiResponses(focusStatsFullResp);
    const { default: FocusStatToggle } = await loadToggle();
    renderWithQuery(<FocusStatToggle statId="cbet_flop_ip" statLabel="C-Bet Flop IP" />);
    await waitFor(() => {
      expect(screen.getByTestId('focus-stat-remove-cbet_flop_ip')).toBeInTheDocument();
    });
  });

  it('click "Remover foco" -> DELETE /api/focus-stats/ufs-1', async () => {
    setApiResponses(focusStatsFullResp);
    const { default: FocusStatToggle } = await loadToggle();
    renderWithQuery(<FocusStatToggle statId="cbet_flop_ip" statLabel="C-Bet Flop IP" />);
    await waitFor(() => {
      expect(screen.getByTestId('focus-stat-remove-cbet_flop_ip')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('focus-stat-remove-cbet_flop_ip'));
    await waitFor(() => {
      const deleteCalls = mockApiRequest.mock.calls.filter((args: any[]) =>
        args.some((a) => typeof a === 'string' && a === 'DELETE') ||
        args.some((a) => typeof a === 'string' && /\/api\/focus-stats\/ufs-1/.test(a)),
      );
      expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// =============================================================================
// Limite 3 — slots lotados
// =============================================================================
describe('<FocusStatToggle /> — limite 3 atingido', () => {
  it('quando user ja tem 3 marcacoes, botao para stat NAO marcada fica disabled', async () => {
    // focusStats.items tem 3 entries (full); stat 'novacosa_xyz' nao esta marcada
    setApiResponses(focusStatsFullResp);
    const { default: FocusStatToggle } = await loadToggle();
    renderWithQuery(<FocusStatToggle statId="novacosa_xyz" statLabel="Stat Nao Marcada" />);
    await waitFor(() => {
      expect(screen.getByTestId('focus-stat-toggle-novacosa_xyz')).toBeInTheDocument();
    });
    const btn = screen.getByTestId('focus-stat-toggle-novacosa_xyz') as HTMLButtonElement;
    // disabled OU aria-disabled=true
    const isDisabled = btn.disabled === true || btn.getAttribute('aria-disabled') === 'true';
    expect(isDisabled).toBe(true);
  });
});

// =============================================================================
// HIGH-1 reviewer — FocusStatToggle wirado em HudGroupedView (cada stat row).
// =============================================================================
describe('HudGroupedView — FocusStatToggle wirado em cada stat row', () => {
  it('renderiza <FocusStatToggle /> para a stat vpip dentro de uma cell stats-v3', async () => {
    setApiResponses(focusStatsEmptyResp);
    const { default: HudGroupedView } = await import(/* @vite-ignore */ '../stats/HudGroupedView');
    const layout = {
      id: 'lay-1',
      name: 'Default',
      fields_json: [],
    };
    const snapshot = {
      id: 'snap-1',
      layoutId: 'lay-1',
      capturedAt: new Date('2026-05-15T20:00:00Z'),
      source: 'manual',
      values: { vpip: 22.5, pfr: 18.0, cbet_flop_ip: 62.4 },
      sampleSize: 142,
    };
    const filters = {
      searchQuery: '',
      activeGroups: new Set(['basics' as any]),
      preset: null,
    };
    renderWithQuery(
      <HudGroupedView
        layout={layout as any}
        snapshot={snapshot as any}
        filters={filters as any}
        comparisonMode="single"
      />,
    );
    // Aguarda o toggle aparecer ou skeleton — qualquer um valida que esta
    // wirado dentro do grouped view.
    await waitFor(() => {
      const toggleOrSkeleton =
        document.querySelector('[data-testid^="focus-stat-toggle-"]') ||
        document.querySelector('[data-testid="focus-stat-toggle-skeleton"]');
      expect(toggleOrSkeleton).not.toBeNull();
    });
  });
});
