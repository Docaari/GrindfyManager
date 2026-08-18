---
description: Regras do Coach AI - prompts, cache, tools, elegibilidade de plano, relatorios e nudges
paths:
  - "server/coach/**"
  - "server/routes/coach*.ts"
  - "server/services/reportDelivery.ts"
  - "server/services/*ReportGenerator*.ts"
  - "client/src/pages/CoachAi.tsx"
  - "client/src/components/coach/**"
---

# Zona critica: Coach AI

Antes de mexer aqui, carregue a skill `claude-api`. Documentacao:
`Docs/api/coach.md` e `Docs/api/coach-tools.md`.

## Acesso ao SDK

Nunca instancie `Anthropic` direto. Use `server/coach/anthropicClient.ts`
(`getAnthropicClient`, `callReportLlm`): ele ja tem retry 3x exponencial, cap de
wall-clock (`COACH_LLM_TIMEOUT_MS`), whitelist anti-injecao de `tone`/`level` e
fallback degradado.

`AbortSignal` vai no **segundo argumento** do SDK, nao no body — no body o cap
nunca dispara (CRITICAL-1 do AI-3.2).

Custo sai de `server/coach/reportCost.ts`. Preco hardcoded em callsite e
divergencia garantida.

## Prompt

Bloco de prompt e conhecimento unico: um arquivo so, em `server/coach/prompts/`.
Duplicar `SAFETY_RULES` entre `coachPrompts` e `coachSystemBuilder` ja divergiu e
**quebrou o cache da Anthropic** — custo real, invisivel no teste.

Texto vindo do jogador (nota de break, perfil, nome de tema) nunca entra cru no
prompt. Passa por whitelist ou sanitizacao.

## Elegibilidade

Duas nocoes, nao confunda:

- `resolveUserTier` — gateia rate limit e tools. Trial cai em free aqui.
- `getReportTier` (`server/coach/reportEligibility.ts`) — gateia relatorio.
  `'eligible'` para Trial ou pro/premium/admin; free **nunca** recebe.
- Cron que lista usuario usa `server/coach/planEligibility.ts`
  (`LIST_USERS_FOR_CRON_PRO_PLUS`), nao lista propria.

`users.subscription_plan` e `'trial' | 'active' | 'expired' | 'admin'`. Comparar
com `['pro','premium']` direto e o bug que cortou Trial de todos os relatorios.

## Relatorios e jobs

`report_jobs` (fila) -> processor 15 min -> `reports`. UNIQUE
`(user_id, report_type, period_start)` garante idempotencia. Enfileirar e
best-effort e nunca derruba a requisicao do usuario.

Degradacao e **explicita**: `status: 'degraded'` + `degradedReason` nomeado
(`no_anthropic_key`, `llm_failed_3x`, `llm_parse_error`, `llm_timeout`). Wrapper
que traduz so um reason engole os outros e entrega narrativa vazia como `ready` —
ja aconteceu no monthly e no daily.

Entrega tripla (notificacao + chat + email) em
`server/services/reportDelivery.ts`.

## Nudges

Todos gated por `COACH_NUDGES_ENABLED` **e** pelo toggle da categoria em
`user_coach_preferences`. Nudge novo nasce com dedupe (coluna de
`*_at` ou `coach_nudge_log`), senao o jogador recebe o mesmo aviso toda hora.

## Tools

Write tool exige tier Pro+ (`server/coach/toolEligibility.ts`), confirmacao e
undo. Tool nova entra em `Docs/api/coach-tools.md` na mesma sprint.

## Chaves de semana

`ymdUtc` (UTC) para `weekly_planning_sessions`, `weekly_reviews`,
`study_weekly_plans`; `brtMondayYmd` (BRT) para `coach_lesson_recommendations`.
**Nao unificar** — a divergencia e intencional e documentada (EST-6).
