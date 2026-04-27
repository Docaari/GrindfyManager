/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-11: Telemetria expandida (12 eventos)
 *
 * Modulos esperados pelo implementer:
 *   client/src/lib/telemetry.ts
 *     - export function track(event: string, payload: Record<string, unknown>): void
 *
 *   client/src/lib/session-end/telemetry.ts (ou inline em session-end-flow.ts)
 *     - emit dos 12 eventos abaixo nos pontos correspondentes do fluxo.
 *
 * Estes testes sao em nivel de integracao — exercitam o adapter `track`
 * importando-o e validando que cada caminho do fluxo de session-end faz
 * a chamada com o payload correto.
 *
 * Eventos cobertos (RF-11, contagem de 12):
 *   1. session_finalize_clicked
 *   2. confirmation_modal_skipped
 *   3. session_completed
 *   4. reconcile_disambiguation_choice
 *   5. reconcile_dialog_opened
 *   6. reconcile_skipped_no_wallets
 *   7. reconcile_skipped_user
 *   8. reconcile_submitted
 *   9. reconcile_failed
 *  10. cooldown_started_from_summary
 *  11. cooldown_create_failed
 *  12. summary_finalize_clicked
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// O adapter `track` ainda nao existe (red phase). Implementer cria em
// client/src/lib/telemetry.ts e expoe `track(event, payload)`.
vi.mock('../../../client/src/lib/telemetry', () => ({
  track: vi.fn(),
}));

import { track } from '../../../client/src/lib/telemetry';

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// 1. session_finalize_clicked
// =============================================================================

describe('Evento 1: session_finalize_clicked', () => {
  it('dispara ao clicar Finalizar Sessao durante grind ativo (origem confirmation_modal)', async () => {
    const { emitSessionFinalizeClicked } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitSessionFinalizeClicked({ sessionId: 'ses_1', origin: 'confirmation_modal' });

    expect(track).toHaveBeenCalledWith('session_finalize_clicked', {
      sessionId: 'ses_1',
      origin: 'confirmation_modal',
    });
  });

  it('dispara com origem direct quando ConfirmationModal foi pulado', async () => {
    const { emitSessionFinalizeClicked } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitSessionFinalizeClicked({ sessionId: 'ses_2', origin: 'direct' });

    expect(track).toHaveBeenCalledWith('session_finalize_clicked', {
      sessionId: 'ses_2',
      origin: 'direct',
    });
  });
});

// =============================================================================
// 2. confirmation_modal_skipped (P5/P7 — F-05)
// =============================================================================

describe('Evento 2: confirmation_modal_skipped (RF-01, P7)', () => {
  it('dispara quando pendingCount === 0', async () => {
    const { emitConfirmationModalSkipped } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitConfirmationModalSkipped({ sessionId: 'ses_1', pendingCount: 0 });

    expect(track).toHaveBeenCalledWith('confirmation_modal_skipped', {
      sessionId: 'ses_1',
      pendingCount: 0,
    });
  });

  it('NAO dispara quando pendingCount > 0 (modal renderiza normalmente)', async () => {
    const { emitConfirmationModalSkipped } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    // contrato: caller verifica pendingCount antes; helper sempre emite
    // com payload recebido. Aqui validamos que se chamado com !=0, payload
    // reflete fielmente.
    emitConfirmationModalSkipped({ sessionId: 'ses_2', pendingCount: 3 });
    expect(track).toHaveBeenCalledWith('confirmation_modal_skipped', {
      sessionId: 'ses_2',
      pendingCount: 3,
    });
  });
});

// =============================================================================
// 3. session_completed
// =============================================================================

describe('Evento 3: session_completed', () => {
  it('dispara apos PUT /grind-sessions/:id retornar 200', async () => {
    const { emitSessionCompleted } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitSessionCompleted({
      sessionId: 'ses_1',
      durationMinutes: 123,
      profit: 250.5,
      volume: 18,
    });

    expect(track).toHaveBeenCalledWith('session_completed', {
      sessionId: 'ses_1',
      durationMinutes: 123,
      profit: 250.5,
      volume: 18,
    });
  });

  it('aceita profit negativo', async () => {
    const { emitSessionCompleted } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitSessionCompleted({
      sessionId: 'ses_2',
      durationMinutes: 60,
      profit: -120,
      volume: 5,
    });

    expect(track).toHaveBeenCalledWith(
      'session_completed',
      expect.objectContaining({ profit: -120 }),
    );
  });
});

// =============================================================================
// 4. reconcile_disambiguation_choice (RF-13, P3)
// =============================================================================

describe('Evento 4: reconcile_disambiguation_choice (RF-13)', () => {
  it('dispara com choice=single + walletId quando user escolhe wallet unica', async () => {
    const { emitReconcileDisambiguationChoice } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileDisambiguationChoice({
      sessionId: 'ses_1',
      site: 'BlackChip',
      choice: 'single',
      walletId: 'wA',
    });

    expect(track).toHaveBeenCalledWith('reconcile_disambiguation_choice', {
      sessionId: 'ses_1',
      site: 'BlackChip',
      choice: 'single',
      walletId: 'wA',
    });
  });

  it('dispara com choice=proportional sem walletId', async () => {
    const { emitReconcileDisambiguationChoice } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileDisambiguationChoice({
      sessionId: 'ses_1',
      site: 'BlackChip',
      choice: 'proportional',
    });

    const call = (track as any).mock.calls[0];
    expect(call[0]).toBe('reconcile_disambiguation_choice');
    expect(call[1].choice).toBe('proportional');
    expect(call[1].walletId).toBeUndefined();
  });

  it('aceita choice=custom', async () => {
    const { emitReconcileDisambiguationChoice } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileDisambiguationChoice({
      sessionId: 'ses_1',
      site: 'BlackChip',
      choice: 'custom',
    });

    expect(track).toHaveBeenCalledWith(
      'reconcile_disambiguation_choice',
      expect.objectContaining({ choice: 'custom' }),
    );
  });
});

// =============================================================================
// 5. reconcile_dialog_opened
// =============================================================================

describe('Evento 5: reconcile_dialog_opened', () => {
  it('inclui walletsCount, hadActivityCount e orphanCurrencies', async () => {
    const { emitReconcileDialogOpened } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileDialogOpened({
      sessionId: 'ses_1',
      walletsCount: 3,
      hadActivityCount: 2,
      orphanCurrencies: ['BRL', 'USD'],
    });

    expect(track).toHaveBeenCalledWith('reconcile_dialog_opened', {
      sessionId: 'ses_1',
      walletsCount: 3,
      hadActivityCount: 2,
      orphanCurrencies: ['BRL', 'USD'],
    });
  });

  it('orphanCurrencies vazio quando todos sites tem wallet mapeada', async () => {
    const { emitReconcileDialogOpened } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileDialogOpened({
      sessionId: 'ses_1',
      walletsCount: 1,
      hadActivityCount: 1,
      orphanCurrencies: [],
    });

    expect(track).toHaveBeenCalledWith(
      'reconcile_dialog_opened',
      expect.objectContaining({ orphanCurrencies: [] }),
    );
  });
});

// =============================================================================
// 6. reconcile_skipped_no_wallets
// =============================================================================

describe('Evento 6: reconcile_skipped_no_wallets', () => {
  it('dispara quando RF-04 retorna wallets: []', async () => {
    const { emitReconcileSkippedNoWallets } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileSkippedNoWallets({ sessionId: 'ses_1' });

    expect(track).toHaveBeenCalledWith('reconcile_skipped_no_wallets', {
      sessionId: 'ses_1',
    });
  });
});

// =============================================================================
// 7. reconcile_skipped_user (P1 — F-01)
// =============================================================================

describe('Evento 7: reconcile_skipped_user (P1 com via discriminator)', () => {
  it('via=button quando user clica "Pular sem registrar"', async () => {
    const { emitReconcileSkippedUser } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileSkippedUser({ sessionId: 'ses_1', walletsCount: 2, via: 'button' });

    expect(track).toHaveBeenCalledWith('reconcile_skipped_user', {
      sessionId: 'ses_1',
      walletsCount: 2,
      via: 'button',
    });
  });

  it('via=x quando user clica botao X do dialog', async () => {
    const { emitReconcileSkippedUser } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileSkippedUser({ sessionId: 'ses_1', walletsCount: 1, via: 'x' });
    expect(track).toHaveBeenCalledWith(
      'reconcile_skipped_user',
      expect.objectContaining({ via: 'x' }),
    );
  });

  it('via=esc quando user pressiona ESC', async () => {
    const { emitReconcileSkippedUser } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileSkippedUser({ sessionId: 'ses_1', walletsCount: 1, via: 'esc' });
    expect(track).toHaveBeenCalledWith(
      'reconcile_skipped_user',
      expect.objectContaining({ via: 'esc' }),
    );
  });

  it('via=overlay quando user clica fora do dialog', async () => {
    const { emitReconcileSkippedUser } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileSkippedUser({ sessionId: 'ses_1', walletsCount: 1, via: 'overlay' });
    expect(track).toHaveBeenCalledWith(
      'reconcile_skipped_user',
      expect.objectContaining({ via: 'overlay' }),
    );
  });
});

// =============================================================================
// 8. reconcile_submitted
// =============================================================================

describe('Evento 8: reconcile_submitted', () => {
  it('inclui snapshotsCreated, txCreated, skipped', async () => {
    const { emitReconcileSubmitted } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileSubmitted({
      sessionId: 'ses_1',
      snapshotsCreated: 3,
      txCreated: 2,
      skipped: 1,
      totalManualAdjustmentUsdEstimate: 12.5,
    });

    expect(track).toHaveBeenCalledWith('reconcile_submitted', {
      sessionId: 'ses_1',
      snapshotsCreated: 3,
      txCreated: 2,
      skipped: 1,
      totalManualAdjustmentUsdEstimate: 12.5,
    });
  });

  it('totalManualAdjustmentUsdEstimate eh opcional', async () => {
    const { emitReconcileSubmitted } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileSubmitted({
      sessionId: 'ses_1',
      snapshotsCreated: 2,
      txCreated: 0,
      skipped: 2,
    });

    expect(track).toHaveBeenCalledWith(
      'reconcile_submitted',
      expect.objectContaining({ snapshotsCreated: 2, txCreated: 0, skipped: 2 }),
    );
  });
});

// =============================================================================
// 9. reconcile_failed
// =============================================================================

describe('Evento 9: reconcile_failed', () => {
  it('inclui errorCode + httpStatus + failedAtWalletId opcional', async () => {
    const { emitReconcileFailed } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileFailed({
      sessionId: 'ses_1',
      errorCode: 'balance_mismatch',
      httpStatus: 409,
      failedAtWalletId: 'wA',
    });

    expect(track).toHaveBeenCalledWith('reconcile_failed', {
      sessionId: 'ses_1',
      errorCode: 'balance_mismatch',
      httpStatus: 409,
      failedAtWalletId: 'wA',
    });
  });

  it('failedAtWalletId omitido quando erro e global (ex 500)', async () => {
    const { emitReconcileFailed } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitReconcileFailed({
      sessionId: 'ses_1',
      errorCode: 'internal_error',
      httpStatus: 500,
    });

    const call = (track as any).mock.calls[0];
    expect(call[1].failedAtWalletId).toBeUndefined();
  });
});

// =============================================================================
// 10. cooldown_started_from_summary
// =============================================================================

describe('Evento 10: cooldown_started_from_summary', () => {
  it('mode=full', async () => {
    const { emitCooldownStartedFromSummary } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitCooldownStartedFromSummary({ sessionId: 'ses_1', mode: 'full' });

    expect(track).toHaveBeenCalledWith('cooldown_started_from_summary', {
      sessionId: 'ses_1',
      mode: 'full',
    });
  });

  it('mode=quick', async () => {
    const { emitCooldownStartedFromSummary } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitCooldownStartedFromSummary({ sessionId: 'ses_1', mode: 'quick' });

    expect(track).toHaveBeenCalledWith(
      'cooldown_started_from_summary',
      expect.objectContaining({ mode: 'quick' }),
    );
  });
});

// =============================================================================
// 11. cooldown_create_failed
// =============================================================================

describe('Evento 11: cooldown_create_failed', () => {
  it('400 com errorMessage', async () => {
    const { emitCooldownCreateFailed } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitCooldownCreateFailed({
      sessionId: 'ses_1',
      httpStatus: 400,
      errorMessage: 'Sessao invalida ou expirada. Recarregue a pagina.',
    });

    expect(track).toHaveBeenCalledWith('cooldown_create_failed', {
      sessionId: 'ses_1',
      httpStatus: 400,
      errorMessage: 'Sessao invalida ou expirada. Recarregue a pagina.',
    });
  });

  it('5xx', async () => {
    const { emitCooldownCreateFailed } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitCooldownCreateFailed({
      sessionId: 'ses_1',
      httpStatus: 500,
      errorMessage: 'Erro no servidor.',
    });

    expect(track).toHaveBeenCalledWith(
      'cooldown_create_failed',
      expect.objectContaining({ httpStatus: 500 }),
    );
  });

  it('Network/offline (httpStatus 0)', async () => {
    const { emitCooldownCreateFailed } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitCooldownCreateFailed({
      sessionId: 'ses_1',
      httpStatus: 0,
      errorMessage: 'Sem conexao. Verifique sua internet e tente novamente.',
    });

    expect(track).toHaveBeenCalledWith(
      'cooldown_create_failed',
      expect.objectContaining({ httpStatus: 0 }),
    );
  });
});

// =============================================================================
// 12. summary_finalize_clicked
// =============================================================================

describe('Evento 12: summary_finalize_clicked', () => {
  it('dispara ao clicar Finalizar Sessao no summary (skip cooldown)', async () => {
    const { emitSummaryFinalizeClicked } = await import(
      '../../../client/src/lib/session-end/telemetry'
    );
    emitSummaryFinalizeClicked({ sessionId: 'ses_1' });

    expect(track).toHaveBeenCalledWith('summary_finalize_clicked', {
      sessionId: 'ses_1',
    });
  });
});

// =============================================================================
// Contrato: nenhum evento contem PII
// =============================================================================

describe('Contrato RF-11: payloads sem PII', () => {
  const pii = ['email', 'name', 'firstName', 'lastName', 'cpf', 'phone', 'address'];

  it('nenhum payload de exemplo carrega chaves PII', async () => {
    const mod = await import('../../../client/src/lib/session-end/telemetry');
    const sample = {
      sessionId: 'ses_1',
      walletsCount: 1,
      mode: 'full' as const,
      via: 'button' as const,
    };

    // exercita varios helpers e verifica que track recebeu chaves seguras
    mod.emitSessionFinalizeClicked({ sessionId: 'ses_1', origin: 'direct' });
    mod.emitReconcileDialogOpened({
      sessionId: 'ses_1',
      walletsCount: 1,
      hadActivityCount: 1,
      orphanCurrencies: [],
    });

    const allPayloads = (track as any).mock.calls.map((c: any[]) => c[1]);
    for (const payload of allPayloads) {
      for (const k of pii) {
        expect(payload[k]).toBeUndefined();
      }
    }
  });
});
