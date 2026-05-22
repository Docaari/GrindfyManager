# ADR-195: Mini Player keyboard shortcuts contract

## Status

Aceito — 2026-05-22.

Cobre Sprint Mini Player 3 (MP3) RF-03 + decisoes D3/D4/D5 da spec.

## Data

2026-05-22

## Contexto

MP1 entregou shortcuts basicos no `MiniPlayerBar`: `Space` (play/pause), `ArrowLeft` (-15s), `ArrowRight` (+15s), `M` (mute), `Esc` (collapse). Persona MTT (poker MTT power user) e keyboard-heavy (atalhos hotbar grind tools), e auditoria pre-MP3 revelou:

1. **Paridade YouTube/VLC pedida pelo founder**: `J`/`L` (-10s/+10s), `0..9` (numeric seek por %).
2. **Volume via teclado**: `ArrowUp`/`ArrowDown` (+10%/-10%) padrao em muitos players.
3. **Discovery problem**: sem menu help, user power nao descobre shortcuts novos.

Forcas em jogo:

1. **Conflito de scope**: shortcuts globais (level documento) vs locais (MiniPlayerBar). Onde mora o handler?
2. **Conflito com inputs**: user digita em `<input>` ou `<textarea>` — `Space`/`J`/`L`/numeros precisam ir pro input, NAO pro player.
3. **Conflito com rotas**: `/admin/*` tem keyboard combos proprios (admin dashboards). Shortcuts do player NAO devem disparar la.
4. **Conflito com paginas que ja consomem keys**: `ArrowUp/Down` em tabela navegavel (e.g. /grade-planner WeekGrid), `?` em pagina com search modal.
5. **Discovery sem over-engineering**: menu /help dedicado e overkill (ICE LOW). Tooltip por controle (MP1 ja tem via `title` attr) cobre 80%.
6. **MP1 shortcuts atuais NAO podem mudar muscle memory**: `ArrowLeft/Right` continua -15s/+15s. `J/L` ADICIONA -10s/+10s (paridade YouTube).
7. **Lesson #27 (Radix Tabs mousedown vs click)**: shortcuts via `onClick` redundante OU via key handler global — depende do scope.
8. **Lesson #30 (renderHook + jsdom)**: hook-based shortcuts ja consolidado no client; tests `.test.ts` precisam config jsdom.

### Benchmark de mercado

| Player | Scope handler | Gate inputs | Gate admin/special routes |
|---|---|---|---|
| YouTube web | document keydown | sim (`event.target.tagName === 'INPUT'`) | YouTube nao tem admin routes |
| Spotify desktop | electron app shortcuts (level OS) | N/A | N/A |
| VLC web | document keydown | sim | N/A |
| Soundcloud | document keydown | sim (input + contenteditable) | sim (gates `/settings`) |
| Coursera/Udemy lessons | document keydown | sim | sim (gates editor pages) |

YouTube + Soundcloud sao referencia mais proxima do Grindfy (web + lesson player).

## Opcoes Consideradas

### Opcao 1: Handler local no MiniPlayerBar (com `tabIndex` + onKeyDown no container)

- **Pros:**
  - Scope tight: shortcuts so funcionam quando bar tem foco.
- **Contras:**
  - Bar e fixed bottom; raramente recebe foco direto. User precisa clicar nela primeiro.
  - Quebra paridade YouTube/VLC (que escutam global).
  - **Rejeitada.**

### Opcao 2: Handler global em `document` direto via useEffect no MiniPlayerBar

- **Pros:**
  - Simples; ja e como MP1 faz hoje (linhas 114-150 do .tsx).
- **Contras:**
  - Cleanup em unmount precisa ser confiavel (remove listener).
  - State scoping: precisa ler `volume`/`durationSeconds`/`activeTrack` via closure — risco de stale closure (lesson #29 polyfill / lesson #21 stale closure).
  - Re-attach handler em cada render = perf hit.

### Opcao 3 (escolhida): Custom hook `useKeyboardShortcuts` no scope do `AudioPlayerProvider` + gates de target + gates de rota

```ts
function useKeyboardShortcuts() {
  const ctx = useAudioPlayer(); // dentro do Provider
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isInteractiveTarget(e.target)) return;
      if (isAdminRoute()) return;
      // dispatch...
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [ctx]);
}
```

- **Pros:**
  - Scope global mas sem reattach a cada render (depedencias estaveis via context).
  - Gates centralizados em helpers compartilhados (`isInteractiveTarget`, `isAdminRoute`).
  - Reutilizavel: outras features (MP4 mobile?) chamam o mesmo hook.
  - Unit-testavel via `renderHook` + jsdom (lesson #30).
- **Contras:**
  - Precisa do Provider mounted (MP1.2 pattern `useOptionalAudioPlayer` ja resolveu para Sidebar/etc).

## Decisao

**Hook `useKeyboardShortcuts` no scope do `AudioPlayerProvider`. Listener global em `document.keydown`. Gates: ignore target input/textarea/contenteditable + ignore se `pathname.startsWith('/admin/')`.**

### Tabela canonica de shortcuts

| Tecla | Acao | Caller no context | Sprint |
|---|---|---|---|
| `Space` | toggle play/pause | `togglePlayPause()` | MP1 (mantem) |
| `M` | toggle mute | `toggleMute()` | MP1 (mantem) |
| `Esc` | collapse bar | `collapseBar()` | MP1 (mantem) |
| `ArrowLeft` | seek -15s | `skipBack(15)` | MP1 (mantem) |
| `ArrowRight` | seek +15s | `skipForward(15)` | MP1 (mantem) |
| `J` / `j` | seek -10s (paridade YouTube) | `skipBack(10)` | MP3 RF-03 (novo) |
| `L` / `l` | seek +10s (paridade YouTube) | `skipForward(10)` | MP3 RF-03 (novo) |
| `ArrowUp` | volume +10% | `setVolume(clamp(v + 0.1))` | MP3 RF-03 (novo) |
| `ArrowDown` | volume -10% | `setVolume(clamp(v - 0.1))` | MP3 RF-03 (novo) |
| `0`..`9` | seek to N0% (digit/10 ratio) | `seek(durationSeconds * digit / 10)` | MP3 RF-03 (novo) |
| `?` | toggle ShortcutsHelpPopover | local state in MiniPlayerBar | MP3 RF-03 (novo) |

### Helpers compartilhados

```ts
// client/src/lib/audio-engine/keyboardHelpers.ts (sugerido)
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function isAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/admin/');
}
```

### Dispatch contract

- Handler chamada APENAS para targets nao-interactivos + fora de rotas /admin.
- Antes de cada `preventDefault()`: confirmar que a key esta na tabela canonica. Keys nao listadas NAO chamam `preventDefault`.
- `0..9` ignora se `durationSeconds <= 0` (RF-03.1 edge case).
- `ArrowUp/Down` clamp em [0, 1] (lesson MP1).
- `?` toggle local state — NAO dispatch context action (UI puramente local).

### Per-route exclusions

| Rota | Razao |
|---|---|
| `/admin/*` | shortcuts admin proprios + risco de hijack |

Futuras exclusoes (MP3.1+): paginas com WeekGrid keyboard navigation, paginas com search modal `?`.

### Discovery: ShortcutsHelpPopover

- Trigger via `?` key (D5).
- Componente: `client/src/components/audio-player/ShortcutsHelpPopover.tsx`.
- Radix Popover (consistente com MP1.1 RF-05 + ADR-188 hierarchy).
- Conteudo: 5 linhas compactas (Space/Setas/J-L/0-9/M+UpDown).
- Tooltips por controle (MP1 `title` attr) continuam — `?` Popover e complementar para power user discovery.

## Consequencias

### Positivas

- **Paridade YouTube**: `J`/`L`/`0-9` cobrem muscle memory comum.
- **Volume via teclado**: persona keyboard-heavy ganha control sem mouse.
- **MP1 shortcuts inalterados**: zero risco regressao.
- **Gates centralizados**: `isInteractiveTarget` + `isAdminRoute` reutilizaveis e unit-testaveis.
- **Discovery via `?`**: minimal surface, sem menu /help dedicado.
- **Tests via renderHook + jsdom**: lesson #30 ja pavimentou config.
- **Audio focus correto**: handler em `AudioPlayerProvider` scope = state fresh via context, sem stale closure.

### Negativas

- **`ArrowUp/Down` colide com tabelas keyboard-navegaveis**: documentar conflict potencial. Mitigacao: tabelas usam `e.stopPropagation()` nos proprios handlers.
- **`?` requer Shift+/ em layout US/PT-BR**: `e.key === '?'` cobre ambos (key e o caractere resolvido). Verify manual em layouts diversos.
- **Listener global pode interferir com extension shortcuts** (e.g. Vimium): aceitavel; persona power saberia desabilitar extension em pagina.
- **Provider obrigatorio**: pages sem Provider (Sidebar standalone, etc) usam `useOptionalAudioPlayer` (MP1.2) e nao recebem shortcuts. OK.

### Neutras

- ADR-188 (z-index hierarchy) cobre ShortcutsHelpPopover via Radix Portal layer.
- Lesson #27 (Radix Tabs mousedown) nao se aplica — Popover usa key handler proprio.

## Confianca

Alta. Decisao consistente com:

- YouTube/Soundcloud/Coursera benchmark.
- Lesson #15 (MemoryStorage polyfill jsdom + node) + lesson #30 (renderHook jsdom).
- Strategist UX audit pre-MP3 (persona keyboard-heavy).
- Spec MP3 secao 5 RF-03 + Q-E + Q-L.

## Referencias

- ADR-187 (`AudioSourceEngine` abstraction).
- ADR-188 (Mini Player FSM + z-index).
- Spec `Docs/specs/sprint-mini-player-3.md` secao 5 RF-03 + D3/D4/D5 + Q-E/Q-L.
- Diagrama `Docs/architecture/diagrams/mini-player-3/keyboard-shortcuts-dispatch-flow.mermaid`.
- Memory `session_2026-05-22-mini-player-1-shipped.md` (MP1 shortcuts base).
- Lesson #29 (ErrorBoundary local + Provider scope), Lesson #30 (renderHook jsdom config).
