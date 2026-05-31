# Sprint Spotify E2E — Contexto / Ground-Truth (sessão de debug 2026-05-31)

> Documento de entrada para o pipeline TDD (pm-spec → system-architect →
> test-writer → implementer → reviewer). Captura o que JÁ foi diagnosticado e
> corrigido nesta sessão de debug ao vivo com o founder (USER-0005,
> ricardo.agnolo, plano `active`, Premium no Spotify). NÃO re-descobrir; NÃO
> reverter os fixes já aplicados sem motivo. Objetivo do founder: **músicas e
> player do Spotify 100% funcionais, otimizados, com excelente UX/UI.**

## Escopo da feature
Integração Spotify no Mini Player (barra global + EmptyStateCTA + SpotifySearchDialog):
1. **Conectar** conta Spotify (OAuth PKCE, popup).
2. **Buscar** tracks (`/api/audio/spotify/search`).
3. **Playlists** do usuário (`/api/audio/spotify/me/playlists` + `/playlists/:id/tracks`).
4. **Reproduzir** via Web Playback SDK (device Connect no browser) — **AINDA NÃO FUNCIONA** (bloqueio CSP, ver §"Broken").
5. UX: botão Conectar → some quando conectado; aparece Buscar; player com controles.

## Estado CONFIRMADO funcionando (com evidência nesta sessão)
- **OAuth connect**: popup PKCE → callback server troca code→token, persiste `spotify_tokens` (refresh_token AES-256-GCM), seta cookie de sessão.
- **Cripto do token**: key da `.env` (64 hex/32 bytes) decifra o refresh_token corretamente (testado decrypt direto: `DECRYPT_OK plaintext_len 134`).
- **Refresh**: `requireSpotifyAccess` obtém access token (267 chars) — `ACCESS_OK`.
- **Search server-side**: `GET /v1/search?q=boemia&type=track&market=from_token` → **200, 5 resultados** (Bohemian Rhapsody). `market=from_token` NÃO é problema (testado from_token/no_market/BR — todos 200, 5 results).
- **Playlists server-side**: retornam (com scope correto).
- **Tier gate**: founder `active` → seedado Premium local (ver §Local env).

## Estado CONFIRMADO quebrado / pendente
1. **PLAYBACK (principal)** — CSP em `server/routes/index.ts` bloqueia o Web Playback SDK:
   - `scriptSrc` = `['self','unsafe-inline'(+unsafe-eval dev)]` → **bloqueia `https://sdk.scdn.co/spotify-player.js`** → `window.Spotify` nunca existe → driver não cria player → não toca. **ESTE é o bloqueador raiz do playback.**
   - `connectSrc` não tem hosts Spotify → SDK não conecta (precisa `https://api.spotify.com`, `https://*.spotify.com`, `wss://dealer.spotify.com` / `wss://*.spotify.com`).
   - SDK usa iframe com EME → precisa `encrypted-media` + `frameSrc`/`mediaSrc` para Spotify.
   - Requisitos pesquisados (Spotify docs): Premium (founder tem), `activateElement()` por gesto, Transfer/Start Playback REST (Premium-only), iframe `allow="encrypted-media; autoplay"`.
2. **CSP Google Fonts** (cosmético, erros no console): `styleSrc`/`fontSrc` bloqueiam `fonts.googleapis.com` / `fonts.gstatic.com`.
3. **UX connect→search**: após conectar, botão só troca pra "Buscar" depois de **recarregar a página** (status query não invalida in-session de forma confiável no caminho de connect manual). Bootstrap pós-reload já invalida.
4. **Otimização/UX geral**: revisar fluxo, estados de loading/erro, acessibilidade, telemetria.

## Fixes JÁ APLICADOS nesta sessão (NÃO reverter; uncommitted na branch `fix/warmup-dialog-zindex-meditation`)
- `server/routes/spotifyAudio.ts`:
  - Removido `requireAuth` da rota GET `oauth-callback` (redirect top-level cross-site do popup não carrega o cookie de auth da plataforma; identidade vem do cookie de sessão OAuth assinado + state).
  - `/refresh` independente do cookie `spotify_session` (deriva `userId` do JWT; valida mismatch só se cookie presente).
  - SCOPES += `playlist-read-private`, `playlist-read-collaborative` (senão `/me/playlists` vem vazio).
- `client/src/lib/spotify/auth.ts`:
  - Removida heurística "Safari async-close" que disparava `fallbackRedirect` (navegava a página principal junto com o popup). Grace inicial 1.2s.
  - Poll de status resiliente a COOP (opener cortado → postMessage não chega): após popup fechar, consulta `/status` (server já setou cookie no sucesso) e resolve via `refreshAccessToken`. Usa `silentMode` (401 do refresh NÃO dispara logout global do `apiRequest`).
  - Guard host mismatch: lança erro claro se a página não está no mesmo host do `redirect_uri`.
  - `resolveViaStatusFallback` exportado (reusado no bootstrap do context).
- `client/src/components/audio-player/MiniPlayerBar.tsx`: connect button propaga token → `connectSpotify` (antes descartava resultado); gate esconde quando conectado; usa singleton `queryClient` (NÃO `useQueryClient` — lesson #29); `SEARCH_ELIGIBLE_TIERS` += `active`.
- `client/src/components/audio-player/EmptyStateCTA.tsx`: idem wiring + botão "Buscar no Spotify" quando conectado (abre SpotifySearchDialog); gate via context `isSpotifyConnected`.
- `client/src/contexts/AudioPlayerContext.tsx`: bootstrap no mount rehydrata driver via `resolveViaStatusFallback` + invalida `["spotify-status"]`.
- `client/src/components/audio-player/SpotifySearchDialog.tsx`: `ELIGIBLE_TIERS` += `active`.

## Ambiente local (dev) — caveats importantes
- **Acessar SEMPRE `http://127.0.0.1:3000`** (não `localhost`). Spotify exige `127.0.0.1` no redirect_uri (rejeita localhost desde 2025). Cookies não cruzam entre os dois hosts.
- `.env` tem `SPOTIFY_CLIENT_ID/SECRET/REDIRECT_URI(127.0.0.1)/TOKEN_ENCRYPTION_KEY` (todos presentes/válidos).
- Founder `active` resolvia pra `free` no gate (sem assinatura local). Seedado: `subscription_plans` `plan-premium-local` (name 'Premium') + `user_subscriptions` ativo pra USER-0005. **FK do DB local de `user_subscriptions.user_id` foi corrigida de `→users.id` para `→users.user_platform_id`** (alinhando `shared/schema.ts:2190`) + index unique `users_user_platform_id_uq`. ⚠️ Essa divergência de FK provavelmente existe em prod (separado, investigar).
- App owner do Spotify = conta do founder → auto-allowlisted em Development Mode (não bloqueia).

## GOTCHA crítico (lesson desta sessão)
`requireSpotifyAccess(userId, deps)` chamado **sem `deps.tokenCrypto`** → `tokenCrypto.decryptRefreshToken` é `undefined.x` → throw → catch trata como decrypt-fail → **`safeMarkDisconnect` marca o token desconectado**. Um script de diagnóstico (`scripts/diag-spotify.ts`) com deps incompletos DESCONECTAVA o token do founder a cada run, causando sintomas erráticos ("playlists somem", "não conectado"). Sempre passar deps completos: `{storage, fetchFn, tokenCrypto, accessCache}`. Considerar: decrypt-fail por TypeError de dep ausente NÃO deveria marcar disconnect (distinguir corrupção real de erro de programação).

## Requisitos do founder (aceite)
- Buscar músicas: funciona, rápido, resultados relevantes, UX clara (loading/empty/erro).
- Playlists: listam + drill-in + tocar.
- **Player**: reproduz de fato (Web Playback SDK), controles (play/pause/seek/volume/next/prev), estado sincronizado, transições suaves.
- UX/UI: excelente, consistente com tokens do design system, acessível.
- Otimizado: sem chamadas redundantes, cache adequado, sem re-renders desnecessários.
- 100% funcional end-to-end no fluxo real.

## Fontes (pesquisa)
- Spotify Web Playback SDK: https://developer.spotify.com/documentation/web-playback-sdk
- Transfer Playback: https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback
- Security requirements 2025 (127.0.0.1, HTTPS): https://developer.spotify.com/blog/2025-02-12-increasing-the-security-requirements-for-integrating-with-spotify
