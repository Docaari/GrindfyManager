# Spec: METAS-2 (fatia-2 da Ferramenta de Metas 4DX) — compliancePct rigoroso + leak_focus

> Pipeline TDD: `pm-spec (este) → system-architect → test-writer → implementer → /simplify → reviewer`.
> Spec-mãe: `Docs/specs/metas-tool-2026-06-01.md` (RF-05, RF-15, §Dependência crítica — Fatia 1 vs Fatia 2).
> Fatia-1: `Docs/specs/sprint-metas-1-fatia-1-2026-06-01.md` (ADR-229, shipped).
> Worktree: `B:/grindfy-metas2`, branch `feature/metas-2-fatia-2`.

## Status
Proposta

## Resumo
Plugar o **motor de aderência** (Fase A / ADR-227) no placar de metas para que metas **de processo/aderência** ganhem um `compliancePct` **rigoroso** — que distingue "pulado conscientemente" (A4, `null`) de "não feito" (shortfall) — em vez do proxy "realizado vs alvo" da fatia-1. E **habilitar a categoria `leak_focus`** (até hoje sem `sourceMetric` mapeada, recusada com `lead_no_data_source`) usando o `getStatsLeaks` real (ADR-231) + o sinal honesto `coach_leak_focus.status='resolved'`. Escopo cirúrgico: **só** plugar o motor + habilitar leak_focus. Sem templates (RF-14), sem cobrança/LLM (RF-09/13 = METAS-1.1), sem UI nova grande (reusa o placar `/metas`). **Sem migration** (reusa tabelas da fatia-1 + serviços read-only).

## Contexto
- A fatia-1 (ADR-229) entregou o core 4DX: 4 tabelas (`goals`, `goal_wig_meta`, `goal_links`, `goal_progress_snapshots`), CRUD, placar `GET /api/goals/scoreboard`, snapshots semanais on-read (UTC). O `compliancePct` da fatia-1 é **proxy**: a coluna `compliance_pct` da tabela de snapshot **nunca é escrita** pelo scoreboard (ele grava só `currentValue`/`expectedValue`/`status` + `dataSufficiency` hardcoded `"ok"`). O status vem só do pace (`deriveStatus`) com `current = aggregateCurrentValue` (agregação direta).
- A Fase A (ADR-227) entregou o motor `getPlannedVsActual(userId, sourceMetric, period, injectedStorage?)` que compara **plano EST-6 (intencionado) × realizado** por janela UTC, retornando `{planned, actual, compliancePct, dataSufficiency, breakdown:{skipped, shortfall, overachieved, note}}`. Distingue `skipped` (A4 — `compliancePct=null`) de `shortfall>0` (não feito).
- A Fase C #3 (ADR-231) transformou `getStatsLeaks(userId, top)` de stub `[]` em síntese comportamental real: `StatLeak[]` ordenado por `severity` (sintético, `>0`), com `value`/`delta` **sempre `null`** (não há HUD number — D-A3 da ADR-231) e `benchmark` do catálogo ou `null`.
- **Verificação no worktree (2026-06-02):** snapshot já tem colunas `compliance_pct`/`streak_days`/`data_sufficiency`; `upsertGoalSnapshot` já aceita `compliancePct`/`streakDays`/`dataSufficiency` no input → **fatia-2 não precisa de migration**.

## Usuários
- **Jogador (Trial/Pro/Premium/Admin = `eligible`; Free/expired):** vê no placar `/metas`, para cada medida de processo, o `compliancePct` rigoroso + o badge "pulado conscientemente" vs "abaixo do plano" + o badge de amostra fraca (`dataSufficiency='low'`). Cria metas `leak_focus` que rastreiam se o leak está sendo atacado/resolvido. Leitura para todos; escrita gated `getReportTier !== 'free'` (herdado da fatia-1).
- **Motor de aderência (ADR-227, dependência PRONTA):** fornece `getPlannedVsActual`. A Metas **consome** o contrato; **não** recalcula plano-vs-realizado.
- **getStatsLeaks (ADR-231, dependência PRONTA):** fornece `StatLeak[]`. `coach_leak_focus` fornece o sinal de resolução.

---

## Decisões TRAVADAS nesta spec

> Documentadas aqui para o test-writer não precisar perguntar. O architect refina threshold numérico onde indicado, mas o **comportamento** está cravado.

### DEC-1 — Quais sourceMetrics resolvem via MOTOR vs continuam AGREGAÇÃO DIRETA
O motor `getPlannedVsActual` só sabe comparar plano-vs-realizado para dimensões que têm **plano no EST-6** (`weekly_planning_sessions.steps` = grind/study/lessons/themes). Métricas de performance/financeira **não têm plano semanal** → continuam agregação direta.

A fatia-1 e o motor usam **vocabulários de `sourceMetric` DIFERENTES** (gap real, não bug): a fatia-1 nomeia `sessions_per_week`, `study_minutes_week`, …; o motor nomeia `grind_sessions_count`, `study_minutes`, …. A fatia-2 introduz um **mapa-ponte** (`GOAL_METRIC_TO_ADHERENCE`, RF-01) que traduz o `sourceMetric` da meta para o `SourceMetric` do motor **quando aplicável**. Metas sem entrada na ponte caem na agregação direta (rota fatia-1 intacta — back-compat).

| Goal `sourceMetric` (fatia-1) | category | Resolve via | Motor `SourceMetric` (ponte) | Justificativa |
|---|---|---|---|---|
| `sessions_per_week` | volume_grind | **MOTOR** | `grind_sessions_count` | tem plano (grade EST-6) → plano-vs-realizado |
| `grind_days` | volume_grind | **MOTOR** | `grind_days` | idem |
| `study_minutes_week` | study | **MOTOR** | `study_minutes` | tem plano (blocos de estudo EST-6) |
| `study_sessions_count` | study | **MOTOR** | `study_sessions_count` | idem |
| `roi_pct` | performance | **DIRETO** (fatia-1) | — | sem plano; `getPerformanceByPeriod` histórico §6.1 |
| `abi` | performance | **DIRETO** (fatia-1) | — | idem |
| `itm_pct` | performance | **DIRETO** (fatia-1) | — | idem |
| `bankroll_usd` | financial_brm | **DIRETO** (fatia-1) | — | sem plano; `wallets` FX→USD lesson #6 |
| `leak_focus_progress` (NOVO RF-02) | leak_focus | **MOTOR (themes) + getStatsLeaks** | `themes_focus_studied` (parcial) | RF-02 define a métrica de progresso |

**Travado:** as 4 metas de **volume/estudo** migram pro motor; **performance/financeira** ficam na agregação direta da fatia-1 (não têm plano). `leak_focus` é caso especial (RF-02).

### DEC-2 — Integração no placar: ADITIVA, não substitutiva (back-compat lesson #7)
O `GET /api/goals/scoreboard` **adiciona** campos por medida; **não remove** nem renomeia os existentes (`current/target/expectedNow/status`). Campos novos por entry de medida:
- `compliancePct: number | null` — do motor quando resolveu via motor; `null` para metas diretas (performance/financeira não têm "% cumprimento do plano").
- `dataSufficiency: 'ok' | 'low'` — propagado do motor OU da agregação direta (`aggregateCurrentValue` já retorna `dataSufficiency`); **deixa de ser hardcoded `"ok"`** (RF-04).
- `adherence?: { planned, actual, skipped, shortfall, overachieved, note }` — bloco opcional do `breakdown` do motor (só presente em metas via motor), para a UI mostrar "pulado conscientemente" vs "abaixo do plano". `null`/ausente para metas diretas.

O `status` (`deriveStatus`) continua derivado do pace para WIG e metas diretas. Para metas **via motor**, o `current` da entry passa a ser o `actual` do motor (DEC-3); `status` continua via `deriveStatus(current, expectedNow, target, dir)` — o motor **não** substitui o status, só enriquece `current` + `compliancePct` + `adherence`.

### DEC-3 — `current` de meta via motor = `actual` do motor (não a agregação direta)
Para uma meta que resolve via motor, o `current` exibido no placar é o `actual` do `getPlannedVsActual` (realizado na janela, contado pela lógica do motor que respeita o plano), **não** o `aggregateCurrentValue` da fatia-1. Isso evita dois números divergentes de "realizado" na mesma tela. A agregação direta da fatia-1 permanece **só** para as metas diretas (performance/financeira).

### DEC-4 — Métrica de progresso de `leak_focus` (medição HONESTA, RF-02)
`getStatsLeaks` dá `severity` **sintético** + `benchmark` estático com `value`/`delta` **sempre `null`** — **não** dá delta-de-mão. Logo, "progresso de leak" **não** pode ser "delta caiu X". Progresso honesto = **o jogador está atacando o leak + o leak some do radar**:

- **Sinal primário (resolução):** `coach_leak_focus` do leak alvo com `status='resolved'` (campo real, `resolvedAt`). → meta `achieved`.
- **Sinal secundário (saiu do top-N):** o `statId` da meta **deixou de aparecer** no `getStatsLeaks(userId, N)` (N = threshold do architect, sugestão 10) vs a baseline (estava no top na criação). → progresso (`on_track`/`ahead`).
- **Sinal de esforço (ataque):** quantas `study_sessions_v2 mode='stat_analysis'` com o `statId` da meta foram registradas na janela — reusa o motor (`themes_focus_studied`) OU contagem direta de stat_analysis pelo statId. Esforço sem queda de severity = "atacando, ainda não resolvido" (`behind`, não `at_risk`).
- **Degrade obrigatório (RF-15 / lessons #9, #11):** `getStatsLeaks` vazio/erro → meta `leak_focus` mostra `dataSufficiency='low'` + nota "sem leaks detectados — defina foco manualmente / via temas", **log antes do fallback**, **flow não quebra**, **nenhum dado fabricado** (não inventa severity/progresso).

**Travado (modelo de progresso leak_focus):**
```
se coach_leak_focus(statId).status == 'resolved'        -> status='achieved', compliancePct=100, dataSufficiency='ok'
senão se getStatsLeaks vazio/erro                        -> status preservado, compliancePct=null, dataSufficiency='low', note='source_stub'
senão se statId NÃO está mais no getStatsLeaks(top N)    -> status='ahead'|'on_track' (saiu do radar), dataSufficiency='ok'
senão (ainda no top N):
   se houve stat_analysis do statId na janela            -> status='behind' (atacando), compliancePct via esforço, dataSufficiency='ok'
   senão                                                  -> status='at_risk' (no radar e sem ataque), dataSufficiency='ok'
```
`compliancePct` de leak_focus = % de esforço relativo (sessões de stat_analysis do statId na janela / alvo da meta `targetValue`), clampado em 100; `null` quando degradado. **Nunca** fabrica severity/delta.

### DEC-5 — `dataSufficiency` PROPAGA ao snapshot e ao placar (RF-04)
O scoreboard hoje grava `dataSufficiency: "ok"` hardcoded no `upsertGoalSnapshot`. fatia-2 propaga o `dataSufficiency` real (do motor OU da agregação direta OU do degrade leak_focus). O `compliancePct` real (antes nunca escrito) passa a ser gravado no snapshot. **Sem migration** (colunas já existem).

### DEC-6 — `skipped` (A4) não conta como falha
Quando o motor retorna `breakdown.skipped=true` (dimensão pulada conscientemente no EST-6), `compliancePct=null` e o `status` **não** vira `at_risk` por causa disso — a meta exibe um estado neutro/"pausado" (A4: cobra comportamento, não culpa). O architect define se isso é um `status` novo (ex: `paused`) ou reusa `on_track` com um flag `adherence.skipped`. **Recomendação:** reusar `on_track` + flag `adherence.skipped=true` (não inventar enum novo — `GoalStatus` é contrato fatia-1, lesson #7/#8).

### DEC-7 — Tier gate inalterado
Leitura (`/scoreboard`, `/snapshots`, `/api/goals`) = todos os tiers (read-only). Escrita (criar leak_focus, etc.) = `getReportTier !== 'free'` (herdado fatia-1, `denyIfFreeTier`). fatia-2 **não** muda o gate.

---

## Decisões DEFERIDAS (para o architect marcar / METAS-1.1)
- **DEF-1 — janela mensal/trimestral do motor para metas performance.** O motor tem `TODO(adherence/MEDIUM-1)`: `planned` de grind conta dias-distintos ignorando a janela, correto só para `kind:'week'`. fatia-2 usa o motor **só com `kind:'week'`** (recap semanal). Metas com horizonte `month`/`quarter` continuam status via pace + agregação direta; **não** chamar o motor com `kind:'month'`/`'quarter'` até o motor expandir recorrências. Marcar como dívida.
- **DEF-2 — `lessons_recommended_done` via motor** tem `TODO(adherence/MEDIUM-2)`: `actual` é estruturalmente binário (consumedAt = consumo do card, não conclusão por aula) → pode emitir `compliancePct:100` falso. fatia-2 **não** mapeia nenhuma meta para `lessons_recommended_done` (não está nas categorias de meta da fatia-1). Não exercitado.
- **DEF-3 — cobrança de segunda (RF-09) e sugestão LLM (RF-13)** = METAS-1.1. fatia-2 só toca o placar/snapshot (read).
- **DEF-4 — UI: badge "pulado conscientemente" / "atacando leak"** — o placar `/metas` deve renderizar os campos novos (RF-05), mas o refino visual fino fica para METAS-1.1 (reusa estrutura atual, sem componente novo grande).
- **DEF-5 — snapshot gerado por cron (RF-08 da spec-mãe)** — a fatia-1 faz UPSERT on-read no `/scoreboard`. fatia-2 mantém on-read (não adiciona job no `reportJobRunner`). Cron-driven = futuro.

---

## Requisitos Funcionais

### RF-01: Mapa-ponte goal `sourceMetric` → motor `SourceMetric`
**Descrição:** introduzir o mapa que decide, por `sourceMetric` de meta, se ela resolve via motor (e qual `SourceMetric` do motor usar) ou via agregação direta.
**Regras de negócio:**
- Novo módulo `server/coach/goals/adherenceBridge.ts` (ou similar) exporta `GOAL_METRIC_TO_ADHERENCE: Record<string, AdherenceSourceMetric>` cobrindo **só** `sessions_per_week→grind_sessions_count`, `grind_days→grind_days`, `study_minutes_week→study_minutes`, `study_sessions_count→study_sessions_count`.
- `sourceMetric` **sem** entrada na ponte → resolve via agregação direta da fatia-1 (rota intocada).
- `leak_focus_progress` (RF-02) **não** entra nesta ponte simples — tem resolução dedicada.
- A ponte é a **fonte única** dessa decisão (lesson #10 — não espalhar `if sourceMetric === ...`).
**Critério de aceitação:**
- [ ] `GOAL_METRIC_TO_ADHERENCE` tem exatamente as 4 entradas de volume/estudo e nenhuma de performance/financeira (guard test).
- [ ] `sourceMetric` de performance (`roi_pct`/`abi`/`itm_pct`) e financeira (`bankroll_usd`) **não** têm entrada → caem em agregação direta.
- [ ] Cada valor da ponte é um `SourceMetric` válido do motor (presente em `SOURCE_METRIC_MAP`) — guard test contra `server/coach/adherence/sourceMetricMap.ts` (sem entrada órfã).

### RF-02: Habilitar a categoria `leak_focus` (criação + medição honesta)
**Descrição:** permitir criar uma meta de medida na categoria `leak_focus` (hoje recusada com `lead_no_data_source` porque não há `sourceMetric` mapeada) e medir seu progresso honestamente (DEC-4).
**Regras de negócio:**
- Adicionar `sourceMetric` `leak_focus_progress` (nome travado) à allowlist controlável (`CONTROLLABLE_SOURCE_METRICS` em `shared/goals.ts`) **e** ao `GOALS_SOURCE_METRIC_MAP` com um `kind` novo `leak` (`server/coach/goals/sourceMetricMap.ts`) → assim `createMeasureHandler` aceita a meta (não cai em `lead_not_controllable` nem `lead_no_data_source`).
- A meta `leak_focus` referencia o leak alvo: persiste o **`statId`** alvo (catálogo id ou `custom_*`) — reusa a coluna `source_metric`? **NÃO** — o `source_metric` é `leak_focus_progress` (o tipo de métrica); o **statId alvo** precisa de um lugar. **Travado:** reusar a coluna `title` é frágil; o architect decide entre (a) reusar coluna existente livre, ou (b) convencionar `sourceMetric = "leak_focus_progress:<statId>"` (sufixo, como o padrão `leak:<code>` do detectLeaks) **sem nova coluna** (preferido — sem migration). Validar `statId` com `isValidStatId` (`server/coach/statId.ts`, já existe).
- Progresso medido conforme DEC-4 (resolução `coach_leak_focus` → saiu do top-N → esforço stat_analysis → degrade).
- **Degrade gracioso (RF-15):** `getStatsLeaks` vazio/erro → `dataSufficiency='low'` + note, log antes do fallback, flow não quebra (lessons #9/#11).
**Critério de aceitação:**
- [ ] POST `/api/goals` com `category='leak_focus'` + `sourceMetric='leak_focus_progress[:statId]'` + `unit`/`cadence`/`targetValue` → **201** (não mais `lead_no_data_source`).
- [ ] `coach_leak_focus(statId).status='resolved'` → meta exibe `status='achieved'`, `compliancePct=100`.
- [ ] `statId` saiu do `getStatsLeaks(top N)` → `status ∈ {ahead, on_track}`, `dataSufficiency='ok'`.
- [ ] `statId` ainda no top-N + houve stat_analysis na janela → `status='behind'`.
- [ ] `statId` ainda no top-N + sem ataque → `status='at_risk'`.
- [ ] `getStatsLeaks` retorna `[]` / lança → `dataSufficiency='low'`, note `source_stub`/`source_error`, **log antes**, sem fabricar dado, flow não quebra.
- [ ] `statId` inválido na criação → `lead_no_data_source` (ou erro de validação statId) — não persiste lixo.

### RF-03: Scoreboard resolve `compliancePct` rigoroso para metas de processo (via motor)
**Descrição:** no `GET /api/goals/scoreboard`, para cada medida cujo `sourceMetric` está na ponte (RF-01), resolver via `getPlannedVsActual(userId, bridgedMetric, {kind:'week', weekStartDate}, storage)` e usar seu resultado (DEC-2/3).
**Regras de negócio:**
- Janela = `{kind:'week', weekStartDate: ymdUtc(now)}` (chave UTC, igual fatia-1; **só** `kind:'week'` por DEF-1).
- `current` da entry = `actual` do motor (DEC-3). `compliancePct` = `compliancePct` do motor. `dataSufficiency` = `dataSufficiency` do motor. `adherence` = `breakdown` do motor (`{planned, actual, skipped, shortfall, overachieved, note}`).
- `status` = `deriveStatus(current, expectedNow, target, dir)` (pace inalterado), **exceto** quando `breakdown.skipped` (DEC-6: estado neutro + flag).
- Motor lança / retorna degradado (`no_plan`, `source_error`, `window_open`) → **não** quebra o scoreboard: usa `compliancePct=null`, `dataSufficiency='low'`, `current` cai no `aggregateCurrentValue` da fatia-1 como fallback (log antes — lesson #9). O scoreboard **nunca** retorna 500 por causa de uma meta degradada (cada meta é isolada, igual ao `try/catch` por entry já existente).
- Metas **sem** entrada na ponte (performance/financeira) → caminho fatia-1 intacto (`aggregateCurrentValue`), `compliancePct=null`, `dataSufficiency` real da agregação (RF-04).
**Critério de aceitação:**
- [ ] Meta `sessions_per_week` com plano EST-6 de 4 sessões + 2 feitas → `compliancePct=50`, `current=2`, `dataSufficiency='ok'`, `adherence.shortfall=2`.
- [ ] Meta com dimensão `skipped` no EST-6 → `compliancePct=null`, `adherence.skipped=true`, `status` neutro (não `at_risk`).
- [ ] Meta sem plano na janela (`no_plan`) → `compliancePct=null`, `dataSufficiency='low'`, `current` via fallback agregação direta, **scoreboard responde 200**.
- [ ] Motor lança → log antes, meta degrada, scoreboard 200 (outras metas intactas).
- [ ] Meta de performance (`roi_pct`) → caminho fatia-1, `compliancePct=null`, `current` via `getPerformanceByPeriod` (§6.1 `grind_session_id IS NULL`).

### RF-04: Propagar `dataSufficiency` real + persistir `compliancePct` no snapshot
**Descrição:** o `upsertGoalSnapshot` on-read deixa de gravar `dataSufficiency:"ok"` hardcoded; grava o `dataSufficiency` real + o `compliancePct` real por entry.
**Regras de negócio:**
- `upsertGoalSnapshot({ ..., compliancePct, dataSufficiency, streakDays })` recebe os valores reais por entry. (`streakDays` permanece `0`/default no MVP — fora de escopo o cálculo de streak; documentar.)
- Idempotência preservada: UNIQUE `(goal_ref_id, week_start_date)` → reprocessar UPSERT, não duplica (fatia-1).
- Amostra fraca (`dataSufficiency='low'`) é gravada como `low` (não mascarar com `ok`).
**Critério de aceitação:**
- [ ] Snapshot gravado reflete `dataSufficiency` real (não hardcoded `ok`) — test verifica que `low` chega ao `upsertGoalSnapshot`.
- [ ] Snapshot gravado reflete `compliancePct` real (antes sempre ausente/null) para metas via motor.
- [ ] Reprocessar `/scoreboard` na mesma semana → UPSERT, 1 snapshot/meta/semana.

### RF-05: Placar `/metas` renderiza os campos novos (UI mínima aditiva)
**Descrição:** o placar exibe, por medida, o `compliancePct` (quando presente), o badge de `dataSufficiency='low'`, e o estado "pulado conscientemente" vs "abaixo do plano" (DEC-6). Sem componente novo grande (DEF-4).
**Regras de negócio:**
- Aditivo ao `MetasPage.tsx` atual (que já mostra `current/target/expectedNow/status`). Novos `data-testid` estáveis (lesson #2): `measure-compliance-<id>`, `measure-datasufficiency-<id>`, `measure-adherence-<id>`.
- `compliancePct=null` → renderiza "—" (não "0%", não fabrica).
- `dataSufficiency='low'` → badge "amostra fraca" + (para leak_focus degradado) CTA "definir foco via temas" → rota Wouter existente (`/estudos` ou tema; **architect grepa `Route path` em `client/src/App.tsx`** — lesson #19).
- `adherence.skipped=true` → label "pulado conscientemente" (A4); `adherence.shortfall>0` → "abaixo do plano".
- RF-06 da spec-mãe **mantida:** placar NÃO mostra P&L diário / ROI semanal (guard de ausência inalterado).
**Critério de aceitação:**
- [ ] Medida via motor com `compliancePct=50` → `measure-compliance-<id>` mostra `50%`.
- [ ] `compliancePct=null` → mostra "—", nunca "0%".
- [ ] `dataSufficiency='low'` → badge presente.
- [ ] `adherence.skipped` → label "pulado conscientemente"; nenhum CTA culpabilizante.
- [ ] Guard de ausência de P&L diário/ROI semanal continua passando (RF-06 fatia-1).

---

## Requisitos Não-Funcionais
- **Back-compat aditiva (lesson #7):** nenhum campo do contrato do scoreboard removido/renomeado; `compliancePct`/`dataSufficiency`/`adherence` são adições opcionais. Testes legados da fatia-1 continuam verdes.
- **Degradação graciosa (RF-15, lessons #9/#11):** motor ou `getStatsLeaks` degradado **nunca** quebra o placar; cada meta é isolada (try/catch por entry, já existe); **log antes** de qualquer fallback; **nunca** fabrica dado.
- **§6.1:** metas de performance/financeira via agregação direta usam histórico (`grind_session_id IS NULL`); o motor usa `grind_sessions`/`session_tournaments` da janela (detalhe de sessão, permitido). Não misturar.
- **FX → USD (lesson #6):** metas financeiras continuam normalizando FX→USD na agregação direta (inalterado).
- **Determinismo (mock = shape real, lesson #3):** os testes mockam o **shape real** de `getPlannedVsActual` (`PlannedVsActual` de `server/coach/adherence/types.ts`) e de `getStatsLeaks` (`StatLeak[]` de `server/coach/leaks/types.ts`) — **nunca** mock idealizado (3 CRITICAL passaram por isso em Metas/MDA).
- **Tier gate:** inalterado (DEC-7).
- **Sem migration:** confirmado (colunas de snapshot já existem; allowlist + mapa são código).
- **Janela só `week` (DEF-1):** o motor é chamado exclusivamente com `kind:'week'` nesta fatia.

## Endpoints Previstos
> **Nenhum endpoint novo.** A fatia-2 muda o **comportamento interno** de `GET /api/goals/scoreboard` (enriquece a resposta) e o **gate de criação** de `POST /api/goals` (aceita `leak_focus`). Contrato HTTP aditivo.

| Método | Rota | Mudança fatia-2 | Auth |
|---|---|---|---|
| GET | /api/goals/scoreboard | + `compliancePct`/`dataSufficiency`/`adherence` por medida; `current` via motor p/ metas de processo | JWT (todos os tiers) |
| POST | /api/goals | aceita `category='leak_focus'` + `sourceMetric='leak_focus_progress[:statId]'` | JWT + tier eligible |

## Modelos de Dados Afetados
**Nenhuma migration.** Reuso integral:
- `goal_progress_snapshots` — colunas `compliance_pct`, `streak_days`, `data_sufficiency` **já existem** (verificado em `goalsStorage.upsertGoalSnapshot`); fatia-2 só passa a **preenchê-las** com valor real.
- `goals` — `leak_focus` reusa colunas existentes; `statId` alvo via convenção de sufixo no `source_metric` (DEC/RF-02), sem coluna nova.
- `coach_leak_focus` — leitura do `status`/`resolvedAt` (sinal de resolução, RF-02). Sem alteração.

**Tabelas/serviços REUSADOS (read-only):** `getPlannedVsActual` (ADR-227), `getStatsLeaks` + `coach_leak_focus` (ADR-231), `aggregateCurrentValue`/`computePace` (fatia-1), `study_sessions_v2` (mode='stat_analysis' p/ esforço leak), `weekly_planning_sessions` (plano), `getPerformanceByPeriod`, `wallets`/`fxResolver`.

## Integrações Externas
Nenhuma nesta fatia (sem LLM — RF-13 deferido para METAS-1.1).

---

## Contrato de saída atualizado do `GET /api/goals/scoreboard` (aditivo)

```jsonc
{
  "wigs": [
    {
      "careerGoalId": "string",
      "title": "string",
      "horizon": "quarter|season",
      "current": "number|null",
      "target": "number",
      "expectedNow": "number|null",
      "status": "ahead|on_track|behind|at_risk|achieved"
      // WIGs: SEM mudança (não usam motor — performance/result, sem plano semanal)
    }
  ],
  "measures": [
    {
      "id": "string",
      "title": "string",
      "sourceMetric": "string",
      "current": "number|null",          // metas via motor: = adherence.actual (DEC-3)
      "target": "number",
      "expectedNow": "number|null",       // pace (inalterado)
      "status": "ahead|on_track|behind|at_risk|achieved",
      // ---- ADIÇÕES fatia-2 (opcionais; ausentes/null em metas diretas) ----
      "compliancePct": "number|null",     // motor; null p/ performance/financeira/degradado
      "dataSufficiency": "ok|low",        // real (deixa de ser hardcoded 'ok')
      "adherence": {                      // presente só em metas via motor
        "planned": "number|null",
        "actual": "number",
        "skipped": "boolean",
        "shortfall": "number|null",
        "overachieved": "boolean",
        "note": "planned_zero|no_plan|window_open|source_stub|source_error|plan_from_weekly_plan|null"
      } // | null
    }
  ],
  "snapshotsWeek": "YYYY-MM-DD"           // inalterado
}
```

---

## Cenários de Teste Derivados (para o test-writer)

> **Lesson #3:** mockar `getPlannedVsActual` retornando o shape REAL de `PlannedVsActual` (incl. `breakdown`); mockar `getStatsLeaks` retornando `StatLeak[]` real (`value`/`delta` SEMPRE null). **Lesson #34:** handlers via `injectedStorage` 3º arg. **Lessons #14/#26/#38:** testes `.tsx` via `await import`, nunca `require`.

### Happy Path
- [ ] Meta `sessions_per_week`, plano EST-6 4 sessões, 2 completas → scoreboard mede via motor: `compliancePct=50`, `current=2`, `adherence.shortfall=2`, `dataSufficiency='ok'`; snapshot grava `compliancePct=50`/`dataSufficiency='ok'`.
- [ ] Meta `leak_focus` cujo `coach_leak_focus.status='resolved'` → `status='achieved'`, `compliancePct=100`.

### RF-01 (ponte) / DEC-1
- [ ] `GOAL_METRIC_TO_ADHERENCE` = exatamente {sessions_per_week, grind_days, study_minutes_week, study_sessions_count} (validar presença individual — lesson #8, não length).
- [ ] Cada valor da ponte ∈ `SOURCE_METRIC_MAP` do motor (sem órfão).
- [ ] `roi_pct`/`bankroll_usd` NÃO na ponte → agregação direta.

### RF-02 (leak_focus)
- [ ] POST `leak_focus` válido → 201 (não `lead_no_data_source`).
- [ ] statId saiu do top-N → `status ∈ {ahead, on_track}`.
- [ ] statId no top-N + stat_analysis na janela → `behind`.
- [ ] statId no top-N + sem ataque → `at_risk`.
- [ ] `getStatsLeaks` `[]` → `dataSufficiency='low'`, note `source_stub`, log emitido, sem fabricar.
- [ ] `getStatsLeaks` throw → degrada, log antes, scoreboard 200.
- [ ] statId inválido na criação → recusado (não persiste).

### RF-03 (compliancePct rigoroso)
- [ ] `breakdown.skipped=true` → `compliancePct=null`, status neutro (não `at_risk`), `adherence.skipped=true` (DEC-6).
- [ ] motor `no_plan` → `compliancePct=null`, `dataSufficiency='low'`, `current` via fallback agregação direta, **200**.
- [ ] motor throw em UMA meta → essa meta degrada, **outras metas e o scoreboard intactos (200)** (isolamento por entry).
- [ ] meta direta (`roi_pct`) → `compliancePct=null`, `current` via `getPerformanceByPeriod`, `dataSufficiency` real da agregação; §6.1 (`grind_session_id IS NULL`) — guard.
- [ ] `overachieved` (3 feitas de 2 planejadas) → `compliancePct=100` (clamp), `adherence.overachieved=true`, `status` pode ser `achieved`/`ahead`.

### RF-04 (snapshot)
- [ ] `dataSufficiency='low'` chega ao `upsertGoalSnapshot` (não mais hardcoded `ok`).
- [ ] `compliancePct` real chega ao `upsertGoalSnapshot`.
- [ ] reprocessar mesma semana → UPSERT idempotente (1 row/meta/semana).

### RF-05 (UI)
- [ ] `measure-compliance-<id>` = "50%" quando `compliancePct=50`.
- [ ] `compliancePct=null` → "—" (nunca "0%").
- [ ] `dataSufficiency='low'` → badge presente.
- [ ] `adherence.skipped` → "pulado conscientemente" (sem culpa).
- [ ] guard de ausência de P&L diário/ROI semanal (RF-06 fatia-1) continua passando.

### Back-compat (lesson #7) — CRÍTICO
- [ ] Resposta do scoreboard mantém `wigs/measures/snapshotsWeek` + `current/target/expectedNow/status`; testes da fatia-1 (ADR-229) continuam verdes sem alteração.
- [ ] Meta criada na fatia-1 (sourceMetric direto, sem leak) continua renderizando idêntica (campos novos ausentes/null, não quebram a UI legada).
- [ ] WIG no scoreboard: SEM mudança (não passa pelo motor).

### Edge / Degradação
- [ ] amostra fraca (`actual=0`, `planned` baixo) → `dataSufficiency='low'`, sem veredito forte (D9).
- [ ] `weekly_planning_session` ausente → `no_plan` degrade, 200.
- [ ] tier `free` → 403 em POST `leak_focus`; `/scoreboard` continua read-only (200 com campos enriquecidos).

## Fora de Escopo
- **Cobrança de segunda (RF-09) + sugestão LLM (RF-13)** = METAS-1.1.
- **Templates de perfil (RF-14)** = METAS-1.1.
- **Cálculo de `streakDays`** (hábito A9) — fica `0`/default; futuro.
- **Janela `month`/`quarter` no motor** (DEF-1) — só `week` nesta fatia (dívida documentada no motor: `TODO adherence/MEDIUM-1`).
- **`lessons_recommended_done` via motor** (DEF-2) — não mapeado a meta; dívida do motor.
- **Snapshot por cron** (DEF-5) — mantém on-read.
- **Componente UI novo grande / refino visual** (DEF-4) — adições aditivas mínimas ao `MetasPage`.
- **Migration / nova coluna** — confirmado: nenhuma.
- **Atribuição causal "esta medida moveu a WIG em X%"** — qualitativo (spec-mãe).

## Dependências (todas PRONTAS no worktree)
- **Motor de aderência** `server/coach/adherence/{index,types,sourceMetricMap}.ts` (ADR-227) — `getPlannedVsActual` + tipos `PlannedVsActual`/`SourceMetric`/`AdherenceBreakdown`.
- **getStatsLeaks** `storage.getStatsLeaks(userId, top)` + `server/coach/leaks/{detectLeaks,types}.ts` (ADR-231) — `StatLeak[]`.
- **coach_leak_focus** (`status`/`resolvedAt`) + storage `findActiveLeakFocusList`/`updateCoachLeakFocus`.
- **Fatia-1** `server/routes/goals.ts`, `server/coach/goals/{aggregateCurrentValue,computePace,sourceMetricMap}.ts`, `server/storage/goalsStorage.ts`, `shared/goals.ts`, `client/src/pages/metas/MetasPage.tsx` (ADR-229).
- **`getReportTier`** (`server/coach/reportEligibility.ts`).
- **`server/coach/statId.ts`** (`isValidStatId`) — validar statId alvo do leak_focus.

## Decisões abertas para o System-Architect
1. **DEC-A1 (fatia-2) — onde o statId alvo do `leak_focus` mora.** Recomendação: convenção `sourceMetric = "leak_focus_progress:<statId>"` (sufixo, padrão `leak:<code>` do detectLeaks) — **sem coluna nova / sem migration**. Parser único + `isValidStatId`. Confirmar (alternativa: reusar coluna livre de `goals`).
2. **DEC-A2 (fatia-2) — `status` neutro p/ `skipped`.** Recomendação: reusar `on_track` + flag `adherence.skipped=true` (não inventar enum novo — `GoalStatus` é contrato fatia-1, lesson #7). Confirmar.
3. **DEC-A3 (fatia-2) — threshold N do "saiu do top-N" do `getStatsLeaks`** (sugestão 10) e o alvo de esforço de `compliancePct` de leak_focus (sessões stat_analysis / `targetValue`). Definir números.
4. **DEC-A4 (fatia-2) — `compliancePct` de leak_focus quando não há `coach_leak_focus` nem stat_analysis** (só presença/ausência no top-N): `null` ou derivado? Recomendação: `null` quando não há nenhum sinal de esforço (não fabricar — lesson #11).
5. **DEC-A5 (fatia-2) — fallback de `current` quando o motor degrada (`no_plan`/throw):** usar `aggregateCurrentValue` da fatia-1 (DEC mantém 2 caminhos) ou exibir "—"? Recomendação: fallback à agregação direta (mantém um número útil), `dataSufficiency='low'`, log antes (#9). Confirmar.
6. **DEC-A6 (fatia-2) — ADR.** Criar ADR fatia-2 (numerar após 231) referenciando ADR-227 (motor) + ADR-229 (fatia-1) + ADR-231 (leaks). Documentar a ponte de vocabulário de `sourceMetric` (fatia-1 vs motor) como decisão explícita.

## Riscos
- **Vocabulário divergente de `sourceMetric` (fatia-1 vs motor)** — sem a ponte (RF-01) como fonte única, vira `if` espalhado (lesson #10). Mitigação: mapa único + guard test.
- **Mock idealizado (lesson #3)** — 3 CRITICAL já passaram em Metas/MDA por mock que não bate o shape real. Mitigação: test-writer mocka `PlannedVsActual`/`StatLeak` reais; reviewer verifica contra `types.ts`.
- **leak_focus prometer mais do que `getStatsLeaks` entrega** — severity é sintético, sem delta-de-mão. Mitigação: DEC-4 mede esforço + resolução, **nunca** "delta caiu"; degrade `low` + note quando sem sinal.
- **Janela mensal do motor incorreta (DEF-1)** — chamar motor com `month`/`quarter` infla compliance. Mitigação: fatia-2 só usa `kind:'week'`; performance/financeira ficam diretas.
- **Quebra de back-compat do scoreboard** — adição não-aditiva derrubaria testes/UI fatia-1. Mitigação: contrato estritamente aditivo (DEC-2) + suíte fatia-1 como regressão.
- **Working tree compartilhada (INCIDENT #24/#44/#45)** — `git add` explícito por arquivo; trabalhar SÓ em `B:/grindfy-metas2` (NUNCA `B:/grindfy`).

## Notas de Implementação (opcional)
- Mapa-ponte em `server/coach/goals/adherenceBridge.ts` (módulo puro, guard test contra `SOURCE_METRIC_MAP`).
- A resolução de leak_focus em `server/coach/goals/leakFocusProgress.ts` (helper puro recebe `StatLeak[]` + `coachLeakFocus` + contagem stat_analysis por composição — lesson #34; **nunca** `new Date()` interno — recebe `currentWeekStart` pronto, igual `detectLeaks`).
- O enriquecimento do scoreboard em `buildScoreboardEntry` (já existe em `goals.ts`): adicionar branch "via motor" antes do `aggregateCurrentValue`, isolado em try/catch por entry (padrão já presente).
- UI: adições mínimas em `client/src/pages/metas/MetasPage.tsx` com `data-testid` estáveis; testes `.tsx` via `await import` (lessons #14/#26/#38); ErrorBoundary local mantida (lesson #29).
- Verify browser (`/metas`) é parte do "done".
```
