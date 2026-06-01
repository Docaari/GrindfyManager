# Spec: Ferramenta de Metas (4DX Goals System)

> Parte da evolução Estudos + Mentor IA. Estratégia-mãe: `Docs/strategy/fluxo-otimizacao-pos-est-2026-06-01.md` (a Metas vem DEPOIS do motor de aderência, Fase A). Doutrina + framework: `Docs/strategy/curso-antes-das-cartas-learnings-2026-06-01.md` (curso "Antes das Cartas", 46 aulas; toda decisão ancorada num ID de aula ou no 4DX). Pipeline TDD: `pm-spec (este) → system-architect → test-writer → implementer → /simplify → reviewer`.
>
> **Regra editorial desta spec:** cada decisão de design cita uma aula do curso (`A2`, `C7`, `F2`, …) ou uma das 4 Disciplinas (`D1`–`D4`). Não há princípio genérico de produto sem âncora.

## Status
Proposta

## Resumo
Página dedicada (`/metas`) onde o jogador de poker MTT define **metas que miram o controlável**, acompanha um **placar visual "onde estou × onde deveria estar"**, e é **cobrado semanalmente pelo mentor** — estruturada como um sistema **4DX** (As 4 Disciplinas da Execução): Meta Global (WIG) → Medidas de Direção → Placar Convincente → Cadência de Responsabilização. O progresso é **derivado de dados reais já capturados** (grind, estudo, torneios, bankroll, mental), não de auto-relato. A ferramenta transforma o mentor de "quem fala" em "quem cobra comportamento, sem culpa" (A4) — a proposta de valor de *accountability* para o profissional.

## Contexto
- **Por que agora:** as sprints EST-1..6 fecharam a entrega do relatório (EST-1), o enriquecimento mental/estudo (EST-2), o registro de estudo (EST-3), o ritual de segunda (EST-5) e o **planejamento da próxima semana** (EST-6). Falta a peça que dá sentido a planejar: **medir se o plano de horizonte longo está sendo cumprido**, com um norte (WIG) acima da semana.
- **Por que 4DX:** o founder escolheu 4DX como esqueleto. O curso mapeia 1:1 (`learnings §2`): WIG = resultado/norte longo (C7 + A2); medidas de direção = meta de processo controlável (C7 + A9 + A2, os 2 critérios de *lead measure* = a dicotomia do controle A2); placar = competência SDT (A7) escondendo P&L curto (D9/C5); cadência = ritual de segunda (EST-5) + cobrança A4.
- **A tese do curso (espinha):** *a cabeça decide antes das cartas* — **processo acima de resultado, sistema acima de força de vontade** (A9: "você não sobe ao nível das suas metas; você cai ao nível dos seus sistemas", Clear 2018). A ferramenta rastreia **sistemas/hábitos cumpridos** (binário/%), não só metas de resultado.
- **Prioridade relativa:** entrega DEPOIS do motor de aderência (Fase A da estratégia). Ver §Dependências — define se é hard-block ou ship parcial.

## Usuários
- **Jogador (Trial / Pro / Premium / Admin):** define WIG + medidas de direção, vê o placar, é cobrado na segunda. Tier gating herdado de `getReportTier` (Trial/Pro/Premium/Admin = `eligible`; Free/expired = sem metas automáticas/cobrança — ver RF-12).
- **Coach AI (mentor):** co-define (sugere WIG + medidas a partir de leaks/perfil/histórico — A7), cobra (cadência de segunda, linguagem A4 — comportamento, não caráter), renegocia (ajusta meta irreal — A4 "qual a menor ação executável hoje?").
- **Motor de aderência (Fase A, dependência):** fornece o cálculo plano-vs-realizado que as medidas de direção e o placar consomem.

---

## Esqueleto 4DX (mapa canônico — a ferramenta É este sistema)

| Disciplina | Tradução na ferramenta | Âncora curso | RFs |
|---|---|---|---|
| **D1 — Foco na Meta Global (WIG)** | 1–2 metas "de X para Y até quando" (lag, horizonte longo) | C7 resultado + A2 norte | RF-01, RF-02 |
| **D2 — Medidas de Direção (lead measures)** | métricas (a) PREDITIVAS + (b) INFLUENCIÁVEIS, semanais | C7 processo + A9 sistema + A2 controle | RF-03, RF-04, RF-05 |
| **D3 — Placar Convincente** | painel visual "onde estou × onde deveria estar" (`/metas`), esconde P&L curto | A7 competência (SDT) + D9/C5 esconder ruído | RF-06, RF-07, RF-08 |
| **D4 — Cadência de Responsabilização** | prestação de contas semanal plugada no ritual de segunda (EST-5) | A4 cobra comportamento ≠ culpa + ritual EST-5 | RF-09, RF-10 |

**Regra de ouro 4DX/curso (governa toda validação de medida de direção):** uma medida de direção precisa ser **(a) preditiva** (mover ela move a WIG) **e (b) influenciável** (o jogador controla) — exatamente meta de processo (C7) dentro da dicotomia do controle (A2). A ferramenta **recusa** medidas que falham (b) — ver RF-04.

---

## Requisitos Funcionais

### RF-01: Definir a Meta Global (WIG) — D1
**Descrição:** o jogador (ou o mentor, sugerindo) cria 1–2 metas globais no formato **"de X para Y até quando"** (lag measure, horizonte longo). Ancora C7 (resultado = norte/ambição) + A2 (mira o controlável-no-longo, não o resultado-de-curto).
**Regras de negócio:**
- Cap **2 WIGs ativas** por jogador (4DX D1: foco — "se você persegue duas coisas, não persegue nenhuma"; C7 evita pulverização).
- Formato obrigatório "de X para Y até Z": `metric` + `baselineValue` (X) + `targetValue` (Y) + `targetDeadline` (Z). Deadline mínimo = **trimestre** (D9: ROI só converge em escala — ±18% só com 5.000 torneios; meta de resultado de curto prazo é armadilha matemática).
- Categorias permitidas para WIG (ver RF-11): só `performance` e `resultado/career`. WIG NÃO pode ser uma meta de processo (processo é D2).
- A WIG de temporada/ano **decompõe-se** em medidas de direção semanais (RF-03) — ver RF-02.
**Critério de aceitação:**
- [ ] Criar WIG exige `metric`, `baselineValue`, `targetValue`, `targetDeadline >= +90 dias`. Deadline < trimestre → erro `wig_deadline_too_short` com mensagem citando D9.
- [ ] 3ª WIG ativa → erro `wig_active_limit` (cap 2).
- [ ] WIG com `goalType='process'` → erro `wig_must_be_lag` (processo vira medida de direção).
- [ ] WIG persiste `baselineValue` snapshot no momento da criação (não recalculado depois — é o X de "de X para Y").

### RF-02: Decompor a WIG em medidas de direção (vínculo D1→D2)
**Descrição:** ao criar uma WIG, a ferramenta exige/sugere ao menos 1 medida de direção vinculada que seja **preditiva da WIG**. Ancora 4DX (uma WIG sem lead measures é teatro) + A9 (sistema que entrega o resultado).
**Regras de negócio:**
- Toda WIG ativa deve ter **≥1 medida de direção vinculada** antes de aparecer no placar (D3). WIG órfã fica em estado `draft` (não pontua).
- O mentor sugere medidas a partir do tipo de WIG (ex: WIG "ROI de 5% → 12% até dezembro" → medida "A-game em 70% dos spots/semana" [C2/C7 performance] + "warm-up em 100% das sessões" [C8]).
- Vínculo é N:N leve (uma medida pode servir 2 WIGs; uma WIG tem N medidas).
**Critério de aceitação:**
- [ ] WIG sem medida de direção vinculada → `status='draft'`, não aparece no placar.
- [ ] Vincular ≥1 medida → WIG vira `active` e entra no placar.
- [ ] A sugestão do mentor (RF-09) propõe medidas coerentes com o tipo da WIG (citação A9 no texto).

### RF-03: Definir medidas de direção (lead measures) — D2
**Descrição:** o jogador define métricas **semanais/diárias** que ele controla, com alvo numérico/binário. Ancora C7 (processo, ~100% controle, feedback binário diário — cada ✓ retroalimenta autoeficácia) + A9 (sistema/hábito).
**Regras de negócio:**
- Cap **3 medidas de direção ativas** por jogador (4DX D2: poucas, focadas; F4: máx 4-5 dias de prática → não sobrecarregar).
- Cadência da medida: `weekly` (default) ou `daily`. Cada medida tem `targetValue` + `unit` (ex: `4 sessões`, `300 minutos`, `100 %`, `binário sim/não`).
- **A medida deve ser específica + difícil + agendável** (C7: meta vaga = sem meta, Locke 1968; "estudar mais" → rejeitada; "drill 45min terça 9h" → aceita). A spec **não** força gramática SE-ENTÃO no MVP, mas o mentor é instruído a fraseá-las como *implementation intentions* (A9: d=0.65, Gollwitzer 2006).
- **Streak/hábito:** medidas binárias diárias rastreiam streak de cumprimento (A9: consolidação 18-254 dias, média 66 — Lally 2010; medir consistência de contexto, não só frequência).
**Critério de aceitação:**
- [ ] 4ª medida ativa → `lead_active_limit` (cap 3).
- [ ] Medida sem `targetValue`/`unit`/`cadence` → `lead_underspecified` (C7 — meta vaga rejeitada).
- [ ] Medida binária diária acumula `streakDays` no snapshot semanal (RF-08).

### RF-04: Validar que a medida é preditiva E influenciável (regra de ouro 4DX + A2)
**Descrição:** ao criar/sugerir uma medida de direção, a ferramenta valida os 2 critérios. Ancora regra de ouro 4DX + A2 (dicotomia do controle).
**Regras de negócio:**
- **(b) Influenciável (controlável):** a `sourceMetric` da medida deve pertencer à allowlist de métricas controláveis (decisões, estudo, sono, sizing, volume, warm-up, stop-loss). Métricas **não controláveis** são recusadas: `ganhar $X`, `fazer FT`, `nunca tomar bad beat`, `ser o melhor da mesa` (A2: metas ilegítimas). → erro `lead_not_controllable` com a citação A2.
- **(a) Preditiva:** validação leve no MVP — a medida deve ter uma `sourceMetric` mapeada a uma fonte de dados real (RF-05). Sem mapeamento → `lead_no_data_source` (não dá pra medir = não é lead measure rastreável).
- O `resultado de curto prazo` (P&L semanal, ROI semanal) é **explicitamente recusado** como medida de direção (D9/C5 outcome bias) — vai para o backlog de "norte longo" (WIG), nunca medida semanal.
**Critério de aceitação:**
- [ ] `sourceMetric ∈ {profit_short_term, win_a_tournament, beat_specific_player}` → recusado com citação A2/D9.
- [ ] `sourceMetric` sem mapeamento de fonte (RF-05) → `lead_no_data_source`.
- [ ] Medida controlável + com fonte mapeada → aceita.

### RF-05: Progresso derivado de DADOS REAIS (mapa medida → fonte)
**Descrição:** o progresso de cada medida/WIG é **computado do dado já capturado**, não digitado pelo jogador. Ancora C4 (falsificabilidade — métrica de sucesso pré-definida, não julgamento post-hoc) + a estratégia (`fluxo §#2`: o dado já existe; falta o motor que compara plano × realizado).
**Mapa canônico (cada tipo de meta → fonte exata):**

| Categoria (RF-11) | `sourceMetric` (exemplos) | Fonte de dado | Observação |
|---|---|---|---|
| **Volume / grind** (F4/F3) | `sessions_per_week`, `grind_days`, `tables_avg` | `grind_sessions` (status='completed') | F4: máx 4-5 dias seguidos; conta dias distintos |
| **Mental / regulação** (D1/D5) | `avg_foco`, `avg_energia`, `avg_confianca`, `avg_ie`, `interferencias`, `tilt_stoploss_respected` | `break_feedbacks` (foco/energia/confiança/IE/interferências 0-10) + `grind_sessions` médias (`focoMedio` etc) + `grind_sessions.notes/finalNotes` | D5: stop-loss a frio 3-5 BI/sessão; degrade se feedbacks não preenchidos (estratégia #4) |
| **Estudo** (C4/B) | `study_minutes_week`, `study_sessions_count`, `hands_solved`, `filters_analyzed`, `stat_analysis_entries`, `minutes_per_theme` | `study_sessions_v2` (`durationMinutes`, `mode` incl. `stat_analysis` do EST-3, `handsSolvedCount`, `filtersAnalyzedCount`) + `study_themes` + `user_focus_stats` | B3: hora sem sono ≈ 30-50% retenção → considerar sono, não só horas (futuro) |
| **Processo / rotina** (C8) | `warmup_compliance`, `cooldown_compliance` | `cooldown_logs` (1:1 grind_sessions) + warm-up rituals + `preparation_logs` | C8: warm-up tem efeito MAIOR sob pressão (g=0.70) |
| **Performance** (C7) | `roi_pct`, `abi`, `itm_pct`, `a_game_pct` | `tournaments` **WHERE `grind_session_id IS NULL`** (§6.1) via `getPerformanceByPeriod` | C7 performance = vs próprio histórico, mensal |
| **Financeira / BRM** (F2) | `bankroll_usd`, `abi_vs_bankroll`, `ror_under_threshold` | `wallets` + `bankroll_snapshots` (FX freezes) | **FX → USD antes de comparar (lesson #6)**; F2: 200-300 BI, RoR = e^(−2·ROI·BR/SD²) |
| **Longevidade / burnout** (F5/F7) | `rest_days_per_week`, `consecutive_grind_days`, `burnout_signals` | `grind_sessions` (gaps/cadência) + `user_off_days` + `break_feedbacks` (energia/exaustão) | F7: burnout MBI 3 dimensões; F5: 2 férias reais/ano |
| **Leak-foco / temas** (C4) | top leaks | `getStatsLeaks(userId, n)` **(STUB hoje — retorna `[]`)** + `user_focus_stats` + `coach_leak_focus` | **Degrade gracioso obrigatório** — ver RF-15 |

**Regras de negócio:**
- O cálculo do realizado de cada `sourceMetric` é responsabilidade do **motor de aderência** (Fase A) — a Metas **consome** o `% cumprimento` que ele expõe (ver §Dependências). A Metas não recalcula plano-vs-realizado por conta própria.
- §6.1: métricas de performance/financeiras usam **histórico** (`tournaments WHERE grind_session_id IS NULL`); métricas de sessão (volume/mental do dia) podem usar `session_tournaments`/`grind_sessions` — nunca misturar.
- **FX:** toda métrica financeira normaliza para **USD antes de comparar** com alvo (lesson #6; `walletService`/`fxResolver`).
**Critério de aceitação:**
- [ ] Cada `sourceMetric` ativa resolve para uma fonte de dado existente (guard test: mapa não tem entrada órfã).
- [ ] Métrica de performance/financeira filtra `grind_session_id IS NULL` (§6.1) — guard test.
- [ ] Métrica financeira em moeda nativa é convertida para USD antes de comparar (lesson #6).

### RF-06: Placar Convincente — esconde P&L de curto prazo — D3
**Descrição:** o placar (`/metas`) destaca as **medidas de direção** e o status da WIG no horizonte longo; **esconde P&L diário/ROI semanal** da visão principal. Ancora D3 + D9/C5 (amostra pequena = ruído + gatilho de outcome bias) + `learnings §3`.
**Regras de negócio:**
- A tela principal **nunca** mostra P&L diário nem ROI semanal como métrica de destaque. Resultado (lag) aparece **só em horizonte trimestral+** (D9: ROI ±18% só com 5.000 torneios).
- Destaque visual = medidas de direção da semana (compliance %) + streak de hábitos + status da WIG.
- Se o jogador quiser ver P&L de curto prazo, ele já tem `/stats` — o placar de metas **deliberadamente não duplica** (D3: o placar serve a competência, não ao ruído).
**Critério de aceitação:**
- [ ] A tela principal de `/metas` não renderiza nenhum widget de P&L diário / ROI semanal (guard test de ausência).
- [ ] O lag (resultado da WIG) só renderiza valor quando `horizon >= trimestre`.

### RF-07: Placar — "onde estou × onde deveria estar" (trajetória esperada) — D3
**Descrição:** para cada WIG e medida, o placar mostra **atual × alvo × trajetória esperada** (pace) — o jogador vê de relance se está adiantado/no ritmo/atrasado. Ancora D3 (placar convincente: "deveria saber em 5 segundos se estamos ganhando") + A7 (competência sustenta motivação).
**Regras de negócio:**
- **Trajetória esperada (pace line):** interpolação linear de `baselineValue` (X) → `targetValue` (Y) ao longo de `[createdAt, targetDeadline]`. "Onde eu deveria estar hoje" = ponto da reta na data atual.
- Status derivado: `ahead` / `on_track` / `behind` / `at_risk` (thresholds definidos pelo architect; banda de tolerância para não disparar pânico — A4 evita culpa).
- Para medida semanal: compliance da semana corrente + histórico das últimas N semanas (sparkline).
- **CTA targets DEVEM casar com rotas Wouter registradas** (lesson #19): "registrar estudo" → `/estudos/registrar`; "abrir grade" → rota da grade; "ver relatório" → `/coach-ai/relatorio/:id`. Architect grepa `Route path` em `client/src/App.tsx`.
**Critério de aceitação:**
- [ ] Cada WIG/medida exibe `current`, `target`, `expectedNow` (pace), e um `status` derivado.
- [ ] A pace line é interpolação linear baseline→target no intervalo de datas.
- [ ] Todo CTA do placar resolve para rota Wouter existente (guard test — lesson #19).

### RF-08: Snapshots de progresso (histórico do placar)
**Descrição:** o progresso é congelado em **snapshots semanais** (1 por meta/semana) para o placar mostrar evolução e a cadência (RF-09) ter um "antes/depois" estável. Ancora C4 (ciclo método científico: hipótese→execução→reflexão semanal, Zimmerman) + D9 (medir em janela, não no ruído diário).
**Regras de negócio:**
- 1 snapshot por `(goal_id, week_start_date)` (UNIQUE — idempotente; reprocessar não duplica, padrão dos `report_jobs`/`study_weekly_plans`).
- `week_start_date` como **DATE UTC** via `ymdUtc` (mesma convenção de `study_weekly_plans` / `weekly_planning_sessions` — CLAUDE.md §10; atenção UTC vs BRT — ver decisão aberta DEC-A4).
- Snapshot grava: `currentValue`, `expectedValue` (pace), `compliancePct`, `streakDays`, `status`, e `dataSufficiency` (`ok|low` — D9: pouca amostra → não cravar veredito).
- Gerado pelo mesmo tick que produz o Weekly Report (reusa `reportJobRunner`/cron tz-aware) — a cadência da segunda (RF-09) lê o snapshot fresco.
**Critério de aceitação:**
- [ ] 1 snapshot/meta/semana (UNIQUE `(goal_id, week_start_date)`); reprocessar = UPSERT, não duplica.
- [ ] Snapshot com amostra pequena marca `dataSufficiency='low'` (não emite veredito forte).

### RF-09: Cadência de Responsabilização — cobrança de segunda (A4) — D4
**Descrição:** na segunda (ritual EST-5), o mentor apresenta o progresso das metas e **cobra comportamento, sem culpa**. Ancora D4 + A4 (responsabilidade prospectiva ≠ culpa retrospectiva) + ritual EST-5.
**Regras de negócio:**
- A cobrança é **plugada no estado `planning` do EST-5** e no Weekly Report (EST-1/2) — **não é um canal novo**. Reusa a entrega tripla do EST-1 (in-app + chat do mentor + email).
- **Linguagem A4 (governa o tom do nudge):** cobra via comportamento específico ("você planejou 4 sessões com warm-up, fez 2 sem warm-up — a alavanca dessa semana é ___"), **NUNCA** via caráter ("seja mais disciplinado"). Proibido: "você deveria ter…", "você sempre/nunca…", "isso prova que você…". Permitido: "o que depende de você?", "qual a menor ação executável hoje?".
- Quando a aderência **despenca** e a lista de ações não emerge → o mentor reconhece estado (fadiga/vergonha) e **descomprime antes de produzir** (A4: Sapolsky — mera percepção de alavanca reduz cortisol).
- `coach_tone` (`gentle|balanced|direct`) do `user_coach_preferences` modula a intensidade, **nunca** o conteúdo A4.
**Critério de aceitação:**
- [ ] A cobrança é postada no chat do mentor + no Weekly Report (sem canal novo).
- [ ] O texto do nudge passa por um filtro/regra A4 (sem "você deveria/sempre/nunca/isso prova") — guard test de prompt (lesson #10: regras em arquivo único).
- [ ] Aderência em queda forte sem ações → mensagem de descompressão (não cobrança seca).

### RF-10: Renegociação de meta irreal (A4 prospectivo)
**Descrição:** quando uma WIG/medida está cronicamente `at_risk` (N semanas), o mentor propõe **renegociar** (reduzir alvo, estender deadline, trocar a medida) em vez de insistir e gerar culpa. Ancora A4 (acionável > paralisante) + A7 (motivação sustentada por progresso visível, não por meta inalcançável).
**Regras de negócio:**
- Gatilho: meta `at_risk`/`behind` por ≥3 snapshots semanais consecutivos (threshold pro architect).
- O mentor propõe o ajuste; o jogador **confirma** (escrita exige confirmação — reusa o padrão confirm/undo dos tools AI-2A). Histórico do ajuste é preservado (auditoria — não apaga a meta original).
- Renegociar **não** é punição: a mensagem é A4 ("o alvo estava acima da banca atual; vamos calibrar para sustentar a consistência").
**Critério de aceitação:**
- [ ] Meta `at_risk` por ≥3 semanas dispara proposta de renegociação.
- [ ] Ajuste só persiste com confirmação do jogador; versão anterior preservada.

### RF-11: Tipos e categorias de meta (taxonomia C7 + dores por bloco)
**Descrição:** a ferramenta classifica metas em 3 **tipos** (controle/horizonte, C7) e N **categorias** (cobrindo as dores do curso, `learnings §6/§8`).
**Regras de negócio:**
- **Tipos (C7):**
  - `process` — controlável (~100%), cadência semanal/diário → vira **medida de direção** (D2). C7 + A9 + A2.
  - `performance` — médio controle (vs próprio histórico), mensal → pode ser WIG ou medida. C7.
  - `result/career` (WIG) — baixo controle (variância), trimestral/anual, **só norte**. C7 + A2.
- **`result` de curto prazo é recusado** (D9/C5 — outcome bias): deadline < trimestre em tipo `result` → erro (RF-01).
- **Categorias (cobrem as dores):** `financial_brm` (F2), `volume_grind` (F4/F3), `study` (C4/B), `mental_tilt` (D1/D5 — ex: stop-loss respeitado, tilt log), `process_routine` (C8 — warm-up/cool-down compliance), `longevity_burnout` (F5/F7), `leak_focus` (C4). Cada categoria mapeia ao bloco de dor + às fontes da RF-05.
**Critério de aceitação:**
- [ ] Toda meta tem `goalType ∈ {process, performance, result}` + `category` válida.
- [ ] `goalType='result'` + deadline < trimestre → erro citando D9/C5.
- [ ] Cada `category` mapeia a ≥1 `sourceMetric` da RF-05 (guard test — sem categoria órfã).

### RF-12: Horizontes e decomposição (semana/mês/trimestre/temporada)
**Descrição:** metas têm horizonte explícito; uma WIG de temporada se **decompõe** em medidas de direção semanais. Ancora `learnings §3` (cadência de revisão: semanal/mensal/trimestral/anual) + C4 (ciclos) + A9 (sistema entrega o resultado).
**Regras de negócio:**
- `horizon ∈ {week, month, quarter, season}`. `process` → `week`/`month`; `performance` → `month`; `result/WIG` → `quarter`/`season`.
- A revisão é **semanal** para processo (RF-08/09), **mensal** para performance (alinha ao Monthly Report AI-1C), **trimestral** para resultado (alinha ao Quarterly Review AI-2B).
- Decomposição (RF-02): a WIG de temporada exibe quais medidas semanais a alimentam e o quanto cada uma contribui (qualitativo no MVP — não fórmula de atribuição causal).
**Critério de aceitação:**
- [ ] `horizon` coerente com `goalType` (validação) — `process` não aceita `season` direto sem medida semanal.
- [ ] A view da WIG lista as medidas de direção que a decompõem (RF-02).

### RF-13: Coach co-define metas a partir de leaks/perfil/histórico (A7)
**Descrição:** o mentor **sugere** WIG + medidas de direção derivadas dos dados (não só recebe metas digitadas). Ancora A7 ("construa o sistema antes de precisar dele") + a cadeia leak→ação da estratégia (`fluxo §8`).
**Regras de negócio:**
- Sugestão usa: `getStatsLeaks` (degrade — RF-15), `users.ai_structured_profile` (nivel/metas/foco/tom), histórico (`getPerformanceByPeriod`), `coach_leak_focus`, e a análise da semana (EST-2/5 quando disponível).
- **Reusa tools existentes onde possível** (não recriar): `recommend_lesson` (aula para a meta de estudo), `schedule_study_block` (bloco que cumpre a medida de estudo), `bulk_propose_grade` (grade que cumpre a medida de volume) — todos do EST-6/AI-2A.
- O jogador sempre confirma (sem auto-escrita — founder travou execução automática).
**Critério de aceitação:**
- [ ] Sugestão de meta cita a evidência (leak X, foco Y do perfil) — auditável.
- [ ] Sugestão de medida de estudo/volume oferece CTA que delega aos tools AI-2A (não cria endpoint de escrita novo).

### RF-14: Templates de meta por perfil de trilha (5 perfis do curso)
**Descrição:** ao começar (ou via "começar do zero"), o jogador escolhe entre **5 templates** mapeados aos perfis de trilha do curso. Ancora `learnings §0` + `GUIA_DE_TRILHAS.md` (5 perfis = momentos do jogador).
**Regras de negócio:**
- Perfis → template inicial (WIG + 2-3 medidas + categorias pré-selecionadas):
  - **Esgotado** → WIG de longevidade (F7) + medidas `rest_days_per_week`, `consecutive_grind_days` (F5), tom `gentle`.
  - **Empolgado** → WIG de performance + medidas de `process_routine` (C8 warm-up) + `study` (canalizar energia em sistema — A9).
  - **Consolidado** → WIG de subida de stake (F2 BRM) + medidas `a_game_pct`, `study_minutes_week`.
  - **Afundado** (downswing) → WIG de resultado adiada + foco em `mental_tilt` (D5 stop-loss) + `process_routine` (D9: downswing não prova nada — esconder resultado).
  - **Em Transição** → WIG de volume/identidade + medidas de `volume_grind` + `study`.
- Template é **ponto de partida editável** — não trava o jogador (A2: autonomia).
**Critério de aceitação:**
- [ ] Cada um dos 5 perfis gera um template com ≥1 WIG-draft + 2-3 medidas + tom sugerido.
- [ ] Template é totalmente editável após aplicado.

### RF-15: Degradação graciosa de fontes ausentes (esp. `getStatsLeaks` stub)
**Descrição:** `getStatsLeaks` é **STUB hoje (retorna `[]`)** e `break_feedbacks` podem não estar preenchidos. A ferramenta degrada sem quebrar. Ancora estratégia (#4 dados mentais subutilizados) + lesson #9 (logar antes do fallback) + lesson #11 (default mínimo — não inventar dado).
**Regras de negócio:**
- `getStatsLeaks` vazio/erro → metas de `leak_focus` mostram "sem leaks detectados — defina foco manualmente / via temas" (não bloqueia). **Logar antes do fallback** (lesson #9).
- `break_feedbacks` ausentes → metas `mental_tilt` mostram `dataSufficiency='low'` + CTA "registre break feedback" (não fabrica nota).
- Toda meta cuja fonte está vazia mostra `dataSufficiency='low'` no placar e o mentor **não emite veredito forte** (D9).
**Critério de aceitação:**
- [ ] `getStatsLeaks` throw/`[]` → flow não quebra, log emitido, meta marca `low`.
- [ ] Fonte vazia → `dataSufficiency='low'` + CTA de captura; nenhum dado fabricado.

---

## Requisitos Não-Funcionais
- **Tier gating:** `getReportTier(user) !== 'free'` para metas automáticas/cobrança (defense in depth — entrada + cada tool revalida; espelha EST-5/EST-6).
- **Idempotência:** snapshots UNIQUE `(goal_id, week_start_date)`; geração no tick reusa claim atômico do `reportJobRunner` (ADR-155).
- **FX:** métricas financeiras → USD antes de comparar (lesson #6).
- **§6.1:** performance/financeira filtram `grind_session_id IS NULL`; nunca agregar `session_tournaments` em metas de histórico.
- **Degradação graciosa:** fonte ausente nunca quebra o placar (lesson #9, RF-15).
- **Kill switch:** a cobrança proativa respeita `COACH_NUDGES_ENABLED` (CLAUDE.md §4) — off desliga a cadência de segunda (não o placar read-only).
- **Custo LLM:** sugestão de meta (RF-13) reusa tools cacheados; cobrança (RF-09) reusa o bundle do Weekly Report (sumarização Haiku já existe).

## Endpoints Previstos
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | /api/goals | Lista metas (WIG + medidas) do jogador + status do placar | JWT |
| POST | /api/goals | Cria WIG ou medida de direção (valida RF-01/03/04/11/12) | JWT + tier eligible |
| PATCH | /api/goals/:id | Edita / renegocia meta (RF-10, preserva versão anterior) | JWT |
| DELETE | /api/goals/:id | Arquiva meta (soft-delete, não hard-delete) | JWT |
| POST | /api/goals/:id/link-measure | Vincula medida de direção a uma WIG (RF-02) | JWT |
| GET | /api/goals/scoreboard | Placar consolidado: metas + snapshots + pace + status (RF-06/07) | JWT |
| GET | /api/goals/:id/snapshots | Histórico de snapshots de uma meta (RF-08) | JWT |
| POST | /api/goals/templates/:profile/apply | Aplica template de perfil de trilha (RF-14) | JWT + tier eligible |
| POST | /api/goals/suggest | Mentor sugere WIG + medidas a partir dos dados (RF-13) | JWT + tier eligible |

> Handlers seguem `injectedStorage` como 3º arg (lesson #34 — testáveis sem `vi.mock('../storage')`).
> **Atenção colisão de rota** (EST-3/EST-6 já sofreram): conferir ordem de registro; usar sub-paths dedicados se `/api/goals/:id` shadowar `/api/goals/scoreboard`/`/api/goals/templates` (registrar rotas estáticas ANTES da `:id`). Guard test obrigatório.
> Rota frontend: `/metas` (placar) + `/metas/nova` (criação) — **registrar em `client/src/App.tsx`** (lesson #19: CTA → rota existente).

## Modelos de Dados Afetados

> 3 tabelas novas. Migration `migrations/00XX_goals.sql` + `_rollback.sql` (drizzle-kit), aplicar via psql local (localhost:5433) + documentar pendência PROD no CLAUDE.md §6 (padrão das migrations 0086/0087/0088). IDs via `nanoid`. FK por `userPlatformId` (CASCADE).

### `goals` (NOVO) — WIG + medidas de direção (single table, discriminada por `goalType`)
| Campo | Tipo | Constraints | Notas / âncora |
|---|---|---|---|
| id | varchar(21) | PK, nanoid | |
| user_id | varchar(21) | not null, FK users CASCADE | |
| goal_type | varchar(16) | not null, CHECK `{process,performance,result}` | C7 (RF-11) |
| category | varchar(24) | not null, CHECK `{financial_brm,volume_grind,study,mental_tilt,process_routine,longevity_burnout,leak_focus}` | dores `learnings §6` |
| title | varchar(120) | not null | "de X para Y até Z" no caso de WIG |
| source_metric | varchar(48) | nullable | mapa RF-05; medida sem fonte = `lead_no_data_source` (RF-04) |
| baseline_value | numeric | nullable | X (snapshot na criação — RF-01) |
| target_value | numeric | nullable | Y |
| unit | varchar(16) | nullable | `usd`/`pct`/`minutes`/`sessions`/`days`/`boolean` — financeira sempre `usd` (lesson #6) |
| cadence | varchar(8) | nullable | `weekly`/`daily` (medida de direção — RF-03) |
| horizon | varchar(8) | not null | CHECK `{week,month,quarter,season}` (RF-12) |
| target_deadline | date | nullable | Z; result → `>= +90d` (RF-01/D9) |
| status | varchar(12) | not null, default `'draft'` | `draft`(WIG sem medida)/`active`/`achieved`/`abandoned`/`renegotiated` |
| coach_tone_at_create | varchar(8) | nullable | snapshot do tom (A4 modula intensidade) |
| origin | varchar(16) | not null, default `'manual'` | `manual`/`coach_suggest`/`template_<profile>` (auditoria — RF-13/14) |
| created_at / updated_at / archived_at | timestamp | | soft-delete |

Índices: `idx_goals_user_status (user_id, status)`; `idx_goals_user_type (user_id, goal_type)`.
Enforcement de caps (RF-01 cap 2 WIG / RF-03 cap 3 medidas) **por código** (não UNIQUE — caps por contagem, padrão `career_goals` AI-2B).

### `goal_links` (NOVO) — vínculo WIG ↔ medida de direção (N:N leve, RF-02)
| Campo | Tipo | Constraints |
|---|---|---|
| id | varchar(21) | PK nanoid |
| user_id | varchar(21) | not null, FK users CASCADE |
| wig_id | varchar(21) | not null, FK goals CASCADE |
| measure_id | varchar(21) | not null, FK goals CASCADE |
| created_at | timestamp | default now |
| | | **UNIQUE (wig_id, measure_id)** |

### `goal_progress_snapshots` (NOVO) — placar histórico (RF-08)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | varchar(21) | PK nanoid | |
| user_id | varchar(21) | not null, FK users CASCADE | |
| goal_id | varchar(21) | not null, FK goals CASCADE | |
| week_start_date | date | not null | **DATE UTC via `ymdUtc`** (CLAUDE.md §10 — ver DEC-A4) |
| current_value | numeric | nullable | realizado (do motor de aderência) |
| expected_value | numeric | nullable | pace line (RF-07) |
| compliance_pct | numeric | nullable | medidas de direção |
| streak_days | integer | nullable, default 0 | hábito (A9) |
| status | varchar(12) | nullable | `ahead`/`on_track`/`behind`/`at_risk`/`achieved` |
| data_sufficiency | varchar(4) | not null, default `'ok'` | `ok`/`low` (D9 — RF-15) |
| created_at | timestamp | default now | |
| | | **UNIQUE (goal_id, week_start_date)** | idempotência (RF-08) |

Índice: `idx_goal_snapshots_user_week (user_id, week_start_date)`.

### Tabelas REUSADAS (sem alteração de schema)
`grind_sessions`, `break_feedbacks`, `cooldown_logs`, `study_sessions_v2`, `study_themes`, `user_focus_stats`, `tournaments` (WHERE `grind_session_id IS NULL`), `wallets`, `bankroll_snapshots`, `user_off_days`, `coach_leak_focus`, `users.ai_structured_profile`, `user_coach_preferences` (tom + opt-ins), `coach_conversations`/`coach_messages` (entrega da cobrança), `weekly_planning_sessions`/`study_weekly_plans`/`coach_lesson_recommendations` (EST-6, plugagem da cadência).

## Integrações Externas
| Serviço | Propósito | Quando |
|---|---|---|
| Anthropic (Claude) | Sugestão de WIG/medidas (RF-13) + texto da cobrança A4 (RF-09) | `new Anthropic()` em try/catch (lessons #5/#35); reusa `anthropicClient.callReportLlm` |

---

## Integração — onde pluga em cada ferramenta existente

### Estudo (`/estudos`, `study_sessions_v2`)
- **Lê:** `study_sessions_v2` (`durationMinutes`, `mode` incl. `stat_analysis`, `handsSolvedCount`, `filtersAnalyzedCount`), `study_themes`, `user_focus_stats`.
- **Chama:** `recommend_lesson`, `schedule_study_block` (AI-2A/EST-6) para converter meta de estudo em ação.
- **Aparece em:** CTA do placar "registrar estudo" → `/estudos/registrar` (EST-3); meta `study` no placar; bloco "estudo da semana" do Weekly Report (EST-2) cita progresso vs medida.

### Grind (`/grind`, `grind_sessions` + `break_feedbacks` + `cooldown_logs`)
- **Lê:** `grind_sessions` (status, médias mentais, notes/finalNotes/objectiveCompleted), `break_feedbacks` (foco/energia/confiança/IE/interferências), `cooldown_logs` (warm-up/cool-down compliance), `user_off_days`.
- **Chama:** nenhum write — só leitura para volume/mental/processo/longevidade.
- **Aparece em:** Daily Debrief (AI-1C) pode referenciar a medida de volume/mental do dia; meta `mental_tilt`/`process_routine`/`volume_grind` no placar.

### Coach (`/coach-ai`, `coach_conversations`/`coach_messages`/`user_coach_preferences`)
- **Lê:** `users.ai_structured_profile` (nivel/foco/tom), `coach_leak_focus`, `user_coach_preferences` (`coach_tone`, opt-ins).
- **Chama:** `getStatsLeaks` (degrade), `getPerformanceByPeriod`, `callReportLlm` (sugestão RF-13 + cobrança RF-09), tools `recommend_lesson`/`schedule_study_block`/`bulk_propose_grade` (RF-13).
- **Aparece em:** entrega da cobrança = chat do mentor (turno técnico) + Weekly Report + ritual de segunda (EST-5 estado `planning`). Tab/atalho de Metas no hub `/coach-ai`.

### Bankroll (`wallets` + `bankroll_snapshots`)
- **Lê:** `wallets` (saldos multi-moeda), `bankroll_snapshots` (FX freezes) via `walletService`/`fxResolver`.
- **Chama:** `fxResolver` para **USD antes de comparar** (lesson #6).
- **Aparece em:** meta `financial_brm` (banca atual vs alvo, ABI vs banca, RoR sob threshold — F2) no placar.

### Tournament Selector / scoring
- **Lê:** scoring 0-100 + grade S/A/B/D (sugestão de game selection — F1) como **insumo** da sugestão de meta de volume/seleção (RF-13), não como métrica de placar direta.
- **Aparece em:** sugestão do mentor "para a WIG de ROI, foque em torneios grade A+ (field soft, F1)".

### EST-5/EST-6 (ritual de segunda + planejamento)
- **Lê/escreve via reuso:** a cobrança (RF-09) pluga no estado `planning` do EST-5; o plano da semana (EST-6) é onde as medidas de direção viram ações concretas (grade + blocos de estudo). A Metas **não duplica** `weekly_planning_sessions` — consome o sinal `planning_complete` e adiciona a camada de "vs meta de longo prazo".

---

## Dependência crítica — Motor de Aderência (Fase A)

**Estado verificado (2026-06-01):** o motor plano-vs-realizado **NÃO existe**. O EST-6 (`weekly_planning_sessions`, ADR-224) persiste o **plano intencionado** (grade + blocos de estudo + aulas + temas), mas **nenhum código compara plano × realizado** (`grep` por aderência/plan-vs-actual só acha *nudge compliance* e *daily study goal*, não o motor). `getStatsLeaks` é stub (`[]`).

**O que o motor precisa expor (contrato que a Metas consome):**
1. `getPlannedVsActual(userId, metric, period)` → `{ planned, actual, compliancePct, dataSufficiency }` por `sourceMetric` da RF-05.
2. Comparação **por horizonte** (semana/mês/trimestre) — a Metas chama com o horizonte da meta.
3. Distinção **"não feito" vs "pulado conscientemente"** (EST-6 já tem isso por passo; o motor deve generalizar para qualquer métrica).
4. Idempotência por janela (alinhado ao snapshot semanal RF-08).

**Veredito — ship PARCIAL permitido (NÃO hard-block), em 2 fatias:**
- **Fatia 1 (sem motor): metas MANUAIS + medidas com fonte direta de contagem.** Medidas cujo realizado é uma **agregação simples já disponível** (volume = `count(grind_sessions)`; estudo = `sum(study_sessions_v2.durationMinutes)`; financeira = `wallets`+`bankroll_snapshots`; performance = `getPerformanceByPeriod`) podem ser computadas **sem** o motor formal — a Metas faz a agregação read-only e preenche `currentValue`. O placar (D3), os snapshots (RF-08) e a cobrança (RF-09/A4) funcionam. **Isto entrega ~70% do valor.**
- **Fatia 2 (com motor): aderência fina plano-vs-realizado.** O `compliancePct` rigoroso (planejou 4 sessões com warm-up, fez 2 sem) e a distinção "pulado vs não feito" **dependem do motor da Fase A**. Sem ele, a cobrança da RF-09 usa o proxy "realizado vs alvo da medida" (não "realizado vs plano da semana"). Aceitável no MVP; documentar o downgrade.

**Recomendação ao founder/architect:** ship Fatia 1 primeiro (destrava o placar 4DX + cobrança), e construir o motor de aderência (Fase A) **em paralelo ou logo antes** da Fatia 2, conforme a estratégia (`fluxo §sequência` — Metas vem *sobre* o motor). Marcar a Fatia 2 como dependência explícita no roadmap.

---

## Cenários de Teste Derivados

### Happy Path
- [ ] Aplicar template "Consolidado" → cria WIG-draft + 3 medidas → vincular medidas → WIG `active` → placar mostra pace + status; snapshot semanal gerado; cobrança de segunda postada no chat com linguagem A4.

### Validação de Input / Doutrina
- [ ] WIG com deadline < trimestre → `wig_deadline_too_short` (D9).
- [ ] 3ª WIG → `wig_active_limit`; 4ª medida → `lead_active_limit`.
- [ ] Medida `ganhar $X` / `fazer FT` → `lead_not_controllable` (A2).
- [ ] Medida sem `targetValue`/`unit`/`cadence` → `lead_underspecified` (C7).
- [ ] `sourceMetric=profit_short_term` como medida → recusado (D9/C5).
- [ ] WIG sem medida vinculada → `status='draft'`, fora do placar.

### Regras de Negócio
- [ ] Métrica financeira em BRL convertida para USD antes de comparar (lesson #6).
- [ ] Métrica de performance filtra `grind_session_id IS NULL` (§6.1).
- [ ] Snapshot UNIQUE `(goal_id, week_start_date)` — reprocessar = UPSERT.
- [ ] Cap WIG/medida enforçado por código (contagem de `active`).

### Placar (D3)
- [ ] Tela principal NÃO renderiza P&L diário / ROI semanal (guard de ausência — D9/C5).
- [ ] Lag da WIG só exibe valor com `horizon >= quarter`.
- [ ] Pace line = interpolação linear baseline→target.
- [ ] Todo CTA resolve para rota Wouter registrada (lesson #19).

### Cadência / A4
- [ ] Texto da cobrança não contém "você deveria/sempre/nunca/isso prova" (guard de prompt — A4).
- [ ] Aderência despencando sem ações → mensagem de descompressão, não cobrança seca (A4).
- [ ] Meta `at_risk` ≥3 semanas → proposta de renegociação; ajuste exige confirmação.

### Edge Cases / Degradação
- [ ] `getStatsLeaks` throw/`[]` → meta `leak_focus` degrada, log antes do fallback (lessons #9/#15-stub), flow não quebra.
- [ ] `break_feedbacks` vazios → meta `mental_tilt` marca `dataSufficiency='low'` + CTA de captura; nenhum dado fabricado.
- [ ] `COACH_NUDGES_ENABLED=false` → cobrança proativa desligada; placar read-only continua.
- [ ] Tier `free`/`expired` → 403 em rotas de criação/sugestão/template; placar somente-leitura conforme decisão DEC-A2.
- [ ] Colisão de rota `/api/goals/:id` vs `/scoreboard`/`/templates` → guard test (rotas estáticas antes da `:id`).

## Fora de Escopo
- **Execução automática da grade / metas** (founder travou) — toda escrita exige confirmação do jogador.
- **Implementação** — esta é só a spec (próximo: system-architect).
- **O motor de aderência fino (Fatia 2)** — dependência separada (Fase A); a Metas ship com Fatia 1.
- **Atribuição causal quantitativa** "esta medida moveu a WIG em X%" — no MVP a decomposição (RF-12) é qualitativa.
- **Novos tools de escrita do Coach** — RF-13 reusa `recommend_lesson`/`schedule_study_block`/`bulk_propose_grade` existentes.
- **Mudar conteúdo do Weekly/Monthly/Quarterly Report** — a Metas só adiciona a seção/cobrança via dados de meta.
- **Fórmula de RoR/variância nova** — reusa `varianceEngine`/F2 existentes como insumo, não recria.

## Dependências
- **Motor de aderência (Fase A) — NÃO existe.** Ship PARCIAL (Fatia 1 sem motor; Fatia 2 com motor). Ver §Dependência crítica.
- **`getReportTier`** (`server/coach/reportEligibility.ts`, SHIPPED).
- **EST-6** (`weekly_planning_sessions`, tools `bulk_propose_grade`/`schedule_study_block`/`recommend_lesson`/`mark_off_day`, SHIPPED) — plugagem da cadência + ações.
- **EST-1/EST-2** (entrega tripla + bundle enriquecido, SHIPPED) — canal e dados da cobrança.
- **`reportJobRunner`/cron tz-aware** (ADR-155, SHIPPED) — gera snapshots semanais (RF-08).
- **`getPerformanceByPeriod`, `walletService`, `fxResolver`** (SHIPPED) — fontes de performance/financeira.
- **`getStatsLeaks`** — STUB (`[]`); degrade gracioso (RF-15).
- **`break_feedbacks` densos** — depende da adoção (estratégia Fase B #4); degrade gracioso.

## Decisões abertas para o System-Architect
1. **DEC-A1 — Snapshot: tick novo ou no `reportJobRunner`?** Recomendação: piggyback no enqueuer/processor do Weekly Report (mesma cadência de segunda, reusa claim atômico ADR-155). Definir `report_type='goal_snapshot'` ou job separado.
2. **DEC-A2 — Placar para `free`/`expired`:** read-only com metas manuais antigas, ou bloqueio total? Recomendação: placar read-only existe; criação/sugestão/cobrança automática gated em `eligible` (espelha EST-5/6).
3. **DEC-A3 — Thresholds de `status` (ahead/on_track/behind/at_risk)** e banda de tolerância (A4 evita pânico). Definir por `goalType`/`horizon`.
4. **DEC-A4 — Chave de semana UTC vs BRT no snapshot:** `study_weekly_plans` é UTC, `coach_lesson_recommendations` é BRT (CLAUDE.md §10). Recomendação: snapshot em **UTC via `ymdUtc`** (alinha `study_weekly_plans`/`weekly_planning_sessions`); a cobrança (BRT-aware da segunda) lê o snapshot UTC mais recente. Confirmar.
5. **DEC-A5 — `goals` single-table (discriminada por `goalType`) vs tabelas separadas (WIG / measure).** Recomendação: single-table + `goal_links` (menos joins, segue padrão `career_goals` AI-2B). Confirmar.
6. **DEC-A6 — Relação com `career_goals` (AI-2B):** `career_goals` já existe (trimestre/ano). A WIG da Metas **substitui**, **espelha** ou **referencia** `career_goals`? Recomendação: WIG `goal_type='result'` referencia/sincroniza com `career_goals` (sync opt-in unidirecional, como `ai_structured_profile.metas`) para não criar universos paralelos. **Decidir antes do schema** (risco de duplicação de domínio de carreira).
7. **DEC-A7 — Contrato exato do motor de aderência** (`getPlannedVsActual` shape) — definir interface antes da Fatia 2, com ADR próprio do motor (Fase A).
8. **DEC-A8 — Colisão de rota** `/api/goals/:id` vs `/scoreboard`/`/templates`/`/suggest` (EST-3/EST-6 já sofreram) — ordem de registro + guard test.

## Riscos
- **Duplicação de domínio com `career_goals` (AI-2B)** — sem DEC-A6 resolvida, WIG e `career_goals` viram universos paralelos. **Risco alto** — resolver no architect antes do schema.
- **Motor de aderência ausente** — a Fatia 2 (compliance fino) fica em proxy; documentar o downgrade para não prometer "vs plano" quando é "vs alvo".
- **`getStatsLeaks` stub** — metas `leak_focus` nascem fracas até o stub virar real; degrade gracioso obrigatório (RF-15).
- **`break_feedbacks` esparsos** — metas mentais nascem `low`; depende da Fase B (#4 adoção do break-feedback). Não bloquear, sinalizar.
- **Outcome bias do próprio jogador** — pressão para ver P&L no placar. Mitigação: D3/D9 escondem deliberadamente; documentar que é decisão de design (não bug).
- **Tom da cobrança escorregar para culpa (A4)** — guard test de prompt + regras em arquivo único (lesson #10) + revisão humana do prompt.
- **Custo LLM** acumulado (sugestão + cobrança × usuários) — reusa bundle/sumarização Haiku do Weekly Report; medir via admin cost metrics existente.
- **Working tree compartilhada (INCIDENT #24/#45)** — `shared/schema.ts` + `server/storage.ts` são tocados; `git add` explícito, considerar worktree por sprint.

## Notas de Implementação (opcional)
- Storage no padrão attach (`server/storage/goalsStorage.ts` → `attachGoalsStorage(storage)`, como `weeklyPlanningStorage.ts`), fora do `storage.ts` gigante.
- Orquestrador de sugestão/cobrança em `server/coach/goals/` reusando `anthropicClient.callReportLlm` + tools AI-2A.
- Regras de tom A4 da cobrança em arquivo único (lesson #10), análogo a `coachSafetyPrompts.ts`.
- Frontend: `/metas` + `/metas/nova` em `client/src/App.tsx`; placar com `useQuery` + ErrorBoundary local para sub-fetchers (lesson #29); testes `.tsx` com `await import` (lessons #14/#26/#38).
- Migration: drizzle-kit + `_rollback.sql`, psql local, pendência PROD no CLAUDE.md §6.
