# Spec 1 — Biblioteca (LMS embedded MVP)

> Sprint: Biblioteca-1 (Fase 1 — PM-Spec)
> Data: 2026-05-01
> Input: `memory/biblioteca_decisions_2026-05-01.md` (decisoes founder + brainstorm strategist)
> Output: este documento — fonte de verdade operacional para `system-architect`, `test-writer`, `implementer`, `reviewer`
> Status: Proposta (aguardando aprovacao do dev)
> Idioma: PT-BR (codigo em ingles, conteudo/UI em PT-BR)

---

## 1. Sumario Executivo

**Objetivo.** Adicionar pagina **Biblioteca** dentro do grupo "Ferramentas" do sidebar (`/biblioteca`). LMS embedded com cursos proprios em 3 formatos sincronizados (video Mux + podcast M4A + artigo HTML). Acesso controlado por entitlements (sem checkout no MVP — founder libera manual via admin endpoint). Coach AI ganha tool nova `recommend_lesson` para sugerir aula relevante quando detecta leak no chat. Eventos de consumo registrados para futuro gating de refund (Spec 4) e analytics.

**Escopo.** 12 RFs entregaveis em uma sprint solo (~21 dias dev solo). A spec e **isoladora**: nao toca em Studies, Stats, Bankroll ou Coach prompts existentes alem do hard-block de concorrentes (RF-09) e da nova tool `recommend_lesson` (RF-10). Reutiliza padrao de storage abstraction de ADR-057 (refatorado para `MEDIA_STORAGE_BACKEND` generico).

**12 RFs em 1 linha:**

- **RF-01** — Schema novo: 7 tabelas (`library_courses`, `library_modules`, `library_lessons`, `library_categories`, `user_lesson_access`, `library_events`, `library_progress`) + ENUMs
- **RF-02** — Storage abstraction `MEDIA_STORAGE_BACKEND` generico (refactor de ADR-057, alias retrocompat para `SPOT_IMAGE_STORAGE_BACKEND`)
- **RF-03** — Mux integration: `MuxMediaProvider`, `GET /api/library/lessons/:id/playback-token` (signed HLS URL TTL 4h, watermark `userPlatformId`)
- **RF-04** — Endpoint admin `POST /api/admin/library/grant-access` (cap por usuario + idempotente)
- **RF-05** — Endpoints publicos catalogo: `GET /api/library/courses`, `GET /api/library/courses/:slug`, `GET /api/library/lessons/:id`
- **RF-06** — Endpoints progresso/eventos: `POST /api/library/events`, `GET /api/library/lessons/:id/progress`, `PATCH /api/library/lessons/:id/progress`
- **RF-07** — Pagina `/biblioteca` lista cursos (Netflix-style grid) + drill-down `/biblioteca/curso/:courseSlug` + drill-down modulo/bloco
- **RF-08** — Viewer unificado `/biblioteca/curso/:courseSlug/:lessonSlug` com tabs Video/Podcast/Artigo + sync de progresso entre formatos + sticky audio bar mobile
- **RF-09** — Hard-block concorrentes no system prompt do Coach (`coachSystemBuilder.ts`): GTO Wizard, RYE/Raise Your Edge, PokerCoaching, Run It Once, Upswing, Solve For Why
- **RF-10** — Coach tool nova `recommend_lesson` (input: `leakTopic`, `urgency`) + UI card embed na conversa Coach
- **RF-11** — Endpoint admin batch upload `POST /api/admin/library/import-manifest` (CSV manifest + arquivos copiados via storage)
- **RF-12** — Sidebar update: adicionar item "Biblioteca" (icone BookOpen) sob FERRAMENTAS, resolver conflito de naming com rota `/library` existente em DADOS

---

## 2. Contexto e Motivacao

### 2.1. Problema

Grindfy hoje vende valor unico via tracker + Coach AI sobre dados reais do jogador. Concorrentes (PokerCoaching, GTO Wizard, Run It Once, Upswing, Solve For Why, RYE) vendem **conteudo desacoplado** — o jogador estuda "no escuro" e espera transferir o aprendizado. Sem biblioteca propria, o pitch Grindfy fica em "tracker mais barato com Coach", e founder paga loop de "Coach detecta leak → joga jogador pra fora pesquisar conteudo de concorrente".

### 2.2. Tese

**Loop fechado tracker → biblioteca → coach.** Stats geram leaks; biblioteca tem aulas categorizadas por leak; Coach (no chat ou via stats) recomenda aula concreta dentro da plataforma. Diferenciador unico vs todos os concorrentes — eles tem conteudo, mas nao tem dados do jogador. Grindfy tem ambos.

### 2.3. Por que Spec 1 e MVP minimo

Founder confirmou (decisao D4): **sem checkout Stripe no MVP**. Acesso liberado manualmente via endpoint admin para alpha testers. Spec 1 entrega:
1. **Viewer + entitlements** — fundacao para qualquer monetizacao futura;
2. **Coach recomendacao manual** — Coach detecta leak no chat e sugere aula, mas o gatilho automatico (stats dispara recomendacao sem prompt do usuario) fica para Spec 2;
3. **Eventos** — `library_events` + `library_progress` registram consumo desde o dia 1, viabilizando refund 25% (Spec 4) e analytics retroativo.

### 2.4. Riscos de adiar

Sem Spec 1, founder:
- nao consegue validar conteudo bruto (00 + 01) com alpha testers;
- nao tem dados de retencao/consumo para iterar conteudo;
- continua perdendo o loop fechado para concorrentes;
- nao testa a relacao entre Coach + conteudo (recomendacao contextual);
- nao prepara fundacao tecnica para Stripe (entitlements precisam existir antes de checkout).

---

## 3. Defaults Ativos D1-D15

Decisoes ja tomadas pelo PM. Test-writer e implementer assumem sem requestionar.

| ID | Default |
|---|---|
| **D1** | **Sidebar: novo item "Biblioteca" sob grupo "FERRAMENTAS"**, icone `BookOpen` (lucide-react), rota `/biblioteca`. **Conflito de naming:** ja existe `/library` (label "Biblioteca", grupo DADOS) que e a Tournament Library. Resolucao: renomear o item DADOS para **"Torneios"** (label) mantendo rota `/library` (zero migration de URL). Novo item FERRAMENTAS fica com label "Biblioteca" + rota nova `/biblioteca`. |
| **D2** | **3 niveis de drill-down:** `/biblioteca` (lista cursos) → `/biblioteca/curso/:courseSlug` (lista modulos) → `/biblioteca/curso/:courseSlug/:lessonSlug` (viewer). Modulo nao tem URL propria — clicar no modulo expande in-place na pagina do curso (sem nova rota). |
| **D3** | **Slug determinada server-side no upload.** Slug = kebab-case do `title` truncado em 60 chars + sufixo `-{nanoid(6)}` se colisao. Slug nunca muda apos criacao (URLs estaveis). Lessons referenciadas por slug **dentro do escopo do curso** (curso A pode ter `mentalidade-fixa` e curso B tambem, sem colisao). |
| **D4** | **Default tab no viewer = formato com maior progresso do usuario.** Se zero progresso, default = `video` (se disponivel) > `podcast` > `article`. Tab atual persistida em URL via query param `?tab=video|podcast|article`. |
| **D5** | **Sync de progresso cross-format por SEGUNDOS, nao percentual.** Se podcast aos 720s e usuario abre video, video pula para 720s. **NAO recalcular percentual** — totalDuration de cada formato pode divergir levemente; usar segundos absolutos preserva o ponto narrativo. Se segundo > totalDuration do formato destino, abre no inicio (fallback). |
| **D6** | **Sticky audio bar mobile so aparece se usuario der play em audio E navegar para outra rota.** Audio continua tocando em background. Fechar bar = pause + dismiss. Bar desktop NAO existe (desktop tem viewer aberto em outra aba se quiser). |
| **D7** | **Acesso bloqueado mostra capa cheia + CTA "Em breve" (cor cinza, nao clicavel).** Sem trial, sem preview, sem "compre agora". Founder libera manual. Texto: `"Acesso liberado manualmente pelo time Grindfy enquanto desenvolvemos checkout. Fale com o suporte."`. Tooltip on hover do CTA. |
| **D8** | **Mux signed URL TTL = 4h.** Renovacao automatica via re-fetch do endpoint `playback-token` quando TTL < 30min restantes. Token vinculado a `lessonId + userPlatformId`. Watermark renderizado pelo Mux Player com texto `userPlatformId` em diagonal, opacidade 0.15, tamanho 24px. |
| **D9** | **Audio M4A servido direto do storage com Range header.** Sem signed URL no MVP (founder aceita risco de hotlinking — audio e secundario, video e o ativo principal). Endpoint: `GET /api/library/lessons/:id/audio` retorna stream com `Accept-Ranges: bytes`. Bloqueio: 401 se `user_lesson_access` nao tem entry para esse user + lesson. |
| **D10** | **Artigo HTML sanitizado server-side com DOMPurify (server-side via `isomorphic-dompurify`)** **antes** de salvar na coluna `content_html`. Frontend renderiza com `dangerouslySetInnerHTML` (ja sanitizado). Lista de allowed tags: `p, h1-h6, ul, ol, li, strong, em, blockquote, code, pre, a, br, hr, img, span` + atributos `href, src, alt, class`. Imagens dentro do artigo: `src` precisa comecar com `/api/library/assets/` (assets locais) — bloquear hotlinks externos. |
| **D11** | **`library_events` write fire-and-forget no frontend.** Cliente envia evento via `navigator.sendBeacon` (ou fallback `fetch keepalive`) para nao bloquear UI. Backend grava em batch (insert simples, sem queue) com `eventTimestamp = Date.now()` server-side (cliente envia timestamp como hint mas server confia no proprio relogio). |
| **D12** | **`library_progress` upsert atomico** via `INSERT ... ON CONFLICT (userId, lessonId, format) DO UPDATE SET lastPositionSeconds = EXCLUDED.lastPositionSeconds, updatedAt = NOW()`. Throttle no cliente: enviar update a cada 15s ou ao pause/seek/close. Marcar `completedAt = NOW()` quando `lastPositionSeconds >= totalDurationSeconds * 0.95`. |
| **D13** | **Categories e enum hard-coded no backend** em `shared/library-categories.ts`: `['performance_mental', 'preflop', 'postflop', 'multiway', 'icm_pre', 'icm_pos', 'final_table', 'exploits', 'special_formats']`. Cada categoria tem label PT-BR + cor + icone. Aulas tem 1 `categoryId` obrigatorio + array `tags[]` livre. Tabela `library_categories` so existe se founder pedir UI admin para editar — MVP usa enum em codigo. |
| **D14** | **Coach `recommend_lesson` retorna max 3 aulas** ranqueadas por: (1) match exato `categoryId == leakTopic`, (2) overlap em `tags[]`, (3) progresso do usuario nessa aula (preferir nao-iniciada > iniciada > completa). Resposta inclui `hasAccess: boolean` por aula — UI renderiza CTA "Assistir agora" se `true`, "Em breve" se `false`. |
| **D15** | **Hard-block de concorrentes via lista em `coachSafetyPrompts.ts`** (constante `COMPETITOR_BLOCKLIST`). System prompt instrui: "Voce NUNCA cita marcas de produtos concorrentes (lista). Se usuario perguntar 'qual aula do GTO Wizard sobre X', responda recomendando conteudo Grindfy ou conceitos genericos. Se nao houver aula Grindfy, sugira que o usuario pergunte de novo descrevendo o tema." Lista vinculada por testes (nao mock string). |

---

## 4. Usuarios e Personas

| Persona | O que faz na Biblioteca | Trigger principal |
|---|---|---|
| **Founder (admin)** | Sobe conteudo via batch upload, libera acesso manual, monitora consumo | Comando admin (sem UI MVP — usar admin endpoint) |
| **Alpha tester (Pro tier, acesso liberado)** | Navega catalogo, consome em 3 formatos, recebe recomendacao do Coach | Click no item "Biblioteca" no sidebar OU recomendacao do Coach no chat |
| **Usuario sem acesso (Free/Pro sem grant)** | Ve catalogo com capas grandes (aspiracional), tenta clicar, ve "Em breve" | Curiosidade pelo sidebar OU recomendacao do Coach (CTA bloqueado) |

### 4.1. User Stories

#### US-01 (founder)
> Como founder, quero subir um curso completo (HTML + M4A + capa + metadata) via CSV manifest **uma unica vez** para nao perder 6h em uploads manuais por curso.

#### US-02 (founder)
> Como founder, quero liberar acesso de N aulas para 1 usuario alpha **em uma chamada** para acelerar onboarding sem dashboard admin.

#### US-03 (alpha tester)
> Como alpha tester, quero comecar a ouvir o podcast no carro pela manha (12min), abrir o video em casa a noite e **continuar exatamente onde parei** sem ter que adivinhar o ponto.

#### US-04 (alpha tester)
> Como alpha tester, quando o Coach detecta que tenho leak em "ICM bubble" durante o chat, quero ver **um card embed** com a aula relevante e clicar para assistir sem trocar de aba.

#### US-05 (alpha tester mobile)
> Como alpha tester no celular, quando estou ouvindo o podcast e navego para `/dashboard` para checar minha banca, quero que o **audio continue tocando** com um mini-player flutuante na base.

#### US-06 (nao-comprador)
> Como usuario sem acesso, quero **ver as capas do catalogo** mesmo sem poder consumir, para entender o que vou ganhar quando o checkout abrir.

#### US-07 (alpha tester desktop)
> Como alpha tester desktop, quero que o video Mux carregue rapido (HLS chunked) e tenha **watermark sutil com meu ID** para eu saber que esta protegido sem me incomodar visualmente.

---

## 5. Requisitos Funcionais

### RF-01 — Schema do Modelo de Dados

**O que faz.** Cria 7 tabelas novas + 2 enums em `shared/schema.ts`. Migration numerada (proxima disponivel — provavel `0023` ou superior dependendo de merges em andamento).

**Tabelas:**

#### 5.1.1. `library_courses`
| Campo | Tipo | Constraint | Notas |
|---|---|---|---|
| `id` | text PK | `nanoid()` | |
| `slug` | text | unique, not null | kebab-case, max 60 chars |
| `title` | text | not null | PT-BR |
| `subtitle` | text | nullable | |
| `description` | text | nullable | |
| `coverKey` | text | nullable | path opaco via storage abstraction (D2/RF-02) |
| `displayOrder` | integer | default 0 | |
| `isPublished` | boolean | default false | nao-publicado nao aparece em `/biblioteca` |
| `createdAt` | timestamp | default `NOW()` | |
| `updatedAt` | timestamp | default `NOW()` | |

#### 5.1.2. `library_modules`
| Campo | Tipo | Constraint | Notas |
|---|---|---|---|
| `id` | text PK | `nanoid()` | |
| `courseId` | text | FK `library_courses.id` ON DELETE CASCADE | |
| `slug` | text | not null | unico dentro do curso (composite unique `courseId + slug`) |
| `title` | text | not null | |
| `description` | text | nullable | |
| `coverKey` | text | nullable | |
| `displayOrder` | integer | default 0 | |
| `createdAt` | timestamp | default `NOW()` | |

#### 5.1.3. `library_lessons`
| Campo | Tipo | Constraint | Notas |
|---|---|---|---|
| `id` | text PK | `nanoid()` | |
| `moduleId` | text | FK `library_modules.id` ON DELETE CASCADE | |
| `courseId` | text | FK `library_courses.id` ON DELETE CASCADE | denormalizado para query |
| `slug` | text | not null | unico dentro do curso (composite unique `courseId + slug`) |
| `title` | text | not null | |
| `subtitle` | text | nullable | |
| `categoryId` | text | not null | enum em `library-categories.ts` (D13) |
| `tags` | text[] | default `[]` | tags livres |
| `coverKey` | text | nullable | |
| `videoMuxAssetId` | text | nullable | ID do asset no Mux |
| `videoMuxPlaybackId` | text | nullable | playback ID (gera signed URLs) |
| `videoDurationSeconds` | integer | nullable | duracao real do video |
| `audioKey` | text | nullable | path no storage abstraction |
| `audioDurationSeconds` | integer | nullable | duracao real do M4A |
| `audioMimeType` | text | nullable | default `audio/mp4` |
| `articleHtml` | text | nullable | HTML ja sanitizado (D10) |
| `articleWordCount` | integer | nullable | calculado server-side |
| `displayOrder` | integer | default 0 | |
| `isPublished` | boolean | default false | |
| `createdAt` | timestamp | default `NOW()` | |
| `updatedAt` | timestamp | default `NOW()` | |

> **Nota.** Lesson nao precisa ter os 3 formatos. Pode ter so artigo, ou so video+podcast. Viewer detecta disponibilidade e renderiza apenas tabs com conteudo.

#### 5.1.4. `library_categories`
> **Decisao:** tabela **NAO** criada no MVP. Categories sao enum hardcoded em `shared/library-categories.ts` (D13). Tabela so existe se founder pedir UI admin para editar — fora de escopo.

#### 5.1.5. `user_lesson_access`
| Campo | Tipo | Constraint | Notas |
|---|---|---|---|
| `id` | text PK | `nanoid()` | |
| `userId` | text | FK `users.userPlatformId` ON DELETE CASCADE | |
| `lessonId` | text | FK `library_lessons.id` ON DELETE CASCADE | |
| `source` | enum | not null | `library_access_source` (D13.5) |
| `grantedAt` | timestamp | default `NOW()` | |
| `grantedBy` | text | nullable | userPlatformId do admin que concedeu |
| `expiresAt` | timestamp | nullable | null = vitalicio (default no MVP) |

**Composite unique:** `(userId, lessonId)`. Re-grant para mesma lesson eh idempotente (no-op se ja existe).

**Enum `library_access_source`:** `'admin', 'purchase', 'bundle', 'subscription'`. MVP so usa `'admin'`.

#### 5.1.6. `library_events`
| Campo | Tipo | Constraint | Notas |
|---|---|---|---|
| `id` | text PK | `nanoid()` | |
| `userId` | text | FK `users.userPlatformId` ON DELETE CASCADE | |
| `lessonId` | text | FK `library_lessons.id` ON DELETE CASCADE | |
| `eventType` | enum | not null | `library_event_type` |
| `format` | enum | nullable | `library_format` — null para eventos nao-format-specific (`coach_recommend`) |
| `positionSeconds` | integer | nullable | aplicavel a play/pause |
| `metadata` | jsonb | default `{}` | extensivel: `{ playbackRate, qualityLevel, ... }` |
| `eventTimestamp` | timestamp | default `NOW()` | server-side (D11) |

**Enum `library_event_type`:** `'view', 'play', 'pause', 'seek', 'complete', 'note_create', 'coach_recommend', 'access_blocked'`.

**Enum `library_format`:** `'video', 'podcast', 'article'`.

**Index:** `(userId, lessonId, eventTimestamp DESC)` — para queries de progresso por usuario.

#### 5.1.7. `library_progress`
| Campo | Tipo | Constraint | Notas |
|---|---|---|---|
| `id` | text PK | `nanoid()` | |
| `userId` | text | FK `users.userPlatformId` ON DELETE CASCADE | |
| `lessonId` | text | FK `library_lessons.id` ON DELETE CASCADE | |
| `format` | enum | not null | `library_format` |
| `lastPositionSeconds` | integer | default 0 | |
| `totalDurationSeconds` | integer | nullable | snapshot da duracao no momento do progresso (denormalizado para o calculo de % nao depender de lesson update) |
| `completedAt` | timestamp | nullable | preenchido quando `lastPositionSeconds >= totalDurationSeconds * 0.95` (D12) |
| `updatedAt` | timestamp | default `NOW()` | |

**Composite unique:** `(userId, lessonId, format)`. Upsert atomico (D12).

**Criterios de aceitacao:**
- [ ] Migration aplica sem erro em DB limpo
- [ ] Migration aplica sem erro em DB com dados existentes (no-op em rollback se reversivel)
- [ ] Drizzle types gerados corretamente (sem `any`)
- [ ] Foreign keys disparam CASCADE em delete de user (tester apaga user de teste, todas as rows relacionadas somem)
- [ ] Composite uniques bloqueiam inserts duplicados

---

### RF-02 — Storage Abstraction `MEDIA_STORAGE_BACKEND` Generico

**O que faz.** Refatora `server/services/spotImageStorage.ts` (ADR-057) em `server/services/mediaStorage.ts` generico que serve imagens, audio e (futuro) outros assets. Mantem retrocompat: env var antiga `SPOT_IMAGE_STORAGE_BACKEND` vira alias de `MEDIA_STORAGE_BACKEND`. Spot image storage continua funcionando exatamente como antes (zero quebra).

**Interface (mantida do ADR-057):**

```ts
export interface MediaStorage {
  put(input: { scope: string; userId?: string; ext: string; buffer: Buffer; mime: string }): Promise<{ key: string; size: number }>;
  get(key: string): Promise<{ buffer: Buffer; mime: string } | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

**Mudancas vs ADR-057:**
- `scope` substitui `sessionId` — namespace generico (`spots`, `library/audio`, `library/covers`, etc).
- `userId` opcional — assets globais (capas de curso) nao precisam de scoping por usuario.
- Layout FS: `uploads/{scope}/{userId?}/{nanoid21}.{ext}` (userId omitido se nao fornecido).

**Backends:**
- `local` (default, dev) — FS em `uploads/`
- `s3` (futuro deploy) — S3/R2
- `mux` — apenas video; `MuxMediaProvider` separado (RF-03), nao implementa `MediaStorage`

**Env var:**
```
MEDIA_STORAGE_BACKEND=local        # default
MEDIA_STORAGE_BACKEND=s3           # producao
SPOT_IMAGE_STORAGE_BACKEND=...     # DEPRECATED — alias para MEDIA_STORAGE_BACKEND
```

Logica de aliasing: se `MEDIA_STORAGE_BACKEND` nao definido E `SPOT_IMAGE_STORAGE_BACKEND` definido, usar valor do segundo + log warn `"deprecated env: SPOT_IMAGE_STORAGE_BACKEND, use MEDIA_STORAGE_BACKEND"`.

**Path traversal blocking:** mantido conforme ADR-057. Defesa centralizada no service.

**Criterios de aceitacao:**
- [ ] `mediaStorage.put({ scope: 'spots', userId, ... })` produz key compativel com layout antigo (`spots/{userId}/...`)
- [ ] `mediaStorage.put({ scope: 'library/audio', ... })` salva em `uploads/library/audio/...`
- [ ] Codigo legado `createSpotImageStorage()` continua funcionando (via wrapper)
- [ ] `SPOT_IMAGE_STORAGE_BACKEND=local` sem `MEDIA_STORAGE_BACKEND` definido funciona com warning
- [ ] Path traversal em `get()` rejeitado (mesma defesa do ADR-057)

---

### RF-03 — Mux Integration

**O que faz.** Cria `server/services/muxMediaProvider.ts` que abstrai SDK do Mux (`@mux/mux-node`). Gera signed playback URLs com TTL 4h e watermark dinamico via JWT claims.

**Funcoes expostas:**
```ts
muxProvider.createPlaybackToken(opts: { playbackId: string; userPlatformId: string }): Promise<{ url: string; expiresAt: ISO8601 }>
muxProvider.uploadAsset(opts: { fileBuffer: Buffer; mimeType: string }): Promise<{ assetId: string; playbackId: string }>  // usado em RF-11
```

**Endpoint:**
```
GET /api/library/lessons/:id/playback-token
Auth: requireAuth (JWT)
Auth: lesson access (user precisa ter row em user_lesson_access)
Response 200: { url: string, expiresAt: ISO8601, watermarkText: string }
Response 401: { message: 'access_denied' }
Response 404: { message: 'lesson_not_found' OU lesson sem video' }
```

**Watermark.** Mux Player frontend recebe `watermarkText` (= `userPlatformId`) e renderiza overlay diagonal opacidade 0.15, 24px, repetido diagonalmente.

**Env vars:**
```
MUX_TOKEN_ID=...
MUX_TOKEN_SECRET=...
MUX_SIGNING_KEY=...
MUX_SIGNING_KEY_ID=...
```

**Fallback de dev:** se nenhuma env Mux definida, endpoint retorna 503 com `{ message: 'mux_not_configured' }`. Permite rodar dev sem Mux.

**Criterios de aceitacao:**
- [ ] Endpoint retorna URL signed valida (passa em validador JWT do Mux)
- [ ] TTL respeitado (token expira em 4h)
- [ ] Acesso negado retorna 401 (sem grant em `user_lesson_access`)
- [ ] Lesson sem video retorna 404
- [ ] Sem env Mux → 503 (nao quebra dev)
- [ ] Watermark text = `userPlatformId` (validado em response)

---

### RF-04 — Endpoint Admin Grant Access

**O que faz.** Permite founder/admin liberar acesso a N aulas para 1 usuario em uma chamada.

**Endpoint:**
```
POST /api/admin/library/grant-access
Auth: requireAuth + requirePermission('admin_full')
Body: { userId: string, lessonIds: string[], source: 'admin'|'purchase'|'bundle'|'subscription', expiresAt?: ISO8601 }
Response 200: { granted: number, alreadyHadAccess: number, errors: Array<{ lessonId, reason }> }
Response 400: validation error
Response 404: user nao existe
```

**Comportamento:**
- Idempotente: re-grant para mesma `(userId, lessonId)` nao quebra (returns `alreadyHadAccess++`).
- Cap: `lessonIds.length <= 500` (proteger contra abuse mesmo sendo admin).
- `grantedBy = req.user.userPlatformId`.
- Lesson nao publicada: granted normalmente (admin pode preparar acesso antes de publicar).
- Source enum validado.

**Criterios de aceitacao:**
- [ ] Grant N aulas insere N rows
- [ ] Re-grant nao duplica
- [ ] User nao-admin recebe 403
- [ ] User inexistente retorna 404
- [ ] Cap de 500 lessons enforced
- [ ] `expiresAt` salvo se fornecido

---

### RF-05 — Endpoints Publicos Catalogo

**O que faz.** Endpoints read-only para frontend listar e drill-down em cursos/modulos/aulas.

**Endpoints:**

#### `GET /api/library/courses`
- Auth: `requireAuth` (mostra catalogo so para logados — alpha tester ou nao)
- Response: `Array<{ id, slug, title, subtitle, coverUrl, lessonCount, hasAnyAccess: boolean }>`
- Filtra `isPublished = true`. Ordenado por `displayOrder`.
- `hasAnyAccess` = true se usuario tem `user_lesson_access` em qualquer lesson desse curso.

#### `GET /api/library/courses/:slug`
- Auth: `requireAuth`
- Response: `{ id, slug, title, subtitle, description, coverUrl, modules: Array<{ id, slug, title, description, coverUrl, lessons: Array<{ id, slug, title, subtitle, coverUrl, durationMinutes, formats: ('video'|'podcast'|'article')[], hasAccess: boolean }> }> }`
- `durationMinutes` = max(`videoDurationSeconds`, `audioDurationSeconds`) / 60, arredondado.
- `formats[]` = quais campos preenchidos (video se `videoMuxPlaybackId`, podcast se `audioKey`, article se `articleHtml`).
- `hasAccess` por lesson.

#### `GET /api/library/lessons/:id`
- Auth: `requireAuth` + lesson access (401 se nao tem grant)
- Response: `{ id, slug, courseSlug, title, subtitle, categoryId, tags, coverUrl, formats: { video?: { mux: { playbackId }, durationSeconds }, podcast?: { audioUrl: '/api/library/lessons/:id/audio', durationSeconds, mimeType }, article?: { html, wordCount } } }`
- HTML do artigo retornado direto (ja sanitizado em D10).

**Criterios de aceitacao:**
- [ ] `/courses` lista so publicados
- [ ] `/courses/:slug` retorna 404 se slug nao existe
- [ ] `/courses/:slug` mostra todas lessons mesmo sem acesso (hasAccess false), capa preservada
- [ ] `/lessons/:id` retorna 401 sem grant
- [ ] `/lessons/:id` retorna 200 com grant, formato detalhado correto
- [ ] Capa URL = `/api/library/assets/:key` ou direto do storage local

---

### RF-06 — Endpoints Progresso e Eventos

**O que faz.** Trackeia consumo (events) e ponto de retomada (progress).

**Endpoints:**

#### `POST /api/library/events`
- Auth: `requireAuth` + lesson access
- Body: `{ lessonId: string, eventType: enum, format?: enum, positionSeconds?: number, metadata?: object }`
- Response 202 (Accepted): `{}` (fire-and-forget)
- Cliente usa `navigator.sendBeacon` quando possivel (D11).
- Server-side timestamp (ignora client timestamp para integridade).
- Rate limit: 60 events/min/user (proteger contra spam).

#### `GET /api/library/lessons/:id/progress`
- Auth: `requireAuth` + lesson access
- Response: `{ video?: { lastPositionSeconds, totalDurationSeconds, completedAt }, podcast?: {...}, article?: {...} }`
- 1 entry por formato com progresso. Formato sem progresso omitido.

#### `PATCH /api/library/lessons/:id/progress`
- Auth: `requireAuth` + lesson access
- Body: `{ format: 'video'|'podcast'|'article', lastPositionSeconds: number, totalDurationSeconds?: number }`
- Response 200: `{ updated: true, completed: boolean }`
- Upsert atomico (D12).
- Throttle no servidor: rejeita se ultimo update do mesmo `(user, lesson, format)` foi < 5s atras (HTTP 429 com `Retry-After: 5`). Cliente respeita.

**Criterios de aceitacao:**
- [ ] Evento sem grant retorna 401
- [ ] Evento valido grava row em `library_events`
- [ ] PATCH progress upsert funciona (insert se nao existe, update se existe)
- [ ] PATCH progress marca `completedAt` quando >= 95%
- [ ] GET progress retorna so formatos com row
- [ ] Throttle 5s funciona (segundo PATCH em < 5s = 429)
- [ ] Rate limit eventos 60/min funciona

---

### RF-07 — Pagina `/biblioteca` (Lista de Cursos + Drill-down Modulos)

**O que faz.** Pagina raiz e drill-down de modulo em React + Wouter.

**Rotas:**
- `/biblioteca` → `LibraryHome` (grid de cursos)
- `/biblioteca/curso/:courseSlug` → `LibraryCourseDetail` (header curso + lista modulos com lessons inline)

**`LibraryHome`:**
- Hero header: "Biblioteca Grindfy" + subtitle "Cursos para evoluir cada area do seu jogo"
- Grid responsivo (1 col mobile, 2 cols tablet, 3 cols desktop) com `CourseCard`
- `CourseCard`: capa grande aspect-ratio 16:9, overlay com titulo + subtitle + lesson count + badge "X aulas liberadas" (se `hasAnyAccess`)
- Capas lazy-loaded (`loading="lazy"` + Intersection Observer fallback)
- Ordenado por `displayOrder`

**`LibraryCourseDetail`:**
- Header com cover full-width (aspect 21:9), title, description, breadcrumb `Biblioteca > {courseTitle}`
- Lista de modulos (accordion expandivel — todos colapsados por default exceto se URL tem `?expandModule={moduleId}`)
- Cada modulo: header com title + description + capa pequena 4:3 + chevron expand
- Modulo expandido: lista de `LessonRow` (capa 16:9 + title + subtitle + duracao + badge formatos + badge acesso)
- `LessonRow` clicavel se `hasAccess` → navega para `/biblioteca/curso/:courseSlug/:lessonSlug`
- `LessonRow` bloqueado: cursor not-allowed + tooltip "Em breve" (D7)
- Botao "Continuar de onde parei" no header se houver progresso em qualquer aula desse curso (deep-link para ultima aula com progresso)

**Empty state.** Se `getCourses` retorna vazio: mostra placeholder "Em breve" com ilustracao estatica.

**Criterios de aceitacao:**
- [ ] `/biblioteca` lista cursos publicados
- [ ] Capas lazy-load (verificavel via DevTools Network)
- [ ] `/biblioteca/curso/:slug` 404 se slug invalido
- [ ] Modulo accordion expand/collapse persiste em URL (`?expandModule=X`)
- [ ] `LessonRow` bloqueada nao navega (testado via click + URL nao muda)
- [ ] "Continuar" deep-link funciona (mock com 1 aula em progresso)

---

### RF-08 — Viewer Unificado 3-Formatos

**O que faz.** Pagina viewer com tabs Video/Podcast/Artigo, sync de progresso, sticky audio bar mobile.

**Rota:** `/biblioteca/curso/:courseSlug/:lessonSlug?tab=video|podcast|article`

**`LessonViewer` componentes:**

```
LessonViewer
├── BreadcrumbNav (Biblioteca > Curso > Modulo > Aula)
├── LessonHeader (titulo, subtitle, duracao, categoria, tags)
├── FormatTabs (Video | Podcast | Artigo) — so renderiza tabs com formato disponivel
├── FormatPanel (renderiza conforme tab ativo):
│   ├── VideoPanel — Mux Player + watermark + controles speed/seek
│   ├── PodcastPanel — HTML5 audio + controles speed/seek + capa de fundo
│   └── ArticlePanel — render HTML sanitizado em <article> com prose styling
├── ProgressBar (compartilhada entre formatos — mostra max progresso de qualquer formato)
└── StickyAudioBar (so renderiza no mobile + so se podcast dando play)
```

**Sync de progresso:**
- Ao montar viewer, carrega `GET /lessons/:id/progress`
- Ao trocar tab, novo formato comeca em `progressMap[oldFormat].lastPositionSeconds` (D5)
- Ao seek/play/pause, envia `PATCH /lessons/:id/progress` com debounce 15s (D12)
- Ao 95% completion, marca `completedAt` (D12)

**Sticky audio bar mobile:**
- Player flutuante na base do viewport
- Mostra: capa pequena + titulo + play/pause + progresso + close button
- Aparece quando: usuario deu play em podcast E navega para fora do viewer (`/biblioteca/curso/X/Y` → outra rota)
- Desaparece quando: pause + close button OU usuario volta para a mesma aula
- Implementacao: `<audio>` element em context global (`AudioPlayerContext`) — sobrevive a navegacao via Wouter
- Testavel: render context provider + simular navegacao + audio continua

**Speed control:** dropdown 0.75x, 1x, 1.25x, 1.5x, 1.75x, 2x. Persistido em `localStorage` key `grindfy:library:playbackRate`. Aplica a video E audio. Default 1x.

**Watermark video:** componente `MuxPlayer` recebe `watermarkText={userPlatformId}` e renderiza CSS overlay (D8).

**Acesso bloqueado:**
- Se viewer carrega lesson sem grant: redirect para `/biblioteca/curso/:courseSlug` com toast "Acesso bloqueado — em breve" + log evento `access_blocked`.

**Criterios de aceitacao:**
- [ ] Tabs renderizam apenas formatos disponiveis (lesson so com artigo → so tab Artigo)
- [ ] Trocar tab Podcast (12min) → Video pula para 12min (D5)
- [ ] Sticky audio bar mobile aparece ao navegar com audio tocando
- [ ] Sticky audio bar nao aparece em desktop (>= 1024px)
- [ ] Speed control persiste entre sessoes
- [ ] Watermark video visivel com `userPlatformId`
- [ ] Acesso bloqueado redireciona + toast + evento `access_blocked` registrado
- [ ] Artigo HTML render sem XSS (testado com payload malicioso bloqueado em D10)
- [ ] Progress bar reflete max% entre formatos

---

### RF-09 — Hard-block Concorrentes no Coach

**O que faz.** Edita `server/coachSafetyPrompts.ts` adicionando lista de concorrentes bloqueados + instrucao no system prompt.

**Constante nova:**
```ts
export const COMPETITOR_BLOCKLIST = [
  'GTO Wizard', 'GTOWizard',
  'Raise Your Edge', 'RYE',
  'PokerCoaching', 'Poker Coaching',
  'Run It Once', 'RunItOnce', 'RIO',
  'Upswing', 'Upswing Poker',
  'Solve For Why', 'SFW',
] as const;
```

**Instrucao adicionada ao `SAFETY_RULES`:**
```
## Marcas de Produtos
Voce NUNCA cita marcas de produtos concorrentes do Grindfy: GTO Wizard, Raise Your Edge (RYE), PokerCoaching, Run It Once, Upswing, Solve For Why.
Se o usuario perguntar sobre uma dessas marcas (ex: "qual aula do GTO Wizard sobre 4-bet bluff?"), voce:
1. NAO recomenda o produto concorrente.
2. Recomenda conteudo Grindfy equivalente quando existir (use a tool `recommend_lesson`).
3. Se nao houver conteudo Grindfy, ensine o conceito generico (ex: "4-bet bluff" e um conceito GTO; explique sem citar a marca).
4. Conceitos genericos (GTO, ICM, MDF) podem ser citados livremente.
```

**Criterios de aceitacao:**
- [ ] Constante `COMPETITOR_BLOCKLIST` exportada de `coachSafetyPrompts.ts`
- [ ] System prompt inclui instrucao de bloqueio (verificavel em `buildStaticSystemBlock` output)
- [ ] Teste de smoke: prompt enviado para mock SDK contem string "GTO Wizard" na blocklist
- [ ] Lista nao quebra cache prompt da Anthropic (parte do bloco static cacheado)

---

### RF-10 — Coach Tool `recommend_lesson`

**O que faz.** Nova tool em `server/coachTools/` registrada no registry. Coach pode invocar quando detecta leak no chat para sugerir aula concreta.

**Arquivo:** `server/coachTools/recommendLesson.ts`

**Schema input:**
```ts
const inputSchema = z.object({
  leakTopic: z.enum([
    'performance_mental', 'preflop', 'postflop', 'multiway',
    'icm_pre', 'icm_pos', 'final_table', 'exploits', 'special_formats'
  ]),
  urgency: z.enum(['low', 'medium', 'high']).default('medium'),
  maxResults: z.number().int().min(1).max(3).default(3),
});
```

**Output:**
```ts
{
  __type: 'ToolResult',
  tool: 'recommend_lesson',
  ok: true,
  data: {
    lessons: Array<{
      id: string;
      slug: string;
      courseSlug: string;
      title: string;
      courseTitle: string;
      coverUrl: string;
      durationMinutes: number;
      categoryId: string;
      hasAccess: boolean;
      url: string;  // '/biblioteca/curso/:courseSlug/:lessonSlug'
    }>;
  }
}
```

**Logica de ranking (D14):**
1. Buscar lessons publicadas com `categoryId == leakTopic` (top match);
2. Fallback: lessons com `tags[]` contendo `leakTopic` (second-tier match);
3. Sort por: nao-iniciada > iniciada > completa (via JOIN `library_progress` para esse user);
4. Limit por `maxResults` (default 3).

**Tier gating:** Pro+ (`gateByTier: ['pro', 'premium', 'admin']`).

**Audit:** `auditLevel: 'log'` (registra em telemetry).

**Side-effect:** ao executar com sucesso, gravar event `coach_recommend` em `library_events` para cada lesson recomendada.

**UI Coach Chat:**
- Componente novo `CoachLessonRecommendationCard` em `client/src/components/Coach/`.
- Renderiza dentro do `CoachMessage` quando assistant message contem tool result `recommend_lesson`.
- Card layout: capa grande (16:9) + titulo + curso + duracao + CTA "Assistir agora" (se `hasAccess`) ou "Em breve" (se nao).
- CTA com `hasAccess` navega para `url` em new tab (`target="_blank"`) — preserva chat aberto.
- Carrossel se `lessons.length > 1`.

**Criterios de aceitacao:**
- [ ] Tool registrada em `coachTools/index.ts` com `safeRegister`
- [ ] Tier gating: free user nao recebe a tool
- [ ] Input invalido (leakTopic fora do enum) retorna `tool_error`
- [ ] Output inclui `hasAccess` correto por lesson
- [ ] Side-effect: 3 events `coach_recommend` gravados para 3 lessons retornadas
- [ ] UI card renderiza no chat
- [ ] CTA bloqueado nao navega (testado via click)
- [ ] CTA liberado abre nova aba

---

### RF-11 — Endpoint Admin Batch Upload (Manifest CSV)

**O que faz.** Permite founder subir 1 curso completo em uma chamada via CSV manifest + arquivos co-localizados.

**Endpoint:**
```
POST /api/admin/library/import-manifest
Auth: requireAuth + requirePermission('admin_full')
Content-Type: multipart/form-data
Fields:
  - manifest: File (CSV)
  - files[]: File[] (HTML, M4A, JPG/PNG capa, opcional MP4)
Response 200: { courseId, modulesCreated, lessonsCreated, errors: Array<{ row, reason }> }
Response 400: validation error (CSV malformed)
Response 413: payload too large
```

**Formato CSV (manifest):**
```csv
type,course_slug,course_title,module_slug,module_title,lesson_slug,lesson_title,subtitle,category_id,tags,article_filename,audio_filename,video_filename,cover_filename,display_order
course,antes-das-cartas,"00 - Antes das Cartas",,,,,,,,,,_capas/cover.jpg,1
module,antes-das-cartas,,bloco-a,Bloco A - Fundamentos Mentais,,,,,,,,,_capas/bloco-a.jpg,1
lesson,antes-das-cartas,,bloco-a,,a1-mentalidade-fixa,Mentalidade Fixa vs Crescimento,,performance_mental,"mindset,growth","Bloco A/A1.html","Bloco A/A1.m4a",,_capas/A1.jpg,1
```

**Comportamento:**
- Valida CSV row a row.
- Para cada `course`: cria/atualiza `library_courses` (por slug — upsert).
- Para cada `module`: cria/atualiza `library_modules` (composite slug + courseId).
- Para cada `lesson`:
  - Le HTML do `files[]`, sanitiza com DOMPurify (D10), salva em `articleHtml`.
  - Le M4A do `files[]`, salva via `mediaStorage.put({ scope: 'library/audio' })`, salva key em `audioKey`. Calcula `audioDurationSeconds` via `music-metadata` lib (ou fallback 0 se erro).
  - Se `video_filename` presente: faz upload para Mux via `muxProvider.uploadAsset()`, salva `videoMuxAssetId` + `videoMuxPlaybackId`. Polling Mux para pegar `videoDurationSeconds` (timeout 60s — se nao, salva null e marca lesson como `isPublished: false`).
  - Le capa, salva via `mediaStorage.put({ scope: 'library/covers' })`.
  - Calcula `articleWordCount`.
  - `categoryId` validado contra enum (D13). Erro se invalido.
  - `tags[]` parseado como CSV interno (split por `,`).
  - `isPublished` default `false` (founder publica manual depois via... — fora de escopo MVP, founder tem acesso direto ao DB).
- Cap: 50MB total payload, 100 rows no manifest.
- Idempotente: rerun com mesmo CSV nao duplica (upsert por slug).
- Atomico: nao ha — se falhar metade, primeira metade fica salva (founder roda novo CSV so com erros).

**Erros nao-fatais (registrados em `errors[]` mas nao param o batch):**
- Arquivo nao encontrado em `files[]`
- Categoria invalida
- HTML invalido (sanitizado vazio)
- Mux upload falha (lesson criada com `videoMuxPlaybackId = null`)

**Erros fatais (param o batch + 400):**
- CSV malformado
- Campo obrigatorio ausente em row de tipo course/module/lesson
- Slug duplicado dentro do mesmo curso

**Criterios de aceitacao:**
- [ ] CSV valido com 1 curso + 6 modulos + 46 lessons cria todas as rows
- [ ] Rerun com mesmo CSV nao duplica rows
- [ ] HTML malicioso sanitizado em `articleHtml`
- [ ] Audio duration calculada corretamente (testado com M4A real do Curso 00)
- [ ] Mux upload chamado quando video_filename presente
- [ ] Mux falha → lesson criada com video null, error registrado
- [ ] Categoria invalida → row skipped + error registrado
- [ ] Cap 50MB enforced (413 se exceder)
- [ ] Cap 100 rows enforced

---

### RF-12 — Sidebar Update + Resolucao de Conflito de Naming

**O que faz.** Adiciona item "Biblioteca" sob FERRAMENTAS apontando para `/biblioteca`. Renomeia item DADOS atual de "Biblioteca" para "Torneios" (mantendo rota `/library`).

**Mudancas em `client/src/components/Sidebar.tsx`:**
```tsx
// Em DADOS section:
{ path: '/library', icon: BookOpen, label: 'Torneios', adminOnly: false },  // era 'Biblioteca'

// Em FERRAMENTAS section:
{ path: '/estudos', icon: BookOpen, label: 'Estudos', adminOnly: false },
{ path: '/biblioteca', icon: GraduationCap, label: 'Biblioteca', adminOnly: false },  // NOVO — icone GraduationCap diferencia visualmente
{ path: '/calculadoras', icon: Wrench, label: 'Ferramentas', adminOnly: false },
{ path: '/bankroll', icon: Wallet, label: 'Banca', adminOnly: false },
```

**Por que `GraduationCap`?** Diferencia visualmente do `BookOpen` que continua em outros lugares (Estudos, Torneios). Lucide-react ja tem o icone.

**Mudancas em `client/src/App.tsx` (router):** adicionar rotas `/biblioteca`, `/biblioteca/curso/:courseSlug`, `/biblioteca/curso/:courseSlug/:lessonSlug`.

**Mudancas em label de pagina existente:** atualizar componentes que renderizam header "Biblioteca de Torneios" para refletir novo label se necessario (low priority — UX cosmetico).

**Criterios de aceitacao:**
- [ ] Sidebar mostra "Torneios" no grupo DADOS apontando para `/library`
- [ ] Sidebar mostra "Biblioteca" no grupo FERRAMENTAS apontando para `/biblioteca` com icone diferente
- [ ] Rotas `/biblioteca`, `/biblioteca/curso/:slug`, `/biblioteca/curso/:slug/:lesson` registradas em `App.tsx`
- [ ] Click em sidebar ativa highlight correto (Wouter `useLocation` match)

---

## 6. Requisitos Nao-Funcionais

### 6.1. Performance
- **Capa lazy-loaded.** `loading="lazy"` + `decoding="async"`. First paint <1.5s no `/biblioteca` com 12 cursos.
- **Video chunked HLS.** Mux serve HLS — Mux Player gerencia buffering. NAO baixar video inteiro upfront.
- **Audio progressive.** `<audio preload="metadata">` — baixa headers, nao bytes. Range requests honrados pelo endpoint `/audio` (D9).
- **Catalog endpoint p95 < 200ms.** Query com `JOIN modules + lessons + access` precisa de indices em `library_lessons.courseId` e `user_lesson_access.userId`.
- **Endpoint `playback-token` p95 < 100ms.** SDK Mux signing e CPU-bound mas rapido.

### 6.2. Seguranca
- **Mux signed URLs TTL 4h** (D8). Renovacao automatica antes de expirar.
- **DOMPurify server-side** para artigo (D10). Allowed tags rigorosos.
- **Watermark video** — `userPlatformId` overlay (poor-man DRM, dissuade upload bruto).
- **Hard-block hotlink imagens.** `articleHtml` so aceita `<img src="/api/library/assets/...">` — externos rejeitados em sanitize.
- **Endpoint admin** — `requirePermission('admin_full')` em RF-04 e RF-11.
- **Rate limit eventos** 60/min/user em RF-06.
- **Cap upload** 50MB por batch em RF-11.

### 6.3. Disponibilidade
- **Mux indisponivel** → endpoint `playback-token` retorna 503, frontend mostra fallback "Video temporariamente indisponivel — tente podcast ou artigo". Outros formatos continuam funcionando.
- **Storage indisponivel** → endpoint `/audio` ou `/assets` retorna 503, frontend mostra "Asset temporariamente indisponivel".
- **Eventos fire-and-forget** — falha de POST events nao bloqueia UX (best-effort).
- **Manifest upload atomico-falha-parcial** — RF-11 nao reverte rows ja criadas; founder roda novo manifest com diff.

### 6.4. Refund-Ready (Spec 4 prep)
- `library_progress` permite calculo de `% consumo total` por curso = `sum(lastPositionSeconds) / sum(totalDurationSeconds)` filtrado por `user + courseId`.
- Refund 25% gating (decisao founder D5): se `% consumo < 25%` E `granted_at < 7d` → refund elegivel. Logica fica em Spec 4 (checkout).

### 6.5. Acessibilidade
- Tabs no viewer com `role="tablist"` + `aria-selected`.
- Audio/video controles nativos (HTML5 + Mux Player) ja a11y-compliant.
- Capas com `alt` text = lesson title.
- Sticky audio bar com `aria-label="Player de audio em background"`.

---

## 7. Modelo de Dados (Diagrama Textual)

```
users (existing)
  └──< user_lesson_access >── library_lessons
                                    │
                                    │── library_modules ── library_courses
                                    │
  └──< library_events >─────────────┤
  └──< library_progress >───────────┘
```

ERD detalhado: ver RF-01. ADR sera criado pelo `system-architect` documentando decisoes de schema (composite uniques, denormalizacao `courseId` em lessons, enum vs lookup table).

---

## 8. Endpoints Sumario

| Metodo | Rota | Auth | Permission | Descricao | RF |
|---|---|---|---|---|---|
| GET | `/api/library/courses` | JWT | — | Lista cursos publicados | RF-05 |
| GET | `/api/library/courses/:slug` | JWT | — | Detalhe curso + modulos + lessons | RF-05 |
| GET | `/api/library/lessons/:id` | JWT | lesson access | Detalhe aula (3 formatos) | RF-05 |
| GET | `/api/library/lessons/:id/playback-token` | JWT | lesson access | Mux signed URL | RF-03 |
| GET | `/api/library/lessons/:id/audio` | JWT | lesson access | Stream M4A (Range) | D9 |
| GET | `/api/library/lessons/:id/progress` | JWT | lesson access | Progresso 3 formatos | RF-06 |
| PATCH | `/api/library/lessons/:id/progress` | JWT | lesson access | Upsert progresso | RF-06 |
| POST | `/api/library/events` | JWT | lesson access | Registra evento | RF-06 |
| GET | `/api/library/assets/:key` | JWT | — | Serve capa/asset generico | RF-05 |
| POST | `/api/admin/library/grant-access` | JWT | admin_full | Libera acesso N lessons/user | RF-04 |
| POST | `/api/admin/library/import-manifest` | JWT | admin_full | Batch upload curso completo | RF-11 |

Total: **11 endpoints novos**.

---

## 9. UI/UX Wireframe Textual

### 9.1. `/biblioteca` (Lista de Cursos)

```
┌─ Sidebar ─┬─────────────────── Main ────────────────────┐
│           │  Biblioteca Grindfy                          │
│           │  Cursos para evoluir cada area do seu jogo   │
│           │                                              │
│           │  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│           │  │  CAPA    │  │  CAPA    │  │  CAPA    │    │
│           │  │  16:9    │  │  16:9    │  │  16:9    │    │
│           │  ├──────────┤  ├──────────┤  ├──────────┤    │
│           │  │ Antes    │  │ Anatomia │  │ ... cap  │    │
│           │  │ das C... │  │ de um... │  │ "em br.. │    │
│           │  │ 46 aulas │  │ 11 mod.. │  │  0/N lib │    │
│           │  │ ✓ 12 lib │  │  6/11 li │  │          │    │
│           │  └──────────┘  └──────────┘  └──────────┘    │
└───────────┴──────────────────────────────────────────────┘
```

### 9.2. `/biblioteca/curso/:slug` (Detalhe do Curso)

```
┌── Cover full-width 21:9 ──────────────────────────────────┐
│                                                           │
│              00 - Antes das Cartas                        │
│   "Fundacao mental para o profissional de poker MTT"      │
└───────────────────────────────────────────────────────────┘
Biblioteca > Antes das Cartas

[Continuar de onde parou: A3 - Identidade]  ← deep-link

▼ Bloco A - Fundamentos Mentais (8 aulas)
   ┌─ A1 ─┬─ Mentalidade Fixa vs Crescimento ─┬─ 12min ─┬─ ✓ liberado ─┐
   ┌─ A2 ─┬─ A Dicotomia do Controle ────────┬─ 14min ─┬─ ✓ liberado ─┐
   ...
▶ Bloco B - Biologia do Aprendizado (7 aulas)
▶ Bloco C - Metodo e Pratica (9 aulas)
...
```

### 9.3. `/biblioteca/curso/:slug/:lesson?tab=video` (Viewer)

```
Biblioteca > Antes das Cartas > Bloco A > A1 - Mentalidade Fixa

┌── A1 - Mentalidade Fixa vs Mentalidade de Crescimento ─┐
│  Categoria: Performance Mental | 12min | tags          │
└────────────────────────────────────────────────────────┘

[ Video ] [ Podcast ] [ Artigo ]   ← tabs (so aparecem se formato disponivel)
─────────

┌────────────────────────────────────────────────────────┐
│                                                        │
│              MUX PLAYER (HLS)                          │
│                                                        │
│             [watermark: USER-1234]                     │
│                                                        │
└────────────────────────────────────────────────────────┘
[<<] [>] [>>]   12:34 / 24:00   [1x ▼]   [⛶]

▓▓▓▓▓▓▓▓░░░░░░░░░░░  52%  (max progresso entre formatos)
```

### 9.4. Sticky Audio Bar Mobile

```
        [usuario navegou para /dashboard com podcast tocando]

┌────────── Dashboard content ──────────────────────────┐
│                                                       │
│  ROI: 24% | Profit: $X | ...                          │
│                                                       │
└───────────────────────────────────────────────────────┘
┌── 🎧 [capa 40px] A1 - Mentalidade ────── [▶] [×] ────┐
│ ▓▓▓▓▓▓░░░░░░ 12:34 / 24:00                           │
└───────────────────────────────────────────────────────┘
```

### 9.5. Coach Chat — Card de Recomendacao

```
Coach: Vejo no seu HUD que voce esta foldando 19% das vezes em
       3-bet pots — leak classico de postflop OOP. Aqui estao
       3 aulas que vao destravar isso:

       ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
       │   CAPA 16:9  │  │   CAPA 16:9  │  │   CAPA 16:9  │
       │  M3 - 3-bet  │  │  M5 - OOP    │  │  M7 - C-bet  │
       │  18min       │  │  22min       │  │  15min       │
       │ [▶ Assistir] │  │ [▶ Assistir] │  │ [Em breve]  │
       └──────────────┘  └──────────────┘  └──────────────┘
       (carrossel se >1 aula)

User: <continua chat>
```

### 9.6. Acesso Bloqueado (Capa em /biblioteca)

```
┌──────────┐
│  CAPA    │  cinza escuro overlay opacity 0.4
│  16:9    │
├──────────┤
│ Anatomia │
│ de um... │
│ 11 mod.  │
│          │
│ [Em breve] ← cinza, cursor not-allowed, tooltip
└──────────┘
```

---

## 10. Plano de Testes

### 10.1. Unit (Vitest + node project)

**Server:**
- `mediaStorage.put/get/delete/exists` — happy + path traversal + missing file
- `mediaStorage.SPOT_IMAGE_STORAGE_BACKEND alias` — env aliasing funciona com warn
- `muxProvider.createPlaybackToken` — happy + sem env (503)
- `recommendLesson handler` — input valido, schema parse, ranking categoria > tags, tier gating
- `recommendLesson side-effect` — events `coach_recommend` gravados
- `coachSafetyPrompts.COMPETITOR_BLOCKLIST` — exportada + presente em system prompt
- `library-categories enum` — labels PT-BR completos
- DOMPurify sanitize — XSS payload (`<script>`, `<img onerror>`, `javascript:`) bloqueado
- Manifest CSV parser — happy + malformed + slug duplicado
- Slug generator — colisao gera sufixo nanoid

**Frontend:**
- `LibraryHome` renderiza cursos com hasAnyAccess
- `LibraryHome` empty state quando 0 cursos
- `LibraryCourseDetail` accordion expand/collapse
- `LessonRow` bloqueado nao navega
- `LessonViewer` tabs renderizam so formatos disponiveis
- `LessonViewer` sync de progresso cross-format (D5)
- `StickyAudioBar` aparece/some conforme contexto + viewport
- `CoachLessonRecommendationCard` renderiza com 1, 2, 3 lessons
- Speed control persiste em localStorage

### 10.2. Integration (Vitest + jsdom + MSW)

- `POST /api/admin/library/grant-access` — happy + idempotente + cap 500 + 403 sem permissao + 404 user inexistente
- `POST /api/admin/library/import-manifest` — CSV completo + erros parciais nao bloqueiam batch
- `GET /api/library/courses` — apenas published + ordenado
- `GET /api/library/lessons/:id` — 401 sem grant + 200 com grant
- `GET /api/library/lessons/:id/playback-token` — TTL correto + watermark text
- `POST /api/library/events` — 60/min rate limit + 401 sem grant + fire-and-forget 202
- `PATCH /api/library/lessons/:id/progress` — upsert + 95% marca completedAt + 5s throttle 429

### 10.3. E2E (Playwright — fora de escopo MVP)

> Marcador: E2E rodara em Spec 5 (polish). MVP fica em unit + integration.

### 10.4. Cobertura Minima Esperada

- 80% coverage em `server/services/mediaStorage.ts`, `muxMediaProvider.ts`, `recommendLesson.ts`
- 90% coverage em `coachSafetyPrompts.ts` (pequeno + critico)
- 70% coverage em components frontend (foco em LessonViewer, CoachLessonRecommendationCard)

### 10.5. Test Data Fixtures

- 1 curso fixture com 2 modulos x 3 aulas = 6 aulas (2 com video+audio+article, 2 so audio+article, 2 so article)
- 2 users fixture: 1 com grant em 3 aulas, 1 sem grant
- 1 admin fixture
- HTML fixture com payload XSS para test sanitize

---

## 11. Criterios de Aceitacao Globais

A spec eh considerada DONE quando:

- [ ] Todas as 11 RFs marcadas DONE com criterios individuais ✓
- [ ] Migration aplica em DB limpo + DB com dados existentes
- [ ] `npm run check` passa (typecheck zero erros)
- [ ] `npx vitest` passa (zero red — incluindo testes existentes inalterados)
- [ ] Founder consegue subir Curso 00 via manifest CSV em uma chamada
- [ ] Founder consegue liberar acesso para 1 alpha tester via 1 chamada
- [ ] Alpha tester consegue navegar `/biblioteca` → curso → aula e consumir nos 3 formatos
- [ ] Alpha tester consegue ouvir podcast no mobile, navegar para outra rota, audio continua tocando
- [ ] Coach chat detecta leak (mock) e renderiza card de recomendacao
- [ ] Coach chat NAO menciona nenhuma marca de concorrente em qualquer resposta (validado em test)
- [ ] Sidebar mostra "Biblioteca" sob FERRAMENTAS (icone GraduationCap) e "Torneios" sob DADOS
- [ ] Watermark video visivel com `userPlatformId`

---

## 12. Fora de Escopo (Explicito)

Para evitar scope creep:

- **Checkout Stripe** — Spec 4
- **Bundles + planos Premium Annual** — Spec 4
- **PIX/MercadoPago** — Spec 4
- **Refund automation (gating + reembolso)** — Spec 4 (logica de % consumo ja preparada)
- **B2 Stats Analyzer dispara recomendacao automatica** — Spec 2
- **B7 Notas indexadas (Coach le notas)** — Spec 2
- **B6 Warm-up consome conteudo da Biblioteca** — Spec 3
- **B4 Trilhas curadas (sequencia recomendada)** — Spec 3
- **B3 Capas com badge dinamico ("novo", "popular") + preview 90s** — Spec 4
- **B10 Bookmarks por timestamp** — Spec 5
- **B8 Pos-grind sugere aula** — Spec 5
- **B9 Quiz Claude-gen** — Spec 6
- **B11 XP/streak/gamificacao** — Spec 5 (skippable)
- **B13 Highlights compartilhaveis** — Spec 6
- **B14 Marketplace creator (Stripe Connect)** — Spec 6
- **UI admin para criar/editar conteudo** — Founder edita via DB direto + manifest CSV no MVP
- **CDN para capas/audio** — Mux ja faz CDN para video; capa/audio sai do servidor direto no MVP
- **Subtitulos/legendas** — Mux suporta nativamente; spec futura adiciona upload de VTT
- **Multi-language conteudo** — PT-BR only no MVP
- **Download offline** — sem (futuro: PWA + service worker para podcast)
- **Comentarios em aulas** — sem (futuro: Spec 6 marketplace)
- **Avaliacao/rating de aula** — sem
- **Tabela `library_categories` (DB)** — categorias ficam em enum hardcoded (D13)

---

## 13. Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| Mux API mudar/deprecar | Baixa | Medio | Encapsular em `MuxMediaProvider`; trocar SDK = 1 arquivo |
| Hotlink de audio massivo | Baixa | Baixo | MVP aceita risco (D9). Se virar problema, adicionar signed URL parecido com Mux |
| Watermark facil de remover (CSS overlay) | Alta | Baixo | MVP aceita — watermark e poor-man DRM, dissuade casual upload. DRM real (Widevine) custa muito mais |
| Cap 50MB no manifest pode ser baixo para curso 01 (videos MP4) | Media | Medio | Founder pode rodar manifest sem `video_filename` e fazer upload Mux direto via web (Mux dashboard) e atualizar CSV depois com `videoMuxPlaybackId` |
| Refactor `MEDIA_STORAGE_BACKEND` quebra `spotImageStorage` existente | Media | Alto | Wrapper retrocompat + suite de testes existentes precisa ficar verde |
| Sticky audio bar mobile causa bug em iOS Safari (autoplay policy) | Media | Medio | Audio so pode tocar em background **apos user interaction** (D6 ja respeita — bar aparece apos play manual) |
| `recommendLesson` retorna 0 aulas (categoria sem conteudo) | Alta no MVP | Baixo | Tool retorna `{ lessons: [] }` com `ok: true`; Coach trata e nao mostra card |
| Founder esquece de marcar `isPublished = true` | Alta | Medio | Documentar em fluxo de uso. UI admin futura resolve. |
| Concorrente rebrand (ex: GTO Wizard vira "Wizard Pro") | Baixa | Baixo | Lista facil de atualizar em `coachSafetyPrompts.ts` |
| Conflito naming "Biblioteca" confunde users existentes | Media | Baixo | Renomeacao `Torneios` em DADOS clareia. Toast explicativo no primeiro acesso? (cosmetico) |
| HTML do conteudo bruto (00, 01) tem tags fora da allowlist | Alta | Medio | Sanitize remove tags nao-listadas; founder revisa output e ajusta allowlist se quebrar render. Testar com 1 HTML real antes de batch |

---

## 14. Plano de Rollout

### 14.1. Feature Flag

**NAO ha feature flag global.** Acesso e controlado por `user_lesson_access` — usuario sem grant ve catalogo aspiracional mas nao consome.

**Excecao:** sidebar item "Biblioteca" aparece para TODOS os usuarios (founder quer trigger aspiracional). Se founder quiser esconder durante alpha test, criar `LIBRARY_FEATURE_HIDDEN=1` env var que oculta o item.

### 14.2. Migracao em Producao (futuro deploy)

1. **Pre-deploy:** rodar `db:push` para aplicar migration (proxima numerada).
2. **Deploy:** seta env vars Mux + (opcional) `MEDIA_STORAGE_BACKEND=s3` + credenciais.
3. **Post-deploy:** founder roda manifest CSV para subir Curso 00 + Curso 01.
4. **Liberacao alpha:** founder roda `grant-access` para lista de alpha testers.
5. **Smoke test:** founder usa propria conta (com grant) para testar viewer + sticky bar + Coach card.

### 14.3. Reversao

- **Reversao soft:** `UPDATE library_courses SET isPublished = false WHERE id = X` — esconde curso de `/biblioteca` sem apagar.
- **Reversao hard:** drop migration. **Perde dados de `library_events` + `library_progress`.** Aceitavel em MVP pre-launch.

### 14.4. Monitoramento (post-rollout)

Metricas a popular em dashboard interno (futuro Spec 5):
- DAU `/biblioteca` (events `view`)
- % completion por curso (events `complete` / events `play`)
- Coach `recommend_lesson` invocations / day
- CTA click-through em card Coach (events `play` derivados de `coach_recommend` em janela curta)
- Lessons mais consumidas (top 10)
- Lessons sem nenhum consumo (0 events) — sinal pra repensar conteudo

Logging (server console):
- Cada chamada admin `grant-access` → log `[LIBRARY] admin granted N lessons to user`
- Cada chamada `import-manifest` → log `[LIBRARY] imported course X with N lessons`
- Cada falha Mux signing → log error level

---

## 15. Dependencias Externas

| Lib | Versao | Justificativa |
|---|---|---|
| `@mux/mux-node` | latest | SDK Mux server-side |
| `@mux/mux-player-react` | latest | Player React com signed URL + watermark |
| `isomorphic-dompurify` | latest | Sanitize HTML server-side |
| `music-metadata` | latest | Extrai duracao M4A no manifest upload |

Adicao: confirmar com founder antes de adicionar (regra autonomia: editar `package.json` deps requer aprovacao).

---

## 16. Notas de Implementacao para Proximos Agentes

### 16.1. Para `system-architect`

- **ADR sugeridos:**
  - ADR-XXX `mux-integration-strategy.md` — por que Mux, por que signed URLs TTL 4h, por que watermark CSS-only
  - ADR-XXX `media-storage-abstraction-generalization.md` — refactor de ADR-057, renomeacao `SPOT_IMAGE_STORAGE_BACKEND` → `MEDIA_STORAGE_BACKEND`, retrocompat
  - ADR-XXX `library-categories-enum-vs-table.md` — por que enum em codigo MVP (custo migration > beneficio editavel)
  - ADR-XXX `library-progress-cross-format-sync.md` — por que segundos absolutos vs percentual (D5)
  - ADR-XXX `library-coach-recommendation-tool-design.md` — input/output da tool, ranking, tier gating
- **Diagramas Mermaid sugeridos:**
  - `library-data-model.mermaid` — ER das 7 tabelas
  - `library-viewer-progress-sync.mermaid` — sequence diagram cross-format sync
  - `library-coach-recommendation-flow.mermaid` — sequence Coach detecta leak → invoca tool → renderiza card
  - `library-import-manifest-flow.mermaid` — flowchart batch upload

### 16.2. Para `test-writer`

- Comecar por **schema tests** (RF-01) — sem schema verde, nada compila.
- Depois **mediaStorage** (RF-02) — fundacao de RF-11.
- Depois **catalogo endpoints** (RF-05) — base para RF-07.
- Depois **viewer** (RF-08) — `LessonViewer` e o componente mais complexo.
- Mocks: usar `MSW` para fetch endpoints. Mock `MuxMediaProvider` em testes server-side (nao chamar API real).

### 16.3. Para `implementer`

- **Reusar pattern existente** de `spotImageStorage.ts` para `mediaStorage.ts` (RF-02).
- **Reusar pattern existente** de `readThemeWithLinkedSpotsTool` para `recommendLesson` (RF-10) — mesma estrutura de export.
- **Reusar pattern existente** de admin endpoints em `server/routes/admin.ts` para RF-04 e RF-11.
- **NAO modificar testes** (regra `implementer` skill).
- **Lessons learned aplicaveis:**
  - #1 (hooks primeiro) em `LessonViewer`
  - #2 (data-testid) em CourseCard, LessonRow, ProgressBar, StickyAudioBar
  - #4 (Vitest 4 test.projects) — adicionar fixtures novos no projeto correto (node ou jsdom)
  - #11 (default minimo) — `CoachLessonRecommendationCard` so renderiza CTA se `hasAccess` definido
  - #12 (estado persistente) — `AudioPlayerContext` precisa sobreviver navegacao Wouter

### 16.4. Para `reviewer`

- Auditar **XSS no artigo HTML** — testar payload malicioso via test fixture
- Auditar **path traversal** em `/api/library/assets/:key`
- Auditar **rate limit** em events endpoint (60/min)
- Auditar **cap** em manifest endpoint (50MB, 100 rows, 500 lessons grant)
- Auditar **watermark** — userPlatformId esta exposto no DOM? Aceitavel (nao e secret).
- Auditar **leak de URLs Mux** — signed URL nao deve aparecer em logs publicos
- Auditar **idempotencia** em grant-access e import-manifest
- Auditar **cleanup** se import-manifest falhar parcialmente

---

## 17. Verificacao Final (Checklist do PM)

- [x] Cada RF tem criterios de aceitacao verificaveis
- [x] Cenarios de teste cobrem happy + erros + edge cases
- [x] Fora de escopo explicito (Spec 2-6 mapeadas)
- [x] Sem ambiguidade — D1-D15 resolvem decisoes em cada ponto cinzento
- [x] Spec independente — Test-writer pode gerar testes sem perguntar
- [x] Endpoints listados com metodo, rota, auth, permissao
- [x] Modelos de dados documentados com campos + constraints
- [x] Riscos identificados + mitigados
- [x] Plano de rollout viavel (sem feature flag mas com kill switch via `isPublished`)

---

## 18. Aprovacao

Aguardando dev confirmar:
- [ ] Esta faltando algum cenario ou regra?
- [ ] Alguma decisao tomada esta errada (D1-D15)?
- [ ] OK conflito de naming sidebar resolvido em D1 (renomear "Torneios")?
- [ ] OK posso prosseguir para `system-architect`?

**Proximo passo recomendado apos aprovacao:**
```
→ Use o agente system-architect para criar arquitetura + ADRs + diagramas Mermaid
  baseado em Docs/specs/biblioteca-spec-1.md
```
