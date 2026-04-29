# ADR-051 — Stats Analyzer: layout JSON shape (`hud_layouts.sections`)

- Status: Accepted
- Date: 2026-04-29
- Sprint: F3 — Stats Analyzer
- Decision owner: autonomous (founder AFK; spec defaults D3/D4)

## Contexto

Sprint F3 introduz aba "Stats Analyzer" em `/studies`. Usuario registra
snapshots de stats HUD (VPIP, PFR, 3Bet, etc.) extraidos do tracker (PT4,
HM3 ou outro). Fontes futuras: V2 OCR Claude Vision, V7 handhistory parser.
V1 = manual + 3 templates pre-built.

Cada usuario pode ter N **layouts** (presets de HUD com secoes e stats em
ordem customizada) e N **snapshots** (medicoes pontuais — `values: Record<key, number>`).
Layout define *quais* stats existem; snapshot guarda *valores* por `key`.

Necessario decidir como persistir:
1. Layout em tabela relacional rigida (1 row por stat, joins por secao) **ou**
   JSON denormalizado (`sections: jsonb`) — **(escolhido)**.
2. Snapshot values em colunas tipadas (1 col por stat) **ou** `values: jsonb`
   (`Record<key, number | null>`) — **(escolhido)**.

## Decisao

### Layout shape

```ts
interface HudLayout {
  id: string;            // nanoid
  userId: string;        // userPlatformId (USER-XXXX)
  name: string;          // "Padrao PT4", "Custom MTT", etc.
  isDefault: boolean;    // 1 default por user (constraint aplicado server-side)
  sections: Section[];   // jsonb
  createdAt: Date;
  updatedAt: Date;
}

interface Section {
  label: string;         // "Pre-flop", "Flop", etc.
  stats: StatField[];
  sortOrder: number;     // ordering crescente
}

interface StatField {
  key: string;           // "vpip" — slug snake_case (ID estavel)
  label: string;         // "VPIP" — display
  decimals: number;      // default 1
  suffix?: string;       // "%" default vazio
  min?: number;          // default 0
  max?: number;          // default 100
  group?: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'agg' | 'other';
}
```

### Snapshot shape

```ts
interface HudStatSnapshot {
  id: string;
  userId: string;
  layoutId: string;
  capturedAt: Date;
  source: 'manual' | 'ocr-v2' | 'handhistory';
  values: Record<string, number | null>;  // {vpip: 22.5, pfr: 18.0}
  sampleSize?: number;     // hands jogadas (opcional)
  sessionId?: string;      // FK opcional grind_sessions
  notes?: string;
}
```

## Razoes

### JSON `sections` em vez de tabelas relacionais

- **Forma fluida.** StatField evolui (suffix, min/max, group, decimals) sem
  precisar adicionar colunas. Templates futuros podem incluir campos novos
  sem migration.
- **Layout e atomico.** Sempre lido/gravado como bloco completo (CRUD por
  layout, nao por stat individual). Joins seriam custo sem ganho.
- **Sem queries cross-stat.** Nao precisamos `WHERE stat.key = 'vpip'` —
  busca acontece no client apos load do layout.
- **Validacao Zod no boundary.** `sectionsJsonSchema = z.array(...)` enforça
  shape sem precisar foreign keys.

### `values: jsonb` em snapshot

- **Schema-on-read.** Cada layout pode ter set diferente de stats. Tabela
  com colunas tipadas exigiria 1 coluna por stat existente em qualquer
  layout — explosao + sparse rows.
- **Comparator V1 simples.** `diff(a, b) = b.values[key] - a.values[key]`
  iterando sobre layout.stats.
- **Trade-off aceito.** Sem agregacao SQL nativa em valores (ex: avg VPIP
  todos os snapshots) — no V1 nao precisamos. V2/V3 pode introduzir tabela
  derivada (`hud_stat_observations` com 1 row por stat) se necessario.

### `key` snake_case ID estavel

- Serve como `id` do StatField dentro do layout.
- Snapshot referencia stats pelo `key` — renomear `label` ("VPIP" → "VPIP%")
  nao quebra historico.

### `isDefault` boolean (em vez de FK)

- 1 layout default por usuario. Implementado server-side via transaction:
  ao marcar `isDefault=true`, primeiro `UPDATE ... SET is_default=false WHERE
  user_id = ? AND id != ?`. Mais simples que FK em users.

## Alternativas consideradas

1. **Tabelas separadas** (`hud_layouts` + `hud_layout_sections` + `hud_layout_stats`):
   3 joins por load. Snapshot ainda precisa `jsonb` para `values`. Sem ganho
   real para feature read-heavy.
2. **Colunas tipadas em snapshot** (`vpip numeric, pfr numeric, ...`):
   ~30 stats x 3 templates = 90 colunas, maioria sparse. Cada nova stat =
   migration. Inviavel.

## Consequencias

- Migration `0013_stats_analyzer.sql` cria 2 tabelas: `hud_layouts`, `hud_stat_snapshots`.
- Index `idx_hud_layouts_user` (`user_id`), `idx_hud_layouts_user_default`
  parcial (`user_id WHERE is_default = TRUE`).
- Index `idx_hud_snapshots_user_layout` (`user_id, layout_id, captured_at DESC`).
- Validacao Zod em insert via `hudLayoutSectionsZodSchema` (rejeita shape
  invalido antes do INSERT).
- `key` slug duplicado entre stats no mesmo layout = erro 400 (validacao
  client-side antes de save + server-side no Zod refinement).
- Comparator opera so em `values[key]` que existe em **ambos** snapshots
  comparados — keys orfas (stat removida do layout entre captures) sao
  exibidas com placeholder "—".
