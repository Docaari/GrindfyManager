import { describe, it, expect } from 'vitest';
import { PokerCSVParser, ParsedTournament } from '../../../server/csvParser';
import { tournaments } from '@shared/schema';

// =============================================================================
// Testes TDD: Correcoes 2-8 do parser CSV (docs/specs/fix-csv-parser.md)
// Todos devem FALHAR (red phase) ate o Implementer aplicar as correcoes.
// =============================================================================

// ---------------------------------------------------------------------------
// Helper: Monta CSV no formato que o parseCSV aceita (headers com espaco)
// ---------------------------------------------------------------------------

function buildCSVRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'Network': 'PokerStars',
    ' Name': '$22 NL Holdem',
    ' Game ID': '9999',
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

function buildCSV(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]).join(',');
  const dataLines = rows.map(r => Object.values(r).join(','));
  return [headers, ...dataLines].join('\n');
}

// ---------------------------------------------------------------------------
// Correcao 2: Data invalida retorna null (torneio rejeitado)
// ---------------------------------------------------------------------------

describe('Correcao 2: parseDate retorna null para datas invalidas', () => {
  it('deve rejeitar torneio com data vazia', async () => {
    const csv = buildCSV([buildCSVRow({ ' Date': '' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    // Com a correcao, parseDate("") retorna null e o torneio e filtrado
    // Comportamento bugado atual: parseDate("") retorna new Date() e o torneio e aceito
    expect(result.length).toBe(0);
  });

  it('deve rejeitar torneio com data "invalid-date"', async () => {
    const csv = buildCSV([buildCSVRow({ ' Date': 'invalid-date' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(0);
  });

  it('deve rejeitar torneio com data impossivel "2025-13-45"', async () => {
    const csv = buildCSV([buildCSVRow({ ' Date': '2025-13-45' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(0);
  });

  it('deve aceitar torneio com data valida "2025-01-15 18:00"', async () => {
    const csv = buildCSV([buildCSVRow({ ' Date': '2025-01-15 18:00' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].datePlayed.getFullYear()).toBe(2025);
    expect(result[0].datePlayed.getMonth()).toBe(0); // Janeiro = 0
    expect(result[0].datePlayed.getDate()).toBe(15);
  });

  it('deve aceitar torneio com data ISO "2025-01-15T18:00:00Z"', async () => {
    const csv = buildCSV([buildCSVRow({ ' Date': '2025-01-15T18:00:00Z' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].datePlayed.getFullYear()).toBe(2025);
  });

  it('deve indicar quantos torneios foram rejeitados por data invalida', async () => {
    // 3 torneios validos, 2 com data invalida — deve retornar apenas 3
    const csv = buildCSV([
      buildCSVRow({ ' Game ID': '1001', ' Date': '2025-01-15 18:00' }),
      buildCSVRow({ ' Game ID': '1002', ' Date': '' }),
      buildCSVRow({ ' Game ID': '1003', ' Date': '2025-01-16 19:00' }),
      buildCSVRow({ ' Game ID': '1004', ' Date': 'not-a-date' }),
      buildCSVRow({ ' Game ID': '1005', ' Date': '2025-01-17 20:00' }),
    ]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Correcao 3: Network case-insensitive
// ---------------------------------------------------------------------------

describe('Correcao 3: deteccao de network case-insensitive', () => {
  it('deve detectar "pokerstars" (lowercase) como PokerStars', async () => {
    const csv = buildCSV([buildCSVRow({ 'Network': 'pokerstars' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('PokerStars');
  });

  it('deve detectar "POKERSTARS" (uppercase) como PokerStars', async () => {
    const csv = buildCSV([buildCSVRow({ 'Network': 'POKERSTARS' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('PokerStars');
  });

  it('deve detectar "ggpoker" (lowercase) como GGPoker', async () => {
    const csv = buildCSV([buildCSVRow({
      'Network': 'ggpoker',
      ' Name': '$22 NL Holdem',
      ' Game ID': '5001',
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
    })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('GGPoker');
  });

  it('deve detectar "GGNetwork" como GGPoker (ja funciona, regressao)', async () => {
    const csv = buildCSV([buildCSVRow({
      'Network': 'GGNetwork',
      ' Name': '$22 NL Holdem',
      ' Game ID': '5002',
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
    })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('GGPoker');
  });

  it('deve detectar "888POKER" (uppercase) como 888poker', async () => {
    const csv = buildCSV([buildCSVRow({
      'Network': '888POKER',
      ' Name': '$22 NL Holdem',
      ' Game ID': '5003',
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
    })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('888poker');
  });

  it('deve detectar "wpn" (lowercase) como WPN', async () => {
    const csv = buildCSV([buildCSVRow({
      'Network': 'wpn',
      ' Name': '$22 NL Holdem',
      ' Game ID': '5004',
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
    })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('WPN');
  });

  it('deve detectar "partypoker" (lowercase) como PartyPoker', async () => {
    const csv = buildCSV([buildCSVRow({
      'Network': 'partypoker',
      ' Name': '$22 NL Holdem',
      ' Game ID': '5005',
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
    })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('PartyPoker');
  });
});

// ---------------------------------------------------------------------------
// Correcao 4: Final table com fieldSize=0
// ---------------------------------------------------------------------------

describe('Correcao 4: finalTable consistente quando fieldSize=0', () => {
  it('position=5, fieldSize=0 deve ser finalTable=true', async () => {
    const csv = buildCSV([buildCSVRow({
      ' Position': '5',
      ' Entrants': '0',
    })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].finalTable).toBe(true);
  });

  it('position=10, fieldSize=0 deve ser finalTable=false', async () => {
    const csv = buildCSV([buildCSVRow({
      ' Position': '10',
      ' Entrants': '0',
    })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].finalTable).toBe(false);
  });

  it('position=9, fieldSize=0 deve ser finalTable=true', async () => {
    const csv = buildCSV([buildCSVRow({
      ' Position': '9',
      ' Entrants': '0',
    })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].finalTable).toBe(true);
  });

  it('position=1, fieldSize=100 deve ser finalTable=true', async () => {
    const csv = buildCSV([buildCSVRow({
      ' Position': '1',
      ' Entrants': '100',
    })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].finalTable).toBe(true);
  });

  it('position=11, fieldSize=100 deve ser finalTable=false', async () => {
    const csv = buildCSV([buildCSVRow({
      ' Position': '11',
      ' Entrants': '100',
    })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].finalTable).toBe(false);
  });

  it('position=0 deve ser finalTable=false independente de fieldSize', async () => {
    const csv = buildCSV([buildCSVRow({
      ' Position': '0',
      ' Entrants': '500',
    })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].finalTable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Correcao 5: PKO word boundary — "KO" nao match como substring
// ---------------------------------------------------------------------------

describe('Correcao 5: detectCategory com word boundary para KO', () => {
  it('deve detectar PKO quando nome contem "KO Series $22"', async () => {
    const csv = buildCSV([buildCSVRow({ ' Name': 'KO Series $22' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('PKO');
  });

  it('deve detectar PKO quando nome contem "Turbo KO $11"', async () => {
    const csv = buildCSV([buildCSVRow({ ' Name': 'Turbo KO $11' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('PKO');
  });

  it('deve detectar PKO quando nome contem "Super-KO $22" (hifen como boundary)', async () => {
    const csv = buildCSV([buildCSVRow({ ' Name': 'Super-KO $22' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('PKO');
  });

  it('NAO deve detectar PKO quando nome contem "TOKYO $11" (KO e substring)', async () => {
    const csv = buildCSV([buildCSVRow({ ' Name': 'TOKYO $11' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('Vanilla');
  });

  it('NAO deve detectar PKO quando nome contem "KOS Special" (KOS != KO)', async () => {
    const csv = buildCSV([buildCSVRow({ ' Name': 'KOS Special' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('Vanilla');
  });

  it('deve detectar PKO quando nome contem "KNOCKOUT $55" (matched por KNOCKOUT)', async () => {
    const csv = buildCSV([buildCSVRow({ ' Name': 'KNOCKOUT $55' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('PKO');
  });

  it('deve detectar PKO quando nome contem "$22 NL PKO"', async () => {
    const csv = buildCSV([buildCSVRow({ ' Name': '$22 NL PKO' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('PKO');
  });
});

// ---------------------------------------------------------------------------
// Correcao 6: iPoker Fury/Rebuy mais especifico
// ---------------------------------------------------------------------------

describe('Correcao 6: iPoker isFuryOrRebuy mais restrito', () => {
  // Helper para montar CSV no formato iPoker (Network=iPoker, moeda EUR)
  // Nota: atualmente parsePokerSiteData NAO roteia Network="iPoker" para parseIPokerFormat.
  // O Implementer precisa adicionar esse roteamento. Os testes especificam o comportamento
  // correto apos AMBAS as correcoes: (1) roteamento iPoker e (2) logica isFuryOrRebuy.
  function buildIPokerCSV(overrides: Record<string, string> = {}): string {
    const row: Record<string, string> = {
      'Network': 'iPoker',
      ' Name': '$5,000 GTD Regular',
      ' Player': 'TestPlayer',
      ' Game ID': 'ABC123',
      ' Stake': '26.6175',
      ' Rake': '5.3825',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '500',
      ' Date': '2025-01-15 18:00',
      ' Currency': 'EUR',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
      ...overrides,
    };
    const headers = Object.keys(row).join(',');
    const values = Object.values(row).join(',');
    return [headers, values].join('\n');
  }

  it('deve rotear Network="iPoker" para o parser iPoker e detectar site como "iPoker"', async () => {
    const csv = buildIPokerCSV();
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // Atualmente cai no generic handler, site != "iPoker"
    expect(result[0].site).toBe('iPoker');
  });

  it('deve ativar isFuryOrRebuy quando nome contem "Fury" (ex: "Fists of Fury")', async () => {
    const csv = buildIPokerCSV({
      ' Name': 'Fists of Fury',
      ' Flags': 'Multi-Entry',
      ' Stake': '26.6175',
      ' Rake': '5.3825',
      ' Result': '100',
    });
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('iPoker');
    // Quando isFuryOrRebuy=true, buyIn = (stake*2) + rake
    // stake=26.6175, rake=5.3825 => buyIn = 53.235 + 5.3825 = 58.6175
    // (Sem conversao EUR pois nao passamos exchangeRates, conversionRate=1)
    const buyIn = result[0].buyIn;
    const expectedNormalBuyIn = 26.6175 + 5.3825; // ~32 sem dobrar
    expect(buyIn).toBeGreaterThan(expectedNormalBuyIn);
  });

  it('NAO deve ativar isFuryOrRebuy quando "Rebuy" aparece apenas nos Flags mas nao no nome', async () => {
    // Nome generico sem "Rebuy", mas Flags contem "Rebuy Multi-Entry"
    // Com a correcao: Rebuy so nos flags (sem estar no nome) NAO dobra o stake
    const csv = buildIPokerCSV({
      ' Name': '$5,000 GTD Regular',
      ' Flags': 'Rebuy Multi-Entry',
      ' Stake': '26.6175',
      ' Rake': '5.3825',
      ' Result': '0',
    });
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('iPoker');
    // buyIn deve ser stake+rake (sem dobrar) = ~32
    const buyIn = result[0].buyIn;
    const expectedNormalBuyIn = 26.6175 + 5.3825; // ~32
    expect(buyIn).toBeCloseTo(expectedNormalBuyIn, 1);
  });

  it('deve ativar isFuryOrRebuy quando "Rebuy" aparece no nome E nos Flags', async () => {
    const csv = buildIPokerCSV({
      ' Name': 'Rebuy Special $11',
      ' Flags': 'Rebuy Multi-Entry',
      ' Stake': '26.6175',
      ' Rake': '5.3825',
      ' Result': '100',
    });
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('iPoker');
    // Com a correcao: Rebuy no nome E nos flags = ativa isFuryOrRebuy
    // buyIn deve ser (stake*2) + rake
    const buyIn = result[0].buyIn;
    const expectedNormalBuyIn = 26.6175 + 5.3825; // ~32 sem dobrar
    expect(buyIn).toBeGreaterThan(expectedNormalBuyIn);
  });
});

// ---------------------------------------------------------------------------
// Correcao 7: Currency default no schema deve ser "USD"
// ---------------------------------------------------------------------------

describe('Correcao 7: currency default no schema e "USD"', () => {
  it('tournaments.currency default deve ser "USD" (nao "BRL")', () => {
    // Acessa a definicao de default da coluna currency na tabela tournaments
    // O schema Drizzle armazena o default na config da coluna
    const currencyColumn = tournaments.currency;
    // Verifica o valor default configurado no schema
    expect(currencyColumn.default).toBe('USD');
  });
});

// ---------------------------------------------------------------------------
// Correcao 8: Position minima zero (nunca negativa)
// ---------------------------------------------------------------------------

describe('Correcao 8: position minima zero', () => {
  it('position=-1 no CSV deve resultar em position=0', async () => {
    const csv = buildCSV([buildCSVRow({ ' Position': '-1' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(0);
  });

  it('position=0 no CSV deve resultar em position=0', async () => {
    const csv = buildCSV([buildCSVRow({ ' Position': '0' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(0);
  });

  it('position=150 no CSV deve resultar em position=150', async () => {
    const csv = buildCSV([buildCSVRow({ ' Position': '150' })]);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(150);
  });
});
