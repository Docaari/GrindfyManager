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

## Convencoes e anti-padroes — fonte unica

NAO duplicar regra aqui. A fonte e:

| Assunto | Arquivo |
|---|---|
| Principios inegociaveis | `CONSTITUICAO.md` |
| Produto e prioridade | `.claude/rules/00-produto.md` |
| Pilha, dinheiro, concorrencia, env | `.claude/rules/01-tecnologia.md` |
| Onde cada coisa mora | `.claude/rules/02-estrutura.md` |
| Nomes, erros, validacao, idioma | `.claude/rules/03-padrao-codigo.md` |
| Modelo e esforco por tarefa | `.claude/rules/04-modelo-e-esforco.md` |
| Fonte do historico, FX, parser CSV | `.claude/rules/10-dominio-dados.md` |
| Coach AI (prompt, cache, tier, jobs) | `.claude/rules/11-coach-ia.md` |
| Schema e migrations | `.claude/rules/12-schema-migrations.md` |
| Testes (Vitest 4, mocks, imports) | `.claude/rules/13-testes.md` |
| Frontend (tokens, hooks, Wouter) | `.claude/rules/14-frontend-ui.md` |
| Rotas Express (ordem, auth, upload) | `.claude/rules/15-rotas-express.md` |
| Molde de codigo executavel | `Docs/padrao/exemplo-padrao.ts` |
| Catalogo completo de erros | `Docs/architecture/lessons-learned.md` |

Este arquivo antes repetia as convencoes e os 12 anti-padroes. Foi esvaziado de
proposito: mesma verdade em dois lugares diverge (Artigo V). Se a regra mudar,
muda no `rules/`.

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
