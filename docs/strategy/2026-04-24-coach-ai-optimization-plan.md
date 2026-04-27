# Plano de Otimizacao do Coach IA — Grindfy

**Data:** 2026-04-24
**Autor:** Strategist agent (analise a pedido do founder)
**Status:** Registrado para execucao futura. Nao priorizado agora (foco atual e outro).

---

## 1. Contexto

Analise ampla do Coach IA apos pivot de roadmap (2026-04-24) que concentrou esforco em Tournament Selector + Bankroll Management. Este documento registra TODAS as ideias para implementacao futura.

---

## 2. Estado atual (linha de base)

### Arquitetura
- 3 coaches isolados: Mental, Torneios, Tecnico
- Claude Sonnet 4.5 (chat) + Haiku (compactacao/resumos)
- Streaming SSE
- Rate limit: 30 msg/h global (flat, sem tier)
- Max tokens resposta: 1024
- Max tokens contexto: ~6600
- Memoria persistente: `user_ai_profile` (500 tokens) + `chat_sessions.summary` + `monthly_coach_summaries`

### Capacidades Atuais
- **Coach Mental:** break_feedbacks, preparation_logs, grind_sessions (ultimas 10), cross-coach leaks (via Fix 5)
- **Coach Torneios:** dashboard stats, ROI por 6 dimensoes, top/worst templates, planned_tournaments, profile_states, weekly_plans
- **Coach Tecnico:** dashboard completo, FT analytics, early/late finish, study cards, 7 leaks rule-based, study progress

### Custo
- ~$0.028/mensagem (sem prompt caching)
- 1000 msgs/mes = ~$28. Nao escala para milhares de usuarios ativos.

---

## 3. 10 Dores estruturais mapeadas

| # | Dor | Sintoma |
|---|-----|---------|
| D1 | Silos entre coaches | Leak tecnico raramente vira conversa mental. Fix 5 e band-aid unidirecional. |
| D2 | 100% reativo | Jogador precisa abrir chat. Coach nunca procura. Sem push, debrief ou warm-up guiado. |
| D3 | Conselheiro, nao executor | Coach fala "reduza Turbos $22" — jogador executa manualmente. Zero tool use. |
| D4 | Desconectado das features focais | Tournament Selector e Bankroll nao aparecem no contexto. Coach nao explica/justifica decisoes do scorer. |
| D5 | Contexto estatico e desperdicado | Sempre carrega todos os dados. Pergunta sobre ICM traz ROI por site (irrelevante). Tokens em ruido. |
| D6 | Memoria passiva + pequena | Profile 500 tokens so atualiza ao arquivar. Sem embeddings, sem semantic recall. |
| D7 | Zero feedback loop | Sem 👍/👎, sem "isso funcionou?". Nao sabe se recomendacoes fecharam o loop. |
| D8 | Sem observabilidade de qualidade | Ninguem sabe se coach alucina, quebra persona, ou entrega valor. |
| D9 | Hand-level data ausente | Sem VPIP/PFR/3bet% — analise superficial, so variancia macro. |
| D10 | Custo nao escalavel | Sem prompt caching da Anthropic. Sem tiering por plano. |

---

## 4. Catalogo completo de ideias (organizado por categoria)

### CATEGORIA A — INTELIGENCIA (coach mais esperto)

#### A1. Prompt Caching da Anthropic — **ICE 9.3** ⭐⭐⭐
- System prompt (~1500 tokens) + user profile + snapshot sao fixos por ~5 min
- API suporta `cache_control` nativo. Cache hit = -75% do custo.
- **Impacto:** $0.028/msg → ~$0.010/msg
- **Esforco:** 1 dia
- **Por que primeiro:** dinheiro no chao, desbloqueia viabilidade economica das features proativas

#### A2. Contexto dinamico (RAG leve via router) — ICE 7.3
- Haiku como intent classifier antes de Sonnet (custo trivial)
- Pergunta sobre ICM → carrega so FT analytics + study cards ICM
- Pergunta generica → overview completo
- **Impacto:** -40% tokens + melhor qualidade (menos ruido)

#### A3. Embeddings de conversas (pgvector) — ICE 6.7
- Adicionar pgvector no Postgres
- Gerar embeddings das mensagens historicas
- Semantic search: "na nossa conversa de 15/marco voce decidiu X"
- Expande memoria de 500 tokens pra "infinita via retrieval"
- Resolve D6 estruturalmente

#### A4. Tool Use (agent actions) — ICE 6.7 (alto impacto, alta complexidade)
- Claude SDK suporta tools nativamente
- Dar ao coach ferramentas:
  - `add_to_grade(template_id, day, time)`
  - `remove_from_grade(planned_id)`
  - `create_study_card(topic)`
  - `query_specific_stat(dimension, filter)` (deep-dive dinamico)
  - `trigger_tournament_selector(date)`
  - `update_bankroll_rule(new_rule)`
- **Transforma coach de consultor em copiloto executor**
- Diferenciador enorme vs concorrentes

#### A5. Hand History parser + analise — ICE 7.0 (feature killer)
- Upload `.txt` do PokerStars/GGPoker/PartyPoker (formatos padronizados)
- Parser calcula VPIP/PFR/3bet%/c-bet%/fold-to-3bet/WTSD
- Integracao com PokerKit lib (open-source equity calc)
- Coach Tecnico ganha profundidade real
- **Coloca Grindfy no nivel de PT4/HM3**

#### A6. Modo GTO/Exploitative awareness
- Coach com tabelas de Upswing/GTO Wizard open ranges em cache
- Responde "que range SB abre?" com dados concretos
- Sugere exploits por pool tendency (SBGL tight, ACR loose, GG weighted)
- Sem implementar solver — referencia consenso da comunidade

---

### CATEGORIA B — PROATIVIDADE (coach procura o jogador)

#### B1. Notificacoes inteligentes do coach — **ICE 8.0** ⭐
- Job diario analisa dados, detecta padroes criticos
- Exemplos:
  - "3 sessoes com foco < 5 — quer conversar?"
  - "Planejou 30 BI, jogou 12 essa semana"
  - "Hoje e terca, seu melhor dia historicamente"
  - "Bust precoce em 4 das ultimas 5 sessoes"
- Push notifications + email + in-app badge

#### B2. Daily Debrief automatico — **ICE 8.0** ⭐
- Ao `grindSession.status = 'completed'`, coach abre automaticamente
- Analise: resultados vs media, mental state, leaks do dia
- "Sua sessao foi 40% abaixo do normal. Seu foco caiu apos a 3a hora. Foi variancia ou padrao?"
- **Cerra o loop warm-up → grind → debrief → estudos**

#### B3. Coach de Warm-up inteligente
- Substituir warm-up atual por coach curto (5 min) que:
  - Pergunta estado do dia
  - Sugere exercicios baseado no perfil
  - Define 1-2 focos pra sessao ("hoje trabalhar defesa de BB")
  - Registra intencoes pre-sessao
- Liga com Debrief (B2) formando loop fechado

#### B4. Alertas de tilt em tempo real
- Durante grind live:
  - 3 early busts seguidos → "quer break de 5 min?"
  - Volume > planejado → "atingiu meta, considera parar?"
  - > 6h sem break → alert de fadiga
- Intervencao leve, nao bloqueia

#### B5. Relatorio semanal (newsletter) — **ICE 8.0** ⭐
- Email segunda-feira: "Sua semana em 3 insights + 2 focos pra proxima + Tournament Selector pra hoje"
- Assinado pelo coach (tom pessoal)
- **Re-engajamento:** puxa usuario de volta ao app

---

### CATEGORIA C — INTEGRACAO (conectar com features)

#### C1. Coach + Tournament Selector — **ICE 8.7** ⭐⭐
- O scorer entrega scores, jogador nao sabe POR QUE
- Coach explica:
  - `explain_score(torneio_id)` — "este tem 85/100 porque..."
  - `why_not(torneio_id)` — "este tem 32/100 — perde 8% em 145 amostras"
  - "nao gostei desse tipo" → ajusta pesos do scoring (treinar)
- **Alavanca direta do Sprint 1 (Tournament Selector) — alinha com roadmap focal**

#### C2. Coach + Bankroll Management — **ICE 8.3** ⭐
- Coach ciente de `bankroll_amount` e `bankroll_rule`
- Simula cenarios: "se perder 10 BI em $33, fica a X% do BR"
- Alertas: "a 1 buy-in do cap high"
- Shot taking policy: "quando bater 2x ABI, tomar shot?"
- **Alavanca direta do Sprint 2 (Bankroll) — alinha com roadmap focal**

#### C3. Coach + Study Planner
- Coach cria plano de estudos personalizado baseado em leaks
- "Leak #1: low FT conversion. Plano: 3 sessoes ICM esta semana, 1h cada, em X horario"
- Integrado com `calendar_events` e `weekly_routines` existentes
- Checkpoints: "ja fez sua hora de ICM hoje?"

#### C4. Coach contextual no Dashboard
- Mini-chat hoje e generico. Fazer contextual:
  - `/dashboard?filter=turbos` → coach ja abre sabendo que estamos em turbos
  - `/session-history` → analisa a sessao selecionada
  - Clicar em grafico → "explicar este pico"
- Reduz friccao, aumenta engajamento

#### C5. Coach Voice (hands-free durante grind)
- Web Speech API (nativo browser)
- Voz → chat → voz de volta
- Nao precisa tirar mao do teclado
- **Risco:** sessao de poker tipicamente silenciosa com headphones. Overkill provavel.

---

### CATEGORIA D — QUALIDADE E FEEDBACK LOOP

#### D1. Thumbs up/down nas respostas — **ICE 8.7** ⭐⭐
- 👍/👎 opcional em cada mensagem do coach
- Feedback "foi util?" apos respostas longas
- Alimenta dashboard de qualidade admin
- Eventualmente: RLHF leve (ranking de variacoes de prompt)

#### D2. Citations (grounding)
- Toda afirmacao sobre dados cita fonte
- "Seu ROI em Turbos e -8% [Dashboard > Por Speed > 145 torneios, ultimos 90d]"
- Reduz alucinacoes, aumenta confianca
- Implementacao: tool use retorna dados COM metadata

#### D3. "O que nao sei" tag visual — **ICE 8.7** ⭐⭐
- Badge de confianca em respostas:
  - ⚠️ "amostra pequena (N=18)"
  - ⚠️ "dado hand-level indisponivel"
  - ✅ "alta confianca (N=450)"
- Honestidade vira diferencial percebido

#### D4. Coach Red Team (avaliacao automatica)
- Job noturno: amostra de conversas, avalia via LLM-as-judge
- Metricas: alucinacao, violacao de persona, quebra de safety, utilidade
- Dashboard admin com alerts
- **Esperar volume suficiente antes de implementar (>10k mensagens)**

#### D5. A/B testing de prompts
- Framework para testar variacoes de system prompts
- 50/50 split por usuario
- Metricas: message length, thumbs up rate, retention
- **Depende de D1 para sinal e volume suficiente**

---

### CATEGORIA E — NOVAS MODALIDADES

#### E1. Screenshot analysis (multimodal Claude 4) — ICE 7.0
- Claude 4.7 e multimodal nativamente
- Jogador tira print de spot, manda ao coach
- Coach le stack sizes, positions, pots e analisa
- "Com 15bb em MP, essa 3bet esta ok"
- **Diferenciador enorme — ninguem tem isso maduro em poker**

#### E2. Hand Replay com coach
- Backlog ja menciona "Hand Replay"
- Quando implementado: coach narra a mao
- "Na CO voce abriu 2.5x, BB defende 30% wide..."
- Sugerir alternativas
- **Depende de feature Hand Replay ser construida antes**

#### E3. Opponent note taking automatico
- Coach parseia HH e sugere notes:
  - "NOME_JOGADOR fold 3bet 70%+"
  - "NOME_JOGADOR overfolds BB"
- Exporta no formato da rede (PokerStars notecaddy format)
- **Depende de A5 (HH parser)**

---

### CATEGORIA F — OTIMIZACOES TECNICAS

#### F1. Migrar memory limit dinamico (500 → tiered)
- 500 tokens pouco para usuario de 1+ ano
- Profile tiered:
  - Core (200 tokens): sempre carrega
  - Historical (ate 2000 tokens): carrega via RAG quando relevante
- Depende de A3 (embeddings)

#### F2. Model routing (Haiku/Sonnet/Opus)
- Haiku para queries simples ("qual meu ROI?")
- Sonnet para 80% das conversas
- Opus para analise profunda / coaching plan / debrief
- Router decide modelo
- Economia + qualidade mantida

#### F3. Streaming com interrupt
- Jogador pode parar o coach ("ok, entendi")
- Economia de tokens (saida interrompida nao paga resto)
- UX melhor

#### F4. Rate limit tiered por plano — **ICE 8.3** ⭐
- Hoje: 30 msg/h flat, aberto a todos
- Migrar:
  - Free: 10/dia, so Coach Mental
  - Pro: 50/dia, Mental + Torneios
  - Premium: ilimitado, todos + tool use + HH upload
- **Driver de upgrade sem construir feature nova**

---

### CATEGORIA G — MONETIZACAO / CROSS-SELL

#### G1. Coach exclusivo por plano — **ICE 8.0** ⭐
- Gate por plano (casa com F4)
- Free: Mental limitado
- Pro: +Torneios
- Premium: +Tecnico + HH + agent actions
- **Driver de upgrade claro, hoje Coach esta aberto a todos**

#### G2. Coach de Goals personalizado
- Roadmap cancelou "Goal Setting" (Sprint 4), mas...
- Coach define goals implicitamente via conversa
- "Voce quer $50 ABI — vamos tracar plano de 3 meses?"
- **Entrega diferencial sem construir feature de goals per se**

---

### CATEGORIA H — ESTRATEGIAS VERTICAIS (BR-focused)

#### H1. Coach especializado em PKO/Bounty Hunter
- PKO e o formato #1 no Brasil
- Expertise especifica:
  - Bounty math
  - Head-to-head EV ajustado por bounty
  - Fold equity em PKO vs Vanilla
  - Stack size dynamics em PKO
- Diferenciador claro vs ferramentas internacionais genericas

#### H2. Coach ciente de network pools BR
- Parser ja entende 10+ redes
- Coach sabe:
  - SBGL = pool leve
  - GG Network = dificil
  - ACR = field americano
  - PartyPoker = misto
- Ajusta recomendacoes: "Turbos SBGL +15%, mas GG baseline -5%"
- **Conhecimento de mercado real, inatingivel por ferramentas gringas**

---

## 5. Ideias DESCARTADAS ou adiadas

| Ideia | Motivo |
|-------|--------|
| Voice interface durante grind (C5) | Sessao de poker e silenciosa com headphones, overkill |
| Coach Red Team automatico (D4) | Aguardar volume de conversas antes (>10k msgs) |
| A/B testing prompts (D5) | Depende de D1 + volume suficiente |
| Hand Replay com coach (E2) | Depende de feature Hand Replay nao construida |

---

## 6. Sequencia recomendada (3 Sprints Coach v2)

### Sprint Coach-1 (1 semana) — Fundacao economica + feedback
**Ideias:** A1 + D1 + D3 + F4/G1
- A1 (prompt caching) → -75% custo
- D1 (thumbs up/down) → loop de qualidade ativo
- D3 ("o que nao sei" tag) → honestidade/confianca
- F4 + G1 (tiered rate limit + plano gate) → monetizacao
- **Resultado:** Coach viavel economicamente, feedback loop, driver de upgrade

### Sprint Coach-2 (2 semanas) — Alavancar features focais
**Ideias:** C1 + C2
- C1 (Coach + Tournament Selector) → explicabilidade
- C2 (Coach + Bankroll) → simulacoes e alertas
- **Resultado:** Coach vira tecido conectivo dos pilares do roadmap
- **Alinha 100% com foco em Tournament Selector + Bankroll**

### Sprint Coach-3 (2 semanas) — Proatividade
**Ideias:** B2 + B1 + B5
- B2 (Daily Debrief) → cerra loop warm-up→grind→debrief
- B1 (notificacoes proativas) → 2-3 alertas inteligentes
- B5 (relatorio semanal) → re-engajamento via email
- **Resultado:** Coach deixa de ser ferramenta parada, vira presenca viva

### Fase seguinte (trimestre) — Transformacao
**Ordem sugerida:** A4 (tool use) → A5 (hand history) → A2/A3 (RAG + embeddings) → E1 (multimodal)

---

## 7. Top 5 ICE ranking (quick reference)

| Rank | Ideia | ICE | Sprint |
|------|-------|-----|--------|
| 1 | A1. Prompt Caching | 9.3 | Coach-1 |
| 2 | C1. Coach + Tournament Selector | 8.7 | Coach-2 |
| 3 | D1. Thumbs up/down + citations | 8.7 | Coach-1 |
| 4 | D3. "O que nao sei" tag | 8.7 | Coach-1 |
| 5 | C2. Coach + Bankroll | 8.3 | Coach-2 |

Tambem fortes (ICE 8.0):
- B1. Notificacoes proativas
- B2. Daily Debrief
- B5. Relatorio semanal
- F4/G1. Rate limit tiered
- G1. Coach por plano

---

## 8. Observacao estrategica final

O Coach IA hoje e um **bom chatbot especializado**, mas nao e um **sistema de coaching**. A diferenca: chatbot responde; sistema de coaching **lembra, antecipa, executa e fecha o loop**.

O roadmap pivotou para "dobrar em Tournament Selector + Bankroll" — o Coach v2 e exatamente o **tecido conectivo** desses dois pilares. Sem isso, TS e Bankroll sao duas features isoladas. Com Coach v2, viram um **copiloto de decisao** genuinamente diferenciavel vs Lobbyze/PokerCraft.

A peca mais subestimada desta lista e **A1 (prompt caching)**. 1 dia de trabalho, -75% de custo, desbloqueia viabilidade economica de tudo o resto (proatividade = muito mais mensagens por usuario).

---

## 9. Referencias

- `Docs/specs/ai-coach-infrastructure.md` — spec original Sprint 1
- `Docs/specs/ai-coach-personas.md` — spec original Sprint 2
- `Docs/specs/ai-coach-memory.md` — spec original Sprint 3
- `Docs/strategy/2026-04-23-product-roadmap.md` — roadmap aprovado
- `memory/roadmap_pivot_2026-04-24.md` — pivot que concentrou em TS + Bankroll
- `server/coachPrompts.ts` — prompts atuais
- `server/coachLeakDetection.ts` — 7 leaks rule-based
- `server/coachContext.ts` — context assembly (com Fix 1-5 aplicados)
- `server/routes/coach.ts` — endpoints
- `server/coachMemory.ts` — compactacao/profile

---

**Proximo passo quando o founder retomar:** iniciar com Sprint Coach-1 (A1 + D1 + D3 + F4/G1) via `/pm-spec`. Depois Coach-2 (C1 + C2) alinhado ao roadmap focal.
