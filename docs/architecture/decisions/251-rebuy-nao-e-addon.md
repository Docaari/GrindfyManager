# ADR-251 — Rebuy e atributo proprio, nao o tipo "Add-on"

- **Status:** Accepted
- **Data:** 2026-08-19
- **Contexto do achado:** sessao da Calculadora MTT (grade x ROI da Biblioteca)
- **Spec:** `Docs/specs/tournament-type-rebuy-vs-addon.md`
- **Migration:** 0101 · **Substitui parcialmente:** ADR-031 (extensao 2026-05-06,
  que introduziu `Add-on` como tipo primario) e ADR-014 (detector add-on/ReA)

## Contexto

`shared/sharkscope-flags.ts` mapeia as bandeiras do export do Sharkscope para os
campos do torneio. Desde a extensao do ADR-031 a bandeira `Rebuy` faz duas
coisas: liga `allowsAddOn` e, por consequencia, promove o torneio ao tipo
primario `Add-on`.

No historico real do founder isso classificou 4307 torneios como `Add-on` —
todos rebuy, nenhum add-on de verdade (verificado: zero linhas com token `add*`
em `flags`). Um quarto do historico dele caiu na categoria errada, e o erro se
propaga para a familia da Biblioteca, o ROI por tipo, o dashboard, o Selector e
o contexto do Coach.

O erro so apareceu quando a Calculadora MTT tentou casar a grade ("Vanilla $25
CoinPoker") com o historico ("Add-on $25 CoinPoker") e o casamento falhou.

## Decisao

**Rebuy e add-on sao atributos independentes, e nenhum atributo define o tipo
primario sozinho.**

1. `allowsRebuy` passa a existir como campo proprio, ao lado de `allowsAddOn` e
   `allowsReentry`, com coluna dedicada em `tournaments`.
2. `Rebuy` liga apenas `allowsRebuy`. `Add-On` liga apenas `allowsAddOn`.
   `Rebuy-AddOn` liga os dois.
3. O tipo primario continua sendo derivado por precedencia
   (`Satellite > Mystery > PKO > Add-on`), mas `Add-on` agora exige bandeira de
   add-on real. Torneio so-rebuy nao sugere tipo: devolve `null` e o caller
   mantem o tipo vindo do nome (na pratica `Vanilla`).
4. O dado existente e corrigido por backfill deterministico, usando a coluna
   `flags` — que preservou o token original em 100% das linhas.

## Alternativas descartadas

**Manter `Add-on` e so renomear o rotulo na UI para "Rebuy/Add-on".** Barato e
sem migration, mas continua misturando duas estruturas na mesma familia de ROI:
o jogador compararia o retorno de torneios que se comportam de forma diferente
como se fossem o mesmo produto.

**Criar um tipo primario `Rebuy`.** Mais fiel a realidade, porem amplia o
vocabulario de tipos, que hoje atravessa schema, filtros da Biblioteca,
Selector, scoring e prompts do Coach. Um atributo booleano entrega a mesma
informacao sem esse custo — e "permite rebuy" e mesmo uma caracteristica, nao
uma categoria de produto: um PKO com rebuy continua sendo um PKO.

## Consequencias

- A Biblioteca deixa de exibir familias `Add-on` para 888Poker, iPoker,
  Revolution, Chico e CoinPoker; essas familias voltam para `Vanilla` (ou para
  o tipo que as bandeiras indicarem). **Os numeros de ROI por tipo mudam** — e
  passam a estar certos.
- `familyKey` da Biblioteca inclui o tipo, entao as chaves dessas familias
  mudam. Highlights salvos que apontam para uma chave antiga deixam de casar.
  Aceito: a chave antiga descrevia uma classificacao errada.
- Reversivel enquanto `flags` existir. O rollback reconstroi o estado anterior
  a partir dele.
- `allowsRebuy` fica disponivel como filtro/coluna, mas nenhuma superficie o
  consome ainda — isso e trabalho seguinte, nao deste ADR.
