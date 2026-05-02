# ADR-087: Job runner timezone-aware via node-cron + iteracao server-side por user (Coach-2B prep; Coach-3 evolui para agenda PG-backed)

## Status
Aceito

## Data
2026-05-02

## Contexto

Sprint Coach-2B (`Docs/specs/coach-2b.md`, RF-07/08/09) introduz 3 nudges proativos:
- **B-SNAPSHOT** (RF-07): cron mensal dia 28, 9h timezone do user.
- **B-LEAK** (RF-08): hook async pos-upload CSV (NAO eh cron — `setImmediate` no request handler).
- **B-STUDY** (RF-09): cron diario 19h timezone do user.

Sprint Coach-2B tambem precisa de cron para:
- Cleanup de `coach_actions WHERE status='pending' AND created_at < NOW() - 30min` (ADR-077). 1x/min.

Sprint Coach-3 (futuro) introduz Daily/Weekly/Monthly Reports — mais 3 cadencias com idempotencia exigida. Decisao precoce do runner agora evita refactor.

A pergunta central: **qual job runner adotar para Sprint 2B (3 crons leves + 1 cleanup) que tambem sirva Sprint Coach-3 (relatorios pesados com idempotencia)?**

### Restricoes

- **Volume Sprint 2B (alpha):** ~10 users. 3 crons rodando 1x/dia + 1 cron cleanup 1x/min = ~1500 ticks/dia, todos rapidos (< 1s).
- **Volume Sprint Coach-3 (alpha):** mesmos 10 users + Daily Debrief (post-session) + Weekly (1x/sem) + Monthly (1x/mes). Reports demoram (~30-90s P95 com LLM).
- **Volume beta/prod:** 100-1000 users. Reports timezone-aware podem rodar 24x/dia (1 hora cobrindo todos timezones).
- **Idempotencia:** B-SNAPSHOT cron rodando 24x/dia 28 NAO deve gerar 24 nudges (engine `shouldSendNudge` ja garante via cycleKey). MAS reports de Coach-3 precisam de idempotencia mais forte (mesma report nao gerada 2x).
- **Sem Redis em prod.** Nao adotamos infra extra para Sprint 2B.
- **Multi-instance (futuro):** prod podera escalar para 2+ instancias. Crons dispararem 2x/dia 28 cada = 2 ticks paralelos. Engine resolve via INSERT em coach_nudge_log + first-write wins.
- **Lesson #9 (try/catch generico engole erros):** falha em 1 user durante cron NAO crasha runner — log + continue.
- **Lesson #vi.useFakeTimers + clearMocks:** tests determinсticos.

## Opcoes Consideradas

### Opcao A: `node-cron` (in-process) para Sprint 2B; documentar evolucao para `agenda` PG-backed em Coach-3 (ESCOLHIDA)

**Sprint 2B:**

```ts
// server/coach/cronRunner.ts
import cron from 'node-cron';

const RUNTIME = {
  enabled: process.env.NODE_ENV === 'production' || process.env.COACH_CRON_ENABLED === 'true',
};

export function startCoachCrons() {
  if (!RUNTIME.enabled) {
    console.info('coach.cron.disabled', { reason: 'env_off' });
    return;
  }

  // Cleanup de pending coach_actions > 30min (ADR-077)
  cron.schedule('* * * * *', async () => {
    try {
      const expired = await storage.markPendingExpired();
      if (expired > 0) console.info('coach.cron.cleanup_pending', { expired });
    } catch (err) {
      console.error('coach.cron.cleanup.error', { err });
    }
  });

  // B-SNAPSHOT — dia 28, roda 1x/h e itera users por timezone
  cron.schedule('0 * 28 * *', async () => {
    await iterateUsersWithTimezone({
      filter: 'subscriptionPlan IN (pro, premium)',
      targetLocalHour: 9,
      job: processBSnapshotForUser,
    });
  });

  // B-STUDY — diario, roda 1x/h, dispara as 19h local
  cron.schedule('0 * * * *', async () => {
    await iterateUsersWithTimezone({
      filter: 'subscriptionPlan IN (pro, premium)',
      targetLocalHour: 19,
      job: processBStudyForUser,
    });
  });
}

async function iterateUsersWithTimezone(params: {
  filter: string;
  targetLocalHour: number;
  job: (user: User, now: Date) => Promise<void>;
}) {
  const users = await storage.listUsersForCron(params.filter);
  const now = new Date();
  for (const user of users) {
    try {
      const tz = user.timezone || 'America/Sao_Paulo';
      const localHour = getLocalHour(now, tz);
      if (localHour !== params.targetLocalHour) continue;
      await params.job(user, now);
    } catch (err) {
      // Lesson #9: log per-user error, continue loop
      console.error('coach.cron.user.error', { userId: user.userPlatformId, err });
    }
  }
}
```

**Coach-3 (futuro, documentado):**
- Migrar para `agenda` (PG-backed): jobs persistidos em tabela `report_jobs`. Idempotencia via UNIQUE em `(user_id, report_type, period_key)`. Permite re-run em failure + retry exponencial.
- Backwards-compatible com node-cron — coach_nudge_log + coach_actions ja sao audit triails.

- **Pros:**
  - **Sprint 2B nao paga overhead:** node-cron eh in-process, zero deps externas (ja eh dep transitive de algumas libs ou trivial de adicionar).
  - **Footprint minimo:** 4 cron schedules (1x/min + 2x/h durante dias relevantes + 1x/h sempre).
  - **Itera users + checa local hour** — evita mil schedules por timezone. 1 schedule global, filtra in-loop.
  - **Idempotencia via cycleKey** (engine ADR-085) cobre B-SNAPSHOT mensal — cron rodando 24x/dia 28 nao duplica.
  - **Multi-instance:** `coach_nudge_log` UNIQUE virtual via engine + INSERT vence — first-write wins. Aceita off-by-one.
  - **Lesson #9 honrada:** try/catch per-user, log + continue. Cron nao crasha por 1 user com problema.
  - **Tests via `vi.useFakeTimers`:** `setSystemTime(Date('2026-05-28T12:00:00Z'))` e advance avalia disparo.
  - **Migration path para Coach-3 simples:** mover schedules de cron para agenda preserva storage layer (`storage.listUsersForCron`, `storage.markPendingExpired`). Apenas reescreve registry em runner novo.

- **Contras:**
  - **In-process risk:** crash do server perde tick proximo. Aceitavel — alpha + monitoring tradicional.
  - **Sem retry exponencial nativo:** B-LEAK falha → nada acontece (proximo upload re-checa). Aceitavel para Sprint 2B.
  - **Sem queue distribuido:** alpha = 1 instancia. Beta planeja agenda + Redis.
  - **Sem persistencia de jobs:** restart perde "ultimo tick em x". node-cron schedules sao re-loaded em boot — proximo tick que bater hora dispara.

### Opcao B: `agenda` (MongoDB-backed) com `mongoose`

- **Pros:**
  - Persistencia + queue + retry.

- **Contras:**
  - **Adiciona MongoDB.** Grindfy roda Postgres.
  - **Sprint 2B nao precisa de tudo isso.** Overkill.
  - **Rejeitada por infra-deps.**

### Opcao C: `bullmq` (Redis-backed)

- **Pros:**
  - Industria-padrao para queues.

- **Contras:**
  - **Adiciona Redis.** Sem prevista para alpha.
  - **Overhead operacional alto:** monitoring, persistence.
  - **Rejeitada por infra prematura.**

### Opcao D: PostgreSQL `pg-boss` ou `agenda-pg`

PG como queue backend.

- **Pros:**
  - Reusa infra existente.
  - Persistencia + retry built-in.

- **Contras:**
  - **Sprint 2B nao precisa retry.** Alpha simples.
  - **Adiciona biblioteca + tabela em migration:** nao trivial.
  - **Pre-otimizacao:** ROI questionavel agora; faz sentido em Coach-3 quando reports demoram.
  - **Rejeitada para Sprint 2B; ESCOLHIDA para Coach-3.**

### Opcao E: Cron externo (systemd timer / GitHub Actions)

- **Pros:**
  - Persistencia maxima.

- **Contras:**
  - **Acopla deploy:** cron em systemd quebra em ambiente Replit/Vercel/Coolify.
  - **Iteracao por user em local SQL** ainda eh server-side.
  - **Falha de comunicacao cron → API:** mais surface area.
  - **Rejeitada por desacoplar do app sem ganho.**

## Decisao

**Adotar Opcao A: `node-cron` para Sprint Coach-2B (3 nudges + 1 cleanup). Documentar migration path para `pg-boss` (Postgres-backed) em Coach-3 quando reports + idempotencia forte exigirem.**

### Detalhes-chave do design

1. **Schedules Sprint 2B:**
   - `* * * * *` — cleanup pending coach_actions > 30min.
   - `0 * 28 * *` — B-SNAPSHOT (1x/h durante dia 28, filter local hour=9).
   - `0 * * * *` — B-STUDY (1x/h sempre, filter local hour=19, filter "tem foco ativo").
   - **B-LEAK NAO eh cron** — eh `setImmediate` no request handler de `routes/upload.ts` (RF-08 do Sprint 2B). Documentado.

2. **Helper `iterateUsersWithTimezone`:**
   - Recebe `targetLocalHour` (numero 0-23).
   - Faz `storage.listUsersForCron(filter)` → array de users.
   - Para cada user:
     - Calcula localHour via `users.timezone`.
     - Se != targetLocalHour → skip (silently).
     - Senao → chama `job(user, now)`.
   - Per-user try/catch (lesson #9).

3. **Idempotencia:** delegada ao engine `shouldSendNudge` (ADR-085) via `cycleKey`. Cron rodando 24x/dia 28 → engine bloqueia em `already_sent_this_cycle` apos primeiro disparo.

4. **Multi-instance handling:** alpha = 1 instancia (sem dupes). Beta = node-cron in-process por instancia, mas engine resolve via INSERT first-write wins (off-by-one tolerado).

5. **Disable em test/dev:**
   ```ts
   const RUNTIME = {
     enabled: process.env.NODE_ENV === 'production' || process.env.COACH_CRON_ENABLED === 'true',
   };
   ```
   Tests usam `vi.useFakeTimers` + chamada direta dos jobs (NAO startam node-cron).

6. **Telemetria:**
   - `coach.cron.<name>.tick` { usersProcessed, sent, skipped }
   - `coach.cron.<name>.user.error` { userId, err }
   - `coach.cron.cleanup_pending` { expired }
   - `coach.cron.disabled` { reason }

7. **Lesson #9 (safe-continue):** per-user try/catch envia log + continua loop. Cron NAO crasha.

8. **Lesson #atomicidade:** se job per-user precisa multi-step (ex: B-SNAPSHOT cria chatSession + INSERT coach_nudge_log), envolver em tx. Document com comment "lesson #194".

9. **Tests cobrindo (lesson DI tests):**
   - `vi.setSystemTime(Date('2026-05-28T12:00:00Z'))` → advance 1h via `vi.advanceTimersByTime(60*60*1000)`.
   - Cron tick chama mock `job` para users com `timezone='America/Sao_Paulo'` (12-3 = 9h SP).
   - Cron tick NAO chama job para `timezone='Asia/Tokyo'` (12+9 = 21h).
   - `clearMocks: true` na config.

10. **Migration path Coach-3:**
    - Adicionar `pg-boss` (1 tabela `pgboss.job`).
    - Mover B-SNAPSHOT/B-STUDY para boss.schedule + worker.
    - Reusa storage layer + engine.
    - Cleanup de pending continua node-cron (trivial).
    - Reports (Daily/Weekly/Monthly) gerados como pg-boss jobs com idempotencia via `singletonKey`.

11. **Boot do cronRunner em `server/index.ts`:**
    ```ts
    import { startCoachCrons } from './coach/cronRunner';
    // ... apos app.listen()
    startCoachCrons();
    ```

## Consequencias

### Positivas
- **Zero infra nova para Sprint 2B:** node-cron in-process atende.
- **Migration path definido para Coach-3** (pg-boss documentado).
- **Idempotencia via engine** (ADR-085) cobre nudges. Sem solver duplicado.
- **Lesson #9 + per-user try/catch:** cron robusto.
- **Tests determinсticos** via `vi.setSystemTime`.
- **Filter por local hour** cobre todos timezones em 1 schedule. Simples.

### Negativas
- **Sem retry exponencial:** B-LEAK falha → proximo upload re-checa (aceitavel). Reports Coach-3 vao precisar — migrar entao.
- **Crash do server perde tick:** mitigacao monitoring + boot re-loads schedules. Para nudges low-stake.
- **Multi-instance off-by-one:** beta tolera. Coach-3 com pg-boss elimina.

### Neutras
- **`COACH_CRON_ENABLED`** env var: alpha/dev pode ligar manualmente. Documentar em `.env.example`.
- **Boot ordering:** `startCoachCrons` apos `app.listen()` evita race com DB pool init.

## Confianca

**Media-Alta.** node-cron eh padrao node + simples. Risco: in-process crash perde tick — aceitavel para Sprint 2B. Coach-3 valida pg-boss em volume real antes de apostar prod.

## Code references

- `server/coach/cronRunner.ts` (NOVO) — `startCoachCrons`, `iterateUsersWithTimezone`.
- `server/coach/jobs/processBSnapshot.ts` (NOVO).
- `server/coach/jobs/processBStudy.ts` (NOVO).
- `server/storage.ts` — adiciona `listUsersForCron(filter)`, `markPendingExpired`.
- `server/index.ts` — chama `startCoachCrons()` apos boot.
- `server/routes/upload.ts` — adiciona `setImmediate(processCoachLeakDetection)` (B-LEAK).
- `package.json` — adiciona `node-cron` se nao existe.

## Related ADRs

- [ADR-077](077-coach-actions-migration-and-audit-log.md) — Cleanup de pending > 30min.
- [ADR-084](084-user-coach-preferences.md) — `users.timezone` + `quiet_hours` consumidos.
- [ADR-085](085-coach-nudge-engine.md) — `shouldSendNudge` chamado por cada cron tick.

## Lessons learned aplicadas
- **#9** (try/catch generico engole erros) — per-user try/catch + log estruturado.
- **#vi.useFakeTimers** (Coach-1 lesson) — `vi.setSystemTime` + `clearMocks: true` na config para tests.
- **#194** (atomicidade tx) — jobs multi-step em tx unica.
- **DI tests** — `now: Date` injetavel passado a engine + jobs.
