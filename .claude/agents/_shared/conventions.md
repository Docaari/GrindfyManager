# Shared Conventions — Agentes Grindfy

Conteudo comum aos 7 agentes do pipeline. Referenciado por: `pm-spec`, `system-architect`, `test-writer`, `implementer`, `reviewer`, `deployer`, `strategist`.

---

## Pipeline Padrao

```
🎯 PM-Spec → 📐 System-Architect → 🧪 Test-Writer → ⚙️ Implementer → 🔍 Reviewer → 🚀 Deployer
```

Cada agente tem 1 responsabilidade. Nao acumule papel.

---

## Fontes de Informacao (ordem de leitura)

1. **CLAUDE.md** — stack, convencoes, lessons-learned (ponteiros)
2. **Spec da feature** — `Docs/specs/[feature].md`
3. **Arquitetura** — `Docs/architecture/` (data-model, ADRs, flows)
4. **API endpoints** — `Docs/api/endpoints-index.md` (lookup) + `endpoints.md` (detalhe)
5. **Lessons learned** — `Docs/architecture/lessons-learned.md` (consultar antes de feature similar)
6. **Codigo existente** — para padroes ja estabelecidos

Se algo faltar, sinalize ANTES de prosseguir. Nao invente.

---

## Convencoes do Projeto (rapido)

- **Codigo:** ingles. **UI:** PT-BR.
- **IDs:** `nanoid()`, nunca auto-increment. User IDs: `USER-XXXX`.
- **Schemas:** Drizzle + drizzle-zod em `shared/schema.ts`.
- **Storage:** queries via `storage.ts` (camada de abstracao).
- **Auth:** middleware `requireAuth` (JWT) + `requirePermission(name)`.
- **Validacao:** `schema.parse(req.body)` ANTES de operacoes.
- **Errors:** `try/catch` + `console.error` + `res.status(N).json({message})`.
- **Frontend state servidor:** TanStack Query.
- **Frontend forms:** React Hook Form + Zod.
- **Path aliases:** `@/` = `client/src/`, `@shared/` = `shared/`.
- **Componentes:** shadcn/ui (Radix + CVA + Tailwind + `cn()`).

---

## Anti-Padroes a Evitar (top 12)

Catalogo completo em `Docs/architecture/lessons-learned.md`. TL;DR:

1. Hooks SEMPRE antes de early return (Rules of Hooks).
2. Tests com `data-testid` estavel — heuristicas DOM forcam workarounds em prod.
3. Mocks idealizados escondem bugs CRITICAL — validar shape REAL do storage.
4. Vitest 4: `test.projects` + `oxc.jsx` + polyfills Radix em `tests/setup.ts`.
5. `vi.fn()` nao eh constructor — try/catch fallback para mockar SDKs.
6. Conversao de moeda: SEMPRE normalizar para USD antes de comparar com thresholds USD.
7. Schema deprecation gradual: Zod `optional + default` + back-fill no storage.
8. Length de enum em test eh anti-pattern — validar presenca individual.
9. Try/catch generico engole erros — logue antes de fallback. Distinga "no rows" de "DB explodiu".
10. DRY de prompts — divergencia silenciosa quebra cache da Anthropic.
11. Default minimo em componentes — spec eh fonte de verdade. Componentes "decorativos" NAO ganham acoes default.
12. Estado persistente: React Query cache (`setQueryData` + `enabled: false`) sobrevive a re-mount; `useState` local nao.

---

## Output Padrao

Cada agente reporta ao final:

- **O que foi feito** (1-3 bullets concisos).
- **Arquivos criados/modificados** (lista).
- **Testes:** quantidade green/red/todo (se aplicavel).
- **Pendencias** (se ha trabalho deixado para o proximo agente).
- **Why** (motivo da decisao, se houve trade-off).
- **How to apply** (instrucao para proximo agente / sessao).

---

## Politica de Deploy

NAO invocar `deployer` sem pedido EXPLICITO do founder. Ver `memory/deploy_strategy_2026-04-24.md`. Default: manter local.

---

## Politica de Commits

- Criar commit so quando user pedir. Default = nao commitar.
- Mensagem: Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- Co-authored-by trailer no formato Claude.
- Nunca `--no-verify`. Hook que falha = fix.
