# ADR-135 — Errata ADR-126: `mode='lesson'` aceita `theme_id NULL` quando aula nao tem mapping

- Status: Aceito (errata supersedes parcial de ADR-126 §2.2)
- Data: 2026-05-08
- Sprint: estudos-coach-biblio-2
- Decision owner: system-architect
- Related: spec `Docs/specs/estudos-coach-biblio-2.md` §RF-1.2, ADR-126 (study_sessions_v2 schema), ADR-127 (study_themes curated taxonomy)
- Migration: `migrations/0057_study_sessions_v2_lesson_theme_nullable.sql`

---

## 1. Contexto

ADR-126 §2.2 definiu CHECK constraints discriminator-based em `study_sessions_v2`. Para `mode='lesson'`, NAO ha CHECK exigindo `theme_id NOT NULL` — apenas `lesson_id NOT NULL` (CHECK `ssv2_lesson_id`). A spec original Estudos-Habito-1 dizia "tema vem da aula automaticamente, mas user pode override" — implicitamente ja permitia `theme_id NULL` se aula nao tem mapeamento.

**Porem o ADR-126 prosa §2 introduz ambiguidade**: na descricao do schema, tabela campos diz "`theme_id` FK study_themes.id ON DELETE SET NULL nullable" e tambem "tema obrigatorio para mode=lesson" em prose paragraph. Migration `0052_study_sessions_v2.sql` (linha 53) NAO criou CHECK exigindo `theme_id NOT NULL` em `mode='lesson'` — apenas `lesson_id NOT NULL`. Logo o **schema real ja permite** `theme_id NULL`.

**O problema** eh **apenas documental**: a prose ADR-126 e a spec base Sprint 1 sugerem "obrigatorio". Sprint 2 RF-1.2 exige formalmente `themeId=null` quando aula nao tem mapping em `study_themes.linkedLessons` curated.

Cenarios em que isso ocorre:
1. Aula recem-criada que ainda nao recebeu seed `linkedLessons` (founder ainda nao mapeou).
2. Aula avulsa sem tema curado proximo (ex: aula de "tilt management" sem tema preflop/postflop matching).
3. Aula em curso novo nao taxonomizado.

Sem este ajuste formalizado, RF-1 falha silenciosamente para 30%+ das aulas Sprint 2 (Bloco A tem mapping, mas curos paralelos nao).

---

## 2. Decisao

**Errata ADR-126**: clarificar formalmente que `mode='lesson'` em `study_sessions_v2` aceita `theme_id NULL` quando aula nao possui mapping em `study_themes.linkedLessons`. Schema atual ja permite — apenas garantir que documentacao + Zod schema + migration tracking estejam alinhados.

### 2.1 Mudancas concretas

1. **ADR-126 documentacao**: adicionar nota inline em §2.2 e §2.1 esclarecendo `theme_id` nullable em mode=lesson.
2. **Migration `0057`**: defensiva — verificar idempotency (CHECK constraint `ssv2_lesson_theme` se houver foi nunca aplicada; rodar `DROP CONSTRAINT IF EXISTS` para garantir limpeza). Migration eh **no-op em ambientes ja consistentes** (ja eh nullable).
3. **Zod schema** (`shared/schema.ts` `studySessionV2InsertSchema`): garantir `themeId` `optional().nullable()` para `mode='lesson'`. Outros modos mantem requirement (drill_gto, hand_review, other).
4. **Storage layer derivation** (`server/storage.ts` upsert handler): quando `mode='lesson'` AND `themeId` ausente no body, fazer lookup server-side (RF-1.2):
   ```sql
   SELECT id FROM study_themes
   WHERE jsonb_path_exists(linked_lessons, '$ ? (@ == $lessonId)')
     AND is_curated = true
     AND user_id IN (NULL, $userId)
   LIMIT 1;
   ```
   Se zero match, INSERT com `theme_id = NULL`.

### 2.2 Comportamento backwards-compatible

- Sessions ja registradas com `theme_id NOT NULL` em modo lesson continuam validas.
- Sessions futuras sem mapping recebem `theme_id NULL` — visiveis em listas, mas nao agregam para `studyMinutesByThemeAndMonth` (FocusStatsCard) — comportamento aceito (sessao sem tema nao tem para onde agregar).
- UI handle: lista de estudo mostra "Sem tema" como label quando `theme_id IS NULL`.

### 2.3 CHECK constraint reafirmado

A migration `0057` afirma o CHECK existente (ja em `0052`):

```sql
-- Preserve: mode='lesson' exige lesson_id, NAO exige theme_id
CONSTRAINT ssv2_lesson_id CHECK (mode <> 'lesson' OR lesson_id IS NOT NULL)
```

E adiciona doc-CHECK explicito (no-op, apenas comment):

```sql
COMMENT ON COLUMN study_sessions_v2.theme_id IS
  'FK study_themes.id ON DELETE SET NULL. Nullable em todos os modos exceto drill_gto/other. Mode=lesson permite NULL quando aula nao tem mapping em study_themes.linked_lessons (errata ADR-135).';
```

---

## 3. Opcoes Consideradas

### Opcao A: Manter ADR-126 prose + forcar seed antes de qualquer auto-log

- Dependencia em founder seedar todas as aulas antes do trigger ativar.
- **Pros:** schema mais rigido; "tema obrigatorio" como invariante.
- **Cons:** **bloqueador soft** (R7 spec); RF-1 trigger nao funciona para aulas sem seed; degrada UX para 30%+ das aulas em curos paralelos; gera 400 errors silenciosos no auto-log.

### Opcao B (escolhida): Errata formal — `theme_id NULL` aceito em mode=lesson

- **Pros:** alinha documentacao com schema real (que ja permite); destrava RF-1 para aulas sem mapping; UI handle "Sem tema" eh trivial; nao quebra nada existente.
- **Cons:** sessions com tema nulo nao agregam para foco-do-mes — aceito porque sessao sem tema literalmente nao tem para onde agregar; pode mascarar "esquecemos de seedar" se nao monitorarmos % de auto_lesson com `theme_id NULL`.

### Opcao C: Auto-criar tema "uncategorized" para aulas sem mapping

- **Pros:** todas sessions tem tema.
- **Cons:** poluicao de `study_themes`; "uncategorized" vira lixo crescente; user vai ver "uncategorized" em UI — UX ruim.

---

## 4. Consequencias

**Positivas:**
- RF-1 funciona para todas aulas (com ou sem seed `linkedLessons`).
- Schema documentation alinhada com migration real.
- Backwards compatible — sem migracao destrutiva, sem ALTER COLUMN.
- Founder pode seedar aulas progressivamente sem bloquear feature.

**Negativas:**
- Sessions `mode='lesson'` com `theme_id NULL` nao agregam para foco-do-mes — perda de signal pequena (mas captura como "tempo total de estudo" via outro indicador).
- Telemetria precisa monitorar % de auto_lesson com `theme_id NULL` para detectar "esquecemos seed". Aceito — adicionar em metric Sprint 2.

**Neutras:**
- Migration `0057` eh no-op em prod (apenas COMMENT + DROP CONSTRAINT IF EXISTS defensivo). Zero downtime.
- Lesson #7 (deprecation gradual via Zod optional+default) aplicada — o campo ja era effectively nullable, errata formaliza.

---

## 5. Confianca

**Alta.** A errata apenas alinha documentacao com schema real — migration `0052` ja aplica `theme_id` nullable. Risco zero de regressao. UI handle "Sem tema" eh trivial. Telemetria rastreia adoption.

ADR-126 mantem-se canonico em todos os outros aspectos (estrutura, indices, CHECK constraints discriminator-based). Apenas o caso `mode='lesson'` ganha clarificacao formal.

---

## 6. Anexos

- Migration: `migrations/0057_study_sessions_v2_lesson_theme_nullable.sql`
- ADR original: `Docs/architecture/decisions/126-study-sessions-v2-new-table.md`
- Spec: `Docs/specs/estudos-coach-biblio-2.md` §RF-1.2 (decisao spec ja antecipa)
- Lessons learned: #7 (deprecation gradual)
