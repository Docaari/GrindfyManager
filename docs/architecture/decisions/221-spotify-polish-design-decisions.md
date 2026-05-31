# ADR-221: Decisões de design do Sprint Spotify Polish (autoplay, fila, resume, token, cover, status)

## Status
Proposto

## Data
2026-05-31

## Contexto

O Sprint Spotify Polish (`Docs/specs/sprint-spotify-polish.md`, RF-01..10)
consolidou ~35 bugs catalogados em 4 bug-hunts adversariais
(`Docs/specs/sprint-spotify-polish-bugs.md`). A maioria é **mecânica** (passar
`item.id` em vez de `idx`, gatear logs a DEV, paginação, retry 404) e vai direto
para o test-writer/implementer a partir do manifesto.

Este ADR cobre **só os 8 bugs cujo conserto exige uma decisão de design
não-trivial** — onde há mais de uma forma de resolver, ou onde o contrato entre
módulos (driver ↔ context ↔ fila ↔ server) precisa ser definido **antes** de
escrever testes. São contratos/invariantes que o test-writer transforma em
asserts e o implementer não pode improvisar.

O playback Spotify já está funcional (ADR-220): Web Playback SDK +
`SpotifyAudioDriver` + Engine + OAuth/refresh/reconnect. Nenhuma decisão aqui
reescreve esse core — todas são **correções pontuais de contrato** sobre ele.
RF-07 (não-regressão) é a fronteira: `fetch.bind(globalThis)`, CSP, OAuth,
`tryAutoplayNext`, cap 50 da fila e tier gate `active` permanecem intactos.

Decisões cobertas:

1. **D1 — Detecção de fim de track Spotify** (B-ENDED-1 / RF-09)
2. **D2 — Semântica replace-vs-append da fila** (B-QUEUE-1 / RF-08)
3. **D3 — resume-vs-play no driver** (B-RESUME-1)
4. **D4 — courseContext residual** (B-AUTOPLAY-1)
5. **D5 — Token sempre fresco + volume no driver** (B-TOKEN-CLOSURE / B-VOLUME-1)
6. **D6 — Cover whitelist SSoT por sufixo** (B-COVER-1)
7. **D7 — Reconciliação de status** (B-BOOT-1 / B-DISCONNECT-SYNC / B-PANEL-401)
8. **D8 — `AudioTrack.artist`** (B-ARTIST-1)

Diagramas de apoio em `Docs/architecture/diagrams/spotify-polish/`:
- `ended-detection-fsm.mermaid` — estados/sequência `player_state_changed`→`ended`
- `ended-autoplay-sequence.mermaid` — `ended`→`tryAutoplayNext`→próxima
- `queue-replace-vs-append.mermaid` — fluxo de decisão da fila
- `status-reconciliation-flow.mermaid` — bootstrap/disconnect/painel

---

## D1 — Detecção de fim de track Spotify (B-ENDED-1 / RF-09)

### Problema
`onStateChanged` (`SpotifyAudioDriver.ts:305-314`) detecta fim via
`paused === true && position >= duration`. O Web Playback SDK, no fim de uma
faixa, **reseta `position` para 0** e move a faixa para
`track_window.previous_tracks` — a heurística `position >= duration` raramente é
satisfeita. Resultado: `ended` nunca dispara → `tryAutoplayNext` nunca roda →
autoplay parado.

### Opções consideradas

**Opção A — Só `previous_tracks` contém o track atual.**
- Prós: sinal forte de transição; alinhado ao comportamento do SDK.
- Contras: o SDK popul `previous_tracks` também ao trocar de faixa MANUALMENTE
  (skip), o que dispararia `ended` falso. Sozinho é ambíguo.

**Opção B — Só `paused && position===0` vindo de `playing` perto do fim.**
- Prós: captura a transição natural de fim.
- Contras: alguns devices reportam `position===0 && paused` em outros momentos
  (load inicial, stop). Sozinho gera falso-positivo no boot.

**Opção C — FSM combinada com `lastState` + dedupe por trackId (escolhida).**
- Prós: cada sinal isolado é frágil; a combinação + guard de "estava tocando
  perto do fim" + dedupe elimina os dois modos de falso-positivo. Robusta a
  variações de device.
- Contras: mais estado a manter (`lastState`); precisa reset disciplinado.

### Decisão (D1)

Implementar uma **FSM leve** no `onStateChanged`, guardando o estado anterior e
um guard de dedupe. Detecção de `ended` = OR de sinais confiáveis, emitida **uma
única vez por faixa**.

**Estado novo no driver (privado):**
```ts
private lastPositionMs = 0;          // posição do último player_state_changed
private wasPlaying = false;          // !paused do último evento
private lastTrackUri: string | null = null;  // current_track.uri do último evento
private endedEmittedForUri: string | null = null; // dedupe: já emitiu ended p/ esta uri
```

**Contrato de campos do `state` (Web Playback SDK `WebPlaybackState`):**
- `state.paused: boolean`
- `state.position: number` (ms)
- `state.duration: number` (ms)
- `state.track_window.current_track.uri: string` (uri da faixa atual)
- `state.track_window.previous_tracks: Array<{ uri: string }>` (faixas já tocadas)

**Algoritmo (avaliado a cada `player_state_changed`, em ordem):**

1. **Extrair** `curUri = state.track_window?.current_track?.uri ?? null`,
   `pos = state.position`, `dur = state.duration`, `paused = state.paused`.

2. **Detectar fim** — `ended` dispara se QUALQUER condição:
   - **(C1) playing→fim-reset:** `wasPlaying === true` E `paused === true` E
     `pos === 0` E `lastPositionMs >= dur * NEAR_END_RATIO` (com `dur > 0`).
     `NEAR_END_RATIO = 0.95` (estava a ≥95% quando virou paused+reset).
   - **(C2) migração p/ previous_tracks:** `lastTrackUri` está presente em
     `state.track_window.previous_tracks` (por uri) E (`curUri !== lastTrackUri`
     OU `curUri == null`). Ou seja: a faixa que estava tocando virou "anterior".
   - **(C3) fallback legado:** `paused === true` E `dur > 0` E `pos >= dur`.

3. **Dedupe:** só emite se `endedEmittedForUri !== lastTrackUri` (a uri para a
   qual estamos detectando fim). Após emitir, `endedEmittedForUri = lastTrackUri`.
   Isso impede dois `player_state_changed` consecutivos no fim emitirem `ended`
   duas vezes (pularia faixa).

4. **Atualizar `lastState`** ao final, SEMPRE (após a checagem):
   `lastPositionMs = pos; wasPlaying = !paused; lastTrackUri = curUri;`

5. **Reset do guard de dedupe** quando uma faixa **nova** começa: dentro de
   `load(track)` E no início de `play()`, setar `endedEmittedForUri = null` se
   `track.trackId !== endedEmittedForUri`. (Na prática: reset em `load` quando
   `currentTrack` muda — a próxima faixa pode então emitir seu próprio `ended`.)

**Pseudocódigo:**
```ts
private onStateChanged(state: WebPlaybackState) {
  if (!state) return;
  const cur = state.track_window?.current_track?.uri ?? null;
  const pos = typeof state.position === "number" ? state.position : 0;
  const dur = typeof state.duration === "number" ? state.duration : 0;
  const paused = state.paused === true;

  // timeupdate / durationchange (inalterado) ...

  const prevUris = (state.track_window?.previous_tracks ?? []).map(t => t?.uri);
  const endedNow =
    // C1 — playing perto do fim virou paused + reset p/ 0
    (this.wasPlaying && paused && pos === 0 &&
       dur > 0 && this.lastPositionMs >= dur * 0.95) ||
    // C2 — a faixa que tocava migrou p/ previous_tracks
    (this.lastTrackUri != null && prevUris.includes(this.lastTrackUri) &&
       (cur !== this.lastTrackUri || cur == null)) ||
    // C3 — fallback legado
    (paused && dur > 0 && pos >= dur);

  if (endedNow && this.lastTrackUri && this.endedEmittedForUri !== this.lastTrackUri) {
    this.endedEmittedForUri = this.lastTrackUri;
    this.emit("ended", {});
  }

  // atualiza lastState SEMPRE
  this.lastPositionMs = pos;
  this.wasPlaying = !paused;
  this.lastTrackUri = cur;
}
```

**Notas de contrato:**
- O guard usa `this.lastTrackUri` (a faixa que ESTAVA tocando), não `cur` — no
  momento do fim o `current_track` já pode ter mudado/esvaziado.
- Pause manual no meio (`paused && pos` no meio, `wasPlaying` true mas
  `lastPositionMs` longe do fim) **não** dispara C1/C3, e o `lastTrackUri` não
  migrou para `previous_tracks` → sem C2. Logo: sem `ended`. ✔
- `repeatMode==='one'` é decidido no **context** (`tryAutoplayNext` já faz replay
  via seek). O driver só emite `ended`; não conhece repeat. RF-07 protege isso.

### Consequências
- **Positivas:** autoplay Spotify avança de forma confiável; dedupe impede pular
  faixa; fallback legado preservado.
- **Negativas:** heurística de SDK é inerentemente frágil — o teste cobre o
  disparo, mas a sequência real só o browser confirma (`/verify`).
- **Neutras:** o driver passa a manter 4 campos de estado extra (`lastState` +
  guard). Reset disciplinado em `load`/`play`.

### Confiança
Média (sequência real do SDK varia por device; unit garante o contrato, browser
valida o encadeamento).

---

## D2 — Semântica replace-vs-append da fila (B-QUEUE-1 / RF-08)

### Problema
`onPlayAll` faz `playTrack(first)` + `addToQueue(resto)` **sem `clearQueue()`** →
resíduo de plays anteriores (localStorage `audio.queue.v1`) permanece. O founder
espera: tocar uma playlist DEFINE a fila = as faixas daquela playlist.

### Decisão (D2): Tabela ação → efeito na fila

`clearQueue` **já está exposto** no context (`AudioPlayerContext.tsx:125/1454`).
Nenhuma mudança de contrato no context. `SpotifySearchDialog` apenas o consome.

| Ação (UI) | Handler | Efeito na fila | Now-playing |
|---|---|---|---|
| **"Tocar tudo"** (drill-in playlist) | `onPlayAll` | **SUBSTITUI**: `clearQueue()` → `playTrack(t[0])` → `addToQueue(t[1..n])` | `t[0]` |
| **"Adicionar tudo"** (drill-in) | `onAddAll` | **ANEXA**: `addToQueue(t[0..n])` (sem clear) | inalterado |
| **Play track avulso da busca** (clique na linha) | `onPlay` | **SUBSTITUI**: `clearQueue()` → `playTrack(track)` | o track clicado |
| **Botão "+"** (busca, `search-result-add-*`) | `onAdd` | **ANEXA**: `addToQueue(track)` (sem clear) | inalterado |
| **Play da faixa `i` no drill-in** (linha clicável) | novo handler | **SUBSTITUI + enfileira resto**: `clearQueue()` → `playTrack(t[i])` → `addToQueue(t[i+1..n])` | `t[i]` |
| **Play no card da playlist** (RF-10.4, `playlist-row-play`) | `onPlayAll` da playlist | igual "Tocar tudo" (SUBSTITUI) | `t[0]` |

**Invariante:** "Tocar" (play) = **substitui** a fila com a nova intenção;
"Adicionar" (botão +/Adicionar tudo) = **anexa**. Sem exceções.

**Ordem das operações no replace:** `clearQueue()` ANTES de `playTrack`. Como
`clearQueue` e `addToQueue` são mutações do mesmo hook (`useQueueState`,
state-setter), e `playTrack` é independente, a ordem `clearQueue → playTrack →
addToQueue(resto)` produz a fila final = exatamente as faixas da playlist a
partir de `t[i]`. Cap 50 respeitado pelo `addToQueue` (não regredir).

**Drill-in clicável (D8-B):** cada `playlist-track-row` (`SpotifySearchDialog.tsx
:588`) ganha `onClick` → `clearQueue()` + `playTrack(t[i])` +
`addToQueue(t[i+1..n])`. Hoje a row não é clicável para tocar.

### Consequências
- **Positivas:** fila sempre coerente com a última intenção de play; resíduo
  eliminado; autoplay dentro da playlist funciona (com D1).
- **Negativas:** "tocar avulso da busca" limpa a fila (D8-A). Decisão explícita
  do founder; se achar agressivo, reabrir D8-A (trocar `onPlay` da busca para
  NÃO limpar, mantendo só a now-playing). Documentado como ponto de reversão.
- **Neutras:** botão "+" continua sendo a via de "adicionar sem tocar".

### Confiança
Alta (testável via estado do `useQueueState` + data-testid; sem ambiguidade
de SDK).

---

## D3 — resume-vs-play no driver (B-RESUME-1)

### Problema
pause→play **reinicia o track do 0**. O `useEffect[isPlaying]`
(`AudioPlayerContext.tsx:1001-1018`) chama `drv.play?.()` no toggle play. O
`play()` do driver faz `PUT /me/player/play { uris: [...] }`, que **sempre começa
do 0**. Falta separar "carregar e iniciar" de "retomar".

### Opções consideradas

**Opção A — `play()` detecta se já tocou e faz resume.**
- Contras: `play()` vira stateful/ambíguo; difícil testar; o context não tem como
  forçar "load do início" quando quer (ex: replay manual).

**Opção B — split explícito `play()` / `resume()` / `pause()` (escolhida).**
- Prós: cada método tem semântica única e testável; o context escolhe qual
  chamar conforme a intenção (load inicial vs toggle).
- Contras: amplia a interface do driver (`IAudioSourceDriver` ganha `resume`).

### Decisão (D3): API do driver

Adicionar `resume()` à interface `IAudioSourceDriver` (`types.ts`) e ao
`SpotifyAudioDriver`. `LibraryAudioDriver` (e qualquer driver `<audio>`)
implementa `resume()` como alias de `play()` no elemento HTML (que já retoma da
posição corrente — só o Spotify reinicia).

| Método | SDK / REST | Semântica |
|---|---|---|
| `play()` | `PUT /me/player/play?device_id { uris: [trackId] }` | **Load inicial**: começa a faixa do 0. Chamado por `playTrack` (Engine) na 1ª reprodução. |
| `resume()` | `player.resume()` (SDK) — fallback `PUT /me/player/play?device_id` **sem body** | **Retoma** da posição corrente. NÃO reenvia `uris`. |
| `pause()` | `player.pause()` (SDK) — fallback `PUT /me/player/pause?device_id` | Pausa preservando posição. |

**Quem chama o quê:**
- `Engine.playTrack(track)` (primeiro play / troca de faixa) → `driver.load()` +
  `driver.play()` (com `uris`).
- `useEffect[isPlaying]` no context (toggle):
  - `isPlaying === true` → `drv.resume()` (NÃO `drv.play()`).
  - `isPlaying === false` → `drv.pause()`.
- `seek` continua via `driver.seek()` (inalterado).

**Mudança pontual no context** (`AudioPlayerContext.tsx:1003-1016`):
```ts
if (activeTrack?.source === "spotify") {
  const drv = spotifyDriverRef.current;
  if (!drv) return;
  try {
    if (isPlaying) drv.resume?.();   // antes: drv.play?.()
    else drv.pause?.();
  } catch { /* ignore */ }
  return;
}
```

**Fallback do `resume()` no driver** (quando o SDK `player.resume` não existe —
mocks/edge): `PUT /me/player/play?device_id={id}` **sem body** retoma sem
reiniciar (a Spotify API trata play sem `uris`/`context_uri`/`position_ms` como
resume do estado corrente). Implementação:
```ts
async resume(): Promise<void> {
  if (this.destroyed) return;
  try {
    const r = this.player?.resume?.();
    if (r && typeof r.then === "function") { await r; return; }
    if (typeof this.player?.resume === "function") return; // sync ok
  } catch { /* fall through to REST */ }
  if (!this.deviceId) { this.pendingPlay = true; return; }
  const device = encodeURIComponent(this.deviceId);
  this.spotifyApiPut(`/me/player/play?device_id=${device}`); // SEM body
}
```

### Consequências
- **Positivas:** pause→play retoma da posição; comportamento esperado pelo user.
- **Negativas:** interface do driver cresce (`resume`); todos os drivers precisam
  implementar (library = alias trivial). RF-07: garantir que o split não quebra
  o pendingPlay (resume pré-ready enfileira como play).
- **Neutras:** `play()` mantém semântica de load (uris) — replay manual continua
  possível chamando `playTrack` de novo.

### Confiança
Alta (semântica clara; testável com mock do `player.resume`/`spotifyApiPut`).

---

## D4 — courseContext residual (B-AUTOPLAY-1)

### Problema
`playTrack` (`AudioPlayerContext.tsx:623-625`) só seta `courseContext` quando vem
`ctxArg`. Tracks Spotify (onPlay/onPlayAll/autoplay-de-fila) **não passam ctx** →
o `courseContext` de uma sessão de biblioteca anterior **persiste**.
`tryAutoplayNext` avalia `if (ctxArg)` ANTES da fila → ao terminar uma música
Spotify, tenta tocar a próxima **AULA** do curso residual (ou para), nunca a
próxima música da fila.

### Decisão (D4): Invariante "courseContext espelha a intenção do playTrack atual"

`playTrack` SEMPRE seta o courseContext conforme o argumento — incluindo
limpá-lo quando não vem `ctxArg`:

```ts
// AudioPlayerContext.tsx playTrack:
setCourseContext(ctxArg ?? null);
courseContextRef.current = ctxArg ?? null;  // síncrono — tryAutoplayNext lê o ref
```

**Invariante (D4):**
> Após qualquer `playTrack(track, ctxArg?)`, `courseContext === (ctxArg ?? null)`
> e `courseContextRef.current === (ctxArg ?? null)` — síncrono, antes de qualquer
> autoplay subsequente avaliar o ref.

Consequência direta no `tryAutoplayNext`: ao terminar um track Spotify (tocado
sem ctx), `courseContextRef.current === null` → o branch `if (ctxArg)` é pulado →
cai no fallback de fila → toca a próxima música. ✔

**Por que síncrono no ref:** `tryAutoplayNext` lê `courseContextRef.current` (não
o state) para evitar stale closure entre o `ended` e o próximo render. Setar o
ref na mesma chamada de `playTrack` garante que o autoplay subsequente enxerga o
valor correto sem esperar re-render (mesmo padrão já usado para `activeTrackRef`
em `playTrack:619`).

**Compatibilidade com biblioteca:** `playNext`/`playPrevious`/autoplay-de-curso
chamam `playTrack(next, { ...ctx, currentIndex })` — passam ctx, então o
courseContext é preservado/atualizado normalmente. Nada regride.

### Consequências
- **Positivas:** autoplay Spotify cai na fila corretamente; não há "vazamento" de
  contexto de curso entre fontes.
- **Negativas:** nenhuma — o branch library sempre passa ctx.
- **Neutras:** alinha com o padrão de ref síncrono já existente.

### Confiança
Alta.

---

## D5 — Token sempre fresco + volume no driver (B-TOKEN-CLOSURE / B-VOLUME-1)

### Problema
**B-TOKEN-CLOSURE:** a factory do driver (`connectSpotify`,
`AudioPlayerContext.tsx:1164-1228`) fecha sobre o `accessToken` **connect-time**.
Após um refresh (ou troca de source library→spotify que recria o driver), um
novo driver é construído com **token stale** do closure → 401 churn.

**B-VOLUME-1:** o Spotify sempre começa em 100% — o `useEffect[volume]`
(`AudioPlayerContext.tsx:860-876`) roda antes do driver existir, e o SDK ctor usa
`volume: 1.0` hardcoded. O volume atual do user não é aplicado ao driver recém-
construído.

### Decisão (D5)

**Token fresco — a factory lê `spotifyTokenRef.current` na construção:**

A factory NÃO captura `accessToken`/`expiresIn` por closure do escopo de
`connectSpotify`. Em vez disso lê `spotifyTokenRef.current` **no momento de
construir** o driver:

```ts
engineRef.current.setSpotifyDriverFactory((track: AudioTrack) => {
  const tok = spotifyTokenRef.current;            // <-- lido na CONSTRUÇÃO
  const driver = new SpotifyAudioDriver({
    accessToken: tok?.accessToken ?? "",
    expiresIn: tok?.expiresIn ?? 0,
    refresh: async () => {
      const r = await refreshAccessToken();
      return { accessToken: r.accessToken, expiresIn: r.expiresIn };
    },
    onTokenRefreshed: (newToken, newExp) => {
      spotifyTokenRef.current = {
        accessToken: newToken, expiresIn: newExp,
        displayName: spotifyTokenRef.current?.displayName,
      };
    },
    // ... outros callbacks inalterados
  });
  // D5 (B-VOLUME-1): aplica o volume atual logo após construir.
  try {
    const effective = isMutedRef.current ? 0 : volumeRef.current;
    driver.setVolume?.(effective);
  } catch { /* ignore */ }
  try { driver.connect?.(); } catch { /* ignore */ }
  return driver;
});
```

**Invariante (D5-token):**
> O `spotifyTokenRef.current` é a ÚNICA fonte de verdade do access token. Toda
> construção de driver lê o ref; todo `onTokenRefreshed` atualiza o ref. Nunca
> capturar `accessToken` por closure do parâmetro de `connectSpotify`.

Para isso, `connectSpotify` define `spotifyTokenRef.current = { accessToken,
expiresIn, displayName }` **antes** de registrar a factory (já faz —
`AudioPlayerContext.tsx:1148`). A factory deixa de usar os parâmetros
`accessToken`/`expiresIn` do escopo.

**Volume na construção — `volumeRef`/`isMutedRef`:**

Já existe `volumeRef` (`AudioPlayerContext.tsx:288-289`). Adicionar um
`isMutedRef` espelhando `isMuted` (mesmo padrão) para a factory ler o volume
efetivo sem depender de re-render. O `useEffect[volume,isMuted]` existente
(`:860`) continua propagando mudanças subsequentes ao `spotifyDriverRef.current`
— a novidade é só o **valor inicial** aplicado na construção.

### Consequências
- **Positivas:** sem 401 churn pós-refresh; volume do user respeitado desde a 1ª
  faixa Spotify.
- **Negativas:** mais um ref (`isMutedRef`). A factory passa a depender de refs —
  precisa garantir que `spotifyTokenRef` está populado antes da 1ª factory call
  (garantido: `connectSpotify` seta o ref na linha 1148, antes da factory).
- **Neutras:** `onTokenRefreshed` já atualiza o ref (mantido).

### Confiança
Alta.

---

## D6 — Cover whitelist SSoT por sufixo (B-COVER-1)

### Problema
A whitelist de hosts de capa só tem 3 hosts exatos (`i.scdn.co`,
`mosaic.scdn.co`, `wrapped-images.spotifycdn.com`) — duplicada em **dois lugares**
(server `spotifyAudio.ts:663` e client `sanitizeCoverUrl.ts:48`). Capas custom de
playlist/álbum usam `image-cdn-ak.spotifycdn.com`, `image-cdn-fa.spotifycdn.com`,
etc. → não passam na whitelist exata → `null` → placeholder cinza.

### Opções consideradas

**Opção A — Adicionar os hosts faltantes à lista exata (em ambos os lugares).**
- Contras: lista exata quebra a cada novo subdomínio CDN da Spotify; duplicação
  server/client diverge (lesson #10 — divergência silenciosa).

**Opção B — Allowlist por SUFIXO de domínio, em módulo `shared/` (escolhida).**
- Prós: cobre todos os subdomínios `*.scdn.co` / `*.spotifycdn.com` presentes e
  futuros; SSoT único consumido por server + client (sem divergência).
- Contras: ligeiramente menos restritivo (qualquer subdomínio dos 2 domínios
  raiz). Aceitável: são domínios proprietários da Spotify; o risco residual é
  baixo e o ganho de robustez é alto.

### Decisão (D6)

Criar `shared/spotifyCoverHosts.ts` com a regra de **sufixo de domínio**,
consumido por server e client (paridade garantida por import único).

```ts
// shared/spotifyCoverHosts.ts
const ALLOWED_COVER_SUFFIXES = [".scdn.co", ".spotifycdn.com"] as const;

/** true se hostname termina em um sufixo permitido (boundary-safe). */
export function isAllowedSpotifyCoverHost(hostname: string): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return ALLOWED_COVER_SUFFIXES.some(
    (sfx) => h === sfx.slice(1) || h.endsWith(sfx),
  );
}

/** Sanitiza uma cover URL Spotify: HTTPS + host permitido por sufixo. */
export function sanitizeSpotifyCover(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (!isAllowedSpotifyCoverHost(u.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}
```

**Boundary-safe:** o check `h === sfx.slice(1) || h.endsWith(sfx)` aceita
`scdn.co`, `i.scdn.co`, `image-cdn-ak.spotifycdn.com` mas **rejeita**
`evilscdn.co` (não termina em `.scdn.co`) e `scdn.co.evil.com`. O `.` inicial do
sufixo é o que garante o boundary de subdomínio.

**Consumidores migram para o SSoT:**
- `client/src/lib/audio-engine/sanitizeCoverUrl.ts:58` `sanitizeSpotifyCoverUrl`
  → delega para `sanitizeSpotifyCover` de `@shared/spotifyCoverHosts` (mantém o
  nome exportado p/ não quebrar callsites).
- `server/routes/spotifyAudio.ts:669` `sanitizeCoverFromSpotify` → delega para o
  mesmo módulo shared (remove o `ALLOWED_COVER_HOSTS` Set local).

**CSP:** o `img-src` da CSP (ADR-220) deve incluir `https://*.scdn.co
https://*.spotifycdn.com` para os subdomínios renderizarem. Verificar/atualizar a
allowlist CSP — fora do escopo de código mas anotado como pré-deploy.

### Consequências
- **Positivas:** capas custom de playlist/álbum aparecem; SSoT elimina
  divergência server/client; robusto a novos subdomínios CDN.
- **Negativas:** allowlist por sufixo é menos restritiva que host exato
  (aceitável — domínios proprietários Spotify). Precisa alinhar CSP `img-src`.
- **Neutras:** `sanitizeCoverUrl` (genérico, não-Spotify) permanece como está.

### Confiança
Alta.

---

## D7 — Reconciliação de status (B-BOOT-1 / B-DISCONNECT-SYNC / B-PANEL-401)

### Problema
Três bugs do mesmo eixo (status de conexão fica dessincronizado do driver real):

- **B-BOOT-1:** no bootstrap, `/status` diz `connected:true` (DB) mas `/refresh`
  falha (token revogado) → `resolveViaStatusFallback` retorna `null`,
  `connectSpotify` não roda, mas a query `["spotify-status"]` já cacheou `true`
  (60s) → UI mostra "conectado", driver é null → tocar = no-op silencioso.
- **B-DISCONNECT-SYNC:** `disconnectSpotify()` (`auth.ts:344`) só faz o POST; não
  invalida o status nem orquestra cleanup — depende do caller (só o painel faz).
- **B-PANEL-401:** `SpotifyConnectionPanel` usa `apiRequest("GET", status)` SEM
  silentMode → um 401 dispara o **logout global** (`window.location='/login'`).
  O hook `useSpotifyStatus` usa `fetch` resiliente (401 → `{connected:false}`).
  Dois fetchers de status com políticas divergentes.

### Decisão (D7): fetcher unificado + invalidação no helper de boot/disconnect

**(a) Fetcher de status unificado e resiliente — SSoT no hook.**

O `SpotifyConnectionPanel` para de usar `apiRequest("GET", status)` e passa a
consumir o **mesmo** fetcher resiliente do `useSpotifyStatus` (`fetch` com
`credentials:'include'`, 401 → `{connected:false}`, sem logout global). Extrair o
queryFn para um helper compartilhado se necessário:

```ts
// useSpotifyStatus.ts — exportar o fetcher p/ reuso (painel + hook).
export async function fetchSpotifyStatus(): Promise<SpotifyStatusResponse> {
  const resp = await fetch("/api/audio/spotify/status", { credentials: "include" });
  if (!resp.ok) return { connected: false };   // 401 NÃO desloga (resiliente)
  return (await resp.json()) as SpotifyStatusResponse;
}
```

O painel usa `useQuery({ queryKey: SPOTIFY_STATUS_QUERY_KEY, queryFn:
fetchSpotifyStatus })` — **mesma query key**, mesmo fetcher. Cache compartilhado
com o hook.

**Invariante (D7-fetcher):**
> Todo consumo de `GET /api/audio/spotify/status` no client usa
> `fetchSpotifyStatus` + a key `SPOTIFY_STATUS_QUERY_KEY`. Nenhum callsite usa
> `apiRequest` (que desloga em 401) para o status.

**(b) Bootstrap reconcilia status quando o refresh falha (B-BOOT-1).**

No bootstrap (`AudioPlayerContext.tsx:1240-1263`), quando
`resolveViaStatusFallback()` retorna `null` MAS o `/status` dizia `connected`,
**invalidar** `["spotify-status"]` para forçar refetch (que volta `false` se o
token foi revogado / sessão morta):

```ts
const fb = await resolveViaStatusFallback();
if (cancelled) return;
if (fb?.accessToken) {
  connectSpotify(fb.accessToken, fb.expiresIn, fb.displayName);
  invalidateSpotifyStatus();
} else {
  // B-BOOT-1: status pode estar cacheado como connected, mas o refresh
  // falhou -> driver null. Invalida p/ a query reconvergir p/ a verdade.
  invalidateSpotifyStatus();
}
```

`resolveViaStatusFallback` precisa distinguir "não conectado" de "conectado mas
refresh falhou" para o bootstrap saber se deve invalidar. Como hoje retorna
`null` em ambos, o bootstrap **sempre** invalida quando `fb` é null (simples e
correto: se não conseguiu token, a UI não deve afirmar "conectado"). O refetch
subsequente do `/status` reflete o estado real do server.

**(c) Invalidação dentro de `disconnectSpotify()` (B-DISCONNECT-SYNC).**

Mover `invalidateSpotifyStatus()` para **dentro** de `disconnectSpotify()`
(`auth.ts:344`), após o POST resolver — assim qualquer caller (painel, futuros)
fica sincronizado sem replicar a invalidação:

```ts
export async function disconnectSpotify(): Promise<void> {
  await apiRequest("POST", "/api/audio/spotify/disconnect");
  invalidateSpotifyStatus();   // B-DISCONNECT-SYNC: orquestra no helper
}
```

O painel continua chamando `audio.disconnectSpotifyDriver()` para o cleanup do
driver em memória (o helper de auth não conhece o context); a invalidação de
**query** passa a ser responsabilidade do helper. Sem dupla invalidação
problemática (idempotente).

**Fluxo consolidado** (ver `status-reconciliation-flow.mermaid`):
```
bootstrap → resolveViaStatusFallback
  ├─ token OK   → connectSpotify + invalidate (status → true real)
  └─ token null → invalidate (status reconverge → false; sem driver órfão)

disconnect (painel) → disconnectSpotify() { POST + invalidate }
                    → disconnectSpotifyDriver() (cleanup driver em memória)

status (painel + hook) → fetchSpotifyStatus (resiliente, 401 ≠ logout)
```

### Consequências
- **Positivas:** UI nunca afirma "conectado" com driver null; 401 no status nunca
  desloga o user; disconnect sincroniza por construção.
- **Negativas:** `disconnectSpotify` ganha efeito colateral (invalidação) — bem
  documentado; idempotente. O painel ainda precisa chamar
  `disconnectSpotifyDriver` (cleanup de memória) — não dá para mover ao auth.ts
  sem acoplar ao context.
- **Neutras:** `resolveViaStatusFallback` mantém retorno `null` (bootstrap
  decide invalidar).

### Confiança
Alta (B-PANEL-401/B-DISCONNECT-SYNC); Média no B-BOOT-1 (depende do timing de
cache da query — o "sempre invalida quando fb null" é a forma defensiva).

---

## D8 — `AudioTrack.artist` (B-ARTIST-1)

### Problema
O tipo `AudioTrack` (`types.ts:7`) **não tem campo de artista**. Os call sites de
`playTrack`/`addToQueue` em `SpotifySearchDialog` descartam `track.artists` (que o
server já manda — `spotifyAudio.ts:687`). MiniPlayerBar / ExpandedPlayerDialog /
QueuePopover mostram a linha secundária como `courseTitle` (= `null` para
Spotify) → barra sem artista.

### Decisão (D8): contrato do campo `artist`

**Tipo (lesson #7 — opcional, não required, para não quebrar callsites library):**

```ts
// types.ts AudioTrack:
export interface AudioTrack {
  source: AudioTrackSource;
  trackId: string;
  title: string;
  coverUrl?: string | null;
  courseTitle?: string | null;
  durationSeconds?: number;
  audioUrl?: string;
  hasAccess?: boolean;
  artist?: string | null;   // <-- NOVO. Spotify: artists.join(", "). Library: undefined.
}
```

Idem `AudioTrackLike` em `useQueueState.ts:9` (ganha `artist?: string | null`)
para propagar até o QueuePopover (RF-10.6).

**Propagação (contrato de quem popula):**
- `SpotifySearchDialog` `onPlay`/`onAdd`/`onPlayAll`/`onAddAll`/play-por-faixa:
  passam `artist: track.artists.join(", ")` no objeto do `playTrack`/`addToQueue`
  (o `SpotifyTrack.artists` já vem do server — só estava sendo descartado).
- Library: NÃO seta `artist` (fica `undefined`) — continua usando `courseTitle`.

**Renderização (precedência da linha secundária):**
```
linha secundária = activeTrack.artist ?? activeTrack.courseTitle ?? ""
```
- MiniPlayerBar (~`:462`), ExpandedPlayerDialog (`expanded-course-context` ~`:302`),
  QueuePopover item (~`:83-101`, `data-testid="queue-item-artist"`).
- Não renderizar linha vazia (se ambos null/undefined → omite a linha).

**Invariante (D8):**
> `artist` é opcional e source-agnostic na renderização: o consumer sempre usa a
> precedência `artist ?? courseTitle ?? ""`. Spotify popula `artist`; library
> popula `courseTitle`. Nenhum consumer assume um campo específico por source.

**Múltiplos artistas:** `artists.join(", ")` no dado; truncar via CSS
(`truncate`), nunca no dado (RF-03 nota de implementação).

### Consequências
- **Positivas:** now-playing completo (capa+título+artista) para Spotify; library
  não regride (campo opcional).
- **Negativas:** o campo precisa ser propagado em ~6 callsites + 3 consumers —
  esquecer um deixa a linha vazia. O test-writer cobre cada callsite.
- **Neutras:** `QueueItem.track` ganha `artist` por arrasto (mesmo objeto).

### Confiança
Alta.

---

## Resumo das mudanças de contrato (para o test-writer)

| # | Arquivo | Mudança de contrato |
|---|---|---|
| D1 | `SpotifyAudioDriver.ts` | `onStateChanged` vira FSM com `lastState` + dedupe `endedEmittedForUri`; reset em `load`/`play`. Emite `ended` 1x/faixa. |
| D2 | `SpotifySearchDialog.tsx` | `onPlayAll`/`onPlay`-busca/play-por-faixa → `clearQueue()` antes. `onAddAll`/`onAdd` → anexam. Drill-in row clicável. |
| D3 | `types.ts` + `SpotifyAudioDriver.ts` + `AudioPlayerContext.tsx` | `IAudioSourceDriver.resume()`. `useEffect[isPlaying]` chama `resume`/`pause` (não `play`). `play()` = load com uris. |
| D4 | `AudioPlayerContext.tsx` | `playTrack`: `setCourseContext(ctxArg ?? null)` + `courseContextRef.current = ctxArg ?? null` SEMPRE (síncrono). |
| D5 | `AudioPlayerContext.tsx` | factory lê `spotifyTokenRef.current` na construção (não closure); aplica `volumeRef`/`isMutedRef` ao driver pós-construção. |
| D6 | `shared/spotifyCoverHosts.ts` (novo) | allowlist por sufixo `.scdn.co`/`.spotifycdn.com`; server + client delegam ao SSoT. |
| D7 | `useSpotifyStatus.ts` + `auth.ts` + `AudioPlayerContext.tsx` + `SpotifyConnectionPanel.tsx` | `fetchSpotifyStatus` SSoT (resiliente). `disconnectSpotify` invalida status. Bootstrap invalida quando `fb` null. Painel usa o fetcher resiliente. |
| D8 | `types.ts` + `useQueueState.ts` + dialogs | `AudioTrack.artist?`/`AudioTrackLike.artist?`. Callsites passam `artists.join(", ")`. Render: `artist ?? courseTitle ?? ""`. |

## Não-regressão (RF-07 — preservar)
- `fetch.bind(globalThis)` no driver (linha ~103) — NÃO remover.
- `tryAutoplayNext` (fila/repeat/shuffle) NÃO reescrito — D1 só melhora o disparo
  de `ended`; D4 só corrige o courseContext que ele lê.
- Cap 50 da fila, tier gate `active`, singleton `queryClient` (lesson #29), CSP
  ADR-220, OAuth/refresh/reconnect — intactos.
- `pendingPlay` pré-ready preservado (D3 `resume` também enfileira pré-ready).

## Pendências / pontos de reversão
- **D2 / D8-A** (limpar fila ao tocar avulso da busca): se o founder achar
  agressivo, reabrir — trocar `onPlay` da busca para NÃO limpar.
- **D6 / CSP:** alinhar `img-src` da CSP com `https://*.scdn.co
  https://*.spotifycdn.com` (pré-deploy).
- **D1:** validar a sequência real do SDK no browser (`/verify`) — unit garante o
  contrato, browser confirma o encadeamento de autoplay.
