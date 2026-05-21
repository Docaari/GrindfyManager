/**
 * Sprint Backend Tech-Debt Sweep — RF-01.05 iPoker Fury/Rebuy restrito
 *
 * Spec: Docs/specs/sprint-backend-sweep.md (R1-05)
 *
 * Comportamento esperado:
 *   - iPoker normal (sem Fury, sem Rebuy):
 *     prize = Result (já NET na origem)
 *
 *   - iPoker Fury (nome contém /\bFury\b/i):
 *     prize = Result - Stake (dedução extra do segundo buy-in)
 *     buyIn = stake*2 + rake
 *
 *   - iPoker Rebuy (flag E nome contêm /\bRebuy\b/i):
 *     prize = Result - Stake
 *     buyIn = stake*2 + rake
 *
 *   - "Rebuy Special" sem flag Rebuy → NÃO Fury (regra restrita ao flag+nome).
 */
import { describe, it, expect } from 'vitest';
import { PokerCSVParser } from '../../../server/csvParser';

function buildCSV(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]).join(',');
  const dataLines = rows.map(r => Object.values(r).join(','));
  return [headers, ...dataLines].join('\n');
}

function ipokerRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'Network': 'iPoker',
    ' Player': 'tester',
    ' Game ID': '7001',
    ' Stake': '50',
    ' Rake': '5',
    ' Result': '100',
    ' Position': '10',
    ' Entrants': '500',
    ' Date': '2025-01-15 18:00',
    ' Currency': 'USD',
    ' Name': 'iPoker Daily',
    ' Flags': '',
    ' Speed': '',
    ' ReEntries/Rebuys': '0',
    ...overrides,
  };
}

describe('RF-01.05 — iPoker normal (sem Fury, sem Rebuy)', () => {
  it('prize = Result (sem dedução extra)', async () => {
    const csv = buildCSV([
      ipokerRow({ ' Result': '100', ' Stake': '50', ' Rake': '5', ' Name': 'iPoker Sunday' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(100, 2);
  });

  it('buyIn = stake + rake (normal)', async () => {
    const csv = buildCSV([
      ipokerRow({ ' Result': '0', ' Stake': '50', ' Rake': '5', ' Name': 'iPoker Daily' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].buyIn).toBeCloseTo(55, 2); // 50 + 5
  });
});

describe('RF-01.05 — iPoker Fury (nome contém Fury)', () => {
  it('prize = Result - Stake (dedução extra)', async () => {
    const csv = buildCSV([
      ipokerRow({
        ' Result': '100',
        ' Stake': '50',
        ' Rake': '5',
        ' Name': 'Fury $50 NLHE',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // Fury: prize = result - stake = 100 - 50 = 50
    expect(result[0].prize).toBeCloseTo(50, 2);
  });

  it('buyIn = stake*2 + rake (segundo buy-in implícito)', async () => {
    const csv = buildCSV([
      ipokerRow({
        ' Result': '100',
        ' Stake': '50',
        ' Rake': '5',
        ' Name': 'Fury $50 NLHE',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].buyIn).toBeCloseTo(105, 2); // 50*2 + 5
  });

  it('Fury case-insensitive ("FURY"/"fury") também ativa regra', async () => {
    const csv = buildCSV([
      ipokerRow({ ' Result': '100', ' Stake': '50', ' Rake': '5', ' Name': 'FURY Special' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(50, 2);
    expect(result[0].buyIn).toBeCloseTo(105, 2);
  });
});

describe('RF-01.05 — iPoker Rebuy (flag E nome contêm Rebuy)', () => {
  it('flag Rebuy + nome com Rebuy → ativa regra (prize = Result - Stake)', async () => {
    const csv = buildCSV([
      ipokerRow({
        ' Result': '100',
        ' Stake': '50',
        ' Rake': '5',
        ' Name': 'Rebuy Festival $50',
        ' Flags': 'Rebuy',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(50, 2);
    expect(result[0].buyIn).toBeCloseTo(105, 2);
  });

  it('só nome com Rebuy (sem flag) → NÃO ativa Fury rule', async () => {
    const csv = buildCSV([
      ipokerRow({
        ' Result': '100',
        ' Stake': '50',
        ' Rake': '5',
        ' Name': 'Rebuy Special $50',
        ' Flags': '',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // sem flag, comportamento iPoker normal: prize = result = 100
    expect(result[0].prize).toBeCloseTo(100, 2);
    expect(result[0].buyIn).toBeCloseTo(55, 2);
  });

  it('só flag Rebuy (sem nome com Rebuy) → NÃO ativa Fury rule', async () => {
    const csv = buildCSV([
      ipokerRow({
        ' Result': '100',
        ' Stake': '50',
        ' Rake': '5',
        ' Name': 'Sunday Major $50',
        ' Flags': 'Rebuy Multi-Entry',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(100, 2);
    expect(result[0].buyIn).toBeCloseTo(55, 2);
  });
});

describe('RF-01.05 — interação Fury vs site iPoker', () => {
  it('Fury só ativa em iPoker (site = "iPoker")', async () => {
    const csv = buildCSV([
      ipokerRow({ ' Result': '100', ' Stake': '50', ' Rake': '5', ' Name': 'Fury $50' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('iPoker');
  });
});
