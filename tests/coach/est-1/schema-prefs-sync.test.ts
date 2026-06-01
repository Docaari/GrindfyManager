// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint EST-1 / RF-01 — Sincronizar drizzle table userCoachPreferences + zod
// updateCoachPreferencesSchema com as 5 colunas AI-2B (migração 0071) que estão
// no DB físico mas FALTAM no schema TypeScript (bug latente de schema drift).
//
// Fontes:
//   - Docs/specs/estudo-ia-overhaul-2026-06-01/EST-1-coach-weekly-delivery.md (RF-01)
//   - Docs/architecture/decisions/222-coach-weekly-triple-delivery-enablement.md (Decisão 1)
//
// Contrato (do ADR §Decisão 1):
//   Drizzle table ganha (logo após reportMonthlyEnabled):
//     reportQuarterlyEnabled  boolean("report_quarterly_enabled").notNull().default(false)
//     emailWeeklyEnabled      boolean("email_weekly_enabled").notNull().default(false)
//     emailMonthlyEnabled     boolean("email_monthly_enabled").notNull().default(false)
//     emailQuarterlyEnabled   boolean("email_quarterly_enabled").notNull().default(false)
//     disclaimerAcceptedAt    timestamp("disclaimer_accepted_at")   // nullable
//   updateCoachPreferencesSchema (.strict()) ganha os 4 booleanos como .optional().
//     disclaimerAcceptedAt NÃO entra (spoofável via PUT).
//
// Estratégia: o drizzle table NÃO tem campos de runtime fáceis de inspecionar sem
// importar `drizzle-orm` (que em alguns contextos de teste é mockado parcialmente —
// lesson #36). Para RF-01 validamos o CONTRATO por dois caminhos estáveis:
//   1. `updateCoachPreferencesSchema` (zod puro, .strict()) — parse aceita/rejeita.
//   2. `getCoachPreferences` (storage/coachPreferences) — normaliza um row do DB que
//      tem `emailWeeklyEnabled=true` e devolve `true` (não força false). Isto prova
//      que o select mapeia a coluna (o normalize já existe e lê o campo; o que faltava
//      era o table mapear — provamos via integração com `db` mockado).
//
// Status esperado: RED. `updateCoachPreferencesSchema.parse({ emailWeeklyEnabled })`
//   hoje LANÇA (campo não está no .strict()). O teste de getCoachPreferences passa a
//   exigir que o table mapeie a coluna (em runtime real, sem o table sync, o select não
//   traz a coluna). Aqui o `db` é mockado retornando o row, então o teste de
//   normalize/getCoachPreferences valida que o pipeline preserva `true`.
//
// Lessons: #3 (mock shape real do row do DB), #8 (validar presença individual de campo,
//   nunca length de enum), #36 (drizzle-orm mock parcial — não importamos schema cru aqui).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Parte A — updateCoachPreferencesSchema (.strict()) aceita os 4 booleanos novos
//   e rejeita disclaimerAcceptedAt.
// ---------------------------------------------------------------------------
describe("EST-1 RF-01 — updateCoachPreferencesSchema aceita campos de email/quarterly", () => {
  async function getSchema() {
    const mod: any = await import("@shared/schema");
    return mod.updateCoachPreferencesSchema;
  }

  it("aceita emailWeeklyEnabled: false (não rejeitado pelo .strict())", async () => {
    const schema = await getSchema();
    const result = schema.safeParse({ emailWeeklyEnabled: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.emailWeeklyEnabled).toBe(false);
  });

  it("aceita emailMonthlyEnabled: true", async () => {
    const schema = await getSchema();
    const result = schema.safeParse({ emailMonthlyEnabled: true });
    expect(result.success).toBe(true);
  });

  it("aceita emailQuarterlyEnabled como boolean opcional", async () => {
    const schema = await getSchema();
    const result = schema.safeParse({ emailQuarterlyEnabled: true });
    expect(result.success).toBe(true);
  });

  it("aceita reportQuarterlyEnabled como boolean opcional", async () => {
    const schema = await getSchema();
    const result = schema.safeParse({ reportQuarterlyEnabled: false });
    expect(result.success).toBe(true);
  });

  it("aceita os 4 campos juntos num mesmo body", async () => {
    const schema = await getSchema();
    const result = schema.safeParse({
      emailWeeklyEnabled: true,
      emailMonthlyEnabled: false,
      emailQuarterlyEnabled: true,
      reportQuarterlyEnabled: false,
    });
    expect(result.success).toBe(true);
  });

  it("REJEITA disclaimerAcceptedAt (não exposto no .strict() — spoofável)", async () => {
    const schema = await getSchema();
    const result = schema.safeParse({ disclaimerAcceptedAt: "2026-01-01" });
    expect(result.success).toBe(false);
  });

  it("REJEITA chave desconhecida (.strict() preservado)", async () => {
    const schema = await getSchema();
    const result = schema.safeParse({ emailWeeklyEnabled: true, totallyUnknownField: 1 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Parte B — getCoachPreferences mapeia/preserva emailWeeklyEnabled do DB.
//   Mock `../db` com select chainable retornando um row com a coluna preenchida.
//   (Espelha o padrão de mock de db dos testes de storage — lesson #3.)
// ---------------------------------------------------------------------------
let __selectResult: any[] = [];

function makeChainable() {
  const chain: any = {};
  for (const m of ["select", "from", "where", "limit", "orderBy"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: any, reject?: any) =>
    Promise.resolve(__selectResult).then(resolve, reject);
  chain.catch = (reject: any) => chain.then(undefined, reject);
  return chain;
}

const dbChain = makeChainable();

vi.mock("../../../server/db", () => ({
  db: dbChain,
  pool: {},
}));

describe("EST-1 RF-01 — getCoachPreferences preserva email_weekly_enabled do DB", () => {
  beforeEach(async () => {
    __selectResult = [];
    const mod: any = await import("../../../server/storage/coachPreferences");
    mod._resetPrefsCacheForTests?.();
  });

  it("dado row com emailWeeklyEnabled=true, retorna emailWeeklyEnabled === true (hoje vinha undefined→false)", async () => {
    // Row no shape do $inferSelect — drizzle entrega camelCase nas chaves do TS.
    __selectResult = [
      {
        userId: "USER-0001",
        reportWeeklyEnabled: true,
        reportDailyEnabled: true,
        reportMonthlyEnabled: true,
        reportQuarterlyEnabled: false,
        emailWeeklyEnabled: true,
        emailMonthlyEnabled: true,
        emailQuarterlyEnabled: false,
        disclaimerAcceptedAt: null,
        updatedAt: new Date(),
      },
    ];
    const mod: any = await import("../../../server/storage/coachPreferences");
    const prefs = await mod.getCoachPreferences("USER-0001");
    expect(prefs.emailWeeklyEnabled).toBe(true);
    expect(prefs.emailMonthlyEnabled).toBe(true);
  });

  it("não força false quando o DB diz true (normalize preserva valor)", async () => {
    __selectResult = [
      {
        userId: "USER-0002",
        emailWeeklyEnabled: true,
        reportQuarterlyEnabled: true,
        emailQuarterlyEnabled: true,
        disclaimerAcceptedAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date(),
      },
    ];
    const mod: any = await import("../../../server/storage/coachPreferences");
    const prefs = await mod.getCoachPreferences("USER-0002");
    expect(prefs.emailWeeklyEnabled).toBe(true);
    expect(prefs.reportQuarterlyEnabled).toBe(true);
    expect(prefs.emailQuarterlyEnabled).toBe(true);
    expect(prefs.disclaimerAcceptedAt).toBeInstanceOf(Date);
  });
});
