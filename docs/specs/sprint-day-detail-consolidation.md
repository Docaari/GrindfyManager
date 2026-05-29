# Sprint day-detail-consolidation — Solidificar via TDD o cluster DayDetailZoom (zero feature nova)

| Campo | Valor |
|---|---|
| Sprint ID | `day-detail-consolidation` |
| Owner | Docaari (Grindfy) |
| Data | 2026-05-28 |
| Status | **PROPOSTA** (aguarda system-architect → ADR + 2 diagramas) |
| Dependencias | Cluster `DayDetailZoom` ja shippado (8 commits hoje, `2a2a514c..439bb60c`). Sprint anterior: `day-detail-manage` (RFs 01-03 originais). |
| Pipeline alvo | `pm-spec → system-architect → test-writer → implementer → reviewer` |
| Estimativa | ~2-3 dias dev (consolidacao + fixes + tests; sem feature nova) |
| Sem migration | sim — zero schema change, zero endpoint novo |
| Tier impact | Free + Pro + Premium (puro UX no `/coach`) |

---

## 1. Contexto + Objetivo

Hoje 2026-05-28 o founder shippou 8 commits seguidos no cluster `DayDetailZoom` via pipeline acelerado (sem `system-architect`, sem `test-writer` — direto founder → implementer):

| Commit | Conteudo |
|---|---|
| `2a2a514c` | Manage-1 base — botao Criar (`+`) header + Delete inline X hover-reveal |
| `276c0173` | Manage-2 — Edit dialog + Mover entre horarios + menu lateral |
| `855bc069` | Manage-3 — Filtros plataforma + Prioridade (Star/Flag) + visibility fixes |
| `ba772668` | Fix — prioridade nao salvava + UX conforto + horario sempre visivel |
| `cb41c107` | Manage-4 — Max Late + Garantido USD + Mediana Field + fix priority z-index |
| `6f0396bc` | Fix SQL — day-detail handler nao retornava prioridade nem registration_time |
| `439bb60c` | Polish — grade expande total + biblioteca default minimizada + botao maior |

Funcionou. Mas:

- **6 RFs sem cobertura de teste** (RFs novas pos-`day-detail-manage`: Edit, Mover, Prioridade, MaxLate, Garantido, Biblioteca colapsavel).
- **4 bugs latentes** reportados pelo founder durante quick-iterate (precisam validacao pos-restart):
  1. Prioridade nao persiste apos fechar/reabrir modal (provavel fix em `6f0396bc`).
  2. Garantido nao exibe (depende do dialog enviar `guaranteed > 0`).
  3. Botao MaxLate badge nao aparece (depende do dialog enviar `registrationTime` nao-vazio).
  4. Mediana Field nao mostra (depende cadeia `guaranteed → guaranteedUsd → estimatedField > 0`).
- **3 smells de codigo** identificados na revisao manual:
  1. `BibliotecaEmbedded.tsx:108` emite telemetria dentro de `setTimeout` debounce (antipadrao — quebra com `vi.useFakeTimers`).
  2. `DayDetailZoom.tsx:255` usa `eslint-disable-next-line react-hooks/exhaustive-deps` com `libraryCollapsed` condicional no array de deps.
  3. `DayDetailZoom.tsx:489-504` cleanup de `priorityOverrides` pode flashar UI quando server confirma valor identico (race entre optimistic + refetch).

Founder verbatim (paraphrased da conversa): "parar de adicionar coisa e travar tudo via TDD antes de quebrar".

**Objetivo unico:** consolidar via TDD as 9 RFs do cluster + corrigir os 4 bugs latentes + sanitizar os 3 smells. **ZERO feature nova.** Spec serve de fonte de verdade do estado REAL pos-quick-iterate para `system-architect` mapear, `test-writer` cobrir, `implementer` corrigir, `reviewer` auditar.

---

## 2. Escopo Sprint — IN

### 2.1 Cobertura TDD das 9 RFs ja shippadas (RF-01..RF-09)

Cada RF abaixo descreve o **estado REAL** (post-commit, NAO desejado). `test-writer` deve cobrir os criterios; `implementer` so muda codigo se teste falhar.

---

### RF-01 — Criar torneio direto do Zoom (commits `2a2a514c` + `cb41c107`)

**Componente:** `client/src/components/grade/DayCreateTournamentDialog.tsx` (378 LoC).

**UI:**
- Header de `DayDetailZoom` tem botao `+` com `data-testid="day-zoom-create-button"`, `aria-label="Criar torneio neste dia"`.
- Click abre Dialog Radix com 9 campos:
  1. `name` (string, obrigatorio).
  2. `site` (string, datalist `knownSites` autocomplete).
  3. `buyIn` (decimal, obrigatorio).
  4. `time` (HH:MM, obrigatorio — `<input type="time">`).
  5. `maxLate` (HH:MM, opcional — mapeia para `registrationTime` no payload POST).
  6. `guaranteed` (decimal USD, opcional).
  7. `type` (datalist tipos: Regular, Bounty, Satellite, Freeroll, etc).
  8. `speed` (datalist: Regular, Turbo, Hyper).
  9. `profile`/`dayOfWeek` (via props — pre-preenchidos do Zoom).

**Comportamento:**
- `openedRef` em `useEffect` reseta state quando dialog abre (evita stale state ao reabrir).
- POST `/api/planned-tournaments` com payload completo (todos os 9 campos).
- `onSuccess`:
  - `queryClient.invalidateQueries({ queryKey: ['day-detail', profileLetter, dayOfWeek] })`.
  - `queryClient.invalidateQueries({ queryKey: ['planned-tournaments'] })`.
  - Fecha Wizard (`setCreateOpen(false)`).
  - Zoom **permanece** aberto.
- Telemetria: `coach.day_zoom_create_open` ao abrir + `coach.day_zoom_create_save` ao salvar com sucesso.

**`data-testid` registrados (devem todos ser preservados):**
- `day-zoom-create-button` (header trigger)
- `day-zoom-create-dialog` (Radix Content)
- `day-zoom-create-input-name`
- `day-zoom-create-input-site`
- `day-zoom-create-input-buyin`
- `day-zoom-create-input-time`
- `day-zoom-create-input-type`
- `day-zoom-create-input-speed`
- `day-zoom-create-input-maxlate`
- `day-zoom-create-input-guaranteed`
- `day-zoom-create-error`
- `day-zoom-create-submit`
- `day-zoom-create-dialog-close`

**Criterios verificaveis (TDD):**
1. Botao `+` no header renderiza com `aria-label` correto.
2. Click abre `day-zoom-create-dialog`.
3. Reabrir dialog (close + reopen) limpa state (`openedRef` reset). Inputs voltam a vazio.
4. `name` vazio + submit → erro inline (`day-zoom-create-error`).
5. `time` vazio + submit → erro inline.
6. Submit com 9 campos validos: POST chamado com payload completo (incluindo `registrationTime = maxLate` quando preenchido, `guaranteed` quando preenchido).
7. `onSuccess`: invalidate em 2 query keys + close dialog + Zoom permanece aberto.
8. Emit `coach.day_zoom_create_open` ao abrir.
9. Emit `coach.day_zoom_create_save` ao salvar com `{dayOfWeek, profileLetter, slot, site, buyIn}` no payload.

---

### RF-02 — Editar torneio inline (commit `276c0173`)

**Componente:** `client/src/components/grade/DayEditTournamentDialog.tsx` (353 LoC).

**UI:**
- Cada chip planejado tem botao Edit (icone `Pencil` de `lucide-react`) com `data-testid="day-zoom-tournament-edit-${id}"`.
- Click abre Dialog Radix com mesmos 9 campos do Create.

**Comportamento:**
- Hydrate snapshot via `useEffect` com `hydratedIdRef` — garante que mudar de chip aberto re-hidrata (vs re-mount).
- Campos hidratados: `name`, `site`, `buyIn`, `time`, `type`, `speed`, `maxLate (= item.registrationTime)`, `guaranteed (= item.guaranteedUsd ?? item.guaranteed)`, `prioridade`.
- PUT `/api/planned-tournaments/:id` com payload completo.
- Telemetria: `coach.day_zoom_edit_save` ao salvar.

**`data-testid` registrados:**
- `day-zoom-tournament-edit-${id}` (trigger no chip)
- `day-zoom-edit-dialog`
- `day-zoom-edit-input-name`
- `day-zoom-edit-input-site`
- `day-zoom-edit-input-buyin`
- `day-zoom-edit-input-time`
- `day-zoom-edit-input-type`
- `day-zoom-edit-input-speed`
- `day-zoom-edit-input-maxlate`
- `day-zoom-edit-input-guaranteed`
- `day-zoom-edit-submit`
- `day-zoom-edit-dialog-close`

**Criterios verificaveis (TDD):**
1. Botao Edit em cada chip planejado com `id`.
2. Click abre dialog hidratado com `name`, `buyIn`, `time` corretos do item.
3. `maxLate` hidrata de `item.registrationTime` (passthrough server `pt.registration_time AS "registrationTime"`).
4. `guaranteed` hidrata de `item.guaranteedUsd ?? item.guaranteed` (fallback documentado — ambig; server normaliza no payload de saida).
5. Mudar chip aberto + reopen re-hidrata (`hydratedIdRef` detecta novo id).
6. Submit com mudanca: PUT `/api/planned-tournaments/:id` chamado com payload completo.
7. Emit `coach.day_zoom_edit_save` ao salvar com sucesso.
8. PUT 4xx: erro mostrado no dialog; dialog NAO fecha automatico.

**Bug latente (capturar em RF-FIX-02 abaixo):** fallback `guaranteedUsd ?? guaranteed` no hidrate eh ambiguo — server retorna `guaranteedUsd` (USD normalizado) mas o user pode ter cadastrado em moeda nativa. Reabrir Edit pode mostrar valor diferente do que foi salvo.

---

### RF-03 — Excluir inline X hover-reveal (commit `2a2a514c`)

**UI:**
- Cada chip planejado tem botao X (icone `X` de `lucide-react`) com:
  - Classes: `opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 transition-opacity duration-150`.
  - `data-testid="day-zoom-tournament-delete-${id}"`.
  - `aria-label="Remover torneio ${name}"`.
- Container do chip tem `group` + `relative`.

**Comportamento:**
- Click chama `mutateRemove(id, slot)` (handler ja existente desde day-detail-zoom-1).
- `e.stopPropagation()` previne drag accidental do chip pai.
- Emite **2 eventos** no click do X:
  - `coach.day_zoom_delete_inline` (NOVO — distingue source `inline_x`).
  - `coach.day_zoom_dnd_remove` (preservado — emitido internamente por `mutateRemove`).
- Trash zone DnD (`zoom-biblioteca-trash`) **preservada** (redundancia intencional). Drop no trash emite **apenas** `dnd_remove` (NAO `delete_inline`).
- Toast undo 5s mantido (paridade day-detail-zoom-1).

**Criterios verificaveis (TDD):**
1. Botao X em cada chip planejado com `id`.
2. Classes hover/focus reveal corretas.
3. Container chip tem `group` + `relative`.
4. Click chama DELETE `/api/planned-tournaments/:id`.
5. Emit `delete_inline` + `dnd_remove` (2 eventos).
6. Drop em trash zone emite **apenas** `dnd_remove`.
7. `e.stopPropagation()` testavel — drag handler do pai NAO dispara ao clicar X.
8. Mock 4xx: chip volta + toast erro.
9. Toast undo 5s aparece (`data-testid="day-zoom-undo-toast"`).

---

### RF-04 — Mover entre horarios (commit `276c0173`)

**UI:**
- Cada chip planejado tem botao Move (icone `Arrow` de `lucide-react`) com `data-testid="day-zoom-tournament-move-${id}"`.
- Click abre menu lateral (`data-testid="day-zoom-tournament-move-menu"`) com lista de horarios disponiveis.
- Cada target tem `data-testid="day-zoom-tournament-move-target-${HH:MM}"`.

**Comportamento:**
- Menu fecha em click-away via `document` `mousedown` listener + marker `data-zoom-menu` no DOM.
- Click em target horario chama `mutateMove(id, fromSlot, toSlot)` (handler ja existente).
- Emit `coach.day_zoom_dnd_move` (reuso evento existente do DnD).

**Criterios verificaveis (TDD):**
1. Botao Move em cada chip planejado com `id`.
2. Click abre menu com horarios disponiveis (subset de `timeSlots`).
3. Click-away (mousedown fora do menu) fecha o menu.
4. Click em target chama `mutateMove(id, fromSlot, toSlot)`.
5. Emit `coach.day_zoom_dnd_move` apos move bem-sucedido.
6. PUT `/api/planned-tournaments/:id` chamado com `startTime` novo.

---

### RF-05 — Prioridade Star/Flag (commits `855bc069` + `cb41c107` + `ba772668` + `6f0396bc`)

**UI:**
- Cada chip planejado tem botao prioridade colorido com `data-testid="day-zoom-tournament-priority-${id}"`.
- Cores:
  - 1 = Alta = `bg-red-500/text-red-200` (vermelho).
  - 2 = Media = `bg-amber-500/text-amber-200` (amarelo).
  - 3 = Baixa = `bg-blue-500/text-blue-200` (azul).
  - null/undefined = neutro.
- Badge visual `data-testid="day-zoom-tournament-priority-badge-${id}"` (Star ou Flag icon colorido).
- Click abre dropdown `data-testid="day-zoom-tournament-priority-menu"` com 3 opcoes: target `1`, `2`, `3` (com `data-testid="day-zoom-tournament-priority-target-${1|2|3}"`).

**z-index ordering (fix em `cb41c107`):**
- Chip ativo (com menu aberto): `z-40`.
- Menu dropdown: `z-50` (acima do backdrop do modal Dialog `z-50`).

**SQL fix (commit `6f0396bc`):**
- `GET /api/grade/day-detail/:p/:d` agora retorna `prioridade` + `registration_time` no SELECT (antes nao retornava — prioridade nao persistia visualmente).

**Comportamento:**
- `priorityOverrides` state (Map `id → newPriority`) implementa optimistic overlay.
- PUT `/api/planned-tournaments/:id` com `{ prioridade: 1|2|3 }`.
- Cleanup em `useEffect`: quando server confirma o mesmo valor que overlay, remove entrada do `priorityOverrides`.
- Emit `coach.day_zoom_priority_set` apos PUT bem-sucedido com `{ tournamentId, dayOfWeek, profileLetter, prioridade }`.

**Sort em `plannedSlots`:** `prioridade ASC (1 topo) → time ASC → buyin DESC`.

**Criterios verificaveis (TDD):**
1. Badge prioridade em cada chip com cor correta por valor (1/2/3/null).
2. Click abre dropdown com 3 targets.
3. Click em target chama PUT com `prioridade` novo.
4. Optimistic overlay: badge atualiza ANTES do server confirmar.
5. Server confirma (via refetch invalidate) → `priorityOverrides` cleanup remove entrada quando match.
6. Server diverge (override `1` mas server retorna `2`): overlay persiste ate user reagir.
7. Emit `coach.day_zoom_priority_set` apos PUT 200.
8. PUT 4xx: rollback do overlay + toast erro.
9. Sort dos chips por prioridade ASC → time ASC → buyin DESC.
10. Reabrir modal apos prioridade salva: badge mostra valor persistido (cobertura do bug "prioridade nao persiste" — fix em `6f0396bc`).
11. Menu dropdown `z-50` renderiza acima do chip + backdrop.

---

### RF-06 — Filtros plataforma chips (commit `855bc069`)

**Componente:** `client/src/components/grade/DayPlannedFilterChips.tsx` (155 LoC).

**Hook exportado:** `useDayPlannedFilter` (mesmo arquivo).

**UI:**
- Container `data-testid="day-zoom-filter-chips"` renderiza entre KPI cards e slots no `day-zoom-panel-left`.
- Chip "Todas" sempre primeiro (`data-testid="day-zoom-filter-chip-all"`), ativo quando `selectedSites.length === 0`.
- Chips por site (`data-testid="day-zoom-filter-chip-${site}"`) em ordem desc por count derivado de `data.volume[].site ∪ data.list[].site`.
- Empty state quando filtro zera todos os slots: `data-testid="day-zoom-filter-empty"` + botao `data-testid="day-zoom-filter-clear"`.

**Persistencia:**
- localStorage key: `dayZoom.filter.${profileLetter}.${dayOfWeek}.platforms`.
- Value: JSON `string[]`.
- SSR guard: `typeof window !== "undefined"`.
- Sites obsoletos (em localStorage mas nao no data atual) **preservados** (sem auto-cleanup).

**Telemetria:**
- Reusa `coach.day_zoom_filter_apply` (existente de day-detail-zoom-1).
- Payload: `{ dayOfWeek, profileLetter, filters: { platforms: selectedSites }, cleared: boolean, resultCount: number }`.
- NAO emite em mount inicial (so em interacao).

**Criterios verificaveis (TDD):**
1. Container `day-zoom-filter-chips` renderiza no panel-left.
2. Chip "Todas" sempre presente, ativo quando `selectedSites=[]`.
3. Chips de site em ordem desc por count.
4. Toggle multi-select funciona.
5. Click "Todas" zera `selectedSites`.
6. Filtro zera tudo → `day-zoom-filter-empty` + botao `day-zoom-filter-clear`.
7. localStorage salva key correta + restaura no remount.
8. SSR guard nao quebra em ambiente sem `window`.
9. Emit `filter_apply` em toggle, **NAO** em mount inicial.
10. Sites obsoletos em localStorage nao causam render error.

---

### RF-07 — Biblioteca colapsavel default minimizada (commit `439bb60c`)

**UI:**
- Painel direito (`BibliotecaEmbedded`) tem botao colapsar/expandir.
- `data-testid="day-zoom-library-collapse-button"` quando expandido.
- `data-testid="day-zoom-library-expand-button"` quando colapsado.
- Icone chevron rotativo.

**Comportamento:**
- `libraryPanelRef` (ref imperativo do `react-resizable-panels` Panel).
- Prop `collapsed` controlada por state `libraryCollapsed`.
- localStorage key: `dayZoom.library.collapsed` (boolean).
- **Default:** `true` (minimizada — comportamento NOVO pos-`439bb60c`).
- `useEffect` no `open` do modal aplica `panel.collapse()` ou `panel.expand()` apos timeout 0 (defer pra registrar size).

**Botao "+" maior (commit `439bb60c`):**
- Header do botao Create ganhou tamanho maior (paddings expandidos).
- Visual deve ser detectavel via classes Tailwind especificas.

**Criterios verificaveis (TDD):**
1. Default state ao abrir modal: biblioteca colapsada.
2. Click no botao expand: biblioteca expande + localStorage `dayZoom.library.collapsed = false`.
3. Click no botao collapse: biblioteca colapsa + localStorage `dayZoom.library.collapsed = true`.
4. Reabrir modal apos colapsar/expandir: state restaurado de localStorage.
5. SSR guard preservado.
6. Botao `+` Create renderiza com classes maiores (paridade `439bb60c`).

---

### RF-08 — Max Late / `registration_time` (commit `cb41c107`)

**Campo:**
- `maxLate` (HH:MM, opcional) nos dialogs Create + Edit.
- Mapeia para `registrationTime` no payload POST/PUT.
- Backend retorna `pt.registration_time AS "registrationTime"` (server passthrough).
- Frontend usa como `item.maxLate` (alias no service).

**Bucketing em `plannedSlots`:**
- Quando item tem `maxLate` valido: slot = `HH:00` do `maxLate`. (Ex: `time=13:30` + `maxLate=14:30` → slot `14:00`).
- Sem `maxLate`: slot = `HH:00` do `time`. (Ex: `time=13:30` → slot `13:00`).
- Codigo atual: `const bucketRef = item?.maxLate || item?.time;` (linha 295 `DayDetailZoom.tsx`).

**Badge visual no chip:**
- Quando `typeof item.maxLate === "string" && item.maxLate.length > 0`: badge Hourglass amber (`data-testid="day-zoom-tournament-maxlate-${id}"`) com texto `"MaxLate HH:MM"`.

**Criterios verificaveis (TDD):**
1. Campo `maxLate` em Create dialog `data-testid="day-zoom-create-input-maxlate"`.
2. Campo `maxLate` em Edit dialog `data-testid="day-zoom-edit-input-maxlate"`.
3. POST com `maxLate="14:30"` → payload tem `registrationTime: "14:30"`.
4. PUT com `maxLate=""` → payload tem `registrationTime: null` ou omitido.
5. Item com `time="13:30"` + `maxLate="14:30"` → bucketed em slot `14:00`.
6. Item sem `maxLate` + `time="13:30"` → bucketed em slot `13:00`.
7. Badge MaxLate amber visivel quando `maxLate` nao-vazio.
8. Badge ausente quando `maxLate=null` ou `""`.

---

### RF-09 — Garantido USD + Mediana Field + Estimated Field (commit `cb41c107`)

**Campo:**
- `guaranteed` (decimal USD, opcional) nos dialogs Create + Edit.
- Backend normaliza: `guaranteedUsd = nativeToUsd(pt.guaranteed, currency)`.
- `estimatedField = round(guaranteedUsd / abi_medio)` quando `guaranteedUsd > 0`.

**5o KPI card (linha 919 `DayDetailZoom.tsx`):**
- `data-testid="day-zoom-card-median-field"`.
- Mediana de `list.map(item => item.estimatedField).filter(f => f > 0).sort()`.
- Par: `avg(middle1, middle2)`. Impar: `middle`.
- Renderiza apenas quando array nao-vazio.
- Grid layout: `lg:grid-cols-5` quando ha mediana valida (vs `lg:grid-cols-4` baseline).

**Badge chip:**
- Quando `item.guaranteedUsd > 0`: badge `"GTD $XX · ~N"` (XX = guaranteedUsd formatado, N = estimatedField).
- `data-testid="day-zoom-tournament-gtd-${id}"`.

**Criterios verificaveis (TDD):**
1. Campo `guaranteed` em Create dialog `day-zoom-create-input-guaranteed`.
2. Campo `guaranteed` em Edit dialog `day-zoom-edit-input-guaranteed`.
3. POST com `guaranteed=10000` → payload tem `guaranteed: 10000`.
4. Backend retorna `guaranteedUsd` (normalizado por currency).
5. Backend retorna `estimatedField = round(guaranteedUsd / abi_medio)` quando `> 0`.
6. Card mediana renderiza quando >=1 item com `estimatedField > 0`.
7. Mediana calculada: par = avg, impar = middle.
8. Mediana ausente (todos `estimatedField = 0`): card NAO renderiza, grid volta `lg:grid-cols-4`.
9. Badge GTD no chip quando `guaranteedUsd > 0`.
10. Badge ausente quando `guaranteedUsd = 0` ou `null`.

---

### 2.2 Fixes de bugs latentes (RF-FIX-01..RF-FIX-04)

**RF-FIX-01: Verify prioridade persiste (fix em `6f0396bc`)**
- SQL handler GET `/api/grade/day-detail/:p/:d` ja inclui `prioridade` no SELECT.
- TDD: integration test que cria torneio com prioridade, fecha modal, reabre, e valida badge.
- Acao implementer: **nenhuma** (apenas validar via teste). Se teste passar, bug ja esta corrigido.

**RF-FIX-02: Verify Garantido exibe**
- Cadeia: dialog envia `guaranteed > 0` → backend normaliza `guaranteedUsd` → frontend renderiza badge GTD.
- TDD: e2e mock test cria torneio com `guaranteed=10000`, valida badge `"GTD $10000"` no chip + card mediana.
- Acao implementer: se badge nao renderiza, debugar render condicional do badge GTD (tipicamente `typeof guaranteedUsd === "number" && guaranteedUsd > 0`).

**RF-FIX-03: Verify badge MaxLate aparece**
- Cadeia: dialog envia `maxLate="14:30"` → `registrationTime` no payload → backend passthrough → frontend renderiza badge.
- TDD: e2e test cria torneio com `maxLate`, valida badge Hourglass amber + bucketing em slot `14:00`.
- Acao implementer: se badge nao renderiza, validar guard `typeof item.maxLate === "string" && item.maxLate.length > 0`.

**RF-FIX-04: Verify Mediana mostra**
- Cadeia: `guaranteed → guaranteedUsd → estimatedField > 0 → mediana calculada`.
- TDD: integration test com data com 3+ chips com `guaranteedUsd > 0` → valida card mediana renderiza com valor correto.
- Acao implementer: se card nao renderiza, validar (a) backend retorna `estimatedField` corretamente, (b) frontend filtra `> 0` antes de mediana.

### 2.3 Fixes de smells de codigo (RF-SMELL-01..RF-SMELL-03)

**RF-SMELL-01: `BibliotecaEmbedded.tsx:108` — telemetria dentro de `setTimeout`**
- Atual: `coach.day_zoom_search` emitido dentro do `setTimeout` do debounce (linhas 102-119).
- Problema: quebra com `vi.useFakeTimers` em testes (timer nao avanca → emit nunca dispara).
- Decisao: **manter** comportamento (founder/reviewer ja documentaram comentario inline na linha 95-97: "para garantir captura sincrona em tests com `vi.useFakeTimers`. `advanceTimersByTime` nao aguarda reflow do React").
- Acao: TDD documenta o padrao em teste com `advanceTimersByTime(300)` + assert `safeEmit` chamado. Comment inline mantido. Sem refactor.
- TODO grepavel: `// TODO(day-detail-2): refator search debounce com flushSync ou React 19 useDebouncedValue`.

**RF-SMELL-02: `DayDetailZoom.tsx:255` — eslint-disable com `libraryCollapsed` condicional**
- Atual: `useEffect` deps `[open]` com `libraryCollapsed` lido dentro mas ausente das deps (eslint-disable explicito).
- Problema: comportamento intencional (so re-aplica state ao abrir modal, nao ao toggle). Mas eslint-disable em prod eh smell.
- Decisao: **manter** comportamento + adicionar comentario `/* intentional: applies persisted state only on modal open */` substituindo o `eslint-disable-next-line`.
- Acao implementer: substituir eslint-disable por inline `@typescript-eslint/no-use-before-define` comment? Nao — manter eslint-disable mas adicionar JSDoc `@policy` acima do useEffect explicando o intent. TDD test: assert que toggle do `libraryCollapsed` mid-modal NAO re-dispara o useEffect (so reabrir o modal aplica).

**RF-SMELL-03: `DayDetailZoom.tsx:489-504` — `priorityOverrides` cleanup pode flashar UI**
- Atual: useEffect compara `priorityOverrides[id]` com `data.list[i].prioridade`. Se match, remove entry.
- Problema potencial: race condition. Server retorna prioridade nova → useEffect roda → cleanup remove overlay → render usa `data.list` (valor persistido). Mas se `data.list` for stale (race entre invalidate e new fetch), pode flashar valor antigo brevemente.
- Decisao: **adicionar guard** — so remover entrada do `priorityOverrides[id]` quando `data.list[i].prioridade === overrides[id]` E o `id` esteja presente em `data.list` (ja checa). Adicional: **adicionar deduplicacao** — se overrides entries sao identicas as do data (deep equal), short-circuit return sem state update. Testar em RF-FIX-01 que reabrir modal nao gera flash visual.
- TDD test: simular sequencia (1) user clica prioridade `1`, (2) optimistic mostra `1`, (3) server PUT 200, (4) refetch retorna `1`, (5) cleanup roda sem flash. Validar via `act()` + snapshot do badge.

---

## 3. Escopo Sprint — OUT

| # | Item | Por que OUT | Criterio promocao |
|---|---|---|---|
| 1 | Refactor de `DayDetailZoom.tsx` em sub-componentes (1500 LoC → 5-6 sub-componentes) | Cap LoC nao bloqueia comportamento; refactor de UI grande em sprint TDD aumenta risco. | Sprint dedicado `day-detail-refactor` apos suite de testes estavel |
| 2 | Edit bulk (selecionar N chips, abrir form unico) | UX complexa, state machine de selecao. | Telemetria adocao Edit > X% em 30d |
| 3 | Atalhos de teclado (`c` create, `Del` delete focused, `/` filter, `e` edit) | Nao introduzimos atalhos no cluster manage. ESC ja existe. | Founder request explicito |
| 4 | Mobile redesign (<768px) | Mantem comportamento Tabs/fullscreen do day-detail-zoom-1. | Sprint dedicado mobile UX |
| 5 | Animacao chip aparece pos-Create (skeleton intermediario) | Wizard fecha → invalidate → refetch silencioso → chip aparece sem skeleton. | Feedback "chip demora a aparecer" |
| 6 | Sincronizacao cross-tab de localStorage (`storage` event listener) | Out-of-scope; ultimo write ganha. | Founder/architect request |
| 7 | Atualizar Wizard `AddTournamentWizard` (codigo morto em `grind-session-live/AddTournamentDialog`) | Esta sprint nao remove codigo morto; ver Q-G. | Sprint dedicado cleanup |
| 8 | Mediana com outlier-removal (IQR, percentil) | Mediana atual eh simples (par avg, impar middle). | Pedido founder OU >5 chips com outlier dominante |
| 9 | `WHATSAPP_FROM_NAME` / share grade | Not in scope. | Pivot estrategico |

---

## 4. Modelo de dados

**Zero migration. Zero schema change.** Confirmacao:

- `shared/schema.ts` §545-566 — tabela `planned_tournaments` ja tem:
  - `prioridade: integer` (1/2/3 ou null).
  - `registrationTime: varchar` (HH:MM nullable — mapeado para `maxLate` no frontend).
  - `guaranteed: numeric` (decimal — moeda nativa).

- `shared/schema.ts` §675-699 — tabela `tournaments` ja tem:
  - `prioridade: integer`.
  - `registrationTime: varchar`.
  - `guaranteed: numeric`.

**localStorage (client-side state):**
- `dayZoom.filter.${profileLetter}.${dayOfWeek}.platforms` — JSON `string[]`. (RF-06).
- `dayZoom.library.collapsed` — JSON `boolean`. (RF-07).
- Sem TTL. SSR guard em ambos.

---

## 5. API endpoints

**Zero novos endpoints. Zero mudanca backend.** Confirmacao:

| Metodo | Rota | Uso na sprint | Status |
|---|---|---|---|
| GET | `/api/grade/day-detail/:profile/:dayOfWeek` | RF-01..RF-09 (deriva lista, badges, mediana) | Existente (handler atualizado em `6f0396bc` — SELECT prioridade + registration_time) |
| POST | `/api/planned-tournaments` | RF-01 Create | Existente |
| PUT | `/api/planned-tournaments/:id` | RF-02 Edit / RF-04 Move / RF-05 Prioridade | Existente |
| DELETE | `/api/planned-tournaments/:id` | RF-03 Delete inline (via `mutateRemove`) | Existente |

Coach `COACH_NUDGES_ENABLED` NAO afeta os eventos `coach.day_zoom_*` (UI telemetry, NAO nudges proativos). PII guard automatico via convention test (MP-VALIDATION RF-01).

---

## 6. Telemetria — eventos ja shippados

| # | Event | Trigger | Props | Status |
|---|---|---|---|---|
| 1 | `coach.day_zoom_create_open` | RF-01 click `+` | `dayOfWeek, profileLetter, slotSuggested` | Existente (day-detail-manage) |
| 2 | `coach.day_zoom_create_save` | RF-01 onSuccess POST | `dayOfWeek, profileLetter, slot, site, buyIn` | Existente |
| 3 | `coach.day_zoom_delete_inline` | RF-03 click X | `tournamentId, dayOfWeek, profileLetter, slot, source:'inline_x'` | Existente |
| 4 | `coach.day_zoom_dnd_remove` | RF-03 trash zone | `tournamentId, dayOfWeek, slot` | Existente |
| 5 | `coach.day_zoom_dnd_move` | RF-04 move via menu | `tournamentId, dayOfWeek, fromSlot, toSlot` | Existente |
| 6 | `coach.day_zoom_edit_save` | RF-02 onSuccess PUT | `tournamentId, dayOfWeek, profileLetter, slot, site, buyIn` | NOVO sprint manage-2 |
| 7 | `coach.day_zoom_priority_set` | RF-05 PUT priority | `tournamentId, dayOfWeek, profileLetter, prioridade` | NOVO sprint manage-3 |
| 8 | `coach.day_zoom_filter_apply` | RF-06 toggle filter | `dayOfWeek, profileLetter, filters:{platforms}, cleared, resultCount` | Existente |
| 9 | `coach.day_zoom_search` | BibliotecaEmbedded debounce | `query, resultCount, dayOfWeek` | Existente |

**Esta sprint NAO cria evento novo.** TDD valida emit + payload de cada evento existente.

PII guard: zero PII em todos os 9 eventos. `tournamentId` nanoid opaco, `site` enum, valores numericos.

Cap delete: 3 meses pos-deploy. TODO grepavel: `// TODO(2026-08-28): cleanup coach.day_zoom_create_*/delete_inline/edit_save/priority_set apos analise adocao`.

---

## 7. Cenarios de Teste Derivados (mapeamento para arquivos TDD)

Fase 3 do plano cria 9 arquivos novos de teste (1 por RF). Mapeamento sugerido:

| Arquivo | RF | Cobertura principal |
|---|---|---|
| `tests/client/day-detail/create-dialog.test.tsx` | RF-01 | 9 criterios — open, reset state, validacao, submit, invalidate, emit |
| `tests/client/day-detail/edit-dialog.test.tsx` | RF-02 | 8 criterios — hydrate, re-hydrate, PUT, emit edit_save |
| `tests/client/day-detail/delete-inline.test.tsx` | RF-03 | 9 criterios — hover-reveal, click, 2 eventos, trash separation |
| `tests/client/day-detail/move-menu.test.tsx` | RF-04 | 6 criterios — open menu, click-away, target click, emit dnd_move |
| `tests/client/day-detail/priority-overlay.test.tsx` | RF-05 + RF-SMELL-03 + RF-FIX-01 | 11 criterios — overlay, cleanup race, persist, z-index |
| `tests/client/day-detail/filter-chips.test.tsx` | RF-06 | 10 criterios — toggle, localStorage, SSR, emit |
| `tests/client/day-detail/library-collapse.test.tsx` | RF-07 | 6 criterios — default, persist, toggle, button size |
| `tests/client/day-detail/maxlate-bucketing.test.tsx` | RF-08 + RF-FIX-03 | 8 criterios — input, payload, bucketing, badge |
| `tests/client/day-detail/guaranteed-median.test.tsx` | RF-09 + RF-FIX-02 + RF-FIX-04 | 10 criterios — input, payload, normalizacao, mediana, grid layout |

**Adicional:** `tests/integration/day-detail/zoom-full-flow.test.tsx` cobre fluxo combinado (Create → Edit → Prioridade → Delete → Filter) end-to-end com mock de `useDayDetail`.

**Total estimado:** ~80-100 testes novos (cap 100).

### Edge cases obrigatorios

- [ ] Chip sem `item.id` (raro pos-fetch, mas defensivo): Edit/Delete/Move/Priority NAO renderizam — fallback `idx` so para `data-testid` interno do chip.
- [ ] `data.list = []`: zero chips, mediana ausente, grid `lg:grid-cols-4`.
- [ ] Filtro persistido com site nao-mais-presente: NAO quebra render; chip site some, `selectedSites` mantem.
- [ ] localStorage corrupto (JSON invalido): SSR guard + try/catch silencia + cai pra default.
- [ ] Priority dropdown aberto + click em outro chip priority: dropdown anterior fecha, novo abre.
- [ ] Multiple chips com same `time` + `maxLate`: bucketing determinista por sort estavel.

---

## 8. Diagramas

**Delegado para `system-architect` (Fase 2).** Placeholders:

### 8.1 Component tree consolidado (pos-quick-iterate)

`Docs/architecture/diagrams/day-detail-consolidation/component-tree.mermaid` — arvore final com 9 RFs ja integradas em `DayDetailZoom` + 3 sub-componentes (`DayCreateTournamentDialog`, `DayEditTournamentDialog`, `DayPlannedFilterChips`).

### 8.2 Sequence — Priority optimistic + cleanup race

`Docs/architecture/diagrams/day-detail-consolidation/sequence-priority-overlay.mermaid` — fluxo (1) user click, (2) optimistic overlay, (3) PUT, (4) refetch, (5) cleanup, com guard de race condition para RF-SMELL-03.

`system-architect` decide se adiciona 3o diagrama (mediana calc + bucketing maxLate) — opcional.

---

## 9. Bordas / Decisoes (D1..D8)

| # | Borda | Decisao |
|---|---|---|
| D1 | Refactor sub-componentes? | NAO. Refactor fica fora desta sprint (item OUT-1). Suite TDD eh pre-requisito. |
| D2 | `eslint-disable` em RF-SMELL-02? | Manter, mas trocar por comment JSDoc `@policy` explicando intent (apply persisted state ONLY on modal open). |
| D3 | Smell em `BibliotecaEmbedded` debounce? | Manter padrao atual (comentario inline ja documenta motivo). TODO grepavel para day-detail-2. |
| D4 | `priorityOverrides` cleanup add guard? | SIM. Adicionar deduplicacao + short-circuit quando match completo. TDD valida sem flash. |
| D5 | Test framework: `await import()` ou `require()`? | `await import()` (lessons #14/#26). |
| D6 | Hooks isolados ou integration? | Mix. Component tests para dialogs/chips; integration para fluxo combinado (`zoom-full-flow`). |
| D7 | Coach kill-switch afeta UI events? | NAO. Os 9 eventos `coach.day_zoom_*` sao UI telemetry, sempre emitem. |
| D8 | Manter dual-fallback `guaranteedUsd ?? guaranteed` no Edit hidrate? | Documentar como Q-aberta (Q-K). Decisao: manter por enquanto + TDD test cobrir ambos paths. Refactor de FX normalization fica para `system-architect` analisar. |

---

## 10. Questoes abertas (Q-A..Q-N)

- **Q-A: Optimistic priority race race condition adicional?**
  Sequencia: (1) user clica `1`, (2) overlay `1`, (3) user clica `2` antes do server confirmar (1), (4) overlay `2`, (5) server retorna `1` (primeira PUT), (6) cleanup compara `2 vs 1` → mismatch, mantem overlay `2`, (7) segunda PUT chega, server retorna `2`, (8) cleanup match, remove overlay. Funciona, mas TDD precisa cobrir essa sequencia explicitamente. Architect confirma.

- **Q-B: SSR localStorage guard suficiente?**
  Atual: `typeof window !== "undefined"` antes de `localStorage.getItem`. Edge: `window` existe mas `localStorage` lanca (modo privado Safari). Adicionar try/catch externo? Decisao: SIM, com fallback silent para default.

- **Q-C: Library collapse persistencia cross-day?**
  Key atual: `dayZoom.library.collapsed` (global, NAO por day). Decisao spec: manter global (user expressou preferencia uma vez por sessao). Architect confirma se quer key por-day.

- **Q-D: Bucketing edge case `HH=23:59`?**
  `time="23:59"` → `parseHour` retorna `23` → slot `"23:00"`. Coberto. `maxLate="00:30"` em torneio que comeca `23:30` (cross-midnight): `parseHour("00:30")=0` → slot `"00:00"`. Pode quebrar sort visual. Architect confirma — possibilidade de adicionar flag `crossesMidnight` no service.

- **Q-E: MaxLate vs time precedencia em badges?**
  Bucketing usa `maxLate || time`. Display do horario no chip usa `time` (start). Badge MaxLate mostra `maxLate` separado. Decisao spec: paridade atual. Architect confirma se quer trocar display do horario do chip para `maxLate` (registro final).

- **Q-F: FX BRL → USD cache no service?**
  Backend chama `nativeToUsd(pt.guaranteed, currency)` por torneio. Se 20 torneios em BRL no mesmo dia: 20 lookups FX (cache existente mitiga). Architect confirma se preocupa para `system-architect` analisar perf.

- **Q-G: Dead code `client/src/components/grind-session-live/AddTournamentDialog.tsx`?**
  Founder ja editou esse arquivo (presente em `git status M`). Esta sprint NAO refatora `grind-session-live`. Se for codigo morto pos-day-detail-zoom-2, deletar em sprint separado (item OUT-7). Architect confirma via `grep` se ainda eh importado.

- **Q-H: Grid layout `lg:grid-cols-5` responsive < lg?**
  Quando `medianFieldSize > 0`, grid vira 5-col em `lg`. Em `md` cai pra 2 ou 3 col (paridade atual). Architect valida se mediana fica em col separado abaixo dos 4 KPIs em `md`.

- **Q-I: Sites obsoletos cleanup automatico?**
  Atual: preservados em localStorage. Cleanup so quando user click "Todas" ou desmarca explicitamente. Manter. Architect confirma.

- **Q-J: Optimistic flash em RF-SMELL-03 detectavel via test?**
  Solucao via `act()` + assert que badge NAO troca brevemente entre overlay → data. Architect confirma metodo (snapshot por frame? `findByTestId` com timeout?).

- **Q-K: `guaranteedUsd ?? guaranteed` ambig no Edit hidrate?**
  Server retorna `guaranteedUsd` (USD). User pode ter cadastrado em BRL via Edit anterior (que enviou BRL). Hidrate em USD → reabrir em USD. Loss-of-fidelity para moedas nativas. Decisao: documentar como debito tecnico; refactor de FX normalization out-of-scope. Architect avalia.

- **Q-L: 5o card mediana mobile breakpoint?**
  Grid `lg:grid-cols-5` quebra para 2 ou 3 col em mobile. Mediana fica visivel ou some? Decisao: visivel (manter render condicional). Architect confirma.

- **Q-M: RF-SMELL-01 telemetria em `setTimeout` quebra `vi.useFakeTimers`?**
  Comentario inline (linha 95-97 de `BibliotecaEmbedded`) ja documenta. TDD usa `advanceTimersByTime(300)` + assert sincrono. Architect confirma padrao.

- **Q-N: Cap de testes 100 vs 80?**
  Estimativa 80-100. Se algum RF precisar de >15 tests, considerar split. Architect valida em Fase 2.

---

## 11. Verificacao Final (PM checklist)

- [x] 9 RFs ja shippadas mapeadas com criterios verificaveis (cap 11/criterio).
- [x] 4 RF-FIX para bugs latentes documentados com cadeia de causalidade.
- [x] 3 RF-SMELL com decisao explicita (manter/guard/comment).
- [x] Cenarios de teste cobrem happy + erro + edge.
- [x] Mapeamento RF → arquivo TDD (9 arquivos novos + 1 integration).
- [x] Telemetria: 9 eventos existentes documentados (zero novo).
- [x] Endpoints: zero novos (4 existentes confirmados).
- [x] Modelos: zero migration; schema confirmado em `shared/schema.ts`.
- [x] PII guard explicito.
- [x] 8 decisoes (D1..D8) registradas.
- [x] 14 Questoes abertas (Q-A..Q-N) documentadas.
- [x] Lessons aplicaveis citadas (#1, #14, #15, #18, #21, #26, #27, #29).
- [x] Diagramas delegados ao `system-architect` com 2 placeholders.
- [x] Sprint OUT lista 9 itens com criterio promocao.
- [x] Cap de linhas: ~580 (cap 600 OK).

---

## 12. Proximo passo

Spec aprovada → `system-architect` para:

1. Criar ADR (proximo numero apos ADR-210; sugestao **ADR-211** ou seguinte) documentando a consolidacao TDD pos-quick-iterate.
2. Criar 2 diagramas Mermaid em `Docs/architecture/diagrams/day-detail-consolidation/`:
   - `component-tree.mermaid` (consolidado pos-9 RFs).
   - `sequence-priority-overlay.mermaid` (race condition RF-SMELL-03 + Q-A).
3. Resolver Q-A..Q-N e atualizar este spec com decisoes finais.
4. Definir scaffold dos 10 arquivos TDD (9 component + 1 integration) com factory de `mockUseDayDetail`.

**Comando recomendado:**
```
Use o agente system-architect para criar a arquitetura
baseada na spec em Docs/specs/sprint-day-detail-consolidation.md
```

Apos architect → `test-writer` (RED phase para todos os 80-100 testes) → `implementer` (GREEN phase, **so toca codigo quando teste falhar** — sem feature nova) → `reviewer` (audit pre-merge).
