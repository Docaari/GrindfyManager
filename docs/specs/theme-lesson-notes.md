# Spec: Anotações por Aula Vinculada ao Tema

## 1. Contexto

Ao estudar dentro de um tema na página `/estudos/temas/:id`, o jogador quer poder
registrar **notas ricas** sobre aulas específicas da Biblioteca que ele estudou —
incluindo anotações de texto livre, prints/screenshot e links para a aula.

Hoje a aba "Aulas" do ThemeDetailView é apenas um placeholder estático. A feature
substitui isso por um editor Notion-like (BlockNote) por aula vinculada ao tema.

---

## 2. Modelo de Dados

### Tabela: `theme_lesson_notes`

```sql
CREATE TABLE theme_lesson_notes (
  id          VARCHAR(32) PRIMARY KEY,  -- nanoid
  user_id     VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme_id    VARCHAR(32) NOT NULL REFERENCES study_themes(id) ON DELETE CASCADE,
  lesson_id   VARCHAR(32) NOT NULL,      -- lesson ID da Biblioteca (slug ou internal_id)
  title       VARCHAR(120) NOT NULL,     -- título da nota (default: nome da aula)
  content     JSONB NOT NULL DEFAULT '[]',  -- BlockNote blocks array
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, theme_id, lesson_id)  -- 1 nota por aula por tema por usuário
);
```

- `lesson_id` é a chave da aula (`lessons.id` da tabela `library_lessons`).
- `content` é o array JSON do BlockNote (mesmo formato de `study_sessions_v2.stat_analysis_entries`).
- O título da nota pode ser o nome da aula ou customizado pelo usuário.

---

## 3. Endpoints

### GET /api/study-themes/:themeId/lesson-notes

Retorna todas as notas de aulas vinculadas a um tema para o usuário logado.

```json
[
  {
    "id": "tln_xxx",
    "lessonId": "lesson_abc",
    "title": "Range de 3-bet flop c-bet",
    "content": [...],
    "lessonTitle": "Range de 3-bet flop c-bet",  // nome da aula
    "courseTitle": "Dominando o flop",           // nome do curso
    "createdAt": "2026-06-05T10:00:00Z",
    "updatedAt": "2026-06-05T14:00:00Z"
  }
]
```

### POST /api/study-themes/:themeId/lesson-notes

Cria ou atualiza (upsert) uma nota de aula.

```json
// Request
{
  "lessonId": "lesson_abc",
  "title": "Range de 3-bet flop c-bet",
  "content": [...]
}

// Response 201
{ "id": "tln_xxx", ... }
```

Se já existe nota para `(user_id, theme_id, lesson_id)`, atualiza `content` + `title` + `updated_at` (upsert idempotente).

### DELETE /api/study-themes/:themeId/lesson-notes/:id

Remove a nota.

---

## 4. Storage

`server/storage/themeLessonNotesStorage.ts` (attach pattern, mesmo padrão de
`goalsStorage.ts` / `mdaStorage.ts`):

- `createOrUpdateThemeLessonNote(userId, themeId, payload)` — upsert
- `getThemeLessonNotes(userId, themeId)` — lista
- `deleteThemeLessonNote(userId, themeId, id)` — remove
- `getLessonById(lessonId)` — lookup do título da aula para o enriquecimento do GET

---

## 5. Rotas

`server/routes/themeLessonNotes.ts` — registrado em `server/routes/index.ts`
**antes** de `registerStudiesRoutes` (evita colisão com `/:id` genérico):

```
GET    /api/study-themes/:themeId/lesson-notes
POST   /api/study-themes/:themeId/lesson-notes
DELETE /api/study-themes/:themeId/lesson-notes/:id
```

- Auth middleware (`requireAuth`) em todas.
- Validação Zod do body.
- 404 se `themeId` não pertence ao usuário.

---

## 6. Frontend

### Componente: `ThemeLessonNotesSection`

Nova sub-seção dentro da aba "Aulas" do `ThemeDetailView`. Estrutura:

```
┌─────────────────────────────────────────────────────────────┐
│ Aulas e anotações                                    [+ Nova]│
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📚 Range de 3-bet flop c-bet        curso: Dominando...  │ │
│ │ [Editar] [Apagar]                                        │ │
│ │ (preview do conteúdo — primeiras 3 linhas de texto)       │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📚 CBet sizing em boards secos      curso: Flop Mastery  │ │
│ │ [Editar] [Apagar]                                        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Empty state: "Nenhuma nota ainda. Registre uma aula!"]    │
└─────────────────────────────────────────────────────────────┘
```

### Dialog: `ThemeLessonNoteDialog`

Modal para criar/editar nota de aula:

1. **Seletor de aula** — combobox que busca aulas da Biblioteca (`/api/library/lessons/search?q=`).
   - Mostra `courseTitle / lessonTitle`.
   - Se `theme.linkedLessons` existe, pré-filtra para essas aulas.
2. **Título** — texto livre (default = nome da aula selecionada).
3. **Editor BlockNote** — usa o `NoteEditor` existente (`studies-v2/NoteEditor`).
4. **Salvar / Cancelar**.

### Integração: `ThemeDetailView`

A aba "Aulas" (`TabsContent value="aulas"`) é substituída pelo
`ThemeLessonNotesSection`. O `TabsContent` já tem `forceMount` e o CSS fix
resolvido.

---

## 7. Dependências reutilizadas

- `NoteEditor` em `client/src/components/studies-v2/NoteEditor.tsx` (BlockNote,
  existente, só precisa de import).
- `apiRequest` do `@/lib/queryClient` (lesson #13).
- `useQuery` / `useMutation` do TanStack Query (padrão no projeto).
- Zod validation (padrão no projeto).
- `nanoid` para IDs.

---

## 8. Migration

`migrations/0096_theme_lesson_notes.sql` — criação da tabela +
`migrations/0096_theme_lesson_notes_rollback.sql`.

Executar local via psql (localhost:5433) e documentar pendência em PROD (Neon)
no CLAUDE.md.

---

## 9. Testes

- Unit: storage upsert idempotência, delete ownership.
- Integration: GET 401 sem auth, GET vazio com tema sem notas, POST upsert
  (criar + atualizar a mesma nota).
- Component: render do ThemeLessonNotesSection com dados mockados, dialog
  open/close, editor preserva conteúdo.

---

## 10. Arquivos a criar/modificar

### Novos
- `migrations/0096_theme_lesson_notes.sql`
- `migrations/0096_theme_lesson_notes_rollback.sql`
- `server/storage/themeLessonNotesStorage.ts`
- `server/routes/themeLessonNotes.ts`
- `client/src/components/studies/ThemeLessonNotesSection.tsx`
- `client/src/components/studies/ThemeLessonNoteDialog.tsx`

### Modificar
- `server/routes/index.ts` — registrar `registerThemeLessonNotesRoutes`
- `client/src/components/studies/ThemeDetailView.tsx` — substituir aba aulas
- `shared/schema.ts` — adicionar tabela `themeLessonNotes` em `studyThemesRelations`
- `client/src/App.tsx` (sem mudança de rota — é tudo dentro de `/estudos/temas/:id`)

---

## 11. Critério de aceitação

1. Ao clicar em "Aulas" dentro de um tema, as notas de aulas aparecem
   (ou empty state se vazio).
2. É possível criar uma nota selecionando uma aula da Biblioteca.
3. É possível editar e apagar notas existentes.
4. As notas persistem entre reloads.
5. O editor BlockNote funciona com auto-save.
6. tsc 0, testes passando.