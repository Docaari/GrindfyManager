# ADR-085: Engine `shouldSendNudge` — fonte unica de verdade para "posso disparar nudge X agora?" (cache 30s + frequency cap + idempotencia + safe-deny on error)

## Status
Aceito

## Data
2026-05-02

## Contexto

O Sprint Coach Sprint 0 (`Docs/specs/coach-sprint-0.md`, RF-03) introduz o engine `shouldSendNudge(userId, ctx)` — funcao server-side que decide se um nudge proativo pode ser disparado. **Sem esse engine:**

- Cada feature implementaria sua propria checagem (quiet hours, opt-out, cap) — divergencia silenciosa.
- B-SNAPSHOT, B-LEAK, B-STUDY (Coach-2B) + B-VOLUME, B-GRADE, B-DOWNSWING (Coach-3) + B-LIFE, B-MENTAL (Coach-4) virariam 8 implementacoes paralelas.
- Audit (Sprint 0 RF-06) ficaria fragmentado.

R1 do research (nag fatigue) eh o risco principal. Engine resolve em uma fonte de verdade.

A pergunta central: **como modelar a logica decisao + idempotencia + cache + audit em uma funcao reutilizavel sem virar deus-funcao com 12 dependencies?**

### Restricoes

- **Hot path:** chamado por cada cron tick (ADR-087) + cada upload CSV (B-LEAK) + cada session.completed event (futuro). Volume estimado 100-200 calls/dia em alpha; 5k+/dia em beta. P95 < 50ms.
- **Lesson #9 (try/catch generico engole erros):** falha de DB nao deve crashar caller. Mas nao deve mascarar bug — log estruturado.
- **Idempotencia (R5 do research):** "one nudge per cycle". Mesma B-SNAPSHOT do mes 2026-05 nao pode disparar 2x mesmo se cron rodar 24x/dia. `cycleKey` resolve.
- **Frequency cap:** count de coach_nudge_log nas ultimas 24h e 1h. Indices ja preparados em ADR-077 vizinho (`coach_nudge_log` em ADR-085).
- **Quiet hours timezone-aware:** ADR-084 ja define `isInQuietHours`. Reusar.
- **Race condition:** 2 cron instancias rodando mesmo segundo poderiam ALLOW o mesmo nudge. UNIQUE em coach_nudge_log + first-write wins resolve.
- **Cache de prefs:** ADR-084 ja documenta cache 30s. Reusar (sem duplicar logica).

## Opcoes Consideradas

### Opcao A: Engine puro server-side com cache 30s + 5 checks sequenciais + safe-deny on error (ESCOLHIDA)

**Tabela `coach_nudge_log`** (criada nesta sprint; INSERT 1x por nudge enviado):

```sql
CREATE TABLE coach_nudge_log (
  id                 VARCHAR(21) PRIMARY KEY,
  user_id            VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,

  category           VARCHAR(32) NOT NULL,    -- 'B-SNAPSHOT' | 'B-LEAK' | ... | 'B-MENTAL'
  cycle_key          VARCHAR(16),             -- 'YYYY-MM' | 'YYYY-WW' | null
  status             VARCHAR(16) NOT NULL,    -- 'sent' | 'engaged' | 'dismissed' | 'snoozed' | 'unsubscribed'

  title_i18n         VARCHAR(200),
  body_preview       TEXT,                    -- pt-BR; max 500 — sem HTML
  channel            VARCHAR(16) DEFAULT 'in_app',  -- in_app | email | push

  chat_session_id    VARCHAR(21),             -- FK soft (chat_sessions.id) que o nudge criou
  triggered_by_event VARCHAR(64),             -- 'cron_28th' | 'csv_upload' | 'session_complete' | etc

  sent_at            TIMESTAMP DEFAULT NOW(),
  engaged_at         TIMESTAMP,
  dismissed_at       TIMESTAMP,
  snooze_until       TIMESTAMP,

  created_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_coach_nudge_log_user_sent
  ON coach_nudge_log(user_id, sent_at);
CREATE INDEX idx_coach_nudge_log_user_category_cycle
  ON coach_nudge_log(user_id, category, cycle_key);
CREATE INDEX idx_coach_nudge_log_category_status_sent
  ON coach_nudge_log(category, status, sent_at);
```

**Engine:**

```ts
type NudgeDecision =
  | { allow: true }
  | { allow: false; reason:
      'category_disabled' | 'quiet_hours' | 'daily_cap_reached'
      | 'hourly_cap_reached' | 'already_sent_this_cycle' | 'engine_error' };

interface NudgeContext {
  category: 'B-SNAPSHOT'|'B-LEAK'|'B-STUDY'|'B-VOLUME'|'B-GRADE'|'B-DOWNSWING'|'B-LIFE'|'B-MENTAL';
  isCritical?: boolean;          // bypassa quiet hours mas NAO bypassa caps nem toggle
  cycleKey?: string;             // 'YYYY-MM' | 'YYYY-WW' | etc.
  now?: Date;                    // injetavel para testes (lesson DI)
}

async function shouldSendNudge(userId: string, ctx: NudgeContext): Promise<NudgeDecision> {
  const now = ctx.now ?? new Date();
  try {
    // 1. Categoria toggle
    const prefs = await getCoachPreferences(userId);  // cache 30s (ADR-084)
    const toggleField = categoryToToggle(ctx.category); // 'B-SNAPSHOT' -> 'nudgeBSnapshot'
    if (!prefs[toggleField]) {
      console.info('coach.nudge.deny', { userId, category: ctx.category, reason: 'category_disabled' });
      return { allow: false, reason: 'category_disabled' };
    }

    // 2. Quiet hours (ADR-084 isInQuietHours)
    if (!ctx.isCritical) {
      const tz = await getUserTimezone(userId); // users.timezone, fallback 'America/Sao_Paulo'
      const localHour = getLocalHour(now, tz);
      if (isInQuietHours(localHour, prefs.quietHoursStart, prefs.quietHoursEnd)) {
        console.info('coach.nudge.deny', { userId, category: ctx.category, reason: 'quiet_hours' });
        return { allow: false, reason: 'quiet_hours' };
      }
    }

    // 3. Frequency cap diario
    const dailyCount = await countNudgeLog(userId, {
      since: subHours(now, 24),
      excludeStatus: ['snoozed'],  // snoozed nao consome cap
    });
    if (dailyCount >= prefs.maxNudgesPerDay) {
      console.info('coach.nudge.deny', { userId, category: ctx.category, reason: 'daily_cap_reached' });
      return { allow: false, reason: 'daily_cap_reached' };
    }

    // 4. Frequency cap horario
    const hourlyCount = await countNudgeLog(userId, {
      since: subHours(now, 1),
      excludeStatus: ['snoozed'],
    });
    if (hourlyCount >= prefs.maxNudgesPerHour) {
      console.info('coach.nudge.deny', { userId, category: ctx.category, reason: 'hourly_cap_reached' });
      return { allow: false, reason: 'hourly_cap_reached' };
    }

    // 5. One-shot per cycle (idempotencia)
    if (ctx.cycleKey) {
      const existing = await findNudgeLog(userId, ctx.category, ctx.cycleKey, {
        statusIn: ['sent', 'engaged', 'dismissed'],
      });
      if (existing) {
        console.info('coach.nudge.deny', {
          userId, category: ctx.category, reason: 'already_sent_this_cycle', cycleKey: ctx.cycleKey
        });
        return { allow: false, reason: 'already_sent_this_cycle' };
      }
    }

    console.info('coach.nudge.allow', { userId, category: ctx.category, cycleKey: ctx.cycleKey });
    return { allow: true };
  } catch (err) {
    // Lesson #9: log estruturado, safe-deny (NAO crash caller)
    console.error('coach.nudge.engine.error', { userId, category: ctx.category, err });
    return { allow: false, reason: 'engine_error' };
  }
}
```

- **Pros:**
  - **Fonte unica de verdade:** todo nudge futuro (Coach-2B/3/4) chama esta funcao. Mudanca de regra (ex: bypass quiet hours em categoria critical) eh 1 linha.
  - **Performance:** 2 queries (`coach_nudge_log` daily + hourly count) + 1 cache hit (prefs); P95 < 50ms.
  - **Safe-deny on error:** falha de DB → log + return `{allow: false, reason: 'engine_error'}`. Caller nao envia nudge mas tambem nao crasha.
  - **Idempotencia clara via `cycleKey`:** call 2x com mesmo `cycleKey` → segunda DENY `already_sent_this_cycle` (apos primeiro INSERT). Race condition: UNIQUE em `coach_nudge_log(user_id, category, cycle_key)` quando `cycle_key NOT NULL` poderia ser adicionado (decidimos NAO — flexibilidade > rigidez; engine ja valida).
  - **DI de `now: Date`:** tests deterministicos sem `vi.useFakeTimers` (mesmo padrao que lesson de testes Coach-1).
  - **Telemetria estruturada:** `console.info('coach.nudge.{allow,deny}', {...})` parseavel por log infra.
  - **`isCritical=true` flag:** reservado para Coach-3+ (ex: stop-loss hit triggers critical nudge bypassando quiet). NAO bypassa cap (anti-runaway).
  - **Snoozed nao consome cap:** user clica "lembrar amanha" — proximo dia, engine permite normal. Resolve UX desnecessaria de "user clicou snooze e perde slot do dia".

- **Contras:**
  - **5 checks sequenciais N queries (~3):** otimizavel para 1 query unificada (UNION). Aceitavel para alpha.
  - **Cache de prefs 30s:** stale possivel quando user muda toggle em outra aba E nudge cron roda nos 30s seguintes. Aceito (TTL pequeno).
  - **Sem distributed lock:** 2 cron instancias podem ambas pass quotas/cycle checks ao mesmo tempo. Mitigacao: caller faz INSERT em `coach_nudge_log` ANTES de enviar nudge; UNIQUE em `(user_id, category, cycle_key)` quando `cycle_key NOT NULL` poderia adicionar. Decisao Sprint 0: NAO adicionar UNIQUE — flexibilidade alpha. Documentar como "off-by-one tolerado em corner case extremo" (lesson aceita).

### Opcao B: Logica espalhada por feature (cada nudge tem sua propria func)

- **Pros:**
  - Sem code review centralizado.

- **Contras:**
  - **Drift garantido:** B-SNAPSHOT vai checkar quiet hours; B-LEAK esquece; B-STUDY usa formato errado de cycleKey.
  - **Audit fragmentado.**
  - **R1 nag fatigue retorna por divergencia.**
  - **Rejeitada por arquitetura.**

### Opcao C: Engine usando worker dedicado (Redis lock + queue)

- **Pros:**
  - Distributed lock real.

- **Contras:**
  - **Sem Redis em prod.** Adicionar so para isso = overkill alpha.
  - **Complexidade alta** sem ganho proporcional.
  - **Rejeitada por overhead.**

### Opcao D: Engine usando UNIQUE constraint forte em `coach_nudge_log`

```sql
CREATE UNIQUE INDEX uniq_coach_nudge_user_category_cycle
  ON coach_nudge_log(user_id, category, cycle_key)
  WHERE cycle_key IS NOT NULL AND status IN ('sent','engaged','dismissed');
```

- **Pros:**
  - Race resolvida pela DB (segundo INSERT erra).

- **Contras:**
  - **Rigidez:** cycleKey nullable nao protege casos sem ciclo (B-LEAK semanal pode legitimamente disparar so 1x/semana mas cycleKey NULL bloqueia tudo).
  - **Erro em runtime apos pre-check passou:** engine validou, depois INSERT falha — caller precisa try/catch + retry.
  - **Dificil para tests:** test cleanup precisa lidar com UNIQUE.
  - **Rejeitada para Sprint 0; revisitar em Coach-3 quando volume justificar.**

## Decisao

**Adotar Opcao A: engine puro server-side com cache 30s + 5 checks sequenciais (toggle → quiet → daily cap → hourly cap → cycle) + safe-deny on error + DI de `now: Date`.**

### Detalhes-chave do design

1. **Tabela `coach_nudge_log`** (criada na migration `0024_coach_2b_actions_leak_focus.sql` junto com `coach_actions`):
   - PK = `id` nanoid.
   - FK CASCADE em user.
   - Indices preparados para counts + cycleKey lookup + admin dashboard.
   - **NAO** tem UNIQUE em `(user_id, category, cycle_key)` — engine valida pre-INSERT (decisao Sprint 0).

2. **Statuses de `coach_nudge_log`:**
   - `sent` — enviado com sucesso.
   - `engaged` — user clicou notificacao / abriu chat.
   - `dismissed` — user marcou como descartado.
   - `snoozed` — "lembrar amanha"; `snooze_until` populado.
   - `unsubscribed` — user fez opt-out apos receber este nudge (rastreio de "quem opta-out reage a qual nudge").

3. **Snoozed nao consome cap:** `excludeStatus: ['snoozed']` em `countNudgeLog`. UI back-end "lembrar amanha" updates row para snoozed; cron no dia seguinte verifica `now > snooze_until` e re-checa.

4. **`isCritical=true` flag:** Sprint 0 implementa o branch (bypassa quiet hours), mas NENHUMA categoria do Sprint 2B usa critical=true. Reservado para Coach-3+ (downswing severo, stop-loss hit). Tests cobrem branch.

5. **Cache de prefs:** importa `getCoachPreferences` de ADR-084 — NAO duplica logica.

6. **Helpers (`server/storage.ts`):**
   - `countNudgeLog(userId, { since: Date, excludeStatus?: string[] }): Promise<number>` — SELECT count(*) com filtros.
   - `findNudgeLog(userId, category, cycleKey, { statusIn: string[] }): Promise<CoachNudgeLog | undefined>` — busca primeiro existente.
   - `createNudgeLog(input): Promise<string>` — INSERT, retorna id. Caller faz INSERT ANTES de enviar nudge real.
   - `updateNudgeLogStatus(id, status, extra)` — UPDATE com timestamp.

7. **Telemetria estruturada (`console.info` + `console.error`):**
   ```
   coach.nudge.allow            { userId, category, cycleKey? }
   coach.nudge.deny             { userId, category, reason: 'category_disabled' | ... }
   coach.nudge.engine.error     { userId, category, err }
   ```

8. **DI de `now: Date`:** lesson tests deterministicos. Caller passa `now` em testes; producao default `new Date()`.

9. **`getLocalHour(date, tz)`:** usa `Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false })`. Fallback `tz='America/Sao_Paulo'` se invalida.

10. **Lesson #9 (safe-deny):** ANY error em qualquer step → log error + return `{allow: false, reason: 'engine_error'}`. Caller (cron) NAO crasha; loop continua proximo user.

11. **Tests integration cobrindo (lesson #3 — shape real):**
    - Toggle off → DENY `category_disabled`.
    - Quiet hours 21-9, now=22h Sao Paulo → DENY `quiet_hours`.
    - Quiet hours 21-9, now=14h Sao Paulo → ALLOW.
    - Quiet hours 21-21 (igual) → desabilitado, sempre ALLOW.
    - `isCritical=true` em quiet → ALLOW.
    - Daily cap: 4o nudge no mesmo dia, max=3 → DENY.
    - Hourly cap: 2o nudge na mesma hora, max=1 → DENY.
    - cycleKey '2026-05' ja sent → DENY.
    - Snoozed previo nao conta no cap.
    - User com `users.timezone='Asia/Tokyo'` → engine respeita Tokyo.
    - DB error → log + DENY `engine_error`.

## Consequencias

### Positivas
- **R1 mitigado:** opt-out granular + quiet hours + caps centralizados. Divergencia silenciosa impossivel.
- **Performance OK:** 2-3 queries + 1 cache hit. P95 < 50ms factivel.
- **Tests deterministicos** via DI `now`.
- **Telemetria parseavel** sem dashboard upfront.
- **Reusavel:** Coach-3 (B-VOLUME, B-GRADE), Coach-4 (B-LIFE, B-MENTAL) reusam sem mudanca.

### Negativas
- **Off-by-one em corner case:** 2 cron instancias podem allow simultaneamente. Aceito.
- **Cache stale 30s:** OK para alpha.
- **Sem retencao:** `coach_nudge_log` cresce sem limite. Sprint 0 NAO trata. Coach-3 documenta archive 90d.

### Neutras
- **Sem UNIQUE constraint forte:** revisitar em Coach-3 com volume real.
- **`isCritical` reservado:** ramo testado; nenhuma categoria usa em Sprint 2B.

## Confianca

**Alta.** Padrao similar a Slack/Linear notification engines. Lessons #9 + #DI honradas. Risco principal — cap counts ficam errados se relogio do servidor desincroniza — mitigado por NTP padrao em prod.

## Code references

- `shared/schema.ts` — adiciona `coachNudgeLog` table + `insertCoachNudgeLogSchema`.
- `migrations/0024_coach_2b_actions_leak_focus.sql` — DDL (junto com coach_actions + coach_leak_focus + user_coach_preferences? Decisao implementer: 1 migration grande para Sprint 0+2B vs 2 migrations).
- `server/coach/nudgeEngine.ts` (NOVO) — `shouldSendNudge`, `categoryToToggle`, `getLocalHour`.
- `server/storage.ts` — adiciona `countNudgeLog`, `findNudgeLog`, `createNudgeLog`, `updateNudgeLogStatus`.

## Related ADRs

- [ADR-077](077-coach-actions-migration-and-audit-log.md) — Tabela coach_actions — coabita migration + Audit page (Sprint 0 RF-06) le ambas.
- [ADR-084](084-user-coach-preferences.md) — User Coach Preferences — **dependencia direta** (cache 30s reusado).
- [ADR-087](087-job-runner-timezone-aware.md) — Job runner — **caller** principal do engine (cron itera users + chama engine).

## Lessons learned aplicadas
- **#3** (mocks idealizados) — tests integration validam shape real de `coach_nudge_log`.
- **#9** (try/catch generico engole erros) — log estruturado + safe-deny em error path.
- **DI** (tests deterministicos) — `now: Date` injetavel.
- **#vi.useFakeTimers** (Coach-1 lesson) — tests de cron usam `vi.setSystemTime` se preferir, com `clearMocks: true` na config.
