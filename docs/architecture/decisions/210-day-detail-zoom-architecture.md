# ADR-210: DayDetailZoom — modal central + split + DnD herdado + flag rollback 30d

## Status

Aceito — 2026-05-23.

Cobre Sprint **day-detail-zoom-1** (`Docs/specs/sprint-day-detail-zoom-1.md`). Consolida 5 decisoes arquiteturais que sustentam os 5 RFs MUST. Aprovado pelo founder via spec; este ADR fixa o "como" antes do test-writer.

## Data

2026-05-23

## Contexto

A pagina `/coach` (GradePlanner) hoje usa `DayDetailDrawer` (`<Sheet side="right">`, Sprint F4 RF-01) — read-only, lateral, forca segundo modal (`EditDialog`) para editar um dia. Fluxo: 3 cliques + 2 modais.

Founder pediu pivot: modal **central** com "zoom" no dia + biblioteca embarcada ao lado para DnD direto. Modelo mental: "estou trabalhando NESTE dia agora" (paridade Notion/Linear). Spec especifica split 60/40 via `react-resizable-panels` (ja instalado), DnD biblioteca→slot, otimistic + undo toast 5s, feature-flag rollback 30d.

Cinco decisoes ortogonais precisam ser fixadas **antes** do test-writer:

1. **Tipo de modal:** Radix `Dialog` central vs `Sheet` (lateral) vs custom inline. Spec ja escolheu `Dialog`; ADR precisa justificar + documentar geometria (~90vw × 88vh) e responsive.
2. **Estrategia split:** `react-resizable-panels` ja decidida; ADR fixa range 45-75% + persistencia localStorage + breakpoints (>=1024 split, 768-1023 tabs, <768 fullscreen tabs com DnD off).
3. **Portal + DnD herdado:** o **risco tecnico #1** da spec. `DragDropContext` envolve `GradePlanner` inteiro (`pages/GradePlanner.tsx:710-1101`); Radix Dialog renderiza via `<DialogPortal>` em `document.body`. Como manter o DnD funcional dentro do modal? Tres alternativas (spike 1h abaixo).
4. **Auto-save model:** otimistic + undo toast 5s (Notion/Linear) vs commit explicito vs auto-save sem undo. Spec ja escolheu otimistic + undo; ADR formaliza.
5. **Rollback policy:** feature-flag `?detail=drawer` 30d + criterio de cleanup. ADR fixa TTL + condicao de deprecacao.

**Precedentes relevantes ja no projeto:**

- **ADR-187 (AudioSourceEngine MP1):** abstracao engine + driver pattern para swap futuro (HTML5 → Spotify). Mesma logica aqui: `DayDetailDrawer` (legacy) e `DayDetailZoom` (novo) coexistem 30d via flag — driver swap controlado por query param.
- **ADR-193 (Queue UI persistence MP3):** localStorage primario + server snapshot best-effort. Aqui: `localStorage["dayZoom.split.pct"]` segue mesmo padrao (UI state local, NAO envia server).
- **ADR-207 (recordActivity event convention):** dot-namespace `domain.event` (e.g. `audio.play`). Spec usa underscore `day_zoom_open` para casar com `day_detail_drawer_open` legacy. **Este ADR decide alinhamento** (Q4 da spec).
- **ADR-011 (react-beautiful-dnd choice):** library DnD ja escolhida; sem mudanca aqui. `@dnd-kit/core 6.3.1` ja no `package.json` (MP3 queue) — migracao plena fica Sprint follow-up (escopo OUT #9 da spec).

**Forcas em jogo:**

- DnD nao pode ser refatorado nesta sprint (escopo grande, risco regressao em GradePlanner producao).
- Spec quer modal abrir **dentro** do `DragDropContext` ja existente para herdar contexto.
- Radix Dialog Portal e default — desligar Portal quebra acessibilidade (focus trap, Esc, overlay z-index) e exige reimplementacao custom.
- Test-writer precisa de answer cravado em `sequence` (Q1), Portal+DnD (Q2), telemetria namespace (Q4), threshold biblioteca (Q3), jsdom panels (Q5), slot picker mobile (Q6) — sem o ADR ele bloqueia.

## Spike Portal + DnD (Q2 — risco tecnico #1)

Investigacao 1h antes deste ADR. Trade-offs avaliados:

### Alternativa A — `<DialogPortal container={dndContainerRef.current}>`

Radix `Dialog.Portal` aceita prop `container?: HTMLElement`. Renderiza filhos dentro do node passado **em vez de** `document.body`. O wrapper precisa ser um `<div ref={dndContainerRef}>` dentro do `<DragDropContext>` em `GradePlanner.tsx`.

```tsx
// GradePlanner.tsx (ja envolvido em <DragDropContext>)
const dndPortalRef = useRef<HTMLDivElement | null>(null);
return (
  <DragDropContext onDragEnd={handleDragEnd}>
    {/* ...header, WeekGrid, BibliotecaPanel... */}
    <div ref={dndPortalRef} id="dnd-portal-container" />
    <DayDetailZoom open={...} portalContainer={dndPortalRef.current} />
  </DragDropContext>
);

// DayDetailZoom.tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogPortal container={portalContainer ?? undefined}>
    <DialogOverlay />
    <DialogPrimitive.Content className="...">
      {/* children with <Droppable>/<Draggable> */}
    </DialogPrimitive.Content>
  </DialogPortal>
</Dialog>
```

**Pros:**
- Modal renderiza dentro da arvore React **e** DOM do `DragDropContext` → DnD funciona sem hack.
- Mantem Portal benefits (z-index isolado do parent stacking context; overlay full-viewport).
- Radix focus trap + Esc + click-outside continuam funcionando.
- Acessibilidade preservada (aria attrs, role=dialog).

**Cons:**
- O container ref e `null` no primeiro render — `DialogPortal` cai no default `document.body` ate `useEffect` setar. Mitigacao: render `<DayDetailZoom>` apenas apos `mounted` (state local `useEffect` set true) OR usar `useLayoutEffect`. Pattern Sidebar-like.
- Se container e remontado/deletado, portal explode. Mitigacao: ref estavel dentro de DragDropContext que NUNCA desmonta (top-level GradePlanner div).

### Alternativa B — `Dialog modal={false}` (sem Portal, posicionamento fixed manual)

`Dialog.Root modal={false}` desliga overlay backdrop + focus trap. Conteudo renderiza inline (sem Portal por default? NAO — `Dialog.Portal` ainda envelopa, mas pode ser substituido por render condicional sem `<Portal>`).

**Pros:**
- Sem dependencia de container ref.
- Funciona em qualquer ancestor tree.

**Cons:**
- **Perde focus trap** (acessibilidade WCAG falha — user pode tabular para fora do modal).
- **Perde overlay backdrop** (precisa reimplementar `<div className="fixed inset-0 bg-black/80 z-40" />` manualmente; click-outside-to-close idem).
- **Perde Esc handler nativo** (precisa `useEffect` global listener).
- Reimplementa ~80% do que Radix entrega; muita superficie nova para test-writer cobrir.

**Veredito:** descartada. Custo de manutencao > beneficio.

### Alternativa C — Modal custom (sem Radix)

`<div className="fixed inset-0 z-50">` + overlay + content. Sem Portal.

**Pros:**
- Renderiza inline dentro do `DragDropContext` por construcao.
- Zero risco Portal+DnD.

**Cons:**
- Reimplementa **tudo** que Radix entrega (focus trap via `@radix-ui/react-focus-scope` ou `focus-trap-react`, Esc, click-outside, aria, animation).
- Foge do padrao do projeto (todos os modais usam `@/components/ui/dialog`).
- Estilo + a11y precisam de review dedicado.

**Veredito:** descartada — viola convencao + custo alto.

### Decisao spike: **Alternativa A** (Portal com `container` prop)

`react-beautiful-dnd` propaga contexto via **React tree** (nao DOM tree). Portal mantem o React tree (filhos do Portal ainda estao na arvore React do parent), entao `<Droppable>` consegue ler o `DragDropContext` mesmo renderizando em outro node DOM.

**Mas**: `react-beautiful-dnd` usa `position: fixed` no drag clone, que **quebra** em ancestor com `transform`/`will-change`/`filter` (cria novo containing block fixed). O `DialogContent` default tem `translate-x-[-50%] translate-y-[-50%]` (CSS transform). **Mitigacao confirmada por implementacao de referencia da react-beautiful-dnd FAQ**: clone do drag deve usar `react-portal` para escapar do transform — biblioteca ja faz isso quando detecta. Confirmar em smoke test do test-writer.

**Mitigacao adicional no ADR:** se smoke test falhar (drag clone aparece em posicao errada), fallback documentado:

1. Remover `translate` do `DialogContent` + posicionar via `top:50%; left:50%; margin:-44vh 0 0 -45vw` (sem transform).
2. OR adicionar `transform: none !important` no clone via CSS override.
3. OR migrar este modal especifico para `@dnd-kit/core` (ja no package.json) — mas Sprint 1 NAO faz isso (escopo OUT #9).

Cap de tempo da mitigacao: 0.5d. Se exceder, abrir issue **DAY-ZOOM-DND-FALLBACK** + ship com DnD desabilitado no zoom (apenas click-to-add cobre RF-02), promover correcao para Sprint 1.1.

## Decision

### 1. Modal central Radix Dialog (NAO Sheet)

Componente `client/src/components/grade/DayDetailZoom.tsx` usa `<Dialog>` + `<DialogContent>` (`@/components/ui/dialog`). Geometria:

- **`>=1024px`:** `sm:max-w-[1280px] w-[90vw] h-[88vh]`. Centro via Radix default.
- **`768-1023px`:** `w-[95vw] h-[92vh]` + conteudo vira `<Tabs>` (Dia / Biblioteca).
- **`<768px`:** `w-screen h-screen max-w-none rounded-none` (fullscreen) + `<Tabs>` + DnD `isDropDisabled={true}` em todos `<Droppable>`.

Justificativa vs `Sheet`: founder pediu explicit "central, NAO lateral"; modal central afirma o modelo mental "estou trabalhando NESTE dia". Sheet lateral consume metade da viewport sem afirmar foco.

### 2. Split 60/40 via `react-resizable-panels` v2.1.7

`<PanelGroup direction="horizontal" autoSaveId="dayZoom.split">` + `<Panel defaultSize={60} minSize={45} maxSize={75}>` (esquerda) + `<PanelResizeHandle>` + `<Panel defaultSize={40} minSize={25} maxSize={55}>` (direita).

Persistencia: `localStorage["dayZoom.split.pct"]` (escrito debounced 300ms via `onResize` handler — `autoSaveId` da lib persiste sozinho, mas spec pediu chave explicita para grep futuro). Apenas no breakpoint `>=1024px`. Em `768-1023` + `<768`, split NAO renderiza (vira tabs).

### 3. Portal + DnD: Alternativa A (container ref)

Decidida na spike acima. `DayDetailZoom` aceita prop `portalContainer?: HTMLElement | null` que e passada para `<DialogPortal container={...}>`. `GradePlanner` cria `<div ref={dndPortalRef} id="dnd-portal-container" />` dentro do `<DragDropContext>` e passa o ref.current. Render condicional `<DayDetailZoom>` so apos `useEffect` montar `dndPortalRef.current !== null`.

**Patterns proibidos:**
- NAO usar `modal={false}` (perde focus trap).
- NAO reimplementar overlay/Esc/focus custom (viola convencao).

**Test-writer obrigacao:** smoke test que verifica drag clone aparece em posicao correta (`getBoundingClientRect()` do `Draggable` em drag state == coordenadas mouse). Se falhar, ativar mitigacao CSS `transform: none` no DialogContent.

### 4. Otimistic update + undo toast 5s

Mutations DnD (`POST`/`PUT`/`DELETE /api/planned-tournaments[/:id]`) executam **otimistic** via `queryClient.setQueryData(['planned-tournaments', userId], updater)` ANTES da request. Em sucesso (2xx): `queryClient.invalidateQueries(['planned-tournaments', userId])` para reconciliar. Em erro (4xx/5xx): `queryClient.setQueryData(..., previousData)` rollback + `toast.error('Falha ao salvar — restaurado')`.

Toast undo:
- Hook `useUndoToast({ label, undoFn, durationMs: 5000 })` mostra `<Toast>` Radix com botao "Desfazer".
- Click no botao chama `undoFn` (que dispara mutation reversa: `POST` reverte `DELETE`, `DELETE` reverte `POST`, `PUT` reverte com `PUT` para o startTime anterior).
- Sem stack — apenas o **ultimo** undo fica disponivel. Cmd+Z multi-step e escopo OUT #2.

Justificativa vs commit explicito: founder citou Notion/Linear como referencia UX. Otimistic feedback < 50ms + safety net via undo 5s e o padrao consolidado. Commit explicito ("salvar") em DnD quebra a expectativa de feedback imediato.

### 5. Feature-flag `?detail=drawer` 30d rollback

URL `/coach?detail=drawer` → render `<DayDetailDrawer>` legacy. URL sem flag (default) → `<DayDetailZoom>`. Conflito (`?detail=drawer&day=Tue`): drawer ganha (rollback total).

TTL 30d pos-deploy. Criterio cleanup: telemetria `day_zoom.opened` > 0 em **>=95% das sessoes WAU em 14d consecutivos** (verify via `user_activity` admin query). Apos criterio, abrir issue **DAY-ZOOM-CLEANUP** + deletar `DayDetailDrawer.tsx` + import + branch flag em `useDayZoomState`.

Justificativa: ADR-187 driver pattern precedente. Bug critico pos-deploy permite rollback total via URL sem deploy reverter.

### 6. Telemetria namespace — alinhamento ADR-207 (Q4)

ADR-207 fixa **dot-namespace `domain.event`** snake_case. Spec usou underscore `day_zoom_open` por inercia (casar com legacy `day_detail_drawer_open`). Este ADR **migra para dot-namespace conforme ADR-207**:

| Spec underscore | ADR final (ADR-207 compliant) |
|---|---|
| `day_zoom_open` | `coach.day_zoom_opened` |
| `day_zoom_close` | `coach.day_zoom_closed` |
| `day_zoom_dnd_add` | `coach.day_zoom_dnd_add` |
| `day_zoom_dnd_move` | `coach.day_zoom_dnd_move` |
| `day_zoom_dnd_remove` | `coach.day_zoom_dnd_remove` |
| `day_zoom_filter_apply` | `coach.day_zoom_filter_apply` |
| `day_zoom_search` | `coach.day_zoom_search` |
| `day_zoom_undo` | `coach.day_zoom_undo` |

`feature` field: `'day_zoom'` em todos os 8 eventos (ADR-207 §1). Legacy `day_detail_drawer_open` permanece underscore (ja em prod, ADR-207 §168 nao reescreve retroativo).

PII: nenhum dos 8 eventos contem chaves de `shared/pii-keys`. `tournamentId` (nanoid opaco), `site` (enum), `buyIn` (number), `slot` (HH:mm string), `profileLetter` (`A|B|C`) — todos OK. PII guard client-side do `activity-telemetry.ts` (ADR-207 §6) cobre defesa adicional.

## Open Questions — answers

### Q1: Schema `planned_tournaments.sequence`

**Confirmado nao existe.** Ler `shared/schema.ts:533-590`: colunas relevantes para ordenacao sao `time` (varchar HH:mm) + `startTime` (timestamp). Sem `sequence` / `position_in_slot` / `order_idx`.

**Decisao:** RF-02 reorder **dentro do mesmo slot** vira no-op silencioso com toast informativo "Reordenar dentro do mesmo horario sera no Sprint 2 (precisa de migration)". Ordenacao continua por `time ASC, name ASC` (fallback alfabetico). Sprint 1 NAO introduz migration. Promover para Sprint 2 se telemetria `day_zoom.day_zoom_dnd_move` mostrar >20% das moves sao same-slot.

### Q2: Portal + DnD

Resolvida na spike. **Alternativa A** (`DialogPortal container={ref}`).

### Q3: Threshold virtualizacao biblioteca

Sem dado real medido. Codigo atual `BibliotecaPanel` carrega `/api/tournament-library` sem virtualizacao e funciona em prod para users com `<200 cards` (assumido). Sprint 1 mantem comportamento: render direto ate 100, banner `data-testid="biblioteca-too-many"` >100 + render so primeiros 100.

**Decisao:** virtualizacao plena (react-window OR @tanstack/react-virtual) **DEFER Sprint 2** sem custo Sprint 1. Criterio promocao: telemetria mostra >30% das sessoes tem `tournament-library.length > 100`. Adicionar count em `coach.day_zoom_opened.metadata.library_count` para medir.

### Q4: Telemetria schema

Resolvida na §6 acima. Dot-namespace `coach.day_zoom_*` + `feature: 'day_zoom'`.

### Q5: `react-resizable-panels` em jsdom

`Grep` mostrou que `react-resizable-panels` NAO eh usado em nenhum teste atualmente (`tests/**`). Lib v2.1.7 usa `ResizeObserver` internamente — jsdom NAO tem `ResizeObserver` por default.

**Decisao:** test-writer adiciona polyfill minimo em `tests/setup.ts`:

```ts
// tests/setup.ts
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}
```

Testes do split panel verificam apenas presence dos `data-testid` `day-zoom-panel-left`/`day-zoom-panel-right` + sizes default 60/40 (via `Panel defaultSize={60}` prop). Comportamento de resize real (drag handle) **NAO** e testado em jsdom — fica para verify manual em §13 da spec.

### Q6: Slot picker mobile

Sprint MUST: **primeiro slot vago** do dia (helper `findFirstFreeSlot(plannedTournaments, dayOfWeek)` retorna primeiro `TIME_SLOTS[i]` sem torneio). Toast "Adicionado as HH:mm". Picker explicito (Sheet com lista) **defer Sprint 2** se feedback pedir.

Justificativa: complexity budget Sprint 1 ja apertado (7d dev + risco Portal+DnD); slot picker e UX delta marginal vs slot vago.

## Consequences

**Positivas:**

- Fluxo de edicao reduz de 3 cliques + 2 modais para 1 clique + DnD (paridade Notion/Linear).
- DnD herdado evita refactor de `GradePlanner` `handleDragEnd` (apenas estende com novos `droppableId` patterns `zoom-cell-X-S` + `zoom-biblioteca-trash`).
- Feature-flag rollback 30d cobre incidente pos-deploy sem deploy reverter.
- Reuso `queryKey` `['/api/tournament-library']` evita fetch duplicado (cache compartilhado com `BibliotecaPanel`).
- Otimistic + undo 5s segue convencao Notion/Linear consolidada — UX padrao SaaS moderno.
- Telemetria `coach.day_zoom_*` alinha com ADR-207, simplifica queries SQL admin (`WHERE action LIKE 'coach.day_zoom_%'`).

**Negativas:**

- Risco Portal+DnD requer smoke test obrigatorio do test-writer. Mitigacao fallback custa 0.5d se ativada.
- Reorder mesmo-slot vira no-op Sprint 1 (sem `sequence`). Toast informativo desagrada UX-perfeccionista — promove Sprint 2 se telemetria justificar.
- Coexistencia 30d de `DayDetailDrawer` (legacy) + `DayDetailZoom` (novo) duplica codigo. Cleanup obrigatorio pos-30d senao divida tecnica acumula.
- Polyfill `ResizeObserver` em `tests/setup.ts` adiciona linha global — outros tests que dependem de ResizeObserver real (raro) podem ser afetados. Documentado em comment.
- 8 eventos novos em `user_activity` aumentam volume telemetria — sem ALTER table (ADR-191 schema generico). Cap delete `2026-08-23` documentado.

**Neutras:**

- `react-resizable-panels` ja instalado (`^2.1.7`); zero novo dep.
- `useUndoToast` e `useDayZoomState` sao hooks novos pequenos (~60-120 LoC cada); reusaveis pos-sprint em outras superficies.

## Confidence

**Alta** — todos os 5 itens tem precedente no projeto (ADRs 187, 193, 207) OR confirmados por leitura de codigo (`schema.ts` sem `sequence`, `dialog.tsx` Portal default, `drag-drop-utils.ts` API). O unico risco real (Portal+DnD) tem 3 alternativas documentadas + fallback CSS + cap de tempo de mitigacao.

## Lessons aplicaveis (test-writer + implementer)

- **#2 (data-testid estavel):** spec lista todos os testids MUST. Nao usar `findByText` heuristico.
- **#3 + #13 (mocks shape real):** mock `apiRequest` retorna JSON parseado (objeto torneio criado), NAO `Response`. Validar contra rota real `server/routes/grade-planner.ts:147-180`.
- **#14 + #38 (require/import em test .tsx):** sempre `await import(...)`, **nunca** mix com `require()` no mesmo file (quebra React Context identity — confirmado MP2 RF-NEW.3).
- **#19 (Wouter routes):** deep-link `?day=Tue&profile=A` apenas muda search params; `setLocation('/coach?day=Tue&profile=A')` safe (rota base `/coach` registrada).
- **#28 (vi.mock path exato):** mockar `@/components/grade/BibliotecaEmbedded` no path EXATO do import em `DayDetailZoom.tsx`; criar re-export shim se necessario.
- **#29 (sub-arvore useQuery sem provider):** `BibliotecaEmbedded` usa `useQuery` — tests standalone precisam `QueryClientProvider` OR `ErrorBoundary` fallback null. Recomendado: componente expoe `ErrorBoundary` interna (pattern Sidebar) para hardening producao.

## Followups Sprint 2+

1. **DAY-ZOOM-SEQUENCE-MIGRATION** — adicionar coluna `sequence INT NOT NULL DEFAULT 0` em `planned_tournaments` + reorder funcional same-slot.
2. **DAY-ZOOM-VIRTUALIZATION** — biblioteca >100 cards via `@tanstack/react-virtual`.
3. **DAY-ZOOM-DNDKIT-MIGRATION** — migrar GradePlanner inteiro para `@dnd-kit/core` (ja no package.json desde MP3) — destrava mobile DnD funcional. Coordenar com escopo OUT #9.
4. **DAY-ZOOM-CLEANUP** — pos-30d telemetria, deletar `DayDetailDrawer` + import + flag.
5. **DAY-ZOOM-BULK-SELECT** — Shift+click multi-select (escopo OUT #1).
6. **DAY-ZOOM-CMD-Z** — undo manager global multi-step (escopo OUT #2).
