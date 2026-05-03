# Architecture Decision Records (ADRs)

Indice de decisoes arquiteturais do projeto Grindfy Manager.

Cada ADR documenta o contexto, opcoes consideradas, decisao tomada e consequencias de uma decisao tecnica significativa. ADRs nunca sao deletados — sao marcados como "Deprecado" ou "Substituido" quando uma decisao muda.

## Indice

| ADR | Titulo | Status | Data |
|-----|--------|--------|------|
| [001](001-auth-jwt.md) | Usar JWT com refresh token para autenticacao | Aceito | 2025-01-01 |
| [002](002-neon-serverless.md) | Usar Neon Serverless PostgreSQL como banco de dados | Aceito | 2025-01-01 |
| [003](003-monolith-architecture.md) | Monolito Express servindo API + SPA na mesma porta | Aceito | 2025-01-01 |
| [007](007-blocknote-editor.md) | Usar BlockNote como editor block-based para pagina Estudos | Aceito | 2026-03-21 |
| [008](008-late-reg-alerts-architecture.md) | Arquitetura de alertas de late registration no Grind Live | Aceito | 2026-03-21 |
| [009](009-tournament-library-separate-table.md) | Criar tournament_library como tabela separada de tournament_templates | Aceito | 2026-03-21 |
| [010](010-profile-off-fourth-state.md) | Perfil OFF como 4o estado (nao substituindo C) | Aceito | 2026-03-21 |
| [011](011-react-beautiful-dnd-choice.md) | Usar react-beautiful-dnd para drag-and-drop na grade | Aceito | 2026-03-21 |
| [012](012-suprema-dedup-strategy.md) | Estrategia de deduplicacao Suprema: externalId + nome+site+buyIn | Aceito | 2026-03-21 |
| [013](013-eliminate-planning-dialog.md) | Eliminar PlanningDialog e redistribuir funcionalidades | Aceito | 2026-03-21 |
| [014](014-addon-rea-modelagem.md) | Modelar Add-on e Re-entry como flags ortogonais (nao expandir enum `type`) | Aceito | 2026-04-23 |
| [015](015-scoring-linear-vs-ml.md) | Combinacao linear ponderada com Bayesian shrinkage para Tournament Selector (vez de ML) | Aceito | 2026-04-23 |
| [016](016-bundle-aggregation-pattern.md) | Endpoint agregado `/api/analytics/player-bundle` em vez de 7 chamadas paralelas | Aceito | 2026-04-23 |
| [017](017-bankroll-snapshot-vs-derived.md) | Banca em tabela `bankroll_snapshots` (snapshots explicitos) em vez de derivar | Aceito | 2026-04-24 |
| [018](018-bankroll-tolerance-hardcoded.md) | Tolerancia de bankroll 1.5x hardcoded (sem config por usuario) | Aceito | 2026-04-24 |
| [019](019-coach-prompt-cache-strategy.md) | Coach prompt em 2 blocos (estatico cacheado + dinamico) | Aceito | 2026-04-24 |
| [020](020-coach-rate-limit-rolling-24h.md) | Rate limit do Coach em janela rolling de 24h (nao calendar-day) | Aceito | 2026-04-24 |
| [021](021-coach-model-selection-via-env.md) | Modelos do Coach parametrizados via env com defaults atualizados | Aceito | 2026-04-24 |
| [022](022-coach-confidence-tags-inline-vs-structured.md) | Confidence tags inline textuais (vez de JSON estruturado ou tool use) | Aceito | 2026-04-24 |
| [023](023-coach-tool-registry-pattern.md) | Tool registry pattern modular por dominio + index central (Coach-2A) | Aceito | 2026-04-24 |
| [024](024-coach-tool-result-wrapping.md) | Tool result wrapping em JSON estruturado anti prompt injection (Coach-2A) | Aceito | 2026-04-24 |
| [025](025-coach-page-context-zod-whitelist.md) | Page context com Zod discriminated union por route (Coach-2A) | Aceito | 2026-04-24 |
| [026](026-coach-continuation-loop-limit.md) | Continuation loop limit de 5 tool calls por turn (Coach-2A) | Aceito | 2026-04-24 |
| [027](027-warmup-soft-gate-with-override.md) | Gate Go/No-Go do warm-up como SOFT (warning + double-confirm) em vez de HARD (Sprint W-1) | Aceito | 2026-04-25 |
| [028](028-warmup-rituals-vs-preparation-logs.md) | Criar nova tabela `warmup_rituals` em vez de estender `preparation_logs` (Sprint W-1) | Aceito | 2026-04-25 |
| [029](029-warmup-no-dual-write-legacy-logs.md) | Nao fazer dual-write em `preparation_logs` durante a transicao (Sprint W-1) | Aceito | 2026-04-25 |
| [030](030-warmup-telemetry-client-only-w1.md) | Telemetria do warm-up Sprint W-1 e client-only via console.log (sem persistencia server-side) | Aceito | 2026-04-25 |
| [031](031-tournament-types-orthogonal-model.md) | Modelo ortogonal de tipos de torneio (type primario + modificadores booleanos isFlight/isLive) | Aceito | 2026-04-25 |
| [032](032-deprecation-category-column.md) | Deprecation gradual da coluna `tournaments.category` em 5 sprints | Aceito | 2026-04-25 |
| [033](033-fx-rate-convention-units-per-usd.md) | Convencao oficial de `exchangeRates`: unidades nativas equivalentes a 1 USD | Aceito | 2026-04-26 |
| [034](034-multi-wallet-with-immutable-fx.md) | Modelo Multi-Wallet com FX Historico Imutavel | Aceito | 2026-04-26 |
| [035](035-bankroll-v1-to-v2-migration.md) | Compatibilidade v1->v2 e Migracao de Snapshots de Bankroll | Aceito | 2026-04-26 |
| [036](036-tickets-effective-buyin.md) | Buy-in Efetivo Zero e ROI Individual Null em Torneios via Ticket | Aceito | 2026-04-26 |
| [037](037-tickets-table-vs-jsonb.md) | Tabela `tickets` Separada vs JSON Column em `tournaments` | Aceito | 2026-04-26 |
| [038](038-wallet-tx-optimistic-concurrency.md) | Optimistic concurrency em wallet transactions via `expectedPreviousBalance` | Aceito | 2026-04-26 |
| [039](039-rakeback-as-wallet-tx-reason.md) | Rakeback como `reason='rakeback'` em wallet_transactions (sem novo endpoint, sem nova tabela) | Aceito | 2026-04-26 |
| [040](040-session-end-wallet-reconciliation.md) | Reconciliacao de banca ao fim da sessao via passo intermediario (endpoint batch fail-fast, idempotente, reuso de ADR-017/034/038, sem schema delta) | Proposto | 2026-04-26 |
| [041](041-cooldown-dedicated-spec-and-schema.md) | Cool-down em spec dedicada com schema novo (`cooldown_logs` + `starred_hands`) | Aceito | 2026-04-26 |
| [042](042-cooldown-coach-tool-registry.md) | Tool `coach.read_cooldown_history` no Tool Registry com sanitizer agregador + prompt block cacheable | Aceito | 2026-04-26 |
| [043](043-coach-page-context-cooldown-log.md) | Page context `cooldownLog` — extensao da Zod discriminated union do Coach | Aceito | 2026-04-26 |
| [044](044-session-tournament-satellite-fields.md) | Campos de satelite em `session_tournaments` | Aceito | 2026-04-26 |
| [045](045-session-end-wallet-tie-break.md) | Session-end reconciliation — site-to-wallet tie-break policy | Aceito | 2026-04-26 |
| [046](046-session-wallet-snapshots-table.md) | Tabela `session_wallet_snapshots` para persistencia da reconciliacao por sessao | Aceito | 2026-04-26 |
| [047a](047-summary-inline-reconcile.md) | Reconciliacao de wallets inline no `SessionSummaryModal` | Aceito | 2026-04-26 |
| [047b](047-tts-browser-native-vs-cloud.md) | TTS browser-native (SpeechSynthesis) vs cloud TTS | Aceito | 2026-04-27 |
| [048a](048-tts-priority-queue.md) | Priority queue para multi-tabling TTS (FLUSH inteligente + cap 3 itens / 30s) | Aceito | 2026-04-27 |
| [048b](048-wallets-eligibility-platforms-played.md) | Eligibility de wallets = todas plataformas jogadas (cadastro inline obrigatorio) | Aceito | 2026-04-26 |
| [049](049-tts-privacy-default.md) | Privacy default `ttsRedactBuyIn=true` ("Modo discreto" ativo por padrao) | Aceito | 2026-04-27 |
| [050](050-tts-state-module-level.md) | TTS state em module-level singleton (nao Context, nao Zustand) | Aceito | 2026-04-27 |
| [051a](051-spot-screenshots-storage.md) | Spot screenshots: storage local em F2 (S3 deferido para F3) | Proposto | 2026-04-27 |
| [051b](051-stats-analyzer-layout-schema.md) | Stats Analyzer: layout JSON shape (`hud_layouts.sections`) | Aceito | 2026-04-26 |
| [052a](052-spot-screenshots-ownership.md) | Spot screenshots: ownership middleware em GET /image | Proposto | 2026-04-27 |
| [052b](052-stats-analyzer-coach-tool-integration.md) | Stats Analyzer: Coach AI tool `read_user_hud_stats` | Aceito | 2026-04-26 |
| [053](053-spot-screenshots-cron.md) | Cron diario de purge de spot screenshots via `node-cron` em F2 (scheduler externo em F3) | Proposto | 2026-04-27 |
| [054](054-primedope-external-provider-vs-native-engine.md) | PrimeDope como provider externo (interim) vs engine Monte Carlo nativo (Sprint F4) | Aceito | 2026-04-28 |
| [055](055-tracker-stub-vs-analytics-events-table.md) | `tracker.ts` stub minimo via console.log vs tabela `analytics_events` persistida (Sprint F4) | Aceito | 2026-04-28 |
| [056](056-onboarding-dismiss-localstorage.md) | Onboarding educativo dismiss via `localStorage` vs coluna `users.preferences` JSONB (Sprint F4) | Aceito | 2026-04-28 |
| [088](088-hud-stat-targets-knowledge-base.md) | hud_stat_targets knowledge base global + override inline (Sprint F4 stats-analyzer, ex-057) | Aceito | 2026-04-29 |
| [089](089-hud-snapshot-sample-size-per-stat.md) | sample size per stat em snapshots.values com 3 formatos back-compat (Sprint F4 stats-analyzer, ex-058) | Aceito | 2026-04-29 |
| [090](090-tournament-series-single-source-of-truth.md) | Tournament Series como single source of truth — deprecar flags inline ADR-031 (Sprint Flight-1) | Aceito | 2026-05-02 |
| [091](091-stack-mode-enum-single-combined.md) | Stack mode enum: `single` \| `combined` (best-stack fora MVP, defer Flight-2) | Aceito | 2026-05-02 |
| [AI-001](../ai-coach/adr-001-llm-provider.md) | Usar Claude API (Anthropic) como provedor LLM para AI Coach | Proposto | 2026-04-08 |
| [AI-002](../ai-coach/adr-002-memory-architecture.md) | Estrategia de memoria persistente com perfil + resumos + compactacao | Proposto | 2026-04-08 |

## Convencoes

- **Formato:** Um arquivo Markdown por decisao
- **Numeracao:** Sequencial (001, 002, 003...)
- **Status possiveis:** Proposto, Aceito, Deprecado, Substituido por ADR-XXX
- **Nunca deletar:** Marcar como Deprecado ou Substituido
- **Sempre incluir:** Opcoes descartadas com pros e contras

## Notas

- **Numeracao duplicada (047, 048, 051, 052):** existem dois ADRs com cada um desses
  numeros — sufixo `a`/`b` adicionado neste indice apenas para desambiguacao visual; os
  arquivos no disco mantem nome original (e.g. `047-summary-inline-reconcile.md` e
  `047-tts-browser-native-vs-cloud.md`). Divida historica de coordenacao entre sprints
  paralelos (TTS, Bankroll, Stats Analyzer, Spot Screenshots) — proximos ADRs evitam
  colisao.
- **Branches paralelas:** ADRs 051-spot-screenshots, 052-spot-screenshots e
  053-spot-screenshots existem somente em `feature/spot-screenshots`. ADRs
  051-stats-analyzer e 052-stats-analyzer existem em `feature/stats-analyzer`. ADRs
  054-056 (Sprint F4 PrimeDope) sao independentes e podem coexistir em ambas branches
  sem conflito de numeracao.
- **Renumeracao 2026-05-02 (orphan-merge):** ADR-057 (hud-stat-targets) renumerado
  para **088** + ADR-058 (hud-snapshot-sample-size) renumerado para **089** apos
  merge da branch `feature/stats-analyzer-f4` (numbers 057/058 ja ocupados por
  spot-image-storage e auto-snapshot-cooldown em main).
- **Hiato 003 → 007:** ADRs 004-006 reservados/nunca escritos durante consolidacao
  inicial.
