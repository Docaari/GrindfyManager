# ADR-136 — Tabela `spot_reentry_cards` + algoritmo SM-2 simplificado

- Status: Aprovado
- Data: 2026-05-08
- Sprint: spot-anki-reentry-3 (RF-2)
- Decision owner: system-architect
- Related: spec `Docs/specs/spot-anki-reentry-3.md`, ADR-057 (`starred_hands` infra), ADR-087 (job runner timezone-aware), ADR-126 (`study_sessions_v2`), ADR-133 (`coach_session_insights`)
- Diagramas: `Docs/architecture/data-model-spot-anki-reentry-3.mermaid`, `feature-flow-srs-grade.mermaid`

---

## 1. Contexto

A spec Spot-Anki-Reentry-3 (RF-2) introduz Spaced Repetition System (SRS) para spots de poker. Necessidades:

1. **Storage durable** de cards SRS com estado (interval, ease, review_count) por (user, spot).
2. **Algoritmo de scheduling** que:
   - Aceite 4 grades estilo Anki: `again | hard | good | easy`.
   - Suporte cards novos (initial interval 1-2d) + cards maduros (interval ate ~120d).
   - Tenha caps que evitem drift exotico (ease too low/high, interval > anos).
   - Seja determinista + facil de testar matematicamente.
3. **Idempotency** por (user, spot) para evitar dups quando coach panel + cron + manual_add competem.

Spec de partida menciona "SM-2 simplificado". Quatro candidatos foram avaliados.

### Opcoes consideradas

#### Opcao 1: Lib externa (`ts-fsrs`, `anki-srs-js`)

Importar lib npm madura.

- **Pros:** zero codigo, testado, feature-complete (FSRS, dampening, fuzz).
- **Contras:** dependencia externa (build size + supply chain), API mismatch (campos da lib raramente casam 1:1 com nossos schemas), impossivel adaptar caps/business rules sem fork. FSRS pede 13 parametros — overkill MVP.

Rejeitado: complexidade > beneficio para 4-grade simplificado.

#### Opcao 2: SuperMemo SM-17 / FSRS

Algoritmo state-of-art (Open Spaced Repetition).

- **Pros:** retencao otimizada, respaldado por pesquisa.
- **Contras:** 13+ parametros (difficulty, stability, retrievability, weights), exige optimizer ML para tuning per-user. Spec de poker NAO precisa precisao medica de Anki — usuarios revisitam por escolha, nao para passar prova.

Rejeitado: over-engineered para MVP (R1 da spec — algoritmo drift e maior risco que sub-optimal interval).

#### Opcao 3: Leitner system

Caixas N (1, 3, 7, 30 dias). Promover/demote em acerto/erro.

- **Pros:** simples, intuitivo.
- **Contras:** sem ease factor — todos cards igual velocidade; nao distingue user que sempre acerta vs que so passa. UX 4 grades nao mapeia bem em 2 outcomes Leitner.

Rejeitado: spec exige 4 grades distintas com efeitos diferentes.

#### Opcao 4: SM-2 simplificado hand-rolled (ESCOLHIDO)

Implementacao caseira do classic SM-2 (Anki ate v2.1) com simplificacoes pragmaticas.

- **Pros:** Anki original, 30+ anos de track record. Logica em ~30 linhas TS. Facil testar matematicamente. Caps explicitos protegem contra drift. Sem dependencia externa. Total controle sobre ease/interval/grading.
- **Contras:** menos otimizado que FSRS. Sem fuzz randomico (cards podem clusterizar no mesmo dia para usuario que adicionou batch).

Aceitado: trade-off correto para MVP killer-feature. Otimizacao defer Sprint 4+.

---

## 2. Decisao

### 2.1 Tabela `spot_reentry_cards`

Schema completo:

```sql
CREATE TABLE spot_reentry_cards (
  id              VARCHAR(21) PRIMARY KEY NOT NULL,
  user_id         VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  spot_id         VARCHAR(21) NOT NULL REFERENCES starred_hands(id) ON DELETE CASCADE,
  source          VARCHAR(32) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- SRS state
  next_review_at  TIMESTAMPTZ NOT NULL,
  interval_days   NUMERIC(8,2) NOT NULL,
  ease_factor     NUMERIC(3,2) NOT NULL DEFAULT 2.5,

  -- tracking
  review_count    INTEGER NOT NULL DEFAULT 0,
  correct_count   INTEGER NOT NULL DEFAULT 0,
  last_review_at  TIMESTAMPTZ,
  last_grade      VARCHAR(8),

  -- lifecycle
  archived_at     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_srs_source CHECK (source IN ('manual_add', 'drill_gto_difficult_spot', 'coach_session_insight')),
  CONSTRAINT chk_srs_grade CHECK (last_grade IS NULL OR last_grade IN ('again', 'hard', 'good', 'easy')),
  CONSTRAINT chk_srs_interval CHECK (interval_days > 0 AND interval_days <= 120),
  CONSTRAINT chk_srs_ease CHECK (ease_factor >= 1.3 AND ease_factor <= 3.0),
  CONSTRAINT chk_srs_review_count CHECK (review_count >= 0),
  CONSTRAINT chk_srs_correct_count CHECK (correct_count >= 0 AND correct_count <= review_count)
);

CREATE INDEX idx_srs_user_next_review
  ON spot_reentry_cards (user_id, next_review_at)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX uq_srs_user_spot_active
  ON spot_reentry_cards (user_id, spot_id)
  WHERE archived_at IS NULL;

CREATE INDEX idx_srs_user_last_review
  ON spot_reentry_cards (user_id, last_review_at)
  WHERE last_review_at IS NOT NULL;
```

**Notas decisao:**

- `id` `VARCHAR(21)` (nanoid) — convencao consistente Grindfy (CLAUDE.md §8).
- `interval_days` `NUMERIC(8,2)` — fracoes (hard = `prev * 1.2` pode dar 1.2, 1.44, 1.728…). Cap 120 (4 meses) — alem disso o spot e "esquecido" e renovacao manual e melhor.
- `ease_factor` `NUMERIC(3,2)` — caps `[1.3, 3.0]` matchando Anki classic. Default 2.5 = ponto neutro SM-2.
- `last_grade` armazenado para metricas (accuracyLast7Days). Nao precisa enum DB — `VARCHAR(8) CHECK` basta.
- `archived_at` soft-delete: preserva historico para auditoria + permite recriacao limpa via UNIQUE parcial. DELETE row apenas via CASCADE de `users` ou `starred_hands`.
- UNIQUE parcial `uq_srs_user_spot_active` garante 1 card ativo por (user, spot) — endpoint POST e idempotent (409 + return existing).

### 2.2 Algoritmo SM-2 simplificado

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
      intervalDays = 1;
      easeFactor = Math.max(1.3, easeFactor * 0.8);
      break;
    case 'hard':
      intervalDays = intervalDays * 1.2;
      easeFactor = Math.max(1.3, easeFactor * 0.9);
      break;
    case 'good':
      intervalDays = intervalDays * easeFactor;
      // ease unchanged
      break;
    case 'easy':
      intervalDays = intervalDays * easeFactor * 1.3;
      easeFactor = Math.min(3.0, easeFactor * 1.15);
      break;
  }

  intervalDays = Math.max(1, Math.min(120, intervalDays));
  intervalDays = Math.round(intervalDays * 100) / 100;
  easeFactor = Math.round(easeFactor * 100) / 100;

  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + intervalDays * 86400_000);

  return { nextIntervalDays: intervalDays, newEaseFactor: easeFactor, nextReviewAt };
}
```

**Diferencas vs Anki classic SM-2:**

| Aspecto | Anki SM-2 classic | Grindfy SM-2 simplified |
|---|---|---|
| Grades | 1-4 (Again/Hard/Good/Easy) | Igual |
| Initial interval cards novos | 1d, 6d (graduating) | 1d ou 2d (por source, ADR-139) |
| Ease step | ±0.15 absoluto | multiplicador ±15% (ease *= 0.8/0.9/1/1.15) |
| Fuzz | ±25% randomico apos revisao | **Sem fuzz** (MVP) — pode cluster cards mesmo dia |
| Lapses (multiple again) | New steps relearning | Reset interval=1d direto |
| Cap interval | sem cap (Anki: ate 100 anos) | 120d hard cap |
| Cap ease | min 1.3 | `[1.3, 3.0]` |

**Justificativa caps:**

- **Interval 120d**: alem de 4 meses, spot fica obsoleto (game evolui, players mudam). Ressuscitar via "Recriar card" manual e melhor que ressurfacing automatico de spot velho.
- **Ease [1.3, 3.0]**: protege contra drift extremo. User que sempre acerta nao vira "card revisto a cada 5 anos". User que sempre erra nao trava em loop interval=1d (ease 1.3 = interval cresce devagar mas cresce).

### 2.3 Initial values por source

Ver ADR-139 (initial interval por source).

---

## 3. Consequencias

### Positivas

- **Zero deps externa** — algoritmo em 30 linhas TS, testavel matematicamente (testes em `tests/server/spot-reentry-sm2.test.ts`).
- **Determinismo total** — mesmo input → mesmo output. Sem fuzz randomico, mesmo card+grade sempre produz o mesmo schedule.
- **Caps protegem prod** — drift catastrofico (ease=10000, interval=anos) impossivel.
- **UNIQUE parcial idempotente** — POST endpoint e bulk operations seguros para retry sem dups.
- **Soft-delete preserva auditoria** — debug "por que esse card foi removido?" via timestamp.

### Negativas

- **Sem fuzz**: usuario que adiciona 5 spots num batch revisara todos no mesmo dia ate primeira sessao (depois desincroniza). Mitigavel: cron cap 5/dia ja distribui drill spots.
- **Algoritmo nao optimizado** — vs FSRS, retencao pode ser ~10% inferior. Aceitavel MVP — usuario controla via `archived_at` se quiser parar revisitar.
- **Cap 120d e arbitrario** — usuario power que quer revisitar coup classic depois de 1 ano precisa recriar card. **Aceitavel:** spec diz "spot fica obsoleto"; alem disso, recriar card em 2 cliques.
- **Mais 1 tabela** (~12 colunas + 3 indices) no schema (ja em 60+ tabelas).

### Neutras

- Algoritmo simplified pode ser refatorado para FSRS em Sprint 4+ sem mudar schema (campos `ease_factor`, `interval_days` cobrem ambos). Path migracao limpo.

---

## 4. Confianca

**Alta.** SM-2 e standard de facto em SRS (Anki, SuperMemo desktops, Mnemosyne). Caps e business rules debatidos com spec founder. Trade-offs explicitos. Algoritmo cobertura completa por testes matematicos (4 grades × 5 estados = 20 casos).
