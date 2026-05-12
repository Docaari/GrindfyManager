# Grindfy AI Agents — Pesquisa Completa + Plano de Melhoria Definitivo

**Data:** 2026-05-11
**Autor:** Strategist agent
**Status:** Apresentacao para decisao do founder. Nao implementar — consumir via `pm-spec` apos aprovacao ponto-a-ponto.
**Substitui em escopo:** consolida e atualiza `Docs/strategy/2026-04-24-coach-ai-optimization-plan.md`, `coach-ia-upgrade-research-2026-05-02.md` e `coach-ia-implementation-plan-2026-05-02.md` — todos ainda validos, mas escritos antes de muito codigo ter sido entregue. Este e o artefato unico de referencia daqui pra frente.

---

## SUMARIO EXECUTIVO (leia isto primeiro)

O Grindfy tem hoje **3 superficies de IA**: (1) **Coach AI** — chat especializado com 3 personas (Mental/Tournament/Technical), tool use parcial, page context, memoria de longo prazo, feedback up/down, alguns nudges proativos; (2) **News / "Sinal Externo"** — feed externo via RSS + busca X (xAI/Grok), recem-refatorado depois de uma versao Grok-LLM que gerava 100% conteudo fake; (3) **Stats OCR** — Claude vision (Haiku) que le screenshots de HUD Hand2Note. Existem ainda 4 usos "ocultos" de IA: auto-titulo de sessao, sumarizacao de memoria, recomendacao de lesson da Biblioteca, geracao de plano semanal de estudo.

**O Coach esta numa situacao curiosa:** muita infra ja foi construida (caching, tiered rate limit, feedback, page context, write tools com confirm/undo, nudge engine, audit log, crons) — mas **boa parte nao esta ligada de ponta a ponta**. Os 5 read tools "core" do Coach-2A (`query_dimension`, `find_top_leaks`, etc.) estao como **stubs quebrados** no registry. As 8 write tools (`register_tournament_in_grade`, `record_wallet_transaction`, `start_grind_session`, `log_leak_focus`, `log_study_session`, etc.) tem **arquivo de handler escrito mas nao estao registradas** — o LLM nem ve elas. Resultado pratico: hoje o Coach so consegue ler HUD stats, historico de bankroll, temas de estudo, cooldown e recomendar uma lesson. Ele **nao consegue** olhar seu ROI por site, detectar leaks, simular banca, montar grade, registrar transacao, ou iniciar sessao — mesmo o codigo existindo.

**A visao do founder (Grindfy AI como tecnico de carreira proativo)** exige fechar essa lacuna primeiro (P0: religar tools que ja existem), depois construir o ciclo de vida (onboarding → semanal → mensal), e por fim adicionar as features novas (write tools de grade/estudo, relatorios automaticos, mental tracking).

**Recomendacao central:** **consolidar os 3 coaches em um unico "Grindfy AI"** com modos/lentes em vez de personas separadas. As 3 personas hoje fragmentam contexto (cada uma so ve um pedaco dos dados) e confundem o usuario ("com qual coach falo sobre meu ROI vs meu tilt?"). Um agente unico que sabe tudo, com tom calibrado, e o caminho.

**3 fases:** **Fase 0 — Religar (2-3 semanas):** consertar tools quebradas, registrar write tools, consolidar coaches, dar ao agente acesso aos dados que ja sabemos servir. **Fase 1 — Ciclo de vida (4-6 semanas):** onboarding/diagnostico inicial, relatorio semanal, relatorio mensal, cobranca de import. **Fase 2 — Tecnico de carreira (4-6 semanas):** write tools de grade/estudo completas, mental tracking (C-game/Inchworm), metas de carreira, plateau diagnosis. Total ~3-4 meses.

**Riscos principais:** (R1) nag fatigue — opt-out granular OBRIGATORIO antes de qualquer nudge; (R2) custo Anthropic — tier gating estrito + caching ja em prod; (R3) acoes erradas — confirm + undo OBRIGATORIO; (R4) Coach virar advisor financeiro — disclaimer regulatorio.

---

## PARTE 1 — PESQUISA: DORES DOS JOGADORES DE POKER MTT

### 1.1. O perfil do nosso usuario

O grinder profissional/semi-pro de MTT online (publico-alvo do Grindfy):
- Joga **20-50 torneios por dia** em mesas multiplas (4-24 tabling). Volume e o motor.
- Joga em **multiplas redes** simultaneamente (PokerStars, GGPoker/Natural8, Suprema/WPN, 888, PartyPoker, Bodog/Coin). No Brasil especificamente: Suprema (SBGL) + GG + Stars dominam, com FX (BRL/USD) sempre no meio.
- **Variancia brutal:** ROI tipico de winner e 5-25% em torneios soft, 0-8% em campos duros — mas com swings de 100-500 buy-ins normais. Um winner pode passar 6 meses no vermelho sem nada de errado tecnicamente.
- **Estuda sozinho:** GTO Wizard, solvers, hand review, videos. Sem coach humano (caro), sem accountability. Acha que estuda mas frequentemente nao tem plano coerente.
- **Vive a noite:** os bons torneios sao 19h-2h. Sleep debt cronico, vida social comprometida, familia que cobra estabilidade.
- **Tracking manual e chato:** importar CSVs de varias redes, conciliar saldos de varias wallets, anotar leaks. Faz por obrigacao, nao por prazer. Muitos abandonam o tracking depois de algumas semanas.

### 1.2. As 12 dores estruturais (mapeadas + benchmarkadas)

| # | Dor | Sintoma | O que ferramentas atuais fazem | Gap |
|---|---|---|---|---|
| **D1** | **Variancia + downswings** | -200 BI sem causa tecnica clara. "Ainda sou winner?" Panico, mudanca de stake errada. | SharkScope mostra grafico de ROI. PT4/HM3 mostram all-in EV. Nada diagnostica "isto e variancia ou leak?". | **Ninguem** combina: detectar downswing + rodar leak detection + calcular probabilidade de variancia pura + recomendar acao (continuar/mover/pausar). |
| **D2** | **Tilt + mental game** | Bad-beat tilt derrete o multi-tabling. Carryover entre sessoes. Burnout silencioso — A-game raro, B/C-game dominam. | Apps de mental game (Tendler tem livro + app pago). Primed Mind, Headspace genericos. PrimeDope tem questionarios. **Nada digitaliza Inchworm ou Mental Hand History dentro do tracker.** | Coach Mental do Grindfy hoje so olha break feedbacks soltos. Nao trackeia C-game movement, nao detecta padrao de horarios, nao faz Mental Hand History (framework Tendler). |
| **D3** | **Volume vs estudo (tradeoff)** | Volume alto demais → sem tempo de estudo → plateau. Ou volume baixo + estudo aleatorio. | Nenhuma ferramenta mede tempo de estudo. SharkScope/PT4/HM3 sao 100% sobre o que voce jogou, zero sobre o que voce estudou. | Grindfy tem o modulo Estudos/Spots/Biblioteca — mas nao cruza "horas grind vs horas estudo" nem cobra rotina de estudo. |
| **D4** | **Bankroll + FX (Brasil-specific)** | BR insuficiente, saca em 50% lucro, sem awareness de rakeback effective. Multi-wallet caotico (USD/BRL/EUR). Rake leak invisivel. Tax planning ausente (IRPF 2026 — bets agora declaravel, poker em zona cinzenta). | SharkScope mostra ROI. Nenhuma ferramenta faz multi-wallet com FX nativo + rakeback. **Grindfy ja tem isso (modulo Bankroll multi-wallet).** | O modulo Bankroll existe mas o Coach nao **inicia/le** os fluxos: nao cobra snapshot no fim do mes, nao detecta site com rake > rakeback, nao ajuda a compilar P&L anual pra IRPF. |
| **D5** | **Selection (escolher torneios certos)** | Joga tudo que ve. Field errado, horario ruim. Sabe que o pool BR e mais soft mas nao tem dados. Multi-rede confunde. | PokerCraft (so GG). SharkScope (so resultados, nao prescritivo). **Grindfy ja tem o Tournament Selector (scoring 0-100 + grade S/A/B/C/D).** | Tournament Selector existe — mas o Coach nao **roda + apresenta + monta a grade** conversacionalmente. Hoje tem `get_tournament_suggestions` e `explain_tournament_score`, mas estao STUBS quebrados. |
| **D6** | **Identificar leaks** | Nao sabe nem quais stats olhar. Sample size ridiculo. Ve VPIP/PFR mas nao age. Leaks moveis (corrige um, surge outro). Leaks sutis (size de 3bet em SB BvB com 18bb) invisiveis em ferramentas genericas. | PT4/HM3/Hand2Note mostram stats. GTOWizard/DTO treinam spots. Nenhum **prioriza** "esse mes foca isto" e mede progresso. | Grindfy tem leak detection rule-based (`coachLeakDetection.ts`) + Stats Analyzer (OCR de HUD) + Spots/SRS. Mas o Coach nao **escolhe foco + cobra estudo + verifica progresso** num loop fechado. |
| **D7** | **Estudo: o que / quando / como** | Compra curso aleatorio, abandona. GTO Wizard + solver = overload, sem plano. Sabe muito mas perde edge sem rotina de revisao sistematica. | GTOWizard tem trainer. PokerCode/Run It Once/Tournament Poker Edge tem cursos. Nenhum integra "seu leak X → conteudo Y → agendado pra hoje". | Grindfy tem Biblioteca/LMS + Estudos + Spots SRS + plano semanal de estudo (cron `generateWeeklyStudyPlan`). Mas o Coach nao **conecta leak → conteudo da Biblioteca → bloco agendado**. `recommend_lesson` existe mas isolado. |
| **D8** | **Plateau / regressao** | 6+ meses breakeven. Sabe que tem leak mas nao acha. Ou regressao real (campos enrijecem, edge cai). | SharkScope mostra ROI estavel — mas nao diz por que. | **Ninguem** faz "diagnose plateau" = combinar leak detection + variance analysis + grind/study ratio + mental → identificar a causa. |
| **D9** | **Vida pessoal / horarios / saude** | Familia nao entende. Casado com filhos — sessao das 21h quebra rotina. Isolamento. Nocturnal lifestyle, sleep debt, depressao subdiagnosticada (a "crise de saude mental do poker" e tema recorrente em poker.org, 2+2, Discords de stables). | Nenhuma ferramenta de poker toca nisso. Whoop/Oura medem sono mas nao cruzam com performance de poker. | Grindfy poderia detectar padrao de schedule (sessoes >6h, multiplos dias seguidos sem off, sessao apos 2am) + 1 prompt/semana de wellbeing. **Diferenciador enorme** — ninguem tem. Risco: invasivo (mitigacao: opt-in). |
| **D10** | **Carreira / longo prazo** | "Posso virar pro?" sem framework. Stake/coaching, dropar emprego CLT — sem accountability. Quando parar? Como diversificar? | Tournament Poker Edge / coaching humano. Caro, nao escala. | Grindfy poderia ter metas SMART/OKR registradas + revisao trimestral + plano de 90/180/365d. O Sprint "Goal Setting" foi cancelado no pivot — o Coach v3 entrega isso **implicitamente** via conversa. |
| **D11** | **Tracking manual chato** | Importar CSV de 5 redes toda semana. Conciliar 4 wallets. Anotar leaks. Faz por obrigacao. Abandona. | Todas as ferramentas tem essa friccao. Hand2Note importa automatico mas e desktop-only. | O Coach pode **cobrar o import** ("voce nao importou desde dia 3 — 8 sessoes no escuro"), **ajudar a conciliar** ("posso registrar essa transacao?"), e tornar o tracking conversacional em vez de formulario. |
| **D12** | **Falta de feedback objetivo + isolamento** | Joga sozinho. Sem ninguem pra dizer "boa semana" ou "isso e variancia, relaxa". O tracker e mudo — mostra numeros, nao opina. | Discords de stables/teams suprem parcialmente (peer accountability). SharkScope tem "AI Coaching" recente mas raso. | O Coach pode ser a **presenca** que falta: 1 mensagem na segunda ("sua semana: +$280, acima da sua media — boa"), 1 no fim do mes, 1 quando detecta downswing. Tom de **par/companheiro**, nao supervisor (pesquisa Tendler/888poker: peer accountability > top-down). |

### 1.3. As 5 dores SISTEMICAS (cruzamentos) — onde esta o diferenciador

As dores que mais quebram carreira sao **interseccoes** que nenhuma ferramenta trata:

- **D2 + D9 (mental + vida):** burnout vem de schedule ruim, nao de hands. Coach atual ignora padrao de horarios.
- **D3 + D7 (volume + estudo):** tradeoff implicito — coach atual nao mede tempo de estudo nem cobra rotina.
- **D4 + D10 (bankroll + carreira):** staking, tax, retirada, shot taking. Coach atual simula cenario isolado, nao pensa carreira.
- **D5 + D8 (selection + plateau):** plateau frequentemente e selection ruim, nao tecnico. Coach atual nao cruza.
- **D6 + D7 (leak + estudo):** leak detectado deveria virar plano de estudo automatico. Hoje nao vira.

**Conclusao Parte 1:** o Coach atual ataca **D5/D6 (parcial)** + **D2 (parcial)**. O resto esta ausente ou desconectado. As dores sistemicas sao o que diferencia "tecnico" de "consultor" — e ninguem (SharkScope, PokerCraft, PT4, HM3, GTOWizard, DTO, Hand2Note) faz isso.

### 1.4. Benchmark — o que cada ferramenta faz e o que nao faz

| Ferramenta | Forte em | Fraco/ausente | O que o Grindfy AI pode aprender |
|---|---|---|---|
| **SharkScope** | Tracking multi-rede de torneios, ROI, graficos. Tem "AI Coaching" recente. | AI Coaching e raso/generico. Nada proativo. Nao integra estudo/mental/bankroll. | A barra e baixa — "AI coaching de verdade" e um espaco aberto. |
| **PokerCraft (GGPoker)** | Analytics interno GG, bom UX. | So GG. Nao prescritivo. Nada de estudo/mental. | UX de dashboard limpo. |
| **PT4 / HM3** | HUD + analytics profundo desktop. | Desktop-only. Friccao de import. Zero proatividade. Zero estudo/mental. | Profundidade de stats — mas nos somos web + conversacional. |
| **Hand2Note** | HUD melhor da categoria, import automatico. | Desktop. Caro. So stats. | O layout que nosso OCR ja le. |
| **GTO Wizard / DTO / PIO** | Solver, trainer de spots. | So estrategia. Nao trackeia carreira/volume/bankroll/mental. | "Trainer" gamificado de spots — nosso modulo Spots/SRS ja vai nessa direcao. |
| **PokerCode / Run It Once / Tournament Poker Edge** | Cursos de video, coaching. | Conteudo estatico. Sem accountability. Nao integra com seus dados. | Conteudo da Biblioteca + recomendacao baseada no SEU leak. |
| **Aimchess / Chessigma (analogos do xadrez)** | "Analise da sua semana", insights, "weakness reports", Annual Wrapped. | (categoria diferente, mas o modelo de produto e exatamente o que queremos) | **Modelo de referencia**: relatorio semanal/anual gerado, weakness report, training plan. |
| **Whoop Coach / Oura Advisor / Strava** | Coach conversacional sobre SEUS dados de saude/atividade. Year in Sport. | (categoria diferente) | **Modelo de tom + cadencia**: insight diario curto, relatorio semanal, comparativos, "voce esta acima da sua media". |
| **Duolingo Max / "sad owl"** | Engajamento via streak, lembretes com personalidade, lesson recomendada. | (categoria diferente) | Streak + lembrete com tom (sem ser chato — Duo passou da conta as vezes). Nosso modulo Estudos ja tem streak. |
| **Cursor / Claude Code, Linear, Notion AI, Intercom Fin** | Copilots que **executam** (nao so falam). Acoes com confirmacao. Contexto da pagina. | (categoria diferente) | **Modelo de tool use**: o agente faz, com confirmacao. Page context. Diff antes de aplicar. |

**Padrao extraido:** os copilots/coaches que funcionam (a) sabem o contexto do usuario sem ele explicar, (b) tem memoria, (c) **executam acoes** (com confirmacao), (d) sao **proativos** com cadencia respeitosa, (e) tem **tom calibrado** (nem robo nem bajulador), (f) **fecham o loop** (sugerem E fazem). O Coach atual falha em (c), (d) e (f).

---

## PARTE 2 — PESQUISA: DORES DE CHAT IA / INTERACAO IA-PLATAFORMA EM SaaS

Por que assistentes de IA em produtos SaaS frustram (e como evitar):

| # | Dor | Por que acontece | Mitigacao no Grindfy AI |
|---|---|---|---|
| **C1** | **Respostas genericas, sem contexto do usuario** | O agente nao recebe os dados do usuario no prompt, ou recebe pouco. Diz "voce poderia melhorar seu jogo de turn" sem saber que o usuario e -8% ROI em PKO especificamente. | **Page context + tools + system prompt enriquecido.** Toda resposta deve poder citar `[fonte: Dashboard > 30d > 142 torneios]`. Tools dao acesso a dados frescos sob demanda. |
| **C2** | **Sem memoria entre sessoes** | Cada conversa comeca do zero. Usuario reexplica tudo. | Grindfy ja tem `userAiProfile` (perfil de longo prazo via Haiku) + `monthlyCoachSummaries` + `summary` por sessao. **Manter e melhorar** — o perfil deve incluir: nivel, metas ativas, foco do mes, tom preferido, padroes conhecidos. |
| **C3** | **Nao toma acoes — so fala** | Tool use nao implementado, ou so read tools. O usuario tem que sair do chat, ir na tela X, fazer manualmente. Friccao mata o valor. | **Write tools com confirmacao + undo.** "Quer que eu adicione esses 8 torneios na sua grade de quarta?" → 1 clique → feito → desfazer em 5min. |
| **C4** | **Alucinacao / desconfianca** | LLM inventa numeros. Usuario pega 1 erro, nunca mais confia. | **Citations obrigatorias** em todo numero. **Confidence tags** (⚠️ amostra <30, ✅ >100). **Tools** em vez de "lembrar de cabeca" — quando precisa de um numero, chama a tool. Feedback up/down + dashboard admin pra curar prompts. (Tudo isso ja existe parcialmente.) |
| **C5** | **Latencia** | Resposta demora. Usuario fecha. Relatorio demora 60s. | Streaming SSE (ja existe). Relatorios sao **async** (job background) — usuario abre relatorio JA pronto. Caching de prompt mantem o custo e a latencia baixos. |
| **C6** | **Nao sabe o que o usuario fez na plataforma** | O agente nao tem visibilidade de "voce importou CSV ha 2 dias", "voce nao registrou sessao essa semana", "voce esta na tela do Grade Planner agora". | **Page context** (ja existe pra /grade-planner, /grind-live, /dashboard, /coach-ai). **Gap-check** (cobranca de import). **Activity awareness** no system prompt. |
| **C7** | **"Blank page problem"** — usuario nao sabe o que perguntar | Chat vazio. Usuario nao sabe que o agente pode ajudar com X, Y, Z. | **Sugestoes contextuais** ("Voce esta na tela de Bankroll — quer que eu analise seus saldos? Posso simular um cenario."). **O agente abre conversa** (proatividade) em vez de esperar. **Quick actions** visiveis. |
| **C8** | **Falta de proatividade** | 100% reativo. O agente so existe quando o usuario lembra de abrir o chat. Engagement morre. | **Nudges proativos** com cadencia respeitosa: relatorio semanal, mensal, downswing detection, cobranca de import. (Infra de nudge ja existe — B-SNAPSHOT, B-STUDY crons.) |
| **C9** | **Tom errado (bajulador ou robotico)** | "Que pergunta excelente!" toda vez (bajulador). Ou "Conforme os dados fornecidos, observa-se..." (robo). Ambos irritam. | **Tom de par/companheiro de grind.** Pesquisa Tendler/888poker: peer accountability > supervisor. Onboarding pergunta "como voce quer ser cobrado: gentil / direto / sem rodeio". Disclaimer em outputs financeiros (regulatorio). |
| **C10** | **Nao fecha o loop** | Sugere "voce deveria estudar 3bet defense" e fim. Nao agenda, nao trackeia, nao verifica. | **Loop fechado:** leak detectado → escolher foco (`log_leak_focus`) → conteudo recomendado (`recommend_lesson`) → bloco agendado (`schedule_study_block`) → verificacao em 30d (`verify_leak_progress`) → aparece no relatorio mensal. |
| **C11** | **Permissoes/privacidade obscuras** | Usuario nao sabe o que o agente registrou ou acessou. Sente-se vigiado. | **Pagina de audit** (`/settings/coach-actions` — ja existe `/api/coach/audit`). Lista cronologica de tudo que o Coach fez. Export JSON. Opt-out por categoria. |
| **C12** | **Custo no produto vira tier confuso** | Usuario nao entende por que IA e limitada. Limite some no meio da conversa. | Rate limit tiered transparente (ja existe — headers X-RateLimit-*). Features caras (relatorio diario) = Premium. Mensagem clara de upgrade. |

**Conclusao Parte 2:** o Coach do Grindfy ja resolve C2, C4 (parcial), C5, C6 (parcial), C12 razoavelmente. Falha em **C3 (acoes), C7 (blank page), C8 (proatividade), C10 (loop fechado)** — que sao exatamente os 4 que mais separam "chatbot" de "copiloto".

---

## PARTE 3 — AUDITORIA DO ESTADO ATUAL DOS AGENTES GRINDFY

### 3.1. Coach AI

**Arquivos:** `server/coach*.ts` (~2800 linhas), `server/coach/` (cronRunner, nudgeEngine, recommendLessonForUser, prompts/, tools/, jobs/), `server/coachTools/` (registry, index, handlers/, studies/, grind-live/), `server/routes/coach.ts` (~1600 linhas). Docs: `Docs/api/coach.md`, `coach-tools.md`, `Docs/architecture/ai-coach/`. ADRs 019-026, 052, 075, 077, 084-087, 111-115, 125, 133-135, 140, 142.

**O que faz hoje (confirmado no codigo):**

1. **3 coaches separados** — Mental (`MENTAL_BASE`), Tournament (`TOURNAMENT_BASE`), Technical (`TECHNICAL_BASE`). Cada um com prompt base proprio + contexto especifico (Mental ve break feedbacks; Tournament ve ROI por site/buyin/categoria/speed/dia + top/worst templates; Technical ve dashboard stats + final table analytics + study cards + leaks). Sao **3 personas isoladas** — cada uma so ve um pedaco dos dados.

2. **Persona "tiered" (= gate por plano, nao "personalidade"):** `coachAccess.ts` — `free` so acessa Mental; `pro` acessa Mental+Tournament; `premium`/`admin` acessa todos os 3. Rate limit diario tiered: free 10 msg/dia, pro 50, premium 200, admin ilimitado. (O termo "tiered" no codigo refere-se ao **acesso por tier de assinatura**, nao a personalidade do coach.)

3. **Prompt caching** (ADR-019): system prompt particionado em bloco estatico (cacheado via `cache_control: ephemeral` — base prompt + safety rules + bloqueio de concorrentes + citations/confidence rules + perfil do jogador + stats snapshot + resumo da sessao anterior) e bloco dinamico (sessao ativa, break feedbacks, leaks, weekly plan, study progress, page context). Reduz custo ~75%. Modelos via env: `COACH_CHAT_MODEL` (default `claude-sonnet-4-6`), `COACH_MEMORY_MODEL` (default `claude-haiku-4-5-...`).

4. **Page context** (ADR-025): o frontend manda `pageContext` no body do `/api/coach/chat` — validado por Zod discriminated union, sanitizado contra injection, injetado no bloco dinamico. Suporta `/grade-planner` (day, profile, activeFilters, focusedTournamentId), `/grind-live` (activeSessionId, sessionStatus, registeredTournamentsCount, currentProfit), `/dashboard` (dateRange, activeFilters), `/coach-ai` (activeCoachType).

5. **Memoria de longo prazo** (`coachMemory.ts`): ao arquivar uma sessao, gera resumo via Haiku + atualiza `userAiProfile` (perfil mergeado, max ~2000 chars). Compactacao mensal (`checkMonthlyCompaction`): consolida sessoes arquivadas do mes anterior em `monthlyCoachSummaries` + limpa mensagens >60 dias. Endpoint `/api/coach/profile` (GET/PUT) e `/api/coach/monthly-summaries` (GET).

6. **Feedback up/down** (ADR-022, Sprint Coach-1): `POST/DELETE /api/coach/messages/:id/feedback` (1 por mensagem, UNIQUE). Dashboard admin `/api/admin/coach/feedback-stats` (counts por coach, weeklyRate, top 20 mensagens com down pra curar prompts). Citations inline (`[Fonte: ...]`) e confidence tags (`[confianca: baixa|media|alta, N=X]`, `[nao sei: motivo]`) instruidos no prompt.

7. **Tool use — parcialmente ligado** (ADR-023/024/026): `exportToolsForAnthropic(tier)` E chamado em `handleCoachChat` (linha ~354) e os tools sao passados pra API Anthropic; o stream SSE emite eventos de tool use (`tool_use_start`, `tool_use_input_delta`, `tool_use_input_done`, `tool_executing`, `tool_completed`, `tool_limit_reached`); limite de 5 tool calls/turn. **PORÉM** o registry (`server/coachTools/index.ts`) registra apenas:
   - `read_cooldown_history` (real)
   - `read_user_hud_stats` v2 (real)
   - `read_user_bankroll_history` (real, Pro+)
   - `read_theme_with_linked_stats_and_spots` + alias deprecado (real)
   - `recommend_lesson` (real)
   - `find_top_leaks` — **STUB QUEBRADO** (retorna `not_implemented`)
   - `simulate_bankroll_scenario` — **STUB QUEBRADO**
   - `query_dimension`, `get_tournament_suggestions`, `explain_tournament_score` — **NEM SAO REGISTRADOS** (so existem na doc; o comentario no codigo diz "handlers reais vivem em arquivos baseline separados / coach-baseline broken")

8. **Write tools — escritas mas NAO registradas:** existem 8 arquivos de handler em `server/coachTools/handlers/`: `registerTournamentInGrade.ts`, `recordWalletTransaction.ts`, `startGrindSession.ts`, `logSessionCompleted.ts`, `logLeakFocus.ts`, `logStudySession.ts`, `verifyLeakProgress.ts`, `readCooldownHistory.ts`. **Nenhum dos write tools esta no `index.ts`** — o LLM nao ve nenhum deles. So o `readCooldownHistory` foi religado.

9. **Confirm/undo infra** (ADR-077): `coachToolRunner.ts` tem `confirmCoachAction`, `cancelCoachAction`, `undoCoachAction`, `getCoachActionForUser`. Endpoints `/api/coach/actions/:id` (GET), `/confirm`, `/cancel`, `/undo`. Tabela `coach_actions` com `payload_before` pra undo, `requires_confirmation`, `status` (pending/executing/completed/failed/undone), `auditLevel`. Cron de cleanup de actions pending >30min.

10. **Nudge engine** (ADR-084/085, Sprint Coach-0/2B): `nudgeEngine.ts` — `shouldSendNudge(userId, ctx)` com 5 checks (categoria toggle off, quiet hours timezone-aware wrap-around, daily cap, hourly cap, one-shot per cycle). Categorias: B-SNAPSHOT, B-LEAK, B-STUDY, B-VOLUME, B-GRADE, B-DOWNSWING, B-LIFE, B-MENTAL. Preferences em `coachPreferences` (8 toggles + quiet hours + caps). **Crons ativos** (`server/coach/cronRunner.ts`, so quando `NODE_ENV=production` ou `COACH_CRON_ENABLED=true`): cleanup pending (1min), B-SNAPSHOT (dia 28, filtra hora local 9h), B-STUDY (toda hora, filtra hora local 19h + foco ativo). **B-LEAK, B-VOLUME, B-GRADE, B-DOWNSWING, B-LIFE NAO tem cron** — so o engine existe.

11. **Coach recommendation cron** (ADR-112/113, home-reform-4): segunda 06:00 BRT, `generateCoachRecommendationsTick` — gera 1 recomendacao de lesson da Biblioteca por usuario (5 tiers em cascata: short-circuit sem dados → Coach IA via Anthropic → fallback leak→tag → fallback popular → fallback recente → null). Consome tracking (`useCoachRecommendationConsume` no frontend).

12. **Audit** (ADR-... Sprint Coach-0): `/api/coach/audit` (GET — lista cronologica de coach_actions), `/api/coach/audit/:id/dismiss`, `/api/coach/audit/export` (JSON). Frontend `/settings/coach-actions`.

13. **Leak detection rule-based** (`coachLeakDetection.ts`): `detectLeaks(userId)` — regras (ex: ITM baixo em Turbos, ROI negativo sustentado em PKO) com severidade + evidencia. Usado no contexto do Technical coach e (deveria ser) na tool `find_top_leaks`.

14. **Coach session insights** (ADR-133/134/140, Estudos sprints): `coachSessionInsightsService.ts` — gera insights pos-sessao de grind (spots pra revisar, etc.). Tool `coachStudyPlan` (em `server/coachTools/studies/`).

15. **UI**: pagina `/coach-ai` reformada (Sprint coach-page-reform-1, ADR-125) — 4 abas URL-persisted (Chat, Biblioteca, Estudos, Selector embeddados), quick filters, hover X delete com gate de 1s, banner de pendentes.

**Limitacoes (gaps vs visao):**
- **3 coaches fragmentam contexto** — cada um so ve um pedaco. Usuario confuso sobre "com qual falo".
- **Tools quebradas:** os 5 read tools "estrela" do Coach-2A (ROI por dimensao, leaks, sugestoes de torneio, explicar score, simular banca) estao stub/ausentes. Na pratica o Coach **nao consegue olhar seu ROI por site** mesmo a feature existindo no codigo.
- **Write tools fantasma:** 8 handlers escritos, zero registrados. O Coach **nao consegue fazer nada** — so falar.
- **Zero relatorios:** nenhum relatorio diario/semanal/mensal automatico.
- **Proatividade minima:** so B-SNAPSHOT e B-STUDY tem cron (e so em prod). Nenhum nudge de downswing, volume, grade, leak.
- **Sem onboarding/diagnostico inicial** — o Coach nao se apresenta nem coleta perfil/metas/tom na primeira interacao.
- **Sem cobranca de import** — nao detecta "voce nao importou ha X dias".
- **Memoria passiva** — o perfil so atualiza ao arquivar sessao. Nao incorpora "foco do mes", "metas ativas", "tom preferido" de forma estruturada.
- **Page context limitado** — 4 rotas. Nao cobre `/bankroll`, `/estudos`, `/stats`, `/biblioteca`, `/upload`.

### 3.2. News / "Sinal Externo" agent

**Arquivos:** `server/jobs/refreshNews.ts`, `server/services/news/` (orchestrator, xSearchProvider, blogScraperProvider, categorizeItem, dedupeLayers, titleFingerprint, urlCanonicalize, extractTweetUrls, htmlAdapters). ADRs 100, 106, 107, 110. Memory `session_2026-05-04-news-audit-and-news-3.md`.

**O que faz hoje:** feed externo de noticias/conteudo de poker mostrado na Home (zona "Sinal Externo") e em `/noticias`. **Historia:** ADR-106 introduziu provider Grok (xAI) que **gerava o feed via LLM** — auditoria de 2026-05-04 descobriu que era **100% conteudo fabricado** (titulos inventados, 73% das URLs mortas). ADR-107 (Sprint News-3) refatorou pra **RSS + busca X** real: `blogScraperProvider` faz scraping de blogs de poker (htmlAdapters por site), `xSearchProvider` usa a API de busca do X (xAI Live Search / Grok com search). `orchestrator` agrega, dedupe (multi-camada: URL canonica + title fingerprint), categoriza (`categorizeItem` — market/gossip/tools/sites/studies/tournament-results). Cron `refreshNews` (gated por `NEWS_FEED_ENABLED`). Ranking server-side (ADR-110): `score = engagement_norm * 0.6 + recency_norm * 0.4`, cache 5min. **Gate:** `NEWS_FEED_ENABLED=false` por default — o feed pode estar desligado em prod.

**Limitacoes:** depende de scraping fragil (htmlAdapters quebram quando o blog muda). Conteudo em ingles majoritariamente (poucas fontes BR). Categorizacao pode errar. Nao tem nada de IA "inteligente" alem da categorizacao — e basicamente um agregador. **Risco residual:** se `xSearchProvider` ainda usa Grok pra "resumir" ou "rankear", pode reintroduzir alucinacao — vale auditar se o uso e estritamente de busca/extract.

**Onde se conecta com a visao:** marginalmente. O "Sinal Externo" e mais um feature de Home do que um "agente IA". Poderia eventualmente: o Coach mencionar uma noticia relevante ("saiu um patch novo no GG sobre rake — afeta sua selecao"), mas e baixa prioridade.

### 3.3. Stats Analyzer OCR

**Arquivos:** `server/services/hudOcrPrompt.ts`, `hudOcrService.ts`, `server/routes/statsAnalyzer.ts`. ADRs 064, 065, 066, 067 ([067-ocr] — section-aware). Sprints Stats-V2/V3/V3.5. Memory `session_2026-05-01-stats-v3.md`, `stats-v3.5.md`.

**O que faz hoje:** o usuario faz upload de um screenshot de popup Hand2Note de stats → Claude vision (Haiku 4.5, modelo via env `OCR_MODEL`) extrai pares label/value, atribuindo cada stat ao heading/secao visual mais proxima acima (V3.5 — section-aware). System prompt cacheable (`cache_control: ephemeral`). Output JSON estrito (`{stats: [{section, label, value, confidence}]}`). Integra com o catalogo de 217 stats / 16 grupos (Stats-V2), 3-way compare (V3). Salva em `hud_stat_snapshots` (jsonb `values` por snapshot — nao ha row por (user, stat)). Tem benchmark populacional estatico (`hudStatsBenchmark.ts`) — V2 troca por dados Grindfy agregados. A tool do Coach `read_user_hud_stats` v2 le esses snapshots.

**Limitacoes:** OCR pode errar em screenshots borrados/comprimidos. Benchmark e estatico (nao reflete o pool real). Depende do usuario fazer upload manual (friccao — Hand2Note nao exporta API). Section detection e heuristica visual — pode atribuir errado.

**Onde se conecta com a visao:** muito relevante. O Coach pode (e ja parcialmente faz via `read_user_hud_stats`): "rodei seus stats — seu 3bet defense em BB esta em 35%, alvo e 28-32%, e isso bate com o leak que detectei". Quando o usuario sobe um print, o Coach poderia disparar uma conversa proativa de analise.

### 3.4. Usos "ocultos" de IA (4)

1. **Auto-titulo de sessao** (`coachAutoTitle.ts`) — Haiku gera titulo curto pra sessao de chat baseado nas primeiras mensagens.
2. **Sumarizacao de memoria** (`coachMemory.ts`) — Haiku gera resumo de sessao + atualiza perfil + resumo mensal.
3. **Recomendacao de lesson** (`recommendLessonForUser.ts`) — Anthropic escolhe 1 lesson da Biblioteca pro usuario (com 4 fallbacks deterministicos).
4. **Plano semanal de estudo** (`studyWeeklyPlanService.ts` + cron `generateWeeklyStudyPlan`) — Anthropic gera plano de estudo da semana (segunda 9h UTC), gated por acesso a coach + quota.

**Observacao:** ja existe um **embriao de "relatorio automatico"** — o cron de coach recommendation (segunda 6h BRT) + o cron de weekly study plan (segunda 9h UTC). Sao 2 jobs separados gerando 2 coisas diferentes. O Grindfy AI deveria **unificar** isso num "relatorio semanal" coerente.

### 3.5. Resumo do gap (estado atual vs visao do founder)

| Frente da visao | Estado atual | Gap |
|---|---|---|
| **Interacao / metodologia de conversa** | 3 personas reativas, tom OK mas nao calibrado, citations/confidence instruidos, memoria de perfil. | Sem onboarding/diagnostico. Sem proatividade real. Sem "blank page" solution. Tom nao personalizado. 3 personas fragmentam. |
| **Acesso a tools/dados (executar acoes)** | Infra existe (registry, runner, confirm/undo, audit). 5 read tools reais. **5 read tools "estrela" quebrados. 8 write tools fantasma (nao registrados).** | Religar o que ja existe. Adicionar write tools de grade/estudo. Page context em mais rotas. |
| **Ciclo de vida: primeira interacao** | Nao existe. | Onboarding/diagnostico inicial: perfil de jogador, metas, tom, opt-in de nudges, primeiro tour. |
| **Ciclo de vida: interacoes semanais** | 2 crons soltos (recommendation + study plan) na segunda. | Relatorio semanal unico e coerente. Cobranca de import. Nudge B-VOLUME (planejado vs jogado). |
| **Ciclo de vida: relatorios mensais automaticos** | Nao existe (so `monthlyCoachSummaries` que e resumo de chat, nao relatorio de performance). | Relatorio mensal de performance: comparativos, variancia, leaks resolvidos/novos, bankroll, metas. Acionado sozinho. |
| **Cobranca de import quando nao importou** | Nao existe. | Gap-check: detectar dias sem import → nudge gentil 1x/ciclo. |
| **Feedback continuo + sugestoes** | Reativo. Coach recommendation 1x/semana. | Daily debrief pos-sessao. Insights no relatorio semanal/mensal. Loop fechado leak→estudo→verificacao. |

---

## PARTE 4 — PLANO DEFINITIVO: TODAS AS IDEIAS

Organizado por tema. Cada ideia tem ID, descricao, e referencia ao ICE na Parte 5.

### Tema A — Consolidacao "Grindfy AI" (decisao arquitetural primeiro)

**A1. Unificar os 3 coaches num unico "Grindfy AI"** com **lentes/modos** em vez de personas separadas.
- **Como:** um system prompt base unico + bloco de contexto completo (todos os dados: dashboard, ROI por dimensao, bankroll, estudos, stats HUD, leaks, sessao ativa, plano semanal). O usuario pode pedir "foca no mental" ou "vamos falar de selecao" e o agente ajusta a lente — mas e sempre o mesmo agente, com a mesma memoria, vendo tudo.
- **Por que:** (1) o usuario nao precisa escolher; (2) o agente cruza dores sistemicas (mental+vida, leak+estudo) que hoje sao impossiveis porque cada coach so ve um pedaco; (3) menos prompts pra manter (DRY — lesson #10); (4) caching mais eficiente (um bloco estatico grande cacheado vs 3 separados).
- **Migracao:** manter `coachType` no body por back-compat (mapeia tudo pro agente unico; o `coachType` vira so uma dica de "lente inicial"). Pagina `/coach-ai` perde os 3 botoes de coach, ganha 1 chat + sugestoes contextuais. Tier gate vira "Grindfy AI: free = N msg/dia + tools basicas; pro = mais msg + write tools; premium = relatorios diarios + tudo".
- **Risco:** perder a "especializacao percebida". Mitigacao: o agente continua sabendo ser especialista em cada area — so nao forca o usuario a escolher.
- **Recomendacao do strategist:** **SIM, consolidar.** E pre-requisito de quase tudo (relatorios, loop fechado, dores sistemicas). Sem isso, continuamos com 3 features isoladas em vez de um copiloto.

**A2. Pagina `/coach-ai` vira "hub do Grindfy AI"** — chat + timeline de relatorios/nudges + audit de acoes + preferences, tudo num lugar.

### Tema B — Onboarding / primeira interacao com a IA

**B1. Diagnostico inicial conversacional.** Quando o usuario abre o Grindfy AI pela primeira vez (ou aceita um convite na Home), o agente conduz uma conversa estruturada de 3-5 min:
- "Ola — sou o Grindfy AI, seu copiloto de carreira. Pra te ajudar de verdade preciso te conhecer. Bora?"
- **Perfil de jogador:** quanto tempo joga serio? winner/breakeven/aprendendo? volume tipico? stakes? redes principais? formato favorito (Vanilla/PKO/Mystery)?
- **Importacao:** "Voce ja importou historico? Se sim, deixa eu olhar... [roda tools]. Se nao, te ensino a importar."
- **Metas:** "O que voce quer dos proximos 3 meses? (ex: subir de stake, sair do breakeven, dobrar volume, virar pro)" — registra como meta SMART.
- **Foco:** "Tem algum leak que voce ja sabe que precisa trabalhar?" — registra como foco do mes.
- **Tom:** "Como voce quer que eu te cobre? Gentil / direto / sem rodeio" — guarda no perfil.
- **Opt-in de nudges:** apresenta as categorias de nudge (relatorio semanal, mensal, downswing alert, cobranca de import, lembrete de estudo) com defaults sensatos (semanal ON, mensal ON, downswing ON, import ON, estudo ON, mental OFF, vida OFF). Quiet hours.
- Resultado: o `userAiProfile` fica rico desde o dia 1; o agente sabe quem e o usuario.

**B2. Re-onboarding leve.** Se o usuario ja existe mas o perfil esta vazio (caso da maioria hoje), o agente faz um diagnostico abreviado na proxima vez que abrir o chat. "Vi que ja temos historico aqui — deixa eu me apresentar direito e ajustar algumas coisas."

**B3. Deteccao de nivel automatica** + confirmacao. Heuristica: volume + ROI consistente + idade da conta + plano de assinatura → iniciante / intermediario / pro / high-stakes. O agente confirma com o usuario. Isso calibra o tom dos relatorios (iniciante = mais educacao; pro = menos hand-holding, mais variancia/carreira).

### Tema C — Metodologia de conversa

**C1. System prompt enriquecido** — alem do que ja tem, adicionar: nivel do jogador, metas ativas, foco do mes, tom preferido, padroes conhecidos (ex: "tende a tiltar apos bad-beat", "joga muito tarde"), e **pool intelligence BR** (metadata sobre Suprema/GG/Stars: skill level, rakeback effective, FX usado).

**C2. Citations + confidence tags universais** — ja instruido no prompt; reforcar: TODO numero citado leva `[fonte: Dashboard > 30d > 142 torneios]`; toda afirmacao baseada em amostra pequena leva ⚠️; toda incerteza vira `[nao sei: motivo]` em vez de inventar.

**C3. Proatividade calibrada** — o agente nao espera. Quando o usuario abre o chat, ele ja chega com contexto: "Boa, [nome]. Vi que voce fechou +$280 essa semana, acima da sua media. Mas notei que voce nao registrou estudo em 3bet defense ainda — sua semana acaba quarta. Quer que eu agende 30 min hoje? Ou prefere falar de outra coisa?"

**C4. Anti-blank-page** — quick suggestions contextuais sempre visiveis no chat, mudando conforme a pagina/estado: "Analisar meu ROI por site", "Sugerir grade da proxima semana", "Por que estou no vermelho?", "Simular: e se eu perder 10 buy-ins?". Na tela de Bankroll, sugestoes diferentes. Na tela de Grade Planner, outras.

**C5. Memoria de longo prazo estruturada** — o `userAiProfile` deixa de ser so prosa livre e ganha campos estruturados (JSON ou secoes fixas): `{nivel, metas: [...], focoDoMes, tomPreferido, padroesConhecidos: [...], ultimaRevisaoCarreira, redesPrincipais: [...]}` + um campo de prosa pra notas qualitativas. Atualizado nao so ao arquivar sessao, mas tambem por write tools (quando o agente registra uma meta, atualiza o perfil).

**C6. Follow-ups inteligentes** — se o usuario diz "vou trabalhar 3bet defense esse mes", o agente: (1) registra como foco (`log_leak_focus`), (2) recomenda conteudo (`recommend_lesson`), (3) oferece agendar (`schedule_study_block`), (4) **lembra de cobrar** em 7 dias se nao houver atividade (nudge B-STUDY), (5) **verifica progresso** em 30d (`verify_leak_progress`).

**C7. Tom personalizado** — 3 variantes de tom (gentil / direto / sem rodeio) aplicadas via instrucao no prompt baseada no campo `tomPreferido`. Sempre condicional ("voce poderia considerar", nunca "voce deve") em outputs financeiros. Sempre disclaimer regulatorio em recomendacoes de saque/staking/tax.

### Tema D — Tools / acoes (catalogo)

**Politica de confirmacao:** cada tool tem nivel — `none` (read, executa direto), `confirm` (write, mostra diff + 1 clique + undo 5min), `confirm-strict` (write em dinheiro/grade grande, mostra diff detalhado + confirmacao explicita + undo). NUNCA existem `delete_*` tools v1 — so criacao + edicao com diff.

**D1. Religar os 5 read tools "estrela" do Coach-2A** (P0 — codigo ja existe na "baseline broken", precisa consertar):
- `query_dimension` — ROI/profit/volume/ITM/ABI/FTs/cravadas com filtros e groupBy (site/categoria/speed/buyinRange/dayOfWeek/month/fieldSize). [confirmacao: none]
- `find_top_leaks` — detector rule-based de leaks com severidade + evidencia. [none]
- `get_tournament_suggestions` — Tournament Selector ranqueado pra uma data/contexto. [none]
- `explain_tournament_score` — discriminacao por sinal de por que um torneio recebeu o score. [none]
- `simulate_bankroll_scenario` — impacto na banca de cenario hipotetico (perder N BI, lucrar X, win/lose streak) + violacao de regra. [none]

**D2. Registrar as 8 write tools que ja tem handler escrito** (P0 — arquivos existem em `handlers/`, precisam ir pro `index.ts`):
- `register_tournament_in_grade(templateId, day, time, profile)` — adiciona torneio ao Grade Planner. [confirm]
- `record_wallet_transaction(walletId, amount, currency, type, reason)` — deposito/saque/transferencia inter-wallet/rakeback. [confirm-strict — mexe em dinheiro]
- `start_grind_session(profile?, plannedTournaments?)` — inicia sessao de grind. [confirm]
- `log_session_completed(sessionId, profitLoss, notes?)` — fecha sessao. [confirm]
- `log_leak_focus(leak, status)` — escolhe foco do mes. [confirm]
- `verify_leak_progress(leak)` — compara stat focada vs media historica + benchmark. [none — e read]
- `log_study_session(topic, duration, source)` — registra tempo de estudo. [confirm]
- (`read_cooldown_history` ja esta religado.)

**D3. Tools novas de grade/estudo** (Fase 2):
- `bulk_propose_grade(date, profile, hoursTarget)` — gera grade inteira (8-12 torneios) pra 1 confirmacao em massa. [confirm-strict]
- `schedule_study_block(topic, datetime, duration)` — integra com calendar_events. [confirm]
- `create_study_theme(name, linkedStats?, linkedSpots?)` — cria tema de estudo. [confirm]
- `define_career_goal(goal, deadline, successMetric)` — registra meta SMART/OKR. [confirm]
- `evaluate_career_goal(goalId)` — verifica progresso. [none — read]
- `mark_off_day(date)` — registra dia de folga. [confirm]

**D4. Tools de diagnostico/analise** (Fase 2):
- `analyze_variance(period, dimension)` — calculo de variancia (n samples, std-dev, intervalos de confianca). [none]
- `diagnose_plateau()` — combina `find_top_leaks` + `analyze_variance` + grind/study ratio + mental → identifica a causa. [none]
- `compute_grind_study_ratio(period)` — horas grind vs horas estudo, alerta se grind > 5x estudo. [none]
- `calculate_effective_rake(period, site)` — rake pago vs rakeback recebido, detecta sites onde rake > rakeback. [none]
- `query_pool_intelligence(network)` — metadata sobre a rede (skill level, rakeback, FX). [none]
- `generate_career_plan(horizon)` — plano de 90/180/365d com checkpoints + KPIs. [none — gera, nao persiste sozinho]

**D5. Tools de mental** (Fase 2, opt-in default OFF):
- `log_mental_state(state, intensity, trigger?)` — registra estado mental (pre/durante/pos sessao). [confirm]
- `log_mental_hand(situation, emotion, response, idealResponse)` — Mental Hand History (framework Tendler). [confirm]
- `log_cgame_split(sessionId, aPct, bPct, cPct)` — % do tempo em A/B/C-game pos sessao. [confirm]

**D6. Tool de invocar o OCR de stats** — quando o usuario menciona "subi um print do meu HUD", o agente pode invocar o pipeline de OCR e ler o resultado. [none — ja existe a infra do Stats Analyzer; falta a tool bridge.]

**D7. Page context em mais rotas** — adicionar `/bankroll` (wallets, saldos, ultima transacao), `/estudos` (foco ativo, streak, temas), `/stats` (layout ativo, ultimo snapshot), `/biblioteca` (curso/lesson em progresso), `/upload` (ultimo import — data, redes, contagem).

### Tema E — Acesso a dados (sem estourar tokens)

**E1. Estrategia de contexto em 3 camadas:**
- **Camada estatica (cacheada):** perfil do jogador + snapshot resumido de stats (ROI, profit, volume, ABI, ITM — 5 numeros) + ultimo resumo de sessao + resumo mensal mais recente. ~1-2k tokens, cacheado.
- **Camada dinamica (nao cacheada):** estado atual (sessao ativa, page context, plano semanal, foco do mes, metas ativas, leaks recentes). ~0.5-1k tokens.
- **Camada sob demanda (tools):** tudo que e detalhado/grande (ROI por todas as dimensoes, historico de bankroll, todos os stats HUD, sugestoes de torneio, etc.) — o agente chama a tool quando precisa, nao carrega tudo de antemao.

**E2. Sumarizacao hierarquica** (pra relatorios): Haiku roda mensalmente sumarizando dados do mes; o relatorio trimestral le 3 meses ja sumarizados em vez de dados crus. Ja parcialmente existe (`checkMonthlyCompaction`).

**E3. Tool batching** — `bulk_query_dimensions(dimensions: string[])` em vez de N chamadas separadas de `query_dimension`. Importante pra relatorios (que precisam de muitas dimensoes).

**E4. Truncamento + paginacao nas tools** — toda tool que retorna lista trunca por `limit` (default sensato) + nota "ha mais N". O agente pede mais se precisar.

### Tema F — Relatorios automaticos

**F1. Daily Debrief** (Premium-only) — apos `grind_session.status='completed'`, o agente gera um debrief curto: "Sessao de 4h, 18 torneios, +$120 (ROI 6.7%). Foi variancia ou erro? Rodei seus stats — nada de anormal. 1 spot vale revisar (te mando). Como esta seu C-game hoje?" — 1 card in-app + opcao de continuar no chat. Custo ~$0.013.

**F2. Weekly Report** (Pro+) — segunda-feira 7h timezone do user (consolidar com os 2 crons que ja rodam na segunda). Estrutura:
- **Cabecalho** com tom pessoal: "Sua semana — 5/mai a 11/mai. Voce jogou 18h, 47 torneios, +$280 (ROI 8.2%). Boa semana — acima da sua media de 6 semanas."
- **Secao 1 — Volume + Resultados:** sessoes concluidas vs planejadas, torneios/ITM%/FTs/cravadas, ROI da semana vs media 30d.
- **Secao 2 — Bankroll:** profit por moeda nativa + USD, BR atual vs inicio da semana, transferencias/saques.
- **Secao 3 — Selection:** torneios novos jogados, top 3 categorias ROI+, bottom 3 com leak de selection ("30 hypers GG, ROI -8% em 90d — bloqueio pra proxima?").
- **Secao 4 — Estudos:** tempo de estudo registrado, topicos cobertos, foco escolhido vs cobertura real.
- **Secao 5 — Mental + Operacional (opt-in):** sessoes com tilt reportado, off days, sleep self-report.
- **Secao 6 — 3 insights do Coach (LLM-generated):** acoes especificas, sempre data-grounded.
- **Secao 7 — Plano da proxima semana:** sugestao de grade (Tournament Selector), 1 foco de estudo, 1 acao recomendada.
- **Secao 8 — CTA:** "Quer ajustar seu plano? Posso registrar mudancas. Responda neste email ou abra o chat."
- Custo ~$0.045. Canais: in-app card (sempre) + email HTML (opt-in default ON) + push (opt-in default OFF) + PDF on-demand + "discutir com coach" (abre sessao com contexto pre-carregado).

**F3. Monthly Report** (Pro+, versao resumida pra Free) — dia 1 do mes seguinte, 9h timezone do user. Tudo do weekly +:
- **Comparativos:** vs mes anterior + vs media 6 meses + vs media 12 meses.
- **Variancia analysis:** std-dev, intervalos de confianca, "voce esta dentro do esperado?".
- **Leaks resolvidos vs novos:** visualizacao Inchworm (se opt-in mental).
- **Goals progress:** % das metas batidas.
- **C-game movement (opt-in):** % do tempo em A-game, subiu vs mes anterior?
- **Carreira KPI:** trajetoria 90d/180d/365d.
- Custo ~$0.11.

**F4. Quarterly Career Review** (Premium-only, Fase 2) — dia 1 jan/abr/jul/out. Revisao de metas + plano novo de 90 dias + decisoes pendentes (shot, dropar CLT, staking) + (jan/fev) ajuda a compilar P&L anual pra IRPF (extrato organizado, NAO calculo fiscal). Custo ~$0.18.

**F5. Gap-check pre-relatorio (cobranca de dados faltantes)** — D-3 dias antes do relatorio mensal (e na geracao do semanal), o agente roda um check do estado real e abre 1 conversa gentil:
```
Vi que talvez esteja faltando alguns dados pro seu relatorio:
- [ ] 5 sessoes sem report manual. Quer registrar agora?
- [ ] Voce escolheu foco "3bet defense" mas nao atualizou stats. Sobe um print do HUD?
- [ ] Snapshot de bankroll do mes pendente. Posso puxar os saldos?
- [ ] 0h de estudo registrado. Houve estudo nao registrado?
- [ ] Voce nao importou CSV desde dia 3 — 8 sessoes no escuro. Bora importar?
(Se voce ja fez por outro caminho, ignora — botao "ignorar pra esse relatorio".)
```
Cobranca **1x por ciclo**, re-cobra so no proximo. Sempre valida o estado real (nunca confia em flag stale) pra evitar falso positivo.

**F6. Cobranca de import (standalone, alem do gap-check)** — nudge B-IMPORT: se `upload_history` nao tem entrada ha N dias (configuravel, default 5) E o usuario tem sessoes de grind registradas no periodo → 1 nudge gentil 1x/semana. "Voce registrou 6 sessoes essa semana mas nao importou nenhum CSV — estou meio cego sobre seus resultados reais. Bora importar?" Com link direto pro /upload.

**F7. Personalizacao por nivel** — relatorio iniciante: mais educacao ("ROI <5% em hypers e normal — aqui esta o benchmark"), menos secoes. Intermediario: foco em leaks acionaveis + selection + comparativo com pool BR. Pro: foco em variancia + carreira + longo prazo, menos hand-holding. High-stakes: custom, opt-in de secoes.

**F8. Fail-soft** — se a Anthropic API falhar 3x na geracao, render um relatorio deterministico (template com numeros + tabelas, sem prosa LLM) e avisa o usuario. Nunca deixa o usuario sem relatorio.

### Tema G — Feedback continuo (cadencia + canais)

**G1. Cadencia de feedback:**
- **Pos-sessao (Daily Debrief)** — so se opt-in (Premium). Card in-app.
- **Semanal (Weekly Report)** — default ON (Pro+). In-app + email.
- **Mensal (Monthly Report)** — default ON. In-app + email.
- **Trimestral (Career Review)** — default ON (Premium). In-app + email.
- **Event-driven:** downswing detectado (B-DOWNSWING), upload novo com leak novo (B-LEAK), foco sem atividade 7d (B-STUDY), volume planejado vs jogado terca (B-VOLUME), fim do mes sem snapshot (B-SNAPSHOT), padrao de schedule ruim (B-LIFE, opt-in OFF).

**G2. Canais:** in-app card (sempre, fica ancorado na timeline do hub) > email HTML (opt-in, default ON pra relatorios) > push notification (opt-in, default OFF, so "novo relatorio disponivel") > PDF download (on-demand). Nunca SMS.

**G3. Anti-fadiga (OBRIGATORIO antes de qualquer nudge novo ir live):**
- Opt-out granular por categoria (8+ toggles — ja existe `coachPreferences`).
- Quiet hours (default 9-21 timezone local — ja existe).
- Frequency cap: max 3 nudges/dia + max 1 nudge/hora (excluindo eventos criticos como downswing severo — ja existe).
- Snooze 1-clique em cada nudge: "nao agora" (1 dia) + "nao por enquanto" (30 dias).
- Telemetria: `dismissed`, `engaged`, `unsubscribed_after`. Se >30% dismiss em 7d numa categoria → congela e revisa.
- Kill switch por categoria (admin).

**G4. Loop fechado (o feedback gera acao):** cada secao de relatorio e cada nudge tem 1+ CTA estruturado que vira tool: "Registrar 5 sessoes" → `bulk_create_grind_sessions`; "Atualizar foco" → `log_leak_focus`; "Sugerir grade" → `bulk_propose_grade` + `register_tournament_in_grade`×N; "Marcar dia off" → `mark_off_day`; "Retirar X% do BR" → `record_wallet_transaction`; "Definir meta" → `define_career_goal`.

### Tema H — Mental tracking (diferenciador maximo, Fase 2)

**H1. C-game tracker** — pos-sessao, o agente pergunta "que % do tempo voce jogou A/B/C-game hoje?". Traca o movimento Inchworm (A-game melhora? C-game encolhe?) ao longo dos meses. **Ninguem tem isso digitalizado dentro de um tracker.** Diferenciador competitivo enorme. Opt-in.

**H2. Mental Hand History (Tendler framework)** — o agente registra "mental hands" — situacoes onde voce reagiu mal emocionalmente: situacao, emocao, resposta real, resposta ideal. Pra revisao posterior. Aparece no relatorio mensal.

**H3. Padrao de schedule + wellbeing prompts** — detectar sessoes >6h consecutivas, multiplos dias seguidos sem off, sessao apos 2am → "notei 5 dias seguidos com sessao apos 1am — que tal agendar 1 dia off?". 1x/semana opt-in: "como anda sleep / treino / vida social? notou impacto nas sessoes?". Conecta ao Inchworm. **Risco alto de ser invasivo — opt-in default OFF, kill por categoria.**

### Tema I — Conexao com News + Stats OCR

**I1. Coach menciona news relevante** (baixa prioridade) — se o feed externo tem algo que afeta o usuario ("patch novo no GG sobre rake", "campo novo soft na Suprema"), o Coach pode mencionar no relatorio semanal. So se `NEWS_FEED_ENABLED`.

**I2. Coach reage a upload de print de HUD** — quando o usuario sobe um screenshot de stats, o pipeline de OCR roda e o Coach dispara uma conversa proativa: "Rodei seus stats — seu 3bet defense em BB esta 35% (alvo 28-32%). Bate com o leak que detectei semana passada. Quer um plano pra trabalhar isso?"

**I3. Auditar `xSearchProvider`** — confirmar que o uso de Grok/xAI no News e estritamente busca/extract (nao "resumir" ou "rankear" via LLM), pra nao reintroduzir o problema de 2026-05-04 (conteudo fabricado).

---

## PARTE 5 — PRIORIZACAO ICE

**Notacao:** I (Impact 1-10) × C (Confidence 1-10) × E (Ease 1-10, MAIOR = mais facil). Score = (I + C + E) / 3.

| # | Iniciativa | I | C | E | Score | Prioridade | Fase |
|---|---|---|---|---|---|---|---|
| **D1** | Religar os 5 read tools "estrela" do Coach-2A (codigo ja existe, baseline broken) | 9 | 9 | 7 | **8.3** | **P0** | 0 |
| **D2** | Registrar as 8 write tools que ja tem handler escrito | 9 | 8 | 7 | **8.0** | **P0** | 0 |
| **A1** | Consolidar 3 coaches em "Grindfy AI" unico com lentes | 9 | 8 | 6 | **7.7** | **P0** | 0 |
| **C2** | Citations + confidence tags universais (reforçar — ja instruido) | 8 | 9 | 9 | **8.7** | **P0** | 0 |
| **D7** | Page context em mais rotas (/bankroll, /estudos, /stats, /biblioteca, /upload) | 7 | 8 | 8 | **7.7** | P1 | 0 |
| **C1** | System prompt enriquecido (nivel, metas, foco, tom, pool BR) | 8 | 8 | 7 | **7.7** | P1 | 0/1 |
| **C5** | Memoria de longo prazo estruturada (perfil com campos fixos) | 7 | 7 | 7 | **7.0** | P1 | 1 |
| **G3** | Anti-fadiga: opt-out granular + snooze + telemetria (parcialmente existe) | 9 | 9 | 8 | **8.7** | **P0** (gate de tudo proativo) | 1 |
| **B1** | Diagnostico inicial conversacional (onboarding com a IA) | 9 | 7 | 6 | **7.3** | P1 | 1 |
| **B2** | Re-onboarding leve (perfil vazio → diagnostico abreviado) | 7 | 7 | 8 | **7.3** | P1 | 1 |
| **F2** | Weekly Report (consolidar os 2 crons da segunda) | 9 | 8 | 5 | **7.3** | P1 | 1 |
| **F6** | Cobranca de import (nudge B-IMPORT) | 8 | 9 | 8 | **8.3** | P1 | 1 |
| **F5** | Gap-check pre-relatorio (cobranca de dados faltantes) | 8 | 8 | 6 | **7.3** | P1 | 1 |
| **C3/C4** | Proatividade calibrada + anti-blank-page (quick suggestions contextuais) | 8 | 8 | 7 | **7.7** | P1 | 1 |
| **F1** | Daily Debrief (Premium-only) | 8 | 8 | 5 | **7.0** | P1 | 1 |
| **F3** | Monthly Report (comparativos + variancia) | 9 | 8 | 4 | **7.0** | P1 | 1 |
| **C6** | Follow-ups inteligentes (foco → estudo → cobranca → verificacao) | 8 | 7 | 6 | **7.0** | P1 | 1/2 |
| **F8** | Fail-soft (relatorio deterministico se LLM falhar) | 7 | 9 | 7 | **7.7** | P1 | 1 |
| **B3** | Deteccao de nivel automatica + confirmacao | 6 | 7 | 7 | **6.7** | P2 | 1 |
| **C7** | Tom personalizado (gentil/direto/sem rodeio) | 6 | 7 | 8 | **7.0** | P2 | 1 |
| **D3** | Tools novas de grade/estudo (bulk_propose_grade, schedule_study_block, etc.) | 8 | 7 | 5 | **6.7** | P2 | 2 |
| **D4** | Tools de diagnostico (analyze_variance, diagnose_plateau, calculate_effective_rake) | 8 | 6 | 5 | **6.3** | P2 | 2 |
| **D6** | Tool bridge pro OCR de stats | 6 | 7 | 6 | **6.3** | P2 | 2 |
| **I2** | Coach reage a upload de print de HUD | 6 | 6 | 6 | **6.0** | P2 | 2 |
| **F4** | Quarterly Career Review + ajuda IRPF | 8 | 6 | 4 | **6.0** | P2 | 2 |
| **H1** | C-game tracker + Inchworm visualization | 8 | 6 | 4 | **6.0** | P2 | 2 |
| **H2** | Mental Hand History (Tendler) | 7 | 6 | 4 | **5.7** | P2 | 2 |
| **D5** | Tools de mental (log_mental_state, log_cgame_split) | 7 | 6 | 5 | **6.0** | P2 | 2 |
| **B-DOWNSWING** | Nudge de downswing detectado | 7 | 7 | 6 | **6.7** | P2 | 2 |
| **B-VOLUME** | Nudge volume planejado vs jogado (terca) | 6 | 7 | 7 | **6.7** | P2 | 2 |
| **B-GRADE** | Nudge sugerir grade (sabado) | 6 | 6 | 6 | **6.0** | P2 | 2 |
| **H3** | Padrao de schedule + wellbeing prompts (opt-in OFF) | 7 | 5 | 5 | **5.7** | P2 | 2 |
| **D4-career** | define_career_goal + generate_career_plan | 7 | 6 | 5 | **6.0** | P2 | 2 |
| **I1** | Coach menciona news relevante | 4 | 5 | 6 | **5.0** | P3 | depois |
| **I3** | Auditar xSearchProvider (evitar conteudo fabricado) | 5 | 8 | 8 | **7.0** | P1 (rapido) | 0 |
| **F7** | Personalizacao de relatorio por nivel | 6 | 6 | 5 | **5.7** | P2 | 2 |
| **A2** | Pagina /coach-ai vira hub (chat + timeline + audit + prefs) | 6 | 7 | 6 | **6.3** | P1 | 1 |

**Top 6 (P0 — fazer primeiro, todos cabem na Fase 0):**
1. **C2 — Citations/confidence universais** (8.7) — 1-2 dias, ja quase pronto.
2. **G3 — Anti-fadiga completo** (8.7) — gate de tudo proativo, parcialmente existe.
3. **D1 — Religar 5 read tools** (8.3) — desbloqueia o Coach analitico.
4. **F6 — Cobranca de import** (8.3) — visao do founder, simples.
5. **D2 — Registrar 8 write tools** (8.0) — desbloqueia o Coach "executor".
6. **A1 — Consolidar coaches** (7.7) — pre-requisito de quase tudo.

---

## PARTE 6 — ROADMAP PROPOSTO

Respeita o pipeline TDD da casa: `pm-spec → system-architect → test-writer → implementer → reviewer → (deployer opcional)`. Sem detalhar implementacao — so o shape dos sprints.

### FASE 0 — "Religar + Consolidar" (~2-3 semanas)

**Sprint AI-0A — Religar tools + citations** (~1 semana)
- Escopo: consertar/religar os 5 read tools do Coach-2A (`query_dimension`, `find_top_leaks`, `get_tournament_suggestions`, `explain_tournament_score`, `simulate_bankroll_scenario`) — investigar por que a "baseline broken", reescrever handlers se preciso, registrar no `index.ts`, remover stubs. Registrar as 8 write tools (handlers ja existem). Reforcar citations/confidence no prompt. Auditar `xSearchProvider` (News).
- Dependencias: nenhuma (e o ponto de partida).
- ADRs provaveis: errata aos ADRs 023/024 (registry — remover stubs), nada novo.
- Gate: reviewer APPROVED + founder QA (testar o Coach realmente olhando ROI por site + executando 1 write tool com confirm/undo).

**Sprint AI-0B — Consolidar "Grindfy AI"** (~1-1.5 semanas)
- Escopo: unificar os 3 system prompts num base unico + bloco de contexto completo (todos os dados, com tools pro detalhe). Manter `coachType` por back-compat (vira "lente inicial"). Page context em mais rotas (/bankroll, /estudos, /stats, /biblioteca, /upload). Pagina `/coach-ai` ajustada (1 chat + sugestoes contextuais, mantendo as abas embeddadas). Tier gate ajustado ("Grindfy AI" em vez de "3 coaches").
- Dependencias: AI-0A (tools religadas).
- ADRs provaveis: ADR novo "consolidacao Grindfy AI — agente unico com lentes" (supersedes a separacao de personas). ADR "page context discriminated union — novas rotas".
- Gate: reviewer APPROVED + founder QA + zero regressao nos ~8500 testes.

### FASE 1 — "Ciclo de vida" (~4-6 semanas)

**Sprint AI-1A — Anti-fadiga + onboarding** (~1.5 semanas)
- Escopo: completar opt-out granular (snooze 1-clique "nao agora"/"nao por enquanto", telemetria dismissed/engaged/unsubscribed, kill switch admin — parte ja existe em `coachPreferences`/`nudgeEngine`). Diagnostico inicial conversacional (B1) + re-onboarding leve (B2) + deteccao de nivel (B3). Memoria de longo prazo estruturada (C5 — perfil com campos fixos). System prompt enriquecido (C1).
- Dependencias: AI-0B (agente consolidado).
- ADRs provaveis: ADR "perfil estruturado (campos fixos + prosa)". ADR "onboarding conversacional — flow + persistencia". ADR "deteccao de nivel — heuristica".
- Gate: reviewer APPROVED + founder QA do onboarding (passar pela conversa, ver perfil populado).

**Sprint AI-1B — Relatorio semanal + cobranca de import** (~1.5-2 semanas)
- Escopo: job runner timezone-aware (node-cron — ja temos `cronRunner`, formalizar). `report_jobs` + `reports` tables + idempotencia. Weekly Report (F2) consolidando os 2 crons da segunda. Gap-check pre-relatorio (F5). Nudge B-IMPORT (F6). Multi-canal (in-app card + email HTML). Proatividade calibrada + quick suggestions contextuais (C3/C4). Fail-soft (F8). Pagina /coach-ai vira hub com timeline (A2).
- Dependencias: AI-1A (anti-fadiga obrigatorio antes de qualquer nudge novo).
- ADRs provaveis: ADR "report_jobs/reports schema + idempotencia". ADR "job runner timezone-aware (formalizar cronRunner)". ADR "email HTML pipeline pra relatorios". ADR "gap-check — validacao de estado real".
- Gate: reviewer APPROVED (idempotencia stress test, fail-soft testado, custo Anthropic medido <$0.05/weekly) + founder QA 1 semana antes do mensal.

**Sprint AI-1C — Daily Debrief + Monthly Report** (~1.5-2 semanas)
- Escopo: Daily Debrief pos-sessao (F1, Premium-only). Monthly Report (F3) com comparativos + variancia. Tier gating estrito (Daily = Premium; Free = Monthly resumido). Sumarizacao hierarquica Haiku→Sonnet (E2 — parte ja existe). Tool batching `bulk_query_dimensions` (E3). Personalizacao por nivel (F7). Follow-ups inteligentes (C6 — leak→estudo→cobranca→verificacao).
- Dependencias: AI-1B (infra de relatorios).
- ADRs provaveis: ADR "tier gating de relatorios". ADR "sumarizacao hierarquica — Haiku monthly → Sonnet quarterly". ADR "tool batching — bulk_query_dimensions".
- Gate: reviewer APPROVED (P95 < 90s pro Monthly, custo <$0.15) + founder QA 1 semana.

### FASE 2 — "Tecnico de carreira" (~4-6 semanas)

**Sprint AI-2A — Write tools de grade/estudo + diagnostico** (~2 semanas)
- Escopo: `bulk_propose_grade`, `schedule_study_block`, `create_study_theme`, `mark_off_day` (D3). `analyze_variance`, `diagnose_plateau`, `compute_grind_study_ratio`, `calculate_effective_rake`, `query_pool_intelligence` (D4). Tool bridge pro OCR de stats (D6) + Coach reage a upload de print (I2). Nudges B-DOWNSWING, B-VOLUME, B-GRADE (crons novos).
- Dependencias: AI-1C (relatorios — os relatorios usam essas tools nos CTAs).
- ADRs provaveis: ADR "metodologia de calculo de variancia". ADR "diagnose_plateau — combinacao de sinais". ADR "pool intelligence BR — fonte de metadata".
- Gate: reviewer APPROVED + founder QA das write tools (montar grade via conversa, confirmar, desfazer).

**Sprint AI-2B — Carreira + mental** (~2 semanas)
- Escopo: `define_career_goal` + `evaluate_career_goal` + `generate_career_plan` (D4-career). Quarterly Career Review (F4) + ajuda IRPF. C-game tracker + Inchworm visualization (H1). Mental Hand History (H2). `log_mental_state`/`log_cgame_split` (D5). Padrao de schedule + wellbeing prompts (H3, opt-in OFF). Disclaimer regulatorio reforcado em outputs financeiros.
- Dependencias: AI-2A.
- ADRs provaveis: ADR "mental_hand_history + cgame_split schema". ADR "career_goals schema (substitui o Sprint Goal Setting cancelado)". ADR "disclaimer regulatorio — superficie e tom".
- Gate: reviewer APPROVED (disclaimer presente, opt-in obrigatorio em mental/wellbeing) + strategist UX audit (wireframes: Mental Hand History form, Inchworm chart, Quarterly Review) + founder QA 2 semanas antes de alpha externo.

### Itens transversais (rodam em paralelo, sem bloqueio)
- Telemetria de nudge (`dismissed/engaged/unsubscribed`) — inicio da Fase 1.
- Budget alerts admin dashboard (`cost_per_user_30d`) — Fase 1B.
- Conversation timeline UI no hub — Fase 1B.
- Pool intelligence BR no system prompt — Fase 1A.

### Marcos de approval do founder (por contrato de autonomia)
| Marco | Quando | O que valida |
|---|---|---|
| M1 | Pos pm-spec AI-0A | Escopo "religar tools" + descobrir o que ta quebrado na baseline |
| M2 | Pos reviewer AI-0A | Coach realmente olha ROI por site + executa 1 write tool |
| M3 | Pos pm-spec AI-0B | Decisao de consolidar os 3 coaches (ADR) |
| M4 | Pos reviewer AI-0B | Agente unico funcionando, zero regressao |
| M5 | Pos pm-spec AI-1A | Flow de onboarding + perfil estruturado |
| M6 | Pos pm-spec AI-1B | Schema reports + custo Anthropic estimado + tier gating |
| M7 | Pos reviewer AI-1B | Idempotencia + fail-soft + cobranca de import |
| M8 | Pos QA 1 semana | Continua pra AI-1C |
| M9 | Pos pm-spec AI-1C | Tier gating de relatorios + sumarizacao hierarquica |
| M10 | Pos pm-spec AI-2A | Write tools de grade — confirmacao/undo |
| M11 | Pos pm-spec AI-2B | Mental tracking UX (wireframes) |
| M12 | Pos QA 2 semanas | Pronto pra alpha externo |

---

## PARTE 7 — RISCOS E QUESTOES ABERTAS PARA O FOUNDER DECIDIR

### Riscos (com mitigacao)

| # | Risco | Severidade | Mitigacao |
|---|---|---|---|
| **R1** | **Nag fatigue** — nudges demais → usuario desliga tudo ou cancela | ALTA | Anti-fadiga (G3) e **gate obrigatorio** antes de qualquer nudge novo: opt-out granular, quiet hours, frequency cap, snooze 1-clique, telemetria com auto-congelamento se >30% dismiss. Sprint AI-1A vem antes de qualquer relatorio/nudge. |
| **R2** | **Custo Anthropic explode** — 1000 premium × daily+weekly+monthly+nudges = $1-2k/mes | MEDIA-ALTA | Prompt caching ja em prod (~75% off). Haiku pra sumarizacao (so polir com Sonnet). Tier gating estrito (Daily = Premium; Free = Monthly resumido). Budget alerts por usuario. Auto-disable se passar $X/dia. Fail-soft deterministico. |
| **R3** | **Acoes erradas** — write tool registra transacao/grade errada → quebra confianca permanente | ALTA | Confirmacao **obrigatoria** em toda write tool (diff visual antes). Undo 5min (`payload_before` em `coach_actions`). Audit log persistente. Rate limit 5 writes/turn. Sem `delete_*` tools v1. Confirmacao "strict" pra dinheiro. |
| **R4** | **Coach vira advisor financeiro nao licenciado** — "saca R$50k" → prejuizo → processo | MEDIA | Disclaimer explicito em todo output que mencione $/BR. Tom condicional sempre ("poderia considerar", nunca "deve"). Coach NAO opina sobre tax/regulamentacao/staking — deflete pra profissional. TOS update. |
| **R5** | **Falso positivo na cobranca** — "voce nao fez snapshot" mas fez por outro caminho | MEDIA | Gap-check sempre valida estado real (query, nunca flag stale). Tom gentil + caveat ("se voce ja fez, ignora"). 1x por ciclo. |
| **R6** | **Latencia de relatorio** — Monthly demora 60s+ → usuario fecha | BAIXA | Relatorios sao async (job background) — usuario abre relatorio JA pronto (<500ms). Nudge "seu relatorio esta pronto". SLA P95 <90s com alert. |
| **R7** | **Limites tecnicos do Claude** (context window, tool calls) em Quarterly | BAIXA | Sumarizacao hierarquica (Haiku mensal → Sonnet trimestral le ja sumarizado). Tool batching. Limite 5 tools/turn (mas em relatorio o orquestrador chama tools ANTES do LLM ler — fluxo diferente). |
| **R8** | **News reintroduz conteudo fabricado** se `xSearchProvider` usar Grok pra resumir/rankear | BAIXA | Auditar (I3) — confirmar uso estritamente de busca/extract. |
| **R9** | **Pipeline TDD lento demais pro prazo** | MEDIA | Aceitar. Pipeline TDD e o contrato. Cortar escopo (ex: Quarterly Review → fase posterior), nao etapas. |
| **R10** | **Consolidar coaches quebra UX percebida** ("perdi meu coach mental especialista") | BAIXA | O agente continua sabendo ser especialista — so nao forca escolha. Comunicar bem na migracao. Manter `coachType` por back-compat. |

### Questoes abertas — decisoes do founder

1. **Consolidar os 3 coaches em "Grindfy AI" unico?** Recomendacao do strategist: SIM (e pre-requisito de quase tudo). Mas o founder pode preferir manter 3 personas por questao de produto/marketing. **Decisao bloqueia o Sprint AI-0B.**

2. **Relatorios automaticos: opt-in ou opt-out?** Recomendacao: opt-OUT pro semanal e mensal (default ON — sao alto valor, baixa friccao), opt-IN pro daily debrief (default OFF — mais frequente) e pra qualquer coisa de mental/vida (default OFF — sensivel). O founder decide se aceita default ON pra relatorios.

3. **Qual modelo Claude pro Coach principal?** Hoje `claude-sonnet-4-6` (chat) + `claude-haiku-4-5` (memoria/OCR/recomendacao). Manter? Considerar Sonnet 4.7+ quando sair? Custo vs qualidade. **Decisao afeta orcamento.**

4. **Nivel de autonomia das write tools — confirmacao sempre, ou algumas tools "auto-aprovadas"?** Recomendacao: confirmacao SEMPRE v1 (nada auto). Eventualmente o usuario poderia "confiar" certas tools (ex: `log_study_session` sempre confirma — irritante). Mas v1: tudo confirma. O founder decide se aceita essa friccao inicial.

5. **Relatorios e features proativas viram tier pago?** Recomendacao: Daily Debrief + Quarterly Review = Premium-only; Weekly + Monthly = Pro+; Free recebe Monthly resumido. Tools de leitura = Pro+; write tools = Pro+. **Decisao afeta pricing.**

6. **Privacidade dos dados / mental tracking** — o Coach vai registrar estado mental, padrao de sono, vida social (se opt-in). Founder OK com isso? Precisa de termo de consentimento especifico? GDPR/LGPD export? **Decisao afeta TOS + Fase 2B.**

7. **Email como canal** — relatorios por email HTML exige SMTP funcionando + design de template + unsubscribe link (CAN-SPAM/LGPD). O founder quer email desde a Fase 1, ou comeca so in-app e adiciona email depois?

8. **Onboarding obrigatorio ou opcional?** O diagnostico inicial conversacional — o usuario PODE pular? Recomendacao: opcional mas fortemente incentivado (a Home mostra "complete seu perfil com o Grindfy AI — 3 min" ate fazer). Founder decide.

9. **Quem testa o alpha?** Antes de soltar pra todos: o founder + alguns jogadores BR de confianca testam por 1-2 semanas? Definir o grupo.

10. **Cancelar/aposentar features paralelas?** O cron de "coach recommendation" (segunda 6h) e o de "weekly study plan" (segunda 9h UTC) deveriam ser **absorvidos** pelo Weekly Report unico. Confirmar que pode unificar (vs manter 3 coisas separadas chegando na segunda).

11. **News / "Sinal Externo" — prioridade?** O feed externo e baixa prioridade nesse plano (e mais feature de Home que agente IA). Founder concorda em deixar como esta (so auditar o xSearchProvider) e focar tudo no Coach?

---

## Referencias

### Internas (codigo + docs)
- `server/coach*.ts`, `server/coach/` (cronRunner, nudgeEngine, recommendLessonForUser, prompts/, tools/, jobs/), `server/coachTools/` (registry, index, handlers/, studies/, grind-live/), `server/routes/coach.ts` — implementacao atual do Coach
- `server/jobs/refreshNews.ts`, `server/services/news/*` — News agent
- `server/services/hudOcr*.ts`, `server/routes/statsAnalyzer.ts` — Stats OCR
- `server/coachAutoTitle.ts`, `server/coachMemory.ts`, `server/services/studyWeeklyPlanService.ts`, `server/jobs/generateWeeklyStudyPlan.ts` — usos "ocultos" de IA
- `Docs/api/coach.md`, `Docs/api/coach-tools.md`, `Docs/architecture/ai-coach/*` — docs do Coach
- ADRs: 019-026 (caching, rate limit, tools, page context), 052 (stats tool), 075 (recommend lesson + competitor block), 077 (confirm/undo), 084-087 (nudge engine, quiet hours, cron), 100/106/107/110 (News), 111-115 (coach recommendation), 125 (coach tabs), 133-135/140/142 (coach session insights, study plan, theme tools)
- `Docs/strategy/2026-04-24-coach-ai-optimization-plan.md`, `coach-ia-upgrade-research-2026-05-02.md`, `coach-ia-implementation-plan-2026-05-02.md` — research/planos anteriores (este doc consolida e atualiza)
- `memory/coach_optimization_plan_2026-04-24.md`, `session_2026-04-24-coach.md`, `session_2026-05-07-coach-page-reform-1.md`, `session_2026-05-04-news-audit-and-news-3.md`, `session_2026-05-01-stats-v3.md`, `stats-v3.5.md` — historico de sessoes

### Externas (benchmark do nicho)
- The Mental Game of Poker — Inchworm Concept + Mental Hand History (Jared Tendler)
- BlackRain79, Cardplayer Lifestyle, mttpokerschool — downswing management
- poker.org — "Mind games: poker's mental health crisis" + "Manage your mental bankroll"
- Smart Poker Study, 888poker — goal setting / roadmap pra jogadores
- SharkScope (AI Coaching review), PokerCraft (GGPoker), PT4, HM3, Hand2Note — trackers
- GTO Wizard, DTO Poker, PIO Solver — solvers/trainers
- PokerCode, Run It Once, Tournament Poker Edge — cursos
- Aimchess, Chessigma/Chessiro (analogos do xadrez) — modelo de produto "weekly analysis + weakness report + annual wrapped"
- Whoop Coach, Oura Advisor, Strava Year in Sport — modelo de tom/cadencia de coach conversacional sobre dados
- Duolingo Max / "sad owl" — streak + lembrete com personalidade (e seus limites)
- Cursor / Claude Code, Linear, Notion AI, Intercom Fin — copilots que executam acoes
- Tax/IRPF 2026 (Brasil) — declaracao de premios de bets
