# ADR-209 — Mini Player Modern Redesign (visual polish + expanded mode + empty state)

**Status:** Accepted
**Date:** 2026-05-23
**Sprint:** MP-MODERN (visual polish + UX hardening sobre cluster MP1..MP3.3 + MP-VALIDATION + UX-GLOBAL-BUTTONS)
**Spec:** `Docs/specs/sprint-mp-modern.md`
**Diagrams:** `Docs/architecture/diagrams/sprint-mp-modern/layout-grid.mermaid` + `expanded-mode-flow.mermaid`
**Relates / Reuses:**
- ADR-187 — MiniPlayerBar persistent (substituiu StickyAudioBar)
- ADR-188 — Mini Player 1.1 follow-ups + z-index canon (`Docs/conventions/z-index.md`)
- ADR-191 — Telemetria audio reuse `user_activity`
- ADR-194 — OAuth popup fallback (`initiateSpotifyAuth`)
- ADR-196 — Transcription preview ingestion (campo `activeTrack.transcriptionPreview`)
- ADR-198 — Audio error recovery + buffering UI
- ADR-207 — `recordActivity` event convention (dot-namespace)

**Numeração:** spec referencia "ADR-208" como número alvo. Em 2026-05-23 o slot 208 já estava ocupado por ADR-208 (sprint paralelo). Este ADR foi renumerado para **209** seguindo o pedido founder (auto-mode). Convenção pulse-subtle + decisões D1-D8 da spec migram intactas — só o número mudou.

---

## Context

Cluster Mini Player completo shipped até MP-VALIDATION (`a4ed3527`) + UX-GLOBAL-BUTTONS (`4ae3c738`) + fix audioUrl (`292768a1`). Player funcionalmente sólido: cross-tab queue, OAuth Spotify httpOnly, Sleep Timer driver-agnostic, transcription preview (MP3.2), telemetria 17 dot-events (ADR-207), resume cross-session, error recovery, buffering UI, onboarding, OAuth popup fallback.

Founder reportou (auto-mode AFK) duas dores residuais:

1. **Percepção "MVP cinza"** — cover gira 360° (anti-pattern moderno; Spotify/Apple/YouTube Music aboliram spin), controles transporte cinza-cinza sem destaque visual no toggle, progress bar é `<input type="range">` cru, sidebar 9 botões amontoados sem agrupamento.
2. **Empty state ausente** — `MiniPlayerBar.tsx:185` `early return null` quando `!activeTrack`. Usuário entra `/inicio` sem track ativa: player invisível → "sem como entrar no mini player". Discoverability ruim — usuário precisa navegar até `/biblioteca` + clicar lesson pra começar audio.
3. **Expanded mode placeholder** — `MiniPlayerExpanded.tsx` (108 LoC) é lista readonly do curso, sem hero/cover grande/queue inline/coach hint. Não convida revisitar aula em pausa de mesa.

Forças em jogo:

- **Arquitetura intocada.** Cluster MP é solidamente funcional. Mexer em `AudioPlayerContext` / drivers / hooks core regrediria 593+ suites de testes baseline + 115 harness pre-existentes (lessons #14/#26/#38).
- **Sem libs novas.** Framer Motion + Radix Dialog + lucide-react + Tailwind + tokens — tudo já no projeto. Adicionar libs estoura build cap (10KB gzip).
- **Lighthouse mobile a11y ≥90** alvo — qualquer mudança visual deve preservar `aria-label` PT-BR + focus ring + keyboard nav.
- **Reduced-motion respeitado** em TODOS os novos elementos (hook `usePrefersReducedMotion` já interno em MiniPlayerBar).
- **Tokens canon** (`@/lib/ui-tokens` + `Docs/conventions/ui-patterns.md` v1.0 + ADR-078) proibem hardcode fora dos tokens. Cores/spacing/fonts SÓ via `tokens.*`.
- **Telemetria ADR-207** já permite multi-namespace dot-events. Eventos UI novos podem ser `mini_player.*` sem deprecar `audio.*`.
- **Z-index canon ADR-188 / `Docs/conventions/z-index.md`** — MiniPlayerBar `z-40`, dialogs `z-50` (Radix Dialog default = shadcn z-50). Expanded mode usa Dialog → herda canon.

---

## Decision

Sprint **visual + UX polish** com **ZERO mudança arquitetural**. Substituições de superfície + 2 componentes novos (`ExpandedPlayerDialog` + `EmptyStateCTA`). Hooks/drivers/context/SDK intactos.

### Decisões D1-D8

| # | Decisão | Escolha canônica | Alternativa rejeitada | Racional |
|---|---|---|---|---|
| **D1** | Cover playing indicator | **Pulse opacity 95↔100% 2s ease-in-out infinite** (`animate-pulse-subtle`, custom keyframes) | `animate-spin-slow` (status quo) ou Tailwind default `animate-pulse` (50%, agressivo) ou `scale` shake | Spotify/Apple/YouTube Music abandonaram spin (cansa em sessão longa de grind + compete com mesas no segundo monitor). Opacity é sutil, indica "playing" sem rotação distractiva. `animate-pulse` default Tailwind oscila 100↔50% — visualmente quase pisca; 95↔100% é breath. |
| **D2** | Pulse implementação | **Tailwind keyframes custom em `tailwind.config.ts`** (`pulseSubtle` + animation `pulse-subtle`) | Framer Motion `motion.div` com `animate` | Framer = JS runtime overhead + bundle +5KB+. Pulse não precisa orchestration (sem variants/sequence/spring). Tailwind compila CSS estático = zero runtime cost. |
| **D3** | Controls grouping (pill) | **`bg-white/5 rounded-full px-2 py-1` wrapper envolve 5 transporte buttons** + toggle `h-10 w-10 bg-white text-gray-900` + outros `h-8 w-8 rounded-full` | Espaçamento maior sem wrapper / toggle igual aos outros | Spotify reference: pill grouping comunica "controles transporte" como cluster visual, toggle destacado bg-white indica "ação primária". Cinza-cinza atual confunde affordance ("qual é o play?"). |
| **D4** | Sidebar grouping | **3 dividers `h-6 w-px bg-white/10` separando 4 grupos** (audio / queue / utils / window) | Sem divider (status quo amontoado) | Scan visual hierárquico — usuário consegue inferir categorias funcionais em 2s. Dividers `aria-hidden="true"` (decorativo). Mobile: dividers ficam mesmo com grupos parcialmente vazios (botões hidden md:inline-flex); quebra visual aceita (alternativa render condicional adiciona JSX cost). |
| **D5** | Expanded mode container | **Radix Dialog `Dialog.Root` + `Dialog.Portal` + `Dialog.Overlay` + `Dialog.Content`** (z-50 default Radix shadcn) | Custom `<div>` overlay + backdrop manual (status quo `MiniPlayerExpanded.tsx`) | Radix oferece focus trap + Esc + click-outside + `aria-modal="true"` + aria-labelledby nativos. Custom modal duplicaria toda a infra a11y. Lesson #29 (ErrorBoundary local em sub-árvore com useQuery) já mapeada para o caso de transcript fetch dentro do dialog. Dialog z-50 herda canon ADR-188 / `Docs/conventions/z-index.md` (sem hardcode novo). |
| **D6** | ExpandedPlayerDialog lazy-load | **Deferido — sob threshold 10KB gzip cap.** Lazy via `React.lazy(() => import('./ExpandedPlayerDialog'))` ATIVADO se build cresce >10KB gzip | Lazy-load mandatório / nunca lazy | RF-05 é o maior delta (~120-180 LoC) — estimativa gzip ~3-5KB. Provavelmente cabe sem lazy. Implementer mede pos-build: se cap excede, troca `import` por `React.lazy` em `App.tsx`. Stretch follow-up se necessário. |
| **D7** | Empty state inline vs separado | **Inline em `MiniPlayerBar.tsx` se ≤80 LoC; arquivo `EmptyStateCTA.tsx` separado se ≥120 LoC** | Sempre inline / sempre separado | Co-localidade ajuda leitura quando ≤80 LoC. Acima de 120 LoC arquivo separado evita scroll fadigado. Implementer "feel-it" call durante green-phase. |
| **D8** | Coach hint card dismissable persist | **`localStorage.setItem('coach_hint.expanded.seen.v1', 'true')`** — persistente cross-session | Per-session state (volta toda sessão) | Founder default: usuário que dismissou não quer ser perseguido. Sempre pode resetar (clear localStorage / inspector). Versionamento `.v1` permite re-introduzir card no futuro com `.v2` sem ler estado antigo. |
| **D9** | Telemetria namespace | **`mini_player.*` dot-namespace** (separado de `audio.*` MP-VALIDATION) | Reusar `audio.*` direto | `audio.*` = eventos do track (play/pause/seek/etc). `mini_player.*` = eventos de UI interaction (expanded open, empty CTA click). ADR-207 permite multi-namespace; separação ajuda agg SQL por superfície. |
| **D10** | Tokens enforcement | **Cores/spacing/fonts SÓ via `@/lib/ui-tokens`** — exceções de gradient (RF-02) e custom keyframes (RF-01) documentadas inline + ADR | Hardcode "só nesta sprint" | Drift de tokens é o anti-pattern #1 do reviewer (`ui-patterns.md` §2). Sprint MP-MODERN trata 2 exceções como CSS-level (não tokens-level) — gradient é definição CSS pseudo-element + keyframes é Tailwind config — não fere ui-tokens.ts contract. |
| **D11** | Reduced-motion contract | **TODA animação nova OFF quando `prefers-reduced-motion: reduce`** — cover sem pulse, sem ring; Dialog sem fade/scale; tooltip scrub sem fade-in; empty state sem entry animation | Reduce intensity (menor frequência) | A11y safe: usuário pediu menos motion → UI estática. Implementer usa hook `usePrefersReducedMotion` já no projeto. Test mock `window.matchMedia('reduce').matches=true` em todos os RFs. |
| **D12** | Safari iOS gradient fallback | **`accent-color: #6366f1`** fallback se custom range gradient (`::-webkit-slider-runnable-track`) não renderiza | Sem fallback (gradient ou nada) | iOS Safari historicamente tem problemas com pseudo-element range styling. `accent-color` é CSS standard 2021+ — sólido roxo Grindfy (tokens.color.action), mesmo sem gradient continua "look Grindfy". Test manual founder pos-merge em iOS Safari valida. |

### Convenção `pulse-subtle` (RF-01)

Adicionar em `tailwind.config.ts`:

```ts
extend: {
  keyframes: {
    pulseSubtle: {
      '0%, 100%': { opacity: '1' },
      '50%': { opacity: '0.95' },
    },
  },
  animation: {
    'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
  },
}
```

**Justificativa contra Tailwind default `animate-pulse`:** default oscila `opacity: 1` ↔ `opacity: .5` em 2s. Visualmente parece "piscando". `pulseSubtle` oscila 100↔95% — perceptível como "respirar" sem distrair. Reservar `animate-pulse` Tailwind para skeleton/loading; `pulse-subtle` para "playing" indicator de cover.

### Tokens canon enforcement

| Elemento | Token canonical | Hardcode permitido | Justificativa |
|---|---|---|---|
| Cores cover ring | `ring-blue-500/30` (tokens.color.action hint) | Não | `tokens.color.action.ring` (consultar `ui-tokens.ts` shape; se ausente, RF-MP-MODERN-2 adiciona) |
| Cores progress gradient | `from-blue-500 to-purple-500` | **Sim — exceção CSS-level** | Gradient é definição de track pseudo-element; tokens não modelam gradient ainda. ADR-209 D10 documenta exceção. |
| Cores coach hint card | `bg-blue-500/10 border-blue-500/20 text-blue-400` | Não | Mapeia para `tokens.color.action.{soft, border, text}` (verificar shape; alinhar) |
| Cores empty state CTAs | `bg-blue-500` (Escolher aula) + `bg-green-500` (Conectar Spotify) | Não | `tokens.color.action.solid` + `tokens.color.spotify.solid` (verificar; criar se ausente) |
| Spacing | `gap-1`, `gap-2`, `gap-3`, `p-4`, etc | Não | `tokens.space.*` |
| Font sizes | `text-xs`, `text-sm`, `text-2xl` | Não | `tokens.font.*` |
| Pulse animation duration | `2s` em keyframes | **Sim — exceção CSS-level** | Tailwind config keyframes, fora do contract `ui-tokens.ts`. ADR-209 documenta exceção. |
| Z-index | `z-40` (bar) `z-50` (Dialog) `z-[51]` (Content) | Não | `Docs/conventions/z-index.md` canon (ADR-188). Radix Dialog herda z-50 default shadcn. |

### Reduced-motion + Safari iOS fallback (D11+D12)

Implementação canonical:

```tsx
const reducedMotion = usePrefersReducedMotion();

// RF-01 cover
<img
  className={cn(
    'h-12 w-12 md:h-14 md:w-14 lg:h-16 lg:w-16 rounded-md object-cover',
    isPlaying && !reducedMotion && 'animate-pulse-subtle',
    isPlaying && 'shadow-lg ring-1 ring-blue-500/30',
    !isPlaying && 'shadow-md'
  )}
/>

// RF-02 progress bar (CSS fallback)
<input
  type="range"
  className="mini-player-range" /* custom class em index.css */
  style={{ accentColor: '#6366f1' }} /* fallback se ::-webkit-slider-runnable-track falhar */
/>

// RF-05 Dialog reduced-motion
<Dialog.Content
  className={cn(
    'fixed inset-0 ...',
    reducedMotion && 'motion-reduce:animate-none'
  )}
/>
```

### Telemetria 3 eventos novos (D9)

| Event | Surface | Metadata | Trigger |
|---|---|---|---|
| `mini_player.expanded.open` | `ExpandedPlayerDialog` mount | `{ track_id, source_driver }` | `displayMode` muda para `'expanded'` |
| `mini_player.expanded.close` | `ExpandedPlayerDialog` unmount | `{ reason: 'esc' | 'overlay' | 'minimize' | 'close_x' }` | Esc / overlay click / ChevronDown / X |
| `mini_player.expanded.coach_hint.click` | `ExpandedPlayerDialog` coach hint link | `{}` | Click no `/coach-ai` link |
| `mini_player.empty_cta.choose_lesson` | `EmptyStateCTA` button | `{}` | Click "Escolher aula" |
| `mini_player.empty_cta.spotify_connect` | `EmptyStateCTA` button | `{}` | Click "Conectar Spotify" |

Spec lista 3 eventos no §6, mas o user request expandiu para 5 (incluindo `expanded.close` + `expanded.coach_hint.click`). ADR-209 absorve os 5 — convenção ADR-207 cobre cap 10KB metadata + PII strip server-side; emitter best-effort com try/catch + log antes de swallow (lesson #9).

**Reuso lib:** `client/src/lib/activity-telemetry.ts` exporta `emitAudioEvent`. Estender para `emitMiniPlayerEvent(action, metadata)` mantendo type safety, OU usar `emitAudioEvent` direto (decisão implementer — preferir extensão).

---

## Consequences

### Positivas

- **Percepção "produto polido"** ganha em 2 dias de sprint, sem reescrever lógica.
- **Discoverability resolvida** — empty state CTA elimina "sem como entrar no mini player".
- **Expanded mode utilizável** — usuário em pausa de mesa pode revisitar aula com hero + transcript + queue + coach hint.
- **Spotify-like UX precedent** — pill grouping + toggle destacado + cover pulse encontram intuição já calibrada por Spotify/Apple Music.
- **Zero regressão funcional** — context/drivers/hooks/SDK intactos = baseline 593+ suites continuam verde.
- **Telemetria estende ADR-207** sem deprecar nada — `mini_player.*` namespace separa eventos UI dos eventos de track (`audio.*`).
- **Coach loop reforçado** — coach hint card cria ponte player → `/coach-ai` (AI-2A `recommend_lesson` tool); usuário descobre Coach pelo player.
- **Reduced-motion preservado** — todos os elementos novos respeitam preferência sistêmica.

### Negativas

- **Cover responsive `h-16 lg`** pode quebrar layout em desktop pequeno (1024x768). Mitigação: snapshot viewport test + fallback `lg:h-14` se reviewer detecta overflow.
- **Custom range gradient Safari iOS** historicamente quebrado. Mitigação D12: `accent-color: #6366f1` fallback sólido + test manual founder pos-merge.
- **`useMiniPlayerHeight` muda 80→48** quando empty state ativo. Layouts dependentes (`/inicio` body padding-bottom) podem ter jump visual em mount. Mitigação: `transition: padding-bottom 200ms` no body — stretch RF-06 (reverter se gera flicker).
- **Build size cap 10KB gzip** pode ser excedido — ExpandedPlayerDialog é principal contributor (~3-5KB esperado, dentro do cap mas margem apertada). Mitigação D6: `React.lazy` ATIVADO se cap excede.
- **`MiniPlayerExpanded.tsx` removido** quebra imports externos se houver. Mitigação: grep `MiniPlayerExpanded` antes de delete; re-export pattern se >=1 consumer; default delete (App.tsx único consumer esperado).
- **Coach hint persistência localStorage** — usuário que limpa storage volta a ver card. Trade-off aceito; .v1 suffix permite re-prompt controlado futuro.

### Neutras

- **Empty state sempre visível** quando `!activeTrack && displayMode !== 'hidden'` — pode incomodar usuário "não quero player agora". Mitigação P10: close (X) ainda existe quando track ativa; em empty state usuário pode esconder via `setDisplayMode('hidden')` (programático). Founder pode escalar pra preferência persistente em RF-MP-MODERN-2.
- **Queue inline duplica ~30 LoC** vs reusar `QueuePopover` (D6). Aceito por evitar nested dialogs Radix uglies.
- **3 dividers visíveis mesmo com grupos vazios mobile** (D4). Aceito por simplicidade JSX; reviewer pode pedir conditional render se reclamar.

---

## Confidence

**Alta.**

Sprint é UI-only sobre cluster MP solidamente shipped (12 sprints prévios). Riscos altos (arquitetura, drivers, SDK) intocados. Decisões D1-D12 calibradas em precedents do projeto (ADR-188 z-index canon, ADR-207 telemetria, lesson #29 ErrorBoundary local, lesson #1 hooks order, lesson #23 Wouter v3). Cap 10KB gzip + tsc 0 + a11y ≥90 enforçados. Reviewer R1 esperado APPROVED-WITH-NITS — sem CRITICAL bar (nenhuma lógica nova de auth/payment/data).

Principal incerteza: Safari iOS custom range gradient (D12 fallback mitiga). Build size é segunda preocupação (D6 lazy mitiga).

---

## Follow-ups (não-objetivos sprint atual)

- **RF-MP-MODERN-2** — cover dominant color extraction (Color Thief / WebGL) para theming "Spotify-like".
- **RF-MP-MODERN-2** — Framer Motion entry animation no empty state (reduced-motion safe).
- **RF-MP-MODERN-2** — `useMiniPlayerHeight` refactor para ResizeObserver.
- **RF-MP-MODERN-3** — equalizer/audio visualizer no expanded.
- **RF-MP-MODERN-3** — full transcript karaoke-style (cross-device sync gate).
- **Coach hint dinâmico** — conteúdo da `recommend_lesson` tool (AI-2A) em vez de mensagem estática.
- **Empty state preferência persistente** — se founder quer "esconder sticky" controlável por settings.
- **Lazy load player components** — Framer/Radix sob `React.lazy` se build size estourar futuro.
