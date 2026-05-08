# ADR-132 — Schema `study_weekly_plans` com `plan_jsonb` (vs tabela child de atividades)

- Status: Aceito
- Data: 2026-05-08
- Sprint: estudos-coach-biblio-2
- Decision owner: system-architect
- Related: spec `Docs/specs/estudos-coach-biblio-2.md` §RF-3, ADR-126 (study_sessions_v2), ADR-107 (cron pattern News-3)
- Diagramas: `Docs/architecture/data-model-estudos-coach-biblio-2.mermaid`, `feature-flow-weekly-plan.mermaid`
- Migration: `migrations/0055_study_weekly_plans.sql`

---

## 1. Contexto

RF-3 do sprint Estudos-Coach-Biblio-2 introduz **plano semanal Coach** — cron segunda 9h UTC + botao manual gera plano de 5 dias x 3-4 atividades cada (`drill_gto`, `lesson`, `hand_review`, `theory_read`, `snapshot_review`, `other`). Cada atividade tem `itemId`, `type`, `title`, `description`, `estimatedMinutes`, `ctaTarget`, `themeId?`, `lessonId?`, `handIds[]`, `reasoning`. UI checkbox marca `completed`.

Duas modelagens possiveis:

1. **JSONB embarcado**: `study_weekly_plans { plan_jsonb, completed_items_jsonb }`. 1 row por user por semana.
2. **Tabela child**: `study_weekly_plans { id, ... }` 1:N `study_weekly_plan_activities { plan_id, day_label, item_id, type, title, ... }`. Toggle de completed = UPDATE em row child.

Trade-offs sao familiares — embarcamento vs normalizacao. Mas **especifico deste caso**: o plano eh **gerado de uma vez** pelo Coach (output JSON estruturado), **nunca particionado** (UI mostra a semana inteira sempre), tem **lifetime curto** (1 semana, regenerar substitui), e queries analytics nao precisam de JOIN granular ("quantos drills GTO o user fez por semana?" eh respondido por `study_sessions_v2`, nao pelo plano).

---

## 2. Decisao

**Modelar como tabela unica `study_weekly_plans` com `plan_jsonb` array de dias (cada um com array de atividades) + `completed_items_jsonb` array de `itemId`s completos.**

### 2.1 Estrutura final

```sql
CREATE TABLE study_weekly_plans (
    id                    VARCHAR(21) PRIMARY KEY,
    user_id               VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    week_start_date       DATE NOT NULL,                      -- segunda da semana UTC
    plan_jsonb            JSONB NOT NULL,                     -- StudyWeeklyPlan shape
    completed_items_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb, -- array de itemId
    source                VARCHAR(16) NOT NULL,               -- 'coach_auto' | 'coach_manual'
    daily_target_minutes  INTEGER NOT NULL,
    cost_tokens_used      INTEGER,                            -- tracking
    generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    regenerated_at        TIMESTAMPTZ,
    regenerated_count     INTEGER NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT swp_source_enum CHECK (source IN ('coach_auto', 'coach_manual')),
    CONSTRAINT swp_target_range CHECK (daily_target_minutes >= 5 AND daily_target_minutes <= 240)
);

-- 1 plano por user por semana (idempotency cron + manual)
CREATE UNIQUE INDEX uq_swp_user_week ON study_weekly_plans (user_id, week_start_date);
-- Listagem historica
CREATE INDEX idx_swp_user_generated ON study_weekly_plans (user_id, generated_at DESC);
```

### 2.2 Shape de `plan_jsonb`

```ts
type StudyWeeklyPlan = {
  days: Array<{
    dayLabel: 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
    date: string                     // ISO YYYY-MM-DD
    activities: Array<StudyWeeklyPlanItem>
  }>
}

type StudyWeeklyPlanItem = {
  itemId: string                     // nanoid local ao plan, estavel
  type: 'drill_gto' | 'lesson' | 'hand_review' | 'theory_read' | 'snapshot_review' | 'other'
  title: string                      // max 80
  description: string                // max 200
  estimatedMinutes: number           // 5..120
  ctaTarget: string | null           // URL relativa Wouter
  themeId: string | null
  lessonId: string | null
  handIds: string[]                  // se type=hand_review
  reasoning: string                  // max 200
}
```

`completed_items_jsonb` eh array simples `string[]` de `itemId`s.

### 2.3 Validacao

- Zod schema rigido em `shared/schema.ts` (StudyWeeklyPlan + StudyWeeklyPlanItem).
- Output Coach valida via Zod ANTES de INSERT. Se invalido: retry 1x; se persistir, log + skip user (cron) ou 500 (manual). Lesson #5.
- `lessonId` no output validado contra `library_lessons.id` reais (anti-hallucinacao).
- `themeId` no output validado contra `study_themes.id` do user OU curated.

### 2.4 Toggle de completed

Endpoint `PATCH /api/study-weekly-plan/items/:itemId/toggle` faz read-modify-write em transacao:

```sql
BEGIN;
  SELECT completed_items_jsonb FROM study_weekly_plans
  WHERE user_id=$1 AND week_start_date=$2 FOR UPDATE;
  -- app-level: add/remove itemId
  UPDATE study_weekly_plans
  SET completed_items_jsonb = $3, updated_at=NOW()
  WHERE user_id=$1 AND week_start_date=$2;
COMMIT;
```

`FOR UPDATE` serializa toggles concorrentes do mesmo plan. Race "2 toggles em < 1s" resolve com last-write-wins (aceito pela spec §RF-3 edge cases).

---

## 3. Opcoes Consideradas

### Opcao A: Tabela child `study_weekly_plan_activities`

```sql
study_weekly_plans { id, user_id, week_start_date, source, daily_target_minutes, ... }
study_weekly_plan_activities {
  id, plan_id FK, day_label, item_index,
  type, title, description, estimated_minutes, cta_target,
  theme_id FK, lesson_id FK, hand_ids JSONB,
  reasoning, completed BOOLEAN, completed_at TIMESTAMPTZ
}
```

- **Pros:** queries analytics granulares ("media de drills GTO por semana"); FKs reais em `theme_id` e `lesson_id` (CASCADE / SET NULL); historico de completion timestamp; UPDATE de completed eh trivial atomic UPDATE 1 row (sem read-modify-write).
- **Cons:** plano gerado em uma INSERT em batch precisa dezenas de rows (5 dias x 3-4 = 15-20 rows); regenerate manual exige DELETE + INSERT batch (2 statements); soft constraint "5 dias x 3-4 atividades" precisa app-level enforce; analytics granulares nao sao requisito Sprint 2 (ja temos `study_sessions_v2` para isso); FK em `lesson_id`/`theme_id` em CADA activity multiplica overhead — Coach output ja valida estes IDs antes de salvar.

### Opcao B (escolhida): JSONB embarcado

- **Pros:** Coach output eh JSON estruturado — INSERT direto sem mapping; 1 row por plano = simples backup, simples manage; UNIQUE constraint `(user_id, week_start_date)` enforce idempotency cron+manual em 1 linha; regenerate manual = UPDATE em 1 row (vs DELETE+INSERT batch); UI consome o JSONB direto (sem JOIN); analytics analiticas reais (volume real de estudo) ja existem em `study_sessions_v2` — plano eh "intencao", nao "fato".
- **Cons:** GIN index em `plan_jsonb` nao estritamente necessario (queries nao filtram por conteudo do plano); toggle de completed exige read-modify-write em `completed_items_jsonb` (mas resolvido com `FOR UPDATE` + UPDATE em transacao); FKs em `lesson_id`/`theme_id` viram **soft refs** (lesson deletada apos plano gerado vira `null` em runtime, hidratacao cuida); queries "qual % de itens type=drill_gto" exigem `jsonb_array_elements` (overhead, mas raro).

### Opcao C: Hibrido — `study_weekly_plans` com `plan_jsonb` + tabela `study_weekly_plan_completions` separada

- **Pros:** plano imutavel em `plan_jsonb`; completions em rows independentes com `completed_at` historico.
- **Cons:** duas fontes de verdade para o mesmo conceito ("plano + estado"); 2 endpoints para criar/atualizar; complexidade desnecessaria para Sprint 2 (founder N=1 + beta).

---

## 4. Consequencias

**Positivas:**
- Schema simples — 1 tabela, 1 INSERT por geracao.
- Coach output JSON cabe direto no `plan_jsonb` sem mapping.
- UNIQUE constraint enforce idempotency atomico.
- Regenerate manual = UPDATE limpo (zero risco de orfaos).
- UI consome JSONB direto; sem JOIN em activities.

**Negativas:**
- FKs `lesson_id`/`theme_id` viram soft refs — lesson deletada apos plano gerado precisa hidratacao "ainda existe?" (validado pelo handler GET).
- Toggle de completed exige read-modify-write (mas resolvido com FOR UPDATE).
- Analytics granulares ("volume real por type") nao sao triviais via `jsonb_array_elements` — mas Sprint 2 nao precisa disso. `study_sessions_v2` mede estudo real.

**Neutras:**
- `completed_items_jsonb` array simples cresce conforme user marca itens. Max 20 items / plano = trivial.
- `cost_tokens_used` capturado para ROI Coach analysis.
- `regenerated_count` permite limit per-week se necessario futuro (Sprint 2 limit eh 1/dia per user via rate limit endpoint).

---

## 5. Confianca

**Alta.** JSONB embarcado para "config snapshot" eh padrao em features de gerador (Coach output, settings, etc.). Lesson #7 (deprecation gradual via Zod optional+default) cobre evolucao do shape. Lesson #14 (vi.hoisted para mocks Coach) coberto. Pattern UNIQUE composite + idempotent UPSERT ja foi usado em `coach_lesson_recommendations` (ADR-111).

Risco de "queries analytics no JSONB futuro" eh mitigado por `study_sessions_v2` ser source of truth para volume real. Plano eh intencao, nao fato.

---

## 6. Anexos

- Diagrama ER: `Docs/architecture/data-model-estudos-coach-biblio-2.mermaid`
- Diagrama flow geracao: `Docs/architecture/feature-flow-weekly-plan.mermaid`
- Migration: `migrations/0055_study_weekly_plans.sql`
- Spec: `Docs/specs/estudos-coach-biblio-2.md` §RF-3
