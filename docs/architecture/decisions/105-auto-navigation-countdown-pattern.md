# ADR-105 — UX pattern: auto-navegacao com countdown 5s e cancelamento (NextLessonCTA)

- Status: Proposto
- Data: 2026-05-03
- Sprint: UX-Biblioteca-1 (RF-05 Parte B)
- Decision owner: system-architect (formaliza spec founder-aprovada)
- Related: ADR-074 (progress cross-format sync), ADR-098 (hero cinematic animation), ADR-096 (hero routing pattern)
- Spec: `Docs/specs/ux-biblioteca-1.md`

---

## 1. Contexto

A spec UX-Biblioteca-1 RF-05 Parte B substitui o toast atual `"Proxima aula: ..."` (disparado via `useEffect` em `LessonViewer.tsx:344-359` quando `maxProgressPct >= 90`) por um **CTA inline persistente** abaixo do progress bar. O CTA mostra a proxima aula, conta 5 segundos e auto-navega.

Este e o primeiro padrao de **auto-navegacao com countdown** introduzido no produto. Decisoes do como ele funciona viram contrato: futuros padroes (e.g. "auto-iniciar proximo torneio em sessao live", "auto-fechar cooldown completo", "auto-rever proximo modulo da biblioteca") tendem a copiar este shape, entao consolidar a decisao agora evita drift e bug semantico cumulativo.

### Forcas

- **Auto-navegacao agressiva e UX hostil**. YouTube em-fim-de-video tem countdown 5s; Netflix tem countdown 10s pre-credits; ambos com botao "Cancelar" claro. Sem cancelamento e sequestro do usuario.
- **Pro player nao pode "perder" controle**. Auto-nav que nao pode ser parada mid-countdown gera frustracao; especialmente se ele estava lendo article tab e ainda nao acabou, mas video chegou a 90%.
- **Trigger conservador**: 90% e suficiente para user "saber que terminou"; 100% e tarde demais (cara aproveitando creditos / outros formatos). Spec define 90%.
- **Idempotencia per-mount**: CTA aparece UMA vez por aula (ref guard). Se user da seek pra trocar tab e progress oscila >= 90 -> < 90 -> >= 90, CTA nao re-mostra. Re-mount em troca de aula reseta o guard naturalmente.
- **Acessibilidade**: countdown precisa ser anunciavel (screen reader). `aria-live="polite"` para sutil; `aria-live="assertive"` interrompe leitura de outros conteudos (mau UX). Auto-focus em "Ir agora" facilita teclado-only.
- **Cancelamento "sticky"**: depois de cancelar, CTA nao some. Botao "Ir agora" ainda funcional. User cancelou countdown, nao a navegacao toda.
- **Edge case ultima aula**: `nextLessonRef === null`. CTA nao renderiza. Sem crash. Spec opcional banner "Curso concluido"; este ADR defere para UX-Biblioteca-2 se complicar.
- **Esc keybinding**: convencao web (Esc fecha modal/cancela operacao). Esc deve mapear pra "Cancelar" do CTA.

### Pendencias residuais deixadas pelo PM-Spec

PM-Spec deixou 2 itens para architect:
1. **Magic number do countdown**: 5s vs 10s? Spec usou 5s; architect deve confirmar ou propor alternativa fundamentada.
2. **Onde mora o `useEffect` de auto-nav**: no `<NextLessonCTA>` standalone ou no `LessonViewer` parent? Influencia testabilidade.

---

## 2. Decisao

Padrao **auto-navegacao com countdown** com 5 invariantes:

### 2.1. Trigger conservador 90% + ref guard per-mount

`<NextLessonCTA>` aparece quando:
- `maxProgressPct >= 90` AND
- `nextLessonRef !== null` AND
- ref guard `hasShownThisMount.current === false`

Apos primeiro show, `hasShownThisMount.current = true`. Re-renders subsequentes nao re-mostram. Re-mount (troca de aula) reseta naturalmente.

### 2.2. Countdown 5s — confirmado

5 segundos. Justificativa:
- YouTube usa 5s. Padrao internacional reconhecivel.
- 10s e longo demais para auto-nav (user pensa "esse countdown vai durar uma eternidade").
- 3s e curto demais para user processar opcoes ("wait, what?").
- 5s permite ler titulo da proxima aula + decidir + cancelar se quiser.

Implementacao: `useEffect` com `setInterval` 1000ms decrementando state `secondsLeft`. Em 0 -> chama `handleGo()`.

### 2.3. Cancelamento sticky

Botao "Cancelar" (e Esc keypress) param o countdown (`clearInterval` + `setSecondsLeft(null)`) mas **NAO desmontam** o CTA. Botao "Ir agora" continua funcional (user ainda pode optar manualmente). 

Estado interno: `countdownActive: boolean`. Default `true`. Cancel -> `false`. Quando `false`, label do CTA muda de "Auto-iniciando em Ns" para vazio (ou "Quando quiser, clique abaixo").

### 2.4. Componente standalone testavel + parent owns state

`<NextLessonCTA>` em `client/src/components/biblioteca/NextLessonCTA.tsx` recebe props:

```ts
type NextLessonCTAProps = {
  nextLesson: { id: string; displayLabel?: string; title: string; courseSlug: string; lessonSlug: string };
  onGo: () => void;       // Parent navega via setLocation. CTA nao conhece roteamento.
  onCancel: () => void;   // Parent loga cancel + (opcional) marca dismissed.
  autoStartSeconds?: number; // default 5
};
```

`LessonViewer` (parent) controla:
- `useState` para `showCta` boolean (inicia false). Trigger `>= 90` + ref guard seta `true`.
- `setLocation(\`/biblioteca/curso/${nextLesson.courseSlug}/${nextLesson.lessonSlug}\`)` em `onGo`.
- Telemetry/log em `onCancel`.

Logica do countdown (interval, esc handler) mora **dentro** de `<NextLessonCTA>`. Parent so passa callbacks. Razao: countdown e detalhe de UI, nao logica de aplicacao. Testar `<NextLessonCTA>` isoladamente e mais facil sem parent.

### 2.5. Acessibilidade

- `role="region"` + `aria-label="Proxima aula"`.
- `aria-live="polite"` no elemento que renderiza "Auto-iniciando em Ns". Anunciado no idle do screen reader, sem interromper outras leituras.
- Auto-focus em `<button>Ir agora</button>` quando CTA monta. Teclado-only consegue Tab/Enter sem mouse.
- Esc keypress (em document level enquanto CTA visivel) chama `onCancel`. Convencao web reconhecivel.
- "Cancelar" e ghost button; "Ir agora" e CTA verde primario (mesma classe Bloco A).

---

## 3. Opcoes Consideradas

### 3.1. Trigger threshold

- **A: 80%** — muito cedo. User ainda esta consumindo conteudo principal (~16s restantes em video de 80s). CTA sequestra atencao precoce.
- **B: 90%** (ESCOLHIDA) — sweet spot. Conteudo principal ja foi ingerido; user mentalmente sabe que "ja era". 5s extra de countdown nao atrapalha.
- **C: 95%** — tarde demais. Maioria dos LMS dispara antes; user perde momentum.
- **D: 100%** (= completedAt) — extremo tarde. Toast original disparava em algum ponto entre 90-100; spec quer antes. 100% nao captura o momento de transicao.

### 3.2. Magic number countdown

- **3s** — user nao tem tempo de processar. UX hostil em mobile (mao nao chega no cancel a tempo).
- **5s** (ESCOLHIDA) — YouTube/Coursera. Padrao internacional. Suficiente para ler titulo + decidir.
- **10s** — Netflix usa em fim de credit. Aceitavel mas longo. Para LMS auto-nav, 5s e mais snappy.
- **Sem countdown / nav imediata** — mau UX (sem cancel).
- **Sem auto-nav (so botao manual)** — perde o "smooth flow" do binge-watching.

### 3.3. Componente vs hook

- **Hook `useAutoCountdown(seconds, onComplete)`** — reusavel para outros padroes futuros, mas nao ha caso de uso real ainda. YAGNI.
- **Componente `<NextLessonCTA>` standalone** (ESCOLHIDA) — encapsula UI + countdown logic. Refactor para hook trivial quando 2o caso aparecer (DRY only when needed).

### 3.4. Cancelamento behavior

- **Cancelar = desmonta CTA** — perde "Ir agora" manual. User que cancelou pode mudar de ideia 30s depois e ter que descobrir botao escondido em outro canto.
- **Cancelar sticky** (ESCOLHIDA) — para countdown, mantem CTA visivel. "Ir agora" funciona quando user quiser. Match exato com mental model "Cancel = stop the timer, not the option".

---

## 4. Consequencias

### 4.1. Positivas

- **UX consistente com LMS estabelecidos**: 5s countdown + cancelar + ir agora e padrao reconhecivel.
- **Pro player mantem controle**: cancelamento sticky permite mudar de ideia. Sem sequestro.
- **Acessibilidade contemplada**: aria-live + auto-focus + Esc. Teclado-only e screen-reader funcionam.
- **Componente testavel isoladamente**: `<NextLessonCTA>` recebe callbacks, sem dependencia de Wouter/router. Test-writer escreve testes diretos com `render(<NextLessonCTA ... />)`.
- **Padrao replicavel**: futuros auto-nav (cooldown, sessao, modulo) reusam shape (props, ref guard, sticky cancel, magic 5s).

### 4.2. Negativas

- **Toast removido** (RF-05B): user que estava em mobile com viewport pequeno e dependia do toast pra "saber" que terminou perde feedback proativo. Trade-off: CTA inline e sempre visivel se rolar; toast e ephemeral. Spec aceita.
- **CTA acima de progress bar OU abaixo?**: spec define abaixo. Decisao pode gerar discussao em revisao visual; este ADR nao fixa, deixa para componente.
- **Edge case "ultima aula"**: spec opcional banner conclusao deferido. User chega no final da ultima aula sem sinal -> volta pra CourseDetailPage manualmente. Aceito por simplicidade.

### 4.3. Neutras

- **Ref guard reseta em re-mount**: troca de aula re-mostra CTA na proxima vez que >= 90 hit. Comportamento desejado.
- **Cancelamento nao persiste cross-mount**: user que cancelou em aula 1 e volta amanha vai ver CTA novamente quando re-atingir 90. Nao e bug; e comportamento esperado (cada mount = nova oportunidade).
- **Edge case progress oscila >= 90 -> < 90 -> >= 90**: ref guard ja garante CTA aparece 1 vez. Mesmo se user da seek, ja esta protegido.

### 4.4. Migracao reversivel

Reverter = remover `<NextLessonCTA>` do `LessonViewer` + reativar `useEffect` do toast (linhas 344-359 originais). Custo = 1 PR. Nenhum impacto em schema/DB.

---

## 5. Confianca

**Alta.** Padrao 5s + cancel + ir-agora e estabelecido em LMS estabelecidos (YouTube, Coursera, Udemy). Componente standalone simplifica testes. Ref guard ja foi padrao testado em outras partes do produto (e.g. `lessonHeroStorage` lesson #15). Acessibilidade enderecada com primitives padrao (aria-live, focus, Esc handler). Sem blockers.

---

## 6. Notas de Implementacao

- `client/src/components/biblioteca/NextLessonCTA.tsx` (novo). Props ja definidas em §2.4.
- Interval cleanup obrigatorio em unmount (`useEffect` return). Senao memory leak + chamada de `onGo` em componente desmontado.
- Esc keybinding via `document.addEventListener('keydown', handler)` em useEffect; cleanup em return. Capture phase ou bubble — bubble suficiente (nao precisa interceptar antes de outros listeners).
- Auto-focus via `useRef` + `useEffect` initial mount: `goButtonRef.current?.focus()`. Se conflitar com video player que tinha focus, aceitar (CTA aparece em final de video — focus migrar para "Ir agora" e desejado).
- Telemetry: log `console.log('[next-lesson-cta] shown', { lessonId })`, `[cancelled]`, `[auto-nav]`, `[manual-go]`. Server-side eventType nao adicionado (lesson #97 — adiciona em UX-Biblioteca-2 via enum extension).
- Reviewer checklist:
  - Zero hardcoded `bg-green-500` — usa `tokens.color.feedback.positive` ou Bloco A class consistente.
  - Cleanup de interval em unmount? Confere.
  - Cleanup de Esc listener? Confere.
  - Auto-focus depois de mount? Confere.
  - aria-live presente? Confere.
- Test scenarios obrigatorios (test-writer):
  - render -> auto-focus em "Ir agora".
  - render -> 5s timeout -> `onGo` chamado.
  - render -> click "Cancelar" antes de 5s -> `onGo` NAO chamado, CTA permanece visivel.
  - render -> Esc keypress -> equivale ao Cancelar.
  - render -> click "Ir agora" antes de 5s -> `onGo` chamado imediato.
  - unmount durante countdown -> nenhum warning de "state update on unmounted component" (cleanup OK).
- Regressao: toast `"Proxima aula"` em `LessonViewer:344-359` removido. Tests anteriores que asseravam `toast.title === "Proxima aula"` precisam virar assertions de "toast nao chamado" + presenca do `<NextLessonCTA>`.
