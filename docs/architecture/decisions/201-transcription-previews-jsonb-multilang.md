# ADR-201 — Multi-Language Transcription Previews via JSONB (Aditiva, Back-Compat)

**Status:** Accepted
**Date:** 2026-05-22
**Sprint:** Mini Player 3.2 / Wave A / W-A4
**Supersedes / Relates:** ADR-196 (ingestion pipeline), ADR-199 (auto-pipeline), migration 0080

---

## Context

Coluna atual `library_lessons.transcription_preview` (varchar nullable) suporta **1 preview por lesson, 1 idioma**. Cenarios futuros que ja se desenham:

1. Coach narrative bilingual (en + pt) em lessons "internacionais".
2. UI multi-lang quando i18n ampliar do PT-BR para EN-US (founder mencionou em backlog estrategia 2026).
3. W-A1 (ADR-199) ja permite `MUX_GENERATED_SUBTITLES_LANGS=pt,en` — Mux gera 2 tracks. Sem schema multi-lang, segundo track sobrescreveria o primeiro.

**Necessidade:** schema permitir `{ pt: "...", en: "..." }` enquanto preserva back-compat com codigo atual que le `transcription_preview` (string).

---

## Decision

Migrar **aditivamente** — adiciona coluna JSONB nova, mantem varchar antiga deprecated por 1 sprint (drop em MP3.3+).

### 1. Migration 0080 (aditiva)

```sql
-- migrations/0080_transcription_previews_jsonb.sql

-- 1. Adiciona coluna nova (nullable, default NULL)
ALTER TABLE library_lessons
  ADD COLUMN transcription_previews JSONB DEFAULT NULL;

-- 2. Backfill: copia varchar antigo → JSONB com chave 'pt'
UPDATE library_lessons
SET transcription_previews = jsonb_build_object('pt', transcription_preview)
WHERE transcription_preview IS NOT NULL
  AND transcription_previews IS NULL;

-- 3. Index GIN para queries futuras (ex: "lessons com preview EN")
CREATE INDEX IF NOT EXISTS idx_lessons_transcription_previews_keys
  ON library_lessons USING GIN (transcription_previews);

-- 4. coluna antiga permanece — drop em MP3.3+ (migration 0081_drop_transcription_preview_varchar.sql planejada)
```

Rollback (`_rollback.sql`):
```sql
DROP INDEX IF EXISTS idx_lessons_transcription_previews_keys;
ALTER TABLE library_lessons DROP COLUMN transcription_previews;
```

### 2. Storage layer — `transcriptionPreviewStorage.ts`

#### Write (ingestor)

```ts
async function writeTranscriptionPreview(lessonId: string, lang: string, preview: string) {
  await db.update(libraryLessons)
    .set({
      transcriptionPreviews: sql`
        COALESCE(${libraryLessons.transcriptionPreviews}, '{}'::jsonb)
        || jsonb_build_object(${lang}, ${preview}::text)
      `,
      // Espelha em varchar legacy se lang === 'pt' (back-compat com leituras antigas)
      ...(lang === 'pt' ? { transcriptionPreview: preview } : {}),
    })
    .where(eq(libraryLessons.id, lessonId));
}
```

#### Read (fallback chain)

```ts
function resolveTranscriptionPreview(
  lesson: { transcriptionPreviews: Record<string, string> | null; transcriptionPreview: string | null },
  userLang: string  // ex: 'pt-BR' → normaliza pra 'pt'
): string | null {
  const lang = normalizeLang(userLang);  // 'pt-BR' → 'pt', 'en-US' → 'en'
  const previews = lesson.transcriptionPreviews ?? {};

  // Fallback chain: user lang → pt → en → primeira chave existente → legacy varchar → null
  return previews[lang]
      ?? previews['pt']
      ?? previews['en']
      ?? Object.values(previews)[0]
      ?? lesson.transcriptionPreview
      ?? null;
}
```

### 3. API contract — **NAO quebra**

`GET /api/library/lessons/:slug` continua retornando:
```ts
{
  transcriptionPreview: string | null;  // ainda string, server resolve por user lang
}
```

UI (`LessonPickerDialog`, etc.) nao precisa saber sobre multi-lang. Servidor escolhe baseado em `req.user.preferredLanguage` (JWT claim ou `users.preferred_language` coluna existente — verificar via Grep durante implementacao).

### 4. Drizzle schema (shared/schema.ts)

```ts
export const libraryLessons = pgTable('library_lessons', {
  // ...existing
  transcriptionPreview: varchar('transcription_preview', { length: 100 }),  // DEPRECATED MP3.3+
  transcriptionPreviews: jsonb('transcription_previews').$type<Record<string, string>>(),  // NEW
});
```

---

## Options Considered

### Opcao 1: Substituir varchar in-place

- **Pros:** Schema limpo, 1 coluna.
- **Cons:** Breaking change para QUALQUER codigo que le `transcription_preview` (4+ callsites mapeados). Migration nao-aditiva → risco rollback. Descartado por violar §5 "Zero breaking changes" da spec.

### Opcao 2: Tabela separada `lesson_transcription_previews` (lesson_id, lang, preview)

- **Pros:** Schema normalizado. Permite metadata por idioma (ex: `generated_at`, `source`).
- **Cons:** JOIN extra em todo read. Custo de migration maior. Overkill para preview de 80 chars.

### Opcao 3 (escolhida): JSONB aditiva + varchar deprecated

- **Pros:** Zero breaking change. Back-compat 1 sprint. Index GIN suporta queries futuras tipo "ofereca lessons com preview EN aos users EN".
- **Cons:** 2 colunas redundantes durante sprint de transicao. Aceitavel — coluna sera dropada em 0081.

### Opcao 4: Manter varchar + sufixo no value (ex: `[pt]Preview...[en]Outro...`)

- **Pros:** Sem migration.
- **Cons:** Hack horrivel, sem query support, parsing fragil. Descartado.

---

## Consequences

### Positivas

- Schema preparado para i18n sem refactor futuro.
- Ingestor (Mux + Whisper futuro) escreve cada lang independentemente sem race condition.
- Fallback chain robusto (user lang → pt → en → any → legacy) garante UX nao quebra para lessons antigas.
- Index GIN abre porta para "list lessons com preview no idioma X" sem full table scan.

### Negativas

- 2 colunas redundantes durante sprint de transicao. Espelhamento `pt` → varchar legacy em todo write = +1 escrita por lesson (insignificante).
- Drift potencial se algum codigo legado escrever **so** em `transcription_preview` (varchar) e nao em `transcription_previews` (JSONB). Mitigado por: storage layer concentrada em `transcriptionPreviewStorage.ts`, grep ja confirma single write codepath via ingestor.

### Neutras

- Drop coluna legacy em MP3.3+ requer 1 migration adicional (planejado, NAO blocking).
- Fallback chain logica complica testes — mas exhaustive coverage simples (5 cases por lesson × 3 user langs).

---

## Testing Strategy (informativo — implementer escreve)

### Cenarios criticos (lesson #38: tests JSONB lookup)

- Lesson com `previews={pt:'X',en:'Y'}` + user `en` → retorna `Y`.
- Lesson com `previews={pt:'X'}` + user `en` → fallback retorna `X`.
- Lesson com `previews=null` + `transcription_preview='Z'` (legacy) → retorna `Z` (back-compat).
- Lesson com `previews=null` + varchar=null → retorna `null` (UI esconde slot).
- Lesson com `previews={fr:'F'}` + user `en` → primeira chave existente = `F`.
- Ingestor escreve `lang='en'` em lesson que ja tem `pt` → JSONB vira `{pt:..., en:...}` (sem perder pt).
- Backfill migration idempotente (rodar 2x → no-op no 2o).

### Lesson #38 ESM vs CJS

Tests `.test.ts` server-side usam JSONB direto via mock db. Sem React Context — risco lesson #38 nao aplica aqui (issue era em React Context tests com mix `import`/`require`). Documentar mesmo assim para evitar regressao em testes futuros que possam estender para client-side.

---

## Confianca

**Alta.** Padrao JSONB aditivo ja usado em `users.ai_structured_profile` (ADR-151) e `user_coach_preferences.frozen_categories` (ADR-152). Migration idempotente. Rollback trivial.

## References

- ADR-196 — pipeline atual escreve em varchar. Esta ADR adiciona JSONB sem quebrar.
- ADR-199 — `generated_subtitles` ja envia 2 langs. JSONB e o consumidor natural.
- ADR-151 (ai_structured_profile) — padrao JSONB com fallback ja estabelecido.
- Migration 0080 (criada nesta sprint).
- Migration 0081 (planejada MP3.3+ — drop varchar legacy).
