# Spec: Sprint Spot-Anki-Reentry-3 — Spot Learning Loop + Spaced Reentry

## Status
**Proposta** | Aprovada | Em Desenvolvimento | Concluida

## Resumo Executivo

Sprint 3 da iniciativa "Sistema Plano Estudo Mensal" — **a killer feature** identificada na research (Tier 3, ICE 4.33, gap competitivo defensavel: ninguem em poker tem spaced reentry de spots com Coach contextual).

5 RFs:

1. **RF-1 Spot Insight estruturado** — campos novos em `starred_hands` (`insight`, `decision_correct`, `confidence_level`, `tags`) + UI `SpotInsightDialog` chamado pos-paste em /grind-live ou pos-paste em /estudos.
2. **RF-2 Spot Reentry Cards (SRS)** — tabela nova `spot_reentry_cards` + algoritmo SM-2 simplificado + auto-criacao via cron `materializeDrillDifficultSpotsCron` (le `study_sessions_v2.difficult_spots`) + endpoint `POST /api/spots/:id/reentry`.
3. **RF-3 Pagina /estudos/reentry (revisao)** — nova rota com queue de cards pendentes hoje, 4 botoes Anki-style (`again|hard|good|easy`), recompute next_review_at + interval + ease, contadores e empty state.
4. **RF-4 Coach surface reentry candidates** — apos finalize /grind-live, painel `CoachSessionInsightsPanel` (Sprint 2 RF-4) ganha secao "Spots para reentry" sugerindo bulk-add a partir de spots com `decision_correct=false` ou `confidence_level<=2`.
5. **RF-5 Stats e gamificacao discreta** — widget "Cards SRS" no Dashboard /estudos: pendentes hoje, revisados 7d, acuracidade semana, streak dias com >=1 card. SEM badges/trofeus.

A hipotese central: **spaced repetition de spots com insight escrito + Coach surfacing** transforma /grind-live de "graveyard de prints" em **loop fechado de aprendizado estruturado**. Anki tem 20+ anos de evidencia de retencao em medicina; aplicar em poker e claim 100% defensavel — Hand2Note 4, PT4, GTOWizard nao oferecem nada parecido. Combina insights F5 + Spot Review Queue ID6 da research em um sistema unico.

---

## Contexto

### Fonte de verdade

- **Research:** `Docs/strategy/2026-05-08-estudos-stats-analyzer-research.md` secao 6 Tier 3 (item 7) + secoes 4.6 (ID6 Spot Review Queue Anki) + 3.5 (F5 Spot insight + busca + reentry) + 7.5 (R5 spaced reentry overflow mitigacao 5/dia).
- **Specs anteriores:** 
  - `Docs/specs/estudos-habito-1.md` (Sprint 1, ADR-126) — entregou `study_sessions_v2.difficult_spots` jsonb (Array<{context, note}>, max 5) ja preparado para reentry.
  - `Docs/specs/estudos-coach-biblio-2.md` (Sprint 2, ADR-133/134) — entregou Coach plano semanal + `coach_session_insights` com `topHands` + `spotsToReview`. RF-4 desta sprint estende o painel.

### Estado atual

- **`starred_hands`** existe (Sprint Spot-Screenshots, ADR-057). Schema atual: `id`, `userId`, `sessionId`, `sessionTournamentId`, `cooldownLogId`, `type`, `spot`, `notes`, `imageUrl`, `imageKey`, `imageMime`, `imageSize`, `imageWidth`, `imageHeight`, `capturedDuring`, `conclusion`, `reviewedAt`, `reviewLater`, `expiresAt`, `pastedAt`, `source`, `status`, `createdAt`. **Esta sprint adiciona** `insight`, `decision_correct`, `confidence_level`, `tags` (extensao incremental, todos nullable).
- **`study_sessions_v2.difficult_spots`** existe (Sprint 1, ADR-126) com shape `Array<{context: string, note: string}>` max 5. Sprint 1 ja preparou esse campo para alimentar reentry — esta sprint **ATIVA** o cron que materializa cards a partir disso.
- **`coach_session_insights`** existe (Sprint 2, ADR-133). `insights_jsonb.topHands` e `insights_jsonb.spotsToReview` ja sao estruturados. RF-4 desta sprint adiciona acao bulk no painel sem mudar shape do jsonb (cliente le `spotsToReview` e oferece "Adicionar todos a reentry").
- **SpotScreenshotPaster + SpotsView** existem em `client/src/components/grind-live/` e `client/src/components/study/`. RF-1 hooka `SpotInsightDialog` apos paste sucesso.
- **Cron infra** — Sprint News-3 (ADR-107) e Sprint FX-1 (ADR-123) entregaram pattern para crons via job-runner. RF-2 reusa para `materializeDrillDifficultSpotsCron` (1x/dia, default 06:00 UTC).
- **Wouter routing** — `client/src/App.tsx` registra rotas. RF-3 adiciona `/estudos/reentry` na lista (lesson #19 — confirmar route casamento via test).
- **`/estudos` Dashboard** existe (Sprint Studies-Reform + Sprint Estudos-Habito-1). RF-5 adiciona um widget extra "Cards SRS" no grid existente.
- **`PATCH /api/starred-hands/:id`** ja existe para update de `notes`/`conclusion`/`reviewLater`. RF-1 estende com novos campos.

---

## Usuarios e User Stories

### Personas

| Persona | Como esse sprint impacta |
|---|---|
| **Jogador profissional MTT (founder + pro beta)** | Spot pasted vira aprendizado escrito + reentry agendada. Coach pos-live oferece bulk add. /estudos/reentry vira ritual diario. |
| **Casual user (free tier)** | Pode usar reentry mas sem auto-criacao via Coach (gated por feature flag premium opcional, decisao produto fora da spec). MVP: aberto a todos. |
| **Pro grinder (premium tier)** | Tudo ativo. Cron materializa difficult_spots. Coach insights surface candidates. Streak SRS conta. |

### User stories

**US-1 (Founder, pos-paste em /grind-live):** "Apos colar print de mao critica em /grind-live, abre dialog rapido pedindo insight (max 1000 char), confidence 1-5, e se decisao foi correta. Marco 'Adicionar a reentry'. Sistema cria card SRS com next_review_at = amanha mesmo horario."

**US-2 (Founder, pos-finalize sessao):** "Modal pos-finalize mostra 'Insights da sessao' (Sprint 2 RF-4) e ja vejo painel novo 'Spots para reentry — 4 candidatos detectados'. Clico 'Adicionar todos' e crio 4 cards de uma vez. Spots com `decision_correct=false` viram cards com initial_interval=1d. Spots com `confidence_level<=2` viram cards com initial_interval=2d."

**US-3 (Pro grinder, ritual diario):** "Abro /estudos/reentry de manha. Header mostra 'Voce tem 5 cards pendentes hoje'. Vejo cada card: print + insight escrito + tags. Marco 'Acertei' (good) ou 'Errei' (again). Errei = volta amanha. Acertei = vai para 7d. Acertei facil = vai para 14d. Confetti no fim do batch + stats sessao."

**US-4 (Founder, pos-drill GTO):** "Logo 30min de drill GTO no /estudos com 3 difficult_spots anotados. No dia seguinte de manha, cron rodou e ja tem 3 cards de reentry pendentes desses spots. UX integrada — nao precisei adicionar manualmente."

**US-5 (Casual user, retencao):** "Voltei depois de 3 dias sem app. /estudos/reentry mostra 12 cards pendentes mas cap diario garante so 5 hoje + 5 amanha + 2 depois. Nao me sobrecarrega. Streak SRS quebra silenciosa (sem alarme infantil), apenas conto reset no widget."

---

## Objetivos

1. **Transformar spots em ativos de aprendizado**, nao prints descartaveis. Cada spot tem insight escrito + tags + confidence + reentry agendada.
2. **Closed-loop spot → insight → revisao espacada → memoria long-term**. Aplicar SRS (Spaced Repetition System) baseado em SM-2 simplificado, com cap 5 cards/dia auto-criados (anti-overflow R5 da research).
3. **Coach AI surface as gateway** — pos-finalize sessao live, oferecer bulk-add de candidatos detectados (spots com decision ruim ou low confidence) sem forcar.
4. **Diferencial competitivo defensavel** — primeiro tracker de poker com spaced repetition contextual de spots. Anki applied to poker, ja validado por blogs externos (premiumpokertools).

## Nao-Objetivos (Out of Scope)

- **Search semantica em insights** (full-text com embeddings) — tags livres bastam no MVP. Search semantica defer Sprint 4.
- **SRS algorithm complexo (FSRS, full SM-2)** — usar SM-2 simplificado com 4 grades (Anki classic). Otimizacao do algoritmo defer.
- **Notificacao push/email "voce tem X cards pendentes hoje"** — fora de escopo. UI in-app apenas. Push pode entrar em fase 2 quando push infra existir (atualmente sem push infra).
- **Spaced reentry em Anki Connect / export para Anki desktop** — deixar dado proprietario no Grindfy, nao integrar com Anki externo.
- **Compartilhamento social de cards / decks publicos** — anti-pattern para publico Pro (R1 da research).
- **Drill mode integrado (gerar variacoes do spot)** — defer, complexo demais.
- **Retencao analitica avancada** (forgetting curve graphs, FSRS metrics) — widget simples de stats apenas.
- **Voice/TTS para revisar cards** — defer, fora do core.
- **Bulk import de spots historicos para reentry** — apenas spots novos (criados apos deploy desta sprint). Backfill via cron processa `study_sessions_v2.difficult_spots` ultimos 7 dias.
- **Edicao de algoritmo SRS por user (intervals customizados)** — algoritmo fixo. Power users pedem na fase 2.
- **Monetizacao por tier (free vs premium para reentry)** — feature aberta a todos no MVP. Decisao produto pode gated depois.
- **Gamificacao excessiva (badges, trofeus, leveling)** — apenas streak discreto + stats numericos. R1 da research.

---

## Requisitos Funcionais

### RF-1: Spot Insight estruturado

**Descricao:** Estender `starred_hands` com campos semanticos para aprendizado: `insight`, `decision_correct`, `confidence_level`, `tags`. UI: dialog `SpotInsightDialog` aberto automaticamente apos paste sucesso em /grind-live (e opcional via menu de spot existente em /estudos/spots).

#### Regras de negocio

##### RF-1.1: Schema delta `starred_hands`

Adicionar 4 colunas (todos nullable, defaults safe):

```ts
ALTER TABLE starred_hands
  ADD COLUMN insight text,
  ADD COLUMN decision_correct boolean,
  ADD COLUMN confidence_level integer,
  ADD COLUMN tags jsonb;

-- Constraint:
ALTER TABLE starred_hands
  ADD CONSTRAINT chk_confidence_range
    CHECK (confidence_level IS NULL OR (confidence_level >= 1 AND confidence_level <= 5));

-- Index para query "spots com insight":
CREATE INDEX idx_starred_user_has_insight
  ON starred_hands (user_id, created_at DESC)
  WHERE insight IS NOT NULL;
```

Schema Zod em `shared/schema.ts` (extensao):

```ts
insight: z.string().max(1000).nullable().optional(),
decisionCorrect: z.boolean().nullable().optional(),
confidenceLevel: z.number().int().min(1).max(5).nullable().optional(),
tags: z.array(z.string().max(40)).max(10).nullable().optional(),
```

**Regra cap tags:** max 10 tags por spot, max 40 char por tag. UI valida + server valida (defesa em camadas).

##### RF-1.2: UI SpotInsightDialog

Componente novo `client/src/components/spots/SpotInsightDialog.tsx`. Props:

```ts
type SpotInsightDialogProps = {
  spotId: string;  // starredHands.id
  open: boolean;
  onClose: () => void;
  initialValues?: Partial<{
    insight: string;
    decisionCorrect: boolean | null;
    confidenceLevel: number | null;
    tags: string[];
  }>;
  showAddToReentry?: boolean;  // mostra checkbox "Adicionar a reentry"
  defaultAddToReentry?: boolean;  // pre-marca quando vem de Coach panel
};
```

Layout (grid stack vertical):

1. **Textarea Insight** — placeholder "O que aprendeu desse spot?". Max 1000 char (counter visivel). Required quando `decisionCorrect=false` (force user a explicar erro).
2. **Confidence slider** — labels "1 — Adivinhei" / "5 — Tinha certeza". Default 3.
3. **Toggle group Decisao correta** — 3 opcoes: "Sim" / "Nao sei" / "Nao". Default "Nao sei" (`null`).
4. **Tags input** — autocomplete com sugestoes vindas de `study_themes.name` + tags livres. Pill UI. Max 10. Validar caracter set (letras, numeros, hifen, acento).
5. **Checkbox "Adicionar a reentry"** — quando `showAddToReentry=true`. Tooltip "Cria card de revisao espacada (Anki). Sera revisto amanha."
6. **Footer:** Botao primary "Salvar". Botao secondary "Salvar sem revisar".

Comportamento:
- `Salvar` faz PATCH `/api/starred-hands/:id` com novos campos. Se `addToReentry=true`, em sequencia faz POST `/api/spots/:id/reentry`.
- `Salvar sem revisar` faz apenas PATCH. Sem reentry card.
- Validacao client: insight max 1000, tags max 10, confidence in [1,5]. Submit desabilitado se invalido.
- Loading state: spinner no botao Salvar. Erro: toast variant `destructive`.

##### RF-1.3: Trigger automatico apos paste em /grind-live

`SpotScreenshotPaster.tsx` (existente em `client/src/components/grind-live/`) ja chama POST `/api/starred-hands` apos paste/upload. Apos resposta 200 + `starredHand.id`, abrir `SpotInsightDialog` com `showAddToReentry=true` e `defaultAddToReentry=false`.

User pode "Salvar sem revisar" (apenas fecha dialog) ou preencher e salvar — fluxo nao bloqueante.

**Setting opt-out:** flag user-level em `users.home_layout_settings.spotInsightDialogAutoOpen` (default `true`). Quando `false`, paste salva sem abrir dialog. Setting togglavel em /estudos > Configuracoes (mesma pagina onde foi adicionado `focusStatsBarVisibility` no Sprint 1).

##### RF-1.4: Trigger manual em /estudos/spots

SpotsView (existente em `client/src/components/study/`) tem cards de spots ja salvos. Adicionar action menu novo "Adicionar/editar insight" (icon `Lightbulb` ou similar). Click abre `SpotInsightDialog` com `initialValues` populados (se ja tem insight) e `showAddToReentry=true`.

Se ja existe `spot_reentry_cards` com `archived_at IS NULL` para esse spot, mostrar checkbox como ja-marcado-disabled com helper "Ja esta na fila de revisao".

##### RF-1.5: API endpoints (extensao)

```
PATCH /api/starred-hands/:id
  Body (extensao):
    {
      // campos existentes (notes, conclusion, reviewLater) +
      insight?: string | null,         // max 1000
      decisionCorrect?: boolean | null,
      confidenceLevel?: number | null, // 1-5
      tags?: string[] | null           // max 10, max 40 char each
    }
  Auth: requireAuth + ownership check (starredHands.user_id === req.user.id)
  Response 200: { ...starredHand atualizado }
  Response 400: validation error Zod
  Response 403: ownership
  Response 404: spot nao existe

GET /api/starred-hands?withInsight=true
  Auth: requireAuth
  Query params extras:
    - withInsight=true: filtra spots com insight IS NOT NULL
    - tag=<string>: filtra spots cujo tags array contem esse tag
    - decisionCorrect=true|false: filtra
    - minConfidence=1-5
  Response 200: { items: StarredHand[], total: number }
```

#### Criterio de aceitacao RF-1
- [ ] Migration nova adiciona 4 colunas em `starred_hands` com defaults safe (todos null).
- [ ] Index parcial `idx_starred_user_has_insight` criado.
- [ ] PATCH `/api/starred-hands/:id` aceita novos campos com validacao Zod (insight max 1000, tags max 10, confidence 1-5).
- [ ] Server valida ownership antes de update.
- [ ] Constraint DB-level CHECK em `confidence_level` (1-5).
- [ ] `SpotInsightDialog` renderiza com layout 6 sections + valida client-side antes de submit.
- [ ] Dialog auto-abre apos paste em /grind-live (controlavel via setting opt-out).
- [ ] Dialog manual em /estudos/spots via action menu populando `initialValues`.
- [ ] Quando `addToReentry=true`, POST sequencial `/api/spots/:id/reentry` cria card.
- [ ] Filtros `?withInsight`, `?tag`, `?decisionCorrect`, `?minConfidence` funcionam em GET `/api/starred-hands`.

#### Cenarios de teste derivados RF-1
- [ ] Happy path: paste spot → dialog abre → preenche insight + tags + confidence → salva → PATCH 200 → spot atualizado.
- [ ] Salvar sem reentry: dialog abre → preenche apenas insight → salva → POST `/api/spots/:id/reentry` NAO chamado.
- [ ] Salvar com reentry: dialog → marca checkbox → POST `/api/spots/:id/reentry` chamado, card criado.
- [ ] Validation: insight com 1001 char → submit desabilita + erro inline.
- [ ] Validation: 11 tags → submit desabilita.
- [ ] Validation: confidence_level 6 → server retorna 400 (constraint Zod + DB CHECK).
- [ ] Ownership: user A tenta PATCH spot do user B → 403.
- [ ] Setting opt-out: `spotInsightDialogAutoOpen=false` → paste NAO abre dialog.
- [ ] Filter withInsight=true: retorna apenas spots com insight nao-null.
- [ ] Filter tag="ICM": retorna apenas spots cujo tags array contem "ICM".
- [ ] Edge: salvar spot ja com reentry ativa marca checkbox disabled + "Ja na fila".

---

### RF-2: Spot Reentry Cards (SRS)

**Descricao:** Tabela nova `spot_reentry_cards` com algoritmo SM-2 simplificado (4 grades estilo Anki: `again|hard|good|easy`). Auto-criacao via 3 fontes: manual_add, drill_gto_difficult_spot (cron), coach_session_insight (bulk via painel).

#### Regras de negocio

##### RF-2.1: Schema `spot_reentry_cards` (NOVA tabela)

```ts
spot_reentry_cards {
  id: varchar(21) PK NOT NULL                  // nanoid
  user_id: varchar(21) NOT NULL FK users.userPlatformId ON DELETE CASCADE
  spot_id: varchar(21) NOT NULL FK starred_hands.id ON DELETE CASCADE
  source: varchar(32) NOT NULL                 // CHECK ('manual_add'|'drill_gto_difficult_spot'|'coach_session_insight')
  created_at: timestamptz NOT NULL DEFAULT now()

  -- SRS state:
  next_review_at: timestamptz NOT NULL         // quando deve aparecer
  interval_days: numeric(8,2) NOT NULL         // intervalo atual em dias (fracionario para hard etc)
  ease_factor: numeric(3,2) NOT NULL DEFAULT 2.5  // multiplicador SM-2

  -- Tracking:
  review_count: integer NOT NULL DEFAULT 0
  correct_count: integer NOT NULL DEFAULT 0    // cumulative grade in {hard,good,easy}
  last_review_at: timestamptz
  last_grade: varchar(8)                       // 'again'|'hard'|'good'|'easy'

  -- Lifecycle:
  archived_at: timestamptz                     // user arquivou (para de aparecer)

  updated_at: timestamptz NOT NULL DEFAULT now()
}
```

**Indices:**

```sql
-- Query queue: cards pendentes hoje para user
CREATE INDEX idx_srs_user_next_review
  ON spot_reentry_cards (user_id, next_review_at)
  WHERE archived_at IS NULL;

-- Lookup: existe card ativo para esse spot?
CREATE UNIQUE INDEX uq_srs_user_spot_active
  ON spot_reentry_cards (user_id, spot_id)
  WHERE archived_at IS NULL;

-- Stats: cards revisados ultimos 7d
CREATE INDEX idx_srs_user_last_review
  ON spot_reentry_cards (user_id, last_review_at)
  WHERE last_review_at IS NOT NULL;
```

**Constraints:**

- `source CHECK (source IN ('manual_add', 'drill_gto_difficult_spot', 'coach_session_insight'))`
- `last_grade CHECK (last_grade IS NULL OR last_grade IN ('again', 'hard', 'good', 'easy'))`
- `interval_days CHECK (interval_days > 0 AND interval_days <= 120)`
- `ease_factor CHECK (ease_factor >= 1.3 AND ease_factor <= 3.0)`
- `review_count CHECK (review_count >= 0)`
- `correct_count CHECK (correct_count >= 0 AND correct_count <= review_count)`
- `UNIQUE (user_id, spot_id) WHERE archived_at IS NULL` (1 card ativo por spot por user; arquivar libera novo card)

##### RF-2.2: Algoritmo SM-2 simplificado

```ts
type Grade = 'again' | 'hard' | 'good' | 'easy';

function applyGrade(card: SpotReentryCard, grade: Grade): {
  nextIntervalDays: number;
  newEaseFactor: number;
  nextReviewAt: Date;
} {
  let { intervalDays, easeFactor } = card;

  switch (grade) {
    case 'again':
      // Erro: reset para 1d, reduce ease
      intervalDays = 1;
      easeFactor = Math.max(1.3, easeFactor * 0.8);
      break;

    case 'hard':
      // Acertou com dificuldade: x1.2, reduce ease
      intervalDays = intervalDays * 1.2;
      easeFactor = Math.max(1.3, easeFactor * 0.9);
      break;

    case 'good':
      // Acertou normal: multiplicador ease
      intervalDays = intervalDays * easeFactor;
      // ease unchanged
      break;

    case 'easy':
      // Acertou facil: x1.3 + boost ease
      intervalDays = intervalDays * easeFactor * 1.3;
      easeFactor = Math.min(3.0, easeFactor * 1.15);
      break;
  }

  // Cap interval em [1, 120]
  intervalDays = Math.max(1, Math.min(120, intervalDays));

  // Round para 2 casas (precisao DB)
  intervalDays = Math.round(intervalDays * 100) / 100;
  easeFactor = Math.round(easeFactor * 100) / 100;

  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + intervalDays * 86400 * 1000);

  return { nextIntervalDays: intervalDays, newEaseFactor: easeFactor, nextReviewAt };
}
```

**Initial values por source:**

| source | initial_interval_days | initial_ease_factor |
|---|---|---|
| `manual_add` | 1 | 2.5 |
| `drill_gto_difficult_spot` | 1 | 2.5 |
| `coach_session_insight` (decisionCorrect=false) | 1 | 2.5 |
| `coach_session_insight` (confidence<=2) | 2 | 2.5 |
| `coach_session_insight` (default) | 1 | 2.5 |

`next_review_at` na criacao = `now() + initial_interval_days * 1day`.

##### RF-2.3: Cron `materializeDrillDifficultSpotsCron`

**Job:** 1x/dia as 06:00 UTC. Reusa pattern Sprint News-3 (ADR-107) e Sprint FX-1 (ADR-123).

**Algoritmo:**

```
PARA CADA user_id em users WHERE deleted_at IS NULL:
  1. Lookup difficult_spots dos ultimos 7 dias:
     SELECT id, user_id, difficult_spots, registered_at
     FROM study_sessions_v2
     WHERE user_id = X
       AND mode = 'drill_gto'
       AND difficult_spots IS NOT NULL
       AND jsonb_array_length(difficult_spots) > 0
       AND registered_at > now() - interval '7 days'
       AND deleted_at IS NULL.

  2. PARA CADA study_session com difficult_spots:
     PARA CADA item em difficult_spots[]:
        // item = { context: string, note: string }

        a. Existe starredHand correspondente? Idempotency key derivada:
           hash = md5(study_session.id || item.context).
           Procurar starred_hand WHERE source='drill_gto_difficult_spot'
             AND notes LIKE '%hash:<hash>%' AND user_id=X.

        b. SE nao existe: criar starred_hand orfao (sem session/tournament real):
           INSERT starred_hands (
             id, user_id, source='drill_gto_difficult_spot',
             notes='[hash:<hash>] context: <item.context> | note: <item.note>',
             session_id=NULL,         -- *NOTA SCHEMA*: session_id NOT NULL atual.
             session_tournament_id=NULL,
             type='drill', spot='other',
             created_at=now()
           ).

        c. Existe spot_reentry_cards ativa para esse spot? Skip se sim.

        d. Cap diario: contar quantos cards source='drill_gto_difficult_spot'
           foram criados HOJE para esse user. Se >= 5 → SKIP (anti-overflow R5).

        e. INSERT spot_reentry_cards:
           - source='drill_gto_difficult_spot'
           - interval_days=1, ease_factor=2.5
           - next_review_at=now() + 1day.

  3. Log: count cards criados, count skipped (cap), errors.
```

**NOTA SCHEMA:** `starred_hands.session_id` e `session_tournament_id` sao atualmente NOT NULL. Para suportar drill spots orfaos esta sprint precisa **relaxar essas FKs para NULLABLE** OU criar uma nova tabela `drill_spots` separada. **Decisao spec:** relaxar para NULLABLE eh menos invasivo. Migration:

```sql
ALTER TABLE starred_hands
  ALTER COLUMN session_id DROP NOT NULL,
  ALTER COLUMN session_tournament_id DROP NOT NULL;

-- Remove FK ON DELETE CASCADE -> SET NULL (para drill spots sobreviverem)
-- Drizzle config: usar { onDelete: "set null" } para drill spots.
```

Schema Drizzle delta:

```ts
sessionId: varchar("session_id")
  .references(() => grindSessions.id, { onDelete: "cascade" }),
  // sem .notNull() — drill spots permitidos sem sessao
sessionTournamentId: varchar("session_tournament_id")
  .references(() => sessionTournaments.id, { onDelete: "cascade" }),
```

##### RF-2.4: Endpoints

```
POST /api/spots/:id/reentry
  Auth: requireAuth + ownership de spot
  Body: { source?: 'manual_add' | 'coach_session_insight' }  // default manual_add
  Idempotency: se ja existe card ativo (archived_at IS NULL) para (user_id, spot_id) → 409 + retorna card existente.
  Response 201: { card: SpotReentryCard, isNew: true }
  Response 200 (idempotent): { card: existing, isNew: false }
  Response 403: spot nao pertence ao user
  Response 404: spot nao existe

DELETE /api/spots/:id/reentry
  Auth: requireAuth + ownership
  Action: UPDATE spot_reentry_cards SET archived_at=now() WHERE user_id=X AND spot_id=Y AND archived_at IS NULL
  Response 200: { archived: true } ou { archived: false } se nao havia card ativo

GET /api/reentry/queue
  Auth: requireAuth
  Query params:
    - limit?: number (default 5, max 20)
  Response 200: {
    items: Array<{
      card: SpotReentryCard,
      spot: StarredHand  // joined com insight, tags, imageUrl etc
    }>,
    pendingTotal: number,        // todos cards com next_review_at <= now() (sem cap)
    pendingTodayCap: number,     // cap aplicado (5 default)
    nextScheduledAt: timestamptz | null  // se todos revisados, quando proximo
  }

POST /api/reentry/:cardId/grade
  Auth: requireAuth + ownership de card
  Body: { grade: 'again' | 'hard' | 'good' | 'easy' }
  Algoritmo: aplicar SM-2 (RF-2.2). Update card row (next_review_at, interval_days, ease_factor, review_count++, correct_count++ se grade != 'again', last_review_at=now(), last_grade=grade).
  Idempotency: incluir client-side idempotency key opcional (header `X-Idempotency-Key`) para evitar double-grade.
  Response 200: {
    card: <updated card>,
    nextReviewAt: timestamptz,
    intervalDays: number,
    nextCard: <proximo card pendente> | null
  }

POST /api/reentry/:cardId/skip
  Auth: requireAuth + ownership
  Action: UPDATE next_review_at = next_review_at + 1 day (push 1 dia sem alterar grade ou stats)
  Response 200: { card: updated, nextReviewAt }

GET /api/reentry/stats
  Auth: requireAuth
  Response: {
    pendingToday: number,                       // cards com next_review_at <= now() (uncapped)
    reviewedLast7Days: number,                  // count distinct cards revisados ultimos 7d
    accuracyLast7Days: number,                  // 0-1, correct_count_delta / review_count_delta
    streakDays: number                          // dias consecutivos com >=1 card revisado
  }

POST /api/reentry/bulk-from-session
  Auth: requireAuth + ownership do grind_session (sessionId)
  Body: { sessionId: string, spotIds: string[] }
  Action: PARA CADA spotId em spotIds (validar ownership + sessionId match):
    - Se ja tem card ativo: skip (count idempotent)
    - Senao: INSERT spot_reentry_cards com source='coach_session_insight'.
    - Initial interval: derivar de starredHand.decision_correct + confidence_level (RF-2.2 table).
  Response 201: { created: number, skipped: number, cards: SpotReentryCard[] }
  Cap: bulk request max 20 spotIds. > 20 → 400.
```

#### Criterio de aceitacao RF-2
- [ ] Migration cria tabela `spot_reentry_cards` com 6 indices/constraints listados.
- [ ] Migration relaxa `starred_hands.session_id` e `session_tournament_id` para NULLABLE.
- [ ] Schema Zod `insertSpotReentryCardSchema` valida fields + enum source.
- [ ] Algoritmo SM-2 retorna intervalos esperados para cada grade (validar matematicamente).
- [ ] Cap interval em [1, 120] e ease em [1.3, 3.0] respeitados.
- [ ] Cron `materializeDrillDifficultSpotsCron` executa 1x/dia e cria max 5 cards/user/dia (cap anti-overflow).
- [ ] Cron usa idempotency hash (md5(study_session.id || context)) para evitar dups.
- [ ] POST `/api/spots/:id/reentry` retorna 409+existing card se ja ativo.
- [ ] DELETE archive: UPDATE archived_at, NAO delete row (preserva historico).
- [ ] POST `/grade` chama SM-2 + update + retorna proximo card pendente.
- [ ] POST `/skip` push +1d sem alterar grade/stats.
- [ ] GET `/queue` retorna max 5 cards (cap default) + pendingTotal uncapped.
- [ ] GET `/stats` retorna pendingToday, reviewedLast7Days, accuracy, streakDays.
- [ ] POST `/bulk-from-session` cap 20 spots por request, idempotent skip se ja ativo.

#### Cenarios de teste derivados RF-2
- [ ] Algoritmo: card com interval=1, ease=2.5. Grade=good → next=2.5d, ease=2.5.
- [ ] Algoritmo: card com interval=2.5, ease=2.5. Grade=again → next=1d, ease=2.0.
- [ ] Algoritmo: card com interval=10, ease=2.5. Grade=easy → next=32.5d, ease=2.875 (cap 3.0 nao atingido).
- [ ] Algoritmo: card com interval=120, ease=2.5. Grade=easy → next=cap em 120 (nao 390).
- [ ] Algoritmo: ease starts at 2.5, after 5 'again' grades → ease cap em 1.3.
- [ ] Idempotency POST reentry: 2 chamadas → 1 card criado, segunda retorna 409 + existing.
- [ ] Cron processa difficult_spots ultimos 7d, NAO mais antigos.
- [ ] Cron cap 5/dia: 6+ difficult_spots em uma session → so 5 cards criados.
- [ ] Cron idempotency: 2 runs no mesmo dia → mesmos cards (hash dedup), 0 dups.
- [ ] DELETE archive: card archived → GET queue NAO retorna mais → POST /reentry novo cria card NEW (sem 409).
- [ ] Bulk from session: 25 spotIds → 400 (cap 20).
- [ ] Bulk: 5 spots, 2 ja ativos → 3 created, 2 skipped.
- [ ] Stats streakDays: revise card ontem + hoje → streak=2. Skip um dia → reset streak=1 (apenas hoje conta).
- [ ] Ownership: user A tenta grade card user B → 403.
- [ ] Edge: spot deletado (CASCADE) → cards reentry deletados em cascade tambem.

---

### RF-3: Pagina /estudos/reentry (revisao)

**Descricao:** Nova rota com queue dos cards pendentes hoje, UI Anki-style com 4 botoes de grade, recompute auto, contadores e empty state.

#### Regras de negocio

##### RF-3.1: Routing

Adicionar em `client/src/App.tsx`:

```tsx
<Route path="/estudos/reentry" component={lazy(() => import('@/pages/studies/Reentry'))} />
```

Sidebar `/estudos` tem item "Revisar" (icon `RotateCcw` ou similar) que navega para `/estudos/reentry`. Item mostra badge com `pendingToday` count quando > 0 (reuso pattern badge sidebar).

##### RF-3.2: Layout pagina

```
+----------------------------------------------------------------------+
| Header: "Revisao Espacada" + [Voltar para Estudos]                   |
|         "5 cards pendentes hoje" (count uncapped)                    |
+----------------------------------------------------------------------+
| [STAGE: empty | reviewing | done]                                    |
|                                                                      |
| EMPTY (pendingToday=0):                                              |
|   "Sem cards pendentes hoje. Volte amanha."                          |
|   "Proximo card: <relative time> (<absolute date>)"                  |
|   [Voltar para Estudos]                                              |
|                                                                      |
| REVIEWING:                                                           |
|   Counter: "Card 2 de 5"                                             |
|   Card:                                                              |
|     +----------------------+                                         |
|     | [imagem do spot]     |                                         |
|     +----------------------+                                         |
|     Tags: [ICM] [river] [GTO bluff]                                  |
|     Insight: "Bluff river OOP em pot grande..."                      |
|     Confidence: ★★★☆☆ (3/5)                                         |
|     Decisao: ✗ (errei)                                               |
|     Created: 5 dias atras | Reviews: 2 (1 correto)                   |
|                                                                      |
|     [Pular hoje]  [Errei (again)] [Dificil (hard)]                  |
|                                   [Acertei (good)] [Facil (easy)]   |
|                                                                      |
| DONE:                                                                |
|   Confetti animation (RFC stylesheet only, sem libs).                |
|   "Sessao finalizada! Acertou 4/5 (80%)."                            |
|   "Proximo card: amanha."                                            |
|   [Voltar para Estudos]                                              |
+----------------------------------------------------------------------+
```

##### RF-3.3: Comportamento

**On mount:**
- GET `/api/reentry/queue?limit=5` → preenche array `cards`. Estado `currentIndex=0`.
- Se `cards.length=0`: stage=empty + GET stats para mostrar `nextScheduledAt`.

**Click grade:**
- POST `/api/reentry/:cardId/grade { grade }`. Resposta inclui `nextCard`.
- Avancar: `currentIndex++`. Se `currentIndex >= cards.length`: stage=done.
- Toast pequeno (1.5s, top-right): "Proximo: <intervalDays>d" — user ve a evolucao.

**Click pular:**
- POST `/api/reentry/:cardId/skip`. Avancar +1.
- Toast: "Pulado. Volta amanha."

**Animation transitions:**
- Card slide-out left (Framer Motion, 250ms ease-out) ao gradear.
- Card slide-in right (250ms ease-out).
- Done state: confetti CSS (canvas-confetti opcional, fallback CSS keyframes RFC).

##### RF-3.4: Acessibilidade e teclado

Atalhos teclado (matcher Anki):
- `1` ou `Space`: again
- `2`: hard
- `3` ou `Enter`: good
- `4`: easy
- `S`: skip
- `Esc`: voltar para /estudos

ARIA labels nos botoes. Focus management entre cards.

##### RF-3.5: Empty state edge cases

- `pendingToday=0` mas `archived_at` count > 0 (so cards arquivados): mostrar texto + link "Ver cards arquivados" → /estudos/reentry?archived=1 (filtragem opcional UI futuro, MVP: link disabled "Em breve").
- User nunca criou card: mostrar texto pedagogico "Adicione um card de reentry a partir de qualquer spot em /grind-live ou /estudos/spots." + CTA "Ir para Spots".

#### Criterio de aceitacao RF-3
- [ ] Rota `/estudos/reentry` registrada em App.tsx + lazy load.
- [ ] Sidebar item "Revisar" com badge `pendingToday` reativo.
- [ ] On mount: GET queue + estado inicial correto baseado em count.
- [ ] Empty state mostra `nextScheduledAt` formatado (relative + absolute).
- [ ] Reviewing state mostra card atual com imagem, tags, insight, confidence stars, decision badge.
- [ ] 4 botoes grade chamam endpoint correto + avancam para proximo.
- [ ] Botao Pular avanca sem alterar grade/stats.
- [ ] Done state mostra count acertos + confetti + CTA voltar.
- [ ] Atalhos teclado (1-4, Space, Enter, S, Esc) funcionam.
- [ ] ARIA labels presentes nos botoes de grade.

#### Cenarios de teste derivados RF-3
- [ ] Happy path: 5 cards na queue → grade todos → done state → metricas corretas.
- [ ] Empty state: queue vazia → mostra "sem cards" + nextScheduledAt.
- [ ] Empty state usuario sem cards historico: mostra texto pedagogico + CTA.
- [ ] Skip card: avanca sem chamar grade → nao incrementa review_count.
- [ ] Atalho teclado: pressionar `2` → grade=hard.
- [ ] Network error em grade: retry + mostra toast erro.
- [ ] Concurrent: 2 abas abertas simultaneamente → segunda recebe queue diferente apos primeira gradear (server eh fonte de verdade).
- [ ] Edge: card arquivado durante revisao (race) → server retorna 410 Gone → UI skip + toast info.
- [ ] Stats apos sessao: streakDays incrementa se primeira revisao do dia.

---

### RF-4: Coach surface reentry candidates

**Descricao:** Apos finalize /grind-live, painel `CoachSessionInsightsPanel` (Sprint 2 RF-4) ja existe e mostra `topHands` + `spotsToReview`. Esta sprint estende com nova secao "Spots para reentry" com bulk-add.

#### Regras de negocio

##### RF-4.1: Logica de detection

Coach AI ja gera `coach_session_insights.insights_jsonb.spotsToReview` em Sprint 2. Esta sprint adiciona logica server-side adicional ao endpoint GET `/api/coach/session-insights/:sessionId` para anotar candidatos a reentry:

```
PARA CADA spot em spotsToReview[]:
  Carregar starred_hands row.
  Anotar reentry_candidate=true se:
    - decision_correct === false  OU
    - confidence_level !== null AND confidence_level <= 2  OU
    - has_insight === true (tem insight escrito mas sem reentry ainda)

  Anotar reentry_already_active=true se ja existe spot_reentry_cards ativo (archived_at IS NULL) para esse user/spot.
```

Shape `insights_jsonb.spotsToReview` extendida (sem breaking change — campos adicionais opcionais):

```ts
spotsToReview: Array<{
  spotId: string,
  label: string,
  suggestedAction: 'add_insight' | 'link_theme' | 'review_later',
  // RF-4 adiciona:
  reentryCandidate?: boolean,
  reentryAlreadyActive?: boolean,
  reentryReason?: string  // "Decisao errada" / "Baixa confianca" / "Tem insight, falta reentry"
}>
```

##### RF-4.2: UI Panel extensao

Painel existente `<CoachSessionInsightsPanel sessionId>` (Sprint 2). Adicionar 5a section "Spots para reentry":

```
+--------------------------------------------------+
| Spots para reentry                               |
| 4 candidatos detectados                          |
|                                                  |
| [□] Spot #1 - "BB defense vs UTG 3bet"          |
|     Reason: Decisao errada                       |
| [□] Spot #2 - "River decision OOP"              |
|     Reason: Baixa confianca (2/5)               |
| [□] Spot #3 - "ICM bubble fold"                 |
|     Reason: Tem insight, falta reentry          |
| [✓ Ja ativa] Spot #4                            |
|                                                  |
| [Selecionar todos] [Adicionar 4 a reentry]       |
+--------------------------------------------------+
```

- Checkboxes pre-marcados para `reentryCandidate=true` e nao `reentryAlreadyActive`.
- Spots ja com reentry ativa: badge "Ja ativa" + checkbox disabled.
- Botao "Adicionar X a reentry": chama POST `/api/reentry/bulk-from-session` com sessionId + spotIds selecionados.
- Pos-success: refetch insights → secao atualiza com `reentryAlreadyActive=true` para spots criados.
- Toast: "X cards de reentry criados. Ver em /estudos/reentry."

##### RF-4.3: Empty state

Se `reentryCandidate=true` count = 0: secao mostra mensagem "Sessao limpa — nenhum spot critico detectado. Otimo!". Sem botao bulk.

Se todos `reentryCandidate=true` ja tem `reentryAlreadyActive=true`: "Todos candidatos ja estao na fila de revisao." + link "/estudos/reentry".

#### Criterio de aceitacao RF-4
- [ ] Server-side logic anota `reentryCandidate` + `reentryAlreadyActive` + `reentryReason` no GET `/api/coach/session-insights/:sessionId`.
- [ ] Schema Zod do response inclui novos campos opcionais (no-op para Sprint 2 clients).
- [ ] UI panel renderiza secao "Spots para reentry" com checkboxes + reasons.
- [ ] Bulk button chama POST `/api/reentry/bulk-from-session` com spotIds selecionados.
- [ ] Pos-success: refetch insights, secao atualiza spots criados como ja-ativos.
- [ ] Empty state quando 0 candidatos: mensagem positiva.
- [ ] Empty state quando todos ja ativos: mensagem com link.

#### Cenarios de teste derivados RF-4
- [ ] Sessao com 5 spots, 3 candidatos detectados (decision_correct=false): 3 checkboxes marcados, 2 unmarked.
- [ ] 1 spot ja com reentry ativa: badge + checkbox disabled.
- [ ] Bulk add 3 selecionados: POST bulk-from-session com 3 spotIds → 3 cards criados.
- [ ] Refetch pos-bulk: secao atualiza, mostra todos como ativos.
- [ ] Empty: sessao com 0 spots criticos → mensagem "limpa".
- [ ] All-active: 5 candidatos todos ja com reentry → mensagem + link.
- [ ] User clica "Selecionar todos": marca todos checkboxes nao-disabled.
- [ ] Server-side detection ignora spots sem `decision_correct` (NULL) e sem confidence baixa (NULL).

---

### RF-5: Stats e gamificacao discreta

**Descricao:** Widget "Cards SRS" no Dashboard /estudos mostrando 4 metricas: pendentes hoje, revisados ultimos 7 dias, acuracidade, streak dias com >=1 card revisado.

#### Regras de negocio

##### RF-5.1: Componente `<SrsStatsCard>`

Localizacao: `client/src/components/study/SrsStatsCard.tsx`. Props:

```ts
type SrsStatsCardProps = {
  className?: string;
};
```

Layout:

```
+--------------------------------------------------+
| 🔁 Revisao Espacada                  [Ver →]    |
+--------------------------------------------------+
| 5 cards pendentes hoje                           |
|                                                  |
| 23 revisados nos ultimos 7 dias                  |
| 87% acuracidade                                  |
| 🔥 4 dias seguidos                                |
+--------------------------------------------------+
```

- Header: titulo + chevron "Ver" → /estudos/reentry.
- 4 stat lines com valores grandes + labels pequenos.
- Streak indicator com fire emoji (estetica discreta, sem mascotes).
- Loading state: skeleton 4 lines.
- Empty (zero stats): "Comece registrando insights de spots em /grind-live."

##### RF-5.2: Endpoint reuso

Reusa GET `/api/reentry/stats` (RF-2). Cache client-side via TanStack Query (stale 60s, refetch on focus).

##### RF-5.3: Posicao no Dashboard

`/estudos` Dashboard (existente). Inserir `<SrsStatsCard>` no grid no slot proximo a `WeekInsights` (esquerda) ou abaixo de `RecommendationsPreview` (decisao designer/architect; spec sugere abaixo de `WeekInsights` em coluna esquerda).

##### RF-5.4: Setting opt-out

Reusa `users.home_layout_settings.showSrsStatsCard` (default `true`). Toggle em /estudos > Configuracoes.

##### RF-5.5: Calculo das metricas

```ts
pendingToday = COUNT(spot_reentry_cards
  WHERE user_id=X AND archived_at IS NULL
    AND next_review_at <= now())

reviewedLast7Days = COUNT(DISTINCT card_id de
  spot_reentry_cards WHERE user_id=X
    AND last_review_at > now() - interval '7 days')

accuracyLast7Days = SUM(CASE WHEN last_grade IN ('hard','good','easy') THEN 1 ELSE 0 END) /
                    COUNT(*) ON same window
                    (apenas reviews ultimos 7d, nao all-time)

streakDays = consecutive days starting from today (or yesterday if no review yet today)
             where >= 1 distinct card was reviewed
             (computed via group by date(last_review_at) descending until gap)
```

**Nota performance:** queries simples, indices ja existentes (idx_srs_user_last_review). Cache server-side 5min via Map (lesson #21 — invalidator publico chamado por POST /grade).

#### Criterio de aceitacao RF-5
- [ ] Componente `<SrsStatsCard>` renderiza no Dashboard /estudos.
- [ ] GET `/api/reentry/stats` retorna 4 metricas com calculos corretos.
- [ ] Client cache TanStack 60s + refetch on focus.
- [ ] Loading state skeleton.
- [ ] Empty state pedagogico quando pendingToday=0 e reviewedLast7Days=0.
- [ ] Setting `showSrsStatsCard` togglavel + respeitado.
- [ ] Streak calculation considera "today or yesterday" para nao quebrar antes meia-noite.

#### Cenarios de teste derivados RF-5
- [ ] User com 5 cards pendentes + 23 revisados 7d + 20 corretos: widget mostra 5 / 23 / 87% / streak.
- [ ] User sem cards: widget mostra empty pedagogico.
- [ ] Streak: revisou ontem + hoje → streak=2.
- [ ] Streak: revisou ontem mas NAO hoje (e ainda nao passou meia-noite) → streak=1 (yesterday counts ate cutoff).
- [ ] Streak: gap de 1 dia → reset streak=1 (apenas dia atual).
- [ ] Cache server: 2 calls sequenciais hit cache.
- [ ] Cache invalidate: POST /grade → cache invalida → next call recomputa.
- [ ] Setting opt-out: showSrsStatsCard=false → widget NAO renderiza.

---

## Requisitos Nao-Funcionais

- **Performance**: GET `/api/reentry/queue` < 100ms p95 com 50 cards/user. GET `/api/reentry/stats` < 150ms p95 (queries SQL aggregadas com indices).
- **Cron**: `materializeDrillDifficultSpotsCron` < 30s por user (limite total < 5min para 100 users iniciais; refatorar batched se passar).
- **Idempotency**: cron usa hash dedup. POST endpoints com idempotency key opcional.
- **Cap diario**: 5 cards auto-criados/user/dia (R5 da research). Manual unlimited.
- **Cap interval**: SM-2 cap em 120d (decay maximo aceitavel).
- **Cap ease**: SM-2 cap em [1.3, 3.0].
- **Soft delete**: archived_at em vez de DELETE row (auditoria).
- **Rate limit**: POST `/grade` rate-limited 60/min por user (anti-spam).
- **Backup**: cron daily logging em `studyJobsLog` (table de Sprint 1 ou criar).
- **Observability**: cron emite metricas count_created, count_skipped, errors via console.info structured.

## Endpoints Previstos (resumo)

| Metodo | Rota | Descricao | Auth | RF |
|---|---|---|---|---|
| PATCH | /api/starred-hands/:id | Update spot com insight + tags + confidence | JWT | RF-1 |
| GET | /api/starred-hands?withInsight=true&tag=X | Filter spots | JWT | RF-1 |
| POST | /api/spots/:id/reentry | Cria card SRS de spot | JWT | RF-2 |
| DELETE | /api/spots/:id/reentry | Archive card SRS | JWT | RF-2 |
| GET | /api/reentry/queue | Cards pendentes hoje | JWT | RF-2/RF-3 |
| POST | /api/reentry/:cardId/grade | Aplica SM-2 grade | JWT | RF-2/RF-3 |
| POST | /api/reentry/:cardId/skip | Push +1d | JWT | RF-2/RF-3 |
| GET | /api/reentry/stats | Metricas SRS | JWT | RF-2/RF-5 |
| POST | /api/reentry/bulk-from-session | Bulk add candidates | JWT | RF-2/RF-4 |
| GET | /api/coach/session-insights/:sessionId | Reuso Sprint 2 + reentry annotations | JWT | RF-4 |

## Modelos de Dados Afetados

### Tabela nova: `spot_reentry_cards`

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | varchar(21) | PK NOT NULL | nanoid |
| user_id | varchar(21) | NOT NULL FK users ON DELETE CASCADE | |
| spot_id | varchar(21) | NOT NULL FK starred_hands ON DELETE CASCADE | |
| source | varchar(32) | NOT NULL CHECK | enum 3 valores |
| created_at | timestamptz | NOT NULL DEFAULT now() | |
| next_review_at | timestamptz | NOT NULL | |
| interval_days | numeric(8,2) | NOT NULL CHECK >0 AND <=120 | |
| ease_factor | numeric(3,2) | NOT NULL DEFAULT 2.5 CHECK 1.3..3.0 | |
| review_count | integer | NOT NULL DEFAULT 0 | |
| correct_count | integer | NOT NULL DEFAULT 0 CHECK <=review_count | |
| last_review_at | timestamptz | nullable | |
| last_grade | varchar(8) | nullable CHECK enum 4 valores | |
| archived_at | timestamptz | nullable | soft-delete |
| updated_at | timestamptz | NOT NULL DEFAULT now() | |

UNIQUE INDEX `uq_srs_user_spot_active` ON (user_id, spot_id) WHERE archived_at IS NULL.
INDEX `idx_srs_user_next_review` ON (user_id, next_review_at) WHERE archived_at IS NULL.
INDEX `idx_srs_user_last_review` ON (user_id, last_review_at) WHERE last_review_at IS NOT NULL.

### Alteracao: `starred_hands` (extensao + relax FK)

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| insight | text | nullable | max 1000 (validacao app + Zod) |
| decision_correct | boolean | nullable | true/false/null (nao sei) |
| confidence_level | integer | nullable CHECK 1..5 | |
| tags | jsonb | nullable | array<string> max 10 itens |

ALTER session_id, session_tournament_id → drop NOT NULL (suporte drill spots orfaos).

INDEX `idx_starred_user_has_insight` ON (user_id, created_at DESC) WHERE insight IS NOT NULL.

### Alteracao: `coach_session_insights.insights_jsonb`

Shape `spotsToReview[]` ganha 3 campos opcionais (no breaking change):
- `reentryCandidate?: boolean`
- `reentryAlreadyActive?: boolean`
- `reentryReason?: string`

### Alteracao: `users.home_layout_settings`

Adicionar 2 campos opcionais (defaults):
- `spotInsightDialogAutoOpen?: boolean` (default `true`) — RF-1.3
- `showSrsStatsCard?: boolean` (default `true`) — RF-5.4

### Cron novo

`materializeDrillDifficultSpotsCron` — 1x/dia 06:00 UTC. Pattern Sprint News-3 / FX-1. Logged em `studyJobsLog` (criar tabela basica se nao existe ou reusar `cronJobsLog` se Sprint News-3 ja criou).

## Integracoes Externas

Nenhuma. Tudo interno.

## Cenarios de Teste Derivados (consolidado)

### Happy Path
- [ ] Founder: paste spot → dialog → preenche tudo → marca reentry → save → card criado → /estudos/reentry mostra card no dia seguinte.
- [ ] Pro: finalize sessao live → painel Coach → 4 candidatos detectados → bulk add → 4 cards criados.
- [ ] Power user: revisa 5 cards/dia consecutivos → streak=5 → widget mostra metricas.

### Validacoes
- [ ] Insight com 1001 chars → 400.
- [ ] 11 tags → 400.
- [ ] Confidence 6 → 400 + DB constraint backup.
- [ ] Grade invalido (e.g. 'meh') → 400.

### SM-2 algorithm
- [ ] Validar cada grade isoladamente (matriz 4 grades x 5 estados iniciais).
- [ ] Cap superior interval=120.
- [ ] Cap superior/inferior ease.

### Cron
- [ ] Idempotency hash dedup.
- [ ] Cap 5 cards/user/dia.
- [ ] Erro de network/db nao trava cron (try/catch por user).
- [ ] Janela 7d respeitada.

### Edge cases
- [ ] Spot deletado → cards CASCADE deletados.
- [ ] User deletado → cards CASCADE.
- [ ] Card archived durante revisao concurrent → 410.
- [ ] Bulk request 21 spotIds → 400.
- [ ] /reentry/queue com 0 cards → empty state correto.
- [ ] Streak reset quando gap >1 dia.
- [ ] Setting opt-out respeitado em todos triggers.

### Auth e ownership
- [ ] User A nao acessa cards/spots do user B (403 em todos endpoints).
- [ ] Bulk-from-session valida sessionId pertence ao user.

### Performance
- [ ] GET /queue com 200 cards user → < 100ms.
- [ ] Cron 100 users → < 5min total.

## Fora de Escopo (resumo)

- Search semantica em insights
- FSRS / algoritmo SRS avancado
- Push/email notifications
- Anki Connect / export externo
- Compartilhamento social
- Drill engine proprio
- Voice/TTS revisao
- Bulk import historico (alem de cron 7d)
- Edicao algoritmo por user
- Tier gating premium

## Dependencias

- **Sprint Estudos-Habito-1** (ADR-126) — `study_sessions_v2.difficult_spots` ja existe. Sprint 3 ATIVA o cron.
- **Sprint Estudos-Coach-Biblio-2** (ADR-133) — `coach_session_insights` table + painel UI base. RF-4 estende.
- **Sprint Spot-Screenshots** (ADR-057) — `starred_hands` infra + paste UI.
- **Sprint Grind-Live spot notes** — paste fluxo /grind-live (RF-1.3 hook).
- **Job runner** (ADR-087) — cron infra reuso.

## ADRs novos previstos (system-architect)

- **ADR-136** — `spot_reentry_cards` table + algoritmo SM-2 simplified (RF-2)
- **ADR-137** — Cap diario 5 cards auto-criados (R5 mitigation)
- **ADR-138** — Relax `starred_hands.session_id`/`session_tournament_id` para NULLABLE (suportar drill spots orfaos)
- **ADR-139** — Initial interval por source (decisao_correct=false → 1d, low confidence → 2d)
- **ADR-140** — Coach session insights extension shape (no breaking change)

## Notas de implementacao (opcional)

- Lesson #19 — confirmar `/estudos/reentry` em rota Wouter via test.
- Lesson #20 — se animacoes confetti usarem ref no container, querySelector pos-render.
- Lesson #21 — invalidator de cache server-side em POST /grade chamado apos commit.
- Lesson #14/15 — testes RTL usar `await import()`, evitar `vi.unmock` em scope nested.
- Lesson #29 — se SrsStatsCard usar `useQuery` em paginas standalone, ErrorBoundary local.

## Metricas de sucesso

- **Adesao paste insight**: % spots em /grind-live com `insight` preenchido > 0% (target Sprint 3 = 30% pos-2 semanas).
- **Cards criados**: avg cards/active user/semana > 5.
- **Reentry usage**: % users com >=1 card revisado/semana > 25% (D7 retention proxy).
- **Streak SRS**: avg streak entre users ativos > 3 dias.
- **Acuracidade**: avg accuracy > 70% (suggesting algoritmo funciona).
- **Coach bulk-add**: % painel insights com >=1 bulk-add click > 20%.
- **Cron health**: cards criados via cron / dia entre 50-200 (escala saudavel).
- **D7/D14/D30 retention**: users que registraram >=1 spot insight devem ter retencao >= 1.5x baseline.

## Riscos

- **R1 — SRS algorithm fora-do-eixo**: SM-2 simplificado pode dar intervalos esquisitos no comeco. **Mitigacao:** caps + initial interval por source. Validar matematicamente nos testes.
- **R2 — Spam de cards**: user "adicione todos" em sessoes com 50 spots vira lixo. **Mitigacao:** bulk cap 20 por request. Rate limit POST /reentry 30/min/user. UI sempre opt-in (nunca auto-create sem confirmacao alem do cron 5/dia).
- **R3 — Drift cron**: difficult_spots janela 7d pode acumular cards orfaos se user nao revisar. **Mitigacao:** cap 5/dia respeitado, archived_at user-controlled.
- **R4 — Duplicacao com Coach surface**: Coach panel ja sugere review, reentry tambem oferece. **Mitigacao:** reentry usa Coach insights como source quando disponivel — Coach NAO duplica logica de re-criar cards, apenas surface candidates.
- **R5 — UX overload em primeiros dias**: usuario novo recebe 0 cards (sem historico). **Mitigacao:** texto pedagogico no empty state + CTA explicito.
- **R6 — Spots drill orfaos quebram queries existentes**: relax NOT NULL em session_id pode quebrar queries que assumem NOT NULL. **Mitigacao:** audit `storage.ts` queries em starred_hands antes de migration. Adicionar WHERE filters defensivos nos queries existentes (`session_id IS NOT NULL` onde aplicavel).
- **R7 — Confetti animation latency**: lib confetti pode ser pesada. **Mitigacao:** CSS keyframes fallback. Lib opcional defer.
- **R8 — Streak calculation edge cases**: timezones + meia-noite + skip days. **Mitigacao:** documento explicito + tests cobrindo `today` vs `yesterday` cutoff.
- **R9 — Migration grande**: 1 ALTER table starred_hands (4 col + relax 2 NOT NULL) + 1 CREATE table + 3 indices. **Mitigacao:** consolidar em 1 migration arquivo. Backfill nao necessario (defaults safe).
- **R10 — Coach Sprint 2 nao deployed ainda**: RF-4 depende de Sprint 2 entregue. **Mitigacao:** confirmar Sprint 2 em main antes de iniciar implementer Sprint 3.

---

## Resumo Caveman

```
prob = spot pasted virou print morto, sem aprendizado, sem revisao
sol = spaced repetition tipo Anki + insight escrito + Coach surface

5 RF:
1 starredHands +4 col (insight, decision_correct, confidence, tags) + dialog post-paste
2 spot_reentry_cards table + SM-2 algorithm + cron daily 5/dia/user max
3 pagina /estudos/reentry queue + 4 botao grade + atalho teclado
4 Coach panel pos-finalize ganha secao "spots reentry" bulk-add
5 widget /estudos dashboard "cards SRS" 4 metrica + streak

schema:
- spot_reentry_cards new table (uniq active, idx queue, idx stats)
- starred_hands +4 col + relax session_id NULL (drill spots orfaos)
- coach_session_insights.insights_jsonb.spotsToReview +3 campo opt
- users.home_layout_settings +2 campo opt

algoritmo SM-2 simplified:
- again: interval=1, ease *= 0.8 (cap 1.3)
- hard: interval *= 1.2, ease *= 0.9
- good: interval *= ease (no ease change)
- easy: interval *= ease * 1.3, ease *= 1.15 (cap 3.0)
- cap interval [1, 120]

10 endpoint:
- PATCH /api/starred-hands/:id (extensao)
- GET /api/starred-hands?withInsight=true
- POST /api/spots/:id/reentry
- DELETE /api/spots/:id/reentry
- GET /api/reentry/queue
- POST /api/reentry/:cardId/grade
- POST /api/reentry/:cardId/skip
- GET /api/reentry/stats
- POST /api/reentry/bulk-from-session
- GET /api/coach/session-insights/:sessionId (reuso + 3 campo annotation)

cron novo: materializeDrillDifficultSpotsCron 06:00UTC daily
- le study_sessions_v2.difficult_spots ultimos 7d
- cria starred_hand orfao por difficult_spot
- cria spot_reentry_cards com source='drill_gto_difficult_spot'
- cap 5/user/dia (anti R5 overflow)
- idempotency hash md5(session.id || context)

ADR previsto: 136-140
risk: R1 algoritmo drift (cap), R2 spam (bulk cap 20 + rate limit), R6 drill orfaos quebrar queries (audit storage), R10 dep Sprint 2 deployed

scope out: search semantica, FSRS, push/email, Anki connect, social share, drill engine, TTS, bulk import historico, tier gating, badges/trofeus

metrica: cards/user/sem >5, streak avg >3d, acuracidade >70%, painel bulk-add >20%, retention 1.5x baseline

defensavel: NINGUEM em poker tem isso. H2N/PT4/GTOWizard nao tem SRS. Anki valida em medicina 20 anos. Aplicar em poker = killer feature.
```

---

## Output destinado a system-architect

Apos aprovacao desta spec, system-architect recebe input para:
1. Diagrama Mermaid do fluxo: paste spot → dialog → reentry create → cron → revisao /reentry → SM-2 update → metricas.
2. ER diagram delta: `spot_reentry_cards` + `starred_hands` extensao + `coach_session_insights` extensao.
3. Sequence diagram: Coach insights panel bulk-add → `/api/reentry/bulk-from-session` → cards criados → refetch.
4. ADRs 136-140 com decisoes principais.
5. Update `Docs/architecture/data-model-index.md` com nova tabela.
6. Update `Docs/api/endpoints-index.md` com 10 endpoints.
7. Anotar lessons aplicaveis: #14, #15, #19, #20, #21, #29.
