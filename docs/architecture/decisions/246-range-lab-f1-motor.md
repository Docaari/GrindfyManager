# ADR-246: Range Lab F1 — motor de equity (avaliador bitmask, placar por runout, worker stepper, modelo v2 do Spot)

## Status
Aceito

## Data
2026-08-16

Specs de origem: `Docs/specs/range-lab/F1-motor.md` (RF-01.1 a RF-01.5),
`Docs/specs/range-lab/00-INDICE.md` (decisoes D1 a D11) e as emendas A1, A2, A3,
A4, A18, A19 e A20 de `Docs/specs/range-lab/F5-mindriver.md`.

Modelo e esforco declarados na spec: **Opus 5 — Extra**. A F1 reescreve o nucleo
de calculo e muda o modelo de dados; e zona critica pela regra
`.claude/rules/04-modelo-e-esforco.md` — matematica que vira numero na tela nunca
roda abaixo de `high`, e esta frente foi fixada em `Extra`.

> **Nota de numeracao:** ultimo ADR em disco na abertura desta sessao e o **245**
> (`245-grade-planner-library-viewport-and-multi-day.md`). Este usa o proximo
> livre confirmado = **246**. A linha correspondente no `README.md` desta pasta
> ainda nao foi adicionada (esta sessao foi escopada a cinco arquivos); e a unica
> pendencia de indice deste ADR.

---

## Contexto

### O que existe hoje

A Calculadora de Combos (`/calculadoras` aba "Combos", mais o popup
`/calculadora-popup/combos`) responde uma pergunta que nenhum concorrente
responde direto: **"pague, e faltam X fichas"**. O nucleo esta em
`client/src/lib/combo-calc/` — 11 arquivos, client-only, 201 testes verdes apos a
F0.

O nucleo matematico esta correto. O que nao esta e a **escala** e o **modelo**:

| Sintoma medido | Numero |
|---|---|
| Flop `Ad 8h 4h`, 59 classes / 236 combos do vilao, mao unica do heroi | **555 ms** na main thread |
| Range de BTN cheio no flop (mais de 1300 combos) | cerca de **3 s** de tela travada |
| Range do heroi vs range do vilao no flop | inviavel — 1300 x 1300 x 990 runouts |

A causa do custo esta em `client/src/lib/combo-calc/evaluator.ts:53-60`:
`evaluateHand` aloca um `Map` de contagem por rank, um `Map` de ranks por naipe,
mais varios arrays intermediarios (`byCount`, `flushRanks`, `highestExcluding`),
**por chamada**. `showdown()` chama `evaluateHand` duas vezes. `comboEquity` no
flop chama `showdown` uma vez por runout. O trabalho util — decidir qual mao de
poker e melhor — some debaixo do trabalho de alocar e coletar lixo.

O modelo tem uma limitacao independente do custo: `Spot.hero` e
`[Card, Card]` (`types.ts:32-38`). O heroi e sempre **uma** mao. Isso impede a
pergunta mais util de um estudo de spot: **quais das minhas maos pagam?**

### O que a F0 deixou de contrato (herdado, nao se reabre)

A F0 fechou em 2026-08-16 (commit `ea0f8303`) e entregou os contratos que a F1
recebe prontos:

| Onde | Contrato |
|---|---|
| `types.ts` | `Verdict.decision: Decision \| null` + `degradedReason: "empty_range" \| null` + `totalWeight` / `wEff` / `lEff` |
| `evaluateSpot.ts` | `heroEquityAtMultiplier(Spot \| Verdict, k, subset?)` — equity ponderada e sempre `soma(w*eq)/soma(w)` |
| `evaluateSpot.ts` | `verdictCalcBasis(verdict)` — `discrete` no river, `effective` fora dele (D10) |
| `evaluateSpot.ts` | `tryEvaluateSpot(spot)` — `{ verdict, error }` com erro nomeado |
| `combos.ts` | `RANGE_TOKEN_RULES` — tabela ordenada de regras, aberta para a F2 (D9) |
| `persistence.ts` | `sanitizeSavedSpot` / `hydrateSpot`; `loadSavedSpots` saneia item a item |
| `uiRules.ts` | `parseImportedFrequency`, `resolveCardClick`, `describeSpotReadiness` |

Duas observacoes da F0 que governam decisoes desta frente:

1. **Massa zero nao apaga `evCall`.** O `Verdict` degradado continua carregando
   `evCall` e `equityGap` calculados — um teste do baseline exige
   `Number.isFinite(evCall)`. O portao e `decision: null` + `degradedReason`.
   Quem consumir `evCall` sem olhar `decision` faz voltar o "-13,8 fichas"
   fantasma. **A F1 leva o veredito para worker, e a F4 leva para export e
   Coach** — as duas fronteiras onde a disciplina "olhe `decision` primeiro"
   costuma se perder.
2. **O avaliador atual nao e deletado** (decisao D4 do indice). Ele vira oraculo
   de teste do avaliador rapido.

### Restricoes que este ADR nao reabre

- **Sem dependencia nova** (Artigo VII da `CONSTITUICAO.md` e
  `.claude/rules/01-tecnologia.md`): tabela propria, PRNG proprio, worker
  proprio. Nada de biblioteca de avaliacao de poker.
- **Nada de valor visual solto** (`.claude/rules/14-frontend-ui.md`): a escala de
  calor vai para `@/lib/ui-tokens`.
- **`z-index` pela tabela canonica** de `Docs/conventions/z-index.md`.
- **Multiway segue fora** (D7). O motor e sempre heroi vs UM vilao.
- **Numero errado perde para numero ausente** (`.claude/rules/00-produto.md`):
  onde nao da para calcular, devolve ausencia com razao nomeada, nunca zero.

### As dez perguntas que este ADR fecha

1. Qual e a forma exata do avaliador rapido?
2. Como evitar recomputar o bordo em cada avaliacao?
3. Qual e a ordem do laco que faz o alvo de 20 ms?
4. Como o card removal mutuo entra na conta sem virar produto de pesos?
5. Onde fica a fronteira exato / Monte Carlo, e como o aproximado se declara?
6. Como cancelar um calculo que ja comecou?
7. Qual e o contrato do Worker?
8. Como o tipo do resultado impede a leitura de numero degradado?
9. Qual e o modelo v2 do `Spot`, e como o dado do jogador sobrevive a ele?
10. Qual e a superficie, e quais tokens e camadas ela ocupa?

---

## Decisao

### D-F1-1 — Avaliador bitmask com score inteiro unico

Arquivo novo `client/src/lib/combo-calc/fastEvaluator.ts`. O `evaluator.ts`
atual **nao e deletado**: vira oraculo de teste (D4 do indice).

**Codificacao de carta.** `code = rankIdx * 4 + suitIdx`, com `rankIdx` de 0 a 12
(`0` = 2, `12` = A) e `suitIdx` = indice em `SUITS` (`["c","d","h","s"]`, de
`cards.ts:3`). Cartas sao codificadas **uma vez** por combo e por bordo, nunca
dentro do laco de showdown.

**Assinatura.** `evaluate7(c0, c1, c2, c3, c4, c5, c6): number` — **sete
argumentos numericos**, nao um array. Zero alocacao por chamada. Este e o ponto
inteiro da decisao: o gargalo de hoje nao e a logica de poker, e a alocacao de
dois `Map` e varios arrays por avaliacao, duas vezes por showdown.

**Contagem por rank sem array de contadores.** Quatro bitmasks incrementais de 13
bits. Para cada carta, com `bit = 1 << rankIdx`:

```
se (mask3 AND bit) entao mask4 |= bit
senao se (mask2 AND bit) entao mask3 |= bit
senao se (mask1 AND bit) entao mask2 |= bit
senao mask1 |= bit
```

`mask1` = ranks vistos ao menos uma vez, `mask2` = ao menos duas, `mask3` = ao
menos tres, `mask4` = quatro.

**Naipe.** Quatro contadores mais quatro bitmasks de rank por naipe. Ha flush
quando algum contador chega a 5; a bitmask daquele naipe e a `flushMask`.

**`STRAIGHT_TOP`.** `Uint8Array(8192)` indexada pela bitmask de 13 ranks, montada
uma vez na carga do modulo (8192 iteracoes, custo desprezivel e pago uma vez).
O valor e o **indice** do rank alto do straight (0 a 12); `0` significa "nao ha
straight" — e sentinela segura porque straight com topo em 2 e impossivel (o
menor straight e a roda, topo 5 = indice 3). A roda A5432 e a mask **4111**
(bits 12, 3, 2, 1, 0) e devolve **3**. O straight flush sai da **mesma tabela**
aplicada a `flushMask`.

**Empacotamento do score.**

```
score = (categoria << 20) | (r1 << 16) | (r2 << 12) | (r3 << 8) | (r4 << 4) | r5
```

com os `r` em indice 0 a 12 e os desempates ausentes em 0. Nove categorias, de
`0` (carta alta) a `8` (straight flush) — os mesmos valores de `CATEGORY` em
`evaluator.ts:4-14`. Comparar maos vira comparar inteiro; empate de inteiro e
chop.

**Ordem das categorias identica a de hoje:** straight flush > quadra > full house
> flush > straight > trinca > dois pares > par > carta alta. O flush e
**detectado** antes (a contagem de naipe roda junto com a de rank), mas so
**vence** depois do full house — exatamente como `evaluator.ts`, que calcula
`flushRanks` no topo e so retorna `FLUSH` depois do bloco de full house.

**Por que esta receita e nao outra.** Nao e desenho novo: e o que o **Mind River**
(app desktop do proprio founder) usa em producao, medido em uso real — emenda A1
da F5. Adotar a receita validada custa menos que inventar a nossa e ainda entrega
o oraculo de comparacao de graca.

**Por que a ordem se preserva.** A lista de desempates de cada categoria e a
mesma do avaliador antigo, e o mapa rank-valor (2..14) para rank-indice (0..12) e
**monotono** — subtrair 2 nao troca nenhuma ordem. Logo, para duas maos
quaisquer, o sinal de `evaluate7(a) - evaluate7(b)` tem que ser igual ao sinal de
`compareHands(evaluateHand(a), evaluateHand(b))`. E isso, e so isso, que o teste
de paridade verifica: **ordem**, nao valor.

**Alternativa descartada — tabela perfect-hash de 7 cartas (estilo two-plus-two).**
Mais rapida ainda, mas exige tabela de dezenas de MB gerada offline, embarcada no
bundle do client. Inviavel para uma pagina web e desproporcional ao alvo (20 ms):
a receita bitmask ja passa o alvo com folga.

**O que custa:**
- Dois avaliadores no repositorio, com a obrigacao permanente de mante-los em
  concordancia. Divergencia so aparece no teste de paridade.
- `evaluate7` aceita **exatamente 7 cartas**; `evaluateHand` aceita 5 a 7. A
  paridade so pode ser amostrada em maos de 7 cartas, e o contrato mais estreito
  precisa estar escrito na assinatura.
- O empacotamento **assume que, dentro de uma categoria, o numero de desempates
  significativos e constante em 7 cartas** (quadra sempre tem kicker; trinca
  sempre tem dois; par sempre tem tres). E verdade em 7 cartas, e por isso o
  preenchimento com `0` nunca colide com um "2" real numa comparacao. Em 5 ou 6
  cartas a premissa cai — outro motivo para a assinatura ser fechada em 7.
- `1 << 31` e negativo em JavaScript. Toda checagem de bit precisa ser
  `(a AND b) !== 0`, nunca `> 0`. Vale para as mascaras de 52 bits da D-F1-4.

---

### D-F1-2 — Bordo iceado (board hoisting)

Alem de `evaluate7`, o motor usa um **contexto de bordo pre-alocado** no modulo:

- `loadBoard(ctx, c0, c1, c2, c3, c4)` — computa as mascaras (rank, naipe,
  contadores) das cinco cartas do bordo **uma vez**;
- `evalWithBoard(ctx, holeA, holeB)` — acrescenta so as duas cartas do jogador e
  devolve o score.

O bordo aqui e sempre **completo**: no flop sao as 3 do bordo mais as 2 do
runout; no turn, 4 mais 1; no river, as 5. Logo `loadBoard` sempre recebe cinco.

**Por que.** Economiza 5 das 7 insercoes por avaliacao. Num laco onde o mesmo
runout e usado por centenas de combos, o bordo e recomputado centenas de vezes
sem necessidade. E a mudanca de maior retorno por linha escrita depois do
proprio `evaluate7`.

**O que custa:**
- **Duas funcoes que tem que concordar sempre.** `evaluate7(b0..b4, h0, h1)` e
  `evalWithBoard(loadBoard(b0..b4), h0, h1)` devolvem o mesmo inteiro, para toda
  entrada. Isso e **contrato de teste**, nao comentario: e a unica defesa contra
  a divergencia entre o caminho rapido e o caminho de referencia.
- Contexto mutavel no escopo do modulo. Nao e reentrante: um unico contexto por
  execucao, e o motor e sincrono (D-F1-6), entao nao ha concorrencia dentro do
  worker. Precisa estar escrito, porque a proxima frente que quiser paralelizar
  vai tropecar aqui.

---

### D-F1-3 — Placar por runout: a otimizacao que faz o alvo de 20 ms

O laco ingenuo — para cada par (heroi, vilao), para cada runout, duas avaliacoes
— custa `runouts x H x V x 2` avaliacoes. O laco correto **inverte a ordem**:

1. **Laco externo = runout.** Para cada runout: `loadBoard` uma vez.
2. Avalia **cada combo do heroi uma vez** (H avaliacoes) para um `Int32Array`.
3. Avalia **cada combo do vilao uma vez** (V avaliacoes) para outro `Int32Array`.
4. Compara os pares **lendo os dois placares**: `H x V` comparacoes de inteiro,
   **sem avaliacao nenhuma**.

Custo total: `runouts x (H + V)` avaliacoes mais `runouts x H x V` comparacoes.

**No caso de aceite da spec** — mao unica do heroi contra 236 combos do vilao no
flop:

| Grandeza | Laco ingenuo | Laco por runout |
|---|---|---|
| Avaliacoes | 1176 x 236 x 2 = **555 mil** | 1176 x 237 = **cerca de 280 mil** |
| Comparacoes | (embutidas) | 1176 x 236 = **cerca de 277 mil** |

Somado ao ganho por avaliacao da D-F1-1 e da D-F1-2, e o que coloca os 555 ms
abaixo de 20 ms.

**O que custa (declarado, e importa):**
- **O gargalo muda de lugar.** No caso extremo (range vs range no flop) o custo
  dominante deixa de ser avaliacao e passa a ser **comparacao de pares**:
  `1176 x 1300 x 1300` comparacoes contra `1176 x 2600` avaliacoes. O modelo de
  custo do estimador (D-F1-5) tem que contar **comparacoes**, nao avaliacoes —
  contar avaliacoes subestimaria o trabalho por tres ordens de grandeza.
- **A palavra "showdown" muda de significado.** Hoje `showdown()`
  (`evaluator.ts:175`) faz duas avaliacoes. No motor novo, um showdown e uma
  comparacao de dois inteiros ja calculados. `EXACT_LIMIT` conta showdowns nesse
  sentido novo. Quem ler o numero com a semantica antiga erra a estimativa.
- Dois `Int32Array` vivos por runout, dimensionados por `H` e por `V`. Alocados
  uma vez por corrida, reutilizados entre runouts.

---

### D-F1-4 — Card removal mutuo por mascara de 52 bits em dois inteiros

E a armadilha que atravessa o projeto inteiro, registrada no indice como tal: **um
combo do heroi e um combo do vilao que dividem carta nao se enfrentam.** Produto
simples de pesos da numero errado com cara de certo.

**Mecanica.** Cada combo carrega duas mascaras: `lo` (cartas de codigo 0 a 31) e
`hi` (32 a 51). Um par e invalido quando

```
((hLo AND vLo) OR (hHi AND vHi)) !== 0
```

A mesma checagem vale contra a mascara do runout.

**Enumeracao.** No flop o motor enumera os `C(49,2) = 1176` runouts do baralho
menos o bordo e **pula, por par, os runouts que colidem** com as cartas daquele
par. Sobram exatamente `C(45,2) = 990` runouts validos **para todo par** — 52
cartas menos 3 do bordo, menos 2 do heroi, menos 2 do vilao. No turn sao 44; no
river, 1. **E essa constancia que permite dividir uma vez, no fim**, em vez de
carregar um contador por par.

**Denominador exato por combo do heroi.**

```
heroDen[h] = soma de w_v sobre os v compativeis com h
```

Custo `H x V`, barato, e **independente do runout** — calcula-se uma vez, fora do
laco.

**Equity por combo do heroi.**

```
equity[h] = heroWinSum[h] / (heroDen[h] * runoutsPorPar)
```

onde `heroWinSum[h]` acumula `w_v * valorDoShowdown` (0, 0.5 ou 1) sobre os pares
validos e os runouts validos daquele par.

**Combo sem oponente.** `heroDen[h] === 0` significa que **todo** combo do vilao
divide carta com `h`. Esse combo do heroi e **degradado**, com razao nomeada
`no_valid_villain_combo`, e fica **fora do agregado**. Nunca 0%. E a regra de
produto aplicada no lugar mais escondido possivel: numero errado perde para
numero ausente.

**Agregado do range do heroi.** O peso de cada combo do heroi no agregado e

```
w_h * heroDen[h]
```

isto e, **massa de pares validos** — nao `w_h` sozinho, e nunca produto simples
de pesos. Um combo do heroi que bloqueia metade do range do vilao pesa metade no
agregado, porque tem metade dos confrontos.

**Alternativa descartada — `Set<string>` de cartas por combo.** E o que o codigo
de hoje faz (`deadCards` monta `Set<string>` de `cardKey`). Correto e ilegivel de
graca, mas a checagem de colisao dentro de um laco de centenas de milhoes de
iteracoes com hash de string e insustentavel. Duas operacoes de bit resolvem o
mesmo.

**O que custa:**
- Duas palavras de estado por combo (`lo`, `hi`) e a disciplina de mante-las em
  sincronia com as cartas. A construcao do combo passa a ser a unica fonte
  dessas mascaras.
- `heroDen` e um vetor `Float64Array` de tamanho `H` que precisa ser recomputado
  a cada mudanca de range **ou** de bordo (o bordo muda quais combos existem).
- Um combo degradado por `heroDen === 0` desaparece do agregado, entao a soma dos
  pesos exibidos pode nao fechar com a massa do range. A UI tem que **dizer**
  quantos combos sairam e por que — senao o jogador conclui que perdeu maos em
  silencio, que e o defeito que a F0 corrigiu no parser.

---

### D-F1-5 — Exato e Monte Carlo

**Fronteira.** `EXACT_LIMIT = 4_000_000` showdowns — numero **medido em uso real**
no Mind River (emenda A2), nao os 5 milhoes que a proposta anterior chutava. A
estimativa de custo e

```
paresValidos * runoutsPorPar
```

Concretamente, o teto do modo exato fica em torno de **4 mil pares no flop**
(4M / 990), **91 mil pares no turn** (4M / 44) e **4 milhoes de pares no river**.
O caso de aceite (236 pares no flop = 233.640 showdowns) passa longe do teto;
range de BTN cheio contra range de BTN cheio no flop (1300 x 1300 x 990 = cerca
de 1,67 bilhao) passa longe do outro lado.

**Exato e o padrao.** Acima do orcamento a ferramenta **estima, mostra e sugere**
Monte Carlo — **nunca troca sozinha sem dizer** (RF-01.4). Rodar exato acima do
orcamento continua **permitido**: existe progresso e existe cancelamento, e o
jogador que quer o numero exato de um spot grande pode esperar por ele.

**Monte Carlo — o heroi permanece exaustivo.** A entrega da ferramenta e "quais
das minhas maos pagam". Amostrar o heroi estragaria exatamente o que se quer ler:
o jogador veria uma lista de maos com ruido diferente em cada mao. Amostra-se o
**par (combo do vilao, runout)**.

Cada amostra:
1. sorteia `v` com probabilidade proporcional a `w_v`;
2. sorteia o runout **uniformemente** do baralho menos o bordo menos `v`;
3. avalia **todos** os combos do heroi compativeis com aquele `v` e aquele
   runout.

**Rejeicao.** Uma amostra e rejeitada para um combo `h` quando `v` ou o runout
colidem com `h`. A rejeicao entrega exatamente a **distribuicao condicional
certa** para aquele `h` — a de pares validos com `h` — entao o estimador e
**nao-viesado** e o card removal continua **exato** dentro do Monte Carlo. Isso
tem que estar escrito, porque a leitura ingenua ("estamos jogando amostras fora,
o numero deve estar torto") e a que leva alguem a "consertar" o estimador
introduzindo vies.

**Peso 1 por amostra aceita.** Como `v` ja e sorteado proporcional ao peso, cada
amostra aceita entra com peso 1: a media por combo do heroi e **media simples**
de valores em `{0, 0.5, 1}`.

**Custo:** `S * (H + 1)` avaliacoes (um `loadBoard` e uma avaliacao do vilao por
amostra, mais uma por combo do heroi).

**Semente fixa `20240815`, PRNG proprio (mulberry32).** Sem semente fixa, dois
calculos do mesmo spot divergem e o jogador nao sabe em quem acreditar. Sem PRNG
proprio, `Math.random` nao aceita semente e uma dependencia nova violaria o
Artigo VII e a regra `01-tecnologia.md`.

**Intervalo de confianca de 95% obrigatorio** (decisao D5 do indice), por combo e
no agregado: `media +- 1.96 * s / raiz(n)`. **Numero de Monte Carlo sem intervalo
e bug.** Note que `n` e o numero de amostras **aceitas para aquele combo**, nao o
`S` global — combos que bloqueiam muito do range do vilao acumulam menos amostras
e por isso tem intervalo mais largo, o que e a informacao correta.

O agregado usa a **estatistica por amostra**: a media ponderada por `w_h` dos
combos do heroi vivos naquela amostra. Essa estatistica e iid entre amostras, o
que legitima o mesmo intervalo. E um **estimador de razao**, com vies da ordem de
`1/S`, desprezivel no `S` minimo adotado — e declarado aqui em vez de escondido.

**Aqui ficamos na frente do molde:** o Mind River **nao** mostra intervalo. Este e
o ponto onde copiar seria um erro.

**Orcamento por superficie (emenda A3).** Um numero global sobra para uns paineis
e falta para outros:

| Superficie | Iteracoes | Debounce |
|---|---|---|
| Selo de equity ao vivo (cartao de range) | 6.000 | 450 ms |
| Matriz 13x13 / distribuicao | 15.000 | 400 ms |
| Hotness (por carta que pode sair) | 2.500 | 400 ms |
| Fluxo rua a rua (por rua) | 12.000 | 400 ms |
| Range Finder (por mao, 169 maos) | 3.000 | — |

**Recalculo preguicoso (emenda A4).** Painel invisivel **nao roda**: marca-se
sujo e recalcula ao aparecer. Sem isso, a pagina de tres paineis dispara varias
corridas a cada tecla.

**O que custa:**
- Dois caminhos de calculo para manter concordantes. Com `S` suficiente, o Monte
  Carlo tem que convergir para o exato dentro do intervalo — e isso e teste, nao
  esperanca.
- O intervalo por combo exige acumular soma e soma de quadrados por combo do
  heroi, mais o contador de aceitas: tres vetores em vez de um.
- Um painel pode exibir numero com incerteza maior do que a diferenca que o
  jogador esta tentando enxergar. O intervalo e justamente o que permite a ele
  perceber isso — mas so se a UI mostrar, e nao houver caminho que o esconda.

---

### D-F1-6 — Stepper, nao laco

Um laco sincrono **dentro** de um Worker nao recebe `postMessage`: a fila de
mensagens do proprio worker so drena entre tarefas. Cancelamento por mensagem so
funciona se o trabalho for **fatiado**.

**O motor e um stepper puro e sincrono.** `createEngineRun(request)` devolve

```
{ totalUnits, step(maxUnits), progress(), result(), cancel() }
```

Sem timer, sem Worker, sem `Date.now` obrigatorio dentro da matematica.

**O Worker e casca fina:** dirige o stepper e **cede a thread** com
`setTimeout(0)` entre fatias. E o ceder que deixa a mensagem de cancelamento
chegar.

**Fatia = 200 ms OU 200 mil unidades**, o que vier primeiro; o cancelamento e
checado no mesmo ponto (emenda A2).

**Por que essa forma e nao um laco com callback de cancelamento.** Um callback
consultado de dentro do laco so consegue ler estado que ja esta na mesma thread —
e a mensagem de cancelamento nunca chega la, porque o laco nunca devolve o
controle ao event loop. O stepper resolve o problema na estrutura, nao na
disciplina.

**Consequencia de teste, que e metade do valor da decisao:** o teste dirige
`step()` **direto**. Nada de fake timer, nada de Worker em jsdom, nada de
`await` de mensagem. Progresso, cancelamento e resultado parcial viram assercoes
sincronas.

**O que custa:**
- O estado da corrida deixa de ser variavel local do laco e passa a ser campo de
  um objeto: indice de runout, indice de par, acumuladores. Codigo mais verboso
  que o laco equivalente.
- `totalUnits` precisa ser calculavel **antes** de comecar, senao nao ha barra de
  progresso honesta. Isso amarra o estimador (D-F1-5) ao stepper: os dois contam
  a mesma unidade.

---

### D-F1-7 — Contrato do Worker

**Entrada:** `{ type: 'run', runId, request }` e `{ type: 'cancel', runId }`.

**Saida:** `{ type: 'progress', runId, percent }`,
`{ type: 'done', runId, result }`, `{ type: 'error', runId, error }`.

**`runId` monotonico.** Mensagem com `runId` diferente do atual e **descartada
pelo cliente**. Resultado velho nunca pinta a tela — este e literalmente o caso
de teste "trocar o bordo no meio do calculo", e o defeito que ele previne
(resultado de um bordo antigo aparecendo sobre o bordo novo) e do tipo que passa
despercebido por semanas.

**A expansao do range acontece DENTRO do worker.** O payload e
`RangeEntry[]` mais o bordo — **nao** lista de combos. Menos trabalho na main
thread e payload menor: um range grande vira centenas de objetos `[Card, Card]`
que nao precisam atravessar a fronteira de serializacao.

**Sem `Worker` disponivel** (teste, SSR, navegador antigo): **runner sincrono com
o mesmo contrato**. A criacao do Worker vai em `try/catch` com fallback — mesma
classe das licoes #5 e #35 do `CLAUDE.md` (construtor que nao existe ou nao e
chamavel no ambiente de teste; o `try/catch` cobre producao e teste sem ramo
duplicado de logica).

**O cache de equity migra para dentro do worker** e e invalidado por bordo. Hoje
ele vive em `equity.ts:62` como `Map` de escopo de modulo na main thread, com cap
de 50 mil e `clear()` total ao estourar. Dentro do worker, a chave deixa de
precisar carregar o bordo em todas as entradas: troca-se o bordo, joga-se o cache
fora.

**O que custa:**
- Dois runners (worker e sincrono) que tem que produzir resultado identico. E
  contrato de teste.
- O fallback sincrono **bloqueia** a main thread. Em ambiente sem Worker isso e
  aceitavel (teste), mas se um navegador real cair nesse ramo o sintoma volta a
  ser a tela travada de hoje. O ramo precisa ser observavel, nao silencioso.
- `runId` cria estado no cliente do motor. Um cliente que esqueca de compara-lo
  reintroduz o bug que a decisao existe para matar — o descarte tem que morar no
  cliente do motor, uma vez, e nao em cada painel.

---

### D-F1-8 — `EngineResult` e uniao discriminada

```
{ status: 'ok', ... } | { status: 'degraded', reason, ... }
```

O compilador passa a **cobrar o `if`**.

**Por que.** Esta e a licao escrita na F0 (decisao D8 do indice): hoje
`Verdict.decision` e `Decision | null`, mas o objeto **ainda carrega** `evCall` e
`equityGap` calculados. Quem le um numero sem checar `decision != null` faz voltar
o "-13,8 fichas" fantasma na tela. No tipo novo isso vira **erro de compilacao**
em vez de disciplina — e disciplina e exatamente o que nao sobrevive a uma
fronteira de worker, de export ou de prompt do Coach (F4).

**`degradedReason` do motor e uniao aberta:**
`empty_hero_range | empty_villain_range | no_valid_pairs`.
**O consumidor guarda por `status`, NUNCA pela razao especifica** — razao nova
entra sem quebrar consumidor.

**Dois niveis de degradacao, que nao se confundem:**

| Nivel | Onde | Valores | Efeito |
|---|---|---|---|
| Corrida | `EngineResult.reason` | `empty_hero_range`, `empty_villain_range`, `no_valid_pairs` | Nao ha resultado; a UI mostra empty state |
| Combo | `HeroComboResult` | `no_valid_villain_combo` (D-F1-4) | Ha resultado; **aquele** combo sai do agregado e e listado a parte |

**O `Verdict` v1 nao muda de comportamento e `evaluateSpot` nao e reescrita.**
201 testes verdes e o popup dependem deles, e `evaluateSpot` e o **oraculo de
regressao** do motor novo (criterio de aceite 3: mao unica produz exatamente o
mesmo veredito de hoje). Os campos novos que a F1 acrescenta ao `Verdict`
(D-F1-9) sao **opcionais** e populados **somente** pelo caminho novo;
`evaluateSpot` nunca os preenche. `Verdict.degradedReason` continua com o
vocabulario da F0 (`"empty_range"`), separado do vocabulario do motor.

**Alternativa descartada — reaproveitar `Verdict` como saida do motor, com mais
campos anulaveis.** Mantem um tipo so, mas herda exatamente a propriedade que a
F0 documentou como armadilha: objeto degradado carregando numero finito que
alguem vai ler. Um tipo unico com dez campos "so validos se X" e disciplina
disfarcada de modelo.

**O que custa:**
- Dois vocabularios de degradacao vivos ao mesmo tempo (`Verdict` v1 e
  `EngineResult`). Sao mundos diferentes por decisao, e essa tabela e o unico
  lugar onde a diferenca esta escrita.
- Todo consumidor do motor ganha um `if` obrigatorio. E o ponto — mas e
  verbosidade real em cada painel.

---

### D-F1-9 — Modelo v2 do Spot

```
SpotV2 {
  board: Card[];
  heroRange: RangeEntry[];
  villainRange: RangeEntry[];
  potCurrent: number;
  callAmount: number;
}
```

**Mao unica e o caso de UMA entry `specific` com frequencia 1** — **sem caminho
de codigo separado**, para nao divergir (RF-01.2). A UI mantem os dois modos
visiveis ("Minha mao" / "Meu range"); os dois produzem `heroRange`.

Por que sem caminho separado: um ramo dedicado a mao unica seria o ramo que 90%
do uso exercita e 100% dos bugs de range escapam. Um caminho so significa que o
teste do caso simples tambem cobre a mecanica do caso composto.

**`Verdict` ganha, no mundo novo:**
- `perHeroCombo: HeroComboResult[]` — equity, EV do call e decisao por combo do
  heroi, ordenavel;
- `heroRangeEquity` — equity agregada, ponderada por massa de pares validos
  (D-F1-4);
- `callThresholdIndex` — quantos combos do heroi tem EV de call `>= 0`. **E a
  resposta direta de "quantas das minhas maos pagam"** — a razao de existir da
  frente inteira.

**Persistencia.** Chaves `grindfy.comboCalc.draft.v2` e
`grindfy.comboCalc.spots.v2`. A **v1 e lida uma vez e convertida**
(`hero: string[]` vira `heroRange` com uma entry `specific` de frequencia 1), e a
**chave v1 nao e apagada**. Criterio de aceite 5 e item 7 do handoff: rascunho e
spot salvos antes da F1 abrem sem perda.

Nao apagar a v1 e barato e compra o caminho de volta: se a F1 precisar ser
revertida em producao, o dado do jogador continua la, no formato que a versao
anterior le.

**O que custa:**
- `Spot` (v1) e `SpotV2` coexistem enquanto `evaluateSpot` e o popup existirem.
  Duas formas do mesmo conceito e divida real, e o nome `SpotV2` e o marcador
  dela.
- A leitura da v1 precisa ser **idempotente** e tolerante a lixo — o
  `sanitizeSavedSpot` da F0 ja da a base, mas a conversao acrescenta um ponto de
  falha novo por spot salvo.
- Dado duplicado em `localStorage` (v1 e v2 lado a lado) ate alguem decidir
  limpar. Custo em bytes, desprezivel; custo em confusao ao depurar, real.

---

### D-F1-10 — Pagina, tokens e z-index

**Rota nova `/range-lab`** em `App.tsx`. Tres paineis: **range** (esquerda) |
**bordo + veredito** (centro) | **leitura** (direita, vazia ate a F3). Colapsa
para coluna unica abaixo de `lg`.

**`/calculadoras` aba "Combos" vira atalho** que navega para `/range-lab`. Link
tem que casar com rota registrada — **licao #19**: CTA para rota inexistente cai
no `<NotFound/>` **sem erro no console**, e o defeito so aparece quando alguem
clica.

**O popup `/calculadora-popup/combos` continua servindo o `CombosCalculator`
compacto atual, intocado** — ele existe para ficar ao lado da mesa, sem range vs
range.

**`CombosCalculator.tsx` (1142 linhas) quebrado por responsabilidade** na pagina
nova: `BoardPicker`, `RangeMatrix`, `RangeEntryList`, `BetInputs`,
`VerdictPanel`, `ComboTable`, `SpotLibrary`. A quebra e **extracao**: os
componentes saem do arquivo e o `CombosCalculator` permanece como a **composicao
compacta** que o popup consome, recomposta a partir das pecas extraidas.
Comportamento do popup nao muda; o arquivo, sim.

**Escala de calor (emenda A18) entra em `client/src/lib/ui-tokens.ts` como export
SEPARADO `heat`, NAO dentro de `tokens.color`.** Motivo explicito: a **licao #22**
registra que meter shape heterogeneo dentro de `tokens.color` quebrou `ColorKey` e
os consumidores de swatch — foi exatamente o que aconteceu com `tokens.color.delta`,
que precisou de `ColorKey` declarado como literal e de um `DeltaTone` a parte
(`ui-tokens.ts:196-213`). Repetir o erro conhecido custaria a mesma correcao de
novo.

Tres derivacoes, porque uma so nao serve:
- **absoluta 0-100%** para equity;
- **relativa** ao min e ao max do conjunto, para quando o que importa e o
  **ranking** e nao o valor (hotness, Range Finder);
- **variante escurecida para TEXTO** — o amarelo do meio da escala e ilegivel
  como cor de fonte.

**Barra de veredito e sticky:** usa a faixa **"Sticky headers de pagina" = `z-50`**
da tabela canonica de `Docs/conventions/z-index.md`. **Se ocupar camada nova,
atualizar aquela tabela** — a regra de manutencao da tabela e explicita e a divida
de nao atualizar so aparece quando dois overlays brigam.

**Botao Reset (emenda A19):** limpa **tudo** — ranges, bordo, cartas mortas,
filtros — e o tooltip diz isso **antes** do clique. Acao destrutiva anunciada
antes, nao explicada depois.

**Bordo sem fileira de slots (emenda A20):** baralho unico; as 3 primeiras cartas
viram flop, a 4a turn, a 5a river; clicar de novo remove. Botao `Aleatorio`:
bordo vazio sorteia o flop inteiro; com flop na mesa, completa **uma carta por
vez**. Menos clique e menos estado do que a fileira de slots atual.

**O que custa:**
- Superficie nova a manter, com o `CombosCalculator` compacto vivo em paralelo.
  Duas telas para a mesma matematica; a divergencia entre elas e um risco
  permanente, mitigado por serem o **mesmo nucleo** e nao duas implementacoes.
- A quebra em sete componentes toca 1142 linhas sem nenhum teste `.test.tsx` de
  wiring — a F0 fechou com essa pendencia declarada, e os `data-testid` ja
  plantados (`combos-empty-state`, `combos-empty-range`,
  `combos-duplicate-card`, `combos-import-warnings`, `combos-card-notice`)
  seguem sem uso. Refatorar UI sem teste de wiring e exatamente o padrao de
  `memory/session_2026-04-27-tts-wiring` (unit verde, zero integracao, quebrado
  em producao).
- `heat` como export separado significa que quem quiser cor de calor precisa
  saber que ela nao esta em `tokens.color`. Custo de descoberta, pago uma vez, em
  troca de nao quebrar `ColorKey` de novo.

---

## Consequencias

### Criterios de aceite da F1, como consequencias verificaveis

| # | Criterio | Como se verifica |
|---|---|---|
| 1 | Paridade avaliador novo x antigo, amostra com semente fixa, sem divergencia | Sorteio de maos de **7 cartas** com `mulberry32(20240815)`; para cada par de maos, o **sinal** de `evaluate7(a) - evaluate7(b)` e igual ao sinal de `compareHands(evaluateHand(a), evaluateHand(b))`. Divergencia = falha. Compara-se **ordem**, nao valor (D-F1-1) |
| 2 | Flop de 236 combos abaixo de 20 ms no motor; main thread livre durante o calculo | Medicao do stepper isolado no caso `Ad 8h 4h`, 236 combos: 1176 x 237 avaliacoes + 1176 x 236 comparacoes (D-F1-3). Main thread livre e consequencia do Worker (D-F1-7) |
| 3 | Mao unica produz **exatamente** o mesmo veredito de hoje | Regressao contra os golden tests do commit `2aed9b1d`. `evaluateSpot` **nao e reescrita** e serve de oraculo (D-F1-8) |
| 4 | Monte Carlo nunca exibe numero sem intervalo de confianca | O tipo do resultado de MC carrega o intervalo; nao ha caminho de UI que leia a media sem ele (D-F1-5) |
| 5 | Rascunho v1 no localStorage abre sem perda depois do deploy | Leitura unica da chave v1, conversao para `heroRange`, chave v1 **preservada** (D-F1-9) |
| 6 | `npm run check` limpo; suite da area verde | `npx vitest run tests/unit/combo-calc` — 201 testes existentes mais os novos |

### Obrigacoes de teste que nascem deste ADR

- `evaluate7(b0..b4, h0, h1) === evalWithBoard(loadBoard(b0..b4), h0, h1)` para
  toda entrada amostrada (D-F1-2).
- `STRAIGHT_TOP[4111] === 3` (a roda) e `STRAIGHT_TOP[mask] === 0` para toda mask
  sem straight (D-F1-1).
- Par com carta compartilhada **nunca** entra na conta; `heroDen[h]` bate com a
  contagem exata de combos compativeis (D-F1-4).
- `heroDen[h] === 0` produz combo degradado com razao
  `no_valid_villain_combo`, fora do agregado, e **nunca** 0% (D-F1-4).
- Monte Carlo com `S` alto converge para o exato dentro do intervalo de 95%
  (D-F1-5).
- `cancel()` no meio de uma corrida interrompe no proximo limite de fatia, com o
  teste dirigindo `step()` direto (D-F1-6).
- Mensagem com `runId` velho e descartada e nao altera estado do cliente
  (D-F1-7).
- Runner sincrono e runner de worker produzem resultado identico (D-F1-7).

### Positivas

- O caso de aceite sai de **555 ms para menos de 20 ms**, e o range vs range no
  flop deixa de ser inviavel e passa a ser uma escolha declarada entre exato e
  Monte Carlo.
- A pergunta central do estudo — **"quais das minhas maos pagam?"** — passa a ter
  resposta direta (`callThresholdIndex`), que e o diferencial que nenhuma das
  ferramentas de referencia entrega.
- Card removal mutuo fica **exato nos dois modos**, inclusive no Monte Carlo. O
  erro que "nao parece errado" e fechado por construcao, nao por revisao.
- O tipo do resultado passa a **impedir** a leitura de numero degradado; a
  disciplina da F0 vira erro de compilacao.
- A main thread nunca bloqueia, e resultado velho nunca pinta a tela.
- O avaliador antigo ganha uma segunda vida util como oraculo, em vez de virar
  codigo morto.

### Negativas

- **Duas implementacoes do mesmo conceito, em tres pares:** avaliador antigo e
  novo; `evaluate7` e `evalWithBoard`; runner sincrono e runner de worker. Cada
  par so se sustenta por teste de concordancia; sem eles, a divergencia e
  silenciosa e demora a aparecer.
- **`Spot` e `SpotV2` coexistem**, e com eles dois vocabularios de degradacao
  (`Verdict.degradedReason` da F0 e `EngineResult.reason` do motor). Isso e
  divida assumida, com prazo indefinido — o popup mantem a v1 viva.
- **O gargalo muda de lugar** (D-F1-3). Quem estimar custo contando avaliacoes,
  e nao comparacoes, subestima o trabalho por ordens de grandeza no caso range vs
  range.
- **A palavra "showdown" muda de significado** entre o codigo antigo e o novo.
  `EXACT_LIMIT` e contado no sentido novo.
- **A quebra de 1142 linhas de UI acontece sem teste de wiring**, pendencia
  herdada e declarada da F0. E o risco de execucao mais alto desta frente, e ele
  nao e matematico.
- **Monte Carlo introduz numero aproximado no produto.** Mitigado pelo intervalo
  obrigatorio, mas a mitigacao depende de nenhuma superficie futura mostrar a
  media sozinha.
- O contexto de bordo pre-alocado **nao e reentrante**. Qualquer tentativa
  futura de paralelizar dentro do worker esbarra nisso.

### Neutras / operacionais

- **Sem migration.** Sem endpoint novo. Sem mudanca em `shared/schema.ts`. Toda a
  frente e client-side; a persistencia em servidor e assunto da F4
  (migration 0101, decisao D3 do indice).
- **Sem dependencia nova** no `package.json`: tabela propria, PRNG proprio,
  Worker nativo.
- Uma camada de `z-index` ocupada (`z-50`, faixa "Sticky headers de pagina"), sem
  camada nova criada. Se isso mudar, `Docs/conventions/z-index.md` precisa mudar
  junto.
- Um export novo em `@/lib/ui-tokens` (`heat`), fora de `tokens.color` — sem
  impacto em `ColorKey` nem nos consumidores de swatch.
- A F2 (range builder) e a F0 podem correr em paralelo com esta frente: tocam
  arquivos diferentes. A F3, a F4 e a F5 **dependem** do modelo v2 entregue aqui.

---

## Confianca

**Alta** para D-F1-1, D-F1-2, D-F1-3 e D-F1-4. A receita do avaliador e o
orcamento de iteracoes vem de um app em uso real (Mind River, emendas A1 a A3), a
inversao do laco tem aritmetica fechada e verificavel a mao, e o card removal
mutuo por mascara e mecanico. A paridade contra o avaliador atual da uma rede de
seguranca que nao depende de julgamento.

**Alta** para D-F1-6, D-F1-7 e D-F1-8. O stepper resolve o cancelamento na
estrutura (a fila do worker so drena entre tarefas — isso e propriedade da
plataforma, nao opiniao), o descarte por `runId` e uma comparacao, e a uniao
discriminada transfere para o compilador uma disciplina que a F0 ja documentou
como perdida na pratica.

**Media** para D-F1-5. A matematica do estimador esta correta e declarada
(rejeicao entrega a condicional certa; o agregado e estimador de razao com vies
`O(1/S)`), mas os **numeros de iteracao por superficie sao herdados de outro
app** — as superficies do Range Lab nao sao as mesmas, e o `S` de cada painel
pode precisar de ajuste depois de medido aqui. O intervalo de confianca protege o
jogador de acreditar demais num numero mal orcado; ele nao substitui a medicao.

**Media** para D-F1-9 quanto a convivencia `Spot` / `SpotV2`: a decisao esta
certa para esta frente, mas o prazo da divida depende de quando o popup migrar, e
isso nao esta decidido em lugar nenhum.

**Media** para D-F1-10. A superficie e a unica parte da frente que **nao** tem
oraculo: nao ha golden test, nao ha avaliador antigo para comparar, e nao ha teste
de wiring. E onde uma regressao passa despercebida ate o founder clicar. Os oito
itens do "Confira voce mesmo" do handoff da F1 sao, hoje, a unica verificacao
dessa parte.

---

## Artefatos relacionados

- Specs: `Docs/specs/range-lab/00-INDICE.md`, `Docs/specs/range-lab/F1-motor.md`,
  `Docs/specs/range-lab/F0-verdade.md`, `Docs/specs/range-lab/F5-mindriver.md`
- Diagramas: `Docs/architecture/diagrams/range-lab-f1/`
  - `avaliador-bitmask.mermaid` — avaliacao de 7 cartas, da codificacao ao score
  - `motor-loop.mermaid` — laco por runout com os dois pontos de card removal
  - `worker-sequence.mermaid` — UI, cliente do motor, Worker e stepper
  - `modelo-v2.mermaid` — `SpotV2`, `EngineRequest`, `EngineResult`, `Verdict` v1
- Codigo afetado: `client/src/lib/combo-calc/` (`fastEvaluator.ts` novo;
  `evaluator.ts` preservado como oraculo; `equity.ts`, `types.ts`,
  `persistence.ts` estendidos; `evaluateSpot.ts` **intocado**),
  `client/src/components/calculators/CombosCalculator.tsx`,
  `client/src/lib/ui-tokens.ts`, `client/src/App.tsx`
- Convencoes: `Docs/conventions/z-index.md`,
  `Docs/conventions/ui-patterns.md`, `.claude/rules/03-padrao-codigo.md`,
  `.claude/rules/14-frontend-ui.md`
- Licoes do `CLAUDE.md` invocadas: **#5** e **#35** (construtor em ambiente de
  teste), **#19** (CTA tem que casar com rota registrada), **#22** (shape
  heterogeneo em `tokens.color`), **#9** (log antes do fallback)
- Sprint anterior: F0, commit `ea0f8303`. Sprint original da calculadora:
  commit `2aed9b1d`
