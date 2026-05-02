# Coach IA Upgrade — Research & Plan (2026-05-02)

**Autor:** Strategist agent
**Status:** Research + plan. Nao implementar. Consumir via pm-spec depois.
**Founder ask:** "Upgrade grande no Coach IA — virar facilitador/coach/tecnico estrategico do jogador. Relatorios automaticos semanais/mensais, cobranca proativa, tools que registram coisas pelo jogador, atuar como tecnico de carreira."

**Estado atual (linha de base — 2026-05-02):**
- Coach v1 + Sprint Coach-1 (prompt caching, tiered rate limit, feedback up/down) ENTREGUE.
- Coach v2 / Sprint Coach-2A (page context + 5 read tools: query_dimension, find_top_leaks, get_tournament_suggestions, explain_tournament_score, simulate_bankroll_scenario) ENTREGUE.
- Tool 6 `read_user_hud_stats` ENTREGUE no Sprint F3 (Stats Analyzer).
- 3 coaches isolados (Mental, Tournaments, Technical), 100% reativo (jogador inicia chat), zero write/agent tools, zero relatorios, zero proatividade.
- Documento previo `2026-04-24-coach-ai-optimization-plan.md` ja mapeou 8 categorias de ideias (A-H) em 3 sprints. Coach-1 + 2A sao parte daquele plano.

Este documento e o **upgrade-de-upgrade** — vai alem do plano de 2026-04-24 para responder a visao do founder de "tecnico estrategico de carreira". Foco em:
1. Mapeamento sistemico de dores de carreira MTT.
2. Mapeamento dor → feature do Coach.
3. Sistema completo de relatorios automaticos.
4. Priorizacao ICE consolidada (incluindo backlog de 2026-04-24 ainda nao entregue).
5. Riscos e mitigacoes especificas para um Coach proativo.

---

## MODO 1 — Mapeamento sistemico de dores de carreira MTT

Cruzei pesquisa externa (Tendler, BlackRain79, Cardplayer Lifestyle, mttpokerschool, poker.org mental health, Smart Poker Study, 888poker goal-setting) com conhecimento de produto. Organizo por **3 eixos cruzados**:

- **Fase de carreira:** iniciante (< 1 ano grind serio) | intermediario (1-3 anos, breakeven a winner soft) | pro (3+ anos, winner consistente buscando edge marginal) | high-stakes (volume baixo, edge minusculo, mental game e tudo)
- **Horizonte temporal:** diario (sessao) | semanal (volume + study) | mensal (resultado financeiro) | trimestral/anual (carreira)
- **Dimensao:** tecnica | mental | financeira | operacional | social

### 1.1 — Mapa de dores (10 categorias × 3 fases × 4 horizontes)

| # | Dor estruturante | Iniciante (sintoma) | Intermediario (sintoma) | Pro/High-stakes (sintoma) |
|---|---|---|---|---|
| **D1** | **Variancia + downswings** | Panico em 50 BI down — abandona stake. | 200-500 BI swings sem causa tecnica clara — duvida do edge. | 1k-3k BI swings — questiona se ainda e winner. |
| **D2** | **Tilt e mental game** | Bad-beat tilt, multi-tabling derrete. | Carryover tilt entre sessoes; bust precoce vira padrao. | Burnout silencioso; A-game raro, B/C-game dominam. |
| **D3** | **Volume vs qualidade (grinder vs estudante)** | Volume baixo, sem foco; estuda aleatorio. | Volume alto demais — sem tempo de estudo; plateau. | Estudo eficiente raro — "ja sei o basico, falta micro-edge". |
| **D4** | **Bankroll & FX (Brasil-specific)** | BR insuficiente; saca em 50% lucro; sem rakeback awareness. | Multi-wallet caotico (USD/BRL/EUR); FX confuso; rake leak invisivel. | Tax planning ausente; staking math errado; cap em high stakes (limite de field). |
| **D5** | **Selection (escolher torneios certos)** | Joga tudo que ve; field errado; horarios ruins. | Sabe que field BR e mais soft, mas nao tem dados. Multi-rede confunde. | Edge marginal por torneio — selection e diferenca entre lucro/breakeven. |
| **D6** | **Identificacao de leaks** | Nao sabe nem quais stats olhar; sample size ridiculo. | Ve VPIP/PFR mas nao age — leaks moveis (corrige um, surge outro). | Leaks sutis (size de 3bet em SB BvB com 18bb) — invisiveis em ferramentas genericas. |
| **D7** | **Estudo (o que/quando/como)** | Compra curso aleatorio, abandona. | GTO Wizard, solver — overload; sem plano coerente. | Sabe muito mas perde edge sem rotina sistematica de revisao. |
| **D8** | **Plateau / regressao** | Nao percebe — acha que so falta volume. | 6+ meses breakeven; sabe que tem leak mas nao acha. | Regressao real (campos enrijecem, edge cai). |
| **D9** | **Vida pessoal (familia/social/horarios)** | Familia nao entende; namorada cobra estabilidade. | Casado com filhos — sessao das 21h quebra rotina familiar. Isolamento social. | Nocturnal lifestyle, sleep debt cronico, depressao subdiagnosticada. |
| **D10** | **Carreira / longo prazo** | "Posso virar pro?" — sem framework de decisao. | Stake/coaching, dropar emprego CLT — sem accountability. | Quando parar? Como diversificar? Imposto de renda. Saude mental como ativo. |

### 1.2 — Dores agudas por horizonte temporal

**Diario (sessao):**
- Pre-grind: o que estudar/aquecer/decidir? Estado mental?
- Durante: detectar tilt, fadiga, on-tilt streak. Decidir parar.
- Pos-grind: debrief — foi variancia ou erro? Registrar leaks.

**Semanal:**
- Volume planejado vs jogado. Por que gap?
- Estudos planejados vs feitos. Quais stats foram analisadas?
- Quais torneios novos entraram na grade? Quais sumiram?

**Mensal:**
- ROI e profit reais (nao so vibes).
- Comparativo com mes anterior + media historica.
- Bankroll: snapshot, FX, transferencias.
- Metas batidas? Meta para proximo mes?

**Trimestral/anual:**
- Carreira: virou pro? Vai virar? Stake/coaching status?
- Imposto de renda (Brasil 2026 — declaracao obrigatoria de bets, poker ainda em zona cinzenta).
- Saude mental: sleep, treino, vida social — leak invisivel mais caro.

### 1.3 — Dores cruzadas (sistemicas)

Algumas dores sao **interseccoes** que ferramentas atuais nao tratam:

- **D2 + D9 (mental + vida):** burnout vem de schedule ruim, nao de hands. Coach atual ignora padrao de horarios.
- **D3 + D7 (volume + estudo):** tradeoff implicito — coach atual nao mede tempo de estudo nem cobra rotina.
- **D4 + D10 (bankroll + carreira):** staking, tax, retirada, shot taking. Coach atual simula cenario isolado, nao pensa carreira.
- **D5 + D8 (selection + plateau):** plateau frequentemente e selection ruim, nao tecnico. Coach atual nao cruza.
- **D6 + D7 (leak + estudo):** leak detectado deveria virar plano de estudo automatico. Hoje nao vira.

**Conclusao Modo 1:** o Coach atual ataca **D5/D6 (parcial)** + **D2 (parcial)**. Tudo o resto esta destruido ou ausente. As **dores sistemicas (cruzamentos)** sao as que mais quebram carreira e sao as que mais diferenciam um "tecnico" de um "consultor".

---

## MODO 2 — Mapeamento dor → feature do Coach IA

Para cada dor, mapeio:
- **Conversa proativa** (nudge, lembrete, pergunta)
- **Relatorio automatico** (semanal/mensal/evento)
- **Tool nova** (registrar/validar/calcular)
- **Workflow** (loop fechado)
- **Integracao com features existentes**
- **Feature ainda nao construida** (proposta)

### D1 — Variancia + downswings

- **Conversa proativa (B-DOWNSWING):** quando coach detecta downswing > X BI sem leak tecnico claro, abre conversa: "Voce esta -120 BI em 30 dias. Rodei find_top_leaks — nao detectei leak novo. Probabilidade de variancia pura: 73%. Quer revisar samples ou conversar sobre mental?"
- **Relatorio mensal:** secao "Variancia analytics" — std-dev de ROI por categoria, comparado com sample esperado.
- **Tool nova `analyze_variance(period, dimension)`:** roda calculo simulado de variancia (n samples, std-dev, intervalos de confianca).
- **Workflow loop:** detectar downswing → diagnostico (variancia vs leak) → recomendar acao (continuar / mover stake / pause) → registrar decisao.

### D2 — Tilt e mental game (Tendler-aware)

- **Conversa proativa (B-TILT):** durante grind live, detectar 3+ early busts seguidos OU >6h sem break OU sessao 40%+ abaixo da media → push "quer pausar 5 min?". Pos-sessao: "como esta seu C-game hoje?"
- **Tool nova `log_mental_state(state, intensity, trigger?)`:** Coach registra estado mental do jogador via conversa estruturada (pre/durante/pos).
- **Tool nova `mental_hand_history(situation, emotion, response, ideal_response)`:** framework do Tendler — registra "mental hand" para revisao posterior.
- **Relatorio mensal:** secao "Mental health" — % sessoes com tilt reportado, padroes (horario, dia da semana, ultimo bad-beat), comparativo com meses anteriores.
- **Feature nova:** **C-game tracker** — Coach pergunta no fim da sessao "que % do tempo voce jogou A/B/C?". Traca movimento Inchworm (A-game melhora? C-game encolhe?). Diferenciador competitivo enorme — ninguem tem isso digitalizado.
- **Integracao:** Coach Mental ja existe — vira proativo, ganha tools.

### D3 — Volume vs qualidade

- **Conversa proativa (B-VOLUME):** Toda terca de manha: "Voce planejou 8 sessoes essa semana, registrou 3 ate agora. Faltam 5 dias. Quer revisar grade?"
- **Tool nova `log_study_session(topic, duration, source)`:** registrar tempo de estudo (categoria: solver, hand review, video, library, mental).
- **Tool nova `compute_grind_study_ratio(period)`:** calcula tempo grind vs estudo — alerta se grind > 5x estudo.
- **Relatorio semanal:** secao "Tempo investido" — h grind, h estudo, ratio, vs target do plano de carreira.
- **Workflow:** dia da semana sem estudo → nudge no fim do dia "registrou estudo hoje?". Recorrente → escala para aviso semanal.

### D4 — Bankroll & FX

- **Conversa proativa (B-SNAPSHOT):** dia 28 do mes: "Mes acaba em 3 dias. Bora fechar snapshot bankroll? Posso puxar saldos das 3 wallets que voce tem registradas."
- **Tool nova `create_bankroll_snapshot(notes?)`:** dispara fluxo de snapshot conversacional.
- **Tool nova `record_wallet_transaction(walletId, amount, currency, type, reason)`:** Coach registra transacao com confirmacao. Casos: deposito, saque, transferencia inter-wallet, rakeback recebido.
- **Tool nova `calculate_effective_rake(period, site)`:** integra com upload + rakeback table. Detecta sites onde rake > rakeback effective.
- **Relatorio mensal:** secao "Financas" — profit por moeda nativa, conversao USD, FX impact, rakeback recebido vs estimado, transferencias, BR atual vs alvo.
- **Workflow Brasil tax:** janeiro/fevereiro 2026 — Coach ajuda compilar P&L anual para IRPF (sem fazer calculo fiscal — apenas extrato organizado).
- **Integracao:** Sprint Bankroll-3 ja entregou auto-snapshot, transfers, ROI. Coach passa a *ler e iniciar* esses fluxos.

### D5 — Selection

- **Conversa proativa (B-GRADE):** sabado as 11h: "Sua semana arranca segunda. Quer que eu sugira grade?". Roda Tournament Selector + apresenta top 10. Confirma cada item.
- **Tool nova `register_tournament_in_grade(templateId, day, time, profile)`:** Coach adiciona torneio ao grade-planner via tool com confirmacao (write tool — Coach-2B planejado).
- **Tool nova `bulk_propose_grade(date, profile, hours_target)`:** Coach gera grade inteira (8-12 torneios) e apresenta para 1 confirmacao em massa.
- **Tool ja existe:** `get_tournament_suggestions` + `explain_tournament_score`.
- **Relatorio semanal:** secao "Selection" — torneios novos sugeridos, leaks de selection (ex: "voce jogou 30 hypers GG, ROI -8% em 90d — bloqueamos pra proxima?").
- **Integracao:** Tournament Selector + Grade Planner.

### D6 — Identificacao de leaks

- **Conversa proativa (B-LEAK):** apos novo upload CSV detectar leak novo: "Acabei de ver seus 30 torneios novos — apareceu leak em 3bet defense. Quer revisar?"
- **Tool nova `log_leak_focus(leak, status)`:** jogador escolhe foco — "esse mes vou trabalhar 3bet preflop". Coach trackeia.
- **Tool nova `verify_leak_progress(leak)`:** compara stat focada vs media historica e benchmark — mede progresso real.
- **Relatorio mensal:** secao "Leaks" — quais focos ativos, progresso, leaks novos detectados, leaks resolvidos.
- **Workflow:** leak detectado → escolher foco → estudo planejado → revisao em 30d.
- **Tool ja existe:** `find_top_leaks` + `read_user_hud_stats`.

### D7 — Estudo (o que/quando/como)

- **Conversa proativa (B-STUDY):** "Voce escolheu focar 3bet preflop esse mes. Faz 7 dias que nao registra estudo nessa stat. Quer agendar 30 min hoje?"
- **Tool nova `recommend_study_topic(based_on_leak?)`:** Coach pesquisa Library (modulo Biblioteca/LMS recem-lancado) + sugere conteudos relevantes. Cruza com leak escolhido.
- **Tool nova `schedule_study_block(topic, datetime, duration)`:** integra com calendar_events.
- **Relatorio semanal:** secao "Estudos" — topicos cobertos, fontes (Library, solver externo, hand review), tempo total, vs target.
- **Integracao:** Library/LMS (lancado 2026-05-02) + Stats Analyzer + Studies/Spots.

### D8 — Plateau / regressao

- **Conversa proativa (B-PLATEAU):** detectar 60+ dias sem mudanca em ROI agregado: "Seu ROI esta estavel em 4.2% ha 90d. Vou rodar diagnostico de plateau."
- **Tool nova `diagnose_plateau()`:** combina find_top_leaks + analyze_variance + compute_grind_study_ratio. Identifica: leak novo? selection ruim? estudo insuficiente? mental?
- **Relatorio trimestral:** secao "Carreira & Plateau" — trajetoria de ROI 90d/180d/365d, comparativos, sugestoes.
- **Workflow:** plateau detectado → diagnostico → plano de 30 dias com checkpoint semanal.

### D9 — Vida pessoal / horarios / saude

- **Conversa proativa (B-LIFE):** detectar padrao schedule (sessoes >6h consecutivas, multiplos dias seguidos sem off, sessao apos 2am): "Notei 5 dias seguidos com sessao apos 1am. Que tal agendar 1 dia off?"
- **Tool nova `suggest_off_day(week)`:** com base em performance histograms, sugere melhor dia para folga.
- **Relatorio semanal:** secao "Saude operacional" — dias trabalhados, horas totais, off days, sessoes noturnas.
- **Feature nova:** **wellbeing prompts** — 1x/semana Coach pergunta: "como anda sleep / treino / vida social? notou impacto nas sessoes?". Registra qualitativamente. Conecta ao Inchworm (D2).
- **Risco:** invasivo. Mitigacao: opt-in explicito + pode desligar por categoria.

### D10 — Carreira / longo prazo

- **Conversa proativa (B-CAREER):** trimestral, Coach abre: "Faz 3 meses do nosso ultimo plano de carreira. Bora revisar metas?"
- **Tool nova `define_career_goal(goal, deadline, success_metric)`:** Coach registra meta SMART/OKR.
- **Tool nova `evaluate_career_goal(goalId)`:** verifica progresso (ex: "meta era ROI 6% em 90d, voce esta 4.2%").
- **Tool nova `generate_career_plan(horizon)`:** plano de 90/180/365 dias com checkpoints + KPIs.
- **Relatorio trimestral:** secao "Carreira" — metas ativas, progresso, decisoes pendentes (shot, dropar CLT, staking, etc).
- **Integracao:** ja teve "Goal Setting" Sprint 4 cancelado no roadmap pivot. Coach v3 entrega isso *implicitamente*, via conversa, sem precisar feature dedicada.

### Resumo Modo 2: gap analysis

| Gap | Hoje | Coach v3 alvo |
|---|---|---|
| **Conversa proativa** | 0 nudges | 8 categorias de nudge (B-DOWNSWING, B-TILT, B-VOLUME, B-SNAPSHOT, B-GRADE, B-LEAK, B-STUDY, B-PLATEAU, B-LIFE, B-CAREER) |
| **Relatorios automaticos** | 0 | 3 cadencias (semanal, mensal, trimestral) + ad-hoc |
| **Write tools** | 0 | ~12 tools (registrar sessao/leak/estudo/snapshot/transacao/grade/meta/mental state) |
| **Tools de carreira** | 0 | `define_career_goal`, `generate_career_plan`, `diagnose_plateau`, `analyze_variance` |
| **Mental tracking** | feedbacks soltos | Mental Hand History + C-game tracker + Inchworm |

---

## MODO 3 — Sistema completo de relatorios automaticos

### 3.1 — Cadencia

| Tipo | Quando | Trigger | Esforco compute |
|---|---|---|---|
| **Daily Debrief** | Apos `grind_session.status='completed'` | Evento | Baixo (1 chamada Sonnet) |
| **Weekly Report** | Segunda-feira 7h horario do user | Cron + timezone | Medio (1 Sonnet + 5-10 tool calls) |
| **Monthly Report** | Dia 1 do mes seguinte 9h | Cron + timezone | Alto (1 Sonnet + 15-20 tool calls + Haiku para sumarizar trechos) |
| **Quarterly Career Review** | Dia 1 jan/abr/jul/out | Cron | Alto (1 Sonnet + 20+ tool calls + plano novo) |
| **On-event** | Triggers especificos (downswing, plateau, fim do mes 3 dias antes) | Detecta job | Variavel |

### 3.2 — Conteudo do Weekly Report (modelo)

**Cabecalho:**
- "Sua semana — 26/abr a 02/mai" + saudacao tom pessoal do coach.
- Headline: "Voce jogou 18h, 47 torneios, fechou +$280 (ROI 8.2%). Boa semana — acima da sua media de 6 semanas."

**Secao 1 — Volume + Resultados (auto)**
- Sessoes concluidas vs planejadas
- Torneios jogados, ITM%, FTs, cravadas
- ROI da semana vs media 30d

**Secao 2 — Bankroll (auto)**
- Profit por moeda
- BR atual vs inicio da semana
- Transferencias / saques

**Secao 3 — Selection (auto + insight)**
- Torneios novos jogados
- Top 3 categorias com ROI positivo
- Bottom 3 com leak de selection

**Secao 4 — Estudos (auto)**
- Tempo de estudo registrado
- Topicos cobertos
- Foco escolhido vs cobertura real

**Secao 5 — Mental + Operacional (auto + opt-in)**
- Sessoes com tilt reportado
- Off days
- Sleep score self-report (se opt-in)

**Secao 6 — 3 insights do Coach (LLM-generated)**
- Acoes especificas: "voce nao registrou estudo em 3bet preflop ainda — sua semana acaba quarta"
- Nao generico — sempre data-grounded.

**Secao 7 — Plano da proxima semana**
- Sugestao de grade (Tournament Selector)
- 1 foco principal de estudo
- 1 acao recomendada (snapshot, retirada, conversar com mental, etc)

**Secao 8 — CTA do Coach**
- "Voce quer ajustar seu plano semanal agora? Posso registrar mudancas. Responda neste email ou abra o chat."

### 3.3 — Conteudo do Monthly Report

Mesmas secoes do weekly + adicoes:
- **Comparativos:** vs mes anterior + vs media 6 meses + vs media 12 meses.
- **Variancia analysis:** std-dev, intervalos de confianca, "voce esta dentro do esperado?".
- **Leaks resolvidos vs novos:** Inchworm visualization.
- **Goals progress:** % das metas batidas.
- **C-game movement (se opt-in):** voce esta em A-game qto % do tempo? subiu vs mes anterior?
- **Carreira KPI:** trajetoria 90d/180d/365d.

### 3.4 — Cobranca antes do relatorio (CHECK-LIST de dados faltantes)

Antes de gerar relatorio (D-3 dias), Coach roda **gap-check** e abre conversa:

```
- [ ] X sessoes nao tem reports manuais. Quer registrar agora?
- [ ] Voce escolheu foco "3bet preflop" no inicio do mes mas nao atualizou stats. Quer subir um print do HUD?
- [ ] Bankroll snapshot do mes anterior esta pendente. Posso puxar saldos?
- [ ] Voce nao registrou off days essa semana. Houve algum?
- [ ] Estudo: 0h registrado. Houve estudo nao registrado?
```

Cobranca **uma unica vez**, gentil, com botao "ignorar para esse relatorio". Re-cobra so no proximo ciclo.

### 3.5 — Personalizacao por nivel

| Nivel | Relatorio diferente em |
|---|---|
| **Iniciante** | Foco em educacao: "voce sabe que ROI < 5% em hypers e normal? aqui esta benchmark". Menos secoes, mais explicacao. |
| **Intermediario** | Foco em leaks acionaveis + selection. Comparativo com pool BR. |
| **Pro** | Foco em variancia + carreira + comparativo de longo prazo. Menos hand-holding. |
| **High-stakes** | Custom — opt-in de secoes, detalhe profundo em variancia + edge marginal. |

Detectar nivel via heuristica: volume + ROI consistente + idade da conta + plano de assinatura. Confirmar com user na onboarding.

### 3.6 — Formato de entrega

| Canal | Quando |
|---|---|
| **In-app card** (timeline) | Sempre — fica ancorado |
| **Email HTML** | Opt-in (default ON) |
| **Push notification** | Opt-in (default OFF) — so para "novo relatorio disponivel" |
| **PDF download** | On-demand (botao no in-app card) |
| **Chat** (continuar discussao) | Botao "discutir com coach" abre sessao com contexto pre-carregado |

### 3.7 — Acoes que o relatorio gera

Cada secao do relatorio tem 1 ou mais **CTAs estruturados** que viram tools:

- "Registrar 5 sessoes faltantes" → tool `bulk_create_grind_sessions` (Coach-2B)
- "Atualizar foco do mes" → tool `log_leak_focus`
- "Sugerir grade da proxima semana" → tool `bulk_propose_grade` + `register_tournament_in_grade` × N
- "Marcar 1 dia off" → tool `mark_off_day`
- "Retirar X% do BR" → tool `record_wallet_transaction(type='withdraw')`
- "Definir meta para proximo mes" → tool `define_career_goal`

### 3.8 — Custo estimado por relatorio (Anthropic API)

Com prompt caching ativo (Sprint Coach-1) + Haiku para sumarizacao:

| Tipo | Tokens estimados | Custo (USD) |
|---|---|---|
| Daily Debrief | 1.5k input cached + 800 output | ~$0.013 |
| Weekly | 4k input cached + 2k output + 5 tools (~3k tokens) | ~$0.045 |
| Monthly | 8k input cached + 4k output + 15 tools (~10k tokens) | ~$0.110 |
| Quarterly | 12k input cached + 6k output + 25 tools (~20k tokens) | ~$0.180 |

Para 1000 usuarios premium ativos:
- 4 Daily/semana × 1000 = ~$52/semana
- 1 Weekly × 1000 = ~$45/semana
- 1 Monthly × 1000 = ~$110/mes
- **Total mensal:** ~$430/mes para 1000 premium. Aceitavel se ARPU premium > $30.

### 3.9 — Arquitetura tecnica recomendada (resumo)

- **Job runner:** node-cron ou agenda (PostgreSQL-backed). Roda em worker separado do API.
- **Idempotencia:** `report_jobs` table com `(user_id, type, period)` UNIQUE — evita duplicar.
- **Timezone-aware:** sempre converter cron para timezone do user (`users.timezone`).
- **Throttling:** max N relatorios paralelos por minuto (cap de Anthropic API + DB).
- **Failure:** retry exponencial 3x, depois flag manual em admin dashboard.
- **Storage:** `reports` table com `body_json` (estruturado) + `body_html` (renderizado) + `pdf_url` (gerado on-demand).

---

## MODO 4 — Priorizacao ICE consolidada

Lista todas as ideias dos Modos 2 + 3 + backlog ainda nao entregue do plano de 2026-04-24.

**Notacao:** I (Impact 1-10) | C (Confidence 1-10) | E (Effort 1-10, MENOR = melhor) | Score = (I × C) / E

### 4.1 — Top 15 priorizado

| # | Ideia | I | C | E | Score | Sprint sugerido |
|---|---|---|---|---|---|---|
| 1 | **B-SNAPSHOT proativo** (dia 28: cobrar fechamento bankroll) | 8 | 9 | 2 | **36.0** | Coach-2B |
| 2 | **Daily Debrief automatico** (apos session.status=completed) | 9 | 9 | 3 | **27.0** | Coach-3 |
| 3 | **B-LEAK proativo** (apos upload, abrir conversa) | 8 | 8 | 3 | **21.3** | Coach-2B |
| 4 | **Weekly Report** (segunda 7h, in-app card + email) | 9 | 8 | 4 | **18.0** | Coach-3 |
| 5 | **Write tools batch 1** (`register_tournament_in_grade`, `start_grind_session`, `record_wallet_transaction`) | 9 | 8 | 4 | **18.0** | Coach-2B |
| 6 | **`log_leak_focus` + `verify_leak_progress`** (foco do mes) | 8 | 8 | 4 | **16.0** | Coach-2B |
| 7 | **B-VOLUME proativo** (terca: volume planejado vs jogado) | 7 | 8 | 3 | **18.7** | Coach-3 |
| 8 | **Monthly Report** (dia 1, comparativos + variancia) | 9 | 8 | 6 | **12.0** | Coach-3 |
| 9 | **B-GRADE proativo** (sabado: sugerir grade da semana) | 8 | 7 | 4 | **14.0** | Coach-3 |
| 10 | **`log_study_session` tool + B-STUDY proativo** | 7 | 7 | 3 | **16.3** | Coach-2B |
| 11 | **C-game tracker + Mental Hand History** (Inchworm) | 8 | 7 | 5 | **11.2** | Coach-4 |
| 12 | **`define_career_goal` + `evaluate_career_goal`** | 7 | 7 | 4 | **12.3** | Coach-3 |
| 13 | **Quarterly Career Review** (relatorio + plano novo) | 9 | 6 | 5 | **10.8** | Coach-4 |
| 14 | **`diagnose_plateau` tool** | 8 | 6 | 5 | **9.6** | Coach-4 |
| 15 | **B-LIFE proativo** (saude operacional, sleep, off days) | 7 | 6 | 4 | **10.5** | Coach-4 |

### 4.2 — Itens do backlog 2026-04-24 ainda relevantes (nao priorizados acima)

| Ideia | Status | Comentario |
|---|---|---|
| A2 — Contexto dinamico (RAG via router) | Adiar | Depende de volume — sem ganho claro <10k msgs |
| A3 — Embeddings pgvector | Adiar | Junto com A2 |
| A4 — Tool use generico | **Entregue parcial** (Coach-2A read tools) — write tools sao o item 5 acima |
| A5 — Hand History parser | Adiar | Feature gigante (1+ mes) — outro nivel de plano |
| A6 — Modo GTO/exploit | Adiar | Depende de ranges em cache + feature de range |
| C5 — Voice interface | **Descartado** | Confirma decisao previa |
| D2 — Citations | **Pre-requisito** | Implementar como sub-feature dos Modos 2/3 (todo numero deve citar fonte) |
| D4 — Coach Red Team | Adiar | Esperar volume |
| D5 — A/B testing prompts | Adiar | Esperar volume |
| E1 — Multimodal (screenshot) | **Sub-feature** | Stats Analyzer ja faz OCR — Coach pode invocar via tool |
| E3 — Opponent note taking | Depende A5 | Adiar |

### 4.3 — Sprints recomendados

**Sprint Coach-2B — Write tools + nudges baixo-risco** (1.5-2 semanas)
Items: 1 (B-SNAPSHOT), 3 (B-LEAK), 5 (write tools batch 1), 6 (log_leak_focus), 10 (log_study_session)
Resultado: Coach passa a *agir* (com confirmacao). Primeiros nudges proativos de baixo risco. Cobrir 4 dores principais.

**Sprint Coach-3 — Sistema de relatorios + nudges semanais** (2-3 semanas)
Items: 2 (Daily Debrief), 4 (Weekly Report), 7 (B-VOLUME), 8 (Monthly Report), 9 (B-GRADE), 12 (career goal tools)
Resultado: Loop fechado warm-up → grind → debrief → semana → mes. Coach vira "presenca viva".

**Sprint Coach-4 — Carreira longa + mental profundo** (2 semanas)
Items: 11 (C-game/Inchworm), 13 (Quarterly Review), 14 (diagnose_plateau), 15 (B-LIFE)
Resultado: Coach vira "tecnico de carreira" verdadeiro. Mental profundo. Diferenciador maximo.

### 4.4 — Quick wins (1-3 dias cada) que cabem em qualquer sprint

- **Citations inline** (D2 backlog) — toda vez que Coach cita numero, append `[fonte: Dashboard > 30d > 142 torneios]`. 1 dia.
- **Confidence tags** (D3 backlog) — ⚠️ amostra <30, ✅ amostra >100. 1 dia.
- **Conversation timeline UI** — cards de relatorios + nudges em ordem cronologica na pagina /coach-ai. 2 dias.
- **Opt-out granular por categoria de nudge** — settings/preferences. 1 dia. **Critico anti-fadiga.**

---

## MODO 5 — Riscos e contraindicacoes

### R1 — Coach invasivo / nag fatigue (RISCO ALTO)

**Sintoma:** notificacoes demais → user desabilita tudo ou cancela conta. Pesquisa 2026 mostra "limit frequency; ensure each nudge adds value; honor preferences" como melhores praticas.

**Mitigacoes obrigatorias:**
- **Opt-in por categoria** desde o primeiro dia. 8 categorias de nudge = 8 toggles.
- **Quiet hours** — sem nudge fora do horario configurado pelo user (default 9-21 timezone local).
- **Frequency cap** — max 3 nudges/dia + max 1 nudge/hora (excluindo eventos criticos como downswing severo).
- **Snooze 1-click** — cada nudge tem botao "nao agora" (1 dia) e "nao por enquanto" (30 dias).
- **Quality bar:** nudges proativos passam por **eval automatica** antes de ir ao user. Anthropic recomenda regression testing especifico para mensagens proativas.
- **Telemetria:** trackear `dismissed`, `engaged`, `unsubscribed_after`. Se >30% dismiss em 7d para uma categoria, congelar e revisar.

### R2 — Custo Anthropic API explode (RISCO MEDIO-ALTO)

**Sintoma:** 1000 usuarios × 4 daily debriefs × $0.013 + weekly $0.045 + monthly $0.110 + nudges = facilmente $1k-2k/mes. Dependendo do ARPU, queima margin.

**Mitigacoes:**
- **Prompt caching** ja entregue (Sprint Coach-1) — 75% de reducao mantida.
- **Haiku para sumarizacao** — nao gerar relatorio inteiro com Sonnet. Estruturar com Haiku, polir com Sonnet so na 3-insights section.
- **Tier gating estrito** — Daily Debrief + Weekly Report so para Premium. Free recebe so Monthly resumido. Pro intermediario.
- **Budget alerts** por usuario — admin dashboard com `cost_per_user_30d`. Outliers (top 1%) revisados manualmente.
- **Fail-soft:** se API der 5xx repetido, gerar relatorio determinstico (template com numeros, sem LLM polish). Avisar user.
- **Dry-run mode** em onboarding — primeiro relatorio e mock para evitar gerar sem o user querer.

### R3 — Acoes erradas (write tools registrando coisa errada)

**Sintoma:** Coach cria sessao errada, registra transacao com numero errado, adiciona torneio errado a grade. Quebra confianca permanente.

**Mitigacoes:**
- **Confirmation obrigatoria** em toda write tool — NUNCA executa sem `requires_confirmation: true` e clique do user.
- **Diff visual** — antes de confirmar, mostrar exatamente o que vai mudar (campos antes/depois).
- **Undo dentro de 5 min** — guardar `payload_before` em `coach_actions` (ja previsto na schema). Botao "desfazer" no card.
- **Audit log persistente** — toda write em `coach_actions` com auditLevel='persist' + result.
- **Rate limit por tool** — max 5 writes/turn (ADR-026 ja existe — manter).
- **Whitelist explicita** de operacoes destrutivas — `delete_*` tools NAO existem v1. So criacao + edicao com diff.

### R4 — Privacidade / consentimento

**Sintoma:** user nao queria que Coach registrasse foco mental, ou puxasse saldo de wallet automaticamente.

**Mitigacoes:**
- **Onboarding consent** — cada categoria de write tool tem toggle no onboarding. Padrao OFF para mental + bankroll, ON para grade + leaks.
- **Audit transparente** — pagina /settings/coach-actions lista TUDO que Coach fez/registrou em ordem cronologica. Filtros + revogar.
- **GDPR-ready:** exportar histori­co de coach_actions em JSON.
- **Data deletion:** quando user deleta sessao/conta, cascade em coach_actions (ja na schema).

### R5 — Falsos positivos em "cobranca" do jogador

**Sintoma:** Coach cobra "voce nao registrou snapshot" mas o snapshot foi feito por outra wallet. User fica irritado.

**Mitigacoes:**
- **Gap-check valida estado real** antes de cobrar — sempre rodar query, nunca confiar em flag stale.
- **Tom gentil + caveat** — "Vi aqui que talvez esteja faltando snapshot — se voce ja fez por outro caminho, ignore."
- **One-shot per cycle** — cobranca acontece UMA vez por ciclo (semana/mes). Re-cobranca so no proximo ciclo.

### R6 — Latencia / UX (relatorio demora demais)

**Sintoma:** Monthly Report leva 60s+ para gerar. User abre, ve loading, fecha.

**Mitigacoes:**
- **Geracao async** — relatorios sao job background, nao on-request. User abre relatorio JA pronto (cache em DB).
- **Nudge em vez de bloqueio** — "Seu relatorio mensal esta pronto" — user clica e ve em <500ms.
- **Progressive rendering** — secoes carregam uma a uma se for streaming.
- **SLA admin:** P95 < 90s. Alert se passar.

### R7 — Limites tecnicos do Claude (context window, tool calls)

**Sintoma:** Quarterly Review precisa de 25 tool calls + sumarizacao de 12 meses de dados — bate limit.

**Mitigacoes:**
- **Hierarchical summarization** — Haiku roda mensalmente sumarizando dados do mes. Quarterly le 3 meses ja sumarizados.
- **Tool batching** — `bulk_query_dimensions(dimensions: string[])` em vez de N chamadas separadas.
- **Limit de 5 tools/turn ja existe** (ADR-026) — para relatorios, fluxo e diferente: orquestrador (job) chama tools antes do LLM ler resultado. LLM recebe payload pronto.
- **Fallback determinstico** — se LLM falhar 3x, render template-only (numeros + tabelas, sem prosa).

### R8 — Coach vira advisor financeiro (regulatorio)

**Sintoma:** Coach diz "vc deve sacar R$ 50k" — user faz, da prejuizo, processa Grindfy alegando "advisor financeiro nao licenciado".

**Mitigacoes:**
- **Disclaimer explicito** em todo output que mencione $/BR — "Esta e uma sugestao baseada em dados, nao advisory financeiro. Decisoes finais sao suas."
- **Tom condicional sempre** — "voce poderia considerar", nunca "voce deve".
- **Limite de claims** — Coach NAO opina sobre tax/regulamentacao/staking deal — deflete para profissional licenciado (Chip Tax citado como referencia BR).
- **TOS update** — Termos de uso refletem "Coach e ferramenta de auxilio analitico, nao substitui assessoria profissional."

### R9 — Ressentimento por tom muito autoritario

**Sintoma:** Coach soa como pai chato. User desliga.

**Mitigacoes:**
- **Tom calibrado por persona do user** — pesquisa Tendler + 888poker mostra goal-setting funciona melhor com tom de pares (peer accountability), nao supervisor.
- **A/B testing de tom** — variantes com mais/menos diretividade. Medir engagement.
- **Personalizacao explicita** — onboarding pergunta "como voce quer ser cobrado? gentil / direto / bruto".

### R10 — Coach falha em entender contexto BR (FX, redes, regulamentacao)

**Sintoma:** Coach trata Suprema como se fosse PokerStars internacional. Ou ignora rakeback.

**Mitigacoes:**
- **Context system prompt enriquecido** com pool intelligence BR (ja parcialmente em H1/H2 do plano 2026-04-24).
- **Tool especifica `query_pool_intelligence(network)`** — devolve metadata sobre rede (skill level, rakeback, FX usado).
- **Validation pelo founder** durante alpha — Coach passa por jogadores BR reais antes de soltar.

---

## Conclusao executiva

**Visao:** transformar Coach IA de **chatbot reativo especializado** em **tecnico de carreira proativo** que (a) cobra dados, (b) gera relatorios automaticos com cobranca pre-relatorio, (c) executa via write tools com confirmacao + undo, (d) ataca dores sistemicas (cruzamentos D2+D9, D4+D10, D6+D7) que ferramentas atuais ignoram.

**3 Sprints sequenciais (Coach-2B → Coach-3 → Coach-4):** ~6 semanas total, dependentes em sequencia. Coach-2B desbloqueia Coach-3 (write tools sao pre-requisito de relatorios com CTA). Coach-4 e o "diferenciador maximo" — Inchworm + Carreira.

**Custo controlado:** ~$430/mes para 1000 premium ativos com prompt caching ja em producao. Tier gating estrito em features caras (Daily Debrief = Premium-only).

**Riscos principais administraveis:** anti-fadiga (R1) e custo (R2) sao os 2 mais agudos — mitigacoes claras e telemetria desde o dia 1.

**Diferenciador competitivo:** nenhum concorrente (SharkScope, PokerCraft, PT4, HM3, GTO Wizard, Aimchess analogo do chess) tem combo de **(a) write tools com undo + (b) relatorios proativos com cobranca pre-relatorio + (c) Mental Hand History + Inchworm digitalizado + (d) consciencia de pool BR**. Spotify Wrapped + Strava Year in Sport mostram que relatorios bem feitos sao **ativos virais** — Annual Poker Wrapped (Coach-4 stretch) pode virar canal de aquisicao.

**Proximo passo:** este documento alimenta `pm-spec` para Sprint Coach-2B (write tools + nudges baixo risco). Apos approval do founder, decompor em RFs detalhadas.

---

## Referencias

### Internas (codigo + docs)
- `Docs/strategy/2026-04-24-coach-ai-optimization-plan.md` — base do upgrade incremental
- `Docs/api/coach.md` + `coach-tools.md` — estado atual de Coach v1 + 2A
- `Docs/architecture/decisions/019-026-*.md` — ADRs ja aprovados (caching, rate limit, tools, page context)
- `memory/coach_optimization_plan_2026-04-24.md` — registro de decisoes anteriores
- `server/coachPrompts.ts`, `coachContext.ts`, `coachLeakDetection.ts`, `routes/coach.ts`, `coachMemory.ts`, `coachTools/handlers/*` — implementacao atual

### Externas (sourced via WebSearch)
- [The Mental Game of Poker — Inchworm Concept (Jared Tendler)](https://jaredtendler.com/the-inchworm-concept/)
- [BlackRain79 — How to Deal With Poker Downswings (2026)](https://www.blackrain79.com/2015/05/how-to-deal-with-poker-downswings-and.html)
- [Cardplayer Lifestyle — 5 Steps to Recovering from a Long Live MTT Downswing](https://cardplayerlifestyle.com/poker-tips-strategy/live-mtt-downswing-steps-to-recover/)
- [mttpokerschool — 7 Top Tips to Survive a Tournament Poker Downswing](https://www.mttpokerschool.com/single-post/otb-018-7-top-tips-to-survive-thrive-during-a-tournament-poker-downswing)
- [poker.org — Mind games: Shining a light on poker's mental health crisis](https://www.poker.org/latest-news/mind-games-shining-a-light-on-pokers-mental-health-crisis-atw9m4F9Vdom/)
- [Smart Poker Study — Your Roadmap to Poker Success in 2026](https://smartpokerstudy.com/your-roadmap-to-poker-success-in-2026/)
- [888poker — Goal Setting for Poker Improvement](https://www.888poker.com/magazine/long-term-short-term-poker)
- [Pinnacle Coaching — Should AI Coaches Wait or Proactively Reach Out?](https://www.heypinnacle.com/blog/what-are-the-benefits-of-proactive-ai-coaching-for-managers-2a90d)
- [CareerVillage Coach Product Update April 2026](https://www.aicareercoach.org/blog/coach-product-update-april-2026) — best practices for proactive AI nudges + quality bar
- [Delenta — AI in Coaching 2026 Trends](https://www.delenta.com/blog/ai-coaching-trends-tools-2026)
- [Element451 — AI Agents Nudge At-Risk Students](https://element451.com/blog/which-ai-agents-help-nudge-at-risk-students-toward-success)
- [SensorTower — Duolingo's Streak Feature: Driving App Engagement](https://sensortower.com/blog/duolingo-streak-feature-app-engagement-growth)
- [Trophy.so — Duolingo Gamification Case Study (2026)](https://trophy.so/blog/duolingo-gamification-case-study)
- [Strava Press — 12th Annual Year in Sport Trend Report](https://press.strava.com/articles/strava-releases-12th-annual-year-in-sport-trend-report-2025)
- [TechRadar — Strava's Year in Sport (Spotify Wrapped for activities)](https://www.techradar.com/computing/software/stravas-year-in-sport-is-rolling-out-now-its-like-spotify-wrapped-for-your-activities)
- [SharkScope AI Coaching Review (2026)](https://www.vip-grinders.com/poker-tools/sharkscope-review/)
- [GTO Wizard 2026 Review (Multiway, Single Size, Trainer)](https://www.vip-grinders.com/poker-tools/gto-wizard/)
- [Chessigma + Chessiro — AI Chess Coach 2026](https://www.chessigma.com/) (analogo chess para Annual Wrapped)
- [Tax Group — IR 2026: precisa declarar premios de bets?](https://www.taxgroup.com.br/intelligence/ir-2026-precisa-declarar-premios-de-bets/) — Brasil tax 2026
- [Wilmaster Travel — Burnout and Addiction in Poker: Mental Health Strategies](https://wilmastertravel.com/poker-wellbeing-guide/)
- [poker.org — 2026 SCOOP prep: Manage your mental bankroll](https://www.poker.org/latest-news/2026-scoop-prep-manage-your-mental-bankroll-aHpdn8e5zXaj/)
- [Trigger.dev — Build and deploy fully-managed AI agents and workflows](https://trigger.dev/) — referencia de infra agentic 2026
- [Fast.io — AI Agent Job Scheduling: Best Patterns for 2026](https://fast.io/resources/ai-agent-job-scheduling/)
