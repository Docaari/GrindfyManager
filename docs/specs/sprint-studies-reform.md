# Sprint Studies-Reform — Spec PM

> Sprint: Studies-Reform (Fase 2 — PM-Spec)
> Data: 2026-05-01
> Worktree: `B:\grindfy-studies-reform` (branch `feature/studies-page-reform`)
> Input: `Docs/strategy/studies-reform-research.md` (auditoria + benchmark + 10 ideias ICE)
> Output: este documento — fonte de verdade operacional para `system-architect`, `test-writer`, `implementer`, `reviewer`
> Status: Proposta (aguardando aprovacao do dev)

---

## 1. Sumario Executivo

**Objetivo.** Reformar a pagina `/estudos` transformando-a de uma pilha vertical de 5 widgets mal-integrados em um **hub navegavel com sidebar + sub-rotas + dashboard hub-style** que centraliza temas, stats, spots, recomendacoes e busca rapida. A reforma resolve 5 anti-patterns auditados (mini-dashboard sem deep-link, sugestoes sem vinculo persistente, spots ilhados de temas, templates estaticos e ausencia de URL state) e implementa cross-link semantico entre os modulos Studies, Stats Analyzer, Spots e Coach AI.

**Escopo.** 12 RFs entregaveis em uma sprint (~28 dias dev solo, ~3 semanas com 2 devs paralelos). A spec e **isoladora**: nao toca nos componentes do Sess 3 (Stats Analyzer V2 — `StatsAnalyzerTab`, `HudLayoutCustomizer*`, `SnapshotComparator*`, `StatsSnapshot*`, `StatsWizard*`, `templates/`). A integracao com Sess 3 e via wrapper (RF-04) que invoca `StatsAnalyzerTab` sem alterar seu codigo. Migration 0021 e **opcional** — so executada se test-writer red phase confirmar necessidade; caso contrario streak persiste em localStorage temporariamente.

**12 RFs em 1 linha:**

- **RF-01** — Studies wrapper reformado (sidebar + bottom-nav + main area, URL routing sub-paths via Wouter)
- **RF-02** — Dashboard view nova (Continue de onde parou + Insights da semana + Spots pendentes + Recomendacoes + Streak)
- **RF-03** — Themes view com filtro `?fromStats=leaks` + tag "sugerido" baseado em delta de stats
- **RF-04** — Stats view wrapper (chama `StatsAnalyzerTab` intacto) + breadcrumb + botao "Sugerir temas baseado em leaks"
- **RF-05** — Spots view com side panel "Tema relacionado" + workflow link spot↔tema (dropdown vincular)
- **RF-06** — Recomendacoes view + service `studyRecommendationsService.ts` + endpoint `GET /api/study/recommendations`
- **RF-07** — Coach tool `read_theme_with_linked_spots` registrado em `coachTools/index`
- **RF-08** — Schema migration 0021 (`study_theme_spot_links` + `users.study_streak_days` + `users.last_study_activity_at`) — opcional
- **RF-09** — Quick search palette Cmd/Ctrl+K com `cmdk@1.1.1`
- **RF-10** — Empty states personalizados por view (4+ areas)
- **RF-11** — Onboarding wizard 4 cards primeira vez (com flag localStorage `studies_onboarding_completed`)
- **RF-12** — Streak counter no header com persistencia + estados intermediarios (lite/build/fire/freeze)

---

## 2. Contexto e Motivacao

A auditoria UX completa esta documentada em `Docs/strategy/studies-reform-research.md` (secao 1, anti-patterns 1-5). Resumo dos achados criticos:

| # | Anti-pattern | Severidade | Resolvido por |
|---|---|---|---|
| 1 | Mini-dashboard sem deep-link nem CTA | 3/5 | RF-02 |
| 2 | Sugestao "leak → tema" sem vinculo persistente | 4/5 | RF-03, RF-06 |
| 3 | PendingSpots ilhado de Themes (CRITICAL) | 5/5 | RF-05, RF-08 |
| 4 | Templates estaticos sem progressao adaptativa | 3/5 | RF-02 (recomendacoes) |
| 5 | Tabs flat, sem URL state nem sub-rotas | 3/5 | RF-01 |

A pesquisa competitiva (research secao 2) confirma que **GTOWizard, Run It Once, Upswing, Khan Academy e Brilliant** ja resolveram esses problemas via dashboard hub + sub-rotas + recomendacao server-side. O ranking ICE (research secao 3) prioriza:

1. **A — Continue de onde parou** (5.67) → RF-02
2. **C — Vinculo Spot↔Tema** (4.86) → RF-05, RF-08
3. **E — Cmd+K** (4.41) → RF-09
4. **J — Empty states** (4.05) → RF-10

A reforma respeita as **lessons learned** do `CLAUDE.md` secao 9 — em particular #1 (hooks primeiro), #2 (data-testid estavel), #3 (mocks com shape real), #4 (Vitest 4 + test.projects), #7 (deprecation gradual em schema), #11 (default minimo em componentes), #12 (estado persistente via React Query).

A sprint **convive em paralelo** com Sess 3 (Stats Analyzer V2). O contrato de isolamento esta na secao 7 (criterios globais).

---

## 3. Defaults Ativos D1-D12

Estes defaults sao decisoes de produto **ja tomadas pelo PM**. Eles eliminam ambiguidade na implementacao. Test-writer e implementer devem assumir os defaults sem requestionar.

| ID | Default |
|---|---|
| **D1** | **Sidebar default expanded em desktop (>=1024px), collapsed (icon-only) em tablet (768-1023px), hidden em mobile (<768px) substituida por bottom-nav fixa.** Sem toggle manual no MVP — viewport detection via `useMediaQuery` decide. |
| **D2** | **Default view = Dashboard.** URL `/estudos` carrega `Dashboard`. Sub-paths via `Wouter useLocation`: `/estudos/temas`, `/estudos/stats`, `/estudos/spots`, `/estudos/recomendacoes`, `/estudos/dashboard` (canonical alias para `/estudos`). Refresh em qualquer sub-path mantem view ativa. |
| **D3** | **Streak update ad-hoc on activity.** Hook `bumpStudyStreak(userId)` chamado em: theme open (ThemeDetail mount), snapshot create, spot review submit. Sem cron — eventos disparam update. |
| **D4** | **Recommendations engine server-side `studyRecommendationsService.ts`.** Pipeline: `getStatsLeaks(top 5)` + `getStaleSpots(reviewLater=true, idade>7d)` + `getDormantThemes(progress<30%, lastVisit>30d)` → merge → sort by `priority_score` → top 10. Cache TanStack Query `staleTime: 5 * 60 * 1000` (5min). |
| **D5** | **Spot↔Tema mapping inicial em `shared/spot-theme-mapping.ts`** (objeto literal exportado): ver secao 8.3 (Anexos) para mapping completo. |
| **D6** | **Coach tool `read_theme_with_linked_spots`** retorna: `{ theme: {...metadata}, tabs: [...], linked_spots: [...max 10], summary: { spots_count, tabs_count, last_activity_at } }`. Tier gating: Pro+ (mesma regra de outras coach tools de leitura). |
| **D7** | **Quick search `QuickSearchPalette.tsx` mounted no `Studies.tsx` raiz.** Atalho global `Cmd/Ctrl+K` apenas dentro de `/estudos/*` (event listener montado/desmontado pelo wrapper). Pacote `cmdk@1.1.1` ja instalado em `package.json`. |
| **D8** | **Onboarding localStorage flag `studies_onboarding_completed`** (boolean, key: `grindfy:studies:onboarding_completed`). Pula automatico se: `studyThemes.length >= 1 OR studySnapshots.length >= 1 OR starredHands.length >= 1`. |
| **D9** | **Mobile breakpoints (Tailwind alinhado):** `<768px` = bottom-nav (5 items: Dashboard, Temas, Stats, Spots, Recomendacoes), `768-1023px` = sidebar collapsed icon-only, `>=1024px` = sidebar expanded labels. |
| **D10** | **Migration 0021 SOMENTE se test-writer red phase confirmar.** Se nao, streak persistido em `localStorage` (key: `grindfy:studies:streak`, shape: `{ days: number, lastActivityAt: ISO8601 }`). Schema completo da migration esta na secao 8.1 (Anexos). |
| **D11** | **Cross-link Stats→Themes via query param `?fromStats=leaks`** que pre-aplica filtro nos temas (somente temas com `attacksLeakType` populado, ordenados por severidade do leak vinculado). URL final: `/estudos/temas?fromStats=leaks`. |
| **D12** | **Rate-limit fallback subagente fail 3x = direto.** Se subagente test-writer/implementer falhar 3x consecutivas no mesmo RF (rate-limit Anthropic), fallback para implementacao direta pelo agente principal. Marcar commit com prefixo `fallback:` no subject. |

---

## 4. Requisitos Funcionais Detalhados

> Padrao por RF: titulo, objetivo, user story, criterios aceite numerados, UI/UX notes, backend impact, test focus, defaults aplicaveis, lessons aplicaveis.

### RF-01 — Studies Wrapper Reformado

**Objetivo.** Substituir a pagina `Studies.tsx` plana por um wrapper de layout com sidebar (desktop) + bottom-nav (mobile) + main area que renderiza sub-rotas via Wouter.

**User story.**
> Como jogador profissional de MTT, quero navegar entre Dashboard, Temas, Stats, Spots e Recomendacoes via menu lateral persistente para nao perder o contexto da feature ao alternar (back-button funciona, refresh mantem view, URL e linkavel).

**Criterios de aceite.**
1. Rota `/estudos` carrega Dashboard (D2).
2. Rotas `/estudos/dashboard`, `/estudos/temas`, `/estudos/stats`, `/estudos/spots`, `/estudos/recomendacoes` renderizam suas respectivas views.
3. Sidebar visivel em viewport `>=1024px` com 5 items navegaveis + 1 logo no topo + streak counter no rodape.
4. Sidebar collapsed (icon-only, tooltip on hover) em `768-1023px`.
5. Bottom-nav fixed em `<768px` com 5 icones (sem labels, alturas 64px) — substitui sidebar inteira.
6. Active route destacada em todos os 3 modos (cor primaria + bold).
7. Refresh em `/estudos/temas` mantem aba ativa (URL e fonte de verdade).
8. Back-button do browser navega entre sub-rotas corretamente.
9. Cmd/Ctrl+K (qualquer subview) abre QuickSearchPalette (D7) — listener so ativo dentro de `/estudos/*`.
10. Sub-rotas inexistentes (ex: `/estudos/foo`) redirecionam para `/estudos/dashboard`.

**UI/UX notes.**
- **Componentes novos:** `client/src/components/studies/StudiesNavSidebar.tsx`, `client/src/components/studies/StudiesBottomNav.tsx`, `client/src/components/studies/StudiesLayout.tsx`.
- **Estados visuais:** active (cor primaria + ring-2), hover (bg-muted), focused (focus-visible:ring), disabled (caso permission missing — opacity-50 + tooltip).
- **Feedback:** transicao 150ms `ease-out` ao trocar view (fade + 4px slide). Nao bloquear navigation.
- **Acessibilidade:** sidebar e `<aside>` com `aria-label="Navegacao Estudos"`, items sao `<button>` com `aria-current="page"` se ativo.

**Backend impact.** Nenhum. Refactor frontend puro de roteamento.

**Test focus.**
- Render sidebar/bottom-nav nos 3 breakpoints (mock `matchMedia`).
- Click em cada item navega URL correta (mock `useLocation`).
- Refresh mantem state (URL → component mapping).
- Cmd+K abre palette dentro de `/estudos`, nao abre fora (testar em `/dashboard`).
- Rotas invalidas redirecionam.
- Active state baseada em URL atual.

**Defaults aplicaveis.** D1, D2, D7, D9.

**Lessons aplicaveis.** #1 (hooks primeiro — early return so depois de hooks), #2 (data-testid estavel: `data-testid="studies-nav-sidebar"`, `studies-nav-item-{view}`, `studies-bottom-nav`), #4 (Vitest 4 + jsdom).

---

### RF-02 — Dashboard View Nova

**Objetivo.** Criar Dashboard hub-style como home de `/estudos`, exibindo "Continue de onde parou", insights da semana, spots pendentes, recomendacoes (top 5) e streak counter prominente.

**User story.**
> Como jogador de MTT, ao abrir `/estudos` quero ver imediatamente onde parei meu estudo (qual tema/aba), o que estudei na semana e o que devo estudar a seguir, sem precisar caçar widgets espalhados.

**Criterios de aceite.**
1. Dashboard renderiza 5 secoes em grid responsivo: `Continue de onde parou` (hero), `Insights da semana`, `Spots pendentes (top 3)`, `Recomendacoes (top 5)`, `Streak counter`.
2. **Continue de onde parou:** mostra ate 3 cards de temas ordenados por `lastVisitedAt` desc, com `{theme.name, lastTab.name, progressPercent, daysAgo}`. Click → navigate para `/estudos/temas/<themeId>` com `?tab=<tabId>`.
3. **Insights da semana:** mostra 3 metricas: `themesOpenedThisWeek`, `spotsReviewedThisWeek`, `hoursStudiedThisWeek`. Cada KPI clicavel → navigate para subview filtrado por week.
4. **Spots pendentes (top 3):** thumbnails de `starredHands` com `reviewLater=true`, ordenados por `createdAt` desc, limit 3. Click → abre `SpotReviewCard` modal (mesmo modal de RF-05).
5. **Recomendacoes (top 5):** consome `GET /api/study/recommendations` (RF-06). Cada item tem `{type: 'leak'|'stale_spot'|'dormant_theme', title, priority_score, cta_action, cta_url}`.
6. **Streak counter:** componente `StudyStreakBadge` (RF-12) destaca streak atual + heatmap 7 dias.
7. Loading state: skeletons para cada secao (Radix Skeleton).
8. Empty state global (sem temas + sem spots + sem leaks): CTA grande "Criar primeiro tema" + tutorial em 30s.
9. Mobile: 1 coluna stacked (hero primeiro, depois insights, spots, recomendacoes, streak).
10. Desktop: 2 colunas grid (hero full-width topo, depois 2x2 grid das outras secoes).

**UI/UX notes.**
- **Componentes novos:** `client/src/components/studies/dashboard/DashboardView.tsx`, `ContinueWhereLeftOff.tsx`, `WeekInsights.tsx`, `PendingSpotsPreview.tsx`, `RecommendationsPreview.tsx`.
- **Estados visuais:** loading (skeletons), empty (CTA centralizado), error (toast + retry button por secao isolada).
- **Feedback:** click em card produz transicao slide-out 200ms antes de navegar.
- **Hover:** cards levantam 2px (`-translate-y-0.5`) com sombra elevada.

**Backend impact.**
- Endpoint novo (parte de RF-06): `GET /api/study/recommendations` retornando ate 5 items.
- Reusa endpoints existentes: `/api/study-themes`, `/api/starred-hands?status=pending&reviewLater=true`, `/api/dashboard/insights/week`.
- Se `lastVisitedAt` em `study_tabs` nao existir, derivar de `studySessions.tabId` mais recente.

**Test focus.**
- Render todas as 5 secoes com dados mockados (shape real do storage — lesson #3).
- Empty state quando `themes.length === 0 && spots.length === 0`.
- Loading state com skeletons.
- Click em "Continue de onde parou" navega corretamente com query params.
- Mobile 1-col vs desktop 2-col (mock matchMedia).
- Tolerancia a falha por secao (1 falha nao bloqueia outras — lesson #9).

**Defaults aplicaveis.** D2, D3, D4, D9.

**Lessons aplicaveis.** #1, #2 (`data-testid="dashboard-section-{name}"`), #3 (mock shape real), #9 (try/catch generico engole erros — logar antes de fallback), #11 (sem default actions decorativos).

---

### RF-03 — Themes View Reformada

**Objetivo.** Modernizar a view `/estudos/temas` com filtro "leak relacionado" (via query param `?fromStats=leaks`) e tag "sugerido" em temas baseados em delta de stats.

**User story.**
> Como jogador, quero acessar `/estudos/temas?fromStats=leaks` (vindo da Stats Analyzer) e ver apenas os temas que atacam meus leaks atuais, ordenados por severidade, para focar onde mais importa.

**Criterios de aceite.**
1. Rota `/estudos/temas` lista todos os temas em grid responsivo (mantendo layout atual).
2. Query param `?fromStats=leaks` ativa filtro: mostra apenas temas com `attacksLeakType` nao-nulo, ordenados por severidade do leak vinculado (desc).
3. Tag "Sugerido" (badge azul) em temas onde delta de stats nas ultimas 30 sessoes piorou (delta < -5%).
4. Botao "Limpar filtro" visivel quando filtro ativo, remove `?fromStats` da URL.
5. Filtro adicional: search box (busca por `theme.name`).
6. Empty state filtrado: "Nenhum tema vinculado a leaks. [CTA: Criar tema baseado em leak]".
7. Click em tema → navigate `/estudos/temas/<themeId>` (page existente preservada).
8. Botao "Criar tema" no header → abre `CreateThemeDialog` (existente preservado).
9. Sort default: `lastVisitedAt` desc → `createdAt` desc fallback.
10. Toggle compact/grid view persiste em localStorage.

**UI/UX notes.**
- **Componentes novos:** `client/src/components/studies/ThemesView.tsx` (wrapper que envolve grid existente + adiciona filtros).
- **Componentes preservados:** `ThemeCard.tsx`, `CreateThemeDialog.tsx`, `ThemeDetail.tsx`.
- **Estados visuais:** filtro ativo destaca em barra superior amarela "Filtrando por leaks: [X]" com botao [X].
- **Feedback:** mudanca de filtro produz fade-in 150ms.

**Backend impact.**
- Reusa `GET /api/study-themes` (existente).
- Schema check: `study_themes.attacks_leak_type` (varchar nullable) — adicionado em sprint anterior se ja existe; caso nao, RF-08 (migration 0021).
- Computa "Sugerido" no client a partir de delta de stats (chamada paralela `/api/dashboard/leaks/delta`).

**Test focus.**
- Filtro `?fromStats=leaks` mostra apenas temas vinculados.
- Filtro removido limpa URL.
- Tag "Sugerido" baseada em delta calculado.
- Search filtra por nome.
- Empty state filtrado vs nao-filtrado.
- Sort default e correto.
- Click navega para detail.

**Defaults aplicaveis.** D2, D11.

**Lessons aplicaveis.** #2 (data-testid `themes-grid`, `theme-card-{id}`), #11 (componentes nao ganham acoes default).

---

### RF-04 — Stats View Wrapper

**Objetivo.** Adicionar uma rota `/estudos/stats` que envolve `StatsAnalyzerTab` (componente do Sess 3 — INTACTO) com breadcrumb e botao "Sugerir temas baseado em leaks".

**User story.**
> Como jogador, quero acessar Stats dentro de Studies sem trocar de pagina, e ao detectar leaks, ter um botao que sugere temas relacionados em 1 clique.

**Criterios de aceite.**
1. Rota `/estudos/stats` renderiza `<StatsAnalyzerTab />` sem qualquer modificacao no componente filho.
2. Breadcrumb no topo: `Studies > Stats Analyzer`.
3. Botao "Sugerir temas baseado em leaks" no canto superior direito do wrapper (NAO dentro de `StatsAnalyzerTab`).
4. Click no botao → navigate `/estudos/temas?fromStats=leaks` (D11).
5. Botao desabilitado se `leaks.length === 0` (consulta paralela `/api/dashboard/leaks/active`).
6. Tooltip no botao desabilitado: "Importe historicos com 50+ MTTs para detectar leaks".
7. **Zero impacto em tests existentes** de `StatsAnalyzerTab` e seus filhos.
8. **Zero modificacao em arquivos de Sess 3** (`StatsAnalyzerTab.tsx`, `HudLayoutCustomizer*`, `SnapshotComparator*`, `StatsSnapshot*`, `StatsWizard*`, `templates/`).
9. Loading state do wrapper nao bloqueia render do filho.
10. Erro no botao "Sugerir" nao quebra `StatsAnalyzerTab`.

**UI/UX notes.**
- **Componentes novos:** `client/src/components/studies/StatsView.tsx` (wrapper).
- **Componentes preservados (NAO TOCAR):** `StatsAnalyzerTab.tsx` e toda a arvore.
- **Estados visuais:** botao "Sugerir temas" tem cor secundaria + icone `<Sparkles />`.
- **Feedback:** click navega imediatamente (sem loading bloqueante).

**Backend impact.**
- Reusa `/api/dashboard/leaks/active` (chamada paralela so para habilitar/desabilitar botao).
- Sem novos endpoints.

**Test focus.**
- Render do wrapper renderiza `StatsAnalyzerTab` (mock como vazio com `data-testid`).
- Botao "Sugerir" navega corretamente.
- Botao desabilitado quando `leaks=[]`.
- Tooltip visivel em hover do botao desabilitado.
- **Snapshot test garantindo que `StatsAnalyzerTab` mock e renderizado com props vazias (sem props customizadas).**

**Defaults aplicaveis.** D2, D11.

**Lessons aplicaveis.** #11 (zero default action no wrapper alem do necessario), isolation contract com Sess 3.

---

### RF-05 — Spots View com Workflow Link Spot↔Tema

**Objetivo.** Reformar a aba Spots como sub-rota propria (`/estudos/spots`) com side panel "Tema relacionado" e workflow para vincular spots a temas via dropdown.

**User story.**
> Como jogador, quero revisar um spot pendente e, na hora da revisao, vincula-lo a um tema existente (ex: "IP vs BB > Flop") para que o spot apareca no detalhe daquele tema e o Coach possa cita-lo em respostas futuras.

**Criterios de aceite.**
1. Rota `/estudos/spots` lista `starredHands` com `reviewLater=true` em grid (thumbnail + meta).
2. Click em spot abre `SpotReviewCard` modal (componente existente — sera estendido).
3. Modal `SpotReviewCard` ganha **dropdown novo "Vincular a tema (opcional)"** com lista de temas do usuario.
4. Submeter revisao com `themeId` selecionado: PATCH no spot **+** insert em `study_theme_spot_links` (RF-08) — relacao N:N (spot pode ter multiplos temas? **decisao: 1 tema por spot no MVP, FK simples**).
5. Side panel direito do `SpotReviewCard` mostra: se tema sugerido pelo mapping (D5) baseado em `spot.type` ou `spot.spot`, exibe "Sugerido: [nome do tema]" com botao "Aplicar sugestao" (preenche dropdown).
6. Apos vincular, spot some de `/estudos/spots` (filtro padrao = nao-vinculado).
7. Toggle "Mostrar todos (incluindo vinculados)" no header da view.
8. ThemeDetail (rota existente `/estudos/temas/<id>`) ganha aba nova "Spots vinculados" com lista de spots vinculados aquele tema.
9. Click em spot vinculado dentro de ThemeDetail abre `SpotReviewCard` em modo readonly (com botao "Editar conclusao").
10. Empty state spots vinculados em ThemeDetail: "Nenhum spot vinculado a este tema ainda. [CTA: Vincular spot existente]".

**UI/UX notes.**
- **Componentes novos:** `client/src/components/studies/SpotsView.tsx`, `client/src/components/studies/workflow/LinkSpotToThemeDropdown.tsx`, `client/src/components/studies/workflow/SuggestedThemeSidePanel.tsx`.
- **Componentes modificados:** `SpotReviewCard.tsx` (adicionar dropdown + side panel + propagar `themeId` no submit), `ThemeDetail.tsx` (adicionar aba "Spots vinculados" — sem tocar nas demais abas).
- **Estados visuais:** dropdown disabled enquanto temas carregam, tooltip "Selecione um tema" no submit se `themeId` necessario? **Decisao: opcional — submit funciona sem `themeId`**.
- **Feedback:** apos submit com tema, toast "Spot vinculado a [tema]. [CTA: Ir para tema]".

**Backend impact.**
- Endpoint estendido: `PATCH /api/starred-hands/:id/review` aceita `{ themeId?: string }` no body.
- Endpoint novo: `GET /api/study-themes/:id/linked-spots` retorna spots vinculados.
- Schema (RF-08): tabela `study_theme_spot_links` (N:1 spots → tema, mas modelado N:N para futuro).
- Validation: `themeId` deve pertencer ao mesmo `userId` do spot (Zod check + storage check).

**Test focus.**
- Submit de spot com `themeId` cria link (mock storage com shape real — lesson #3).
- Side panel mostra sugestao baseada em D5 mapping.
- ThemeDetail aba "Spots vinculados" lista links corretos.
- Spot vinculado removido do filtro padrao em `/estudos/spots`.
- Toggle "Mostrar todos" inclui vinculados.
- Cross-user check: `themeId` de outro user retorna 403.
- Empty state em ambos os lados (spots view + theme detail).

**Defaults aplicaveis.** D2, D5, D8 (RF-11), D10.

**Lessons aplicaveis.** #2 (`data-testid`), #3 (mock real), #7 (deprecation gradual — `starredHands.themeId` continua sem coluna; usamos tabela de link).

---

### RF-06 — Recomendacoes View + Service + Endpoint

**Objetivo.** Centralizar recomendacoes em `/estudos/recomendacoes` com pipeline server-side combinando leaks + spots stale + temas dormentes.

**User story.**
> Como jogador, quero uma view dedicada que me diga "estes sao os 10 itens mais importantes para estudar agora", baseado em meus stats reais, sem eu ter que adivinhar.

**Criterios de aceite.**
1. Rota `/estudos/recomendacoes` consome `GET /api/study/recommendations`.
2. Endpoint retorna ate 10 items ordenados por `priority_score` desc.
3. Cada item tem shape `{ id, type: 'leak'|'stale_spot'|'dormant_theme', title, description, priority_score, cta_action: 'create_theme'|'review_spot'|'open_theme', cta_url, metadata }`.
4. Pipeline interno (D4):
   - `getStatsLeaks(userId)` → top 5 leaks ativos com severidade > threshold.
   - `getStaleSpots(userId)` → spots `reviewLater=true && createdAt < now-7d && themeId IS NULL`.
   - `getDormantThemes(userId)` → temas `progress < 30 && lastVisitedAt < now-30d`.
5. Merge + sort by `priority_score`. Score formula:
   - leak: `severity * 10 + (recency_bonus = 5 se < 7d, 0 senao)`
   - stale_spot: `(idade_dias - 7) * 2` (max 30)
   - dormant_theme: `(30 - progress_percent) / 2 + idade_dormancia_dias`
6. Cache: TanStack Query `staleTime: 5min`, `gcTime: 10min`.
7. Loading state: skeleton 5 cards.
8. Empty state: "Nenhuma recomendacao agora — voce esta em dia! [CTA: Continuar estudando ultimos temas]".
9. Click em CTA navega para URL apropriada (`cta_url`).
10. Filter no header: "Tipo: [leak | spot | tema | todos]" (todos default).

**UI/UX notes.**
- **Componentes novos:** `client/src/components/studies/RecommendationsView.tsx`, `RecommendationCard.tsx`.
- **Tipo do badge:** leak = vermelho, stale_spot = amarelo, dormant_theme = roxo.
- **Score visivel:** progress bar 0-100 ao lado do titulo.

**Backend impact.**
- Service novo: `server/services/studyRecommendationsService.ts` com 3 funcoes privadas + 1 publica `getRecommendations(userId, limit=10)`.
- Route novo: `server/routes/study-recommendations.ts` com `GET /api/study/recommendations` (auth: `requireAuth`).
- Schema reuso: `studyThemes`, `starredHands`, e leaks via `detectLeaks()` (existente em `studies-v2.ts`).

**Test focus.**
- Pipeline retorna lista correta com mocks de cada fonte (lesson #3 — shape real).
- Score calculado corretamente para cada tipo.
- Limit respeita parametro.
- Cross-user isolation: nao retorna dados de outro user.
- Cache invalida apos 5min.
- Empty state quando todas as fontes vazias.
- Filter por tipo no client.

**Defaults aplicaveis.** D2, D4.

**Lessons aplicaveis.** #3 (shape real ao mockar leaks), #9 (logar erros antes de fallback), #6 (sem moeda — N/A).

---

### RF-07 — Coach Tool `read_theme_with_linked_spots`

**Objetivo.** Permitir que o Coach AI leia um tema com seus spots vinculados para citar conteudo concreto em respostas.

**User story.**
> Como jogador conversando com o Coach, quero perguntar "como esta meu jogo IP vs BB?" e receber resposta citando os 3 spots concretos que revisei nesse tema, com links clicaveis.

**Criterios de aceite.**
1. Tool registrada em `server/coachTools/index.ts` com nome `read_theme_with_linked_spots`.
2. Schema input (Zod): `{ theme_id: string }` OR `{ theme_name: string }` (XOR).
3. Tool retorna: `{ theme: {id, name, color, icon, progress, lastVisitedAt}, tabs: [...max 5 com {id, name, content_preview (first 200 chars)}], linked_spots: [...max 10 com {id, conclusion, type, spot, screenshotUrl}], summary: { spots_count, tabs_count, last_activity_at } }`.
4. Tier gating: Pro+ (mesma regra de outras coach tools de leitura — verificar `requirePermission('coach_tools_read')` ou tier no JWT).
5. Tool registrada como `tool` no Anthropic SDK call (input_schema valido).
6. Erro `theme not found` → mensagem amigavel "Tema nao encontrado. Tente outro nome ou crie um novo".
7. Cross-user isolation: `theme_id` deve pertencer ao user da conversa.
8. Token budget: response truncada para max 4000 tokens (lesson #10 — cuidado com cache Anthropic).
9. Tool nao quebra outras tools (testar coexistencia em cenarios multi-tool).
10. Logging: log call com `theme_id`, `user_id`, `tokens_returned` para analise.

**UI/UX notes.**
- N/A (backend tool). Mensagem do Coach que cita spots devera renderizar links clicaveis no chat (frontend de chat existente reutiliza pattern de markdown links).

**Backend impact.**
- Arquivo novo: `server/coachTools/readThemeWithLinkedSpots.ts`.
- Registrado em `server/coachTools/index.ts`.
- Reusa `storage.getStudyTheme(themeId, userId)`, `storage.getStudyTabsByTheme(themeId)`, `storage.getLinkedSpots(themeId)` (este novo, alimentado pela tabela `study_theme_spot_links` de RF-08).
- Cache: nao cachear no servidor (Coach decide cache via Anthropic prompt cache).

**Test focus.**
- Tool retorna shape correto com mocks (lesson #3).
- XOR `theme_id` vs `theme_name` (so um obrigatorio).
- Tier gating bloqueia free.
- Cross-user isolation.
- Truncation a 4000 tokens.
- Theme nao encontrado retorna erro amigavel.
- Coexistencia com outras tools.
- Logging chamado.

**Defaults aplicaveis.** D6.

**Lessons aplicaveis.** #3 (mock shape real), #5 (Vitest 4 + tools registry), #10 (DRY de prompts — extrair descricao para arquivo unico se compartilhada com system prompt).

---

### RF-08 — Schema Migration 0021 (Opcional)

**Objetivo.** Adicionar tabelas/colunas necessarias para vinculo spot↔tema e streak persistente, **somente se** test-writer red phase confirmar necessidade.

**User story.**
> Como sistema, preciso persistir relacao spot↔tema e streak counter de forma confiavel para que sobrevivam a refresh, multi-device e re-instalacao do browser.

**Criterios de aceite.**
1. Migration `migrations/0021_studies_reform.sql` criada com schema da secao 8.1 (Anexos).
2. Tabela nova `study_theme_spot_links` com `(theme_id FK, spot_id FK, user_id FK, linked_at)`.
3. Coluna nova `users.study_streak_days` (integer default 0).
4. Coluna nova `users.last_study_activity_at` (timestamp nullable).
5. Indices: `idx_study_theme_spot_links_theme`, `idx_study_theme_spot_links_spot`, `idx_users_streak` (parcial WHERE streak > 0).
6. Drizzle schema atualizado em `shared/schema.ts` com novos campos + tabela.
7. `db:push` testado em dev local **antes** de marcar RF como done.
8. Backfill: streak calculado on-the-fly no primeiro acesso (`bumpStudyStreak` checa `users.last_study_activity_at` e popula corretamente).
9. **Se opcional skip:** localStorage fallback documentado em `D10`. RF-12 ainda funciona, mas streak nao sobrevive limpeza de cache do browser.
10. Rollback plan: `migrations/0021_studies_reform_rollback.sql` reverte tudo.

**UI/UX notes.** N/A (backend).

**Backend impact.**
- Schema diff completo na secao 8.1.
- Storage atualizado: `storage.linkSpotToTheme()`, `storage.unlinkSpotFromTheme()`, `storage.getLinkedSpots(themeId)`, `storage.bumpStudyStreak(userId)`.

**Test focus.**
- Migration aplica sem erro em dev DB.
- Rollback aplica sem erro.
- Drizzle schema reflete tabela/colunas.
- Storage methods retornam shape correto.
- Constraint cross-user: spot e theme do mesmo user.
- FK `ON DELETE CASCADE` para `theme_id` e `spot_id` (se theme deletado, link deletado).

**Defaults aplicaveis.** D10.

**Lessons aplicaveis.** #7 (deprecation gradual — colunas nullable + default), #5 (vitest 4 + drizzle).

---

### RF-09 — Quick Search Palette (Cmd+K)

**Objetivo.** Adicionar palette `cmdk` mountada em `Studies.tsx` com atalho `Cmd/Ctrl+K` para jump rapido entre temas, abas, spots e acoes.

**User story.**
> Como power-user, quero pressionar Cmd+K em qualquer subview de `/estudos` e digitar "IP vs" para saltar instantaneamente para o tema "IP vs BB" sem clicar em menus.

**Criterios de aceite.**
1. `QuickSearchPalette.tsx` montada em `StudiesLayout.tsx`, listener de `Cmd/Ctrl+K` ativo apenas dentro de `/estudos/*`.
2. Palette abre como `<Dialog>` (Radix primitives) com `cmdk` por dentro.
3. Lista padrao (sem search): 5 acoes recentes — `Criar tema`, `Ir para Stats`, `Ver spots pendentes`, `Abrir Coach`, `Voltar para Dashboard`.
4. Search filtra:
   - **Temas:** `theme.name` contains.
   - **Abas:** `tab.name` contains, agrupadas por tema.
   - **Spots:** `spot.conclusion` contains (top 5).
   - **Acoes rapidas:** match em strings hardcoded.
5. Resultado tem grupos visiveis: "Temas", "Abas", "Spots", "Acoes".
6. Enter no item selecionado executa acao (navigate, open modal, etc).
7. Esc fecha palette.
8. `/` foca search input quando palette aberta.
9. Mobile: palette ocupa 90% da viewport (dialog fullscreen-like).
10. Performance: search local (sem API call) — usa cache TanStack `/api/study-themes`.

**UI/UX notes.**
- **Componente novo:** `client/src/components/studies/QuickSearchPalette.tsx`.
- **Estados visuais:** loading inicial (skeleton), empty (sem resultados), grupos com headers.
- **Feedback:** highlight item ativo com keyboard arrow up/down.
- **A11y:** `role="dialog"`, `aria-label="Busca rapida em Estudos"`, focus trap quando aberto.

**Backend impact.** Nenhum (search e local). Reusa `/api/study-themes` (cache existente).

**Test focus.**
- Cmd+K abre palette (mock keyboard event).
- Cmd+K fora de `/estudos` nao abre.
- Search filtra corretamente.
- Enter navega para item.
- Esc fecha.
- Grupos renderizados corretamente.
- Empty state.
- Performance: search local sem API call adicional.

**Defaults aplicaveis.** D7.

**Lessons aplicaveis.** #1 (hooks primeiro — listener em `useEffect`), #2 (`data-testid="quick-search-palette"`).

---

### RF-10 — Empty States Personalizados

**Objetivo.** Substituir empty states genericos por copies contextuais em 4 areas principais.

**User story.**
> Como usuario novo, ao ver uma area vazia quero entender exatamente o que fazer para preencher (com CTA claro), nao um "Nenhum dado" generico.

**Criterios de aceite.**
1. **Spots view vazio** → "Nenhum spot pendente. Faca cooldown na proxima sessao para gerar spots automaticamente. [CTA: Iniciar grind]" → navigate `/grind`.
2. **Themes view vazio** → "Voce ainda nao tem temas. Comece criando 'IP vs BB' — o tema mais comum entre profissionais. [CTA: Criar primeiro tema]" → abre `CreateThemeDialog` com prefill.
3. **Stats view sem dados** → "Importe historicos com 50+ MTTs para detectar leaks. [CTA: Importar historicos]" → navigate `/upload`.
4. **Recomendacoes view vazia** → "Nenhuma recomendacao agora — voce esta em dia! [CTA: Continuar estudando ultimos temas]" → navigate `/estudos/temas` ordenado por `lastVisitedAt`.
5. **Dashboard global vazio** (sem temas + sem spots + sem stats) → "Bem-vindo aos Estudos! Vamos criar seu primeiro tema em 30 segundos. [CTA: Comecar tutorial]" → abre Onboarding (RF-11).
6. **ThemeDetail aba "Spots vinculados" vazia** → "Nenhum spot vinculado a este tema ainda. [CTA: Vincular spot existente]" → navigate `/estudos/spots`.
7. Cada empty state tem icone ilustrativo (lucide icons).
8. Copy em PT-BR.
9. CTAs com analytics tracking (`studies.empty_state_cta_clicked` com `area` no payload).
10. Componente reutilizavel: `<EmptyState icon={...} title={...} description={...} ctaLabel={...} ctaAction={...} />`.

**UI/UX notes.**
- **Componente novo:** `client/src/components/studies/EmptyState.tsx`.
- **Layout:** centralizado vertical, max-width 480px, padding 48px.
- **Icone:** 48x48 com cor secondary, opacity 60%.

**Backend impact.** Nenhum.

**Test focus.**
- Cada empty state renderiza copy correto baseado em area.
- CTA dispara acao correta.
- Analytics event disparado no click.

**Defaults aplicaveis.** N/A.

**Lessons aplicaveis.** #11 (componente reutilizavel sem default actions).

---

### RF-11 — Onboarding Wizard (Primeira Vez)

**Objetivo.** Modal de boas-vindas com 4 cards educativos para primeira visita do usuario.

**User story.**
> Como novo usuario, na primeira vez que abro `/estudos`, quero um tour rapido de 4 telas que me explique o que sao temas, spots, stats e Coach, e me deixe criar meu primeiro tema antes de sair.

**Criterios de aceite.**
1. Modal abre automaticamente na primeira visita se: `!localStorage.getItem('grindfy:studies:onboarding_completed')` AND `themes.length === 0 AND snapshots.length === 0 AND spots.length === 0` (D8).
2. 4 cards sequenciais:
   - **Card 1 — Bem-vindo aos Estudos:** explica brevemente os 4 modulos (Temas, Stats, Spots, Coach).
   - **Card 2 — Crie seu primeiro Tema:** mostra exemplo "IP vs BB" + botao "Criar agora" (cria tema com defaults).
   - **Card 3 — Importe historicos:** explica leak detection. Botao "Ir para upload" OU "Pular".
   - **Card 4 — Configure Coach:** explica AI assistant. Botao "Abrir Coach" OU "Pular".
3. Botoes navegacao: Anterior, Proximo, Pular tudo.
4. Indicador de progresso: 4 dots no topo.
5. Ao concluir (ou pular): set `localStorage.setItem('grindfy:studies:onboarding_completed', 'true')`.
6. Reabrir manualmente via menu user (Settings → "Refazer tutorial Estudos").
7. Mobile: cards full-screen com swipe horizontal.
8. Desktop: modal central 600px width.
9. A11y: focus trap, esc fecha (com confirmacao "Tem certeza? [Sim/Continuar]").
10. Analytics: track `studies.onboarding_started`, `studies.onboarding_step_{1-4}`, `studies.onboarding_completed`, `studies.onboarding_skipped`.

**UI/UX notes.**
- **Componente novo:** `client/src/components/studies/onboarding/OnboardingWizard.tsx`, `OnboardingCard.tsx`.
- **Estilo:** ilustracoes simples (icones lucide grandes + descricoes em PT-BR).

**Backend impact.** Nenhum. Estado em localStorage.

**Test focus.**
- Modal abre na primeira visita (mock localStorage e queries vazias).
- Modal NAO abre se flag set OU se ja tem dados.
- Navegacao Anterior/Proximo funciona.
- Pular tudo seta flag corretamente.
- Card 2 cria tema "IP vs BB" com defaults.
- Card 3 navega para `/upload`.
- Reabrir manualmente clear flag.
- Esc com confirmacao.
- Mobile vs desktop layout.

**Defaults aplicaveis.** D8.

**Lessons aplicaveis.** #1 (hooks primeiro), #11 (sem actions default decorativas).

---

### RF-12 — Streak Counter no Header + Persistencia

**Objetivo.** Mostrar streak counter prominente no header de Studies, com estados intermediarios e persistencia confiavel.

**User story.**
> Como jogador, quero ver minha streak de estudos sempre visivel ao abrir Studies, com feedback visual diferente para cada faixa (1-2 inicio, 3-6 construindo, 7+ fogo, 30+ freeze available).

**Criterios de aceite.**
1. Componente `StudyStreakBadge` renderizado em 2 lugares: rodape da sidebar/bottom-nav E hero do Dashboard.
2. Estados visuais por faixa:
   - 0 dias: cinza, texto "Inicie sua streak hoje"
   - 1-2 dias: azul, texto "{N} dias — comecando"
   - 3-6 dias: amarelo, texto "{N} dias — construindo"
   - 7-29 dias: laranja com emoji, texto "{N} dias 🔥"
   - 30+ dias: roxo com emoji, texto "{N} dias ❄️ freeze disponivel" (freeze = pular 1 dia sem perder streak — implementacao futura).
3. Hover/click no badge → tooltip ou popover com heatmap dos ultimos 7 dias (7 quadradinhos estilo GitHub).
4. Heatmap: dia ativo = cor da faixa, inativo = cinza, hoje = ring destacado.
5. Hook `bumpStudyStreak(userId)` chamado em (D3):
   - `ThemeDetail` mount.
   - `studySnapshot` create (Stats Analyzer).
   - `starredHands.review` submit (Spots).
6. Logica `bumpStudyStreak`:
   - Se `lastActivityAt` mesmo dia (UTC): noop.
   - Se `lastActivityAt` ontem: increment `study_streak_days`.
   - Se `lastActivityAt` > 1 dia: reset para 1.
   - Se `lastActivityAt` null: set para 1.
7. Persistencia (D10):
   - **Se RF-08 migration:** `users.study_streak_days` + `users.last_study_activity_at`.
   - **Se localStorage:** key `grindfy:studies:streak`, shape `{ days: number, lastActivityAt: ISO8601 }`.
8. Endpoint `POST /api/study/streak/bump` (idempotente por dia).
9. Endpoint `GET /api/study/streak` retorna `{ days, last_activity_at, heatmap_last_7_days: [...{date, active}] }`.
10. Mobile: badge compacto (so numero + emoji) na bottom-nav.

**UI/UX notes.**
- **Componente novo:** `client/src/components/studies/StudyStreakBadge.tsx`.
- **Animacao:** quando streak incrementa, badge da pulse 500ms.

**Backend impact.**
- Service novo: `server/services/studyStreakService.ts` com `bumpStreak`, `getStreak`, `getHeatmap`.
- Routes novos: `server/routes/study-streak.ts` com `POST /bump`, `GET /`.
- Schema (RF-08 ou localStorage fallback).

**Test focus.**
- Bump no mesmo dia: noop.
- Bump no dia seguinte: increment.
- Bump com gap > 1 dia: reset para 1.
- Estados visuais por faixa (snapshot por faixa).
- Heatmap retorna 7 dias corretos.
- localStorage fallback funciona se migration skipped.
- Cross-user isolation no endpoint.

**Defaults aplicaveis.** D3, D10.

**Lessons aplicaveis.** #3 (mock shape real), #12 (estado persistente — usar TanStack Query cache + invalidate).

---

## 5. Out of Scope

Para evitar escopo creep e manter sprint executavel, **estes itens NAO entram**:

- **Push notifications** ("perde streak amanha") — depende de infra de notificacao push (web push, FCM, etc) que nao existe ainda.
- **Daily Spot Challenge** (wildcard W3 do research) — caro: requer moderacao, anonimizacao, voting. Roadmap futuro.
- **Compare two themes side-by-side** (wildcard W2) — feature 80% pronta no codigo (ja existe `comparisonTab` em `ThemeDetail.tsx`); surface UX e micro-tarefa, nao precisa RF dedicada.
- **ML refinement do recommendations engine** — V1 usa formula simples (D4); ML fica para V2.
- **Refatoracao da Stats Analyzer V2 (Sess 3)** — sprint paralelo nao tocado. Wrapper RF-04 nao modifica filhos.
- **Mobile app nativo** — apenas responsive PWA com bottom-nav.
- **Imagens AI / OCR de spots** — alem do que ja existe (sprint Spot-Screenshots ja merged).
- **Multiplayer / forum / social** — escopo edu individual.
- **Subscription / paywall changes** — Pro tier ja gating coach tools, nao mexemos.
- **Hearts/lives gamification** — anti-pattern Duolingo (toxico para adultos), nao copiar.
- **Onboarding com upload de print** (Card 3 simplificado para "ir para upload" — sem upload inline no wizard).
- **Streak freeze (skip 1 dia)** — UI mostra "freeze disponivel" mas funcionalidade fica para V2.
- **Coach tool `write_theme`** — apenas leitura no MVP. Coach nao cria/edita temas.

---

## 6. Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|---|---|---|
| **Sidebar+main+modal complexity** quebra layout em mobile/tablet | Media | Alta | Snapshot tests por breakpoint (RF-01). E2E manual em 3 viewports antes de merge. |
| **Conflito com Sess 3** (Stats Analyzer V2 paralela) — alguem toca em arquivo proibido | Baixa | Critica | Lista negra explicita em CLAUDE.md temporario do worktree + reviewer R3 verifica diff. Hookify rule bloqueando edits em paths. |
| **Performance recommendations** muito lenta (multi-source query) | Media | Media | Cache TanStack 5min + indices em colunas usadas (RF-08). Profiling antes de merge. |
| **Mobile nav transition** (sidebar → bottom-nav) com flash de layout | Media | Baixa | CSS-only transition + `useMediaQuery` SSR-safe. Testar com throttle 3G. |
| **localStorage fallback (D10) inconsistente** entre devices | Alta | Media | Documentar em UI: "Streak persiste apenas neste navegador. Para multi-device, [TODO migration 0021]". |
| **Migration 0021 quebra db existente** | Baixa | Critica | Migration testada em dev DB antes. Rollback plan obrigatorio. db:push so com aprovacao explicita do dev. |
| **Coach tool RF-07 inflar context size** | Media | Media | Truncar response a 4000 tokens. Limit max 5 tabs / 10 spots. Lesson #10. |
| **Cross-link `?fromStats=leaks` quebrar deep-link existente** | Baixa | Baixa | Verificar zero break em rotas existentes. Tests cobrindo deep-link com/sem param. |
| **cmdk lib** (Cmd+K) conflita com browser shortcuts | Baixa | Baixa | Listener so dentro de `/estudos/*`. preventDefault no Cmd+K. Documentado. |
| **Onboarding wizard** intrusivo demais para usuarios returning | Baixa | Media | D8: pular se ja tem dados. Tracking analytics para detectar friction. |
| **Rate-limit Anthropic em subagentes** | Media | Media | D12: fallback para implementacao direta apos 3 fails. |
| **Ressalva: streak ad-hoc (D3)** pode contar duplicado se bump chamado em multiple components | Media | Baixa | Idempotencia por dia (se mesmo dia, noop). Teste especifico. |

---

## 7. Criterios de Aceite Globais (Sprint Inteiro)

A sprint so e considerada concluida quando:

1. **100% testes verdes** — `npx vitest` sem falhas. Total estimado: ~120 testes novos (10 por RF medio).
2. **Reviewer R3 zero blocker** — pipeline TDD padrao: pm-spec → system-architect → test-writer → implementer → reviewer (R3 = round 3 sem blocker, apenas notas).
3. **Migration 0021 testada** (se aplicavel) — `db:push` em dev DB sem erro, rollback testado, schema reflete em Drizzle.
4. **Sess 3 nao quebrada** — `StatsAnalyzerTab` + filhos intactos. Snapshot tests anteriores passam sem mudanca. **Diff em arquivos da Sess 3 = ZERO.**
5. **Mobile testado em 3 breakpoints** — `<768px`, `768-1023px`, `>=1024px`. Bottom-nav funciona em mobile, sidebar collapsed funciona em tablet, sidebar expandida funciona em desktop.
6. **Lighthouse score >= 90** em Performance e Accessibility para `/estudos/dashboard`.
7. **Telemetria implementada** — eventos descritos no checklist do research secao 8 (`studies.continue_clicked`, `spot.linked_to_theme`, `studies.cmdk_opened`, `studies.leak_link_clicked`, `studies.empty_state_cta_clicked`, `studies.onboarding_started`, `studies.onboarding_completed`).
8. **Empty states copy aprovado** — 6 textos da RF-10 em PT-BR.
9. **Coach tool funcional** — RF-07 testada manualmente em chat real.
10. **Documentacao** — ADRs criados pelo system-architect (recomendar minimo: 1 ADR sobre URL state pattern, 1 ADR sobre schema migration 0021 se executada, 1 ADR sobre studyRecommendationsService scoring).

---

## 8. Anexos

### 8.1 Schema Migration 0021 (Detalhe)

> Aplicada **somente se** test-writer red phase confirmar necessidade (D10).

```sql
-- migrations/0021_studies_reform.sql

-- Tabela nova: study_theme_spot_links (relacao N:N entre themes e spots)
CREATE TABLE IF NOT EXISTS study_theme_spot_links (
    id VARCHAR(21) PRIMARY KEY DEFAULT '', -- nanoid no app layer
    theme_id VARCHAR(21) NOT NULL REFERENCES study_themes(id) ON DELETE CASCADE,
    spot_id VARCHAR(21) NOT NULL REFERENCES starred_hands(id) ON DELETE CASCADE,
    user_id VARCHAR(21) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    linked_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (theme_id, spot_id) -- idempotencia
);

CREATE INDEX IF NOT EXISTS idx_study_theme_spot_links_theme ON study_theme_spot_links(theme_id);
CREATE INDEX IF NOT EXISTS idx_study_theme_spot_links_spot ON study_theme_spot_links(spot_id);
CREATE INDEX IF NOT EXISTS idx_study_theme_spot_links_user ON study_theme_spot_links(user_id);

-- Streak counter (cache em users)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS study_streak_days INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_study_activity_at TIMESTAMP NULL;

-- Indice parcial para queries de streak ativa
CREATE INDEX IF NOT EXISTS idx_users_streak_active
    ON users(study_streak_days)
    WHERE study_streak_days > 0;
```

```sql
-- migrations/0021_studies_reform_rollback.sql

DROP TABLE IF EXISTS study_theme_spot_links CASCADE;

ALTER TABLE users
    DROP COLUMN IF EXISTS study_streak_days,
    DROP COLUMN IF EXISTS last_study_activity_at;

DROP INDEX IF EXISTS idx_users_streak_active;
```

**Drizzle schema diff em `shared/schema.ts`:**

```typescript
// Tabela nova
export const studyThemeSpotLinks = pgTable('study_theme_spot_links', {
  id: varchar('id', { length: 21 }).primaryKey(),
  themeId: varchar('theme_id', { length: 21 })
    .notNull()
    .references(() => studyThemes.id, { onDelete: 'cascade' }),
  spotId: varchar('spot_id', { length: 21 })
    .notNull()
    .references(() => starredHands.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 21 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  linkedAt: timestamp('linked_at').notNull().defaultNow(),
}, (table) => ({
  themeSpotUnique: unique().on(table.themeId, table.spotId),
  themeIdx: index('idx_study_theme_spot_links_theme').on(table.themeId),
  spotIdx: index('idx_study_theme_spot_links_spot').on(table.spotId),
  userIdx: index('idx_study_theme_spot_links_user').on(table.userId),
}));

// Em users (adicionar):
// studyStreakDays: integer('study_streak_days').notNull().default(0),
// lastStudyActivityAt: timestamp('last_study_activity_at'),
```

---

### 8.2 Lista de Arquivos Esperados

#### Arquivos Novos

**Frontend (client/src):**
- `components/studies/StudiesLayout.tsx` (RF-01)
- `components/studies/StudiesNavSidebar.tsx` (RF-01)
- `components/studies/StudiesBottomNav.tsx` (RF-01)
- `components/studies/StudyStreakBadge.tsx` (RF-12)
- `components/studies/QuickSearchPalette.tsx` (RF-09)
- `components/studies/EmptyState.tsx` (RF-10)
- `components/studies/dashboard/DashboardView.tsx` (RF-02)
- `components/studies/dashboard/ContinueWhereLeftOff.tsx` (RF-02)
- `components/studies/dashboard/WeekInsights.tsx` (RF-02)
- `components/studies/dashboard/PendingSpotsPreview.tsx` (RF-02)
- `components/studies/dashboard/RecommendationsPreview.tsx` (RF-02)
- `components/studies/ThemesView.tsx` (RF-03)
- `components/studies/StatsView.tsx` (RF-04)
- `components/studies/SpotsView.tsx` (RF-05)
- `components/studies/RecommendationsView.tsx` (RF-06)
- `components/studies/RecommendationCard.tsx` (RF-06)
- `components/studies/workflow/LinkSpotToThemeDropdown.tsx` (RF-05)
- `components/studies/workflow/SuggestedThemeSidePanel.tsx` (RF-05)
- `components/studies/onboarding/OnboardingWizard.tsx` (RF-11)
- `components/studies/onboarding/OnboardingCard.tsx` (RF-11)

**Shared:**
- `shared/spot-theme-mapping.ts` (D5 — secao 8.3)

**Backend (server/):**
- `services/studyRecommendationsService.ts` (RF-06)
- `services/studyStreakService.ts` (RF-12)
- `routes/study-recommendations.ts` (RF-06)
- `routes/study-streak.ts` (RF-12)
- `coachTools/readThemeWithLinkedSpots.ts` (RF-07)

**Migrations:**
- `migrations/0021_studies_reform.sql` (RF-08, opcional)
- `migrations/0021_studies_reform_rollback.sql` (RF-08, opcional)

**Tests:**
- `tests/studies/StudiesLayout.test.tsx`
- `tests/studies/StudiesNavSidebar.test.tsx`
- `tests/studies/DashboardView.test.tsx`
- `tests/studies/ThemesView.test.tsx`
- `tests/studies/StatsView.test.tsx`
- `tests/studies/SpotsView.test.tsx`
- `tests/studies/RecommendationsView.test.tsx`
- `tests/studies/QuickSearchPalette.test.tsx`
- `tests/studies/StudyStreakBadge.test.tsx`
- `tests/studies/EmptyState.test.tsx`
- `tests/studies/OnboardingWizard.test.tsx`
- `tests/studies/workflow/LinkSpotToThemeDropdown.test.tsx`
- `tests/server/studyRecommendationsService.test.ts`
- `tests/server/studyStreakService.test.ts`
- `tests/server/coachTools/readThemeWithLinkedSpots.test.ts`
- `tests/migrations/0021_studies_reform.test.sql` (opcional)

#### Arquivos Modificados

**Frontend:**
- `client/src/pages/Studies.tsx` — substituir conteudo plano por `<StudiesLayout />` + roteamento sub-rotas. **NAO REMOVER** integration points de PendingSpots/Themes/Stats que ainda sao referenciados — apenas re-organizar como sub-views.
- `client/src/components/studies/SpotReviewCard.tsx` — adicionar dropdown "Vincular a tema" + side panel sugestao + propagar `themeId` no submit.
- `client/src/components/studies/ThemeDetail.tsx` — adicionar aba "Spots vinculados" (apenas adicao; nao tocar nas demais abas existentes).
- `client/src/App.tsx` (ou route registry) — registrar sub-rotas `/estudos/*` se necessario.

**Backend:**
- `server/coachTools/index.ts` — registrar `read_theme_with_linked_spots` (apenas adicao).
- `server/storage.ts` — adicionar metodos `linkSpotToTheme`, `unlinkSpotFromTheme`, `getLinkedSpots`, `bumpStudyStreak`, `getStudyStreak`.
- `server/routes/index.ts` (ou registry) — registrar novos routes `study-recommendations`, `study-streak`.
- `server/routes/starred-hands.ts` — `PATCH /api/starred-hands/:id/review` aceita `themeId` opcional no body.

**Shared:**
- `shared/schema.ts` — adicionar `studyThemeSpotLinks` table + colunas em `users` (apenas se RF-08 executada).

#### Arquivos NAO TOCADOS (zona Sess 3)

- `client/src/components/studies/StatsAnalyzerTab.tsx` (e toda subarvore)
- `client/src/components/studies/HudLayoutCustomizer*.tsx`
- `client/src/components/studies/SnapshotComparator*.tsx`
- `client/src/components/studies/StatsSnapshot*.tsx`
- `client/src/components/studies/StatsWizard*.tsx`
- `client/src/components/studies/templates/**`
- Qualquer test em `tests/studies/StatsAnalyzer*` ou `tests/studies/Hud*` ou `tests/studies/Snapshot*`.

---

### 8.3 Mapping Spot Type/Spot → Theme Tags (D5)

```typescript
// shared/spot-theme-mapping.ts

/**
 * Mapping inicial spot.type / spot.spot → array de theme tags sugeridos.
 * Usado por SuggestedThemeSidePanel para sugerir vinculo.
 *
 * Cada chave e um valor de spot.type ou spot.spot.
 * Cada valor e array de tags (lowercase, snake_case) que devem casar
 * com theme.tags ou theme.name (fuzzy match).
 */
export const SPOT_TO_THEME_MAPPING: Record<string, string[]> = {
  // Por type
  tilt: ['emocional', 'mental_game', 'tilt_control'],
  leak: ['preflop_ranges', 'icm_basics', 'leak_specific'],
  bluff: ['bluff_strategy', '3bet_pot_oop', '3bet_pot_ip'],
  cbet: ['cbet_strategy', 'flop_strategy'],
  fold: ['fold_equity', 'icm_basics'],
  call: ['calling_ranges', 'pot_odds'],
  raise: ['raising_ranges', '3bet_strategy'],

  // Por spot
  ip_vs_bb: ['ip_vs_bb', 'flop_strategy', 'cbet_strategy'],
  bb_vs_ip: ['bb_vs_ip', 'defending_ranges'],
  sb_vs_bb_bw: ['sb_vs_bb', 'blind_war'],
  bb_vs_sb_bw: ['bb_vs_sb', 'blind_war'],
  '3bet_pot_ip': ['3bet_pot_ip', 'bluff_strategy'],
  '3bet_pot_oop': ['3bet_pot_oop'],
  icm: ['icm_basics', 'icm_advanced', 'bubble_play'],

  // Catch-all
  generic: ['general_strategy'],
};

/**
 * Helper: dado um spot, retorna array de theme tags sugeridos.
 * Combina mapeamento por type + por spot, dedupe.
 */
export function getSuggestedThemeTags(spot: { type?: string; spot?: string }): string[] {
  const tags = new Set<string>();
  if (spot.type && SPOT_TO_THEME_MAPPING[spot.type]) {
    SPOT_TO_THEME_MAPPING[spot.type].forEach((tag) => tags.add(tag));
  }
  if (spot.spot && SPOT_TO_THEME_MAPPING[spot.spot]) {
    SPOT_TO_THEME_MAPPING[spot.spot].forEach((tag) => tags.add(tag));
  }
  return Array.from(tags);
}
```

---

### 8.4 Endpoints Novos / Modificados

| Metodo | Rota | Descricao | Auth | RF |
|---|---|---|---|---|
| GET | `/api/study/recommendations` | Lista top 10 recomendacoes (leaks, spots stale, temas dormentes) | JWT | RF-06 |
| POST | `/api/study/streak/bump` | Incrementa streak (idempotente por dia) | JWT | RF-12 |
| GET | `/api/study/streak` | Retorna streak atual + heatmap 7 dias | JWT | RF-12 |
| GET | `/api/study-themes/:id/linked-spots` | Lista spots vinculados a um tema | JWT | RF-05 |
| PATCH | `/api/starred-hands/:id/review` | **(MODIFICADO)** Body aceita `themeId` opcional | JWT | RF-05 |
| Coach tool | `read_theme_with_linked_spots` | Tool registrada no coachTools registry | JWT + tier Pro+ | RF-07 |

---

### 8.5 Telemetria (Eventos Esperados)

Para que reviewer/founder possa medir impacto pos-merge:

| Evento | Quando | Payload |
|---|---|---|
| `studies.continue_clicked` | Click em card "Continue de onde parou" | `{ themeId, tabId }` |
| `studies.cmdk_opened` | Cmd+K abre palette | `{ from_view }` |
| `studies.cmdk_action_executed` | Item selecionado em palette | `{ action_type, target_id }` |
| `spot.linked_to_theme` | Spot vinculado a tema | `{ spotId, themeId, suggested: boolean }` |
| `studies.leak_link_clicked` | Botao "Sugerir temas" em StatsView | `{ leak_count }` |
| `studies.recommendation_clicked` | Click em recomendacao | `{ rec_type, priority_score }` |
| `studies.empty_state_cta_clicked` | Click em CTA de empty state | `{ area }` |
| `studies.onboarding_started` | Modal abre | `{}` |
| `studies.onboarding_step_completed` | Cada step do wizard | `{ step: 1-4 }` |
| `studies.onboarding_completed` | Concluiu todos os 4 cards | `{}` |
| `studies.onboarding_skipped` | Pulou em qualquer step | `{ at_step }` |
| `studies.streak_bumped` | bumpStudyStreak chamado | `{ new_streak_days }` |
| `coach.tool_used` | Tool RF-07 invocada pelo Coach | `{ tool: 'read_theme_with_linked_spots', theme_id }` |

---

## 9. Encerramento

**Pre-requisito desta spec:** `Docs/strategy/studies-reform-research.md` lido e aprovado.

**Proximo agente recomendado:**
> Apos aprovacao do dev, invocar `system-architect` para criar:
> - Diagrama Mermaid C4 (Container + Component) da nova arquitetura `/estudos/*`
> - Diagrama de sequencia do fluxo "spot → vincular tema → coach cita" (Fluxos 2 + 4 do research)
> - ADR-064 (proposto) — URL state pattern em studies (sub-rotas como fonte de verdade)
> - ADR-065 (proposto) — Schema migration 0021 (se executada) — link spot↔tema
> - ADR-066 (proposto) — studyRecommendationsService scoring formula (D4)

**Apos arquitetura:** `test-writer` red phase para os 12 RFs (estimativa ~120 testes).

**Verificacao final desta spec (checklist):**

- [x] Cada RF tem criterios de aceite numerados e testaveis
- [x] Cenarios de teste cobrem happy path, edge cases e isolation contracts
- [x] Secao "Out of Scope" preenchida (13 itens excluidos)
- [x] Defaults D1-D12 documentados sem ambiguidade
- [x] Endpoints listados com metodo, rota, descricao, auth, RF origem
- [x] Schema migration completo (SQL + Drizzle + rollback)
- [x] Mapping inicial spot↔tema definido (8.3)
- [x] Lista de arquivos novos vs modificados vs intocados
- [x] Riscos identificados com mitigacoes
- [x] Telemetria especificada
- [x] Lessons learned aplicadas por RF
- [x] Mobile breakpoints (D9) consistentes em todos RFs aplicaveis
- [x] Zona Sess 3 explicitamente protegida (RF-04 + secao 7 + 8.2)

---

*Spec gerada por pm-spec em 2026-05-01. Apos aprovacao explicita do dev, prosseguir com system-architect.*
