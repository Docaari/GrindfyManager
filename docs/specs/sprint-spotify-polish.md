# Spec: Sprint Spotify Polish — UI/UX Refinement

## Status
Proposta

## Resumo
Refinamento de **UI/UX** da integração Spotify no Mini Player, que já está 100%
funcional (conectar + buscar + playlists + playback via Web Playback SDK shipped
na `main`). Esta spec é **só polish**: corrige o count "(0 tracks)" das playlists,
completa o now-playing (capa/título/**artista**) do player, padroniza estados de
busca (loading/vazio/erro) com o design system, e limpa o console (a11y Radix +
logs de diagnóstico gateados a DEV). **NÃO** adiciona features novas nem toca no
core funcional que já funciona.

## Contexto
O pipeline E2E (`sprint-spotify-e2e.md`, ADR-220) entregou o playback real. Em
uso ao vivo surgiram 4 pontos de fricção de UX/console que não bloqueiam função,
mas degradam a percepção de qualidade:

1. **Playlists mostram "(0 tracks)"** antes de abrir, porque o Spotify
   `/me/playlists` passou a devolver `tracks.total` ausente/0 (mudança de API
   2026). O server mapeia `trackCount: pl.tracks?.total ?? 0`
   (`server/routes/spotifyAudio.ts:704`) e o client renderiza `{pl.trackCount}
   tracks` incondicionalmente (`SpotifySearchDialog.tsx:655`) → "0 tracks".
2. **Now-playing incompleto para Spotify:** o tipo `AudioTrack`
   (`client/src/lib/audio-engine/types.ts:7`) **não tem campo de artista**; os
   call sites de `playTrack` em `SpotifySearchDialog` passam só `title`/`coverUrl`/
   `durationSeconds` (descartam `artists` que o server já retorna). MiniPlayerBar
   e ExpandedPlayerDialog mostram `title` + `courseTitle` (este é `null` para
   Spotify) → a barra fica sem a linha de artista.
3. **Busca inconsistente:** `SearchPanel` tem skeleton + empty + banners 401/429,
   mas **não tem** estado de erro genérico com retry, e o `PlaylistsPanel` usa
   texto "Carregando..." (linha 582/619) em vez dos skeletons usados na busca —
   inconsistência visual. Faltam tokens do design system.
4. **Console poluído:** `SpotifySearchDialog` e `ExpandedPlayerDialog` montam
   `DialogPrimitive.Content` **sem** `aria-describedby`/`<Dialog.Description>` →
   warning Radix `Missing Description or aria-describedby for {DialogContent}`. O
   `SpotifyAudioDriver.ts` tem `console.info` (linha 281) e `console.error` de
   diagnóstico não gateados → poluem produção.

Esta spec é **correção cosmética + a11y + housekeeping**. Preservar os 77+ testes
spotify-e2e verdes e o fix do `fetch.bind(globalThis)` (RF-06 / não-regressão).

## Usuários
- **Jogador (Premium, conectado):** vê playlists com count correto (ou sem count
  ruidoso), now-playing completo (capa + título + artista), busca com estados
  claros. Console limpo (sem warnings).
- **Dev/founder:** em DEV, ainda vê os logs de diagnóstico do driver (erro real
  visível — lesson #9); em produção, console limpo.

## Pré-requisitos confirmados (ground-truth — NÃO re-implementar)
- Playback via Web Playback SDK funcional (ADR-220 shipped).
- Server retorna `artists: string[]` + `durationSec` em search
  (`spotifyAudio.ts:687`) e em playlist tracks (mesmo mapeamento) — **o dado já
  existe**, é perdido na fronteira dialog→`playTrack`.
- Server retorna `ListPlaylistsResponse.total` e cada `SpotifyPlaylist.trackCount`
  (derivado de `pl.tracks?.total`).
- `mapAudioErrorToMessage` (`errorMessages.ts`) é o mapeador PT-BR canônico de
  erros de áudio — reusar para mensagens de erro.
- `sanitizeSpotifyCoverUrl` é o sanitizador canônico de capas SCDN.
- `DialogContent` shadcn (`client/src/components/ui/dialog.tsx`) é forwardRef sobre
  `DialogPrimitive.Content` — mas os dialogs Spotify usam `DialogPrimitive.*`
  **direto** (não o wrapper shadcn), por isso não herdam Description automática.

---

## Requisitos Funcionais

### RF-01: Playlist track count correto (esconder "0 tracks")
**Descrição:** O card de playlist na lista (`PlaylistsPanel`) não deve exibir
"0 tracks" quando o total é desconhecido (`tracks.total` ausente/0). Mostrar o
count só quando confiável; caso contrário, omitir ou usar rótulo neutro.

**Regras de negócio:**
- O server deve distinguir "0 tracks (conhecido)" de "total desconhecido". Hoje
  `trackCount: pl.tracks?.total ?? 0` colapsa ambos em `0`. Mudar o mapeamento
  para preservar a distinção: `trackCount: pl.tracks?.total ?? null` (campo passa
  a `number | null`) — `null` = desconhecido, `0` = vazia comprovada.
- `SpotifyPlaylist.trackCount` no client vira `number | null` (atualizar interface
  em `spotifyApiClient.ts`).
- Renderização no card (`SpotifySearchDialog.tsx` PlaylistsPanel):
  - `trackCount === null` (desconhecido) → **OMITIR** a linha de count
    (decisão do founder: omitir, **não** rótulo neutro).
  - `trackCount === 0` → `"Sem faixas"` (vazia comprovada).
  - `trackCount > 0` → `"{n} faixas"` (PT-BR: "faixas", não "tracks").
- **Não** fazer N requests extras de `/items?total` por playlist só para o count
  (custo de rate limit). O count real aparece no drill-in via
  `ListPlaylistTracksResponse.total`. **Decisão (D1):** preferir omitir count
  desconhecido na lista; mostrar o total real só no drill-in. Buscar count via
  `/items total` por playlist fica **fora de escopo** (custo > benefício).

**Critério de aceitação:**
- [ ] Playlist com `tracks.total` undefined → card **não** mostra "0 tracks" nem
      "0 faixas" — a linha de count é **omitida** (sem rótulo neutro).
- [ ] Playlist com `tracks.total === 0` → mostra "Sem faixas".
- [ ] Playlist com `tracks.total === 25` → mostra "25 faixas".
- [ ] Server: `mapPlaylist` retorna `trackCount: null` quando `pl.tracks?.total`
      é `undefined`; `0` quando explicitamente `0`; o número quando presente.
- [ ] Drill-in continua mostrando as faixas reais (não regredir).

### RF-02: Loading / vazio / erro no drill-in e lista de playlists
**Descrição:** Padronizar os estados de carregamento da aba Playlists com os
skeletons usados na busca; adicionar empty/erro consistentes.

**Regras de negócio:**
- Lista de playlists (`listQ.isLoading`): trocar o texto "Carregando..." por
  skeletons (mesma estrutura `animate-pulse` da busca — N linhas placeholder).
- Drill-in (`drillQ.isLoading`): idem, skeletons no lugar de "Carregando...".
- Empty da lista (`!playlists.length`): manter mensagem, mas usar tokens/estilo
  consistente ("Você não tem playlists." → com ícone, padrão dos CTAs).
- Erro (`listQ.error` / `drillQ.error`, status ≠ 401/429): exibir bloco de erro
  PT-BR + botão "Tentar novamente" que chama `refetch()`. Reusar a mensagem via
  `mapAudioErrorToMessage` quando aplicável, ou mensagem genérica
  "Não foi possível carregar as playlists.".
- Manter `ReconnectCTA` (401) e `RateLimitBanner` (429) já existentes.

**Critério de aceitação:**
- [ ] Lista de playlists em loading mostra skeletons (`data-testid="playlist-list-skeleton"`),
      não o texto "Carregando...".
- [ ] Drill-in em loading mostra skeletons (`data-testid="playlist-tracks-skeleton"`).
- [ ] Erro de rede na lista → bloco de erro PT-BR + botão
      `data-testid="playlist-list-retry"` que dispara `refetch`.
- [ ] Erro de rede no drill-in → idem (`data-testid="playlist-tracks-retry"`).
- [ ] 401 ainda mostra `ReconnectCTA`; 429 ainda mostra `RateLimitBanner`.

### RF-03: Now-playing completo (capa + título + artista) para Spotify
**Descrição:** Quando toca um track Spotify, MiniPlayerBar e ExpandedPlayerDialog
devem mostrar **capa + título + artista** do track. Hoje o artista some.

**Regras de negócio:**
- Adicionar campo opcional `artist?: string | null` ao tipo `AudioTrack`
  (`types.ts`). Opcional → não quebra os call sites library (lesson #7: optional,
  não required).
- Nos call sites de `playTrack`/`addToQueue` em `SpotifySearchDialog`
  (`onPlay`/`onAdd`/`onPlayAll`/`onAddAll`), passar `artist: track.artists.join(", ")`
  (o `SpotifyTrack.artists` já vem do server — só estava sendo descartado).
- MiniPlayerBar (bloco now-playing, ~linha 462): exibir a linha secundária com
  precedência `activeTrack.artist ?? activeTrack.courseTitle ?? ""` (Spotify usa
  artist; library usa courseTitle). Não renderizar linha vazia.
- ExpandedPlayerDialog (`expanded-course-context`, ~linha 302): idem — quando
  `activeTrack.source === 'spotify'`, mostrar `artist` no lugar de
  `courseTitle/moduleTitle`.
- Capa: já usa `sanitizeCoverUrl`/`sanitizeSpotifyCoverUrl` — garantir que a capa
  do álbum (`coverUrl` do track) chega ao `activeTrack` (já chega via `playTrack`).
- Sincronização posição/duração/play-pause já vem do `player_state_changed` (driver
  shipped, RF-01.5 do E2E) — **não** re-implementar; apenas garantir que a UI
  consome `currentSeconds`/`durationSeconds`/`isPlaying` para Spotify (já consome).
- Transição suave: capa com `animate-pulse-subtle` quando `isPlaying` (já existe);
  garantir que troca de faixa Spotify não pisca estado vazio (manter
  `activeTrack` durante a transição — comportamento atual preservado).

**Critério de aceitação:**
- [ ] `AudioTrack.artist` existe como campo opcional; build/tsc verde.
- [ ] Tocar um track Spotify via busca → MiniPlayerBar mostra capa + título +
      **artista** (linha secundária = artista, não vazia).
- [ ] ExpandedPlayerDialog para track Spotify mostra artista na linha de contexto.
- [ ] Track de library (sem `artist`) continua mostrando `courseTitle` (não
      regride).
- [ ] `onPlay`/`onAdd`/`onPlayAll`/`onAddAll` passam `artist` derivado de
      `track.artists.join(", ")`.
- [ ] Scrubber/tempo/play-pause continuam refletindo o estado do SDK (não tocar).

### RF-04: Busca — estado de erro genérico + consistência visual
**Descrição:** `SearchPanel` deve tratar erro genérico (status ≠ 401/429) com
mensagem PT-BR + retry, e alinhar o visual (skeletons, empty, input) aos tokens
do design system.

**Regras de negócio:**
- Manter debounce 500ms + `enabled` min 2 chars (não mexer na lógica que os testes
  cobrem).
- Adicionar estado de erro genérico: quando `result.error` e `errorStatus` não é
  401 nem 429 → bloco de erro PT-BR ("Não foi possível buscar agora.") + botão
  `data-testid="spotify-search-retry"` que chama `result.refetch()`.
- Empty state (`result.data?.tracks?.length === 0`): manter, mas com tom do design
  system (ícone + mensagem), `data-testid="spotify-search-empty"`.
- Skeletons: manter os existentes; aplicar tokens de cor/spacing de
  `@/lib/ui-tokens` onde houver classes hardcoded equivalentes.
- Preview HTML5 30s: preservar (não tocar — só garantir consistência visual do
  controle `<audio>`).
- Mensagens em PT-BR; sem strings em inglês visíveis ("tracks" → "faixas").

**Critério de aceitação:**
- [ ] Erro de rede na busca (status 500) → bloco PT-BR + botão retry que refaz a
      query.
- [ ] 0 resultados → empty state com `data-testid="spotify-search-empty"`.
- [ ] N keystrokes rápidos → 1 request após debounce (comportamento atual
      preservado).
- [ ] Nenhuma string "tracks" visível na UI Spotify (substituída por "faixas").
- [ ] 401 ainda mostra `ReconnectCTA`; 429 ainda mostra `RateLimitBanner`.

### RF-05: A11y — `aria-describedby`/`Description` em todos os dialogs Spotify
**Descrição:** Eliminar o warning Radix `Missing Description or aria-describedby
for {DialogContent}` em **todos** os dialogs Spotify que usam `DialogPrimitive.*`
direto.

**Regras de negócio:**
- `SpotifySearchDialog` (`DialogPrimitive.Content`, ~linha 772): adicionar
  `<DialogPrimitive.Description className="sr-only">` com texto descritivo
  ("Busque faixas e playlists do seu Spotify.") **ou** `aria-describedby` apontando
  para um id de descrição. Já tem `DialogPrimitive.Title` ("Spotify").
- `ExpandedPlayerDialog` (`DialogPrimitive.Content`, ~linha 244): tem Title
  sr-only mas **sem** Description — adicionar `<DialogPrimitive.Description
  className="sr-only">` ("Player expandido com controles e fila.").
- Auditar e cobrir qualquer outro dialog Spotify que monte `DialogPrimitive.Content`
  direto sem Description: `SpotifyOAuthErrorDialog`, `LessonPickerDialog` (usa
  `DialogContent` shadcn — verificar se o wrapper já provê Description; se não,
  adicionar). `SpotifyPremiumGateDialog` **já** tem `DialogDescription` (OK).
- `ShortcutsHelpPopover` **já** tem Description sr-only (OK — não tocar).
- Padrão: Description sempre `className="sr-only"` (não visível, só leitores de
  tela). Texto em PT-BR.

**Critério de aceitação:**
- [ ] `SpotifySearchDialog` renderiza com `DialogPrimitive.Description` (sr-only) —
      sem warning de aria-describedby no console.
- [ ] `ExpandedPlayerDialog` renderiza com Description sr-only.
- [ ] Auditoria: nenhum `DialogPrimitive.Content` em `audio-player/` fica sem
      Title + Description.
- [ ] Teste assert: o dialog tem um elemento com `id` referenciado por
      `aria-describedby` (ou um `DialogPrimitive.Description` presente no DOM).

### RF-06: Console limpo — gatear logs de diagnóstico do driver a DEV
**Descrição:** Os `console.info`/`console.error` de diagnóstico adicionados ao
`SpotifyAudioDriver.ts` devem aparecer **só em DEV** (`import.meta.env.DEV`), sem
poluir produção — **mas** mantendo a visibilidade do erro real em DEV (lesson #9:
logue antes de engolir).

**Regras de negócio:**
- Criar um helper local `devLog`/`devError` (ou inline guard) que só chama o
  `console.*` quando `import.meta.env.DEV` é `true`. Fallback seguro quando
  `import.meta` indisponível (ambiente de teste node) — não quebrar.
- Gatear os logs de **diagnóstico/ruído**:
  - `console.info("[SpotifyAudioDriver] SDK ready ...")` (linha ~281) → DEV-only.
  - `console.error("[SpotifyAudioDriver] play API body:", ...)` (corpo de debug,
    linha ~175) → DEV-only.
  - `console.warn("Spotify driver: setSpeed unsupported")` (linha ~554) → DEV-only
    (é no-op esperado, não precisa ruído em prod).
- **Preservar** (NÃO gatear / continuar sempre logando, pois são erros reais que
  ajudam diagnóstico em prod e seguem lesson #9 antes do fallback):
  - `console.error("spotify.driver.sdk_load_failed", ...)` (SDK não carregou).
  - `console.error("[SpotifyAudioDriver] play API não-ok:", ...)` (status de erro).
  - `console.error("[SpotifyAudioDriver] play fetch REJEITOU ...")` (rede/CSP).
  - `console.error("[SpotifyAudioDriver] playback/init error:", ...)` (EME/DRM).
  - `console.error("spotify.driver.connect_failed", ...)`.
  - **Justificativa:** a telemetria (`emitAudioEvent`/`safeTelemetry`) já registra
    estes, mas o `console.error` do erro real é o sinal de campo. Manter visível
    em prod **e** dev. Só o ruído de diagnóstico (info "ready", body de debug,
    warn no-op) vai pra trás do gate DEV.
- A distinção é: **erro real → sempre visível** (lesson #9); **info/diagnóstico de
  fluxo normal → DEV-only**.

**Critério de aceitação:**
- [ ] Em produção (`import.meta.env.DEV === false`): `console.info` "SDK ready",
      `console.error` "play API body" e `console.warn` setSpeed **não** são
      chamados.
- [ ] Em DEV (`import.meta.env.DEV === true`): os mesmos logs **são** chamados.
- [ ] Os `console.error` de erro real (`sdk_load_failed`, `play API não-ok`,
      `fetch REJEITOU`, `playback/init error`, `connect_failed`) são chamados
      **independente** de DEV (sempre visíveis).
- [ ] Helper `devLog` com fallback seguro quando `import.meta.env` indisponível
      (não throw em ambiente de teste node).

### RF-07: Não-regressão (preservar o que funciona)
**Descrição:** Esta spec é polish — nada do core funcional pode regredir.
**Invariantes (cada um vira assert de não-regressão):**
- `SpotifyAudioDriver` mantém `this.fetchFn = rawFetch.bind(globalThis)` (fix
  "Illegal invocation" — linha ~103). **NÃO remover o bind.**
- Playback path (`spotifyApiPut` play/pause/seek), `pendingPlay` queue até `ready`,
  reconnect exponencial e token refresh inalterados.
- `player_state_changed` continua dirigindo `timeupdate`/`durationchange`/`ended`.
- Tier gate (`SPOTIFY_SEARCH_ELIGIBLE_TIERS` incl. `active`), singleton
  `queryClient` nos componentes (lesson #29), `ErrorBoundary` local no dialog.
- CSP allowlist Spotify (ADR-220) intacta.
- OAuth flow / `resolveViaStatusFallback` / invalidação `["spotify-status"]`
  inalterados (RF-04/RF-08 do E2E).
- `setSpeed` permanece no-op para Spotify e controle de velocidade permanece
  oculto quando `activeSource === 'spotify'`.

**Critério de aceitação:**
- [ ] Os 77+ testes spotify-e2e + suites mini-player permanecem verdes.
- [ ] `tsc` sem erros novos.
- [ ] Nenhum invariante acima é alterado pela implementação.

---

> **RF-08/09 são BUGS FUNCIONAIS (HIGH), não cosmético.** RF-10 é auditoria
> guarda-chuva (MEDIUM). Entram nesta spec mas têm prioridade de correção sobre
> os RFs cosméticos (01–06).

### RF-08 (HIGH): Fila acumula músicas erradas — "play playlist" deve SUBSTITUIR a fila
**Descrição:** Dar play numa playlist (ou tocar um track) está **anexando** à fila
existente sem limpá-la, deixando resíduo de plays anteriores ("músicas que não
estavam na playlist"). Semântica esperada pelo founder: **tocar uma playlist
DEFINE a fila = as faixas daquela playlist** (substituir, não anexar).

**Causa confirmada (investigada):** `SpotifySearchDialog.onPlayAll` (~linha 449)
faz `playTrack(first)` e depois itera `addToQueue(...)` para o resto **sem**
`clearQueue()` antes. `useQueueState` **expõe `clearQueue()`** (linha 232/279) —
não está sendo chamado. `addToQueue` apenas acrescenta (cap 50).

**Regras de negócio / semântica esperada:**
- **"Tocar tudo" (`onPlayAll`):** `clearQueue()` **antes** de tocar/enfileirar →
  `playTrack(first)` + `addToQueue(resto)`. A fila final == as faixas da playlist
  (na ordem), nada de resíduo anterior.
- **"Adicionar tudo" (`onAddAll`):** mantém semântica de **anexar** (é a intenção
  explícita do botão) — **não** limpa. Diferenciar claramente "Tocar tudo"
  (substitui) de "Adicionar tudo" (anexa).
- **Tocar track avulso da busca (`onPlay`):** decisão (D8-A): tocar um resultado
  avulso **não** deve deixar a fila incoerente. Comportamento esperado: tocar um
  track avulso da **busca** define a "now-playing" e **não** herda resíduo de fila
  de uma playlist anterior que não tem relação. **Decisão:** `onPlay` de um
  resultado de busca chama `clearQueue()` antes de `playTrack` (track avulso = nova
  intenção, fila zerada). Se o founder quiser "adicionar à fila" sem tocar, esse é
  o botão `+` (`onAdd`), que **anexa** (não limpa).
- **Tocar um track DENTRO de um drill-in de playlist (D8-B — autoplay coerente):**
  ao clicar numa faixa específica da playlist no drill-in, o esperado é: tocar essa
  faixa **e** enfileirar o restante da playlist **a partir dali** (as faixas
  seguintes), substituindo a fila. Hoje o drill-in lista as faixas mas (conforme
  código) não há onClick de play por faixa no `playlist-track-row` (~linha 588) —
  as faixas do drill-in não são clicáveis para tocar. **Decisão:** tornar cada
  `playlist-track-row` clicável → `clearQueue()` + `playTrack(faixa_i)` +
  `addToQueue(faixa_i+1..n)`. Mantém o autoplay coerente dentro da playlist.

**Arquivos afetados:**
- `client/src/components/audio-player/SpotifySearchDialog.tsx` — `onPlayAll`
  (clear antes), `onPlay` da busca (clear antes), novo handler de play por faixa no
  drill-in (`playlist-track-row` clicável + clear + enqueue do resto).
- `clearQueue` **já está exposto** no `AudioPlayerCtx` (linha 125) e no value
  (linha 1454) — `SpotifySearchDialog` só precisa consumi-lo via `useAudioPlayer()`.
  Nenhuma mudança de contrato no context é necessária para RF-08.

**Critério de aceitação (testável via estado do `useQueueState` + data-testid):**
- [ ] Com fila pré-povoada (resíduo), clicar "Tocar tudo" numa playlist → fila
      final == exatamente as faixas da playlist (resíduo removido).
- [ ] "Adicionar tudo" → fila final == fila anterior + faixas da playlist (anexa,
      não limpa).
- [ ] Tocar um resultado avulso da busca com fila pré-povoada → fila limpa (sem
      resíduo incoerente); now-playing == o track clicado.
- [ ] Botão `+` (adicionar) de um resultado da busca → anexa à fila (não limpa).
- [ ] Drill-in: clicar a faixa `i` da playlist → toca `i` + fila == faixas `i+1..n`
      (substitui); `playlist-track-row` é clicável.
- [ ] Cap 50 da fila respeitado (não regredir).

### RF-09 (HIGH): Autoplay Spotify não avança — detecção de fim de track robusta
**Descrição:** Ao terminar uma faixa Spotify, a próxima da fila **não toca
sozinha**. O `tryAutoplayNext` (`AudioPlayerContext` ~923) trata a fila
corretamente, mas depende do evento `ended` do driver — que **não dispara de forma
confiável** para Spotify.

**Causa confirmada (investigada):** `SpotifyAudioDriver.onStateChanged` (~linha
295–315) detecta fim via heurística `state.paused === true && position >= duration`.
O Web Playback SDK, no fim de uma faixa, costuma **resetar `position` para 0** e/ou
sinalizar a transição via `state.track_window.previous_tracks` (a faixa recém-tocada
migra para `previous_tracks`). A heurística `position >= duration` raramente é
satisfeita → `ended` não emite → `tryAutoplayNext` nunca roda → autoplay parado.

**Regras de negócio:**
- Implementar detecção robusta de fim de faixa Spotify no driver, combinando
  sinais (qualquer um confiável dispara `ended` **uma única vez**, sem duplicar):
  1. `state.paused === true` **e** `state.position === 0` vindo de um estado
     anterior `playing` com posição **próxima do fim** (rastrear `lastPosition`/
     `wasPlaying` entre eventos) → transição playing→fim.
  2. `state.track_window.previous_tracks` passou a **conter** o `trackId` que estava
     tocando (a faixa atual virou "anterior") **e** o `track_window.current_track`
     mudou ou está vazio → faixa concluída.
  3. (Fallback preservado) `paused && position >= duration` com `duration > 0`.
- **Dedupe:** guardar o `trackId`/uri da última faixa para a qual `ended` foi
  emitido; não emitir `ended` duas vezes para a mesma faixa (evita pular 2 faixas).
  Resetar o guard quando uma **nova** faixa começa a tocar.
- O `ended` resultante alimenta o `tryAutoplayNext` existente (não tocar nessa
  lógica de fila/repeat/shuffle — RF-07 a protege).
- Manter `repeatMode === 'one'` (replay) coerente: o driver emite `ended`, o context
  decide replay vs próxima (já implementado em `tryAutoplayNext` ~925).

**Arquivos afetados:**
- `client/src/lib/audio-engine/SpotifyAudioDriver.ts` — `onStateChanged`:
  rastreamento de `lastPosition`/`wasPlaying`/`lastEndedTrackId`, lógica de
  detecção combinada, emit `ended` único.

**Critério de aceitação (testável no driver com mock de sequência `player_state_changed`):**
- [ ] Sequência: playing(pos≈duration) → paused(pos=0) com mesma faixa → emite
      `ended` exatamente **1 vez**.
- [ ] Sequência onde a faixa migra para `track_window.previous_tracks` e
      `current_track` muda → emite `ended` 1 vez.
- [ ] `ended` não é emitido em pause manual no meio da faixa (paused com `position`
      no meio, não no fim, sem transição de fim).
- [ ] Não emite `ended` duplicado para a mesma faixa (dedupe por trackId/uri).
- [ ] Após `ended`, com fila não vazia, `tryAutoplayNext` toca a próxima (teste de
      integração context+driver mock, ou unit do driver + assert no handler `ended`).
- [ ] `repeatMode='one'` → `ended` → replay da mesma faixa (não consome fila).

### RF-10 (MEDIUM): Auditoria UX do fluxo Spotify — gaps concretos
**Descrição:** O founder sinalizou "vários polimentos além dos que falamos".
Auditoria rápida do fluxo busca → playlist → tocar → fila → now-playing,
endereçando os gaps óbvios abaixo. Cada sub-item é acionável e testável.

**Sub-itens (achados concretos — investigados):**

- **RF-10.1 — Feedback visual ao adicionar à fila.** Hoje o botão `+`
  (`search-result-add-*`, `onAdd`) não dá feedback visível (só telemetria). Aceite:
  feedback efêmero (toast/checkmark transitório ou estado do botão) confirmando
  "Adicionado à fila". `data-testid="search-result-added-feedback"`.
- **RF-10.2 — Indicar qual track está tocando na lista.** Nem a lista de resultados
  da busca nem o drill-in marcam a faixa em reprodução. Aceite: a linha cujo
  `trackId === activeTrack.trackId` recebe destaque visual (ícone tocando / cor) +
  `data-testid="row-now-playing"` (ou `aria-current="true"`).
- **RF-10.3 — Contagem real de faixas no header do drill-in.** O drill-in mostra só
  "Tracks da playlist" (~linha 549). O `ListPlaylistTracksResponse.total` **já vem**
  do server. Aceite: header do drill-in mostra "N faixas" usando `drillQ.data.total`
  (count real, sem request extra). Resolve o "0 tracks" de forma definitiva no
  drill-in (RF-01 cobre a lista; aqui é o header do detalhe).
- **RF-10.4 — Botão "tocar playlist" claro.** O "Tocar tudo" / "Adicionar tudo" só
  aparecem **dentro** do drill-in. Aceite: avaliar um botão de play direto no card
  da playlist na lista (hover/ícone) que faz `onPlayAll` daquela playlist (com a
  semântica de substituir fila — RF-08). Se exigir fetch dos tracks no clique,
  manter lazy (não pré-carregar todas). `data-testid="playlist-row-play"`.
- **RF-10.5 — Shuffle/repeat com Spotify.** Validar que `repeatMode` e
  `shuffleEnabled` (useQueueState) operam corretamente quando a fila é Spotify: o
  `tryAutoplayNext` já respeita `shuffledOrder` (~969) e `repeatMode` — confirmar
  end-to-end que, com RF-09 (ended confiável), shuffle/repeat avançam a fila Spotify
  como esperado. Aceite: teste cobrindo `ended` Spotify + `shuffleEnabled` → próxima
  vem do `shuffledOrder`; `repeatMode='all'` → ao esgotar, comportamento coerente.
- **RF-10.6 — QueuePopover mostra tracks Spotify corretamente (capa/título/artista).**
  Confirmado: `QueuePopover` item (linha ~83–101) mostra capa (via
  `sanitizeSpotifyCoverUrl`) + título + badge Spotify, mas **não mostra artista** (o
  tipo do queue item não tem `artist`). Aceite: após RF-03 (artist no `AudioTrack`),
  propagar `artist` para o item da fila e exibir a linha de artista no QueuePopover
  para tracks Spotify. `data-testid="queue-item-artist"`.

**Arquivos afetados:**
- `client/src/components/audio-player/SpotifySearchDialog.tsx` — RF-10.1/10.2/10.3/10.4.
- `client/src/components/audio-player/QueuePopover.tsx` — RF-10.6.
- `client/src/hooks/useQueueState.ts` — RF-10.6 (campo `artist` no QueueItem se
  necessário para carregar até o popover).
- `client/src/contexts/AudioPlayerContext.tsx` — RF-10.5 (apenas validação/teste; a
  lógica de shuffle/repeat já existe — não reescrever).

**Critério de aceitação (guarda-chuva — cada sub-item tem seu data-testid/assert):**
- [ ] RF-10.1: adicionar à fila mostra feedback efêmero.
- [ ] RF-10.2: faixa em reprodução destacada na lista/drill-in (`aria-current`/testid).
- [ ] RF-10.3: header do drill-in mostra "N faixas" (de `drillQ.data.total`, sem
      request extra).
- [ ] RF-10.4: card de playlist tem play direto que dispara `onPlayAll` (substitui
      fila).
- [ ] RF-10.5: shuffle/repeat avançam a fila Spotify após `ended` (RF-09).
- [ ] RF-10.6: QueuePopover mostra artista para tracks Spotify.
- [ ] Nenhum request de rede extra introduzido (RF-10.3 usa `total` já presente).

---

## Requisitos Não-Funcionais
- **A11y:** todo dialog Spotify com Title + Description (sr-only); mensagens de
  erro anunciáveis (`role="alert"`); `aria-label` PT-BR nos controles.
- **Performance:** sem novas chamadas de rede (RF-01 D1 explicitamente evita N
  requests de count); skeletons não disparam requests extra; sem re-render que
  recrie o player.
- **Consistência visual:** usar tokens de `@/lib/ui-tokens` onde houver
  equivalência; PT-BR em toda string visível ("faixas", não "tracks").
- **Segurança:** logs DEV-only nunca vazam token; capas só via
  `sanitizeSpotifyCoverUrl` (whitelist SCDN) — não regredir.

## Endpoints Envolvidos (existentes — sem endpoint novo)
| Método | Rota | Mudança |
|---|---|---|
| GET | /api/audio/spotify/me/playlists | `mapPlaylist` retorna `trackCount: number\|null` (RF-01) |
| GET | /api/audio/spotify/playlists/:id/tracks | sem mudança (drill-in já traz `total`) |
| GET | /api/audio/spotify/search | sem mudança (já retorna `artists`) |

> Mudança server-side é **apenas** o mapeamento de `trackCount` (RF-01). Nenhuma
> rota nova, nenhum contrato quebrado (campo passa de `number` para `number|null`
> — client atualizado em conjunto).

## Modelos de Dados Afetados
Nenhuma tabela. Apenas tipos TS:

### `AudioTrack` (`client/src/lib/audio-engine/types.ts`) — alteração
| Campo | Tipo | Notas |
|---|---|---|
| artist | `string \| null` (opcional) | **novo**; usado por now-playing Spotify (RF-03) |

### `SpotifyPlaylist` (`spotifyApiClient.ts`) — alteração
| Campo | Tipo | Notas |
|---|---|---|
| trackCount | `number \| null` | era `number`; `null` = total desconhecido (RF-01) |

### `QueueItem.track` (`useQueueState.ts`) — alteração
| Campo | Tipo | Notas |
|---|---|---|
| artist | `string \| null` (opcional) | **novo**; propaga até o QueuePopover (RF-10.6) |

## Arquivos Afetados (esperados)
- `server/routes/spotifyAudio.ts` — RF-01 (`mapPlaylist.trackCount` → `null` quando
  `tracks?.total` undefined). **Única mudança server.**
- `client/src/lib/audio-engine/spotifyApiClient.ts` — RF-01 (`SpotifyPlaylist.trackCount: number|null`).
- `client/src/lib/audio-engine/types.ts` — RF-03 (`AudioTrack.artist?`).
- `client/src/components/audio-player/SpotifySearchDialog.tsx` — RF-01 (render count),
  RF-02 (skeletons/erro playlists), RF-03 (passar `artist` em playTrack/addToQueue),
  RF-04 (estado de erro busca + PT-BR), RF-05 (Description no dialog).
- `client/src/components/audio-player/MiniPlayerBar.tsx` — RF-03 (linha de artista).
- `client/src/components/audio-player/ExpandedPlayerDialog.tsx` — RF-03 (artista no
  contexto), RF-05 (Description sr-only).
- `client/src/lib/audio-engine/SpotifyAudioDriver.ts` — RF-06 (gate DEV dos logs de
  diagnóstico; preservar erros reais) **+ RF-09** (detecção robusta de fim de faixa
  em `onStateChanged`).
- `client/src/components/audio-player/SpotifyOAuthErrorDialog.tsx`,
  `LessonPickerDialog.tsx` — RF-05 (auditoria Description, se faltar).
- `client/src/components/audio-player/SpotifySearchDialog.tsx` (adicional) — **RF-08**
  (clearQueue antes de tocar playlist/track avulso; drill-in track clicável),
  **RF-10.1/10.2/10.3/10.4** (feedback fila, now-playing na lista, count no header,
  play no card).
- `client/src/components/audio-player/QueuePopover.tsx` — **RF-10.6** (artista no item).
- `client/src/hooks/useQueueState.ts` — **RF-10.6** (`artist` no QueueItem) +
  garantir `clearQueue` exposto (já é — linha 279).
- `client/src/contexts/AudioPlayerContext.tsx` — **RF-10.5** (validação
  shuffle/repeat com `ended` Spotify — sem reescrever a lógica existente). RF-08
  **não** muda o context (`clearQueue` já está exposto — linha 125/1454).

## Cenários de Teste Derivados

### Happy Path
- [ ] Playlist com `tracks.total` undefined → server `trackCount === null` → card
      sem "0 tracks" (RF-01).
- [ ] Tocar track Spotify → MiniPlayerBar mostra título + artista (RF-03).
- [ ] Dialog Spotify monta com Description sr-only — sem warning Radix (RF-05).

### Estados de UI
- [ ] Lista de playlists loading → skeletons, não "Carregando..." (RF-02).
- [ ] Drill-in loading → skeletons (RF-02).
- [ ] Busca com erro 500 → bloco PT-BR + retry refaz query (RF-04).
- [ ] Busca 0 resultados → empty state `spotify-search-empty` (RF-04).
- [ ] Erro de rede na lista de playlists → bloco PT-BR + retry (RF-02).

### Regras de Negócio
- [ ] `trackCount === 0` → "Sem faixas"; `=== 25` → "25 faixas"; `null` → omitido (RF-01).
- [ ] Track library (sem `artist`) → mostra `courseTitle` (não regride, RF-03).
- [ ] `onPlay`/`onAdd` passam `artist = track.artists.join(", ")` (RF-03).

### Console / A11y
- [ ] Prod (`DEV=false`): `console.info` "SDK ready" + `console.warn` setSpeed +
      "play API body" **não** chamados (RF-06).
- [ ] Dev (`DEV=true`): os mesmos logs **chamados** (RF-06).
- [ ] Erro real (`sdk_load_failed`, `play API não-ok`, `connect_failed`) chamado em
      DEV **e** prod (RF-06 / lesson #9).
- [ ] Cada `DialogPrimitive.Content` Spotify tem Title + Description (RF-05).

### Fila / Autoplay (RF-08/09 — HIGH funcional)
- [ ] Fila pré-povoada + "Tocar tudo" playlist → fila final == só as faixas da
      playlist (resíduo limpo via `clearQueue`) (RF-08).
- [ ] "Adicionar tudo" → anexa (não limpa) (RF-08).
- [ ] Tocar resultado avulso da busca com fila pré-povoada → fila limpa (RF-08).
- [ ] Drill-in: clicar faixa `i` → toca `i` + fila == `i+1..n` (RF-08).
- [ ] Driver: playing(pos≈dur) → paused(pos=0) mesma faixa → `ended` 1x (RF-09).
- [ ] Driver: faixa migra p/ `previous_tracks` + `current_track` muda → `ended` 1x (RF-09).
- [ ] Driver: pause manual no meio → **não** emite `ended` (RF-09).
- [ ] Driver: dedupe — `ended` não duplica p/ mesma faixa (RF-09).
- [ ] `ended` Spotify → `tryAutoplayNext` toca próxima da fila (RF-09).
- [ ] `repeatMode='one'` + `ended` Spotify → replay, não consome fila (RF-09).
- [ ] `shuffleEnabled` + `ended` Spotify → próxima vem de `shuffledOrder` (RF-10.5).

### Auditoria UX (RF-10 — MEDIUM)
- [ ] Adicionar à fila → feedback efêmero `search-result-added-feedback` (RF-10.1).
- [ ] Faixa em reprodução destacada na lista/drill-in (`aria-current`) (RF-10.2).
- [ ] Header do drill-in mostra "N faixas" de `drillQ.data.total` (RF-10.3).
- [ ] Card de playlist tem play direto `playlist-row-play` (RF-10.4).
- [ ] QueuePopover mostra artista p/ tracks Spotify `queue-item-artist` (RF-10.6).
- [ ] Nenhum request de rede extra introduzido (RF-10.3 usa `total` já presente).

### Não-Regressão (RF-07)
- [ ] `SpotifyAudioDriver` mantém `fetchFn.bind(globalThis)`.
- [ ] Tier gate inclui `active`; componentes usam singleton `queryClient`.
- [ ] `player_state_changed` continua dirigindo timeupdate/durationchange/ended.
- [ ] Controle de velocidade oculto para `activeSource === 'spotify'`.
- [ ] CSP allowlist Spotify (ADR-220) intacta.
- [ ] `tryAutoplayNext` (fila/repeat/shuffle) **não** é reescrito — RF-09 só
      melhora o disparo de `ended` que o alimenta.

## Fora de Escopo
- **Não** tocar no playback engine, CSP, OAuth, refresh, reconnect, token crypto —
  já funcionam (ADR-220).
- **Não** reescrever `tryAutoplayNext` nem a lógica de fila/repeat/shuffle do
  `useQueueState` (RF-09 só corrige o disparo de `ended`; RF-08 só adiciona
  `clearQueue` nos pontos certos; RF-10.5 só valida).
- **Não** adicionar transfer/cross-device playback, drag-reorder novo na fila, nem
  persistência de fila Spotify além do que `useQueueState` já faz.
- **Não** alterar o cap 50 da fila.
- **Não** buscar count real via `/items?total` por playlist na lista (custo de
  rate limit > benefício — RF-01 D1: count real só no drill-in).
- **Não** adicionar features novas (rádio, lyrics, recomendações, crossfade,
  equalizer, variable speed para Spotify).
- **Não** redesenhar a estrutura dos dialogs (Radix `DialogPrimitive.*` direto
  permanece — só adicionar Description).
- **Não** migrar os dialogs Spotify para o wrapper shadcn `DialogContent` (risco de
  regressão de layout/z-index — fora de escopo).
- **Não** mexer no `mapAudioErrorToMessage` (reusar como está).
- **Não** alterar telemetria/eventos (ADR-207/208 intactos).

## Dependências
- Sprint Spotify E2E (ADR-220) shipped — playback funcional é pré-requisito.
- `@/lib/ui-tokens` (tokens do design system) + `Docs/conventions/ui-patterns.md`.

## Riscos
- **Testes visuais são difíceis (jsdom):** não testar pixels. Focar em
  `data-testid` estáveis + estados testáveis (presença de skeleton/empty/erro,
  presença de `Description`, texto do count, `artist` no DOM, chamadas de
  `console.*` mockadas via `vi.spyOn`). Evitar heurísticas DOM frágeis (lesson #2).
- **`import.meta.env.DEV` em ambiente de teste node:** pode ser `undefined`. O
  helper `devLog` precisa de fallback seguro (try/catch ou `typeof import.meta`)
  para não quebrar os testes do driver que rodam em node (lesson #15: polyfill /
  guard no setup quando necessário). Testar ambos os ramos via mock de
  `import.meta.env.DEV` (vitest `vi.stubEnv` ou injeção do flag).
- **Contrato `trackCount: number → number|null`:** atualizar server **e** client
  juntos para não quebrar os testes de `SpotifyPlaylistBrowser`/`SpotifySearchDialog`
  que assertam o count. Verificar `tests/client/spotify-search/*` antes de mudar a
  render string ("tracks" → "faixas" pode quebrar assert literal — atualizar testes
  desatualizados é responsabilidade do test-writer, não do implementer).
- **Mudar "tracks" → "faixas":** alguns testes existentes podem assertar a string
  literal "tracks". O test-writer deve atualizar os asserts (red-phase) e o
  implementer NÃO modifica testes (lesson: documentar se houver conflito).
- **RF-09 — heurística de fim de faixa do SDK é frágil por natureza:** o
  comportamento exato do `player_state_changed` no fim varia (reset de `position`,
  `previous_tracks`). Mockar uma **sequência realista** de eventos no teste do
  driver (lessons #5/#35 sobre mock de SDK). Validar no browser real
  (`/verify` / `mcp__claude-in-chrome`) que o autoplay encadeia — o teste unit
  garante o disparo de `ended`, mas a sequência real só o browser confirma.
- **RF-09 — risco de pular faixa (double-ended):** sem o dedupe por `trackId`, a
  detecção combinada pode emitir `ended` 2x e pular uma faixa. O assert de "emite
  1x" é obrigatório.
- **RF-08 — `clearQueue` afeta UX:** limpar a fila ao tocar um track avulso da
  busca é a decisão D8-A; se o founder achar agressivo (ex: quer manter a fila e só
  trocar a now-playing), reabrir D8-A. Documentado como decisão explícita.
- **RF-10.6 — propagar `artist` pela cadeia track → QueueItem → popover:** depende
  de RF-03 (campo `artist` no `AudioTrack`). Ordem de implementação: RF-03 antes de
  RF-10.6.
- **Branch entanglement** (lessons #24/#45): working tree compartilhado entre
  sessões — usar `git add` explícito, nunca `-A`.

## Notas de Implementação
- `import.meta.env.DEV` é o flag Vite canônico; em testes vitest usar
  `vi.stubEnv('DEV', ...)` ou injetar via dep para cobrir ambos os ramos.
- Para RF-05, `<DialogPrimitive.Description className="sr-only">` é mais simples e
  robusto que `aria-describedby` manual (Radix conecta automaticamente).
- Para RF-03, o `artist` derivado de `artists.join(", ")` cobre múltiplos artistas;
  truncar via CSS (`truncate`), não no dado.
- Reusar os skeletons já existentes na busca como componente compartilhado (DRY)
  para a lista/drill-in de playlists (RF-02) em vez de duplicar markup.
- Preservar lesson #9 (logue o erro real antes do fallback) — RF-06 só gateia o
  ruído de fluxo normal, nunca o erro real.
