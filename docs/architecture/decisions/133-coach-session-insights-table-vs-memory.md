# ADR-133 — Cache de `coach_session_insights` em tabela dedicada (vs memoria/Redis)

- Status: Aceito
- Data: 2026-05-08
- Sprint: estudos-coach-biblio-2
- Decision owner: system-architect
- Related: spec `Docs/specs/estudos-coach-biblio-2.md` §RF-4, ADR-019 (coach prompt cache), ADR-024 (tool result wrapping), ADR-115 (recommendation prompt cache)
- Diagramas: `Docs/architecture/data-model-estudos-coach-biblio-2.mermaid`, `feature-flow-session-insights.mermaid`
- Migration: `migrations/0056_coach_session_insights.sql`

---

## 1. Contexto

RF-4 do sprint Estudos-Coach-Biblio-2 introduz **insights pos-sessao /grind-live**: apos `POST /api/grind-sessions/:id/finalize`, user pode abrir `/grind-live/:id/recap` que dispara `GET /api/coach/session-insights/:sessionId`. Endpoint chama Coach com contexto de torneios + spots + focusStats e retorna `SessionInsights` estruturado (summary, topHands, suggestedLessons, spotsToReview, focusStatsHighlight).

Coach inference dura **5-12s** (cache miss). Repetidas chamadas no recap navegando seria caro ($0.05-0.10/insight). Precisamos cache.

3 opcoes de storage:

1. **Em-memoria** `Map<sessionId, {data, expiresAt}>` no process Node. TTL 24h.
2. **Tabela dedicada** `coach_session_insights` com `expires_at`. PG persistente.
3. **Redis** (nao instalado no projeto Sprint 2 — Sprint News-3 usa node-cron in-process; bankroll usa em-memoria).

Cada uma tem implicacoes diferentes para **disponibilidade** (process restart limpa Map), **auditoria** (founder quer ver "qual insight Coach gerou X dias atras?"), **portabilidade** (multi-process futuro precisaria sync), e **custo** (Redis = nova dep).

---

## 2. Decisao

**Cache em tabela `coach_session_insights` dedicada com `expires_at` (24h) + `UNIQUE (grind_session_id)` + INSERT ON CONFLICT DO UPDATE para race-safe.**

### 2.1 Estrutura final

```sql
CREATE TABLE coach_session_insights (
    id                varchar(21) PRIMARY KEY,
    user_id           varchar(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    grind_session_id  varchar(21) NOT NULL UNIQUE
                          REFERENCES grind_sessions(id) ON DELETE CASCADE,
    insights_jsonb    jsonb NOT NULL,
    generated_at      timestamptz NOT NULL DEFAULT now(),
    expires_at        timestamptz NOT NULL,         -- generated_at + 24h
    cost_tokens_used  integer,
    model             varchar(64),                  -- ex: claude-opus-4-7
    prompt_version    varchar(32),                  -- rastreabilidade
    tokens_in         integer,
    tokens_out        integer,
    regenerated_count integer NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- 1 insight por sessao (idempotency)
CREATE UNIQUE INDEX uq_csi_session ON coach_session_insights (grind_session_id);
-- listagem por user (auditoria, debug)
CREATE INDEX idx_csi_user_generated ON coach_session_insights (user_id, generated_at DESC);
-- cleanup batch (futuro, se quiser purgar > 30d)
CREATE INDEX idx_csi_expires ON coach_session_insights (expires_at);
```

### 2.2 Logica de cache

```pseudo
GET /api/coach/session-insights/:sessionId
  1. ownership + finalized check.
  2. SELECT FROM coach_session_insights WHERE grind_session_id=$1 AND expires_at > now()
     -> if found: return { insights, cached: true, expiresAt }.
  3. else: collect context, call Coach, validate Zod.
     INSERT INTO coach_session_insights (..., expires_at = now() + interval '24 hours')
     ON CONFLICT (grind_session_id) DO UPDATE
       SET insights_jsonb = EXCLUDED.insights_jsonb,
           generated_at   = now(),
           expires_at     = now() + interval '24 hours',
           cost_tokens_used = EXCLUDED.cost_tokens_used,
           regenerated_count = coach_session_insights.regenerated_count + 1.
     return { insights, cached: false, expiresAt }.

POST /api/coach/session-insights/:sessionId/regenerate (rate limit 3/sessao)
  Same as miss path. ON CONFLICT DO UPDATE sempre. Bumpa regenerated_count.
```

### 2.3 Race condition

User abre recap em 2 tabs ao mesmo tempo. Sem cache → 2 SELECTs returnam vazio → 2 chamadas Coach (custo 2x) → 2 INSERTs. UNIQUE `grind_session_id` faz uma falhar com 23505 conflict.

Mitigacao via `INSERT ... ON CONFLICT DO UPDATE`: o segundo INSERT vira UPDATE. Custo 2x da chamada Coach mas DB consistente. Aceito (raro; soluvel futuro com advisory lock se virar problema).

---

## 3. Opcoes Consideradas

### Opcao A: Em-memoria `Map<sessionId, {data, expiresAt}>`

- **Pros:** rapido (zero query DB para hit); zero schema novo; TTL trivial.
- **Cons:** **process restart limpa cache** — user reabre recap apos deploy = nova chamada Coach (custo 2x dia de deploy); nao audita historico (founder pediu "qual insight foi gerado pra session X?" = nao temos resposta sem cache); multi-process futuro (deploy horizontal) precisaria sync; sem cap por user — Map cresce indefinido (precisa LRU manual).

### Opcao B (escolhida): Tabela dedicada PG

- **Pros:** sobrevive restart; auditoria completa (founder pode debug "que insight foi dado?"); portavel (multi-process safe via UNIQUE); permite analytics de custo (`cost_tokens_used` aggregate); cleanup batch eh trivial (`DELETE WHERE expires_at < now() - interval '7 days'`); `regenerated_count` da signal de "Coach esta dando insight ruim, user clica regenerate".
- **Cons:** 1 query DB por hit (~10ms p95) — irrelevante face aos 5-12s do cache miss; schema novo (1 tabela + 3 indices); migration adicional.

### Opcao C: Redis

- **Pros:** ultra-fast (sub-ms); TTL nativo; multi-process safe.
- **Cons:** nao instalado; nova dep + nova instancia em prod; Sprint 2 nao tem outras necessidades de Redis (bankroll em-memoria, news in-memory); custo overkill para feature N=1.

### Opcao D: Reusar `coach_messages` (chat history)

- **Pros:** zero schema novo.
- **Cons:** mistura insights pos-sessao com chat conversation messages; dificulta query "insights da sessao X" (precisaria filter em jsonb metadata); semanticamente errado.

---

## 4. Consequencias

**Positivas:**
- Cache sobrevive restart/deploy — zero re-cobranca de tokens em janela 24h.
- Auditoria + debug founder ("qual insight Coach gerou em sessao X em Y data?").
- Analytics de custo Coach por feature (`SUM(cost_tokens_used) WHERE generated_at > X` para insights vs plan vs chat).
- Race-safe via UNIQUE `grind_session_id`.
- `regenerated_count` da signal qualidade Coach.

**Negativas:**
- 1 tabela nova — schema delta.
- 1 query DB por hit (~10ms) vs zero em Map. Aceitavel face aos 5-12s do miss.
- Cleanup batch precisa cron futuro (nao Sprint 2 — `expires_at` index permite cleanup quando necessario).

**Neutras:**
- Tamanho linha estimado: ~3KB (insights_jsonb com 3 hands + 2 lessons + 5 spots + 3 stats). 1000 users × 100 sessoes/mes = 300MB/mes — aceitavel.
- `prompt_version` permite re-gerar insights antigos com prompt novo se necessario (debug A/B).

---

## 5. Confianca

**Alta.** Pattern "tabela dedicada com expires_at" ja foi usado em `coach_lesson_recommendations` (ADR-111). UNIQUE composite + INSERT ON CONFLICT DO UPDATE eh padrao bem testado (lesson #7 + ADR-038 optimistic concurrency).

Risco "schema cresce sem cleanup" eh mitigado por: Sprint 2 nao precisa cleanup (founder N=1 + beta = pequeno volume); index `idx_csi_expires` permite cleanup batch trivial quando necessario.

---

## 6. Anexos

- Diagrama ER: `Docs/architecture/data-model-estudos-coach-biblio-2.mermaid`
- Diagrama sequence: `Docs/architecture/feature-flow-session-insights.mermaid`
- Migration: `migrations/0056_coach_session_insights.sql`
- Spec: `Docs/specs/estudos-coach-biblio-2.md` §RF-4
