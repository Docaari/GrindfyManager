# ADR-073 — Entitlements por aula (nao por curso/modulo) via `user_lesson_access` com source enum

- Status: Proposto
- Data: 2026-05-01
- Sprint: Biblioteca-1 (RF-01 + RF-04)
- Decision owner: system-architect (autonomous; ratifica founder D4 — checkout fora de MVP, libera manual)
- Related: ADR-072 (mux-video-integration — gating do playback-token), ADR-074 (cross-format progress sync), Spec 4 (checkout futuro consome este modelo)
- Spec: `Docs/specs/biblioteca-spec-1.md` RF-01.1.5, RF-04, D7

## Contexto

A Biblioteca precisa controlar quem acessa o que. Modelos comuns:

1. **Acesso por curso** — 1 row `user_course_access(userId, courseId)`.
2. **Acesso por modulo** — 1 row `user_module_access(userId, moduleId)`.
3. **Acesso por aula** (granular) — 1 row `user_lesson_access(userId, lessonId)`.
4. **Tag-based** — `user_entitlements(userId, tag)` + lesson tem
   `requiredTag` — flexivel mas cookie complexo.

Founder ja decidiu (D4): **MVP nao tem checkout Stripe.** Acesso libera
manual via admin endpoint. Mas o modelo precisa **escalar para futuros
modos**: bundles ($N por modulo), assinatura mensal (acesso a tudo),
purchase individual ($X por aula avulsa).

A questao arquitetural e: **qual unidade de granularidade salvar no DB
hoje** para que Spec 4 (checkout) e Spec 6 (marketplace creator) se
encaixem sem migration dolorosa?

### Forcas em jogo

- **Spec 4 (checkout):** Stripe + bundles + planos Premium Annual.
  Bundle = "Curso 00 inteiro por $X". Premium = "tudo da Biblioteca".
  Avulso = "1 aula por $Y".
- **Spec 6 (marketplace creator):** terceiros sobem aulas; founder
  cobra comissao. Cada creator pode vender aulas separadas, modulos,
  ou cursos.
- **Refund (Spec 4 D5):** "7 dias se consumo < 25%". Calculo do %
  precisa por **aula**, nao por curso (consumo de 1 aula em curso de
  46 = 2.2%, cabe refund se compra so essa aula).
- **Performance:** query `hasAccess` sera chamada **por lesson** no
  catalogo + viewer + Coach tool. 1 row por aula × 100k aulas × 1k
  users = 100k rows max — perfeitamente indexado.
- **Lesson #7 (Zod optional + default + back-fill):** mudar
  granularidade no futuro pede migration. Escolher errado agora = dor.
- **Idempotencia:** bundle compra 11 aulas — endpoint nao pode
  duplicar grants. Composite unique resolve.

## Opcoes Consideradas

### Opcao A: `user_lesson_access` (granular por aula) com `source` enum (ESCOLHIDA)

```sql
CREATE TABLE user_lesson_access (
  id varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  lesson_id varchar NOT NULL REFERENCES library_lessons(id) ON DELETE CASCADE,
  source library_access_source NOT NULL,  -- 'admin' | 'purchase' | 'bundle' | 'subscription'
  granted_at timestamp DEFAULT NOW(),
  granted_by varchar,        -- userPlatformId do admin (nullable)
  expires_at timestamp,      -- null = vitalicio
  UNIQUE (user_id, lesson_id)
);
```

`source` enum carrega **a razao** do acesso, viabilizando:
- **Refund por purchase:** se `source='purchase' AND granted_at < 7d
  AND consumo < 25%`, refund elegivel — endpoint deleta row.
- **Subscription expiracao:** `source='subscription' AND expires_at < NOW()`
  — cron remove rows expiradas.
- **Admin grant nao expira** (default null) — nunca tocado por
  refund/expire jobs.
- **Bundle aggregation:** N rows com mesmo `granted_at` + mesmo
  `source='bundle'` permitem agrupar para reporting (futuro).

Quando bundle vendido (Spec 4): backend insere N rows, uma por
lesson do curso, todas com `source='bundle'` + mesmo timestamp.

Quando assinatura ativada (Spec 4 Premium): cron diario insere rows
para todas as lessons publicadas, com `source='subscription' +
expires_at = subscription.endsAt`.

Quando admin libera (RF-04 MVP): admin chama
`POST /api/admin/library/grant-access` com `lessonIds: [...]`,
backend insere N rows com `source='admin' + granted_by = admin_user_id`.

- **Pros:**
  - **Granularidade maxima** — qualquer modo de venda futuro mapeia
    sem migration.
  - **Source preservado** — refund/expire jobs distinguem origens.
  - **Idempotencia simples** — composite unique `(userId, lessonId)`
    bloqueia duplicate inserts. Endpoint admin retorna `alreadyHadAccess++`.
  - **Performance** — query `JOIN user_lesson_access ON ... WHERE
    userId = ?` indexada por user_id.
  - **Refund 25%** — facil calcular consumo por lesson via
    `library_progress`.
  - **Cleanup CASCADE** — deletar user remove todas as access rows.
  - **Audit trivial** — `granted_at` + `granted_by` mostram historico.

- **Contras:**
  - **Volume de rows alto** — bundle de 46 aulas = 46 rows. 100 alpha
    users × 50 aulas = 5k rows. Aceitavel (Postgres aguenta milhoes).
  - **Operacao bundle insere N rows** — TX simples cobre.
  - **Complexidade query "user tem qualquer acesso ao curso?"** — JOIN
    + DISTINCT vs simples lookup. Resolvido por endpoint
    `GET /courses` retornar `hasAnyAccess` calculado server.

### Opcao B: `user_course_access` (granularidade por curso)

1 row por (userId, courseId). Acesso ao curso = acesso a todas suas
aulas.

- **Pros:**
  - Volume baixo (1 row por user × curso).
  - Query `hasAccess` simples.

- **Contras:**
  - **Sem aula avulsa** — nao mapeia modo de venda "$5 por aula".
  - **Refund por aula impossivel** — se user comprou bundle e quer
    refund de 1 aula? Nao tem como gating.
  - **Bundle parcial impossivel** — Curso 00 dividido em "kit basico
    8 aulas" + "kit avancado 38 aulas" exige migration.
  - **Marketplace creator (Spec 6)** — creator vende aula avulsa
    quebra modelo.
  - **Subscription parcial impossivel** — "Premium Bronze = 50% dos
    cursos" exige extender modelo.
  - **Rejeitada por:** comprar simplicidade hoje custa migration
    dolorosa em <12 meses (Spec 4 ou Spec 6).

### Opcao C: Tag-based entitlements

```sql
CREATE TABLE user_entitlements (userId, tag);
CREATE TABLE library_lessons (id, requiredTags text[]);
-- access if intersect(user.tags, lesson.requiredTags) is not empty
```

- **Pros:**
  - Flexivel — qualquer corte (premium, course-00-buyer, bundle-A-buyer).
  - Volume baixo (rows = N tags × users).

- **Contras:**
  - **Refund complexo** — qual tag remover sem afetar outros entitlements?
  - **Audit complexo** — quando user ganhou tag X? Por que?
  - **Lesson nao-publicada por tag obrigatoria** — risco de mismatch
    (lesson nova sem tag fica acessivel a ninguem; lesson antiga sem
    tag obrigatoria fica acessivel a todos).
  - **Query menos intuitiva** — JOIN + INTERSECT vs simples lookup.
  - **Lesson learned #11:** "default minimo em componentes — spec eh
    fonte de verdade". Tag-based abre porta para over-engineering.
  - **Rejeitada por:** flexibilidade vem com custo de complexity nao
    justificada por Spec 1-6 conhecidas.

### Opcao D: Hibrido — `user_lesson_access` + `user_course_access` (denormalizado)

Granular (lesson) + cache de curso para query rapida.

- **Pros:**
  - Granularidade maxima + query fast.

- **Contras:**
  - **Sync de 2 tabelas** — bundle insere N rows lesson + 1 row course.
    Refund inverte.
  - **Source of truth ambigua** — qual e mestre?
  - **Lesson #7 violation:** dual-write classico fonte de inconsistencia.
  - **Rejeitada por:** otimizacao prematura. View materializada (futuro)
    resolve mesmo problema sem dual-write.

## Decisao

**Adotar Opcao A: `user_lesson_access` granular por aula com `source`
enum (`admin | purchase | bundle | subscription`). Composite unique
`(userId, lessonId)`. CASCADE em delete de user/lesson.**

### Detalhes-chave do design

1. **Granularidade por aula** — escala para qualquer modo de venda.
2. **`source` enum** preserva origem para:
   - Refund 25% (`source='purchase'`).
   - Expiracao de assinatura (`source='subscription'` + `expires_at`).
   - Audit (`source='admin'` + `granted_by`).
3. **Composite unique** garante idempotencia — re-grant nao duplica.
4. **`expires_at` nullable** — null = vitalicio. Default no MVP (admin
   grants nao expiram). Spec 4 popula para subscription.
5. **`granted_by` nullable** — populated apenas quando `source='admin'`
   ou `source='purchase'` (Stripe webhook id futuro). Bundle/subscription
   leave null.
6. **Endpoint admin idempotente:** `POST /api/admin/library/grant-access`
   recebe `lessonIds[]`, retorna `{ granted: N, alreadyHadAccess: M, errors: [] }`.
   Cap 500 lessons por chamada (anti-abuse).
7. **Query `hasAccess`** centralized:
   ```ts
   storage.lessonAccessLookup(userId, lessonIds): Map<lessonId, boolean>
   ```
   Single query JOIN, retorna mapa. Usado por endpoint catalogo
   (`/courses/:slug` retorna lessons com `hasAccess`), viewer
   (gating), Coach tool (`recommend_lesson` retorna `hasAccess` por
   lesson).
8. **`hasAnyAccess` em listagem de cursos:**
   ```sql
   SELECT c.*, EXISTS(
     SELECT 1 FROM user_lesson_access a
     JOIN library_lessons l ON l.id = a.lesson_id
     WHERE a.user_id = $userId AND l.course_id = c.id
   ) AS has_any_access
   FROM library_courses c
   WHERE c.is_published = true
   ```
   Resultado cacheable por 60s (lesson learned: cache only on read-heavy).
9. **`granted_by` nullable** — quando subscription/bundle automatizam,
   nao tem human id.
10. **`isPublished = false`** nao bloqueia grant — admin pode preparar
    acesso antes de publicar (alpha test scenario).
11. **CASCADE em user delete + lesson delete** — sem orfaos.

### Tradeoffs aceitos

| Tradeoff | Aceito por que |
|---|---|
| **Volume de rows** | 100 users × 50 aulas = 5k rows. Postgres aguenta milhoes facilmente. |
| **Bundle insere N rows** | Single TX cobre. Custo trivial. |
| **`hasAnyAccess` exige JOIN** | Cacheable 60s; volume baixo. |
| **Sem cache de curso-level** | Otimizacao prematura. Materialized view se virar gargalo. |
| **`source` enum nao-extensivel hoje** | Adicionar valor enum = ALTER TYPE. Aceitavel (5 valores cobrem futuro razoavel). |

### Quando rever esta decisao

- **Volume > 10M rows** — considerar particionamento por user_id range
  ou archive de access expirado.
- **Performance JOIN degradar:** materialized view com refresh on
  insert/delete.
- **Modo de venda novo** (group/team license) — adicionar valor enum
  ou nova coluna `licensee_id`.
- **Marketplace creator (Spec 6):** adicionar `purchased_from_creator_id`
  para split de revenue.

## Consequencias

### Positivas

- **Granularidade maxima** — escala para checkout, bundles, subscription,
  marketplace.
- **Source preservado** para refund + expire + audit.
- **Idempotencia** garantida por composite unique.
- **CASCADE cleanup** automatico.
- **Test fixture trivial** — 1-2 rows por test scenario.
- **Migration zero quando Spec 4 chegar** — endpoint Stripe webhook
  insere com `source='purchase'` ou `'bundle'`, mesma tabela.
- **Refund 25% fica trivial** — calcular consumo via `library_progress`
  + comparar a `granted_at`.

### Negativas

- **Volume rows mais alto** que opcoes B/D (5k → 100k em escala 1M
  users; aceitavel).
- **Bundle de 50+ aulas** = 50 inserts em TX (~50ms; aceitavel).
- **Query `hasAnyAccess`** mais cara que lookup direto (mitigado por
  cache).

### Neutras

- **Decisao revisitavel** — ADR novo para Spec 4 quando Stripe entrar
  (apenas para validar webhook flow).
- **Enum `library_access_source` extensivel** via ALTER TYPE futuro.
- **Lesson learned a registrar:** "granular entitlements escala melhor
  que coarse — refund + bundles + subscription mapeam sem migration".

## Confianca

**Alta.** Padrao usado por Teachable, Thinkific, Kajabi, Podia (LMS
SaaS players de mercado). Granularidade por aula e norma na industria
para suporte a marketplace + refund parcial. Source enum e padrao em
Stripe (charge.metadata) e Mercado Pago.

## Referencias

- **Spec:** `Docs/specs/biblioteca-spec-1.md` RF-01.1.5 + RF-04 + D7
- **ADR-072:** `Docs/architecture/decisions/072-mux-video-integration.md`
  — gating do `playback-token` consulta `user_lesson_access`.
- **Lessons learned:**
  - #7 (Zod optional + default + back-fill) — modelo escolhido evita
    necessidade de back-fill no MVP→Spec 4.
  - #11 (default minimo em componentes) — endpoint admin nao "ajuda"
    inferindo bundle; recebe `lessonIds[]` explicitos.
- **Diagramas Mermaid:**
  - `Docs/architecture/diagrams/biblioteca/data-model.mermaid` — ER de
    `user_lesson_access` com FKs.
  - `Docs/architecture/diagrams/biblioteca/flow-admin-grant-access.mermaid`
    — fluxo idempotente RF-04.
  - `Docs/architecture/diagrams/biblioteca/state-machine-lesson-access.mermaid`
    — estados (locked → previewable → accessible → in_progress → completed).
- **Out of scope:** Stripe webhook integration (Spec 4), refund job
  cron (Spec 4), marketplace creator split (Spec 6), team licensing
  (futuro).
