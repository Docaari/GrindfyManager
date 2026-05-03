# Home Reform — Pesquisa + Plano de Produto

> **Versao:** 1.1 (research, NAO spec) — atualizada com decisoes do founder
> **Data:** 2026-05-03
> **Autor:** Strategist (modo Gerador de Ideias + Auditoria UX + Benchmark)
> **Audiencia:** founder + pm-spec (proximo no pipeline)
> **Sucessor:** quando aprovado, vira input para `/pm-spec home-reform-1`
> **Idioma:** PT-BR (codigo em ingles, copy/UI em PT-BR)

---

## CHANGELOG

- **v1.1 (2026-05-03)** — Decisoes do founder aplicadas:
  - Customizacao (toggle/drag-drop) movida 100% pra Onda 3 (layout fixo nas Ondas 1-2).
  - **Streak/gamificacao CORTADA** do roadmap (S8 removido, heatmap S13 removido).
  - **Logo nova nao bloqueia** Onda 1 — `<HeaderLogo>` placeholder swappable.
  - **News feed Grok preparado em Onda 1** (slots de layout + ADR + contrato + feature flag `NEWS_FEED_ENABLED=false`), integracao real adiada pra Onda 3.
  - F4 (fofocas/cravadas) **vetada definitivamente** — confirmado pelo founder.
- **v1.0 (2026-05-03)** — Documento original.

---

## 0. TL;DR

Home atual eh uma **launcher page de onboarding** que parou no tempo: 4 cards de modulo + 4 passos de onboarding + 2 cards de contato. Nao reflete os 17 modulos REST que o produto tem hoje. Para um pro player abrindo o app as 14h pra grindar as 18h, isso eh **ruido cognitivo gratis** — ele ja sabe importar, ja tem 1k torneios, e o que ele precisa eh: **(a) "como fui ontem?" em 5 segundos**, **(b) "o que jogo hoje?" em 1 clique**, **(c) "tem alguma coisa que precisa da minha atencao agora?" (banca, mao starred, alerta de variance)**.

Recomendo reformar a Home como **Operations Cockpit Pessoal** (nao "marketing landing logada"). Estrutura proposta: **Status Strip** (4 KPIs glanceable, sem streak) + **Today** (sessao de hoje + warm-up + grade) + **Action Items** (mao starred, banca, alertas) + **Performance recap** + **Coach insight diario** + (Onda 3) **Customizacao + Noticias** (slot reservado em Onda 1, integracao real Onda 3).

**Roadmap em 3 ondas (decidido com founder em 2026-05-03):**
- **Onda 1 (MVP, 2-3 semanas)** — Layout fixo Operations Cockpit + slots News reservados (flag off) + sidebar nova + `<HeaderLogo>` swappable.
- **Onda 2 (Engagement, 2 semanas)** — Insights + heuristicas + variance + Coach diario + Continue assistindo (sem gamificacao).
- **Onda 3 (Polimento, 1-2 semanas)** — Customizacao (toggle/drag) + integracao real xAI Grok (news softwares).

**Decisoes do founder:**
- Sem streaks/badges/heatmap-gamificacao em qualquer onda.
- News feed: estrutura+slot+ADR+flag em Onda 1; integracao real Onda 3.
- F4 (fofocas) **vetada permanentemente**.
- Logo nova nao bloqueia — placeholder swappable.

---

## 1. Pesquisa — "Como deveria ser uma Home page de SaaS pro?"

### 1.1. Heuristicas universais (validadas em 2026)

| Heuristica | O que diz | Aplicacao em Grindfy |
|---|---|---|
| **5-Second Rule** | Usuario tem que extrair a mensagem principal em 5s. Se nao consegue, hierarquia falhou. | Status Strip topo: 5 KPIs glanceable (Banca / ROI 30d / Streak / Sessao hoje / Pendencias). |
| **Show what matters NOW (anti "data vomit")** | Dashboard nao eh data warehouse. Mostrar tudo == mostrar nada. | Cortar a "vitrine de modulos" da Home atual. Modulos vivem no menu, nao na Home. |
| **40% information density teto pra overview** | Estudos mostram que overview com <40% densidade resulta em **63% pattern recognition mais rapido**. | Home **NAO eh dashboard analitico** (esse mora em /dashboard). Home eh overview. Espaco em branco eh feature. |
| **Progressive disclosure** | Power users acham UIs simplificadas patronizantes. Solucao: revelar densidade conforme uso. | Empty state (0 torneios) eh diferente de power user (10k torneios). Mesma URL, layouts adaptados. |
| **Christmas Tree Effect** | Anti-pattern: 20 KPIs de cores diferentes sem hierarquia → sensory overload. | Limitar Status Strip a **5 metricas + 1 cor de destaque** por status (verde/amber/vermelho). |
| **Hick's Law** | Tempo de decisao cresce com o numero de opcoes. | Home tem **1 CTA primario contextual**: "Iniciar grind de hoje" / "Importar Day 1" / "Continuar sessao ativa". Nao 3-4 cards iguais. |
| **Modular UI / drag-drop** | Tendencia 2026, mas overhead grande. Usuarios power **adoram** customizar; novicos ficam paralisados. | Onda 3, opcional. **Toggle on/off** por bloco eh mais barato que drag-drop e cobre 80% do valor. |

### 1.2. Referencias — DOs (o que copiar)

| Produto | O que faz bem | Como aplicar em Grindfy |
|---|---|---|
| **Stripe Dashboard** | Hero section: 4 KPI cards (Revenue / Charges / Payouts / Disputes) com **numero grande + sparkline + delta**. Labels minimos. | Status Strip identico: Banca / ROI / Hoje (PnL ou planejado) / Streak / Pendencias. Cada um com sparkline 7d ou seta delta. |
| **Linear** | Sidebar 240-280px com grupos colapsaveis (Inbox / My Issues / Active / Backlog). **Inbox** sempre primeiro. | Sidebar nova com grupos: **Hoje** / Performance / Grind / Estudos / Banca / Admin. Item "Hoje" = home. |
| **Vercel Dashboard** | Cards monoespacados, grid com `auto-fill`, fundo grid sutil, paleta minima. Acentos so onde matter. | Manter design tokens dark + accent-poker, mas **reduzir saturacao de verde** (Home atual derrama emerald-400 em tudo, perde hierarquia). |
| **Datadog** | Sidebar com **frequently used no topo E embaixo** (logout, settings ficam embaixo). Reorder learned. | Mover Settings/Logout pro footer da sidebar. "Hoje" no topo. |
| **GitHub** | Empty state + power state diferentes na mesma URL. Repos novos veem "create your first repo"; veteranos veem activity feed. | Empty state Grindfy: "Importe seu primeiro CSV". Power state: skip onboarding, mostrar Action Items. |
| **Hand2Note 4** | "Statistics tab" com dynamic stats e Range Research. Reorganiza por contexto (preflop vs postflop). | Insights bloc mostra **stats relevantes ao seu jogo atual** (ex: "Seu PFR caiu 3pp em UTG ultimos 7d"). NAO mostrar todos os 217 stats. |
| **PokerCraft (GG)** | Session review summary que **vira workflow** (tagged hands → review → publish notes). | Bloco "Maos pendentes" = workflow: starred → revisar → tag → done. Fundo da Home, nao decoracao. |
| **Duolingo** | Streak + daily goal + "freeze" como retention loop. Streak >= 7 dias = self-reinforcing identity. | Streak de **dias com sessao registrada** ou **dias com warm-up feito**. NAO inventar 5 streaks (Christmas tree). |

### 1.3. Referencias — DON'Ts (anti-patterns observados)

| Anti-pattern | Onde aparece | Por que evitar |
|---|---|---|
| **Feature dumping** | "Aqui estao 10 modulos, escolha um!" → Home atual do Grindfy + maioria dos templates SaaS de marketplace. | Home virou catalogo. Player ja sabe que existem. Modulos vivem no menu lateral. |
| **Vanity metrics no topo** | "47 torneios upados" — nao informa decisao. | Substituir por metricas **acionaveis**: ROI 30d, Banca em BIs, etc. |
| **News feed sem curadoria** | Bloomberg-style ticker que ninguem clica. | Pesquisa em "warm-up routines": **jogadores pros desativam notificacoes e fecham social** antes de jogar. News feed na Home pode literalmente sabotar performance. Ver secao 7 (perguntas criticas). |
| **Onboarding permanente** | "Como Comecar" que nunca some pra power user. | Onboarding visivel **apenas** se `quickStats.totalTournaments < 50` E `totalSessions < 5`. |
| **Christmas Tree de cores** | 8 cards cada um numa cor diferente. | Maximo 1 cor de destaque por status. Resto neutro. |
| **Duplicacao com /dashboard** | Home atual tem 3 KPIs (Torneios/Sessoes/Dias). /dashboard tem 13 dimensoes. Sobreposicao confusa. | Home = **overview operacional** (acionavel). /dashboard = **analise profunda** (exploratory). Linhas separadas. |
| **CTA "Em desenvolvimento" como bloco** | Calendario / Relatorios Avancados como cards opacos. | Anti-pattern. Roadmap publico vai num /changelog opcional, nao toma metade da Home. |
| **Drag-drop antes de saber o que importa** | Customizacao prematura. | Onda 3, opcional. Implementar so depois de confirmar via analytics quais blocos sao usados. |

### 1.4. Perfil mental — "Player pro abrindo Grindfy as 14h pra jogar as 18h"

```
14:00 — Login
        Q1: "Como fui ontem?" (recap rapido, 5s)
        Q2: "Banca ta saudavel?" (BIs disponiveis, alerta de stop)
        Q3: "O que tem na grade hoje?" (perfil A/B/C, qtd torneios, primeiro horario)

14:05 — Decisoes pre-grind
        Q4: "Tem mao pendente pra revisar?" (starred hands, max 5 mostrar)
        Q5: "Coach tem dica especifica de hoje?" (insight diario gerado pelo Stats Analyzer)
        Q6: "Tem warm-up programado?" (1 clique pra iniciar)

17:30 — Pre-game
        Q7: "Confirmo lista do dia? Algum late-reg pra atencao?"
        Q8: "Bankroll estampada na cabeca: BI atual, stop loss, stop time."

18:00 — Sai da Home, entra em /grind-live
```

**Implicacoes:**
- Home **nao pode ser destino de longa permanencia**. Eh trampolim.
- Tempo medio na Home esperado: **30-90 segundos** (pre-grind) ou **2-3 min** (manha/recap).
- Densidade alvo: <40%. Cada bloco precisa **justificar sua existencia em <2s**.
- Layout deve **revelar status, nao requerer interacao**. Hover/click eh fallback, nao primary.

---

## 2. Auditoria da Home Atual

### 2.1. Inventario do que tem hoje

Arquivo: `B:\grindfy\client\src\pages\Home.tsx` (~510 linhas)

| Secao | Conteudo | Avaliacao |
|---|---|---|
| **Welcome Section** | "Bom dia, {name}" + subtitle generico + 3 metricas (Torneios/Sessoes/Dias) | Saudacao ok, **metricas vanity** (qtd != saude). |
| **Ferramentas Principais** | 4 cards iguais (Dashboard/Import/Grade/Grind) | Catalogo de modulos. **Redundante com sidebar**. |
| **Como Comecar** | 4 passos onboarding com `completed` baseado em totals | Nao some pra power user. **Anti-pattern** "permanent onboarding". |
| **Em Desenvolvimento** | 2 cards opacos (Calendario, Relatorios Avancados) | Polui Home. Mover pra /changelog. |
| **Quick Actions Footer** | 3 botoes (Importar/Dashboard/Grind) — duplica 1ª secao | **100% redundante**. Remover. |
| **Contato & Comunidade** | Discord + Email | Ok, mas footer da sidebar ou /settings serve melhor. |
| **WelcomeNameModal** | Modal pra setar `displayName` no primeiro login | Manter. Util. |

### 2.2. O que FALTA (features dos modulos novos nao-refletidas)

Modulos shipped 2026-04+ que NAO aparecem na Home:

| Modulo | Sprints | Esta na Home? | Impacto |
|---|---|---|---|
| **Bankroll Multi-Wallet** | Bankroll-2 / 2.1 / 3 | NAO | Critico — banca eh **a metrica #1 de pro player**. |
| **Tournament Selector (scoring S/A/B/C/D)** | Selector-1/2 | NAO | Alto — sugestao de torneios deveria estar visivel. |
| **Stats Analyzer (217 stats HUD)** | Stats-V2/V3/V3.5 | NAO | Alto — preview de leaks recentes seria killer feature. |
| **Coach AI** | Coach-1 + UX-1A/B/C | Quase (link em sidebar) | Medio — quick chat na Home reduz friccao. |
| **Biblioteca/LMS (Mux + artigos)** | Biblioteca-1/2 | NAO | Medio — "continue assistindo" empurra retencao. |
| **Estudos / Spots starred** | Studies-Reform | NAO | Alto — maos pendentes sao trabalho que **so ele faz**. |
| **Flight (multi-flight + Day 2)** | Flight-1 | NAO | Alto — "seu Day 2 hoje as 15:30!" eh action item critico. |
| **Heuristicas / PrimeDope variance** | F4 | NAO | Medio — alerta de variance ("voce esta -3 stddev em 30d"). |
| **Cooldown / stops automaticos** | Bankroll-3 | NAO | Medio — banner "voce atingiu stop loss ontem, cooldown ate XX". |

### 2.3. O que esta OBSOLETO (fora do padrao `Docs/conventions/ui-patterns.md`)

| Item | Problema | Como deveria ser |
|---|---|---|
| `bg-gray-900` direto | Hardcoded, nao usa token. | `bg-poker-bg` ou `tokens.color.neutral.bg`. |
| `text-emerald-400` espalhado | Saturacao verde generica. Nao distingue success vs action. | `tokens.color.success.text` para PnL+, `tokens.color.action.text` para CTAs. |
| `bg-slate-800/70` cards | Nao casa com `Card` shadcn padrao. | `<Card>` da `@/components/ui/card` (ja tem variants). |
| `max-w-7xl mx-auto` | Container fixo. | Usar `<PageContainer>` se existir, ou criar. |
| `space-y-12` entre secoes | 48px (token `2xl`). Excessivo pra overview. | `space-y-6` (token `lg`, 24px). |
| Loading com `Skeleton bg-gray-700` hardcoded | Nao usa `<SkeletonCard>` padrao. | Migrar pra skeleton composto da foundation. |
| Cards iguais com `h-48` fixo | Quebra mobile, nao responsivo a conteudo. | Altura natural, breakpoints com `grid-cols-{1,2,3,4}`. |
| Saudacao centralizada `text-4xl` | Hero pesado pra power user. | Esquerda, `text-xl` (h1 token), peso `semibold`. |

---

## 3. Inventario de Features Candidatas (fichas)

Cada bloco recebe ficha com fonte de dados, custo dev (S=≤1 dia / M=2-5 dias / L=>5 dias), ICE (1-10 cada eixo, score = (I+C+E)/3), risco e dependencias.

### 3.1. Blocos propostos pelo founder

| # | Bloco | Fonte de dados | Custo | I | C | E | ICE | Risco | Depende |
|---|---|---|---|---|---|---|---|---|---|
| F1 | **Historico Geral** (visao consolidada) | `GET /api/dashboard/stats` (existe) + composicao | S | 8 | 9 | 9 | **8.7** | Baixo — recombinar dados existentes | — |
| F2 | **Ultimas sessoes** (recap rapido, top 5) | `GET /api/grind-sessions/history?limit=5` (existe) | S | 7 | 9 | 9 | **8.3** | Baixo | — |
| F3 | **Noticias Poker — Softwares & Plataformas** (Grok/X) | xAI Grok API + cache 1h | L | 4 | 4 | 3 | **3.7** | **Alto** — custo API, qualidade, distracao | ADR + chave + UI curadoria |
| F4 | **Noticias Poker — fofocas/cravadas/resultados** (Grok/X) | xAI Grok API + cache | L | 3 | 3 | 3 | **3.0** | **Muito alto** — anti-warmup (ver 1.4) | F3 + curadoria editorial |
| F5 | **Heuristicas / Insights de comportamento** | Stats Analyzer (`/api/stats/*` ja existe) + heuristicas server-side | M | 9 | 7 | 6 | **7.3** | Medio — false positives podem tilltar | F1 + thresholds |
| F6 | **Performance** (mini-dashboard) | `GET /api/dashboard/performance` (existe) | S | 8 | 9 | 8 | **8.3** | Baixo — ja existe na pagina /dashboard | — |
| F7 | **Stats Analyzer preview** | `GET /api/stats/summary` (verificar) | M | 7 | 6 | 6 | **6.3** | Medio — Stats requer OCR upload pra ter dados | upload prevkstats |
| F8 | **Maos pendentes pra revisar** (starred hands) | `GET /api/starred-hands/pending` (existe + ja usa no Sidebar) | S | 9 | 9 | 9 | **9.0** | Baixo | — |
| F9 | **Coach IA rapido** (chat embed) | Componente `MiniChat` (ja existe globalmente) | XS | 6 | 8 | 9 | **7.7** | Baixo — `MiniChat` ja monta global | — |
| F10 | **Menu lateral novo** | Reforma `Sidebar.tsx` | M | 8 | 8 | 6 | **7.3** | Medio — quebra muscle memory de power users | hold UI-FND-2? |
| F11 | **Nova logo + design** | Asset + tokens | S-M | 6 | 7 | 7 | **6.7** | Medio — branding decision do founder | brand guideline |

### 3.2. Blocos que o Strategist adiciona (vindos da pesquisa + dados)

| # | Bloco | Fonte de dados | Custo | I | C | E | ICE | Risco | Depende |
|---|---|---|---|---|---|---|---|---|---|
| S1 | **Status Strip** (4 KPIs glanceable: Banca BIs / ROI 30d / Hoje PnL ou planejado / Pendencias) | Composicao `dashboard/quick-stats` + `bankroll/summary` + `starred-hands/pending` + `grade-planner/today` | M | 10 | 9 | 7 | **8.7** | Baixo — agrega endpoints ja existentes | F1, F8 |
| S2 | **Today** (sessao planejada de hoje + warm-up CTA + perfil A/B/C) | `GET /api/planned-tournaments?date=today` + `GET /api/profile-states/:dayOfWeek` (existem) | S | 9 | 9 | 8 | **8.7** | Baixo | — |
| S3 | **Banca alert / Stops** (cooldown banner se stop atingido) | `GET /api/cooldown/status` + `GET /api/bankroll/summary` (existem) | S | 9 | 8 | 8 | **8.3** | Baixo | bankroll-3 ja shipou |
| S4 | **Proximo torneio na grade** (countdown ate primeiro buy-in do dia) | `GET /api/planned-tournaments?date=today&order=startTime` | S | 8 | 8 | 9 | **8.3** | Baixo | S2 |
| S5 | **Day 2 / Flight ativo** (alerta "seu Day 2 hoje as 15:30") | `GET /api/tournament-series?status=active` (existe) | S | 9 | 9 | 9 | **9.0** | Baixo — feature critica e nao explorada | flight-1 ja shipou |
| S6 | **Variance check** (PrimeDope: "voce esta -2.3 stddev em 30d, normal estatisticamente") | F4 sprint shipou. `GET /api/primedope/variance` ou similar. | M | 8 | 7 | 6 | **7.0** | Medio — exige educacao do usuario sobre o que significa | F4 ship |
| S7 | **Coach insight diario** (1 frase gerada server-side, cache 24h) | Coach AI tool call diario, scheduled job + cache | M | 8 | 7 | 6 | **7.0** | Medio — qualidade do insight, custo API | Coach + cron |
| ~~S8~~ | ~~**Streak + Daily goal**~~ — **CORTADO pelo founder (2026-05-03)**. Nao implementar em nenhuma onda. | — | — | — | — | — | — | — | — |
| S9 | **Pending CSV uploads** (banner "voce tem 3 sessoes nao importadas detectadas") | Heuristica server: ultima session_tournament vs ultima upload | M | 7 | 6 | 5 | **6.0** | Medio — falsos positivos | upload-history existente |
| S10 | **Continue assistindo** (Biblioteca: ultima licao iniciada nao concluida) | `GET /api/biblioteca/progress?status=in_progress&limit=1` | S | 6 | 7 | 8 | **7.0** | Baixo — empurra retencao da Biblioteca | biblioteca-1 ja shipou |
| S11 | **Tournament Selector — top 3 hoje** (sugestoes S/A/B baseadas em hoje) | `GET /api/tournament-selector/top?date=today&limit=3` (verificar existencia) | M | 7 | 6 | 5 | **6.0** | Medio — feature ainda em fine-tuning | selector-2 |
| S12 | **Bug report quick** (botao discreto rodape, ja existe modal) | Componente existente | XS | 4 | 9 | 10 | **7.7** | Baixo | — |
| ~~S13~~ | ~~**Calendario heatmap**~~ — **CORTADO** (associado a gamificacao Duolingo-style, founder vetou). | — | — | — | — | — | — | — | — |
| S14 | **Goal tracker** (ROI mensal alvo definido pelo user vs realizado) | Novo: precisa schema (user_goals) + UI | L | 7 | 5 | 4 | **5.3** | Alto — schema novo, pode virar over-promise | nova migration |
| **S15** | **News slot reservado** (placeholder oculto via flag `NEWS_FEED_ENABLED=false`, layout reserva area, contrato API definido, ADR escrito) | Tipo `NewsItem` em `shared/types/news.ts` + componente `<NewsSlot>` que retorna `null` quando flag off | S | 5 | 9 | 9 | **7.7** | Baixo — zero impacto user em Onda 1, prepara Onda 3 | feature flag infra |
| **S16** | **`<HeaderLogo>` swappable** (componente isolado que aceita asset prop, default = logo atual) | Asset existente `@assets/grindfy-logo-mark.png`, Onda 3 troca prop | XS | 4 | 10 | 10 | **8.0** | Zero | — |
| **S17** | **Customizacao Onda 3** (toggle on/off por bloco + opcionalmente drag-drop) | Schema novo `user_settings.homeLayout` (jsonb) + UI settings | L | 7 | 6 | 4 | **5.7** | Medio — over-engineering risk se nao validar via analytics primeiro | analytics Onda 1+2 |
| **S18** | **Integracao real xAI Grok (Onda 3)** (proxy cacheado + curadoria) | xAI Grok 4.1 Fast API + cache Redis-style 1-3h | L | 4 | 5 | 3 | **4.0** | Alto — custo, qualidade, latencia | S15 + ADR + chave |

---

## 4. Priorizacao + Roadmap em Ondas

### 4.1. Ranking ICE consolidado pos-decisao founder (alto → baixo)

| Rank | Bloco | ICE | Onda |
|---|---|---|---|
| 1 | S5 — Day 2 / Flight ativo | 9.0 | **1** |
| 2 | F8 — Maos pendentes | 9.0 | **1** |
| 3 | F1 — Historico Geral | 8.7 | **1** |
| 4 | S1 — Status Strip (4 KPIs, sem streak) | 8.7 | **1** |
| 5 | S2 — Today (sessao do dia + warmup CTA) | 8.7 | **1** |
| 6 | F2 — Ultimas sessoes | 8.3 | **1** |
| 7 | F6 — Performance mini | 8.3 | **1** |
| 8 | S3 — Banca alert / Stops | 8.3 | **1** |
| 9 | S4 — Proximo torneio countdown | 8.3 | **1** |
| 10 | S16 — `<HeaderLogo>` swappable | 8.0 | **1** |
| 11 | F9 — Coach IA rapido | 7.7 | **1** (gratis, ja existe global) |
| 12 | S12 — Bug report quick | 7.7 | **1** |
| 13 | S15 — News slot reservado (flag off) | 7.7 | **1** (prepara Onda 3) |
| 14 | F5 — Heuristicas | 7.3 | **2** |
| 15 | F10 — Menu lateral novo | 7.3 | **1** |
| 16 | S6 — Variance check | 7.0 | **2** |
| 17 | S7 — Coach insight diario | 7.0 | **2** |
| 18 | S10 — Continue assistindo (Biblioteca) | 7.0 | **2** |
| 19 | F7 — Stats Analyzer preview | 6.3 | **2** |
| 20 | S9 — Pending CSV uploads | 6.0 | **3** |
| 21 | S11 — Tournament Selector top 3 | 6.0 | **2** |
| 22 | S17 — Customizacao (toggle/drag) | 5.7 | **3** |
| 23 | S14 — Goal tracker | 5.3 | **3** |
| 24 | S18 — Integracao real Grok | 4.0 | **3** |
| ~~—~~ | ~~S8 — Streak + Daily goal~~ | — | **CORTADO** |
| ~~—~~ | ~~S13 — Calendario heatmap~~ | — | **CORTADO** |
| ~~—~~ | ~~F11 — Nova logo bloqueante~~ | — | **NAO BLOQUEIA** (S16 cobre) |
| ~~—~~ | ~~F3/F4 — Noticias separadas~~ | — | F4 **VETADO**; F3 absorvido em S15+S18 |

### 4.2. Onda 1 — MVP Home Reform (2-3 semanas, 1 sprint grande ou 2 medios)

**Objetivo:** **substituir** Home atual sem perda funcional, com layout **Operations Cockpit** glanceable. Power user power day 1. **Layout fixo, sem customizacao.**

**Inclui (13 blocos):**
- **S1** Status Strip — **4 KPIs** (Banca BIs / ROI 30d / Hoje / Pendencias) — sem streak
- **S2** Today — sessao do dia + warm-up CTA + perfil A/B/C
- **S3** Banca alert / Stops — banner condicional cooldown
- **S4** Proximo torneio countdown
- **S5** Day 2 / Flight ativo — banner condicional
- **F1** Historico Geral — versao compacta
- **F2** Ultimas sessoes — top 5 cards
- **F6** Performance mini — sparkline 7d/30d ROI (link pra /dashboard)
- **F8** Maos pendentes — top 5 starred-hands
- **F9** Coach IA rapido — `MiniChat` ja monta global, validar trigger contextual
- **F10** Menu lateral novo — reforma `Sidebar.tsx` (grupos HOJE/GRIND/ESTUDOS/FERRAMENTAS/ADMIN)
- **S12** Bug report quick — botao discreto rodape
- **S15** News slot reservado — `<NewsSlot>` placeholder, flag off, contrato pronto
- **S16** `<HeaderLogo>` swappable — placeholder swap-friendly (logo atual default)

**Decisoes aplicadas:**
- Customizacao **NAO** entra em Onda 1 (layout fixo).
- Streak/heatmap **CORTADO** — Status Strip vai com 4 KPIs (era 5).
- Logo nova **NAO BLOQUEIA** — `<HeaderLogo>` aceita asset prop, default = logo atual; troca em PR isolado quando designer entregar.
- News feed: layout **reserva area** + `<NewsSlot>` que retorna `null` quando `NEWS_FEED_ENABLED=false` + ADR escrito + contrato `NewsItem` definido. **Zero impacto user em Onda 1.**

Empty state e power user state diferentes (ver wireframe 5.4 e 5.5).

**Entregaveis:**
- 1 nova rota `/` (Home reformada).
- Endpoint composto `GET /api/home/overview` (orquestra 6-8 endpoints existentes em paralelo, retorna JSON unico, cache 30s server-side).
- Refactor `Sidebar.tsx` + grupos novos.
- Migracao tokens UI (UI-FND-1 → Home).
- Componente `<HeaderLogo>` (swap-friendly).
- Componente `<NewsSlot>` (placeholder + flag).
- Tipo `shared/types/news.ts` (contrato `NewsItem`).
- Feature flag `NEWS_FEED_ENABLED` em config server.
- ADR-XXX "Home como Operations Cockpit".
- ADR-YYY "News feed integration strategy (xAI Grok, deferred to Onda 3)".

### 4.3. Onda 2 — Engagement (2 semanas)

**Objetivo:** transformar Home de overview operacional em **loop de insight diario** (sem gamificacao). Layout ainda fixo.

**Inclui (6 blocos):**
- **F5** Heuristicas — server-side rules (ex: "PFR caindo em UTG")
- **F7** Stats Analyzer preview — top 3 stats com delta vs benchmark
- **S6** Variance check — PrimeDope ("voce esta -2.3 stddev em 30d, normal estatisticamente")
- **S7** Coach insight diario — cron job + cache 24h, 1 frase tom educativo
- **S10** Continue assistindo (Biblioteca) — ultima licao in-progress
- **S11** Tournament Selector top 3 hoje

**Decisoes aplicadas:**
- **Streak + Daily goal (S8) CORTADO.**
- **Calendario heatmap (S13) CORTADO** (associado a gamificacao Duolingo).
- Sem schema `user_streaks`. Sem schema `user_goals` (Goal tracker movido pra Onda 3).
- Layout permanece fixo — customizacao continua adiada pra Onda 3.

### 4.4. Onda 3 — Customizacao + News real (1-2 semanas)

**Objetivo:** customizacao do user + integracao real do news feed (apos validar via analytics se merece o investimento).

**Inclui (4 blocos):**
- **S17** Customizacao — toggle on/off por bloco (config em `user_settings.homeLayout` jsonb). Drag-drop opcional, decidir baseado em analytics de Onda 1+2.
- **S18** Integracao real xAI Grok — preencher `<NewsSlot>` com dados reais. Flag `NEWS_FEED_ENABLED=true`. Cache 1-3h, opt-in only por user.
- **S9** Pending CSV uploads — heuristica + banner
- **S14** Goal tracker — schema `user_goals` + UI

**Decisoes aplicadas:**
- F4 (fofocas/cravadas) **vetada permanentemente**. Nao abrir hook futuro — confirmado 2026-05-03.
- F3 (noticias softwares) absorvida em S15 (Onda 1, slot) + S18 (Onda 3, integracao).
- Customizacao so aqui pra evitar over-engineering antes de saber quais blocos sao usados.

**Pre-requisito de Onda 3:** instrumentar analytics em Onda 1 (`home_block_view`, `home_block_click` por bloco) pra decidir quais blocos toggle on/off realmente importam.

---

## 5. Layout Proposto (Wireframes ASCII)

### 5.1. Tokens base

- Largura container: `max-w-screen-2xl` (1536px)
- Sidebar: 240px expandida / 64px colapsada
- Padding pagina: `lg` (24px) desktop, `base` (16px) mobile
- Gaps internos: `base` (16px) entre cards do mesmo grupo, `lg` (24px) entre grupos
- Rounded: `xl` (12px) padrao da foundation

### 5.2. Desktop (>=1280px) — Power User State

```
┌──────────┬──────────────────────────────────────────────────────────────────────────────────────┐
│ SIDEBAR  │ HEADER: [Hoje, 14:23 · Ter 04/05]  [searchbar]    [🔔3] [⚙] [USER-0005 ▾]            │
│ 240px    ├──────────────────────────────────────────────────────────────────────────────────────┤
│          │ [BANNER conditional, full-width, dismissable]                                         │
│ [LOGO]   │ ⚠ Cooldown ate 18:00 — stop loss atingido ontem. [ver detalhes]                      │
│ Grindfy  │ OU                                                                                    │
│          │ 🏆 Day 2 do "Sunday Million" comeca em 1h 12min · Stack: 47 BB · [abrir Flight]      │
│ ─────    ├──────────────────────────────────────────────────────────────────────────────────────┤
│ HOJE ●   │ STATUS STRIP — 4 KPIs glanceable (h-24, grid-cols-4)                                 │
│ Dashboard│ ┌──────────┬──────────┬──────────┬──────────┐                                        │
│          │ │ Banca    │ ROI 30d  │ Hoje     │ Pendentes│                                        │
│ PERFORM  │ │ $8.2k    │ +18.4%   │ 23 trn   │ 5 maos   │                                        │
│ ── Stats │ │ 47 BIs   │ ▁▂▃▆█▅▄ │ 18:00    │ 2 alert  │                                        │
│ ── Hist  │ │ ↗ +5%    │ vs prev  │ Perfil A │ rever    │                                        │
│          │ └──────────┴──────────┴──────────┴──────────┘                                        │
│ GRIND    ├──────────────────────────────────────────────────────────────────────────────────────┤
│ ── Today │ ROW 1 — 2/3 + 1/3                                                                    │
│ ── Grade │ ┌─────────────────────────────────────────┬───────────────────────────────────────┐  │
│ ── Live  │ │ TODAY — sessao planejada              │ COACH INSIGHT DIARIO                  │  │
│ ── Warmup│ │ Perfil: A (high-volume)               │ "Seu PFR de UTG caiu de 14% pra 11%   │  │
│ ── Flight│ │ 23 torneios · primeiro 18:00          │  ultimas 7 sessoes — pode estar over- │  │
│          │ │ Stop loss: -$500 · Stop time: 04:00   │  folding. Revisar 3 maos starred."    │  │
│ ESTUDOS  │ │ [▶ Iniciar warm-up (12 min)]          │ — Grindfy Coach · 1h atras            │  │
│ ── Spots │ │ [→ Ver grade completa]                │ [💬 conversar com Coach]              │  │
│ ── Maos  │ └─────────────────────────────────────────┴───────────────────────────────────────┘  │
│ ── Bibli ├──────────────────────────────────────────────────────────────────────────────────────┤
│          │ ROW 2 — 1/2 + 1/2                                                                    │
│ BANCA    │ ┌─────────────────────────────────────────┬───────────────────────────────────────┐  │
│ ── $$$   │ │ ULTIMAS SESSOES                       │ MAOS PENDENTES (5)                    │  │
│ ── Trans │ │ 03/05 · -$120 · 18 trn · Stars        │ AQ on K72r 3bp · UTG vs BB           │  │
│ ── Stops │ │ 02/05 · +$340 · 22 trn · GG           │ TT preflop 3bet · CO vs BTN          │  │
│          │ │ 01/05 · +$80 · 15 trn · ACR           │ KK river jam · MP vs SB              │  │
│ FERRAS   │ │ 30/04 · -$50 · 20 trn · GG            │ A8s flop · BTN vs BB                 │  │
│ ── Calc  │ │ 29/04 · +$200 · 19 trn · Stars        │ 99 turn · HJ vs CO                   │  │
│ ── Selec │ │ [Ver historico completo →]            │ [Revisar todas →]                    │  │
│ ──────   │ └─────────────────────────────────────────┴───────────────────────────────────────┘  │
│ Settings ├──────────────────────────────────────────────────────────────────────────────────────┤
│ Logout   │ ROW 3 — full-width                                                                   │
│          │ ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│          │ │ PERFORMANCE — 30d                       [7d|30d|90d|YTD]                        │  │
│          │ │ ╭─────────────────────────────╮  ┌──────┬──────┬──────┐                          │  │
│          │ │ │     ╱╲    ╱──╲             │  │ ITM% │ Cash%│ ROI  │                          │  │
│          │ │ │   ╱   ╲  ╱    ╲___╱        │  │ 17.2 │ 22.8 │ +18.4│                          │  │
│          │ │ │ ╱      ╲╱                  │  └──────┴──────┴──────┘                          │  │
│          │ │ ╰─────────────────────────────╯  [Ver dashboard completo →]                     │  │
│          │ └─────────────────────────────────────────────────────────────────────────────────┘  │
│          ├──────────────────────────────────────────────────────────────────────────────────────┤
│          │ ROW 4 — NEWS SLOT (S15) — RESERVADO ONDA 1, OCULTO via flag                          │
│          │ ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│          │ │ <NewsSlot>                                                                      │  │
│          │ │   {NEWS_FEED_ENABLED ? <NewsList items={...} /> : null}                         │  │
│          │ │   // Onda 1: layout reserva area, retorna null em runtime                       │  │
│          │ │   // Onda 3: integracao xAI Grok, lista 3-5 itens curados                       │  │
│          │ │ </NewsSlot>                                                                     │  │
│          │ └─────────────────────────────────────────────────────────────────────────────────┘  │
│          ├──────────────────────────────────────────────────────────────────────────────────────┤
│          │ FOOTER — discreto. [Bug report] [Discord] [Suporte] [v2026.05.03]                    │
└──────────┴──────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.3. Tablet (768-1279px)

- Sidebar colapsa pra 64px (icones)
- Status Strip vira `grid-cols-2` em 2 rows (4 KPIs)
- Today + Coach Insight: stack vertical (full-width cada)
- Ultimas Sessoes + Maos Pendentes: stack vertical
- Performance: full-width

### 5.4. Mobile (<768px) — Stack vertical

```
┌────────────────────────────────────────┐
│ [☰ menu] Grindfy            [🔔] [👤] │
├────────────────────────────────────────┤
│ [BANNER condicional]                    │
├────────────────────────────────────────┤
│ STATUS STRIP — scroll horizontal snap   │
│ ◀ [Banca] [ROI] [Hoje] [Pendentes] ▶  │
├────────────────────────────────────────┤
│ TODAY                                  │
│ Perfil A · 23 trn · 18:00              │
│ [▶ Warm-up]  [→ Grade]                 │
├────────────────────────────────────────┤
│ COACH INSIGHT — collapsable            │
│ "Seu PFR de UTG caiu..." [▾]           │
├────────────────────────────────────────┤
│ MAOS PENDENTES (5)                     │
│ — AQ on K72r                           │
│ — TT preflop 3bet                      │
│ [Revisar todas →]                      │
├────────────────────────────────────────┤
│ ULTIMAS SESSOES                        │
│ 03/05 -$120 · 02/05 +$340 · ...        │
├────────────────────────────────────────┤
│ PERFORMANCE 30d (mini)                  │
│ [sparkline] +18.4%                     │
├────────────────────────────────────────┤
│ [💬 Coach IA — chat flutuante FAB]    │
└────────────────────────────────────────┘
```

**Blocos que somem em mobile:** Performance detalhado (vai pra /dashboard), Coach insight texto longo collapsa pra 1 linha + expand.

### 5.5. Empty State (usuario novo, < 50 torneios E < 5 sessoes)

```
┌──────────────────────────────────────────────────────────────┐
│  Bem-vindo, {firstName}!                                      │
│  Vamos colocar o Grindfy pra trabalhar pra voce.              │
│                                                                │
│  Step 1 de 4 (configuracao em ~10 min)                        │
│  ████░░░░░░░░░░░░░░░░░░░░░░░ 25%                              │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ ▶ 1. Importar primeiro CSV                           │    │
│  │    Aceita Stars, GG, ACR, Party, 888, +6 redes       │    │
│  │    [Comecar (~5 min) →]                              │    │
│  └──────────────────────────────────────────────────────┘    │
│  ○ 2. Configurar banca (multi-currency suportado)            │
│  ○ 3. Planejar grade da semana (perfis A/B/C)                │
│  ○ 4. Iniciar primeira sessao live                            │
│                                                                │
│  [Pular onboarding (mostrar dashboard vazio)]                 │
└──────────────────────────────────────────────────────────────┘
```

Visivel apenas se `quickStats.totalTournaments < 50 && totalSessions < 5`. Apos qualquer step, dismissable e nunca volta.

### 5.6. Power User State (default, >= 50 torneios)

Layout 5.2 inteiro. Sem onboarding. Sem CTAs marketing.

### 5.7. Sidebar nova — proposta

```
COLAPSADA (64px)              EXPANDIDA (240px)
┌──┐                          ┌────────────────────┐
│🏠│ ← /                       │ [G] Grindfy        │
├──┤                          ├────────────────────┤
│📊│                          │ HOJE               │
│📥│                          │ 🏠 Hoje (Home)     │ ← /
│📚│                          │ 📊 Dashboard       │ ← /dashboard
│🎮│                          │ 📥 Import          │ ← /upload
├──┤                          │ 📚 Torneios        │ ← /library
│📅│                          │                    │
│🧠│                          │ GRIND              │
│💬│                          │ 📅 Grade           │ ← /coach
│⚡│                          │ ⚡ Grind Live      │ ← /grind-live
├──┤                          │ 🧠 Warm-up         │ ← /mental
│📖│                          │ 💬 Coach IA        │ ← /coach-ai
│🎓│                          │ ✈️ Flight          │ ← /flight
│🔧│                          │                    │
│💰│                          │ ESTUDOS            │
├──┤                          │ 📖 Estudos         │ ← /estudos
│⚙│                          │ 🎓 Biblioteca      │ ← /biblioteca
│🚪│                          │                    │
└──┘                          │ FERRAMENTAS        │
                              │ 🔧 Calculadoras    │ ← /calculadoras
                              │ 💰 Banca           │ ← /bankroll
                              │                    │
                              │ ADMIN (cond)       │
                              │ 📈 Analytics       │
                              │ 👥 Usuarios        │
                              │ 🐛 Bugs            │
                              ├────────────────────┤
                              │ [Trial 7d ●]       │
                              │ ⚙ Settings        │
                              │ 🚪 Logout          │
                              └────────────────────┘
```

**Mudancas vs sidebar atual:**
- Item "Hoje" no topo (= rota `/`, era "Home").
- Grupos renomeados: VISAO GERAL → HOJE; mantidos GRIND / FERRAMENTAS; adicionar **ESTUDOS** como grupo proprio (separa Estudos+Biblioteca de Ferramentas+Banca).
- Ordem dentro de GRIND reflete fluxo diario: Grade → Grind Live → Warm-up → Coach IA → Flight (era misturado).
- Settings + Logout no footer (Datadog pattern).
- Trial badge ja esta no footer; ok.

---

## 6. Endpoints — Reuso vs novos

### 6.1. Reuso (zero codigo backend novo)

- `GET /api/dashboard/quick-stats` — totals
- `GET /api/dashboard/stats` — performance composto
- `GET /api/dashboard/performance` — sparkline 30d
- `GET /api/grind-sessions/history?limit=5` — ultimas sessoes
- `GET /api/starred-hands/pending` — maos pendentes (ja consumido pelo Sidebar)
- `GET /api/planned-tournaments?date=today` — grade do dia
- `GET /api/profile-states/:dayOfWeek` — perfil A/B/C
- `GET /api/bankroll/summary` — banca + BIs (verificar nome exato)
- `GET /api/cooldown/status` — banner stops
- `GET /api/tournament-series?status=active` — Day 2 / Flight ativo
- `GET /api/notifications` — header badge

### 6.2. Novos endpoints propostos (Onda 1)

| Endpoint | Proposito | Justificativa |
|---|---|---|
| `GET /api/home/overview` | Orquestra 6-8 chamadas em paralelo, retorna JSON unico, cache 30s server-side. | Reduz 8 round-trips → 1. Reduz waterfall no client. Permite cache central. |
| `GET /api/news?source=poker-software&limit=5` | **Stub Onda 1** — retorna `{ items: [], enabled: false }` quando flag off. Contrato pronto pra Onda 3. | Permite frontend desenvolver `<NewsSlot>` sem aguardar integracao real. Reviewer valida contrato. |

### 6.3. Novos endpoints (Onda 2)

| Endpoint | Proposito |
|---|---|
| `GET /api/home/insight` | Coach insight diario, cache 24h por user, gerado por cron. |
| ~~`GET /api/home/streak`~~ | ~~Streak + daily goal~~ — **CORTADO**. |
| `GET /api/home/heuristics` | Heuristicas comportamentais (PFR caindo, etc). |
| `GET /api/home/variance` | Wrapper PrimeDope variance pra context Home. |

### 6.4. Novos endpoints (Onda 3)

| Endpoint | Proposito |
|---|---|
| `GET /api/news?source=poker-software&limit=5` | **Implementacao real**: proxy cacheado para xAI Grok 4.1 Fast. Cache 1-3h. Contrato ja definido na Onda 1. |
| `PATCH /api/users/me/home-layout` | Salvar toggle/order de blocos da Home (jsonb). |
| `GET /api/users/me/home-layout` | Recuperar layout customizado. |

### 6.5. Contrato `NewsItem` (Onda 1, pre-definido)

Localizacao: `shared/types/news.ts`

```ts
export interface NewsItem {
  id: string;
  source: 'poker-software' | 'reserved-future';
  title: string;
  summary: string;       // <= 280 chars
  url: string;
  publishedAt: string;   // ISO 8601
  fetchedAt: string;     // ISO 8601 (quando o servidor pegou)
  tags?: string[];
}

export interface NewsResponse {
  items: NewsItem[];
  enabled: boolean;       // espelha NEWS_FEED_ENABLED
  cachedAt?: string;
  nextRefreshAt?: string;
}
```

Em Onda 1, `<NewsSlot>` consome esse contrato e retorna `null` quando `enabled === false`. Em Onda 3, mesmo contrato, dados reais.

### 6.6. Feature flag `NEWS_FEED_ENABLED`

- Localizacao server: env var + fallback `false`.
- Localizacao client: response do `/api/home/overview` carrega flag (single source of truth no servidor).
- Default em todos ambientes Onda 1+2: `false`.
- Onda 3: flag flipa pra `true` em produção apos QA + decisao founder.

---

## 7. Decisoes do Founder (resolvidas 2026-05-03)

### 7.1. Decisoes resolvidas (eram perguntas criticas)

1. **Personalizacao** ✅ **DECIDIDO: opção (a) — layout fixo Ondas 1+2, customização só Onda 3.**
   - Bloco S17 entra em Onda 3 com toggle on/off, drag-drop opcional baseado em analytics.
   - Pre-requisito Onda 3: instrumentar `home_block_view`/`home_block_click` em Onda 1.

2. **Noticias Grok/X** ✅ **DECIDIDO: preparar tudo em Onda 1, integracao real Onda 3.**
   - Onda 1: estrutura (`<NewsSlot>`), slot no layout, contrato `NewsItem`, ADR escrito, feature flag `NEWS_FEED_ENABLED=false`.
   - Onda 3: integracao real xAI Grok 4.1 Fast + cache + curadoria.
   - F4 (fofocas/cravadas/resultados torneios) **VETADA permanentemente**. Sem hook futuro.

3. **Streak/gamificacao** ✅ **DECIDIDO: CORTADO completamente.**
   - Sem streaks, badges, heatmap-Duolingo, daily goals.
   - S8 e S13 removidos de todas as ondas.
   - Sem schema `user_streaks`. Status Strip vai com 4 KPIs (era 5).

### 7.2. Decisao adicional (founder, 2026-05-03)

4. **Logo nova** ✅ **DECIDIDO: NAO BLOQUEIA Onda 1.**
   - Componente `<HeaderLogo>` aceita asset prop, default = logo atual (`@assets/grindfy-logo-mark.png`).
   - Quando designer entregar nova versao, swap eh PR isolado de 1 linha.
   - Sprint Home Reform NAO bloqueia por branding.

### 7.3. Perguntas remanescentes (Onda 2/3, nao bloqueiam Onda 1)

| # | Pergunta | Quando decide |
|---|---|---|
| 5 | Coach insight diario: 1 frase ou paragrafo? Tom (educativo / motivacional / cru)? | Inicio Onda 2 |
| 6 | Heuristicas: lista fixa de regras ou rule engine pluggavel? | Inicio Onda 2 |
| 7 | Variance check: educar usuario com tooltip ou modal? | Inicio Onda 2 |
| 8 | News (Onda 3): idioma PT-BR, EN ou ambos? Curadoria humana? Custo aceitavel ($X/user/mes)? | Inicio Onda 3 |
| 9 | Customizacao Onda 3: toggle on/off bastam ou drag-drop tambem? | Apos analytics Onda 1+2 |
| 10 | `MiniChat` global vs embed na Home (F9): ambos ou um so? | Inicio Onda 1 (decisao tecnica simples — recomendo manter so global; embed redundante) |
| 11 | Endpoint `/api/home/overview` cache: 30s server / 0s paralelo / per-block? | System-architect decide na ADR |

### 7.2. Perguntas IMPORTANTES (afetam escopo Onda 1)

4. **Branding — quem faz logo nova?** Designer externo? Founder? Strategist nao decide isso. Mas precisa estar pronto antes da Onda 1 ship.

5. **Mobile-first ou desktop-first?**
   - Recomendo **desktop-first** (pro players grindam em desktop), mas **mobile-friendly** (consultam recap em mobile).
   - Confirmar.

6. **Distracao news feed e warm-up sao incompativeis** — pesquisa em rotinas de pro players mostra que o passo #1 do warm-up eh **fechar redes sociais**. Embed news feed na Home pode literalmente sabotar performance. Precisa de:
   - Feature flag `showNewsFeed` (default false?)
   - Ou auto-hide se sessao live ativa?
   - Ou mover news pra `/news` separado, nao Home?

7. **`MiniChat` global vs embed na Home** — `MiniChat` ja monta global (App.tsx linha 156). Embed na Home eh redundante? Ou sao dois canais (FAB global + bloco contextual)?

8. **Endpoint composto `/api/home/overview` cache strategy:**
   - 30s server-side (Redis-style)?
   - 0s mas paralelizado (Promise.all)?
   - Per-block cache (Banca cache 60s, Hoje cache 5min)?

### 7.3. Perguntas POLIMENTO (Onda 2/3)

9. Coach insight diario: 1 frase ou paragrafo? Tom (educativo / motivacional / cru)?
10. Streak: dias com sessao registrada OU dias com warmup OU dias com qualquer atividade? (Define rigor.)
11. Heatmap calendario: 90d (GitHub) ou 365d (Apple Health)?
12. Goal tracker: ROI alvo eh user-defined ou sugerido pelo Coach?

---

## 8. Riscos & Ressalvas

### 8.1. Riscos tecnicos

| Risco | Severidade | Mitigacao |
|---|---|---|
| **Endpoint composto vira N+1** | Medio | Promise.all + validar timeout total <500ms. |
| **Cache invalidation Home complexa** | Medio | TTL curto (30s) + invalidacao por evento (ex: nova sessao → bust cache). |
| **`MiniChat` colide com novo Coach embed** | Baixo | Decidir 1 OR outro (questao 7.2#7). |
| **Refator do Sidebar quebra muscle memory** | Medio | Manter URLs, manter labels conhecidos. So renomear grupo "VISAO GERAL"→"HOJE" e item "Home"→"Hoje". |
| **Tokens UI: Home atual usa `gray-900` e `slate-800` hardcoded** | Baixo | Migracao pra `tokens.color.*` ja documentada em UI-FND-1. Aplicar. |
| **Custo xAI Grok escala mal** | Alto (Onda 3) | Cache agressivo + rate limit por user + opt-in only. |

### 8.2. Riscos UX

| Risco | Severidade | Mitigacao |
|---|---|---|
| **Sobrecarga cognitiva** (muito bloco) | **Alto** | Densidade <40%. Onda 1 limita a 8-9 blocos visiveis. |
| **News feed sabota warm-up** | Alto | Vetar F4 (fofocas). F3 (softwares) opt-in only. |
| **Streak frustra pro player** | Medio | Opt-in only. Ou streak silencioso (so anima quando ele bate). |
| **Heuristicas com falso positivo** | Medio | Threshold conservador. Tom "voce talvez X" nao "voce esta errando". |
| **Power user perde acesso rapido** | Alto | Manter sidebar familiar. Status Strip otimiza acesso. |

### 8.3. Riscos de produto

| Risco | Severidade | Mitigacao |
|---|---|---|
| **Home virar "junk drawer"** (catalogo de tudo que existe) | **Alto** | Regra dura: cada bloco precisa ter ICE >= 7.0 pra entrar. Ranking publico em Roadmap. |
| **Duplicacao com /dashboard** | Alto | Linha clara: Home = operacional/acionavel; Dashboard = exploratory/analitico. Performance bloc Home eh **link** pro /dashboard, nao replica. |
| **Customizacao prematura mata MVP** | Medio | Onda 3 only. Onda 1 layout fixo. |
| **Onda 1 atrasa por branding/logo** | Medio | Branding em paralelo, fallback: usar logo atual + tokens novos. Ship feature antes de ship visual. |
| **Vetar fofocas (F4) frustra founder** | Baixo | Documentado aqui com evidencia (warm-up routines vetam social). Founder decide. |

### 8.4. Ressalvas

- **NAO sou designer.** Wireframes ASCII sao aproximacao. Designer real revisa proporcoes, hierarquia visual, tipografia.
- **Ranking ICE eh estimativa.** Effort pode mudar quando system-architect der look-see.
- **Numeros do "perfil mental"** (30-90s na Home) sao hipoteses. Apos Onda 1, instrumentar com analytics e validar.
- **Custo xAI Grok** ($5-15/user/mes) eh estimativa **superior**. Real provavel <$2/user com cache decente.

---

## 9. Proximos Passos

1. ✅ **Founder respondeu 7.1** (decisoes aplicadas em v1.1 — 2026-05-03).
2. **`/pm-spec home-reform-1`** consome este doc → spec executavel.
3. **`/system-architect`** desenha:
   - Diagrama C4 da nova Home (sidebar + Home + endpoint composto).
   - Flowchart do endpoint composto `/api/home/overview` (Promise.all + cache).
   - Flowchart do `<NewsSlot>` flag-gated (Onda 1 → Onda 3 transition).
   - ADR-XXX "Home como Operations Cockpit" (decisao arquitetural Onda 1).
   - ADR-YYY "News feed integration strategy (xAI Grok deferred to Onda 3)" — contrato + flag + future cost.
   - ADR-ZZZ "Sidebar nova IA (grupos HOJE/GRIND/ESTUDOS/FERRAMENTAS/ADMIN)" — preserva URLs.
4. **`/test-writer` → `/implementer` → `/reviewer`** (pipeline padrao).
5. **Branding stream paralelo** — logo nova entra via PR isolado quando designer entregar (swap em `<HeaderLogo>` 1 linha).

---

## 10. Apendices

### 10.1. Comparativo direto — Home atual vs proposta

| Aspecto | Atual | Proposta |
|---|---|---|
| **Foco** | Catalogo de modulos + onboarding permanente | Operations Cockpit pessoal acionavel |
| **KPIs topo** | 3 vanity (Torneios/Sessoes/Dias) | 4 acionaveis (Banca/ROI/Hoje/Pendencias) — sem streak |
| **Cards modulo** | 4 (Dashboard/Import/Grade/Grind) | 0 (vivem no menu) |
| **Onboarding** | Permanente | Condicional (<50 torneios) |
| **CTAs** | 7 botoes em 3 secoes redundantes | 1 CTA primario contextual + 2-3 secundarios |
| **Densidade visual** | ~35% (espaco grande, mas info baixa) | ~38-40% (espaco eficiente, info acionavel) |
| **Modulos novos refletidos** | 0/9 | 7/9 Onda 1, 9/9 Onda 2 |
| **Gamificacao (streak/heatmap)** | Nao | **Nao** (cortado pelo founder) |
| **News feed (Grok)** | Nao | Slot reservado Onda 1 (oculto), real Onda 3 |
| **Customizacao** | Nao | Onda 3 (toggle on/off baseado em analytics Onda 1+2) |
| **Logo nova bloqueia ship** | — | Nao (`<HeaderLogo>` swappable, default = logo atual) |
| **Tokens UI consistentes** | Nao | Sim (UI-FND-1 foundation) |
| **Mobile** | Stack vertical adequado | Stack vertical otimizado, status strip horizontal scroll |
| **Empty state vs power state** | Identico | Diferente (progressive disclosure) |

### 10.2. Tabela DOs / DON'Ts (resumo executivo)

| DO | DON'T |
|---|---|
| 5 KPIs glanceable em <5s | Christmas tree de 8+ cards coloridos |
| Densidade <40% em overview | Data vomit de tudo que tem no DB |
| Empty state vs power user diferente | Onboarding permanente |
| 1 CTA primario contextual | 7 botoes redundantes |
| Modulos no menu lateral | Catalogo de modulos na Home |
| Banca + ROI + Pendencias visiveis | Vanity metrics (qtd uploads) |
| Sidebar com grupos colapsaveis | Lista flat de 15 itens |
| Cache 30s no endpoint composto | 8 chamadas em waterfall |
| Status condicional (banner se cooldown) | Banner sempre |
| Tokens UI (UI-FND-1) | `bg-gray-900` hardcoded |
| Performance bloc = link pro /dashboard | Replicar dashboard inteiro na Home |
| News feed flag-gated, default off, Onda 3 | News feed default-on (anti-warmup) |
| Coach insight 1 frase com cache 24h | Coach insight live (custo + latencia) |
| Bug report discreto no footer | Bug report no centro da Home |
| Slot News reservado Onda 1, contrato pronto | Adiar tudo de news pra Onda 3 e quebrar layout depois |
| `<HeaderLogo>` swappable (asset prop) | Bloquear sprint por logo nova |
| Sem gamificacao (streak/heatmap cortados) | Forçar Duolingo-style em pro player |
| Customizacao com base em analytics | Drag-drop antes de saber quais blocos sao usados |

---

### 10.3. Analytics de Onda 1 (pre-requisito Onda 3)

Eventos que **devem** ser instrumentados desde Onda 1 (via `AnalyticsTracker` ja existente):

| Evento | Payload | Por que |
|---|---|---|
| `home_block_view` | `{ blockId, position, timeOnScreen }` | Saber quais blocos usuario olha. |
| `home_block_click` | `{ blockId, action }` | Saber quais blocos engajam. |
| `home_status_strip_kpi_click` | `{ kpi: 'banca'\|'roi'\|'hoje'\|'pendentes' }` | Validar valor do Status Strip. |
| `home_news_slot_render` | `{ enabled, hadItems }` | Validar slot renderiza correto (mesmo oculto). |
| `home_today_warmup_start` | `{ source: 'home' }` | Funil warm-up (Home → /mental). |
| `home_action_item_dismiss` | `{ blockId }` | Detectar ruido. |

Estes dados decidem em Onda 3:
- Quais blocos merecem toggle on/off (S17).
- Se drag-drop justifica investimento (gain marginal sobre toggle).
- Se `<NewsSlot>` deve ser ativado (S18) — slot oculto mas medindo expectativa via tempo de permanencia em area.

---

**Fim do documento. Versao 1.1. Pronto pra `/pm-spec home-reform-1`.**
