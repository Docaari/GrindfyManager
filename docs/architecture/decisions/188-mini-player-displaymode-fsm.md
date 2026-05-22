# ADR-188: Mini Player displayMode state machine + z-index hierarchy (Mini Player 1, RF-04 + RF-11)

## Status

Aceito — 2026-05-21.

## Data

2026-05-21

## Contexto

A `MiniPlayerBar` (RF-01) é **always-mounted** dentro do `AudioPlayerProvider`. Tem 3 estados visuais distintos:

- **`hidden`** — bar invisível, sem track ativa (estado inicial / pós-`close()` / pós-`onEnded` sem próxima).
- **`bar`** — surface principal, fixed bottom-0 z-40, todos controles RF-02 renderizados conforme breakpoint RF-10.
- **`expanded`** — painel maior renderizado **acima** da bar (RF-04: cover 120×120, controles espacados, lista readonly de aulas do curso).

Transições não são óbvias: `playTrack` muda `hidden → bar`, click no cover muda `bar → expanded`, click no backdrop minimiza `expanded → bar`, X explícito fecha `expanded → hidden` (passa transient por `bar`), `prefers-fullscreen` no `LessonViewer` esconde temporariamente (`bar → hidden`, reload pós-fullscreen restaura `'bar'`), Esc tem comportamento contextual (expanded primeiro minimiza, depois fecha).

Além disso, o Mini Player **convive** com:

- **MiniChat** (`client/src/components/MiniChat.tsx`) — fixed bottom-4 right-4 **z-50** (verificado em código). Deve continuar acima.
- **Radix Dialog** (LessonPickerDialog, modais existentes) — z-[100] padrão Shadcn.
- **Sonner / toasts** — z-[9999] padrão.
- **Body padding-bottom condicional** — sem padding, conteúdo de páginas (Dashboard scroll fundo, GradePlanner cells, GrindSessionLive bottom controls) fica escondido atrás da bar.

Forças em jogo:

1. **Estados inválidos não podem existir.** `expanded` sem `current` é estado nonsense — TS precisa preveni-lo.
2. **Transições documentadas.** Founder QA (seção 13.1 itens 11/12/13/19) e test-writer dependem de FSM canônica.
3. **Z-index map estável.** Validar empírico nas 5 superfícies concorrentes (MiniChat, MiniPlayer bar, MiniPlayer expanded, Radix Dialog, toasts).
4. **Sem persistência cross-session.** D4 + D7 + D8 alinham: refresh = `hidden`. Reload nunca abre `expanded`.
5. **Esc contextual.** Esc com `expanded` → `bar`; Esc com `bar` → `hidden`. RF-13 + Q-B.

## Opções Consideradas

### Opção 1: Booleans separados (`isVisible` + `isExpanded`)

`{ isVisible: boolean; isExpanded: boolean }` no contexto.

- **Prós:**
  - Familiar para devs React.
  - Sem união tagged a aprender.
- **Contras:**
  - Permite **4 combinações** das quais 1 é inválida: `{ isVisible: false, isExpanded: true }` = "expanded escondido" → estado nonsense.
  - TS não bloqueia o estado inválido (precisa runtime guard espalhado: `if (!isVisible && isExpanded) { throw ... }`).
  - Transições não-óbvias se espalham: `setExpanded(true); setVisible(true)` em 2 calls, podem dessincronizar.
  - Esc contextual precisa de `if (isExpanded) setExpanded(false); else if (isVisible) setVisible(false)` em call site — fácil de errar.

### Opção 2: Zustand / Jotai (state machine externa)

Migrar estado do player para store externa.

- **Prós:**
  - Selectors finos previnem re-renders (RNF-05).
- **Contras:**
  - Over-engineering: state local do player não compartilha com outras features do projeto.
  - Mais 1 dep no bundle (Zustand ~3KB, Jotai ~6KB).
  - Projeto não usa Zustand/Jotai hoje (TanStack Query + React Context são padrão). Quebra convenção.

### Opção 3: XState / Robot (FSM library)

State machine declarativa formal.

- **Prós:**
  - FSM auto-documentada via DSL.
  - Visualizador gráfico (XState Inspector) bonito para apresentar founder.
- **Contras:**
  - XState ~30KB gzip = 4x o RNF-01 inteiro (8KB). Inviável.
  - Robot é mais leve (~1KB) mas adiciona dep para FSM minúscula (3 estados).
  - Curva de aprendizado: dev novo precisa entender DSL do XState/Robot.

### Opção 4 (escolhida): FSM explícita em context com TS union literal + pure transition functions

```typescript
type DisplayMode = 'hidden' | 'bar' | 'expanded';

// Pure transition functions (cobertas em testes unit):
function canExpand(current: AudioTrack | null): boolean;
function nextOnEsc(mode: DisplayMode): DisplayMode;
function nextOnClose(mode: DisplayMode): DisplayMode;
function nextOnPlayTrack(mode: DisplayMode): DisplayMode;
```

- **Prós:**
  - Estados inválidos prevenidos no compile-time (`displayMode === 'expanded'` exige check `current !== null` antes — TS narrowing).
  - Transições puras = testáveis sem render React (Vitest unit puro).
  - Zero dep extra; zero overhead bundle.
  - Documentadas no diagrama Mermaid `displayMode-state-machine.mermaid` — fonte canônica.
  - Esc contextual = 1 função pura `nextOnEsc(mode)` em vez de branches espalhados.
- **Contras:**
  - FSM não é "engine" — se ganharmos um 4o estado (`floating`, Fase futura), precisamos editar 3 lugares (union, transition functions, diagrama).

## Decisão

Adotamos **Opção 4**.

### State machine canônica

```typescript
export type DisplayMode = 'hidden' | 'bar' | 'expanded';
```

**Transições válidas:**

| De | Trigger | Para | Notas |
|---|---|---|---|
| `hidden` | `playTrack(track)` | `bar` | Auto on play. RF-07 acceptance: "playTrack automaticamente seta displayMode='bar' se vinha de hidden". |
| `bar` | click cover / chevron-up / `setDisplayMode('expanded')` | `expanded` | RF-04. Pré-condição: `current !== null`. |
| `expanded` | click chevron-down / Esc / click backdrop / `setDisplayMode('bar')` | `bar` | RF-04 + Q-B. |
| `bar` | `close()` / Esc / `onEnded` sem próxima | `hidden` | RF-02 + RF-05 + RF-13. |
| `expanded` | `close()` | `hidden` | Direto. Sem transient por `bar` — animation slide-down 200ms a partir do expanded. (Fix HIGH-1: removida a fantasia "transient por bar 0ms" que existia em D4 — o codigo sempre foi direto e o duplo-step e mais ruidoso pra leitor.) |
| `bar` | `playTrack(novaTrack)` | `bar` | Substitui track sem mudar mode (D9). |
| `expanded` | `playTrack(novaTrack)` via LessonPicker | `expanded` | Mode preservado quando troca via picker dentro do expanded (RF-09). |
| `bar` ou `expanded` | fullscreen enter (`<LessonViewer>` em `requestFullscreen`) | `hidden` (temp) | Q-H / D22. Restaura `'bar'` ao sair fullscreen. |
| `hidden` | fullscreen exit + `current !== null` | `bar` | Restore. |
| qualquer | refresh / reload | `hidden` | Sem persist (D4 + D7). |

**Estados inválidos prevenidos:**

- `setDisplayMode('expanded')` com `current === null` → **no-op** + `console.warn` (RF-07 acceptance).
- `displayMode === 'bar'` ou `'expanded'` com `current === null` → impossível pela invariante: `playTrack` é o único caminho para sair de `hidden`, e `playTrack` seta `current` antes de mudar mode.

### Pure transition functions (em `client/src/lib/audio-engine/displayModeFsm.ts`)

```typescript
export function canExpand(current: AudioTrack | null): boolean {
  return current !== null;
}

export function nextOnEsc(mode: DisplayMode): DisplayMode {
  if (mode === 'expanded') return 'bar';
  if (mode === 'bar') return 'hidden';
  return 'hidden'; // no-op se já hidden
}

// Close direto: bar→hidden e expanded→hidden (sem transient bar).
// Param `mode` mantido pra API consistente + telemetria from/to futura.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function nextOnClose(mode: DisplayMode): DisplayMode {
  return 'hidden';
}

export function nextOnPlayTrack(mode: DisplayMode): DisplayMode {
  return mode === 'hidden' ? 'bar' : mode; // preserva expanded se estava expanded
}

export function nextOnFullscreenEnter(_mode: DisplayMode): DisplayMode {
  return 'hidden';
}

export function nextOnFullscreenExit(
  modeBeforeFullscreen: DisplayMode,
  hasCurrent: boolean,
): DisplayMode {
  if (!hasCurrent) return 'hidden';
  return modeBeforeFullscreen === 'hidden' ? 'hidden' : 'bar';
}
```

Testes em `tests/unit/audio-engine/displayModeFsm.test.ts` cobrem todas as transições isoladamente, sem render React.

### Z-index hierarchy canônica

Documentada como **mapa empírico** (validar em verify manual seção 13.1 item 14):

| Layer | z-index | Origem | Validação |
|---|---|---|---|
| **Sonner / Toast** | `z-[9999]` | Default Sonner | Toast aparece acima de tudo |
| **Radix Dialog (LessonPickerDialog, etc)** | `z-[100]` | Shadcn padrão Radix `<DialogOverlay>` | Dialog acima do MiniChat + Player |
| **MiniChat (expanded)** | `z-50` | `client/src/components/MiniChat.tsx` linhas 172, 196 (verificado 2026-05-21) | Acima do Mini Player; abaixo de Dialog/Toast |
| **MiniPlayerExpanded** | `z-45` | RF-04. Renderizado **acima** da bar mas **abaixo** do MiniChat. | Permite MiniChat abrir por cima do expanded sem conflito |
| **MiniPlayerBar** | `z-40` | RF-01 + RF-11. | Acima do conteúdo normal de páginas; abaixo de tudo o resto |
| **Conteúdo de páginas** | default (auto / 0) | — | Bar fica visualmente "ancorada" no bottom |

**Justificativa do gap `z-40` → `z-45` → `z-50`:**

- Reservamos `z-41..z-44` para casos futuros (ex.: floating icon mode da fase futura — Q4) sem precisar redistribuir todos os z-index do projeto.
- `z-45` para expanded é arbitrário mas explícito; reviewer pode questionar — documentado como decisão consciente.

### Body padding-bottom condicional (RF-11)

Implementado via **CSS variable `--mini-player-height`** settada pelo hook `useMiniPlayerHeight()` no `AudioPlayerProvider`:

| `displayMode` | viewport | `--mini-player-height` |
|---|---|---|
| `hidden` | qualquer | `0px` |
| `bar` ou `expanded` | desktop ≥1024 | `80px` |
| `bar` ou `expanded` | tablet 768-1023 | `72px` |
| `bar` ou `expanded` | mobile <768 | `64px` |

Layouts específicos que precisam respeitar o bottom space consomem via:

```css
.layout-with-mini-player {
  padding-bottom: var(--mini-player-height, 0px);
}
```

**Por que não `<body>` global?** Algumas páginas (ex.: `/login`, `/onboarding`) renderizam sem o player visível e não devem reservar espaço. Aplicar nos wrappers de layout (`Dashboard`, `GradePlanner`, `GrindSessionLive`, `Biblioteca`) dá controle granular.

**Expanded mode não adiciona padding extra** — RF-04 renderiza `MiniPlayerExpanded` em overlay acima da bar (não desloca conteúdo da página).

## Consequências

**Positivas:**

- FSM canônica em 1 arquivo (`displayModeFsm.ts`) — fonte de verdade para test-writer + implementer + reviewer.
- Esc contextual fica em 1 função pura testável (`nextOnEsc`) em vez de branches espalhados.
- Z-index map evita "guerra silenciosa" de overrides (cada nova surface consulta a tabela aqui).
- CSS variable `--mini-player-height` permite layouts opt-in (granularidade > body global).
- Test-writer escreve assertions concretas: `expect(nextOnEsc('expanded')).toBe('bar')`.
- Diagrama Mermaid `displayMode-state-machine.mermaid` espelha a FSM 1:1 para revisão visual.

**Negativas:**

- Adicionar `floating` mode (fase futura, Q4) exige editar 3 lugares: union, transition functions, diagrama. Aceitável (Q4 confirma fora do MVP).
- Gap `z-40/z-45/z-50` parece arbitrário sem o contexto deste ADR; mitigado por referência cruzada no `MiniPlayerExpanded.tsx` (comentário inline com link ao ADR).
- CSS variable exige caller-side opt-in (cada layout que se importa precisa adicionar `padding-bottom: var(...)`). Risco de esquecimento — listar layouts afetados no PR.

**Neutras:**

- FSM 3 estados é tamanho ideal para "FSM em código próprio" vs "FSM library". Se virar 6+ estados, reconsiderar XState/Robot.
- Pure transition functions são padrão funcional que casa com testes Vitest puros (sem `renderHook`).

## Confiança

**Alta.** FSM com 3 estados + 7 transições nomeadas é pequeno o suficiente para caber em diagrama de uma página + arquivo de transition functions ~50 linhas. Z-index hierarchy validada empírico contra `MiniChat.tsx` real (z-50 confirmado em grep). Risco residual = verify manual cobrir as 5 superfícies concorrentes (item 14 + 19 do plano de verificação).

## Pendência levantada além do escopo

**Media Session API** (D12 / Q-C / D17) tem 1 responsabilidade isolada (registrar handlers `play / pause / previoustrack / nexttrack / seekbackward / seekforward` quando `current !== null`) + lockscreen art (`current.coverUrl`). **Decisão:** NÃO precisa ADR próprio — comportamento documentado na spec (D12, D17, verify item 15/17) + implementado dentro do `AudioPlayerContext` (~20 linhas). Se Spotify Web Playback SDK exigir handlers diferentes em Fase 4, abrir novo ADR (`ADR-XXX: Media Session API multi-source coordination`).

## Referências

- Spec: `Docs/specs/sprint-mini-player-1.md` §5 RF-04 + RF-11 + RF-13, §11 D4/D16/D22.
- Diagrama complementar: `Docs/architecture/diagrams/mini-player-1/displayMode-state-machine.mermaid`.
- ADR irmão: `ADR-187` (AudioSourceEngine + driver pattern).
- Verificado em código: `client/src/components/MiniChat.tsx:172,196` (z-50 confirmado).
- Lessons relacionadas: #27 (Radix Tabs `onMouseDown` vs `onClick` — relevante se RF-04 expanded usar Tabs), #29 (sub-árvore com `useQuery` sem QueryClientProvider — relevante se Mini Player ler curso via TanStack em teste standalone).
