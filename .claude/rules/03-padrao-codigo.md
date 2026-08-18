---
description: Nomes, idioma, tratamento de erro, validacao e comentarios no codigo do Grindfy
---

# Padrao de codigo

Molde executavel: `Docs/padrao/exemplo-padrao.ts` (`npx tsx` roda, 15/15).
Pedido forte: "escreva no padrao de `Docs/padrao/exemplo-padrao.ts`".

## Idioma

Identificador, tabela, coluna, tipo, nome de teste: **ingles**. Texto visivel ao
jogador: **PT-BR**. A fronteira nao se negocia — sem ela a base vira portugues
pela metade.

## Nomes

- Funcao: verbo (`resolveEligiblePlanTier`, `computeReportCost`).
- Booleano: pergunta/estado (`isProPlusEligible`, `hasRecentTicketNotif`).
- Constante: MAIUSCULA (`PRO_PLANS`, `REPORT_DISCLAIMER`).
- Export so-para-teste: prefixo `_` (`_resetForTests`).
- Proibidos: `data`, `info`, `temp`, `aux`, `x`, `process`, `handle` sozinho.
- Em arquivo grande, `grep` o nome antes de declarar (lesson #17: `const profile`
  redeclarado so quebrou em runtime).

## Falhar alto

1. `catch {}` vazio e proibido. Log antes de qualquer fallback; distinga
   "no rows" de "DB explodiu" (lesson #9).
2. Fallback silencioso e proibido: `?? 0` em dinheiro, `?? 1` em cotacao,
   `|| []` em lista que deveria existir.
3. Ausencia de dado devolve `null` + razao nomeada, nunca zero inventado. Padrao:
   `{ value: null, degradedReason: 'fx_rate_missing', warnings: [...] }`.
4. Dado inconsistente recusa a operacao, nao segue torto.

## Rota — a ordem

`requireAuth` -> gate de permissao/tier -> `schema.parse(req.body)` -> storage.
Ownership no `where` da query, nunca so num `if`. Resposta: JSON direto, sem
wrapper. Erro: `console.error` + `res.status(N).json({ message })`.

## Storage

Toda query Drizzle mora em `storage*`. Metodo novo aceita `tx?` como ultimo
argumento opcional quando participa de transacao — e nao passa `tx` quando
`undefined` (aridade inspecionada por teste, lesson #32).
Handler testavel aceita `injectedStorage?` como 3o argumento, com lazy import em
producao (lesson #34).

## Comentarios

Explicam **por que**; o que ja esta no codigo. Bug corrigido ganha uma linha
apontando o motivo, e a entrada completa vai para
`Docs/architecture/lessons-learned.md` na ordem **sintoma, causa, validacao**.

Sem emoji em arquivo de codigo (hook bloqueia).

## Antes de dar por pronto

1. `npm run check` limpo.
2. Suite da area verde; placar nao caiu.
3. Env nova documentada; nenhum segredo no codigo.
4. Zona critica tocada? Tinha spec.
5. Migration nova registrada como PENDENTE PROD, com `_rollback.sql`.
6. Mudanca visivel? Verificada no `:3000` **reiniciado** (servidor stale ja
   enganou o founder).
