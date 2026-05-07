# Spec: Sprint Coach Page Reform 1 — Estrutura de abas + quick wins

## Status
Aprovada (founder 2026-05-07 — 3 refinamentos integrados: RF-06 hover timing, RF-05 ordem por popularidade, RF-07 testId alias)

---

## 1. Visão geral + motivação

A página `/coach` (componente `GradePlanner.tsx`) acumulou organicamente quatro responsabilidades distintas (Biblioteca, Grade, Tournament Selector, PrimeDope/Variance) e ainda tem irmã sangrando contexto: a página standalone `/flight` (multi-flight series). O resultado é:

- Hierarquia de abas inconsistente: PrimeDope vive como painel resizable inline, não como aba peer; Flight vive em rota completamente separada do mental model "planejamento".
- Estado UX heterogêneo: PrimeDope tem flag persistida em `localStorage` (`primedope_panel_expanded`) que coexiste com o `react-resizable-panels` vertical, gerando dois mecanismos pra "esconder/mostrar" o mesmo conteúdo.
- Bookmarks de `/flight` espalhados (sidebar item "Flight" linha 93 de `Sidebar.tsx`) versus mental model novo: tudo de **planejar grade pro grind** mora em `/coach`.
- Atrito repetido em deletar torneio na grid: hoje exige 2 cliques (chip → popover → "Remover") OU drag pro lixo embaixo da grid.
- Filtros da Biblioteca são free-form (selects), sem quick-toggle visual de plataforma ou dia da semana — founder reportou friction.

Este sprint **NÃO** refatora conteúdo interno de Selector / PrimeDope / Flight. **Só re-empacota** + adiciona 2 quick wins funcionais (chips Biblioteca + X delete) + banner de "pendentes" para founder marcar o que validar nas próximas reviews.

Sprints futuras (followups) cuidarão de refinements internos de cada aba. Esta spec é fundação visual / de navegação.

---

## 2. Estado atual

### 2.1 Rotas Wouter (`client/src/App.tsx`)
- `Route path="/coach"` → `GradePlanner` (linha 117).
- `Route path="/flight"` → `Flight` (linha 131).
- `Route path="/coach-ai"` → `CoachAI` (linha 129) — **NÃO mexer**.

### 2.2 Estrutura de abas atual em `/coach` (`GradePlanner.tsx:961-1005`)

**Desktop:**
```
┌──────────────────────────────────────────────────────────────┐
│ [Biblioteca + Grade] [Tournament Selector]                   │
├──────────────────────────────────────────────────────────────┤
│ Aba "Biblioteca + Grade":                                    │
│   ┌───────────────┬──────────────────────────────────────┐   │
│   │ BibliotecaPanel│ ┌──────────────────────────────────┐ │   │
│   │ (30% width)   │ │ WeekGrid (60% height)            │ │   │
│   │               │ ├──────────────────────────────────┤ │   │
│   │               │ │ PrimedopePanel (40% height)      │ │   │
│   │               │ │ (resizable + collapse togglavel) │ │   │
│   │               │ └──────────────────────────────────┘ │   │
│   └───────────────┴──────────────────────────────────────┘   │
│                                                              │
│ Aba "Tournament Selector":                                   │
│   <SelectorPanel />                                          │
└──────────────────────────────────────────────────────────────┘
```

**Mobile (`GradePlanner.tsx:936-957`):** abas `Biblioteca | Grade | Selector`.

### 2.3 PrimedopePanel vertical resizable (`GradePlanner.tsx:982-998`)
- Vertical `PanelGroup` dentro da segunda coluna.
- Estado `primedopePanelExpanded` (bool) persistido em `localStorage('primedope_panel_expanded')` (linhas 94-117).
- `togglePrimedopePanel()` callback (linha 105).
- Header da seção em `gradeContent` no bloco `primedopeBlock` (linhas ~895-933) tem botão "Recolher / Expandir" + badge "Beta".

### 2.4 Página /flight (`client/src/pages/Flight.tsx`, 131 linhas)
- Tabs `Pendentes | Concluidas | Canceladas | Todas` (linhas 51-64).
- Botão "Adicionar Series Retroativo" → `<BackfillSeriesDialog>`.
- Lista cards de `tournament_series` via `useQuery(['tournament-series', { status }])`.
- Empty state simples `data-testid="flight-empty-state"`.

### 2.5 Sidebar item /flight (`Sidebar.tsx:93`)
```ts
{ path: '/flight', icon: Layers, label: 'Flight', adminOnly: false }
```
Aparece no grupo "JOGAR" entre "Grind" e o início de "ESTUDAR".

### 2.6 Filtros da Biblioteca (`BibliotecaPanel.tsx:53-65`)
Estado atual:
- `search` (text input)
- `filterType` (single select string)
- `filterSpeed` (single select string)
- `filterSite` (**single select string** — vamos migrar p/ multi)
- `filterCurrency` (single select string)
- `filterMinBuyIn` / `filterMaxBuyIn` (text inputs)
- Toggle `showFilters` (bool)
- `sortMode` (string)

Filtragem aplicada por `filterLibraryTournaments(...)` em `@shared/library-filters`. **Não há filtro por `dayOfWeek`** hoje, embora o campo exista no schema (`tournaments.dayOfWeek`, `shared/schema.ts:2262`).

### 2.7 Delete torneio na grid (`WeekGrid.tsx:360-426`)
Componente `CellChip` envolve `TournamentChip` em `<Popover>`. Click → popover → 2 botões (Editar, Remover). Drag-and-drop para zona de lixo embaixo da grid também funciona. **Não há atalho hover X**.

---

## 3. Estado alvo

### 3.1 Estrutura de abas nova (`/coach`)

**Desktop e Mobile (mesma ordem):**
```
┌────────────────────────────────────────────────────────────────────┐
│ ⚠ Pendentes — analise e teste (banner colapsavel) ▾               │
│   - [ ] Filtros Biblioteca: quick chips plataforma + dia (RF-05)   │
│   - [ ] Grade: hover X delete com 1s protection (RF-06)            │
│   - [ ] Variance Calculator: testar add/remove manual              │
│   - [ ] Variance Calculator: revisar features extras               │
│   - [ ] Tournament Selector: revisar filtros/scoring               │
│   - [ ] Flights: revisar fluxo + UX                                │
│   - [ ] Biblioteca: revisar UX (filtros, sort, empty, cards)       │
│   - [ ] Grade: revisar todas funcoes (drag, copy, settings, comp)  │
├────────────────────────────────────────────────────────────────────┤
│ [Biblioteca + Grade] [Tournament Selector] [Flights] [Variance]    │
├────────────────────────────────────────────────────────────────────┤
│  <conteudo da aba ativa>                                           │
└────────────────────────────────────────────────────────────────────┘
```

Aba ativa default: `Biblioteca + Grade`. Persistida em URL query string (`?tab=planner|selector|flights|variance`).

### 3.2 Aba "Biblioteca + Grade" (mantém split atual MAS sem PrimeDope vertical)

```
┌───────────────┬─────────────────────────────────┐
│ BibliotecaPanel│  WeekGrid (100% height da aba) │
│ (30%)         │  - chips com hover X delete    │
│ + chips quick │    (RF-06)                     │
│   plataforma  │                                │
│ + chips dia   │                                │
│ + filtros adv │                                │
└───────────────┴─────────────────────────────────┘
```

### 3.3 Aba "Variance Calculator"

```
┌────────────────────────────────────────────────┐
│ Variance Calculator (PrimeDope) [Beta]         │
├────────────────────────────────────────────────┤
│ <PrimedopePanel userId={...} bankrollUsd={...}>│
│ (full height da aba, sem botao recolher)       │
└────────────────────────────────────────────────┘
```

### 3.4 Aba "Flights"

Conteúdo migrado integral de `Flight.tsx` (header + tabs internas pendentes/concluidas/canceladas/todas + cards + BackfillSeriesDialog), empacotado em novo componente `FlightsPanel.tsx`.

### 3.5 Banner de pendências
- Posição: topo da página, ABAIXO do header global (`Header` component) e ACIMA do TabsList.
- Default: expandido na primeira render. Persistir colapso em `localStorage('coach_pending_banner_collapsed')`.
- Cor: warning / amber tones (não destrutivo).
- Cada item linkável via âncora ou click (scroll/jump pra aba correspondente).

---

## 4. Requisitos Funcionais

### RF-01 — Reestruturar abas /coach

**Descrição:** Substituir o `<Tabs defaultValue="planner">` atual em `GradePlanner.tsx` por novo `<Tabs>` controlado via URL query string com 4 abas.

**Regras de negócio:**
- Abas nesta ordem (desktop e mobile): `Biblioteca + Grade` → `Tournament Selector` → `Flights` → `Variance Calculator`.
- Slugs URL: `planner`, `selector`, `flights`, `variance`.
- Default (sem `?tab=`): `planner`.
- Trocar aba atualiza URL via `history.replaceState` (não polui histórico de navegação a cada click).
- Refresh da página com `?tab=variance` deve reabrir na aba Variance Calculator.
- Mobile mantém mesmo conjunto e ordem de abas (sem condicional `isMobile` removendo abas).
- Implementar hook reutilizável `useTabFromUrl(validTabs: string[], defaultTab: string)` em `client/src/hooks/useTabFromUrl.ts`. Hook devolve `[activeTab, setActiveTab]` e sincroniza com `?tab=`.

**Critério de aceitação:**
- [ ] `/coach` abre na aba `planner` por default.
- [ ] `/coach?tab=selector` abre direto em Tournament Selector.
- [ ] `/coach?tab=flights` abre direto em Flights.
- [ ] `/coach?tab=variance` abre direto em Variance Calculator.
- [ ] `/coach?tab=invalid` cai no default (`planner`) e atualiza URL para limpar param inválido.
- [ ] Click numa aba muda `?tab=...` sem disparar full reload.
- [ ] data-testid em cada `TabsTrigger`: `coach-tab-planner`, `coach-tab-selector`, `coach-tab-flights`, `coach-tab-variance`.
- [ ] Botão back do navegador não cria histórico de cada toggle (usar `replaceState`).

---

### RF-02 — Remover página standalone `/flight` + redirect

**Descrição:** Mover conteúdo de `/flight` para aba "Flights" dentro de `/coach`. Remover rota standalone. Adicionar redirect `/flight → /coach?tab=flights` para preservar bookmarks.

**Regras de negócio:**
- Extrair JSX de `client/src/pages/Flight.tsx` em novo componente `client/src/components/grade-planner/FlightsPanel.tsx`. Componente:
  - Recebe zero props (auto-suficiente, mantém useState próprio para activeTab interno e backfillOpen).
  - Mantém todos os `data-testid` originais (`flight-page-header`, `flight-page-backfill-btn`, `flight-tab-pending`, `flight-tab-completed`, `flight-tab-cancelled`, `flight-tab-all`, `flight-empty-state`, `flight-series-card-{id}`).
- Em `App.tsx`:
  - Remover linhas 53-54 (lazy import Flight) e linha 131 (Route `/flight`).
  - Adicionar redirect: `<Route path="/flight">{() => <Redirect to="/coach?tab=flights" />}</Route>` (Wouter import `Redirect`).
- Em `Sidebar.tsx` linha 93: trocar `path: '/flight'` por `path: '/coach?tab=flights'`. Manter label `Flight` e icon `Layers`.
- `Flight.tsx` (file original) NÃO deletar neste sprint. Adicionar header de deprecation no topo:
  ```
  /**
   * @deprecated 2026-05-07 (sprint-coach-page-reform-1 RF-02)
   * Conteudo migrado para FlightsPanel.tsx (aba dentro de /coach).
   * Esta pagina sera removida em followup. Rota /flight redireciona
   * para /coach?tab=flights via App.tsx.
   */
  ```
- Nenhum import existente de `Flight` (componente) deve continuar funcionando como página — apenas o redirect Wouter.

**Critério de aceitação:**
- [ ] GET `/flight` no browser → URL muda para `/coach?tab=flights` e renderiza aba Flights.
- [ ] `Sidebar` item "Flight" continua visível, mas href aponta para `/coach?tab=flights`.
- [ ] `App.tsx` não importa mais `Flight` como lazy.
- [ ] `FlightsPanel.tsx` renderiza header, 4 tabs, empty state e cards exatamente como `Flight.tsx` original.
- [ ] Todos os `data-testid` antigos do flight continuam funcionando (testes existentes não quebram, ou quebram só no path do componente, não na semântica).
- [ ] `Flight.tsx` tem header `@deprecated` no topo do arquivo.

---

### RF-03 — Migrar PrimedopePanel para aba "Variance Calculator"

**Descrição:** Remover painel resizable vertical embaixo do WeekGrid. Mover `<PrimedopePanel />` para nova aba dedicada.

**Regras de negócio:**
- Em `GradePlanner.tsx`:
  - Remover state `primedopePanelExpanded` + callback `togglePrimedopePanel` (linhas 94-117).
  - Remover read/write de `localStorage('primedope_panel_expanded')`.
  - Remover bloco `primedopeBlock` (linhas ~865-934) inteiro de seu uso atual.
  - Aba `Biblioteca + Grade` agora tem `<Panel defaultSize={70}>` com APENAS `gradeContent` (sem `PanelGroup direction="vertical"`).
- Aba "Variance Calculator":
  - Header: `<h2>Variance Calculator (PrimeDope)</h2>` + badge `Beta` (manter visual atual do header).
  - Body: `<PrimedopePanel userId={user.userPlatformId} bankrollUsd={bankrollUsd} />`.
  - Sem botão "Recolher/Expandir" (painel é a aba inteira agora).
  - `bankrollUsd` continua hidratado de `useBankroll()` no escopo `GradePlanner`.
  - data-testid no container: `coach-variance-panel`.
- Mobile: mesma aba, mesma renderização (sem variação).
- localStorage key `primedope_panel_expanded` deve ser limpa em mount inicial via `localStorage.removeItem(...)` (housekeeping silencioso, dentro de `useEffect` com `try/catch`).

**Critério de aceitação:**
- [ ] Aba "Variance Calculator" renderiza `<PrimedopePanel />` ocupando 100% da área de aba.
- [ ] WeekGrid em "Biblioteca + Grade" agora ocupa 100% da altura disponível na coluna direita.
- [ ] Não existe mais botão "Recolher / Expandir" PrimeDope.
- [ ] Não existe mais ResizeHandle vertical entre WeekGrid e PrimeDope.
- [ ] `bankrollUsd` chega ao `PrimedopePanel` corretamente (verificar via mock test que prop é passada).
- [ ] `localStorage('primedope_panel_expanded')` é removido no primeiro mount da página (cleanup retroativo).

---

### RF-04 — Banner "Pendentes para Founder"

**Descrição:** Adicionar banner colapsável no topo de `/coach` com checklist de itens para founder validar.

**Regras de negócio:**
- Componente: `client/src/components/grade-planner/CoachPendingBanner.tsx`.
- Lista de itens lida de arquivo separado: `client/src/components/grade-planner/coach-pending-items.ts` (export const `pendingItems: PendingItem[]`).
  ```ts
  export interface PendingItem {
    id: string;
    label: string;       // texto exibido
    targetTab?: string;  // slug da aba pra fazer scroll/switch
    targetAnchor?: string; // id de elemento dentro da aba (opcional)
  }
  ```
- Itens iniciais (ordem):
  1. `id: 'biblioteca-quick-filters'` — "Filtros da Biblioteca: novos quick buttons plataforma + dia da semana (RF-05)" → tab=`planner`.
  2. `id: 'grade-hover-delete'` — "Grade: hover X delete em torneios com 1s protection (RF-06)" → tab=`planner`.
  3. `id: 'variance-add-remove'` — "Variance Calculator: testar add/remove manual de torneios (futuro)" → tab=`variance`.
  4. `id: 'variance-extras'` — "Variance Calculator: revisar features extras" → tab=`variance`.
  5. `id: 'selector-review'` — "Tournament Selector: revisar e ajustar filtros/scoring" → tab=`selector`.
  6. `id: 'flights-review'` — "Flights: revisar fluxo + UX" → tab=`flights`.
  7. `id: 'biblioteca-review'` — "Biblioteca: revisar UX (filtros, sort, empty states, cards)" → tab=`planner`.
  8. `id: 'grade-review'` — "Grade: revisar todas funcoes (drag, copy day, settings, comparar perfis)" → tab=`planner`.
- Visual:
  - Container: `<Alert variant="warning">` ou equivalente em tokens UI (amber/orange tones, não destrutivo).
  - Header: ícone alerta + título "Pendentes — analise e teste" + contador `(N)` baseado em `pendingItems.length` + chevron toggle.
  - Body (quando expandido): `<ul>` com 1 `<li>` por item. Cada `<li>` contém:
    - Checkbox visual (decorativo, NÃO funcional — sem `onChange` que persista state).
    - Label do item.
    - Botão/link "Ir →" que faz `setActiveTab(targetTab)` (e scroll-into-view se `targetAnchor` definido).
  - Cor do checkbox: cinza neutro (não há lógica de "marcado").
- Persistência colapso:
  - Estado `collapsed` lido de `localStorage('coach_pending_banner_collapsed')` (key boolean `'1'` / `'0'`).
  - Default (key ausente): expandido.
  - Toggle persiste imediatamente.
- data-testid:
  - Container: `coach-pending-banner`.
  - Toggle: `coach-pending-banner-toggle`.
  - Lista: `coach-pending-banner-list`.
  - Cada item: `coach-pending-banner-item-{id}`.
  - Botão "Ir": `coach-pending-banner-jump-{id}`.
- Limpeza futura: comment no topo de `coach-pending-items.ts` registra que founder edita esse arquivo para marcar items resolvidos. Quando `pendingItems.length === 0`, banner não renderiza (early return null).

**Critério de aceitação:**
- [ ] Primeira render: banner expandido com 8 itens.
- [ ] Click no toggle colapsa banner; recarregar página mantém colapsado.
- [ ] Click em "Ir →" de um item muda aba ativa para o `targetTab` correspondente.
- [ ] Editar `coach-pending-items.ts` para `pendingItems = []` faz banner desaparecer (não renderiza).
- [ ] Checkboxes NÃO são funcionais — clicar não altera state nem persiste nada.

---

### RF-05 — Quick filters Biblioteca (chips plataforma + dia da semana)

**Descrição:** Adicionar chips horizontais de plataforma (multi-select) e dia da semana (multi-select com atalho "Hoje") na BibliotecaPanel, acima dos filtros avançados.

**Pré-requisito:** **system-architect deve invocar strategist em modo "Auditoria UX" focado em `BibliotecaPanel.tsx` antes do test-writer rodar**, para gerar lista priorizada (ICE) de quick filters. Strategist entrega:
1. Ordem visual recomendada (plataforma primeiro? dia primeiro?).
2. Agrupamento (plataformas em uma linha + dia em outra; ou tudo numa linha rolável; etc).
3. Micro-copy (ex: "Plataformas" vs "Sites" vs nada).
4. Edge cases (sem dados / sem matches / sites desabilitados em settings do user).
5. 2-3 friction points existentes em outros filtros que ele recomenda corrigir já neste sprint.

A spec assume que strategist endossa o que está abaixo, mas test-writer deve adaptar conforme output real do strategist (system-architect gerencia esse handoff).

**Regras de negócio:**

#### RF-05.1 — Migração `filterSite` → `filterSites: string[]`
- Estado atual em `BibliotecaPanel.tsx:61`: `filterSite` é `string` single. Trocar para `filterSites: string[]`.
- Função `filterLibraryTournaments(...)` em `@shared/library-filters` recebe hoje `filterSite?: string`. Estender para aceitar `filterSites?: string[]`. Compatibilidade: se array vazio, comportamento = sem filtro (igual hoje quando string vazia).
- **NÃO quebrar** chamadores existentes da função (verificar via grep antes).

#### RF-05.2 — Chips plataforma

**Ordem dos chips: por popularidade no DB do usuário (founder confirmou 2026-05-07).**

- Ordem dos chips é dinâmica: distinct sites em `tournaments` do user + count desc. Site mais frequente no histórico do usuário aparece primeiro (esquerda).
- **Fallback** quando user tem zero histórico (`tournaments` vazio): ordem fixa por volume global em poker MTT (founder definiu):
  1. PokerStars
  2. GGPoker
  3. WPN
  4. PartyPoker
  5. 888poker
  6. iPoker
  7. CoinPoker
  8. Chico
  9. Bodog
  10. Suprema
  11. Revolution
- Sites que existem no enum mas não têm um único torneio no histórico do user E NÃO estão na lista global: incluídos no FINAL da lista, em ordem alfabética. Garante que TODOS os sites configuráveis aparecem como chip.
- Sites que aparecem no histórico mas NÃO estão no enum oficial (edge case raro de import): omitidos do chip set (já estão filtrados pelos filtros avançados).
- **Fonte de dados:** novo endpoint `/api/library/platforms-by-popularity` retornando `{ sites: string[] }` ordenado. Implementação backend:
  ```ts
  // server/routes/tournament-library.ts (novo handler)
  // GET /api/library/platforms-by-popularity
  // Returns { sites: string[] } ordered by user history desc + global fallback fill.
  // Auth: requireAuth.
  ```
  Query equivalente:
  ```sql
  SELECT site, COUNT(*) AS volume
  FROM tournaments
  WHERE user_id = $1 AND grind_session_id IS NULL
  GROUP BY site
  ORDER BY volume DESC, site ASC;
  ```
  (Lembrar regra `Docs/architecture/data-model-index.md` §6.1: filtrar `grind_session_id IS NULL` para usar histórico real, não session_tournaments.)
  Backend mescla resultado com a lista global fallback + sites do enum officials que ficaram fora.
- **Alternativa minimalista (system-architect decide):** se evitar endpoint novo for preferível, implementar como hook frontend `usePlatformsByPopularity()` que consome a query existente `useQuery(['/api/tournament-library'])` e calcula ordem client-side. Trade-off: cliente precisa carregar lista inteira (já carrega hoje). Recomendação PM: hook client-side é mais barato e suficiente para MVP — endpoint dedicado fica como followup se performance virar issue.
- Componente `BibliotecaPanel` recebe ordem como prop opcional `platforms?: string[]` (override para tests / custom render). Quando ausente, usa hook/endpoint default.
- Renderizar como `<button>` chips horizontais (flex-wrap permitido). Container scrollable horizontal em mobile (overflow-x-auto, sem flex-wrap em < 768px).
- Visual: chip selecionado = filled (verde Grindfy); deselecionado = outline cinza.
- Click toggla site no array `filterSites`.
- data-testid: `biblioteca-quick-filter-platform-{site}` (lowercase, sem espaços, ex: `biblioteca-quick-filter-platform-pokerstars`).
- Container chips: `biblioteca-quick-filters-platforms`.

#### RF-05.3 — Chips dia da semana
- Adicionar novo state `filterDaysOfWeek: number[]` (0=Domingo .. 6=Sábado).
- Adicionar param `filterDaysOfWeek?: number[]` à função `filterLibraryTournaments(...)`. Filtra com `tournaments.dayOfWeek` (campo existe em `shared/schema.ts:2262`, nullable).
  - Se array vazio: sem filtro (mostra todos, incluindo torneios com `dayOfWeek = null`).
  - Se array com valores: filtra `dayOfWeek IN (array)`. Torneios com `dayOfWeek = null` ficam **excluídos** quando filtro está ativo.
- Chips renderizados na ordem `Seg, Ter, Qua, Qui, Sex, Sab, Dom` (1, 2, 3, 4, 5, 6, 0). Português abreviado 3 letras.
- Atalho "Hoje" como chip extra à esquerda de `Seg`. Click setta `filterDaysOfWeek = [todayDow]` (substitui, não adiciona). Visual diferenciado (border accent).
- Visual: chip selecionado = filled azul; deselecionado = outline cinza.
- data-testid:
  - Cada dia: `biblioteca-quick-filter-day-{dow}` (`biblioteca-quick-filter-day-1` para Segunda).
  - Hoje: `biblioteca-quick-filter-day-today`.
  - Container: `biblioteca-quick-filters-days`.

#### RF-05.4 — Filtros avançados atrás de toggle
- Manter `showFilters` boolean state existente.
- Botão "Filtros avançados ▾" em vez do botão atual "Filtros". Default: collapsed.
- Quando expandido: mostra inputs atuais (`filterType`, `filterSpeed`, `filterCurrency`, `filterMinBuyIn`, `filterMaxBuyIn`, `sortMode`).
- Quando collapsed: mostra apenas chips quick + busca.

**Critério de aceitação:**
- [ ] Chips plataforma visíveis acima da lista de torneios, sempre (independente de `showFilters`).
- [ ] **Ordem dos chips reflete popularidade do user**: site mais frequente em `tournaments` (com `grind_session_id IS NULL`) aparece primeiro à esquerda.
- [ ] **User com zero histórico**: chips renderizam na ordem fallback global: PokerStars, GGPoker, WPN, PartyPoker, 888poker, iPoker, CoinPoker, Chico, Bodog, Suprema, Revolution.
- [ ] User com histórico parcial (ex: jogou só PokerStars + GGPoker): chips começam por PokerStars/GGPoker (ordem desc por count), seguidos por sites do enum global na ordem fallback (sem duplicar os já listados).
- [ ] Click em chip plataforma → toggla site no array → lista filtra reativamente.
- [ ] Click em 2 chips plataforma → mostra torneios de AMBAS as plataformas (OR semantics).
- [ ] Click em chip "Qua" → mostra apenas torneios com `dayOfWeek = 3`.
- [ ] Click em "Hoje" → setta `filterDaysOfWeek = [<dow_atual>]`, substituindo seleção anterior.
- [ ] Empty state quando filtro retorna 0 resultados: mensagem "Nenhum torneio bate com os filtros selecionados" + botão "Limpar filtros".
- [ ] Filtros avançados começam collapsed; click no toggle expande.
- [ ] data-testids estáveis (lista RF-05.2, RF-05.3).
- [ ] Strategist output incorporado (ordem visual de seções, micro-copy, edge cases).
- [ ] Prop `platforms?: string[]` opcional do componente quick-filter aceita override (para testes / custom render).

---

### RF-06 — Hover X delete em CellChip (grid)

**Descrição:** Em `WeekGrid.tsx::CellChip`, mostrar botão X vermelho no canto superior-direito do chip ao hover. Click no X remove torneio direto (sem dialog confirm), mas com **proteção de 1s** anti-misclick.

**Regras de negócio:**

#### RF-06.1 — Botão X visualmente
- Position: `absolute`, `top: -2px`, `right: -2px`.
- Tamanho: 16x16px (`h-4 w-4`).
- Background: vermelho (`bg-red-600`), border arredondado (`rounded-full`).
- Ícone: `X` do lucide-react.
- Visibility: ocultado por default. `opacity-0` → `group-hover:opacity-100` no chip wrapper.
- Para que `group-hover` funcione, adicionar classe `group` no wrapper externo do `<Popover><PopoverTrigger asChild><div>` em `CellChip` (linha 372).

#### RF-06.2 — Proteção 1s (hover timing)

**Regra canônica (founder confirmou 2026-05-07):**
> Hover counter starts on first mouseenter; mouseleave before 1000ms resets the timer; chip body click ignores gate (sempre abre popover).

- Timer arma no **primeiro `onMouseEnter` no CellChip** (não no mount do botão X, não no mount do componente).
- O `onMouseEnter` é registrado no wrapper externo do CellChip (o `<div>` que recebe a classe `group`), de modo que entrar com mouse em qualquer ponto do chip — body, label, ou área ocupada pelo X — arma o gate uma única vez.
- Sair do CellChip (`onMouseLeave` no mesmo wrapper) **antes** de 1000ms decorridos: timer reseta (`armedAt = null`). Próximo `mouseenter` reinicia contagem do zero.
- Sair do CellChip **depois** de 1000ms (ou seja, com gate já cumprido): NÃO resetar enquanto o chip permanecer montado. Razão: founder pode mover mouse pra clicar e voltar; re-armar penalizaria UX.
- Click no body do chip (área que NÃO é o botão X) **ignora completamente o gate** — Popover abre normalmente em qualquer momento (durante grace, após gate, ou sem hover prévio via touch/keyboard). Apenas o botão X observa o gate.
- Estado:
  ```ts
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const isArmed = armedAt !== null && (now - armedAt) >= 1000;

  // mouseenter handler no wrapper:
  const handleMouseEnter = () => {
    if (armedAt === null) setArmedAt(Date.now());
  };

  // mouseleave handler no wrapper:
  const handleMouseLeave = () => {
    if (armedAt !== null && !isArmed) {
      // saiu antes do gate completar — reset
      setArmedAt(null);
    }
    // se isArmed === true, mantém armed (não reset)
  };
  ```
- `setInterval(() => setNow(Date.now()), 100)` ativo APENAS quando `armedAt !== null && !isArmed`. Cleanup automático via `useEffect` quando `isArmed` flipa para `true` ou `armedAt` volta a `null`.
- Touch / keyboard nav: sem `mouseenter`, gate nunca arma → botão X permanece em estado de grace (visível mas não-clicável). Decisão consciente do founder: touch users abrem Popover normalmente e usam o botão "Remover" interno do popover (que não tem gate). Sem regressão de a11y.

#### RF-06.3 — Comportamento click
- Quando `!isArmed`: botão tem `opacity: 0.4`, `cursor: not-allowed`, `aria-label="Remover torneio (aguarde 1s)"`, `onClick` é noop (event.preventDefault + stopPropagation).
- Quando `isArmed`: botão tem `opacity: 1.0`, `cursor: pointer`, `aria-label="Remover torneio"`, `onClick` chama `onRemove(tournament.id)` direto (sem confirm dialog).
- `onClick` SEMPRE chama `event.stopPropagation()` para não abrir o Popover do CellChip.
- Tooltip: durante grace period, mostrar `title="Aguarde 1s"`. Após, `title="Remover torneio"`.

#### RF-06.4 — Acessibilidade
- `aria-label` dinâmico (RF-06.3).
- `aria-disabled={!isArmed}`.
- Foco navegável via Teclado: Tab para o botão durante grace mostra `aria-disabled=true`.

#### RF-06.5 — data-testid
- Botão X: `tournament-chip-x-delete-{tournamentId}`.
- Wrapper: nenhum novo data-testid (mantém o existente do TournamentChip).

#### RF-06.6 — Coexistência com Popover
- Click no body do chip continua abrindo `<Popover>` (comportamento atual).
- Click no X NÃO abre popover (graças ao `stopPropagation`).
- Popover continua tendo botão "Remover" interno (RF-06 NÃO remove o botão "Remover" do popover — é alternativa redundante).

**Critério de aceitação:**
- [ ] Hover sobre CellChip (mouseenter): botão X aparece no canto superior-direito E gate começa a contar.
- [ ] Imediatamente após hover (< 1000ms): botão X visível mas com opacity 0.4 e click é ignorado (noop com `preventDefault + stopPropagation`).
- [ ] 1000ms+ após mouseenter: botão X 100% opaco, click chama `onRemove(tournamentId)` direto (sem dialog confirm).
- [ ] **Mouse leave ANTES de 1000ms:** timer reseta (`armedAt = null`). Próximo `mouseenter` reinicia contagem do zero.
- [ ] **Mouse leave DEPOIS de 1000ms (já armado):** estado preservado. Voltar ao chip mantém X clicável imediatamente.
- [ ] Click no X durante grace NÃO abre popover (mas também não remove — apenas noop).
- [ ] Click no X após grade NÃO abre popover (graças ao `stopPropagation`) E chama `onRemove`.
- [ ] Click no body do chip (qualquer área que não seja o X) continua abrindo o popover normalmente — **gate é ignorado para body click**, em qualquer momento (durante grace, após gate, ou sem hover prévio).
- [ ] Popover ainda tem o botão "Remover" interno (RF-06 NÃO remove — é alternativa redundante para touch/keyboard users).
- [ ] data-testid `tournament-chip-x-delete-{id}` presente quando hover ativo.
- [ ] aria-label muda entre "Remover torneio (aguarde 1s)" e "Remover torneio" conforme arming.
- [ ] aria-disabled muda entre `true` e `false` conforme arming.
- [ ] Touch users (sem mouseenter natural): botão X aparece como em hover (decisão visual de mobile fica com strategist) mas gate nunca arma → fallback é botão "Remover" do popover.

---

### RF-07 — Updates downstream (rotas, sidebar, testes)

**Descrição:** Atualizar todos consumidores afetados pela remoção da rota `/flight` standalone e pela introdução do tab system em `/coach`.

**Regras de negócio:**

#### RF-07.1 — `App.tsx`
- Remover lazy import `Flight` (linhas 53-54).
- Remover `<Route path="/flight" component={...}>` (linha 131).
- Adicionar redirect:
  ```tsx
  import { Redirect } from "wouter";
  ...
  <Route path="/flight">{() => <Redirect to="/coach?tab=flights" />}</Route>
  ```
  Posição: na mesma seção dos outros routes protected (idealmente próximo da linha onde `/flight` estava).

#### RF-07.2 — `Sidebar.tsx`
- Linha 93: trocar `path: '/flight'` por `path: '/coach?tab=flights'`. Manter `label: 'Flight'` e `icon: Layers`.
- Verificar se Sidebar tem lógica de "active item" baseada em pathname exato. Se sim, ajustar para considerar match com `/coach?tab=flights` (ou pelo menos `pathname=/coach && search.tab=flights`). Caso a lógica use só `pathname.startsWith(item.path)`, a comparação atual quebraria — investigar e corrigir.

#### RF-07.3 — Grep amplo `/flight`
- Rodar `grep -r "/flight"` no `client/` e revisar cada match.
- Contextualmente atualizar: comentários doc, labels, links em emails templates (se houver), aria-labels.
- Permitidos manter: comentários históricos em ADRs e specs antigas (`Docs/specs/sprint-flight-1.md` etc).

#### RF-07.4 — Testes existentes
- Buscar `tests/**/Flight*.test.*` e `tests/**/*flight*.test.*`.
- Atualizar imports de `@/pages/Flight` para `@/components/grade-planner/FlightsPanel` quando o teste valida o componente em si (não a página standalone).
- Testes que validam navegação para `/flight` devem ser atualizados para validar redirect → `/coach?tab=flights` OU para validar que aba `flights` ativa renderiza o conteúdo.

#### RF-07.5 — testId alias legacy `grade-tab-selector`

**Founder confirmou 2026-05-07:** zero-touch para testes legacy.

- Manter testId legacy `grade-tab-selector` lado a lado com novo `coach-tab-selector` no mesmo `<TabsTrigger>` da aba Tournament Selector.
- **Implementação default (recomendada):** wrapper `<div data-testid="grade-tab-selector" style={{ display: 'contents' }}>` envolvendo o `<TabsTrigger data-testid="coach-tab-selector">`. `display: contents` garante que wrapper desaparece do layout/tab order/CSS sem remover do DOM, então `screen.getByTestId('grade-tab-selector')` continua funcionando para testes legacy E `getByTestId('coach-tab-selector')` resolve o trigger Radix novo.
- Detalhes da implementação (ver §5.4 Compatibilidade): system-architect pode escolher entre Opção A (atributo extra `data-testid-legacy`) ou Opção B (wrapper `display:contents`). Default = Opção B.
- Aplicar APENAS em `coach-tab-selector` ↔ `grade-tab-selector`. Demais abas (`coach-tab-planner`, `coach-tab-flights`, `coach-tab-variance`) são novas e NÃO precisam de alias.
- Atalho semântico: o testId legacy `grade-tab-selector` aparece em pelo menos 2 lugares no GradePlanner.tsx atual (linhas 942 mobile e 964 desktop). Wrapper deve cobrir ambos.

**Critério de aceitação:**
- [ ] `App.tsx` não importa `Flight` como lazy.
- [ ] `App.tsx` tem `<Route path="/flight">{() => <Redirect ... />}</Route>` redirecionando.
- [ ] `Sidebar.tsx` linha 93 aponta para `/coach?tab=flights`.
- [ ] Active state da sidebar destaca item "Flight" quando user está em `/coach?tab=flights`.
- [ ] Nenhum link / botão em outras páginas usa `href="/flight"`.
- [ ] Testes existentes que renderizam `Flight.tsx` continuam passando OU foram migrados para `FlightsPanel.tsx`.
- [ ] **Testes legacy que usam `screen.getByTestId('grade-tab-selector')` continuam passando SEM modificação.** ← novo critério (RF-07.5).
- [ ] Novo testId `coach-tab-selector` também é encontrável no mesmo elemento da aba Tournament Selector.
- [ ] `npm run check` passa (zero TS errors).

---

## 5. Requisitos Não-Funcionais

### 5.1 Performance
- **Tab switching**: render da aba ativa não pode causar mais re-renders que o atual `<Tabs>` Radix. Não montar componentes de outras abas (`unmountOnExit`-like) — usar `forceMount` apenas se Radix exigir para acessibilidade.
- **PrimedopePanel** em sua nova aba: lazy mount aceitável. Recomendado: `<TabsContent value="variance" forceMount={false}>` para não pagar custo de query/calc até user clicar na aba.
- **WeekGrid** sem painel vertical: deve renderizar visualmente igual ou mais rápido (menos PanelGroup nesting).

### 5.2 Acessibilidade
- Tabs do `<Tabs>` Radix: keyboard nav (Arrow Left/Right, Home, End) funciona out-of-the-box. NÃO desabilitar.
- Banner de pendências: `<Alert role="status">` ou `role="region"` com `aria-label="Pendencias para validacao"`.
- Banner toggle: `aria-expanded={!collapsed}`, `aria-controls="coach-pending-banner-list"`.
- Quick chips Biblioteca: `role="button"` + `aria-pressed={isSelected}`.
- X delete chip: `aria-label` dinâmico (RF-06.4), `aria-disabled` durante grace.

### 5.3 Persistência URL
- `?tab=` deve sobreviver a:
  - Refresh (F5).
  - Navegação back/forward (mas sem poluir histórico — usar `replaceState`).
  - Bookmark direto.
- localStorage `coach_pending_banner_collapsed` é cosmético (banner de transição) — perda aceitável em modo privado.

### 5.4 Compatibilidade — testId alias legacy

**Decisão founder confirmada 2026-05-07:**

Manter alias **legacy `grade-tab-selector`** lado a lado com novo `coach-tab-selector` no MESMO elemento `<TabsTrigger>`. Testes existentes que usam `grade-tab-selector` continuam funcionando sem update neste sprint.

**Como implementar dois data-testids no mesmo elemento (sem quebrar Radix Tabs):**

`data-testid` é um atributo HTML simples — não pode ter dois atributos com a mesma chave. Soluções aceitáveis (system-architect escolhe):

- **Opção A — atributos paralelos:** usar atributo extra `data-testid-legacy="grade-tab-selector"` ao lado de `data-testid="coach-tab-selector"`. Testes legacy migram facilmente: `screen.getByTestId(...)` aceita selector custom via `screen.getByTestId(/^grade-tab-selector$/)` ou query function. Limitação: requer pequena adaptação nos testes legacy (não é zero-touch).
- **Opção B — wrapper invisível:** envelopar o `<TabsTrigger data-testid="coach-tab-selector">` em um `<div data-testid="grade-tab-selector" style={{display:'contents'}}>`. `display: contents` faz wrapper sumir do layout mas preservar DOM. Testes legacy via `getByTestId('grade-tab-selector')` ainda encontram o elemento. **Recomendação PM:** Opção B é zero-touch para testes legacy.
- **Opção C — render duplo:** NÃO usar. Quebraria semântica do Radix Tabs (esperaria 2 triggers para 1 panel).

**Default recomendado:** Opção B (wrapper `display: contents`).

**Aplicar mesma estratégia em outras tabs?** NÃO. Apenas `coach-tab-selector` ↔ `grade-tab-selector` precisam alias (testes legacy só existem para essa tab — `grade-tab-selector` está no código original em `GradePlanner.tsx:942` e `:964`). Demais abas (`coach-tab-planner`, `coach-tab-flights`, `coach-tab-variance`) são novas e não têm legacy.

**Followup:** sprint dedicada migra testes legacy para o testid novo + remove alias.

### 5.5 Limpeza retroativa
- `localStorage('primedope_panel_expanded')` removido em mount inicial via useEffect one-shot (housekeeping silencioso).

---

## 6. Endpoints Previstos

**Opcional, system-architect decide entre 2 paths.**

| Método | Rota | Descrição | Auth | Decisão |
|---|---|---|---|---|
| GET | `/api/library/platforms-by-popularity` | Retorna `{ sites: string[] }` ordenado por volume do user + fallback global | requireAuth | Path A: novo endpoint |
| — | (sem novo endpoint) | Calcular ordem client-side via hook `usePlatformsByPopularity()` consumindo `/api/tournament-library` existente | — | Path B: hook only |

**Recomendação PM:** Path B (hook client-side). Razão: lista de torneios da biblioteca já é carregada na página, computar `Object.entries(countBySite)` é barato (<100 sites realisticamente). Cria endpoint só se Path B virar gargalo. System-architect tem autoridade para escolher final.

---

## 7. Modelos de Dados Afetados
**Nenhum.** Schema DB não muda.

Campos USADOS (não alterados):
- `tournaments.dayOfWeek` (`shared/schema.ts:2262`, nullable integer 0-6) — RF-05.3 chips dia da semana.
- `tournaments.site` (`shared/schema.ts`) — RF-05.2 ordem de chips por popularidade. Query agregadora respeita regra de §6.1 do data-model-index (`grind_session_id IS NULL`).

---

## 8. Cenários de Teste Derivados

### 8.1 Happy Path — Tabs

- [ ] `/coach` abre na aba `planner` por default.
- [ ] Click em "Tournament Selector" troca aba e muda URL para `?tab=selector` (sem reload).
- [ ] Click em "Flights" troca aba, URL `?tab=flights`, mostra cards de series.
- [ ] Click em "Variance Calculator" troca aba, URL `?tab=variance`, renderiza `<PrimedopePanel>`.
- [ ] Refresh em `/coach?tab=variance` mantém aba Variance ativa.

### 8.2 Happy Path — Redirect /flight
- [ ] Acessar `/flight` redireciona para `/coach?tab=flights` (URL bar atualiza).
- [ ] Conteúdo renderizado é o mesmo de `Flight.tsx` original (header, tabs internas, cards).

### 8.3 Happy Path — Banner pendências
- [ ] Primeira render: banner expandido, 8 itens visíveis.
- [ ] Click em "Ir →" do item `grade-hover-delete` muda aba para `planner`.
- [ ] Click em "Ir →" do item `selector-review` muda aba para `selector`.
- [ ] Toggle do banner colapsa; reload mantém estado.
- [ ] Editar `coach-pending-items.ts` para `[]` faz banner sumir.

### 8.4 Happy Path — Quick filters Biblioteca
- [ ] Click em chip "PokerStars" filtra biblioteca para mostrar só tournaments daquela rede.
- [ ] Click em "GGPoker" + "PokerStars" mostra ambas (OR).
- [ ] Click em "Qua" mostra só torneios com `dayOfWeek = 3`.
- [ ] Click em "Hoje" setta `filterDaysOfWeek = [todayDow]` (substitui seleção).
- [ ] Toggle "Filtros avançados" expande inputs antigos (type, speed, currency, etc).

### 8.5 Happy Path — Hover X delete
- [ ] Hover sobre CellChip: X aparece no canto.
- [ ] Click no X imediatamente: nada acontece (grace period).
- [ ] Aguardar 1.1s + click no X: `onRemove(id)` é chamado, chip desaparece.
- [ ] Click no body do chip durante hover: popover abre normalmente.

### 8.6 Validação de Input

- [ ] `?tab=invalid` cai no default `planner` e limpa o param.
- [ ] `?tab=` (vazio) cai no default.
- [ ] Quick filter plataforma sem matches: empty state customizado.
- [ ] Quick filter day sem matches: empty state customizado.

### 8.7 Edge Cases

- [ ] Mobile (< 768px): mesmas 4 abas, mesma ordem, sem condicional.
- [ ] User sem nenhuma `tournament_series` (aba Flights): mostra `flight-empty-state`.
- [ ] User com `bankrollUsd = 0` na aba Variance: PrimedopePanel renderiza com warning interno (já existente, não muda).
- [ ] Hover no CellChip → mouse leave antes de 1s: timer reseta. Re-hover reinicia.
- [ ] Hover em chip e Tab para o botão X durante grace: `aria-disabled=true` aparece no foco.
- [ ] User com `localStorage('primedope_panel_expanded') = '1'` (legacy): mount remove a key silenciosamente.
- [ ] Banner com `pendingItems = []`: não renderiza (early return null).

### 8.8 Acessibilidade
- [ ] Tabs navegáveis por teclado (Arrow Left/Right entre TabsTrigger).
- [ ] Banner toggle reage a Enter / Space.
- [ ] Quick chips Biblioteca reagem a Enter / Space e têm `aria-pressed`.
- [ ] X delete: aria-label correto durante e após grace.

---

## 9. Fora de Escopo

Itens que esta spec **EXPLICITAMENTE NÃO faz**:

- ❌ Refatoração interna de `SelectorPanel.tsx` (scoring, filtros, cards). Sprint futura.
- ❌ Refatoração interna de `PrimedopePanel.tsx` (variance math, add/remove manual). Sprint futura.
- ❌ Refatoração interna de `BibliotecaPanel.tsx` ALÉM dos quick filters RF-05. Outros UX issues virão em sprint dedicada.
- ❌ Refatoração interna de `FlightsPanel.tsx` (cards, dialogs, drill-down). Mover apenas, não refatorar.
- ❌ Mudanças em scoring algoritmo Tournament Selector.
- ❌ Mudanças em fluxo Day 2 / state machine multi-flight.
- ❌ Mudanças em schema DB.
- ❌ Empty states sofisticados em Flights / Variance além do que já existe.
- ❌ Tournament Selector no mobile com layout diferente do desktop.
- ❌ Animações fancy no toggle do banner (transição básica `transition-all` ok; spring/scale não).
- ❌ Persistência cross-device do colapso do banner (só localStorage, OK).
- ❌ Remoção física do arquivo `Flight.tsx` (apenas marcar @deprecated; deletar em followup).
- ❌ Migração ADR formal para a remoção de `/flight`. Followup.
- ❌ Remoção do botão "Remover" interno do popover do CellChip. RF-06 X é alternativa, não substituto.

---

## 10. Dependências

- Pré-requisito: nenhuma feature backend nova. Todos endpoints usados (`/api/tournament-library`, `/api/planned-tournaments`, `/api/tournament-series`, `/api/profile-states`) já existem e estão funcionais.
- Pré-requisito: `system-architect` deve invocar `strategist` em modo "Auditoria UX" focado em `BibliotecaPanel.tsx` antes do test-writer começar (ver RF-05). Output do strategist alimenta detalhes finais de chip ordering, micro-copy e edge cases.
- Lib: `wouter` já em uso (`Redirect`, `useLocation`, `useSearch` parsing — confirmar API exata em system-architect).
- Hook `useTabFromUrl` é novo, mas reusa primitives Wouter já disponíveis.

---

## 11. Plano de Testes

### 11.1 Unit tests (Vitest + RTL, jsdom)

Arquivos novos:

- `tests/hooks/useTabFromUrl.test.ts`
  - default tab quando sem `?tab=`
  - tab válido carregado de URL
  - tab inválido cai no default
  - `setActiveTab` atualiza URL via replaceState (não pushState)

- `tests/components/grade-planner/CoachPendingBanner.test.tsx`
  - Render com 8 itens
  - Toggle expande/colapsa + persistência localStorage
  - Click em "Ir →" chama `onJump(targetTab)` callback (mock)
  - `pendingItems = []` → não renderiza
  - data-testids estáveis

- `tests/components/grade-planner/FlightsPanel.test.tsx`
  - Render do header + 4 tabs internas
  - Empty state quando `data = []`
  - Cards renderizam com data-testids `flight-series-card-{id}` (paridade com Flight.tsx original)
  - BackfillSeriesDialog abre/fecha

- `tests/components/grade-planner/BibliotecaPanelQuickFilters.test.tsx`
  - Chips plataforma renderizam todos sites listados (RF-05.2)
  - **Ordem por popularidade do user (RF-05.2 atualizado): mock storage com tournaments [PokerStars x10, GGPoker x5, WPN x1] → chips ordenam PokerStars > GGPoker > WPN > resto fallback global**
  - **User com zero histórico → chips ordem fallback (PokerStars, GGPoker, WPN, PartyPoker, 888poker, iPoker, CoinPoker, Chico, Bodog, Suprema, Revolution)**
  - **Prop `platforms?: string[]` override → respeita ordem fornecida (bypass do hook/endpoint)**
  - Click toggla `filterSites` array
  - 2 chips selecionados → OR semantics
  - Chips dia da semana renderizam Seg-Dom + Hoje
  - Click "Hoje" setta `filterDaysOfWeek` para `[todayDow]`
  - Toggle "Filtros avançados" expande inputs antigos
  - Empty state custom quando 0 matches

- `tests/hooks/usePlatformsByPopularity.test.ts` (novo se Path B escolhido em §6)
  - Mock library response → retorna ordem desc por count
  - Library vazia → retorna ordem fallback global
  - Library com sites fora do enum → ignora os out-of-enum, mantém os do enum

- `tests/components/grade-planner/CellChipHoverDelete.test.tsx`
  - Hover (mouseenter) mostra X **E arma gate**
  - Click no X durante grace (< 1000ms) → `onRemove` NÃO chamado, popover NÃO abre
  - Click após 1000ms → `onRemove(id)` chamado, popover NÃO abre
  - **Mouse leave ANTES de 1000ms reseta timer (re-hover reinicia do zero)**
  - **Mouse leave DEPOIS de 1000ms preserva armed (re-entry mantém X clicável imediato)**
  - Click no body do chip durante grace continua abrindo Popover (gate ignorado)
  - Click no body do chip após gate continua abrindo Popover (gate ignorado para body)
  - aria-label dinâmico (`Remover torneio (aguarde 1s)` ↔ `Remover torneio`)
  - aria-disabled dinâmico (`true` ↔ `false`)
  - data-testid `tournament-chip-x-delete-{id}`

Arquivos existentes a atualizar:

- `tests/pages/GradePlanner.test.tsx` (se existir):
  - Adicionar 4 abas no DOM
  - Validar `coach-tab-{key}` data-testids
  - Validar default tab `planner`
  - Validar URL sync
  - **Validar testId alias legacy `grade-tab-selector` ainda resolve no MESMO elemento que `coach-tab-selector` (RF-07.5)**

- Testes existentes Flight: migrar imports (de `@/pages/Flight` → `@/components/grade-planner/FlightsPanel`).

### 11.2 Integration tests (jsdom)

- `tests/integration/coach-page-tabs.test.tsx`:
  - Renderizar `<App>` com routes mock; navegar `/coach`, `/coach?tab=variance`, `/flight` (espera redirect).
  - Validar `Sidebar` "Flight" item aponta para `/coach?tab=flights`.

### 11.3 Lessons aplicáveis aos testes

- **Lesson #14**: test-writer DEVE usar `await import(...)` em testes `.tsx` que carregam componentes, NUNCA `require()`.
- **Lesson #15**: `vi.unmock` em escopo nested vira hoisted; usar `vi.doUnmock` ou top-level.
- **Lesson #12**: estado persistente (URL `?tab=`, localStorage banner) sobrevive a re-mount; `useState` local não. Testes devem render-unmount-render para validar.
- **Lesson #19**: rotas Wouter — qualquer mudança em rotas precisa ser confirmada com grep `Route path` em `App.tsx`. CTA targets devem casar com rotas registradas.

### 11.4 Test IDs canônicos

| Elemento | data-testid |
|---|---|
| Tab Biblioteca + Grade | `coach-tab-planner` |
| Tab Tournament Selector | `coach-tab-selector` (+ alias legacy `grade-tab-selector` via wrapper `display:contents` — RF-07.5 / §5.4) |
| Tab Flights | `coach-tab-flights` |
| Tab Variance Calculator | `coach-tab-variance` |
| Banner pendências | `coach-pending-banner` |
| Banner toggle | `coach-pending-banner-toggle` |
| Banner lista | `coach-pending-banner-list` |
| Banner item | `coach-pending-banner-item-{id}` |
| Banner item jump | `coach-pending-banner-jump-{id}` |
| Variance panel container | `coach-variance-panel` |
| FlightsPanel root | `flight-page-header` (mantido) |
| Quick chip plataforma | `biblioteca-quick-filter-platform-{site}` |
| Quick chip dia | `biblioteca-quick-filter-day-{dow}` |
| Quick chip Hoje | `biblioteca-quick-filter-day-today` |
| Container chips plataforma | `biblioteca-quick-filters-platforms` |
| Container chips dia | `biblioteca-quick-filters-days` |
| X delete chip grid | `tournament-chip-x-delete-{tournamentId}` |

---

## 12. Riscos + Lessons aplicáveis

### Riscos

1. **Sidebar active state quebra com query string**. Lógica atual provavelmente compara `location === item.path`. `/coach?tab=flights` não casa exatamente com `/coach`. Se Sidebar destacar "Grade" para todas as 4 abas, o item "Flight" fica órfão sem destaque. **Mitigação**: system-architect investiga lógica do Sidebar antes do test-writer; spec fica aberta a refinement.

2. **Test-writer cria testes de componente que falham com `require()` (Lesson #14 / #FX-1)**. Spec já alerta — system-architect reforça em handoff. Se teste falhar por `require()`, implementer documenta como impedimento e segue.

3. **Quick filter `filterSites: string[]` quebra chamadores existentes de `filterLibraryTournaments`**. Mitigação: grep antes de mudar assinatura; manter compat com `filterSite?: string` legado se necessário (deprecation gradual).

4. **PrimedopePanel re-render custoso ao trocar para aba Variance**. Mitigação: lazy mount via `forceMount={false}` (Radix default) + cache TanStack Query.

5. **localStorage cleanup retroativo de `primedope_panel_expanded` em modo privado lança exception**. Mitigação: try/catch silencioso (já é padrão em `togglePrimedopePanel` original).

6. **Strategist demora ou trava o sprint**. Mitigação: spec já entrega lista default funcional (RF-05.2 / RF-05.3). Strategist refina micro-copy / ordenação, mas não bloqueia test-writer se atrasar.

### Lessons aplicáveis (lessons-learned.md)

- **#1 Hooks primeiro** — early return ANTES de hooks viola Rules of Hooks. Em `GradePlanner.tsx` já existe early return baseado em `user`; ao adicionar `useTabFromUrl`, garantir hooks antes de qualquer return.
- **#2 Tests com data-testid** — RF-05/RF-06 introduzem múltiplos testIds documentados. Test-writer NÃO pode usar heurísticas DOM.
- **#12 Estado persistente** — URL `?tab=` em vez de `useState` local para sobreviver a re-mount.
- **#14 `require()` em testes `.tsx`** — usar `await import(...)`.
- **#15 `vi.unmock` hoisted** — usar `vi.doUnmock` ou top-level.
- **#19 CTA targets devem casar com rotas Wouter** — grep `Route path` antes de finalizar redirect e Sidebar update.
- **#23 Wouter v3 `<Link>`** — confirmar versão antes de usar `<Redirect>`. Atualmente repo está em Wouter v3 (verificado em `package.json`).

---

## 13. Plano de followups

Após merge desta spec:

1. **Followup-1: Cleanup `Flight.tsx`** — após 1 sprint validado em prod sem regressões, deletar `client/src/pages/Flight.tsx` físico. Atualizar imports e testes legacy.

2. **Followup-2: ADR migração `/flight`** — system-architect cria ADR formal documentando a decisão de eliminar a rota standalone. Numerar próximo livre (atual último ADR ~119, então ~120).

3. **Followup-3: Sprint Selector Refinement** — refatoração de scoring, filtros, cards de Tournament Selector. Spec separada via pm-spec.

4. **Followup-4: Sprint Variance Refinement** — add/remove manual de torneios em PrimedopePanel, features extras (que founder enumera após review). Spec separada.

5. **Followup-5: Sprint Flights Refinement** — UX da lista de series (cards, drill-down detail, mark bagged flow, day 2 timeline). Spec separada.

6. **Followup-6: Sprint Biblioteca Refinement** — beyond quick filters: sort, virtual list (deferida de UI-T1), empty states sofisticados, cards refresh. Spec separada.

7. **Followup-7: Remover banner pendências** — quando founder marcar todos os 8 items como OK em produção, deletar `CoachPendingBanner.tsx` + `coach-pending-items.ts` + RF-04 do GradePlanner.

8. **Followup-8: Sidebar active state com query string** — se RF-07.2 não conseguir resolver completamente o destaque com query string, criar issue dedicada para refatorar lógica de Sidebar (ex: hook `useActiveNavItem` que considera query params).

---

## 14. Notas de Implementação (sugestões opcionais para Implementer)

- `useTabFromUrl` pode usar `useLocation` + `useSearch` do Wouter v3, ou `URLSearchParams(window.location.search)` direto. Decisão fica com system-architect.
- Para `<Redirect>`, Wouter v3 expõe `import { Redirect } from "wouter"` — confirmar shape (`<Redirect to="/coach?tab=flights" />`).
- Ao mover `bankrollUsd` para a aba Variance, considerar passar via context se PrimedopePanel já usa `useBankroll` internamente — evita prop drilling redundante.
- Banner pendências: `<details>` HTML nativo é uma alternativa minimalista a custom toggle; mas perde controle fino sobre data-testids e a11y. Recomendado: implementação custom com `useState` + `aria-expanded`.
- X delete chip: usar `<button>` real (não `<div onClick>`) para a11y nativa.

---

**Fim da spec.**
