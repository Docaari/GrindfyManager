# Modelo de dados — Metas 4DX fatia-1 (snippet drizzle para o implementer)

> Companion do ADR-229. Adicionar em `shared/schema.ts` (padrão de `weeklyPlanningSessions`, `shared/schema.ts:5253`).
> `career_goals` **NÃO** é adicionada ao drizzle (intocada — ADR-229 DEC-A6-impl opção b). As colunas que
> referenciam `career_goals.id` ficam `varchar` **sem `.references()`** no drizzle; a FK + ON DELETE CASCADE é
> declarada **só na migration SQL**.

## Drizzle (`shared/schema.ts`)

```typescript
// =============================================================================
// Ferramenta de Metas 4DX — fatia-1 (ADR-229). Migration 00XX_goals.sql.
// goal_kind discrimina goals (só 'measure' usado na fatia-1; WIG vive em
// career_goals + goal_wig_meta). FK para career_goals = SQL-only (não drizzle).
// =============================================================================

// --- goals: medidas de direção (D2) ---
export const goals = pgTable(
  "goals",
  {
    id: varchar("id").primaryKey().notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    goalKind: varchar("goal_kind", { length: 12 }).notNull().default("measure"), // measure | (wig vive em career_goals)
    goalType: varchar("goal_type", { length: 16 }).notNull(), // CHECK process|performance|result (SQL)
    category: varchar("category", { length: 24 }).notNull(),  // CHECK 7 valores (SQL)
    title: varchar("title", { length: 120 }).notNull(),
    sourceMetric: varchar("source_metric", { length: 48 }),   // allowlist RF-04/05
    targetValue: numeric("target_value"),                      // string em JS → parseFloat na boundary
    unit: varchar("unit", { length: 16 }),                     // usd|pct|minutes|sessions|days|boolean
    cadence: varchar("cadence", { length: 8 }),                // CHECK weekly|daily (SQL)
    direction: varchar("direction", { length: 4 }).notNull().default("up"), // up | down (DEC-A3; só up na fatia-1)
    horizon: varchar("horizon", { length: 8 }).notNull(),      // CHECK week|month|quarter|season (SQL)
    status: varchar("status", { length: 12 }).notNull().default("active"), // medida nasce active
    origin: varchar("origin", { length: 24 }).notNull().default("manual"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),                      // soft-delete
  },
  (t) => [
    index("idx_goals_user_status").on(t.userId, t.status),
    index("idx_goals_user_kind").on(t.userId, t.goalKind),
  ],
);

// --- goal_wig_meta: filha 1:1 da WIG (career_goals). Presença = é WIG-4DX. ---
export const goalWigMeta = pgTable(
  "goal_wig_meta",
  {
    // PK = career_goal_id. FK → career_goals(id) CASCADE declarada SÓ na migration SQL
    // (career_goals não está no drizzle — sem .references()).
    careerGoalId: varchar("career_goal_id").primaryKey().notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    baselineValue: numeric("baseline_value").notNull(), // X imutável (RF-01)
    targetValue4dx: numeric("target_value_4dx"),         // Y (espelha career_goals.target_value)
    sourceMetric: varchar("source_metric", { length: 48 }),
    unit: varchar("unit", { length: 16 }),
    horizon4dx: varchar("horizon_4dx", { length: 8 }),   // CHECK quarter|season (SQL) — WIG é lag longo
    wigRole: varchar("wig_role", { length: 24 }),
    coachToneAtCreate: varchar("coach_tone_at_create", { length: 8 }),
    origin: varchar("origin", { length: 24 }).notNull().default("manual"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("idx_goal_wig_meta_user").on(t.userId)],
);

// --- goal_links: N:N WIG↔medida ---
export const goalLinks = pgTable(
  "goal_links",
  {
    id: varchar("id").primaryKey().notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    wigCareerGoalId: varchar("wig_career_goal_id").notNull(), // FK → career_goals(id) SQL-only
    measureId: varchar("measure_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("goal_links_wig_measure_unique").on(t.wigCareerGoalId, t.measureId),
    index("idx_goal_links_user").on(t.userId),
  ],
);

// --- goal_progress_snapshots: placar histórico (RF-08) ---
export const goalProgressSnapshots = pgTable(
  "goal_progress_snapshots",
  {
    id: varchar("id").primaryKey().notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    goalRefId: varchar("goal_ref_id").notNull(),          // polimórfico: goals.id OU career_goals.id
    goalKind: varchar("goal_kind", { length: 12 }).notNull(), // CHECK measure|wig (SQL)
    weekStartDate: date("week_start_date").notNull(),     // DATE UTC via ymdUtc (CLAUDE.md §10)
    currentValue: numeric("current_value"),
    expectedValue: numeric("expected_value"),
    compliancePct: numeric("compliance_pct"),
    streakDays: integer("streak_days").default(0),
    status: varchar("status", { length: 12 }),
    dataSufficiency: varchar("data_sufficiency", { length: 4 }).notNull().default("ok"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("goal_progress_snapshots_ref_week_unique").on(t.goalRefId, t.weekStartDate),
    index("idx_goal_snapshots_user_week").on(t.userId, t.weekStartDate),
  ],
);

// Relations (só as que o drizzle conhece — career_goals fora)
export const goalsRelations = relations(goals, ({ one }) => ({
  user: one(users, { fields: [goals.userId], references: [users.userPlatformId] }),
}));

export type GoalRow = typeof goals.$inferSelect;
export type InsertGoal = typeof goals.$inferInsert;
export type GoalWigMetaRow = typeof goalWigMeta.$inferSelect;
export type GoalLinkRow = typeof goalLinks.$inferSelect;
export type GoalSnapshotRow = typeof goalProgressSnapshots.$inferSelect;
```

## Zod (createInsertSchema + refinos — `shared/schema.ts` ou `shared/goals.ts`)

> Padrão da casa: `createInsertSchema` permissivo + objeto Zod explícito para a fronteira HTTP (igual
> `insertWeeklyPlanningSessionSchema`, `schema.ts:5288`). Os enums/caps são validados em código/handler
> (CHECK no DB + cap por contagem — ADR-229), o Zod cobre a forma do payload.

```typescript
// shared/goals.ts (catalog drizzle card: insert schema + enums fechados em um lugar)
import { z } from "zod";

export const GOAL_TYPES = ["process", "performance", "result"] as const;
export const GOAL_CATEGORIES = [
  "financial_brm", "volume_grind", "study", "mental_tilt",
  "process_routine", "longevity_burnout", "leak_focus",
] as const;
export const GOAL_UNITS = ["usd", "pct", "minutes", "sessions", "days", "boolean"] as const;
export const GOAL_CADENCES = ["weekly", "daily"] as const;
export const GOAL_HORIZONS = ["week", "month", "quarter", "season"] as const;
export const WIG_HORIZONS = ["quarter", "season"] as const;

// allowlist controlável (RF-04b) — fonte para o guard "não-controláveis recusadas".
export const CONTROLLABLE_SOURCE_METRICS = [
  "sessions_per_week", "grind_days",
  "study_minutes_week", "study_sessions_count",
  "bankroll_usd", "roi_pct", "abi", "itm_pct",
] as const;
// recusadas explicitamente (RF-04) → lead_not_controllable
export const NON_CONTROLLABLE_SOURCE_METRICS = [
  "profit_short_term", "win_a_tournament", "beat_specific_player",
] as const;

export const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// medida de direção (D2) — POST /api/goals (goalKind='measure')
export const createMeasureSchema = z.object({
  goalType: z.enum(GOAL_TYPES),
  category: z.enum(GOAL_CATEGORIES),
  title: z.string().min(1).max(120),
  sourceMetric: z.string().min(1).max(48),
  targetValue: z.number(),                 // number na fronteira; numeric→string só na leitura do DB
  unit: z.enum(GOAL_UNITS),
  cadence: z.enum(GOAL_CADENCES),
  horizon: z.enum(GOAL_HORIZONS),
  direction: z.enum(["up", "down"]).default("up"),
}).strict();

// WIG (D1) — career_goals + goal_wig_meta
export const createWigSchema = z.object({
  goalType: z.enum(["performance", "result"]), // process recusado → wig_must_be_lag (handler)
  category: z.enum(GOAL_CATEGORIES),
  title: z.string().min(1).max(120),
  sourceMetric: z.string().min(1).max(48),
  baselineValue: z.number(),
  targetValue: z.number(),
  unit: z.enum(GOAL_UNITS),
  horizon: z.enum(WIG_HORIZONS),
  targetDeadline: YMD,                     // handler valida >= +90d → wig_deadline_too_short
}).strict();

// PATCH — baselineValue PROIBIDO (DEC-menor-1). .strict() rejeita chave extra,
// mas o handler também checa explicitamente para 400 baseline_immutable nomeado.
export const patchGoalSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  targetValue: z.number().optional(),
  targetDeadline: YMD.optional(),
  status: z.enum(["active", "achieved", "abandoned", "archived"]).optional(),
}).strict();
```

## CHECK constraints (na migration SQL, não no drizzle)

```sql
-- goals
ALTER TABLE goals ADD CONSTRAINT goals_goal_type_enum
  CHECK (goal_type IN ('process','performance','result'));
ALTER TABLE goals ADD CONSTRAINT goals_category_enum
  CHECK (category IN ('financial_brm','volume_grind','study','mental_tilt',
                      'process_routine','longevity_burnout','leak_focus'));
ALTER TABLE goals ADD CONSTRAINT goals_cadence_enum
  CHECK (cadence IS NULL OR cadence IN ('weekly','daily'));
ALTER TABLE goals ADD CONSTRAINT goals_horizon_enum
  CHECK (horizon IN ('week','month','quarter','season'));
ALTER TABLE goals ADD CONSTRAINT goals_direction_enum
  CHECK (direction IN ('up','down'));

-- goal_wig_meta — FK SQL-only para career_goals
ALTER TABLE goal_wig_meta ADD CONSTRAINT goal_wig_meta_career_goal_fk
  FOREIGN KEY (career_goal_id) REFERENCES career_goals(id) ON DELETE CASCADE;
ALTER TABLE goal_wig_meta ADD CONSTRAINT goal_wig_meta_horizon_enum
  CHECK (horizon_4dx IS NULL OR horizon_4dx IN ('quarter','season'));

-- goal_links — FK SQL-only para career_goals (measure_id já tem FK via drizzle)
ALTER TABLE goal_links ADD CONSTRAINT goal_links_wig_career_goal_fk
  FOREIGN KEY (wig_career_goal_id) REFERENCES career_goals(id) ON DELETE CASCADE;

-- goal_progress_snapshots
ALTER TABLE goal_progress_snapshots ADD CONSTRAINT goal_snapshots_kind_enum
  CHECK (goal_kind IN ('measure','wig'));
ALTER TABLE goal_progress_snapshots ADD CONSTRAINT goal_snapshots_sufficiency_enum
  CHECK (data_sufficiency IN ('ok','low'));
```

> Nota: `goal_progress_snapshots.goal_ref_id` é polimórfico (aponta `goals.id` quando `goal_kind='measure'`,
> `career_goals.id` quando `'wig'`) → **sem FK em DB** (não dá para FK polimórfica); integridade por código no
> storage (ownership por `user_id` + checagem de existência antes do upsert).
