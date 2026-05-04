# ADR-111: Coach Lesson Recommendation — schema dedicado e ciclo semanal

## Status
Aceito

## Data
2026-05-03

## Contexto

Sub-spec `home-reform-4-item-4-coach-recommendation` introduz uma recomendacao
semanal curada pelo Coach IA na zona "Acao Imediata" da Home. A recomendacao
substitui o card `LibraryResume` (deletado por estar quebrado) e precisa
satisfazer ao mesmo tempo:

1. **1 recomendacao por user por semana** — ciclo previsivel (segunda 06:00 BRT
   reset). Garantia anti-duplicata mesmo se cron re-disparar.
2. **Auditabilidade** — qual leak motivou, qual snapshot de analytics o Coach
   viu, qual fonte (Coach IA vs fallback popular vs admin override). Permite
   replay e analise de relevancia retroativa.
3. **Ciclo de vida explicito** — gerada → ativa → consumida OU dispensada →
   inativa ate proxima segunda. Estados terminam mas a row persiste para
   analise.
4. **FK rigidas com a Biblioteca** — recomendacao aponta para `library_lessons`
   e respeita `user_lesson_access`. Lesson despublicada NAO pode quebrar o card.
5. **Pull comercial** — user free recebe recomendacao mesmo sem acesso, com
   CTA "Comprar acesso". Coluna NAO precisa armazenar entitlement (resolvido
   via join no GET endpoint), mas o `lessonId` precisa permanecer estavel.

A questao central: onde persistir a recomendacao? Reaproveitar `coach_actions`
(ADR-077) seria barato mas mistura semantica de "tool call audit" com
"recomendacao curada", quebrando query patterns e indices. Reaproveitar
`coach_nudge_log` (ADR-085) seria pior — nudge eh mensagem efemera com
frequency cap; recomendacao eh entidade persistente com lifecycle proprio.
Persistir em `notifications` perderia a vinculacao `lessonId` + `weekStartDate`
+ `inputSummary`.

## Opcoes Consideradas

### Opcao 1: Tabela nova `coach_lesson_recommendations`
- **Pros:**
  - Schema dedicado: 1 row = 1 recomendacao com semantica clara.
  - Indices proprios (`(userId, weekStartDate)` UNIQUE + `(userId, dismissedAt,
    consumedAt)`) sem poluir indices de outras tabelas.
  - FK explicitas para `users` (CASCADE) e `library_lessons` (CASCADE) garantem
    integridade.
  - `inputSummary` jsonb fica isolado, sem inflar payloads de outras consultas.
  - Permite evolucao independente (ex: adicionar `chatSessionId` no MVP +
    futura coluna `score_relevance`).
- **Contras:**
  - +1 tabela no schema (15a tabela no dominio Coach).
  - +1 migration.

### Opcao 2: Reaproveitar `coach_actions` com `tool_name = 'recommend_lesson'`
- **Pros:** zero schema novo.
- **Contras:**
  - `coach_actions` modela tool call audit (input/result/payload_before/after).
    Recomendacao nao eh tool call — quebra a state machine
    `pending → executing → completed`.
  - Sem garantia anti-duplicata semanal (UNIQUE composta exigiria adaptacao do
    schema generico).
  - Queries de "recomendacao ativa do user" precisariam filtrar `tool_name +
    status + JSON path` — lentas e fragis.
  - `affected_entity_id` nao acomoda `weekStartDate` sem hack.

### Opcao 3: Reaproveitar `coach_nudge_log`
- **Pros:** ja modela "envio para user com cycleKey".
- **Contras:**
  - `coach_nudge_log` eh efemero (frequency cap drives semantica). Recomendacao
    precisa permanecer mesmo apos consumida.
  - Nao tem FK para `library_lessons` — tudo em `body_preview` text.
  - Status `sent/engaged/dismissed/snoozed` colide com nosso ciclo
    `active/dismissed/consumed`.

### Opcao 4: `notifications` generica
- **Contras:** sem `lessonId` FK, sem `inputSummary`, sem ciclo semanal. Vira
  string sem estrutura.

## Decisao

**Opcao 1 — tabela nova `coach_lesson_recommendations`** com 8 colunas + 3
indices, FK CASCADE em `users.userPlatformId` e `library_lessons.id`.

Schema final:

```ts
export const coachLessonRecommendations = pgTable(
  "coach_lesson_recommendations",
  {
    id: varchar("id").primaryKey().notNull(),                     // nanoid
    userId: varchar("user_id").notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    lessonId: varchar("lesson_id").notNull()
      .references(() => libraryLessons.id, { onDelete: "cascade" }),
    weekStartDate: date("week_start_date").notNull(),
    reason: text("reason").notNull(),
    source: varchar("source", { length: 20 }).notNull(),          // 'coach' | 'fallback_leak_tag' | 'fallback_popular' | 'fallback_recent' | 'manual'
    inputSummary: jsonb("input_summary"),
    chatSessionId: varchar("chat_session_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    dismissedAt: timestamp("dismissed_at"),
    consumedAt: timestamp("consumed_at"),
  },
  (t) => [
    uniqueIndex("uq_coach_rec_user_week").on(t.userId, t.weekStartDate),
    index("idx_coach_rec_user_active").on(t.userId, t.dismissedAt, t.consumedAt),
    index("idx_coach_rec_lesson").on(t.lessonId),
  ],
);
```

**Migration:** `migrations/0042_coach_lesson_recommendations.sql` (proxima
sequencial apos `0041_news_sources_homepage_url.sql`).

**Ciclo semanal:**
- `weekStartDate` = segunda-feira 00:00 BRT calculada por `getCurrentWeekStartBRT()`
  (helper RF-12).
- Cron `generateCoachRecommendations` (segunda 06:00 BRT, ADR-112) insere 1 row
  por user com `weekStartDate = segunda atual`.
- GET endpoint filtra sempre por `weekStartDate = current` — recs antigas nao
  vazam.
- UNIQUE `(userId, weekStartDate)` garante idempotencia mesmo se cron
  re-executar.
- `dismissedAt` e `consumedAt` sao mutuamente terminais (apos 1 deles, GET
  retorna `recommendation: null` com `status` correspondente).

**Source enum (logico, nao Postgres ENUM):**
- `'coach'` — Anthropic respondeu JSON valido com lesson_id pertencente ao
  catalog.
- `'fallback_leak_tag'` — Coach falhou, mapping leak→tag (ADR-113) escolheu.
- `'fallback_popular'` — Coach + leak→tag falharam, escolha por popularidade.
- `'fallback_recent'` — Catalog popular vazio, escolha entre lessons mais
  recentes (R7 da spec).
- `'manual'` — Endpoint admin `POST /api/admin/coach/recommendations/regenerate`
  override.

Mantemos como `varchar(20)` (nao Postgres ENUM) para evolucao sem migration —
mesma convencao usada em `coach_nudge_log.status` (ADR-085).

## Consequencias

**Positivas:**
- Anti-duplicata garantida por banco (UNIQUE), nao por logica de aplicacao.
- Auditabilidade total: `inputSummary` jsonb permite replay 100% do que o Coach
  viu na geracao.
- FK CASCADE protege contra dados orfaos (deletar user ou lesson limpa as
  recs).
- Ciclo previsivel para o frontend: GET sempre filtrado por semana corrente.
- `chatSessionId` ja previsto para feature futura "Discutir com Coach" sem
  precisar de migration.

**Negativas:**
- +1 tabela no dominio Coach (15a). Mitigacao: documentada no
  `data-model-index.md` no grupo Coach AI.
- Crescimento linear: `users * 52 weeks/ano` rows. Para 10k users = 520k
  rows/ano. Aceitavel sem TTL nos primeiros 3 anos. Re-avaliar em 2029 se
  passar de 1.5M rows.

**Neutras:**
- `inputSummary` jsonb pode conter PII (ROI, volume). Privacy garantida por
  ownership middleware nos endpoints (RF-05/06/07) e admin-only (RF-08).
- `dismissedAt + consumedAt` ambos NULL = ativa. Convencao explicita no GET
  endpoint logica.

## Confianca
Alta — padrao bem estabelecido (cooldown_logs, starred_hands, primedope_runs
seguem mesma anatomia: tabela dedicada com FK CASCADE + indices proprios).
