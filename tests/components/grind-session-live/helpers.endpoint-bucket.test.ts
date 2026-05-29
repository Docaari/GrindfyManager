/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint grind-live-detail-parity
 *
 * Spec: Docs/specs/sprint-grind-live-detail-parity.md
 *   - RF-05 bucketUpcomingByHour (HH:00 bucketing, paridade DayDetailZoom plannedSlots)
 *   - Notas: resolveTournamentEndpoint(id) (D2)
 * ADR-214 D1 (bucketing HH:00 helper novo) + D2 (resolveTournamentEndpoint por prefixo).
 *
 * Estes helpers AINDA NAO EXISTEM em helpers.ts — o implementer vai cria-los.
 * Todos os testes devem FALHAR por simbolo ausente (red phase).
 *
 * Helpers PUROS: nenhum DOM. Arquivo `.test.ts` (roda em node + jsdom conforme
 * vitest.config.ts projects). helpers.ts so importa @shared/* (sem deps UI).
 *
 * Lessons aplicadas:
 *   - #14/#26 await import (nao require) ao carregar o modulo helpers.
 */

import { describe, it, expect } from 'vitest';

const HELPERS = '../../../client/src/components/grind-session-live/helpers';

describe('resolveTournamentEndpoint (ADR-214 D2)', () => {
  it('id com prefixo planned- -> /api/planned-tournaments/{realId} (slice(8))', async () => {
    const { resolveTournamentEndpoint } = await import(HELPERS);
    expect(resolveTournamentEndpoint('planned-abc')).toBe('/api/planned-tournaments/abc');
  });

  it('id sem prefixo -> /api/session-tournaments/{id}', async () => {
    const { resolveTournamentEndpoint } = await import(HELPERS);
    expect(resolveTournamentEndpoint('sess-1')).toBe('/api/session-tournaments/sess-1');
  });

  it('prefixo planned- removido exatamente via slice(8) (planned- tem 8 chars)', async () => {
    const { resolveTournamentEndpoint } = await import(HELPERS);
    // 'planned-' = 8 chars; realId preserva qualquer coisa que venha depois.
    expect(resolveTournamentEndpoint('planned-XYZ-123')).toBe('/api/planned-tournaments/XYZ-123');
  });

  it('id que apenas CONTEM "planned-" no meio (nao prefixo) cai no branch session', async () => {
    const { resolveTournamentEndpoint } = await import(HELPERS);
    expect(resolveTournamentEndpoint('sess-planned-1')).toBe('/api/session-tournaments/sess-planned-1');
  });
});

describe('bucketUpcomingByHour (ADR-214 D1 / RF-05)', () => {
  function t(overrides: any = {}) {
    return {
      id: overrides.id ?? `t-${Math.random().toString(36).slice(2, 7)}`,
      name: 'Torneio',
      site: 'PokerStars',
      buyIn: '20',
      prioridade: 2,
      ...overrides,
    };
  }

  it('agrupa "20:15" e "20:45" (registrationTime) no MESMO bucket "20:00"', async () => {
    const { bucketUpcomingByHour } = await import(HELPERS);
    const result = bucketUpcomingByHour([
      t({ id: 'a', registrationTime: '20:15' }),
      t({ id: 'b', registrationTime: '20:45' }),
    ]);
    const bucket2000 = result.find((b: any) => b.hour === '20:00');
    expect(bucket2000).toBeDefined();
    expect(bucket2000.tournaments.map((x: any) => x.id).sort()).toEqual(['a', 'b']);
  });

  it('"21:05" cai em bucket "21:00" separado de "20:00"', async () => {
    const { bucketUpcomingByHour } = await import(HELPERS);
    const result = bucketUpcomingByHour([
      t({ id: 'a', registrationTime: '20:15' }),
      t({ id: 'c', registrationTime: '21:05' }),
    ]);
    const hours = result.map((b: any) => b.hour);
    expect(hours).toContain('20:00');
    expect(hours).toContain('21:00');
    const b21 = result.find((b: any) => b.hour === '21:00');
    expect(b21.tournaments.map((x: any) => x.id)).toEqual(['c']);
  });

  it('bucketRef usa registrationTime QUANDO presente (nao time)', async () => {
    const { bucketUpcomingByHour } = await import(HELPERS);
    // time=18:00 mas registrationTime=22:30 -> bucket 22:00
    const result = bucketUpcomingByHour([
      t({ id: 'a', time: '18:00', registrationTime: '22:30' }),
    ]);
    expect(result.map((b: any) => b.hour)).toEqual(['22:00']);
  });

  it('bucketRef cai em time QUANDO registrationTime ausente', async () => {
    const { bucketUpcomingByHour } = await import(HELPERS);
    const result = bucketUpcomingByHour([
      t({ id: 'a', time: '19:30', registrationTime: null }),
    ]);
    expect(result.map((b: any) => b.hour)).toEqual(['19:00']);
  });

  it('hora de um digito recebe padStart 2 -> "09:00"', async () => {
    const { bucketUpcomingByHour } = await import(HELPERS);
    const result = bucketUpcomingByHour([
      t({ id: 'a', registrationTime: '9:05' }),
    ]);
    expect(result.map((b: any) => b.hour)).toEqual(['09:00']);
  });

  it('buckets ordenados por hora ASC (20:00 antes de 21:00)', async () => {
    const { bucketUpcomingByHour } = await import(HELPERS);
    const result = bucketUpcomingByHour([
      t({ id: 'c', registrationTime: '21:05' }),
      t({ id: 'a', registrationTime: '20:15' }),
    ]);
    expect(result.map((b: any) => b.hour)).toEqual(['20:00', '21:00']);
  });

  it('sort intra-bucket: prioridade ASC (1=Alta topo) primeiro', async () => {
    const { bucketUpcomingByHour } = await import(HELPERS);
    const result = bucketUpcomingByHour([
      t({ id: 'media', registrationTime: '20:10', prioridade: 2, buyIn: '50' }),
      t({ id: 'alta', registrationTime: '20:20', prioridade: 1, buyIn: '20' }),
      t({ id: 'baixa', registrationTime: '20:05', prioridade: 3, buyIn: '100' }),
    ]);
    const bucket = result.find((b: any) => b.hour === '20:00');
    // Prioridade domina o sort intra-bucket (Alta=1 sobe ao topo).
    expect(bucket.tournaments[0].id).toBe('alta');
  });

  it('sort intra-bucket: empate de prioridade -> time ASC', async () => {
    const { bucketUpcomingByHour } = await import(HELPERS);
    const result = bucketUpcomingByHour([
      t({ id: 'tarde', registrationTime: '20:45', prioridade: 2, buyIn: '20' }),
      t({ id: 'cedo', registrationTime: '20:05', prioridade: 2, buyIn: '20' }),
    ]);
    const bucket = result.find((b: any) => b.hour === '20:00');
    expect(bucket.tournaments.map((x: any) => x.id)).toEqual(['cedo', 'tarde']);
  });

  it('sort intra-bucket: empate prioridade+time -> buyIn DESC', async () => {
    const { bucketUpcomingByHour } = await import(HELPERS);
    const result = bucketUpcomingByHour([
      t({ id: 'barato', registrationTime: '20:30', prioridade: 2, buyIn: '20' }),
      t({ id: 'caro', registrationTime: '20:30', prioridade: 2, buyIn: '500' }),
    ]);
    const bucket = result.find((b: any) => b.hour === '20:00');
    // buyIn DESC: caro antes de barato.
    expect(bucket.tournaments.map((x: any) => x.id)).toEqual(['caro', 'barato']);
  });

  it('torneio sem time E sem registrationTime cai no fallback (primeiro bucket), NAO some', async () => {
    const { bucketUpcomingByHour } = await import(HELPERS);
    const result = bucketUpcomingByHour([
      t({ id: 'semhora', time: null, registrationTime: null }),
      t({ id: 'com20', registrationTime: '20:00' }),
    ]);
    // Nenhum torneio sumiu.
    const allIds = result.flatMap((b: any) => b.tournaments.map((x: any) => x.id));
    expect(allIds).toContain('semhora');
    expect(allIds).toContain('com20');
    // Fallback = primeiro bucket.
    expect(result[0].tournaments.map((x: any) => x.id)).toContain('semhora');
  });

  it('lista vazia -> retorna []', async () => {
    const { bucketUpcomingByHour } = await import(HELPERS);
    expect(bucketUpcomingByHour([])).toEqual([]);
  });

  it('preserva todos os torneios (count total = input count)', async () => {
    const { bucketUpcomingByHour } = await import(HELPERS);
    const input = [
      t({ id: 'a', registrationTime: '20:15' }),
      t({ id: 'b', registrationTime: '20:45' }),
      t({ id: 'c', registrationTime: '21:05' }),
      t({ id: 'd', time: '22:00' }),
    ];
    const result = bucketUpcomingByHour(input);
    const total = result.reduce((acc: number, b: any) => acc + b.tournaments.length, 0);
    expect(total).toBe(4);
  });
});
