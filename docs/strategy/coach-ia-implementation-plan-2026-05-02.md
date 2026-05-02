# Coach IA Upgrade — Plano de Implementacao (2026-05-02)

**Origem:** `Docs/strategy/coach-ia-upgrade-research-2026-05-02.md` (strategist)
**Pipeline:** `pm-spec → system-architect → test-writer → implementer → reviewer → (deployer opcional)`
**Duracao total estimada:** ~6-7 semanas (3 sprints sequenciais + Sprint 0 transversal)
**Convencao branch:** `feature/coach-2b`, `feature/coach-3`, `feature/coach-4` (worktree quando autonomo)

---

## Visao geral — 4 sprints sequenciais

```
Sprint 0 (Pre-requisitos)  ──┐
                             ├──► Sprint Coach-2B (write tools + nudges low-risk)  ──┐
                             │                                                        ├──► Sprint Coach-3 (relatorios)  ──┐
                             │                                                        │                                    ├──► Sprint Coach-4 (carreira + mental)
                             │                                                        │                                    │
~3-5 dias                    │   ~1.5-2 semanas                                       │   ~2-3 semanas                     │   ~2 semanas
                             │                                                        │                                    │
gate: opt-out + audit       gate: founder QA writes      gate: founder QA report   gate: founder QA mental
```

**Gate entre sprints = approval do founder + reviewer APPROVED.** Cada sprint termina merged em main + deploy local.

---

## Sprint 0 — Pre-requisitos transversais (CRITICO)

**Por que existe:** ANTES de qualquer nudge proativo ir live, precisamos das 3 fundacoes anti-fadiga + auditoria. Sem isso Sprint Coach-2B vira nudge bombing.

**Duracao:** 3-5 dias. Roda solo (pode paralelizar com inicio de pm-spec do Coach-2B).

### Itens

| # | Item | Esforco | Dor coberta |
|---|---|---|---|
| 0.1 | **Opt-out granular por categoria** (settings/preferences) — 8 toggles + quiet hours + frequency cap | 2 dias | R1 nag fatigue |
| 0.2 | **Audit page `/settings/coach-actions`** — lista cronologica de tudo que Coach fez/registrou | 1 dia | R4 privacidade |
| 0.3 | **Citations inline** — toda mencao de numero append `[fonte: X]` | 1 dia | confianca |
| 0.4 | **Confidence tags** — ⚠️ / ✅ por sample size | 0.5 dia | confianca |

### Pipeline

1. **pm-spec** — spec curta de 4 itens (sao quick wins, spec leve)
2. **system-architect** — ADR opt-in granular (categorias + storage `user_coach_preferences`)
3. **test-writer** — testes preferences + quiet hours + frequency cap + audit list
4. **implementer** — green phase
5. **reviewer** — pre-merge
6. **/simplify** automatico apos implementer

**Branch:** `feature/coach-sprint-0`. Merge em main antes de Coach-2B comecar.

---

## Sprint Coach-2B — Write tools + nudges baixo-risco

**Duracao:** 1.5-2 semanas
**Branch:** `feature/coach-2b`
**Itens top 15:** #1 (B-SNAPSHOT), #3 (B-LEAK), #5 (write tools batch 1), #6 (log_leak_focus), #10 (log_study_session)

**Objetivo:** Coach passa a *agir* (com confirmacao + undo). Primeiros nudges proativos. 4 dores principais cobertas (D4 bankroll, D6 leak, D7 estudo, D5 grade).

### RFs alvo

| RF | Descricao | Tool ou nudge |
|---|---|---|
| RF-01 | Confirmation + undo pattern em write tools | infra |
| RF-02 | `record_wallet_transaction` | write |
| RF-03 | `start_grind_session` + `log_session_completed` | write |
| RF-04 | `register_tournament_in_grade` | write |
| RF-05 | `log_leak_focus` + `verify_leak_progress` | write |
| RF-06 | `log_study_session` | write |
| RF-07 | B-SNAPSHOT proativo (dia 28) | nudge |
| RF-08 | B-LEAK proativo (apos upload CSV) | nudge |
| RF-09 | B-STUDY proativo (foco escolhido sem update 7d) | nudge |
| RF-10 | Coach actions UI: diff visual + undo 5min | UI |

### Pipeline TDD

| Fase | Agente | Output esperado |
|---|---|---|
| 1 | **pm-spec** | `Docs/specs/coach-2b.md` — 10 RFs + criterios aceite + edge cases. Consume research doc 2026-05-02 + lessons-learned#coach |
| 2 | **system-architect** | ADRs novos: (a) confirmation/undo pattern write tools, (b) job runner timezone-aware (preview pra Coach-3), (c) coach_actions schema delta. Diagrama Mermaid sequencia "user → coach → tool → confirmation → DB → undo window". |
| 3 | **test-writer** | Testes vitest: cada write tool (happy + 3 edge), nudges (gap-check + opt-out + frequency cap + quiet hours), coach_actions audit. Red phase. |
| 4 | **implementer** | Green phase. Nunca toca testes. Nunca adiciona escopo. |
| 5 | **/simplify** | Pos implementer, antes de reviewer. |
| 6 | **reviewer** | Pre-merge. Audita: write tools com confirmation OBRIGATORIA, undo persistido, opt-out respeitado, custos Anthropic medidos. |
| 7 | **db:push** + push origin | Founder approva. |

### Criterios de aceite Sprint 2B

- [ ] 6 write tools entregues com confirmation + diff + undo 5min
- [ ] 3 nudges low-risk (B-SNAPSHOT, B-LEAK, B-STUDY) live com opt-out funcional
- [ ] Audit log persistente em `coach_actions` para 100% das writes
- [ ] Telemetria `dismissed/engaged/unsubscribed` ativa
- [ ] Reviewer APPROVED + founder QA real (testar 1 semana antes de Coach-3)
- [ ] Zero regressao em testes existentes (~5500+ baseline)
- [ ] Custo Anthropic medido em <$50/semana para alpha (10 users)

---

## Sprint Coach-3 — Sistema de relatorios + nudges semanais

**Duracao:** 2-3 semanas
**Branch:** `feature/coach-3`
**Pre-requisito:** Coach-2B mergeado + 1 semana QA do founder
**Itens top 15:** #2 (Daily Debrief), #4 (Weekly), #7 (B-VOLUME), #8 (Monthly), #9 (B-GRADE), #12 (career goals)

**Objetivo:** Loop fechado warm-up → grind → debrief → semana → mes. Coach vira "presenca viva". Cobre dores D1 variancia, D3 volume, D8 plateau (parcial).

### RFs alvo

| RF | Descricao |
|---|---|
| RF-01 | Job runner timezone-aware (node-cron + agenda PG-backed) |
| RF-02 | `report_jobs` + `reports` tables + idempotencia |
| RF-03 | Daily Debrief automatico (apos session.completed) |
| RF-04 | Weekly Report (segunda 7h tz user) |
| RF-05 | Monthly Report (dia 1, comparativos + variancia) |
| RF-06 | Gap-check pre-relatorio (cobranca de dados faltantes) |
| RF-07 | Personalizacao por nivel (iniciante/intermediario/pro) |
| RF-08 | Multi-canal: in-app card + email HTML opt-in + PDF on-demand |
| RF-09 | CTAs estruturados nos relatorios (viram tools do Coach-2B) |
| RF-10 | B-VOLUME proativo (terca: planejado vs jogado) |
| RF-11 | B-GRADE proativo (sabado: sugerir grade) |
| RF-12 | `define_career_goal` + `evaluate_career_goal` tools |
| RF-13 | Tier gating: Daily Debrief/Weekly = Premium-only |
| RF-14 | Fail-soft: relatorio determinstico se LLM falhar 3x |
| RF-15 | Hierarchical summarization (Haiku → Sonnet) |

### Pipeline TDD

| Fase | Agente | Output esperado |
|---|---|---|
| 1 | **pm-spec** | `Docs/specs/coach-3.md` — 15 RFs + matriz cadencias × secoes × tier gating |
| 2 | **system-architect** | ADRs: job runner choice, idempotencia, schema reports, hierarchical summarization (Haiku+Sonnet). Diagramas: sequencia geracao Weekly + flowchart gap-check. |
| 3 | **test-writer** | Testes: cron timezone, idempotencia (mesmo periodo nao gera 2x), gap-check, fail-soft template, tier gating, comparativos. Red phase. |
| 4 | **implementer** | Green phase. Atencao especial: prompt caching mantido, custos amortizados. |
| 5 | **claude-api skill** | Invocar pra audit de prompt caching + thinking + tool batching nos relatorios. |
| 6 | **/simplify** | Pos implementer. |
| 7 | **reviewer** | Pre-merge. Audit: idempotencia stress test, custo Anthropic estimado vs real, fallback determinstico, P95 < 90s. |
| 8 | **deployer** (opcional) | So se founder pedir explicito — relatorios precisam de worker rodando. Deploy local OK. |

### Criterios de aceite Sprint 3

- [ ] 4 relatorios funcionando (Daily, Weekly, Monthly, on-event)
- [ ] Gap-check rodando antes de cada relatorio
- [ ] Multi-canal: in-app card + email HTML
- [ ] Tier gating estrito (Free recebe so Monthly resumido)
- [ ] Idempotencia validada: re-run nao duplica
- [ ] Fail-soft testado: LLM 5xx 3x → template determinstico
- [ ] Custo medido: <$0.15/relatorio Monthly real
- [ ] P95 < 90s pra Monthly Report
- [ ] Reviewer APPROVED + founder QA 1 semana

---

## Sprint Coach-4 — Carreira longa + mental profundo

**Duracao:** 2 semanas
**Branch:** `feature/coach-4`
**Pre-requisito:** Coach-3 mergeado + 1 semana QA
**Itens top 15:** #11 (C-game/Inchworm), #13 (Quarterly), #14 (diagnose_plateau), #15 (B-LIFE)

**Objetivo:** Coach vira tecnico de carreira verdadeiro. Diferenciador maximo. Cobre dores D2+D9 (mental+vida), D8 (plateau), D10 (carreira).

### RFs alvo

| RF | Descricao |
|---|---|
| RF-01 | C-game tracker (% A/B/C-game self-report pos sessao) |
| RF-02 | Mental Hand History tool (Tendler framework) |
| RF-03 | `log_mental_state(state, intensity, trigger?)` |
| RF-04 | Inchworm visualization (relatorio mensal — A-game movement) |
| RF-05 | `diagnose_plateau()` — combina find_top_leaks + analyze_variance + grind_study_ratio |
| RF-06 | `analyze_variance(period, dimension)` — std-dev + intervalos confianca |
| RF-07 | Quarterly Career Review (job + relatorio + plano novo) |
| RF-08 | `generate_career_plan(horizon)` — 90/180/365d com KPIs |
| RF-09 | B-LIFE proativo — saude operacional (sleep, off days, sessoes noturnas) |
| RF-10 | wellbeing prompts (1x/semana opt-in) |
| RF-11 | Disclaimer + tom condicional em outputs financeiros (R8 mitigation) |
| RF-12 | (stretch) Annual Poker Wrapped — protótipo |

### Pipeline TDD

| Fase | Agente | Output esperado |
|---|---|---|
| 1 | **pm-spec** | `Docs/specs/coach-4.md` — 12 RFs. Mental tracking tem maior risco UX — incluir wireframes |
| 2 | **system-architect** | ADRs: (a) mental_hand_history schema, (b) variance calc methodology, (c) tier gating Quarterly = Premium-only. Diagrama Inchworm flow. |
| 3 | **test-writer** | Testes: variance math correto, plateau detection, mental state persistence, B-LIFE gap-check + opt-in (default OFF). Red phase. |
| 4 | **implementer** | Green phase. Atencao tom — outputs financeiros com disclaimer. |
| 5 | **/simplify** | Pos implementer. |
| 6 | **reviewer** | Pre-merge. Audit: regulatorio (disclaimer presente), tom (peer accountability), opt-in obrigatorio mental+wellbeing. |
| 7 | **strategist** revisita | Antes do merge final, strategist roda audit UX com 3 wireframes principais (Mental Hand History form, Inchworm chart, Quarterly Review). |

### Criterios de aceite Sprint 4

- [ ] C-game tracker + Mental Hand History live (opt-in default OFF)
- [ ] Inchworm visualization no relatorio mensal
- [ ] `diagnose_plateau` funcional + testado em 3 perfis (downswing, plateau real, variancia)
- [ ] Quarterly Career Review entregue dia 1 jan/abr/jul/out
- [ ] B-LIFE proativo com opt-in granular
- [ ] Disclaimer regulatorio em 100% outputs financeiros
- [ ] Reviewer APPROVED + strategist UX audit OK
- [ ] Founder QA 2 semanas antes de soltar pra alpha externo

---

## Itens transversais paralelos

Rodam em paralelo a qualquer sprint, sem bloqueio:

| Item | Quando | Esforco |
|---|---|---|
| **Conversation timeline UI** (cards relatorios + nudges em /coach-ai) | Coach-2B paralelo | 2 dias |
| **Telemetria nudge `dismissed/engaged/unsubscribed`** | Coach-2B start | 1 dia |
| **Budget alerts admin dashboard** (cost_per_user_30d) | Coach-3 | 1.5 dia |
| **Pool intelligence BR system prompt** (Suprema/GG/SBGL metadata) | Coach-2B | 1 dia |
| **`query_pool_intelligence` tool** | Coach-3 | 1 dia |
| **Onboarding consent flow** (categorias write tools + tom Coach) | Coach-2B start | 2 dias |

---

## Marcos de approval do founder

Por contrato de autonomia (CLAUDE.md secao 13), founder aprova:

| Marco | Quando | O que founder valida |
|---|---|---|
| **M1** | Pos pm-spec Sprint Coach-2B | Spec + escopo das 10 RFs |
| **M2** | Pos system-architect Coach-2B | ADRs novos (3 ADRs criticos) |
| **M3** | Pos reviewer Coach-2B | Pre-merge — write tools com undo + opt-out funcionando |
| **M4** | Pos QA 1 semana | Continua pra Coach-3 |
| **M5** | Pos pm-spec Coach-3 | Custo Anthropic estimado + tier gating |
| **M6** | Pos reviewer Coach-3 | Idempotencia + fail-soft + P95 |
| **M7** | Pos QA 1 semana | Continua pra Coach-4 |
| **M8** | Pos pm-spec Coach-4 | Mental tracking UX |
| **M9** | Pos reviewer Coach-4 | Disclaimer regulatorio + opt-in |
| **M10** | Pos QA 2 semanas | Pronto pra alpha externo |

---

## Acoes ja autorizadas (sem perguntar)

Por CLAUDE.md secao 13:
- Spawn de subagentes pipeline TDD ja iniciado (test-writer → implementer → reviewer)
- `/simplify` pos-implementer antes de reviewer
- `claude-api` skill ao mexer SDK Anthropic
- `/session-report` fim de sessao >50k tokens
- Compactar memory files >5k pos sessao longa
- Atualizar `_shared/conventions.md` se padrao repete

## Acoes que sempre pedem approval

- Deploy / `deployer`
- `git push`
- `db:push` em producao
- Editar `package.json` deps
- ADRs novos significativos (Coach-2B tem 3 — pre-aprovacao bulk OK?)
- Schema migrations grandes (Coach-3 tem `report_jobs` + `reports` — pre-aprovacao OK?)

---

## Riscos do plano (meta-risk)

| Risco | Mitigacao |
|---|---|
| **Sprint Coach-3 estoura prazo** (relatorios sao complexos) | Cortar Quarterly Review → Coach-4. Manter Daily+Weekly+Monthly so |
| **Founder muda escopo a meio** | Cada sprint independente — pode parar entre eles sem quebrar |
| **Custo Anthropic explode em alpha** | Tier gating estrito desde M5. Budget alert. Capear em $X/dia auto-disable |
| **Nudges geram churn em alpha** | Sprint 0 obrigatorio antes de qualquer nudge. Telemetria viva. Kill switch por categoria |
| **Pipeline TDD lento demais pra prazo** | Aceitar. Pipeline TDD eh o contrato. Cortar escopo, nao etapas |

---

## Proximo passo IMEDIATO

1. Founder le este plano + research doc 2026-05-02
2. Founder valida priorizacao + escopo Sprint 0 + Coach-2B
3. Apos approval, invoco **pm-spec** com input:
   - `Docs/strategy/coach-ia-upgrade-research-2026-05-02.md`
   - `Docs/strategy/coach-ia-implementation-plan-2026-05-02.md` (este doc)
   - Foco: Sprint 0 (4 itens) + Sprint Coach-2B (10 RFs)
4. Sprint 0 inicia em paralelo com pm-spec Coach-2B (gates independentes)

**ETA pra Coach-2B em main:** ~2.5 semanas (Sprint 0 + 2B sequencial com algum overlap).
**ETA pra Coach-4 em main:** ~7 semanas (3 sprints sequenciais + QAs intermediarios).
