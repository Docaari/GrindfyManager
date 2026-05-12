/**
 * Test-Writer (Modo TDD — Red Phase)
 *
 * Sprint AI-1A / RF-10 — CoachPreferencesPanel: secao "Categorias pausadas"
 *   Renderiza, para cada entrada de frozenCategories no GET /api/coach/preferences,
 *   uma linha com rotulo + motivo + data + botao "Reativar" -> POST /api/coach/preferences/unfreeze.
 *
 * Fontes:
 *   - Docs/specs/sprint-ai-1a.md (RF-10)
 *   - Docs/architecture/decisions/152-anti-fadiga-snooze-telemetry-autofreeze-killswitch.md (§code refs CoachPreferencesPanel)
 *
 * data-testid esperados (estaveis):
 *   - coach-prefs-frozen-section        — wrapper da secao
 *   - coach-prefs-frozen-item-<cat>     — uma linha por categoria congelada (ex: coach-prefs-frozen-item-B-STUDY)
 *   - coach-prefs-unfreeze-<cat>        — botao "Reativar"
 *
 * Lessons: #13 (apiRequest JSON), #2 (data-testid), #27 (Radix Tabs onMouseDown — a aba prefs ja trata),
 *          #14/#26 (await import .tsx — carregamos a pagina CoachAI).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('wouter', () => ({
  useLocation: () => ['/coach-ai', vi.fn()] as const,
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }), toast: vi.fn() }));

// Mock dos hooks pesados do hub para isolar a aba Preferencias.
vi.mock('@/hooks/useTabFromUrl', () => ({
  useTabFromUrl: (_valid: string[], _def: string) => {
    const [t, setT] = React.useState('prefs'); // forca a aba prefs
    return [t, setT] as const;
  },
}));
vi.mock('@/hooks/useCoachChat', () => ({
  useCoachChat: () => ({
    sessions: [], messages: [], activeSessionId: null, setActiveSessionId: vi.fn(),
    isLoadingSessions: false, isLoadingMessages: false, isStreaming: false, streamedText: '',
    streamError: null, sendMessage: vi.fn(), cancelStream: vi.fn(), startNewConversation: vi.fn(),
    archiveSession: vi.fn(), deleteSession: vi.fn(),
  }),
}));
vi.mock('@/hooks/useCoachPageContext', () => ({ useCoachPageContext: () => undefined }));

const prefsState = {
  body: {
    nudges: { bSnapshot: true, bLeak: true, bStudy: true, bVolume: true, bGrade: true, bDownswing: true, bLife: false, bMental: false },
    quietHours: { startHour: 21, endHour: 9, timezone: 'America/Sao_Paulo' },
    frequencyCap: { perDay: 3, perHour: 1 },
    channels: { inApp: true, email: true, push: false },
    coachTone: 'balanced',
    frozenCategories: {
      'B-STUDY': { frozenAt: '2026-05-01T00:00:00Z', reason: 'auto_dismiss_rate', dismissRate: 0.8, windowDays: 7 },
      'B-VOLUME': { frozenAt: '2026-05-03T00:00:00Z', reason: 'admin' },
    },
    updatedAt: '2026-05-12T00:00:00Z',
  } as any,
};

const apiRequestMock = vi.fn(async (method: string, url: string, _body?: any) => {
  if (url.includes('/api/coach/preferences/unfreeze')) {
    // simula: remove a entrada
    return { preferences: { ...prefsState.body, frozenCategories: {} } };
  }
  if (url.includes('/api/coach/preferences')) return prefsState.body;
  if (url.includes('/api/coach/audit')) return { actions: [], nextCursor: null };
  return {};
});
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (m: string, u: string, b?: any) => apiRequestMock(m, u, b),
  queryClient: undefined,
  getQueryFn: () => async ({ queryKey }: any) => apiRequestMock('GET', String(queryKey[0])),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function loadCoachAI() {
  const mod: any = await import('@/pages/CoachAI');
  return (mod.default ?? mod.CoachAI) as React.ComponentType<any>;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('CoachPreferencesPanel — secao "Categorias pausadas"', () => {
  it('renderiza a secao com uma linha por categoria congelada', async () => {
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-prefs-panel')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('coach-prefs-frozen-section')).toBeTruthy());
    expect(screen.getByTestId('coach-prefs-frozen-item-B-STUDY')).toBeTruthy();
    expect(screen.getByTestId('coach-prefs-frozen-item-B-VOLUME')).toBeTruthy();
  });

  it('cada linha tem o botao "Reativar"', async () => {
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-prefs-frozen-section')).toBeTruthy());
    expect(screen.getByTestId('coach-prefs-unfreeze-B-STUDY')).toBeTruthy();
    expect(screen.getByTestId('coach-prefs-unfreeze-B-VOLUME')).toBeTruthy();
  });

  it('clicar "Reativar" chama POST /api/coach/preferences/unfreeze com { category }', async () => {
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-prefs-unfreeze-B-STUDY')).toBeTruthy());
    await userEvent.click(screen.getByTestId('coach-prefs-unfreeze-B-STUDY'));
    await waitFor(() => {
      expect(apiRequestMock.mock.calls.some(c => c[0] === 'POST' && String(c[1]).includes('/api/coach/preferences/unfreeze') && c[2] && c[2].category === 'B-STUDY')).toBe(true);
    });
  });

  it('sem categorias congeladas -> a secao some OU mostra "nenhuma categoria pausada"', async () => {
    prefsState.body = { ...prefsState.body, frozenCategories: {} };
    const CoachAI = await loadCoachAI();
    render(wrap(<CoachAI />));
    await waitFor(() => expect(screen.getByTestId('coach-prefs-panel')).toBeTruthy());
    await new Promise(r => setTimeout(r, 30));
    const section = screen.queryByTestId('coach-prefs-frozen-section');
    if (section) {
      // mostra estado vazio
      expect(section.textContent || '').toMatch(/nenhuma categoria pausada|nenhuma pausada/i);
    } else {
      expect(section).toBeNull();
    }
  });
});
