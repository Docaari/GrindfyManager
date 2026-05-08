# Estudos + Stats Analyzer — Research Strategist
> Data: 2026-05-08
> Strategist mode: Auditoria UX + Benchmark + Gerador de Ideias + Priorizacao ICE
> Input: 5 sugestoes founder + estado atual do codigo + benchmark concorrentes
> Output: research base para spec posterior (PM-Spec consome este doc)
> Status: Draft 1 — aguardando revisao founder

---

## 0. Sumario Executivo

A pagina **/estudos** ja foi reformada em 2026-05-01 (Sprint Studies-Reform, ADRs 067-068) e tem hoje shell maduro (sidebar + sub-rotas + dashboard hub-style + Cmd+K + onboarding wizard + streak), workflow Spot↔Tema, Quick Search, recomendacoes server-side. **A funcao primaria do modulo hoje e organizar conhecimento** (temas, spots, materiais), nao **comprovar tempo investido nem direcionar foco mensurable**. As 5 sugestoes do founder atacam exatamente esse gap — transformar /estudos de "biblioteca pessoal" em **assistente de habito de estudo com comprovacao + foco direcionado**.

A pagina **/stats-analyzer** (renderizada via `/estudos/stats` wrapper) ja tem catalogo HUD 217 stats, OCR context-aware, layouts customizados, snapshots + comparacao 3-way, e o sistema **FocusStatToggle** (Sprint home-reform-4 Item 7, ADR-116) com 3 stats max marcadas como "foco do mes" ligadas a tema. **A sugestao "selecionar 3 stats para foco do mes" do founder ja existe parcialmente** — mas o ciclo de evolucao nao esta fechado: nao ha view dedicada de progresso, alerts, nem gancho com Coach/Biblioteca. E a feature esta enterrada no UI (botao por linha de stat), invisivel se voce nao abre cada stat.

**Recomendacao macro:** as 5 sugestoes do founder devem ser implementadas como **um sistema unico ("Plano de Estudo Mensal")**, nao como 5 features soltas. Sao 4 pecas de um mesmo loop semanal:

```
Foco do Mes (3 stats + 3 temas) -> Cronometro/log de tempo -> Consumo Biblioteca conta como estudo -> Insight do spot fecha o loop
                                            ^                                                              |
                                            +--------- Coach ve tudo isso e sugere proxima acao -----------+
```

Esse e o diferencial vs concorrentes: **Hand2Note 4 / PT4 / GTOWizard sao motores de analise. Grindfy vira motor de habito + coaching contextual**. E o que ninguem tem.

---

## 1. Auditoria UX

### 1.1 /estudos (Studies)

**Estado atual:** shell reformado bem implementado. 5 views: Dashboard, Temas, Stats, Spots, Recomendacoes. Cmd+K funciona. Streak existe. Onboarding wizard primeira-vez. Workflow Spot↔Tema funcional via dropdown. Recomendacoes geradas server-side por `studyRecommendationsService.ts` (leaks + stale spots + dormant themes).

#### Friction points

| # | Friction | Severidade | Onde | Por que importa |
|---|----------|------------|------|-----------------|
| **F1** | **Tempo gasto estudando NAO existe como conceito de primeiro nivel** | 5/5 (CRITICAL) | Dashboard `WeekInsights` mostra `hoursStudiedThisWeek` mas o numero nao tem fonte real — vem de `studyMaterials.timeSpent` (legado, manual em minutos) ou esta zerado. Nao existe cronometro principal nem registro de sessao. `StudySessionTimer.tsx` (legado) so funciona dentro de `StudyCardDetail` (modulo antigo, anterior a reforma) | Sem tempo medido o usuario nao sabe se esta estudando o suficiente, nao tem feedback de progresso, e founder nao tem dado pra Coach gerar plano |
| **F2** | **Streak alimenta-se de eventos discretos sem peso (theme open, snapshot create, spot review)** mas sem tempo minimo. Abrir um tema 1s mantem streak | 4/5 | `bumpStudyStreak()` em `usersStorage` ou hook chamado em mount/save. Sem threshold de tempo investido | Streak vira metrica vaidade. Quebra o contrato com usuario serio. Duolingo exige "uma licao" (~2-5min real). |
| **F3** | **Biblioteca/LMS desconectada de /estudos** — assistir aula da Biblioteca (Bloco A "Antes das Cartas") nao registra estudo nem move temas relacionados | 4/5 | `client/src/pages/biblioteca/*` consume tracking proprio (focusStats), `studyMaterials` legado nao se conecta com Mux progress | Founder tem o melhor conteudo (curso proprio) e nao alimenta o sistema de habito. Duplicacao silenciosa. |
| **F4** | **Recomendacoes dao acao mas nao sugerem PLANO** | 3/5 | `RecommendationsPreview` lista items individuais (leak X, spot Y, tema Z) com CTA isolado. Nao agrupa em "esta semana estude isso pra atacar leak X" | Usuario precisa montar mentalmente o plano. Coach poderia gerar mas nao gera. |
| **F5** | **Spot tem `notes` (max 500) e `conclusion` mas nao tem campo "insight/aprendizado"** com semantica forte | 3/5 | Schema `starredHands.notes` (texto livre 500ch) + `conclusion` (texto). Sem distincao entre "anotacao tecnica" vs "aprendizado generalizavel". Nao indexavel pra recall | Spots viram graveyard. Insight nao reaparece em sessao futura. Sem busca semantica. |

#### Duplicacoes/sobreposicoes detectadas

- `studyMaterials.timeSpent` (legado) vs `studyMaterials.status` (legado) vs `studySessions.duration` (legado, vem de StudySessionTimer) vs **zero** registro real moderno. **Tres caminhos morrendo, nenhum vivo.**
- `studyThemes.progress` (campo persistido) — preenchido por o que? Nao ha auto-update visivel. Provavelmente stale.
- `RecommendationsPreview` mostra leaks **+** `WeekInsights` mostra metricas **+** `ContinueWhereLeftOff` mostra temas — 3 cards no dashboard, todos respondem a pergunta parecida ("o que devo fazer agora?") sem orquestracao.

### 1.2 /stats-analyzer (StatsAnalyzerTab)

**Estado atual:** catalogo 217 stats / 16 grupos, 4 views (Hand2Note grouped, OCR, Compare 3-way, List). Filtros persistidos em localStorage. Layouts customizaveis. OCR context-aware extrai do print do tracker. **FocusStatToggle por linha de stat** marca ate 3 stats foco do mes (Sprint home-reform-4 Item 7).

#### Friction points

| # | Friction | Severidade | Onde | Por que importa |
|---|----------|------------|------|-----------------|
| **S1** | **FocusStat invisivel sem rolar pelas stats** — botao esta em cada row do HudGroupedView. Nao tem header com "Suas 3 stats foco do mes: X, Y, Z" | 4/5 | `StatsAnalyzerTab.tsx` nao tem secao top-level mostrando as 3 marcadas. So `home-reform-4-item-7` exibe no widget Home | Feature subutilizada. Founder marcou? Onde aparece? |
| **S2** | **Sem grafico de evolucao por stat ao longo do tempo** | 4/5 | `SnapshotComparator` compara 2 snapshots. Compare 3-way (V3) compara 3. Mas nao ha **timeline** nativa "essa stat ao longo dos 6 meses" pra stat foco | Foco do mes existe mas nao mostra "estou melhorando?". Faltou o feedback loop. |
| **S3** | **Sem alerts/threshold** — se C-bet flop foco caiu 8% vs mes passado, sistema fica mudo | 4/5 | Nenhum endpoint detecta delta + notifica. `home-reform-4 Item 7` mostra delta no widget Home mas e passivo | Stats foco existem pra monitorar. Sem alert sao apenas decoracao. |
| **S4** | **OCR upload exige usuario abrir tracker, fazer print, subir arquivo** — friccao alta para snapshot semanal | 3/5 | `HudOcrUpload` aceita imagem. UX bom, mas e ato consciente. | Para grinder serio, snapshot semanal vira skip. |
| **S5** | **3-way compare e poderoso mas escondido atras de "selecione 2 snapshots"** sem default sugerido | 3/5 | View `compare` exige escolher snap1 + snap2 manualmente. Nao auto-seleciona "ultimo vs 3 meses atras" | Power feature subutilizada. |

#### Cross-page issues

- /estudos/stats ja **wrappa** StatsAnalyzerTab + adiciona breadcrumb + botao "Sugerir temas baseado em leaks". Bom. Mas nao integra **FocusStat** com **studyThemes** alem do dialog de pick (que ja existe ADR-116). Nao ha view "essa stat foco esta vinculada a esse tema, ja revisou X aulas, Y spots, Z horas".
- **Migration 0021 study_theme_spot_links** + **userFocusStats** + **studySessions** existem mas nao sao orquestrados. Cada tabela vive sua propria vida.

---

## 2. Benchmark Competitivo

| Ferramenta | Estudo (tempo, log) | Foco em stats | Spot insight | Plano semanal | Replicar? |
|------------|---------------------|---------------|--------------|---------------|-----------|
| **Hand2Note 4** | Nao explicito. Smart Reports + LeakFinder addon detectam leak mas nao registram tempo de estudo. | Sim — LeakFinder destaca top stats com problema. Sem "marcar foco" formal. | Notas em mao via replayer + tags. Sem reentry/aprendizado estruturado. | Nao | **Replicar:** auto-detectar top 5 leaks por severidade. **Nao replicar:** UX desktop pesado. |
| **PokerTracker 4** | Nao. PT4 e database engine + HUD. Estudo = abrir replayer, sem tracking. | Filtros e relatorios poderosos. Sem "foco do mes". | Notas em hand history. Sem semantica. | Nao | **Replicar:** filtragem rapida por leak. **Nao replicar:** ausencia total de habito. |
| **Hold'em Manager 3** | Nao. Identico ao PT4. | Idem. Sem foco. | Idem. | Nao | Idem PT4. |
| **PokerCraft (GGPoker)** | Nao. Tracking integrado a rede, sem habito. | Smart HUD posicional. Nao tem "foco mensal". | Notas via Smart HUD hover. Sem learning loop. | Nao | **Replicar:** position-based breakdown ("voce e -EV em UTG"). **Nao replicar:** lock-in a uma rede. |
| **GTO Wizard** | **SIM — Trainer dashboard mostra "study sessions" (sets de mao trabalhados) + accuracy.** Mobile app 2026 com badges. | Trainer destaca onde voce erra mais (proxy de leak). Sem "foco de stat" classico. | Cada hand do Trainer guarda EV loss + tag mistake. Reentry via filter. | **Sim — Study Plans por formato (MTT/Cash/Spin) com playlist linear.** | **REPLICAR forte:** Study Plan estruturado + dashboard de progresso. Acuracidade por categoria. **Nao replicar:** custo, foco GTO solver (off-topic Grindfy). |
| **Run It Once / The Vault** | Limitado — assistir video, sem tempo medido publicamente. | Nao. Curadoria por tags ("3-bet pots", "ICM"). | Comments na aula. Sem learning loop forte. | **Sim — Learning Paths organizam videos em sequencia com 30+ tags.** | **REPLICAR:** Learning Paths como agrupador (Biblioteca ja faz com Bloco A). Curadoria por tag. |
| **Anki / spaced repetition** | **SIM — algoritmo SM-2 calcula proxima revisao.** Stats de retention. | N/A | **Forte — flashcard com pergunta/resposta forca recall.** | Implicito (deck do dia) | **REPLICAR forte para Spots:** quando vc marca "fracco aqui", spot reaparece em 1d/3d/7d/30d ate dominar. Esse e o killer feature copy. |
| **Duolingo** (cross-domain) | **SIM — streaks, daily goal (5/10/15/20min), xp, leagues.** | Skill tree com unidade ativa. | Mistakes loop ate dominar. | **Sim — Path linear forcado.** | **REPLICAR:** streak freeze (perder streak por 1 dia nao zera), daily goal calibravel, XP por minuto/atividade. **Cuidado:** nao virar gamefication infantil pra publico pro. |

### Padroes de mercado que VALEM REPLICAR (top 5)

1. **Study Plans/Paths** (GTO Wizard, RIO): playlist linear estruturada por formato. Grindfy ja tem com Biblioteca/Bloco A — falta wirar "consumo de aula = estudo logado".
2. **Spaced repetition em spots** (Anki): spots problematicos reaparecem ate o user marcar dominio. Killer feature — **ninguem no mercado de poker tem isso.**
3. **Daily goal calibravel em minutos** (Duolingo): user define meta diaria (10/20/30min). Streak so conta se atingiu meta. Resolve F2 (streak vazia).
4. **Stats em foco com timeline + alert** (Hand2Note Smart Reports adapted): grafico evolucao + notify quando degrada. Resolve S2 + S3.
5. **Coach contextual sugere proxima acao** (Duolingo "next lesson", GTO Wizard mistake review): no Grindfy ja temos Coach AI — falta gerar plano semanal automatico.

### Padroes para IGNORAR

- Leagues/competicao social (Duolingo) — publico pro nao quer competir publico em poker amador.
- Gemstones/lives (Duolingo) — infantil demais. Streak + XP basta.
- Solver-as-trainer (GTO Wizard) — off-topic. Grindfy nao e solver.
- Replayer de mao integrado (PT4/H2N) — fora de escopo. Coach pode comentar mao via texto/print, sem replayer.

---

## 3. Expansao das 5 Sugestoes do Founder

### Founder #1 — Marcar tempo gasto com estudo durante a semana

**Expandido em: "Cronometro + Sessao de Estudo"**

**O que faz.** Botao flutuante sticky "Iniciar sessao de estudo" no shell `/estudos/*`. Click abre modal compacto com: nome (auto: "Sessao de [tema atual] - [horario]") + tema vinculado (dropdown opcional) + tipo (review spots / theory / aula biblioteca / drill GTO / OCR snapshot). Cronometro corre. User pode pausar, retomar, parar. Ao parar, salva em `studySessions` (tabela ja existe) com `duration`, `themeId`, `activities`. **Background tracking** se possivel: if user ja esta dentro de `/estudos/temas/:id` ou `/biblioteca/curso/X/Y/play` por >2min, oferece "voce esta estudando ha X min, registrar?" (auto-prompt, nao auto-save sem consent).

**Gancho de retencao.** Tempo investido = comprovacao concreta. Founder ve no fim da semana "estudei 4h27min" e sente progresso. Streak fica honesto (so conta se sessao >meta diaria).

**Metrica de sucesso.** % usuarios Pro/Premium que registram >=1 sessao/semana. Target inicial: **45% W4 entre quem completou onboarding** (benchmark Duolingo D7 streak ~38%, mas publico Grindfy mais focado). Tempo medio sessao: **alvo 25min** (suficiente pra tema curto, abaixo de pomodoro classico).

**Esforco.** Medio (3-5 dias dev). Tabela `studySessions` ja existe (legado mas underused). UI: 1 componente sticky + 1 modal + 1 endpoint POST + integracao com streak. Reuso: `StudySessionTimer.tsx` ja escrito — refactor em vez de criar novo.

---

### Founder #2 — Botao para registrar estudo realizado (log manual)

**Expandido em: "Quick Log"**

**O que faz.** Atalho rapido pra quem **nao usou cronometro mas estudou** (ex: leu artigo no celular, viu video no Twitch). Botao "Registrar estudo" no Dashboard. Form minimo: tipo (review / theory / aula biblioteca externa / outro) + duracao em min (15/30/45/60/custom) + tema (opcional) + 1 linha de aprendizado (opcional). Persiste em `studySessions` com `source: 'manual'`.

**Gancho de retencao.** Nao penaliza estudo fora-da-plataforma. Reduz leak de retencao (usuario quase saiu porque "esqueci de logar"). Pattern Habitica/Things3.

**Metrica de sucesso.** % de sessoes manuais vs cronometradas: alvo **60% manuais / 40% cronometradas** (manuais = baixa friccao, predominam). Quem usa qualquer dos dois eh "ativo" no modulo.

**Esforco.** Baixo (1-2 dias). Reaproveita endpoint do #1.

**Anti-pattern a evitar.** Nao validar duracao server-side (user pode inflar 240min "aprendi tudo") — confiar mas exibir media + outliers no Coach. Confianca = adesao.

---

### Founder #3 — Biblioteca integrada com aba Estudos

**Expandido em: "Aula assistida = Estudo registrado"**

**O que faz.** Quando user assiste aula da Biblioteca (Mux player, ja tem `useCoachRecommendationConsume` + watermark + tracking), **a duracao assistida e auto-logada** em `studySessions` com `source: 'biblioteca'`, `materialId: <lessonId>`, `themeId: <tema vinculado a aula>` (mapping em `lessonThemeMap` novo). Aula pertence a um curso (Bloco A: "Antes das Cartas"). Mapping curso↔tema configurado server-side por admin (founder define ao publicar curso). Bonus: aba "Estudos" dentro de Biblioteca mostra "Voce assistiu 3h12min / 4h da aula X. Ainda faltam 2 episodios."

**Gancho de retencao.** Closed loop. Founder cria conteudo proprio, conteudo gera engajamento na Biblioteca, engajamento alimenta /estudos, /estudos joga proximo episodio na timeline. Hook model perfeito (Trigger=push notif > Action=play > Reward=video qualidade > Investment=progresso registrado).

**Metrica de sucesso.** **% conclusao de curso entre usuarios que iniciam: alvo 60%** (vs 15% MOOC industria padrao — Coursera ~12%, Khan ~25%). Diferencial: integracao com habito = consumo natural. Hours-watched-per-active-user-week: alvo 1h+.

**Esforco.** Medio (3-4 dias). Hook ja existe (`useCoachRecommendationConsume` no Mux). Falta: tabela `lesson_theme_map` ou coluna `studyThemeId` em `library_lessons`; trigger `on lesson progress >= 80%` cria `studySessions` automatico; endpoint admin pra mapping.

**Riscos.** Se aula tem 60min mas user pula, nao logar 60min — logar so `progressTimeWatched`. Coach precisa diferenciar "viu aula" de "completou aula".

---

### Founder #4 (Stats Analyzer) — Selecionar 3 stats para foco do mes

**Expandido em: "Mensal Stats Focus + Evolution View"**

**Estado atual:** parcialmente implementado em `home-reform-4 Item 7` (ADR-116). Existe `userFocusStats` table, `FocusStatToggle` por stat, dialog pra picar tema. Limite 3/mes enforced. **O QUE FALTA:**

1. **Header dedicado em /stats-analyzer** ("Suas 3 stats foco de Maio") com cards visiveis sem scroll. Lesson #11 (sem default actions) — apresentar dado, nao decorar. Cada card: stat name + valor atual + delta vs mes anterior + tema vinculado + CTA "Ver evolucao".
2. **Evolution view** — grafico timeline (8 semanas ou 6 meses) da stat foco. Reuso parcial de `MonthEvolutionChart` (home item 9). Snapshot data ja existe em `hud_stat_snapshots` (Sprint Stats-V2/V3).
3. **Auto-suggest de stats foco** — botao "Sugerir 3 stats" baseado em `getStatsLeaks()` top severity. Reduz cold-start ("nao sei o que escolher").
4. **Monthly review trigger** — fim de mes, banner "Maio acabou. Sua C-bet OOP melhorou 4.2%, BB/100 piorou. Revisar foco de Junho?" (ADR-116 ja prepara via tabela mensal).

**Gancho de retencao.** Foco mensal cria ciclo recorrente (volta no dia 1 pra novo cycle, dia 30 pra review). Loop nivel macro. Combina com Coach que pergunta semanalmente "como esta sua C-bet OOP?".

**Metrica de sucesso.** % usuarios Pro/Premium com 3 stats marcadas: alvo **70% (90 dias)**. % que renovam foco em novo mes: alvo **55% retention M2**. Delta absoluto medio em stats foco vs nao-foco: alvo **+30% melhoria** (validacao de que foco funciona).

**Esforco.** Medio (4-5 dias). Reuso forte do existente. Migration ja aplicada. Faltam: header + chart + auto-suggest + monthly review banner + scheduled job (cron) pra gerar review.

---

### Founder #5 — Perguntar e manter salvo insight do spot

**Expandido em: "Spot Learning Loop + Spaced Reentry"**

**O que faz.**

**A. Insight estruturado (quando vc revisa spot).** Hoje `starredHands` tem `notes` (500ch) + `conclusion` (texto). Adicionar **3 campos novos** no SpotReviewCard:
- `learning` (text 1000ch): "qual o aprendizado generalizavel?" (nao a resposta tecnica do spot, e o **principio**)
- `confidenceLevel` (1-5): "quao confiante voce esta nessa decisao?"
- `tags` (array): tags livres (ex: "OOP-bet-sizing", "ICM-bubble", "small-blind-defend")

**B. Busca semantica.** Pagina `/estudos/spots` ganha search bar que indexa `notes + learning + tags + theme.name`. Filtros: por tag, confidence, idade, tema. **Coach AI tool** `search_spot_insights(query)` retorna top 5 — Coach usa em respostas contextuais.

**C. Spaced reentry (Anki-like).** Spot com `confidenceLevel <= 3` reaparece como "Card pra revisar" em sequencia 1d/3d/7d/14d/30d. Sistema mostra o spot novamente (so o print + pergunta "lembra do que decidiu?"), user responde "ainda confio na decisao / nao confio mais". Confidence sobe ou desce. Ao chegar em confidence 5 + 3 reviews = spot vai pra "dominado".

**D. Insight no Coach.** Ao user perguntar Coach "como jogar BB vs SB 3bet com middle pocket pair?", Coach acessa via tool todos spots tagged `BB-defense` + extrai padrao dos `learning` campos. Resposta personalizada pelo proprio aprendizado do user.

**Gancho de retencao.** Spot vira ativo (nao passivo). Toda revisao gera insight reutilizavel. Coach fica bom porque tem corpus de aprendizados do proprio user. Pattern killer = spaced reentry — usuario volta toda quinta-feira (Anki habit).

**Metrica de sucesso.** % spots com `learning` preenchido: alvo **50%** (atual ~0%). Spots ressuscitados via reentry: **3-5/semana usuario ativo**. Coach answers que citam spot proprio: **+40% engajamento Coach**.

**Esforco.** Alto (8-12 dias). Schema migration (3 campos + spot_review_schedule table). Algoritmo SM-2 simplificado. Search semantica (pode comecar full-text Postgres `to_tsvector` antes de embeddings). Coach tool nova. UI: redesign SpotReviewCard + Reentry queue page.

**Riscos.** Search dificil sem embeddings. Comecar com FTS Postgres (pt-BR config), embeddings em fase 2. Spaced reentry pode irritar (notif demais) — abstract via "max 3 spots/dia em queue".

---

## 4. Ideias Adicionais (Gerador)

Geradas cruzando dados internos + benchmarks + os ganchos das sugestoes founder.

### Ideia 1 — Plano de Estudo Semanal Gerado pelo Coach

**O QUE.** Toda segunda 9h, Coach AI gera plano de 7 dias customizado: "Esta semana: 2h em C-bet OOP (foco do mes), revisar 5 spots BB-defense, assistir Bloco A Ep5 + Ep6, 1 snapshot HUD na sexta". Apresentado como checklist no Dashboard /estudos. Item completo = check + XP. Plano regenera segunda seguinte com base em adesao + leaks atualizados.

**POR QUE.** Padrao GTO Wizard Study Plan + Duolingo daily goal. Resolve F4 (recomendacoes individuais sem plano). Coach ja tem contexto, falta a programacao temporal.

**ICE preliminar** Impact 5, Confidence 4, Effort 3 → **4.0** (alto). 5-7 dias dev. Cron + endpoint + UI checklist + Coach prompt extension.

---

### Ideia 2 — Stats Foco visiveis em TODO o produto

**O QUE.** As 3 stats foco do mes aparecem como badges em: header Dashboard /estudos, header /grind-live (durante sessao live), header pagina /dashboard (analytics), tooltip sobre torneio na grade. Sempre que aparece, mostra valor atual + delta vs mes anterior + cor verde/vermelho.

**POR QUE.** Foco precisa estar **sempre visivel** pra virar lente. Hoje so aparece em 1 widget Home. Reforca habito.

**ICE.** Impact 4, Confidence 5, Effort 2 → **3.67**. 2-3 dias. Reuso de FocusStatToggle + endpoint ja existente.

---

### Ideia 3 — Biblioteca recomenda aula baseada em leak detectado

**O QUE.** Quando Stats Analyzer detecta leak severo (ex: C-bet flop OOP 28% — abaixo de baseline 38%), sistema cruza com `lesson_theme_map`. Se Bloco A Ep4 tem `theme: c-bet-oop`, exibe banner em /estudos/recomendacoes: "Voce tem leak em C-bet OOP. Bloco A Ep4 cobre exatamente isso. Assistir agora?". Click abre Mux player com tracking auto (Founder #3 wired).

**POR QUE.** Closed-loop full: leak -> aula recomendada -> aula assistida -> stats melhorados -> dado pro proximo cycle. ICE muito alto se Biblioteca crescer.

**ICE.** Impact 5, Confidence 4, Effort 3 → **4.0**. 4-5 dias. Depende de Founder #3.

---

### Ideia 4 — "Cooldown coach insight" pos-sessao live

**O QUE.** Ao finalizar sessao em /grind-live (ja existe handler finalize), Coach gera mini-insight 30s: "Voce jogou 4h, registrou 12 spots, sua winrate hoje foi 8.5bb/100. Top 1 spot pra revisar: [link]. Stat foco que mais apareceu: c-bet flop OOP — reviste no /estudos/stats. Quer adicionar `learning` aos 3 spots agora?". Botao adiciona quick-log (Founder #2).

**POR QUE.** Aproveita momento high-engagement (acabou sessao, esta na frente do PC). Spots ainda quentes. Coach contextual real. Vira gateway natural pra /estudos.

**ICE.** Impact 5, Confidence 3, Effort 3 → **3.67**. 4-5 dias. Coach tool nova + handler finalize.

---

### Ideia 5 — "Daily goal" calibravel + streak honesto

**O QUE.** User define meta diaria em min na Settings: 10/20/30/45/60. Streak so conta dia que atingiu meta. "Streak freeze" automatico (1 dia missed nao zera, mas nao acumula). Pattern Duolingo. Visual: barra de progresso pequena no header sidebar Studies "Hoje 18/30min".

**POR QUE.** Resolve F2 (streak vazia). Da significado a cada minuto. Aumenta retencao D7/D14.

**ICE.** Impact 5, Confidence 5, Effort 2 → **4.0**. 2-3 dias. Setting + integration com Founder #1+#2.

---

### Ideia 6 — Spot Review Queue (Anki) standalone

**O QUE.** Aba "Revisar" em /estudos/spots mostra fila do dia: 3-5 spots (mix de spaced reentry + recentes nao revisados + flagged por Coach). User passa por cada um: ve print, lembra contexto, escreve `learning` (Founder #5), marca confidence. Apos 3 revisoes/dia, ganha XP + completa goal.

**POR QUE.** Killer feature. Concorrentes nao tem. Combina #5 + reentry. Cria diario hook.

**ICE.** Impact 5, Confidence 4, Effort 4 → **4.33**. 7-10 dias. Subset de Founder #5 mas como standalone view.

---

### Ideia 7 — "Compare meu foco com a media Pro" (anonimo)

**O QUE.** Em cada stat foco, mostrar "Sua C-bet OOP: 32% / Media Pro Grindfy: 38%". Dados anonimos agregados de users plan Premium. Cohort por buy-in (low/mid/high) pra ser justo.

**POR QUE.** Benchmark social = motivacao. Sem leaderboard publico (anti-pattern p/ poker pro). Foco em learning, nao em vaidade.

**ICE.** Impact 4, Confidence 3, Effort 3 → **3.33**. 5-6 dias. Endpoint agregado + privacy compliance.

---

### Ideia 8 — Coach genera "Review do mes" auto

**O QUE.** Dia 1 de cada mes, Coach envia notif "Seu Maio em poker: estudou 18h45min, 92 spots revisados, C-bet OOP +4.2%, BB/100 -2.1%. Maior win: Ep5 Bloco A + 14 spots small-blind defend. Maior gap: nao revisou stats foco semana 3-4. Sugestao Junho: trocar BB-defense por 3bet pots (severity 4 nos seus dados). Aceitar?". Click aplica novo plano + foco stats.

**POR QUE.** Loop mensal mais alto-nivel. Cobertura de ciclos longos. Cria expectativa "dia 1 do mes = grindfy review". Hook calendario.

**ICE.** Impact 5, Confidence 3, Effort 3 → **3.67**. 4-5 dias. Cron + Coach prompt + UI banner + accept handler.

---

## 5. Tabela ICE Final (Founder + Geradas)

| ID | Ideia | Impact (1-5) | Confidence (1-5) | Effort inv (1-5, 5=baixo esforco) | Score | Esforco real |
|----|-------|:-:|:-:|:-:|:-:|---|
| **ID6** | **Spot Review Queue (Anki)** | 5 | 4 | 2 | **4.33** | 7-10d |
| **F1** | **Cronometro/sessao estudo** (Founder #1) | 5 | 5 | 3 | **4.33** | 3-5d |
| **F4** | **Stats Foco mensal — header + evolution + auto-suggest** (Founder #4 expandido) | 5 | 5 | 3 | **4.33** | 4-5d |
| **ID1** | **Plano semanal Coach** | 5 | 4 | 3 | **4.0** | 5-7d |
| **ID3** | **Biblioteca recomenda aula por leak** | 5 | 4 | 3 | **4.0** | 4-5d (depende F3) |
| **ID5** | **Daily goal + streak honesto** | 5 | 5 | 4 | **4.67** | 2-3d |
| **F3** | **Biblioteca = estudo logado** (Founder #3) | 5 | 4 | 3 | **4.0** | 3-4d |
| **F2** | **Quick log manual** (Founder #2) | 4 | 5 | 5 | **4.67** | 1-2d |
| **F5** | **Spot insight + busca + reentry** (Founder #5) | 5 | 3 | 1 | **3.0** | 8-12d |
| **ID4** | **Coach insight pos-sessao live** | 5 | 3 | 3 | **3.67** | 4-5d |
| **ID8** | **Review mensal Coach** | 5 | 3 | 3 | **3.67** | 4-5d |
| **ID2** | **Stats Foco visiveis em todo produto** | 4 | 5 | 4 | **4.33** | 2-3d |
| **ID7** | **Compare com media Pro** | 4 | 3 | 3 | **3.33** | 5-6d |

> Nota: Effort invertido (5 = mais facil) entra no ICE. Effort real esta na ultima coluna pra estimativa.

---

## 6. Top 8 Recomendacoes para Spec (priorizadas)

Em ordem de execucao logica (dependencias respeitadas):

### Tier 1 — Foundation (sprint 1, ~2 semanas)

1. **F1 — Cronometro/Quick log unificado** (combina Founder #1 + #2 + ID5 daily goal). Tudo num so RF: cronometro sticky + quick log dialog + meta diaria settings + streak honesto. Mata 3 ideias, ICE medio 4.5, esforco combinado ~5-7 dias. **Justificativa:** sem isso nada do resto faz sentido — toda outra ideia depende de "tempo gasto" como metrica primaria.

2. **F4 — Stats Foco mensal completo** (Founder #4 expandido: header + evolution chart + auto-suggest + monthly review banner). ICE 4.33, ~4-5d. **Justificativa:** sistema ja parcialmente implementado (ADR-116). Custo marginal baixo, valor alto. Cria a "lente" foco que acompanha tudo.

3. **ID2 — Stats Foco visiveis no produto inteiro** (badges em /grind-live, /dashboard, /grade-planner). ICE 4.33, ~2-3d. **Justificativa:** alavanca F4. Custo trivial.

### Tier 2 — Loop fechado (sprint 2, ~2 semanas)

4. **F3 — Biblioteca = estudo logado** (Founder #3, lesson_theme_map + Mux progress trigger). ICE 4.0, ~3-4d. **Justificativa:** unifica Biblioteca com /estudos. Pre-requisito de ID3.

5. **ID3 — Biblioteca recomenda aula por leak** (closed loop leak → aula → consumo → registro → stats). ICE 4.0, ~4-5d. **Justificativa:** killer feature do conteudo proprio. Diferencia Grindfy de qualquer concorrente.

6. **ID1 — Plano semanal Coach** (cron + checklist + Coach prompt). ICE 4.0, ~5-7d. **Justificativa:** orquestra tudo acima em ritmo recorrente. Alto investment do user (checklist marcado = comprometido).

### Tier 3 — Killer (sprint 3, ~2 semanas)

7. **F5 + ID6 — Spot Learning Loop + Anki Reentry** (Founder #5 + Spot Review Queue). Combinar pq sao a mesma feature. ICE 3.0/4.33, ~10-14d. **Justificativa:** a unica feature 100% defensavel — ninguem no mercado de poker tem spaced reentry de spots com Coach contextual. Vale o esforco.

8. **ID4 — Coach insight pos-sessao live** (handler finalize + Coach tool + UI 30s). ICE 3.67, ~4-5d. **Justificativa:** completa o loop "live → estudos" e captura usuario no momento de maior engagement.

### Deferidos (consideracao Q3)

- **ID7** — Compare com media Pro (precisa cohort denso + privacy review).
- **ID8** — Review mensal Coach (depende de ID1 maduro).

---

## 7. Riscos e Anti-patterns a Evitar

### R1 — Gamificacao excessiva contraproducente
Publico Pro/Premium NAO quer leagues, gemstones, animacoes infantis. Risco: copiar Duolingo demais. **Mitigacao:** usar streak + XP discretos. Sem leaderboard publico. Sem mascote. Estetica continuar dark/profissional.

### R2 — Duplicar funcao com Coach
Coach ja responde "o que estudar?". Se Plano Semanal (ID1) e UM dos outputs do Coach mas em formato programado, tudo bem. Se vira engine separado que duplica logica de recomendacao, perde. **Mitigacao:** ID1 chama Coach internamente — Coach gera, sistema temporiza.

### R3 — Streak punitivo perde retencao
Quebrar streak por 1 dia missed = user desiste. Duolingo descobriu isso e implementou Freeze. **Mitigacao:** ID5 inclui freeze automatico (1 dia gratis/semana, ate 2 acumulados).

### R4 — Cronometro vira friccao se obrigatorio
Forcar cronometro pra todo estudo cria atrito. **Mitigacao:** Quick log F2 sempre disponivel como atalho. User escolhe metodo.

### R5 — Spaced reentry overflow
Anki classico pode acumular 50+ cards/dia se user falta 1 semana. Frustrante. **Mitigacao:** cap maximo 5 spots/dia em queue. Spots overflow viram "marcados pra rever quando der" sem hard schedule.

### R6 — OCR friction permanece
F4 melhorias nao resolvem que snapshot ainda exige usuario abrir tracker + print. **Mitigacao:** fora de escopo desta sprint. Ideia futura: extensao Chrome que captura HUD do tracker (research separado).

### R7 — `studyMaterials` legado vs `studySessions` legado vs `library_progress` (Mux)
Tres tabelas tocando "tempo de estudo". F3 pode aumentar entropia. **Mitigacao:** declarar `studySessions` como SSoT. `studyMaterials.timeSpent` deprecado (manter so pra historico). Mux progress alimenta `studySessions` via trigger, nao se torna SSoT.

### R8 — Coach prompt cresce demais com novas tools
F5 + ID4 + ID8 adicionam ~4 coach tools novas. Latency + custo. **Mitigacao:** lazy loading de tools por contexto de pagina (ja feito no Coach 2A). Se user esta em /estudos, so carrega tools relevantes.

### R9 — Migration grande em prod
F1+F3+F4+F5 somam: nova coluna em starredHands, nova table spot_review_schedule, lesson_theme_map, settings.daily_goal_minutes, possivelmente lesson_progress_events. ~5 migrations. **Mitigacao:** consolidar em 2 migrations + back-fill scripts em tsx.

### R10 — Founder vai usar primeiro, gostar muito, mas N=1 enviesa
Risco classico. **Mitigacao:** ao soltar pra outros usuarios Pro/Premium beta, fazer 5min interview por feature. Validar #5 (insight) com 3 usuarios reais antes de spaced reentry.

---

## 8. Resumo Caveman (founder pediu)

```
prob = /estudos org. bem mas nao mede tempo nem fecha loop
prob2 = /stats foco existe escondido, sem evol, sem alert
prob3 = biblioteca grand, isolada, nao alimenta habito
prob4 = spot graveyard, sem learning loop
prob5 = coach forte, sem plano programado

5 ideia founder = 1 sistema "Plano Estudo Mensal"
3 stats foco -> 3 tema vinculado -> meta diaria min -> aula assistida = log -> spot revisado = insight + reentry -> coach orquestra tudo

bench: GTOWizard study plan + Anki reentry + Duolingo streak honesto + RIO learning paths
copia: spaced reentry spot (NINGUEM tem), study plan estruturado, daily goal calibravel, foco stat com timeline
ignora: leagues, gemstones, solver-trainer, replayer

top 8 spec:
1 cronometro+log+meta (5-7d)
2 stats foco mensal completo (4-5d)
3 stats foco em todas pag (2-3d)
4 biblio = log (3-4d)
5 biblio reco por leak (4-5d)
6 plano semanal coach (5-7d)
7 spot insight + reentry anki (10-14d) <- killer
8 coach pos-sessao live (4-5d)

risco: nao virar duolingo infantil, nao duplicar coach, streak nao punitivo, cronometro opcional, reentry cap 5/dia
```

---

## 9. Proximos Passos

1. Founder le e valida priorizacao (especialmente Tier 1 first).
2. Se ok, **PM-Spec** consume este doc + gera spec executavel para Sprint **Tier 1** (F1+F4+ID2 unificados em "Sprint Estudos-Habito-1"). 
3. Em paralelo, founder pode validar com 2-3 users Pro a hipotese de Tier 3 (spot insight) via pesquisa qualitativa rapida (15min cada).

---

Sources benchmark:
- [Hand2Note Review 2026 (PokerListings)](https://www.pokerlistings.com/poker-tools/trackers/hand2note)
- [PokerTracker 4 Review 2026 (vip-grinders)](https://www.vip-grinders.com/poker-tools/pokertracker-4-review/)
- [GTO Wizard Trainer (PokerNews)](https://www.pokernews.com/poker-tools/gto-wizard/trainer.htm)
- [Run It Once Plans](https://www.runitonce.com/register/plans-and-pricing/)
- [Anki spaced repetition for poker (premiumpokertools)](https://premiumpokertools.com/blog/spaced-repetition-and-poker)
- [Duolingo streaks design (Lenny's Podcast/Medium)](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)
- [Gamification online poker (europeangaming)](https://europeangaming.eu/portal/latest-news/2025/08/22/189908/why-gamification-is-reshaping-online-poker/)
- [PokerCraft GGPoker (worldpokerdeals)](https://worldpokerdeals.com/blog/ggpoker-pokercraft-review)
- [DriveHUD review 2026 (plo365)](https://www.plo365.com/tools-and-huds/drivehud-review/)

---

## 9. Refinement — Drills + Modos + Dual Registration (2026-05-08 v2)

> Founder validou direcao geral mas trouxe contexto novo CRITICO. Esta secao refina o desenho original (especialmente F1+F2 e ICE Tier 1).

### 9.1 Mudanca conceitual: NAO eh um cronometro live primeiro

A versao 1 deste doc colocou cronometro como acao primaria (founder #1). **Refino agora:** maioria dos estudos sao **POS-HOC** (jogador registra DEPOIS de ja ter estudado, manualmente). Live (cronometro rodando) eh **opcao secundaria** pra quem ja sabe que vai entrar em sessao dedicada. Isso muda dramaticamente o desenho:

| Antes (v1) | Agora (v2) |
|---|---|
| Botao primary "Iniciar Cronometro" sticky | Botao primary "**Registrar Estudo**" (abre form post-hoc) |
| Quick log = atalho secundario | Post-hoc = caminho default |
| Cronometro = experiencia central | Cronometro = checkbox "Comecar agora com cronometro" no mesmo form |
| F2 (Quick log) era ESforco baixo / valor 4 | F2 fundido no F1: virou MESMA feature |

**Justificativa.** Founder relatou comportamento real: "abro Twitch, vejo Bencb live por 1h, depois lembro de logar." Ou "fiz drill no GTO Wizard meia hora, entao registro." Quase nunca alguem decide "vou abrir Grindfy agora pra estudar 30min com cronometro". Friccao alta.

**Implicacao de UX.** Form de log eh a entrada principal. Cronometro vira feature opt-in dentro do mesmo form (toggle "Comecar agora cronometrado"). Quem precisa medir tempo real ainda tem. Quem so quer registrar nao gasta clique extra.

---

### 9.2 Os 4 modos primarios + 1 escape hatch

Founder definiu **4 tipos primarios** de estudo + 1 fallback:

| # | Modo | Tema | Duracao tipica | Inspiracao | Escopo Grindfy |
|---|------|------|----------------|------------|----------------|
| 1 | **Drill GTO** | Sim (obrigatorio) | 15-45min | GTO Wizard Drills | LOG only no MVP. Roadmap: integrar |
| 2 | **Review de Torneio** | Nao (torneio = contexto) | 30-90min | Sharkscope replay manual | Vinculado a `tournaments.id` se houver |
| 3 | **Review de Maos** | Tema opcional | 20-60min | PT4/H2N replayer review | Vinculado a `starredHands[]` (multi-spot) |
| 4 | **Aula** | Sim (obrigatorio) | 15-90min | RIO/Bibliotecas video | Vinculado a `library_lessons.id` (Mux ja registra) |
| 5 | **Outro** | Opcional | livre | Escape hatch | Texto livre |

**Por que 4 + escape e nao mais:** modos exclusivos e mutuamente excludentes ficam mais faceis de filtrar/agregar. Coach AI pode prescrever "esta semana faca 3 drills + 2 reviews de torneio" porque conhece a taxonomia. Sem isso, vira tag livre indistinguivel.

**Por que NAO incluir "Coaching session" / "Sparring":** baixa frequencia + pode ser registrado como "Outro" + adicionar quando demanda emergir.

---

### 9.3 Drill GTO — como encaixar sem solver proprio?

Grindfy nao tem (e nao quer ter) solver GTO. GTO Wizard, PIO, MonkerSolver dominam isso. Entao, opcoes:

| Opcao | Esforco | Valor | Risco | Recomendacao |
|-------|---------|-------|-------|---------------|
| **A. LOG only** ("fiz 30min drill 3bet pots OOP no GTO Wizard") | Baixo (parte do MVP) | Medio | Nenhum | **MVP** |
| **B. Integrar GTO Wizard API** | Alto (se publica) ou Inviavel | Alto | Termos de servico, dependencia | Roadmap futuro |
| **C. Drill engine proprio** (basico) | Enorme (3+ meses) | Medio | Off-topic, custo | Nao |
| **D. Embed iframe GTO Wizard** + tracking time | Medio | Baixo | TOS, autenticacao | Nao |
| **E. Parceiria/affiliate** com GTO Wizard | Medio (negocio) | Alto | Contratos | Considerar Q3 |

**Recomendacao MVP: Opcao A (LOG only).**

**Como funciona o LOG.** No form post-hoc, modo "Drill GTO":
- Tema (obrigatorio): autocomplete drill (ver 9.5)
- Duracao
- **Plataforma** (opcional): "GTO Wizard / PIO / Monker / Outro"
- **Acuracidade alvo** (opcional 1-100%): "Acertei X% das spots"
- **Spots dificeis** (opcional, multiline): user cola 2-3 contextos das mais erradas. Reentry ganho de graca (Founder #5).
- Notas
- **CTA hidden:** "Quer assistir aula sobre [tema do drill]?" se Biblioteca tem aula matchando.

**Roadmap V2 (quando demanda > 30%).** Avaliar parceria GTO Wizard pra import de "trainer report" (CSV/JSON da accuracy diaria). Pre-requisitos: footprint user >100 ativos diarios + GTO Wizard aceitar parceria. **Nao priorizar agora.**

---

### 9.4 Tema = taxonomia (decisao de design)

Founder questionou: lista fixa? Tags livres? Vinculado a stats/aulas?

**Recomendacao: hybrid taxonomico — Lista curada + alias livre.**

**Modelo:**
```
study_themes (tabela existente)
├── id (nanoid)
├── name (PT-BR)
├── slug (unique kebab-case, server-derived)
├── parentId (nullable — permite hierarquia 2 niveis)
├── isCustom (boolean) — distingue founder-curated vs user-criado
├── linkedStats (jsonb array de stat slugs, ex: ['cbet_flop_oop', '3bet_vs_open'])
├── linkedLessons (jsonb array de lesson IDs)
├── aliases (jsonb array, ex: ['c-bet OOP', 'cbet out of position', 'aposta de continuacao OOP'])
```

**Curadoria seed (founder define ~30 temas iniciais).** Exemplos:

```
Pre-flop
├── 3bet pots OOP
├── 3bet pots IP
├── 4bet pots
├── Open raising ranges
└── Defending vs 3bet

Post-flop
├── C-bet flop OOP
├── C-bet flop IP
├── Turn barrels
├── River decisions
├── Bluff catching
└── Value betting thin

ICM
├── ICM bubble play
├── Final table strategy
├── Pay jump pressure
└── Short stack ICM

Mental
├── Tilt control
├── Bankroll discipline
└── Game selection

Specifico Grindfy
├── Multi-table volume
├── Late reg theory
└── Re-entry decisions
```

**Quando user digita autocomplete:**
1. Match em `name` + `aliases` (fuzzy).
2. Se 0 results, oferece "Criar tema novo: '[texto]'" → cria com `isCustom=true`.
3. Coach periodicamente (cron mensal) consolida customs duplicados (ex: "cbet OOP" + "c-bet out of position" → merge no canonico) com aviso ao founder.

**Vinculo a stats e aulas:**
- Founder configura `linkedStats` no admin ao criar/editar tema. Ex: tema "C-bet flop OOP" → linkedStats `['cbet_flop_oop_pct', 'cbet_flop_oop_size']`.
- Sistema usa pra duas coisas:
  - Em /stats-analyzer header "Suas 3 stats foco" → mostra tema vinculado de cada stat.
  - Em /estudos/temas/:id → mostra "Stats relacionadas" + delta vs mes anterior.
- `linkedLessons` permite ID3 (Biblioteca recomenda aula por leak): leak detectado em stat X → tema(s) que tem stat X em `linkedStats` → aulas em `linkedLessons` desses temas.

**Justificativa da escolha hybrid:**
- Lista pura fixa = engessa. User encontra X que nao mapeia → desiste.
- Tags livres puras = caos. Coach nao consegue agregar. Stats nao linkam.
- Hybrid = pre-povoado pro 80% dos casos + escape pro 20% nicho. Padrao de Notion/Linear.

---

### 9.5 Reavaliacao do Top 8 ICE com novo contexto

Mudancas de prioridade dado contexto novo:

| Posicao v1 | ID | Mudanca | Posicao v2 | Justificativa |
|------------|-----|---------|------------|---------------|
| 1 | F1 (Cronometro) | **Refundir com F2 + ID5** em "**Sistema de Log de Estudo**" | **1** | Mesmo escopo. Post-hoc primary, live opcional. |
| 2 | F4 (Stats Foco) | Sem mudanca | **2** | |
| 3 | ID2 (Foco visivel) | Sem mudanca | **3** | |
| 4 | F3 (Biblio = log) | **Subir importancia** — Aula = um dos 4 modos primarios. Nao e mais "extension", e core. | **4** (mantido) | |
| 5 | ID3 (Biblio reco) | Sem mudanca | **5** | |
| 6 | ID1 (Plano semanal) | Sem mudanca | **6** | |
| 7 | F5+ID6 (Spot Anki) | Sem mudanca | **7** | |
| 8 | ID4 (Coach pos-live) | Sem mudanca | **8** | |

**Sprint 1 redefinido:**

**ANTES (v1):** "Sprint 1 = F1 (cronometro 5-7d) + F4 (stats foco 4-5d) + ID2 (visivel 2-3d) = ~13d"

**AGORA (v2):** "Sprint 1 = **Sistema de Log de Estudo** (F1 + F2 + ID5 + parte de F5 spots dificeis) + **F4** + **ID2**"

Redistribuicao do Sprint 1:
- **RF-1: Form de log (post-hoc default + live opcional).** Inclui os 4 modos + escape hatch + tema autocomplete. **6-8d.**
- **RF-2: Settings daily goal + streak honesto.** Min/dia configuravel + streak so conta com goal atingido + freeze. **2d.**
- **RF-3: Stats Foco header + auto-suggest** (subset de F4). **3d.**
- **RF-4: Stats Foco visiveis em produto** (ID2). **2d.**
- **DEFER:** evolution chart (parte de F4) → Sprint 2 junto com loop biblioteca. Reduz risco do Sprint 1.

**Esforco total Sprint 1 v2:** ~13-15 dias (vs 13 antes), mas escopo mais coerente — **um sistema completo de log + foco**, em vez de 3 features paralelas.

---

### 9.6 Mockups textuais — fluxos UI

#### A. Form post-hoc (entrada DEFAULT)

```
┌──────────────────────────────────────────────────────────────┐
│  Registrar Estudo                                       [×]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Modo:   [Drill GTO] [Review Torneio] [Review Maos] [•Aula]  │
│          [Outro]                                             │
│                                                              │
│  Tema (autocomplete):                                        │
│  ┌────────────────────────────────────────────────┐          │
│  │ ICM bubble                                  ▾  │          │
│  └────────────────────────────────────────────────┘          │
│   Sugeridos: ICM bubble play • Final table ICM • Pay jumps  │
│                                                              │
│  Aula da Biblioteca:                                         │
│  ┌────────────────────────────────────────────────┐          │
│  │ Bloco A — Ep 6 "ICM no bubble"             ▾  │          │
│  └────────────────────────────────────────────────┘          │
│  (auto: progresso Mux atual = 87%, ja conta)                 │
│                                                              │
│  Duracao:  [ 45 ] min        ☐ Comecar cronometrado          │
│                                                              │
│  Notas (opcional, max 500 char):                             │
│  ┌────────────────────────────────────────────────┐          │
│  │                                                │          │
│  │                                                │          │
│  └────────────────────────────────────────────────┘          │
│                                                              │
│  Spots dificeis (drill/review):  [ + Adicionar ]             │
│                                                              │
│  Prints:  [ + Anexar print ]                                 │
│                                                              │
│                              [Cancelar]   [Registrar]        │
└──────────────────────────────────────────────────────────────┘
```

**Comportamento dos campos por modo:**

| Modo | Tema | Aula | Spots | Acuracidade | Torneio link |
|------|:----:|:----:|:-----:|:-----------:|:-----------:|
| Drill GTO | required | hidden | optional (dificeis) | optional 1-100% | hidden |
| Review Torneio | hidden | hidden | optional (multi) | hidden | autocomplete (`tournaments`) |
| Review Maos | optional | hidden | required (>= 1 starredHand) | hidden | hidden |
| Aula | required (link a tema da aula) | required | hidden | hidden | hidden |
| Outro | optional | optional | optional | hidden | hidden |

#### B. Cronometrado (mesmo form, toggle ativado)

```
☑ Comecar cronometrado

Ao salvar form com modo + tema preenchidos:
- Cria studySession status='running' em vez de 'completed'
- Modal fecha
- HUD compacto sticky aparece: "Estudando: ICM bubble · 02:34" [pause] [stop]
- Quando user para, abre dialog refinement:
  ┌─────────────────────────────────┐
  │ Sessao concluida (45min 22s)    │
  │                                 │
  │ Adicionar notas finais? [opt]   │
  │ Adicionar spots dificeis? [opt] │
  │ Marcar como produtiva? Sim/Nao  │
  │                                 │
  │       [Salvar e fechar]         │
  └─────────────────────────────────┘
```

**Auto-pause smart.** Se user fechar tab/maquina em sleep, cronometro para de contar mas mantem `started_at`. Ao retomar, calcula `now - started_at`. Mostra "Voce esteve fora 12min — descontar do tempo? [Sim] [Nao, contar tudo]". Default Sim.

#### C. Quick chip "Acabei de estudar"

Para casos extremos de friccao zero (founder pediu botao rapido):

```
[FAB flutuante na sidebar Studies]
┌──────────────────┐
│  + Acabei!       │  → click abre form pre-preenchido com:
└──────────────────┘     - Duracao = ultima sessao_kind ou 30min
                          - Tema = ultimo tema usado nos 7 dias
                          - User confirma/edita em 1 click
```

---

### 9.7 Schema preview — `study_sessions`

NAO eh SQL final. Shape sugerido pros 4 modos:

```ts
study_sessions {
  id: text PK (nanoid)
  user_id: text FK users.id NOT NULL
  
  // Modo (discriminator)
  mode: enum('drill_gto', 'tournament_review', 'hand_review', 'lesson', 'other') NOT NULL
  
  // Origem do registro
  source: enum('manual_post_hoc', 'manual_live', 'auto_lesson', 'auto_grind_finalize') NOT NULL
  
  // Tempo
  duration_minutes: integer NOT NULL (>= 1)
  started_at: timestamptz nullable (so populated em modo live)
  ended_at: timestamptz nullable
  registered_at: timestamptz NOT NULL DEFAULT now() // quando o LOG foi feito
  
  // Tema (opcional dependendo do modo)
  theme_id: text FK study_themes.id nullable
  
  // Vinculacoes especificas por modo
  tournament_id: text FK tournaments.id nullable      // mode=tournament_review
  lesson_id: text FK library_lessons.id nullable      // mode=lesson
  starred_hand_ids: jsonb nullable                    // mode=hand_review (array de IDs)
  
  // Drill especifico
  drill_platform: enum('gto_wizard', 'pio', 'monker', 'other') nullable
  drill_accuracy: integer nullable (0-100)
  difficult_spots: jsonb nullable                     // array { context: string, note: string, createdReentry: boolean }
  
  // Conteudo
  notes: text nullable (max 500)
  attachments: jsonb nullable                         // array de print URLs (reuse spot screenshots)
  
  // Qualidade (live only)
  was_productive: boolean nullable                    // user marcou ao parar cronometro
  
  // Metadados
  daily_goal_met: boolean DEFAULT false               // calc por trigger sobre soma do dia
  xp_awarded: integer DEFAULT 0                       // gamificacao
}
```

**Indices propostos:**
```
idx_study_sessions_user_registered (user_id, registered_at desc)
idx_study_sessions_user_theme (user_id, theme_id)
idx_study_sessions_user_mode (user_id, mode, registered_at desc)
idx_study_sessions_lesson (lesson_id) where lesson_id is not null
```

**Constraints:**
- `mode='lesson'` → `lesson_id NOT NULL`
- `mode='tournament_review'` → `tournament_id NOT NULL` (relaxado: pode ser null se torneio externo nao importado, mas warn)
- `mode='hand_review'` → `starred_hand_ids` array com >= 1 elemento
- `mode='drill_gto'` → `theme_id NOT NULL`

**Lessons learned aplicaveis:**
- Lesson #7 (schema deprecation gradual): nova tabela, `study_materials.timeSpent` legado fica deprecated mas nao derrubado. Coach faz a transicao.
- Lesson #6 (conversao moeda): nao aplica aqui — sem dinheiro.
- Lesson #19 (CTA target): ao gerar link "Continuar de onde parou" pra modo=lesson, hidratar courseSlug+lessonSlug do storage como em home-reform-4 item 4.

**Migration estimativa:** 1 migration nova `study_sessions` v2 + back-fill opcional de `studyMaterials.timeSpent` legado pra `study_sessions` mode='other' (se >0). Pode ser deferido pra Sprint 2.

---

### 9.8 Fluxos de auto-registro (sem form)

Tres trigers automaticos onde sistema cria `study_sessions` sem user preencher nada:

#### Auto-1: Aula assistida (Mux progress >= 80%)
```
trigger: lesson_progress_update event
condicao: progress_pct >= 80% AND lesson_id sem study_sessions linked nas ultimas 24h
acao:
  cria study_sessions {
    mode='lesson',
    source='auto_lesson',
    lesson_id=X,
    theme_id=lesson.themeId,
    duration_minutes=lesson.runtime_seconds * progress_pct / 60,
    notes=null,
    daily_goal_met=calculated
  }
  notif user: "Aula 'Ep 5' registrada como 30min de estudo. Adicionar notas? [Sim]"
```

#### Auto-2: Sessao /grind-live finalizada
```
trigger: grind_session.finalize handler (ja existe)
condicao: session duration > 30min AND user opted-in via setting
acao:
  abre dialog "Como foi a sessao?"
  user pode marcar: "registrar como Review de Maos pos-jogo? Quanto tempo?"
  cria study_sessions { mode='hand_review', source='auto_grind_finalize', starred_hand_ids=session.spots, duration_minutes=user_input }
```

#### Auto-3: Cronometro live concluido
```
trigger: stopTimer
acao:
  cria study_sessions { mode=user_selected, source='manual_live', started_at, ended_at, duration_minutes=delta, ... }
```

---

### 9.9 Riscos novos do refinamento

| # | Risco | Mitigacao |
|---|-------|-----------|
| **R11** | Form com 4 modos + tema obrigatorio condicional pode confundir | Layout dinamico — campos aparecem/somem conforme modo. Validacao client-side imediata. |
| **R12** | Drill GTO sem integracao = LOG dummy, baixa retencao do feature | Aceitar no MVP. Track metric "% sessions com drill_accuracy preenchido" — se >50%, validar parceria GTO Wizard. |
| **R13** | Customizar tema (livre) gera duplicatas | Fuzzy match em autocomplete. Coach mensal consolida. Founder pode editar/merge no admin. |
| **R14** | Auto-1 (Mux trigger) cria duplicatas se user pausa+continua aula | Idempotency: `lesson_id + user_id + last 24h` = 1 session max. Update duration se progress aumenta. |
| **R15** | Schema com 4 FKs nullable + 1 jsonb fica complexo | Documentar bem. Test fixtures pra cada modo. Drizzle types ajudam. |

---

### 9.10 Resumo Caveman v2 (refino)

```
v1 fail = colocou cronometro como entrada principal
real = log post-hoc primary, cronometro toggle dentro do form
4 modo primario = drill_gto, tournament_review, hand_review, lesson + outro
drill_gto = LOG only no MVP (sem solver proprio); roadmap parceria gto wizard
tema = hybrid: ~30 curados founder + custom livre + linkedStats + linkedLessons (jsonb)
sprint1 v2 = unifica F1+F2+ID5 em "Sistema Log Estudo" + F4 header/auto-suggest + ID2
schema = study_sessions mode discriminator + source + 4 FKs nullable + drill fields + notes/attach
auto-trigger = aula 80% mux, finalize grind-live, cronometro live
risco novo = form complexo (mitigar layout dinamico), drill log raso (track adoption), tema duplica (fuzzy + merge mensal)
killer ainda = spot anki reentry (sprint 3)
```

---

### 9.11 Proximos passos (atualizado)

1. Founder valida secao 9 (especialmente 4 modos + drill log only + tema hybrid).
2. PM-Spec consume secoes 1-9 + gera spec executavel "**Sprint Estudos-Habito-1**" com:
   - RF-1 Form Log (4 modos + escape) com schema `study_sessions` v2.
   - RF-2 Daily goal + streak honesto (settings.daily_goal_minutes).
   - RF-3 Stats Foco header + auto-suggest (parte de F4).
   - RF-4 Stats Foco visiveis (ID2).
3. System-architect define ADR para schema + ADR para hybrid taxonomy temas.
4. Em paralelo: founder seed dos ~30 temas iniciais via planilha → import script.
