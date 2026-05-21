/**
 * Sprint Backend Tech-Debt Sweep — RF-01.01 prize semantics kill-switch
 *
 * Spec: Docs/specs/sprint-backend-sweep.md
 * ADR-181: CSV parser `prize = NET` canonico via kill-switch `CSV_PARSER_NEW_PRIZE_SEMANTICS`
 *
 * Comportamento esperado:
 *   - Default (CSV_PARSER_NEW_PRIZE_SEMANTICS != 'true'):
 *     parser preserva comportamento atual (legacy) — divergente por rede.
 *
 *   - Flag ativa (CSV_PARSER_NEW_PRIZE_SEMANTICS === 'true'):
 *     prize = NET profit canonico, calculado via PRIZE_FORMULA_BY_NETWORK:
 *       pokerstars  → Result (já NET, sem subtrair)
 *       ggnetwork   → Result - Rake (GROSS minus rake — observed atual)
 *       wpn         → Result - Rake
 *       partypoker  → Result - Rake
 *       chico       → Result - Rake
 *       888poker    → Result (já NET — observed atual)
 *       ipoker      → Result (já NET — observed atual)
 *       bodog       → Payout - BuyIn
 *       coinpoker   → Deposit - Withdrawal (parseCoinTXT)
 *       revolution  → Result - Rake
 *       brazilian   → Result - Rake (parseBrazilianFormat genérico)
 *       generic     → Result - Rake (parseGenericNetworkFormat)
 *
 * NOTA TDD: estes testes definem o contrato. Implementer monta a tabela
 * PRIZE_FORMULA_BY_NETWORK + branch via env flag em csvParser.ts.
 *
 * Lessons:
 *   #9 — log antes de fallback (parser loga `csvParser.new_prize_semantics.applied`)
 *   #38 — testes legacy NAO modificados; estes cobrem so a semantica nova.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PokerCSVParser } from '../../../server/csvParser';

// ---------------------------------------------------------------------------
// Helpers — builds inline CSVs nas diferentes formas que cada rede aceita.
// ---------------------------------------------------------------------------

function buildCSV(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]).join(',');
  const dataLines = rows.map(r => Object.values(r).join(','));
  return [headers, ...dataLines].join('\n');
}

function pokerStarsRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'Network': 'PokerStars',
    ' Name': '$55 Mystery Bounty',
    ' Game ID': '1001',
    ' Stake': '50',
    ' Rake': '5',
    ' Result': '-55',
    ' Position': '120',
    ' Entrants': '500',
    ' Date': '2025-01-15 18:00',
    ' Currency': 'USD',
    ' Flags': '',
    ' Speed': '',
    ' ReEntries/Rebuys': '0',
    ...overrides,
  };
}

function ggPokerRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'Network': 'GGNetwork',
    'Player': 'tester',
    'Game ID': '2001',
    'Stake': '50',
    'Date': '2025-01-15 18:00',
    'Entrants': '500',
    'Rake': '5',
    'Game': 'H',
    'Structure': 'No Limit',
    'Speed': 'Normal',
    'Result': '200',
    'Position': '10',
    'Flags': 'Bounty Multi-Entry',
    'Currency': 'USD',
    'ReEntries/Rebuys': '',
    'Duration': '0',
    'Players Per Table': '8',
    'Prize': '',
    'Name': 'Bounty Hunters $55',
    'Total ReEntries': '0',
    ...overrides,
  };
}

function eight88Row(overrides: Record<string, string> = {}): Record<string, string> {
  return {
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
    ...overrides,
  };
}

function wpnRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'Network': 'WPN',
    ' Player': 'tester',
    ' Game ID': '4001',
    ' Stake': '50',
    ' Rake': '5',
    ' Result': '100',
    ' Position': '15',
    ' Entrants': '500',
    ' Date': '2025-01-15 18:00',
    ' Currency': 'USD',
    ' Name': 'WPN Sunday Major',
    ' Flags': '',
    ' Speed': '',
    ' ReEntries/Rebuys': '0',
    ...overrides,
  };
}

function partyRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'Network': 'PartyPoker',
    ' Player': 'tester',
    ' Game ID': '5001',
    ' Stake': '50',
    ' Rake': '5',
    ' Result': '100',
    ' Position': '15',
    ' Entrants': '500',
    ' Date': '2025-01-15 18:00',
    ' Currency': 'USD',
    ' Name': 'Party Major',
    ' Flags': '',
    ' Speed': '',
    ' ReEntries/Rebuys': '0',
    ...overrides,
  };
}

function chicoRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'Network': 'Chico',
    ' Player': 'tester',
    ' Game ID': '6001',
    ' Stake': '50',
    ' Rake': '5',
    ' Result': '100',
    ' Position': '15',
    ' Entrants': '500',
    ' Date': '2025-01-15 18:00',
    ' Currency': 'USD',
    ' Name': 'Chico Sunday',
    ' Flags': '',
    ' Speed': '',
    ' ReEntries/Rebuys': '0',
    ...overrides,
  };
}

function ipokerRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'Network': 'iPoker',
    ' Player': 'tester',
    ' Game ID': '7001',
    ' Stake': '50',
    ' Rake': '5',
    ' Result': '100',
    ' Position': '15',
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

// ---------------------------------------------------------------------------
// Suite 1: comportamento LEGACY (default) — NAO muda com a sprint
// ---------------------------------------------------------------------------

describe('RF-01.01 — Legacy prize semantics (flag OFF, comportamento atual preservado)', () => {
  beforeEach(() => {
    delete process.env.CSV_PARSER_NEW_PRIZE_SEMANTICS;
  });

  it('PokerStars: prize = Result direto (Result já NET na origem)', async () => {
    const csv = buildCSV([pokerStarsRow({ ' Result': '-55', ' Stake': '50', ' Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(-55, 2);
  });

  it('GGPoker: prize = Result - Rake (legacy comportamento atual)', async () => {
    const csv = buildCSV([ggPokerRow({ 'Result': '200', 'Stake': '50', 'Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // 200 - 5 = 195
    expect(result[0].prize).toBeCloseTo(195, 2);
  });

  it('888poker: prize = Result direto (legacy comportamento atual)', async () => {
    const csv = buildCSV([eight88Row({ 'Result': '100', 'Stake': '50', 'Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // 888poker já tem `profit = result` direto
    expect(result[0].prize).toBeCloseTo(100, 2);
  });

  it('iPoker normal: prize = Result direto (legacy)', async () => {
    const csv = buildCSV([ipokerRow({ ' Result': '100', ' Stake': '50', ' Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(100, 2);
  });

  it('iPoker Fury: prize = Result - Stake (legacy Fury rule)', async () => {
    const csv = buildCSV([
      ipokerRow({ ' Name': 'Fury $50', ' Result': '100', ' Stake': '50', ' Rake': '5' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // Fury: profit = result - stake = 100 - 50 = 50
    expect(result[0].prize).toBeCloseTo(50, 2);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: comportamento NEW (flag ativa) — canonico = NET profit universal
// ---------------------------------------------------------------------------

describe('RF-01.01 — NEW prize semantics (CSV_PARSER_NEW_PRIZE_SEMANTICS=true)', () => {
  beforeEach(() => {
    process.env.CSV_PARSER_NEW_PRIZE_SEMANTICS = 'true';
  });

  afterEach(() => {
    delete process.env.CSV_PARSER_NEW_PRIZE_SEMANTICS;
  });

  // -----------------------------
  // PokerStars / 888 / iPoker normal: Result já NET, sem mudança
  // -----------------------------

  it('PokerStars (NEW): prize = Result (já NET — mantém)', async () => {
    const csv = buildCSV([pokerStarsRow({ ' Result': '-55', ' Stake': '50', ' Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(-55, 2);
  });

  it('PokerStars (NEW): Result positivo passa direto (sem subtrair de novo)', async () => {
    const csv = buildCSV([pokerStarsRow({ ' Result': '450', ' Stake': '50', ' Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(450, 2);
  });

  it('888poker (NEW): prize = Result (já NET — mantém)', async () => {
    const csv = buildCSV([eight88Row({ 'Result': '100', 'Stake': '50', 'Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(100, 2);
  });

  it('iPoker normal (NEW): prize = Result (já NET — mantém)', async () => {
    const csv = buildCSV([ipokerRow({ ' Result': '100', ' Stake': '50', ' Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(100, 2);
  });

  // -----------------------------
  // GGPoker / WPN / Party / Chico: NEW = Result - Rake (alinhado canonico)
  // (canonico = NET profit, mesma fórmula do legacy nestes parsers)
  // -----------------------------

  it('GGPoker (NEW): prize = Result - Rake (NET canonico)', async () => {
    const csv = buildCSV([ggPokerRow({ 'Result': '200', 'Stake': '50', 'Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // 200 - 5 = 195
    expect(result[0].prize).toBeCloseTo(195, 2);
  });

  it('WPN (NEW): prize = Result - Rake (NET canonico)', async () => {
    const csv = buildCSV([wpnRow({ ' Result': '100', ' Stake': '50', ' Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // 100 - 5 = 95
    expect(result[0].prize).toBeCloseTo(95, 2);
  });

  it('PartyPoker (NEW): prize = Result - Rake (NET canonico)', async () => {
    const csv = buildCSV([partyRow({ ' Result': '100', ' Stake': '50', ' Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(95, 2);
  });

  it('Chico (NEW): prize = Result - Rake (NET canonico)', async () => {
    const csv = buildCSV([chicoRow({ ' Result': '100', ' Stake': '50', ' Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(95, 2);
  });

  // -----------------------------
  // iPoker Fury: NEW = Result - Stake (mesmo legacy — Fury rule mantida)
  // -----------------------------

  it('iPoker Fury (NEW): prize = Result - Stake (Fury rule preservada)', async () => {
    const csv = buildCSV([
      ipokerRow({ ' Name': 'Fury $50', ' Result': '100', ' Stake': '50', ' Rake': '5' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // Fury: profit = result - stake = 100 - 50 = 50
    expect(result[0].prize).toBeCloseTo(50, 2);
  });

  // -----------------------------
  // Edge cases
  // -----------------------------

  it('GGPoker (NEW): Result negativo (mincash perdedor) preserva sinal', async () => {
    const csv = buildCSV([ggPokerRow({ 'Result': '-100', 'Stake': '50', 'Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // -100 - 5 = -105
    expect(result[0].prize).toBeCloseTo(-105, 2);
  });

  it('GGPoker (NEW): rake=0 não quebra fórmula', async () => {
    const csv = buildCSV([ggPokerRow({ 'Result': '200', 'Stake': '50', 'Rake': '0' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(200, 2);
  });

  it('PokerStars (NEW): prize zero (busted ITM) preservado', async () => {
    const csv = buildCSV([pokerStarsRow({ ' Result': '0', ' Stake': '50', ' Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].prize).toBeCloseTo(0, 2);
  });

  // -----------------------------
  // Logging (lesson #9): expect log "csvParser.new_prize_semantics.applied" quando flag ativa
  // -----------------------------

  it('emite log de auditoria quando flag está ativa (lesson #9)', async () => {
    const { vi } = await import('vitest');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const csv = buildCSV([ggPokerRow({ 'Result': '200', 'Stake': '50', 'Rake': '5' })]);
    await PokerCSVParser.parseCSV(csv, 'USER-LOGTEST');

    // Algum log deve referenciar 'new_prize_semantics' — não fixamos tier (info/log)
    const allCalls = [...infoSpy.mock.calls, ...logSpy.mock.calls];
    const matched = allCalls.some(call =>
      call.some((arg: any) => String(arg).includes('new_prize_semantics'))
    );
    expect(matched).toBe(true);

    infoSpy.mockRestore();
    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Toggle integrity — flag controla DE FATO o branch
// ---------------------------------------------------------------------------

describe('RF-01.01 — flag toggle integrity', () => {
  it('flag undefined === false (legacy path)', async () => {
    delete process.env.CSV_PARSER_NEW_PRIZE_SEMANTICS;
    const csv = buildCSV([ggPokerRow({ 'Result': '200', 'Stake': '50', 'Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].prize).toBeCloseTo(195, 2); // legacy formula GG = Result - Rake
  });

  it('flag = "false" string explícita === legacy path', async () => {
    process.env.CSV_PARSER_NEW_PRIZE_SEMANTICS = 'false';
    const csv = buildCSV([ggPokerRow({ 'Result': '200', 'Stake': '50', 'Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].prize).toBeCloseTo(195, 2);
    delete process.env.CSV_PARSER_NEW_PRIZE_SEMANTICS;
  });

  it('flag = "true" string explícita === new path', async () => {
    process.env.CSV_PARSER_NEW_PRIZE_SEMANTICS = 'true';
    const csv = buildCSV([pokerStarsRow({ ' Result': '-55', ' Stake': '50', ' Rake': '5' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    // Em NEW: PokerStars permanece Result direto = -55 (não duplica buyIn)
    expect(result[0].prize).toBeCloseTo(-55, 2);
    delete process.env.CSV_PARSER_NEW_PRIZE_SEMANTICS;
  });
});
