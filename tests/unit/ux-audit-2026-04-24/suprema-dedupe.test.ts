import { describe, it, expect } from 'vitest';
import {
  buildSupremaMatchKey,
  buildSupremaMatchKeysFromSession,
} from '../../../client/src/lib/supremaDedupe';

// =============================================================================
// UX Audit 2026-04-24 — GL-C: Dedupe Suprema import
// =============================================================================

describe('buildSupremaMatchKey', () => {
  it('gera chave determinista para campos basicos', () => {
    const key = buildSupremaMatchKey({
      site: 'Suprema',
      name: 'Dia 01 - Big 20',
      time: '20:00',
      buyIn: '20.00',
    });
    expect(key).toBe('suprema-match:dia 01 - big 20|20:00|20.00');
  });

  it('trata name case-insensitive', () => {
    const a = buildSupremaMatchKey({ name: 'BIG 20', time: '20:00', buyIn: 20 });
    const b = buildSupremaMatchKey({ name: 'big 20', time: '20:00', buyIn: 20 });
    expect(a).toBe(b);
  });

  it('normaliza buy-in com virgula', () => {
    const a = buildSupremaMatchKey({ name: 'x', time: '20:00', buyIn: '21,50' });
    const b = buildSupremaMatchKey({ name: 'x', time: '20:00', buyIn: '21.50' });
    expect(a).toBe(b);
  });

  it('trata time HH:MM:SS truncando para HH:MM', () => {
    const a = buildSupremaMatchKey({ name: 'x', time: '20:00:00', buyIn: 10 });
    const b = buildSupremaMatchKey({ name: 'x', time: '20:00', buyIn: 10 });
    expect(a).toBe(b);
  });

  it('retorna null quando name vazio', () => {
    expect(buildSupremaMatchKey({ name: '', time: '20:00', buyIn: 10 })).toBeNull();
    expect(buildSupremaMatchKey({ time: '20:00', buyIn: 10 })).toBeNull();
  });

  it('retorna null quando time vazio', () => {
    expect(buildSupremaMatchKey({ name: 'x', time: '', buyIn: 10 })).toBeNull();
  });
});

describe('buildSupremaMatchKeysFromSession', () => {
  it('extrai keys apenas de torneios Suprema', () => {
    const keys = buildSupremaMatchKeysFromSession([
      { site: 'Suprema', name: 'A', time: '20:00', buyIn: '10' },
      { site: 'PokerStars', name: 'B', time: '21:00', buyIn: '20' },
      { site: 'suprema', name: 'C', time: '22:00', buyIn: '30' },
    ]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toContain('a|20:00|10.00');
    expect(keys[1]).toContain('c|22:00|30.00');
  });

  it('ignora torneios com status deleted', () => {
    const keys = buildSupremaMatchKeysFromSession([
      { site: 'Suprema', name: 'A', time: '20:00', buyIn: '10', status: 'deleted' },
      { site: 'Suprema', name: 'B', time: '21:00', buyIn: '20', status: 'registered' },
    ]);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain('b|21:00|20.00');
  });

  it('retorna array vazio para input invalido', () => {
    expect(buildSupremaMatchKeysFromSession(null)).toEqual([]);
    expect(buildSupremaMatchKeysFromSession(undefined)).toEqual([]);
    expect(buildSupremaMatchKeysFromSession([])).toEqual([]);
  });

  it('dedupe: mesma chave para entrada duplicada', () => {
    const keyA = buildSupremaMatchKey({
      site: 'Suprema', name: 'Big 20', time: '20:00', buyIn: '20.00',
    });
    const sessionKeys = buildSupremaMatchKeysFromSession([
      { site: 'Suprema', name: 'Big 20', time: '20:00', buyIn: '20.00' },
    ]);
    expect(sessionKeys[0]).toBe(keyA);
  });
});
