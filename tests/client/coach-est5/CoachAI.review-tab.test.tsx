import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// EST-5 / ADR-226 — nova tab "Revisao semanal" em /coach-ai (RED phase, jsdom)
//
// Pagina alvo (JA EXISTE, mas SEM a tab review): client/src/pages/CoachAI.tsx
//   RF-08: HUB_TABS += 'review', TAB_META += entrada (label "Revisao semanal"),
//   TabsContent value="review" montando <WeeklyReviewPanel/>, TabsTrigger com
//   onClick redundante (lesson #27 — Radix Tabs reage a onMouseDown).
//
// Cobertura:
//   - Tab "Revisao semanal" aparece (coach-ai-tab-review) e é selecionavel via
//     fireEvent.click (lesson #27 — onClick redundante).
//   - ?tab=review resolve a tab review no mount (URL-persisted via useTabFromUrl).
//   - O tabpanel review monta o WeeklyReviewPanel (coach-ai-tabpanel-review).
//
// Estrategia: mockamos os paineis/hooks pesados da CoachAI por path para isolar
// a logica de tabs (a pagina importa useCoachChat, SpotifyConnectionPanel, etc.).
// O WeeklyReviewPanel é mockado por path — este teste cobre o WIRING da tab, nao
// o painel (coberto em WeeklyReviewPanel.test.tsx).
//
// Lessons: #14/#26/#38 (await import componente), #27 (Radix Tabs fireEvent.click),
//   #2 (data-testid estavel).
// =============================================================================

// --- Mocks dos hooks/paineis pesados (mantem a pagina montavel) ---------------
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async () => ({ items: [] })),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

vi.mock('@/hooks/useCoachChat', () => ({
  useCoachChat: () => ({
    sessions: [],
    messages: [],
    activeSessionId: null,
    setActiveSessionId: vi.fn(),
    isLoadingSessions: false,
    isStreaming: false,
    streamedText: '',
    streamError: null,
    sendMessage: vi.fn(),
    startNewConversation: vi.fn(),
    archiveSession: vi.fn(),
    deleteSession: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCoachPageContext', () => ({ useCoachPageContext: () => ({}) }));
vi.mock('@/components/coach/OnboardingBanner', () => ({ default: () => null }));
vi.mock('@/components/coach-ai/CoachLensChips', () => ({ CoachLensChips: () => null }));
vi.mock('@/components/coach/NudgeCard', () => ({ NudgeCard: () => null, default: () => null }));
vi.mock('@/components/settings/SpotifyConnectionPanel', () => ({ SpotifyConnectionPanel: () => null }));
vi.mock('@/components/coach/CoachLessonRecommendationCard', () => ({
  CoachLessonRecommendationCard: () => null,
}));
vi.mock('@/lib/quickSuggestionsFallback', () => ({ getFallbackSuggestions: () => [] }));

// WeeklyReviewPanel mockado por path — prova apenas a MONTAGEM no tabpanel review.
vi.mock('@/components/coach/weekly-review/WeeklyReviewPanel', () => ({
  WeeklyReviewPanel: () =>
    React.createElement('div', { 'data-testid': 'weekly-review-panel-stub' }, 'painel'),
  default: () =>
    React.createElement('div', { 'data-testid': 'weekly-review-panel-stub' }, 'painel'),
}));

// useTabFromUrl controlado: respeita o ?tab= inicial via window.location.search.
vi.mock('wouter', () => ({
  useLocation: () => ['/coach-ai', vi.fn()],
  useSearch: () => (typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : ''),
  Link: ({ href, children, ...rest }: any) => React.createElement('a', { href, ...rest }, children),
}));

async function loadCoachAI() {
  const mod: any = await import('@/pages/CoachAI');
  return mod.default ?? mod.CoachAI;
}

function renderPage(CoachAI: any) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CoachAI />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // reset URL para sem ?tab=
  window.history.replaceState({}, '', '/coach-ai');
});

describe('CoachAI — tab "Revisao semanal" (RF-08)', () => {
  it('a tab review aparece na barra de tabs (coach-ai-tab-review)', async () => {
    const CoachAI = await loadCoachAI();
    renderPage(CoachAI);
    await waitFor(() => {
      expect(screen.getByTestId('coach-ai-tab-review')).toBeInTheDocument();
    });
  });

  it('clicar na tab review (fireEvent.click — lesson #27) ativa o tabpanel review', async () => {
    const CoachAI = await loadCoachAI();
    renderPage(CoachAI);
    const tab = await screen.findByTestId('coach-ai-tab-review');
    fireEvent.click(tab);
    await waitFor(() => {
      expect(screen.getByTestId('weekly-review-panel-stub')).toBeInTheDocument();
    });
  });

  it('?tab=review resolve a tab review no mount (URL-persisted)', async () => {
    window.history.replaceState({}, '', '/coach-ai?tab=review');
    const CoachAI = await loadCoachAI();
    renderPage(CoachAI);
    await waitFor(() => {
      expect(screen.getByTestId('weekly-review-panel-stub')).toBeInTheDocument();
    });
  });
});
