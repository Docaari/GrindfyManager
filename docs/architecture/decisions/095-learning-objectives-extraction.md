# ADR-095 — `learning_objectives JSONB` em `library_lessons` + extracao automatica do HTML durante manifest import

- Status: Proposto
- Data: 2026-05-03
- Sprint: Biblioteca-2 (RF-08 + RF-09 + D4 + D5)
- Decision owner: system-architect
- Related: ADR-076 (sanitizer), ADR-093 (trusted bypass), Spec 1 RF-11 (manifest importer)
- Spec: `Docs/specs/biblioteca-spec-2.md` RF-08 + RF-09

---

## Contexto

Bloco A "Antes das Cartas" tem **9 HTMLs** com seccao explicita
`<div class="learning-objectives">` listando os objetivos
pedagogicos da aula em `<ul><li>`. Strategist propos:

> Extrair `learning_objectives` parseando o HTML durante manifest
> import, salvar em coluna nova `JSONB`. Usar pra (a) preview no
> hero quando user abre aula, (b) sidebar/below-the-fold do prologue
> Netflix-style (Sprint Polish), (c) Coach AI tool pra recomendar
> aulas baseado em objetivos.

Tres decisoes interligadas:

1. **Schema:** Onde armazenar e como tipar `learning_objectives`.
2. **Source of truth:** Auto-extract do HTML ou manual no manifest CSV?
3. **Extraction implementation:** Regex puro, parser DOM (jsdom), ou
   ambos?

### Forcas

- **DRY:** HTML do Bloco A ja TEM os objetivos como
  `<div class="learning-objectives"><ul><li>`. Pedir founder
  duplicar em manifest CSV = source-of-truth split.
- **Fragile parsing:** regex puro para HTML eh anti-pattern (zalgo).
  jsdom parse eh mais robusto mas adiciona overhead.
- **Variant tolerance:** Founder pode usar `learning-objectives`
  hifen, `learning_objectives` underscore, ou apenas `objectives`.
  Sanitizer (ADR-093 admin-trusted) preserva todas. Importer deve
  reconhecer variantes.
- **Cap items:** preview UI tem limite (5-10 objetivos cabem em hero;
  20 estoura layout).
- **Cap length per item:** Layout wireframe sugere ~80 chars max
  por objetivo (frase concisa). Cap server-side em 200 chars
  pra defesa.
- **Schema migration:** `library_lessons` ja existe (Migration 0023).
  Adicionar coluna nova requer migration + back-fill.
- **Lesson #7 (deprecation gradual):** Zod `optional + default([])`
  + back-fill via `DEFAULT '[]'::jsonb` no Postgres. Garante zero
  break em rows existentes.
- **Coach AI integration**: Coach tool `recommend_lesson` pode
  futuramente filtrar por objetivos. Schema JSON Array eh
  natural. Indexavel via GIN se busca por objetivo virar feature
  (Spec futura).

## Opcoes Consideradas

### Opcao A: Coluna manual no manifest CSV (rejeitada)

Founder preenche `learning_objectives` como JSON array string no
CSV: `'["obj 1","obj 2","obj 3"]'`. Importer parsea + valida.

- **Pros:**
  - Source-of-truth explicit.
  - Sem parsing HTML.
- **Contras:**
  - **Founder duplica trabalho** — info ja existe no HTML.
  - **JSON em CSV horroroso** (escaping nightmares).
  - **Manutencao**: edita HTML, esquece de editar CSV → divergencia
    silenciosa.
  - **Sem Bloco A real** — Founder assinalou D5 default = auto.
- **Rejeitada por:** UX founder ruim + drift inevitavel.

### Opcao B: Auto-extract do HTML via regex (rejeitada)

```ts
function extract(html: string): string[] {
  const m = html.match(/<div class="learning-objectives">([\s\S]*?)<\/div>/);
  if (!m) return [];
  const li = [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)];
  return li.map(x => x[1].replace(/<[^>]+>/g, '').trim());
}
```

- **Pros:**
  - Zero dep nova.
  - Rapido (~1ms por HTML).
- **Contras:**
  - **HTML parsing via regex eh anti-pattern** (DOM nesting, atributos
    em ordem variavel, escape chars).
  - **Frag em HTML mal-formado** (Docari pode ter typo).
  - **Variants `learning_objectives` underscore** precisa regex
    extra (3+ regex).
  - **`<li><strong>X</strong> Y</li>`** — strip tags via regex
    quebra com aninhamento.
- **Rejeitada por:** fragilidade demais pra fonte de truth.

### Opcao C: Auto-extract via jsdom (over-engineering pra MVP)

```ts
import { JSDOM } from 'jsdom';
function extract(html: string): string[] {
  const dom = new JSDOM(html);
  const container = dom.window.document.querySelector(
    '.learning-objectives, .learning_objectives, .objectives'
  );
  if (!container) return [];
  return Array.from(container.querySelectorAll('li'))
    .map(li => li.textContent.trim())
    .filter(x => x.length > 0);
}
```

- **Pros:**
  - **Robust HTML parsing** via DOM nativo.
  - **Aninhamento OK** (textContent strip tudo).
  - **Variants via CSS selector multi-class.**
- **Contras:**
  - **jsdom adiciona ~5MB** ao bundle server. **MAS:** jsdom JA
    esta como dep transitive de `isomorphic-dompurify` (ADR-076).
    Zero custo adicional!
  - **Slower:** ~5-10ms por HTML (vs 1ms regex). Trivial pra import
    batch (9 HTMLs = ~80ms). Aceitavel.
  - **Reusable across system**: outros parsing usecases (Spec 5+)
    podem reusar.

### Opcao D: Auto-extract com regex relaxado + variants (ESCOLHIDA)

Hibrido: regex conservador busca container + extrai `<li>`. Strip
HTML tags via regex simples. Validacao Zod em cada item.

```ts
function extractLearningObjectives(html: string): string[] {
  const containerMatch = html.match(
    /<div[^>]*class\s*=\s*["'][^"']*\b(learning[-_]objectives|objectives)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );
  if (!containerMatch) return [];
  const inner = containerMatch[2];
  const liMatches = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  return liMatches
    .map(m => stripHtmlTags(m[1]).trim())
    .filter(s => s.length > 0 && s.length <= 200)
    .slice(0, 10);
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
```

- **Pros:**
  - **Sem dep nova** (jsdom seria reuse mas regex mais transparent).
  - **Variants reconhecidas** via regex unico.
  - **Rapido** (~1ms por HTML).
  - **Graceful degradation** — sem match retorna `[]`.
  - **Cap implicito** (10 items, 200 chars) na funcao.
  - **Aninhamento simples** (`<li><strong>X</strong> Y</li>`)
    funciona via stripHtmlTags.
- **Contras:**
  - **Regex HTML parsing** ainda eh fragile pra casos exoticos
    (comments aninhados, CDATA). Aceitavel pra conteudo Docari
    controlado.

## Decisao

**Adotar Opcao D: extracao via regex conservador no
`manifestImporter.ts` (RF-09), salva em
`library_lessons.learning_objectives JSONB`. Schema + Zod com
`optional + default([])`. Cap 10 items + 200 chars/item.**

### Detalhes-chave

1. **Schema migration `0033_library_learning_objectives.sql`:**
   ```sql
   ALTER TABLE library_lessons
     ADD COLUMN learning_objectives JSONB NOT NULL DEFAULT '[]'::jsonb;

   -- Optional GIN index (futura busca):
   -- CREATE INDEX idx_library_lessons_learning_objectives
   --   ON library_lessons USING gin(learning_objectives);
   ```

2. **Drizzle schema (`shared/schema.ts`):**
   ```ts
   export const libraryLessons = pgTable('library_lessons', {
     // ... existing
     learningObjectives: jsonb('learning_objectives')
       .notNull()
       .default(sql`'[]'::jsonb`),
     // ...
   });
   ```

3. **Zod insert schema:**
   ```ts
   export const insertLibraryLessonSchema = createInsertSchema(
     libraryLessons, {
       // ...
       learningObjectives: z.array(
         z.string().min(1).max(200)
       ).max(10).optional().default([]),
     }
   );
   ```

   **Lesson #7**: optional + default = back-compat. Rows
   existentes recebem `[]` automatico.

4. **Type:**
   ```ts
   export type LibraryLesson = typeof libraryLessons.$inferSelect;
   // → { ..., learningObjectives: string[] }
   ```

5. **Importer extraction (`manifestImporter.ts`):**
   ```ts
   import { extractLearningObjectives } from './learningObjectivesExtractor';

   // Dentro do loop processando lessons
   const rawHtml = await readFile(htmlPath, 'utf-8');
   const objectives = extractLearningObjectives(rawHtml);
   const { clean: sanitizedHtml, wordCount } = sanitizeArticleHtml(
     rawHtml, 'admin-trusted'
   );
   await storage.upsertLibraryLessonBySlug({
     // ... outros campos
     articleHtml: sanitizedHtml,
     articleWordCount: wordCount,
     learningObjectives: objectives,
   });
   ```

6. **`learningObjectivesExtractor.ts` (novo):**
   ```ts
   /**
    * Extrai learning objectives de HTML de aula.
    * Padroes reconhecidos:
    *   <div class="learning-objectives"><ul><li>...</li></ul></div>
    *   <div class="learning_objectives">...</div>
    *   <div class="objectives">...</div>
    *
    * Cap 10 items, 200 chars/item.
    * Strip HTML tags do conteudo (aninhamento <strong> etc).
    * Sem match → retorna [].
    */
   export function extractLearningObjectives(html: string): string[] {
     const containerRegex = /<div[^>]*class\s*=\s*["'][^"']*\b(learning[-_]objectives|objectives)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i;
     const m = html.match(containerRegex);
     if (!m) return [];
     const inner = m[2];
     const liMatches = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
     return liMatches
       .map(li => stripHtmlTags(li[1]).trim())
       .filter(s => s.length > 0 && s.length <= 200)
       .slice(0, 10);
   }

   function stripHtmlTags(s: string): string {
     return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
   }
   ```

7. **Manifest CSV override (opcional):**
   - CSV pode ter coluna `learning_objectives` com JSON array
     string: `'["obj 1","obj 2"]'`.
   - Se presente e valido (`JSON.parse` retorna array de
     string), **override** auto-extracao.
   - Se invalido, log warning e usa auto-extracao.
   - Use case: founder edita objetivos sem editar HTML.

8. **Logging:**
   ```
   [manifestImporter] lesson "a1-mentalidade-fixa" imported:
     html=12.4KB audio=13.5MB cover=1.8MB
     learningObjectives=4 (auto-extracted)
   ```
   ou:
   ```
   learningObjectives=3 (manual override from CSV)
   ```

9. **Test fixtures:**
   - HTML real do A.1 (com 4 objetivos) → array 4 strings.
   - HTML sem learning-objectives → `[]`.
   - HTML com `learning_objectives` underscore → reconhecido.
   - HTML com 11 li → cap 10 (li #11 dropped).
   - HTML com `<li>X 250 chars Y</li>` → dropped (>200 chars).
   - HTML com `<li></li>` (vazio) → dropped.
   - HTML com `<li><strong>Bold</strong> Texto</li>` → "Bold Texto"
     (tags strip).
   - HTML mal-formado (sem `</div>`) → `[]` (graceful).

10. **Frontend usage:**
    - Endpoint `/api/library/lessons/:id/article-bundle` (RF-04)
      retorna `meta.learningObjectives` no payload.
    - Sprint Polish: hero Netflix renderiza below-the-fold como
      `<ul>` com objetivos.
    - Coach tool `recommend_lesson` (Spec futura) pode filtrar por
      objetivos via GIN index.

### Tradeoffs aceitos

| Tradeoff | Aceito porque |
|---|---|
| Regex HTML parsing eh fragile | Conteudo Docari controlado; graceful fallback `[]`. |
| Sem jsdom = perda de robustness | Reuso futuro pode trocar pra jsdom; backward compat preservada. |
| Cap 10 items / 200 chars | UI hero acomoda 5-7; cap defensivo. |
| Manual override no CSV adiciona complexidade | Fallback "founder pode editar sem mexer no HTML"; raro mas valioso. |
| Migration 0033 nova | Trivial; default cobre back-fill. |
| Auto-extract pode "perder" objetivos com class diferente | Variants comuns cobertas; sem match → `[]` (graceful, log warning). |

### Quando rever esta decisao

- **Conteudo Docari muda formato** (objetivos viram `<dl>` / outro
  pattern): adicionar regex variant.
- **Performance batch grande** (Curso 01 com 100+ HTMLs): jsdom
  pode ficar mais rapido em batches via reuse de DOM. Avaliar.
- **Search by objective** (Spec futura): adicionar GIN index +
  expand schema (each objective com tags? extras?).
- **i18n** (cursos em ingles futuros): objetivos podem ser
  multilang — schema vira `{ pt: [...], en: [...] }`. Migration
  posterior.

## Consequencias

### Positivas

- **Source-of-truth unico** (HTML do Docari).
- **Founder zero trabalho extra** (auto-extracao).
- **Override manual** disponivel quando necessario.
- **Schema indexavel** (GIN futuro).
- **Lesson #7 respeitado** — back-compat zero break.
- **Test fixtures bem cobertos.**
- **Coach AI integration** preparada (Spec futura).

### Negativas

- **Regex HTML parsing** fragile com mal-formed.
- **Migration nova** (0033) — founder roda `db:push`.
- **Cap fixo** (10/200) — pode precisar ajustar futuro.
- **Drift potencial** entre HTML e CSV override (opcional).

### Neutras

- **Decisao revisitavel** se demanda surgir (jsdom upgrade, i18n,
  GIN index).
- **Lesson learned a registrar:** "auto-extracao via regex
  conservador eh ok pra fonte trusted controlada; cap items +
  per-item length defensivo; graceful fallback `[]` previne
  import quebra".

## Confianca

**Alta-Media.** Regex HTML parsing tem track record de
bugs em sistemas grandes; mitigado por:
1. Conteudo Docari controlado (nao user-generated).
2. Graceful fallback `[]`.
3. Manual CSV override.
4. Test fixture com casos reais.

Schema migration trivial. Tipos OK. Risco principal = founder
mudar formato HTML sem avisar — log warning ao retornar `[]` em
HTML que parecia ter objetivos.

## Referencias

- **Spec:** `Docs/specs/biblioteca-spec-2.md` RF-08 + RF-09 + D4 + D5
- **ADR-076** — Sanitizer (defense em-depth; objetivos extraidos
  ANTES de sanitize via `'admin-trusted'` policy).
- **ADR-093** — Trusted bypass.
- **ADR-094** — Article bundle (retorna learningObjectives no meta).
- **Lessons learned:**
  - #4 (Vitest 4) — testes em `node` project.
  - #7 (deprecation gradual) — schema optional + default.
  - #11 (default minimo) — cap defensivo.
- **Diagramas Mermaid:**
  - `Docs/architecture/diagrams/biblioteca-spec-2-manifest-import-flow.mermaid`
    — sequence founder script → manifest importer → extract +
    sanitize + storage.
- **External:**
  - PostgreSQL JSONB docs
  - Drizzle ORM jsonb column type
- **Out of scope:**
  - GIN index (Spec futura search by objective).
  - i18n multilang (Spec futura cursos EN/ES).
  - jsdom upgrade (mantem regex enquanto Bloco A formato estavel).
  - Schema unified com `tags[]` (objetivos sao concept ortogonal).
