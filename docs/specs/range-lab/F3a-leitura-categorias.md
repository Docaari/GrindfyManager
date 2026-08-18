# F3a — Leitura por categoria

> Sub-frente da [F3](F3-leitura.md), no [Range Lab](00-INDICE.md). Uma frente por
> sessao. O **porque** de cada decisao esta em
> [F3-detalhamento.md](F3-detalhamento.md); este documento e o **o que fazer**.

## Cabecalho
| | |
|---|---|
| **Modelo** | Opus 5 — Extra |
| **Depende de** | F1 (motor rapido + heroi-como-range). Nao depende da F3b |
| **Entrega** | O painel de leitura passa a dizer **o que o range tem**: categorias, textura, filtro que pinta a matriz, mao explicada por combo |
| **Migration** | nao |
| **Status** | Nao iniciada |

Zona critica tocada: **nenhuma** das sete listadas em
`.claude/rules/04-modelo-e-esforco.md` — nao ha parser CSV, FX, permissao, prompt
do Coach, schema nem ordem de rota. O `Extra` vem do volume de numero novo na
tela, nao de risco de dinheiro.

---

## Contexto minimo (para abrir a frio)

`/range-lab` tem tres paineis: range | bordo + veredito | **leitura**. O terceiro
esta vazio desde a F1 — hoje ele mostra so a `ComboTable`, que diz "ganha /
perde / chop" e uma equity que, no river, so pode ser 100%, 0% ou 50%.

O jogador ve **o resultado** e nao ve **a estrutura**: quantos flushes, quantos
top pares, quantos blefes, o que a carta dele bloqueia. E o que o Flopzilla faz
melhor que nos.

O que ja existe e vai ser usado:

| Peca | Onde | Serve para |
|---|---|---|
| `evaluate7` / `handCategory` | `client/src/lib/combo-calc/fastEvaluator.ts` | familia da mao (0..8) |
| `STRAIGHT_TOP` | idem | contar outs de sequencia sem escrever avaliador novo |
| `expandRangeV2` | `client/src/lib/combo-calc/engine/expand.ts` | combos vivos + massa + `emptyEntries` |
| `EngineResultOk.perHeroCombo` | `client/src/lib/combo-calc/engine/types.ts` | equity por combo do heroi |
| `RangeMatrix` | `client/src/components/range-lab/RangeMatrix.tsx` | a grade 13x13 que o filtro vai pintar |
| `heat` | `@/lib/ui-tokens` | gradiente ja fora de `tokens.color` |

---

## Decisoes herdadas (fechadas — nao reabrir)

| # | Decisao |
|---|---|
| D-F3-1 | Classificacao e modulo **puro**, `classify.ts`, entrada `(hole, board)`, **fora** do worker. Sao no maximo 1326 combos por lado e o resultado nao depende do tamanho da aposta |
| D-F3-2 | O avaliador da a **familia**; a subdivisao de par vem da **participacao das cartas do heroi**. Set e trinca tem a mesma forca e leitura oposta |
| D-F3-3 | Familia de forca (SF, quadra, full, flush, sequencia) fica com o nome mesmo quando a mesa joga, marcada `usesHoleCards: false`. Familia de par **exige** participacao; sem ela cai em `ace_high`/`no_pair` |
| D-F3-4 | `made` e **um** valor; `draws` e um **conjunto**. E a regra de sobreposicao virada tipo |
| D-F3-5 | Bordo de 5 cartas => `draws` sempre vazio |
| D-F3-6 | Draw so conta o que a mao do heroi **acrescenta** ao que a mesa ja da |
| D-F3-7 | Dentro da familia de draw ha exclusao (`fd_nut` XOR `fd` XOR `bdfd`; `oesd` XOR `gutshot` XOR `bdsd`); entre familias, acumula |
| D-F3-8 | Overcards so quando `made` e `no_pair` ou `ace_high` |
| D-F3-9 | Kicker em banda **absoluta**: `k_top` = A/K, `k_good` = Q/J/T, `k_weak` = 9 ou menor. Declarada na tela |
| D-F3-10 | Flush `nut`/`strong`/`weak` pela posicao entre as cartas **vivas** do naipe |
| D-F3-11 | A equity por categoria vem de `perVillainCombo`, campo novo e aditivo no `EngineResultOk` |
| D-F3-15 | Alem da banda, `nutKicker: boolean` = o kicker e o **maior rank ausente do bordo**. Em `A-K-Q`, `AJ` e o melhor kicker possivel de top par |
| D-F3-17 | A classificacao usa **`evaluateHand`** (5..7 cartas), nao `evaluate7` (exige 7 exatas, nao roda no flop nem no turn) |
| D-F3-18 | O acumulador do vilao no Monte Carlo carrega `hero.weight[h]` **explicitamente**. Espelho ingenuo do acumulador do heroi e proibido |
| D-F3-19 | `usesHoleCards` = "a categoria nomeada foi formada com >= 1 carta do heroi". Nada alem |
| D-F3-20 | `VillainComboResult` **nao** tem `evCall` nem `decision` |
| D-F3-21 | RF-03.8: heroi mao unica => tabela de combos do **vilao** com a mao do heroi no cabecalho; heroi range => duas listas, sem parear |
| D-F3-22 | Painel e filtro tem botao **heroi / vilao**, padrao vilao |

---

## RF-03.1: Decomposicao por categoria de mao

Agrupar os combos pelas 16 categorias de mao feita e pelas 8 tags de draw. Por
linha: **contagem de combos, massa ponderada e equity media** — as tres sempre
juntas (emenda A17).

**De qual lado** (D-F3-22): botao `heroi / vilao` no topo do painel, **padrao
vilao**. O `classify.ts` e agnostico de lado, entao servir os dois nao custa
matematica — so fiacao. O filtro do RF-03.7 pinta a matriz do lado selecionado.

### As 16 categorias de mao feita

`boardRanks` = ranks distintos do bordo, decrescente (`b0 > b1 > ...`).
`higherCount(r)` = quantos ranks do bordo sao estritamente maiores que `r`.

| # | id | rotulo PT-BR | Reconhecimento | Qualificador |
|---|---|---|---|---|
| 1 | `straight_flush` | Straight flush | familia 8 | — |
| 2 | `quads` | Quadra | familia 7 | — |
| 3 | `full_house` | Full house | familia 6 | — |
| 4 | `flush` | Flush | familia 5 | `nut` / `strong` / `weak` |
| 5 | `straight` | Sequencia | familia 4 | — |
| 6 | `set` | Set | familia 3 + par de bolso do rank presente no bordo | — |
| 7 | `trips` | Trinca | familia 3 + par no bordo, 1 carta do heroi no rank | kicker |
| 8 | `two_pair` | Dois pares | familia 2 com participacao do heroi | `top_two` / `top_bottom` / `bottom_two` / `with_board_pair` |
| 9 | `overpair` | Overpair | par de bolso `p` fora do bordo, `higherCount(p) == 0` | — |
| 10 | `top_pair` | Top par | 1 carta do heroi pareia `b0` | kicker |
| 11 | `second_pair` | 2o par | `higherCount(r) == 1` | kicker (nulo se de bolso) |
| 12 | `third_pair` | 3o par | `higherCount(r) == 2` | kicker (nulo se de bolso) |
| 13 | `weak_pair` | Par fraco (4o+) | `higherCount(r) >= 3` | kicker (nulo se de bolso) |
| 14 | `underpair` | Underpair | par de bolso abaixo de **todos** os ranks do bordo | — |
| 15 | `ace_high` | As alto | sem par proprio, heroi tem um A | — |
| 16 | `no_pair` | Sem par | sem par proprio, sem A na mao | — |

Cada leitura carrega tambem `usesHoleCards` e `fromPocketPair`.

### O algoritmo

**Qual avaliador** (D-F3-17): `evaluateHand(cards)` de `evaluator.ts`, que aceita
**5 a 7 cartas**. `evaluate7`/`loadBoard` do `fastEvaluator` exigem 7 exatas e
**nao rodam no flop (5) nem no turn (6)** — usar ele aqui era erro do primeiro
passe. `evaluateHand` e o mesmo oraculo da D4, entao o criterio de aceite 7 deixa
de comparar duas implementacoes e passa a verificar consistencia. Custo aceito: o
`evaluateHand` aloca `Map` por chamada, mas sao <= 1326 chamadas por lado,
memoizadas por `(range, bordo)`, **fora** do laco quente.

```
classifyMade(hole, board):
  fam = categoria de evaluateHand([...board, ...hole])   // 0..8, aceita 5..7 cartas

  fam 8 -> straight_flush
  fam 7 -> quads
  fam 6 -> full_house
  fam 5 -> flush + qualificador de nut
  fam 4 -> straight
  fam 3 -> par de bolso do rank presente no bordo   -> set
           bordo pareado + 1 carta do heroi no rank -> trips
           senao (a trinca inteira e da mesa)       -> passo de par
  fam 2 -> heroi participa de PELO MENOS UM dos dois pares ? two_pair + qualificador
                                                           : passo de par
  fam 1 -> passo de par
  fam 0 -> heroi tem A ? ace_high : no_pair

passo de par:
  se hole e par de bolso p, p fora do bordo:
     higherCount(p) == 0                  -> overpair
     higherCount(p) == boardRanks.length  -> underpair
     senao                                -> nth por higherCount(p), sem kicker
  senao se exatamente 1 carta do heroi tem rank r no bordo:
     nth por higherCount(r), kicker = a outra carta
  senao:                                  // o par e todo da mesa
     heroi tem A ? ace_high : no_pair     // usesHoleCards = false

nth: 0 -> top_pair · 1 -> second_pair · 2 -> third_pair · >=3 -> weak_pair
```

**Os tres casos que quebram a versao ingenua** (viram teste):

- `AK` em `Qh 7s 7d`: o avaliador diz familia 1 (par de setes). Mapear familia
  direto para categoria escreveria "2o par" — falso, o par e da mesa. O passo de
  par devolve **`ace_high`**.
- `88` em `Qh 7s 7d`: familia 2, e o heroi participa de **um** dos dois pares (o
  de bolso) -> **`two_pair`**, qualificador `with_board_pair`. A condicao
  "participa dos **dois** pares" reprovaria este caso e o mandaria para o passo de
  par, saindo `second_pair` — o oposto do criterio de aceite 2.
- `AK` em `7h 7s 7d`: familia 3 sem carta do heroi no rank. Nao e `trips` — a
  trinca e inteira da mesa. Cai no passo de par e sai **`ace_high`**.

### `usesHoleCards` — o que a flag significa

`usesHoleCards` = **a categoria nomeada foi formada com pelo menos uma carta do
heroi**. Nada alem disso.

- `AK` em `Q-7-7` -> `ace_high`, `usesHoleCards: true` (o as e dele).
- `23` em `5-6-7-8-9` -> `straight`, `usesHoleCards: false` — a mesa joga sozinha,
  e este e o caso que a flag existe para marcar.

A flag **nao** e "a melhor mao de 5 cartas usa carta minha", que e outra pergunta
e produziria `false` no primeiro exemplo. Duas perguntas parecidas, uma flag so:
se ela responder as duas, responde errado uma delas.

### Qualificadores

**Dois pares**, com `i < j` = posicoes dos ranks pareados dentro de `boardRanks`:

| Condicao | Qualificador |
|---|---|
| `i == 0 && j == 1` | `top_two` |
| `i == 0 && j > 1` | `top_bottom` |
| `i > 0` | `bottom_two` |
| par do heroi + par da mesa | `with_board_pair` |

**Kicker** (D-F3-9 + D-F3-15): banda absoluta `k_top` (A/K) · `k_good` (Q/J/T) ·
`k_weak` (9-), mais `nutKicker: true` quando o kicker e o maior rank **ausente do
bordo**. A tela escreve `Top par, kicker J (o melhor possivel neste bordo)`. A
banda aparece declarada como banda fixa — nao se disfarca de avaliacao GTO.

**Flush** (D-F3-10): posicao da maior carta do naipe do heroi entre as cartas
**vivas** daquele naipe (as que nao estao no bordo): 1a => `nut`, 2a-3a =>
`strong`, 4a+ => `weak`. `K` de copas e nut se o `A` de copas esta no bordo.

### As 8 tags de draw

Vazias no river (D-F3-5). So contam o que a mao acrescenta ao bordo (D-F3-6).

| id | rotulo | Reconhecimento | Rua |
|---|---|---|---|
| `fd_nut` | Flush draw nut | 4 do naipe, heroi contribui, carta dele e a maior viva do naipe | flop, turn |
| `fd` | Flush draw | 4 do naipe, heroi contribui | flop, turn |
| `bdfd` | Backdoor flush draw | 3 do naipe, heroi contribui | so flop |
| `oesd` | Open-ended / dupla gutshot | `straightOuts >= 2` acrescentados pelo heroi | flop, turn |
| `gutshot` | Gutshot | `straightOuts == 1` acrescentado pelo heroi | flop, turn |
| `bdsd` | Backdoor de sequencia | completa com 2 cartas, heroi contribui, sem oesd/gutshot | so flop |
| `overcards2` | 2 overcards | as duas cartas acima de `b0`, `made` em `no_pair`/`ace_high` | flop, turn |
| `overcard1` | 1 overcard | uma carta acima de `b0`, mesma condicao | flop, turn |

`straightOuts(mask)` = para cada rank ausente da mascara de 13 bits, liga o bit e
pergunta a `STRAIGHT_TOP` se ha topo diferente de zero. Contribuicao do heroi =
`straightOuts(bordo | mao) > straightOuts(bordo)`. **Nao ha avaliador novo.**

**`bdsd` precisa de sonda de duas cartas.** Backdoor de sequencia completa com
**2** cartas por definicao, e `straightOuts` liga **uma**. E funcao irma, nao a
mesma: varrer os pares de ranks ausentes (no maximo 78 consultas a
`STRAIGHT_TOP`, so no flop) e exigir contribuicao do heroi pelo mesmo criterio
de diferenca contra o bordo sozinho. Continua sem avaliador novo.

### A regra de sobreposicao — o item mais importante da frente

> **Mao feita e particao. Draw e etiqueta.**

```ts
export interface HandRead {
  made: MadeCategory;          // exatamente um, sempre
  madeQualifier: Qualifier | null;
  usesHoleCards: boolean;
  fromPocketPair: boolean;
  nutKicker: boolean;
  draws: DrawTag[];            // 0..n
}
```

O tipo **e** a regra: nao existe lista unica onde categoria de mao feita e draw
convivam, entao nao existe o `sum()` que produziria 137%. Consequencias:

1. `sum(massa por made) == massa total` — exato ate `1e-9`. Criterio de aceite 1,
   por construcao e nao por cuidado.
2. `sum(massa por draw)` **nao tem relacao** com o total e pode passar dele. Um
   combo com flush draw e gutshot conta nas duas linhas, e isso esta certo.
3. O numero bem definido do bloco de draws e outro: **combos com >= 1 draw**.
4. Mao feita forte **nao apaga** draw. Set com flush draw e `set` + `fd`. Nunca
   reclassificar, nunca subtrair.

### A tela

```
Bordo: 2 do mesmo naipe · pareado

MAOS FEITAS                        combos    massa    equity
  Flush (nut)                          6      4,80      92,1%
  Top par (k_top)                     12      9,00      61,4%
  ...
  ----------------------------------------------------------
  Total                              184    138,20     100% do range

DRAWS  (um combo pode aparecer em mais de uma linha - nao somam 100%)
  Flush draw nut                       3      2,40      48,9%
  Gutshot                             14     10,50      31,2%
  ----------------------------------------------------------
  Combos com pelo menos um draw        31     24,10
```

A frase entre parenteses no cabecalho dos draws e **requisito**: e a unica coisa
que impede o jogador de somar as duas colunas.

**Textura no topo** (emenda A15), duas dimensoes independentes:
naipe pelo maior numero de cartas de um mesmo naipe (`1 rainbow` · `2 2flush` ·
`3 monotone` · `4` · `5`) e pareamento (`unpaired` / `paired` / `trips` /
`quads`). Uma linha so.

Cores fixas por categoria vao para `@/lib/ui-tokens` (emenda A14 + regra "nada de
valor solto"), na vizinhanca de `heat`.

---

## RF-03.7: Filtros que pintam o range

- Marcar categoria **esmaece a matriz 13x13 e acende as celulas que contem** ao
  menos um combo daquela categoria (emenda A16). O filtro **nao** filtra tabela.
- **OU dentro do grupo, E entre grupos.** `top par` + `2o par` acende quem for um
  ou outro. `top par` + `flush draw` acende so quem e top par **e** tem flush
  draw — a leitura util ("qual parte do meu top par tem backup").
- Uma celula e uma classe (ex.: `A7s`) com ate 4 combos que podem cair em
  categorias diferentes. A celula acende com **um** combo que passe; o tooltip
  diz `X de Y combos passam`.
- Rodape global: `total de combos` e `combos que passam no filtro` (A17).
- `marcar tudo` / `desmarcar tudo`. Sem filtro marcado = **tudo aceso**.
- O `Reset` da pagina limpa tambem os filtros — o `RESET_TITLE` que ja esta em
  `RangeLab.tsx` promete isso desde a F1 e e esta frente que cumpre.

`RangeMatrix` ganha `highlight?: Set<string>`. Sem a prop, comportamento de hoje
— o popup (`CombosCalculator`) nao muda.

---

## RF-03.8: Por combo, as duas maos feitas

O shape depende do modo do heroi (D-F3-21), porque **parear so e possivel quando
ha uma mao do heroi para parear**:

| Modo do heroi | Tabela |
|---|---|
| **mao unica** | A tabela vira lista de combos **do vilao**, um por linha, cada um com sua mao feita. A mao do heroi aparece **uma vez**, no cabecalho: `voce: A6s — top par, kicker 6`. Cada linha fecha o par: `KhQh — flush de copas — voce perde` |
| **range** | Duas listas separadas (heroi e vilao), cada combo com sua propria leitura. **Nenhum pareamento e afirmado** |

Por que nao dava para so "acrescentar duas colunas": a `ComboTable` que a F1
entregou recebe `rows={result.perHeroCombo}` — uma linha por combo **do heroi**,
ja agregado contra o range inteiro do vilao. Nao existe "o combo do vilao daquela
linha". O exemplo do RF vem do popup (`Verdict.perCombo`), onde o heroi e sempre
uma mao so. Com `perVillainCombo` nascem **duas listas paralelas**, nao uma
pareada.

Fora do river o rotulo e "a mao feita **agora**", e a coluna diz isso: no flop a
mao ainda vai mudar.

---

## Mudanca de contrato do motor (D-F3-11)

`EngineResultOk` ganha:

```ts
perVillainCombo: VillainComboResult[];
```

Campos: `combo`, `weight`, `pairMass`, `equity: number | null`, `degradedReason`.
**Sem `evCall` e sem `decision`** — quem enfrenta a aposta e o heroi; um EV de
call do lado do vilao nao significa nada neste modelo.

- **Aditivo**: quem consome hoje nao quebra.
- O laco exato ja percorre todo par valido; e uma soma a mais em `Float64Array`.
- Sem isso o painel entrega contagem e massa mas nao a equity por categoria, que
  e metade do "de onde vem".

### ARMADILHA: o acumulador do vilao **nao** e o espelho do heroi

No `monteCarloRun` os dois lados sao amostrados de formas **diferentes**:

- o **vilao** e sorteado proporcional ao peso (`pickVillain`, busca binaria na
  acumulada);
- o **heroi** e percorrido exaustivamente, com rejeicao por colisao.

Acumular a equity do vilao por contagem simples sobre as amostras — o espelho
ingenuo do que o heroi faz — estima a equity do vilao **contra um range de heroi
uniforme**. O peso que o jogador declarou nas classes do proprio range seria
ignorado. O numero sai plausivel, estavel entre corridas com a mesma semente, e
errado. E a familia de erro que a `00-produto.md` poe acima de tudo.

O acumulador do lado do vilao **carrega `hero.weight[h]` explicitamente**.

Consequencia honesta, que a tela declara: no Monte Carlo, combo de vilao com peso
baixo recebe poucas amostras e sai com `equity: null` /
`insufficient_samples`. A coluna de equity por categoria pode vir parcial — e a
tela diz isso, em vez de preencher com zero.

**Trava de teste (obrigatoria):** no modo **exato**, para todo par valido,
`equity_heroi + equity_vilao == 1` dentro de `1e-9`. E um teste com pesos
**desiguais** no range do heroi, que reprova o acumulador ingenuo — com pesos
iguais os dois estimadores coincidem e o bug passa.

**Risco de execucao a medir, nao presumir:** o acumulo poe uma escrita a mais no
laco mais quente do produto — o mesmo que a F1 afinou de 33 ms para 20 ms so
trocando acesso a objeto por array plano. `f1-perf.test.ts` e o guarda; se o
orcamento estourar, a saida e acumular o lado do vilao **so no modo exato** e
declarar a ausencia no Monte Carlo, nunca afrouxar o teste de performance.

---

## Criterios de aceite

1. A soma das massas por **categoria de mao feita** bate com a massa total do
   range (dentro de `1e-9`). Draws sao contados a parte e a tela diz isso.
2. `AK` em `Q-7-7` classifica `ace_high` (nao `second_pair`); `88` no mesmo bordo
   classifica `two_pair` / `with_board_pair`; `AK` em `7-7-7` classifica
   `ace_high` (nao `trips`).
2b. Classificacao roda em bordo de **3, 4 e 5** cartas — o teste cobre as tres
   ruas (D-F3-17: `evaluate7` nao serve, exige 7 cartas exatas).
2c. Modo exato: `equity_heroi + equity_vilao == 1` por par valido, dentro de
   `1e-9`, com pesos **desiguais** no range do heroi. E a trava do acumulador do
   Monte Carlo.
3. Bordo de 5 cartas: `draws` vazio para todo combo.
4. Bordo `9-8-7-6`: combo que nao liga nada **nao** recebe `oesd` (D-F3-6).
5. `AJ` em `A-K-Q` sai `top_pair`, banda `k_good`, `nutKicker: true`.
6. Marcar so "flush draw" acende na matriz apenas as classes que fazem flush draw
   nesse bordo; o rodape diz quantos combos passaram.
7. `classify` concorda com `evaluator.ts` na familia, em amostra com semente fixa
   (o oraculo da D4 continua valendo).
8. `npm run check` limpo; `tests/unit/combo-calc/` e `tests/client/range-lab/`
   verdes, placar nao caiu.

---

## Fora de escopo desta sub-frente

- Cascata, bloqueadores e MDF: [F3b](F3b-decisao.md).
- Matriz de runout e curva de distribuicao: [F5a](F5-mindriver.md) (RF-05.3 e
  RF-05.1). Nao procurar por eles aqui.
- ICM / risk premium, persistencia server-side, Coach: **F4 cancelada**.

---

## HANDOFF — ao concluir a F3a

### Confira voce mesmo (10 min, no `:3000` reiniciado)

Monte um river de verdade: bordo de 5 cartas, sua mao, um range de vilao com
value e blefe.

1. **Categorias batem.** Some as contagens de **mao feita**: tem que dar o total
   de combos do range. Draws aparecem separados, com o aviso de sobreposicao.
2. **A mesa nao vira sua mao.** Ponha `Q-7-7` no flop e `AK` na sua mao: a leitura
   tem que dizer "as alto", nunca "2o par".
3. **Filtro pinta.** Marque so "flush draw": a matriz esmaece tudo e acende so as
   classes que fazem flush draw nesse bordo. O rodape diz quantos passaram.
4. **Combo explicado.** Cada linha da tabela diz a mao feita dos dois lados — nao
   so "ganha/perde".
5. **Kicker nut.** `A-K-Q` no bordo com `AJ`: tem que dizer que J e o melhor
   kicker possivel ali.

### Prompt da proxima sessao

Frente: **F3b — Aritmetica da decisao**. Modelo: **Opus 5 — Alto**.
```
Frente F3b do Range Lab. Leia Docs/specs/range-lab/00-INDICE.md e
Docs/specs/range-lab/F3b-decisao.md antes de qualquer coisa. O porque das
decisoes esta em Docs/specs/range-lab/F3-detalhamento.md.

F1 e F3a estao concluidas e verificadas. F4 foi cancelada — nao depende dela.
Atencao ao achado F-1 do detalhamento: MDF NAO e `1 - requiredEquity`; sao
dois alphas diferentes e o painel precisa dos dois com nomes proprios. Siga o
pipeline TDD.
```
