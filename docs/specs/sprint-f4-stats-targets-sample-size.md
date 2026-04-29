# Sprint F4 — Stats Analyzer Targets + Sample Size + Sub-secoes

- Status: Spec aprovado founder (autonomo, founder revisa post-pipeline)
- Data: 2026-04-29
- Branch: `feature/stats-analyzer-f4` (from `feature/stats-analyzer`)
- Modulo: Studies / Stats Analyzer
- Source: `Docs/research/hud-popup-catalog-2026-04-29.md` + `Docs/research/hud-v2-strategy-2026-04-29.md`
- Pre-requisito: F3 schema (hud_layouts + hud_stat_snapshots)

## Visao geral

F3 entregou MVP Stats Analyzer (3 templates, ~30 stats max). Founder mandou
print HUD profissional 6-max (140 stats em 13 secoes hierarquicas) com 3
features faltantes:

1. **Target como range** (ex: VPIP target 28-30) — strategy GTO recomendada,
   separada do range de validacao input.
2. **Sample size por stat** (ex: VPIP 22% em 5000 maos vs XR-bet-bet 99% em 2 maos)
   — confianca varia drasticamente por linha.
3. **Hierarquia 2 niveis** (secao > sub-secao, ex: "BB Defense > river > XR + bet + bet").

F4 = refactor schema + UI + Coach tool. Sem novos templates (F5).

## Objetivos

1. `StatField` separa `inputMin/inputMax` (validacao) de `targetMin/targetMax` (recomendacao).
2. Tabela `hud_stat_targets` global (knowledge base GTO por formato + stake bucket).
3. `StatField.targetRef` aponta pra knowledge base; `targetMin/targetMax` inline override.
4. `hud_stat_snapshots.values` aceita formato novo `{ value, sampleSize }` por stat.
5. Sub-secoes via `StatField.subGroup` (string opcional).
6. Coach tool `read_user_hud_stats` deweighta stats com `sampleSize < 30` + retorna target.
7. UI: editor mostra target inline, comparator mostra delta vs target, list mostra sample size.
8. **Backward compat:** snapshots V1 (Record<key, number>) + StatField sem target continuam validos.

## Requisitos funcionais

### RF-01 — `hud_stat_targets` table (global)

- Nova tabela `hud_stat_targets`:
  - `id varchar PK` (nanoid)
  - `statKey varchar NOT NULL` (ex: `vpip`)
  - `format varchar NOT NULL` (`mtt-6max` | `cash-6max` | `mtt-9max` | `mtt-hu`)
  - `stakeBucket varchar NOT NULL` (`micro` | `low` | `mid` | `high`)
  - `targetMin numeric NOT NULL`
  - `targetMax numeric NOT NULL`
  - `source varchar NOT NULL` (`founder` | `gto-wizard` | `community`)
  - `version integer DEFAULT 1`
  - `createdAt`, `updatedAt`
- UNIQUE (`statKey`, `format`, `stakeBucket`, `version`).
- INDEX (`statKey`, `format`, `stakeBucket`).
- Seed inicial: top 30 stats Tier S+A do print founder, format=`mtt-6max`, stakeBucket=`mid`, source=`founder`.

### RF-02 — StatField refactor

```ts
interface StatField {
  key: string;
  label: string;
  decimals: number;
  suffix?: string;

  // VALIDATION (renomeado de min/max — back-compat: aceita ambos)
  inputMin?: number;     // default 0
  inputMax?: number;     // default 100

  // TARGET (NOVO — recomendacao GTO)
  targetMin?: number;    // override inline
  targetMax?: number;    // override inline
  targetRef?: string;    // FK pra hud_stat_targets (formato `{format}/{stakeBucket}`)

  // HIERARQUIA (NOVO)
  group?: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'agg' | 'other';
  subGroup?: string;     // ex: "limped pots", "raised pots", "river"
}
```

- **Back-compat:** `min/max` legado mapeia automaticamente para `inputMin/inputMax`.
- **Resolucao target:** `targetMin/targetMax` inline tem precedencia. Se ausente,
  busca via `targetRef`. Se ausente, sem target (UI mostra "—").

### RF-03 — Snapshot.values com sample size

```ts
// ANTES (V1 — continua aceito):
values: Record<string, number | null>

// DEPOIS (V2 — novo):
values: Record<string, number | null | { value: number | null; sampleSize: number | null }>
```

Storage normaliza ao salvar:
- Numero puro → `{ value: n, sampleSize: null }`
- Objeto novo → preservado
- Null → preservado

Coach tool **deweighta** stats com `sampleSize < 30` (ou null) — retorna `confidence: 'low'` no benchmark output.

### RF-04 — UI editor mostra target

- `StatsSnapshotEditor`: ao lado do label de cada stat, mostra `target: 28-30` (cinza, pequeno).
- Cor input value: verde se in_range vs target, vermelho se out, cinza se sem target.
- Campo `sampleSize` por stat (input numerico opcional, font menor).

### RF-05 — Comparator mostra delta vs target

- Coluna nova "Target" no comparator
- Coluna delta atual permanece (delta entre snapshots A e B)
- Nova coluna "vs Target": status `below_range` | `in_range` | `above_range` para snapshot B
- Cor: vermelho (below), verde (in), amarelo (above)

### RF-06 — List mostra sample size

- `StatsSnapshotList`: badge "n=1500" quando sample size global, ou "stats: 12 (avg n=850)" quando por stat.

### RF-07 — Coach tool deweighting + targets

- `read_user_hud_stats` data ganha:
  - `confidence: 'high' | 'medium' | 'low'` por stat (baseado em sampleSize)
  - `target: { min, max, source }` por stat (do layout ou knowledge base)
  - `vsTarget: 'below_range' | 'in_range' | 'above_range' | null`
- Audit log inclui sampleSize medio do snapshot retornado.

### RF-08 — Sub-secoes na UI

- Editor + Comparator + Customizer respeitam `subGroup`:
  - Render hierarquico: `Section > SubGroup > Stats`
  - Stats sem subGroup viram diretas embaixo de Section (back-compat F3)
- Customizer permite editar `subGroup` via dropdown (sugestoes: limped/raised/iso/preflop/flop/turn/river).

## Requisitos nao-funcionais

### RNF-01 — Migracao gradual

- Lesson learned #7: Zod `optional + default` + back-fill no storage.
- Snapshots V1 com `Record<key, number>` continuam validos.
- StatField legado com `min/max` continua valido.
- Zero breaking change UI.

### RNF-02 — Performance

- `hud_stat_targets` lookup deve ser O(1) — cache em memoria server-side (TTL 1h).
- Reads <50ms p99.

### RNF-03 — Testabilidade

- Pure helper `resolveTarget(field, knowledgeBase)` separado.
- Pure helper `normalizeSnapshotValues(rawValues)` separado.
- Pure helper `classifyVsTarget(value, targetMin, targetMax)` separado.

## Endpoints

| Method | Path | Descricao |
|--------|------|-----------|
| GET | /api/hud-stat-targets?format=mtt-6max&stakeBucket=mid | Lista targets do knowledge base |
| GET | /api/hud-stat-targets/:statKey?format=&stakeBucket= | Target especifico |

POST/PUT/DELETE de targets sao **admin-only** (out of scope F4 — founder atualiza via SQL ou seed).

## Schema migration (`migrations/0014_stats_analyzer_targets.sql`)

```sql
CREATE TABLE hud_stat_targets (
  id varchar PRIMARY KEY,
  stat_key varchar NOT NULL,
  format varchar NOT NULL,
  stake_bucket varchar NOT NULL,
  target_min numeric NOT NULL,
  target_max numeric NOT NULL,
  source varchar NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX uq_hud_stat_targets
  ON hud_stat_targets (stat_key, format, stake_bucket, version);

CREATE INDEX idx_hud_stat_targets_lookup
  ON hud_stat_targets (stat_key, format, stake_bucket);

-- Seed top 30 stats Tier S+A: SQL inserts gerados via seed script.
```

`hud_layouts.sections` (jsonb) NAO precisa migration — Zod schema aceita campos novos opcionais.

`hud_stat_snapshots.values` (jsonb) NAO precisa migration — formato novo coexiste com legado via normalizer.

## Wave plan

| Wave | Output | Commit |
|------|--------|--------|
| W0 | ADR-053 (target separation) + ADR-054 (sample size per stat) + spec + diagrama | docs |
| W1 | schema migration 0014 + Zod refactor + storage methods + tests | feat W1 |
| W2 | UI editor com target + sample size por stat + tests | feat W2 |
| W3 | Comparator + List atualizados + Customizer com subGroup + tests | feat W3 |
| W4 | Coach tool deweighting + target resolution + seed script + tests | feat W4 |
| W5 | E2E test + simplify + reviewer + memory + push | refactor W5 |

## Decisoes autonomas (founder revisa)

| ID | Decisao | Razao |
|----|---------|-------|
| DA-1 | `inputMin/inputMax` (rename de min/max) com back-compat aceitando ambos | Clareza semantica vs continuidade tests legados F3 |
| DA-2 | Sample size shape `{ value, sampleSize }` opcional — number puro continua valido | Lesson #7 deprecation gradual |
| DA-3 | Threshold deweighting = `sampleSize < 30` | Convencao estatistica conservadora; founder pode ajustar via const |
| DA-4 | Knowledge base seed: format=`mtt-6max`, stakeBucket=`mid`, source=`founder` | Print founder e MTT mid-stakes; founder atualiza outros buckets depois |
| DA-5 | Endpoints POST/PUT targets sao admin-only (out of scope F4) | Founder atualiza via SQL/seed; UI admin = F8+ |
| DA-6 | `subGroup` = string livre (nao enum) | Nomes variam por secao (limped/raised/iso/etc); enum vira manutencao constante |

## Riscos / debt

- **DEBT-1:** seed inicial cobre so top 30 stats. Demais 110 stats do print sem target ate F5+.
- **DEBT-2:** stake bucket auto-detection (founder seleciona manual hoje). V2 = inferir do bankroll/ABI.
- **DEBT-3:** target version pinning sem UI — founder edita SQL pra atualizar metas. F8 traz painel admin.
- **DEBT-4:** Coach tool ainda nao recebe `format/stakeBucket` do user profile — assume `mtt-6max/mid`. Adicionar coluna em users settings em F5.

## Acoes founder pre-deploy

1. `db:push migration 0014_stats_analyzer_targets.sql`
2. Run seed: `npm run seed:hud-targets` (cria 30 rows knowledge base)
3. Sem npm install
