# ADR-123: Cron diario 17:00 UTC + idempotencia ON CONFLICT DO NOTHING

## Status

Aceito

## Data

2026-05-05

## Contexto

Sprint FX-1 (`Docs/specs/sprint-fx-1.md`) introduz job diario que busca cotacoes BRL/EUR e popula `system_fx_rates` (ADR-121) usando providers BCB PTAX + frankfurter (ADR-122). A pergunta arquitetural eh: **quando rodar o cron e como garantir idempotencia?**.

Forcas em jogo:

- **Janela de publicacao das fontes**: PTAX boletim "Fechamento" sai aproximadamente 13:00 America/Sao_Paulo (16:00 UTC sem DST — Brasil aboliu DST em 2019). ECB publica fixing diario aproximadamente 16:00 CET (depende DST europeu, ~14:00-15:00 UTC). Cron precisa rodar **apos** ambas publicacoes para evitar pegar dado stale do dia anterior.
- **Frequencia adequada**: poker MTT bankroll eh decisao diaria, nao intraday. 1x/dia eh suficiente. Multiplos ticks/dia desperdicariam quota de API (apesar de gratuito) e poluiria audit trail (mais rows do que necessario).
- **Idempotencia**: se cron rodar 2x no mesmo dia (force refresh manual + scheduled, ou retry pos-falha parcial), nao pode duplicar rows ou inflar `fetched_at` artificialmente.
- **Weekend / feriado**: PTAX/ECB nao publicam sabado/domingo (ou feriados nacionais). Cron roda mas adapters retornam vazios. Pipeline precisa lidar gracefully (sem inserir row vazia, sem alarmar como falha).
- **Falha parcial**: 1 provider down nao pode derrubar server inteiro. Cron eh in-process via `node-cron`; exception nao tratada poderia teoricamente bubble up.
- **Concorrencia**: 2 invocacoes simultaneas (force admin + scheduled overlap) nao podem causar duplicate writes ou estado inconsistente.

Pre-requisitos satisfeitos:

- ADR-121 cria `system_fx_rates` com PK composta `(date, currency)` — restricao DB-level garante 1 row max por currency por dia.
- ADR-122 define adapters que retornam `null`/`[]` em falha (nunca throw).
- `node-cron` ja em uso no projeto (Sprint News-1 + News-3, ADR-107). Sem dependencia nova.
- `nanoid` ja em uso (gera `runId` para telemetria).

## Decisao

Adotar **schedule cron `0 0 17 * * *` UTC** (17:00 UTC = 14:00 America/Sao_Paulo, sem DST), com **idempotencia DB-level via PK composta + `ON CONFLICT (date, currency) DO NOTHING`** no upsert. Cron registrado in-process via `node-cron` em `server/jobs/refreshFxRates.ts`, registrado em `server/jobs/index.ts` junto com demais jobs.

Pipeline `runFxRatesRefresh()`:

1. Generate `runId = nanoid(10)` para telemetria.
2. `today = new Date().toISOString().slice(0, 10)` (YYYY-MM-DD UTC).
3. Fetch BRL via `bcbPtaxAdapter.fetchLatestBrl()`. Falha → cross-fallback `frankfurterAdapter.fetchLatest(['BRL'])` (ADR-122).
4. Fetch EUR via `frankfurterAdapter.fetchLatest(['EUR'])`. Sem cross-fallback (BCB nao cobre EUR).
5. Coletar rows validas em `FxRow[]`.
6. `fxRatesPersistence.upsertDailyRates(today, rows)` — `INSERT ... ON CONFLICT (date, currency) DO NOTHING`. Retorna `{ inserted, skipped }`.
7. `fxRatesPersistence.invalidateLatestCache()` — invalida cache memoria 5min de `getLatestSystemRates`.
8. `fxResolver.invalidateCache()` global — invalida cache user-level (ADR-061) para garantir freshness na proxima request user.
9. Log estruturado `[fx/cron]` com `{ runId, status, currencies_fetched, currencies_failed, duration_ms, inserted, skipped }`.
10. Status reportado: `'ok'` (ambas currencies persistidas), `'partial'` (1 missing), `'failed'` (zero persistidas).

Top-level `try/catch` no cron handler garante que **exception nao tratada NAO derruba server**:

```ts
cron.schedule('0 0 17 * * *', async () => {
  try {
    await runFxRatesRefresh();
  } catch (err) {
    console.error('[fx/cron] unhandled error', err);
    // server continua up
  }
}, { timezone: 'UTC' });
```

`runFxRatesRefresh()` exportado eh chamado tambem por endpoint admin `POST /api/admin/fx/refresh` (RF-06) para force run manual — mesma logica, sem necessidade de duplicar codigo.

Weekend / feriado: cron roda mas adapters retornam vazios. `upsertDailyRates([], today)` resulta em `{ inserted: 0, skipped: 0 }`. Log info `[fx/cron] no rates fetched (weekend or holiday)`. Comportamento esperado, sem alarme. `getRatesForDate(weekendDate)` em `fxRatesPersistence` faz lookup descending para working day anterior (`SELECT ... WHERE date <= ? ORDER BY date DESC LIMIT 1` por currency).

Concorrencia: 2 invocacoes simultaneas (admin force + scheduled). Cenario A (mesma data, mesma currency): segunda invocacao → `ON CONFLICT DO NOTHING` skip. Cenario B (race condition entre fetch e upsert): ambas escrevem `{ date: today, currency: 'BRL' }` — segunda upsert hits PK constraint, skip. **Sempre seguro**.

Disable em CI / teste sem internet: env var `FX_CRON_DISABLED=true` impede `cron.schedule` registrar handler. Permite tests isolados sem necessidade de mock global.

Justificativa do horario `17:00 UTC`:

- **PTAX boletim "Fechamento"**: 13:00 America/Sao_Paulo = 16:00 UTC. 17:00 UTC garante 1h margem.
- **ECB fixing diario**: ~16:00 CET. Em winter time (CET = UTC+1) = 15:00 UTC. Em summer time (CEST = UTC+2) = 14:00 UTC. 17:00 UTC garante 2-3h margem em qualquer DST setting.
- **Brasil sem DST**: America/Sao_Paulo = UTC-3 ano todo. `17:00 UTC = 14:00 SP` sempre (consistencia).
- **Margem para network hiccups**: 1h+ apos publicacoes oficiais permite providers terem caches quentes e API responsiva.

## Opcoes Consideradas

### Opcao 1 (escolhida): Cron `0 0 17 * * *` UTC + idempotencia ON CONFLICT DO NOTHING

- **Pros:**
  - **17:00 UTC garante PTAX + ECB ja publicados** com margem confortavel.
  - **Brasil sem DST**: horario estavel ano todo (14:00 SP fixo).
  - **Idempotencia DB-level**: PK composta `(date, currency)` garante zero duplicates mesmo em race. Upsert `ON CONFLICT DO NOTHING` eh atomico.
  - **Cron in-process via `node-cron`**: zero infra nova. Reusa padrao Sprint News-1+ (ADR-107).
  - **Force refresh reutiliza pipeline**: `runFxRatesRefresh()` exportado, endpoint admin chama mesma fn.
  - **Top-level try/catch**: exception nunca derruba server.
  - **`FX_CRON_DISABLED=true`** permite CI/teste sem internet.
  - **Telemetria estruturada**: `runId` + status + duration permite dashboard futuro.

- **Contras:**
  - **17:00 UTC eh meio do dia em mercados asiaticos**: irrelevante (currencies asiaticas fora do escopo v1).
  - **In-process cron nao escala multi-instance**: se Grindfy escalar para multi-instance, 2+ servers rodariam cron concorrentemente. Mitigado por: `ON CONFLICT DO NOTHING` torna concorrencia inocua.

### Opcao 2: Cron 13:00 UTC (logo apos PTAX)

- **Pros:**
  - **Rates frescas mais cedo**: ~3h antes da Opcao 1.

- **Contras:**
  - **ECB summer time publica 14:00 UTC**: cron 13:00 UTC perderia ECB summer = EUR sempre dia anterior.
  - **Margem zero**: PTAX 13:00 SP = 16:00 UTC, cron 13:00 UTC pegaria PTAX dia ANTERIOR (clearly wrong).
  - **Rejeitada:** matematica do horario quebra coverage.

### Opcao 3: Multiplos ticks intraday (4x/dia: 06, 12, 17, 22 UTC)

- **Pros:**
  - **Rates atualizadas multiple times**: capturaria flutuacoes intraday.

- **Contras:**
  - **PTAX/ECB publicam 1x/dia**: 4 ticks rodam 3 inserts vazios + 1 produtivo. ~75% wasted runs.
  - **Audit trail poluido**: 4 rows com mesmo rate (em currencies/sources que nao publicam intraday).
  - **Bankroll poker eh decisao diaria, nao intraday**: ticks extras sao non-feature.
  - **Custo API maior**: ainda gratuito mas politeness eh proporcional.
  - **Rejeitada:** sem ganho funcional + overhead.

### Opcao 4: Cron manual via systemd / cron OS-level

- **Pros:**
  - **Robustez OS-level**: cron OS sobrevive a app restart.

- **Contras:**
  - **Infra extra**: systemd unit ou crontab por ambiente (dev, prod). Coolify-friendly?
  - **Acoplamento**: cron precisa fetchar rota HTTP `/api/admin/fx/refresh` ou rodar script Node — duplicacao de auth.
  - **`node-cron` in-process eh padrao Grindfy** (Sprint News-1+, ADR-107).
  - **Rejeitada:** infra extra sem ganho.

### Opcao 5: Sem idempotencia (UPSERT com UPDATE em conflict)

- **Pros:**
  - **`fetched_at` sempre fresh**: util para "ultimo fetch attempt".

- **Contras:**
  - **Audit trail destruido**: row vira mutavel. Historico de "quando esta rate foi fetched a primeira vez" perdido.
  - **Force refresh sobreescreve dado bom com dado igual**: noise sem valor.
  - **PK composta + ON CONFLICT DO NOTHING preserva first-fetched_at**: imutabilidade eh feature.
  - **Rejeitada:** quebra audit trail nativo (requisito ADR-121).

## Consequencias

### Positivas

- **Rates atualizadas 1x/dia em horario seguro** (PTAX + ECB ambos publicados).
- **Brasil sem DST = horario estavel**: 14:00 SP ano todo.
- **Idempotencia DB-level**: PK composta garante zero duplicates mesmo em race condition.
- **Force refresh reutiliza pipeline**: zero codigo duplicado.
- **Server NUNCA derrubado por falha de provider**: top-level try/catch.
- **Telemetria rica**: `runId` + status + duration_ms permite observabilidade.
- **CI-friendly**: `FX_CRON_DISABLED=true` desliga em ambientes sem internet.
- **Compatibilidade total com ADR-121/122**: tabela e adapters ja desenhados para essa pipeline.

### Negativas

- **In-process cron nao escala multi-instance**: 2+ servers rodariam cron simultaneamente. Mitigado por idempotencia DB-level (`ON CONFLICT DO NOTHING`). Aceitavel hoje (Grindfy single-instance Coolify).
- **Server restart entre 17:00 e proximo run**: se server crashar logo antes do cron e demorar para subir, cron pode pular o run do dia. Mitigado por: `getRatesForDate` lookup descending pega ultimo working day OK; force refresh manual via endpoint admin recupera.
- **Weekend / feriado nao alarma como falha**: cron roda, adapters retornam vazios, log info "no rates fetched". Comportamento esperado mas pode confundir observador casual. Mitigado por: log explicito "weekend or holiday" + status `'ok'` (nao `'failed'`).
- **`FX_CRON_DISABLED` env var nova**: documentar em CLAUDE.md secao 4 + `.env.example`.

### Neutras

- **17:00 UTC = 14:00 SP**: 14h horario brasileiro eh confortavel para founder QA manual em horario comercial.
- **Cron schedule string `0 0 17 * * *`**: formato `node-cron` 6 fields (sec min hour day month dow). Equivalente a `0 17 * * *` em 5-field crontab classico.
- **Force refresh via admin endpoint**: rate-limited via `requirePermission('admin:fx')` + rate-limit 10 req/min (RF-06).
- **Telemetria `[fx/cron]` log estruturado**: padrao consistente com `[news/cron]` (ADR-107).
- **`runId = nanoid(10)`**: 10 chars suficientes para correlacionar logs do mesmo run sem colisao significativa.

## Confianca

**Alta.** Padrao "node-cron in-process + try/catch top-level + idempotencia DB-level" eh estabelecido no projeto (Sprint News-1+, ADR-107). Horario 17:00 UTC tem margem segura sobre publicacoes oficiais. Idempotencia via PK composta eh trivialmente correta. Force refresh via endpoint admin reutiliza pipeline. Riscos residuais (server restart timing, multi-instance future) tem mitigacoes claras.

## Referencias

- Spec: `Docs/specs/sprint-fx-1.md` (RF-04, D2, D10)
- ADR-121: Tabela global `system_fx_rates` (PK composta + audit nativo)
- ADR-122: Multi-source fallback chain BCB + frankfurter
- ADR-107: news cron weekly UTC + node-cron in-process (padrao referencia)
- node-cron docs: https://github.com/node-cron/node-cron
- Job: `server/jobs/refreshFxRates.ts` (novo)
- Registry: `server/jobs/index.ts` (extensao)
- Endpoint admin: `server/routes/admin.ts` ou `server/routes/adminFx.ts` (RF-06)
- Diagrama: `Docs/architecture/diagrams/fx-1-cron-sequence.mermaid`
