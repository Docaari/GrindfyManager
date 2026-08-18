# ADR-248: Range Lab F3a — leitura por categoria (classificacao fora do worker, particao virada tipo, `perVillainCombo` aditivo, kicker em banda com marca de nut)

## Status
Aceito

## Data
2026-08-18

Specs de origem: `Docs/specs/range-lab/F3a-leitura-categorias.md` (o **o que**),
`Docs/specs/range-lab/F3-detalhamento.md` (o **porque**, aprovado pelo founder em
2026-08-18) e `Docs/specs/range-lab/00-INDICE.md` (decisoes D1 a D14 e as decisoes
D-F3-*, todas fechadas).

Modelo e esforco declarados na spec: **Opus 5 — Extra**. A F3a nao toca nenhuma
das sete zonas criticas de `.claude/rules/04-modelo-e-esforco.md` — nao ha parser
CSV, FX, permissao/tier, prompt do Coach, schema/migration nem ordem de rota. O
`Extra` vem do volume de numero novo na tela, nao de risco de dinheiro.

> **Nota de numeracao:** ultimo ADR em disco na abertura desta sessao e o **247**
> (`247-range-lab-f2-range-builder.md`). Este ADR usa o proximo livre confirmado =
> **248**, e a linha correspondente foi adicionada ao `README.md` desta pasta.

Este ADR **registra decisoes ja tomadas pelo founder** (secao 2 do
`F3-detalhamento.md`). Ele nao reabre nenhuma delas. O que ele acrescenta e:
(a) o ponto exato do codigo onde cada decisao aterrissa, (b) as leituras que
precisaram ser fixadas porque o texto comprimido da spec e ambiguo, e (c) tres
pontos que a spec **nao** decide e que ficam como pergunta ao founder, listados
sem solucao inventada.

---

## Contexto

### O que a F1 deixou pronto e este ADR nao reabre

| Onde | Contrato herdado |
|---|---|
| `fastEvaluator.ts` | `evaluate7(a..g)` -> score inteiro; `handCategory(score)` -> familia 0..8, mesma ordem de `CATEGORY` em `evaluator.ts`; `STRAIGHT_TOP` (`Uint8Array` de 8192, indexada por bitmask de 13 ranks, `0` = nao ha straight, roda = topo 3) |
| `evaluator.ts` | `evaluateHand(cards)` aceita **5 a 7** cartas. Continua vivo como oraculo de teste (D4 do indice) |
| `engine/expand.ts` | `expandRangeV2` -> `{ combos, emptyEntries, totalWeight }`; combo ja traz `codeA/codeB`, mascara `lo/hi` e `weight` |
| `engine/run.ts` | Laco externo = runout; placar por combo em `Int32Array`; `pairMass[h]` = massa do vilao que aquele combo do heroi realmente enfrenta; `assemble` monta o resultado |
| `engine/cost.ts` | `runoutsPerPair(boardLength)` = 1 / 44 / 990 — constante por street porque o par sempre tira as MESMAS 4 cartas |
| `engine/types.ts` | `EngineResult` e **uniao discriminada** `ok \| degraded` (D-F1-8 / D12): o compilador cobra o `if` |
| `RangeMatrix.tsx` | Matriz 13x13 presentacional, props `{ entries, onChange, defaultFrequency, ... }` |
| `@/lib/ui-tokens` | `heat` vive **fora** de `tokens.color`, porque `ColorKey` deriva de `keyof tokens.color` (licao #22) |

### O problema

O terceiro painel de `/range-lab` esta vazio desde a F1: mostra so a `ComboTable`
(`RangeLab.tsx:407`), que responde "ganha / perde / chop" e, no river, uma equity
que so pode ser 100%, 0% ou 50%. O jogador ve **o resultado** e nao ve **a
estrutura**: quantos flushes, quantos top pares, quantos blefes, o que a carta
dele bloqueia. E o que o Flopzilla faz melhor que nos.

### Restricoes que este ADR nao reabre

- **Numero errado perde para numero ausente** (`00-produto.md`): categoria sem
  equity mostra `—`, nunca `0%`. E a mesma regra que a F0 (D8) e a F1 (D-F1-4)
  ja aplicaram ao `Verdict` e ao `HeroComboResult`.
- **Sem dependencia nova** (Artigo VII): nao ha avaliador novo nesta frente; a
  contagem de outs de sequencia sai da `STRAIGHT_TOP` que a F1 ja construiu.
- **Aditivo no motor**: quem consome `EngineResultOk` hoje nao pode quebrar.
- **Sem migration, sem endpoint, sem `shared/schema.ts`** — a frente e inteira
  client-side.

---

## Decisao

### D-F3-1 — `classify.ts` e modulo puro, FORA do worker

`client/src/lib/combo-calc/classify.ts`, entrada `(hole, board)`, sem estado e
sem contato com o motor. Nao entra no worker, nao entra em `run.ts`.

**Por que fora.** Sao no maximo 1326 combos por lado, e o custo de classificar um
combo e uma avaliacao mais aritmetica de bitmask — ordens de grandeza abaixo do
laco de showdown, que na F1 mediu 233.640 comparacoes no caso de aceite. Mais
importante que o custo: **o resultado da classificacao nao depende do tamanho da
aposta**. `AJ` em `A-K-Q` e top par com kicker nut tanto contra uma aposta de 10
quanto contra uma de 100. Se a classificacao morasse dentro do motor, mexer no
pote ou no call — os dois campos que o jogador mais mexe, com debounce de 400 ms
a cada tecla (`useRangeEngine`, emenda A3) — forcaria reclassificar os 1326
combos junto com a corrida, sem que nada na leitura mudasse.

A dependencia real e a inversa da do motor:

| Muda o que | Corrida do motor | Classificacao |
|---|---|---|
| Pote / call / modo | **redisparada** | intacta |
| Bordo | redisparada | recalculada |
| Range (heroi ou vilao) | redisparada | recalculada so para os combos novos |

**Alternativa descartada — classificar dentro do worker e devolver a categoria
junto do resultado.** Amarraria dois ciclos de vida diferentes num so: a leitura
so apareceria depois da corrida terminar (no flop, ate 990 runouts por par), e o
filtro que pinta a matriz — que e informacao puramente local — ficaria refem do
progresso de uma corrida que nao tem nada a ver com ele.

**O que custa:** a categoria e a equity chegam por **caminhos diferentes** e em
**momentos diferentes** na mesma tela. O painel precisa saber renderizar
"categoria com contagem e massa, equity ainda em branco" como estado legitimo, e
nao como erro. Isso e desenho de UI, nao acidente.

---

### D-F3-2 + D-F3-3 — o avaliador da a FAMILIA; a subdivisao de par exige participacao da mao

**D-F3-2:** a fonte da categoria e `handCategory(score)` — as 9 familias do
avaliador. A subdivisao dentro da familia de par vem de **onde veio o par**,
informacao que o score de 5 cartas joga fora de proposito (set e trinca tem a
mesma forca e leitura oposta; o avaliador nao tem por que distinguir, o painel
tem).

**D-F3-3:** familia de **forca** (straight flush, quadra, full house, flush,
sequencia) **fica com o nome** mesmo quando quem joga e a mesa, marcada
`usesHoleCards: false`. Familia de **par** (set, trinca, dois pares, overpair ate
underpair) **exige participacao** das cartas do heroi; sem ela, cai para
`ace_high` / `no_pair`.

**O caso canonico que quebra a versao ingenua:** `AK` em `Qh 7s 7d`. O avaliador
devolve familia 1 (par de setes). Mapear familia direto para categoria escreveria
**"2o par"** — e falso: o par e da mesa, todo mundo tem, e ninguem paga uma
aposta achando que tem par. A classificacao correta e **`ace_high`** com
`usesHoleCards: false`.

**O segundo caso canonico:** `88` no mesmo `Qh 7s 7d` -> familia 2 (88 e 77) com
participacao do heroi -> **`two_pair`**, qualificador `with_board_pair`.

A assimetria e deliberada e tem justificativa de leitura, nao de forca:
sequencia na mesa **e** a sua sequencia (voce chega ao showdown com ela), par na
mesa **nao e** o seu segundo par (ele nao separa voce de ninguem).

#### Leituras que este ADR fixa (nao sao decisoes novas)

O pseudo-codigo da F3a e comprimido e, lido ao pe da letra, contradiz os proprios
criterios de aceite. Tres pontos ficam fixados aqui, cada um resolvido por outro
trecho **ja aprovado** da spec — nenhum e escolha deste ADR:

**R1 — a familia 2 exige participacao em ao menos UM dos dois pares, nao nos
dois.** O texto diz `heroi pareia dois ranks distintos ? two_pair : passo de par`
(F3a linha 109). Lido literalmente, `88` em `Q-7-7` **nao** pareia dois ranks
distintos (o 8 e um par so) e cairia no passo de par, virando `second_pair` —
exatamente o oposto do criterio de aceite 2. Quem resolve e a propria tabela de
qualificadores da spec, que define `with_board_pair` como *"par do heroi + par da
mesa (heroi **nao** pareia dois ranks distintos)"*. Portanto: familia 2 com
participacao em **um** par ja e `two_pair`; o qualificador e que diz se os dois
pares vieram do bordo (`top_two` / `top_bottom` / `bottom_two`) ou se um deles e
do heroi (`with_board_pair`).

**R2 — o passo de par tambem recebe a familia 3 sem participacao.** A linha
comprimida da F3a diz `fam 3 -> par de bolso do rank no bordo ? set : trips`, o
que classificaria `AK` em `7-7-7` como **trinca**. O `F3-detalhamento.md` e
explicito no cabecalho do passo de par: *"(`fam 1`, ou `fam 2/3` sem participacao
do heroi)"*. Com bordo `7-7-7` e `AK`, nenhuma carta do heroi entra na trinca ->
passo de par -> **`ace_high`**, `usesHoleCards: false`. A tabela de categorias
concorda: `trips` exige "1 carta do heroi no rank".

**R3 — SUPERADA em 2026-08-18 pela D-F3-20 (adiante).** Texto original mantido
para rastreabilidade: `usesHoleCards` descreveria a mao que o AVALIADOR nomeou,
nao o rotulo que a tela escreve. E a unica leitura compativel com os dois usos da spec ao mesmo
tempo: sequencia na mesa -> `straight` + `usesHoleCards: false`; par na mesa com
`AK` -> `ace_high` + `usesHoleCards: false`, **mesmo com o as na mao do heroi**.
Consequencia direta para a UI: a flag **nao** pode ser renderizada como "sua mao
nao participa" — em `ace_high` ela significa "a familia que o avaliador viu e da
mesa". Invariante util que cai disso: fora do river a flag so pode ser `false`
pelo passo de par, porque bordo de 3 ou 4 cartas nao forma cinco cartas sozinho.

---

### D-F3-4 — a regra de sobreposicao virada TIPO, nao disciplina

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

**O tipo E a regra.** Nao existe lista unica onde categoria de mao feita e tag de
draw convivam, entao **nao existe o `sum()` que produziria 137%**. As quatro
consequencias sao contrato, nao recomendacao:

1. `sum(massa por made) == massa total do range`, exato ate `1e-9`. Criterio de
   aceite 1 satisfeito **por construcao**, nao por cuidado de quem escreve o
   agregador.
2. `sum(massa por draw)` nao tem relacao com o total e **pode passar dele**. Isso
   e correto: um combo com flush draw e gutshot conta nas duas linhas.
3. O numero bem definido do bloco de draws e outro — **combos com >= 1 draw** —
   e e esse que vai no rodape.
4. Mao feita forte **nao apaga** draw. Set com flush draw e `set` + `fd`. Nunca
   reclassificar, nunca subtrair.

**Por que isso e desenho de tipo e nao disciplina — a linhagem da D8.** A F0
(D8 do indice) documentou este exato modo de falha noutro lugar: o `Verdict`
degradado continuava carregando `evCall` e `equityGap` finitos, e quem esquecesse
de checar `decision` voltava a pintar o "-13,8 fichas" fantasma. A licao que a F1
tirou dali (D-F1-8) foi trocar disciplina por tipo: `EngineResult` virou uniao
discriminada e o compilador passou a cobrar o `if`. Aqui o objeto perigoso seria
uma lista unica `categorias: { id, combos, massa }[]` misturando `top_pair` e
`fd`: um objeto que carrega numeros finitos, corretos individualmente, e que
alguem soma. A soma nao daria erro, nao daria `NaN`, nao dispararia teste — daria
137% com cara de certo. **Separar em dois campos de cardinalidade diferente e o
que torna a soma errada impossivel de escrever**, do mesmo jeito que a uniao
discriminada tornou impossivel ler `evCall` de um resultado degradado.

**Requisito de tela que nasce daqui:** a frase entre parenteses do cabecalho do
bloco de draws — *"um combo pode aparecer em mais de uma linha - nao somam 100%"*
— e requisito, nao decoracao. E a unica coisa que impede o jogador de somar as
duas colunas com os olhos, ja que o tipo so protege o codigo.

---

### D-F3-11 — `EngineResultOk` ganha `perVillainCombo`, aditivo

```ts
perVillainCombo: VillainComboResult[];
```

Mesma forma do `HeroComboResult` no que faz sentido do outro lado — `combo`,
`weight`, `pairMass`, `equity: number | null`, `degradedReason` — com a equity
medida do lado do **vilao** contra o range do heroi. Campo novo em
`EngineResultOk` (nunca em `EngineResultDegraded`), aditivo: quem consome hoje
nao quebra.

**Sem `evCall` e sem `decision`.** Quem enfrenta a aposta e o heroi; um `evCall`
do lado do vilao seria um numero finito, calculavel e sem pergunta correspondente
na tela — o genero exato de campo que a D8 ensinou a nao criar. A lista de campos
da propria spec ja o omite.

#### Onde o acumulo entra, ponto a ponto

**1. `createEngineRun`, no laco que ja existe (`run.ts:188-197`).** O laco duplo
que monta `pairHeroList` / `pairVillainList` / `pairMass` ganha um segundo
acumulador: `villainPairMass[v] += hc.weight`. E `O(H*V)` uma vez, fora do laco
quente, e e a metade simetrica do que a F1 ja faz para o heroi.

**2. `exactRun`, no laco de pares (`run.ts:378-388`).** Onde hoje ha
`heroNum[h] += vWeight[v] * outcome`, entra tambem
`villainNum[v] += hWeight[h] * (1 - outcome)`. O chop conta 0,5 dos dois lados,
entao heroi e vilao somam 1 por par avaliado, por construcao. O denominador e
simetrico ao do heroi (`run.ts:335-337`): `runoutsPerPair * villainPairMass[v]` —
e ele fecha exato porque `runoutsPerPair` (990 no flop) e **exatamente** o numero
de runouts em que nenhuma das 4 cartas do par foi comida, que sao os unicos que
entram no numerador.

**3. `monteCarloRun`, em `runSample` (`run.ts:500-515`) — e aqui mora a
armadilha.** O lado do vilao **nao** pode copiar a forma do lado do heroi. No
Monte Carlo da F1, o combo do vilao ja e sorteado **proporcional ao peso**
(`pickVillain`) e por isso a amostra entra no acumulador do heroi com peso 1
(ponderar de novo elevaria o peso ao quadrado — o comentario ja esta no codigo).
Do outro lado a assimetria e total: os combos do **heroi** sao percorridos
**exaustivamente** com rejeicao, e o peso deles nunca entrou na amostragem.
Portanto o acumulador do vilao **precisa** carregar o peso do heroi
explicitamente: `villainNum[v] += hero.weight[h] * (1 - outcome)` e
`villainDen[v] += hero.weight[h]`. Escrever `villainSum[v] += (1 - outcome)` com
contagem simples produziria um estimador da equity do vilao **contra um range de
heroi uniforme**, nao contra o range declarado — numero plausivel, estavel,
reproduzivel e errado.

**4. `assemble` (`run.ts:619`).** Ganha uma segunda passada, simetrica a do
heroi, produzindo `perVillainCombo`. `pairMass <= EPS` -> `equity: null` com
razao `no_valid_villain_combo` (nome espelhado do lado de la), nunca `0`. O
`confidence` agregado continua sendo o do heroi; o contrato do agregado nao muda.

**Alternativa descartada — rodar o motor de novo com os lados trocados (opcao (c)
do achado F-2).** Recusada por dois motivos, e o segundo e o grave:

- Dobra o tempo de uma pagina que ja recalcula a cada 400 ms de digitacao.
- **Sao duas corridas que podem divergir.** No exato, a ordem das somas em ponto
  flutuante seria outra, e `equity_heroi + equity_vilao` deixaria de fechar em 1
  por alguns ULPs — a tela mostraria "58,3% contra 41,8%" e ninguem saberia dizer
  qual das duas esta certa. No Monte Carlo e pior: com a semente e a amostragem
  refeitas do outro lado, as duas corridas veem **amostras diferentes** e a
  divergencia deixa de ser de arredondamento e passa a ser de ordem estatistica,
  visivel na primeira casa decimal. Uma corrida so alimentando os dois lados
  **fecha em 1 por construcao**, e essa identidade vira teste (abaixo).

**Alternativa descartada — opcao (b): entregar so contagem e massa por
categoria.** Contagem e massa sao locais e baratas (saem do `classify.ts`
sozinho), mas a equity media por categoria e o que responde "**de onde vem** a
equity" — a frase que define o Range Lab no indice. Meia leitura entregue e a
leitura que o jogador para de abrir.

**O que custa:**
- Uma escrita a mais em `Float64Array` por par por runout no laco mais quente do
  produto. A F1 mediu esse laco descendo de 555 ms para 7,0 ms no caso de aceite,
  e depois de 33 ms para o alvo de 20 ms so trocando acesso a objeto por array
  plano — e um laco **sensivel**, e a regressao de tempo precisa ser medida na
  frente, nao presumida.
- No Monte Carlo, a contagem de amostras **por combo do vilao** e muito menor que
  a do heroi: um combo do vilao so aparece nas amostras em que foi sorteado
  (esperanca `samples * weight_v / totalVillainWeight`). Combos de peso baixo vao
  chegar a `equity: null` por amostra insuficiente. A coluna de equity por
  categoria, no modo Monte Carlo, **pode vir parcial**, e a tela mostra `—` para
  a parte que nao tem numero. No modo exato isso nao acontece.

---

### D-F3-5 / D-F3-6 / D-F3-7 / D-F3-8 — as quatro regras que fazem o bloco de draws significar alguma coisa

**D-F3-5 — bordo de 5 cartas => `draws` sempre vazio.** Nao ha carta por vir. Tag
de draw no river e ruido que infla o painel e some com a linha que importa.
Criterio de aceite 3 cobra isso para **todo** combo, sem excecao — inclusive
`overcards2` / `overcard1`, que tambem sao tags de draw.

**D-F3-6 — draw so conta o que a mao do heroi ACRESCENTA ao que a mesa ja da.**
Bordo `9-8-7-6` da open-ended para os 1326 combos; listar isso como "draw do
range" nao separa ninguem de ninguem — a linha marcaria 100% e nao responderia
nada. A medida e comparativa:
`straightOuts(bordo | mao) > straightOuts(bordo)`. Criterio de aceite 4 fixa
justamente o combo que nao liga nada nesse bordo: ele **nao** recebe `oesd`.

`straightOuts(mask)` reusa a `STRAIGHT_TOP` da F1: para cada rank ausente da
mascara de 13 bits, liga o bit e pergunta se a tabela devolve topo diferente de
zero. **Nao ha avaliador novo nesta frente.**

**D-F3-7 — exclusao DENTRO da familia de draw, acumulo ENTRE familias.**
`fd_nut` XOR `fd` XOR `bdfd`; `oesd` XOR `gutshot` XOR `bdsd`. Um combo nao tem
flush draw *e* backdoor do mesmo naipe — sao o mesmo desenho em estagios
diferentes. Mas tem flush draw *e* gutshot, e essa combinacao e exatamente a
informacao que o jogador procura. E a mesma logica da D-F3-4 aplicada um nivel
abaixo: dentro da familia ha particao, entre familias ha etiqueta.

**D-F3-8 — overcards so quando `made` e `no_pair` ou `ace_high`.** "2 overcards"
com um set na mao e ruido: a mao ja tem valor feito, e as duas cartas altas nao
mudam nada da decisao. A tag existe para descrever a parte do range que **so tem
potencial**, e fora desse caso ela deixa de descrever.

**Nota de implementacao (nao e decisao nova): `bdsd` precisa de uma sonda de DUAS
cartas.** O `straightOuts` que a spec define liga **um** rank ausente por vez; um
backdoor de sequencia, por definicao, "completa com 2 cartas". A sonda de uma
carta nao o enxerga. A forma barata e varrer os pares de ranks ausentes (no
maximo `C(13,2) = 78` consultas de tabela por combo, todas na `STRAIGHT_TOP` ja
existente, e so no flop) — continua sem avaliador novo, mas **nao** e a mesma
funcao do `oesd`/`gutshot` e nao deve ser escrita como se fosse.

---

### D-F3-9 + D-F3-15 — kicker em banda absoluta, mais a marca `nutKicker`

**D-F3-9 — banda absoluta, declarada na tela como banda fixa:**
`k_top` = A/K · `k_good` = Q/J/T · `k_weak` = 9 ou menor.

**Por que absoluta e nao relativa ao bordo.** A alternativa relativa e mais justa
na media e **nao e explicavel numa linha**. A banda erra de um jeito **visivel**
(o jogador ve `J` escrito e discorda na hora); a relativa erra de um jeito
**invisivel** (o jogador ve `k_weak` e acredita). Entre um erro que o proprio
jogador corrige olhando e um erro que ele engole, o produto escolhe o primeiro —
e por isso a banda aparece **declarada** como banda fixa, nunca disfarcada de
avaliacao GTO.

**D-F3-15 — `nutKicker: boolean` = o kicker e o maior rank AUSENTE do bordo.**

A observacao do founder que originou a decisao, no ato de aprovar a D-F3-9:

> em `A-K-Q`, `AJ` e o **melhor kicker possivel** de top par — `K` ou `Q` nao
> dariam um top par melhor, dariam **dois pares**.

E o caso onde as duas bandas erram e a marca acerta: a banda absoluta diz
`k_good` (o `J` esta na faixa Q/J/T), e a relativa ao bordo diria `k_weak` (o `J`
e menor que os tres ranks do bordo), **que e falso** — nao existe kicker melhor
naquele bordo. A marca resolve **sem trocar a banda**: `nutKicker: true`, e a
tela escreve `Top par, kicker J (o melhor possivel neste bordo)`. Criterio de
aceite 5 fixa exatamente esse combo: `AJ` em `A-K-Q` sai `top_pair`, banda
`k_good`, `nutKicker: true`.

**D-F3-10 (registrada por completude, decidida junto):** flush `nut` / `strong` /
`weak` pela posicao da maior carta do naipe do heroi entre as cartas **vivas**
daquele naipe — as que nao estao no bordo. 1a => `nut`, 2a-3a => `strong`, 4a+ =>
`weak`. `K` de copas **e** nut quando o `A` de copas esta no bordo. "Vivas"
significa "ausentes do bordo": a segunda carta do proprio combo e o range do
oponente **nao** entram na conta — e uma simplificacao declarada, do mesmo genero
que a banda de kicker.

**Kicker nulo em par de bolso.** `second_pair` / `third_pair` / `weak_pair`
vindos de par de bolso nao tem kicker (as duas cartas sao o par), e o campo sai
`null` — nao `k_weak`. `fromPocketPair: true` e o que permite a tela escrever
"88 de bolso = 3o par" em vez de deixar o jogador adivinhar por que nao ha
kicker.

---

## Consequencias

### Criterios de aceite da F3a, como consequencias verificaveis

| # | Criterio | Como se verifica | Decisao |
|---|---|---|---|
| 1 | Soma das massas por mao feita = massa total (`1e-9`) | Propriedade sobre range aleatorio com semente fixa em varios bordos. Vale **por construcao** porque `made` e um valor unico | D-F3-4 |
| 2 | `AK` em `Q-7-7` -> `ace_high`; `88` -> `two_pair`/`with_board_pair` | Dois casos diretos; sao os dois que quebram o mapeamento ingenuo familia->categoria | D-F3-2, D-F3-3, R1 |
| 3 | Bordo de 5 cartas -> `draws` vazio para todo combo | Varredura do range inteiro num river | D-F3-5 |
| 4 | Bordo `9-8-7-6`: combo que nao liga nada nao recebe `oesd` | Comparacao `straightOuts(bordo\|mao) > straightOuts(bordo)` | D-F3-6 |
| 5 | `AJ` em `A-K-Q` -> `top_pair`, `k_good`, `nutKicker: true` | Caso unico, e o que originou a D-F3-15 | D-F3-9, D-F3-15 |
| 6 | Filtro "flush draw" acende so as classes que fazem flush draw; rodape conta | Conjunto de classes acesas vs classificacao combo a combo | D-F3-4 (draws como conjunto) |
| 7 | `classify` concorda com `evaluator.ts` na familia, semente fixa | Oraculo da D4 continua valendo | D-F3-2 |
| 8 | `npm run check` limpo; `tests/unit/combo-calc/` e `tests/client/range-lab/` verdes | Nenhuma decisao aqui muda tipo publico existente de forma incompativel | Todas |

### Obrigacoes de teste que nascem deste ADR

Alem dos criterios acima, este ADR cria obrigacoes proprias — cada uma trava uma
armadilha nomeada no texto:

- **`heroRangeEquity + villainRangeEquity == 1`** no modo exato, ate `1e-9`, em
  varios bordos. A identidade vale porque os dois agregados dividem o mesmo
  denominador (`sum sobre pares validos de w_h * w_v`) e os numeradores somam
  esse denominador (chop conta 0,5 dos dois lados). E o teste que prova que a
  corrida unica de D-F3-11 nao divergiu.
- **Monte Carlo com range de vilao de pesos desiguais**: a equity por combo do
  vilao tem que refletir o **peso do heroi**. Um range de heroi com uma classe de
  peso 1 e outra de peso 0,1 tem que produzir numero diferente do mesmo range com
  os dois pesos iguais — e o teste que pega o estimador "contra heroi uniforme".
- **Combo do vilao sem amostra no Monte Carlo** sai `equity: null` com razao, e a
  tela nao mostra `0%`.
- **`AK` em `7-7-7`** classifica `ace_high`, nao `trips` (leitura R2).
- **`usesHoleCards: false`** aparece em dois casos de natureza diferente:
  sequencia na mesa (familia de forca) e par na mesa com as na mao (`ace_high`).
  Os dois no mesmo teste, para fixar a semantica de R3.
- **Set com flush draw** aparece nas duas listas; `sum(massa por draw) > massa
  total` e caso **valido**, nao falha.
- **Exclusao intra-familia**: nenhum combo carrega `fd` e `bdfd` ao mesmo tempo,
  nem `oesd` e `gutshot`.
- **Overcards com set na mao**: nenhuma tag de overcard (D-F3-8).
- **`perVillainCombo` e aditivo**: um consumidor escrito contra o
  `EngineResultOk` da F1 continua compilando e produzindo o mesmo numero.
- **Regressao de tempo do laco exato** no caso de aceite da F1 (flop `Ad 8h 4h`,
  236 combos, 233.640 showdowns): o acumulo do lado do vilao nao pode devolver o
  laco ao patamar de 33 ms.

### Positivas

- O painel de leitura sai do vazio e passa a responder **de onde vem** a equity,
  que e a frase que define o Range Lab no indice.
- A soma que produziria 137% fica **impossivel de escrever**, nao "proibida por
  convencao" — mesma manobra que a D-F1-8 fez com o resultado degradado.
- `classify.ts` e puro, sem React, sem worker e sem motor: testavel direto, no
  mesmo molde de `uiRules.ts` (F0) e `rangeGestures.ts`/`history.ts` (F2).
- Uma corrida so alimenta os dois lados, e a identidade `heroi + vilao = 1` vira
  teste — a divergencia que a opcao (c) traria fica fechada para sempre.
- `perVillainCombo` e o insumo que a **F3b** vai precisar para separar value de
  blefe na cascata e no MDF (RF-03.2 e RF-03.4). Ele nasce aqui e paga la.

### Negativas

- **A leitura e a equity chegam por caminhos diferentes** (D-F3-1). O painel tem
  um estado intermediario legitimo — categorias com contagem e massa, coluna de
  equity em branco — que a UI precisa desenhar de proposito.
- **No Monte Carlo, a equity por categoria pode vir parcial.** A amostragem da
  F1 favorece o lado do heroi por desenho; o lado do vilao herda contagens
  menores. Limite conhecido, nao acidente.
- **Uma escrita a mais no laco mais quente do produto.** Custo pequeno em teoria,
  medido em nenhum lugar ainda; a F1 mostrou que esse laco reage a mudancas que
  pareciam inofensivas.
- **A banda de kicker erra de proposito** (D-F3-9). `nutKicker` cobre o caso mais
  visivel (`AJ` em `A-K-Q`), nao todos: `k_weak` vai aparecer em bordos onde o
  jogador discordaria, e a defesa e a declaracao na tela, nao a matematica.
- **O flush `nut`/`strong`/`weak` ignora as cartas do oponente e a segunda carta
  do proprio combo** (D-F3-10). Simplificacao declarada.

### Neutras / operacionais

- **Sem migration. Sem endpoint. Sem `shared/schema.ts`.** Frente inteira
  client-side.
- **Sem dependencia nova** no `package.json`.
- Arquivos novos previstos: `combo-calc/classify.ts`, `combo-calc/read.ts`,
  `range-lab/BoardTextureLine.tsx`, `range-lab/CategoryPanel.tsx`.
  Arquivos tocados: `engine/types.ts` (campo novo), `engine/run.ts` (acumulo nos
  dois modos + `assemble`), `range-lab/RangeMatrix.tsx` (prop
  `highlight?: Set<string>`, opcional — sem a prop, comportamento de hoje),
  `range-lab/ComboTable.tsx`, `pages/RangeLab.tsx`, `@/lib/ui-tokens`.
- **As cores por categoria vao para `@/lib/ui-tokens` na vizinhanca de `heat`, e
  NAO dentro de `tokens.color`** (emenda A14 + licao #22): `ColorKey` e derivado
  de `keyof tokens.color` e todo consumidor de `tokens.color[tom]` espera o shape
  `{ bg, text, border }`. Foi exatamente assim que `tokens.color.delta` quebrou o
  `FilterChip`. `heat` ja mora fora por esse motivo; a paleta de categorias segue
  o mesmo caminho.
- `RangeMatrix` ganha **prop opcional**, nao contrato novo: o popup
  (`CombosCalculator`, D13/D-F2-6) nao muda.
- O `Reset` da pagina passa a limpar tambem os filtros — o `RESET_TITLE` de
  `RangeLab.tsx:49` promete isso desde a F1, e e esta frente que cumpre.

### O que fica DEVENDO para a F3b

Registrado aqui para que a F3b abra a frio sabendo o que herda:

| Item | Estado ao fim da F3a |
|---|---|
| **Cascata** (RF-03.2) | Nao existe. Os cinco degraus dependem de massa, nao de `classify.ts`. O ultimo degrau tem que **bater** com o total do bloco de maos feitas desta frente — e o ponto de contato entre as duas sub-frentes |
| **Bloqueadores** (RF-03.3) | Nao existem. Dependem de `perVillainCombo` (entregue aqui) para separar value de blefe pelo confronto. Ficam **desabilitados no modo heroi-como-range**, com o motivo escrito na tela (achado F-5) |
| **MDF / `defenseAlpha`** (RF-03.4, D-F3-12) | Nao existe. `mdf.ts` e modulo proprio e **nunca** reusa `requiredEquity` — sao dois alphas diferentes (`B/(P+2B)` contra `B/(P+B)`) que vao aparecer no mesmo cartao. Ha teste que trava a desigualdade |
| **Linguagem do painel de MDF** (D-F3-16) | Nao existe. Numero sempre em frase, com sujeito e consequencia; formula so em tooltip |
| **Equity por categoria do lado do HEROI** | O `classify.ts` e simetrico e `perHeroCombo` ja existia; a F3a entrega o painel do **vilao** (RF-03.1). Ver ponto aberto 3 abaixo |

### Pontos abertos — perguntas ao founder, sem solucao inventada

Tres coisas que a spec da F3a **nao** decide e que este ADR nao decide por ela:

1. **De onde `classify.ts` tira a familia fora do river.** O pseudo-codigo diz
   `handCategory(evaluate7(board, hole))`, mas `evaluate7` exige **exatamente 7
   cartas** (`loadBoard` recebe 5 codigos de bordo). No flop sao 5 cartas no
   total, no turn 6. Nao ha como completar sem inventar carta. As duas rotas
   possiveis, sem escolha feita aqui: (a) usar `evaluateHand` de `evaluator.ts`,
   que aceita 5 a 7 — o criterio de aceite 7 ja amarra `classify` a esse oraculo
   e a D-F3-1 tirou a classificacao do caminho quente, entao a alocacao por
   chamada deixa de importar; (b) dar ao `fastEvaluator` uma entrada de 5/6
   cartas. A (a) e reuso, a (b) e codigo novo em zona ja testada.
2. **A forma da `ComboTable` no RF-03.8.** A tabela de `/range-lab` recebe
   `rows={result.perHeroCombo}` (`RangeLab.tsx:407`) — **uma linha por combo do
   heroi, ja agregado contra o range inteiro do vilao**. Nao existe "o combo do
   vilao daquela linha". O exemplo da spec (`KhQh = flush de copas -> voce A6s =
   top par, kicker 6`) e do shape v1 do popup (`Verdict.perCombo`, um item por
   combo do vilao contra a mao unica do heroi). E o mesmo descasamento de shape
   que o ADR-247 (D-F2-4) ja registrou para o `solveBreakevenMultiplier`. Com
   `perVillainCombo`, o que passa a existir sao **duas listas paralelas**
   (leitura do heroi, leitura do vilao), nao uma lista pareada.
3. **De qual lado e o painel de categorias e o filtro.** O RF-03.1 diz
   explicitamente "agrupar os combos **do vilao**", mas o exemplo que justifica o
   "E entre grupos" no RF-03.7 e sobre o heroi: *"qual parte do **meu** top par
   tem backup"*. E ha duas matrizes na pagina, e `highlight` e prop de
   `RangeMatrix`, que serve as duas. `classify.ts` e agnostico de lado (entrada
   `(hole, board)`), entao servir os dois lados nao custa matematica nova — a
   pergunta e de escopo e de tela, nao de motor.

### Pontos abertos — FECHADOS pelo founder em 2026-08-18

Os tres pontos acima foram respondidos na sessao de continuidade. Nenhum reabre
decisao anterior; os tres viram contrato para o test-writer.

**D-F3-17 (ponto aberto 1) — `classify.ts` usa `evaluateHand` de `evaluator.ts`,
rota (a).** Aceita 5 a 7 cartas, entao flop e turn entram sem inventar carta. E
reuso: o criterio de aceite 7 ja amarra `classify` a esse mesmo avaliador como
oraculo (D4), e a D-F3-1 tirou a classificacao do caminho quente, entao a
alocacao por chamada deixa de pesar. A rota (b) — dar entrada de 5/6 cartas ao
`fastEvaluator` — fica **recusada nesta frente**: e codigo novo em zona ja
testada, sem ganho de tempo onde o tempo importa.

**D-F3-18 (ponto aberto 3) — o painel de categorias e o filtro servem OS DOIS
LADOS, com seletor Heroi/Vilao.** `classify.ts` e agnostico de lado (entrada
`(hole, board)`), entao a matematica nao muda; o que muda e a tela. O lado ativo
do seletor decide qual range o painel agrupa e **qual matriz** o filtro pinta via
`highlight`. Fecha o RF-03.1 (agrupar os combos do vilao) e o exemplo do RF-03.7
("qual parte do **meu** top par tem backup") sem construir a mesma tela duas
vezes. Consequencia para a linha "Equity por categoria do lado do HEROI" da
tabela de divida: ela **sai da divida** — a F3a entrega os dois lados.

**D-F3-19 (ponto aberto 2) — `ComboTable` vira DUAS LISTAS PARALELAS, nunca
pareada.** A lista do heroi continua sendo `perHeroCombo` (uma linha por combo do
heroi, ja agregado contra o range inteiro do vilao) e ganha ao lado uma lista de
leitura do vilao alimentada por `perVillainCombo`. **Nao existe "o combo do vilao
daquela linha"** — o pareamento que o exemplo da spec sugere e do shape v1 do
popup (`Verdict.perCombo`, um item por combo do vilao contra a mao unica do
heroi) e nao sobrevive ao modelo v2. E o mesmo descasamento que o ADR-247
(D-F2-4) registrou para o `solveBreakevenMultiplier`. Obrigacao de teste que
nasce daqui: nenhum ponto da UI pode construir uma linha que junte um combo do
heroi a um combo do vilao — se aparecer, e o shape v1 vazando.

**D-F3-20 (2026-08-18) — `usesHoleCards` descreve a CATEGORIA NOMEADA; a leitura
R3 fica SUPERADA.** O test-writer achou a contradicao ao escrever o caso: o ADR
(R3) pedia `false` para `AK` em `Q-7-7`, e a spec (`F3a-leitura-categorias.md`,
secao "`usesHoleCards` — o que a flag significa") pede `true`, com a justificativa
ja escrita la:

> A flag **nao** e "a melhor mao de 5 cartas usa carta minha", que e outra
> pergunta e produziria `false` no primeiro exemplo. Duas perguntas parecidas,
> uma flag so: se ela responder as duas, responde errado uma delas.

O founder decidiu pela leitura da **spec**. Definicao valendo: `usesHoleCards` =
**a categoria nomeada foi formada com ao menos uma carta do heroi**.

- `AK` em `Q-7-7` -> `ace_high`, **`true`** (o as nomeia a categoria e e dele).
- `AK` em `7-7-7` -> `ace_high`, **`true`**, pelo mesmo motivo.
- `23` em `5-6-7-8-9` -> `straight`, **`false`** — a mesa joga sozinha, e este e o
  caso para o qual a flag existe.
- `32` em `A-K-Q-J-9` -> `no_pair`, **`false`** — nada foi formado pelo heroi.

O argumento que decidiu: o proprio R3 admitia que a flag **nao** poderia ser
renderizada como "sua mao nao participa". Uma flag chamada `usesHoleCards` que
nao pode ser lida como "usa minhas cartas" tem nome mentindo sobre conteudo, e a
UI teria que traduzir a flag toda vez que a mostrasse.

**A invariante do R3 sobrevive intacta:** fora do river, `usesHoleCards` so pode
ser `false` pelo passo de par (`ace_high` / `no_pair`), porque bordo de 3 ou 4
cartas nao forma cinco cartas sozinho — qualquer familia de forca no flop ou no
turn obriga participacao do heroi. O teste que trava essa invariante nao mudou.

Custo: 3 assercoes da red phase invertidas. Para esta flag, a tabela de decisoes
da spec passa a ser a fonte.

---

## Confianca

**Alta** para D-F3-1, D-F3-4, D-F3-5, D-F3-6, D-F3-7, D-F3-8, D-F3-9 e D-F3-15.
Sao decisoes do founder ja fechadas, com caso canonico verificado a mao contra o
codigo real: `STRAIGHT_TOP` existe e tem a forma que a contagem de outs precisa
(`fastEvaluator.ts:40-58`); `heat` ja mora fora de `tokens.color`, o que confirma
o caminho da paleta de categorias; e os dois casos de `Q-7-7` foram conferidos
contra o comportamento do avaliador, nao presumidos.

**Alta** para D-F3-11 no **modo exato**. O ponto de acumulo e mecanico
(`run.ts:378-388`), o denominador simetrico ja esta calculado, e a identidade
`heroi + vilao = 1` sai da propria estrutura do laco — nao depende de julgamento.

**Media** para D-F3-11 no **Monte Carlo**. A assimetria de amostragem (vilao
sorteado por peso, heroi exaustivo) foi lida direto do codigo e a correcao
proposta — ponderar pelo peso do heroi — e a unica que devolve o estimador certo;
mas a **qualidade** do numero resultante por combo do vilao depende de quantas
amostras cada um recebe, e isso este ADR nao pode fixar sem medir. O teste de
pesos desiguais fecha a corretude; a suficiencia amostral fica para a frente
medir.

**Media** para D-F3-2 e D-F3-3. A decisao esta clara e os dois casos canonicos
sao inequivocos, mas a arvore completa depende das tres leituras fixadas em R1,
R2 e R3 — nenhuma delas e escolha deste ADR (cada uma sai de outro trecho ja
aprovado da spec), e todas as tres existem porque o pseudo-codigo comprimido da
F3a contradiz os proprios criterios de aceite se lido ao pe da letra. O
test-writer deve tratar R1, R2 e R3 como casos de teste explicitos, nao como
detalhe de implementacao.

---

## Artefatos relacionados

- Specs: `Docs/specs/range-lab/F3a-leitura-categorias.md`,
  `Docs/specs/range-lab/F3-detalhamento.md` (o porque; secao 2 = decisoes
  fechadas, secao 10 = as cinco perguntas respondidas),
  `Docs/specs/range-lab/00-INDICE.md` (D-F3-3, D-F3-4, D-F3-12, D-F3-14),
  `Docs/specs/range-lab/F3b-decisao.md` (o que fica devendo)
- Diagramas: `Docs/architecture/diagrams/range-lab-f3a/`
  - `classify-arvore-de-decisao.mermaid` — da familia do avaliador ate as 16
    categorias, com o passo de par explicito e os dois casos canonicos marcados
  - `painel-leitura-sequence.mermaid` — os dois caminhos paralelos (motor com
    `perVillainCombo` / `classify.ts` fora do worker) e o que cada mudanca de
    entrada dispara
- Codigo afetado: `client/src/lib/combo-calc/{classify.ts,read.ts}` (novos),
  `client/src/lib/combo-calc/engine/{types.ts,run.ts}`,
  `client/src/components/range-lab/{CategoryPanel.tsx,BoardTextureLine.tsx,
  RangeMatrix.tsx,ComboTable.tsx}`, `client/src/pages/RangeLab.tsx`,
  `client/src/lib/ui-tokens.ts`
- Convencoes: `.claude/rules/03-padrao-codigo.md` (falhar alto — ausencia de dado
  devolve `null` com razao nomeada, nunca zero inventado),
  `.claude/rules/14-frontend-ui.md` (nada de valor visual solto),
  `.claude/rules/04-modelo-e-esforco.md`
- Licoes do `CLAUDE.md` invocadas: **#22** (record de shape heterogeneo quebra o
  tipo derivado — a paleta de categorias fica **fora** de `tokens.color`, como o
  `heat`), **#9** (log antes do fallback — combo sem amostra loga e degrada com
  razao, nao vira `0%`)
- ADRs anteriores da frente: **246** (F1 — motor, `EngineResult` como uniao
  discriminada, `pairMass`, Monte Carlo com heroi exaustivo), **247** (F2 — range
  builder; D-F2-4 registrou o mesmo genero de descasamento de shape entre v1 e
  v2 que reaparece no ponto aberto 2)
- Frentes anteriores: F0 commit `ea0f8303`, F1 commit `6f02c872`, F2 commit
  `d08a006c`
