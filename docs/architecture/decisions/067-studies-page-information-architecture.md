# ADR-067 — Information Architecture da pagina `/estudos`: sidebar collapsivel + URL routing sub-paths

- Status: Proposto
- Data: 2026-05-01
- Sprint: Studies-Reform / Fase 3 (Arquitetura)
- Decision owner: autonomous (founder AFK; aplica defaults D1, D2, D9 da spec)
- Related: ADR-007 (BlockNote editor — `study_tabs` jsonb), ADR-068 (cross-feature recommendations engine), spec `Docs/specs/sprint-studies-reform.md` RF-01

## Context

A pagina `/estudos` hoje (`client/src/pages/Studies.tsx` linhas 308-470) e uma
pilha vertical de 5 widgets renderizados sequencialmente: mini-dashboard (3
KPIs), bloco "Sugerido para voce", grid de templates, `PendingSpotsTab` e o
grid de temas. A navegacao em nivel root e composta por **2 tabs flat**
(`Temas` / `Stats Analyzer`). Resultados auditados em
`Docs/strategy/studies-reform-research.md` (anti-pattern #5):

- URL nao reflete contexto: `/estudos` mostra todos os widgets independente
  da intencao.
- Refresh perde state: a tab ativa nao sobrevive a F5.
- Coach nao consegue deep-link: nao da pra dizer "abra `/estudos/spots`".
- Browser back-button nao navega entre widgets.
- Adicionar uma 6a area (Recomendacoes, RF-06) significa empilhar mais um
  bloco vertical — escala ruim.

A spec Studies-Reform RF-01 introduz **5 areas distintas** (Dashboard,
Temas, Stats, Spots, Recomendacoes) que precisam coexistir com:

- **Sess 3** (Stats Analyzer V2 paralela) — NAO PODE TOCAR em
  `StatsAnalyzerTab` e arvore (zona protegida em `Docs/specs/sprint-studies-reform.md` secao 8.2).
- **Cmd/Ctrl+K palette** (RF-09) — atalho global que precisa saber em que
  view o usuario esta.
- **Streak counter** (RF-12) — visivel em sidebar/bottom-nav E hero do
  dashboard, dois mountpoints.
- **3 breakpoints** (D9): `<768px` mobile (bottom-nav 5 items),
  `768-1023px` tablet (sidebar collapsed icon-only), `>=1024px` desktop
  (sidebar expandida com labels).
- **Wouter** ja em uso (`client/src/App.tsx`) — sub-paths sao first-class.
- **TanStack Query** ja em uso — cache global persiste atraves de
  re-mounts; trocar de view nao re-busca lista de temas.

A questao arquitetural: **como reorganizar a navegacao para que (a) URL
seja fonte de verdade do estado da view, (b) sidebar/bottom-nav permanecam
fora da Sess 3 zone, (c) Coach possa deep-linkar, (d) viewport detection
escolha entre sidebar e bottom-nav sem flash?**

Tres alternativas foram avaliadas.

### Forcas em jogo

- **Linkabilidade:** Coach (RF-07) precisa de URLs estaveis. Uma feature
  futura "share progress" tambem dependera disso.
- **Refresh resilience:** F5 em `/estudos/temas?fromStats=leaks` deve
  manter view + filtro.
- **Mobile-first:** `<768px` precisa de UI radicalmente diferente (sem
  hover, sem teclado fisico, espaco vertical limitado).
- **Cache continuity:** trocar de view nao deve re-fetch dados ja em cache.
  TanStack Query ja resolve isso via `queryKey`, desde que o componente
  pai (`StudiesLayout`) permaneca montado entre views.
- **Sess 3 isolation:** `StatsAnalyzerTab` nao pode receber props novas
  nem ser modificado. Wrapper RF-04 chama o componente intacto.
- **Lesson #11 (default minimo):** sidebar items sao apenas navegacao;
  nao adicionar acoes "decorativas".
- **Lesson #12 (estado persistente):** estado de filtro/sort dentro de
  uma view persiste via URL query params, nao `useState` local.

## Opcoes Consideradas

### Opcao A: Tabs in-page (Radix `<Tabs>`) — manter padrao atual mas estendido

Trocar as 2 tabs atuais por 5 tabs (`Dashboard`, `Temas`, `Stats`, `Spots`,
`Recomendacoes`).

- **Pros:**
  - Refactor minimo: ja existe `<Tabs>` em `Studies.tsx`.
  - Acessivel out-of-the-box (Radix).
  - Sem mudanca em routing — `/estudos` continua sendo a unica rota.
- **Contras:**
  - **URL nao reflete state.** `/estudos` mostra qualquer view, depende
    de useState interno. Refresh volta para default.
  - **Coach nao deep-linka.** Nao da pra `navigate('/estudos/spots')`.
  - **Mobile mal:** 5 tabs horizontais em viewport <768px sao
    apertadas/scrollables; nao tem espaco para labels uteis.
  - **Sess 3 acoplada:** wrapper RF-04 precisaria injetar
    `<StatsAnalyzerTab />` dentro de uma tab; isolamento e fragil
    (tab muda contexto entre re-mounts → cache TanStack pode invalidar
    se key depender de tab).
  - **Browser back-button nao funciona** entre tabs.
  - Resolve apenas anti-pattern #5 superficialmente; nao prepara para
    futuro (6a area = mais uma tab apertada).

### Opcao B: Drawer lateral (slide-in/out)

Sidebar visivel apenas quando aberta via botao hamburguer; fecha
automaticamente apos selecionar item.

- **Pros:**
  - Maximiza area util da main view.
  - Pattern conhecido em apps mobile.
- **Contras:**
  - **Friccao alta:** cada navegacao exige 2 cliques (abrir + selecionar).
  - **Power user perde tempo:** nao da pra ver todas as views ao mesmo
    tempo nem o estado da streak/recomendacoes.
  - **Desktop subutiliza espaco** (>=1024px tem espaco sobrando, drawer
    fechado e desperdicio).
  - **A11y:** drawer requer focus trap + esc-to-close — mais complexo que
    sidebar persistente.
  - Streak counter (RF-12) nao tem mountpoint persistente.

### Opcao C: Multi-page com router separado

Cada view e uma page top-level (`/estudos/dashboard`, `/estudos/temas`...)
com layout proprio sem sidebar compartilhada — header global do app.

- **Pros:**
  - URL como fonte de verdade.
  - Coach deep-linka.
- **Contras:**
  - **Cache TanStack quebrado:** trocar de page re-monta arvore inteira;
    queries de listagem (`/api/study-themes`) re-fetcham desnecessariamente.
  - **Sem contexto compartilhado:** streak counter, Cmd+K palette
    (RF-09) precisariam ser mountados em todas as pages — duplicacao
    e listener leak.
  - **Bottom-nav quebra:** mobile precisa de wrapper que persista entre
    pages — voltamos para Opcao D de fato.
  - **Onboarding wizard** (RF-11) tambem precisaria mount global.
  - **Sess 3:** `StatsAnalyzerTab` em pagina propria expoe sua complexidade
    sem o wrapper de breadcrumb/botao "Sugerir temas" (RF-04).

### Opcao D: **Sidebar collapsivel + URL routing sub-paths Wouter (ESCOLHIDA)**

Layout componente `StudiesLayout` mounted uma vez para toda a arvore
`/estudos/*`:

- **Sidebar** persistente (desktop expandida `>=1024px`, collapsed icon-only
  `768-1023px`) ou **bottom-nav** fixa (mobile `<768px`), decidida via
  `useMediaQuery`.
- **Main area** renderiza sub-rota via `<Switch>`/`<Route>` Wouter:
  - `/estudos` → `Dashboard` (canonical alias para `/estudos/dashboard`)
  - `/estudos/dashboard` → `DashboardView`
  - `/estudos/temas` → `ThemesView` (suporta `?fromStats=leaks`, `?q=...`)
  - `/estudos/temas/:themeId` → `ThemeDetail` (existente preservado)
  - `/estudos/stats` → `StatsView` (wrapper RF-04 invoca `StatsAnalyzerTab`)
  - `/estudos/spots` → `SpotsView`
  - `/estudos/recomendacoes` → `RecommendationsView`
  - `/estudos/*` (catch-all) → redirect para `/estudos/dashboard`.
- **`QuickSearchPalette`** (RF-09) montada no `StudiesLayout` com listener
  global Cmd/Ctrl+K ativado em mount, removido em unmount — listener so
  vive enquanto `/estudos/*` esta ativo.
- **`StudyStreakBadge`** (RF-12) montado em rodape do sidebar/bottom-nav E
  hero do dashboard. Cache TanStack `['study', 'streak']` evita double-fetch.
- **`OnboardingWizard`** (RF-11) montado condicional em `StudiesLayout`
  baseado em D8 (localStorage flag + queries vazias).

- **Pros:**
  - URL e fonte de verdade. F5 mantem view + filtros (query params).
  - Coach deep-linka qualquer view.
  - **Cache TanStack continuo:** `StudiesLayout` permanece montado, queries
    nao re-fetcham entre views (lesson #12).
  - **Sess 3 intocada:** `StatsView` e wrapper que invoca
    `<StatsAnalyzerTab />` sem props, satisfazendo contrato de isolamento
    da spec (8.2).
  - **Mobile-first:** bottom-nav 5 items com altura 64px, icones lucide
    (sem labels), ergonomia comprovada (Instagram, Twitter).
  - **Browser back-button funciona:** Wouter integra com History API.
  - **Escala:** adicionar 6a area = nova rota + nova entry no array
    `STUDIES_NAV_ITEMS`. Nao adicionar mais bloco vertical em pilha.
  - Streak counter, Cmd+K, Onboarding tem mountpoint estavel unico.
- **Contras:**
  - Refactor maior em `Studies.tsx` (vira shell que renderiza
    `StudiesLayout`).
  - Componentes existentes (`PendingSpotsTab`, "Sugerido", templates) viram
    sub-secoes do `DashboardView` ou da `ThemesView` — re-organizacao,
    nao re-escrita.
  - Sub-paths catch-all precisam de regra explicita (`/estudos/foo` →
    redirect dashboard) para evitar 404 white-screen.
  - `useMediaQuery` em SSR pode dar flash de layout — mitigado com
    layout hibrido (renderiza sidebar+bottom-nav ambos, esconde via CSS).

## Decisao

**Adotar Opcao D — sidebar collapsivel + URL routing sub-paths Wouter.**

A implementacao concretiza os defaults D1, D2, D9 da spec:

- **D1 — Sidebar default expanded em desktop (>=1024px), collapsed
  (icon-only) em tablet (768-1023px), hidden em mobile (<768px) substituida
  por bottom-nav fixa.** Sem toggle manual no MVP — `useMediaQuery`
  decide.
- **D2 — Default view = Dashboard.** `/estudos` carrega `Dashboard`.
  Sub-paths via `Wouter useLocation`. Refresh em qualquer sub-path
  mantem view.
- **D9 — Mobile breakpoints alinhados com Tailwind:** `<768px` =
  bottom-nav, `768-1023px` = sidebar collapsed, `>=1024px` = sidebar
  expandida.

### Estrutura de arquivos

```
client/src/
├── pages/
│   └── Studies.tsx                              # shell → renderiza StudiesLayout
├── components/studies/
│   ├── StudiesLayout.tsx                        # layout pai (sidebar/bottom-nav + main area)
│   ├── StudiesNavSidebar.tsx                    # sidebar (desktop + tablet collapsed)
│   ├── StudiesBottomNav.tsx                     # bottom-nav (mobile)
│   ├── QuickSearchPalette.tsx                   # Cmd+K (mount global em Layout)
│   ├── EmptyState.tsx                           # reusavel por view
│   ├── StudyStreakBadge.tsx                     # streak (mount em sidebar + dashboard)
│   ├── dashboard/
│   │   ├── DashboardView.tsx
│   │   ├── ContinueWhereLeftOff.tsx
│   │   ├── WeekInsights.tsx
│   │   ├── PendingSpotsPreview.tsx
│   │   └── RecommendationsPreview.tsx
│   ├── ThemesView.tsx
│   ├── StatsView.tsx                            # WRAPPER que monta <StatsAnalyzerTab /> intacto
│   ├── SpotsView.tsx
│   ├── RecommendationsView.tsx
│   ├── RecommendationCard.tsx
│   ├── workflow/
│   │   ├── LinkSpotToThemeDropdown.tsx
│   │   └── SuggestedThemeSidePanel.tsx
│   └── onboarding/
│       ├── OnboardingWizard.tsx
│       └── OnboardingCard.tsx
```

### Contrato de URL + state

| Sub-path | View | Query params suportados | RF |
|---|---|---|---|
| `/estudos` | `Dashboard` (alias canonical) | (nenhum) | RF-02 |
| `/estudos/dashboard` | `Dashboard` | (nenhum) | RF-02 |
| `/estudos/temas` | `ThemesView` | `?fromStats=leaks`, `?q=<text>`, `?sort=lastVisited\|name` | RF-03 |
| `/estudos/temas/:themeId` | `ThemeDetail` | `?tab=<tabId>` | (existente) |
| `/estudos/stats` | `StatsView` (wrapper) | (delegado a `StatsAnalyzerTab`) | RF-04 |
| `/estudos/spots` | `SpotsView` | `?showAll=1` (incluir vinculados) | RF-05 |
| `/estudos/recomendacoes` | `RecommendationsView` | `?type=leak\|stale_spot\|dormant_theme\|all` | RF-06 |
| `/estudos/foo` (qualquer outro) | redirect → `/estudos/dashboard` | — | RF-01 |

### Sidebar items (ordem fixa)

```ts
export const STUDIES_NAV_ITEMS = [
  { id: 'dashboard',     label: 'Dashboard',     path: '/estudos/dashboard',     icon: Home },
  { id: 'temas',         label: 'Temas',         path: '/estudos/temas',         icon: BookOpen },
  { id: 'stats',         label: 'Stats',         path: '/estudos/stats',         icon: BarChart3 },
  { id: 'spots',         label: 'Spots',         path: '/estudos/spots',         icon: ImageIcon },
  { id: 'recomendacoes', label: 'Recomendacoes', path: '/estudos/recomendacoes', icon: Sparkles },
];
```

Bottom-nav usa o mesmo array, renderiza so o icone (height 64px,
tap-target >=44x44 conforme WCAG 2.5.5).

### Active state detection

```ts
const [location] = useLocation(); // wouter
const activeId = STUDIES_NAV_ITEMS.find(item => location.startsWith(item.path))?.id ?? 'dashboard';
```

`startsWith` (nao `===`) garante que `/estudos/temas/<themeId>` ainda
destaca "Temas".

### Cmd+K listener lifecycle

```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setPaletteOpen(true);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

Listener so existe enquanto `StudiesLayout` esta montado — sair de
`/estudos/*` desmonta layout, listener removido. Nao polui resto do app.

### Cache TanStack continuity

- `StudiesLayout` mount = TanStack Query providers ja existem em
  `App.tsx`; `StudiesLayout` apenas consome. Trocar entre views nao
  desmonta o `QueryClientProvider`, queries permanecem em cache.
- Cada view tem seu proprio `useQuery` com `queryKey` estavel:
  - `['study', 'themes', userId]`
  - `['study', 'recommendations', userId]`
  - `['study', 'streak', userId]`
- `staleTime` por view (ver ADR-068 para recomendacoes: 5min).

### Sess 3 isolation contract (RF-04)

```tsx
// StatsView.tsx — APENAS esse arquivo na rota /estudos/stats
function StatsView() {
  return (
    <div className="space-y-4">
      <Breadcrumb>Studies › Stats Analyzer</Breadcrumb>
      <SuggestThemesFromLeaksButton />     {/* RF-04 botao desabilitado se leaks=[] */}
      <StatsAnalyzerTab />                  {/* INTACTO — sem props customizadas */}
    </div>
  );
}
```

`StatsAnalyzerTab` nao recebe props novas. O wrapper apenas envolve.
Snapshot tests existentes do `StatsAnalyzerTab` continuam passando
identicos.

## Consequencias

### Positivas

- **URL linkavel:** Coach (RF-07), share futuro, browser bookmarks.
- **Refresh resilience:** F5 em `/estudos/temas?fromStats=leaks` mantem view + filtro.
- **Cache continuo:** TanStack Query nao re-fetch ao trocar view (lesson #12).
- **Sess 3 desacoplada:** zero modificacao em `StatsAnalyzerTab` e arvore (criterio aceite global #4).
- **Mobile UX padrao mercado:** bottom-nav 5 items e ergonomia testada (Instagram, Twitter, Spotify).
- **Sidebar escalavel:** adicionar 6a view = 1 item no array `STUDIES_NAV_ITEMS`.
- **Cmd+K scoping correto:** listener so vive em `/estudos/*`.
- **Streak/Onboarding mountpoint estavel:** zero duplicacao.

### Negativas

- **Refactor maior em `Studies.tsx`:** vira shell de 10 linhas. Componentes
  existentes (`PendingSpotsTab`, etc) sao re-organizados como sub-secoes,
  nao re-escritos.
- **`useMediaQuery` flash de layout:** mitigado com CSS (`hidden md:block` /
  `block md:hidden`) — ambos os mountpoints renderizam sempre, CSS esconde.
- **Catch-all redirect** para `/estudos/foo` precisa testar (lesson #9 —
  logar antes de redirect).

### Neutras

- **Subagentes (test-writer, implementer):** usam essa ADR + spec como
  fonte de verdade do roteamento. Sem ambiguidade.
- **Reviewer R3:** verifica diff em arquivos da Sess 3 (deve ser ZERO
  alem do `StatsView.tsx`).

## Telemetria

Eventos disparados pelo `StudiesLayout` / sidebar:

- `studies.nav_clicked` — `{ from_view, to_view }`
- `studies.cmdk_opened` — `{ from_view }` (RF-09)
- `studies.deep_linked` — `{ source: 'coach'|'external'|'refresh', view }`

## Migracao de codigo existente

| Codigo atual | Destino | Acao |
|---|---|---|
| `Studies.tsx` mini-dashboard (linhas 320-355) | `dashboard/WeekInsights.tsx` + `StudyStreakBadge.tsx` | mover + estender |
| `Studies.tsx` "Sugerido para voce" (357-414) | `dashboard/RecommendationsPreview.tsx` | mover + consumir RF-06 endpoint |
| `Studies.tsx` templates (416-461) | `ThemesView.tsx` (collapsed por default) | mover; comportamento auto-collapse preservado |
| `Studies.tsx` `<PendingSpotsTab />` (470) | `dashboard/PendingSpotsPreview.tsx` (top 3) + `SpotsView.tsx` (full list) | split |
| `Studies.tsx` grid de temas | `ThemesView.tsx` | mover |
| `Studies.tsx` Stats Tab | `StatsView.tsx` (wrapper) | wrap intocado |

## Confianca

**Alta** — Pattern (sidebar + sub-routes) e padrao da industria (GTOWizard,
Linear, Notion, Run It Once). Wouter + TanStack Query ja em producao.
Bottom-nav mobile e padrao iOS/Android Material. Risco principal e flash
de layout em transicao breakpoint, mitigado com CSS-only display toggle.

## Notas para subagentes seguintes

- **test-writer:** RF-01 deve cobrir os 10 criterios de aceite. Mocks
  obrigatorios: `useLocation`, `matchMedia`. `data-testid` estavel:
  `studies-nav-sidebar`, `studies-nav-item-{view}`, `studies-bottom-nav`,
  `studies-layout-main`. Lesson #2.
- **implementer:** comecar por `StudiesLayout` + `StudiesNavSidebar` +
  `StudiesBottomNav` (RF-01 sem dependencias). Depois views uma a uma.
  Manter `Studies.tsx` antigo funcional ate `StudiesLayout` estar pronto
  (feature-flag opcional ou substituicao direta apos green phase).
- **reviewer:** verificar zero diff em arquivos da Sess 3 (`StatsAnalyzerTab*`,
  `Hud*`, `Snapshot*`, `StatsSnapshot*`, `StatsWizard*`, `templates/`).

---

*ADR gerado pelo system-architect em 2026-05-01 como parte da Fase 3 da Sprint Studies-Reform.*
