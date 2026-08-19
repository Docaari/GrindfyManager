# ADR-249: Range Lab F3b — aritmetica da decisao (dois alphas com nomes proprios, cascata com base declarada, contrafactual de bloqueador sem segunda corrida)

## Status
Aceito

## Data
2026-08-18

Specs de origem: `Docs/specs/range-lab/F3b-decisao.md` (o **o que**),
`Docs/specs/range-lab/F3-detalhamento.md` (o **porque**, aprovado pelo founder em
2026-08-18 — achados F-1 a F-5, decisoes D-F3-12/13/16, secao 6 com o detalhe dos
RFs) e `Docs/specs/range-lab/00-INDICE.md` (D8, D10, D11, D12, D14 e a serie
D-F3-*).

Modelo e esforco declarados na spec: **Opus 5 — Alto**. A F3b nao toca nenhuma
das sete zonas criticas de `.claude/rules/04-modelo-e-esforco.md`. O `Alto` vem
do achado F-1, que e do genero que a `00-produto.md` poe acima de tudo: **numero
errado que nao parece errado**. `MDF = 1 - requiredEquity` produz um numero
plausivel, estavel e falso, e ele iria para a tela ao lado do numero certo.

> **Nota de numeracao:** ultimo ADR em disco na abertura desta sessao e o **248**
> (`248-range-lab-f3a-leitura-categorias.md`). Este usa o proximo livre = **249**.

Este ADR **nao reabre** as decisoes ja fechadas pelo founder (D-F3-12, D-F3-13,
D-F3-16, F-4, F-5). O que ele acrescenta e: (a) onde cada uma aterrissa no
codigo, (b) as decisoes novas que o levantamento exigiu — numeradas a partir de
**D-F3-23**, porque a F3a foi ate a D-F3-22 —, (c) **tres pontos onde o
levantamento de entrada estava errado**, refutados com o codigo na mao, e (d) uma
correcao de criterio de aceite que a spec nao poderia ter previsto.

---

## Contexto

### O que a F1 e a F3a deixaram pronto e este ADR nao reabre

| Onde | Contrato herdado |
|---|---|
| `engine/types.ts` | `EngineResult` e uniao discriminada `ok \| degraded` (D12). `HeroComboResult.pairMass` = massa do vilao que aquele combo enfrenta. `VillainComboResult` = espelho, **sem** `evCall`/`decision` (D-F3-20 da F3a) |
| `engine/run.ts` | `createEngineRun` monta `pairMass` e `villainPairMass` num laco `O(H*V)` fora do caminho quente; `assemble` percorre **todos** os combos dos dois lados |
| `engine/expand.ts` | `expandRangeV2(entries, dead)` -> `{ combos, emptyEntries, totalWeight }`, com dedupe por `comboKey` e `clampFreq` |
| `ev.ts` | `requiredEquity(potCurrent, callAmount) = call / (pot + call)`, com `potCurrent` **ja incluindo** a aposta |
| `evaluateSpot.ts` | `verdictCalcBasis(verdict)` -> `discrete` no river, `effective` fora dele (D10). E o vocabulario que a cascata herda |
| `evaluator.ts` | `evaluateHand(cards)` aceita **5 a 7** cartas. E o avaliador da classificacao (D-F3-17) |
| `fastEvaluator.ts` | `loadBoard(a..e)` + `evalWithBoard(holeA, holeB)`: **estado de modulo**, deliberado, zero alocacao por chamada |
| `read.ts` | `buildRangeRead(combos, board)` -> `totalMass` do bloco de maos feitas. E o ponto de contato da F3a com a cascata |
| `@/lib/ui-tokens` | `heat` e `categoryPalette` vivem **fora** de `tokens.color` (licao #22) |
| `uiRules.ts` | Precedente de **frase PT-BR nascendo de funcao pura** (`describeSpotReadiness`), fora do JSX |

### O problema

O painel do meio de `/range-lab` diz **call** ou **fold** e mostra a equity. Ele
nao diz de onde aquele numero veio, o que as suas cartas mataram do range dele,
nem quanto ele precisaria blefar para a aposta fazer sentido. Sao as tres
perguntas que o jogador faz depois de ler o veredito — e as tres que nenhuma
ferramenta do benchmark entrega mastigada.

### Restricoes que este ADR nao reabre

- **Numero errado perde para numero ausente** (`00-produto.md`): ausencia de dado
  devolve `null` com razao nomeada, nunca zero.
- **`EngineResultOk` nao muda nesta frente.** A F3a ja pagou `perVillainCombo`, e
  ele e o insumo. Nenhuma decisao abaixo exige campo novo no motor — ver
  "Refutacao 1", que e justamente o motivo.
- Sem migration, sem endpoint, sem backend, sem dependencia nova.
- Nucleo puro (`mdf.ts`, `confront.ts`, `cascade.ts`, `blockers.ts`) nao importa
  React e nao toca `window`.

---

## Refutacoes — tres pontos do levantamento de entrada que o codigo derruba

Ficam aqui na frente porque **mudam o desenho**, nao so o texto.

### Refutacao 1 — os combos bloqueados APARECEM em `perVillainCombo`

O levantamento afirmava: *"o motor exclui por `collides()` os pares que dividem
carta, logo os combos do vilao bloqueados pela sua mao nunca aparecem em
`perVillainCombo`"*. Falso, e o codigo e explicito.

`collides()` governa o **laco de pares** (`run.ts:196`), nao a lista de saida.
`assemble` percorre `for (let v = 0; v < V; v++)` sobre **todos** os combos
expandidos (`run.ts:754`), e o combo sem par valido entra na lista assim:

```
pairMass: 0
equity: null
degradedReason: "no_valid_villain_combo"
weight: <o peso declarado, intacto>
```

Isso ja e **testado e verde** desde a F3a:
`tests/unit/combo-calc/f3a-per-villain-combo.test.ts:278-283`
(*"KsQs bloqueado pela unica mao do heroi degrada com razao nomeada"*),
`expect(orfao.pairMass).toBe(0)`.

**Consequencia:** `blockers.ts` **nao reenumera o range do vilao**. O conjunto
bloqueado, com peso declarado e tudo, sai de graca de `perVillainCombo`
filtrando `pairMass <= EPS` — e, para a atribuicao **por carta**, testando
pertinencia da carta no combo. O unico numero que falta e a equity ficticia dos
pares impossiveis, e so ela justifica trabalho novo.

### Refutacao 2 — o degrau 4 nao e `sum(pairMass)`

A spec escreve o degrau 4 como *"`sum(pairMass)` do lado do vilao"*. Somar
`villainPairMass[v]` sobre `v` da `SUM sobre pares validos de w_h`: a unidade e
**massa do heroi contada uma vez por combo do vilao**. Com heroi de massa 1 e
200 combos vivos do vilao, esse degrau marcaria **200** logo abaixo de um degrau
3 que marcou, digamos, **138** — a barra subiria. E um numero errado com cara de
certo, exatamente o genero que a frente veio matar.

A grandeza que o degrau quer e "quanto da massa **dele** sobrevive as **suas**
cartas", e ela e:

```
degrau4 = SUM_v  w_v * ( villainPairMass[v] / heroTotalWeight )
```

Com heroi de mao unica, `villainPairMass[v]` e `0` ou `w_h`, a fracao e `0` ou
`1`, e a formula colapsa para a leitura intuitiva: **soma dos pesos dos combos
vivos**. Com heroi como range ela e a esperanca sobre o seu range — que e a unica
leitura honesta quando "a sua carta" nao existe. Fica na mesma unidade do degrau
3, entao a barra e monotona por construcao.

### Refutacao 3 — o criterio de aceite 6 e a spec descrevem invariantes diferentes, e nenhuma das duas frases fecha no degrau 5

O criterio 6 diz *"o total do ultimo degrau bate com a massa do range"*; o corpo
da spec diz *"o total do ultimo degrau tem que bater com o total do bloco de maos
feitas da F3a"*.

Lendo o codigo: `RangeLab.tsx:251` monta `villainReadCombos` a partir de
`perVillainCombo` **inteiro**, blocked incluso, e `buildRangeRead` soma `weight`
de todos (`read.ts:151`). Logo:

```
total do bloco de maos feitas da F3a  ==  degrau 3  (apos card removal do bordo)
```

O degrau 5 e subconjunto do degrau 4, que e subconjunto do degrau 3. Ele **nao
pode** bater com o bloco da F3a — e se batesse, um dos dois estaria errado.

**A invariante testavel e no degrau 3**, e ela e forte justamente por isso: os
dois paineis so contam a mesma historia se o ponto de partida da cascata for
identico ao total do painel de categorias. A queda do degrau 3 para o 4 e
**exatamente o que a cascata existe para mostrar**. O criterio 6 e reescrito nas
consequencias.

---

## Decisao

### D-F3-23 — `mdf.ts` devolve UNIAO DISCRIMINADA, nao objeto com campos nulos

```ts
export type MdfResult = MdfOk | MdfDegraded;
```

A spec diz *"`P <= 0` -> tudo `null` com razao `invalid_pot_before_bet`"*, o que
admitiria as duas formas. Escolhida a uniao, contra o objeto de campos nullable,
pelo precedente **D12** — que recusou "campos opcionais no `Verdict`" com o
argumento da **D8**: objeto degradado que carrega campo lido e objeto que alguem
le.

O argumento aqui e um degrau mais forte que em D12, e vale registrar por que.
Com campos nulos, `bluffsNeeded` precisaria de `defenseAlpha` e todo consumidor
escreveria `if (m.defenseAlpha != null)` — a mesma disciplina que a F0 provou nao
sobreviver. Com a uniao, `computeBluffBalance(mdf: MdfOk, ...)` **so aceita o
caso valido**, e o compilador cobra o `if` uma vez, no lugar certo. E o requisito
de tela da D-F3-16 fecha junto: `P <= 0` vira **frase de estado sem numero**, e o
unico jeito de garantir que nenhum numero vaze e nao ter numero no objeto.

`P <= 0` **e** `P` nao finito caem na mesma razao `invalid_pot_before_bet`: o
jogador digitando o pote produz `NaN` no meio da digitacao, e um `NaN` que passa
vira `alpha = NaN` e um cartao inteiro de tracinhos sem explicacao.

**Forma de calculo fixada:** `bluffsNeeded = valueMass * defenseAlpha / (1 - defenseAlpha)`
simplifica **exatamente** para `valueMass * B / P`. E essa a forma implementada —
uma divisao em vez de tres operacoes, e o unico denominador que aparece e o `P`
que a guarda ja protegeu. Aposta de pote (`B = P`) da `bluffsNeeded = valueMass`,
que e a razao 1:1 conhecida do river, e vira teste.

### D-F3-24 — a separacao value / blefe / chop mora num TERCEIRO modulo, `confront.ts`

Dois paineis precisam da mesma conta: o MDF (para `valueMass` e `bluffMass`) e o
bloqueador (para "quantos combos de value esta carta remove"). Portanto ela nao
pode morar em nenhum dos dois.

- Em `mdf.ts` faria `blockers.ts` importar `mdf.ts`, e `mdf.ts` deixaria de ser o
  modulo de aritmetica minima que a D-F3-12 pediu.
- Em `blockers.ts` faria `mdf.ts` importar o modulo pesado — o oposto da D-F3-12.

Modulo novo `client/src/lib/combo-calc/confront.ts`, com a arvore de dependencia
ficando aciclica e rasa:

```
mdf.ts        (nao importa NADA alem de tipos)
confront.ts   (evaluator.ts)
cascade.ts    (engine/expand.ts, confront.ts)
blockers.ts   (fastEvaluator.ts, confront.ts)
```

**Como o confronto e decidido**, com heroi de mao unica: pelo **showdown no bordo
atual**, via `evaluateHand` (5 a 7 cartas — o mesmo avaliador da D-F3-17, pelo
mesmo motivo: e o oraculo, aceita flop e turn sem inventar carta). Combo que bate
o heroi = `value`; que perde = `bluff`; empate = `chop`, **terceira contagem, nao
distribuida**. A tela declara isso com essas palavras: **nao e a intencao do
vilao, e o resultado contra a sua mao**.

**Com heroi como range** o showdown nao existe, e o criterio passa a ser a equity
do combo contra o range do heroi (`perVillainCombo[v].equity`): acima de 0,5 =
value, abaixo = blefe, exatamente 0,5 = chop. Declarado na tela como *"ganha do
seu range na media"*, que e outra frase — dois metodos, dois rotulos, nunca o
mesmo texto para os dois. O metodo viaja no resultado
(`ConfrontMethod = "showdown_now" | "equity_vs_range"`).

**Combo com `equity: null` vai para um quarto balde `unknown`, nunca para
`bluff`.** E o ponto mais perigoso do modulo: no Monte Carlo um combo sem amostra
tem `equity: null`, e joga-lo no balde de blefe **infla os blefes dele** e vira o
veredito de "da pra foldar mais" para "pague mais largo". Zero disfarcado de
blefe e o mesmo erro da D8 com outro nome.

**A conta do MDF usa apenas os combos VIVOS** (`pairMass > EPS`). O range de
aposta dele nao contem as suas cartas — ele nao pode ter o que voce tem. Os
bloqueados sao materia do painel de bloqueadores, e la eles entram por outra
porta.

### D-F3-25 — a base declarada sai do RESULTADO, nunca do estado da UI

```ts
export function decisionBasis(
  result: EngineResultOk,
  board: readonly Card[],
): { basis: "discrete" | "effective"; heroCombos: number };
```

`discrete` **somente** quando `board.length === 5 && result.perHeroCombo.length === 1`.
Fora disso, `effective`.

As duas condicoes sao necessarias, e a segunda e a que a spec quase deixou
escapar. No river com heroi de mao unica, a equity de um combo do vilao so pode
ser 0, 0,5 ou 1 — contagem discreta e honesta. **No river com heroi como range, a
equity por combo do vilao volta a ser continua** (ele ganha de parte do seu
range), e uma "contagem de combos que perdem" seria inventada. Sem a segunda
condicao, a cascata mentiria no river em modo range exatamente como o
`breakevenFrequency` mentia no flop — 0,42 anunciado contra 0,20 real (D11 da
F0).

O predicado le `perHeroCombo.length`, **nao** o toggle `heroMode` de
`RangeLab.tsx:72`. O toggle e superficie: com "Minha mao" selecionado o jogador
pode pintar `AKs` e ter 4 combos. Quem manda e o range expandido.

Nome e shape espelham `verdictCalcBasis` de proposito: e o mesmo conceito da D10,
e duas palavras diferentes para a mesma coisa e como a divergencia entra.

### D-F3-26 — a cascata tem cinco degraus, cada um com fonte nomeada, e a invariante da F3a e no DEGRAU 3

| # | id | Massa | Fonte |
|---|---|---|---|
| 1 | `nominal` | 1326 | constante |
| 2 | `declared` | `expandRangeV2(villainRange, EMPTY_DEAD).totalWeight` | mesmo parser, sem bordo |
| 3 | `after_board_removal` | `expandRangeV2(villainRange, boardDeadSet(board)).totalWeight` | igual a `SUM w_v` de `perVillainCombo` |
| 4 | `after_mutual_removal` | `SUM_v w_v * villainPairMass[v] / heroTotalWeight` | Refutacao 2 |
| 5 | `loses_to_hero` | base declarada (D-F3-25) | `confront.ts` sobre os vivos |

**Degrau 2 sai de `expandRangeV2` com o conjunto de mortas VAZIO**, nao de
`enumerateCombos` direto. O levantamento perguntou se dava para evitar duplicar o
parser: da, e a resposta esta em `expand.ts:54-110` — `expandRangeV2` e quem faz
`parseNotation`, filtro de naipe (`entry.suits`), `clampFreq`, e o **dedupe por
`comboKey`** que impede `"AKs"` mais `"AsKs"` de contar duas vezes. Chamar
`enumerateCombos` por fora reimplementaria os quatro, e o dedupe e o que ninguem
lembraria. O custo e uma segunda expansao por mudanca de range — barata, local,
fora do caminho do motor.

**Cada degrau e uniao discriminada.** Os degraus 1 a 3 sao **locais**: existem sem
o motor. Os degraus 4 e 5 dependem da corrida. Com `result` ausente ou degradado,
os dois ultimos saem `{ status: "unavailable", reason }` — e nao com massa zero,
que na barra seria lida como "as suas cartas mataram o range inteiro".

**Contagem `combos` e `number | null`.** No degrau 5 com base `effective` nao ha
contagem discreta a dar: a massa efetiva (`w * equity`) nao corresponde a um
numero inteiro de combos. `null` ali significa "esta base nao produz contagem", e
a tela escreve `massa efetiva`, nunca `combos que perdem`.

**Invariantes travadas por teste:**

1. `degrau3.mass === buildRangeRead(villainReadCombos, board).totalMass` ate `1e-9`.
2. Monotonia: `1326 >= d2 >= d3 >= d4 >= d5`.
3. `d3 - d4 === blockedMass` do painel de bloqueadores (o mesmo numero, dois
   paineis) — com heroi de mao unica.

### D-F3-27 — `blockers.ts` calcula o contrafactual SEM segunda corrida do motor

O levantamento de entrada estava certo no diagnostico e errado na rota. Certo:
**nao da para obter o contrafactual rodando o motor de novo** — ele volta a
excluir os pares por `collides()`, e trocar uma carta do heroi mudaria a forca da
mao e conflacionaria dois efeitos. Errado: os combos bloqueados nao precisam ser
reenumerados (Refutacao 1).

O desenho:

```
bloqueados = perVillainCombo.filter(pairMass <= EPS)      // gratis
vivos      = perVillainCombo.filter(pairMass  > EPS)

eqReal = result.heroRangeEquity                            // gratis, ver abaixo
eqCf   = ( SUM_vivos  w_v * eqHero_v  +  SUM_blk  w_b * eqHero_b )
         / ( SUM_vivos w_v            +  SUM_blk  w_b )
delta  = eqReal - eqCf
```

com `eqHero_v = 1 - perVillainCombo[v].equity` para os vivos, e `eqHero_b`
calculado por enumeracao propria **so** para os bloqueados.

**`eqReal` e literalmente `result.heroRangeEquity`.** Com heroi de mao unica,
`assemble` produz `heroRangeEquity = heroNum[0] / (runoutsPerPair * pairMass[0])`
(`run.ts:346-349, 745`), e `pairMass[0] = SUM_vivos w_v`; abrindo o numerador da
a media ponderada de `eqHero_v` sobre os vivos. Os dois caminhos coincidem por
algebra, nao por coincidencia — e isso vira **teste de identidade**, nao codigo
duplicado.

**Por que o showdown ficticio e calculavel.** Heroi `AsKd` contra vilao `AsQs` e
um estado impossivel do baralho, mas nao ha avaliacao de 9 cartas em lugar nenhum:
`evalWithBoard` avalia **os 7 do heroi** e **os 7 do vilao** em chamadas
separadas, e cada uma dessas maos e legal em si. So o **par** e ficticio, e
comparar dois inteiros e aritmetica bem definida. E exatamente o que "meu as
bloqueia 3 combos de nut flush" ja significa na boca do jogador.

**A enumeracao dos bloqueados, e por que ela e barata.** Enumerar por runout
sobre o baralho menos bordo menos as **duas cartas do heroi**, avaliar o heroi
uma vez por runout, e para cada combo bloqueado rejeitar o runout que comer a
carta **nao compartilhada** dele:

| Rua | Runouts enumerados | Avaliacoes com 30 combos bloqueados |
|---|---|---|
| River | 1 | ~31 |
| Turn | 46 | ~1.400 |
| Flop | `C(47,2) = 1081` | ~33.500 |

Para calibrar: o caso de aceite da F1 mediu **233.640** showdowns em 7,0 ms. O
pior caso do flop aqui e uma fracao disso, na thread principal.

**Denominador por combo, nunca `runoutsPerPair`.** O par ficticio remove **3**
cartas distintas (as duas do heroi mais a carta livre do vilao), nao 4 — logo tem
`C(46,2) = 1035` runouts validos no flop, e nao os `990` de `cost.ts`. Usar a
constante do motor aqui daria um vies de 4,5% no contrafactual, silencioso e
sistematico. `eqHero_b` e calculado como razao **com o proprio denominador do
combo**, e ai a mistura com os vivos fecha.

**Atribuicao por carta e ETIQUETA, nao particao.** O combo do vilao identico a
mao do heroi (`AsKd` contra `AsKd`) e bloqueado pelas **duas** cartas. As duas
colunas por carta somam mais que o total, do mesmo jeito e pelo mesmo motivo que
o bloco de draws da F3a (D-F3-4). O agregado `blockedMass` e a **uniao**, e a
tela leva a mesma frase de rodape que impede o jogador de somar com os olhos.

### D-F3-28 — contrato de reentrancia do `fastEvaluator`, escrito porque agora ha um segundo cliente

`loadBoard` e **estado de modulo** (`fastEvaluator.ts:70-111`), documentado como
deliberado: e o que elimina a alocacao por chamada. Ate a F3b o unico cliente era
`run.ts`. Agora sao dois.

**Contrato:** *quem chama `evalWithBoard` chama `loadBoard` no MESMO bloco
sincrono, sem `await`, sem `setTimeout` e sem ceder a thread no meio.*

Verificado que o motor ja obedece, e por isso nao havia contrato escrito:
`prepareRunout` faz `loadBoard` e a varredura de `evalWithBoard` de forma
sincrona (`run.ts:297-336`), e o laco de pares que roda entre fatias le **apenas
os placares ja materializados** em `heroScore`/`villainScore`; `runSample` faz o
mesmo dentro de uma amostra (`run.ts:532-543`).

Consequencias operacionais:

- O worker tem **instancia de modulo propria** (realm separado). Nao ha estado
  compartilhado entre worker e thread principal — o risco seria com o runner
  sincrono de fallback (`client.ts`, D14), que roda na mesma thread.
- Mesmo nesse ramo nao ha janela: JavaScript e single-threaded e os dois blocos
  sao sincronos.
- **`blockers.ts` nao pode ter `async` interno.** A enumeracao inteira e uma
  funcao sincrona. Se um dia ela precisar ceder a thread, tem que ir para o
  worker, e ai e mudanca de protocolo, nao de detalhe.

### D-F3-29 — no Monte Carlo o delta em pp e SUPRIMIDO com razao; a contagem continua

`eqReal` no Monte Carlo carrega meia-largura de intervalo; `eqCf` sairia
analitico da enumeracao. Um delta tipico de bloqueador vive na casa de 1 a 3
pontos percentuais, e a meia-largura do agregado pode ser da mesma ordem: o
numero seria **menor que o proprio erro** e ainda assim apareceria com uma casa
decimal.

`delta = { status: "unavailable", reason: "monte_carlo_mode" }`, e a tela diz
*"troque para o modo exato para ver o efeito em pontos de equity"*. A **contagem**
de combos removidos por carta continua, porque ela nao depende da corrida.

Alternativa considerada e recusada: `blockers.ts` recalcular tambem os vivos por
enumeracao exata propria. Com heroi de mao unica o custo seria uma corrida
inteira feita duas vezes, e reintroduziria a divergencia entre duas contas do
mesmo numero que a D-F3-11 recusou por escrito.

### D-F3-30 — quem decide se o painel de bloqueadores existe e uma funcao pura

```ts
export function blockerAvailability(
  result: EngineResult | null,
): { available: true; hero: [Card, Card] }
 | { available: false; reason: "no_result" | "engine_degraded" | "hero_is_range"; heroCombos: number };
```

`hero_is_range` e o achado F-5. O predicado e `perHeroCombo.length !== 1`, pelo
mesmo motivo da D-F3-25: o toggle da UI nao e a verdade. A razao carrega
`heroCombos` para a frase poder ser especifica — *"seu range tem 4 combos; o
bloqueador precisa de uma mao so"* — em vez do generico "indisponivel", que faz o
jogador achar que quebrou.

Nao ha `if` de disponibilidade no JSX. A decisao e testavel sem RTL, e a UI so
renderiza o que a funcao devolveu.

### D-F3-31 — ordem dos bluffcatchers: equity decrescente, desempate por `comboKey`

`evCall = equity * finalPot - callAmount` e funcao **afim crescente** da equity,
com `finalPot > 0`. Logo ordenar por `evCall` e ordenar por `equity`: **nao ha
escolha a fazer entre os dois criterios**, e `callThresholdIndex` (que conta
`evCall >= 0`) e necessariamente um **prefixo** dessa ordem. O `j` da spec e o
`callThresholdIndex` da F1, e se divergir e bug — como a spec ja dizia.

O que **precisa** de decisao e o empate, e ele e a regra e nao a excecao: no
river metade do range do heroi costuma ter equity exatamente 1 ou 0. Sem
desempate estavel, `k` mudaria a cada reordenacao do array — e a ordem de
`perHeroCombo` acompanha a ordem das entradas do range, que muda quando o jogador
pinta uma celula. Numero que pisca na tela sem nada ter mudado e pior que numero
ausente. **Desempate: `comboKey` crescente**, que e total, estavel e independente
da ordem de digitacao.

`N` e a contagem de combos **com numero**, nao `perHeroCombo.length`. Achado
colateral registrado nos pontos abertos: `RangeLab.tsx:373-374` ja mostra
`callThresholdIndex` de `perHeroCombo.length`, misturando numerador filtrado com
denominador cheio.

### D-F3-32 — as frases nascem de funcao pura, nao de JSX

A D-F3-16 e requisito de aceite. Requisito de aceite que so existe dentro de JSX
so se testa cacando texto no DOM — o anti-padrao da **licao #2**.

As frases do painel de MDF, os rotulos de base da cascata e o motivo de
indisponibilidade do bloqueador nascem de funcoes puras em **`uiRules.ts`**, que
ja e o modulo desse genero no Range Lab (`describeSpotReadiness`, com PT-BR
dentro e testes unitarios em `f0-spot-readiness.test.ts`). Nao ha modulo de copy
novo: um segundo lugar para a mesma coisa e como a divergencia entra.

O que isso trava, sem RTL:

- nenhuma porcentagem sem sujeito (`voce` / `ele`) na mesma frase;
- a formula `B / (P + B)` aparece **apenas** no campo `formulaTooltip`, e um teste
  varre os outros campos garantindo que ela nao vazou para a face do cartao;
- o veredito final e frase de acao, nao numero — testavel porque o campo `action`
  e uma string que nao contem digito.

Os componentes ganham `data-testid` estaveis (licao #2) e renderizam as strings
recebidas. O teste de UI verifica **fiacao**; o teste unitario verifica **copy**.

### D-F3-33 — cores novas em `@/lib/ui-tokens`, FORA de `tokens.color`

Namespace `decisionPalette`, vizinho de `heat` e `categoryPalette`, com
`cascade(stepId)`, `confront(outcome)` e `balance(verdict)`.

Motivo ja custou uma quebra: `ColorKey` e derivado de `keyof tokens.color` e todo
consumidor de `tokens.color[tom]` espera `{ bg, text, border }` — foi assim que
`tokens.color.delta` quebrou o `FilterChip` (**licao #22**). `heat` e
`categoryPalette` ja moram fora por esse motivo; a terceira paleta segue o mesmo
caminho. Fundo neutro para id desconhecido, como o `CATEGORY_FALLBACK_BG`: nunca
`bg-undefined` na tela.

### D-F3-34 — onde os tres paineis entram, e o que aparece quando nao ha resultado

`RangeLab.tsx` tem tres `section`: range (esquerda), bordo mais veredito (centro),
leitura (direita).

| Componente | Onde | Por que |
|---|---|---|
| `MdfPanel` | **centro**, logo abaixo de `VerdictPanel` | Le pote e call, que sao os campos do proprio painel (`BetInputs`). Responde "quanto ele precisa blefar", que e a continuacao direta do veredito |
| `CascadeBar` | **centro**, abaixo do `MdfPanel` | Responde "de onde veio esse numero" — o numero em questao e o do `VerdictPanel`, logo acima |
| `BlockerPanel` | **direita**, acima de `CategoryPanel` | Fala do range do vilao carta a carta; e a leitura que o painel de categorias detalha em seguida. A queda do degrau 3 para o 4 da cascata e o mesmo fato, visto do outro lado |

**Degradacao, painel a painel — e o `MdfPanel` e o caso interessante:**

- As tres porcentagens do MDF **nao dependem do motor**: saem de `potCurrent` e
  `callAmount`. O cartao renderiza as tres frases com `result == null`, com o
  bordo vazio e com o motor rodando. So o bloco de value/blefe espera a corrida.
  E a unica parte da frente que responde antes de existir spot, e seria perda
  gratuita esconde-la atras do resultado.
- `CascadeBar` com `result` ausente ou degradado mostra os degraus 1 a 3 (locais)
  e marca 4 e 5 como indisponiveis com a razao. Barra vazia esconderia que o
  range declarado ja perdeu massa para o bordo.
- `BlockerPanel` sem disponibilidade renderiza a frase da D-F3-30 e nada mais.

Nenhum dos tres aparece antes de o jogador ter posto **algum** range: o painel de
leitura ja tem a mensagem de estado de hoje (`RangeLab.tsx:493`), e ela continua
sendo o portao.

---

## Consequencias

### Assinaturas dos modulos puros

```ts
// ── mdf.ts — nao importa ev.ts, nao importa NADA alem de tipos (D-F3-12/23) ──
export type MdfDegradedReason = "invalid_pot_before_bet";

export interface MdfOk {
  status: "ok";
  potBeforeBet: number;   // P = potCurrent - callAmount
  bet: number;            // B = callAmount
  defenseAlpha: number;   // B / (P + B)   — o blefe DELE precisa funcionar tanto
  mdf: number;            // P / (P + B)   = 1 - defenseAlpha
}
export interface MdfDegraded { status: "degraded"; reason: MdfDegradedReason }
export type MdfResult = MdfOk | MdfDegraded;

export function computeMdf(potCurrent: number, callAmount: number): MdfResult;

export type BluffBalanceVerdict = "bluffs_missing" | "balanced" | "bluffs_excess";
export type BluffBalanceDegradedReason = "no_value_mass";

export interface BluffBalanceOk {
  status: "ok";
  valueMass: number;
  bluffMass: number;
  chopMass: number;
  unknownMass: number;    // combos sem numero: exibidos, nunca somados como blefe
  bluffsNeeded: number;   // valueMass * B / P
  bluffGap: number;       // bluffsNeeded - bluffMass; negativo = blefa demais
  verdict: BluffBalanceVerdict;
}
export interface BluffBalanceDegraded { status: "degraded"; reason: BluffBalanceDegradedReason }
export type BluffBalance = BluffBalanceOk | BluffBalanceDegraded;

export function computeBluffBalance(
  mdf: MdfOk,
  masses: { value: number; bluff: number; chop: number; unknown: number },
): BluffBalance;

export interface BluffcatcherRanking {
  order: string[];                  // comboKeys, do melhor ao pior
  rankByCombo: Map<string, number>; // 1-based
  thresholdIndex: number;           // tem que bater com EngineResultOk.callThresholdIndex
  total: number;                    // combos COM numero, nao perHeroCombo.length
}
export function rankBluffcatchers(rows: readonly HeroComboResult[]): BluffcatcherRanking;

// ── confront.ts ─────────────────────────────────────────────────────────────
export type ConfrontOutcome = "value" | "bluff" | "chop" | "unknown";
export type ConfrontBasis = "discrete" | "effective";
export type ConfrontMethod = "showdown_now" | "equity_vs_range";

export interface ConfrontBucket { combos: number; mass: number }
export interface ConfrontationSplit {
  method: ConfrontMethod;
  basis: ConfrontBasis;
  value: ConfrontBucket;
  bluff: ConfrontBucket;
  chop: ConfrontBucket;
  unknown: ConfrontBucket;
  totalMass: number;
}

export function decisionBasis(
  result: EngineResultOk,
  board: readonly Card[],
): { basis: ConfrontBasis; heroCombos: number };

/** Quem esta na frente AGORA no bordo atual. `evaluateHand`, 5 a 7 cartas (D-F3-17). */
export function confrontNow(
  hero: readonly [Card, Card],
  villain: readonly [Card, Card],
  board: readonly Card[],
): Exclude<ConfrontOutcome, "unknown">;

export interface ConfrontRow { combo: [Card, Card]; weight: number; equity: number | null }

export function splitByConfrontation(input: {
  hero: readonly [Card, Card] | null;   // null = heroi e range -> equity_vs_range
  rows: readonly ConfrontRow[];         // o CHAMADOR filtra vivos ou bloqueados
  board: readonly Card[];
  basis: ConfrontBasis;
}): ConfrontationSplit;

// ── cascade.ts ──────────────────────────────────────────────────────────────
export type CascadeStepId =
  | "nominal" | "declared" | "after_board_removal"
  | "after_mutual_removal" | "loses_to_hero";
export type CascadeStepUnavailable = "no_result" | "engine_degraded";

export type CascadeStep =
  | {
      id: CascadeStepId;
      status: "ok";
      mass: number;
      combos: number | null;      // null = esta base nao produz contagem discreta
      basis: ConfrontBasis | null; // so o degrau 5 declara base
    }
  | { id: CascadeStepId; status: "unavailable"; reason: CascadeStepUnavailable };

export interface Cascade {
  steps: CascadeStep[];           // sempre 5, sempre na ordem
  basis: ConfrontBasis | null;
  blockedMass: number | null;     // degrau 3 - degrau 4
}

export function buildCascade(input: {
  villainRange: readonly RangeEntry[];
  board: readonly Card[];
  result: EngineResult | null;
}): Cascade;

// ── blockers.ts — sincrono de ponta a ponta (D-F3-28) ────────────────────────
export type BlockerUnavailableReason = "no_result" | "engine_degraded" | "hero_is_range";
export type BlockerDeltaUnavailableReason =
  | "monte_carlo_mode" | "not_requested" | "no_blocked_combos";

export type BlockerAvailability =
  | { available: true; hero: [Card, Card] }
  | { available: false; reason: BlockerUnavailableReason; heroCombos: number };

export function blockerAvailability(result: EngineResult | null): BlockerAvailability;

export interface BlockedCardReport { card: Card; removed: ConfrontationSplit }

export type BlockerDelta =
  | {
      status: "ok";
      equityReal: number;           // === result.heroRangeEquity (identidade testada)
      equityCounterfactual: number;
      delta: number;                // fracao; a tela converte para pp
      runoutsEnumerated: number;
    }
  | { status: "unavailable"; reason: BlockerDeltaUnavailableReason };

export interface BlockerReport {
  hero: [Card, Card];
  perCard: [BlockedCardReport, BlockedCardReport]; // ETIQUETA: as duas podem se sobrepor
  blockedCombos: number;                            // UNIAO
  blockedMass: number;                              // UNIAO
  delta: BlockerDelta;
}

export function analyzeBlockers(input: {
  result: EngineResultOk;
  board: readonly Card[];
  computeDelta: boolean;   // river: true automatico. Fora do river: so sob o botao (D-F3-13)
}): BlockerReport | { status: "unavailable"; reason: BlockerUnavailableReason };
```

### Criterios de aceite da F3b, como consequencias verificaveis

| # | Criterio da spec | Como fica | Decisao |
|---|---|---|---|
| 1 | `MDF + defenseAlpha == 1` na faixa de 0,1x a 5x pote | Inalterado. Varredura, `1e-12` | D-F3-23 |
| 2 | `defenseAlpha != requiredEquity` fora do degenerado | Inalterado, e e o teste que trava o F-1 para sempre | D-F3-12 |
| 3 | `P <= 0` -> `null` mais `invalid_pot_before_bet`, sem numero na tela | Vira `status: "degraded"`; o teste de copy garante que nenhuma frase carrega digito | D-F3-23, D-F3-32 |
| 4 | Remover na unha os combos com a carta do heroi da o mesmo delta | **Reescrito**: o motor **ja** os remove, entao a remocao manual daria delta zero. A linha de base e o range **com** os bloqueados vivos, e o teste compara `equityCounterfactual` com uma media ponderada montada a mao no fixture do river | D-F3-27 |
| 5 | Modo "meu range": painel desabilitado com motivo, sem numero | `blockerAvailability` devolve `hero_is_range` com `heroCombos` | D-F3-30 |
| 6 | "Total do ultimo degrau bate com a massa do range" | **Reescrito** (Refutacao 3): a invariante e `degrau3 === buildRangeRead(...).totalMass`. O degrau 5 e subconjunto do 4 e nao pode bater com o bloco da F3a | D-F3-26 |
| 7 | `npm run check` limpo, suite verde, placar nao cai | Inalterado | Todas |

### Obrigacoes de teste que nascem deste ADR

- **`bluffsNeeded === valueMass` quando `B === P`** (aposta de pote): a razao 1:1
  do river, que e o cheiro do F-1 estar corrigido.
- **`computeMdf` com `callAmount > potCurrent`, com `potCurrent` `NaN` e com
  `Infinity`**: os tres degradam com a mesma razao.
- **`equityReal === result.heroRangeEquity`** ate `1e-9`, com heroi de mao unica.
  E a prova de que o contrafactual reusa a corrida em vez de refaze-la.
- **Contrafactual do river conferido a mao** num fixture pequeno: 1 runout, tres
  combos bloqueados, media ponderada calculada no proprio teste.
- **Denominador do par ficticio**: no flop, um combo bloqueado tem `1035` runouts
  validos, nao `990`. Teste direto sobre `runoutsEnumerated` ou sobre um combo com
  equity conhecida.
- **`AsKd` no range do vilao com heroi `AsKd`**: aparece nas **duas** colunas por
  carta, e `blockedCombos` conta **uma** vez.
- **Combo com `equity: null` nao vira blefe**: fixture de Monte Carlo com combo
  sem amostra; `unknown.mass > 0` e `bluff.mass` inalterada.
- **Cruzamento de metodo no river**: com heroi de mao unica, o split por
  `confrontNow` e o split por `perVillainCombo[v].equity` em `{0, 0.5, 1}`
  produzem os mesmos tres baldes. Um teste, dois caminhos, mesma resposta.
- **`decisionBasis` no river com heroi como range devolve `effective`** — o caso
  que a segunda condicao existe para pegar.
- **Monotonia da cascata** e **`d3 - d4 === blockedMass`**.
- **`degrau2` conta o combo que o bordo comeu**: range `AKs` com `As` no bordo tem
  `degrau2 > degrau3`.
- **Empate de equity nao muda `k` quando a ordem das entradas muda**: mesmo range
  declarado em duas ordens diferentes produz o mesmo `rankByCombo`.
- **`thresholdIndex === result.callThresholdIndex`** em varios spots.
- **A formula `B / (P + B)` nao aparece em nenhum campo de frase alem do
  tooltip**, e `action` nao contem digito.
- **Regressao de tempo**: `analyzeBlockers` com `computeDelta: true` num flop com
  range de vilao largo fica dentro de um teto declarado no teste. A F1 mostrou que
  este e um laco que reage a mudancas que pareciam inofensivas.
- **`blockers.ts` nao e `async`**: teste estrutural, porque a violacao da D-F3-28
  nao produz sintoma ate produzir um numero errado sob concorrencia com o runner
  sincrono de fallback.

### Positivas

- Os dois alphas ficam com nomes proprios em modulos diferentes, e a igualdade
  errada (`MDF = 1 - requiredEquity`) fica **impossivel de escrever por acidente**
  — `mdf.ts` nao importa `ev.ts`, e um teste trava a desigualdade.
- O contrafactual do bloqueador custa uma fracao de uma corrida, nao duas
  corridas: a Refutacao 1 apagou o trabalho que a spec supunha necessario.
- `equityReal === heroRangeEquity` transforma um risco de divergencia em teste de
  identidade — a mesma manobra que a D-F3-11 usou para `heroi + vilao = 1`.
- A cascata e o painel de bloqueadores contam **o mesmo fato** por dois angulos, e
  `d3 - d4 === blockedMass` prova que nao divergiram.
- Os quatro modulos sao puros e testaveis sem React, sem worker e sem jsdom, no
  molde de `uiRules.ts`, `classify.ts` e `read.ts`.
- O painel de MDF responde **antes** de existir spot, porque as tres porcentagens
  nao dependem do motor.

### Negativas

- **Quatro modulos novos para tres paineis.** `confront.ts` existe so porque dois
  consumidores precisam da mesma conta; e uma peca a mais para quem chega depois.
- **O contrafactual e um estado impossivel do baralho** e sempre vai soar estranho
  a quem le o codigo pela primeira vez. Mitigado por comentario, nao por tipo.
- **No Monte Carlo o jogador nao ve o delta** (D-F3-29). Perda declarada, com a
  saida escrita na tela.
- **`confront.ts` tem dois metodos** com semanticas parecidas e rotulos
  diferentes. Duas frases proximas na mesma tela e exatamente o risco que a
  D-F3-16 existe para conter, e agora ele aparece tambem aqui.
- **Uma segunda expansao do range por mudanca** (degrau 2). Barata, mas e trabalho
  que so serve para um numero de leitura.
- **O painel de categorias da F3a conta os combos bloqueados** (ver ponto aberto
  2). A cascata torna a diferenca visivel; ela nao a corrige.

### Neutras / operacionais

- **Sem migration, sem endpoint, sem `shared/schema.ts`, sem dependencia nova.**
- `EngineResultOk` **nao muda**. Nenhuma decisao acima pediu campo novo.
- Arquivos novos: `combo-calc/{mdf,confront,cascade,blockers}.ts`,
  `range-lab/{MdfPanel,CascadeBar,BlockerPanel}.tsx`.
  Arquivos tocados: `combo-calc/uiRules.ts` (frases), `lib/ui-tokens.ts`
  (`decisionPalette`), `pages/RangeLab.tsx` (fiacao).
- O contrato de reentrancia da D-F3-28 vira comentario no topo de
  `fastEvaluator.ts`: ele passa a ter dois clientes e o proximo nao vai ler este
  ADR.

---

## Pontos abertos — perguntas ao founder, sem solucao inventada

1. **O denominador do "quantas maos suas pagam".** `RangeLab.tsx:373-374` mostra
   `callThresholdIndex` de `perHeroCombo.length`. O numerador exclui combos
   degradados (equity `null`); o denominador nao. Com card removal pesado, o
   painel diz "12 de 16 pagam" quando 4 das 16 nem existem no spot. A D-F3-31 fixa
   `N = combos com numero` para o painel novo, o que faz os **dois numeros da
   pagina divergirem** ate alguem decidir. Duas saidas: alinhar o texto antigo, ou
   rotular os dois de forma diferente. Nao decidido aqui porque e mudanca de tela
   ja existente.
2. **O bloco de maos feitas da F3a conta combos que o vilao nao pode ter.**
   `villainReadCombos` inclui os bloqueados (`RangeLab.tsx:251`), entao "18 combos
   de flush" pode incluir 3 que morreram no seu as. Este ADR **mantem** o
   comportamento, e a justificativa e forte: e o que faz `degrau3 === totalMass` e
   o que da a cascata algo para mostrar na queda do 3 para o 4. Mas o founder pode
   preferir que o painel de categorias mostre so os vivos — e ai a invariante da
   cascata muda de degrau e o painel perde a leitura dos combos bloqueados, que e
   informacao que o bloqueador usa.
3. **O `k` do "k-esimo melhor bluffcatcher".** A frase da spec so faz sentido com
   heroi como range, e nesse modo **nao existe "a sua mao"** para ser a k-esima. A
   D-F3-31 entrega `rankByCombo` completo e o painel escreve a parte bem definida
   ("o corte de EV zero esta na j-esima de N"). O `k` por combo fica disponivel
   para a `ComboTable` da F3a, mas **nao e fiado nesta frente** — seria coluna nova
   numa tabela que nao e desta sub-frente.

---

## Confianca

**Alta** para D-F3-23, D-F3-25, D-F3-26, D-F3-27, D-F3-28, D-F3-31 e D-F3-33. As
tres refutacoes foram conferidas linha a linha no codigo, e uma delas
(`perVillainCombo` com `pairMass: 0`) tem teste verde em disco desde a F3a. A
algebra de `equityReal === heroRangeEquity`, a simplificacao
`bluffsNeeded = valueMass * B / P` e a contagem `C(46,2) = 1035` foram derivadas a
mao e sao verificaveis por inspecao.

**Media** para D-F3-24 no ramo `equity_vs_range`. O corte em 0,5 e defensavel e
declarado, mas e um limiar sobre grandeza continua: um combo com 51% de equity
contra o seu range entra inteiro no balde de value. Nao ha erro de calculo, ha
perda de resolucao — e ela aparece justamente no modo em que o painel ja e menos
util. Se incomodar, a saida e uma terceira faixa ("misto"), nao um limiar
diferente.

**Media** para o custo declarado da D-F3-27. As contagens de runout sao exatas; a
traducao para milissegundos e extrapolacao da medida da F1 (233.640 showdowns em
7,0 ms) e **nao foi medida nesta frente**. O teto fica como obrigacao de teste. O
botao da D-F3-13 continua valendo de qualquer forma — mas vale registrar que a
justificativa dele **mudou**: nao e mais "duas corridas do motor", que este
desenho evita, e sim "trabalho sincrono na thread principal a cada tecla".

**Baixa** para a estimativa de quantos combos bloqueados um range real tem. O
numero usado (~30) veio de um range de 15% no flop, feito a mao. O pior caso
teorico e maior (uma carta especifica participa de ate 48 combos, e sao duas
cartas), e o teste de regressao de tempo deve usar um range **largo** de proposito,
nao o fixture confortavel.

---

## Artefatos relacionados

- Specs: `Docs/specs/range-lab/F3b-decisao.md` (o que fazer),
  `Docs/specs/range-lab/F3-detalhamento.md` (secoes 1, 2 e 6 — achados F-1 a F-5,
  decisoes D-F3-12/13/16), `Docs/specs/range-lab/00-INDICE.md` (D8, D10, D11, D12,
  D14, serie D-F3-*), `Docs/specs/range-lab/F3a-leitura-categorias.md` (o que a
  F3b herda)
- Diagramas: `Docs/architecture/diagrams/range-lab-f3b/`
  - `paineis-fluxo-de-dados.mermaid` — de `EngineResultOk` ate os tres paineis,
    com o que e local e o que espera a corrida
  - `bloqueador-contrafactual-sequence.mermaid` — river analitico contra fora do
    river sob botao, com o ponto onde o `loadBoard` entra
  - `cascata-degraus.mermaid` — os cinco degraus, a fonte de cada um e as tres
    invariantes
- Codigo afetado: `client/src/lib/combo-calc/{mdf,confront,cascade,blockers}.ts`
  (novos), `client/src/lib/combo-calc/uiRules.ts`,
  `client/src/components/range-lab/{MdfPanel,CascadeBar,BlockerPanel}.tsx`
  (novos), `client/src/pages/RangeLab.tsx`, `client/src/lib/ui-tokens.ts`
- Codigo lido e **nao** alterado: `client/src/lib/combo-calc/engine/{types,run,expand}.ts`,
  `client/src/lib/combo-calc/{ev,read,classify,fastEvaluator,evaluateSpot}.ts`,
  `client/src/hooks/useRangeEngine.ts`
- Convencoes: `.claude/rules/03-padrao-codigo.md` (falhar alto; `null` com razao
  nomeada, nunca zero inventado), `.claude/rules/14-frontend-ui.md` (nada de valor
  visual solto), `.claude/rules/04-modelo-e-esforco.md`
- Licoes do `CLAUDE.md` invocadas: **#2** (`data-testid` estavel, e por isso a copy
  nasce de funcao pura em vez de ser cacada no DOM), **#9** (log antes do
  fallback), **#22** (paleta fora de `tokens.color`)
- ADRs anteriores da frente: **246** (F1 — motor, uniao discriminada, `pairMass`,
  Monte Carlo), **247** (F2 — range builder; D-F2-4 registrou o descasamento de
  shape v1/v2), **248** (F3a — `perVillainCombo`, particao virada tipo, e a tabela
  "o que fica devendo para a F3b" que esta frente paga)
- Frentes anteriores: F0 `ea0f8303`, F1 `6f02c872`, F2 `d08a006c`, F3a `88f95745`

---

## Emendas pos-red-phase (2026-08-18)

A red phase levantou cinco ambiguidades que o corpo do ADR nao fechava, e o
founder respondeu os tres pontos abertos. Fica tudo aqui para a green phase nao
inventar.

### Os tres pontos abertos, respondidos (founder)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Denominador de "quantas maos suas pagam" | **Consertar a tela antiga.** `RangeLab.tsx` passa a usar "combos COM numero" como denominador, alinhado com `rankBluffcatchers.total`. O `16` de hoje conta maos que nao existem no spot: e numero errado que nao parece errado, e a `00-produto.md` poe isso acima de nao mexer no que ja esta entregue |
| 2 | Bloco de maos feitas da F3a conta combos bloqueados | **Manter.** O painel de categorias segue contando o declarado; a cascata e quem mostra a queda. A invariante `degrau3 === totalMass` fica de pe |
| 3 | O `k` do "k-esimo melhor bluffcatcher" | Mantida a decisao do ADR: `rankBluffcatchers` entrega `rankByCombo`, o painel escreve so a parte bem definida ("o corte de EV zero esta na j-esima de N"), e a coluna por combo nao e fiada nesta frente |

### D-F3-35 — `unknown` so existe em `equity_vs_range`

D-F3-24 dizia "combo com `equity: null` vai para `unknown`, nunca para `bluff`".
Lido ao pe da letra, o painel de bloqueadores nasce **em branco**: os combos
bloqueados tem `equity: null` por construcao (`pairMass = 0`), e sao justamente
eles que precisam sair separados em value removido e blefe removido.

A regra so vale no ramo em que a equity **e** o criterio. Em `showdown_now` o
criterio sao as cartas: heroi e mao unica, o bordo esta na mesa, e
`confrontNow(hero, villain, board)` decide sem consultar a corrida. Um combo
bloqueado tem showdown perfeitamente definido — e o que "meu as bloqueia 3 combos
de nut flush" ja significa.

**Contrato:** `unknown` e alcancavel apenas com `method: "equity_vs_range"`. Em
`showdown_now`, `unknown.combos === 0` sempre.

### D-F3-36 — a massa sob base efetiva

F-4 fixou o rotulo (`massa efetiva`) e o ADR fixou `combos: null`, mas nenhum dos
dois escreveu a formula. Ela e:

```
degrau5 (effective) = SUM_v  w_v * (1 - eq_v)      // eq_v = equity do combo do vilao
```

O chop ja entra pela metade dentro de `eq_v`, entao nao ha bucket de chop a somar
por fora — e a mesma algebra que a D10 da F0 usou em `wEff`/`lEff`.

No ramo discreto (river **e** heroi de mao unica, D-F3-25) a leitura tem que ser a
**mesma grandeza**, senao a barra muda de significado ao trocar de rua:

```
degrau5 (discrete) = bluff.mass + 0.5 * chop.mass
combos             = contagem do balde bluff
```

Nos baldes de `ConfrontationSplit`, sob qualquer base, `mass` continua sendo o
**peso declarado** `w_v` — a base decide como o combo e **classificado**, nao
quanto ele pesa. Misturar as duas coisas produziria um balde cuja soma nao fecha
com `totalMass`.

### D-F3-37 — `rankBluffcatchers.order` nao ranqueia combo sem numero

`order.length === total`. Combo com `equity: null` nao tem posicao: coloca-lo no
fim seria dizer que ele e o pior, e no comeco que e o melhor. Ele aparece na
tabela, fora do ranking.

### D-F3-38 — `heroCombos` em estado sem resultado

`blockerAvailability` com `no_result` ou `engine_degraded` devolve
`heroCombos: 0`. Nao ha resultado de onde tirar contagem, e um numero herdado do
estado anterior da UI seria numero velho com cara de atual.

### Contratos que nasceram no teste, e nao no ADR

Os nomes de campo da copy (`describeMdf`, `describeCascadeStep`,
`describeBlockerUnavailable`, `formulaTooltip`, `action`), as props dos tres
componentes e os `data-testid` estao declarados nos cabecalhos de
`tests/unit/combo-calc/f3b-copy.test.ts` e
`tests/client/range-lab/f3b-panels.test.tsx`. Isso e deliberado: o teste de copy
varre os campos de texto por reflexao, entao renomear campo nao quebra o teste —
so remover um quebra. A green phase implementa contra esses nomes.

### Divida assumida

O teto de 150 ms de `analyzeBlockers` e **declarado, nao medido** (confianca Media
no custo, Baixa na contagem de bloqueados, ver secao Confianca). O fixture do
teste de regressao usa range largo de proposito (565 combos, 64 bloqueados).
Estourar o teto nao autoriza afrouxa-lo: a saida ja esta na spec (contagem
sempre, delta atras do botao, D-F3-13).
