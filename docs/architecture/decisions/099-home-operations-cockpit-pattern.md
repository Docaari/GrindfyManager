# ADR-099 — Home como Operations Cockpit Pessoal (substituicao do launcher de modulos)

- Status: Proposto
- Data: 2026-05-03
- Sprint: home-reform-1 (Onda 1 da reforma da Home)
- Decision owner: system-architect (formaliza founder D-FOUNDER-1/2/3/4 e PM-Spec D1-D20)
- Related: ADR-078 (design tokens), ADR-016 (bundle aggregation pattern), ADR-100 (news flag), ADR-101 (sidebar IA), ADR-102 (overview cache strategy)
- Spec: `Docs/specs/home-reform-1.md`
- Doc de pesquisa: `Docs/strategy/home-reform-research-and-plan.md` v1.1

---

## 1. Contexto

### 1.1. Diagnostico

A Home atual (`client/src/pages/Home.tsx`, ~510 linhas) e um **launcher de modulos**: cabecalho de boas-vindas, 3 vanity metrics (uploads totais, dias ativos, sessoes), 4 cards grandes apontando para as features (Importar / Dashboard / Coach / Grind), checklist de onboarding sempre visivel, e um footer com 4 quick actions duplicadas. O usuario logado precisa **navegar** para descobrir o estado dele: a Home nao responde "o que esta acontecendo agora?", apenas "para onde voce quer ir?".

Em paralelo, 9 features shipadas em 2026-04+ (Bankroll Multi-Wallet, Tournament Selector, Stats Analyzer, Coach AI, Biblioteca, Studies-Reform, Flight, PrimeDope variance, Cooldown stops) produzem **estado em tempo real** que hoje nao chega a Home: cooldowns ativos, Day 2 de flight comecando em 1h, perfil A/B/C/OFF do dia, primeiro torneio planejado, banca em USD com BIs disponiveis, ROI 30d, maos starred pendentes. Cada um destes vive em sua pagina dedicada, o que forca o pro player a abrir 4-6 tabs para "ver o dia".

### 1.2. Forcas

- **5-second rule**: pro player abre a Home as 11h, as 17h e as 23h. Em <5s precisa decidir "vou grindar?", "tenho cooldown ativo?", "tenho mao pendente que esqueci?". Launcher atual gasta esses 5s pedindo onde ele quer ir.
- **D-FOUNDER-1 — Sem gamificacao**: streaks, badges, daily goals, heatmap calendario Duolingo-style estao **vetados permanentemente em qualquer onda**. Status Strip vai com 4 KPIs (Banca / ROI 30d / Hoje / Pendencias), nunca 5.
- **D-FOUNDER-2 — Sem customizacao em Ondas 1+2**: layout fixo. Toggle on/off + drag-drop ficam para Onda 3, condicionados a analytics coletados em Onda 1. Spec NAO cria schema `user_settings.homeLayout` nem UI de configuracao.
- **Densidade <40%**: vetar "Christmas tree" de cores (amber, vermelho, verde, azul brigando). Cor de destaque so em estados que exigem acao (cooldown ativo, pendencias > 0).
- **Progressive disclosure**: power user (>=50 torneios E >=5 sessoes) ve cockpit cheio; user novo ve checklist de 4 passos. Ambos na mesma URL `/`.
- **Zero divergencia com Dashboard**: Home e o cockpit do **agora**; `/dashboard` continua sendo o analitico profundo (filtros, drill-down, comparativos historicos). Home **nao replica** dashboard.

### 1.3. Pendencia residual deixada pelo PM-Spec (D10)

Em F1 (Historico Geral compacto), a 4a metrica e `currentStreakDays` (dias consecutivos com sessao). PM-Spec deixou para o architect resolver: **e isso gamificacao silenciosa que viola D-FOUNDER-1?**

Argumentos pro:
- Streak e o gancho gamificado mais usado por Duolingo, GitHub etc.
- Numero crescente induz comportamento "nao posso quebrar a sequencia" — exatamente o que D-FOUNDER-1 corta.

Argumentos contra:
- Sem badge/celebration/CTA, e apenas uma metrica descritiva como "dias ativos".
- Pro player ja sabe quando jogou; nao e nudge para ele jogar amanha.

---

## 2. Decisao

A Home deixa de ser launcher de modulos e passa a ser **Operations Cockpit Pessoal**: uma pagina-painel que responde em <5s "o que esta acontecendo agora e o que eu preciso fazer?". Layout fixo Ondas 1+2, customizavel apenas em Onda 3.

### 2.1. Padroes do cockpit

1. **Layout fixo em 13 blocos** (S1-S5, F1, F2, F6, F8, F9, F10, S12, S15, S16) — IDs ja definidos na spec §1. Ondas 2 acrescentam 6 blocos novos (F5, F7, S6, S7, S10, S11) na mesma malha visual; Onda 3 introduz toggle/drag.
2. **Status Strip = 4 KPIs (D-FOUNDER-1)**: Banca / ROI 30d / Hoje / Pendencias. Nunca 5.
3. **5-second rule**: o conjunto S1+S2+S3+S5 (Status Strip + Today + banners) deve ser legivel em <5s sem scroll em desktop >=1280px.
4. **Densidade <40% via tokens (`tokens.color.text.primary` neutro como default)**: cor de destaque so em (a) `pendencias.starredHands > 0 OR pendencias.cooldownAlerts > 0` (amber), (b) banner cooldown ativo (amber), (c) banner flight ativo (verde sutil), (d) PnL recentSessions colorido por sinal. Nada mais.
5. **Progressive disclosure via `data.userState`**: backend retorna `'empty' | 'power'` baseado em threshold conservador `quickStats.totalTournaments >= 50 AND totalSessions >= 5`. Frontend renderiza componentes diferentes (`<EmptyHomeOnboarding>` vs cockpit). Botao "Pular onboarding" sempre disponivel via `localStorage:home:skipOnboarding=true`.
6. **Zero divergencia com Dashboard**: Home **nao** tem filtros de periodo customizados (excecao bem-comportada: F6 toggle 7d/30d/90d/YTD, persistido em `localStorage:home:f6:range`, dispara query separada `/api/dashboard/performance?period=X`). Toda metrica clicavel leva a pagina-fonte (`/bankroll`, `/dashboard`, `/coach`, `/estudos`).
7. **Banner priority**: D9 — quando `cooldown.active && flight.active`, **flight prevalece** acima do cooldown (acionavel imediato > restritivo). Banner dismiss e em-sessao via `useState` (nao persiste em localStorage); reaparece no proximo refresh se condicao continua.

### 2.2. Resolucao da pendencia D10 (currentStreakDays)

**Decisao do architect: MANTER `currentStreakDays` em F1, mas com guardrails arquiteturais explicitos.**

Justificativa:
- F1 e bloco passivo descritivo (visualmente compacto, h-16, 4 numeros + label). Nao tem badge, nao tem CTA, nao tem celebration animation, nao tem cor de destaque, nao tem "milestone reached" notification.
- A spec ja documenta (§5.6) que F1 e bloco "estatistico simples" — mesma natureza de `totalTournaments`, `totalSessions`, `activeDays`.
- Streak vira gamificacao **somente** quando ganha sintomas: progress bar, fogo emoji crescendo, "voce esta a 1 dia de bater seu recorde", reminder push. Nada disso esta na spec nem virara.

Guardrails arquiteturais (vinculantes):
- F1 **nao** pode adicionar emoji 🔥, 🎯, ⭐ ou similar antes/depois do numero de streak. Apenas label PT-BR seco "Sequencia (dias)".
- F1 **nao** pode acessar `localStorage` para tracking de "best streak" ou comparativo.
- F1 **nao** pode ter sub-text "vs ultima semana" ou similar comparativo emocional.
- F1 **nao** pode ter cor de destaque mesmo quando streak >= N. Numero sempre `tokens.color.text.primary`.
- Reviewer reprova qualquer PR futuro que adicione qualquer um dos sintomas acima.

Saida de emergencia (D10 backup): se em alpha founder validar que ate o numero descritivo nudga gamificacao, trivial trocar **1 string + 1 campo no payload**:
- Backend: substituir `lifetime.currentStreakDays: number` por `lifetime.lastUploadAt: string | null` (data ISO).
- Frontend `<LifetimeStats>`: trocar 4a coluna de "Sequencia (dias)" para "Ultimo upload" + formatador relativo "ha 3 dias" / "hoje".
- Sem migration. Sem mudanca de schema. PR isolado.

### 2.3. Empty state

User com `totalTournaments < 50 OR totalSessions < 5` (E **nao** tem flag `home:skipOnboarding=true` em localStorage) recebe `<EmptyHomeOnboarding>` com checklist 4 passos:

1. Importar primeiro CSV → `/upload`
2. Configurar banca → `/bankroll`
3. Planejar grade da semana → `/coach`
4. Iniciar primeira sessao live → `/grind`

Cada step com flag `completed` derivada de quickStats (`totalTournaments > 0`, `walletsConfigured`, `gradeDays > 0`, `totalSessions > 0`). Ao completar 4 steps, layout transiciona para power user automaticamente (sem reload — reactive a re-fetch on focus). Botao "Pular onboarding" seta `localStorage:home:skipOnboarding=true` e renderiza power state mesmo abaixo dos thresholds.

### 2.4. Arquivos tocados/criados (binding contract para implementer)

**Substituicao in-place:**
- `B:\grindfy\client\src\pages\Home.tsx` — substituir conteudo (zero rota nova; mantem rota `/` em `App.tsx`).

**Componentes novos (`client/src/components/home/`):**
- `StatusStrip.tsx` (RF-09)
- `TodayCard.tsx` (RF-10)
- `CooldownBanner.tsx` (RF-11)
- `NextTournamentCountdown.tsx` (RF-12)
- `FlightBanner.tsx` (RF-13)
- `LifetimeStats.tsx` (RF-14)
- `RecentSessionsList.tsx` (RF-15)
- `PerformanceMini.tsx` (RF-16)
- `PendingHandsList.tsx` (RF-17)
- `HomeFooter.tsx` (RF-18)
- `EmptyHomeOnboarding.tsx` (RF-20)
- `HomeSkeleton.tsx` (opcional — fallback global)

**Componente branding novo:**
- `B:\grindfy\client\src\components\branding\HeaderLogo.tsx` (RF-06)

**Frontend tokens:**
- `B:\grindfy\client\src\lib\ui-tokens.ts` (existente — consumido por todos os blocos novos. Zero hardcoded `bg-gray-9`, `text-emerald-`, `bg-slate-8`).

**Backend (escopo desta ADR e o cockpit em si — endpoint composto e ADR-102):**
- `B:\grindfy\server\routes\home.ts` (NOVO — reffer ADR-102 para detalhes do endpoint)

---

## 3. Opcoes Consideradas

### Opcao A — Manter launcher e adicionar widgets opcionais

**Pros:**
- Sem refactor da Home atual.
- Preserva mental model "Home = ponto de entrada".

**Contras:**
- Nao resolve o diagnostico (Home permanece passiva, sem estado em tempo real).
- Adiciona ruido visual (launcher + widgets brigam por atencao).
- Cria 2 padroes simultaneos no produto.

### Opcao B — Cockpit Operations com layout fixo (ESCOLHIDA)

**Pros:**
- Resolve 5-second rule.
- Aproveita as 9 features shipadas em 2026-04+ que produzem estado real-time.
- Layout fixo simplifica QA e guard-rails (D-FOUNDER-2 corta customizacao).
- Empty state via `userState` permite conviver onboarding e power state na mesma URL.
- Densidade <40% via tokens (zero hardcoded color).

**Contras:**
- Refactor grande de `Home.tsx` (~510 linhas → 12 componentes novos).
- Pro player que tinha muscle memory do launcher precisa adaptar (mitigado por D19 — sidebar mantem URLs e item "Hoje" continua mais alto).

### Opcao C — Dashboard 2.0 (move toda Home para `/dashboard` e simplifica `/`)

**Pros:**
- Dashboard ja e a "pagina de dados".

**Contras:**
- Conflita com proposito do dashboard (analitico profundo, filtros, drill-down).
- User abre `/` esperando decisao rapida; obriga-lo a ir em `/dashboard` adiciona friction.
- Quebra mental model existente.

---

## 4. Consequencias

### 4.1. Positivas

- **5-second rule cumprida**: S1+S2+S3+S5 acima do fold em desktop.
- **Zero overlap com `/dashboard`**: Home e cockpit do agora; dashboard e analitico profundo.
- **Empty/power states convivem na mesma URL** sem bifurcacao de rotas.
- **D-FOUNDER-1 enforced via arquitetura**: sem schema gamificacao, sem componente `<StreakBadge>`, sem celebration animation.
- **Tokens UI** (ADR-078) consumidos pela primeira vez em pagina de alta visibilidade — valida foundation antes do rollout massivo.
- **Roadmap de Ondas 2+3 nao precisa refactor**: novos blocos (F5, F7, S6, S7, S10, S11 em Onda 2; toggle/drag em Onda 3) entram na mesma malha visual.

### 4.2. Negativas

- **Refactor cirurgico do `Home.tsx`** com risco de regressao em `<WelcomeNameModal>` (primeiro login) — mitigado por RNF-07 (zero regressao) e RF-08 (mantem WelcomeNameModal).
- **12 componentes novos** = 12 locais para drift de tokens. Reviewer + lint guards (zero `bg-gray-`, `text-emerald-`, `bg-slate-`) sao mandatorios.
- **D10 backup pode ser exercido em alpha**: se founder pedir troca de streak por "ultimo upload", e 1 string + 1 campo, mas exige PR + deploy.
- **Banner priority D9** (flight > cooldown) pode confundir power user que aprendeu "amber sempre em cima". Mitigado por copy clara no banner flight ("Day 2 do XYZ comeca em 1h").

### 4.3. Neutras

- **F9 Coach IA via FAB global** existente (`<MiniChat>` em `App.tsx`) — Home **nao** cria embed redundante (D2). Verificacao via teste smoke.
- **Coach insight diario, heuristicas, calendario heatmap** ficam para Onda 2 e ja excluidos da spec atual (Escopo OUT §6).
- **F6 toggle 7d/30d/90d/YTD** quebra a regra "1 query por Home" — aceito como excecao bem-comportada (query secundaria so quando toggle != 30d).

### 4.4. Migracao reversivel

A Home antiga e substituicao **in-place** (sem feature flag de "Home antiga vs nova" — ADR-099 §6 da spec). Para reverter, `git revert` do commit. Sem schema delta, sem migration, sem deploy de banco. Custo de reversao: 1 PR.

---

## 5. Confianca

**Alta.** Decisao alinhada com diagnostico (5-second rule), founder (D-FOUNDER-1/2/3/4) e arquitetura existente (ADR-078 tokens, ADR-016 bundle pattern). Empty/power state convivendo via `userState` ja foi validado em Sprint Studies-Reform e Bloco-A-Polish (ADR-067-studies, ADR-096) — padrao replicavel. D10 streak resolvido com guardrails + saida de emergencia documentada.

---

## 6. Notas de Implementacao

- F1 LifetimeStats: copy PT-BR seco. Sequencia (dias) em label, numero formatado com separador de milhar (`1.234`). Cor `tokens.color.text.primary` constante.
- Cada bloco implementa `<Skeleton>` interno (RNF-02 perceived perf). Fallback global `<HomeSkeleton>` apenas se query inteira falha.
- Reviewer checklist obrigatorio: zero hardcoded `bg-gray-9`, `text-emerald-`, `bg-slate-8` no diff de `client/src/components/home/**` e `client/src/components/branding/HeaderLogo.tsx`.
- `<MiniChat>` em `App.tsx` linha 156 NAO e tocado nesta sprint (D2). Spec verifica em smoke test que continua acessivel via FAB em rota `/`.
