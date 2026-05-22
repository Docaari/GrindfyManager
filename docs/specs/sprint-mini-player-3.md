# Sprint Mini Player 3 — invalid_grant + Hide Speed Spotify + Keyboard Shortcuts + Library Metadata + Queue UI + OAuth Polish

## Status

**Arquitetura aprovada** — 2026-05-22. Ultima sprint do cluster Mini Player (MP1 -> MP1.1 -> MP1.2 -> MP1.3 -> MP2 -> MP3). system-architect criou 4 ADRs (192-195) + 3 diagramas Mermaid em `Docs/architecture/diagrams/mini-player-3/`. Pronta para test-writer (red phase).

Sprint principal pos-MP2: fecha tech-debt critica MEDIUM-1 deferida (`invalid_grant` -> disconnect direto), refina UX Spotify (hide speed select que e no-op no SDK), adiciona Queue UI persistente (item original deferido pra MP3 desde MP2), enriquece LessonPickerDialog com metadata (capa + duracao + transcription preview + sort), expande keyboard shortcuts (paridade YouTube + numeric seek), e polimento OAuth (popup blocked fallback + error states UI).

### Decisoes arquiteturais (ADRs criados — system-architect 2026-05-22)

- **[ADR-192](../architecture/decisions/192-audio-focus-lost-deferred.md)** — Telemetria `audio_focus_lost` DESCARTADA (deferred / no caller). Manteve evento no enum da ADR-191 para back-compat; sem caller em MP3; re-avaliacao se MP4+ trouxer auto-pause cross-tab ou OS-level integration.
- **[ADR-193](../architecture/decisions/193-queue-ui-persistence-model.md)** — Queue UI = localStorage `audio.queue.v1` source-of-truth client + server snapshot best-effort em `audio_queue_snapshots` (user_id PK). Cross-tab via browser `storage` event. Conflict = last-write-wins por `version` int. Cap 50 items. Strip `audioUrl` no persist (rebuild on play via lookup).
- **[ADR-194](../architecture/decisions/194-oauth-popup-fallback.md)** — OAuth fallback: snapshot proactive em `sessionStorage.spotify_oauth_snapshot` (activeTrack + scrollY + queueVersion + timestamp + authUrl) ANTES do `window.open`; se popup === null OR `popup.closed && !resolved` em <1.5s -> `window.location.href = authUrl`. TTL 10min no restore. Snapshot NAO contem secrets.
- **[ADR-195](../architecture/decisions/195-keyboard-shortcuts-contract.md)** — Shortcuts via custom hook `useKeyboardShortcuts` no scope do `AudioPlayerProvider` (listener global em `document.keydown`). Gates: `isInteractiveTarget` + `isAdminRoute`. MP1 shortcuts inalterados. MP3 adiciona `J`/`L` (-10s/+10s), `ArrowUp`/`ArrowDown` (volume +/-10%), `0..9` (seek por %), `?` (toggle ShortcutsHelpPopover).

---

## Origem

- Sprint base: `Docs/specs/sprint-mini-player-2.md` (RF-01 Spotify driver real + RF-NEW Sleep Timer + ADRs 189/190/191).
- Memory anchors:
  - `memory/session_2026-05-22-mini-player-1-shipped.md` (MP1 base — 9 controles + AudioSourceEngine + LessonPickerDialog).
  - `memory/session_2026-05-22-mini-player-1.1-shipped.md` (MP1.1 — sanitizeCoverUrl + Radix Dialog + lazy fetch :slug).
  - `memory/session_2026-05-22-mini-player-1.2-shipped.md` (MP1.2 — safeUseQuery ErrorBoundary + Q-L `useOptionalAudioPlayer` reforcado).
  - `memory/session_2026-05-22-mini-player-1.3-shipped.md` (MP1.3 — MEDIUM-1 silent no-op fix + INFO-3/4 follow-ups).
- ADRs vivos: 187 (AudioSourceEngine), 188 (FSM + z-index), 189 (queue homogenea), 190 (token storage cookie httpOnly), 191 (telemetria via user_activity). **Proximo numero disponivel: 192**.
- Migration mais recente: `0077_spotify_tokens.sql`. **Proximo numero: 0078** (ja reservada em MP2 — agora usada).
- Strategist ja rodou ICE + benchmark Spotify/YouTube/Apple Music + decisoes travadas com founder (resumo no prompt do invocador):
  - Queue UI volta (deferida desde MP2). Drag-and-drop via `dnd-kit`. Persistencia hibrida (local primario + server opcional).
  - Keyboard shortcuts: paridade YouTube (`J/L` + `0-9` numeric seek) sem quebrar shortcuts MP1.
  - OAuth polish: popup blocker e o #1 friction point reportado. Fallback redirect compulsorio.
  - Library metadata: capa + duracao ja existem no storage; faltava UI surface + sort + transcription preview.
  - `invalid_grant` -> disconnect: tech-debt MEDIUM-1 deferida em MP2 R2 (teste afirmava 502). MP3 atualiza teste + semantica.

---

## Persona-alvo

Jogador profissional MTT que ja conectou Spotify Premium (MP2) e tem fluxo estabelecido: estuda Coach narrative (10-30min lessons) + musica de fundo durante 7-11h grind. 1 device desktop. Cohort principal usa keyboard heavy (atalhos hotbar grind tools). Power user que organiza estudos em batches (Queue UI = jukebox de aulas).

---

## 1. Sumario Executivo

**Objetivo.** Fechar cluster Mini Player com 6 RFs ordenados por ICE: cleanup tech-debt MP2 (RF-01), UX critical Spotify (RF-02), keyboard shortcuts expansion (RF-03), library metadata enrichment (RF-04), Queue UI persistente (RF-05), OAuth polish (RF-06). Apos MP3, cluster fica "feature-complete" pra persona MTT; itens remanescentes (cross-device, mobile, equalizer, lyrics, voice) vao pra MP4+ se demanda emergir.

**Tese.** MP1 entregou bar. MP1.1-1.3 refinaram surface. MP2 destravou Spotify Premium + Sleep Timer. MP3 fecha as 6 friccoes que o founder identificou na auditoria UX strategist (popup blocked, speed no-op, no queue, no shortcuts numericos, library "feels generic", invalid_grant tech-debt). Sem MP3, cluster fica com cauda de UX rough edges que afetam adoption qualitativo.

**Constraints duros.**
- Sem mudanca em `LessonViewer` / `PodcastPlayer` (Biblioteca-1).
- Sem mudanca no `<audio>` HTML5 nem no Spotify Web Playback SDK (drivers inalterados — RF-05 Queue toca via `playTrack` existente).
- `IAudioSourceDriver` interface NAO muda (ADR-189 reforcado).
- Surface `AudioPlayerContext` ganha SO additions (queue helpers); zero rename/breaking.
- Zero regressao baseline cluster Mini Player (~300 tests verdes a manter).
- Mobile (<1024px) NAO ganha Queue UI (defer MP3.1). Bar continua responsive como MP1.

**6 RFs em 1 linha:**

- **RF-01 (S, 1d) `invalid_grant` -> disconnect direto** — Tech-debt MEDIUM-1 deferida MP2. Sem incrementar `failure_count`; chama `markSpotifyDisconnected` direto + 401. Atualiza teste afirmava 502.
- **RF-02 (XS, 2h) Hide speed select Spotify** — `MiniPlayerBar`: speed `<select>` esconde quando `activeTrack?.source === 'spotify'` (SDK no-op). MP2 deixou warn quiet; UI ainda mostra dropdown morto.
- **RF-03 (M, 2d) Keyboard shortcuts expansion** — `Space/M/Esc` ja existem (MP1). Adicionar: `J/L` seek -10s/+10s (paridade YouTube), `0..9` seek pra 0%/10%/.../90%, `Up/Down` volume +10%/-10%. Ignore inputs + admin routes.
- **RF-04 (M, 2d) Library audio metadata enrichment** — LessonPickerDialog mostra capa + duracao formatted + transcription preview ~80 chars + skeleton loading + 3 sort modes (alfabetico/recente/duracao) persistido localStorage.
- **RF-05 (L, 4-5d) Queue UI persistente** — Popover/panel expansivel acionado pelo MiniPlayerBar. Lista proximas tracks. Reorder drag-and-drop (`dnd-kit` lazy). Clear/skip-current/repeat (off/all/one)/shuffle. Persistir localStorage + sync server best-effort. Cross-tab `storage` event listener. Cap 50 items.
- **RF-06 (S, 1d) OAuth polish** — Popup blocked fallback automatico (detect `window.open` null OR closed <1.5s -> sessionStorage snapshot + full-page redirect; restore pos-callback). Error states UI: `/spotify-callback?error=...` -> modal PT-BR especifico.

**Out of scope MP3 (defer MP3.1 / MP4+):**
- Mobile responsive Queue UI (defer MP3.1).
- `audio_focus_lost` telemetria implementation (ADR-192 deferred, no caller).
- Reflect.construct refactor INFO-3 MP2 (tech debt LOW, defer MP3.1).
- Cross-device sync (Spotify `playback_state` endpoint — MP4).
- Equalizer/Lyrics/Voice control (MP4+, sem demanda persona).
- Floating icon position UI nicety.
- Speed presets revamp (slider cobre + RF-02 hide).
- Custom sleep timer duration slider.
- Resume-after-Coach feature ("ao terminar Coach lesson, retoma Spotify").

---

## 2. Contexto e Motivacao

### 2.1. Estado atual (verificado em codigo, 2026-05-22)

- `server/routes/spotifyAudio.ts:472-494` — refresh `!resp.ok` incrementa `incrementRefreshFailureCount` + retorna 502 (ou 401 se >=3). Sem fast-path para `body.error === 'invalid_grant'`. Comment in-line linhas 473-479 documenta MEDIUM-1 deferida.
- `tests/integration/api/audio-spotify-refresh.test.ts:202-227` — teste "Spotify refresh endpoint 400 -> incrementa failure_count + 502" afirma comportamento atual com body `{ error: 'invalid_grant' }`. Bloqueia mudanca semantica sem update do teste.
- `client/src/components/audio-player/MiniPlayerBar.tsx:289-303` — speed `<select>` sempre renderiza quando `showSpeed = vp !== "mobile"`. Sem check `activeTrack?.source === 'spotify'`. MP2 add `console.warn('Spotify: setSpeed unsupported')` no driver mas UI permanece.
- `client/src/components/audio-player/MiniPlayerBar.tsx:114-150` — keyboard shortcuts hook in-line. Ja trata Space/ArrowLeft (-15s)/ArrowRight (+15s)/M/Esc. **Adicionar:** `J`/`L` (-10s/+10s), `0..9`, `ArrowUp`/`ArrowDown` (volume). Notar: MP1 usa -15s/+15s nas arrows; YouTube usa -10s/+10s em J/L. Mantemos ambos para evitar muscle memory breakage.
- `client/src/components/audio-player/LessonPickerDialog.tsx` — 632 linhas. Renderiza lista flat sem capa, duracao formatted, sort options. `lesson.coverUrl` ja existe (MP1.1 sanitize). `lesson.durationSeconds`/`durationMinutes` ja existem. Storage method `getLibraryProgressByLessonIds` (MP1) ja injeta progress. Sort sempre por ordem da API (algumas vezes "ultima editada"); user nao tem controle.
- `client/src/contexts/AudioPlayerContext.tsx` — surface tem `playTrack`, `playNext`, `playPrevious`, `tryAutoplayNext` (autoplay sequencial via `courseContext.lessons[]`). **Sem queue separado.** `courseContext.lessons` e a "queue implicita" hoje (sempre derivada do curso atual). MP3 introduz queue **independente** do courseContext (user pode misturar aulas de cursos diferentes na queue).
- `client/src/lib/spotify/auth.ts:119-188` — `initiateSpotifyAuth()` ja detecta popup blocked (`!popup` -> throw `SpotifyPopupBlockedError`) + popup closed via interval (throw `SpotifyOAuthCancelledError`). **Sem fallback automatico redirect.** UI captura erro e mostra mensagem "Permita popups", mas user precisa reabrir + clicar de novo. RF-06 automatiza.
- `client/src/pages/spotify-callback.tsx` — existe (criado MP2). Apenas faz `window.opener.postMessage` + `window.close()`. **Nao trata querystring `?error=`** (Spotify retorna `?error=access_denied` se user cancela na pagina do Spotify).

Migracao mais recente: `0077_spotify_tokens.sql`. **Proximo numero: 0078** (RF-05 queue snapshots server-side opcional).

### 2.2. Problema concreto

1. **`invalid_grant` deveria ser terminal, nao retry.** Spotify retorna `invalid_grant` quando refresh_token foi revogado externamente (user revogou em accounts.spotify.com OR Spotify rotacionou OR conta deletada). Retry 3x e desperdicio + experiencia ruim (audio para silenciosamente, 3 attempts a 1-2 min cada antes de disconnect). Tech-debt MP2.
2. **Speed select Spotify e UI mentirosa.** User ve dropdown 0.75x..2x, muda, e nada acontece (SDK no-op + warn console). Esperam que funcione (Coach narrative + speed control e feature MP1 hero). Hide elimina confusao.
3. **Sem queue persistente = jukebox impossivel.** Persona power organiza estudo em batches ("3 lessons de range cold4-bet + 2 de ICM + 1 de mental"). Hoje, autoplay sequencial so funciona dentro do mesmo curso. Cross-curso = manual lesson pick toda vez.
4. **LessonPickerDialog feels generic.** Lista flat sem visual cue (capa) + sem duracao formatted + sem sort = user scrolla muito + decide na sorte. Spotify/YouTube/Apple Music todos tem rich metadata. Persona power espera paridade.
5. **OAuth popup blocked = onboarding break.** Strategist auditou: 30%+ Chrome users tem popup blocker agressivo. User clica "Conectar Spotify" -> nada visivel acontece -> abandona. Sem fallback automatico, perde-se cohort grande na onboarding.
6. **Keyboard shortcuts incompletos.** MP1 cobre Space/arrows/M/Esc. Power user espera `J/L` (YouTube muscle memory) + numeric seek `0..9` (paridade total). Volume up/down via teclado tambem comum.

### 2.3. Por que sprint solo, agora

- MP1+MP1.1+1.2+1.3+MP2 shipped. Surface estavel. Tech-debt visivel (MEDIUM-1 documentado in-line) — fechar agora antes de cair em backlog dormente.
- Strategist 6 modos rodou + ICE/Benchmark/UX Audit identificaram esses 6 itens como top friccao restante. Sprint focado fecha o cluster.
- Custo dev medio (~3 semanas total dos 6 RFs). Founder AFK confortavel com paralelizacao (RF-01/02/03 paraleliza com RF-04/05/06).

### 2.4. Riscos de adiar

- `invalid_grant` espera 3 ciclos refresh antes de disconnect = users tem audio "morrendo aos pedacos" sem feedback claro. Churn risk.
- Queue UI defer mais 1 sprint -> persona power que pediu organiza-batches surveys vai sentir.
- Library metadata = quick win UX. Adiar = persona percebe "Grindfy cuida do grind, mas estudos sao 2a classe".

---

## 3. Defaults Ativos D1-D17

Decisoes ja tomadas (founder AFK + strategist). Test-writer e implementer assumem sem requestionar.

| ID | Default |
|---|---|
| **D1** | **`invalid_grant` -> disconnect imediato + 401 + Clear-Cookie.** NAO incrementa `failure_count`. Distincao do path generico 502 (rede / transient). Detect via `body.error === 'invalid_grant'` apos `await resp.json()` (Q-M). |
| **D2** | **Speed select esconde quando `activeTrack?.source === 'spotify'`.** Snap (display:none), nao fade animation — feedback instant + zero CLS layout. Render condicional `showSpeed && activeTrack?.source !== 'spotify'`. |
| **D3** | **Keyboard shortcuts novos NAO modificam shortcuts existentes (MP1 RF-13).** Adicionar `J` (=-10s, paridade YouTube), `L` (=+10s), `0-9` numeric seek, `ArrowUp` (+10% volume), `ArrowDown` (-10% volume). MP1 `ArrowLeft/Right` continua -15s/+15s (muscle memory existente). |
| **D4** | **Ignore shortcuts quando target eh input/textarea/contenteditable.** Helper `isInteractiveTarget` (ja existe MP1) reaproveitado. **Adicionar:** ignore quando `window.location.pathname.startsWith('/admin/')` (rotas admin teem combos proprios). ADR-195. |
| **D5** | **Visual indicator keyboard shortcuts: tooltip por controle (ja existem em title= MP1)**. NAO adicionar menu /help dedicado (ICE LOW, defer MP4). Adicionar `?` key handler que abre Popover lista compacta de shortcuts (5 linhas) — opcional baixo custo (Q-L). |
| **D6** | **LessonPickerDialog mostra capa (lesson.coverUrl sanitizada — MP1.1 RF-02) + duracao MM:SS (lesson.durationSeconds) + transcription preview ~80 chars com ellipsis.** Skeleton loading durante fetch. Lessons sem coverUrl renderizam placeholder cinza com primeira letra do titulo (Q-I). |
| **D7** | **Transcription preview = pre-load batch ao abrir dialog (NAO N+1).** Endpoint atual `/api/library/courses/:slug` (lazy fetch) ja retorna lessons; estender response com `transcriptionPreview` (primeiros 80 chars truncados + ellipsis). Cache TanStack staleTime 5min (Q-C). |
| **D8** | **Sort modes:** `[alfabetico, recente, duracao]` (3 modos). Default `recente` (back-compat com order atual). Persistir em `localStorage` key `lessonPicker.sortBy` (Q-D). Dropdown `<select>` no header do dialog. |
| **D9** | **Queue UI = Popover Radix expandindo verticalmente acima do MiniPlayerBar.** NAO panel slide-in lateral (consome viewport). Trigger: botao `data-testid="mini-player-queue-button"` no MiniPlayerBar entre Sleep e Expand. Estado vazio: "Fila vazia. Adicione aulas via biblioteca." (Q-A). |
| **D10** | **Queue model:** array `QueueItem[]` em `AudioPlayerContext.queue`. Cada item = `{id, track: AudioTrack, addedAt: Date}`. Cap 50 items (fora cap = `toast.warning` + reject). Operacoes: `addToQueue(track)`, `removeFromQueue(id)`, `reorderQueue(fromIdx, toIdx)`, `clearQueue()`, `skipToQueueItem(id)`. |
| **D11** | **Queue persistencia = localStorage `audio.queue.v1` primario + server best-effort sync.** Server endpoint `POST /api/audio/queue` (RF-05.5) salva snapshot JSONB. Reconcile: ao boot, le local + server; se versions divergem, **local wins** (offline-first). Server eh source of truth secundario para cross-tab eventual + MP4 cross-device (Q-B). |
| **D12** | **Repeat modes 3 estados: off / all / one.** off = `tryAutoplayNext` segue queue ou para. all = ao chegar no fim, volta ao primeiro item. one = repeat track atual. Icones: Repeat (off cinza, all branco, one branco com "1" badge). Persistir em localStorage `audio.queue.repeat` (Q-G). |
| **D13** | **Shuffle = Fisher-Yates pre-computed.** Ao ativar, gera new order via Fisher-Yates 1x, armazena em `shuffledOrder: string[]` (item IDs). Toggle off restaura order original. Click novo item enqueue mantem shuffle ativo (insere posicao random na ordem). Persistir flag (Q-H). |
| **D14** | **Cross-tab queue sync via `storage` event listener.** Debounce 500ms na write (evita race em digitacao rapida no reorder). Last-write-wins. Conflict detection via `version` field (incremento atomico no localStorage). |
| **D15** | **OAuth popup fallback automatico.** `initiateSpotifyAuth` detect: (a) `window.open` retorna `null` (popup bloqueado) OR (b) popup closed em <1.5s sem postMessage (Safari async-close threshold). Em ambos: salva snapshot `sessionStorage.spotify_oauth_snapshot = {activeTrack, queue, scrollY, timestamp}` + `window.location.href = authUrl` (full-page navigate). |
| **D16** | **sessionStorage snapshot TTL 10min.** Apos callback (`/spotify-callback` page mount), check timestamp; se > 10min, descarta + redirect home. Restore: `window.scrollTo(scrollY)` + re-hydrate queue (RF-05) + se activeTrack era Spotify, NAO auto-play (user precisa clicar — UX sanity). |
| **D17** | **OAuth error states UI:** `/spotify-callback?error=<reason>` -> modal `SpotifyOAuthErrorDialog` com mapeamento PT-BR: `state_mismatch` -> "Sessao expirada. Tente conectar novamente.", `access_denied` -> "Voce cancelou a autorizacao.", `invalid_grant` -> "Token Spotify invalido. Reconecte.", `server_error` -> "Erro do servidor Spotify. Tente em alguns minutos.", default -> "Erro desconhecido. Tente novamente." Botao `[Reconectar]` + `[Cancelar]`. |

---

## 4. Usuarios e Personas

### 4.1. Personas (delta vs MP2)

| Persona | Novo behavior MP3 |
|---|---|
| **Grindeiro power Spotify Premium** | Usa Queue UI para empilhar 5-10 lessons + musicas mixadas. Reorder via drag-and-drop. Shuffle ON pra variar musicas. Repeat all ON pra musica de fundo continua. |
| **Grindeiro keyboard-heavy** | Press `J`/`L` durante grind para skip 10s; `5` jump 50%; `M` mute; `Up`/`Down` ajusta volume sem mouse. |
| **Grindeiro Spotify desconectado (token revogado externo)** | invalid_grant detected -> disconnect imediato + UI prompt "Reconectar?" (RF-01 + RF-06 error states). |
| **Grindeiro Chrome popup-blocker** | Click "Conectar Spotify" -> popup blocked detected -> full-page redirect -> autoriza -> volta pra Grindfy com state restaurado (queue, scroll position). |
| **Estudante batch organizer** | Abre LessonPickerDialog -> ve capa+duracao+preview transcricao -> sort por "duracao" pra pegar 2 lessons curtas (<15min) -> add to queue. |

### 4.2. User Stories

#### US-01 (invalid_grant)
> Como user com token Spotify revogado externamente, quero ser desconectado imediatamente quando o sistema detecta `invalid_grant`, sem 3 retries que travam audio.

#### US-02 (hide speed)
> Como user tocando Spotify, NAO quero ver dropdown speed que nao funciona (Spotify SDK no-op).

#### US-03 (J/L shortcuts)
> Como power user vindo de YouTube, quero `J`/`L` -10s/+10s pra paridade muscle memory, sem perder os arrows MP1 (-15s/+15s).

#### US-04 (numeric seek)
> Como user navegando lesson de 30min, quero `5` pular pra 50% (15min mark) instant, sem arrastar slider.

#### US-05 (library metadata)
> Como user escolhendo lesson, quero ver capa + duracao + preview transcricao + sort por duracao, pra decidir rapido qual encaixar no tempo disponivel.

#### US-06 (queue UI)
> Como user organizando estudo, quero adicionar 5 lessons + 3 musicas na queue, drag-reorder, shuffle ON, repeat all, e tocar ininterrupto 2h.

#### US-07 (queue persistencia)
> Como user que fecha browser e abre 30min depois, quero a queue intacta (localStorage); idealmente em outro device (server sync best-effort).

#### US-08 (oauth popup fallback)
> Como Chrome user com popup blocker, quero que "Conectar Spotify" funcione sem precisar permitir popups manualmente — fallback redirect transparente.

#### US-09 (oauth error states)
> Como user que cancelou OAuth no Spotify, quero ver modal claro "Voce cancelou a autorizacao" com botao "Reconectar", nao tela em branco confusa.

---

## 5. Requisitos Funcionais

### RF-01 — `invalid_grant` -> disconnect direto

**ICE:** I=3, C=5, E=2 -> 7.5 (alto upside qualitativo, custo baixo, urgent tech-debt fechar MP2 MEDIUM-1)

**O que faz.** Em `server/routes/spotifyAudio.ts:handlePostSpotifyRefresh`, quando Spotify retorna `400` com `body.error === 'invalid_grant'`, pula incremento de `failure_count` e chama `markSpotifyDisconnected` direto + 401 + `clearSpotifySessionCookie`. Outros `!resp.ok` continuam path generico (incrementa + 502, ou 401 apos 3 fails).

**Sub-RFs:**

#### RF-01.1 — Backend semantica

- Em `handlePostSpotifyRefresh` apos `if (!resp?.ok)`:
  - **Adicionar:** `const errJson = await resp.json().catch(() => null);` + `if (errJson?.error === 'invalid_grant') { await storage.markSpotifyDisconnected(userId, 'invalid_grant'); clearSpotifySessionCookie(res); res.status(401).json({ message: 'Spotify token revogado. Reconecte.' }); return; }`.
  - **Antes:** path generico (incrementa `incrementRefreshFailureCount` + 502, ou 401 se >=3).
- Remover comment in-line `// NOTA: MEDIUM-1 ("invalid_grant -> disconnect direto") foi DEFERIDO` (linhas 473-479).
- Adicionar comment novo apontando ADR-195/MP3 RF-01 + reason value `'invalid_grant'` em `markSpotifyDisconnected`.

**Acceptance criteria:**
- [ ] Teste backend: refresh com `resp.ok=false`, `status=400`, `body={error:'invalid_grant'}` -> retorna 401 (NAO 502).
- [ ] Teste backend: `incrementRefreshFailureCount` NAO chamado quando `invalid_grant`.
- [ ] Teste backend: `markSpotifyDisconnected(userId, 'invalid_grant')` chamado 1x.
- [ ] Teste backend: `clearSpotifySessionCookie` chamado 1x.
- [ ] Teste backend: outros erros (rede 503, status 502 sem body.error) continuam path generico (502 + increment).
- [ ] Telemetria emitida: `spotify_disconnected` com `reason='invalid_grant'`.
- [ ] `tests/integration/api/audio-spotify-refresh.test.ts:202-227` ATUALIZADO pelo test-writer (espera 401 + skip increment + mark disconnected). Implementer NAO toca teste.

#### RF-01.2 — Test-writer atualiza teste existente

Test-writer (red phase) atualiza `audio-spotify-refresh.test.ts:202-227`:
- Renomeia `it('Spotify refresh endpoint 400 -> incrementa failure_count + 502', ...)` -> `it('Spotify refresh endpoint 400 invalid_grant -> mark disconnected + 401 + clearCookie', ...)`.
- Assertions:
  - `expect(res.statusCode).toBe(401)` (era 502).
  - `expect(storageMock.markSpotifyDisconnected).toHaveBeenCalledWith('USER-0001', 'invalid_grant')`.
  - `expect(storageMock.incrementRefreshFailureCount).not.toHaveBeenCalled()`.
  - `expect(res.cookies['spotify_session']).toBeUndefined()` (cleared).
- Adicionar NOVO teste: `it('Spotify refresh endpoint 502 transient (NAO invalid_grant) -> incrementa + 502', ...)` afirma path generico inalterado.

**Acceptance criteria:**
- [ ] Teste antigo (linha 202) renomeado + assertions atualizadas.
- [ ] Teste novo path generico (rede transient) cobre regressao.
- [ ] `npm run test --` em audio-spotify-refresh.test.ts: 4 testes verdes (era 3).

**Estimate RF-01 total:** S (~1d).

**Dependencias:** Nenhuma. Bloqueia: opcional para ordering (RF-06 OAuth error states pode referenciar reason `invalid_grant`).

**Riscos:**
- **R-01.1** Outros lugares no codigo lendo `failure_count` esperam comportamento antigo. **Mitigacao:** grep `failure_count|refreshFailureCount` no client/server; revisar lugares que assumem incremento; confirmar `markSpotifyDisconnected` zera ou nao impacta queries.
- **R-01.2** `resp.json()` pode throw se body nao-JSON. **Mitigacao:** `.catch(() => null)` no parse + check `errJson?.error` opcional chaining.

---

### RF-02 — Hide speed select Spotify

**ICE:** I=2, C=5, E=1 -> 10.0 (quick win, max-priority UX)

**O que faz.** No `MiniPlayerBar`, esconde o `<select data-testid="mini-player-speed">` quando `activeTrack?.source === 'spotify'`. Snap (display:none via conditional render), nao animation. Test cobre os 2 estados.

**Sub-RFs:**

#### RF-02.1 — Conditional render

- Em `client/src/components/audio-player/MiniPlayerBar.tsx:289`: trocar `{showSpeed && (...)}` por `{showSpeed && activeTrack?.source !== 'spotify' && (...)}`.
- Adicionar `data-testid` ja existe (linha 291).
- Comment in-line explicando: `// MP3 RF-02: Spotify SDK setSpeed no-op (variable speed unsupported). Hide select para evitar UI mentirosa.`

**Acceptance criteria:**
- [ ] Quando `activeTrack.source = 'library'` -> `<select data-testid="mini-player-speed">` visivel.
- [ ] Quando `activeTrack.source = 'spotify'` -> `<select>` NAO renderizado (`queryByTestId` retorna null).
- [ ] Quando `activeTrack` null OR `vp = 'mobile'` -> nao renderizado (logica MP1 inalterada).
- [ ] Test: trocar source library <-> spotify via re-render afirma toggle.

**Estimate RF-02 total:** XS (~2h).

**Dependencias:** Nenhuma.

**Riscos:**
- **R-02.1** Layout shift quando track switch library->spotify (CLS). **Mitigacao:** snap eh esperado (no animation per D2). Avaliar se gap `flex items-center gap-1` causa salto perceptivel; se sim, considerar `visibility:hidden` em vez de unmount (preserva espaco). Decisao final: implementer escolhe, defaulting para unmount + monitor via verify manual.

---

### RF-03 — Keyboard shortcuts expansion

**ICE:** I=3, C=4, E=2 -> 6.0 (paridade YouTube, persona keyboard-heavy)

**O que faz.** Estende handler `keydown` em `MiniPlayerBar` (linhas 114-150) com novos atalhos. Sem modificar handlers existentes MP1 (Space/ArrowLeft/Right/M/Esc).

**Sub-RFs:**

#### RF-03.1 — Novos atalhos

- `J` / `j` -> `skipBack(10)` (NAO 15 — paridade YouTube). `preventDefault`.
- `L` / `l` -> `skipForward(10)`. `preventDefault`.
- `ArrowUp` -> volume += 0.10 (clamp 0..1). `preventDefault`.
- `ArrowDown` -> volume -= 0.10 (clamp 0..1). `preventDefault`.
- `0` / `1` / `2` / ... / `9` -> `seek(durationSeconds * digit / 10)` (digit/10 = pct). Ignora se `durationSeconds <= 0`. `preventDefault`.
- `?` -> abre Popover com lista compacta shortcuts (Q-L resolved D5). `preventDefault`. Toggle (segundo press fecha).

#### RF-03.2 — Admin route gate

- Helper local `function isAdminRoute(): boolean { return typeof window !== 'undefined' && window.location.pathname.startsWith('/admin/'); }`.
- Adicionar check no inicio do handler: `if (isAdminRoute()) return;`.
- Coexiste com check `isInteractiveTarget` MP1.

#### RF-03.3 — Volume helper no context

- `AudioPlayerContext` exposes `setVolume(v: number)` ja (MP1 RF-04 — VolumeControl usa). Confirmar surface; se nao expose, expor.
- Caller no MiniPlayerBar: `setVolume(Math.min(1, Math.max(0, volume + 0.1)))`. Le `volume` do context.

#### RF-03.4 — Shortcuts help Popover

- Componente `client/src/components/audio-player/ShortcutsHelpPopover.tsx`.
- Trigger: state `[shortcutsHelpOpen, setShortcutsHelpOpen]` em MiniPlayerBar. `?` key toggle.
- Conteudo (5 linhas):
  - `Espaco`: Play/Pause
  - `Setas <- ->`: -15s / +15s
  - `J / L`: -10s / +10s (paridade YouTube)
  - `0-9`: Pular para 0% / 10% / ... / 90%
  - `M`: Mute toggle / `Setas Cima Baixo`: Volume +/- 10%
- `data-testid="shortcuts-help-popover"`. Radix Popover (lesson MP1.1 RF-05).

**Acceptance criteria:**
- [ ] Press `J` (mock keydown) -> `skipBack` chamado com `10`.
- [ ] Press `L` -> `skipForward(10)`.
- [ ] Press `ArrowUp` -> volume += 0.1 (clamp 1.0 max).
- [ ] Press `ArrowDown` -> volume -= 0.1 (clamp 0 min).
- [ ] Press `5` com `durationSeconds=600` -> `seek(300)`.
- [ ] Press `9` com `durationSeconds=100` -> `seek(90)`.
- [ ] Press `0` -> `seek(0)`.
- [ ] Press `?` -> Popover renderiza; press novo `?` -> fecha.
- [ ] `pathname = '/admin/dashboard'` -> NENHUM shortcut dispara.
- [ ] `target` em `<input>` -> NENHUM shortcut dispara.
- [ ] `durationSeconds=0` + press `5` -> `seek` NAO chamado (ignora).
- [ ] Shortcuts MP1 (Space/ArrowLeft -15s/ArrowRight +15s/M/Esc) continuam funcionando (regressao).
- [ ] `data-testid="shortcuts-help-popover"` presente no DOM quando aberto.

**Estimate RF-03 total:** M (~2d).

**Dependencias:** ADR-195 (contract documentado).

**Riscos:**
- **R-03.1** Conflito `J`/`L` com outras paginas (admin tem `?` opcional para help system?). **Mitigacao:** admin gate (D4). Test em rota nao-admin.
- **R-03.2** `ArrowUp/Down` ja consumidos por outras paginas (e.g. tabela navegavel)? **Mitigacao:** `e.stopPropagation()` apos handler. Documentar conflito potencial.
- **R-03.3** `?` requer shift+/ em layout US (e shift+1 em PT-BR Apple). **Mitigacao:** check `e.key === '?'` cobre ambos (key e o caractere final). Test layouts diversos no verify manual.

---

### RF-04 — Library audio metadata enrichment

**ICE:** I=3, C=4, E=2 -> 6.0 (UX paridade Spotify/YouTube)

**O que faz.** Estende `LessonPickerDialog` para mostrar capa + duracao formatted + transcription preview. Adiciona sort dropdown (alfabetico/recente/duracao) persistido em localStorage. Skeleton loading durante fetch.

**Sub-RFs:**

#### RF-04.1 — Capa + duracao formatted

- LessonRow atual mostra so titulo + course. Adicionar:
  - `<img src={sanitizeCoverUrl(lesson.coverUrl)} class="w-12 h-12 rounded">` ou placeholder cinza com primeira letra do titulo (D6).
  - Duracao formatted via helper `formatDuration(seconds: number): string`. Ex: `seconds=125` -> `'2:05'`. `seconds >= 3600` -> `'1:05:30'`.
- Helper em `client/src/lib/audio-engine/formatDuration.ts` (novo). Cobre 0..86399 seconds. Negativos/null -> `'--:--'`.

#### RF-04.2 — Transcription preview

- Storage: endpoint `GET /api/library/courses/:slug` ja retorna lessons. Estender com `transcriptionPreview: string | null` (primeiros 80 chars + ellipsis se truncado).
- Storage method `getLessonsByCourseSlug` (existe MP1.1) adicionar `LEFT JOIN library_transcriptions ON ...` OU coluna `library_lessons.transcription_preview` (estrategia simples: pre-computado em ingestion; fallback null).
- **Decisao spec:** Coluna `library_lessons.transcription_preview` (NULL se transcription nao existe). Migration 0078 cria coluna + backfill via SQL `UPDATE library_lessons SET transcription_preview = SUBSTRING(transcription_full FROM 1 FOR 80) WHERE transcription_full IS NOT NULL`.
- Render no LessonRow: linha `<div class="text-xs text-gray-400 line-clamp-1">{lesson.transcriptionPreview ?? '—'}</div>`.

#### RF-04.3 — Sort dropdown

- Header do dialog (acima da lista): `<select data-testid="lesson-picker-sort">` com 3 options:
  - `recente` (default) — order da API (back-compat).
  - `alfabetico` — `lessons.sort((a,b) => a.title.localeCompare(b.title))`.
  - `duracao` — `lessons.sort((a,b) => (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0))`.
- Persistir em `localStorage.lessonPicker.sortBy` (D8).
- Helper `createLocalStorageState<T>(key: string, defaultValue: T)` (factory existente em `biblioteca-enrich` per session log `2026-05-18-biblioteca-enrich.md`).

#### RF-04.4 — Skeleton loading

- Quando `isLoading` da query: render 5 LessonRow skeletons (Radix Skeleton OU `<div class="animate-pulse bg-gray-700 h-16 rounded">`).
- `data-testid="lesson-picker-skeleton"`.

**Acceptance criteria:**
- [ ] LessonRow renderiza `<img>` com `sanitizeCoverUrl(lesson.coverUrl)`; null -> placeholder cinza com 1a letra titulo.
- [ ] LessonRow renderiza duracao `MM:SS` ou `HH:MM:SS`; null -> `--:--`.
- [ ] LessonRow renderiza preview (line-clamp-1) ou `—` se null.
- [ ] Sort `alfabetico` reordena lessons alphabeticamente (case-insensitive).
- [ ] Sort `duracao` ordena ascending; nulls vao pro fim.
- [ ] Sort change -> `localStorage.lessonPicker.sortBy` atualizado.
- [ ] Reload dialog -> sort persistido restaurado.
- [ ] `isLoading=true` -> skeleton renderizado (5x).
- [ ] `isError` -> usa fallback existente MP1.2 ErrorBoundary (sem mudanca).
- [ ] Backend test: `GET /api/library/courses/:slug` response inclui `transcriptionPreview` field.
- [ ] Migration 0078 cria `transcription_preview` coluna NULL-able + backfill (skipif coluna ja exists).
- [ ] `formatDuration` cobre 0, 59, 60, 3599, 3600, 86399, null, negative.

**Estimate RF-04 total:** M (~2d).

**Dependencias:** Migration 0078 + storage estendido.

**Riscos:**
- **R-04.1** Transcription_full pode nao existir em lessons antigas (backfill no-op). **Mitigacao:** fallback `'—'` no UI. Documentar known limitation.
- **R-04.2** Sort por duracao em lessons com `durationSeconds=null` -> NaN. **Mitigacao:** `(a.durationSeconds ?? 0)` coerce 0 (fim da lista quando ascending desejado seria fim; defaulting 0 coloca no inicio — invertido). **Decisao spec:** nulls vao pro **fim** -> usar `Number.MAX_SAFE_INTEGER` como fallback no compare.

---

### RF-05 — Queue UI persistente

**ICE:** I=4, C=3, E=4 -> 3.0 (alto impacto, custo significativo, persona power)

**O que faz.** Adiciona panel Queue acionado pelo MiniPlayerBar. Lista proximas tracks com reorder drag-and-drop (`dnd-kit`), skip-current, repeat (off/all/one), shuffle, clear. Persistencia localStorage primario + server best-effort sync. Cross-tab via `storage` event.

**Sub-RFs:**

#### RF-05.1 — Surface no AudioPlayerContext

Adicionar ao context (sem breaking changes):

```ts
interface QueueItem {
  id: string;          // nanoid
  track: AudioTrack;
  addedAt: number;     // Date.now()
}

// State:
queue: QueueItem[];
repeatMode: 'off' | 'all' | 'one';
shuffleEnabled: boolean;
shuffledOrder: string[] | null;  // item IDs in shuffled order

// Actions:
addToQueue: (track: AudioTrack) => void;
removeFromQueue: (id: string) => void;
reorderQueue: (fromIdx: number, toIdx: number) => void;
clearQueue: () => void;
skipToQueueItem: (id: string) => void;
setRepeatMode: (mode: 'off' | 'all' | 'one') => void;
toggleShuffle: () => void;
```

#### RF-05.2 — QueuePanel componente

- `client/src/components/audio-player/QueuePanel.tsx`.
- Trigger: `data-testid="mini-player-queue-button"` no MiniPlayerBar entre Sleep e Expand.
- Popover Radix expandindo verticalmente acima do MiniPlayerBar (D9). Width 360px desktop; mobile defer MP3.1.
- Conteudo:
  - Header: titulo "Fila" + count `({queue.length})` + botoes [Shuffle], [Repeat], [Clear All].
  - Lista: scrollable, max-height 50vh.
  - Cada QueueRow: capa (sanitized) + titulo + duracao + drag handle + skip button (►) + remove button (X).
  - Empty state: "Fila vazia. Adicione aulas via biblioteca." (D9).

#### RF-05.3 — Drag-and-drop

- Lib: `@dnd-kit/core` + `@dnd-kit/sortable` (lazy import via dynamic import — RNF-01).
- ErrorBoundary local (lesson #29) ao redor do SortableContext: se dnd-kit falha load, fallback lista nao-drag (skip/remove ainda funciona).
- `onDragEnd(event)` -> `reorderQueue(fromIdx, toIdx)`.

#### RF-05.4 — Repeat + Shuffle

- Repeat toggle 3 estados (D12). Icone Lucide `Repeat` (off cinza) / `Repeat` (all branco com border) / `Repeat1` (one branco).
- Shuffle toggle 2 estados (D13). Icone Lucide `Shuffle` (off cinza / on branco).
- Em `tryAutoplayNext` (existente):
  - `repeatMode === 'one'` -> seek(0) + play (mesmo track).
  - `shuffleEnabled` -> proximo item de `shuffledOrder` after `currentItem`.
  - `repeatMode === 'all'` + fim da queue -> primeiro item.
  - `repeatMode === 'off'` + fim -> stop (existing behavior).

#### RF-05.5 — Persistencia

- LocalStorage key `audio.queue.v1`:
  ```json
  {
    "version": 7,
    "queue": [{"id": "...", "track": {...}, "addedAt": 1716...}],
    "repeatMode": "all",
    "shuffleEnabled": true,
    "shuffledOrder": ["...", "..."],
    "updatedAt": 1716...
  }
  ```
- Server sync: `POST /api/audio/queue` body = mesma shape (sem track.audioUrl — sensivel; backend recupera por trackId). 401 no body audioUrl signed URL caso queira recriar; defer MP3.1 (Q-N).
- Reconcile boot: le local + GET `/api/audio/queue`. Local wins (offline-first, D11). Se local empty + server non-empty -> hydrate local.
- Write trigger: qualquer mutation (add/remove/reorder/clear/repeat/shuffle) -> debounce 500ms -> save local + `POST /api/audio/queue` best-effort (errors swallowed + console.warn).
- Cross-tab: `window.addEventListener('storage', ...)` em context boot -> se key = `audio.queue.v1` e version > current -> reload state.

#### RF-05.6 — Migration 0078 server-side schema

```sql
-- migrations/0078_audio_queue_snapshots.sql
CREATE TABLE audio_queue_snapshots (
  user_id varchar PRIMARY KEY REFERENCES users(user_platform_id) ON DELETE CASCADE,
  queue_jsonb jsonb NOT NULL DEFAULT '[]'::jsonb,
  repeat_mode varchar(8) NOT NULL DEFAULT 'off' CHECK (repeat_mode IN ('off','all','one')),
  shuffle_enabled boolean NOT NULL DEFAULT false,
  shuffled_order jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamp DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE audio_queue_snapshots IS 'Sprint Mini Player 3 (ADR-193). Queue persistence server-side opcional.';
```

Rollback:
```sql
DROP TABLE IF EXISTS audio_queue_snapshots;
```

#### RF-05.7 — Cap 50 items

- `addToQueue`: se `queue.length >= 50` -> toast warning "Fila cheia (50 items). Remova items antes de adicionar." + reject (sem add).
- Test cobre cap.

**Acceptance criteria:**
- [ ] QueuePanel renderiza ao click `mini-player-queue-button`.
- [ ] Empty state texto correto quando queue vazio.
- [ ] `addToQueue` add no fim; `queue.length` incrementa.
- [ ] `removeFromQueue` remove por id.
- [ ] `reorderQueue(0, 2)` move item.
- [ ] Drag-and-drop dispatcha `reorderQueue` com indices corretos.
- [ ] `clearQueue` zera queue (confirm modal).
- [ ] `skipToQueueItem(id)` chama `playTrack(item.track)` + remove items anteriores (ou marca pos atual; spec final = remove anteriores, simpler).
- [ ] `setRepeatMode('one')` faz tryAutoplayNext repeat current.
- [ ] `setRepeatMode('all')` ao fim -> primeiro.
- [ ] `toggleShuffle` ON gera shuffledOrder; OFF restaura.
- [ ] Add 51o item -> rejected + toast.
- [ ] LocalStorage `audio.queue.v1` updated apos cada mutation (debounce 500ms).
- [ ] Reload page -> queue restaurado.
- [ ] Tab 2: change queue em tab 1 -> tab 2 reflete em <1s (storage event).
- [ ] Backend POST `/api/audio/queue` chamado best-effort; 500 server -> console.warn + UI continua.
- [ ] dnd-kit lazy: `vite build --report` confirma chunk separado.

**Estimate RF-05 total:** L (~4-5d).

**Dependencias:** ADR-193 + migration 0078.

**Riscos:**
- **R-05.1** dnd-kit lazy load slow primeira interacao. **Mitigacao:** prefetch on hover do queue button OR show static loader 200ms.
- **R-05.2** Cross-tab race em mutation simultanea. **Mitigacao:** version field + last-write-wins. Documentar known limitation: rapid simultaneous edits em 2 tabs podem perder operacoes raras (acceptable).
- **R-05.3** Spotify track em queue + driver desconectado -> `playTrack` falha. **Mitigacao:** UI mostra item com badge "Spotify desconectado" + disable skipTo. Engine destroyado per ADR-189; user precisa reconectar.
- **R-05.4** localStorage cheio (5MB+). **Mitigacao:** cap 50 items + track.audioUrl pode ser longo (signed URLs Mux). Strip `audioUrl` antes de salvar local; rebuild ao restore via `trackId` lookup endpoint (defer; documentar).

---

### RF-06 — OAuth polish (popup blocked fallback + error states UI)

**ICE:** I=4, C=4, E=2 -> 8.0 (high impact onboarding)

**O que faz.** Fix 2 friccoes OAuth: (1) popup blocked detect automatico + fallback redirect, (2) error states UI no `/spotify-callback?error=...`.

**Sub-RFs:**

#### RF-06.1 — Popup blocked fallback

- Em `client/src/lib/spotify/auth.ts:initiateSpotifyAuth`:
  - Apos `const popup = window.open(...)`:
    - **(a)** Se `popup === null` -> snapshot + redirect (sem throw).
    - **(b)** `setTimeout(() => { if (popup.closed && !resolved) {snapshot + redirect} }, 1500)` (Safari async-close).
- Snapshot helper `client/src/lib/spotify/oauthSnapshot.ts`:
  ```ts
  export function saveOAuthSnapshot(authUrl: string) {
    const queueState = JSON.parse(localStorage.getItem('audio.queue.v1') ?? '{}');
    const snapshot = {
      activeTrackId: window.__audioPlayerActiveTrackId ?? null,
      scrollY: window.scrollY,
      queueVersion: queueState.version ?? 0,
      timestamp: Date.now(),
      authUrl,
    };
    sessionStorage.setItem('spotify_oauth_snapshot', JSON.stringify(snapshot));
  }
  export function restoreOAuthSnapshot(): {scrollY: number; activeTrackId: string | null} | null {
    const raw = sessionStorage.getItem('spotify_oauth_snapshot');
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (Date.now() - s.timestamp > 10 * 60 * 1000) {  // 10min TTL (D16)
        sessionStorage.removeItem('spotify_oauth_snapshot');
        return null;
      }
      sessionStorage.removeItem('spotify_oauth_snapshot');
      return {scrollY: s.scrollY ?? 0, activeTrackId: s.activeTrackId};
    } catch { return null; }
  }
  ```
- Em `client/src/pages/spotify-callback.tsx` (existe MP2):
  - Apos OAuth success postMessage logic, tambem checa `if (window.opener === null || window.opener === window)` (= page redirect mode, nao popup). Nesse caso:
    - Call `restoreOAuthSnapshot()` -> `setTimeout(() => window.scrollTo(0, snapshot.scrollY), 100)`.
    - Redirect to `/` (home).
    - Queue auto-rehydrates via context boot reading localStorage.

#### RF-06.2 — Error states UI

- `client/src/components/audio-player/SpotifyOAuthErrorDialog.tsx`.
- Trigger: `/spotify-callback?error=<reason>` query param -> page mounts dialog open with reason mapped.
- Reason map (D17):
  - `state_mismatch` -> "Sessao expirada. Tente conectar novamente."
  - `access_denied` -> "Voce cancelou a autorizacao."
  - `invalid_grant` -> "Token Spotify invalido. Reconecte." (raro durante OAuth init mas possivel)
  - `server_error` -> "Erro do servidor Spotify. Tente em alguns minutos."
  - default -> "Erro desconhecido. Tente novamente."
- Botoes: `[Reconectar]` (chama `initiateSpotifyAuth` novamente) + `[Cancelar]` (close + redirect home).
- Telemetria: `spotify_oauth_error` com `reason` (PT-BR hash NAO necessario — reason eh enum, nao PII).
- Server side: `oauth-callback` handler ja redireciona com `?error=` em failure paths; confirmar todos os 5 reasons emitidos corretamente.

**Acceptance criteria:**
- [ ] `window.open` retornando null -> snapshot salvo em sessionStorage + `window.location.href = authUrl`.
- [ ] popup.closed em <1.5s sem postMessage -> mesmo fallback.
- [ ] sessionStorage snapshot tem fields: activeTrackId, scrollY, queueVersion, timestamp, authUrl.
- [ ] Apos callback success em mode redirect, `restoreOAuthSnapshot` chamado.
- [ ] TTL 10min: snapshot timestamp > 10min -> descartado + return null.
- [ ] `/spotify-callback?error=access_denied` -> dialog renderiza com mensagem "Voce cancelou a autorizacao."
- [ ] `[Reconectar]` chama `initiateSpotifyAuth` novamente.
- [ ] `[Cancelar]` redireciona home.
- [ ] `data-testid="spotify-oauth-error-dialog"` + `data-testid="spotify-oauth-reconnect-button"`.
- [ ] Telemetria `spotify_oauth_error` emitida 1x ao mount.
- [ ] `data-testid="spotify-oauth-error-message-<reason>"` para regex assertion.

**Estimate RF-06 total:** S (~1d).

**Dependencias:** ADR-194 (popup fallback strategy). Pode rodar paralelo a RF-01 (sem overlap).

**Riscos:**
- **R-06.1** Safari nao tem `popup.closed === true` confiavel em casos async. **Mitigacao:** timeout 1500ms (D15) + verify manual founder em Safari.
- **R-06.2** Full-page redirect perde React state (queue, activeTrack). **Mitigacao:** snapshot serializa o necessario (D16) + localStorage queue ja sobrevive ao reload.
- **R-06.3** TTL 10min muito curto se user demora autorizando. **Mitigacao:** start timer ao snapshot save (NAO ao authorize); user tem 10min de autorizacao mais ate restore.
- **R-06.4** Snapshot exposto via sessionStorage XSS. **Mitigacao:** snapshot nao contem tokens nem PII (so trackId + scrollY + timestamp + authUrl publico).

---

## 6. Requisitos Nao-Funcionais

| RNF | Spec | Validacao |
|---|---|---|
| **RNF-01** | `dnd-kit` lazy-load (chunk separado) — NAO no bundle main | `vite build --report` confirma chunk |
| **RNF-02** | Queue persistencia local: write debounce 500ms para evitar thrashing | Unit test: 10 rapid mutations -> 1 localStorage.setItem call |
| **RNF-03** | Server sync POST /api/audio/queue: timeout 3s; failures swallowed (best-effort, UI continua) | Test mock fetch 500 -> queue intact + console.warn |
| **RNF-04** | Cross-tab sync latency < 1s (storage event nativo) | Manual verify 2 tabs |
| **RNF-05** | Keyboard shortcuts `preventDefault` SO em targets nao-input | Test target = `<input>` -> `preventDefault` NOT chamado |
| **RNF-06** | OAuth snapshot TTL 10min | Unit test: Date.now() + 11min -> restore returns null |
| **RNF-07** | LessonPickerDialog transcription preview cap 80 chars + ellipsis | Test: input 200 chars -> output 81 chars (80 + `…`) |
| **RNF-08** | `data-testid` em TODOS controles novos: `mini-player-queue-button`, `queue-panel-row-*`, `lesson-picker-sort`, `spotify-oauth-error-dialog`, `shortcuts-help-popover` | Grep regex pos-merge |
| **RNF-09** | `aria-label` PT-BR dinamico em botoes estado (repeat off/all/one, shuffle on/off, sort) | Lighthouse a11y + RTL `getByLabelText` |
| **RNF-10** | Queue cap 50 items hard limit | Test: 50 adds OK, 51o rejected + toast |

---

## 7. Modelo de Dados

### 7.1. Migration 0078 — `audio_queue_snapshots` + `library_lessons.transcription_preview`

```sql
-- migrations/0078_audio_queue_and_transcription_preview.sql

-- Queue snapshots server-side (ADR-193, RF-05.6)
CREATE TABLE IF NOT EXISTS audio_queue_snapshots (
  user_id varchar PRIMARY KEY REFERENCES users(user_platform_id) ON DELETE CASCADE,
  queue_jsonb jsonb NOT NULL DEFAULT '[]'::jsonb,
  repeat_mode varchar(8) NOT NULL DEFAULT 'off' CHECK (repeat_mode IN ('off','all','one')),
  shuffle_enabled boolean NOT NULL DEFAULT false,
  shuffled_order jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamp DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE audio_queue_snapshots IS 'Sprint Mini Player 3 (ADR-193). Queue persistence server-side opcional.';

-- Library transcription preview (RF-04.2)
ALTER TABLE library_lessons
  ADD COLUMN IF NOT EXISTS transcription_preview varchar(120);

UPDATE library_lessons
SET transcription_preview = LEFT(transcription_full, 80) || '…'
WHERE transcription_full IS NOT NULL
  AND transcription_preview IS NULL
  AND LENGTH(transcription_full) > 80;

UPDATE library_lessons
SET transcription_preview = transcription_full
WHERE transcription_full IS NOT NULL
  AND transcription_preview IS NULL
  AND LENGTH(transcription_full) <= 80;

COMMENT ON COLUMN library_lessons.transcription_preview IS
  'Sprint Mini Player 3 (RF-04.2). Primeiros 80 chars do transcription_full (sem dependencia de cache live).';
```

Rollback `migrations/0078_audio_queue_and_transcription_preview_rollback.sql`:
```sql
ALTER TABLE library_lessons DROP COLUMN IF EXISTS transcription_preview;
DROP TABLE IF EXISTS audio_queue_snapshots;
```

### 7.2. Schema additions (`shared/schema.ts`)

```ts
export const audioQueueSnapshots = pgTable("audio_queue_snapshots", {
  userId: varchar("user_id").primaryKey().references(() => users.userPlatformId, { onDelete: 'cascade' }),
  queue: jsonb("queue_jsonb").$type<QueueItemPersist[]>().notNull().default([]),
  repeatMode: varchar("repeat_mode", { length: 8 }).notNull().default('off'),
  shuffleEnabled: boolean("shuffle_enabled").notNull().default(false),
  shuffledOrder: jsonb("shuffled_order").$type<string[]>(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// libraryLessons table: adicionar campo
transcriptionPreview: varchar("transcription_preview", { length: 120 }),
```

### 7.3. Tipos client

```ts
// client/src/contexts/AudioPlayerContext.tsx
interface QueueItemPersist {
  id: string;
  trackId: string;      // resolvable via lookup endpoint pra rebuild audioUrl
  source: 'library' | 'spotify';
  title: string;
  coverUrl?: string;
  courseTitle?: string;
  durationSeconds?: number;
  spotifyUri?: string;
  addedAt: number;
}
```

Note: persist NAO inclui `audioUrl` (signed URL Mux expira; rebuild on `playTrack` via lookup). **Trade-off:** `playTrack` da queue precisa de fetch para rebuild URL = latencia +200-500ms primeiro play apos restore. Acceptable; documentar known limitation (R-05.4).

---

## 8. Endpoints

### 8.1. Backend novos

| Endpoint | Auth | Body | Resposta | RF / ADR |
|---|---|---|---|---|
| `POST /api/audio/queue` | JWT | `{queue, repeatMode, shuffleEnabled, shuffledOrder, version}` | `{accepted: true, version}` | RF-05.5 / ADR-193 |
| `GET /api/audio/queue` | JWT | — | `{queue, repeatMode, shuffleEnabled, shuffledOrder, version, updatedAt}` ou `404 {message}` se vazio | RF-05.5 |

### 8.2. Backend modificados

| Endpoint | Mudanca | RF |
|---|---|---|
| `POST /api/audio/spotify/refresh` | Detect `body.error === 'invalid_grant'` -> `markSpotifyDisconnected` + 401 | RF-01 |
| `GET /api/library/courses/:slug` | Response estendida com `lesson.transcriptionPreview` | RF-04 |

### 8.3. Backend reusados sem mudanca

| Endpoint | Uso |
|---|---|
| `POST /api/audio/spotify/oauth-init` | RF-06 (sem mudanca server-side) |
| `GET /api/audio/spotify/oauth-callback` | RF-06 (server ja emite `?error=...` em failure paths; verificar mapeamento completo) |
| `POST /api/user-activity` | Telemetria `spotify_oauth_error` |

---

## 9. Diagrama Mermaid (alto-nivel)

```mermaid
flowchart TB
    User[User Action] --> Ctx[AudioPlayerContext]
    Ctx --> Engine[AudioSourceEngine]
    Engine --> Driver[HtmlAudio OU Spotify Driver]

    Ctx -.->|queue mutation| LS1[(localStorage<br/>audio.queue.v1)]
    Ctx -.->|debounce 500ms| ServerQ[POST /api/audio/queue]

    Tab2[Tab 2 mutation] -->|storage event| Ctx

    MiniBar[MiniPlayerBar] --> QueueBtn[Queue Button]
    QueueBtn --> QPanel[QueuePanel Radix Popover]
    QPanel -->|drag-end| Ctx
    QPanel -->|skip| Ctx
    QPanel -->|repeat/shuffle| Ctx

    MiniBar -.->|keydown J/L/0-9/Up/Down/?| ShortHandler[Keyboard Handler]
    ShortHandler --> Ctx

    PickerDlg[LessonPickerDialog] -.->|sort change| LS2[(localStorage<br/>lessonPicker.sortBy)]
    PickerDlg --> ServerL[GET /api/library/courses/:slug]
    ServerL -.->|transcriptionPreview| PickerDlg

    OAuth[initiateSpotifyAuth] -->|window.open null OR closed<1.5s| Snap[saveOAuthSnapshot]
    Snap --> SS[(sessionStorage<br/>spotify_oauth_snapshot)]
    Snap --> Redirect[window.location = authUrl]
    CallbackPg[/spotify-callback] -->|restoreOAuthSnapshot| SS
    CallbackPg -->|?error=...| ErrDialog[SpotifyOAuthErrorDialog]

    style QPanel fill:#fef3c7
    style ShortHandler fill:#dbeafe
    style ErrDialog fill:#fce7f3
    style PickerDlg fill:#dcfce7
```

---

## 10. Q&A — Decisoes para Arquiteto/Implementer

Levantadas pelo pm-spec. **system-architect resolveu todas em 2026-05-22 via ADRs 192-195 + defaults D1-D17.** Implementer segue defaults.

| Q | Status | Resolucao final | ADR / Default |
|---|---|---|---|
| **Q-A** | RESOLVIDA | Radix Popover acima do bar | D9 |
| **Q-B** | RESOLVIDA | Optimistic UI + POST best-effort + LWW por `version` | D11 + ADR-193 |
| **Q-C** | RESOLVIDA | TanStack staleTime 5min | D7 |
| **Q-D** | RESOLVIDA | localStorage key `lessonPicker.sortBy` ('recente'\|'alfabetico'\|'duracao'); fallback `recente` em parse invalido | D8 |
| **Q-E** | RESOLVIDA | Tooltips por controle (MP1 mantido) + `?` Popover compact | D5 + ADR-195 |
| **Q-F** | RESOLVIDA | sessionStorage snapshot TTL 10min; timer comeca em `snapshot.timestamp` (proactive save antes de `window.open`) | D16 + ADR-194 |
| **Q-G** | RESOLVIDA | 3 estados (off/all/one) | D12 + ADR-193 |
| **Q-H** | RESOLVIDA | Fisher-Yates pre-computed em `shuffledOrder: string[]` | D13 + ADR-193 |
| **Q-I** | RESOLVIDA | Placeholder com 1a letra do titulo (`<div w-12 h-12 bg-gray-700>{title[0]}</div>`) | D6 |
| **Q-J** | RESOLVIDA | Pre-load batch via `GET /api/library/courses/:slug` estendido com `transcriptionPreview` por lesson | D7 + RF-04.2 |
| **Q-K** | RESOLVIDA | Snap (unmount conditional render) | D2 |
| **Q-L** | RESOLVIDA | Tooltip + `?` Popover; menu /help dedicado defer MP4 | D5 + ADR-195 |
| **Q-M** | RESOLVIDA | `body.error === 'invalid_grant'` apos `await resp.json().catch(() => null)`. Non-JSON body cai no path generico (incrementa + 502). | D1 + RF-01.1 |
| **Q-N** | RESOLVIDA | Strip `audioUrl` no persist; rebuild on play via lookup (latency 200-500ms aceitavel) | R-05.4 + ADR-193 |

---

## 11. Cenarios de Teste Derivados

### 11.1. Happy Paths

- [ ] **RF-01 happy:** Refresh 400 com `body.error='invalid_grant'` -> 401 + markDisconnected + clearCookie.
- [ ] **RF-02 happy:** activeTrack source switches library -> spotify -> select `mini-player-speed` desaparece; switches spotify -> library -> select reaparece.
- [ ] **RF-03 happy:** Press `J` -> skipBack(10); press `L` -> skipForward(10); press `5` em duration=600 -> seek(300); press `Up` -> volume + 0.1; press `?` -> Popover renderiza.
- [ ] **RF-04 happy:** Open LessonPickerDialog -> 5 lessons mostram capa + duracao 12:34 + preview `"Neste video, vamos cobrir 3-bet OOP na BB vs CO em zoom 100bb..."` (80 chars + ellipsis); muda sort para duracao -> reorder; reload -> sort persistido.
- [ ] **RF-05 happy:** Add 3 lessons via biblioteca -> queue panel mostra 3 items; drag-reorder item 2 -> 0 -> queue refletida; toggle shuffle -> shuffledOrder gerado; toggle repeat all -> ao fim, volta primeiro; reload page -> queue restaurado.
- [ ] **RF-06 happy popup blocked:** mock `window.open` -> null -> snapshot salvo + `window.location.href` chamado com authUrl.
- [ ] **RF-06 happy error states:** `/spotify-callback?error=access_denied` -> dialog renderiza com "Voce cancelou a autorizacao" + botoes Reconectar/Cancelar.

### 11.2. Validacao de Input

- [ ] **RF-04:** Sort value invalido em localStorage -> fallback `recente`.
- [ ] **RF-05:** `addToQueue` com track invalido (no id) -> rejected; queue intact.
- [ ] **RF-05:** `reorderQueue(fromIdx=5, toIdx=10)` em queue de 3 items -> rejected (out of bounds).
- [ ] **RF-05:** server POST queue com payload invalido (queue nao array) -> 400.
- [ ] **RF-06:** OAuth snapshot com timestamp > 10min -> restore returns null + sessionStorage cleared.

### 11.3. Regras de Negocio

- [ ] **RF-01:** Outros 400s (sem `error: 'invalid_grant'`) seguem path generico (incrementa + 502).
- [ ] **RF-01:** 502 transient (sem body.error) NAO chama markDisconnected.
- [ ] **RF-03:** pathname=`/admin/dashboard` -> NENHUM shortcut dispara.
- [ ] **RF-03:** target=`<input>` -> NENHUM shortcut dispara.
- [ ] **RF-05:** queue cap 50 -> 51o addToQueue rejected + toast warning.
- [ ] **RF-05:** `repeatMode='one'` -> tryAutoplayNext seek(0) + play (mesmo track, NAO avanca).

### 11.4. Edge Cases

- [ ] **RF-01:** `resp.json()` throw (body nao-JSON) -> fallback path generico (incrementa + 502), NAO markDisconnected.
- [ ] **RF-02:** activeTrack null -> select nao renderiza (regra MP1 inalterada).
- [ ] **RF-03:** Press `5` em durationSeconds=0 -> seek NAO chamado (ignora).
- [ ] **RF-03:** Press `ArrowUp` quando volume=1.0 -> volume permanece 1.0 (clamp).
- [ ] **RF-04:** Lesson com transcription_full=null -> preview rendered como `'—'`.
- [ ] **RF-04:** Lesson sem coverUrl -> placeholder com primeira letra do titulo.
- [ ] **RF-05:** Toggle shuffle ON com queue vazia -> shuffledOrder = `[]` (no error).
- [ ] **RF-05:** Cross-tab: tab 1 muda queue + tab 2 muda queue simultaneo -> ultimo write wins (version higher).
- [ ] **RF-05:** Server `POST /api/audio/queue` timeout 3s -> swallowed + console.warn; queue local intacto.
- [ ] **RF-05:** localStorage `audio.queue.v1` corrupt (parse JSON throw) -> fallback `[]` + clear key.
- [ ] **RF-05:** dnd-kit lazy load falha (network error) -> ErrorBoundary fallback lista nao-drag.
- [ ] **RF-06:** popup.closed em 1.4s sem postMessage -> fallback dispara (just under threshold).
- [ ] **RF-06:** popup.closed em 1.6s sem postMessage -> NAO dispara fallback (just over threshold; user manualmente fechou popup tarde).
- [ ] **RF-06:** snapshot save quando localStorage `audio.queue.v1` ausente -> queueVersion=0 fallback.

---

## 12. Riscos + Mitigacoes Consolidados

| Risco | Severidade | Mitigacao |
|---|---|---|
| RF-01 outros consumers leem failure_count esperam increment | LOW | Grep + revisar; markDisconnected likely zera ou nao consultado em queries publicas |
| RF-02 CLS layout shift hide speed mid-session | LOW | Snap aceitavel; verify manual |
| RF-03 conflito ArrowUp/Down outras paginas | MEDIUM | stopPropagation + admin gate; documentar known limitation |
| RF-03 `?` key conflito layout PT-BR | LOW | check `e.key === '?'` cobre layouts |
| RF-04 transcription_full ausente lessons antigas | LOW | Fallback `'—'` |
| RF-04 sort por duracao com nulls | LOW | Number.MAX_SAFE_INTEGER fallback |
| RF-05 dnd-kit lazy slow first interaction | MEDIUM | Prefetch on hover + ErrorBoundary fallback |
| RF-05 cross-tab race | MEDIUM | version field + last-write-wins; known limitation acceptable |
| RF-05 localStorage cheio (>5MB) | LOW | Cap 50 items + strip audioUrl |
| RF-05 server sync 500 frequente | LOW | Best-effort + swallow + UI continua |
| RF-05 Spotify track na queue + driver desconectado | MEDIUM | Badge "Spotify desconectado" + disable skipTo |
| RF-06 Safari popup.closed unreliable | MEDIUM | 1.5s timeout + verify manual Safari |
| RF-06 full-page redirect perde React state | LOW | Snapshot + localStorage queue ja sobrevive |
| RF-06 TTL 10min muito curto | LOW | Timer start ao snapshot save, nao authorize |

---

## 13. Fora de Escopo

- **Mobile responsive Queue UI** — defer MP3.1.
- **`audio_focus_lost` telemetria** — ADR-192 deferred (no caller).
- **Reflect.construct refactor** INFO-3 MP2 — defer MP3.1.
- **Cross-device queue sync** (Spotify `playback_state`) — MP4.
- **Equalizer / Lyrics / Voice control** — MP4+, sem demanda persona.
- **Floating icon position** — sem demanda.
- **Speed presets revamp** — slider cobre 80% valor + RF-02 hide.
- **Custom sleep timer duration slider** — defer MP4.
- **Resume-after-Coach** ("ao terminar lesson, retoma Spotify") — defer MP4.
- **Queue server-side audioUrl rebuild** — defer MP3.1 (trade-off documentado R-05.4).
- **Menu /help shortcuts dedicado** — defer (tooltip + `?` Popover bastam).

---

## 14. Dependencias Externas

- `@dnd-kit/core` + `@dnd-kit/sortable` (instalar via `npm install`, lazy import). Tamanho ~30KB gzipped.
- Spotify Developer Dashboard: redirect URIs ja registradas (MP2).
- Sem novas env vars.

---

## 15. Verify Manual Pos-Merge (Founder)

Checklist sequential apos merge `feature/mini-player-3`:

1. **RF-01 invalid_grant**
   - [ ] Conectar Spotify Premium account.
   - [ ] Em https://accounts.spotify.com/account/apps -> revogar acesso ao Grindfy.
   - [ ] Voltar pro Grindfy + aguardar refresh proativo (5min antes expiry) OU forcar via DevTools `await fetch('/api/audio/spotify/refresh', {method:'POST'})`.
   - [ ] Verificar: response 401 + cookie spotify_session cleared + UI mostra "Spotify desconectou. Reconectar?".

2. **RF-02 hide speed Spotify**
   - [ ] Tocar lesson Coach (HtmlAudio) -> ver dropdown speed.
   - [ ] Conectar Spotify + tocar musica Spotify (hypotetico botao future) -> dropdown speed desaparece.
   - [ ] Trocar back para HtmlAudio -> dropdown reaparece.

3. **RF-03 keyboard shortcuts**
   - [ ] Press `J` em /grade-planner -> skipBack(10) (audio recua 10s).
   - [ ] Press `L` -> skipForward(10).
   - [ ] Press `5` em lesson 30min -> seek pra 15min mark.
   - [ ] Press `0` -> seek 0.
   - [ ] Press `9` -> seek 90%.
   - [ ] Press `ArrowUp` -> volume +0.1.
   - [ ] Press `ArrowDown` -> volume -0.1.
   - [ ] Press `?` -> Popover shortcuts compact.
   - [ ] Navegar pra /admin/dashboard -> press `J`/`L`/`5` -> nada acontece.
   - [ ] Click em `<input>` search box + press `J` -> nada acontece + texto J digitado normal.
   - [ ] Shortcuts MP1 (Space, ArrowLeft -15s, ArrowRight +15s, M, Esc) continuam funcionando.

4. **RF-04 library metadata**
   - [ ] Abrir LessonPickerDialog em /grade-planner.
   - [ ] Lessons mostram capa thumbnail; lessons sem coverUrl mostram placeholder cinza com 1a letra.
   - [ ] Duracao formatted (12:34 ou 1:05:30).
   - [ ] Preview transcricao 80 chars + ellipsis (`...` ou `…`).
   - [ ] Sort dropdown -> trocar para "Duracao" -> lessons reordenam ascending.
   - [ ] Reload page -> abrir dialog -> sort permanece "Duracao".
   - [ ] Sort "Alfabetico" -> ordem ABC.

5. **RF-05 queue UI**
   - [ ] Click `mini-player-queue-button` -> Popover panel abre.
   - [ ] Empty state texto correto quando vazio.
   - [ ] Add 5 lessons via LessonPickerDialog (botao "Adicionar a fila" — assumindo add-to-queue button no LessonPickerDialog).
   - [ ] QueuePanel mostra 5 items com capa + titulo + duracao + drag handle.
   - [ ] Drag item 3 -> posicao 0 -> queue reordenada.
   - [ ] Click skip button (►) em item 4 -> playTrack(item.track) + items anteriores removidos.
   - [ ] Click X em item 2 -> remove.
   - [ ] Toggle Shuffle ON -> shuffledOrder gerado (visual: ordem aparente shuffled na lista? OU mantem visual + autoplay segue shuffle?).
   - [ ] Toggle Repeat 3x (off -> all -> one -> off).
   - [ ] Click Clear All -> confirm modal -> confirm -> queue vazia.
   - [ ] Add 50 items -> OK; 51o item -> toast warning + reject.
   - [ ] Reload page -> queue restaurada (5 items remanescentes).
   - [ ] Abrir 2a aba Grindfy -> remover item da queue na aba 1 -> aba 2 atualiza em <1s.
   - [ ] DevTools Network: ver POST /api/audio/queue chamado debounce 500ms apos mutation.

6. **RF-06 OAuth polish**
   - [ ] Em DevTools, Application > Site settings > Pop-ups and redirects -> Block para spotify.com.
   - [ ] Click "Conectar Spotify" em /coach-ai Preferencias -> popup blocked detected -> full-page redirect pra accounts.spotify.com.
   - [ ] Autorizar -> redirect callback -> volta home -> scroll position restaurado (verify manual com scroll mid-page antes).
   - [ ] Em outro test: clicar "Conectar Spotify" -> NO popup OAuth, clicar "Cancel" no Spotify -> redirect `/spotify-callback?error=access_denied` -> dialog mostra "Voce cancelou a autorizacao" + botao [Reconectar].
   - [ ] Click [Reconectar] -> initiateSpotifyAuth disparado novamente.
   - [ ] Click [Cancelar] -> redirect home.

---

## 16. Dependencias com Sprints Anteriores

- **MP1** (RF-06 AudioSourceEngine, RF-07 AudioPlayerContext) — base.
- **MP1.1** (RF-02 sanitizeCoverUrl) — usado em RF-04 capa thumbnail + RF-05 QueueRow.
- **MP1.2** (RF-01 ErrorBoundary local lesson #29) — pattern aplicado em RF-05 (dnd-kit lazy fail) e RF-06 (callback restore).
- **MP1.3** (MEDIUM-1 "sem silent no-op") — D17 OAuth error states reforca.
- **MP2** (RF-01 SpotifyAudioDriver real + RF-NEW Sleep Timer + 4 endpoints `/api/audio/spotify/*` + cookie httpOnly) — base obrigatoria RF-01 + RF-06.
- **biblioteca-enrich** (helper `createLocalStorageState`) — reutilizado RF-04.3 + RF-05.5.

---

## 17. Notas de Implementacao

### Code organization

**Client:**
- `client/src/lib/audio-engine/formatDuration.ts` (RF-04.1, novo)
- `client/src/lib/spotify/oauthSnapshot.ts` (RF-06.1, novo)
- `client/src/components/audio-player/QueuePanel.tsx` (RF-05, novo)
- `client/src/components/audio-player/QueueRow.tsx` (RF-05, novo)
- `client/src/components/audio-player/ShortcutsHelpPopover.tsx` (RF-03.4, novo)
- `client/src/components/audio-player/SpotifyOAuthErrorDialog.tsx` (RF-06.2, novo)
- `client/src/components/audio-player/MiniPlayerBar.tsx` (RF-02 + RF-03 + RF-05 trigger)
- `client/src/components/audio-player/LessonPickerDialog.tsx` (RF-04)
- `client/src/contexts/AudioPlayerContext.tsx` (RF-03 setVolume + RF-05 queue state)
- `client/src/pages/spotify-callback.tsx` (RF-06.1 + RF-06.2 restore + error rendering)
- `client/src/lib/spotify/auth.ts` (RF-06.1 fallback detection)

**Server:**
- `server/routes/spotifyAudio.ts` (RF-01 invalid_grant fast-path)
- `server/routes/audioQueue.ts` (RF-05.5, novo — POST + GET `/api/audio/queue`)
- `server/routes/library.ts` (RF-04 estender lessons response com transcriptionPreview)
- `server/storage.ts` (RF-05 audioQueueSnapshots queries; RF-04 lessons join/select)
- `migrations/0078_audio_queue_and_transcription_preview.sql` + rollback

**Schema (`shared/schema.ts`):**
- `audioQueueSnapshots` pgTable (RF-05.6)
- `libraryLessons.transcriptionPreview` campo (RF-04.2)
- Zod schemas para POST `/api/audio/queue` payload

### Test setup additions

- Mock `window.scrollTo` em jsdom para RF-06.1 restore.
- Mock `sessionStorage` em jsdom (ja existe MP1.2 lesson #15 via setup.ts MemoryStorage).
- Mock `@dnd-kit/core` + `@dnd-kit/sortable` em testes que precisam (lesson #14 — use `await import()` NAO `require()` em test `.tsx`).
- `vi.mocked(navigator).pathname` setup ja existe; reusar em RF-03 admin route gate tests.
- Spotify SDK NAO precisa novos mocks (MP2 ja cobre).

### Implementer order recommended

1. **(paralelo A)** RF-01 backend `invalid_grant` fast-path + test update (1d).
2. **(paralelo A)** RF-02 hide speed select (2h).
3. **(paralelo A)** RF-03 keyboard shortcuts expansion (2d).
4. **(paralelo B)** Migration 0078 + schema additions (3h).
5. **(paralelo B)** RF-04 storage estendido + endpoint + LessonPickerDialog UI (2d).
6. **(serial)** RF-05.1 context surface + types (4h).
7. **(serial)** RF-05.6 backend `/api/audio/queue` endpoints (4h).
8. **(serial)** RF-05.5 localStorage persistencia + cross-tab listener (4h).
9. **(serial)** RF-05.2 QueuePanel + QueueRow components (1d).
10. **(serial)** RF-05.3 dnd-kit lazy integration + ErrorBoundary fallback (4h).
11. **(serial)** RF-05.4 repeat + shuffle integration `tryAutoplayNext` (4h).
12. **(paralelo C)** RF-06.1 popup blocked fallback + snapshot helpers (4h).
13. **(paralelo C)** RF-06.2 error states dialog + spotify-callback page extension (4h).
14. /simplify pos-implementer.
15. reviewer R1 + fix wave.

---

## 18. Resumo de Numeracao Reservada

### ADRs previstos (system-architect cria)

- **ADR-192** — `192-audio-focus-lost-deferred.md` — Telemetria `audio_focus_lost` deferred (over-engineering, no caller).
- **ADR-193** — `193-audio-queue-persistence-model.md` — Queue model (local primario + server best-effort + cross-tab storage event + cap 50).
- **ADR-194** — `194-spotify-oauth-popup-fallback.md` — Popup blocked detection + sessionStorage snapshot + redirect fallback + TTL 10min.
- **ADR-195** — `195-mini-player-keyboard-shortcuts-contract.md` — Shortcuts contract: alvo audio controls, gate admin routes + interactive targets, `?` Popover.

### Migrations

- **0078** — `migrations/0078_audio_queue_and_transcription_preview.sql` (+ `_rollback.sql`)
  - CREATE TABLE `audio_queue_snapshots` (RF-05.6)
  - ALTER TABLE `library_lessons` ADD COLUMN `transcription_preview` (RF-04.2) + backfill UPDATE.

### Diagramas Mermaid previstos (`Docs/architecture/diagrams/mini-player-3/`)

- `queue-ui-component-tree.mermaid` — Component hierarchy QueuePanel + QueueRow + dnd-kit + Context surface.
- `oauth-popup-fallback-sequence.mermaid` — popup OK vs popup blocked: detect -> snapshot -> redirect -> callback -> restore.
- `keyboard-shortcuts-dispatch-flow.mermaid` — keydown -> isInteractiveTarget? -> isAdminRoute? -> map key -> dispatch action -> AudioPlayerContext.

### Files novos previstos pelo implementer (resumo)

**Client (8 novos):**
- `client/src/lib/audio-engine/formatDuration.ts`
- `client/src/lib/spotify/oauthSnapshot.ts`
- `client/src/components/audio-player/QueuePanel.tsx`
- `client/src/components/audio-player/QueueRow.tsx`
- `client/src/components/audio-player/ShortcutsHelpPopover.tsx`
- `client/src/components/audio-player/SpotifyOAuthErrorDialog.tsx`

**Server (1 novo):**
- `server/routes/audioQueue.ts`

**Env vars novas:** Nenhuma.

**Deps novas:** `@dnd-kit/core` + `@dnd-kit/sortable` (lazy import).

---

## 19. Aprovacao

**Founder:** AFK liberou autonomia total para defaults D1-D17.
**Arquiteto:** **DONE** (2026-05-22) — criados ADRs 192/193/194/195 + 3 diagramas em `Docs/architecture/diagrams/mini-player-3/` + Q-A..Q-N RESOLVIDAS. Migration 0078 plan confirmado (dupla: `audio_queue_snapshots` + `library_lessons.transcription_preview`).
**Proximo agente:** **test-writer** (red phase, baseado nos 6 RFs + 11.x cenarios derivados).
**Pipeline:** pm-spec (**DONE**) -> system-architect (**DONE**) -> test-writer -> implementer -> /simplify -> reviewer -> commit.

### Override de defaults

Nenhum default critico depende de override; founder AFK total. Strategist ja travou:
- 6 itens em escopo (ordem ICE).
- #11 mobile DEFER MP3.1.
- audio_focus_lost DESCARTADA (ADR-192 deferred).
- OAuth fallback automatico (ADR-194).
- Cross-device + Equalizer/Lyrics/Voice DEFER MP4+.
