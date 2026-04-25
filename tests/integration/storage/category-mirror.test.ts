import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD - Sprint 1 - Espelhamento type <-> category no storage layer
// Fonte: ADR-031 §"Detalhes-chave do design" item 5
//        ADR-032 (deprecation gradual de category)
//        Spec D2 — "Storage layer GARANTE espelhamento automatico
//                  (category = type em todos os writes)".
//
// COMO TESTAMOS:
//   - Mockamos `db` (drizzle) e capturamos os argumentos passados a
//     db.insert().values(...) e db.update().set(...).
//   - Validamos que sempre que um payload com `type` chega ao storage,
//     ele sai com `category = type` espelhado.
//   - Validamos que se ambos vierem divergentes, `type` prevalece.
//   - Validamos que se so `category` vier, `type` e back-fillado.
//
// LIMITACAO ACEITAVEL: estes testes nao rodam contra DB real (Drizzle
// kit + db:push ainda nao foi executado para os campos novos). Quando
// o Sprint 1 estiver merged, converter este arquivo para usar pg-mem ou
// banco de teste real.
// =============================================================================

// Captura dos values que sao passados ao .values()
const insertedValues: any[] = [];
const updatedValues: any[] = [];

const mockReturning = vi.fn().mockResolvedValue([{ id: 'tourn-1' }]);

const mockDbValues = vi.fn().mockImplementation((vals: any) => {
  insertedValues.push(vals);
  return { returning: mockReturning };
});

const mockDbSet = vi.fn().mockImplementation((vals: any) => {
  updatedValues.push(vals);
  return {
    where: () => ({ returning: mockReturning }),
  };
});

vi.mock('../../../server/db', () => ({
  db: {
    insert: () => ({ values: mockDbValues }),
    update: () => ({ set: mockDbSet }),
  },
  pool: {},
}));

// Importamos o storage APOS o mock para que a importacao use o db mockado.
import { storage } from '../../../server/storage';

beforeEach(() => {
  insertedValues.length = 0;
  updatedValues.length = 0;
  mockReturning.mockClear();
  mockDbValues.mockClear();
  mockDbSet.mockClear();
});

// ---------------------------------------------------------------------------
// Caso 1: type=PKO -> category=PKO automatico
// ---------------------------------------------------------------------------

describe('storage.createTournament espelha type -> category', () => {
  it('payload com type=PKO resulta em category=PKO no INSERT', async () => {
    await storage.createTournament({
      userId: 'USER-0001',
      tournamentId: 't-1',
      name: 'Daily $22 PKO',
      buyIn: '22.00',
      datePlayed: new Date('2026-04-25T19:00:00Z'),
      site: 'PokerStars',
      format: 'MTT',
      type: 'PKO' as any,
      speed: 'Normal',
      // category NAO enviado de proposito
    } as any);

    expect(insertedValues.length).toBe(1);
    expect(insertedValues[0].type).toBe('PKO');
    expect(insertedValues[0].category).toBe('PKO');
  });

  it('payload com type=Mystery resulta em category=Mystery', async () => {
    await storage.createTournament({
      userId: 'USER-0001',
      name: 'Mystery $11',
      buyIn: '11.00',
      datePlayed: new Date(),
      site: 'PokerStars',
      format: 'MTT',
      type: 'Mystery' as any,
      speed: 'Normal',
    } as any);

    expect(insertedValues[0].type).toBe('Mystery');
    expect(insertedValues[0].category).toBe('Mystery');
  });

  it('payload com type=Satellite resulta em category=Satellite', async () => {
    await storage.createTournament({
      userId: 'USER-0001',
      name: 'Sat to Sunday Million',
      buyIn: '5.00',
      datePlayed: new Date(),
      site: 'PokerStars',
      format: 'MTT',
      type: 'Satellite' as any,
      speed: 'Normal',
    } as any);

    expect(insertedValues[0].type).toBe('Satellite');
    expect(insertedValues[0].category).toBe('Satellite');
  });
});

// ---------------------------------------------------------------------------
// Caso 2: divergencia type vs category - type prevalece
// ---------------------------------------------------------------------------

describe('storage.createTournament - type prevalece sobre category divergente', () => {
  it('type=PKO + category=Vanilla -> ambos viram PKO', async () => {
    await storage.createTournament({
      userId: 'USER-0001',
      name: 'X',
      buyIn: '10.00',
      datePlayed: new Date(),
      site: 'PokerStars',
      format: 'MTT',
      type: 'PKO' as any,
      category: 'Vanilla' as any,
      speed: 'Normal',
    } as any);

    expect(insertedValues[0].type).toBe('PKO');
    expect(insertedValues[0].category).toBe('PKO');
  });
});

// ---------------------------------------------------------------------------
// Caso 3: somente category enviado -> back-fill de type
// ---------------------------------------------------------------------------

describe('storage.createTournament - back-fill type quando so category vem', () => {
  it('payload so com category=Mystery -> type=Mystery', async () => {
    await storage.createTournament({
      userId: 'USER-0001',
      name: 'X',
      buyIn: '10.00',
      datePlayed: new Date(),
      site: 'PokerStars',
      format: 'MTT',
      category: 'Mystery' as any,
      speed: 'Normal',
    } as any);

    expect(insertedValues[0].type).toBe('Mystery');
    expect(insertedValues[0].category).toBe('Mystery');
  });
});

// ---------------------------------------------------------------------------
// Caso 4: updateTournament tambem espelha
// ---------------------------------------------------------------------------

describe('storage.updateTournament tambem espelha', () => {
  it('update parcial mudando apenas type=Satellite -> set inclui category=Satellite', async () => {
    await storage.updateTournament('tourn-1', { type: 'Satellite' as any });
    expect(updatedValues.length).toBe(1);
    expect(updatedValues[0].type).toBe('Satellite');
    expect(updatedValues[0].category).toBe('Satellite');
  });

  it('update sem mudar type/category preserva campos sem injetar Vanilla default', async () => {
    await storage.updateTournament('tourn-1', { name: 'New name' } as any);
    expect(updatedValues.length).toBe(1);
    expect(updatedValues[0].name).toBe('New name');
    // Quando nao ha mudanca em type/category, NAO devemos injetar default Vanilla
    // (isso sobrescreveria valor existente). type/category nao devem aparecer
    // na clausula SET.
    expect(updatedValues[0].type).toBeUndefined();
    expect(updatedValues[0].category).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Caso 5: createPlannedTournament tambem espelha
// ---------------------------------------------------------------------------

describe('storage.createPlannedTournament espelha type -> category', () => {
  it('planned tournament com type=PKO -> category=PKO no INSERT', async () => {
    await storage.createPlannedTournament({
      userId: 'USER-0001',
      dayOfWeek: 1,
      profile: 'A',
      site: 'PokerStars',
      time: '19:00',
      type: 'PKO' as any,
      speed: 'Normal',
      name: 'Daily $22',
      buyIn: '22.00',
    } as any);

    // Procura no inserted values pelo planned (pode ter outros inserts antes
    // do mock se storage chama outros helpers). Filtrar pelo dayOfWeek.
    const planned = insertedValues.find((v) => v?.dayOfWeek === 1);
    expect(planned).toBeTruthy();
    expect(planned.type).toBe('PKO');
    // Categories pode nao existir ainda em planned_tournaments — se ela for
    // adicionada (Sprint 1 schema delta), espelhar tambem.
    // Se NAO for adicionada, este teste pode ser ajustado pelo implementer
    // para nao validar `category` em planned. Mantemos o expect aqui para
    // sinalizar que o espelhamento e desejavel se a coluna existir.
    if ('category' in planned) {
      expect(planned.category).toBe('PKO');
    }
  });
});

// ---------------------------------------------------------------------------
// Caso 6: pureza — payload original nao e mutado
// ---------------------------------------------------------------------------

describe('storage.createTournament - nao muta o payload de entrada', () => {
  it('payload original mantem suas keys originais apos chamada', async () => {
    const input: any = {
      userId: 'USER-0001',
      name: 'X',
      buyIn: '10.00',
      datePlayed: new Date(),
      site: 'PokerStars',
      format: 'MTT',
      type: 'PKO',
      speed: 'Normal',
    };
    const snapshot = JSON.stringify({ ...input, datePlayed: 'D' });
    await storage.createTournament(input);
    expect(JSON.stringify({ ...input, datePlayed: 'D' })).toBe(snapshot);
  });
});
