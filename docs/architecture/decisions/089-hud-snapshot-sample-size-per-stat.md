# ADR-058 — Sample size por stat em hud_stat_snapshots.values

- Status: Accepted
- Date: 2026-04-29
- Sprint: F4
- Decision owner: autonomous (founder revisa post-pipeline)

## Contexto

F3 modelou `hud_stat_snapshots.values` como `Record<string, number | null>`
e `sampleSize` global (1 numero por snapshot). Print founder revelou que
**cada stat tem sample size proprio** (subscritos `_2`, `_10`, `_14` ao
lado do hero value).

Por que importa: VPIP em 5000 maos = sinal robusto. "XR + bet + bet river" em
2 maos = ruido puro. Coach precisa ponderar:
- Sample size alto → afirma com confianca.
- Sample size baixo → marca como `low confidence`, omite ou flag.

Sem sample size por stat, Coach trata "VPIP=22 (n=5000)" igual a
"XR-bet-bet=99 (n=2)" — quebra credibilidade.

## Decisao

**Snapshot.values aceita 3 formatos (back-compat gradual):**

```ts
type SnapshotValueEntry =
  | number              // V1 — back-compat, sampleSize implicito = global
  | null                // ausencia explicita
  | {                   // V2 — novo
      value: number | null;
      sampleSize: number | null;
    };

values: Record<string, SnapshotValueEntry>;
```

### Storage normalizer (`normalizeSnapshotValues`)

Ao ler snapshot do DB, transforma para shape canonico:

```ts
{
  vpip: { value: 22.5, sampleSize: 5000 },
  pfr:  { value: 18.0, sampleSize: 5000 },     // V1: number puro vira { value, sampleSize: null }
  rare: { value: 99,   sampleSize: 2 },
}
```

### Coach tool deweighting

`read_user_hud_stats` aplica regra:

- `sampleSize >= 100` → `confidence: 'high'`
- `30 <= sampleSize < 100` → `confidence: 'medium'`
- `sampleSize < 30` ou null → `confidence: 'low'`
- Se `confidence === 'low'` → ainda retorna o valor mas adiciona flag
  `lowConfidence: true` no benchmark.

Coach instruido via system prompt: "stats com lowConfidence devem ser
mencionadas com ressalva ou omitidas se sample size < 10."

### Average computation

`buildHudStatsPayload.deltaVsAverage` usa weighted average:
`avg = Σ(value_i * sampleSize_i) / Σ(sampleSize_i)` quando todos tem sampleSize.
Senao usa average simples (back-compat).

## Razoes

### Per-stat vs global

- Print founder = source-of-truth: HUDs profissionais reportam per-stat.
- Tracker exports (PT4/HM3) tem sample size per-stat nativamente.
- OCR V2 precisa per-stat (subscritos detectados).

### 3 formatos coexistem

- Snapshots V1 ja salvos: continuam validos sem migration.
- Manual editor pode poupar usuario de digitar n por stat — global continua opcao.
- OCR V2 grava per-stat sempre.

### Threshold 30/100

- Convencao estatistica: n=30 e ponto de corte para CLT (Central Limit Theorem) razoavel.
- n=100 e standard tracker (PT4 default flag).
- Founder pode ajustar via const `HUD_SAMPLE_SIZE_THRESHOLDS`.

### Weighted average

- Stat com 5000 maos pesa mais que stat com 50 maos no historico.
- Sem peso, snapshot recente raro distorce media.

## Alternativas

1. **Migration full:** quebraria snapshots V1.
2. **Apenas global:** ignora realidade do tracker — UX ruim quando n=2 vira "VPIP 99%".
3. **Sample size em tabela separada:** join custoso pra hot path Coach tool.

## Consequencias

- `hud_stat_snapshots.values` (jsonb) sem migration — Zod schema aceita 3 formatos.
- Helper `normalizeSnapshotValues` centraliza conversao.
- Coach tool output ganha `confidence` + `lowConfidence` por stat.
- UI editor: campo `sampleSize` opcional per-stat ao lado do value input.
- UI list: badge "stats: 12 (avg n=850)" quando per-stat presente.
- Tests integration: `tests/integration/stats-analyzer-sample-size.test.ts`.
