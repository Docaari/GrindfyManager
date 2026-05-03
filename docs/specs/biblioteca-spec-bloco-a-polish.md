# Spec — Biblioteca Bloco-A-Polish (Prologo Netflix + UX)

> Sprint: Bloco-A-Polish (Fase 1 — PM-Spec)
> Data: 2026-05-03
> Pre-requisito: Sprint Biblioteca-2 entregue (storage real + viewer MVP). Tests 507/507 verde. Migration 0034 aplicada. Reviewer APPROVED com P0 corrigidos (cap 100MB, cluster drift documentado).
> Inputs estrategicos: `Docs/strategy/biblioteca-bloco-a-launch.md` §6 (Prologo Netflix concept) + `Docs/specs/biblioteca-spec-2.md` (RFs entregues) + ADRs 092-095 (Spec 2)
> Output: este documento — fonte de verdade operacional para `system-architect`, `test-writer`, `implementer`, `reviewer`
> Status: Proposta (aguardando aprovacao do dev)
> Idioma: PT-BR (codigo em ingles, conteudo/UI em PT-BR)

---

## 1. Sumario Executivo

**Objetivo.** Transformar a entrada das aulas Bloco A num momento **cinematic premium** (Netflix-style). Apos esta sprint, abrir uma aula nao cai mais direto no player — cai num **hero full-bleed com capa, titulo, subtitle, chips meta, CTAs primarios e content below-the-fold (objetivos, conceitos, ciencia base)**. Apos clique "Iniciar aula", cross-fade transiciona para o LessonViewer existente da Spec 2.

Esta sprint NAO toca em backend salvo:
- Adicionar 2 valores ao enum `library_event_type` (`prologue_viewed`, `prologue_skipped`) via micro-migration.

**Escopo.** 11 RFs entregaveis em ~3-4 dias dev solo via pipeline TDD. Sprint **aditiva** sobre Spec 2 — zero refactor de modulos nao-relacionados. Nenhum endpoint novo. Nenhum storage method novo.

**11 RFs em 1 linha:**

- **RF-01** — Componente novo `LessonHero` com Ken Burns subtle (scale 1.05→1) + entry stagger sequencial (cover/title/subtitle/chips/CTAs em 600-900ms)
- **RF-02** — Roteamento Wouter: `/biblioteca/curso/:slug/:lesson` carrega `LessonHero` (default); `/biblioteca/curso/:slug/:lesson/play` carrega `LessonViewer` (player)
- **RF-03** — localStorage flag `library:lesson:{lessonId}:hero-seen` — 2a visita pula hero direto pra `/play`
- **RF-04** — Botao "Pular intro" aparece apos 3s (fade-in canto superior direito); aria-label + Tab navegavel
- **RF-05** — Cross-fade transicao hero → player (700ms ease-in, sem flash branco)
- **RF-06** — StickyAudioBar comportamento durante hero — preserva audio tocando (nao interrompe); botao "Trocar pra esta aula" no hero CTA quando outro audio ja ativo
- **RF-07** — Badge "Concluida" + toast "Proxima aula: A.X" ao alcancar 90% progresso (sem auto-redirect)
- **RF-08** — Breadcrumb sticky no LessonViewer header — "Biblioteca / {curso} / Aula {N}.{X}" sempre visivel durante scroll
- **RF-09** — `library_events` events `prologue_viewed` + `prologue_skipped` (telemetria) via POST `/api/library/events` ja existente
- **RF-10** — Mobile (`<768px`): hero collapsa, capa max-h-50vh, titulo 36px, botoes empilhados full-width
- **RF-11** — Below-the-fold content (objetivos + conceitos + ciencia base) — lazy-render apos scroll do hero, expoe `learningObjectives` field ja extraido na Spec 2

---

## 2. Contexto e Estado Atual

### 2.1. Como chegamos aqui

Sprint Biblioteca-2 entregou o **viewer fim-a-fim funcional**:

- 19 storage methods Drizzle reais — `/api/library/*` retorna 200 com dados.
- Sanitizer allowlist expandida (ADR-093 admin-trusted bypass) preservando `<section>`, `<button>`, `data-*`.
- Iframe sandbox srcdoc para artigo + protocolo postMessage (resize + scroll-depth) — ADR-092.
- Watermark overlay sobre iframe — ADR-076 preservado.
- Layout grid `lg:grid-cols-2` quando exatamente 2 formatos (Bloco A) + tab Video totalmente escondida.
- `learning_objectives JSONB` extraido automaticamente do HTML — ADR-095.
- Bloco A inteiro (9 aulas) seedado via `scripts/library-upload-bloco-a.ts`.
- 507/507 testes verde.

**Hoje, abrir uma aula:**
1. User clica "Aula A.1" em `CourseDetailPage`.
2. Wouter navega `/biblioteca/curso/antes-das-cartas/a1-mentalidade-fixa-vs-crescimento`.
3. `LessonViewer` mounta direto — tabs + 2 paineis lado a lado.
4. User pula etapas de "investimento previo" (psicologia: completion bias). Engajamento fica raso.

### 2.2. Por que Bloco-A-Polish agora

Founder validou conteudo Bloco A LIVE em alpha. Faltam os **3 momentos premium** que separam um LMS comum de um produto cinematic:

1. **Entrada cinematic** — hero full-bleed cria pausa antes do conteudo, sinaliza importancia.
2. **Continuidade visual** — breadcrumb sticky + mini-capa no header preservam contexto durante leitura/audio.
3. **Bridge entre aulas** — toast "Proxima: A.2" ao 90% completo nudga sem auto-redirect intrusivo.

**Sem RF-01 (LessonHero)**, abrir aula eh transacional, nao memoravel. **Sem RF-02 (rota /play)**, nao ha como pular hero programaticamente em revisita. **Sem RF-09 (telemetria)**, nao ha como medir conversao "abre hero → completa aula".

### 2.3. O que NAO entra nesta spec

- Sharp resize de capas (continua deferido — capas brutas ~2MB com `loading="lazy"` mantido)
- Favoritos / "Adicionar lista" funcional (mockup permanece — botao desabilitado tooltip "Em breve")
- A11y formal NVDA/VoiceOver (sera Sprint A11y futuro)
- Search/transcript indexing dos TXT NotebookLM (Spec futura)
- Auto-grant em compra Stripe (Spec 4 / Subscriptions)
- Auto-skip prologue X segundos (descartado — usuario controla via botao manual + skip apos 3s + localStorage)
- Auto-redirect para proxima aula ao 100% (descartado — toast sem redirect respeita intencao)
- Watermark no hero (descartado — hero eh marketing/aspiracional; player principal mantem ADR-076)

---

## 3. Defaults Ativos D1-D12

Decisoes ja tomadas neste briefing. `system-architect`, `test-writer`, `implementer` assumem sem requestionar.

| ID | Default |
|---|---|
| **D1** | **Sem auto-skip do prologue.** Usuario controla manualmente. Botao "Pular intro" surge apos 3s no canto superior direito. Apos primeira visita completa (mount) salva localStorage flag; revisita pula direto pra `/play`. |
| **D2** | **Prologue aplicado em TODAS as aulas da Biblioteca**, nao so Bloco A. Se lesson nao tem `coverKey` (sem hero cover), fallback gradient solido (cor derivada do hash do `lessonId`) + mesmo layout. Componente reusavel — `LessonHero` aceita prop `fallbackGradient: boolean`. |
| **D3** | **Sem watermark no hero.** Hero eh marketing/aspiracional; o conteudo "premium" (artigo + audio) ainda esta protegido pelo watermark do `LessonViewer` (ADR-076 preservado). User sniff via DevTools no hero veria so capa + titulo (ja publicos via `/api/library/courses/:slug`). |
| **D4** | **Toast "Proxima aula" ao 90% sem auto-redirect.** Threshold = 90% (consistente com `completedAt` em 95% — toast aparece 5% antes pra dar intencao). Toast tem 2 botoes: "Iniciar A.X" (navega) + dismiss. Auto-dismiss 8s. |
| **D5** | **Badge "Concluida" no header da aula proximo ao titulo.** Renderizado em `LessonViewer` quando `progressQuery.data` retorna pelo menos um formato com `completedAt !== null`. Visual: chip verde com checkmark + texto "Concluida". |
| **D6** | **Mobile breakpoint = `<768px`** (md breakpoint Tailwind, NAO lg). Justificativa: hero precisa colapsar mais cedo que o grid 2-col do LessonViewer (`<lg`). Ate 767px = stacked vertical; >=768px = full-bleed horizontal. |
| **D7** | **"Adicionar lista" CTA = disabled tooltip "Em breve".** Visivel no hero pra setar expectativa de feature futura, mas `disabled={true}` + Radix Tooltip "Em breve" no hover. Sem endpoint, sem storage. |
| **D8** | **Below-the-fold lazy-render via IntersectionObserver.** Conteudo (objetivos + conceitos + ciencia base) so monta DOM quando user scrolla. Justificativa: 80% dos users vao clicar "Iniciar aula" sem scrollar; renderizar antecipado desperdica DOM nodes. Threshold 0.1 viewport. |
| **D9** | **localStorage flag canonica:** `library:lesson:{lessonId}:hero-seen` = string `"true"`. Set apos 1s de hero mount (evita marcar como visto se user clica back imediatamente). Read em mount: se `=== "true"` redirect imediato pra `/play` via Wouter `setLocation()`. **Nunca expira** — user nao deve ver hero 2x da mesma aula. |
| **D10** | **Telemetria via enum Postgres expandido.** Migration 0035 adiciona valores `prologue_viewed` + `prologue_skipped` ao enum `library_event_type` (atualmente: view, play, pause, seek, complete, note_create, coach_recommend, access_blocked). NAO eh text livre — o enum eh strict. Migration usa `ALTER TYPE library_event_type ADD VALUE 'prologue_viewed'` + `ADD VALUE 'prologue_skipped'`. Idempotente via `IF NOT EXISTS` (Postgres 12+). |
| **D11** | **Cross-fade hero → player via Framer Motion `AnimatePresence`.** 700ms ease-in. Hero fade-out (opacity 1→0) + scale-in subtle (1→1.05). Player fade-in apos 200ms delay. Sem flash branco — background do parent eh preto (`bg-black`). |
| **D12** | **StickyAudioBar preservado durante hero.** Hero NAO desmonta StickyAudioBar (que vive em layout root, nao em pagina). Se outro audio esta tocando ao abrir hero novo, sticky continua reproducindo. Hero CTA primario "Iniciar aula" tem texto modificado pra "Trocar pra esta aula" quando `audioCtx.currentLessonId !== lesson.id && audioCtx.isPlaying === true`. Texto secundario chip pequeno: "Tocando agora: A.{X} ({titulo curto})" abaixo do CTA. |

---

## 4. Usuarios e Personas

Mesmo conjunto da Spec 2 (sem mudancas):

| Persona | O que faz na Sprint Polish | Trigger principal |
|---|---|---|
| **Founder (admin)** | Valida visualmente em desktop + mobile; passa pelas 9 aulas pelo menos 1x; valida que skip apos 3s + revisita funciona | Click no item "Biblioteca" no sidebar → A.1 → ... |
| **Alpha tester (Pro tier, acesso liberado)** | Vive a experiencia premium; primeiro contato com aula = momento Netflix; revisita = direto ao player | Sidebar → A.1 (1a vez = hero; 2a+ = direto player) |
| **Usuario sem acesso** | Comportamento mantido da Spec 1 — capa cinza + "Em breve". Nao chega no LessonHero (gate em CourseDetailPage). | N/A |

### 4.1. User Stories novas (delta vs Spec 2)

#### US-13 (alpha tester desktop primeira aula)
> Como alpha tester desktop em `>= 768px`, ao clicar "Aula A.1" pela primeira vez, **NAO caio direto no player**. Caio em uma tela cinematic full-bleed com capa A.1, titulo "Mentalidade Fixa vs Mentalidade de Crescimento", subtitle "A crenca invisivel...", chips "13 min · Leitura + audio podcast · Sem pre-requisitos" e botoes "Iniciar aula" + "Adicionar lista" (este desabilitado). Apos 3s aparece "Pular intro" no canto. Cross-fade pro player ao clicar "Iniciar".

#### US-14 (alpha tester revisitando aula)
> Como alpha tester abrindo a aula A.1 pela **segunda vez** (depois de ja ter visto o hero), **pulo o hero automaticamente** e caio direto no LessonViewer. Sem flash, sem delay. localStorage me reconhece.

#### US-15 (alpha tester mobile)
> Como alpha tester mobile (<768px), o hero **colapsa para layout vertical**: capa max 50vh no topo, titulo 36px, subtitle 14px, chips empilhados, botoes full-width stacked. Below-the-fold scrollavel.

#### US-16 (alpha tester com audio tocando)
> Como alpha tester ouvindo audio da A.2 e clicando "Aula A.4" no sidebar, ao chegar no hero da A.4 **o audio da A.2 nao para**. StickyAudioBar continua. CTA primario do hero da A.4 fica "Trocar pra esta aula" (em vez de "Iniciar aula"). Chip pequeno "Tocando agora: A.2 (Dicotomia do Controle)" abaixo do CTA.

#### US-17 (alpha tester completando aula)
> Como alpha tester atingindo 90% de progresso na A.1 (audio ou artigo scroll-depth), **vejo um toast** "Proxima aula: A.2 — Dicotomia do Controle" com botao "Iniciar A.2" + X (dismiss). Auto-dismiss 8s. Header da A.1 ganha badge verde "Concluida" ao 95%.

#### US-18 (alpha tester durante leitura)
> Como alpha tester rolando o artigo da A.5, **breadcrumb fica sticky no topo**: "Biblioteca / Antes das Cartas / Aula A.5". Sempre visivel. Click em "Antes das Cartas" volta pra `/biblioteca/curso/antes-das-cartas`.

#### US-19 (founder telemetria)
> Como founder, quero medir **conversao "hero visto → aula iniciada"** vs "hero pulado". Os eventos `prologue_viewed` (mount completo) + `prologue_skipped` (clique no botao Pular intro) chegam em `library_events` e posso queryar.

---

## 5. Requisitos Funcionais

### RF-01 — Componente `LessonHero` com Ken Burns + Stagger

**O que faz.** Cria componente novo `client/src/components/biblioteca/LessonHero.tsx` que renderiza hero full-bleed cinematic. Recebe dados da lesson + handlers de navegacao.

**Interface do componente:**

```tsx
interface LessonHeroProps {
  lesson: {
    id: string;
    slug: string;
    courseSlug: string;
    title: string;
    subtitle?: string | null;
    coverKey?: string | null;       // null → fallback gradient (D2)
    durationMinutes?: number;
    formats: Array<"video" | "podcast" | "article">;
    learningObjectives?: string[];   // RF-11 below-the-fold
    tags?: string[];                  // RF-11 conceitos-chave
  };
  episodeNumber: number;        // derivado de lesson.displayOrder + 1, ou parser do slug ("a1" → 1)
  blockLabel: string;           // "Bloco A · Antes das Cartas"
  onStart: () => void;          // navega Wouter pra /play (RF-02)
  onSkipIntro?: () => void;     // skip apos 3s (RF-04) — opcional, default = onStart
  isOtherAudioPlaying?: boolean; // D12 — se true, CTA muda para "Trocar pra esta aula"
  otherAudioLabel?: string;     // ex: "A.2 (Dicotomia do Controle)" — exibido em chip
}
```

**Estrutura visual (desktop):**

```
┌──────────────────────────────────────────────────────────────┐
│  [< Voltar ao curso]                          [Pular intro X]│  ← header transparente (skip aparece +3s)
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  FULL-BLEED COVER (assetUrl(coverKey), object-cover)         │
│  Gradient overlay top-to-bottom:                             │
│    rgba(0,0,0,0) 0% → rgba(0,0,0,0.3) 50% → rgba(0,0,0,0.85) 100%  │
│                                                              │
│  Content (bottom-left, max-w-3xl, pl-8 pb-12):               │
│    EPISODIO 1 · BLOCO A · ANTES DAS CARTAS                   │  ← caps, mono, accent-green, 12px tracking-wider
│                                                              │
│    Mentalidade Fixa vs                                       │
│    Mentalidade de Crescimento                                │  ← 72px bold, line-height 1, letter-spacing -2px
│                                                              │
│    A crenca invisivel sobre como habilidade funciona —       │
│    e o que ela faz com voce nos primeiros 500ms apos cada erro.│  ← 18px text-gray-300, max-w-2xl
│                                                              │
│    13 min · Leitura + audio podcast · Sem pre-requisitos     │  ← chips horizontais, 14px
│                                                              │
│    [▶ INICIAR AULA]  [⊕ Adicionar lista (Em breve)]          │  ← primary verde + outline branco disabled
│    Tocando agora: A.2 (Dicotomia do Controle)                │  ← chip pequeno, 12px (so quando D12)
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Animacoes (mount sequence — D11 nao se aplica aqui, eh entrada do hero):**

| Elemento | Propriedade | From → To | Duration | Delay | Easing |
|---|---|---|---|---|---|
| Cover image | `opacity` | 0 → 1 | 600ms | 0ms | ease-out |
| Cover image | `transform: scale()` | 1.05 → 1 | 1200ms | 0ms | ease-out (Ken Burns subtle) |
| Episode label | `opacity + translateY` | 0,10px → 1,0 | 350ms | 100ms | ease-out |
| Title | `opacity + translateY` | 0,20px → 1,0 | 400ms | 200ms | ease-out |
| Subtitle | `opacity + translateY` | 0,15px → 1,0 | 400ms | 350ms | ease-out |
| Chips meta | `opacity + translateY` | 0,10px → 1,0 | 300ms | 500ms (stagger 80ms cada) | ease-out |
| CTA primario | `opacity + scale` | 0,0.95 → 1,1 | 350ms | 750ms | spring stiffness 300 |
| CTA secundario | `opacity` | 0 → 1 | 350ms | 850ms | ease-out |
| "Pular intro" button | `opacity` | 0 → 1 | 250ms | 3000ms | ease-out |

**Implementacao Framer Motion:**
- `motion.div` para cada elemento.
- Cover wrapper: `<motion.img initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2 }}>`.
- Stagger via `staggerChildren` no parent OU delays absolutos como tabela acima (preferencia: delays absolutos, mais previsivel pro test).
- `reduce-motion` respeita `prefers-reduced-motion`: skip animacoes, mount instant.

**Fallback sem cover (D2):**
- Se `coverKey === null || coverKey === undefined` → renderiza `<div>` com `background: linear-gradient(135deg, hsl({hue}, 60%, 25%), hsl({hue+30}, 60%, 15%))` onde `hue = hashLessonId(lesson.id) % 360`.
- Hash function: `Array.from(lessonId).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)`.
- Mesmo layout, mesma animacao Ken Burns (scale 1.05→1 funciona em gradient div tambem).

**Constraints transversais:**
- Hooks-first (lesson #1).
- `data-testid` estaveis: `lesson-hero`, `lesson-hero-cover`, `lesson-hero-title`, `lesson-hero-subtitle`, `lesson-hero-cta-start`, `lesson-hero-cta-add-list`, `lesson-hero-skip-button`, `lesson-hero-other-audio-chip`.
- Sem `dangerouslySetInnerHTML` (nao precisa — texto puro).
- Sem fetch interno — pai (`LessonHeroPage`) ja resolveu lesson via `useQuery`. LessonHero eh presentational.

**Criterios de aceitacao:**
- [ ] Componente recebe `lesson` + `episodeNumber` + `blockLabel` + `onStart` e renderiza hero completo
- [ ] Cover renderiza com `assetUrl(lesson.coverKey)` quando presente; fallback gradient quando null
- [ ] Animacao Ken Burns observavel: scale inicial 1.05, final 1, duration 1200ms (testavel via `getComputedStyle` mock)
- [ ] Stagger sequence: cover → label → title → subtitle → chips → CTAs (testavel via `data-animation-delay` attributes)
- [ ] "Pular intro" button NAO esta no DOM nos primeiros 3s; aparece apos timeout 3000ms
- [ ] Click "Pular intro" dispara `onSkipIntro` (ou `onStart` fallback)
- [ ] `prefers-reduced-motion: reduce` desabilita animacoes (mount instant)
- [ ] CTA "Iniciar aula" tem texto trocado para "Trocar pra esta aula" quando `isOtherAudioPlaying === true`
- [ ] Chip "Tocando agora: {label}" renderiza quando `otherAudioLabel` presente
- [ ] CTA "Adicionar lista" esta `disabled={true}` com `Tooltip` "Em breve" (D7)

**Edge cases:**
- `lesson.subtitle === null` → renderiza apenas titulo + chips, sem espaco vazio
- `lesson.formats === []` (lesson sem nenhum formato — improvavel mas defensivo) → chips meta omitem "Leitura + audio podcast", mostram so "{durationMin} min · Sem pre-requisitos"
- `lesson.durationMinutes === undefined` → chip de duracao omitido
- `lesson.coverKey === ''` (string vazia, defensivo) → tratado como null → fallback gradient
- Title muito longo (>120 chars) → CSS `text-wrap: balance` + max 3 linhas (Tailwind `line-clamp-3`)
- Subtitle muito longo (>300 chars) → `line-clamp-3` + ellipsis

**Dependencias:** Nenhuma (componente novo standalone).

---

### RF-02 — Roteamento Wouter `/play` Sub-Rota

**O que faz.** Adiciona rota nova `/biblioteca/curso/:courseSlug/:lessonSlug/play` em `client/src/App.tsx`. Renomeia comportamento da rota existente `/biblioteca/curso/:courseSlug/:lessonSlug` para carregar `LessonHeroPage` (novo componente wrapper) em vez de `LessonViewer` direto.

**Mudanca em `App.tsx`:**

```tsx
// ANTES (Spec 2):
<Route path="/biblioteca/curso/:courseSlug/:lessonSlug">
  {(params: any) => (
    <ProtectedRoute>
      <LessonViewerPage
        courseSlug={params.courseSlug}
        lessonSlug={params.lessonSlug}
      />
    </ProtectedRoute>
  )}
</Route>

// DEPOIS (Sprint Polish):
<Route path="/biblioteca/curso/:courseSlug/:lessonSlug">
  {(params: any) => (
    <ProtectedRoute>
      <LessonHeroPage
        courseSlug={params.courseSlug}
        lessonSlug={params.lessonSlug}
      />
    </ProtectedRoute>
  )}
</Route>
<Route path="/biblioteca/curso/:courseSlug/:lessonSlug/play">
  {(params: any) => (
    <ProtectedRoute>
      <LessonViewerPage
        courseSlug={params.courseSlug}
        lessonSlug={params.lessonSlug}
      />
    </ProtectedRoute>
  )}
</Route>
```

**Componente novo `LessonHeroPage`:**

```tsx
// client/src/pages/biblioteca/LessonHeroPage.tsx
//
// Wrapper que:
// 1. Fetch lesson data via apiRequest('GET', `/api/library/lessons/by-slug/${courseSlug}/${lessonSlug}`)
// 2. Checa localStorage flag (RF-03) — se hero-seen → setLocation('/play')
// 3. Resolve dados pra LessonHero props (episodeNumber, blockLabel)
// 4. Handle onStart: dispara prologue_viewed event (RF-09) + setLocation('/play')
// 5. Handle onSkipIntro: dispara prologue_skipped event + setLocation('/play')
// 6. Renderiza <LessonHero {...} /> + below-the-fold (RF-11) condicional
```

**Constraints:**
- LessonHeroPage NAO eh lazy-loaded (eh entry point — load critico).
- LessonViewerPage CONTINUA lazy-loaded.
- Wouter ordem importa: rota mais especifica (`/play`) ANTES de rota generica. **Verificar:** Wouter resolve por ordem de declaracao? Sim. Spec atual em App.tsx tem rotas `/biblioteca/curso/:courseSlug` ANTES de `/biblioteca/curso/:courseSlug/:lessonSlug` — funciona porque path 2-segmentos vs 3-segmentos. Adicionar `/play` (4-segmentos) depois das outras 2 funciona.

**Criterios de aceitacao:**
- [ ] Navegar `/biblioteca/curso/antes-das-cartas/a1-mentalidade-fixa-vs-crescimento` carrega `LessonHeroPage` (testavel via `data-testid="lesson-hero-page"`)
- [ ] Navegar `/biblioteca/curso/antes-das-cartas/a1-mentalidade-fixa-vs-crescimento/play` carrega `LessonViewer` (testavel via `data-testid="lesson-viewer"`)
- [ ] Click "Iniciar aula" no hero navega para a rota `/play` correspondente
- [ ] LessonHeroPage importado de forma nao-lazy em App.tsx (sem `lazy()`)
- [ ] LessonViewer permanece lazy-loaded (sem regressao)
- [ ] Direct URL access ao `/play` funciona (deep link) — bypass do hero ate sem flag localStorage

**Edge cases:**
- User digita URL `/biblioteca/curso/X/Y/play` para lesson inexistente → LessonViewer mostra erro 404 typed (comportamento Spec 2 mantido)
- User navega de `/play` pra outro `/play` (via "Proxima aula" toast) → `LessonHeroPage` mount novamente para a nova lesson; checa localStorage; redireciona pra novo `/play` se ja viu

**Dependencias:** RF-01 (LessonHero), RF-03 (localStorage).

---

### RF-03 — localStorage Flag `hero-seen`

**O que faz.** Persiste em localStorage que o usuario ja viu o hero de uma lesson especifica. Em revisita, `LessonHeroPage` redireciona imediato para `/play` sem montar o hero.

**Storage key (canonica — D9):**
```
library:lesson:{lessonId}:hero-seen
```

Valor: string `"true"`.

**Implementacao em `LessonHeroPage`:**

```tsx
const [, setLocation] = useLocation();
const lessonQuery = useQuery({ ... });
const lesson = lessonQuery.data;

// Check on mount + after lesson loads
useEffect(() => {
  if (!lesson) return;
  const flag = readHeroSeenFlag(lesson.id);
  if (flag === "true") {
    // Skip hero entirely — go straight to player
    setLocation(`/biblioteca/curso/${lesson.courseSlug}/${lesson.slug}/play`, { replace: true });
  }
}, [lesson, setLocation]);

// Set flag 1s after hero mount (avoid marking as seen on instant back)
useEffect(() => {
  if (!lesson) return;
  const flag = readHeroSeenFlag(lesson.id);
  if (flag === "true") return; // already set
  const timer = setTimeout(() => {
    writeHeroSeenFlag(lesson.id);
    // Also fire prologue_viewed event (RF-09)
    apiRequest("POST", "/api/library/events", {
      lessonId: lesson.id,
      eventType: "prologue_viewed",
    }, { silentMode: true }).catch(() => {});
  }, 1000);
  return () => clearTimeout(timer);
}, [lesson]);
```

**Helper functions:**

```tsx
// client/src/lib/library-hero-storage.ts
const HERO_SEEN_PREFIX = "library:lesson:";
const HERO_SEEN_SUFFIX = ":hero-seen";

export function readHeroSeenFlag(lessonId: string): string | null {
  try {
    return localStorage.getItem(`${HERO_SEEN_PREFIX}${lessonId}${HERO_SEEN_SUFFIX}`);
  } catch {
    return null; // localStorage indisponivel (private mode, quota)
  }
}

export function writeHeroSeenFlag(lessonId: string): boolean {
  try {
    localStorage.setItem(`${HERO_SEEN_PREFIX}${lessonId}${HERO_SEEN_SUFFIX}`, "true");
    return true;
  } catch {
    return false;
  }
}

export function clearHeroSeenFlag(lessonId: string): void {
  try {
    localStorage.removeItem(`${HERO_SEEN_PREFIX}${lessonId}${HERO_SEEN_SUFFIX}`);
  } catch {
    // ignore
  }
}
```

**Justificativa do delay 1s:**
- Se user clica back imediatamente (intencao "abri por engano"), nao queremos marcar como seen.
- 1000ms eh suficiente para distinguir intencao "abri pra ver" vs "fechar imediato".
- Race condition: user clica "Iniciar aula" antes de 1s — `writeHeroSeenFlag` ainda dispara via `onStart` handler explicit (defensive: chama write tambem em onStart).

**Criterios de aceitacao:**
- [ ] Helper `readHeroSeenFlag(lessonId)` retorna null quando flag nao existe
- [ ] Helper `writeHeroSeenFlag(lessonId)` seta string `"true"` na key correta
- [ ] Mount do `LessonHeroPage` chama `readHeroSeenFlag` apos lesson load
- [ ] Se flag === "true" → `setLocation('/play')` com `replace: true` (back button volta pra CourseDetailPage, nao pro hero)
- [ ] Apos 1s de mount sem flag setada → write flag + fire `prologue_viewed` event
- [ ] `onStart` handler tambem chama `writeHeroSeenFlag` (defensive)
- [ ] Helpers tolerantes a `localStorage` indisponivel (private mode, quota cheia) — try/catch silent
- [ ] Limpar flag (helper `clearHeroSeenFlag`) funciona — usado em testes para reset

**Edge cases:**
- localStorage quota cheia → `writeHeroSeenFlag` retorna false; hero ainda redireciona via state local (in-memory) na sessao atual. Sera mostrado de novo em refresh — aceitavel; quota cheia eh corner case.
- Multiple tabs abertas mesma lesson → ambas seguem o mesmo localStorage; primeira tab a alcancar 1s seta flag; segunda tab no mount apos sync ja redireciona. Race aceito.
- localStorage manipulado externamente (DevTools) → comportamento esperado: user pode resetar flag e ver hero novamente.

**Dependencias:** RF-09 (prologue_viewed event firing).

---

### RF-04 — Botao "Pular intro" Apos 3s

**O que faz.** Em `LessonHero`, apos 3000ms de mount, renderiza botao "Pular intro" no canto superior direito com fade-in. Click dispara `onSkipIntro` handler (que dispara `prologue_skipped` event + navega `/play`).

**Visual:**
- Posicao: `position: absolute; top: 1rem; right: 1rem`.
- Renderizado dentro do header transparent do hero (junto com "< Voltar ao curso").
- Visual: pequeno botao outline `border-white/30 bg-black/40 backdrop-blur` + texto "Pular intro" + icone `<X>` (lucide).
- Fade-in animacao: `opacity 0 → 1` em 250ms, delay 3000ms.

**Estado interno:**
```tsx
const [showSkip, setShowSkip] = useState(false);

useEffect(() => {
  const timer = setTimeout(() => setShowSkip(true), 3000);
  return () => clearTimeout(timer);
}, []);
```

**Click handler:**
- Chama `onSkipIntro?.()` se prop fornecida; senao `onStart()`.
- LessonHeroPage implementa `onSkipIntro = () => { fireEvent('prologue_skipped'); navigate('/play'); }`.

**A11y:**
- `aria-label="Pular introducao e ir direto ao player"`.
- Tab navegavel — quando aparece, recebe `tabIndex={0}`. Antes de aparecer, `tabIndex={-1}` ou `aria-hidden`.
- Keyboard: `Enter` ou `Space` invoca `onSkipIntro`.

**Criterios de aceitacao:**
- [ ] Botao NAO esta no DOM nos primeiros 3000ms (testavel via `queryByTestId('lesson-hero-skip-button')` retorna null antes de avancar timer)
- [ ] Apos 3000ms, botao aparece (testavel via `vi.advanceTimersByTime(3000)` + `getByTestId`)
- [ ] Click no botao chama `onSkipIntro` (mock prop)
- [ ] Quando `onSkipIntro` undefined, click chama `onStart` (fallback)
- [ ] Botao tem `aria-label` correto
- [ ] Botao recebe focus via Tab apos aparecer
- [ ] Keyboard `Enter` invoca handler

**Edge cases:**
- User clica "Iniciar aula" antes dos 3s → botao "Pular intro" nunca aparece (componente desmonta). Sem race.
- User abre hero, fica 30s, depois clica "Pular intro" → comportamento normal.
- Reduced motion — botao ainda usa timeout 3000ms (delay nao eh animacao).

**Dependencias:** RF-09 (prologue_skipped event).

---

### RF-05 — Cross-Fade Hero → Player

**O que faz.** Transicao visual entre `LessonHeroPage` e `LessonViewer` quando user clica "Iniciar aula" / "Pular intro". 700ms ease-in cross-fade. Sem flash branco.

**Implementacao:**

Wouter NAO suporta page transitions nativas. Solucao:
1. `LessonHeroPage` recebe internal state `isExiting: boolean`.
2. Click "Iniciar aula" → setState `isExiting = true` → renderiza `LessonHero` com `motion.div animate={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.7, ease: "easeIn" }}`.
3. Apos animation complete (`onAnimationComplete`) → `setLocation('/play', { replace: true })`.
4. `LessonViewer` mount com `motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.2 }}`.

**Background do parent (App layout):**
- `<main>` ou container root tem `className="bg-black"` ou similar (ja eh dark theme).
- Garantir que durante o gap entre hero unmount e viewer mount o background NAO seja branco.
- **Validacao:** ja eh `bg-gray-950` ou similar no App.tsx? Verificar — se nao, adicionar `bg-black` no `<Suspense>` fallback ou em layout root.

**Componente wrapper para entrada do LessonViewer:**

```tsx
// client/src/components/biblioteca/PlayerEntryAnimation.tsx
// Wraps LessonViewer with motion.div fade-in.

import { motion } from "framer-motion";

export function PlayerEntryAnimation({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
```

E `LessonViewerPage` (criar wrapper se nao existe) renderiza `<PlayerEntryAnimation><LessonViewer ... /></PlayerEntryAnimation>`.

**Reduced motion:**
- `prefers-reduced-motion: reduce` desliga animacoes — duration 0, delay 0, sem scale.

**Criterios de aceitacao:**
- [ ] Click "Iniciar aula" dispara animacao fade-out de `LessonHero` (testavel via `data-state="exiting"` attr ou state mock)
- [ ] Apos 700ms, navegacao para `/play` ocorre
- [ ] `LessonViewer` (na rota `/play`) mounta com fade-in 500ms delay 200ms
- [ ] Sem flash branco durante transicao (testavel via screenshot OU verificar background style do parent)
- [ ] Reduced motion respeita: animacoes pulam, navegacao instant
- [ ] Direct URL para `/play` (sem vir de hero) NAO aplica entry animation OU aplica mas sem efeito visual perceivel (aceitavel)

**Edge cases:**
- User clica multiple times "Iniciar aula" → debounce: state `isExiting` previne segunda invocacao.
- User clica back durante animacao (1.5s window) → animacao para; back navega normalmente.
- Lesson not found ao chegar em `/play` → LessonViewer mostra error typed (comportamento Spec 2).

**Dependencias:** RF-01, RF-02. Framer Motion ja em deps.

---

### RF-06 — StickyAudioBar Preserved Durante Hero (D12)

**O que faz.** Garante que abrir um hero NAO interrompe audio sticky tocando de outra aula. Ajusta CTA do hero quando tem audio "concorrente".

**Comportamento:**

1. `LessonHero` recebe prop `isOtherAudioPlaying: boolean` + `otherAudioLabel: string`.
2. `LessonHeroPage` consulta `useOptionalAudioPlayer()` (context global ja existente):
   ```tsx
   const audioCtx = useOptionalAudioPlayer();
   const isOtherAudioPlaying = !!audioCtx?.isPlaying && audioCtx?.currentLessonId !== lesson?.id;
   const otherAudioLabel = isOtherAudioPlaying
     ? `${audioCtx.currentLessonShortLabel} (${audioCtx.currentLessonTitle})`
     : undefined;
   ```
3. Se `isOtherAudioPlaying === true`:
   - CTA primario texto muda: "INICIAR AULA" → "TROCAR PRA ESTA AULA".
   - Chip pequeno aparece abaixo do CTA: "Tocando agora: {otherAudioLabel}".
4. StickyAudioBar continua visivel no fundo (vive em layout root, nao desmonta).
5. Click em "TROCAR PRA ESTA AULA" → mesmo comportamento que "INICIAR AULA" (navega `/play`). LessonViewer no `/play` carrega novo audio (substitui o anterior automaticamente — comportamento ja existente do `AudioPlayerContext`).

**AudioPlayerContext extensions necessarias:**

Inspecionar `client/src/contexts/AudioPlayerContext.tsx`. Provavel que ja exponha:
- `isPlaying: boolean`
- `currentLessonId: string | null`

Se NAO expoe `currentLessonTitle` ou `currentLessonShortLabel`, adicionar (low risk — campo derivado do que ja vai no context).

**Test scenario manual:**
1. Abrir A.2 → clicar play (audio tocando).
2. Sidebar → click "Biblioteca" → click "A.4".
3. Hero da A.4 monta. StickyAudioBar continua tocando A.2.
4. Hero da A.4 mostra CTA "TROCAR PRA ESTA AULA" + chip "Tocando agora: A.2 (Dicotomia do Controle)".
5. Click "TROCAR" → cross-fade pro player A.4 → AudioPlayerContext substitui audio.

**Criterios de aceitacao:**
- [ ] LessonHero detecta `isOtherAudioPlaying === true` via prop e muda texto do CTA
- [ ] Chip "Tocando agora: {label}" renderiza quando `otherAudioLabel` definido
- [ ] StickyAudioBar permanece visivel no DOM durante mount do hero (testavel via `getByTestId('sticky-audio-bar')` continua presente apos navegacao)
- [ ] Audio continua tocando (sem pause involuntario) durante transicao
- [ ] Click "TROCAR" navega normalmente para `/play`
- [ ] Quando user esta no hero da MESMA lesson que esta tocando audio, CTA volta para "INICIAR AULA" (comportamento normal)

**Edge cases:**
- Audio pausado (`isPlaying === false`) mas com lesson carregada → CTA continua "INICIAR AULA" (so muda em playing real).
- Multiple tabs com mesmo audio → AudioPlayerContext eh per-tab; comportamento normal por tab.
- Lesson sem formato podcast → CTA continua "INICIAR AULA" mesmo se outro audio toca (porque trocar sem audio na lesson destino seria confuso). **Confirmacao:** `lesson.formats.includes('podcast')` precisa ser true para CTA mudar. Se lesson destino so tem `article`, mostrar CTA normal.

**Dependencias:** AudioPlayerContext (ja existe). Possiveis extensions de fields em context.

---

### RF-07 — Badge "Concluida" + Toast "Proxima Aula" ao 90%

**O que faz.** Em `LessonViewer`, monitora progresso do user. Ao atingir 90% em qualquer formato, dispara toast "Proxima aula: A.X — {titulo}" com botao "Iniciar A.X". Ao atingir 95% (= `completedAt` server-side), header da aula mostra badge "Concluida".

**Mudancas em `LessonViewer.tsx`:**

#### 7.A. Badge "Concluida"

```tsx
// Computed value
const isCompleted = useMemo(() => {
  const progressTyped = progress as ProgressData;
  for (const f of ["video", "podcast", "article"] as FormatTab[]) {
    const p = progressTyped[f];
    if (p && (p as any).completedAt) return true;
  }
  return false;
}, [progress]);

// In JSX header
<header className="space-y-1 flex items-start justify-between">
  <div>
    <h1 className="text-2xl font-bold text-white">{lesson.title}</h1>
    {lesson.subtitle && <p className="text-gray-400">{lesson.subtitle}</p>}
  </div>
  {isCompleted && (
    <span
      data-testid="lesson-completed-badge"
      className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-600/20 text-green-400 text-sm font-medium"
    >
      <CheckCircle size={14} aria-hidden />
      Concluida
    </span>
  )}
</header>
```

**Necessario expor `completedAt` no `ProgressData` shape:** `getLibraryProgressForLesson` (Spec 2 RF-01 #15) ja retorna `LibraryProgress[]` com `completedAt`. Frontend type `ProgressData` precisa incluir `completedAt: Date | null` em cada formato.

#### 7.B. Toast "Proxima aula" ao 90%

**Trigger:** monitorar `maxProgressPct` (computed value ja existente em LessonViewer:253). Quando passa de <90 para >=90, fire toast UMA vez (ref para evitar fire repetido).

```tsx
const toastFiredRef = useRef(false);
const queryClient = useQueryClient();

// Fetch next lesson via React Query (cached)
const { data: nextLesson } = useQuery({
  queryKey: ["library-next-lesson", lesson?.courseSlug, lesson?.slug],
  queryFn: () => apiRequest(
    "GET",
    `/api/library/courses/${lesson.courseSlug}/lessons/${lesson.slug}/next`
  ),
  enabled: !!lesson?.courseSlug && !!lesson?.slug,
  staleTime: 5 * 60 * 1000,
  retry: false,
});

useEffect(() => {
  if (toastFiredRef.current) return;
  if (maxProgressPct < 90) return;
  if (!nextLesson) return;

  toastFiredRef.current = true;
  toast({
    title: `Proxima aula: ${nextLesson.displayLabel}`,
    description: nextLesson.title,
    action: (
      <ToastAction
        onClick={() => setLocation(`/biblioteca/curso/${lesson.courseSlug}/${nextLesson.slug}`)}
      >
        Iniciar {nextLesson.displayLabel}
      </ToastAction>
    ),
    duration: 8000,
  });
}, [maxProgressPct, nextLesson, lesson, toast, setLocation]);
```

**Endpoint novo necessario? NAO.** Usar dados ja retornados por `GET /api/library/courses/:slug` (Spec 2). Frontend resolve "next lesson" client-side iterando modules + lessons procurando o proximo apos `lesson.slug`. Se nao existe (ultima do curso), nao mostra toast.

```tsx
// Resolution helper
function findNextLesson(course: CourseDetail, currentSlug: string): LessonItem | null {
  const allLessons: LessonItem[] = course.modules.flatMap(m => m.lessons);
  const idx = allLessons.findIndex(l => l.slug === currentSlug);
  if (idx === -1 || idx === allLessons.length - 1) return null;
  return allLessons[idx + 1];
}
```

**Criterios de aceitacao:**
- [ ] Badge "Concluida" renderiza no header quando algum formato tem `completedAt !== null`
- [ ] Badge NAO renderiza quando todos formatos tem `completedAt === null`
- [ ] Quando `maxProgressPct` cruza de <90 para >=90, toast aparece UMA vez (testavel via `vi.fn` mock toast)
- [ ] Toast NAO aparece de novo se user pausa em 92% e re-renderiza (ref previne)
- [ ] Toast NAO aparece se nao ha proxima aula (ultima do curso)
- [ ] Click no botao "Iniciar A.X" do toast navega para o hero da proxima
- [ ] Toast auto-dismiss apos 8000ms (D4)
- [ ] Toast manual dismiss via X funciona

**Edge cases:**
- Lesson eh ultima do modulo mas nao do curso → busca primeira lesson do proximo modulo.
- Lesson eh ultima do curso → sem toast.
- Progress regressa (user pula pra tras + assiste de novo) → toast nao reaparece (ref nao reseta).
- F5 / refresh da pagina com progresso 92% ja salvo → toast NAO dispara em mount (porque state `toastFiredRef` resetou mas threshold ja passou; aceito — toast eh sinal de "voce acabou de cruzar 90%", nao "voce ja passou"). **Decisao:** toast so dispara em transicao explicit <90 → >=90 dentro da mesma sessao.

**Dependencias:** RF-01 ja completo (Spec 2 storage). Sem migration nova.

---

### RF-08 — Breadcrumb Sticky no LessonViewer

**O que faz.** Adiciona breadcrumb sticky no topo do `LessonViewer.tsx`. Visivel durante scroll. Format: "Biblioteca / {courseTitle} / Aula {displayLabel}".

**Visual:**

```
┌───────────────────────────────────────────────────────┐
│ Biblioteca / Antes das Cartas / Aula A.1               │  ← sticky top, bg-black/80 backdrop-blur
├───────────────────────────────────────────────────────┤
│ Mentalidade Fixa vs...           [Concluida]          │  ← header
│ ...                                                    │
```

**Implementacao:**

```tsx
// LessonViewer.tsx — topo do return
<div data-testid="lesson-viewer" className="space-y-4">
  {/* RF-08: Breadcrumb sticky */}
  <nav
    data-testid="lesson-viewer-breadcrumb"
    aria-label="Breadcrumb"
    className="sticky top-0 z-30 bg-black/80 backdrop-blur-sm border-b border-gray-800 px-6 py-3 text-sm text-gray-400"
  >
    <Link href="/biblioteca" className="hover:text-green-400">
      Biblioteca
    </Link>
    <span className="mx-2 text-gray-600">/</span>
    <Link href={`/biblioteca/curso/${courseSlug}`} className="hover:text-green-400">
      {courseTitle}
    </Link>
    <span className="mx-2 text-gray-600">/</span>
    <span className="text-gray-200">Aula {displayLabel}</span>
  </nav>

  <div className="p-6 space-y-4">
    {/* resto do viewer existente */}
  </div>
</div>
```

**Necessita expor `courseTitle` no fetch da lesson:** `GET /api/library/lessons/by-slug/:courseSlug/:lessonSlug` (Spec 2). Verificar se ja retorna `courseTitle` no payload — se nao, adicionar (NAO eh refactor — eh field adicional). Lesson ja tem `courseSlug`; LessonViewer faz JOIN client-side.

**Alternativa simpler:** LessonViewer recebe `courseSlug` via prop ja, faz `useQuery(['library-course-detail', courseSlug])` para pegar title. **Trade-off:** request extra (cacheado). Aceitavel — TanStack Query reusa cache se CourseDetailPage ja foi visitada.

**Decisao:** usar `useQuery` para course detail, com cache 5min (consistente com Spec 2). Se `course.title` ainda carregando, mostra "Curso" como placeholder.

**Display label:** `lesson.displayLabel` ja existe em LessonItem (Spec 1) — formato "A.1", "A.2", etc. Se ausente, fallback `"Aula"`.

**Criterios de aceitacao:**
- [ ] Breadcrumb renderiza no topo do `LessonViewer`
- [ ] `position: sticky; top: 0` aplicado (testavel via `getComputedStyle`)
- [ ] z-index >= 30 (acima de iframe content que pode ser z-10)
- [ ] Background `bg-black/80 backdrop-blur` para overlay durante scroll
- [ ] "Biblioteca" link navega para `/biblioteca`
- [ ] "{courseTitle}" link navega para `/biblioteca/curso/{slug}`
- [ ] "Aula {displayLabel}" eh texto puro (sem link — pagina atual)
- [ ] Mobile (<768px): breadcrumb continua visivel; texto ajusta para `text-xs` se necessario
- [ ] aria-label "Breadcrumb" para a11y

**Edge cases:**
- `courseTitle` carregando → placeholder "Carregando..." ou "Curso" (aceitavel)
- `displayLabel` undefined → fallback "Aula"
- Breadcrumb ainda visivel quando iframe content faz `overflow: hidden` no parent (testar manualmente)

**Dependencias:** Nenhuma critica. Adicao standalone em LessonViewer.

---

### RF-09 — Telemetria `prologue_viewed` + `prologue_skipped`

**O que faz.** Registra eventos de visualizacao + skip do hero no `library_events` table. Usa endpoint `POST /api/library/events` ja existente (Spec 1 RF-06). Requer expandir enum Postgres.

**Migration 0035:**

```sql
-- migrations/0035_library_event_type_prologue.sql
ALTER TYPE library_event_type ADD VALUE IF NOT EXISTS 'prologue_viewed';
ALTER TYPE library_event_type ADD VALUE IF NOT EXISTS 'prologue_skipped';
```

**IMPORTANTE — Postgres enum constraint:**
- `ALTER TYPE ... ADD VALUE` em Postgres **nao pode rodar dentro de transaction block** em alguns drivers.
- Drizzle-kit `push` lida com isso. Se `push` falha, founder roda manualmente via psql.
- `IF NOT EXISTS` exige Postgres 12+ (Neon/PG local supportam).

**Schema update em `shared/schema.ts`:**

```ts
// shared/schema.ts:3566-3575
export const libraryEventTypeEnum = pgEnum("library_event_type", [
  "view",
  "play",
  "pause",
  "seek",
  "complete",
  "note_create",
  "coach_recommend",
  "access_blocked",
  "prologue_viewed",   // RF-09 (Sprint Polish)
  "prologue_skipped",  // RF-09 (Sprint Polish)
]);
```

**Zod schema dos eventos** (em `shared/schema.ts` insert schema): adicionar valores nas constraints + Zod enum.

**Frontend usage (LessonHeroPage):**

```tsx
// On mount + 1s timer (RF-03 also fires this)
const fireProlongueViewed = () => {
  apiRequest("POST", "/api/library/events", {
    lessonId: lesson.id,
    eventType: "prologue_viewed",
  }, { silentMode: true }).catch(() => {});
};

const fireProloguSkipped = () => {
  apiRequest("POST", "/api/library/events", {
    lessonId: lesson.id,
    eventType: "prologue_skipped",
  }, { silentMode: true }).catch(() => {});
};

// onSkipIntro handler
const onSkipIntro = () => {
  fireProloguSkipped();
  // navigate to /play
  setLocation(`/biblioteca/curso/${lesson.courseSlug}/${lesson.slug}/play`);
};
```

**Server-side validacao:**
- Endpoint `POST /api/library/events` ja existe e valida `eventType` contra Zod enum.
- Apos migration, novos valores aceitos automaticamente.

**Storage method:** `createLibraryEvent` ja implementado em RF-01 (Spec 2). Sem mudanca.

**Criterios de aceitacao:**
- [ ] Migration 0035 aplica com sucesso (testavel via `psql -c "SELECT enum_range(NULL::library_event_type)"` retornando 10 valores)
- [ ] Schema Drizzle inclui novos valores no enum
- [ ] Mount de `LessonHeroPage` apos 1s sem flag → POST `/api/library/events` com `eventType: 'prologue_viewed'`
- [ ] Click "Pular intro" → POST `/api/library/events` com `eventType: 'prologue_skipped'`
- [ ] Click "Iniciar aula" NAO dispara skip event (so dispara `prologue_viewed` se ainda nao disparado)
- [ ] Eventos chegam em `library_events` table com `userId` correto + `lessonId` correto + timestamp
- [ ] Endpoint NAO retorna erro com novos values
- [ ] Rate limiting de 60/min (Spec 1) continua aplicado — telemetry events nao bypass

**Edge cases:**
- POST falha (network) → silently swallow (telemetria nao deve bloquear UX). Test garante fail nao quebra UI.
- User desativa rede entre `prologue_viewed` e `prologue_skipped` → ambos retry exponential? **Decisao:** sem retry. Telemetria eh best-effort.
- Migration aplicada parcialmente → revert via `ALTER TYPE ... RENAME VALUE` (PG 13+) OU drop+recreate type (destrutivo, ultimo recurso).

**Dependencias:** Migration 0035 antes de deploy.

---

### RF-10 — Mobile Layout (`<768px`)

**O que faz.** Garante que `LessonHero` colapsa graciosamente em mobile.

**Regras de layout:**

| Elemento | Desktop (>=768px) | Mobile (<768px) |
|---|---|---|
| Cover | Full-bleed 100vw 100vh | Full-bleed 100vw, max-h-50vh |
| Content overlay position | bottom-left, max-w-3xl, pl-8 pb-12 | bottom-left, max-w-full, pl-4 pb-6 |
| Episode label | 12px tracking-wider | 10px tracking-wider |
| Title | 72px line-height-1 letter-spacing -2px | 36px line-height-1.1 letter-spacing -1px |
| Subtitle | 18px | 14px |
| Chips meta | Horizontal flex-wrap | Vertical stack ou flex-wrap horizontal |
| CTA primario | inline-block, w-auto | full-width (`w-full`) |
| CTA secundario | inline-block, w-auto, ml-3 | full-width, mt-3 (stacked below) |
| Below-the-fold | Lazy-render apos scroll | Lazy-render — mais espaco vertical scrollavel |

**Tailwind responsive classes:**

```tsx
// Container
<section className="relative w-full h-screen md:h-screen max-h-[100vh] overflow-hidden">
  {/* Cover */}
  <img
    src={coverUrl}
    className="absolute inset-0 w-full h-full max-h-[50vh] md:max-h-none object-cover"
    loading="eager"
  />
  {/* Gradient overlay */}
  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
  {/* Content */}
  <div className="absolute bottom-6 left-4 md:bottom-12 md:left-8 max-w-full md:max-w-3xl space-y-3 md:space-y-4">
    <p className="text-[10px] md:text-xs tracking-wider text-green-400 font-mono uppercase">
      EPISODIO {n} · {blockLabel}
    </p>
    <h1 className="text-4xl md:text-7xl font-bold leading-tight md:leading-none tracking-tight md:tracking-[-2px]">
      {title}
    </h1>
    {subtitle && (
      <p className="text-sm md:text-lg text-gray-300 max-w-2xl">{subtitle}</p>
    )}
    <div className="flex flex-wrap gap-2 text-xs md:text-sm text-gray-400">
      {/* chips */}
    </div>
    <div className="flex flex-col md:flex-row gap-3 md:gap-4">
      <button className="w-full md:w-auto px-6 py-3 bg-green-600 ...">
        INICIAR AULA
      </button>
      <button disabled className="w-full md:w-auto px-6 py-3 border border-white/30 opacity-50 ...">
        ⊕ Adicionar lista
      </button>
    </div>
  </div>
</section>
```

**Below-the-fold mobile:**
- IntersectionObserver dispara apos user scrolla pelo menos 200px do hero.
- Conteudo "Objetivos / Conceitos / Ciencia base" stacked vertical com padding `px-4 py-8`.
- Cards de objetivos full-width mobile, grid 2-col em md+.

**Criterios de aceitacao:**
- [ ] Mobile (<768px): cover renderiza com max-h-50vh
- [ ] Mobile: title em 36px (testavel via `getComputedStyle`)
- [ ] Mobile: botoes empilhados full-width
- [ ] Mobile: chips wrap em multiple lines OU stack vertical
- [ ] Desktop (>=768px): comportamento original mantido
- [ ] Below-the-fold renderiza somente apos scroll (IntersectionObserver mock + test)
- [ ] No portrait phone (~375px width): conteudo nao overflowa
- [ ] No landscape phone (~667px width): cover ainda max-h-50vh

**Edge cases:**
- Tablet (768-1023px) → desktop layout (D6 confirma).
- Phone landscape (<768px largura, >50vh altura) → cover max-h-50vh ainda aplica; conteudo pode ficar muito proximo da bottom edge. Aceitavel — minoria.
- Devices com notch / safe-area-inset → adicionar `pt-safe pb-safe` se Tailwind safe-area plugin instalado; senao deferir.

**Dependencias:** Tailwind responsive (sem deps novas).

---

### RF-11 — Below-the-Fold Content (Objetivos + Conceitos + Ciencia Base)

**O que faz.** Renderiza secao opcional abaixo do hero com "O que voce vai aprender" + "Conceitos-chave" + "Base cientifica". Lazy-render via IntersectionObserver. Usa `learning_objectives` ja extraido pela Spec 2.

**Estrutura:**

```
┌───────────────────────────────────────────────────────┐
│ HERO FULL-BLEED (RF-01)                               │
└───────────────────────────────────────────────────────┘
│ ↓ scroll                                              │
┌───────────────────────────────────────────────────────┐
│ O que voce vai aprender                               │  ← h2 32px
│   • Diferenca entre mentalidade fixa e crescimento... │
│   • 4 armadilhas da "versao falsa" pra evitar.        │
│   • 3 ferramentas pra usar na proxima sessao.         │
│                                                       │
│ Conceitos-chave                                       │  ← h2 32px
│   [Teorias Implicitas] [Neurociencia do Erro]         │  ← chips/badges
│                                                       │
│ Base cientifica                                       │  ← h2 32px (so se houver tags com prefix "ref:")
│   Mueller & Dweck 1998 · Moser 2011 · Yeager 2019     │
└───────────────────────────────────────────────────────┘
```

**Componente:**

```tsx
// client/src/components/biblioteca/LessonHeroBelowFold.tsx
interface LessonHeroBelowFoldProps {
  learningObjectives: string[];
  keyConcepts: string[];   // de lesson.tags filtered (sem prefix ref:)
  scientificBasis: string[]; // de lesson.tags com prefix "ref:" (futuro — pode ficar vazio MVP)
}

export function LessonHeroBelowFold(props: LessonHeroBelowFoldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  if (!isVisible) {
    return <div ref={ref} className="h-screen" />; // placeholder space para trigger scroll
  }

  return (
    <section data-testid="lesson-hero-below-fold" className="px-4 md:px-8 py-12 max-w-3xl mx-auto space-y-12">
      {props.learningObjectives.length > 0 && (
        <div data-testid="below-fold-objectives">
          <h2 className="text-3xl font-bold text-white mb-4">O que voce vai aprender</h2>
          <ul className="space-y-2 text-gray-300">
            {props.learningObjectives.map((obj, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle size={18} className="text-green-400 mt-1 flex-shrink-0" />
                <span>{obj}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {props.keyConcepts.length > 0 && (
        <div data-testid="below-fold-concepts">
          <h2 className="text-3xl font-bold text-white mb-4">Conceitos-chave</h2>
          <div className="flex flex-wrap gap-2">
            {props.keyConcepts.map((concept, i) => (
              <span key={i} className="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">
                {concept}
              </span>
            ))}
          </div>
        </div>
      )}
      {props.scientificBasis.length > 0 && (
        <div data-testid="below-fold-references">
          <h2 className="text-3xl font-bold text-white mb-4">Base cientifica</h2>
          <p className="text-sm text-gray-400">
            {props.scientificBasis.join(" · ")}
          </p>
        </div>
      )}
    </section>
  );
}
```

**Mapping de dados:**
- `learningObjectives`: direto de `lesson.learningObjectives` (extraido Spec 2 ADR-095).
- `keyConcepts`: `lesson.tags?.filter(t => !t.startsWith("ref:"))` ou apenas `lesson.tags ?? []` (MVP — sem distincao).
- `scientificBasis`: `lesson.tags?.filter(t => t.startsWith("ref:")).map(t => t.slice(4))` ou simplesmente `[]` no MVP. **Decisao MVP:** vazio. Futuro: extracao de `<section class="references">` no manifest importer.

**Caso vazio:**
- Se todos os 3 arrays vazios → componente nao renderiza nada (return null) ou `null` placeholder.
- Hero ainda funcional sem below-the-fold.

**Criterios de aceitacao:**
- [ ] Componente renderiza placeholder vazio (h-screen div) ate user scrollar
- [ ] IntersectionObserver dispara setIsVisible(true) quando placeholder entra no viewport (threshold 0.1)
- [ ] "O que voce vai aprender" lista renderiza com cada `learning_objective` em `<li>`
- [ ] "Conceitos-chave" renderiza chips quando `keyConcepts.length > 0`
- [ ] "Base cientifica" renderiza paragraph com tags ref: separados por · (vazio no MVP — secao omitida)
- [ ] Quando todos arrays vazios → componente nao renderiza
- [ ] Mobile: padding `px-4`, max-w-full
- [ ] Desktop: padding `px-8`, max-w-3xl
- [ ] Lazy-render: `getByTestId('below-fold-objectives')` retorna null antes de scroll trigger

**Edge cases:**
- IntersectionObserver indisponivel (jest-jsdom pre-polyfill) → polyfill em `tests/setup.ts` ou render imediato sem observer (fallback test-only).
- `learningObjectives` array com 20+ itens → CSS limita altura via `max-h-96 overflow-y-auto` (defensive).
- Item objeto muito longo (>200 chars) → defesa server-side ja existe (cap 200 em manifestImporter).

**Dependencias:** Spec 2 RF-08 + RF-09 (`learning_objectives` field). IntersectionObserver polyfill (verificar `tests/setup.ts`).

---

## 6. Schema / Backend Touches

### 6.1. Migration 0035 — Enum Expansion

**Arquivo:** `migrations/0035_library_event_type_prologue.sql`

```sql
-- Sprint Bloco-A-Polish / RF-09: telemetry para prologue (Netflix-style hero).
ALTER TYPE library_event_type ADD VALUE IF NOT EXISTS 'prologue_viewed';
ALTER TYPE library_event_type ADD VALUE IF NOT EXISTS 'prologue_skipped';
```

**Aplicar via:**
- `npm run db:push` (drizzle-kit push) DEVE detectar diff e gerar migration. Se NAO gerar, criar manualmente.
- Founder pode rodar `psql` direto se `db:push` falhar (alguns drivers PG nao gostam de `ALTER TYPE` em transaction).

**Idempotencia:** `IF NOT EXISTS` (Postgres 12+). Rerun seguro.

### 6.2. Schema Drizzle Update

**Arquivo:** `shared/schema.ts:3566-3575`

```ts
export const libraryEventTypeEnum = pgEnum("library_event_type", [
  "view",
  "play",
  "pause",
  "seek",
  "complete",
  "note_create",
  "coach_recommend",
  "access_blocked",
  "prologue_viewed",   // Sprint Bloco-A-Polish / RF-09
  "prologue_skipped",  // Sprint Bloco-A-Polish / RF-09
]);
```

**Zod insert schema:** `insertLibraryEventSchema` provavelmente usa Drizzle-zod auto-derived. **Validar:** se `eventType` field eh `z.enum([...])` em arquivo separado, atualizar lista. Provavel arquivo: `shared/schema.ts:3725` (proximo da declaracao da tabela).

### 6.3. Sem Mudanca em Storage

Todos storage methods ja existem. `createLibraryEvent` (Spec 2 RF-01 #12) aceita qualquer `eventType` valid contra enum. Sem refactor.

### 6.4. Sem Mudanca em Endpoints

`POST /api/library/events` ja valida via Zod schema. Apos schema update + migration, aceita novos values automaticamente.

---

## 7. API Contracts

**Zero novos endpoints.** Todos os RFs reusam infra existente:

| RF | Endpoint usado | Mudanca |
|---|---|---|
| RF-09 | `POST /api/library/events` (Spec 1) | Aceita 2 novos `eventType` values |
| RF-07 | `GET /api/library/courses/:slug` (Spec 1) | Sem mudanca — frontend resolve "next lesson" client-side |
| RF-08 | `GET /api/library/courses/:slug` ou `GET /api/library/lessons/by-slug/...` (Spec 2) | Sem mudanca — usar `course.title` |
| RF-11 | (frontend-only) | Usa `lesson.learningObjectives` ja exposto pelo `getLibraryLesson` Spec 2 |

**Validar:** verificar se `getLibraryLesson` retorna `learningObjectives` no payload JSON. Spec 2 RF-01 #3 promete; conferir implementacao real.

---

## 8. Componentes UI Tocados

### 8.1. Componentes Novos

| Arquivo | Linhas estimadas | Descricao |
|---|---|---|
| `client/src/components/biblioteca/LessonHero.tsx` | ~300 | RF-01 — hero cinematic full-bleed |
| `client/src/components/biblioteca/LessonHeroBelowFold.tsx` | ~120 | RF-11 — below-the-fold lazy-render |
| `client/src/components/biblioteca/PlayerEntryAnimation.tsx` | ~30 | RF-05 — wrapper fade-in para LessonViewer |
| `client/src/pages/biblioteca/LessonHeroPage.tsx` | ~180 | RF-02 — page wrapper que carrega LessonHero |
| `client/src/lib/library-hero-storage.ts` | ~40 | RF-03 — localStorage helpers |

### 8.2. Componentes Modificados

| Arquivo | Mudanca |
|---|---|
| `client/src/App.tsx` | RF-02 — adicionar rota `/play`; renomear comportamento da rota generica |
| `client/src/pages/biblioteca/LessonViewer.tsx` | RF-07 (badge + toast next lesson), RF-08 (breadcrumb sticky), RF-05 (wrap em PlayerEntryAnimation) |
| `shared/schema.ts` | RF-09 — adicionar 2 valores ao `libraryEventTypeEnum` |

### 8.3. Componentes NAO Tocados (zero refactor)

- `BibliotecaPage` — sem mudanca.
- `CourseDetailPage` — sem mudanca (continua linkando para `/biblioteca/curso/:slug/:lesson`; agora cai no hero em vez do viewer).
- `ArticleIframeWithWatermark` — sem mudanca (Spec 2).
- `PodcastPlayer`, `StickyAudioBar`, `LessonRow` — sem mudanca.
- `AudioPlayerContext` — possivel adicao de fields `currentLessonTitle` / `currentLessonShortLabel` se nao existirem (RF-06 D12).

---

## 9. Animation Specs

### 9.1. Hero Mount Sequence (RF-01)

| Tempo (ms) | Elemento | Animacao |
|---|---|---|
| 0 | Cover image | opacity 0 → 1 (600ms ease-out) + scale 1.05 → 1 (1200ms ease-out) |
| 100 | Episode label | opacity 0 → 1, translateY 10px → 0 (350ms) |
| 200 | Title | opacity 0 → 1, translateY 20px → 0 (400ms) |
| 350 | Subtitle | opacity 0 → 1, translateY 15px → 0 (400ms) |
| 500-740 | Chips (stagger 80ms) | opacity 0 → 1, translateY 10px → 0 (300ms) |
| 750 | CTA primario | opacity 0 → 1, scale 0.95 → 1 (350ms spring) |
| 850 | CTA secundario | opacity 0 → 1 (350ms) |
| 3000 | "Pular intro" button | opacity 0 → 1 (250ms) |

**Total mount sequence:** ~1200ms (cover Ken Burns dura mais, mas user-perceived "pronto" eh ~900ms).

### 9.2. Hero Exit (RF-05)

| Tempo (ms) | Elemento | Animacao |
|---|---|---|
| 0 | Hero (todo) | opacity 1 → 0 + scale 1 → 1.05 (700ms ease-in) |
| 700 | Wouter setLocation('/play') | navegacao |

### 9.3. Player Entry (RF-05)

| Tempo (ms) | Elemento | Animacao |
|---|---|---|
| 0 | LessonViewer mount | opacity 0 (initial) |
| 200 | LessonViewer | opacity 0 → 1 (500ms ease-out) |

### 9.4. Reduced Motion

`prefers-reduced-motion: reduce` desabilita TUDO acima:
- Sem fade, sem scale, sem translate, sem stagger.
- Mount instant.
- Skip button ainda usa timer 3000ms (delay nao eh "motion").

### 9.5. Below-the-fold Reveal (RF-11)

- Sem animacao explicita ao entrar no viewport.
- Conteudo simplesmente aparece (`isVisible = true` → render).
- Aceitavel: nao distrai do hero.

---

## 10. Mobile Specs

### 10.1. Breakpoints (D6)

| Breakpoint | Tailwind | Comportamento |
|---|---|---|
| < 768px | (default) | Mobile: hero collapse, stacked CTAs, max-h-50vh cover |
| >= 768px (md) | `md:` | Tablet/desktop: hero full-bleed, side-by-side CTAs |

### 10.2. Hero Collapse Rules

| Elemento | Mobile | Desktop |
|---|---|---|
| Cover height | max-h-50vh | h-screen (100vh) |
| Cover object-fit | cover (mantido) | cover |
| Title | text-4xl (36px) leading-tight | text-7xl (72px) leading-none |
| Subtitle | text-sm (14px) | text-lg (18px) |
| Episode label | text-[10px] | text-xs (12px) |
| Chips meta | flex-wrap | flex-wrap (mantido) |
| CTAs | flex-col gap-3 w-full | flex-row gap-4 w-auto |
| Content padding | pl-4 pb-6 | pl-8 pb-12 |
| "Pular intro" position | top-4 right-4 (smaller) | top-4 right-4 |

### 10.3. Below-the-fold Mobile

- Padding `px-4 py-8`.
- Max-w-full (no constraint).
- Cards de objetivos full-width.
- Heading 24px (vs 32px desktop).

### 10.4. Touch Targets

- Botoes minimo 44px altura (Apple HIG / Material).
- CTA primario: `py-3` = 12px padding-y + texto = ~48px total.
- "Pular intro": `py-2 px-3` = ~36px. **Ajustar para `py-2.5 px-4` em mobile** se ficar < 44px.

---

## 11. Testing Strategy

### 11.1. Component Tests

#### LessonHero (`__tests__/lesson-hero.test.tsx`)
- [ ] Renderiza com `lesson.coverKey` presente — img tag com src correta
- [ ] Renderiza com `coverKey === null` — fallback gradient div
- [ ] Title + subtitle + chips renderizados
- [ ] CTA "Iniciar aula" dispara `onStart` ao click
- [ ] CTA "Adicionar lista" disabled com tooltip "Em breve"
- [ ] "Pular intro" NAO renderiza antes de 3s (vi.useFakeTimers + advanceTimersByTime(2999))
- [ ] "Pular intro" renderiza apos 3s
- [ ] Click "Pular intro" dispara `onSkipIntro`
- [ ] CTA texto = "TROCAR PRA ESTA AULA" quando `isOtherAudioPlaying === true`
- [ ] Chip "Tocando agora" renderiza com `otherAudioLabel`
- [ ] Stagger animation: cada elemento tem `data-animation-delay` correspondente (testado via getAttribute)
- [ ] Reduced motion: animacoes desabilitadas (mock `matchMedia`)

#### LessonHeroPage (`__tests__/lesson-hero-page.test.tsx`)
- [ ] Mount carrega lesson via apiRequest
- [ ] Loading state renderiza skeleton
- [ ] Error 404 renderiza error typed
- [ ] Apos 1s sem flag → fire `prologue_viewed` event (mock fetch)
- [ ] Apos 1s sem flag → set localStorage flag
- [ ] localStorage flag === "true" no mount → setLocation('/play') imediato
- [ ] Click "Iniciar aula" → fire view event + setLocation('/play')
- [ ] Click "Pular intro" → fire skipped event + setLocation('/play')

#### LessonHeroBelowFold (`__tests__/lesson-hero-below-fold.test.tsx`)
- [ ] Antes de scroll: placeholder div renderiza
- [ ] IntersectionObserver mock dispara → conteudo renderiza
- [ ] `learningObjectives.length > 0` → secao "O que voce vai aprender" renderiza
- [ ] `learningObjectives === []` → secao omitida
- [ ] `keyConcepts.length > 0` → chips renderizam
- [ ] Todos arrays vazios → componente null

#### LessonViewer (extensions — `__tests__/lesson-viewer.spec-polish.test.tsx`)
- [ ] Breadcrumb sticky renderiza no topo
- [ ] Breadcrumb tem `position: sticky` (testavel via classname check)
- [ ] Badge "Concluida" renderiza quando `progress[X].completedAt !== null`
- [ ] Badge NAO renderiza quando todos `completedAt === null`
- [ ] Toast "Proxima aula" dispara UMA vez quando maxProgressPct cruza 90%
- [ ] Toast NAO dispara quando ja disparou (ref previne)
- [ ] Toast NAO dispara quando nao ha proxima aula

### 11.2. Routing Tests (`__tests__/library-routing.test.tsx`)

- [ ] `/biblioteca/curso/:slug/:lesson` carrega LessonHeroPage
- [ ] `/biblioteca/curso/:slug/:lesson/play` carrega LessonViewer
- [ ] Direct URL access para `/play` funciona (sem precisar passar pelo hero)
- [ ] Rotas com slugs invalidos cai em error states corretos

### 11.3. localStorage Tests (`__tests__/library-hero-storage.test.tsx`)

- [ ] `readHeroSeenFlag(id)` retorna null para flag inexistente
- [ ] `writeHeroSeenFlag(id)` seta string "true"
- [ ] `clearHeroSeenFlag(id)` remove flag
- [ ] Helpers tolerantes a localStorage quota error (mock setItem throw)
- [ ] Helpers tolerantes a localStorage indisponivel (mock localStorage undefined)

### 11.4. Telemetry Tests (`__tests__/library-prologue-telemetry.test.tsx`)

- [ ] POST `/api/library/events` chamado com `eventType: 'prologue_viewed'` apos 1s
- [ ] POST `/api/library/events` chamado com `eventType: 'prologue_skipped'` ao click skip
- [ ] Falha de network NAO quebra UI (silently swallowed)
- [ ] Eventos NAO disparados quando flag localStorage ja seen (skip total)

### 11.5. Backend Tests (`tests/server/library-events-prologue.test.ts`)

- [ ] POST `/api/library/events` aceita `eventType: 'prologue_viewed'` (apos migration)
- [ ] POST `/api/library/events` aceita `eventType: 'prologue_skipped'`
- [ ] Eventos persistidos em `library_events` table
- [ ] Antes da migration: POST com novo eventType retorna 400 (test isolado dev pre-migration)

### 11.6. E2E / Integration (manual ou Playwright futuro)

- [ ] Fluxo completo: BibliotecaPage → CourseDetailPage → click lesson → hero monta → click "Iniciar" → cross-fade → LessonViewer → progresso 90% → toast "Proxima"
- [ ] Revisita: refresh hero URL → redirect imediato pra /play
- [ ] Mobile (Chrome DevTools 375x667): hero colapsa corretamente
- [ ] Audio sticky: toca A.2 → abre hero da A.4 → audio nao para → CTA "Trocar"

### 11.7. Baseline Preservation

- [ ] 507/507 testes Spec 2 continuam verde
- [ ] Nenhum test removido (apenas adicionado)
- [ ] Snapshot tests existentes nao quebram (se houver)
- [ ] LessonViewer existing tests (data-testids) preservados

**Total estimado:** ~80-120 novos testes adicionados a baseline.

---

## 12. Risks

| ID | Risco | Mitigacao |
|---|---|---|
| **R1** | **Animation jank em devices low-end (Chrome Android low-tier).** Ken Burns + stagger podem stuttering em CPU fraca. | Use `transform` + `opacity` (GPU-accelerated). Avoid `width/height/top/left` animations. Test em throttle 4x slowdown DevTools. Reduced motion respeitado (D11). |
| **R2** | **Skip race condition: user clica "Pular intro" exatamente quando timer dispara.** State update conflict. | `setShowSkip(true)` eh idempotente; click handler chama `onSkipIntro` mesmo se botao ainda em transition. Defensive: `onClick` capturado em `onPointerDown` (mais responsive). |
| **R3** | **Sticky audio bar interrupt durante hero mount.** Race: hero mount tenta carregar audio mesmo sem clique → interrompe sticky. | LessonHero NAO interage com AudioPlayerContext (read-only check `isPlaying`). Mount nao chama `loadAudio`. Audio so carrega quando user clica "Iniciar/Trocar" → navega `/play` → LessonViewer mount → aih sim chama AudioPlayerContext. |
| **R4** | **localStorage cap (~5-10MB browser limit).** Se user tem 100+ aulas com flags, total ~5KB — nao bate cap. | Cada flag = ~50 bytes (key + value). 1000 lessons = 50KB. Trivial. Sem mitigacao necessaria. |
| **R5** | **Mobile 50vh edge: landscape phone tem ~375px altura — 50vh = 187px de cover.** Fica cramped. | Aceito — minoria. Landscape mobile poker eh corner case. Hero ainda funcional, just less cinematic. |
| **R6** | **Postgres ALTER TYPE ADD VALUE em transaction.** Algumas configs PG falham `ALTER TYPE` dentro de migration transaction. | Drizzle-kit handle ja pra outros enums. Se falhar, rodar migration via `psql -c` direto. Documentar em README. |
| **R7** | **IntersectionObserver indisponivel em jsdom.** Tests podem quebrar sem polyfill. | Polyfill em `tests/setup.ts` (provavelmente ja tem para outros componentes — verificar). Se nao, adicionar `intersection-observer` polyfill. |
| **R8** | **Wouter route ordering.** Adicionar `/play` apos rota generica pode causar match incorreto. | Wouter resolve por ordem de declaracao. Path mais especifico (4-segments) deve vir antes do generico (3-segments). Validar em routing tests. |
| **R9** | **AudioPlayerContext field `currentLessonTitle` pode nao existir.** RF-06 depende. | Inspect `client/src/contexts/AudioPlayerContext.tsx` em test-writer phase. Se ausente, adicionar (low-risk extension; provavelmente ja tem `lesson` object completo no state). |
| **R10** | **Toast "Proxima aula" fire em refresh com 92% pre-salvo.** User ve toast misleading "voce acabou de cruzar 90%". | Toast `toastFiredRef` reseta a cada mount — ACEITO mostrar toast 1x por mount mesmo se progress ja >= 90%. Alternativa: persistir "toast-shown-for-lesson-X" em sessionStorage. Decisao MVP: aceitar. |

---

## 13. Defaults Aplicados — Resposta Direta

| Open Question (do briefing) | Resposta Spec |
|---|---|
| Auto-skip prologue X segundos? | **NAO** — D1: botao manual + skip apos 3s + localStorage seen flag |
| Prologue em todos os cursos? | **SIM** — D2: aplicado em todas aulas; fallback gradient se sem coverKey |
| Watermark no hero? | **NAO** — D3: hero eh marketing/aspiracional; player principal mantem ADR-076 |
| Auto-redirect ao 100% audio? | **NAO** — D4: toast "Proxima aula" sem auto-redirect (respeita intencao) |
| Onde fica badge "Concluida"? | **No header da aula proximo titulo** — D5 |
| Mobile breakpoint? | **<768px** — D6: usa Tailwind `md:` breakpoint |
| "Adicionar lista" CTA? | **Disabled tooltip "Em breve"** — D7 |
| Below-the-fold render? | **Lazy via IntersectionObserver** — D8: nao renderiza ate user scrollar |
| localStorage flag formato? | `library:lesson:{lessonId}:hero-seen = "true"` — D9 |
| Telemetria como armazena? | **Enum Postgres expandido** via migration 0035 — D10 (NAO text livre — enum strict) |
| Cross-fade implementation? | **Framer Motion AnimatePresence** + bg preto parent — D11 |
| Sticky audio durante hero? | **Preservado; CTA muda para "Trocar pra esta aula"** — D12 |

---

## 14. Out of Scope (Explicito)

Para o `system-architect` + `test-writer` + `implementer`: estes itens **NAO** estao nesta sprint. Se descobrir que precisa, **PARE e abra Spec separada**.

- **Sharp resize de capas** — capas brutas continuam ~2MB com `loading="lazy"`. Sprint Polish-2 futuro.
- **Favoritos / "Adicionar lista" funcional** — botao mockado disabled. Spec future.
- **A11y formal NVDA/VoiceOver** — atributos ARIA basicos respeitados; teste formal eh Sprint A11y futuro.
- **Search / transcript indexing** dos TXTs NotebookLM — Spec futura.
- **Auto-grant Stripe** em compra — Spec 4 / Subscriptions.
- **Auto-skip prologue X segundos** — descartado (D1).
- **Auto-redirect proxima aula ao 100%** — descartado (D4).
- **Watermark no hero** — descartado (D3).
- **Multiple "Pular intro" delays customizaveis por usuario** — fixo 3s. Sem settings.
- **Telemetria de scroll-depth do below-the-fold** — `IntersectionObserver` triggera render, nao gera evento. Futuro.
- **Compartilhamento social do hero** — sem botao "Share". Futuro.
- **Hero video background (em vez de imagem static)** — fora de escopo. Imagens estaticas do `coverKey` somente.
- **Hero localizacao i18n** — texto hardcoded PT-BR. Futuro.

---

## 15. Dependencias e Ordem de Implementacao

### Pre-requisitos
- Spec 2 mergeada em main (storage real + viewer MVP funcional)
- Migration 0034 aplicada
- 507/507 testes verde
- `learning_objectives` populado em pelo menos algumas lessons (Bloco A inteiro)

### Ordem sugerida (test-writer + implementer)

1. **RF-09 + Migration** — sem isso, telemetria eventos nao funcionam (low risk de quebrar)
2. **RF-03 + helpers localStorage** — base reusada por outros RFs
3. **RF-01 + RF-02 (LessonHero + routing)** — coracao da feature
4. **RF-04 (Pular intro)** — depende RF-01
5. **RF-05 (Cross-fade)** — depende RF-01 + RF-02
6. **RF-06 (Sticky audio)** — depende RF-01 + AudioPlayerContext
7. **RF-10 (Mobile)** — depende RF-01 (CSS responsive)
8. **RF-11 (Below-fold)** — independente; pode rodar paralelo a 3-7
9. **RF-08 (Breadcrumb)** — independente; mexe so em LessonViewer
10. **RF-07 (Badge + toast)** — independente; mexe so em LessonViewer

**Paralelizable:** RF-08 + RF-07 + RF-11 podem rodar em paralelo (mexem em arquivos diferentes).

---

## 16. Estimativa

- **Test-writer phase:** ~1.5-2 dias (80-120 testes)
- **Implementer phase:** ~2-2.5 dias (5 componentes novos + 2 modificados + migration)
- **Reviewer + ajustes:** ~0.5 dia

**Total:** 3-5 dias dev solo via pipeline TDD.

---

## 17. Criterios Globais de Aceitacao

### Funcionais

- [ ] 9 aulas Bloco A entram via prologo Netflix em desktop + mobile
- [ ] localStorage skip funciona em revisita (2a vez = direto pro player)
- [ ] Breadcrumb sticky preservado durante scroll
- [ ] Audio sticky NAO eh interrompido por mount do hero
- [ ] Telemetria registra `prologue_viewed` + `prologue_skipped` events em `library_events`
- [ ] Badge "Concluida" aparece ao 95%+ progress
- [ ] Toast "Proxima aula" aparece ao 90%+ progress (uma vez por mount)
- [ ] Cross-fade hero → player sem flash branco

### Nao-funcionais

- [ ] 507/507 testes Spec 2 mantem verde
- [ ] Novos testes cobrem LessonHero (mount + skip + localStorage) + breadcrumb + completion bridge
- [ ] Sem regressao em LessonViewer existente
- [ ] Reduced motion respeita `prefers-reduced-motion`
- [ ] Mobile (<768px) layout funcional sem overflow
- [ ] Performance: TTI hero < 1.5s em conexao 4G simulada
- [ ] Accessibility basica: aria-labels, focus management, keyboard nav

### Operacional

- [ ] Migration 0035 aplicada sem erro (idempotente)
- [ ] `npm run check` passa (zero errors)
- [ ] `npm run build` passa
- [ ] No console warnings em runtime (React, Framer Motion)

---

## 18. Notas de Implementacao

### Performance
- LessonHeroPage **NAO eh lazy-loaded** (entry point critico) — load direto em App.tsx.
- LessonHero usa `loading="eager"` na cover image (above-the-fold).
- Below-the-fold usa `loading="lazy"` em images internas (se houver).
- Framer Motion eh ~50KB minified — ja em deps (validar via `npm ls framer-motion`).

### A11y
- Hero tem landmark `<section role="banner">` ou `<main>`.
- Title eh `<h1>` (unico H1 da pagina).
- Skip button: `aria-label="Pular introducao e ir para o player"`.
- Tab order: title → subtitle → chips → CTA primario → CTA secundario → skip button.
- Reduced motion: respeitar `@media (prefers-reduced-motion: reduce)` via Framer Motion `useReducedMotion` hook.

### Test infra
- Verificar polyfill IntersectionObserver em `tests/setup.ts` (R7).
- Mock `localStorage` em test setup (jest-localstorage-mock ou manual).
- Mock `framer-motion` em testes que nao precisam validar animacao real (`vi.mock('framer-motion', ...)`).
- Use `data-testid` estaveis (lesson #2 do CLAUDE.md).
- Validar shape REAL de `useOptionalAudioPlayer()` antes de mockar (lesson #3).

### Migration safety
- Aplicar 0035 em local dev primeiro (`npm run db:push`).
- Se falhar, rodar `psql -d grindfy -c "ALTER TYPE library_event_type ADD VALUE 'prologue_viewed';"` etc manualmente.
- Validar via `psql -c "SELECT enum_range(NULL::library_event_type);"`.
- Producao deploy: founder roda migration em janela de manutencao (sem downtime real, mas event types novos so existem apos apply).

---

*PM-spec out. system-architect take it from here.*
