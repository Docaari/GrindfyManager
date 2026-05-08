# ADR-128 — Algoritmo de streak diario com 2 freezes mensais silenciosos

- Status: Aprovado
- Data: 2026-05-08
- Sprint: estudos-habito-1
- Decision owner: system-architect
- Related: spec `Docs/specs/estudos-habito-1.md` §RF-2, ADR-067 (studies reform — streak inicial), ADR-126 (study_sessions_v2)
- Diagramas: `Docs/architecture/feature-flow-streak.mermaid`

---

## 1. Contexto

A spec RF-2 substitui o streak naive (1 dia missed = reset 0) por um modelo "honesto":

- User configura `daily_study_goal_minutes` (0 desligado, ou enum 15/30/45/60/90/120).
- Streak avanca apenas quando `sum(duration_minutes) WHERE date=today >= goal`.
- 2 freezes silenciosos por mes — gap de 1 dia consome freeze automaticamente sem perder streak.
- Reset: gap 2+ dias com freezes esgotados.
- Reset mensal de freezes via cron 00:05 UTC.

Sprint Studies-Reform (ADR-067) ja entregou:
- `users.study_streak_days` integer NOT NULL DEFAULT 0
- `users.last_study_activity_at` timestamp nullable

Faltam:
- `users.daily_study_goal_minutes` integer DEFAULT 0
- `users.study_streak_freezes_used_this_month` integer NOT NULL DEFAULT 0
- `users.last_freeze_reset_month` varchar(7) nullable

Race condition real: user em 2 tabs cria 2 sessions `manual_post_hoc` simultaneas. Sem lock, ambas leem `last_study_activity_at=ontem`, ambas calculam `streak += 1`, ambas escrevem → streak avanca duas vezes. Spec exige idempotencia diaria ("Streak avanca uma vez").

---

## 2. Decisao

**Algoritmo determinista executado dentro da mesma transaction de `POST /api/study-sessions`, com `SELECT ... FOR UPDATE` no row do user e timezone anchor em UTC.**

### 2.1 Algoritmo

Pseudo-codigo (executado dentro de tx PG):

```typescript
async function bumpStudyStreak(tx: Transaction, userId: string, sessionStartedAt: Date): Promise<StreakResult> {
  // 1. Lock user row
  const user = await tx
    .select({
      goal: users.dailyStudyGoalMinutes,
      streakDays: users.studyStreakDays,
      lastActivityAt: users.lastStudyActivityAt,
      freezesUsed: users.studyStreakFreezesUsedThisMonth,
      lastFreezeResetMonth: users.lastFreezeResetMonth,
      timezone: users.timezone,                      // 'America/Sao_Paulo' default
    })
    .from(users)
    .where(eq(users.userPlatformId, userId))
    .for('update')                                    // SELECT FOR UPDATE
    .then(r => r[0]);

  // 2. Lazy reset freezes if month flipped
  const currentMonth = formatYearMonthUTC(new Date());          // 'YYYY-MM'
  let freezesUsed = user.freezesUsed;
  let needsFreezeReset = user.lastFreezeResetMonth !== currentMonth;
  if (needsFreezeReset) {
    freezesUsed = 0;
  }

  // 3. Compute today's UTC date (anchor consistente)
  const todayUtc = formatDateUTC(new Date());                   // 'YYYY-MM-DD'

  // 4. Today minutes (re-query — deve incluir a session que acabou de inserir,
  //    portanto bumpStudyStreak roda APOS o INSERT do study_sessions_v2 row)
  const todayMinutes = await tx
    .select({ total: sql<number>`COALESCE(SUM(duration_minutes), 0)` })
    .from(studySessionsV2)
    .where(and(
      eq(studySessionsV2.userId, userId),
      // anchor: registered_at OU started_at — registered_at simpler (RF-2.5 edge case decisao)
      sql`DATE(registered_at AT TIME ZONE 'UTC') = ${todayUtc}::date`,
      isNull(studySessionsV2.deletedAt),
      inArray(studySessionsV2.status, ['completed', 'running']),
    ))
    .then(r => r[0].total);

  // 5. Compute today_met
  const goal = user.goal ?? 0;
  const todayMet = goal === 0 || todayMinutes >= goal;

  // 6. State machine
  let newStreak = user.streakDays;
  let newFreezesUsed = freezesUsed;
  let stateTransition: StreakStateTransition = 'unchanged';

  if (todayMet) {
    const lastActiveDate = user.lastActivityAt
      ? formatDateUTC(user.lastActivityAt)
      : null;
    const gapDays = lastActiveDate
      ? daysBetween(lastActiveDate, todayUtc)
      : Infinity;

    if (gapDays === 0) {
      stateTransition = 'idempotent';                  // ja contou hoje, nada muda
    } else if (gapDays === 1) {
      newStreak += 1;
      stateTransition = 'incremented';
    } else if (gapDays === 2 && freezesUsed < 2) {
      newStreak += 1;
      newFreezesUsed = freezesUsed + 1;
      stateTransition = 'freeze_consumed';
    } else if (gapDays >= 2) {
      newStreak = 1;                                   // reset
      stateTransition = 'reset';
    }
  } else {
    stateTransition = 'goal_not_met';                  // streak inalterado
  }

  // 7. Update user row
  await tx.update(users).set({
    studyStreakDays: newStreak,
    lastStudyActivityAt: todayMet ? sessionStartedAt : user.lastActivityAt,  // so atualiza se met
    studyStreakFreezesUsedThisMonth: newFreezesUsed,
    lastFreezeResetMonth: currentMonth,
  }).where(eq(users.userPlatformId, userId));

  return {
    streakDays: newStreak,
    todayMinutes,
    goalMinutes: goal,
    todayMet,
    freezesUsedThisMonth: newFreezesUsed,
    freezesRemaining: 2 - newFreezesUsed,
    transition: stateTransition,
  };
}
```

### 2.2 State machine

```
Estado: { streakDays, lastActivityDate, freezesUsed }

Transition triggers:
  - goal_not_met:       todayMet=false                              → unchanged
  - idempotent:         todayMet=true AND gap=0                     → unchanged
  - incremented:        todayMet=true AND gap=1                     → streak++, lastActivityDate=today
  - freeze_consumed:    todayMet=true AND gap=2 AND freezesUsed<2   → streak++, freezesUsed++, lastActivityDate=today
  - reset:              todayMet=true AND gap>=2 AND freezesUsed=2  → streak=1, lastActivityDate=today
  - reset_long:         todayMet=true AND gap>=3                    → streak=1 (mesmo se freezesUsed<2 — gap 3 dias nao recupera com 1 freeze)

Lazy freeze reset:
  - on every bumpStudyStreak: if lastFreezeResetMonth !== currentMonth → freezesUsed=0 + lastFreezeResetMonth=currentMonth
```

**Decisao crucial RF-2.5:** anchor "today" = **`registered_at` UTC date**, NAO `started_at` UTC date. Justificativa:
- Post-hoc tardio (user registra hoje uma session de 2 dias atras) deve contar como atividade de hoje (RF-2.5).
- Coerencia: para `manual_live` que cruza meia-noite UTC, `registered_at` e `started_at` ambos no dia X (a diferenca eh < 60s tipicamente). Anchor unico = `registered_at` simplifica.
- Spec RF-2 §RF-2.5 explicita: "o streak conta no dia que registered_at ocorre, NAO o dia de started_at".

### 2.3 Cron resetStudyFreezesMonthly

Cron registrado em `server/jobs/index.ts`:

```ts
import cron from 'node-cron';

cron.schedule('5 0 * * *', async () => {       // todo dia 00:05 UTC
  const currentMonth = formatYearMonthUTC(new Date());
  await db.update(users)
    .set({ studyStreakFreezesUsedThisMonth: 0, lastFreezeResetMonth: currentMonth })
    .where(or(
      isNull(users.lastFreezeResetMonth),
      ne(users.lastFreezeResetMonth, currentMonth),
    ));
}, { timezone: 'UTC' });
```

**Idempotencia:** o WHERE `lastFreezeResetMonth != currentMonth` garante no-op em runs repetidos. Falha do cron tambem auto-recover via lazy reset no `bumpStudyStreak` (passo 2 do algoritmo).

### 2.4 GET /api/users/me/study-habit

Endpoint dedicado retorna estado atual sem precisar simular insert. Calcula:

```typescript
async function getStudyHabit(userId: string) {
  const user = await db.select().from(users).where(eq(users.userPlatformId, userId)).then(r => r[0]);
  const todayUtc = formatDateUTC(new Date());
  const currentMonth = formatYearMonthUTC(new Date());

  const todayMinutes = await db.select({ total: sql<number>`COALESCE(SUM(duration_minutes), 0)` })
    .from(studySessionsV2)
    .where(and(
      eq(studySessionsV2.userId, userId),
      sql`DATE(registered_at AT TIME ZONE 'UTC') = ${todayUtc}::date`,
      isNull(studySessionsV2.deletedAt),
      inArray(studySessionsV2.status, ['completed', 'running']),
    ))
    .then(r => r[0].total);

  const freezesUsed = (user.lastFreezeResetMonth !== currentMonth) ? 0 : user.studyStreakFreezesUsedThisMonth;

  return {
    streakDays: user.studyStreakDays,
    todayMinutes,
    goalMinutes: user.dailyStudyGoalMinutes,
    todayMet: user.dailyStudyGoalMinutes === 0 || todayMinutes >= user.dailyStudyGoalMinutes,
    freezesUsedThisMonth: freezesUsed,
    freezesRemaining: Math.max(0, 2 - freezesUsed),
    lastActivityAt: user.lastStudyActivityAt,
  };
}
```

---

## 3. Opcoes Consideradas

### Opcao A: Streak naive (status quo Studies-Reform)

- **Pros:** simples; ja funciona.
- **Cons:** punitivo (1 dia missed = reset); spec quebra; freezes ausentes; sem goal-aware.

### Opcao B: Streak weekly-rolling (4 dias/7 = met)

- **Pros:** menos punitivo; aceita irregularidade.
- **Cons:** UX ruim (concept "dias consecutivos" eh universal — Duolingo, Apple Fitness etc.); founder pediu daily streak explicit.

### Opcao C: Daily streak + freezes app-level + race-safe (escolhida)

- **Pros:** alinha com industry standard (Duolingo); honesto (nao reseta em 1 dia missed); race-safe via FOR UPDATE; auto-recovery se cron falha (lazy reset).
- **Cons:** complexidade do state machine + cron + lazy reset; tres campos novos em users.

### Opcao D: Tabela dedicada `study_streak_log` (1 row por dia)

- **Pros:** audit trail completo; recalc trivial.
- **Cons:** 1 row/user/dia — N rows lineares; query complexa; over-engineered para Sprint 1; nao resolve race condition (precisa lock igual).

---

## 4. Consequencias

**Positivas:**
- Streak honesto, alinhado com expectativa do user.
- Race-safe via PG FOR UPDATE (custom advisory locks desnecessarios).
- Cron + lazy reset garantem freezes nunca ficam stale (R11 mitigado).
- 3 colunas novas em `users` — schema mudanca minima.

**Negativas:**
- FOR UPDATE em users row gera ponto de contencao por user (lock fila). Para founder N=1 ok; para 1000 users concurrent ok; para 10K+ concurrent precisaria splitar (advisory lock por user_id ou particionar). Acceptable Sprint 1.
- Recalc historico (user deleta session 2 dias atras) NAO ajusta streak. Spec aceita (RF-2.5 edge case "audit trail prevails").
- Cron 00:05 UTC roda mesmo se nenhum user precisa (no-op via WHERE clause). Custo ~1ms.

**Neutras:**
- Algoritmo testavel via fixtures de tempo. `bumpStudyStreak(tx, userId, sessionStartedAt)` puro funcional dado lock + clock.
- Logging do `transition` ajuda debug ("por que streak nao avancou?" → ver transition='goal_not_met').

---

## 5. Confianca

**Alta.** Padrao identico ao usado em Duolingo (referencia documentada em research §9.2 Habit-Loop-Anti-Tilt). Race condition resolvida via PG FOR UPDATE (well-known pattern, lesson #14 cita similar para wallet ADR-038). Lazy reset eh defensivo contra falha de cron (lesson #11 R-pattern). Reverso: se algoritmo der bug em prod, query SQL direto consegue patchar sem migration (`UPDATE users SET study_streak_days=X`).

---

## 6. Anexos

- State machine: `Docs/architecture/feature-flow-streak.mermaid`
- Sequence POST com bumpStreak: `Docs/architecture/feature-flow-log-estudo.mermaid`
- Spec: `Docs/specs/estudos-habito-1.md` §RF-2
