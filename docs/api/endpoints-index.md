# Endpoints API — Indice Rapido

Tabela rapida de todos os 173 endpoints. Para detalhes (request/response/auth/exemplos), ver `Docs/api/endpoints.md` e arquivos especificos (`coach.md`, `bankroll.md`, `wallets.md`, `coach-tools.md`).

Codigo em `server/routes/` (modularizado em 17 arquivos desde 2026-03-20).

---

## Autenticacao (`/api/auth/`)

| Metodo | Endpoint | Auth | Descricao |
|--------|----------|------|-----------|
| POST | `/api/auth/register` | Nao | Registro de novo usuario |
| POST | `/api/auth/login` | Nao | Login com email/senha (JWT) |
| POST | `/api/auth/login-test` | Nao | Login de teste (debug) |
| POST | `/api/auth/logout` | Sim | Logout |
| POST | `/api/auth/refresh` | Nao | Refresh do token JWT |
| GET | `/api/auth/user` | Sim | Dados do usuario autenticado |
| GET | `/api/auth/me` | Sim | Dados do usuario (alternativo) |
| PATCH | `/api/auth/update-profile` | Sim | Atualizar perfil |
| POST | `/api/auth/verify-email` | Nao | Verificar email via token |
| POST | `/api/auth/resend-verification` | Nao | Reenviar email de verificacao |
| POST | `/api/auth/send-verification` | Nao | Enviar verificacao |
| POST | `/api/auth/forgot-password` | Nao | Solicitar reset de senha |
| POST | `/api/auth/reset-password` | Nao | Resetar senha com token |
| POST | `/api/auth/verify-reset-token` | Nao | Verificar token de reset |
| GET | `/api/auth/google` | Nao | Iniciar OAuth Google |
| GET | `/api/auth/google/callback` | Nao | Callback OAuth Google |

## Dashboard & Analytics

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/dashboard/stats` | Estatisticas gerais do dashboard |
| GET | `/api/dashboard/quick-stats` | Estatisticas rapidas |
| GET | `/api/dashboard/performance` | Performance detalhada |
| GET | `/api/analytics/dashboard-stats` | Stats do dashboard (analytics) |
| GET | `/api/analytics/profile-dashboard-stats` | Stats por perfil |
| GET | `/api/analytics/by-site` | Analise por site/rede |
| GET | `/api/analytics/by-buyin` | Analise por faixa de buy-in |
| GET | `/api/analytics/by-category` | Analise por categoria (Vanilla/PKO/Mystery) |
| GET | `/api/analytics/by-day` | Analise por dia da semana |
| GET | `/api/analytics/by-speed` | Analise por velocidade |
| GET | `/api/analytics/by-month` | Analise por mes |
| GET | `/api/analytics/by-field` | Analise por tamanho de field |
| GET | `/api/analytics/final-table` | Analise de mesas finais |

## Torneios

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/tournaments` | Listar torneios do usuario |
| POST | `/api/tournaments` | Criar torneio |
| PUT | `/api/tournaments/:id` | Atualizar torneio |
| DELETE | `/api/tournaments/:id` | Deletar torneio |
| GET | `/api/tournaments/sites` | Listar sites disponiveis |
| DELETE | `/api/tournaments/clear` | Limpar todos torneios |
| POST | `/api/tournaments/bulk-delete` | Deletar torneios em massa |
| POST | `/api/tournaments/bulk-delete/preview` | Preview de bulk delete |

## Biblioteca & Templates

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/tournament-library` | Biblioteca de torneios agrupados |
| GET | `/api/tournament-templates` | Templates de torneios |
| POST | `/api/tournament-templates` | Criar template |
| GET | `/api/tournament-suggestions` | Sugestoes de torneios |
| GET | `/api/library/platforms-by-popularity` | **Sprint coach-page-reform-1 RF-05** (Path A — opcional). Retorna `{ sites: string[] }` ordenado por volume historico do user (`grind_session_id IS NULL`) + fallback global (PokerStars, GGPoker, WPN, ...) para sites do enum sem historico. Pode ser substituido por hook client-side `usePlatformsByPopularity()` (Path B recomendado pelo PM). Spec: `Docs/specs/sprint-coach-page-reform-1.md` §6 + ADR-125. |

## Grade & Planejamento

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/planned-tournaments` | Torneios planejados |
| POST | `/api/planned-tournaments` | Adicionar torneio planejado |
| PUT | `/api/planned-tournaments/:id` | Atualizar torneio planejado |
| DELETE | `/api/planned-tournaments/:id` | Remover torneio planejado |
| GET | `/api/weekly-plans` | Planos semanais |
| POST | `/api/weekly-plans` | Criar plano semanal |
| GET | `/api/profile-states` | Estados de perfil por dia |
| PUT | `/api/profile-states/:dayOfWeek` | Atualizar perfil do dia |
| POST | `/api/active-days/toggle` | Alternar dia ativo |

## Sessoes de Grind

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/grind-sessions` | Listar sessoes |
| GET | `/api/grind-sessions/history` | Historico de sessoes |
| POST | `/api/grind-sessions` | Criar sessao |
| PUT | `/api/grind-sessions/:id` | Atualizar sessao |
| DELETE | `/api/grind-sessions/:id` | Deletar sessao |
| GET | `/api/grind-sessions/:sessionId/tournaments` | Torneios de uma sessao |
| POST | `/api/grind-sessions/reset-tournaments` | Reset torneios da sessao |
| GET | `/api/session-tournaments/weekly-suggestions` | Sugestoes semanais |

## Upload & Import

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| POST | `/api/upload-history` | Upload de arquivo CSV/XLSX com parsing inteligente |
| DELETE | `/api/upload-history/:id` | Deletar registro de upload |

## Estudos

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET/POST | `/api/study-cards` | CRUD de cards de estudo |
| POST | `/api/study-cards/:id/progress` | Atualizar progresso |
| GET | `/api/study-correlation/:studyCardId` | Correlacao estudo-performance |
| GET/POST | `/api/study-schedules` | Agendamentos de estudo |
| PATCH | `/api/study-themes/:id` | Atualiza tema. **Sprint stats-themes-linking-1 (RF-01)**: agora aceita `linkedStats: string[]` (cap 30, valida cada ID contra `STAT_INDEX_BY_ID` ou `hudLayouts.fieldsJson` custom_*). Dedup automatico. Invalida `statsLinkedThemesCache` para previousIds ∪ nextIds. ADR-141. |
| GET | `/api/themes/:id/stats-summary` | **Sprint stats-themes-linking-1 (RF-05.5)** — Stats com `currentValue + sparkline30d + targetMin/Max + direction + groupId/Label` para detalhe do tema. Novo opcional (pode ser augmenting do GET tema existente — implementer decide). |

## Stats HUD & Linking

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/stats/:statId/linked-themes` | **Sprint stats-themes-linking-1 (RF-02)** — Reverse lookup: temas do user atual que linkam essa stat. Cache memoria TTL 60s key `${userId}:${statId}` (lesson #21). GIN index `idx_study_themes_linked_stats_gin`. p95 <50ms / cache hit <5ms. Response: `[{ themeId, name, slug, category }]` ordem `name ASC`. 404 se statId invalido (catalog OR custom_*). ADR-141. |
| PATCH | `/api/hud-layouts/:id` | Atualiza layout. **Sprint stats-themes-linking-1 (RF-08)**: aceita `fieldsJson[i].linkedThemes: string[]` (cap 20, valida ownership dos themes). Write-through **unidirecional** para `studyThemes.linkedStats` em transacao Drizzle: adiciona customStatId em themes adicionados, remove em themes removidos. Invalida cache. Lesson #7 (optional + default). ADR-141 §2.5. |

## Calendario

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET/POST/PUT/DELETE | `/api/calendar-categories` | CRUD categorias |
| GET/POST/PUT/DELETE | `/api/calendar-events` | CRUD eventos |
| GET | `/api/weekly-routine` | Rotina semanal |
| POST | `/api/weekly-routine/generate` | Gerar rotina automatica |

## Admin

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/admin/users` | Listar todos usuarios |
| POST | `/api/admin/users` | Criar usuario (admin) |
| PUT | `/api/admin/users/:id` | Editar usuario |
| DELETE | `/api/admin/users/:id` | Deletar usuario |
| PATCH | `/api/admin/users/:id/status` | Mudar status do usuario |
| GET | `/api/admin/access-logs` | Logs de acesso |
| GET | `/api/admin/dashboard-stats` | Stats do admin |
| GET | `/api/admin/monitoring` | Monitoramento do sistema |
| GET | `/api/admin/permission-profiles` | Perfis de permissao |
| POST | `/api/admin/apply-permissions-batch` | Aplicar permissoes em batch |
| GET | `/api/admin/data-metrics` | Metricas de dados |
| DELETE | `/api/admin/data-cleanup/:userPlatformId/:category` | Limpeza de dados |
| GET | `/api/admin/subscriptions` | Assinaturas (admin) |
| GET | `/api/admin/subscription-stats` | Stats de assinaturas |
| GET | `/api/admin/subscription-details` | Detalhes de assinaturas |
| POST | `/api/admin/extend-subscription` | Estender assinatura |
| POST | `/api/admin/update-subscription-plan` | Atualizar plano |
| GET | `/api/admin/subscription-history` | Historico de assinaturas |
| POST | `/api/admin/renew-subscription` | Renovar assinatura |
| GET | `/api/admin/billing-reports` | Relatorios de cobranca |

## Assinaturas & Pagamentos

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/subscription/status` | Status da assinatura |
| POST | `/api/subscription/create` | Criar assinatura |
| GET | `/api/subscription/history` | Historico de assinatura |
| GET | `/api/subscription/feature/:feature` | Verificar acesso a feature |
| POST | `/api/subscription/engagement` | Engagement da assinatura |
| GET | `/api/subscription-plans` | Listar planos |
| GET/POST/PUT/DELETE | `/api/subscriptions` | CRUD assinaturas |
| POST | `/api/subscriptions/check-expiration` | Verificar expiracao |
| POST | `/api/webhooks/payment` | Webhook de pagamento |

## Notificacoes

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/api/notifications` | Listar notificacoes |
| GET | `/api/notifications/unread-count` | Contagem de nao lidas |
| POST | `/api/notifications/:id/mark-read` | Marcar como lida |
| POST | `/api/notifications` | Criar notificacao |

## Bankroll Management

Detalhes em `Docs/api/bankroll.md` e `Docs/api/wallets.md`. Banca sempre em USD; conversao para BRL/outras feita pelo `currencyNormalizer`.

| Metodo | Endpoint | Auth | Rate Limit | Descricao |
|--------|----------|------|------------|-----------|
| GET | `/api/bankroll` | JWT | — | Estado atual da banca + regra + maxBuyIn derivado |
| PUT | `/api/bankroll` | JWT | 10/min | Atualiza amount e/ou rule. Cria snapshot se amount mudou |
| POST | `/api/bankroll/snapshot` | JWT | 10/min | Registra movimento manual (deposit/withdrawal/session_result/manual_adjustment/rakeback) |
| GET | `/api/bankroll/history` | JWT | — | Historico paginado + serie temporal + summary (cache TTL 5min) |

## Tournament Selector

Detalhes em `Docs/specs/tournament-selector.md`. Widget no `/coach` tab GradePlanner.

| Metodo | Endpoint | Auth | Cache | Descricao |
|--------|----------|------|-------|-----------|
| GET | `/api/tournament-selector` | JWT | 30min | Lista ranqueada por scoring 0-100 + grade S/A/B/C/D |
| GET | `/api/analytics/player-bundle` | JWT | 5min | Bundle agregado de analytics em 7 dimensoes |
| POST | `/api/tournament-selector/log` | JWT | — | Telemetria RF-07 (view / add_to_grid) |

## Coach AI

Detalhes em `Docs/api/coach.md` e `Docs/api/coach-tools.md`.

**Endpoints novos Sprint AI-1A (ADR-151/152/153/154):**

| Metodo | Endpoint | Auth | Descricao |
|--------|----------|------|-----------|
| GET | `/api/coach/onboarding` | JWT | Estado do onboarding: `{ completed, mode: 'full'\|'light'\|null, draft: {step,mode,startedAt}\|null, structuredProfile, levelEstimate\|null, hasImport }`. |
| PATCH | `/api/coach/onboarding` | JWT | Salva progresso parcial do wizard (sub-schema Zod do step atual) ou `{ skip: true }` (→ `onboardingSkippedAt`). |
| POST | `/api/coach/onboarding/complete` | JWT | Finaliza: `onboardingCompletedAt`/`onboardingVersion`, limpa `onboardingDraft`, sincroniza `tomPreferido`↔`coachTone` + grava toggles de nudge + quiet hours. |
| GET | `/api/coach/level-estimate` | JWT | Roda `estimatePlayerLevel` on-demand (`getDashboardStats`×2 + `getAnalyticsBySite` + `users.createdAt`); retorna `LevelEstimate`; **nao persiste**. |
| GET | `/api/coach/nudges` | JWT | Lista `coach_nudge_log` do usuario (`?status=&category=&limit=`), ordenado `sentAt desc`. |
| POST | `/api/coach/nudges/:id/dismiss` | JWT | `status='dismissed'` + dispara `checkAndFreezeCategory`. Idempotente. Ownership: `404` se id de outro user. |
| POST | `/api/coach/nudges/:id/snooze` | JWT | body `{ duration: 'short'\|'long' }` → snooze 1d / 30d (`status='snoozed'`, `snoozeUntil`). `400` se `duration` invalido. |
| POST | `/api/coach/nudges/:id/engage` | JWT | `status='engaged'`. Idempotente. |
| POST | `/api/coach/nudges/:id/unsubscribe` | JWT | `status='unsubscribed'` + `upsertCoachPreferences({ nudgeB<Cat>: false })` + `checkAndFreezeCategory`. |
| POST | `/api/coach/preferences/unfreeze` | JWT | body `{ category: NudgeCategory }` → remove `frozenCategories[category]`. `400` se categoria inexistente. |
| POST | `/api/admin/coach/freeze-category` | JWT + admin | body `{ userId, category, action: 'freeze'\|'unfreeze' }` → seta/remove `frozenCategories[category]` (`reason: 'admin'`). `403` se nao-admin. |
| GET | `/api/coach/preferences` | JWT | **estendido** — response ganha `frozenCategories: Record<category, { frozenAt, reason, dismissRate?, windowDays? }>`. |
| PUT | `/api/coach/preferences` | JWT | **estendido** — ganha `unfreezeCategory?` (so descongela; congelar via PUT → `400` Zod `.strict()`); espelha `coachTone` → `ai_structured_profile.tomPreferido`. |

**Frontend (rota nova):** `/coach-ai/onboarding` (protegida) → `CoachOnboarding` (wizard full/light). Banner `OnboardingBanner` em `/coach-ai` (aba chat) e `/inicio` quando `!onboardingCompletedAt`.

**Tools (registry, nao endpoints REST):**
- `read_theme_with_linked_stats_and_spots` — **Sprint stats-themes-linking-1 (RF-03 / ADR-142)** — extensao da tool legada `read_theme_with_linked_spots` com payload `stats[]` (currentValue + sparkline30d 30d + targetMin/Max + direction + isCustom) + `summary.stats_count/_in_range/_alarm`. Tier `pro/premium/admin`. Audit `log`. Description em arquivo dedicado `server/coachTools/readThemeWithLinkedStatsAndSpots.prompts.ts` (lesson #10).
- `read_theme_with_linked_spots` — **DEPRECATED alias** de `read_theme_with_linked_stats_and_spots`. Mesmo handler, emite `console.warn('[deprecation] ...')`. Sera removido em sprint stats-themes-linking-2.

## Bug Reports

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| POST | `/api/bug-reports` | Reportar bug |
| GET | `/api/bug-reports` | Listar bugs (admin) |
| GET | `/api/bug-reports/my` | Meus bug reports |
| GET | `/api/bug-reports/stats` | Estatisticas de bugs |
| GET | `/api/bug-reports/:id` | Detalhe do bug |
| PUT | `/api/bug-reports/:id` | Atualizar bug |
| DELETE | `/api/bug-reports/:id` | Deletar bug |

## Endpoints de Teste (pendente remocao em prod)

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| POST | `/api/test/email` | Teste de envio de email (admin) |
| GET | `/api/test/next-user-id` | Teste de geracao de ID |
