# ADR-206 — Test Harness Anti-Pattern: `useEffect([ctx])` Infinite Loop OOM

**Status:** **Accepted**
**Date:** 2026-05-22
**Sprint:** Mini Player 3.3 (pacote MUST — Cluster A)
**Supersedes / Relates:** Lesson #14 (require em test .tsx com deps ESM), Lesson #26 (Vitest 4 + require sync), Lesson #38 (mix `await import` + `require` cria 2 module records distintos), Lesson #11 (default minimo — escopo aplicavel)

---

## Context

Durante o cluster Mini Player (MP1 → MP3.2) descobrimos uma terceira variante de impedimento test-harness que **causa OOM/heap exhaustion ao rodar suites com `renderHook`/`render` + `useAudioPlayer`**. As variantes ja documentadas em lessons #14, #26 e #38 cobrem `require()` vs `await import` e ESM/CJS module identity. A nova variante e diferente: o codigo de teste e ESM, o import e consistente, mas o componente de Probe (test harness) dispara `useEffect` que muta o `AudioPlayerContext`, e o pattern de `deps: [ctx]` cria loop infinito.

### O sintoma observado

15 testes ficaram `.skip` em MP3.2 com pattern:

```tsx
// ANTI-PATTERN em tests/client/mini-player/*.test.tsx
function TestHarness() {
  const ctx = useAudioPlayer();
  useEffect(() => {
    ctx.playTrack({ id: 'lesson-1', src: '...' });
  }, [ctx]); // <-- ctx muda toda render → re-dispara → OOM
  return null;
}
```

`renderHook` ou `render(<TestHarness />)` faz com que:

1. `ctx` referencia inicial gerada via `useMemo(() => ({ playTrack, ... }), [state, ...])` no Provider.
2. Effect dispara `playTrack` → muta state.
3. Provider re-renderiza → `useMemo` deps mudam → **novo objeto** `ctx`.
4. Filho re-renderiza → `useEffect` ve novo `ctx` → re-dispara.
5. Loop nao tem condicao de parada → heap cresce → OOM (`FATAL ERROR: Reached heap limit`).

Diferente de lessons #14/#26 (impedimento de import) e #38 (2 module records distintos por Context), este e um anti-pattern **puramente comportamental** sobre regras de hooks + identidade de objeto entre renders.

### Arquivos afetados (MP3.2 → MP3.3)

- `tests/client/mini-player/retryCurrent.race-lock.test.tsx` — 3 testes
- `tests/client/mini-player/onboarding-help-interaction.test.tsx` — 3 testes
- `tests/client/mini-player/keyboard-shortcuts-input-gate.test.tsx` — 7 testes
- `tests/client/mini-player/dialog-aria-label-dedup.test.tsx` — 1 teste (mas esse caso ja e a variante #14/#26, nao #206)

Total: 13 testes de comportamento (excluindo dialog) que **falham silenciosamente** com timeout/OOM em vez de assertion failure.

### Por que e dificil de detectar

- **OOM nao reporta a linha do effect.** A stacktrace mostra `node` heap, nao o teste.
- **Sem typecheck warning.** TypeScript valida o tipo de `ctx` (objeto de contexto), nao alerta sobre identidade entre renders.
- **`react-hooks/exhaustive-deps` lint *exige* `ctx` em deps.** O lint padrao de Rules of Hooks empurra o dev pra essa armadilha — adicionar `// eslint-disable-next-line` ou usar deps `[]` parece violar boas praticas.
- **O codigo de producao esta correto.** O bug e exclusivamente no test harness.

---

## Decision

**Adotar dois patterns canonicos** para test harness que precisa interagir com `AudioPlayerContext` (ou qualquer Context cujo valor seja recriado por `useMemo`/`useCallback` em cada render):

### Pattern A (preferido) — `useRef` flag + `[]` deps

```tsx
function TestHarness({ onReady }: { onReady?: (ctx: AudioPlayerCtx) => void }) {
  const ctx = useAudioPlayer();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    ctx.playTrack({ id: 'lesson-1', src: '...' });
    onReady?.(ctx);
  }, []); // <-- deps array vazio: dispara 1x no mount, nunca mais

  return null;
}
```

**Regras:**

- `useRef(false)` flag e checada **antes** de qualquer mutacao do contexto.
- `useEffect` usa `deps: []` (vazio) — o `eslint-disable-next-line react-hooks/exhaustive-deps` e **permitido em test files** (nao em codigo de producao).
- Se o teste precisa capturar o `ctx` mutado, passa callback `onReady` que recebe a referencia mais recente via closure.
- Idempotencia: re-renders nao re-disparam o effect.

### Pattern B (alternativo) — Imperative call em `act(...)` no body do teste

```tsx
it('retry respects race lock', async () => {
  let capturedCtx: AudioPlayerCtx | null = null;

  function Capture() {
    capturedCtx = useAudioPlayer();
    return null;
  }

  render(
    <AudioPlayerProvider>
      <Capture />
    </AudioPlayerProvider>
  );

  await act(async () => {
    await capturedCtx!.playTrack({ id: 'lesson-1', src: '...' });
  });

  expect(capturedCtx!.state.status).toBe('playing');
});
```

**Regras:**

- O Probe (`Capture`) so **le** `ctx` em variavel externa via assignment durante render — **nao dispara effect**.
- O teste body controla quando mutar via `act(async () => { ... })`.
- Vantagem: tempo de mutacao explicito no teste, sem dependencia de useEffect lifecycle.
- Desvantagem: `capturedCtx` pode estar stale entre re-renders — sempre **re-le** via `capturedCtx!.metodo(...)` (a referencia muda mas o closure scope mantem ponteiro atualizado por reassignment).

### Regra geral

**Proibido** em test harness do cluster MP (e qualquer outro que use Context com valor `useMemo`-cached):

```tsx
useEffect(() => {
  ctx.qualquerCoisa(...);
}, [ctx]); // <-- BANIDO. Nunca usar ctx em deps de effect que muta ctx.
```

---

## Options Considered

### Opcao 1 (escolhida): Documentar como ADR + adotar Pattern A canonico

- **Pros:** Refactor barato (~6h para 13 testes). Documenta regra para futuros sprints. Sem mudanca em codigo de producao.
- **Cons:** Requer disciplina de revisao — lint nao captura.

### Opcao 2: Refatorar `AudioPlayerContext` para usar `useRef` interno em vez de `useMemo`

- **Pros:** Estabiliza identidade de `ctx` entre renders — `useEffect([ctx])` viraria seguro.
- **Cons:**
  - Quebra invariante React (Provider espera novo valor referencia para trigger re-render de consumers que dependem de subset do state).
  - Implementaria pattern nao-idiomatico para "resolver" bug que e do teste.
  - Risco alto de regressao em consumers de producao que ja dependem da semantica atual.

### Opcao 3: Adicionar `eslint-plugin` custom proibindo `useEffect([ctx])` em testes

- **Pros:** Lint automatico previne regressao futura.
- **Cons:** Custo de manutencao do plugin. Falsos positivos (ex: `useEffect([scope.ctx])` legitimo). Pode ser feito depois se Pattern A regredir 2+ vezes (regra dos 3 strikes — propagacao via hookify).

### Opcao 4: Substituir `renderHook` por testes E2E (Playwright)

- **Pros:** Sem questao de identidade de Context.
- **Cons:** 10x mais lento. Quebra estrategia TDD atual. Overkill para cobrir 13 cenarios isolados.

---

## Consequences

### Positivas

- 13 testes voltam ao verde sem alterar codigo de producao.
- Pattern A vira referencia obrigatoria — citado em CLAUDE.md §9 + lessons-learned como variante de #14/#26/#38.
- Reduz cauda de tech-debt do cluster MP a zero (`.skip` count fica 0 em mini-player suite).
- Compara Pattern A com lesson #38 (ESM/CJS mix): ambos sao bugs de identidade — #38 sobre **modulo**, #206 sobre **objeto de contexto entre renders**.

### Negativas

- Test files ganham `// eslint-disable-next-line react-hooks/exhaustive-deps` em pelo menos 1 effect por arquivo refatorado. Disciplinado a test files, nao se propaga.
- Pattern B (imperative) requer cuidado com stale closures — pode confundir devs novos.

### Neutras

- Codigo de producao zero impacto. ADR e 100% sobre disciplina de teste.
- Lesson #14 (require → await import) e Lesson #26 (Vitest 4 ESM) continuam aplicaveis para outros arquivos — esta ADR cobre o terceiro modo de falha do mesmo cluster.

---

## Adoption Plan

1. **Criar ADR-206** (este arquivo) — sprint MP3.3 MUST.
2. **Pattern A** aplicado em 3 arquivos de teste (RF-A1):
   - `retryCurrent.race-lock.test.tsx`
   - `onboarding-help-interaction.test.tsx`
   - `keyboard-shortcuts-input-gate.test.tsx`
3. **Adicionar entrada em CLAUDE.md §9 (Lessons Learned)** apontando para esta ADR — referencia operacional.
4. **Diagrama** em `Docs/architecture/diagrams/mini-player-3-3/test-useeffect-ctx-anti-pattern.mermaid` (sequencia "bug → fix").
5. **Validacao final:** `npx vitest run tests/client/mini-player/` sem `.skip`, sem OOM, cold start < 60s.

---

## Implementation Notes

### Quando aplicar Pattern A vs Pattern B

| Situacao | Pattern A | Pattern B |
|---|---|---|
| Test dispara 1 mutacao no mount e verifica state | `useRef + [] deps` |  |
| Test precisa multiplos comandos em ordem temporal | | `act(async () => {...})` |
| Test verifica re-renders apos mutacao | | `Capture` + reassignment |
| Test depende de timer/throttle do contexto | | `useFakeTimers` + `act` |

### Anti-patterns proibidos em test-harness do cluster MP

- `useEffect(..., [ctx])` onde ctx vem de `useAudioPlayer()` ou similar Context com `useMemo`-cached value.
- `useEffect(..., [ctx.playTrack])` — mesma armadilha, callback identity muda toda render.
- `useEffect(..., [])` **sem `useRef` flag** quando o effect dispara mutacao — funciona inicialmente mas se React StrictMode re-monta, dispara 2x.

### Detection via test (opcional follow-up)

Util `assertStableContextIdentity(renderResult, hookName)` que loga `ctx === prevCtx` apos cada `rerender` — pode virar helper em `tests/helpers/contextIdentity.ts`. Defer para MP3.4+ se regredir.

### Relacao com lesson #38

Lesson #38 e sobre **dois module records distintos** (ESM vs CJS) criando dois `createContext()` separados — `Provider` injeta no A, `useContext` le do B. ADR-206 e sobre **um unico Context** mas com valor que muda referencia entre renders. Ambos sao bugs de identidade, em camadas diferentes:

- Lesson #38 → identidade de **modulo** (resolvida padronizando estilo de import no arquivo de teste).
- ADR-206 → identidade de **objeto de contexto entre renders** (resolvida com `useRef` flag + deps `[]`).

Test files do cluster MP devem checar **ambos**:

1. Imports consistentes (`require()` OR `await import()` — nunca misturar).
2. Effects que mutam contexto usam Pattern A ou Pattern B (nunca `[ctx]` deps).

---

## Confianca

**Alta.** Pattern A ja foi validado pontualmente em lessons #14/#26 antes; ADR-206 formaliza para o cluster MP completo. Refactor barato e local — risco de regressao zero (codigo de producao nao muda).

## References

- Lesson #14 — `require()` em testes `.tsx` nao funciona com deps ESM
- Lesson #26 — Vitest 4 + `require()` em test .tsx para componente .tsx
- Lesson #38 — Mix `await import` + `require` cria 2 module records distintos
- Sprint Mini Player 3.3 spec — `Docs/specs/sprint-mini-player-3-3.md` (RF-A1)
- React docs — Rules of Hooks (exhaustive-deps lint behavior)
- React docs — `useMemo` identity guarantees between renders
