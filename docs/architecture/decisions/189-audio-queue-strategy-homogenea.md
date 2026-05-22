# ADR-189: Audio queue strategy = homogenea (troca driver explicito)

## Status

Aceito — 2026-05-22.

## Data

2026-05-22

## Contexto

O Sprint Mini Player 2 (MP2) introduz o segundo `IAudioSourceDriver` real (`SpotifyAudioDriver`) ao lado do `LibraryAudioDriver` (HtmlAudio) ja shipped em MP1. A presenca de dois drivers funcionais expoe uma decisao arquitetural que foi deliberadamente adiada em MP1: **como modelar a fila de reproducao quando ela pode conter itens de fontes diferentes?**

Tres cenarios concretos forcam a decisao agora, antes de MP3 introduzir Queue UI persistente (drag-and-drop reorder/skip/repeat/shuffle):

1. **User toca musica Spotify -> clica aula Coach na Biblioteca.** O que acontece?
2. **User toca aula Coach -> clica nudge para retomar musica.** O que acontece?
3. **MP3 Queue UI: itens mistos (musica Spotify + aula Coach + musica Spotify) na mesma fila?**

Forcas em jogo:

1. **Lesson MP1: 3 iteracoes na abstracao `AudioSourceEngine` ja absorvidas.** O memory file `session_2026-05-22-mini-player-1-shipped.md` registra que cada iteracao custou ~1 dia de refactor. Uma 4a iteracao em MP2 ou MP3 e o risco a mitigar.
2. **Spotify Web Playback SDK toma audio focus do tab.** Quando o SDK inicializa um device + da play, ele agressivamente pausa qualquer `<audio>` HTML5 no mesmo tab. Codigo aplicativo nao tem como garantir "2 drivers tocam simultaneamente" no mesmo tab — o SO/browser arbitra. Forcar coexistencia e nadar contra a maré da plataforma.
3. **Spotify SDK exige `device_id` unico por user.** Multi-tab Spotify ja e known limitation (spec MP2 secao 11.4). Multiplos drivers Spotify simultaneos no mesmo tab nao faz sentido conceitual.
4. **Premium gate, token refresh, reconnect: state critico por-driver.** Tratar fila como heterogenea exigiria expor esse state ao orchestrator de fila — alto acoplamento.
5. **Debug de fila mista e dificil.** Logs + telemetria precisam diferenciar "fila X do driver A" vs "fila Y do driver B" + "switch entre filas". Cognitive load alto pra time de 1 dev + IA.

### Benchmark de mercado (strategist report MP2)

| Player | Estrategia de fila |
|---|---|
| **Spotify desktop** | Homogenea — fila so de Spotify content. Mudou pra YouTube? Pausa Spotify. |
| **Apple Music** | Homogenea. Podcasts + Music sao apps separados (mesma conta, ui diferente). |
| **Tidal** | Homogenea. |
| **Plex** | Homogenea por library type (music / podcast / video sao filas separadas). |
| **Roon** | Homogenea por zone (1 fila por output device). |
| **YouTube Music** | Homogenea — videos e tracks na mesma fila SO porque ambos sao YouTube content. |

Nao encontramos nenhum player mainstream que faca queue mista cross-source. O custo de UX de explicar "fila mista" + "ordem inter-source" + "shuffle entre sources" eh alto demais.

## Opcoes Consideradas

### Opcao 1: Queue mista (fila unica com itens de N sources)

Engine mantem `queue: AudioTrack[]` onde cada item tem `source: 'library' | 'spotify'`. Ao avancar, Engine instancia driver correto on-the-fly.

- **Pros:**
  - UI Queue (MP3) mais "magica" — user nao pensa em source.
  - Permite resume-after-coach automatico ("aula acabou -> proximo item Spotify").
- **Contras:**
  - Engine precisa de orchestrator complexo: destroy driver A + instantiate driver B + transfer state (volume, sleep timer, repeat mode) em cada transition. Iteracao #4 da abstracao garantida.
  - Spotify SDK takes ~1-2s pra connect — gap audivel entre items inter-source.
  - Premium gate, OAuth, token refresh: state critico precisa ser exposto ao orchestrator OU duplicado por-driver.
  - Telemetria explode em complexidade ("track 3 de 7 era Spotify mas device offline, pulou pra track 4 library, depois track 5 Spotify foi pause porque token expirou…").
  - UX nao tem precedente claro (zero players mainstream fazem). User aprendeu padrao "1 source por sessao" — quebrar isso e atrito.
  - Multi-tab + multi-device coordination (MP3) vira pesadelo.

### Opcao 2: Driver federation (smart routing)

Engine roteia request por "intent" (e.g. `playByQuery('lofi beats')` -> escolhe driver baseado em config). Cada driver mantem propria fila.

- **Pros:**
  - Flexibilidade pra futuros drivers (Apple Music, YouTube).
- **Contras:**
  - Overkill pra 2 drivers atuais.
  - Implementacao requer abstracao `MediaQuery` separada de `AudioTrack` — bumping da `IAudioSourceDriver` interface. **Iteracao #4 garantida.**
  - User nao se beneficia hoje (1 device, 1 source primario).

### Opcao 3 (escolhida): Queue HOMOGENEA + troca driver EXPLICITA

`AudioSourceEngine` mantem 1 driver ativo por vez. Troca de driver acontece SO via user action explicita (click em aula Coach quando Spotify ativo, ou click em musica Spotify quando aula Coach ativa). Ao trocar:

1. `oldDriver.pause()` (D10 spec — explicit handoff).
2. Telemetria `audio_focus_lost` + `audio_driver_switch` emitidas (ADR-191).
3. `oldDriver.destroy()` — libera SDK Spotify ou descarrega `<audio>` HTML5.
4. `newDriver = createDriver(track.source)` + `newDriver.load(track)` + `newDriver.play()`.
5. Telemetria `audio_driver_active` heartbeat 60s comeca.

Queue (MP3) sera por-driver: ao trocar driver, queue do driver antigo NAO transfere. User precisa reconstruir fila do novo driver. UI mostra "Queue Coach: 3 aulas" ou "Queue Spotify: playlist X" — sempre singular.

`IAudioSourceDriver` interface **NAO muda em MP2**. Continua a mesma de MP1.

- **Pros:**
  - Engine ja faz `destroy + instantiate` (MP1 RF-06). Zero refactor da abstracao. **Evita iteracao #4** (lesson MP1).
  - Cada driver isolado: state critico (premium, OAuth, SDK lifecycle) nao vaza pra Engine.
  - Telemetria simples: `audio_driver_active` heartbeat + `audio_driver_switch` evento.
  - Debug trivial: "qual driver ativo agora? -> 1 entry".
  - Falha de 1 driver (SDK Spotify nao responde) nao corrompe o outro.
  - Alinha com 6/6 players mainstream do benchmark.
  - MP3 Queue UI vira simples (1 fila por driver).
  - Multi-tab coordination viavel: cada tab um driver, ambos podem ser Spotify (CDC `not_ready` arbitra).
- **Contras:**
  - User precisa clicar manualmente "voltar pra musica" apos Coach acabar (MP3 RF-resume-after-coach pode mitigar via prompt). RF-04.3 telemetria mede frequencia desse switch — se < 10% dos users, default OK; se > 30%, MP3 prioriza resume prompt.
  - Free user que conectou Spotify nao consegue "mixar" Coach + musica simultaneamente. Aceitavel — persona principal e Premium.

## Decisao

**Queue HOMOGENEA + troca driver EXPLICITA via user action.**

- `AudioSourceEngine` continua com 1 driver ativo por vez (`activeDriver: IAudioSourceDriver | null`).
- Troca de driver: usuario clica item de outra fonte -> Engine executa `pause + destroy + instantiate + load + play` atomicamente. Telemetria `audio_focus_lost` (driver antigo) + `audio_driver_switch` (transition) + `audio_driver_active` heartbeat (driver novo) emitidas via ADR-191.
- `IAudioSourceDriver` interface **NAO muda** em MP2. Iteracao #4 da abstracao **explicitamente evitada**.
- UI mostra prompt explicito quando troca acontece ("Trocando para Spotify..."), nao silent transition. Lesson MP1.3 MEDIUM-1 "sem silent no-op".
- Premium gate trivial: por-driver (`SpotifyAudioDriver.connect()` valida via Me API), **NAO por-item da fila**. User decide 1x "minha conta Spotify e Premium ou nao".
- Resume-after-coach automatico defer MP3 (RF candidato, gated por telemetria RF-04.3).

### Q-L resolvida (RF-05.2 spec MP2)

Mantemos o naming **`useOptionalAudioPlayer`** (atual em `AudioPlayerContext.tsx`). Custo de trocar (codemod cross-file + grep em todos os testes + risco de miss em snapshot tests) supera o beneficio nomenclatural. JSDoc do hook sera atualizado explicando porque "Optional" (vs Safe / OrNull): o hook retorna `null` legitimamente quando consumer renderiza fora do `AudioPlayerProvider` (uso em testes que nao montam o provider, e em paginas que renderizam `<Sidebar/>` standalone). Lesson MP1.2 ja registra "decisao original reforcada".

## Consequencias

### Positivas

- Engine MP1 (`AudioSourceEngine.swapDriver()`) reaproveitada sem mudancas. **Zero refactor da abstracao em MP2.**
- Cada driver mantem state critico isolado (OAuth Spotify, SDK lifecycle, premium check, token refresh, reconnect retry) — Engine nao precisa saber.
- Telemetria simples: 3 eventos cobrem todo o ciclo de vida (`audio_driver_active`, `audio_driver_switch`, `audio_focus_lost`). Ver ADR-191.
- Falha de 1 driver nao corrompe o outro. Spotify SDK quebrado? HtmlAudio segue funcionando. HtmlAudio falha? Spotify segue.
- MP3 Queue UI tera escopo cirurgico: drag-and-drop apenas dentro do driver ativo. UI mostra "Queue Coach" ou "Queue Spotify" — nunca mista.
- Multi-tab coordination viavel sem orchestrator central. Cada tab um driver, Spotify CDC `not_ready` event arbitra device unico.
- Decisao alinha com 6/6 players mainstream do benchmark — UX familiar pro user.
- Premium gate trivial: por-driver, nao por-item. Sem complexidade de "alguns items da fila bloqueiam, outros nao".
- Telemetria RF-04.3 (MP2 spec) mede % users que trocam driver na mesma sessao. Dados informam decisao MP3 sobre resume-after-coach feature.

### Negativas

- User precisa clicar manualmente "voltar pra Spotify" apos Coach lesson acabar (MP3 RF candidato mitiga).
- Free user Spotify nao pode "mixar" Coach + musica simultaneamente. Aceitavel — persona principal e Premium.
- Resume-after-coach automatico (que seria "magico" em queue mista) defer MP3 + gated por telemetria.

### Neutras

- ADR-191 (telemetria via `user_activity`) acopla a esta decisao: 3 eventos novos especificos pra orchestracao homogenea (`audio_driver_active`/`switch`/`focus_lost`).
- Spec MP2 secao 13 lista "MP2 cresce escopo (Queue UI volta)" como risco MEDIUM — este ADR fecha a brecha: reviewer deve enforcar.

## Confianca

Alta. Decisao alinhada com:
- Benchmark de mercado (6/6 players mainstream).
- Lesson MP1 (evitar iteracao #4 da abstracao).
- Constraints de plataforma (Spotify SDK toma audio focus, device_id unico).
- Strategist + founder ja travaram em conversa anterior (memory `session_2026-05-22-mini-player-1.2-shipped.md`).

## Referencias

- ADR-187 (`AudioSourceEngine` abstraction).
- ADR-188 (Mini Player FSM + z-index hierarchy).
- ADR-190 (Spotify token storage = httpOnly cookie via server proxy).
- ADR-191 (Telemetria audio = reuse `user_activity`).
- Spec `Docs/specs/sprint-mini-player-2.md` secao 3 D1 (queue homogenea travada).
- Memory `session_2026-05-22-mini-player-1-shipped.md` (3 iteracoes da abstracao).
- Memory `session_2026-05-22-mini-player-1.2-shipped.md` (decisao `useOptionalAudioPlayer` reforcada).
- Diagrama `Docs/architecture/diagrams/mini-player-2/driver-switch-sleep-timer.mermaid`.
