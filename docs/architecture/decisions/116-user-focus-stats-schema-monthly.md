# ADR-116 — `user_focus_stats` schema: escopo mensal + UNIQUE composta + reset implicito ao virar mes

- Status: Aceito
- Data: 2026-05-03
- Sprint: home-reform-4 (Item 7 — Focus Stats)
- Decision owner: system-architect (formaliza decisao founder Opcao C aprovada + RF-01 da spec)
- Related: ADR-099 (cockpit pattern Home), ADR-102 (overview cache), ADR-117 (`study_sessions.theme_id`), ADR-118 (zona "Estudos" Home)
- Spec: `Docs/specs/home-reform-4-item-7-focus-stats.md` §RF-01, §RF-02, §RF-03, §Riscos

---

## 1. Contexto

### 1.1. Diagnostico

Item 7 do home-reform-4 introduz capacidade do jogador marcar **3 stats HUD como foco do mes** dentro de `/estudos/stats`, com cada marcacao vinculada a um `study_themes.id`. O card `FocusStatsCard` na Home consome essas marcacoes e renderiza:

- Valor atual da stat (snapshot mais recente do mes corrente).
- Delta vs valor mes anterior.
- Tema linkado + tempo de estudo dedicado no mes.
- CTA "Estudar agora" → `/estudos/temas/:id`.

A pergunta estrutural eh: **como modelar a relacao `(user, stat, mes, tema)` no banco**, considerando que:

1. Marcacao tem **escopo mensal** — ao virar o mes, o card volta para empty state (user re-define se quiser, podendo repetir as mesmas).
2. Limite hard de **3 marcacoes por user por mes**.
3. Mesma stat **NAO** pode ser marcada 2x no mesmo mes (UNIQUE).
4. Catalogo HUD eh **estatico em codigo** (`shared/hud-stat-catalog.ts`), nao tem tabela DB → `stat_id` eh string livre sem FK.
5. Tema deletado deve **propagar a remocao** (cascata).

### 1.2. Forcas em jogo

- **Escopo temporal:** marcacao precisa "virar do mes" automaticamente, sem cron de cleanup. UI mostra empty state se mes corrente nao tem rows. Historico de meses anteriores fica naturalmente armazenado (rows com `month` antigo continuam la, fora do MVP exibir).
- **Idempotencia:** UNIQUE no DB enforca corretude mesmo em race condition (POST concorrentes). Limite de 3 enforced em servico (ver §2.4).
- **Auditabilidade:** `created_at` / `updated_at` para debug + futura UI "historico de focos".
- **Cascade:** deletar tema OU user remove marcacoes orfas automaticamente.
- **Validacao input:** mes no formato `YYYY-MM` (UTC); regex Zod garante shape antes do insert.

---

## 2. Decisao

### 2.1. Schema final `user_focus_stats`

```sql
CREATE TABLE user_focus_stats (
    id              VARCHAR(21) PRIMARY KEY,
    user_id         VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    stat_id         VARCHAR(64) NOT NULL,
    study_theme_id  VARCHAR(21) NOT NULL REFERENCES study_themes(id) ON DELETE CASCADE,
    month           VARCHAR(7) NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_user_focus_stats_user_stat_month
    ON user_focus_stats (user_id, stat_id, month);

CREATE INDEX idx_user_focus_stats_user_month
    ON user_focus_stats (user_id, month);

CREATE INDEX idx_user_focus_stats_theme
    ON user_focus_stats (study_theme_id);

-- Trigger updated_at usando funcao set_updated_at() existente desde migration 0036
CREATE TRIGGER trg_user_focus_stats_updated_at
    BEFORE UPDATE ON user_focus_stats
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
```

**Observacoes:**

- `id`: `varchar(21)` para `nanoid` 21 chars (padrao do projeto desde Studies-Reform / Coach-2B).
- `user_id`: FK em `users.user_platform_id` (formato `USER-XXXX`) seguindo convencao do projeto. CASCADE garante limpeza ao deletar user.
- `stat_id`: NAO eh FK. Identificador livre que referencia `StatField.id` em `shared/hud-stat-catalog.ts`. Catalog eh estatico em codigo; FK seria impossivel sem tabela `hud_stats`. Spec contempla degradacao se catalog deprecou stat (item renderiza com warning + botao remover).
- `study_theme_id`: FK CASCADE — deletar tema remove marcacao automaticamente. Match com a regra "ao deletar tema, focus stat fica orfa" (sem orfa: cascade resolve).
- `month`: `varchar(7)` formato `YYYY-MM` UTC. Regex Zod `^\d{4}-(0[1-9]|1[0-2])$`. Mes futuro/passado rejeitado em servico.
- UNIQUE `(user_id, stat_id, month)`: enforcement DB-level. Race condition de 2 POSTs identicos → segundo recebe PG error 23505 → servico retorna `409 STAT_ALREADY_FOCUSED`.
- Indice `(user_id, month)`: query principal do `GET /api/home/focus-stats` filtra por `(user, month)`. Cardinality alta.
- Indice `(study_theme_id)`: para CASCADE delete sem fullscan (PG recomenda indice na FK).
- Trigger `set_updated_at()`: function ja existe desde migration 0036 (Library Access Requests).

### 2.2. Drizzle schema (em `shared/schema.ts`)

```ts
export const userFocusStats = pgTable("user_focus_stats", {
  id: varchar("id", { length: 21 }).primaryKey().notNull(),
  userId: varchar("user_id", { length: 21 })
    .notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  statId: varchar("stat_id", { length: 64 }).notNull(),
  studyThemeId: varchar("study_theme_id", { length: 21 })
    .notNull()
    .references(() => studyThemes.id, { onDelete: "cascade" }),
  month: varchar("month", { length: 7 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userStatMonthUnique: uniqueIndex("uq_user_focus_stats_user_stat_month")
    .on(table.userId, table.statId, table.month),
  userMonthIdx: index("idx_user_focus_stats_user_month")
    .on(table.userId, table.month),
  themeIdx: index("idx_user_focus_stats_theme").on(table.studyThemeId),
}));

export const userFocusStatsRelations = relations(userFocusStats, ({ one }) => ({
  user: one(users, {
    fields: [userFocusStats.userId],
    references: [users.userPlatformId],
  }),
  studyTheme: one(studyThemes, {
    fields: [userFocusStats.studyThemeId],
    references: [studyThemes.id],
  }),
}));

export const insertUserFocusStatSchema = createInsertSchema(userFocusStats, {
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Formato deve ser YYYY-MM"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserFocusStat = typeof userFocusStats.$inferSelect;
export type InsertUserFocusStat = z.infer<typeof insertUserFocusStatSchema>;
```

### 2.3. Reset implicito ao virar mes

**Sem cron, sem job, sem coluna `is_active`**. A semantica de "ativa" eh **derivada** de `month === currentMonth(UTC)`.

- `GET /api/home/focus-stats?month=2026-05` → query `WHERE user_id=? AND month='2026-05'`.
- Quando UTC vira `2026-06`, o mesmo endpoint sem param recalcula `currentMonth=2026-06` → query retorna `[]` → card mostra empty state.
- Rows de `2026-05` continuam fisicamente la — historico preservado. NAO ha UI para visualizar (out of scope MVP), mas dados ficam disponiveis para feature futura "historico de focos".
- User pode re-marcar as mesmas 3 stats (com mesmos temas, ou diferentes) em `2026-06` sem conflito UNIQUE.

**Rationale:**
- Zero infra de cron/cleanup.
- Zero risco de "bug de virada de mes" (sem trigger temporal escondido).
- Determinismo: mesmo `(user, month)` query sempre retorna mesmo resultado.
- Auditavel: rows passadas sao evidencia historica do que o user focou.

### 2.4. Limite de 3 enforced em servico, nao em DB constraint

**Decisao:** validacao "max 3 rows por (user_id, month)" fica em `server/storage.ts` / `server/routes/focusStats.ts`, NAO em CHECK constraint nem trigger DB.

**Pseudo-codigo:**

```ts
// POST /api/focus-stats
const count = await storage.countUserFocusStats(userId, currentMonth);
if (count >= 3) {
  return res.status(409).json({ error: "LIMIT_REACHED" });
}
// ... insert
```

**Rationale:**

- **CHECK constraint nao consegue**: PG CHECK eh row-level; nao consegue contar irmaos. Trigger `BEFORE INSERT` poderia, mas adiciona complexidade DB sem ganho.
- **Race condition mitigation**: 2 POSTs concorrentes da 4a marcacao → ambos passam o `count = 3`, ambos tentam insert, ambos sucedem (pq UNIQUE eh por stat, nao por count). Resultado: 4 rows. **Mitigacao em servico**: usar `SELECT ... FOR UPDATE` ou lock advisor; alternativa simples eh **transacao com COUNT + INSERT atomicos** seguida de re-check pos-insert (se count > 3, rollback).

```ts
// Solucao escolhida: transacao com re-check
await db.transaction(async (tx) => {
  const count = await tx.select({ c: sql`count(*)` }).from(userFocusStats)
    .where(and(eq(userFocusStats.userId, userId), eq(userFocusStats.month, month)));
  if (Number(count[0].c) >= 3) {
    throw new Error("LIMIT_REACHED");
  }
  await tx.insert(userFocusStats).values({ id: nanoid(), userId, statId, studyThemeId, month });
});
```

PG locking de transacao + nivel READ COMMITTED garante que entre o COUNT e o INSERT nenhum outro tx insere row visivel para esta sessao. Race ainda existe mas reduzida; teste de integration cobre o caso (`Promise.all` 4 inserts concorrentes → 1-3 sucedem, demais 409).

- **Por que nao CHECK?** Mesmo se trigger BEFORE INSERT contasse, race entre `SELECT count + INSERT` ainda existiria sem lock. Tradeoff: complexidade DB vs validacao em servico (menos invasivo, mais testavel).

### 2.5. Validacoes de input (servico)

| Validacao | Regra | Resposta |
|---|---|---|
| `month` formato | regex `^\d{4}-(0[1-9]|1[0-2])$` | 400 INVALID_BODY |
| `month` futuro | `month > currentMonth(UTC)` | 400 INVALID_MONTH_FUTURE |
| `month` passado | `month < currentMonth(UTC)` | 400 INVALID_MONTH_PAST |
| `statId` no catalog | `HUD_STAT_CATALOG.find(s => s.id === statId)` | 400 INVALID_STAT_ID |
| `studyThemeId` ownership | `SELECT 1 FROM study_themes WHERE id=? AND user_id=?` | 404 THEME_NOT_FOUND (NAO 403, evita vazamento) |
| Limite 3 | `countUserFocusStats(userId, month) >= 3` | 409 LIMIT_REACHED |
| Stat ja marcada | UNIQUE catch (PG 23505) | 409 STAT_ALREADY_FOCUSED |

### 2.6. Migration

Arquivo: `migrations/0043_user_focus_stats.sql` (numero alocado conforme spec; item 4 da reform-4 usa 0042).

```sql
-- 0043_user_focus_stats.sql
-- Sprint: home-reform-4 Item 7 — Focus Stats schema
-- ADR-116, ADR-117

CREATE TABLE IF NOT EXISTS user_focus_stats (
    id              VARCHAR(21) PRIMARY KEY,
    user_id         VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    stat_id         VARCHAR(64) NOT NULL,
    study_theme_id  VARCHAR(21) NOT NULL REFERENCES study_themes(id) ON DELETE CASCADE,
    month           VARCHAR(7) NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_focus_stats_user_stat_month
    ON user_focus_stats (user_id, stat_id, month);

CREATE INDEX IF NOT EXISTS idx_user_focus_stats_user_month
    ON user_focus_stats (user_id, month);

CREATE INDEX IF NOT EXISTS idx_user_focus_stats_theme
    ON user_focus_stats (study_theme_id);

CREATE TRIGGER trg_user_focus_stats_updated_at
    BEFORE UPDATE ON user_focus_stats
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
```

---

## 3. Opcoes Consideradas

### Opcao A — Escopo "global" (sem coluna `month`, marcacao sobrevive entre meses)
- **Pros:** schema mais simples; user nao precisa re-marcar todo mes.
- **Contras:** quebra a semantica "stats foco do mes" (spec mae). Como recalcular delta vs mes anterior se a marcacao nunca virou? Tudo vira retroativo. UI fica menos engajante (zero ritual mensal de re-evaluar foco).
- **Rejeitada.**

### Opcao B — Coluna `is_active` boolean + cron diario que desativa rows fora do mes corrente
- **Pros:** UI consulta WHERE is_active = true + WHERE user_id = ? sem precisar saber `month`.
- **Contras:** cron eh ponto de falha. Se cron falha, UI mostra rows de mes passado. Coluna duplicada (mes pode ser derivado).
- **Rejeitada.**

### Opcao C — Escopo mensal via coluna `month varchar(7)` + reset implicito (ESCOLHIDA)
- Detalhada em §2. **Aprovada pelo founder.**

### Opcao D — Tabela `user_focus_stats_history` + tabela `user_focus_stats_active`
- **Pros:** separacao clara entre "ativo agora" e "historico".
- **Contras:** 2 tabelas para 1 conceito. Risco de divergencia. UNIQUE constraint cruzando 2 tabelas eh complicado.
- **Rejeitada.**

---

## 4. Consequencias

### 4.1. Positivas

- **Reset automatico** sem cron: query muda mes → rows mudam.
- **Historico preservado**: feature futura "ver focos passados" eh trivial (mesma query, sem param `month` filtra todos).
- **UNIQUE DB-level** previne duplicidade mesmo em race.
- **CASCADE** garante limpeza ao deletar user/tema.
- **Schema minimal**: 5 colunas + 3 indices. Footprint pequeno.
- **Auditavel**: `created_at`/`updated_at` para debugging.

### 4.2. Negativas

- **Limite 3 nao DB-enforced**: race condition residual mitigada por transacao + re-check, mas nao 100% impossivel. Test de integration cobre.
- **`stat_id` sem FK**: mudanca no catalog HUD pode deixar rows "orfas" (stat removida). Spec ja contempla degradacao (UI mostra warning + botao remover).
- **User precisa re-marcar todo mes**: friction intencional (re-evaluar foco mensalmente eh feature, nao bug).

### 4.3. Neutras

- **Onda futura "historico de focos"**: schema ja suporta. Apenas UI nova.
- **Mudanca de timezone do user**: `month` sempre UTC. Border case: user em UTC-12 que joga 23:00 local pode ver "novo mes" antes da Home virar (dia 1 local = dia 30 UTC). Aceitavel — documentado em spec (§Riscos).

---

## 5. Confianca

**Alta.** Padrao "escopo mensal via coluna varchar" ja usado em `coach_leak_focus.target_month` (Coach-2B, ADR-077). Reuso de convencoes existentes (nanoid 21, FK em `user_platform_id`, trigger `set_updated_at`). Race condition mitigada via transacao standard.

---

## 6. Notas de Implementacao

- **Helper `currentMonth(date = new Date())`** em `server/lib/dates.ts` (criar se nao existir):
  ```ts
  export function currentMonth(date = new Date()): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  ```
- **Helper `previousMonth(month: string)`**: parse, subtrai 1, reformata. Cobertura de virada de ano (`2026-01` → `2025-12`).
- **Cache invalidation**: ao executar POST/DELETE em `/api/focus-stats`, invalidar entrada em cache `homeFocusStatsCache` para `userId` (ver ADR-117 §2.x se relevante; padrao reusa Map TTL 30s do ADR-102).
- **Reviewer checklist:**
  - [ ] Migration 0043 idempotente (`IF NOT EXISTS` em todos statements).
  - [ ] Trigger `set_updated_at` aplicado.
  - [ ] Drizzle schema exporta `userFocusStats`, `UserFocusStat`, `InsertUserFocusStat`, `insertUserFocusStatSchema`.
  - [ ] Relations registradas.
  - [ ] Storage methods: `getUserFocusStats`, `createUserFocusStat`, `deleteUserFocusStat`, `countUserFocusStats`.
  - [ ] Servico valida `month` futuro/passado, `statId` em catalog, `studyThemeId` ownership.
  - [ ] Transacao + re-check para enforcement de limite 3.
  - [ ] UNIQUE catch retorna 409 STAT_ALREADY_FOCUSED.
  - [ ] CASCADE testado: deletar tema remove rows; deletar user remove rows.

---

## 7. Referencias

- `Docs/specs/home-reform-4-item-7-focus-stats.md` §RF-01, §RF-02, §RF-03
- ADR-117 — `study_sessions.theme_id` (Opcao C)
- ADR-118 — Card zona "Estudos" no Home
- ADR-077 — `coach_leak_focus` (precedente de "escopo mensal via coluna `target_month`")
- ADR-099 — Operations Cockpit pattern
- ADR-102 — `/api/home/overview` cache strategy
- `shared/hud-stat-catalog.ts` — fonte de truth para `stat_id`
- `shared/schema.ts` — local de adicao do `userFocusStats` table
