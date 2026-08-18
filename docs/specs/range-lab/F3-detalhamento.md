# F3 — passe de detalhamento

> Documento de trabalho da sessao da F3. Le-se junto de [F3-leitura.md](F3-leitura.md).
> Detalha o que a spec deixou em nivel de intencao: a taxonomia fechada, a regra
> de sobreposicao, e cinco achados que mudam o texto da frente **antes** do TDD.
>
> Nada aqui foi implementado. Este e o passe pedido no "Primeiro passo desta
> sessao" da F3.
>
> **Status: aprovado pelo founder em 2026-08-18.** As cinco perguntas da secao 10
> foram respondidas; as decisoes da secao 2 estao **fechadas**. A frente foi
> quebrada em [F3a](F3a-leitura-categorias.md) e [F3b](F3b-decisao.md), cada uma
> abrindo a frio. Este documento passa a ser o **porque** das duas.

---

## 1. Cinco achados que mudam a spec

### F-1 (grave) — `MDF = 1 - alpha` esta errado com o `alpha` que ja existe no codigo

O motor ja calcula `requiredEquity(potCurrent, callAmount) = call / (pot + call)`
(`client/src/lib/combo-calc/ev.ts:26`), com `potCurrent` **ja incluindo** a
aposta do vilao. Chamando a aposta de `B` e o pote antes dela de `P`:

```
alpha_heroi  = B / (P + 2B)     <- equity que EU preciso para pagar (ja existe)
alpha_defesa = B / (P + B)      <- frequencia de sucesso que o BLEFE dele precisa
MDF          = P / (P + B) = 1 - alpha_defesa
```

`MDF + alpha_heroi != 1` em nenhum tamanho de aposta exceto o degenerado. Pote
36,1 com call 13,8 (os valores default da pagina): `alpha_heroi = 0,382`,
`alpha_defesa = 0,619`, `MDF = 0,381`. Somar o primeiro com o MDF da 0,763 — a
tela mostraria um "MDF + alpha = 76%" que nao significa nada.

O criterio de aceite 4 da F3 ("MDF + alpha = 1 em toda a faixa de aposta") so
fecha com `alpha_defesa`. E a formula do RF-03.4
(`blefes = value * alpha / (1 - alpha)`) tambem so fecha com `alpha_defesa`:
aposta de pote (`B = P`) da `alpha_defesa = 0,5` e portanto `blefes = value`, que
e a razao 1:1 conhecida do river.

**Consequencia para o codigo:** a F3 introduz uma grandeza **com nome proprio**
(`defenseAlpha`), em modulo proprio, e **nunca** reusa `requiredEquity` para MDF.
Os dois numeros vao aparecer na mesma tela; se compartilharem nome ou funcao,
um dia alguem le o errado. E exatamente o modo de falha que a D8 e a D10 da F0
ja documentaram nesta frente.

Precisa de `P` (pote antes da aposta) = `potCurrent - callAmount`. Se
`callAmount > potCurrent` o input e incoerente: MDF sai `null` com razao
`invalid_pot_before_bet`, nao um numero torto.

### F-2 — RF-03.1 pede equity por categoria do **vilao**, e o motor nao emite dado por combo do vilao

`EngineResultOk.perHeroCombo` cobre o heroi. Nao existe `perVillainCombo`. Sem
ele, o painel de categorias entrega contagem e massa (que sao locais e baratas),
mas **nao** a "equity media" que o RF pede.

Tres saidas:

| Opcao | Custo | Problema |
|---|---|---|
| (a) motor passa a emitir `perVillainCombo` | 1 escrita a mais por par no laco quente | mexe no contrato da F1 |
| (b) F3 mostra so contagem + massa por categoria | zero | entrega meia leitura; a equity por categoria e o que responde "de onde vem" |
| (c) rodar o motor de novo com os lados trocados | dobra o tempo | duas corridas que podem divergir por arredondamento |

**Recomendo (a).** O laco exato ja compara todo par valido; acumular o lado do
vilao no mesmo passo e uma soma a mais em `Float64Array`. `EngineResultOk` ganha
`perVillainCombo: VillainComboResult[]`, campo novo, aditivo — quem consome hoje
nao quebra.

### F-3 — o criterio de aceite 1 so fecha se "mao feita" for **particao**

"A soma das massas por categoria de mao feita bate com a massa total do range
(dentro de `1e-9`)" so e verdade se cada combo cair em **exatamente uma**
categoria de mao feita. Isso vira desenho de tipo, nao disciplina — secao 4.

### F-4 — a cascata (RF-03.2) muda de base fora do river

"massa que perde para voce" e "chops" so sao contagens discretas no river. No
flop e no turn o certo e a massa **efetiva** (`w * equity`), que e o que a D10 da
F0 ja resolveu com `verdictCalcBasis`. A cascata declara a base no rotulo,
mesmo principio; sem isso ela mente no flop do mesmo jeito que o
`breakevenFrequency` mentia (0,42 anunciado contra 0,20 real, F0/D11).

### F-5 — bloqueador (RF-03.3) nao tem definicao com heroi-como-range

"Para cada carta da mao do heroi" pressupoe duas cartas. No modo "meu range" o
heroi tem N combos e nao existe "a carta dele". O painel de bloqueadores fica
**desabilitado no modo range, com o motivo escrito na tela** — nao um numero
inventado sobre a carta mais frequente.

---

## 2. Decisoes — **fechadas** (founder, 2026-08-18)

| # | Decisao | Escolha proposta | Por que |
|---|---|---|---|
| D-F3-1 | Quem classifica | Modulo puro `classify.ts`, entrada `(hole, board)`, **fora** do worker | Sao no maximo 1326 combos por lado; classificar e barato e nao depende do tamanho da aposta. Dentro do motor, trocar o pote forcaria reclassificar tudo |
| D-F3-2 | Fonte da categoria | O avaliador da a **familia** (as 9 do `fastEvaluator`); a subdivisao de par vem da **participacao das cartas do heroi** | "Set" e "trinca" tem a mesma forca e leitura oposta; a diferenca e de onde veio o par, informacao que o score de 5 cartas joga fora |
| D-F3-3 | Mao feita pela mesa | Familia de forca (straight flush, quadra, full, flush, sequencia) **fica**, com flag `usesHoleCards: false`. Familia de par (set..underpair, dois pares) **exige** participacao do heroi; sem ela cai em `ace_high`/`no_pair` | Sequencia da mesa e a sua mao — todo mundo tem. Par da mesa nao e "seu segundo par": AK em Q-7-7 e ace-high, e chamar de "2o par" e mentira de leitura |
| D-F3-4 | Cardinalidade | `made` e **um** valor; `draws` e um **conjunto** de 0..n tags | Faz o criterio de aceite 1 valer por construcao e torna impossivel somar as duas coisas em 100% |
| D-F3-5 | Draw no river | Board de 5 cartas => `draws` sempre vazio | Nao ha carta por vir. Tag de draw no river e ruido que infla o painel |
| D-F3-6 | Draw exige participacao do heroi | Sim: so conta o que as cartas dele **acrescentam** ao que a mesa ja da | Board 9-8-7-6 da open-ended para os 1326 combos; listar isso como "draw do range" nao separa ninguem |
| D-F3-7 | Exclusao dentro da familia de draw | Flush: `fd_nut` XOR `fd` XOR `bdfd`. Sequencia: `oesd` XOR `gutshot` XOR `bdsd`. Entre familias, acumula | Um combo nao tem flush draw *e* backdoor do mesmo naipe. Mas tem flush draw *e* gutshot, e isso e informacao |
| D-F3-8 | Overcards | So marcadas quando `made` e `no_pair` ou `ace_high` | "2 overcards" com um set na mao e ruido |
| D-F3-9 | Kicker | Bandas absolutas: `k_top` = A/K, `k_good` = Q/J/T, `k_weak` = 9 ou menor. Declarado na tela como banda fixa | Alternativa relativa ao bordo e mais justa e nao e explicavel numa linha. A banda erra de um jeito visivel (J em A-K-Q); a relativa erra de um jeito invisivel |
| D-F3-10 | Flush nut/strong/weak | Posicao da maior carta do naipe do heroi entre as cartas **vivas** daquele naipe: 1a => `nut`, 2a-3a => `strong`, 4a+ => `weak` | Relativo ao que sobrou no baralho, que e o que decide. "K de copas" e nut se o A esta no bordo |
| D-F3-11 | Onde a equity por categoria vem | `perVillainCombo` novo no `EngineResultOk` (F-2, opcao a) | Uma corrida so alimenta os dois lados |
| D-F3-12 | MDF | Modulo `mdf.ts` com `defenseAlpha` proprio; `requiredEquity` **nao** e reusado (F-1) | Dois numeros parecidos na mesma tela precisam de dois nomes no codigo |
| D-F3-13 | Bloqueador fora do river | Contagem de combos removidos sempre; o **delta em pp** so no river (analitico, sem corrida extra). Fora do river, botao explicito "calcular efeito" que dispara 2 corridas | Duas corridas escondidas atras de cada tecla matam a pagina. Contagem ja responde a maior parte da pergunta |
| D-F3-14 | Escopo | Quebrar em **F3a** e **F3b** (secao 8) | A frente ja tem 6 RFs, um contrato de motor novo e um modulo de classificacao com 24 categorias |
| D-F3-15 | Kicker nut | Alem da banda absoluta, marca `nutKicker: boolean` = o kicker e o **maior rank ausente do bordo** | Observacao do founder ao aprovar a D-F3-9: em `A-K-Q`, `AJ` e top par com o **melhor kicker possivel** — K ou Q dariam dois pares, nao top par melhor. A banda absoluta sozinha diria `k_good`; a relativa diria `k_weak`, que e falso. A marca resolve sem trocar a banda: a tela escreve "kicker J (o melhor possivel neste bordo)" |
| D-F3-21 | Quem aparece na tabela "combo explicado" (RF-03.8) | Heroi = **mao unica**: a tabela vira lista de combos **do vilao**, e a mao do heroi aparece uma vez no cabecalho. Heroi = **range**: duas listas separadas, sem parear | Achado do system-architect: o exemplo da spec (`KhQh = flush -> voce A6s = top par`) vem do popup, onde o heroi e uma mao so e cada linha e um combo do vilao. A `ComboTable` da pagina nova tem uma linha por combo **do heroi**, ja agregado contra o range inteiro — nao existe "o combo do vilao daquela linha", e parear seria inventar. Mao unica e justamente o modo em que "me explica esse combo" importa: a decisao de bluffcatcher no river |
| D-F3-22 | De qual lado e o painel de leitura e o filtro | Botao **heroi / vilao** no painel, padrao **vilao**. O filtro pinta a matriz do lado escolhido | O RF-03.1 diz "combos do vilao", mas o exemplo que justifica o "E entre grupos" do RF-03.7 e "qual parte do **meu** top par tem backup". A pagina tem duas matrizes e o `classify.ts` e agnostico de lado, entao servir os dois nao custa matematica — so fiacao de UI |
| D-F3-17 | Qual avaliador na classificacao | `evaluateHand` de `evaluator.ts` (aceita 5..7 cartas), **nao** `evaluate7` | Achado do system-architect, confirmado no codigo: `evaluate7`/`loadBoard` exigem 7 cartas exatas e nao rodam no flop (5) nem no turn (6) — o pseudo-codigo do primeiro passe estava quebrado nas duas ruas. `evaluateHand` e o oraculo da D4, entao o criterio de aceite de paridade vira verificacao de consistencia em vez de segunda implementacao. Aloca `Map` por chamada, mas sao <= 1326 chamadas memoizadas por `(range, bordo)`, fora do laco quente |
| D-F3-18 | Acumulador do vilao no Monte Carlo | Carrega `hero.weight[h]` **explicitamente**. O espelho ingenuo do acumulador do heroi e proibido, com teste de pesos desiguais travando | Achado do system-architect, confirmado em `run.ts:monteCarloRun`: o vilao e sorteado proporcional ao peso e o heroi e percorrido exaustivamente. Contagem simples estimaria a equity do vilao contra um heroi **uniforme** — plausivel, estavel, reproduzivel e errado |
| D-F3-19 | `usesHoleCards` | Significa **"a categoria nomeada foi formada com >= 1 carta do heroi"**, e nada alem | O texto do primeiro passe deixou a flag responder duas perguntas ("a mesa joga sozinha?" e "a categoria usa carta minha?"). Uma flag que responde duas perguntas responde errado uma delas: `AK` em `Q-7-7` sai `ace_high` com `true` (o as e dele), enquanto `23` em `5-6-7-8-9` sai `straight` com `false` |
| D-F3-20 | `VillainComboResult` | **Sem** `evCall` e `decision` | Quem enfrenta a aposta e o heroi. EV de call do lado do vilao nao significa nada neste modelo, e campo sem significado acaba lido |
| D-F3-16 | Linguagem do painel de MDF | Numero nunca aparece solto: sempre em frase, com sujeito (`voce` / `ele`) e com a consequencia escrita. Formula so em tooltip | Pedido do founder na aprovacao da F-1. Sao tres porcentagens parecidas no mesmo cartao; o que separa uma da outra e a frase, nao o rotulo curto. Detalhe na secao 6 |

---

## 3. Taxonomia — 16 categorias de mao feita

Notacao usada abaixo:
- `boardRanks` = ranks **distintos** do bordo, em ordem decrescente `b0 > b1 > ...`
- `higherCount(r)` = quantos ranks do bordo sao estritamente maiores que `r`
- `hole` = as 2 cartas do combo

### 3.1 Tabela

| # | id | rotulo PT-BR | Como e reconhecida | Qualificador |
|---|---|---|---|---|
| 1 | `straight_flush` | Straight flush | familia 8 do avaliador | — |
| 2 | `quads` | Quadra | familia 7 | — |
| 3 | `full_house` | Full house | familia 6 | — |
| 4 | `flush` | Flush | familia 5 | `nut` / `strong` / `weak` (D-F3-10) |
| 5 | `straight` | Sequencia | familia 4 | — |
| 6 | `set` | Set | familia 3 **e** hole e par de bolso do rank que aparece no bordo | — |
| 7 | `trips` | Trinca | familia 3 **e** o bordo tem o par; heroi tem 1 carta do rank | kicker |
| 8 | `two_pair` | Dois pares | familia 2, com participacao do heroi | `top_two` / `top_bottom` / `bottom_two` / `with_board_pair` |
| 9 | `overpair` | Overpair | par de bolso `p`, `higherCount(p) == 0`, `p` fora do bordo | — |
| 10 | `top_pair` | Top par | 1 carta do heroi pareia `b0` | kicker |
| 11 | `second_pair` | 2o par | `higherCount(r) == 1` | kicker (nulo se de bolso) |
| 12 | `third_pair` | 3o par | `higherCount(r) == 2` | kicker (nulo se de bolso) |
| 13 | `weak_pair` | Par fraco (4o+) | `higherCount(r) >= 3` | kicker (nulo se de bolso) |
| 14 | `underpair` | Underpair | par de bolso abaixo de **todos** os ranks do bordo | — |
| 15 | `ace_high` | As alto | sem par proprio, heroi **tem** um A | — |
| 16 | `no_pair` | Sem par | sem par proprio, sem A na mao | — |

Todas carregam tambem `usesHoleCards: boolean` (D-F3-3) e `fromPocketPair: boolean`
(par de bolso no meio do bordo continua sendo "3o par", mas a tela pode escrever
"88 de bolso = 3o par" em vez de deixar o jogador adivinhar).

### 3.2 Algoritmo, na ordem

```
classifyMade(hole, board):
  score = evaluate7(board[0..4], hole[0], hole[1])   // ja existe, ja testado
  fam   = handCategory(score)                        // 0..8

  fam 8 -> straight_flush
  fam 7 -> quads
  fam 6 -> full_house
  fam 5 -> flush + qualificador de nut (D-F3-10)
  fam 4 -> straight
  fam 3 -> par de bolso do rank no bordo   -> set
           bordo pareado + 1 carta no rank -> trips
           senao (trinca toda da mesa)     -> passo de par
  fam 2 -> heroi participa de PELO MENOS UM dos dois pares
             ? two_pair + qualificador : passo de par (D-F3-3)
  fam 1 -> passo de par
  fam 0 -> heroi tem A ? ace_high : no_pair
```

Passo de par (`fam 1`, ou `fam 2/3` sem participacao do heroi):

```
se hole e par de bolso p e p nao esta no bordo:
   higherCount(p) == 0                     -> overpair
   higherCount(p) == boardRanks.length     -> underpair
   senao                                   -> nth por higherCount(p)
senao se exatamente uma carta do heroi tem rank r presente no bordo:
   nth por higherCount(r), com kicker = a outra carta
senao:                                     // o par e todo da mesa
   heroi tem A ? ace_high : no_pair        // usesHoleCards = false
```

`nth por higherCount`: `0 -> top_pair`, `1 -> second_pair`, `2 -> third_pair`,
`>= 3 -> weak_pair`.

**Caso que quebra a versao ingenua:** AK em `Qh 7s 7d`. O avaliador devolve
familia 1 (par de setes). Mapear familia direto para categoria produz "2o par",
que e falso — o par e da mesa, e ninguem paga uma aposta achando que tem par. O
passo acima devolve `ace_high` com `usesHoleCards: false`.

**Segundo caso:** 88 em `Qh 7s 7d`. Familia 2 (dois pares: 88 e 77) com
participacao do heroi -> `two_pair` qualificador `with_board_pair`.

### 3.3 Qualificador de dois pares

Com `i < j` = posicoes dos dois ranks pareados dentro de `boardRanks`:

| Condicao | Qualificador |
|---|---|
| `i == 0 && j == 1` | `top_two` |
| `i == 0 && j > 1` | `top_bottom` |
| `i > 0` | `bottom_two` |
| par do heroi + par da mesa (heroi nao pareia dois ranks distintos) | `with_board_pair` |

### 3.4 Textura do bordo (emenda A15, topo do painel)

Duas dimensoes independentes, calculadas sobre o bordo atual:

- **naipe**, pelo maior numero de cartas de um mesmo naipe: `1 -> rainbow`,
  `2 -> 2flush`, `3 -> monotone`, `4 -> 4 do mesmo naipe`, `5 -> 5 do mesmo naipe`.
- **pareamento**: `unpaired` / `paired` / `trips` / `quads`.

Sao rotulos derivados, sem calculo caro. Ficam numa linha so no topo.

---

## 4. Draws e a regra de sobreposicao — o coracao do passe

### 4.1 As 8 tags

| id | rotulo | Reconhecimento | Rua |
|---|---|---|---|
| `fd_nut` | Flush draw nut | 4 cartas do naipe, heroi contribui, e a carta dele e a maior **viva** do naipe | flop, turn |
| `fd` | Flush draw | 4 cartas do naipe, heroi contribui | flop, turn |
| `bdfd` | Backdoor flush draw | 3 cartas do naipe, heroi contribui | so flop |
| `oesd` | Open-ended / dupla gutshot | `straightOuts >= 2` acrescentados pelo heroi | flop, turn |
| `gutshot` | Gutshot | `straightOuts == 1` acrescentado pelo heroi | flop, turn |
| `bdsd` | Backdoor de sequencia | precisa de 2 cartas, heroi contribui, e nao ha oesd/gutshot | so flop |
| `overcards2` | 2 overcards | as duas cartas acima de `b0`, com `made` em `no_pair`/`ace_high` | flop, turn |
| `overcard1` | 1 overcard | uma carta acima de `b0`, mesma condicao | flop, turn |

`straightOuts(mask)` reusa a tabela `STRAIGHT_TOP` que a F1 ja construiu e
testou: para cada rank ausente, liga o bit e pergunta se a tabela devolve topo
diferente de zero. Contribuicao do heroi =
`straightOuts(bordo | mao) > straightOuts(bordo)`. Nao ha avaliador novo.

### 4.2 A regra, escrita como contrato

> **Mao feita e particao. Draw e etiqueta.**

```ts
export interface HandRead {
  made: MadeCategory;          // exatamente um, sempre
  madeQualifier: Qualifier | null;
  usesHoleCards: boolean;
  fromPocketPair: boolean;
  draws: DrawTag[];            // 0..n, pode ser vazio, pode ter 3
}
```

O tipo **e** a regra. Nao ha lista unica onde categoria de mao feita e draw
convivam, entao nao existe o `sum()` que produziria 137%. As consequencias:

1. `sum(massa por made) == massa total do range` — exato ate `1e-9`. Criterio de
   aceite 1, garantido por construcao, nao por cuidado.
2. `sum(massa por draw)` **nao tem relacao** com a massa total e pode passar
   dela. E correto que passe: um combo com flush draw e gutshot conta nas duas
   linhas.
3. O numero **bem definido** do bloco de draws e outro: `combos com >= 1 draw`.
   Esse e <= total e e o que a tela mostra no rodape do bloco.
4. Mao feita forte **nao apaga** draw. Set com flush draw e `set` + `fd`. Nunca
   reclassificar, nunca subtrair.

### 4.3 Como isso aparece na tela

Dois blocos separados, com rodapes diferentes (emenda A17: contagem e massa
sempre lado a lado):

```
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

A frase entre parenteses no cabecalho do bloco de draws e requisito, nao
decoracao: e a unica coisa que impede o jogador de somar as duas colunas.

---

## 5. Filtros (RF-03.7 + emenda A16)

- Marcar categoria **esmaece a matriz 13x13 e acende as celulas que contem** ao
  menos um combo daquela categoria. Nao filtra tabela.
- **OU dentro do grupo, E entre grupos.** Marcar `top par` + `2o par` acende
  quem for um ou outro. Marcar `top par` + `flush draw` acende so quem e top par
  **e** tem flush draw. E a leitura util ("qual parte do meu top par tem
  backup").
- Uma celula da matriz e uma classe (ex.: `A7s`) com ate 4 combos, que podem
  cair em categorias diferentes. A celula acende com **um** combo que passe, e o
  tooltip diz `X de Y combos passam`.
- Rodape global: `total de combos` e `combos que passam no filtro` (A17).
- `marcar tudo` / `desmarcar tudo`. Sem filtro marcado = tudo aceso (nao tudo
  apagado).
- O botao `Reset` da pagina (emenda A19, ja no `RESET_TITLE`) tambem limpa os
  filtros — o texto do tooltip ja promete isso hoje e a F3 e quem cumpre.

---

## 6. Os RFs restantes, detalhados

### RF-03.2 — cascata

Cinco degraus, cada um com contagem **e** massa:

| Degrau | Valor | Observacao |
|---|---|---|
| Range nominal | 1326 | constante |
| Range declarado | soma dos combos das entradas x frequencia | `expandRangeV2` ja devolve `totalWeight` |
| Apos card removal do bordo | idem, sem as cartas do bordo | ja e o que `expandRangeV2` retorna |
| Apos card removal mutuo | `sum(pairMass)` sobre o lado do vilao | e o degrau que mostra o bloqueador operando |
| Perde para voce / chop | river: contagem discreta. Fora do river: massa efetiva | base declarada (F-4 / D10) |

O ultimo total tem que bater com o total do bloco de maos feitas (item 2 do
handoff da F3).

### RF-03.3 — bloqueadores

- Modo heroi = mao unica apenas (F-5).
- Para cada uma das 2 cartas: quantos combos de **value** e de **blefe** do vilao
  aquela carta remove.
- `value` / `blefe` sao derivados do confronto: combo que bate o heroi = value,
  que perde = blefe. Declarado na tela com essas palavras — nao e a intencao do
  vilao, e o resultado contra a sua mao. Chop entra numa terceira contagem, nao
  e distribuido.
- Delta em pp: river direto (analitico); fora do river, sob botao (D-F3-13).
- Criterio de aceite 2 continua valendo: remover a mao do range na unha tem que
  produzir o mesmo delta.

### RF-03.4 — MDF, value/blefe, indiferenca

```
P = potCurrent - callAmount     // pote antes da aposta
B = callAmount
defenseAlpha = B / (P + B)
MDF          = P / (P + B) = 1 - defenseAlpha
blefesNecessarios = valueCombos * defenseAlpha / (1 - defenseAlpha)
```

- `P <= 0` => tudo `null` com razao `invalid_pot_before_bet`.
- "Faltam N combos de blefe" = `blefesNecessarios - blefeCombos`, em **massa
  ponderada**, arredondado para exibicao mas nunca para o calculo.
- Com heroi como range: "sua mao e o k-esimo melhor bluffcatcher de N; o corte de
  EV zero esta no j-esimo" — `j` e o `callThresholdIndex` que a F1 ja entrega. Se
  divergir, e bug (mesma regra que a F5a fixou para a curva).

#### A tela (D-F3-16)

Sao tres porcentagens parecidas no mesmo cartao. Numero solto ao lado de rotulo
curto (`alpha 25% · MDF 67%`) e como a confusao entra. Cada linha e uma **frase
com sujeito**, e o rodape diz o que fazer:

```
Ele apostou 10 num pote de 20.

  Pra pagar, VOCE precisa de ................. 25% de equity
  O blefe DELE precisa funcionar ............. 33% das vezes
  Entao voce nao pode foldar mais que ........ 33% do seu range   (MDF: defende 67%)

  Ele tem 18 combos de value.
  Pra te deixar indiferente, precisaria de 9 combos de blefe.
  Tem 4.  ->  FALTAM 5.  Ele blefa de menos: da pra foldar mais que o MDF manda.
```

Regras de copy, que sao requisito e nao decoracao:

- Nenhuma porcentagem aparece sem a frase que diz de quem ela e.
- A formula (`B / (P + B)`) vive em tooltip, nunca na face do cartao.
- O veredito do fim e uma frase de acao ("da pra foldar mais", "ele tem blefe
  demais: pague mais largo"), nao um numero.
- `P <= 0`: o cartao inteiro vira uma frase de estado ("pote antes da aposta nao
  fecha — confira os valores"), sem numero nenhum. Zero seria pior que vazio.

### RF-03.8 — as duas maos feitas por combo

A `ComboTable` ganha duas colunas de texto vindas do `classify.ts`: a mao do
vilao e a do heroi, com qualificador. `KhQh = flush de copas -> voce A6s = top
par, kicker 6`. E leitura pura da classificacao, custo zero de motor.

Fora do river o rotulo e "a mao feita **agora**", e a coluna diz isso — no flop a
mao ainda vai mudar.

---

## 7. Modulos novos

```
client/src/lib/combo-calc/
  classify.ts     classifyCombo(hole, board) -> HandRead; boardTexture(board)
  read.ts         agregacao por categoria (contagem, massa, equity) + filtros
  mdf.ts          defenseAlpha, mdf, bluffsNeeded  (NAO importa ev.ts)
  blockers.ts     contrafactual por carta
  cascade.ts      os cinco degraus
client/src/components/range-lab/
  BoardTextureLine.tsx
  CategoryPanel.tsx      dois blocos + rodapes + filtros
  CascadeBar.tsx
  BlockerPanel.tsx
  MdfPanel.tsx
```

`RangeMatrix` ganha uma prop `highlight?: Set<string>` (classes acesas). Sem a
prop, comportamento de hoje — o popup nao muda.

Cores fixas por categoria vao para `@/lib/ui-tokens` (A14 + regra "nada de valor
solto"), na vizinhanca de `heat`.

Contrato do motor: `EngineResultOk` ganha `perVillainCombo` (D-F3-11), aditivo.

---

## 8. Proposta de quebra

A propria F3 autoriza ("se inchar, quebrar"). Recomendo quebrar **agora**, e nao
no meio:

| Sub-frente | Escopo | Por que junto |
|---|---|---|
| **F3a — Leitura por categoria** | `classify.ts`, `perVillainCombo` no motor, RF-03.1, RF-03.8, RF-03.7 (filtros) | Um modulo puro grande e seus dois consumidores diretos. O filtro que pinta a matriz e o pagamento da taxonomia; separar deixaria a taxonomia sem superficie |
| **F3b — Aritmetica da decisao** | RF-03.2 cascata, RF-03.3 bloqueadores, RF-03.4 MDF | Tres paineis que respondem "de onde veio o numero" e "quanto ele precisa blefar". Nenhum depende da taxonomia; todos dependem de massa e de `alpha` |

A quebra proposta pela spec era (categorias + cascata + bloqueadores) / (runout +
distribuicao + filtros), mas runout e distribuicao ja migraram para a F5a — a
F3b original ficaria com so um RF. A linha acima divide o que sobrou pelo eixo
que existe hoje: quem depende de `classify.ts` e quem depende de `alpha`.

---

## 9. Mapa de aceite -> teste (esboco para o test-writer)

| Criterio | Teste |
|---|---|
| 1. Soma das massas de mao feita = massa total | propriedade sobre range aleatorio com semente fixa, varios bordos; `Math.abs(soma - total) < 1e-9` |
| 1b. Draws nao somam | caso com set + flush draw: aparece nas duas listas; `sum(draws) > total` e a tela declara |
| 2. Bloqueador | remover a mao do range na unha vs. delta reportado, mesmo spot |
| 4. `MDF + defenseAlpha = 1` | varredura de tamanhos de aposta 0,1x a 5x pote |
| 4b. `requiredEquity != defenseAlpha` | teste explicito de que os dois **nao** sao iguais fora do degenerado — trava o F-1 para sempre |
| — | AK em Q-7-7 classifica `ace_high`, nao `second_pair` (D-F3-3) |
| — | 88 em Q-7-7 classifica `two_pair` / `with_board_pair` |
| — | river (5 cartas) => `draws` vazio, sempre |
| — | board 9-8-7-6, combo sem carta ligada: sem `oesd` (D-F3-6) |
| — | paridade: `classify` concorda com `evaluator.ts` na familia em amostra com semente fixa |
| 6. `npm run check` limpo, suite verde | — |

---

## 10. As cinco perguntas — respondidas (founder, 2026-08-18)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | **F-1 (MDF).** Introduzir `defenseAlpha` separado e corrigir o texto do RF-03.4 e do criterio 4? | **Sim**, com o pedido explicito de priorizar a UX: o painel tem que ser facil de entender pelo jogador. Virou a D-F3-16 e a secao 6 ganhou o desenho da tela |
| 2 | **F-2 (perVillainCombo).** Mexer no contrato do motor? | **Opcao (a)**: `EngineResultOk` ganha `perVillainCombo`, aditivo |
| 3 | **D-F3-3 (par da mesa).** `AK` em `Q-7-7` e `ace_high` ou `2o par`? | **`ace_high`** — a proposta. Par exige participacao da mao |
| 4 | **D-F3-9 (kicker).** Banda absoluta ou relativa? | **Absoluta**, com a observacao do founder de que em `A-K-Q` o `AJ` ja e o melhor kicker possivel (acima disso vira dois pares). Dai nasceu a **D-F3-15** (`nutKicker`) |
| 5 | **D-F3-14 (quebra).** F3a + F3b, ou uma sessao? | **Duas**, com a condicao de que **tudo fique documentado** para a sessao poder trocar no meio. Por isso as duas sub-frentes ganharam arquivo proprio que abre a frio, e o placar do indice foi atualizado |
