/**
 * Sprint Backend Tech-Debt Sweep — RF-01.07 Position >= 0 (clamp negativos a 0)
 *
 * Spec: Docs/specs/sprint-backend-sweep.md (R1-07)
 *
 * Comportamento esperado:
 *   - Position negativa (parseIntSafe pode retornar inteiro negativo se CSV
 *     vier com lixo) é zerada via `Math.max(0, ...)`.
 *   - Position 0 ou ausente fica 0.
 *   - Position válida positiva preservada.
 *   - Position > totalPlayers (fieldSize) NÃO é clampada pelo parser (decisão
 *     do dashboard) — apenas validamos que parser NÃO truncate silenciosamente.
 *
 * Aplica a TODOS os parsers de rede (PokerStars, GGPoker, 888, WPN,
 * PartyPoker, Chico, iPoker, Generic, Brazilian).
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
    ' Result': '0',
    ' Position': '100',
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
    'Result': '-20',
    'Position': '100',
    'Flags': 'Bounty Multi-Entry',
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

describe('RF-01.07 — Position negativa zerada (PokerStars)', () => {
  it('position = "-5" vira 0', async () => {
    const csv = buildCSV([starsRow({ ' Position': '-5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(0);
  });

  it('position = "0" fica 0', async () => {
    const csv = buildCSV([starsRow({ ' Position': '0' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(0);
  });

  it('position = "100" (positiva) preservada', async () => {
    const csv = buildCSV([starsRow({ ' Position': '100' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(100);
  });

  it('position vazia/ausente vira 0', async () => {
    const csv = buildCSV([starsRow({ ' Position': '' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(0);
  });

  it('position negativa grande "-999" vira 0', async () => {
    const csv = buildCSV([starsRow({ ' Position': '-999' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(0);
  });
});

describe('RF-01.07 — Position negativa zerada (GGPoker)', () => {
  it('position = "-5" vira 0', async () => {
    const csv = buildCSV([ggRow({ 'Position': '-5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(0);
  });

  it('position válida preservada', async () => {
    const csv = buildCSV([ggRow({ 'Position': '45' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(45);
  });
});

describe('RF-01.07 — Position negativa zerada (WPN)', () => {
  it('position = "-2" vira 0 (WPN)', async () => {
    const csv = buildCSV([{
      'Network': 'WPN',
      ' Player': 'tester',
      ' Game ID': '4001',
      ' Stake': '50',
      ' Rake': '5',
      ' Result': '0',
      ' Position': '-2',
      ' Entrants': '500',
      ' Date': '2025-01-15 18:00',
      ' Currency': 'USD',
      ' Name': 'WPN Daily',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(0);
  });
});

describe('RF-01.07 — Position negativa zerada (888poker)', () => {
  it('position = "-3" vira 0 (888poker)', async () => {
    const csv = buildCSV([{
      'Network': '888Poker',
      'Player': 'tester',
      'Game ID': '3001',
      'Stake': '50',
      'Date': '2025-01-15 18:00',
      'Entrants': '500',
      'Rake': '5',
      'Game': 'H',
      'Structure': 'No Limit',
      'Speed': 'Normal',
      'Result': '0',
      'Position': '-3',
      'Flags': 'Standard',
      'Currency': 'USD',
      'ReEntries/Rebuys': '',
      'Duration': '0',
      'Players Per Table': '8',
      'Prize': '',
      'Name': '888 Daily',
      'Total ReEntries': '0',
    }]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(0);
  });
});

describe('RF-01.07 — Position > fieldSize não é clampada silenciosamente', () => {
  it('position=600 com fieldSize=500 fica 600 (parser não muta)', async () => {
    // Comportamento documentado: parser preserva. Validação fica em dashboard
    // (out-of-scope para sweep).
    const csv = buildCSV([starsRow({ ' Position': '600', ' Entrants': '500' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(600);
  });
});
