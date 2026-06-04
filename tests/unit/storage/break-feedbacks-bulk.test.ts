import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Feature: Evolucao Mental Editavel na Sessao
// Spec : Docs/specs/evolucao-mental-editavel-sessao.md (RF-03)
// ADR  : Docs/architecture/decisions/242-mental-evolution-editable-bulk-replace-derived-medias.md
//
// Cobre:
//   1. bulkReplaceBreakFeedbacksSchema (Zod .strict()) — shared/schema.ts (NAO existe)
//   2. storage.updateBreakFeedback(id, data) — UPDATE...RETURNING (NAO existe)
//
// Lessons: #3 fakeDb espelha shape real; #34 ownership na rota (storage sem userId);
//   relations mock (lesson #36) ao mockar drizzle-orm parcial. .test.ts => server.
// Sem emoji.
// =============================================================================

// ----------------------------------------------------------------------------
// PARTE 1 — Zod schema do bulk-replace
// ----------------------------------------------------------------------------
describe('bulkReplaceBreakFeedbacksSchema (ADR-242)', () => {
  async function loadSchema(): Promise<any | null> {
    try {
      const mod = await import('../../../shared/schema');
      return (mod as any).bulkReplaceBreakFeedbacksSchema ?? null;
    } catch {
      return null;
    }
  }

  const validItem = {
    breakTime: '2026-06-04T14:30:00.000Z',
    foco: 7,
    energia: 6,
    confianca: 8,
    inteligenciaEmocional: 5,
    interferencias: 9,
    notes: 'perdi foco apos bad beat',
  };

  it('schema existe e e exportado', async () => {
    const schema = await loadSchema();
    expect(schema).not.toBeNull();
  });

  it('aceita { breaks: [...] } valido', async () => {
    const schema = await loadSchema();
    expect(schema).not.toBeNull();
    const r = schema.safeParse({ breaks: [validItem] });
    expect(r.success).toBe(true);
  });

  it('aceita breaks: [] (remove todos)', async () => {
    const schema = await loadSchema();
    expect(schema).not.toBeNull();
    const r = schema.safeParse({ breaks: [] });
    expect(r.success).toBe(true);
  });

  it('aceita id opcional no item (presente = update; ausente = novo)', async () => {
    const schema = await loadSchema();
    expect(schema).not.toBeNull();
    const r = schema.safeParse({ breaks: [{ ...validItem, id: 'b1' }] });
    expect(r.success).toBe(true);
  });

  it('rejeita body sem "breaks"', async () => {
    const schema = await loadSchema();
    expect(schema).not.toBeNull();
    const r = schema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejeita chave desconhecida no body (.strict())', async () => {
    const schema = await loadSchema();
    expect(schema).not.toBeNull();
    const r = schema.safeParse({ breaks: [validItem], hacker: 1 });
    expect(r.success).toBe(false);
  });

  it('rejeita chave desconhecida no item (.strict())', async () => {
    const schema = await loadSchema();
    expect(schema).not.toBeNull();
    const r = schema.safeParse({ breaks: [{ ...validItem, sessionId: 'sess_x' }] });
    expect(r.success).toBe(false);
  });

  it('rejeita notes acima de 500 chars', async () => {
    const schema = await loadSchema();
    expect(schema).not.toBeNull();
    const r = schema.safeParse({ breaks: [{ ...validItem, notes: 'x'.repeat(501) }] });
    expect(r.success).toBe(false);
  });

  it('aceita notes null', async () => {
    const schema = await loadSchema();
    expect(schema).not.toBeNull();
    const r = schema.safeParse({ breaks: [{ ...validItem, notes: null }] });
    expect(r.success).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// PARTE 2 — storage.updateBreakFeedback
// ----------------------------------------------------------------------------
vi.mock('drizzle-orm', async () => {
  const actual: any = await vi.importActual('drizzle-orm');
  return { ...actual, relations: actual.relations ?? vi.fn(() => ({})) };
});

const dbCalls = vi.hoisted(() => ({
  setData: null as any,
  whereArg: null as any,
  returningRows: [] as any[],
}));

vi.mock('../../../server/db', () => {
  const chain: any = {};
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn((data: any) => {
    dbCalls.setData = data;
    return chain;
  });
  chain.where = vi.fn((arg: any) => {
    dbCalls.whereArg = arg;
    return chain;
  });
  chain.returning = vi.fn(async () => dbCalls.returningRows);
  return { db: chain };
});

describe('storage.updateBreakFeedback (RF-03)', () => {
  beforeEach(() => {
    dbCalls.setData = null;
    dbCalls.whereArg = null;
    dbCalls.returningRows = [
      {
        id: 'b1',
        userId: 'USER-0001',
        sessionId: 'sess_1',
        breakTime: new Date('2026-06-04T13:00:00.000Z'),
        foco: 9,
        energia: 5,
        confianca: 5,
        inteligenciaEmocional: 5,
        interferencias: 5,
        notes: 'editado',
        createdAt: new Date('2026-06-04T12:00:00.000Z'),
      },
    ];
  });

  async function loadStorage(): Promise<any | null> {
    try {
      const mod = await import('../../../server/storage');
      return (mod as any).storage ?? null;
    } catch {
      return null;
    }
  }

  it('metodo existe na instancia de storage', async () => {
    const storage = await loadStorage();
    expect(storage).not.toBeNull();
    expect(typeof storage.updateBreakFeedback).toBe('function');
  });

  it('faz UPDATE...RETURNING e retorna a row atualizada', async () => {
    const storage = await loadStorage();
    expect(storage).not.toBeNull();
    const out = await storage.updateBreakFeedback('b1', { foco: 9, notes: 'editado' });
    expect(out.id).toBe('b1');
    expect(out.foco).toBe(9);
    expect(dbCalls.setData).toBeTruthy();
    expect(dbCalls.setData.foco).toBe(9);
  });

  it('NAO grava userId/sessionId/createdAt no SET (campos imutaveis)', async () => {
    const storage = await loadStorage();
    expect(storage).not.toBeNull();
    await storage.updateBreakFeedback('b1', {
      foco: 9,
      // tentativa de injetar campos imutaveis — devem ser ignorados pelo storage
      userId: 'USER-HACK',
      sessionId: 'sess_other',
      createdAt: new Date('2000-01-01T00:00:00.000Z'),
    } as any);
    expect('userId' in (dbCalls.setData ?? {})).toBe(false);
    expect('sessionId' in (dbCalls.setData ?? {})).toBe(false);
    expect('createdAt' in (dbCalls.setData ?? {})).toBe(false);
  });
});
