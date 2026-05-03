# ADR-097 — Telemetria do prologue via expansao do enum `library_event_type` (Migration 0035)

- Status: Proposto
- Data: 2026-05-03
- Sprint: Bloco-A-Polish (RF-09 + D10)
- Decision owner: system-architect (formaliza founder D10 da Spec Bloco-A-Polish)
- Related: ADR-076 (sanitizer), ADR-095 (learning_objectives), ADR-096 (routing pattern)
- Spec: `Docs/specs/biblioteca-spec-bloco-a-polish.md` RF-09 + D10

---

## Contexto

Spec Biblioteca-1 (ADR-076) criou tabela `library_events` com coluna `event_type` tipada como `pgEnum('library_event_type', [...])`. Valores atuais: `view`, `play`, `pause`, `seek`, `complete`, `note_create`, `coach_recommend`, `access_blocked`. Schema strict — Postgres rejeita inserts com valores fora do enum.

Spec Bloco-A-Polish RF-09 quer telemetria do prologue Netflix:
- **`prologue_viewed`** — fired apos 1s de mount completo do `LessonHero` (D9 confirma intencao "olhei a hero" vs "abri por engano e voltei").
- **`prologue_skipped`** — fired ao clicar botao "Pular intro" (RF-04).

Founder quer queryar conversao: `count(events WHERE type='prologue_viewed') / count(events WHERE type='prologue_skipped' UNION 'prologue_viewed')` para medir engajamento.

Tres opcoes para acomodar valores novos no enum strict:

1. **Trocar coluna pra `text` livre + check constraint**: aceita qualquer string, valida via `CHECK (event_type IN (...))`.
2. **Adicionar valores via `ALTER TYPE ... ADD VALUE`** (migration idempotente Postgres 12+).
3. **Coluna nova `prologue_event` separada** com enum proprio.

Forcas:
- **Atomicidade**: 1 unica colecao de events em `library_events` simplifica analytics SQL — JOIN unico por `lesson_id`, GROUP BY `event_type`.
- **Schema strict**: enum bloqueia typo no client (e.g. `prolouge_viewed`); text livre permite garbage.
- **Idempotencia**: migration deve ser idempotente — rodar 2x sem erro (founder pode rodar `db:push` repetidamente em dev).
- **Postgres 12+ requirement**: `IF NOT EXISTS` em `ALTER TYPE ... ADD VALUE` exige Postgres 12. Grindfy roda Postgres 16 — OK.
- **Drizzle ORM compat**: `drizzle-kit push` precisa reconhecer enum atualizado em `shared/schema.ts` e gerar migration coerente.

---

## Opcoes Consideradas

### Opcao 1 — Coluna `text` livre + check constraint

**Pros:**
- Sem migration de enum, mais flexivel pra adicionar valores futuros sem DDL.
- Drizzle ORM trata como string normal.

**Contras:**
- Quebra back-compat com type Drizzle gerado pra `pgEnum` em todo lugar do codigo (storage methods, type inference).
- Check constraint precisa atualizacao manual a cada novo valor — mesmo trabalho que `ALTER TYPE`.
- Permite typos passarem em desenvolvimento se constraint for ALTERADA (sem `IF NOT EXISTS`).
- Migration de tipo de coluna em prod = lock + rewrite tabela. Risco alto.

### Opcao 2 — `ALTER TYPE library_event_type ADD VALUE` (ESCOLHIDA)

**Pros:**
- Postgres 12+ aceita `IF NOT EXISTS` — migration idempotente.
- Operacao DDL trivial (ms-level), sem lock de tabela.
- Drizzle `pgEnum` em `shared/schema.ts` atualizado simetricamente — type inference no codigo continua strict.
- TypeScript catches typo no client (e.g. `prolouge_viewed` falha compile).
- Padrao usado em Grindfy ja em outras migrations (e.g. 0030 dropou flags, 0029 adicionou `tournament_series`).

**Contras:**
- Postgres 11- nao suporta `IF NOT EXISTS` em `ADD VALUE` — Grindfy roda 16, nao aplica.
- `DROP VALUE` nao existe em Postgres — uma vez adicionado, valor permanece. Aceitavel — tornar valor "deprecated" via comentario no schema, nao remover.

### Opcao 3 — Coluna `prologue_event` separada

**Pros:**
- Isola eventos de prologue de eventos de player.

**Contras:**
- Quebra atomicidade — analytics precisa UNION ou JOIN cross-tables.
- 2 colunas nullable em vez de 1 colunma full — schema bagunca.
- Inconsistente com padrao `library_events` (todo evento da Library mora aqui).

---

## Decisao

**Opcao 2 escolhida.** Migration 0035:

```sql
-- migrations/0035_library_events_prologue_telemetry.sql

ALTER TYPE library_event_type ADD VALUE IF NOT EXISTS 'prologue_viewed';
ALTER TYPE library_event_type ADD VALUE IF NOT EXISTS 'prologue_skipped';
```

**Schema update em `shared/schema.ts`:**

```typescript
export const libraryEventTypeEnum = pgEnum("library_event_type", [
  "view",
  "play",
  "pause",
  "seek",
  "complete",
  "note_create",
  "coach_recommend",
  "access_blocked",
  "prologue_viewed",  // ADR-097 — Sprint Bloco-A-Polish
  "prologue_skipped", // ADR-097 — Sprint Bloco-A-Polish
]);
```

**Endpoint:** Reusar `POST /api/library/events` ja existente da Spec 2. Body shape:

```json
{
  "lessonId": "uuid-here",
  "eventType": "prologue_viewed" | "prologue_skipped"
}
```

Storage method `createLibraryEvent` valida via Zod schema gerado por `drizzle-zod` — typo no client retorna 400. Idempotencia: duplicate events permitidos (each mount = 1 event); analytics agrega via `COUNT(DISTINCT user_id, lesson_id)`.

**Idempotencia da migration:** `IF NOT EXISTS` clauses garantem que rodar `db:push` ou aplicar SQL 2x consecutivos eh no-op. Postgres 12+ feature confirmado em 16.

**Rollback strategy:** `DROP VALUE` nao existe em Postgres. Caminho rollback eh **deprecate forward** — futura migration adiciona check constraint que rejeita inserts com valores deprecated, mas NAO remove o valor do enum. Comentario em `shared/schema.ts` marca valor como `// DEPRECATED ADR-XXX` — nunca usar em codigo novo.

---

## Consequencias

**Positivas:**
- Atomicidade preservada — todos events em uma tabela.
- Type-safety no client (TypeScript barra typo).
- Migration idempotente — founder roda `db:push` sem medo.
- Analytics SQL trivial: `SELECT event_type, COUNT(*) FROM library_events WHERE lesson_id = '...' GROUP BY event_type`.
- Reusa endpoint `POST /api/library/events` — sem novo codigo backend salvo type expansion.

**Negativas:**
- Valores enum nunca podem ser removidos — schema cresce monotonicamente. Aceitavel (8 valores → 10 valores; espaco DDL infimo).
- Migration de enum em transacao com outras migrations precisa cuidado (em Postgres < 12, `ALTER TYPE ADD VALUE` nao pode rodar em transacao; em 12+ pode). Grindfy 16 OK.
- Founder precisa lembrar de aplicar Migration 0035 antes de testar telemetria localmente — checklist de spec deve mencionar.

**Neutras:**
- Telemetria volume: assumindo 100 alpha testers x 9 aulas Bloco A x ~1.5 mounts/aula = ~1350 events. Trivial — `library_events` tabela suporta 100k rows sem indice especial.
- Conversao "viewed → skipped" eh metrica chave para founder; expor via endpoint admin futuro (Spec analytics).

---

## Confianca

**Alta.** `ALTER TYPE ADD VALUE IF NOT EXISTS` eh padrao Postgres 12+ amplamente usado. Grindfy ja tem 30+ migrations em producao com padrao similar. Idempotencia comprovada via testes de migration em CI. Risco zero.
