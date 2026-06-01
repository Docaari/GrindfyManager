# Spec: Sprint METAS-1 — Ferramenta de Metas 4DX (fatia-1, core-first)

> **Recorte de implementação** do master spec `Docs/specs/metas-tool-2026-06-01.md` (fonte de verdade do domínio — 15 RFs, esqueleto 4DX, mapa `sourceMetric`→fonte, taxonomia, decisões abertas). Esta spec **não reabre** o domínio; recorta a **fatia-1** definida em `Docs/strategy/estrategia-sprints-finais-2026-06-01.md §2.3` e aponta os conflitos de schema para o architect decidir.
>
> Estratégia-mãe (roadmap, fonte de verdade): `Docs/strategy/estrategia-sprints-finais-2026-06-01.md` (board ICE, sequência de fases). Doutrina/curso: `Docs/strategy/curso-antes-das-cartas-learnings-2026-06-01.md` (cada decisão ancora numa aula `A2`/`C7`/`D9`… ou numa das 4 Disciplinas `D1`–`D4`).
>
> Pipeline TDD: `pm-spec (este) → system-architect → test-writer → implementer → /simplify → reviewer`.

## Status
Proposta

## Resumo
Primeira fatia de entrega da Ferramenta de Metas 4DX. Entrega o **núcleo executável e auto-suficiente**: schema (3 tabelas novas + migration), **CRUD de metas** (WIG + medidas de direção, com as validações de doutrina), **placar read-only "onde estou × onde deveria estar"** (pace line linear, status derivado, esconde P&L curto), **snapshots semanais idempotentes** (UTC), e a **UI React** (`/metas` placar + `/metas/nova` criação). O "realizado" vem de **agregação direta read-only** do dado já capturado — **sem** depender do motor de aderência fino (ADR-227), que a fatia-2 plugará depois. Entrega ~70% do valor da ferramenta sem o motor (estratégia §2.3, decisão 2 ACEITA).

## Contexto
- **Por que esta fatia agora:** a sequência de sprints finais (estratégia §4) posiciona METAS-1 **após** Fase A (motor de aderência, JÁ SHIPADO — ADR-227) e Fase B (lead measures #1/#2, JÁ SHIPADO — c91a6808). A fatia-1 destrava o **placar 4DX** + a base de CRUD/snapshot sobre a qual a fatia-2 (compliance fino) e METAS-1.1 (coach co-define/cobra) se penduram.
- **Por que fatia-1 não depende do motor:** o `getPlannedVsActual` (ADR-227) compara **plano-vs-realizado fino** (planejou 4 sessões com warm-up, fez 2 sem). A fatia-1 usa o proxy **"realizado vs alvo da medida"** via agregação direta (count/sum) — suficiente para preencher `currentValue` do placar. A fatia-2 substitui a agregação por `compliancePct` rigoroso do motor (downgrade documentado em §Fora de Escopo).
- **Decisões já travadas pelo founder** (não reabrir): **DEC-A6** a WIG estende `career_goals` (estratégia §2.2); **DEC-A2** placar read-only para todos, criação/edição gated `getReportTier(user) !== 'free'` (estratégia §3, espelha EST-5/6).

## Usuários
- **Jogador (Trial / Pro / Premium / Admin = `eligible`):** define WIG + medidas de direção, vê o placar, consulta snapshots. Cria/edita metas (gated `getReportTier !== 'free'`).
- **Jogador (Free / expired):** **placar read-only** das metas que já tenha (se houver); **403** em criar/editar (DEC-A2).
- **Snapshot tick (cron, server-side):** congela 1 snapshot/meta/semana (sem interação humana — RF-08).

> **Fora desta fatia:** Coach AI co-definindo (RF-13) e cobrando na cadência (RF-09) — METAS-1.1. Aqui o Coach **não** participa.

---

## Esqueleto 4DX cobertor por esta fatia

| Disciplina | Coberta na fatia-1? | RFs in-scope | Defere |
|---|---|---|---|
| **D1 — Meta Global (WIG)** | ✅ CRUD + validação | RF-01, RF-02 (vínculo) | — |
| **D2 — Medidas de Direção** | ✅ CRUD + validação preditiva/influenciável | RF-03, RF-04, RF-05 (agregação direta) | motor fino → fatia-2 |
| **D3 — Placar Convincente** | ✅ placar + pace + snapshots | RF-06, RF-07, RF-08 | — |
| **D4 — Cadência de Responsabilização** | ❌ | — | RF-09 (cobrança A4) → METAS-1.1 |

---

## Requisitos Funcionais (apenas in-scope; mantida a referência ao RF do master)

### RF-01 (= master RF-01): Definir a Meta Global (WIG) — D1
**Descrição:** jogador cria 1–2 WIGs no formato **"de X para Y até quando"** (lag, horizonte longo). Ancora C7 (resultado = norte) + A2 (mira o controlável-no-longo).
**Regras de negócio:**
- Cap **2 WIGs ativas** por jogador, enforçado **por contagem em código** (não UNIQUE — padrão `career_goals`).
- Formato "de X para Y até Z": exige `metric`/`sourceMetric` + `baselineValue` (X) + `targetValue` (Y) + `targetDeadline` (Z).
- `targetDeadline` mínimo = **trimestre** (≥ +90 dias da criação) — D9 (ROI só converge em escala; meta de resultado de curto prazo é armadilha matemática).
- `baselineValue` é **snapshot na criação** (não recalculado — é o X de "de X para Y").
- WIG só pode ser `goalType ∈ {performance, result}` (processo é D2).
**Critério de aceitação:**
- [ ] Criar WIG exige `sourceMetric`, `baselineValue`, `targetValue`, `targetDeadline >= +90 dias` → senão `wig_deadline_too_short` (mensagem cita D9).
- [ ] 3ª WIG ativa → `wig_active_limit`.
- [ ] WIG com `goalType='process'` → `wig_must_be_lag`.
- [ ] `baselineValue` persistido no momento da criação, imutável em edições subsequentes.

### RF-02 (= master RF-02): Vincular WIG ↔ medida de direção (D1→D2)
**Descrição:** uma WIG ativa precisa de ≥1 medida de direção vinculada antes de pontuar no placar. Ancora 4DX (WIG sem lead measure é teatro) + A9.
**Regras de negócio:**
- WIG sem medida vinculada fica `status='draft'` (não aparece no placar D3).
- Vincular ≥1 medida → WIG vira `active`.
- Vínculo N:N leve via tabela `goal_links` (uma medida serve ≥1 WIG; uma WIG tem ≥1 medida). UNIQUE `(wig_id, measure_id)`.
- **Fora desta fatia:** a *sugestão* do mentor (master RF-02 último bullet / RF-09) é METAS-1.1.
**Critério de aceitação:**
- [ ] WIG sem vínculo → `status='draft'`, ausente do placar.
- [ ] `POST /api/goals/:id/link-measure` com ≥1 medida → WIG vira `active`, entra no placar.
- [ ] Vincular o mesmo par 2× → idempotente (UNIQUE, não duplica) ou erro `measure_already_linked` (architect decide o comportamento; test-writer cobre ambos os ramos com a escolha do ADR).

### RF-03 (= master RF-03): Definir medidas de direção (lead measures) — D2
**Descrição:** jogador define métricas semanais/diárias que controla, com alvo numérico/binário. Ancora C7 (processo, ~100% controle, feedback binário) + A9 (sistema/hábito).
**Regras de negócio:**
- Cap **3 medidas de direção ativas** por jogador, enforçado **por contagem em código**.
- `cadence ∈ {weekly (default), daily}`. Cada medida tem `targetValue` + `unit` (`sessions`/`minutes`/`pct`/`days`/`boolean`).
- Medida precisa de `targetValue` + `unit` + `cadence` (C7 — meta vaga = sem meta).
- **Fatia-1 NÃO força gramática SE-ENTÃO** (implementation intention — A9 é instrução de mentor, METAS-1.1).
**Critério de aceitação:**
- [ ] 4ª medida ativa → `lead_active_limit`.
- [ ] Medida sem `targetValue`/`unit`/`cadence` → `lead_underspecified` (cita C7).

### RF-04 (= master RF-04): Medida preditiva E influenciável (regra de ouro 4DX + A2)
**Descrição:** ao criar uma medida, valida os 2 critérios. Ancora regra de ouro 4DX + A2 (dicotomia do controle).
**Regras de negócio:**
- **(b) Influenciável:** `sourceMetric` da medida deve pertencer à **allowlist de métricas controláveis** (decisões/estudo/volume/processo). Métricas não-controláveis recusadas: `profit_short_term`, `win_a_tournament`, `beat_specific_player` → `lead_not_controllable` (cita A2).
- **(a) Preditiva (validação leve na fatia-1):** `sourceMetric` deve ter mapeamento de fonte de dado real (RF-05). Sem mapeamento → `lead_no_data_source`.
- **Resultado de curto prazo** (P&L/ROI semanal) é **explicitamente recusado** como medida (D9/C5 — outcome bias) → `lead_not_controllable`.
**Critério de aceitação:**
- [ ] `sourceMetric ∈ {profit_short_term, win_a_tournament, beat_specific_player}` → `lead_not_controllable` (cita A2/D9).
- [ ] `sourceMetric` sem mapeamento (RF-05) → `lead_no_data_source`.
- [ ] Medida controlável + fonte mapeada → aceita.

### RF-05 (= master RF-05, fatia-1: AGREGAÇÃO DIRETA): Progresso de dados reais
**Descrição:** o `currentValue` de cada medida/WIG é **computado por agregação direta read-only** do dado já capturado — **não** pelo motor de aderência fino. Ancora C4 (métrica de sucesso pré-definida) + estratégia §2.3 (o dado já existe).
**Mapa de agregação da fatia-1** (subset do mapa do master RF-05 que tem fonte direta de contagem/soma):

| `sourceMetric` | Fonte (agregação direta read-only) | Filtro / nota |
|---|---|---|
| `sessions_per_week`, `grind_days` | `count(grind_sessions WHERE status='completed')` na janela; `grind_days` = dias distintos | volume de sessão |
| `study_minutes_week`, `study_sessions_count` | `sum(study_sessions_v2.durationMinutes)` / `count(...)` na janela | filtra `deletedAt IS NULL`; `mode='stat_analysis'` conta (EST-3) |
| `bankroll_usd` | `wallets` + `bankroll_snapshots` | **FX → USD antes de comparar (lesson #6)**; `numeric` é string JS — `parseFloat` na boundary, não `Number()` cego |
| `roi_pct`, `abi`, `itm_pct` | `getPerformanceByPeriod` | **filtra `grind_session_id IS NULL` (§6.1)** — histórico, nunca `session_tournaments` |

**Regras de negócio:**
- Métricas **financeiras** normalizam para **USD antes de comparar** com alvo (lesson #6).
- Métricas de **performance/financeira** usam **histórico** (`tournaments WHERE grind_session_id IS NULL` via `getPerformanceByPeriod`) — §6.1; nunca agregar `session_tournaments`.
- O motor `getPlannedVsActual` (ADR-227) **PODE ser usado opcionalmente** onde já cobre uma `sourceMetric` (ex: `grind_sessions_count`, `study_minutes`), mas **não é hard-dep** — a fatia-1 faz a agregação direta. **A fatia-2 substitui a agregação por `compliancePct` fino do motor** (documentado em §Fora de Escopo).
- `numeric` do Drizzle vem como **string** em JS — converter via `parseFloat`/`coerceFiniteNumber(parseFloat(v))` na boundary do storage, **nunca** `Number()` cego (C2/lesson #6).
**Critério de aceitação:**
- [ ] Cada `sourceMetric` da allowlist resolve para uma fonte existente (guard test: mapa sem entrada órfã).
- [ ] Métrica de performance/financeira filtra `grind_session_id IS NULL` (§6.1) — guard test.
- [ ] Métrica financeira em moeda nativa convertida para USD antes de comparar (lesson #6).
- [ ] `numeric` de coluna é parseado na boundary (não passa string crua a comparação numérica).

### RF-06 (= master RF-06): Placar esconde P&L de curto prazo — D3
**Descrição:** o placar (`/metas`) destaca as medidas de direção + status da WIG no horizonte longo; **esconde** P&L diário/ROI semanal da visão principal. Ancora D3 + D9/C5 (amostra pequena = ruído).
**Regras de negócio:**
- A tela principal **nunca** mostra P&L diário nem ROI semanal como métrica de destaque.
- O lag (resultado da WIG) só renderiza valor quando `horizon >= quarter`.
- Não duplica `/stats` (D3: placar serve à competência, não ao ruído).
**Critério de aceitação:**
- [ ] Tela principal de `/metas` não renderiza widget de P&L diário / ROI semanal (guard test de **ausência**).
- [ ] Lag da WIG só exibe valor quando `horizon >= quarter`.

### RF-07 (= master RF-07): Placar "onde estou × onde deveria estar" (pace) — D3
**Descrição:** para cada WIG/medida, o placar mostra **atual × alvo × trajetória esperada (pace)** + um status derivado. Ancora D3 + A7 (competência).
**Regras de negócio:**
- **Pace line:** interpolação **linear** de `baselineValue` (X) → `targetValue` (Y) ao longo de `[createdAt, targetDeadline]`. "Onde eu deveria estar hoje" = ponto da reta na data atual (`expectedNow`).
- **Status derivado:** `ahead` / `on_track` / `behind` / `at_risk`. Banda de tolerância para não disparar pânico (A4). **Thresholds = decisão do architect (DEC-A3).**
- Medida semanal: compliance da semana corrente + histórico das últimas N semanas (sparkline a partir de `goal_progress_snapshots`).
- **CTA targets DEVEM casar com rotas Wouter registradas** (lesson #19): "registrar estudo" → `/estudos/registrar`; "abrir grade" → rota da grade; etc. Architect grepa `Route path` em `client/src/App.tsx` antes de fixar targets.
**Critério de aceitação:**
- [ ] Cada WIG/medida exibe `current`, `target`, `expectedNow` (pace) e `status`.
- [ ] `expectedNow` = interpolação linear baseline→target no intervalo `[createdAt, targetDeadline]` na data atual (guard test com datas fixas).
- [ ] Todo CTA do placar resolve para rota Wouter existente (guard test — lesson #19).
- [ ] `status` derivado dos thresholds do architect (test cobre as 4 faixas + a banda de tolerância).

### RF-08 (= master RF-08): Snapshots semanais idempotentes
**Descrição:** progresso congelado em snapshots semanais (1/meta/semana) para o placar mostrar evolução. Ancora C4 (ciclo semanal) + D9 (medir em janela, não no ruído diário).
**Regras de negócio:**
- 1 snapshot por `(goal_id, week_start_date)` — **UNIQUE**, idempotente (reprocessar = UPSERT, não duplica; padrão `report_jobs`/`study_weekly_plans`).
- `week_start_date` como **DATE UTC** via `ymdUtc` (`server/coach/planning/weekKeys.ts`) — alinha `study_weekly_plans`/`weekly_planning_sessions` (CLAUDE.md §10). **Tick novo vs piggyback no `reportJobRunner` = DEC-A1 (architect).**
- Snapshot grava: `currentValue`, `expectedValue` (pace), `compliancePct` (medidas), `streakDays`, `status`, `dataSufficiency` (`ok|low` — D9: amostra pequena → sem veredito forte).
- Gerado pelo tick tz-aware (kill switch `COACH_NUDGES_ENABLED` — CLAUDE.md §4: off não gera snapshot proativo; o placar read-only continua servindo o último snapshot existente).
**Critério de aceitação:**
- [ ] 1 snapshot/meta/semana (UNIQUE `(goal_id, week_start_date)`); reprocessar = UPSERT, não duplica.
- [ ] Snapshot com amostra pequena marca `dataSufficiency='low'` (placar não crava veredito).
- [ ] `week_start_date` é DATE UTC via `ymdUtc` (guard test contra BRT).

---

## Requisitos Não-Funcionais
- **Tier gating (DEC-A2):** placar/GET read-only para todos; criação/edição/vínculo/template gated `getReportTier(user) !== 'free'` — defense in depth (entrada + revalidação no handler). `getReportTier` em `server/coach/reportEligibility.ts` (SHIPPED).
- **Idempotência:** snapshots UNIQUE `(goal_id, week_start_date)`; UPSERT.
- **FX:** métricas financeiras → USD antes de comparar (lesson #6).
- **§6.1:** performance/financeira filtram `grind_session_id IS NULL`; nunca agregar `session_tournaments`.
- **Precisão numérica:** `numeric` Drizzle = string JS → `parseFloat` na boundary, nunca `Number()` cego (C2/lesson #6 / consult-hub `decimal-end-to-end`).
- **Kill switch:** snapshot tick respeita `COACH_NUDGES_ENABLED` (off = não gera snapshot novo; placar read-only intocado).
- **Caps por código:** cap 2 WIG / cap 3 medidas por **contagem de `active`** (não UNIQUE — padrão `career_goals` AI-2B).
- **Handlers:** aceitam `injectedStorage` como 3º arg + storage lazy+fallback (lessons #34/#36).
- **Storage:** padrão attach (`server/storage/goalsStorage.ts` → `attachGoalsStorage(storage)`, como `careerGoalsStorage.ts`/`weeklyPlanningStorage.ts`).
- **Frontend:** testes `.tsx` com `await import` (lessons #14/#26/#38); placar sub-fetcher em ErrorBoundary local (lesson #29).
- **Migration:** additive-only, drizzle-kit + `_rollback.sql`, psql local (localhost:5433), documentar pendência PROD (Neon) em CLAUDE.md §6 (padrão 0086/0087/0088/0089).

## Endpoints Previstos

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | `/api/goals` | Lista metas (WIG + medidas) do jogador | JWT (read-only todos) |
| GET | `/api/goals/scoreboard` | Placar consolidado: metas + último snapshot + pace + status (RF-06/07) | JWT (read-only todos) |
| GET | `/api/goals/:id/snapshots` | Histórico de snapshots de uma meta (RF-08) | JWT |
| POST | `/api/goals` | Cria WIG ou medida (valida RF-01/03/04/11/12) | JWT + tier eligible |
| PATCH | `/api/goals/:id` | Edita meta (não renegociação automática — fatia-1) | JWT + tier eligible |
| DELETE | `/api/goals/:id` | Arquiva meta (soft-delete `archived_at`, não hard-delete) | JWT + tier eligible |
| POST | `/api/goals/:id/link-measure` | Vincula medida a uma WIG (RF-02) | JWT + tier eligible |
| POST | `/api/goals/templates/:profile/apply` | Aplica template estático de perfil (RF-14 sem LLM — **ver §Decisão de templates**) | JWT + tier eligible |

> **Colisão de rota (DEC-A8 / lessons EST-3/EST-6):** rotas estáticas (`/scoreboard`, `/templates/:profile/apply`) registradas **ANTES** da `/:id` (e de `/:id/snapshots`/`/:id/link-measure`), senão `/:id` shadowa. **Guard test obrigatório** (handler-direct é cego à colisão — registrar via app e bater a rota real, lição EST-3/6).
> Handlers seguem `injectedStorage` 3º arg (lesson #34).
> Rotas frontend: `/metas` (placar) + `/metas/nova` (criação) — **registrar em `client/src/App.tsx`** (lesson #19).

### Decisão de templates (RF-14) — recomendação do PM
**Templates ESTÁTICOS (presets, sem LLM) CABEM na fatia-1.** Justificativa: o master RF-14 define 5 templates por perfil de trilha (Esgotado/Empolgado/Consolidado/Afundado/Em Transição) como **WIG-draft + 2-3 medidas + tom**, todos preenchíveis a partir de **constantes em código** (nenhuma inferência LLM). É um acelerador de onboarding barato (presets editáveis) que reusa o CRUD já desta fatia. **Recomendo INCLUIR** o `POST /api/goals/templates/:profile/apply` (cria as rows draft a partir do preset). **DEFERE** apenas o `suggest` (RF-13, LLM-driven). Se o architect julgar que infla o escopo do sprint, é o candidato natural a cortar para METAS-1.1 — sinalizado como **opcional de fatia-1** (architect confirma no ADR).

## Modelos de Dados Afetados

> **3 tabelas novas.** Migration `migrations/00XX_goals.sql` + `_rollback.sql` (additive-only), psql local (localhost:5433), pendência PROD documentada no CLAUDE.md §6. IDs via `nanoid`. FK por `users.user_platform_id` (CASCADE).

### ⚠️ CONFLITO CRÍTICO PARA O ARCHITECT — DEC-A6-impl (NÃO decidido aqui)

**Achado de recon (verificado 2026-06-01):**
- `career_goals` existe **apenas na migration raw SQL `migrations/0071_ai_2b_career_mental_email.sql`** (colunas: `id`, `user_id` FK CASCADE, `title`, `description`, `target_metric` [`profit_usd|tournaments_count|roi_pct|bankroll_usd|custom`], `target_value` numeric, `target_deadline` date, `horizon` [`mes|trimestre|ano|multi_ano`], `status` [`active|achieved|abandoned|expired`], `progress_note`, `achieved_at`, `created_at`, `updated_at`).
- **`career_goals` NÃO está no drizzle `shared/schema.ts`** (confirmado: `grep careerGoals` → 0 matches). O `server/storage/careerGoalsStorage.ts` acessa via **lazy `mod.careerGoals ?? mod.career_goals ?? null`** com **placeholder de fallback** (lesson #36).

**Implicação:** o master spec propunha uma tabela `goals` nova e (DEC-A6) recomendava "WIG referencia/sincroniza `career_goals`". Mas **DEC-A6 está TRAVADA pelo founder: a WIG estende `career_goals`** (estratégia §2.2) — e estender `career_goals` exige uma decisão de schema que o master **não previu**, porque `career_goals` não está formalizado no drizzle.

**Opções para o architect decidir no ADR (este PM NÃO decide):**
- **(a) ADD COLUMN additive em `career_goals`** + **formalizar `career_goals` no `shared/schema.ts`** (hoje é raw-SQL-only). A WIG vira uma `career_goal` com colunas 4DX extras (ex: `baseline_value`, `wig_role`, `coach_tone_at_create`, `origin`). Risco: mexe numa tabela AI-2B existente + obriga formalizar o drizzle (toca `shared/schema.ts` — INCIDENT #24/#45).
- **(b) Tabela-filha `goal_wig_meta` referenciando `career_goals.id`** (FK). `career_goals` intocada; os atributos 4DX da WIG vivem na filha. Menos invasivo no AI-2B, mais joins.
- **(c) Tabela `goals` nova que sincroniza com `career_goals`** (sync opt-in unidirecional, como `ai_structured_profile.metas`). Mais perto do master spec original, mas mantém 2 domínios (risco de divergência — o que DEC-A6 tentou evitar).

> O PM **só recorta e aponta**. O architect resolve DEC-A6-impl no ADR (escolhe a/b/c, define se formaliza `career_goals` no drizzle, e como o cap-2-WIG interage com `career_goals` já existentes do usuário). **As tabelas `goal_*` abaixo assumem a forma genérica do master; o architect reconcilia com a opção escolhida.**

### `goals` (NOVO — forma do master; architect reconcilia com DEC-A6-impl)
> Single-table discriminada por `goal_type` (master DEC-A5 recomendado). Se o architect escolher (a), a WIG migra para `career_goals` estendida e esta tabela guarda **só as medidas de direção** (D2) + os links; se (b)/(c), guarda WIG e medidas.

| Campo | Tipo | Constraints | Notas / âncora |
|---|---|---|---|
| id | varchar(21) | PK, nanoid | |
| user_id | varchar(21) | not null, FK users CASCADE | |
| goal_type | varchar(16) | not null, CHECK `{process,performance,result}` | C7 (RF-11) |
| category | varchar(24) | not null, CHECK `{financial_brm,volume_grind,study,mental_tilt,process_routine,longevity_burnout,leak_focus}` | dores `learnings §6` |
| title | varchar(120) | not null | "de X para Y até Z" no caso WIG |
| source_metric | varchar(48) | nullable | mapa RF-05; medida sem fonte = `lead_no_data_source` |
| baseline_value | numeric | nullable | X (snapshot na criação — RF-01) |
| target_value | numeric | nullable | Y |
| unit | varchar(16) | nullable | `usd`/`pct`/`minutes`/`sessions`/`days`/`boolean` — financeira sempre `usd` |
| cadence | varchar(8) | nullable | `weekly`/`daily` (medida — RF-03) |
| horizon | varchar(8) | not null | CHECK `{week,month,quarter,season}` (RF-12) |
| target_deadline | date | nullable | Z; result → `>= +90d` (RF-01/D9) |
| status | varchar(12) | not null, default `'draft'` | `draft`/`active`/`achieved`/`abandoned`/`archived` |
| coach_tone_at_create | varchar(8) | nullable | snapshot do tom (A4) |
| origin | varchar(16) | not null, default `'manual'` | `manual`/`template_<profile>` (auditoria — RF-14; `coach_suggest` fica p/ METAS-1.1) |
| created_at / updated_at / archived_at | timestamp | | soft-delete |

Índices: `idx_goals_user_status (user_id, status)`; `idx_goals_user_type (user_id, goal_type)`.
Caps (2 WIG / 3 medidas) **por contagem em código**.

### `goal_links` (NOVO) — vínculo WIG ↔ medida (RF-02)
| Campo | Tipo | Constraints |
|---|---|---|
| id | varchar(21) | PK nanoid |
| user_id | varchar(21) | not null, FK users CASCADE |
| wig_id | varchar(21) | not null, FK (goals ou career_goals — depende de DEC-A6-impl) |
| measure_id | varchar(21) | not null, FK goals CASCADE |
| created_at | timestamp | default now |
| | | **UNIQUE (wig_id, measure_id)** |

> Se DEC-A6-impl = (a), `wig_id` referencia `career_goals.id`. Architect ajusta a FK conforme a escolha.

### `goal_progress_snapshots` (NOVO) — placar histórico (RF-08)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | varchar(21) | PK nanoid | |
| user_id | varchar(21) | not null, FK users CASCADE | |
| goal_id | varchar(21) | not null, FK goals CASCADE | (ou career_goals p/ WIG, conforme DEC-A6-impl) |
| week_start_date | date | not null | **DATE UTC via `ymdUtc`** (CLAUDE.md §10) |
| current_value | numeric | nullable | realizado (agregação direta na fatia-1) |
| expected_value | numeric | nullable | pace line (RF-07) |
| compliance_pct | numeric | nullable | medidas |
| streak_days | integer | nullable, default 0 | hábito (A9) |
| status | varchar(12) | nullable | `ahead`/`on_track`/`behind`/`at_risk`/`achieved` |
| data_sufficiency | varchar(4) | not null, default `'ok'` | `ok`/`low` (D9) |
| created_at | timestamp | default now | |
| | | **UNIQUE (goal_id, week_start_date)** | idempotência |

Índice: `idx_goal_snapshots_user_week (user_id, week_start_date)`.

### Tabelas REUSADAS (sem alteração de schema)
`grind_sessions`, `study_sessions_v2`, `tournaments` (WHERE `grind_session_id IS NULL`), `wallets`, `bankroll_snapshots`, `career_goals` (DEC-A6-impl), `users`. **NÃO** lê `break_feedbacks`/`cooldown_logs`/`getStatsLeaks` nesta fatia (são fatia-2/METAS-1.1).

---

## Cenários de Teste Derivados

### Happy Path
- [ ] Criar WIG válida (`performance`, deadline +120d) → `status='draft'`; criar 1 medida válida (`study_minutes_week`, weekly); `link-measure` → WIG vira `active`; `GET /scoreboard` mostra `current`/`target`/`expectedNow`/`status`; gerar snapshot semanal → 1 row UNIQUE.

### Validação de Input / Doutrina
- [ ] WIG deadline < trimestre → `wig_deadline_too_short` (D9).
- [ ] 3ª WIG ativa → `wig_active_limit`; 4ª medida ativa → `lead_active_limit`.
- [ ] WIG `goalType='process'` → `wig_must_be_lag`.
- [ ] Medida `sourceMetric=win_a_tournament`/`profit_short_term`/`beat_specific_player` → `lead_not_controllable` (A2/D9).
- [ ] Medida sem `targetValue`/`unit`/`cadence` → `lead_underspecified` (C7).
- [ ] Medida com `sourceMetric` fora do mapa RF-05 → `lead_no_data_source`.
- [ ] WIG sem medida vinculada → `status='draft'`, fora do placar.

### Agregação direta (RF-05)
- [ ] `bankroll_usd` em carteira BRL → convertida para USD antes de comparar com alvo (lesson #6); FX ausente → não zera, fallback nativo + log (#9).
- [ ] `roi_pct`/`abi` filtram `grind_session_id IS NULL` (§6.1) — guard test.
- [ ] `numeric` de coluna parseado via `parseFloat` na boundary (não string crua em comparação).
- [ ] `sessions_per_week` = count(`grind_sessions` status='completed') na janela.

### Placar (D3 — RF-06/07)
- [ ] Tela principal de `/metas` NÃO renderiza P&L diário / ROI semanal (guard de **ausência**).
- [ ] Lag da WIG só exibe valor com `horizon >= quarter`.
- [ ] `expectedNow` = interpolação linear baseline→target (datas fixas, valor exato).
- [ ] Status nas 4 faixas (`ahead`/`on_track`/`behind`/`at_risk`) conforme thresholds DEC-A3 + banda de tolerância (A4).
- [ ] Todo CTA do placar resolve para rota Wouter registrada (guard test — lesson #19).
- [ ] Sub-fetcher do placar isolado em ErrorBoundary local (lesson #29) — falha de fetch não derruba a tela.

### Snapshots (RF-08)
- [ ] 1 snapshot/meta/semana (UNIQUE `(goal_id, week_start_date)`); reprocessar = UPSERT, não duplica.
- [ ] Amostra pequena → `dataSufficiency='low'` (sem veredito forte).
- [ ] `week_start_date` é DATE UTC via `ymdUtc` (guard test contra BRT).
- [ ] `COACH_NUDGES_ENABLED=false` → tick não gera snapshot novo; `GET /scoreboard` ainda serve o último snapshot existente.

### Tier / Rotas
- [ ] Tier `free`/`expired` → 403 em `POST /api/goals`, `PATCH`, `DELETE`, `link-measure`, `templates/:profile/apply`.
- [ ] Tier `free` → `GET /api/goals` e `GET /scoreboard` **respondem** (read-only DEC-A2).
- [ ] Colisão de rota `/api/goals/:id` vs `/scoreboard` vs `/templates/:profile/apply` → guard test via app real (rotas estáticas antes da `:id`).
- [ ] Caps WIG/medida enforçados por contagem de `active` (não UNIQUE).

### Templates (RF-14 — se incluído)
- [ ] Cada um dos 5 perfis (`esgotado`/`empolgado`/`consolidado`/`afundado`/`em_transicao`) gera ≥1 WIG-draft + 2-3 medidas + tom sugerido, a partir de preset estático (sem LLM).
- [ ] Rows criadas por template marcam `origin='template_<profile>'` (auditoria).
- [ ] Metas geradas por template são editáveis após aplicadas (A2: autonomia).

---

## Fora de Escopo (DEFERIDO — documentar para o architect/test-writer não implementar)
- **RF-09 (cobrança A4 na cadência de segunda)** → METAS-1.1. A fatia-1 **não** posta cobrança no chat/Weekly Report; **não** pluga no estado `planning` do EST-5.
- **RF-10 (renegociação de meta irreal via LLM)** → METAS-1.1. `PATCH /api/goals/:id` desta fatia é edição simples (sem proposta de renegociação automática, sem versionamento de meta original).
- **RF-13 (Coach co-define WIG/medidas via LLM, `POST /api/goals/suggest`)** → METAS-1.1. **Sem chamada Anthropic nesta fatia.**
- **RF-15 (degradação de `getStatsLeaks` stub + `break_feedbacks`)** → METAS-1.1/fatia-2. A fatia-1 **não** mapeia `leak_focus`/`mental_tilt` (essas fontes são stub/esparsas). O CHECK de `category` aceita os valores, mas nenhuma `sourceMetric` da allowlist da fatia-1 os usa.
- **Motor de aderência fino (`getPlannedVsActual` rigoroso — fatia-2):** a fatia-1 usa **proxy "realizado vs alvo da medida"** via agregação direta. **Downgrade documentado:** o `compliancePct` da fatia-1 NÃO é "vs plano da semana" (planejou X com warm-up, fez Y) — é "realizado vs alvo numérico". A fatia-2 substitui pela leitura de `getPlannedVsActual` (ADR-227) onde houver `sourceMetric` mapeada no motor.
- **`suggest` LLM (RF-13/RF-02 sugestão do mentor)** — DEFERIDO. (Templates **estáticos** ficam — ver §Decisão de templates.)
- **Atribuição causal quantitativa** "esta medida moveu a WIG em X%" — qualitativa no MVP (master RF-12).
- **Novos tools de escrita do Coach** — nenhum nesta fatia.
- **Mudar conteúdo de Weekly/Monthly/Quarterly Report** — intocado.

## Dependências
- **`getReportTier`** (`server/coach/reportEligibility.ts`, SHIPPED) — tier gating DEC-A2.
- **`career_goals`** (migration 0071, AI-2B) — **NÃO formalizada no drizzle** (DEC-A6-impl). A WIG estende (forma a definir).
- **`ymdUtc`/`weekKeys.ts`** (`server/coach/planning/weekKeys.ts`, SHIPPED) — chave de semana UTC dos snapshots.
- **`getPerformanceByPeriod`, `walletService`, `fxResolver`** (SHIPPED) — agregação de performance/financeira (RF-05).
- **`reportJobRunner`/cron tz-aware** (ADR-155, SHIPPED) — possível host do snapshot tick (DEC-A1).
- **Motor de aderência (ADR-227, SHIPPED)** — **dependência OPCIONAL** na fatia-1 (proxy direto); **hard-dep da fatia-2**.
- **EST-6 `weekly_planning_sessions`** (SHIPPED) — não consumido na fatia-1; alvo da fatia-2 (via motor).

## Decisões abertas para o System-Architect
1. **DEC-A6-impl (CRÍTICA) — como a WIG estende `career_goals`** (a/b/c em §Modelos de Dados). Inclui: formalizar ou não `career_goals` no `shared/schema.ts`; FK do `goal_links.wig_id` e `goal_progress_snapshots.goal_id` quando o alvo é uma WIG; e como o cap-2-WIG interage com `career_goals` já existentes do usuário (uma WIG criada antes do AI-2B conta? a Metas só conta as com `wig_role`?). **Resolver ANTES do schema.**
2. **DEC-A1 — Snapshot: tick novo ou piggyback no `reportJobRunner`?** Recomendação do master: piggyback no enqueuer/processor do Weekly Report (mesma cadência de segunda, reusa claim atômico ADR-155). Definir `report_type='goal_snapshot'` ou job separado. Confirmar interação com `COACH_NUDGES_ENABLED`.
3. **DEC-A3 — Thresholds de `status`** (`ahead`/`on_track`/`behind`/`at_risk`) + banda de tolerância (A4 evita pânico), por `goalType`/`horizon`. Test-writer precisa dos números fixos para o guard das 4 faixas.
4. **DEC-A8 — Colisão de rota** `/api/goals/:id` vs `/scoreboard`/`/templates/:profile/apply`/`/:id/snapshots`/`/:id/link-measure` — ordem de registro + guard test via app real (lições EST-3/6: handler-direct é cego à colisão).
5. **Templates RF-14 dentro ou fora da fatia-1** — PM recomenda **dentro** (presets estáticos, sem LLM; ver §Decisão de templates). Architect confirma ou move para METAS-1.1 se inflar o sprint.
6. **`PATCH` vs imutabilidade de `baselineValue`** — confirmar que `PATCH /api/goals/:id` rejeita alteração de `baseline_value` (RF-01: X é snapshot imutável).
7. **`link-measure` em par duplicado** — idempotente (no-op) ou `measure_already_linked`? (RF-02 critério deixa o ramo aberto para o ADR fixar.)

## Riscos
- **DEC-A6-impl não resolvida antes do schema** → WIG e `career_goals` viram universos paralelos (exatamente o que DEC-A6 quis evitar). **Risco ALTO** — o architect resolve no ADR antes de qualquer migration.
- **Formalizar `career_goals` no drizzle (se opção a)** toca `shared/schema.ts` — tabela AI-2B viva + working tree compartilhada (INCIDENT #24/#45). Mitigação: `git add` explícito por arquivo, nunca `-A`; considerar worktree por sprint.
- **`numeric` string→Number cego** em métricas financeiras/performance (C2/lesson #6) — quebra silenciosa de comparação. Mitigação: `parseFloat` na boundary do storage + teste FX→USD.
- **Colisão de rota** (EST-3/EST-6 já sofreram) — guard test via app real obrigatório.
- **Outcome bias do jogador** — pressão para ver P&L no placar; D3/D9 escondem deliberadamente (decisão de design, não bug — documentar na UI).
- **Downgrade do `compliancePct`** (proxy vs motor) — não prometer "vs plano" na UI/cópia da fatia-1; é "realizado vs alvo". Mitigação: rótulo honesto até a fatia-2 ligar o motor.
- **Snapshot tick + kill switch** — confirmar que `COACH_NUDGES_ENABLED=false` não derruba o placar read-only (só pausa a geração de snapshot novo).

## Notas de Implementação
- Storage attach: `server/storage/goalsStorage.ts` → `attachGoalsStorage(storage)` (modelo `careerGoalsStorage.ts`: `getTable()` lazy `mod.goals`/fallback placeholder #36; `resolveDb(injected)`; helpers com `injectedDb?` arg).
- Agregação RF-05 em helper puro read-only (`server/coach/goals/aggregateCurrentValue.ts` ou similar) — reusa `getPerformanceByPeriod`/`walletService`/`fxResolver`; pode chamar `getPlannedVsActual` opcionalmente onde já cobre a métrica.
- Pace line + status em helper puro testável (`computePace.ts`): `expectedNow = baseline + (target - baseline) * clamp01((now - createdAt)/(deadline - createdAt))`; status pelos thresholds DEC-A3.
- Frontend: `/metas` + `/metas/nova` em `client/src/App.tsx` (lesson #19); placar com `useQuery` + ErrorBoundary local nos sub-fetchers (lesson #29); testes `.tsx` com `await import` (lessons #14/#26/#38).
- Migration: drizzle-kit + `_rollback.sql` additive-only, psql local (localhost:5433), pendência PROD (Neon) no CLAUDE.md §6 (padrão 0086/0087/0088/0089).
- Emoji em código → `String.fromCodePoint` (hook do projeto).
