# T2 — Calculadora MTT: EV da grade com o ROI do proprio jogador

**Modelo e esforco:** Opus 5, `xhigh` (zona critica: fonte do historico §6.1,
FX/dinheiro, query de analytics; o numero desta tela decide grade e stake).
**Origem:** sessao 2026-08-19. Prototipo funcional commitado em `f021a91f`.
**Pre-requisito ja fechado:** T1 / ADR-251 (rebuy nao e Add-on), commit
`6f9db285` + migration 0101.
**ADR desta feature:** a criar (ADR-252). **Migration:** nenhuma prevista.
**Revisao da spec:** 2026-08-19 — criterios de aceite verificaveis, contrato de
unidades (secao 9), contrato de resposta (secao 10) e registro dos buracos
fechados (secao 11).

---

## 1. Para que serve

O jogador monta a grade da semana em `/grade-planner` (perfis A/B/C). Ele quer
responder uma pergunta antes de jogar: **"o que essa grade vale?"** — qual o EV
esperado e qual a variancia de rodar exatamente esse conjunto de torneios.

Hoje a aba Variancia agrega a grade em ~6 buckets grosseiros (faixa de stake x
tipo) e usa um ROI historico igualmente grosseiro. O jogador nao reconhece a
propria grade ali dentro, nao consegue ajustar torneio a torneio, e nao sabe de
onde veio cada ROI.

A entrega e um botao **"Importar Grade e ROI"** que traz a grade do perfil
selecionado, uma linha por torneio recorrente, rotulada no vocabulario da
Biblioteca de Torneios, com o ROI que o jogador tem naquele tipo de torneio —
e tudo editavel antes de simular.

---

## 2. Estado atual (o prototipo)

Roda e entrega o valor central. **E referencia, nao entrega final** — foi
escrito sem spec, sem ADR e sem TDD, e os seis bugs da secao 6 sairam dele.

| Arquivo | Papel |
|---|---|
| `server/services/gradeRoiMatcher.ts` | helpers puros: casamento, agrupamento, clamp, rake, filtro de dias |
| `shared/poker-sites.ts` | aliases de rede + tabela de rake de MTT por site |
| `server/routes/variance.ts` | `GET /api/variance/grade-roi` + correcoes no `/buckets-aggregate` |
| `client/src/components/primedope/AggregationWizard.tsx` | botao, tabela, rotulos de procedencia, EV |
| `tests/unit/grade-roi/gradeRoiMatcher.test.ts` | 33 testes dos helpers |

O implementer da T2 **pode reaproveitar o que servir**, mas os testes mandam.

---

## 3. Requisitos funcionais

Cada RF traz **criterio de aceite verificavel**: entrada, saida esperada e o que
caracteriza falha. Onde o criterio cita unidade, a fonte de verdade e a secao 9;
onde cita campo de resposta, a secao 10.

Fixtures canonicas usadas nos criterios (baseline do dado real, secao 8):
**perfil A** = 222 torneios em dias ativos -> 48 linhas; **perfil B** = 193
torneios e zero dias ativos -> 0 linhas.

---

### RF-01 — Importar a grade do perfil

Botao na aba Variancia puxa os torneios planejados do perfil selecionado. So
entram dias em que aquele perfil esta ativo (`profile_states`); dia `OFF`, dia
sem estado e dia de outro perfil ficam de fora. A tela diz quais dias entraram e
quantos torneios ficaram de fora.

**Criterio de aceite**

- [ ] Torneio cujo `dayOfWeek` nao esta em `activeDaysForProfile(states, letra)`
      nao aparece em `rows` e nao entra em `meta.plannedCount`; ele conta em
      `meta.skippedInactive`.
- [ ] **Identidade fechada:** `meta.plannedCount + meta.skippedInactive +
      meta.skippedInvalid` e igual ao total de linhas devolvidas por
      `listPlannedTournamentsByProfile`. Nenhum torneio pode sumir sem contador.
- [ ] Perfil sem nenhum dia ativo (fixture perfil B): `rows: []`,
      `meta.emptyReason: 'no_active_day'`, `meta.skippedInactive: 193`.
- [ ] Perfil com grade vazia: `rows: []`, `meta.emptyReason: 'no_planned'`,
      `meta.skippedInactive: 0`.
- [ ] Usuario sem nenhum registro em `profile_states`: nao filtra;
      `meta.activeDaysApplied: false` e a tela exibe aviso nomeado
      ("nenhum dia configurado — trouxemos todos os torneios do perfil X").
- [ ] `meta.activeDays` e a lista ordenada e sem repeticao dos dias que entraram.
- [ ] Parametros: `profileLetter` fora de `A|B|C` -> 400; `weeks` fora de
      `{1,4,12,52}` -> 400; `period` fora da allowlist -> 400 (RF-13).
- [ ] Sem sessao -> 401. Usuario A nunca ve grade do usuario B (ownership no
      `where` da query, nao em `if`).

**Falha:** qualquer linha de dia inativo em `rows`; qualquer torneio que nao
apareca em nenhum dos tres contadores; `rows: []` sem `emptyReason`.

---

### RF-02 — Uma linha por torneio recorrente

O mesmo torneio em varios dias da semana e UMA linha, com a frequencia
(`5x/semana · seg, ter, qua, qui, sex`). A identidade do torneio nao pode
depender do horario exato (ver 6.4).

**Criterio de aceite**

- [ ] N ocorrencias com a mesma identidade produzem 1 row com
      `occurrencesPerWeek: N` e `days` = dias distintos, ordenados crescente.
- [ ] A identidade nao le `time`: mudar so o horario de uma ocorrencia nao muda
      o numero de linhas (6.4).
- [ ] **Conservacao:** `soma(rows[].occurrencesPerWeek) === meta.plannedCount`.
- [ ] `count === occurrencesPerWeek * weeks` para toda linha.
- [ ] O representante da linha carrega horario, tipo e velocidade **modais** (os
      mais frequentes), nao os da primeira ocorrencia.
- [ ] `varyingTime: true` quando as ocorrencias caem em mais de uma janela de 2h.
- [ ] Baseline: fixture perfil A -> `meta.lineCount: 48` e
      `soma(occurrencesPerWeek): 222`. Divergencia de `lineCount` na mesma
      fixture exige justificativa escrita no PR (a contagem e sinal de que a
      chave de identidade mudou — D-3).

**Falha:** soma de ocorrencias diferente de `plannedCount` (torneio duplicado ou
perdido no agrupamento); linha com `days: []` e `occurrencesPerWeek > 0`.

---

### RF-03 — Rotulo no vocabulario da Biblioteca

Formato `Nome · Tipo $faixa Velocidade · Site · ~HHh-HHh`, usando as mesmas
dimensoes que a Biblioteca usa para formar familia. O jogador precisa reconhecer
a linha.

**Criterio de aceite**

- [ ] Formato exato: `[Nome · ]Tipo $faixa[ Velocidade][ · Site][ · ~HHh-HHh]`.
      Velocidade `Normal` e omitida; site vazio omite o segmento de site;
      `timeBin === 'sem-horario'` omite o segmento de horario.
- [ ] Faixa de ABI e janela de horario saem dos **mesmos helpers** da Biblioteca
      (`bucketBuyIn(canonicalBuyIn(...))` e `timeBin2h`). O teste compara com a
      saida do helper, nunca com string hardcoded — assim uma mudanca de faixa na
      Biblioteca quebra o teste em vez de divergir em silencio.
- [ ] **Unicidade:** dentro de uma mesma resposta,
      `new Set(rows.map(r => r.name)).size === rows.length`. Duas linhas
      distintas nunca exibem o mesmo texto.
- [ ] Nome proprio aparece na frente quando existe; quando as ocorrencias tem
      nomes diferentes, o rotulo usa o nome modal e a linha marca
      `nameVaries: true` (secao 11, buraco B-09).

**Falha:** rotulo duplicado; rotulo com `Normal` explicito; rotulo com faixa de
ABI diferente da que a Biblioteca exibiria para o mesmo buy-in.

---

### RF-04 — ROI do proprio jogador

Cada linha recebe o ROI historico do jogador naquele tipo de torneio, calculado
pela Biblioteca (nao por uma conta paralela). Valor usado na simulacao fica
limitado a **[-20%, +40%]** para nao carregar outlier de amostra pequena.

**Criterio de aceite**

- [ ] Com casamento (`matchLevel !== 'none'` e `libVolume > 0`):
      `roi === clamp(libRoiPct, -20, 40) / 100`, arredondado a 4 casas.
- [ ] `roi` nunca fora de `[-0.20, 0.40]`; `libRoiPct` e o valor **cru**, sem
      clamp, e pode estar fora da faixa.
- [ ] `clamped: true` quando e somente quando o clamp alterou o valor.
- [ ] **Fonte unica:** o ROI vem de `storage.getTournamentLibrary` — a mesma
      funcao que alimenta a tela Biblioteca. O handler nao monta SQL proprio
      sobre `tournaments`. Teste: mockar essa unica chamada zera o ROI de todas
      as linhas; se alguma linha ainda trouxer ROI, ha conta paralela.
- [ ] Consequencia de graca da fonte unica: `grind_session_id IS NULL` ja esta
      aplicado (§6.1). Se algum dia a fonte mudar, o filtro volta a ser
      responsabilidade desta feature.
- [ ] ROI nao finito vindo da Biblioteca (`NaN`, `null`, string vazia) e tratado
      como ausencia de amostra (RF-06), nunca como zero.

**Falha:** `roi` fora da faixa; `roi` diferente do clamp de `libRoiPct`;
qualquer query a `tournaments` fora de `getTournamentLibrary`.

---

### RF-05 — Procedencia visivel

Ao lado do ROI, em cinza: o valor cru da Biblioteca, o tamanho da amostra e **de
qual conjunto ela veio**. Quando a amostra nao for do site daquela linha, a tela
precisa dizer isso — o rotulo nunca pode sugerir que um numero agregado pertence
a um site que nao tem amostra (ver 6.2).

**Criterio de aceite**

- [ ] Toda linha com amostra traz `libVolume`, `matchLevel`, `matchScopeLabel` e
      `siteSampleMissing`.
- [ ] **Equivalencia:** `siteSampleMissing === true` se e somente se
      `matchLevel ∈ {abi_type, type}` (os niveis que nao filtram por site).
- [ ] `libVolume` e a soma dos volumes das familias **efetivamente agregadas** no
      nivel reportado em `matchLevel` — nunca o volume de outro nivel.
- [ ] Quando `siteSampleMissing`, o texto exibido nomeia o conjunto real e o site
      da linha nao aparece como dono do volume. Teste de tela: a string
      `"<site> · <volume> torneios"` nao pode existir no DOM daquela linha (6.2).
- [ ] `matchScopeLabel` e `null` quando e so quando `matchLevel === 'none'`.
- [ ] `lowSample: true` quando `0 < libVolume < 20`; a tela marca a linha.

**Falha:** volume de um agregado cross-site exibido colado ao nome do site;
`siteSampleMissing: false` em nivel sem filtro de site.

---

### RF-06 — Sem amostra nenhuma

ROI de partida 15%, marcado como estimativa, nunca disfarcado de dado historico.

**Criterio de aceite**

- [ ] `matchLevel: 'none'` produz `roi: 0.15`, `source: 'default'`,
      `sourceReason: 'no_sample'`, `libRoiPct: null`, `libVolume: 0`,
      `matchScopeLabel: null`, `lowSample: false`.
- [ ] Nenhuma linha tem `source: 'library'` com `libVolume: 0` (invariante).
- [ ] A tela marca a linha como **estimativa**, com texto distinto do usado para
      amostra real; o valor 15% nunca aparece com o mesmo tratamento visual de um
      ROI vindo do historico.
- [ ] Baseline: fixture perfil A -> 5 linhas sem amostra do proprio site (Bodog).
      Dessas, quantas caem em `none` e quantas caem em fallback cross-site fica
      registrado no probe (secao 8) — os dois casos existem e sao diferentes.

**Falha:** 15% exibido como se fosse historico; `libRoiPct: 0` no lugar de `null`.

---

### RF-07 — Rake por site

A linha nasce com o rake do site. `tournaments.rake_pct` e 100% NULL, entao a
fonte e a tabela por site (default 9%). Atencao a semantica do engine (ver 6.5).

**Criterio de aceite**

- [ ] **Identidade do rake (a prova de 6.5):** para toda linha,
      `round(buyIn * (1 + rakePct), 2) === totalBuyIn` com tolerancia de $0.01.
- [ ] `rakePct` e markup decimal; `siteFeePct` e a fatia em percent. Os dois
      descrevem o mesmo rake em unidades diferentes (secao 9).
- [ ] `rakeSource: 'site'` quando o site esta na tabela; `'default'` quando cai
      no `DEFAULT_MTT_RAKE_PCT` (9%). A tela mostra qual dos dois.
- [ ] Site desconhecido ou vazio -> `rakeSource: 'default'`, `siteFeePct: 9.0`.
- [ ] `rakePct` sempre em `[0, 0.5]` (limite do schema da simulacao, RF-10).

**Falha:** `buyIn * (1 + rakePct)` diferente de `totalBuyIn`; rake 0% em linha de
site conhecido.

---

### RF-08 — Tudo editavel

Nome, buy-in, rake, field, ITM, ROI e quantidade continuam editaveis linha a
linha, com adicionar e remover. Edicao vale so na sessao, nao altera historico
nem grade.

**Criterio de aceite**

- [ ] Editar qualquer campo nao dispara request. Nenhum `POST/PUT/PATCH` sai da
      tela durante a edicao (teste: contador de chamadas do `apiRequest`
      inalterado apos N edicoes).
- [ ] Apos editar, o payload da simulacao leva o valor editado, nao o importado.
- [ ] Remover linha reduz a contagem e recalcula o resumo (RF-09) no mesmo
      render; adicionar cria linha com `source: 'default'` e rake default.
- [ ] Trocar `weeks` recalcula `count` **sem descartar edicoes** e sem re-puxar o
      endpoint (secao 11, buraco B-06). Trocar `profileLetter` re-puxa e avisa que
      as edicoes foram descartadas.
- [ ] Correcao de valor digitado que **mude a semantica** (clamp de ROI, de ITM ou
      de rake) e visivel na linha antes de simular. Arredondar `field` para
      inteiro e permitido em silencio; alterar o numero que o jogador escreveu,
      nao.

**Falha:** edicao perdida ao trocar periodo; clamp silencioso que muda o numero
digitado sem o jogador ver.

---

### RF-09 — EV da grade

Resumo com total de torneios, investimento e EV esperado.

**Base do calculo (corrigida nesta revisao — buraco B-01):** o ROI da Biblioteca
tem como denominador o **investimento total** (o que o jogador paga, taxa
inclusa; secao 5, fato 11). Logo o investimento e o EV do resumo usam
`totalBuyIn`, nao `buyIn` (que e so a parte do prize pool que o engine consome).

**Criterio de aceite**

- [ ] `investimentoTotal === soma(totalBuyIn * count)` sobre as linhas usaveis.
- [ ] `evTotal === soma(totalBuyIn * count * roi)` sobre as linhas usaveis.
- [ ] **Teste numerico fechado:** uma linha com `totalBuyIn: 55`, `buyIn: 50`,
      `count: 100`, `roi: 0.10` produz investimento `5500` e EV `550`.
      Implementacao que use `buyIn` devolve `5000`/`500` e o teste falha.
- [ ] `totalCount === soma(count)` das linhas usaveis.
- [ ] Linha marcada `unusable: true` (RF-14) fica fora dos tres somatorios e a
      tela diz quantas ficaram de fora.
- [ ] EV negativo e exibido com sinal e tratamento visual proprio; EV zero nao e
      pintado como positivo.

**Falha:** resumo calculado sobre a parte do prize pool (subestima investimento e
EV em cerca de 9%); linha inutilizavel entrando no somatorio.

---

### RF-10 — Simular

O payload precisa caber no contrato do `POST /api/variance/simulate` (ver 6.6).
Se nao couber, a tela avisa antes de enviar, com o motivo.

**Criterio de aceite**

- [ ] O botao fica bloqueado quando `linhas > MAX_GROUPS` **ou**
      `soma(count) > MAX_TOTAL_ENTRIES`. A mensagem diz **qual** limite estourou e
      o numero atual ("57 linhas — o limite e 80" / "212.000 torneios — o limite
      e 200.000").
- [ ] Os limites da tela sao lidos de uma constante compartilhada com o backend,
      ou ha teste que falha quando os dois divergem. Numero magico duplicado nao
      passa.
- [ ] Grade de referencia (48 linhas / ~2664 torneios em 12 semanas) e aceita
      pelo mesmo schema Zod do backend — o teste roda o payload real contra o
      schema importado, nao contra uma copia.
- [ ] Todo campo respeita o schema: `field` inteiro em `[2, 100000]`, `count`
      inteiro positivo <= 50000, `buyIn > 0`, `placesPaidPct ∈ [0.05, 0.5]`,
      `rakePct ∈ [0, 0.5]`, `name` nao vazio.
- [ ] 400 vindo do backend nunca aparece como "Payload invalido" sem detalhe: a
      tela mostra qual linha e qual campo foram recusados.

**Falha:** simulacao rejeitada por limite que a tela nao anunciou; mensagem de
erro que nao identifica a causa.

---

### RF-11 — Field e ITM de partida (NOVO)

O engine exige `field` e `placesPaidPct`. Os dois vem da mesma amostra que deu o
ROI; sem amostra, sao defaults declarados. Nao estavam em RF nenhum e o
prototipo os preenchia em silencio.

**Criterio de aceite**

- [ ] Com amostra: `field = round(avgFieldSize)` e
      `placesPaidPct = clamp(itmRate / 100, 0.05, 0.5)`.
- [ ] Sem amostra ou com amostra sem esses campos: `field = DEFAULT_PLAYERS_AVG`,
      `placesPaidPct = 0.15`, com `fieldSource: 'default'` e `itmSource:
      'default'`.
- [ ] `fieldSource`/`itmSource` sao independentes de `source` (uma familia pode
      ter ROI e nao ter `avgFieldSize`, porque a Biblioteca exclui `fieldSize`
      nulo/zero do calculo).
- [ ] A tela distingue valor vindo da amostra de valor default — mesma disciplina
      do RF-06.
- [ ] Os dois campos continuam editaveis (RF-08).

**Falha:** default exibido como se viesse do historico; `field: 0` ou `field: 1`
chegando na simulacao.

---

### RF-12 — Degradacao nomeada quando a Biblioteca falha (NOVO)

Hoje a excecao de `getTournamentLibrary` cai em `families = []` e todas as linhas
viram "sem amostra". O jogador nao distingue "nao tenho historico" de "a
Biblioteca quebrou" — os dois mostram 15%.

**Criterio de aceite**

- [ ] `getTournamentLibrary` lancando: a resposta continua 200, com
      `meta.libraryUnavailable: true` e todas as linhas em
      `sourceReason: 'library_unavailable'` (distinto de `'no_sample'`).
- [ ] O erro e logado com contexto **antes** do fallback (lesson #9).
- [ ] A tela exibe aviso nomeado; o valor 15% aparece rotulado como
      "Biblioteca indisponivel", nao como "sem amostra".
- [ ] Sem falha, `meta.libraryUnavailable: false` e nenhuma linha usa esse
      `sourceReason`.

**Falha:** 500 na importacao inteira por causa da Biblioteca; degradacao muda.

---

### RF-13 — Parametros e janela do historico (NOVO)

`weeks` multiplica a contagem; **nao** filtra historico. Quem escolhe a janela do
historico e `period`, que hoje entra sem validacao e, quando invalido, vira
"30 dias" silenciosamente dentro do storage.

**Criterio de aceite**

- [ ] `period` restrito a `all | 7d | 30d | 90d | 365d | month | year`.
      Ausente = `all`. Fora da lista -> 400 com mensagem que lista os valores.
- [ ] `meta.period` ecoa o valor efetivamente usado.
- [ ] Nesta entrega a tela envia sempre `all`; o seletor de janela e trabalho
      seguinte (secao 7).
- [ ] `weeks` nao altera `rows` alem de `count` — mesma grade em 1 e em 52
      semanas produz o mesmo conjunto de linhas.

**Falha:** `period` invalido virando 30 dias sem erro; `weeks` mudando o numero
de linhas.

---

### RF-14 — Linha inutilizavel nao vira numero inventado (NOVO)

O prototipo converte buy-in ausente, zero ou negativo em `$0.01` para caber no
schema. Isso e fallback silencioso em dinheiro — proibido pela regra 03. Freeroll
existe na grade e a Biblioteca o exclui (secao 5, fato 9), entao ele nunca tera
amostra.

**Criterio de aceite**

- [ ] `buyIn` ausente, nao finito ou `<= 0` produz linha com `unusable: true`,
      `unusableReason: 'buy_in_invalid'`, `buyIn: null`, `totalBuyIn: null`.
- [ ] Linha `unusable` aparece na tabela (o jogador precisa ver que ela existe),
      fica fora do resumo (RF-09) e fora do payload da simulacao (RF-10).
- [ ] `meta.unusableCount` conta essas linhas; a tela diz quantas ficaram de fora
      e por que.
- [ ] Editar o buy-in de uma linha `unusable` para valor valido a torna usavel no
      mesmo render.
- [ ] Em nenhum caminho aparece `$0.01` como buy-in de partida.

**Falha:** buy-in fabricado; linha invalida somando no EV; linha invalida sumindo
da tela sem contador.

---

### 3.1 Requisitos nao-funcionais

- **Latencia.** `GET /api/variance/grade-roi` recarrega o historico inteiro e
  reagrupa em memoria a cada clique. Com a base do founder (~16k torneios) o p95
  deve ficar abaixo de 1,5s. Se passar, a resposta reusa o **cache que ja existe
  no modulo** (`app.locals._varianceCache`, chave por usuario + perfil + period,
  invalidada pelo mesmo contador de geracao do upload). Sem infra nova.
- **Seguranca.** `requireAuth`; ownership no `where`. Sem tier gate — paridade
  com os demais endpoints de variancia (registrado, nao ampliado).
- **Erro.** `console.error` com contexto + `res.status(N).json({ message })`.
  Stack nunca vai para o cliente.

---

## 4. Decisoes que o ADR precisa fechar

Estas nao estao resolvidas — o prototipo chutou uma resposta para cada. Esta
revisao **nao responde nenhuma**; so enriquece o enunciado com o que a leitura do
codigo trouxe.

**D-1. Fonte do ROI.** A Biblioteca aplica um piso de EXIBICAO
(`FAMILY_GROUP_FLOOR = 10`) que esconde familias pequenas. O prototipo pediu
`includeBelowFloor: true`. Decidir: a calculadora consome a Biblioteca inteira
(inclusive amostra minuscula, sinalizando confianca), ou respeita o piso e cai
para um nivel mais amplo? Amostra de 5 torneios produz ROI sem significado.

_Contexto adicional para a decisao:_ ha **tres limiares** vivos na mesma tela —
`FAMILY_GROUP_FLOOR = 10` (piso de exibicao da Biblioteca), `MIN_GROUP_VISIBLE`
(marca `lowConfidence` na Biblioteca) e `LOW_SAMPLE_VOLUME = 20` (marca
`lowSample` nesta calculadora). O ADR precisa dizer qual governa **uso**, qual
governa **exibicao**, e se a confianca entra como texto ou como metodo (liga com
D-4). Alem disso, `getTournamentLibrary` tem um relaxamento adaptativo: quando
**nenhuma** familia atinge o piso, ele devolve todas. Com `includeBelowFloor:
true` esse ramo nao roda; sem ele, o conjunto que alimenta uma linha passa a
depender do tamanho da biblioteca inteira do jogador — o ROI de um torneio vira
funcao do historico global, o que e dificil de explicar na tela.

**D-2. Cascata de casamento.** Quando nao ha familia exata, o que vem depois? O
prototipo desce: `site+faixa+tipo+horario` -> `site+faixa+tipo` ->
`site+faixa+horario` -> `site+faixa` (qualquer tipo) -> `faixa+tipo` (qualquer
site) -> `tipo` -> nada. Decidir a ordem, e principalmente **onde parar**:
agregado largo demais vira ruido com cara de dado.

_Contexto adicional para a decisao:_

1. **O nivel com horario compara relogios diferentes.** A janela da Biblioteca
   sai de `datePlayed` em **UTC** (`getUTCHours`, de proposito); a grade guarda
   `time` como texto local `"HH:MM"`. Se houver deslocamento sistematico (BRT =
   UTC-3), o nivel mais especifico casa pouco, ou casa com a janela errada — e o
   erro e invisivel, porque o fallback devolve um numero plausivel. O ADR precisa
   decidir se compara horario e sob qual conversao; o probe da secao 8 tem de
   imprimir a distribuicao por nivel para sustentar a decisao.
2. **A ponderacao por volume so e boa aproximacao dentro da mesma faixa.** O
   agregado pondera ROI por `volume` (contagem de torneios). No nivel `type`
   (todas as faixas de buy-in) isso mistura $5 com $500 — o ROI resultante nao
   descreve nenhum torneio real.
3. **Hoje basta `volume > 0` para um nivel ser aceito.** Definir se existe volume
   minimo por nivel, e se ele varia por nivel (mais exigente quanto mais largo).

**D-3. Chave de identidade da linha.** O prototipo usa
`site + assinatura do nome + faixa de buy-in`. Decidir o que fazer quando o
mesmo nome aparece com buy-ins de faixas diferentes, e quando o nome esta vazio.

_Contexto adicional para a decisao:_ `nameSignature` remove tokens
(`turbo|hyper|pko|bounty|mystery|rebuy|addon|deep|stack`, `NNbb`, `6-max`,
pontuacao) e ordena o resto — dois torneios genuinamente diferentes podem colidir
na mesma assinatura, e o mesmo torneio a $49 e a $52 cai em faixas vizinhas
(`$30-49` e `$50-70`) e vira duas linhas. Existe uma terceira via nao explorada:
`planned_tournaments.libraryTemplateId` (FK opcional para `tournament_library`),
que da identidade exata quando o torneio veio do Selector. O ADR pode decidir uma
cascata de identidade (template -> assinatura -> dimensoes) em vez de uma chave
unica.

**D-4. Clamp [-20%, +40%].** Corte duro nos limites, ou encolhimento em direcao
a media conforme a amostra (shrinkage)? Corte duro trata amostra de 5 e de 500
igual. O founder pediu explicitamente a faixa; a decisao aqui e sobre o metodo,
nao sobre os limites.

_Contexto adicional para a decisao:_ com `includeBelowFloor` (D-1) entram
familias de volume 1 a 9 — o metodo escolhido tem de dizer explicitamente o que
faz nessa faixa. E, se virar shrinkage, definir o que a tela mostra: o cru, o
encolhido, ou os dois (hoje o contrato expoe `libRoiPct` cru + `roi` usado +
`clamped`; shrinkage exige um terceiro conceito ou renomear o segundo).

**D-5. Semantica do rake.** Confirmar por escrito a conversao entre "fatia do
buy-in total" (como o site publica) e "acrescimo sobre o buy-in" (como o engine
consome), e onde ela mora.

_Contexto adicional para a decisao:_ a identidade a ratificar e
`buyIn_prizepool x (1 + markup) = totalBuyIn`, com
`markup = feeShare / (1 - feeShare)`. Hoje o cap de 40% aparece **duas vezes**
(`rakeMarkupFromFeeShare` e `prizePoolPartOfBuyIn`) e a tabela por site vive em
`shared/poker-sites.ts` como constante de codigo. Decidir: onde a conversao mora
(helper unico em `shared/` vs `server/services/`), se o cap e um so, e se a
tabela por site continua constante ou vira dado versionado (liga com D-7).

**D-6. Volume de simulacao.** Uma grade real gera ~48 grupos e ~2664 torneios
por trimestre. Definir os limites do endpoint e o que a tela faz ao encostar
neles.

_Contexto adicional para a decisao:_ os limites vigentes sao `MAX_GROUPS = 80`,
`MAX_TOTAL_ENTRIES = 200000` e `count <= 50000` por grupo, com custo medido de
~550ms para 44 grupos / 2664 torneios / 10k simulacoes. Falta decidir o **outro**
custo: o proprio `/grade-roi` recarrega e reagrupa o historico inteiro a cada
clique, e a tela o chama de novo a cada troca de perfil. Decidir se ele entra no
cache ja existente do modulo, com qual chave e qual invalidacao (o contador de
geracao por usuario ja e bustado pelo upload).

**D-7. Rake de fonte propria.** Vale fazer o parser gravar a fee do CSV para o
rake sair do dado do jogador em vez da tabela por site? (Regra de produto: dado
do proprio jogador antes de heuristica generica.) Se sim, e sprint separada.

_Contexto adicional para a decisao:_ a coluna `tournaments.rake_pct` **ja
existe** e esta 100% NULL — nao ha migration a fazer, so parser e back-fill. Cada
rede expoe a fee de um jeito no CSV (algumas separam buy-in e fee, outras trazem
so o total), entao a decisao e por rede, nao global. Definir tambem o que fazer
com as ~16k linhas legadas: back-fill impossivel sem re-import, entao a tabela
por site continua sendo o fallback por tempo indeterminado.

---

## 5. Fatos do dado que a implementacao DEVE respeitar

Descobertos na marra. Nao sao opiniao.

1. **`planned_tournaments` guarda A, B e C no mesmo dia.** A grade so exibe o
   perfil ativo daquele dia, resolvido por `profile_states.active_profile`
   (valores `A`/`B`/`C`/`OFF`/null). Ler `planned_tournaments` sem cruzar com
   `profile_states` mostra torneio que o jogador nao ve na tela.
2. **Site tem nome diferente por origem.** A grade escreve `GGPoker`; o parser
   grava `GGNetwork`. Comparar string crua falha em silencio. Aliases em
   `shared/poker-sites.ts`.
3. **`tournaments.rake_pct` e 100% NULL.** Nenhum parser preenche.
4. **`varianceEngine` trata `rakePct` como acrescimo sobre o buy-in**
   (`custo = buyIn x (1 + rakePct)`), nao como fatia do total. O buy-in que o
   jogador escreve na grade e o total pago.
5. **`getTournamentLibrary` ja filtra `grind_session_id IS NULL`** — a regra
   §6.1 vem de graca ao consumir a Biblioteca. Qualquer conta paralela sobre
   `tournaments` precisa repetir o filtro.
6. **A janela de horario da Biblioteca e de 2h ancorada em hora par**, derivada
   de `datePlayed` em UTC (`getUTCHours`, escolha deliberada para o bin ser
   estavel entre dev BRT e prod UTC). A grade guarda `time` como texto `"HH:MM"`
   local. **Os dois relogios nao sao o mesmo** — ver D-2.
7. **Tipo da grade e tipo do historico divergem.** A grade tem o que o jogador
   escreveu; o historico tem o que o import deduziu. O ADR-251 fechou a maior
   fonte dessa divergencia, mas ela nao morreu.
8. **`planned_tournaments.buy_in` e `decimal`** — chega do pg como **string**.
   Converter na fronteira, checando `Number.isFinite`. A tabela **nao tem coluna
   de moeda**: o buy-in da grade e assumido USD. A Biblioteca normaliza para USD
   (`normalizeTournamentsToUsd`) antes de agrupar; e essa assuncao que torna os
   dois lados comparaveis, e ela precisa continuar declarada.
9. **A Biblioteca exclui freeroll, buy-in 0 e PLO** (`isExcludedFromLibrary`).
   Torneio desses na grade nunca tera amostra, por construcao.
10. **`volume` da familia e contagem de TORNEIOS, nao de entradas.**
    `totalEntries` (torneios + reentradas) e outro campo. O numero exibido na
    tela diz "torneios", e e o mesmo numero que pondera a agregacao.
11. **O `roi` da Biblioteca e `lucro / investimento total x 100`**, com o
    investimento somando buy-ins **mais** reentradas, e `prize` ja sendo lucro
    liquido. O denominador e o **total pago**, taxa inclusa — e isso que fixa a
    base do EV em RF-09.
12. **A faixa de ABI mais baixa comeca em zero** (`$1-6`, `min: 0`). Buy-in 0 ou
    negativo nao explode: cai silenciosamente em `$1-6`. E por isso que RF-14
    existe — sem ele, o erro nao aparece em lugar nenhum.
13. **`weeks` so multiplica a contagem.** Quem recorta o historico e `period`
    (RF-13); os dois parametros nao se conversam.

---

## 6. Cenarios obrigatorios de teste

De 6.1 a 6.7, cada um e um bug que aconteceu de verdade nesta grade. De 6.8 a
6.15, cada um e um buraco fechado na revisao da spec (secao 11). Todos sao o piso
da red phase.

**6.1 — Torneio de dia inativo nao entra.** Perfil B do founder tem 193
torneios e **zero** dias com B ativo: a importacao de B devolve 0 linhas, com
mensagem explicando. Perfil A tem 222 torneios em dias 1-5 e devolve 222.
_(Sintoma original: apareceu um `$150 GGPoker` de domingo/perfil B numa
importacao de perfil A.)_

**6.2 — Volume nunca mente sobre o conjunto.** Linha de um site sem amostra
propria nao pode exibir o volume de um agregado cross-site como se fosse dele.
O escopo exibido tem que nomear o conjunto real.
_(Sintoma: "Bodog $20-29 · 2423 torneios" — os 2423 eram de todos os sites.)_

**6.3 — Amostra escondida pelo piso continua sendo amostra.** Site com familia
pequena na Biblioteca nao pode ser reportado como "sem amostra".
_(Sintoma: CoinPoker $20-29 dizia nao ter amostra tendo dezenas de torneios.)_

**6.4 — Horario na fronteira nao parte a linha.** Torneio as 13:30 na segunda e
14:30 de terca a sexta e UMA linha `5x/semana`, e o rotulo usa o horario
predominante.
_(Sintoma: "Mini Kickoff 1x/semana · seg" com o resto sumido noutra linha.)_

**6.5 — Rake nao superestima nem subestima.** Buy-in total x parte do prize
pool x markup: reconstruir o custo tem que devolver o buy-in total.
_(Sintoma: rake 0% em todas as linhas, EV inflado; depois, conversao errada.)_

**6.6 — A grade inteira cabe na simulacao.** ~48 grupos / ~2664 torneios nao
podem ser rejeitados pelo contrato.
_(Sintoma: "Payload invalido" — o schema limitava a 20 grupos.)_

**6.7 — Nome de site divergente casa.** `GGPoker` na grade encontra `GGNetwork`
no historico.

**6.8 — O EV usa o que o jogador paga.** Linha `totalBuyIn: 55`, `buyIn: 50`,
`count: 100`, `roi: 0.10` -> investimento `5500`, EV `550`. Calcular sobre a
parte do prize pool devolve `5000`/`500` e falha.
_(Buraco B-01: o resumo subestimava investimento e EV em ~9%.)_

**6.9 — Buy-in invalido nao vira $0,01.** Freeroll (buy-in 0) importado aparece
marcado como inutilizavel, fora do EV e fora do payload; em nenhum campo aparece
`0.01`.
_(Buraco B-02.)_

**6.10 — Biblioteca indisponivel e dito, nao fingido.** Com o storage lancando, a
resposta e 200 com `meta.libraryUnavailable: true` e
`sourceReason: 'library_unavailable'` em todas as linhas — nunca "sem amostra"
mudo, nunca 500.
_(Buraco B-03.)_

**6.11 — Nenhum torneio some entre os contadores.**
`plannedCount + skippedInactive + skippedInvalid` fecha com o total lido, e
`soma(occurrencesPerWeek) === plannedCount`.
_(Buraco B-04: torneio com `dayOfWeek` invalido caia fora sem contador.)_

**6.12 — Dois torneios distintos nunca exibem o mesmo rotulo.**
`new Set(rows.map(r => r.name)).size === rows.length` na fixture do perfil A.
_(Buraco B-09.)_

**6.13 — Trocar o periodo nao apaga as edicoes.** Editar o ROI de uma linha,
trocar de 12 para 52 semanas: o ROI editado permanece e so `count` muda.
_(Buraco B-06.)_

**6.14 — `period` invalido nao vira 30 dias em silencio.** `period=xpto` -> 400
listando os valores aceitos; `period` ausente -> `all`.
_(Buraco B-05.)_

**6.15 — Site vazio ou desconhecido nao casa por site.** Linha sem site nunca
retorna `matchLevel` de nivel com site (`site_*`), cai direto para `abi_type` ou
abaixo, e o rotulo omite o segmento de site.
_(Buraco B-07: `canonicalSiteKey('')` devolve string vazia, que casava com
familia de site vazio.)_

---

## 7. Fora de escopo

- Migration nova (nao ha).
- Salvar a grade simulada ou versionar cenarios.
- Mudar o motor de Monte Carlo, a curva de payout ou o tratamento de PKO.
- Consumir `allows_rebuy` em filtro/coluna (divida aberta do ADR-251).
- Fazer o parser gravar a fee do CSV (ver D-7).
- Seletor de janela do historico na tela: `period` fica fixo em `all` nesta
  entrega (RF-13).
- Modelar rebuy/reentrada no custo simulado. A Biblioteca conta reentrada no
  denominador do ROI; a simulacao conta 1 entrada por ocorrencia. A divergencia
  fica **declarada** aqui, nao corrigida — corrigi-la muda o motor.
- Transformar a tabela de rake por site em dado versionado (ver D-5).
- Reformar o modo antigo (`/buckets-aggregate`) alem do minimo descrito em B-08.

---

## 8. Gate de fechamento

Alem de `npm run check` limpo e das suites verdes:

**Prova no dado real.** Probe `tsx` contra o banco local (USER-0005) imprimindo:

1. contagem de torneios ativos por perfil (A, B, C) e quantos ficaram de fora por
   dia inativo;
2. numero de linhas apos agrupar, e a soma de `occurrencesPerWeek` (tem que
   fechar com o item 1);
3. **distribuicao dos niveis de casamento** — quantas linhas em cada
   `matchLevel`, incluindo `none`. Este numero e o que sustenta D-2: se
   `site_abi_type_time` casar quase nada, o horario nao esta comparavel;
4. quantas linhas ficaram sem amostra do proprio site, e quantas ficaram sem
   amostra nenhuma (sao coisas diferentes — RF-06);
5. investimento total e EV da grade, com a base do RF-09 (`totalBuyIn`),
   impressos lado a lado com o resultado da base antiga (`buyIn`) — a diferenca
   tem que ser da ordem do rake;
6. uma amostra de 5-10 linhas legiveis, com rotulo, ROI usado, ROI cru, volume e
   escopo.

O founder confere se reconhece a grade dele antes de a feature ser dada por
pronta.

Numeros de referencia do prototipo, ja com o ADR-251 aplicado — servem de
baseline, nao de meta: perfil A = 222 torneios -> 48 linhas; 40 delas casando
no nivel mais especifico; 5 sem amostra do proprio site (Bodog, que realmente
nao tem historico).

**Verificacao no `:3000` reiniciado**, com o botao clicado de verdade.

---

## 9. Contrato de unidades

Esta secao existe porque a confusao percent/decimal ja custou bug nesta tela.
**Regra de ouro: percent so existe para EXIBIR. Tudo que atravessa para o engine
e decimal. Nenhum campo muda de unidade sem mudar de nome.**

| Campo | Unidade | Exemplo | Quem converte |
|---|---|---|---|
| `libRoiPct` | **percent** | `12.4` | ja sai assim de `computeGroupMetrics` (`lucro/investimento x 100`); o endpoint so arredonda a 1 casa |
| `roi` | **decimal** | `0.124` | endpoint: `clampRealisticRoiPct(pct) / 100`, 4 casas |
| `itmRate` (Biblioteca) | **percent** | `15.2` | idem `computeGroupMetrics` |
| `placesPaidPct` | **decimal** | `0.152` | endpoint: `/100` + clamp `[0.05, 0.5]`. A UI digita percent e divide por 100 na hora de guardar |
| `siteFeePct` | **percent** (fatia do total) | `9.0` | `mttRakePctForSite`, 1 casa |
| `feeShare` (interno) | **decimal** (fatia do total) | `0.09` | `siteFeeShare = pct / 100` |
| `rakePct` | **decimal** (markup sobre o prize pool) | `0.0989` | `rakeMarkupFromFeeShare(feeShare) = feeShare / (1 - feeShare)`, 4 casas |
| `totalBuyIn` | **USD**, total pago | `55.00` | `Number(planned.buyIn)` — vem string do pg (fato 8), 2 casas |
| `buyIn` | **USD**, parte do prize pool | `50.05` | `prizePoolPartOfBuyIn(totalBuyIn, feeShare)`, 2 casas |
| `field` | inteiro (jogadores) | `640` | `round(avgFieldSize)` |
| `occurrencesPerWeek`, `count` | inteiro | `5`, `60` | `count = occurrencesPerWeek x weeks` |
| `libVolume` | inteiro (**torneios**, nao entradas) | `2423` | soma dos `volume` das familias agregadas |
| investimento, EV | **USD** | `5500`, `550` | `totalBuyIn x count [x roi]` (RF-09) |

Invariantes de unidade que viram teste:

- `round(buyIn x (1 + rakePct), 2) === totalBuyIn` (±$0.01) — RF-07.
- `roi === clamp(libRoiPct, -20, 40) / 100` quando ha amostra — RF-04.
- `siteFeePct / 100 === feeShare` e `rakePct === feeShare / (1 - feeShare)`.
- Nenhum campo com sufixo `Pct` carrega decimal; nenhum campo sem sufixo carrega
  percent. As duas excecoes historicas (`rakePct` e `placesPaidPct`, decimais por
  exigencia do engine) estao nomeadas aqui de proposito: **nao renomear sem
  mexer no engine**.

---

## 10. Contrato de resposta — `GET /api/variance/grade-roi`

Query: `profileLetter` (A|B|C, obrigatorio), `weeks` (1|4|12|52, obrigatorio),
`period` (allowlist do RF-13, opcional, default `all`).

### 10.1 `rows[]`

| Campo | Tipo | Nulo? | Significado |
|---|---|---|---|
| `representativePlannedId` | string | nao | id da ocorrencia modal. **Nao e chave de negocio** — a linha representa N ocorrencias (renomeado de `plannedId`, buraco B-10) |
| `plannedIds` | string[] | nao | ids de todas as ocorrencias agrupadas na linha |
| `name` | string | nao | rotulo exibido (RF-03) |
| `tournamentName` | string \| null | sim | nome modal; `null` quando nenhuma ocorrencia tem nome utilizavel |
| `nameVaries` | boolean | nao | as ocorrencias tem nomes crus diferentes (B-09) |
| `tier` | string | nao | faixa de ABI (`$20-29`) |
| `type` | string | nao | tipo canonico |
| `site` | string \| null | sim | site como escrito na grade (nao a chave canonica) |
| `speed` | string \| null | sim | `Normal`/`Turbo`/`Hyper` |
| `timeBin` | string | nao | `18-20` ou `sem-horario` |
| `time` | string \| null | sim | `HH:MM` modal |
| `days` | number[] | nao | dias 0-6, ordenados |
| `occurrencesPerWeek` | int | nao | ocorrencias por semana (canonico) |
| `countPerWeek` | int | nao | alias de `occurrencesPerWeek`, mantido para o modo antigo da tela |
| `count` | int | nao | `occurrencesPerWeek x weeks` |
| `varyingTime` | boolean | nao | as ocorrencias caem em mais de uma janela |
| `totalBuyIn` | number \| null | sim (RF-14) | USD total pago — base do EV |
| `buyIn` | number \| null | sim (RF-14) | USD parte do prize pool — entrada do engine |
| `siteFeePct` | number | nao | fatia do total, percent |
| `rakePct` | number | nao | markup decimal |
| `rakeSource` | `'site' \| 'default'` | nao | de onde veio o rake |
| `field` | int | nao | tamanho medio do field |
| `fieldSource` | `'library' \| 'default'` | nao | RF-11 |
| `placesPaidPct` | number | nao | ITM decimal |
| `itmSource` | `'library' \| 'default'` | nao | RF-11 |
| `roi` | number | nao | ROI decimal usado na simulacao (clampado) |
| `clamped` | boolean | nao | o clamp alterou o valor (RF-04) |
| `libRoiPct` | number \| null | sim | ROI cru da Biblioteca, percent |
| `libVolume` | int | nao | torneios da amostra; `0` quando nao ha |
| `matchLevel` | enum | nao | `site_abi_type_time \| site_abi_type \| site_abi_time \| site_abi \| abi_type \| type \| none` |
| `matchScopeLabel` | string \| null | sim | nome do conjunto que gerou o ROI; `null` sse `matchLevel === 'none'` |
| `siteSampleMissing` | boolean | nao | a amostra nao e do site da linha (RF-05) |
| `lowSample` | boolean | nao | `0 < libVolume < 20` |
| `source` | `'library' \| 'default'` | nao | o ROI veio da amostra ou do default |
| `sourceReason` | `'matched' \| 'no_sample' \| 'library_unavailable'` | nao | por que (RF-06/RF-12) |
| `unusable` | boolean | nao | fora do EV e da simulacao (RF-14) |
| `unusableReason` | `'buy_in_invalid'` \| null | sim | motivo |
| `isPKO` | boolean | nao | `true` para `PKO` e `Mystery` (B-08) |

### 10.2 `meta`

| Campo | Tipo | Significado |
|---|---|---|
| `profileLetter`, `weeks`, `period` | — | eco dos parametros efetivos |
| `lineCount` | int | `rows.length` |
| `plannedCount` | int | torneios ativos que entraram no agrupamento |
| `skippedInactive` | int | fora por dia OFF / de outro perfil |
| `skippedInvalid` | int | fora por `dayOfWeek` invalido ou ausente (B-04) |
| `unusableCount` | int | linhas `unusable` (RF-14) |
| `activeDays` | number[] | dias com o perfil ativo |
| `activeDaysApplied` | boolean | `false` quando o usuario nao tem `profile_states` |
| `libraryMatchedCount` | int | linhas com `source: 'library'` |
| `siteMatchedCount` | int | dessas, as com amostra do proprio site (renomeado de `matchedCount`, B-11) |
| `defaultCount` | int | linhas com `source: 'default'` |
| `emptyReason` | `'no_planned' \| 'no_active_day'` \| null | por que `rows` veio vazio (B-12) |
| `libraryUnavailable` | boolean | RF-12 |

### 10.3 Invariantes da resposta (viram teste direto)

- `meta.lineCount === rows.length`
- `soma(rows[].occurrencesPerWeek) === meta.plannedCount`
- `meta.plannedCount + meta.skippedInactive + meta.skippedInvalid === total lido`
- `meta.libraryMatchedCount + meta.defaultCount === meta.lineCount`
- `meta.siteMatchedCount <= meta.libraryMatchedCount`
- `rows` vazio implica `meta.emptyReason !== null`
- `matchLevel === 'none'` implica `source === 'default'` e `libVolume === 0`

### 10.4 Erros

| Situacao | Status | Corpo |
|---|---|---|
| sem sessao | 401 | `{ message }` |
| `profileLetter`/`weeks`/`period` invalidos | 400 | `{ message }` dizendo o valor aceito |
| Biblioteca indisponivel | **200** | `meta.libraryUnavailable: true` (RF-12) |
| falha inesperada | 500 | `{ message }` generico; log com contexto no servidor |

---

## 11. Buracos fechados nesta revisao

Cada item traz o buraco, a resposta proposta e por que. Estas sao decisoes de
**produto e contrato** — as sete decisoes tecnicas da secao 4 continuam abertas
para o ADR-252.

| # | Buraco | Resposta | Por que |
|---|---|---|---|
| **B-01** | O resumo calculava investimento e EV sobre `buyIn` (parte do prize pool), nao sobre o total pago | RF-09 fixa a base em `totalBuyIn` | O ROI da Biblioteca tem o investimento total no denominador (fato 11). Multiplicar por uma base menor subestima investimento e EV em ~9% — numero errado numa tela que decide stake |
| **B-02** | Buy-in ausente/zero/negativo virava `$0.01` para caber no schema | RF-14: linha marcada `unusable`, fora do EV e do payload | Fallback silencioso em dinheiro e proibido (regra 03). Freeroll existe na grade e a Biblioteca o exclui — o `$0.01` transformava um dado ausente num dado falso |
| **B-03** | Falha da Biblioteca virava "sem amostra" em todas as linhas | RF-12: `meta.libraryUnavailable` + `sourceReason` proprio | "Nao tenho historico" e "a Biblioteca quebrou" exigem acoes opostas do jogador; os dois mostravam 15% |
| **B-04** | Torneio com `dayOfWeek` invalido/ausente sumia sem contador | `meta.skippedInvalid` + identidade fechada (RF-01) | Torneio que some sem aparecer em contador nenhum e exatamente o modo de falha que gerou o bug 6.1 |
| **B-05** | `period` sem validacao caia em "30 dias" dentro do storage | RF-13: allowlist, ausente = `all`, invalido = 400 | Janela de historico errada muda o ROI de toda a tela sem sintoma visivel |
| **B-06** | Trocar perfil ou periodo re-puxava o endpoint e descartava as edicoes | RF-08: `weeks` recalcula `count` localmente; trocar perfil re-puxa **e avisa** | `weeks` nao altera o conjunto de linhas (fato 13), so a contagem. Perder edicao sem aviso e o mesmo pecado do fallback silencioso, no plano da UX |
| **B-07** | `canonicalSiteKey('')` devolve string vazia e casava com familia de site vazio | 6.15: site vazio nunca casa em nivel `site_*` | Casamento por "vazio igual a vazio" produz ROI de um conjunto arbitrario com cara de dado do site |
| **B-08** | `isPKO` divergia entre as duas rotas da mesma tela (`/grade-roi` inclui Mystery, `/buckets-aggregate` nao); e `normalizeType` ainda mapeia `Add-on -> Vanilla` | Unificar em "PKO ou Mystery"; remover o mapeamento de `Add-on` | O motor usa `isPKO` para achatar a curva de payout, e Mystery distribui parte do premio em bounty — a regra da rota nova e a correta. O mapeamento `Add-on -> Vanilla` nasceu quando `Add-on` era lixo de classificacao; depois do ADR-251 ele apaga um tipo legitimo. Correcao de 1 linha + teste; nao amplia o escopo do modo antigo |
| **B-09** | Nomes crus divergentes na mesma linha produziam `tournamentName: null` (linha sem nome) e podiam gerar dois rotulos identicos | Nome modal + `nameVaries: true`; unicidade de rotulo virou criterio (RF-03) | O jogador reconhece a linha pelo nome. "Sem nome" e pior que "nome aproximado", e rotulo duplicado torna a tabela inutil |
| **B-10** | `plannedId` sugeria que a linha e um torneio planejado, quando representa N | `representativePlannedId` + `plannedIds[]` | Nome que mente sobre cardinalidade vira bug no proximo consumidor |
| **B-11** | `matchedCount` era exibido como "com amostra do proprio site", mas o nome nao diz isso | `siteMatchedCount` + `libraryMatchedCount` + `defaultCount`, com soma fechada | Tres conceitos diferentes estavam num contador so; a soma fechada e testavel |
| **B-12** | `rows: []` sem distinguir grade vazia de perfil sem dia ativo (o cliente inferia por `skippedInactive > 0`) | `meta.emptyReason` | Regra de negocio nao mora em heuristica do cliente |
| **B-13** | Contrato de resposta e unidades nao existiam por escrito | Secoes 9 e 10 | Percent x decimal ja custou bug nesta tela; sem contrato, o test-writer chuta e o proximo consumidor erra |
| **B-14** | `field` e ITM eram preenchidos em silencio, sem RF | RF-11, com `fieldSource`/`itmSource` | Os dois entram direto no motor e mexem na variancia tanto quanto o ROI |
| **B-15** | Custo do endpoint nao estava especificado (recarrega o historico inteiro a cada clique) | RNF 3.1: alvo de p95 e reuso do cache **ja existente** do modulo; sem infra nova | Medir antes de otimizar; o mecanismo de cache e invalidacao ja existe no arquivo |
