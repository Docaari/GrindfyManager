# Spec — Home Reform Onda 1.5 (Insight do Dia + Continue Assistindo + News Visivel + Profile-aware)

> Sprint: **home-reform-1-5** (gaps QA founder Onda 1 + smart profile-aware)
> Data: 2026-05-03
> Inputs: `Docs/strategy/home-reform-1-ux-audit-and-onda-1-5.md`, `Docs/specs/home-reform-1.md` (Onda 1 entregue)
> Output: este documento — fonte de verdade operacional para `system-architect`, `test-writer`, `implementer`, `reviewer`
> Status: Proposta (auto mode founder)
> Idioma: PT-BR (codigo em ingles, conteudo/UI em PT-BR)

---

## 1. Sumario Executivo

**Objetivo.** Cobrir o gap **forward-looking** identificado pelo strategist: Home Onda 1 ficou **70% retrospectiva** (Lifetime + RecentSessions + Performance + PendingHands olham pro passado), **20% present-tense** (Today + countdown + flight) e **0% propositiva** (sem "o que estudar / qual conteudo / qual deltas mudou"). Onda 1.5 adiciona 6 blocos pequenos que transformam a Home em cockpit balanceado Q1 (como estou) + Q2 (o que faco hoje) + Q3 (o que estudar) **sem refazer nada do Onda 1**.

**Escopo:** apenas 6 RFs em cima da Home existente. Nao toca arquitetura de cache, nao reescreve `Home.tsx`, nao cria tabelas novas. Profile detection eh extensao do payload do `/api/home/overview`. Insight do Dia eh client-side rule-based puro (sem cron, sem Anthropic, sem cache server). Continue Assistindo reusa `library_progress` (tabela ja existente — ADR-074). News slot vira visivel com placeholder "em breve". Empty states + copy ganham awareness do perfil detectado.

**6 blocos da Onda 1.5:**

| ID  | Bloco                              | RF      | Esforco  |
| --- | ---------------------------------- | ------- | -------- |
| B1  | Insight do Dia (rule-based client) | RF-22   | 2d       |
| B2  | Continue Assistindo (Biblioteca)   | RF-23   | 1.5d     |
| B3  | NewsSlot visivel "em breve"        | RF-24   | 0.5d     |
| B4  | Profile-aware Home (smart)         | RF-25   | 2d       |
| B5  | Empty state copy upgrade           | RF-26   | 0.5d     |
| B6  | Coach FAB hint badge (opcional)    | RF-27   | 0.5d     |

**Esforco total estimado:** ~7 dias dev (1 sprint compacto).

**Nao toca:** schema do banco (zero migration), prompts do Coach, regras de scoring, Studies, Stats Analyzer, Tournament Selector, Bankroll. Onda 1.5 eh **incremental aditiva** sobre Onda 1.

---

## 2. Defaults Aceitos pelo Founder (Auto Mode 2026-05-03)

Founder respondeu Q1/Q2/Q3 do strategist (§10.1 do doc) com defaults `ACCEPT`. Ficam **inalteraveis**.

| ID | Decisao |
|---|---|
| **D-FOUNDER-5** | **NewsSlot placeholder Q1 = Opcao A (texto sobrio "Em breve").** Nao mock cards, nao `null` invisivel. Card discreto com badge "Em breve" + descricao curta do que vira. Texto exato em RF-24. |
| **D-FOUNDER-6** | **Insight do Dia Q2 = Opcao A (client-side rule-based puro).** Sem cron, sem tabela `daily_insights`, sem chamada Anthropic. Funcao pura sobre `data` ja retornado por `/api/home/overview`. Backend cron + Coach prompt fica para Onda 2 real. |
| **D-FOUNDER-7** | **Profile detection Q3 = Opcao A (implicito, smart auto-adapt).** Detection no backend, frontend so reage. Zero UI de configuracao em Onda 1.5. Toggle manual `/settings` fica para Onda 2 real. Default `'hybrid'` em duvida (mostra tudo). |

Defaults founder Onda 1 (D-FOUNDER-1 a D-FOUNDER-4) **continuam validos** — Onda 1.5 nao revoga gamificacao banida nem customizacao banida nem logo decidido.

---

## 3. Defaults Ativos D1.5-1 a D1.5-12

Decisoes resolvidas pelo PM-Spec a partir do strategist + arquitetura existente. Test-writer e implementer assumem sem requestionar.

| ID | Default |
|---|---|
| **D1.5-1** | **Insight do Dia eh funcao pura `computeDailyInsight(data: HomeOverviewResponse): DailyInsight`** em `client/src/lib/home/dailyInsight.ts`. Memoizada via `useMemo` no Home.tsx com dep `data.meta.generatedAt`. Sem efeito colateral, sem fetch, sem cache em arquivo. Retorna sempre 1 insight (fallback garante nunca-vazio). |
| **D1.5-2** | **Heuristicas Insight do Dia ordem fixa (primeiro match vence):** (1) cooldown ativo, (2) >=3 starred hands pendentes, (3) ROI 30d caiu >5pp ultimos 7d vs 7d anteriores, (4) >=7d sem grindar (re-engagement), (5) streak >=7d (celebration neutra), (6) fallback "pergunte ao Coach". Detalhe completo em RF-22.7. |
| **D1.5-3** | **Posicao do `<DailyInsight>`:** logo **abaixo do `<StatusStrip>`** e **acima do `<TodayCard>`/`<NextTournamentCountdown>`**. Em mobile, segundo elemento apos StatusStrip. Wireframe em §6. |
| **D1.5-4** | **Continue Assistindo usa endpoint novo `GET /api/library/continue?limit=3`.** Reusa tabela `library_progress` (ADR-074). Lessons com `completedAt = null` e `lastPositionSeconds > 0`, ordenadas por `updatedAt DESC`. Limit default 3, max 5. Entitlements check obrigatorio (libraryEntitlement existente — ADR-073). |
| **D1.5-5** | **Posicao do `<LibraryResume>`:** ao lado de `<PendingHandsList>` no grid 1/2 (Q3 cluster) em desktop; abaixo dele em tablet/mobile. Reaproveita o grid 2-col existente entre RecentSessions+Pending. Wireframe em §6. |
| **D1.5-6** | **`<NewsSlot>` Onda 1.5: render condicional revisado.** Em vez de `null`, retorna placeholder visivel quando `enabled === false`. Quando `enabled === true && items.length === 0`, mantem placeholder com badge "Em breve" (Onda 3 substitui). Quando `enabled === true && items.length > 0`, render Onda 3 (cards reais — implementacao futura, mantida no codigo). |
| **D1.5-7** | **Profile detection eh server-side em `/api/home/overview` extension.** Heuristica: `tournamentsCount` (CSV imports via `tournaments` table) + `sessionTournamentCount` (live grind via `session_tournaments` table). Thresholds em RF-25.4. Default `'hybrid'` em ambiguidade. |
| **D1.5-8** | **Profile detection thresholds:** `hybrid` se `tournaments >= 50 AND sessionTournaments >= 20`. `upload-only` se `tournaments >= 50 AND sessionTournaments < 20`. `session-only` se `tournaments < 50 AND sessionTournaments >= 20`. `new` se ambos = 0. Caso ambiguo (1<=tournaments<50 OR 1<=sessions<20 sem bater hybrid): perfil dominante por contagem absoluta, default `'hybrid'` em empate. |
| **D1.5-9** | **Profile **NAO esconde blocos** em Onda 1.5.** Apenas **adapta copy** de empty states + CTAs em `<RecentSessionsList>` empty / `<TodayCard>` empty / `<EmptyHomeOnboarding>` description. Zero conditional render baseado em `profile`. Onda 2 real pode introduzir hide-blocks. |
| **D1.5-10** | **Coach FAB hint badge (B6) usa `localStorage:home:coach:insightSeen:{YYYY-MM-DD}`.** Badge "1" no FAB quando `insight.type !== 'fallback'` AND user ainda nao abriu MiniChat hoje. Limpa ao primeiro open do dia. Sem badge se Insight tipo `'fallback'` (nao tem nada de acionavel novo). |
| **D1.5-11** | **Cache server-side `/api/home/overview` mantem TTL 30s in-memory** (Onda 1 ADR-102). Adicao de `profile` + `profileMeta` no payload **invalida cache existente** (chave de cache continua per-userId, mas estrutura mudou — cache antigo expira em 30s naturalmente). System-architect documenta. |
| **D1.5-12** | **Endpoint `/api/library/continue` eh modulo novo `server/routes/library-continue.ts`** OU extensao de `server/routes/library.ts` (system-architect decide). PM-Spec recomenda **modulo proprio** para isolamento e simetria com `home.ts`. Cache 60s in-memory per-userId (similar ao home.ts). Auth `requireAuth`. |

---

## 4. Usuarios e Personas

Mesma persona unica relevante: **player profissional MTT, logado, intencao de grindar nas proximas horas**.

### 4.1. User Stories Onda 1.5

#### US-08 (forward-looking — manha cedo)
> Como player que abre a Home as 11h, quero ver 1 insight acionavel "📌 1 mao critica precisa de revisao" logo abaixo do StatusStrip — sem precisar abrir Coach AI, sem rolar a tela, sem clicar.

#### US-09 (continue assistindo — entre torneios)
> Como player no break entre torneios, quero ver "Continue assistindo: GTO Wizard MTT — modulo 3" com barra de progresso em 60% — clicar e voltar exatamente onde parei.

#### US-10 (insight cooldown — pos stop loss)
> Como player que bati stop loss ontem, quero o insight "Cooldown ativo — use o tempo para revisar maos pendentes" no topo. Reforca decisao do sistema, evita re-tilt.

#### US-11 (re-engagement — apos pausa)
> Como player que nao grinda ha 8 dias, quero abrir Home e ver "8 dias sem grindar — aproveite para estudar antes de voltar". CTA leva ao Coach AI ou Biblioteca, nao culpa.

#### US-12 (profile upload-only — copy adaptada)
> Como player que so importa CSVs (nao usa grind-live), quero que o empty state de RecentSessionsList me diga "Voce importa CSVs mas ainda nao usou grind-live. Quer testar?" em vez do generico "Iniciar sessao live OU Importar CSV".

#### US-13 (profile session-only — copy adaptada)
> Como player que so reporta live (nunca importou CSV), quero que TodayCard me ofereca "Iniciar grind live →" como CTA primario, nao "Importar CSV".

#### US-14 (news placeholder visivel)
> Como player que viu o spec da Home prometendo News, quero ver explicitamente "📰 Noticias do mercado — Em breve" em vez do espaco invisivel atual. Reduz confusao "feature ausente".

#### US-15 (Coach FAB com hint)
> Como player que poderia se beneficiar do insight do dia mas nao reparou no bloco, quero o FAB do Coach mostrar badge "1" sutil — ao abrir MiniChat, ele referencia o insight ativo.

---

## 5. Escopo IN — 6 Blocos Detalhados

### 5.1. B1 — Insight do Dia (rule-based client-side)

| Aspecto | Detalhe |
|---|---|
| **Componente** | `client/src/components/home/DailyInsight.tsx` (novo) |
| **Engine** | `client/src/lib/home/dailyInsight.ts` (novo) — funcao pura `computeDailyInsight(data: HomeOverviewResponse): DailyInsight` |
| **Fonte de dados** | Apenas `data` ja retornado por `/api/home/overview` — **sem nova query, sem novo fetch** |
| **Tipo de retorno** | `DailyInsight = { type, title, body, cta, emoji?, severity? }` — schema completo em RF-22.5 |
| **Heuristicas** | 6 regras priorizadas (D1.5-2). Detalhe completo em RF-22.7 |
| **Comportamento** | Card horizontal full-width. Layout: `[emoji] [title bold] [body muted text-xs] [CTA →]` em 1 linha desktop, stack mobile. Card cor neutra (token `tokens.color.surface.card`), borda sutil. Severity `'celebration'` ou `'critical'` pode aplicar leve cor (amber para critical, sem verde gritado para celebration). |
| **Empty state** | Nunca vazio — fallback `(6) "Pergunte ao Coach"` sempre garante 1 card. Empty literal nao existe. |
| **Error state** | Se `data` malformado (ex: `data.statusStrip` null), fallback `(6)`. Nao throw. |
| **Interacao** | Click no CTA → navega rota destino. Click fora do CTA tambem navega (card-level click). |
| **Persistencia** | `localStorage:home:insightSeen:{YYYY-MM-DD}` registrado no primeiro mount do dia (timezone-aware via `userTimezone` se disponivel, fallback `America/Sao_Paulo`). Usado por B6 (Coach FAB hint). |
| **Tracking** | Evento `home_insight_view` (mount) + `home_insight_click` (CTA click). Payloads em RNF-09. |

### 5.2. B2 — Continue Assistindo (Biblioteca)

| Aspecto | Detalhe |
|---|---|
| **Componente** | `client/src/components/home/LibraryResume.tsx` (novo) |
| **Endpoint** | `GET /api/library/continue?limit=3` (novo) — RF-28 |
| **Fonte de dados** | Tabela `library_progress` (existe, ADR-074). Query: `WHERE userId=X AND completedAt IS NULL AND lastPositionSeconds > 0 ORDER BY updatedAt DESC LIMIT N` |
| **Comportamento** | Card vertical com header "Continue assistindo 📚" + ate 3 lessons. Cada lesson: thumbnail (`lesson.coverImageUrl` ou placeholder), titulo (truncate 2 linhas), barra progresso linear (`lastPositionSeconds / totalDurationSeconds`), tempo restante ("12 min restantes"), formato badge (Video / Podcast / Artigo). Click → `/biblioteca/lesson/:id?format=:format&t={lastPositionSeconds}` (deep link com seek). |
| **Empty state** | Se 0 lessons em progresso E user TEM acesso a Biblioteca: "Comece sua primeira lesson →" link `/biblioteca`. Se user NAO TEM acesso (entitlement check fail): bloco oculto silenciosamente (nao mostrar paywall na Home). |
| **Error state** | Se subquery falha, bloco renderiza skeleton com retry sutil OU oculto silenciosamente (system-architect decide; PM-Spec recomenda **oculto** para evitar ruido). |
| **Interacao** | Card → deep link Biblioteca com seek. Header "Ver biblioteca completa →" CTA → `/biblioteca`. |
| **Tracking** | Evento `home_library_resume_view` (mount com >=1 lesson) + `home_library_resume_click` (click em card). |

### 5.3. B3 — NewsSlot visivel "em breve"

| Aspecto | Detalhe |
|---|---|
| **Componente** | `client/src/components/home/NewsSlot.tsx` (modificar — ja existe Onda 1) |
| **Mudanca de comportamento** | **Antes (Onda 1):** retorna `null` quando `enabled === false`. **Depois (Onda 1.5):** retorna placeholder visivel quando `enabled === false`. Quando `enabled === true && items.length === 0`, tambem mostra placeholder. Quando `enabled === true && items.length > 0`, render normal (Onda 3). |
| **Markup placeholder (D-FOUNDER-5)** | Card `tokens.color.surface.card` com borda dashed `border-dashed border-border`. Header: `📰 Noticias do mercado` (`text-sm font-semibold`) + badge `Em breve` (`text-[10px] uppercase border border-border text-muted-foreground rounded-md px-1.5 py-0.5`). Body: `Acompanharemos lancamentos de redes, atualizacoes de software (PT4 / HM3 / SharkScope) e movimentacoes relevantes do circuito MTT.` (`text-xs text-muted-foreground mt-2`). Opacity `opacity-70` para sinalizar "deferido sem incomodar". Sem CTA, sem link. |
| **Posicao** | Mantida da Onda 1 — abaixo de `<PerformanceMini>`, acima de `<HomeFooter>`. |
| **Tracking** | Sem evento novo — placeholder eh estatico. (Se founder quiser depois "View placeholder", emitir `home_news_placeholder_view` 1x mount; PM-Spec defere para Onda 2.) |
| **Test impact Onda 1** | Atualizar 1-2 testes existentes que assumiam `null` quando `enabled === false`. Test-writer escreve teste novo do placeholder. |

### 5.4. B4 — Profile-aware Home (smart auto-adapt)

| Aspecto | Detalhe |
|---|---|
| **Backend** | Estender `/api/home/overview` schema com `profile: PlayerProfile` e `profileMeta: ProfileMeta`. RF-25 detalha schema. Storage: nova funcao `detectPlayerProfile(userId): { profile, totalUploads, totalSessions, sessionTournamentCount }`. |
| **Frontend** | Home.tsx passa `data.profile` para sub-componentes que adaptam (RecentSessionsList, TodayCard empty, EmptyHomeOnboarding). Sem novos componentes — apenas props novas + branches de copy. |
| **Adaptacao por perfil (ESCOPO IN — apenas copy)** | Tabela detalhada em RF-25.6. **Nao** muda ordem de blocos. **Nao** esconde blocos. **Apenas** texto de empty states + CTAs primarios. |
| **Onda 2 evolution (OUT)** | Toggle manual em `/settings`, hide-blocks por perfil, badge "Detected: hybrid (32 uploads + 18 sessions)" no footer Home — tudo ficou para Onda 2 real (D-FOUNDER-7). |
| **Tracking** | Evento `home_profile_detected` 1x por mount (apos data chegar). Payload `{ profile, totalUploads, totalSessions, sessionTournamentCount }`. Permite analise post-deploy de taxa de erro de detection (em Onda 2 quando toggle manual existir, comparar override-rate vs detected). |

### 5.5. B5 — Empty state copy upgrade

| Aspecto | Detalhe |
|---|---|
| **Componentes afetados** | `<RecentSessionsList>` (empty state quando `data.length === 0`), `<TodayCard>` (empty state quando `data === null`), `<EmptyHomeOnboarding>` (description geral). |
| **Comportamento** | Branch de copy baseado em `profile` prop nova passada por Home.tsx. 4 variantes: `upload-only` / `session-only` / `hybrid` / `new`. Detalhe em RF-26. |
| **Sem mudanca em `data` prop / type** | Apenas adiciona `profile?: PlayerProfile` opcional. Default em testes/storybook = `'hybrid'`. |

### 5.6. B6 — Coach FAB hint badge (opcional, +0.5d)

| Aspecto | Detalhe |
|---|---|
| **Componente** | `client/src/components/MiniChat.tsx` (modificar — ja existe global em `App.tsx`) — **OU** wrapper layer em `App.tsx` que injeta `hintCount` |
| **Comportamento** | Badge vermelho "1" no FAB do MiniChat se: (a) Insight do Dia ativo (qualquer tipo `!== 'fallback'`), (b) localStorage `home:coach:insightSeen:{YYYY-MM-DD}` ausente. Ao abrir MiniChat, seta a flag → badge desaparece pelo resto do dia. |
| **Posicao** | Badge top-right do FAB existente (canto sup-direito do botao circular). Tamanho `w-4 h-4 text-[10px]`. Cor `tokens.color.danger.bg` ou `bg-red-500`. |
| **Empty state** | Se `insight.type === 'fallback'` OU localStorage ja setado → SEM badge. |
| **Persistencia** | localStorage por dia. Limpa na primeira interacao do dia. |
| **Tracking** | `coach_fab_hint_shown` (1x por mount com badge visivel) + `coach_fab_hint_clicked` (click no FAB com badge ativo). |
| **Risco** | Modificacao em `<MiniChat>` que **esta fora de escopo Onda 1** (D2 explicitou "spec NAO modifica MiniChat"). PM-Spec recomenda **isolar mudanca** atraves de prop opcional `hintCount?: number` — se MiniChat ja tem essa prop, OK; senao, system-architect decide entre adicionar prop OU criar `<CoachFabBadge>` layer separado. |

---

## 6. Layout Final (wireframe ASCII desktop)

Hybrid profile (default — wireframe canonico):

```
┌──────────────────────────────────────────────────────────────────────┐
│ [HeaderLogo centered]                                                │  ← inalterado
├──────────────────────────────────────────────────────────────────────┤
│ [FlightBanner]      (condicional)                                    │
│ [CooldownBanner]    (condicional)                                    │
├──────────────────────────────────────────────────────────────────────┤
│ [StatusStrip] Banca │ ROI 30d │ Hoje │ Pendencias                    │  ← Q1 (4 cols)
├──────────────────────────────────────────────────────────────────────┤
│ ★ [DailyInsight] 📌 1 mao critica precisa de revisao   [Revisar →] │  ← Q3 (NOVO B1)
├──────────────────────────────────────────────────────────────────────┤
│ [TodayCard 2/3]                          │ [NextTournament 1/3]      │  ← Q2
├──────────────────────────────────────────────────────────────────────┤
│ [LifetimeStats] Torneios │ Sessoes │ Dias ativos │ Streak             │
├──────────────────────────────────────────────────────────────────────┤
│ [RecentSessions 1/2]                     │ [PendingHands 1/2]        │
├──────────────────────────────────────────────────────────────────────┤
│ [LibraryResume 1/2] 📚 Continue          │ [PerformanceMini 1/2]     │  ← NOVO B2
├──────────────────────────────────────────────────────────────────────┤
│ [NewsSlot 📰 Em breve]                                               │  ← VISIVEL (B3)
├──────────────────────────────────────────────────────────────────────┤
│ [HomeFooter]                                                         │
└──────────────────────────────────────────────────────────────────────┘
```

**Mobile (< 768px):** stack vertical full-width na ordem: HeaderLogo → Banners → StatusStrip (scroll-snap) → DailyInsight (full) → TodayCard → NextTournament → LifetimeStats → RecentSessions → PendingHands → LibraryResume → PerformanceMini → NewsSlot → HomeFooter.

**Tablet (768-1279px):** StatusStrip 2x2; DailyInsight full; Today + NextTournament 2/3 + 1/3; RecentSessions + PendingHands stack OR 1/2+1/2 (responsive); **LibraryResume + PerformanceMini 1/2 + 1/2**; NewsSlot full; Footer.

---

## 7. Escopo OUT (explicito)

NAO entra em Onda 1.5. Lista exaustiva pra evitar scope creep.

- **Insight do Dia backend cron + Anthropic prompt + tabela `daily_insights`** — Onda 2 real (custo 5-7d, fora do budget Onda 1.5).
- **Stats Analyzer top 3 deltas no Home** — Onda 2 (4-5d, requer query complexa em `stats_analyzer_runs` table).
- **Variance check PrimeDope ("ainda da pra grindar essa banca?")** — Onda 2 (3d).
- **Tournament Selector top 3 hoje no Home** — Onda 2 (3-4d).
- **Heuristicas amplas (F5 do plano original)** — Onda 2 (5-6d).
- **News real (Grok / xAI integration)** — Onda 3 (7-10d, bloqueado por feature externa + ADR de privacidade).
- **Goal tracker** — Onda 3 (5d, schema novo).
- **Customizacao layout (drag-drop, toggle on/off)** — Onda 3 (6-8d).
- **Pending CSV uploads heuristic ("voce uploadou Day 1 mas nao Day 2?")** — Onda 3 (3d).
- **Profile toggle manual em `/settings`** — Onda 2 real (D-FOUNDER-7).
- **Profile hide-blocks por perfil (esconder RecentSessions se upload-only)** — Onda 2 (D1.5-9 explicito: Onda 1.5 so adapta copy).
- **Profile reorder de blocos por perfil** — Onda 2.
- **Insight do Dia "compartilhar com Coach" botao** — Onda 2.
- **Continue Assistindo recomendacao Coach (vs ultima em progresso)** — Onda 2 (founder Q4 default).
- **Coach FAB badge multi-insight ("3 novos insights")** — Onda 2.
- **News placeholder com mock cards (2-3 fake items)** — VETADO (D-FOUNDER-5).
- **Schema novo / migration / `CREATE TABLE`** — zero. Onda 1.5 eh feature read-only ou reusa tabelas existentes.
- **Modificacao profunda em `<MiniChat>`** — apenas adicao de prop opcional para hint badge (B6); refactor profundo eh Onda 2.

---

## 8. Requisitos Funcionais (RF)

Cada RF tem criterio de aceite testavel. Test-writer escreve >=1 teste por RF.

### RF-22 — Insight do Dia (componente + engine)

**Descricao:** novo componente `<DailyInsight>` na Home que renderiza 1 insight acionavel calculado client-side a partir de `data` retornado por `/api/home/overview`.

#### RF-22.1 — Componente

**Criterio de aceite:**
- [ ] Componente criado em `client/src/components/home/DailyInsight.tsx`
- [ ] Exportado default
- [ ] Recebe prop `data: HomeOverviewResponse` (a mesma que outros blocos consomem)
- [ ] Renderiza 1 card com layout: emoji + title + body + CTA
- [ ] Card eh clicavel inteiro (alem do link CTA explicito)
- [ ] `data-testid="home-daily-insight"` no container
- [ ] `data-testid="home-daily-insight-cta"` no CTA

#### RF-22.2 — Engine (funcao pura)

**Criterio de aceite:**
- [ ] Arquivo `client/src/lib/home/dailyInsight.ts` criado
- [ ] Exporta `computeDailyInsight(data: HomeOverviewResponse, opts?: { now?: Date; timezone?: string }): DailyInsight`
- [ ] Funcao **pura** — mesmo input → mesmo output (verificavel via teste com fixture)
- [ ] Sem side effects, sem fetch, sem console.log em prod
- [ ] Retorna sempre `DailyInsight` valido (nunca `null` / `undefined` / throw)

#### RF-22.3 — Memoizacao

**Criterio de aceite:**
- [ ] Home.tsx usa `useMemo(() => computeDailyInsight(data), [data?.meta?.generatedAt])`
- [ ] Re-render do Home **sem** mudanca em `data` NAO recomputa insight (verificavel via spy ou render counter)

#### RF-22.4 — Posicao na grade

**Criterio de aceite:**
- [ ] `<DailyInsight>` renderizado **logo apos** `<StatusStrip>` (mesmo container `space-y-3`)
- [ ] `<DailyInsight>` renderizado **antes de** `<TodayCard>`/`<NextTournamentCountdown>` row
- [ ] Em mobile, ordem visual identica (segundo elemento apos StatusStrip)

#### RF-22.5 — Tipo `DailyInsight`

**Schema:**
```ts
type DailyInsightType =
  | 'cooldown'
  | 'pending-hands'
  | 'roi-decline'
  | 'study-gap'
  | 'celebration'
  | 'fallback';

interface DailyInsight {
  type: DailyInsightType;
  title: string;          // ex: "1 mao critica precisa de revisao"
  body: string;           // ex: "AKo on K72r vs UTG aberto — taggeada ha 3d"
  cta: { label: string; href: string };
  emoji?: string;
  severity?: 'neutral' | 'critical' | 'celebration';
}
```

**Criterio de aceite:**
- [ ] Tipos exportados em `client/src/lib/home/dailyInsight.ts` (ou em `shared/types/dailyInsight.ts` se reusado)
- [ ] `tsc` passa sem erros

#### RF-22.6 — Renderizacao do card

**Criterio de aceite:**
- [ ] Layout: `[emoji] [title bold] [body muted] [→ CTA]` em row desktop, stack mobile
- [ ] Cor base neutra (`tokens.color.surface.card` + `tokens.color.border.default`)
- [ ] `severity === 'critical'` aplica leve borda amber (`tokens.color.warning.border` ou similar)
- [ ] `severity === 'celebration'` aplica leve sutileza (sem cor verde gritante — anti-Christmas-tree D-FOUNDER-1)
- [ ] Click no card OU no CTA dispara navegacao para `cta.href`
- [ ] CTA tem `data-testid="home-daily-insight-cta"` e atributo `href` para SEO/a11y

#### RF-22.7 — Heuristicas (regras priorizadas, primeiro match vence)

**Regra 1 — Cooldown ativo:**
- Condicao: `data.banners.cooldown?.active === true`
- Output: `{ type: 'cooldown', emoji: '🛑', title: 'Cooldown ativo', body: 'Use o tempo para revisar maos pendentes ou estudar.', cta: { label: 'Abrir Estudos →', href: '/estudos' }, severity: 'critical' }`

**Regra 2 — >=3 starred hands pendentes:**
- Condicao: `(data.pendingHands?.length ?? 0) >= 3`
- Output: `{ type: 'pending-hands', emoji: '📌', title: '{N} maos pendentes acumuladas', body: 'Mais de 2 dias sem revisar — bote 15min antes de grindar.', cta: { label: 'Revisar agora →', href: '/estudos' }, severity: 'neutral' }` (substitui `{N}`)

**Regra 3 — ROI 30d caiu >5pp ultimos 7d:**
- Condicao: `data.statusStrip.roi30d?.sparkline.length >= 14` AND `prior7avg > 0` AND `(prior7avg - recent7avg) > 5` (onde `recent7avg = avg(sparkline.slice(-7))`, `prior7avg = avg(sparkline.slice(-14, -7))`)
- Output: `{ type: 'roi-decline', emoji: '📉', title: 'ROI caiu {X}pp ultimos 7d', body: 'Investigue: variance natural ou leak novo? Stats Analyzer pode ajudar.', cta: { label: 'Ver dashboard →', href: '/dashboard' }, severity: 'critical' }` (substitui `{X}` com `(prior7avg - recent7avg).toFixed(1)`)

**Regra 4 — >=7d sem grindar (re-engagement):**
- Condicao: `data.recentSessions?.[0]?.date` existe AND `daysSince(date) >= 7`
- Output: `{ type: 'study-gap', emoji: '🧘', title: '{N} dias sem grindar', body: 'Aproveite para estudar antes de voltar — Coach tem insights guardados.', cta: { label: 'Falar com Coach →', href: '/coach-ai' }, severity: 'neutral' }`

**Regra 5 — Streak >=7d:**
- Condicao: `data.lifetime.currentStreakDays >= 7`
- Output: `{ type: 'celebration', emoji: '🎯', title: 'Consistencia alta', body: '{N}d consecutivos com sessao — mantem o foco.', cta: { label: 'Ver dashboard →', href: '/dashboard' }, severity: 'celebration' }`
- **Nota anti-gamificacao (D-FOUNDER-1):** texto neutro, sem badge, sem animacao, sem CTA "compartilhar". So apresenta o numero ja existente em LifetimeStats com tom positivo.

**Regra 6 — Fallback (sempre garante 1 card):**
- Condicao: nenhuma das anteriores deu match
- Output: `{ type: 'fallback', emoji: '💡', title: 'Pergunte ao Coach', body: 'Seus dados estao em dia. Pergunte ao Coach o que ele ve.', cta: { label: 'Abrir Coach →', href: '/coach-ai' }, severity: 'neutral' }`

**Criterio de aceite:**
- [ ] 6 testes unit, 1 por regra: fixture que ativa exatamente aquela regra → output esperado
- [ ] 1 teste de prioridade: input que ativa multiplas regras → output da regra de maior prioridade (cooldown > pending-hands > roi-decline > study-gap > celebration > fallback)
- [ ] 1 teste de fallback: data com tudo zerado → fallback (regra 6)
- [ ] 1 teste de funcao pura: 2 chamadas com mesmo input → output deep-equal

#### RF-22.8 — Persistencia "insight visto hoje"

**Criterio de aceite:**
- [ ] No mount do `<DailyInsight>`, se `localStorage:home:insightSeen:{YYYY-MM-DD}` ausente, nao seta (so seta no first interaction OR no MiniChat open — ver B6)
- [ ] Date key usa fuso `userTimezone` quando disponivel, fallback `America/Sao_Paulo`
- [ ] localStorage write em try/catch (lesson #ja-aplicada — Home.tsx Onda 1 usa)

---

### RF-23 — Continue Assistindo (componente)

**Descricao:** novo componente `<LibraryResume>` que mostra ate 3 lessons em progresso na Home.

**Criterio de aceite:**
- [ ] Componente criado em `client/src/components/home/LibraryResume.tsx`
- [ ] Exportado default
- [ ] Renderiza ate `limit` (default 3) lessons em progresso
- [ ] Faz query separada via TanStack Query: `useQuery({ queryKey: ['/api/library/continue', { limit: 3 }], queryFn: ... })` OU recebe via prop `data: LibraryResumeItem[]` injetado pelo Home (system-architect decide)
- [ ] PM-Spec recomenda: query SEPARADA (nao adicionar ao `/api/home/overview` para nao inflar payload e respeitar entitlements check separado)
- [ ] Cada card mostra: thumbnail (160x90 ou similar), titulo (truncate 2 linhas), barra de progresso, tempo restante, formato badge
- [ ] Click → `/biblioteca/lesson/:lessonId?format=:format&t={lastPositionSeconds}`
- [ ] Empty state com acesso: "Comece sua primeira lesson →" link `/biblioteca`
- [ ] Empty state SEM acesso: bloco oculto silenciosamente (`return null`)
- [ ] Header: "Continue assistindo 📚" + link "Ver biblioteca completa →"
- [ ] `data-testid="home-library-resume"` no container
- [ ] `data-testid="home-library-resume-card-{lessonId}"` por card

---

### RF-24 — NewsSlot visivel "em breve"

**Descricao:** modificar `<NewsSlot>` existente (Onda 1) para renderizar placeholder visivel quando `enabled === false` OU `items.length === 0`.

**Criterio de aceite:**
- [ ] `client/src/components/home/NewsSlot.tsx` modificado
- [ ] Quando `enabled === false`: render placeholder (markup em D-FOUNDER-5 / §5.3)
- [ ] Quando `enabled === true && items.length === 0`: render mesmo placeholder (Onda 3 substitui)
- [ ] Quando `enabled === true && items.length > 0`: render Onda 3 (codigo existente — `<ul>` com items)
- [ ] Texto exato do header: `📰 Noticias do mercado`
- [ ] Badge exato: `Em breve` (uppercase, text-[10px], border-border)
- [ ] Texto exato do body: `Acompanharemos lancamentos de redes, atualizacoes de software (PT4 / HM3 / SharkScope) e movimentacoes relevantes do circuito MTT.`
- [ ] Card tem `border-dashed border-border` + `opacity-70`
- [ ] `data-testid="home-news-slot-placeholder"` no container do placeholder
- [ ] `data-testid="home-news-slot"` continua valido quando items > 0 (Onda 3 path)
- [ ] Atualizar testes existentes: NewsSlot Onda 1 retornava `null` → agora retorna placeholder
- [ ] Novo teste: `enabled=false` → placeholder visivel (DOM nao-vazio)
- [ ] Novo teste: `enabled=true, items=[]` → placeholder visivel
- [ ] Teste preservado: `enabled=true, items=[{...}, ...]` → cards reais (Onda 3 path)

---

### RF-25 — Profile-aware Home (backend + frontend)

**Descricao:** backend detecta perfil do player e retorna em `/api/home/overview`. Frontend reage adaptando copy de empty states + CTAs.

#### RF-25.1 — Schema da resposta `/api/home/overview` estendido

**Adicionar ao `HomeOverviewResponse`:**
```ts
type PlayerProfile = 'upload-only' | 'session-only' | 'hybrid' | 'new';

interface HomeOverviewResponse {
  // ... campos existentes Onda 1
  profile: PlayerProfile;
  profileMeta: {
    totalUploads: number;          // count de tournaments via CSV (tournaments table)
    totalSessions: number;          // count de grind_sessions
    sessionTournamentCount: number; // count de session_tournaments rows
    detectedAt: string;             // ISO timestamp da deteccao
  };
}
```

**Criterio de aceite:**
- [ ] `server/routes/home.ts` retorna `profile` + `profileMeta` no body
- [ ] Schema TS espelhado em `client/src/pages/Home.tsx` (interface `HomeOverviewResponse`)
- [ ] `tsc` passa sem erros

#### RF-25.2 — Storage `detectPlayerProfile`

**Funcao:** `storage.detectPlayerProfile(userId): Promise<{ profile, totalUploads, totalSessions, sessionTournamentCount, detectedAt }>`

**Criterio de aceite:**
- [ ] Funcao adicionada em `server/storage.ts`
- [ ] Query `tournaments WHERE user_id=X AND import_source IS NOT NULL` (ou equivalente — confirmar com system-architect qual coluna identifica CSV import) → `totalUploads`
- [ ] Query `grind_sessions WHERE user_id=X` → `totalSessions`
- [ ] Query `session_tournaments WHERE user_id=X` (via JOIN se necessario) → `sessionTournamentCount`
- [ ] Heuristica em RF-25.4 aplicada
- [ ] Retorna `detectedAt: new Date().toISOString()`
- [ ] Em caso de erro de query, fallback `'hybrid'` (defensivo) — log no console
- [ ] Test integration: 4 fixtures (upload-only, session-only, hybrid, new) → 4 profiles esperados

#### RF-25.3 — Subquery em `/api/home/overview`

**Criterio de aceite:**
- [ ] `Promise.allSettled` em `home.ts` adiciona subquery `timed('profile-detect', () => storage.detectPlayerProfile(userId), timings)`
- [ ] Timeout 800ms aplicado (D5 Onda 1)
- [ ] Se subquery falha, fallback `{ profile: 'hybrid', totalUploads: 0, totalSessions: 0, sessionTournamentCount: 0, detectedAt: now }` (defensivo)
- [ ] Logged em `meta.subqueryTimingsMs.profileDetect`

#### RF-25.4 — Heuristica de detection

**Regras (ordem de avaliacao):**

1. Se `totalUploads === 0 AND totalSessions === 0 AND sessionTournamentCount === 0` → `'new'`
2. Se `totalUploads >= 50 AND sessionTournamentCount >= 20` → `'hybrid'`
3. Se `totalUploads >= 50 AND sessionTournamentCount < 20` → `'upload-only'`
4. Se `totalUploads < 50 AND sessionTournamentCount >= 20` → `'session-only'`
5. Caso ambiguo (1 <= totalUploads < 50 OR 1 <= sessionTournamentCount < 20, sem bater hybrid):
   - Se `totalUploads > sessionTournamentCount` → `'upload-only'`
   - Se `sessionTournamentCount > totalUploads` → `'session-only'`
   - Se empate (incluindo ambos zero apos regra 1) → `'hybrid'` (default seguro)

**Criterio de aceite:**
- [ ] Funcao `detectProfile(stats)` testavel separadamente (export named de `storage.ts` OU helper em `server/lib/profile.ts`)
- [ ] 6 testes unit cobrindo cada regra + 1 teste de empate

#### RF-25.5 — Frontend reage a `data.profile`

**Criterio de aceite:**
- [ ] `Home.tsx` passa `profile={data.profile}` para `<RecentSessionsList>`, `<TodayCard>`, `<EmptyHomeOnboarding>`
- [ ] Tipo de prop nova: `profile?: PlayerProfile` (opcional, default `'hybrid'`)
- [ ] Componentes que NAO mudam de comportamento por perfil (StatusStrip, LifetimeStats, PerformanceMini, PendingHandsList, NewsSlot, Banners, Countdown) NAO recebem prop nova (evitar prop-drilling desnecessario)
- [ ] Tracker emite `home_profile_detected` 1x por mount apos `data` chegar (uso de `useRef` para guard, similar ao `home_view`)

#### RF-25.6 — Adaptacao de copy por perfil (apenas copy)

| Componente | upload-only | session-only | hybrid | new |
|---|---|---|---|---|
| **`<RecentSessionsList>` empty state** | "Voce importa CSVs mas ainda nao usou grind-live. Quer testar reportar uma sessao em tempo real?" + CTA primario "Iniciar sessao live →" + CTA secundario "Importar CSV →" | "Voce reporta sessoes live. Quer importar CSVs historicos para popular o /dashboard?" + CTA primario "Importar CSV →" + CTA secundario "Iniciar sessao live →" | (atual mantido) "Nenhuma sessao registrada — comece importando seu primeiro CSV ou iniciando uma sessao live." + 2 CTAs equivalentes | (atual mantido) — empty state cabe ao `<EmptyHomeOnboarding>` (4 steps) |
| **`<TodayCard>` empty state** | "Nenhuma sessao planejada para hoje" + CTA "Configurar grade →" + sub-link "Ou importe CSV →" | "Nenhuma sessao planejada para hoje" + CTA primario "Iniciar grind live →" + sub-link "Configurar grade →" | (atual mantido) "Nenhuma sessao planejada para hoje" + CTA "Configurar grade →" | (atual mantido) |
| **`<EmptyHomeOnboarding>` description** | (nao se aplica — empty state global so renderiza para `userState='empty'` que coincide com `profile='new'`) | (idem) | (idem) | "Complete os 4 passos abaixo para destravar o cockpit completo." (atual mantido) |

**Criterio de aceite:**
- [ ] 8 testes unit (2 componentes × 4 perfis) — verificar texto/CTA por branch
- [ ] Default `profile='hybrid'` mantem copy atual da Onda 1 (zero regressao)

---

### RF-26 — Empty state copy upgrade

**Descricao:** consolidar adaptacao de copy ja descrita em RF-25.6 num criterio testavel adicional global.

**Criterio de aceite:**
- [ ] Snapshot ou DOM-query: `<RecentSessionsList data={[]} profile="upload-only" />` contem "ainda nao usou grind-live"
- [ ] Snapshot: `<RecentSessionsList data={[]} profile="session-only" />` contem "Quer importar CSVs historicos"
- [ ] Snapshot: `<RecentSessionsList data={[]} profile="hybrid" />` contem texto atual Onda 1 (zero regressao)
- [ ] Snapshot: `<TodayCard data={null} profile="session-only" />` contem CTA "Iniciar grind live"
- [ ] Snapshot: `<TodayCard data={null} profile="upload-only" />` contem sub-link "Ou importe CSV"

---

### RF-27 — Coach FAB hint badge (opcional)

**Descricao:** badge "1" no FAB do MiniChat global quando ha Insight do Dia ativo nao visualizado pelo user no dia.

**Criterio de aceite:**
- [ ] `<MiniChat>` (ou wrapper `<CoachFabBadge>`) recebe prop `hintCount?: number` (default 0)
- [ ] App.tsx (ou Home.tsx) calcula `hintCount`:
  - 1 se: `insight.type !== 'fallback'` AND `localStorage:home:coach:insightSeen:{YYYY-MM-DD}` ausente
  - 0 caso contrario
- [ ] Badge renderizado top-right do FAB com `tokens.color.danger.bg`, `text-white`, `text-[10px]`, `w-4 h-4`, `rounded-full`
- [ ] Click no FAB com badge ativo: seta `localStorage:home:coach:insightSeen:{YYYY-MM-DD}=true`, badge desaparece
- [ ] Tracker:
  - `coach_fab_hint_shown` (1x por mount com badge visivel)
  - `coach_fab_hint_clicked` (click no FAB com badge ativo)
- [ ] Sem badge se `insight.type === 'fallback'` (nao tem nada acionavel novo)
- [ ] Sem badge se localStorage ja setado (visualizado hoje)
- [ ] Test: insight tipo `'cooldown'` + localStorage vazio → badge "1"
- [ ] Test: insight tipo `'fallback'` + localStorage vazio → SEM badge
- [ ] Test: insight tipo `'cooldown'` + localStorage setado → SEM badge
- [ ] Test: click no FAB com badge → localStorage setado, badge some

**Risco:** modificar `<MiniChat>` viola D2 Onda 1 ("spec NAO modifica MiniChat"). Mitigacao: adicionar **prop opcional** `hintCount?: number` que ate Onda 1 era inexistente. Se MiniChat hoje nao aceita prop, system-architect avalia entre (a) prop opcional simples ou (b) wrapper `<MiniChatWithHint>`. PM-Spec prefere (a) — minimo diff.

**Defer caso conflito:** se reviewer/architect identificar risco real de regressao em MiniChat, **B6/RF-27 vira opcional Onda 2** (founder Q4 default) e os outros 5 RFs prosseguem normais. PM-Spec sinaliza B6 como "stretch goal" da Onda 1.5.

---

### RF-28 — Endpoint `GET /api/library/continue`

**Descricao:** novo endpoint que retorna lista de lessons em progresso pelo user logado.

**Schema da resposta:**
```ts
interface LibraryContinueResponse {
  items: Array<{
    lessonId: string;
    lessonTitle: string;
    courseTitle: string;
    moduleTitle: string;
    coverImageUrl: string | null;
    format: 'video' | 'podcast' | 'article';
    lastPositionSeconds: number;
    totalDurationSeconds: number | null;
    progressPct: number;             // 0-100
    remainingSeconds: number | null;
    updatedAt: string;
  }>;
  hasAccess: boolean;                // entitlement check resultado
}
```

**Criterio de aceite:**
- [ ] Endpoint registrado em `server/routes/library-continue.ts` (ou inline em `library.ts`) — system-architect decide
- [ ] Auth `requireAuth`
- [ ] Query param `?limit=N` (default 3, max 10, validado via Zod)
- [ ] Query: `library_progress JOIN library_lessons WHERE userId=X AND completedAt IS NULL AND lastPositionSeconds > 0 ORDER BY updatedAt DESC LIMIT N`
- [ ] **Entitlement check** obrigatorio (reusa `library_entitlements` ADR-073). Se user sem acesso, retorna `{ items: [], hasAccess: false }` (frontend oculta bloco)
- [ ] Cache `Cache-Control: private, max-age=60` (60s)
- [ ] Resposta 200 com schema acima
- [ ] Resposta 401 sem JWT
- [ ] Test integration: user com 5 lessons em progresso → retorna 3 (ordem updatedAt DESC)
- [ ] Test integration: user sem entitlement → `hasAccess: false, items: []`
- [ ] Test integration: user sem lessons em progresso → `hasAccess: true, items: []`
- [ ] Performance: < 200ms p95

---

## 9. Requisitos Nao-Funcionais (RNF)

### RNF-1.5-1 — Performance

- `<DailyInsight>` engine: < 5ms por chamada (funcao pura, sem alocacao excessiva)
- `<DailyInsight>` mount: < 50ms (cache useMemo respeitado)
- `/api/library/continue`: < 200ms p95
- `/api/home/overview` (com `profile-detect` subquery adicionada): mantem budget < 500ms p95 (Onda 1 RNF-01) — verificar nao regrediu
- `<NewsSlot>` placeholder: < 10ms mount (markup estatico)

### RNF-1.5-2 — Acessibilidade

- `<DailyInsight>` card tem `role="article"` ou `aria-label="Insight do dia: {title}"`
- CTA do `<DailyInsight>` tem texto descritivo (nao apenas "→")
- `<LibraryResume>` cards tem `aria-label="Continuar assistindo {lessonTitle}, {progressPct}% concluido"`
- `<NewsSlot>` placeholder tem `aria-hidden="false"` e texto legivel
- Coach FAB badge tem `aria-label="1 insight novo"` quando ativo
- Contrastes >= 4.5:1 mantidos

### RNF-1.5-3 — Mobile

- `<DailyInsight>` em mobile: stack vertical (emoji + title em row, body em row novo, CTA full-width)
- `<LibraryResume>` em mobile: cards horizontais empilhados (1 por row), thumbnail 96x54 menor
- `<NewsSlot>` placeholder full-width em mobile, texto nao trunca

### RNF-1.5-4 — Tokens UI

- ZERO hardcoded `bg-gray-`, `text-emerald-`, `bg-slate-`, `text-amber-` no codigo novo
- Usar `@/lib/ui-tokens` consistentemente
- `<DailyInsight>` severity colors via `tokens.color.warning.*` / `tokens.color.success.*` / `tokens.color.surface.card`

### RNF-1.5-5 — Zero regressao

- Todos os testes existentes (`npm run test`) continuam passando
- Sidebar inalterada (Onda 1 D19 mantido)
- WelcomeNameModal continua funcionando
- `<MiniChat>` continua acessivel via FAB (B6 NAO quebra mount global)
- Onda 1 RNFs 01-11 continuam validos
- Test do NewsSlot Onda 1 (que esperava `null` quando `enabled=false`) **eh atualizado** em vez de removido — semantica mudou conforme RF-24

### RNF-1.5-6 — Instrumentacao analytics (5 eventos novos)

| Evento | Disparo | Payload |
|---|---|---|
| `home_insight_view` | Mount `<DailyInsight>` (1x por mount) | `{ insightType, severity }` |
| `home_insight_click` | Click no CTA do `<DailyInsight>` | `{ insightType, ctaLabel, href }` |
| `home_library_resume_view` | Mount `<LibraryResume>` com >=1 lesson (1x por mount) | `{ count, hasAccess }` |
| `home_library_resume_click` | Click em card de lesson | `{ lessonId, format, progressPct }` |
| `home_profile_detected` | 1x por mount apos `data` chegar | `{ profile, totalUploads, totalSessions, sessionTournamentCount }` |
| `coach_fab_hint_shown` | Badge visivel no FAB (1x por mount com badge) | `{ insightType }` (so se B6 incluido) |
| `coach_fab_hint_clicked` | Click no FAB com badge ativo | `{ insightType }` (so se B6 incluido) |

### RNF-1.5-7 — i18n PT-BR

- Toda copy nova em PT-BR
- Heuristicas Insight do Dia: textos exatos em RF-22.7
- `<NewsSlot>` placeholder texto exato em D-FOUNDER-5

### RNF-1.5-8 — Seguranca

- `/api/library/continue` exige JWT
- Entitlement check obrigatorio antes de retornar lessons (anti-paywall-bypass)
- Cache server-side (se adicionado) eh per-userId
- localStorage keys da Onda 1.5 nao contem PII (apenas data + flag boolean)

---

## 10. Modelo de Dados

**Tabelas tocadas:** **NENHUMA**. Onda 1.5 eh feature 100% read-only sobre tabelas existentes.

**Tabelas LIDAS (via `storage.ts` queries existentes ou novas):**

- `tournaments` (RF-25 detection: count via `user_id` filter)
- `grind_sessions` (RF-25 detection: count via `user_id` filter — ja usado em Onda 1 lifetime)
- `session_tournaments` (RF-25 detection: count via JOIN ou query direta)
- `library_progress` (RF-23 + RF-28: query lessons em progresso — ADR-074)
- `library_lessons` (RF-28: JOIN para titulo + thumbnail + duration)
- `library_modules` + `library_courses` (RF-28: JOIN para `moduleTitle` + `courseTitle`)
- `user_lesson_access` ou `library_entitlements` (RF-28: entitlement check — ADR-073)

**NENHUMA tabela nova.** Tabela opcional `daily_insights_log` mencionada no header desta spec **NAO eh criada** em Onda 1.5 (deferida para Onda 2 quando backend cron entrar).

---

## 11. API

### 11.1. Endpoint estendido: `GET /api/home/overview`

**Mudanca:** schema da resposta ganha `profile` + `profileMeta`.

| Aspecto | Detalhe |
|---|---|
| **Rota** | `GET /api/home/overview` (inalterada) |
| **Auth** | JWT obrigatorio (inalterada) |
| **Module** | `server/routes/home.ts` (existe — modificar) |
| **Resposta 200** | `HomeOverviewResponse` Onda 1 + `profile` + `profileMeta` (RF-25.1) |
| **Cache** | TTL 30s in-memory mantido (D1.5-11). Cache existente expira naturalmente apos deploy. |
| **Performance** | Mantem < 500ms p95 budget. Subquery `profile-detect` com timeout 800ms (D5). |

### 11.2. Endpoint novo: `GET /api/library/continue`

| Aspecto | Detalhe |
|---|---|
| **Rota** | `GET /api/library/continue` |
| **Auth** | JWT obrigatorio (`requireAuth`) |
| **Module** | `server/routes/library-continue.ts` (novo, recomendado) OU inline em `library.ts` |
| **Query params** | `limit?: number` (default 3, max 10, validado via Zod) |
| **Resposta 200** | `LibraryContinueResponse` (schema em RF-28) |
| **Resposta 401** | `{ message: 'Unauthorized' }` |
| **Cache headers** | `Cache-Control: private, max-age=60` |
| **Cache server-side** | Opcional in-memory 60s per-userId (system-architect decide; PM-Spec recomenda **sem** cache em Onda 1.5 — query simples, < 200ms) |
| **Performance budget** | < 200ms p95 |

### 11.3. Endpoints REUSADOS (zero codigo backend novo alem dos acima)

- `/api/home/overview` (estendido)
- `/api/dashboard/quick-stats` (Onda 1)
- `/api/dashboard/performance` (Onda 1)
- demais endpoints Onda 1 sem mudanca

---

## 12. Frontend — Arvore de Componentes

```
client/src/pages/Home.tsx (estendido — adicionar 2 blocos)
├── <HeaderLogo />                              [Onda 1]
├── <WelcomeNameModal />                        [Onda 1]
├── if data.userState === 'empty':
│   └── <EmptyHomeOnboarding data profile />    [Onda 1, prop nova RF-25.5]
├── if data.userState === 'power':
│   ├── <FlightBanner />                                   [Onda 1]
│   ├── <CooldownBanner />                                 [Onda 1]
│   ├── <StatusStrip />                                    [Onda 1]
│   ├── <DailyInsight data />                              [NOVO RF-22] ⭐
│   ├── <TodayCard data profile />                         [Onda 1, prop nova RF-25.5]
│   ├── <NextTournamentCountdown />                        [Onda 1]
│   ├── <LifetimeStats />                                  [Onda 1]
│   ├── <RecentSessionsList data profile />                [Onda 1, prop nova RF-25.5]
│   ├── <PendingHandsList />                               [Onda 1]
│   ├── <LibraryResume />                                  [NOVO RF-23] ⭐
│   ├── <PerformanceMini />                                [Onda 1]
│   └── <NewsSlot enabled items />                         [Onda 1 — RF-24 muda render path]
├── <HomeFooter />                              [Onda 1]
└── <MiniChat hintCount={...} />                [App.tsx, prop nova RF-27 OPCIONAL]
```

### 12.1. Arvore de novos arquivos

```
client/src/components/home/
├── DailyInsight.tsx                  [novo RF-22.1]
└── LibraryResume.tsx                 [novo RF-23]

client/src/lib/home/
└── dailyInsight.ts                   [novo RF-22.2 — engine pura]

server/routes/
└── library-continue.ts               [novo RF-28]
```

### 12.2. Arvore de arquivos modificados

```
client/src/components/home/
├── NewsSlot.tsx                      [RF-24 render path]
├── RecentSessionsList.tsx            [RF-25.5 + RF-26 prop profile]
├── TodayCard.tsx                     [RF-25.5 + RF-26 prop profile]
└── EmptyHomeOnboarding.tsx           [RF-25.5 prop profile]

client/src/pages/Home.tsx             [add DailyInsight + LibraryResume + pass profile]
client/src/components/MiniChat.tsx    [RF-27 prop hintCount — OPCIONAL]
client/src/App.tsx                    [calcular hintCount + passar — OPCIONAL]

server/routes/home.ts                 [RF-25.3 add profile-detect subquery]
server/storage.ts                     [RF-25.2 detectPlayerProfile fn + RF-28 getContinueWatching helper]
```

---

## 13. ADRs a Criar

System-architect cria 1-2 ADRs nesta sprint (max). News placeholder (B3) eh trivial e ja coberto pela ADR-100; sem ADR novo.

| ADR | Titulo proposto | Decisao principal |
|---|---|---|
| **ADR-103** | Daily Insight rule-based client-side strategy (Home Onda 1.5) | Insight do Dia eh funcao pura client-side com 6 heuristicas priorizadas. Sem backend cron, sem Anthropic prompt, sem tabela `daily_insights`. Memoizada via `useMemo` com dep em `data.meta.generatedAt`. Onda 2 evolui para backend. Justificativa: custo 2d vs 5-7d backend; iteracao rapida; reusa `data` ja retornado. |
| **ADR-104** | Player profile detection (smart auto-adapt) | Detection server-side baseada em counts `tournaments` vs `session_tournaments`. Thresholds: hybrid >= 50 uploads E >= 20 sessions. Default `'hybrid'` em duvida. Frontend so adapta copy (RF-25.6) — sem hide-blocks, sem reorder. Onda 2 evolui com toggle manual. |

ADR-105 (endpoint `/api/library/continue` + cache 60s) **opcional** — pode ser inline na ADR-073 (library entitlements) OU ADR proprio se system-architect achar relevante.

---

## 14. Sequencia Sugerida de Implementacao

Sub-tarefas em ordem ascendente de dependencia. Cada uma pode virar PR isolado.

| # | Sub-tarefa | Depende de | Tipo | Esforco |
|---|---|---|---|---|
| 1 | Modificar `<NewsSlot>` para render placeholder visivel (RF-24) | — | Frontend | XS (0.5d) |
| 2 | Criar `client/src/lib/home/dailyInsight.ts` engine pura + tipos (RF-22.2 + RF-22.5 + RF-22.7) | — | Frontend | M (1d) |
| 3 | Criar `<DailyInsight>` componente (RF-22.1 + RF-22.6) + integrar no Home.tsx (RF-22.4) | 2 | Frontend | S (0.5d) |
| 4 | Memoizacao `useMemo` no Home.tsx (RF-22.3) + tracker events (RNF-1.5-6) | 3 | Frontend | XS (<0.5d) |
| 5 | Criar endpoint `GET /api/library/continue` (RF-28) + storage helper | — | Backend | M (1d) |
| 6 | Criar `<LibraryResume>` componente (RF-23) + integrar no Home.tsx | 5 | Frontend | M (1d) |
| 7 | Adicionar `detectPlayerProfile` em `storage.ts` (RF-25.2 + RF-25.4) | — | Backend | S (0.5d) |
| 8 | Adicionar subquery `profile-detect` em `/api/home/overview` (RF-25.3) + estender schema (RF-25.1) | 7 | Backend | S (0.5d) |
| 9 | Frontend: passar `data.profile` para componentes (Home.tsx) + tracker `home_profile_detected` (RF-25.5) | 8 | Frontend | XS (0.5d) |
| 10 | Adaptar copy em `<RecentSessionsList>` + `<TodayCard>` + `<EmptyHomeOnboarding>` (RF-25.6 + RF-26) | 9 | Frontend | S (0.5d) |
| 11 | (OPCIONAL) Coach FAB hint badge em `<MiniChat>` (RF-27) + tracker | 4 | Frontend | XS (0.5d) |
| 12 | Atualizar testes Onda 1 do `<NewsSlot>` (semantica mudou) | 1 | Test | XS |
| 13 | Escrever testes novos (NewsSlot placeholder, DailyInsight engine, DailyInsight UI, LibraryResume, profile detection backend, profile copy frontend, FAB badge) | 1-11 | Test | M (1d) |
| 14 | system-architect: ADR-103 + ADR-104 + diagrama Mermaid (opcional fluxo Insight) | aprovacao spec | Doc | S |
| 15 | Reviewer + smoke test manual | 1-13 | QA | S |

**Esforco total estimado:** ~7 dias dev solo (1 sprint compacto).

**Caminho rapido (sem B6):** RFs 1-10 + 12-15 = ~6 dias. B6 (RF-27 + step 11) eh stretch goal.

---

## 15. Definition of Done

A sprint **home-reform-1-5** esta DONE quando **todos** os bullets abaixo sao verdade:

### 15.1. Codigo

- [ ] `<DailyInsight>` criado e integrado na Home (RF-22)
- [ ] `client/src/lib/home/dailyInsight.ts` engine pura + tipos exportados
- [ ] `<LibraryResume>` criado e integrado na Home (RF-23)
- [ ] `<NewsSlot>` modificado para render placeholder visivel (RF-24)
- [ ] `/api/home/overview` retorna `profile` + `profileMeta` (RF-25)
- [ ] `storage.detectPlayerProfile()` implementado (RF-25.2)
- [ ] `<RecentSessionsList>`, `<TodayCard>`, `<EmptyHomeOnboarding>` recebem prop `profile` e adaptam copy (RF-25.6 + RF-26)
- [ ] `GET /api/library/continue` implementado (RF-28)
- [ ] (OPCIONAL) `<MiniChat>` recebe `hintCount?: number` + badge no FAB (RF-27)
- [ ] Tracker emite 5 (ou 7 com B6) novos eventos (RNF-1.5-6)
- [ ] Zero hardcoded `bg-gray-`, `text-emerald-`, `bg-slate-` no codigo novo
- [ ] Componentes consomem `@/lib/ui-tokens`

### 15.2. Testes

- [ ] Test unit `<DailyInsight>` engine: 6 regras + prioridade + fallback + funcao pura (8 testes minimo)
- [ ] Test unit `<DailyInsight>` UI: render correto por tipo (3-4 testes)
- [ ] Test unit `<LibraryResume>`: empty com acesso, empty sem acesso (oculto), com 3 lessons, click em card
- [ ] Test unit `<NewsSlot>`: placeholder visivel (enabled=false), placeholder visivel (items=[]), cards reais (items > 0)
- [ ] Test unit `<RecentSessionsList>` empty: 4 perfis × 1 teste = 4 testes (RF-26)
- [ ] Test unit `<TodayCard>` empty: 4 perfis × 1 teste = 4 testes
- [ ] Test integration `/api/library/continue`: auth, schema, entitlement, limit (4 testes)
- [ ] Test integration `/api/home/overview`: schema com `profile` + `profileMeta`, 4 fixtures de profile detection
- [ ] Test unit `detectPlayerProfile`: 6 regras + empate (RF-25.4)
- [ ] (OPCIONAL B6) Test unit `<MiniChat>` com `hintCount`: 4 cenarios (RF-27)
- [ ] Total estimado: ~30-35 testes novos
- [ ] `npm run test` ⇒ tudo verde, zero regressao Onda 1
- [ ] `npm run check` (tsc) ⇒ zero erros

### 15.3. Performance

- [ ] `/api/home/overview` mantem < 500ms p95 (subquery profile-detect adicionada nao regrediu)
- [ ] `/api/library/continue` < 200ms p95
- [ ] `<DailyInsight>` engine < 5ms por chamada
- [ ] CLS < 0.1 mantido (DailyInsight + LibraryResume tem skeleton ou min-height reservado)

### 15.4. Acessibilidade

- [ ] `<DailyInsight>` `role="article"` ou `aria-label` adequado
- [ ] `<LibraryResume>` cards `aria-label` com progresso
- [ ] `<NewsSlot>` placeholder texto legivel
- [ ] (OPCIONAL B6) Coach FAB badge `aria-label="1 insight novo"`
- [ ] Lighthouse a11y score >= 95 mantido

### 15.5. Mobile

- [ ] Mobile breakpoints validados (320px, 375px, 414px, 768px, 1024px, 1280px)
- [ ] `<DailyInsight>` stack vertical em mobile
- [ ] `<LibraryResume>` cards full-width empilhados
- [ ] `<NewsSlot>` placeholder full-width

### 15.6. ADRs + Docs

- [ ] ADR-103 (Daily Insight strategy) criado
- [ ] ADR-104 (Profile detection) criado
- [ ] Spec aprovada pelo founder OU founder ausente (auto mode → prossegue)

### 15.7. Zero regressao

- [ ] Sidebar inalterada
- [ ] Onda 1 RFs 01-21 continuam testando verde
- [ ] WelcomeNameModal, MiniChat global, Empty state continuam funcionando
- [ ] Test do `<NewsSlot>` Onda 1 que esperava `null` foi **atualizado** (nao removido) para esperar placeholder

---

## 16. Riscos & Mitigacoes

| # | Risco | Severidade | Mitigacao |
|---|---|---|---|
| R1 | Heuristica Insight do Dia gera "ruido" (insights obvios ou irritantes) | Media | Iteracao rapida — feature flag opcional `INSIGHT_DAILY_ENABLED` (env var) para desabilitar; revisao semanal das primeiras 2 semanas; fallback (#6) garante card neutro. PM-Spec NAO requer flag mandatoria — codigo simples eh removivel se necessario. |
| R2 | Profile detection erra → upload-only player ve CTAs errados | Media | Default `'hybrid'` em duvida (mostra ambos CTAs — comportamento Onda 1 preservado); analytics rastreia `home_profile_detected` para validar pos-deploy. Onda 2 introduz toggle manual. |
| R3 | `<LibraryResume>` expoe Biblioteca para player free (sem entitlement) | Baixa | Endpoint `/api/library/continue` reusa entitlement check ADR-073; `hasAccess: false` retornado → bloco oculto no frontend. Test integration cobre. |
| R4 | Insight client-side recalcula em cada re-render | Media | `useMemo` com dep em `data.meta.generatedAt` (RF-22.3). Test unit verifica re-render sem `data` change nao recomputa. |
| R5 | Layout shift no carregamento (CLS regrediu) | Baixa | Skeleton para `<DailyInsight>` + `<LibraryResume>`; reservar `min-height` (~80px DailyInsight, ~200px LibraryResume) durante loading. |
| R6 | NewsSlot placeholder confunde QA ("isso eh real ou fake?") | Baixa | Texto explicito "Em breve" + badge visual + opacity-70 (`opacity-70` sinaliza desfocado/deferido); D-FOUNDER-5 aprovado. |
| R7 | `<MiniChat>` ja eh feature complexa Onda 1 — modificar para B6 risca regressao | Media | B6/RF-27 marcado como **stretch goal opcional**. Se reviewer/architect identificar risco real, defer para Onda 2. PM-Spec recomenda implementar via **prop opcional** `hintCount?: number` para minimizar diff. |
| R8 | Subquery `profile-detect` aumenta latencia do `/api/home/overview` acima do budget | Baixa | Timeout 800ms (D5 Onda 1) + Promise.allSettled. Se subquery falha/timeout, fallback `'hybrid'` (RF-25.3). Cache 30s mitiga em hits subsequentes. |
| R9 | Cache stale apos deploy (cache antigo sem `profile` retornado) | Baixa | TTL 30s in-memory expira naturalmente em <1min; nao requer flush manual (D1.5-11). |
| R10 | Test do NewsSlot Onda 1 quebra na hora do build (assumia `null`) | Trivial | Atualizar test (esperar placeholder) — explicito em RNF-1.5-5 + DoD 15.2. |

---

## 17. Compatibilidade com Decisoes Founder Existentes

Verificacao cruzada com `D-FOUNDER-1` a `D-FOUNDER-7`:

| Decisao | Onda 1.5 respeita? |
|---|---|
| **D-FOUNDER-1 (sem gamificacao)** | ✅ Insight tipo `'celebration'` eh texto neutro, sem badge/animacao/streak count separado. Streak so aparece em LifetimeStats (Onda 1 mantido). Coach FAB badge B6 eh sinal de "novo insight" — NAO eh achievement, NAO incrementa, reseta diariamente. |
| **D-FOUNDER-2 (sem customizacao Ondas 1+2)** | ✅ Profile-aware eh deteccao automatica, sem UI de configuracao. Toggle manual fica explicitamente Onda 2 real. |
| **D-FOUNDER-3 (News estrutura preparada Onda 1, real Onda 3)** | ⚠️ Onda 1.5 introduz **placeholder visivel** em vez de `null` (D-FOUNDER-5 explicitou approve). Mantem flag, endpoint stub, tipo TS intactos. Integracao real Grok continua Onda 3. |
| **D-FOUNDER-4 (logo nova entregue 2026-05-03)** | ✅ Sem mudanca em logo. |
| **D-FOUNDER-5 (NewsSlot placeholder textual)** | ✅ Decisao tomada nesta spec, RF-24 implementa. |
| **D-FOUNDER-6 (Insight do Dia client-side rule-based)** | ✅ Decisao tomada nesta spec, RF-22 implementa. |
| **D-FOUNDER-7 (Profile detection implicito smart auto-adapt)** | ✅ Decisao tomada nesta spec, RF-25 implementa. |

---

## 18. Perguntas Residuais (0-2 max para founder)

PM-Spec nao identifica bloqueios criticos restantes — Q1/Q2/Q3 do strategist ja foram respondidas via defaults founder Auto Mode (D-FOUNDER-5/6/7).

**Residuais (nao bloqueiam pipeline, podem ser respondidas em paralelo):**

1. **B6 (Coach FAB hint badge) — incluir na Onda 1.5 ou diferir para Onda 2?**
   - Inclui na 1.5 (+0.5d esforco, 0 risco se via prop opcional `hintCount`)
   - Difere para Onda 2 (mais conservador — evita tocar `<MiniChat>` que Onda 1 D2 explicitou nao tocar)
   - **PM-Spec recomenda incluir** (esforco baixo, valor de engagement alto). Se reviewer/architect detectar risco, defer trivial.

2. **Profile detection threshold pode precisar calibracao pos-launch.** Defaults atuais: `hybrid >= 50 uploads E >= 20 sessions`. Founder USER-0005 (Docaari) tem dados suficientes para validar empiricamente. Founder pode pedir ajuste apos primeira semana — OK, e configuravel via constantes em `storage.ts`.

---

## 19. Encerramento

**Caminho do arquivo:** `Docs/specs/home-reform-1-5.md`

**Checklist DoD condensado:**
- [ ] 6 RFs (RF-22 a RF-27) + 1 endpoint (RF-28) implementados
- [ ] 5 (ou 7 com B6) tracker events novos
- [ ] 2 ADRs novos (103, 104)
- [ ] ~30-35 testes novos verdes
- [ ] Zero regressao Onda 1
- [ ] Zero migration / `CREATE TABLE`
- [ ] Performance budget `/api/home/overview` < 500ms p95 mantido
- [ ] Mobile + a11y validados
- [ ] Spec aprovada (auto mode prossegue)

**Proximo passo recomendado:**
→ Use o agente `system-architect` para criar ADR-103 + ADR-104 + (opcional) diagrama Mermaid do fluxo Insight do Dia, baseado nesta spec.

→ Apos arquitetura, pipeline TDD padrao: `test-writer` → `implementer` → `reviewer`.
