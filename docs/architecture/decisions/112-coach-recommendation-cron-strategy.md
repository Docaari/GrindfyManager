# ADR-112: Cron strategy para Coach Lesson Recommendations

## Status
Aceito

## Data
2026-05-03

## Contexto

A recomendacao semanal precisa ser gerada **uma vez por semana por user**,
sempre na segunda-feira de manha (apos o weekend de jogo, antes do user abrir
a Home no novo ciclo). Founder confirmou:

- **Horario:** segunda 06:00 BRT (`America/Sao_Paulo`).
- **Localizacao:** registrar em `server/coach/cronRunner.ts` (mesmo padrao dos
  jobs `processBSnapshot` e `processBStudy`).
- **Reuso:** `coachLeakDetection.detectLeaks` + analytics inline, SEM criar
  tabela `coach_weekly_reports`.

Decisoes de design:

1. **In-process node-cron vs scheduler externo (pg-boss, BullMQ, EventBridge)**
   — coerencia com o padrao Coach Sprint 2B (ADR-087).
2. **Activation guard** — replicar `NODE_ENV === 'production' || COACH_CRON_ENABLED === 'true'`
   garante que dev local nao dispara cron acidentalmente.
3. **Idempotencia** — UNIQUE `(userId, weekStartDate)` no banco (ADR-111)
   garante anti-duplicata. Cron tambem deve **early-skip** se a row ja existir,
   para nao desperdicar tokens Anthropic.
4. **Iteracao por user** — sequencial vs paralela. Coach-2B usa sequencial; o
   custo Anthropic + sleep entre calls justifica.
5. **Tratamento de erro** — try/catch por user. Falha de 1 user nao derruba
   batch.
6. **Reentrancia em caso de restart** — node-cron in-process perde execucoes se
   o servidor estava down no exato 06:00. Ha mitigacao explicita.
7. **Override manual** — endpoint admin `POST /api/admin/coach/recommendations/regenerate`
   (RF-08) permite regerar para 1 user com `weekStart` arbitrario.

## Opcoes Consideradas

### Opcao 1: node-cron in-process (mesma do Coach-2B)
- **Pros:**
  - Zero dependencia nova. Coerente com `processBSnapshot` e `processBStudy`.
  - Activation guard ja padronizado (`COACH_CRON_ENABLED`).
  - Logging via `console.info("coach.cron.weekly_rec.*")` consistente.
  - Sequencial natural (loop async/await), facil de testar com mock relogio.
- **Contras:**
  - Se app reiniciar exatamente as 06:00 BRT da segunda, o tick eh perdido.
    Mitigacao: endpoint admin manual permite regerar pos-fato.
  - Nao escala se virarmos multi-instancia (multiplas replicas executariam o
    cron N vezes). Mitigacao atual: deploy ainda mono-instancia (ver
    `memory/deploy_strategy_2026-04-24.md`). Quando virar multi-instancia,
    migrar para pg-boss (ADR-087 ja preve esse caminho).

### Opcao 2: pg-boss (job queue persistido em Postgres)
- **Pros:**
  - Persistente: reentrante apos restart.
  - Multi-instancia safe.
- **Contras:**
  - +1 dependencia.
  - Complexidade desproporcional para 1 cron semanal no MVP.
  - Foge do padrao atual; Coach-2B teria que migrar junto.

### Opcao 3: Cron externo (Vercel Cron, GitHub Actions, EventBridge)
- **Pros:** desacoplado do app.
- **Contras:**
  - Deploy ainda local (ver `memory/deploy_strategy`). Nao temos onde
    hospedar cron externo no MVP.
  - Latencia de webhook + autenticacao adiciona complexidade.

### Opcao 4: Trigger lazy on-demand (gera quando user abrir Home na segunda)
- **Pros:** zero infraestrutura.
- **Contras:**
  - Primeiro user da semana paga latencia Anthropic (3-10s) na request da Home.
    Inviavel para UX da Home cockpit.
  - Race condition entre 2 users batendo simultaneamente.
  - Difere do que founder pediu explicitamente.

## Decisao

**Opcao 1 — node-cron in-process registrado em `server/coach/cronRunner.ts`**
com expressao `0 6 * * 1` e timezone `America/Sao_Paulo`.

### Implementacao

`cronRunner.ts` ganha um 4o `cron.schedule`:

```ts
import { generateCoachRecommendationsTick } from "./jobs/generateCoachRecommendations";

cron.schedule(
  "0 6 * * 1",
  async () => {
    try {
      await generateCoachRecommendationsTick({});
    } catch (err) {
      console.error("coach.cron.weekly_rec.tick.error", { err });
    }
  },
  { timezone: "America/Sao_Paulo" },
);
```

Job em `server/coach/jobs/generateCoachRecommendations.ts`:

```ts
export async function generateCoachRecommendationsTick(
  opts: { now?: Date } = {},
): Promise<{ generated: number; skipped: number; errors: number }> {
  const weekStart = getCurrentWeekStartBRT(opts.now);
  const users = await storage.listUsersForCron({
    plans: ["free", "pro", "premium"],
    activeOnly: true,
  });

  let generated = 0, skipped = 0, errors = 0;

  for (const user of users) {
    try {
      const result = await generateForUser(user.userPlatformId, weekStart);
      if (result === "created") generated++;
      else if (result === "skipped") skipped++;
    } catch (err) {
      errors++;
      console.error("coach.cron.weekly_rec.user.error", {
        userId: user.userPlatformId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.info("coach.cron.weekly_rec.done", {
    weekStart: weekStart.toISOString(),
    generated,
    skipped,
    errors,
  });

  return { generated, skipped, errors };
}
```

`generateForUser`:

1. `existing = storage.getCoachRecommendationByUserAndWeek(userId, weekStart)`.
2. Se existir → retorna `"skipped"` (idempotencia).
3. Coletar input (leaks + analytics + activeProfile + accessibleIds +
   lastConsumed + catalog).
4. `result = await recommendLessonForUser(input)` (ADR-113).
5. Se `result === null` → retorna `"skipped_empty"` (sem rec da semana).
6. Insert com `source = result.source`, `reason = result.reason`,
   `lessonId = result.lessonId`, `inputSummary = { leaks, analytics, profile, sampleSize }`.
7. Retorna `"created"`.

### Activation guard

Reusa `isCronEnabled()` ja existente em `cronRunner.ts`. Em dev local sem
`COACH_CRON_ENABLED`, cron NAO registra. **Endpoint admin `POST
/api/admin/coach/recommendations/regenerate` continua funcional independente do
guard** — chama `generateForUser` direto.

### Idempotencia em camadas

| Camada | Mecanismo |
|---|---|
| Banco | UNIQUE `(userId, weekStartDate)` (ADR-111). |
| Cron | Early-skip se row existe antes de chamar Anthropic. |
| Endpoint admin | Antes de regerar, DELETE da row existente (override total). |

### Tempo limite por user

- Anthropic timeout: 30s (configurado no SDK).
- Sequencial (no paralelo no MVP). Estimativa: 1000 users × 5s medio = ~85min
  pior caso. Aceitavel.
- Sleep curto entre calls NAO necessario — Anthropic rate limit suficiente para
  serial.

### Reentrancia / failure mode

Se app down as 06:00 segunda, cron perdido. Mitigacoes:
1. Logging explicito em startup: `console.info("coach.cron.weekly_rec.next_run")`.
2. Endpoint admin manual permite regerar individualmente.
3. Em Coach-3 (futuro), migrar para pg-boss (ja previsto em ADR-087).

## Consequencias

**Positivas:**
- Coerente com Coach-2B. Zero novas dependencias.
- Sequencial + try/catch por user = resiliente.
- Idempotencia em 3 camadas.
- Activation guard separa dev de prod sem flag manual.

**Negativas:**
- Sem reentrancia automatica. Mitigado por endpoint admin.
- Nao escala multi-instancia. Documentado migration path para pg-boss.

**Neutras:**
- Janela de execucao 06:00 BRT (~03:00 UTC) — fora do horario de pico, baixo
  custo de CPU concorrente.
- Logging segue convencao `coach.cron.weekly_rec.*` (kebab-prefixed metric
  names).

## Confianca
Alta — padrao replicado de cron Coach-2B ja em producao (`processBSnapshot`).
