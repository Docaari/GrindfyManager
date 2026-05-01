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
| [040](040-session-end-wallet-reconciliation.md) | Reconciliacao de banca ao fim da sessao via passo intermediario (endpoint batch fail-fast, idempotente, reuso de ADR-017/034/038, sem schema delta) | Proposto | 2026-04-26 |
| [058](058-auto-snapshot-cooldown.md) | Auto-snapshot pos-cooldown dentro da TX, falha logada nao bloqueia finish (Bankroll-3 RF-2) | Proposto | 2026-05-01 |
| [059](059-cross-wallet-transfer.md) | Cross-wallet transfer via tabela `wallet_transfers` + 2 rows espelho em `wallet_transactions` agrupados via transfer_group_id (Bankroll-3 RF-4) | Proposto | 2026-05-01 |
| [060](060-stop-loss-lock.md) | Stop-loss/stop-win em USD consolidado, lock via `stop_lock_until` em `user_settings` (Bankroll-3 RF-6) | Proposto | 2026-05-01 |
| [061](061-fx-resolver-unified.md) | `fxResolver` unificado com cascata users > wallets > constants + cache 5min (Bankroll-3 RF-11; RF-12 skip documentado) | Proposto | 2026-05-01 |
| [AI-001](../ai-coach/adr-001-llm-provider.md) | Usar Claude API (Anthropic) como provedor LLM para AI Coach | Proposto | 2026-04-08 |
| [AI-002](../ai-coach/adr-002-memory-architecture.md) | Estrategia de memoria persistente com perfil + resumos + compactacao | Proposto | 2026-04-08 |

## Convencoes

- **Formato:** Um arquivo Markdown por decisao
- **Numeracao:** Sequencial (001, 002, 003...)
- **Status possiveis:** Proposto, Aceito, Deprecado, Substituido por ADR-XXX
- **Nunca deletar:** Marcar como Deprecado ou Substituido
- **Sempre incluir:** Opcoes descartadas com pros e contras
