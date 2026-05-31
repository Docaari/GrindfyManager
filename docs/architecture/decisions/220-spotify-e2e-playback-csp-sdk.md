# ADR-220 — Playback Spotify client-side via Web Playback SDK + CSP allowlist Spotify + start-on-device

**Status:** Accepted
**Date:** 2026-05-31
**Sprint:** Spotify E2E (8 RFs — ver `Docs/specs/sprint-spotify-e2e.md` + `Docs/specs/sprint-spotify-e2e-context.md`)
**Relates:** ADR-190 (cripto refresh_token AES-256-GCM / refresh_token nunca chega ao client), ADR-194 (OAuth popup fallback), ADR-207 (convencao telemetria `recordActivity` / allowlist eventos), ADR-208 (Spotify Deep — catalogo search/playlists server-side proxy).
**Supersedes:** nenhum. Endurece o ponto cego deixado em ADR-208 (catalogo funcionava, playback nunca chegou a tocar porque a CSP bloqueava o SDK).

---

## Context

O Mini Player do Grindfy ja conecta a conta Spotify (OAuth PKCE), cifra o `refresh_token`, faz refresh, busca tracks e lista playlists — **tudo server-side e confirmado funcional** numa sessao de debug ao vivo com o founder (USER-0005, Premium). O unico modulo que **nunca tocou audio** e o **playback no browser**.

O playback do Spotify Connect **e arquiteturalmente client-only**: nao existe API REST server-side que "toque a musica no browser do usuario". O fluxo obrigatorio e:

1. O browser carrega o **Web Playback SDK** de `https://sdk.scdn.co/spotify-player.js` (script externo).
2. O SDK instancia `Spotify.Player`, que registra um **device Connect** ("Grindfy") e abre um **WebSocket de estado** contra `wss://dealer.spotify.com`.
3. O SDK injeta um **iframe** (origem Spotify/SCDN) que executa **EME / Widevine** (DRM `encrypted-media`) para decodificar o stream protegido.
4. O controle de playback (play/pause/seek) sai do **browser direto** para `https://api.spotify.com` (`PUT /me/player/*`), nao do nosso servidor.

A CSP atual em `server/routes/index.ts` (Helmet) nao contempla **nenhum** desses hosts:

```
scriptSrc:  ['self','unsafe-inline'(+unsafe-eval dev)]        → bloqueia sdk.scdn.co
connectSrc: [self, stripe, mux, anthropic, x.ai, google ...]  → sem api.spotify.com / dealer
frameSrc:   [self, stripe, mux]                               → sem iframe Spotify (EME)
mediaSrc:   [self, blob, mux]                                 → sem media SCDN
styleSrc/fontSrc: sem Google Fonts                            → erros de console (cosmetico)
```

Consequencia em runtime: o `<script src="sdk.scdn.co/...">` e bloqueado → `window.Spotify` nunca existe → `SpotifyAudioDriver.connect()` nunca cria o player → device "Grindfy" nunca aparece → nada toca. O codigo do driver, do loader e do wiring no `AudioPlayerContext` **ja estao corretos**; faltava a CSP deixar o SDK carregar e conectar.

Forcas em jogo:

- **Seguranca vs. funcionalidade.** Ampliar a CSP e a unica forma de destravar o playback, mas curinga amplo (`https:` global) anula o valor da CSP. Precisamos do conjunto **minimo** de hosts Spotify.
- **EME / autoplay.** O primeiro play deve ocorrer dentro de um **gesto do usuario** (politica de autoplay + EME exige user-activation). Sem isso, o EME recusa silenciosamente.
- **`deviceId` race.** O `PUT /me/player/play?device_id=` so funciona apos o evento `ready` do SDK entregar o `device_id`. Um play antes do `ready` vira no-op silencioso (RF-01.4 / RF-01.7).
- **Sem variable speed.** O SDK nao suporta velocidade variavel; `setSpeed` ja e no-op no driver, mas o controle aparece na UI e confunde.
- **Robustez do `requireSpotifyAccess` (GOTCHA).** Um `tokenCrypto` ausente (erro de programacao) cai no mesmo catch de "decrypt-fail" e **desconecta o token do usuario** — sintomas erraticos ("playlists somem", "nao conectado") observados quando um script de diagnostico rodava com deps incompletos.

## Decision

### D1 — Playback permanece client-side via Web Playback SDK (sem proxy server)

Mantemos a arquitetura client-only. **Nenhum endpoint HTTP novo de playback.** play/pause/seek saem do browser para `api.spotify.com`. O servidor continua sendo proxy **apenas** para catalogo (search/playlists — ADR-208) e OAuth/refresh (ADR-190/194).

### D2 — Ampliar a CSP com allowlist restrita a hosts Spotify (sem `https:` global)

Em `server/routes/index.ts`, estender os directives Helmet **somente** com hosts Spotify/SCDN explicitos + Google Fonts (RF-05). Sem `'unsafe-eval'` em producao (o SDK nao exige eval). WebSocket Spotify so via `wss:` para hosts Spotify. Lista exata em **§"Diretivas CSP finais"** abaixo.

### D3 — Start direto no device Grindfy (sem step de transfer separado)

Ao tocar, o driver faz **`PUT /me/player/play?device_id=<sdk_device_id>`** com `{ uris: [trackId] }`, usando o `device_id` capturado no evento `ready` do SDK. **Nao** ha step de `PUT /me/player` (transfer) separado por padrao. Transfer fica como follow-up condicional (so se houver conflito reportado de playback ativo em outro device — Questao Aberta 1 da spec resolvida como "start direto").

### D4 — SDK lifecycle: gesto do usuario → `ready` → play

- O SDK e carregado **uma vez** (loader idempotente, `sdkLoader.ts` ja garante).
- O driver vive em **ref** (`spotifyDriverRef` / `engineRef`) — nunca recriado por re-render.
- **`activateElement()` no gesto** (RF-01.3): no clique de connect / primeiro play, chamar `player.activateElement()` (quando exposto pelo SDK) dentro do gesto, satisfazendo autoplay/EME user-activation.
- **deviceId-ready queue** (RF-01.4): se `playTrack` chega antes do `ready`, **enfileirar** o play e dispara-lo no handler `ready` (em vez do no-op silencioso atual). `deviceId` ausente no play emite telemetria + estado de erro (nunca silencioso — RF-01.7).
- **Estado dirigido por evento** (RF-01.5): a UI reflete posicao/duracao/play-pause/`ended` a partir de `player_state_changed`, nao da resposta REST.

### D5 — Controle de velocidade oculto quando `activeSource === 'spotify'`

O Mini Player / Expanded **nao renderiza** o controle de speed quando a source ativa e Spotify (Questao Aberta 3 resolvida como "ocultar", nao "desabilitar com tooltip"). `setSpeed` continua no-op no driver.

### D6 — `requireSpotifyAccess`: distinguir TypeError de corrupcao real (RF-07)

No catch do decrypt (`spotifyAccess.ts`), **distinguir** erro de programacao (dep ausente → `TypeError` porque `tokenCrypto.decryptRefreshToken` e `undefined`) de **corrupcao real do ciphertext**:

- `TypeError` / dep ausente → lancar `SpotifyAccessError('config_missing')` (ou erro de config claro) e **NAO** chamar `safeMarkDisconnect`. Nao desconecta o usuario por bug de chamada.
- Decrypt-fail com dados validos (nao-`TypeError`) → comportamento preservado: `safeMarkDisconnect` + `invalid_refresh`.
- Todos os call sites passam deps completos `{storage, fetchFn, tokenCrypto, accessCache}`. Scripts de diagnostico idem.

A divergencia de FK `user_subscriptions.user_id` (`→users.id` vs `→user_platform_id`) **em producao** e **follow-up separado** — nao tocar DB prod neste sprint (documentada em §Consequences/Pendencias).

### D7 — Novos eventos de telemetria no allowlist do ADR-207

Os eventos de playback emitidos pelo driver/context reusam `emitAudioEvent` (canonico ADR-207). Eventos relevantes: `spotify_connected`, `spotify_play`, `spotify_pause`, `spotify_search`, `spotify_playlist_open`, `spotify_api_error`, `spotify_reconnect_failed` (best-effort, nunca throw — lesson #9 log-antes-do-swallow). Convivem com os `audio.spotify_*` dot-namespace de catalogo ja estabelecidos em ADR-208. Sem schema novo; cap metadata 10KB ja vigente.

## Diretivas CSP finais (lista exata para o implementer copiar)

Estender os arrays existentes em `server/routes/index.ts`. **Aditivo** — nao remover nenhum host atual (nao regredir Stripe/Mux/Google/Anthropic/x.ai).

### `scriptSrc` (+1 host)
```
https://sdk.scdn.co
```
> Carrega `spotify-player.js`. **Nao** adicionar `'unsafe-eval'` por causa do Spotify (SDK nao exige). `'unsafe-inline'` ja presente — manter.

### `connectSrc` (+4 hosts)
```
https://api.spotify.com
https://*.spotify.com
wss://dealer.spotify.com
wss://*.spotify.com
https://*.scdn.co
```
> REST `PUT /me/player/*` + WebSocket de estado (`dealer`) + subdominios dinamicos de runtime/CDN. `dealer.spotify.com` ja casa em `wss://*.spotify.com`, mas listado explicito para legibilidade. `https://*.scdn.co` cobre fetch de metadados/segmentos do CDN. **Sem `https:` global.**

### `frameSrc` (+2 hosts)
```
https://sdk.scdn.co
https://*.spotify.com
```
> O SDK injeta um iframe de playback/EME a partir de origem Spotify/SCDN.

### `mediaSrc` (+4 entradas — `blob:` ja presente)
```
https://*.scdn.co
https://*.spotify.com
https://sdk.scdn.co
blob:
```
> Stream/preview do SDK + preview HTML5 30s ja existente (busca). `blob:` ja consta — manter.

### `styleSrc` (+1 host — RF-05)
```
https://fonts.googleapis.com
```

### `fontSrc` (+1 host — RF-05)
```
https://fonts.gstatic.com
```

### `imgSrc` — **sem mudanca**
> Ja cobre `https:` (capas SCDN OK). **Nao regredir** para hosts explicitos.

### `workerSrc` — **avaliar no browser**
> Atual: `['self','blob:']`. O SDK pode usar `blob:` worker (ja coberto). **Nao** adicionar host Spotify a priori; validar no browser (RF-01.2 / Questao Aberta 2) e so apertar/ampliar se o console acusar bloqueio de worker.

### Permissions-Policy / Feature-Policy — **confirmar ausente**
> Helmet **nao** seta `Permissions-Policy` por default (confirmado em `server/routes/index.ts` — sem `permissionsPolicy`). Logo `encrypted-media`/`autoplay` nao estao bloqueados no documento. **Requisito (RF-01.2):** nao introduzir uma `Permissions-Policy` restritiva. Em prod, validar que nenhum proxy/CDN injete `Permissions-Policy` sem `encrypted-media`/`autoplay` (quebraria o EME mesmo com CSP correta). O proprio iframe do SDK deve carregar com `allow="encrypted-media; autoplay"` (o SDK gerencia seu iframe — validar no browser).

## Alternativas consideradas

### A1 — Proxy server-side de playback (rejeitada)
- **Ideia:** o servidor intermediaria o playback (stream/controle) para evitar abrir a CSP.
- **Pros:** CSP do browser ficaria intacta; tokens nunca no browser.
- **Contras (decisivos):** **tecnicamente impossivel** — o Web Playback SDK e **client-only** por design (registra o device Connect no proprio browser, decodifica EME/Widevine localmente via iframe). Nao existe API para o servidor "tocar no browser do usuario". Re-streamar audio protegido violaria DRM e os ToS do Spotify. **Rejeitada.**

### A2 — `https:` global em `scriptSrc`/`connectSrc` (rejeitada por seguranca)
- **Ideia:** `scriptSrc += https:` e `connectSrc += https:` para cobrir qualquer subdominio dinamico do SDK sem enumerar hosts.
- **Pros:** zero risco de "faltou um host"; funciona de primeira.
- **Contras (decisivos):** anula o valor da CSP — qualquer script/endpoint HTTPS passaria a ser permitido, abrindo XSS/exfiltracao via qualquer origem. NFR de seguranca do sprint proibe curinga `https:`. **Rejeitada** em favor de allowlist Spotify (`*.spotify.com` + `*.scdn.co`), amplo o suficiente para os subdominios dinamicos do SDK mas restrito ao dominio Spotify.

### A3 — Step de transfer explicito (`PUT /me/player`) antes do play (rejeitada como default)
- **Ideia:** sempre transferir o playback para o device Grindfy antes de dar play.
- **Pros:** robusto quando ha playback ativo em outro device.
- **Contras:** passo extra, mais latencia e mais um ponto de falha no happy path; o `PUT /me/player/play?device_id=` ja inicia direto no device alvo. **Rejeitada como default**; transfer fica como follow-up condicional (so em conflito reportado).

### A4 — Desabilitar (em vez de ocultar) o controle de speed para Spotify (rejeitada)
- **Ideia:** renderizar o controle desabilitado com tooltip "Spotify nao suporta velocidade variavel".
- **Pros:** descoberta (usuario entende por que esta off).
- **Contras:** ruido visual num controle inutil; UX mais limpa ocultando. **Rejeitada** — ocultar (D5).

## Consequences

**Positivas:**
- Playback Spotify passa a **funcionar de fato** no browser (destrava o gating absoluto do sprint).
- CSP permanece restrita a Spotify/SCDN — sem curinga `https:`; superficie de ataque controlada.
- `requireSpotifyAccess` deixa de desconectar o usuario por erro de programacao (RF-07) — fim dos sintomas erraticos.
- Sem endpoint novo: a superficie de codigo do sprint e pequena (CSP + driver lifecycle + 1 catch + hide-speed UI).
- Eventos de telemetria de playback entram na convencao ADR-207 sem schema novo.

**Negativas / riscos aceitos:**
- `*.spotify.com` / `*.scdn.co` sao curingas de subdominio (amplos por necessidade — o SDK abre subdominios dinamicos de dealer/CDN). Risco aceito; **restrito ao dominio Spotify** (nao `https:` global). Validar no browser que a lista e **suficiente E minima**.
- **EME/Permissions-Policy em prod:** se um proxy/CDN injetar `Permissions-Policy` sem `encrypted-media`, o playback quebra em prod mesmo com CSP correta. **Validar no deploy.**
- Depende de **Spotify Premium** na conta + **app em Development Mode** (testers extras precisam ser allowlisted). Operacional, fora do codigo.
- Dev compliance da telemetria (sem lint rule automatica) — enforcement no reviewer.

**Pendencias / follow-ups documentados (NAO neste sprint):**
- **FK `user_subscriptions.user_id` em producao** (`→users.id` vs `→user_platform_id`): provavelmente divergente em prod, pode fazer o gate Premium falhar la. **Sprint/spec de banco separado.** Em dev local ja corrigida. Nao tocar DB prod aqui.
- **Transfer playback** (`PUT /me/player`) condicional para conflito de device ativo — follow-up.
- **Saida do Development Mode** do app Spotify (quota extension) — operacional.

**Neutras:**
- `workerSrc` mantido `['self','blob:']` ate o browser provar necessidade — decisao adiada para validacao real.
- Eventos `spotify_*` (underscore, driver-internal) convivem com `audio.spotify_*` (dot, catalogo ADR-208) — sem unificacao retroativa.

## Confidence

**Alta** — a causa-raiz (CSP bloqueando `sdk.scdn.co` + runtime Spotify) foi confirmada em debug ao vivo; o codigo do driver/loader/wiring ja existe e esta correto; a lista de diretivas deriva da doc oficial do Web Playback SDK + dos requisitos pesquisados (Premium, `activateElement`, Start Playback REST, iframe EME). Risco residual concentra-se em (a) conjunto exato de subdominios do SDK e (b) Permissions-Policy em prod — ambos validaveis no browser/deploy e mitigados por curinga Spotify + checagem de header.

## Implementation Notes

- CSP e o **gating absoluto** — priorizar e validar no browser real (`mcp__claude-in-chrome` / `/verify`) ANTES de polir UX.
- Testar a CSP via **assert no header `Content-Security-Policy`** gerado pelo Helmet (nao so visual): conferir presenca de `sdk.scdn.co` (script/frame), `api.spotify.com` + `wss://dealer.spotify.com` (connect), media SCDN, fonts.googleapis/gstatic.
- Mockar o Web Playback SDK no teste de driver (lessons #5/#35: `new` vs factory — o driver ja trata via `Reflect.construct` + fallback).
- Preservar lesson #29 (singleton `queryClient`, NAO `useQueryClient`) em qualquer toque nos componentes do Mini Player.
- RF-08: preservar os fixes uncommitted da sessao de debug (oauth-callback sem `requireAuth`, SCOPES playlist-read-*, poll resiliente a COOP em `silentMode`, `resolveViaStatusFallback` reusado). Cada um vira assert de nao-regressao.
