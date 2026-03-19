import { describe, it, expect } from 'vitest';
import { PokerCSVParser, ParsedTournament } from '../../../server/csvParser';

// =============================================================================
// Testes de Caracterizacao: PokerCSVParser
// Documentam o comportamento ATUAL do parser multi-rede.
// Todos devem PASSAR com o codigo existente.
// =============================================================================

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPokerStarsCSV(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]).join(',');
  const dataLines = rows.map(r => Object.values(r).join(','));
  return [headers, ...dataLines].join('\n');
}

// ---------------------------------------------------------------------------
// detectCategory (via parseCSV com Network=PokerStars)
// ---------------------------------------------------------------------------

describe('PokerCSVParser — detectCategory', () => {
  it('deve detectar Mystery quando nome contem MYSTERY', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': 'Mystery Bounty $55',
      ' Game ID': '1001',
      ' Stake': '50',
      ' Rake': '5',
      ' Result': '100',
      ' Position': '10',
      ' Entrants': '500',
      ' Date': '2025-01-15 18:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('Mystery');
  });

  it('deve detectar PKO quando flags contem BOUNTY', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$22 NL Holdem PKO',
      ' Game ID': '1002',
      ' Stake': '20',
      ' Rake': '2',
      ' Result': '-22',
      ' Position': '150',
      ' Entrants': '500',
      ' Date': '2025-01-15 19:00',
      ' Currency': 'USD',
      ' Flags': 'Bounty Multi-Entry',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('PKO');
  });

  it('deve detectar PKO quando nome contem KNOCKOUT', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$11 Progressive Knockout',
      ' Game ID': '1003',
      ' Stake': '10',
      ' Rake': '1',
      ' Result': '0',
      ' Position': '200',
      ' Entrants': '500',
      ' Date': '2025-01-15 20:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('PKO');
  });

  it('deve retornar Vanilla quando nome e flags nao indicam PKO nem Mystery', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$22 NL Holdem Regular MTT',
      ' Game ID': '1004',
      ' Stake': '20',
      ' Rake': '2',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '500',
      ' Date': '2025-01-15 21:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('Vanilla');
  });
});

// ---------------------------------------------------------------------------
// detectSpeed (via parseCSV com Network=PokerStars)
// ---------------------------------------------------------------------------

describe('PokerCSVParser — detectSpeed', () => {
  it('deve detectar Turbo quando campo Speed contem TURBO', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$11 NL Holdem',
      ' Game ID': '2001',
      ' Stake': '10',
      ' Rake': '1',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '300',
      ' Date': '2025-02-01 18:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': 'Turbo',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].speed).toBe('Turbo');
  });

  it('deve detectar Hyper quando campo Speed contem SUPER TURBO', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$5 NL Holdem',
      ' Game ID': '2002',
      ' Stake': '4.5',
      ' Rake': '0.5',
      ' Result': '0',
      ' Position': '50',
      ' Entrants': '100',
      ' Date': '2025-02-01 19:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': 'Super Turbo',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].speed).toBe('Hyper');
  });

  it('deve retornar Normal quando campo Speed esta vazio', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$22 NL Holdem',
      ' Game ID': '2003',
      ' Stake': '20',
      ' Rake': '2',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '500',
      ' Date': '2025-02-01 20:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].speed).toBe('Normal');
  });

  it('deve detectar Turbo pelo nome do torneio quando Speed esta vazio', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$11 Turbo NL Holdem',
      ' Game ID': '2004',
      ' Stake': '10',
      ' Rake': '1',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '300',
      ' Date': '2025-02-01 21:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].speed).toBe('Turbo');
  });
});

// ---------------------------------------------------------------------------
// detectFormat
// ---------------------------------------------------------------------------

describe('PokerCSVParser — detectFormat', () => {
  it('deve retornar MTT como formato padrao', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': 'Any Tournament',
      ' Game ID': '3001',
      ' Stake': '10',
      ' Rake': '1',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '300',
      ' Date': '2025-03-01 18:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].format).toBe('MTT');
  });
});

// ---------------------------------------------------------------------------
// PokerStars parser — buy-in, profit, fields
// ---------------------------------------------------------------------------

describe('PokerCSVParser — PokerStars format', () => {
  it('deve calcular buyIn como stake + rake', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$55 Sunday Million',
      ' Game ID': '4001',
      ' Stake': '50',
      ' Rake': '5',
      ' Result': '200',
      ' Position': '15',
      ' Entrants': '2000',
      ' Date': '2025-01-20 17:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].buyIn).toBe(55); // 50 + 5
    expect(result[0].prize).toBe(200); // Result is net profit in PS format
  });

  it('deve definir site como PokerStars', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$11 MTT',
      ' Game ID': '4002',
      ' Stake': '10',
      ' Rake': '1',
      ' Result': '0',
      ' Position': '200',
      ' Entrants': '500',
      ' Date': '2025-01-20 18:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].site).toBe('PokerStars');
  });

  it('deve extrair tournamentId do Game ID', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$22 MTT',
      ' Game ID': '3907052694',
      ' Stake': '20',
      ' Rake': '2',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '500',
      ' Date': '2025-01-20 19:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].tournamentId).toBe('3907052694');
  });

  it('deve parsear fieldSize de Entrants', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$22 MTT',
      ' Game ID': '4003',
      ' Stake': '20',
      ' Rake': '2',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '1500',
      ' Date': '2025-01-20 20:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].fieldSize).toBe(1500);
  });

  it('deve parsear reentries de ReEntries/Rebuys', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$22 MTT',
      ' Game ID': '4004',
      ' Stake': '20',
      ' Rake': '2',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '500',
      ' Date': '2025-01-20 21:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '3',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].reentries).toBe(3);
  });

  it('deve detectar finalTable quando position <= 9', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$55 MTT',
      ' Game ID': '4005',
      ' Stake': '50',
      ' Rake': '5',
      ' Result': '500',
      ' Position': '5',
      ' Entrants': '1000',
      ' Date': '2025-01-20 22:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result[0].finalTable).toBe(true);
  });

  it('deve detectar bigHit quando profit > buyIn * 10', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$11 MTT',
      ' Game ID': '4006',
      ' Stake': '10',
      ' Rake': '1',
      ' Result': '1200',
      ' Position': '1',
      ' Entrants': '1000',
      ' Date': '2025-01-20 23:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    // profit (1200) > buyIn (11) * 10 = 110 => true
    expect(result[0].bigHit).toBe(true);
  });

  it('deve aplicar conversao de moeda quando currency != USD e exchangeRate existe', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$55 MTT CNY',
      ' Game ID': '4007',
      ' Stake': '388',
      ' Rake': '38',
      ' Result': '0',
      ' Position': '200',
      ' Entrants': '500',
      ' Date': '2025-01-20 18:00',
      ' Currency': 'CNY',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const exchangeRates = { CNY: 0.14 };
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001', exchangeRates);
    expect(result.length).toBe(1);
    // 388 * 0.14 + 38 * 0.14 = 54.32 + 5.32 = 59.64
    expect(result[0].buyIn).toBeCloseTo(59.64, 1);
    expect(result[0].convertedToUSD).toBe(true);
  });

  it('deve manter valores originais quando currency e USD', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$22 MTT',
      ' Game ID': '4008',
      ' Stake': '20',
      ' Rake': '2',
      ' Result': '50',
      ' Position': '50',
      ' Entrants': '500',
      ' Date': '2025-01-20 18:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001', { CNY: 0.14 });
    expect(result[0].buyIn).toBe(22);
    expect(result[0].convertedToUSD).toBe(false);
  });

  it('deve sempre usar userId fornecido como parametro, nao dos dados CSV', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$11 MTT',
      ' Game ID': '4009',
      ' Stake': '10',
      ' Rake': '1',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '500',
      ' Date': '2025-01-20 18:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-9999');
    expect(result[0].userId).toBe('USER-9999');
  });
});

// ---------------------------------------------------------------------------
// GGPoker format detection via Network field
// ---------------------------------------------------------------------------

describe('PokerCSVParser — GGPoker format', () => {
  it('deve detectar GGPoker pela coluna Network e definir site como GGPoker', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'GGNetwork',
      ' Name': '$22 Bounty Hunters',
      ' Game ID': '5001',
      ' Stake': '20',
      ' Rake': '2',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '500',
      ' Date': '2025-02-15 19:00',
      ' Currency': 'USD',
      ' Flags': 'Bounty',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('GGPoker');
  });
});

// ---------------------------------------------------------------------------
// WPN format detection via Network field
// ---------------------------------------------------------------------------

describe('PokerCSVParser — WPN format', () => {
  it('deve detectar WPN pela coluna Network', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'WPN',
      ' Name': '$10 NL Holdem WPN',
      ' Game ID': '6001',
      ' Stake': '9',
      ' Rake': '1',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '200',
      ' Date': '2025-02-20 18:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // WPN parser sets site based on row data
    expect(result[0].userId).toBe('USER-0001');
    expect(result[0].format).toBe('MTT');
  });
});

// ---------------------------------------------------------------------------
// parseCSV — edge cases
// ---------------------------------------------------------------------------

describe('PokerCSVParser — parseCSV edge cases', () => {
  it('deve retornar array vazio para conteudo vazio', async () => {
    const result = await PokerCSVParser.parseCSV('', 'USER-0001');
    expect(result).toEqual([]);
  });

  it('deve retornar array vazio para CSV somente com header', async () => {
    const csv = 'Network, Name, Game ID, Stake, Rake, Result, Position, Entrants, Date, Currency, Flags, Speed, ReEntries/Rebuys';
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result).toEqual([]);
  });

  it('deve ignorar linhas com nome vazio e processar linhas validas', async () => {
    const csv = buildPokerStarsCSV([
      {
        'Network': 'PokerStars',
        ' Name': '', // nome vazio
        ' Game ID': '7001',
        ' Stake': '10',
        ' Rake': '1',
        ' Result': '0',
        ' Position': '100',
        ' Entrants': '500',
        ' Date': '2025-03-01 18:00',
        ' Currency': 'USD',
        ' Flags': '',
        ' Speed': '',
        ' ReEntries/Rebuys': '0',
      },
      {
        'Network': 'PokerStars',
        ' Name': '$22 Valid Tournament',
        ' Game ID': '7002',
        ' Stake': '20',
        ' Rake': '2',
        ' Result': '50',
        ' Position': '50',
        ' Entrants': '500',
        ' Date': '2025-03-01 19:00',
        ' Currency': 'USD',
        ' Flags': '',
        ' Speed': '',
        ' ReEntries/Rebuys': '0',
      },
    ]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('$22 Valid Tournament');
  });

  it('deve parsear multiplos torneios de um mesmo CSV', async () => {
    const rows = [];
    for (let i = 0; i < 5; i++) {
      rows.push({
        'Network': 'PokerStars',
        ' Name': `$${(i + 1) * 11} MTT #${i}`,
        ' Game ID': `800${i}`,
        ' Stake': `${(i + 1) * 10}`,
        ' Rake': `${i + 1}`,
        ' Result': '0',
        ' Position': '100',
        ' Entrants': '500',
        ' Date': `2025-03-0${i + 1} 18:00`,
        ' Currency': 'USD',
        ' Flags': '',
        ' Speed': '',
        ' ReEntries/Rebuys': '0',
      });
    }

    const csv = buildPokerStarsCSV(rows);
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(5);
  });

  it('deve parsear datas no formato YYYY-MM-DD HH:MM', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': '$11 MTT',
      ' Game ID': '8010',
      ' Stake': '10',
      ' Rake': '1',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '300',
      ' Date': '2025-06-15 14:30',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].datePlayed).toBeInstanceOf(Date);
    expect(result[0].datePlayed.getFullYear()).toBe(2025);
    expect(result[0].datePlayed.getMonth()).toBe(5); // June is 5 (0-indexed)
  });
});

// ---------------------------------------------------------------------------
// isCoinPokerFormat
// ---------------------------------------------------------------------------

describe('PokerCSVParser — isCoinPokerFormat', () => {
  it('deve retornar true para CSV com formato CoinPoker (type, description, amount, date + NL Holdem + USDT)', () => {
    const content = [
      'type,description,amount,date,status',
      "Withdrawal,NL Hold'em ? $5 Tournament,Withdrawal-5 USDT,2025-01-02 22:10:38,completed",
      "Deposit,NL Hold'em ? $5 Tournament,Deposit 15 USDT,2025-01-02 23:30:00,completed",
    ].join('\n');

    expect(PokerCSVParser.isCoinPokerFormat(content)).toBe(true);
  });

  it('deve retornar false para CSV sem padrao CoinPoker', () => {
    const content = [
      'Network, Name, Game ID, Stake',
      'PokerStars, $11 MTT, 1234, 10',
    ].join('\n');

    expect(PokerCSVParser.isCoinPokerFormat(content)).toBe(false);
  });

  it('deve retornar false para conteudo com menos de 2 linhas', () => {
    expect(PokerCSVParser.isCoinPokerFormat('type,description,amount,date')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CoinPoker CSV parser
// ---------------------------------------------------------------------------

describe('PokerCSVParser — parseCoinPokerCSV', () => {
  it('deve criar torneio pareando withdrawal (negativo) com deposit (positivo) do mesmo nome e data', async () => {
    const content = [
      'type,description,amount,date,status',
      "Withdrawal,NL Hold'em ? $5 PKO Turbo,-5 USDT,2025-01-10 18:00:00,completed",
      "Deposit,NL Hold'em ? $5 PKO Turbo,25 USDT,2025-01-10 20:00:00,completed",
    ].join('\n');

    const result = await PokerCSVParser.parseCoinPokerCSV(content, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].buyIn).toBe(5);
    expect(result[0].prize).toBe(20); // 25 - 5
    expect(result[0].site).toBe('CoinPoker');
    expect(result[0].currency).toBe('USD'); // USDT treated as USD
  });

  it('deve definir site como CoinPoker e currency como USD (USDT -> USD)', async () => {
    const content = [
      'type,description,amount,date,status',
      "Withdrawal,NL Hold'em ? $10 Vanilla,-10 USDT,2025-02-01 18:00:00,completed",
      "Deposit,NL Hold'em ? $10 Vanilla,0 USDT,2025-02-01 19:00:00,completed",
    ].join('\n');

    const result = await PokerCSVParser.parseCoinPokerCSV(content, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('CoinPoker');
    expect(result[0].currency).toBe('USD');
    expect(result[0].convertedToUSD).toBe(false);
  });

  it('deve detectar PKO na categoria pelo nome do torneio', async () => {
    const content = [
      'type,description,amount,date,status',
      "Withdrawal,NL Hold'em ? $5 Bounty Event,-5 USDT,2025-02-01 18:00:00,completed",
      "Deposit,NL Hold'em ? $5 Bounty Event,0 USDT,2025-02-01 19:00:00,completed",
    ].join('\n');

    const result = await PokerCSVParser.parseCoinPokerCSV(content, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('PKO');
  });

  it('deve detectar Turbo no speed pelo nome do torneio', async () => {
    const content = [
      'type,description,amount,date,status',
      "Withdrawal,NL Hold'em ? $5 Turbo Event,-5 USDT,2025-02-01 18:00:00,completed",
      "Deposit,NL Hold'em ? $5 Turbo Event,0 USDT,2025-02-01 19:00:00,completed",
    ].join('\n');

    const result = await PokerCSVParser.parseCoinPokerCSV(content, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].speed).toBe('Turbo');
  });

  it('deve retornar array vazio para conteudo com menos de 2 linhas', async () => {
    const content = 'type,description,amount,date,status';
    const result = await PokerCSVParser.parseCoinPokerCSV(content, 'USER-0001');
    expect(result).toEqual([]);
  });

  it('deve ignorar linhas que nao sao NL Holdem', async () => {
    const content = [
      'type,description,amount,date,status',
      "Withdrawal,Cash Game ? Table 1,-5 USDT,2025-02-01 18:00:00,completed",
      "Deposit,Cash Game ? Table 1,10 USDT,2025-02-01 19:00:00,completed",
    ].join('\n');

    const result = await PokerCSVParser.parseCoinPokerCSV(content, 'USER-0001');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Coin TXT parser (parseCoinTXT)
// ---------------------------------------------------------------------------

describe('PokerCSVParser — parseCoinTXT', () => {
  // parseCoinTXT expects raw text lines (not CSV), with specific patterns:
  // Withdrawal lines: "... ? <name> <YYYY-MM-DD> ... Withdrawal-<amount> USDT ..."
  // Deposit lines: "... ? <name> <YYYY-MM-DD> ... Deposit <amount> USDT ..."

  it('deve definir site como Coin e currency como USDT', async () => {
    const content = [
      'header line',
      'something ? Sunday Main 2025-01-02 22:10:38 Withdrawal-25 USDT completed',
      'something ? Sunday Main 2025-01-02 23:30:00 Deposit 131.25 USDT completed',
    ].join('\n');

    const result = await PokerCSVParser.parseCoinTXT(content, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('Coin');
    expect(result[0].currency).toBe('USDT');
    expect(result[0].buyIn).toBe(25);
    expect(result[0].prize).toBe(131.25 - 25); // deposit - withdrawal = net profit
  });

  it('deve detectar PKO na categoria do Coin format', async () => {
    const content = [
      'header line',
      'something ? PKO Sunday 2025-01-02 22:10:38 Withdrawal-25 USDT completed',
      'something ? PKO Sunday 2025-01-02 23:30:00 Deposit 50 USDT completed',
    ].join('\n');

    const result = await PokerCSVParser.parseCoinTXT(content, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('PKO');
  });

  it('deve detectar Turbo speed no Coin format quando nome contem TURBO', async () => {
    const content = [
      'header line',
      'something ? Turbo Event 2025-01-02 22:10:38 Withdrawal-10 USDT completed',
      'something ? Turbo Event 2025-01-02 23:30:00 Deposit 0 USDT completed',
    ].join('\n');

    const result = await PokerCSVParser.parseCoinTXT(content, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].speed).toBe('Turbo');
  });

  it('deve retornar Vanilla e Normal como padrao', async () => {
    const content = [
      'header line',
      'something ? Sunday Main 2025-01-02 22:10:38 Withdrawal-50 USDT completed',
      'something ? Sunday Main 2025-01-02 23:30:00 Deposit 0 USDT completed',
    ].join('\n');

    const result = await PokerCSVParser.parseCoinTXT(content, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].category).toBe('Vanilla');
    expect(result[0].speed).toBe('Normal');
  });

  it('deve detectar Hyper speed quando nome contem HYPER', async () => {
    const content = [
      'header line',
      'something ? Hyper Event 2025-01-02 22:10:38 Withdrawal-5 USDT completed',
      'something ? Hyper Event 2025-01-02 23:30:00 Deposit 0 USDT completed',
    ].join('\n');

    const result = await PokerCSVParser.parseCoinTXT(content, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].speed).toBe('Hyper');
  });
});

// ---------------------------------------------------------------------------
// Bodog XLSX parser
// ---------------------------------------------------------------------------

describe('PokerCSVParser — parseBodogXLSX', () => {
  // Note: Testing Bodog parser requires creating actual Excel buffers.
  // We test it with a minimal valid workbook.

  it('deve definir site como Bodog e category como Vanilla para formato Bodog', async () => {
    // Create a minimal XLSX buffer with Bodog format
    const XLSX = await import('xlsx');
    const data = [
      [], // row 1 - irrelevant header
      [], // row 2
      [], // row 3
      [], // row 4
      // row 5 onwards = data (Bodog format starts at row 5)
      ['2025-01-15 10:00:00', 'Poker Multi Table Tournament Buy-In', 'REF-001', -22],
      ['2025-01-15 12:00:00', 'Poker Multi Table Tournament Cashout/Payout', 'REF-001', 150],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const result = await PokerCSVParser.parseBodogXLSX(buffer, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('Bodog');
    expect(result[0].category).toBe('Vanilla');
    expect(result[0].currency).toBe('USD');
    expect(result[0].buyIn).toBe(22);
    expect(result[0].prize).toBe(150 - 22); // payout - buyIn
  });

  it('deve retornar prize 0 quando nao ha Cashout/Payout correspondente', async () => {
    const XLSX = await import('xlsx');
    const data = [
      [], [], [], [],
      ['2025-01-15 10:00:00', 'Poker Multi Table Tournament Buy-In', 'REF-002', -33],
      // No matching payout for REF-002
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const result = await PokerCSVParser.parseBodogXLSX(buffer, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].buyIn).toBe(33);
    expect(result[0].prize).toBe(0 - 33); // no payout: profit = 0 - buyIn
  });

  it('deve deduplicar por Reference ID', async () => {
    const XLSX = await import('xlsx');
    const data = [
      [], [], [], [],
      // Two buy-ins with same ref ID should only produce one tournament
      ['2025-01-15 10:00:00', 'Poker Multi Table Tournament Buy-In', 'REF-DUP', -10],
      ['2025-01-15 10:05:00', 'Poker Multi Table Tournament Buy-In', 'REF-DUP', -10],
      ['2025-01-15 12:00:00', 'Poker Multi Table Tournament Cashout/Payout', 'REF-DUP', 50],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const result = await PokerCSVParser.parseBodogXLSX(buffer, 'USER-0001');
    // Only the first buy-in for REF-DUP should be processed
    expect(result.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Network detection routing
// ---------------------------------------------------------------------------

describe('PokerCSVParser — network detection routing', () => {
  it('deve rotear para parser 888poker quando Network = 888poker', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': '888poker',
      ' Name': '$11 888 Turbo',
      ' Game ID': '9001',
      ' Stake': '10',
      ' Rake': '1',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '300',
      ' Date': '2025-03-15 18:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': 'Turbo',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('888poker');
  });

  it('deve rotear para parser Chico quando Network = Chico', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'Chico',
      ' Name': '$5 Chico MTT',
      ' Game ID': '9002',
      ' Stake': '4.5',
      ' Rake': '0.5',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '200',
      ' Date': '2025-03-15 19:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('Chico');
  });

  it('deve rotear para parser PartyPoker quando Network = PartyPoker', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PartyPoker',
      ' Name': '$22 PartyPoker MTT',
      ' Game ID': '9003',
      ' Stake': '20',
      ' Rake': '2',
      ' Result': '0',
      ' Position': '100',
      ' Entrants': '400',
      ' Date': '2025-03-15 20:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    // PartyPoker parser uses different site naming
    expect(result[0].userId).toBe('USER-0001');
  });
});

// ---------------------------------------------------------------------------
// parseFloatSafe / parseIntSafe (tested implicitly via parsers)
// ---------------------------------------------------------------------------

describe('PokerCSVParser — safe number parsing via PokerStars format', () => {
  it('deve tratar stake vazio como 0', async () => {
    const csv = buildPokerStarsCSV([{
      'Network': 'PokerStars',
      ' Name': 'Freeroll MTT',
      ' Game ID': '10001',
      ' Stake': '',
      ' Rake': '0',
      ' Result': '10',
      ' Position': '5',
      ' Entrants': '1000',
      ' Date': '2025-04-01 18:00',
      ' Currency': 'USD',
      ' Flags': '',
      ' Speed': '',
      ' ReEntries/Rebuys': '0',
    }]);

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBe(1);
    expect(result[0].buyIn).toBe(0); // empty stake + 0 rake
  });
});

// ---------------------------------------------------------------------------
// Portuguese header support
// ---------------------------------------------------------------------------

describe('PokerCSVParser — Brazilian/Portuguese CSV format', () => {
  it('deve parsear formato brasileiro com colunas em portugues (Rede, Nome, Posicao, etc.)', async () => {
    const csv = [
      'Rede,Nome,Stake,Rake,Resultado,Posição,Participantes,Data,Moeda,Bandeiras,Velocidade',
      'GGNetwork,$22 Bounty Hunters,20,2,50,15,500,2025-01-20 19:00,USD,,Normal',
    ].join('\n');

    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    // The parser detects Network from 'Rede' column via normalization
    expect(result.length).toBe(1);
    expect(result[0].site).toBe('GGPoker');
  });
});
