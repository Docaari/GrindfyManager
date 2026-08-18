---
description: Regras de teste no Grindfy - Vitest 4, projects node/jsdom, mocks e armadilhas conhecidas
paths:
  - "tests/**"
  - "vitest.config.ts"
---

# Testes

Catalogo completo: `Docs/architecture/lessons-learned.md` secao Testing.
Aqui so o que ja quebrou mais de uma vez.

## Config

Vitest 4 com `test.projects`: `.test.ts` roda em **node**, `.test.tsx` em
**jsdom**. Precisa de `oxc.jsx` e dos polyfills Radix em `tests/setup.ts`.

Hook test (`renderHook`) precisa de jsdom mesmo sendo `.test.ts` — isso e ajuste
de **config** (`tests/hooks/**` no projeto client), nao giria no teste
(lesson #30).

## Import em teste de componente

- Use `await import(...)`. **Nunca `require(...)`** em `.test.tsx` — deps ESM
  quebram (lessons #14, #26).
- Nunca misture `await import` e `require` no mesmo arquivo quando houver React
  Context: viram dois module records, dois contextos, e o Provider injeta num
  enquanto o hook le do outro (lesson #38).
- `vi.mock` intercepta o **caminho exato** do import. Se o teste mocka
  `@/components/a/X` e o codigo importa `@/components/b/X`, crie re-export
  (lesson #28).
- `const spy = vi.fn()` + `vi.mock` no topo quebra por hoisting: use
  `vi.hoisted` (lesson #14).
- `vi.unmock` dentro de `it(...)` e hoisted e afeta o arquivo inteiro — use
  `vi.doUnmock` (lesson #15).

## Mocks

Mock com o shape **real** do storage. Mock idealizado escondeu tres bugs CRITICAL
de uma vez (lesson #3) e mock que ignora o `WHERE` deixou passar bug de
elegibilidade.

`vi.fn()` nao e constructor: para SDK que usa `new`, envolva em try/catch com
fallback de factory (lessons #5, #35). Mock parcial de `drizzle-orm` precisa
incluir `relations` (lesson #36).

## Asserts

- `data-testid` estavel; nunca heuristica de DOM (lesson #2).
- Nome de teste diz **o que protege**, nao "caso 3".
- Nao asserte `enum.length` (lesson #8): valide presenca item a item.
- Radix Tabs responde a `onMouseDown`, nao a `fireEvent.click` (lesson #27).
- Componente com `useQuery` renderizado sem `QueryClientProvider` quebra: isole a
  parte que busca dado em ErrorBoundary local (lesson #29).

## Regras de processo

- `test-writer` nao implementa; `implementer` nao edita teste. Teste com
  contradicao logica vira observacao documentada, nao edicao silenciosa
  (lesson #25).
- Teste preso a data real quebra na virada do mes: congele o tempo.
- Nunca `git stash` no meio de TDD — ja custou arquivos de teste (lesson #18).
- Suite da area antes de fechar; suite inteira quando a mudanca e transversal;
  `npm run check` sempre.
