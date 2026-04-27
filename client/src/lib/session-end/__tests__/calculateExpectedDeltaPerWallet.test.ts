/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-02: Pre-calculo de expectedDelta por wallet
 *  - RF-03: Mapeamento site -> wallets (tie-break)
 *  - ADR-045: Tie-break proporcional ao saldo, fallback igualitario.
 *  - ADR-033: FX convention (units-per-USD)
 *
 * Helper que sera exportado pelo implementer (NAO existe ainda):
 *   client/src/lib/session-end/calculateExpectedDeltaPerWallet.ts
 *     - calculateExpectedDeltaPerWallet(input): {
 *         walletsDelta: Array<{
 *           walletId: string;
 *           expectedDelta: number;
 *           contributingTournaments: string[];
 *         }>;
 *         orphanContribution: Array<{ site: string; currency: string; amount: number }>;
 *       }
 *
 * Input contract:
 *   {
 *     tournaments: Array<{
 *       id: string;
 *       site: string;
 *       buyIn: number;
 *       prize: number;
 *       bounty: number;
 *       rebuys: number;
 *       addOnTaken: boolean;
 *       addOnCost: number;
 *       status: string;
 *       currency?: string;
 *     }>;
 *     wallets: Array<{
 *       id: string;
 *       platform: string;
 *       nativeCurrency: string;
 *       balance: number;
 *       status: 'active' | 'archived';
 *     }>;
 *     exchangeRates: Record<string, number>;
 *   }
 */

import { describe, it, expect } from 'vitest';
import { calculateExpectedDeltaPerWallet } from '../calculateExpectedDeltaPerWallet';

describe('calculateExpectedDeltaPerWallet — happy path 1 site/1 wallet/same currency (RF-02)', () => {
  it('1 torneio finalizado, 1 wallet match, mesma currency -> delta = prize+bounty - buyIn - rebuys*buyIn - addOn', () => {
    const result = calculateExpectedDeltaPerWallet({
      tournaments: [
        {
          id: 'st_1',
          site: 'PokerStars',
          buyIn: 100,
          prize: 250,
          bounty: 0,
          rebuys: 0,
          addOnTaken: false,
          addOnCost: 0,
          status: 'finished',
          currency: 'USD',
        },
      ],
      wallets: [
        {
          id: 'wA',
          platform: 'PokerStars',
          nativeCurrency: 'USD',
          balance: 1000,
          status: 'active',
        },
      ],
      exchangeRates: { BRL: 5.0 },
    });

    expect(result.walletsDelta).toHaveLength(1);
    expect(result.walletsDelta[0].walletId).toBe('wA');
    expect(result.walletsDelta[0].expectedDelta).toBeCloseTo(150, 2);
    expect(result.walletsDelta[0].contributingTournaments).toContain('st_1');
    expect(result.orphanContribution).toEqual([]);
  });

  it('torneio com bounty soma corretamente: prize=100, bounty=50, buyIn=30, delta=120', () => {
    const result = calculateExpectedDeltaPerWallet({
      tournaments: [
        {
          id: 'st_2',
          site: 'PokerStars',
          buyIn: 30,
          prize: 100,
          bounty: 50,
          rebuys: 0,
          addOnTaken: false,
          addOnCost: 0,
          status: 'finished',
          currency: 'USD',
        },
      ],
      wallets: [
        { id: 'wA', platform: 'PokerStars', nativeCurrency: 'USD', balance: 500, status: 'active' },
      ],
      exchangeRates: {},
    });

    expect(result.walletsDelta[0].expectedDelta).toBeCloseTo(120, 2);
  });

  it('torneio com rebuys soma rebuys*buyIn ao custo: buyIn=10, rebuys=2, prize=0 -> delta=-30', () => {
    const result = calculateExpectedDeltaPerWallet({
      tournaments: [
        {
          id: 'st_3',
          site: 'PokerStars',
          buyIn: 10,
          prize: 0,
          bounty: 0,
          rebuys: 2,
          addOnTaken: false,
          addOnCost: 0,
          status: 'finished',
          currency: 'USD',
        },
      ],
      wallets: [
        { id: 'wA', platform: 'PokerStars', nativeCurrency: 'USD', balance: 100, status: 'active' },
      ],
      exchangeRates: {},
    });

    expect(result.walletsDelta[0].expectedDelta).toBeCloseTo(-30, 2);
  });

  it('torneio com addOnTaken=true soma addOnCost: buyIn=10, addOnCost=5, addOnTaken=true, prize=0 -> delta=-15', () => {
    const result = calculateExpectedDeltaPerWallet({
      tournaments: [
        {
          id: 'st_4',
          site: 'PokerStars',
          buyIn: 10,
          prize: 0,
          bounty: 0,
          rebuys: 0,
          addOnTaken: true,
          addOnCost: 5,
          status: 'finished',
          currency: 'USD',
        },
      ],
      wallets: [
        { id: 'wA', platform: 'PokerStars', nativeCurrency: 'USD', balance: 100, status: 'active' },
      ],
      exchangeRates: {},
    });

    expect(result.walletsDelta[0].expectedDelta).toBeCloseTo(-15, 2);
  });
});

describe('calculateExpectedDeltaPerWallet — orfaos (site -> 0 wallets) (RF-02 P6)', () => {
  it('site sem wallet correspondente vai para orphanContribution com {site, currency, amount}', () => {
    const result = calculateExpectedDeltaPerWallet({
      tournaments: [
        {
          id: 'st_5',
          site: 'BodogPlay',
          buyIn: 5,
          prize: 17.5,
          bounty: 0,
          rebuys: 0,
          addOnTaken: false,
          addOnCost: 0,
          status: 'finished',
          currency: 'BRL',
        },
      ],
      wallets: [
        { id: 'wA', platform: 'PokerStars', nativeCurrency: 'USD', balance: 1000, status: 'active' },
      ],
      exchangeRates: { BRL: 5.0 },
    });

    expect(result.walletsDelta).toEqual([]);
    expect(result.orphanContribution).toHaveLength(1);
    expect(result.orphanContribution[0]).toMatchObject({
      site: 'BodogPlay',
      currency: 'BRL',
    });
    expect(result.orphanContribution[0].amount).toBeCloseTo(12.5, 2);
  });

  it('multiplos orfaos em sites distintos -> array com N entradas', () => {
    const result = calculateExpectedDeltaPerWallet({
      tournaments: [
        {
          id: 'st_a',
          site: 'BodogPlay',
          buyIn: 5,
          prize: 12.5,
          bounty: 0,
          rebuys: 0,
          addOnTaken: false,
          addOnCost: 0,
          status: 'finished',
          currency: 'BRL',
        },
        {
          id: 'st_b',
          site: 'ChicoNetwork',
          buyIn: 2,
          prize: 10,
          bounty: 0,
          rebuys: 0,
          addOnTaken: false,
          addOnCost: 0,
          status: 'finished',
          currency: 'USD',
        },
      ],
      wallets: [],
      exchangeRates: {},
    });

    expect(result.orphanContribution).toHaveLength(2);
    const sites = result.orphanContribution.map((o) => o.site).sort();
    expect(sites).toEqual(['BodogPlay', 'ChicoNetwork']);
  });
});

describe('calculateExpectedDeltaPerWallet — tie-break (1 site -> 2 wallets, ADR-045)', () => {
  it('2 wallets ativas mesmo platform -> distribuicao proporcional ao saldo', () => {
    // Wallet A 700 / Wallet B 300 / total contribuicao 100 -> 70/30
    const result = calculateExpectedDeltaPerWallet({
      tournaments: [
        {
          id: 'st_x',
          site: 'BlackChip',
          buyIn: 50,
          prize: 150,
          bounty: 0,
          rebuys: 0,
          addOnTaken: false,
          addOnCost: 0,
          status: 'finished',
          currency: 'USD',
        },
      ],
      wallets: [
        { id: 'wA', platform: 'WPN', nativeCurrency: 'USD', balance: 700, status: 'active' },
        { id: 'wB', platform: 'WPN', nativeCurrency: 'USD', balance: 300, status: 'active' },
      ],
      exchangeRates: {},
    });

    const sumDelta = result.walletsDelta.reduce((s, w) => s + w.expectedDelta, 0);
    expect(sumDelta).toBeCloseTo(100, 2);

    const wA = result.walletsDelta.find((w) => w.walletId === 'wA');
    const wB = result.walletsDelta.find((w) => w.walletId === 'wB');
    expect(wA?.expectedDelta).toBeCloseTo(70, 2);
    expect(wB?.expectedDelta).toBeCloseTo(30, 2);
  });

  it('2 wallets candidates ambos balance 0 -> divisao igualitaria 50/50 (ADR-045 fallback)', () => {
    const result = calculateExpectedDeltaPerWallet({
      tournaments: [
        {
          id: 'st_y',
          site: 'BlackChip',
          buyIn: 0,
          prize: 100,
          bounty: 0,
          rebuys: 0,
          addOnTaken: false,
          addOnCost: 0,
          status: 'finished',
          currency: 'USD',
        },
      ],
      wallets: [
        { id: 'wA', platform: 'WPN', nativeCurrency: 'USD', balance: 0, status: 'active' },
        { id: 'wB', platform: 'WPN', nativeCurrency: 'USD', balance: 0, status: 'active' },
      ],
      exchangeRates: {},
    });

    const wA = result.walletsDelta.find((w) => w.walletId === 'wA');
    const wB = result.walletsDelta.find((w) => w.walletId === 'wB');
    expect(wA?.expectedDelta).toBeCloseTo(50, 2);
    expect(wB?.expectedDelta).toBeCloseTo(50, 2);
  });
});

describe('calculateExpectedDeltaPerWallet — N tournaments mesma wallet (RF-02 acumulacao)', () => {
  it('3 torneios mesmo site/wallet -> expectedDelta acumula', () => {
    const result = calculateExpectedDeltaPerWallet({
      tournaments: [
        {
          id: 'st_a', site: 'PokerStars', buyIn: 10, prize: 30, bounty: 0,
          rebuys: 0, addOnTaken: false, addOnCost: 0, status: 'finished', currency: 'USD',
        },
        {
          id: 'st_b', site: 'PokerStars', buyIn: 10, prize: 0, bounty: 0,
          rebuys: 0, addOnTaken: false, addOnCost: 0, status: 'finished', currency: 'USD',
        },
        {
          id: 'st_c', site: 'PokerStars', buyIn: 5, prize: 25, bounty: 5,
          rebuys: 0, addOnTaken: false, addOnCost: 0, status: 'finished', currency: 'USD',
        },
      ],
      wallets: [
        { id: 'wA', platform: 'PokerStars', nativeCurrency: 'USD', balance: 200, status: 'active' },
      ],
      exchangeRates: {},
    });

    // st_a: 30 - 10 = 20
    // st_b: 0 - 10 = -10
    // st_c: (25+5) - 5 = 25
    // total = 35
    expect(result.walletsDelta[0].expectedDelta).toBeCloseTo(35, 2);
    expect(result.walletsDelta[0].contributingTournaments.sort()).toEqual(['st_a', 'st_b', 'st_c']);
  });
});

describe('calculateExpectedDeltaPerWallet — status filtering (RF-02)', () => {
  it('torneio com status != finished e ignorado (delta=0)', () => {
    const result = calculateExpectedDeltaPerWallet({
      tournaments: [
        {
          id: 'st_active',
          site: 'PokerStars',
          buyIn: 10,
          prize: 100,
          bounty: 0,
          rebuys: 0,
          addOnTaken: false,
          addOnCost: 0,
          status: 'registered',
          currency: 'USD',
        },
      ],
      wallets: [
        { id: 'wA', platform: 'PokerStars', nativeCurrency: 'USD', balance: 100, status: 'active' },
      ],
      exchangeRates: {},
    });

    // Wallet pode aparecer com delta=0 ou nao aparecer (depende do impl).
    // Garantia minima: nenhum delta diferente de zero.
    const total = result.walletsDelta.reduce((s, w) => s + Math.abs(w.expectedDelta), 0);
    expect(total).toBe(0);
  });

  it('mistura finished + registered -> apenas finished contribui', () => {
    const result = calculateExpectedDeltaPerWallet({
      tournaments: [
        {
          id: 'st_done', site: 'PokerStars', buyIn: 10, prize: 30, bounty: 0,
          rebuys: 0, addOnTaken: false, addOnCost: 0, status: 'finished', currency: 'USD',
        },
        {
          id: 'st_pending', site: 'PokerStars', buyIn: 10, prize: 999, bounty: 0,
          rebuys: 0, addOnTaken: false, addOnCost: 0, status: 'registered', currency: 'USD',
        },
      ],
      wallets: [
        { id: 'wA', platform: 'PokerStars', nativeCurrency: 'USD', balance: 100, status: 'active' },
      ],
      exchangeRates: {},
    });

    const wA = result.walletsDelta.find((w) => w.walletId === 'wA');
    expect(wA?.expectedDelta).toBeCloseTo(20, 2);
    expect(wA?.contributingTournaments).toEqual(['st_done']);
  });
});

describe('calculateExpectedDeltaPerWallet — currency conversion (RF-02 + ADR-033)', () => {
  it('torneio USD + wallet BRL -> conversao via exchangeRates[BRL]=5 -> USD * rate', () => {
    // contribution_native (USD) = 50; wallet BRL com rate BRL=5
    // contribution_in_wallet_currency = 50 * 5 = 250 BRL
    const result = calculateExpectedDeltaPerWallet({
      tournaments: [
        {
          id: 'st_conv',
          site: 'PokerStars',
          buyIn: 10,
          prize: 60,
          bounty: 0,
          rebuys: 0,
          addOnTaken: false,
          addOnCost: 0,
          status: 'finished',
          currency: 'USD',
        },
      ],
      wallets: [
        { id: 'wBR', platform: 'PokerStars', nativeCurrency: 'BRL', balance: 5000, status: 'active' },
      ],
      exchangeRates: { BRL: 5.0 },
    });

    expect(result.walletsDelta[0].expectedDelta).toBeCloseTo(250, 2);
  });

  it('rate ausente -> fallback 0 deterministico (ADR-033)', () => {
    const result = calculateExpectedDeltaPerWallet({
      tournaments: [
        {
          id: 'st_no_rate',
          site: 'PokerStars',
          buyIn: 10,
          prize: 60,
          bounty: 0,
          rebuys: 0,
          addOnTaken: false,
          addOnCost: 0,
          status: 'finished',
          currency: 'CNY',
        },
      ],
      wallets: [
        // BRL wallet, sem rate BRL nem rate CNY
        { id: 'wBR', platform: 'PokerStars', nativeCurrency: 'BRL', balance: 5000, status: 'active' },
      ],
      exchangeRates: {}, // nao tem nem CNY nem BRL
    });

    expect(result.walletsDelta[0].expectedDelta).toBe(0);
  });
});
