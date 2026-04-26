/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-wallet-reconciliation.md
 *  - RF-04: body do POST /api/grind-sessions/:id/reconcile-wallets
 *  - RF-07: validacao de input
 * ADR : Docs/architecture/decisions/040-session-end-wallet-reconciliation.md
 *
 * Este teste valida a forma do schema Zod do body. O schema sera exportado de
 *   shared/reconcile-schemas.ts -> ReconcileWalletsBodySchema
 * (caminho sugerido — implementer pode escolher modulo equivalente desde que
 * respeite o contrato testado abaixo).
 *
 * Comportamento esperado:
 *  - Aceita { adjustments: [] } (skip total) -> success
 *  - Aceita adjustments com walletId (string nao vazia) + reportedBalance
 *    (numero finito >= 0) + expectedPreviousBalance (numero finito).
 *  - Rejeita reportedBalance NaN, +Infinity, -Infinity.
 *  - HIGH-1 reviewer fix: aceita reportedBalance negativo. Spec RF-03
 *    permite explicitamente "Aceita numero positivo, zero ou negativo
 *    (wallet pode ficar negativa; mesmo warning do WalletTransactionDialog
 *    aplica)".
 *  - Rejeita walletId vazio.
 *  - Rejeita falta de expectedPreviousBalance (RF-07 missing_expected_balance).
 *  - Rejeita mais de 50 adjustments (limite razoavel; reconciliacao tipica 1-3 wallets).
 *
 * Red phase: o modulo ainda nao existe. Importacao falha por module not found.
 */

import { describe, it, expect } from 'vitest';

// O modulo abaixo NAO existe ainda — implementer ira criar.
// Formato esperado:
//   export const ReconcileWalletsBodySchema = z.object({
//     adjustments: z.array(z.object({
//       walletId: z.string().min(1),
//       reportedBalance: z.number().finite().min(0),
//       expectedPreviousBalance: z.number().finite(),
//     })).max(50),
//   })
import { ReconcileWalletsBodySchema } from '@shared/reconcile-schemas';

describe('ReconcileWalletsBodySchema (RF-04, RF-07)', () => {
  describe('happy paths', () => {
    it('aceita adjustments=[] (skip total)', () => {
      const r = ReconcileWalletsBodySchema.safeParse({ adjustments: [] });
      expect(r.success).toBe(true);
    });

    it('aceita 1 ajuste valido', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          {
            walletId: 'wlt_brl',
            reportedBalance: 1247.0,
            expectedPreviousBalance: 1180.0,
          },
        ],
      });
      expect(r.success).toBe(true);
    });

    it('aceita 3 ajustes (1 positivo, 1 negativo, 1 zero)', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180 },
          { walletId: 'wB', reportedBalance: 165, expectedPreviousBalance: 200 },
          { walletId: 'wC', reportedBalance: 50, expectedPreviousBalance: 50 },
        ],
      });
      expect(r.success).toBe(true);
    });

    it('aceita reportedBalance = 0 (wallet zerada)', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          { walletId: 'wA', reportedBalance: 0, expectedPreviousBalance: 200 },
        ],
      });
      expect(r.success).toBe(true);
    });

    it('aceita expectedPreviousBalance = 0', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          { walletId: 'wA', reportedBalance: 50, expectedPreviousBalance: 0 },
        ],
      });
      expect(r.success).toBe(true);
    });
  });

  describe('rejeita reportedBalance invalido', () => {
    it('NaN', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          { walletId: 'wA', reportedBalance: NaN, expectedPreviousBalance: 0 },
        ],
      });
      expect(r.success).toBe(false);
    });

    it('+Infinity', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          {
            walletId: 'wA',
            reportedBalance: Number.POSITIVE_INFINITY,
            expectedPreviousBalance: 0,
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it('-Infinity', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          {
            walletId: 'wA',
            reportedBalance: Number.NEGATIVE_INFINITY,
            expectedPreviousBalance: 0,
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it('aceita numero negativo (HIGH-1: wallet pode ficar negativa, RF-03)', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          { walletId: 'wA', reportedBalance: -10, expectedPreviousBalance: 0 },
        ],
      });
      expect(r.success).toBe(true);
    });

    it('aceita reportedBalance fortemente negativo (HIGH-1)', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          { walletId: 'wA', reportedBalance: -1500.55, expectedPreviousBalance: -1000 },
        ],
      });
      expect(r.success).toBe(true);
    });

    it('string em vez de numero', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          {
            walletId: 'wA',
            reportedBalance: '1247.00' as any,
            expectedPreviousBalance: 1180,
          },
        ],
      });
      expect(r.success).toBe(false);
    });
  });

  describe('rejeita walletId invalido', () => {
    it('vazio', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          { walletId: '', reportedBalance: 1247, expectedPreviousBalance: 1180 },
        ],
      });
      expect(r.success).toBe(false);
    });

    it('numero em vez de string', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          {
            walletId: 123 as any,
            reportedBalance: 1247,
            expectedPreviousBalance: 1180,
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it('faltando', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          { reportedBalance: 1247, expectedPreviousBalance: 1180 } as any,
        ],
      });
      expect(r.success).toBe(false);
    });
  });

  describe('rejeita expectedPreviousBalance invalido (RF-07 missing_expected_balance)', () => {
    it('faltando', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          { walletId: 'wA', reportedBalance: 1247 } as any,
        ],
      });
      expect(r.success).toBe(false);
    });

    it('NaN', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: NaN },
        ],
      });
      expect(r.success).toBe(false);
    });

    it('Infinity', () => {
      const r = ReconcileWalletsBodySchema.safeParse({
        adjustments: [
          {
            walletId: 'wA',
            reportedBalance: 1247,
            expectedPreviousBalance: Number.POSITIVE_INFINITY,
          },
        ],
      });
      expect(r.success).toBe(false);
    });
  });

  describe('rejeita formato global do body', () => {
    it('falta adjustments', () => {
      const r = ReconcileWalletsBodySchema.safeParse({});
      expect(r.success).toBe(false);
    });

    it('adjustments nao-array', () => {
      const r = ReconcileWalletsBodySchema.safeParse({ adjustments: 'foo' as any });
      expect(r.success).toBe(false);
    });

    it('rejeita mais de 50 adjustments (limite operacional razoavel)', () => {
      const adjustments = Array.from({ length: 51 }, (_, i) => ({
        walletId: `w${i}`,
        reportedBalance: 100,
        expectedPreviousBalance: 100,
      }));
      const r = ReconcileWalletsBodySchema.safeParse({ adjustments });
      expect(r.success).toBe(false);
    });

    it('aceita exatamente 50 adjustments (boundary)', () => {
      const adjustments = Array.from({ length: 50 }, (_, i) => ({
        walletId: `w${i}`,
        reportedBalance: 100,
        expectedPreviousBalance: 100,
      }));
      const r = ReconcileWalletsBodySchema.safeParse({ adjustments });
      expect(r.success).toBe(true);
    });
  });
});
