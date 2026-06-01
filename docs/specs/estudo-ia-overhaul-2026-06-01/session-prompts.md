# Session Prompts — Estudo + IA Overhaul

> Cole UM prompt por sessão nova. Cada um é auto-contido (CLAUDE.md já carrega no boot). Rode na ordem do grafo (`00-master-plan.md` §2). Cada prompt dispara o pipeline TDD.
>
> **Antes de cada sprint MEDIUM+**: `/consult-hub`. **Após bug >2h / descoberta**: `/post-learning`.

---

## EST-1 — Coach Weekly Delivery & Enablement

```
Sprint EST-1: Coach Weekly Delivery & Enablement. Leia Docs/specs/estudo-ia-overhaul-2026-06-01/00-master-plan.md §EST-1 + §0 (estado atual) + §1 (decisões D1/D2).

Problema: geradores Weekly/Daily/Monthly do Coach estão shipped e os crons rodam, mas NADA chega ao jogador — opt-ins (reportWeeklyEnabled/reportDailyEnabled/reportMonthlyEnabled em user_coach_preferences) default false + zero discoverability + relatórios só na aba escondida /coach-ai "Relatórios e avisos".

Objetivo: o relatório semanal chega ao jogador segunda de manhã por 3 canais (D1): notificação in-app + banner, email (reusa pipeline AI-2B), e mensagem no chat do Coach. Opt-in vira default ON pra elegíveis (D2/D5/D6) + banner.

Decisões travadas (NÃO re-perguntar):
- D5: email TAMBÉM default ON (email_weekly_enabled/email_monthly_enabled). Reusar HMAC unsubscribe do AI-2B — garantir UNSUBSCRIBE_SECRET no env (lança UNSUBSCRIBE_SECRET_MISSING se ausente).
- D6: migration flip default true em reportWeeklyEnabled/reportDailyEnabled/reportMonthlyEnabled/email_weekly_enabled/email_monthly_enabled + back-fill TODAS as prefs de elegíveis (Trial/Pro/Premium/admin) pra true. SEM coluna sentinel — feature era invisível, não há desligamento consciente. Opt-out normal daqui pra frente.
- Entrega idempotente (não mandar 2x se processor reprocessa).

Escopo travado em §EST-1. NÃO mexer no conteúdo do report (EST-2) nem no ritual interativo (EST-5).

Rode o pipeline: /consult-hub → pm-spec → system-architect (ADR + migration plan) → test-writer → implementer → /simplify → reviewer. Respeite lessons #34 (injectedStorage), #29 (useQuery+ErrorBoundary). Migration drizzle-kit + rollback. Confirme onde startCoachCrons/reportJobRunner logam no boot pra eu validar.

FINALIZAÇÃO (founder autorizou — nada pendente): após reviewer aprovar + tsc 0 + testes verdes → (1) aplique a migration no psql local (localhost:5433) e commite o .sql + _rollback.sql; (2) git status + confirme branch; git add EXPLÍCITO só dos arquivos deste sprint — NUNCA git add -A (working tree compartilhado com feature Calculadoras de outra sessão); (3) commit conventional + Co-Authored-By; (4) git push origin main. Migration de PROD aplica no deploy (Neon) — documente em CLAUDE.md §6. Atualize memory + MEMORY.md pointer + /session-report se >50k tokens.
```

---

## EST-2 — Weekly Report Data Enrichment

```
Sprint EST-2: Weekly Report Data Enrichment. Leia Docs/specs/estudo-ia-overhaul-2026-06-01/00-master-plan.md §EST-2 + §0.

Objetivo: o relatório semanal do mentor passa a LER e INTERPRETAR: (a) break_feedbacks da semana — séries foco/energia/confiança/inteligenciaEmocional/interferencias (0-10) ao longo das sessões + flutuação intra-sessão + médias; (b) grind_sessions.{finalNotes,preparationNotes,dailyGoals,objectiveCompleted}; (c) métricas de estudo da semana (tempo total, # sessões, mãos solucionadas, filtros analisados, tempo por tema, # entradas de análise-de-stat — quando EST-3 existirem; degrade gracioso se ainda não existir).

O prompt do mentor deve interpretar QUALITATIVAMENTE as notas de break e de fim de grind (ex: foco caindo no fim da sessão = leak de fadiga) e correlacionar com performance. ReportContent v2 ganha seções "Estado mental da semana" + "Estudo da semana".

PRIMEIRO confirme no código o que o bundle do weeklyReportGenerator já lê hoje (server/services/weeklyReportGenerator.ts + reportGeneratorShared.ts) — pode já puxar parte. Reporte o diff antes de escrever spec.

Out of scope: sharkscope 7d (EST-5), planejamento (EST-6).

Rode: /consult-hub → pm-spec → system-architect → test-writer → implementer → /simplify → reviewer. Atenção custo LLM (sumarização Haiku em reportSummarizer.ts threshold 20K chars) + FX→USD (lesson #6) se cruzar torneios. Ao mexer no SDK Anthropic, invoque /claude-api.

FINALIZAÇÃO (founder autorizou — nada pendente): após reviewer aprovar + tsc 0 + testes verdes → (1) se houver migration, aplique no psql local (localhost:5433) + commite .sql + _rollback.sql; (2) git status + confirme branch; git add EXPLÍCITO só dos arquivos deste sprint — NUNCA git add -A (working tree compartilhado); (3) commit conventional + Co-Authored-By; (4) git push origin main. Migration de PROD aplica no deploy (Neon) — documente em CLAUDE.md §6. Atualize memory + MEMORY.md pointer + /session-report se >50k tokens.
```

---

## EST-3 — Study Recording + Stat Analysis (NET-NEW, EST-4 absorvido)

```
Sprint EST-3: Study Recording + Stat Analysis. Leia Docs/specs/estudo-ia-overhaul-2026-06-01/00-master-plan.md §EST-3 + §0 (study_sessions_v2, spotImageStorage, HUD stats) + §1 D4/D7.

D7 travado: EST-4 (registro polish) foi ABSORVIDO neste sprint — mesma migration + mesmo form de registro. Faça as duas partes juntas.

Parte A — Análise de stats (NET-NEW): o jogador filtra suas jogadas por uma stat (HUD) e salva — por jogada — print da jogada + print da solução do spot + texto de insight (o que errou / o que aprendeu). Tudo dentro do tema, sob aquela stat, revisável depois.
Parte B — Registro de estudo enriquecido: mãos solucionadas (count), filtros de mãos analisados (count), aula assistida (lessonId já existe) + insights da aula.

Decisão D4 travada: ESTENDER study_sessions_v2 (não criar tabela nova). Plano (1 migration):
- Parte A: mode='stat_analysis' novo; coluna statId varchar(64) (catalog id ou custom_*); coluna jsonb statAnalysisEntries = [{ filters, playImageKey, solutionImageKey, errorText, learnedText }] (cap ~10). Imagens em storage PRIVADO reusando pattern spotImageStorage (ADR-057) → private-uploads/stat-analysis/. NUNCA público (prints de solução GTO = copyright). MIME guard, 5MB.
- Parte B: handsSolvedCount int, filtersAnalyzedCount int, lessonInsights text. Lesson #7 (optional+default+back-fill, não required puro).
- Endpoints: criar/editar sessão (stat_analysis + demais modes) + upload por entrada (play + solução). Pattern injectedStorage (lesson #34).
- UI: form de registro UNIFICADO, campos por mode; modo stat_analysis a partir de uma stat (StatsView / ThemeDetailView) → "Analisar esta stat" → filtros + adicionar jogadas → salvar sob tema+stat. Surface em ThemeDetailView (lista por stat) + /estudos/sessao/:id (entradas + counts).

RISCO crítico (apontar pro architect): study_sessions_v2 é session-level; pra revisão "por stat dentro do tema" precisa de índice (userId, themeId, statId, mode) + método storage getStatAnalysisEntries(userId, themeId, statId?). Architect DEVE resolver no ADR.

Rode: /consult-hub → pm-spec → system-architect (ADR + migration + índice + diagrama component-tree) → test-writer → implementer → /simplify → reviewer. Lessons: #14/#26/#38 (await import em test .tsx, NUNCA require), #29 (useQuery+ErrorBoundary), #34, #16 (DOMPurify se renderizar conteúdo), #7.

FINALIZAÇÃO (founder autorizou — nada pendente): após reviewer aprovar + tsc 0 + testes verdes → (1) aplique a migration no psql local (localhost:5433) + commite .sql + _rollback.sql; (2) git status + confirme branch; git add EXPLÍCITO só dos arquivos deste sprint — NUNCA git add -A (working tree compartilhado com feature Calculadoras de outra sessão); (3) commit conventional + Co-Authored-By; (4) git push origin main. Migration de PROD aplica no deploy (Neon) — documente em CLAUDE.md §6. Atualize memory + MEMORY.md pointer + /session-report se >50k tokens.
```

---

## EST-5 — Interactive Monday Ritual (sharkscope-gated weekly review)

```
Sprint EST-5: Interactive Monday Ritual. Leia Docs/specs/estudo-ia-overhaul-2026-06-01/00-master-plan.md §EST-5 + §0 + §1 D3. DEPENDE de EST-1 (entrega) + EST-2 (dados enriquecidos) — confirme que shiparam.

Objetivo (D3 — ritual interativo multi-step): toda segunda de manhã o mentor:
1. Envia recap da semana anterior (dados EST-2: performance + estado mental via break_feedbacks + estudo).
2. Pede ao jogador pra fazer upload do histórico sharkscope dos últimos 7 dias.
3. Quando o jogador CONFIRMA o upload, o mentor roda análise profunda dos últimos 7 dias combinando: histórico (tournaments WHERE grind_session_id IS NULL, últimos 7d via buildPeriodCondition), grind reports (break_feedbacks + finalNotes interpretados), e estudo (tempo, mãos solucionadas, filtros analisados, tempo por tema, entradas de análise-de-stat — EST-3).
4. Encaminha pro plano da próxima semana (estado 'planning' → handoff pro EST-6).

Escopo: máquina de estados "Weekly Review" por usuário/semana (recap_sent → awaiting_upload → upload_confirmed → deep_analysis_done → planning), idempotente (1/semana, reusa getReportTier). Confirmação de upload: sinal EXPLÍCITO (botão/endpoint) + fallback heurístico (import nas últimas 24h via upload-history). Conversacional no chat do Coach + persistência.

Out of scope: o plano detalhado em si (EST-6) — só fazer o handoff.

Rode: /consult-hub → pm-spec → system-architect (ADR + diagrama de estados + sequência) → test-writer → implementer → /simplify → reviewer. /claude-api ao mexer no SDK. Lessons #6 (FX→USD), #9 (logue antes de fallback), #34.

FINALIZAÇÃO (founder autorizou — nada pendente): após reviewer aprovar + tsc 0 + testes verdes → (1) se houver migration (tabela de estado weekly_review), aplique no psql local (localhost:5433) + commite .sql + _rollback.sql; (2) git status + confirme branch; git add EXPLÍCITO só dos arquivos deste sprint — NUNCA git add -A (working tree compartilhado); (3) commit conventional + Co-Authored-By; (4) git push origin main. Migration de PROD aplica no deploy (Neon) — documente em CLAUDE.md §6. Atualize memory + MEMORY.md pointer + /session-report se >50k tokens.
```

---

## EST-6 — Next-Week Planning Flow

```
Sprint EST-6: Next-Week Planning Flow. Leia Docs/specs/estudo-ia-overhaul-2026-06-01/00-master-plan.md §EST-6 + §0. Plugado no estado 'planning' do EST-5 (confirme EST-5 shipado, ou construa o flow standalone e plugue depois).

Objetivo: o mentor guia o jogador a montar o plano da próxima semana: dias de grind + horas, blocos de estudo + tempo, quais aulas assistir, quais temas focar.

Escopo: wizard/conversa que gera:
- Dias+horas de grind → planned_tournaments / weekly-plan grade.
- Bloco de estudo → study_sessions_v2 (planned) ou study_weekly_plans.
- Aulas sugeridas → coach_lesson_recommendations / tool recommend_lesson.
- Temas-foco → derivados dos leaks + análise EST-2/EST-5.
Persistência em study_weekly_plans (já preenchido pelo weekly report hoje — NÃO duplicar chave de semana, ver CLAUDE.md §10 sobre BRT/UTC keys) + grade.

PRIMEIRO confirme como study_weekly_plans e a grade (planned_tournaments + weekly-plans) são populados hoje pra não conflitar.

Out of scope: execução automática da grade.

Rode: /consult-hub → pm-spec → system-architect → test-writer → implementer → /simplify → reviewer. Lessons #19 (CTA targets = rotas Wouter registradas — grep "Route path" client/src/App.tsx), #34.

FINALIZAÇÃO (founder autorizou — nada pendente): após reviewer aprovar + tsc 0 + testes verdes → (1) se houver migration, aplique no psql local (localhost:5433) + commite .sql + _rollback.sql; (2) git status + confirme branch; git add EXPLÍCITO só dos arquivos deste sprint — NUNCA git add -A (working tree compartilhado); (3) commit conventional + Co-Authored-By; (4) git push origin main. Migration de PROD aplica no deploy (Neon) — documente em CLAUDE.md §6. Atualize memory + MEMORY.md pointer + /session-report se >50k tokens.
```

---

## Notas operacionais
- **Founder autorizou commit + push + migration no fim de CADA sprint — nada pendente.** (Sobrescreve CLAUDE.md §13 pra este overhaul.)
- **Working tree compartilhado** (várias sessões paralelas — ver INCIDENT #24/#45 na memória): `git add` EXPLÍCITO por arquivo, NUNCA `git add -A`. Confirme branch com `git status` antes de commitar. NÃO arrastar a feature Calculadoras (App/Sidebar/bankroll/admin/Dashboard/analytics/calculatorTools) de outra sessão.
- Migrations: aplicar via psql local (localhost:5433) + commitar .sql + _rollback. PROD aplica no deploy (Neon) — documentar em CLAUDE.md §6.
- Pós-sessão >50k tokens: `/session-report`. Atualizar memory + MEMORY.md pointer.
```
