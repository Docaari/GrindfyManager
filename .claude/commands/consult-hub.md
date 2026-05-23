---
description: Consulta o Dev LLM Hub antes de feature MEDIUM+ — lê systems/grindfy.md + cards relevantes + últimos postcards do próprio SaaS.
---

Você está prestes a iniciar (ou está no meio de) uma feature em **Grindfy**. Consulte o Dev LLM Hub antes de propor design/implementação.

## Passos obrigatórios

### 1. Perfil do próprio SaaS
Leia `B:\Dev LLM\systems\grindfy.md`. Anote:
- Stack atual (versões — Vitest 4.1, Drizzle 0.45, etc.)
- Restrições não-óbvias (item §"Restrições não-óbvias")
- Bandeiras vermelhas top (5 anti-patterns)

### 2. Catálogo por domínio
Pergunte ao usuário (se ainda não souber): qual o **domínio** da feature?

Opções (subpastas de `B:\Dev LLM\catalog\`):
`ai-collaboration` · `anthropic-sdk` · `auth` · `billing-stripe` · `deployment` · `drizzle` · `financial-precision` · `multi-tenancy` · `observability` · `prisma` · `security` · `testing`

Use `Glob` para listar `B:\Dev LLM\catalog\<dominio>\*.md`. Leia os 1-3 cards mais relevantes (decida pelo título).

### 3. Aprendizados recentes do próprio Grindfy
Use `Glob` para listar `B:\Dev LLM\exchanges\grindfy\learnings\*.md`. Leia os 5 mais recentes (ordene por nome — datas em ISO).

### 4. Lessons-learned cross-SaaS
Leia `B:\Dev LLM\LESSONS-LEARNED.md` apenas a Categoria relevante ao domínio (A=pipeline, B=ts/build, C=schema, D=multi-tenancy/security, E=frontend, F=observability, G=docs, H=ai-cost, I=deploy).

## Output esperado

Devolva sumário em chat com:

```
## Consulta hub para feature: <título da feature>

### Restrições do próprio Grindfy (≤3 bullets relevantes)
- ...

### Cards do catálogo aplicáveis (1-3 com link)
- catalog/<d>/<card>.md — <1 linha do que oferece>

### Postcards recentes do Grindfy (≤5)
- learnings/<arquivo>.md — <título>

### Anti-patterns top da Categoria (2-3 com X.N)
- X.N. <título> — <fix em 1 linha>

### Recomendação inicial
3-5 bullets de "considere isso" para o usuário decidir antes de você começar.
```

## Princípios

- **Não invente nada que não estiver nos arquivos**. Se não achou card relevante, diga "nenhum card encontrado em <domínio>; aplicar padrão genérico".
- **Se a feature é ZERO/LOW**, este comando é overkill — avise o usuário e pergunte se ele quer prosseguir.
- **Após a feature**, lembre o usuário de rodar `/post-learning` se descobriu algo digno de postcard.
