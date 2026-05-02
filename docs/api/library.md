# API — Biblioteca (LMS embedded)

> Spec: `Docs/specs/biblioteca-spec-1.md`
> Schema: `Docs/architecture/data-model-index.md` secao "Library / LMS"
> ADRs: 071 (mediaStorage), 072 (Mux), 073 (entitlements), 074 (progress sync), 075 (Coach tool), 076 (HTML sanitize)
> Diagramas: `Docs/architecture/diagrams/biblioteca/`
> Status: skeleton — request/response bodies detalhados em **TBD pos-implementer**.

## Indice rapido (11 endpoints novos)

| Metodo | Rota | Auth | Permission | RF | Resumo |
|--------|------|------|------------|------|--------|
| GET | `/api/library/courses` | JWT | — | RF-05 | Lista cursos publicados + `hasAnyAccess` por curso |
| GET | `/api/library/courses/:slug` | JWT | — | RF-05 | Detalhe curso + modulos + lessons (com `hasAccess` por lesson) |
| GET | `/api/library/lessons/:id` | JWT | lesson access | RF-05 | Detalhe aula com 3 formatos disponiveis (video/podcast/article) |
| GET | `/api/library/lessons/:id/playback-token` | JWT | lesson access | RF-03 | Mux signed HLS URL TTL 4h + watermark text |
| GET | `/api/library/lessons/:id/audio` | JWT | lesson access | D9 | Stream M4A com Range header |
| GET | `/api/library/lessons/:id/progress` | JWT | lesson access | RF-06 | Progresso atual nos 3 formatos |
| PATCH | `/api/library/lessons/:id/progress` | JWT | lesson access | RF-06 | Upsert atomico (throttle servidor 5s) |
| POST | `/api/library/events` | JWT | lesson access | RF-06 | Evento fire-and-forget (rate limit 60/min/user) |
| GET | `/api/library/assets/:key` | JWT | — | RF-05 | Serve capa/asset generico via mediaStorage |
| POST | `/api/admin/library/grant-access` | JWT | admin_full | RF-04 | Libera N aulas para 1 user (idempotente, cap 500) |
| POST | `/api/admin/library/import-manifest` | JWT | admin_full | RF-11 | Batch upload curso completo via CSV manifest + arquivos |

---

## Endpoints publicos (consumo)

### `GET /api/library/courses`

Lista cursos publicados ordenados por `displayOrder`. Filtra `isPublished = true`.

**Auth:** `requireAuth`. Catalogo so para logados (alpha tester ou nao).

**Response 200:**
```json
[
  {
    "id": "...",
    "slug": "antes-das-cartas",
    "title": "00 - Antes das Cartas",
    "subtitle": "Fundacao mental para o profissional",
    "coverUrl": "/api/library/assets/library/covers/...",
    "lessonCount": 46,
    "hasAnyAccess": true
  }
]
```

`hasAnyAccess` = true se user tem `user_lesson_access` em qualquer lesson desse curso. Cacheable 60s no client.

---

### `GET /api/library/courses/:slug`

Detalhe de um curso com modulos expandidos e lessons inline.

**Auth:** `requireAuth`.
**Response 200:** `{ id, slug, title, subtitle, description, coverUrl, modules: [{ id, slug, title, description, coverUrl, lessons: [{ id, slug, title, subtitle, coverUrl, durationMinutes, formats: ['video'|'podcast'|'article'], hasAccess }] }] }`.
**Response 404:** `{ message: 'course_not_found' }` se slug nao existe ou `isPublished=false`.

`durationMinutes` = `max(videoDurationSeconds, audioDurationSeconds) / 60` arredondado.
`formats[]` = quais campos preenchidos (video se `videoMuxPlaybackId`, podcast se `audioKey`, article se `articleHtml`).
`hasAccess` por lesson — capa preservada mesmo sem acesso (D7 — catalogo aspiracional).

---

### `GET /api/library/lessons/:id`

Detalhe completo de uma aula com payloads dos 3 formatos.

**Auth:** `requireAuth` + lesson access (`user_lesson_access` row exigida).
**Response 200:** `{ id, slug, courseSlug, title, subtitle, categoryId, tags, coverUrl, formats: { video?: { mux: { playbackId }, durationSeconds }, podcast?: { audioUrl: '/api/library/lessons/:id/audio', durationSeconds, mimeType }, article?: { html, wordCount } } }`.
**Response 401:** `{ message: 'access_denied' }` — sem grant. Frontend redireciona para `/biblioteca/curso/:courseSlug` com toast + log evento `access_blocked`.

HTML do artigo retornado direto (ja sanitizado em D10 / ADR-076) — frontend usa `dangerouslySetInnerHTML` sem re-sanitize.

---

### `GET /api/library/lessons/:id/playback-token`

Gera Mux signed HLS URL para o video da aula. TTL 4h (ADR-072).

**Auth:** `requireAuth` + lesson access.
**Response 200:** `{ url: string, expiresAt: ISO8601, watermarkText: string }`. `watermarkText = userPlatformId`.
**Response 401:** `{ message: 'access_denied' }`.
**Response 404:** `{ message: 'lesson_not_found' }` ou `{ message: 'lesson_no_video' }` (lesson sem `videoMuxPlaybackId`).
**Response 503:** `{ message: 'mux_not_configured' }` (env Mux nao definido — dev fallback).

Frontend monitora `expiresAt` e re-fetch quando `< 30min restantes`.

---

### `GET /api/library/lessons/:id/audio`

Stream M4A com Range header (HTTP 206 partial content).

**Auth:** `requireAuth` + lesson access.
**Response 200/206:** `audio/mp4` stream. Headers: `Accept-Ranges: bytes`, `Content-Length`, `Content-Range` (se Range request).
**Response 401:** sem grant.
**Response 404:** lesson sem `audioKey`.

D9: sem signed URL no MVP (founder aceita risco hotlinking — audio secundario).

---

### `GET /api/library/lessons/:id/progress`

Progresso atual nos 3 formatos.

**Auth:** `requireAuth` + lesson access.
**Response 200:** `{ video?: { lastPositionSeconds, totalDurationSeconds, completedAt }, podcast?: {...}, article?: {...} }`. Apenas formatos com row em `library_progress`.

---

### `PATCH /api/library/lessons/:id/progress`

Upsert atomico de progresso (D12 — `INSERT ... ON CONFLICT DO UPDATE`).

**Auth:** `requireAuth` + lesson access.
**Body:** `{ format: 'video'|'podcast'|'article', lastPositionSeconds: number, totalDurationSeconds?: number }`.
**Response 200:** `{ updated: true, completed: boolean }`. `completed=true` se `lastPositionSeconds >= totalDurationSeconds * 0.95`.
**Response 429:** `Retry-After: 5` — throttle servidor 5s entre updates do mesmo (user, lesson, format).

Cliente debounce 15s + send em pause/seek/close.

---

### `POST /api/library/events`

Evento fire-and-forget (cliente usa `navigator.sendBeacon` ou `fetch keepalive` — D11).

**Auth:** `requireAuth` + lesson access.
**Body:** `{ lessonId: string, eventType: enum, format?: enum, positionSeconds?: number, metadata?: object }`.
**Response 202:** `{}` (Accepted, sem body).
**Rate limit:** 60 events/min/user.

`eventType` valores: `view | play | pause | seek | complete | note_create | coach_recommend | access_blocked`.
Server-side timestamp (ignora timestamp do cliente para integridade).

---

### `GET /api/library/assets/:key`

Serve asset generico (capa de curso/modulo/aula, imagem inline de artigo) via `mediaStorage.get(key)`.

**Auth:** `requireAuth`. Cache-Control: `public, max-age=604800` (7d).
**Response 200:** binario com `Content-Type` correto.
**Response 404:** key nao existe.
**Response 400:** path traversal detectado em `key` (`..`, `\`, leading `/`).

`key` formato: `{scope}/{userId?}/{nanoid}.{ext}` — opaca cross-backend (ADR-071).

---

## Endpoints admin (founder/admin_full)

### `POST /api/admin/library/grant-access`

Libera acesso de N aulas para 1 usuario em uma chamada. Idempotente (composite unique permite re-grant).

**Auth:** `requireAuth` + `requirePermission('admin_full')`.
**Body:** `{ userId: string, lessonIds: string[], source: 'admin'|'purchase'|'bundle'|'subscription', expiresAt?: ISO8601 }`.
**Response 200:** `{ granted: number, alreadyHadAccess: number, errors: Array<{ lessonId, reason }> }`.
**Response 400:** validation error (Zod).
**Response 403:** sem permission.
**Response 404:** `{ message: 'user_not_found' }`.

Cap 500 lessons por chamada (anti-abuse). `grantedBy = req.user.userPlatformId`. Lesson nao publicada pode ser granted (admin pode preparar acesso antes de publicar).

Diagrama: `Docs/architecture/diagrams/biblioteca/flow-admin-grant-access.mermaid`.

---

### `POST /api/admin/library/import-manifest`

Batch upload de 1 curso completo via CSV manifest + arquivos co-localizados.

**Auth:** `requireAuth` + `requirePermission('admin_full')`.
**Content-Type:** `multipart/form-data`.
**Fields:**
- `manifest`: File (CSV) com colunas `type, course_slug, course_title, module_slug, module_title, lesson_slug, lesson_title, subtitle, category_id, tags, article_filename, audio_filename, video_filename, cover_filename, display_order`.
- `files[]`: File[] (HTML, M4A, JPG/PNG capa, opcional MP4).

**Response 200:** `{ courseId, modulesCreated, lessonsCreated, errors: Array<{ row, reason }> }`.
**Response 400:** CSV malformed ou campo obrigatorio ausente.
**Response 413:** payload > 50MB.

**Caps:** 50MB total payload, 100 rows no manifest.
**Idempotente:** rerun com mesmo CSV nao duplica (upsert por slug).
**Atomico:** nao ha — falha parcial deixa rows criadas; founder roda novo CSV com diff.

**Pipeline (ver diagrama `flow-batch-upload-manifest.mermaid`):**
1. Para cada `course` row: upsert `library_courses` por slug (cover via `mediaStorage.put scope=library/covers`).
2. Para cada `module` row: upsert `library_modules` (composite slug + courseId).
3. Para cada `lesson` row:
   - HTML: le, sanitiza com DOMPurify (ADR-076), salva em `articleHtml` + calcula `articleWordCount`.
   - M4A: `mediaStorage.put({ scope: 'library/audio', ext: 'm4a', buffer, mime: 'audio/mp4' })` → `audioKey`. `music-metadata` extrai `audioDurationSeconds`.
   - MP4 (opcional): `muxProvider.uploadAsset()` → `videoMuxAssetId + videoMuxPlaybackId`. Polling `assetReady` timeout 60s.
   - Cover: `mediaStorage.put({ scope: 'library/covers' })` → `coverKey`.
   - `categoryId` validado contra enum (D13).
   - `tags[]` parseado (split por `,`).
   - `isPublished = false` (default — founder publica depois).

**Erros nao-fatais** (registrados em `errors[]`, batch continua):
- Arquivo nao encontrado em `files[]`.
- Categoria invalida.
- HTML invalido (sanitizado vazio).
- Mux upload falha (lesson criada com `videoMuxPlaybackId = null` + `isPublished: false`).

**Erros fatais** (param o batch, response 400):
- CSV malformed.
- Campo obrigatorio ausente em row de tipo course/module/lesson.
- Slug duplicado dentro do mesmo curso.

---

## Coach Tool: `recommend_lesson` (RF-10 / ADR-075)

**NAO e endpoint REST.** E uma tool registrada no Coach registry consumida via `POST /api/coach/chat`. Documentada aqui para referencia rapida.

**Tool name:** `recommend_lesson`.
**Description:** "Recomenda ate 3 aulas da Biblioteca Grindfy alinhadas a um leak/topico detectado."
**Tier gating:** `pro | premium | admin`.
**Audit:** `log`.

**Input schema:**
```ts
{
  leakTopic: 'performance_mental' | 'preflop' | 'postflop' | 'multiway' |
             'icm_pre' | 'icm_pos' | 'final_table' | 'exploits' | 'special_formats',
  urgency: 'low' | 'medium' | 'high', // default 'medium'
  maxResults: number // 1-3, default 3
}
```

**Output (wrapped via ToolResult — ADR-024):**
```ts
{
  __type: 'ToolResult',
  tool: 'recommend_lesson',
  ok: true,
  data: {
    lessons: Array<{
      id, slug, courseSlug, title, courseTitle,
      coverUrl, durationMinutes, categoryId,
      hasAccess: boolean,
      url: '/biblioteca/curso/:courseSlug/:lessonSlug'
    }>
  }
}
```

**Side-effect:** grava 1 evento `coach_recommend` em `library_events` por lesson recomendada (best-effort — log error mas nao falha tool).

**Ranking determinista (D14):** match exato `categoryId == leakTopic` > match em `tags[]` > preferir nao-iniciada > iniciada > completa (via JOIN `library_progress`).

**UI embed:** componente `CoachLessonRecommendationCard` em `client/src/components/Coach/`. Carrossel se >1 lesson. CTA "Assistir agora" (`hasAccess=true`, `target=_blank`) ou "Em breve" cinza desabilitado.

**Diagrama:** `Docs/architecture/diagrams/biblioteca/flow-coach-recommend-lesson.mermaid`.

---

## Hard-block de concorrentes (RF-09 / ADR-075)

**NAO e endpoint.** E adicao em `server/coachSafetyPrompts.ts` para o system prompt do Coach.

**Constante exportada:** `COMPETITOR_BLOCKLIST = ['GTO Wizard', 'GTOWizard', 'Raise Your Edge', 'RYE', 'PokerCoaching', 'Poker Coaching', 'Run It Once', 'RunItOnce', 'RIO', 'Upswing', 'Upswing Poker', 'Solve For Why', 'SFW']`.

System prompt instrui Coach a:
1. NAO recomendar produto concorrente.
2. Recomendar conteudo Grindfy via tool `recommend_lesson`.
3. Ensinar conceito generico (GTO, ICM, MDF) sem citar marca.

Cache-key Anthropic recalculado quando lista atualiza (1 cache miss, depois estavel).

---

## Test plan resumido

Detalhes em `Docs/specs/biblioteca-spec-1.md` secao 10.

**Unit (server, node project):**
- `mediaStorage.put/get/delete/exists` + alias env + path traversal
- `muxProvider.createPlaybackToken` happy + 503 sem env
- `recommendLesson handler` ranking categoria > tags + tier gating + side-effect events
- `coachSafetyPrompts.COMPETITOR_BLOCKLIST` exportada + presente em system prompt
- DOMPurify XSS payloads bloqueados

**Integration (jsdom + MSW):**
- `POST /api/admin/library/grant-access` happy + idempotente + cap 500 + 403 + 404
- `POST /api/admin/library/import-manifest` CSV completo + erros parciais
- `GET /api/library/courses` apenas published + ordenado
- `GET /api/library/lessons/:id` 401 sem grant + 200 com grant
- `GET /api/library/lessons/:id/playback-token` TTL correto + watermark text
- `POST /api/library/events` 60/min rate limit + 401 sem grant + 202 fire-and-forget
- `PATCH /api/library/lessons/:id/progress` upsert + 95% completedAt + 5s throttle 429

**Frontend (jsdom):**
- `LibraryHome` renderiza cursos com hasAnyAccess
- `LibraryCourseDetail` accordion expand/collapse
- `LessonRow` bloqueado nao navega
- `LessonViewer` tabs renderizam so formatos disponiveis + sync cross-format (D5)
- `StickyAudioBar` aparece/some conforme contexto + viewport
- `CoachLessonRecommendationCard` renderiza com 1, 2, 3 lessons
- Speed control persiste em localStorage

---

## Lessons learned aplicaveis

- **#5** (`vi.fn()` nao e constructor): mock SDK Mux em testes precisa try/catch fallback.
- **#7** (Zod optional + default + back-fill): manifest fields sao opcionais com defaults.
- **#9** (try/catch generico engole erros): side-effect `library_events` em `recommend_lesson` log antes de fallback.
- **#10** (DRY de prompts): `COMPETITOR_BLOCKLIST` em const exportada — cache estavel.
- **#11** (default minimo): tool `recommend_lesson` retorna `lessons: []` se 0 matches; UI nao "ajuda" inventando card.
- **#12** (estado persistente): `AudioPlayerContext` precisa sobreviver Wouter navigation para sticky bar mobile funcionar.

Catalogo completo em `Docs/architecture/lessons-learned.md`.
