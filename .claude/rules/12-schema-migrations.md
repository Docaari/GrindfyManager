---
description: Regras de schema Drizzle, migrations e pendencias de producao no Grindfy
paths:
  - "shared/schema.ts"
  - "migrations/**"
  - "drizzle.config.ts"
  - "server/storage.ts"
  - "server/storage/**"
---

# Zona critica: schema e migrations

Indice de tabelas e convencoes: `Docs/architecture/data-model-index.md`.

## Regras de schema

- IDs via `nanoid()`, nunca auto-increment. User: `USER-XXXX`.
- Coluna nova nasce **nullable e sem default** quando o back-fill nao e trivial
  (lesson #7). Deprecacao e gradual: Zod `optional + default` + back-fill no
  storage, nunca required puro de uma vez.
- Enum de dominio pequeno fica em Zod, sem CHECK no banco — mudar CHECK exige
  migration; mudar Zod nao.
- UNIQUE e a ferramenta de idempotencia (`(user_id, week_start_date)`,
  `(user_id, report_type, period_start)`). Prefira UNIQUE + `ON CONFLICT` a
  checagem no app.
- FK: seguimos ownership no app quando a tabela e satelite; quando declarar FK,
  declare tambem o `ON DELETE`.
- Array de string em JSONB: `jsonb_array - 'valor'` **nao funciona** — use
  `jsonb_agg` com filtro (lesson #33).

## Migrations

Toda migration nasce com par: `NNNN_nome.sql` + `NNNN_nome_rollback.sql`.
Additive-only por padrao. Aplicar no local (psql, porta 5433), testar, e
**registrar como PENDENTE PROD** no `CLAUDE.md` com a consequencia de nao aplicar
("sem ela, `X` quebra com `column ... does not exist`").

`db:push` em producao exige pedido explicito do founder (Artigo IX). Em dev e
liberado.

Migration com back-fill e `xhigh`: escreva o `SELECT` que conta as linhas afetadas
antes do `UPDATE`.

## Pendencias abertas em PROD

A lista viva esta na secao 6 do `CLAUDE.md`. No momento da criacao deste arquivo
havia migrations aplicadas so no local (0086-0089, 0091-0094) e ao menos uma nao
aplicada em lugar nenhum (0090). Antes de escrever migration nova:

1. Confira o maior numero existente em `migrations/`.
2. Confira se a anterior ja foi aplicada no local.
3. Nao renumere migration ja aplicada.

## Storage

Query nova mora no storage, nao no route. Dominio grande ganha
`server/storage/<dominio>Storage.ts` com attach pattern.

Metodo que participa de transacao aceita `tx?` como ultimo argumento e **nao
recebe `tx` quando `undefined`** — teste inspeciona aridade (lesson #32). Handler
que precisa ser testavel aceita `injectedStorage?` (lesson #34).

Modulo de storage testado com `drizzle-orm` mockado parcialmente **nao** importa
`@shared/schema` no topo: carregue a tabela lazy com fallback (lesson #36).
