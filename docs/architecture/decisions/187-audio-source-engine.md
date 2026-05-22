# ADR-187: AudioSourceEngine abstraction + driver pattern (Mini Player 1, RF-06)

## Status

Aceito — 2026-05-21.

## Data

2026-05-21

## Contexto

A spec **Sprint Mini Player 1** (`Docs/specs/sprint-mini-player-1.md`) prevê 4 fases:

- **Fase 1 (esta sprint):** Mini Player persistente + Grind Live bridge consumindo audio HTML5 da biblioteca.
- **Fase 2:** Botão 🎧 no `SessionHeader` (também nesta sprint, unificada).
- **Fase 3:** Queue de reprodução.
- **Fase 4 (RF-06 prepara, NÃO implementa):** suporte ao **Spotify Web Playback SDK** — Premium-only, exige auth OAuth, runtime totalmente diferente (não há `<audio>` element; o SDK envia comandos a um player remoto que toca via servidor Spotify).

O `AudioPlayerContext` shipped em Biblioteca-1 (`commit ba74c917`) hoje fala direto com um `HTMLAudioElement` (ref local dentro do Provider). Para suportar Spotify em Fase 4 sem reescrever a surface inteira do contexto, **precisamos de uma camada de abstração entre o contexto (React/UI) e o backend de áudio (HTML5 vs Spotify SDK)**.

A spec materializa essa camada como **`AudioSourceEngine`** (singleton em `client/src/lib/audio-engine/`) + interface `IAudioSourceDriver` + discriminated union `AudioTrack` com `source: 'library' | 'spotify'`. Esta sprint só implementa `LibraryAudioDriver`; `SpotifyAudioDriver` fica como stub que lança erro até Sprint Mini Player 2.

Forças em jogo:

1. **Contrato estável.** Contexto não pode trocar API pública (lesson #14 do RF-14: `play(lesson)` legado precisa continuar funcionando para `LessonViewer` / `PodcastPlayer`).
2. **Surface React isolada do runtime de áudio.** UI (volume scroll wheel, displayMode, glassmorphism) é responsabilidade do contexto; load/play/pause/seek/timeupdate é responsabilidade do driver.
3. **Bundle controlado.** RNF-01 limita `MiniPlayerBar` a 8KB gzip always-mounted. `SpotifyAudioDriver` (~30KB SDK) **não pode** entrar no bundle main — precisa ser lazy quando o user conectar Spotify.
4. **Testabilidade.** Driver substituível = mock trivial em Vitest (sem precisar mockar `HTMLAudioElement` em todos os testes do contexto).
5. **Migração futura para Web Audio API.** Crossfade entre tracks (Fase 3+) exige Web Audio. Driver abstraction permite trocar implementação sem mudar consumidores.

## Opções Consideradas

### Opção 1: Estender `AudioPlayerContext` com `if/else` por `source`

Adicionar branches no contexto que escolhem entre `audioRef.current.play()` (library) e `spotifyPlayer.resume()` (spotify).

- **Prós:**
  - Sem código novo (nem `lib/audio-engine/`, nem interface).
  - Fluxo direto, sem indireção.
- **Contras:**
  - Mistura responsabilidades: contexto vira gigante (volume scroll + displayMode + glassmorphism + load/play/pause/seek de 2 runtimes).
  - Cada nova feature de player vira N branches.
  - Testes do contexto teriam que mockar `HTMLAudioElement` **e** Spotify SDK.
  - Bundle do contexto sempre carrega ambos os runtimes (sem lazy split natural).
  - Lesson genérica: violando **separation of concerns** acaba forçando refactor caro depois (vide `coachContext.ts` antes da extração de `anthropicClient.ts` em AI-3.1).

### Opção 2: Plugin system com registry runtime

`AudioSourceEngine.register('library', LibraryAudioDriver)` + `engine.register('spotify', SpotifyAudioDriver)` em tempo de bootstrap. Plug-and-play.

- **Prós:**
  - Extensível: 3o driver (Apple Music?) cabe sem mudar core.
  - Cada driver tem ciclo de vida independente.
- **Contras:**
  - Over-engineering para 2 drivers conhecidos (library + spotify). YAGNI vivo.
  - Registry runtime exige descoberta dinâmica (`engine.getDriver(source)` retorna `IAudioSourceDriver | undefined` — type-safety mais fraca que discriminated union).
  - Mais código para o mesmo resultado.
  - Lazy-load de driver via registry exige import dinâmico explícito mesmo assim (não ganha nada vs Opção 3).

### Opção 3: Herança clássica (`abstract class AudioSourceDriver`)

`abstract class AudioSourceDriver { abstract load(...); ... }` + `class LibraryAudioDriver extends AudioSourceDriver { ... }`.

- **Prós:**
  - Métodos comuns (ex.: `clamp(0,1)` no `setVolume`) ficam no base class.
- **Contras:**
  - TypeScript prefere composição (interfaces + funcionalidade compartilhada via utility) — herança hierárquica complica testes (mock de classe abstrata é mais verboso).
  - Spotify Driver e HTML5 Driver **não compartilham implementação**, só contrato. Herança aqui não economiza código real.
  - Difícil tree-shake métodos não usados (interface é dropada pelo compilador; classe abstrata fica no bundle).

### Opção 4 (escolhida): Interface `IAudioSourceDriver` + discriminated union `AudioTrack` + `AudioSourceEngine` facade

- **Prós:**
  - **Contrato explícito** (interface TS) sem custo runtime — apaga no compile.
  - **Discriminated union** garante type-safety no `playTrack`: `if (track.source === 'spotify') { ... }` reduz tipo automaticamente.
  - **Lazy import** trivial: `const { SpotifyAudioDriver } = await import('./SpotifyAudioDriver')` quando user conecta Spotify pela 1a vez.
  - **Mock** em testes = qualquer objeto que satisfaça `IAudioSourceDriver` (`{ source: 'library', load: vi.fn(), play: vi.fn(), ... }`).
  - **Facade thin:** `AudioSourceEngine` só roteia (`activeDriver = pickDriver(track.source); activeDriver.load(track); ...`); zero lógica de UI.
  - Padrão alinhado a outros módulos do projeto (`server/services/fx/adapters/{bcbPtaxAdapter,frankfurterAdapter}` — ADR-163 / AI-3 wave).
- **Contras:**
  - Mais 3 arquivos novos (`types.ts`, `LibraryAudioDriver.ts`, `AudioSourceEngine.ts`).
  - Indireção: `MiniPlayerBar` → `AudioPlayerContext` → `AudioSourceEngine` → `LibraryAudioDriver` → `<audio>`. Aceitável dado o ganho de testabilidade + extensibilidade.

## Decisão

Adotamos **Opção 4**.

**Estrutura final:**

```
client/src/lib/audio-engine/
├── types.ts                  # AudioTrack, AudioTrackSource, IAudioSourceDriver
├── LibraryAudioDriver.ts     # wrapper HTMLAudioElement (Fase 1)
├── SpotifyAudioDriver.ts     # STUB — throw 'Spotify driver not implemented' (Fase 4)
└── AudioSourceEngine.ts      # singleton facade: pickDriver(source) + playTrack(track)
```

**Contratos (paridade com seção 5/RF-06 da spec):**

```typescript
// types.ts
export type AudioTrackSource = 'library' | 'spotify';

export interface AudioTrack {
  source: AudioTrackSource;
  trackId: string;          // lessonId pra library, spotify URI pra spotify
  title: string;
  coverUrl?: string | null;
  courseTitle?: string | null;
  durationSeconds?: number;
  audioUrl?: string;        // só presente quando source='library'
}

export interface IAudioSourceDriver {
  readonly source: AudioTrackSource;
  load(track: AudioTrack): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  setVolume(v: number): void;       // 0..1
  setSpeed(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
  on(
    event: 'timeupdate' | 'ended' | 'durationchange' | 'error',
    handler: (data?: any) => void
  ): () => void;                    // retorna unsubscribe
}
```

**Responsabilidade do Engine vs Contexto vs Driver:**

| Camada | Responsabilidade |
|---|---|
| `MiniPlayerBar` / `MiniPlayerExpanded` | UI pura: cliques, hover, scroll wheel, glassmorphism, animações, displayMode. |
| `AudioPlayerContext` | Estado React (volume, isMuted, speed, currentSeconds, courseContext, displayMode), persistência `localStorage`, listeners do `mediaSession`, telemetria `library_events`, autoplay decision tree (RF-05). |
| `AudioSourceEngine` (facade) | Pick driver por `track.source`. `playTrack(track)` = `if (activeDriver?.source !== track.source) { activeDriver?.destroy(); activeDriver = createDriver(track.source); } await activeDriver.load(track); await activeDriver.play();`. Forward events `timeupdate / ended / durationchange / error` ao contexto. |
| `LibraryAudioDriver` | Wrap `HTMLAudioElement`: `audioEl.src = track.audioUrl; await audioEl.play()`. Listeners → mapeia eventos nativos `timeupdate` / `ended` / `durationchange` / `error` para o evento da interface. |
| `SpotifyAudioDriver` (Fase 4) | Wrap Spotify Web Playback SDK. STUB nesta sprint. |

**Observação sobre o `<audio>` element.** O `<audio>` continua renderizado dentro do `AudioPlayerProvider` (lesson #12 — Provider acima do Router), mas o **controle** dele passa pelo `LibraryAudioDriver` via `ref` forwarded. O contexto não chama `audioRef.current.play()` diretamente mais — chama `engine.playTrack(track)`.

## Consequências

**Positivas:**

- Sprint Mini Player 2 (Fase 4 Spotify) vira **só implementar `SpotifyAudioDriver`** + OAuth flow + lazy import; zero refactor no `AudioPlayerContext`, `MiniPlayerBar`, `MiniPlayerExpanded`, `LessonPickerDialog`.
- Testes do contexto mockam `IAudioSourceDriver` (objeto vi.fn) sem precisar de polyfill `HTMLAudioElement`. Reduz fragilidade dos testes (lesson #15 sobre polyfills em `tests/setup.ts`).
- Discriminated union `AudioTrack.source` dá type-safety completa no `playTrack(track)` — TS infere o tipo correto em cada branch.
- Trade-off Fase 3 (Web Audio API para crossfade): trocar `LibraryAudioDriver` por `WebAudioLibraryDriver` sem mudar surface.
- Backward compat preservada: `play(lesson)` legado vira `playTrack({ source: 'library', ... })` por wrapper (RF-14 + ADR-188).

**Negativas:**

- +3 arquivos novos (`types.ts`, `LibraryAudioDriver.ts`, `AudioSourceEngine.ts`) — ~250 linhas a manter.
- Indireção a mais: dev novo precisa entender 4 camadas (UI → Contexto → Engine → Driver). Mitigado por este ADR + diagrama `Docs/architecture/diagrams/mini-player-1/autoplay-sequence.mermaid`.
- Bundle base cresce ~2-3KB gzip pelo Engine + types + LibraryAudioDriver. Aceitável dentro do RNF-01 (orçamento 8KB).
- `SpotifyAudioDriver` stub que lança erro pode confundir grep futuro — comentar com `// PLACEHOLDER — implementar em Sprint Mini Player 2` no topo do arquivo.

**Neutras:**

- Padrão `IAudioSourceDriver` segue convenção de outros adapters do projeto (ex.: `bcbPtaxAdapter` / `frankfurterAdapter` em `server/services/fx/adapters/`). Consistência interna.
- `AudioSourceEngine` é singleton **dentro do React tree** (instanciado uma vez no `AudioPlayerProvider`). Não é singleton global JS — facilita HMR + testes paralelos.

## Confiança

**Alta.** Padrão clássico (driver pattern + facade) com precedente interno (`fx/adapters/*` shipped AI-3). Risco residual concentrado no mock do `HTMLAudioElement` em testes (mitigado por polyfills já existentes em `tests/setup.ts`, lesson #15).

## Referências

- Spec: `Docs/specs/sprint-mini-player-1.md` §5 RF-06, §17 nota 1 (lesson #12).
- Diagrama complementar: `Docs/architecture/diagrams/mini-player-1/autoplay-sequence.mermaid`.
- ADR irmão: `ADR-188` (displayMode FSM + z-index).
- Lessons relacionadas: #12 (Provider acima do Router), #14/#15/#26 (testes de componentes React + polyfills jsdom), #36 (mocks parciais de módulos com discriminated union).
- Precedente: `server/coach/anthropicClient.ts` (ADR-176 AI-3.1) — facade thin com retry/error handling extraído do contexto.
