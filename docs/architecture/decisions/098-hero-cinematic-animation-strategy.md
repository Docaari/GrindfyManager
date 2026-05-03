# ADR-098 — Hero cinematic animation strategy: Framer Motion AnimatePresence + Ken Burns + stagger entry com reduced-motion support

- Status: Proposto
- Data: 2026-05-03
- Sprint: Bloco-A-Polish (RF-01 + RF-05 + D11)
- Decision owner: system-architect (formaliza founder D11 da Spec Bloco-A-Polish)
- Related: ADR-096 (routing pattern), ADR-097 (telemetry events)
- Spec: `Docs/specs/biblioteca-spec-bloco-a-polish.md` RF-01 + RF-05 + D11

---

## Contexto

Spec Bloco-A-Polish RF-01 define que `LessonHero` deve renderizar uma sequencia de animacoes cinematic premium (Netflix-style):

| Elemento | From → To | Duration | Delay |
|---|---|---|---|
| Cover image | `opacity 0→1` + `scale 1.05→1` (Ken Burns) | 600/1200ms | 0ms |
| Episode label | `opacity + translateY 10px→0` | 350ms | 100ms |
| Title | `opacity + translateY 20px→0` | 400ms | 200ms |
| Subtitle | `opacity + translateY 15px→0` | 400ms | 350ms |
| Chips meta | `opacity + translateY 10px→0` (stagger 80ms) | 300ms | 500ms+ |
| CTA primario | `opacity + scale 0.95→1` (spring) | 350ms | 750ms |
| CTA secundario | `opacity` | 350ms | 850ms |
| Skip button | `opacity` | 250ms | 3000ms (RF-04) |

RF-05 define cross-fade hero → player ao clicar "Iniciar aula": hero `opacity 1→0` + `scale 1→1.05` em 700ms ease-in, player fade-in 500ms delay 200ms.

Spec D11 + RF-05 + acessibilidade exigem `prefers-reduced-motion: reduce` desligar todas as animacoes (mount instant, navegacao instant).

Tres tecnicas de animacao avaliadas:

1. **CSS keyframes puro**: `@keyframes` + `animation-delay` + `animation-duration`. Estatico, sem JS state.
2. **Framer Motion `motion.div`** com `initial`/`animate`/`transition` props: declarativo React, integra com state, suporta spring physics.
3. **Web Animations API (WAAPI)** programatico: `element.animate(keyframes, options)`. Imperativo, JS state-driven.

Forcas:
- **Determinismo em testes**: `vi.advanceTimersByTime()` precisa avancar animacoes reliably; CSS keyframes nao avancam com fake timers (precisa real-time clock).
- **Reduced motion compliance**: requirement WCAG 2.3.3 — `prefers-reduced-motion: reduce` deve desligar animacoes nao-essenciais.
- **Cross-fade entre rotas**: requer coordenacao entre unmount (hero) e mount (player) — single React tree precisa AnimatePresence ou similar.
- **Bundle size**: Framer Motion ~28KB gzip; CSS puro 0KB (ja em CSS bundle); WAAPI 0KB (browser native).
- **Spring physics**: CTA primario tem entrada spring (overshoot subtle); CSS pode aproximar com `cubic-bezier(0.5, 1.5, 0.5, 1)` mas perde naturalidade.
- **Stagger entry**: 8 elementos com delays absolutos diferentes — Framer Motion expressa via `transition.delay` direto no array; CSS keyframes precisa nth-child + variavel CSS por elemento.
- **Ja em deps**: `framer-motion` ja eh dependencia do Grindfy (usado em CourseDetailPage accordion, BibliotecaPage hero, sidebar transitions). Sem novo bundle cost.

---

## Opcoes Consideradas

### Opcao 1 — CSS keyframes + `prefers-reduced-motion: reduce`

**Pros:**
- Zero bundle cost — usa CSS existente.
- Performance otima — GPU-accelerated direto.
- Reduced motion via `@media (prefers-reduced-motion: reduce) { .lesson-hero * { animation: none; } }` trivial.

**Contras:**
- Stagger de 8 elementos com delays absolutos exige 8 keyframes nomeados ou 8 variaveis CSS por elemento — manutencao verbosa.
- Spring physics (CTA primario) impossivel; aproximacao via cubic-bezier perde fidelidade.
- Cross-fade entre rotas precisa coordenacao manual via classes `.entering` `.exiting` + `setTimeout` — frasil.
- Tests com `vi.advanceTimersByTime` NAO afetam CSS animations — precisa `requestAnimationFrame` mock ou skipar animacao em test mode.
- AnimatePresence nao existe — para unmount com animacao, precisa atrasar `setLocation` manualmente com `setTimeout`.

### Opcao 2 — Framer Motion `motion.div` + AnimatePresence (ESCOLHIDA)

**Pros:**
- Stagger trivial — array de delays absolutos, cada `motion.div` recebe seu `transition={{ delay: X }}`.
- Spring physics nativo — `transition={{ type: "spring", stiffness: 300 }}` para CTA primario.
- Cross-fade entre rotas via AnimatePresence + `mode="wait"` (espera unmount completar antes de mount). Wouter integration: wrap rotas em AnimatePresence no `App.tsx` ou em layout intermediario.
- Reduced motion: `useReducedMotion()` hook do Framer Motion retorna `boolean` reactive — passar como condicional em todos `transition` props (`transition={shouldReduce ? { duration: 0 } : { duration: 0.4 }}`).
- Tests: Framer Motion respeita fake timers quando configurado — `motion.div` updates state via React, fake timers controlam useEffect/setTimeout calls que disparam state changes.
- Padrao consistente com resto do app (CourseDetailPage, sidebar transitions).

**Contras:**
- Bundle cost 28KB gzip — JA INCLUIDO no app (sem custo adicional pra esta sprint).
- Tests precisam mock `framer-motion` em alguns setups, ou usar `MotionConfig isStatic` — padrao ja documentado em `tests/setup.ts`.

### Opcao 3 — WAAPI imperativo

**Pros:**
- Browser native — zero bundle.
- API explicita.

**Contras:**
- React integration manual — precisa `useEffect` + `useRef` + cleanup em cada componente.
- AnimatePresence equivalente nao existe — precisa orchestrar mount/unmount manualmente.
- Spring physics nao nativo — implementar via `cubic-bezier` ou lib custom.
- Reduced motion exige listener manual em `matchMedia('(prefers-reduced-motion: reduce)')`.
- Mais codigo, menos manutencao.

---

## Decisao

**Opcao 2 escolhida.** Implementacao em 3 partes:

### 1. Mount sequence em `LessonHero` (RF-01)

Cada elemento eh um `motion.div` com `initial` + `animate` + `transition` props. Delays absolutos (preferencia sobre `staggerChildren` parent — mais previsivel para tests):

```tsx
import { motion, useReducedMotion } from "framer-motion";

export function LessonHero({ lesson, episodeNumber, blockLabel, onStart }: LessonHeroProps) {
  const shouldReduce = useReducedMotion();
  const transition = (duration: number, delay: number) =>
    shouldReduce ? { duration: 0 } : { duration, delay, ease: "easeOut" };

  return (
    <div className="relative w-full h-screen bg-black">
      <motion.img
        src={assetUrl(lesson.coverKey, "hero")}
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 1.2, ease: "easeOut" }}
        className="absolute inset-0 object-cover"
        data-testid="lesson-hero-cover"
      />
      {/* gradient overlay ... */}
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition(0.35, 0.1)}
      >
        EPISODIO {episodeNumber} · {blockLabel}
      </motion.span>
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition(0.4, 0.2)}
        data-testid="lesson-hero-title"
      >
        {lesson.title}
      </motion.h1>
      {/* subtitle, chips, CTAs com delays 0.35, 0.5+stagger, 0.75 spring, 0.85 ... */}
    </div>
  );
}
```

### 2. Cross-fade hero → player (RF-05) via AnimatePresence

Wouter integration: wrap routes em layout que aplica AnimatePresence:

```tsx
// App.tsx (layout intermediario — apenas rotas /biblioteca/curso/:slug/:lesson*)
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";

function LibraryLessonLayout() {
  const [location] = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location} // unique key triggers animation on route change
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 1.05 }}
        transition={{ duration: 0.7, ease: "easeIn" }}
      >
        <Switch>
          <Route path="/biblioteca/curso/:courseSlug/:lessonSlug" component={LessonHeroPage} />
          <Route path="/biblioteca/curso/:courseSlug/:lessonSlug/play" component={LessonViewerPage} />
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}
```

`mode="wait"` espera hero completar exit antes de player montar. Background do parent eh `bg-black` para evitar flash branco.

### 3. Reduced motion (D11 + WCAG 2.3.3)

`useReducedMotion()` hook do Framer Motion retorna `boolean` reactive baseado em `matchMedia('(prefers-reduced-motion: reduce)')`. Passar como condicional em TODOS `transition` props:

```tsx
const transition = shouldReduce
  ? { duration: 0 }
  : { duration: 0.4, delay: 0.2, ease: "easeOut" };
```

Skip button RF-04 ainda usa `setTimeout(3000)` — delay nao eh animacao, eh logica de UX (dar tempo para usuario absorver hero antes de oferecer skip). Reduced motion NAO afeta esse delay.

### 4. Skip button mount apos 3s

Implementacao com `useState` + `useEffect`:

```tsx
const [showSkip, setShowSkip] = useState(false);
useEffect(() => {
  const timer = setTimeout(() => setShowSkip(true), 3000);
  return () => clearTimeout(timer);
}, []);

// JSX
{showSkip && (
  <motion.button
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={shouldReduce ? { duration: 0 } : { duration: 0.25 }}
    data-testid="lesson-hero-skip-button"
    onClick={onSkipIntro ?? onStart}
  >
    Pular intro
  </motion.button>
)}
```

Test: `vi.advanceTimersByTime(3000)` triggera `setShowSkip(true)`; `getByTestId('lesson-hero-skip-button')` resolve.

---

## Consequencias

**Positivas:**
- Stagger sequence declarativa, fluida, manutenivel.
- Spring physics no CTA primario natural.
- Cross-fade entre rotas via AnimatePresence — pattern documentado, reusavel em outras areas (Biblioteca, Studies).
- Reduced motion compliance via hook nativo Framer Motion.
- Tests com fake timers controlam mount/unmount (timeout-based logic), Framer Motion respeita state changes.
- Sem novo bundle cost (Framer Motion ja em deps).

**Negativas:**
- Tests precisam `MotionConfig isStatic` em setup ou mock seletivo se animacoes interferirem com assertions de DOM. Padrao ja em `tests/setup.ts`.
- AnimatePresence layout intermediario adiciona um `<motion.div>` wrapper na arvore — overhead minimo, sem regressao visual.

**Neutras:**
- Cross-fade duration 700ms parece longo em desktop fast; aceitavel via UX decision (Netflix usa 600-800ms similar). User com reduced motion pula totalmente.
- Skip button delay de 3s eh UX decision (nao animation) — nao afeta usuarios com reduced motion.

---

## Confianca

**Alta.** Framer Motion eh padrao da industria (Vercel, Linear, Stripe usam). Grindfy ja usa em multiplas paginas. AnimatePresence pattern documentado. Reduced motion compliance via hook nativo. Tests previously validados em CourseDetailPage (Sprint Biblioteca-1) com mesma stack.
