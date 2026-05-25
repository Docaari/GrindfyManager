# Sprint day-detail-zoom-1 — DayDetailZoom (modal central com biblioteca embarcada)

| Campo | Valor |
|---|---|
| Sprint ID | `day-detail-zoom-1` |
| Owner | Docaari (Grindfy) |
| Data | 2026-05-23 |
| Status | **ARCHITECTED** (ADR-210 + 2 diagramas em `Docs/architecture/diagrams/day-detail-zoom/`) |
| Dependencias | **Nenhuma.** Sprint independente — todos endpoints e helpers ja existem. |
| Pipeline alvo | `pm-spec → system-architect → test-writer → implementer → reviewer` |
| Estimativa | ~7 dias dev (5 RFs MUST) |
| Sem migration | sim — zero schema change |

---

## 1. Contexto + Objetivo

A pagina `/coach` (Grade-planner) e a tela core de planejamento semanal de torneios MTT do Grindfy. Hoje, quando o jogador clica `Eye+Detalhes` no header de uma coluna de dia em `WeekGrid`, abre o `DayDetailDrawer` (Sprint F4 RF-01) — um `<Sheet side="right">` lateral, **read-only**, com 4 cards (Total/ABI/Investimento/Banca) + pie de formato + bar de volume + tabela de banca por plataforma + lista de torneios. O drawer fecha quando o jogador clica `Editar grade do dia`, que abre o `EditDialog`. Fluxo: 3 cliques + dois modais sequenciais pra editar um dia.

O founder pediu (verbatim): "Quando clicamos em 'Detalhes' de um dia, o modal que abre nao deve ser lateral, deve ser central e deve dar um 'zoom' no dia com a biblioteca ao lado facilitando a adicao ou remocao e reorganizacao dos torneios, permitindo filtros por plataforma e esse tipo de coisa". O objetivo de UX e fundir **visualizacao + edicao + descoberta** em uma unica superficie central — modelo mental "estou trabalhando NESTE dia agora", com a biblioteca como painel lateral pra arrastar torneios direto pros slots, ao inves do fluxo atual "abre, ve, fecha, abre outro".

Por que drawer lateral nao serve mais: (a) ocupa metade da viewport mas mostra so leitura, forcando segundo modal; (b) nao oferece descoberta — biblioteca fica em outra aba/painel separado, exigindo lembrar do nome do torneio que se quer adicionar; (c) o DnD da pagina (`DragDropContext` envolvendo toda a `/coach` em `GradePlanner.tsx:710-1101`) ja existe e ja consegue mover torneios entre WeekGrid e BibliotecaPanel, mas o drawer nao participa desse contexto. Pivot: substituir drawer por modal central (`Dialog` centrado, NAO `Sheet`) com **split 60/40** — esquerda foca no dia (header amplificado + slots por horario + cards/pie/bar dos dados existentes), direita renderiza biblioteca embarcada com filtros pre-aplicados ao contexto do dia (plataforma dominante, faixa de buy-in, formato). DnD biblioteca→slot habilitado por padrao (DnD ja envolve a pagina inteira — modal abre **dentro** do `DragDropContext`, contexto herdado, sem refactor de DnD necessario). Auto-save com toast undo 5s padrao Notion/Linear.

---

## 2. Escopo Sprint 1 — IN (5 RFs MUST)

### RF-01 — Modal central `DayDetailZoom` com layout split 60/40 resizable

**Descricao:** novo componente `client/src/components/grade/DayDetailZoom.tsx` que renderiza um Radix `Dialog` central (NAO `Sheet`) ocupando ~90vw × ~88vh em desktop. Layout split horizontal via `react-resizable-panels` (`PanelGroup` + `Panel` + `PanelResizeHandle`, ja importado em `GradePlanner.tsx:12`):

- **Esquerda (60% default, min 45% max 75%):** header amplificado `Detalhes do dia — {DiaPT} (Perfil {X})` + 4 cards KPI (paridade `DayDetailDrawer`: Total/ABI/Investimento/Banca) + grid de slots de horario verticalizado (reusa `TIME_SLOTS` de `WeekGrid`) com torneios planejados em cards drag-and-drop por slot.
- **Direita (40% default, min 25% max 55%):** `BibliotecaEmbedded` (RF-03).
- **Handle:** `PanelResizeHandle` arrastavel; persistencia do split em `localStorage["dayZoom.split.pct"]` (default 60).

Responsividade:
- `>= 1024px`: split horizontal resizable.
- `768-1023px`: vira `<Tabs>` (Radix Tabs) com 2 abas: "Dia" / "Biblioteca". DnD ainda funciona dentro da aba "Biblioteca" arrastando pro slot da aba "Dia" desde que aba "Dia" esteja visivel — para esse breakpoint, alternativa simples: DnD **somente dentro** da aba ativa (drop entre abas indisponivel; **click-to-add** ja cobre o caso — ver RF-04 mobile fallback).
- `< 768px`: fullscreen Dialog, vira `<Tabs>` igual ao 768-1023px, **mas** DnD desabilitado (`isDropDisabled=true` em todos `Droppable`); LibraryCard ganha botao `+` (RF-04 click-to-add inline).

**Criterios de aceite:**
1. `data-testid="day-zoom-modal"` renderiza centro (Radix `<DialogContent>` `sm:max-w-[1280px] w-[90vw] h-[88vh]`). `data-testid="day-zoom-panel-left"` + `data-testid="day-zoom-panel-right"` presentes em `>= 1024px`.
2. Default split 60/40 — `Panel defaultSize={60}` esquerda + `defaultSize={40}` direita; `PanelResizeHandle` arrastavel emite resize. Apos drag, `localStorage["dayZoom.split.pct"]` atualizado (debounced 300ms).
3. Em `768-1023px`: `data-testid="day-zoom-tabs"` presente com 2 `TabsTrigger` (`tab-day` / `tab-biblioteca`); painel split **nao** renderiza.
4. Em `< 768px`: `DialogContent` com `w-screen h-screen max-w-none rounded-none`; DnD `Droppable` recebem `isDropDisabled={true}` (verificavel via prop).
5. ESC fecha modal e emite `day_zoom_close` com `reason:'esc'`. Click no backdrop fecha e emite `reason:'backdrop'`. Botao X (header) emite `reason:'cta'`.
6. Modal abre em <300ms TTI percebido (criterio global §14; nao testavel em unit, marcar p/ verify manual em §14).

**Dependencias:** `useDayDetail` (existente, reusa); `react-resizable-panels` (instalado); Radix `Dialog` + `Tabs` (instalados). Reusa state pattern do GradePlanner: `[dayZoomOpen, setDayZoomOpen]` (numero `dayOfWeek | null`) substitui `dayDetailOpen`.

**Telemetria:** `day_zoom_open` (props: `dayOfWeek`, `profileLetter`, `source:'WeekGrid'`, `breakpoint:'lg'|'md'|'sm'`), `day_zoom_close` (props: `dayOfWeek`, `profileLetter`, `reason:'esc'|'backdrop'|'cta'|'navigation'`).

**Tests/data-testid esperados:**
- `day-zoom-modal`, `day-zoom-panel-left`, `day-zoom-panel-right`, `day-zoom-resize-handle`
- `day-zoom-tabs`, `day-zoom-tab-day`, `day-zoom-tab-biblioteca` (md breakpoint)
- `day-zoom-header-title`, `day-zoom-card-total`, `day-zoom-card-abi`, `day-zoom-card-investment`, `day-zoom-card-bankroll`
- `day-zoom-slot-{HH:mm}` (cada slot horario)
- `day-zoom-close-button`

---

### RF-02 — DnD biblioteca → time-slot + reorder dentro do dia

**Descricao:** o modal abre **dentro** de `<DragDropContext>` que ja envolve a pagina (`GradePlanner.tsx:710-1101`). `Droppable` por slot horario (`droppableId=zoom-cell-{dayOfWeek}-{slot}`) + `Draggable` para cada torneio (planejado ou da biblioteca embarcada). Reusa helpers compartilhados de `@shared/drag-drop-utils`: `validateDrop`, `mapLibraryToPlanned`, `calculateMove`. Strategy: **auto-save otimistico + toast undo 5s**.

Fluxos:
- **Add (biblioteca→slot):** `onDragEnd` detecta source biblioteca + destination slot — chama `mapLibraryToPlanned(libCard, dayOfWeek, slot)` → `POST /api/planned-tournaments` (mutation existente, reuso). Otimistic: insere card no slot antes da resposta. Rollback: se `4xx`, remove + toast erro.
- **Move (slot→slot dentro do dia):** detecta source `zoom-cell-X-S1` + destination `zoom-cell-X-S2` mesmo dia — `PUT /api/planned-tournaments/:id` com novo `startTime`. Otimistic + rollback igual.
- **Remove (slot→biblioteca):** detecta source slot + destination `zoom-biblioteca-trash` (zona X dedicada na biblioteca embarcada) — `DELETE /api/planned-tournaments/:id`. Toast undo 5s — clicar undo refaz `POST` com mesmo payload.
- **Reorder (mesmo slot):** dentro do mesmo `droppableId`, `calculateMove` reordena por `sequence` (TODO/CONFIRMAR: schema `planned_tournaments` tem campo `sequence` ou ordenacao e por `start_time` apenas? **system-architect investigar** — se nao existe, esta sprint NAO introduz, ordenacao fica por `start_time` e reorder dentro do MESMO horario vira no-op silencioso com toast informativo "Reordenar dentro do mesmo horario sera no Sprint 2").

Auto-save + undo:
- Toast Radix `<Toast>` 5s com action button "Desfazer". Hook novo: `client/src/hooks/useUndoToast.ts` que aceita `{ label, undoFn, durationMs:5000 }`.
- Rollback automatico em 4xx: reverte mutation otimistica + toast erro "Falha ao salvar — restaurado".
- DnD bloqueado quando coluna do dia esta `OFF` (paridade `WeekGrid.tsx:294` `isDropDisabled={isOff}`).

**Criterios de aceite:**
1. Drag de `LibraryCard` (biblioteca embarcada) para `zoom-cell-{dayOfWeek}-{slot}` chama mutation `POST /api/planned-tournaments` com payload de `mapLibraryToPlanned`; card aparece no slot antes da resposta (otimistic); emite `day_zoom_dnd_add`.
2. Drag de torneio entre slots do mesmo dia chama `PUT /api/planned-tournaments/:id` com novo `startTime`; emite `day_zoom_dnd_move`.
3. Drag de torneio do slot para `zoom-biblioteca-trash` chama `DELETE /api/planned-tournaments/:id`; toast "Removido — Desfazer" presente por 5s; emite `day_zoom_dnd_remove`.
4. Em mutation `4xx` (mock `apiRequest` rejeita), card volta ao estado anterior + toast erro `data-testid="day-zoom-error-toast"`.
5. Coluna dia=OFF: `Droppable` no zoom recebe `isDropDisabled={true}`; DnD bloqueado.
6. Toast undo `data-testid="day-zoom-undo-toast"` com botao `data-testid="day-zoom-undo-button"` — click chama mutation reversa e emite `day_zoom_undo`.

**Dependencias:** `react-beautiful-dnd` (ja na pagina), `@shared/drag-drop-utils` (existente, reuso direto). Mutations `apiRequest` ja existentes em `GradePlanner.tsx` (mover handlers para hook compartilhado `useDayZoomMutations` para evitar duplicacao — opcional, system-architect decide).

**Telemetria:** `day_zoom_dnd_add` (props: `dayOfWeek`, `profileLetter`, `libraryTournamentId`, `slot`, `site`, `buyIn`), `day_zoom_dnd_move` (props: `tournamentId`, `fromSlot`, `toSlot`, `dayOfWeek`), `day_zoom_dnd_remove` (props: `tournamentId`, `dayOfWeek`, `slot`), `day_zoom_undo` (props: `action:'add'|'move'|'remove'`, `tournamentId`).

**Tests/data-testid esperados:**
- `day-zoom-slot-{HH:mm}` (droppable target)
- `day-zoom-tournament-{id}` (draggable)
- `zoom-biblioteca-trash` (drop zone remove)
- `day-zoom-undo-toast`, `day-zoom-undo-button`, `day-zoom-error-toast`

**Lessons aplicaveis:** `lesson #2` (data-testid estavel); `lesson #5` (mocks `apiRequest` retornam JSON parseado direto); `lesson #14` (`await import` em tests `.tsx` de React).

---

### RF-03 — `BibliotecaEmbedded` com filtros herdando contexto do dia

**Descricao:** novo wrapper `client/src/components/grade/BibliotecaEmbedded.tsx` — versao enxuta da `BibliotecaPanel` (847 linhas) reusando `LibraryCard` e `BibliotecaQuickFilters`. NAO duplica BibliotecaPanel; e wrapper magro (~150 LoC alvo) que:

1. Carrega via `useQuery({ queryKey: ['/api/tournament-library'], queryFn: ... })` (mesma query key do BibliotecaPanel — cache compartilhado, sem fetch duplicado).
2. Aplica **filtros contextuais** ao montar baseados em `useDayDetail` data:
   - **Site dominante:** site com maior count em `volume[]`. Se >=60% dos torneios sao desse site, pre-aplica chip.
   - **Faixa buy-in:** `+/- 50%` em torno de `cards.abiUsd` (ex: ABI $5 → filtro $2.50-$7.50).
   - **Formato dominante:** se `format.pctPKO >= 50%` → pre-filtra PKO; idem turbo/vanilla.
3. Chip visivel "Limpar contexto" (`data-testid="biblioteca-clear-context"`) — limpa todos filtros contextuais; chips com `data-testid="biblioteca-context-chip-{kind}"` para cada filtro ativo.
4. Props: `{ contextFilters: ContextFilters, onAddToSlot?: (tournament, slot) => void, dayOfWeek: number, profileLetter: 'A'|'B'|'C' }`. `onAddToSlot` so usado no fallback click-to-add mobile (RF-04).
5. Header da biblioteca embarcada: input busca (debounce 300ms), chips filtro contextual + manuais, contador "N torneios" (count pos-filtro).
6. Lista virtualizada **se** `tournaments.length > 100` (TODO/CONFIRMAR threshold com system-architect; usar `react-window` ou `@tanstack/react-virtual`). Sprint 1 MUST: aceitar render direto (sem virtualizacao) ate 100 cards; >100 vira nota "muitos torneios — refine os filtros" + render dos primeiros 100. Virtualizacao plena fica pro Sprint 2/3.

**Criterios de aceite:**
1. Ao abrir o zoom, chips contextuais visiveis refletem `useDayDetail` (verificar: se mock retorna volume `[{site:'PokerStars', count:8}, {site:'GG', count:2}]` ⇒ chip "PokerStars" pre-aplicado).
2. `data-testid="biblioteca-clear-context"` click remove todos chips contextuais; estado dos filtros volta para vazio; emite `day_zoom_filter_apply` com `cleared:true`.
3. Input busca (`data-testid="biblioteca-embedded-search"`) filtra cards por `name` (case-insensitive); emite `day_zoom_search` com `{ query, resultCount }` (debounce 300ms).
4. Contador `data-testid="biblioteca-embedded-count"` reflete contagem pos-filtros.
5. Se `tournaments.length > 100` apos filtros, render exibe **banner** `data-testid="biblioteca-too-many"` + render so primeiros 100; NAO trava UI.
6. Cards renderizam `LibraryCard` com props `dragHandleProps`/`draggableProps`/`innerRef` (DnD desktop). Em mobile, render `LibraryCard` com prop nova `showAddInlineButton` (RF-04).

**Dependencias:** componente `LibraryCard` (editado RF-04 pra prop nova), `BibliotecaQuickFilters` (reuso), endpoint `GET /api/tournament-library` (existente). NAO toca `BibliotecaPanel` principal.

**Telemetria:** `day_zoom_filter_apply` (props: `dayOfWeek`, `profileLetter`, `filters:{site?, buyInMin?, buyInMax?, format?}`, `cleared?:boolean`, `resultCount`), `day_zoom_search` (props: `dayOfWeek`, `profileLetter`, `query`, `resultCount`).

**Tests/data-testid esperados:**
- `biblioteca-embedded`, `biblioteca-embedded-search`, `biblioteca-embedded-count`
- `biblioteca-context-chip-site`, `biblioteca-context-chip-buyIn`, `biblioteca-context-chip-format`
- `biblioteca-clear-context`, `biblioteca-too-many`
- `library-card-{id}` (reusa data-testid do LibraryCard existente)

**Lessons aplicaveis:** `lesson #29` (sub-arvore com `useQuery` precisa de provider OU `ErrorBoundary` local quando teste renderiza standalone — `BibliotecaEmbedded` consome `useQuery` direto; tests devem encapsular em provider OU componente deve ter `ErrorBoundary` fallback `null`).

---

### RF-04 — Feature-flag `?detail=drawer` + hover-tooltip header coluna + mobile click-to-add

**Descricao:** controla rollback safe e equivalente leve do drawer. Tres pecas:

**(a) Feature-flag `?detail=drawer`:**
- Quando URL contem `?detail=drawer`, click "Detalhes" abre `DayDetailDrawer` legacy (paridade comportamento atual). Sem flag (default), abre `DayDetailZoom`.
- Implementacao: hook novo `client/src/hooks/useDayZoomState.ts` faz parse de `window.location.search` (ou usa `useLocation` de wouter), expoe `{ mode: 'zoom' | 'drawer', open, setOpen, profileLetter, dayOfWeek }`.
- TTL: flag legacy mantida 30d pos-deploy. Apos 30d (criterio: telemetria `day_zoom_open` >0 em 95% das sessoes), abrir issue de cleanup pra deletar `DayDetailDrawer` + import + branch flag.
- Conflito flag + deep-link: se URL tem **ambos** `?detail=drawer&day=Tue`, drawer ganha (cobre rollback total); zoom NAO abre.

**(b) Hover-tooltip header coluna (4 KPIs read-only):**
- Novo componente opcional `client/src/components/grade/DayHoverTooltip.tsx` (~80 LoC) usando Radix `Tooltip` com `delayDuration={800}`.
- Trigger: `onMouseEnter` no header de cada coluna em `WeekGrid` (envolve container do botao "Detalhes"). Tooltip mostra mini-card 4 KPIs (Total/ABI/Investimento/Cobertura banca) — fetch lazy `useDayDetail` com `enabled: hovering && delayDone`.
- NAO substitui click — apenas preview leve. Click ainda abre Zoom (default) ou Drawer (com flag).
- Mobile (`< 768px` via `useIsMobile`): tooltip NAO renderiza (sem hover).

**(c) Mobile click-to-add inline:**
- `LibraryCard` ganha prop opcional `showAddInlineButton?: boolean` + `onAddInline?: () => void`. Quando true, renderiza botao `<button data-testid="library-card-add-inline-{id}">+</button>` no canto.
- `BibliotecaEmbedded` em `< 768px` passa `showAddInlineButton={true}` + `onAddInline={() => requestSlotPicker(tournament)}`. Ao clicar, abre `<Sheet>` interno simples (slot picker — lista de `TIME_SLOTS` como botoes) ou usa primeiro slot vago do dia (decisao do system-architect; sprint MUST: primeiro slot vago + toast "Adicionado as HH:mm").
- Mesma mutation `POST /api/planned-tournaments` que o DnD (paridade backend).

**Criterios de aceite:**
1. URL `/coach?detail=drawer` faz `Detalhes` abrir `<DayDetailDrawer>` (verificavel por `data-testid="day-detail-drawer"` existir e `data-testid="day-zoom-modal"` NAO existir).
2. URL `/coach` sem flag: `Detalhes` abre `<DayDetailZoom>` (`data-testid="day-zoom-modal"` presente, drawer ausente).
3. Hover no header coluna `>=800ms` mostra `data-testid="day-hover-tooltip-{dayOfWeek}"` com 4 valores. Em `< 768px`, tooltip NAO renderiza.
4. Em `< 768px`, `LibraryCard` em `BibliotecaEmbedded` mostra `data-testid="library-card-add-inline-{id}"`; click chama mutation `POST` no primeiro slot vago + toast `data-testid="day-zoom-mobile-add-toast"`.
5. Conflito query param: `?detail=drawer&day=Tue` ⇒ apenas drawer abre (zoom ignora `?day=`); `?detail=zoom` ou ausente ⇒ apenas zoom.

**Dependencias:** Radix `Tooltip` (instalado). `useIsMobile` (existente em `@/hooks/use-mobile`). NAO toca `WeekGrid` profundamente — apenas envelopa botao Detalhes em `<Tooltip>`.

**Telemetria:** `day_zoom_open` ja cobre (com `source:'WeekGrid'`). Tooltip emite **nada** (preview leve, evitar ruido). Click-to-add emite `day_zoom_dnd_add` com `source:'click_inline'` (vs default `source:'drag'`).

**Tests/data-testid esperados:**
- `day-detail-drawer` (legacy, ja existe)
- `day-zoom-modal` (novo)
- `day-hover-tooltip-{dayOfWeek}`
- `library-card-add-inline-{id}`, `day-zoom-mobile-add-toast`

**Lessons aplicaveis:** `lesson #19` (CTA targets devem casar com rotas Wouter — query param via `setLocation('/coach?day=Tue&profile=A')` NAO muda rota base, so search; safe); `lesson #29` (tooltip lazy-fetch em sub-arvore — usar `enabled` flag pra evitar fetch antes do hover).

---

### RF-05 — Telemetria 8 events ADR-207 alinhada

**Descricao:** instrumentar **8 dot-events** via helper compartilhado `emit` de `@/lib/tracker`. Eventos alinhados com convencao ADR-207 (Sprint MP-VALIDATION RF-01: dot-namespace `day_zoom.*` ou underscore — system-architect decide alinhamento exato com ADR-207 §schema; sprint usa underscore para casar com `day_detail_drawer_open` existente).

| # | Event | Trigger | Props obrigatorias |
|---|---|---|---|
| 1 | `day_zoom_open` | Modal abre | `dayOfWeek`, `profileLetter`, `source:'WeekGrid'\|'deeplink'`, `breakpoint:'lg'\|'md'\|'sm'` |
| 2 | `day_zoom_close` | Modal fecha | `dayOfWeek`, `profileLetter`, `reason:'esc'\|'backdrop'\|'cta'\|'navigation'`, `durationMs` (tempo aberto) |
| 3 | `day_zoom_dnd_add` | Card biblioteca→slot OR click-inline mobile | `dayOfWeek`, `profileLetter`, `libraryTournamentId`, `slot`, `site`, `buyIn`, `source:'drag'\|'click_inline'` |
| 4 | `day_zoom_dnd_move` | Slot→slot mesmo dia | `tournamentId`, `dayOfWeek`, `fromSlot`, `toSlot` |
| 5 | `day_zoom_dnd_remove` | Slot→trash | `tournamentId`, `dayOfWeek`, `slot` |
| 6 | `day_zoom_filter_apply` | Chip aplicado/removido | `dayOfWeek`, `profileLetter`, `filters:object`, `cleared?:bool`, `resultCount` |
| 7 | `day_zoom_search` | Input busca debounced 300ms | `dayOfWeek`, `profileLetter`, `query`, `resultCount` |
| 8 | `day_zoom_undo` | Click "Desfazer" no toast | `action:'add'\|'move'\|'remove'`, `tournamentId`, `dayOfWeek` |

**PII guard:** nenhum dos events captura email/password/token — apenas `tournamentId` (nanoid opaco), `site` (nome enum), `buyIn` (numero), `slot` (string `HH:mm`). Alinhado com `shared/pii-keys` ja existente (lesson MP-VALIDATION).

**Cap delete:** 3 meses pos-deploy. Criar TODO grepavel `// TODO(2026-08-23): cleanup day_zoom_* events apos analise adocao` em local centralizado (ex: `client/src/lib/tracker.ts` ou ADR-207 update).

**Criterios de aceite:**
1. Cada event do tabela acima emite no trigger correto com props obrigatorias (mock `vi.spyOn(tracker, 'emit')`); tests asseguram que `emit.mock.calls[i][0] === 'day_zoom_open'` etc.
2. Todos events sao **fire-and-forget** (NAO bloqueiam UI, NAO `await`). `try { emit(...) } catch {}` em volta para resilience.
3. Eventos NAO contem nenhuma das chaves de `shared/pii-keys` (test guard automatizado se existe convention test; senao smoke manual).
4. `day_zoom_close.durationMs` calculado como `Date.now() - openedAt` (state ref local).

**Tests/data-testid esperados:** N/A (events nao tem dom; testar via spy em `emit`).

---

## 3. Escopo — OUT (Sprint 2/3)

Itens explicitamente fora do Sprint 1, com criterio de promocao:

| # | Item | Por que OUT | Criterio promocao |
|---|---|---|---|
| 1 | Bulk multi-select (Shift+click pra selecionar varios torneios e mover/deletar em batch) | Escopo grande; precisa state machine selecao + atalhos | Telemetria adocao Sprint 1: `day_zoom_dnd_add` >40% das sessoes WAU em 14d ⇒ promove |
| 2 | Undo stack completo (Cmd+Z multi-step, NAO apenas toast 5s) | Requer undo manager global / Reducer; conflita com mutations otimisticas existentes | Feedback founder pos-deploy "preciso desfazer N passos" |
| 3 | Atalhos teclado `/` (search), `f` (filter), `←→` (navegar dia) | Sprint 1 ja tem ESC; mais atalhos = curva aprendizado + colisao com `Cmd-/` da MP-MODERN | Telemetria `day_zoom_search` alta + pedido founder |
| 4 | Comparativo lado-a-lado A/B/C (toggle no header pra editar perfil inativo) | Decisao 3 do founder explicita: Sprint 2 SHOULD | Sprint 1 entregue + 30d uso real |
| 5 | Smart suggestions Coach AI ("torneios que combinam com seu perfil neste dia") | Requer tool nova / chamada Coach IA; aumenta custo | AI-3.2+ stabilizado |
| 6 | Preset "copiar dia anterior" (one-click) | Util mas escopo de feature separada | Pedido founder |
| 7 | Export CSV do dia | Util para tax / coaches; baixa freq | Feedback pos-deploy |
| 8 | Virtualizacao biblioteca >100 cards | Sprint 1 entrega banner "muitos torneios"; virtualizacao real (react-window ou @tanstack/react-virtual) requer testes complicados | Telemetria: media `tournaments.length` >100 em >30% das sessoes |
| 9 | Migracao @dnd-kit (mobile DnD funcional) | MP3 ja iniciou @dnd-kit; coach inteiro migrara em sprint dedicado | Sprint follow-up post-MP3-stable |
| 10 | Reorder dentro do MESMO horario (se schema nao tem `sequence`) | Decisao schema; ver RF-02 TODO | system-architect confirma + ADR |

---

## 4. Modelo de dados

**Zero migration.** Reuso completo.

- **`useDayDetail`** retorna `DayDetailResponse { cards, format, volume, bankroll, list }` — shape estavel (confirmado em `client/src/hooks/useDayDetail.ts:55-61`).
- **`tournament-library`** (`/api/tournament-library` GET) — array de torneios catalogados (shape exato consumido por `BibliotecaPanel`; reuso direto via mesma `queryKey` ⇒ cache compartilhado, **sem** fetch duplicado).
- **`planned-tournaments`** CRUD existente — POST/PUT/DELETE inalterados; payload de `mapLibraryToPlanned` ja produz shape valido (testado em `tests/unit/tournament-library/drag-drop-mapping.test.ts`).

**TODO/CONFIRMAR (system-architect):**
- Schema `planned_tournaments` tem campo `sequence` para ordenacao explicita dentro do mesmo slot/horario? Se nao, RF-02 reorder mesmo-slot vira no-op silencioso ate Sprint 2 introduzir.
- Shape exato do `LibraryCard.tournament` (campo `buyIn` string vs number — `LibraryCard.tsx:47` faz `parseFloat(tournament.buyIn || "0")`). Confirmar que `mapLibraryToPlanned` aceita esse shape direto.

---

## 5. API endpoints

**Zero novos endpoints.** Reuso:

| Metodo | Rota | Uso na sprint | Status |
|---|---|---|---|
| GET | `/api/grade/day-detail/:profile/:dayOfWeek` | `useDayDetail` reuso direto | Existente (Sprint F4) |
| GET | `/api/tournament-library` | `BibliotecaEmbedded` reuso queryKey | Existente |
| GET | `/api/planned-tournaments?dayOfWeek=N` | Lista torneios do dia para painel esquerdo | Existente |
| POST | `/api/planned-tournaments` | DnD add + click-inline mobile | Existente |
| PUT | `/api/planned-tournaments/:id` | DnD move (slot→slot) | Existente |
| DELETE | `/api/planned-tournaments/:id` | DnD remove (slot→trash) | Existente |

---

## 6. Componentes novos

| Path | Responsabilidade | LoC alvo |
|---|---|---|
| `client/src/components/grade/DayDetailZoom.tsx` | Modal principal Radix Dialog + PanelGroup split | ~350 |
| `client/src/components/grade/BibliotecaEmbedded.tsx` | Wrapper enxuto biblioteca com filtros contextuais | ~180 |
| `client/src/components/grade/DayHoverTooltip.tsx` | Tooltip 800ms 4 KPIs read-only no header coluna (opcional, MUST RF-04) | ~80 |
| `client/src/hooks/useDayZoomState.ts` | Gerencia `open/close + ?day=&profile= deep-link + mode (zoom\|drawer)` | ~120 |
| `client/src/hooks/useUndoToast.ts` | Toast 5s com action undo (compartilhavel pos-sprint) | ~60 |

---

## 7. Componentes editados

| Path | Mudanca |
|---|---|
| `client/src/pages/GradePlanner.tsx` | Substituir state `dayDetailOpen` por hook `useDayZoomState`. Render condicional: `mode==='drawer' ? <DayDetailDrawer/> : <DayDetailZoom/>`. Import legacy preservado (RF-04). Handler `handleDragEnd` recebe novos `droppableId` patterns (`zoom-cell-X-S`, `zoom-biblioteca-trash`). |
| `client/src/components/grade-planner/WeekGrid.tsx` | Botao `Detalhes` (linhas 257-268) — handler agora chama `onOpenDayZoom(dayOfWeek)` em prop nova (renomeavel de `onShowDayDetails`). Envolver container do botao em `<DayHoverTooltip>` (RF-04 b). |
| `client/src/components/grade-planner/LibraryCard.tsx` | Adicionar props opcionais `showAddInlineButton?: boolean` + `onAddInline?: () => void`. Renderizar botao `+` quando flag true. Compativel com uso atual (BibliotecaPanel passa nada ⇒ comportamento inalterado). |

---

## 8. Flow detalhado (happy path DnD add)

```
1. User clica "Detalhes" em WeekGrid header coluna Terca, perfil A
2. WeekGrid.onShowDayDetails(2) → GradePlanner handler
3. useDayZoomState.setOpen(2) → setLocation('/coach?day=Tue&profile=A')
4. <DayDetailZoom open={true} dayOfWeek={2} profileLetter='A'/> render
5. useDayDetail({ open:true, profileLetter:'A', dayOfWeek:2 }) fetch GET /api/grade/day-detail/A/2
6. Painel esquerda: skeleton → render 4 cards + slots com torneios planejados (POST GET /api/planned-tournaments?dayOfWeek=2)
7. Painel direita: BibliotecaEmbedded carrega /api/tournament-library, aplica filtros contextuais (site dominante = PokerStars, ABI range $2.50-$7.50)
8. emit('day_zoom_open', { dayOfWeek:2, profileLetter:'A', source:'WeekGrid', breakpoint:'lg' })
9. User arrasta LibraryCard "Sunday Million" da biblioteca pro slot 20:00
10. onDragEnd detecta source='biblioteca-embedded' destination='zoom-cell-2-20:00'
11. mapLibraryToPlanned({...}, 2, '20:00') → payload { name:'Sunday Million', site:'PokerStars', dayOfWeek:2, startTime:'20:00', buyIn:'5.50', profile:'A', ... }
12. Otimistic: insere card no slot 20:00 do estado local (queryClient.setQueryData)
13. mutation POST /api/planned-tournaments { ... } — apiRequest
14a. Sucesso (201): queryClient.invalidateQueries(['planned-tournaments', userId]) + emit('day_zoom_dnd_add', {...})
14b. Falha (4xx): rollback (queryClient.setQueryData revertendo) + toast erro "Falha ao salvar — restaurado" + emit('day_zoom_dnd_add' NAO emitido)
15. Toast Radix render 5s com action "Desfazer"
16. (opcional) User clica "Desfazer" → DELETE /api/planned-tournaments/:id → emit('day_zoom_undo', { action:'add', tournamentId, dayOfWeek:2 })
17. User aperta ESC → setOpen(null) → setLocation('/coach') → emit('day_zoom_close', { dayOfWeek:2, profileLetter:'A', reason:'esc', durationMs:48230 })
```

---

## 9. Empty states + loading

- **Dia vazio + biblioteca cheia:** painel esquerda renderiza hero `<EmptyState icon="MoveRight" title="Arraste seu primeiro torneio" description="Use a biblioteca ao lado para preencher esta grade." />` + seta animada (CSS keyframe) apontando para direita. `data-testid="day-zoom-empty-day"`. Telemetria: NAO event proprio (cobre `day_zoom_open` ja).
- **Loading:** skeleton split simetrico:
  - Esquerda: 4 skeleton cards grid 2x2 + 4 skeleton slots row vertical.
  - Direita: 6 skeleton library cards stacked.
  - Renderiza dentro de 200ms para feedback imediato; substitui por conteudo quando ambas queries resolvem.
  - `data-testid="day-zoom-skeleton"`.
- **Erro carga `useDayDetail`:** painel esquerda mostra `<EmptyState icon="AlertCircle" title="Falha ao carregar detalhes" description="Tente novamente em alguns instantes." action={{ label:'Recarregar', onClick: () => query.refetch() }}/>`. Biblioteca embarcada continua renderizando (independente).
- **Erro DnD 4xx:** toast erro Radix com `data-testid="day-zoom-error-toast"` + rollback otimistico (RF-02 criterio 4).
- **Biblioteca vazia (`/api/tournament-library` retorna `[]`):** painel direita mostra `<EmptyState icon="Library" title="Biblioteca vazia" description="Adicione torneios em /coach aba Biblioteca." action={{ label:'Ir para Biblioteca', onClick: () => setLocation('/coach?tab=biblioteca') }}/>`. `data-testid="day-zoom-empty-library"`.

---

## 10. Telemetria — tabela canonica

Ver §RF-05 acima. Schema centralizado, props obrigatorias por event. Cap delete `2026-08-23` (3 meses pos-deploy).

---

## 11. Edge cases / riscos

1. **DnD entre perfis diferentes:** se coluna alvo do dia esta `OFF` ou em perfil B/C enquanto modal mostra perfil A, drop e bloqueado (`isDropDisabled={true}` no Droppable). Cover: RF-02 criterio 5.
2. **Conflito query param `?detail=drawer&day=Tue&profile=A`:** drawer ganha (RF-04 criterio 5). Zoom NAO abre. Logica: parse de `useDayZoomState` checa `mode==='drawer'` primeiro.
3. **Multiplos torneios no mesmo slot/horario:** ordenacao alvo por `start_time` (existe) + `name` (fallback alfabetico). Se schema introduz `sequence` em Sprint 2, reorder vira funcional.
4. **F5 com modal aberto:** URL preserva `?day=Tue&profile=A`. Hook `useDayZoomState` ao montar le query params → `setOpen(2)` automatico → modal abre. Cover: criterio aceite global §14 item 4.
5. **User remove ultimo torneio do dia:** estado empty + CTA "Arraste seu primeiro torneio" visivel. Cover: §9.
6. **Biblioteca vazia:** mensagem + CTA link. Cover: §9.
7. **PanelResizeHandle quebrado (Storybook ou prerender SSR):** fallback CSS — `react-resizable-panels` v2+ tolera ausencia de `window`; ainda assim envolver render do split em `if (typeof window !== 'undefined')` para guard SSR (lesson #4 SSR guard hook).
8. **Mock `apiRequest` em tests retornando shape errado:** lesson #3 + #13 — sempre validar shape REAL antes de mockar. Aplica em todos os tests que mockam `POST /api/planned-tournaments` (deve retornar objeto torneio criado, NAO `Response`).
9. **`vi.mock` por path mismatch:** lesson #28 — tests de DayDetailZoom devem mockar exatamente o path importado (`@/components/grade/BibliotecaEmbedded`, NAO `@/components/grade-planner/BibliotecaPanel`).
10. **DnD context herdado por modal:** Radix `<Dialog.Portal>` renderiza em `document.body` por padrao — fora da arvore React do `DragDropContext`. **Risco real:** `react-beautiful-dnd` pode nao funcionar quando children estao em portal. **Mitigacao:** usar prop `container` do Radix Portal para apontar para `<div ref={dndContainerRef}/>` dentro do DragDropContext (TODO/CONFIRMAR system-architect — se nao funcionar, alternativa: Dialog SEM Portal usando `Dialog.Root modal={false}` + posicionamento manual fixed, ou migrar Zoom pra container-based modal nao-portal). **Este e o risco tecnico #1 da sprint.**
11. **Coluna dia=OFF clicada (botao Detalhes nao aparece):** ja coberto por `WeekGrid.tsx:240` `{!isOff && ...}`. Zoom nao abre.

---

## 12. Lessons learned aplicaveis

Citar explicitamente para test-writer + implementer evitar regressao:

- **#2 (data-testid estavel):** todos os testids listados em RFs sao **MUST**. Nao usar heuristica DOM (`findByText`) em testes do zoom.
- **#3 (mocks idealizados):** validar shape REAL de `/api/planned-tournaments` POST response antes de mockar — checar `tests/unit/tournament-library/drag-drop-*.test.ts` que ja mocka. Reusar fixtures se existirem.
- **#5 (`vi.fn()` nao e constructor):** N/A nesta sprint (sem SDK externo via `new`).
- **#13 (`apiRequest` retorna JSON parseado, NAO Response):** mocks devem retornar objeto JSON direto, nao `{ ok, json: () => ... }`. Aplica em RF-02 mutations.
- **#14 (`require()` em tests `.tsx` quebra com deps ESM):** test-writer DEVE usar `await import(...)` em testes que carregam `DayDetailZoom` / `BibliotecaEmbedded`. NAO `require()`.
- **#19 (CTA targets devem casar com rotas Wouter):** deep-link `?day=Tue&profile=A` NAO muda rota base — apenas search; `setLocation('/coach?day=Tue&profile=A')` safe.
- **#28 (`vi.mock` por path exato):** mockar `@/components/grade/BibliotecaEmbedded` no path EXATO do import; criar re-export se necessario.
- **#29 (sub-arvore com `useQuery` sem provider → ErrorBoundary):** `BibliotecaEmbedded` usa `useQuery`; tests que renderizam standalone precisam de `QueryClientProvider` OU componente deve ter `ErrorBoundary` fallback `null`. Aplicar pattern Sidebar (sub-componente + ErrorBoundary local).
- **#34 (storage 3o arg injetado em handlers):** N/A frontend; ja todos endpoints existem.
- **#36 (modulo storage que mocka `drizzle-orm` parcialmente):** N/A frontend.
- **#38 (mix `await import` + `require` quebra Context):** test-writer NUNCA misturar; padronizar `await import()` em arquivos de test do zoom.
- **MP-VALIDATION lessons:** PII guard via `shared/pii-keys`. Telemetria fire-and-forget. Cap delete documentado.

---

## 13. Criterios de aceite globais Sprint 1

- [ ] Zoom abre em <300ms TTI percebido (verify manual em DevTools Performance tab, lighthouse score >=80).
- [ ] DnD funcional 100% em viewport `>=1024px` (split horizontal).
- [ ] DnD funcional 100% em viewport `768-1023px` (tabs — drop entre abas pode ser limitado, click-to-add cobre).
- [ ] Click-to-add funcional 100% em viewport `<768px` (DnD desabilitado, botao `+` em cada LibraryCard).
- [ ] F5 com URL `/coach?day=2&profile=A` restaura modal aberto no dia/perfil correto.
- [ ] URL `/coach?detail=drawer` faz `DayDetailDrawer` legacy abrir (rollback safe).
- [ ] `tsc` 0 erros novos. `vitest` sprint suite verde (target: ~40-60 tests novos).
- [ ] Telemetria 8 events emitindo corretamente (smoke verify manual + tests com `vi.spyOn(tracker, 'emit')`).
- [ ] Zero regressao em suites adjacentes: `WeekGrid`, `BibliotecaPanel`, `GradePlanner`, `DayDetailDrawer` (legacy) — verde.
- [ ] Lessons aplicaveis (§12) **endereçadas** em PR (review checklist).

---

## 14. Open questions remanescentes (system-architect / test-writer aprofundam)

1. **Schema `planned_tournaments.sequence`:** existe? Se nao, reorder mesmo-slot vira no-op com toast informativo Sprint 1; introduzir em Sprint 2 com migration. (system-architect confirma + ADR.)
2. **Radix Dialog Portal + react-beautiful-dnd:** Portal renderiza fora da arvore React do `DragDropContext`. Validar se DnD funciona dentro de Dialog portal-based. Se nao, alternativas: (a) `<Dialog.Portal container={dndContainerRef.current}>`, (b) modal SEM portal posicionado fixed, (c) `Dialog.Root modal={false}`. **Risco tecnico #1.** (system-architect investiga + decide; pode requerer spike de 1h.)
3. **Threshold virtualizacao biblioteca:** 100 cards e arbitrario. Medir P99 render time em maquinas baixas; se >50ms, baixar threshold pra 50 (e Sprint 2 promove virtualizacao real). (system-architect + test-writer.)
4. **Schema exato dos events ADR-207:** alinhamento `day_zoom_*` (underscore) vs `day_zoom.*` (dot-namespace MP-VALIDATION). Confirmar com ADR-207 §schema; default sprint usa underscore para casar com `day_detail_drawer_open` existente. (system-architect alinha.)
5. **`react-resizable-panels` em Storybook / test environment:** funciona em jsdom sem `window.matchMedia`? Polyfill necessario em `tests/setup.ts`? (test-writer investiga; lesson #15 polyfill setup.)
6. **Click-to-add mobile — primeiro slot vago vs slot picker:** sprint MUST = primeiro slot vago. Slot picker explicito (Sheet com lista de TIME_SLOTS) e melhor UX mas custo extra ~0.5d. (system-architect decide; pode promover pra Sprint 2 se apertar.)

---

## 15. Estimativa

| RF | Dias | Notas |
|---|---|---|
| RF-01 (Modal central + split + responsivo) | 2.0 | Risco Portal+DnD pode adicionar 0.5d |
| RF-02 (DnD biblioteca→slot + reorder + undo) | 2.0 | Reusa helpers `@shared/drag-drop-utils`; rollback otimistico e ~0.5d |
| RF-03 (BibliotecaEmbedded + filtros contextuais) | 1.0 | Wrapper enxuto reusando LibraryCard + chips |
| RF-04 (Feature-flag + tooltip + mobile click-add) | 1.0 | Tooltip simples; flag e parse URL |
| RF-05 (Telemetria 8 events + caps + guards) | 1.0 | Instrumentacao + tests via spy |
| **Total** | **7.0** | **+0.5-1.0d buffer para Portal+DnD risk** |

Pipeline TDD aplica ~`7d dev + 2d testes + 1d review = ~10d sprint total`.

---

## 16. Notas finais para system-architect

- Criar ADR novo (numero proximo, provavelmente ~211+) consolidando: (a) decisao Dialog central + split, (b) Portal+DnD strategy escolhida, (c) feature-flag rollback policy 30d, (d) telemetria 8 events alinhamento ADR-207, (e) reuso queryKey cache `/api/tournament-library`.
- Diagrama Mermaid: sequencia happy path DnD add (passos 1-17 do §8) + arquitetura componentes (`GradePlanner → useDayZoomState → DayDetailZoom → { LeftPanel(useDayDetail), BibliotecaEmbedded(useQuery library) }`).
- Confirmar shape de retorno endpoint `POST /api/planned-tournaments` (test-writer precisa pra mockar com fidelidade — lesson #3).
- Decidir e documentar Portal+DnD (risco tecnico #1) ANTES de test-writer comecar.

**Status pos-arquitetura:** marcar `Status: ARCHITECTED` + entregar para test-writer.

---

## 17. Addendum system-architect (2026-05-23, ADR-210)

system-architect produziu `Docs/architecture/decisions/210-day-detail-zoom-architecture.md` + 2 diagramas `Docs/architecture/diagrams/day-detail-zoom/{architecture-components,dnd-sequence-happy-path}.mermaid`. Mudancas que afetam contrato da spec (test-writer + implementer DEVEM seguir o ADR — divergencias abaixo):

### Telemetria — namespace migrado para ADR-207 compliance

Spec usou underscore `day_zoom_open`. ADR-210 §6 migrou os 8 eventos para dot-namespace `coach.day_zoom_*` para casar com ADR-207. Renomes:

| Spec underscore (obsoleto) | ADR-210 final (use este) |
|---|---|
| `day_zoom_open` | `coach.day_zoom_opened` |
| `day_zoom_close` | `coach.day_zoom_closed` |
| `day_zoom_dnd_add` | `coach.day_zoom_dnd_add` |
| `day_zoom_dnd_move` | `coach.day_zoom_dnd_move` |
| `day_zoom_dnd_remove` | `coach.day_zoom_dnd_remove` |
| `day_zoom_filter_apply` | `coach.day_zoom_filter_apply` |
| `day_zoom_search` | `coach.day_zoom_search` |
| `day_zoom_undo` | `coach.day_zoom_undo` |

`feature` field em TODOS os 8: `'day_zoom'`. Cap delete `2026-08-23` mantido.

### Open questions — resolvidas

| Q | Decisao ADR-210 |
|---|---|
| Q1 schema `sequence` | **Nao existe** (`shared/schema.ts:533-590` confirmado). Reorder mesmo-slot vira no-op com toast "Sprint 2". Sem migration. |
| Q2 Portal+DnD | **Alternativa A** — `DialogPortal container={ref}` apontando para `<div ref={dndPortalRef}>` dentro do `<DragDropContext>` em GradePlanner. Smoke test obrigatorio para drag clone position. Fallback CSS `transform: none` se quebrar. |
| Q3 threshold biblioteca | **Mantem 100** sem virtualizacao. Banner `data-testid="biblioteca-too-many"` >100. Adicionar `library_count` em metadata de `coach.day_zoom_opened` para medir promocao Sprint 2. |
| Q4 namespace telemetria | **Dot-namespace `coach.day_zoom_*`** (ADR-207 compliance, ver tabela acima). |
| Q5 jsdom polyfill | **ResizeObserver minimal polyfill em `tests/setup.ts`** (observe/unobserve/disconnect no-op). Resize real NAO testado em jsdom — verify manual §13. |
| Q6 slot picker mobile | **Primeiro slot vago** (helper `findFirstFreeSlot`). Picker explicito defer Sprint 2. |

### Spike Portal+DnD (resumo)

- **A (Portal container ref):** mantem Radix Portal + focus trap + Esc + overlay. Render condicional pos-mount do ref. **ESCOLHIDA.**
- **B (`modal={false}`):** descartada — perde focus trap, overlay, Esc (a11y break).
- **C (modal custom sem Radix):** descartada — reimplementa 80% do Radix, foge da convencao do projeto.

Risco residual: `react-beautiful-dnd` drag clone usa `position: fixed` que quebra em ancestor com `transform`. `DialogContent` default tem `translate-x-[-50%] translate-y-[-50%]`. Mitigacao CSS documentada no ADR. Cap 0.5d para fallback; se exceder, ship com DnD off no zoom + Sprint 1.1.

### Componente: `BibliotecaEmbedded` ErrorBoundary interno

ADR-210 reforca lesson #29: `BibliotecaEmbedded` usa `useQuery` direto; recomenda **ErrorBoundary interna** com fallback null (pattern Sidebar) para hardening producao alem dos tests. Test-writer aplica em tests que renderizam standalone sem provider.
