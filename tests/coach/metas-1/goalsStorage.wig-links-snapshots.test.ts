import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// METAS-1 fatia-1 (ADR-229) — goalsStorage (WIG + links + snapshots)
//
// FIX-WAVE (pos-reviewer CHANGES-REQUESTED): a green phase passou com um fakeDb
// que IGNORAVA a forma da chamada (so encadeava insert/values/returning), e por
// isso MASCAROU 2 bugs prod-breaking (lesson #3):
//
//   BUG-A (CRITICAL/HIGH — career_goals NAO esta no drizzle, R1/R2/R3 do ADR):
//     a implementacao usa o query-builder drizzle (db.insert(careerGoals),
//     .innerJoin(careerGoals), .update(careerGoals)) contra um PLACEHOLDER inline
//     ({ id:"career_goals.id", ... }). Drizzle nao tem metadados de tabela/coluna
//     nesse placeholder -> em PROD ou explode ou escreve lixo. O ADR-229
//     (DEC-A6-impl opcao b, contrato de storage linha 240 "SQL parametrizado/
//     drizzle-or-raw") MANDA escrever/ler career_goals via SQL RAW PARAMETRIZADO
//     (db.execute(sql`...`)), exatamente como reportStorage/coachSignalsStorage ja
//     fazem para tabelas fora do drizzle. As tabelas drizzle REAIS (goal_wig_meta,
//     goal_links, goal_progress_snapshots — TODAS em shared/schema.ts) continuam
//     via query-builder (db.insert(goalWigMeta) etc) — isso esta OK.
//
//   BUG-B (HIGH-2 — retorno aninhado nao-normalizado):
//     getWig/getMeasuresForWig fazem innerJoin(career_goals) e devolvem a row CRUA
//     ({career_goals:{...}, goal_wig_meta:{...}}). O consumidor (scoreboard) precisa
//     de um objeto PLANO (.title/.baselineValue acessiveis direto).
//
// CONTRATO QUE ESTE ARQUIVO CONGELA (o que o implementer DEVE fazer):
//   - createWig:   INSERT em career_goals via db.execute(sql`INSERT INTO career_goals ...`)
//                  (colunas snake_case user_id/target_metric/target_deadline/horizon)
//                  + INSERT em goal_wig_meta (drizzle real: tx.insert(goalWigMeta) OU
//                    raw — aceito AMBOS; o ponto e a baseline X na filha).
//                  horizon 4DX->career enum: quarter->trimestre, season->ano.
//                  target_metric 4DX-> enum valido OU 'custom'.
//   - getWig/listActiveWigs/countActiveWigs: LEEM career_goals via db.execute(sql`SELECT ... FROM career_goals ...`)
//                  (JOIN goal_wig_meta), filtram status='active' + ownership user_id.
//                  getWig RETORNA OBJETO PLANO (.title/.baselineValue), nao aninhado.
//   - updateWig/linkMeasure: UPDATE career_goals via db.execute(sql`UPDATE career_goals ...`).
//                  linkMeasure seta a WIG 'active' (HIGH-1) e LOGA antes de qualquer
//                  swallow (lesson #9 — nao engole erro silencioso).
//
// SUPOSICOES documentadas (ADR ambiguo sobre o shape exato do tx/raw):
//   1. career_goals e escrita/lida SEMPRE via db.execute(sql`...`) (RAW). O fakeDb
//      captura cada execute() e reconstroi o texto SQL (literais + valores params
//      interleaved) via sqlText(). Asserto pela presenca de "career_goals" + o
//      verbo (INSERT/SELECT/UPDATE) no texto. Se nao for possivel asserir o texto
//      exato, asserto AO MENOS que db.execute foi chamado e que NAO se usou
//      db.insert/.update(careerGoals) contra o placeholder.
//   2. O fakeDb expoe ESPIOES insert/update que, se chamados com o placeholder de
//      career_goals (objeto cujo .id === "career_goals.id"), marcam violacao ->
//      o teste falha. As tabelas drizzle reais (goalWigMeta/goalLinks/snapshots)
//      podem usar insert/update normalmente.
//   3. db.transaction(cb) -> cb(self) quando disponivel (lesson #32). O runner usa
//      tx.execute para career_goals.
//   4. BaselineImmutableError -> .code === 'baseline_immutable'.
//
// Lessons #3/#34/#14/#36/#9/#32 aplicadas.
// .test.ts roda no projeto "server" (node).
// =============================================================================

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

async function loadAttach() {
  return await import('../../../server/storage/goalsStorage');
}

function makeStorage() {
  return {} as any;
}

// Reconstroi um texto SQL legivel a partir do objeto `sql` do drizzle (queryChunks).
// StringChunk tem { value: string[] } (literais); params/sub-SQL aninhados sao
// recursados, surfando os valores interleaved (uteis para asserir enum mapeado).
function sqlText(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(sqlText).join('');
  if (Array.isArray(node.value)) return node.value.join(''); // StringChunk
  if (node.value !== undefined && !Array.isArray(node.value)) return ` ${sqlText(node.value)} `;
  if (Array.isArray(node.queryChunks)) return node.queryChunks.map(sqlText).join(' '); // SQL
  return '';
}

// fakeDb que distingue RAW (db.execute(sql`...`)) de query-builder. Captura cada
// execute com o texto reconstruido. Os espioes insert/update REGISTRAM o table arg
// — se algum receber o placeholder de career_goals (.id === "career_goals.id"),
// marca violacao (prova do BUG-A). Tabelas drizzle reais passam livres.
function makeRawSqlDb(opts: { execReturns?: any } = {}) {
  const executed: { text: string; raw: any }[] = [];
  const builderTables: any[] = []; // tudo que passou por insert()/update()/select().from()
  const careerGoalsPlaceholderHits: any[] = [];

  function recordTable(tbl: any) {
    builderTables.push(tbl);
    // placeholder de career_goals (R2): objeto com .id === "career_goals.id".
    if (tbl && typeof tbl === 'object' && tbl.id === 'career_goals.id') {
      careerGoalsPlaceholderHits.push(tbl);
    }
  }

  const self: any = {
    __executed: executed,
    __builderTables: builderTables,
    __careerGoalsPlaceholderHits: careerGoalsPlaceholderHits,
    execute: vi.fn(async (q: any) => {
      executed.push({ text: sqlText(q), raw: q });
      // retorno default: pg driver entrega { rows: [...] } OU array. Damos ambos.
      const rows = opts.execReturns ?? [];
      const out: any = Array.isArray(rows) ? rows.slice() : rows;
      (out as any).rows = Array.isArray(rows) ? rows.slice() : (rows?.rows ?? []);
      return out;
    }),
    insert: vi.fn((tbl: any) => {
      recordTable(tbl);
      return {
        values: vi.fn((v: any) => ({
          returning: vi.fn(async () => [{ id: v?.id ?? 'row_1', ...v }]),
          onConflictDoNothing: vi.fn(() => ({ returning: vi.fn(async () => [{ id: v?.id ?? 'lnk_1', ...v }]) })),
          onConflictDoUpdate: vi.fn(() => ({ returning: vi.fn(async () => [{ id: v?.id ?? 'snap_1', ...v }]) })),
        })),
      };
    }),
    select: vi.fn((..._a: any[]) => ({
      from: vi.fn((tbl: any) => {
        recordTable(tbl);
        return {
          where: vi.fn(() => ({ limit: vi.fn(async () => []), orderBy: vi.fn(async () => []) })),
          innerJoin: vi.fn((joinTbl: any) => {
            recordTable(joinTbl);
            return { where: vi.fn(async () => []) };
          }),
          leftJoin: vi.fn((joinTbl: any) => {
            recordTable(joinTbl);
            return { where: vi.fn(async () => []) };
          }),
        };
      }),
    })),
    update: vi.fn((tbl: any) => {
      recordTable(tbl);
      return { set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'row_1' }]) })) })) };
    }),
    transaction: vi.fn(async (cb: any) => cb(self)),
  };
  return self;
}

function executedTextContains(db: any, ...needles: string[]): boolean {
  return db.__executed.some((e: any) => needles.every((n) => e.text.toLowerCase().includes(n.toLowerCase())));
}

// =============================================================================
// BUG-A — createWig deve escrever career_goals via RAW SQL (nao query-builder
// contra o placeholder). RED contra o codigo atual (db.insert(careerGoals)).
// =============================================================================
describe('createWig — career_goals via RAW SQL parametrizado (ADR-229 DEC-A6-impl)', () => {
  it('escreve career_goals via db.execute(sql`INSERT INTO career_goals ...`), NAO db.insert(<placeholder>)', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const db = makeRawSqlDb({ execReturns: [{ id: 'cg_1' }] });

    await storage.createWig(
      'USER-1',
      {
        goalType: 'performance',
        category: 'financial_brm',
        title: 'De $5k para $20k',
        sourceMetric: 'bankroll_usd',
        baselineValue: 5000,
        targetValue: 20000,
        unit: 'usd',
        horizon: 'quarter',
        targetDeadline: '2026-12-01',
      },
      db,
    );

    // CONTRATO: career_goals escrita via RAW execute (INSERT INTO career_goals).
    expect(
      executedTextContains(db, 'insert into career_goals'),
      'createWig deve INSERIR em career_goals via db.execute(sql`...`) — career_goals NAO esta no drizzle (R1)',
    ).toBe(true);

    // ANTI-CONTRATO: NUNCA usar o query-builder contra o placeholder de career_goals.
    expect(
      db.__careerGoalsPlaceholderHits.length,
      'createWig NAO pode usar db.insert/.update(careerGoals) contra o placeholder inline (BUG-A)',
    ).toBe(0);
  });

  it('mapeia horizon "quarter" -> "trimestre" no SQL de career_goals', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const db = makeRawSqlDb({ execReturns: [{ id: 'cg_1' }] });

    await storage.createWig(
      'USER-1',
      {
        goalType: 'performance',
        category: 'financial_brm',
        title: 'De $5k para $20k',
        sourceMetric: 'bankroll_usd',
        baselineValue: 5000,
        targetValue: 20000,
        unit: 'usd',
        horizon: 'quarter',
        targetDeadline: '2026-12-01',
      },
      db,
    );

    // o valor mapeado 'trimestre' aparece (param interleaved) no INSERT de career_goals.
    expect(
      executedTextContains(db, 'career_goals', 'trimestre'),
      'horizon quarter deve mapear para "trimestre" no INSERT raw de career_goals',
    ).toBe(true);
  });

  it('mapeia horizon "season" -> "ano" no SQL de career_goals', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const db = makeRawSqlDb({ execReturns: [{ id: 'cg_1' }] });

    await storage.createWig(
      'USER-1',
      {
        goalType: 'result',
        category: 'financial_brm',
        title: 'WIG temporada',
        sourceMetric: 'bankroll_usd',
        baselineValue: 1000,
        targetValue: 5000,
        unit: 'usd',
        horizon: 'season',
        targetDeadline: '2027-06-01',
      },
      db,
    );

    expect(
      executedTextContains(db, 'career_goals', 'ano'),
      'horizon season deve mapear para "ano" no INSERT raw de career_goals',
    ).toBe(true);
  });

  it('grava baselineValue (X) na filha goal_wig_meta (drizzle real OU raw — captura ambos)', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);

    // fakeDb hibrido: captura execute (raw) E values do query-builder (goal_wig_meta drizzle).
    const insertedValues: any[] = [];
    const executed: { text: string }[] = [];
    const careerGoalsPlaceholderHits: any[] = [];
    const db: any = {
      execute: vi.fn(async (q: any) => {
        executed.push({ text: sqlText(q) });
        return [{ id: 'cg_1' }];
      }),
      insert: vi.fn((tbl: any) => {
        if (tbl && tbl.id === 'career_goals.id') careerGoalsPlaceholderHits.push(tbl);
        return {
          values: vi.fn((v: any) => {
            insertedValues.push(v);
            return { returning: vi.fn(async () => [{ id: v?.id ?? 'row_1', ...v }]) };
          }),
        };
      }),
      transaction: vi.fn(async (cb: any) => cb(db)),
    };

    await storage.createWig(
      'USER-1',
      {
        goalType: 'performance',
        category: 'financial_brm',
        title: 'WIG',
        sourceMetric: 'bankroll_usd',
        baselineValue: 5000,
        targetValue: 20000,
        unit: 'usd',
        horizon: 'quarter',
        targetDeadline: '2026-12-01',
      },
      db,
    );

    // baseline X = 5000 deve estar persistido na filha: ou via values do drizzle,
    // ou interleaved no texto raw de goal_wig_meta.
    const baselineInValues = insertedValues
      .map((v: any) => v?.baselineValue)
      .filter((x: any) => x !== undefined)
      .map(Number)
      .includes(5000);
    const baselineInRaw = executed.some((e) =>
      e.text.toLowerCase().includes('goal_wig_meta') && e.text.includes('5000'),
    );
    expect(baselineInValues || baselineInRaw, 'baselineValue 5000 deve ir para goal_wig_meta').toBe(true);

    // BUG-A: nunca o placeholder de career_goals no query-builder.
    expect(careerGoalsPlaceholderHits.length, 'career_goals nao pode ir pelo query-builder (placeholder)').toBe(0);
  });
});

// =============================================================================
// BUG-A — leitura de career_goals tambem via RAW SQL + BUG-B retorno normalizado.
// =============================================================================
describe('getWig — LE career_goals via RAW SQL (JOIN goal_wig_meta) + retorno PLANO (HIGH-2)', () => {
  it('usa db.execute(sql`SELECT ... FROM career_goals ...`), NAO innerJoin(<placeholder>)', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const db = makeRawSqlDb({
      execReturns: [{ id: 'cg_1', user_id: 'USER-1', title: 'WIG', status: 'active', baseline_value: '5000' }],
    });

    await storage.getWig('USER-1', 'cg_1', db);

    expect(
      executedTextContains(db, 'select', 'career_goals'),
      'getWig deve LER career_goals via db.execute(sql`SELECT ... FROM career_goals`)',
    ).toBe(true);
    expect(
      db.__careerGoalsPlaceholderHits.length,
      'getWig NAO pode usar .from/.innerJoin(careerGoals) contra o placeholder (BUG-A)',
    ).toBe(0);
  });

  it('retorna objeto PLANO (.title/.baselineValue acessiveis direto), nao aninhado {career_goals:{}, goal_wig_meta:{}}', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    // simula a row crua do JOIN (snake_case do pg). O storage DEVE normalizar.
    const db = makeRawSqlDb({
      execReturns: [
        {
          id: 'cg_1',
          user_id: 'USER-1',
          title: 'De $5k para $20k',
          status: 'active',
          baseline_value: '5000',
          target_value_4dx: '20000',
          source_metric: 'bankroll_usd',
          horizon_4dx: 'quarter',
        },
      ],
    });

    const wig = await storage.getWig('USER-1', 'cg_1', db);
    expect(wig, 'getWig deve retornar a WIG').toBeTruthy();
    // PLANO: acesso direto, sem aninhamento career_goals/goal_wig_meta.
    expect(wig.career_goals, 'retorno NAO pode ser aninhado por tabela (HIGH-2)').toBeUndefined();
    expect(wig.goal_wig_meta, 'retorno NAO pode ser aninhado por tabela (HIGH-2)').toBeUndefined();
    expect(wig.title).toBe('De $5k para $20k');
    expect(Number(wig.baselineValue)).toBe(5000);
  });
});

describe('listActiveWigs / countActiveWigs — career_goals via RAW SQL, filtro status active', () => {
  it('listActiveWigs LE career_goals via db.execute, sem placeholder no query-builder', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const db = makeRawSqlDb({ execReturns: [] });
    await storage.listActiveWigs('USER-1', db);
    expect(
      executedTextContains(db, 'select', 'career_goals'),
      'listActiveWigs deve LER career_goals via raw SQL',
    ).toBe(true);
    expect(db.__careerGoalsPlaceholderHits.length).toBe(0);
  });

  it('countActiveWigs conta career_goals (com goal_wig_meta) via raw SQL e retorna numero', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const db = makeRawSqlDb({ execReturns: [{ count: 1 }] });
    const n = await storage.countActiveWigs('USER-1', db);
    expect(
      executedTextContains(db, 'career_goals'),
      'countActiveWigs deve consultar career_goals via raw SQL',
    ).toBe(true);
    expect(typeof n).toBe('number');
    expect(n).toBe(1);
  });
});

// =============================================================================
// updateWig — baseline imutavel (preservado) + UPDATE career_goals via RAW SQL.
// =============================================================================
describe('updateWig — rejeita baselineValue (X imutavel) + UPDATE career_goals via RAW SQL', () => {
  it('patch com baselineValue lanca erro code "baseline_immutable" (preservado)', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const db = makeRawSqlDb();
    await expect(
      storage.updateWig('USER-1', 'cg_1', { baselineValue: 1 } as any, db),
    ).rejects.toMatchObject({ code: 'baseline_immutable' });
  });

  it('patch valido faz UPDATE career_goals via db.execute, sem placeholder no query-builder', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const db = makeRawSqlDb({ execReturns: [{ id: 'cg_1', title: 'novo' }] });
    await storage.updateWig('USER-1', 'cg_1', { title: 'novo' } as any, db);
    expect(
      executedTextContains(db, 'update', 'career_goals'),
      'updateWig deve atualizar career_goals via db.execute(sql`UPDATE career_goals ...`)',
    ).toBe(true);
    expect(db.__careerGoalsPlaceholderHits.length).toBe(0);
  });
});

// =============================================================================
// linkMeasure — idempotente (preservado) + seta WIG active via RAW SQL (HIGH-1)
// + LOGA antes de qualquer swallow (lesson #9).
// =============================================================================
describe('linkMeasure — ON CONFLICT DO NOTHING idempotente + WIG draft->active via RAW SQL', () => {
  it('usa onConflictDoNothing no insert do goal_links (idempotente, nao 409) — preservado', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);

    const onConflictDoNothing = vi.fn(() => ({
      returning: vi.fn(async () => [{ id: 'lnk_1', wigCareerGoalId: 'cg_1', measureId: 'g1' }]),
    }));
    const db: any = {
      execute: vi.fn(async () => [{ id: 'cg_1', user_id: 'USER-1', status: 'active' }]),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing, returning: vi.fn(async () => [{ id: 'lnk_1' }]) })) })),
      transaction: vi.fn(async (cb: any) => cb(db)),
    };
    const r = await storage.linkMeasure('USER-1', 'cg_1', 'g1', db);
    expect(onConflictDoNothing).toHaveBeenCalled();
    expect(r).toBeTruthy();
  });

  it('seta a WIG active via UPDATE career_goals RAW (HIGH-1), sem placeholder no query-builder', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);

    const executed: { text: string }[] = [];
    const careerGoalsPlaceholderHits: any[] = [];
    const db: any = {
      execute: vi.fn(async (q: any) => {
        executed.push({ text: sqlText(q) });
        return [{ id: 'cg_1', user_id: 'USER-1', status: 'active' }];
      }),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'lnk_1' }]) })) })),
      })),
      update: vi.fn((tbl: any) => {
        if (tbl && tbl.id === 'career_goals.id') careerGoalsPlaceholderHits.push(tbl);
        return { set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'cg_1' }]) })) })) };
      }),
      transaction: vi.fn(async (cb: any) => cb(db)),
    };

    await storage.linkMeasure('USER-1', 'cg_1', 'g1', db);
    const wigActivated = executed.some(
      (e) => e.text.toLowerCase().includes('update') && e.text.toLowerCase().includes('career_goals'),
    );
    expect(wigActivated, 'linkMeasure deve setar a WIG active via UPDATE career_goals raw (HIGH-1)').toBe(true);
    expect(careerGoalsPlaceholderHits.length, 'nao pode usar .update(careerGoals) placeholder (BUG-A)').toBe(0);
  });

  it('loga (lesson #9) antes de engolir falha ao setar a WIG active — nao swallow silencioso', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let execCalls = 0;
    const db: any = {
      // 1o execute (insert link ok via builder); o execute do UPDATE career_goals explode.
      execute: vi.fn(async (q: any) => {
        execCalls += 1;
        const text = sqlText(q).toLowerCase();
        if (text.includes('update') && text.includes('career_goals')) {
          throw new Error('boom_update_wig');
        }
        return [{ id: 'cg_1' }];
      }),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'lnk_1' }]) })) })),
      })),
      transaction: vi.fn(async (cb: any) => cb(db)),
    };

    // o link em si NAO deve quebrar so porque o UPDATE da WIG falhou; mas DEVE logar.
    await storage.linkMeasure('USER-1', 'cg_1', 'g1', db).catch(() => undefined);
    const logged = errSpy.mock.calls.length > 0 || warnSpy.mock.calls.length > 0;
    expect(logged, 'falha ao ativar a WIG deve ser LOGADA antes de engolir (lesson #9)').toBe(true);

    errSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

// =============================================================================
// snapshots — drizzle real (goal_progress_snapshots ESTA no drizzle) — preservados.
// =============================================================================
describe('upsertGoalSnapshot — ON CONFLICT (goal_ref_id, week_start_date) DO UPDATE (preservado)', () => {
  it('reprocessar a mesma (goal, semana) usa onConflictDoUpdate (idempotente, nao duplica)', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);

    const onConflictDoUpdate = vi.fn(() => ({
      returning: vi.fn(async () => [{ id: 'snap_1', goalRefId: 'g1', weekStartDate: '2026-06-01' }]),
    }));
    const fakeDb: any = {
      insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate, returning: vi.fn(async () => [{ id: 'snap_1' }]) })) })),
    };
    const r = await storage.upsertGoalSnapshot(
      {
        userId: 'USER-1',
        goalRefId: 'g1',
        goalKind: 'measure',
        weekStartDate: '2026-06-01',
        currentValue: 50,
        expectedValue: 60,
        status: 'behind',
        dataSufficiency: 'ok',
      },
      fakeDb,
    );
    expect(onConflictDoUpdate).toHaveBeenCalled();
    expect(r?.id).toBe('snap_1');
  });

  it('grava week_start_date exatamente como a chave UTC recebida (sem reescrever pra BRT)', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    let captured: any = null;
    const fakeDb: any = {
      insert: vi.fn(() => ({
        values: vi.fn((v: any) => {
          captured = v;
          return { onConflictDoUpdate: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'snap_1', ...v }]) })) };
        }),
      })),
    };
    await storage.upsertGoalSnapshot(
      { userId: 'USER-1', goalRefId: 'g1', goalKind: 'measure', weekStartDate: '2026-06-01', dataSufficiency: 'ok' },
      fakeDb,
    );
    expect(captured?.weekStartDate).toBe('2026-06-01');
  });
});

describe('getLatestSnapshotsForUser — leitura por (user, semana UTC) (preservado)', () => {
  it('retorna array de snapshots da semana', async () => {
    const { attachGoalsStorage } = await loadAttach();
    const storage = makeStorage();
    attachGoalsStorage(storage);
    const rows = [{ id: 'snap_1', goalRefId: 'g1', weekStartDate: '2026-06-01' }];
    const fakeDb: any = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => rows) })) })),
    };
    const r = await storage.getLatestSnapshotsForUser('USER-1', '2026-06-01', fakeDb);
    expect(Array.isArray(r)).toBe(true);
    expect(r).toHaveLength(1);
  });
});
