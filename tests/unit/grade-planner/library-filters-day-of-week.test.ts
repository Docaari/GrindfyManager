/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint coach-page-reform-1 — RF-05.1 + RF-05.3.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-05.
 *
 * Estende `filterLibraryTournaments` (em @shared/library-filters) para aceitar:
 *   - filterDaysOfWeek?: number[]   (filtra por tournaments.dayOfWeek)
 *   - filterSites?: string[]        (alias mais explicito de `sites`)
 *
 * Comportamento:
 *   - filterDaysOfWeek vazio = sem filtro (todos passam, incluindo dayOfWeek=null).
 *   - filterDaysOfWeek com valores = filtra IN (array). dayOfWeek=null EXCLUIDO.
 *   - filterSites: alias / paralelo a `sites`. Se ambos presentes, comportamento
 *     UNION (OR) entre sites e filterSites ou priorizar filterSites — implementer
 *     decide conforme RF-05.1, mas array vazio = sem filtro.
 *   - Compat: filterSite (single string) legado pode coexistir como deprecated;
 *     este teste usa apenas a forma multi-select nova.
 *
 * Lessons:
 *   #3 — mock shape REAL (LibraryTournament tem id, name, site, buyIn, time,
 *        type, speed, dayOfWeek?: number | null).
 */

import { describe, it, expect } from 'vitest';
// @ts-expect-error - red phase: campo filterDaysOfWeek nao existe ainda
import { filterLibraryTournaments } from '@shared/library-filters';

const mkT = (overrides: any) => ({
  id: 't' + Math.random().toString(36).slice(2, 8),
  name: 'Test',
  site: 'PokerStars',
  buyIn: '10',
  time: '20:00',
  type: 'Vanilla',
  speed: 'Normal',
  dayOfWeek: null as number | null,
  ...overrides,
});

describe('filterLibraryTournaments — filterDaysOfWeek (RF-05.3)', () => {
  it('array vazio = sem filtro (passa todos, incluindo dayOfWeek=null)', () => {
    const list = [
      mkT({ id: '1', dayOfWeek: 0 }),
      mkT({ id: '2', dayOfWeek: 3 }),
      mkT({ id: '3', dayOfWeek: null }),
    ];
    const out = filterLibraryTournaments(list as any, { filterDaysOfWeek: [] } as any);
    expect(out).toHaveLength(3);
  });

  it('filtro [3] passa apenas tournaments com dayOfWeek=3', () => {
    const list = [
      mkT({ id: '1', dayOfWeek: 0 }),
      mkT({ id: '2', dayOfWeek: 3 }),
      mkT({ id: '3', dayOfWeek: 6 }),
      mkT({ id: '4', dayOfWeek: null }),
    ];
    const out = filterLibraryTournaments(list as any, { filterDaysOfWeek: [3] } as any);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('2');
  });

  it('filtro [3, 6] passa quartas + sabados; null fica EXCLUIDO', () => {
    const list = [
      mkT({ id: '1', dayOfWeek: 0 }),  // Domingo
      mkT({ id: '2', dayOfWeek: 3 }),  // Quarta
      mkT({ id: '3', dayOfWeek: 6 }),  // Sabado
      mkT({ id: '4', dayOfWeek: null }), // sem dia
    ];
    const out = filterLibraryTournaments(list as any, { filterDaysOfWeek: [3, 6] } as any);
    const ids = out.map((t) => t.id).sort();
    expect(ids).toEqual(['2', '3']);
  });

  it('quando filterDaysOfWeek ativo, dayOfWeek=null SEMPRE excluido', () => {
    const list = [
      mkT({ id: '1', dayOfWeek: null }),
      mkT({ id: '2', dayOfWeek: null }),
    ];
    const out = filterLibraryTournaments(list as any, { filterDaysOfWeek: [0] } as any);
    expect(out).toHaveLength(0);
  });
});

describe('filterLibraryTournaments — filterSites (RF-05.1)', () => {
  it('filterSites com array vazio = sem filtro', () => {
    const list = [
      mkT({ id: '1', site: 'PokerStars' }),
      mkT({ id: '2', site: 'GGPoker' }),
    ];
    const out = filterLibraryTournaments(list as any, { filterSites: [] } as any);
    expect(out).toHaveLength(2);
  });

  it('filterSites = ["PokerStars"] passa apenas PokerStars', () => {
    const list = [
      mkT({ id: '1', site: 'PokerStars' }),
      mkT({ id: '2', site: 'GGPoker' }),
      mkT({ id: '3', site: 'WPN' }),
    ];
    const out = filterLibraryTournaments(list as any, { filterSites: ['PokerStars'] } as any);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('1');
  });

  it('filterSites = ["PokerStars", "GGPoker"] OR semantics dentro da dimensao', () => {
    const list = [
      mkT({ id: '1', site: 'PokerStars' }),
      mkT({ id: '2', site: 'GGPoker' }),
      mkT({ id: '3', site: 'WPN' }),
    ];
    const out = filterLibraryTournaments(list as any, {
      filterSites: ['PokerStars', 'GGPoker'],
    } as any);
    expect(out).toHaveLength(2);
    const ids = out.map((t) => t.id).sort();
    expect(ids).toEqual(['1', '2']);
  });
});

describe('filterLibraryTournaments — combinacao plataforma + dia', () => {
  it('AND entre dimensoes (plataforma + dia), OR dentro de cada', () => {
    const list = [
      mkT({ id: '1', site: 'PokerStars', dayOfWeek: 3 }),  // match
      mkT({ id: '2', site: 'PokerStars', dayOfWeek: 6 }),  // match
      mkT({ id: '3', site: 'GGPoker', dayOfWeek: 3 }),     // miss site
      mkT({ id: '4', site: 'PokerStars', dayOfWeek: 1 }),  // miss day
      mkT({ id: '5', site: 'WPN', dayOfWeek: null }),
    ];
    const out = filterLibraryTournaments(list as any, {
      filterSites: ['PokerStars'],
      filterDaysOfWeek: [3, 6],
    } as any);
    const ids = out.map((t) => t.id).sort();
    expect(ids).toEqual(['1', '2']);
  });
});
