/**
 * Sprint grade-compact-drop.
 *
 * Duas funcoes puras novas da grade semanal:
 *   - abbreviateTournamentName: encurta o nome para as 7 colunas caberem.
 *   - computeGradeDropUpdates: decide o horario quando um torneio e solto.
 */

import { describe, it, expect } from 'vitest';
import { abbreviateTournamentName } from '../../../shared/tournament-name-abbrev';
import { computeGradeDropUpdates } from '../../../shared/grade-drop-time';
import { sortCellByTime } from '../../../shared/grade-cell-overflow';

describe('abbreviateTournamentName', () => {
  it('devolve vazio para nome ausente', () => {
    expect(abbreviateTournamentName(undefined)).toBe('');
    expect(abbreviateTournamentName(null)).toBe('');
    expect(abbreviateTournamentName('   ')).toBe('');
  });

  it('tira o buy-in do inicio (o chip ja mostra o valor)', () => {
    expect(abbreviateTournamentName('$25 GGMasters', { maxChars: 30 })).toBe(
      'GGMstrs',
    );
  });

  it('tira a plataforma repetida no nome', () => {
    expect(
      abbreviateTournamentName('GGPoker Mystery', { maxChars: 30, site: 'GGPoker' }),
    ).toBe('Myst');
  });

  it('troca expressoes conhecidas', () => {
    expect(abbreviateTournamentName('Asia Main Event', { maxChars: 30 })).toBe(
      'Asia ME',
    );
    expect(
      abbreviateTournamentName('Bounty Hunters Daily Main', { maxChars: 30 }),
    ).toBe('BH Dly Main');
  });

  it('troca palavras conhecidas', () => {
    expect(
      abbreviateTournamentName('Zodiac Mystery Bounty King', { maxChars: 30 }),
    ).toBe('Zodiac MB King');
  });

  it('respeita o limite de caracteres', () => {
    const out = abbreviateTournamentName(
      'Super Special Grand Championship Final Stage',
      { maxChars: 16 },
    );
    expect(out.length).toBeLessThanOrEqual(16);
    expect(out.endsWith('…')).toBe(true);
  });

  it('nao corta quando ja cabe', () => {
    expect(abbreviateTournamentName('Run Up', { maxChars: 16 })).toBe('Run Up');
  });
});

const T = (over: Record<string, any> = {}) => ({
  id: 'T1',
  dayOfWeek: 1,
  time: '11:00',
  registrationTime: null,
  lateRegMinutes: null,
  ...over,
});

describe('computeGradeDropUpdates', () => {
  it('bloco diferente: assume o horario do bloco de destino', () => {
    const { updates } = computeGradeDropUpdates({
      dragged: T({ time: '10:00' }),
      sourceSlot: '10:00',
      destSlot: '11:00',
      destDayOfWeek: 1,
      destNeighbors: [],
      destIndex: 0,
    });
    expect(updates.time).toBe('11:00');
    expect(updates.dayOfWeek).toBeUndefined();
  });

  it('mesmo bloco: nao mexe no horario', () => {
    const { updates } = computeGradeDropUpdates({
      dragged: T({ time: '11:40' }),
      sourceSlot: '11:00',
      destSlot: '11:00',
      destDayOfWeek: 1,
      destNeighbors: [],
      destIndex: 0,
    });
    expect(updates.time).toBeUndefined();
  });

  it('outro dia na mesma hora: muda o dia e preserva o horario', () => {
    const { updates } = computeGradeDropUpdates({
      dragged: T({ time: '11:40', dayOfWeek: 1 }),
      sourceSlot: '11:00',
      destSlot: '11:00',
      destDayOfWeek: 3,
      destNeighbors: [],
      destIndex: 0,
    });
    expect(updates.dayOfWeek).toBe(3);
    expect(updates.time).toBeUndefined();
  });

  it('solto abaixo de um 11:30 vira 11:31', () => {
    const { updates } = computeGradeDropUpdates({
      dragged: T({ time: '11:00' }),
      sourceSlot: '11:00',
      destSlot: '11:00',
      destDayOfWeek: 1,
      destNeighbors: [T({ id: 'T2', time: '11:30' })],
      destIndex: 1,
    });
    expect(updates.time).toBe('11:31');
  });

  it('solto acima de um torneio mais tarde nao muda nada', () => {
    const { updates } = computeGradeDropUpdates({
      dragged: T({ time: '11:00' }),
      sourceSlot: '11:00',
      destSlot: '11:00',
      destDayOfWeek: 1,
      destNeighbors: [T({ id: 'T2', time: '11:30' })],
      destIndex: 0,
    });
    expect(updates.time).toBeUndefined();
  });

  it('nao vaza para o bloco seguinte (limite :59)', () => {
    const { updates } = computeGradeDropUpdates({
      dragged: T({ time: '11:10' }),
      sourceSlot: '11:00',
      destSlot: '11:00',
      destDayOfWeek: 1,
      destNeighbors: [T({ id: 'T2', time: '11:59' })],
      destIndex: 1,
    });
    expect(updates.time).toBe('11:59');
  });

  it('escreve em registrationTime quando o torneio usa esse campo', () => {
    const { updates } = computeGradeDropUpdates({
      dragged: T({ time: '09:00', registrationTime: '10:20' }),
      sourceSlot: '10:00',
      destSlot: '13:00',
      destDayOfWeek: 1,
      destNeighbors: [],
      destIndex: 0,
    });
    expect(updates.registrationTime).toBe('13:00');
    expect(updates.time).toBeUndefined();
  });

  it('com lateReg, fixa registrationTime para o chip nao voltar de bloco', () => {
    const { updates } = computeGradeDropUpdates({
      dragged: T({ time: '10:00', lateRegMinutes: 60 }),
      sourceSlot: '11:00',
      destSlot: '14:00',
      destDayOfWeek: 1,
      destNeighbors: [],
      destIndex: 0,
    });
    expect(updates.time).toBe('14:00');
    expect(updates.registrationTime).toBe('14:00');
  });
});

describe('sortCellByTime', () => {
  it('ordena por horario de registro, prioridade so desempata', () => {
    const list = [
      { id: 'a', time: '11:40', prioridade: 3 },
      { id: 'b', time: '11:10', prioridade: 2 },
      { id: 'c', time: '11:10', prioridade: 1 },
    ];
    expect(sortCellByTime(list).map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('respeita registrationTime na frente de time', () => {
    const list = [
      { id: 'a', time: '11:00', registrationTime: '11:50' },
      { id: 'b', time: '11:30' },
    ];
    expect(sortCellByTime(list).map((t) => t.id)).toEqual(['b', 'a']);
  });
});
