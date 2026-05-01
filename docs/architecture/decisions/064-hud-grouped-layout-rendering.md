# ADR-064 — Hand2Note Grouped Layout Rendering

- Status: Accepted
- Date: 2026-05-01
- Sprint: Stats-V3 / F2 (precede F4 — `HudGroupedView` implementation)
- Decision owner: autonomous (founder AFK; spec defaults Stats-V3 RF-01..RF-04)
- Related: ADR-058 (V2 catalogo estatico), ADR-062 (V2 grouped tool response),
  ADR-063 (direction semantics), ADR-066 (3-way compare semantics)

## Context

Stats-V2 entregou customizer + comparator com layout *grid simples* (2/3/4
colunas conforme tamanho da tela), agrupando stats apenas via header textual
sem branding visual forte. Funciona para um catalogo de 12-30 stats, mas
falha em escala:

- 217 stats em 16 grupos viram uma "parede de texto".
- Jogadores que ja usam Hand2Note 4 (referencia de mercado segundo
  `docs/strategy/stats-v3-research.md`) nao reconhecem o layout — sao forcados
  a re-aprender associacao stat ↔ grupo.
- Sem header colorido por grupo, o olho nao consegue saltar para "RFI por
  posicao" rapidamente em uma sessao de revisao pos-grind.

A pesquisa confirmou: **Hand2Note popup default eh estado-da-arte em
densidade + agrupamento semantico**. PT4/HM3 sao "tabela seca" que perdem em
escaneabilidade. Copiar o padrao H2N (header verde colorido por grupo,
colunas `target | hero` em popup escuro) eh decisao baixo-risco e reduz
friction de adocao para jogadores que ja usam ferramentas profissionais.

V3 nao quebra V2: o catalogo permanece estatico (ADR-058), templates V2
viram **presets de filtro UI** sobre o catalogo completo, e snapshots
existentes continuam validos. A mudanca eh puramente de **rendering**.

Tres alternativas foram avaliadas:

1. **Tabela unica scroll vertical** (todos 217 stats em uma flat list com
   sub-headers textuais). Rejeitado: perde branding H2N, dificulta
   collapse/expand por grupo, jogador nao consegue focar em area especifica.
2. **CSS Grid `auto-fit`** (deixar browser decidir layout). Rejeitado: nao
   da controle de header colorido por grupo, comportamento de quebra
   inconsistente entre browsers, perde densidade controlada.
3. **Iframe popup do H2N real** (reusar UI proprietaria via iframe).
   Rejeitado: viola EULA H2N, security headers (CSP), zero controle de
   interatividade (inline edit impossivel).
4. **Templates V2 como snapshots de catalogo reduzido** (cada template =
   subset de stats). Rejeitado: viola ADR-058 (catalogo unico fonte de
   verdade), forca migration para excluir stats por template, perde
   capacidade de filtrar dinamicamente por preset.

A decisao escolhida e **componente novo `HudGroupedView` que renderiza por
grupo (16 sections) sobre o catalogo completo**, com presets de filtro
sobrepostos via `useState` no client.

## Decision

### Componente `HudGroupedView.tsx`

Path: `client/src/components/studies/stats/HudGroupedView.tsx`.

Renderiza **16 cards** (ordem do `HUD_GROUP_IDS` em `shared/hud-stat-catalog.ts`):

```ts
interface HudGroupedViewProps {
  snapshot: HudStatSnapshot;        // hero values + sample size
  layout: HudLayout;                // fields_json com targets + customs
  filters: FilterState;             // search + group toggles + preset
  onEditTarget: (statId: string, range: TargetRange) => void;
  onEditValue: (statId: string, value: number | null) => void;
  onAddCustom: (groupId: HudGroupId) => void;
  // 3-way mode (ADR-066): se snap2 presente, render colunas extras
  snap2?: HudStatSnapshot;
  comparisonMode?: 'single' | 'three_way';
}
```

### Estrutura de cada card

```
┌─────────────────────────────────────────────────┐
│ 🟢 BASICOS                              [12 stats]  ← header bg-emerald-700
├─────────────────────────────────────────────────┤
│ Stat label          target           hero       │  ← 3-col table single-mode
│ VPIP                20-25%           22%        │     4-col em 3-way mode
│ PFR                 16-22%           18%        │     (target | snap1 | snap2 | delta)
│ 3Bet PF             6-10%            7%         │
│ ...                                             │
├─────────────────────────────────────────────────┤
│ + Stat custom                                   │  ← button RF-07
└─────────────────────────────────────────────────┘
```

- Header: `bg-emerald-700 text-white px-3 py-2 font-semibold` + chevron
  (`ChevronDown` / `ChevronRight` do Lucide) + badge contagem.
- Tabela: `bg-slate-900 text-xs leading-tight px-2 py-1`.
- Stat label: `text-white`.
- Target: `text-orange-400` (destaca range — convencao H2N).
- Hero value: `text-white`. `null` → `text-slate-500 italic` exibindo `—`.
- Mobile (<640px): 2 colunas (esconde target column; valor exibido em
  tooltip ao tocar/hover na cell hero).

### Catalogo completo como tabela default (RF-02)

Templates V2 (`mttDefault`, `mttCashCompact`, `mttSnGCompact`,
`mttFinalTable`) **NAO** sao mais snapshots de catalogo reduzido — viram
**presets de filtro UI** que aplicam visibility por `(groupId, statId)` sobre
o catalogo completo.

```ts
type FilterState = {
  searchQuery: string;
  activeGroups: Set<HudGroupId>;     // default: all 16 ativos
  preset: PresetId | null;           // null = sem preset
};

type PresetId =
  | 'mttDefault' | 'mttCashCompact' | 'mttSnGCompact' | 'mttFinalTable'
  | 'offTargetOnly' | 'topTenLeaks' | `groupOnly:${HudGroupId}`;
```

Aplicacao:
- Search: `stat.label OR stat.id contains query` (case-insensitive,
  debounce 200ms).
- Group toggles: `activeGroups.has(stat.group)`.
- Preset overrides:
  - `mtt*`: subset de `(groupId, statId)` predefinido por template.
  - `offTargetOnly`: requer snapshot ativo, filtra
    `value !== null && (value < min || value > max)`.
  - `topTenLeaks`: top 10 stats com `|delta|` max, requer snapshot.
  - `groupOnly:${id}`: equivalente a desativar todos exceto 1 grupo.

Filtros combinaveis (AND). Sem preset = todos os 217 stats visiveis.

### Render eficiente — content-visibility condicional

Render de 217 stats x DOM cells (~600 elements) em uma pagina pode causar
lag em mobile/Chrome em devtools. Estrategia:

- **Card collapsed** (`expanded: false`): body usa
  `style={{ contentVisibility: 'auto' }}` + `containIntrinsicSize` estimado
  (ex: `containIntrinsicSize: '0 200px'`). Browser pula layout/paint do
  conteudo nao-visivel, mantendo scrollheight.
- **Card expanded** (`expanded: true`): render React normal, sem otimizacao.

Sem virtualizacao por linha (react-window) — overhead maior que ganho para
~14 stats por grupo. `content-visibility` no body do card eh otimizacao
zero-custo (CSS puro, sem JS extra).

### State de expand/collapse persistente em localStorage (RF-04)

Key: `stats-v3-expand-state` (versionada, lesson D13).

Shape:
```ts
type ExpandState = Record<HudGroupId, boolean>;  // 16 entries
```

Default ao primeiro carregamento (sem entry no localStorage): **todos
expanded**. Permite o user ver o catalogo completo de cara, decidindo o que
recolher.

Save: throttled 500ms (evita write a cada toggle rapido).
Load: try/catch — `JSON.parse` invalido OU `QuotaExceededError` em set →
fallback para `Record<HudGroupId, true>` em memoria + `console.warn`.

Lesson #12 aplicada: state crucial em React Query cache, mas **expand state
nao afeta dados — local-only OK**. Re-mount preserva via localStorage; perda
em incognito tab eh tolervel.

### Custom stats por grupo (RF-07)

Botao `+ Stat custom` no footer de cada card. Click abre dialog Radix
(`Dialog` + `Form` + Zod resolver):

- `label` (string, max 60 chars).
- `unit` (`pct` | `bb` | `count`).
- `targetMin`, `targetMax` (number, validacao por unit).
- `direction` (default `context` — ADR-063).

Submit faz PUT `/api/hud-layouts/:id`:
```json
{
  "fields_json": [
    ...existing,
    {
      "id": "custom_a8b3c9d1",
      "group": "basics",
      "label": "Avg Stack BB",
      "targetMin": 20,
      "targetMax": 100,
      "direction": "context",
      "unit": "bb",
      "isCustom": true
    }
  ]
}
```

`id` via `custom_${nanoid(8)}` (~36^8 colisoes irrelevantes).
`isCustom: true` habilita badge "Custom" + botao delete.
Customs NAO entram em `HUD_STAT_CATALOG` — vivem somente em
`hud_layouts.fields_json` (escopo user/layout).

### Layout 3-coluna em 3-way mode (RF-14)

Quando `comparisonMode === 'three_way'` e `snap2` presente, tabela ganha
colunas extras (ADR-066):

```
Stat label         target    snap1     snap2     delta   trend
VPIP               20-25%    22%       24%       +2%     →
Fold vs 3bet       45-55%    50%       60%       +10%    ↓↓ (red)
```

Cor-coding e trend indicator detalhados em ADR-066. `HudGroupedView`
delega renderizacao de cell para `<HudStatRow snap1={...} snap2={...}/>`
que aplica direction + status logic.

## Consequences

### Positivas

- **Branding H2N em 16 cards** — jogadores profissionais reconhecem
  layout instantaneamente, friction de adocao zero.
- **Catalogo completo visivel por default** — power users veem todos os
  217 stats; casuais usam preset `mttDefault` para ver subset.
- **Templates V2 preservados** como presets — zero quebra de contrato com
  layouts custom V2 (continuam validos via `fields_json` do layout).
- **Expand/collapse persistente** — user customiza visualizacao por
  sessao sem re-clicar 16x cada vez que abre /studies.
- **`content-visibility: auto`** — render de 217 stats fica <300ms (RNF-01)
  sem virtualizacao manual (react-window).
- **Custom stats por grupo** — power users adicionam stats que nao estao
  no catalogo PT4/H2N (ex: "Avg Open Size em SB vs CO") sem aguardar
  release Grindfy.

### Negativas

- **Bundle JS aumenta ~12KB** (novo componente + filter state + custom
  dialog). Aceitavel — pagina /studies ja eh code-split (lazy import).
- **Mobile <640px reflow** — 2 colunas (esconde target). Tooltip eh
  compromisso UX (1 toque extra para ver target). Aceito ate V4 quando
  responsive design ganha sprint dedicada.
- **localStorage size** — 16 entries x ~30 bytes = ~500B. Negligivel.
  `QuotaExceededError` mitigado com fallback em memoria.
- **content-visibility nao funciona em Safari <16.4** — fallback render
  React normal (sem otimizacao de layout). p95 ~400ms em Safari mobile
  vs <300ms Chrome — dentro de tolerancia (RNF-01 valida em desktop).
- **Customs nao entram em snapshots compartilhados (futuro)** — viver em
  layout do user. Quando V5 introduzir layouts compartilhados (DEBT-V5),
  customs precisam migrar para tabela `hud_layout_custom_stats` ou serem
  copiados no fork. Documentado em RISK-4 da spec V3.

### Neutras

- **Acessibilidade**: cards com `role="region" aria-labelledby={groupId}`
  + chevron com `aria-expanded`. Navegacao via Tab + Enter expande/recolhe.
  Filter pills com `role="checkbox" aria-checked` (RNF-03).
- **Tests**: AC-1.1 a AC-1.4 cobrem grid de 16 cards, contagem de stats,
  null rendering, default basics 12 stats. Testes RTL `data-testid`
  estavel por grupo (`data-testid={`hud-group-${groupId}`}`) — lesson #2.
- **Storybook (futuro)**: 4 estados — vazio (sem snapshot), default
  (snapshot single), 3-way (com snap2), preset off-target only.

## Alternativas rejeitadas

### A1 — Tabela unica scroll vertical com sub-headers textuais

Renderizar todos 217 stats em flat `<table>`, com `<thead>` para cada
grupo. Rejeitado:
- Perde branding H2N — header colorido por grupo eh diferenciador chave.
- Collapse/expand por grupo virtualmente impossivel (table rows
  agrupados lutam contra layout flow).
- Densidade visual menor — sub-header textual nao chama olho como header
  colorido.
- Performance pior com `<table>` de 217 rows + ~600 cells (sem
  virtualizacao).

### A2 — CSS Grid `auto-fit` sem cards

`grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` sem
sectioning por grupo. Rejeitado:
- Browser decide layout sem semantica — grupos podem quebrar entre cards
  arbitrariamente.
- Sem header colorido por grupo (info perdida).
- Inline edit fica complicado (popover precisa contexto de grupo).

### A3 — Iframe Hand2Note popup

Embedar UI proprietaria H2N via iframe (assumindo browser-based release
H2N futuro). Rejeitado:
- Viola EULA H2N (no-redistribution + no-modification).
- CSP headers Grindfy bloqueiam cross-origin.
- Zero controle de interatividade — inline edit impossivel.
- H2N hoje eh desktop-only Windows; iframe inviavel.

### A4 — Templates V2 como snapshots de catalogo reduzido

Persistir `mttDefault`, etc, como subset de `(groupId, statId)` no DB
(`hud_template_catalog`). Rejeitado:
- Viola ADR-058 (catalogo unico fonte de verdade).
- Migration por nova stat (cada release Grindfy adiciona ~5 stats).
- Templates ficam "congelados" — nao acompanham evolucao do catalogo.
- V3 mantem templates como **codigo** (`shared/hud-templates.ts`) +
  presets UI — sem custo de manutencao adicional.

## Confianca

Alta. Padrao H2N validado em pesquisa de mercado (`stats-v3-research.md`
secao 1). Implementacao 100% client-side — zero risco de migration ou
quebra de schema. Reversivel: feature flag `useHudGroupedViewV3` pode
voltar para `HudCustomizer` V2 em PR de 1 linha. Tests RTL determinista
cobrem todos ACs RF-01..RF-04. Templates V2 preservados — zero quebra de
contrato com users existentes.
