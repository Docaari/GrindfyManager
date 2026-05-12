/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint AI-0B / RF-07 — hub /coach-ai: titulo "Grindfy AI" + 4 tabs URL-persisted
 * (chat/reports/audit/prefs) + chips de lente + EmptyState em reports + audit
 * consome GET /api/coach/audit + prefs consome GET/PUT /api/coach/preferences.
 *
 * Spec: Docs/specs/sprint-ai-0b.md §RF-07; ADR-150 §2, §5; ADR-148 (agente unico).
 *
 * data-testid esperados (estaveis — implementer cria):
 *   - coach-ai-hub-title            — texto "Grindfy AI"
 *   - coach-ai-tab-chat / -reports / -audit / -prefs   — os 4 TabsTrigger
 *   - coach-ai-tabpanel-chat / -reports / -audit / -prefs  — conteudo de cada tab
 *   - coach-ai-reports-empty        — EmptyState da aba Relatorios e avisos
 *   - coach-lens-chip-mental / -tournament / -technical    — chips de lente no Chat
 *   - coach-audit-panel             — wrapper do CoachAuditPanel
 *   - coach-audit-item              — cada acao listada
 *   - coach-prefs-panel             — wrapper do CoachPreferencesPanel
 *   - coach-prefs-toggle-bSnapshot ... -bMental            — 8 toggles
 *   - coach-prefs-save              — botao salvar (dispara PUT)
 *
 * Lessons:
 *   #13 apiRequest retorna JSON parseado (mock delega ao global.fetch p/ o hub
 *       que usa fetch direto no chat e apiRequest nos paineis).
 *   #14/#26 await import em .tsx (carregar a pagina).
 *   #27 Radix Tabs reage a onMouseDown — usamos userEvent.click (simula
 *       mousedown+mouseup+click); o componente controlado deve ter onClick
 *       redundante OU userEvent.click cobre.
 *   #29 paineis com useQuery -> montados dentro de QueryClientProvider (wrap).
 *   #31 evitar `*` seguido de `/` literal em comentarios com path patterns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

// useTabFromUrl: reusamos o hook real se existir; aqui mockamos para controlar a tab via state interno.
// O implementer deve usar useTabFromUrl(['chat','reports','audit','prefs'], 'chat') (ADR-125 padrao).
const tabState = { active: 'chat' };
vi.mock('@/hooks/useTabFromUrl', () => ({
  useTabFromUrl: (_valid: string[], _def: string) => {
    const [t, setT] = React.useState(tabState.active);
    React.useEffect(() => { setT(tabState.active); }, []);
    return [t, (slug: string) => { tabState.active = slug; setT(slug); }] as const;
  },
}));

// wouter — useLocation
vi.mock('wouter', () => ({
  useLocation: () => ['/coach-ai', vi.fn()],
}));

// useCoachChat: capturar coachType passado (chip de lente) + sendMessage
const coachChatCalls: any[] = [];
const sendMessageMock = vi.fn();
vi.mock('@/hooks/useCoachChat', () => ({
  useCoachChat: (coachType: string) => {
    coachChatCalls.push(coachType);
    return {
      sessions: [],
      messages: [],
      activeSessionId: null,
      setActiveSessionId: vi.fn(),
      isLoadingSessions: false,
      isLoadingMessages: false,
      isStreaming: false,
      streamedText: '',
      streamError: null,
      sendMessage: sendMessageMock,
      cancelStream: vi.fn(),
      startNewConversation: vi.fn(),
      archiveSession: vi.fn(),
      deleteSession: vi.fn(),
    };
  },
}));

// useCoachPageContext (novo) — devolve o page context montado.
vi.mock('@/hooks/useCoachPageContext', () => ({
  useCoachPageContext: (route: string, fields?: Record<string, any>) => {
    if (!route) return undefined;
    const out: any = { route };
    for (const [k, v] of Object.entries(fields ?? {})) if (v !== undefined) out[k] = v;
    return out;
  },
}));

// apiRequest: delega ao global.fetch mock (lesson #13 — retorna JSON parseado).
const fetchMock = vi.fn();
vi.mock('@/lib/queryClient', async () => {
  const actual = await vi.importActual<any>('@/lib/queryClient');
  return {
    ...actual,
    apiRequest: async (method: string, url: string, body?: any) => {
      const r = await fetchMock(url, { method, body: body ? JSON.stringify(body) : undefined });
      return r.json();
    },
    getCsrfToken: () => 'csrf-token',
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const AUDIT_FIXTURE = [
  { id: 'act-1', type: 'register_tournament_grade', description: 'Sugeriu registrar Bounty Hunter $11', status: 'completed', createdAt: '2026-05-10T12:00:00Z' },
  { id: 'act-2', type: 'log_leak_focus', description: 'Marcou leak "overfold em bolha" como foco', status: 'pending', createdAt: '2026-05-11T09:30:00Z' },
];

const PREFS_FIXTURE = {
  nudges: { bSnapshot: true, bLeak: true, bStudy: true, bVolume: true, bGrade: true, bDownswing: true, bLife: false, bMental: false },
  quietHours: { startHour: 21, endHour: 9, timezone: 'America/Sao_Paulo' },
  frequencyCap: { perDay: 3, perHour: 1 },
  channels: { inApp: true, email: true, push: false },
  coachTone: 'balanced',
};

function setupFetch() {
  fetchMock.mockImplementation(async (url: string, opts?: any) => {
    const u = String(url);
    if (u.includes('/api/coach/audit/export')) {
      return { ok: true, status: 200, json: async () => ({ data: AUDIT_FIXTURE }), text: async () => '{}' } as any;
    }
    if (u.includes('/api/coach/audit')) {
      return { ok: true, status: 200, json: async () => AUDIT_FIXTURE, text: async () => '[]' } as any;
    }
    if (u.includes('/api/coach/preferences')) {
      return { ok: true, status: 200, json: async () => PREFS_FIXTURE, text: async () => '{}' } as any;
    }
    if (u.includes('/api/coach/sessions') && !u.includes('/messages')) {
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as any;
    }
    if (u.includes('/api/coach/limits')) {
      return {
        ok: true, status: 200,
        json: async () => ({ tier: 'premium', limits: {}, coachAccess: { mental: true, tournament: true, technical: true } }),
        text: async () => '{}',
      } as any;
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' } as any;
  });
}

async function loadHub() {
  // RED: pagina ainda nao reformada como hub (ainda exporta CoachAI antigo) OU
  // implementer move para client/src/pages/coach-ai.tsx. Tentamos os dois.
  // @ts-expect-error - red phase
  const mod: any = await import('@/pages/CoachAI').catch(() => import('@/pages/coach-ai'));
  return (mod.default ?? mod.CoachAI) as React.ComponentType<any>;
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  fetchMock.mockReset();
  sendMessageMock.mockReset();
  coachChatCalls.length = 0;
  tabState.active = 'chat';
  global.fetch = fetchMock as any;
  setupFetch();
});

// =============================================================================
// Titulo + tabs
// =============================================================================
describe('/coach-ai — hub (titulo + 4 tabs)', () => {
  it('mostra "Grindfy AI" como titulo/identidade', async () => {
    const Hub = await loadHub();
    render(wrap(<Hub />));
    await waitFor(() => {
      const title = screen.getByTestId('coach-ai-hub-title');
      expect(title.textContent || '').toMatch(/Grindfy\s*AI/i);
    });
  });

  it('NAO mostra "Coach Mental/Tecnico/de Torneios" como titulo da pagina', async () => {
    const Hub = await loadHub();
    render(wrap(<Hub />));
    await waitFor(() => screen.getByTestId('coach-ai-hub-title'));
    const title = screen.getByTestId('coach-ai-hub-title');
    expect(title.textContent || '').not.toMatch(/Coach\s+(Mental|T[eé]cnico|de\s+Torneios)/i);
  });

  it('tem 4 tabs com data-testid estavel: chat, reports, audit, prefs', async () => {
    const Hub = await loadHub();
    render(wrap(<Hub />));
    await waitFor(() => screen.getByTestId('coach-ai-tab-chat'));
    expect(screen.getByTestId('coach-ai-tab-chat')).toBeTruthy();
    expect(screen.getByTestId('coach-ai-tab-reports')).toBeTruthy();
    expect(screen.getByTestId('coach-ai-tab-audit')).toBeTruthy();
    expect(screen.getByTestId('coach-ai-tab-prefs')).toBeTruthy();
  });

  it('tab default = chat (?tab ausente)', async () => {
    const Hub = await loadHub();
    render(wrap(<Hub />));
    await waitFor(() => screen.getByTestId('coach-ai-tabpanel-chat'));
    expect(screen.getByTestId('coach-ai-tabpanel-chat')).toBeTruthy();
  });

  it('?tab=audit na URL ativa a aba audit (reusa useTabFromUrl)', async () => {
    tabState.active = 'audit';
    const Hub = await loadHub();
    render(wrap(<Hub />));
    await waitFor(() => {
      expect(screen.getByTestId('coach-ai-tabpanel-audit')).toBeTruthy();
    });
  });
});

// =============================================================================
// Reports tab — EmptyState, sem fetch
// =============================================================================
describe('/coach-ai — aba Relatorios e avisos (esqueleto)', () => {
  it('mostra EmptyState explicativo e NAO faz fetch de endpoint de relatorios', async () => {
    tabState.active = 'reports';
    const Hub = await loadHub();
    render(wrap(<Hub />));
    await waitFor(() => screen.getByTestId('coach-ai-reports-empty'));
    const empty = screen.getByTestId('coach-ai-reports-empty');
    expect(empty.textContent || '').toMatch(/relat[oó]rio/i);
    // Nenhum fetch para /api/coach/reports (endpoint inexistente).
    const calledReports = fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/coach/reports'));
    expect(calledReports).toBe(false);
  });
});

// =============================================================================
// Audit tab — consome GET /api/coach/audit
// =============================================================================
describe('/coach-ai — aba Historico de acoes (CoachAuditPanel)', () => {
  it('consome GET /api/coach/audit e renderiza as acoes', async () => {
    tabState.active = 'audit';
    const Hub = await loadHub();
    render(wrap(<Hub />));
    await waitFor(() => {
      const calledAudit = fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/coach/audit'));
      expect(calledAudit).toBe(true);
    });
    await waitFor(() => {
      const items = screen.getAllByTestId('coach-audit-item');
      expect(items.length).toBe(AUDIT_FIXTURE.length);
    });
    expect(screen.getByText(/Bounty Hunter \$11/i)).toBeTruthy();
  });
});

// =============================================================================
// Prefs tab — consome GET /api/coach/preferences + PUT no save
// =============================================================================
describe('/coach-ai — aba Preferencias (CoachPreferencesPanel)', () => {
  it('consome GET /api/coach/preferences e mostra os 8 toggles + quiet hours + caps', async () => {
    tabState.active = 'prefs';
    const Hub = await loadHub();
    render(wrap(<Hub />));
    await waitFor(() => screen.getByTestId('coach-prefs-panel'));
    for (const key of ['bSnapshot', 'bLeak', 'bStudy', 'bVolume', 'bGrade', 'bDownswing', 'bLife', 'bMental']) {
      expect(screen.getByTestId(`coach-prefs-toggle-${key}`)).toBeTruthy();
    }
    // quiet hours + caps: existem inputs (verificamos via testid de wrappers)
    expect(screen.getByTestId('coach-prefs-quiet-hours')).toBeTruthy();
    expect(screen.getByTestId('coach-prefs-caps')).toBeTruthy();
  });

  it('desligar bStudy + salvar -> dispara PUT /api/coach/preferences', async () => {
    tabState.active = 'prefs';
    const user = userEvent.setup();
    const Hub = await loadHub();
    render(wrap(<Hub />));
    await waitFor(() => screen.getByTestId('coach-prefs-toggle-bStudy'));

    await user.click(screen.getByTestId('coach-prefs-toggle-bStudy'));
    await user.click(screen.getByTestId('coach-prefs-save'));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/api/coach/preferences') && c[1]?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
    });
  });
});

// =============================================================================
// Chips de lente no Chat
// =============================================================================
describe('/coach-ai — chips de lente (Mental/Selecao/Tecnico)', () => {
  it('renderiza os 3 chips de lente no Chat', async () => {
    const Hub = await loadHub();
    render(wrap(<Hub />));
    await waitFor(() => screen.getByTestId('coach-lens-chip-mental'));
    expect(screen.getByTestId('coach-lens-chip-mental')).toBeTruthy();
    expect(screen.getByTestId('coach-lens-chip-tournament')).toBeTruthy();
    expect(screen.getByTestId('coach-lens-chip-technical')).toBeTruthy();
  });

  it('clicar no chip Mental faz o coachType passado ao useCoachChat virar "mental"', async () => {
    const user = userEvent.setup();
    const Hub = await loadHub();
    render(wrap(<Hub />));
    await waitFor(() => screen.getByTestId('coach-lens-chip-mental'));

    coachChatCalls.length = 0; // ignora chamada inicial
    await user.click(screen.getByTestId('coach-lens-chip-mental'));
    await waitFor(() => {
      expect(coachChatCalls).toContain('mental');
    });
  });

  it('NAO renderiza 3 abas de "coach" (role=tab name Mental/Torneios/Tecnico) — agora sao chips', async () => {
    const Hub = await loadHub();
    render(wrap(<Hub />));
    await waitFor(() => screen.getByTestId('coach-ai-hub-title'));
    // As 4 tabs do hub sao Chat/Relatorios/Historico/Preferencias — NAO Mental/Torneios/Tecnico.
    const mentalTab = screen.queryByRole('tab', { name: /^Mental$/i });
    const tournamentTab = screen.queryByRole('tab', { name: /^Torneios$/i });
    expect(mentalTab).toBeNull();
    expect(tournamentTab).toBeNull();
  });
});
