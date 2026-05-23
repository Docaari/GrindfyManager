---
description: Registra um postcard no Dev LLM Hub (exchanges/grindfy/learnings/) após bug >2h, solução genérica, ou descoberta nova.
---

Você está fechando uma sessão / feature / debug em **Grindfy** e identificou algo digno de registro no hub.

## Passo 1 — Coleta com o usuário
Pergunte (em 1 mensagem, batch):

1. **Título** (3-7 palavras, kebab-case): ex `vi-mock-hoisting-quebra-const-spy`.
2. **Tags** (2-5, snake_case ou kebab-case, alinhadas com domínios de catalog/): ex `[vitest, mock, hoisting, tdz]`.
3. **Severity** (`trivia` / `low` / `medium` / `high` / `critical`).
4. **Time lost** (horas, numérico).
5. **Sintoma** (1 parágrafo curto).
6. **Causa raiz** (1 parágrafo curto).
7. **Fix** (snippet curto + link commit/PR se houver).
8. **Lição genérica** (1-2 linhas — regra/heurística para próxima vez).
9. **Links opcionais**: spec, ADR, postmortem, cards relacionados em catalog/.

## Passo 2 — Geração do postcard
Leia o template `B:\Dev LLM\ml-loop\session-postcard-template.md`. Crie o arquivo:

`B:\Dev LLM\exchanges\grindfy\learnings\YYYY-MM-DD-<titulo-kebab>.md`

Use a data de HOJE (ISO YYYY-MM-DD).

Frontmatter:
```yaml
---
name: <titulo-kebab>
saas: grindfy
date: YYYY-MM-DD
tags: [...]
severity: ...
time_lost: ...
promoted_to: ""
related_lesson: ""
---
```

Corpo: 5 seções (`## Sintoma`, `## Causa raiz`, `## Fix`, `## Lição`, `## Links`) com o conteúdo coletado.

## Passo 3 — Append em outbound.md
Adicione 1 linha ao final de `B:\Dev LLM\exchanges\grindfy\outbound.md`:

```
YYYY-MM-DD · postcard · learnings/YYYY-MM-DD-<titulo-kebab>.md · <lição em 1 linha>
```

## Passo 4 — Sugestão final
Devolva ao usuário:

```
✓ Postcard criado: exchanges/grindfy/learnings/YYYY-MM-DD-<titulo-kebab>.md

Próximo:
- Se você desconfia que outro SaaS (Lifely / SaaS Contador / New Nash) já passou por isso ou está vulnerável, rode /curate-hub em B:\Dev LLM ou peça ao agente do outro SaaS para registrar postcard similar — a regra-2-ocorrências promove para catalog/<domínio>/ automaticamente.
- Se severity ≥ high, considere criar postmortem completo em B:\grindfy\Docs\postmortems\ (postcard é resumo; postmortem é narrativa).
```

## Princípios

- **Postcard ≠ postmortem**. Limite 1 página. Se precisar de narrativa longa, é postmortem.
- **Lição é o ouro**. Sintoma/causa/fix são "isso aconteceu"; lição é "o que muda na próxima vez".
- **Não invente tags**. Use as existentes em catalog/ — facilita match no curador.
- **Se você não consegue articular a lição genérica em 1-2 linhas**, talvez não seja postcard ainda — pode ser bug específico sem padrão.
