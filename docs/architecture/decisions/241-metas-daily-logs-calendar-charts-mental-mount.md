# ADR-241 — Metas: calendário + relatório diário + gráficos + acesso (Mental/Metas)

- Status: Accepted
- Data: 2026-06-04
- Contexto sprint: overhaul do módulo Metas (ADR-229/234 fatia-1/2) + montagem de superfícies órfãs.

## Contexto

O módulo Metas (4DX) tinha backend sólido (placar, pace, snapshots) mas:
1. UI crua (inputs nativos, métrica texto-livre, prazo sem date-picker, placar `<ul>` sem gráfico).
2. **Órfão na navegação** — rota `/metas` nunca linkada no Sidebar.
3. `MentalAnalyticsTab` (Fase B/C) construído mas **nunca montado** em produção.
4. **Bug de pace:** medidas (`goals`) não tinham coluna `deadline` → no scoreboard `deadline=now` → `span<=0` → `expectedNow` saturava em `target` imediatamente (pace nunca rampava).

## Decisão

### D1 — Datas explícitas + correção do pace
`ALTER goals ADD start_date, deadline` (nullable). Leitura aplica fallback `startDate ?? createdAt` e `deadline` derivado do horizon (`week 7d / month 30d / quarter 90d / season 365d`) via `resolveGoalWindow` em `server/routes/goals.ts`. Corrige o pace de raiz sem quebrar metas legadas.

### D2 — Relatório diário (calendário de metas)
Nova tabela `goal_daily_logs` (migration 0094): 1 row/user/dia (chave UTC `ymdUtc`), UNIQUE `(user_id, log_date)`. Campos: `measures_exercised jsonb` (medidas de direção exercidas), `note`, `tournaments_played`, `study_hours`, `study_content`, `learning`, `did_good`, `did_bad`. Enums Zod-only (sem CHECK DB), nullable sem default (lesson #7). Storage `goalDailyLogsStorage.ts` (attach pattern, upsert idempotente). Rotas: `GET/PUT /api/goals/daily-logs/:date`, `GET /api/goals/daily-logs?from=&to=` (registradas ANTES de `/:id` — DEC-A8). PUT tier-gated (`getReportTier!=='free'`).

### D3 — Gráfico planejado×executado
`GET /api/goals/:id/series` projeta `goal_progress_snapshots` → `[{weekStartDate, expected, executed}]`. Componente `MeasureLineChart` (Recharts) por medida. RF-06 mantido: série é da medida de direção (volume/estudo), **nunca P&L/ROI**.

### D4 — RF-06 no calendário
Cor da célula = estado de **processo** (relatório preenchido / vazio), **nunca por lucro**. Decisão do founder explícita: esconder P&L/ROI (fiel à spec + curso mental).

### D5 — Montar superfícies órfãs
- `/metas` reescrito com `PageHeader` + Tabs (Placar | Calendário). Testids preservados (contrato dos testes metas-1/metas-2); status cru em `sr-only` + rótulo PT visível.
- `MetasNovaPage` reescrito: shadcn `Input` + selects **nativos** (lesson #27) + `sourceMetric` dropdown + início/prazo date-picker + categoria/unidade/horizonte selecionáveis.
- `/analise-mental` (página nova) monta `MentalAnalyticsTab`. **NÃO** reusa `/mental` (= Warm Up).
- Sidebar grupo VISÃO ganha 2 itens: `Metas` (Target) + `Mental` (Activity).

### D6 — Integração Coach (contexto + tool, sem nudge)
- Bloco de contexto `## Metas & Relatório do dia` em `coachContext.ts` (best-effort, linguagem A4, sem P&L).
- Tool de escrita `log_daily_goal_report` (`gateByTier pro/premium/admin`, `requiresConfirmation`, preview/executeConfirmed/undo) → upsert `goal_daily_logs`.
- **Sem nudge** (decisão founder) → `cronRunner.ts` intocado (evita colisão com sessão paralela do Coach).

### D7 — Modernização UI (página única) + consistência
Página `/metas` reescrita em PÁGINA ÚNICA (sem abas, M2): Hero "Placar da Semana" (veredito por maioria de status + faixa de consistência, M1) → WIG banner-norte (M9) → CoachNudgeCard (cobrança contextual A4, M5) → Medidas grid com barra de pace dupla atual×esperado + filtro de horizonte (M3/M15) → Calendário inline (M2/M7). Empty-state onboarding 4DX (M6). Modal do dia em 3 seções (M11). Novo `GET /api/goals/consistency` (streak + dias preenchidos, computado de `goal_daily_logs`, gamificação de PROCESSO — RF-06). Componentes: `ScoreboardHero`, `WigBanner`, `MeasureCard`, `CoachNudgeCard`, `MetasEmptyState`. Testids do contrato metas-1/metas-2 preservados.

### D8 — Métricas de resultado com fonte selecionável
Novas métricas `profit`, `volume` (+ `roi_pct`/`itm_pct`/`abi` já existentes) com **fonte de dado selecionável** via sufixo `<base>@grind` / `<base>@history` (`parseMetricSource`; sem sufixo = histórico, back-compat). **Grind** (profit = soma `grind_sessions.profitLoss` USD-equiv na janela da meta; volume = count de `session_tournaments`) vs **Histórico** (`getPerformanceByPeriod` com FX). `roi_pct`/`itm_pct`/`abi` ficam **só no histórico** — `session_tournaments` não tem coluna currency, então ROI/ABI multi-moeda do grind seria não-confiável (`GRIND_CAPABLE_METRICS = {profit, volume}`). Métricas de **resultado** (`profit`/`roi_pct`/`itm_pct`/`abi`) são **só WIG** (`RESULT_ONLY_METRICS`; RF-04 — não-controláveis não são medida de direção); `volume` é controlável → permitido como medida. Métricas de resultado agregam sobre a **janela completa da meta** (início→agora), não a semana. Dropdown em `/metas/nova` filtra métricas por tipo + mostra seletor "Fonte do dado" só para profit/volume. **Decisão:** a fonte ser opcional dispensa a ferramenta de backfill de sessões (o jogador sem sessões registradas escolhe "histórico importado").

## Consequências

- Migration 0094 aplicada LOCAL (localhost:5433). **PROD (Neon) pendente** no deploy.
- WIG continua usando `career_goals.createdAt` + `targetDeadline` (start explícito da WIG não persistido — informacional). Débito menor.
- Não plugou o relatório diário como fonte do scoreboard (mantém agregação real de `aggregateCurrentValue`); o daily log é artefato de accountability + contexto do Coach.
- Falha pré-existente date-dependent em `metas-2-scoreboard-leak-focus.test.ts` (grind sessions com datas fixas vs `new Date()` real) — não relacionada a esta sprint.
