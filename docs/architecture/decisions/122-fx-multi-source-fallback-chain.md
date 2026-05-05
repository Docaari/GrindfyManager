# ADR-122: Multi-source fallback chain BCB PTAX (BRL primary) + frankfurter (EUR primary, BRL fallback)

## Status

Aceito

## Data

2026-05-05

## Contexto

Sprint FX-1 (`Docs/specs/sprint-fx-1.md`) busca cotacoes oficiais USD/BRL e USD/EUR diariamente para popular `system_fx_rates` (ADR-121). A pergunta arquitetural eh: **quais providers usar e em que ordem de fallback?**.

O par USD/BRL tem fontes oficiais brasileiras distintas das fontes europeias. A escolha primary/fallback impacta:

- **Auditabilidade fiscal:** Receita Federal e contadores brasileiros consideram **PTAX (Banco Central do Brasil)** a cotacao oficial canonica para conversao USD/BRL. ECB (European Central Bank) publica rate USD/BRL via mecanismo proprio que tipicamente diverge da PTAX em 0.5%-1.5% (margem de cambio + lag de publicacao).
- **Cobertura:** PTAX nao publica USD/EUR direto (apenas pares com BRL). ECB cobre USD/EUR e USD/BRL nativamente.
- **Confiabilidade:** ambas APIs sao gratuitas, sem auth, com SLA implicito (sem garantia formal). PTAX usa OData verbose que eh fragil a parse changes; frankfurter usa JSON simples e estavel.
- **Cross-fallback:** se BCB falhar para BRL, frankfurter pode cobrir via `base=USD&symbols=BRL`. Se frankfurter falhar para EUR, **nao ha fallback** — BCB nao publica USD/EUR.

Forcas em jogo:

- **Auditabilidade brasileira**: PTAX eh padrao oficial. Player BR profissional fechando declaracao de IR usa PTAX. Snapshots de bankroll devem refletir PTAX para reconciliacao com extrato brasileiro.
- **Volume de jogadores BR**: Grindfy MTT eh majoritariamente BR (~80% dos users). Impacta ROI calculos consolidados em USD: 1.0% de drift na rate = 1.0% de erro em metric de banca.
- **Robustez do pipeline**: weekend (sabado/domingo) + feriados nao publicam. Cron precisa lidar gracefully.
- **Custo dev**: parser PTAX OData fragil — exige fixture-based unit test. frankfurter JSON eh trivial.
- **Cross-fallback assimetrico**: BRL pode cair em frankfurter; EUR nao pode cair em BCB (provider gap).

Pre-requisitos satisfeitos:

- ADR-121 cria tabela `system_fx_rates` com coluna `source` enum-like (`'bcb_ptax' | 'frankfurter' | 'manual' | 'fallback'`) — qualquer fonte pode ser persistida com label apropriado.
- ADR-033 define convencao QW-1 (units per USD).
- Spec D9 confirma: BCB para BRL, frankfurter para EUR + cross-fallback BRL.

## Decisao

Adotar **chain assimetrica de providers**: BCB PTAX como primary BRL (auditabilidade fiscal brasileira), frankfurter como primary EUR (ECB coverage), com cross-fallback **apenas em direcao BCB→frankfurter** (BCB falha em BRL → frankfurter cobre via `base=USD&symbols=BRL`). Direcao inversa (frankfurter→BCB para EUR) **nao existe** porque BCB nao publica USD/EUR.

Pipeline de fetch no cron:

1. `bcbPtaxAdapter.fetchLatestBrl()` — primary BRL.
   - Sucesso → row `{ currency: 'BRL', source: 'bcb_ptax', ... }`.
   - Falha (timeout, 5xx, parse error, weekend null) → fallback step 2.
2. `frankfurterAdapter.fetchLatest(['BRL'])` (apenas se step 1 falhou).
   - Sucesso → row `{ currency: 'BRL', source: 'frankfurter', ... }`.
   - Falha → BRL ausente neste run, log warn `[fx/cron] BRL providers exhausted`.
3. `frankfurterAdapter.fetchLatest(['EUR'])` — primary EUR (sempre executado, paralelo com step 1+2).
   - Sucesso → row `{ currency: 'EUR', source: 'frankfurter', ... }`.
   - Falha → EUR ausente, log warn `[fx/cron] EUR provider down — keeping previous day`. **Sem cross-fallback.**

Adapters isolados em `server/services/fx/adapters/`:

- `bcbPtaxAdapter.ts`: chama OData PTAX (`https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/...`), usa `cotacaoVenda` (rate de venda — mais conservador para player convertendo banca), retorna `null` em qualquer falha (nunca throw).
- `frankfurterAdapter.ts`: chama `https://api.frankfurter.dev/v1/latest?base=USD&symbols=...`, parse JSON simples, retorna `[]` em qualquer falha (nunca throw).
- Timeout 30s em ambos. User-Agent `GrindfyFxBot/1.0 (+https://grindfy.com)` para politeness.

`source` field do row persistido reflete provider efetivo:

- BRL com BCB sucesso → `source = 'bcb_ptax'`.
- BRL com BCB falha + frankfurter sucesso → `source = 'frankfurter'`.
- EUR sempre com frankfurter sucesso → `source = 'frankfurter'`.

Status do run reportado em telemetria:

- `'ok'`: ambas currencies persistidas.
- `'partial'`: 1 currency persistida, 1 ausente (qualquer combinacao).
- `'failed'`: zero currencies persistidas.

Weekend handling: PTAX/ECB nao publicam sabado/domingo. Cron roda mas adapters retornam vazios — `ON CONFLICT DO NOTHING` (ADR-123) evita duplicar last business day rate. `getRatesForDate(weekendDate)` em `fxRatesPersistence` faz lookup descending para working day anterior (LATERAL `WHERE date <= ? ORDER BY date DESC LIMIT 1` por currency).

Currencies fora do escopo v1 (CNY, GBP, USDT, BTC):

- Continuam funcionando via cascade compat `wallets.exchangeRates` (ADR-034) ou `FALLBACK_FX_RATES` constants.
- Sprint FX-2 expandira frankfurter para mais symbols (`?symbols=BRL,EUR,GBP,CNY`).
- Sprint FX-3 cobrira crypto via CoinGecko ou similar.

## Opcoes Consideradas

### Opcao 1 (escolhida): BCB primary BRL + frankfurter primary EUR + cross-fallback assimetrico

- **Pros:**
  - **Auditabilidade fiscal brasileira**: PTAX eh padrao oficial. Player BR profissional reconcilia com declaracao IR.
  - **Robustez**: BCB falha em BRL → frankfurter cobre. Cross-fallback transparente, source tracking via coluna `source`.
  - **Cobertura completa**: EUR via ECB (frankfurter) + BRL via PTAX/ECB.
  - **Custo zero**: ambas APIs gratuitas, sem auth, sem rate-limit publicado.
  - **Adapters isolados**: parse de cada provider em modulo dedicado, fixture-based tests garantem deteccao de schema changes.
  - **`source` per-row**: telemetria + UI podem mostrar origem da rate.

- **Contras:**
  - **Cross-fallback assimetrico nao cobre EUR**: se frankfurter falhar para EUR, **nao ha alternativa**. EUR fica stale ate proximo run. Mitigado por: `getRatesForDate` retorna ultimo working day OK; `FALLBACK_FX_RATES.EUR = 0.93` em ultima instancia.
  - **PTAX OData parse fragil**: OData eh verbose, schema pode mudar. Mitigado por: fixture commitada em `tests/fixtures/fx/bcb-ptax-sample.json`, smoke test em CI weekly.
  - **Custo dev por adapter**: 2 adapters dedicados em vez de 1 (frankfurter cobriria ambos). Custo unico, ROI alto.

### Opcao 2: frankfurter only (cobre BRL via ECB)

- **Pros:**
  - **Simplicidade maxima**: 1 adapter, 1 endpoint, 1 fixture. ~30% menos codigo.
  - **JSON simples**: parse trivial.

- **Contras:**
  - **ECB rate USD/BRL diverge tipicamente 0.5%-1.5% da PTAX**. Em volume de bankroll de player BR profissional ($1k-$50k+), 0.5% = $5-$250 erro de reconciliacao. **Inaceitavel** para users que reconciliam com declaracao IR.
  - **Sem auditabilidade fiscal brasileira**: ECB nao eh referencia para Receita Federal. Player BR teria 2 cotacoes diferentes (Grindfy ECB vs IR PTAX) e teria que ajustar manualmente.
  - **Single point of failure**: frankfurter cair = todas currencies perdidas. Sem redundancia.
  - **Rejeitada:** auditabilidade brasileira eh requisito hard para audience principal (~80% BR).

### Opcao 3: openexchangerates (provider pago)

- **Pros:**
  - **SLA formal** (paid tier).
  - **170+ currencies cobertas**: futuro-proof para CNY, GBP, USDT, BTC.
  - **JSON simples**: parse trivial.

- **Contras:**
  - **Custo $12-$97/mes** dependendo de tier. Sprint FX-1 nao monetiza diretamente — custo nao se justifica.
  - **API key obrigatoria**: ENV var nova, gestao de secret, risco de leak.
  - **Cobertura BRL via mercado generalizado, nao PTAX**: mesmo problema de auditabilidade fiscal da Opcao 2.
  - **Dependencia de provider unico**: lock-in.
  - **Rejeitada:** custo desproporcional + auditabilidade BR mesma issue.

### Opcao 4: ECB direct XML feed

- **Pros:**
  - **Fonte oficial primaria** ECB (sem intermediario frankfurter).
  - **Free + sem rate-limit**.

- **Contras:**
  - **XML parse mais pesado** que JSON (lib `xml2js` ou `fast-xml-parser`).
  - **Schema fragil**: XML namespace handling exige cuidado.
  - **frankfurter eh wrapper estavel sobre ECB** (mesma fonte de dados): zero ganho funcional, custo dev maior.
  - **Mesma issue fiscal BR**: ECB nao eh PTAX.
  - **Rejeitada:** frankfurter cobre o caso melhor (JSON + URL simples).

### Opcao 5: BCB only (sem frankfurter)

- **Pros:**
  - **Auditabilidade fiscal BR maxima** (apenas PTAX, fonte oficial).

- **Contras:**
  - **Sem cobertura EUR**: PTAX nao publica USD/EUR direto. Players EUR semi-pro Europa ficariam descobertos.
  - **PTAX OData fragil**: single point of failure mais grave.
  - **Sem cross-fallback**: BCB cair = BRL ausente.
  - **Rejeitada:** EUR coverage eh requisito (player europeu existe).

## Consequencias

### Positivas

- **Auditabilidade fiscal brasileira preservada**: PTAX eh source primary BRL, reconciliacao com IR/contador funciona.
- **EUR coverage**: ECB (via frankfurter) cobre USD/EUR adequadamente.
- **Cross-fallback robusto BRL**: BCB falha → frankfurter cobre. Source tracking transparente (`source = 'frankfurter'` indica fallback path).
- **Custo zero**: ambas APIs gratuitas.
- **Adapters isolados**: testabilidade alta via fixtures dedicadas.
- **`source` per-row**: telemetria, UI, debugging tem visibilidade total.
- **Resilience**: 1 provider down nao quebra cron (status `'partial'` + log).
- **Compatibilidade total com ADR-121**: tabela `system_fx_rates` aceita ambos providers via coluna `source`.

### Negativas

- **EUR sem cross-fallback**: frankfurter falha = EUR ausente neste run. Mitigado por: `getRatesForDate` lookup descending pega ultimo working day OK; `FALLBACK_FX_RATES.EUR = 0.93` em ultima instancia. Aceitavel — EUR raramente sao players principais.
- **PTAX OData parse fragil**: schema pode mudar silenciosamente. Mitigado por: fixture commitada (`tests/fixtures/fx/bcb-ptax-sample.json`), smoke integration test contra API real em CI weekly run, log warn estruturado em parse failure permite fix rapido.
- **Dependencia 2 providers externos**: ambos podem cair. Mitigado por TTL 5min cache + `FALLBACK_FX_RATES` constants em ultima instancia.
- **Custo dev 2 adapters**: ~2 dias dev em vez de ~0.5 dia (frankfurter only). ROI alto: auditabilidade fiscal BR eh requisito.

### Neutras

- **Weekend/feriado**: PTAX/ECB nao publicam. Cron roda, adapters retornam vazios, `ON CONFLICT DO NOTHING` evita duplicacao. `getRatesForDate` lookup descending. Comportamento padrao da industria.
- **`cotacaoVenda` vs `cotacaoCompra` em PTAX**: usar `cotacaoVenda` (rate de venda) eh decisao explicita — mais conservador para player que esta convertendo banca em USD. Diff negligible (~0.1%) para a maioria dos cenarios.
- **User-Agent `GrindfyFxBot/1.0`**: politeness convention. APIs gratuitas nao cobram, mas UA identifica origem para abuse mitigation upstream.
- **Timeout 30s**: generous mas nao excessivo. Frankfurter responde tipicamente <500ms; BCB OData pode chegar a 2-3s; 30s cobre hiccups raros.
- **Currencies fora v1 (CNY, GBP, USDT, BTC)**: cascade compat ADR-034 cobre. Sprint FX-2/FX-3 expandira.

## Confianca

**Alta.** PTAX eh padrao fiscal BR consolidado ha decadas; frankfurter wrapper estavel sobre ECB usado em centenas de projetos. Cross-fallback assimetrico documentado e testavel. Adapters isolados via fixtures garantem deteccao de schema changes. Custo zero (free APIs). Risco residual (PTAX OData parse silencioso break) mitigado por smoke test CI weekly + log warn estruturado.

## Referencias

- Spec: `Docs/specs/sprint-fx-1.md` (RF-02, RF-04, D9, R6)
- ADR-033: FX rate convention (units per USD)
- ADR-121: Tabela global `system_fx_rates`
- ADR-123: Cron diario 17:00 UTC + idempotencia
- BCB PTAX docs: https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/
- frankfurter docs: https://www.frankfurter.dev/
- Adapters: `server/services/fx/adapters/{bcbPtaxAdapter,frankfurterAdapter,types}.ts` (novos)
- Fixtures: `tests/fixtures/fx/{bcb-ptax-sample,frankfurter-latest-sample,frankfurter-timeseries-sample}.json` (novas)
- Diagrama: `Docs/architecture/diagrams/fx-1-cron-sequence.mermaid`
