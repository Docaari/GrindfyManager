# ADR-247: Range Lab F2 — range builder (atalhos por reuso de parser, undo/redo local, top X% fracionado, escopo do breakeven solver, Alt+drag, quitacao da D13)

## Status
Aceito

## Data
2026-08-17

Specs de origem: `Docs/specs/range-lab/F2-range-builder.md` (RF-02.1 a RF-02.6, mais
a secao "Detalhamento (2026-08-17, passe de arquitetura antes do TDD)" que ja
fechou boa parte das perguntas de forma) e `Docs/specs/range-lab/00-INDICE.md`
(decisoes D1 a D14, principalmente D9 e D13).

Modelo e esforco declarados na spec: **Sonnet 5 — Alto**. F2 nao mexe em
matematica de equity nem em schema — e composicao de UI e estado local sobre
contratos que a F1 ja fechou. Nao e zona critica pela tabela de
`.claude/rules/04-modelo-e-esforco.md`.

> **Nota de numeracao:** ultimo ADR em disco na abertura desta sessao e o **246**
> (`246-range-lab-f1-motor.md`). Este ADR usa o proximo livre confirmado =
> **247**, e a linha correspondente foi adicionada ao `README.md` desta pasta.

---

## Contexto

### O que a F1 deixou pronto e este ADR nao reabre

A F1 (ADR-246) entregou a matriz 13x13 no minimo indispensavel — `RangeMatrix`
liga e desliga classe por clique, sem gesto nenhum alem disso (comentario no
topo do proprio arquivo: *"Os atalhos de pintura, a grade de naipes e o peso por
combo sao da F2"*). O que a F2 herda pronto e nao reabre:

| Onde | Contrato herdado |
|---|---|
| `combos.ts` | `RANGE_TOKEN_RULES` — tabela ORDENADA de regras, `expand(m): string[] \| null`; `null` cede a vez, `[]` e resultado valido (D9 do indice) |
| `combos.ts` | `comboFreqOverrides` no `RangeEntry` — campo ja existe, ninguem na UI escreve nele ainda (RF-02.3) |
| `range-lab/RangeMatrix.tsx` | `cellNotation(row, col)` — pares na diagonal, suited acima (`row < col`), offsuit abaixo. Props `{ entries, onChange, defaultFrequency, testId }`, generico o bastante para servir heroi E vilao |
| `range-lab/RangeEntryList.tsx` | Lista de classes ativas com slider de frequencia por classe; percentual sempre inteiro (nunca `100.0%` — protege o teste que cata veredito fantasma) |
| `combo-calc/persistence.ts` | `saveDraftV2`/`loadDraftV2`, `SPOTS_KEY_V2` — a F2 nao mexe em persistencia, so escreve mais campos dentro do `RangeEntry` que ja e persistido |
| `evaluateSpot.ts` | `Verdict.perCombo: ComboResult[]` (v1) — INTOCADO; e o dado que o RF-02.6 consome |
| `engine/types.ts` | `EngineResultOk.perHeroCombo: HeroComboResult[]` (v2) — shape DIFERENTE de `perCombo`, um item por combo do HEROI agregado contra o range inteiro do vilao, nao um item por combo do vilao contra UMA mao do heroi |

### O que existe hoje na UI (o problema)

Hoje o unico gesto e clicar/arrastar com `onMouseDown` + `onMouseEnter`
(`CombosCalculator.tsx:663-664`), que nao dispara em toque. Nao ha desfazer, nao
ha selecao por linha/coluna, nao ha peso por combo na tela (embora o campo exista
no modelo desde a sprint original), e a matriz nova do `range-lab/` (F1) tem
ainda menos — so liga/desliga.

### Restricoes que este ADR nao reabre

- **Sem gramatica nova no parser onde a de hoje ja resolve** (D9 do indice): o
  Ctrl+clique tem que sair de `expandRangeToken`, nao de uma segunda
  implementacao paralela.
- **`ev.ts` intocado** (RF-02.6 e explicito): o `breakevenFrequency` fechado
  continua como esta; o solver novo e um numero AO LADO, nao uma reescrita.
- **Sem dependencia nova** (Artigo VII): grade de naipes, popover, undo — tudo
  com o que ja esta instalado.
- **Numero errado perde para numero ausente** (`00-produto.md`): um gesto que
  nao sabe expandir devolve range inalterado com razao, nunca um palpite.

---

## Decisao

### D-F2-1 — Ctrl+clique, cabecalho e Shift+clique: tudo em cima da matematica que ja existe

**Ctrl+clique reusa `expandRangeToken(notation + "+")` — zero gramatica nova.**
E o ponto central da frente: a celula clicada ja tem sua `notation` (vem de
`cellNotation`); anexar `"+"` e alimentar a MESMA tabela `RANGE_TOKEN_RULES` que
a F0 deixou pronta para isso (D9). Verificado contra o pedido explicito do
founder e os dois casos do RF-02.1:

| Clique em | Token | Regra que casa | Resultado |
|---|---|---|---|
| `22` | `"22+"` | `pairs-plus` | `22, 33, ..., AA` — 13 classes (criterio de aceite 1) |
| `A9s` | `"A9s+"` | `suited-offsuit-plus`, ramo `hi-kick != 1` (kicker sobe) | `A9s, ATs, AJs, AQs, AKs` (criterio de aceite 2) |
| `98s` | `"98s+"` | `suited-offsuit-plus`, ramo `hi-kick === 1` (conector sobe o gap) | `98s, T9s, JTs, QJs, KQs, AKs` |

As tres linhas rodam na tabela **hoje**, sem editar `combos.ts` — a unica
adicao ao parser nesta frente e a regra `gap-range` (abaixo, D-F2-3), que serve
`T9s-54s`, nao o Ctrl+clique. `rangeGestures.ts` (arquivo novo, puro) e so uma
casca: `expandCtrlClick(notation) => expandRangeToken(notation + "+")`,
testavel fora do React, no mesmo padrao de `uiRules.ts`.

**Cabecalho de linha/coluna deriva da mesma matematica de `cellNotation`, sem
tabela propria.** Fixar um eixo e variar o outro: linha do rank `R` (indice
fixo `r`) e `cellNotation(r, i)` para `i` de 0 a 12; coluna e `cellNotation(i,
c)`. Nao ha "conjunto de todas as maos do rank R" aqui — sao dois conjuntos de
13 celulas cada, DIFERENTES entre si (a linha do rank `R` mistura `R` como carta
alta nos suited com `R` como carta baixa nos offsuit; a coluna faz o inverso).
Isso e consequencia direta de `cellNotation` usar triangulo superior para
suited e inferior para offsuit — nao e um bug a corrigir, e a mesma convencao
que Equilab e GTO Wizard usam, e o RF pede exatamente "linha OU coluna inteira"
(uma, nao a uniao das duas).

**Shift+clique pinta o retangulo entre a ultima celula clicada e a atual.**
Exige um estado novo e pequeno — `lastCell: { row, col } | null` — atualizado a
cada clique simples (nao-modificado). O retangulo e
`cellNotation(r, c)` para `r` entre `min/max(lastCell.row, atual.row)` e `c`
entre `min/max(lastCell.col, atual.col)`, mesma forma de selecao de planilha.

**Pointer events substituem `onMouseDown`/`onMouseEnter`.** `onMouseEnter` nao
dispara em toque (criterio de aceite 5); a migracao para `onPointerDown` +
`onPointerEnter` (com `pointer-events` e nao mouse-events) e pre-requisito de
TUDO nesta secao — sem ela nem o clique simples funciona em tablet. O
encerramento de drag por `pointerup`/`blur`/`pointerleave` PRESERVA a robustez
que o codigo atual ja tem para mouse (spec e explicita nisso).

**Scroll na celula ajusta a frequencia da CLASSE em passos de 5% (emenda A7).**
`onWheel` na celula, delta positivo/negativo mapeado para
`clampFreq(entry.frequency +/- 0.05)` — reusa `clampFreq` de `combos.ts`, sem
funcao nova. Emenda A7 substitui o "arrastar vertical" do rascunho original
porque arrastar vertical colide com o gesto de pintar (arrastar horizontal ja
significa "pintar varias celulas").

**Peso rapido global (`BrushWeightControl.tsx`, emenda A9).** Um controle UNICO
que define a frequencia do PROXIMO pincel — nao e um campo novo no modelo, e um
estado de UI no dono do range (`RangeLab.tsx` ou `CombosCalculator.tsx`) que
alimenta o `defaultFrequency` que `RangeMatrix` ja aceita como prop. Zero
mudanca de contrato em `RangeMatrix`.

**O que custa:**
- `rangeGestures.ts` fica com quatro pequenas funcoes puras
  (`expandCtrlClick`, `expandAxis`, `expandRectangle`, e o aplicador de
  frequencia por scroll) que `RangeMatrix` chama a partir dos handlers de
  pointer — a matriz deixa de ser "so liga/desliga" e ganha uma dependencia
  nova, ainda que interna ao pacote.
- `lastCell` e um estado que sobrevive entre cliques mas NAO precisa sobreviver
  a troca de range (F1: quando o `entries` muda por fora, `lastCell` pode ficar
  apontando para uma celula que nao faz mais sentido — inofensivo, porque
  Shift+clique com `lastCell` invalido so produz um retangulo esquisito, nunca
  um crash).

---

### D-F2-2 — Historico local por matriz (`history.ts`), reset em prop externa

`combo-calc/history.ts` e um modulo puro e generico —
`{ past: T[], present: T, future: T[] }` com `push`, `undo`, `redo`. Nao conhece
`RangeEntry`; conhece `T`. E consumido por um hook (`useRangeHistory` ou
equivalente) instanciado em CADA lugar que possui um par `[entries, onChange]`
de range: o range do heroi e o range do vilao em `RangeLab.tsx` sao DOIS
historicos independentes, e o `entries` de `CombosCalculator.tsx` e um terceiro.
Ctrl+Z no range do heroi nunca desfaz uma pintura no range do vilao — e por
isso "por matriz" no titulo da decisao, nao "por pagina".

**Onde vive.** No DONO do estado (`RangeLab.tsx`/`CombosCalculator.tsx`), nao
dentro de `RangeMatrix.tsx`. `RangeMatrix` continua presentacional — o
comentario que ja diz "aqui a matriz faz o minimo" segue valendo depois da F2:
quem pinta ganha atalhos, quem guarda estado ganha historico, e as duas coisas
nao precisam morar no mesmo componente. Isso mantem `RangeMatrix` reutilizavel
sem forcar todo consumidor futuro a herdar undo/redo que talvez nao queira.

**Reset em prop externa e o ponto que exige desenho, nao so wiring.** Duas
acoes de `RangeLab.tsx` substituem `entries` por fora do fluxo normal de
pintura: `reset()` (botao "Limpar tudo", D-F1-10/emenda A19) e `loadSpot()`
(carregar um spot salvo da biblioteca). Se o historico nao souber diferenciar
"essa mudanca veio do meu proprio `push`" de "essa mudanca veio de fora", um
Ctrl+Z depois de carregar um spot salvo desfaria PARA DENTRO do spot anterior —
um bug de estado fantasma, nao matematico, mas do mesmo genero que o produto ja
trata como grave (numero — ou aqui, range — que nao devia estar na tela).

Mecanismo: o hook compara, a cada render, o `entries` recebido por prop contra
o proprio `state.present`. Se forem iguais (ou se a mudanca veio do ultimo
`push` que o proprio hook disparou — controlado por uma ref), segue normal. Se
forem diferentes E a mudanca NAO veio do hook, e reset externo:
`resetHistory(novoEntries)` zera `past`/`future` e adota o valor novo como
unico ponto de partida. `Ctrl+A` (range completo) e `Delete` (limpa) do
RF-02.1 NAO caem nesse caso — sao pintura como qualquer outra, passam por
`push` normal.

**Alternativa descartada — historico unico global da pagina.** Misturaria
edicoes do range do heroi com as do vilao numa pilha so; desfazer viraria
"desfaz a ULTIMA coisa que qualquer matriz da pagina fez", que o jogador nao
consegue prever olhando so para a matriz que ele estava editando.

**Alternativa descartada — persistir o historico no `localStorage`.** Fora do
pedido (RF-02.1 fala em `Ctrl+Z`/`Ctrl+Y` como ferramenta de sessao, nao de
travessia entre recargas de pagina) e custaria mais um par de chaves de
persistencia para manter em sincronia com `draft.v2`.

**O que custa:**
- Tres instancias do hook na pagina `/range-lab` mais uma no popup (quando o
  D-F2-6 estiver ligado) — cada uma com seu proprio par de listeners de teclado
  escopados ao container daquela matriz (nao `document`-level), para
  `Ctrl+Z`/`Ctrl+Y` acertarem o range certo.
- A heuristica "comparar prop contra `state.present`" exige que `onChange`
  sempre produza um array NOVO (nunca mutar `entries` in-place) — ja e a
  convencao do codigo (`RangeMatrix.toggle` ja faz `[...entries, novo]`), mas
  vira um invariante que o historico agora DEPENDE para funcionar, nao so uma
  boa pratica.

---

### D-F2-3 — Duas formas de peso: `RANGE_TOKEN_RULES` uniforme vs ramo dedicado de top X% fracionado

Sao dois mecanismos deliberadamente separados, porque carregam contratos de
peso incompativeis.

**`RANGE_TOKEN_RULES` continua peso uniforme.** Toda regra da tabela — incluindo
a UNICA regra nova que a F2 acrescenta, `gap-range` (para `T9s-54s`: intervalo
de conectores suited/offsuit com o MESMO gap, variando a carta alta entre os
dois limites, validando `hi - kick` igual dos dois lados do `-`) — devolve
`string[]`. Cada notacao devolvida recebe a MESMA frequencia (a do pincel
corrente ou do `defaultFrequency`) quando `applyRangeString` aplica o resultado.
Isso e o contrato que `expand: (m) => string[] | null` sempre teve, e e
suficiente para tudo em `RANGE_TOKEN_RULES` ate aqui, incluindo `gap-range`.

**"Top X%" fica FORA da tabela, num ramo dedicado, porque o contrato nao
serve.** A emenda A6 exige que a ULTIMA mao do preenchimento entre com **peso
fracionado** para bater a porcentagem pedida exatamente (top 23% nunca fecha em
23% se toda mao entrar em peso 1). `string[]` nao carrega peso por item — so
carrega notacao. Forcar isso dentro de `RangeTokenRule` exigiria mudar o
contrato de TODA A TABELA por causa de UM caso, ou inventar um sentinela de
peso dentro da string (tipo `"AQo:50%"`, que e formato de EXPORT, RF-02.5, nao
de token de preenchimento). Nenhuma das duas opcoes e boa; o ramo dedicado e
mais barato.

**Onde vive o ramo dedicado.** `applyRangeString`, ANTES do fallback
`^(\S+)$` que hoje "mata" qualquer string nao reconhecida tratando-a como
notacao literal — se o ramo de top X% viesse depois desse fallback, um digitar
tipo "top 23%" cairia no fallback e viraria uma tentativa de `parseNotation("top
23%")`, que falha silenciosamente. Fluxo: detecta o padrao (`^top\s+(\d+(?:\.\d+)?)%$`
ou equivalente), ordena as 169 maos por `rangeStrength.ts` (tabela de forca —
abaixo), preenche em peso 1 ate a mao cujo acumulado ULTRAPASSA a porcentagem
pedida, e a essa ULTIMA mao aplica o peso fracionado que fecha exato o
acumulado no alvo.

**A fonte da tabela de forca e dado medido, gerado offline, versionado.**
`combo-calc/rangeStrength.ts` le `combo-calc/data/handRanking.json` — 169 maos,
cada uma com sua equity contra mao aleatoria, medida por Monte Carlo (60.000
amostras por mao, semente fixa) via `scripts/generate-hand-ranking.ts`. O JSON
e COMMITADO no repositorio; o jogador nunca recalcula isso na propria maquina
(a razao esta registrada no indice: com poucas amostras o "top X%" pegava mao
fora do padrao ao arrastar o slider — ruido estatistico virando decisao
visivel). Isso faz de `rangeStrength.ts` uma leitura de arquivo estatico mais
ordenacao, nao um calculo — mais barato e mais previsivel do que rodar Monte
Carlo no cliente toda vez que o slider mexe.

**Por celula (emenda A10).** A celula da matriz precisa mostrar a fracao
selecionada quando o preenchimento por top X% para NO MEIO de uma classe
(porque uma classe do tipo suited/offsuit tem 4/12 combos, e o corte de
porcentagem pode cair dentro dela) — o mesmo mecanismo visual que ja existe
para `comboFreqOverrides` parcial (borda ambar em `CombosCalculator.tsx:666`),
reaproveitado, nao reinventado.

**O que custa:**
- Dois caminhos de escrita em `RangeEntry[]` com regras de peso diferentes que
  um leitor do codigo precisa saber distinguir: se `entries` veio de
  `RANGE_TOKEN_RULES`, toda entry tem a mesma `frequency`; se veio do ramo top
  X%, a ULTIMA entry por forca pode ter `frequency` fracionaria diferente das
  outras. Nenhum campo no `RangeEntry` marca "de onde veio" — e uma inferencia,
  nao um dado.
- `handRanking.json` e um artefato gerado que pode ficar desatualizado se
  `evaluator.ts`/`fastEvaluator.ts` mudar a logica de showdown no futuro — nao
  ha teste que religue automaticamente o dado ao codigo que o gerou; regenerar
  e acao manual (`scripts/generate-hand-ranking.ts`).

---

### D-F2-4 — `solveBreakevenMultiplier` fica no popup: `Verdict` v1 tem `perCombo`, `EngineResult` nao

A formula fechada de RF-02.6 —

```
A = soma_escalado(w * eq)   B = soma_escalado(w)
C = soma_resto(w * eq)      D = soma_resto(w)
k* = (alpha * D - C) / (A - alpha * B)
```

— precisa iterar `Verdict.perCombo: ComboResult[]`, separando o subconjunto
escalado (tipicamente os combos que o heroi GANHA) do resto, numa unica
passada. Esse array e a saida de `evaluateSpot(spot: Spot)` (v1): **um item por
combo do VILAO**, avaliado contra a mao UNICA do heroi. E exatamente o shape que
`heroEquityAtMultiplier` (ja existente, `evaluateSpot.ts:181`) consome, e
`solveBreakevenMultiplier(verdict, subset?)` e o mesmo padrao de assinatura —
recebe o `Verdict` pronto, nao reenumera runout.

**`EngineResultOk.perHeroCombo: HeroComboResult[]` (v2) nao serve o mesmo
proposito.** E um item por combo do HEROI, cada um ja agregado contra o range
INTEIRO do vilao (`pairMass`, `weight`, `equity` por combo do heroi). Nao existe,
por combo do heroi, a decomposicao "que fracao do meu ganho vem de quais
combos do vilao" que a formula de `k*` precisa varrer. Reconciliar os dois
shapes nao e questao de import a mais — e um calculo DIFERENTE (range do heroi
contra range do vilao, nao mao unica contra range do vilao), fora do escopo que
RF-02.6 pediu.

**Consequencia direta:** `RangeLab.tsx`/`VerdictPanel.tsx` NAO ganham o texto do
ponto de virada nesta frente. So `CombosCalculator.tsx` (popup, opera sempre com
`hero: [Card, Card]` unico) o recebe. A tela volta a mostrar a frase nos tres
streets (criterio de aceite 6 e 7) **la**, nao na pagina nova.

**`ev.ts` nao muda** (repetido aqui porque e restricao dura da spec): o
`breakevenFrequency` fechado continua exatamente como esta, e o teste
`f0-combos-basis.test.ts` que o fixa continua verde. `breakeven.ts` e um
arquivo NOVO, ao lado, nao uma reescrita.

**Valores de referencia (conferidos na F0, `f0-fixtures.ts`, pote 36,1 / call
13,8, alpha 27,65%):** flop `0,00762`, turn `0,05437`, river `0,31856` — o
river bate com o `breakevenFrequency` fechado atual a `1e-9` (criterio de
aceite 6), porque no river o denominador nao muda com `k` (e onde os dois
modelos coincidem, D11 do indice).

**Alternativa descartada — generalizar `solveBreakevenMultiplier` para aceitar
`EngineResult` tambem, com um adaptador que "achata" `perHeroCombo` num
`perCombo` equivalente.** Descartada porque a achatada nao seria matematicamente
equivalente (perderia a informacao de PAR heroi-vilao que `pairMass` resume) —
produziria um numero que parece o ponto de virada mas responde a pergunta
errada. Preferivel nao ter o numero a ter um numero com cara de certo.

**O que custa:**
- O jogador que monta range vs range em `/range-lab` nao ganha o ponto de
  virada nesta frente — so quem usa o popup com mao unica. Gap real, sem data
  de fechamento decidida; se uma frente futura quiser esse numero no modo
  range, precisa desenhar a formula equivalente para `pairMass`, nao reusar
  `breakeven.ts` como esta.
- `breakeven.ts` fica com um unico consumidor (`CombosCalculator.tsx`) — nao ha
  hoje motivo para exporta-lo de `combo-calc/index.ts` com visibilidade ampla
  alem do necessario para esse import.

---

### D-F2-5 — Alt+arrastar fixa UM naipe por gesto (decisao do founder)

A celula da matriz e a CLASSE inteira (ate 12 combos); nao ha "qual naipe" para
mirar durante um drag que varre varias classes de uma vez. O founder resolveu:

**No `pointerdown` de um Alt+drag:** se ainda nao ha naipe escolhido nesta
SESSAO de pagina (`altDragSuit: Suit | null`, estado local, nao persistido),
abre um mini-seletor de 4 naipes ANTES do drag prosseguir. Se ja existe
`altDragSuit` de um Alt+drag anterior, reusa sem perguntar de novo.

**O naipe escolhido vale para o gesto INTEIRO.** Toda classe tocada enquanto o
ponteiro segue pressionado com o drag iniciado em Alt ganha `suits` filtrado
para aquele UNICO naipe — nao ha escolha por classe individual dentro do mesmo
arrasto. Isso cobre o caso de uso citado na spec ("quero so as maos de espadas
do meu range") varrendo a matriz de ponta a ponta num gesto so.

**Custo de UX declarado, nao escondido:** a PRIMEIRA vez que o jogador usa
Alt+drag numa sessao de pagina, o gesto e interrompido pelo mini-seletor antes
de comecar a pintar — os Alt+drags seguintes na mesma sessao nao interrompem,
porque reusam `altDragSuit`. Isso e uma trocada consciente: perguntar uma vez e
mais barato do que perguntar zero vezes com um naipe hardcoded que nao e o que
o jogador queria.

**Alternativa descartada — perguntar o naipe por classe tocada.** Impraticavel
para um arrasto que varre dezenas de classes; o founder rejeitou explicitamente.

**Alternativa descartada — naipe fixo hardcoded (ex.: sempre espadas).**
Elimina a pergunta mas tambem elimina a escolha — contraria o proprio motivo do
gesto existir (deixar o jogador dizer QUAL naipe).

**O que custa:**
- Estado de sessao novo (`altDragSuit`) que sobrevive entre gestos mas nao
  entre recargas de pagina — comportamento implicito que a UI precisa deixar
  descobrivel (o mini-seletor reaparece se a pagina recarregar, sem aviso
  disso na tela).
- O mini-seletor e reusado tambem por `SuitPickerPopover` (RF-02.2, popover
  4x4 completo) mas NAO E o mesmo componente — o de Alt+drag e um seletor de UM
  clique entre 4 opcoes, mais raso que o popover de frequencia por combo. Dois
  componentes de escolha de naipe convivendo por proposito diferente.

---

### D-F2-6 — `CombosCalculator.tsx` paga a divida D13: consome os componentes de `range-lab/`

A F1 (D13 do ADR-246) deixou `CombosCalculator.tsx` intocado de proposito,
nomeando a religacao como divida da F2, que "reabre a UI e e dona dessa
divida". A F2 paga: `CombosCalculator.tsx` troca sua matriz inline
(`CombosCalculator.tsx:650-683`, `onCellDown`/`onCellEnter` mouse-only,
duplicando `cellNotation`) e sua lista linear de chips de naipe
(`CombosCalculator.tsx:652-670`) pelos componentes de `range-lab/` —
`RangeMatrix`, `RangeEntryList`, `SuitPickerPopover`.

**Por que isso e pagavel sem reescrever `CombosCalculator` inteiro.** O
contrato de `RangeMatrix` (`{ entries: RangeEntry[], onChange, defaultFrequency,
testId }`) e generico o bastante para servir os DOIS mundos: o `entries`
(vilao) de `CombosCalculator` e do MESMO tipo `RangeEntry[]` que o
`heroRange`/`villainRange` de `RangeLab.tsx`. A F1 ja desenhou o componente
assim (ele nao depende de `SpotV2` nem de nada do motor) — e por isso a divida
e pagavel em vez de virar retrabalho.

**Escopo exato da troca dentro de `CombosCalculator.tsx`:** so o lado do RANGE
DO VILAO. O heroi de `CombosCalculator` continua sendo `[Card, Card]` unico
(v1 `Spot.hero`), escolhido pela grade de 52 cartas existente
(`CombosCalculator.tsx:604-625`) — essa parte NAO e `RangeEntry[]` e nao entra
no escopo desta troca. `RangeLab.tsx`, ao contrario, ja usa `RangeMatrix` nos
DOIS lados (heroi e vilao) desde a F1, porque `SpotV2.heroRange` sempre foi
`RangeEntry[]`.

**Consequencia colateral positiva, nao pedida mas real:** como os atalhos
(D-F2-1 a D-F2-5) sao escritos DENTRO de `RangeMatrix`/`rangeGestures.ts`, o
popup ganha pointer events, Ctrl+clique, undo/redo etc. "de graca" — sem
duplicar a implementacao. E o efeito pratico de escrever a logica de gesto uma
vez so, no componente compartilhado, em vez de em cada consumidor.

**O gesto de RF-02.6 (breakeven) e a religacao de UI acontecem no mesmo
arquivo, na mesma frente** — `CombosCalculator.tsx` e o unico arquivo tocado
por D-F2-4 e por D-F2-6 ao mesmo tempo. Vale registrar porque e o arquivo de
maior risco de regressao desta frente (1142 linhas, sem teste de wiring
proprio — pendencia herdada da F0/F1, nao fechada aqui).

**Alternativa descartada — deixar `CombosCalculator.tsx` como esta e resolver a
D13 so quando (se) o popup for descontinuado.** Adiar de novo alongaria a
divida que a F1 ja tinha decidido nomear e nao pagar — e o popup continua sendo
a UNICA superficie que funciona hoje sem teste de wiring, entao adiar so soma
risco ao codigo que menos tem rede de seguranca.

**O que custa:**
- `CombosCalculator.tsx` continua SEM teste `.test.tsx` de wiring proprio
  (pendencia da F0, repetida aqui): trocar a matriz inline por componente
  compartilhado e uma mudanca real de comportamento (pointer events em vez de
  mouse events, undo novo) num arquivo que so o "Confira voce mesmo" do handoff
  verifica.
- Dois consumidores (`CombosCalculator`, `RangeLab`) dependem agora do MESMO
  componente `RangeMatrix` para o range do vilao — uma regressao em
  `RangeMatrix` quebra as duas telas ao mesmo tempo. E o resultado ESPERADO de
  pagar D13 (menos duplicacao = menos lugares para o bug se esconder, mas
  tambem menos isolamento entre as duas superficies).

---

## Consequencias

### Criterios de aceite da F2, como consequencias verificaveis

| # | Criterio | Como se verifica | Decisao |
|---|---|---|---|
| 1 | Ctrl+clique no `22` seleciona 13 classes (`22` ate `AA`) | `expandCtrlClick("22")` bate com `pairsFrom(0)` | D-F2-1 |
| 2 | Ctrl+clique em `A9s` seleciona `A9s` ate `AKs` | `expandCtrlClick("A9s")` bate com a regra `suited-offsuit-plus`, ramo kicker | D-F2-1 |
| 3 | Desfazer restaura o range exato anterior, inclusive pesos e naipes | `history.ts` guarda o `RangeEntry[]` inteiro (nao so notacoes) por snapshot | D-F2-2 |
| 4 | Override de frequencia por combo persiste no rascunho e volta apos recarregar | Escreve em `comboFreqOverrides`, que `saveDraftV2`/`loadDraftV2` ja serializam sem mudanca | D-F2-1 (RF-02.3) |
| 5 | Matriz responde a toque | Migracao para pointer events | D-F2-1 |
| 6 | No river, `solveBreakevenMultiplier` bate com `verdict.breakevenFrequency` ate `1e-9` | Formula fechada avaliada no spot de `f0-fixtures.ts`; river e onde os dois modelos coincidem (D11) | D-F2-4 |
| 7 | No turn e no flop, a equity avaliada no `k` devolvido encosta em `requiredEquity` (tolerancia `1e-6`) | `k*` resolvido em forma exata, sem bisseccao, por `A,B,C,D` | D-F2-4 |
| 8 | `npm run check` limpo; suite da area verde | Nenhuma decisao aqui muda tipos publicos existentes de forma incompativel | Todas |

### Obrigacoes de teste que nascem deste ADR

- `expandCtrlClick` reproduz exatamente as tres linhas da tabela de D-F2-1 (par,
  suited gap>1, suited gap=1), incluindo o caso trivial `expandCtrlClick("AA")
  === ["AA"]`.
- Linha e coluna do mesmo rank produzem conjuntos DIFERENTES entre si (nenhuma
  notacao repetida entre os dois, exceto o par).
- `resetHistory` e chamado (nao `push`) quando `entries` muda por
  `reset()`/`loadSpot()`; um `Ctrl+Z` logo depois de carregar um spot salvo
  NAO revela o spot anterior.
- Toda entry produzida por uma regra de `RANGE_TOKEN_RULES` tem a MESMA
  `frequency`; o ramo top X% produz exatamente UMA entry com `frequency`
  fracionaria diferente das demais (a de corte).
- `gap-range` (`T9s-54s`) valida que o gap dos dois lados do `-` e igual;
  gaps diferentes devolvem `null` (cede a vez, nao "sou eu e falho").
- `solveBreakevenMultiplier` no spot de `f0-fixtures.ts`: river bate com
  `breakevenFrequency` a `1e-9`; turn e flop batem com `requiredEquity` quando
  reavaliados no `k` devolvido, a `1e-6`.
- `solveBreakevenMultiplier` devolve `null` (com razao) quando o denominador
  `A - alpha*B` zera ou quando `k* < 0` — nunca satura no extremo em silencio.
- Alt+drag: toda classe tocada no MESMO gesto recebe o MESMO naipe em `suits`;
  o mini-seletor nao reaparece dentro da mesma sessao apos a primeira escolha.
- `CombosCalculator.tsx` com range do vilao pintado via `RangeMatrix`
  compartilhado produz o MESMO `Verdict` que produzia antes da troca (regressao
  contra os golden tests existentes) — a troca de componente nao pode mudar
  matematica.

### Positivas

- O Ctrl+clique — o pedido mais explicito do founder nesta frente — sai sem
  tocar `combos.ts` fora de UMA regra nova (`gap-range`, que nem serve o
  Ctrl+clique). A validacao (D9 do indice) se prova certa na primeira frente
  que a exercita de verdade.
- Popup e pagina nova passam a compartilhar a mesma implementacao de matriz e
  gestos — a divergencia entre "duas telas para a mesma matematica" que o
  ADR-246 registrou como risco permanente fica MENOR, nao maior.
- O ponto de virada fora do river (RF-02.6) devolve um numero que a F0 tinha
  tirado da tela por ser errado — sem reabrir `ev.ts` nem o oraculo do river.
- `rangeGestures.ts` e `history.ts` sao modulos puros, testaveis sem DOM — no
  mesmo molde que `uiRules.ts` ja validou na F0.

### Negativas

- **`solveBreakevenMultiplier` nao alcanca `/range-lab`** — o jogador que monta
  range vs range fica sem o ponto de virada nesta frente (D-F2-4). Gap
  declarado, sem prazo de fechamento.
- **`CombosCalculator.tsx` segue sem teste de wiring proprio**, e essa frente
  E a que mais mexe nele desde a F0 (D-F2-6) — maior risco de execucao da
  frente, e nao e matematico.
- **Dois seletores de naipe convivem** (mini-seletor do Alt+drag, popover
  completo do RF-02.2) por proposito diferente — mais uma superficie para
  manter consistente visualmente.
- **`handRanking.json` e dado gerado, nao derivado em runtime** do avaliador
  atual — pode ficar desatualizado se a logica de showdown mudar, sem alarme
  automatico.
- **Historico local nao sobrevive a recarga de pagina nem a troca de aba** —
  esperado (RF-02.1 nao pede persistencia), mas vale registrar como limite
  conhecido, nao esquecido.

### Neutras / operacionais

- **Sem migration.** Sem endpoint novo. Sem mudanca em `shared/schema.ts` — a
  frente inteira e client-side (cabecalho da propria spec confirma).
- **Sem dependencia nova** no `package.json`.
- Arquivos novos: `combo-calc/history.ts`, `combo-calc/rangeGestures.ts`,
  `combo-calc/breakeven.ts`, `combo-calc/rangeStrength.ts`,
  `combo-calc/data/handRanking.json`, `combo-calc/rangeSerializer.ts`,
  `scripts/generate-hand-ranking.ts`, `range-lab/SuitPickerPopover.tsx`,
  `range-lab/RangeLibrary.tsx`, `range-lab/TopPercentSlider.tsx`,
  `range-lab/BrushWeightControl.tsx`.
- `rangeSerializer.ts` (`collapseRangeToNotation`, RF-02.5/emenda A12) e
  `RangeLibrary.tsx` (biblioteca de ranges nomeados, separada de spot salvo)
  nao geraram decisao propria neste ADR — sao extensao direta de padroes ja
  fechados (serializacao ja existe em `persistence.ts`; salvar-nomeado-e-listar
  ja existe em `SpotLibrary.tsx`) e nao abrem pergunta de arquitetura nova.

---

## Confianca

**Alta** para D-F2-1, D-F2-3 e D-F2-6. Os tres casos do Ctrl+clique foram
verificados a mao contra as regras reais de `combos.ts` antes deste ADR (nao e
projecao — e leitura do codigo existente); a separacao peso-uniforme vs
peso-fracionado e mecanica (o contrato `string[]` de `RangeTokenRule`
literalmente nao carrega peso, entao nao ha ambiguidade sobre onde o top X%
teria que morar); e a compatibilidade de `RangeMatrix` com os dois consumidores
e verificavel direto na assinatura do componente, sem depender de julgamento.

**Alta** para D-F2-4. A formula fechada e algebra direta de
`E(k) = (kA+C)/(kB+D) = alpha`, e os tres valores de referencia ja foram
recalculados nesta sessao contra `f0-fixtures.ts` e batem com o texto da spec
(a correcao do criterio de aceite 6, de `0,9234` para `0,31856`, foi conferida,
nao so copiada).

**Media** para D-F2-2. O mecanismo de "detectar reset externo comparando prop
contra `state.present`" e correto na forma, mas depende de um invariante do
resto do codigo (nunca mutar `entries` in-place) que este ADR nao pode
impor por tipo — so por convencao, e convencao e o tipo de coisa que quebra
sem aviso.

**Media** para D-F2-5. A decisao do founder esta clara e documentada, mas a
interacao exata entre "mini-seletor interrompe o primeiro gesto" e o resto do
fluxo de pointer events (o que acontece se o jogador soltar o ponteiro
ENQUANTO o mini-seletor esta aberto?) fica para o test-writer fechar como caso
de borda — este ADR fixa o QUE acontece, nao o detalhe fino de sequenciamento
de eventos.

---

## Artefatos relacionados

- Specs: `Docs/specs/range-lab/00-INDICE.md`, `Docs/specs/range-lab/F2-range-builder.md`,
  `Docs/specs/range-lab/F0-verdade.md` (RF-00.5/RF-00.6, base de `verdictCalcBasis`
  e `parseImportedFrequency` que D-F2-3 reusa o espirito de)
- Diagramas: `Docs/architecture/diagrams/range-lab-f2/`
  - `gestos-e-historico.mermaid` — sequencia de um gesto de pointer ate o
    `onChange`, incluindo undo/redo e o reset em prop externa
  - `parser-uniforme-vs-top-x.mermaid` — despacho de `applyRangeString` entre
    `RANGE_TOKEN_RULES` (peso uniforme) e o ramo de top X% (peso fracionado)
  - `combos-calculator-e-range-lab.mermaid` — os dois consumidores de
    `range-lab/` (v1 mao unica vs v2 range do heroi) e a fronteira exata de
    `solveBreakevenMultiplier`
- Codigo afetado: `client/src/lib/combo-calc/{combos.ts,history.ts,rangeGestures.ts,
  breakeven.ts,rangeStrength.ts,rangeSerializer.ts,data/handRanking.json}`,
  `client/src/components/range-lab/{RangeMatrix.tsx,RangeEntryList.tsx,
  SuitPickerPopover.tsx,RangeLibrary.tsx,TopPercentSlider.tsx,BrushWeightControl.tsx}`,
  `client/src/components/calculators/CombosCalculator.tsx`, `scripts/generate-hand-ranking.ts`
- Convencoes: `.claude/rules/03-padrao-codigo.md` (falhar alto — regra
  cede a vez com `null`, nunca com `[]` silencioso), `.claude/rules/04-modelo-e-esforco.md`
- Licoes do `CLAUDE.md` invocadas: **#9** (log antes do fallback — aplica a
  `estimateCost`/gestos que podem falhar em spot incompleto), **#19** (link tem
  que casar com rota — nao se aplica a mudanca de estado, mas o mesmo principio
  de "nao falhar em silencio" governa o reset de historico)
- Sprint anterior: F1, commit `6f02c872`. F0: commit `ea0f8303`.
