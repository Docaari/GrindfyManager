# Spec: Sprint FX-1 — Auto-update FX rates diario (BRL/EUR via fontes oficiais)

## Status
Proposta — pronta para System-Architect (RF-01, RF-04, RF-05 exigem ADRs novos 121-123).

## Resumo Executivo

Substituir o regime atual de FX rates manuais (`FALLBACK_FX_RATES` constants + `users.exchangeRates` editado a mao) por um pipeline diario automatico que busca cotacoes oficiais para o par USD/BRL (BCB PTAX) e USD/EUR (frankfurter / ECB), persiste em uma tabela nova `system_fx_rates` (rates globais, audit trail nativo) e expoe os rates atraves do `fxResolver` ja existente — adicionando uma nova camada `system` na cascata de resolucao. Override manual per-user permanece (UI de Settings) com botao explicito "Resetar para taxas do sistema" para zerar `users.exchangeRates`. Snapshots de bankroll (`bankroll_snapshots`) passam a usar a rate do dia (`getRatesForDate(snapshotDate)`) em vez de rates do momento da gravacao. `wallets.exchangeRates` permanece **imutavel** (compat ADR-034). Cron `0 0 17 * * *` UTC (14:00 SP, apos publicacao do PTAX 13:00). Backfill de 90 dias via timeseries no deploy/setup.

Escopo currencies v1: **USD, BRL, EUR** apenas. CNY, GBP, USDT, BTC fora — wallets legadas com essas moedas continuam funcionando via cascata compat (`wallets.exchangeRates`).

## Contexto

Hoje o Grindfy resolve FX por meio de uma cascata estatica: `users.exchangeRates` (jsonb editado pelo usuario na pagina de Settings) → `wallets.exchangeRates` (jsonb imutavel snapshotado no momento da criacao da wallet, ADR-034) → `FALLBACK_FX_RATES` (constants hard-coded em `server/services/fxResolver.ts`). A resolucao acontece em `fxResolver.resolveExchangeRates(userId)` com cache memoria 5min (ADR-061). A convencao ADR-033 (QW-1) define `rates[ccy] = unidades de ccy por 1 USD` — USD = 1 sempre.

Problemas observados:
- **Drift silencioso:** rates ficam desatualizadas. BRL hard-coded em `5.0` quando o real flutua entre 4.8 e 6.2.
- **Pagina Settings ignorada:** poucos usuarios atualizam manualmente os rates. Quando atualizam, esquecem de revisitar.
- **Snapshots historicos errados:** `bankroll_snapshots` gravado em data X usa o rate do **momento da gravacao**, nao o rate **do dia**. Reconciliacao retroativa fica impossivel.
- **Inflacao do FALLBACK constants:** lista crescente (CNY, USDT, GBP, BTC) ja foi inserida mas nunca validada contra mercado real.

A solucao: cron diario que busca rates oficiais do Banco Central do Brasil (PTAX, fonte BR canonica) e do European Central Bank via frankfurter (ECB, fonte EUR canonica), persiste em tabela auditavel `system_fx_rates` (PK composta `(date, currency)`, audit trail nativo), e atualiza o `fxResolver` para servir essas rates por padrao — preservando override manual per-user. Snapshots passam a ler a rate **da data do snapshot**, nao do momento de execucao.

CLAUDE.md secao 6.1 (regra fonte historico tournaments) **NAO se aplica** — FX rates sao tabela financeira separada, sem relacao com `tournaments` / `session_tournaments`.

## Usuarios

- **Jogador BR multi-wallet:** abre Dashboard, ve banca consolidada em USD calculada com rate BRL/USD do dia (PTAX). Snapshot ontem usou PTAX de ontem. Nao precisa atualizar rate manual.
- **Jogador EUR (semi-pro Europa):** wallets em EUR convertem corretamente para USD usando ECB rate.
- **Jogador power-user com override:** prefere usar rate manual (ex: rate de uma corretora especifica que ele transaciona). Edita `users.exchangeRates` em Settings e o override persiste; pode reverter via botao "Resetar para taxas do sistema".
- **Founder/Admin:** dispara refresh manual via `POST /api/admin/fx/refresh` apos noticias relevantes (ex: feriado bancario que adia PTAX). Inspeciona historico via `GET /api/admin/fx/history`.
- **Cron job:** roda 1x/dia 17:00 UTC, agnostic ao usuario (rates globais).

## Glossario

- **PTAX:** Cotacao oficial publicada pelo Banco Central do Brasil (BCB), via OData `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/...`. Boletim "Fechamento" sai aproximadamente 13:00 America/Sao_Paulo.
- **frankfurter:** API publica gratuita (`https://api.frankfurter.dev/v1/latest`) que serve rates do European Central Bank (ECB). Suporta latest + timeseries. Sem auth.
- **rate per USD:** valor numerico que multiplica USD para obter a moeda local. Ex: BRL=5.10 significa 1 USD = 5.10 BRL. Convencao QW-1 (ADR-033).
- **System rate:** rate global gravada em `system_fx_rates`, identica para todos os usuarios.
- **User override:** rate gravada em `users.exchangeRates` (jsonb) que tem precedencia sobre system rate na cascata.
- **Cascata de resolucao:** ordem de prioridade `users.exchangeRates` (override) → `system_fx_rates` (latest do dia) → `wallets.exchangeRates` (compat legado, imutavel) → `FALLBACK_FX_RATES` (constants).

---

## Goals / Non-Goals

### Goals

1. Cron diario 17:00 UTC busca BRL via BCB PTAX e EUR via frankfurter, persiste em `system_fx_rates` (1 row por currency por dia).
2. `fxResolver` cascata estendida para incluir camada `system` entre `user` override e `wallets` compat.
3. Snapshots `bankroll_snapshots` passam a usar `getRatesForDate(snapshotDate)` em vez de rate do momento.
4. UI Settings mostra rates BRL e EUR atuais com badge de origem (`sistema` vs `manual`) e botao "Resetar para taxas do sistema".
5. Endpoints admin para force refresh + history + latest.
6. Backfill script reaproveitavel para popular 90 dias historicos no setup/deploy inicial.
7. Fallback chain robusto: BCB falha → frankfurter cobre BRL via `base=USD&symbols=BRL`; frankfurter falha → BCB cobre BRL apenas (EUR fica stale com log warn). Ambos falham → mantem rate cacheada do dia anterior; cache vazio → `FALLBACK_FX_RATES` constants.
8. Audit trail nativo na propria tabela (`source` + `fetched_at` por row).
9. Wallets legadas com CNY/GBP/USDT/BTC continuam funcionando via cascata compat (`wallets.exchangeRates`).

### Non-Goals (esta sprint)

- **Currencies adicionais:** apenas USD/BRL/EUR. CNY, GBP, USDT, BTC fora.
- **Crypto live rate (USDT, BTC):** depende de provider externo distinto (CoinGecko, CoinMarketCap), fora do escopo.
- **Alerta de drift > 5%** entre user override e system rate: deferido (UX research, sprint posterior).
- **Multi-source quote consensus:** apenas 1 primary + 1 fallback por currency. Sem media ponderada.
- **Intraday updates:** apenas 1x/dia. Ticks de mercado nao sao relevantes pro use case (poker bankroll = decisoes diarias).
- **Forecasting / hedging:** zero analytics preditiva.
- **Refactor visual de Settings:** apenas adicionar painel `FxRatesPanel`, sem reorganizar pagina inteira.
- **Mudanca em `wallets.exchangeRates` imutabilidade:** ADR-034 mantido. Snapshots antigos continuam usando rates da wallet.

### Posicao no roadmap

- **Predecessoras:** Bankroll-2 (ADR-033 QW-1 convention), Bankroll-2.1 (ADR-034 wallet immutability), Bankroll-3 (ADR-061 fxResolver unified).
- **Sucessoras candidatas:**
  - Sprint FX-2 (alerta drift user vs system, multi-source consensus, currencies adicionais).
  - Sprint FX-3 (crypto live rate via CoinGecko, USDT/BTC).

---

## Defaults Autonomos D1-D12

Founder ja confirmou estes defaults durante brainstorm. Aplicados sem perguntar:

| ID | Decisao | Justificativa |
|---|---|---|
| **D1** | Rates **globais** (todos os users compartilham) com override per-user opcional via `users.exchangeRates`. Tabela nova `system_fx_rates`. | Reduz custo de API (1 fetch / dia / currency, nao 1 / user). User override mantem flexibilidade legacy. |
| **D2** | Cron `0 0 17 * * *` UTC = 14:00 America/Sao_Paulo. Aposta no boletim PTAX "Fechamento" 13:00 SP. | Garante que PTAX ja foi publicado antes do fetch. ECB publica ~16:00 CET (15:00 UTC), tambem pronto. |
| **D3** | Snapshots `bankroll_snapshots` usam `getRatesForDate(snapshotDate)`. `wallets.exchangeRates` permanece **IMUTAVEL** (compat ADR-034) — usado apenas para snapshots antigos pre-FX-1. | Auditoria correta: snapshot de 2026-04-15 deve usar rate de 2026-04-15, nao de hoje. Wallets imutaveis evitam reescrita de historico legacy. |
| **D4** | BTC **fora** do escopo. | Volatilidade extrema + provider distinto. Sprint FX-3. |
| **D5** | USDT **fora** do escopo. | Stablecoin, valor proximo de 1 USD. Provider distinto. Sprint FX-3. |
| **D6** | UI override manual mantido + botao "Resetar para taxas do sistema" zera `users.exchangeRates`. | Power user mantem controle. Reset eh 1-click reversivel. |
| **D7** | Audit trail **nativo na tabela**. `system_fx_rates` eh historico (PK composta `(date, currency)`). Sem tabela `_audit` separada. | Simplicidade. Cada row eh imutavel pos-insert (ON CONFLICT DO NOTHING). |
| **D8** | Sem alerta de drift v1. | Deferido para FX-2. |
| **D9** | Backfill 90 dias via frankfurter `/v1/{from}..{to}` timeseries. BCB PTAX preferido para BRL quando disponivel; frankfurter como fallback secundario. | Frankfurter timeseries eh free e cobre BRL+EUR de uma vez. BCB tem rate-limit mais aspero — usar para current day apenas. |
| **D10** | Weekend = `ON CONFLICT DO NOTHING` no upsert. PTAX/ECB nao publicam sabado/domingo — cron roda mas nao insere row. Resolver lookup para sabado/domingo retorna ultimo working day. | Mercado FX oficial fecha fim-de-semana. Comportamento padrao da industria. |
| **D11** | Endpoint admin `POST /api/admin/fx/refresh` permite force run. `GET /api/admin/fx/latest` retorna ultima rate por currency. `GET /api/admin/fx/history?currency=BRL&days=30` retorna paginated. | Recovery manual + observabilidade. |
| **D12** | `FALLBACK_FX_RATES` constants reduzido para `{USD:1, BRL:5.0, EUR:0.93}`. CNY/GBP/USDT/BTC removidos. Wallets antigas com essas moedas continuam funcionando via `wallets.exchangeRates` cascade compat. | Evita falsa sensacao de suporte. Wallets legadas 100% preservadas. |

---

## Requisitos Funcionais

### RF-01: Tabela `system_fx_rates` + schema Drizzle [S]

**Descricao:** Criar tabela `system_fx_rates` com PK composta `(date, currency)` e index para lookup descendente.

**Regras de negocio:**
- DDL conforme secao "Modelo de Dados" abaixo.
- PK composta evita duplicatas naturais (1 row por currency por data).
- `source` enum-like via VARCHAR(16) com valores `'bcb_ptax'`, `'frankfurter'`, `'manual'`, `'fallback'`.
- `rate_per_usd` segue convencao QW-1 (ADR-033): unidades de currency por 1 USD. USD=1 nunca eh inserido (constante implicita).
- Schema TypeScript em `shared/schema.ts` exporta `systemFxRates` table + Zod insert/select schemas via `drizzle-zod`.
- Index `idx_system_fx_rates_currency_date ON (currency, date DESC)` para query "ultima rate de BRL".

**Criterio de aceitacao:**
- [ ] Migration `migrations/0049_system_fx_rates.sql` aplicada via `db:push` sem erros.
- [ ] `\d system_fx_rates` em psql confirma PK composta + index criado.
- [ ] `shared/schema.ts` exporta `systemFxRates`, `systemFxRatesInsertSchema`, `systemFxRatesSelectSchema`.
- [ ] Insert duplicado `(date, currency)` falha com unique violation, capturada em `ON CONFLICT DO NOTHING`.
- [ ] Tipo `FxSource = 'bcb_ptax' | 'frankfurter' | 'manual' | 'fallback'` exportado.

**Paths arquivos:**
- `migrations/0049_system_fx_rates.sql` (novo)
- `shared/schema.ts` (extensao)

---

### RF-02: Adapters HTTP — `frankfurterAdapter` + `bcbPtaxAdapter` [M]

**Descricao:** Dois modulos isolados em `server/services/fx/adapters/` que encapsulam fetch + parse das APIs externas.

**Regras de negocio:**

`frankfurterAdapter.ts` expoe:
- `fetchLatest(symbols: string[]): Promise<FxRow[]>` — chama `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${symbols.join(',')}`.
- `fetchTimeseries(from: string, to: string, symbols: string[]): Promise<Record<string, FxRow[]>>` — chama `/v1/${from}..${to}?base=USD&symbols=...`.
- Timeout 30s, User-Agent `GrindfyFxBot/1.0 (+https://grindfy.com)`.
- Parse `{ amount, base, date, rates: { BRL: 5.10, EUR: 0.92 } }` → array `FxRow`.

`bcbPtaxAdapter.ts` expoe:
- `fetchLatestBrl(): Promise<FxRow | null>` — chama OData PTAX `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(...)?...&$format=json` para par USD/BRL boletim "Fechamento".
- `fetchTimeseriesBrl(from: string, to: string): Promise<FxRow[]>` — chama OData range query.
- Mesmo timeout/UA.
- Parse fragil — fixture-based unit test obrigatorio (R6).
- BCB retorna `cotacaoVenda` (rate de venda) + `cotacaoCompra`. Usar `cotacaoVenda` para conversao "USD para BRL" (mais conservador para player que esta convertendo banca).

`FxRow` shape (compartilhado):
```ts
type FxRow = {
  currency: string;       // 'BRL' | 'EUR'
  date: string;           // ISO date YYYY-MM-DD
  ratePerUsd: number;     // unidades de currency por 1 USD (convencao QW-1)
  source: 'bcb_ptax' | 'frankfurter';
};
```

**Tratamento de erro:**
- HTTP 4xx/5xx/timeout/parse error → log `console.error('[fx/adapter] ${name} failed', err)` + retornar `null` (latest) ou `[]` (timeseries).
- NUNCA throw — adapter falhar nao pode derrubar cron inteiro.

**Criterio de aceitacao:**
- [ ] `frankfurterAdapter.fetchLatest(['BRL', 'EUR'])` retorna 2 rows com shape correto.
- [ ] `bcbPtaxAdapter.fetchLatestBrl()` retorna 1 row BRL com `source = 'bcb_ptax'`.
- [ ] HTTP 5xx no frankfurter retorna `[]` + log estruturado, sem throw.
- [ ] User-Agent `GrindfyFxBot/1.0` enviado em todas requests.
- [ ] Weekend (sabado/domingo) BCB retorna 0 rows ou erro — adapter retorna `null` sem throw.
- [ ] Timeseries `fetchTimeseries('2026-02-01', '2026-04-30', ['BRL'])` retorna ~63 rows BRL (working days).
- [ ] Parse de fixture commitada em `tests/fixtures/fx/bcb-ptax-sample.json` valida schema.

**Paths arquivos:**
- `server/services/fx/adapters/frankfurterAdapter.ts` (novo)
- `server/services/fx/adapters/bcbPtaxAdapter.ts` (novo)
- `server/services/fx/adapters/types.ts` (novo, export `FxRow`)
- `tests/fixtures/fx/bcb-ptax-sample.json` (novo)
- `tests/fixtures/fx/frankfurter-latest-sample.json` (novo)
- `tests/fixtures/fx/frankfurter-timeseries-sample.json` (novo)

---

### RF-03: Service `fxRatesPersistence` — upsert + queries + cache [M]

**Descricao:** Camada de persistencia entre adapters e DB. Encapsula upsert idempotente, queries de leitura e cache memoria 5min para `getLatestSystemRates()`.

**Regras de negocio:**

API publica:
```ts
type SystemRate = {
  currency: string;
  date: string;
  ratePerUsd: number;
  source: FxSource;
  fetchedAt: Date;
};

upsertDailyRates(date: string, rows: FxRow[]): Promise<{ inserted: number; skipped: number }>;
getLatestSystemRates(): Promise<Record<string, SystemRate>>;  // ex: { BRL: {...}, EUR: {...} }
getRatesForDate(date: string): Promise<Record<string, SystemRate>>;
getRateHistory(currency: string, days: number, offset?: number): Promise<SystemRate[]>;
invalidateLatestCache(): void;
_resetCacheForTests(): void;
```

- `upsertDailyRates` faz `INSERT ... ON CONFLICT (date, currency) DO NOTHING` + retorna contagem `inserted` (rows efetivamente novas) e `skipped` (conflito ignorado).
- `getLatestSystemRates()` retorna a row mais recente por currency. Cache memoria 5min.
- `getRatesForDate(date)` busca rates daquela data; se vazio (weekend, gap), retorna ultimo working day anterior (LATERAL `SELECT ... WHERE date <= ? ORDER BY date DESC LIMIT 1` por currency).
- `getRateHistory(currency, days)` paginado: top N descending por date.
- Cache module-level `Map<string, CacheEntry>` (similar a `fxResolver`). `invalidateLatestCache()` chamado pelo cron pos-upsert.

**Criterio de aceitacao:**
- [ ] `upsertDailyRates('2026-05-05', [{ currency: 'BRL', ratePerUsd: 5.1, ... }])` insere 1 row.
- [ ] Reupsert no mesmo dia retorna `{ inserted: 0, skipped: 1 }`.
- [ ] `getLatestSystemRates()` cacheia por 5min — segunda chamada nao toca DB (validar via mock spy).
- [ ] `getRatesForDate('2026-05-03')` (domingo) retorna rate de sexta-feira `2026-05-01` se nao houver row para `'05-03'`.
- [ ] `getRateHistory('BRL', 30)` retorna 30 rows ordenadas date DESC.
- [ ] `invalidateLatestCache()` apos upsert força re-fetch na proxima `getLatestSystemRates()`.
- [ ] `_resetCacheForTests()` usado em `beforeEach` zera Map sem tocar DB.

**Paths arquivos:**
- `server/services/fx/fxRatesPersistence.ts` (novo)
- `server/storage.ts` (extensao — helper `_systemFxRates_*` queries via Drizzle)

---

### RF-04: Cron `refreshFxRates` — schedule + pipeline + cross-fallback [M]

**Descricao:** Job em `server/jobs/refreshFxRates.ts`, registrado em `server/jobs/index.ts`. Schedule `0 0 17 * * *` UTC = 14:00 SP.

**Regras de negocio:**

Pipeline em `runFxRatesRefresh()`:
1. Determinar `today = new Date().toISOString().slice(0, 10)`.
2. Fetch BRL via `bcbPtaxAdapter.fetchLatestBrl()`.
   - Se falhar (null): fallback `frankfurterAdapter.fetchLatest(['BRL'])` → extrair BRL.
3. Fetch EUR via `frankfurterAdapter.fetchLatest(['EUR'])` → extrair EUR.
   - Se falhar: log warn `[fx/cron] EUR provider down — keeping previous day`. NAO ha cross-fallback EUR (BCB nao serve EUR).
4. Coletar todas as `FxRow` validas.
5. `upsertDailyRates(today, rows)`.
6. `fxRatesPersistence.invalidateLatestCache()`.
7. `fxResolver.invalidateCache()` global — invalida cache user-level.
8. Log estruturado `{ runId, source, currencies_fetched: ['BRL','EUR'], currencies_failed: [], duration_ms, status: 'ok' | 'partial' | 'failed' }`.
9. Retorna metrics object.

Idempotencia:
- Re-run no mesmo dia: ON CONFLICT DO NOTHING. Log `inserted: 0, skipped: N`.
- Cron nunca derruba server: try/catch top-level + `console.error`.
- Concorrencia: 2 invocacoes simultaneas resultam em ate 2 rows novas em currencies diferentes (improvavel) ou 0 novas (mesma data) — sempre seguro.

**Criterio de aceitacao:**
- [ ] Cron schedule `0 0 17 * * *` UTC registrado via `node-cron`.
- [ ] Run completo com BCB + frankfurter mockados insere 2 rows (BRL + EUR) na primeira invocacao do dia.
- [ ] Reinvocacao no mesmo dia → `{ inserted: 0, skipped: 2 }`.
- [ ] BCB falha + frankfurter responde BRL → cross-fallback funciona, BRL salvo com `source = 'frankfurter'`.
- [ ] frankfurter falha + BCB responde BRL → BRL salvo, EUR ausente, status `'partial'`.
- [ ] Ambos falham → status `'failed'`, zero inserts, log error, server continua up.
- [ ] `fxResolver._resetCacheForTests` invalidado pos-upsert (validar via mock spy).
- [ ] Log estruturado `[fx/cron]` emitido com runId nanoid + status + duration_ms.
- [ ] `runFxRatesRefresh()` exportado pode ser chamado direto pelo handler admin force-refresh (RF-06).

**Paths arquivos:**
- `server/jobs/refreshFxRates.ts` (novo)
- `server/jobs/index.ts` (extensao — adicionar `await registerFxRatesCron()`)

---

### RF-05: Atualizar `fxResolver` — cascata com camada `system` [M]

**Descricao:** Estender `server/services/fxResolver.ts` para incluir `system_fx_rates` na cascata de resolucao.

**Regras de negocio:**

Nova ordem de prioridade em `resolveExchangeRates(userId)`:
1. `users.exchangeRates` (override) — se existe e tem currency, usa.
2. `system_fx_rates` (latest) — fetched via `fxRatesPersistence.getLatestSystemRates()`.
3. `wallets.exchangeRates` (compat legado) — para currencies que system nao tem (CNY, GBP, USDT, BTC, etc).
4. `FALLBACK_FX_RATES` constants — ultimo recurso.

Tipo `source` extendido:
```ts
source: 'user' | 'system' | 'wallets' | 'fallback';
```

Logica de merge:
- Comecar com `FALLBACK_FX_RATES` como base.
- Sobrepor `wallets.exchangeRates` (compat).
- Sobrepor `system_fx_rates` (latest BRL + EUR).
- Sobrepor `users.exchangeRates` (override per-user).
- USD = 1 forced.
- `source` reflete a camada **dominante** entre as currencies relevantes (BRL/EUR). Se user tem override BRL → `source = 'user'`. Se nao tem override mas system tem BRL → `source = 'system'`.

Cache 5min mantido. `invalidateCache()` global continuar sendo chamado pelo cron e pelo PUT /user-settings.

**`FALLBACK_FX_RATES` constants reduzido:**
```ts
export const FALLBACK_FX_RATES: Readonly<Record<string, number>> = Object.freeze({
  USD: 1,
  BRL: 5.0,
  EUR: 0.93,
});
```

CNY, GBP, USDT, BTC removidos. Wallets legadas com essas moedas continuam funcionando via `wallets.exchangeRates` cascade compat (etapa 3 da nova cascata).

**Criterio de aceitacao:**
- [ ] User sem override + system com BRL/EUR → `source = 'system'`, rates corretos.
- [ ] User com override BRL → `source = 'user'`, BRL = override, EUR = system.
- [ ] User sem override + system vazio (DB recem-criada) + wallet com BRL → `source = 'wallets'`.
- [ ] User sem override + system vazio + wallet vazia → `source = 'fallback'`, BRL=5.0 EUR=0.93.
- [ ] Wallet legada com CNY=7.2 + system com BRL/EUR → `rates.CNY = 7.2`, source primario = 'system' (porque BRL/EUR sao primary).
- [ ] `convertBetween(100, 'BRL', 'EUR', rates)` usa system BRL e system EUR corretamente.
- [ ] Cache 5min preservado (user + system rates juntos).
- [ ] `invalidateCache()` chamado pelo cron pos-upsert força re-fetch na proxima request user.

**Paths arquivos:**
- `server/services/fxResolver.ts` (modificacao significativa)
- (opcional, helper) `server/services/fx/fxRatesPersistence.ts` import direto

---

### RF-06: Endpoints admin — refresh + latest + history [S]

**Descricao:** 3 endpoints REST sob `/api/admin/fx/*` protegidos por `requirePermission('admin:fx')`.

**Regras de negocio:**

`POST /api/admin/fx/refresh` — force run do cron.
- Body vazio.
- Chama `runFxRatesRefresh()` direto.
- Response `{ status, inserted, skipped, errors[], runId, duration_ms }`.

`GET /api/admin/fx/latest` — ultima rate por currency.
- Query: opcional `?currencies=BRL,EUR` (default: BRL,EUR).
- Chama `fxRatesPersistence.getLatestSystemRates()`.
- Response `{ BRL: { ratePerUsd, date, source, fetchedAt }, EUR: {...} }`.

`GET /api/admin/fx/history?currency=BRL&days=30&offset=0` — paginated history.
- Query: `currency` obrigatorio, `days` default 30 max 365, `offset` default 0.
- Chama `fxRatesPersistence.getRateHistory(currency, days, offset)`.
- Response `{ currency, rows: [{ date, ratePerUsd, source, fetchedAt }, ...], total, offset, limit }`.

Permission `admin:fx`:
- Verificar `shared/permissions.ts` se ja existe slot para admin permissions.
- Se nao existir, criar. Reusar pattern de `admin:users` se houver.
- Founder default tem permissao (config seed em script de deploy ou hardcoded em `requirePermission` para users com role admin).

Rate limit: aplicar `bankrollLimiter` ou criar `adminLimiter` similar (10 req/min).

**Criterio de aceitacao:**
- [ ] `POST /api/admin/fx/refresh` sem auth retorna 401.
- [ ] `POST /api/admin/fx/refresh` com user sem permission retorna 403.
- [ ] `POST /api/admin/fx/refresh` com admin retorna 200 + metrics.
- [ ] `GET /api/admin/fx/latest` retorna BRL + EUR com timestamps.
- [ ] `GET /api/admin/fx/history?currency=BRL&days=30` retorna 30 rows ordenadas date DESC.
- [ ] `GET /api/admin/fx/history?currency=BRL&days=400` retorna 400 (validation error, max 365).
- [ ] Rate limit dispara em 11a chamada/min.
- [ ] Permission `admin:fx` registrada em `shared/permissions.ts`.

**Paths arquivos:**
- `server/routes/admin.ts` (extensao OU novo `server/routes/adminFx.ts`)
- `shared/permissions.ts` (extensao se necessario)

---

### RF-07: UI Settings — `FxRatesPanel` [M]

**Descricao:** Novo painel em `client/src/components/settings/FxRatesPanel.tsx` que mostra rates BRL/EUR atuais com badge de origem e permite override + reset.

**Regras de negocio:**

Layout:
```
┌─ Taxas de Cambio ────────────────────┐
│ USD/BRL: 5.1234   [sistema] (12:14)  │
│ USD/EUR: 0.9234   [manual]          │
│                                      │
│ [Editar manualmente]                 │
│ [Resetar para taxas do sistema]      │
└──────────────────────────────────────┘
```

- Fetch via `GET /api/user-settings` (existente — retorna `exchangeRates` user-level) + `GET /api/fx/current` (novo — retorna rates resolved + source per-currency).
- Endpoint `GET /api/fx/current` (autenticado, qualquer user) retorna `{ BRL: { ratePerUsd, source: 'user'|'system'|'fallback', updatedAt }, EUR: {...} }`. Nao expoe `wallets` source — colapsa em `system` se system existe, senao em `fallback`.
- Badge `sistema` (cor neutra) ou `manual` (cor accent) indicando override per-user.
- `[Editar manualmente]` abre dialog com 2 inputs (BRL, EUR) + Save → `PUT /api/user-settings { exchangeRates: { BRL: x, EUR: y } }` (endpoint existente).
- `[Resetar para taxas do sistema]` chama `PUT /api/user-settings { exchangeRates: {} }` (limpa override) → confirma com toast "Taxas resetadas. Voltando ao sistema."
- Apos save/reset, invalidate React Query cache de `fx-current` + `user-settings`.
- Painel renderiza em `/settings` (pagina existente). Posicionar acima de "Bankroll" ou em secao dedicada "Financeiro".

**Estados:**
- Loading: skeleton.
- Error fetch `/api/fx/current` falha: badge `fallback` + valores `FALLBACK_FX_RATES`.
- Empty (system rates ainda nao geradas, primeiro deploy): badge `fallback`.

**Criterio de aceitacao:**
- [ ] Painel renderiza com BRL=5.1234 e EUR=0.9234 quando system rates existem.
- [ ] Badge `sistema` quando user nao tem override.
- [ ] Badge `manual` quando user tem override (mesmo que valor seja igual ao system).
- [ ] Click em "Editar manualmente" abre dialog com inputs preenchidos com rates atuais.
- [ ] Save dialog atualiza rates + invalidate query + toast sucesso.
- [ ] Click em "Resetar para taxas do sistema" zera `users.exchangeRates` + badge muda para `sistema`.
- [ ] Endpoint `GET /api/fx/current` exposto + autenticado.
- [ ] Acessibilidade: `<button>` semantico, aria-label, foco visivel.
- [ ] Componente coberto por test `FxRatesPanel.test.tsx` (RTL).

**Paths arquivos:**
- `client/src/components/settings/FxRatesPanel.tsx` (novo)
- `client/src/pages/Settings.tsx` (mount panel)
- `server/routes/userSettings.ts` ou `server/routes/fx.ts` (novo endpoint `/api/fx/current`)

---

### RF-08: Backfill script `fx-backfill.ts` — 90 dias [S]

**Descricao:** Script Node em `scripts/fx-backfill.ts` que popula 90 dias historicos no setup inicial / pos-deploy.

**Regras de negocio:**
- Argumentos CLI opcionais: `--days=90` (default), `--from=YYYY-MM-DD`, `--to=YYYY-MM-DD`.
- Chama `frankfurterAdapter.fetchTimeseries(from, to, ['BRL', 'EUR'])` — ECB cobre ambos em 1 request.
- (Preferido para BRL) Chama `bcbPtaxAdapter.fetchTimeseriesBrl(from, to)` para sobrepor BRL com source PTAX. ECB BRL fica fallback se BCB falhar para algum dia.
- Throttle: `await sleep(200)` entre paginas se >30 dias (R5).
- Insert batch via `fxRatesPersistence.upsertDailyRates(date, rows)` por dia.
- Idempotente: re-run no mesmo range nao duplica (ON CONFLICT DO NOTHING).
- Log progresso `[fx/backfill] ${date}: BRL=5.1234 (bcb_ptax), EUR=0.9234 (frankfurter)`.
- Ao final, log totals `{ days_processed, currencies_inserted, currencies_skipped }`.
- Exit 0 sucesso, exit 1 falha critica.

**Uso esperado:**
```bash
tsx scripts/fx-backfill.ts                    # 90 dias default
tsx scripts/fx-backfill.ts --days=30
tsx scripts/fx-backfill.ts --from=2026-01-01 --to=2026-04-30
```

**Criterio de aceitacao:**
- [ ] Script executavel via `tsx scripts/fx-backfill.ts`.
- [ ] Default 90 dias popula ~63 working days (BRL/EUR cada).
- [ ] Rerun do mesmo range loga `skipped: N` e `inserted: 0`.
- [ ] BCB sobrepoe ECB para BRL quando ambos disponiveis (BRL com source `bcb_ptax`).
- [ ] BCB ausente para um dia → ECB BRL preenchido com source `frankfurter`.
- [ ] Throttle 200ms presente entre calls (R5).
- [ ] Falha de network → script termina com exit 1, log estruturado.

**Paths arquivos:**
- `scripts/fx-backfill.ts` (novo)

---

### RF-09: Snapshot bankroll usa `getRatesForDate(snapshotDate)` [S]

**Descricao:** Modificar logica de calculo de `newAmountUsd` em snapshots `bankroll_snapshots` para usar rate do dia do snapshot, nao rate do momento da gravacao.

**Regras de negocio:**

Local de mudanca: `server/services/bankrollService.ts` (ou onde `bankroll_snapshots` eh inserido — auto-cooldown RF-2 e manual snapshot endpoint).

Antes (Sprint Bankroll-3):
```ts
const fxRates = await fxResolver.resolveExchangeRates(userId);
const consolidatedUSD = await getConsolidatedBalanceUSD(userId, fxRates);
```

Depois (FX-1):
```ts
const snapshotDate = (occurredAt ?? new Date()).toISOString().slice(0, 10);
const systemRatesForDate = await fxRatesPersistence.getRatesForDate(snapshotDate);
const userOverride = await getUserOverride(userId);
const ratesForSnapshot = mergeRates(FALLBACK_FX_RATES, systemRatesForDate, userOverride);
const consolidatedUSD = await getConsolidatedBalanceUSD(userId, ratesForSnapshot);
```

- Helper `mergeRates(fallback, system, userOverride)` retorna `Record<string, number>` com prioridades user > system > fallback.
- `wallets.exchangeRates` **NAO** entra no merge para snapshots novos (rates frescas do dia da gravacao). Wallets imutaveis sao usadas APENAS para snapshots historicos pre-FX-1 (sem mudanca retroativa).
- Snapshot row armazena `newAmount` calculado com essa rate. Coluna nova `fxRateSnapshot jsonb` opcional para auditabilidade (deferida — FX-2).

**Criterio de aceitacao:**
- [ ] Snapshot gravado em 2026-05-05 com BRL system = 5.10 → USD calculado com 5.10.
- [ ] Snapshot gravado em 2026-05-03 (domingo) usa rate da sexta 2026-05-01 (working day fallback de `getRatesForDate`).
- [ ] User com override BRL=5.20 → snapshot usa 5.20 (override precede system).
- [ ] System rates ausentes (DB vazio primeiro deploy) → fallback 5.0 usado, log warn.
- [ ] `wallets.exchangeRates` **nao** afeta snapshot novo (validar via test que muda wallet rate em runtime — snapshot nao-segue).
- [ ] Snapshots existentes (pre-FX-1) nao sao re-escritos.

**Paths arquivos:**
- `server/services/bankrollService.ts` (modificacao)
- (helper) `server/services/fx/mergeRates.ts` (novo, opcional)

---

### RF-10: Logging estruturado + telemetria [S]

**Descricao:** Cron + endpoints + adapters emitem logs estruturados consistentes para observabilidade.

**Regras de negocio:**

Formato canonico:
```
[fx/cron] runId=abc123 status=ok currencies_fetched=BRL,EUR currencies_failed= duration_ms=412 inserted=2 skipped=0
[fx/adapter] name=bcb_ptax status=ok latency_ms=187
[fx/adapter] name=frankfurter status=failed error="ETIMEDOUT" latency_ms=30000
[fx/persistence] op=upsertDailyRates date=2026-05-05 inserted=2 skipped=0
[fx/resolver] userId=USER-0001 source=system cache=miss
```

- `runId` gerado via `nanoid(10)` no comeco do cron run.
- Cada layer (adapter, persistence, resolver, cron top-level) tem seu prefixo.
- Falha total do cron → `console.error` com stack trace.
- Falha parcial (1 currency missing) → `console.warn` + status `'partial'`.
- Sucesso → `console.info`.

**Criterio de aceitacao:**
- [ ] Cron run sucesso emite 1 log `[fx/cron]` info-level com `status=ok`.
- [ ] BCB falha + frankfurter cobre BRL → 1 warn `[fx/adapter] bcb_ptax failed` + 1 info `[fx/cron] status=ok` (cross-fallback worked).
- [ ] Ambos providers falham → 1 error `[fx/cron] status=failed`.
- [ ] runId presente em todos os logs do mesmo run.
- [ ] Latencia per-adapter logada.
- [ ] Server NAO crasha em cenarios de falha (validar via test).

**Paths arquivos:**
- `server/jobs/refreshFxRates.ts` (logs)
- `server/services/fx/adapters/*.ts` (logs)
- `server/services/fx/fxRatesPersistence.ts` (logs)
- `server/services/fxResolver.ts` (log opcional cache hit/miss)

---

## Modelo de Dados

### DDL — `system_fx_rates`

```sql
-- migrations/0049_system_fx_rates.sql
CREATE TABLE IF NOT EXISTS system_fx_rates (
  date DATE NOT NULL,
  currency VARCHAR(8) NOT NULL,
  rate_per_usd NUMERIC(18, 8) NOT NULL,
  source VARCHAR(16) NOT NULL CHECK (source IN ('bcb_ptax', 'frankfurter', 'manual', 'fallback')),
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (date, currency)
);

CREATE INDEX IF NOT EXISTS idx_system_fx_rates_currency_date
  ON system_fx_rates (currency, date DESC);
```

**Campos:**
- `date` — data referencia da cotacao (ISO YYYY-MM-DD).
- `currency` — codigo ISO 4217 (`BRL`, `EUR`). USD nunca eh inserido.
- `rate_per_usd` — convencao QW-1 (ADR-033). Precisao 8 decimais, scale 18 digitos totais.
- `source` — origem do dado. Enum-like via CHECK constraint.
- `fetched_at` — timestamp de quando a row foi inserida (auditoria).

### Drizzle schema snippet

```ts
// shared/schema.ts (extensao)
import { pgTable, varchar, date, numeric, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

export const systemFxRates = pgTable(
  'system_fx_rates',
  {
    date: date('date').notNull(),
    currency: varchar('currency', { length: 8 }).notNull(),
    ratePerUsd: numeric('rate_per_usd', { precision: 18, scale: 8 }).notNull(),
    source: varchar('source', { length: 16 }).notNull(),
    fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.date, t.currency] }),
    currencyDateIdx: index('idx_system_fx_rates_currency_date').on(t.currency, t.date),
  }),
);

export const systemFxRatesInsertSchema = createInsertSchema(systemFxRates);
export const systemFxRatesSelectSchema = createSelectSchema(systemFxRates);

export type SystemFxRate = typeof systemFxRates.$inferSelect;
export type SystemFxRateInsert = typeof systemFxRates.$inferInsert;
export type FxSource = 'bcb_ptax' | 'frankfurter' | 'manual' | 'fallback';
```

### Tabelas afetadas (sem schema change)

- `users.exchangeRates` (jsonb) — comportamento preservado, agora vira override sobre `system_fx_rates`.
- `wallets.exchangeRates` (jsonb) — IMUTAVEL (ADR-034). Cascata compat para currencies que system nao cobre (CNY, GBP, USDT, BTC).
- `bankroll_snapshots` — sem schema change. Apenas mudanca de logica em `bankrollService` que calcula `newAmount` usando rate do dia do snapshot.

---

## Diagramas (placeholders para System-Architect)

System-Architect vai criar:

1. **Sequence diagram cron run** — `Docs/architecture/diagrams/fx-cron-sequence.mermaid`
   - Cron tick → BCB fetch → frankfurter fetch → upsert → invalidate caches.
2. **Sequence diagram cascata fxResolver** — `Docs/architecture/diagrams/fx-resolver-cascade.mermaid`
   - Request user → cache hit/miss → user override → system → wallets → fallback.
3. **Data model diagram** — atualizar `Docs/architecture/data-model.mermaid` adicionando `system_fx_rates` (sem FKs, tabela isolada).
4. **Snapshot flow diagram** — atualizar `Docs/architecture/bankroll-index.md` com nova logica de `getRatesForDate`.

---

## Testes (cenarios por RF)

### RF-01 schema migration
- [ ] Migration aplica sem erros.
- [ ] PK composta rejeita duplicata `(date, currency)`.
- [ ] CHECK constraint rejeita source invalido (`'foo'` → error).
- [ ] Index `idx_system_fx_rates_currency_date` criado.
- [ ] Drizzle types compilados sem erro.

### RF-02 adapters
- [ ] `frankfurterAdapter.fetchLatest(['BRL','EUR'])` parse fixture corretamente.
- [ ] `bcbPtaxAdapter.fetchLatestBrl()` parse OData fixture corretamente.
- [ ] HTTP 5xx → retorna `null` (latest) ou `[]` (timeseries) sem throw.
- [ ] Timeout 30s respeitado.
- [ ] User-Agent enviado.
- [ ] Weekend BCB → `null` graceful.
- [ ] Frankfurter timeseries 90d retorna ~63 working days.

### RF-03 persistence
- [ ] `upsertDailyRates` insere primeira vez, skip segunda.
- [ ] `getLatestSystemRates()` cache hit nao toca DB.
- [ ] `getRatesForDate('2026-05-03')` (domingo) retorna sexta `2026-05-01`.
- [ ] `getRateHistory('BRL', 30)` retorna 30 rows DESC.
- [ ] `invalidateLatestCache()` força re-fetch.
- [ ] `_resetCacheForTests()` zera Map.

### RF-04 cron pipeline
- [ ] Run completo BCB+frankfurter mockados → 2 inserts.
- [ ] BCB falha + frankfurter responde BRL → cross-fallback `frankfurter` source.
- [ ] frankfurter falha + BCB responde BRL → status `'partial'`, EUR ausente.
- [ ] Ambos falham → status `'failed'`, server up.
- [ ] Cache invalidate apos upsert.
- [ ] Re-run mesmo dia → idempotente.
- [ ] Concorrencia race → ON CONFLICT garante zero duplicatas.

### RF-05 fxResolver cascata
- [ ] User sem override + system populated → `source = 'system'`.
- [ ] User com override BRL → `source = 'user'` para BRL.
- [ ] System empty + wallet com BRL → `source = 'wallets'`.
- [ ] System empty + wallet empty → `source = 'fallback'`.
- [ ] Wallet legada CNY=7.2 + system BRL/EUR → `rates.CNY` preservado.
- [ ] `convertBetween('BRL', 'EUR')` usa rates corretos.
- [ ] Cache 5min preservado.
- [ ] Cron invalidate força re-fetch.
- [ ] `FALLBACK_FX_RATES` reduzido para `{USD, BRL, EUR}`.

### RF-06 endpoints admin
- [ ] `POST /refresh` 401 sem auth.
- [ ] `POST /refresh` 403 sem permission.
- [ ] `POST /refresh` 200 admin + metrics.
- [ ] `GET /latest` retorna BRL+EUR.
- [ ] `GET /history?currency=BRL&days=30` paginado.
- [ ] `GET /history?days=400` validation error.
- [ ] Rate limit 11a chamada/min → 429.

### RF-07 UI panel
- [ ] Render BRL/EUR com badge `sistema` quando user sem override.
- [ ] Render badge `manual` quando user override existe.
- [ ] Click "Editar" abre dialog com inputs preenchidos.
- [ ] Save dialog atualiza + invalidate cache.
- [ ] Reset zera `users.exchangeRates` + badge muda.
- [ ] Loading state com skeleton.
- [ ] Error fetch retorna fallback values.
- [ ] Endpoint `/api/fx/current` autenticado.

### RF-08 backfill
- [ ] `tsx scripts/fx-backfill.ts` default 90d roda sem erro.
- [ ] Rerun mesmo range → `skipped` log.
- [ ] BCB sobrepoe ECB para BRL.
- [ ] BCB ausente um dia → ECB BRL fallback.
- [ ] Throttle 200ms entre calls.
- [ ] Network failure → exit 1.

### RF-09 snapshot bankroll
- [ ] Snapshot data X usa rate `system_fx_rates` data X.
- [ ] Snapshot domingo usa rate sexta-feira.
- [ ] User override precede system rate.
- [ ] System empty → fallback usado, log warn.
- [ ] `wallets.exchangeRates` nao afeta snapshot novo.
- [ ] Snapshot pre-FX-1 nao re-escrito.

### RF-10 logging
- [ ] runId presente em todos os logs do mesmo run.
- [ ] Status `ok` info-level, `partial` warn, `failed` error.
- [ ] Latencia per-adapter logada.
- [ ] Stack trace em falhas criticas.

### Integration / E2E
- [ ] End-to-end: cron tick → DB → fxResolver → snapshot → response API consistente.
- [ ] Backfill 90d + cron daily run = continuidade temporal sem gaps (excepto weekends).

---

## Migration Plan

**Fase 0 — pre-deploy (atual):**
- Spec aprovada.
- ADRs 121-123 criados pelo system-architect.
- Pipeline: spec → architect → test-writer → implementer → reviewer.

**Fase 1 — flip dev (local):**
1. Aplicar migration `0049_system_fx_rates.sql` via `db:push` em DB local.
2. Verificar `\d system_fx_rates` em psql.
3. Rodar `tsx scripts/fx-backfill.ts --days=90` para popular historico.
4. Validar `SELECT COUNT(*) FROM system_fx_rates GROUP BY currency` retorna ~63 BRL + ~63 EUR.
5. Trigger manual `POST /api/admin/fx/refresh` para today.
6. Validar `GET /api/admin/fx/latest` retorna BRL+EUR com source correto.
7. Boot server normal — cron registrado em `registerAllJobs()`.
8. Aguardar cron 17:00 UTC OR forcar via endpoint.

**Fase 2 — QA founder (manual):**
- Abrir Settings → ver painel `FxRatesPanel` com rates corretos + badge `sistema`.
- Editar manualmente → badge muda para `manual` → reset → volta para `sistema`.
- Inserir snapshot manual via endpoint, validar `newAmountUsd` calculado com rate do dia.

**Fase 3 — flip prod (apos aprovacao):**
- Deploy via pipeline normal (founder controla).
- Aplicar migration em prod via `db:push`.
- Rodar `fx-backfill --days=90` em prod.
- Cron arma automaticamente no boot.
- Aguardar primeira run automatica 17:00 UTC.
- Monitor logs `[fx/cron]` durante 14 dias.

**Fase 4 — observacao (14 dias):**
- Metric chave: `system_fx_rates` row count cresce 1 BRL + 1 EUR / working day.
- Falhas consecutivas → alerta manual via inspecao de logs.

---

## Riscos + Mitigacoes

| ID | Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|---|
| **R1** | PTAX/ECB sem cotacao fim de semana → cron roda sem inserir row | Alta | Baixo | `ON CONFLICT DO NOTHING` + status `'partial'` log info. `getRatesForDate` faz lookup descending para working day anterior. Comportamento esperado. |
| **R2** | Tabela vazia no primeiro deploy de prod → primeira request hit `fallback` | Alta | Baixo | Backfill script roda ANTES do server subir em deploy script. Alternativa: first-request blocking fetch live (deferido — script eh suficiente). |
| **R3** | Cache `fxResolver` 5min serve stale apos cron escrever | Media | Medio | `invalidateCache()` global chamado pelo cron pos-upsert. Garante que proxima request user pega rate fresca. |
| **R4** | Users com override antigo continuam errados ate resetarem manualmente | Media | Medio | UI mostra badge `manual` claramente + botao "Resetar para taxas do sistema" 1-click. Alerta drift > 5% deferido para FX-2. |
| **R5** | frankfurter rate-limit soft em backfill 90d (~180 calls em loop) | Baixa | Baixo | `await sleep(200)` entre calls reduz para ~36s total. frankfurter.dev nao tem rate-limit publicado mas politeness UA. |
| **R6** | BCB OData verbose, schema fragil, mudanca silenciosa | Media | Medio | Fixture-based unit test (`tests/fixtures/fx/bcb-ptax-sample.json`) reproduz parse exato. Smoke integration test contra API real em CI weekly run. Mudanca silenciosa → fixture nao bate, test falha, fix imediato. |
| **R7** | Migration cria tabela vazia em prod, primeira request fxResolver pega `fallback` ate cron rodar (4-24h gap) | Alta | Baixo | Backfill no deploy resolve. Sem deploy: cron 17:00 UTC popula em ate 1 dia. Acceptable degradation. |

---

## ADRs Previstos

System-Architect cria os seguintes ADRs antes do test-writer:

- **ADR-121** — `system_fx_rates` tabela global vs per-user. Justifica decisao D1 (rates globais com override per-user via `users.exchangeRates`). Trade-offs vs alternativa per-user-only.
- **ADR-122** — Multi-source fallback chain BCB PTAX (BRL primary) + frankfurter (EUR primary, BRL fallback). Justifica decisao D9. Documenta cross-fallback semantica + comportamento weekend.
- **ADR-123** — Cron 1x/dia 17:00 UTC + idempotencia `ON CONFLICT DO NOTHING`. Justifica decisao D2 e D10. Discute alternativas (intraday updates, multi-tick) e por que ficaram fora.

ADR adicional opcional:
- **ADR-124** (deferido) — Crypto live rate via CoinGecko (Sprint FX-3). Apenas placeholder neste sprint.

---

## Pre-requisitos / Dependencias

- **DB:** PostgreSQL 16 local ou Neon prod. Capacidade de `db:push`.
- **Env vars obrigatorias:** nenhuma nova. APIs publicas free (frankfurter, BCB) sem auth.
- **Env vars opcionais:** `FX_CRON_DISABLED=true` para desabilitar cron em ambientes de teste/CI sem internet.
- **Dependencias npm:** nenhuma nova obrigatoria. `node-cron` ja existe (Sprint News-1+). `nanoid` ja existe. Implementer pode considerar `p-throttle` para `sleep(200)` se quiser, ou usar `setTimeout` puro.
- **Pipeline:** spec aprovada → system-architect cria ADRs 121-123 + diagramas → test-writer red phase → implementer green phase → reviewer.

---

## Fora de Escopo (Deferred)

Itens explicitamente NAO cobertos:

- **Currencies CNY, GBP, USDT, BTC:** wallets legadas continuam via cascata compat.
- **Crypto live rate (USDT, BTC):** Sprint FX-3.
- **Alerta drift > 5% user override vs system:** Sprint FX-2.
- **Multi-source consensus (3+ providers):** Sprint FX-2.
- **Intraday updates / ticks:** decidido fora (1x/dia eh suficiente para bankroll poker).
- **Forecasting / hedging:** zero analytics preditiva.
- **`bankroll_snapshots.fx_rate_snapshot jsonb` para auditabilidade:** Sprint FX-2 (deferido).
- **Refactor visual completo de Settings page:** apenas adicionar painel.
- **Mudanca em `wallets.exchangeRates` imutabilidade:** ADR-034 mantido.
- **Per-user rate-limit no endpoint admin:** rate-limit global suficiente.
- **Dashboard visual de fx history (chart):** logs estruturados + endpoint history bastam para v1.
- **Webhook / push notification para drift alerts:** deferido.

---

## Notas de Implementacao (sugestoes nao-vinculantes)

- **Lib HTTP:** `fetch` global do Node 20 eh suficiente. Sem `axios`.
- **Lib RSS / parser:** nao aplicavel — APIs sao JSON puro.
- **Mock providers em testes:** `vi.spyOn(global, 'fetch')` + fixtures JSON. Capturar 1 response real de cada provider e commitar.
- **Concurrency primitive:** cron faz fetch sequencial (BRL primeiro, EUR depois) — paralelizar via `Promise.allSettled` se latencia incomodar (improvavel — total < 1s).
- **`runId`:** `nanoid(10)` chars suficiente.
- **TZ note:** Brasil aboliu DST em 2019. America/Sao_Paulo === UTC-3 ano todo. `0 0 17 * * *` UTC === `14:00 SP` sempre.
- **Permission `admin:fx`:** verificar `shared/permissions.ts` antes — se ja existir slot `admin:*` reusar pattern. Se nao existir, criar registro novo + atualizar middleware `requirePermission`.

---

## Pipeline Pos-Spec

1. **System-Architect** — cria ADRs 121-123 + 4 diagramas Mermaid + atualiza `Docs/architecture/data-model.mermaid`.
2. **Test-Writer** — red phase: testes para RF-01 a RF-10 cobrindo todos os criterios + cenarios listados acima. Sem implementacao.
3. **Implementer** — green phase: implementa adapters + persistence + cron + resolver update + endpoints + UI panel + script backfill. Faz testes passarem sem modificar testes.
4. **Reviewer** — auditoria: bugs, seguranca (admin permission gating, rate-limit), performance (cache invalidation correto), observabilidade (logs estruturados), zero regressao em snapshots existentes.
5. **Deployer** — apenas se founder pedir explicitamente. Migration em prod + backfill + monitor primeiros 14 dias.

---

## Checklist Pre-Apresentacao

- [x] Cada RF tem criterios de aceitacao verificaveis.
- [x] Cenarios de teste cobrem happy path, fallback chain, dedupe weekend, edge cases.
- [x] Secao "Fora de Escopo" lista 12 itens diferidos.
- [x] Sem ambiguidade — cada regra tem interpretacao unica.
- [x] Spec independente — test-writer pode gerar testes sem perguntas adicionais.
- [x] Endpoints listados (3 admin + 1 read user-level + cron interno).
- [x] Modelos de dados documentados com DDL + Drizzle snippet + indices.
- [x] Estimativas por RF (S/M/XL) — 10 RFs (5×S + 4×M + 1×L). Estimativa total: ~5-7 dias dev.
- [x] Riscos + mitigacoes mapeados (7 riscos R1-R7).
- [x] Plano de rollout 4 fases.
- [x] Pre-requisitos + dependencias claros.
- [x] D1-D12 documentadas com justificativa.
- [x] ADRs previstos listados (121-123 obrigatorios + 124 deferido).
- [x] Pipeline pos-spec definido.
