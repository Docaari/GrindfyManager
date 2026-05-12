# Coach AI-0A — Diagramas

Sprint AI-0A: religar tools do Coach (5 read tools + 6 write tools + 1 read tool de Coach-2B), citations/confidence
universais no system prompt, auditoria do `xSearchProvider` do News.

| Arquivo | O que mostra |
|---|---|
| `seq-read-tool-citable.mermaid` | Sequência: LLM chama read tool → `coachToolRunner` → handler → service/storage → resposta wrapped (`{__type:'ToolResult'}`) de volta ao stream → resposta narrativa com `[fonte: ...]` + `[confianca: ...]`. Cobre `query_dimension` (exemplo concreto) + variantes de `find_top_leaks`, `get_tournament_suggestions`, `explain_tournament_score`, `simulate_bankroll_scenario`, `verify_leak_progress`. Inclui branches de validação Zod, falta de dado (`note`), erro de handler, limite de 5 tool calls, e a nota sobre o segundo turn conversacional ser pendência conhecida. |
| `seq-write-tool-confirm-undo.mermaid` | Sequência: LLM chama write tool → `coach_action` pending + SSE `tool_pending` → diff (financeiro detalhado se `confirm-strict`) → usuário confirma → `confirmCoachAction` (TX: re-valida input, `payload_before`, `executeConfirmed`, `payload_after`, `undo_expires_at`) → SSE `tool_result` → `UndoBadge` → undo dentro de 5 min (reverse-row p/ wallet, delete/restore p/ as outras). Branches: cancelar pending, janela expirada (410), race de confirms paralelos, cleanup automático (cron). **Atualiza** o diagrama Coach-2B (`../coach-2b/seq-write-tool-confirm-undo.mermaid`) refletindo as 6 write tools agora registradas + `confirm-strict` como flag em memória. |
| `flow-citations-confidence-system-prompt.mermaid` | Flowchart: estrutura do system prompt (bloco estático cacheado + dinâmico), fonte única das constantes (`coachSafetyPrompts.ts` — sem variante backticked, ADR-147), e a lógica de decisão do LLM ao emitir cada afirmação factual (número de tool ⇒ `[fonte: toolName:key:period]` + `[confianca: ...]` se houver N; estimativa ⇒ `[fonte: nao verificado]`; hand-level ⇒ `[nao sei: ...]`; output financeiro ⇒ disclaimer condicional). |

## ADRs relacionados

- **ADR-145** — Errata aos ADRs 023/024/042/052b/086: estado canônico do registry pós-AI-0A (17 tools + 1 alias), enums corrigidos (`speed: Normal|Turbo|Hyper`, `category: +Satellite`), stubs removidos, `query_dimension.groupBy:'fieldSize'` → `getAnalyticsByField`.
- **ADR-146** — Coach write tools: confirmação obrigatória v1, sem auto-aprovação, sem `delete_*`, `confirm-strict` (`confirmationLevel:'strict'`) como flag em memória no descriptor para operações financeiras (não persistida em `coach_actions`).
- **ADR-147** — Read tools: extrair `tournamentScoringService` (DRY — nunca duplicar `computeTournamentScore`); fonte canônica de banca para `simulate_bankroll_scenario` = `walletService.getConsolidatedBalance` (USD, FX-aware) com fallback interno para `user_settings.bankroll_amount`; unificar os blocos de prompt (aceitar quebra de cache única, fim da variante backticked).

## Doc de auditoria (não é ADR)

- `Docs/architecture/audits/xsearch-provider-audit-2026-05.md` — achado: `title`/`summary` dos tweets são prosa autoral do Grok (URLs cross-validadas, mas texto não). Risco baixo-médio. Recomendação: backlog (item News-4 quando `NEWS_FEED_ENABLED` for ligado) com mitigação (a) prompt restritivo + omit-on-fail + (c) badge "gerado por IA" no card. Nenhuma mudança de código neste sprint.

## Modelo de dados

**Nenhuma migração nova.** A infra `coach_actions` (ADR-077) já tem `payload_before`, `payload_after`, `status`, `requires_confirmation`, `affected_entity_*`, `undo_expires_at`. O nível `confirm-strict` vive só no descriptor em memória — explicitamente **não** vira coluna `confirmation_level` na v1 (decisão do founder, ADR-146). `coach_leak_focus` (Coach-2B), `tournaments`, `tournament_library`, `planned_tournaments`, `grind_sessions`, `study_sessions`, `wallets`, `wallet_transactions`, `user_settings`, `hud_stat_snapshots` — todas existentes. ER de referência: `../coach-2b/er-coach-2b.mermaid` (sem alteração).
