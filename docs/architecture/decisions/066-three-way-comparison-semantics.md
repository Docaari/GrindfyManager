# ADR-066 — 3-Way Comparison Semantics (target | snap1 | snap2 | delta)

- Status: Accepted
- Date: 2026-05-01
- Sprint: Stats-V3 / F2 (precede F10/F11 — comparator + endpoint compare)
- Decision owner: autonomous (founder AFK; spec defaults Stats-V3 RF-13..RF-16)
- Related: ADR-058 (V2 catalogo estatico), ADR-062 (V2 grouped tool response),
  ADR-063 (direction semantics), ADR-064 (V3 grouped layout rendering)

## Context

V2 entregou comparator de snapshots no formato simples `target | hero`,
exibindo apenas o snapshot ATUAL contra o range alvo. Funciona para
diagnostico estatico ("estou off-target em VPIP?"), mas falha em responder
a pergunta mais importante para o pro player:

> "Estou MELHORANDO ao longo do tempo?"

Sem comparar dois snapshots, o jogador nao consegue:
- Ver progresso de uma area de leak especifica (ex: Fold-vs-3bet caiu de
  60% para 50% em 2 semanas — improving).
- Detectar regressoes silenciosas (ex: VPIP aumentou de 22% para 28% apos
  introduzir LAG style — pode ser intencional ou tilt).
- Comparar pre/pos-coaching session ("este mes melhorei C-Bet IP?").

V3 RF-13..RF-16 introduz **3-way comparison**: dois snapshots simultaneos
(`snap1` mais antigo, `snap2` mais recente) + range alvo, com delta
calculado entre os snapshots e cor-coding semantico baseado em
`direction` (ADR-063).

Esse padrao eh estado-da-arte em GTO Wizard Reports e PT4 vs Villain stat
packs (research secao 1). Aplicavel direto a Grindfy sem inventar
convencoes novas.

Tres alternativas foram avaliadas:

1. **Sparkline N-way** (chart de tendencia mostrando 5+ snapshots).
   Rejeitado para V3: complexidade UX (escolher window de tempo, lidar com
   gaps, layout 217 stats x sparkline = pesado). Defer V4 trend chart.
2. **Filter-based diff** (mostrar so stats que mudaram). Rejeitado:
   esconde magnitude — user nao ve "VPIP nao mudou" como info valiosa
   ("mantive disciplina").
3. **Client-side compute do delta** (frontend recebe 2 snapshots +
   layout, calcula delta + status). Rejeitado: drift de logica entre 16
   grupos x 217 stats, dependencia de catalogo client (ADR-058 server eh
   fonte de verdade), perde cache do compute.

A decisao escolhida e **endpoint server-side agregado** com layout 4-col
por cell (`target | snap1 | snap2 | delta`), cor-coding 4-estado e trend
indicator com threshold por unit.

## Decision

### Layout 4-coluna por stat row

Em modo `comparisonMode === 'three_way'`, cada row ganha colunas extras:

```
┌─────────────────────────────────────────────────────────┐
│ 🟢 BASICOS                                   [12 stats]  │
├─────────────────────────────────────────────────────────┤
│ Stat label    target   snap1     snap2     delta  trend │
│ VPIP          20-25%   22%       24%       +2%    →     │
│ PFR           16-22%   18%       19%       +1%    →     │
│ 3Bet PF       6-10%    7%        9%        +2%    ↑     │
│ Fold vs 3bet  45-55%   50%       60%       +10%   ↓↓    │  red
│ ...                                                      │
└─────────────────────────────────────────────────────────┘
```

UI labels: **Antes / Agora / Target** (PT-BR; mapeia a `snap1 | snap2 | target`).
Padrao GTO Wizard Reports: snap1 sempre = mais antigo, snap2 sempre =
mais recente. Order enforced server-side (endpoint compare reordena
automaticamente por `captured_at asc` dos dois IDs).

### Calculo do delta

```
delta = snap2_value - snap1_value
```

Sinal e magnitude usados em cor + trend. **Direction** afeta interpretacao
(boa/ruim), nao calculo (ADR-063).

### Status semantico (cor de cell)

Cada cell tem `status` calculado server-side com 4 valores:

| Status | Condicao | Cor cell | Significado |
|---|---|---|---|
| `both_in_target` | snap1 in `[min,max]` && snap2 in `[min,max]` | **verde** (`text-emerald-400`) | Excelente — manteve disciplina |
| `improving` | snap1 fora `[min,max]` && snap2 in `[min,max]` | **laranja** (`text-orange-400`) | Progresso — saiu do range pior |
| `regressing` | snap1 in `[min,max]` && snap2 fora `[min,max]` | **vermelho** (`text-red-400`) | Regressao — caiu fora do range |
| `both_out_target` | ambos fora `[min,max]` | **cinza** (`text-slate-500`) | Sem mudanca — leak persistente |

**Especiais:**
- `direction === 'context'`: status sempre **cinza** (Coach interpreta —
  ADR-063). Ranges sao indicativos, nao prescritivos.
- `direction === 'neutral'`: status sempre **cinza** (sample_size, AF,
  hands_played).
- `value === null` em snap1 OR snap2: cell exibe `—` cinza, delta `null`.

**Direction-aware status (RF-14)**:

Para `higher_better` e `lower_better`, o "out of target" tem semantica:
- `higher_better` + snap2 acima de `[min, max]`: ainda eh **bom** mesmo
  fora (ex: WWSF 50% target 40-45%, hero 50% = otimo). Status:
  `both_in_target` (efetivamente — extra-bom).
- `lower_better` + snap2 abaixo de `[min, max]`: ainda eh **bom** mesmo
  fora (ex: Fold-vs-3bet 30% target 45-55%, hero 30% = otimo). Status:
  `both_in_target`.

Implementacao server-side considera `direction` ao classificar
"on-target":

```ts
function isOnTarget(value: number, target: TargetRange, direction: Direction): boolean {
  if (value === null) return false;
  if (direction === 'higher_better') return value >= target.min;     // overflow OK
  if (direction === 'lower_better')  return value <= target.max;     // underflow OK
  // context | neutral: strict range
  return value >= target.min && value <= target.max;
}
```

### Trend indicator (RF-15)

Coluna `delta` mostra **icone unicode**:

| `|delta|` em pct | Icone | Significado |
|---|---|---|
| < 1% | `→` | Estavel |
| 1% ≤ x < 5% | `↑` ou `↓` | Mudanca moderada |
| ≥ 5% | `↑↑` ou `↓↓` | Mudanca grande |

**Direction-aware** (cor da seta):
- `higher_better`:
  - delta > 0 → seta `↑` **verde** (good)
  - delta < 0 → seta `↓` **vermelho** (leak)
- `lower_better`:
  - delta > 0 → seta `↓` **vermelho** (leak — invertido visual)
  - delta < 0 → seta `↑` **verde** (good — invertido visual)
- `context` / `neutral`:
  - sempre `→` cinza (Coach interpreta delta).

**Threshold por unit** (D10):

| Unit | Estavel `→` | Moderado `↑/↓` | Grande `↑↑/↓↓` |
|---|---|---|---|
| `pct` | <1% | 1-5% | ≥5% |
| `bb` | <0.1 | 0.1-0.5 | ≥0.5 |
| `count` | <1 | 1-5 | ≥5 |

Faixas escolhidas via heuristica de poker:
- VPIP +5% = mudanca grande (estilo TAG → LAG).
- BB/100 +0.5 = winrate variation grande.
- Sample +5 maos = ruido (irrelevante); +500 = informativo.

### Tooltip on hover (RF-15)

Cell `delta` exibe tooltip com info estruturada:

```
VPIP / +2.0% em 14 dias
snap1: 2026-04-17 (Manual)
snap2: 2026-05-01 (OCR)
Direction: context — interpretacao depende de estilo
```

Componentes:
- Stat label.
- `delta` formatado por unit (`+2.0%`, `+0.3 bb`, `+3 hands`).
- Dias entre `snap1.capturedAt` e `snap2.capturedAt`.
- Capture method de cada snap (`(Manual)`, `(OCR)`, `(CSV)`, `(Paste)`).
- Direction string explicativa (PT-BR centralizada em
  `shared/stat-direction-tooltips.ts` ADR-063).

### Endpoint GET /api/stats-analyzer/snapshots/compare

Path: `server/routes/stats-analyzer.ts`.

Query params:
- `snap1` (string, required) — snapshot ID.
- `snap2` (string, required) — snapshot ID.
- `layoutId` (string, required) — layout ID; valida ambos snapshots
  pertencem a este layout.

Validacao:
- Ambos snapshots existem AND pertencem ao `req.user.id` (403 senao).
- Ambos referem `layoutId` (400 mismatch).
- Snapshot deletado durante request (race) → 404 graceful
  `{ message: "Snapshot nao encontrado" }`.
- `snap1 === snap2` permitido — degenerate case, delta=0, todos
  `both_in_target` ou `both_out_target` baseado em valor.

Reorder automatico:
- Server reordena `snap1, snap2` por `captured_at asc` antes de calcular
  (snap1 sempre mais antigo independente do query param order).

Response shape (RF-16):

```json
{
  "layoutId": "layout_abc",
  "snap1": {
    "id": "snap_old",
    "capturedAt": "2026-04-17T10:00:00Z",
    "captureMethod": "manual",
    "sampleSize": 5400
  },
  "snap2": {
    "id": "snap_new",
    "capturedAt": "2026-05-01T10:00:00Z",
    "captureMethod": "ocr",
    "sampleSize": 7200
  },
  "groups": [
    {
      "id": "basics",
      "name": "Basicos",
      "stats": [
        {
          "id": "vpip",
          "label": "VPIP",
          "target": { "min": 20, "max": 25 },
          "snap1Value": 22.0,
          "snap2Value": 24.0,
          "delta": 2.0,
          "direction": "context",
          "unit": "pct",
          "status": "both_in_target",
          "trend": "stable",
          "trendIcon": "→"
        },
        {
          "id": "fold_vs_3bet",
          "label": "Fold vs 3Bet",
          "target": { "min": 45, "max": 55 },
          "snap1Value": 50.0,
          "snap2Value": 60.0,
          "delta": 10.0,
          "direction": "lower_better",
          "unit": "pct",
          "status": "regressing",
          "trend": "big_negative",
          "trendIcon": "↓↓"
        },
        {
          "id": "wwsf",
          "label": "WWSF",
          "target": { "min": 45, "max": 50 },
          "snap1Value": null,
          "snap2Value": 48.0,
          "delta": null,
          "direction": "higher_better",
          "unit": "pct",
          "status": "snap1_null",
          "trend": "n_a",
          "trendIcon": null
        }
      ]
    }
  ],
  "summary": {
    "snap1OffTarget": 5,
    "snap2OffTarget": 3,
    "improvingCount": 2,
    "regressingCount": 1,
    "stableCount": 211
  }
}
```

Performance: 217 stats x 2 snaps = ~434 valores. Single SQL query agrega
via `JOIN hud_layouts ON layout_id` + iteracao em memoria O(N stats). p95
<300ms (RNF-01) garantido com index `(user_id, layout_id, captured_at)`.

### Status enum completo

```ts
type CompareStatus =
  | 'both_in_target'      // verde — disciplina
  | 'improving'           // laranja — saiu de fora -> dentro
  | 'regressing'          // vermelho — saiu de dentro -> fora
  | 'both_out_target'     // cinza — leak persistente
  | 'snap1_null'          // cinza — snap1 nao tem valor
  | 'snap2_null'          // cinza — snap2 nao tem valor
  | 'both_null'           // cinza — nenhum valor
  | 'context_ambiguous'   // cinza — direction context
  | 'neutral_info';       // cinza — direction neutral
```

```ts
type TrendKind =
  | 'stable'              // |delta| pequeno
  | 'small_positive'      // ↑
  | 'small_negative'      // ↓
  | 'big_positive'        // ↑↑
  | 'big_negative'        // ↓↓
  | 'n_a';                // null
```

### `summary` agregado server-side

Calculado em uma passada O(N stats):

- `snap1OffTarget`: contagem de stats com `snap1Value !== null` e
  `!isOnTarget(snap1Value, target, direction)`.
- `snap2OffTarget`: idem para snap2.
- `improvingCount`: contagem de stats com `status === 'improving'`.
- `regressingCount`: contagem de stats com `status === 'regressing'`.
- `stableCount`: total - improving - regressing - null states.

### Integracao com `HudGroupedView` (ADR-064)

Quando `comparisonMode === 'three_way'`:

1. Selector duplo (RF-13) escolhe snap1 + snap2.
2. Frontend `useQuery({ queryKey: ['compare', snap1, snap2, layoutId], queryFn: ...})`.
3. Response renderizado em `HudGroupedView` com 4 colunas extras.
4. Filter pills + presets (RF-03) aplicam-se sobre o array de
   `groups[].stats[]` retornado.
5. Inline edit (RF-05/RF-06) **desabilitado** em 3-way mode (edita qual
   snapshot? UX confuso). Botao "Voltar para single mode" reativa edits.

### Modo degraded — 0 ou 1 snapshot disponivel

- 0 snapshots: selectors disabled + CTA "Criar primeiro snapshot".
- 1 snapshot: snap1 = snap2 = unico → comparator mostra apenas hero
  column (degraded mode). Toggle 3-way fica disabled com tooltip "Crie
  segundo snapshot para comparar".

## Consequences

### Positivas

- **Pro players visualizam progresso** — improving/regressing direto no
  comparator sem ferramentas externas (PT4 reports custosos).
- **Server-side compute** — consistencia direction/status garantida; zero
  drift entre 16 grupos. Cache HTTP por (snap1, snap2, layoutId).
- **Threshold por unit** — `pct/bb/count` cada com escala apropriada.
  Sem flat threshold ruim (1% em pct vs 1 em count = abismo semantico).
- **Direction-aware** — cores e setas respeitam `higher_better /
  lower_better / context / neutral` (ADR-063). Zero falso positivo
  ("VPIP +5 verde") herdado de V1.
- **Tooltip rico** — dias entre snapshots + capture method + direction
  explicativa. User entende contexto sem clicar.
- **summary agregado** — Coach AI pode chamar tool `read_user_hud_compare`
  futuramente (DEBT-V4-7) e receber `improvingCount: 2,
  regressingCount: 1` como sinal direto.
- **Padrao mercado** — GTO Wizard Reports + PT4 stat packs usam mesma
  convencao. Adocao por jogadores experientes eh natural.

### Negativas

- **Layout horizontal denso** — 5 colunas em mobile <640px exige scroll
  horizontal OR collapse de target/trend (RF-14 mobile mode). Aceito —
  feature pro-tier, desktop-first.
- **Endpoint custo** — agg em 217 stats x 2 snapshots = ~434 cells. Cache
  HTTP mitiga (1 fetch por par snap1+snap2). Sem cache, ~50ms compute
  server. Aceitavel.
- **Inline edit desabilitado em 3-way** — UX trade-off. User precisa
  voltar single mode para editar. Toggle eh 1 click. Aceito.
- **`snap1 === snap2` degenerate** — todos delta=0, mostra `both_in_target`
  ou `both_out_target` (status nao distingue "0 mudanca" de "regressao
  pequena"). Mitigado por: trend `→` + tooltip explicativo.
- **Reorder automatico nao-obvio** — user passa `snap1=novo, snap2=antigo`,
  servidor reordena. Documentar em response: campo `snap1` reflete
  reordenacao final. Frontend exibe `Antes / Agora` sempre cronologico.

### Neutras

- **Tests integration** AC-16.1..16.4 cobrem valid case, auth 403, layout
  mismatch, snapshot deletado race condition.
- **Tests unit** AC-14.1..14.4 + AC-15.1..15.4 cobrem matrix de 9 status
  x 5 trend kinds. Determinista.
- **Docs API** novo endpoint em `Docs/api/stats-analyzer-compare.md` com
  request/response example.
- **Storybook (futuro)** mostrara 4 estados visuais: improving (laranja),
  regressing (vermelho), both_in_target (verde), both_out_target (cinza).
- **Snapshot deletado durante render** — frontend toast "Snapshot
  indisponivel — selecione outro" + reseta selector para snapshot
  default.

## Alternativas rejeitadas

### A1 — Sparkline N-way (5+ snapshots)

Chart trend showing evolution over multiple snapshots. Rejeitado para V3:
- Complexidade UX: escolher window (last 7d? last 30d? all?), lidar com
  gaps de tempo, density chart 217 stats = sobrecarga visual.
- Layout pesado: chart por stat = render lento; chart agregado por grupo
  perde detalhamento.
- Defer V4 (DEBT-V4-6): trend chart como pagina dedicada, nao in-line.

### A2 — Filter-based diff (mostrar so stats que mudaram)

Filtrar tabela para `|delta| > threshold`. Rejeitado:
- Esconde info valiosa: "VPIP nao mudou" eh sinal de disciplina (good).
- Threshold arbitrario gera falsos negativos.
- User pode aplicar como **preset** RF-03 ("changes only") sobre layout
  3-way completo — opt-in, nao default.

### A3 — Client-side compute do delta

Frontend recebe `snap1Values, snap2Values, layout` e computa delta +
status local. Rejeitado:
- Drift entre 16 grupos x 217 stats: bug em direction handling cliente
  vs server diverge silenciosamente.
- Catalogo client (legacy): V3 reforca server eh fonte de verdade
  (ADR-058) — incluindo logica de status.
- Perde cache HTTP por (snap1, snap2, layoutId) — TanStack Query cache
  funciona melhor com response server-computed.
- Coach tool reuso (`read_user_hud_compare` DEBT-V4-7): server-side agg
  fica pronto para reusar. Client compute = duplicar logica em tool
  handler.

### A4 — N-way comparison (3+ snapshots simultaneos)

Comparar 3 ou 4 snapshots side-by-side. Rejeitado para V3:
- Layout 6+ colunas inviavel mobile e desktop densidade alta.
- UX confuso: qual eh "delta" entre 3 snapshots?
- 3-way (snap1, snap2, target) cobre 90% dos casos uteis. Defer V5
  (DEBT-V5-1) com sparkline ou waterfall view.

## Confianca

**Alta.** Padrao GTO Wizard / PT4 valida convencao em mercado. Threshold
por unit eh heuristica testada (research secao 1). Status enum + trend
enum sao determinstas, testaveis com fixture exhaustiva. Endpoint
server-side eh CRUD trivial sobre snapshots existentes — zero risco de
infra. Reversivel: feature flag `statsThreeWayEnabled` desliga toggle UI;
single mode V2 continua intocado.

## Referencias

- **Spec:** `docs/specs/sprint-stats-v3.md` (RF-13..RF-16, defaults
  D9-D11).
- **Research:** `docs/strategy/stats-v3-research.md` (secao 1: GTO Wizard
  + PT4 stat packs como referencias).
- **ADR-058:** catalogo estatico V2 — fonte de verdade preservada.
- **ADR-062:** grouped tool response — shape reuso para coach
  `read_user_hud_compare` (DEBT-V4-7).
- **ADR-063:** direction semantics — base de status + cor + trend.
- **ADR-064:** grouped layout rendering — host do layout 4-col.
- **Diagramas Mermaid:**
  - `docs/architecture/flows/studies/stats-v3-grouped-layout-flow.mermaid` —
    flowchart do render pipeline incluindo compare mode.
  - `docs/architecture/flows/studies/stats-v3-ocr-cache-er.mermaid` — ER
    diagram com colunas novas em `hud_stat_snapshots`.
- **Codigo precedente:** `server/services/snapshotComparator.ts` (V2) —
  V3 estende com `compareThreeWay()` mantendo single comparator V2.
- **Out of scope V3:** sparkline N-way (DEBT-V4-6), Coach tool
  read_user_hud_compare (DEBT-V4-7), waterfall multi-snapshot view
  (DEBT-V5-1), client-side compute fallback (rejeitado A3).
