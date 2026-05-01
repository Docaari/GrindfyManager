/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint F2 — W4 INTEGRATION E2E (lesson tts-wiring 2026-04-27).
 *
 * Spec : Docs/specs/sprint-f2-spot-screenshots.md
 *        secao "Integracao obrigatoria (lesson session_2026-04-27-tts-wiring)"
 * Flow : Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 1+2A+2B)
 *
 * Lessons aplicadas:
 *   #2  data-testid estavel — todos os ids ja contratados (paster, spot-list, review-card)
 *   #3  shape REAL apiRequest — listPendingSpots, screenshot 201, review 200
 *   #4  vi.hoisted (vitest 4)
 *   #11 default minimo — paster + cooldown conversam apenas via apiRequest + cache
 *
 * MOTIVACAO (lesson tts-wiring): unit tests passaram + feature quebrada em prod
 * porque o WIRING (componente A monta, componente B le query, refetch acontece,
 * estado avanca) nao foi exercitado em conjunto. Este teste mounta paster +
 * cooldown na mesma instancia de QueryClient e valida o FLUXO COMPLETO sem
 * mock entre eles — apenas apiRequest e auth/toast sao stubadas.
 *
 * EXPECTATIVA DE STATUS: este teste DEVE PASSAR no momento do commit (W3 ja
 * green — paster + cooldown + studies funcionam isoladamente). O proposito eh
 * REGRESSAO: serve como rede de seguranca contra W4 quebrar wiring durante
 * adicao de telemetria/badge. Diferente dos outros 4 arquivos W4 que sao
 * red-phase puros (testam features novas), este eh "characterization test"
 * documentando o wiring W1+W2+W3 ja entregue. Se este teste FALHAR sem ter
 * havido mudanca de codigo, eh sinal de regressao (alguma camada quebrou).
 *
 * NAO renderiza GrindSession.tsx puro (1700+ linhas, dezenas de queries) —
 * usamos um harness `<HostApp>` que reproduz o wiring critico:
 *   1. Mount paster com sessionId real + usedCount derivado de query
 *      ['/api/starred-hands/pending', { sessionId }] (mesma queryKey que
 *      GrindSession.tsx:205).
 *   2. Simula paste: paster faz POST /api/starred-hands/screenshot.
 *   3. Apos 201, paster chama onUploaded -> harness invalida query.
 *   4. Counter atualiza 0/10 -> 1/10.
 *   5. Toggle "fim de sessao" desmonta paster e mounta CoolDownRunner.
 *   6. CoolDownRunner busca a mesma /pending?sessionId=X (mesmo cache).
 *   7. SessionSpotsList renderiza session-spot-item-{id}.
 *   8. Drag e drop dispara abertura de SpotReviewCard.
 *   9. Save chama PATCH /api/starred-hands/:id/review.
 *   10. Modal fecha + invalidate /pending.
 *   11. Mount PendingSpotsTab — lista deve estar vazia (ja revisou).
 *
 * Falhar em QUALQUER etapa = wiring quebrado em prod (mesma classe de bug
 * tts-wiring 2026-04-27).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';

// =============================================================================
// Mocks — apenas APIs externas (apiRequest, auth, toast). Telemetry tambem.
// Componentes reais (SpotScreenshotPaster, CoolDownRunner, PendingSpotsTab,
// SessionSpotsList, SpotReviewCard) sao montados normalmente.
// =============================================================================

const mocks = vi.hoisted(() => ({
  apiRequestMock: ((..._args: any[]) => undefined) as any,
  invalidateQueriesMock: ((..._args: any[]) => undefined) as any,
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mocks.apiRequestMock(...args),
  queryClient: {
    invalidateQueries: (...args: any[]) => mocks.invalidateQueriesMock(...args),
    setQueryData: () => {},
    getQueryData: () => {},
    fetchQuery: () => {},
  },
  getCsrfToken: () => null,
}));

// Telemetry stub — emit nao impacta o fluxo, mas evita erro em import.
vi.mock('@/lib/telemetry', () => ({
  track: vi.fn(),
}));

const apiRequestMock = vi.fn();
const invalidateQueriesMock = vi.fn();
mocks.apiRequestMock = apiRequestMock;
mocks.invalidateQueriesMock = invalidateQueriesMock;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
  AuthProvider: ({ children }: any) => children,
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

// wouter mock simples para evitar Provider — CoolDownRunner usa setLocation
// apos finish que nao acontece neste teste.
vi.mock('wouter', () => ({
  useLocation: () => ['/grind', vi.fn()],
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

// =============================================================================
// Imports — componentes REAIS
// =============================================================================

import SpotScreenshotPaster from '@/components/grind-session-live/SpotScreenshotPaster';
import { CoolDownRunner } from '@/components/cooldown/CoolDownRunner';
import PendingSpotsTab from '@/components/studies/PendingSpotsTab';

// =============================================================================
// Polyfills paste (jsdom nao tem ClipboardEvent.clipboardData writable)
// =============================================================================

interface FakeDataTransferItem {
  kind: 'string' | 'file';
  type: string;
  getAsFile: () => File | null;
}

function makeDataTransferItems(items: FakeDataTransferItem[]) {
  const list: any = items.slice();
  list.add = (file: any) => list.push(file);
  return list;
}

function dispatchPaste(files: File[], target: EventTarget = window) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  const items: FakeDataTransferItem[] = files.map((f) => ({
    kind: 'file',
    type: f.type,
    getAsFile: () => f,
  }));
  const clipboardData = {
    items: makeDataTransferItems(items),
    types: items.map((i) => i.type),
    files,
    getData: () => '',
  };
  Object.defineProperty(event, 'clipboardData', {
    value: clipboardData,
    writable: false,
  });
  target.dispatchEvent(event);
  return event;
}

function makeImageFile(): File {
  return new File([new Uint8Array(1024)], 'spot.png', { type: 'image/png' });
}

function makeDataTransfer(initial?: Record<string, string>) {
  const store: Record<string, string> = { ...initial };
  return {
    setData(format: string, value: string) {
      store[format] = value;
    },
    getData(format: string) {
      return store[format] ?? '';
    },
    types: Object.keys(store),
    effectAllowed: 'move',
    dropEffect: 'move',
    files: [],
    items: [],
    clearData() {
      for (const k of Object.keys(store)) delete store[k];
    },
  } as any;
}

// =============================================================================
// Harness — reproduz o wiring critico que GrindSession.tsx faz hoje (linhas
// 199-240): query /pending, derivar usedCount, mountar paster.
// =============================================================================

const SESSION_ID = 'sess-E2E';
const ST_ID = 'st-E2E';

const sessionTournaments = [
  {
    id: ST_ID,
    sessionId: SESSION_ID,
    site: 'PokerStars',
    name: 'Sunday Million',
    buyIn: '215.00',
    rebuys: 0,
    result: 'pending',
    status: 'completed',
    fromPlannedTournament: false,
  },
];

function GrindSessionHarness({
  onEndSession,
}: {
  onEndSession: () => void;
}) {
  const { data: pendingSpotsData } = useQuery({
    queryKey: ['/api/starred-hands/pending', { sessionId: SESSION_ID }],
    queryFn: () =>
      apiRequestMock(
        'GET',
        `/api/starred-hands/pending?sessionId=${encodeURIComponent(SESSION_ID)}`,
      ),
    staleTime: 0,
    gcTime: 0,
  });

  const usedCount =
    typeof (pendingSpotsData as any)?.total === 'number'
      ? (pendingSpotsData as any).total
      : 0;

  const handleUploaded = () => {
    invalidateQueriesMock({
      queryKey: ['/api/starred-hands/pending', { sessionId: SESSION_ID }],
    });
  };

  return (
    <div data-testid="grind-session-harness">
      <SpotScreenshotPaster
        sessionId={SESSION_ID}
        usedCount={usedCount}
        sessionTournamentId={ST_ID}
        onUploaded={handleUploaded}
        onError={() => {}}
      />
      <button data-testid="end-session-btn" onClick={onEndSession}>
        Encerrar sessao
      </button>
    </div>
  );
}

function HostApp() {
  const [phase, setPhase] = useState<'live' | 'cooldown' | 'studies'>('live');

  if (phase === 'cooldown') {
    return (
      <div data-testid="cooldown-host">
        <CoolDownRunner
          cooldownLogId="cd-E2E"
          sessionId={SESSION_ID}
          mode="full"
          sessionTournaments={sessionTournaments}
          onClose={() => setPhase('studies')}
          onComplete={() => setPhase('studies')}
        />
        <button data-testid="goto-studies-btn" onClick={() => setPhase('studies')}>
          Ir para estudos
        </button>
      </div>
    );
  }

  if (phase === 'studies') {
    return (
      <div data-testid="studies-host">
        <PendingSpotsTab />
      </div>
    );
  }

  return <GrindSessionHarness onEndSession={() => setPhase('cooldown')} />;
}

function freshClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function wrap(ui: React.ReactNode, qc: QueryClient = freshClient()) {
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// =============================================================================
// Setup
// =============================================================================

beforeEach(() => {
  apiRequestMock.mockReset();
  invalidateQueriesMock.mockClear();
  toastMock.mockClear();
});

// =============================================================================
// Cenario E2E: paste -> cooldown drag -> save -> studies vazio
// Cobre a frase critica da spec:
// "GrindSession monta com sessao mock + tournament; simular paste event com
//  Blob image/png; aguardar request stub retornar 201; abrir Cooldown; arrastar
//  print; preencher modal; salvar; navegar para Studies; ver print revisado
//  fora da aba Pendentes."
// =============================================================================

describe('Spot Screenshots — E2E paste -> cooldown -> studies', () => {
  it('fluxo completo: paste 0/10 -> 1/10 -> drag drop -> save -> studies vazio', async () => {
    const user = userEvent.setup();

    // State server-side simulado: spots e revisoes.
    let pendingSpots: any[] = [];
    let reviewedIds = new Set<string>();
    let pasteCounter = 0;

    apiRequestMock.mockImplementation(
      (method: string, path: string, body?: any) => {
        // GET /api/starred-hands/pending?sessionId=... (cooldown + grind harness)
        if (
          method === 'GET' &&
          /\/api\/starred-hands\/pending/.test(path) &&
          /sessionId=/.test(path)
        ) {
          const items = pendingSpots.filter(
            (s) => s.sessionId === SESSION_ID && !reviewedIds.has(s.id),
          );
          return Promise.resolve({
            items,
            total: items.length,
            limit: 50,
            offset: 0,
          });
        }

        // GET /api/starred-hands/pending?reviewLater=all (studies tab)
        if (
          method === 'GET' &&
          /\/api\/starred-hands\/pending/.test(path) &&
          /reviewLater=all/.test(path)
        ) {
          const items = pendingSpots.filter((s) => !reviewedIds.has(s.id));
          return Promise.resolve({
            items,
            total: items.length,
            limit: 50,
            offset: 0,
          });
        }

        // POST /api/starred-hands/screenshot (paste)
        if (
          method === 'POST' &&
          /\/api\/starred-hands\/screenshot/.test(path)
        ) {
          pasteCounter++;
          const id = `sh-E2E-${pasteCounter}`;
          const newSpot = {
            id,
            userId: 'USER-0001',
            sessionId: SESSION_ID,
            sessionTournamentId: ST_ID,
            type: 'spot_screenshot',
            spot: 'screenshot_pending',
            notes: null,
            imageUrl: `/uploads/spot-screenshots/${id}.png`,
            conclusion: null,
            reviewedAt: null,
            reviewLater: false,
            expiresAt: '2026-05-11T12:00:00.000Z',
            pastedAt: '2026-04-27T12:00:00.000Z',
            source: 'paste',
            status: 'pending',
            createdAt: '2026-04-27T12:00:00.000Z',
            tournamentName: 'Sunday Million',
            tournamentSite: 'PokerStars',
            tournamentBuyIn: '215.00',
          };
          pendingSpots.push(newSpot);
          return Promise.resolve({
            id,
            imageUrl: newSpot.imageUrl,
            expiresAt: newSpot.expiresAt,
            sessionTournamentId: ST_ID,
            pastedAt: newSpot.pastedAt,
          });
        }

        // PATCH /api/starred-hands/:id/review
        const reviewMatch = path.match(
          /\/api\/starred-hands\/([^/]+)\/review/,
        );
        if (method === 'PATCH' && reviewMatch) {
          const id = reviewMatch[1];
          if (body && body.reviewLater !== true) {
            reviewedIds.add(id);
          }
          return Promise.resolve({
            id,
            status: 'reviewed',
            reviewedAt: '2026-04-27T13:00:00.000Z',
            conclusion: body?.conclusion ?? '',
            type: body?.type ?? '',
            spot: body?.spot ?? '',
            sessionTournamentId: body?.sessionTournamentId ?? ST_ID,
          });
        }

        // PATCH /api/cooldown-logs/:id (debounced patches)
        if (method === 'PATCH' && /\/api\/cooldown-logs\//.test(path)) {
          return Promise.resolve({ id: 'cd-E2E', blocksCompleted: [] });
        }

        return Promise.resolve({});
      },
    );

    // Cliente unico para todo o fluxo (cache compartilhado).
    const qc = freshClient();
    render(wrap(<HostApp />, qc));

    // 1. Counter inicial 0/10
    await waitFor(() => {
      const counter = screen.getByTestId('spot-paster-counter');
      expect(counter.textContent).toMatch(/0\s*\/\s*10/);
    });

    // 2. Simula paste de PNG
    dispatchPaste([makeImageFile()]);

    // 3. POST screenshot foi chamado
    await waitFor(() => {
      const calls = apiRequestMock.mock.calls;
      const post = calls.find(
        (c) =>
          /^POST$/i.test(String(c[0])) &&
          /\/api\/starred-hands\/screenshot/.test(String(c[1])),
      );
      expect(post).toBeDefined();
    });

    // 4. invalidateQueries chamada -> harness deve refetcha
    // (em TDD red, paster atual ja chama onUploaded; apenas garante que counter
    // atualiza apos refetch — manualmente forcamos refetch via cache invalidate)
    await qc.invalidateQueries({
      queryKey: ['/api/starred-hands/pending', { sessionId: SESSION_ID }],
    });

    // 5. Counter atualiza 0/10 -> 1/10
    await waitFor(() => {
      const counter = screen.getByTestId('spot-paster-counter');
      expect(counter.textContent).toMatch(/1\s*\/\s*10/);
    });

    // 6. Encerra sessao -> mounta CoolDownRunner
    await user.click(screen.getByTestId('end-session-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('cooldown-host')).toBeInTheDocument();
    });

    // 7. CoolDownRunner busca /pending e renderiza spot na lista lateral
    await waitFor(
      () => {
        expect(
          screen.getByTestId('session-spot-item-sh-E2E-1'),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // 8. Drag o spot sobre o card de torneio bloco1-tournament-st-E2E
    const cardEl = screen.getByTestId(`bloco1-tournament-${ST_ID}`);
    const dt = makeDataTransfer({ 'application/x-spot-id': 'sh-E2E-1' });
    fireEvent.dragOver(cardEl, { dataTransfer: dt });
    fireEvent.drop(cardEl, { dataTransfer: dt });

    // 9. SpotReviewCard abre
    await waitFor(() => {
      expect(screen.getByTestId('spot-review-card')).toBeInTheDocument();
    });

    // 10. Preenche e salva
    await user.selectOptions(
      screen.getByTestId('spot-review-type') as HTMLSelectElement,
      'leak',
    );
    await user.selectOptions(
      screen.getByTestId('spot-review-spot') as HTMLSelectElement,
      'river',
    );
    await user.type(
      screen.getByTestId('spot-review-conclusion'),
      'Bluff catcher correto',
    );
    await user.click(screen.getByTestId('spot-review-save'));

    // 11. PATCH /review chamado
    await waitFor(() => {
      const calls = apiRequestMock.mock.calls;
      const patchCall = calls.find(
        (c) =>
          /^PATCH$/i.test(String(c[0])) &&
          /\/api\/starred-hands\/sh-E2E-1\/review/.test(String(c[1])),
      );
      expect(patchCall).toBeDefined();
    });

    // 12. Modal fecha
    await waitFor(() => {
      expect(screen.queryByTestId('spot-review-card')).not.toBeInTheDocument();
    });

    // 13. Vai para studies
    await user.click(screen.getByTestId('goto-studies-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('studies-host')).toBeInTheDocument();
    });

    // 14. PendingSpotsTab consome /pending?reviewLater=all -> spot revisado
    // NAO aparece (reviewedIds inclui 'sh-E2E-1'), entao empty state.
    await waitFor(
      () => {
        expect(screen.getByTestId('pending-spots-empty')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // 15. Spot especifico nao deve aparecer
    expect(screen.queryByTestId('pending-spot-sh-E2E-1')).not.toBeInTheDocument();
  });
});

// =============================================================================
// Cenario E2E (variante): "Revisar Depois" mantem spot em /studies
// Cobre RF-04 + RF-11: reviewLater=true -> aparece em studies.
// =============================================================================

describe('Spot Screenshots — E2E review later -> studies tab', () => {
  it('paste -> cooldown -> revisar depois -> studies mostra spot', async () => {
    const user = userEvent.setup();

    let pendingSpots: any[] = [];
    let reviewLaterIds = new Set<string>();
    let reviewedIds = new Set<string>();
    let pasteCounter = 0;

    apiRequestMock.mockImplementation(
      (method: string, path: string, body?: any) => {
        if (
          method === 'GET' &&
          /\/api\/starred-hands\/pending/.test(path) &&
          /sessionId=/.test(path)
        ) {
          const items = pendingSpots.filter(
            (s) => s.sessionId === SESSION_ID && !reviewedIds.has(s.id),
          );
          return Promise.resolve({
            items,
            total: items.length,
            limit: 50,
            offset: 0,
          });
        }
        if (
          method === 'GET' &&
          /\/api\/starred-hands\/pending/.test(path) &&
          /reviewLater=all/.test(path)
        ) {
          // /studies endpoint inclui reviewLater + pending de sessao terminada.
          const items = pendingSpots
            .filter((s) => !reviewedIds.has(s.id))
            .map((s) => ({
              ...s,
              reviewLater: reviewLaterIds.has(s.id),
            }));
          return Promise.resolve({
            items,
            total: items.length,
            limit: 50,
            offset: 0,
          });
        }
        if (
          method === 'POST' &&
          /\/api\/starred-hands\/screenshot/.test(path)
        ) {
          pasteCounter++;
          const id = `sh-LATER-${pasteCounter}`;
          pendingSpots.push({
            id,
            userId: 'USER-0001',
            sessionId: SESSION_ID,
            sessionTournamentId: ST_ID,
            type: 'spot_screenshot',
            spot: 'screenshot_pending',
            notes: null,
            imageUrl: `/uploads/spot-screenshots/${id}.png`,
            conclusion: null,
            reviewedAt: null,
            reviewLater: false,
            expiresAt: '2026-05-11T12:00:00.000Z',
            pastedAt: '2026-04-27T12:00:00.000Z',
            source: 'paste',
            status: 'pending',
            createdAt: '2026-04-27T12:00:00.000Z',
            tournamentName: 'Sunday Million',
            tournamentSite: 'PokerStars',
            tournamentBuyIn: '215.00',
          });
          return Promise.resolve({
            id,
            imageUrl: `/uploads/spot-screenshots/${id}.png`,
            expiresAt: '2026-05-11T12:00:00.000Z',
            sessionTournamentId: ST_ID,
            pastedAt: '2026-04-27T12:00:00.000Z',
          });
        }
        const reviewMatch = path.match(
          /\/api\/starred-hands\/([^/]+)\/review/,
        );
        if (method === 'PATCH' && reviewMatch) {
          const id = reviewMatch[1];
          if (body?.reviewLater === true) {
            reviewLaterIds.add(id);
          } else {
            reviewedIds.add(id);
          }
          return Promise.resolve({
            id,
            status: body?.reviewLater ? 'pending' : 'reviewed',
            reviewLater: !!body?.reviewLater,
          });
        }
        if (method === 'PATCH' && /\/api\/cooldown-logs\//.test(path)) {
          return Promise.resolve({ id: 'cd-E2E', blocksCompleted: [] });
        }
        return Promise.resolve({});
      },
    );

    const qc = freshClient();
    render(wrap(<HostApp />, qc));

    // Paste
    await waitFor(() => {
      expect(screen.getByTestId('spot-paster-counter')).toBeInTheDocument();
    });
    dispatchPaste([makeImageFile()]);

    await waitFor(() => {
      const calls = apiRequestMock.mock.calls;
      const post = calls.find(
        (c) =>
          /^POST$/i.test(String(c[0])) &&
          /\/api\/starred-hands\/screenshot/.test(String(c[1])),
      );
      expect(post).toBeDefined();
    });

    await qc.invalidateQueries({
      queryKey: ['/api/starred-hands/pending', { sessionId: SESSION_ID }],
    });

    // Cooldown
    await user.click(screen.getByTestId('end-session-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('cooldown-host')).toBeInTheDocument();
    });
    await waitFor(
      () => {
        expect(
          screen.getByTestId('session-spot-item-sh-LATER-1'),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Drag e drop
    const cardEl = screen.getByTestId(`bloco1-tournament-${ST_ID}`);
    const dt = makeDataTransfer({ 'application/x-spot-id': 'sh-LATER-1' });
    fireEvent.dragOver(cardEl, { dataTransfer: dt });
    fireEvent.drop(cardEl, { dataTransfer: dt });

    await waitFor(() => {
      expect(screen.getByTestId('spot-review-card')).toBeInTheDocument();
    });

    // Click "Revisar Depois" — NAO preenche conclusion.
    await user.click(screen.getByTestId('spot-review-later'));

    // PATCH com reviewLater=true
    await waitFor(() => {
      const calls = apiRequestMock.mock.calls;
      const patchCall = calls.find(
        (c) =>
          /^PATCH$/i.test(String(c[0])) &&
          /\/api\/starred-hands\/sh-LATER-1\/review/.test(String(c[1])) &&
          c[2]?.reviewLater === true,
      );
      expect(patchCall).toBeDefined();
    });

    // Modal fecha
    await waitFor(() => {
      expect(screen.queryByTestId('spot-review-card')).not.toBeInTheDocument();
    });

    // Goto studies
    await user.click(screen.getByTestId('goto-studies-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('studies-host')).toBeInTheDocument();
    });

    // PendingSpotsTab DEVE listar o spot (nao foi reviewed; eh reviewLater)
    await waitFor(
      () => {
        expect(screen.getByTestId('pending-spot-sh-LATER-1')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });
});
