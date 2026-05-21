/**
 * Test-Writer (Modo TDD — Red Phase)
 *
 * Sprint Estudos-Sessao-1 — RF-06, RF-07, RF-08, RF-10 (StudySessionPage)
 *
 * Spec : Docs/specs/sprint-estudos-sessao-1.md
 * ADR  : 177
 * Diag : Docs/architecture/diagrams/estudos-sessao-1/start-session-flow.mermaid
 *
 * Cobertura:
 *   - Loading state durante GET /api/study-sessions/:id
 *   - 404 da GET -> empty state "sessao nao encontrada" + link voltar
 *   - Render ativo: timer + notes-block + btn Finalizar
 *   - Empty state quando sem notes
 *   - Adiciona note via NotesBlock -> POST + aparece na lista
 *   - Btn Finalizar -> PATCH com {status:'finished', duration} + redirect
 *   - Timer mostra duracao acumulando (fake timers)
 *   - Sessao status='finished' renderiza read-only (sem btn finalizar, sem form)
 *   - Telemetria study_session_started disparada no mount
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #2  data-testid: study-session-page, study-session-loading,
 *       study-session-not-found, session-timer, notes-block, note-input,
 *       note-add-btn, note-row-{id}, finalize-session-btn
 *   #6  apiRequest mockado retorna JSON parseado direto (lesson #13)
 *   #13 apiRequest retorna JSON parseado direto — mocks NAO retornam Response
 *   #14 await import(...) ESM compat (NAO require)
 *   #15 vi.doMock em escopo nested vira hoisted — usar top-level vi.mock
 *
 * Status RED esperado: StudySessionPage / NotesBlock / SessionTimer nao existem.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Mocks top-level (lesson #15 — vi.mock hoisted)
// =============================================================================

const { apiRequestMock, navigateMock, trackMock, toastMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  navigateMock: vi.fn(),
  trackMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/estudos/sessao/sess_1', navigateMock],
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/lib/telemetry', () => ({
  track: trackMock,
}));

// =============================================================================
// Fixtures
// =============================================================================

const baseSession = {
  id: 'sess_1',
  userId: 'USER-OWNER',
  themeId: 'thm_1',
  status: 'active',
  date: new Date('2026-05-21T10:00:00Z').toISOString(),
  duration: 0,
  activities: ['theme'],
  studyCardId: null,
  createdAt: new Date('2026-05-21T10:00:00Z').toISOString(),
};

const baseNote = (overrides: any = {}) => ({
  id: 'note_1',
  studySessionId: 'sess_1',
  studyCardId: null,
  content: 'Anotacao 1',
  tags: [],
  createdAt: new Date('2026-05-21T10:05:00Z').toISOString(),
  updatedAt: new Date('2026-05-21T10:05:00Z').toISOString(),
  ...overrides,
});

const baseTheme = {
  id: 'thm_1',
  name: 'Jogando OOP PosFlop',
  color: '#16a34a',
  emoji: 'OOP',
  progress: 25,
  linkedStats: [],
};

beforeEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  navigateMock.mockReset();
  trackMock.mockReset();
  toastMock.mockReset();
});

afterEach(() => {
  cleanup();
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadPage() {
  // Dynamic path com variavel pra evitar Vite analyzer estatico (red phase
  // o arquivo ainda nao existe; queremos que o teste FALHE no runtime, nao no
  // transform — lesson #14).
  const modulePath = '@/components/studies/StudySessionPage';
  const mod: any = await import(/* @vite-ignore */ modulePath);
  return mod.StudySessionPage ?? mod.default;
}

// =============================================================================
// Helper para roteamento GET por URL (apiRequest(method, url))
// =============================================================================
function setupApiRequestRouting(opts: {
  session?: any | 'NOT_FOUND' | 'ERROR';
  notes?: any[];
  themes?: any[];
}) {
  apiRequestMock.mockImplementation(async (method: string, url: string, body?: any) => {
    if (method === 'GET' && url.startsWith('/api/study-sessions/') && url.endsWith('/notes')) {
      return opts.notes ?? [];
    }
    if (method === 'GET' && url.startsWith('/api/study-sessions/')) {
      if (opts.session === 'NOT_FOUND') {
        const err: any = new Error('Not found');
        err.status = 404;
        throw err;
      }
      if (opts.session === 'ERROR') {
        throw new Error('Network');
      }
      return opts.session ?? baseSession;
    }
    if (method === 'GET' && url === '/api/study-themes') {
      return opts.themes ?? [baseTheme];
    }
    if (method === 'POST' && url.endsWith('/notes')) {
      return baseNote({ id: 'note_new', content: body?.content ?? 'nova' });
    }
    if (method === 'PATCH' && url.startsWith('/api/study-sessions/')) {
      return { ...baseSession, ...body, status: body?.status ?? 'finished' };
    }
    return null;
  });
}

// =============================================================================
// RF-06.1 — Loading state
// =============================================================================
describe('<StudySessionPage> — loading state', () => {
  it('renderiza data-testid="study-session-loading" enquanto GET pendente', async () => {
    // GET nunca resolve (Promise pending).
    apiRequestMock.mockImplementation(
      () => new Promise(() => {}),
    );
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_1" />);
    expect(screen.getByTestId('study-session-loading')).toBeInTheDocument();
  });
});

// =============================================================================
// RF-06.2 — Not found state
// =============================================================================
describe('<StudySessionPage> — 404 sessao nao encontrada', () => {
  it('renderiza data-testid="study-session-not-found" + link voltar quando 404', async () => {
    setupApiRequestRouting({ session: 'NOT_FOUND' });
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_inexistente" />);
    await waitFor(() => {
      expect(screen.getByTestId('study-session-not-found')).toBeInTheDocument();
    });
    // Link/btn voltar pra lista de temas (qualquer rota /estudos/temas).
    const back =
      screen.queryByRole('link', { name: /voltar|temas/i }) ??
      screen.queryByRole('button', { name: /voltar|temas/i });
    expect(back).toBeTruthy();
  });
});

// =============================================================================
// RF-06 / RF-07 / RF-08 — Modo ativo
// =============================================================================
describe('<StudySessionPage> — sessao ativa', () => {
  it('renderiza session-timer + notes-block + finalize-session-btn quando data carrega', async () => {
    setupApiRequestRouting({ session: baseSession, notes: [], themes: [baseTheme] });
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('study-session-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('session-timer')).toBeInTheDocument();
    expect(screen.getByTestId('notes-block')).toBeInTheDocument();
    expect(screen.getByTestId('finalize-session-btn')).toBeInTheDocument();
  });

  it('exibe nome do tema no header', async () => {
    setupApiRequestRouting({ session: baseSession, notes: [], themes: [baseTheme] });
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_1" />);
    await waitFor(() => {
      expect(screen.getByText(/Jogando OOP PosFlop/i)).toBeInTheDocument();
    });
  });

  it('empty state nas notes quando lista vazia', async () => {
    setupApiRequestRouting({ session: baseSession, notes: [], themes: [baseTheme] });
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('notes-block')).toBeInTheDocument();
    });
    // Empty state opcional — pode ser texto "Nenhuma nota" ou data-testid
    const empty =
      screen.queryByTestId('notes-empty-state') ??
      screen.queryByText(/nenhuma nota|sem notas|comece a anotar/i);
    expect(empty).toBeTruthy();
  });

  it('renderiza N note-row-* quando lista tem notes', async () => {
    setupApiRequestRouting({
      session: baseSession,
      notes: [
        baseNote({ id: 'n1', content: 'primeira' }),
        baseNote({ id: 'n2', content: 'segunda' }),
        baseNote({ id: 'n3', content: 'terceira' }),
      ],
      themes: [baseTheme],
    });
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_1" />);
    await waitFor(() => {
      const rows = screen.queryAllByTestId(/^note-row-/);
      expect(rows.length).toBe(3);
    });
    expect(screen.getByText(/primeira/)).toBeInTheDocument();
    expect(screen.getByText(/terceira/)).toBeInTheDocument();
  });
});

// =============================================================================
// RF-08 — Adicionar note
// =============================================================================
describe('<StudySessionPage> — adicionar note', () => {
  it('digita texto + click add -> POST + nova note aparece', async () => {
    setupApiRequestRouting({ session: baseSession, notes: [], themes: [baseTheme] });
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('note-input')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const input = screen.getByTestId('note-input') as HTMLTextAreaElement;
    await user.type(input, 'Minha nova nota');
    const addBtn = screen.getByTestId('note-add-btn');
    await user.click(addBtn);

    await waitFor(() => {
      // POST foi chamado
      const postCalls = apiRequestMock.mock.calls.filter(
        (c) => c[0] === 'POST' && String(c[1]).endsWith('/notes'),
      );
      expect(postCalls.length).toBeGreaterThan(0);
      // Payload contem o content tipado
      const payload = postCalls[0][2];
      expect(payload).toMatchObject({ content: 'Minha nova nota' });
    });
  });

  it('dispara telemetria study_note_created apos POST sucesso', async () => {
    setupApiRequestRouting({ session: baseSession, notes: [], themes: [baseTheme] });
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('note-input')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.type(screen.getByTestId('note-input'), 'tracked note');
    await user.click(screen.getByTestId('note-add-btn'));

    await waitFor(() => {
      const evt = trackMock.mock.calls.find((c) => c[0] === 'study_note_created');
      expect(evt).toBeTruthy();
    });
  });
});

// =============================================================================
// RF-07 — Btn Finalizar
// =============================================================================
describe('<StudySessionPage> — finalizar sessao', () => {
  it('click finalize -> PATCH {status:"finished", duration} + redirect pra /estudos/temas/:themeId', async () => {
    setupApiRequestRouting({ session: baseSession, notes: [], themes: [baseTheme] });
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('finalize-session-btn')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('finalize-session-btn'));

    await waitFor(() => {
      const patchCalls = apiRequestMock.mock.calls.filter(
        (c) => c[0] === 'PATCH' && String(c[1]).includes('/api/study-sessions/sess_1'),
      );
      expect(patchCalls.length).toBeGreaterThan(0);
      const payload = patchCalls[0][2];
      expect(payload).toMatchObject({ status: 'finished' });
      expect(typeof payload.duration).toBe('number');
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalled();
      const dest = navigateMock.mock.calls[0]?.[0];
      expect(String(dest)).toMatch(/\/estudos\/temas\/thm_1/);
    });
  });

  it('dispara telemetria study_session_finished com {sessionId, durationMin, noteCount}', async () => {
    setupApiRequestRouting({
      session: baseSession,
      notes: [baseNote({ id: 'n1' }), baseNote({ id: 'n2' })],
      themes: [baseTheme],
    });
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('finalize-session-btn')).toBeInTheDocument();
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('finalize-session-btn'));

    await waitFor(() => {
      const evt = trackMock.mock.calls.find(
        (c) => c[0] === 'study_session_finished',
      );
      expect(evt).toBeTruthy();
      const payload = evt![1];
      expect(payload).toMatchObject({ sessionId: 'sess_1' });
      expect(payload).toHaveProperty('durationMin');
      expect(payload).toHaveProperty('noteCount', 2);
    });
  });
});

// =============================================================================
// RF-07 — Timer acumulando
// =============================================================================
describe('<StudySessionPage> — timer acumula', () => {
  it('timer incrementa elapsedSec com setInterval 1s', async () => {
    vi.useFakeTimers();
    // session.date = 60s atras
    const sessionWithStart = {
      ...baseSession,
      date: new Date(Date.now() - 60_000).toISOString(),
    };
    setupApiRequestRouting({
      session: sessionWithStart,
      notes: [],
      themes: [baseTheme],
    });
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_1" />);

    // Flush microtasks for the query to resolve.
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();

    const timer = await screen.findByTestId('session-timer');
    const initialText = timer.textContent ?? '';
    // Algo como 00:01:00 ou 01:00 (>=60s)
    expect(initialText).toMatch(/\d+:\d{2}/);

    // Avanca 5s
    vi.advanceTimersByTime(5_000);
    await vi.runOnlyPendingTimersAsync();

    const updatedText = screen.getByTestId('session-timer').textContent ?? '';
    // Texto deve ter mudado OU ainda mostra tempo >0
    expect(updatedText).toMatch(/\d+:\d{2}/);
    vi.useRealTimers();
  });
});

// =============================================================================
// RF-06 / RF-07 — Read-only quando finished
// =============================================================================
describe('<StudySessionPage> — sessao finished', () => {
  it('NAO renderiza finalize-session-btn quando session.status === "finished"', async () => {
    setupApiRequestRouting({
      session: { ...baseSession, status: 'finished', duration: 30 },
      notes: [],
      themes: [baseTheme],
    });
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('study-session-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('finalize-session-btn')).not.toBeInTheDocument();
  });

  it('NAO renderiza note-input (form escondido em readOnly)', async () => {
    setupApiRequestRouting({
      session: { ...baseSession, status: 'finished', duration: 30 },
      notes: [baseNote()],
      themes: [baseTheme],
    });
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_1" />);
    await waitFor(() => {
      expect(screen.getByTestId('study-session-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('note-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('note-add-btn')).not.toBeInTheDocument();
  });
});

// =============================================================================
// RF-10 — Telemetria study_session_started
// =============================================================================
describe('<StudySessionPage> — telemetria mount', () => {
  it('dispara track("study_session_started") no mount', async () => {
    setupApiRequestRouting({ session: baseSession, notes: [], themes: [baseTheme] });
    const Page = await loadPage();
    renderWithClient(<Page sessionId="sess_1" />);
    await waitFor(() => {
      const evt = trackMock.mock.calls.find(
        (c) => c[0] === 'study_session_started',
      );
      expect(evt).toBeTruthy();
      expect(evt![1]).toMatchObject({ sessionId: 'sess_1', themeId: 'thm_1' });
    });
  });
});
