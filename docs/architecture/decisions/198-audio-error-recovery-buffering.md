# ADR-198: Audio error recovery + buffering states no cluster MiniPlayer

## Status

Accepted — 2026-05-22 (Sprint Mini Player 3.1 Wave B / TIER 3 #5 + #6).

## Context

Pre-Wave B: erros do `<audio>` HTML5 + Spotify Web Playback Driver eram engolidos
silenciosamente (handler `eng.on('error')` so emitia telemetry). User via:

- Click play -> nada acontece (no spinner, no feedback).
- Track corrompida -> player aparenta congelado.
- Spotify offline / token expirado -> "for sempre" no `isPlaying=true` state
  vazio.

Falta tambem feedback visual de **buffering** entre track switch — momento entre
`playTrack()` e `canplay/timeupdate` do driver. Spotify pode levar 1-3s pra
deviceId resolver + reproducao iniciar; user clica varias vezes "play" achando
quebrado.

## Decision

Surface contratual no `AudioPlayerContext`:

```ts
interface AudioPlayerCtx {
  // ... existing ...
  loadError: string | null;     // null = sem erro; string = mensagem
  retryCurrent: () => void;     // re-tenta playback da track corrente
  clearLoadError: () => void;   // user dismiss / pular reset
  isBuffering: boolean;         // true durante load / waiting
}
```

**Buffering**:

- `playTrack()` arma `isBuffering=true` + timer de 10s (`BUFFERING_TIMEOUT_MS`).
- `<audio>` element `onCanPlay` + `onWaiting` + `onTimeUpdate` (1o tick) ->
  desarma buffering.
- Engine `timeupdate` event (Spotify path) -> desarma buffering tambem.
- Timer 10s sem desarmar -> trata como erro (`audio_track_error` com reason
  `buffering_timeout` + `loadError='timeout'`).

**Error**:

- `<audio onError>` lê `e.currentTarget.error` -> seta `loadError` driver-agnostic.
- Engine `on('error')` (Spotify driver) seta `loadError` tambem.
- Telemetria `audio_track_error` emitida com `source` (`html_audio` / `driver` /
  `buffering_timeout`).

**Retry**:

- `retryCurrent()` re-chama `audio.load() + play()` (library) ou
  `engine.playTrack(track)` (Spotify). Limite **3 tentativas** via
  `retryCountRef`. Apos 3, `retryCurrent` vira no-op (UI deve mostrar "Pular").

UI no `MiniPlayerBar`:

- **Spinner** `Loader2` overlay sobre o play button quando `isBuffering=true`
  (`data-testid="audio-buffering-spinner"`).
- **Error banner** acima da barra com `AlertTriangle` + mensagem + 2 botoes:
  - "Tentar novamente" -> `retryCurrent()`
  - "Pular" -> `clearLoadError() + playNext()`
  (`data-testid="audio-error-banner"` + `audio-error-retry` + `audio-error-skip`).

## Alternativas Consideradas

**A. Auto-retry infinito.** Rejeitada: cria loop em rede ruim / track 404 + custos
em quota Spotify (rate limit). 3 retries equilibra UX + custo.

**B. Toast/snackbar em vez de banner inline.** Rejeitada: toast esconde antes do
user reagir + 2 superficies de UI auditiva concorrentes (player + toast) confuso.

**C. Skeleton no album art durante buffering.** Adiavel — spinner no play button
ja eh suficiente para feedback sem repaintar a barra inteira.

**D. Sem timeout (deixa buffering ate driver responder).** Rejeitada: drivers
podem ficar zombie (Spotify SDK ja teve casos no MP2 reviewer). 10s eh tolerante
(media de Spotify boot ~1.5s; library HTTP <500ms).

**E. retryCount visivel no contrato.** Adiavel — UI atual nao precisa diferenciar
"primeira falha" vs "terceira"; a apresentacao do botao Pular cobre os 2 casos
e o limite vive como invariante interno.

## Consequencias

**Positivas:**
- Feedback visual em 100% dos falhas. Sem state zombie.
- Retry barato sem reload.
- "Pular" como escape hatch.

**Negativas:**
- 10s eh "alto" pra mobile 3G — usuario pode achar lento. Trade-off: prefira
  errar pro lado conservador (evita falsos positivos em redes lentas).
- Banner ocupa espaco vertical acima da barra. Em mobile com viewport curto pode
  ficar apertado — aceito (eh estado de erro, raro).

**Neutras:**
- 3 retries hard-coded. Wave C pode adicionar config server-side se necessario.

## Implementacao

- `AudioPlayerContext.tsx`: `loadError` / `isBuffering` / `retryCurrent` /
  `clearLoadError` adicionados ao `useMemo` value + deps. `playTrack` arma
  buffering. `<audio onError/onCanPlay/onWaiting>` handlers wirados. Engine
  `on('error')` propaga pra surface. `close()` reseta.
- `MiniPlayerBar.tsx`: spinner overlay no play button + error banner acima
  da barra.

Testes: `tests/client/mini-player-3-1-b/AudioPlayerContext.errorBuffering.test.tsx`
(3 tests cobrindo surface + playTrack arma buffering + retry/clear no-throw).
