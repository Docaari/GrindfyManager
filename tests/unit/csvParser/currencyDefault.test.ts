/**
 * Sprint Backend Tech-Debt Sweep — RF-01.06 Currency default = USD
 *
 * Spec: Docs/specs/sprint-backend-sweep.md (R1-06)
 * Q-C: usuários novos defaultam para USD; usuários existentes com `currency='BRL'`
 *      NÃO mudam (defaults só aplicam em inserts sem currency explícito).
 *
 * Comportamento esperado:
 *   - `shared/schema.ts` users.currency.default === 'USD'
 *   - `shared/schema.ts` tournaments.currency.default === 'USD'
 *   - Parser continua default USD quando CSV não informa moeda (já é assim).
 *
 * NOTA: alguns testes podem aparecer como "regressão guard" — atualmente o
 * schema já tem default USD. Estes testes formalizam o contrato.
 */
import { describe, it, expect } from 'vitest';

describe('RF-01.06 — users.currency default = USD', () => {
  it('users table tem currency default "USD"', async () => {
    const schema = await import('@shared/schema');
    const users = schema.users;
    // drizzle pgTable expõe colunas em users[Symbol(drizzle:Columns)] / via build.
    // Acessar via getSQL fica frágil; verificamos via "any" cast no objeto coluna.
    const currencyCol: any = (users as any).currency;
    expect(currencyCol).toBeDefined();
    expect(currencyCol.default).toBe('USD');
  });
});

describe('RF-01.06 — tournaments.currency default = USD', () => {
  it('tournaments table tem currency default "USD"', async () => {
    const schema = await import('@shared/schema');
    const tournaments = schema.tournaments;
    const currencyCol: any = (tournaments as any).currency;
    expect(currencyCol).toBeDefined();
    expect(currencyCol.default).toBe('USD');
  });
});

describe('RF-01.06 — parser default currency = USD quando CSV não informa', () => {
  it('CSV genérico sem coluna Currency vira tournament.currency = "USD"', async () => {
    const { PokerCSVParser } = await import('../../../server/csvParser');
    // CSV genérico sem coluna Currency — fallback default USD
    const csv = [
      'Network,Name,Buy-in,Stake,Rake,Result,Position,Date,Entrants',
      'Generic,$22 NLHE,22,20,2,0,100,2025-01-15 18:00,500',
    ].join('\n');
    const result = await PokerCSVParser.parseCSV(csv, 'USER-0001');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].currency).toBe('USD');
  });

  it('normalizeCurrency(null) === "USD"', async () => {
    const { PokerCSVParser } = await import('../../../server/csvParser');
    expect(PokerCSVParser.normalizeCurrency(null)).toBe('USD');
  });

  it('normalizeCurrency(undefined) === "USD"', async () => {
    const { PokerCSVParser } = await import('../../../server/csvParser');
    expect(PokerCSVParser.normalizeCurrency(undefined)).toBe('USD');
  });

  it('normalizeCurrency("") === "USD"', async () => {
    const { PokerCSVParser } = await import('../../../server/csvParser');
    expect(PokerCSVParser.normalizeCurrency('')).toBe('USD');
  });
});
