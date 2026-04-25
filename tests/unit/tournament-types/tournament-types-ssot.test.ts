import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD - Sprint 1 - Tournament Types Extension
// Fonte: Docs/specs/tournament-types-extension-and-manual-add-fix.md (RF-02)
// ADR-031: Modelo ortogonal (type primario + modificadores booleanos)
//
// SSoT em shared/tournamentTypes.ts ainda NAO existe.
// Todos estes testes devem FALHAR ate que o implementer crie o modulo.
//
// Cobertura alvo: 100% dos exports.
// =============================================================================

import {
  TOURNAMENT_PRIMARY_TYPES,
  TournamentPrimaryTypeSchema,
  TOURNAMENT_MODIFIERS,
  SATELLITE_REWARD_TYPES,
  TYPE_LABELS_PT_BR,
  MODIFIER_LABELS_PT_BR,
  TYPE_COLORS,
  MODIFIER_COLORS,
  getTypeColor,
  getTypeLabel,
  getModifierColor,
  getModifierLabel,
  getTypeBadges,
  isSatellite,
  isPKO,
  isFlight,
  isLive,
  parseFlightDay,
  FLIGHT_DAY_SUGGESTIONS,
} from '@shared/tournamentTypes';

// ---------------------------------------------------------------------------
// Constantes principais
// ---------------------------------------------------------------------------

describe('TOURNAMENT_PRIMARY_TYPES', () => {
  it('contem exatamente 4 valores', () => {
    expect(TOURNAMENT_PRIMARY_TYPES).toHaveLength(4);
  });

  it('valores sao exatamente Vanilla, PKO, Mystery, Satellite (na ordem)', () => {
    expect(TOURNAMENT_PRIMARY_TYPES).toEqual(['Vanilla', 'PKO', 'Mystery', 'Satellite']);
  });

  it('NAO contem "Flight" (foi removido do enum primario, virou modificador)', () => {
    expect(TOURNAMENT_PRIMARY_TYPES).not.toContain('Flight' as any);
  });

  it('NAO contem "Live" (e modificador, nao tipo primario)', () => {
    expect(TOURNAMENT_PRIMARY_TYPES).not.toContain('Live' as any);
  });
});

describe('TOURNAMENT_MODIFIERS', () => {
  it('contem exatamente isFlight e isLive', () => {
    expect(TOURNAMENT_MODIFIERS).toEqual(['isFlight', 'isLive']);
  });
});

describe('SATELLITE_REWARD_TYPES', () => {
  it('contem exatamente 4 valores: ticket, package, cash, mixed', () => {
    expect(SATELLITE_REWARD_TYPES).toEqual(['ticket', 'package', 'cash', 'mixed']);
  });
});

// ---------------------------------------------------------------------------
// TournamentPrimaryTypeSchema (Zod)
// ---------------------------------------------------------------------------

describe('TournamentPrimaryTypeSchema', () => {
  it('aceita "Vanilla"', () => {
    expect(TournamentPrimaryTypeSchema.parse('Vanilla')).toBe('Vanilla');
  });

  it('aceita "PKO"', () => {
    expect(TournamentPrimaryTypeSchema.parse('PKO')).toBe('PKO');
  });

  it('aceita "Mystery"', () => {
    expect(TournamentPrimaryTypeSchema.parse('Mystery')).toBe('Mystery');
  });

  it('aceita "Satellite"', () => {
    expect(TournamentPrimaryTypeSchema.parse('Satellite')).toBe('Satellite');
  });

  it('rejeita "Flight" (foi removido do enum primario)', () => {
    expect(() => TournamentPrimaryTypeSchema.parse('Flight')).toThrow();
  });

  it('rejeita "Live" (modificador, nao tipo)', () => {
    expect(() => TournamentPrimaryTypeSchema.parse('Live')).toThrow();
  });

  it('rejeita "Bounty" (nao mapeado)', () => {
    expect(() => TournamentPrimaryTypeSchema.parse('Bounty')).toThrow();
  });

  it('rejeita "InvalidType"', () => {
    expect(() => TournamentPrimaryTypeSchema.parse('InvalidType')).toThrow();
  });

  it('rejeita string vazia', () => {
    expect(() => TournamentPrimaryTypeSchema.parse('')).toThrow();
  });

  it('rejeita null', () => {
    expect(() => TournamentPrimaryTypeSchema.parse(null)).toThrow();
  });

  it('rejeita undefined', () => {
    expect(() => TournamentPrimaryTypeSchema.parse(undefined)).toThrow();
  });

  it('rejeita number', () => {
    expect(() => TournamentPrimaryTypeSchema.parse(0)).toThrow();
  });

  it('e case-sensitive (rejeita "vanilla" lower)', () => {
    expect(() => TournamentPrimaryTypeSchema.parse('vanilla')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------------

describe('getTypeColor', () => {
  it('Vanilla mapeia para zinc (hex #71717a)', () => {
    const c = getTypeColor('Vanilla');
    expect(c.hex).toBe('#71717a');
  });

  it('PKO mapeia para violet (hex #a78bfa)', () => {
    const c = getTypeColor('PKO');
    expect(c.hex).toBe('#a78bfa');
  });

  it('Mystery mapeia para fuchsia (hex #e879f9)', () => {
    const c = getTypeColor('Mystery');
    expect(c.hex).toBe('#e879f9');
  });

  it('Satellite mapeia para amber (hex #fbbf24)', () => {
    const c = getTypeColor('Satellite');
    expect(c.hex).toBe('#fbbf24');
  });

  it('retorna objeto com bg, text, ring, hex', () => {
    const c = getTypeColor('PKO');
    expect(c).toHaveProperty('bg');
    expect(c).toHaveProperty('text');
    expect(c).toHaveProperty('ring');
    expect(c).toHaveProperty('hex');
  });

  it('TYPE_COLORS tem entrada para todos os 4 tipos', () => {
    for (const t of TOURNAMENT_PRIMARY_TYPES) {
      expect(TYPE_COLORS[t]).toBeTruthy();
    }
  });
});

describe('getModifierColor', () => {
  it('isFlight mapeia para cyan (#22d3ee)', () => {
    const c = getModifierColor('isFlight');
    expect(c.hex).toBe('#22d3ee');
  });

  it('isLive mapeia para emerald (#34d399)', () => {
    const c = getModifierColor('isLive');
    expect(c.hex).toBe('#34d399');
  });

  it('MODIFIER_COLORS tem entrada para todos modifiers', () => {
    for (const m of TOURNAMENT_MODIFIERS) {
      expect(MODIFIER_COLORS[m]).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Labels PT-BR
// ---------------------------------------------------------------------------

describe('getTypeLabel (PT-BR)', () => {
  it('Vanilla -> "Vanilla"', () => {
    expect(getTypeLabel('Vanilla')).toBe('Vanilla');
  });

  it('PKO -> "PKO (Bounty)"', () => {
    expect(getTypeLabel('PKO')).toBe('PKO (Bounty)');
  });

  it('Mystery -> "Mystery Bounty"', () => {
    expect(getTypeLabel('Mystery')).toBe('Mystery Bounty');
  });

  it('Satellite -> "Satélite" (PT-BR com acento)', () => {
    expect(getTypeLabel('Satellite')).toBe('Satélite');
  });

  it('TYPE_LABELS_PT_BR tem todos os 4 tipos', () => {
    for (const t of TOURNAMENT_PRIMARY_TYPES) {
      expect(typeof TYPE_LABELS_PT_BR[t]).toBe('string');
      expect(TYPE_LABELS_PT_BR[t].length).toBeGreaterThan(0);
    }
  });
});

describe('getModifierLabel (PT-BR)', () => {
  it('isFlight -> "Flight (Multi-dia)"', () => {
    expect(getModifierLabel('isFlight')).toBe('Flight (Multi-dia)');
  });

  it('isLive -> "Live (Presencial)"', () => {
    expect(getModifierLabel('isLive')).toBe('Live (Presencial)');
  });

  it('MODIFIER_LABELS_PT_BR tem todos modifiers', () => {
    for (const m of TOURNAMENT_MODIFIERS) {
      expect(typeof MODIFIER_LABELS_PT_BR[m]).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers booleanos
// ---------------------------------------------------------------------------

describe('isSatellite', () => {
  it('retorna true para Satellite', () => {
    expect(isSatellite('Satellite')).toBe(true);
  });

  it('retorna false para Vanilla', () => {
    expect(isSatellite('Vanilla')).toBe(false);
  });

  it('retorna false para PKO', () => {
    expect(isSatellite('PKO')).toBe(false);
  });

  it('retorna false para Mystery', () => {
    expect(isSatellite('Mystery')).toBe(false);
  });
});

describe('isPKO', () => {
  it('retorna true para PKO', () => {
    expect(isPKO('PKO')).toBe(true);
  });

  it('retorna false para outros', () => {
    expect(isPKO('Vanilla')).toBe(false);
    expect(isPKO('Mystery')).toBe(false);
    expect(isPKO('Satellite')).toBe(false);
  });
});

describe('isFlight (helper que recebe tournament-like)', () => {
  it('retorna true quando isFlight=true', () => {
    expect(isFlight({ isFlight: true })).toBe(true);
  });

  it('retorna false quando isFlight=false', () => {
    expect(isFlight({ isFlight: false })).toBe(false);
  });

  it('retorna false quando isFlight=null/undefined', () => {
    expect(isFlight({ isFlight: null })).toBe(false);
    expect(isFlight({} as any)).toBe(false);
  });
});

describe('isLive (helper que recebe tournament-like)', () => {
  it('retorna true quando isLive=true', () => {
    expect(isLive({ isLive: true })).toBe(true);
  });

  it('retorna false quando isLive=false', () => {
    expect(isLive({ isLive: false })).toBe(false);
  });

  it('retorna false quando isLive=null/undefined', () => {
    expect(isLive({ isLive: null })).toBe(false);
    expect(isLive({} as any)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getTypeBadges
// ---------------------------------------------------------------------------

describe('getTypeBadges', () => {
  it('PKO sem modificadores -> 1 badge', () => {
    const b = getTypeBadges({ type: 'PKO', isFlight: false, isLive: false });
    expect(b).toHaveLength(1);
    expect(b[0].label).toBe('PKO (Bounty)');
  });

  it('Vanilla puro -> 1 badge', () => {
    const b = getTypeBadges({ type: 'Vanilla' });
    expect(b).toHaveLength(1);
    expect(b[0].label).toBe('Vanilla');
  });

  it('PKO + isFlight -> 2 badges', () => {
    const b = getTypeBadges({ type: 'PKO', isFlight: true, isLive: false });
    expect(b).toHaveLength(2);
    const labels = b.map((x) => x.label);
    expect(labels).toContain('PKO (Bounty)');
    expect(labels).toContain('Flight (Multi-dia)');
  });

  it('PKO + isFlight + isLive -> 3 badges', () => {
    const b = getTypeBadges({ type: 'PKO', isFlight: true, isLive: true });
    expect(b).toHaveLength(3);
    const labels = b.map((x) => x.label);
    expect(labels).toContain('PKO (Bounty)');
    expect(labels).toContain('Flight (Multi-dia)');
    expect(labels).toContain('Live (Presencial)');
  });

  it('Satellite + isLive -> 2 badges (Satelite + Live)', () => {
    const b = getTypeBadges({ type: 'Satellite', isFlight: false, isLive: true });
    expect(b).toHaveLength(2);
    const labels = b.map((x) => x.label);
    expect(labels).toContain('Satélite');
    expect(labels).toContain('Live (Presencial)');
  });

  it('cada badge tem label e color (com bg + text)', () => {
    const b = getTypeBadges({ type: 'Mystery', isFlight: true });
    for (const badge of b) {
      expect(badge.label).toBeTruthy();
      expect(badge.color).toBeTruthy();
      expect(badge.color.bg).toBeTruthy();
      expect(badge.color.text).toBeTruthy();
    }
  });

  it('isFlight=null/undefined NAO adiciona badge', () => {
    const b1 = getTypeBadges({ type: 'PKO', isFlight: null });
    const b2 = getTypeBadges({ type: 'PKO' });
    expect(b1).toHaveLength(1);
    expect(b2).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// parseFlightDay
// ---------------------------------------------------------------------------

describe('parseFlightDay', () => {
  it('"1A" -> {day:1, group:"A", isFinal:false}', () => {
    expect(parseFlightDay('1A')).toEqual({ day: 1, group: 'A', isFinal: false });
  });

  it('"1B" -> {day:1, group:"B", isFinal:false}', () => {
    expect(parseFlightDay('1B')).toEqual({ day: 1, group: 'B', isFinal: false });
  });

  it('"1E" -> {day:1, group:"E", isFinal:false}', () => {
    expect(parseFlightDay('1E')).toEqual({ day: 1, group: 'E', isFinal: false });
  });

  it('"Final" -> {day:Infinity, group:null, isFinal:true}', () => {
    expect(parseFlightDay('Final')).toEqual({ day: Infinity, group: null, isFinal: true });
  });

  it('"Day 1" -> {day:1, group:null, isFinal:false}', () => {
    expect(parseFlightDay('Day 1')).toEqual({ day: 1, group: null, isFinal: false });
  });

  it('"Day 2" -> {day:2, group:null, isFinal:false}', () => {
    expect(parseFlightDay('Day 2')).toEqual({ day: 2, group: null, isFinal: false });
  });

  it('"2" (so numero) -> {day:2, group:null, isFinal:false}', () => {
    expect(parseFlightDay('2')).toEqual({ day: 2, group: null, isFinal: false });
  });

  it('"3" -> {day:3, group:null, isFinal:false}', () => {
    expect(parseFlightDay('3')).toEqual({ day: 3, group: null, isFinal: false });
  });

  it('"random" -> null', () => {
    expect(parseFlightDay('random')).toBeNull();
  });

  it('null -> null', () => {
    expect(parseFlightDay(null)).toBeNull();
  });

  it('"" (vazio) -> null', () => {
    expect(parseFlightDay('')).toBeNull();
  });

  it('"Day-1" (hifen) -> null', () => {
    expect(parseFlightDay('Day-1')).toBeNull();
  });

  it('"1@" -> null', () => {
    expect(parseFlightDay('1@')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FLIGHT_DAY_SUGGESTIONS
// ---------------------------------------------------------------------------

describe('FLIGHT_DAY_SUGGESTIONS', () => {
  it('contem entradas comuns: 1A, 1B, 1C, 1D, 1E, 2, 3, Final', () => {
    expect(FLIGHT_DAY_SUGGESTIONS).toContain('1A');
    expect(FLIGHT_DAY_SUGGESTIONS).toContain('1B');
    expect(FLIGHT_DAY_SUGGESTIONS).toContain('1C');
    expect(FLIGHT_DAY_SUGGESTIONS).toContain('1D');
    expect(FLIGHT_DAY_SUGGESTIONS).toContain('1E');
    expect(FLIGHT_DAY_SUGGESTIONS).toContain('2');
    expect(FLIGHT_DAY_SUGGESTIONS).toContain('3');
    expect(FLIGHT_DAY_SUGGESTIONS).toContain('Final');
  });

  it('todas as sugestoes batem com o regex de flightDay', () => {
    const regex = /^(Final|Day\s?\d+|\d+[A-Z]?)$/;
    for (const s of FLIGHT_DAY_SUGGESTIONS) {
      expect(regex.test(s)).toBe(true);
    }
  });
});
