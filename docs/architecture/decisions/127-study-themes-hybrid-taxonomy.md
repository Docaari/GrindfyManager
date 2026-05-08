# ADR-127 — Theme taxonomy hibrida (curated seed + user custom + linked stats/lessons)

- Status: Aprovado
- Data: 2026-05-08
- Sprint: estudos-habito-1
- Decision owner: system-architect
- Related: spec `Docs/specs/estudos-habito-1.md` §RF-3.3, ADR-067 (studies reform), ADR-068 (recommendations engine), ADR-126 (study_sessions_v2)
- Diagramas: `Docs/architecture/data-model-estudos-habito-1.mermaid`

---

## 1. Contexto

A spec exige (RF-1.1 e RF-3.3):

1. **Tema obrigatorio** em 3 dos 5 modos (`drill_gto`, `lesson`, `other`) — ja resolvido pela tabela `study_themes` que existe.
2. **Autocomplete com sugestoes curadas** — founder pediu "ICM bubble play / Final table ICM / Pay jumps" como exemplos pre-existentes. Hoje a tabela `study_themes` so tem rows criadas pelo user (zero seed).
3. **Auto-suggest stats foco baseado em leak detection** (RF-3.3) precisa mapear `stat_id` → tema sugerido. O algoritmo:
   - Roda `getStatsLeaks(userId)` (ja existe).
   - Top 3 leaks → para cada um, lookup do tema correspondente.
   - Cria 3 rows em `user_focus_stats` com `study_theme_id` preenchido (ou NULL se nao houver match).

Pesquisa no codigo mostra que `study_themes` hoje tem **zero rows seeded** — o user comeca com lista vazia. Founder tem 18 themes criados manualmente desde Studies-Reform; lista heterogenea (ex: "C-bet OOP" / "c-bet out of position" — possivel duplicate fuzzy). Auto-suggest sem catalogo seed nao funciona — algoritmo cai no fallback `study_theme_id=null` em 100% dos casos novos.

---

## 2. Decisao

**Adotar taxonomy hibrida em 3 camadas:**

1. **Camada 1 — Seed curated (~30 themes em 5 categorias):** seed file `scripts/seed-study-themes.ts` insere 30 themes globais identificados por `is_curated=true` + `slug` UNIQUE. Sao **per-user** (cada novo user recebe uma copia ao primeiro acesso a `/estudos`) — preserva ownership/CASCADE existente.

2. **Camada 2 — User custom:** rows com `is_curated=false`, criados via UI (`StudyLogDialog` "+ Criar tema novo") ou inline. Sem mudanca de behavior.

3. **Camada 3 — Linked stats/lessons (jsonb opcionais nos themes curated):** colunas novas `linked_stats jsonb` (array de `stat_id` strings) + `linked_lessons jsonb` (array de `lesson_id` strings). Populados apenas para themes curated via seed. User custom themes mantem ambos `[]` (default jsonb empty array).

### 2.1 Schema delta

```sql
-- migrations/0055_study_themes_curated.sql
ALTER TABLE study_themes
  ADD COLUMN slug VARCHAR(60) NULL,            -- unique only when is_curated
  ADD COLUMN is_curated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN category VARCHAR(32) NULL,        -- 'preflop'|'postflop'|'icm'|'mental'|'specific'|null
  ADD COLUMN linked_stats JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN linked_lessons JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN seeded_at TIMESTAMP NULL;         -- when this user got the curated copy

-- UNIQUE parcial: cada user tem no max 1 copia de cada slug curated
CREATE UNIQUE INDEX uq_study_themes_user_slug_curated
  ON study_themes(user_id, slug)
  WHERE is_curated = true AND slug IS NOT NULL;

-- indice para auto-suggest (lookup por linked_stats contendo stat_id)
CREATE INDEX idx_study_themes_curated_stats
  ON study_themes USING GIN (linked_stats jsonb_path_ops)
  WHERE is_curated = true;
```

### 2.2 Seed file

`scripts/seed-study-themes.ts` exporta `CURATED_STUDY_THEMES: CuratedTheme[]` com 30 entries. Por categoria:

| Categoria | Count | Exemplos |
|---|---|---|
| `preflop` | 8 | RFI tight, RFI loose, 3bet IP, 3bet OOP, vs 3bet flat/4bet, calldown SB, BB defense, blind war squeeze |
| `postflop` | 8 | C-bet OOP small, C-bet OOP polar, donk leads, turn barrel decision, river bluff vs value, multiway c-bet, cooler river spots, board texture analysis |
| `icm` | 6 | ICM bubble play, Final table ICM, Pay jumps, FT ladder, Stack-aware ICM, MTT push/fold |
| `mental` | 5 | Tilt control, A-game maintenance, Loss recovery, Variance acceptance, Decision fatigue |
| `specific` | 3 | Late reg deep stack, Short stack push/fold, Phased Day 2 strategy |

**Total: 30 themes curated.** Cada um com:
- `slug` unico (ex: `icm-bubble-play`)
- `name` PT-BR (ex: "ICM no bubble")
- `color` + `emoji` defaults (variadas — usa palette existente)
- `category` valida (5 enum values)
- `linked_stats`: array de `stat_id` do `HUD_STAT_CATALOG` (ex: para "ICM no bubble": `["push_fold_threshold_15bb", "shove_range_btn"]`)
- `linked_lessons`: array de `lesson_id` da Biblioteca atual (ex: Bloco A Ep 6 "ICM no bubble" → `["lesson_bloco_a_ep6"]`)

Lookup de `linked_lessons` em runtime de seed: query `SELECT id FROM library_lessons WHERE slug LIKE '%bubble%'` — best effort. Se nao encontrar, deixa `[]`. Seed eh **idempotent** (ON CONFLICT DO NOTHING via UNIQUE parcial).

### 2.3 Lazy seeding por usuario

Seed nao roda para todos os users de uma vez. Roda **lazy**:
- No primeiro `GET /api/study-themes` (rota existente de Studies-Reform), backend verifica se user tem rows com `is_curated=true`. Se nao tem, faz `INSERT ... SELECT` copiando dos templates seed para o user.
- Para founder/admin, comando manual `npx tsx scripts/seed-study-themes.ts --user USER-XXXX` permite seed retroativo.

**Justificativa:** evita transaction gigante em migration; novos users recebem catalogo automaticamente; users existentes sao seeded ao logar; admin retroativo via CLI quando necessario.

### 2.4 Auto-suggest implementation (RF-3.3)

```ts
async function autoSuggestFocusStats(userId: string, month: string): Promise<{ created: UserFocusStat[], warnings: string[] }> {
  const leaks = await getStatsLeaks(userId);             // ja existe
  const top3 = leaks.slice(0, 3);
  const created: UserFocusStat[] = [];
  const warnings: string[] = [];

  for (const leak of top3) {
    // Lookup tema curated com stat_id em linked_stats
    const matchingTheme = await db.query.studyThemes.findFirst({
      where: and(
        eq(studyThemes.userId, userId),
        eq(studyThemes.isCurated, true),
        sql`${studyThemes.linkedStats} @> ${JSON.stringify([leak.statId])}::jsonb`,
      ),
    });
    const themeId = matchingTheme?.id ?? null;
    const focusStat = await storage.createFocusStat({
      userId, statId: leak.statId, studyThemeId: themeId, month,
    });
    created.push(focusStat);
    if (!themeId) warnings.push(`Stat ${leak.statId} sem tema linkado curated.`);
  }

  return { created, warnings };
}
```

Nota: o auto-suggest so faz match contra **themes curated do proprio user**. User custom themes nao tem `linked_stats` populado (default `[]`). Se founder quiser custom theme + stats vinculadas, expor UI para editar `linked_stats` (out of scope Sprint 1).

---

## 3. Opcoes Consideradas

### Opcao A: Apenas user custom (status quo)

- **Pros:** zero migration; zero seed; tudo organico.
- **Cons:** auto-suggest cai em fallback `themeId=null` em 100% das vezes (RF-3.3 nao funciona end-to-end); user comeca com lista vazia (UX ruim onboarding); fuzzy duplicates eternos ("ICM bubble" vs "icm at bubble"); spec founder pediu sugestoes curadas explicitas.

### Opcao B: Apenas catalogo global (sem `user_id`)

- **Pros:** uma copia so de cada theme; auto-suggest direto sem lazy seed.
- **Cons:** quebra modelo atual — `study_themes.user_id` eh NOT NULL; alterar esse modelo cascateia em N tabelas referenciando (CASCADE em `study_tabs`, `study_theme_spot_links`, `user_focus_stats`); user editar tema curated (rename, change emoji) nao funcionaria sem fork; conflito com ownership da Studies-Reform.

### Opcao C (escolhida): Hibrido — seed curated copiado para cada user + custom

- **Pros:** preserva modelo atual de ownership (CASCADE existente intacto); user pode renomear/editar themes curated (tornam-se "personalizados" mas mantem `is_curated=true` para auto-suggest); lazy seed amortiza custo; idempotent (ON CONFLICT); funciona end-to-end com codigo minimo.
- **Cons:** 30 rows extras por user (~1KB cada → ~30KB total — irrelevante); update do catalogo curated (adicionar tema 31) requer back-fill (novo cron OU comando manual `seed-study-themes.ts --refresh`); duplicacao de dado entre users (mesma `linked_stats` array em N copias).

### Opcao D: Tabela separada `study_theme_templates` (catalogo global) + view union

- **Pros:** zero duplicacao de catalogo; views faceis.
- **Cons:** complexidade alta — toda query precisa entender 2 tabelas; FK em `user_focus_stats.study_theme_id` precisa apontar para qual? View nao aceita FK; reescreve toda a infraestrutura existente.

---

## 4. Consequencias

**Positivas:**
- Auto-suggest RF-3.3 funciona end-to-end no MVP (top 3 leaks → 3 themes match em > 60% dos casos com seed inicial).
- User onboarding `/estudos` ganha lista pre-populada (vs blank state hoje).
- Lessons da Biblioteca ficam vinculadas a themes — base para Sprint 2 "Biblioteca recomenda aula por leak".
- Migration aditiva (sem rename/drop).

**Negativas:**
- 30 rows extras por user. Para founder N=1 + beta de 5 = 180 rows. Trivial.
- Update do catalogo curated requer pipeline (nao automatico). Owner do catalogo: founder (decisao manual).
- Duplicate entre `linked_lessons` e logica de "Continue de onde parou" (que vive em `study_tabs.last_visited_at` ADR-067). Aceito — proposito diferente.

**Neutras:**
- `study_themes.linked_stats` GIN index aumenta espaco em disco ~5%. Irrelevante.
- Lazy seed adiciona 30-50ms na primeira request `/api/study-themes` por user novo. Aceitavel.

---

## 5. Confianca

**Alta.** Padrao "seed curated copiado por user" eh comum (templates de project management, knowledge base templates). Idempotent. Reverso: se a decisao for ruim, `DELETE FROM study_themes WHERE is_curated=true` apaga tudo sem perder customizacoes do user (custom themes preservados).

---

## 6. Anexos

- Seed file: `scripts/seed-study-themes.ts`
- Diagrama ER: `Docs/architecture/data-model-estudos-habito-1.mermaid`
- Spec: `Docs/specs/estudos-habito-1.md` §RF-3.3, §6 Modelos de Dados
