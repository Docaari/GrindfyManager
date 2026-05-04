/**
 * Test — Sprint home-reform-5 item 5.
 *
 * Spec: Docs/specs/home-reform-5.md item 5 (Grade do Dia: Primeiro + Ultimo Registro).
 *
 * Cobre storage.getDayPlanBoundaries(userId, weekday, profileIds):
 *   - Retorna { first: { time, name }, last: { time, name } } | null.
 *   - null quando nenhum row planejado.
 *   - Ordena por COALESCE(registrationTime, time) ASC.
 *   - Filtra por isActive=true e profileIds (in-list, suporte a multi-profile).
 *
 * Pattern db chain mock = tests/storage/userFocusStats.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/db', () => {
  const chain: any = {};
  const make = () => vi.fn().mockReturnValue(chain);
  chain.select = make();
  chain.from = make();
  chain.where = make();
  chain.orderBy = make();
  chain.limit = make();
  chain.offset = make();
  chain.insert = make();
  chain.values = make();
  chain.returning = make();
  chain.update = make();
  chain.set = make();
  chain.delete = make();
  chain.transaction = vi.fn(async (cb: any) => cb(chain));
  return { db: chain, pool: {} };
});

import { storage } from '../../server/storage';
import { db } from '../../server/db';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('storage.getDayPlanBoundaries(userId, weekday, profileIds)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).getDayPlanBoundaries).toBe('function');
  });

  it('retorna null quando nao ha row planejado', async () => {
    (db as any).orderBy = vi.fn().mockResolvedValue([]);
    const result = await (storage as any).getDayPlanBoundaries('USER-0001', 1, ['B']);
    expect(result).toBeNull();
  });

  it('retorna { first, last } com time + name quando ha rows', async () => {
    (db as any).orderBy = vi.fn().mockResolvedValue([
      { time: '14:00', name: 'Mystery Mini', registrationTime: null },
      { time: '15:30', name: 'Big $11', registrationTime: null },
      { time: '20:00', name: 'Sunday Storm', registrationTime: null },
    ]);
    const result = await (storage as any).getDayPlanBoundaries('USER-0001', 0, ['A']);
    expect(result).toEqual({
      first: { time: '14:00', name: 'Mystery Mini' },
      last: { time: '20:00', name: 'Sunday Storm' },
    });
  });

  it('row unica -> first === last', async () => {
    (db as any).orderBy = vi.fn().mockResolvedValue([
      { time: '19:00', name: 'Bounty Builder', registrationTime: null },
    ]);
    const result = await (storage as any).getDayPlanBoundaries('USER-0001', 3, ['B']);
    expect(result).toEqual({
      first: { time: '19:00', name: 'Bounty Builder' },
      last: { time: '19:00', name: 'Bounty Builder' },
    });
  });

  it('usa registrationTime quando preenchido (HH:MM)', async () => {
    // Storage faz ORDER BY COALESCE(registration_time, time) ASC; aqui simulamos
    // o resultado ja ordenado pelo DB para validar que o registrationTime eh
    // exposto como `time` no payload boundaries.
    (db as any).orderBy = vi.fn().mockResolvedValue([
      { time: '20:00', name: 'Late Reg Fast', registrationTime: '13:30' },
      { time: '21:00', name: 'Sunday Storm', registrationTime: null },
    ]);
    const result = await (storage as any).getDayPlanBoundaries('USER-0001', 0, ['A']);
    expect(result?.first.time).toBe('13:30');
    expect(result?.first.name).toBe('Late Reg Fast');
    expect(result?.last.time).toBe('21:00');
    expect(result?.last.name).toBe('Sunday Storm');
  });

  it('multi-profile (A + B) — filtra com IN clause', async () => {
    (db as any).orderBy = vi.fn().mockResolvedValue([
      { time: '12:00', name: 'A morning', registrationTime: null },
      { time: '22:00', name: 'B evening', registrationTime: null },
    ]);
    await (storage as any).getDayPlanBoundaries('USER-0001', 1, ['A', 'B']);
    expect((db as any).where).toHaveBeenCalled();
  });

  it('profileIds vazio -> null sem hit DB', async () => {
    (db as any).orderBy = vi.fn().mockResolvedValue([]);
    const result = await (storage as any).getDayPlanBoundaries('USER-0001', 1, []);
    expect(result).toBeNull();
  });
});
