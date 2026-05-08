# ADR-140 — Coach `session_insights.spotsToReview[]` extension (3 campos opcionais)

- Status: Aprovado
- Data: 2026-05-08
- Sprint: spot-anki-reentry-3 (RF-4)
- Decision owner: system-architect
- Related: spec `Docs/specs/spot-anki-reentry-3.md` §RF-4, ADR-133 (`coach_session_insights` table), ADR-134 (Coach tools study plan + session insights), ADR-136 (`spot_reentry_cards`)
- Diagramas: `Docs/architecture/feature-flow-spot-insight-dialog.mermaid`

---

## 1. Contexto

`coach_session_insights` (tabela criada Sprint 2 RF-4 via ADR-133) armazena insights do Coach AI pos-finalize sessao /grind-live. Coluna `insights_jsonb` schema atual:

```ts
{
  topHands: Array<{
    spotId: string;
    label: string;
    rationale: string;
  }>;
  spotsToReview: Array<{
    spotId: string;            // FK starred_hands.id
    label: string;
    suggestedAction: 'add_insight' | 'link_theme' | 'review_later';
  }>;
  weeklyContext?: { ... };
}
```

Sprint 3 RF-4 estende painel `<CoachSessionInsightsPanel>` com section nova "Spots para reentry" + bulk-add. Painel precisa saber para cada spot:

1. **`reentryCandidate`**: backend determinou que spot e candidato (decision_correct=false OR confidence<=2 OR has_insight sem reentry).
2. **`reentryAlreadyActive`**: existe `spot_reentry_cards` ativa para esse user/spot.
3. **`reentryReason`**: string user-facing ("Decisao errada" / "Baixa confianca" / "Tem insight, falta reentry").

### Opcoes consideradas

#### Opcao 1: Adicionar 3 campos OPCIONAIS no shape `spotsToReview[]` (ESCOLHIDO)

```ts
spotsToReview: Array<{
  spotId: string;
  label: string;
  suggestedAction: 'add_insight' | 'link_theme' | 'review_later';
  // Sprint 3 ADIÇOES (todas opcionais):
  reentryCandidate?: boolean;
  reentryAlreadyActive?: boolean;
  reentryReason?: string;
}>
```

- **Pros:** zero breaking change. Sprint 2 client (ja em prod ate Sprint 3 deploy) le shape sem ler campos novos. Sprint 3 client le campos novos com `??` fallback. Migration zero (jsonb shape extension nao precisa ALTER).
- **Contras:** mais 3 campos no payload (~30 bytes/spot), payload jsonb cresce — irrelevante MVP (spots/sessao tipicamente < 10).

#### Opcao 2: Nova entrada no shape `spotsToReentry[]` separada de `spotsToReview[]`

```ts
spotsToReview: [...],         // Sprint 2 — preserved
spotsToReentry: [             // Sprint 3 — new array
  { spotId, reason, alreadyActive }
]
```

- **Pros:** isolation conceitual. Sprint 2 totalmente intocado.
- **Contras:** **divergencia**: Coach tem que popular AMBOS arrays para spots que aparecem em ambos. Logica server duplicada. Painel UI tem que cross-correlate spotIds entre 2 arrays. Worse cohesion.

#### Opcao 3: Tabela separada `spot_reentry_candidates`

Persistir candidatos em tabela propria.

- **Pros:** query rapida.
- **Contras:** **YAGNI total**. Candidacy e derivada (decision_correct + confidence + has_insight) — recomputavel a qualquer momento. Tabela nova so adiciona maintenance burden. Nada justifica.

---

## 2. Decisao

**Opcao 1.** Estender shape `spotsToReview[]` com 3 campos opcionais.

### 2.1 Schema delta

Sem migration SQL — `coach_session_insights.insights_jsonb` e jsonb sem schema strict no DB. Mudanca apenas em Zod schema (`shared/schema.ts`):

```ts
const coachSessionInsightsSpotsToReviewSchema = z.object({
  spotId: z.string(),
  label: z.string(),
  suggestedAction: z.enum(['add_insight', 'link_theme', 'review_later']),
  // Sprint 3 — RF-4
  reentryCandidate: z.boolean().optional(),
  reentryAlreadyActive: z.boolean().optional(),
  reentryReason: z.string().max(60).optional(),
});
```

### 2.2 Computacao server-side

Endpoint `GET /api/coach/session-insights/:sessionId` enriquece response no read time:

```ts
async function getEnrichedSessionInsights(sessionId: string, userId: string) {
  const insights = await storage.getCoachSessionInsight(sessionId);
  const spotIds = insights.spotsToReview.map(s => s.spotId);

  // batch fetch starred_hands fields
  const spots = await storage.getStarredHandsByIds(spotIds);
  const spotsById = new Map(spots.map(s => [s.id, s]));

  // batch fetch active reentry cards
  const activeCards = await storage.getActiveReentryCardsBySpotIds(userId, spotIds);
  const activeBySpotId = new Set(activeCards.map(c => c.spotId));

  insights.spotsToReview = insights.spotsToReview.map(item => {
    const spot = spotsById.get(item.spotId);
    if (!spot) return item;

    const reentryAlreadyActive = activeBySpotId.has(item.spotId);
    let reentryCandidate = false;
    let reentryReason: string | undefined;

    if (spot.decisionCorrect === false) {
      reentryCandidate = true;
      reentryReason = 'Decisao errada';
    } else if (spot.confidenceLevel !== null && spot.confidenceLevel <= 2) {
      reentryCandidate = true;
      reentryReason = `Baixa confianca (${spot.confidenceLevel}/5)`;
    } else if (spot.insight !== null && !reentryAlreadyActive) {
      reentryCandidate = true;
      reentryReason = 'Tem insight, falta reentry';
    }

    return {
      ...item,
      reentryCandidate,
      reentryAlreadyActive,
      reentryReason,
    };
  });

  return insights;
}
```

**N+1 mitigation:** 2 batch queries (`getStarredHandsByIds`, `getActiveReentryCardsBySpotIds`) — O(1) trips.

### 2.3 Storage layer NAO armazena campos enriquecidos

Coluna `insights_jsonb` armazena APENAS o shape original do Coach (Sprint 2). Enrichment e computado a cada GET. Justificativa:

- Estado dos spots muda: user pode adicionar insight depois de finalize sessao → `reentryCandidate=true` muda para `false` (ja tem reentry). Persistir ficaria stale.
- Computacao e barata (2 batch queries).
- Idempotencia: 2 calls retornam mesmo resultado se nada mudou.

### 2.4 UI consumption (Sprint 3 painel)

```tsx
const candidates = insights.spotsToReview.filter(s => s.reentryCandidate);
const alreadyActive = candidates.filter(s => s.reentryAlreadyActive);
const toAdd = candidates.filter(s => !s.reentryAlreadyActive);

// Empty states
if (candidates.length === 0) return <p>Sessao limpa — nenhum spot critico</p>;
if (toAdd.length === 0) return <p>Todos candidatos ja na fila</p>;

// Default checkboxes selected for toAdd
```

### 2.5 Backwards compat

Sprint 2 client (ja em prod) le `spotsToReview[]` sem ler novos campos — funciona normalmente. Sprint 3 client le campos novos com fallback `?? false`/`?? undefined`. Sprint 4+ pode promover campos para required quando todos clients atualizados.

---

## 3. Consequencias

### Positivas

- **Zero breaking change**: Sprint 2 clients continuam funcionando.
- **Zero migration SQL**: jsonb shape extension nao toca DB.
- **Coesao**: spots em `spotsToReview` e em `spotsToReentry` sao mesma colecao logica — agrupar campos faz sentido semantico.
- **Stateless enrichment**: campos sempre fresh (recomputa em cada GET).

### Negativas

- **Payload size cresce ~30 bytes por spot** — irrelevante (sessoes tem < 10 spots tipico).
- **Latencia GET aumenta**: + 2 batch queries (`spotsByIds`, `activeReentryCards`). Estimativa: < 30ms p95 com indices.
- **Implementacao precisa cuidado**: enrichment nao deve sobrescrever campo existente em jsonb persisted (e read-only enrichment, nao write).

### Neutras

- Sprint 4+ pode considerar caching enrichment se p95 piorar (Map TTL 5min, lesson #21 invalidator pos-grade/POST-reentry).

---

## 4. Confianca

**Alta.** Pattern de shape extension via campos opcionais em jsonb e padrao Grindfy ja usado (e.g., `users.home_layout_settings` ADR-119, `coach_session_insights.insights_jsonb` Sprint 2 RF-4 ja aceita campos opcionais). Backwards compat e garantida por design Zod (`.optional()`).
