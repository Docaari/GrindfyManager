/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-wallet-reconciliation.md
 *  - RF-03: preview de delta com cor + label PT-BR
 *  - RF-09: helper transactionSourceLabel(source)
 *  - RF-11: i18n PT-BR de mensagens de erro
 *
 * Helpers que serao exportados pelo implementer (NAO existem ainda):
 *   client/src/lib/reconcileLabels.ts
 *     - formatDelta(delta: number, nativeCurrency: string): { sign, text, tone }
 *         tone in 'positive' | 'negative' | 'neutral'
 *         text formatado em PT-BR (separador decimal virgula).
 *     - reconcileErrorMessage(code: string, walletName?: string): string
 *         mapeia codes a mensagens PT-BR (RF-11).
 *
 * E reusa o helper transactionSourceLabel ja sugerido na spec RF-09.
 */

import { describe, it, expect } from 'vitest';

import {
  formatDelta,
  reconcileErrorMessage,
} from '../reconcileLabels';

// =============================================================================
// formatDelta (RF-03)
// =============================================================================

describe('formatDelta — sign + tone + i18n PT-BR', () => {
  it('delta positivo BRL -> sinal +, tone=positive, prefixo R$', () => {
    const r = formatDelta(50.0, 'BRL');
    expect(r.tone).toBe('positive');
    expect(r.text).toMatch(/^\+\s*R\$\s*50,00$/);
  });

  it('delta negativo USD -> sinal -, tone=negative, prefixo $', () => {
    const r = formatDelta(-30.0, 'USD');
    expect(r.tone).toBe('negative');
    // Pode formatar como "-$ 30,00" ou "-US$ 30,00" ou "$-30,00" — aceitamos prefixo + valor
    expect(r.text).toMatch(/^-/);
    expect(r.text).toContain('30,00');
  });

  it('delta zero -> tone=neutral, valor 0,00', () => {
    const r = formatDelta(0, 'BRL');
    expect(r.tone).toBe('neutral');
    expect(r.text).toContain('0,00');
  });

  it('|delta| < 0.01 -> tone=neutral (skip)', () => {
    const r = formatDelta(0.005, 'BRL');
    expect(r.tone).toBe('neutral');
  });

  it('decimal com mais de 2 casas eh formatado com 2', () => {
    const r = formatDelta(67.123, 'USD');
    expect(r.text).toContain('67,12');
  });

  it('EUR -> prefixo EUR ou EUR symbol', () => {
    const r = formatDelta(50, 'EUR');
    // Aceita 'EUR' ou simbolo €
    expect(r.text).toMatch(/EUR|€/);
  });
});

// =============================================================================
// reconcileErrorMessage (RF-11)
// =============================================================================

describe('reconcileErrorMessage — i18n PT-BR (RF-11)', () => {
  it('balance_mismatch -> menciona saldo divergiu/divergente/mudou', () => {
    const m = reconcileErrorMessage('balance_mismatch', 'PokerStars BR');
    expect(m).toMatch(/saldo|carteira/i);
    // Mensagem em PT-BR (sem inglesisses obvios)
    expect(m).not.toMatch(/balance mismatch|drift/i);
  });

  it('balance_mismatch sem walletName -> mensagem generica em PT-BR', () => {
    const m = reconcileErrorMessage('balance_mismatch');
    expect(typeof m).toBe('string');
    expect(m.length).toBeGreaterThan(0);
    expect(m).toMatch(/saldo|carteira/i);
  });

  it('wallet_archived -> menciona "arquivada"', () => {
    const m = reconcileErrorMessage('wallet_archived', 'GG USD');
    expect(m).toMatch(/arquivada/i);
  });

  it('already_reconciled -> menciona "ja"/"ja foi"/"reconciliada"', () => {
    const m = reconcileErrorMessage('already_reconciled');
    expect(m).toMatch(/reconcil/i);
  });

  it('code desconhecido -> mensagem generica nao-vazia', () => {
    const m = reconcileErrorMessage('something_unknown_xyz');
    expect(typeof m).toBe('string');
    expect(m.length).toBeGreaterThan(0);
  });

  it('walletName aparece na mensagem quando provido (UX clara)', () => {
    const m = reconcileErrorMessage('wallet_archived', 'PokerStars BR');
    expect(m).toContain('PokerStars BR');
  });
});
