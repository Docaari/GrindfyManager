# Spotify Polish — Manifesto de Bugs (bug-hunt adversarial 2026-05-31)

> Consolidação de 4 caçadores adversariais (playback/driver, fila/autoplay/now-playing,
> catálogo, conexão/auth). Founder: "procure por todos os bugs, tudo deve funcionar
> perfeitamente." Entrada para architect → test-writer → implementer → reviewer.
> Complementa `sprint-spotify-polish.md` (RF-01..10).
>
> **Decisões de design (architect):** os 8 bugs não-triviais (B-ENDED-1, B-QUEUE-1,
> B-RESUME-1, B-AUTOPLAY-1, B-TOKEN-CLOSURE/B-VOLUME-1, B-COVER-1, B-BOOT-1/
> B-DISCONNECT-SYNC/B-PANEL-401, B-ARTIST-1) têm contrato/FSM/invariante definidos em
> **ADR-221** (`Docs/architecture/decisions/221-spotify-polish-design-decisions.md`) +
> 4 diagramas em `Docs/architecture/diagrams/spotify-polish/`. O test-writer deriva os
> asserts do ADR; os demais bugs (mecânicos) saem direto deste manifesto.
>
> **Gap encontrado pelo architect (B-RESUME-1):** o fix do `resume()` **adiciona método
> à interface `IAudioSourceDriver`** (`types.ts`) — não é só uma troca de chamada. Tanto
> o `SpotifyAudioDriver` quanto o `LibraryAudioDriver` (e o stub da Engine) precisam
> implementar `resume()` (library = alias de `play()` no `<audio>`, que já retoma da
> posição). Ver ADR-221 §D3 — afeta a fronteira de não-regressão (RF-07: o `resume`
> pré-ready também enfileira via `pendingPlay`, igual ao `play`).

## P0 — Quebram o core / founder sente direto

- **B-AUTOPLAY-1 [CRIT]** `AudioPlayerContext.playTrack` (~612-663) só seta `courseContext` quando vem `ctxArg`; tracks Spotify (onPlay/onPlayAll/autoplay) não passam → `courseContext` da biblioteca PERSISTE. `tryAutoplayNext` (~923) avalia `if(ctxArg)` ANTES da fila → toca próxima AULA (ou para), nunca a próxima música. **Fix:** `setCourseContext(ctxArg ?? null)` SEMPRE + `courseContextRef.current = ctxArg ?? null` síncrono no playTrack.
- **B-ENDED-1 [CRIT, RF-09]** `SpotifyAudioDriver.onStateChanged` (~295-315) detecta fim via `paused && position>=duration`, mas o SDK reseta `position`→0 no fim (e usa `track_window.previous_tracks`) → 'ended' NUNCA dispara → autoplay não avança. **Fix:** detecção combinada (paused+position===0 vindo de playing perto do fim, OU previous_tracks contém o track, OU posição estagnada) + dedupe (emite 'ended' 1x por track via flag resetada no load/play).
- **B-QUEUE-1 [CRIT, RF-08]** `SpotifySearchDialog.onPlayAll` (~449) faz playTrack(first)+addToQueue(resto) SEM `clearQueue()` (que JÁ existe/exposto) → resíduo de plays anteriores (localStorage `audio.queue.v1`) fica. **Fix:** "Tocar tudo" e play avulso da busca SUBSTITUEM a fila (clearQueue antes); "Adicionar tudo"/botão "+" ANEXAM.
- **B-RESUME-1 [CRIT/HIGH]** pause→play REINICIA o track do 0. `useEffect[isPlaying]` (~1001) chama `drv.play()` que faz `PUT /play {uris}` (sempre começa do 0). **Fix:** `resume()` (SDK `player.resume()` ou PUT /play sem body) no toggle; `uris` só no load inicial. Idem pause via `player.pause()`.
- **B-COVER-1 [CRIT]** whitelist de hosts de capa só tem `i.scdn.co`/`mosaic.scdn.co`/`wrapped-images.spotifycdn.com` (server `spotifyAudio.ts:663` + client `sanitizeCoverUrl.ts`). Capas custom de playlist/álbum usam `image-cdn-ak.spotifycdn.com`/`image-cdn-fa.spotifycdn.com` → null → placeholder cinza. **Fix:** allowlist por sufixo regex `.scdn.co`/`.spotifycdn.com` (SSoT em `shared/`, paridade server+client).
- **B-PLCOUNT-1 [HIGH, RF-01]** `/me/playlists` devolve `tracks.total` undefined → server `?? 0` → card "0 tracks". **Fix:** pedir `fields=...tracks.total...` no handler; se ainda undefined, omitir a linha (não cravar "0"). Count real do drill-in via `drillQ.data.total` (já vem).
- **B-PLERR-1 [HIGH]** `PlaylistsPanel` (SpotifySearchDialog ~408-663) NÃO trata erro (401/403/429/genérico) → `data` undefined → "Você não tem playlists" MENTIROSO + sem retry. **Fix:** ler `listQ.error`/`drillQ.error` → 401 ReconnectCTA, 429 RateLimitBanner, 403 UpgradeCTA, outro erro genérico + "Tentar de novo" (refetch).
- **B-ARTIST-1 [HIGH, RF-03]** `AudioTrack` (types.ts) sem campo artista; onPlay/onAdd descartam `track.artists` (que o server JÁ manda). MiniPlayerBar/Expanded/QueuePopover não mostram artista (linha secundária = courseTitle = null). **Fix:** add `artist?`/`subtitle?` ao AudioTrack/AudioTrackLike; popular `artists.join(", ")`; renderizar.

## P1 — HIGH

- **B-SKIP-1 [HIGH]** `ExpandedPlayerDialog:446` passa `idx` (number) pra `skipToQueueItem(id:string)` → findIndex(-1) → no-op. **Fix:** passar `item.id`.
- **B-SKIP-2 [HIGH]** `skipToQueueItem` (useQueueState:236) só FATIA a fila, não chama `playTrack` → clicar "Tocar" na fila não toca. **Fix:** wrapper no context: encontra item → playTrack(item.track) → remove anteriores+ele.
- **B-TOKEN-CLOSURE [HIGH]** `connectSpotify` factory (~1164) fecha sobre `accessToken` connect-time; após refresh, novo driver (troca source library→spotify) é criado com token STALE → 401 churn. **Fix:** factory lê `spotifyTokenRef.current` na construção.
- **B-VOLUME-1 [HIGH/MED]** Spotify sempre começa em 100% — volume `useEffect` roda antes do driver existir (deps sem driver-ready) e SDK ctor `volume:1.0`. **Fix:** aplicar `volume` atual ao driver logo após construir (na IIFE do playTrack).
- **B-EPISODE-1 [HIGH]** Episódios em playlist: `fields item(...album...)` não cobre episode (sem capa/preview); `spotify:episode:` no PUT play pode falhar; onPlay engole em catch → clica e nada. **Fix:** projetar `type`; tratar/filtrar episode com feedback.
- **B-PAGINATE-1 [HIGH]** Playlists >50 e tracks >50 truncam silenciosamente (sem offset/paginação); lista de playlists nem mostra banner truncated. "Tocar tudo" em playlist de 200 toca 50. **Fix:** paginar (offset loop até total) ou "carregar mais" + banner.
- **B-BOOT-1 [CRIT/HIGH auth]** Bootstrap: `/status` connected (DB) mas `/refresh` falha (token revogado) → connectSpotify não roda, mas query `["spotify-status"]` cacheou true (60s) → UI "conectado", driver null → tocar = no-op silencioso. **Fix:** quando `resolveViaStatusFallback` retorna null mas status dizia connected, invalidar `["spotify-status"]` (refetch → false).
- **B-PANEL-401 [HIGH auth]** `SpotifyConnectionPanel` usa `apiRequest("GET", status)` sem silentMode → 401 dispara logout global (`window.location='/login'`). Hook usa fetch resiliente. **Fix:** painel consome `useSpotifyStatus()` (mesmo fetcher) ou silentMode.
- **B-DISCONNECT-SYNC [HIGH auth]** `disconnectSpotify()` (auth.ts:344) não invalida status nem orquestra cleanup — depende do caller (só o painel faz). **Fix:** mover invalidateStatus pra dentro de `disconnectSpotify()`.
- **B-POPUP-HANG [HIGH auth]** Poll do popup só checa `.closed`; sob COOP `.closed` pode mentir + postMessage não chega → Promise nunca resolve → spinner "Conectando..." infinito. **Fix:** pollStatus periódico mesmo com popup aberto (respeitando lock `checking`) + timeout absoluto (~120s) que resolve via status ou rejeita claro.

## P2 — MEDIUM

- **B-REPEAT-ONE [MED]** repeat-one usa `audioRef.current` (null no Spotify) → no-op fantasma. **Fix:** branch por source (spotify: seek(0)+play).
- **B-DEDUP-Q [MED]** `addToQueue` sem dedup por trackId → mesma música N vezes. **Fix:** dedup opcional.
- **B-EXTPAUSE [MED]** `isPlaying` não sincroniza com `state.paused` do SDK (pausar no app Spotify não reflete na UI). **Fix:** driver emite playstatechange; context setIsPlaying(!paused).
- **B-PREVIEW-IDX [MED]** preview rastreado por index → trocar busca toca preview da faixa errada. **Fix:** rastrear por trackId; reset ao mudar query.
- **B-SEARCH-ERR [MED]** Busca só trata 401/429; 403/5xx vira "Nenhum resultado" enganoso. **Fix:** branch 403/erro genérico + retry.
- **B-404-RETRY [MED]** PUT play 404 "Device not found" (race pós-ready) sem retry → erro na 1ª tocada. **Fix:** retry 1x após delay (ou transfer playback).
- **B-401-RESUME [MED]** 401 mid-play → tryReconnect (player.connect) mas não re-toca → música morre. **Fix:** após reconnect, re-tocar currentTrack; 401 deve disparar refresh de token, não só reconnect SDK.
- **B-DESTROY-DEVICE [MED]** `destroy()` não nula `deviceId` → PUT stale pra device morto. **Fix:** `this.deviceId = null` no destroy + guards `if(destroyed)` em play/pause/seek.
- **B-REFRESH-CLAMP [MED]** scheduleRefresh sem clamp mínimo (expiresIn<300 → fire imediato/loop). **Fix:** `max(30, expiresIn-300)`.
- **B-DISCONNECT-3X [MED auth]** 3 falhas transitórias (5xx Spotify) → disconnect permanente; `/refresh` e `requireSpotifyAccess` têm políticas de increment divergentes. **Fix:** 5xx upstream = transitório (não conta); unificar política.

## P3 — LOW / cosmético (RF-02/04/05/06 + audit)

- **B-A11Y-DIALOG** `SpotifySearchDialog`/`ExpandedPlayerDialog` montam `DialogPrimitive.Content` sem Description → warning Radix. **Fix:** `<Dialog.Description>` sr-only (RF-05).
- **B-LOG-GATE** Logs de diagnóstico no `SpotifyAudioDriver` (console.info "SDK ready", warn no-op) não gateados. **Fix:** gatear ruído a `import.meta.env.DEV`, MANTER console.error de erro real (RF-06).
- **B-SDKLOADER** sdkLoader timeout deixa loadingPromise rejeitada (sem retry) + não re-checa window.Spotify. **Fix:** null loadingPromise no reject + re-check.
- **B-STATES** Search/Playlists skeletons/empty/erro PT-BR consistentes (RF-02/04).
- **B-NOWPLAYING-AUDIT** feedback ao add fila (10.1), destaque faixa tocando aria-current (10.2), count real header drill-in (10.3), play no card (10.4), shuffle/repeat com ended Spotify (10.5), artista no QueuePopover (10.6).
- **B-KEY-INDEX** `key={trackId+i}` derrota reconciliação React (flash de capa). **Fix:** key estável.
- **B-DURATION-0** "0:00" pra duração ausente/episode. **Fix:** ocultar quando 0.
- **B-PRODUCTTIER** status hardcoded `productTier:"premium"`. **Fix:** derivar de me.product persistido.

## Não-regressão (preservar — RF-07)
fetch `.bind(globalThis)`, oauth-callback sem requireAuth, /refresh por JWT, COOP poll silentMode, CSP Spotify, /items (track→item), tier 'active', telemetria CSRF exempt, singleton queryClient (lesson #29), 77+ testes spotify-e2e verdes.
