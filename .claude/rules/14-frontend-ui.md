---
description: Regras de frontend do Grindfy - tokens, hooks, Wouter, TanStack Query e padroes de UI
paths:
  - "client/src/**"
  - "tailwind.config.ts"
---

# Frontend

Convencao canonica: `Docs/conventions/ui-patterns.md` (18 secoes) e
`Docs/conventions/z-index.md`. O que segue e o resumo que a IA mais esquece.

## Nao invente valor visual

Espacamento, cor, tipografia, raio, sombra e motion saem de `@/lib/ui-tokens`.
Classe Tailwind com numero solto (`mt-[13px]`, `text-[#3af]`) e sinal de que o
token certo nao foi procurado.

Cor semantica: `tokens.color.<tom>` tem `bg/text/border`; `tokens.color.delta`
tem shape diferente (positivo/negativo/neutro) e **nao** entra em `ColorKey`
(lesson #22).

## Hooks primeiro

Todo hook antes de qualquer early return (Rules of Hooks, lesson #1). Estado que
precisa sobreviver a re-mount vai para o cache do React Query
(`setQueryData` + `enabled: false`), nao para `useState` (lesson #12).

## Dados

TanStack Query para estado de servidor. `apiRequest(method, url)` devolve **JSON
ja parseado**, nao `Response` (lesson #13). 404 de recurso opcional e "vazio", nao
erro na tela.

Secao secundaria que busca dado proprio (badge, contador) fica isolada em
ErrorBoundary local, para nao derrubar a pagina (lesson #29).

## Rotas

Wouter v3: `<Link href="/x"><a>...</a></Link>` **nao** duplica anchor (lesson #23).
CTA gerado no backend precisa casar com rota registrada em `App.tsx` — link para
rota inexistente cai em `<NotFound/>` sem erro no console (lesson #19).

## Formularios e modais

React Hook Form + Zod resolver. Modal vs Sheet vs Page tem arvore de decisao na
secao 8 do `ui-patterns.md`. Torneio tem **um unico** modal (secao 17); nao crie
outro.

## Componentes

shadcn/ui (Radix + CVA + `cn()`). Componente "decorativo" nao ganha acao default
que a spec nao pediu (lesson #11). Empty state e loading state seguem os padroes
das secoes 6 e 7 — nao invente placeholder proprio.

`data-testid` estavel em tudo que o teste precisa achar (lesson #2).

Player e midia: nunca assuma que o `ref` e o elemento de midia; faca query no
container apos render (lesson #20).

## Sem emoji em codigo

Hook bloqueia. Icone vem de `lucide-react`.
