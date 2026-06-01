# Spec: Motor de Aderência (plano-vs-realizado) — Fase A

> Primeiro sprint dos finais pós-EST. **Item #7 do board ICE** (`Docs/strategy/estrategia-sprints-finais-2026-06-01.md` §3, ICE 7.3, 🔑 keystone). Estratégia-mãe + sequência: §1 loop, §4 Fase A. Doutrina mental: `Docs/strategy/curso-antes-das-cartas-learnings-2026-06-01.md` (âncoras A4/A9/C7/D9). Contrato consumido pela Metas fatia-2: `Docs/specs/metas-tool-2026-06-01.md` §"Dependência crítica — Motor de Aderência" + DEC-A7.
>
> **Regra editorial:** o motor é a fundação 4DX (A9: *sistema acima da força de vontade*). Toda decisão de design ancora numa aula do curso ou numa lesson learned do repo. Pipeline TDD: `pm-spec (este) → system-architect → test-writer → implementer → /simplify → reviewer`.

## Status
Proposta

## Resumo
Serviço **puro, read-only, stateless** (`server/coach/adherence/`) que compara o **plano intencionado** (EST-6: `weekly_planning_sessions`, `study_weekly_plans`, `planned_tournaments`) com o **realizado** (`grind_sessions`, `study_sessions_v2`, `tournaments`) por janela de tempo. Expõe o contrato estável **`getPlannedVsActual(userId, sourceMetric, period)` → `{ planned, actual, compliancePct, dataSufficiency, breakdown }`** (DEC-A7) que a Ferramenta de Metas (fatia 2) e o recap do ritual de segunda (EST-5) consomem. Fecha o loop: hoje o plano é gerado mas **nunca comparado** — o mentor recomenda, não cobra. O motor distingue **"pulado conscientemente"** (`steps.status='skipped'`) de **"não feito"** (sem realizado, sem skip), em linguagem A4 (cobra comportamento, não culpa).

## Contexto
- **O buraco (estratégia §1):** o EST-6 persiste o plano (grade + blocos de estudo + aulas + temas) mas **nenhum código compara plano × realizado** (`grep` por aderência só acha *nudge compliance* e *daily study goal*, não o motor). O loop GRIND→ESTUDA→IMPORTA→RITUAL→METAS→EXECUTA→**ADERÊNCIA** está cortado no último elo.
- **Por que é keystone:** o motor é a `sourceMetric` rigorosa que a Metas fatia-2 reusa (metas-tool §"Dependência crítica" — Fatia 1 usa agregação direta; Fatia 2 usa este motor para `compliancePct` fino "planejou 4 sessões com warm-up, fez 2 sem"). Também alimenta o recap da segunda (EST-5) com "semana passada você planejou X, realizou Y".
- **Por que agora:** EST-2 (recap enriquecido) + EST-5 (ritual de segunda) fecharam a cadência D4. O motor é o próximo elo da Fase A (estratégia §4).
- **Doutrina (A9):** "você não sobe ao nível das suas metas; você cai ao nível dos seus sistemas." O motor mede o **sistema cumprido** (plano executado), não o resultado. **D9:** janela pequena = ruído → o motor nunca crava veredito sem dado suficiente (`dataSufficiency`).
- **Prioridade relativa:** primeiro sprint da Fase A; precede a Metas fatia-2 e habilita o downgrade documentado da Metas fatia-1.

## Usuários
- **Jogador (Trial / Pro / Premium / Admin):** consumidor indireto — vê o resultado do motor no recap da segunda (EST-5) e, futuramente, no placar da Metas. **Não interage diretamente com o motor** (não há endpoint HTTP novo nesta fase).
- **Ferramenta de Metas (fatia 2, consumidor primário):** importa `getPlannedVsActual` para preencher `currentValue`/`compliancePct`/`dataSufficiency` dos snapshots (`goal_progress_snapshots`).
- **Recap do ritual de segunda (EST-5, consumidor desta fase):** chama o motor para a frase "semana passada você planejou X dias / Y horas / Z blocos, realizou A/B/C — sua alavanca esta semana é ___" (A4).
- **Coach AI (mentor, indireto):** o texto da cobrança usa o `breakdown` do motor (planejado vs realizado vs skipped) como insumo factual.

---

## Glossário (vocabulário do contrato — estável)

| Termo | Definição |
|---|---|
| **plano / intencionado** | o que o jogador comprometeu no EST-6 (`weekly_planning_sessions.steps`, `study_weekly_plans`, `planned_tournaments`). |
| **realizado** | o que efetivamente aconteceu (`grind_sessions` completas, `study_sessions_v2` completas, `tournaments` com `grind_session_id IS NULL` para histórico). |
| **`sourceMetric`** | identificador estável da métrica comparada (ex: `grind_sessions_count`, `study_minutes`). Allowlist na RF-02. |
| **`period`** | janela de tempo `{ kind: 'week'|'month'|'quarter', weekStartDate: 'YYYY-MM-DD' (UTC, ymdUtc) }`. |
| **`compliancePct`** | `min(100, round(actual / planned * 100))` quando `planned > 0`; `null` quando `planned === 0` (ver RF-04 — sem plano não há %). |
| **"pulado conscientemente"** | dimensão com `steps.<key>.status === 'skipped'` no EST-6 → conta como **decisão consciente**, NÃO falha (A4). |
| **"não feito"** | dimensão com plano > 0, sem skip, e `actual < planned` → o gap real que a cobrança endereça. |
| **`dataSufficiency`** | `'ok'` quando há plano + janela completa com dado; `'low'` quando falta plano, falta dado, ou fonte é stub (D9 — não cravar veredito). |

---

## Requisitos Funcionais

### RF-01: Serviço puro read-only `getPlannedVsActual` (contrato estável — DEC-A7)
**Descrição:** módulo puro em `server/coach/adherence/` que computa, **on-demand e sem persistir nada**, a comparação plano-vs-realizado de uma `sourceMetric` numa janela. É a interface que a Metas fatia-2 importa.
**Regras de negócio:**
- Assinatura: `getPlannedVsActual(userId: string, sourceMetric: SourceMetric, period: AdherencePeriod, injectedStorage?): Promise<PlannedVsActual>`. O `injectedStorage?` é o **3º arg** (lessons #34/#36 — testável sem `vi.mock('../storage')`; em produção faz lazy `await import('../storage')`).
- **Stateless:** o motor NÃO grava nada (sem migration, sem snapshot próprio — a persistência de snapshot é responsabilidade da Metas, RF-08 da metas-tool). Reprocessar a mesma janela retorna o mesmo resultado (idempotência por leitura, regra 4 do contrato).
- O shape do retorno é o EXATO da seção "Contrato exato" abaixo — **estável**: a Metas fatia-2 depende dele; mudanças de shape exigem ADR + bump documentado.
- Chave de janela em **UTC via `ymdUtc`** (`server/coach/planning/weekKeys.ts`), alinhada com `weekly_planning_sessions`/`study_weekly_plans` (CLAUDE.md §10 — **NÃO unificar com BRT**).
- Toda `sourceMetric` desconhecida (fora da allowlist RF-02) → erro nomeado `unknown_source_metric` (não 500 genérico).
**Critério de aceitação:**
- [ ] `getPlannedVsActual('USER-X', 'grind_sessions_count', { kind:'week', weekStartDate:'2026-06-01' })` retorna objeto com `{ sourceMetric, period, planned, actual, compliancePct, dataSufficiency, breakdown }`.
- [ ] Chamar 2x com os mesmos args → mesmo resultado (sem efeito colateral; guard test: storage write methods nunca chamados).
- [ ] `sourceMetric` fora da allowlist → throw `unknown_source_metric` (não exceção genérica).
- [ ] Assinatura aceita `injectedStorage` como 3º arg e o usa quando presente (não importa `../storage` quando injetado — guard test).

### RF-02: Allowlist de `sourceMetric` + mapa fonte plano → fonte realizado
**Descrição:** cada `sourceMetric` mapeia para (a) onde está o **planejado** e (b) onde está o **realizado**. O mapa é a fonte única de verdade do que o motor sabe comparar.
**Mapa canônico (escopo desta fase):**

| `sourceMetric` | Dimensão | Planejado (fonte) | Realizado (fonte) | Unidade |
|---|---|---|---|---|
| `grind_sessions_count` | Grind/volume | `weekly_planning_sessions.steps.grind.createdIds` (planned_tournaments) → dias/sessões planejados | `grind_sessions` status='completed' na janela (count) | sessões |
| `grind_days` | Grind/volume | dias distintos com torneio planejado (`planned_tournaments.scheduledDate`) | dias distintos com `grind_sessions` completa | dias |
| `planned_tournaments_count` | Grind/volume | `planned_tournaments` na janela | `session_tournaments` das sessões da janela **OU** `tournaments` (histórico) — ver regra §6.1 abaixo | torneios |
| `study_minutes` | Estudo | `study_weekly_plans.dailyTargetMinutes × dias` **OU** soma `steps.study` blocos `durationMinutes` | `study_sessions_v2` status='completed', soma `durationMinutes` na janela | minutos |
| `study_sessions_count` | Estudo | `weekly_planning_sessions.steps.study.sessionIds` (blocos planejados) | `study_sessions_v2` status='completed' (count) | sessões |
| `lessons_recommended_done` | Aulas | `weekly_planning_sessions.steps.lessons.lessonIds` (+ `coach_lesson_recommendations`) | aulas concluídas na janela (`library_progress` / `lesson_progress` — fonte exata pro architect) | aulas |
| `themes_focus_studied` | Temas | `weekly_planning_sessions.steps.themes.focus[].statId` | `study_sessions_v2` com `themeId` ∈ focus na janela | temas |
| `warmup_compliance` (stretch — RF-09) | Processo | sessões planejadas que deveriam ter warm-up | `cooldown_logs`/warm-up rituals 1:1 `grind_sessions` | % |

**Regras de negócio:**
- **§6.1 (regra de fonte do histórico — CLAUDE.md §6.1):** volume da semana usa `grind_sessions`/`session_tournaments` (detalhe da sessão); métricas de **histórico/performance** usam `tournaments WHERE grind_session_id IS NULL`. O motor desta fase compara **volume/estudo da janela** (sessão), não performance histórica — então `grind_sessions_count`/`grind_days`/`study_*` usam as tabelas de sessão. `planned_tournaments_count` realizado: preferir `session_tournaments` da(s) sessão(ões) da janela; documentar a escolha (DEC-MA3).
- O mapa é um objeto exportado (`SOURCE_METRIC_MAP`) — **guard test obrigatório**: nenhuma `sourceMetric` órfã (toda entrada resolve para fonte de plano + fonte de realizado existentes no storage).
- `lessons_recommended_done` e `themes_focus_studied` dependem de fontes que podem estar vazias/stub → degrade gracioso (RF-07).
- `warmup_compliance` é **stretch** (RF-09) — só entra se o sprint couber; senão sai com TODO grepável (não inventar dado).
**Critério de aceitação:**
- [ ] `SOURCE_METRIC_MAP` exportado; guard test confirma que toda chave tem `plannedSource` + `actualSource` mapeados (sem entrada órfã).
- [ ] Métrica de volume usa tabelas de sessão; nenhuma query do motor agrega `tournaments` em volume de janela sem o filtro §6.1 quando o realizado for histórico (guard test §6.1).
- [ ] Allowlist é a fonte única: chamar com chave fora dela → `unknown_source_metric` (RF-01).

### RF-03: Dimensão Grind/volume — planejado vs realizado
**Descrição:** compara dias/sessões/torneios planejados (EST-6) com os efetivamente realizados na janela.
**Regras de negócio:**
- **Planejado:** `weekly_planning_sessions` da janela (`getWeeklyPlanningSession(userId, weekStartDate)`); `steps.grind.createdIds` → `planned_tournaments`; dias planejados = dias distintos de `planned_tournaments.scheduledDate` (ou campo equivalente — architect confirma). Se `steps.grind.status === 'skipped'` → planejado conta como **decisão consciente** (RF-06), não 0-com-culpa.
- **Realizado:** `grind_sessions` com `status='completed'` cujo `startedAt`/data cai na janela. `grind_sessions_count` = count; `grind_days` = dias distintos.
- **FX:** N/A para volume (contagem). FX só aplica se algum dia o motor comparar P&L (fora de escopo desta fase — lesson #6 fica documentada para quem estender).
- Janela `week` = `[weekStartDate 00:00 UTC, +7 dias)` (via `ymdToUtcDate` + 7 dias). `month`/`quarter`: architect define os limites (DEC-MA2).
**Critério de aceitação:**
- [ ] Plano com 4 sessões, 3 `grind_sessions` completas na janela → `{ planned:4, actual:3, compliancePct:75, dataSufficiency:'ok' }`.
- [ ] `steps.grind.status==='skipped'` → `breakdown.skipped=true`, `compliancePct` reflete decisão consciente (RF-06), não falha.
- [ ] Sem `weekly_planning_sessions` na janela → `planned=null`, `dataSufficiency='low'` (RF-04).
- [ ] `grind_days` conta dias distintos (2 sessões no mesmo dia = 1 dia).

### RF-04: Distinção `planned === 0` / `planned === null` / sem plano (regra do compliance)
**Descrição:** o motor distingue "planejou 0" de "não há plano" — crítico para não emitir veredito falso (D9).
**Regras de negócio:**
- `planned > 0` → `compliancePct = min(100, round(actual / planned * 100))`, `dataSufficiency='ok'` (se janela completa).
- `planned === 0` (planejou explicitamente zero, ex: semana de descanso planejada) → `compliancePct = null`, `breakdown.note='planned_zero'`, `dataSufficiency='ok'` (é dado válido, não ausência).
- `planned === null` (não existe `weekly_planning_sessions`/plano na janela) → `compliancePct = null`, `dataSufficiency='low'` (não há baseline — não cobrar).
- `actual > planned` (fez mais que planejou) → `compliancePct` clampa em 100; `breakdown.overachieved=true` (A4: reconhecer superação, não esconder).
**Critério de aceitação:**
- [ ] `planned=0` → `compliancePct=null`, `note='planned_zero'`, `dataSufficiency='ok'`.
- [ ] `planned=null` (sem plano) → `compliancePct=null`, `dataSufficiency='low'`.
- [ ] `actual=6, planned=4` → `compliancePct=100`, `breakdown.overachieved=true`.
- [ ] `actual=0, planned=4, sem skip` → `compliancePct=0`, `breakdown.skipped=false` (gap real, "não feito").

### RF-05: Dimensão Estudo — planejado vs realizado
**Descrição:** compara minutos/sessões/temas de estudo planejados (EST-6) com `study_sessions_v2` realizadas.
**Regras de negócio:**
- **Planejado:** `study_weekly_plans` da janela (chave UTC `ymdToUtcDate(weekStartDate)`) → `dailyTargetMinutes` + dias do `planJsonb`; e/ou `weekly_planning_sessions.steps.study.sessionIds` (blocos planejados). `study_minutes` planejado = soma dos `durationMinutes` dos blocos planejados (ou `dailyTargetMinutes × dias planejados` — architect escolhe a fonte canônica, DEC-MA4).
- **Realizado:** `study_sessions_v2` com `status='completed'` na janela; `study_minutes` = soma `durationMinutes`; `study_sessions_count` = count. (EST-3 `stat_analysis` mode conta como sessão de estudo.)
- `steps.study.status==='skipped'` → decisão consciente (RF-06).
**Critério de aceitação:**
- [ ] Plano 300 min, realizado 180 min → `{ planned:300, actual:180, compliancePct:60 }`.
- [ ] `study_sessions_v2` mode `stat_analysis` conta no realizado (não filtra por mode).
- [ ] Sem `study_weekly_plans` e sem `steps.study` → `planned=null`, `dataSufficiency='low'`.

### RF-06: Distinção "pulado conscientemente" vs "não feito" (A4, regra 3 do contrato — DEC-A7)
**Descrição:** o motor generaliza a noção de `skipped` do EST-6 (`steps.<key>.status`) para qualquer dimensão, expondo no `breakdown` se o gap foi **decisão consciente** (skipped) ou **lacuna real** (não feito). É o que permite ao mentor cobrar comportamento sem culpa (A4).
**Regras de negócio:**
- Para cada dimensão, lê `weekly_planning_sessions.steps.<dimensionKey>.status`:
  - `'skipped'` → `breakdown.skipped=true`. **Não conta como falha.** `compliancePct`: o architect decide entre (a) `null` (não pontua) ou (b) `100` (cumpriu a decisão de pular). **Recomendação:** `compliancePct=null` + `breakdown.skipped=true` (skip não é nem sucesso nem falha — é decisão; A4). Confirmar em DEC-MA5.
  - `'confirmed'`/`'proposed'`/`'pending'` com `actual < planned` → `breakdown.skipped=false`, `breakdown.shortfall = planned - actual` (o gap "não feito").
- O `breakdown` carrega `{ skipped: boolean, shortfall: number|null, overachieved: boolean, note: string|null }` para o consumidor (Metas/EST-5) construir a frase A4 sem reinterpretar dados crus.
- **Mapa de `dimensionKey`** EST-6 → `sourceMetric`: `grind` → `grind_*`/`planned_tournaments_count`; `study` → `study_*`; `lessons` → `lessons_recommended_done`; `themes` → `themes_focus_studied`. Exportado para guard test.
**Critério de aceitação:**
- [ ] `steps.grind.status='skipped'` → `breakdown.skipped=true`, `compliancePct=null` (decisão consciente, não falha).
- [ ] `steps.study.status='confirmed'`, `planned=4 actual=2` → `breakdown.skipped=false, shortfall=2`.
- [ ] `breakdown` sempre presente no retorno (nunca undefined), com os 4 campos.

### RF-07: Degradação graciosa de fontes ausentes/stub (lesson #9, D9)
**Descrição:** fontes podem estar vazias (`getStatsLeaks` stub `[]`, `study_weekly_plans` ausente, `lesson_progress` não populado). O motor degrada sem quebrar e **loga antes do fallback** (lesson #9).
**Regras de negócio:**
- `themes_focus_studied`: se `steps.themes.focus` vazio (origem em `getStatsLeaks` stub) → `planned=null`, `dataSufficiency='low'`, log `adherence.themes.no_focus` antes do fallback (lesson #9). Não fabrica tema.
- Qualquer fonte que `throw` → captura, **loga com contexto** (`{ userId, sourceMetric, err }`), retorna `dataSufficiency='low'` + `planned/actual` parciais (o que conseguiu), nunca propaga 500 para o consumidor.
- Janela ainda em curso (semana corrente, não fechada) → `dataSufficiency='low'` (parcial; D9 — não cravar veredito em janela incompleta). Janela fechada (passada) com plano + dado → `'ok'`.
- **Nunca fabrica dado** (lesson #11 — default mínimo): fonte vazia vira `null`/`low`, não `0`-com-veredito.
**Critério de aceitação:**
- [ ] `getStatsLeaks` retorna `[]` → `themes_focus_studied` degrada (`low`), log emitido, flow não quebra.
- [ ] Fonte que `throw` → motor captura, loga, retorna `dataSufficiency='low'`, não propaga exceção.
- [ ] Janela da semana corrente (não fechada) → `dataSufficiency='low'`.
- [ ] Fonte vazia nunca produz `compliancePct` com veredito forte (sempre `null`/`low`).

### RF-08: Surface mínima — recap do ritual de segunda (EST-5) inclui plano-vs-realizado
**Descrição:** o recap da segunda (EST-5 weekly-review / estado de recap) passa a chamar o motor e incluir uma linha "semana passada você planejou X / realizou Y", em linguagem A4. **Não cria canal novo** — reusa a entrega existente do recap.
**Regras de negócio:**
- Helper puro (ex: `buildAdherenceRecap(userId, weekStartDate, injectedStorage?)`) que chama `getPlannedVsActual` para as dimensões principais (grind + estudo) da **semana passada** (`weekStartDate` = segunda anterior em UTC) e monta um objeto/texto consumível pelo recap.
- **Linguagem A4 (governa o tom):** cobra **comportamento específico** ("planejou 4 sessões, realizou 2; sua alavanca esta semana é ___"), NUNCA culpa ("você falhou", "você sempre", "você deveria ter"). Skip aparece como decisão neutra ("estudo: você optou por pular"). Regras de tom em **arquivo único** (lesson #10), análogo a `coachSafetyPrompts.ts` — reutilizar/estender se já existir o do EST-5.
- `dataSufficiency='low'` → o recap **não emite veredito** ("ainda sem plano/dado suficiente da semana passada para comparar" — D9), nunca um número de compliance forte.
- Onde pluga: o estado de recap do EST-5 (consumir o helper; não inventar rota). Architect confirma o ponto exato (DEC-MA6) lendo o código do EST-5.
**Critério de aceitação:**
- [ ] `buildAdherenceRecap` retorna estrutura/texto com planejado vs realizado de grind + estudo da semana passada.
- [ ] Texto do recap não contém "você falhou / sempre / nunca / deveria ter" (guard test de tom A4, lesson #10).
- [ ] `dataSufficiency='low'` → recap mostra mensagem de "sem dado suficiente", não compliance numérico forte.
- [ ] Skip aparece como decisão neutra, não como falha.

### RF-09 (stretch / opcional): Dimensão Processo — warm-up/cool-down compliance
**Descrição:** se o sprint couber, adicionar `warmup_compliance` comparando sessões que deveriam ter warm-up vs `cooldown_logs`/warm-up rituals realizados.
**Regras de negócio:**
- Sai do escopo se o sprint não couber — **TODO grepável** (`// TODO(motor-aderencia): warmup_compliance — RF-09 stretch`), não meia-implementação.
- Se entrar: reusa `cooldown_logs` (1:1 `grind_sessions`) + warm-up rituals; degrade gracioso se ausentes (RF-07).
**Critério de aceitação:**
- [ ] Implementado OU explicitamente deferido com TODO grepável + nota no resumo. Não fica meia-feito.

---

## Requisitos Não-Funcionais
- **Stateless / read-only:** o motor NÃO escreve. Zero migration (interface TS pura, como EST-2). Guard test: nenhum método de escrita do storage é invocado.
- **Tier gating:** o motor em si é **read-only puro → NÃO gateia por tier** (qualquer chamada interna roda). O gating fica no **consumidor** (Metas / EST-5 recap revalidam `getReportTier !== 'free'` antes de chamar — defense-in-depth no consumidor, espelha EST-5/6). Confirmado: o motor é fundação neutra.
- **Performance:** `getPlannedVsActual` de 1 `sourceMetric`/semana deve resolver com ≤ 3 queries (1 plano + 1 realizado + 1 skip/steps; reusar `weekly_planning_sessions` já carregado entre dimensões da mesma janela quando o consumidor batcha). Sem N+1 por torneio.
- **Idempotência por leitura:** mesma `(userId, sourceMetric, period)` → mesmo resultado, sempre (regra 4 do contrato). Stateless garante.
- **Chave de semana:** UTC via `ymdUtc`/`ymdToUtcDate` (`weekKeys.ts`), alinhada com `weekly_planning_sessions`/`study_weekly_plans`. **NÃO unificar com BRT** (CLAUDE.md §10). `coach_lesson_recommendations` (BRT) só é lida via util de conversão se `lessons_recommended_done` precisar — converter explicitamente, não unificar.
- **Degradação graciosa:** fonte ausente/stub nunca quebra (lesson #9 log antes do fallback; lesson #11 sem dado fabricado; RF-07).
- **§6.1:** volume usa tabelas de sessão; nunca agrega `tournaments` (histórico) em volume de janela sem o filtro `grind_session_id IS NULL` quando aplicável.
- **Custo LLM:** **zero** — o motor é determinístico (sem chamada Anthropic). A narrativa A4 do recap (EST-5) reusa o LLM/bundle já existente do EST-5; o motor só fornece os números.

## Endpoints Previstos
**Nenhum endpoint HTTP novo nesta fase** (decisão do escopo — a surface é o recap EST-5 + o contrato consumido em-processo pela Metas). O motor é um **módulo importável**, não uma rota.

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| — | — | Sem endpoint novo. Consumido via import (`getPlannedVsActual`) pela Metas (fatia 2) e pelo helper de recap do EST-5. | — |

> Se uma futura fase precisar expor aderência via HTTP (ex: placar da Metas chamar direto), criar `GET /api/coach/adherence` num sprint próprio com guard de colisão de rota — **fora do escopo deste**.

## Modelos de Dados Afetados

> **Nenhuma tabela nova. Nenhuma coluna nova. SEM MIGRATION.** O motor é interface TS pura que **lê** tabelas existentes (confirmado contra `shared/schema.ts` + EST-6 `weekly_planning_sessions` migration 0088). Análogo ao EST-2 (Weekly Report Data Enrichment — interface pura, sem migration).

### Tabelas REUSADAS (somente leitura, sem alteração de schema)
| Tabela | Papel | Filtro relevante |
|---|---|---|
| `weekly_planning_sessions` (EST-6, migr 0088) | plano intencionado + `steps.<key>.status` (skipped detection) | `(user_id, week_start_date UTC)` UNIQUE |
| `study_weekly_plans` | plano de estudo (`dailyTargetMinutes`, `planJsonb`) | chave UTC `ymdToUtcDate` |
| `planned_tournaments` | grade planejada (dias/sessões de grind) | janela por `scheduledDate` (architect confirma campo) |
| `coach_lesson_recommendations` | aulas recomendadas (chave **BRT**) | converter via `brtMondayYmd` se usado |
| `grind_sessions` | realizado de volume | `status='completed'`, data na janela |
| `session_tournaments` | torneios realizados da sessão | da(s) sessão(ões) da janela (§6.1) |
| `study_sessions_v2` | realizado de estudo | `status='completed'`, `durationMinutes`, `themeId`, `mode` incl. `stat_analysis` |
| `tournaments` | histórico (só se `planned_tournaments_count` realizado usar histórico) | **`WHERE grind_session_id IS NULL`** (§6.1) |
| `cooldown_logs` / warm-up rituals | processo (RF-09 stretch) | 1:1 `grind_sessions` |
| `users.ai_structured_profile` | (opcional) contexto do consumidor | — |

## Integrações Externas
| Serviço | Propósito | Quando |
|---|---|---|
| — | Nenhuma. O motor é determinístico, sem LLM. | — |

> A narrativa A4 do recap (EST-5) usa o LLM já existente do EST-5; **não é responsabilidade do motor**. O motor entrega só números + `breakdown` estruturado.

---

## Contrato exato — `getPlannedVsActual` (DEC-A7, shape estável)

> Este é o contrato que a Metas fatia-2 importa. **Estável** — mudanças exigem ADR + bump documentado. Definir em `server/coach/adherence/types.ts` (ou `shared/adherence.ts` se a Metas precisar do tipo no client — architect decide, DEC-MA1).

```typescript
// --- Entrada -----------------------------------------------------------------

/** Allowlist de métricas que o motor sabe comparar (RF-02). Estável. */
export type SourceMetric =
  | "grind_sessions_count"
  | "grind_days"
  | "planned_tournaments_count"
  | "study_minutes"
  | "study_sessions_count"
  | "lessons_recommended_done"
  | "themes_focus_studied"
  | "warmup_compliance"; // RF-09 stretch — pode sair com TODO

/** Janela de comparação. weekStartDate sempre UTC (ymdUtc) — CLAUDE.md §10. */
export interface AdherencePeriod {
  kind: "week" | "month" | "quarter";
  /** "YYYY-MM-DD" UTC (segunda da semana, ou 1º dia do mês/trimestre). */
  weekStartDate: string;
}

// --- Saída (shape estável — a Metas depende disto) ---------------------------

export type DataSufficiency = "ok" | "low";

export interface AdherenceBreakdown {
  /** dimensão pulada conscientemente no EST-6 (steps.status='skipped') — A4. */
  skipped: boolean;
  /** planned - actual quando não-feito (>0); null quando skipped/planned ausente. */
  shortfall: number | null;
  /** realizado > planejado (clampa compliance em 100, mas sinaliza superação). */
  overachieved: boolean;
  /** nota livre: 'planned_zero' | 'no_plan' | 'window_open' | 'source_stub' | null. */
  note: string | null;
}

export interface PlannedVsActual {
  sourceMetric: SourceMetric;
  period: AdherencePeriod;
  /** valor planejado; null quando não há plano na janela (≠ planned=0). */
  planned: number | null;
  /** valor realizado na janela (sempre numérico; 0 = nada feito). */
  actual: number;
  /** min(100, round(actual/planned*100)); null quando planned null/0 ou skipped. */
  compliancePct: number | null;
  /** 'ok' quando plano+janela fechada+dado; 'low' caso contrário (D9). */
  dataSufficiency: DataSufficiency;
  /** detalhamento para o consumidor montar a frase A4 sem reinterpretar. */
  breakdown: AdherenceBreakdown;
}

/** Assinatura — injectedStorage é o 3º arg (lessons #34/#36). */
export function getPlannedVsActual(
  userId: string,
  sourceMetric: SourceMetric,
  period: AdherencePeriod,
  injectedStorage?: unknown,
): Promise<PlannedVsActual>;

/** Helper de conveniência para o recap EST-5 (RF-08) — batcha grind+estudo. */
export function buildAdherenceRecap(
  userId: string,
  weekStartDate: string, // semana passada, UTC
  injectedStorage?: unknown,
): Promise<{
  grind: PlannedVsActual;
  study: PlannedVsActual;
  /** texto A4 pronto, sem culpa (lesson #10 regras em arquivo único). */
  summaryText: string;
}>;
```

**Notas do contrato (para o consumidor Metas/EST-5):**
1. `planned: null` ≠ `planned: 0`. `null` = não há plano (não cobrar — `dataSufficiency='low'`). `0` = planejou descanso (dado válido).
2. `compliancePct: null` ocorre em 3 casos: sem plano, planejou 0, ou dimensão skipped. O consumidor trata `null` como "não pontua", nunca como `0%`.
3. `breakdown.skipped` é a distinção "pulado conscientemente" (regra 3 do contrato / DEC-A7) — o consumidor usa para escolher tom A4 (skip = neutro; shortfall = alavanca).
4. O motor é **stateless**: a persistência de `goal_progress_snapshots` é da Metas fatia-2; o motor só calcula on-demand (regra 4 do contrato).

---

## Cenários de Teste Derivados

### Happy Path
- [ ] Plano da semana: 4 sessões de grind + 300 min estudo. Realizado: 3 sessões + 180 min. `getPlannedVsActual('grind_sessions_count')` → `{planned:4, actual:3, compliancePct:75, dataSufficiency:'ok', breakdown:{skipped:false, shortfall:1, overachieved:false, note:null}}`. `study_minutes` → `compliancePct:60`.
- [ ] `buildAdherenceRecap` da semana passada monta texto A4 com grind + estudo.

### Distinção pulado vs não feito (A4 — núcleo)
- [ ] `steps.study.status='skipped'` → `breakdown.skipped=true`, `compliancePct=null` (decisão, não falha).
- [ ] `steps.grind.status='confirmed'`, planejou 4 fez 0 → `breakdown.skipped=false, shortfall=4, compliancePct:0` (gap real).
- [ ] Recap descreve skip como decisão neutra; descreve shortfall como "alavanca da semana".

### Regra do compliance (RF-04)
- [ ] `planned=0` → `compliancePct=null, note='planned_zero', dataSufficiency='ok'`.
- [ ] `planned=null` (sem plano) → `compliancePct=null, dataSufficiency='low'`.
- [ ] `actual=6 planned=4` → `compliancePct=100, breakdown.overachieved=true`.

### §6.1 + chave de semana
- [ ] Métrica de volume usa `grind_sessions`/`session_tournaments` (sessão), não `tournaments` histórico sem filtro (guard test §6.1).
- [ ] Janela de semana usa chave UTC `ymdUtc` (alinha `weekly_planning_sessions`); guard test confirma que não mistura BRT.
- [ ] `lessons_recommended_done` (se ler `coach_lesson_recommendations` BRT) converte explicitamente, não unifica chaves.

### Degradação graciosa (lesson #9/#11, D9)
- [ ] `getStatsLeaks` retorna `[]` → `themes_focus_studied` → `planned=null, dataSufficiency='low', note='source_stub'`, log emitido antes do fallback, flow não quebra.
- [ ] Fonte que `throw` → motor captura, loga `{userId, sourceMetric, err}`, retorna `dataSufficiency='low'`, não propaga exceção.
- [ ] Janela da semana corrente (não fechada) → `dataSufficiency='low', note='window_open'`.
- [ ] Nenhum dado fabricado: fonte vazia → `null`, nunca `0` com veredito (lesson #11).

### Tom A4 (RF-08, lesson #10)
- [ ] `summaryText` do recap não contém "você falhou / sempre / nunca / deveria ter / isso prova" (guard de tom A4 em arquivo único).
- [ ] `dataSufficiency='low'` → recap mostra "sem dado suficiente", não compliance numérico forte.

### Contrato / pureza
- [ ] `sourceMetric` fora da allowlist → throw `unknown_source_metric` (não 500 genérico).
- [ ] Chamar 2x com mesmos args → mesmo resultado; guard test: nenhum método de escrita do storage invocado (stateless).
- [ ] `injectedStorage` (3º arg) usado quando presente; não importa `../storage` quando injetado (lessons #34/#36).
- [ ] `SOURCE_METRIC_MAP` sem entrada órfã (toda chave resolve plano + realizado).
- [ ] `breakdown` sempre presente com os 4 campos (`skipped`, `shortfall`, `overachieved`, `note`), nunca undefined.

### Mock fidelity (lesson #3 / C1)
- [ ] Mocks de `weekly_planning_sessions`/`grind_sessions`/`study_sessions_v2` espelham o shape REAL do storage (não idealizado) — validar contra `getWeeklyPlanningSession`/queries existentes antes de mockar.

## Fora de Escopo
- **A Ferramenta de Metas em si** (sprints Metas-1/2) — esta spec entrega só o **contrato** que a Metas consome.
- **Persistência de snapshot de meta** (`goal_progress_snapshots`) — responsabilidade da Metas fatia-2 (RF-08 da metas-tool); o motor é **stateless**.
- **Detecção real de leak** (#3, Fase C) — `getStatsLeaks` continua stub `[]`; `themes_focus_studied` degrada gracioso (RF-07).
- **Execução automática da grade** (founder travou) — o motor só **lê/compara**, não escreve nem aciona.
- **Item #6 (recomendação → ação 1-clique)** — "pode pairar" no mesmo loop, mas é sprint próprio; o motor #7 é a prioridade. Não implementar #6 aqui.
- **Endpoint HTTP de aderência** — sem rota nova nesta fase (consumo via import + recap EST-5).
- **Dimensão Performance/P&L histórico, FX, RoR** — o motor desta fase compara **volume/estudo de janela** (sessão), não performance histórica. FX/§6.1-histórico ficam documentados para extensão futura, não implementados.
- **Narrativa LLM** — o motor é determinístico; a frase A4 final usa o LLM já existente do EST-5.
- **Migration / schema change** — nenhum (interface TS pura).

## Dependências
- **EST-6** (`weekly_planning_sessions` migr 0088, `steps.<key>.status` skipped detection, `study_weekly_plans`, `planned_tournaments`, `weekKeys.ts` UTC, `coach-planning.ts` types) — **SHIPPED**. Fonte do plano intencionado.
- **EST-5** (ritual de segunda / recap) — surface da RF-08. **Em andamento/fechando** (estratégia §4 PRÉ). O architect confirma o ponto de plugagem do recap (DEC-MA6).
- **`grind_sessions` / `study_sessions_v2` / `session_tournaments`** (SHIPPED) — fontes do realizado.
- **`getStatsLeaks`** — **STUB (`[]`)**; degrade gracioso obrigatório (RF-07).
- **`weekKeys.ts`** (`ymdUtc`/`ymdToUtcDate`/`brtMondayYmd`) — SHIPPED, reusar (não recriar conversão de semana).
- **Lesson learned aplicáveis:** #34/#36 (injectedStorage 3º arg + lazy import), #9 (log antes do fallback), #11 (sem dado fabricado), #10 (regras de tom em arquivo único), #3 (mock shape real), #24/#45 (git add explícito — working tree compartilhada).

## Decisões abertas para o System-Architect
1. **DEC-MA1 — Local do tipo do contrato:** `server/coach/adherence/types.ts` (server-only) ou `shared/adherence.ts` (se a Metas precisar do tipo no client). Recomendação: `server/coach/adherence/types.ts` agora; promover para `shared/` quando a Metas client consumir. Confirmar.
2. **DEC-MA2 — Limites de janela `month`/`quarter`:** `week` é trivial (`[weekStartDate, +7d)`). Definir os limites de mês/trimestre (1º dia UTC do mês vs alinhamento ao Monthly/Quarterly Report AI-1C/2B). Recomendação: alinhar ao `period_start` dos reports existentes.
3. **DEC-MA3 — Realizado de `planned_tournaments_count`:** `session_tournaments` da sessão da janela vs `tournaments WHERE grind_session_id IS NULL` (histórico §6.1). Recomendação: `session_tournaments` (é volume de sessão, não histórico). Confirmar contra a regra §6.1.
4. **DEC-MA4 — Fonte canônica do `study_minutes` planejado:** `study_weekly_plans.dailyTargetMinutes × dias` vs soma dos blocos `steps.study`. Recomendação: soma dos blocos `steps.study` (mais granular; `dailyTargetMinutes` é derivado deles no orchestrator). Confirmar.
5. **DEC-MA5 — `compliancePct` quando `skipped`:** `null` (não pontua) vs `100` (cumpriu a decisão). Recomendação: **`null` + `breakdown.skipped=true`** (skip é decisão, nem sucesso nem falha — A4). Confirmar (impacta como a Metas trata no placar).
6. **DEC-MA6 — Ponto de plugagem no EST-5:** ler o código do estado de recap do EST-5 e confirmar onde `buildAdherenceRecap` é chamado (estado `weekly-review`/`recap`). Sem inventar rota. **Bloqueador do RF-08** — resolver antes do test-writer escrever o teste de surface.
7. **DEC-MA7 — Critério de "janela fechada" para `dataSufficiency`:** quando uma semana conta como completa (segunda passada já fechou? hoje > weekStartDate + 7d?). Definir o threshold UTC. Recomendação: janela fechada quando `now() >= weekStartDate + 7 dias` (UTC).
8. **DEC-MA8 — RF-09 (warmup_compliance) entra ou defere?** Decidir se cabe no sprint; se não, sai com TODO grepável (não meia-implementação).

## Riscos
- **Acoplamento de shape com a Metas fatia-2** — se o contrato `PlannedVsActual` mudar depois, quebra a Metas. **Mitigação:** congelar o shape neste sprint + ADR; a Metas importa o tipo, não redefine. **Risco médio.**
- **`weekly_planning_sessions` ausente para a maioria dos users** (EST-6 recém-shipado, `PlanningWizard` ainda não montado em `/coach-ai`) — muitas janelas terão `planned=null` → `dataSufficiency='low'`. **Mitigação:** é o comportamento correto (D9 — não cobrar sem plano); documentar que o motor só "morde" quando há plano. **Risco baixo, esperado.**
- **Chave UTC vs BRT** (`coach_lesson_recommendations` é BRT) — se `lessons_recommended_done` misturar chaves, compara janelas erradas. **Mitigação:** converter explicitamente via `brtMondayYmd`, guard test. Lesson §10 CLAUDE.md. **Risco médio.**
- **`getStatsLeaks` stub** — `themes_focus_studied` nasce fraco. **Mitigação:** degrade gracioso (RF-07), `note='source_stub'`; vira real na Fase C (#3). **Risco baixo, documentado.**
- **Tom A4 escorregar para culpa** no `summaryText` do recap — **Mitigação:** regras de tom em arquivo único (lesson #10) + guard test de tom + o motor entrega só números (a narrativa é do EST-5). **Risco médio.**
- **Mock idealizado do storage** (lesson #3 / C1) — bugs CRITICAL passam por mock que não espelha o shape real de `getWeeklyPlanningSession`/`grind_sessions`. **Mitigação:** validar shape real antes de mockar; cenário de teste dedicado. **Risco médio.**
- **Working tree compartilhada (INCIDENT #24/#45)** — apesar de zero migration, o motor toca arquivos novos + possivelmente o recap do EST-5. **Mitigação:** `git add` explícito por arquivo, nunca `-A`; considerar worktree. **Risco operacional.**

## Notas de Implementação (opcional)
- Módulo em `server/coach/adherence/` (ex: `index.ts` exporta `getPlannedVsActual` + `buildAdherenceRecap`; `types.ts` o contrato; `sourceMetricMap.ts` o mapa). Padrão de `server/coach/planning/`.
- `getPlannedVsActual` resolve storage via `resolveStorage(injected)` (mesmo padrão do `weeklyPlanningOrchestrator.ts` — `injected ?? await import('../../storage')`).
- Reusar `weekKeys.ts` (`ymdUtc`/`ymdToUtcDate`/`nextMondayUtc`/`brtMondayYmd`) — não recriar lógica de semana.
- Regras de tom A4 do recap: arquivo único (lesson #10), reutilizar/estender o do EST-5 se existir.
- Testes `.test.ts` em projeto `server` (node); o helper de recap, se tiver UI, segue lessons #14/#26/#38 (`await import`). Mocks espelham shape real (lesson #3).
- Sem migration; documentar no resumo "SEM migration — interface TS pura, como EST-2".
