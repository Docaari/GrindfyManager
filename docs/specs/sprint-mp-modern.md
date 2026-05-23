# Sprint MP-MODERN — Mini Player redesign visual + UX polish

## Status

**Proposta (pm-spec)** — 2026-05-23. Pronta para `system-architect` (próximo passo do pipeline TDD).

Sprint **visual polish + UX hardening** sobre o cluster Mini Player já shipped (MP1+MP1.1+MP1.2/1.3+MP2+MP3+MP3.1+MP3.2+MP3.3+MP-VALIDATION+UX-GLOBAL-BUTTONS). **ZERO mudança em arquitetura/funcionalidade**: tudo é redesign de superfície + 1 modo `expanded` reescrito + 1 empty state novo. Funcionalmente o mini player continua identico.

**Origem:** founder pediu (AFK auto mode) — depois de MP-VALIDATION + UX-GLOBAL-BUTTONS deixarem o player funcional e validado, falta polimento visual + paridade de cuidado com mobile (mini player ainda parece "MVP cinza" e o modo expanded é uma lista readonly sem hero).

**Pacote único** — todos os 6 RFs são MUST e shippam juntos (~14-18h efetivo, ~2d).

---

## Origem

- **Cluster MP shipped:** MP3.3 `6e61bf7f` + MP-VALIDATION `a4ed3527` + Merge UX `22023510` + UX-GLOBAL-BUTTONS `4ae3c738` + fix mini-player audioUrl `292768a1`.
- **MiniPlayerBar.tsx** ~600 linhas, glassmorphism shipped, 11 controles + cover spinning quando playing + empty state ausente (early return `!activeTrack` linha 185).
- **MiniPlayerExpanded.tsx** 108 linhas — lista readonly do curso atual, sem hero/cover grande/queue inline/coach hint.
- **MP3.2 RF-04.2 transcript preview** shipped (truncate 80 chars + ellipsis Unicode) — reusável dentro do expanded mode novo.
- **Tokens canon** em `client/src/lib/ui-tokens.ts` (frozen) + `Docs/conventions/ui-patterns.md` v1.0 (UI-FND-1).
- **Strategist NÃO consultado** — pedido founder é polish/redesign visual já priorizado, sem decisão estratégica de produto.
- **Numeros disponiveis:**
  - ADR: **208** (próximo livre após 207 record-activity-event-convention).
  - Migration: **N/A** (zero schema mudança).
  - Branch: novo `feature/sprint-mp-modern` saindo de `main` @ `292768a1` (confirmar HEAD antes commit per lesson #24).

---

## Persona-alvo

Jogador profissional/semi-profissional de poker MTT em modo "grind escuta passiva" (segundo monitor + Spotify/aulas Grindfy). Player precisa: **(1)** estar visível mas sem competir com mesas, **(2)** dar feedback rápido (estado playing/pausing claro), **(3)** ter empty state convidando ação quando não há track, **(4)** modo expanded "respirável" pra revisitar aula em pausa de mesa.

Hoje o jogador relata (founder): "Sem como entrar no mini player" (sem track ativa, bar invisível) + "Parece protótipo" (cover spinning, controles cinza apertados, expanded é só lista).

---

## 1. Sumário Executivo

**Objetivo.** Elevar mini player de "MVP funcional" para "produto polido" sem mexer em uma única linha de lógica interna (toggle/seek/volume/queue/Spotify/AudioPlayerContext/AudioSourceEngine).

**Tese.** Cluster MP já é solidamente funcional (cross-tab queue, OAuth Spotify, Sleep Timer, telemetria, transcription preview). Polish visual + 1 empty state + expanded redesign convertem percepção "MVP" → "produto". Custo baixo (sem libs novas, sem schema, sem refactor cross-cutting).

**Constraints duros.**
- **ZERO mudança em arquitetura/funcionalidade.** Toggle/seek/volume/queue/Spotify SDK/AudioPlayerContext/AudioSourceEngine **NÃO MUDAM** (1 linha sequer). Hooks `useAudioPlayer`/`useQueueState` consumidos como hoje. **Excepção pontual:** `MiniPlayerBar` perde o early return `!activeTrack` (linha 185) — passa a renderizar `EmptyStateCTA` em vez de `null`. Isso é UI-only (componente novo dentro do mesmo arquivo OU vizinho).
- **Build size** NÃO cresce >10KB gzip (cap declarado).
- **tsc strict** 0 erros.
- **Lighthouse mobile a11y** >=90 (verificar com `npm run build` + audit local).
- **Sem libs novas.** Framer Motion + Radix Dialog + lucide-react + Tailwind + tokens — tudo já está no projeto.
- **Tests baseline** MP1..MP3.3 + MP-VALIDATION (~593+ suites) **NÃO regridem** além dos 115 harness pre-existentes (lesson #14/#26/#38).
- **A11y obrigatório:** aria-labels PT-BR preservados + focus rings + keyboard nav preservado (`useKeyboardShortcuts` continua dentro de `MiniPlayerBar`).
- **Reduced-motion respeitado** em TODAS as animações novas (existe hook `usePrefersReducedMotion` interno em `MiniPlayerBar.tsx` — extrair pra `client/src/hooks/usePrefersReducedMotion.ts` se necessário no RF-05).

**6 RFs em 1 linha:**

- **RF-01 (M, 1-2h) Hero artwork enlarged** — cover 16x16 / 14x14 / 12x12 desktop/tablet/mobile + pulse opacity (95-100%) substituindo spin + shadow/ring sutil ao playing.
- **RF-02 (M, 2-3h) Progress bar redesign** — input range `h-1` track gradient blue→purple + thumb `h-3 w-3` touch-target + mm:ss mono tabular-nums + hover scrub preview tooltip.
- **RF-03 (M, 2h) Controls grouping + spacing** — agrupamento pill (`bg-white/5 rounded-full px-2`) prev|back15|toggle|fwd15|next + toggle `h-10 w-10 bg-white text-gray-900` + outros `h-8 w-8`.
- **RF-04 (M, 1-2h) Sidebar controls vertical layout** — 3 grupos com dividers `border-l border-white/10`: audio (volume+sleep+speed), queue, utils (help+lessons+spotify).
- **RF-05 (L, 5-6h) Expanded mode redesign** — `ExpandedPlayerDialog` NOVO via Radix Dialog full-screen: cover grande (`max-w-md mx-auto`) + transcript preview MP3.2 reuso + controles maiores + queue inline + course context + coach hint CTA `/coach-ai`.
- **RF-06 (M, 2-3h) Empty state CTA pre-playback** — `EmptyStateCTA` NOVO em `MiniPlayerBar` quando `!activeTrack`: bar reduced `h-12` + 2 CTAs centrais (Escolher aula → `LessonPickerDialog` + Conectar Spotify → `initiateSpotifyAuth`).

**Total breakdown:**
- RF-01..04 (visual polish na bar): ~7h, ~1d
- RF-05 (expanded redesign): ~6h, ~0.75d
- RF-06 (empty state): ~3h, ~0.5d
- **Total efetivo:** ~16h, ~2d sprint. Cap 18h. Stretch RF-05 + RF-06 podem deslizar se reviewer pedir changes.

---

## 2. Contexto e Motivação

### 2.1 RF-01 — Cover spinning é anti-pattern moderno

`MiniPlayerBar.tsx:231-242` aplica `animate-spin-slow` no cover quando `isPlaying && !reducedMotion`. Spotify/Apple Music/YouTube Music abandonaram spin (cansa em sessões longas + compete com mesas de poker em segundo monitor). Pulse opacity 95-100% é o padrão atual (sutil, indica "playing" sem rotação distractiva). Cover também é pequeno (12x12 hoje em todos breakpoints) — perde presença visual.

### 2.2 RF-02 — Progress bar é input HTML cru

`MiniPlayerBar.tsx:360-370` é `<input type="range">` sem styling além de `flex-1 mx-2`. Thumb default do browser + sem tempo decorrido + sem tooltip hover. Spotify/Apple usa: track gradient + thumb maior + mm:ss visível + scrub preview. Custo baixo (CSS puro + tooltip Radix opcional via state local).

### 2.3 RF-03 — Controles cinza apertados

`MiniPlayerBar.tsx:255-358` renderiza 5 botões de transporte (prev|back15|toggle|fwd15|next) com mesmo tamanho `p-2` e cor `text-white hover:bg-white/10` — toggle play/pause sem destaque visual. Spotify destaca toggle (botão branco circular). Agrupamento pill dá contexto visual ("são controles de transporte"). Trade-off: toggle maior pode quebrar layout mobile — RF-03 mantém toggle `h-10` apenas em ≥768px.

### 2.4 RF-04 — Sidebar controls amontoados

`MiniPlayerBar.tsx:372-528` renderiza 9 botões sidebar (volume + speed + sleep + lessons + spotify + queue + help + expand + close) sem agrupamento. Dividers sutis `border-l border-white/10` entre grupos funcionais facilitam scan visual + reforçam "audio / queue / utils" como categorias.

### 2.5 RF-05 — Expanded mode é placeholder

`MiniPlayerExpanded.tsx` (108 linhas) renderiza só: título + cover sanitized + lista readonly de aulas do curso (`courseContext.lessons`). **Faltam:**
- Cover grande (hero).
- Transcript preview MP3.2 (já shipped backend — preview reuse).
- Controles maiores (paridade Spotify expanded).
- Queue inline (hoje o usuário precisa fechar expanded → abrir queue popover separado).
- Course context (título curso + módulo) — `activeTrack.courseTitle` existe mas só aparece em fonte pequena.
- Coach hint card: "Coach IA pode te recomendar a próxima aula" + CTA `/coach-ai` — reforça loop entre player + Coach (AI-2A já tem `recommend_lesson` tool).

**Decisão arquitetural pre-resolvida:** Radix Dialog `Dialog.Root`/`Dialog.Portal`/`Dialog.Overlay`/`Dialog.Content` (lesson #29 — useQuery em Dialog children precisa ErrorBoundary local). Substitui o `<div>` raiz atual + backdrop manual de `MiniPlayerExpanded.tsx`.

### 2.6 RF-06 — Empty state CTA pre-playback (UX gap crítico)

Founder relatou: "sem como entrar no mini player". Hoje quando `!activeTrack`, `MiniPlayerBar.tsx:185` retorna `null` — o player desaparece da tela. Usuário entra em `/inicio`, `/dashboard`, qualquer rota — sem player visível. Para começar a tocar precisa: ir em `/biblioteca` → clicar aula → entrar lesson viewer → start play.

**RF-06 resolve:** remove early return `!activeTrack`, renderiza versão reduced `h-12` (vs `h-16` track ativa) com 2 botões centrais:
- **"Escolher aula"** → abre `LessonPickerDialog` (já existe lazy global em `MiniPlayerBar.tsx:30-33`).
- **"Conectar Spotify"** (condicional — só renderiza se OAuth não concluído) → chama `initiateSpotifyAuth()` (já importado em `MiniPlayerBar.tsx:29`).

Trade-off: bar sempre visível pode incomodar usuário "Não quero player agora". Mitigação: botão close `X` ainda visível na versão reduced (chama `setDisplayMode('hidden')` que já existe — usuário pode esconder se quiser; persistir decisão? **Decisão default:** NÃO persistir (cada nova sessão volta a renderizar empty state). Justificativa: discoverability > preferência (founder pode rever em RF-07 follow-up).

---

## 3. Decisões pre-resolvidas (founder AFK)

Founder AFK confiou decisão. Defaults aplicados:

| Q | Pergunta | Decisão | Racional |
|---|---|---|---|
| **P1** | Spin → pulse: `opacity` ou `scale`? | **`opacity 95↔100%`** | Spotify reference; scale shake em segundo monitor distrai |
| **P2** | Pulse animation duration? | **2s ease-in-out infinite** | Suficiente p/ indicar playing sem stress visual |
| **P3** | Cover sizes responsivas exatas? | **16/14/12 (h-16 lg, h-14 md, h-12 base)** | Per pedido founder; 16x16 desktop dá presença sem dominar |
| **P4** | Progress track gradient direção? | **`from-blue-500 to-purple-500` LTR** | Marca Grindfy (poker-accent é azul); LTR padrão ocidental |
| **P5** | Hover scrub tooltip lib? | **state local + `<div>` absoluto** | Radix Tooltip dispara em focus também (acessibilidade), mas hover-only é melhor UX scrub; custom é 20 LoC |
| **P6** | Toggle bg-white sempre branco? | **Sim — `bg-white text-gray-900 hover:bg-gray-100`** | Spotify reference; alto contraste sobre glassmorphism |
| **P7** | Expanded mode: nested dialog (queue dentro)? | **Não — queue inline scroll** | Nested dialogs em Radix são feios; queue inline reduz cliques |
| **P8** | Expanded background: opaco ou glass? | **Glass + overlay `bg-black/60`** | Mantém continuidade visual com bar; overlay legibilidade |
| **P9** | Empty state: "Escolher aula" abre dropdown ou dialog? | **Dialog (`LessonPickerDialog` existente)** | Reuso 100%; dropdown teria que ser componente novo |
| **P10** | Empty state: esconder se `displayMode==='hidden'`? | **Sim — close `X` ainda existe e respeita** | Usuário tem escape hatch; default volta em nova sessão |
| **P11** | Spotify CTA empty state: redirect direct ou popup? | **Reusa `initiateSpotifyAuth` (popup fallback MP3 RF-07)** | Já robusto; não duplica lógica OAuth |
| **P12** | Coach hint card no expanded: dismissable? | **Sim — `localStorage.coach_hint.seen.v1`** | Founder pode promover para always-on em RF futuro |
| **P13** | Expanded transcript: reuse MP3.2 preview ou full? | **Preview 80 chars + ellipsis Unicode** | Full transcript é Wave 2 (cross-device sync gate) |
| **P14** | Telemetria novos eventos: namespace? | **`mini_player.*` (dot-namespace ADR-207)** | Convenção sprint MP-VALIDATION; reuse `recordActivity` |
| **P15** | Reduced-motion: animação total OFF ou redução? | **Total OFF (sem pulse, sem slide)** | A11y safe; UI estática quando user pediu menos motion |

Decisões P1-P11 afetam diretamente código; P12-P15 afetam policy.

---

## 4. Requisitos Funcionais

### RF-01 — Hero artwork enlarged + pulse opacity

**Prioridade:** MUST
**Effort:** M (1-2h)
**Refs:** lesson #1 (hooks order), tokens.color.action, ADR-208 (criar — pulse animation convention)

**Descrição.** Substituir cover 12x12 com `animate-spin-slow` por cover responsivo 16/14/12 com pulse opacity 95-100% quando playing + drop-shadow + ring glow sutil.

**Regras de negócio:**
- Cover sizes: `h-16 w-16` desktop (≥1024px), `h-14 w-14` tablet (768-1023px), `h-12 w-12` mobile (<768px). Tailwind responsive: `h-12 w-12 md:h-14 md:w-14 lg:h-16 lg:w-16`.
- Quando `isPlaying && !reducedMotion`: aplicar `animate-pulse-subtle` (custom — opacity 95↔100% loop 2s ease-in-out infinite). Definir em `tailwind.config.ts` se não existir (`pulseSubtle` keyframes).
- Quando `isPlaying`: aplicar `shadow-lg ring-1 ring-blue-500/30` (glow sutil — `tokens.color.action` hint).
- Quando `!isPlaying`: sem animação + `shadow-md` (presença menor).
- Quando `reducedMotion`: sem animação + sem ring (UI estática).
- Cover placeholder (sem `sanitizedCoverUrl`): mantém `bg-gray-700` mas com mesmas dimensões responsivas.

**Critério de aceitação:**
- [ ] `MiniPlayerBar.tsx:231-242` cover usa classes `h-12 w-12 md:h-14 md:w-14 lg:h-16 lg:w-16` (snapshot DOM check em test).
- [ ] `animate-spin-slow` REMOVIDO (regex grep no arquivo).
- [ ] `animate-pulse-subtle` aplicado quando `isPlaying && !reducedMotion` (test asserta className via `mock useAudioPlayer({ isPlaying: true })`).
- [ ] `shadow-lg ring-1 ring-blue-500/30` aplicado quando `isPlaying` (mesmo sob `reducedMotion`).
- [ ] `reducedMotion=true` → cover SEM `animate-pulse-subtle` (test asserta ausência).
- [ ] Placeholder div sem `coverUrl` ganha mesmas classes responsivas (paridade visual).
- [ ] `tailwind.config.ts` ganha keyframes `pulseSubtle` + animation `pulse-subtle` (se não existir).
- [ ] ADR-208 criada (convenção `pulse-subtle` vs `animate-pulse` default Tailwind — default é opacity 50%, MUITO agressivo).

**Módulos afetados:**
- `client/src/components/audio-player/MiniPlayerBar.tsx` (linhas 231-242).
- `tailwind.config.ts` (keyframes + animation).
- `Docs/architecture/decisions/208-pulse-subtle-animation.md` (novo).

**Edge cases:**
- Cover URL muda mid-play (queue advance): pulse não reseta (CSS animation continua). ✓
- Track sem cover → playing: placeholder ganha ring/shadow (não estranho — usuário ainda percebe playing).
- iOS Safari: testar `animate-pulse-subtle` no Safari mobile (Webkit prefix? — Tailwind compila com prefix automático via autoprefixer).

---

### RF-02 — Progress bar redesign (gradient + mm:ss + scrub tooltip)

**Prioridade:** MUST
**Effort:** M (2-3h)
**Refs:** lesson #1, tokens.font, ADR-208

**Descrição.** Refazer `<input type="range">` em `MiniPlayerBar.tsx:360-370` com track customizado gradient + thumb maior + mm:ss mono abaixo + hover scrub preview.

**Regras de negócio:**
- Track: `h-1` (4px) com gradient `bg-gradient-to-r from-blue-500 to-purple-500` via `accent-color` CSS OR custom range styling (pseudo-elements `::-webkit-slider-runnable-track` / `::-moz-range-track`).
- Thumb: `h-3 w-3` (12px) round (`rounded-full`) bg-white shadow-md. Pseudo-elements `::-webkit-slider-thumb` / `::-moz-range-thumb`. Touch-target reforçado via padding visual hover (`scale-125` on hover).
- Tempo decorrido + duração: `<div class="flex justify-between text-xs text-gray-400 font-mono tabular-nums">` abaixo do range. Format `formatMmSs(currentSeconds)` / `formatMmSs(durationSeconds)`. Helper `formatMmSs(sec) => "mm:ss"` em `client/src/lib/audio-engine/formatTime.ts` (criar OU reusar `formatMmSs` se existir).
- Hover scrub preview: state local `[scrubPreviewSec, setScrubPreviewSec] = useState<number | null>(null)`. `onMouseMove` no range calcula `((e.clientX - rect.left) / rect.width) * durationSeconds` + atualiza state. `onMouseLeave` zera. Tooltip `<div>` absoluto position acima do range (`absolute -top-7 left-[X%]`) mostrando `formatMmSs(scrubPreviewSec)`. Hover-only (focus NÃO mostra — keyboard nav usa setas + tem aria-label do range).
- A11y: `aria-label` mantido. `aria-valuetext` adicionado com `formatMmSs(currentSeconds)` + "de" + `formatMmSs(durationSeconds)`.

**Critério de aceitação:**
- [ ] Range input ganha className com gradient (via CSS custom em `index.css` OR Tailwind arbitrary `[&::-webkit-slider-thumb]:...`).
- [ ] Thumb visível `h-3 w-3` rounded-full bg-white (snapshot DOM).
- [ ] Wrapper `<div>` abaixo do range com `font-mono tabular-nums` + 2 spans `formatMmSs(...)`.
- [ ] Helper `formatMmSs(sec: number): string` em `client/src/lib/audio-engine/formatTime.ts` exporta `"00:00"` para 0, `"05:42"` para 342, `"60:00"` para 3600 (sem horas — `Math.floor(sec/60)`).
- [ ] Hover preview tooltip aparece em `onMouseMove` + some em `onMouseLeave` (test RTL `fireEvent.mouseMove` + assert tooltip rendered + `fireEvent.mouseLeave` + assert null).
- [ ] `aria-valuetext` plugado (test asserta atributo presente com format esperado).
- [ ] Keyboard nav (setas) continua funcionando (`fireEvent.keyDown` ArrowRight + assert `seek` chamado).
- [ ] `tokens.font.xs` (12px) usado nas labels mm:ss.

**Módulos afetados:**
- `client/src/components/audio-player/MiniPlayerBar.tsx` (linhas 360-370 e wrapper novo).
- `client/src/lib/audio-engine/formatTime.ts` (novo OU estendido se existir).
- `client/src/index.css` (custom range gradient — se Tailwind arbitrary não cobrir).

**Edge cases:**
- `durationSeconds === 0` (track ainda não carregou): mostrar `--:--` / `--:--` (não dividir por zero).
- `durationSeconds === Infinity` (stream): mostrar `--:--` na duração (live indicator?). Out-of-scope MP-MODERN — flag follow-up.
- Touch device (mobile): `onMouseMove` não dispara — scrub preview oculto em mobile. Aceitável (já existe `onChange` do range).
- Reduced motion: tooltip aparece sem fade-in (instant snap). Mantém função, sem animação.

---

### RF-03 — Controls grouping + spacing (pill + toggle destacado)

**Prioridade:** MUST
**Effort:** M (2h)
**Refs:** lesson #1, tokens.space

**Descrição.** Agrupar prev|back15|toggle|fwd15|next em pill visual + toggle maior bg-white destacado.

**Regras de negócio:**
- Wrapper externo `<div class="flex items-center gap-1 bg-white/5 rounded-full px-2 py-1">` envolve os 5 botões de transporte (`MiniPlayerBar.tsx:255-358`).
- Toggle (`data-testid="mini-player-toggle"`): `h-10 w-10 bg-white text-gray-900 hover:bg-gray-100 rounded-full flex items-center justify-center` (substitui `p-2 hover:bg-white/10 rounded-md text-white`). Mantém icon `<Play>`/`<Pause>` mas `w-5 h-5` continua.
- Outros 4 botões (prev/back15/fwd15/next): `h-8 w-8 flex items-center justify-center hover:bg-white/10 rounded-full` (substitui `p-2 ... rounded-md`). Icons mantêm `w-4 h-4`.
- Buffering spinner overlay (`MiniPlayerBar.tsx:314-322`): mantém comportamento, ajusta classes para round (`rounded-full` em vez de `rounded-md`).
- Mobile (<768px): pill ainda renderiza mas só com 3 botões (back15|toggle|fwd15) — prev/next já hidden via `showPrevNext = vp === "desktop"`. Pill visualmente menor mas mesma estrutura.
- aria-labels PT-BR preservados (não mudam: "Aula anterior", "Voltar 15 segundos", "Pausar"/"Tocar", "Avancar 15 segundos", "Proxima aula").

**Critério de aceitação:**
- [ ] Wrapper `<div>` com classes `bg-white/5 rounded-full px-2 py-1` envolve os 5 botões transporte (snapshot DOM).
- [ ] Toggle ganha classes `h-10 w-10 bg-white text-gray-900 hover:bg-gray-100 rounded-full` (className regex check).
- [ ] Outros botões transporte ganham `h-8 w-8 rounded-full` (snapshot).
- [ ] Mobile viewport (vp=mobile mock): pill ainda renderiza, prev/next ausentes (test mock `window.innerWidth=400`).
- [ ] aria-labels PT-BR preservados (test asserta strings existentes).
- [ ] Buffering spinner overlay mantém posição correta dentro do toggle redondo (visual check via snapshot).
- [ ] Telemetria `audio.play`/`audio.pause`/`audio.prev`/`audio.next` continua emitida (MP-VALIDATION RF-01 — regressão check).

**Módulos afetados:**
- `client/src/components/audio-player/MiniPlayerBar.tsx` (linhas 255-358).

**Edge cases:**
- Buffering overlay em toggle redondo: `rounded-full` precisa cobrir spinner (já é `absolute inset-0`).
- `disabled` state (prev/next sem courseContext): `disabled:opacity-40 disabled:cursor-not-allowed` mantém — visual coerente.
- Telemetria click handlers preservados — RF-03 mexe SÓ em className.

---

### RF-04 — Sidebar controls vertical layout (dividers + grupos)

**Prioridade:** MUST
**Effort:** M (1-2h)
**Refs:** tokens.space, lesson #1

**Descrição.** Agrupar visualmente 7-9 controles sidebar (volume + sleep + speed + queue + help + lessons + spotify + expand + close) em 4 grupos lógicos com dividers sutis.

**Regras de negócio:**
- Estrutura nova:

```tsx
<div className="flex items-center gap-1">
  {/* Grupo 1 — audio adjust */}
  <div className="flex items-center gap-1">
    {showVolume && <VolumeControl ... />}
    <SleepTimerControl ... />
    {showSpeed && activeTrack?.source !== "spotify" && <select ... />}
  </div>
  <div className="h-6 w-px bg-white/10 mx-1" aria-hidden="true" />
  {/* Grupo 2 — queue */}
  <button data-testid="mini-player-queue-button" ... />
  <div className="h-6 w-px bg-white/10 mx-1" aria-hidden="true" />
  {/* Grupo 3 — utils */}
  <div className="flex items-center gap-1">
    <button data-testid="mini-player-help-button" ... />
    <button data-testid="mini-player-lessons-button" ... />
    {/* Spotify connect OR badge */}
    {activeSource !== "spotify" ? <button data-testid="mini-player-spotify-connect" ... /> : <span data-testid="mini-player-spotify-badge" ... />}
  </div>
  <div className="h-6 w-px bg-white/10 mx-1" aria-hidden="true" />
  {/* Grupo 4 — window controls */}
  <button data-testid="mini-player-expand" ... />
  <button data-testid="mini-player-close" ... />
</div>
```

- Dividers: `<div class="h-6 w-px bg-white/10 mx-1" aria-hidden="true" />` (decorativo — aria-hidden). 3 dividers (não 4 — não há divider antes do grupo 1 nem depois do grupo 4).
- Mobile (<768px): dividers continuam renderizando mas alguns grupos ficam vazios (queue/spotify/lessons hidden `<768px`). **Decisão:** dividers ficam visíveis mesmo com grupos parcialmente vazios — quebra visual aceita (alternativa: render condicional dividers — adiciona complexidade JSX). **Re-decisão impl:** se reviewer reclamar, divider só renderiza se grupo seguinte tem >=1 botão visível.
- aria-labels: ordem de tabulação Tab → Tab → Tab continua linear left-to-right (sem `tabindex` custom). Dividers aria-hidden não aparecem em screen reader nav.

**Critério de aceitação:**
- [ ] 3 dividers `<div class="h-6 w-px bg-white/10 mx-1" aria-hidden="true" />` presentes (snapshot DOM `data-testid="mini-player-divider"` opcional — nice-to-have).
- [ ] Grupo 1 contém VolumeControl + SleepTimerControl + select speed (na ordem).
- [ ] Grupo 2 contém só queue button.
- [ ] Grupo 3 contém help + lessons + spotify (na ordem; spotify renderiza connect OU badge condicionalmente).
- [ ] Grupo 4 contém expand + close (na ordem).
- [ ] Keyboard Tab navigation preserva ordem visual (test fireEvent Tab + assert focus order).
- [ ] aria-labels PT-BR preservados (test asserta cada botão).
- [ ] Viewport mobile: dividers renderizam (snapshot) MAS botões hidden via `hidden md:inline-flex` continuam.

**Módulos afetados:**
- `client/src/components/audio-player/MiniPlayerBar.tsx` (linhas 372-528).

**Edge cases:**
- Spotify connect renderiza Loader2 spinner enquanto `spotifyConnecting=true` — wrapper grupo 3 não bloqueia.
- Queue popover (`QueuePopover`) renderiza positioned absolute via Radix — divider antes não afeta posicionamento.
- LessonPickerDialog renderiza no portal — divider depois não afeta.

---

### RF-05 — Expanded mode redesign (Radix Dialog full-screen + hero + queue inline + coach hint)

**Prioridade:** MUST
**Effort:** L (5-6h)
**Refs:** lesson #29 (ErrorBoundary local pra useQuery em sub-arvore), lesson #1, ADR-208, tokens

**Descrição.** Substituir `MiniPlayerExpanded.tsx` (108 linhas, lista readonly) por `ExpandedPlayerDialog.tsx` (novo, Radix Dialog full-screen) com hero cover + transcript preview + controles maiores + queue inline + course context + coach hint card.

**Regras de negócio:**

**Estrutura:**

```tsx
<Dialog.Root open={displayMode === "expanded"} onOpenChange={(o) => !o && setDisplayMode("bar")}>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[50] bg-black/60 backdrop-blur-sm" />
    <Dialog.Content
      data-testid="mini-player-expanded-dialog"
      className="fixed inset-0 z-[51] flex flex-col items-center overflow-y-auto p-6 bg-gray-900/95"
      aria-label="Player expandido"
    >
      {/* Header — close + minimize */}
      <header className="w-full max-w-2xl flex justify-between items-center mb-6">...</header>

      {/* Hero — cover grande + título + curso */}
      <section className="w-full max-w-md flex flex-col items-center gap-4">
        <img src={sanitizedCoverUrl} className="w-full max-w-md aspect-square rounded-lg shadow-2xl ..." />
        <h2 className="text-2xl font-bold text-white">{activeTrack.title}</h2>
        {activeTrack.courseTitle && <p className="text-sm text-gray-400">{activeTrack.courseTitle}{moduleTitle && ` · ${moduleTitle}`}</p>}
      </section>

      {/* Transcript preview (MP3.2 reuse) */}
      {transcriptionPreview && (
        <section className="w-full max-w-md mt-6 p-4 bg-white/5 rounded-md">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Trecho</p>
          <p className="text-sm text-gray-200">{transcriptionPreview}</p>
        </section>
      )}

      {/* Controls — maiores */}
      <div className="w-full max-w-md mt-6 flex flex-col gap-4">
        {/* Progress bar (reuse RF-02 component) */}
        <ProgressBar ... />
        {/* Transport (paridade RF-03 pill, mas maior: toggle h-12, outros h-10) */}
        <div className="flex items-center justify-center gap-2 bg-white/5 rounded-full px-4 py-2">...</div>
      </div>

      {/* Queue inline */}
      {queueItems && queueItems.length > 0 && (
        <section className="w-full max-w-md mt-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Fila</h3>
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {queueItems.map(...)}
          </ul>
        </section>
      )}

      {/* Coach hint card (dismissable) */}
      {!coachHintDismissed && (
        <aside className="w-full max-w-md mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-md flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-gray-200">Coach IA pode te recomendar a próxima aula</p>
            <Link href="/coach-ai" className="text-xs text-blue-400 hover:underline">Abrir Coach IA →</Link>
          </div>
          <button onClick={dismissCoachHint} aria-label="Dispensar dica" className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
        </aside>
      )}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

- **Dialog.Root** `open` bindado a `displayMode === "expanded"`. `onOpenChange` minimiza para `'bar'` quando Esc/click-outside (Radix nativo).
- **Hero cover** `max-w-md mx-auto aspect-square rounded-lg shadow-2xl`. Sem pulse aqui (presença grande já indica playing). Placeholder div quando sem coverUrl.
- **Transcript preview**: usar campo `activeTrack.transcriptionPreview` (já shipped MP3.2 — verificar shape no `useAudioPlayer` context; se não exposto, lazy fetch em mount via `useQuery` + ErrorBoundary local lesson #29). Default: preview MP3.2 já vem em `activeTrack` quando driver=internal_mp4. Spotify: sem preview (campo null) — section não renderiza.
- **Controles maiores**: paridade RF-03 mas escala +25% (toggle `h-12 w-12`, outros `h-10 w-10`). Reusar handlers do `useAudioPlayer` context — sem lógica nova.
- **Queue inline**: lista até 10 itens (`queueItems.slice(0, 10)` — se >10, mostra "Ver fila completa" CTA que abre QueuePopover). Cada item: cover thumb 8x8 + título + duração + botão remove. Click no item → `skipToQueueItem(index)`.
- **Coach hint card**: dismissable via `localStorage.setItem('coach_hint.expanded.seen.v1', 'true')`. Estado local `useState` lido em mount. Link Wouter `/coach-ai` (RF-04 do MP-VALIDATION confirmou rota canônica).
- **Close (X)** no header chama `close()` (mata track). **Minimize (ChevronDown)** chama `setDisplayMode('bar')`.
- **Module title**: se `courseContext.modules` existir + tiver `currentLessonModuleId`, mostrar `courseTitle + " · " + moduleTitle`. Default: só `courseTitle`. Out-of-scope mapear module — usar `activeTrack.courseTitle` direto se `courseContext` não tem.
- **Reduced motion**: Radix Dialog tem animação default fade+scale. Override via `data-reduced-motion` + CSS `motion-reduce:animate-none`.
- **Scroll**: `<Dialog.Content>` tem `overflow-y-auto` — content acima da fold (queue + coach hint) é scrollável.
- **A11y**: `aria-label="Player expandido"` no Content. Focus trap nativo Radix. Esc fecha. `aria-modal="true"` automático.

**Critério de aceitação:**
- [ ] `client/src/components/audio-player/ExpandedPlayerDialog.tsx` (novo) criado, exporta `ExpandedPlayerDialog`.
- [ ] `MiniPlayerExpanded.tsx` removido (ou virou re-export para back-compat — decisão impl).
- [ ] `App.tsx` (ou onde `MiniPlayerExpanded` é renderizado) atualizado para renderizar `ExpandedPlayerDialog`.
- [ ] Dialog abre quando `displayMode === "expanded"` (test RTL: chamar `setDisplayMode('expanded')` + assert `getByTestId('mini-player-expanded-dialog')` visible).
- [ ] Esc fecha (test RTL: `fireEvent.keyDown(document, { key: 'Escape' })` + assert `setDisplayMode('bar')` chamado).
- [ ] Click overlay fecha (test RTL: `fireEvent.click(overlay)` + assert minimize).
- [ ] Hero cover renderiza com `max-w-md aspect-square` (snapshot).
- [ ] Transcript preview renderiza quando `activeTrack.transcriptionPreview` definido; ausente quando null (test mock).
- [ ] Queue inline renderiza até 10 itens (test mock `queueItems` array 15 + assert apenas 10 + "Ver fila completa" CTA).
- [ ] Coach hint card renderiza por default; dismissado some + persiste localStorage (test localStorage spy).
- [ ] Link `/coach-ai` usa Wouter `<Link href="/coach-ai">` (lesson #23 — Wouter v3 nested anchor cuidado).
- [ ] Telemetria `mini_player.expanded.open` emitida em open (test mock `recordActivity`).
- [ ] Reduced motion respeita (test mock `matchMedia('reduce').matches=true` + assert sem animation class).

**Módulos afetados:**
- `client/src/components/audio-player/ExpandedPlayerDialog.tsx` (novo).
- `client/src/components/audio-player/MiniPlayerExpanded.tsx` (remove OU re-export).
- `client/src/App.tsx` (onde MiniPlayerExpanded é renderizado — confirmar via Grep).

**Edge cases:**
- `!activeTrack` quando dialog aberto: dialog fecha automaticamente (`open` vira false). Edge: race ao close() durante expanded — Radix handles graceful.
- `transcriptionPreview` undefined: section omitida sem placeholder (decisão minimalismo).
- Queue muito longa (>50 itens): só 10 renderizados — sem perf hit.
- Spotify driver: transcript ausente, queue vazia normalmente — hero + controls + coach hint ainda renderizam (player expanded faz sentido só com hero/transport mesmo sem queue).
- Reduced motion + click overlay rápido: Radix lida (sem flicker).

---

### RF-06 — Empty state CTA pre-playback (bar reduced + 2 botões)

**Prioridade:** MUST
**Effort:** M (2-3h)
**Refs:** lesson #1, lesson #29, tokens.color.action

**Descrição.** Remover early return `!activeTrack` em `MiniPlayerBar.tsx:185`. Renderizar componente `EmptyStateCTA` (inline ou separado) com bar reduced `h-12` + 2 botões centrais ("Escolher aula" + "Conectar Spotify").

**Regras de negócio:**

**Estrutura:**

```tsx
export function MiniPlayerBar() {
  const ctxRaw = useAudioPlayer() as any;
  const { activeTrack, displayMode, ... } = ctxRaw;
  // ... hooks (mantém ordem — lesson #1)
  useMiniPlayerHeight();
  // ... state hooks
  useKeyboardShortcuts({...});

  if (displayMode === "hidden") return null;

  // RF-06 — empty state quando sem track
  if (!activeTrack) {
    return <EmptyStateCTA />;
  }

  // Bar normal (track ativa)
  return <div data-testid="mini-player-bar" ...>...</div>;
}

function EmptyStateCTA() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  const ctxRaw = useAudioPlayer() as any;
  const activeSource = ctxRaw?.activeSource ?? null;
  const isSpotifyConnected = activeSource === "spotify"; // só renderiza CTA Spotify se não conectado

  return (
    <div
      data-testid="mini-player-empty-cta"
      role="complementary"
      aria-label="Mini player sem aula ativa"
      className="fixed bottom-0 left-0 right-0 z-40 h-12 px-3 flex items-center justify-center gap-3 bg-gray-900/60 backdrop-blur-glass border-t border-white/10 text-white"
      style={{ backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)" }}
    >
      <button
        type="button"
        data-testid="mini-player-empty-choose-lesson"
        className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-md text-sm font-medium"
        onClick={() => {
          emitAudioEvent('mini_player.empty_cta.choose_lesson', {});
          setPickerOpen(true);
        }}
      >
        <BookOpen className="w-4 h-4 inline mr-1" /> Escolher aula
      </button>
      {!isSpotifyConnected && (
        <button
          type="button"
          data-testid="mini-player-empty-spotify-connect"
          disabled={spotifyConnecting}
          className="px-4 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 rounded-md text-sm font-medium"
          onClick={async () => {
            emitAudioEvent('mini_player.empty_cta.spotify_connect', {});
            setSpotifyConnecting(true);
            try { await initiateSpotifyAuth(); } catch (err) { console.warn(err); } finally { setSpotifyConnecting(false); }
          }}
        >
          {spotifyConnecting ? <Loader2 className="w-4 h-4 inline mr-1 animate-spin" /> : <Music className="w-4 h-4 inline mr-1" />}
          Conectar Spotify
        </button>
      )}
      {pickerOpen && (
        <Suspense fallback={null}>
          <LessonPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
        </Suspense>
      )}
    </div>
  );
}
```

- Bar reduced height `h-12` (vs `h-16` track ativa) — calcular impacto em `useMiniPlayerHeight()` (var CSS `--mini-player-height` — RF-06 deve atualizar pra `'48px'` quando empty state, `'80px'` quando bar normal). **Decisão:** `useMiniPlayerHeight` ganha awareness de `activeTrack` — quando null, retorna 48; quando ativo, 80. Outros layouts que reservam espaço (`padding-bottom: var(--mini-player-height)`) compensam automaticamente.
- Botões: "Escolher aula" sempre renderiza. "Conectar Spotify" renderiza só se `activeSource !== 'spotify'` (não conectado).
- Telemetria: 2 eventos novos via `recordActivity` (RF-01 MP-VALIDATION pattern):
  - `mini_player.empty_cta.choose_lesson` — `{}` metadata (sem PII).
  - `mini_player.empty_cta.spotify_connect` — `{}` metadata.
- A11y: aria-label do container "Mini player sem aula ativa". Botões com labels visíveis (texto + icon).
- Reduced motion: sem animation entry — empty state aparece estático.
- Close (X) **NÃO renderiza** em empty state — não há track pra fechar. `displayMode='hidden'` continua possível via shortcut OU `setDisplayMode('hidden')` chamado externamente (decisão founder: empty state é sticky default; usuário só esconde via lógica programática externa).

**Critério de aceitação:**
- [ ] Early return `!activeTrack` em `MiniPlayerBar.tsx:185` REMOVIDO.
- [ ] Quando `activeTrack === null && displayMode !== 'hidden'`: renderiza `<EmptyStateCTA>` (test RTL mock).
- [ ] `EmptyStateCTA` renderiza `data-testid="mini-player-empty-cta"` container.
- [ ] Botão "Escolher aula" `data-testid="mini-player-empty-choose-lesson"` sempre presente.
- [ ] Botão "Conectar Spotify" `data-testid="mini-player-empty-spotify-connect"` presente quando `activeSource !== 'spotify'`; ausente quando conectado (test mock).
- [ ] Click "Escolher aula" abre `LessonPickerDialog` (`pickerOpen=true`) + emite `mini_player.empty_cta.choose_lesson` (test recordActivity spy).
- [ ] Click "Conectar Spotify" chama `initiateSpotifyAuth()` + emite `mini_player.empty_cta.spotify_connect` (test).
- [ ] `useMiniPlayerHeight()` retorna 48 quando `!activeTrack`, 80 quando ativo (test mock).
- [ ] `displayMode === 'hidden'` continua escondendo TUDO (test).
- [ ] Reduced motion: sem entry animation (test).
- [ ] Lesson #1: hooks de `MiniPlayerBar` continuam ordem fixa antes do return — early return só para `displayMode==='hidden'` (after hooks).

**Módulos afetados:**
- `client/src/components/audio-player/MiniPlayerBar.tsx` (remove early return + extrai/inline EmptyStateCTA).
- `client/src/hooks/useMiniPlayerHeight.ts` (lógica `activeTrack`-aware).
- `client/src/lib/activity-telemetry.ts` (2 eventos novos — reuso `emitAudioEvent` ou novo `emitMiniPlayerEvent`).

**Edge cases:**
- `displayMode='hidden'` + `!activeTrack`: return null (mesma lógica). Empty state respeita hidden.
- Usuário clica "Conectar Spotify" → OAuth popup → cancela: `spotifyConnecting=false`, botão volta. Sem track ativa (auth não cria track) — empty state persiste.
- Usuário escolhe aula via picker → track carrega → `activeTrack` define → `EmptyStateCTA` desmonta + `MiniPlayerBar` normal renderiza. Sem flicker (mesmo container fixed bottom).
- `useMiniPlayerHeight()` consumido por outros layouts (`/inicio` reservar espaço): mudança 80→48 quando empty state pode causar jump visual em mount. Mitigação: transition CSS `transition: padding-bottom 200ms ease-out` no body (RF-06 stretch — pode ser follow-up se introduzir bug).
- Sessão sem `AudioPlayerProvider` (raro — só /admin/* não tem): `useAudioPlayer()` throw — ErrorBoundary local. **Decisão:** envolver `MiniPlayerBar` raiz em ErrorBoundary que retorna `null` (lesson #29 generalizada). Stretch follow-up.

---

## 5. Mapeamento Arquitetural

### Componentes afetados

| Componente | Status | Mudanças |
|---|---|---|
| `client/src/components/audio-player/MiniPlayerBar.tsx` | **MODIFICADO** | RF-01 (cover responsivo + pulse), RF-02 (progress bar), RF-03 (controls pill), RF-04 (sidebar dividers), RF-06 (remove early return + render EmptyStateCTA) |
| `client/src/components/audio-player/MiniPlayerExpanded.tsx` | **REMOVIDO** ou **RE-EXPORT** | Substituído por ExpandedPlayerDialog (RF-05) |
| `client/src/components/audio-player/ExpandedPlayerDialog.tsx` | **NOVO** | Radix Dialog full-screen — hero + transcript + controls + queue + coach hint (RF-05) |
| `client/src/components/audio-player/EmptyStateCTA.tsx` | **NOVO** (ou inline em MiniPlayerBar.tsx) | Bar reduced + 2 CTAs (RF-06). Inline preferível se ≤80 LoC; arquivo separado se ≥120 LoC. |
| `client/src/lib/audio-engine/formatTime.ts` | **NOVO** ou **MODIFICADO** | Helper `formatMmSs(sec)` (RF-02) |
| `client/src/hooks/useMiniPlayerHeight.ts` | **MODIFICADO** | Aware de `activeTrack` — retorna 48 quando null, 80 quando ativo (RF-06) |
| `client/src/lib/activity-telemetry.ts` | **MODIFICADO** | 3 eventos novos: `mini_player.expanded.open` (RF-05), `mini_player.empty_cta.choose_lesson`, `mini_player.empty_cta.spotify_connect` (RF-06) |
| `client/src/App.tsx` | **MODIFICADO** | Substituir `<MiniPlayerExpanded />` por `<ExpandedPlayerDialog />` (RF-05) |
| `client/src/index.css` | **MODIFICADO** | Custom range gradient styling pra progress bar (RF-02) — se Tailwind arbitrary não cobrir webkit/moz prefixes |
| `tailwind.config.ts` | **MODIFICADO** | Keyframes `pulseSubtle` + animation `pulse-subtle` (RF-01) |
| `Docs/architecture/decisions/208-pulse-subtle-animation.md` | **NOVO** | ADR convenção pulse-subtle (RF-01) |
| `Docs/architecture/diagrams/sprint-mp-modern/` | **NOVO** | 2 diagramas Mermaid: `mini-player-states.mermaid` (idle/playing/paused/expanded/empty) + `expanded-dialog-anatomy.mermaid` (Dialog tree + sections) |

### Componentes NÃO afetados (intocados)

- `client/src/contexts/AudioPlayerContext.tsx` — **ZERO mudança**.
- `client/src/lib/audio-engine/*` (exceto `formatTime.ts`) — **ZERO mudança**.
- `client/src/lib/audio-engine/sources/*Driver.ts` — **ZERO mudança**.
- `client/src/lib/spotify/auth.ts` — **ZERO mudança**.
- `client/src/components/audio-player/VolumeControl.tsx` — **ZERO mudança**.
- `client/src/components/audio-player/SleepTimerControl.tsx` — **ZERO mudança**.
- `client/src/components/audio-player/QueuePopover.tsx` — **ZERO mudança** (queue inline em ExpandedPlayerDialog é nova UI, não reusa QueuePopover — duplica lista item rendering ~30 LoC; aceito).
- `client/src/components/audio-player/ShortcutsHelpPopover.tsx` — **ZERO mudança**.
- `client/src/components/audio-player/LessonPickerDialog.tsx` — **ZERO mudança** (reuso direto).
- `client/src/components/audio-player/MiniPlayerOnboarding.tsx` — **ZERO mudança** (onboarding tooltip continua na bar, não no empty state).
- `client/src/hooks/useKeyboardShortcuts.ts` — **ZERO mudança**.
- `client/src/hooks/useQueueState.ts` — **ZERO mudança**.
- Backend (`server/**`) — **ZERO mudança**.
- Schema (`shared/schema.ts`) — **ZERO mudança**.

### Decisões arquiteturais

| Decisão | Escolha | Alternativa rejeitada | Racional |
|---|---|---|---|
| **D1** Radix Dialog vs custom modal | Radix Dialog | Custom `<div>` overlay | Radix oferece focus trap + Esc + aria-modal nativos; lesson #29 (ErrorBoundary local pra sub-arvore com useQuery) |
| **D2** Pulse animation impl | Tailwind keyframes custom (`tailwind.config.ts`) | Framer Motion | Tailwind compila CSS estático; Framer adiciona JS runtime overhead; pulse não precisa orchestration |
| **D3** Progress bar gradient | Custom CSS `index.css` | Tailwind arbitrary `[&::-webkit-slider-thumb]:...` | Pseudo-elements de range não funcionam consistentemente em Tailwind arbitrary; CSS dedicado é mais legível |
| **D4** Empty state inline vs componente separado | Inline em MiniPlayerBar.tsx se ≤80 LoC | Arquivo separado | Inline reduz file tree + mantém co-localidade visual; >=120 LoC sobe pra arquivo |
| **D5** Coach hint card dismissable persist | `localStorage.coach_hint.expanded.seen.v1` | Per-session state | Founder default "dismiss persistente" — usuário não quer ser perseguido; sempre pode reativar em settings |
| **D6** ExpandedPlayerDialog queue inline | Lista nova até 10 + "Ver fila completa" CTA | Reuso QueuePopover dentro do dialog | QueuePopover é Radix Popover (nested dialogs ugly); duplicação ~30 LoC aceita |
| **D7** `useMiniPlayerHeight` aware de activeTrack | Sim — retorna 48/80 dinâmico | Sempre 80 (espaço wasted quando empty) | Layouts dependentes (var CSS) precisam compensar; reduced height empty state ganha |
| **D8** Telemetria namespace | `mini_player.*` dot-namespace | `audio.*` (MP-VALIDATION) | MP-VALIDATION RF-01 usa `audio.*` pra eventos de track; novo `mini_player.*` separa eventos de UI interaction. ADR-207 já permite ambos. |

---

## 6. Telemetria

3 eventos novos (alem dos 17 do MP-VALIDATION + 9 do MP3 já shipped):

| Event | Where | Metadata | Throttle |
|---|---|---|---|
| `mini_player.expanded.open` | `ExpandedPlayerDialog` open (`displayMode` muda para `'expanded'`) | `{ track_id, source_driver }` | 1/click |
| `mini_player.empty_cta.choose_lesson` | `EmptyStateCTA` botão "Escolher aula" click | `{}` (sem PII) | 1/click |
| `mini_player.empty_cta.spotify_connect` | `EmptyStateCTA` botão "Conectar Spotify" click | `{}` | 1/click |

**Convenção ADR-207:** dot-namespace, snake_case dentro do namespace, metadata cap 10KB (já enforcado server-side), PII strip server-side.

**Reuso lib:** `client/src/lib/activity-telemetry.ts` exporta `emitAudioEvent` (já existe — MP-VALIDATION). Estender com `emitMiniPlayerEvent(action, metadata)` OR usar `emitAudioEvent` direto com namespace `mini_player.*` (decisão impl — preferir extensão se mantém type safety).

**Best-effort:** todas as emissões em try/catch — lesson #9 log antes de swallow. Telemetria NUNCA bloqueia UX.

**Dedupe:** não necessário para os 3 eventos (1 evento = 1 click; sem repetição rápida).

**Padrão server-side:** os 3 eventos não criam coluna `library_progress` (RF-05 MP-VALIDATION resolveu) — só populam `user_activity` table (`POST /api/user-activity/batch` cap 10).

---

## 7. Plano de Testes

### Estratégia

- **RTL** (`@testing-library/react`) para interaction tests (click/keydown/mousedown).
- **Snapshot via inline classnames check** para visual regression — testar classes Tailwind aplicadas (não DOM serializado completo, evita brittleness).
- **Mocks**: `useAudioPlayer` mockado via `vi.mock('@/contexts/AudioPlayerContext')` (padrão MP-VALIDATION).
- **Reduced motion**: mock `window.matchMedia('(prefers-reduced-motion: reduce)')` via setup.ts helper.
- **Viewport**: mock `window.innerWidth` + `dispatchEvent(new Event('resize'))` para testar responsive.
- **Lesson #38**: tests `.test.tsx` usam UM ÚNICO estilo de import (preferir `await import` consistentemente).

### Suites por RF

#### RF-01 (cover + pulse)

```
tests/client/audio-player/mini-player-bar.cover.test.tsx
  ✓ renders cover with responsive classes h-12 w-12 md:h-14 md:w-14 lg:h-16 lg:w-16
  ✓ applies animate-pulse-subtle when isPlaying and not reducedMotion
  ✓ does NOT apply animate-pulse-subtle when reducedMotion=true
  ✓ does NOT apply animate-spin-slow (regression test)
  ✓ applies shadow-lg ring-1 ring-blue-500/30 when isPlaying
  ✓ applies shadow-md (no ring) when !isPlaying
  ✓ placeholder div (no coverUrl) ganha responsive classes
```

#### RF-02 (progress bar)

```
tests/client/audio-player/mini-player-bar.progress.test.tsx
  ✓ progress bar renders with h-1 height
  ✓ thumb visible with h-3 w-3 rounded-full
  ✓ mm:ss labels render abaixo com font-mono tabular-nums
  ✓ formatMmSs(0) === '00:00', formatMmSs(342) === '05:42', formatMmSs(3600) === '60:00'
  ✓ hover preview tooltip aparece em onMouseMove + escode em onMouseLeave
  ✓ aria-valuetext plugado com formato '5:42 de 10:00'
  ✓ keyboard ArrowRight chama seek(currentSeconds + 1)
  ✓ durationSeconds===0 renderiza '--:--' em vez de format
  ✓ telemetria audio.seek emitida em onChange (regressão MP-VALIDATION)
```

#### RF-03 (controls pill)

```
tests/client/audio-player/mini-player-bar.controls.test.tsx
  ✓ pill wrapper bg-white/5 rounded-full px-2 envolve 5 botões transporte
  ✓ toggle ganha h-10 w-10 bg-white text-gray-900
  ✓ outros transporte (prev/back15/fwd15/next) ganham h-8 w-8
  ✓ mobile viewport: pill renderiza, prev/next ausentes (showPrevNext=false)
  ✓ aria-labels PT-BR preservados (assertion strings exatas)
  ✓ buffering overlay rounded-full coverage (snapshot)
  ✓ telemetria audio.play/audio.pause/audio.prev/audio.next emitida (regressão MP-VALIDATION)
```

#### RF-04 (sidebar dividers)

```
tests/client/audio-player/mini-player-bar.sidebar.test.tsx
  ✓ 3 dividers h-6 w-px bg-white/10 mx-1 renderizados (snapshot count)
  ✓ grupo 1: VolumeControl + SleepTimerControl + select speed (na ordem)
  ✓ grupo 2: queue button isolado
  ✓ grupo 3: help + lessons + spotify (connect ou badge condicional)
  ✓ grupo 4: expand + close
  ✓ ordem Tab navigation preserva left-to-right (focus chain)
  ✓ dividers aria-hidden=true (screen reader skip)
```

#### RF-05 (expanded dialog)

```
tests/client/audio-player/expanded-player-dialog.test.tsx
  ✓ dialog open quando displayMode==='expanded'
  ✓ dialog closed quando displayMode==='bar'
  ✓ Esc keydown chama setDisplayMode('bar')
  ✓ click overlay chama setDisplayMode('bar')
  ✓ hero cover renderiza max-w-md aspect-square rounded-lg
  ✓ transcript preview renderiza quando activeTrack.transcriptionPreview definido
  ✓ transcript preview ausente quando undefined
  ✓ queue inline renderiza até 10 itens; mostra "Ver fila completa" CTA se >10
  ✓ click item da queue chama skipToQueueItem(index)
  ✓ coach hint card renderiza por default
  ✓ click dismiss coach hint persiste localStorage.coach_hint.expanded.seen.v1
  ✓ link /coach-ai usa Wouter Link href
  ✓ telemetria mini_player.expanded.open emitida em open
  ✓ reduced motion: sem animation class em Dialog.Content
  ✓ controles maiores: toggle h-12, outros h-10
  ✓ close (X) chama close() (mata track)
  ✓ minimize (ChevronDown) chama setDisplayMode('bar')
```

#### RF-06 (empty state)

```
tests/client/audio-player/empty-state-cta.test.tsx
  ✓ renderiza data-testid="mini-player-empty-cta" quando !activeTrack && displayMode!=='hidden'
  ✓ NÃO renderiza quando displayMode==='hidden'
  ✓ NÃO renderiza quando activeTrack definido (renderiza MiniPlayerBar normal)
  ✓ botão "Escolher aula" sempre presente
  ✓ botão "Conectar Spotify" presente quando activeSource!=='spotify'
  ✓ botão "Conectar Spotify" ausente quando activeSource==='spotify'
  ✓ click "Escolher aula" abre LessonPickerDialog (pickerOpen=true) + emite telemetria
  ✓ click "Conectar Spotify" chama initiateSpotifyAuth + emite telemetria
  ✓ useMiniPlayerHeight retorna 48 quando empty, 80 quando activeTrack
  ✓ hooks order preservada (lesson #1) — early return só após hooks
  ✓ reduced motion: sem entry animation
```

### Regression suite

Reusar suites baseline MP1..MP3.3 + MP-VALIDATION:
- `tests/client/audio-player/mini-player-bar.test.tsx` (MP1 baseline)
- `tests/client/audio-player/mini-player-expanded.test.tsx` (MP1 baseline — atualizar para `expanded-player-dialog.test.tsx`)
- `tests/client/audio-player/audio-telemetry.test.ts` (MP-VALIDATION — 17 eventos)

Target: **TODOS verde** após sprint. Failures conhecidos pre-sprint (115 harness — lesson #14/#26/#38) mantidos.

### Visual regression (manual founder)

Pos-merge founder roda manualmente:
- Lighthouse mobile a11y ≥90 (run em `/biblioteca` + `/grind-live` + `/inicio` com mini player visible).
- Screenshot comparison desktop/tablet/mobile (cover sizes + pill grouping + dividers).
- Reduced motion test (Chrome DevTools → Rendering → Emulate prefers-reduced-motion: reduce).
- Empty state test (logout/no track + abrir / inicio — empty state deve aparecer com 2 CTAs).
- Expanded dialog test (click ChevronUp → modal full-screen + Esc fecha).

### Build size

Cap declarado: build NÃO cresce >10KB gzip. Verificar via `npm run build` + comparar `dist/assets/index-*.js` size before/after. Se cresce, investigar:
- Framer Motion lazy-load (não adicionar global).
- Radix Dialog já no bundle (MP1 usa).
- ExpandedPlayerDialog é o maior delta (~120-180 LoC) — gzip ~3-5KB esperado.

### tsc strict

`npm run check` = 0 erros. Lesson #22 (`ColorKey` literal sem `delta`) já resolvida.

---

## 8. Riscos + Mitigações

| Risco | Severidade | Mitigação |
|---|---|---|
| Cover responsive `h-16 lg` cresce demais em desktop pequeno (1024x768) — quebra layout bar | M | Test snapshot viewport 1024px + verifica bar não overflow; fallback `lg:h-14` se reviewer reclamar |
| Custom range gradient não funciona consistentemente em Safari iOS (Webkit prefix) | M | Test manual founder em iOS Safari pos-merge; fallback `accent-color: #6366f1` se gradient não renderizar |
| Hover scrub tooltip flicker em mousemove rápido (re-render React 60fps) | L | useState com requestAnimationFrame throttle se reviewer detectar; default sem throttle (mousemove é low freq) |
| Radix Dialog full-screen quebra `useMiniPlayerHeight` (var CSS) — content por baixo do dialog | L | Dialog tem `z-[51]` > bar `z-40` + overlay `z-[50]`; var CSS continua bar height (48 ou 80) |
| Coach hint card aparece para usuários que já dismissaram em sessão anterior | L | localStorage persist `coach_hint.expanded.seen.v1` cobre; teste asserta read na mount |
| ExpandedPlayerDialog `useQuery` em sub-arvore (transcript fetch) sem QueryClientProvider em teste | M | Lesson #29 — ErrorBoundary local em ExpandedPlayerDialog children; test mock activeTrack.transcriptionPreview direto (não usa useQuery se vier no context) |
| `useMiniPlayerHeight` mudança 80→48 causa visual jump em layouts (`/inicio` body padding-bottom) | M | Transition CSS `transition: padding-bottom 200ms ease-out` no body (stretch RF-06); reverter se gerar flicker |
| EmptyStateCTA `initiateSpotifyAuth` popup falha silenciosamente sem feedback | M | Reuso fluxo MP3 RF-07 (já robusto — 5 error states + popup fallback automático); console.warn lesson #9 |
| Tests `.test.tsx` mix `await import` + `require` (lesson #38) | M | Test-writer briefing: usar `await import` consistentemente; spec destaca lesson nas notes |
| Wouter v3 nested anchor case-dependent no coach hint link (lesson #23) | L | Verificar package.json wouter >=3.0.0 (já está em main); usar `<Link href="/coach-ai">label</Link>` sem `<a>` child |
| Build size +10KB ultrapassado (cap excedido) | L | ExpandedPlayerDialog é principal contributor; lazy-load via `React.lazy(() => import('./ExpandedPlayerDialog'))` em App.tsx se necessário |
| `activeSource` check pra Spotify badge/CTA pode estar stale logo após OAuth complete | M | Reuso pattern MP-VALIDATION (já handled); test com `activeSource` mock + transição |
| Reviewer R1 pede mudança arquitetural (e.g. EmptyStateCTA file separado vs inline) | L | D4 deixa flex (≤80 LoC inline; >120 LoC separar) — reviewer chooses |
| `MiniPlayerExpanded.tsx` deletado quebra import em outros files | M | Grep `MiniPlayerExpanded` antes de delete; re-export pattern se >=1 consumer; default delete (App.tsx é único consumer esperado) |
| Telemetria 3 eventos novos confundem com namespace MP-VALIDATION existente | L | ADR-207 já permite multi-namespace; addendum no ADR-208 documentando `mini_player.*` (separado de `audio.*`) |
| Sprint cap 18h estoura (RF-05 mais pesado que estimado) | M | RF-06 pode deslizar pra MP-MODERN-2 follow-up se RF-05 puxar 8h+; founder decide pos-impl |

---

## 9. Fora de escopo (não-objetivos)

- **Lazy load player components** (Framer Motion/Radix sob React.lazy) — RF-MP-MODERN-2 se build size estourar.
- **Player full-screen lyrics karaoke-style** — Wave 2 (cross-device sync gate).
- **Mini player horizontal swipe gestures mobile** — Wave 2.
- **Cover blur background no expanded mode** — RF-MP-MODERN-2 (pequeno polish — apenas se founder pedir).
- **Empty state animations entry** (slide-up Framer Motion) — RF-06 V2 (reduced motion safe primeiro).
- **Persistir "Empty state dismissado"** (sessão atual ou cross-session) — default founder decision NÃO persiste.
- **Coach hint dinâmico** (mostrar conteúdo da recommend_lesson tool) — Wave 2 (AI-2A + Coach hooks integration).
- **Cover dominant color extraction** (Color Thief / WebGL) — RF-MP-MODERN-3 se founder pedir polish "Spotify-like color theming".
- **Equalizer/audio visualizer no expanded** — Wave 2 (não é prio).
- **Queue drag-reorder no expanded mode inline** — Wave 2 (QueuePopover já cobre via @dnd-kit).
- **Refactor `useMiniPlayerHeight` para usar ResizeObserver** — RF-MP-MODERN-2 (current state hardcoded é suficiente).

---

## 10. Dependências e Pré-requisitos

- **MP3.2 RF-04.2 shipped** (transcription preview no `activeTrack.transcriptionPreview`) — confirmar field exposto via `useAudioPlayer` antes de impl RF-05. **Se ausente**, RF-05 transcript section deixa de renderizar (graceful) + flag follow-up MP-MODERN-2.
- **UX-GLOBAL-BUTTONS shipped** (`initiateSpotifyAuth` + `LessonPickerDialog` lazy global em MiniPlayerBar) — confirmado em main `4ae3c738`.
- **MP-VALIDATION shipped** (ADR-207 dot-namespace + lib `activity-telemetry.ts` exporta `emitAudioEvent`) — confirmado em main `a4ed3527`.
- **Coach-ai rota canônica** `/coach-ai` confirmada (MP-VALIDATION RF-04).
- **Tokens** `client/src/lib/ui-tokens.ts` v1.0 + `Docs/conventions/ui-patterns.md` v1.0 — confirmados.

Sem migration. Sem schema. Sem env var.

---

## 11. Pipeline TDD Plano

1. **pm-spec (este doc)** — DONE.
2. **system-architect** — criar ADR-208 + 2 diagramas Mermaid em `Docs/architecture/diagrams/sprint-mp-modern/` (`mini-player-states.mermaid` + `expanded-dialog-anatomy.mermaid`). Validar D1-D8 + risk mitigations.
3. **test-writer** — escrever red-phase tests cobrindo critérios de aceitação RF-01..RF-06 (~50-70 tests novos). Reusar mocks `useAudioPlayer` MP-VALIDATION pattern. **Briefing obrigatório:** lesson #38 (await import consistente), lesson #1 (hooks order), lesson #29 (ErrorBoundary local em RF-05 transcript fetch), lesson #23 (Wouter v3 nested anchor coach hint link).
4. **implementer** — green-phase. Substituir cover/progress/controls/sidebar/expanded/empty state. **NÃO modifica tests.** **NÃO toca AudioPlayerContext / drivers / hooks core.** Cap 18h.
5. **/simplify** — pos-implementer, antes reviewer. Remover comentários redundantes, JSDoc decorativo, dead imports.
6. **reviewer** — R1 esperado APPROVED-WITH-NITS (CRITICAL bar baixa — não há lógica nova; UI-only). Possíveis NITs: pulse animation duration tweaking, divider conditional render mobile, coach hint dismiss flow.
7. **commit + push main** (founder gate).

### Branch + commit format

- Branch: `feature/sprint-mp-modern` sai de `main@292768a1`.
- Commit message format (caveman):
  ```
  feat(mp-modern): redesign visual + UX polish — 6 RFs

  RF-01 cover responsive + pulse opacity (no spin)
  RF-02 progress bar gradient + mm:ss + scrub preview
  RF-03 controls pill + toggle destacado
  RF-04 sidebar dividers + 3 grupos
  RF-05 ExpandedPlayerDialog Radix + hero + queue inline + coach hint
  RF-06 EmptyStateCTA bar reduced + 2 CTAs

  ADR-208 + 2 diagramas. Zero arch mudança. Build +X KB gzip. tsc 0.
  ```

---

## 12. Notas para próximos agentes

### Para system-architect
- ADR-208: documente convenção `pulse-subtle` (Tailwind custom keyframes — opacity 95↔100% 2s ease-in-out) vs default `animate-pulse` (50% — agressivo). Cite RF-01 racional (Spotify reference + monitor poker compete).
- Diagramas:
  - `mini-player-states.mermaid` — stateDiagram (idle/playing/paused/expanded/empty/hidden) + transições.
  - `expanded-dialog-anatomy.mermaid` — flowchart top-down (Dialog.Root → Portal → Overlay/Content → Header/Hero/Transcript/Controls/Queue/CoachHint).

### Para test-writer
- **Briefing obrigatório lessons:** #1 (hooks order), #14/#26/#38 (test import patterns), #29 (ErrorBoundary local), #23 (Wouter v3), #22 (tokens shape).
- Mocks reuse: `tests/client/audio-player/__mocks__/audio-player-context.ts` MP-VALIDATION pattern.
- **Não testar** AudioPlayerContext internals (não muda). **Não testar** drivers. Foco: visual + interaction.
- `formatMmSs` helper merece test unit dedicado (`tests/lib/audio-engine/formatTime.test.ts`).

### Para implementer
- **NÃO MODIFIQUE TESTS.** Se teste tem expectation inconsistente lógica (lesson #25), documente + siga.
- Cover responsive: Tailwind compila TODAS as variantes (`h-12`, `md:h-14`, `lg:h-16`) — sem JS dinâmico.
- Empty state inline vs separado: feel-it call. ≤80 LoC inline; ≥120 LoC arquivo `EmptyStateCTA.tsx` separado.
- `ExpandedPlayerDialog` lazy-load via `React.lazy` se build size cap excede.
- Telemetria reuse `emitAudioEvent` lib MP-VALIDATION — adicionar namespace `mini_player.*` (não criar lib nova).
- `useMiniPlayerHeight` aware de `activeTrack`: modifica retorno baseado em `useAudioPlayer().activeTrack` — test pode mockar.

### Para reviewer
- **Foco prioritário:**
  - RF-05 ExpandedPlayerDialog: Radix Dialog hygiene (focus trap, Esc, overlay click) + transcript preview safe HTML (já MP3.2 — não regredir XSS).
  - RF-06 hooks order preservada (lesson #1).
  - RF-01 reduced-motion respeitado em TODOS RFs.
  - Build size ≤10KB gzip.
  - tsc 0.
  - Coach hint link Wouter v3 (lesson #23).
- **Não-foco:**
  - AudioPlayerContext internals (não muda).
  - Drivers (não mudam).
  - Lógica spotify auth (reuso).

---

**Fim spec.**

Próximo passo recomendado:

→ Use o agente `system-architect` para criar ADR-208 + 2 diagramas Mermaid em `Docs/architecture/diagrams/sprint-mp-modern/`, baseando-se em `Docs/specs/sprint-mp-modern.md`.
