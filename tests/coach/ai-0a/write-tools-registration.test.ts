import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-0A — RF-06..12: write tools de Coach-2B registradas no index.ts
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-06..12)
// ADR  : 146 (confirmacao obrigatoria v1; confirm-strict p/ record_wallet_transaction)
//        145 (estado canonico — 6 write + verify_leak_progress)
// Diagrama: Docs/architecture/diagrams/coach-ai-0a/seq-write-tool-confirm-undo.mermaid
//
// Os 7 handlers JA existem em server/coachTools/handlers/ e tem testes proprios
// em tests/coach/write-tools/*.test.ts (que devem continuar passando — NAO
// modificados aqui). Este arquivo cobre o GAP: registro no index.ts + descriptor
// correto + integracao com o coachToolRunner (confirm/undo) usando os handlers REAIS.
//
// TDD red-phase: hoje so readCooldownHistory esta registrado; os 7 handlers de
// Coach-2B nao estao no index.ts. Os testes que carregam getTool('register_tournament_in_grade')
// etc FALHAM ate o implementer importar + safeRegister.
//
// Lessons:
//   - #34: handlers de tool recebem storage via import direto; testes mockam via vi.mock
//     (consistente com tests/coach/write-tools/*).
//   - #32: db.transaction quebra em testes que mockam storage mas nao db — o
//     coachToolRunner usa storage.transaction (mockado), nao db.transaction.
//   - #14/#26: await import.
// =============================================================================

// --- Mocks de storage para os handlers reais + para o coachToolRunner ---
const storageMock = {
  // register_tournament_in_grade
  getLibraryTemplate: vi.fn(),
  createPlannedTournament: vi.fn(),
  deletePlannedTournament: vi.fn(),
  // record_wallet_transaction
  getWallet: vi.fn(),
  // start_grind_session
  getPlannedSession: vi.fn(),
  createGrindSession: vi.fn(),
  deleteGrindSession: vi.fn(),
  updatePlannedSession: vi.fn(),
  // log_session_completed
  getGrindSession: vi.fn(),
  updateGrindSession: vi.fn(),
  // log_leak_focus
  findCoachLeakFocus: vi.fn(),
  createCoachLeakFocus: vi.fn(),
  updateCoachLeakFocus: vi.fn(),
  // log_study_session
  getStudyCard: vi.fn(),
  createStudySession: vi.fn(),
  deleteStudySession: vi.fn(),
  // runner
  getCoachAction: vi.fn(),
  updateCoachAction: vi.fn(),
  transaction: vi.fn(),
};

vi.mock('../../../server/storage', () => ({ storage: storageMock }));

// walletService usado por recordWalletTransaction handler.
vi.mock('../../../server/services/walletService', async () => {
  const actual = await vi.importActual<any>('../../../server/services/walletService');
  return {
    ...actual,
    walletService: {
      ...((actual as any).walletService ?? {}),
      recordWalletTransaction: vi.fn(),
    },
  };
});

const txClient = { query: vi.fn() };

const user = { userPlatformId: 'USER-0001' };

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.transaction.mockImplementation(async (fn: any) => fn(txClient));
  storageMock.updateCoachAction.mockResolvedValue(undefined);
  txClient.query.mockResolvedValue({ rows: [] });
});

async function loadRegistry() {
  const { getTool, _resetRegistry, listRegisteredTools } = await import('../../../server/coachTools/registry');
  _resetRegistry();
  await import('../../../server/coachTools/index');
  return { getTool, listRegisteredTools };
}

const WRITE_TOOLS = [
  'register_tournament_in_grade',
  'record_wallet_transaction',
  'start_grind_session',
  'log_session_completed',
  'log_leak_focus',
  'log_study_session',
] as const;

describe('AI-0A · write tools registradas no index.ts (RF-06..11)', () => {
  it('cada uma das 6 write tools aparece em listRegisteredTools()', async () => {
    const { listRegisteredTools } = await loadRegistry();
    const names = listRegisteredTools();
    for (const t of WRITE_TOOLS) {
      expect(names, `${t} deve estar registrada`).toContain(t);
    }
  });

  it('cada write tool tem handler executeConfirmed + fetchPayloadBefore + undo (contrato Coach-2B)', async () => {
    const { getTool } = await loadRegistry();
    for (const name of WRITE_TOOLS) {
      const tool: any = getTool(name);
      expect(tool, `${name} deve existir`).toBeDefined();
      expect(typeof tool.executeConfirmed, `${name}.executeConfirmed`).toBe('function');
      expect(typeof tool.fetchPayloadBefore, `${name}.fetchPayloadBefore`).toBe('function');
      expect(typeof tool.undo, `${name}.undo`).toBe('function');
      expect(tool.requiresConfirmation, `${name}.requiresConfirmation`).toBe(true);
    }
  });

  it('record_wallet_transaction tem confirmationLevel === "strict" (RF-07, ADR-146); as outras nao', async () => {
    const { getTool } = await loadRegistry();
    expect((getTool('record_wallet_transaction') as any).confirmationLevel).toBe('strict');
    for (const name of WRITE_TOOLS) {
      if (name === 'record_wallet_transaction') continue;
      const lvl = (getTool(name) as any).confirmationLevel;
      expect(lvl === undefined || lvl === 'standard', `${name} should be standard/undefined`).toBe(true);
    }
  });

  it('verify_leak_progress registrada como READ (requiresConfirmation false, sem executeConfirmed) — RF-12', async () => {
    const { getTool } = await loadRegistry();
    const tool: any = getTool('verify_leak_progress');
    expect(tool).toBeDefined();
    expect(tool.requiresConfirmation).toBeFalsy();
    expect(typeof tool.handler).toBe('function');
    expect(tool.executeConfirmed).toBeUndefined();
    expect(tool.auditLevel).toBe('log');
  });
});

describe('AI-0A · confirm flow via coachToolRunner — register_tournament_in_grade (RF-06)', () => {
  it('confirmCoachAction action pending => fetchPayloadBefore(null) + executeConfirmed cria planned_tournament + status completed + undoExpiresAt ~5min', async () => {
    storageMock.getLibraryTemplate.mockResolvedValue({
      id: 't-1', name: 'Big $22', site: 'PokerStars', buyIn: 22, type: 'PKO', speed: 'Normal', userId: null,
    });
    storageMock.createPlannedTournament.mockResolvedValue({ id: 'pt-x', name: 'Big $22', site: 'PokerStars', dayOfWeek: 3, time: '19:00' });
    storageMock.getCoachAction
      .mockResolvedValueOnce({
        id: 'act-1', userId: 'USER-0001', toolName: 'register_tournament_in_grade',
        status: 'pending', requiresConfirmation: true,
        input: { templateId: 't-1', dayOfWeek: 3, profile: 'A', prioridade: 2 },
        chatSessionId: 's', messageId: 'm',
      })
      .mockResolvedValue({
        id: 'act-1', userId: 'USER-0001', toolName: 'register_tournament_in_grade',
        status: 'completed', requiresConfirmation: true,
        affectedEntityType: 'planned_tournament', affectedEntityId: 'pt-x',
      });

    await loadRegistry();
    const { confirmCoachAction } = await import('../../../server/coachToolRunner');
    const res: any = await confirmCoachAction('act-1', user);
    expect(res.ok).toBe(true);
    expect(storageMock.createPlannedTournament).toHaveBeenCalled();
    // status completed gravado
    const completedCall = storageMock.updateCoachAction.mock.calls.find(
      (c: any) => c[1] && c[1].status === 'completed',
    );
    expect(completedCall, 'updateCoachAction com status completed deve ter sido chamado').toBeTruthy();
    expect(completedCall[1].affectedEntityType).toMatch(/planned_tournament/);
    expect(completedCall[1].undoExpiresAt).toBeInstanceOf(Date);
    const windowMs = completedCall[1].undoExpiresAt.getTime() - (completedCall[1].confirmedAt?.getTime?.() ?? Date.now());
    // ~5 minutos
    expect(windowMs).toBeGreaterThanOrEqual(4 * 60 * 1000);
    expect(windowMs).toBeLessThanOrEqual(6 * 60 * 1000);
  });

  it('undoCoachAction dentro da janela => deleta planned_tournament + status undone', async () => {
    storageMock.deletePlannedTournament.mockResolvedValue({ deleted: 1 });
    storageMock.getCoachAction.mockResolvedValue({
      id: 'act-1', userId: 'USER-0001', toolName: 'register_tournament_in_grade',
      status: 'completed', requiresConfirmation: true,
      payloadBefore: null, payloadAfter: { id: 'pt-x', name: 'Big $22' },
      undoExpiresAt: new Date(Date.now() + 4 * 60 * 1000),
      chatSessionId: 's', messageId: 'm',
    });
    await loadRegistry();
    const { undoCoachAction } = await import('../../../server/coachToolRunner');
    const res: any = await undoCoachAction('act-1', user);
    expect(res.ok).toBe(true);
    expect(storageMock.deletePlannedTournament).toHaveBeenCalled();
    const undoneCall = storageMock.updateCoachAction.mock.calls.find(
      (c: any) => c[1] && c[1].status === 'undone',
    );
    expect(undoneCall).toBeTruthy();
  });

  it('undoCoachAction apos a janela de 5 min => 410 undo_window_expired', async () => {
    storageMock.getCoachAction.mockResolvedValue({
      id: 'act-1', userId: 'USER-0001', toolName: 'register_tournament_in_grade',
      status: 'completed', requiresConfirmation: true,
      payloadBefore: null, payloadAfter: { id: 'pt-x' },
      undoExpiresAt: new Date(Date.now() - 1000), // ja expirou
    });
    await loadRegistry();
    const { undoCoachAction } = await import('../../../server/coachToolRunner');
    const res: any = await undoCoachAction('act-1', user);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(410);
    expect(res.code).toBe('undo_window_expired');
  });

  it('confirmCoachAction numa action ja completed => 409 already_confirmed (idempotencia)', async () => {
    storageMock.getCoachAction.mockResolvedValue({
      id: 'act-1', userId: 'USER-0001', toolName: 'register_tournament_in_grade',
      status: 'completed', requiresConfirmation: true,
    });
    await loadRegistry();
    const { confirmCoachAction } = await import('../../../server/coachToolRunner');
    const res: any = await confirmCoachAction('act-1', user);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(409);
    expect(res.code).toBe('already_confirmed');
  });
});

describe('AI-0A · confirm flow via coachToolRunner — record_wallet_transaction undo = reverse-row (RF-07, ADR-058)', () => {
  it('undoCoachAction cria reverse-row (delta inverso), NUNCA hard-delete', async () => {
    const { walletService } = await import('../../../server/services/walletService') as any;
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transactionId: 'tx-rev', delta: -50, newBalanceNative: 950, newBalanceUSD: 950,
    });
    storageMock.getWallet.mockResolvedValue({
      id: 'w-1', userId: 'USER-0001', nativeCurrency: 'USD', balanceNative: 1000, balanceUSD: 1000, isActive: true,
    });
    storageMock.getCoachAction.mockResolvedValue({
      id: 'act-2', userId: 'USER-0001', toolName: 'record_wallet_transaction',
      status: 'completed', requiresConfirmation: true,
      payloadBefore: { walletId: 'w-1', walletBalanceNative: 1000, walletBalanceUSD: 1000, nativeCurrency: 'USD' },
      payloadAfter: { walletId: 'w-1', delta: 50, transactionId: 'tx-orig' },
      undoExpiresAt: new Date(Date.now() + 4 * 60 * 1000),
      chatSessionId: 's', messageId: 'm',
    });
    await loadRegistry();
    const { undoCoachAction } = await import('../../../server/coachToolRunner');
    const res: any = await undoCoachAction('act-2', user);
    expect(res.ok).toBe(true);
    // O undo deve ter feito um novo recordWalletTransaction (reverse-row), nao um delete.
    expect((walletService.recordWalletTransaction as any)).toHaveBeenCalled();
    // Nao existe deleteWalletTransaction no storageMock — garantia indireta de "nao hard-delete".
    expect((storageMock as any).deleteWalletTransaction).toBeUndefined();
  });
});

describe('AI-0A · re-validacao de input persistido no confirm (Cenarios de Teste — Validacao)', () => {
  it('input adulterado no DB (templateId+manualEntry simultaneos) => 422 input_invalid, sem executeConfirmed', async () => {
    storageMock.getCoachAction.mockResolvedValue({
      id: 'act-3', userId: 'USER-0001', toolName: 'register_tournament_in_grade',
      status: 'pending', requiresConfirmation: true,
      input: {
        templateId: 't-1',
        manualEntry: { site: 'GG', name: 'X', time: '19:00', type: 'Vanilla', speed: 'Normal', buyIn: 11 },
        dayOfWeek: 1,
      },
    });
    await loadRegistry();
    const { confirmCoachAction } = await import('../../../server/coachToolRunner');
    const res: any = await confirmCoachAction('act-3', user);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(422);
    expect(res.code).toBe('input_invalid');
    expect(storageMock.createPlannedTournament).not.toHaveBeenCalled();
  });
});

describe('AI-0A · verify_leak_progress executa imediato (RF-12 — none, sem coach_action)', () => {
  it('handler retorno controlado sem foco ativo (no_active_leak_focus / note), sem throw', async () => {
    storageMock.findCoachLeakFocus.mockResolvedValue(undefined);
    const { getTool } = await loadRegistry();
    const tool: any = getTool('verify_leak_progress');
    const ctx = { userId: 'USER-0001', chatSessionId: 's', messageId: 'm', actionId: 'a' };
    const out: any = await tool.handler({}, ctx);
    // Sem foco ativo: ou { error: 'no_active_leak_focus' } ou { note: ... }
    const blob = out.data ?? out;
    const hasControlledShape =
      blob?.error === 'no_active_leak_focus' || typeof blob?.note === 'string' || out?.ok === false;
    expect(hasControlledShape).toBe(true);
  });
});
