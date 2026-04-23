import { describe, it, expect } from 'vitest';
import { PokerCSVParser } from '../../../server/csvParser';

// =============================================================================
// Testes TDD: Deteccao de Plus/ReA no parser CSV (Spec 1 §4.5)
//
// Regex esperadas (case-insensitive, word boundaries):
//   PLUS_REGEX = /(?<![A-Za-z])plus(?![A-Za-z])|\+\s*add[- ]?on/i
//   REA_REGEX  = /(?<![A-Za-z])(re[- ]?entry|re[- ]?entries|rea|r\/a|reentry)(?![A-Za-z])/i
//
// Falsos positivos que DEVEM ser evitados (blocklist):
//   - "Surplus", "ExpressPLUS", "APlus" -> allowsAddOn deve ser FALSE
//   - "ReAl", "ReAlly" -> allowsReentry deve ser FALSE
//
// O implementer deve estender o objeto ParsedTournament com:
//   allowsAddOn?: boolean
//   addOnCost?: number | null
//   allowsReentry?: boolean
//   maxReentries?: number | null
//
// Modo: TDD - campos nao existem ainda no ParsedTournament.
// =============================================================================

// ---------------------------------------------------------------------------
// Helpers (reaproveitando padrao do csv-parser.test.ts existente)
// ---------------------------------------------------------------------------

function buildPokerStarsCSV(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]).join(',');
  const dataLines = rows.map((r) => Object.values(r).join(','));
  return [headers, ...dataLines].join('\n');
}

function makePokerStarsRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    Network: 'PokerStars',
    ' Name': 'Super Tuesday $109',
    ' Game ID': '1001',
    ' Stake': '100',
    ' Rake': '9',
    ' Result': '0',
    ' Position': '150',
    ' Entrants': '500',
    ' Date': '2026-03-15 19:00',
    ' Currency': 'USD',
    ' Flags': '',
    ' Speed': '',
    ' ReEntries/Rebuys': '0',
    ...overrides,
  };
}

// ===========================================================================
// Deteccao de Plus (add-on)
// ===========================================================================

describe('PokerCSVParser - deteccao de "Plus" (add-on)', () => {
  it('deve setar allowsAddOn=true quando nome contem "Plus"', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'Big Sunday Plus $22' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect((result[0] as any).allowsAddOn).toBe(true);
  });

  it('deve setar allowsAddOn=true quando nome contem "plus" (minusculo)', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'big sunday plus $22' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn).toBe(true);
  });

  it('deve setar allowsAddOn=true quando nome contem "PLUS" (maiusculo)', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'BIG SUNDAY PLUS $22' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn).toBe(true);
  });

  it('deve setar addOnCost=buyIn como default quando allowsAddOn detectado', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({
        ' Name': 'Plus Sunday Main $215',
        ' Stake': '200',
        ' Rake': '15',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    // buyIn typical = stake + rake = 215
    expect((result[0] as any).allowsAddOn).toBe(true);
    const addOnCost = (result[0] as any).addOnCost;
    // addOnCost deve ser o buyIn (null nao e aceitavel quando allowsAddOn=true)
    expect(addOnCost).not.toBeNull();
    expect(parseFloat(String(addOnCost))).toBeGreaterThan(0);
  });

  it('deve setar allowsAddOn=false quando nome NAO contem Plus', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'Super Tuesday $109' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn ?? false).toBe(false);
  });
});

// ===========================================================================
// Falsos positivos de Plus (blocklist)
// ===========================================================================

describe('PokerCSVParser - falsos positivos de "Plus" nao devem disparar', () => {
  it('NAO deve detectar Plus em "Surplus Championship"', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'Surplus Championship $50' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn ?? false).toBe(false);
  });

  it('NAO deve detectar Plus em "ExpressPLUS $11" (freeroll 888)', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'ExpressPLUS $11' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn ?? false).toBe(false);
  });

  it('NAO deve detectar Plus em "SurplusMania"', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'SurplusMania $22' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn ?? false).toBe(false);
  });

  it('NAO deve detectar Plus em "APlus Arena"', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'APlus Arena $55' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn ?? false).toBe(false);
  });

  it('NAO deve detectar Plus em "PLUSone Challenge" (palavra com PLUS colado)', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'PLUSone Challenge $11' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn ?? false).toBe(false);
  });

  it('DEVE detectar Plus em "Plus $22" (Plus isolado)', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'Plus $22 Sunday Deep' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn).toBe(true);
  });

  it('DEVE detectar Plus em "$22 Deep Plus" (Plus no final)', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': '$22 Deep Plus' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn).toBe(true);
  });
});

// ===========================================================================
// Deteccao de Re-Entry (ReA)
// ===========================================================================

describe('PokerCSVParser - deteccao de "Re-Entry" (ReA)', () => {
  it('deve setar allowsReentry=true quando nome contem "Re-Entry"', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'Re-Entry Masters $22' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsReentry).toBe(true);
  });

  it('deve setar allowsReentry=true quando nome contem "ReA"', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'Bounty Builder ReA $22' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsReentry).toBe(true);
  });

  it('deve setar allowsReentry=true quando nome contem "R/A"', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'Sunday Grind R/A $55' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsReentry).toBe(true);
  });

  it('deve setar allowsReentry=true quando nome contem "Reentry" (sem hifen)', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'Daily Reentry $11' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsReentry).toBe(true);
  });

  it('deve setar allowsReentry=true quando nome contem "Re-entries"', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'PKO 3 Re-entries $22' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsReentry).toBe(true);
  });

  it('deve setar allowsReentry=false quando nome NAO contem pattern ReA', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'Super Tuesday $109' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsReentry ?? false).toBe(false);
  });
});

// ===========================================================================
// Falsos positivos de ReA
// ===========================================================================

describe('PokerCSVParser - falsos positivos de "ReA" nao devem disparar', () => {
  it('NAO deve detectar ReA em "Really Big Sunday"', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'Really Big Sunday $109' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsReentry ?? false).toBe(false);
  });

  it('NAO deve detectar ReA em "Area 51 Special"', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'Area 51 Special $22' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsReentry ?? false).toBe(false);
  });

  it('NAO deve detectar ReA em "Reality Check"', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'Reality Check $11' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsReentry ?? false).toBe(false);
  });
});

// ===========================================================================
// Combinacoes: Plus + ReA, Plus + PKO, Plus + Mystery
// ===========================================================================

describe('PokerCSVParser - combinacoes Plus + ReA + category', () => {
  it('Plus + PKO: allowsAddOn=true, category=PKO', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({
        ' Name': 'PKO Plus $22',
        ' Flags': 'Bounty',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn).toBe(true);
    expect(result[0].category).toBe('PKO');
  });

  it('Plus + Mystery: allowsAddOn=true, category=Mystery', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({
        ' Name': 'Mystery Plus $55',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn).toBe(true);
    expect(result[0].category).toBe('Mystery');
  });

  it('Plus + ReA: ambas flags=true', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({
        ' Name': 'Plus Re-Entry Sunday $22',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn).toBe(true);
    expect((result[0] as any).allowsReentry).toBe(true);
  });

  it('ReA + Turbo: allowsReentry=true, speed=Turbo', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({
        ' Name': 'Turbo Re-Entry $11',
        ' Speed': 'Turbo',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsReentry).toBe(true);
    expect(result[0].speed).toBe('Turbo');
  });

  it('Super combo: Plus + ReA + PKO + Mystery no nome -> allowsAddOn + allowsReentry, Mystery prevalece', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({
        ' Name': 'Mystery Plus ReA Bounty $109',
        ' Flags': 'Bounty',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn).toBe(true);
    expect((result[0] as any).allowsReentry).toBe(true);
    // Mystery tem prioridade na detectCategory atual
    expect(result[0].category).toBe('Mystery');
  });

  it('Freeroll com "Plus" no nome: allowsAddOn=true porem sem blocklist', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({
        ' Name': 'Freeroll Plus Kickstart $0',
        ' Stake': '0',
        ' Rake': '0',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn).toBe(true);
  });
});

// ===========================================================================
// Torneios sem Plus/ReA continuam funcionando (regressao)
// ===========================================================================

describe('PokerCSVParser - torneios neutros (regressao)', () => {
  it('Super Tuesday $109 (sem Plus/ReA) continua sendo Vanilla sem flags', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({
        ' Name': 'Super Tuesday $109',
        ' Stake': '100',
        ' Rake': '9',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect((result[0] as any).allowsAddOn ?? false).toBe(false);
    expect((result[0] as any).allowsReentry ?? false).toBe(false);
    expect(result[0].category).toBe('Vanilla');
  });

  it('nome vazio nao quebra parser', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': '' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    // parser pode descartar ou manter; se mantiver, flags devem ser false
    if (result.length > 0) {
      expect((result[0] as any).allowsAddOn ?? false).toBe(false);
      expect((result[0] as any).allowsReentry ?? false).toBe(false);
    }
  });

  it('parseamento em lote de 5 torneios mistos funciona', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({ ' Name': 'Super Tuesday $109', ' Game ID': '1' }),
      makePokerStarsRow({ ' Name': 'Plus Sunday Main $215', ' Game ID': '2' }),
      makePokerStarsRow({ ' Name': 'Re-Entry Masters $22', ' Game ID': '3' }),
      makePokerStarsRow({ ' Name': 'Surplus Championship $50', ' Game ID': '4' }),
      makePokerStarsRow({ ' Name': 'ExpressPLUS $11', ' Game ID': '5' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(5);
    expect((result[0] as any).allowsAddOn ?? false).toBe(false);
    expect((result[1] as any).allowsAddOn).toBe(true);
    expect((result[2] as any).allowsReentry).toBe(true);
    expect((result[3] as any).allowsAddOn ?? false).toBe(false);
    expect((result[4] as any).allowsAddOn ?? false).toBe(false);
  });
});

// ===========================================================================
// Coluna Re-Entries/Rebuys do CSV popula reentries no objeto
// ===========================================================================

describe('PokerCSVParser - coluna ReEntries/Rebuys do CSV', () => {
  it('PokerStars com coluna ReEntries/Rebuys=2 deve popular reentries=2', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({
        ' Name': 'Re-Entry Masters $22',
        ' ReEntries/Rebuys': '2',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    // campo existe em ParsedTournament
    expect(result[0].reentries).toBe(2);
  });

  it('ReEntries/Rebuys=0 resulta em reentries=0', async () => {
    const csv = buildPokerStarsCSV([
      makePokerStarsRow({
        ' Name': 'Re-Entry Masters $22',
        ' ReEntries/Rebuys': '0',
      }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].reentries ?? 0).toBe(0);
  });
});
