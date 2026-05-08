# ADR-130 — Idempotency de auto_lesson via janela 24h em (user_id, lesson_id)

- Status: Aprovado
- Data: 2026-05-08
- Sprint: estudos-habito-1
- Decision owner: system-architect
- Related: spec `Docs/specs/estudos-habito-1.md` §RF-1.4, ADR-114 (consume tracking via library_events), ADR-126 (study_sessions_v2)

---

## 1. Contexto

Spec RF-1.2 prepara enum `source='auto_lesson'` no schema do Sprint 1, embora o trigger Mux real (ADR-114) so seja wirado em Sprint 2 (Estudos-Habito-2). O Sprint 1 precisa garantir que:

1. O backend aceita `source='auto_lesson'` ja em Zod (forward compat).
2. O schema esta preparado para a regra de idempotency: "Trigger Mux >=80% chama POST /api/study-sessions; se ja chamou nas ultimas 24h para a mesma `lesson_id`, NAO cria nova row — faz UPDATE incremental do `duration_minutes`."

Pergunta arquitetural: **como modelar essa janela de idempotency?**

Opcoes:
- (a) **UNIQUE constraint** `(user_id, lesson_id, date_trunc('day', registered_at))` — DB enforce mas semantica "day boundary UTC" pode dividir uma session que cruza meia-noite em duas linhas.
- (b) **Janela rolling 24h** verificada em codigo (sem UNIQUE) — flexivel mas sem DB-level guarantee.
- (c) **Hibrido** — sem UNIQUE, mas indice parcial `(user_id, lesson_id) WHERE source='auto_lesson'` + check em codigo com `registered_at > now() - 24h`.

Sprint 1 NAO TEM trigger ativo. Decisao precisa ser robusta para Sprint 2 mas nao adicionar complexidade DB premature.

---

## 2. Decisao

**Janela rolling 24h verificada em codigo via lookup pelo indice parcial `idx_ssv2_user_lesson_partial` (ja definido em ADR-126). Sem UNIQUE constraint.** A logica vive no handler `POST /api/study-sessions` quando `source='auto_lesson'`:

```typescript
async function createAutoLessonSession(input: AutoLessonInput): Promise<StudySessionV2> {
  return await db.transaction(async (tx) => {
    // Lookup janela rolling 24h
    const existing = await tx.select().from(studySessionsV2)
      .where(and(
        eq(studySessionsV2.userId, input.userId),
        eq(studySessionsV2.lessonId, input.lessonId),
        eq(studySessionsV2.source, 'auto_lesson'),
        gt(studySessionsV2.registeredAt, sql`NOW() - INTERVAL '24 hours'`),
        isNull(studySessionsV2.deletedAt),
      ))
      .for('update')                                  // lock para evitar race
      .limit(1)
      .then(r => r[0]);

    if (existing) {
      // UPDATE incremental se progress_pct aumentou
      const newDuration = Math.max(existing.durationMinutes, input.durationMinutes);
      if (newDuration > existing.durationMinutes) {
        await tx.update(studySessionsV2)
          .set({ durationMinutes: newDuration, updatedAt: new Date() })
          .where(eq(studySessionsV2.id, existing.id));
      }
      return { ...existing, durationMinutes: newDuration };
    }

    // INSERT nova row
    const id = nanoid();
    const inserted = await tx.insert(studySessionsV2).values({
      id, userId: input.userId, mode: 'lesson', source: 'auto_lesson',
      status: 'completed', themeId: input.themeId, lessonId: input.lessonId,
      durationMinutes: input.durationMinutes, registeredAt: new Date(),
      // ...
    }).returning().then(r => r[0]);

    await bumpStudyStreak(tx, input.userId, inserted.registeredAt);     // ADR-128
    return inserted;
  });
}
```

### 2.1 Indice usado

Definido em ADR-126:

```sql
CREATE INDEX idx_ssv2_user_lesson_partial
  ON study_sessions_v2(user_id, lesson_id, registered_at DESC)
  WHERE lesson_id IS NOT NULL;
```

Query do lookup hits o indice (filtros user_id + lesson_id; `WHERE source='auto_lesson'` re-filtrado em runtime — cardinalidade pequena por user/lesson, ok). Para casos extremos (user com 100+ sessoes para mesma lesson em 24h, irrealista), explain analyze pode justificar indice mais especifico.

### 2.2 Tratamento de race condition

`SELECT ... FOR UPDATE` no lookup garante que dois POSTs concurrentes para mesma `(user, lesson)` em 24h serializam — segundo POST le o UPDATE do primeiro e nao cria duplicate. Custo: lock de ~5-50ms na row. Para founder N=1, irrelevante.

### 2.3 Fallback se window > 24h

Se a janela passou (user assistiu a mesma aula 25h depois), trigger cria **nova row**. Aceito — eh comportamento esperado (review da aula no dia seguinte = nova session).

### 2.4 Sprint 1 impact

Sprint 1 NAO precisa implementar a logica acima — apenas:

1. Aceitar `source='auto_lesson'` no Zod enum (forward compat).
2. Indice parcial `idx_ssv2_user_lesson_partial` criado na migration `0052_study_sessions_v2.sql` (ADR-126).
3. Sprint 2 cria handler `createAutoLessonSession` reusing o storage primitive.

---

## 3. Opcoes Consideradas

### Opcao A: UNIQUE `(user_id, lesson_id, date_trunc('day', registered_at))`

- **Pros:** DB enforce; impossivel duplicar.
- **Cons:** "day" eh UTC date — session que comeca 23:50 UTC e segunda call vem 00:30 UTC do dia seguinte vira 2 rows (regra "24h window" violada); limita a 1 row/dia mesmo se user assiste 2 vezes legitimamente; rigido demais.

### Opcao B: UNIQUE `(user_id, lesson_id)` simples (1 row para sempre)

- **Pros:** super simples.
- **Cons:** user nunca pode ter 2 study_sessions auto_lesson para mesma aula (review semana seguinte = bloqueado); spec quer permitir multiplas com janela 24h.

### Opcao C (escolhida): Lookup rolling 24h em codigo + indice parcial + FOR UPDATE

- **Pros:** flexivel; semantica precisa "rolling 24h"; aceita re-watch dia seguinte; DB indice + FOR UPDATE garantem consistencia.
- **Cons:** logica vive em codigo (testavel via fixtures de tempo); requer transaction/lock por insert auto_lesson.

### Opcao D: Externa — tabela `auto_lesson_attempts` com TTL Postgres

- **Pros:** explicita.
- **Cons:** over-engineered; PG nao tem TTL nativo; 1 cron extra; nao adiciona valor sobre Opcao C.

---

## 4. Consequencias

**Positivas:**
- Schema simples (nenhuma constraint nova alem do que ADR-126 ja preve).
- Logica testavel com fixtures de tempo (`vi.useFakeTimers()`).
- Sprint 1 forward-compat: aceita `source='auto_lesson'` sem ativar trigger.
- Sprint 2 reusa primitive sem refactor.

**Negativas:**
- Sem DB-level guarantee — se codigo bugar, duplicates podem entrar. Mitigar via testes (cenario "concurrent 5x in 1 minute → 1 row created").
- FOR UPDATE adiciona contention. Para auto_lesson, low frequency (uma aula por user por sessao); ok.

**Neutras:**
- Sprint 2 (test-writer) precisa fixture de tempo + 2 testes:
  - "duas calls em 23h → 1 row, durationMinutes incrementa"
  - "duas calls em 25h → 2 rows separadas"

---

## 5. Confianca

**Alta.** Padrao "rolling window via codigo + lock" eh largamente usado (Stripe idempotency keys com TTL similar; Anthropic API; rate limiters). FOR UPDATE PG eh idiomatic. Spec RF-1.4 explicita: "Repeat call com mesmo lesson_id em 24h NAO cria nova; faz UPDATE incremental". Sprint 1 entrega schema/indice — Sprint 2 wirea logica trivialmente.

---

## 6. Anexos

- Indice: ADR-126 §2.3
- Spec: `Docs/specs/estudos-habito-1.md` §RF-1.4 ("Idempotency e duplicates")
- ADR-114 (consume tracking) — Sprint 2 vai usar `library_events.event_type='auto_lesson_logged'` em paralelo ao insert de `study_sessions_v2`
