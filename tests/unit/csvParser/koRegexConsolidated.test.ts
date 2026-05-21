/**
 * Sprint Backend Tech-Debt Sweep — RF-01.04 KO regex consolidada (word-boundary)
 *
 * Spec: Docs/specs/sprint-backend-sweep.md (R1-04)
 *
 * Comportamento esperado:
 *   - `detectCategory` usa `/\bKO\b/.test(nameUpper)` em vez de `.includes('KO')`.
 *   - Nomes com 'KO' como substring (e.g. "TOKYO", "SMOKE") NÃO matcheiam PKO.
 *   - Variantes válidas detectadas: "$5+$0.50KO", "$5 + $0.50 KO", "Super-KO",
 *     "$22 PKO", "Progressive Knockout".
 *   - Flags com BOUNTY mantém detecção via flagsUpper.
 */
import { describe, it, expect } from 'vitest';
import { PokerCSVParser } from '../../../server/csvParser';

function buildCSV(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]).join(',');
  const dataLines = rows.map(r => Object.values(r).join(','));
  return [headers, ...dataLines].join('\n');
}

function row(overrides: Record<string, string> = {}): Record<string, string> {
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

// ---------------------------------------------------------------------------
// Casos POSITIVOS — devem virar 'PKO'
// ---------------------------------------------------------------------------

describe('RF-01.04 — KO word-boundary: casos positivos (PKO)', () => {
  const positiveNames = [
    '$5+$0.50KO',
    '$5 + $0.50 KO',
    '$5+$0.50 BOUNTY',
    'Super-KO Special',
    '$22 PKO',
    'Progressive Knockout',
    'Sunday KO Series',
    'Bounty Hunters',
  ];

  it.each(positiveNames)('nome "%s" → category PKO', async (name) => {
    const csv = buildCSV([row({ ' Name': name })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('PKO');
  });

  it('flag BOUNTY mesmo com nome neutro vira PKO', async () => {
    const csv = buildCSV([row({ ' Name': '$22 NLHE Sunday', ' Flags': 'Bounty Multi-Entry' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('PKO');
  });
});

// ---------------------------------------------------------------------------
// Casos NEGATIVOS — NÃO devem virar PKO
// ---------------------------------------------------------------------------

describe('RF-01.04 — KO word-boundary: casos negativos (NÃO PKO)', () => {
  const negativeNames = [
    'TOKYO Sunday $11',
    'TOKYO $11',
    'SMOKE Tournament',
    'PIKO Special',
    'BAKOLDE $5',
    'KOREA Heads-Up',
    'KOLKATA Daily',
    'KOOL Special',
  ];

  it.each(negativeNames)('nome "%s" → NÃO PKO (Vanilla ou outro)', async (name) => {
    const csv = buildCSV([row({ ' Name': name })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).not.toBe('PKO');
  });

  it('nome "TOKYO $11" vira Vanilla (sem KO real)', async () => {
    const csv = buildCSV([row({ ' Name': 'TOKYO $11' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('Vanilla');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('RF-01.04 — KO regex edge cases', () => {
  it('nome com "KO" em letra minúscula no início — comportamento esperado consistente', async () => {
    const csv = buildCSV([row({ ' Name': 'ko special $5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // detectCategory faz toUpperCase + word boundary; "ko" → "KO" matches \bKO\b
    expect(result[0].category).toBe('PKO');
  });

  it('nome com "PKO" minúsculo vira PKO via toUpperCase', async () => {
    const csv = buildCSV([row({ ' Name': '$22 pko sunday' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('PKO');
  });

  it('Mystery tem prioridade sobre PKO mesmo com KO no nome', async () => {
    const csv = buildCSV([row({ ' Name': '$55 Mystery KO Bounty', ' Flags': 'Bounty' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('Mystery');
  });
});
