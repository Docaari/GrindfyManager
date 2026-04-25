import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Testes TDD - Sprint 1 - normalizeTournamentTypePayload (storage helper)
// Fonte: ADR-031 §"Detalhes-chave do design" item 5
//        ADR-032 (deprecation gradual da coluna `category`)
//        Spec RF-02 item 4 — "Regra de coerencia type↔category (storage layer)"
//
// Comportamento esperado (D2):
//   - Toda escrita em tournaments/planned_tournaments que mexe em `type`
//     deve espelhar `category = type` automaticamente.
//   - Toda escrita em `category` deve espelhar `type = category` (back-fill
//     quando so category vem).
//   - Se ambos vierem com valores diferentes, prevalece `type` (warn no log).
//   - Default seguro: type/category = 'Vanilla' quando nada e enviado.
//   - Funcao e PURA (nao muta o payload de entrada).
//   - Preserva todos os outros campos do payload.
//
// Helper ainda nao existe (server/storage/normalizeTournamentTypePayload.ts ou
// similar). Testes devem FALHAR ate o implementer cria-lo.
// =============================================================================

import { normalizeTournamentTypePayload } from '../../../server/storage/normalizeTournamentTypePayload';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Casos basicos
// ---------------------------------------------------------------------------

describe('normalizeTournamentTypePayload - basicos', () => {
  it('payload com type=PKO -> espelha category=PKO', () => {
    const r = normalizeTournamentTypePayload({ type: 'PKO' });
    expect(r.type).toBe('PKO');
    expect(r.category).toBe('PKO');
  });

  it('payload com type=Mystery -> espelha category=Mystery', () => {
    const r = normalizeTournamentTypePayload({ type: 'Mystery' });
    expect(r.type).toBe('Mystery');
    expect(r.category).toBe('Mystery');
  });

  it('payload com type=Vanilla -> espelha category=Vanilla', () => {
    const r = normalizeTournamentTypePayload({ type: 'Vanilla' });
    expect(r.type).toBe('Vanilla');
    expect(r.category).toBe('Vanilla');
  });

  it('payload com type=Satellite -> espelha category=Satellite', () => {
    const r = normalizeTournamentTypePayload({ type: 'Satellite' });
    expect(r.type).toBe('Satellite');
    expect(r.category).toBe('Satellite');
  });
});

// ---------------------------------------------------------------------------
// Back-fill (somente category vem)
// ---------------------------------------------------------------------------

describe('normalizeTournamentTypePayload - back-fill', () => {
  it('payload so com category=Mystery -> back-fill type=Mystery', () => {
    const r = normalizeTournamentTypePayload({ category: 'Mystery' });
    expect(r.type).toBe('Mystery');
    expect(r.category).toBe('Mystery');
  });

  it('payload so com category=PKO -> back-fill type=PKO', () => {
    const r = normalizeTournamentTypePayload({ category: 'PKO' });
    expect(r.type).toBe('PKO');
    expect(r.category).toBe('PKO');
  });
});

// ---------------------------------------------------------------------------
// Type prevalece quando ambos divergem
// ---------------------------------------------------------------------------

describe('normalizeTournamentTypePayload - divergencia type vs category', () => {
  it('type=PKO, category=Vanilla -> ambos viram PKO (type prevalece)', () => {
    const r = normalizeTournamentTypePayload({ type: 'PKO', category: 'Vanilla' });
    expect(r.type).toBe('PKO');
    expect(r.category).toBe('PKO');
  });

  it('emite console.warn quando type e category divergem', () => {
    normalizeTournamentTypePayload({ type: 'PKO', category: 'Vanilla' });
    expect(console.warn).toHaveBeenCalled();
  });

  it('NAO emite warn quando type e category sao iguais', () => {
    normalizeTournamentTypePayload({ type: 'PKO', category: 'PKO' });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('NAO emite warn quando so type e enviado (sem category)', () => {
    normalizeTournamentTypePayload({ type: 'PKO' });
    expect(console.warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Default (nada enviado)
// ---------------------------------------------------------------------------

describe('normalizeTournamentTypePayload - default', () => {
  it('payload vazio -> type=Vanilla + category=Vanilla', () => {
    const r = normalizeTournamentTypePayload({});
    expect(r.type).toBe('Vanilla');
    expect(r.category).toBe('Vanilla');
  });

  it('payload null/undefined em type e category -> Vanilla', () => {
    const r = normalizeTournamentTypePayload({ type: null, category: undefined });
    expect(r.type).toBe('Vanilla');
    expect(r.category).toBe('Vanilla');
  });
});

// ---------------------------------------------------------------------------
// Pureza e preservacao de outros campos
// ---------------------------------------------------------------------------

describe('normalizeTournamentTypePayload - pureza e preservacao', () => {
  it('NAO muta o payload de entrada', () => {
    const input = { type: 'PKO', name: 'Daily $22', buyIn: '22.00' };
    const snapshot = JSON.stringify(input);
    normalizeTournamentTypePayload(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('preserva campos nao relacionados', () => {
    const input = {
      type: 'Mystery',
      name: 'Daily $50',
      buyIn: '50.00',
      site: 'PokerStars',
      speed: 'Turbo',
      isFlight: true,
      flightDay: '1A',
    };
    const r = normalizeTournamentTypePayload(input);
    expect(r.name).toBe('Daily $50');
    expect(r.buyIn).toBe('50.00');
    expect(r.site).toBe('PokerStars');
    expect(r.speed).toBe('Turbo');
    expect(r.isFlight).toBe(true);
    expect(r.flightDay).toBe('1A');
  });

  it('retorna novo objeto, nao referencia ao input', () => {
    const input = { type: 'PKO' };
    const r = normalizeTournamentTypePayload(input);
    expect(r).not.toBe(input);
  });

  it('preserva campos satellite quando type=Satellite', () => {
    const input = {
      type: 'Satellite',
      satelliteRewardType: 'ticket',
      satelliteTicketValue: '109',
      satelliteTargetTemplateId: 'tpl_1',
    };
    const r = normalizeTournamentTypePayload(input);
    expect(r.satelliteRewardType).toBe('ticket');
    expect(r.satelliteTicketValue).toBe('109');
    expect(r.satelliteTargetTemplateId).toBe('tpl_1');
  });
});

// ---------------------------------------------------------------------------
// Type invalido nao deve sobrescrever category
// ---------------------------------------------------------------------------

describe('normalizeTournamentTypePayload - type invalido', () => {
  it('type fora do enum (string aleatoria) -> retorna type=Vanilla com warn', () => {
    // O helper NAO valida (validacao e do Zod). Apenas espelha.
    // Mas o spec sugere que se type vier invalido, devemos cair no default
    // OU manter o valor original e deixar o Zod rejeitar adiante.
    // Implementer escolhe — teste valida que pelo menos category fica
    // sincronizada com qualquer valor que `type` tenha.
    const r = normalizeTournamentTypePayload({ type: 'NotAType' });
    expect(r.type).toBe(r.category);
  });
});
