import { describe, it, expect } from 'vitest';
import {
  decideBankrollAction,
  shouldWarnAccumulator,
  normalizeBuyInToUSD,
  SESSION_BANKROLL_WARNING_PCT,
} from '../../../client/src/lib/bankrollGrindHelpers';

// =============================================================================
// Testes TDD (Sprint 2 - Bankroll): GrindSessionLive.tsx - integracao com banca
//
// Fonte: docs/specs/bankroll-management.md (RF-08)
//        docs/architecture/flows/bankroll/sequence-grind-alert.md (5 cenarios)
//
// Abordagem: extraimos os helpers puros para bankrollGrindHelpers.ts e testamos
// a logica unitariamente. Testes de integracao completos do GrindSessionLive
// (form submit + mutations + toasts) dependem de RTL sobre um componente de
// 1700+ linhas com Supabase-like state global — deixamos como it.todo para
// Sprint 2.5 ou um refactor de GrindSessionLive em subcomponentes.
// =============================================================================

const bankroll1kRule1 = {
  configured: true,
  amount: 1000,
  rule: '1pct',
  maxBuyInUSD: 15,
  softLimitUSD: 10,
  hardLimitUSD: 15,
  maxBuyInDisplay: { USD: 15, BRL: 78 }, // USD->BRL = 5.2
};

const bankrollUnconfigured = {
  configured: false,
  amount: null,
};

describe('RF-08: decideBankrollAction (helper puro)', () => {
  describe('Cenario A: torneio dentro da regra', () => {
    it('torneio $5 USD em banca $1000 rule 1pct -> pass', () => {
      const d = decideBankrollAction(5, 'PokerStars', bankroll1kRule1);
      expect(d.kind).toBe('pass');
    });

    it('torneio R$30 BRL (~$5.77) em banca $1000 -> pass (normaliza via taxa)', () => {
      // 30 BRL / 5.2 = ~5.77 USD -> abaixo do softLimit 10
      const d = decideBankrollAction(30, 'Suprema', bankroll1kRule1);
      expect(d.kind).toBe('pass');
    });
  });

  describe('Cenario B: entre soft e hard limit', () => {
    it('torneio $12 USD em banca $1000 rule 1pct -> warn-soft', () => {
      const d = decideBankrollAction(12, 'PokerStars', bankroll1kRule1);
      expect(d.kind).toBe('warn-soft');
    });
  });

  describe('Cenario C: acima do hardLimit', () => {
    it('torneio $20 USD em banca $1000 rule 1pct -> block-hard', () => {
      const d = decideBankrollAction(20, 'PokerStars', bankroll1kRule1);
      expect(d.kind).toBe('block-hard');
      if (d.kind === 'block-hard') {
        expect(d.buyInUSD).toBeCloseTo(20, 2);
        expect(d.hardLimitUSD).toBe(15);
      }
    });

    it('torneio R$100 BRL (~$19.23) em banca $1000 USD -> block-hard (normaliza)', () => {
      const d = decideBankrollAction(100, 'Suprema', bankroll1kRule1);
      expect(d.kind).toBe('block-hard');
    });
  });

  describe('Cenario E: banca nao configurada (feature transparente)', () => {
    it('banca configured=false -> pass mesmo para buy-in absurdo', () => {
      const d = decideBankrollAction(500, 'PokerStars', bankrollUnconfigured);
      expect(d.kind).toBe('pass');
    });

    it('bankroll=null -> pass (fail-open)', () => {
      const d = decideBankrollAction(500, 'PokerStars', null);
      expect(d.kind).toBe('pass');
    });

    it('bankroll=undefined -> pass (fail-open)', () => {
      const d = decideBankrollAction(500, 'PokerStars', undefined);
      expect(d.kind).toBe('pass');
    });
  });

  describe('edge cases', () => {
    it('buyIn 0 -> pass', () => {
      const d = decideBankrollAction(0, 'PokerStars', bankroll1kRule1);
      expect(d.kind).toBe('pass');
    });

    it('buyIn negativo -> pass', () => {
      const d = decideBankrollAction(-5, 'PokerStars', bankroll1kRule1);
      expect(d.kind).toBe('pass');
    });

    it('buyIn NaN (string invalida) -> pass', () => {
      const d = decideBankrollAction('abc', 'PokerStars', bankroll1kRule1);
      expect(d.kind).toBe('pass');
    });

    it('buyIn como string "20" -> block-hard (parseFloat)', () => {
      const d = decideBankrollAction('20', 'PokerStars', bankroll1kRule1);
      expect(d.kind).toBe('block-hard');
    });
  });
});

describe('RF-08 Q5: shouldWarnAccumulator', () => {
  it('accumulator 0 + buyIn $50 em banca $1000 -> warn (>10%)', () => {
    const r = shouldWarnAccumulator(0, 120, 1000);
    expect(r.warn).toBe(true);
    expect(r.newAccumulator).toBe(120);
    expect(r.pctExposed).toBeCloseTo(0.12, 2);
  });

  it('accumulator 0 + buyIn $50 em banca $1000 -> sem warn (5%)', () => {
    const r = shouldWarnAccumulator(0, 50, 1000);
    expect(r.warn).toBe(false);
    expect(r.pctExposed).toBeCloseTo(0.05, 2);
  });

  it('banca null -> nunca warn', () => {
    const r = shouldWarnAccumulator(0, 200, null);
    expect(r.warn).toBe(false);
  });

  it('banca 0 -> nunca warn', () => {
    const r = shouldWarnAccumulator(0, 200, 0);
    expect(r.warn).toBe(false);
  });

  it('threshold e exatamente 10%', () => {
    expect(SESSION_BANKROLL_WARNING_PCT).toBe(0.1);
  });

  it('accumulator 90 + buyIn 20 em banca 1000 (total 110, 11%) -> warn', () => {
    const r = shouldWarnAccumulator(90, 20, 1000);
    expect(r.warn).toBe(true);
    expect(r.newAccumulator).toBe(110);
  });
});

describe('RF-08: normalizeBuyInToUSD', () => {
  it('PokerStars (USD) -> retorna raw', () => {
    expect(normalizeBuyInToUSD(15, 'PokerStars', bankroll1kRule1)).toBe(15);
  });

  it('Suprema (BRL) -> normaliza via bankroll.maxBuyInDisplay', () => {
    // taxa USD->BRL = 78/15 = 5.2 -> 52 BRL / 5.2 = 10 USD
    const usd = normalizeBuyInToUSD(52, 'Suprema', bankroll1kRule1);
    expect(usd).toBeCloseTo(10, 1);
  });

  it('Suprema sem taxa disponivel -> fail-open (retorna raw)', () => {
    const bankrollSemTaxa = { configured: true, amount: 1000, maxBuyInUSD: 15 };
    const usd = normalizeBuyInToUSD(50, 'Suprema', bankrollSemTaxa);
    expect(usd).toBe(50);
  });

  it('buyIn como string "15.50" -> 15.5', () => {
    expect(normalizeBuyInToUSD('15.50', 'PokerStars', bankroll1kRule1)).toBe(15.5);
  });

  it('buyIn NaN -> 0', () => {
    expect(normalizeBuyInToUSD('xyz', 'PokerStars', bankroll1kRule1)).toBe(0);
  });
});

// Tests de integracao completa do componente GrindSessionLive (form submit,
// mutations, modal render, toast persistente) ficam como it.todo. O page.tsx
// tem ~1700 linhas e mocks completos de dependencies (sessionTournaments,
// plannedTournaments, suprema etc.) sao custosos. Sprint 2.5 podera refatorar
// em subcomponents + testa-los isoladamente.
describe('GrindSessionLive.tsx - integracao completa (componentes)', () => {
  it.todo('submit de form com buyIn $20 em banca $1000 -> abre bankroll-shot-modal');
  it.todo('modal Cancelar -> addTournamentMutation NAO eh chamada');
  it.todo('modal Confirmar shot -> addTournamentMutation eh chamada com aboveBankrollRule=true');
  it.todo('submit $5 em banca $1000 -> addTournamentMutation chamada direto, sem modal');
  it.todo('3 torneios de $50 em banca $1000 -> toast dispara apos o 3o (>10%)');
  it.todo('encerrar sessao -> sessionAccumulatorUSD reseta para 0');
  it.todo('banca configured=false -> feature transparente (zero mudanca UI)');
  it.todo('useBankroll com erro de rede -> fail-open, prossegue adicao');
});
