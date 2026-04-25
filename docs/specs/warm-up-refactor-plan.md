# Plano de Refatoração e Evolução — Página `/mental` (Warm-up)

**Autor:** Strategist (consultivo)
**Data:** 2026-04-25
**Status:** Plano estratégico (consumível pelo PM-Spec para gerar specs por sprint)
**Fonte primária do método:** *A Anatomia de um Spot — Bloco C, Aula C.8 — Warm-up e Cool-down de Sessão*
**Fontes secundárias:** Aulas C.3 (Leaks Mentais), C.7 (Metas de Processo), C.6 (System 1/2), D.2 (Hot/Cool); Tendler Vol 1/2; Stoyan Bres (GTO Wizard Trainer); Elliot Roe / Primed Mind; Hanin (IZOF); Leroy (attentional residue); Weil (4-7-8); Zeigarnik.

> **NOTA 2026-04-25:** Cool-down agora tem spec dedicada — ver `cooldown-refactor-plan.md`. Esta spec mantem foco exclusivo em warm-up. Sprint W-1 abaixo continua valido e prioritario.

---

## ⚠ AJUSTE DE ESCOPO — 2026-04-25 (decisão do fundador)

**Cool-down esta especificado em spec dedicada (`cooldown-refactor-plan.md`).** Esta iteração foca exclusivamente em **warm-up**. As secoes abaixo marcadas como ❌ DEFERIDO referem-se a features que migraram para a spec de cool-down — nao serao implementadas dentro desta spec de warm-up.

### Sprints ativos (renumerados)

| Antigo | Novo | Tema | Status |
|--------|------|------|--------|
| W-1    | **W-1** | Fundação warm-up cronometrado + Gate Go/No-Go | **ATIVO** |
| W-2    | —     | Cool-down (4 blocos, 4-7-8, ABC journal, captura mãos) | ❌ DEFERIDO |
| W-3    | **W-2** | Inteligência: Sunday Review + Mapa Leak + IZOF + Coach Weekly Review | **ATIVO** (renumerado) |
| W-4    | **W-3** | Hábito: versão mínima warm-up 3min + pré-bullet + cafeína + compliance | **ATIVO** (renumerado, cool-down 5min e Sleep Gate cortados) |
| W-5    | **W-4** | Profundidade: biometria, library áudios warm-up, export, share link | **ATIVO** (renumerado, voice journal cortado — era pós-sessão) |

### Features migradas para `cooldown-refactor-plan.md`

- **F-03** CoolDownRunner -> ver `cooldown-refactor-plan.md` (RF-02, Sprint Cooldown-1/2)
- **F-04** Captura de mãos críticas (star) -> ver `cooldown-refactor-plan.md` (RF-02 Bloco 1, RF-03 tabela `starred_hands`)
- **F-05** A/B/C Game Journal -> ver `cooldown-refactor-plan.md` (RF-02 Bloco 2)
- **F-14** Sleep Gate pós-cool-down -> ver `cooldown-refactor-plan.md` (RF-02 Bloco 4, Sprint Cooldown-2)
- **F-16** Voice Journal pós-sessão ❌ DEFERIDO (fora de escopo da spec de cool-down tambem; sera retomado em sprint futuro)
- Cool-down 5min na F-11 -> ver `cooldown-refactor-plan.md` (Quick Cool-down ~3min e modo `quick`)
- Áudios "pós-cooler 4-7-8" e "sleep transition" da F-19 -> ver `cooldown-refactor-plan.md` (RF-02 Bloco 4 reusa AudioLibraryDialog)
- Tabela `starred_hands` -> ver `cooldown-refactor-plan.md` RF-03 (criada na Sprint Cooldown-1)
- Tabelas `abc_game_logs`, `voice_journals` ❌ — `abc_game_logs` foi consolidado em `cooldown_logs.abGameAnswers` (jsonb); `voice_journals` permanece deferido.

### Features que mudam por causa do corte

- **F-09 Coach AI Weekly Review** — input passa a ser apenas warm-up + grind sessions (sem ABC journal nem star).
- **F-15 Compliance Dashboard** — só métricas de warm-up.
- **F-18 Export PDF** — só compliance e IZOF, sem ABC entries.
- **F-20 Share link** — idem.
- **`session_rituals.type`** — pode reduzir a só `'warmup'` (`'cooldown'` removido) ou nascer apenas como `warmup_rituals`. PM-Spec decide nome final.

### Roadmap revisado

| Sprint | Tema | Features ativas | Esforço |
|--------|------|-----------------|---------|
| **W-1** | Fundação warm-up | F-01, F-02 | 3-4 sprints-dev |
| **W-2** (ex-W-3) | Inteligência | F-06, F-07, F-08, F-09', F-10 | 5-6 |
| **W-3** (ex-W-4) | Hábito | F-11', F-12, F-13, F-15' | 2-3 |
| **W-4** (ex-W-5) | Profundidade | F-17, F-18', F-19', F-20' | 3-4 |

(`'` = versão warm-up-only)

**Restante do documento abaixo é o plano original.** Seções de cool-down permanecem **como referência futura**, mas marcadas inline como ❌ DEFERIDO.

---

## Sumário Executivo (200-300 palavras)

A página `/mental` atual é um **warm-up genérico de checklist + 4 sliders + score 60/40 arbitrário**. Comparada ao método C8 do fundador (a fonte de verdade), ela está **aderente em ~25%**: cobre só warm-up, ignora cool-down inteiro, não tem protocolo cronometrado, não tem check emocional vinculado a decisão go/no-go, não tem captura de mãos pós-sessão, não tem ritual de respiração 4-7-8, não tem cafeína tracker, e não tem o A/B/C-Game journal que C8 cita como **a coleta que alimenta a evolução semanal do jogador**. O score atual também é decorativo — não bloqueia jogar quando o estado mental está abaixo de 6 (regra binária do C8).

O plano propõe **5 sprints temáticos** que transformam a página em **Session Rituals — protocolos guiados de warm-up (10min) e cool-down (15min)**, com versão mínima (3min/5min), gate emocional 0-10, captura de mãos críticas integrada com tracker, A/B/C journal estruturado, cafeína strategy, integração com Coach AI para revisão semanal de protocolo, e correlação real com performance. Renomeia para `/rituals` ou mantém `/mental` mas amplia escopo. O score 60/40 morre — vira **compliance binário** (executou ou não, conforme C7). Personalização pelo perfil de leak (C3) define quais drills entram no Bloco 3. IZOF (Hanin) personaliza a curva ótima de cada jogador.

**Roadmap proposto:** Sprint W-1 (Fundação — protocolo cronometrado warm-up); W-2 (Cool-down — captura + 4-7-8 + ABC journal); W-3 (Inteligência — leak-driven + IZOF + Coach revisão); W-4 (Hábito — versão mínima, ritual pré-bullet, cafeína, sleep gate); W-5 (Profundidade — voice journal, biometria, export para mental coach humano). Esforço total estimado: 14-18 semanas de desenvolvimento focado.

---

## 1. Diagnóstico

### 1.1 As 8 dores reais do jogador profissional de MTT no warm-up

Extraídas do C8 + literatura (Tendler 2011/2014; Roe via Primed Mind; Stoyan Bres) + benchmark com poker pro:

| # | Dor | Sintoma observável | Fonte |
|---|-----|--------------------|-------|
| **D-1** | Começar sessão "frio" — primeiros 15 min com PFC em 60% da potência | Concentração desproporcional de tilt-shoves e calls marginais nos primeiros 15min (dado: Tropa de Elite B02, ~3.000 sessões) | C8 §02; Leroy 2009 |
| **D-2** | Decidir jogar em dia ruim por inércia, não por avaliação | Sessões em -EV conhecido (briga com parceira, sono curto) que destroem a banca | C8 §02 Função 03; C8 §09 Erro 04 |
| **D-3** | Mãos críticas se perdem na memória pós-sessão | Mente fatigada degrada memória de spots em horas; sem captura, estudo do dia seguinte fica sem pauta | C8 §03 Função 01 |
| **D-4** | Sono ruim por loop Zeigarnik aberto | Ruminação noturna pós-sessão → cortisol → menos REM → warm-up de amanhã frágil | C8 §03 Função 02 |
| **D-5** | Sistema límbico ativo pós-bad beat invade o sono | Insônia após sessão com cooler/suckout → início do ciclo de degradação | C8 §03 Função 03 |
| **D-6** | Cafeína mal-timed — pico chega na FT, ou pico ainda ativo na hora de dormir | Tremor/ansiedade no clutch; sono fragmentado | C8 §06 |
| **D-7** | Pular warm-up em torneio "pequeno" — depois um $11 vira FT com PFC frio | Variância negativa sistemática em sessões híbridas (pequeno + grande) | C8 §02; §09 Erro 01 |
| **D-8** | Analisar mãos no cool-down com mente cansada | Conclusões viesadas viram heurísticas corruptas | C8 §05 Bloco 2; §09 Erro 02 |

### 1.2 Auditoria UX da página atual (`MentalPrep.tsx`)

Friction points identificados na implementação atual (ver `B:\grindfy\client\src\pages\MentalPrep.tsx` e `client/src/components/mental-prep/`):

| Componente / Fluxo | Problema | Severidade |
|--------------------|----------|------------|
| **Score 60/40 (checklistScore × 0.6 + mentalScore × 0.4)** | Pesos arbitrários, sem validação contra performance real do próprio usuário. C7 exige metas de processo binárias (executou ou não). | Alta |
| **Sliders Energia/Foco/Confiança/Equilíbrio (1-10)** | 4 dimensões genéricas, sem conexão com C8 (C8 pede 1 pergunta única "OK 0-10 pra jogar?" + revisão técnica). 4 sliders dispersam atenção quando o ponto de decisão é binário. | Alta |
| **WarmUpChecklist com atividades default** | Checklist solto, sem cronômetro, sem ordem obrigatória, sem prompts de conteúdo. C8 exige 5 blocos sequenciais cronometrados de 2min cada. | **Crítica** |
| **Botão "Iniciar Grind"** | Permite iniciar com qualquer score, mesmo 0%. C8 §04 exige bloqueio de "abrir mesas" se check emocional <6. | **Crítica** |
| **Sem cool-down** | Página é 100% pré-sessão. Cool-down é igualmente importante (15min vs 10min) e mais negligenciado segundo C8 §03. | **Crítica** |
| **Sem captura de mãos pós-sessão** | Não existe ponto de captura de mãos críticas — perdem-se 3-5 mãos starradas por sessão. | **Crítica** |
| **MeditationDialog / VisualizationDialog / AudioLibraryDialog** | Ferramentas isoladas em "Ferramentas de Apoio". C8 não usa meditação/visualização nesses moldes — usa respiração caixa (4-4-4-4) no warm-up e 4-7-8 no cool-down. Conteúdo precisa migrar para os blocos. | Média |
| **CorrelationDialog (≥3 logs)** | Implementação fraca: match por data, sem regressão, sem segmentação por contexto (ICM, FT, fadiga). Não responde "que atividade do warm-up correlaciona com performance?". | Média |
| **localStorage `warmUpScore`/`warmUpData`/`warmUpIntegration`** | Tech debt explícito (TODO no código). Integração com `/grind` ainda passa por localStorage. | Média |
| **`mentalState` salvo como **número único** no backend (`focusLevel`, `confidenceLevel`, `mentalState`)** | Schema não captura: bloco temporal, decisão go/no-go, conteúdo das heurísticas da semana, intenção da sessão, plano anti-tilt. | Alta |
| **Sem ritual pré-bullet / pré-torneio individual** | Player abre 12 torneios em paralelo; warm-up de 10min só serve à abertura da sessão. C8 sugere ritual curto antes de cada bullet específico (não está formalizado, mas é gap evidente). | Média |
| **Não há onboarding** | Novo usuário cai no checklist sem entender as 4 funções neurobiológicas (PFC, memória, emoção, transição). C8 §02 é pré-requisito para adoção. | Alta |
| **Mobile** | Sliders e dialogs grandes não funcionam bem mobile. Player pode querer rodar warm-up no celular antes de sentar no PC. | Média |

### 1.3 Aderência ao método C8 — gaps mapeados

| C8 — Item canônico | Status atual `/mental` |
|---------------------|------------------------|
| Bloco 1 warm-up: 5 respirações caixa + check 0-10 + decisão go/no-go | ❌ Ausente (sliders genéricos, sem decisão) |
| Bloco 2 warm-up: 3 heurísticas-alvo da semana | ❌ Ausente |
| Bloco 3 warm-up: drill no Trainer (4min) | ❌ Ausente (existe meditação, não drill) |
| Bloco 4 warm-up: setup físico checklist | ⚠ Parcial (existe, mas sem prompts específicos) |
| Bloco 5 warm-up: intenção + plano anti-tilt + critério de encerramento | ❌ Ausente |
| Cool-down inteiro (4 blocos, 15min) | ❌ Ausente |
| Respiração 4-7-8 | ❌ Ausente |
| Star de 3-5 mãos críticas | ❌ Ausente |
| A/B/C-Game journal (4 perguntas estruturadas) | ❌ Ausente |
| Cafeína strategy (timing, cutoff, ciclagem) | ❌ Ausente |
| Versão mínima (3min/5min) | ❌ Ausente |
| Compliance dashboard (% sessões com warm-up + cool-down completos, streak) | ⚠ Parcial (streak existe, sem métrica de compliance) |
| Implementation intentions (C7) integradas | ❌ Ausente |

**Veredicto:** A implementação atual cobre ~25% do método. Os 75% restantes envolvem cool-down inteiro, protocolo cronometrado, captura de mãos, journal estruturado, cafeína, gate emocional e versão mínima.

---

## 2. Visão de Produto

> **`/mental` evolui de "warm-up checklist" para "Session Rituals" — a infraestrutura que executa o protocolo profissional de pré-sessão e pós-sessão do método C8 com fricção mínima, gera os dados que alimentam a evolução técnica e emocional do jogador, e protege explicitamente o sono e a continuidade da carreira.**

### Princípios norteadores

1. **Cronometrado e guiado, não checklist solto.** Cada bloco tem timer, prompt de conteúdo, ordem fixa. Player não decide "o que fazer" — ele executa.
2. **Decisão > medição.** O check emocional 0-10 não é dado decorativo: é gate go/no-go. Score <6 bloqueia "Iniciar Grind".
3. **Captura > análise.** Cool-down captura mãos e impressões com mente fatigada (OK). Análise vai pro warm-up de amanhã (mente fresca).
4. **Compliance binária, não nota.** Conforme C7: executou ou não. Score 60/40 morre. O que vira métrica é "X% de sessões com ritual completo" + "streak".
5. **Versão mínima é cidadã de primeira classe.** 3min warm-up + 5min cool-down sempre disponíveis. Spec do C8: "entre versão mínima e pular, escolha sempre mínima".

---

## 3. Pesquisa de Benchmark

### 3.1 Apps e ferramentas de poker — pre/post session

| Produto | O que faz | Lições |
|---------|-----------|--------|
| **Primed Mind (Elliot Roe)** | ~250 áudios de hipnose: pré-sessão, pré-FT, downswing, fold-when-beaten. Usuários relatam usar diariamente como warm-up + cool-down. | Áudio guiado é o killer feature em mobile. Diferenciação não é conteúdo único — é o ritual de tocar o áudio antes de cada sessão. |
| **Tendler — The Mental Game of Poker** | Livro/coaching. Warm-up tem: foco, plano anti-tilt, "Injecting Logic" statements pré-carregados, mapa de problemas mais prováveis. | Plano anti-tilt pré-carregado (implementation intention) é diferencial. Hoje o `/mental` não tem isso. |
| **GTO Wizard Trainer (Stoyan Bres protocol)** | Drill de "Close Decisions Fast" no foco da semana. Stoyan trata 4min como inegociáveis. | Bloco 3 do warm-up DEVE integrar com Trainer (próprio do Grindfy se vier no futuro, ou link out por ora). |
| **PokerPro / Poker Tracker mood logs** | Logs de humor pré-sessão. Não chegam a gate go/no-go. | Captura existe; o que falta é decisão acionável. |

### 3.2 Apps de psicologia esportiva e biofeedback

| Produto | O que faz | Lições |
|---------|-----------|--------|
| **Headspace / Calm Pro** | Meditação guiada por áudio com timer e categorias. | UX de áudio + timer é referência. Não copiar conteúdo (é meditação genérica, não warm-up de poker). |
| **WHOOP / Oura recovery score** | Score diário baseado em HRV, sono, RHR. Indica se "treinar pesado" é OK. | Pode informar (V2) o check 0-10 do warm-up — se HRV baixo + sono ruim, sugerir "recomendamos não jogar hoje". |
| **Strive / Calm Pro for athletes** | Pre-game visualization, post-game decompression. Áudios curtos (3-15min). | Versão mínima é normal no setor. Curado por modalidade. |
| **HRV4Training / Welltory** | HRV via câmera do celular pré-sessão. | Custo zero de hardware (smartphone) — pode ser próximo passo do biometria. |

### 3.3 Frameworks de psicologia esportiva relevantes

- **IZOF (Hanin, 1978-2014)** — Individual Zones of Optimal Functioning. Cada atleta tem zona de ativação ideal individual; emoções "positivas" e "negativas" podem ser produtivas ou destrutivas dependendo do indivíduo. Implicação: o check 0-10 do C8 deve calibrar **a zona ÓTIMA do próprio jogador**, não 10/10. Alguns jogam melhor a 7; outros a 9. Personalização baseada em correlação histórica.
- **Implementation Intentions (Gollwitzer, 1999)** — "SE situação X, ENTÃO comportamento Y". Citado em C7. Aplicação: "SE sentir tilt de bad beat, ENTÃO 5 respirações 4-7-8 + revisão da intenção da sessão". Pré-cadastrado no warm-up, disparável durante sessão.
- **Attentional Residue (Leroy, 2009)** — 15-20% de capacidade cognitiva drena se o cérebro arrasta tarefa anterior. Bloco 4 (setup físico) e Bloco 1 (respiração) endereçam.
- **Zeigarnik Effect (1927)** — tarefa incompleta consome recursos atencionais. Cool-down fecha o loop.

---

## 4. Plano de Refatoração Estrutural — 5 Sprints

### Sprint W-1 — Fundação: Warm-up Cronometrado (10min) com Gate Go/No-Go

**Objetivo:** Substituir o checklist solto pelos 5 blocos cronometrados do C8 §04, com decisão go/no-go bloqueante.

**Features incluídas:**
- W-1.1 — **WarmUpRunner** — componente fullscreen com timer, navegação next/prev entre blocos, pausável.
- W-1.2 — **Bloco 1 — Check-in emocional + respiração caixa 4-4-4-4** — guia visual de respiração (animação círculo expand/contract), 5 ciclos. Pergunta única: "Estou OK pra jogar agora? (0-10)". Se <6, modal "Não jogar hoje" (gate).
- W-1.3 — **Bloco 2 — Foco da semana** — exibe as 3 heurísticas que o jogador definiu no Sunday review (ver Sprint W-3). Toggle "li em voz alta".
- W-1.4 — **Bloco 3 — Drill de ativação PFC** — 4min de timer + link/embed para GTO Wizard (se permitir) ou para drill interno futuro. Por ora: link externo + cronômetro + 1 check "completei".
- W-1.5 — **Bloco 4 — Setup físico checklist** — 6 itens: água 1L · snacks · celular avião · notificações off · fone · luz. Toggle individual.
- W-1.6 — **Bloco 5 — Intenção da sessão** — 3 campos obrigatórios: "Foco desta sessão:", "Se sentir tilt, vou:", "Vou encerrar quando:".
- W-1.7 — **Endpoint `POST /api/session-rituals/warmup`** — persiste blocos completados, decisão go/no-go, conteúdo da intenção, duração total.
- W-1.8 — **Bloqueio de `Iniciar Grind`** — botão só habilita se warm-up foi completado nos últimos 30min E check emocional ≥6.

**UX/UI:**
- WarmUpRunner ocupa tela inteira (modal cheio), com timer grande no topo, prompt central, botão "Próximo" (ativo só quando timer expira ou usuário marca completo). Visual de cores por bloco (azul calmo bloco 1, neutro bloco 2, energético bloco 3, prático bloco 4, gold bloco 5).
- Removido: sliders Energia/Foco/Confiança/Equilíbrio. (Migram pra `mentalProfile` em W-3 com nova UX.)
- Removido: score 60/40. Substituído por compliance binária + selo "Warm-up completo".
- Página `/mental` (renomear visualmente para "Session Rituals — Warm-up & Cool-down" no header) tem 3 cards: "Iniciar warm-up", "Iniciar cool-down" (W-2), "Histórico/Compliance".

**Backend changes:**
- Nova tabela `session_rituals` (substitui semanticamente `preparation_logs`):
  - id, userId, type ('warmup' | 'cooldown'), startedAt, completedAt, durationMinutes, version ('full' | 'minimal' | 'aborted')
  - emotionalCheckScore (0-10, nullable se cooldown)
  - decisionToPlay (boolean, nullable)
  - blocksCompleted (jsonb — array de {blockId, completedAt, contentSnapshot})
  - sessionIntention (jsonb — {focus, tiltPlan, stopCriteria}, só warmup)
  - linkedGrindSessionId (varchar, nullable — FK para grind_sessions)
- Migrar `preparation_logs` (deprecar — manter por 60 dias para compat).
- Endpoint `GET /api/session-rituals?type=&from=&to=` para histórico.

**Métricas de sucesso:**
- ≥70% das sessões iniciadas no `/grind` têm warm-up associado nos últimos 30min (D+30).
- Tempo médio do warm-up entre 8-12min (verificar se 10min é realista; ajustar se >70% pula).
- Decisões "não jogar hoje" (score <6) >0% — sinal de que o gate está sendo respeitado.

**Esforço:** **L** (Large) — ~3-4 sprints-dev.

**ICE:** Impact 9 / Confidence 9 / Ease 5 → **7.7**

---

### ❌ DEFERIDO — Sprint W-2 — Cool-down (15min): Captura + 4-7-8 + ABC Journal

**Objetivo:** Implementar o protocolo de cool-down do C8 §05 inteiro, incluindo captura de mãos, ventilação fisiológica e A/B/C journal.

**Features incluídas:**
- W-2.1 — **CoolDownRunner** — análogo ao WarmUpRunner, com 4 blocos sequenciais.
- W-2.2 — **Bloco 1 — Fechar mesas + 4-7-8** — guia visual de respiração 4-7-8 (5 ciclos), com áudio opcional de coach narrando.
- W-2.3 — **Bloco 2 — Star de mãos críticas (sem análise)** — formulário para 3-5 mãos: stack, spot (texto livre curto), decisão tomada, dúvida ativa. Botão "Adicionar mão". Validação: mínimo 1 mão (warning se 0).
- W-2.4 — **Bloco 3 — A/B/C-Game Journal** — 4 perguntas estruturadas:
  - "Que % da sessão fui A-game / B-game / C-game?" (3 sliders 0-100, soma=100)
  - "Qual foi o gatilho de queda pra B/C?" (textarea + picker de tilt-type — pré-cadastrado com 7 tilts de Tendler)
  - "O que funcionou bem hoje?" (textarea)
  - "O conceito de foco da semana — consegui aplicar?" (toggle sim/parcial/não + textarea opcional)
- W-2.5 — **Bloco 4 — Transição pro descanso** — checklist físico: levantei · caminhei 3-5min · banho/conversa/música. Cronômetro 5min sugerido. Áudio opcional (música ambiente / playlist neutra).
- W-2.6 — **Endpoint `POST /api/session-rituals/cooldown`** — persiste blocos, mãos starradas, ABC scores, gatilho de queda.
- W-2.7 — **Tabela `starred_hands`** — mãos críticas capturadas no cool-down (FK para session_rituals e para grind_sessions). Reaparecem no warm-up do dia seguinte (Bloco 2 — "revisão das mãos starradas") e no `/coach` para análise.
- W-2.8 — **Sleep Gate (anti-tela)** — após cool-down, mostra mensagem: "Não tente dormir nos próximos 30min. Sugestão: <ações da regra do separador físico do C8>". Inclui timer opcional de 30min com lembrete suave.

**UX/UI:**
- CoolDownRunner usa paleta mais quente (amber/violet) para diferenciar do warm-up (cool blue/green).
- Bloco 2 mostra cards das mãos starradas; cada card é editável até envio. Hint visível: "NÃO analise — só capture. Análise vai pro warm-up de amanhã".
- Bloco 3 — sliders A/B/C com cores (verde/amarelo/vermelho). Picker de tilt-type usa os 7 tilts de Tendler (Running Bad, Injustice, Hate-losing, Mistake, Entitlement, Revenge, Desperation).

**Backend changes:**
- Tabela `starred_hands` — id, userId, sessionRitualId, grindSessionId (nullable), capturedAt, stackBb, spotText, decisionTaken, doubt, status ('pending_review' | 'reviewed' | 'archived'), reviewedInRitualId (nullable).
- Tabela `abc_game_logs` — id, sessionRitualId, aPercent, bPercent, cPercent, fallTrigger, tiltType (enum 7 Tendler), workedWell, focusApplied (enum sim/parcial/não), focusNote.
- Endpoint `GET /api/starred-hands?status=pending_review` para feed do warm-up.

**Métricas de sucesso:**
- ≥60% das sessões no `/grind` que terminam têm cool-down nos próximos 30min (D+30).
- Média de mãos starradas por cool-down entre 2-5 (sinal de captura saudável).
- ≥70% dos cool-downs têm ABC journal preenchido completamente.

**Esforço:** **L** — ~3-4 sprints-dev.

**ICE:** Impact 10 / Confidence 9 / Ease 4 → **7.7**

---

### Sprint W-3 — Inteligência: Leak-Driven, IZOF & Coach AI Review

**Objetivo:** Personalizar o protocolo com base no perfil de leak do jogador (C3), IZOF, e revisão semanal pelo Coach AI.

**Features incluídas:**
- W-3.1 — **Sunday Review (planejamento da semana)** — fluxo guiado domingo 22h (notificação + entrada de menu) onde o player define:
  - As **3 heurísticas-alvo da semana** (max 280 chars cada). Texto livre OU sugeridas pelo Coach AI a partir de leaks recentes.
  - Critérios de stop-loss e timer da semana.
  - Persiste em `weekly_focus` (id, userId, weekStart, heuristic1/2/3, stopLoss, timerMinutes).
  - Bloco 2 do warm-up lê dessa tabela.
- W-3.2 — **Mapa de leak emocional (C3)** — onboarding de 5min onde o jogador responde 12 perguntas e recebe seu **perfil de leak primário**: medo de incerteza / scared money / medo de ridicule / impaciência / FOMO / desespero / insegurança. Persiste em `mental_profile.primaryLeak`.
- W-3.3 — **Drills do Bloco 3 personalizados** — quando integração Trainer interno existir, o drill do Bloco 3 prioriza spots do perfil de leak (ex: scared money → drill de defesa de BB em 3bet pot OOP). Por ora: sugestão textual de drill ("Foque em <spot> hoje" — derivado do perfil).
- W-3.4 — **IZOF tracker** — após 20+ warm-ups com `decisionToPlay=true`, calcular zona ótima individual:
  - Cruza `emotionalCheckScore` × `sessionROI / sessionProfit` das sessões linkadas.
  - Visualização: scatter plot + curva ajustada. Zona ótima = score onde ROI/hr é máximo ± desvio.
  - Recomendação: "Sua zona ótima é entre 7 e 9. Hoje você está em 5 → considere não jogar OU reduzir volume 50%".
  - Mensagem aparece no Bloco 1 do warm-up após detecção da zona.
- W-3.5 — **Coach AI weekly review of protocol** — domingo 20h, Coach AI gera relatório:
  - Compliance da semana (% warm-up, % cool-down, streaks).
  - Padrões identificados: "Você tilta mais quando o check é <7. Sugestão: ajustar critério de stop-loss".
  - Heurísticas sugeridas para a semana seguinte (consumidas em W-3.1).
  - Persiste em `coach_protocol_reviews`.
- W-3.6 — **Implementation Intentions library (C7)** — biblioteca de planos anti-tilt pré-cadastrados, picker no Bloco 5 do warm-up. Ex: "SE bad beat de 80%+, ENTÃO 4-7-8 + revisão da intenção". O jogador pode customizar e salvar.
- W-3.7 — **Correlação V2** — substitui a CorrelationDialog atual por análise robusta:
  - Regressão linear `mentalScore ~ ROI` por contexto (ICM/non-ICM, FT/non-FT, fadiga/fresh).
  - Heatmap "atividade x ROI" — qual atividade do warm-up correlaciona com performance?
  - Diferencial vs hoje: corrige a comparação por data (não captura sessões em dias diferentes do warm-up).

**UX/UI:**
- Sunday Review: wizard de 3 passos, ~5min. Notificação push domingo 22h.
- Mapa de leak: 12 perguntas com respostas estilo "concordo/discordo + intensidade". Resultado em card visual: "Seu leak primário é <NAME>. <descrição C3>. <3 sugestões de exposição>".
- IZOF: card no dashboard mensal + alerta inline durante warm-up Bloco 1.

**Backend changes:**
- Tabela `weekly_focus` — id, userId, weekStart, heuristic1/2/3, stopLoss, timerMinutes, source ('manual' | 'coach_suggested').
- Tabela `mental_profile` — id, userId, primaryLeak, secondaryLeak, izofMin, izofMax, izofConfidenceN, lastUpdated.
- Tabela `implementation_intentions` — id, userId, trigger, response, isDefault, createdAt.
- Tabela `coach_protocol_reviews` — id, userId, weekStart, complianceJson, suggestionsJson, generatedAt.
- Endpoint `POST /api/coach/protocol-review/run` — dispara cálculo (cron domingo).
- Coach AI prompt extension: incluir contexto `mentalProfile` + `recent_session_rituals` + `recent_grind_sessions` + `starred_hands_pending`.

**Métricas de sucesso:**
- ≥40% dos usuários completam o Mapa de Leak (onboarding) em D+30.
- ≥30% completam o Sunday Review por 4 semanas seguidas.
- IZOF disponível para ≥20% dos usuários ativos em D+90.
- Coach review tem CTR de ≥50% (player abre o relatório).

**Esforço:** **XL** — 5-6 sprints-dev.

**ICE:** Impact 9 / Confidence 7 / Ease 3 → **6.3**

---

### Sprint W-4 — Hábito: Versão Mínima, Pré-Bullet, Cafeína & Sleep Gate

**Objetivo:** Cobrir os casos reais do C8 — versão mínima quando não há tempo, ritual pré-bullet por torneio, cafeína strategy e sleep hygiene.

**Features incluídas:**
- W-4.1 — **Versão mínima warm-up (3min)** — botão "Tempo curto? Versão mínima 3min" no card inicial. Compõe:
  - 60s Bloco 1 reduzido (5 respirações + check)
  - 60s Bloco 2 (3 heurísticas)
  - 60s Bloco 5 (1 linha de intenção)
  - Persiste com `version='minimal'`. Diferencia da completa nos relatórios.
- W-4.2 — **Versão mínima cool-down (5min)** — análogo:
  - 60s 4-7-8 + fechar mesas
  - 120s star 2-3 mãos
  - 60s frase única "Hoje fui ___ game porque ___. Aprendi ___."
  - 60s levantar/água/caminhada.
- W-4.3 — **Pre-Bullet Ritual (60s)** — antes de cada torneio que entra na grade do dia, um ritual de 60s opcional:
  - 5 respirações
  - 1 frase: "Vou jogar este torneio com foco em ___" (autocompleta com heurística da semana)
  - Persiste em `prebullet_rituals`. Linka com `planned_tournaments` ou `session_tournaments`.
  - Pode ser disparado pelo `/grind` quando um torneio inicia.
- W-4.4 — **Caffeine Tracker** — card no `/mental`:
  - Log de horário e dose (mg) de cada consumo. Pré-set: espresso 80mg, café filtrado 100mg, energético 150mg, custom.
  - Calcula automaticamente cutoff (-6h antes do horário-alvo de dormir, configurável em settings).
  - Alerta vermelho se consumo após cutoff.
  - Curva farmacocinética visual (pico em 30-45min, meia-vida 5h).
  - Sugestão de "1-2 dias off por semana" se ≥6 dias seguidos com cafeína.
- W-4.5 — **Sleep Gate explícito** — pós-cool-down, mostra:
  - Próximas 30min: "não vá para a cama". Timer + sugestões (caminhada, banho).
  - Próximas 6h: "evite cafeína" (verifica caffeine tracker).
  - Conexão com `user_settings.sleep_target_time`.
- W-4.6 — **Compliance Dashboard** — substitui StatisticsDialog:
  - % sessões com warm-up completo (semana, mês, all-time).
  - % sessões com cool-down completo.
  - Streak de "ritual completo" (warm-up + cool-down + sessão).
  - Meta sugerida: 90% nas 4 primeiras semanas (seguindo C8 §11).
  - Compliance por bloco (qual bloco é mais pulado? insight para Coach review).

**UX/UI:**
- Card de versão mínima ao lado da completa, com tag "Quando não houver tempo".
- Pre-bullet: modal pequeno (não fullscreen), 60s, dispensável com 1 clique. Não pode bloquear o cliente de poker abrir.
- Caffeine tracker: visual tipo barra de tempo com pico/meia-vida overlay; alertas inline.
- Sleep Gate: notificação suave (não intrusiva).

**Backend changes:**
- Tabela `caffeine_intakes` — id, userId, intakeAt, doseMg, source, notes.
- Tabela `prebullet_rituals` — id, userId, plannedTournamentId (nullable), sessionTournamentId (nullable), focus, completedAt, durationSeconds.
- `user_settings.sleep_target_time` (string HH:mm).
- Endpoint `GET /api/session-rituals/compliance?range=` — retorna compliance agregado.

**Métricas de sucesso:**
- Versão mínima ≥30% do total de warm-ups (sinal saudável: player escolhe mínima > pula).
- Pre-bullet: opt-in ≥20% (não pressionar — é opcional).
- Caffeine cutoff respeitado em ≥70% dos dias após 4 semanas de uso.
- Streak de ritual completo (warm-up + cool-down) com mediana ≥7 dias para usuários ativos.

**Esforço:** **M** — 2-3 sprints-dev.

**ICE:** Impact 7 / Confidence 8 / Ease 6 → **7.0**

---

### Sprint W-5 — Profundidade: Voice Journal, Biometria & Export

**Objetivo:** Adicionar profundidade qualitativa e integrações que diferenciam Grindfy de Primed Mind/Headspace.

**Features incluídas:**
- W-5.1 — **Voice Journal** — em vez de digitar Bloco 3 do cool-down (ABC journal), gravar áudio (até 3min). Whisper API transcreve. Salva áudio + transcrição. Útil quando o player está exausto.
- W-5.2 — **Biometria opcional via smartphone** — HRV pré-sessão via câmera (HRV4Training-like) ou via integração Apple Health / Google Fit / WHOOP / Oura. Importa:
  - HRV manhã, sono noite anterior, RHR, recovery score.
  - Informa o check 0-10 do warm-up: "HRV baixo + sono <6h → consider check ≤6".
- W-5.3 — **Export para mental coach humano** — botão "Exportar últimas 4 semanas" gera PDF com:
  - Compliance, ABC journal entries, mãos starradas, padrões de tilt, IZOF curve.
  - Formato pensado para sessão com mental coach humano (Tendler-style coaching).
  - Diferencial: hoje player envia screenshot ad hoc; com isto vira workflow estruturado.
- W-5.4 — **Library de áudios de respiração e visualização (curada)** — substitui AudioLibraryDialog atual, com curadoria por contexto:
  - Pré-bullet 60s (3 áudios)
  - Pré-FT 90s (3 áudios)
  - Pós-cooler 4-7-8 (3 áudios)
  - Sleep transition 10min (3 áudios)
  - Possível parceria/produção com mental coaches BR (Felipe Mojave? David Damasceno?).
- W-5.5 — **Compartilhar com staker / coach via link assinado** — gerar URL temporária read-only do compliance + IZOF, expirável em 7d. Útil para staking deals onde o staker quer ver disciplina.

**UX/UI:**
- Voice journal: botão de microfone grande, indicador de gravação, playback antes de salvar.
- Biometria: card opcional, opt-in explícito (privacidade first).
- Export: botão "Gerar relatório" → PDF com layout limpo.

**Backend changes:**
- Tabela `voice_journals` — id, sessionRitualId, audioUrl, transcript, duration, language, createdAt.
- Tabela `biometric_imports` — id, userId, source ('apple' | 'google' | 'whoop' | 'oura' | 'manual'), importedAt, hrv, sleepHours, rhr, recoveryScore, raw.
- Endpoint `POST /api/voice-journal/upload` (multipart, transcribe via Whisper).
- Endpoint `POST /api/biometric/import` (OAuth flows).
- Endpoint `POST /api/share-links` (gera token assinado curto-prazo).

**Métricas de sucesso:**
- Voice journal: ≥15% de adoção entre usuários ativos.
- Biometria: ≥10% conectam pelo menos uma fonte.
- Export PDF: ≥5% dos usuários geram pelo menos 1 PDF.
- Share link: ≥3% (nicho — quem tem staker/coach humano).

**Esforço:** **L** — 3-4 sprints-dev.

**ICE:** Impact 6 / Confidence 5 / Ease 3 → **4.7**

---

## 5. Funcionalidades Novas Propostas (≥10) — Lista Consolidada

| # | Nome | Descrição (2-3 linhas) | Justificativa | ICE | Sprint |
|---|------|------------------------|---------------|-----|--------|
| **F-01** | WarmUpRunner cronometrado (5 blocos) | Componente fullscreen com timer por bloco, ordem fixa, prompts de conteúdo. Substitui o checklist solto atual. | C8 §04 inteira; resolve D-1, D-7. Sem cronômetro, "warm-up" é só intenção decorativa. | I9·C9·E5 → **7.7** | W-1 |
| **F-02** | Gate Go/No-Go via check 0-10 | Pergunta "estou OK pra jogar agora? 0-10". <6 bloqueia botão "Iniciar Grind" e sugere alternativas. | C8 §02 Função 03 + §09 Erro 04. Resolve D-2 (decisão por inércia). Único bloco que evita -EV de jogar em dia ruim. | I10·C9·E8 → **9.0** | W-1 |
| **F-03** | CoolDownRunner (4 blocos) | Análogo do warm-up para pós-sessão: 4-7-8 → star de mãos → ABC journal → separador físico. | C8 §05 inteira. Resolve D-3, D-4, D-5. Cool-down é o ritual mais negligenciado e mais correlacionado com longevidade. | I10·C9·E4 → **7.7** | W-2 |
| **F-04** | Captura de mãos críticas (star de 3-5) | Form para 3-5 mãos com stack/spot/decisão/dúvida. Sem análise — só captura. Reaparecem no warm-up de amanhã para revisão. | C8 §05 Bloco 2; §09 Erro 02. Resolve D-3, D-8. Hoje player perde mãos críticas. | I9·C9·E5 → **7.7** | W-2 |
| **F-05** | A/B/C-Game Journal estruturado | 4 perguntas obrigatórias após sessão com picker dos 7 tilts de Tendler. | C8 §05 Bloco 3. É a coleta que alimenta evolução semanal — sem ela, player não sabe o que corrigir. | I9·C8·E6 → **7.7** | W-2 |
| **F-06** | Foco da Semana (Sunday Review) | Domingo 22h, player define 3 heurísticas-alvo. Bloco 2 do warm-up consome essa lista. | C7 hierarquia de metas; C8 §04 Bloco 2; §11. Sem isso, Bloco 2 não tem conteúdo. | I8·C8·E6 → **7.3** | W-3 |
| **F-07** | Mapa de Leak Emocional (C3) | Onboarding 5min, 12 perguntas. Output: leak primário (1 dos 7 de Tendler/C3) + plano de exposição. | C3 inteira; personaliza drills do Bloco 3. Resolve generalidade da página atual. | I8·C7·E5 → **6.7** | W-3 |
| **F-08** | IZOF Tracker | Após 20+ warm-ups, calcula zona ótima individual de ativação cruzando check 0-10 × ROI. Avisa quando o jogador está fora da zona. | Hanin IZOF; personaliza o gate go/no-go (não é 6 universal — é zona individual). | I8·C6·E4 → **6.0** | W-3 |
| **F-09** | Coach AI Weekly Protocol Review | Domingo 20h, Coach AI gera relatório com compliance, padrões e sugestões de heurísticas para a semana. | Diferencial competitivo vs Primed Mind/Tendler; integra com `/coach`. Resolve onboarding e adesão. | I9·C7·E4 → **6.7** | W-3 |
| **F-10** | Implementation Intentions Library | Biblioteca de planos anti-tilt "SE-ENTÃO" pré-cadastrados, picker no Bloco 5. | C7 Gollwitzer; C8 §04 Bloco 5. Resolve campo "se sentir tilt vou..." que hoje fica em branco. | I7·C8·E7 → **7.3** | W-3 |
| **F-11** | Versão Mínima warm-up (3min) e cool-down (5min) | Protocolos compactos para quando não há tempo. Persistidos com flag `version='minimal'`. | C8 §07. Sem versão mínima, player pula em dias corridos. "Mínima >> pular sempre". | I8·C9·E8 → **8.3** | W-4 |
| **F-12** | Pre-Bullet Ritual (60s) | Antes de cada torneio individual da grade, 60s opcionais: 5 respirações + 1 frase de foco. | Gap evidente: warm-up de 10min só serve à abertura da sessão; FT começa horas depois. C8 §02 indica regra binária "1 mesa = warm-up" mas não formaliza por bullet. | I7·C7·E8 → **7.3** | W-4 |
| **F-13** | Caffeine Tracker | Log de horário/dose, cálculo de cutoff, alerta de consumo após cutoff, sugestão de ciclagem semanal. | C8 §06 inteira. Sem isto, cafeína é variável invisível. Resolve D-6. | I7·C8·E7 → **7.3** | W-4 |
| **F-14** | Sleep Gate pós-cool-down | Mensagem + timer 30min "não vá para a cama"; alerta de cafeína nas 6h pré-sleep. | C8 §05 Bloco 4 + §06 Regra 02. Protege o sono — variável crítica para warm-up de amanhã. | I7·C8·E7 → **7.3** | W-4 |
| **F-15** | Compliance Dashboard | % sessões com warm-up/cool-down completos (semana, mês, all-time), streak, compliance por bloco. | C7 + C8 §11; substitui StatisticsDialog atual. Compliance é a métrica certa, não score 60/40. | I8·C8·E7 → **7.7** | W-4 |
| **F-16** | Voice Journal pós-sessão | Gravação de áudio até 3min em vez do texto do ABC journal; transcrição via Whisper. | Resolve fricção com player exausto; benchmark Strive/Calm têm áudio. | I6·C6·E5 → **5.7** | W-5 |
| **F-17** | Biometria opcional (HRV/sleep) | Importa HRV manhã, sono e recovery de Apple Health/Whoop/Oura para informar check 0-10. | Hanin: pre-arousal pode ser medido objetivamente. Diferencial com WHOOP. | I7·C5·E3 → **5.0** | W-5 |
| **F-18** | Export PDF para mental coach humano | Relatório de 4 semanas com compliance, ABC entries, mãos starradas, IZOF — formato consumível por coach humano (Tendler-style). | Player profissional usa coach humano; fluxo de export estrutura o handoff. | I6·C7·E6 → **6.3** | W-5 |
| **F-19** | Library de áudios curada (4 contextos) | Áudios de respiração/visualização para pre-bullet, pre-FT, pós-cooler 4-7-8, sleep transition. | Substitui AudioLibrary atual com curadoria. Diferencial vs Primed Mind: contexto-específico. | I6·C7·E6 → **6.3** | W-5 |
| **F-20** | Share link com staker/coach | URL temporária read-only com compliance + IZOF, válida 7 dias. | Nicho mas alto valor para staking deals. | I5·C7·E6 → **6.0** | W-5 |

**Top 5 por ICE:**
1. **F-02 — Gate Go/No-Go (9.0)** — bloqueia jogar em dia ruim. Maior leverage por linha de código.
2. **F-11 — Versão Mínima (8.3)** — sempre disponível, evita "pular".
3. **F-15 — Compliance Dashboard (7.7)**, **F-01 — WarmUpRunner (7.7)**, **F-03/04/05 — Cool-down core (7.7)** — empate.

---

## 6. Mudanças de UX por Componente Atual

| Componente atual | Decisão | Detalhes |
|------------------|---------|----------|
| **`MentalPrep.tsx`** (página) | **Refatorar** | Vira hub de Session Rituals com 3 cards: "Iniciar warm-up (10min)", "Iniciar cool-down (15min)", "Histórico/Compliance". Header muda para "Session Rituals — Warm-up & Cool-down" mantendo rota `/mental` por compat. Score 60/40 removido. |
| **`WarmUpChecklist.tsx`** | **Substituir** | Vira `WarmUpRunner` (componente novo, Sprint W-1). Mantém somente a referência conceitual de "atividades" — agora elas são blocos cronometrados com prompts. |
| **`MentalStateCard.tsx`** (4 sliders) | **Remover** | Sliders Energia/Foco/Confiança/Equilíbrio caem. Substituídos pelo check único 0-10 do Bloco 1 (mais aderente ao C8) + perfil mental persistente em `mental_profile` (W-3). |
| **`CustomizationDialog.tsx`** | **Remover** | Customização de pesos não faz mais sentido com compliance binária. Substituído por personalização via Mapa de Leak (W-3). |
| **`AchievementsDialog.tsx`** | **Refatorar** | Mantém streaks/milestones, mas ancorados em compliance (warm-up/cool-down completos consecutivos), não em "score". Adicionar achievement de IZOF descoberto. |
| **`StatisticsDialog.tsx`** | **Substituir** | Vira `ComplianceDashboard` (W-4): % warm-up, % cool-down, streak, compliance por bloco. Insight "qual bloco mais pula". |
| **`CorrelationDialog.tsx`** | **Substituir** | Vira `CorrelationDashboardV2` (W-3): regressão `score × ROI`, heatmap atividade × performance, segmentação por contexto (ICM, FT, fadiga). |
| **`MeditationDialog.tsx`** | **Migrar conteúdo** | Conteúdo migra para áudio guiado dentro do Bloco 1 do warm-up (respiração caixa) e Bloco 1 do cool-down (4-7-8). Componente standalone removido. |
| **`VisualizationDialog.tsx`** | **Mover para library curada** | Migra para Library de Áudios Curada (W-5), categoria "pre-FT visualization". |
| **`AudioLibraryDialog.tsx`** | **Substituir** | Vira Library curada por contexto (W-5): pre-bullet 60s, pre-FT 90s, pós-cooler 4-7-8, sleep transition 10min. |
| **`PersonalNotesCard.tsx`** | **Manter, deslocar** | Notas pessoais migram para o Bloco 5 do warm-up (intenção da sessão) e Bloco 3 do cool-down (ABC journal). Componente solto deixa de existir. |
| **`QuickHistoryCard.tsx`** | **Refatorar** | Vira histórico de rituais (warm-up + cool-down + decisões go/no-go) — não só "logs". |
| **`GoalsCard.tsx`** | **Refatorar para Sunday Review** | Conexão com `weekly_focus` (W-3). 3 heurísticas-alvo da semana = metas de processo C7. |
| **Botão "Iniciar Grind"** | **Refatorar com gate** | Permanece, mas só habilita após warm-up completo (≤30min) E check ≥6 (ou IZOF zone). Caso contrário, mostra alternativas. |
| **Score 60/40** | **Remover totalmente** | Compliance binária + IZOF substituem. |

---

## 7. Modelo de Dados — Mudanças Propostas

### Tabelas novas

```sql
-- Substitui semanticamente preparation_logs (manter por 60d para compat)
session_rituals (
  id varchar PK, userId varchar FK,
  type enum('warmup','cooldown'),
  startedAt timestamp, completedAt timestamp, durationMinutes int,
  version enum('full','minimal','aborted'),
  emotionalCheckScore int CHECK (0-10) NULL,
  decisionToPlay boolean NULL,
  blocksCompleted jsonb,           -- [{blockId, completedAt, contentSnapshot}]
  sessionIntention jsonb NULL,     -- {focus, tiltPlan, stopCriteria}
  linkedGrindSessionId varchar FK NULL,
  createdAt timestamp
)

starred_hands (
  id varchar PK, userId varchar FK, sessionRitualId varchar FK,
  grindSessionId varchar FK NULL, capturedAt timestamp,
  stackBb numeric, spotText text, decisionTaken text, doubt text,
  status enum('pending_review','reviewed','archived'),
  reviewedInRitualId varchar FK NULL
)

abc_game_logs (
  id varchar PK, sessionRitualId varchar FK,
  aPercent int, bPercent int, cPercent int,  -- soma=100
  fallTrigger text, tiltType enum(7 Tendler types),
  workedWell text, focusApplied enum('yes','partial','no'),
  focusNote text
)

weekly_focus (
  id varchar PK, userId varchar FK, weekStart date,
  heuristic1 text, heuristic2 text, heuristic3 text,
  stopLoss numeric NULL, timerMinutes int NULL,
  source enum('manual','coach_suggested')
)

mental_profile (
  id varchar PK, userId varchar UNIQUE FK,
  primaryLeak enum(7 types), secondaryLeak enum NULL,
  izofMin int NULL, izofMax int NULL, izofConfidenceN int,
  lastUpdated timestamp
)

implementation_intentions (
  id varchar PK, userId varchar FK,
  triggerText text, responseText text, isDefault boolean,
  createdAt timestamp
)

coach_protocol_reviews (
  id varchar PK, userId varchar FK, weekStart date,
  complianceJson jsonb, suggestionsJson jsonb,
  generatedAt timestamp
)

caffeine_intakes (
  id varchar PK, userId varchar FK,
  intakeAt timestamp, doseMg int,
  source enum('espresso','filter','energy','tea','custom'),
  notes text
)

prebullet_rituals (
  id varchar PK, userId varchar FK,
  plannedTournamentId varchar FK NULL,
  sessionTournamentId varchar FK NULL,
  focus text, completedAt timestamp, durationSeconds int
)

voice_journals (
  id varchar PK, sessionRitualId varchar FK,
  audioUrl text, transcript text, duration int, language varchar,
  createdAt timestamp
)

biometric_imports (
  id varchar PK, userId varchar FK,
  source enum('apple','google','whoop','oura','manual'),
  importedAt timestamp, hrv numeric NULL, sleepHours numeric NULL,
  rhr int NULL, recoveryScore int NULL, raw jsonb
)
```

### Mudanças em tabelas existentes

- `user_settings` — adicionar `sleep_target_time` (varchar HH:mm, nullable), `caffeine_cutoff_hours` (int, default 6).
- `preparation_logs` — **manter, deprecar**. Após 60 dias e migração validada, remover.
- `grind_sessions` — adicionar `linkedRitualWarmupId`, `linkedRitualCooldownId` (varchar FK, nullable) para conectar bidirecionalmente.

---

## 8. Integração com Outras Áreas do Produto

| Área | Conexão proposta |
|------|------------------|
| **`/coach` (Coach AI)** | (a) Coach lê `session_rituals`, `abc_game_logs`, `starred_hands`, `mental_profile` no contexto. (b) Coach AI Weekly Review (W-3.5) escreve em `coach_protocol_reviews` e sugere heurísticas para `weekly_focus`. (c) Player pode pedir "analise minha mão starrada #X" e Coach traz contexto. |
| **`/grind` (Grind Session)** | (a) Botão "Iniciar Grind" gate por warm-up recente (≤30min). (b) Ao terminar sessão, prompt "Iniciar cool-down agora?". (c) `linkedGrindSessionId` no `session_rituals` permite correlação. (d) Pre-bullet ritual disparado quando torneio inicia. |
| **`/bankroll` (Bankroll)** | (a) Tilt monetário é leak C3. Quando player joga acima do banco recomendado, Bankroll pode disparar warm-up obrigatório com Implementation Intention de scared money. (b) Cool-down leu lucro/prejuízo da sessão para enriquecer ABC journal ("foi B-game porque -3bi disparou tilt"). |
| **`/estudos` (Studies)** | (a) Mãos starradas no cool-down viram material de estudo (link "Analisar mão" no card). (b) Foco da semana (W-3.1) sugere study cards do tema. |
| **`/grade-planner` (Grade)** | Pre-bullet ritual conecta com `planned_tournaments`. Cada torneio da grade pode ter ritual prep. |
| **Notificações** | Push: "Domingo 20h — Coach Review pronto", "Domingo 22h — Sunday Review", "Cool-down esquecido (sessão terminou há 30min)". |

---

## 9. Riscos e Ressalvas

| # | Risco | Severidade | Mitigação |
|---|-------|------------|-----------|
| **R-1** | **Gate Go/No-Go irrita o usuário** — bloquear "Iniciar Grind" pode gerar churn de quem quer só usar tracker | Alta | (a) Configurável em settings (ON por padrão, mas player pode desligar com aviso explícito de que está abrindo mão de feature). (b) Em vez de bloqueio total, oferecer "ainda quero jogar" com confirmação dupla. (c) Telemetria: observar % de "ainda quero jogar" — se >50%, repensar UX. |
| **R-2** | **10min de warm-up é muito** — player pula | Média | (a) Versão mínima (3min) sempre visível. (b) Comunicar valor (C8 §02 — primeiros 15min concentram tilt-shoves). (c) Compliance pública (gamificação social leve). |
| **R-3** | **Cool-down vira fricção pós-sessão** — player só quer fechar | Alta | (a) Versão mínima 5min sempre disponível. (b) Implementation Intention obrigatória durante onboarding ("SE fechar última mesa, ENTÃO 15min cool-down"). (c) Streak gamificado. |
| **R-4** | **Migration de `preparation_logs` para `session_rituals`** — perda de dados | Alta | (a) Period de 60 dias com dual-write. (b) Script de migração testado com snapshot. (c) Histórico antigo visível em modo legado durante a transição. |
| **R-5** | **IZOF requer 20+ data points** — UX vazia para iniciantes | Média | (a) Mensagem clara "Você precisa de 20+ warm-ups para descobrir sua zona ótima — atualmente você tem N". (b) Antes disso, usar regra C8 (≥6 default). |
| **R-6** | **Voice journal + biometria são privacidade-sensíveis** | Alta | (a) Opt-in explícito em ambos. (b) Áudios criptografados em rest. (c) Política de retenção: voice journals deletados após 90d (configurável). (d) Biometria nunca vai pro Coach AI sem consentimento. |
| **R-7** | **Sprint W-3 (IZOF + Coach review) depende de volume de dados** | Média | (a) Lançar W-1 e W-2 primeiro — coleta dados. (b) Soft-launch W-3 só para usuários com 30+ rituais. |

---

## 10. Roadmap Proposto

| Sprint | Tema | Features | Esforço (sprints-dev) | ICE médio | Release |
|--------|------|----------|------------------------|-----------|---------|
| **W-1** | Fundação warm-up | F-01, F-02 | 3-4 | 8.4 | M+1 |
| **W-2** | Cool-down core | F-03, F-04, F-05 | 3-4 | 7.7 | M+2 |
| **W-3** | Inteligência | F-06, F-07, F-08, F-09, F-10 | 5-6 | 6.8 | M+3-4 |
| **W-4** | Hábito e operação | F-11, F-12, F-13, F-14, F-15 | 2-3 | 7.5 | M+4-5 |
| **W-5** | Profundidade | F-16, F-17, F-18, F-19, F-20 | 3-4 | 5.7 | M+6+ |

**Total:** 14-18 sprints-dev (≈14-18 semanas com 1 dev focado em mental, ou 7-9 semanas com 2 devs). Primeira release pública (W-1+W-2 entregues): ~8 semanas. Diferencial competitivo aparente vs Primed Mind/Headspace: a partir de W-3 (IZOF + Coach review).

### Ordem de prioridade recomendada (PM-Spec)

1. **Bloco 1 (entrega imediata de valor):** Sprints W-1 + W-2.
2. **Bloco 2 (diferencial de produto):** Sprint W-3.
3. **Bloco 3 (cobertura de casos reais):** Sprint W-4.
4. **Bloco 4 (profundidade premium):** Sprint W-5.

### Decisões pendentes para o fundador

1. Manter rota `/mental` ou renomear para `/rituals` (com redirect)? Estrategicamente: `rituals` é mais aderente ao novo escopo, mas quebra muscle memory.
2. Gate Go/No-Go é hard (bloqueia) ou soft (warning + confirmação)? Recomendação: hard com toggle settings.
3. Library de áudios curada — produzir conteúdo BR (custo) ou licenciar inglês? Recomendação: produzir 8-12 áudios BR no W-5 (diferencial cultural).
4. IZOF — só Pro/Premium ou todos? Recomendação: Pro+ (alto valor percebido, justifica plano).

---

## Apêndice — Mapeamento Direto C8 → Features

Cada item do C8 que vira código:

| C8 Seção | Item canônico | Feature(s) |
|----------|---------------|------------|
| §02 Função 01 | Pré-aquecer PFC (15min de ativação) | F-01 (Bloco 3 drill 4min) |
| §02 Função 02 | Carregar memória de trabalho | F-01 (Bloco 2) + F-06 (Sunday Review) |
| §02 Função 03 | Calibrar estado emocional | F-02 (Gate 0-10) |
| §02 Função 04 | Transição cognitiva | F-01 (Bloco 4 setup físico) |
| §03 Função 01 | Debrief de mãos críticas | F-04 (Star de mãos) |
| §03 Função 02 | Fechar loop Zeigarnik | F-03 (CoolDownRunner) |
| §03 Função 03 | Ventilação pós-bad beat | F-03 (Bloco 4 — separador físico) + F-19 (áudios pós-cooler) |
| §04 — 5 blocos warm-up | Protocolo cronometrado | F-01 (todos os blocos) |
| §05 — 4 blocos cool-down | Protocolo cool-down | F-03 (todos os blocos) |
| §06 Caffeine strategy | Timing/cutoff/ciclagem | F-13 (Caffeine Tracker) |
| §07 Versão mínima | 3min/5min comprimido | F-11 (Versão mínima) |
| §08 Integração rotina | Conexões com C7, C6, D2, B3 | F-09 (Coach AI Review) + F-10 (Implementation Intentions) |
| §09 Erro 01 | Pular em torneio pequeno | F-12 (Pre-Bullet Ritual) reforça regra "1 mesa = ritual" |
| §09 Erro 02 | Analisar no cool-down | F-04 (separar captura de análise — UX explícita "NÃO analise") |
| §09 Erro 03 | Direto pra cama | F-14 (Sleep Gate) |
| §09 Erro 04 | Warm-up sem check emocional | F-02 (Gate obrigatório) |
| §09 Erro 05 | Cafeína 3h antes de dormir | F-13 + F-14 combinados |
| §11 Saltia (compliance) | % sessões + streak + meta 90% | F-15 (Compliance Dashboard) |

---

**Fim do plano.**

Próximo passo recomendado pelo Strategist: invocar **PM-Spec** para gerar a spec executável da Sprint **W-1 (Fundação warm-up)**, começando por F-02 (Gate Go/No-Go) — maior ICE, menor esforço — seguido de F-01 (WarmUpRunner cronometrado).
