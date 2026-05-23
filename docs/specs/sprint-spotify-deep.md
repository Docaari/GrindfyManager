# Spec: Sprint SPOTIFY-DEEP — Catalogo Spotify wirado UI + queue dual-source

## Status
Proposta

---

## 1. Resumo executivo

Spotify OAuth + driver real ja shipados (MP2 commit `0fb31bb8`) mas nenhum
ponto de UI permite buscar/playar tracks Spotify — user conecta e fica sem
catalogo. Esta sprint wira 2 superficies de descoberta (search global + browse
playlists do user), 3 endpoints backend proxy autenticado com auto-refresh +
rate-limit + cache, botao "Buscar Spotify" no MiniPlayerBar e dual-source na
queue existente (library + Spotify lado a lado, badge distintivo).

---

## 2. Contexto

**Estado atual (pos-MP3):**
- `server/routes/spotifyAudio.ts` expoe 5 endpoints OAuth/refresh/status —
  zero proxy de catalogo.
- `client/src/lib/audio-engine/SpotifyAudioDriver.ts` implementa play via
  `PUT /me/player/play` com `uris:[trackId]` — mas trackId nunca chega ate
  ele porque nao ha UI de busca.
- `SpotifyConnectionPanel` em `/coach-ai` so liga/desliga.
- `MiniPlayerBar` tem `LessonsButton` (library) + `SpotifyConnectButton`
  (commit `22023510`) — falta entrypoint de busca.
- `QueuePopover` (MP3) ja existe mas so renderiza source `library`.

**Gap:** Premium conectado nao consegue achar nem playar nada Spotify.

**Por que agora:** pre-launch. Sem catalogo, a feature Spotify Premium-only
nao tem valor demonstravel — user conecta e abandona.

---

## 3. Usuarios

- **Premium conectado:** busca tracks/playlists, adiciona na queue, play
  instantaneo (driver MP2).
- **Free/Trial conectado (edge: downgrade pos-Premium):** ve search dialog
  mas com banner "Premium required" + CTA upgrade. Sem fetch.
- **Free/Trial nao conectado:** botao "Buscar Spotify" desabilitado (ou
  oculto) — caminho continua sendo `SpotifyConnectButton` → OAuth → upgrade
  block ja existente (MP2 `SpotifyPremiumGateDialog`).

---

## 4. Requisitos Funcionais

### RF-01: SpotifySearchDialog (busca tracks)

**Descricao:** Modal Radix Dialog acionado por botao novo no MiniPlayerBar.
Input de busca com debounce 500ms, chama `GET /api/audio/spotify/search?q=&type=track`,
renderiza top 20 resultados (cover thumb 48px + title + artist + duration
mm:ss + preview button + add button). Click no add → adiciona na queue
(via `useQueueState` MP3) E NAO tocha imediato. Click no row inteiro → toca
imediato (replace currentTrack, push old → queue head).

**Regras de negocio:**
- Tier Premium-only no client: se user nao-Premium ou nao-conectado, dialog
  mostra empty-state "Conecte sua conta Premium" + CTA `SpotifyConnectButton`
  reaproveitado.
- Debounce: typing rapido reseta timer; query so dispara apos 500ms sem typing.
- Min 2 chars antes do primeiro fetch (evita queries vazias).
- Loading state: skeleton 5 rows.
- Empty result: "Nenhum resultado para '{q}'".
- Error state: banner vermelho "Spotify indisponivel" + retry button (mesmo
  texto serve pra 429, 5xx, network — UI generica).
- Preview: 30s via `track.preview_url` em HTML5 `<audio>` inline (1 elem
  global no dialog, troca `src` ao clicar outro preview). Pause auto ao
  fechar dialog OU ao adicionar/tocar.
- Preview nao bloqueia/interfere com playback principal (MiniPlayerBar
  continua tocando library atual em paralelo se houver — preview sai pelos
  speakers junto. Aceito; sem ducking).
- Add → toast "Adicionado a fila".
- Play imediato → fecha dialog automaticamente.

**Criterios de aceitacao:**
- [ ] Dialog abre via botao MiniPlayerBar.
- [ ] Debounce 500ms verificavel (fake timers).
- [ ] Min 2 chars enforced.
- [ ] Skeleton renderiza durante fetch.
- [ ] Empty/error states distintos.
- [ ] Preview button toca 30s; troca pra outro preview pausa o anterior.
- [ ] Fechar dialog pausa preview.
- [ ] Add chama `addToQueue({source:'spotify', trackId, title, artist,
      coverUrl, durationSec})`.
- [ ] Click row chama `playNow(...)` (substitui current, empurra old pro
      head se houver).
- [ ] Tier gate empty-state quando nao-Premium/nao-conectado.

**Complexidade:** **M**

---

### RF-02: SpotifyPlaylistBrowser (tab Playlists no mesmo dialog)

**Descricao:** Mesmo dialog do RF-01 com 2 tabs Radix: "Buscar" (RF-01) e
"Minhas Playlists". Tab 2 chama `GET /api/audio/spotify/me/playlists` no
mount (ou ao clicar tab — lazy), lista playlists do user (cover + nome +
contagem de tracks). Click em playlist → drill-in (mesmo dialog troca pra
view de tracks dessa playlist) → `GET /api/audio/spotify/playlists/:id/tracks`
→ mesma render de RF-01 + 2 botoes globais "Tocar tudo" + "Adicionar tudo a
fila".

**Regras de negocio:**
- Tab "Buscar" eh default. Estado de tab persiste durante a sessao do dialog
  (reset ao fechar).
- Lazy fetch: playlists so carregam quando tab eh ativada pela primeira vez
  na sessao do dialog.
- Cache client TanStack Query 5min (key `['spotify','playlists',userId]`).
- Drill-in: breadcrumb "← Playlists" no topo do view de tracks. Click volta
  pra lista de playlists sem refetch (cache).
- "Tocar tudo": play primeiro track + queue rest (max 50 tracks; trunca com
  toast "Playlist truncada em 50 itens" se maior).
- "Adicionar tudo": queue todos (mesmo cap 50).
- Tracks render igual RF-01 (preview, add, click=play).
- Empty: "Voce nao tem playlists." (raro mas possivel).
- Paginacao: NAO-escopo. Top 50 playlists do user; mais que isso, banner
  "Mostrando primeiras 50 playlists" + sem next-page.

**Criterios de aceitacao:**
- [ ] 2 tabs Radix renderizam.
- [ ] Tab "Playlists" lazy fetch.
- [ ] Click playlist drill-in.
- [ ] Breadcrumb volta sem refetch.
- [ ] "Tocar tudo" play first + queue rest (cap 50).
- [ ] "Adicionar tudo" queue todos (cap 50).
- [ ] Truncation toast quando playlist > 50.
- [ ] Empty playlists state.
- [ ] Cache 5min visivel no devtools (key estavel).

**Complexidade:** **M**

---

### RF-03: Backend proxy (3 endpoints)

**Descricao:** Estender `server/routes/spotifyAudio.ts` com 3 handlers novos.
Todos `requireAuth`. Cada handler resolve access_token valido (auto-refresh
se `expiresAt < now + 60s`), faz proxy pro Spotify Web API, normaliza
resposta pra shape client-friendly (subset de campos), aplica rate-limit
local + cache.

**Handlers (exportados, paridade com lesson #34):**

1. `handleSpotifySearch(req, res, deps?)` — `GET /api/audio/spotify/search`
   - Query: `q` (string, 2..200), `type` (string, hoje so `track`),
     `limit` (number, default 20, max 50).
   - Proxy: `GET https://api.spotify.com/v1/search?q={q}&type=track&limit={n}&market=from_token`.
   - Response shape: `{ tracks: SpotifyTrack[] }` (ver §5).

2. `handleSpotifyListPlaylists(req, res, deps?)` — `GET /api/audio/spotify/me/playlists`
   - Query: `limit` (default 50, max 50). Sem paginacao.
   - Proxy: `GET https://api.spotify.com/v1/me/playlists?limit={n}`.
   - Response shape: `{ playlists: SpotifyPlaylist[], total: number }`.

3. `handleSpotifyPlaylistTracks(req, res, deps?)` — `GET /api/audio/spotify/playlists/:id/tracks`
   - Param: `:id` (string Spotify playlist id, regex `^[a-zA-Z0-9]{22}$`).
   - Query: `limit` (default 50, max 50).
   - Proxy: `GET https://api.spotify.com/v1/playlists/{id}/tracks?limit={n}&fields=items(track(id,name,uri,duration_ms,preview_url,album(images),artists(name)))`.
   - Response shape: `{ tracks: SpotifyTrack[], truncated: boolean }`.

**Regras de negocio:**
- **Tier gate server-side:** todos os 3 handlers chamam helper novo
  `requireSpotifyAccess(userId)` que retorna `{ accessToken } | { error:
  'not_connected'|'not_premium'|'tier_blocked' }`. Logic:
  1. Busca `spotify_tokens` row. Sem row OR `disconnectedAt != null` →
     `not_connected` → 403 `{message:'Spotify nao conectado'}`.
  2. Resolve tier app via `resolveUserTier(user)` (`server/coachAccess.ts`).
     Se NAO em `{'pro','premium','admin'}` → `tier_blocked` → 403
     `{message:'Premium Grindfy necessario'}`. Trial: alinhar com decisao
     §6 (provisorio: bloqueado).
  3. Spotify product tier ja eh `premium` no OAuth callback (gate MP2). Se
     row.product nao for premium (bug futuro), tratar como `not_premium` →
     403 `{message:'Premium Spotify expirou. Reconecte.'}`.
- **Auto-refresh:** se `row.expiresAt < now() + 60s`, chama internamente
  pipeline de `handlePostSpotifyRefresh` (extrair helper interno
  `refreshSpotifyAccessToken(userId, deps)`). Em falha (`invalid_grant`),
  marca disconnected + retorna 401 `{message:'Spotify token revogado.
  Reconecte.'}` (mesma string do refresh existente — UI ja sabe tratar).
- **Rate-limit local (token bucket):** 180 req/min/user (paridade Spotify
  Web API). Implementacao in-memory por `userId` (Map). Excesso → 429
  `{message:'Rate limit local', retryAfterMs}`. Reset apos janela.
  Persistencia entre reinicios NAO-escopo (in-memory aceito).
- **Cache 5min in-memory:** key composta `(userId, endpoint, queryHash)`.
  Search: key inclui `q+type+limit`. Playlists list: key inclui `limit`.
  Tracks: key inclui `playlistId+limit`. TTL 5min. Cache hit pula proxy +
  pula rate-limit consumption. Sem invalidacao explicita (TTL natural).
- **Erro upstream Spotify:**
  - 401 (token rejeitado): tenta refresh once. Se falhar, 401 client.
  - 429 (Spotify rate-limit): propaga 429 + log telemetria
    `spotify_api_quota_hit`. NAO retenta automatico (back-off no client).
  - 5xx: propaga 502 + log `spotify_api_5xx`.
  - Network throw: 502 `{message:'Spotify indisponivel'}`.
- **Sanitizacao response:** servidor extrai apenas campos esperados (ver
  §5). Nunca devolve raw Spotify response (PII leakage, payload bloat).
- **Logging:** estruturado JSON com `userId, endpoint, durationMs,
  statusCode, cacheHit, rateLimitRemaining`. Nunca logga `accessToken` ou
  `q` literal (PII regex §5.5 do ADR-207 ja cobre `token`; adicionar `q`
  ao denylist se reviewer pedir).

**Criterios de aceitacao:**
- [ ] 3 endpoints registrados em `registerSpotifyAudioRoutes`.
- [ ] Zod validation no `q`, `type`, `limit`, `:id`.
- [ ] `requireSpotifyAccess` chamado em todos os 3.
- [ ] Auto-refresh disparado quando expiresAt iminente.
- [ ] `invalid_grant` → marca disconnect + 401.
- [ ] Token bucket 180/min enforced (verifycar via fake timer).
- [ ] Cache 5min hit/miss verificavel.
- [ ] 401 upstream → 1 retry com refresh; falha → 401 client.
- [ ] 429 upstream → 429 client + telemetria `spotify_api_quota_hit`.
- [ ] Response shape normalizado (sem campos extras Spotify raw).
- [ ] `accessToken` jamais loggado / retornado.

**Dependencias:**
- `server/services/spotifyTokenCrypto.ts` (existente).
- `server/coachAccess.ts::resolveUserTier` (existente).
- `server/storage/spotifyTokensStorage.ts` (existente).

**Complexidade:** **L**

---

### RF-04: Botao "Buscar Spotify" no MiniPlayerBar

**Descricao:** Novo botao no MiniPlayerBar, icone Lucide `Search` (ou
`SearchMusic` se disponivel), entre `LessonsButton` e `SpotifyConnectButton`
existentes (ordem: Lessons | **Search Spotify** | Connect Spotify).

**Regras de negocio:**
- **Condicional render:** mostra SEMPRE pra Premium-conectado. Para
  Free/Trial-conectado ou nao-conectado: mostra desabilitado com tooltip
  "Conecte sua conta Spotify Premium" (CTA implicito: usuario clica no
  Connect ao lado). NAO duplicar acao de connect aqui.
- **Click handler:** abre `SpotifySearchDialog` (RF-01) na tab default
  "Buscar".
- **aria-label:** `"Buscar musica no Spotify"`.
- **Telemetria:** dispara `audio.spotify_search_open` no click (RF antes
  do dialog render).
- **Keyboard shortcut:** `Cmd/Ctrl+K` global quando MiniPlayerBar visivel.
  (Alinhar com `ShortcutsHelpPopover` existente — adicionar entry.)
- **Mobile:** mostra so icon (sem label). Desktop: icon + tooltip on hover.
- **Hidden viewport:** alinhar com decisao §6 (provisorio: visivel sempre
  no MiniPlayerBar; nao aplicar `hidden md:inline-flex` como Queue button
  faz — search eh acao primaria).

**Criterios de aceitacao:**
- [ ] Botao renderiza entre Lessons e Connect.
- [ ] Estado disabled + tooltip quando nao-Premium-conectado.
- [ ] Click abre dialog na tab "Buscar".
- [ ] Cmd/Ctrl+K abre dialog global.
- [ ] `audio.spotify_search_open` dispara no click.
- [ ] aria-label correto.
- [ ] Atalho aparece em `ShortcutsHelpPopover`.

**Dependencias:** RF-01 (dialog), RF-03 (status endpoint ja existe).

**Complexidade:** **S**

---

### RF-05: Queue dual-source UI no QueuePopover

**Descricao:** `QueuePopover` (existente MP3) hoje renderiza apenas tracks
source `library`. Estender pra renderizar mix `library` + `spotify` com
badge distintivo + cover externa Spotify (`i.scdn.co`).

**Regras de negocio:**
- Track row recebe prop `source: 'library' | 'spotify'`.
- Badge: chip pequeno top-right do row. Library: invisivel (default).
  Spotify: chip verde Spotify (#1DB954) com icone Lucide `Music` e texto
  "Spotify".
- Cover URL: passa por `sanitizeCoverUrl` (existente). Whitelist host:
  estender `sanitizeCoverUrl` (ou criar `sanitizeSpotifyCoverUrl`
  paralelo) para aceitar apenas `i.scdn.co`, `mosaic.scdn.co`,
  `wrapped-images.spotifycdn.com`. Outros hosts caem no fallback img null
  → placeholder existente.
- Drag-reorder (dnd-kit MP3): funciona igual para ambos source.
- Remove: igual para ambos.
- Click row pra tocar agora: chama mesmo `playNow(track)`. Engine
  `AudioSourceEngine` ja troca driver com base em `source`.
- Empty state: igual.
- Header counter: "N na fila" agrega ambos.

**Criterios de aceitacao:**
- [ ] Row Spotify mostra badge verde.
- [ ] Row library nao mostra badge (regressao 0).
- [ ] Cover `i.scdn.co` renderiza; cover host estranho fallback placeholder.
- [ ] Drag-reorder funciona em queue mista.
- [ ] Remove funciona em queue mista.
- [ ] Click row Spotify chama engine que swap pro `SpotifyAudioDriver`.
- [ ] Counter agrega ambos.

**Dependencias:** RF-01/RF-02 (origem dos tracks Spotify), MP3
`useQueueState`, `AudioSourceEngine`.

**Complexidade:** **S**

---

## 5. Wireframes ASCII

### 5.1 SpotifySearchDialog — Tab Buscar

```
+-----------------------------------------------------------------+
|  Spotify                                                    [X] |
+-----------------------------------------------------------------+
|  [ Buscar  ] [ Minhas Playlists ]                               |
+-----------------------------------------------------------------+
|  [ search-icon ]  [____ buscar tracks ____________________]     |
+-----------------------------------------------------------------+
|  +--------+ Lofi Beats To Study                                 |
|  | cover  | Chillhop · 3:42        [preview ▶] [+ fila]         |
|  +--------+                                                     |
|  +--------+ Deep Focus                                          |
|  | cover  | Various · 4:11         [preview ▶] [+ fila]         |
|  +--------+                                                     |
|  ... (top 20)                                                   |
+-----------------------------------------------------------------+
|  20 resultados · click track tocar agora                        |
+-----------------------------------------------------------------+
```

### 5.2 SpotifySearchDialog — Tab Playlists (root)

```
+-----------------------------------------------------------------+
|  Spotify                                                    [X] |
+-----------------------------------------------------------------+
|  [ Buscar  ] [ Minhas Playlists ]                               |
+-----------------------------------------------------------------+
|  +--------+ Grindfy Focus                                       |
|  | cover  | 47 tracks                              [→]          |
|  +--------+                                                     |
|  +--------+ MTT Warmup                                          |
|  | cover  | 12 tracks                              [→]          |
|  +--------+                                                     |
|  ... (top 50)                                                   |
+-----------------------------------------------------------------+
```

### 5.3 SpotifySearchDialog — Tab Playlists (drill-in)

```
+-----------------------------------------------------------------+
|  Spotify                                                    [X] |
+-----------------------------------------------------------------+
|  [← Playlists]   Grindfy Focus (47)                             |
+-----------------------------------------------------------------+
|  [▶ Tocar tudo]  [+ Adicionar tudo na fila]                     |
+-----------------------------------------------------------------+
|  +--------+ Lofi Beats To Study                                 |
|  | cover  | Chillhop · 3:42        [preview ▶] [+ fila]         |
|  +--------+                                                     |
|  ... (cap 50)                                                   |
+-----------------------------------------------------------------+
```

### 5.4 MiniPlayerBar — novo botao posicao

```
+----------------------------------------------------------------------------------+
| [<<] [▶] [>>]  Lesson title — author       [vol] [aulas] [🔍] [spotify] [more]   |
+----------------------------------------------------------------------------------+
                                                            ↑
                                                       novo botao
                                                       Search Spotify
                                                       (Cmd/Ctrl+K)
```

Estados:
- Premium-conectado: enabled, hover tooltip "Buscar no Spotify (Cmd+K)".
- Free/Trial-conectado OR nao-conectado: disabled cinza, tooltip "Conecte
  sua conta Spotify Premium".

### 5.5 QueuePopover — dual-source

```
+--------------------------------------+
|  Fila (5)                       [⚙]  |
+--------------------------------------+
|  ⋮⋮ [cover] Lesson 7 — Push/Fold     |
|        Grindfy · 12:00         [×]   |
+--------------------------------------+
|  ⋮⋮ [cover] Lofi Beats   [🟢 Spotify]|
|        Chillhop · 3:42         [×]   |
+--------------------------------------+
|  ⋮⋮ [cover] Lesson 8 — ICM Deep      |
|        Grindfy · 18:30         [×]   |
+--------------------------------------+
|  ⋮⋮ [cover] Deep Focus   [🟢 Spotify]|
|        Various · 4:11          [×]   |
+--------------------------------------+
|  [ Limpar fila ]                     |
+--------------------------------------+
```

---

## 6. Contratos API

### 6.1 `GET /api/audio/spotify/search`

**Request:**
```ts
// Query
{
  q: z.string().min(2).max(200),
  type: z.literal('track'),                // futuro: 'track'|'album'|'artist'
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
}
// Auth: requireAuth (cookie session) + requireSpotifyAccess.
```

**Response 200:**
```ts
{
  tracks: Array<{
    trackId: string,        // ex: "spotify:track:0VjIjW4GlUZAMYd2vXMi3b"
    title: string,
    artists: string[],      // array de nomes (multi-artist permitido)
    durationSec: number,
    previewUrl: string | null,   // 30s preview ou null
    coverUrl: string | null,     // sanitized i.scdn.co only
    album: string,
  }>,
  cached: boolean,           // hint cache-hit (telemetria)
}
```

**Errors:**
- `400 {message:'Query invalido', details}` — Zod fail.
- `401 {message:'Spotify token revogado. Reconecte.'}` — refresh falhou.
- `403 {message:'Spotify nao conectado'}` — sem row.
- `403 {message:'Premium Grindfy necessario'}` — tier app block.
- `429 {message:'Rate limit local', retryAfterMs}` — token bucket.
- `429 {message:'Spotify rate-limit', retryAfterMs}` — upstream 429.
- `502 {message:'Spotify indisponivel'}` — upstream 5xx ou network.

---

### 6.2 `GET /api/audio/spotify/me/playlists`

**Request:**
```ts
{
  limit: z.coerce.number().int().min(1).max(50).optional().default(50),
}
```

**Response 200:**
```ts
{
  playlists: Array<{
    playlistId: string,
    name: string,
    trackCount: number,
    coverUrl: string | null,
    ownerName: string | null,
    isCollaborative: boolean,
    isPublic: boolean,
  }>,
  total: number,            // total absoluto (server reporta cap se >50)
  truncated: boolean,       // true se total > limit
  cached: boolean,
}
```

**Errors:** mesmos do 6.1.

---

### 6.3 `GET /api/audio/spotify/playlists/:id/tracks`

**Request:**
```ts
// Param
{ id: z.string().regex(/^[a-zA-Z0-9]{22}$/) }
// Query
{ limit: z.coerce.number().int().min(1).max(50).optional().default(50) }
```

**Response 200:**
```ts
{
  tracks: Array<SpotifyTrack>,   // mesmo shape do 6.1
  truncated: boolean,            // true se playlist > 50
  total: number,                 // total tracks na playlist
  cached: boolean,
}
```

**Errors:**
- `404 {message:'Playlist nao encontrada ou sem acesso'}` — upstream 404.
- restantes idem 6.1.

---

## 7. Telemetria spec (3 eventos novos)

Adicionar em `shared/activity-event-names.ts::CANONICAL_EVENT_NAMES` (regex
ADR-207 ja casa namespace `audio.`).

```ts
// audio (3 novos — passa de 10 pra 13)
"audio.spotify_search_open",      // RF-04 click botao OR Cmd+K
"audio.spotify_track_add",        // RF-01/RF-02 add track na queue
"audio.spotify_playlist_select",  // RF-02 click playlist drill-in
```

**Payload por evento:**

### 7.1 `audio.spotify_search_open`
```ts
{
  source: 'mini_player_button' | 'keyboard_shortcut',
  tier: 'free' | 'trial' | 'pro' | 'premium' | 'admin',
  spotifyConnected: boolean,
}
```
Triggered no `onClick` do botao (RF-04) ou no handler do `Cmd/Ctrl+K`.
Dispara ANTES do dialog render para capturar mesmo se dialog falhar.

### 7.2 `audio.spotify_track_add`
```ts
{
  trackId: string,                    // spotify:track:xxx
  via: 'search' | 'playlist_drill_in' | 'playlist_all',
  durationSec: number,
  playlistId: string | null,          // null se via='search'
  immediatePlay: boolean,             // true se click row, false se botao +
}
```
Triggered apos `addToQueue` ou `playNow` resolver. Inclui `playlist_all`
para "Tocar tudo" / "Adicionar tudo" (1 evento por track ou agregado? —
**decisao:** 1 evento por track. Volume aceitavel cap 50.).

### 7.3 `audio.spotify_playlist_select`
```ts
{
  playlistId: string,
  trackCount: number,
  truncated: boolean,
}
```
Triggered no drill-in (click row playlist na tab Playlists). Dispara ANTES
do fetch de tracks.

**PII guard:** todos os payloads passam pelo `pii-keys` shared denylist
existente. Nenhum dos 3 contem campos sensiveis (sem email, sem `q`
literal, sem cover URL).

---

## 8. Tier gate matrix

| Acao                              | Free | Trial | Pro | Premium | Admin |
|-----------------------------------|------|-------|-----|---------|-------|
| Ver botao "Buscar Spotify" UI     | ✓ (disabled) | ✓ (disabled) | ✓ | ✓ | ✓ |
| Abrir SpotifySearchDialog         | ✓ (empty-state) | ✓ (empty-state) | ✓ | ✓ | ✓ |
| `GET /api/audio/spotify/search`   | ✗ 403 | ✗ 403 | ✓ | ✓ | ✓ |
| `GET /api/audio/spotify/me/playlists` | ✗ 403 | ✗ 403 | ✓ | ✓ | ✓ |
| `GET /api/audio/spotify/playlists/:id/tracks` | ✗ 403 | ✗ 403 | ✓ | ✓ | ✓ |
| Preview 30s (sem call backend)    | ✓ (mas dialog vazio) | ✓ | ✓ | ✓ | ✓ |
| Play track Spotify (driver MP2)   | ✗ | ✗ | ✓ | ✓ | ✓ |
| Add track Spotify na queue        | ✗ | ✗ | ✓ | ✓ | ✓ |

**Notas:**
- "Pro" inclui? **Decisao paridade SpotifyConnectionPanel:** ja existe
  gate Premium-only para conectar (MP2). Pro NAO conecta hoje. Logo,
  na pratica "Pro" cai em "nao-conectado" — gate `not_connected` antes
  do `tier_blocked`. Matriz acima reflete o ideal teorico se Pro
  conectar (pode no futuro). Confirmar Q em aberto §11.1.
- Trial: hoje `resolveUserTier` trata Trial como Pro+. Q §11.1 confirma
  se Trial ganha acesso aqui (consistencia com tools AI-2A) OR bloqueia
  para incentivar upgrade.
- Empty-state UI: dialog abre sempre que botao eh clicado, mas mostra
  CTA contextual ("Conecte" se nao-conectado, "Upgrade" se tier-block,
  loading skeleton se conectado+Premium).

---

## 9. Edge cases

### 9.1 Token expirado mid-session
- User abre dialog, search funciona. 1h depois reabre, faz nova search.
- Backend detecta `expiresAt < now+60s` → refresh automatico → segue.
- Se refresh retornar `invalid_grant` (user revogou no Spotify externamente):
  marca `disconnectedAt=now()` + 401 client + UI mostra toast "Spotify
  desconectado. Reconecte." + dialog troca pra empty-state de connect.

### 9.2 Spotify API 429 (quota global Spotify)
- Backend nao retenta. Propaga 429 + `Retry-After` header pro client.
- Telemetria `spotify_api_quota_hit` registrada.
- Client mostra banner "Spotify indisponivel agora. Tente em N segundos."
- Search input fica disabled `N` segundos (countdown).

### 9.3 Rate limit local (token bucket > 180/min)
- Backend retorna 429 imediato com `retryAfterMs`.
- Client trata igual 9.2 (mesmo banner; UI nao distingue por que).
- Cache TTL 5min ajuda — segunda query identica nao consome bucket.

### 9.4 Network fail (DNS, timeout client)
- TanStack Query retry default (3x exponential). Apos esgotar: error
  state no dialog "Verifique sua conexao".
- Preview audio (`<audio src=previewUrl>`): se 404, button preview some.

### 9.5 Cover URL malicioso
- Servidor ja sanitiza (so envia `i.scdn.co|mosaic.scdn.co|wrapped-images.spotifycdn.com`).
- Cliente passa por `sanitizeCoverUrl` (HTTP/HTTPS-only). Belt-and-suspenders.
- Hostile case `data:image/svg+xml;base64,...` rejeitado por ambos.
- CSP em `index.html`: adicionar `img-src 'self' i.scdn.co *.scdn.co
  *.spotifycdn.com data:` se ja existir CSP (verificar).

### 9.6 Premium downgrade mid-session
- User era Premium, queue tem 5 tracks Spotify, downgrade pra Free.
- Backend: proxima request `/search` retorna 403 `tier_blocked`.
- Driver MP2: proximo `/me/player/play` upstream retorna 403 → driver
  emite `error` → UI mostra toast "Premium Spotify expirado".
- Queue Spotify tracks NAO sao removidos (preservacao de estado), mas
  skip automatico quando engine tenta tocar → toast por track.
- Banner persistente no MiniPlayerBar "Premium Spotify necessario" ate
  user reconectar/upgrade.

### 9.7 Playlist privada/colaborativa
- `me/playlists` retorna todas que o user tem acesso (incluindo
  colaborativas). Shape inclui `isCollaborative`/`isPublic` pra UI futura.

### 9.8 Track sem preview_url
- Spotify nem todo track tem 30s preview. Botao preview oculto se
  `previewUrl === null`. Add e play continuam disponiveis.

### 9.9 Playlist track sem campo track (deletado/local)
- Spotify retorna `items[].track = null` em casos raros (track removido
  do catalogo, ou local file do user).
- Backend filtra esses items antes de retornar. `total` ainda conta
  todos (paridade com Spotify), mas `tracks.length` pode ser menor que
  `Math.min(limit, total)`.

### 9.10 Concurrent search rapida (race)
- User digita "lofi" → fetch dispara. Digita "lofi b" 100ms depois →
  segundo fetch.
- TanStack Query `keepPreviousData` + key inclui `q` → cada query tem
  cache slot proprio. UI sempre mostra resposta da query atual (Query
  key change descarta resposta velha).
- Debounce 500ms ja minimiza incidencia.

### 9.11 Mobile keyboard cobre dialog
- Dialog Radix tem auto-scroll-to-input. Verificar em DevTools mobile.
- Botao close (X) fixo no topo, fora do flow do keyboard.

---

## 10. NAO-escopo

- **Download offline:** Spotify SDK nao expoe. Premium feature do app
  Spotify nativo, nao replicavel via Web API.
- **Recommendations / "para voce":** `GET /recommendations` endpoint
  existe mas sai do escopo "search + browse". Backlog.
- **Lyrics:** Spotify nao expoe lyrics no Web API publico. Musixmatch
  integration backlog.
- **Podcasts:** scope explicitamente musical. Tracks musicais apenas
  (`type=track`).
- **Liked Songs / coracao toggle:** sem mutation no Spotify aqui.
- **Cross-device transfer (`PUT /me/player`):** driver MP2 ja pinou no
  device "Grindfy". User troca device pelo app Spotify nativo se quiser.
- **Search albums/artists:** RF-01 hardcoded `type=track`. Backlog.
- **Paginacao infinite scroll:** cap 50 absoluto. Backlog.
- **Recent searches / history:** sem persistencia client-side. Backlog.
- **Compartilhar track (link share):** sem.
- **Editar playlist (add/remove tracks via Grindfy):** sem (`scope`
  OAuth nao inclui `playlist-modify-private`).
- **Botao "Conectar" duplicado em RF-04:** evitado. Connect fica so no
  `SpotifyConnectButton` existente.

---

## 11. Riscos + mitigacoes

| Risco | Impacto | Probabilidade | Mitigacao |
|-------|---------|---------------|-----------|
| Spotify API quota burst (1000s users simultaneos) | Search degrada globalmente | Baixa pre-launch | Cache 5min agressivo + token bucket 180/min/user; monitor `spotify_api_quota_hit` telemetria em admin |
| Latencia search >2s (Spotify upstream lento) | UX ruim | Media | Skeleton loading + debounce 500ms ja escondem; timeout fetch 8s + fallback error UI |
| Refresh token corruption (AES-GCM falha) | User quebra Spotify silenciosamente | Baixa | Log `spotify.refresh.decrypt.error` ja existe (MP2); marcar disconnect e forcar reconnect |
| Queue dual-source ordering bug (race add) | Tracks fora de ordem | Media | `useQueueState` MP3 ja serializa via single state owner; teste integration com add concurrent |
| Cover URL host whitelist incompleto | Cover quebrada de playlists antigas/colaborativas | Media | Sanitize aceita 3 hosts (i.scdn.co, mosaic.scdn.co, wrapped-images.spotifycdn.com); placeholder gracioso quando falhar; monitor logs |
| Premium downgrade detectado tardio | User tenta tocar e falha sem feedback bom | Media | Banner persistente + skip auto + toast por track + status check periodico (15min) no MiniPlayerBar |
| Spotify Web Playback SDK falha load (CSP, AdBlock) | Playback impossivel | Baixa | MP2 ja tem fallback factory (lesson #5/#35); telemetria `spotify_connected` ausente → log |
| Cache in-memory perde em restart | Burst de calls na primeira janela pos-deploy | Baixa | Tolerar; cache eh otimizacao. Pos-launch avaliar Redis se necessario |
| Multi-tab user (2 abas Grindfy abertas) | Rate-limit local conta 2x mesmo session | Baixa | Token bucket por userId; aceito ate Redis. Pre-launch impacto baixo |
| User com 0 playlists | Tab Playlists vazia confunde | Baixa | Empty-state explicito + sugestao "Crie playlists no app Spotify" |

---

## 12. Q em aberto (decisao founder)

### Q1: Trial tier — gate ou liberado?
- AI-2A liberou tools para Trial (paridade `resolveUserTier`).
- Spotify Premium gate MP2 ja barra Trial no OAuth (Spotify exige
  Premium do user, separado do tier Grindfy).
- **Pergunta:** Trial **conectado ao Spotify Premium** ganha acesso aos
  endpoints `/search` e `/playlists`? Ou bloqueia para forcar upgrade
  Grindfy?
- **Recomendacao padrao:** liberar (paridade tools AI-2A; Trial eh user
  pagante intencional). Bloquear so deals breaker pos-launch metrics.

### Q2: Cap de 50 — manter ou Pro+ ganha 100/200?
- Cap 50 facilita rate-limit + cache. Pro+ poderia ganhar limite maior
  como "feature premium real" pos-launch.
- **Recomendacao padrao:** cap 50 universal MVP. Iterar pos-launch.

### Q3: Search type — `track` only ou incluir album/artist no MVP?
- Backend ja tem campo `type` mas literal `track` zod. Expandir agora
  custa 2-3h (UI tab adicional ou tabs internos).
- **Recomendacao padrao:** `track` only MVP. Adicionar tabs `album`/
  `artist` em Sprint follow-up. Demanda real menor pos-launch.

### Q4: Cmd/Ctrl+K conflito com browser address bar?
- Cmd+L / Cmd+K browser default no Chrome/Firefox abre address bar.
- `preventDefault` no listener resolve mas pode irritar power users que
  tem reflexo no atalho.
- **Pergunta:** mantemos `Cmd/Ctrl+K` ou usamos algo livre tipo
  `Cmd/Ctrl+/` (Bing/Github) ou `Cmd/Ctrl+J`?
- **Recomendacao padrao:** `Cmd/Ctrl+/` (menos conflito, padrao
  popularizado por Github + Linear). Verificar conflitos atuais no
  `ShortcutsHelpPopover` existente.

### Q5: Telemetria `audio.spotify_track_add` em `playlist_all` — 1 evento
por track ou 1 evento agregado?
- 1 evento por track = volume alto (cap 50 = 50 eventos em 1 click).
- 1 evento agregado = perde detail (qual track gerou erro futuro).
- **Recomendacao padrao:** 1 evento por track. Volume aceitavel
  (~50/click * usuarios baixos pre-launch). Quando atingir scale,
  agregar em `audio.spotify_playlist_bulk_add` separado.

---

## 13. Dependencias

- **Existente (MP2 + MP3):**
  - `server/routes/spotifyAudio.ts` (estender, nao recriar).
  - `server/services/spotifyTokenCrypto.ts`.
  - `server/services/spotifyOauthSessions.ts`.
  - `server/storage/spotifyTokensStorage.ts`.
  - `server/coachAccess.ts::resolveUserTier`.
  - `client/src/lib/audio-engine/SpotifyAudioDriver.ts`.
  - `client/src/lib/audio-engine/AudioSourceEngine.ts`.
  - `client/src/lib/audio-engine/sanitizeCoverUrl.ts`.
  - `client/src/components/audio-player/MiniPlayerBar.tsx`.
  - `client/src/components/audio-player/QueuePopover.tsx`.
  - `client/src/components/audio-player/ShortcutsHelpPopover.tsx`.
  - `client/src/components/audio-player/SpotifyConnectButton` (referenciar
    para empty-state CTA dentro do dialog).
  - `shared/activity-event-names.ts::CANONICAL_EVENT_NAMES`.
  - `shared/pii-keys.ts` (verificar denylist cobre `accessToken`, adicionar
    `q` se necessario).

- **Novo:**
  - `client/src/components/audio-player/SpotifySearchDialog.tsx` (RF-01+02).
  - `client/src/lib/audio-engine/spotifyApiClient.ts` (TanStack Query
    wrappers).
  - Possivel `server/services/spotifyRateLimit.ts` (token bucket helper) se
    util cresce.
  - Possivel `server/services/spotifyCatalogCache.ts` (TTL cache helper).

- **Sem migration de schema.** Tudo em-memory server-side + tabelas MP2 ja
  existem.

---

## 14. Cenarios de teste derivados

### Happy path
- [ ] Premium connect → abre dialog → search "lofi" → 20 tracks → click row
      → driver MP2 toca.
- [ ] Premium → dialog tab Playlists → drill-in → tocar tudo → queue 50
      cheia + first playing.
- [ ] Dual-source queue: 3 library + 3 Spotify, ordem A→S→A→S funciona.

### Validacao input
- [ ] `q` 1 char → 400 zod.
- [ ] `q` 201 chars → 400 zod.
- [ ] `type=album` → 400 zod (so `track` MVP).
- [ ] `limit=51` → 400 zod.
- [ ] `:id` regex fail → 400.

### Regras de negocio
- [ ] Free user → 403 `tier_blocked`.
- [ ] Nao-conectado → 403 `not_connected`.
- [ ] Trial conectado → segue decisao Q1.
- [ ] Token expirado → refresh transparente; segue.
- [ ] `invalid_grant` no refresh → 401 + disconnect persistido.

### Edge cases
- [ ] 429 upstream Spotify → 429 client + telemetria + retry-after.
- [ ] 5xx upstream → 502 client.
- [ ] Network throw → 502.
- [ ] Cache hit no segundo request identico (TTL <5min).
- [ ] Rate-limit local: 181 req em 1 min → 429.
- [ ] Cover host `attacker.com` → null (sanitize).
- [ ] Track sem `preview_url` → preview button oculto.
- [ ] Playlist com `track:null` items → filtrado server-side.
- [ ] Premium downgrade mid-session → banner + skip auto.
- [ ] Concurrent search (debounce stress) → so ultima query persiste.

---

## 15. Notas para system-architect

- **ADR proposto:** numero proximo (verificar `Docs/architecture/decisions/`
  ultima — ultima registrada CLAUDE.md: ADR-207). Sugestao `ADR-208:
  Spotify catalog proxy + tier gate`.
- **Diagramas Mermaid sugeridos:**
  1. Sequence: `User → MiniPlayerBar → SpotifySearchDialog → spotifyApiClient
     → /api/audio/spotify/search → requireSpotifyAccess → tokenBucket →
     cache → Spotify Web API`.
  2. Sequence: refresh auto-flow (`expiresAt < now+60s` branch).
  3. State diagram: SpotifySearchDialog (closed → buscar → playlists →
     drill-in → closed).
  4. Component: nova arvore `MiniPlayerBar > SearchButton > Dialog > Tabs >
     (SearchPanel | PlaylistsPanel > DrillView)`.

- **Lessons-learned aplicaveis (consultar):**
  - #5/#35 (SDK new vs vi.fn — ja aplicado em SpotifyAudioDriver MP2,
    paridade pro client TanStack mock).
  - #9 (log antes do fallback no proxy upstream errors).
  - #29 (sub-arvore com `useQuery` precisa `QueryClientProvider` ou
    `ErrorBoundary` local em testes do dialog).
  - #34 (3o arg `injectedStorage`/`deps` nos handlers novos).
  - #38 (require vs await import no MESMO test file — SpotifySearchDialog
    test deve usar so um modo).
  - #39 (CSP `new Function` — caso adote VirtualScroll lib futura).

- **Definicao "playNow":** spec esta agnostica de como `playNow(track)`
  funciona internamente — ja deve existir em `useAudioPlayer` MP1/MP3.
  Architect deve confirmar API exata e atualizar contratos client se
  divergir.

---

**Fim da spec.**

Apos aprovacao → invocar `system-architect` para ADR-208 + diagramas
Mermaid em `Docs/architecture/diagrams/spotify-deep/`.
