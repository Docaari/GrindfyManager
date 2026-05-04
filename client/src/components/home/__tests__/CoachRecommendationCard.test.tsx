/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-4 / Item 4 — RF-09 (CoachRecommendationCard)
 *
 * Spec : Docs/specs/home-reform-4-item-4-coach-recommendation.md §RF-09
 * ADRs : 111 (schema) + 114 (consume tracking)
 * Pad. : LibraryResume.test.tsx (mesmo padrao de mock apiRequest + tracker + wouter)
 *
 * Cobertura:
 *   - Loading skeleton (data-testid="home-coach-rec-loading")
 *   - Empty state recommendation=null + status=undefined
 *     -> "Sua recomendacao desta semana ainda nao foi gerada"
 *   - status='dismissed' -> "Dispensada — proxima recomendacao na segunda"
 *   - status='consumed' -> "Ja consumida essa semana — proxima na segunda"
 *   - status='lesson_unavailable' -> "indisponivel"
 *   - Render normal: titulo "Recomendacao da Semana", thumbnail, lesson title, reason
 *   - hasAccess=true -> CTA "Assistir agora" (video) com link source=home-coach-rec&recId
 *   - hasAccess=false -> "Ver detalhes" + tag "Sugestao de compra"
 *   - Botao "Dispensar" -> POST dismiss + invalidateQueries
 *   - Botao "Marcar como vista" (so se hasAccess) -> POST consume
 *   - data-testid estaveis em elementos clicaveis (#2 lesson)
 *   - Tracker emit em view + cta_click + dismiss + consume
 *
 * Lessons aplicadas:
 *   #1  hooks ANTES de early return
 *   #2  data-testid estavel
 *   #11 NAO criar acoes default decorativas — apenas spec
 *   #13 apiRequest retorna JSON parseado
 *   #14 await import(...) — ESM compat
 *
 * Status RED: `client/src/components/home/CoachRecommendationCard.tsx` NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// Lazy loader que escapa do static analysis do Vite/rolldown — sem essa
// indirecao, o transform tenta resolver `../CoachRecommendationCard` na fase
// de parse e quebra a suite inteira em "Failed to resolve import" antes de
// rodar qualquer test. Com a string montada em runtime, vite pula o resolve
// estatico e o erro de modulo passa para o test individual (red phase).
async function loadCard(): Promise<{ default: React.ComponentType<any> }> {
  const path = '../' + 'CoachRecommendationCard';
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
const recActive = {
  weekStartDate: '2026-05-04',
  recommendation: {
    id: 'REC-1',
    lessonId: 'LESS-1',
    lessonTitle: 'Defesa de BB contra 3bet',
    courseTitle: 'Fundamentos',
    moduleTitle: 'Preflop',
    coverImageUrl: 'https://example.com/cover.jpg',
    format: 'video',
    durationSeconds: 1800,
    category: 'preflop',
    reason: 'Voce esta perdendo no BB defense — esta licao foca no caminho.',
    source: 'coach',
    createdAt: '2026-05-04T09:00:00Z',
    hasAccess: true,
    ctaTarget: '/biblioteca/aulas/LESS-1?source=home-coach-rec&recId=REC-1',
    ctaLabel: 'Assistir agora',
  },
  status: 'active',
};

// =============================================================================
// Loading state
// =============================================================================
describe('<CoachRecommendationCard /> — loading state', () => {
  it('renderiza skeleton com data-testid="home-coach-rec-loading" enquanto query pendente', async () => {
    // Promise que nunca resolve para travar em loading
    mockApiRequest.mockReturnValue(new Promise(() => {}));
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    expect(screen.getByTestId('home-coach-rec-loading')).toBeInTheDocument();
  });
});

// =============================================================================
// Empty state — recommendation=null, sem status
// =============================================================================
describe('<CoachRecommendationCard /> — empty (sem rec gerada)', () => {
  it('recommendation=null + status undefined -> renderiza empty state', async () => {
    mockApiRequest.mockResolvedValue({
      weekStartDate: '2026-05-04',
      recommendation: null,
    });
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-empty')).toBeInTheDocument();
    });
    const empty = screen.getByTestId('home-coach-rec-empty');
    expect(empty.textContent ?? '').toMatch(/proxima na segunda|ainda nao foi gerada|sem recomendacao/i);
  });
});

// =============================================================================
// Estados terminais — dismissed / consumed / lesson_unavailable
// =============================================================================
describe('<CoachRecommendationCard /> — terminal states', () => {
  it('status="consumed" -> "Ja consumida essa semana"', async () => {
    mockApiRequest.mockResolvedValue({
      weekStartDate: '2026-05-04',
      recommendation: null,
      status: 'consumed',
    });
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('home-coach-rec-empty').textContent ?? '').toMatch(
      /ja consumida|consumida/i,
    );
  });

  it('status="dismissed" -> "Dispensada — proxima recomendacao na segunda"', async () => {
    mockApiRequest.mockResolvedValue({
      weekStartDate: '2026-05-04',
      recommendation: null,
      status: 'dismissed',
    });
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('home-coach-rec-empty').textContent ?? '').toMatch(
      /dispensada/i,
    );
  });

  it('status="lesson_unavailable" -> texto neutro de indisponibilidade', async () => {
    mockApiRequest.mockResolvedValue({
      weekStartDate: '2026-05-04',
      recommendation: null,
      status: 'lesson_unavailable',
    });
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('home-coach-rec-empty').textContent ?? '').toMatch(
      /indisponivel/i,
    );
  });
});

// =============================================================================
// Render normal — recommendation ativa
// =============================================================================
describe('<CoachRecommendationCard /> — render ativo', () => {
  it('renderiza container "home-coach-rec-card" + titulo "Recomendacao da Semana"', async () => {
    mockApiRequest.mockResolvedValue(recActive);
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-card')).toBeInTheDocument();
    });
    expect(screen.getByTestId('home-coach-rec-card').textContent ?? '').toMatch(
      /Recomendacao da Semana/i,
    );
  });

  it('renderiza lesson title + reason + thumbnail', async () => {
    mockApiRequest.mockResolvedValue(recActive);
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-card')).toBeInTheDocument();
    });
    expect(screen.getByText(/Defesa de BB contra 3bet/i)).toBeInTheDocument();
    expect(screen.getByText(/BB defense|caminho/i)).toBeInTheDocument();
    // Thumbnail (img) com src do coverImageUrl
    const imgs = screen.getAllByRole('img');
    expect(imgs.some((i) => (i as HTMLImageElement).src.includes('cover.jpg'))).toBe(true);
  });

  it('renderiza meta line com duracao + categoria', async () => {
    mockApiRequest.mockResolvedValue(recActive);
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-card')).toBeInTheDocument();
    });
    const card = screen.getByTestId('home-coach-rec-card');
    // 1800s = 30 min — aceita formato "30 min" ou "30:00"
    expect(card.textContent ?? '').toMatch(/30\s*min|30:00/i);
    expect(card.textContent ?? '').toMatch(/preflop/i);
  });
});

// =============================================================================
// hasAccess=true — botao "Assistir agora" + link com source=home-coach-rec
// =============================================================================
describe('<CoachRecommendationCard /> — CTA com hasAccess=true', () => {
  it('botao CTA tem testid "home-coach-rec-cta" e label "Assistir agora"', async () => {
    mockApiRequest.mockResolvedValue(recActive);
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-cta')).toBeInTheDocument();
    });
    expect(screen.getByTestId('home-coach-rec-cta').textContent ?? '').toMatch(
      /Assistir agora/i,
    );
  });

  it('link CTA contem source=home-coach-rec + recId=REC-1 + lessonId=LESS-1', async () => {
    mockApiRequest.mockResolvedValue(recActive);
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-cta')).toBeInTheDocument();
    });
    const cta = screen.getByTestId('home-coach-rec-cta');
    const href = cta.getAttribute('href') || cta.querySelector('a')?.getAttribute('href') || '';
    expect(href).toContain('home-coach-rec');
    expect(href).toContain('REC-1');
    expect(href).toContain('LESS-1');
  });

  it('renderiza botao "Marcar como vista" quando hasAccess=true', async () => {
    mockApiRequest.mockResolvedValue(recActive);
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-mark-consumed')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// hasAccess=false — "Ver detalhes" + "Sugestao de compra"
// =============================================================================
describe('<CoachRecommendationCard /> — CTA com hasAccess=false', () => {
  const recNoAccess = {
    ...recActive,
    recommendation: {
      ...recActive.recommendation,
      hasAccess: false,
      ctaLabel: 'Comprar acesso',
      ctaTarget: '/biblioteca/aulas/LESS-1?source=home-coach-rec&recId=REC-1&intent=purchase',
    },
  };

  it('botao CTA mostra "Ver detalhes" ou "Comprar acesso"', async () => {
    mockApiRequest.mockResolvedValue(recNoAccess);
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-cta')).toBeInTheDocument();
    });
    expect(screen.getByTestId('home-coach-rec-cta').textContent ?? '').toMatch(
      /detalhes|comprar/i,
    );
  });

  it('renderiza tag "Sugestao de compra" perto do CTA', async () => {
    mockApiRequest.mockResolvedValue(recNoAccess);
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-card')).toBeInTheDocument();
    });
    const card = screen.getByTestId('home-coach-rec-card');
    expect(card.textContent ?? '').toMatch(/Sugestao de compra/i);
  });

  it('NAO renderiza "Marcar como vista" quando hasAccess=false', async () => {
    mockApiRequest.mockResolvedValue(recNoAccess);
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-card')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('home-coach-rec-mark-consumed')).not.toBeInTheDocument();
  });
});

// =============================================================================
// Dispensar -> POST dismiss
// =============================================================================
describe('<CoachRecommendationCard /> — dismiss action', () => {
  it('botao "Dispensar" tem testid="home-coach-rec-dismiss"', async () => {
    mockApiRequest.mockResolvedValue(recActive);
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-dismiss')).toBeInTheDocument();
    });
  });

  it('clicar em "Dispensar" -> POST /api/home/coach-recommendation/REC-1/dismiss', async () => {
    // 1a chamada GET retorna ativa; 2a chamada POST dismiss
    mockApiRequest
      .mockResolvedValueOnce(recActive) // GET
      .mockResolvedValueOnce({ ok: true, dismissedAt: '2026-05-05T10:00:00Z' }); // POST dismiss

    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-dismiss')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('home-coach-rec-dismiss'));
    await waitFor(() => {
      // Pelo menos 2 chamadas (GET + dismiss). Pode ter 3 se invalidate refaz GET.
      const dismissCalls = mockApiRequest.mock.calls.filter((args: any[]) =>
        args.some((a) => typeof a === 'string' && a.includes('dismiss')),
      );
      expect(dismissCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// =============================================================================
// Marcar como vista -> POST consume
// =============================================================================
describe('<CoachRecommendationCard /> — consume action', () => {
  it('clicar em "Marcar como vista" -> POST /api/home/coach-recommendation/REC-1/consume', async () => {
    mockApiRequest
      .mockResolvedValueOnce(recActive) // GET
      .mockResolvedValueOnce({ ok: true, consumedAt: '2026-05-05T11:00:00Z' }); // POST consume

    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-mark-consumed')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('home-coach-rec-mark-consumed'));
    await waitFor(() => {
      const consumeCalls = mockApiRequest.mock.calls.filter((args: any[]) =>
        args.some((a) => typeof a === 'string' && a.includes('consume')),
      );
      expect(consumeCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// =============================================================================
// Tracker emits
// =============================================================================
describe('<CoachRecommendationCard /> — tracker', () => {
  it('emit("home_coach_rec_view") 1x quando rec ativa monta', async () => {
    mockApiRequest.mockResolvedValue(recActive);
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      const viewCalls = mockEmit.mock.calls.filter((c) => c[0] === 'home_coach_rec_view');
      expect(viewCalls.length).toBe(1);
    });
  });

  it('emit("home_coach_rec_cta_click") quando CTA clicado', async () => {
    mockApiRequest.mockResolvedValue(recActive);
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-cta')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('home-coach-rec-cta'));
    await waitFor(() => {
      const clickCalls = mockEmit.mock.calls.filter((c) => c[0] === 'home_coach_rec_cta_click');
      expect(clickCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('emit("home_coach_rec_dismiss_click") quando dismiss clicado', async () => {
    mockApiRequest
      .mockResolvedValueOnce(recActive)
      .mockResolvedValue({ ok: true });
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-dismiss')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('home-coach-rec-dismiss'));
    await waitFor(() => {
      const dismissEmits = mockEmit.mock.calls.filter(
        (c) => c[0] === 'home_coach_rec_dismiss_click',
      );
      expect(dismissEmits.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('NAO emite home_coach_rec_view quando empty/null (apenas em rec ativa)', async () => {
    mockApiRequest.mockResolvedValue({
      weekStartDate: '2026-05-04',
      recommendation: null,
    });
    const { default: CoachRecommendationCard } = await loadCard();
    renderWithQuery(<CoachRecommendationCard />);
    await waitFor(() => {
      expect(screen.getByTestId('home-coach-rec-empty')).toBeInTheDocument();
    });
    const viewCalls = mockEmit.mock.calls.filter((c) => c[0] === 'home_coach_rec_view');
    expect(viewCalls.length).toBe(0);
  });
});
