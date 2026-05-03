# Spec: Home Reform Onda 3 (home-reform-3)

## Status
Proposta — aguardando aprovacao founder antes do system-architect.

## 1. Resumo

Sprint UNIFICADO de UX/UI da pagina Inicial (`/`, `Home.tsx`). Consolida:

- **Bloco A — Zoning + Foundation:** reduz logo header, adiciona cumprimento contextual, reorganiza 14 cards empilhados em 4 zonas semanticas (`Hoje | Acao Imediata | Performance | Sinal Externo`), torna `StatusStrip` sticky, adiciona sparklines a Banca/ROI 30d e introduz `EmptyPerformanceCluster` agregado.
- **Bloco B — News Consolidation:** substitui as 5 secoes empilhadas (`<NewsSection>` x5 dentro de `NewsSlot`) por **1 feed unico ranqueado** com filter chips, item hero + 9 compactos, read-state local, badge de refresh unico, prioridade de categorias revisada e labels padronizadas.
- **Bloco C — Quick Wins:** fix link KPI "Hoje" em `StatusStrip`, destaque visual no `TournamentRecommendationCard` (score + grade S) e badge "Ja na grade".

Sprint **frontend-pesado** com 1 endpoint backend novo (`GET /api/news/feed`) e 1 hook + 1 componente novos por bloco. Zero migration. Reaproveita schema existente, payload `/api/home/overview` permanece estavel (Bloco A consome o que ja existe; Bloco B troca chamadas /api/news?type por novo /api/news/feed).

---

## 2. Objetivo + JTBD

### Objetivo
Aumentar densidade informacional util e reduzir scroll/tempo-ate-acao do jogador profissional MTT na Home, sem quebrar autonomia (cards de Performance Onda 2 escondidos quando ainda nao ha massa critica de dados).

### JTBD (Jobs-To-Be-Done) cobertos
1. **"Quando entro na Home logo apos acordar, quero ver imediatamente o que tenho hoje (banca/grade/proximo torneio) sem scroll."** — Resolvido por Zona 1 + StatusStrip sticky + cumprimento.
2. **"Quando termino sessao, quero ver o que falta processar (maos pendentes, conteudos parados, sugestoes proximas) num bloco so."** — Zona 2.
3. **"Quero entender minha performance recente sem ser bombardeado de cards vazios quando ainda nao tenho 30 sessoes."** — `EmptyPerformanceCluster` em Zona 3.
4. **"Quero acompanhar mercado/fofocas/resultados num feed unico curado, nao 5 listinhas separadas."** — Bloco B.
5. **"Quero saber o que ja li e o que e novo entre visitas."** — Read-state localStorage (RF-B4).

---

## 3. Defaults aceitos (auto mode)

| Decisao | Default | Justificativa |
|---|---|---|
| Cumprimento timezone | `users.timezone` (default `America/Sao_Paulo`) | Schema ja tem campo desde Onda 2. Mesmo helper. |
| Saudacao por hora | `< 12: Bom dia / 12-18: Boa tarde / >= 18: Boa noite` | Convencao PT-BR. Computado client-side com `Date()` e timezone do user. |
| StatusStrip sticky offset | `top: 0; z-30; backdrop-blur-sm; bg-background/85` | Header foi reduzido (Bloco A1); strip cabe no top sem competir com sidebar. |
| Sparkline render | Recharts `<LineChart>` 60x20px sem axes/tooltip, `strokeWidth=1.5` | Recharts ja em deps. Sem deps novas. |
| Sparkline color | `emerald-500` se delta>=0, `rose-500` se delta<0, `zinc-500` se delta=null | Compativel com regra "amber/red so quando ha problema acionavel" (delta negativo de banca/ROI E acionavel). |
| EmptyPerformanceCluster threshold | Esconder grupo apenas se `topDeltas==[]` AND `variance==null` AND `tournamentRecommendations==[]` AND `heuristics==[]`. Caso contrario, render normal. | Evita falso-positivo: cluster oculto so quando tudo esta vazio. |
| EmptyPerformanceCluster mensagem | `"Insights de performance liberados apos 30 sessoes (atual: X). Continue grindando."` onde X=`lifetime.totalSessions` | Numero acionavel, linguagem alinhada com tom Onda 1. |
| News feed limit | Top 10 globais ranqueados | Espec do bloco. |
| News feed ranking | `score = engagement_norm * 0.6 + recency_norm * 0.4`, tiebreak = ordem de prioridade categoria (RF-B6) | Recencia em horas via `publishedAt`; engagement_norm = log1p(views+likes*5+comments*10) normalizado por max do batch. |
| News default category filter | "Todas" (toggle) | Default amplo. |
| News read-state TTL | 90 dias (limpeza no client se localStorage > 200 entries) | Evita crescimento ilimitado. |
| News refresh badge | "Atualizado seg 12:00 BRT - Proxima em Xd Yh" computado client-side | Cron roda segunda 12h BRT (ADR-106). |
| ExternalLink icon | `lucide-react ExternalLink w-3 h-3 ml-1 opacity-50` | lucide-react ja em deps (NewsSlot atual usa `Settings`). |
| PlatformChips collapse | `+N` quando `platforms.length > 3`; clique expande inline | Densidade. Sem dialog. |
| Zona 4 NewsFeed condicional | Renderiza componente sempre. Componente decide internamente render vs `EmptyNewsState`. | Mantem layout estavel. |
| Tournament card grade S styling | `bg-gradient-to-br from-emerald-500/10 to-emerald-300/5 border-emerald-500/40` | Grade S = oportunidade rara, merece destaque visual. |
| Tournament card badge "Ja na grade" | `Badge variant=outline` texto `Ja na grade` quando `alreadyInGrid===true` | Reutiliza `Badge` do shadcn. |
| Endpoint /api/news/feed cache | `staleTime: 5min` client + cache server in-memory 5min per-userId | Alinhado com cron semanal. Reutiliza padrao Onda 2. |

---

## 4. Usuarios

- **Jogador MTT profissional/semi-pro logado (`userState=power`):** consumidor primario. Ve Home completa com 4 zonas + News feed.
- **Jogador novo (`userState=empty`):** continua vendo `EmptyHomeOnboarding` (sem mudancas neste sprint). Bloco A so afeta `power`.
- **Admin/founder:** sem mudancas; gear de news preferences continua disponivel (Bloco B preserva).

---

## 5. Requisitos Funcionais

### Bloco A - Zoning + Foundation

#### RF-A1 - Header reduzido + cumprimento contextual

**Descricao:** Substituir bloco `<HeaderLogo h-20 md:h-28>` centralizado por linha `flex items-center gap-3` esquerda-alinhada com logo `h-10 md:h-12` + saudacao.

**Layout esperado:**
```
[Logo h-10] [h1 "Bom dia, Ricardo"]
            [p meta: "sabado, 03/05 - 12d streak - America/Sao_Paulo"]
```

**Regras de negocio:**
- `firstName` = primeira palavra de `user.name` (fallback `"jogador"` se nome vazio).
- Saudacao baseada em hora local do usuario (timezone do server payload `meta.userTimezone`; se ausente, `Intl.DateTimeFormat().resolvedOptions().timeZone`).
- `weekday` em PT-BR (`segunda | terca | quarta | quinta | sexta | sabado | domingo`).
- `dd/mm` formato curto.
- `streakDays` vem de `data.lifetime.currentStreakDays`. Suprimir totalmente se `streakDays === 0`.
- Timezone abreviado quando seguro (`America/Sao_Paulo`); senao mostrar string completa.

**Criterios de aceitacao:**
- [ ] Logo renderiza com classes `h-10 md:h-12 w-auto object-contain`.
- [ ] Container `flex items-center gap-3 pt-2 pb-2` esquerda-alinhado (sem `justify-center`).
- [ ] `<h1>` com texto `"Bom dia, {firstName}"` (ou "Boa tarde", "Boa noite") e classes `text-xl md:text-2xl font-semibold`.
- [ ] `<p>` meta com classes `text-xs text-muted-foreground` contendo weekday, dd/mm e (se aplicavel) streak.
- [ ] Streak de 0 nao aparece no DOM (sem `0d streak`).
- [ ] data-testid `home-header-greeting` no h1, `home-header-meta` no p.

#### RF-A2 - 4 zonas semanticas

**Descricao:** Reorganizar conteudo principal em 4 `<section>` com headings sutis. Eliminar mistura cronologica/topicana atual.

**Composicao:**
| Zona | Heading | Componentes |
|---|---|---|
| 1 | `Hoje` | `DailyInsight`, `TodayCard` (md:col-span-2) + `NextTournamentCountdown` lado a lado |
| 2 | `Acao Imediata` | `PendingHandsList`, `LibraryResume`, `TournamentRecommendations` (md:col-span-2) + `HeuristicsCard` |
| 3 | `Performance` | `PerformanceMini`, `StatsTopDeltas` + `VarianceCard` (grid-2), `LifetimeStats`, `RecentSessionsList` |
| 4 | `Sinal Externo` | `NewsFeed` (substitui `NewsSlot`) |

**Regras de negocio:**
- Cada `<section>` recebe `data-testid="home-zone-{N}"` e contem `<h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">{label}</h2>`.
- Espacamento entre zonas: `space-y-6` no wrapper. Espacamento intra-zona: `space-y-3`.
- `FlightBanner` e `CooldownBanner` ficam ACIMA das zonas (preservar prioridade D9 da Onda 1). `StatusStrip` continua acima das zonas, abaixo dos banners.
- Banners de cooldown/flight nao contam em zona (sao alertas globais).

**Criterios de aceitacao:**
- [ ] Existem exatamente 4 elementos `<section data-testid="home-zone-N">` (N = 1..4) em `userState=power`.
- [ ] Cada section comeca com `<h2>` contendo label correto (`Hoje`, `Acao Imediata`, `Performance`, `Sinal Externo`).
- [ ] Ordem dos componentes dentro de cada zona corresponde a tabela acima.
- [ ] Componentes que nao recebem data util mantem sua propria logica de empty state (zona nao decide isso, exceto Performance via RF-A5).
- [ ] Snapshot DOM teste valida hierarquia: `header > banners > StatusStrip > section[1..4] > Footer`.

#### RF-A3 - StatusStrip sticky

**Descricao:** Tornar `StatusStrip` fixo no topo da viewport ao scrollar.

**Regras:**
- `position: sticky; top: 0; z-index: 30`.
- `backdrop-filter: blur(4px)` (Tailwind `backdrop-blur-sm`).
- Background `bg-background/85` para legibilidade sobre conteudo.
- Border bottom sutil `border-b border-border/40` aparece apenas quando scroll > 0 (CSS shadow ou JS scroll listener).
- Em mobile (`<md`), strip mantem comportamento sticky (founder usa pouco mobile mas nao deve quebrar).

**Criterios de aceitacao:**
- [ ] StatusStrip wrapper tem classes `sticky top-0 z-30 backdrop-blur-sm bg-background/85`.
- [ ] Scroll-test (e2e ou jsdom mock) confirma que strip permanece visible ao scroll de 1000px.
- [ ] Performance: durante scroll continuo (60s), nenhum re-render do StatusStrip alem dos disparados pelo TanStack Query.
- [ ] Lighthouse / manual: 60fps em scroll (sem layout shift).

#### RF-A4 - Sparklines em Banca + ROI 30d

**Descricao:** Adicionar mini-grafico Recharts ao lado dos KPIs Banca e ROI 30d no `StatusStrip`.

**Dados:**
- Banca usa `data.statusStrip.banca.sparkline: number[]` (ja existe no payload).
- ROI 30d usa `data.statusStrip.roi30d.sparkline: number[]` (ja existe).

**Regras:**
- Render apenas se array tem `length >= 3` (senao nao renderiza grafico).
- Tamanho fixo `60x20` px, `strokeWidth=1.5`, sem axes/tooltip/legend.
- Cor:
  - Banca: emerald se `deltaPct7d >= 0`, rose se `< 0`, zinc se `null`.
  - ROI 30d: emerald se valor positivo, rose se negativo, zinc se zero.
- Posicao: lado direito do KPI atual, dentro do mesmo card; nao quebrar layout em mobile.

**Criterios de aceitacao:**
- [ ] Sparkline Banca renderiza quando `banca.sparkline.length >= 3` (data-testid `statusstrip-sparkline-banca`).
- [ ] Sparkline ROI renderiza quando `roi30d.sparkline.length >= 3` (data-testid `statusstrip-sparkline-roi`).
- [ ] Cor segue regra emerald/rose/zinc conforme delta.
- [ ] Nao renderiza nada quando `sparkline.length < 3`.
- [ ] Bundle size delta < 5KB gz (Recharts ja importado em outras paginas, tree-shake reaproveitado).

#### RF-A5 - EmptyPerformanceCluster agregado

**Descricao:** Substituir 4 cards Onda 2 vazios por 1 placeholder consolidado quando todos estao empty.

**Regra de ativacao:**
```ts
const empty =
  (data.topDeltas ?? []).length === 0 &&
  data.variance == null &&
  (data.tournamentRecommendations ?? []).length === 0 &&
  (data.heuristics ?? []).length === 0;
```

**Componente:**
- `<EmptyPerformanceCluster sessionsCount={data.lifetime.totalSessions} />`
- Card unico com headline + sub + icon, ocupa `grid-cols-1 md:grid-cols-2` ou `md:col-span-2` dentro da Zona 3.
- Mensagem: `Insights de performance liberados apos 30 sessoes`. Sub: `Atual: {sessionsCount} sessoes. Continue grindando.`
- Quando `sessionsCount >= 30 && empty`: mensagem alternativa `Sem sinal forte ainda. Volte apos sua proxima sessao.`

**Criterios de aceitacao:**
- [ ] Quando todos 4 vazios + sessionsCount<30: renderiza apenas `<EmptyPerformanceCluster>` no lugar dos 4 cards (StatsTopDeltas, VarianceCard, TournamentRecommendations, HeuristicsCard).
- [ ] Quando >=1 dos 4 tem dado: renderiza grid normal e NAO renderiza EmptyPerformanceCluster.
- [ ] data-testid `home-empty-performance-cluster`.
- [ ] PerformanceMini, LifetimeStats, RecentSessionsList NAO sao afetados (continuam render).

---

### Bloco B - News Consolidation

#### RF-B1 - NewsFeed unico com filter chips

**Descricao:** Criar componente `<NewsFeed>` em `client/src/components/home/NewsFeed.tsx` substituindo `<NewsSlot>` no Home.

**Layout:**
```
[Header: "Sinal Externo" h2 + RefreshBadge + Gear]
[Filter chips: Todas | Tools | Sites | Studies | Resultados | Fofocas]
[Hero card #1 (full-width)]
[Compact list #2..#10]
```

**Regras:**
- Filter chips renderizadas inline (estado local `filter: NewsCategory | 'all'`, default `'all'`).
- Items sao filtrados client-side a partir do top 10 retornado pelo backend (servidor ja faz ranking + truncate).
- Categoria `all` mostra os 10 ranqueados; outras filtram pelo `source`.
- Quando filter != all e nao ha items dessa categoria: mostra `<EmptyCategoryState category={filter} />` com CTA "Ver todas" que volta para `all`.
- Componente NEW substitui chamada `<NewsSlot />` em Home.tsx Zona 4.
- `<NewsSlot>` legacy continua exportado (preserva back-compat ADR-100 testes Onda 1) mas nao e mais usado em Home.

**Criterios de aceitacao:**
- [ ] data-testid `home-news-feed` no wrapper.
- [ ] data-testid `news-filter-chip-{all|tools|sites|studies|tournament-results|gossip}` em cada chip.
- [ ] Chip ativo aplica `bg-poker-accent text-black border-poker-accent` (mesmo padrao PlatformChips atual).
- [ ] Filtro client-side: clicar chip "Tools" oculta items com `source != 'tools'`.
- [ ] Empty state por categoria com CTA "Ver todas" funciona.

#### RF-B2 - Endpoint GET /api/news/feed (ranking server-side)

**Descricao:** Novo endpoint backend que retorna top 10 items ranqueados pelo provider score, respeitando `userPrefs` do usuario.

**Contract:**
```ts
// GET /api/news/feed
// Auth: requireAuth (JWT)
// Response 200:
{
  enabled: boolean;       // NEWS_FEED_ENABLED && pelo menos 1 categoria habilitada
  items: NewsItem[];      // top 10 ja ranqueados
  cachedAt: string;       // ISO
  nextRefreshAt: string;  // ISO (proxima segunda 12:00 BRT)
}
```

**Regras de negocio:**
- Reutiliza `storage.listNewsItems` mas SEM filtro de categoria (busca todas), aplicando `pref.enabled === true && allowedSourceIds.length > 0` para cada categoria do user.
- Score: `score = engagement_norm * 0.6 + recency_norm * 0.4`.
  - `engagement_norm` = `log1p(views + likes*5 + comments*10) / log1p(maxBatch)` (normalizado pelo maior do batch; se max=0, zero).
  - `recency_norm` = `1 - clamp((now - publishedAt) / (7d), 0, 1)`.
- Tiebreak: ordem fixa de categoria conforme RF-B6.
- Rate limit: reutiliza `newsReadLimiter` ja existente (60/min).
- Cache server in-memory por userId: 5min TTL.
- Cache-Control: `private, max-age=60`.
- Quando `NEWS_FEED_ENABLED=false`: retorna `{ enabled: false, items: [], cachedAt: now, nextRefreshAt: now }`.

**Criterios de aceitacao:**
- [ ] Endpoint registrado em `server/routes/news.ts`.
- [ ] Retorna 401 sem auth.
- [ ] Retorna `enabled: false` quando flag desligada.
- [ ] Items ordenados por score desc com tiebreak por ordem de categoria.
- [ ] Limite 10 sempre respeitado (ainda que user tenha 50+ items elegiveis).
- [ ] Endpoints atuais `/api/news?type=X` MANTIDOS (back-compat para Onda 3.5 `/noticias`).

#### RF-B3 - Hero card + lista compacta

**Descricao:** Item #1 destacado + items #2-10 em lista densa.

**Hero (#1):**
- `thumbnailUrl` em `aspect-video w-full` quando presente; fallback gradient com platform icon.
- Titulo `<h3 className="text-base font-semibold line-clamp-2">`.
- Summary `<p className="text-sm line-clamp-2 text-muted-foreground">`.
- Engagement badge (likes/views) abaixo.
- Categoria badge no canto superior direito (`Tools`, `Sites`, etc).
- `<a>` envolve o card inteiro com `target="_blank" rel="noopener noreferrer"`.

**Compact (#2..#10):**
- Linha horizontal: `[ordinal mono #2] [thumbnail 48x48 ou platform-icon] [titulo line-clamp-1 + summary line-clamp-1]`.
- Border-bottom entre items.
- Hover bg sutil.

**Criterios de aceitacao:**
- [ ] Item index 0 renderizado como hero (data-testid `news-feed-hero`).
- [ ] Items 1..9 renderizados como compact (data-testid `news-feed-item-{index}`).
- [ ] Ordinal `#2..#10` em fonte mono (`font-mono text-xs`).
- [ ] Thumbnail 48x48 em compacto; fallback `<div className="w-12 h-12 bg-muted rounded">` com icon central.
- [ ] Lista nunca passa de 10.

#### RF-B4 - Read-state localStorage

**Descricao:** Items lidos ficam visualmente "consumidos" e persistem entre visitas.

**Regras:**
- Key: `news.read.{itemId}` valor `"1"` (timestamp opcional como JSON `{ readAt: ISO }`).
- Marca como lido em `onClick` no link do item.
- Visual: `opacity-60` no card + checkmark `<Check className="w-3 h-3">` no canto superior direito.
- Hook custom `useNewsReadState()` retorna `{ isRead(id), markRead(id), unreadCount(items) }`.
- Limpeza: hook varre localStorage no mount e remove entries `> 90 dias` ou se total > 200 (evita bloat).
- Polyfill localStorage compativel com testes node (lessons-learned #15).

**Criterios de aceitacao:**
- [ ] Click em item adiciona `news.read.{id}` no localStorage.
- [ ] Render seguinte aplica `opacity-60` + checkmark.
- [ ] Hook expoe `unreadCount`; pode ser usado pelo header (numero futuro).
- [ ] Limpeza automatica em mount remove keys > 90 dias.
- [ ] Funciona em ambiente SSR/jsdom sem crash quando localStorage indisponivel.

#### RF-B5 - REFRESH_BADGE unico no header do feed

**Descricao:** Substituir 5 badges (1 por categoria, atual) por 1 unico no header do `NewsFeed`.

**Texto:**
- Quando `nextRefreshAt > now`: `Atualizado seg 12:00 BRT - Proxima em Xd Yh` (X=dias, Y=horas).
- Quando `nextRefreshAt <= now`: `Atualizado seg 12:00 BRT - Atualizando em breve`.

**Regras:**
- Computado client-side a partir do `cachedAt` e `nextRefreshAt` retornados pelo `/api/news/feed`.
- Tooltip ao hover: `Cron semanal segunda 12:00 BRT (ADR-106).`

**Criterios de aceitacao:**
- [ ] data-testid `news-feed-refresh-badge`.
- [ ] Apenas 1 badge no DOM (nao mais 5).
- [ ] Texto atualiza quando `cachedAt` muda.
- [ ] Tooltip acessivel via aria-label.

#### RF-B6 - Reordenar prioridade de categorias

**Descricao:** Filter chips e tiebreak do ranking server-side seguem ordem fixa: `tools > sites > studies > tournament-results > gossip`.

**Regras:**
- Constante exportada em `shared/types/news.ts`:
```ts
export const NEWS_CATEGORY_PRIORITY: NewsCategory[] = [
  'tools', 'sites', 'studies', 'tournament-results', 'gossip'
];
```
- Filter chips renderizam nessa ordem (apos chip "Todas").
- Tiebreak: items com mesmo score ordenam por `NEWS_CATEGORY_PRIORITY.indexOf(item.source)` ASC.

**Criterios de aceitacao:**
- [ ] Constante exportada e importavel.
- [ ] Order dos chips no DOM bate com a constante.
- [ ] Test ranking: 2 items com score igual respeitam prioridade.

#### RF-B7 - CATEGORY_LABELS unico

**Descricao:** Substituir `SECTION_LABELS` espalhados em `NewsSlot.tsx` e duplicacoes por uma constante unica em `shared/types/news.ts`.

**Constante:**
```ts
export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  'tools': 'Tools',
  'sites': 'Sites',
  'studies': 'Studies',
  'tournament-results': 'Resultados',
  'gossip': 'Fofocas',
  'market': 'Mercado',                // legacy compat
  'reserved-future': 'Reservado',     // legacy compat
  'poker-software': 'Mercado',        // legacy compat
};
```

**Regras:**
- `NewsFeed`, `NewsPreferencesDialog`, `NewsSlot` (legacy) consomem dessa fonte unica.
- Labels acima sao em PT-BR para chips visiveis ao user.
- Manter aliases legacy (`market`, `reserved-future`, `poker-software`) sem quebrar testes Onda 1.

**Criterios de aceitacao:**
- [ ] Constante exportada de `shared/types/news.ts`.
- [ ] `NewsSlot.tsx` antigo passa a importar daqui (zero duplicacao).
- [ ] Grep por `'Ferramentas / Software'` retorna 0 ocorrencias fora do shared.

#### RF-B8 - Icone ExternalLink

**Descricao:** Adicionar icone `<ExternalLink>` apos titulo de cada item (hero e compact).

**Regras:**
- `<ExternalLink className="w-3 h-3 inline ml-1 opacity-50" aria-hidden />` apos texto do titulo.
- Reforco visual de que click abre nova aba; ja temos `target="_blank"`.

**Criterios de aceitacao:**
- [ ] Icone presente em hero (data-testid `news-feed-hero-extlink`).
- [ ] Icone presente em cada compact item.
- [ ] `aria-hidden="true"` (icone decorativo; texto + target_blank ja indicam acao).

#### RF-B9 - Empty state agregado do feed

**Descricao:** Quando user desativou todas categorias OR `items.length === 0`, mostrar 1 placeholder unico com CTA.

**Regras:**
- Placeholder substitui chips + lista quando empty.
- Mensagem: `Voce ainda nao habilitou nenhuma fonte de noticias.` (caso prefs todas off) ou `Sem noticias novas no momento.` (caso enabled mas itens vazios).
- CTA: botao secundario `Ativar categorias` que abre `NewsPreferencesDialog` no modo overview (nao categoria especifica).

**Criterios de aceitacao:**
- [ ] data-testid `home-news-feed-empty`.
- [ ] Botao CTA tem data-testid `news-feed-empty-cta` e abre dialog.
- [ ] Mensagem alterna entre "nao habilitou" e "sem novas".

#### RF-B10 - PlatformChips collapse

**Descricao:** Quando uma categoria/feed tem mais de 3 platforms detectadas nos items, mostrar `+N` clickable que expande resto inline.

**Regras:**
- Mostra primeiras 3 platforms; resto vira `<button>+{N-3}</button>`.
- Click expande inline (estado local `expanded: boolean`).
- Aplica-se aos chips de plataforma dentro do filtro (nao chips de categoria).

**Criterios de aceitacao:**
- [ ] Quando `platforms.length <= 3`: render todas, sem `+N`.
- [ ] Quando `> 3`: 3 visiveis + `+N`.
- [ ] Click em `+N` expande; click fora ou novo `+N` (toggle) recolhe.

---

### Bloco C - Quick Wins isoladas

#### RF-C1 - Fix link KPI "Hoje" StatusStrip

**Descricao:** O KPI "Hoje" no StatusStrip atualmente linka para `/coach`. Deve linkar para `/grade-planner`.

**Criterios:**
- [ ] `<Link href="/grade-planner">` ao redor do KPI Hoje.
- [ ] Click navega para grade-planner.
- [ ] data-testid `statusstrip-kpi-today` continua linkavel.

#### RF-C2 - (redundante; coberto em RF-B3 numeracao)

Sem trabalho extra. Cobertura via RF-B3.

#### RF-C3 - TournamentRecommendationCard: destaque grade S

**Descricao:** Aplicar visual diferenciado quando `grade === 'S'`.

**Regras:**
- Background: `bg-gradient-to-br from-emerald-500/10 to-emerald-300/5`.
- Border: `border-emerald-500/40`.
- Score em `text-2xl font-bold`.
- Grade badge mantem alinhamento atual.
- Para grades A/B: estilo neutro atual preservado.

**Criterios de aceitacao:**
- [ ] Card com `grade='S'` renderiza com classes do gradient.
- [ ] Card com `grade='A'` ou `'B'` mantem visual atual.
- [ ] Score sempre `text-2xl font-bold`.

#### RF-C4 - TournamentRecommendationCard: badge "Ja na grade"

**Descricao:** Quando `alreadyInGrid === true`, mostrar badge.

**Regras:**
- `<Badge variant="outline">Ja na grade</Badge>` (ou equivalente shadcn).
- Posicao: ao lado do nome do torneio ou abaixo do score.
- Classes: `text-[10px]`.

**Criterios:**
- [ ] Badge renderiza apenas quando `alreadyInGrid===true`.
- [ ] Acessivel via data-testid `tournament-rec-already-in-grid`.

---

## 6. Requisitos Nao-Funcionais

| Categoria | Requisito |
|---|---|
| Performance render | Bloco A nao adiciona custo de render perceptivel; Home continua < 200ms render inicial em mid-tier laptop. NewsFeed render < 100ms (10 items, sem rede). |
| Performance feed render | Render de 10 items + sparklines + sticky no scroll mantem 60fps. Lighthouse Performance >=90 (em ambiente local devtools). |
| Sticky strip | `position: sticky` sem JS scroll handler (usar CSS puro). Border-bottom shadow tolerado via `shadow-sm` quando `data-scrolled` (script global ja existente OU adicionar via IntersectionObserver). |
| Endpoint /api/news/feed | p95 < 300ms para batch <= 200 items elegiveis (computacao em memoria, sem queries adicionais ao DB alem da listNewsItems). |
| Cache | Server cache 5min per-userId; client TanStack staleTime 5min. |
| Acessibilidade AA | Contraste WCAG AA em todas chips/badges/sparklines. Alvos de toque >= 32x32. ARIA labels em chips, gear, ExternalLink. |
| Acessibilidade keyboard | Tab navega chips em ordem; Enter ativa filtro; Esc fecha dialog. |
| Idioma | UI PT-BR; codigo, comments, data-testids EN. |
| Bundle | Sprint nao adiciona dep nova; Recharts ja em deps; lucide-react ja em deps. Alvo delta bundle gz < 8KB. |
| Telemetria | Eventos via `emit()` ja em uso (Sprint home-reform-1). |
| Compat ADRs | Nao quebrar ADRs 099-106. Endpoints `/api/news?type=X` permanecem funcionais. |

---

## 7. Endpoints Previstos

| Metodo | Rota | Status | Descricao | Auth |
|---|---|---|---|---|
| GET | `/api/news/feed` | NOVO | Top 10 items globais ranqueados pelo backend | JWT |
| GET | `/api/news?type=X` | INALTERADO | Compat para Onda 3.5 `/noticias` | JWT |
| GET | `/api/news/preferences` | INALTERADO | Prefs do user | JWT |
| PATCH | `/api/news/preferences` | INALTERADO | Atualiza prefs | JWT |
| GET | `/api/news/sources` | INALTERADO | Catalogo de fontes | JWT |
| POST | `/api/admin/news/refresh` | INALTERADO | Refresh manual | Admin |
| GET | `/api/home/overview` | INALTERADO | Payload Home (ja entrega sparklines, profile, etc) | JWT |

---

## 8. Modelos de Dados Afetados

**Zero migration nova.** Sprint reaproveita schema existente:

- `news_items` (existe) - usado pelo `/api/news/feed`.
- `news_sources` (existe) - tiebreak/catalog.
- `user_news_preferences` (existe) - filtragem por categoria habilitada.
- `users.timezone` (existe) - cumprimento contextual.
- `bankroll_snapshots` (existe) - sparkline Banca (ja consumido em Onda 2).

Constantes novas em `shared/types/news.ts`:
- `NEWS_CATEGORY_PRIORITY: NewsCategory[]`
- `CATEGORY_LABELS: Record<NewsCategory, string>`

---

## 9. Integracoes Externas

| Servico | Propostito | Quando |
|---|---|---|
| xAI Grok (via `grokNewsProvider`) | Provider unico para news items | Apenas no cron `refreshNews` (semanal). Sprint nao toca. |

Sprint **nao** mexe no provider Grok. Apenas adiciona endpoint que consome dados ja persistidos.

---

## 10. Cenarios de Teste Derivados

### Bloco A - Unit + Integration

**Happy path:**
- [ ] Home renderiza header reduzido (h-10 md:h-12) com saudacao "Bom dia/Boa tarde/Boa noite" conforme hora.
- [ ] 4 zonas semanticas renderizam com headings corretos.
- [ ] StatusStrip esta sticky (classes confirmadas).
- [ ] Sparklines renderizam quando array length>=3.

**Casos limite:**
- [ ] streakDays=0 nao aparece no DOM.
- [ ] Saudacao 11:59 = "Bom dia"; 12:00 = "Boa tarde"; 17:59 = "Boa tarde"; 18:00 = "Boa noite".
- [ ] Sparkline com array length<3 nao renderiza nada (ausencia, nao crash).
- [ ] EmptyPerformanceCluster aparece SOMENTE quando 4 fields todos vazios. Com 1 dos 4 nao-vazio, render normal.
- [ ] Lifetime sessions=0 + EmptyPerformanceCluster: mostra "Atual: 0 sessoes".
- [ ] Lifetime sessions=50 + 4 vazios: mostra mensagem alternativa "Sem sinal forte ainda".

**Acessibilidade:**
- [ ] h1, h2 hierarchy preservada (h1 saudacao, h2 zonas).
- [ ] StatusStrip sticky nao rouba foco do teclado.
- [ ] Contrast ratio dos meta text >=4.5:1.

### Bloco B - Unit + Integration

**Happy path:**
- [ ] `GET /api/news/feed` retorna 200 com top 10 ranqueado.
- [ ] Filter "Tools" oculta items com source!='tools'.
- [ ] Hero (#1) renderiza thumbnail full-width.
- [ ] Compact #2-#10 renderizam com ordinal mono.
- [ ] Read-state aplica opacity-60 apos click.

**Casos limite:**
- [ ] User sem nenhuma pref habilitada: feed retorna `enabled:false`, render mostra empty state com CTA.
- [ ] User com prefs mas sem items: render mostra "Sem noticias novas".
- [ ] Filter "Tools" sem items: empty state por categoria com CTA "Ver todas".
- [ ] localStorage indisponivel: hook nao crasha, items aparecem como nao-lidos.
- [ ] localStorage > 200 entries: hook limpa entries antigas no mount.
- [ ] 2 items com score igual: tiebreak por NEWS_CATEGORY_PRIORITY.
- [ ] PlatformChips com 5 platforms: 3 visiveis + `+2` clickable; click expande.

**Backend ranking:**
- [ ] engagement=0 em todos: ranking puro por recencia.
- [ ] todos publishedAt iguais: ranking puro por engagement.
- [ ] item com publishedAt > now (clock skew): clamp recency=1.
- [ ] item com publishedAt > 7d atras: recency=0.
- [ ] limit hard 10 mesmo com 100 items elegiveis.

**Compat:**
- [ ] `/api/news?type=tools` continua funcionando (preserva Onda 3.5).
- [ ] `NewsSlot` legacy (props enabled+items) continua exportado.
- [ ] Testes Onda 1 (news-stub.test) continuam verdes.

**Acessibilidade:**
- [ ] Tab order: chips -> hero -> items 2-10 -> empty CTA.
- [ ] Enter em chip aplica filtro.
- [ ] ExternalLink icon tem `aria-hidden="true"`.
- [ ] Refresh badge tem `aria-label` descritivo.

### Bloco C - Unit

**Happy path:**
- [ ] StatusStrip KPI "Hoje" linka para `/grade-planner` (nao mais `/coach`).
- [ ] TournamentRecommendationCard com grade S aplica gradient emerald.
- [ ] Card com grade A/B: visual atual preservado.
- [ ] Badge "Ja na grade" aparece quando `alreadyInGrid===true`.

**Casos limite:**
- [ ] alreadyInGrid undefined: badge nao aparece (nao false-positive).
- [ ] grade='S' AND alreadyInGrid=true: ambos efeitos visuais aplicam.

### E2E (manual ou Playwright se houver setup)

- [ ] Login -> visita `/` -> ve saudacao com nome -> ve 4 zonas -> ve NewsFeed unificado.
- [ ] Scroll 1500px -> StatusStrip permanece visible no topo, sparkline visivel.
- [ ] Click em item de news -> abre nova aba -> retorna -> item renderiza com opacity-60.
- [ ] Click chip "Tools" -> filtra -> click "Todas" -> volta ao top 10.
- [ ] Desabilita todas prefs -> feed mostra empty state com CTA -> click CTA -> abre dialog -> habilita 1 cat -> volta -> feed renderiza.

### Regressao (smoke critico)

- [ ] Suite home-reform-1 (148 testes) continua verde.
- [ ] Suite home-reform-2 (testes Onda 2) continua verde.
- [ ] Suite news (news-stub.test, news-types.test) continua verde.
- [ ] Build production OK.
- [ ] `npm run check` (tsc) sem erros.

---

## 11. Riscos

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| Sticky StatusStrip causa layout shift em mobile | Media | Medio | CSS-only sticky; testar em iPhone SE viewport. Fallback: `sticky` so em `md:` se quebrar. |
| Recharts sparkline aumenta bundle alem de 5KB | Baixa | Baixo | Recharts ja importado em Dashboard/Bankroll; tree-shake reaproveita. Validar via `vite-bundle-visualizer` ou source-map-explorer. |
| Read-state localStorage corrompe dados antigos | Baixa | Baixo | Hook lida com JSON.parse em try/catch; entries invalidas sao removidas no cleanup. |
| Endpoint /api/news/feed lento em users com >500 items | Baixa | Medio | Limit hard 10 + computacao em memoria O(n log n); scoring O(n). Cache 5min mata maioria. |
| Ranking favorece engagement antigo | Media | Baixo | Recency 40% peso ja amortece; ajustavel via constants se feedback negativo. |
| Hero thumbnail null gera UI quebrada | Media | Baixo | Fallback gradient + platform icon explicito. |
| Filter "Tools" + items[10]=mostly Tools = lista 10 sem filtrar | Baixa | Baixo | Render filtro client-side seguro; quando `<3` items na categoria, mostra empty state per-category. |
| Polyfill localStorage falha em Vitest node env | Media | Medio | Reutilizar `MemoryStorage` ja em `tests/setup.ts` (lessons-learned #15). |
| `vi.mock` hoisting de novos hooks em testes | Media | Medio | Usar `vi.hoisted()` para spies (lessons-learned #14). |
| Endpoint novo quebra rate limit em testes integration | Baixa | Baixo | Reutiliza `newsReadLimiter`; testes mockam ou aumentam window. |

---

## 12. Fora de Escopo

- **Rota `/noticias` standalone** (Onda 3.5). Endpoint `/api/news?type=X` MANTIDO porque sera usado la, mas pagina nova nao entra neste sprint.
- **Side-rail M3** (sidebar de navegacao reformada). Continua na Onda 3.5.
- **Provider Grok** (refresh, scoring, prompts). Sprint nao mexe.
- **Migration nova de schema.** Tudo reaproveitado.
- **Notificacoes push de noticias quentes.** Onda futura.
- **Sharing/embedar de items.** Fora.
- **Saved/favorites de items.** Fora (so read-state simples).
- **i18n alem PT-BR.** Codebase ja e PT-BR-only.
- **Modal/dialog de detalhe do item** (click abre external sempre).
- **Reordenar manualmente cards das zonas** (drag-and-drop). Layout fixo.
- **Personalizacao do cumprimento** (ex: "Bom dia, Campeao"). Padrao apenas.

---

## 13. Dependencias

- ADR-099 (Cockpit) - mantido.
- ADR-100 (News estrutura) - mantido.
- ADR-101 (Sidebar IA) - mantido.
- ADR-102 (Cache strategy) - mantido.
- ADR-106 (Grok integration) - mantido.
- Sprint home-reform-2 (Onda 2) - precisa estar mergeado (ja esta: commit 4eda973).
- `users.timezone` - ja existe.
- `bankroll_snapshots` - ja existe.
- Recharts - ja em deps.
- lucide-react - ja em deps.
- Sprint home-reform-1-5 - ja mergeado.

---

## 14. Estimativa de Esforco

Sprint TDD pipeline completo com auto mode.

| Fase | Esforco | Notas |
|---|---|---|
| pm-spec (esta) | 1h | concluida ao approve |
| system-architect | 1.5h | 1 ADR (107: news-feed-ranking) + diagrama Mermaid (NewsFeed component tree, /api/news/feed flow) |
| test-writer | 4h | ~25-30 testes red phase: NewsFeed (12) + EmptyPerformanceCluster (3) + Header reduzido + saudacao (3) + 4 zones (2) + sticky strip (2) + sparklines (3) + endpoint /api/news/feed (5) + RF-C1/C3/C4 (3) |
| implementer | 6h | Bloco A (1.5h) + Bloco B feed + endpoint (3h) + Bloco C (1h) + ajustes regressao (0.5h) |
| simplify | 0.5h | check de duplicacao pos-impl |
| reviewer | 1h | gate antes de merge |
| TOTAL | ~14h | Caminho critico ~1 sessao auto + 1 manual; folga para regressoes |

**Bundle delta esperado:** < 8KB gz.

**Linhas de codigo esperadas:**
- Backend: ~150 linhas (`server/routes/news.ts` + helper de ranking).
- Frontend: ~600 linhas (NewsFeed + sub-components + EmptyPerformanceCluster + Header + Sparkline wrappers).
- Tests: ~800 linhas.

---

## 15. Telemetria Minima

Eventos via `emit()` (helper ja em uso desde Onda 1):

| Evento | Trigger | Props |
|---|---|---|
| `home_zone_view` | Mount Home com data | `{ zonesRendered: number, emptyPerformanceCluster: boolean }` |
| `home_news_feed_view` | NewsFeed mount com items.length >= 1 | `{ items: number, hasUnread: number }` |
| `home_news_feed_filter_applied` | Click chip != 'all' | `{ filter: NewsCategory, itemsAfterFilter: number }` |
| `home_news_feed_item_click` | Click em qualquer item | `{ id, source, position: number, isRead: boolean }` |
| `home_news_feed_empty_cta` | Click "Ativar categorias" | `{}` |
| `home_status_strip_kpi_click` | Click em KPI (today/banca/roi/pendencias) | `{ kpi: string, target: string }` |
| `home_tournament_rec_card_click` | Click em recommendation card | `{ id, score, grade, alreadyInGrid }` |

Eventos pre-existentes mantidos: `home_view`, `home_profile_detected`.

---

## 16. Notas de Implementacao

- **Componentes novos** previstos:
  - `client/src/components/home/NewsFeed.tsx` (entry)
  - `client/src/components/home/NewsFeedHeroCard.tsx`
  - `client/src/components/home/NewsFeedCompactItem.tsx`
  - `client/src/components/home/EmptyPerformanceCluster.tsx`
  - `client/src/components/home/HomeHeader.tsx` (logo + greeting)
  - `client/src/components/home/Sparkline.tsx` (wrapper Recharts pequeno)
  - `client/src/hooks/useNewsReadState.ts`
- **Backend:**
  - `server/services/newsFeedRanking.ts` (helper puro, testavel isolado).
  - `server/routes/news.ts` ganha handler + registracao.
- **Refatoracao Home.tsx:** wrapper `<HomeCockpit data={...}>` opcional para reduzir tamanho do Home.tsx (decisao defer ao implementer).
- **Lessons-learned aplicaveis (consultar antes):** #1 hooks first, #13 apiRequest retorna JSON, #14 vi.hoisted, #15 polyfill localStorage, #18 evitar `git stash` em meio de TDD.
- **Acessibilidade:** seguir `Docs/conventions/ui-patterns.md` (UI-FND-1) para tokens; usar `tokens.color.neutral` ja consumido.
- **Code style:** EN para codigo/comments, PT-BR para UI strings.

---

## 17. Validacao Final (checklist pre-aprovacao)

- [x] Cada RF tem criterios de aceitacao verificaveis.
- [x] Cenarios de teste cobrem happy path, edge cases e regressoes.
- [x] Secao "Fora de Escopo" preenchida.
- [x] Endpoints listados com metodo/rota/auth/status.
- [x] Telemetria mapeada.
- [x] Riscos documentados com mitigacao.
- [x] Compat ADRs 099-106 explicitada.
- [x] Estimativa por fase.
- [x] Dependencias mapeadas.
- [x] Bundle delta estimado.

---

## 18. Proximo Passo Recomendado

Spec aprovada -> invocar `system-architect` para:
- Criar ADR-107 (news-feed-ranking + zoning), Michael Nygard format.
- Diagrama Mermaid: `NewsFeed` component tree + sequence `Home -> /api/news/feed -> NewsFeed render`.
- Atualizar `data-model-index.md` se necessario (nao deve precisar - reaproveita tabelas).

Depois -> `test-writer` (red phase ~25-30 testes) -> `implementer` (green) -> `simplify` -> `reviewer` -> merge main.
