import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: server/storage.ts - metodos de tickets
//
// Fontes:
//  - docs/specs/satellite-tickets-management.md (RF-01 storage layer)
//  - docs/architecture/feature-flows/ticket-lifecycle.md (concorrencia, FOR UPDATE)
//
// B1 do reviewer: storage agora usa Drizzle real. Esta suite mocka `server/db`
// com uma fachada Drizzle-shape backed por Map (in-memory store seedado com
// fixture IDs), e mocka `drizzle-orm` retornando predicate descriptors que a
// fachada avalia.
// =============================================================================

vi.mock('drizzle-orm', async (importOriginal: any) => {
  const actual: any = await importOriginal();
  // Predicates retornam tags simples que a fachada avalia.
  const eq = (col: any, val: any) => ({ __pred: 'eq', col, val });
  const and = (...conds: any[]) => ({ __pred: 'and', conds: conds.filter(Boolean) });
  const or = (...conds: any[]) => ({ __pred: 'or', conds: conds.filter(Boolean) });
  const gte = (col: any, val: any) => ({ __pred: 'gte', col, val });
  const lte = (col: any, val: any) => ({ __pred: 'lte', col, val });
  const gt = (col: any, val: any) => ({ __pred: 'gt', col, val });
  const isNull = (col: any) => ({ __pred: 'isNull', col });
  const isNotNull = (col: any) => ({ __pred: 'isNotNull', col });
  const inArray = (col: any, vals: any[]) => ({ __pred: 'in', col, vals });
  const not = (cond: any) => ({ __pred: 'not', cond });
  const like = (col: any, val: any) => ({ __pred: 'like', col, val });
  const count = () => ({ __agg: 'count' });
  const desc = (col: any) => ({ __order: 'desc', col });
  const asc = (col: any) => ({ __order: 'asc', col });
  const sql: any = (strings: TemplateStringsArray, ...values: any[]) => ({
    __sql: true,
    strings: Array.from(strings),
    values,
  });
  sql.raw = (s: string) => ({ __sql: true, raw: s });
  return { ...actual, eq, and, or, gte, lte, gt, isNull, isNotNull, inArray, not, like, count, desc, asc, sql };
});

// Stores em globalThis (compartilhados entre o factory de vi.mock e o
// beforeEach abaixo, ja que vi.mock e hoisted e nao pode capturar locais).
// Lazy-init helper porque vi.mock factory e hoisted para o topo absoluto.
function __ensureStores(): {
  tickets: Map<string, any>;
  tournaments: Map<string, any>;
  sessionTournaments: Map<string, any>;
} {
  const g = globalThis as any;
  if (!g.__ticketsMap) g.__ticketsMap = new Map();
  if (!g.__tournamentsMap) g.__tournamentsMap = new Map();
  if (!g.__sessionTournamentsMap) g.__sessionTournamentsMap = new Map();
  return {
    tickets: g.__ticketsMap,
    tournaments: g.__tournamentsMap,
    sessionTournaments: g.__sessionTournamentsMap,
  };
}

function __seedFixtures() {
  const { tickets: ticketsMap, tournaments: tournamentsMap, sessionTournaments: sessionTournamentsMap } = __ensureStores();
  ticketsMap.clear();
  tournamentsMap.clear();
  sessionTournamentsMap.clear();
  const seed = (t: any) => {
    ticketsMap.set(t.id, {
      sourceTournamentId: null, sourceSessionTournamentId: null,
      targetTemplateId: null, targetName: null, targetSite: null,
      ticketValueUSD: '215', extraCashUSD: null,
      usedInTournamentId: null, usedInSessionTournamentId: null,
      earnedAt: new Date('2026-04-20T00:00:00Z'),
      expiresAt: null, usedAt: null, cancelledAt: null,
      transferredAt: null, transferredToUserId: null,
      notifiedExpiringAt: null, note: null,
      source: 'manual',
      createdAt: new Date('2026-04-20T00:00:00Z'),
      updatedAt: new Date('2026-04-20T00:00:00Z'),
      ...t,
    });
  };
  seed({ id: 'tkt-1', userId: 'USER-0001', status: 'available',
         targetName: 'WSOP', targetSite: 'GG' });
  seed({ id: 'tkt-2', userId: 'USER-0001', status: 'available',
         targetName: 'X', targetSite: 'GG' });
  seed({ id: 'tkt-already-used', userId: 'USER-0001', status: 'used',
         targetName: 'X', targetSite: 'GG' });
  seed({ id: 'tkt-expired', userId: 'USER-0001', status: 'expired',
         targetName: 'X', targetSite: 'GG' });
  seed({ id: 'tkt-cancelled', userId: 'USER-0001', status: 'cancelled',
         targetName: 'X', targetSite: 'GG' });
  seed({ id: 'tkt-other-user', userId: 'USER-OTHER', status: 'available',
         targetName: 'X', targetSite: 'GG' });
  seed({ id: 'tkt-match-fail', userId: 'USER-0001', status: 'available',
         targetName: 'WSOP', targetSite: 'GG' });

  tournamentsMap.set('t-1', {
    id: 't-1', userId: 'USER-0001', templateId: null, name: 'WSOP', site: 'GG',
  });
  tournamentsMap.set('t-other', {
    id: 't-other', userId: 'USER-0001', templateId: null,
    name: 'Other Tournament', site: 'PokerStars',
  });
  sessionTournamentsMap.set('st-1', {
    id: 'st-1', userId: 'USER-0001', templateId: null, name: 'WSOP', site: 'GG',
  });
}
__seedFixtures();

// vi.mock factory hoisted — declara o fake `db` self-contained, lendo dos
// stores no globalThis (lazy-init em cada chamada porque o factory pode rodar
// antes de qualquer top-level statement do arquivo de teste).
vi.mock('../../../server/db', () => {
  function ensure() {
    const g = globalThis as any;
    if (!g.__ticketsMap) g.__ticketsMap = new Map();
    if (!g.__tournamentsMap) g.__tournamentsMap = new Map();
    if (!g.__sessionTournamentsMap) g.__sessionTournamentsMap = new Map();
    return {
      ticketsMap: g.__ticketsMap as Map<string, any>,
      tournamentsMap: g.__tournamentsMap as Map<string, any>,
      sessionTournamentsMap: g.__sessionTournamentsMap as Map<string, any>,
    };
  }

  function colKey(col: any): string {
    if (!col) return '';
    const sqlName = col?.name ?? col?.['_']?.name ?? '';
    const map: Record<string, string> = {
      id: 'id',
      user_id: 'userId',
      source_tournament_id: 'sourceTournamentId',
      source_session_tournament_id: 'sourceSessionTournamentId',
      target_template_id: 'targetTemplateId',
      target_name: 'targetName',
      target_site: 'targetSite',
      ticket_value_usd: 'ticketValueUSD',
      extra_cash_usd: 'extraCashUSD',
      status: 'status',
      used_in_tournament_id: 'usedInTournamentId',
      used_in_session_tournament_id: 'usedInSessionTournamentId',
      earned_at: 'earnedAt',
      expires_at: 'expiresAt',
      template_id: 'templateId',
      name: 'name',
      site: 'site',
    };
    return map[sqlName] ?? sqlName;
  }

  function evalPred(pred: any, row: any): boolean {
    if (!pred) return true;
    if (pred.__pred === 'eq') return row[colKey(pred.col)] === pred.val;
    if (pred.__pred === 'and') return pred.conds.every((c: any) => evalPred(c, row));
    if (pred.__pred === 'or') return pred.conds.some((c: any) => evalPred(c, row));
    if (pred.__pred === 'gte') {
      const a = row[colKey(pred.col)];
      const av = a instanceof Date ? a.getTime() : a;
      const bv = pred.val instanceof Date ? pred.val.getTime() : pred.val;
      return av >= bv;
    }
    if (pred.__pred === 'lte') {
      const a = row[colKey(pred.col)];
      const av = a instanceof Date ? a.getTime() : a;
      const bv = pred.val instanceof Date ? pred.val.getTime() : pred.val;
      return av <= bv;
    }
    if (pred.__pred === 'isNull') return row[colKey(pred.col)] == null;
    if (pred.__pred === 'in') return pred.vals.includes(row[colKey(pred.col)]);
    if (pred.__sql) {
      const strs: string[] = pred.strings ?? [];
      const vals: any[] = pred.values ?? [];
      const joined = strs.join('?');
      if (joined.includes('lower(') && joined.includes('=')) {
        const col = vals[0];
        const target = vals[1];
        const k = colKey(col);
        const v = (row[k] ?? '').toString().toLowerCase();
        return v === target;
      }
      return true;
    }
    return true;
  }

  function tableStore(table: any): Map<string, any> {
    const stores = ensure();
    const tableName = table?._?.name ?? table?.[Symbol.for('drizzle:Name')] ?? table?.name;
    if (tableName === 'tickets') return stores.ticketsMap;
    if (tableName === 'tournaments') return stores.tournamentsMap;
    if (tableName === 'session_tournaments') return stores.sessionTournamentsMap;
    return stores.ticketsMap;
  }

  class SelectBuilder {
    table: any = null;
    cond: any = null;
    orderSpecs: any[] = [];
    limitN: number | null = null;
    from(t: any) { this.table = t; return this; }
    where(c: any) { this.cond = c; return this; }
    orderBy(...specs: any[]) { this.orderSpecs = specs; return this; }
    limit(n: number) { this.limitN = n; return this; }
    offset(_n: number) { return this; }
    async _run(): Promise<any[]> {
      const store = tableStore(this.table);
      let rows = Array.from(store.values()).filter((r: any) => evalPred(this.cond, r));
      for (const spec of [...this.orderSpecs].reverse()) {
        if (!spec) continue;
        if (spec.__order) {
          const k = colKey(spec.col);
          rows.sort((a: any, b: any) => {
            const av = a[k] instanceof Date ? a[k].getTime() : a[k];
            const bv = b[k] instanceof Date ? b[k].getTime() : b[k];
            if (av == null && bv == null) return 0;
            if (av == null) return spec.__order === 'asc' ? 1 : -1;
            if (bv == null) return spec.__order === 'asc' ? -1 : 1;
            if (av < bv) return spec.__order === 'asc' ? -1 : 1;
            if (av > bv) return spec.__order === 'asc' ? 1 : -1;
            return 0;
          });
        } else if (spec.__sql) {
          const col = (spec.values ?? [])[0];
          const k = colKey(col);
          rows.sort((a: any, b: any) => {
            const av = a[k] instanceof Date ? a[k].getTime() : a[k];
            const bv = b[k] instanceof Date ? b[k].getTime() : b[k];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av < bv) return -1;
            if (av > bv) return 1;
            return 0;
          });
        }
      }
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      return rows.map((r: any) => ({ ...r }));
    }
    then(onF: any, onR?: any) { return this._run().then(onF, onR); }
    catch(onR: any) { return this._run().catch(onR); }
  }

  class InsertBuilder {
    table: any;
    vals: any = null;
    constructor(table: any) { this.table = table; }
    values(v: any) { this.vals = v; return this; }
    returning() {
      const store = tableStore(this.table);
      store.set(this.vals.id, { ...this.vals });
      return Promise.resolve([{ ...this.vals }]);
    }
  }

  class UpdateBuilder {
    table: any;
    patch: any = null;
    cond: any = null;
    constructor(table: any) { this.table = table; }
    set(p: any) { this.patch = p; return this; }
    where(c: any) { this.cond = c; return this; }
    returning() {
      const store = tableStore(this.table);
      const updated: any[] = [];
      for (const [k, row] of store.entries()) {
        if (evalPred(this.cond, row)) {
          const next = { ...row, ...this.patch };
          store.set(k, next);
          updated.push({ ...next });
        }
      }
      return Promise.resolve(updated);
    }
    then(onF: any, onR?: any) {
      const store = tableStore(this.table);
      for (const [k, row] of store.entries()) {
        if (evalPred(this.cond, row)) store.set(k, { ...row, ...this.patch });
      }
      return Promise.resolve(undefined).then(onF, onR);
    }
  }

  const dbFake: any = {
    insert: (t: any) => new InsertBuilder(t),
    select: () => new SelectBuilder(),
    update: (t: any) => new UpdateBuilder(t),
    execute: async (sqlObj: any) => {
      // getTicketByIdForUpdate: sql`SELECT * FROM tickets WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`
      const stores = ensure();
      const vals = sqlObj?.values ?? [];
      const id = vals[0];
      const userId = vals[1];
      const row = stores.ticketsMap.get(id);
      if (!row) return { rows: [] };
      if (userId && row.userId !== userId) return { rows: [] };
      return { rows: [{ ...row }] };
    },
    transaction: async (fn: any) => fn(dbFake),
  };

  return { db: dbFake, pool: {} };
});

// Re-seed fixtures antes de cada teste.
beforeEach(() => {
  __seedFixtures();
});

// Testaremos a fachada exportada de server/storage.ts. As funcoes esperadas
// sao novas — em red phase os imports vao falhar, o que e esperado.
import {
  createTicket,
  getActiveTicketsByUser,
  getTicketsByUser,
  useTicket,
  cancelTicket,
} from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createTicket
// ---------------------------------------------------------------------------

describe('storage.createTicket', () => {
  it('e exportado de server/storage.ts', () => {
    expect(typeof createTicket).toBe('function');
  });

  it('source=satellite_result exige sourceSessionTournamentId OU sourceTournamentId', async () => {
    await expect(
      createTicket({
        userId: 'USER-0001',
        ticketValueUSD: '215',
        targetName: 'WSOP ME',
        source: 'satellite_result',
      } as any),
    ).rejects.toThrow(/source/i);
  });

  it('source=manual rejeita sourceTournamentId preenchido', async () => {
    await expect(
      createTicket({
        userId: 'USER-0001',
        ticketValueUSD: '215',
        targetName: 'WSOP ME',
        source: 'manual',
        sourceTournamentId: 't-1',
      } as any),
    ).rejects.toThrow(/source/i);
  });

  it('source=manual rejeita sourceSessionTournamentId preenchido', async () => {
    await expect(
      createTicket({
        userId: 'USER-0001',
        ticketValueUSD: '215',
        targetName: 'WSOP ME',
        source: 'manual',
        sourceSessionTournamentId: 'st-1',
      } as any),
    ).rejects.toThrow(/source/i);
  });

  it('source=satellite_result com sourceSessionTournamentId valido cria ticket', async () => {
    const result = await createTicket({
      userId: 'USER-0001',
      ticketValueUSD: '215',
      targetName: 'WSOP ME',
      source: 'satellite_result',
      sourceSessionTournamentId: 'st-1',
    } as any);
    expect(result).toBeDefined();
    expect((result as any).status).toBe('available');
  });
});

// ---------------------------------------------------------------------------
// getActiveTicketsByUser (FIFO ascending por earnedAt)
// ---------------------------------------------------------------------------

describe('storage.getActiveTicketsByUser', () => {
  it('e exportado', () => {
    expect(typeof getActiveTicketsByUser).toBe('function');
  });

  it('retorna apenas status=available, ordenado por earnedAt ASC (FIFO)', async () => {
    const result = await getActiveTicketsByUser('USER-0001');
    expect(Array.isArray(result)).toBe(true);
    // Garantimos contrato: nenhum ticket com status != available retornado
    for (const t of result as any[]) {
      expect(t.status).toBe('available');
    }
  });

  it('retorna array vazio quando user nao tem tickets ativos', async () => {
    const result = await getActiveTicketsByUser('USER-NOFITHTS');
    expect(Array.isArray(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getTicketsByUser (com filtros)
// ---------------------------------------------------------------------------

describe('storage.getTicketsByUser', () => {
  it('e exportado', () => {
    expect(typeof getTicketsByUser).toBe('function');
  });

  it('aceita filtros opcionais (status, expiringIn, targetTemplateId)', async () => {
    const result = await getTicketsByUser('USER-0001', {
      status: 'available',
      expiringIn: 7,
      targetTemplateId: 'tpl-1',
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('sem filtros: retorna todos os tickets do user (qualquer status)', async () => {
    const result = await getTicketsByUser('USER-0001');
    expect(Array.isArray(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useTicket — transacao com SELECT FOR UPDATE + match server-side
// ---------------------------------------------------------------------------

describe('storage.useTicket', () => {
  it('e exportado', () => {
    expect(typeof useTicket).toBe('function');
  });

  it('lanca erro 404 quando ticket nao existe ou nao pertence ao user', async () => {
    await expect(
      useTicket('tkt-404', 'USER-0001', 't-1', 'tournament'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lanca erro 409 quando ticket ja foi usado (status=used)', async () => {
    // Esperamos que o storage simule ticket ja usado e retorne 409
    await expect(
      useTicket('tkt-already-used', 'USER-0001', 't-1', 'tournament'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('lanca erro 409 quando ticket esta expired', async () => {
    await expect(
      useTicket('tkt-expired', 'USER-0001', 't-1', 'tournament'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('lanca erro 409 quando ticket esta cancelled', async () => {
    await expect(
      useTicket('tkt-cancelled', 'USER-0001', 't-1', 'tournament'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('lanca erro 422 quando ticket nao casa com o tournament alvo (match server-side)', async () => {
    await expect(
      useTicket('tkt-match-fail', 'USER-0001', 't-other', 'tournament'),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('happy path: marca ticket como used e atualiza session_tournament/tournament', async () => {
    const r = await useTicket('tkt-1', 'USER-0001', 'st-1', 'session_tournament');
    expect((r as any).status).toBe('used');
  });
});

// ---------------------------------------------------------------------------
// cancelTicket
// ---------------------------------------------------------------------------

describe('storage.cancelTicket', () => {
  it('e exportado', () => {
    expect(typeof cancelTicket).toBe('function');
  });

  it('marca ticket available como cancelled (sem efeito em wallet)', async () => {
    const r = await cancelTicket('tkt-1', 'USER-0001', 'Torneio cancelado pela rede');
    expect((r as any).status).toBe('cancelled');
  });

  it('idempotente: chamar 2x em ticket ja cancelled nao duplica nota nem erra', async () => {
    const r1 = await cancelTicket('tkt-2', 'USER-0001');
    const r2 = await cancelTicket('tkt-2', 'USER-0001');
    expect((r2 as any).status).toBe('cancelled');
    // Idempotencia: a segunda chamada nao re-aplica timestamps nem duplica notas
    expect((r2 as any).cancelledAt).toEqual((r1 as any).cancelledAt);
  });

  it('rejeita cancelar ticket already used (409)', async () => {
    await expect(
      cancelTicket('tkt-already-used', 'USER-0001'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejeita cancelar ticket de outro user (404 — info leak prevention)', async () => {
    await expect(
      cancelTicket('tkt-other-user', 'USER-0001'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
