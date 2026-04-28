# ADR-053: Cron diario de purge de spot screenshots via `node-cron` em F2 (scheduler externo em F3)

## Status

Proposto

## Data

2026-04-27

## Contexto

A Sprint F2 ("Print de Spots durante Grind") introduz `starred_hands.expiresAt` (default
`pastedAt + 14d`). RF-06 da spec exige um job diario que:

1. **Hard delete** rows com `status='discarded'` (qualquer idade).
2. **Hard delete + unlink arquivo** rows com `expiresAt < NOW() AND reviewedAt IS NULL
   AND reviewLater=false AND status='pending'`.
3. **Preserva** rows com `reviewLater=true` ou `reviewedAt IS NOT NULL` (mesmo apos
   `expiresAt`).
4. Idempotente: re-execucao no mesmo dia eh segura.
5. Telemetria: `{ purgedCount, errorCount, durationMs }` ao fim de cada execucao.

Hoje o projeto **nao tem nenhum job scheduler** rodando no servidor:
- **Ausencia confirmada:** `server/jobs/` nao existe; nao ha `node-cron`/`bullmq`/`agenda`
  em `package.json`.
- **Boot do server:** `server/index.ts` apenas inicia Express + Vite HMR + escuta
  `0.0.0.0:3000`. Sem hooks de cron, sem queues.

A escolha eh **introduzir um scheduler agora** (lib nova) ou postergar com solucoes mais
ad-hoc (cron do OS, scheduler externo).

### Restricoes

- **Single-instance dev:** founder roda 1 servidor local (`npm run dev`). Multi-instance
  nao existe em F2.
- **Deploy nao aconteceu:** regra `memory/deploy_strategy_2026-04-24.md` mantem tudo
  local. Quando deploy entrar (F3), o ambiente alvo (Vercel? Railway? Coolify?)
  influencia muito a melhor estrategia de cron.
- **Disco local (ADR-051):** o cron precisa acessar o filesystem do server **mesmo**
  para `unlink`. Em multi-instance + disco local, dois servers rodariam o mesmo job em
  paralelo (idempotente, mas waste). Documentar como debt.
- **Sem `bullmq`/`redis`:** projeto nao tem Redis. Adicionar para um job diario eh excessivo.
- **`node-cron` eh dep nova:** founder ja confirmou na requisicao. ~50KB. Sem dependencia
  externa de runtime (nao precisa Redis/Postgres como queue).
- **Test-friendly:** o job em si deve ser uma funcao **pura** chamavel via `await
  purgeSpotScreenshots()`; o scheduler eh apenas o trigger. Testes unitarios nao
  agendam cron.
- **Storage abstraction (ADR-051):** cron usa `spotStorage.delete()` para arquivo +
  `storage.deleteStarredHand(id)` para row. Em F3 com S3, mesmo codigo funciona —
  implementacao de `spotStorage.delete()` muda atras da interface.

## Opcoes Consideradas

### Opcao A: `node-cron` lib nova + funcao pura idempotente (ESCOLHIDA)

Adicionar `node-cron` em `package.json`. Criar:

```
server/
├── jobs/
│   ├── index.ts                  # boot register
│   └── purgeSpotScreenshots.ts   # funcao pura + scheduler attach
└── index.ts                      # importa jobs/index.ts no boot
```

```ts
// server/jobs/purgeSpotScreenshots.ts
import cron from 'node-cron';

export async function purgeSpotScreenshots(): Promise<{
  purgedCount: number;
  errorCount: number;
  durationMs: number;
}> {
  const start = Date.now();
  let purgedCount = 0;
  let errorCount = 0;

  // 1. Discarded (any age)
  const discarded = await storage.listSpotsForPurge({ kind: 'discarded' });
  // 2. Expired pending without reviewLater
  const expired = await storage.listSpotsForPurge({ kind: 'expired' });

  for (const row of [...discarded, ...expired]) {
    try {
      if (row.imageUrl) {
        await spotStorage.delete(row.imageUrl).catch(err => {
          // ENOENT (arquivo ja sumiu) eh nao-fatal
          if (err.code !== 'ENOENT') throw err;
          console.warn('spot.purge.unlink_enoent', { id: row.id });
        });
      }
      await storage.deleteStarredHand(row.id);
      purgedCount++;
    } catch (err) {
      errorCount++;
      console.error('spot.purge.error', { id: row.id, err });
    }
  }

  return { purgedCount, errorCount, durationMs: Date.now() - start };
}

export function registerSpotScreenshotsCron() {
  // 04:00 server time (UTC em PaaS, configuravel via env)
  const schedule = process.env.SPOT_PURGE_CRON ?? '0 4 * * *';
  cron.schedule(schedule, async () => {
    const summary = await purgeSpotScreenshots();
    console.info('spot.purge.summary', summary);
  });
}
```

Boot: `server/index.ts` chama `registerSpotScreenshotsCron()` apos DB pronto.

**Idempotencia:** funcao opera sobre rows que **ainda existem** com criterios SQL. Re-rodar
no mesmo minuto: segunda execucao encontra 0 rows (ja deletadas) -> noop.

- **Pros:**
  - **Lib madura** (~5M downloads/sem; mantida; spec POSIX cron).
  - **Zero infra externa.** Sem Redis, sem PostgreSQL queue, sem worker process separado.
    Tudo dentro do server Node.
  - **Testavel facilmente:** `purgeSpotScreenshots()` eh funcao pura — `await
    purgeSpotScreenshots()` no teste, valida side effects. Scheduler em si nao precisa
    teste (lib eh confiavel).
  - **Schedule POSIX cron.** `0 4 * * *` = 04:00 daily. Configuravel via env
    (`SPOT_PURGE_CRON`).
  - **Dev-friendly.** Founder roda `npm run dev` e cron simplesmente funciona; sem servico
    externo.
  - **Codigo isolado.** Modulo `server/jobs/purgeSpotScreenshots.ts` com 1 export;
    refactor para outra estrategia em F3 = trocar `cron.schedule` por outro trigger
    (ex: external scheduler chama HTTP endpoint).
  - **Reuso futuro.** Se Sprint F3 introduzir outro job (ex: limpar coach_messages
    expiradas, recalcular bankroll snapshots stale), `server/jobs/` ja existe.
  - **Compativel com lessons learned #9.** Try/catch granular por row, log antes de
    fallback, distingue ENOENT (warn) de outros erros (error).

- **Contras:**
  - **+1 dep no `package.json`.** Aceito — pequena, focada, sem transitivas pesadas.
  - **Single-instance assumption.** Em multi-instance prod, dois servers agendariam o
    mesmo cron. Idempotente (criterios SQL), mas duplica trabalho. **Debt documentado**
    aqui; F3 usa lock distribuido ou scheduler externo.
  - **Server boot exige cron register.** Se boot der erro, cron silenciosamente nao
    agenda. Mitigacao: `console.info('spot.purge.cron.registered', { schedule })` no
    boot — log ja resolve observabilidade dev.
  - **Sem retry automatico.** Erro em uma row continua o loop (try/catch granular). Se
    DB cair durante execucao, cron de amanha tenta de novo. Aceito.

### Opcao B: cron do OS (`crontab` Linux / Task Scheduler Windows / cron de PaaS)

Em vez de scheduler in-process, depender do OS/PaaS para invocar:

```bash
# crontab
0 4 * * * cd /app && node scripts/purge-spot-screenshots.mjs
```

Ou em Vercel/Railway: cron job da plataforma chama HTTP endpoint
`POST /api/jobs/purge-spots` (com bearer secret).

- **Pros:**
  - **Zero dep nova.** Cron do OS sempre presente em prod Linux.
  - **Multi-instance friendly:** scheduler externo agenda 1 vez para o cluster.
  - **Failsafe:** server pode reiniciar sem perder schedule.

- **Contras:**
  - **Dev local exige config OS.** Founder em Windows precisa Task Scheduler ou WSL cron.
    Atrito alto vs `npm run dev` "funciona ja".
  - **PaaS cron (Vercel Cron Jobs) nao existe ate F3.** Em F2, sem PaaS, sem cron PaaS.
  - **Endpoint HTTP de cron exige auth + secret.** Mais codigo (rota + bearer check).
  - **Logs separados.** OS cron loga em `/var/log/cron`; PaaS cron loga em dashboard
    proprio. Observabilidade fragmentada.
  - **Inflexivel para teste.** Como simular OS cron em CI? `cross-env` + node script
    works mas adiciona moving parts.
  - **Rejeitada por: atrito dev local em F2 + dependencia de PaaS futuro.**

### Opcao C: `setInterval` + leader election simples

```ts
setInterval(async () => {
  if (await tryAcquireLeaderLock('spot-purge', 60_000)) {
    await purgeSpotScreenshots();
  }
}, 60_000); // check every minute, run when due
```

Lock via tabela `job_locks` (criar) ou Postgres advisory lock.

- **Pros:**
  - Multi-instance ready (lock previne dupla execucao).
  - Sem dep nova (puro JS).

- **Contras:**
  - **Schedule eh "poll every 1min e ver se deu hora"** — anti-pattern. Cron expressions
    sao mais expressivas e robustas.
  - **Lock distribuido eh codigo nao-trivial.** TTL, renovacao, fail-over — bug-prone.
  - **Requer tabela `job_locks` nova ou advisory lock.** Mais schema.
  - **Funcao pura ainda existe;** so muda o trigger. Se o problema eh trigger, `node-cron`
    eh mais simples.
  - **Em F2 single-instance, leader election nao agrega valor.**
  - **Rejeitada por: complexidade desproporcional ao escopo F2.**

### Opcao D: BullMQ + Redis

```ts
const queue = new Queue('spot-purge');
queue.add('purge', {}, { repeat: { pattern: '0 4 * * *' } });
```

- **Pros:**
  - Industria-padrao para job queues.
  - Multi-instance, retry, dead letter, observability.

- **Contras:**
  - **Redis ainda nao esta no projeto.** Adicionar para 1 job diario eh massivo overkill.
  - **Custo Redis em prod (Upstash/RedisCloud) > beneficio.**
  - **Lib pesada** (~2MB).
  - **Setup local Redis** atrita dev.
  - **Rejeitada por: ROI negativo em F2.**

### Opcao E: Postgres-based queue (`pg-boss`)

```ts
boss.schedule('spot-purge', '0 4 * * *', {});
```

- **Pros:**
  - Reusa Postgres existente (Neon).
  - Multi-instance ready.
  - Persistente.

- **Contras:**
  - **Lib adiciona ~10 tabelas** ao schema (jobs, schedules, archive, etc.). Schema
    polution para 1 job diario.
  - **Em multi-instance, vale; em single-instance, nao agrega.**
  - **Drizzle nao gerencia tabelas dela** — `drizzle-kit push` interage estranho.
  - **Maturity OK, mas aprendizado novo** sem retorno em F2.
  - **Rejeitada por: pollution de schema vs ganho zero em F2.**

## Decisao

**Adotar Opcao A: `node-cron` lib nova + funcao pura `purgeSpotScreenshots()` em
`server/jobs/purgeSpotScreenshots.ts`. Schedule default `0 4 * * *` (server time UTC),
configuravel via env `SPOT_PURGE_CRON`. Single-instance assumption documentada como
debt para F3.**

### Detalhes-chave do design

1. **Estrutura:**
   ```
   server/
   ├── jobs/
   │   ├── index.ts                    # registerAllJobs() chamado em boot
   │   └── purgeSpotScreenshots.ts     # funcao + register
   └── index.ts                        # apos await db.connect() chama registerAllJobs()
   ```
2. **Funcao pura:**
   - `purgeSpotScreenshots(): Promise<PurgeSummary>` — sem side effect alem dos definidos
     (delete rows + arquivos + log).
   - Idempotente por SQL: `WHERE expiresAt < NOW() AND reviewedAt IS NULL AND
     reviewLater=false AND status='pending'` OU `WHERE status='discarded'`.
3. **Scheduling:**
   - `cron.schedule(process.env.SPOT_PURGE_CRON ?? '0 4 * * *', handler)`.
   - `timezone` opcional via env. Default: server timezone (UTC em PaaS, local em dev).
4. **Storage abstraction:**
   - `spotStorage.delete(imageUrl)` — interface ADR-051. Encapsula `fs.unlink` em F2,
     `s3.deleteObject` em F3.
   - `storage.deleteStarredHand(id)` — Drizzle delete por id (ja existe pattern).
   - `storage.listSpotsForPurge({ kind: 'discarded' | 'expired' })` — novo helper que
     retorna so o necessario (id, imageUrl).
5. **Erro handling:**
   - Try/catch **por row** (loop nao para inteiro por 1 erro).
   - `ENOENT` em unlink: warn (arquivo ja sumiu eh OK; row deve sumir tambem).
   - Outros erros (`EACCES`, DB error): error log + `errorCount++`.
   - Falha total da execucao (ex: DB indisponivel) eh capturada e logada; cron de amanha
     tenta de novo.
6. **Observabilidade:**
   - `console.info('spot.purge.summary', { purgedCount, errorCount, durationMs })` no fim.
   - **Telemetria evento:** `spot.expired_purged` (mesmo evento da spec — ver Telemetria
     RF-06) com payload `{ count, durationMs, errorCount }`.
   - **Health check (futuro):** se 0 purgas em 7 dias consecutivos, cron pode estar
     quebrado — log warning. Implementar quando relevante.
7. **Test plan:**
   - `tests/unit/spot-screenshots/purgeSpotScreenshots.test.ts`:
     - row discarded de 1d -> purgada.
     - row expirada sem reviewLater -> purgada.
     - row expirada com reviewLater=true -> sobrevive.
     - row reviewedAt setado -> sobrevive.
     - unlink ENOENT -> log warn, row deletada.
     - DB error em delete row -> errorCount += 1, loop continua.
   - **Sem teste para o `cron.schedule` em si** — lib confiavel; testar trigger eh
     redundante.
8. **Configuracao:**
   - `.env.example`: `SPOT_PURGE_CRON=0 4 * * *`.
   - CLAUDE.md secao 4 (env vars): adicionar entrada quando spec for implementada.
9. **Boot order:**
   ```
   await db.connect()
   await spotStorage.healthCheck()  // garante uploads dir existe
   registerAllJobs()
   app.listen(...)
   ```
   Se cron register falhar (lib bug?), boot continua mas log error explicito.

### Multi-instance debt (documentado para F3)

Em prod com 2+ servers atras de load balancer:
- Cada instancia agendaria seu proprio cron.
- A 04:00 UTC, dois servers chamariam `purgeSpotScreenshots()` simultaneamente.
- **Idempotencia SQL** (criterio de WHERE) garante que a primeira instancia que comitar
  a delete wins; segunda encontra 0 rows -> noop.
- **Mas:** ambas pagam DB query cost (lista expirados); ambas tentam unlink mesmos files
  (segunda recebe ENOENT, log warn).

**Debt:** waste, nao bug. Aceitavel em F2 (single-instance). F3 obriga uma das opcoes:
1. **Lock distribuido** (Postgres advisory lock no inicio do job): primeira instancia
   pega lock, segunda skipa. Implementar como wrapper em `lib/jobLock.ts`.
2. **Scheduler externo** (Vercel Cron, Railway cron, GitHub Actions): chama HTTP endpoint
   `POST /api/jobs/purge-spots` com bearer secret. UM trigger para cluster inteiro.
3. **Designated worker:** apenas instancia com flag `WORKER_ENABLED=true` registra cron;
   demais skipam. Configurado via env.

A decisao entre 1/2/3 depende do PaaS escolhido em F3. **Esta ADR nao escolhe ainda.**

### Tradeoffs aceitos

| Tradeoff | Aceito por que |
|---|---|
| **+1 dep `node-cron`** | Lib focada, ~50KB, sem transitivas pesadas. |
| **Single-instance assumption** | F2 = local dev. F3 paga lock/scheduler externo. |
| **Sem retry automatico em row falha** | Cron de amanha tenta de novo; log captura erro. |
| **Sem dead letter queue** | Excesso de infra para volume baixo. Log + manual triage suffices. |
| **Schedule UTC em PaaS, local em dev** | Aceitavel; configuravel via env quando preciso. |
| **Boot register silencioso se falhar** | Mitigado por log explicito de "registered". |

### Quando rever esta decisao

- **F3 / deploy invocado:** decidir entre lock distribuido, scheduler externo, designated
  worker. ADR novo.
- **Novo job entra (>= 3 jobs):** `server/jobs/` cresce — considerar abstracao
  `lib/scheduler.ts` ou ate migrar para BullMQ se Redis vier por outra razao.
- **Cron quebra silenciosamente** (0 purgas / 7 dias): adicionar health check.
- **Volume cresce 100x:** se purga demora > 5min, considerar batching + chunked deletes.

## Consequencias

### Positivas

- **Funcao pura testavel.** Cobertura unit > 90% facil.
- **Boot simples.** Adicionar 1 import em `server/index.ts` e 1 chamada no boot.
- **Reuso future.** `server/jobs/` virou pattern; novo job entra como `<nome>.ts`.
- **Idempotencia SQL.** Re-execucao no mesmo dia nao causa dano.
- **Observabilidade dev.** Logs no console explicam o que aconteceu.
- **Migracao para opcao melhor (F3) eh trivial.** `cron.schedule(...)` sai; HTTP endpoint
  ou lock entra. Funcao pura `purgeSpotScreenshots()` permanece.

### Negativas

- **Multi-instance debt:** documentado, aceito em F2.
- **+1 dep:** aceito (custo tipo cookie).
- **Cron dispara em server boot duplicado em multi-instance:** ver debt acima.
- **Sem UI admin para forcar execucao manual.** Workaround dev: chamar
  `purgeSpotScreenshots()` via REPL ou criar comando `npm run purge:spots` quando
  necessario. Fora do escopo F2.

### Neutras

- **Decisao revisitavel** quando deploy entrar; documentado em "Quando rever".
- **Configuracao de timezone** depende do PaaS — aceitavel deixar default UTC.

## Confianca

**Alta.** `node-cron` eh padrao de industria para in-process scheduling em Node. Funcao
pura + scheduler trigger eh separation of concerns saudavel. Idempotencia SQL eh forte.
Multi-instance debt eh **conhecido**, **aceito**, e **enderecavel** com 1 ADR adicional
em F3 sem rewrite do job.

## Referencias

- **Spec:** `Docs/specs/sprint-f2-spot-screenshots.md` (RF-06 Cron de purge, Acceptance
  Criteria por Wave W1).
- **ADR-051:** `051-spot-screenshots-storage.md` — `spotStorage.delete()` interface
  consumida pelo cron.
- **ADR-052:** `052-spot-screenshots-ownership.md` — cron nao usa rota servir; usa
  storage direto.
- **Lessons learned:** `Docs/architecture/lessons-learned.md#9` — try/catch generico
  engole erros: log antes de fallback, distinguir ENOENT (warn) de DB error.
- **Memoria:** `memory/deploy_strategy_2026-04-24.md` — manter local; F3 obriga revisao.
- **Diagrama:** `Docs/architecture/feature-flows/spot-screenshots-flow.mermaid` — sequencia
  Purge flow detalhada.
- **lib externa:** [`node-cron` (npm)](https://www.npmjs.com/package/node-cron) ~5M
  downloads/sem; mantida; POSIX cron syntax.
