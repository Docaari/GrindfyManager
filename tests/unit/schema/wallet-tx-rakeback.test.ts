import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint Bankroll-3 — Schema/Zod do body de POST /api/wallets/:id/transactions
// para reason='rakeback' (RF-01, RF-02 e backward-compat).
//
// Spec: Docs/specs/rakeback-reporting.md
// ADR : Docs/architecture/decisions/039-rakeback-as-wallet-tx-reason.md
//
// Esses testes validam o WalletTxBodyRefinedSchema (shared/wallet-reasons.ts)
// + o enum WALLET_TX_REASONS_P0 + o mirror BANKROLL_REASON_ENUM (testado
// indiretamente via insertBankrollSnapshotSchema, que e o unico export).
//
// CONTRATO REAL DA IMPLEMENTACAO:
// 1. WalletTxBodyRefinedSchema NAO marca occurredAt como required —
//    e .optional(). Reflete codigo atual; tests nao asseguram outro contrato.
// 2. superRefine: reason === 'rakeback' && direction === 'out' ->
//    issue com path: ['direction'] e message contendo 'invalid_rakeback_direction'.
// 3. WALLET_TX_REASONS_P0 atualmente possui 5 valores (inclui 'rakeback');
//    o teste legado wallet-transaction-schema.test.ts:226 (que afirma 4) sera
//    atualizado em outro sprint conforme acordado.
// =============================================================================

import {
  WALLET_TX_REASONS_P0,
  WalletTxReasonP0Schema,
  WalletTxBodyRefinedSchema,
} from '../../../shared/wallet-reasons';
import { insertBankrollSnapshotSchema } from '../../../shared/schema';

const futureSafeISO = () => new Date('2026-04-26T18:30:00Z').toISOString();

// =============================================================================
// 1. WALLET_TX_REASONS_P0 + WalletTxReasonP0Schema (RF-01)
// =============================================================================

describe('WALLET_TX_REASONS_P0 inclui rakeback (RF-01)', () => {
  it("contem 'rakeback'", () => {
    expect(WALLET_TX_REASONS_P0).toContain('rakeback');
  });

  it('mantem reasons originais (deposit, withdrawal, session_result, manual_adjustment)', () => {
    expect(WALLET_TX_REASONS_P0).toContain('deposit');
    expect(WALLET_TX_REASONS_P0).toContain('withdrawal');
    expect(WALLET_TX_REASONS_P0).toContain('session_result');
    expect(WALLET_TX_REASONS_P0).toContain('manual_adjustment');
  });

  it("WalletTxReasonP0Schema.parse('rakeback') aceita o valor", () => {
    expect(() => WalletTxReasonP0Schema.parse('rakeback')).not.toThrow();
  });
});

// =============================================================================
// 2. BANKROLL_REASON_ENUM mirror (RF-01)
// Testamos indiretamente via insertBankrollSnapshotSchema, ja que
// BANKROLL_REASON_ENUM nao e exportado.
// =============================================================================

describe('BANKROLL_REASON_ENUM aceita rakeback (espelho em bankroll_snapshots)', () => {
  it('insertBankrollSnapshotSchema aceita reason=rakeback', () => {
    const r = insertBankrollSnapshotSchema.safeParse({
      userId: 'USER-0001',
      delta: 50,
      previousAmount: 1000,
      newAmount: 1050,
      reason: 'rakeback',
    });
    expect(r.success).toBe(true);
  });

  it('insertBankrollSnapshotSchema continua aceitando reasons existentes', () => {
    for (const reason of [
      'initial',
      'deposit',
      'withdrawal',
      'session_result',
      'manual_adjustment',
    ]) {
      const r = insertBankrollSnapshotSchema.safeParse({
        userId: 'USER-0001',
        delta: 10,
        previousAmount: 0,
        newAmount: 10,
        reason,
      });
      expect(r.success, `reason=${reason} deveria passar`).toBe(true);
    }
  });
});

// =============================================================================
// 3. Happy path do WalletTxBodyRefinedSchema com reason=rakeback (RF-02)
// =============================================================================

describe('WalletTxBodyRefinedSchema — happy path rakeback (RF-02)', () => {
  it('aceita reason=rakeback + direction=in + amount valido (ISO string)', () => {
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'in',
      nativeAmount: 50,
      reason: 'rakeback',
      occurredAt: futureSafeISO(),
    });
    expect(r.success).toBe(true);
  });

  it('aceita reason=rakeback + direction=in + amount valido (Date)', () => {
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'in',
      nativeAmount: 50,
      reason: 'rakeback',
      occurredAt: new Date('2026-04-26T18:30:00Z'),
    });
    expect(r.success).toBe(true);
  });

  it('aceita amount decimal (12.50)', () => {
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'in',
      nativeAmount: 12.5,
      reason: 'rakeback',
      occurredAt: futureSafeISO(),
    });
    expect(r.success).toBe(true);
  });

  it('aceita note opcional', () => {
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'in',
      nativeAmount: 50,
      reason: 'rakeback',
      note: 'Rakeback semanal PokerStars',
      occurredAt: futureSafeISO(),
    });
    expect(r.success).toBe(true);
  });
});

// =============================================================================
// 4. Validacao cruzada: rakeback + direction=out -> erro (RF-02)
// =============================================================================

describe('WalletTxBodyRefinedSchema — rakeback rejeita direction=out (RF-02)', () => {
  it("reason='rakeback' + direction='out' falha", () => {
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'out',
      nativeAmount: 50,
      reason: 'rakeback',
      occurredAt: futureSafeISO(),
    });
    expect(r.success).toBe(false);
  });

  it("erro contem 'invalid_rakeback_direction' na mensagem (handler le esse marcador para retornar code estavel)", () => {
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'out',
      nativeAmount: 50,
      reason: 'rakeback',
      occurredAt: futureSafeISO(),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const hasMarker = r.error.issues.some(
        (i) =>
          typeof i.message === 'string' && i.message.includes('invalid_rakeback_direction'),
      );
      expect(hasMarker).toBe(true);
    }
  });

  it("path do issue aponta para 'direction'", () => {
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'out',
      nativeAmount: 50,
      reason: 'rakeback',
      occurredAt: futureSafeISO(),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const directionIssue = r.error.issues.find(
        (i) => Array.isArray(i.path) && i.path[0] === 'direction',
      );
      expect(directionIssue).toBeDefined();
    }
  });
});

// =============================================================================
// 5. Validacao de amount (RF-05)
// =============================================================================

describe('WalletTxBodyRefinedSchema — amount > 0 (RF-05)', () => {
  it('rejeita amount=0', () => {
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'in',
      nativeAmount: 0,
      reason: 'rakeback',
      occurredAt: futureSafeISO(),
    });
    expect(r.success).toBe(false);
  });

  it('rejeita amount negativo', () => {
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'in',
      nativeAmount: -10,
      reason: 'rakeback',
      occurredAt: futureSafeISO(),
    });
    expect(r.success).toBe(false);
  });

  it('rejeita amount NaN', () => {
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'in',
      nativeAmount: Number.NaN,
      reason: 'rakeback',
      occurredAt: futureSafeISO(),
    });
    expect(r.success).toBe(false);
  });

  it('rejeita amount Infinity', () => {
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'in',
      nativeAmount: Number.POSITIVE_INFINITY,
      reason: 'rakeback',
      occurredAt: futureSafeISO(),
    });
    expect(r.success).toBe(false);
  });
});

// =============================================================================
// 6. Backward-compat — reasons existentes continuam aceitando ambas direcoes
// =============================================================================

describe('WalletTxBodyRefinedSchema — backward-compat (RF-08)', () => {
  it("'deposit' aceita direction='in' e direction='out'", () => {
    for (const direction of ['in', 'out'] as const) {
      const r = WalletTxBodyRefinedSchema.safeParse({
        direction,
        nativeAmount: 10,
        reason: 'deposit',
        occurredAt: futureSafeISO(),
      });
      expect(r.success).toBe(true);
    }
  });

  it("'withdrawal' aceita ambas direcoes", () => {
    for (const direction of ['in', 'out'] as const) {
      const r = WalletTxBodyRefinedSchema.safeParse({
        direction,
        nativeAmount: 10,
        reason: 'withdrawal',
        occurredAt: futureSafeISO(),
      });
      expect(r.success).toBe(true);
    }
  });

  it("'session_result' aceita ambas direcoes", () => {
    for (const direction of ['in', 'out'] as const) {
      const r = WalletTxBodyRefinedSchema.safeParse({
        direction,
        nativeAmount: 10,
        reason: 'session_result',
        occurredAt: futureSafeISO(),
      });
      expect(r.success).toBe(true);
    }
  });

  it("'manual_adjustment' aceita ambas direcoes", () => {
    for (const direction of ['in', 'out'] as const) {
      const r = WalletTxBodyRefinedSchema.safeParse({
        direction,
        nativeAmount: 10,
        reason: 'manual_adjustment',
        occurredAt: futureSafeISO(),
      });
      expect(r.success).toBe(true);
    }
  });
});
