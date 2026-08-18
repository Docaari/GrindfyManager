# ADR-244: Ajuste manual do resultado final da sessao (grind-live) — valor unico, sem trilha, com ROI nulo declarado

## Status
Aceito

## Data
2026-08-01

Spec de origem: `Docs/specs/grind-live-manual-session-result.md` (aprovada pelo
founder em 2026-08-01). Modelo/esforco declarados na spec: Opus 5 / `high` —
toca zona critica (FX/dinheiro + schema/migration).

> **Nota de numeracao:** ultimo ADR em disco na abertura desta sessao e o **243**
> (`243-import-otimizacao-sharkscope.md`). Este usa o proximo livre confirmado =
> **244**. O indice `README.md` desta pasta esta com drift (ultima linha indexada
> = 237); a linha de 244 foi adicionada mesmo assim, deixando o buraco 238-243
> visivel em vez de mascarado.

---

## Contexto

O numero de lucro que o `SessionSummaryModal` mostra ao fechar o grind ao vivo e
sempre **derivado**: ou e o delta dos saldos de wallet que o jogador digitou
(`totalProfitUSD`, card "Lucro Total da Sessao"), ou e o P&L dos torneios da
sessao (`summaryData.profit`, card "Profit"). Os dois erram em casos que o app
nao enxerga: rakeback creditado durante a sessao, bounty pago fora do prize,
torneio em plataforma sem wallet cadastrada, cash paralelo na mesma conta,
ajuste de saldo feito pela sala.

Hoje o jogador so corrige **depois**, em `/grind` -> editar sessao, onde o
`client/src/components/grind-session/EditSessionDialog.tsx` ja sobrescreve
`profit` e `roi` a mao — sem nenhuma trilha de auditoria. Ou seja: o produto ja
aceita numero declarado pelo jogador na sessao; o que falta e aceitar **na hora
certa**, antes que o numero errado circule pelo historico, pelo Daily Debrief e
pelo Coach ate ele lembrar de voltar la.

A feature e pequena de superficie (um campo no modal) e grande de semantica:
o valor digitado passa a ocupar as tres colunas que descrevem o resultado da
sessao — `grind_sessions.profit`, `.roi` e `.wallet_profit_usd`. As perguntas
estruturais que este ADR fecha sao quatro:

1. **Qual e o escopo do override** e o que acontece com o significado de
   `wallet_profit_usd`, que hoje e "delta reconciliado das wallets"?
2. **Da para distinguir depois** um numero digitado de um numero calculado?
3. **Onde mora o toggle** que liga o campo?
4. **O que o ROI vale** quando o investido e zero?

Restricoes herdadas que nao se reabrem aqui:
- Secao 6.1 do `CLAUDE.md` (fonte do historico) — a feature nao toca
  `tournaments`; opera so sobre `grind_sessions`, que e o detalhe da sessao.
- `.claude/rules/01-tecnologia.md` — ausencia de dado devolve `null` + motivo
  nomeado, nunca zero inventado; conversao para USD antes de comparar.
- `.claude/rules/12-schema-migrations.md` — par migration + rollback,
  additive-only, registrada como PENDENTE PROD.

Estado do codigo relevante (levantado antes desta decisao):

| Ponto | Arquivo | Comportamento hoje |
|---|---|---|
| Valor calculado (wallets) | `SessionSummaryModal.tsx:159` | `totalProfitUSD` = soma `(reported - opening)` por wallet, convertida a USD por `usdConversionRates` |
| Valor calculado (torneios) | `GrindSessionLive.tsx` `sessionSummaryData` | `summaryData.profit` |
| Reconciliacao | `SessionSummaryModal.tsx:180-291` | `guardAndReconcile()` -> `submitReconcile()` -> `POST /reconcile-wallets`, **antes** de `onEndSession` |
| Persistencia | `GrindSessionLive.tsx:680-734` | `PUT /api/grind-sessions/:id` com `profit`, `roi`, `abiMed`, e `walletProfitUsd` **so quando** `showProfitCard` |
| Leitura do historico | `server/services/grindSessionHistory.ts:224-236` | precedencia: (1) `wallet_profit_usd` persistido, (2) snapshots reconciliadas, (3) P&L de torneios |
| Leitura do ROI | `server/routes/grind-sessions.ts:845` | `parseFloat(session.roi \|\| '0') \|\| 0` — transforma `null` em `0` |

---

## Opcoes Consideradas

### Q1 — Escopo do override e semantica de `wallet_profit_usd`

#### Opcao A — Valor unico: sobrescreve `profit` + `roi` + `wallet_profit_usd` **[ESCOLHIDA]**
- **Pros:**
  - O jogador declara **um** resultado da sessao e ve **esse** numero em todo
    lugar. Nao existe estado em que duas telas do mesmo app mostrem dois lucros
    diferentes para a mesma sessao — que e exatamente o que a feature veio
    resolver.
  - Casa com a precedencia ja implementada em `grindSessionHistory.ts`
    (`wallet_profit_usd` e o degrau 1). Deixar essa coluna com o valor antigo
    faria o historico continuar exibindo o numero errado apos o ajuste, e a
    feature nasceria sem efeito na tela onde mais dolo.
  - Zero mudanca de schema em `grind_sessions`.
- **Contras:**
  - Muda a semantica de `wallet_profit_usd` (ver "Consequencias").
  - Um consumidor futuro que leia essa coluna como "delta das wallets" recebe um
    numero que pode divergir da soma dos deltas da propria sessao.

#### Opcao B — Sobrescrever so `profit` + `roi`, preservando `wallet_profit_usd` como delta reconciliado
- **Pros:**
  - Preserva a semantica original da coluna; `wallet_profit_usd` continua sendo
    um espelho fiel da banca.
- **Contras:**
  - **Quebra o proposito da feature.** Como o historico le `wallet_profit_usd`
    primeiro, o jogador ajustaria o resultado, veria o numero certo no modal, e
    encontraria o numero antigo em `/grind` no segundo seguinte. Duas verdades
    para a mesma sessao e pior do que uma verdade declarada.
  - Exigiria inverter a precedencia do historico ou introduzir uma quarta regra
    de desempate — complexidade nova para sustentar um valor que ninguem mais
    veria.

#### Opcao C — Coluna nova `session_result_manual_usd` com precedencia explicita
- **Pros:**
  - Semantica limpa: cada coluna guarda uma coisa so; da para distinguir
    declarado de calculado sem ambiguidade.
- **Contras:**
  - Migration em `grind_sessions` + mudanca em todo consumidor de resultado
    (historico, Daily Debrief, Coach, `EditSessionDialog`) para respeitar a nova
    precedencia. Custo desproporcional para uma correcao de dado do proprio
    jogador.
  - Cria uma segunda fonte de verdade dentro da mesma linha, que e a doenca que
    a Opcao A evita.
  - Foi descartada tambem em Q2 — e a mesma discussao de auditoria por outro
    nome.

### Q2 — Auditoria do valor declarado

#### Opcao A — Sem coluna de auditoria; sobrescreve direto, rastro em telemetria **[ESCOLHIDA]**
- **Pros:**
  - Paridade com o precedente ja em producao: `EditSessionDialog.tsx` edita
    `profit`/`roi` sem qualquer trilha desde sempre. Introduzir auditoria so no
    caminho novo criaria um produto com duas politicas para a mesma acao.
  - Sem migration em `grind_sessions`, sem mudanca em nenhum consumidor.
  - O rastro que interessa ao produto (com que frequencia o calculado erra, e por
    quanto) e obtido por telemetria (RF-06), que e mais barata e nao polui o
    modelo de dados.
- **Contras (declarados, nao mitigados por schema):**
  - **O numero digitado fica indistinguivel do calculado** para o historico, o
    Daily Debrief, o Coach e qualquer analise futura sobre `grind_sessions`.
  - Nao ha como reverter para o valor calculado depois de finalizar, nem exibir
    badge "ajustado" no historico.
  - Se um dia o produto quiser medir "acuracia do calculo automatico" com dado
    persistido (nao so com evento), sera preciso uma migration retroativa que
    nao conseguira recuperar o passado.

#### Opcao B — Coluna `profit_auto` (guarda o calculado) + flag `manual_override`
- **Pros:**
  - Reversivel: da para voltar ao calculado, exibir badge, medir divergencia com
    dado persistido, e auditar o historico.
- **Contras:**
  - Migration + back-fill impossivel para o passado (sessoes ja editadas pelo
    `EditSessionDialog` continuariam sem trilha, entao a auditoria nasceria
    parcial e enganosa).
  - Founder decidiu explicitamente contra (D2 da spec): o valor da trilha nao
    paga o custo de carregar duas colunas de lucro por sessao em todo consumidor.

#### Opcao C — Tabela de auditoria `session_result_overrides`
- **Pros:** trilha completa, sem inchar `grind_sessions`.
- **Contras:** tabela nova + storage + rotas para um evento que hoje ninguem le;
  telemetria entrega 90% do sinal por uma fracao do custo. Descartada.

### Q3 — Onde mora o toggle

#### Opcao A — `user_settings.manual_session_result_enabled`, default `true` **[ESCOLHIDA]**
- **Pros:**
  - `user_settings` e a tabela de preferencias **do app** (moeda, alertas de late
    reg, `bankroll_management_enabled`, stops). O toggle segue exatamente o
    padrao de `bankrollManagementEnabled`, inclusive na pagina `/configuracoes`.
  - `GrindSessionLive` **ja busca** `GET /api/user-settings` no mesmo
    `Promise.allSettled` do `reconcilable-wallets` ao abrir o summary — a flag
    chega sem request adicional.
  - Sem endpoint novo: `GET`/`PUT /api/user-settings` ja fazem upsert por merge.
- **Contras:**
  - `insertUserSettingsSchema` precisa aceitar o campo **na mesma sprint** da
    migration: o `PUT` faz `.parse` do merge com o registro existente
    (`server/routes/misc.ts:136-145`), entao uma coluna presente no banco e
    ausente no schema Zod derruba **todo** `PUT` parcial de settings, nao so o
    toggle novo. Registrado como dependencia dura na spec.

#### Opcao B — `user_coach_preferences`
- **Pros:** ja e a casa de varios opt-ins booleanos.
- **Contras:** semanticamente errado — aquela tabela governa **proatividade do
  Coach** (nudges, relatorios, email) e e lida por crons gateados por
  `COACH_NUDGES_ENABLED`. Este toggle nao tem nada a ver com o Coach, e mora numa
  pagina diferente. Poluiria o contrato de uma tabela cujo consumidor e um job.

#### Opcao C — Sem toggle (campo sempre visivel)
- **Pros:** zero migration, zero superficie de configuracao.
- **Contras:** o founder quis a valvula de escape para o jogador que prefere o
  modal enxuto e nao quer risco de digitar por cima do calculado. Com default
  `true`, o custo do toggle e so a coluna; o beneficio e poder desligar sem
  deploy.

### Q4 — ROI quando o investido e zero

#### Opcao A — `roi = null` + motivo `invested_zero`, UI mostra `—` **[ESCOLHIDA]**
- **Pros:**
  - E a regra do projeto (`.claude/rules/03-padrao-codigo.md`, "Falhar alto"):
    ausencia de dado devolve `null` + razao nomeada, nunca zero inventado.
  - `0%` para uma sessao com investido zero e uma **mentira mensuravel** — o
    jogador leria "empatei percentualmente" quando o certo e "nao ha denominador".
  - O helper puro devolve `reason: 'invested_zero'`, entao a UI e os testes
    distinguem "ROI zero de verdade" de "ROI indefinido".
- **Contras:**
  - Obriga a corrigir `server/routes/grind-sessions.ts:845`
    (`parseFloat(session.roi || '0') || 0`), que hoje achata `null` em `0`.
  - Efeito colateral visivel em 4 telas de sessao legada (ver "Consequencias").

#### Opcao B — `roi = 0`
- **Pros:** nenhuma mudanca no backend nem nas telas.
- **Contras:** viola a regra do projeto e propaga um numero falso para o Coach e
  para o historico. Descartada sem discussao adicional.

#### Opcao C — Omitir `roi` do payload quando indefinido
- **Pros:** nao grava numero falso.
- **Contras:** `PUT` parcial deixaria o `roi` **anterior** intacto no banco — a
  sessao ficaria com o ROI de um calculo que nao vale mais. Pior que `null`:
  numero velho parecendo atual.

---

## Decisao

### D1 — Valor unico: o ajuste sobrescreve `profit`, `roi` e `wallet_profit_usd`

Quando ha ajuste ativo, o `PUT /api/grind-sessions/:id` disparado por
`handleEndSession` (`GrindSessionLive.tsx:680`) carrega:

- `profit` = resultado manual (string, USD);
- `roi` = ROI recalculado (string) ou `null` (D4);
- `walletProfitUsd` = **o mesmo** resultado manual.

`abiMed` continua derivado de `invested / volume` — o override nao mexe nele, e a
**base de investimento nao muda em nenhuma hipotese**.

**Mudanca de semantica de `grind_sessions.wallet_profit_usd`** (o ponto mais
importante deste ADR):

| | Antes | Depois |
|---|---|---|
| Significado | Delta reconciliado das wallets (soma `reported - opening` por wallet, convertida a USD) — espelho da banca | **Resultado final declarado da sessao**: o delta das wallets quando nao houve ajuste, ou o numero que o jogador digitou quando houve |
| Preenchida quando | So com a secao Bancas visivel (`showProfitCard`, isto e, ha wallets reconciliaveis) | Idem, **mais** qualquer sessao com ajuste ativo — inclusive sessao **sem wallet nenhuma** |
| Invariante | `wallet_profit_usd` ~ soma dos deltas de wallet da sessao | **Nao ha invariante.** Pode divergir da soma dos deltas da mesma sessao |
| "Nao nulo" implicava | Houve reconciliacao de banca | **Nada sobre reconciliacao.** So que a sessao tem resultado final conhecido |

Consumidor afetado hoje: `server/services/grindSessionHistory.ts:224-236`, cuja
precedencia (1. `wallet_profit_usd` persistido -> 2. snapshots reconciliadas ->
3. P&L de torneios) passa a servir o valor declarado no degrau 1. Isso e
**desejado** — e o mecanismo pelo qual o ajuste alcanca o historico sem tocar em
mais nada. O efeito lateral novo e que sessoes sem wallet, que antes caiam
sempre no degrau 3, passam a poder ocupar o degrau 1.

O comentario da coluna em `shared/schema.ts:788` e a linha correspondente em
`Docs/architecture/data-model-index.md` **precisam** refletir isso — sem essa
atualizacao, o proximo leitor da coluna acredita numa invariante que deixou de
existir.

### D2 — Sem coluna de auditoria; o rastro e telemetria

Sobrescreve direto. Nao ha `profit_auto`, nem flag `manual_override`, nem tabela
de overrides. Nao ha badge "ajustado" no historico, nem reversao pos-finalizacao.

**Trade-off registrado sem eufemismo:** apos o `PUT`, o numero digitado e
**indistinguivel** do calculado para o historico de `/grind`, para o Daily
Debrief (que agrega as sessoes do dia) e para o Coach. Nenhuma superficie
consegue responder "este lucro foi declarado ou derivado?", e nenhuma analise
futura sobre `grind_sessions` conseguira separar as duas populacoes
retroativamente.

Precedente que justifica: `client/src/components/grind-session/EditSessionDialog.tsx`
ja edita `profit`/`roi` sem trilha em producao. A feature nao introduz a
propriedade — ela a estende para o momento do fechamento, onde o dado ainda esta
fresco na cabeca do jogador.

**Mitigacao adotada = RF-06 (telemetria), nao schema.** No clique de "Finalizar
Sessao", **somente** com ajuste ativo, o `safeTrack` ja existente no modal emite
`session_result_manual_override` com
`{ sessionId, computedProfitUsd, manualProfitUsd, deltaUsd, investedUsd,
roiComputed, roiManual, source: 'wallet' | 'tournaments' }`. Isso responde as
perguntas de produto (com que frequencia o calculo erra, por quanto, e a partir
de qual base) sem carregar uma coluna por sessao. `safeTrack` nunca lanca para o
usuario — telemetria falhando nao impede a finalizacao.

### D3 — Toggle em `user_settings`, default `true`, migration 0100

`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS
manual_session_result_enabled boolean NOT NULL DEFAULT true`. Additive-only.
Par obrigatorio `migrations/0100_manual_session_result.sql` +
`migrations/0100_manual_session_result_rollback.sql` (rollback = `DROP COLUMN`).

- Usuario existente herda `true` pelo DEFAULT — sem back-fill explicito.
- Exposto como `manualSessionResultEnabled` no drizzle e em
  `insertUserSettingsSchema` (**dependencia dura**: o `PUT` faz `.parse` do
  merge; campo fora do schema derruba todo `PUT` parcial de settings).
- Lido/escrito pelos endpoints existentes `GET`/`PUT /api/user-settings`.
  **Nenhum endpoint novo em toda a feature.**
- Valor ausente no client (settings carregando, 404) resolve para `true` — mesmo
  fail-open do `bankrollManagementEnabled`. Aqui fail-open e seguro: o pior caso
  e mostrar um campo opcional que o jogador ignora.
- Sem gate de tier. E correcao de dado proprio, nao feature paga.

### D4 — `roi = null` quando investido <= 0, e o efeito em `grind-sessions.ts:845`

Formula: `roi = (resultadoManual / investido) * 100`, com `investido` = o mesmo
`summaryData.invested` de hoje (`investedNorm = stats.totalInvestidoUSD ??
stats.totalInvestido`, `GrindSessionLive.tsx:529`). Investido `<= 0` ou nao
finito -> `roi = null`; a UI mostra `—`; o `PUT` envia `roi: null`.

O calculo vive num **helper puro testavel** em
`client/src/components/grind-session-live/manual-session-result.ts`, exportando
`computeAdjustedResult({ manualProfitUsd, investedUsd })` ->
`{ profitUsd: number; roi: number | null; reason?: 'invested_zero' }`. Nada de
calculo inline no JSX.

**Efeito colateral aceito, e ele e visivel:** `server/routes/grind-sessions.ts:845`
faz hoje `parseFloat(session.roi || '0') || 0`, o que converte `null` (e `NaN`)
em `0`. Passa a preservar `null`. Como a coluna `grind_sessions.roi` ja e
nullable e ja existem **sessoes legadas com `roi` nulo**, a correcao muda o que
essas sessoes exibem — de `0.0%` para `—` — em quatro telas:

1. `client/src/pages/SessionHistory.tsx`
2. `client/src/pages/GrindSession.tsx`
3. `client/src/components/grind-session/SessionHistoryList.tsx`
4. `client/src/components/grind-session/EditSessionDialog.tsx`

Isso e mudanca de tela sem feature flag, e o founder aceitou conscientemente: e o
comportamento correto pela regra do projeto (ausencia != zero), e o `0.0%` que
some sempre foi informacao falsa. Os ROIs do Dashboard e da Library vem de
`tournaments` (secao 6.1 do `CLAUDE.md`) — **fonte diferente, fora de escopo**.

### D5 (invariante RF-05) — O ajuste nao toca a banca

O `POST /api/grind-sessions/:id/reconcile-wallets` continua sendo montado
**exclusivamente** a partir de `reportedBalances` (os saldos digitados por
wallet), em `submitReconcile()`/`guardAndReconcile()`. O valor manual **nao entra
nesse payload, em nenhum campo**. Nenhuma `wallet_transaction`, nenhum
`bankroll_snapshot` e nenhum saldo de wallet muda por causa do ajuste.

A ordem do fluxo tambem nao muda: reconciliacao inline primeiro
(`guardAndReconcile`), `onEndSession` depois. As duas escapes ja existentes
(`hasMissing` -> skip com marcador server-side; 409 `already_reconciled` ->
tratado como sucesso idempotente) seguem valendo com ajuste ativo.

Consequencia declarada: **a banca continua sendo a fonte de verdade do
dinheiro**; a sessao passa a carregar o numero que o jogador declarou. Divergir e
o comportamento esperado, nao um bug a reconciliar depois.

---

## Consequencias

### Positivas
- O jogador corrige o resultado no momento em que ele sabe que esta errado, antes
  do numero contaminar historico, Daily Debrief e Coach.
- Uma unica verdade por sessao em todas as telas — nenhuma combinacao de
  precedencia produz dois lucros diferentes para a mesma sessao.
- Custo estrutural minimo: 1 coluna booleana, 0 endpoint novo, 0 alteracao de
  schema em `grind_sessions`, 0 request adicional (o settings ja e buscado).
- A regra "ausencia com motivo, nunca zero inventado" ganha uma superficie a
  mais, e de quebra corrige uma mentira antiga (`0.0%` em sessao sem ROI).

### Negativas
- **`grind_sessions.wallet_profit_usd` perde sua invariante.** Quem ler a coluna
  como "delta das wallets" a partir de agora esta errado; quem escrever analise
  nova precisa ler o comentario do schema. Risco real de regressao conceitual
  numa sprint futura de Bankroll.
- **Zero rastreabilidade do valor declarado no dado persistido** (D2). Uma
  pergunta legitima de produto — "quanto do lucro registrado e declarado?" — so
  tem resposta via telemetria, e apenas dali para frente.
- **Mudanca de tela nao anunciada** em 4 superficies de sessao legada
  (`0.0%` -> `—`). Baixo impacto, mas e visivel e nao tem flag.
- Migration 0100 e **dependencia dura** de `insertUserSettingsSchema`: aplicar a
  coluna sem atualizar o Zod, ou o inverso, quebra o `PUT /api/user-settings`
  inteiro — nao so o toggle. Os dois tem que ir na mesma sprint.

### Neutras / operacionais
- Migration 0100 a aplicar no local (psql :5433) e registrar como **PENDENTE
  PROD** na secao 6 do `CLAUDE.md`. Sem ela, `GET`/`PUT /api/user-settings`
  quebra com `column "manual_session_result_enabled" does not exist`.
- Com a preferencia OFF, ou com o campo intocado, o payload do `PUT` e o do
  `reconcile-wallets` sao **byte-a-byte** iguais aos de hoje — a nao-regressao e
  testavel diretamente.
- `EditSessionDialog` continua sendo o caminho de correcao **retroativa** (sessao
  ja finalizada). Esta feature nao o substitui nem o duplica.
- Sem integracao externa, sem gate de tier, sem impacto em cron/job.

---

## Confianca

**Alta** para D1, D3 e D5: o escopo do override e a unica opcao que faz a feature
existir de fato na tela (dada a precedencia do `grindSessionHistory`); o toggle
segue um padrao ja provado no mesmo arquivo de settings; e a invariante da banca
e mecanica (o payload do reconcile nunca ve o valor manual).

**Media** para D2: a decisao e do founder e tem precedente forte, mas e a unica
escolha deste ADR que **nao e reversivel sem perda** — se um dia o produto quiser
medir acuracia do calculo com dado persistido, o passado sera irrecuperavel. A
telemetria reduz o risco, nao o elimina.

**Alta** para D4 quanto a regra (`null` + motivo e o padrao do projeto), **media**
quanto ao efeito colateral: a mudanca de `0.0%` para `—` em sessoes legadas foi
prevista e aceita, mas atinge tela em producao sem flag — se o founder reclamar do
visual, o ajuste e de exibicao, nao de contrato.

---

## Artefatos relacionados
- Spec: `Docs/specs/grind-live-manual-session-result.md`
- Diagramas: `Docs/architecture/diagrams/grind-live-manual-session-result/`
  - `finalize-with-manual-result-sequence.mermaid`
  - `manual-result-value-decision-flow.mermaid`
- Migration: `migrations/0100_manual_session_result.sql` + `_rollback.sql`
- Modelo de dados: `Docs/architecture/data-model-index.md` (`user_settings` +
  `grind_sessions`)
- Precedentes: ADR-047 (reconcile inline no summary), ADR-060 (stops em
  `user_settings`), ADR-214 (paridade do detalhe da sessao)
