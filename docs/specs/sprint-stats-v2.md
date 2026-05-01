# Sprint Stats-V2 — Catalogo HUD Profissional 200+ Stats

- Status: Spec aprovada (autonomo founder AFK)
- Data: 2026-05-01
- Branch: `feature/stats-analyzer-v2`
- Worktree: `B:\grindfy-stats-v2`
- Modulo: Studies (`/studies` aba "Stats Analyzer")
- Tier: pro+
- Baseline: Sprint F3 (commit `8d45999` em `feature/stats-analyzer`) — 3 templates, 1 layout customizer minimo, comparator delta cru.

## Visao geral

V2 expande catalogo HUD de ~12 stats (V1) para **200+ stats organizados em
16 grupos profissionais** que espelham o HUD real do founder (PT4 export
profissional). Adiciona `direction` semantics ao comparator (VPIP↑ TAG=ruim,
AF↑=neutro), customizer escalavel com search+filter+virtual-scroll, e
upgrade do Coach tool `read_user_hud_stats` para retornar dados agrupados
com summary de leaks.

V1 (F3) entregou base manual + 3 templates simples. V2 nao quebra V1: layouts
customizados existentes preservados via flag `is_custom`. V3 (futuro) =
population benchmark dinamico + ML-based leak detection.

## Objetivos

1. Expandir catalogo de stats para 200+ (16 grupos espelhando HUD founder).
2. 4 templates novos (mttDefault, mttCashCompact, tournamentEarly, tournamentLate)
   sobrescrevem V1 quando layout `is_custom=false`.
3. Customizer escalavel: search bar, filtro por grupo, drag-drop entre grupos,
   accordion, virtual scroll quando >50 stats, render <500ms.
4. Snapshot editor com auto-save debounced 1s + paste-from-PT4 + import CSV.
5. Comparator com `direction` semantics (4 cores: green/red/gray/orange).
6. Coach tool `read_user_hud_stats` retorna grouped output + summary leaks.
7. Wizard pos-import oferece `mttDefault` como default destacado (NAO auto-submit).
8. Layouts V1 customizados preservados (flag `is_custom=true`).
9. Heatmap visual por grupo + trend chart historico por stat.
10. Export PDF do comparator (defer fallback `window.print()`).

## Requisitos funcionais

### RF-01 — Catalogo HUD estatico

- Arquivo: `shared/hud-stat-catalog.ts` (TypeScript estatico, sem persistencia).
- Tipo `StatField`:
  ```
  {
    id: string;            // snake_case unico (ex: "vpip", "rfi_co", "cbet_flop_ip")
    label: string;         // human readable (ex: "VPIP", "RFI CO", "CBet Flop IP")
    group: HudGroupId;     // enum 16 grupos (RF-02)
    subgroup?: string;     // ex: "by_position", "by_board_texture"
    targetMin: number;     // range alvo low end
    targetMax: number;     // range alvo high end
    direction: 'higher_better' | 'lower_better' | 'context' | 'neutral';
    unit: 'pct' | 'bb' | 'count';
    formula?: string;      // descricao opcional (ex: "won/showdown")
  }
  ```
- Helpers exportados:
  - `getStatById(id: string): StatField | undefined`
  - `getStatsByGroup(groupId: HudGroupId): StatField[]`
  - `getDefaultRange(id: string): { min: number; max: number }`
- Total minimo: 200 entries. Validar via teste unit que `HUD_STAT_CATALOG.length >= 200`.

### RF-02 — 16 grupos profissionais

Enum `HudGroupId` com exatamente estes ids (snake_case):

| ID | Label PT-BR | Foco |
|----|-------------|------|
| `basics` | Basicos | VPIP, PFR, 3Bet, AF, WTSD, W$SD |
| `rfi` | RFI por posicao | RFI EP/MP/CO/BTN/SB |
| `threebet` | 3Bet por posicao/vs raiser | 3Bet UTG/MP/CO/BTN/SB/BB vs raiser |
| `resteal` | Resteal | Resteal SB/BB vs steal |
| `pos_flop_pfr_ip` | Pos-flop PFR IP | CBet IP/Turn/River, give-up |
| `pos_flop_pfr_oop` | Pos-flop PFR OOP | CBet OOP, Probe, Donk |
| `pos_flop_multiway` | Pos-flop Multiway | CBet 3-way, fold to multiway |
| `cbets_by_board` | CBets por textura board | CBet dry/wet/paired |
| `caller_pre_flop` | Caller pre-flop | Cold call, squeeze, flat 3Bet |
| `threeway_bb` | 3-way BB | Defesa BB 3-way |
| `bb_defense` | BB defense | Fold BB vs SB/BTN/CO |
| `pos_flop_pfc_ip` | Pos-flop PFC IP | Float, raise CBet, lead |
| `blind_war_sb` | Blind war SB | Steal SB vs BB, vs limp |
| `blind_war_bb` | Blind war BB | Defense BB vs SB |
| `threebet_pot_ip` | 3Bet pot IP | CBet 3Bet pot IP |
| `threebet_pot_oop_vs_lp` | 3Bet pot OOP vs LP | Defense 3Bet pot OOP vs late position |

Cada grupo deve ter no minimo 8 stats (16 × 8 = 128 minimo) — alvo 200+
distribuidos com pesos diferentes (basics=10, rfi=15, threebet=20, etc).

### RF-03 — 4 templates novos

Sobrescrevem V1 SOMENTE quando `is_custom=false`. Templates:

- **mttDefault** (`name: "MTT Default (200 stats)"`) — todos os 200+ stats,
  layout 3 colunas (group → subgroup → stat).
- **mttCashCompact** (`name: "MTT/Cash Compact"`) — top 30 stats mais usados:
  basics (6), rfi (5), threebet (5), bb_defense (5), pos_flop_pfr_ip (5),
  blind_war_bb (4).
- **tournamentEarly** (`name: "Tournament Early Stage"`) — basics + rfi +
  threebet + bb_defense + blind_war_bb (~80 stats).
- **tournamentLate** (`name: "Tournament Late Stage (push/fold)"`) — basics +
  resteal + threebet + push/fold orientado (~50 stats).

Seedados via `seedDefaultLayouts(userId, version='v2')` no primeiro acesso
pos-deploy V2. Layouts V1 marcados `is_custom=false` recebem upgrade automatico
(replace fields_json) na primeira leitura.

### RF-04 — Customizer escalavel

UI de edicao de layout:
- Search bar no topo (filtra `id`/`label` com debounce 200ms).
- Filtro multi-select por grupo (16 chips toggle).
- Accordion por grupo (collapsed por default quando layout tem >50 stats).
- Drag-drop entre grupos (reordenar/mover stat). Lib: `@dnd-kit/core` (ja instalada).
- Virtual scroll (`react-window` ou equivalente) ativo quando layout tem >50 stats.
- Render inicial 200 stats <500ms (testar via React Profiler em E2E).
- Botao "Add stat from catalog" abre dialog com search + group filter.
- Toggle "include in default view" (chip).

### RF-05 — Snapshot editor refactor

- Layout list a esquerda (reusa V1).
- Stats agrupados por `group` em accordion (RF-04 collapse rules).
- Input por stat (numeric, decimals enforced por `unit`).
- **Auto-save debounced 1s** apos blur ou idle. Toast "Salvo" canto inferior direito.
- **Paste from clipboard** (botao "Importar do PT4"): aceita tab-separated
  `stat_label\tvalue\n...` (export padrao PT4 Stats tab). Parser tenta match
  por `label` (case-insensitive) ou `id`. Stats nao reconhecidas: warning
  toast com lista, ignoradas.
- **Import CSV** (botao "Importar CSV"): aceita `stat,value` (header
  `stat,value` opcional). Mesmo comportamento de matching.
- Stats nao preenchidas: `value=null` no DB (nao `0`). Comparator renderiza
  cinza com tooltip "Nao registrado neste snapshot".

### RF-06 — Comparator com direction semantics

- Cores baseadas em `direction` + delta sign:
  - `direction='higher_better'`: delta>0 → **green**, delta<0 → **red**.
  - `direction='lower_better'`: delta>0 → **red**, delta<0 → **green**.
  - `direction='context'` (ex: VPIP, AF): **orange** sempre (Coach interpreta).
  - `direction='neutral'`: **gray**.
  - `value=null` em A ou B: **gray** com tooltip "Nao registrado".
- Tooltip por stat explica direction (ex: "VPIP varia por estilo — TAG ideal
  20-25%, LAG 28-35%. Coach pode interpretar.").
- Setas mantem semantics V1 (↑↓) mas cor segue regras acima.

### RF-07 — Coach tool grouped

Tool `read_user_hud_stats` (extender V1):
- Retorno:
  ```
  {
    layoutName: string,
    capturedAt: string,
    sampleSize: number | null,
    groups: [
      {
        id: string,                // HudGroupId
        name: string,              // label PT-BR
        stats: [
          {
            id: string,
            label: string,
            value: number | null,
            target: { min: number, max: number },
            delta: number | null,    // value - midpoint(target), null se value=null
            direction: string,
            offTarget: boolean        // true se value fora de [min, max]
          }
        ]
      }
    ],
    summary: {
      totalOffTarget: number,
      biggestLeak: { id: string, label: string, deltaAbs: number } | null
    }
  }
  ```
- Coach ignora stats com `value=null` ao gerar feedback.
- Summary calculado server-side (nao confiar em client).

### RF-08 — Wizard pos-import

- Trigger: usuario importa CSV de torneios pela primeira vez OU acessa
  Stats Analyzer sem snapshots (DB vazio).
- Modal com 4 cards (mttDefault destacado como recomendado).
- Botao default destacado (ex: ring-2 + badge "Recomendado") MAS nao
  auto-submeter (lesson learned #11 — componentes "decorativos" NAO ganham
  acoes default).
- Step opcional: "Preencher exemplo agora?" (pula para snapshot editor com
  layout selecionado).
- Skip button "Configurar depois".

### RF-09 — Backfill F3 layouts

- Migration script (idempotente, runtime no boot) percorre `hud_layouts`:
  - `is_custom IS NULL` → set `false` se `name` em `['Padrao PT4', 'Padrao HM3', 'MTT Generico']`, else `true`.
  - Fields antigos sem `direction` → set `direction='context'` default
    (lado seguro — nao colore false-positive).
  - Sem perda de dados em snapshots.
- Log linhas atualizadas.

### RF-10 — Validacao Zod runtime

- `hud_layouts.fields_json` valida via Zod no insert/update:
  ```
  z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    direction: z.enum(['higher_better','lower_better','context','neutral']),
    unit: z.enum(['pct','bb','count']),
    targetMin: z.number(),
    targetMax: z.number()
  }))
  ```
- Erro 400 com `message` legivel se invalido.

### RF-11 — Heatmap visual por grupo

- Componente `StatGroupHeatmap.tsx` em `client/src/components/studies/stats/`.
- Cada stat = quadrado colorido pelo delta vs midpoint(target).
- Cor: same scale do RF-06 (green/red/gray/orange).
- Hover mostra `value` / `target` / `delta` / `direction` em tooltip.
- Click abre dialog detalhe (label, formula, historico ultimos 5 snapshots).
- Render: grid CSS responsiva (auto-fit minmax 80px).

### RF-12 — Trend chart por stat

- Componente `TrendChart.tsx`.
- Recharts `<LineChart>` historico ultimos N snapshots (N=10 default).
- Linha alvo (`targetMin` e `targetMax`) como `<ReferenceArea>` shaded.
- Tooltip Recharts mostra `capturedAt` + `value`.
- Acessivel via click no heatmap (RF-11) ou click no stat no comparator.

### RF-13 — Export PDF do comparator

- Botao "Exportar PDF" no comparator.
- **Defer condicional**: se setup `puppeteer`/`@react-pdf/renderer`/`sharp`
  >30min em D8, fallback `window.print()` com `@media print` CSS dedicado
  (esconde sidebar, expande comparator full width, paleta print-friendly).
- DEBT registrado se fallback ativo.

### RF-14 — Templates customizados preservados

- Coluna `is_custom boolean NOT NULL DEFAULT false` em `hud_layouts`.
- V2 seed sobrescreve `fields_json` SOMENTE quando `is_custom=false`.
- Customizer toggla `is_custom=true` automaticamente na primeira mutation
  apos seed (write-protect dos templates default).
- Backfill V1 marca todos como `is_custom=false` (RF-09).

### RF-15 — Catalogo estatico (sem persistencia)

- Catalogo NAO vai pra DB. Vive em `shared/hud-stat-catalog.ts` (D2/D3).
- Migration 0020 reservada mas vazia (skip se nao precisar) — schema delta
  apenas se RF-14 exigir nova coluna.
- Catalogo versionado via git (mudancas auditaveis, sem migration).

### RF-16 — Performance criteria

- Render 200 stats no customizer: **<500ms** (medido React Profiler).
- Snapshot save (auto-save): **<300ms** roundtrip API (p95 local).
- Comparator render (200 stats x 2 snapshots): **<200ms**.
- Tests: bench em `tests/performance/stats-v2.bench.ts` (vitest bench API).

## Requisitos nao-funcionais

### RNF-01 — Mobile

- Customizer com 200 stats em <375px: accordion collapse-all default,
  search bar sticky top, drag-drop disabled em touch (usar arrows up/down).
- Snapshot editor: 1 coluna, virtual scroll mandatorio.
- Comparator: accordion stacked (V1 pattern).

### RNF-02 — i18n

- Stat labels em ingles (siglas universais: VPIP, RFI, 3Bet).
- Group labels em PT-BR (RF-02 tabela).
- Template names em PT-BR.

### RNF-03 — Tier

- pro+ apenas (consistente com V1).

### RNF-04 — A11y

- Customizer drag-drop com aria-grabbed/aria-dropeffect (`@dnd-kit/core` ja
  expoe).
- Heatmap: cada quadrado focusable via Tab + Enter abre detalhe.
- Trend chart: `role="img"` + aria-label descritivo.

## Acceptance criteria

### RF-01 catalogo
- [ ] AC-1.1: `HUD_STAT_CATALOG.length >= 200` (unit).
- [ ] AC-1.2: `getStatById('vpip')` retorna entry valida com `direction='context'` (unit).
- [ ] AC-1.3: Todos `id` snake_case unicos (unit).
- [ ] AC-1.4: Toda entry tem `direction` definido (unit).

### RF-02 grupos
- [ ] AC-2.1: Enum `HudGroupId` com 16 ids exatos (unit).
- [ ] AC-2.2: Cada grupo tem >=8 stats (unit).
- [ ] AC-2.3: `getStatsByGroup('rfi').length >= 5` (unit).

### RF-03 templates
- [ ] AC-3.1: Seed cria 4 templates com `is_custom=false` (integration).
- [ ] AC-3.2: V1 layout `name='Padrao PT4'` recebe upgrade fields_json (integration).
- [ ] AC-3.3: V1 layout customizado (`is_custom=true`) NAO sobrescrito (integration).

### RF-04 customizer
- [ ] AC-4.1: Search "vpip" filtra para 1 stat (e2e RTL).
- [ ] AC-4.2: Render 200 stats <500ms (perf bench).
- [ ] AC-4.3: Drag stat de grupo A pra B persiste apos save (integration).
- [ ] AC-4.4: Virtual scroll ativo quando >50 stats (e2e snapshot DOM count).

### RF-05 editor
- [ ] AC-5.1: Auto-save 1s apos blur dispara PUT (integration).
- [ ] AC-5.2: Paste tab-separated "VPIP\t22.5\nPFR\t18.0" preenche 2 inputs (e2e).
- [ ] AC-5.3: Paste com label desconhecido emite toast warning (e2e).
- [ ] AC-5.4: Stat nao preenchida vira `value=null` no payload (integration).

### RF-06 comparator
- [ ] AC-6.1: VPIP delta+5 com `direction='context'` renderiza orange (unit RTL).
- [ ] AC-6.2: Fold to 3Bet delta+5 com `direction='lower_better'` renderiza red (unit RTL).
- [ ] AC-6.3: 3Bet delta+5 com `direction='higher_better'` renderiza green (unit RTL).
- [ ] AC-6.4: `value=null` renderiza gray + tooltip "Nao registrado" (unit RTL).

### RF-07 coach tool
- [ ] AC-7.1: Tool retorna `groups` array com 16 entries (integration).
- [ ] AC-7.2: `summary.biggestLeak` calculado pelo `Math.abs(delta)` max (unit).
- [ ] AC-7.3: Stats com `value=null` nao entram em `totalOffTarget` (unit).

### RF-08 wizard
- [ ] AC-8.1: Modal abre quando `layouts.length === 0` (e2e).
- [ ] AC-8.2: Card mttDefault tem ring-2 + badge "Recomendado" (unit RTL).
- [ ] AC-8.3: Click no card NAO submete — exige botao "Confirmar" (e2e — lesson #11).
- [ ] AC-8.4: Skip button fecha modal sem seedar (e2e).

### RF-09 backfill
- [ ] AC-9.1: Layouts antigos `Padrao PT4` viram `is_custom=false` (integration).
- [ ] AC-9.2: Layouts custom (criados via V1 customizer) viram `is_custom=true` (integration).
- [ ] AC-9.3: Snapshots V1 nao alterados (integration).

### RF-10 zod
- [ ] AC-10.1: PUT `/api/hud-layouts/:id` com `direction='invalid'` retorna 400 (integration).
- [ ] AC-10.2: PUT com `id='Has Spaces'` retorna 400 (integration).

### RF-11 heatmap
- [ ] AC-11.1: 200 stats renderizados como grid quadrados (unit RTL).
- [ ] AC-11.2: Hover em stat off-target mostra tooltip com delta (e2e).
- [ ] AC-11.3: Click abre detalhe dialog (e2e).

### RF-12 trend chart
- [ ] AC-12.1: Renderiza N snapshots como LineChart (unit RTL).
- [ ] AC-12.2: Reference area `targetMin`-`targetMax` visivel (unit RTL).
- [ ] AC-12.3: Snapshot unico renderiza ponto sem erro (unit RTL).

### RF-13 export PDF
- [ ] AC-13.1: Botao "Exportar PDF" presente no comparator (unit RTL).
- [ ] AC-13.2: Click chama puppeteer OU `window.print` (mock-able) (unit).
- [ ] AC-13.3: Print CSS hide sidebar (e2e snapshot CSS).

### RF-14 customizados preservados
- [ ] AC-14.1: Layout `is_custom=true` ignora seed V2 (integration).
- [ ] AC-14.2: Edicao via customizer toggla flag para `true` (integration).

### RF-15 catalogo estatico
- [ ] AC-15.1: Catalogo importavel de `shared/hud-stat-catalog.ts` em server e client (unit).
- [ ] AC-15.2: Sem tabela `hud_stat_catalog` em migrations (grep migrations).

### RF-16 performance
- [ ] AC-16.1: Bench customizer 200 stats <500ms (vitest bench).
- [ ] AC-16.2: Bench comparator 400 stats <200ms (vitest bench).
- [ ] AC-16.3: Auto-save bench <300ms p95 (integration timing).

## Edge cases

- Stat com `value=null`: renderiza gray, exclui de `totalOffTarget`, exclui
  de Coach feedback, exclui de heatmap color (cinza neutro).
- Layout customizado V1 com 5 stats: preserva apos V2 seed (`is_custom=true`).
- Paste PT4 com formato invalido: toast erro, nao zera inputs existentes.
- Customizer 200 stats em mobile <375px: drag-drop disabled, mostra arrows
  up/down + accordion collapse-all default.
- Snapshot com `layoutId` que foi deletado: orphan visivel em historico mas
  comparator desabilitado (constraint FK ON DELETE RESTRICT).
- Trend chart com 1 snapshot: renderiza ponto isolado sem linha.
- Coach tool sem snapshots: retorna `{ groups: [], summary: { totalOffTarget: 0, biggestLeak: null } }`.

## Defaults autonomos D1-D11

| ID | Decisao | Razao |
|----|---------|-------|
| D1 | 200+ stats minimo (alvo 240) | Margem para crescimento sem refactor |
| D2 | Catalogo estatico em codigo (nao DB) | Versionavel via git, deploy = source of truth, evita drift |
| D3 | Migration 0020 reservada mas vazia se nao precisar | Coluna `is_custom` justifica migration; catalogo em si nao |
| D4 | `direction='context'` default no backfill V1 | Lado seguro — nao colore false-positive em stats nao mapeadas |
| D5 | 4 templates V2 sobrescrevem V1 (nao append) | UX simples, V1 era fraco; flag `is_custom` protege custom |
| D6 | Auto-save debounce 1s (nao 500ms) | Reduz chatter, suficiente pra UX (lesson F3 — DB lento) |
| D7 | Paste PT4 matching por `label` case-insensitive | PT4 export usa labels human-readable, nao ids |
| D8 | Export PDF defer fallback `window.print()` se >30min setup | Reduzir risco sprint; DEBT registrado |
| D9 | Heatmap usa scale RF-06 (4 cores), nao gradient | Consistencia visual com comparator |
| D10 | Trend chart N=10 snapshots default | Sweet spot UX (legivel sem cluttering) |
| D11 | Wizard mttDefault destacado MAS nao auto-submit | Lesson learned #11 — componentes nao ganham acoes default |

## Endpoints (delta vs F3)

| Method | Path | Mudanca |
|--------|------|---------|
| GET | /api/hud-stat-catalog | NOVO — retorna catalogo estatico (cache 1h) |
| GET | /api/hud-layouts | sem mudanca (response inclui `is_custom`) |
| PUT | /api/hud-layouts/:id | Zod validation reforcada (RF-10) |
| POST | /api/hud-stat-snapshots | aceita `value=null` |
| POST | /api/hud-stat-snapshots/compare | response inclui `direction` por stat |
| POST | /api/hud-stat-snapshots/import-csv | NOVO — body multipart/form-data |
| GET | /api/hud-stat-snapshots/:id/trend?statId= | NOVO — historico do stat |
| Coach tool | `read_user_hud_stats` | response shape RF-07 |

## Schema delta (migration 0020)

```sql
ALTER TABLE hud_layouts
  ADD COLUMN is_custom boolean NOT NULL DEFAULT false;

-- Backfill (idempotente)
UPDATE hud_layouts
  SET is_custom = false
  WHERE name IN ('Padrao PT4','Padrao HM3','MTT Generico','MTT Default (200 stats)','MTT/Cash Compact','Tournament Early Stage','Tournament Late Stage (push/fold)');

UPDATE hud_layouts SET is_custom = true WHERE is_custom IS NULL;
```

## Entregaveis pipeline (Fases 2-12)

| Fase | Output | Commit |
|------|--------|--------|
| F2 | ADR-058 (catalogo estatico V2) + ADR-059 (direction semantics) + diagrama | `docs(stats): V2 ADR + spec + diagrama` |
| F3 | `shared/hud-stat-catalog.ts` (200+ entries) + helpers + tests | `feat(stats): V2 F3 — catalogo HUD 200 stats` |
| F4 | Migration 0020 + schema delta + backfill RF-09 | `feat(stats): V2 F4 — schema is_custom + backfill` |
| F5 | Endpoints novos + Zod validation RF-10 | `feat(stats): V2 F5 — endpoints catalog/import-csv/trend` |
| F6 | Customizer escalavel RF-04 + virtual scroll | `feat(stats): V2 F6 — customizer search+drag+vscroll` |
| F7 | Snapshot editor refactor RF-05 (auto-save + paste + CSV) | `feat(stats): V2 F7 — auto-save + paste PT4 + import CSV` |
| F8 | Comparator direction semantics RF-06 | `feat(stats): V2 F8 — comparator direction colors` |
| F9 | Heatmap RF-11 + Trend chart RF-12 | `feat(stats): V2 F9 — heatmap + trend chart` |
| F10 | Coach tool grouped RF-07 | `feat(stats): V2 F10 — coach tool grouped + summary` |
| F11 | Wizard RF-08 + export PDF RF-13 | `feat(stats): V2 F11 — wizard + export PDF/print` |
| F12 | simplify + reviewer + perf bench + memory | `refactor(stats): V2 F12 — simplify + perf + memory` |

## Risks / debts

- **DEBT-V3-1** (catalogo estatico): sem ML adaptativo, sem populacao real do
  Grindfy. Stats targets baseados em ranges publicos PT4. Resolver V3 quando
  amostra >1k usuarios pro+.
- **DEBT-V3-2** (population benchmark estatico): targets fixos por stat, nao
  variam por buyin/format. V3 introduz benchmark dinamico por segmento.
- **DEBT-V2-1** (export PDF defer): se D8 ativa fallback `window.print()`,
  qualidade visual inferior a puppeteer. Resolver post-V2 se demanda.
- **RISK-1**: 200 stats em mobile <375px pode degradar UX mesmo com virtual
  scroll. Mitigar via accordion-collapse-all default + search prominente.
- **RISK-2**: Auto-save com 200 stats em layouts mttDefault gera payload
  >50KB. Mitigar enviando apenas `dirty` fields (delta payload).
- **RISK-3**: Paste PT4 matching case-insensitive pode ter colisoes (ex:
  "CBet" vs "Cbet"). Mitigar via normalize (trim + lower) + warning quando
  >1 match.
- **RISK-4**: Drag-drop em 200 stats vira CPU bottleneck. Mitigar via
  `@dnd-kit` virtualization helpers + `dragOverlay` lightweight.
