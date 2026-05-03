# Spec 2 — Biblioteca (Storage real + Bloco A viewer MVP)

> Sprint: Biblioteca-2 (Fase 1 — PM-Spec)
> Data: 2026-05-03
> Pre-requisito: Biblioteca-1 entregue + MERGE main (ver `memory/session_2026-05-02-biblioteca-1.md`)
> Inputs estrategicos: `Docs/strategy/biblioteca-bloco-a-launch.md` (incluindo §11 addendum compressao audio)
> Output: este documento — fonte de verdade operacional para `system-architect`, `test-writer`, `implementer`, `reviewer`
> Status: Proposta (aguardando aprovacao do dev)
> Idioma: PT-BR (codigo em ingles, conteudo/UI em PT-BR)

---

## 1. Sumario Executivo

**Objetivo.** Tirar a Biblioteca do estado "infra montada, backend stubbed" e colocar o **Bloco A "Antes das Cartas" LIVE** com **artigo HTML rico (iframe sandbox) + podcast .m4a lado a lado**, fim-a-fim, em `/biblioteca/curso/antes-das-cartas/{lesson-slug}`.

Esta spec NAO faz prologo Netflix (vai pra Sprint Bloco-A-Polish), NAO faz video (Bloco A nao tem), NAO faz sharp/resize de capas (pulado pra Sprint Polish, capas brutas + lazy load).

**Escopo.** 11 RFs entregaveis em ~3-5 dias dev solo via pipeline TDD. A spec eh isoladora — toda mudanca eh aditiva sobre Biblioteca-1; zero refactor de modulos nao-relacionados (Studies, Stats, Bankroll, Coach prompts).

**11 RFs em 1 linha:**

- **RF-01** — Implementar 18 storage methods stubbed em `server/storage.ts` (listLibraryCourses, getLibraryCourseBySlug, getLibraryLesson, getLibraryLessonBySlug, upsertLibraryCourseBySlug, upsertLibraryModuleBySlug, upsertLibraryLessonBySlug, lessonAccessLookup, findLessonAccess, bulkGrantLessonAccess, recordLibraryEvents, createLibraryEvent, countLibraryEventsForUserInWindow, upsertLibraryProgress, getLibraryProgressForLesson, findLibraryLessonsByCategory, findLibraryLessonsByTag, libraryLessonProgressLookup, libraryLessonAccessLookup) — o input mencionou 13 mas o codigo real tem 18; lista canonica abaixo
- **RF-02** — Sanitizer allowlist expandida em `server/services/htmlSanitizer.ts`: adicionar `<section>`, `<nav>`, `<button>`, `<style>`, atributos `data-*`; manter `onclick`/`onerror`/`javascript:` rejeitados
- **RF-03** — Endpoints publicos `GET /api/library/static/article-styles.css` + `GET /api/library/static/article-scripts.js` com Cache-Control 30d e cache-busting via query string `?v={hash}`
- **RF-04** — Endpoint `GET /api/library/lessons/:id/article-bundle` retorna `{ html, stylesUrl, scriptsUrl, version }` — requer lesson access
- **RF-05** — `LessonViewer` ganha layout grid `lg:grid-cols-2` quando exatamente 2 formatos disponiveis (Bloco A = artigo + podcast); tab Video TOTALMENTE ESCONDIDA (nao apenas disabled) quando `formats.video` ausente; mobile sempre stacked
- **RF-06** — Iframe sandbox `srcdoc` para artigo + protocolo postMessage (`resize`, `scroll-depth`); allow-scripts; sem allow-same-origin
- **RF-07** — Watermark overlay sobre iframe (`position:absolute pointer-events:none`) preservando ADR-076 (mesma intensidade)
- **RF-08** — Migration 0033: `ALTER TABLE library_lessons ADD COLUMN learning_objectives JSONB NOT NULL DEFAULT '[]'::jsonb`
- **RF-09** — Manifest importer (`server/services/manifestImporter.ts`) extrai `learning_objectives` parseando `<div class="learning-objectives"> <ul> <li>` do HTML; aceita config Bloco A (`audio_extension='m4a'`, MIME `audio/mp4`, scope `library/audio`); cap por arquivo elevado de 50MB → 30MB (audio comprimido cabe — max A6 = 14.1MB)
- **RF-10** — Script CLI `scripts/library-upload-bloco-a.ts` itera pasta `Bloco A - Fundamentos Mentais/compressed/`, monta CSV runtime, faz 1 chamada `POST /api/admin/library/import-manifest` com 9 audios + 9 HTMLs + 9 capas; idempotente; resume em falha
- **RF-11** — Script CLI `scripts/library-upload-static-assets.ts` faz upload one-shot de `_assets/styles.css` + `_assets/lesson.js.transformed` (versao com `addEventListener` substituindo `onclick` inline); founder valida texto antes do upload

---

## 2. Contexto e Estado Atual

### 2.1. Como chegamos aqui

Spec 1 (Biblioteca-1) entregou **infraestrutura LMS embedded inteira**:

- **Schema (7 tabelas):** `library_courses`, `library_modules`, `library_lessons`, `library_lesson_assets`, `user_lesson_access`, `library_events`, `library_progress` — DDL aplicada via Migration 0023.
- **12 endpoints HTTP** registrados em `server/routes/library-register.ts`.
- **3 paginas frontend:** `BibliotecaPage`, `CourseDetailPage`, `LessonViewer` (642 linhas, tabs Video/Podcast/Artigo, watermark, sticky audio bar, font-size persistido, a11y compliant).
- **Componentes auxiliares:** `AudioPlayerContext`, `StickyAudioBar`, `PodcastPlayer` (skip 15s, speed control, keyboard).
- **Servicos backend:** `htmlSanitizer.ts`, `manifestImporter.ts`, `mediaStorage.ts`, `muxMediaProvider.ts`.
- **6 ADRs (071-076):** approved.

**Todos os 213 testes da Biblioteca-1 passam** porque mockam o storage. Mas em runtime real (PG local, sem mock):

```ts
// server/storage.ts:6926-6982 — 18 metodos stubbed
async listLibraryCourses() { throw "not implemented (Sprint Biblioteca-2)"; }
async getLibraryCourseBySlug() { throw "not implemented (Sprint Biblioteca-2)"; }
// ... 16 outros stubs identicos
```

Toda chamada HTTP `/api/library/*` retorna 500. UI carrega skeleton → erro tipado → cul-de-sac.

### 2.2. Por que Biblioteca-2 agora

Founder validou conteudo Bloco A em 2026-05-03:
- 9 episodios em `C:\Users\ricar\OneDrive\Desktop\A anatomia de um Spot\00 - Antes das Cartas\Bloco A - Fundamentos Mentais\`
- 9 .html ricos (referenciam `../../_assets/styles.css` + `lesson.js`)
- 9 .m4a comprimidos em `compressed/` (AAC mono 64k, total 95.4 MB; max 14.1MB no A6)
- 9 .jpeg capas em `Capas/` (~2MB cada, sem resize)

**Sem RF-01 (storage real), nada renderiza.** Sem RF-02/04/06 (sanitizer relaxado + iframe), o HTML do Bloco A perde 80% da identidade visual + interatividade (flashcards, accordion, recall). Sem RF-09/10 (importer adaptado + script CLI), founder nao sobe o conteudo.

### 2.3. O que NAO entra nesta spec

- Prologo Netflix-style (Sprint Bloco-A-Polish — Spec 3)
- Sharp resize de capas (idem)
- Auto-redirect "proxima aula" ao 100% (idem)
- Auto-skip prologue 5s (idem)
- Botao "Adicionar a lista" funcional (mockup; tooltip "Em breve")
- Coach `recommend_lesson` ja funcionando com dados reais — implementacao da tool ja existe (Spec 1 RF-10), so vai parar de quebrar quando RF-01 implementar `findLibraryLessonsByCategory` + `findLibraryLessonsByTag` + `libraryLessonProgressLookup` + `libraryLessonAccessLookup`. **Nao ha trabalho UI Coach novo nesta spec.**
- Search/transcript do TXT NotebookLM (Spec futura)
- Gamification (XP, streaks, badges)
- Stripe checkout / refund automation (Spec 4)
- CDN deploy / S3 backend (Spec deploy)

---

## 3. Defaults Ativos D1-D14

Decisoes ja tomadas neste briefing. `system-architect`, `test-writer`, `implementer` assumem sem requestionar.

| ID | Default |
|---|---|
| **D1** | **iframe sandbox srcdoc para artigo, NAO expand allowlist do sanitizer pra HTML interativo.** ADR novo (077) sera criado pelo `system-architect`. Sanitizer ainda corre antes do salvar (defesa-em-depth) com allowlist expandida (RF-02), mas o vetor primario de seguranca eh o sandbox iframe. Trade-offs aceitos: postMessage protocol pra resize + scroll-depth (~50 linhas novas); A11y/SEO menores aceitaveis pro MVP. |
| **D2** | **iframe sandbox flags = `allow-scripts` apenas.** SEM `allow-same-origin` (JS do iframe NAO toca cookie/storage do parent), SEM `allow-popups`, SEM `allow-forms`, SEM `allow-top-navigation`. CSP do parent inclui `frame-src 'self'` + `child-src 'self'`. |
| **D3** | **CSS + JS dos artigos = assets estaticos publicos servidos por endpoints dedicados.** `GET /api/library/static/article-styles.css` (Content-Type `text/css`) + `GET /api/library/static/article-scripts.js` (Content-Type `application/javascript`). Cache-Control `public, max-age=2592000, immutable`. Cache-busting via query string `?v={sha256-hex-12-chars}`. Sem auth (publicos). Hash recalculado em cada upload via RF-11. |
| **D4** | **`learning_objectives JSONB DEFAULT '[]'`** — Migration **0033** (proxima livre apos 0032). Schema Drizzle ganha campo `learningObjectives: jsonb('learning_objectives').notNull().default(sql\`'[]'::jsonb\`)` em `libraryLessons`. Tipado como `string[]` em `LibraryLesson` insert/select schemas. Coluna NOT NULL com default — back-fill nao precisa porque default cobre rows existentes. |
| **D5** | **Extracao automatica de `learning_objectives` do HTML.** `manifestImporter.ts` parseia o HTML antes do sanitize buscando `<div class="learning-objectives"><ul><li>...</li></ul></div>` (case-insensitive class match). Cada `<li>` (texto strip-tagged) vira string no array. Se padrao nao bate, salva `[]` (nao falha import). Robustez: aceita variantes `learning_objectives`, `learning-objectives`, `objectives`. |
| **D6** | **Layout LessonViewer — grid bidimensional com regras explicitas:**<br>- 1 formato disponivel → tab unica + painel full-width (comportamento atual mantido)<br>- 2 formatos disponiveis E viewport `>= lg` (1024px) → grid `grid-cols-2 gap-6`. Coluna esquerda = artigo (RF-06 iframe), direita = podcast/video. Tabs continuam visiveis pra accessibility/keyboard nav mas painel ativo eh ambos.<br>- 2 formatos disponiveis E viewport `< lg` → fallback tabs + 1 painel ativo (comportamento atual)<br>- 3 formatos disponiveis → tabs + 1 painel ativo SEMPRE (sem grid, mesmo desktop) — grid 3-col seria muito apertado. **Bloco A cai no caso 2 formatos `>= lg`.** |
| **D7** | **Tab Video TOTALMENTE ESCONDIDA quando `formats.video` ausente** (mudanca vs Spec 1 RF-08). Test atual `LessonViewer renderiza tabs disabled para formato indisponivel` precisa ser atualizado: verifica que tab Video NAO esta no DOM quando lesson sem video. Tabs Podcast/Artigo continuam com policy "render-but-disabled" se formato individualmente ausente. **Justificativa:** UX cleanup — Bloco A so tem 2 formatos por design, tab Video disabled "polui" e simetria side-by-side fica errada. Lesson #11 (default minimo) NAO viola — formato esta hardcoded ausente, nao "decorativo opcional". |
| **D8** | **iframe altura dinamica via postMessage protocol.** Iframe envia mensagens `{ type: 'grindfy:library:resize', payload: { height: number } }` ao parent (origem `*`, parent valida `event.source === iframeRef.current.contentWindow`). Parent ajusta `iframe.style.height = px`. ResizeObserver dentro do `lesson.js.transformed` dispara mensagem em mount + resize de `<body>`. Cap 50000px (anti-DoS). |
| **D9** | **iframe scroll-depth via postMessage.** Mensagem `{ type: 'grindfy:library:scroll', payload: { percent: number } }` enviada em throttle 1s. Parent recebe e dispara `PATCH /api/library/lessons/:id/progress` com `format: 'article'` quando percent muda em pelo menos 5% desde ultimo PATCH. Throttle 5s ja existe server-side (Spec 1 RF-06 + D12) — nao re-implementar. |
| **D10** | **Watermark sobre iframe — overlay externo, NAO injetado no srcdoc.** Componente `<div className="absolute inset-0 pointer-events-none z-10">` por cima do `<iframe>` no DOM do parent, renderizando 6 instancias diagonais com `userPlatformId` (mesma logica do `MuxPlayer` watermark, ADR-076). `pointer-events:none` essencial — usuario continua scrollando o iframe interno via wheel events que atravessam o overlay. |
| **D11** | **`lesson.js` original sera transformado por SCRIPT, nao editado a mao.** Script de upload (RF-11) baixa `lesson.js` original, aplica transform `onclick="X"` → `addEventListener` em DOMContentLoaded, salva em `lesson.js.transformed` localmente, **prompta founder confirmar texto**, depois faz upload. Founder roda `npx tsx scripts/library-upload-static-assets.ts --dry-run` primeiro para inspecionar diff. Sem `--dry-run`, sobe direto. |
| **D12** | **Capas brutas servidas como estao (~2MB cada) com `loading="lazy"` + `decoding="async"`.** Sharp resize fica para Sprint Bloco-A-Polish. **Justificativa:** sharp nao esta em `dependencies` do `package.json` atual (validado: `bcryptjs, csv-parser, drizzle-orm, ... lucide-react, ...sharp NAO consta`). Adicionar dep nesta spec aumenta risco Win32 binary builds + N+1 deploy steps. Lazy loading + 9 capas = LCP morto so na primeira navegacao mobile sub-3G; aceitavel pra MVP. |
| **D13** | **Botao "Adicionar a lista" / "Favoritos" — desabilitado com tooltip "Em breve".** Componente continua existindo no `CourseDetailPage` e `LessonViewer` mas com `disabled={true}` + `<Tooltip content="Em breve">`. Sem endpoint, sem schema, sem state. |
| **D14** | **`MEDIA_STORAGE_BACKEND=local` para MVP.** S3 backend fica para Spec deploy. Toda key armazenada via `mediaStorage.put({ scope, ext, buffer, mime })` produz `uploads/{scope}/{nanoid21}.{ext}` no FS local. Endpoint `GET /api/library/assets/:key` (ja existe, Biblioteca-1) serve com restricao por scope. |

---

## 4. Usuarios e Personas

Mesmo conjunto da Spec 1 (sem mudancas):

| Persona | O que faz na Biblioteca | Trigger principal |
|---|---|---|
| **Founder (admin)** | Roda `library-upload-static-assets.ts` 1x + `library-upload-bloco-a.ts` 1x, testa fim-a-fim em alpha local, valida visual | Comando shell |
| **Alpha tester (Pro tier, acesso liberado)** | Navega `/biblioteca` → "Antes das Cartas" → A.1 → ve artigo HTML interativo + ouve podcast | Click no item "Biblioteca" no sidebar |
| **Usuario sem acesso** | Comportamento mantido da Spec 1 — capa cinza + "Em breve" | Sidebar |

### 4.1. User Stories novas (delta vs Spec 1)

#### US-08 (founder)
> Como founder, quero rodar **1 comando** (`npx tsx scripts/library-upload-bloco-a.ts`) que sobe os 9 episodios do Bloco A inteiros (audio + HTML + capa + metadata) **sem editar manifest CSV manualmente**, com idempotencia (rerun nao duplica) e resume (falha no episodio 5 retoma do 5).

#### US-09 (alpha tester desktop)
> Como alpha tester desktop em `>= 1024px`, quero abrir a aula A.1 e ver o **artigo HTML interativo (com flashcards, accordion, recall) na coluna esquerda E o podcast player na coluna direita** sem ter que trocar de tab. O scroll do artigo eh independente; o podcast continua tocando enquanto eu leio.

#### US-10 (alpha tester mobile)
> Como alpha tester mobile (<1024px), quando abro a aula A.1, vejo **tabs Artigo / Podcast** (sem tab Video porque Bloco A nao tem video). Default tab = Podcast (D4 da Spec 1: maior progresso ou audio fallback). Iframe do artigo se ajusta a altura do conteudo automaticamente sem scrollbar interno desnecessario.

#### US-11 (alpha tester scroll behavior)
> Como alpha tester lendo o artigo da aula A.3, quero que **meu progresso de leitura seja salvo automaticamente** (server detecta scroll-depth >= 95% e marca `completedAt`), sem precisar clicar "Concluir".

#### US-12 (founder seguranca)
> Como founder preocupado com fidelidade visual + isolamento, quero que o **CSS custom da aula (variaveis `--accent-blue` etc) NAO contamine o tema shadcn do Grindfy** e o JS dos flashcards NAO consiga ler `localStorage` ou `cookies` do parent.

---

## 5. Requisitos Funcionais

### RF-01 — Implementar 18 Storage Methods Stubbed

**O que faz.** Substitui os 18 `throw new Error("not implemented (Sprint Biblioteca-2)")` em `server/storage.ts:6926-6982` por implementacoes Drizzle reais. Toda a infra de tipos + Zod schemas ja existe em `shared/schema.ts:3577-3850`.

**Lista canonica (atualizada vs input — input mencionou 13, codigo real tem 18):**

| # | Method | Signature | Notas |
|---|---|---|---|
| 1 | `listLibraryCourses` | `(opts?: { userId?: string; onlyPublished?: boolean }) => Promise<LibraryCourseListItem[]>` | Filtra `isPublished` se `onlyPublished` (default `true`). Inclui `lessonCount` (subquery COUNT) + `hasAnyAccess` (subquery EXISTS via `userId`). Ordenado por `displayOrder ASC, createdAt ASC`. |
| 2 | `getLibraryCourseBySlug` | `(slug: string) => Promise<LibraryCourseDetail \| null>` | JOIN modulos + lessons; lessons com `formats[]` derivado (`videoMuxPlaybackId !== null` → 'video'; `audioKey !== null` → 'podcast'; `articleHtml !== null` → 'article'). |
| 3 | `getLibraryLesson` | `(id: string) => Promise<LibraryLessonFull \| null>` | Retorna lesson com `learning_objectives` (D4) + raw `articleHtml` (sanitized) + paths para audio/video/cover. |
| 4 | `getLibraryLessonBySlug` | `(courseSlug: string, lessonSlug: string) => Promise<LibraryLessonFull \| null>` | JOIN courses → lessons; usado pela rota `/biblioteca/curso/:slug/:lesson` quando frontend tem slug em vez de id. |
| 5 | `upsertLibraryCourseBySlug` | `(data: CourseUpsertInput) => Promise<LibraryCourse>` | Drizzle `INSERT ... ON CONFLICT (slug) DO UPDATE SET title, subtitle, description, coverKey, displayOrder, updatedAt = NOW() RETURNING *`. Idempotente por slug. |
| 6 | `upsertLibraryModuleBySlug` | `(data: ModuleUpsertInput) => Promise<LibraryModule>` | Conflict target = composite `(course_id, slug)`. |
| 7 | `upsertLibraryLessonBySlug` | `(data: LessonUpsertInput) => Promise<LibraryLesson>` | Conflict target = `(course_id, slug)`. Inclui `learning_objectives` (RF-08 / D4). Mantem `isPublished = false` no insert se nao explicitado. |
| 8 | `lessonAccessLookup` | `(userId: string \| undefined, lessonIds: string[]) => Promise<Map<string, boolean>>` | Sem `userId` → todas false. Bulk SELECT `WHERE user_id = $1 AND lesson_id = ANY($2)`. |
| 9 | `findLessonAccess` | `(args: { userId?: string; lessonId: string }) => Promise<UserLessonAccess \| null>` | Single row lookup (auth gate). |
| 10 | `bulkGrantLessonAccess` | `(args: { userId: string; lessonIds: string[]; source: enum; grantedBy: string; expiresAt?: Date }) => Promise<{ granted: number; alreadyHadAccess: number }>` | INSERT ... ON CONFLICT DO NOTHING + counter. Idempotente. Cap 500 enforced no caller (RF-04 Spec 1). |
| 11 | `recordLibraryEvents` | `(events: LibraryEventInsert[]) => Promise<void>` | Bulk insert; usado em `coach_recommend` side-effect (Spec 1 RF-10). Sem returning. |
| 12 | `createLibraryEvent` | `(event: LibraryEventInsert) => Promise<LibraryEvent>` | Single insert; usado pelo endpoint `POST /api/library/events`. Server-side timestamp (D11 Spec 1). |
| 13 | `countLibraryEventsForUserInWindow` | `(args: { userId: string; windowSeconds: number }) => Promise<number>` | Rate limit support (Spec 1 RF-06 60/min). `WHERE user_id = $1 AND event_timestamp > NOW() - $2 * interval '1 second'`. |
| 14 | `upsertLibraryProgress` | `(progress: LibraryProgressUpsertInput) => Promise<{ row: LibraryProgress; completed: boolean }>` | Conflict target `(user_id, lesson_id, format)`. Computa `completedAt` se `lastPositionSeconds >= totalDurationSeconds * 0.95` (D12 Spec 1). Retorna `completed = true` quando seta `completedAt`. |
| 15 | `getLibraryProgressForLesson` | `(args: { userId: string; lessonId: string }) => Promise<LibraryProgress[]>` | Bulk fetch dos 3 formatos (video/podcast/article). |
| 16 | `findLibraryLessonsByCategory` | `(categoryId: string, opts?: { limit?: number; userId?: string }) => Promise<LessonRecommendation[]>` | Filtra `isPublished = true` + `categoryId`. Retorna lesson + course + module + `hasAccess` + `progressState` (`'untouched'|'in-progress'|'completed'`). |
| 17 | `findLibraryLessonsByTag` | `(tag: string, opts?: { limit?: number; userId?: string }) => Promise<LessonRecommendation[]>` | `WHERE tag = ANY(tags)` + filtros publicados. Mesma shape de output. |
| 18 | `libraryLessonProgressLookup` | `(userId: string \| undefined, lessonIds: string[]) => Promise<Map<string, LessonProgressSummary>>` | Bulk lookup; retorna `{ maxPercent, lastFormat }` por lesson. Sem userId → Map vazio. |
| 19 | `libraryLessonAccessLookup` | `(userId: string \| undefined, lessonIds: string[]) => Promise<Map<string, boolean>>` | Alias semantico de #8 (mesma logica; nome diferente foi criado pra coach tools — manter ambos pra retro-compat de callers). Implementacao pode ser identica via shared helper. |

> **Nota:** a tabela tem 19 entradas porque `lessonAccessLookup` (8) e `libraryLessonAccessLookup` (19) sao 2 metodos com mesmo proposito mas paths de chamada diferentes (legacy + novo coach). Manter os dois — mudar um caller pra outro seria refactor desnecessario nesta spec.

**Constraints transversais:**
- Toda implementacao usa o helper `db` (Drizzle) ja exportado em `server/storage.ts`.
- Zod schemas de input vem de `shared/schema.ts` (`insertLibraryCourseSchema`, `insertLibraryLessonSchema`, etc).
- IDs sao gerados via `nanoid()` em qualquer insert que requeira novo ID.
- Sem `try/catch` generico que engole erros (lesson #9 do CLAUDE.md). Logue antes de fallback.
- Nenhum metodo retorna `any` — tipar contra `LibraryCourse`, `LibraryLesson`, etc dos `$inferSelect` schemas.

**Criterios de aceitacao:**
- [ ] Cada um dos 18 metodos tem implementacao Drizzle real (zero `throw "not implemented"`)
- [ ] `npm run check` passa (zero erros de typecheck)
- [ ] `getLibraryCourseBySlug('antes-das-cartas')` retorna curso completo apos seed Bloco A
- [ ] `lessonAccessLookup(undefined, [...])` retorna Map de todos `false` sem query DB (curto-circuito)
- [ ] `upsertLibraryCourseBySlug(data)` com slug existente faz UPDATE (testavel via 2 inserts back-to-back)
- [ ] `bulkGrantLessonAccess` idempotente (rerun com mesmo userId+lessonIds nao quebra; `alreadyHadAccess` incrementa)
- [ ] `upsertLibraryProgress` marca `completedAt` exatamente quando `lastPositionSeconds >= totalDurationSeconds * 0.95`
- [ ] `findLibraryLessonsByCategory` retorna lessons ordenadas por `progressState` (untouched > in-progress > completed) entao `displayOrder` (D14 Spec 1)
- [ ] Foreign keys CASCADE funcionando: `DELETE FROM users WHERE userPlatformId = X` apaga toda row dependente (test integration manual via fixture)

**Dependencias:**
- Pre-requisito: Migration 0023 ja aplicada (Biblioteca-1). **Migration 0033 (RF-08) precisa rodar antes** ou junto (`upsertLibraryLessonBySlug` referencia coluna `learning_objectives`).

---

### RF-02 — Sanitizer Allowlist Expandida

**O que faz.** Edita `server/services/htmlSanitizer.ts` (criado em Biblioteca-1) para permitir tags + atributos necessarios pelo HTML Bloco A, mantendo defesa contra XSS.

**Tags atualmente permitidas (Spec 1 D10):**
```
p, h1-h6, ul, ol, li, strong, em, blockquote, code, pre, a, br, hr, img, span
```

**Tags ADICIONADAS pela RF-02:**
```
section, nav, button, style, article, aside, figure, figcaption, header, footer,
details, summary, mark, sup, sub, time, abbr, cite, q, kbd, var, samp,
table, thead, tbody, tfoot, tr, td, th, caption, colgroup, col,
div  (ja tinha implicito mas confirmar; precisa pra .learning-objectives)
```

**Atributos ADICIONADOS:**
- `data-*` (todos os custom data attributes — usados pelo `lesson.js` pra hooks de flashcards/accordion)
- `id` (usado por anchors de section)
- `aria-*` (a11y — `aria-expanded`, `aria-controls`, `aria-labelledby`, etc)
- `role` (a11y semantic)
- `type` (em `<button type="button">`)
- `tabindex`

**Atributos / handlers RECUSADOS (mantidos no blocklist):**
- `onclick`, `onmouseover`, `onerror`, `onload`, `onfocus`, `onblur`, etc — TODOS event handlers inline
- `javascript:` em URLs (`href`, `src`, `action`, etc)
- `style` inline (atributo) — **NOTA:** `style` como **TAG** eh permitido (CSS embedded em `<style>...</style>`). `style` como **ATRIBUTO** continua bloqueado.

**Implementacao DOMPurify:**
```ts
const config: DOMPurify.Config = {
  ALLOWED_TAGS: [...currentTags, 'section', 'nav', 'button', 'style', /* ...etc */],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'id', 'role', 'type', 'tabindex'],
  ADD_DATA_URI_TAGS: [],
  ALLOW_DATA_ATTR: true,
  ALLOW_ARIA_ATTR: true,
  FORBID_ATTR: ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'onblur', 'style'],
  FORBID_TAGS: ['script', 'iframe', 'embed', 'object', 'form', 'input'],
  // Note: <script> blocked because we serve scripts via /article-scripts.js endpoint (RF-03)
};
```

**Por que isso eh seguro mesmo com sandbox iframe:**
- Defesa em profundidade — sanitizer eh primeiro filtro, sandbox eh segundo.
- Mesmo se attacker injetar `<button onclick="alert(1)">`, sanitizer remove `onclick`. Sandbox previne escape.
- `<script>` continua bloqueado para que JS rode SO via `/article-scripts.js` (asset publico controlado).

**Criterios de aceitacao:**
- [ ] Sanitizer aceita `<section class="flashcard-grid">` sem mutation
- [ ] Sanitizer aceita `<button data-flashcard-toggle="card-1">Mostrar resposta</button>` mantendo `data-*`
- [ ] Sanitizer aceita `<style>.foo { color: red; }</style>` (tag style permitida)
- [ ] Sanitizer remove `<button onclick="alert(1)">` → vira `<button>`
- [ ] Sanitizer remove `<a href="javascript:alert(1)">` → vira `<a>` sem href ou bloqueado
- [ ] Sanitizer remove `<div style="color: red">` → vira `<div>` (atributo style bloqueado)
- [ ] Test fixtures de Biblioteca-1 (XSS payloads `<script>`, `<img onerror>`) continuam bloqueados
- [ ] HTML real do A.1 passa por sanitizer e mantem `<section class="flashcard-grid"><button data-flashcard-toggle>...`

**Dependencias:** Nenhuma. Standalone refactor de `htmlSanitizer.ts`.

---

### RF-03 — Endpoints de Asset Estatico (CSS + JS dos Artigos)

**O que faz.** Cria 2 endpoints publicos para servir o `styles.css` + `lesson.js.transformed` que o iframe srcdoc do RF-06 vai referenciar.

**Endpoints:**

```
GET /api/library/static/article-styles.css
  Auth: nenhuma (publico)
  Query: ?v={hash}  (opcional, cache-busting)
  Response 200: Content-Type=text/css, Cache-Control=public, max-age=2592000, immutable
  Response 304: se If-None-Match bate com hash atual
  Response 503: se asset nao foi uploaded ainda (founder nao rodou RF-11)

GET /api/library/static/article-scripts.js
  Auth: nenhuma (publico)
  Query: ?v={hash}
  Response 200: Content-Type=application/javascript, mesmo cache header
  Response 304/503: idem
```

**Storage:**
- CSS sobe via `mediaStorage.put({ scope: 'library/static', ext: 'css', buffer, mime: 'text/css' })` → key tipo `library/static/{nanoid21}.css`. **Mas:** scope estatico NAO pode usar nanoid em path porque endpoint precisa key estavel. Solucao: scope dedicado com keys fixas.

**Mecanismo:**
- Tabela nova OU constante DB? **Decisao:** sem tabela. Usar **registro em `library_lesson_assets`** com `lesson_id = NULL` (validar — schema atual tem `lessonId NOT NULL`). **Workaround:** usar tabela existente pivoting pra um lesson "sentinel" OU melhor — `mediaStorage` ganha helper `putAtFixedKey(key, buffer, mime)` que sobrescreve key fixa.

**Implementacao escolhida (mais simples):**
- Adicionar metodo `mediaStorage.putAtFixedKey(key: string, buffer: Buffer, mime: string): Promise<{ size: number; sha256: string }>`.
- Keys reservadas:
  - `library/static/article-styles.css`
  - `library/static/article-scripts.js`
- Hash sha256 do conteudo recalculado a cada upload. Hash truncado em 12 chars + retornado em response header `ETag`.
- Endpoint le do FS direto via `mediaStorage.get(key)`. ETag header. Hash valido contra `If-None-Match`.

**Caracteristicas das responses:**
- `Cache-Control: public, max-age=2592000, immutable` (30d)
- `ETag: "{hash12}"`
- `Vary: Accept-Encoding`
- Se `?v=hash` na query e hash NAO bate com atual → ainda serve content atual (semantica de cache-busting eh: hash novo = URL nova; hash antigo = ainda serve). Browser dependera do ETag.

**Storage de hash:**
- `metadata` JSONB nova em `media_storage_meta` (tabela existente?) ou env var? **Mais simples:** computar hash on-the-fly via `crypto.createHash('sha256')` ao ler arquivo. Custo: ~5ms para 26KB de CSS. Aceitavel pra endpoint cacheado 30d.

**Criterios de aceitacao:**
- [ ] `GET /api/library/static/article-styles.css` retorna 200 com `Content-Type: text/css` apos RF-11 rodar
- [ ] Antes de RF-11 rodar, mesmo endpoint retorna 503 com `{ message: 'asset_not_uploaded' }`
- [ ] `Cache-Control: public, max-age=2592000, immutable` presente
- [ ] `ETag` header presente e bate com hash sha256 truncado
- [ ] `If-None-Match: "{hash}"` retorna 304 sem body
- [ ] Re-upload do CSS via `putAtFixedKey` sobrescreve em-place; hash muda; ETag muda
- [ ] Endpoint NAO requer auth (testavel via fetch sem JWT)
- [ ] CSP do endpoint inclui `Content-Security-Policy: default-src 'none'` (defesa)

**Dependencias:** RF-11 (script de upload precisa rodar para asset existir).

---

### RF-04 — Endpoint Article Bundle

**O que faz.** Endpoint dedicado que retorna tudo que o frontend precisa pra montar o `srcdoc` do iframe da aula.

```
GET /api/library/lessons/:id/article-bundle
  Auth: requireAuth (JWT) + lesson access check
  Response 200: {
    html: string,              // articleHtml ja sanitizado da DB
    stylesUrl: string,         // ex: '/api/library/static/article-styles.css?v=abc123def456'
    scriptsUrl: string,        // ex: '/api/library/static/article-scripts.js?v=789xyz012345'
    version: string,           // hash combinado styles+scripts (cache invalidation hint pro client)
    meta: {
      title: string,           // lesson.title (pra <title> no srcdoc)
      learningObjectives: string[]  // tambem retornado aqui pra LessonHero / sidebar
    }
  }
  Response 401: { message: 'access_denied' } (sem auth ou sem grant)
  Response 404: { message: 'lesson_not_found' OR 'article_not_available' }
  Response 503: { message: 'static_assets_not_uploaded' } (se RF-11 nao rodou)
```

**Implementacao:**
- Le lesson via `getLibraryLesson(id)`. Se `articleHtml === null` → 404.
- Confere lesson access via `findLessonAccess({ userId, lessonId })`. Se null → 401.
- Le hash dos assets via `mediaStorage.computeHash('library/static/article-styles.css')` e `.../article-scripts.js`.
- Se algum asset nao existe → 503 (founder esqueceu RF-11).
- Monta `stylesUrl = '/api/library/static/article-styles.css?v=' + hashCss.slice(0, 12)`.
- `version` = `sha256(hashCss + hashJs).slice(0, 16)` (cache-busting unificado).

**Front-end usage (preview):**
```ts
const { data } = useQuery({
  queryKey: ['library', 'lesson', lessonId, 'article-bundle'],
  queryFn: () => apiRequest('GET', `/api/library/lessons/${lessonId}/article-bundle`),
  staleTime: 5 * 60 * 1000,
});
// data.html injected in srcdoc; data.stylesUrl/scriptsUrl referenced inside srcdoc
```

**Criterios de aceitacao:**
- [ ] Sem auth → 401
- [ ] Com auth mas sem grant → 401 com `message: 'access_denied'`
- [ ] Lesson sem articleHtml → 404 com `message: 'article_not_available'`
- [ ] Lesson inexistente → 404 com `message: 'lesson_not_found'`
- [ ] Static asset nao uploaded → 503 com `message: 'static_assets_not_uploaded'`
- [ ] Happy path: response inclui html + stylesUrl + scriptsUrl + version + meta
- [ ] `version` muda quando founder re-roda RF-11 (test mockando hash change)
- [ ] Cache TanStack Query invalidado quando version muda (frontend reage)

**Dependencias:** RF-01 (`getLibraryLesson`, `findLessonAccess`), RF-03 (endpoints static), RF-11 (assets uploaded).

---

### RF-05 — LessonViewer Layout Responsivo (Grid 2-col + Tab Video Hidden)

**O que faz.** Refactor cirurgico em `client/src/pages/biblioteca/LessonViewer.tsx` para suportar layout side-by-side quando exatamente 2 formatos disponiveis E desktop, escondendo tab Video quando ausente.

**Mudancas em LessonViewer:**

#### 5.A. Tab Video totalmente escondida quando ausente

```tsx
// Antes (Spec 1 RF-08 + Lesson #11):
<TabsList>
  <TabsTrigger value="video" disabled={!formats.video}>Video</TabsTrigger>
  <TabsTrigger value="podcast" disabled={!formats.podcast}>Podcast</TabsTrigger>
  <TabsTrigger value="article" disabled={!formats.article}>Artigo</TabsTrigger>
</TabsList>

// Depois (D7):
<TabsList>
  {formats.video && <TabsTrigger value="video">Video</TabsTrigger>}
  <TabsTrigger value="podcast" disabled={!formats.podcast}>Podcast</TabsTrigger>
  <TabsTrigger value="article" disabled={!formats.article}>Artigo</TabsTrigger>
</TabsList>
```

**Justificativa (revisao de Lesson #11):** Lesson #11 do CLAUDE.md ("Default minimo em componentes — spec eh fonte de verdade") diz que componentes nao ganham acoes default que nao estao na spec. **Aqui a spec PEDE explicitamente esconder Video quando ausente** (D7). Tab Podcast/Artigo continuam disabled-but-rendered porque a esperanca futura eh ter os 3. Tab Video NAO eh planejada para Bloco A nem para Curso 00 inteiro — eh um formato de outro tipo de curso.

#### 5.B. Grid 2-col quando exatamente 2 formatos AND `lg:`

```tsx
const formatCount = [formats.video, formats.podcast, formats.article].filter(Boolean).length;
const useTwoColLayout = formatCount === 2; // CSS handle desktop vs mobile via Tailwind

// Render:
<div className={cn(
  formatCount === 2 ? 'lg:grid lg:grid-cols-2 lg:gap-6' : '',
  formatCount !== 2 ? 'block' : ''
)}>
  {/* Coluna esquerda: artigo (RF-06) ou tab ativa fallback */}
  {formats.article && useTwoColLayout && (
    <div className="lg:col-start-1">
      <ArticleIframe lessonId={...} userPlatformId={...} />
    </div>
  )}
  {/* Coluna direita: podcast/video, ou full em mobile */}
  <div className={cn(useTwoColLayout && 'lg:col-start-2')}>
    {/* Tabs + painel ativo (comportamento atual mantido em <lg) */}
  </div>
</div>
```

**Comportamento por viewport / formatCount:**

| formatCount | Viewport | Layout |
|---|---|---|
| 1 | qualquer | tab unica + painel full-width (mantido) |
| 2 | `>= lg` | grid 2-col (esquerda = artigo, direita = outro formato + tabs) |
| 2 | `< lg` | tabs + painel ativo single (mantido — tabs Artigo + Podcast simultaneas viraria scroll caotico) |
| 3 | qualquer | tabs + painel ativo single (mantido) |

#### 5.C. Tabs visibilidade quando grid ativo

No layout grid (2 formatos + desktop), as tabs continuam renderizadas pra a11y/keyboard, mas:
- Tab clicada **NAO troca painel** (ambos painéis ja sao visiveis lado-a-lado)
- Tab clicada serve como ancora de scroll (rolar pra topo do painel correspondente)
- ARIA: `aria-selected` reflete tab "atualmente em foco"; `aria-controls` aponta pro painel correspondente.

#### 5.D. Sticky audio bar comportamento ajustado (F3 do strategy doc)

Sticky bar atual aparece quando usuario sai da rota com audio tocando. Em layout side-by-side, o podcast eh visivel ao lado do artigo o tempo todo. Solucao:
- Sticky bar continua aparecendo apenas quando rota muda OU quando usuario scrolla pra baixo o suficiente que o `PodcastPlayer` saiu de viewport (`IntersectionObserver`).
- Logica: `<StickyAudioBar visible={!podcastVisible || routeChanged}>`.

#### 5.E. Watermark sobre iframe (RF-07)

Render do iframe (RF-06) inclui watermark overlay (RF-07) sobre o iframe.

**Criterios de aceitacao:**
- [ ] Lesson Bloco A (formats: article + podcast) abre `/biblioteca/curso/antes-das-cartas/a1-mentalidade-fixa-vs-crescimento` em viewport >= 1024px → grid 2-col visivel
- [ ] Mesma lesson em viewport < 1024px → tabs + painel ativo (artigo OU podcast, nao ambos)
- [ ] Lesson com 3 formatos (mock) → tabs + 1 painel sempre, sem grid (mesmo desktop)
- [ ] Lesson sem video → tab Video NAO renderizada no DOM (test via `queryByRole('tab', { name: 'Video' })` retorna `null`)
- [ ] Lesson com 1 formato so → tab unica + painel full-width
- [ ] Sticky audio bar nao aparece quando podcast esta visivel em viewport (test via IntersectionObserver mock)
- [ ] Sticky audio bar aparece ao navegar pra outra rota com audio tocando
- [ ] Watermark renderizado sobre iframe quando layout 2-col ativo
- [ ] Tabs continuam navegaveis via keyboard (ArrowLeft/Right) mesmo em layout grid
- [ ] Tab clicada em layout grid faz scroll-to-top do painel correspondente (validavel via `scrollIntoView` mock)

**Dependencias:** RF-06 (iframe component), RF-07 (watermark).

---

### RF-06 — Iframe Sandbox + postMessage Protocol

**O que faz.** Cria componente `client/src/components/biblioteca/ArticleIframe.tsx` que monta `<iframe sandbox srcdoc>` com o HTML do article-bundle (RF-04) e implementa protocolo postMessage para resize dinamico + scroll-depth tracking.

**Componente:**

```tsx
interface ArticleIframeProps {
  lessonId: string;
  userPlatformId: string;
  onScrollDepth?: (percent: number) => void;  // callback pra parent disparar PATCH progress
}

export function ArticleIframe({ lessonId, userPlatformId, onScrollDepth }: ArticleIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(800); // initial fallback height

  const { data: bundle, isLoading, error } = useQuery({
    queryKey: ['library', 'lesson', lessonId, 'article-bundle'],
    queryFn: () => apiRequest('GET', `/api/library/lessons/${lessonId}/article-bundle`),
  });

  const srcdoc = useMemo(() => {
    if (!bundle) return '';
    return buildSrcdoc(bundle, userPlatformId);
  }, [bundle, userPlatformId]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Validate sender = our iframe
      if (event.source !== iframeRef.current?.contentWindow) return;
      const { type, payload } = event.data ?? {};
      if (type === 'grindfy:library:resize' && typeof payload?.height === 'number') {
        const capped = Math.min(payload.height, 50000);  // D8 anti-DoS
        setIframeHeight(capped);
      } else if (type === 'grindfy:library:scroll' && typeof payload?.percent === 'number') {
        onScrollDepth?.(Math.max(0, Math.min(100, payload.percent)));
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onScrollDepth]);

  if (isLoading) return <ArticleSkeleton />;
  if (error) return <ArticleError error={error} />;

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"  // D2: NO same-origin
      srcDoc={srcdoc}
      title={`Aula: ${bundle.meta.title}`}
      style={{ width: '100%', height: iframeHeight, border: 'none' }}
      data-testid="library-article-iframe"
    />
  );
}
```

**`buildSrcdoc(bundle, userPlatformId)` helper:**

```ts
function buildSrcdoc(bundle: ArticleBundle, userPlatformId: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(bundle.meta.title)}</title>
  <link rel="stylesheet" href="${bundle.stylesUrl}">
  <script>
    window.__GRINDFY_LIBRARY = {
      userPlatformId: ${JSON.stringify(userPlatformId)},
      lessonTitle: ${JSON.stringify(bundle.meta.title)},
    };
  </script>
</head>
<body>
${bundle.html}
<script src="${bundle.scriptsUrl}" defer></script>
</body>
</html>`;
}
```

**Logica do `lesson.js.transformed` (lado iframe — sera entregue na RF-11):**

```js
// Resize observer reporta altura para parent
function reportHeight() {
  const h = document.documentElement.scrollHeight;
  parent.postMessage({ type: 'grindfy:library:resize', payload: { height: h } }, '*');
}
const ro = new ResizeObserver(reportHeight);
ro.observe(document.body);
window.addEventListener('load', reportHeight);

// Scroll depth (1s throttle)
let lastScrollSent = 0;
let scrollTimeout = null;
function reportScroll() {
  const total = document.documentElement.scrollHeight - window.innerHeight;
  const percent = total > 0 ? (window.scrollY / total) * 100 : 100;
  parent.postMessage({ type: 'grindfy:library:scroll', payload: { percent } }, '*');
  lastScrollSent = Date.now();
}
window.addEventListener('scroll', () => {
  if (scrollTimeout) return;
  scrollTimeout = setTimeout(() => {
    reportScroll();
    scrollTimeout = null;
  }, 1000);
});

// Re-implementar handlers de flashcards/accordion via addEventListener (D11 — substitui onclick inline)
document.addEventListener('DOMContentLoaded', () => {
  // Flashcards
  document.querySelectorAll('[data-flashcard-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const targetId = btn.getAttribute('data-flashcard-toggle');
      const target = document.getElementById(targetId);
      if (target) target.classList.toggle('flashcard-revealed');
    });
  });
  // Accordion
  document.querySelectorAll('[data-accordion-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const sectionId = btn.getAttribute('aria-controls');
      const section = document.getElementById(sectionId);
      if (section) {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        section.hidden = expanded;
      }
    });
  });
  // Recall (input/check pattern do conteudo bruto)
  document.querySelectorAll('[data-recall-check]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const wrapper = btn.closest('[data-recall]');
      if (wrapper) wrapper.classList.add('recall-checked');
    });
  });
});
```

> **Importante:** os data-attribute names (`data-flashcard-toggle`, `data-accordion-toggle`, `data-recall-check`) devem bater com os usados no HTML do conteudo bruto. Se o conteudo bruto usa nomes diferentes, founder valida + script de transform (RF-11) ajusta. **Pendencia:** RF-11 + founder review.

**Parent dispara PATCH progress on scroll-depth:**

```tsx
// Dentro de LessonViewer
const articleProgressMutation = useMutation({
  mutationFn: (percent: number) => apiRequest('PATCH', `/api/library/lessons/${lessonId}/progress`, {
    format: 'article',
    lastPositionSeconds: Math.floor(percent),  // article usa percent como "segundos" (contrato proxy)
    totalDurationSeconds: 100,                 // hardcoded 100 — backend computa completed se >=95
  }),
});

const lastSentPercent = useRef(0);
function handleScrollDepth(percent: number) {
  if (Math.abs(percent - lastSentPercent.current) < 5) return;  // dedup 5%
  lastSentPercent.current = percent;
  articleProgressMutation.mutate(percent);
}
```

**Por que `totalDurationSeconds: 100` proxy:** schema `library_progress` foi pensado pra video/audio em segundos. Article nao tem "duracao em segundos". Solucao mais simples = usar percent como segundos (0-100) e 100 como total. `completedAt` dispara em >= 95% naturally.

**Criterios de aceitacao:**
- [ ] `<iframe sandbox="allow-scripts">` NUNCA tem `allow-same-origin` no atributo
- [ ] Iframe altura ajusta dinamicamente quando conteudo cresce (test via mock postMessage)
- [ ] Cap altura respeitado: postMessage com height 99999 cap em 50000
- [ ] postMessage de origem fora do iframe ignorada (test: `event.source` invalido)
- [ ] Scroll-depth callback chamado com percent 0-100 (test mock)
- [ ] Scroll-depth dedup 5%: 4% delta ignorado, 6% delta dispara mutation
- [ ] PATCH progress chamado com `format: 'article'` quando scroll detectado
- [ ] `<title>` no srcdoc bate com `bundle.meta.title`
- [ ] HTML escaped corretamente em `<title>` (XSS defense)
- [ ] Iframe `title` attribute presente para a11y (`Aula: A.1 Mentalidade Fixa`)
- [ ] Container do iframe tem `data-testid="library-article-iframe"` para tests E2E
- [ ] Componente reagindo a unmount: `removeEventListener('message')` chamado (test cleanup)

**Dependencias:** RF-04 (article-bundle endpoint), RF-11 (`lesson.js.transformed` uploaded).

---

### RF-07 — Watermark Overlay Sobre Iframe

**O que faz.** Adiciona componente watermark sobre o `<iframe>` no DOM do parent, preservando ADR-076 (intensidade atual).

**Componente:**

```tsx
// client/src/components/biblioteca/ArticleIframeWithWatermark.tsx
function ArticleIframeWithWatermark({ lessonId, userPlatformId, onScrollDepth }: Props) {
  return (
    <div className="relative">
      <ArticleIframe lessonId={lessonId} userPlatformId={userPlatformId} onScrollDepth={onScrollDepth} />
      <div
        className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
        aria-hidden="true"
      >
        {/* 6 instancias diagonais — mesma logica do MuxPlayer watermark */}
        {WATERMARK_POSITIONS.map((pos, i) => (
          <div
            key={i}
            className="absolute text-white/[0.15] text-2xl font-mono select-none"
            style={{
              top: pos.top,
              left: pos.left,
              transform: 'rotate(-30deg)',
              whiteSpace: 'nowrap',
            }}
          >
            {userPlatformId}
          </div>
        ))}
      </div>
    </div>
  );
}

const WATERMARK_POSITIONS = [
  { top: '10%', left: '15%' },
  { top: '25%', left: '70%' },
  { top: '45%', left: '30%' },
  { top: '55%', left: '80%' },
  { top: '75%', left: '20%' },
  { top: '90%', left: '60%' },
];
```

**Trade-off (D9 do strategy doc):**
- `pointer-events: none` essencial — wheel scroll e click-through atravessam o overlay para o iframe internamente.
- Watermark NAO cobre dinamicamente conforme iframe cresce (overlay altura = altura do container, que cresce com `iframeHeight` state). 6 posicoes baseadas em `%` se distribuem proporcionalmente. Aceitavel para MVP.
- Screenshot/print captura watermark (defense superficial vs reupload bruto).

**Criterios de aceitacao:**
- [ ] Overlay renderiza com 6 instancias de `userPlatformId`
- [ ] `pointer-events: none` confirmado via getComputedStyle
- [ ] `aria-hidden="true"` presente (screen reader nao le)
- [ ] Click no iframe atravessa overlay (test via `userEvent.click` + iframe contentWindow handler)
- [ ] Wheel scroll no overlay atravessa pro iframe (test manual ou puppeteer)
- [ ] Sem `userPlatformId` (anonymous) → overlay nao renderiza (defense — sem ID, sem watermark sentido)

**Dependencias:** RF-06.

---

### RF-08 — Migration 0033: `learning_objectives JSONB`

**O que faz.** Adiciona coluna `learning_objectives JSONB NOT NULL DEFAULT '[]'::jsonb` em `library_lessons`.

**Schema Drizzle (`shared/schema.ts:3618`):**

```ts
export const libraryLessons = pgTable(
  "library_lessons",
  {
    // ... campos existentes
    articleHtml: text("article_html"),
    articleWordCount: integer("article_word_count"),
    learningObjectives: jsonb("learning_objectives")    // NOVO
      .notNull()
      .default(sql`'[]'::jsonb`),
    displayOrder: integer("display_order").notNull().default(0),
    // ... resto
  },
  // ... indices
);
```

**Tipagem:**
- `LibraryLesson.learningObjectives: string[]` (`$inferSelect`).
- Insert schema (`insertLibraryLessonSchema`): `learningObjectives: z.array(z.string()).default([])`.
- Validar shape: cada item eh string nao-vazia, max 200 chars cada, max 10 items por aula.

**Migration file: `migrations/0033_library_learning_objectives.sql`**

```sql
ALTER TABLE library_lessons
  ADD COLUMN learning_objectives JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Optional: GIN index para busca por objetivo (futuro feature)
-- CREATE INDEX idx_library_lessons_learning_objectives ON library_lessons USING gin(learning_objectives);
```

**Migration apply (founder):**
```bash
npm run db:push
```

**Back-fill:** Default cobre rows existentes. Sem necessidade de back-fill manual.

**Criterios de aceitacao:**
- [ ] Migration aplica sem erro em DB com Bloco A ja seedado (caso founder rode RF-10 antes de RF-08 — improvavel mas defesa)
- [ ] `npm run check` passa apos schema update
- [ ] `LibraryLesson` type inclui `learningObjectives: string[]`
- [ ] `insertLibraryLessonSchema.parse({ ..., learningObjectives: ['x'] })` valida
- [ ] `insertLibraryLessonSchema.parse({ ... /* sem learningObjectives */ })` valida com default `[]`
- [ ] Insert de array com 11 items rejeitado (cap 10)
- [ ] Insert de string vazia rejeitado
- [ ] Insert de string >200 chars rejeitado

**Dependencias:** Nenhuma (migration standalone).

---

### RF-09 — Manifest Importer Adaptado pra Bloco A

**O que faz.** Edita `server/services/manifestImporter.ts` para:
1. Extrair `learning_objectives` do HTML automaticamente (D5).
2. Aceitar config Bloco A (audio `m4a`, MIME `audio/mp4`, scope `library/audio`).
3. Cap por arquivo elevado de 50MB → 30MB (audio comprimido cabe — max A6 = 14.1MB).

**Mudancas:**

#### 9.A. Extracao de learning_objectives

Antes de salvar `articleHtml` (apos sanitize), parsear:

```ts
function extractLearningObjectives(html: string): string[] {
  // Match <div class="learning-objectives" OR <div class="learning_objectives" OR <div class="objectives"
  const containerMatch = html.match(
    /<div[^>]*class\s*=\s*["'][^"']*\b(learning[-_]objectives|objectives)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );
  if (!containerMatch) return [];
  const inner = containerMatch[2];
  const liMatches = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  return liMatches
    .map(m => stripHtmlTags(m[1]).trim())
    .filter(s => s.length > 0 && s.length <= 200)
    .slice(0, 10);  // cap 10 (D4 limit)
}
```

Salvar em `learningObjectives` no `upsertLibraryLessonBySlug` call.

#### 9.B. Config Bloco A (audio extension + MIME + scope)

Atualmente o manifest importer detecta `ext` do `originalname` (`A1.mp4` → `mp4`, `A1.m4a` → `m4a`). Para Bloco A, audios chegam como `.m4a`, MIME `audio/mp4`. Mudancas:

- `mediaStorage.put({ scope: 'library/audio', ext: 'm4a', buffer, mime: 'audio/mp4' })` — ja eh assim, validar.
- `audioMimeType` sempre setado pra `audio/mp4` quando ext = `m4a` (default schema ja eh).
- **Sem reencode**, sem ffprobe (deferido).

#### 9.C. Cap multer por arquivo

Atualmente `multer({ limits: { fileSize: 50 * 1024 * 1024 } })` por arquivo. Total batch eh somatorio (sem limit total enforced no multer; controle via N requests).

Mudanca: **manter 50MB por arquivo** (ja cabe — max A6 = 14.1MB). Total batch Bloco A = 95.4MB audio + ~26KB CSS + alguns KB JS + 9 capas (~18MB) = ~115MB. **Cap total batch elevado pra 150MB** via novo limit `multer.fields().limits.totalFileSize` ou validacao manual no handler.

**Decisao simplificada:** ja existe `manifestImporter` com cap 100 rows. Adicionar validacao early no handler:

```ts
// Em library-register.ts handler de import-manifest
const totalSize = req.files.reduce((acc, f) => acc + f.size, 0);
if (totalSize > 150 * 1024 * 1024) {
  return res.status(413).json({ message: 'batch_too_large', totalSize, cap: 150 * 1024 * 1024 });
}
```

#### 9.D. CSV columns suportadas

Manifest importer ja aceita as colunas necessarias (`audio_filename`, `cover_filename`, etc). Confirmar suporte pra:
- `learning_objectives` como column manual (override do auto-extracted) — **opcional, default = auto-extract**. Aceita JSON array string `'["obj 1","obj 2"]'`.

#### 9.E. Importer logging

Adicionar log estruturado por lesson:

```
[manifestImporter] lesson "a1-mentalidade-fixa" imported: html=12.4KB audio=13.5MB cover=1.8MB learningObjectives=4
```

**Criterios de aceitacao:**
- [ ] HTML A.1 (que tem `<div class="learning-objectives"><ul><li>...4 itens...</li></ul></div>`) gera array de 4 strings em `learningObjectives`
- [ ] HTML sem `learning-objectives` salva `[]`
- [ ] Variantes `learning_objectives` e `objectives` reconhecidas
- [ ] Cap 10 items aplicado (li #11 dropped)
- [ ] String >200 chars dropped
- [ ] String vazia dropped
- [ ] M4A com MIME `audio/mp4` aceito (test mock multer)
- [ ] `audioMimeType` salvo como `audio/mp4` no DB
- [ ] Batch total >150MB rejeitado com 413
- [ ] Batch dentro do cap aceito
- [ ] Manual override via CSV column funciona (auto-extract NAO sobrescreve)
- [ ] Log estruturado por lesson presente

**Dependencias:** RF-08 (`learning_objectives` column existe).

---

### RF-10 — Script CLI: `library-upload-bloco-a.ts`

**O que faz.** Script Node/tsx que itera pasta do Bloco A, monta CSV manifest em runtime, e chama `POST /api/admin/library/import-manifest` em 1 chamada com 9 audios + 9 HTMLs + 9 capas.

**Arquivo:** `scripts/library-upload-bloco-a.ts`

**CLI signature:**

```bash
npx tsx scripts/library-upload-bloco-a.ts \
  [--source <path>] \
  [--api-base <url>] \
  [--admin-token <jwt>] \
  [--dry-run] \
  [--resume]

# Defaults:
#   --source     = "C:/Users/ricar/OneDrive/Desktop/A anatomia de um Spot/00 - Antes das Cartas/Bloco A - Fundamentos Mentais"
#   --api-base   = "http://localhost:3000"
#   --admin-token= ler de env GRINDFY_ADMIN_TOKEN
#   --dry-run    = monta CSV + lista files mas NAO faz POST
#   --resume     = pula episodios cujo slug ja existe na API (le GET /api/library/courses/antes-das-cartas)
```

**Comportamento:**

1. Verifica `--source` exists e contem subpasta `compressed/` (validacao).
2. Lista arquivos:
   - 9 .m4a em `compressed/A{N} - {titulo}.m4a`
   - 9 .html em raiz `A{N} - {titulo}.html`
   - 9 .jpeg em `Capas/A{N}.jpeg`
3. Monta CSV manifest em buffer:
   ```
   type,course_slug,course_title,subtitle,description,...
   course,antes-das-cartas,Antes das Cartas,Curso 00...,...
   module,antes-das-cartas,bloco-a-fundamentos-mentais,Bloco A...,
   lesson,antes-das-cartas,bloco-a-fundamentos-mentais,a1-mentalidade-fixa-vs-crescimento,...
   ... (9 lessons)
   ```
4. Mapeamento por slug:
   ```ts
   const LESSONS = [
     { episode: 'A1', slug: 'a1-mentalidade-fixa-vs-crescimento', title: 'Mentalidade Fixa vs Mentalidade de Crescimento', subtitle: '...', tags: ['mentalidade','neurociencia','spot-acao','recall'], displayOrder: 1 },
     { episode: 'A2', slug: 'a2-dicotomia-do-controle', title: 'A Dicotomia do Controle', subtitle: '...', tags: ['mentalidade','estoicismo','fronteira','controle'], displayOrder: 2 },
     // ... A3-A9
   ];
   ```
   Ver §9 do strategy doc para tabela completa.
5. `--resume`:
   - Faz `GET /api/library/courses/antes-das-cartas` antes do POST.
   - Se 404 → procede com upload completo.
   - Se 200 → monta CSV apenas com lessons cujo slug NAO existe na response. Se todas existem, exit 0 com message "all up-to-date".
6. `--dry-run`:
   - Imprime stdout: `Would upload: course=antes-das-cartas, module=bloco-a-fundamentos-mentais, lessons=[a1-...,a2-...,...]`.
   - Lista files com size: `[a1] audio: 13.5MB, html: 12.4KB, cover: 1.9MB`.
   - Sem network call.
7. POST request:
   - `Content-Type: multipart/form-data`
   - Field `manifest` = CSV buffer
   - Fields `files[]` = todos os 27 arquivos (9 audio + 9 html + 9 cover)
   - Header `Authorization: Bearer ${ADMIN_TOKEN}`
8. Response handling:
   - 200 → log success: `imported {courseId, lessons: N}`. Exit 0.
   - 400/401/403/413 → log error com response body. Exit 1.
   - Network error → log + sugerir `--resume`. Exit 2.

**categoryId default para Bloco A:** `'performance_mental'` (validar contra `LIBRARY_CATEGORIES` enum).

**Idempotencia:**
- Mesmo CSV rodado 2x → upsert por slug → mesmo resultado, lessons reusadas. Ja garantido pelo manifest importer existente (Spec 1 RF-11).
- Capas e audios re-uploaded geram **novos keys** no FS (nanoid21). Cleanup dos keys antigos NAO eh feito (out of scope; founder remove manual se necessario).

**Resume real:**
- Se upload de A6 falhar (timeout), founder roda `--resume` que pula A1-A5 (ja existem), tenta A6-A9.

**Criterios de aceitacao:**
- [ ] `--dry-run` lista 9 lessons com paths corretos
- [ ] `--dry-run` NAO faz network call (testavel via mock fetch)
- [ ] Run real com 9 episodios + RF-09 importer = curso completo no DB + capas+audios no FS
- [ ] Rerun sem `--resume` = upsert idempotente (curso continua, sem duplicate keys)
- [ ] `--resume` pula lessons existentes (mock GET courses returns 4 lessons → CSV inclui apenas 5)
- [ ] `--resume` com tudo existente exit 0 + message "all up-to-date"
- [ ] `--admin-token` ausente + env `GRINDFY_ADMIN_TOKEN` ausente → exit 1 com clear error
- [ ] `--source` invalido → exit 1 com message claro
- [ ] Pasta `compressed/` ausente → exit 1
- [ ] HTML sem learning-objectives importa com `[]` (sem fail)
- [ ] Tags por episode batem com tabela §9 do strategy doc
- [ ] Tabela completa de 9 lessons hardcoded em `LESSONS` const

**Dependencias:** RF-01 (storage), RF-04 (endpoint admin import-manifest), RF-08 (column), RF-09 (importer). Founder precisa ter `GRINDFY_ADMIN_TOKEN` valido.

---

### RF-11 — Script CLI: `library-upload-static-assets.ts`

**O que faz.** Script Node/tsx que faz upload one-shot do `_assets/styles.css` + transforma `_assets/lesson.js` (substituindo `onclick` inline por `addEventListener`) e sobe ambos como assets fixos.

**Arquivo:** `scripts/library-upload-static-assets.ts`

**CLI signature:**

```bash
npx tsx scripts/library-upload-static-assets.ts \
  [--source <path>] \
  [--api-base <url>] \
  [--admin-token <jwt>] \
  [--dry-run] \
  [--skip-confirmation]

# Defaults:
#   --source           = "C:/Users/ricar/OneDrive/Desktop/A anatomia de um Spot/00 - Antes das Cartas/_assets"
#                        (se nao existir, fallback "../00 - Antes das Cartas/_assets" relativo ao cwd)
#   --api-base         = "http://localhost:3000"
#   --admin-token      = env GRINDFY_ADMIN_TOKEN
#   --dry-run          = imprime diff mas nao sobe
#   --skip-confirmation= pula prompt interativo (cuidado em CI)
```

**Comportamento:**

1. Le `_assets/styles.css` do disco. Hash sha256.
2. Le `_assets/lesson.js`. Aplica transform:
   - Regex global: `onclick="..."` → remove + collect handler
   - Build new function `attachOriginalHandlers()` que aplica handlers via `addEventListener` em DOMContentLoaded
   - Append na saida `lesson.js.transformed`
   - Append blocos resize observer + scroll-depth + flashcard/accordion/recall handlers (do RF-06 spec, secao "Logica do `lesson.js.transformed`")
3. Salva `lesson.js.transformed` em `<source>/lesson.js.transformed`.
4. Print diff (lines added/removed).
5. Sem `--skip-confirmation`: prompt `"Aplicar e fazer upload? (y/N)"`. Aborta se `n` ou Enter.
6. POST endpoint novo `POST /api/admin/library/static-asset` (criar — validar na sessao):
   ```
   POST /api/admin/library/static-asset
   Auth: requireAuth + requirePermission('admin_full')
   Content-Type: multipart/form-data
   Fields:
     - kind: 'styles' | 'scripts'
     - file: File
   Response 200: { kind, key: 'library/static/article-{kind}.{css|js}', size, sha256 }
   ```
7. POST styles primeiro, depois scripts.
8. Apos sucesso, GET de validacao: `GET /api/library/static/article-styles.css` + `.js`. Confirma 200.

**Endpoint backend novo `/api/admin/library/static-asset`:**

```ts
// server/routes/library-register.ts
router.post(
  '/api/admin/library/static-asset',
  requireAuth,
  requirePermission('admin_full'),
  upload.single('file'),
  async (req, res) => {
    const kind = req.body.kind;
    if (!['styles', 'scripts'].includes(kind)) return res.status(400).json({ message: 'invalid_kind' });
    const ext = kind === 'styles' ? 'css' : 'js';
    const mime = kind === 'styles' ? 'text/css' : 'application/javascript';
    const key = `library/static/article-${kind}.${ext}`;
    const result = await mediaStorage.putAtFixedKey(key, req.file.buffer, mime);
    res.json({ kind, key, size: result.size, sha256: result.sha256 });
  }
);
```

**Cap upload:** 5MB por arquivo (CSS+JS de uma aula nunca passa de 100KB; cap generoso pra futuro).

**Transformer regex (lesson.js → lesson.js.transformed):**

```ts
function transformLessonJs(source: string): { transformed: string; removedHandlers: number } {
  // Captura todos onclick="..." + collect targets
  const onclickRegex = /\s+onclick\s*=\s*["']([^"']+)["']/gi;
  let match;
  const handlers: Array<{ selector: string; code: string }> = [];

  // Strip onclicks NAO acontece aqui — onclicks moram no HTML, nao no lesson.js.
  // Transform real: append blocks de boilerplate (resize, scroll, flashcard handlers, etc).

  const boilerplate = `
/* Grindfy library scripts — autogenerated */
(function() {
  function reportHeight() { /* ... */ }
  /* + scroll, flashcard, accordion, recall handlers conforme RF-06 */
})();
`;

  return { transformed: source + '\n' + boilerplate, removedHandlers: 0 };
}
```

> **Reformatacao:** transform NAO eh do `lesson.js` (ele nao tem `onclick`). Os `onclick` inline moram nos **HTMLs**, mas isso NAO eh problema desta spec — eles sao **removidos pelo sanitizer** (RF-02 mantem `FORBID_ATTR: ['onclick', ...]`). O `lesson.js.transformed` **adiciona** os handlers via data-attributes que **substituem** a funcionalidade dos onclicks removidos. **Founder precisa garantir que HTML usa `data-*`** alem ou em vez de `onclick`. Validar no review do conteudo bruto durante implementer.

**Pivot do transformer:** o transform na verdade eh **append de boilerplate** + opcionalmente parsing dos HTMLs do bloco para descobrir quais data-attributes usar. **Decisao MVP:** boilerplate hardcoded com `data-flashcard-toggle`, `data-accordion-toggle`, `data-recall-check`. Founder valida que HTML do A.1 usa esses nomes; se diferente, ajusta no script ou no HTML antes de upload.

**Criterios de aceitacao:**
- [ ] Script le `styles.css` + `lesson.js` do disco
- [ ] `lesson.js.transformed` salvo em `<source>/lesson.js.transformed`
- [ ] Transform append boilerplate com handlers postMessage + flashcard/accordion/recall
- [ ] Print diff antes de upload
- [ ] `--skip-confirmation` ausente: prompt interativo (`y/N`)
- [ ] `--dry-run` NAO faz POST
- [ ] POST styles + scripts in sequence
- [ ] Validation GET apos upload: 200 com hash diferente do anterior
- [ ] `--admin-token` invalido → exit 1
- [ ] Endpoint `POST /api/admin/library/static-asset` rejeita kind invalido com 400
- [ ] Endpoint requer admin_full (403 sem permissao)
- [ ] `lesson.js.transformed` parseable como JS valido (test `acorn.parse` ou `vm.compileFunction`)

**Dependencias:** RF-03 (endpoints static read), `mediaStorage.putAtFixedKey` helper (criar — RF-03 implementacao).

---

## 6. Modelo de Dados (Diagrama Textual)

```
+---------------------------+
|   library_courses         |
|   (existing, Bib-1)       |
+---------------------------+
            |
            +--<--+ library_modules
                       |
                       +--<--+ library_lessons      <-- ALTER TABLE (RF-08)
                                +-- learning_objectives JSONB    [NEW]
                                +-- articleHtml (sanitized RF-02)
                                +-- audioKey -> mediaStorage 'library/audio'
                                +-- coverKey -> mediaStorage 'library/covers'
                                |
                                +-- library_lesson_assets (existing, no change)
                                +-- user_lesson_access (existing)
                                +-- library_events (existing)
                                +-- library_progress (existing)

+---------------------------+
|   mediaStorage (FS local) |
|   (existing, Bib-1)       |
+---------------------------+
   uploads/library/audio/{nanoid21}.m4a
   uploads/library/covers/{nanoid21}.jpeg
   uploads/library/static/article-styles.css       [NEW — fixed key]
   uploads/library/static/article-scripts.js       [NEW — fixed key]
```

ERD detalhado: ver Spec 1 §7 + RF-08 desta spec. `system-architect` cria ADR-077 documentando iframe sandbox decision + protocolo postMessage.

---

## 7. Endpoints — Sumario de Mudancas

### Endpoints novos (RF-03, RF-04, RF-11)

| Metodo | Rota | Auth | Permission | Descricao | RF |
|---|---|---|---|---|---|
| GET | `/api/library/static/article-styles.css` | nenhuma | — | Serve CSS dos artigos (publico, cache 30d) | RF-03 |
| GET | `/api/library/static/article-scripts.js` | nenhuma | — | Serve JS dos artigos (publico, cache 30d) | RF-03 |
| GET | `/api/library/lessons/:id/article-bundle` | JWT | lesson access | Bundle html+stylesUrl+scriptsUrl+meta | RF-04 |
| POST | `/api/admin/library/static-asset` | JWT | admin_full | Upload styles/scripts fixos | RF-11 |

Total: **4 endpoints novos** (somando aos 12 da Biblioteca-1 = 16 total).

### Endpoints inalterados (mas dependem de RF-01)

Todos os 12 da Biblioteca-1 ja registrados em `library-register.ts` voltam a funcionar quando storage methods sao implementados (eram 500 → viram 200/4xx corretos).

---

## 8. UI/UX Wireframe Textual (Delta vs Spec 1)

### 8.1. `/biblioteca/curso/antes-das-cartas/{lesson-slug}` — Layout 2-col Desktop

```
Biblioteca > Antes das Cartas > Bloco A > A.1

┌── A.1 - Mentalidade Fixa vs Mentalidade de Crescimento ─┐
│  Performance Mental | 13min | mentalidade,neurociencia │
└─────────────────────────────────────────────────────────┘

[ Podcast ] [ Artigo ]   ← tabs (Video escondida; D7)
─────────                 (em layout 2-col, tabs servem de a11y/ancora)

┌─────────────────────────────────┬──────────────────────────────┐
│                                 │                              │
│   IFRAME SRCDOC                 │   PODCAST PLAYER             │
│   (HTML rico interativo)        │   ┌──────────────┐           │
│                                 │   │  capa A1     │           │
│   - Section: Conceito           │   │  16:9        │           │
│   - Flashcards (data-toggle)    │   └──────────────┘           │
│   - Accordion ciencia           │   [<<] [▶] [>>]              │
│   - Recall check                │   13:24 / 14:00              │
│                                 │   [1.0x ▼]                   │
│   [watermark overlay USER-1234] │                              │
│   pointer-events:none           │                              │
│                                 │                              │
│   altura dinamica via           │                              │
│   postMessage resize            │                              │
│                                 │                              │
└─────────────────────────────────┴──────────────────────────────┘

▓▓▓▓▓▓▓▓░░░░░░░░░░░  scroll-depth: 42%
```

### 8.2. `/biblioteca/curso/antes-das-cartas/{lesson-slug}` — Mobile (<lg)

```
Biblioteca > Antes das Cartas > Bloco A > A.1

[ Podcast ] [ Artigo ]   ← tabs (Video escondida; padrao tab activa)
═════════

┌─────────────────────────────────┐
│                                 │
│   IFRAME SRCDOC                 │   ← ou Podcast player conforme tab
│   altura dinamica               │
│                                 │
└─────────────────────────────────┘
```

### 8.3. Fluxo founder upload

```
1. founder OneDrive → "Bloco A" → ja tem compressed/ + Capas/ + .html
2. cd grindfy
3. npx tsx scripts/library-upload-static-assets.ts   (1x; fala "y" pra confirm)
   → uploads/library/static/article-styles.css  +  article-scripts.js
4. npx tsx scripts/library-upload-bloco-a.ts
   → POST /api/admin/library/import-manifest com 27 arquivos
   → log: "imported course=antes-das-cartas, lessons=9"
5. npx tsx scripts/library-grant-bloco-a.ts --user-id USER-XXXX
   (script auxiliar OPCIONAL; ou direto via Spec 1 RF-04 endpoint)
6. browser: /biblioteca → "Antes das Cartas" → A.1 → ver iframe + podcast
```

---

## 9. Plano de Testes

### 9.1. Unit (Vitest + node project)

**Server:**
- Cada um dos 18 storage methods: happy + edge case + Drizzle query shape
  - `listLibraryCourses`: filtro `onlyPublished`, ordering, lessonCount, hasAnyAccess
  - `getLibraryCourseBySlug`: joins corretos, formats[] derivado, 404 quando slug invalido
  - `upsertLibraryCourseBySlug`: insert vs update vs idempotent re-update
  - `bulkGrantLessonAccess`: idempotencia, alreadyHadAccess counter
  - `upsertLibraryProgress`: completedAt threshold 95% (boundary 94.9% nao marca, 95.0% marca)
  - `findLibraryLessonsByCategory`: ordering por progressState
  - ... etc para os 18
- `htmlSanitizer` (RF-02): novas tags aceitas + tags maliciosas bloqueadas
  - `<section class="x">...</section>` mantido
  - `<button data-x="y">click</button>` mantido com data-attr
  - `<style>.foo { ... }</style>` mantido (tag style)
  - `<button onclick="alert(1)">` → `<button>` (handler stripped)
  - `<a href="javascript:void(0)">` → `<a>` (URL bloqueada)
  - `<div style="color:red">` → `<div>` (atributo style bloqueado)
  - `<script>alert(1)</script>` → vazio (tag bloqueada)
- `extractLearningObjectives` (RF-09):
  - HTML A.1 real (4 itens) → array 4 strings
  - HTML sem `learning-objectives` div → `[]`
  - Variantes de class name (`learning-objectives`, `learning_objectives`, `objectives`)
  - 11 li → cap 10
  - `<li><strong>X</strong> Y</li>` → "X Y" (tags strip)
- `transformLessonJs` (RF-11): boilerplate appended, valid JS output (parseable)
- `mediaStorage.putAtFixedKey` (RF-03): sobrescreve key fixa, retorna size+sha256

**Frontend:**
- `ArticleIframe` (RF-06):
  - Renderiza `<iframe sandbox="allow-scripts">` (NAO same-origin)
  - postMessage resize → `iframeHeight` state atualiza
  - postMessage scroll-depth → callback chamado com percent valido
  - postMessage com `event.source` invalido → ignorado
  - Cap altura 50000
  - Cleanup `removeEventListener` em unmount
- `ArticleIframeWithWatermark` (RF-07): 6 instancias, pointer-events:none, aria-hidden
- `LessonViewer` (RF-05):
  - 1 formato → tab unica + painel full-width
  - 2 formatos + viewport >= lg → grid 2-col
  - 2 formatos + viewport < lg → tabs single-panel
  - 3 formatos → tabs single-panel sempre
  - Tab Video NAO renderizada quando formats.video ausente

### 9.2. Integration (Vitest + jsdom + supertest)

- `GET /api/library/courses`: 200 com curso seedado
- `GET /api/library/courses/antes-das-cartas`: 200 com 9 lessons
- `GET /api/library/lessons/:id/article-bundle`:
  - 401 sem auth
  - 401 com auth mas sem grant
  - 404 lesson sem articleHtml
  - 503 quando static assets ausentes
  - 200 happy path com html+stylesUrl+scriptsUrl+meta
- `GET /api/library/static/article-styles.css`:
  - 200 com Content-Type text/css
  - 503 antes de upload
  - ETag header presente
  - 304 com If-None-Match correto
  - Cache-Control max-age=2592000 immutable
- `POST /api/admin/library/static-asset`:
  - 403 sem admin
  - 400 kind invalido
  - 200 happy path styles
  - 200 happy path scripts
  - sobrescreve key existente (re-upload)
- `POST /api/admin/library/import-manifest` (RF-09 mudancas):
  - HTML com `learning-objectives` → DB tem array preenchido
  - HTML sem → `[]`
  - Batch >150MB → 413
  - M4A com MIME `audio/mp4` aceito
  - Idempotente (rerun nao duplica lessons)

### 9.3. E2E mocked (test-writer pode adicionar — opcional MVP)

- Founder fluxo: dry-run static-assets → confirm → upload → dry-run bloco-a → confirm → upload → fetch /biblioteca → curso aparece
- Alpha tester: GET /api/library/lessons/:id/article-bundle → recebe bundle → renderiza iframe → postMessage flow
- Sanitizer + iframe: payload XSS no DB nao executa em iframe (sanitizer + sandbox)

### 9.4. Cobertura Minima Esperada

- 80% coverage em `server/storage.ts` (apenas dos 18 metodos novos)
- 90% coverage em `htmlSanitizer.ts` (critico)
- 80% coverage em `manifestImporter.ts` (RF-09 mudancas)
- 75% coverage em `ArticleIframe.tsx` + `ArticleIframeWithWatermark.tsx`
- 70% coverage em `LessonViewer.tsx` (delta RF-05)
- Scripts CLI (RF-10/11): smoke tests em `tests/scripts/` — happy path + dry-run + admin token missing

### 9.5. Test Data Fixtures Adicionais

- 1 HTML fixture com `<div class="learning-objectives"><ul><li>obj1</li><li>obj2</li></ul></div>` para test extractor
- 1 HTML fixture maligno (`<button onclick="...">` + `<style>` + `<a href="javascript:...">`) para test sanitizer
- 1 lesson fixture sem articleHtml (so audio) para test 404 article-bundle
- 1 lesson fixture sem audioKey (so article) para test layout 1-format
- 1 lesson fixture com 3 formatos (mock) para test layout 3-format

### 9.6. Regression Check

- Todos os **213 testes da Biblioteca-1 continuam verdes** (zero regression em lessons/components/endpoints existentes).
- Baseline +20 (Biblioteca-1 entrega) preservada.
- Novos testes esperados: +60 a +90 (18 storage + sanitizer + extractor + iframe + endpoints + scripts).
- Total esperado pos-Biblioteca-2: ~273-300 testes biblioteca + total projeto >7700.

---

## 10. Riscos e Mitigations

Originados do `Docs/strategy/biblioteca-bloco-a-launch.md` §8, atualizados pos-addendum compressao audio.

| ID | Risco | Severidade | Mitigacao |
|---|---|---|---|
| **R1** | iframe sandbox quebra screen-reader (NVDA/VoiceOver podem nao entrar no iframe automaticamente) | Media | `<iframe title="...">` ARIA region + aria-label apontando pro conteudo. Document na ADR-077 que a11y screen-reader fica em "Best effort MVP — testar pos-deploy com NVDA/VO". Spec Polish (post-Bloco-A) faz revisao a11y formal. |
| **R2** | HTML do Bloco A pode usar `onclick=` inline em vez de `data-*` attrs → handlers mortos pos-sanitize | Alta | Founder valida HTML do A.1 antes de RF-10 rodar. Se HTML usa `onclick`, founder ajusta os 9 HTMLs (sed/find-replace local) ou implementer faz fix no sanitizer pra **converter** `onclick="X"` em `data-onclick-orig="X"` (nao executa, mas preserva pra script transformer pegar). **Decisao MVP:** founder ajusta HTML manual. ~1h trabalho. |
| **R3** | Audio NotebookLM 12-14MB ainda pode travar 4G ruim (sem CDN MVP) | Baixa | Range header ja implementado (Spec 1). Pre-load `metadata` only (HTML5 default). CDN no deploy futuro. Aceitavel pra alpha local. |
| **R4** | Sharp Win32 binary build problematico | NA | **Spec NAO usa sharp** (D12). Resize fica pra Sprint Polish. |
| **R5** | Capas A1 duplicadas (existe `A1.jpeg` + `A1 - copia.jpeg` na pasta original?) | Baixa | Script RF-10 procura `Capas/A{N}.jpeg` exato. Se nao existe, usar `Capas/A{N} - copia.jpeg` fallback. Se nem isso, exit 1 com message clara. Founder valida antes do run. |
| **R6** | postMessage protocol vulneravel a iframes maliciosos sequestrando target | Media | Validar `event.source === iframeRef.current.contentWindow` em todo handler. Sem `allow-same-origin`, iframe nao pode forjar origens. Valid messages so vem de nosso srcdoc. |
| **R7** | Sanitizer expand allowlist abre vetores XSS novos | Alta | Tests rigorosos com payloads conhecidos. DOMPurify default config eh secure-by-default; explicit allowlist muito menor que default. Sandbox iframe eh defense layer 2. |
| **R8** | Storage methods Drizzle queries lentas (N+1 em `listLibraryCourses` com `lessonCount` + `hasAnyAccess`) | Media | Subqueries em vez de joins ate `EXPLAIN ANALYZE` mostrar problema. Spec 1 §6.1 ja menciona p95 < 200ms — validar com seed real Bloco A (9 lessons). |
| **R9** | Postgres JSONB validation insuficiente (string array com items invalidos vaza pra DB) | Baixa | Zod schema em `insertLibraryLessonSchema` valida antes do upsert. Server-side validation in front of DB. |
| **R10** | iframe height cap 50000 quebra aulas muito longas (curso 01 tera HTMLs de 200+KB) | Baixa | Aceitavel MVP. Bloco A maior HTML ~13KB (~1500px renderizado). Curso 01 valida em sprint posterior. |
| **R11** | Static assets endpoint sem auth = qualquer um na internet baixa CSS/JS | Baixa | CSS+JS publicos por design (nao tem PII; sao apenas estilos+handlers genericos). Nao incluem keys, tokens, paths de business logic. |

---

## 11. Fora de Escopo (Explicito)

Para evitar scope creep:

- **Prologo Netflix-style** (Sprint Bloco-A-Polish — Spec 3)
- **Sharp resize de capas** (Sprint Polish; capas brutas + lazy load aceitas no MVP)
- **Auto-redirect "proxima aula" ao 100% completion** (Sprint Polish)
- **Auto-skip prologue 5s** (Sprint Polish)
- **Botao Favoritos / "Adicionar a lista" funcional** (mockup `disabled` com tooltip; Spec 4 ou posterior)
- **Coach AI integration end-to-end** (storage pra `findLibraryLessonsByCategory` ja entra na RF-01; UI Coach `recommend_lesson` ja existe da Biblioteca-1; sem trabalho UI Coach novo aqui)
- **TXT NotebookLM search/transcript** (Spec futura)
- **Gamification (XP, streaks, badges)** (Spec futura)
- **Chunked upload pra arquivos >50MB** (DROPPED — addendum compressao audio resolveu)
- **`POST /api/admin/library/import-manifest-keys`** (DROPPED — addendum)
- **Stripe checkout + auto-grant em compra** (Spec 4)
- **CDN deploy / S3 storage backend** (Spec deploy)
- **A11y formal NVDA/VoiceOver test** (Sprint Polish — best-effort MVP)
- **Coach automatic trigger via Stats Analyzer** (Spec 2)
- **Breadcrumb sticky no LessonViewer (F10 strategy)** (Sprint Polish)
- **"Concluida" badge + auto-suggest proxima aula (F11 strategy)** (Sprint Polish)
- **Ffprobe duration extraction** (founder hardcode duracao no manifest; player reporta via `onLoadedMetadata` apos play)

---

## 12. Defaults Aplicados pras 10 Open Questions (Founder Valida Spec)

Strategy doc §8 levantou 10 questoes. Defaults aplicados nesta spec:

| # | Pergunta | Default aplicado | Onde |
|---|---|---|---|
| Q1 | Editar `lesson.js` (substituir `onclick` inline por `addEventListener`)? | **SIM, executar via SCRIPT** (`scripts/library-upload-static-assets.ts` aplica transform + prompt founder validar antes de upload) | RF-11, D11 |
| Q2 | Auto-skip prologue 5s? | **NAO** (Sprint Polish trata; sem prologue nesta spec) | Out of scope §11 |
| Q3 | `learning_objectives` extraidos automaticamente do HTML ou manuais no manifest? | **AUTO extracao do HTML** (manifest CSV pode override manualmente se necessario) | RF-09 (D5) |
| Q4 | Audio compressao? | **JA RESOLVIDO via addendum strategy doc**: 64k mono AAC, -74% size. Sem reencode adicional. | Strategy §11 |
| Q5 | Sharp em deps? | **NAO adicionar** nesta spec (D12). Capas brutas + lazy load. | D12, Out of scope §11 |
| Q6 | Botao Favoritos no MVP? | **DISABLED com tooltip "Em breve"** | D13 |
| Q7 | Prologue em todas aulas ou flag por curso? | **N/A nesta spec** (Sprint Polish) | Out of scope §11 |
| Q8 | TXT NotebookLM search agora ou Spec futura? | **Spec futura** (P2) | Out of scope §11 |
| Q9 | Watermark visivel ou subtil? | **Manter intensidade ADR-076 atual** (D10; 6 instancias diagonais, opacity 15%) | D10, RF-07 |
| Q10 | Auto-redirect pos-completion automatico? | **NAO** (Sprint Polish; sem auto-redirect MVP) | Out of scope §11 |

**ACAO PRO FOUNDER ANTES DE APROVAR:**

Confirmar **Q1 explicitamente**: "OK aplicar transform automatico em `lesson.js` via script + revisar diff antes do upload?" — esta eh a unica decisao com risco real (modifica codigo do curso original do Docari).

Demais defaults sao reversíveis ou de baixo risco. Se discordar de algum, pedir mudanca antes de spec → architect → testes.

---

## 13. Criterios de Aceitacao Globais

A spec eh considerada DONE quando:

- [ ] Todos os 11 RFs marcados DONE com criterios individuais ✓
- [ ] Migration 0033 aplicada em DB local sem erro
- [ ] `npm run check` passa (zero erros de typecheck)
- [ ] `npx vitest` passa: 213 testes Biblioteca-1 verdes + ~60-90 novos testes Biblioteca-2 verdes
- [ ] Founder roda `npx tsx scripts/library-upload-static-assets.ts` 1x e ve confirmacao success
- [ ] Founder roda `npx tsx scripts/library-upload-bloco-a.ts` 1x e ve "imported course=antes-das-cartas, lessons=9"
- [ ] Founder navega `/biblioteca` → ve curso "Antes das Cartas" com 9 lessons
- [ ] Founder abre A.1 (`/biblioteca/curso/antes-das-cartas/a1-mentalidade-fixa-vs-crescimento`) em desktop:
  - Ve grid 2-col (artigo a esquerda em iframe + podcast a direita)
  - HTML interativo: flashcards expandem ao click, accordion abre/fecha, recall funciona
  - Audio toca em Chrome+Firefox+Safari+Edge (smoke test 4 browsers)
  - Watermark visivel sobre iframe com `userPlatformId`
  - Tab Video NAO aparece (so Podcast + Artigo)
- [ ] Mobile (<lg): tabs Podcast/Artigo, painel single, comportamento atual mantido
- [ ] Scroll do iframe progresso salva via PATCH (test: scroll ate 96% → DB row tem `completedAt`)
- [ ] Coach `recommend_lesson` retorna lessons reais (RF-01 implementou `findLibraryLessonsByCategory`)
- [ ] All 18 storage methods implemented (zero `throw "not implemented"` em `server/storage.ts`)

---

## 14. Notas para system-architect (proximo agente)

`system-architect` deve criar:

1. **ADR-077 — Article-iframe-sandbox.** Documenta decisao iframe vs expand allowlist + protocolo postMessage + trade-offs (a11y, watermark overlay externo, scroll-depth via mensageria). Referencia ADR-076 (watermark) e Spec 1 D10 (sanitizer).

2. **Mermaid: Sequence Diagram do article-bundle flow.** User → LessonViewer → useQuery article-bundle → Server (auth + access check + getLibraryLesson + computeHashes) → Response → ArticleIframe srcdoc → iframe load → postMessage(resize) → state update → postMessage(scroll-depth) → PATCH progress.

3. **Mermaid: Sequence Diagram do upload founder flow.** Founder shell → script library-upload-static-assets → POST static-asset (CSS) → POST static-asset (JS) → mediaStorage putAtFixedKey × 2 → script library-upload-bloco-a → fetch /api/library/courses/antes-das-cartas (resume check) → POST import-manifest with 27 files → manifestImporter (sanitize + extractObjectives + storage uploads) → DB upserts × N.

4. **Atualizar `data-model-index.md`** mencionando `learning_objectives` em `library_lessons`.

5. **Decisao sobre `mediaStorage.putAtFixedKey`** — eh nova API publica. ADR ou nota arquitetural sobre consistency com layout existente.

`system-architect` PODE pedir esclarecimento ao founder antes de gerar ADR se identificar ambiguidade nesta spec.

---

## 15. Notas para test-writer (apos system-architect)

Pontos de atencao baseados em `lessons-learned.md`:

- **Lesson #2 (data-testid):** ArticleIframe tem `data-testid="library-article-iframe"`. ArticleIframeWithWatermark wrapper tem `data-testid="library-article-iframe-wrapper"`. Watermark instances: `data-testid="library-article-watermark-{i}"`.
- **Lesson #3 (mocks idealizados):** Validar shape REAL retornado pelos novos storage methods antes de mockar. Implementer + reviewer cruzam shapes.
- **Lesson #4 (Vitest 4):** Testes que rodam jsdom (LessonViewer, ArticleIframe) usam `test.projects.jsdom`. Testes server (storage, sanitizer, importer) usam `test.projects.node`.
- **Lesson #5 (`vi.fn` nao constructor):** se for mockar `mediaStorage`, lembrar try/catch fallback.
- **Lesson #11 (default minimo):** RF-05 D7 EXPLICITAMENTE pede esconder Tab Video — NAO eh "default decorativo". Documentar no test que isso eh policy explicit.
- **Lesson #13 (`apiRequest` retorna JSON):** RF-04 frontend usa `apiRequest('GET', url)` — mock retorna objeto direto, nao Response.
- **Coverage minimo §9.4 enforced.**

---

## 16. Notas para implementer (apos test-writer)

Implementacao tem 4 frentes paralelas razoaveis:

1. **Backend storage (RF-01)** — mais isolado. Pode comecar primeiro.
2. **Backend infra (RF-02 sanitizer + RF-03/04/11 endpoints + RF-08 migration + RF-09 importer)** — depende parcialmente de RF-01 (shared schemas).
3. **Frontend (RF-05 LessonViewer + RF-06 ArticleIframe + RF-07 watermark)** — depende de RF-04 endpoint estar pronto pra testar; pode usar mocks no inicio.
4. **Scripts CLI (RF-10/11)** — depende de tudo acima. Ultima frente.

**NAO modificar testes** durante implementer. Se teste falha por design errado, parar e levantar com user/reviewer.

---

## 17. Out-of-Spec Validations (founder valida durante implementer)

Itens que dependem do conteudo bruto e founder precisa validar conforme implementacao avanca:

- HTML A.1 usa class `learning-objectives` com `<ul><li>` formato? Confirmar antes de RF-09 test fixture.
- HTML usa `onclick` inline OU `data-*` attrs? Se onclick, founder ajusta antes de RF-10 run.
- `_assets/styles.css` + `_assets/lesson.js` existem nessa pasta? Confirmar antes de RF-11 run.
- Capas duplicadas (`A1 - copia.jpeg`) — founder seleciona qual usar; script RF-10 segue config.

---

*Spec 2 — gerada em 2026-05-03. Status: Proposta. Aguardando aprovacao do founder antes de prosseguir para `system-architect` e ADR-077.*
