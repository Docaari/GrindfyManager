# F5 — Aprendizados do MindRiver

> Frente 5 do [Range Lab](00-INDICE.md). Nasceu do estudo do **Mind River**, app
> desktop do proprio founder (PySide6, licenciado, estudado em 2026-08-16).

## Cabecalho
| | |
|---|---|
| **Modelo** | F5a: Opus 5 — Extra · F5b: Sonnet 5 — Alto |
| **Depende de** | F1 (motor rapido + worker). F3 e vizinha: parte do F5a **substitui** RFs da F3 |
| **Entrega** | Os graficos de leitura do MindRiver + as ferramentas que faltam na nossa |
| **Migration** | nao |
| **Status** | Proposta — aguardando aval |

Frente grande demais para uma sessao. Quebrada em duas:

| Sub-frente | Escopo | Modelo |
|---|---|---|
| **F5a — Graficos** | Curva de equity dos dois ranges, fluxo rua a rua, hotness por carta, heatmap 13x13 + chips por combo | Opus 5 — Extra |
| **F5b — Ferramentas** | Range Finder, dead cards, peso rapido/scroll, notacao completa + serializador, cenario em arquivo | Sonnet 5 — Alto |

---

## Como o estudo foi feito

O `MindRiver.exe` e um PyInstaller onedir (Python 3.13, PySide6, sem QtCharts —
tudo desenhado com `QPainter`). O arquivo do PYZ foi lido e cada modulo teve
nomes, docstrings e constantes extraidos. Nenhum arquivo do app foi alterado.

Modulos do app: `core.{cards,ranges,ranking,evaluator,classify,equity,scenario,i18n,license}`
e `ui.{main_window,header,range_panel,range_grid,range_bar,comparison_strip,board_panel,dead_cards_panel,deck_widget,matrix_widget,flow_graph,output_panel,equity_worker,theme}`.

Layout: tres colunas — **ranges** | **board** | **saida**. A coluna de saida e um
`QTabWidget` de 7 abas: Estatisticas, Equity, Matrix, Groups, Hotness, Flow,
Range Finder. E o mesmo layout de tres paineis que a F1 ja decidiu para
`/range-lab` (decisao D1) — convergencia independente, bom sinal.

---

## Parte A — Achados que sao **emenda** nas frentes ja escritas

Nao viram RF novo: corrigem ou detalham RF existente. Aplicar nos documentos
citados quando o founder aprovar.

| # | Achado no MindRiver | Destino | O que muda |
|---|---|---|---|
| A1 | Avaliador: `score = (cat << 20) \| r1<<16 \| r2<<12 \| r3<<8 \| r4<<4 \| r5`, com tabela `_STRAIGHT_TOP` de 8192 posicoes indexada pela bitmask de 13 ranks (roda inclusa, mask `4111`) | **F1 / RF-01.1** | Sai de "faca uma tabela pre-computada" para a receita exata. Um inteiro comparavel por mao, sem alocacao |
| A2 | Modo exato ate `EXACT_LIMIT = 4_000_000` showdowns; acima disso Monte Carlo com **semente fixa** (`20240815`); progresso a cada 200 ms ou 200k amostras; cancelamento por callback | **F1 / RF-01.4** | Nosso orcamento proposto era 5M — adotar 4M, que e numero medido em uso real. Semente fixa e o que torna o resultado reproduzivel. **Nossa D5 continua vencendo: o MindRiver nao mostra intervalo de confianca; nos mostramos** |
| A3 | Orcamento de iteracoes **por superficie**: faixa ao vivo 6.000 (debounce 450 ms), matriz e pizza 15.000 (debounce 400 ms), hotness 2.500 por carta, fluxo 12.000 por rua, range finder 3.000 por mao | **F1 / RF-01.4** | Falta na nossa spec. Cada painel paga o preco do que entrega |
| A4 | Aba so recalcula quando esta visivel (`_matrix_dirty`, `_groups_dirty`, `_hotness_dirty`, `_flow_dirty`) | **F1 / RF-01.4** | Padrao de invalidacao preguicosa; sem isso a pagina de tres paineis recalcula tudo a cada tecla |
| A5 | Tabela de ranking pre-flop **empacotada** (`hand_ranking.json`, 169 mãos, 60.000 iteracoes por mao, semente fixa, calculada uma vez em dev). O comentario diz o motivo: ruido estatistico fazia a barra "top X%" pegar mao fora do padrao | **F2 / RF-02.4** | Fecha a pendencia aberta do indice ("fonte da tabela de ranking"). A fonte e equity contra mao aleatoria, medida — nao heuristica. Continua sendo declarada na tela, mas agora com metodo e numero de amostras |
| A6 | `apply_top_percent` preenche na ordem de forca e da **peso fracionado a ultima mao** para bater a porcentagem pedida exatamente | **F2 / RF-02.4** | Detalhe que faltava: sem ele, "top 23%" nunca da 23% |
| A7 | Scroll do mouse sobre a celula ajusta a frequencia da classe em passos de 5% | **F2 / RF-02.1** | Nossa spec pedia "arrastar vertical dentro da celula". Scroll e mais preciso e ja e o gesto que o founder tem no dedo |
| A8 | Popover de naipes: um botao por combo com o simbolo colorido, presets de frequencia 25/50/75/100 e `Clear`; combos impossiveis pelo board ficam **escondidos** | **F2 / RF-02.2 e RF-02.3** | Confirma a grade de naipes e resolve o "nenhum ponto da UI escreve `comboFreqOverrides`": e o mesmo popover |
| A9 | Peso rapido global: barra vertical no painel do board (passo 5%) define o peso do proximo pincel | **F2 / RF-02.1** | Novo. Pintar um range a 50% inteiro vira um gesto |
| A10 | Celula mostra `pct` selecionado, fracao morta pelo board com opacidade reduzida, e tooltip com `X/Y combos · avg N%` + `Z% blocked by board` | **F2 / RF-02.4** | Nossa spec pede contagem global; aqui e por celula, que e onde o card removal e visivel |
| A11 | Gramatica de notacao completa: `AA`, `AKs`, `AKo`, `AK`, `77+`, `A5s+`, `55-TT`, `T9s-54s`, `AsKh`, `AQo:0.5`, `AQo:50%`, `top 25%` | **F0 / RF-00.3** | A F0 conserta so o `98s+`. Adotar a gramatica inteira como alvo, incluindo intervalo (`T9s-54s`), combo especifico e peso inline |
| A12 | Serializador que **colapsa** o range de volta em notacao curta (`22+`, `A2s+`) em vez de listar combo a combo | **F2 / RF-02.5** | Sem isso, "copiar range" devolve um paredao ilegivel |
| A13 | `Copy GTO Wizard`: mesma notacao, peso como fracao de 3 casas (`AQo:0.336`), sem `%` | **F4 / RF-04.5** | Formato exato, ja resolvido |
| A14 | Taxonomia de `classify`: 16 categorias de mao feita com cor fixa e qualificador (flush `nut`/`strong`/`weak`; dois pares `top two`/`top + bottom`/`bottom two`/`pair + board pair`; par com kicker `k_top`/`k_good`/`k_weak`) + 8 draws (`fd_nut`, `fd`, `bdfd`, `oesd`, `gutshot`, `bdsd`, `overcards2`, `overcard1`) | **F3 / RF-03.1** | Nossa lista era mais grossa. Adotar esta, inclusive as cores |
| A15 | `board_texture`: `monotone`/`2flush`/`rainbow` + `trips`/`paired`/`unpaired`, exibido no topo das estatisticas | **F3 / RF-03.1** | Barato e informativo |
| A16 | Filtro de categoria **esmaece a matriz**: marcar "flush draw" acende so as celulas que contem flush draw (`set_filter_hits`) | **F3 / RF-03.7** | Este e o mecanismo que faltava especificar. O filtro nao filtra uma tabela, ele pinta o range |
| A17 | Rodape das estatisticas: `total combos`, `combos que passam no filtro`, e a massa ponderada ao lado da contagem crua | **F3 / RF-03.1** | Contagem e massa lado a lado, sempre — e a regra que impede somar coisa que nao soma |
| A18 | Cor: gradiente de calor com escala **relativa** ao min/max do conjunto quando o que importa e o ranking (hotness), e uma variante escurecida so para texto, porque o amarelo do meio da escala e ilegivel | **F1 / RF-01.5** | Vai para os tokens (`14-frontend-ui.md`: nada de valor solto) |
| A19 | Botao `Reset` limpa tudo — ranges, board, dead cards, filtros — com tooltip dizendo exatamente isso | **F1 / RF-01.5** | Falta na nossa |
| A20 | Board sem fileira de slots: um baralho unico; as 3 primeiras cartas viram flop, a 4a turn, a 5a river. `Random` sorteia o flop inteiro; com flop na mesa, completa uma carta por vez | **F1 / RF-01.5** | Menos clique e menos estado. Adotar no `BoardPicker` |

**Nao adotar:** a pizza "Groups" (participacao de equity por jogador) so ganha
sentido com 3+ ranges, e multiway esta fora de escopo ate a F3 fechar. O painel
de comparacao de 2 a 6 ranges cai na mesma regra — aproveitamos dele **so** o
padrao de cartao com selo de equity ao vivo e debounce, para dois ranges.

---

## Parte B — RFs novos

### F5a — Graficos de leitura

#### RF-05.1: Curva de equity dos **dois** ranges sobrepostos
O MindRiver desenha os combos ordenados por equity, do melhor para o pior, como
linha declinante — e desenha **as duas** linhas no mesmo eixo: o range ativo em
cor cheia, o adversario em cinza atras. No rodape: contagem de combos e equity
media.

E o "grafico de equidade" pedido. Difere do nosso RF-03.6, que so previa a curva
do heroi com a linha de `alpha` cortando.

**Regras:**
- Eixo X: combos do range ordenados por equity (melhor -> pior), normalizado pela
  largura (ranges de tamanhos diferentes ficam comparaveis).
- Eixo Y: 0 a 100% de equity, com marcas em 0/50/100.
- Duas series: range ativo e range adversario. A cor sai dos tokens.
- **Nosso diferencial, que o MindRiver nao tem:** a linha horizontal de `alpha`
  (equity necessaria) cortando o grafico, e a contagem "N das suas M maos pagam".
  Esse numero e o mesmo `callThresholdIndex` da F1 — se divergir, e bug.
- Area entre as curvas nomeada na tela como vantagem de range, com o sinal certo.
- Vazio declarado: sem calculo ainda, a caixa diz o que fazer; nunca uma linha
  reta em zero fingindo dado.

**Aceite:**
- [ ] Numero de combos acima da linha de `alpha` bate com `callThresholdIndex`.
- [ ] Media exibida bate com `heroRangeEquity` do motor (tolerancia `1e-9`).
- [ ] Trocar qual range e o ativo espelha as duas linhas, sem recalcular.

#### RF-05.2: Fluxo de equity rua a rua
Com o board montado, recalcula a equity range vs range **em cada rua ja
definida** (flop com 3 cartas, turn com 4, river com 5) e desenha uma linha por
range ligando os tres pontos.

Responde "quem melhorou com o runout" — e a pergunta que o jogador faz depois da
mao, e nenhum painel nosso responde.

**Regras:**
- So habilita com pelo menos 3 cartas no board; com menos, explica o motivo.
- Uma chamada de motor por rua, em fila (nao em paralelo — o worker e um so).
- Cada ponto rotulado com o valor; ruas ausentes nao inventam ponto.
- Reaproveita o mesmo `Spot`; o board de cada rua e prefixo do board atual.

**Aceite:**
- [ ] Board de flop: um ponto. Turn: dois. River: tres.
- [ ] O ponto de river bate exatamente com a equity do painel principal.
- [ ] Board incompleto nao renderiza linha nenhuma, e diz por que.

#### RF-05.3: Hotness — que carta ajuda e que carta atrapalha
Para cada carta que ainda pode sair (52 menos board, menos mortas, menos as do
range do heroi quando ele e mao unica), simula ela caindo e recalcula a equity do
range ativo contra o adversario. Pinta o baralho 13x4 com gradiente **relativo**
ao min/max do proprio conjunto, e lista as cartas ordenadas. Resumo:
"N cartas aumentam a equity · M cartas diminuem".

Nossa F3 RF-03.5 pedia matriz de runout pintada por **decisao** (call/break-even/
fold). As duas leituras sao complementares.

**Regras:**
- Um seletor: pintar por **equity** (MindRiver) ou por **decisao** (nosso
  RF-03.5). Padrao: decisao — e a pergunta que a ferramenta se propos a responder.
- Grade de 52 celulas com as cartas indisponiveis apagadas e nao clicaveis.
- Turn (uma carta por vir) e o caso exato. Flop agrega o river por dentro; o
  custo dobra e a tela declara que agrega.
- Card removal: a carta simulada sai do range dos dois lados antes do calculo.

**Aceite:**
- [ ] Board de turn: exatamente 44 celulas vivas; nenhuma carta do board ou da
      mao do heroi aparece viva.
- [ ] A soma ponderada das equities por carta bate com a equity atual do turn
      (tolerancia de amostragem declarada).
- [ ] Alternar equity/decisao nao dispara recalculo — e a mesma corrida.

#### RF-05.4: Matriz 13x13 de equity + chips por combo
A grade 13x13 pintada pela equity media daquela classe contra o range adversario,
no board atual. Clicar (ou passar o mouse) numa celula abre embaixo os combos
concretos daquela classe, cada um com sua equity, ordenados do melhor para o pior
e com os naipes coloridos.

**Regras:**
- Uma corrida do motor alimenta a grade inteira (equity por combo ja e produto do
  calculo; nao recalcular por celula).
- Celula sem combo vivo fica neutra, nao verde de 0%.
- O chip mostra o combo e a equity; a cor do texto usa a variante escurecida do
  gradiente (A18), nunca o amarelo cru.
- Funciona para o range do heroi e para o do vilao, com o mesmo componente.

**Aceite:**
- [ ] A media ponderada das celulas bate com a equity agregada do range.
- [ ] Celula de classe totalmente bloqueada pelo board nao aparece pintada.
- [ ] Clicar numa celula nao dispara calculo novo.

---

### F5b — Ferramentas

#### RF-05.5: Range Finder
Dado um range de referencia (sem board, so pre-flop) e uma equity minima,
devolve **todas** as 169 maos iniciais cuja equity contra aquele range bate o
minimo — e um botao para aplicar o resultado ao range ativo.

Estilo Equilab. Serve para montar defesa: "contra o range de open dele, o que
tem 45% ou mais?".

**Regras:**
- Entrada: texto de notacao ou botao "usar o range ativo".
- Saida: notacao colapsada (A12) + contagem de combos e porcentagem de 1326.
- O corte de equity e um slider de 0 a 100 e **reaplica sem recalcular** — a
  corrida guarda a equity das 169 maos, o slider so filtra.
- Pre-flop puro, sem board. Se houver board montado, a tela diz que ele e
  ignorado aqui.
- Roda no worker com progresso "mao N de 169" e cancelamento.

**Aceite:**
- [ ] Mudar o slider depois de calcular nao dispara motor.
- [ ] Aplicar ao range ativo substitui o range e a contagem confere.
- [ ] Corte em 0% devolve as 169 maos; corte em 100% devolve vazio, sem erro.

#### RF-05.6: Cartas mortas separadas do board
Painel proprio para cartas conhecidas que **nao** estao no board (mao que outro
jogador mostrou, carta queimada vista). Entram no card removal de todos os
ranges, mas nao contam como rua.

**Regras:**
- Carta morta nunca pode estar no board nem na mao do heroi — a UI bloqueia o
  clique em vez de deixar entrar e explodir depois.
- A cascata da equity (F3 RF-03.2) ganha uma etapa: massa perdida por cartas
  mortas, separada da massa perdida pelo board.
- Persistem junto do spot.

**Aceite:**
- [ ] Marcar uma carta morta reduz a contagem de combos vivos do range no
      tamanho exato esperado.
- [ ] Carta ja no board nao pode ser marcada como morta.

#### RF-05.7: Cenario em arquivo (exportar / importar a mao)
Um `.json` com versao de formato contendo os ranges dos dois lados (em notacao,
nao em lista de combos), board e cartas mortas. Abre em outra maquina.

**Regras:**
- Campo de versao no arquivo; arquivo de outra origem e recusado com mensagem
  clara, nao com stack trace.
- Importar **valida cada item** antes de aplicar — e o mesmo bug da F0 RF-00.4
  (`loadSavedSpots` sem validacao derrubando a tela).
- Complementa, nao substitui, a persistencia server-side da F4 RF-04.2.

**Aceite:**
- [ ] Exportar e importar devolve o spot identico (ranges, pesos, board, mortas).
- [ ] Arquivo corrompido ou de outro app mostra mensagem e nao quebra a pagina.

---

## Cenarios de teste derivados

**Caminho feliz**
- [ ] River montado, dois ranges: curva dupla, matriz, chips e fluxo batem entre si.
- [ ] Turn montado: hotness lista 44 cartas e o resumo conta certo.

**Validacao de entrada**
- [ ] Notacao invalida no Range Finder: erro nomeado, sem calculo.
- [ ] Board com 1 ou 2 cartas: fluxo e estatisticas explicam o que falta.
- [ ] Carta repetida entre board, mao e cartas mortas: recusada na origem.

**Regras de negocio**
- [ ] `alpha` na curva bate com `callThresholdIndex`.
- [ ] Media das celulas da matriz bate com a equity agregada.
- [ ] Ponto de river do fluxo bate com o veredito principal.

**Casos de borda**
- [ ] Range vazio de um dos lados: mensagem, nunca `0%`.
- [ ] Todos os combos de uma classe mortos pelo board: celula neutra.
- [ ] Trocar o board no meio do calculo cancela a corrida antiga e nao pinta
      resultado velho.
- [ ] Monte Carlo: numero sempre com intervalo de confianca (decisao D5).

---

## Fora de escopo
- Multiway (3+ ranges) e a pizza "Groups" — segue fora ate a F3 fechar.
- Tres idiomas: a UI e PT-BR.
- Licenciamento, tema claro/escuro proprio, janela desktop.
- ICM e persistencia server-side: continuam na F4.

## Dependencias
F1 fechada (motor rapido, worker, heroi como range). O RF-05.4 e o RF-05.1
consomem `perHeroCombo`; sem ele nao ha o que desenhar.

## Decisoes ja tomadas (founder, 2026-08-16)
- Quebra em **F5a** (graficos) e **F5b** (ferramentas) — decisao D6 do indice.
- **RF-03.5** (runout por decisao) e **RF-03.6** (distribuicao) sairam da F3 e
  viraram RF-05.3 e RF-05.1. Um painel, dois modos de pintura; uma curva, duas
  linhas.
- As 20 emendas foram aplicadas dentro da F0, F1, F2, F3 e F4, marcadas no texto
  como `emenda AN`. Esta tabela vira historico — a fonte de verdade de cada
  emenda passa a ser o documento da frente que a recebeu.
- Multiway continua fora (decisao D7): sem pizza "Groups", sem faixa de 2 a 6
  ranges.

---

## HANDOFF

### Confira voce mesmo — F5a (8 min, no `:3000` reiniciado)
Monte um **turn** de verdade: 4 cartas no bordo, dois ranges com value e blefe.

1. **A curva tem duas linhas.** Uma cheia (range ativo) e uma cinza atras
   (adversario). Trocar qual e o ativo espelha as duas na hora, sem recalcular.
2. **A linha de alpha corta a curva.** O numero de maos acima dela tem que bater
   com o "quantas das minhas maos pagam". Se divergir, e bug — e o mesmo dado.
3. **O fluxo tem dois pontos.** Com 4 cartas: flop e turn. Ponha a quinta carta:
   tem que aparecer o terceiro ponto, e ele tem que bater com a equity do painel
   principal.
4. **Hotness conta certo.** A grade acende 44 cartas. Nenhuma carta do bordo nem
   da sua mao pode estar viva la. O resumo diz quantas sobem e quantas descem, e
   a soma das duas tem que dar 44.
5. **Equity ou decisao.** Alterne a pintura. Nao pode recalcular nada — e a mesma
   corrida vista de dois jeitos.
6. **Matriz e chips.** Clique numa celula do heatmap: aparecem os combos daquela
   classe com a equity de cada um. Clicar nao pode disparar calculo.
7. **Aproximado se declara.** Se o modo for Monte Carlo, todo numero vem com
   margem de erro. Numero sozinho e bug (decisao D5).

### Confira voce mesmo — F5b (5 min)
1. **Range Finder acha.** Range de referencia `22+, A2s+, KTs+, AJo+`, corte em
   50%: devolve as maos que batem, com contagem e `% de 1326`.
2. **O slider nao recalcula.** Depois de calcular, arraste o corte de equity: a
   lista muda **na hora**, sem barra de progresso.
3. **Aplicar funciona.** "Aplicar ao range ativo" substitui o range e a contagem
   confere com o que a lista dizia.
4. **Carta morta come combo.** Marque uma carta morta: os combos vivos do range
   tem que cair no tamanho exato esperado. Tente marcar uma carta que ja esta no
   bordo: tem que ser recusada no clique.
5. **A mao viaja.** Exporte o cenario, aperte Reset, importe de volta: ranges,
   pesos, bordo e cartas mortas voltam iguais. Importe um arquivo qualquer de
   outro app: mensagem clara, tela em pe.

### Prompt da proxima sessao

Frente: **F5a — Graficos**. Modelo: **Opus 5 — Extra**.
```
Frente F5a do Range Lab. Leia Docs/specs/range-lab/00-INDICE.md e
Docs/specs/range-lab/F5-mindriver.md antes de qualquer coisa.

F1 esta concluida e verificada. Esta frente e so leitura visual — nao muda
motor nem modelo. Comece pelo passe de detalhamento dos quatro RFs (05.1 a
05.4), com foco em: normalizacao do eixo X quando os dois ranges tem tamanhos
diferentes, e como o seletor equity/decisao do hotness reaproveita uma corrida
so. Me mostre o detalhamento antes do TDD.
```

Frente: **F5b — Ferramentas**. Modelo: **Sonnet 5 — Alto**.
```
Frente F5b do Range Lab. Leia Docs/specs/range-lab/00-INDICE.md e
Docs/specs/range-lab/F5-mindriver.md antes de qualquer coisa.

F1 esta concluida e verificada. Tres RFs (05.5 a 05.7), sem matematica nova.
Atencao ao RF-05.7: importar cenario valida item a item — e o mesmo bug que a
F0 RF-00.4 consertou nos spots salvos. Siga o pipeline TDD.
```
