# Spec: Ajuste manual do resultado final da sessao (grind-live)

## Status
Aprovada (founder, 2026-08-01)

## Modelo e esforco
Opus 5 / `high`. Toca zona critica: FX/dinheiro (o valor e USD e sobrescreve
`wallet_profit_usd`) + schema/migration (coluna nova em `user_settings`).

## Resumo
No modal "Resumo da Sessao" (fim do grind ao vivo), o jogador pode digitar o
resultado final da sessao (lucro ou prejuizo, em USD) no lugar do numero
calculado. O investido nao muda; o ROI e recalculado sobre o novo lucro. O campo
so aparece quando a opcao estiver ligada em Configuracoes (ligada por padrao).

## Contexto
O numero calculado erra em casos que o app nao ve: rakeback creditado durante a
sessao, bounty pago fora do prize, torneio em plataforma sem wallet cadastrada,
cash paralelo, ajuste de saldo pela sala. Hoje o jogador so consegue corrigir
**depois**, em `/grind` -> editar sessao (`EditSessionDialog.tsx` ja edita
`profit` e `roi` a mao). A correcao no momento do fechamento evita que o numero
errado circule ate ele lembrar de voltar la.

Precedente: `EditSessionDialog` ja sobrescreve `profit`/`roi` sem trilha de
auditoria. Esta spec segue o mesmo contrato (decisao do founder), com a
consequencia declarada: **o valor digitado fica indistinguivel do calculado**
para o historico, o Dashboard de sessoes, o Daily Debrief e o Coach. A mitigacao
adotada e telemetria (RF-06), nao coluna nova.

## Usuarios
- **Jogador (trial/active/admin/free)**: liga ou desliga a opcao em
  Configuracoes; ajusta o resultado ao fechar a sessao. Sem gate de tier — e
  correcao de dado proprio, nao feature paga.

## Decisoes tomadas (fechadas com o founder)
| # | Decisao | Escolha |
|---|---|---|
| D1 | Escopo do override | Valor unico: sobrescreve `profit`, `roi` **e** `wallet_profit_usd` |
| D2 | Auditoria | Sem coluna de auditoria — sobrescreve direto |
| D3 | Toggle | `user_settings` + pagina Configuracoes, **default ON** |
| D4 | ROI com investido = 0 | `roi = null` + UI mostra "—" (nunca 0 inventado) |

---

## Requisitos Funcionais

### RF-01: Toggle em Configuracoes
**Descricao:** Nova preferencia global do usuario que habilita/desabilita o campo
de ajuste manual no modal de fim de sessao.

**Regras de negocio:**
- Coluna nova `user_settings.manual_session_result_enabled` — `boolean NOT NULL
  DEFAULT true`. Additive-only, migration `0100` (proximo livre; ultima existente
  e `0099_fix_upload_history_user_fk.sql`).
- Exposta no schema Zod compartilhado como `manualSessionResultEnabled`.
- Leitura/escrita pelos endpoints existentes `GET /api/user-settings` e
  `PUT /api/user-settings` (upsert por merge, ja implementado em
  `server/routes/misc.ts:136`). **Nenhum endpoint novo.**
- Switch renderizado em `client/src/pages/Settings.tsx`, no mesmo bloco dos
  toggles de sessao/bankroll, seguindo o padrao de `bankrollManagementEnabled`
  (`Settings.tsx:211-224`): estado otimista + `PUT /api/user-settings` com
  payload parcial.
- Rotulo PT-BR: "Ajustar resultado final da sessao manualmente". Descricao:
  "Permite digitar o lucro/prejuizo da sessao ao finalizar. O investido nao muda
  e o ROI e recalculado."
- Usuario existente sem a coluna preenchida herda `true` pelo DEFAULT do banco.
- Valor ausente/indefinido no client (settings ainda carregando, 404) resolve
  para `true` — mesmo fail-open do `bankrollManagementEnabled`.

**Criterio de aceitacao:**
- [ ] `GET /api/user-settings` devolve `manualSessionResultEnabled: true` para
      usuario que nunca tocou na preferencia.
- [ ] `PUT /api/user-settings` com `{ manualSessionResultEnabled: false }`
      persiste e nao apaga nenhum outro campo de settings.
- [ ] Switch em `/configuracoes` reflete o valor persistido apos reload.
- [ ] `insertUserSettingsSchema` aceita o campo (o PUT usa `.parse` sobre o merge
      — campo fora do schema derruba **todo** PUT parcial de settings).

---

### RF-02: Campo de ajuste no modal de fim de sessao
**Descricao:** `SessionSummaryModal.tsx` ganha um controle para sobrescrever o
resultado final da sessao.

**Regras de negocio:**
- Renderiza **apenas** quando `manualSessionResultEnabled === true`. Desligado, o
  modal fica exatamente como esta hoje (zero diff visual).
- O modal recebe a flag por prop (`manualResultEnabled?: boolean`), no mesmo
  padrao de `bankrollManagementEnabled`; quem busca o settings e
  `GrindSessionLive.tsx`.
- Estado inicial do campo (valor pre-preenchido, o "calculado"):
  - Se a secao Bancas esta visivel (`showProfitCard === true`): `totalProfitUSD`
    (card "Lucro Total da Sessao").
  - Senao: `summaryData.profit` (card "Profit").
- Interacao: o campo comeca **fechado**, exibindo o numero calculado + acao
  "Ajustar". Ao acionar, vira `<input type="number" step="0.01">` em USD, com
  `data-testid="manual-session-result-input"`, e uma acao "Desfazer ajuste" que
  volta ao calculado.
- Enquanto o ajuste esta ativo:
  - O card de resultado exibe o valor digitado (com sinal e cor por
    `tokens.color.delta`), e um rotulo "ajustado manualmente".
  - O card ROI exibe o ROI recalculado (RF-03).
  - O card **Investido nao muda** em nenhuma hipotese.
- Aceita negativo (prejuizo), zero e decimais. Moeda: **USD** — os cards do modal
  ja sao USD; nao ha conversao nesta feature.
- Entrada invalida (vazio, `-`, `NaN`, `Infinity`) **nao** vira 0: o botao
  "Finalizar Sessao" fica desabilitado e o campo mostra o erro "Informe um valor
  numerico". Ausencia de dado nunca produz zero inventado.
- A secao Bancas (inputs de saldo por wallet) continua funcionando e sendo
  submetida normalmente. O ajuste manual **nao** altera saldo de wallet, nem
  `wallet_transactions`, nem `bankroll_snapshots` — ver RF-05.
- Quando a sessao e finalizada sem tocar no campo, o comportamento e byte-a-byte
  o de hoje (mesmos valores no PUT).

**Criterio de aceitacao:**
- [ ] Com a preferencia OFF, `manual-session-result-input` nao existe no DOM.
- [ ] Com a preferencia ON, o campo pre-preenche com `totalProfitUSD` quando ha
      wallets reconciliaveis, e com `summaryData.profit` quando nao ha.
- [ ] Digitar `-120.5` exibe o card de resultado como `-$120.50` com tom
      negativo, e "Investido" permanece inalterado.
- [ ] "Desfazer ajuste" restaura o valor calculado e some o rotulo "ajustado
      manualmente".
- [ ] Campo vazio ou nao-numerico desabilita "Finalizar Sessao".

---

### RF-03: ROI derivado do resultado ajustado
**Descricao:** O ROI exibido e persistido passa a ser recalculado sobre o valor
manual, mantendo a base de investimento.

**Regras de negocio:**
- Formula: `roi = (resultadoManual / investido) * 100`, onde `investido` e o
  mesmo `summaryData.invested` ja usado hoje (`investedNorm =
  stats.totalInvestidoUSD ?? stats.totalInvestido`, `GrindSessionLive.tsx:529`).
- **Base de investimento nao muda** — nem quando o override sobrescreve o card de
  banca.
- `investido <= 0` (ou nao finito) -> `roi = null`. A UI mostra `—`, nunca `0%`.
  O PUT envia `roi: null`.
- A funcao de calculo mora em helper puro testavel, em
  `client/src/components/grind-session-live/` (ex.: `manual-session-result.ts`),
  exportando algo como
  `computeAdjustedResult({ manualProfitUsd, investedUsd })` ->
  `{ profitUsd: number; roi: number | null; reason?: 'invested_zero' }`.
  Nada de calculo inline no JSX.
- **Leitura do historico:** `server/routes/grind-sessions.ts:845` hoje faz
  `parseFloat(session.roi || '0') || 0`, o que transforma `null` em `0`. Passa a
  preservar `null` (`session.roi == null ? null : parseFloat(...)`, com `NaN`
  tambem virando `null`).
- **Superficies de exibicao de ROI de sessao** que precisam renderizar `—` para
  `null` (nao `0.0%`): `client/src/pages/SessionHistory.tsx`,
  `client/src/pages/GrindSession.tsx`,
  `client/src/components/grind-session/SessionHistoryList.tsx`,
  `client/src/components/grind-session/EditSessionDialog.tsx`.
  Os ROIs do Dashboard/Library vem de `tournaments`, fonte diferente (§6.1) —
  **fora de escopo**.
- Efeito colateral aceito e visivel: sessoes legadas que ja tem `roi` nulo no
  banco passam a mostrar `—` em vez de `0.0%`. E o comportamento correto pela
  regra do projeto (ausencia != zero), mas e mudanca de tela.

**Criterio de aceitacao:**
- [ ] Investido $1000, resultado manual `+$250` -> ROI exibido `+25.0%`.
- [ ] Investido $1000, resultado manual `-$400` -> ROI exibido `-40.0%`.
- [ ] Investido `0`, resultado manual `+$50` -> ROI exibido `—` e PUT envia
      `roi: null`.
- [ ] Helper puro devolve `reason: 'invested_zero'` no caso acima.
- [ ] `GET` do historico devolve `roi: null` (nao `0`) para sessao com coluna
      nula.

---

### RF-04: Persistencia do valor ajustado
**Descricao:** O resultado manual e gravado na sessao ao finalizar.

**Regras de negocio:**
- Nenhum endpoint novo: continua o `PUT /api/grind-sessions/:id` disparado por
  `handleEndSession` (`GrindSessionLive.tsx:680`).
- Quando ha ajuste ativo, o PUT envia (D1 — valor unico):
  - `profit` = resultado manual (string, USD);
  - `roi` = ROI recalculado (string) ou `null`;
  - `walletProfitUsd` = **mesmo** resultado manual, substituindo o
    `totalProfitUSD` que hoje vem do card de banca.
- `abiMed` continua derivado de `invested / volume` — o override nao mexe nele.
- Sem ajuste ativo, o payload e identico ao atual (inclusive a regra de so
  mandar `walletProfitUsd` quando a secao Bancas esta visivel).
- `wallet_profit_usd` deixa de ser garantidamente "delta das wallets" e passa a
  significar "resultado final da sessao". Documentar a mudanca de semantica no
  comentario da coluna em `shared/schema.ts:788` e em
  `Docs/architecture/data-model-index.md`.
- Falha do PUT mantem o comportamento atual: toast de erro, modal reabre, e o
  valor digitado **e preservado** no campo (nao volta pro calculado).

**Criterio de aceitacao:**
- [ ] Com ajuste `+$300` e investido `$1200`, o PUT carrega
      `profit: "300"`, `roi: "25"`, `walletProfitUsd: "300"`.
- [ ] Sem ajuste, o payload do PUT e igual ao de hoje (teste de regressao).
- [ ] Erro 500 no PUT reabre o modal com o valor digitado intacto.
- [ ] `/grind` (historico) mostra o valor ajustado apos finalizar.

---

### RF-05: O ajuste nao toca a banca
**Descricao:** Invariante de seguranca do dado financeiro.

**Regras de negocio:**
- O `POST /api/grind-sessions/:id/reconcile-wallets` continua sendo montado
  **exclusivamente** a partir de `reportedBalances` (saldos digitados por
  wallet). O valor manual nao entra nesse payload, em nenhum campo.
- Nenhuma `wallet_transaction`, `bankroll_snapshot` ou saldo de wallet muda por
  causa do ajuste.
- Consequencia declarada: apos um ajuste, `grind_sessions.wallet_profit_usd`
  pode divergir da soma dos deltas de wallet da mesma sessao. E esperado — a
  banca continua sendo a fonte de verdade do dinheiro; a sessao passa a carregar
  o numero que o jogador declarou.
- A ordem do fluxo nao muda: reconciliacao inline primeiro
  (`guardAndReconcile`), depois `onEndSession`.

**Criterio de aceitacao:**
- [ ] Ajustar o resultado e finalizar: o payload de `reconcile-wallets` e
      identico ao do mesmo cenario sem ajuste.
- [ ] Ajustar sem tocar em nenhum saldo de wallet nao dispara reconciliacao
      (regra atual "sem mudancas -> skip" preservada).

---

### RF-06: Telemetria do ajuste
**Descricao:** Como D2 dispensa coluna de auditoria, o rastro fica em telemetria.

**Regras de negocio:**
- Evento `session_result_manual_override` emitido no clique de "Finalizar
  Sessao", **somente** quando ha ajuste ativo, via o `safeTrack` ja existente no
  modal (nunca lanca para o usuario).
- Payload: `{ sessionId, computedProfitUsd, manualProfitUsd, deltaUsd,
  investedUsd, roiComputed, roiManual, source: 'wallet' | 'tournaments' }`
  (`source` = qual card estava servindo de base).
- Sem PII; valores ja sao do proprio usuario.

**Criterio de aceitacao:**
- [ ] Finalizar sem ajuste nao emite o evento.
- [ ] Finalizar com ajuste emite uma unica vez, com `deltaUsd = manual -
      computed`.
- [ ] `safeTrack` lancando excecao nao impede a finalizacao.

---

## Requisitos Nao-Funcionais
- **Corretude do dado:** nenhum caminho novo pode produzir `0` para valor
  ausente. Invalido bloqueia a acao; investido zero produz `null` + motivo.
- **Nao-regressao:** com a preferencia OFF (ou campo intocado), o payload do PUT
  e o do reconcile sao byte-a-byte iguais aos de hoje.
- **Performance:** calculo puro no client, sem request adicional. O settings ja e
  buscado pelo `GrindSessionLive`.
- **Seguranca:** o valor so afeta a propria sessao do usuario autenticado; nao ha
  campo novo aceito por endpoint publico alem do que `insertUserSettingsSchema`
  ja valida.
- **Acessibilidade:** input com `<label>` associado; erro de validacao com
  `role="alert"`.

## Endpoints Previstos
| Metodo | Rota | Descricao | Auth | Mudanca |
|---|---|---|---|---|
| GET | /api/user-settings | Le preferencias | JWT | +1 campo na resposta |
| PUT | /api/user-settings | Upsert parcial | JWT | +1 campo aceito |
| PUT | /api/grind-sessions/:id | Finaliza sessao | JWT | valores de `profit`/`roi`/`walletProfitUsd` passam a poder vir do ajuste manual; **sem campo novo** |
| GET | /api/grind-sessions | Historico | JWT | `roi` passa a poder ser `null` |

Nenhum endpoint novo.

## Modelos de Dados Afetados

### user_settings (alteracao — migration 0100)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| manual_session_result_enabled | boolean | NOT NULL DEFAULT true | Back-fill implicito pelo DEFAULT; additive-only |

Par obrigatorio: `migrations/0100_manual_session_result.sql` +
`migrations/0100_manual_session_result_rollback.sql`. Aplicar no local (psql
:5433) e registrar como **PENDENTE PROD** na secao 6 do `CLAUDE.md`, com a
consequencia: sem ela, `GET/PUT /api/user-settings` quebra com
`column "manual_session_result_enabled" does not exist`.

### grind_sessions (sem alteracao de schema)
`profit`, `roi`, `wallet_profit_usd` passam a poder carregar valor declarado pelo
jogador. `wallet_profit_usd` muda de semantica (RF-04) — comentario do schema e
`data-model-index.md` precisam refletir isso.

## Integracoes Externas
Nenhuma.

## Cenarios de Teste Derivados

### Happy path
- [ ] Preferencia ON, sessao com wallets: ajustar de `+$180` para `+$250` ->
      cards mostram `+$250` e ROI recalculado; PUT grava os tres campos.
- [ ] Preferencia ON, sessao sem wallets: base e o card "Profit"; ajuste grava
      `profit` + `roi` + `walletProfitUsd`.
- [ ] Preferencia ON, jogador nao toca no campo -> payload identico ao atual.

### Toggle / preferencia
- [ ] Default ON para usuario novo e para usuario legado sem a coluna setada.
- [ ] Desligar em `/configuracoes` -> campo some do modal.
- [ ] PUT parcial do toggle nao apaga `bankrollManagementEnabled` nem
      `exchangeRates`.

### Validacao de input
- [ ] Campo vazio -> "Finalizar Sessao" desabilitado.
- [ ] `abc` / `-` / `1e999` -> erro visivel, sem virar 0, botao desabilitado.
- [ ] `0` e valor valido (sessao que zerou).
- [ ] `-0.01` aceito e exibido como prejuizo.

### Regras de negocio
- [ ] Investido nunca muda com o ajuste.
- [ ] ROI = manual/investido*100, arredondado a 1 casa na exibicao, sem
      arredondar o valor persistido.
- [ ] Investido `0` -> ROI `—` e `roi: null` no PUT.
- [ ] Payload de `reconcile-wallets` inalterado pelo ajuste (RF-05).

### Edge cases
- [ ] Ajuste + plataformas sem wallet (`hasMissing`): o skip de reconciliacao
      continua funcionando e o valor manual e persistido.
- [ ] Ajuste + 409 `already_reconciled`: finaliza normalmente com o valor manual.
- [ ] PUT falha -> modal reabre com o valor digitado preservado.
- [ ] Duplo clique em "Finalizar Sessao" -> um unico PUT (guard `isEndingRef` ja
      existe) e um unico evento de telemetria.
- [ ] `usdConversionRates` ausente: o pre-preenchimento cai no comportamento atual
      do card; o ajuste manual continua funcionando (valor e USD por definicao).

## Fora de Escopo
- Ajuste por wallet ou por moeda nativa — o campo e um unico valor em USD.
- Trilha de auditoria (coluna `profit_auto` / flag `manual_override`), reversao
  posterior ou badge "ajustado" no historico. Decisao D2.
- Alterar saldo de wallet, `wallet_transactions` ou `bankroll_snapshots`.
- Ajustar `volume`, `abiMed`, `fts`, `cravadas` ou medias mentais.
- Mudar o ROI de torneio no Dashboard/Library (fonte `tournaments`, §6.1).
- Retroatividade: sessoes ja finalizadas continuam sendo corrigidas pelo
  `EditSessionDialog` existente.
- Gate por tier/plano.

## Dependencias
- Migration `0100` aplicada no local antes de qualquer teste de integracao de
  settings.
- `insertUserSettingsSchema` atualizado — sem isso o `PUT /api/user-settings`
  inteiro passa a falhar (o handler faz `.parse` do merge).

## Notas de Implementacao
- Helper puro primeiro (`manual-session-result.ts`), com teste unitario proprio;
  o modal so consome.
- `data-testid` estaveis: `manual-session-result-toggle` (acao "Ajustar"),
  `manual-session-result-input`, `manual-session-result-reset`,
  `manual-session-result-error`, `session-result-adjusted-badge`,
  `settings-toggle-manual-session-result` (lesson #2).
- Hooks antes de qualquer early return — `SessionSummaryModal` ja tem
  `if (!show || !summaryData) return null` depois dos hooks; manter (lesson #1).
- Cores por `tokens.color.delta`, que tem shape proprio e nao entra em `ColorKey`
  (lesson #22).
- Testes de componente com `await import(...)`, nunca `require()` (lessons
  #14/#26); nao misturar os dois estilos no mesmo arquivo (lesson #38).
- Sem emoji em codigo (hook bloqueia).
