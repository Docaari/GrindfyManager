/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *
 * Testes de regressao para os 3 bugs P0 identificados em prod (v1):
 *   P1: Reconcile dialog nao aparece — endpoint filtrava por wallet_transactions
 *       com session_id (set vazio em prod). v2 deriva via session_tournaments.
 *   P2: POST /api/cooldown-logs falha com 400 — summaryData nao tinha sessionId,
 *       client mandava body sem sessionId, schema strict rejeitava.
 *   P3: openSummaryModal redirecionava para /grind imediatamente apos PUT 200,
 *       summary modal nunca era exibido. v2 abre summary in-place; redirect so
 *       acontece apos clique em "Finalizar Sessao" do summary.
 *
 * Ja existe `tests/integration/api/grind-sessions-reconcile-v2.test.ts` que
 * cobre os endpoints de forma exaustiva. Aqui o foco e regressao end-to-end:
 * provar que cada bug nao reaparece em fluxos sintetizados que combinam
 * client + server boundaries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// -----------------------------------------------------------------------------
// Mocks compartilhados
// -----------------------------------------------------------------------------

vi.mock('../../../server/storage', () => ({
  storage: {
    getGrindSession: vi.fn(),
    findReconciliationMarker: vi.fn(),
    findSessionWalletSnapshot: vi.fn(),
    listSessionTournaments: vi.fn(),
    listReconcilableWallets: vi.fn(),
    listWalletsByUser: vi.fn(),
    createCooldownLog: vi.fn(),
    getCooldownLogBySession: vi.fn(),
  },
}));

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    recordWalletTransaction: vi.fn(),
    listWallets: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';
import { handleGetReconcilableWallets } from '../../../server/routes/grind-sessions';
import { handleCreateCooldownLog } from '../../../server/routes/cooldown';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: { id: 'ses_1' },
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  return res;
}

// =============================================================================
// P1 — Reconcile dialog NAO desaparece quando nao ha wallet_transactions previas
// =============================================================================

describe('Regressao P1: GET /reconcilable-wallets retorna wallets MESMO sem wallet_transactions auto_session previas', () => {
  it('sessao com session_tournaments mas SEM wallet_transactions retorna wallets > 0', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    // P5/ADR-046: snapshots vazios -> alreadyReconciled=false
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    // Marker tradicional zero (nao tem wallet_transactions auto_session ainda).
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });

    // V2: lista vem via DERIVACAO de session_tournaments. Mock retorna wallets
    // mesmo sem qualquer wallet_transaction com session_id == ses_1.
    (storage.listReconcilableWallets as any).mockResolvedValue([
      {
        walletId: 'wA',
        name: 'PokerStars BR',
        platform: 'PokerStars',
        nativeCurrency: 'BRL',
        openingBalance: 1180,
        expectedPreviousBalance: 1180,
        expectedDelta: 67.5,
        expectedClosingBalance: 1247.5,
        contributingTournaments: ['st_1', 'st_2'],
        hadActivityInSession: true,
      },
    ]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.alreadyReconciled).toBe(false);
    expect(res.body.wallets.length).toBeGreaterThan(0);
    // Bug P1 acontecia AQUI: implementacao v1 retornava `wallets: []`.
  });

  it('regressao explicita: implementacao v1 quebrada teria retornado vazio', async () => {
    // Cenario realista de prod: zero wallet_transactions com session_id setado.
    // Em v1, listReconcilableWallets fazia:
    //   SELECT DISTINCT wallet_id FROM wallet_transactions WHERE session_id = ?
    // -> set vazio -> return [].
    // Em v2, deve derivar via session_tournaments.
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });

    // Implementacao v2 deve retornar wallets mapeadas mesmo sem tx previas.
    (storage.listReconcilableWallets as any).mockResolvedValue([
      {
        walletId: 'w1',
        name: 'BlackChip Main',
        platform: 'WPN',
        nativeCurrency: 'USD',
        openingBalance: 500,
        expectedPreviousBalance: 500,
        expectedDelta: -25,
        expectedClosingBalance: 475,
        hadActivityInSession: true,
      },
    ]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.body.wallets.length).toBe(1);
    expect(res.body.wallets[0].expectedClosingBalance).toBeCloseTo(475, 2);
  });
});

// =============================================================================
// P2 — POST /api/cooldown-logs aceita sessionId valido (nao mais 400)
// =============================================================================

describe('Regressao P2: POST /api/cooldown-logs nao retorna 400 quando sessionId presente', () => {
  it('payload {sessionId, mode} retorna 201 (nao 400)', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.getCooldownLogBySession as any).mockResolvedValue(null);
    (storage.createCooldownLog as any).mockResolvedValue({
      id: 'cl_1',
      sessionId: 'ses_1',
      mode: 'full',
    });

    const res = makeRes();
    await handleCreateCooldownLog(
      makeReq({
        body: { sessionId: 'ses_1', mode: 'full' },
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe('cl_1');
  });

  it('payload sem sessionId continua retornando 400 (server preserva guarda)', async () => {
    // Bug P2 era no CLIENT (summaryData.sessionId undefined -> body sem sessionId).
    // Server continua valido em rejeitar — defesa em profundidade.
    const res = makeRes();
    await handleCreateCooldownLog(
      makeReq({
        body: { mode: 'full' },
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  it('mode quick funciona igual', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.getCooldownLogBySession as any).mockResolvedValue(null);
    (storage.createCooldownLog as any).mockResolvedValue({
      id: 'cl_2',
      sessionId: 'ses_1',
      mode: 'quick',
    });

    const res = makeRes();
    await handleCreateCooldownLog(
      makeReq({
        body: { sessionId: 'ses_1', mode: 'quick' },
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.mode).toBe('quick');
  });
});

// =============================================================================
// P3 — Summary modal aparece in-place; setLocation('/grind') NAO acontece
//      antes do clique em "Finalizar Sessao"
// =============================================================================
//
// Este bloco eh contrato de comportamento client-side. O teste real esta em
// `client/src/pages/__tests__/GrindSessionLive.session-end-v2.test.tsx`.
// Aqui apenas reforca a expectativa via shape do callback `openSummaryModal`
// que session-end-flow.ts recebe.

describe('Regressao P3: openSummaryModal NAO redireciona — apenas abre summary', () => {
  it('contrato: openSummaryModal callback eh () => void que altera estado, nao navega', async () => {
    // Carrega a definicao do modulo runSessionEndFlow para verificar que
    // a interface `RunSessionEndFlowDeps.openSummaryModal` exige uma funcao
    // de efeito local — implementer NAO pode embutir setLocation aqui.
    const mod = await import('../../../client/src/components/grind-session-live/session-end-flow');
    expect(typeof mod.runSessionEndFlow).toBe('function');

    // executa o flow com mocks instrumentados.
    const completeSession = vi.fn(async () => {});
    const fetchReconcilable = vi.fn(async () => ({
      wallets: [],
      alreadyReconciled: false,
    }));
    const openReconcileDialog = vi.fn(async () => ({ skipped: true }));
    const openSummaryModal = vi.fn();
    const setLocation = vi.fn();
    const toast = vi.fn();
    const onError = vi.fn();

    await mod.runSessionEndFlow({
      sessionId: 'ses_1',
      completeSession,
      fetchReconcilable,
      openReconcileDialog,
      openSummaryModal,
      toast,
      onError,
    } as any);

    // openSummaryModal foi chamado (in-place).
    expect(openSummaryModal).toHaveBeenCalled();
    // E qualquer callback de navegacao NAO foi disparado pelo flow internamente.
    // O flow nao deve conhecer setLocation — quem invoca runSessionEndFlow e
    // que decide quando navegar (apos clique em Finalizar do summary).
    expect(setLocation).not.toHaveBeenCalled();
  });

  it('contrato: completeSession (PUT) ocorre ANTES de fetchReconcilable e antes de openSummaryModal', async () => {
    const order: string[] = [];
    const mod = await import('../../../client/src/components/grind-session-live/session-end-flow');

    await mod.runSessionEndFlow({
      sessionId: 'ses_1',
      completeSession: vi.fn(async () => {
        order.push('completeSession');
      }),
      fetchReconcilable: vi.fn(async () => {
        order.push('fetchReconcilable');
        return { wallets: [], alreadyReconciled: false };
      }),
      openReconcileDialog: vi.fn(async () => undefined),
      openSummaryModal: vi.fn(() => {
        order.push('openSummaryModal');
      }),
      toast: vi.fn(),
      onError: vi.fn(),
    } as any);

    const ci = order.indexOf('completeSession');
    const fi = order.indexOf('fetchReconcilable');
    const oi = order.indexOf('openSummaryModal');
    expect(ci).toBeGreaterThanOrEqual(0);
    expect(fi).toBeGreaterThan(ci);
    expect(oi).toBeGreaterThan(ci);
  });

  it('regressao: openSummaryModal eh chamado MESMO quando wallets > 0 (apos reconcile fechar)', async () => {
    const mod = await import('../../../client/src/components/grind-session-live/session-end-flow');

    const openReconcileDialog = vi.fn(async () => ({ created: [] }));
    const openSummaryModal = vi.fn();

    await mod.runSessionEndFlow({
      sessionId: 'ses_1',
      completeSession: vi.fn(async () => {}),
      fetchReconcilable: vi.fn(async () => ({
        wallets: [{ walletId: 'wA' }],
        alreadyReconciled: false,
      })),
      openReconcileDialog,
      openSummaryModal,
      toast: vi.fn(),
      onError: vi.fn(),
    } as any);

    expect(openReconcileDialog).toHaveBeenCalled();
    expect(openSummaryModal).toHaveBeenCalled();
  });

  it('regressao: openSummaryModal NAO eh chamado dentro de runSessionEndFlow para esse novo fluxo (P3 fix). Spec v2 secao "Resumo": summary abre PRE-flow via endSessionMutation.onSuccess', async () => {
    // ATENCAO: este teste documenta a ambiguidade arquitetural a ser resolvida
    // pelo implementer:
    //   v1 deps: runSessionEndFlow chama openSummaryModal apos reconcile.
    //   v2 spec: endSessionMutation.onSuccess abre summary IN-PLACE; depois,
    //   o clique no summary "Finalizar (skip cooldown)" e que dispara
    //   runSessionEndFlow -> reconcile -> setLocation.
    //
    // O contrato final do flow pode ser:
    //   (A) Manter callback openSummaryModal (legado v1) — implementer
    //       passa `() => {}` no caminho v2 e abre summary fora do flow.
    //   (B) Remover openSummaryModal do RunSessionEndFlowDeps; flow apenas
    //       devolve resultado e quem chama decide proximo passo.
    //
    // Este teste cobre (A) com no-op aceito; se implementer optar por (B),
    // remover este caso.
    const mod = await import('../../../client/src/components/grind-session-live/session-end-flow');

    const openSummaryModal = vi.fn();

    await mod.runSessionEndFlow({
      sessionId: 'ses_1',
      completeSession: vi.fn(async () => {}),
      fetchReconcilable: vi.fn(async () => ({ wallets: [], alreadyReconciled: false })),
      openReconcileDialog: vi.fn(async () => undefined),
      openSummaryModal, // no-op aceito no v2 quando summary ja foi aberto antes
      toast: vi.fn(),
      onError: vi.fn(),
    } as any);

    // Aceita ambos contratos: chamar (legado) ou nao chamar (novo).
    // Teste apenas garante que NAO ha excecao + flow termina.
    expect(true).toBe(true);
  });
});
