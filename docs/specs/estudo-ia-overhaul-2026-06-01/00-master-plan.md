# Estudo + IA Overhaul — Master Plan (2026-06-01)

> Plano-mãe para o overhaul do sistema de Estudos + Mentor IA. Decompõe o pedido do founder em 6 sprints sequenciáveis. Cada sprint roda o pipeline TDD padrão (`pm-spec → system-architect → test-writer → implementer → /simplify → reviewer`). Prompts copy-paste por sessão em `session-prompts.md`.

## 0. Contexto / Estado atual (verificado via exploração 2026-06-01)

### Estudos (já existe, rico)
- `study_sessions_v2` (ADR-126/130): `mode` (`drill_gto|tournament_review|hand_review|lesson|other`), `source`, `status` (`running|completed`), `themeId`, `tournamentId`, `lessonId`, `starredHandIds[]`, `drillPlatform`, `drillAccuracy`, `difficultSpots[{context,note}]`, `durationMinutes`, `idlePeriods[]`, `notes`, `attachments[{key,url}]` (cap 5), `wasProductive`, `dailyGoalMet`, `xpAwarded`, soft delete 24h.
- `study_themes` (linkedStats[] cap 30, linkedLessons[], slug, isCurated, category, progress) + `study_tabs`.
- Spots = `starredHands` (`imageUrl`, notes, conclusion, reviewLater) ↔ `study_theme_spot_links` (reasoningText, N:N).
- Stats: HUD catalog (`shared/hud-stat-catalog.ts`), `user_focus_stats` (statId ↔ themeId ↔ month, cap 3/mês), HUD layouts + snapshots + compare + OCR import (`statsAnalyzer.ts`).
- Imagens privadas: `spotImageStorage` (LocalFs, `private-uploads/spots/`, ADR-057). Study images públicas em `uploads/study-images/`.
- Páginas: `/estudos/{dashboard,temas,temas/:id,sessao/:id,sessoes,stats,spots,recomendacoes,reentry}`.

### Coach reports (TODOS shipped, mas não chegam ao jogador)
- Geradores Weekly (AI-1B) + Daily Debrief + Monthly (AI-1C) implementados e crons rodando (`reportJobRunner.ts`, `cronRunner.ts`, boot em `server/index.ts`).
- **GAP raiz:** opt-ins (`reportWeeklyEnabled/reportDailyEnabled/reportMonthlyEnabled` em `user_coach_preferences`) **default `false`** + zero onboarding + relatórios só aparecem na aba escondida `/coach-ai` "Relatórios e avisos". Nenhum push de segunda.
- Daily Debrief wirado em `handleUpdateGrindSession` (`PUT /api/grind-sessions/:id` status=completed), mas short-circuit se `reportDailyEnabled !== true`.
- Eligibilidade: `getReportTier` (`server/coach/reportEligibility.ts`) — Trial/Pro/Premium/admin = `eligible`; free/expired = `free` (nunca recebe).
- Kill switch global: `COACH_NUDGES_ENABLED` (default ON).
- Email pipeline existe (AI-2B): Gmail SMTP, HMAC unsubscribe, `email_weekly_enabled/email_monthly_enabled`, `UNSUBSCRIBE_SECRET_MISSING` se env ausente.

### Grind notes / break reports (dados ricos, provavelmente não lidos pelo report)
- `grind_sessions`: `notes`, `preparationNotes`, `dailyGoals`, `finalNotes`, `objectiveCompleted`, + médias `focoMedio/energiaMedia/confiancaMedia/inteligenciaEmocionalMedia/interferenciasMedia`.
- `break_feedbacks`: por break — `foco/energia/confianca/inteligenciaEmocional/interferencias` (0-10) + `notes` + `breakTime` + `sessionId`. **Esta é a "flutuação de notas em meio à sessão"** que o founder quer que o mentor leia.
- `POST /api/break-feedbacks`, `PUT /api/grind-sessions/:id` (finalNotes).

### Sharkscope / histórico
- `parseSharkScopeFormat` (`csvParser.ts:1158`) já existe; `POST /api/upload-history`.
- Histórico = `tournaments WHERE grind_session_id IS NULL` (§6.1 CLAUDE.md). 7d via `buildPeriodCondition`.

## 1. Decisões travadas (founder, 2026-06-01)
| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Canal de entrega da mensagem de segunda | In-app notif+banner **+** email (reusa AI-2B) **+** mensagem no chat do Coach (todos) |
| D2 | Opt-in dos relatórios | **Default ON** p/ elegíveis (opt-out) + back-fill prefs + banner explicando |
| D3 | Estrutura da segunda | **Ritual interativo multi-step**: recap → pede upload sharkscope → na confirmação analisa 7d → guia plano da semana |
| D4 | Análise de stats (print jogada + print solução + insight, por stat, no tema) | **Estender `study_sessions_v2`** (não tabela nova). Tradeoff aceito: precisa de `statId` + estrutura jsonb dedicada + índice por tema/stat pra revisão (ver EST-3 §risco) |
| D5 | Email default | **Default ON** (igual in-app). Opt-out via `email_weekly_enabled`. |
| D6 | Back-fill prefs | **Back-fill TODOS os elegíveis pra `true`** (feature era invisível → não existem desligamentos conscientes). Sem coluna sentinel. Default da coluna vira `true`; opt-out normal daqui pra frente. |
| D7 | EST-3 vs EST-4 | **Combinados em 1 sprint (EST-3)** — mesmo form de registro + mesma migration em `study_sessions_v2`. EST-4 absorvido. |

## 2. Sprints

```
EST-1  Coach Weekly Delivery & Enablement      (quick win, destrava a queixa)
EST-2  Weekly Report Data Enrichment           (lê break_feedbacks + grind notes + métricas de estudo)
EST-3  Study Recording + Stat Analysis         (D7: NET-NEW print jogada+solução+insight por stat + handsSolved/filtros/aula+insights)
EST-5  Interactive Monday Ritual (sharkscope-gated weekly review)
EST-6  Next-Week Planning Flow                 (grind days/tempo/estudo/aulas/temas guiado)
```
> EST-4 absorvido em EST-3 (D7).

### Grafo de dependências / ordem sugerida
```
EST-1 ─┬───────────────────► EST-5 ──► EST-6
       │                        ▲
EST-3 ─┴─► EST-2 ────────────────┘
           (EST-2 pode shippar com métricas parciais e re-estender)
```
- **EST-1 primeiro** — destrava a queixa principal (mentor silencioso) sem depender de nada.
- **EST-3** (study-side, NET-NEW) produz as métricas que EST-2 consome.
- **EST-2** depende idealmente de EST-3 pras métricas de estudo, mas pode shippar lendo break_feedbacks+grind notes primeiro e re-estender depois.
- **EST-5** depende de EST-1 (entrega) + EST-2 (dados enriquecidos).
- **EST-6** é a etapa final do ritual EST-5; pode ser construído em paralelo a EST-5 e plugado no fim.

### EST-1 — Coach Weekly Delivery & Enablement
**Objetivo:** mentor volta a falar. Relatório semanal chega ao jogador segunda de manhã.
**Escopo:**
- Migration (D6): flip `reportWeeklyEnabled/reportDailyEnabled/reportMonthlyEnabled` + `email_weekly_enabled/email_monthly_enabled` default `true`; back-fill TODAS as prefs existentes de elegíveis (Trial/Pro/Premium/admin) p/ `true`. Sem coluna sentinel — feature era invisível, não há desligamento consciente. Opt-out normal daqui pra frente.
- Entrega tripla (D1): (a) notificação in-app (`notifications` + deep_link pro relatório) + banner segunda; (b) email via pipeline AI-2B (gate `email_weekly_enabled`, default ON — D5); (c) post no chat do Coach (`coach_conversations`/`coach_messages`) como turno do mentor linkando o relatório.
- Discoverability: badge/banner em `/coach-ai` + atalho no /inicio.
**Out of scope:** mudar conteúdo do report (EST-2), ritual interativo (EST-5).
**Riscos:** email default ON → volume; reusar HMAC unsubscribe do AI-2B (lança `UNSUBSCRIBE_SECRET_MISSING` se env ausente — garantir env). Idempotência da entrega (não mandar 2x se processor reprocessa).

### EST-2 — Weekly Report Data Enrichment
**Objetivo:** mentor interpreta break reports + notas de grind + estudo.
**Escopo:**
- Bundle builder do `weeklyReportGenerator` passa a ler: `break_feedbacks` (séries foco/energia/confiança/IE/interferências ao longo da semana + flutuação intra-sessão + médias por sessão), `grind_sessions.{finalNotes,preparationNotes,dailyGoals,objectiveCompleted}`, e métricas de estudo da semana (tempo total, # sessões, mãos solucionadas, filtros analisados, tempo por tema, # entradas de análise-de-stat — quando EST-3/4 existirem).
- Prompt do report instrui o mentor a **interpretar qualitativamente** as notas de break/final e correlacionar com performance (ex: foco caindo no fim da sessão → leak de fadiga).
- `ReportContent` v2 ganha seções: "Estado mental da semana" (break analysis) + "Estudo da semana".
**Out of scope:** sharkscope 7d deep (EST-5), planejamento (EST-6).
**Riscos:** custo LLM (bundle maior → sumarização Haiku já existe, ver `reportSummarizer.ts` threshold 20K chars). FX em valores se cruzar com torneios.

### EST-3 — Study Recording + Stat Analysis (NET-NEW, D7: EST-4 absorvido)
**Objetivo:** (a) jogador filtra por stat, salva print da jogada + print da solução + insight (errou/aprendeu), salvo no tema sob aquela stat, revisável depois; (b) registro de estudo enriquecido (mãos solucionadas, filtros analisados, aula + insights da aula).
**Escopo (estendendo `study_sessions_v2` — D4; tudo em 1 migration + 1 refactor do form):**
- Schema parte A (análise-de-stat): novo `mode='stat_analysis'`; coluna `statId varchar(64)` (catalog ou custom_*); coluna jsonb `statAnalysisEntries` = `[{ filters: {...}|string, playImageKey, solutionImageKey, errorText, learnedText }]` (cap ~10). Storage privado dedicado (reusar `spotImageStorage` pattern → `private-uploads/stat-analysis/`).
- Schema parte B (registro polish): `handsSolvedCount int`, `filtersAnalyzedCount int`, `lessonInsights text`. `lessonId` já existe. Seguir lesson #7 (optional+default+back-fill, não required puro).
- Endpoints: criar/editar sessão (`stat_analysis` + demais modes) + upload de imagens (play + solução) por entrada. Multipart, MIME guard, cap 5MB.
- UI: form de registro UNIFICADO — campos por `mode`; modo `stat_analysis` a partir de uma stat (StatsView / ThemeDetailView) → "Analisar esta stat" → filtros usados + adicionar jogadas (print jogada + print solução + erro + aprendizado).
- Surface: ThemeDetailView lista entradas de análise por stat; `/estudos/sessao/:id` mostra entradas + counts.
- Métricas (counts, tempo por tema, # entradas stat_analysis) alimentam EST-2.
**Risco (D4 tradeoff):** `study_sessions_v2` é session-level; pra ser revisável "por stat dentro do tema" precisa de `statId` + índice `(userId, themeId, statId, mode)`. **Architect deve adicionar índice + método storage `getStatAnalysisEntries(userId, themeId, statId?)`.**

### EST-5 — Interactive Monday Ritual (sharkscope-gated weekly review)
**Objetivo:** o ritual de segunda completo (D3).
**Escopo:**
- Máquina de estados "Weekly Review" por usuário/semana: `recap_sent → awaiting_upload → upload_confirmed → deep_analysis_done → planning`.
- Segunda de manhã: mentor envia recap (dados EST-2) + CTA "fizemos upload do sharkscope dos últimos 7 dias?".
- Jogador confirma upload (botão/endpoint de confirmação OU detecção de novo import nas últimas 24h via `upload-history`).
- Na confirmação: mentor roda análise profunda 7d combinando histórico (`tournaments WHERE grind_session_id IS NULL`, últimos 7d), grind reports (break_feedbacks + finalNotes) e estudo (EST-3/4 métricas).
- Conversacional (chat do Coach) + persistência da revisão.
**Out of scope:** plano da semana detalhado (EST-6, mas é o próximo passo do estado `planning`).
**Riscos:** detecção de "confirmou upload" — preferir sinal explícito (botão) + fallback heurístico (import recente). Idempotência (1 ritual/semana). Reusa `getReportTier`.

### EST-6 — Next-Week Planning Flow
**Objetivo:** mentor guia o plano da próxima semana: dias de grind, tempo, estudo, quais aulas, quais temas focar.
**Escopo:**
- Wizard/conversa que gera: dias+horas de grind (→ `planned_tournaments`/weekly-plan grade), bloco de estudo (→ `study_sessions_v2` planned ou `study_weekly_plans`), aulas sugeridas (`coach_lesson_recommendations` / tool `recommend_lesson`), temas-foco (derivados dos leaks + análise EST-2/5).
- Plugado no estado `planning` do EST-5.
- Persistência em `study_weekly_plans` (já preenchido pelo weekly report hoje) + grade.
**Out of scope:** execução automática da grade.

## 3. Pendências / perguntas pro founder — RESOLVIDAS (2026-06-01)
- ~~Email default ON ou opt-in?~~ → **D5: default ON.**
- ~~Back-fill respeita quem desligou?~~ → **D6: back-fill todos elegíveis, sem sentinel (feature invisível).**
- ~~EST-3 e EST-4 = 1 ou 2 sprints?~~ → **D7: 1 sprint (EST-3), EST-4 absorvido.**

## 4. Convenções a respeitar (todos os sprints)
- Pipeline TDD (CLAUDE.md §11). `/simplify` pós-implementer, reviewer antes de merge.
- Imagens: storage privado (`spotImageStorage` pattern, ADR-057). Nunca público pra prints de solução (copyright GTO tools).
- §6.1: dashboard/analytics filtram `grind_session_id IS NULL`; detalhe de sessão e Daily Debrief usam `session_tournaments`.
- Lessons-learned: #14/#26/#38 (require vs import em test .tsx — usar `await import`), #29 (useQuery sem provider → ErrorBoundary), #34 (handler aceita injectedStorage 3º arg), #5/#35 (Anthropic SDK `new` em try/catch), #6 (FX→USD antes de comparar).
- Migrations: drizzle-kit, rollback `_rollback.sql`, aplicar via psql local (localhost:5433) + documentar pendência prod.
```
