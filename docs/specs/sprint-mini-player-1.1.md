# Sprint Mini Player 1.1 — Consolidacao Pos-Reviewer R1

## Status

**Proposta** — aguardando aprovacao founder. Sprint dedicada de divida tecnica consolidando os 10 follow-ups deixados pela R1 do reviewer na Sprint Mini Player 1 (ja shipped commit `d9235cb5`).

## Origem

- Sprint base: `Docs/specs/sprint-mini-player-1.md` (14 RFs shipped)
- Memory: `memory/session_2026-05-22-mini-player-1-shipped.md`
- ADRs vivos: 187 (`AudioSourceEngine` abstraction) + 188 (`MiniPlayerBar` persistente)
- Reviewer R1: deixou HIGH-4-FINAL + 3 MEDIUM (1/3/5/6/7) + 3 LOW (1/3/4) + 1 NIT (3) = 10 follow-ups
- Founder ja ordenou por ICE (manter ordem); RF-01 e o unico bloqueador de UX em prod

## 1. Sumario Executivo

**Objetivo.** Pagar divida tecnica da Sprint MP1 num unico ciclo TDD — sem feature nova. Foco: fechar bloqueador funcional (`RF-01` "Continuar de onde parou" vazio em prod), endurecer seguranca (`sanitize coverUrl`, `auth guard`), padronizar primitives (Radix Dialog, Tailwind z-index, util destroy), e perf condicional (split de context APENAS se profiler confirmar).

**Tese.** MP1 fechou loop funcional mas deixou superficies fragilizadas. R1 mapeou 10 items concretos com acceptance estreita. Consolidar tudo numa 1.1 evita drift de codigo (cada follow-up shippado solto custa overhead de testes + ADR check). 1.1 e a ultima sprint do bloco MP1; MP2 (queue + Spotify real) so depois.

**Constraints duros.**
- Sem migration (so frontend + storage method ja existente em `getLibraryProgressByLessonIds`).
- Sem feature nova — strict consolidacao.
- Zero regressao na baseline MP1 (146 sprint + 218 c/baseline + 3213 client tests verdes).
- Reusar setup.ts fix da lesson #38 (TS compiler em tests).
- RF-04 (split context) e CONDICIONAL — so implementa se profiler confirmar re-render excessivo.

**10 RFs em 1 linha:**

- **RF-01** — `LessonPickerDialog` aba "Continuar" hidratar via lazy fetch `/api/library/courses/:slug`
- **RF-02** — `sanitizeCoverUrl()` helper aplicado em 4 callsites (track, Media Session artwork, 2 imgs)
- **RF-03** — Auth guard em `LessonPickerDialog` (mensagem + CTA login se logged-out)
- **RF-04** — Split `AudioPlayerContext` -> `AudioStateContext` + `AudioControlsContext` (condicional ao profiler)
- **RF-05** — Migrar `LessonPickerDialog` para Radix `@/components/ui/dialog` (trap focus + Esc + aria-modal)
- **RF-06** — Fix z-45 nao-Tailwind-default em `MiniPlayerExpanded` (recomendar z-50 + backdrop z-40)
- **RF-07** — `LibraryAudioDriver.destroy()` libera `audioEl.src` + cancela pre-fetch
- **RF-08** — `VolumeControl` slider `onMouseLeave` reinicia `hideTimerRef`
- **RF-09** — `continueItems` useMemo destructure `progressQuery` em deps explicitos
- **RF-10** — `MiniPlayerBar` cover dedup (remove inline `animationName: 'spin'`, mantem `animate-spin-slow`)

---

## 2. Contexto Tecnico

### Onde MP1 deixou divida

MP1 shippou em ~12d efetivos. Pipeline TDD completo + 2 rodadas reviewer. R1 deixou 10 items que NAO bloqueavam ship (founder optou consolidar em 1.1 ao inves de estender MP1). Stack atual (post-MP1):

- `AudioPlayerContext` (`client/src/contexts/AudioPlayerContext.tsx`) — provider acima do Router. `<audio>` real renderizado dentro. Surface: `play/pause/toggle/close/seek/setSpeed/skipBack/skipForward/playTrack/playNext/playPrevious/setVolume/toggleMute + state {current, isPlaying, displayMode, volume, isMuted, activeSource, courseContext}`.
- `AudioSourceEngine` (`client/src/lib/audio/AudioSourceEngine.ts`) — `IAudioSourceDriver` interface + `LibraryAudioDriver`. Spotify-ready (driver `'spotify'` reservado).
- `MiniPlayerBar` + `MiniPlayerExpanded` (`client/src/components/audio/`).
- `LessonPickerDialog` (`client/src/components/grind-session-live/LessonPickerDialog.tsx`) — dialog manual (div fixed, z-50).
- `VolumeControl` (`client/src/components/audio/VolumeControl.tsx`) — slider tri-modo.
- Storage: `getLibraryProgressByLessonIds(userId, lessonIds[])` (shipped MP1, mas dialog ainda nao consome).
- Handler `GET /api/library/courses/:slug` injeta progress per lesson (shipped MP1).

### Onde MP1.1 NAO toca

- `LessonViewer.tsx` (Biblioteca-1).
- `PodcastPlayer.tsx` (Biblioteca-1).
- Backend de spec MP1 (so frontend; backend ja entrega o `:slug` payload).
- Spotify real (MP2).
- Queue (MP2).
- Floating icon (MP3).

---

## 3. Requisitos Funcionais

### RF-01 — `LessonPickerDialog` aba "Continuar" hidratar via lazy fetch `/api/library/courses/:slug` [HIGH-4-FINAL]

**ICE:** I=5, C=3, E=3 → 5.0 (top do sprint — unico bloqueador de UX)

**Descricao.**
Hoje a aba "Continuar de onde parou" aparece vazia em prod porque `LessonPickerDialog` nao hidrata progress per-lesson. Storage method `getLibraryProgressByLessonIds` + handler `:slug` ja injetam progress no payload — falta o dialog migrar o fluxo.

**Solucao (founder ja optou pela (a) lazy fetch).**
1. Ao abrir o dialog, popular dropdown de cursos via lista que ja vem em cache (`useQuery(['library', 'courses'])` shipped Biblioteca-1).
2. Quando user seleciona um curso no dropdown, **lazy fetch** `GET /api/library/courses/:slug` (so dispara on-select, nao no mount do dialog).
3. Payload retorna `lessons[]` com `progressPct` por lesson.
4. Grid renderiza lessons + barra de progresso visivel.
5. Aba "Continuar" filtra `lessons.filter(l => l.progressPct > 0 && l.progressPct < 100)` ordenado por `lastWatchedAt desc`.

**Files afetados.**
- `client/src/components/grind-session-live/LessonPickerDialog.tsx` (modificacao principal)
- `client/src/hooks/useLibraryCourses.ts` (ja existe, reuse — talvez adicionar `useLibraryCourseDetail(slug)` se nao houver)
- Verificar que `GET /api/library/courses/:slug` retorna `progressPct` no shape — se nao, ajustar `server/routes/library.ts` handler (mas memory diz ja injeta)

**Acceptance.**
- [ ] Ao abrir dialog, dropdown de cursos popula com lista cacheada (sem fetch novo).
- [ ] Selecionar curso dispara UM fetch `:slug` (verificar via devtools Network).
- [ ] Grid mostra lessons + progress bar visual.
- [ ] Aba "Continuar" lista APENAS lessons com `0 < progressPct < 100`, ordenadas `lastWatchedAt desc`.
- [ ] Aba "Continuar" vazia mostra empty state ("Nenhuma aula em progresso ainda") em vez de grid vazio.
- [ ] Trocar de curso re-fetcha (cache por `slug`).

**Risco.** Se backend `:slug` nao tiver `progressPct` no shape, expandir handler vira HIGH effort. Confirmar antes de test-writer.

---

### RF-02 — `sanitizeCoverUrl()` helper validando URL + protocol [MEDIUM-1]

**ICE:** I=3, C=5, E=4 → 3.75

**Descricao.**
URLs invalidas em `coverUrl` quebram UI (img tag joga 404 visivel, Media Session API loga error). Helper centraliza validacao.

**Solucao.**
```ts
// client/src/lib/audio/sanitizeCoverUrl.ts
export function sanitizeCoverUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
```

**Aplicar em 4 callsites:**
1. `lessonToTrack()` em `AudioPlayerContext.tsx` (set `track.coverUrl = sanitizeCoverUrl(lesson.coverUrl)`)
2. Media Session API metadata artwork (`AudioPlayerContext.tsx` `useEffect` que seta `navigator.mediaSession.metadata`)
3. `<img src={...} />` em `MiniPlayerBar.tsx`
4. `<img src={...} />` em `MiniPlayerExpanded.tsx`

**Placeholder.** Quando retorna null, render placeholder existente (memory: ja ha placeholder no MiniPlayerBar — verificar).

**Files afetados.**
- `client/src/lib/audio/sanitizeCoverUrl.ts` (NOVO)
- `client/src/contexts/AudioPlayerContext.tsx`
- `client/src/components/audio/MiniPlayerBar.tsx`
- `client/src/components/audio/MiniPlayerExpanded.tsx`

**Acceptance.**
- [ ] URLs `javascript:...`, `data:...`, `file:...`, `ftp:...` retornam null.
- [ ] URLs malformadas (sem scheme) retornam null.
- [ ] URLs http/https validas passam intactas.
- [ ] Quando null, UI mostra placeholder (sem `<img>` quebrado).
- [ ] Media Session API metadata.artwork NAO recebe null no array (filter antes).

---

### RF-03 — Auth guard em `LessonPickerDialog` [MEDIUM-3]

**ICE:** I=3, C=5, E=2 → 3.0

**Descricao.**
Hoje dialog renderiza grid vazio em logged-out (silencioso). Confuso pro user.

**Solucao.**
- `useAuth()` (`@/hooks/useAuth` — verificar nome exato no codebase) check no inicio do dialog.
- Se `!user`: render bloco "Faca login pra ver suas aulas" + CTA `<Link href="/login">Entrar</Link>`.
- Skip queries (`enabled: !!user`).

**Files afetados.**
- `client/src/components/grind-session-live/LessonPickerDialog.tsx`

**Acceptance.**
- [ ] Dialog em logged-out mostra mensagem clara + CTA login.
- [ ] Queries `useQuery` skipam (`enabled: !!user`) — verificar devtools Network sem fetch.
- [ ] CTA navega pra `/login`.

---

### RF-04 — Split `AudioPlayerContext` em 2 contexts [MEDIUM-5] — CONDICIONAL

**ICE:** I=2, C=2, E=2 → 1.0 (deprioritized — so se profiler confirmar)

**Descricao.**
Hipotese: `AudioPlayerContext` expoe state + controls juntos. Components que so usam controls re-renderizam em cada `timeupdate` (4x/s = ~14400 renders/h). Split em 2 contexts mitiga.

**Pre-requisito (gate).**
Rodar React Profiler ANTES de implementar. Steps:
1. Tocar audio 60s.
2. Profiler grava (Highlight updates when components render).
3. Verificar quais components re-rendem em timeupdate.
4. Se houver re-render hot path em components estaticos (que so consomem `setVolume`/`setSpeed`) → split.
5. Se NAO houver (React.memo ja blinda) → skip implementation, vira documentation-only no spec final.

**Solucao (se gate passa).**
```ts
// client/src/contexts/AudioStateContext.tsx — current, isPlaying, displayMode, currentTime, duration
// client/src/contexts/AudioControlsContext.tsx — play, pause, setVolume, setSpeed, seek, skip*
```
Mantem `AudioPlayerProvider` como wrapper que renderiza ambos. `useAudioPlayer()` continua existindo (back-compat) mas internamente lê de ambos. Novos consumers usam `useAudioState()` OU `useAudioControls()` granular.

**Files afetados (se gate passa).**
- `client/src/contexts/AudioStateContext.tsx` (NOVO)
- `client/src/contexts/AudioControlsContext.tsx` (NOVO)
- `client/src/contexts/AudioPlayerContext.tsx` (refactor — vira wrapper)
- Migrar `MiniPlayerBar`, `MiniPlayerExpanded`, `VolumeControl`, `LessonPickerDialog` pra usar hook granular.

**Acceptance (se gate passa).**
- [ ] Profiler grava antes + depois. Depois mostra components que so consomem controls NAO re-rendem em timeupdate.
- [ ] `useAudioPlayer()` continua funcionando (back-compat).
- [ ] Sem regressao funcional (todos 9 controles operando).

**Acceptance (se gate falha).**
- [ ] Nota no spec final: "Profiler MP1.1 confirma React.memo blindando — split nao necessario. Re-avaliar em MP2."
- [ ] Spec MP1.1 marca RF-04 como `[SKIPPED — gate failed]` no commit final.

---

### RF-05 — Migrar `LessonPickerDialog` para Radix `@/components/ui/dialog` [MEDIUM-6]

**ICE:** I=3, C=4, E=3 → 2.4

**Descricao.**
Hoje dialog e `<div className="fixed inset-0 z-50">` manual. Falta trap focus, Esc nativo, aria-modal. Tambem conflita z-50 com MiniChat (ambos z-50).

**Solucao.**
- Substituir por `<Dialog open onOpenChange>` + `<DialogContent>` + `<DialogHeader>` + `<DialogTitle>` do shadcn (`client/src/components/ui/dialog.tsx`).
- Beneficios automaticos: trap focus, Esc handler, aria-modal, role="dialog", backdrop click close.
- Tema visual mantido (classes Tailwind do conteudo nao mudam, so o shell).

**Files afetados.**
- `client/src/components/grind-session-live/LessonPickerDialog.tsx`

**Acceptance.**
- [ ] Dialog usa `Dialog`/`DialogContent` Radix (verificar import).
- [ ] Esc fecha dialog (testado via `userEvent.keyboard('{Escape}')`).
- [ ] Tab navega so dentro do dialog (focus trap).
- [ ] `aria-modal="true"` presente no DOM.
- [ ] Z-index Radix usa stacking interno (Portal) — sem conflito visual com MiniChat (testar abrir ambos).
- [ ] Visual identico ao anterior (screenshot diff aceitavel <5% pixel).

---

### RF-06 — Fix `z-45` nao-Tailwind-default em `MiniPlayerExpanded` [MEDIUM-7]

**ICE:** I=2, C=5, E=1 → 5.0 (one-liner)

**Descricao.**
`MiniPlayerExpanded.tsx:30` usa `className="... z-45 ..."`. Tailwind JIT **interpreta** isso como arbitrary value e gera `z-index: 45` em runtime, mas a sintaxe nao e Tailwind-default (Tailwind expoe `z-0/10/20/30/40/50` + arbitrary `z-[N]`). Reviewer leu como bug latente; na pratica funciona, mas a sintaxe e ambigua (grep falha em encontrar via `z-\[`).

**Solucao final (architect — Q-C revised — substitui opcao (a) do spec original).**
- Trocar `z-45` → `z-[45]` (Tailwind arbitrary value explicito).
- **NAO mexer** em backdrop (continua `z-40`) ou em `MiniPlayerBar` (continua `z-40`).
- **NAO subir** expanded para `z-50` (quebraria invariante ADR-188 "MiniChat acima de MiniPlayerExpanded").
- **NAO adicionar** `zIndex.45` em `tailwind.config.ts` (rejeitada por adicionar custom config sem necessidade).

**Hierarquia z-index canonica final** — extrair pra `Docs/conventions/z-index.md` (one-pager — ver Q-D):

| Layer | z-index | Componente |
|---|---|---|
| Sonner / Toast | `z-[9999]` | Sonner default |
| WarmUpRunner | `z-[60]` | `WarmUpRunner.tsx` |
| Radix Dialog (override) | `z-[100]` | `AccessRequestDialog`, `BreakHistoryPopup` |
| MiniChat (FAB + painel) | `z-50` | `MiniChat.tsx` |
| Modais legacy (Bankroll, Flight, ~30 dialogs) | `z-50` | DOM-order decide |
| Radix Dialog overlay (shadcn default) | `z-50` | `ui/dialog.tsx`, `ui/alert-dialog.tsx` |
| **MiniPlayerExpanded** | `z-[45]` | **APOS RF-06** (era `z-45`) |
| MiniPlayerExpanded backdrop | `z-40` | inalterado |
| MiniPlayerBar | `z-40` | inalterado |
| StudiesBottomNav | `z-40` | inalterado |
| Conteudo de paginas | auto / 0 | — |

**Trade-off aceito.** MiniChat + MiniPlayerExpanded podem se sobrepor visualmente (MiniChat bottom-right, expanded centro-bottom). User minimiza um antes do outro. UX-friendly.

**Files afetados.**
- `client/src/components/audio-player/MiniPlayerExpanded.tsx` (1 linha: `z-45` → `z-[45]`)
- `Docs/conventions/z-index.md` (NOVO — one-pager canonico)

**Acceptance.**
- [ ] Grep `\bz-45\b` em `client/src` retorna 0 matches (so `z-[45]` permanece).
- [ ] `MiniPlayerExpanded` fica sobre `MiniPlayerBar` visualmente (testado em verify manual).
- [ ] Abrir `MiniPlayerExpanded` + `MiniChat` simultaneo: MiniChat fica acima (z-50 > z-[45], sem depender de DOM order).
- [ ] `tailwind.config.ts` inalterado (sem custom `zIndex.45`).
- [ ] `Docs/conventions/z-index.md` criado e referenciado de ADR-188 + spec MP1.1.

---

### RF-07 — `LibraryAudioDriver.destroy()` libera recurso [LOW-1]

**ICE:** I=2, C=4, E=2 → 2.0

**Descricao.**
Hoje `destroy()` pausa mas nao libera `audioEl.src`. Memory leak em navegacao prolongada + pre-fetch HTTP pendente fica.

**Solucao.**
```ts
// client/src/lib/audio/drivers/LibraryAudioDriver.ts
destroy() {
  if (this.audioEl) {
    this.audioEl.pause();
    this.audioEl.removeAttribute('src'); // libera buffer
    this.audioEl.load(); // forca reset, cancela pending requests
    this.audioEl = null;
  }
}
```

**Files afetados.**
- `client/src/lib/audio/drivers/LibraryAudioDriver.ts` (path exato depende do MP1 layout)
- Testes: mock `audioEl` + assert `removeAttribute('src')` + `load()` chamados em destroy.

**Acceptance.**
- [ ] Apos `destroy()`, devtools Network mostra sem requests pendentes do audio file.
- [ ] `audioEl.src` vazio (verificar via `audioEl.getAttribute('src') === null`).
- [ ] Sem regressao no autoplay sequencial (RF-05 do MP1).

---

### RF-08 — `VolumeControl` slider `onMouseLeave` reinicia `hideTimerRef` [LOW-3]

**ICE:** I=2, C=5, E=1 → 5.0 (one-liner)

**Descricao.**
Hoje, se user passa mouse pelo botao (abre slider) + entra no slider + sai para qualquer area que NAO seja o botao → slider fica preso aberto (nenhum onMouseLeave dispara hide).

**Solucao.**
- Adicionar `onMouseLeave` no slider container que reseta `hideTimerRef.current` via setTimeout (mesma logica do botao).

**Files afetados.**
- `client/src/components/audio/VolumeControl.tsx`

**Acceptance.**
- [ ] Hover no botao → slider abre.
- [ ] Mouse entra no slider → slider continua aberto (hover protect).
- [ ] Mouse sai do slider pra qualquer lugar → slider fecha apos 200ms (timeout existente).
- [ ] Sem regressao no click=mute (mousedown nao confunde).

---

### RF-09 — `continueItems` useMemo destructure `progressQuery` [LOW-4]

**ICE:** I=1, C=4, E=1 → 4.0

**Descricao.**
Hoje `useMemo` deps array pode ser `[progressQuery]` (refs do query object mudam por motivo nao-relacionado a data, causando recompute desnecessario).

**Solucao.**
```tsx
const { data: progressData, error: progressError } = progressQuery ?? {};
const continueItems = useMemo(() => {
  if (!progressData || progressError) return [];
  return progressData
    .filter(l => l.progressPct > 0 && l.progressPct < 100)
    .sort((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt));
}, [progressData, progressError]);
```

**Files afetados.**
- `client/src/components/grind-session-live/LessonPickerDialog.tsx`

**Acceptance.**
- [ ] Deps array contem `progressData` + `progressError` explicitos.
- [ ] Memo nao re-computa em re-renders sem mudanca de dados (testar via console.log no memo factory).

---

### RF-10 — `MiniPlayerBar` cover dedup [NIT-3]

**ICE:** I=1, C=5, E=1 → 5.0 (one-liner)

**Descricao.**
Hoje cover tem `style={{ animationName: 'spin' }}` inline + `className="animate-spin-slow"`. Duplicado.

**Solucao.**
- Remove `style={{ animationName: 'spin' }}` inline.
- Mantem `className="animate-spin-slow"`.
- Verificar `tailwind.config.ts` tem keyframes `spin-slow` (ou adicionar):
```ts
// tailwind.config.ts theme.extend
keyframes: {
  'spin-slow': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
},
animation: {
  'spin-slow': 'spin-slow 8s linear infinite',
},
```

**Files afetados.**
- `client/src/components/audio/MiniPlayerBar.tsx`
- `tailwind.config.ts` (so se keyframes nao existe ainda)

**Acceptance.**
- [ ] Sem `style={{ animationName: ... }}` inline no MiniPlayerBar.
- [ ] Cover gira via classe Tailwind so.
- [ ] Animacao funcional (1 volta / 8s).

---

## 4. Requisitos Nao-Funcionais

- **RNF-01.** Zero regressao na baseline MP1 (146 sprint + 218 c/baseline + 3213 client). CI verde antes de merge.
- **RNF-02.** TSC exit 0.
- **RNF-03.** Reuso da lesson #38 (TS compiler em setup.ts) — sem novas hacks de setup.
- **RNF-04.** Sem migration. Backend so consumido por leitura (`/api/library/courses/:slug`).
- **RNF-05.** A11y: RF-05 Radix Dialog herda aria-modal, role, focus trap; RF-03 CTA login com text label.
- **RNF-06.** Perf: RF-04 condicional ao profiler. RF-07 libera memoria. RF-02 sanitize O(1).
- **RNF-07.** Mantem layout visual MP1 (sem mudanca de design tokens — RF-05 visual diff <5%).

---

## 5. Open Questions

### Q-A — RF-04 profiler decision: founder roda ou implementer roda?
- Founder ja avisou "rodar profiler antes pra confirmar".
- Decisao: implementer roda no green phase (renderiza `/grind-live` + tocar audio + profiler highlight + screenshot decision).
- Output: log no PR `RF-04 profiler: [PASS/SKIP] — [evidencia]`.
- Confirma com founder?

### Q-B — RF-01 backend shape verification: `/api/library/courses/:slug` ja retorna `progressPct` no payload de cada lesson?

**RESPOSTA (architect — 2026-05-22):** Backend **JA injeta progress por lesson**, mas o shape **NAO e `progressPct` direto**. E **`Record<format, ProgressRow>`** com `lastPositionSeconds` + `totalDurationSeconds`. Conversao para `progressPct` e responsabilidade do **frontend** (LessonPickerDialog), nao do handler. Zero mudanca em `server/routes/library.ts` necessaria.

**Shape exato do payload `GET /api/library/courses/:slug`** (verificado em `server/routes/library.ts:81-163`):

```typescript
{
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  coverUrl: string | null;
  isPublished: boolean;
  modules: Array<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    coverUrl: string | null;
    lessons: Array<{
      id: string;
      slug: string;                          // <-- presente: usar em /biblioteca/curso/:courseSlug/:lessonSlug
      title: string;
      subtitle: string | null;
      coverUrl: string | null;
      durationMinutes: number | null;
      formats: Array<'video' | 'podcast' | 'article'>;
      hasAccess: boolean;
      displayOrder: number;
      progress: Record<'video' | 'podcast' | 'article', {
        lastPositionSeconds: number;
        totalDurationSeconds: number | null;
        completedAt: string | null;
        updatedAt: string | null;
      }> | null;                              // null se nunca tocou nenhum format
    }>;
  }>;
}
```

**Pontos importantes:**

1. **Estrutura modular** — `modules[].lessons[]`, NAO `lessons[]` flat. RF-01 precisa flatten em runtime no dialog (`modules.flatMap(m => m.lessons)`).
2. **`slug` presente em lesson** — ja basta pra montar Wouter route `/biblioteca/curso/${course.slug}/${lesson.slug}/play` (verified). Nao precisa fetch extra pra resolver slug→id.
3. **`progress` e por-format**, nao agregado. Para a aba "Continuar", **escolher o format com maior `lastPositionSeconds`** (provavel formato em uso) e derivar:

```typescript
function lessonToProgressPct(lesson: LessonPayload): { pct: number; lastWatchedAt: string | null } {
  if (!lesson.progress) return { pct: 0, lastWatchedAt: null };
  // Pega format com maior lastPositionSeconds (heuristica: o que user mais consumiu)
  let bestPct = 0;
  let lastWatchedAt: string | null = null;
  for (const [, row] of Object.entries(lesson.progress)) {
    if (!row.totalDurationSeconds || row.totalDurationSeconds <= 0) continue;
    const pct = (row.lastPositionSeconds / row.totalDurationSeconds) * 100;
    if (pct > bestPct) bestPct = pct;
    if (row.updatedAt && (!lastWatchedAt || row.updatedAt > lastWatchedAt)) {
      lastWatchedAt = row.updatedAt;
    }
  }
  return { pct: Math.min(100, Math.max(0, bestPct)), lastWatchedAt };
}
```

4. **`completedAt`** presente — alternativa explicita pra detectar 100% sem depender de pct.
5. **Lista de cursos** — endpoint separado `GET /api/library/courses` (handler `handleListLibraryCourses` linhas 40-75). Retorna **flat array** com `{id, slug, title, subtitle, coverUrl, lessonCount, hasAnyAccess, accessibleLessonsCount, displayOrder}`. NAO inclui `modules` — dialog usa essa lista pra popular dropdown e dispara `:slug` on-select.

**Acceptance RF-01 atualizada (concrete):**

- [ ] Filtro "Continuar": `lesson.progress != null && bestPct > 0 && bestPct < 100 && lesson.progress[*].completedAt === null`.
- [ ] Ordenacao: `lastWatchedAt desc` (maior `updatedAt` entre formats).
- [ ] Empty state quando nenhum lesson matchar filtro.

**Effort RF-01 sem mudanca de backend:** mantem **E=3** (so frontend). Risco R-01 zerado.

### Q-C — RF-06 stacking ordem: founder confirma opcao (a) — z-50 + backdrop z-40?

**RESPOSTA (architect — 2026-05-22):** ADR-188 **ja documenta a hierarquia z-index canonica** com gap reservado (z-40 bar → z-45 expanded → z-50 MiniChat → z-[100] Dialog → z-[9999] Sonner). **Manter z-45 do MiniPlayerExpanded** (Tailwind JIT aceita arbitrary `z-45` como `z-[45]` — verificado no codigo em `MiniPlayerExpanded.tsx:30`).

**Recomendacao architect: REJEITAR opcao (a) do spec original.** Subir expanded para z-50 quebra a invariante ADR-188 ("MiniChat acima do MiniPlayerExpanded"). Forcar mesma camada (z-50 ambos, DOM-order decide) e fragil — ordem DOM depende de qual provider monta primeiro, suscetivel a Strict Mode + portals.

**Decisao final RF-06 (revised):** trocar `z-45` literal → `z-[45]` explicito Tailwind JIT (one-liner, zero impacto visual, satisfaz reviewer concern sobre "nao-Tailwind-default"). Backdrop continua `z-40` (atual `MiniPlayerExpanded.tsx:22`). NAO mexer em MiniChat. NAO criar `45: '45'` em tailwind.config.

**Hierarquia z-index canonica (confirmada via grep 2026-05-22):**

| Layer | z-index | Componente | Verificacao |
|---|---|---|---|
| Sonner / Toast | `z-[9999]` | Sonner default | — |
| Radix Dialog overlay | `z-[100]` (override) ou `z-50` (shadcn default) | `ui/dialog.tsx`, `AccessRequestDialog`, `BreakHistoryPopup` | shadcn padrao = `z-50`, alguns override com `z-[100]` |
| WarmUpRunner overlay | `z-[60]` | `WarmUpRunner.tsx:187`, `OverrideConfirmDialog.tsx:28` | Acima de tudo durante warmup |
| MiniChat (FAB + painel) | `z-50` | `MiniChat.tsx:172,196` | Acima de MiniPlayerExpanded |
| Modais legacy (Bankroll, Flight, etc) | `z-50` | ~30 dialogs custom | Mesma camada, DOM-order decide |
| **MiniPlayerExpanded** | `z-[45]` | `MiniPlayerExpanded.tsx:30` (apos RF-06) | Acima da bar, abaixo de MiniChat |
| MiniPlayerExpanded backdrop | `z-40` | `MiniPlayerExpanded.tsx:22` | Cobre bar mas nao MiniChat |
| MiniPlayerBar | `z-40` | `MiniPlayerBar.tsx:172` | Acima de conteudo de pagina |
| StudiesBottomNav | `z-40` | `StudiesBottomNav.tsx:19` | Mesma camada de bar |
| Conteudo de paginas | auto / 0 | — | — |

**Trade-off documentado:** com `MiniPlayerExpanded` em `z-[45]`, abrir MiniChat enquanto expanded sobrepoe parcialmente o painel (MiniChat ocupa bottom-right, expanded centro-bottom). Aceitavel — user pode minimizar expanded primeiro. Alternativa "MiniChat fecha automaticamente quando expanded abre" e UX hostil (rejeitada).

### Q-D — Hierarquia z-index vira documento canonico (`Docs/conventions/z-index.md`)?

**RESPOSTA (architect):** **SIM, criar `Docs/conventions/z-index.md`** como one-pager extraindo a tabela da Q-C + ADR-188 + ressalvas. Razao: tabela ja aparece em 2 lugares (ADR-188 + esta spec) e tende a divergir. One-pager canonico + referencias cruzadas evita drift (lesson #10 — DRY de prompts/decisoes).

### Q-D — RF-05 visual diff aceitavel quanto?
- Spec sugere <5% pixel diff.
- Radix Dialog tem padding/border default diferentes do div manual atual.
- Se diff >5%: ajustar classes pra restaurar tema MP1.
- Founder define threshold?

### Q-E — RF-02 placeholder de cover: usar placeholder MP1 existente ou criar novo?
- Memory diz MiniPlayerBar tem placeholder (sem detalhe).
- Assumir reuse do placeholder existente.
- Se nao existe: adicionar SVG `MusicIcon` from `lucide-react` cinza claro.

### Q-F — RF-03 auth guard: usar `useAuth` ou checar via `useUserProfile`?
- Codebase tem `useAuth` (grep confirmar).
- Padrao MP1 / Biblioteca-1 ja usa `useAuth` em outros lugares.
- Implementer alinha com padrao existente em `LessonViewer.tsx`.

---

## 6. Riscos

1. **R-01 — RF-01 backend nao retorna `progressPct`.** Mitigar: architect verifica `server/routes/library.ts` ANTES de test-writer. Se nao retorna, escalar effort + adicionar handler change.
2. **R-02 — RF-04 profiler resultado ambiguo.** Mitigar: implementer roda 2 vezes (cold + warm cache). Se 50/50, default SKIP (nao implementa split — vira doc-only).
3. **R-03 — RF-05 Radix Dialog quebra layout em mobile.** Mitigar: testar 3 breakpoints (mobile/tablet/desktop) no green phase. Visual diff <5% como gate.
4. **R-04 — RF-06 mudanca z-index causa regressao no MiniChat.** Mitigar: test e2e (manual ok) — abrir MiniPlayerExpanded + MiniChat simultaneo, verificar stacking.
5. **R-05 — RF-07 `audioEl.load()` interrompe playback ativo.** Mitigar: destroy so chamado em unmount/teardown, nunca durante play. Test garante isso.

---

## 7. Out-of-Scope

- **Spotify integration real.** RF-06 do MP1 ja preparou abstraction; integration real e MP2.
- **Queue de reproducao.** MP2.
- **Floating icon mode.** MP3.
- **Refactor `LessonViewer.tsx` / `PodcastPlayer.tsx`.** Continuam como estao.
- **Backend changes.** Q-B confirmou shape ja completo — zero mudanca em `server/routes/library.ts`. Frontend deriva `progressPct` de `lastPositionSeconds / totalDurationSeconds` por format.
- **Novas features.** MP1.1 e strict consolidacao.
- **Mudancas em design tokens.** Visual mantido. RF-06 stacking apenas formaliza `z-45` → `z-[45]` (zero impacto visual).

### Out-of-Scope ADR

**Nenhum ADR novo necessario.** MP1.1 e consolidacao, nao decisao arquitetural nova. Updates aos ADRs vivos:

- **ADR-187 (`AudioSourceEngine` abstraction):** adendo opcional em "Consequencias" mencionando que `LibraryAudioDriver.destroy()` (RF-07) agora libera `audioEl.src` + `audioEl.load()` para evitar buffer leak + pending requests. Nao muda decisao — so reforca a invariante de cleanup. **Opcional** (architect pode pular se conteudo cabe em comentario JSDoc no driver).
- **ADR-188 (`MiniPlayerBar` displayMode FSM + z-index):** adendo em "Z-index hierarchy canonica" trocando `z-45` → `z-[45]` na linha da tabela + referencia cruzada a `Docs/conventions/z-index.md`. **Recomendado** (atualiza fonte de verdade).
- **RF-04 (split context):** se gate profiler passar → adendo em ADR-188 sobre split `AudioStateContext` + `AudioControlsContext`. Se gate falhar → nota "Profiler MP1.1 confirma React.memo suficiente; split adiado para MP2". Sem ADR novo (continua decisao operacional).
- **RF-05 (Radix Dialog migration):** sem ADR. Padrao `@/components/ui/dialog` ja e canon shadcn no projeto (~10 dialogs migrados). Migracao do `LessonPickerDialog` segue convencao existente.

### Novo artefato canonico (nao-ADR)

- **`Docs/conventions/z-index.md`** — one-pager extraindo a tabela z-index da ADR-188 + RF-06 (Q-C/Q-D). Justificativa: tabela aparece em 2 lugares (ADR-188 + esta spec) e tende a divergir. One-pager canonico + referencias cruzadas evita drift.

### Diagramas existentes — status

- `Docs/architecture/diagrams/mini-player-1/autoplay-sequence.mermaid` — **sem update**. Sequencia de autoplay inalterada.
- `Docs/architecture/diagrams/mini-player-1/displayMode-state-machine.mermaid` — **sem update**. FSM inalterada (3 states + transitions).
- Nao criar diagrama novo para MP1.1 (so consolidacao, sem fluxo novo).

---

## 8. Files Afetados (resumo)

```
client/src/
  contexts/
    AudioPlayerContext.tsx              [RF-02, RF-04 cond]
    AudioStateContext.tsx               [RF-04 cond — NOVO]
    AudioControlsContext.tsx            [RF-04 cond — NOVO]
  components/
    audio-player/                        (path real verificado 2026-05-22)
      MiniPlayerBar.tsx                 [RF-02, RF-10]
      MiniPlayerExpanded.tsx            [RF-02, RF-06]
      VolumeControl.tsx                 [RF-08]
      LessonPickerDialog.tsx            [RF-01, RF-03, RF-05, RF-09]
                                        (NOTA: path real e components/audio-player/, NAO grind-session-live/)
  lib/audio-engine/                      (path real verificado 2026-05-22 — ADR-187)
    sanitizeCoverUrl.ts                 [RF-02 — NOVO]
    LibraryAudioDriver.ts               [RF-07]
                                        (NOTA: path real e lib/audio-engine/, NAO lib/audio/drivers/)
  hooks/
    useLibraryCourses.ts                [RF-01 — verificar shape, possivel extend]

tailwind.config.ts                       [RF-10 — so se keyframes faltar]

Docs/
  conventions/
    z-index.md                           [RF-06 / Q-D — NOVO one-pager canonico]

tests/                                   [todos os RFs — red phase]
```

---

## 9. Cenarios de Teste (high-level — test-writer detalha)

### Happy Path
- [ ] RF-01: abrir dialog → selecionar curso → grid hidrata com progress → aba "Continuar" filtra corretamente.
- [ ] RF-02: track com coverUrl valida → renderiza img. Track com null → renderiza placeholder.
- [ ] RF-03: logged-out → mensagem + CTA. Logged-in → fluxo normal.
- [ ] RF-05: Esc fecha dialog. Tab cicla so dentro.
- [ ] RF-06: stacking visual correto.
- [ ] RF-07: destroy libera src.
- [ ] RF-08: slider fecha apos sair do hover area.

### Edge Cases
- [ ] RF-01: curso sem lessons → empty state grid.
- [ ] RF-01: backend retorna 500 → toast erro + grid vazio (sem crash).
- [ ] RF-02: URLs malformadas (sem scheme, javascript:, data:, file:, ftp:) → null.
- [ ] RF-02: Media Session metadata.artwork com null filtrado.
- [ ] RF-03: logout durante dialog aberto → re-render mostra CTA login.
- [ ] RF-05: focus trap nao escapa pra MiniPlayerBar quando dialog aberto.
- [ ] RF-07: destroy chamado 2x → idempotente (nao crasha).
- [ ] RF-08: hover rapido (entrar+sair em <50ms) → fecha sem race.
- [ ] RF-09: progressQuery undefined → continueItems = [].

### Regressao MP1
- [ ] Autoplay sequencial funciona (RF-05 do MP1).
- [ ] Media Session API ativa (D17 MP1).
- [ ] Fullscreen handler (D22 MP1).
- [ ] 9 controles operando.
- [ ] Keyboard shortcuts Space/←/→/M/Esc.
- [ ] StickyAudioBar deletado nao volta.

---

## 10. Pipeline TDD

```
pm-spec (este doc)
  ↓
system-architect [CONCLUIDO 2026-05-22]
  → verificou Q-B: shape ja completo (progress por format), zero backend change
  → verificou Q-C: hierarquia z-index mantida via z-45 → z-[45] (sem subir pra z-50)
  → ADRs 187/188 mantidos; adendo opcional ADR-188 (tabela z-index atualizada)
  → criou Docs/conventions/z-index.md (one-pager canonico)
  → ZERO ADR novo
  → SE RF-04 gate passa: adendo em ADR-188 (sem ADR dedicado)
  ↓
test-writer (red phase)
  → 10 RFs com testes pre-acceptance
  → reuse lesson #38 setup.ts
  → tests rodam vermelhos (impl ausente)
  ↓
implementer (green phase)
  → ordem ICE: RF-06 (one-liner) → RF-08 → RF-10 → RF-09 → RF-07 → RF-02 → RF-03 → RF-05 → RF-01 → RF-04 (cond)
  → RF-04: rodar profiler ANTES; PASS ou SKIP
  → tests verdes
  ↓
/simplify
  → DRY pos-impl (helper sanitizeCoverUrl ja DRY-friendly)
  ↓
reviewer
  → 1-2 rodadas esperadas
  → R2 target: APPROVED ou APPROVED-WITH-NITS
  ↓
commit + push origin/main
```

---

## 11. Definition of Done

- [ ] 10 RFs implementados (RF-04 PASS ou documentado como SKIP).
- [ ] 100% acceptance criteria checados.
- [ ] Baseline MP1 tests verdes (146 + 218 + 3213).
- [ ] Novos tests MP1.1 verdes.
- [ ] TSC exit 0.
- [ ] Build exit 0.
- [ ] Reviewer APPROVED (com ou sem NITs).
- [ ] Commit em main + push.
- [ ] Memory file `session_2026-05-22-mini-player-1.1-shipped.md` criado.
- [ ] ADRs 187/188 atualizados (status: shipped → stable; ou nota de extensao).
- [ ] Status Tracker atualizado (Mini Player 1.1 — SHIPPED).
