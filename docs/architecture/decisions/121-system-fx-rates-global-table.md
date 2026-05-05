# ADR-121: Tabela global `system_fx_rates` com override per-user opcional

## Status

Aceito

## Data

2026-05-05

## Contexto

A Sprint FX-1 (`Docs/specs/sprint-fx-1.md`) substitui o regime atual de FX rates manuais (`FALLBACK_FX_RATES` constants + `users.exchangeRates` editado a mao via Settings) por um pipeline diario automatico que persiste cotacoes oficiais BRL/EUR. Isso exige uma decisao arquitetural fundamental: **onde armazenar as rates fetched pelo cron**.

A cascata atual definida em ADR-061 ja resolve FX por user via `users.exchangeRates` (jsonb override) -> `wallets.exchangeRates` (jsonb compat ADR-034) -> `FALLBACK_FX_RATES` (constants). A pergunta nova eh: rates fetched pelo cron sao **globais** (1 row por currency por dia, mesma para todos os users) ou **per-user** (1 row por user por currency por dia, escrita em `users.exchangeRates`)?

Forcas em jogo:

- **Custo de API:** providers (BCB PTAX, frankfurter) sao gratuitos mas tem politeness. 1 fetch global / dia escala em O(1) com user count. Per-user-only via cron iterando users escala em O(N) requests, ate que o iterador agrupe e use 1 fetch — em qualquer caso, o cron global eh mais simples.
- **Audit trail:** `users.exchangeRates` eh um jsonb mutavel. Cada update sobrescreve estado anterior — historico de rates **se perde**. Snapshots `bankroll_snapshots` precisam ler rate exata da **data do snapshot** (D3 da spec) para reconciliacao retroativa correta. Sem audit nativo, isso eh impossivel.
- **Override per-user:** alguns power users querem rate diferente da oficial (ex: rate da corretora especifica que transacionam). UI Settings ja permite editar `users.exchangeRates`. Esse comportamento deve continuar funcionando.
- **Snapshots historicos:** Sprint FX-1 muda `bankrollService.createSnapshot` para usar `getRatesForDate(snapshotDate)`. Sem tabela auditavel, nao ha de onde ler rate de data passada.
- **Schema simples:** PK composta `(date, currency)` torna upsert idempotente (`ON CONFLICT DO NOTHING`) e impede duplicatas naturais.

Pre-requisitos satisfeitos:

- ADR-033 estabelece convencao QW-1 (`rate per USD = unidades nativas por 1 USD`).
- ADR-034 estabelece imutabilidade de `wallets.exchangeRates`.
- ADR-061 estabelece servico unificado `fxResolver` com cache 5min e cascata explicita.

## Decisao

Criar **tabela global `system_fx_rates`** com PK composta `(date, currency)`, populada pelo cron diario (ADR-123), e **estender a cascata do `fxResolver`** (ADR-061) para incluir camada `system` entre `users.exchangeRates` (override) e `wallets.exchangeRates` (compat). `users.exchangeRates` permanece **opcional** como override per-user — quando preenchido, tem precedencia; quando vazio (caso default), system rates sao servidas para todos os users.

Schema:

```sql
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

Nova ordem da cascata (substitui ADR-061 step 1):

1. `users.exchangeRates` (override per-user) — se existe e tem currency, usa.
2. **`system_fx_rates` (latest) — NOVO** — fetched via `fxRatesPersistence.getLatestSystemRates()`.
3. `wallets.exchangeRates` (compat ADR-034) — para currencies que system nao tem (CNY, GBP, USDT, BTC).
4. `FALLBACK_FX_RATES` (constants reduzido para `{USD, BRL, EUR}`).

`source` field do `FxRates` extende para `'user' | 'system' | 'wallets' | 'fallback' | 'mixed'`.

UI Settings ganha botao "Resetar para taxas do sistema" que faz `PUT /api/user-settings { exchangeRates: {} }` zerando override e revertendo para system.

Snapshots (`bankroll_snapshots`) passam a ler rate da data do snapshot via `fxRatesPersistence.getRatesForDate(snapshotDate)` em vez do `fxResolver.resolveExchangeRates()` corrente — preserva auditabilidade temporal mesmo quando rates do sistema mudam.

`wallets.exchangeRates` permanece **imutavel** (ADR-034 mantido) — usada apenas para snapshots pre-FX-1 e currencies fora do escopo system (CNY, GBP, USDT, BTC).

## Opcoes Consideradas

### Opcao 1 (escolhida): Tabela global + override per-user

- **Pros:**
  - 1 fetch global / dia / currency: cron executa 2 requests fixos (BCB PTAX + frankfurter), independentemente de quantidade de users.
  - Audit trail nativo: cada row eh imutavel pos-insert (`ON CONFLICT DO NOTHING`). Historico completo preservado.
  - Snapshots historicos corretos: `getRatesForDate('2026-04-15')` busca rate exata daquela data.
  - Override per-user mantido: power users continuam podendo editar via Settings.
  - Reset 1-click: botao "Resetar para taxas do sistema" zera `users.exchangeRates`, system fica visivel.
  - Schema simples: 5 colunas, PK composta, 1 index.
  - Compatibilidade total com cascata existente (ADR-061): `system` plugado entre `user` e `wallets`.
  - Wallets legadas com currencies fora do escopo (CNY, GBP, USDT, BTC) continuam funcionando via cascade compat.
  - Backfill 90 dias trivial: `fxRatesPersistence.upsertDailyRates(date, rows)` em loop sobre timeseries.

- **Contras:**
  - Tabela nova exige migration (`migrations/0049_system_fx_rates.sql`) e schema Drizzle update (`shared/schema.ts`). Custo unico, baixa complexidade.
  - Uma camada a mais na cascata aumenta contagem de queries por resolve. Mitigado pelo cache memoria 5min de ADR-061 + cache adicional em `fxRatesPersistence.getLatestSystemRates()` (5min).

### Opcao 2: Per-user puro com cron iterando users

- **Pros:**
  - Sem tabela nova. Reusa `users.exchangeRates` (jsonb).
  - Cascata atual (ADR-061) nao muda.

- **Contras:**
  - **Cron itera todos os users e escreve `users.exchangeRates`** — escala em O(N). Para 1000 users, sao 1000 writes / dia.
  - **Override per-user destruido pelo cron**: cron sobrescreve, user perde a edicao manual. Solucao seria diferenciar "user override" vs "system fetched" via flag — vira poluicao do schema jsonb.
  - **Sem audit trail de rates historicos**: `users.exchangeRates` jsonb mutavel, snapshots de data passada nao podem reconciliar.
  - **Snapshots historicos errados**: nao ha de onde ler rate de 2026-04-15 corretamente.
  - **Backfill caro**: backfill 90 dias requer N users * 90 dias writes em jsonb.
  - **Rejeitada:** O(N) writes + perda de override + falta de audit eh arquitetura inadequada para o caso de uso.

### Opcao 3: Memoria sem persistir (cron escreve em variavel module-level)

- **Pros:**
  - Trivial. Sem schema novo, sem migration.
  - Performance maxima.

- **Contras:**
  - **Server restart = rates perdidos** ate proximo cron run (4-24h gap).
  - **Sem audit trail** (estado em memoria).
  - **Sem snapshots historicos** (requisito D3 da spec — fundamental).
  - **Multi-instance impossivel** se Grindfy escalar (cada instance teria estado diferente).
  - **Rejeitada:** durabilidade zero + requisito audit nao atendido.

### Opcao 4: Materialized view derivada de tabela source

- **Pros:**
  - Persistido + indexado.
  - Refresh automatizado via `REFRESH MATERIALIZED VIEW`.

- **Contras:**
  - **Complexidade desproporcional**: tabela source ainda precisa existir (mesma que Opcao 1). Materialized view eh layer extra sem ganho funcional.
  - **REFRESH eh pesado** em DBs com muitas rows (nao eh o caso, mas overhead de operacao desnecessaria).
  - **Drift de schema vs Drizzle** (drizzle-kit nao gerencia materialized views nativamente bem).
  - **Rejeitada:** overkill para 2 currencies × 1 row por dia.

## Consequencias

### Positivas

- **1 fetch / dia / currency**: cron executa 2 requests independentemente de quantidade de users.
- **Audit trail completo**: cada row imutavel pos-insert. Historico preservado.
- **Snapshots corretos**: `getRatesForDate` retorna rate exata da data do snapshot.
- **Override per-user preservado**: cascata respeita user > system > wallets > fallback.
- **Reset 1-click reversivel**: botao "Resetar para taxas do sistema" zera override.
- **Wallets legadas preservadas**: cascade compat para CNY, GBP, USDT, BTC continua funcionando via `wallets.exchangeRates`.
- **Backfill simples**: timeseries 90 dias popula tabela em loop.
- **Cache duplo**: `fxResolver` cache user-level (5min) + `fxRatesPersistence` cache system-level (5min) reduzem queries duplicadas em hot path.
- **Convencao QW-1 mantida** (ADR-033).
- **Compatibilidade ADR-034**: `wallets.exchangeRates` permanece imutavel.

### Negativas

- **Tabela nova exige migration + Drizzle update**: custo unico, baixa complexidade.
- **Uma camada extra na cascata**: ligeiramente mais queries por resolve em cache miss. Mitigado por cache 5min duplo.
- **Cache invalidation deve ser coordenada**: cron pos-upsert chama `fxRatesPersistence.invalidateLatestCache()` + `fxResolver.invalidateCache()` global. Garantia de freshness em ate 5min.
- **`source` field cresce de 4 para 5 valores possiveis**: clientes que parseiam o enum precisam atualizar typings (`'user' | 'system' | 'wallets' | 'fallback' | 'mixed'`).

### Neutras

- **Currencies suportadas v1**: USD, BRL, EUR. CNY, GBP, USDT, BTC permanecem em wallets legadas via cascade compat. Sprint FX-2/FX-3 cobrirao expansao.
- **Tabela cresce 2 rows / dia**: ~63 working days * 2 currencies = 126 rows / 3 meses. Em 10 anos ~4200 rows. Negligible.
- **`source = 'manual'` reservado para POST admin futuro** que injete row arbitraria. Nao usado v1.
- **`source = 'fallback'` reservado para deploy inicial sem backfill** — implementer pode optar por nao usar essa label (mais limpa eh nao inserir row e deixar resolver cair em FALLBACK_FX_RATES constants). Nao usado v1.

## Confianca

**Alta.** Padrao "tabela global imutavel com override per-user" eh estabelecido na industria (ex: `currency_rates` em ERP systems). Schema simples, cascata explicita ja existe (ADR-061), audit trail nativo via PK composta, override 1-click reversivel via UI. Risco principal (cache stale apos cron) tem mitigacao concreta (invalidate global pos-upsert + TTL 5min). Compatibilidade total com decisoes anteriores (ADR-033/034/061).

## Referencias

- Spec: `Docs/specs/sprint-fx-1.md` (RF-01, D1, D3, D6, D7)
- ADR-033: FX rate convention (units per USD)
- ADR-034: Multi-wallet com immutable FX
- ADR-061: `fxResolver` unificado (cascata users > wallets > constants)
- ADR-122: Multi-source fallback chain BCB PTAX + frankfurter
- ADR-123: Cron diario 17:00 UTC + idempotencia ON CONFLICT DO NOTHING
- Schema: `shared/schema.ts` (extensao `systemFxRates`)
- Service: `server/services/fx/fxRatesPersistence.ts` (novo)
- Migration: `migrations/0049_system_fx_rates.sql` (novo)
- Diagramas: `Docs/architecture/diagrams/fx-1-data-model.mermaid`, `fx-1-resolver-cascade.mermaid`, `fx-1-snapshot-flow.mermaid`
