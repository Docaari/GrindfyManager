# Spec: Sprint Spotify E2E — Mini Player Playback + Catálogo 100% Funcional

## Status
Proposta

## Resumo
Tornar a integração Spotify no Mini Player do Grindfy 100% funcional end-to-end:
**reproduzir música de fato via Web Playback SDK** (device Connect no browser),
buscar tracks, navegar playlists e tocar — com UX/UI excelente e otimizada. O
bloqueador raiz do playback hoje é a **CSP** em `server/routes/index.ts`, que
bloqueia o script do SDK (`sdk.scdn.co`) e os hosts de runtime do Spotify.

## Contexto
OAuth/conexão, criptografia do token, refresh, busca e playlists **já funcionam
server-side** (confirmado em sessão de debug ao vivo — ver
`Docs/specs/sprint-spotify-e2e-context.md`). O que falta é o **playback no
browser**: o `SpotifyAudioDriver` carrega o Web Playback SDK de
`https://sdk.scdn.co/spotify-player.js`, instancia `Spotify.Player`, abre um
WebSocket no `dealer.spotify.com`, renderiza um iframe com EME (DRM Widevine) e
faz chamadas REST diretas do browser para `https://api.spotify.com`. **Nada disso
passa pela CSP atual** (`scriptSrc=['self','unsafe-inline'(+eval dev)]`,
`connectSrc` sem hosts Spotify, `frameSrc`/`mediaSrc` sem Spotify, sem
`encrypted-media`). Resultado: `window.Spotify` nunca existe → driver não cria
player → não toca.

Esta spec é uma **correção + hardening** sobre código já existente. NÃO re-fazer
o que funciona. NÃO reverter os fixes da sessão de debug (ver RF-08).

## Usuários
- **Jogador (Premium Spotify, plano Grindfy `active`/`trial`/`pro`/`premium`/`admin`):**
  conecta a conta, busca/escolhe música ou playlist e ouve durante o grind, com
  controles completos no Mini Player.
- **Jogador sem Premium / não conectado:** vê CTAs claros (conectar / upgrade
  Premium) sem erros de console nem estados quebrados.

## Pré-requisitos confirmados (ground-truth — NÃO re-descobrir)
- OAuth PKCE popup + callback server (cookie de sessão assinado + `state`).
- Cripto AES-256-GCM do `refresh_token` (`SPOTIFY_TOKEN_ENCRYPTION_KEY` válida).
- `requireSpotifyAccess` → access token (~267 chars). **Sempre** com deps
  completos `{storage, fetchFn, tokenCrypto, accessCache}` (ver GOTCHA).
- `GET /api/audio/spotify/search` → 200 + resultados (`market=from_token` OK).
- `GET /api/audio/spotify/me/playlists` + `/playlists/:id/tracks` (scopes
  `playlist-read-private` + `playlist-read-collaborative`).
- `GET /api/audio/spotify/status` → `{ connected, displayName, productTier }`.
- Driver (`SpotifyAudioDriver.ts`), SDK loader (`sdkLoader.ts`), Engine wire em
  `AudioPlayerContext.connectSpotify` já existem e estão corretos — faltava a CSP
  deixar o SDK carregar/conectar.

---

## Requisitos Funcionais

### RF-01: Playback funcional via Web Playback SDK (PRIORIDADE MÁXIMA)
**Descrição:** Após conectar (Premium), o usuário escolhe uma track (busca,
playlist ou fila) e o áudio **toca de fato** no browser via device Connect
"Grindfy", com controles funcionais e estado sincronizado.

**Regras de negócio / sub-itens:**

- **RF-01.1 — CSP allowlist para o SDK e seu runtime** (o fix central). Em
  `server/routes/index.ts`, adicionar aos directives Helmet:
  - `scriptSrc` += `https://sdk.scdn.co` (carregar `spotify-player.js`).
  - `connectSrc` += `https://api.spotify.com`, `https://*.spotify.com`,
    `wss://dealer.spotify.com`, `wss://*.spotify.com` (WebSocket de estado +
    REST play/pause/seek do browser).
  - `frameSrc` += `https://sdk.scdn.co`, `https://*.spotify.com` (o SDK injeta
    iframe de playback/EME).
  - `mediaSrc` += `https://*.scdn.co`, `https://*.spotify.com`,
    `https://sdk.scdn.co`, `blob:` (preview HTML5 30s de busca já existente +
    media do SDK).
  - `imgSrc` já cobre `https:` (capas SCDN OK — não regredir).
  - Adicionar `'unsafe-inline'` já presente em `scriptSrc`; **não** adicionar
    `'unsafe-eval'` em produção só por causa do Spotify (SDK não exige eval).
- **RF-01.2 — EME / encrypted-media.** O SDK usa Widevine via iframe. Garantir
  que o documento permita `encrypted-media` e `autoplay`. Mínimo: confirmar que
  não há `Permissions-Policy`/`Feature-Policy` restritiva no Helmet bloqueando
  `encrypted-media`/`autoplay` (Helmet não seta por default; se for setado,
  liberar). Documentar o requisito de iframe `allow="encrypted-media; autoplay"`
  caso o SDK precise (o SDK gerencia o próprio iframe — validar no browser).
- **RF-01.3 — activateElement por gesto do usuário.** O primeiro play deve
  ocorrer dentro de um gesto (autoplay policy). Garantir que `playTrack(spotify)`
  e o handler de play/connect disparem o playback a partir de um clique. Se o SDK
  expõe `player.activateElement()`, chamá-lo no gesto de connect/primeiro play
  (evita "EME requires user gesture" / playback silencioso).
- **RF-01.4 — Fluxo Transfer/Start Playback REST.** Ao tocar, o driver já faz
  `PUT /me/player/play?device_id=<deviceId>` com `{ uris:[trackId] }`. Garantir
  que `deviceId` esteja pronto (evento `ready`) antes do play; se o play chegar
  antes do `ready`, enfileirar e disparar no `ready` (hoje vira no-op silencioso
  — ver RF-01.7). Considerar `PUT /me/player` (transfer) quando o usuário tiver
  playback ativo em outro device.
- **RF-01.5 — Sincronização de estado (`player_state_changed`).** A UI reflete
  posição, duração, play/pause e fim de faixa a partir dos eventos do SDK (não da
  resposta REST). Já implementado no driver — validar end-to-end no browser:
  scrubber move, tempo atualiza, pause/play refletem, `ended` dispara autoplay.
- **RF-01.6 — Controles.** play, pause, seek, volume, next, prev funcionam para
  tracks Spotify. `setSpeed` é no-op (Spotify não suporta) e o controle de
  velocidade deve ficar **oculto** no Mini Player/Expanded quando
  `activeSource === 'spotify'` (hoje roda silencioso — confunde).
- **RF-01.7 — Tratamento de erros + reconnect.** Mapear e exibir mensagens PT-BR
  para: `authentication_error` (→ refresh/reconnect, já existe), `account_error`
  (→ "Spotify Premium necessário"), `playback_error`/`initialization_error` (→
  banner com retry), SDK falhou ao carregar (`SpotifySdkLoadError` →
  "verifique adblock/conexão"). `not_ready`/auth dispara reconnect exponencial
  (1s/2s/4s) já implementado. Erro de `deviceId` ausente no play não pode ser
  silencioso — emitir telemetria + estado de erro.

**Critério de aceitação:**
- [ ] Com app aberto em `http://127.0.0.1:3000`, conta Premium conectada: clicar
      play numa track Spotify **reproduz áudio audível** no browser.
- [ ] Console **sem** erros de CSP relativos a `sdk.scdn.co`, `api.spotify.com`,
      `dealer.spotify.com`.
- [ ] `window.Spotify` existe após `connectSpotify`; um device "Grindfy" aparece
      na lista de dispositivos do app Spotify.
- [ ] Scrubber/tempo/duração atualizam durante o playback; pause/play/seek/volume
      respondem; next/prev trocam de faixa; fim de faixa dispara autoplay.
- [ ] `account_error` (conta não-Premium) → mensagem PT-BR clara, sem crash.
- [ ] SDK bloqueado (adblock) → mensagem PT-BR, sem travar a UI.
- [ ] Controle de velocidade **não aparece** quando a source é Spotify.

### RF-02: Busca de tracks
**Descrição:** Buscar músicas e tocar a partir do resultado, com estados de UI
claros.
**Regras de negócio:**
- Debounce ~300–500ms (não fazer request por keystroke).
- Estados: loading (skeleton/spinner), vazio (`empty` com mensagem), erro (retry),
  resultados (lista com capa/título/artista/duração).
- Clicar num resultado → `playTrack({ source:'spotify', trackId:'spotify:track:...' })`.
- Preview HTML5 30s (já existente) continua funcionando sob a nova CSP `mediaSrc`.
**Critério de aceitação:**
- [ ] Digitar "bohemian" mostra resultados relevantes em < ~1s.
- [ ] Estado de loading visível durante o fetch; estado vazio quando 0 resultados.
- [ ] Erro de rede mostra mensagem + botão de tentar de novo.
- [ ] Clicar num resultado inicia o playback (RF-01).

### RF-03: Playlists
**Descrição:** Listar playlists do usuário, abrir (drill-in) para ver as tracks,
e tocar.
**Regras de negócio:**
- Listar via `/me/playlists`; drill-in via `/playlists/:id/tracks` (cap já
  existente respeitado).
- Estados loading/empty/erro idênticos ao padrão de RF-02.
- Tocar uma track da playlist usa o mesmo caminho de RF-01.
**Critério de aceitação:**
- [ ] Playlists do usuário aparecem com capa/nome/contagem.
- [ ] Drill-in mostra as tracks da playlist; breadcrumb/voltar funciona.
- [ ] Tocar uma track da playlist reproduz (RF-01).

### RF-04: UX connect → conectado sem reload
**Descrição:** Após conectar com sucesso, o botão "Conectar" some e o botão
"Buscar no Spotify" aparece **na mesma sessão**, sem F5.
**Regras de negócio:**
- No sucesso do `initiateSpotifyAuth` (postMessage **ou** `resolveViaStatusFallback`),
  invalidar `queryClient.invalidateQueries({ queryKey: ["spotify-status"] })` para
  que `useSpotifyStatus` (staleTime ~60s) refaça o fetch.
- O gate visual (`isSpotifyConnected` no context + status query) deve convergir
  para "conectado" imediatamente após o connect manual (hoje só converge no
  bootstrap pós-reload).
- Não introduzir polling agressivo nem múltiplas invalidações redundantes.
**Critério de aceitação:**
- [ ] Conectar via popup → botão troca para "Buscar no Spotify" sem recarregar.
- [ ] Conectar via redirect-fallback (popup bloqueado) → ao voltar, já conectado.
- [ ] `["spotify-status"]` é invalidado exatamente uma vez por connect bem-sucedido.

### RF-05: CSP Google Fonts (cosmético)
**Descrição:** Eliminar erros de console por fontes do Google bloqueadas.
**Regras de negócio:**
- `styleSrc` += `https://fonts.googleapis.com`.
- `fontSrc` += `https://fonts.gstatic.com`.
**Critério de aceitação:**
- [ ] Sem erros de CSP de `fonts.googleapis.com`/`fonts.gstatic.com` no console.
- [ ] Tipografia carrega corretamente.

### RF-06: Otimização (perf + telemetria)
**Descrição:** Evitar chamadas e re-renders redundantes; cache adequado;
telemetria de uso.
**Regras de negócio:**
- `useSpotifyStatus` com `staleTime` apropriado (não refetch por foco a cada vez).
- SDK carregado **uma vez** (loader já idempotente) — não recriar `Spotify.Player`
  por re-render; driver vive em ref (já é o caso).
- Busca com debounce + cancelamento de request stale (abort do fetch anterior).
- Cache de catálogo server-side já existe (5min) — não regredir; invalidar no
  disconnect.
- Telemetria (best-effort, nunca throw): `spotify_connected`,
  `spotify_play`/`spotify_pause`, `spotify_search`, `spotify_playlist_open`,
  `spotify_api_error`, `spotify_reconnect_failed`. Reusar `emitAudioEvent`
  (canônico ADR-207).
**Critério de aceitação:**
- [ ] Trocar de aba/voltar não dispara refetch de status redundante.
- [ ] Digitar rápido na busca não acumula N requests (debounce + abort).
- [ ] Nenhum `new Spotify.Player` duplicado por re-render do Mini Player.
- [ ] Eventos de telemetria emitidos sem quebrar a UI quando o endpoint falha.

### RF-07: Robustez do `requireSpotifyAccess` (decorrente do GOTCHA)
**Descrição:** Um decrypt-fail causado por **dep ausente** (TypeError —
`tokenCrypto` undefined) NÃO deve marcar o token como desconectado.
**Regras de negócio:**
- Distinguir corrupção real do refresh_token (decrypt falha com dados válidos) de
  erro de programação (dep faltando / TypeError). Só `safeMarkDisconnect` no
  primeiro caso.
- Todos os call sites de `requireSpotifyAccess` passam deps completos
  `{storage, fetchFn, tokenCrypto, accessCache}`. Scripts de diagnóstico idem.
**Critério de aceitação:**
- [ ] Chamar `requireSpotifyAccess` sem `tokenCrypto` lança erro claro de
      configuração e **não** marca o token desconectado.
- [ ] Decrypt-fail com refresh_token corrompido (não-TypeError) continua
      marcando disconnect (comportamento preservado).

### RF-08: Não-regressão dos fixes da sessão de debug
**Descrição:** Preservar explicitamente os fixes já aplicados (uncommitted na
branch `fix/warmup-dialog-zindex-meditation`). Listados aqui como invariantes que
os testes devem proteger.
**Invariantes (cada um vira assert de não-regressão):**
- `GET oauth-callback` **sem** `requireAuth` (popup redirect cross-site não
  carrega cookie de auth da plataforma).
- `/refresh` deriva `userId` do JWT; valida mismatch só se cookie `spotify_session`
  presente.
- SCOPES inclui `playlist-read-private` + `playlist-read-collaborative`.
- `auth.ts`: sem heurística "Safari async-close" que disparava `fallbackRedirect`;
  grace inicial 1.2s; poll resiliente a COOP via `/status` + `refreshAccessToken`
  em `silentMode` (401 NÃO desloga global).
- Guard de host mismatch (erro claro se página ≠ host do `redirect_uri`).
- `resolveViaStatusFallback` exportado e reusado no bootstrap do context.
- `MiniPlayerBar`/`EmptyStateCTA`: connect propaga token → `connectSpotify`; gate
  esconde quando conectado; usa singleton `queryClient` (NÃO `useQueryClient` —
  lesson #29); `SEARCH_ELIGIBLE_TIERS`/`ELIGIBLE_TIERS` incluem `active`.
- `AudioPlayerContext`: bootstrap no mount rehydrata via
  `resolveViaStatusFallback` + invalida `["spotify-status"]`.
**Critério de aceitação:**
- [ ] Nenhum dos comportamentos acima é revertido pela implementação desta spec.
- [ ] Testes existentes de Spotify (`tests/**/spotify*`, mini-player) permanecem
      verdes; novos testes não conflitam com os fixes.

---

## Requisitos Não-Funcionais
- **Segurança CSP:** ampliar a allowlist **somente** com os hosts Spotify
  necessários (sem curinga `https:` em `scriptSrc`/`connectSrc`). Produção **não**
  ganha `'unsafe-eval'`. WebSocket Spotify só via `wss:` para hosts Spotify.
- **Tokens:** access_token nunca em storage (só em ref/closure); refresh_token
  nunca chega ao client (ADR-190). Não logar tokens.
- **Performance:** SDK lazy-load idempotente; sem re-render que recrie o player;
  busca com debounce + abort.
- **Acessibilidade:** controles com `aria-label` PT-BR; foco gerenciável nos
  diálogos (Radix); estados de loading/erro anunciáveis.
- **Resiliência:** falha de rede/SDK/Spotify degrada graciosamente (mensagem +
  retry), nunca derruba o app nem desloga o usuário.

## Endpoints Envolvidos (existentes — sem endpoint novo previsto)
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| POST | /api/audio/spotify/oauth-init | Inicia PKCE, retorna authUrl | JWT |
| GET | /api/audio/spotify/oauth-callback | Callback OAuth (popup) | **sem** (cookie sessão + state) |
| POST | /api/audio/spotify/refresh | Access token via refresh | JWT |
| POST | /api/audio/spotify/disconnect | Desconecta + invalida cache | JWT |
| GET | /api/audio/spotify/status | `{connected,displayName,productTier}` | JWT |
| GET | /api/audio/spotify/search | Proxy `/v1/search` | JWT |
| GET | /api/audio/spotify/me/playlists | Proxy `/v1/me/playlists` | JWT |
| GET | /api/audio/spotify/playlists/:id/tracks | Proxy tracks da playlist | JWT |

> Playback (play/pause/seek) é **client-side**: browser → `https://api.spotify.com`
> via Web Playback SDK + `PUT /me/player/*`. Por isso depende de CSP `connectSrc`,
> não de proxy server.

## Arquivos Afetados (esperados)
- `server/routes/index.ts` — CSP (RF-01.1, RF-01.2, RF-05). **Núcleo do sprint.**
- `server/services/spotifyAccess.ts` — RF-07 (distinguir TypeError de corrupção).
- `client/src/lib/audio-engine/SpotifyAudioDriver.ts` — RF-01.3 (activateElement),
  RF-01.4 (deviceId-ready queue), RF-01.7 (mapeamento de erros).
- `client/src/contexts/AudioPlayerContext.tsx` — RF-01.6 (hide speed p/ spotify),
  RF-04 (invalidação in-session).
- `client/src/lib/spotify/auth.ts` — RF-04 (invalidação no sucesso do popup).
- `client/src/components/audio-player/MiniPlayerBar.tsx`, `EmptyStateCTA.tsx`,
  `SpotifySearchDialog.tsx`, `SpotifyPlaylistBrowser.tsx`, `QueuePopover.tsx` —
  RF-01.6/02/03 (estados, gate, ocultar speed).

## Cenários de Teste Derivados

### Happy Path
- [ ] CSP inclui `sdk.scdn.co` (script/frame), `api.spotify.com` +
      `wss://dealer.spotify.com` (connect), media SCDN — assert no header
      `Content-Security-Policy` gerado pelo Helmet.
- [ ] Buscar → clicar resultado → driver carrega SDK → `ready` → play → eventos
      `player_state_changed` atualizam estado (mock do SDK no teste de driver).

### Validação de Input / Estados
- [ ] Busca vazia (0 resultados) → estado `empty`.
- [ ] Busca com erro de rede → estado de erro + retry.
- [ ] Debounce: N keystrokes rápidos → 1 request (abort dos anteriores).

### Regras de Negócio
- [ ] `account_error` (não-Premium) → mensagem PT-BR; sem crash.
- [ ] Play antes do `ready` → enfileira e dispara no `ready` (não no-op silencioso).
- [ ] `activeSource==='spotify'` → controle de velocidade oculto.
- [ ] Connect bem-sucedido → `["spotify-status"]` invalidado 1x → botão troca.

### Edge Cases
- [ ] SDK falha ao carregar (timeout 5s / adblock) → `SpotifySdkLoadError` →
      mensagem PT-BR; UI não trava.
- [ ] `authentication_error` → reconnect exponencial 1s/2s/4s; 3 falhas →
      `onReconnectFailed` limpa driver + estado.
- [ ] `requireSpotifyAccess` sem `tokenCrypto` → erro de config, **não**
      desconecta o token (RF-07).
- [ ] Host mismatch (`localhost` vs `127.0.0.1`) → erro claro antes de abrir popup.

### Não-Regressão (RF-08)
- [ ] `oauth-callback` permanece sem `requireAuth`.
- [ ] SCOPES contêm `playlist-read-private` + `playlist-read-collaborative`.
- [ ] Poll de status usa `silentMode` (401 não desloga global).
- [ ] Componentes usam singleton `queryClient` (não `useQueryClient`).

## Fora de Escopo
- Migração para `localhost`/HTTPS prod do redirect_uri (config de ambiente/deploy,
  não código). A spec assume `127.0.0.1` em dev.
- Sair do Development Mode do app Spotify (allowlist de usuários / quota extension
  request) — operacional, fora do código.
- Letras/lyrics, recomendações, rádio, crossfade, gapless, equalizer.
- Variable speed para Spotify (SDK não suporta — controle só ocultado).
- Reescrita do fluxo OAuth (já funciona — só preservar, RF-08).
- Correção da divergência de FK `user_subscriptions.user_id` em **produção**
  (investigar à parte — ver Riscos). Em dev local já foi corrigida.
- Novos endpoints HTTP de playback (playback é client-side).

## Dependências
- **Spotify Premium** na conta conectada (Web Playback SDK + Start/Transfer
  Playback são Premium-only).
- **App em Development Mode** no Spotify Dashboard: a conta dona (founder) é
  auto-allowlisted; **qualquer outro tester precisa ser adicionado** à allowlist
  do app até quota extension/aprovação.
- **Ambiente `http://127.0.0.1:3000`** (Spotify rejeita `localhost` desde 2025;
  cookies não cruzam entre os dois hosts).
- `.env` com `SPOTIFY_CLIENT_ID/SECRET/REDIRECT_URI(127.0.0.1)/TOKEN_ENCRYPTION_KEY`.
- Seed local Premium para `USER-0005` (plano `active` resolvia `free` sem
  assinatura) — já aplicado em dev.

## Riscos
- **CSP overly permissive vs. funcional:** `*.spotify.com`/`*.scdn.co` são amplos.
  Necessários porque o SDK abre subdomínios dinâmicos (CDN/dealer). Risco aceito;
  manter restrito a Spotify (não `https:` global). Validar no browser que a lista
  é suficiente **e** mínima.
- **EME/Permissions-Policy:** se algum proxy/CDN de produção injetar
  `Permissions-Policy` sem `encrypted-media`, o playback quebra em prod mesmo com
  CSP correta. Validar no deploy.
- **FK `user_subscriptions.user_id` em produção:** a divergência
  (`→users.id` vs `→user_platform_id`) provavelmente existe em prod e pode fazer
  o gate Premium falhar lá. **Investigar antes do deploy** (fora do escopo de
  código deste sprint, mas bloqueia "funciona em prod").
- **Autoplay policy:** sem gesto válido no primeiro play, o EME pode recusar
  silenciosamente. RF-01.3 mitiga via `activateElement` no clique.
- **Branch uncommitted:** fixes da sessão estão em working tree não commitado;
  test-writer/implementer precisam preservá-los (RF-08) e o branch entanglement é
  conhecido (lessons #24/#45 — usar `git add` explícito).

## GOTCHA crítico (repetir para o implementer)
`requireSpotifyAccess(userId, deps)` sem `deps.tokenCrypto` →
`tokenCrypto.decryptRefreshToken` é `undefined.x` → throw → tratado como
decrypt-fail → `safeMarkDisconnect` **desconecta o token do usuário**. Scripts de
diagnóstico com deps incompletos desconectavam o founder a cada run (sintomas
erráticos: "playlists somem", "não conectado"). **Sempre passar deps completos.**
RF-07 endurece isso no código.

## Questões Abertas
> **Resolvidas pela arquitetura — ver ADR-220** (`Docs/architecture/decisions/220-spotify-e2e-playback-csp-sdk.md`)
> + diagramas em `Docs/architecture/diagrams/spotify-e2e/`.

1. **Transfer vs. Start direto:** ~~sempre `PUT /me/player/play?device_id=` ou
   transfer antes?~~ **RESOLVIDA (ADR-220 D3): start direto no device Grindfy**
   (`PUT /me/player/play?device_id=<ready.device_id>` com `uris`), usando o
   `device_id` do evento `ready`. Sem step de transfer separado. Transfer
   condicional (conflito de device ativo) fica como **follow-up**.
2. **`mediaSrc`/`frameSrc` mínimos:** **PARCIAL (ADR-220 D2 / §Diretivas CSP):**
   começar com a allowlist Spotify/SCDN explícita listada no ADR
   (`frameSrc+=sdk.scdn.co,*.spotify.com`; `mediaSrc+=*.scdn.co,*.spotify.com,
   sdk.scdn.co,blob:`). `workerSrc` mantido `[self,blob:]` até o browser provar
   necessidade. **Validar no browser** o conjunto exato (RF-01.2) e apertar se
   possível — único item que permanece dependente de validação runtime.
3. **Hide speed control:** ~~ocultar ou desabilitar com tooltip?~~ **RESOLVIDA
   (ADR-220 D5): ocultar (não renderizar)** quando `activeSource==='spotify'`.
4. **RF-07 em prod:** ~~FK do `user_subscriptions` entra neste sprint?~~
   **RESOLVIDA (ADR-220 D6 / Decisão 4 do founder): NÃO.** RF-07 (hardening do
   `requireSpotifyAccess` — TypeError de dep ausente não marca disconnect) entra
   neste sprint **só em código**. A divergência de FK em **produção** é
   **follow-up separado de banco** — não tocar DB prod aqui.
5. **Telemetria:** **RESOLVIDA (ADR-220 D7):** os eventos de playback
   (`spotify_connected`/`spotify_play`/`spotify_pause`/`spotify_search`/
   `spotify_playlist_open`/`spotify_api_error`/`spotify_reconnect_failed`)
   reusam `emitAudioEvent` (best-effort, lesson #9) e entram no allowlist do
   **ADR-207**. Convivem com os `audio.spotify_*` (dot-namespace de catálogo,
   ADR-208). Sem schema novo; cap metadata 10KB vigente.

## Notas de Implementação
- O fix de CSP é pequeno em superfície mas é o **gating absoluto** do playback —
  priorizar e validar no browser real (`mcp__claude-in-chrome` / `/verify`) antes
  de polir UX.
- Testar a CSP via assert no header gerado pelo Helmet (não só visual).
- Mockar o Web Playback SDK no teste de driver (lessons #5/#35: `new` vs factory).
- Preservar lesson #29 (singleton `queryClient`) em qualquer toque nos componentes.
