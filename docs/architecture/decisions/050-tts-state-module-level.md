# ADR-050: TTS state em module-level singleton (nao Context, nao Zustand)

## Status
Aceito — 2026-04-27

## Context

A feature **Alarmes 2.0 — TTS** precisa de state global compartilhado entre `fireAlert.ts`, hook de cancel (`stopAlertById`/`stopAllAlerts`), e listener de keyboard (Esc/Space — RF-14):

```ts
let _currentlySpeaking: QueueItem | null;
let _queue: QueueItem[];
const _alertTimeouts: Map<string, number>;
let _ttsUnavailableNotified: boolean;
```

Caracteristicas do state:
- **Singleton de browser** — so ha **um** `window.speechSynthesis`. State multi-instancia nao faria sentido.
- **Nao precisa re-renderizar React** — state e operacional (queue/timeouts). UI re-render baseia-se em props (`alert.id`, `alert.label`) que ja vem de `SessionAlertManager`.
- **Cleanup obrigatorio** entre tests — `_currentlySpeaking` persistente entre testes vaza state.
- **Lifecycle de modulo** = lifecycle da app (loaded uma vez, vive ate unmount global).

Tres opcoes arquiteturais:
1. **Module-level singleton** — `let _currentlySpeaking` em `narrationQueue.ts`.
2. **React Context** — `<TTSContext.Provider>` no root + `useTTSContext` hook.
3. **Zustand store** — `create<TTSState>(set => ({ ... }))`.

## Decision

**State em module-level singleton em `client/src/lib/tts/narrationQueue.ts`.**

Estrutura:
```ts
// narrationQueue.ts
type QueueItem = { alertId: string; priority: 'high'|'normal'; text: string; ... };

let _currentlySpeaking: QueueItem | null = null;
let _queue: QueueItem[] = [];
const _alertTimeouts: Map<string, number> = new Map();
let _ttsUnavailableNotified = false;

export function enqueue(item: QueueItem) { ... }
export function stopAlertById(id: string) { ... }
export function stopAllAlerts() { ... }
export function _promoteNext() { ... }

// CRITICAL — exposed for Vitest reset between tests
export function __resetForTesting() {
  _currentlySpeaking = null;
  _queue = [];
  _alertTimeouts.forEach(clearTimeout);
  _alertTimeouts.clear();
  _ttsUnavailableNotified = false;
}
```

Acesso via funcoes exportadas — **nunca** export `let _foo` direto (impede mutacao external e melhora encapsulamento).

`fireAlert.ts` consome via:
```ts
import { enqueue, stopAlertById, stopAllAlerts } from './tts/narrationQueue';
```

`GrindSessionLive.tsx` consome via mesma API (sem hook, sem Provider).

`tests/setup.ts` chama `__resetForTesting()` em `beforeEach` global para todos tests do modulo.

## Options Considered

### Opcao 1: Module-level singleton (ESCOLHIDA)
- **Pros:**
  - **Zero overhead** — sem Provider tree, sem rerenders, sem subscribe/unsubscribe.
  - **Match natural com `speechSynthesis`** — global do browser, global no codigo.
  - **API simples** — funcoes exportadas, sem hook obrigatorio.
  - **Bundle size minimo** — sem dependency nova.
  - **Funciona fora de componentes React** — `keydown` listener em `useEffect` chama `stopAllAlerts()` direto.
- **Contras:**
  - **Singleton entre tests** — `_currentlySpeaking` setado em test A persiste em test B se nao resetado. Exige `__resetForTesting()` exposto + chamada em `beforeEach`.
  - **DevTools nao monitora** — sem Redux/Zustand DevTools panel.
  - **Mock complexo** — para mockar comportamento da queue inteira em test, precisa mockar funcoes individuais ou o modulo inteiro via `vi.mock('./narrationQueue')`.
  - **Hot reload** — em dev, edicao do `narrationQueue.ts` pode preservar state inconsistente. HMR aceita reset manual via console se preciso.

### Opcao 2: React Context
- **Pros:**
  - Padrao React idiomatico.
  - DevTools React mostra valor.
  - Funciona com SSR (apesar de TTS ser browser-only).
- **Contras:**
  - **Over-engineering** — audio e singleton browser; nao ha n consumidores diferentes.
  - **Provider obrigatorio no root** — qualquer mount fora do Provider quebra.
  - **`stopAllAlerts` sem hook** — acessar de listener global (`window.addEventListener('keydown')`) exige ref escape ou subscriber externo.
  - **Re-renders** — mudanca em `_currentlySpeaking` re-renderizaria toda subtree do Provider, mesmo que UI nao precise.
  - **Mutacao via `set` requer wrapping** — codigo mais verboso.

### Opcao 3: Zustand store
- **Pros:**
  - DevTools.
  - Subscribe selectors granulares (sem re-render desnecessario).
  - Funciona fora de componentes React via `store.getState()`.
  - API limpa — `useTTSStore(s => s.queue)` em componentes.
- **Contras:**
  - **Dependency nova** — Grindfy nao tem Zustand hoje. Stack atual: TanStack Query + React Hook Form + Wouter + Context. Adicionar Zustand exige justificativa forte (= regra de simplicidade).
  - **Complexidade adicional** — para 3 vars + 2 funcoes, Zustand e overkill.
  - **Aprendizado da equipe** — toda equipe precisaria aprender Zustand para 1 modulo.
  - **Reset entre tests** ainda exige helper (mesma complexidade da opcao 1).

## Consequences

### Positivas
- **Simplicidade** — 3 vars + 4 funcoes em 1 arquivo. Codigo total <150 linhas.
- **Sem dependencia nova** — bundle, package.json, mental model.
- **Performance** — zero overhead React. `speechSynthesis.cancel()` chamado direto sem reconciliation.
- **API limpa** — `enqueue()`, `stopAlertById()`, `stopAllAlerts()` consumidas onde precisar.
- **Funciona em qualquer contexto** — listener de window, useEffect, callback de toast onClose, etc.

### Negativas
- **Risco de leak entre tests** — alta probabilidade de bug se test-writer esquecer `__resetForTesting()` no `beforeEach`. Mitigacao: documentar no README do modulo + adicionar global reset em `tests/setup.ts`.
- **Sem DevTools React/Redux** — debug de queue precisa `console.log` ou breakpoint. Tooling local fix.
- **Mock complexo em integration tests** — `vi.mock('./narrationQueue')` ou stub de `speechSynthesis`. Test-writer precisa atencao.

### Neutras
- Acessivel de qualquer lugar — bom para listeners globais (Esc/Space), perigoso para state que nao deve ser global.
- Pattern alinhado com `_ttsUnavailableNotified` flag (ja module-level no design).

## Disciplina obrigatoria

Para evitar pegadinhas:

1. **`__resetForTesting()` exposto** — sempre. Documentar como **API privada** (prefixo `__`).
2. **`tests/setup.ts` adiciona `beforeEach`**:
   ```ts
   import { __resetForTesting as resetTTS } from '@/lib/tts/narrationQueue';
   beforeEach(() => resetTTS());
   ```
3. **Nunca exportar `let _foo` direto** — apenas funcoes que acessam.
4. **Cleanup em hot reload** — se HMR rodar e state ficar inconsistente em dev, doc menciona "reload page".
5. **Listener de `beforeunload`** chama `stopAllAlerts()` (defesa contra TTS continuar tocando apos navegacao).

## Reavaliar quando (gatilhos para v2)
- Multiplas queues simultaneas (improvavel — `speechSynthesis` e singleton).
- TTS em mais paginas (Coach, Cooldown) com policies diferentes — pode justificar Context para escopar por rota.
- Bug recorrente de state leak entre tests — reavaliar Zustand com store inicializavel.

## Confianca
Alta. Decisao alinhada com a natureza singleton do `speechSynthesis`. Custo aceito (`__resetForTesting`) e mitigado por convencao de tests.

## Referencias
- Spec: `Docs/specs/alarmes-2-0-tts.md` (RF-13 — state model + RF-14 keyboard listener)
- ADR-048 (priority queue — host do state)
- Lessons learned aplicaveis: `Docs/architecture/lessons-learned.md#testing` (reset entre tests + `__resetForTesting`)
- Pattern similar: `_ttsUnavailableNotified` em `fireAlert.ts` (module flag de toast 1x sessao)
