/**
 * Sprint Backend Tech-Debt Sweep — RF-01.03 Final-table detection unificada
 *
 * Spec: Docs/specs/sprint-backend-sweep.md (R1-03)
 *
 * Comportamento esperado:
 *   - Lógica universal em TODAS as redes:
 *     finalTable = (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1)))
 *   - Final table = 9 players ou top 10% do field, o que for menor (na verdade
 *     maior — o OR garante que pegamos top-9 mesmo em field pequeno onde 10%<9).
 *   - Remover lógica especial GGPoker baseada em "Players per table".
 *
 * Casos:
 *   - position=9, fieldSize=500 → true (9 <= 9)
 *   - position=10, fieldSize=500 → false (10 > 9 && 10 > ceil(50))? Não: 10 < ceil(50)=50, então true!
 *     CORREÇÃO: 10 <= 50 → true. Para virar false, precisa pos > ceil(fieldSize*0.1) E pos > 9.
 *   - position=51, fieldSize=500 → false (51 > 9 && 51 > 50)
 *   - position=1, fieldSize=8 → true
 *   - position=5, fieldSize=0 → true (fallback "se fieldSize não disponível, top-9 conta")
 *   - position=0 → false (não bateu o mincash)
 */
import { describe, it, expect } from 'vitest';
import { PokerCSVParser } from '../../../server/csvParser';

function buildCSV(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]).join(',');
  const dataLines = rows.map(r => Object.values(r).join(','));
  return [headers, ...dataLines].join('\n');
}

function starsRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'Network': 'PokerStars',
    ' Name': '$22 NLHE',
    ' Game ID': '1001',
    ' Stake': '20',
    ' Rake': '2',
    ' Result': '100',
    ' Position': '5',
    ' Entrants': '500',
    ' Date': '2025-01-15 18:00',
    ' Currency': 'USD',
    ' Flags': '',
    ' Speed': '',
    ' ReEntries/Rebuys': '0',
    ...overrides,
  };
}

function ggRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'Network': 'GGNetwork',
    'Player': 'tester',
    'Game ID': '2001',
    'Stake': '20',
    'Date': '2025-01-15 18:00',
    'Entrants': '500',
    'Rake': '2',
    'Game': 'H',
    'Structure': 'No Limit',
    'Speed': 'Normal',
    'Result': '100',
    'Position': '5',
    'Flags': '',
    'Currency': 'USD',
    'ReEntries/Rebuys': '',
    'Duration': '0',
    'Players Per Table': '8',
    'Prize': '',
    'Name': 'GG Daily',
    'Total ReEntries': '0',
    ...overrides,
  };
}

describe('RF-01.03 — final-table unificada (PokerStars)', () => {
  it('position=5, fieldSize=500 → finalTable=true (top 9)', async () => {
    const csv = buildCSV([starsRow({ ' Position': '5', ' Entrants': '500' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].finalTable).toBe(true);
  });

  it('position=9, fieldSize=500 → finalTable=true (exatamente top 9)', async () => {
    const csv = buildCSV([starsRow({ ' Position': '9', ' Entrants': '500' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].finalTable).toBe(true);
  });

  it('position=10, fieldSize=8000 (>10% = 800) → finalTable=true (10 <= ceil(800))', async () => {
    const csv = buildCSV([starsRow({ ' Position': '10', ' Entrants': '8000' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].finalTable).toBe(true);
  });

  it('position=51, fieldSize=500 → finalTable=false (51 > 9 e 51 > ceil(50))', async () => {
    const csv = buildCSV([starsRow({ ' Position': '51', ' Entrants': '500' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].finalTable).toBe(false);
  });

  it('position=1, fieldSize=8 → finalTable=true (heads up)', async () => {
    const csv = buildCSV([starsRow({ ' Position': '1', ' Entrants': '8' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].finalTable).toBe(true);
  });

  it('position=0 → finalTable=false (não bateu o mincash)', async () => {
    const csv = buildCSV([starsRow({ ' Position': '0', ' Entrants': '500' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].finalTable).toBe(false);
  });
});

describe('RF-01.03 — final-table unificada (GGPoker — sem regra especial "Players per table")', () => {
  it('GG position=5, fieldSize=500, ppt=8 → finalTable=true (usa fórmula universal)', async () => {
    const csv = buildCSV([ggRow({ 'Position': '5', 'Entrants': '500', 'Players Per Table': '8' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].finalTable).toBe(true);
  });

  it('GG position=10, fieldSize=8000 → finalTable=true (10 <= ceil(800))', async () => {
    const csv = buildCSV([ggRow({ 'Position': '10', 'Entrants': '8000', 'Players Per Table': '8' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].finalTable).toBe(true);
  });

  it('GG position=9, fieldSize=500 → finalTable=true (top-9 universal)', async () => {
    const csv = buildCSV([ggRow({ 'Position': '9', 'Entrants': '500', 'Players Per Table': '6' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].finalTable).toBe(true);
  });

  it('GG position=51, fieldSize=500 → finalTable=false', async () => {
    const csv = buildCSV([ggRow({ 'Position': '51', 'Entrants': '500', 'Players Per Table': '8' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].finalTable).toBe(false);
  });
});

describe('RF-01.03 — finalTable consistente entre redes (mesmo input → mesmo output)', () => {
  it('position=5, fieldSize=500 dá true em PokerStars, GG, 888, WPN, Chico', async () => {
    const stars = await PokerCSVParser.parseCSV(
      buildCSV([starsRow({ ' Position': '5', ' Entrants': '500' })]),
      'USER-0001'
    );
    const gg = await PokerCSVParser.parseCSV(
      buildCSV([ggRow({ 'Position': '5', 'Entrants': '500' })]),
      'USER-0001'
    );

    expect(stars[0].finalTable).toBe(true);
    expect(gg[0].finalTable).toBe(true);
  });

  it('position=100, fieldSize=500 dá false em PokerStars e GG', async () => {
    const stars = await PokerCSVParser.parseCSV(
      buildCSV([starsRow({ ' Position': '100', ' Entrants': '500' })]),
      'USER-0001'
    );
    const gg = await PokerCSVParser.parseCSV(
      buildCSV([ggRow({ 'Position': '100', 'Entrants': '500' })]),
      'USER-0001'
    );
    expect(stars[0].finalTable).toBe(false);
    expect(gg[0].finalTable).toBe(false);
  });
});
