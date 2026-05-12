/**
 * Test-Writer (Modo TDD — Red Phase)
 *
 * Sprint AI-1B / RF-08 — aba "Relatorios e avisos" do /coach-ai vira timeline real.
 *   ReportsPanel (em client/src/pages/CoachAI.tsx, reescrito) — useQuery(['/api/coach/timeline']):
 *     - timeline vazia -> EmptyState (data-testid="coach-ai-reports-empty" mantido como fallback)
 *     - itens -> lista; report item -> card clicavel (navega /coach-ai/relatorio/:id);
 *       nudge item -> <NudgeCard>
 *
 * Fontes:
 *   - Docs/specs/sprint-ai-1b.md (RF-08, RF-08.3 + "Cenarios de Teste Derivados")
 *   - Docs/architecture/decisions/157-...-bgapcheck-bimport.md (§3.3, §5)
 *
 * data-testid esperados (estaveis — implementer cria):
 *   - coach-ai-reports-empty          — EmptyState (timeline vazia) [mantido do AI-0B]
 *   - coach-timeline-list             — wrapper da lista
 *   - coach-timeline-item-report      — card de um relatorio
 *   - coach-timeline-item-nudge       — wrapper de um NudgeCard na timeline
 *
 * Lessons: #13 (apiRequest JSON — mock retorna o objeto, nao { ok, json }),
 *   #14/#26 (await import .tsx — NAO require), #27 (Radix Tabs onMouseDown — usar
 *   userEvent.click), #29 (useQuery dentro de QueryClientProvider — wrap), #31
 *   (evitar `* /` literal em comentarios JSDoc).
 *
 * Status esperado: FALHAM enquanto o ReportsPanel for EmptyState fixo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }), toast: vi.fn() }));

const navMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/coach-ai', navMock] as const,
  Link: ({ href, children, ...rest }: any) => <a href={href} data-href={href} {...rest}>{children}</a>,
  useRoute: () => [false, {}] as const,
  Route: () => null,
}));

// useTabFromUrl -> forca aba "reports"
const tabState = { active: 'reports' };
vi.mock('@/hooks/useTabFromUrl', () => ({
  useTabFromUrl: (_valid: string[], _def: string) => {
    const [t, setT] = React.useState(tabState.active);
    return [t, (slug: string) => { tabState.active = slug; setT(slug); }] as const;
  },
}));

// useCoachChat (o painel chat do hub o usa) — stub minimo.
vi.mock('@/hooks/useCoachChat', () => ({
  useCoachChat: () => ({
    sessions: [], messages: [], activeSessionId: null, setActiveSessionId: vi.fn(),
    isLoadingSessions: false, isLoadingMessages: false, isStreaming: false, streamedText: '',
    streamError: null, sendMessage: vi.fn(), cancelStream: vi.fn(), startNewConversation: vi.fn(),
    archiveSession: vi.fn(), deleteSession: vi.fn(),
  }),
}));
vi.mock('@/hooks/useCoachPageContext', () => ({
  useCoachPageContext: () => ({ route: '/coach-ai', activeCoachType: null }),
}));

// timeline data — controlavel.
const timelineState: { items: any[]; nextCursor?: string } = { items: [] };
const apiRequestMock = vi.fn(async (method: string, url: string) => {
  if (url.startsWith('/api/coach/timeline')) return { ...timelineState };
  if (url.startsWith('/api/coach/audit')) return { items: [] };
  if (url.startsWith('/api/coach/preferences')) return {
    nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
    nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
    quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
    channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced',
    frozenCategories: {}, reportWeeklyEnabled: false, nudgeBGapcheck: true, nudgeBImport: true,
  };
  if (url.startsWith('/api/coach/suggestions')) return { suggestions: [] };
  return {};
});
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (m: string, u: string, b?: any) => apiRequestMock(m, u, b),
  queryClient: undefined,
  getQueryFn: () => async () => ({}),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function loadCoachAI() {
  const mod: any = await import('@/pages/CoachAI');
  return (mod.default ?? mod.CoachAI) as React.ComponentType<any>;
}

beforeEach(() => {
  vi.clearAllMocks();
  tabState.active = 'reports';
  timelineState.items = [];
  delete timelineState.nextCursor;
});

describe('ReportsPanel (aba reports do hub) — timeline', () => {
  it('timeline vazia -> EmptyState (data-testid coach-ai-reports-empty)', async () => {
    timelineState.items = [];
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-ai-reports-empty')).toBeTruthy());
  });

  it('timeline com itens -> lista com card de relatorio (clicavel) e NudgeCard', async () => {
    timelineState.items = [
      { kind: 'report', id: 'r1', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10', status: 'ready', summaryLine: 'Sua semana: +$1234 (ROI 12%)', generatedAt: '2026-05-11T10:00:00Z', readAt: null, dismissedAt: null },
      { kind: 'nudge', id: 'n1', category: 'B-IMPORT', status: 'sent', title: 'Importe seu historico', bodyPreview: 'Voce registrou sessoes...', sentAt: '2026-05-09T12:00:00Z', engagedAt: null, dismissedAt: null, snoozeUntil: null, chatSessionId: null, triggeredByEvent: 'b_import_check' },
    ];
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-timeline-list')).toBeTruthy());
    expect(screen.getByTestId('coach-timeline-item-report')).toBeTruthy();
    expect(screen.getByTestId('coach-timeline-item-nudge')).toBeTruthy();
    // o card de relatorio mostra a summaryLine.
    expect(screen.getByText(/Sua semana: \+\$1234/)).toBeTruthy();
  });

  it('clicar num card de relatorio -> navega para /coach-ai/relatorio/:id', async () => {
    timelineState.items = [
      { kind: 'report', id: 'r1', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10', status: 'ready', summaryLine: 'Sua semana: +$1234', generatedAt: '2026-05-11T10:00:00Z', readAt: null, dismissedAt: null },
    ];
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-timeline-item-report')).toBeTruthy());
    const card = screen.getByTestId('coach-timeline-item-report');
    await userEvent.click(card);
    // navegacao via setLocation OU via <Link href> renderizado como <a data-href>.
    const navigated = navMock.mock.calls.some((c: any[]) => String(c[0] ?? '').includes('/coach-ai/relatorio/r1'));
    const linkPresent = !!card.querySelector('[data-href*="/coach-ai/relatorio/r1"]') || card.getAttribute('data-href')?.includes('/coach-ai/relatorio/r1');
    expect(navigated || linkPresent).toBe(true);
  });

  it('timeline so com nudges (nenhum relatorio) -> renderiza apenas NudgeCards (nao mostra o EmptyState)', async () => {
    timelineState.items = [
      { kind: 'nudge', id: 'n1', category: 'B-GAPCHECK', status: 'sent', title: 'Faltam dados', bodyPreview: '...', sentAt: '2026-05-08T12:00:00Z', triggeredByEvent: 'gap_check_d3' },
    ];
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-timeline-item-nudge')).toBeTruthy());
    expect(screen.queryByTestId('coach-ai-reports-empty')).toBeNull();
  });

  it('relatorio status=degraded -> card mostra um aviso "modo simplificado"', async () => {
    timelineState.items = [
      { kind: 'report', id: 'r1', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10', status: 'degraded', summaryLine: 'Sua semana: +$1234', generatedAt: '2026-05-11T10:00:00Z', readAt: null, dismissedAt: null },
    ];
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-timeline-item-report')).toBeTruthy());
    expect(screen.getByText(/simplificad/i)).toBeTruthy();
  });
});
