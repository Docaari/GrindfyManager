# ADR-054: PrimeDope como provider externo (interim) vs engine Monte Carlo nativo

## Status

Substituido por ADR-211 (engine Monte Carlo nativo — Sprint VR-1, 2026-05-25)

## Data

2026-04-28

## Contexto

Founder pediu (strategist Fase 1) capacidade de **avaliar a "qualidade" de uma grade
semanal antes do jogador rodar a sessao** — especificamente: variance simulation MTT
com EV / ROI / Standard Deviation / Risk of Ruin / Confidence Intervals e graficos
Histogram + Random Runs.

A pesquisa de mercado confirmou que **nenhum concorrente direto entrega isso integrado**:
- HRC (HoldemResources Calculator): ICM e push/fold; sem variance schedule.
- ICMIZER: ICM solver; sem variance schedule.
- SharkScope: tracker de leaderboard; sem variance scheduler.
- PokerTracker / Hand2Note: post-game tracking; nao prediz variance forward.

**PrimeDope** (`primedope.com/prime.php?p=tournament-variance-calculator`) domina o nicho
free desde 2014:
- **Endpoint JSON estavel** (capturado e validado em `scripts/primedope-simulate.ts`).
- **Sem auth, sem rate limit publicado.**
- **Comportamento estatistico validado** pela comunidade (Reddit /r/poker, 2p2 forums).
- **Output rico:** EV, ROI, SD, RoR, confidence intervals 70/95/99.7%, min bankroll por
  percentil, graficos PNG (histogram + random runs).

### Restricoes

- **Sem ToS publicado.** PrimeDope nao tem termos de uso publicos. Risco juridico baixo
  (ferramenta livre desde 2014, citada em foruns publicos sem contestacao), mas zero
  garantia formal.
- **URL ja foi trocada antes.** Existe pagina `/legacy-version/` indicando que migrou
  schema/URL ao menos uma vez. Risco de quebra silenciosa.
- **Sem SLA.** Latencia tipica observada: 2-4s. Pode variar.
- **PrimeDope so aceita USD.** Plataformas BRL/EUR/CNY exigem conversao FX upstream
  (RF-26 da spec).
- **Founder quer entrega em ate 3-4 semanas.** Sprint F4 escopo total ~105h
  (3.5 semanas com 1 dev FT).
- **Engine nativo Monte Carlo MTT custa estimado 8+ semanas.** Razoes:
  - PKO bounty math (variance acoplada bounty + prize pool).
  - Mystery bounty dist.
  - Satellites com tickets nao-monetarios.
  - Calibracao estatistica vs comunidade (matching vs PrimeDope/HRC para validar).
  - Geracao de PNGs (Histogram, Random Runs) com Canvas/SVG server-side.

### Forcas em jogo

- **Time-to-market.** Founder quer testar hipotese de produto (jogadores valorizam
  variance simulation antes de sessao?) **antes** de investir 8+ semanas em engine
  nativo.
- **Lock-in fraco.** Endpoint nao-versionado da PrimeDope cria risco de troca silenciosa,
  mas **dataset historico** acumulado em `primedope_runs` (resultados + inputs) serve
  como **regression test** quando engine nativo chegar — comparar output engine novo vs
  PrimeDope salvo em runs antigos.
- **Diferencial competitivo.** Mesmo que PrimeDope quebre, capability vira ja construida
  na UX (drawer, wizard, source badges, onboarding) — replacement do backend e trivial.

## Opcoes Consideradas

### Opcao A: PrimeDope como provider externo plugavel via `primedopeIntegration.ts` (ESCOLHIDA)

Service em `server/services/primedopeIntegration.ts` com interface clara:

```ts
async function runSimulation(input: SimulationInput): Promise<SimulationResult>
```

Comportamento:
1. Hash determinista do input (sha256 de payload pos-conversao FX).
2. Cache lookup `primedope_runs` (30min) — hit retorna `source: 'cache'`.
3. Cache miss → semaphore acquire (max 3 concurrent outbound) → fetch PrimeDope.
4. Sucesso: persiste em `primedope_runs` com `source='primedope'`.
5. Falha 5xx/timeout: lookup ultimo run < 24h mesmo `(userId, profileLetter, dayOfWeek)`
   → retorna `source: 'fallback-stale'`.
6. Falha 4xx: erro fatal, telemetria `upstream_4xx_schema_change` (alerta troca de schema).
7. Charts PNG re-hosted localmente em `uploads/primedope-charts/<hash>.png` via proxy
   `GET /api/primedope/chart/:hash`.

**Migracao futura para engine nativo (Sprint F5+):**
- Manter mesma interface `runSimulation`.
- Implementacao trocada para `nativeMonteCarloEngine.ts`.
- Frontend (PrimedopePanel, Wizard, Result) NAO muda.
- Tabela `primedope_runs` renomeada para `simulation_runs` (migration trivial) ou
  acomoda `source: 'native'`.

- **Pros:**
  - **Time-to-market 3-4 semanas** vs 8+ semanas nativo.
  - **Validacao de produto barata.** Se hipotese falha (jogadores nao usam), engine nativo
    nunca foi escrito.
  - **Dataset historico em `primedope_runs`** serve para regression testing do engine
    nativo futuro: rodar mesmo input no engine nativo, comparar output vs PrimeDope salvo.
  - **Interface plugavel.** `runSimulation()` permanece; backend pluggable em F5.
  - **Mitigacoes para risco de troca de schema documentadas:**
    - Cache 30min reduz frequencia de fetch.
    - Fallback stale 24h cobre janelas curtas de downtime.
    - Telemetria `primedope_simulation_error` com `errorType: 'upstream_4xx_schema_change'`
      alerta founder se PrimeDope mudar URL/schema.
    - CTA inline "Avise o time" no UI envia mailto pre-preenchido com hash + timestamp.
  - **Lock-in fraco.** Persistimos so resultado + input. Se PrimeDope sumir
    permanentemente, runs salvos continuam visiveis em UI; novos requests caem em fallback
    ate F5 entrar.
  - **Investimento vira fundacao para nativo.** UI / cache / persistencia / FX /
    telemetria sao codigo F5 reusa.

- **Contras:**
  - **Dependencia externa nao-versionada.** PrimeDope pode trocar URL sem aviso.
    Mitigacao: telemetria 4xx + fallback stale.
  - **Latencia mediana 2-4s** vs nativo provavel < 500ms. Aceitavel para use case
    "validacao pre-sessao" (nao real-time).
  - **PrimeDope so USD.** Conversao FX adicionada upstream (RF-26 da spec) com fallback
    constante.
  - **Atribuicao obrigatoria** ("Powered by PrimeDope.com") por etiqueta — cumprimos
    com link discreto no rodape do painel.
  - **Charts PNG re-hosted localmente** ocupam disco (~500MB/ano estimado). Cron de
    cleanup futuro se > 5GB.

### Opcao B: Iframe `primedope.com` direto

Embedar PrimeDope dentro do `/coach` via iframe.

- **Pros:**
  - Zero codigo backend.
  - Sem risco de schema change (PrimeDope renderiza UI propria).

- **Contras:**
  - **Zero dados estruturados.** Nao podemos exibir EV/ROI em cards proprios, nao podemos
    persistir runs, nao podemos comparar historico, nao podemos integrar com Bankroll
    consolidado.
  - **UX ruim.** PrimeDope UI e desktop-only, nao responsiva, dark theme apenas, idioma EN.
  - **Sem cache.** User espera 4s a cada submit.
  - **Zero diferencial competitivo.** Estamos so embedando ferramenta publica; usuario
    pode acessar `primedope.com` direto sem pagar Grindfy.
  - **Rejeitada por: zero captura de valor para Grindfy.**

### Opcao C: Engine nativo Monte Carlo desde W0 (rebuild full)

Implementar simulator MTT proprio em `server/scoring/mtVarianceEngine.ts` com:
- Random sampling com seed.
- Modelo de prize pool MTT (ICM-aware).
- PKO bounty math (variance acoplada).
- Mystery bounty dist.
- Output: EV / ROI / SD / RoR / confidence intervals.
- Geracao PNG via Canvas server-side (`canvas` lib + `chart.js`).

- **Pros:**
  - **Zero dependencia externa.**
  - **Latencia < 500ms** esperada (sem network roundtrip).
  - **Diferencial competitivo absoluto** — concorrentes nao tem isso.
  - **Customizavel.** Adicionar features (multi-perfil compare, bankroll alerts, etc.).

- **Contras:**
  - **8+ semanas de implementacao.** Bloqueia outras features.
  - **Risco de hipotese errada.** Se jogadores nao usam variance simulation,
    8 semanas viraram desperdicio.
  - **PKO bounty math nao trivial.** Foruns 2p2 mostram que mesmo HRC nao tem PKO bounty
    correto.
  - **Calibracao estatistica.** Sem ground truth (PrimeDope), validacao depende de
    matching vs ferramentas concorrentes — circular.
  - **Geracao PNG custosa.** `canvas` em Node.js eh dor de cabeca (libs nativas, build
    issues).
  - **Rejeitada por: time-to-market alto + risco de hipotese nao validada.**

### Opcao D: Combinacao — usar PrimeDope **enquanto** engine nativo eh construido em paralelo

Sprint F4 entrega PrimeDope como ESCOLHIDA. Sprint F5 paralelo escreve engine nativo, com
A/B test (50% users PrimeDope, 50% nativo) para validar matching estatistico.

- **Pros:**
  - Combina beneficios: time-to-market + zero lock-in.

- **Contras:**
  - **Custo dobrado em F5.** Manter dois caminhos (PrimeDope + nativo) durante a transicao
    ~2 semanas adicionais de QA + bugs duplicados.
  - **A/B test em ferramenta de variance** complica analise: jogadores que viram resultado
    diferente em re-runs perdem confianca.
  - **Aceito conceitualmente, mas postergado.** Opcao A ja deixa interface pronta para
    swap em F5; A/B explicito so se houver duvida no matching estatistico (decidir
    quando F5 chegar).

## Decisao

**Adotar Opcao A: integrar PrimeDope como provider externo plugavel via
`server/services/primedopeIntegration.ts`. Cache 30min + fallback stale 24h + telemetria
de erros 4xx (alerta troca schema) + interface clara para swap em Sprint F5+.**

### Detalhes-chave do design

1. **Servico:**
   - `server/services/primedopeIntegration.ts` exporta `runSimulation(input):
     Promise<SimulationResult>`.
   - Tipo `SimulationResult.source` enum `'primedope' | 'cache' | 'fallback-stale'`. Quando
     engine nativo entrar (F5), expandir para `'native'`.
2. **Persistencia:**
   - Tabela `primedope_runs` (migration `0015`, ADR-acompanha) armazena
     `inputJson + resultJson + inputHash + source + latencyMs + pinned + expiresAt`.
   - Retencao 90 dias (cron mensal); pinned runs nao expiram.
   - **Snapshot `fxRatesUsed` em `inputJson`** para reproducibility.
3. **Cache:**
   - Lookup por `inputHash` em janela 30min.
   - `force=true` no body bypassa cache (RF-07).
4. **Resilience:**
   - Timeout 15s + retry 1x com 500ms backoff em 5xx/timeout.
   - Sem retry em 4xx (provavel schema change → erro fatal + telemetria alerta).
   - Fallback stale: ultimo run < 24h mesmo `(userId, profileLetter, dayOfWeek)`.
5. **Concorrencia:**
   - Semaphore inline `max=3` global (compartilhado entre todos users) com queue timeout
     15s.
   - Rate limit `1 req / 10s / userId` em `POST /api/primedope/simulate`.
6. **Charts:**
   - PNGs proxied: `GET /api/primedope/chart/:hash` serve `uploads/primedope-charts/<hash>.png`.
   - Hash regex `/^[a-f0-9]{64}$/` (path traversal protection).
7. **FX (RF-26):**
   - `normalizeBuyinToUSD` (reuso de `server/scoring/currencyNormalizer.ts`, ADR-033).
   - Cascata: `users.exchangeRates` (se existir) → `wallets.exchangeRates` da wallet
     ativa → fallback constante `{BRL:5.0, EUR:0.93, CNY:7.25, USDT:1.0}`.
   - Snapshot completo `fxRatesUsed` salvo em `inputJson` para audit/repro.
8. **Telemetria:**
   - `primedope_simulation_run`, `primedope_simulation_error` (com `errorType`),
     `primedope_chart_proxy_miss`, `primedope_run_pinned`, `day_detail_drawer_open` via
     `tracker.emit` (ADR-055).
9. **Interface plugavel para F5:**
   - Quando engine nativo entrar, criar `server/services/nativeMonteCarloEngine.ts` com
     mesma assinatura `runSimulation(input): Promise<SimulationResult>`.
   - Feature flag (env `SIMULATION_PROVIDER='primedope' | 'native'` ou per-user toggle)
     escolhe provider em runtime.
   - Manter `primedope_runs` como tabela de cache + audit; adicionar `source='native'`
     quando engine nativo rodar.

### Alternativas para mitigar risco URL change

Se PrimeDope quebrar antes de F5 (engine nativo) estar pronto:

1. **Curto prazo (mesmo dia):** todos users veem fallback stale (24h) ate cron de retry.
2. **Medio prazo (1-7 dias):** investigar nova URL/schema PrimeDope em paralelo + ajustar
   service. Telemetria 4xx + CTA mailto avisam o time imediatamente.
3. **Longo prazo (1-4 semanas):** se PrimeDope sumir permanentemente, acelerar Sprint F5
   (engine nativo) ou trocar provider (HRC API, se publica). Dataset `primedope_runs`
   serve como regression test.

### Tradeoffs aceitos

| Tradeoff | Aceito por que |
|---|---|
| **Lock-in em endpoint nao-versionado** | Mitigacao multipla (cache, fallback, telemetria); custo de troca baixo (interface plugavel). |
| **Atribuicao obrigatoria PrimeDope** | Aceitavel (link discreto no rodape) ate F5. |
| **Latencia 2-4s** | Use case nao e real-time; cache 30min cobre 80%+ requests. |
| **Charts ocupam disco** | ~500MB/ano estimado; cron futuro se passar 5GB. |
| **Conversao FX upstream** | Custo unico no service; reuso de `currencyNormalizer.ts`. |
| **Sem ToS publicado** | Risco juridico baixo (ferramenta livre desde 2014); aceito ate F5. |

### Quando rever esta decisao

- **PrimeDope quebra silenciosamente** (telemetria `upstream_4xx_schema_change` consistente):
  acelerar F5 ou avaliar provider alternativo.
- **Sprint F5 (engine nativo) entra:** ADR novo registrando swap de provider, manter
  `primedope_runs` como audit trail.
- **Volume cresce > 1000 runs/dia:** rate limit `1/10s/user` pode ser tight; revisar.
- **Disco `uploads/primedope-charts/` > 5GB:** introduzir cron de cleanup ou TTL.
- **PrimeDope publica ToS proibindo scraping:** retirar imediatamente, acelerar F5.

## Consequencias

### Positivas

- **Time-to-market rapido.** ~3-4 semanas (105h spec total) vs 8+ semanas nativo.
- **Validacao barata de hipotese de produto.** Se jogadores nao usam, engine nativo nunca
  foi escrito.
- **Diferencial competitivo entregue.** Concorrentes (HRC, ICMIZER, SharkScope) nao tem
  variance simulation integrado a planning.
- **Dataset historico** em `primedope_runs` serve como regression test do engine nativo
  futuro (calibracao automatica).
- **Interface plugavel** permite swap em F5 sem rewrite do frontend.
- **UX patterns reusaveis** (drawer, wizard, source badges, onboarding) servem para F5.

### Negativas

- **Dependencia externa nao-versionada.** Mitigada por cache + fallback + telemetria.
- **Latencia 2-4s** em cache miss. Aceitavel.
- **Charts PNG ocupam disco.** Monitorar; cron futuro.
- **Atribuicao obrigatoria** no rodape (concession trivial).
- **Conversao FX adicionada** complexidade em `primedopeIntegration.ts`. Mitigada por
  reuso de `currencyNormalizer.ts`.

### Neutras

- **Decisao revisitavel** quando F5 entrar; documentado em "Quando rever".
- **`primedope_runs` retem dados** mesmo apos swap (audit + regression test).

## Confianca

**Alta.** Tradeoffs explicitos. Mitigacoes documentadas. Interface plugavel garante swap
trivial em F5. Risco de URL change e o maior contra mas e enderecavel via fallback +
telemetria + roadmap nativo.

## Referencias

- **Spec:** `Docs/specs/sprint-f4-primedope-grade-detail.md` (RF-04, RF-08, RF-09,
  RF-12 — comportamento do service).
- **PoC:** `scripts/primedope-simulate.ts` (ja escrito, port para
  `server/services/primedopeIntegration.ts`).
- **ADR-033:** `033-fx-rate-convention-units-per-usd.md` — convencao "unidades por 1 USD" e
  `currencyNormalizer.ts` reusado em RF-26.
- **ADR-055:** `055-tracker-stub-vs-analytics-events-table.md` — telemetria sem schema.
- **ADR-056:** `056-onboarding-dismiss-localstorage.md` — persistencia dismiss educativo.
- **Diagramas Mermaid:**
  - `Docs/architecture/c4-context-primedope.mermaid`
  - `Docs/architecture/sequence-primedope-simulation.mermaid`
  - `Docs/architecture/er-primedope.mermaid`
  - `Docs/architecture/flow-primedope-wizard-prefill.mermaid`
- **Lessons learned:** `Docs/architecture/lessons-learned.md#6` (conversao moeda),
  `#9` (try/catch granular log antes de fallback), `#10` (DRY de defaults).
- **Memoria:** `memory/roadmap_pivot_2026-04-24.md` (foco: Tournament Selector + Bankroll;
  PrimeDope F4 e a 3a entrega estrategica do trimestre).
