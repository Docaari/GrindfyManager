# ADR-213: DayDetailZoom Consolidation — bucketing HH:00, registration_time reuse, optimistic overlay, click-away marker, stacking three-layer, library default minimized, debounce telemetry pattern, deterministic site colors

## Status

Aceito — 2026-05-28.

Cobre Sprint **day-detail-consolidation** (`Docs/specs/sprint-day-detail-consolidation.md`). Sprint TDD de solidificacao do cluster `DayDetailZoom` shippado em 8 commits founder-direto entre `2a2a514c..439bb60c` (sem `system-architect` previo). Este ADR formaliza as 8 decisoes arquiteturais que sustentam as 9 RFs ja em producao + 4 fixes de bugs latentes + 3 sanitizacoes de smells.

Sucede ADR-210 (DayDetailZoom — modal central + split + DnD herdado + flag rollback 30d), que cobriu a arquitetura base. **NAO substitui** ADR-210 — extende. ADR-210 cobre o "como abrir e renderizar o modal"; este ADR cobre o "como cada interacao interna se comporta".

## Data

2026-05-28

## Contexto

Os commits `2a2a514c..439bb60c` introduziram comportamentos que precisam ser **fixados via TDD** antes de qualquer mudanca futura:

| Commit | RFs cobertas |
|---|---|
| `2a2a514c` | RF-01 (Criar) + RF-03 (Delete X inline) |
| `276c0173` | RF-02 (Edit dialog) + RF-04 (Mover entre horarios) |
| `855bc069` | RF-05 (Prioridade Star/Flag) + RF-06 (Filtros plataforma) |
| `ba772668` | Bug fix prioridade nao salvava + UX conforto |
| `cb41c107` | RF-08 (Max Late) + RF-09 (Garantido USD + Mediana Field) + fix priority z-index |
| `6f0396bc` | SQL fix — `day-detail` handler nao retornava `prioridade` + `registration_time` |
| `439bb60c` | RF-07 (Biblioteca colapsavel default minimizada) + botao + maior |

Cada decisao abaixo foi tomada **on-the-fly durante o quick-iterate** e precisa ser documentada antes que o `test-writer` escreva 9 arquivos de teste novos (Fase 3 do plano).

Forcas principais:

- **Zero migration** — tabela `planned_tournaments` ja tem `prioridade`, `registration_time`, `guaranteed`. Sprint nao pode introduzir schema delta (cap 2-3 dias, zero feature nova).
- **Zero endpoint novo** — todos os 4 endpoints existentes (`GET day-detail`, POST/PUT/DELETE `planned-tournaments`) ja cobrem o cluster.
- **9 RFs ja shippadas** — implementer NAO pode reescrever; so corrigir o que teste falhar.
- **4 bugs latentes** reportados pelo founder durante quick-iterate (prioridade nao persiste, garantido nao exibe, badge MaxLate ausente, mediana nao mostra) — TDD valida fix ou guia debug.
- **3 smells** identificados na revisao manual (telemetria em setTimeout, eslint-disable em useEffect deps, race condition no cleanup de `priorityOverrides`).

## Decisoes

### D1 — Bucketing por `HH:00` + manter `time` original no chip (display vs sort)

**Contexto:** chips com horario fracionario (ex: `time=13:30`) precisam cair em slot `HH:00` para alinhar com a grade visual de horarios cheios. Mas o display do chip continua mostrando `13:30` (precisao para o jogador).

**Decisao:**

```ts
const bucketRef = item?.maxLate || item?.time;       // raw "HH:MM"
const [hh] = bucketRef.split(':');                    // "HH"
const slotKey = `${hh.padStart(2, '0')}:00`;          // "HH:00"
```

Quando `maxLate` esta presente, o bucketing usa `maxLate` (jogador entra ate o ultimo minuto possivel — o `maxLate` representa "ate quando posso registrar"). Sem `maxLate`, fallback para `time` (inicio do torneio).

**Consequencias:**

- Dois itens com `time=13:30` + `time=13:45` (ambos sem `maxLate`) caem **ambos** em slot `13:00`. Esperado — sort secundario por `time ASC` os ordena dentro do slot.
- Multiplos slots `HH:00` granulares (ex: `13:30`, `13:45`) **nao existem** na grade. Esperado — grade eh por hora cheia.
- Display do chip preserva `time` raw para precisao operacional do jogador.

### D2 — Reuso coluna legacy `registration_time` como `maxLate` (zero migration)

**Contexto:** tabela `planned_tournaments` ja tem `registration_time varchar` (schema.ts §566) — coluna criada em sprint antigo (`late-reg-alerts-architecture`, ADR-008). Adicionar `max_late` como coluna nova exigiria migration (cap 2-3 dias da sprint nao comporta).

**Decisao:**

- Dialogs Create/Edit aceitam input UI rotulado `Max Late` (HH:MM, opcional).
- No payload POST/PUT, o campo eh mapeado para `registrationTime`:
  ```ts
  payload.registrationTime = formData.maxLate || null;
  ```
- Backend `GET /api/grade/day-detail/:p/:d` retorna o campo via passthrough:
  ```sql
  SELECT pt.registration_time AS "registrationTime", ...
  ```
- Frontend usa `item.maxLate` (alias no service hook `useDayDetail`) ou `item.registrationTime` direto.

**Consequencias:**

- Conceitualmente desalinhado: o nome `registration_time` no DB nao reflete o uso atual `maxLate`. Smell aceitavel para evitar migration.
- Sprint futuro pode renomear via 2-step rename (`max_late` coluna nova → dual-write → cutover → drop). TODO grepavel: `// TODO(day-detail-3): 2-step rename registration_time → max_late`.
- `tournaments` (historico) tambem tem `registration_time` — paridade preservada.

### D3 — Optimistic priority overlay pattern + cleanup via useEffect quando server confirma

**Contexto:** `mutatePriority` chama PUT `/api/planned-tournaments/:id`, refetch dispara `queryClient.invalidateQueries`. Window entre click optimistic e refetch causa flash visual se o server retorna o mesmo valor — o badge "pisca" entre optimistic value e server value.

**Decisao:**

State local `priorityOverrides: Record<id, priority>`:

```ts
const [priorityOverrides, setPriorityOverrides] = useState<Record<string, number>>({});

// Click handler
const handlePrioritySet = (id: string, newPriority: number) => {
  setPriorityOverrides((prev) => ({ ...prev, [id]: newPriority })); // optimistic
  safeEmit('coach.day_zoom_priority_set', { tournamentId: id, prioridade: newPriority, ... });
  mutatePriority({ id, prioridade: newPriority });
};

// Cleanup quando server confirma valor identico
useEffect(() => {
  if (!data?.list) return;
  setPriorityOverrides((prev) => {
    const next = { ...prev };
    let changed = false;
    for (const item of data.list) {
      if (item.id in next && data.list.find(i => i.id === item.id)?.prioridade === next[item.id]) {
        delete next[item.id];
        changed = true;
      }
    }
    return changed ? next : prev; // short-circuit (RF-SMELL-03)
  });
}, [data?.list]);

// Render usa overlay
const effectivePriority = priorityOverrides[item.id] ?? item.prioridade;
```

**Consequencias:**

- State cresce enquanto user clica rapido (entries acumulam). Cap implicito: numero de torneios visiveis por dia (~30 max). Aceitavel.
- Cleanup com short-circuit `changed ? next : prev` evita re-render desnecessario (RF-SMELL-03 fix).
- Race condition residual: se server retorna valor diferente do overlay (ex: PUT 4xx silencioso), overlay persiste indefinidamente. Mitigacao: rollback explicito no `onError` do mutate.

### D4 — Click-away pattern com `data-zoom-menu` markers e document `mousedown` listener

**Contexto:** os menus de prioridade (RF-05) e de mover (RF-04) sao dropdowns custom (NAO Radix `DropdownMenu`). Sem o trigger click-outside nativo do Radix, precisam de mecanismo proprio para fechar quando user clica fora.

**Decisao:**

- Container de cada menu ganha atributo `data-zoom-menu` no DOM:
  ```tsx
  <div data-zoom-menu data-testid="day-zoom-tournament-priority-menu" className="...">
    {/* opcoes */}
  </div>
  ```
- `useEffect` instala `document.addEventListener('mousedown', handler)` quando qualquer menu esta aberto:
  ```ts
  useEffect(() => {
    if (!openMenuId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-zoom-menu]')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);
  ```

**Consequencias:**

- Padrao se acumula se outros menus custom no Zoom aderirem (ex: future filtros avancados). Aceitavel — convencao explicita.
- `useEffect` so dispara quando algum menu esta aberto (gate `if (!openMenuId) return`). Sem leak de listeners.
- Conflito potencial: `mousedown` em chip de torneio dispara handler antes do `click` do dropdown trigger. Mitigacao: `e.stopPropagation()` no botao trigger do menu.

### D5 — Stacking context: chip ativo `z-40` + menu `z-50` (acima do modal `z-50` overlay)

**Contexto:** Radix `Dialog` cria stacking context com overlay `z-50`. Menu interno (prioridade/mover) precisa renderizar **acima** do chip pai (que esta dentro do modal) sem quebrar foco trap do Radix nem o overlay.

**Decisao:**

Tres camadas explicitas:

| Camada | z-index | Quem |
|---|---|---|
| Radix Dialog overlay | `z-50` (portal raiz) | `DialogOverlay` (Radix default) |
| Modal Content (panel-left + panel-right) | sem z explicito (herda contexto) | `DialogPrimitive.Content` |
| Chip ativo (com menu aberto) | `z-40` + `relative` | `<div>` wrapper do chip |
| Menu dropdown (filho do chip) | `z-50` absolute | `<div data-zoom-menu>` |

```tsx
<div className={cn('group relative', openMenuId === item.id && 'z-40')}>
  {/* chip content */}
  {openMenuId === item.id && (
    <div data-zoom-menu className="absolute top-full left-0 z-50 ...">
      {/* opcoes */}
    </div>
  )}
</div>
```

**Consequencias:**

- Tres camadas (overlay `z-50` → chip `z-40` → menu `z-50`) dentro do Portal Radix. Funciona porque o overlay vive em `document.body` e o Content + menu vivem dentro de `#dnd-portal-container` (ADR-210 D3) — stacking contexts separados.
- Outros menus dentro do Zoom devem seguir este padrao para evitar conflitos.
- Fix shippado em `cb41c107` documentado aqui (era smell pre-fix: menu renderizava abaixo do chip vizinho).

### D6 — Default minimizada biblioteca + Panel imperative collapse defer

**Contexto:** `BibliotecaEmbedded` (painel direito) ocupa 40% width default (split via `react-resizable-panels`). User maioria das vezes ja conhece os torneios da biblioteca; abrir o Zoom para revisar um dia especifico nao requer biblioteca sempre aberta.

**Decisao:**

- Default `libraryCollapsed = true` ao abrir modal (paridade `439bb60c`).
- Persistencia `localStorage['dayZoom.library.collapsed']` (boolean). SSR guard `typeof window !== "undefined"`.
- Toggle imperativo via ref:
  ```tsx
  const libraryPanelRef = useRef<ImperativePanelHandle | null>(null);

  useEffect(() => {
    if (!open) return;
    const stored = readLocalStorage('dayZoom.library.collapsed', true);
    setLibraryCollapsed(stored);

    // Defer panel.collapse/expand para apos primeiro paint (panel registra size)
    const timer = setTimeout(() => {
      if (stored) libraryPanelRef.current?.collapse();
      else libraryPanelRef.current?.expand();
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);
  ```

**Consequencias:**

- User novo pode demorar a achar a biblioteca. Mitigado pelo botao `day-zoom-library-expand-button` visivel sempre quando colapsada.
- Toggle imperativo via ref bypass-a render lifecycle do React. Aceitavel — `react-resizable-panels` documenta o pattern.
- Defer com `setTimeout(0)` evita race com primeiro paint do Panel (que precisa registrar size antes de aceitar `.collapse()`).

### D7 — Debounce telemetria movida para `useEffect` (fix antipadrao linha 108 `BibliotecaEmbedded`)

**Contexto:** linha 108 de `BibliotecaEmbedded.tsx` emite `coach.day_zoom_search` **dentro** do `setTimeout` do debounce de busca. Quebra com `vi.useFakeTimers()` em testes — `advanceTimersByTime(300)` nao aguarda reflow do React, entao `safeEmit` captura `searchContext` stale.

**Decisao:**

Mover telemetria para `useEffect` com deps `[debouncedQuery]`:

```ts
const [query, setQuery] = useState('');
const [debouncedQuery, setDebouncedQuery] = useState('');

// setTimeout so atualiza state
useEffect(() => {
  const timer = setTimeout(() => setDebouncedQuery(query), 300);
  return () => clearTimeout(timer);
}, [query]);

// useEffect emite quando debouncedQuery muda
useEffect(() => {
  if (!debouncedQuery) return;
  safeEmit('coach.day_zoom_search', {
    query: debouncedQuery,
    resultCount: filteredLibrary.length,
    dayOfWeek,
  });
}, [debouncedQuery, dayOfWeek, filteredLibrary.length]);
```

**Consequencias:**

- 1 render extra por debounce (state update → re-render → useEffect). Aceitavel (300ms gap dilui custo).
- Tests com `vi.useFakeTimers` funcionam: `advanceTimersByTime(300)` → state update → React flush → useEffect → `safeEmit`.
- Comment inline antigo ("para garantir captura sincrona em tests") removido — anti-pattern documentado nesta ADR ao inves de inline.

**Nota:** spec da Sprint (linha 403-405) recomenda **manter** o comportamento atual + adicionar TODO. Este ADR diverge — opta pelo fix simples (move pra `useEffect`) ao inves de manter smell. Decisao final ao implementer + reviewer (impacta lesson #14 do CLAUDE.md sobre `vi.useFakeTimers`).

### D8 — Hash-based fallback `siteColors` determinista

**Contexto:** 12 sites de poker conhecidos (PokerStars, GGPoker, ACR, WPN, Bodog, Coin, etc) tem paleta de cor mapeada explicitamente. Sites novos (typos, custom names, redes nao mapeadas) caem em fallback — sem estrategia, render fica `bg-gray-500` flat sem diferenciacao visual.

**Decisao:**

Hash deterministico do nome do site:

```ts
const FALLBACK_PALETTES = [
  { bg: 'bg-violet-500', text: 'text-violet-100' },
  { bg: 'bg-pink-500', text: 'text-pink-100' },
  { bg: 'bg-teal-500', text: 'text-teal-100' },
  { bg: 'bg-orange-500', text: 'text-orange-100' },
  { bg: 'bg-lime-500', text: 'text-lime-100' },
  { bg: 'bg-sky-500', text: 'text-sky-100' },
];

function siteColors(site: string): { bg: string; text: string } {
  const known = KNOWN_SITE_COLORS[site.toLowerCase()];
  if (known) return known;

  // Hash determinista: soma charCodeAt mod 6
  let hash = 0;
  for (let i = 0; i < site.length; i++) {
    hash = (hash + site.charCodeAt(i)) % FALLBACK_PALETTES.length;
  }
  return FALLBACK_PALETTES[hash];
}
```

**Consequencias:**

- Colisao possivel mas baixa probabilidade (6 paletas distribuem ~uniformly via soma simples).
- Cor estavel entre sessoes/reloads — mesmo input gera mesmo output (sem cache, sem state).
- Sites mapeados (KNOWN_SITE_COLORS) tem precedencia. Adicionar site novo ao mapa override-a o fallback.
- Algoritmo simples (`charCodeAt` sum) — facil de testar via snapshot.

## Consequencias gerais

**Positivas:**

- 8 decisoes fixadas como contrato — `test-writer` tem base para 9 arquivos de teste (1 por RF).
- Smell `priorityOverrides` race (RF-SMELL-03) tem guard formalizado (D3 short-circuit).
- Smell debounce telemetria (RF-SMELL-01) tem fix arquitetural (D7 mover pra useEffect).
- Zero migration + zero endpoint novo — sprint cabe em 2-3 dias.
- Bug latente "prioridade nao persiste" resolvido por D2 (SQL passthrough garantido em `6f0396bc` + assert via TDD).
- Bug latente "max late nao aparece" resolvido por D2 + D1 (bucketing usa `maxLate`).

**Negativas:**

- Smell legacy `registration_time` (D2) preservado por mais um sprint. Cost: confusao conceitual para devs novos. Mitigacao: TODO grepavel + doc em `data-model-index.md`.
- D4 (click-away custom) acumula listeners se mais menus custom forem adicionados. Cost: nao usa Radix `DropdownMenu` (que ja resolve isso). Mitigacao: limit explicito + future migration para `DropdownMenu`.
- D5 (3-layer z-index) eh fragil — adicionar um modal nested dentro do Zoom quebra. Cost: ADR-210 ja limita modal Edit dentro do Zoom como Radix Dialog aninhado (Radix gerencia stacking).

**Neutras:**

- D8 (hash-based site colors) cria visual estavel mas nao tematico — site fictio "MyPoker" pode cair em violet sem motivo. Aceitavel para v1.
- D7 (mover telemetria) diverge da spec (linha 403). Decisao final ao implementer.

## Referencias

- ADR-008: Late registration alerts architecture (`registration_time` coluna original).
- ADR-011: react-beautiful-dnd choice (DnD herdado).
- ADR-188: Mini Player displayMode FSM (state machine pattern reuse).
- ADR-193: Queue UI persistence model (localStorage primario).
- ADR-207: recordActivity event convention (telemetria `coach.day_zoom_*`).
- ADR-210: DayDetailZoom modal central + split + DnD herdado + flag rollback 30d.

## Confianca

**Alta** — 8 commits founder-direto ja em producao validam o design empiricamente. ADR formaliza o "como funciona hoje" + corrige 3 smells documentados na revisao manual.
