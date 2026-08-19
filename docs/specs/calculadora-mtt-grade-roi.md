# T2 — Calculadora MTT: EV da grade com o ROI do proprio jogador

**Modelo e esforco:** Opus 5, `xhigh` (zona critica: fonte do historico §6.1,
FX/dinheiro, query de analytics; o numero desta tela decide grade e stake).
**Origem:** sessao 2026-08-19. Prototipo funcional commitado em `f021a91f`.
**Pre-requisito ja fechado:** T1 / ADR-251 (rebuy nao e Add-on), commit
`6f9db285` + migration 0101.
**ADR desta feature:** a criar. **Migration:** nenhuma prevista.

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

**RF-01 — Importar a grade do perfil.** Botao na aba Variancia puxa os torneios
planejados do perfil selecionado. So entram dias em que aquele perfil esta
ativo (`profile_states`); dia `OFF`, dia sem estado e dia de outro perfil ficam
de fora. A tela diz quais dias entraram e quantos torneios ficaram de fora.

**RF-02 — Uma linha por torneio recorrente.** O mesmo torneio em varios dias da
semana e UMA linha, com a frequencia (`5x/semana · seg, ter, qua, qui, sex`).
A identidade do torneio nao pode depender do horario exato (ver 6.4).

**RF-03 — Rotulo no vocabulario da Biblioteca.** Formato
`Nome · Tipo $faixa Velocidade · Site · ~HHh-HHh`, usando as mesmas dimensoes
que a Biblioteca usa para formar familia. O jogador precisa reconhecer a linha.

**RF-04 — ROI do proprio jogador.** Cada linha recebe o ROI historico do
jogador naquele tipo de torneio, calculado pela Biblioteca (nao por uma conta
paralela). Valor usado na simulacao fica limitado a **[-20%, +40%]** para nao
carregar outlier de amostra pequena.

**RF-05 — Procedencia visivel.** Ao lado do ROI, em cinza: o valor cru da
Biblioteca, o tamanho da amostra e **de qual conjunto ela veio**. Quando a
amostra nao for do site daquela linha, a tela precisa dizer isso — o rotulo
nunca pode sugerir que um numero agregado pertence a um site que nao tem
amostra (ver 6.2).

**RF-06 — Sem amostra nenhuma.** ROI de partida 15%, marcado como estimativa,
nunca disfarcado de dado historico.

**RF-07 — Rake por site.** A linha nasce com o rake do site. `tournaments.rake_pct`
e 100% NULL, entao a fonte e a tabela por site (default 9%). Atencao a
semantica do engine (ver 6.5).

**RF-08 — Tudo editavel.** Nome, buy-in, rake, field, ITM, ROI e quantidade
continuam editaveis linha a linha, com adicionar e remover. Edicao vale so na
sessao, nao altera historico nem grade.

**RF-09 — EV da grade.** Resumo com total de torneios, investimento e EV
esperado (soma de investimento da linha x ROI da linha).

**RF-10 — Simular.** O payload precisa caber no contrato do
`POST /api/variance/simulate` (ver 6.6). Se nao couber, a tela avisa antes de
enviar, com o motivo.

---

## 4. Decisoes que o ADR precisa fechar

Estas nao estao resolvidas — o prototipo chutou uma resposta para cada.

**D-1. Fonte do ROI.** A Biblioteca aplica um piso de EXIBICAO
(`FAMILY_GROUP_FLOOR = 10`) que esconde familias pequenas. O prototipo pediu
`includeBelowFloor: true`. Decidir: a calculadora consome a Biblioteca inteira
(inclusive amostra minuscula, sinalizando confianca), ou respeita o piso e cai
para um nivel mais amplo? Amostra de 5 torneios produz ROI sem significado.

**D-2. Cascata de casamento.** Quando nao ha familia exata, o que vem depois? O
prototipo desce: `site+faixa+tipo+horario` -> `site+faixa+tipo` ->
`site+faixa` (qualquer tipo) -> `faixa+tipo` (qualquer site) -> `tipo` ->
nada. Decidir a ordem, e principalmente **onde parar**: agregado largo demais
vira ruido com cara de dado.

**D-3. Chave de identidade da linha.** O prototipo usa
`site + assinatura do nome + faixa de buy-in`. Decidir o que fazer quando o
mesmo nome aparece com buy-ins de faixas diferentes, e quando o nome esta
vazio.

**D-4. Clamp [-20%, +40%].** Corte duro nos limites, ou encolhimento em direcao
a media conforme a amostra (shrinkage)? Corte duro trata amostra de 5 e de 500
igual. O founder pediu explicitamente a faixa; a decisao aqui e sobre o
metodo, nao sobre os limites.

**D-5. Semantica do rake.** Confirmar por escrito a conversao entre "fatia do
buy-in total" (como o site publica) e "acrescimo sobre o buy-in" (como o engine
consome), e onde ela mora.

**D-6. Volume de simulacao.** Uma grade real gera ~48 grupos e ~2664 torneios
por trimestre. Definir os limites do endpoint e o que a tela faz ao encostar
neles.

**D-7. Rake de fonte propria.** Vale fazer o parser gravar a fee do CSV para o
rake sair do dado do jogador em vez da tabela por site? (Regra de produto: dado
do proprio jogador antes de heuristica generica.) Se sim, e sprint separada.

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
   de `datePlayed` em UTC. A grade guarda `time` como texto `"HH:MM"`.
7. **Tipo da grade e tipo do historico divergem.** A grade tem o que o jogador
   escreveu; o historico tem o que o import deduziu. O ADR-251 fechou a maior
   fonte dessa divergencia, mas ela nao morreu.

---

## 6. Cenarios obrigatorios de teste

Cada um e um bug que aconteceu de verdade nesta grade. Sao o piso da red phase.

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

---

## 7. Fora de escopo

- Migration nova (nao ha).
- Salvar a grade simulada ou versionar cenarios.
- Mudar o motor de Monte Carlo, a curva de payout ou o tratamento de PKO.
- Consumir `allows_rebuy` em filtro/coluna (divida aberta do ADR-251).
- Fazer o parser gravar a fee do CSV (ver D-7).

---

## 8. Gate de fechamento

Alem de `npm run check` limpo e das suites verdes:

**Prova no dado real.** Probe `tsx` contra o banco local (USER-0005) imprimindo:
contagem de torneios ativos por perfil, numero de linhas apos agrupar,
distribuicao dos niveis de casamento, quantas linhas ficaram sem amostra do
proprio site, e uma amostra de 5-10 linhas legiveis. O founder confere se
reconhece a grade dele antes de a feature ser dada por pronta.

Numeros de referencia do prototipo, ja com o ADR-251 aplicado — servem de
baseline, nao de meta: perfil A = 222 torneios -> 48 linhas; 40 delas casando
no nivel mais especifico; 5 sem amostra do proprio site (Bodog, que realmente
nao tem historico).

**Verificacao no `:3000` reiniciado**, com o botao clicado de verdade.
