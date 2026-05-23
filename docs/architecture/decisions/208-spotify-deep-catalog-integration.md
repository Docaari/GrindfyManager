# ADR-208 — Spotify Deep: Catalog Proxy + Tier Gate + Dual-Source Queue

**Status:** Accepted
**Date:** 2026-05-23
**Sprint:** SPOTIFY-DEEP (RF-01..RF-05)
**Relates:**
- ADR-187 (AudioSourceEngine abstraction + driver pattern — `SpotifyAudioDriver` ja existe, Sprint MP1).
- ADR-188 (Mini Player displayMode FSM + z-index hierarchy — dialog z-[100] Radix, MiniPlayerBar z-40).
- ADR-189 (Audio queue strategy homogenea — generalizada aqui para dual-source com discriminated union).
- ADR-190 (Spotify token storage — AES-256-GCM `refresh_token` at rest; consumidor proxy).
- ADR-191 (Telemetria audio reuse `user_activity`).
- ADR-194 (OAuth popup fallback).
- ADR-207 (Convencao `recordActivity` events — `audio.*` namespace).

---

## Context

OAuth Spotify + `SpotifyAudioDriver` ja shipados (MP2 `0fb31bb8`) mas zero UI permite descobrir/playar catalogo Spotify. User conecta, abre MiniPlayerBar, e nao tem onde digitar nome de track. Driver fica esperando `trackId` que nunca chega.

A Sprint SPOTIFY-DEEP wira 5 superficies:

1. **RF-01** `SpotifySearchDialog` (busca tracks por query).
2. **RF-02** Tab "Minhas Playlists" no mesmo dialog (lista + drill-in + tocar tudo).
3. **RF-03** 3 endpoints backend proxy (`/search`, `/me/playlists`, `/playlists/:id/tracks`).
4. **RF-04** Botao "Buscar Spotify" no MiniPlayerBar + shortcut `Cmd/Ctrl+/`.
5. **RF-05** `QueuePopover` dual-source (library + spotify badge distintivo).

Pre-launch — sem catalogo a feature Spotify Premium-only nao tem valor demonstravel.

**Forcas em jogo:**

- **Tier matrix complexa** — Premium Grindfy (app) vs Premium Spotify (Spotify-side) — 2 tiers ortogonais.
- **Rate limit Spotify** — Web API caps em ~180req/min/user; sem proteger, burst quebra todo mundo.
- **Token refresh transparente** — `expiresAt < now+60s` precisa refresh sem expor ao client.
- **Cover URL XSS surface** — Spotify devolve URL de CDN; sem whitelist, hostile URL passa.
- **PII em logs** — `accessToken` jamais pode ser loggado; query `q` pode conter texto sensivel (busca por nome de pessoa, etc).
- **Queue heterogenea** — `useQueueState` MP3 hoje assume `source='library'`; mistura quebra `playNow` driver-switch se shape divergir.

---

## Decision

8 decisoes de arquitetura ortogonais. Cada uma tem alternativa rejeitada explicita.

### 1. Novo arquivo `audioSpotifyCatalog.ts` (NAO estender `spotifyAudio.ts`)

`server/routes/audioSpotifyCatalog.ts` — handlers exportados (lesson #34 — 3o arg `deps?` para storage injection).

`server/routes/spotifyAudio.ts` continua dono de OAuth/refresh/status/disconnect. Separation of concerns: OAuth = ciclo de vida da conexao; catalog = proxy de dados.

Helper compartilhado novo: `server/services/spotifyAccess.ts::requireSpotifyAccess(userId, deps?)` — retorna `{accessToken} | {error}`. Centraliza:

- Lookup `spotify_tokens` row.
- Tier gate (`resolveUserTier` + check `disconnectedAt`).
- Auto-refresh (`expiresAt < now+60s`).
- Marca `disconnectedAt` em `invalid_grant`.

Consumido pelos 3 handlers novos + tambem rebatido em `spotifyAudio.ts:handleGetSpotifyStatus` se util.

### 2. Token bucket rate-limit in-memory (180/min/user)

`server/services/spotifyRateLimit.ts` — `Map<userId, {tokens: number, lastRefillMs: number}>`.

- Capacity: 180 tokens.
- Refill: linear `180 tokens / 60s = 3 tokens/s` (recomputado on-demand no `consume()` usando `Date.now() - lastRefillMs`).
- `consume(userId, n=1)` retorna `{ok: true} | {ok: false, retryAfterMs}`.
- Cache hit NAO consome (otimizacao decisao #3).
- Reset por restart (in-memory aceito pre-launch; Redis defer).

Por que linear refill nao bucket discreto: smoother UX, evita burst sincronizado.

### 3. Cache 5min in-memory keyed `(userId, endpoint, queryHash)`

`server/services/spotifyCatalogCache.ts` — `Map<string, {data: unknown, expiresAt: number}>`.

- Key: `${userId}|${endpoint}|${stableHash({q,type,limit}|{limit}|{playlistId,limit})}`.
- TTL 5min hardcoded.
- Hit: pula proxy + pula `consume()` rate-limit.
- Miss: proxy + `consume()` + `set()`.
- Sweep: lazy on `get()` (descarta `expiresAt < now`). Sem cron — pre-launch escala baixa.
- Invalidacao explicita: 1 caso — quando user disconnect Spotify, invalidar pattern `${userId}|*` (helper `invalidateUser(userId)`).

Sem cache distribuido (Redis) — pre-launch nao justifica overhead. Documentado follow-up se hit-rate cair com multi-instance deploy.

### 4. Preview 30s via `<audio>` HTML5 inline (NAO Web Playback SDK)

Preview de `track.preview_url` (MP3 stream Spotify CDN, 30s) usa elemento `<audio>` nativo dentro do `SpotifySearchDialog`. **Singleton por dialog** (1 elem ref, troca `src` ao clicar outro preview).

Por que NAO Web Playback SDK pra preview:

- SDK reserva device exclusivo `Grindfy` — preview e playback principal disputariam.
- Race condition: tocar preview pausa main player; soluciona com auto-pause de main quando preview toca (event listener `play` no `<audio>`).
- Preview `preview_url` e MP3 publico, sem necessidade de OAuth no fetch (CORS permitido pela Spotify CDN).

Lesson #39 (CSP `new Function`): preview audio NAO usa `new Function` — eh `<audio>` declarativo, ok.

Auto-pause behavior: quando `<audio preview>` dispara evento `play`, code chama `engine.pause()` no main. Reverso (main retoma quando preview termina) NAO implementado MVP — too noisy. User retoma manual.

### 5. Discriminated union `AudioTrack` para queue dual-source

`shared/audio-queue.ts` (existente MP3):

```ts
type AudioTrack =
  | { source: 'library'; lessonId: string; title: string; coverUrl: string | null; durationSec: number; ... }
  | { source: 'spotify'; trackId: string; title: string; artists: string[]; coverUrl: string | null; durationSec: number; previewUrl: string | null; album: string };
```

Driver switch automatico em `AudioSourceEngine.playTrack(track)`:

- `track.source === 'library'` → `LibraryAudioDriver`.
- `track.source === 'spotify'` → `SpotifyAudioDriver`.

Engine ja eh facade thin (ADR-187). Driver swap acontece em `_resolveDriver(track)` interno — currentDriver destruido (`.destroy()`) e novo instanciado se shift.

Por que discriminated union vs polymorphic object:

- TS narrowing compile-time previne acesso a `lessonId` em track Spotify (e vice-versa).
- JSON serializa direto (cross-tab via BroadcastChannel MP3).
- Migration path: MP1 `AudioTrack` era so `library` — extensao backward-compat (adicionar `source: 'spotify'` variant).

### 6. Cover URL whitelist host (3 hosts Spotify CDN)

`client/src/lib/audio-engine/sanitizeCoverUrl.ts` (existente MP1.1) **estendida** ou novo `sanitizeSpotifyCoverUrl.ts` paralelo:

```ts
const SPOTIFY_COVER_HOSTS = new Set([
  'i.scdn.co',
  'mosaic.scdn.co',
  'wrapped-images.spotifycdn.com',
]);
```

`sanitize(url)`:
1. Parse `new URL(url)` em try/catch.
2. Schema deve ser `https:`.
3. Hostname deve estar no Set OU host original do library (existente).
4. Reject → return `null`.

Belt-and-suspenders: servidor ja sanitiza (so envia URLs desses hosts no response). Cliente repete (defesa em profundidade).

**CSP `index.html`:** adicionar `img-src 'self' https://i.scdn.co https://*.scdn.co https://*.spotifycdn.com data:` se ja existir CSP — verificar pre-implementer.

### 7. 3 events telemetria novos em `audio.*` namespace

ADR-207 ja autoriza `audio.*` namespace. Adicionar em `shared/activity-event-names.ts::CANONICAL_EVENT_NAMES`:

- `audio.spotify_search_open` — RF-04 click botao OR Cmd+/ shortcut. Payload `{source: 'mini_player_button'|'keyboard_shortcut', tier, spotifyConnected}`.
- `audio.spotify_track_add` — RF-01/RF-02 add. Payload `{trackId, via: 'search'|'playlist_drill_in'|'playlist_all', durationSec, playlistId, immediatePlay}`. **1 evento por track** mesmo em "Adicionar tudo" (Q5 default). Volume aceitavel (cap 50 * baixa concorrencia pre-launch).
- `audio.spotify_playlist_select` — RF-02 drill-in. Payload `{playlistId, trackCount, truncated}`.

Trigger timing:
- `search_open`: **antes** do dialog render (capturar mesmo se dialog falha).
- `track_add`: **apos** `addToQueue`/`playNow` resolver.
- `playlist_select`: **antes** do fetch de tracks.

PII guard: nenhum dos 3 payloads tem campo proibido (sem email/q literal/cover URL). Conformante com ADR-207 denylist.

### 8. Tier gate dual (server + client)

**Server-side autoritativo** — `requireSpotifyAccess` retorna 403 em qualquer um dos 3 endpoints:

- `{message:'Spotify nao conectado'}` (sem row OR `disconnectedAt != null`).
- `{message:'Premium Grindfy necessario'}` (`resolveUserTier ∉ {pro,premium,admin}` — Q1 default LIBERA Trial via `resolveUserTier` que ja trata Trial como Pro+).
- `{message:'Premium Spotify expirou. Reconecte.'}` (`row.product !== 'premium'`).

**Client-side cosmetico** — botao `MiniPlayerBar > "Buscar Spotify"`:

- Premium-conectado: enabled, tooltip "Buscar no Spotify (Cmd+/)".
- Caso contrario: `disabled`, tooltip "Conecte sua conta Spotify Premium".

Dialog **sempre abre** quando botao clica (mesmo disabled? Nao — disabled bloqueia onClick). Re-entry via Cmd+/ tambem bloqueada quando nao-premium (handler checa estado antes de abrir).

Empty-state dentro do dialog quando server retorna 403: reaproveita `SpotifyConnectButton` existente como CTA.

Tier matrix conforme spec §8.

---

## Consequences

### Positivas

- **Spotify Premium passa a ter valor demonstravel** — user conecta e em <3 clicks acha + toca uma track.
- **Zero migration schema** — tudo in-memory server-side + tabelas MP2 ja existem.
- **Reuso maximo** — `SpotifyAudioDriver` MP2, `AudioSourceEngine` MP1, `useQueueState` MP3, `sanitizeCoverUrl` MP1.1.
- **Tier gate centralizado** — helper `requireSpotifyAccess` evita drift entre 3 handlers (lesson #3 — mocks idealizados).
- **Cache + bucket protegem upstream** — second query identica em <5min skipa rate-limit consumption.
- **Discriminated union queue** preserva narrowing TS — adicionar 3o source futuro (Apple Music?) eh extension natural.
- **Telemetria ADR-207 compliant** — sem PII, sem custom namespace, dedup natural pela frequencia baixa.

### Negativas

- **Cache in-memory perde em restart** — burst de calls primeira janela pos-deploy. Tolerar pre-launch.
- **Token bucket per-instance** — multi-tab user (2 abas) consome 2x mesmo session-user. Aceito.
- **Cap 50 universal** — power-users com playlists grandes (>50 tracks) precisam scroll dentro do app Spotify nativo pra access full. Truncation toast comunica explicitamente.
- **Preview sem ducking** — preview MP3 e main player tocam paralelo se main estiver tocando (preview auto-pausa main mas reverso nao implementado MVP).
- **Sem persistencia historico de search** — recent searches NAO armazenadas; user re-digita a cada open.
- **Helper `requireSpotifyAccess` cresce em complexidade** — 4 branchs de erro + auto-refresh + tier check. Mitigar com testes unit dedicados (lesson #34 — handler test injection).

### Neutras

- **Telemetria volume `audio.spotify_track_add`** — pode subir 50/click em "Tocar tudo". ADR-207 nao restringe; documenta como tolerado ate scale obrigar agregacao (`audio.spotify_playlist_bulk_add` separado, sprint follow-up).
- **CSP `img-src` cresce com 3 hosts Spotify** — incremento minor, sem performance penalty.
- **3 novos arquivos `server/services/`** (`spotifyAccess.ts`, `spotifyRateLimit.ts`, `spotifyCatalogCache.ts`) — densidade aceitavel, alternativa era inline tudo em handler (ruim para teste).

---

## Alternatives Considered

### A1: Estender `server/routes/spotifyAudio.ts` (NAO criar novo arquivo)

**Pros:**
- Menos arquivos novos.
- Tudo Spotify em um lugar.

**Cons:**
- File ja tem 200+ linhas OAuth (decryptRefreshToken, oauth callback, state validation). Adicionar 3 handlers catalog + helpers vira 600+ linhas.
- Separation of concerns viola: OAuth lifecycle vs catalog proxy sao dominios diferentes.
- Testes ficam acoplados: mock de OAuth state polui mock de catalog.

**Rejected.** Custo manutencao supera economia de arquivo.

### A2: SDK Web API client-side direto (sem proxy backend)

**Pros:**
- Zero overhead servidor.
- Spotify ja tem cliente JS oficial.

**Cons:**
- Expoe `access_token` no browser — XSS extrai facilmente.
- CORS Spotify Web API exige token Bearer header — token vaza em devtools network panel.
- Refresh token (long-lived) nunca pode tocar client.
- Rate limit per-user some — cliente burst de 1 user trava conta Spotify inteira.

**Rejected.** Security catastrophe. ADR-190 (token storage) explicitamente proibe.

### A3: Redis para cache + rate limit

**Pros:**
- Multi-instance deploy correto.
- Cache sobrevive restart.
- Rate limit global per-user (multi-tab fix).

**Cons:**
- Operational overhead (Redis Cluster, eviction policy, monitoring).
- Pre-launch zero usuarios — premature optimization.
- Setup deploy Render+Neon nao tem Redis incluso — viraria 3o vendor.

**Rejected MVP.** Reabrir pos-launch se metricas pedirem (cache hit-rate < 60% OR rate-limit false-positive > 5%).

### A4: Per-IP rate limit (vez de per-user)

**Pros:**
- Cobre user nao-autenticado (irrelevant — endpoint requireAuth).
- Mais simples (IP eh transparente).

**Cons:**
- Errado: Spotify limit eh per Spotify user account (token). 2 users Grindfy atras de mesmo IP corporativo consomem buckets separados.
- NAT residencial colide users compartilhando IP.

**Rejected.** Spotify-side limit eh per-token, replicar local com mesma chave.

### A5: Web Playback SDK pra preview tambem (NAO `<audio>` HTML5)

**Pros:**
- Consistencia: 1 SDK pra tudo Spotify.
- Preview com mesma UX que playback (volume, seek).

**Cons:**
- SDK pin 1 device exclusivo (Grindfy). Preview competiria com main player pelo device.
- Workaround: 2nd SDK instance? Spotify nao suporta — uma conta = um dispositivo ativo.
- Preview deve ser ephemeral (30s, descartavel); SDK eh heavyweight.

**Rejected.** `<audio>` HTML5 + `preview_url` MP3 publico eh apropriado para o caso.

### A6: Cache global (cross-user) para search results

**Pros:**
- Search "lofi" feito por 100 users → 1 cache slot servindo todos.
- Hit-rate altissimo em pre-launch.

**Cons:**
- Spotify `market=from_token` retorna resultados regionalizados — usuarios paises diferentes veem catalogos diferentes.
- Spotify TOS exige attribution per-user analytics — cross-user cache obscure quem buscou o que.
- Spotify reserva direito de personalizacao por user (algoritmico).

**Rejected.** Per-user mantem fidelity + compliance.

### A7: Inline rate-limit + cache em `requireSpotifyAccess` (sem services dedicados)

**Pros:**
- Menos arquivos novos.

**Cons:**
- `requireSpotifyAccess` vira god-function (token + tier + bucket + cache + refresh em 1).
- Mocks ficam dificeis em testes (cada handler precisa mock do mundo).
- Reuso impossivel se 4o endpoint catalog aparecer no futuro.

**Rejected.** Modulos dedicados melhoram testabilidade (lesson #34 pattern).

---

## Implementation Notes

### Order of execution dentro de cada handler

```
1. Zod parse(req.query/params) → 400 se fail.
2. const userId = req.user.id (requireAuth ja resolveu).
3. const accessRes = await requireSpotifyAccess(userId, deps?)
   → 403/401 + return se error.
4. const cacheKey = buildKey(userId, endpoint, params)
5. const hit = spotifyCatalogCache.get(cacheKey)
   → if hit: return res.json({...hit.data, cached: true}).
6. const bucket = spotifyRateLimit.consume(userId, 1)
   → if !bucket.ok: return 429 {retryAfterMs}.
7. try {
     const upstream = await fetch(spotifyApiUrl, {Bearer accessRes.accessToken})
     handle upstream status (401/429/5xx — ver Errors).
     const normalized = normalize(upstream.json())
     spotifyCatalogCache.set(cacheKey, normalized)
     return res.json({...normalized, cached: false})
   } catch (err) {
     console.error('[spotifyCatalog] upstream fail', {endpoint, err}); // lesson #9
     return res.status(502).json({message: 'Spotify indisponivel'})
   }
```

### Refresh logic dentro de `requireSpotifyAccess`

```
const row = await deps.spotifyTokensStorage.get(userId)
if (!row || row.disconnectedAt) return {error: 'not_connected'}

const tier = await resolveUserTier(userId)
if (!['pro','premium','admin'].includes(tier)) return {error: 'tier_blocked'}

if (row.product !== 'premium') return {error: 'not_premium'}

const expiresAtMs = row.expiresAt.getTime()
if (expiresAtMs < Date.now() + 60_000) {
  try {
    const refreshed = await refreshSpotifyAccessToken(userId, deps)
    return {accessToken: refreshed.accessToken}
  } catch (err) {
    // invalid_grant → ja marcou disconnectedAt no refresh helper
    return {error: 'refresh_failed'}
  }
}

return {accessToken: decryptAccessToken(row.accessToken)}
```

### Helpers chamados (existentes ou a criar):

- `decryptAccessToken` — existente em `spotifyTokenCrypto.ts` (note: access_token NAO eh criptografado at-rest na MP2 — só `refresh_token`. Confirmar antes de implementar; se nao, ler `row.accessToken` direto).
- `refreshSpotifyAccessToken(userId, deps)` — **extrair** de `handlePostSpotifyRefresh` em `spotifyAudio.ts`. Retorna `{accessToken, expiresAt}`; marca `disconnectedAt` em `invalid_grant` internamente.
- `resolveUserTier` — existente em `server/coachAccess.ts`. Trial → Pro per AI-1A baseline.

### Trial decision (Q1 default LIBERA)

`resolveUserTier` ja trata Trial como `pro` (paridade AI-2A tools). Mantemos consistencia — usuario pagante intencional ganha acesso. Bloquear so se metricas pos-launch indicarem que Trial-Premium-conectado tem conversao Free pior que tier_blocked.

### Cap 50 (Q2 default UNIVERSAL)

Hardcoded `limit: 50` no Zod schema + UI sem next-page. Truncation toast/banner em RF-02 quando playlist > 50. Iterar Pro-only cap 200 se pos-launch metricas mostrarem demand.

### Search type `track` only (Q3 default)

`type: z.literal('track')` no Zod. Album/Artist defer pra sprint follow-up (UI exige tabs internos dentro do tab Buscar — 2-3h extra).

### Shortcut `Cmd/Ctrl+/` (Q4 default)

Menos conflito que `Cmd+K` (browser address bar). Padronizado por Github/Linear. Adicionar entry em `ShortcutsHelpPopover` existente. `preventDefault` no listener.

### `audio.spotify_track_add` 1-evento-por-track (Q5 default)

Mesmo em "Tocar tudo"/"Adicionar tudo" (cap 50). Volume aceitavel pre-launch. Documentar follow-up — se atingir scale, agregar em `audio.spotify_playlist_bulk_add`.

---

## Testing strategy (high-level)

- **Server unit** — `requireSpotifyAccess` 4 branchs de erro + happy path + refresh trigger (mock `Date.now` + storage row factory).
- **Server unit** — `spotifyRateLimit.consume` token bucket math (fake timers, 181 req em 60s burst → 1 falha).
- **Server unit** — `spotifyCatalogCache` TTL expiry + hit/miss + `invalidateUser`.
- **Server integration** — 3 handlers happy path + 401 upstream → refresh → ok + 429 upstream → 429 client + tier_blocked → 403.
- **Client RTL** — `SpotifySearchDialog` debounce 500ms (fake timers), min 2 chars, empty state, error state, preview toggle pause anterior.
- **Client RTL** — `QueuePopover` row Spotify badge + row library no-badge + drag-reorder mixed.
- **Lessons aplicaveis:**
  - #5/#35 — SDK new vs `vi.fn()`: aplicado em testes de fetch (`global.fetch` mock retorna `Response`-like).
  - #9 — log antes do fallback no upstream catch.
  - #29 — `SpotifySearchDialog` test wrap em `QueryClientProvider` mock (ja patern conhecido).
  - #34 — handlers exportados com 3o arg `deps?`.
  - #38 — test file usa um modo (`await import` OR `require`) consistente.
  - #39 — `<audio>` HTML5 preview NAO usa `new Function` — CSP-safe.

---

## References

- Spec: `Docs/specs/sprint-spotify-deep.md`.
- Diagramas: `Docs/architecture/diagrams/spotify-deep/`.
  - `search-sequence.mermaid` — End-to-end search flow.
  - `playlist-browser-flow.mermaid` — Tab playlists + drill-in.
  - `queue-dual-source-state.mermaid` — Driver switch quando track troca source.
  - `token-refresh-bucket.mermaid` — Refresh + rate-limit bucket inline.
- ADRs relacionados: 187/188/189/190/191/194/207.
- Spotify Web API: <https://developer.spotify.com/documentation/web-api>
- Spotify rate limits: <https://developer.spotify.com/documentation/web-api/concepts/rate-limits>

---

**Fim ADR-208.**
