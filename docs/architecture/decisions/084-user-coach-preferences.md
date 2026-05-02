# ADR-084: Tabela `user_coach_preferences` (opt-out granular + quiet hours + frequency cap + tom) com defaults seguros e lazy-create

## Status
Aceito

## Data
2026-05-02

## Contexto

O Sprint Coach Sprint 0 (`Docs/specs/coach-sprint-0.md`, RF-01 + RF-02) introduz preferences do user para Coach proativo. Sem isso, Sprint Coach-2B (3 nudges proativos: B-SNAPSHOT, B-LEAK, B-STUDY) vira "nudge bombing" — quebra confianca em alpha e gera churn (R1 do research, "limit frequency, ensure each nudge adds value, honor preferences").

Estado atual:
- **`users.timezone`** ja existe (default `America/Sao_Paulo`). Reusavel.
- **`user_settings`** existe mas tem 8 colunas heterogeneas (currency, FX freezes, bankroll_management_enabled, stop_*). Adicionar 14+ colunas Coach polui o schema.
- **Sem tabela dedicada para preferences Coach.** Cada feature consultaria sua propria coluna ou criaria seu proprio registro improvisado. Divergencia silenciosa quebraria opt-out.

A pergunta central: **onde armazenar 14+ flags de preferencia Coach sem inflar `user_settings` nem espalhar logica de opt-out?**

### Restricoes

- **Lesson #7 (deprecation gradual):** colunas novas Zod `optional + default`, nunca `required` puro.
- **Lesson #12 (estado persistente):** UI consume via TanStack Query — backend deve servir via GET sem criar row (defaults derivados).
- **Lazy-create:** row criada na primeira escrita (PUT /preferences) ou na primeira vez que `getCoachPreferences` precisa fallback. Migracao em prod NAO faz back-fill (10k+ users existentes ficariam com row vazia).
- **Quiet hours timezone-aware:** computar com timezone do user (`users.timezone`), nao server time. Wrap-around (21-9 cruzando meia-noite) deve funcionar.
- **Toggles de futuras categorias:** Coach-3 (B-VOLUME, B-GRADE, B-DOWNSWING) e Coach-4 (B-LIFE, B-MENTAL) ja precisam de coluna agora — evitar re-migration.
- **Tom configuravel** (gentle/balanced/direct) — Coach-4 ativa, mas coluna ja deixada para evitar ALTER.
- **Free tier persiste preferences** (free pode ter Coach Mental ativo no futuro).
- **Channels (in-app / email / push)** — in-app + email default ON, push default OFF.
- **Cache de preferences:** hot path do `shouldSendNudge` (ADR-085) consulta a cada disparo. Cache em memoria 30s (analogo a `resolveUserTier`) reduz N queries.

## Opcoes Consideradas

### Opcao A: Tabela dedicada `user_coach_preferences` 1-row-per-user com lazy-create + Zod optional + cache 30s (ESCOLHIDA)

```sql
CREATE TABLE user_coach_preferences (
  id                       VARCHAR(21) PRIMARY KEY,
  user_id                  VARCHAR(21) NOT NULL UNIQUE
                             REFERENCES users(user_platform_id) ON DELETE CASCADE,

  -- 8 toggles por categoria (default ON exceto life + mental)
  nudge_b_snapshot         BOOLEAN NOT NULL DEFAULT TRUE,
  nudge_b_leak             BOOLEAN NOT NULL DEFAULT TRUE,
  nudge_b_study            BOOLEAN NOT NULL DEFAULT TRUE,
  nudge_b_volume           BOOLEAN NOT NULL DEFAULT TRUE,   -- Coach-3
  nudge_b_grade            BOOLEAN NOT NULL DEFAULT TRUE,   -- Coach-3
  nudge_b_downswing        BOOLEAN NOT NULL DEFAULT TRUE,   -- Coach-3+
  nudge_b_life             BOOLEAN NOT NULL DEFAULT FALSE,  -- Coach-4 — opt-in
  nudge_b_mental           BOOLEAN NOT NULL DEFAULT FALSE,  -- Coach-4 — opt-in

  -- Quiet hours (timezone do user, vem de users.timezone)
  quiet_hours_start        INTEGER NOT NULL DEFAULT 21,     -- hora local 0..23
  quiet_hours_end          INTEGER NOT NULL DEFAULT 9,      -- hora local 0..23

  -- Frequency cap
  max_nudges_per_day       INTEGER NOT NULL DEFAULT 3,
  max_nudges_per_hour      INTEGER NOT NULL DEFAULT 1,

  -- Channel preferences
  channel_in_app           BOOLEAN NOT NULL DEFAULT TRUE,
  channel_email            BOOLEAN NOT NULL DEFAULT TRUE,
  channel_push             BOOLEAN NOT NULL DEFAULT FALSE,

  -- Tom do Coach (Coach-4 valida; coluna ja preparada)
  coach_tone               VARCHAR(20) NOT NULL DEFAULT 'balanced',  -- gentle|balanced|direct

  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uniq_user_coach_preferences_user
  ON user_coach_preferences(user_id);
```

Drizzle (em `shared/schema.ts`):

```ts
export const userCoachPreferences = pgTable("user_coach_preferences", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().unique()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),

  nudgeBSnapshot: boolean("nudge_b_snapshot").notNull().default(true),
  nudgeBLeak: boolean("nudge_b_leak").notNull().default(true),
  nudgeBStudy: boolean("nudge_b_study").notNull().default(true),
  nudgeBVolume: boolean("nudge_b_volume").notNull().default(true),
  nudgeBGrade: boolean("nudge_b_grade").notNull().default(true),
  nudgeBDownswing: boolean("nudge_b_downswing").notNull().default(true),
  nudgeBLife: boolean("nudge_b_life").notNull().default(false),
  nudgeBMental: boolean("nudge_b_mental").notNull().default(false),

  quietHoursStart: integer("quiet_hours_start").notNull().default(21),
  quietHoursEnd: integer("quiet_hours_end").notNull().default(9),

  maxNudgesPerDay: integer("max_nudges_per_day").notNull().default(3),
  maxNudgesPerHour: integer("max_nudges_per_hour").notNull().default(1),

  channelInApp: boolean("channel_in_app").notNull().default(true),
  channelEmail: boolean("channel_email").notNull().default(true),
  channelPush: boolean("channel_push").notNull().default(false),

  coachTone: varchar("coach_tone", { length: 20 }).notNull().default("balanced"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_user_coach_preferences_user").on(table.userId),
]);

export const updateCoachPreferencesSchema = z.object({
  nudgeBSnapshot: z.boolean().optional(),
  nudgeBLeak: z.boolean().optional(),
  nudgeBStudy: z.boolean().optional(),
  nudgeBVolume: z.boolean().optional(),
  nudgeBGrade: z.boolean().optional(),
  nudgeBDownswing: z.boolean().optional(),
  nudgeBLife: z.boolean().optional(),
  nudgeBMental: z.boolean().optional(),
  quietHoursStart: z.number().int().min(0).max(23).optional(),
  quietHoursEnd: z.number().int().min(0).max(23).optional(),
  maxNudgesPerDay: z.number().int().min(0).max(10).optional(),
  maxNudgesPerHour: z.number().int().min(0).max(10).optional(),
  channelInApp: z.boolean().optional(),
  channelEmail: z.boolean().optional(),
  channelPush: z.boolean().optional(),
  coachTone: z.enum(['gentle','balanced','direct']).optional(),
}).strict().superRefine((val, ctx) => {
  if (val.maxNudgesPerHour !== undefined && val.maxNudgesPerDay !== undefined
      && val.maxNudgesPerHour > val.maxNudgesPerDay) {
    ctx.addIssue({
      code: 'custom',
      path: ['maxNudgesPerHour'],
      message: 'maxNudgesPerHour cannot exceed maxNudgesPerDay',
    });
  }
});
```

**Storage layer (`server/storage.ts`):**

```ts
const COACH_PREFS_DEFAULTS = {
  nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true,
  nudgeBVolume: true, nudgeBGrade: true, nudgeBDownswing: true,
  nudgeBLife: false, nudgeBMental: false,
  quietHoursStart: 21, quietHoursEnd: 9,
  maxNudgesPerDay: 3, maxNudgesPerHour: 1,
  channelInApp: true, channelEmail: true, channelPush: false,
  coachTone: 'balanced' as const,
} satisfies CoachPreferences;

const prefsCache = new Map<string, { value: CoachPreferences; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

async function getCoachPreferences(userId: string): Promise<CoachPreferences> {
  const cached = prefsCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const row = await db.select().from(userCoachPreferences)
      .where(eq(userCoachPreferences.userId, userId)).limit(1);
    const value = row[0]
      ? normalizeCoachPreferences(row[0])
      : { ...COACH_PREFS_DEFAULTS };
    prefsCache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (err) {
    console.error('coach.prefs.read.error', { userId, err });
    return { ...COACH_PREFS_DEFAULTS };  // safe fallback (lesson #9)
  }
}

async function upsertCoachPreferences(userId: string, delta: Partial<CoachPreferences>) {
  const current = await getCoachPreferences(userId);
  const merged = { ...current, ...delta, updatedAt: new Date() };
  await db.insert(userCoachPreferences).values({ id: nanoid(), userId, ...merged })
    .onConflictDoUpdate({ target: userCoachPreferences.userId, set: merged });
  prefsCache.delete(userId); // invalidate
  return merged;
}
```

**`normalizeCoachPreferences`** (lesson #7 — back-fill defaults):
```ts
function normalizeCoachPreferences(row: UserCoachPreferences): CoachPreferences {
  return {
    nudgeBSnapshot: row.nudgeBSnapshot ?? COACH_PREFS_DEFAULTS.nudgeBSnapshot,
    // ... idem para todas as colunas, com ?? defaults
  };
}
```

- **Pros:**
  - **Tabela dedicada = ownership claro:** sem polluir `user_settings`. Cada futuro sprint Coach (3, 4, 5) sabe onde adicionar novo flag.
  - **Defaults seguros:** B-LIFE + B-MENTAL OFF (ambos opt-in conforme R8 + R9 do research). Outros 6 ON para alpha (consenso founder).
  - **Lazy-create evita migration de back-fill:** users existentes nao tem row; primeira chamada `getCoachPreferences` retorna defaults. Apos primeira PUT, row criada.
  - **Cache 30s analogo a `resolveUserTier`:** hot path de `shouldSendNudge` (ADR-085) reduz a 2-3 reads/min por user.
  - **Lesson #7 honrada:** Zod schema PUT eh `optional + default` em tudo. Back-fill via `normalizeCoachPreferences` se row vier com colunas null (impossivel hoje, mas seguro).
  - **Lesson #9 honrada:** `getCoachPreferences` em DB error retorna defaults safe + log error (distingue "no row" de "DB explodiu").
  - **Quiet hours como 2 INTEGERs:** wrap-around sem timezone string parsing. Frontend renderiza com label timezone do user.
  - **Tom ja com coluna:** Coach-4 ativa LLM-side, sem ALTER.
  - **Channels separados:** prepara Coach-3 (email HTML) + Coach-3+ (push). In-app default ON, email default ON, push default OFF.
  - **CASCADE em user:** delete user remove prefs.

- **Contras:**
  - **18 colunas:** wide. Aceito (todas relevantes; nenhuma JSONB free-form).
  - **Cache stale 30s** apos mudanca em outra aba: aceito (TTL pequeno + invalidate em PUT na mesma instancia).

### Opcao B: Adicionar 14+ colunas em `user_settings`

- **Pros:**
  - Sem nova tabela.
  - 1 query menos no path de "le tudo do user".

- **Contras:**
  - **`user_settings` ja tem 8 colunas heterogeneas** (currency, FX freezes, bankroll, stops). Adicionar 14 Coach polui o schema.
  - **Ownership confuso:** time de bankroll mexe em `user_settings`; agora time Coach tambem? Conflitos de migration.
  - **Cache atual de `user_settings`** difere do que Coach precisa (Coach quer 30s; bankroll mantem por sessao).
  - **`quiet_hours_*` em user_settings** parece "configuracao geral" — confunde mental model.
  - **Rejeitada por inflar tabela compartilhada.**

### Opcao C: JSONB free-form `users.coach_prefs jsonb`

```ts
coachPrefs: jsonb('coach_prefs').default({}),
```

- **Pros:**
  - Zero migration por flag novo.
  - Schema flexible.

- **Contras:**
  - **Sem indices possiveis.** Toggles em queries (`WHERE coach_prefs->>'nudgeBLeak' = 'true'`) nao indexam bem.
  - **Sem Zod no DB:** validacao 100% app-side. Risco de drift.
  - **Migration ruim quando adicionar nova coluna em formal**: `coach_prefs.snooze_until` em metade das rows, faltando em outra metade — back-fill manual.
  - **Lesson #7 nao se aplica direto:** JSONB nao tem default Zod, fica missing em user antigo.
  - **Rejeitada por perder rigidez de schema.**

### Opcao D: Multiplas tabelas (`coach_nudge_prefs`, `coach_quiet_hours`, `coach_channels`)

- **Pros:**
  - Maximo separacao de concerns.

- **Contras:**
  - **3 JOINs no hot path** de `shouldSendNudge`. Performance ruim.
  - **3 migrations futuras** se adicionar campo. Aceito apenas se cada sub-grupo crescer muito (nao eh o caso).
  - **Rejeitada por overhead sem ganho.**

## Decisao

**Adotar Opcao A: tabela dedicada `user_coach_preferences` 1-row-per-user com lazy-create + cache 30s + Zod optional/default.**

### Detalhes-chave do design

1. **Defaults (TODOS validados pelo founder):**
   - B-SNAPSHOT, B-LEAK, B-STUDY, B-VOLUME, B-GRADE, B-DOWNSWING = **ON** (coach proativo aceito por padrao em alpha).
   - B-LIFE, B-MENTAL = **OFF** (opt-in obrigatorio — R8 + R9 do research).
   - quiet_hours_start = 21, quiet_hours_end = 9 (janela 21h-9h timezone do user).
   - max_nudges_per_day = 3, max_nudges_per_hour = 1.
   - channel_in_app = TRUE, channel_email = TRUE, channel_push = FALSE.
   - coach_tone = 'balanced'.

2. **Endpoints (RF-02 do Sprint 0) em `server/routes/coach.ts`:**
   - `GET /api/coach/preferences` — JWT, retorna prefs do `req.user.userPlatformId`. Sem row → defaults sem CREATE.
   - `PUT /api/coach/preferences` — JWT, body validado por `updateCoachPreferencesSchema`, UPSERT com merge.
   - Resposta normalizada (RF-02 do Sprint 0):
     ```json
     {
       "nudges": { "bSnapshot": true, "bLeak": true, ... },
       "quietHours": { "startHour": 21, "endHour": 9, "timezone": "America/Sao_Paulo" },
       "frequencyCap": { "perDay": 3, "perHour": 1 },
       "channels": { "inApp": true, "email": true, "push": false },
       "coachTone": "balanced",
       "updatedAt": "2026-05-02T..."
     }
     ```

3. **Rate limit:** 30 req/min/IP em `/api/coach/*` (ja existe via `express-rate-limit`).

4. **Cache em memoria:**
   ```ts
   const prefsCache = new Map<string, { value: CoachPreferences; expiresAt: number }>();
   const CACHE_TTL_MS = 30_000;
   ```
   - Invalidate em `upsertCoachPreferences`.
   - Tolera 30s stale entre instancias (alpha = 1 instancia; multi-instance fica para Coach-3+ via Redis).

5. **Quiet hours wrap-around:**
   ```ts
   function isInQuietHours(localHour: number, start: number, end: number): boolean {
     if (start === end) return false;            // disabled
     if (start < end) return localHour >= start && localHour < end;
     return localHour >= start || localHour < end; // wrap meia-noite
   }
   ```
   Exemplos:
   - start=21, end=9 → quiet 21,22,23,0,1,...,8.
   - start=9, end=21 → quiet 9,10,...,20.
   - start=0, end=23 → quiet 23 horas (so 23h livre).
   - start=21, end=21 → desabilitado (sem janela quiet).

6. **Timezone:** vem de `users.timezone` (default `America/Sao_Paulo`). Engine `shouldSendNudge` (ADR-085) usa essa coluna. Fallback se invalida ou null → `America/Sao_Paulo`.

7. **Lesson #9:** falha em `getCoachPreferences` (DB error) → log error + retornar defaults safe. Nao bloquear nudge engine, mas nao mascarar bug — log estruturado `coach.prefs.read.error`.

8. **Lesson #7:** `normalizeCoachPreferences` aplica `?? DEFAULT` em cada campo lido do DB. Hoje colunas sao NOT NULL, mas se sprint futuro adicionar coluna, defaults estao prontos.

9. **CASCADE:** delete user → delete preferences (sem orfas).

10. **Tests integration cobrindo:**
    - GET sem row → defaults retornados.
    - PUT cria row + segundo GET reflete.
    - PUT parcial faz merge (campo nao enviado preserva).
    - PUT com `quietHoursStart=24` → 400 + path `quietHoursStart`.
    - PUT com `maxNudgesPerHour=10, maxNudgesPerDay=3` → 400 (refine).
    - PUT com `randomKey` → 400 (`.strict()`).
    - User A nao consegue PUT preferencias do user B.
    - `users.timezone='Asia/Tokyo'` + GET → retorna timezone correto na resposta.

## Consequencias

### Positivas
- **R1 mitigado:** opt-out granular real, validado server-side.
- **Lazy-create evita migration custosa** em prod com 10k users.
- **Cache 30s amortiza hot path** do shouldSendNudge.
- **Tom ja com coluna** evita ALTER em Coach-4.
- **Channels separados** preparam Coach-3 (email) e Coach-3+ (push) sem mais migrations.
- **Lesson #7 + #9 honradas:** robusto a deprecations e DB errors.

### Negativas
- **18 colunas:** wide. Aceito.
- **Cache stale 30s entre instancias:** alpha usa 1 instancia; nao bloqueia.
- **Future flag adiciona migration:** com 14 categorias previstas, raras. Trade-off aceitavel vs JSONB.

### Neutras
- **Sem audit historico de mudancas em prefs:** Sprint 0 RF-06 pode opcionalmente registrar `coach_actions` row com `tool_name='preference_change'`. Documentar como "low priority".
- **`coach_tone` coluna existe mas LLM nao consome ate Coach-4:** aceitavel (overhead minimo).

## Confianca

**Alta.** Padrao common em SaaS (Slack notification preferences, GitHub watching modes). Defaults baseados em conformidade R8/R9 + consenso founder. Risco principal — defaults errados (ex: B-LEAK ON gera reaction "demais") — mitigado por feedback rapido em alpha + flags sao trivialmente toggable.

## Code references

- `shared/schema.ts` — adiciona `userCoachPreferences` + `updateCoachPreferencesSchema`.
- `migrations/0024_coach_2b_actions_leak_focus.sql` — DDL (mesmo arquivo de coach_actions + coach_leak_focus).
- `server/storage.ts` — adiciona `getCoachPreferences`, `upsertCoachPreferences`, `normalizeCoachPreferences`, `prefsCache`.
- `server/routes/coach.ts` — adiciona GET + PUT `/api/coach/preferences`.
- `client/src/pages/settings/CoachPreferences.tsx` (NOVO) — UI 8 toggles + quiet hours sliders + frequency cap inputs + channels.

## Related ADRs

- [ADR-019](019-coach-prompt-cache-strategy.md) — Coach prompt cache — `coach_tone` no future entra no bloco DINAMICO (varia por user).
- [ADR-077](077-coach-actions-migration-and-audit-log.md) — Tabela coach_actions — Audit page Sprint 0 RF-06 pode opcionalmente logar mudancas em prefs como audit row.
- [ADR-085](085-coach-nudge-engine.md) — Engine shouldSendNudge — **consumidor** desta tabela. Cache 30s shared logic.
- [ADR-087](087-job-runner-timezone-aware.md) — Job runner — usa `users.timezone` + `quiet_hours_*` para iterar users.

## Lessons learned aplicadas
- **#7** (deprecation gradual) — `normalizeCoachPreferences` + Zod optional.
- **#9** (try/catch generico engole erros) — log error explicito antes de fallback para defaults.
- **#12** (estado persistente) — UI consume via TanStack Query com `queryKey: ['coach-preferences']`.
- **#19** (cache stale entre abas) — cache 30s + invalidate em PUT na mesma instancia.
