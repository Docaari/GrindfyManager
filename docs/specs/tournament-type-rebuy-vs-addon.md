# T1 — Rebuy nao e Add-on (classificacao de tipo no import)

**Modelo e esforco:** Opus 5, `high` (zona critica: parser CSV + fonte do
historico + schema/migration).
**Origem:** sessao 2026-08-19, achado durante a Calculadora MTT (grade x ROI).
**ADR:** 251. **Migration:** 0101.

## Problema

O jogador aponta: "nem tem torneio add-on na CoinPoker". A Biblioteca discorda —
mostra 348 torneios CoinPoker do tipo `Add-on`, e 4307 no total.

Causa, em duas camadas empilhadas:

1. `shared/sharkscope-flags.ts:82` — a bandeira `Rebuy` do Sharkscope entra em
   `ADDON_KEYS` e liga `allowsAddOn = true`. Rebuy e add-on sao estruturas
   diferentes: rebuy recompra stack durante o periodo de rebuy; add-on e a
   compra unica no intervalo. Sao independentes (existe torneio so-rebuy,
   so-add-on e rebuy+add-on).
2. `shared/sharkscope-flags.ts:159` — `allowsAddOn` promove o torneio a
   `primaryType = "Add-on"`. Um ATRIBUTO vira TIPO. Um MTT comum de $25 com
   rebuy deixa de ser Vanilla.

### Evidencia (banco local, USER-0005)

| Consulta | Resultado |
|---|---|
| Linhas com `type='Add-on'` | 4307 |
| Delas, com `"plus"` no nome | 0 |
| Delas, com `allows_addon = true` | 4307 |
| Delas, com token `Rebuy` em `flags` | 4307 |
| Linhas com qualquer token `add*` em `flags` | 0 |

Distribuicao: 888Poker 1422, iPoker 1146, Revolution 823, Chico 567,
CoinPoker 348, PokerStars 1.

Ou seja: **nao existe um unico torneio add-on real no historico**. Todo
`Add-on` gravado e um rebuy mal classificado. O `flags` cru foi preservado em
100% das linhas, entao a correcao do dado e deterministica, nao heuristica.

### Impacto

Passa de longe da calculadora. `type` alimenta a familia da Biblioteca de
Torneios (ROI por tipo), o dashboard por tipo, o Tournament Selector e o
contexto do Coach. Um quarto do historico deste jogador esta na categoria
errada, e a metrica nao parece errada — o pior modo de falha (regra de produto:
"numero errado perde para numero ausente").

## Decisao do founder

Opcao (a): **torneio com rebuy volta a ser `Vanilla`**; a capacidade de rebuy
vira atributo proprio (`allowsRebuy`), como ja sao `allowsAddOn` e
`allowsReentry`. `Add-on` como TIPO passa a significar apenas o torneio cuja
estrutura e definida pelo add-on.

## Requisitos

**RF-01** — `parseSharkscopeFlags` ganha `allowsRebuy: boolean`. Tokens
`rebuy`/`rebuys` ligam SO `allowsRebuy`. `addon`/`addons` ligam SO
`allowsAddOn`. `rebuyaddon` liga os dois.

**RF-02** — `primaryType` nao e mais derivado de `allowsRebuy`. A precedencia
segue `Satellite > Mystery > PKO > Add-on`, com `Add-on` agora dependendo de
bandeira de add-on de verdade. Torneio so-rebuy devolve `primaryType = null`
(o caller mantem o que veio do nome, tipicamente `Vanilla`).

**RF-03** — `allowsRebuy` persiste: coluna `tournaments.allows_rebuy` (boolean,
default false, nullable-safe), preenchida pelo parser e pelo mapper de insert.

**RF-04** — Backfill deterministico das linhas existentes (migration 0101):
linha com `type = 'Add-on'` cujo `flags` contem `Rebuy` e NAO contem token de
add-on recebe `allows_rebuy = true`, `allows_addon = false` e
`type`/`category` reclassificados. O tipo novo respeita a precedencia: se as
flags indicam Satellite/Mystery/Bounty, usa esse; senao `Vanilla`.

**RF-05** — Rollback (`0101_..._rollback.sql`) devolve `allows_addon = true` e
`type = 'Add-on'` para as linhas tocadas e derruba a coluna. Reversivel porque
`flags` continua intacto — ele e a fonte de verdade da reconstrucao.

## Nao faz parte

- Criar tipo `Rebuy` no vocabulario (seria a opcao (c) — recusada).
- Mexer em `detectAddonReaFromName` (o detector de nome nunca produziu esses
  4307; `PLUS_REGEX` esta correto e fica como esta).
- Reprocessar CSVs ja importados.

## Testes legados afetados

Duas assercoes codificam o comportamento que estamos corrigindo e mudam junto
(sinalizado ao founder antes de tocar):

- `tests/unit/import-otimizacao/sharkscope-flags.test.ts:45` — "Rebuy marca
  allowsAddOn e (sem sinal mais forte) tipo Add-on".
- `tests/unit/import-otimizacao/sharkscope-parse-contract.test.ts:76` —
  `expect(sat.allowsAddOn).toBe(true); // Rebuy`.

## Gate de fechamento

Alem de `npm run check` + suites verdes: **prova no dado real** — rodar o
backfill no banco local e conferir que a Biblioteca da CoinPoker deixa de
mostrar familias `Add-on`, com a contagem antes/depois na mao.
