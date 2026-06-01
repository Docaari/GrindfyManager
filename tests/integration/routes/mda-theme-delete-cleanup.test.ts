import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint MDA-1 fix wave HIGH-1
// Cleanup de tags orfas no caminho de delete REAL: DELETE /api/study-themes/:id
//
// Spec: Docs/specs/sprint-mda-1-2026-06-01.md (RF-02 D-4)
// ADR : Docs/architecture/decisions/230-mda-1-reference-cards-nn-tagging.md (D-4)
//
// PROBLEMA (HIGH-1): o teste de storage cobre so o helper deleteStudyTheme, mas a
// ROTA REAL de producao DELETE /api/study-themes/:id (server/routes/studies-v2.ts)
// faz `db.delete(studyThemes).where(eq(studyThemes.id, id))` DIRETO e NUNCA chama
// o helper -> o cleanup de mda_read_themes NAO roda. Tags da junction ficam orfas
// (apontando para um tema inexistente).
//
// Este teste exercita o HANDLER REAL via registerStudiesV2Routes(app) e prova que,
// ao deletar o tema, a junction mda_read_themes do tema e limpa com escopo
// (theme_id = ? AND user_id = ?). DEVE FALHAR agora (red) porque a rota ainda nao
// limpa.
//
// Mock de shape REAL (lesson #3):
//   - db.select().from().where()  -> [theme] (ownership ok).
//   - db.delete(table).where(pred) -> capturamos table + predicado.
//   - getTableName(table) resolve o nome SQL real (mda_read_themes vs study_themes).
// =============================================================================

import { getTableName } from 'drizzle-orm';

vi.mock('../../../server/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userPlatformId: 'USER-0001' };
    next();
  },
}));

// storage nao eh usado no caminho de delete (a rota usa db direto), mas o modulo
// studies-v2 importa storage no topo — stuba para nao explodir.
vi.mock('../../../server/storage', () => ({
  storage: {},
}));

// Captura das chamadas a db.delete(table).where(pred) + db.execute(sql).
const deleteCalls: Array<{ table: any; predicate: any }> = [];
const executeCalls: any[] = [];

vi.mock('../../../server/db', () => {
  const selectChain: any = {
    from: () => selectChain,
    where: () => Promise.resolve([
      // ownership check: o tema pertence ao user.
      { id: 't1', userId: 'USER-0001', name: 'BTN vs BB' },
    ]),
  };
  const db: any = {
    select: () => selectChain,
    delete: (table: any) => ({
      where: (predicate: any) => {
        deleteCalls.push({ table, predicate });
        return Promise.resolve({ rowCount: 1 });
      },
    }),
    execute: (q: any) => {
      executeCalls.push(q);
      return Promise.resolve({ rows: [] });
    },
  };
  return { db };
});

async function buildApp() {
  const app = express();
  app.use(express.json());
  const { registerStudiesV2Routes } = await import('../../../server/routes/studies-v2');
  registerStudiesV2Routes(app);
  return app;
}

// Resolve o nome SQL de uma table Drizzle (tolerante a mock/objeto cru).
function tableName(t: any): string {
  try {
    return getTableName(t);
  } catch {
    return String(t?.name ?? t?._?.name ?? '');
  }
}

// Serializa um predicado de where (SQL drizzle) para inspecionar colunas/valores.
function predicateText(p: any): string {
  try {
    return JSON.stringify(p);
  } catch {
    return String(p);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteCalls.length = 0;
  executeCalls.length = 0;
});

describe('MDA-1 HIGH-1 — DELETE /api/study-themes/:id limpa mda_read_themes', () => {
  it('responde 200 ao deletar um tema do user (sanity do caminho real)', async () => {
    const app = await buildApp();
    const res = await request(app).delete('/api/study-themes/t1');
    expect(res.status).toBe(200);
  });

  it('apaga as tags da junction mda_read_themes do tema deletado (cleanup orfao)', async () => {
    const app = await buildApp();
    await request(app).delete('/api/study-themes/t1');

    // Evidencia via db.delete(mdaReadThemes) OU via db.execute(sql DELETE ...).
    const deletedJunctionTable = deleteCalls.some(
      (c) => tableName(c.table) === 'mda_read_themes',
    );
    const executedJunctionSql = executeCalls.some((q) =>
      /mda_read_themes/i.test(predicateText(q)),
    );
    expect(deletedJunctionTable || executedJunctionSql).toBe(true);
  });

  it('o cleanup da junction eh escopado por theme_id + user_id (nao apaga de outros users)', async () => {
    const app = await buildApp();
    await request(app).delete('/api/study-themes/t1');

    // O predicado do delete da junction (ou o sql do execute) deve mencionar
    // theme_id e user_id — escopo de ownership (D-4: WHERE theme_id=? AND user_id=?).
    const junctionDelete = deleteCalls.find((c) => tableName(c.table) === 'mda_read_themes');
    const junctionExecute = executeCalls.find((q) => /mda_read_themes/i.test(predicateText(q)));

    const scopeText = junctionDelete
      ? predicateText(junctionDelete.predicate)
      : predicateText(junctionExecute);

    expect(scopeText.toLowerCase()).toContain('theme_id');
    expect(scopeText.toLowerCase()).toContain('user_id');
  });

  it('continua deletando o proprio tema (study_themes) — regressao', async () => {
    const app = await buildApp();
    await request(app).delete('/api/study-themes/t1');
    const deletedTheme = deleteCalls.some((c) => tableName(c.table) === 'study_themes');
    const executedThemeSql = executeCalls.some((q) => /study_themes/i.test(predicateText(q)));
    expect(deletedTheme || executedThemeSql).toBe(true);
  });
});
