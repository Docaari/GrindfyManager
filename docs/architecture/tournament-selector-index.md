# Tournament Selector Inteligente — Indice de Arquitetura

## Status
Arquitetura aprovada — pronta para Test-Writer.

## Posicao no Pipeline
```
PM-Spec (docs/specs/tournament-selector.md) -> APROVADO
   |
System-Architect (este indice)               -> APROVADO
   |
Test-Writer                                  -> PROXIMO
   |
Implementer
   |
Reviewer
   |
Deployer
```

## Sumario da Feature
Sistema de scoring que cruza ROI historico do jogador (em 7 dimensoes — site, buy-in, categoria, velocidade, dia da semana, horario, field) com a oferta de torneios disponiveis hoje (Suprema via API + biblioteca pessoal) e ranqueia cada torneio por edge esperado, exibindo score 0-100 + grade S/A/B/C/D + rationale.

**Sprint:** 1 do roadmap aprovado em 2026-04-23 (`docs/strategy/2026-04-23-product-roadmap.md`).
**ICE:** 8.0 (maior do catalogo).

---

## Decisoes do Founder Incorporadas

| # | Decisao | Onde foi tratada |
|---|---------|------------------|
| 1 | Widget no `/coach` (NAO pagina dedicada) | C4 component + flow do usuario |
| 2 | Pesos hardcoded no MVP | ADR-015 + sequence |
| 3 | RF-07 incluido no Sprint 1 | data-model + sequence |
| 4 | RF-05 score na library = batch | C4 component + sequence |
| 5 | Cold start granular (<20 / 20-49 / >=50) | feature-flow + ADR-015 |
| 6 | Normalizacao monetaria via `user_settings.exchangeRate` | sequence + Questoes Abertas |
| 7 | Bankroll filter desabilitado se nao cadastrado | feature-flow |
| 8 | AI Coach NAO integrado no Sprint 1 | ADR-015 (futuro consumidor) |

---

## Artefatos

### Diagramas

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| [`flows/tournament-selector/c4-component.mermaid`](flows/tournament-selector/c4-component.mermaid) | C4 Component | Modulos backend novos (`scoring/`, rota selector) e como conversam com o que ja existe (`analytics`, `suprema`, `tournament-library`, `grade-planner`) |
| [`flows/tournament-selector/sequence.md`](flows/tournament-selector/sequence.md) | Sequence | Fluxo `GET /api/tournament-selector` — paralelismo bundle+suprema, scoring em memoria, logging async (RF-07) |
| [`flows/tournament-selector/feature-flow.md`](flows/tournament-selector/feature-flow.md) | Flowchart + cenarios de teste | Perspectiva do usuario abrindo o widget, filtrando, adicionando a grade, cold start granular e bankroll desabilitado |

### Decisoes (ADRs)

| ADR | Titulo | Status |
|-----|--------|--------|
| [ADR-015](decisions/015-scoring-linear-vs-ml.md) | Combinacao linear ponderada com bayesian shrinkage para o scoring (em vez de ML) | Aceito |
| [ADR-016](decisions/016-bundle-aggregation-pattern.md) | Endpoint agregado `/api/analytics/player-bundle` em vez de 7 chamadas paralelas pelo cliente | Aceito |

### Modelo de Dados

| Arquivo | Mudanca |
|---------|---------|
| [`data-model.mermaid`](data-model.mermaid) | **+1 tabela:** `tournament_selector_logs` (RF-07) com indices `(userId, createdAt DESC)` e `(eventType, createdAt DESC)` |

### Spec de Origem

- [`docs/specs/tournament-selector.md`](../specs/tournament-selector.md) — 7 RFs detalhados.
- [`docs/strategy/2026-04-23-product-roadmap.md`](../strategy/2026-04-23-product-roadmap.md) — roadmap que justifica priorizacao.

---

## Resumo Tecnico para Test-Writer

### Modulos backend a serem criados

| Caminho | Tipo | Funcao |
|---------|------|--------|
| `server/scoring/tournamentScorer.ts` | Funcao pura | `computeTournamentScore(t, bundle, opts) -> { score, grade, confidence, rationale, signals, warnings }` |
| `server/scoring/scoringConstants.ts` | Constantes | Pesos, `shrinkConstant=30`, mapas de bucket (buyIn, turno, field, grade) |
| `server/scoring/coldStartScorer.ts` | Funcao pura | Cold start `<20` (so universais) e `20-49` (full + flag low-confidence) |
| `server/scoring/timeOfDayBucket.ts` | Funcao pura | `getTimeOfDayBucket("21:30") -> "noite-nobre"` |
| `server/scoring/currencyNormalizer.ts` | Funcao pura | Normaliza buyIn para USD usando `user_settings.exchangeRates` |
| `server/services/playerBundle.ts` | Servico + cache | Bundle agregado de analytics, cache em Map TTL 5min, invalidacao por userId em upload |
| `server/services/selectorCache.ts` | Cache | Map TTL 30min por `(userId, date, sources, lookbackDays)` |
| `server/routes/tournament-selector.ts` | Modulo de rotas | `GET /api/tournament-selector`, `POST /api/tournament-selector/log` |
| `server/routes/analytics.ts` (modificar) | Modulo de rotas | `GET /api/analytics/player-bundle`, `GET /api/analytics/by-time-of-day` (opcional REST) |
| `server/routes/tournament-library.ts` (modificar) | Modulo de rotas | Response de `GET /api/tournament-library` recebe campo opcional `selectorScore` (RF-05 batch) |
| `server/storage.ts` (modificar) | Camada de dados | `getAnalyticsByTimeOfDay()`, `insertSelectorLog()`, `getSelectorLogsByUser()` |
| `shared/scoring.ts` (novo) | Tipos | `TournamentScore`, `ScoringSignal`, `ScoringInputTournament`, `PlayerAnalyticsBundle`, `SelectorLogEvent` |
| `shared/schema.ts` (modificar) | Drizzle | Tabela `tournament_selector_logs` |

### Modulos frontend a serem criados

| Caminho | Funcao |
|---------|--------|
| `client/src/pages/GradePlanner.tsx` | Adicionar tab "Selector" no painel da Biblioteca |
| `client/src/components/grade-planner/SelectorPanel.tsx` | Painel principal: header, banner cold-start, filtros, lista |
| `client/src/components/grade-planner/SelectorCard.tsx` | Card de torneio scored |
| `client/src/components/grade-planner/SelectorDetailsModal.tsx` | Breakdown completo dos 7 signals |
| `client/src/components/grade-planner/SelectorFilters.tsx` | Chips de filtro (fonte, score, sample, bankroll) |
| `client/src/components/grade-planner/LibraryCardScoreBadge.tsx` | Badge `S 87` no LibraryCard (RF-05) |
| `client/src/hooks/useTournamentSelector.ts` | TanStack Query hook |
| `client/src/hooks/usePlayerBundle.ts` | TanStack Query hook (cache 5min, invalida em upload) |
| `client/src/lib/scoringHelpers.ts` | Cor/icone por grade, formatador de bucket de turno |

### Endpoints

| Metodo | Rota | Auth | Cache | Descricao |
|--------|------|------|-------|-----------|
| GET | `/api/tournament-selector?date=YYYY-MM-DD&sources=&minScore=&minSample=&bankrollFilter=&lookbackDays=` | JWT | 30min | Lista ranqueada |
| GET | `/api/analytics/player-bundle?lookbackDays=180` | JWT | 5min | Bundle agregado |
| GET | `/api/analytics/by-time-of-day` | JWT | — | (opcional) ROI por turno |
| POST | `/api/tournament-selector/log` | JWT | — | Log de evento `add_to_grid` (RF-07) |
| GET | `/api/tournament-library` (modificado) | JWT | — | Inclui `selectorScore` opcional (RF-05) |

### Performance Targets

| Operacao | Alvo p95 |
|----------|----------|
| `computeTournamentScore` por torneio | < 2ms |
| `GET /api/analytics/player-bundle` | < 300ms |
| `GET /api/tournament-selector` (200 torneios + 5k historico) | < 500ms |
| Cache hit do selector | < 50ms |

---

## Questoes Tecnicas em Aberto

Elencadas para resolucao **antes** do Test-Writer comecar. Cada uma tem recomendacao default; founder decide.

### Q1. Timezone da query `getAnalyticsByTimeOfDay` (RF-06)
A coluna `tournaments.date_played` e `timestamp without time zone`. O bucketizador de turno (`madrugada`/`manha`/`tarde`/`noite-cedo`/`noite-nobre`) precisa interpretar a hora no timezone do **jogador** (`users.timezone`, default `America/Sao_Paulo`), nao do servidor (que vai rodar em UTC no Render).

- **Opcao A (recomendada):** SQL com `EXTRACT(HOUR FROM date_played AT TIME ZONE 'UTC' AT TIME ZONE users.timezone)` — depende de fazer JOIN com `users` ou passar o timezone como parametro.
- **Opcao B:** Buscar timestamp UTC, converter no Node usando `date-fns-tz` (ja esta no stack? **verificar** — pode exigir nova dep).
- **Risco:** Se `date_played` estiver gravado como hora local sem timezone explicito, qualquer conversao aplicada gera off-by-one. Test-Writer precisa de fixture com timestamps documentados.

### Q2. Currency normalization — fonte de verdade
Spec diz "Suprema vem em BRL, GG/Stars em USD" e que normalizamos para USD usando `user_settings.exchange_rates` (jsonb). Mas:

- O `exchange_rates` atual e `Record<string, number>` — qual a chave? `BRL` (com valor `0.20` significando 1 BRL = 0.20 USD) ou `BRL_USD` (com valor `0.20`)?
- Quando `user_settings.exchange_rates` esta vazio (usuario novo) ou nao tem a chave necessaria, qual o fallback? Sugestao: tabela hardcoded de defaults em `scoringConstants.ts` (ex: `BRL: 0.20`) com banner avisando "taxa estimada".
- O bucketizer de buy-in (faixas `$0-1.99`, `$2-4.99`, etc.) opera sobre USD. Confirmar que **historico** (`tournaments.buy_in` + `tournaments.currency`) tambem e normalizado antes de agregar em `byBuyIn`. Se nao for, a comparacao "torneio Suprema R$22 ~= bucket $5-10.99" fica errada.

### Q3. Cache invalidacao de `playerBundle` em upload
Spec exige invalidacao quando `/api/upload-history POST` cria torneios novos. Hoje o handler do upload esta em `server/routes/upload.ts`. Como invalidar limpamente:

- **Opcao A (recomendada):** Servico `playerBundleCache.invalidate(userId)` exposto e chamado pelo upload handler ao final (apos commit). Acoplamento direto, simples.
- **Opcao B:** Event emitter (`events.emit('upload.completed', userId)`) — mais limpo arquiteturalmente, mas requer infra de eventos que nao existe hoje.
- Recomendo A para MVP. Adicionar TODO para B quando surgirem mais consumidores (ex: dashboard cache).

### Q4. Identificacao de torneios "ja na grade" (`alreadyInGrid`)
Spec define dois criterios:
- Suprema: mesmo `externalId` em `planned_tournaments` do dia.
- Library/manual: mesmo `name + time + site` em `planned_tournaments` do dia.

**Risco:** `name + time + site` pode dar falso positivo (dois torneios diferentes com mesmo nome generico). Sugestao: para `library` usar `tournament_library.id` se ja existir uma coluna `library_id` em `planned_tournaments`. **Verificar schema** — atualmente nao parece existir esse FK direto.

Se nao existir, decidir se:
- (a) Aceitar a heuristica `name+time+site` (risco baixo na pratica).
- (b) Adicionar coluna `planned_tournaments.library_id` em uma migration separada antes do Sprint 1.

### Q5. Cold start `<20`: o que e "metricas universais"
Spec define ranking generico baseado em:
- Speed Normal/Turbo/Hyper
- FieldSize pequeno/medio/grande/massivo
- Horario nobre

Mas falta clareza sobre como combinar isso em score 0-100 quando NAO ha historico nenhum. Sugestao no ADR-015: heuristica fixa baseada em variance esperada de torneio (Normal+medio+nobre = 75; Hyper+massivo+madrugada = 25). Test-Writer deve validar com tabela de casos.

### Q6. Mapeamento `category` (Suprema) -> `type` (Grindfy)
Suprema retorna `category` como `Vanilla | PKO | Mystery` mas tambem pode trazer outros valores (`Bounty Hunter`, `Knockout`, `Phase`, etc.). O scoring busca bucket exato em `byCategory`. Quando Suprema retorna um valor desconhecido:

- **Opcao A (recomendada):** Mapear via tabela em `scoringConstants.ts` (ex: `Bounty Hunter -> PKO`). Valores nao mapeados viram `null` -> peso `categoryRoi` redistribuido.
- **Opcao B:** Tratar como bucket independente (pode ter sample 0).

A consistencia com o supremaMapper.ts existente (`server/supremaMapper.ts`) precisa ser verificada — provavelmente ja faz esse mapeamento. **Reusar a logica existente** em vez de duplicar.

### Q7. RF-05 (score na library) — payload size
Decidiu-se entregar batch no `GET /api/tournament-library`, mas a biblioteca pode ter 100-200 torneios. Calcular score para cada um exige:
- 1 `playerBundle` (ja cacheado).
- 1 `computeTournamentScore` por torneio (~2ms cada -> 200 torneios = 400ms).

Risco de estourar o p95 de `tournament-library`. Mitigacoes:
- (a) Calcular sob demanda apenas para torneios visiveis na viewport (lazy via outro endpoint `POST /api/tournament-selector/library-batch` recebendo IDs).
- (b) Cachear scores por (userId, libraryTournamentId, dayOfWeek) com TTL 30min.
- (c) Limitar score apenas aos N primeiros (top 50) e omitir nos demais.

Recomendo **(b)** + monitorar. Se `tournament-library` estourar p95, migrar para **(a)**.

### Q8. Bankroll para Sprint 2 — como NAO criar divida tecnica
Sprint 2 entrega Bankroll Module. O filtro `bankrollFilter` ja precisa ler de algum lugar **agora** (Sprint 1) mesmo que sem UI de configuracao. Sugestao:

- Reservar campo `user_settings.bankroll_amount` (decimal nullable) e `user_settings.bankroll_rule` (varchar default `1pct`) **agora** via migration leve.
- Endpoint `bankrollFilter=true` checa o campo. Se `null`, **filtro desabilitado** + flag no response (`bankrollConfigured: false`) que o frontend usa para desabilitar o chip e exibir tooltip.
- Sprint 2 expoe UI de configuracao + regra customizavel; nao quebra nada do Sprint 1.

**Decidir agora** se o Sprint 1 ja inclui essas 2 colunas em `user_settings` ou se Sprint 2 adiciona junto com a UI. Recomendo incluir agora (ADR-016 ja toca nisso).

### Q9. RF-07 retencao de logs
A tabela `tournament_selector_logs` cresce ~1 row por chamada de endpoint + 1 por add_to_grid. Em volume estimado:
- 100 usuarios x 5 chamadas/dia = 500 rows/dia = ~180k/ano.
- Aceitavel sem TTL.

Mas se decidirmos logar o `metadata` jsonb completo (snapshot de filtros + signals dos top 10), o tamanho cresce. Sugestao no MVP: logar metadata apenas em `add_to_grid` (eventos raros) e nao em `view`. ADR-015 cita isso na secao "Telemetria para evolucao futura".

### Q10. `/api/tournament-selector/log` vs logging implicito no proprio handler
Spec da duas opcoes para o RF-07:
- (a) Logar implicitamente quando `/api/tournament-selector` e chamado (view) e quando `POST /api/planned-tournaments` recebe o flag `source: "selector"` (add_to_grid).
- (b) Endpoint dedicado `POST /api/tournament-selector/log` que o frontend chama explicitamente.

Recomendo **(a)** — menos round-trips, menos chance de log perdido se cliente esquecer de chamar. `POST /api/planned-tournaments` recebe um header opcional `X-Selector-Score` ou flag `metadata.fromSelector` que dispara o log.

---

## Proximo Passo Recomendado

```
Aprovacao desta arquitetura -> Founder responde Q1-Q10 (especialmente Q2 currency, Q4 alreadyInGrid, Q8 bankroll)
                            -> Test-Writer escreve testes baseados em:
                               - feature-flow.md (cenarios de teste derivados)
                               - sequence.md (cenarios de orquestracao)
                               - ADR-015 (testes do algoritmo de scoring)
                               - data-model.mermaid (testes de schema)
```

**Foco do Test-Writer:**
1. Testes da funcao pura `computeTournamentScore` (sem mocks, casos de mesa).
2. Testes do endpoint `GET /api/tournament-selector` (com mocks de bundle e suprema).
3. Testes de cache (TTL, invalidacao, hit rate).
4. Testes de cold start granular (3 thresholds).
5. Testes de UI (TanStack Query hooks, render do widget, add_to_grid).
