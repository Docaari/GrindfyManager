/**
 * Sprint Backend Tech-Debt Sweep — RF-01.02 network detection case-insensitive
 *
 * Spec: Docs/specs/sprint-backend-sweep.md (R1-02)
 *
 * Comportamento esperado:
 *   - `parsePokerSiteData` normaliza `networkValue.toString().trim().toLowerCase()`
 *     ANTES de comparar. Variantes de case ("POKERSTARS", "pokerstars",
 *     "PokerStars", "  pokerstars  ") resolvem para a MESMA rota de parser e
 *     resultam em `site` canônico idêntico.
 *
 *   - O campo `site` no `ParsedTournament` retorna o nome canônico estável
 *     (e.g. 'PokerStars' — case canônico do parser, não o input bruto).
 *
 * NOTA TDD: o parser atual já chama `.trim().toLowerCase()`, mas testes
 * formalizam o contrato para evitar regressão se um futuro refactor mudar
 * a ordem das comparações.
 */
import { describe, it, expect } from 'vitest';
import { PokerCSVParser } from '../../../server/csvParser';

function buildCSV(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]).join(',');
  const dataLines = rows.map(r => Object.values(r).join(','));
  return [headers, ...dataLines].join('\n');
}

function baseStarsRow(network: string): Record<string, string> {
  return {
    'Network': network,
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
  };
}

function baseGGRow(network: string): Record<string, string> {
  return {
    'Network': network,
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
  };
}

// ---------------------------------------------------------------------------
// PokerStars
// ---------------------------------------------------------------------------

describe('RF-01.02 — Network case-insensitive (PokerStars)', () => {
  const variants = ['PokerStars', 'pokerstars', 'POKERSTARS', '  PokerStars  '];

  it.each(variants)('detecta PokerStars com Network="%s"', async (network) => {
    const csv = buildCSV([baseStarsRow(network)]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // site canônico estável
    expect(result[0].site).toBe('PokerStars');
  });

  it('PokerStars variantes de case produzem mesmo resultado (snapshot)', async () => {
    const all = await Promise.all(
      variants.map(async (n) => {
        const csv = buildCSV([baseStarsRow(n)]);
        const out = await PokerCSVParser.parseCSV(csv, 'USER-0001');
        return out[0];
      })
    );
    // todos devem ter mesmo site canônico
    const sites = all.map(t => t.site);
    expect(new Set(sites).size).toBe(1);
    // todos com mesmo buyIn/prize (mesmo parser invocado)
    const prizes = all.map(t => t.prize);
    expect(new Set(prizes).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GGPoker / GGNetwork
// ---------------------------------------------------------------------------

describe('RF-01.02 — Network case-insensitive (GGPoker)', () => {
  const variants = ['GGNetwork', 'ggnetwork', 'GGPoker', 'ggpoker', 'GGPOKER'];

  it.each(variants)('detecta GGPoker com Network="%s"', async (network) => {
    const csv = buildCSV([baseGGRow(network)]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('GGPoker');
  });
});

// ---------------------------------------------------------------------------
// 888poker
// ---------------------------------------------------------------------------

describe('RF-01.02 — Network case-insensitive (888poker)', () => {
  function build888(network: string): Record<string, string> {
    return {
      'Network': network,
      'Player': 'tester',
      'Game ID': '3001',
      'Stake': '50',
      'Date': '2025-01-15 18:00',
      'Entrants': '500',
      'Rake': '5',
      'Game': 'H',
      'Structure': 'No Limit',
      'Speed': 'Normal',
      'Result': '100',
      'Position': '10',
      'Flags': 'Standard',
      'Currency': 'USD',
      'ReEntries/Rebuys': '',
      'Duration': '0',
      'Players Per Table': '8',
      'Prize': '',
      'Name': '$50 NLHE',
      'Total ReEntries': '0',
    };
  }

  it.each(['888Poker', '888poker', '888POKER'])('detecta 888poker com Network="%s"', async (network) => {
    const csv = buildCSV([build888(network)]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('888poker');
  });
});

// ---------------------------------------------------------------------------
// Cross-network — case misturado não causa falso match em rede errada
// ---------------------------------------------------------------------------

describe('RF-01.02 — Não vaza para parser errado', () => {
  it('"POKERSTARS" não cai no parser GGPoker', async () => {
    const csv = buildCSV([baseStarsRow('POKERSTARS')]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('PokerStars');
    expect(result[0].site).not.toBe('GGPoker');
  });

  it('"ggpoker" não cai no parser PokerStars', async () => {
    const csv = buildCSV([baseGGRow('ggpoker')]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('GGPoker');
    expect(result[0].site).not.toBe('PokerStars');
  });
});
