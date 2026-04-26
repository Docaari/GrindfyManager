# Spec: Reconciliacao de Banca ao Fim da Sessao

## Status
Proposta

## Resumo
Adiciona um passo INTERMEDIARIO obrigatorio porem skipavel entre o clique em "Encerrar Sessao" e a abertura do `SessionSummaryModal`: um novo dialog `WalletReconciliationDialog` onde o jogador confirma o saldo final REAL observado em cada plataforma (wallet) que teve atividade na sessao. Cada divergencia (`delta = saldoReportado - saldoAtualWallet`) gera automaticamente uma `wallet_transaction` com `reason='session_result'`, `source='auto_session'`, vinculada ao `sessionId`. Reusa a infra de optimistic concurrency entregue em ADR-038 (Sprint Bankroll-2.1) e a persistencia transacional do `walletService.recordTransaction`.

## Contexto
Hoje os saldos das wallets durante uma sessao sao **estimativas** — soma do `buyIn`, `winnings` e `bounty` de `session_tournaments` registrados manualmente ou importados. Multiplas fontes de divergencia existem na pratica:
- Rebuy ou add-on nao logado (jogador esquece de clicar).
- ICM deal final-table que distorce o `winnings` reportado vs. saldo real recebido.
- Side action / staking off-the-books que nao deveria estar na wallet mas esta.
- Fee da sala, bonus surpresa, glitch da plataforma, ajuste de torneio cancelado.

Hoje o sistema confia 100% no acumulado calculado, e qualquer divergencia se acumula silenciosamente. Em 30/60 dias o dashboard de bankroll mostra um numero diferente do real. **Verdade de campo (jogador olhando a sala) deve vencer.**

Esta spec **nao** muda a forma como `session_tournaments` sao registrados durante a sessao — apenas adiciona um passo de reconciliacao opcional ao final. Reusa 100% do ledger imutavel (ADR-017), do `walletService.recordTransaction` com `SELECT FOR UPDATE`, e do optimistic concurrency (ADR-038).

Sprint imediatamente anterior: **Bankroll-3 "Reportar rakeback"** (commit `9f6939d`).

## Usuarios

- **Jogador (player):** termina a sessao, clica "Encerrar Sessao". Sistema mostra dialog listando as wallets que tiveram atividade. Para cada wallet: ele abre a sala, ve o saldo, digita. ~10-30s no total (1 a N wallets). Ou clica "Sem ajuste" se nao quer reconciliar agora.
- **Jogador (auditoria futura):** consulta historico filtrando por `source='auto_session'` ou por `reason='session_result'` para entender quanto o sistema "corrigiu" automaticamente em sessoes passadas e calibrar disciplina de logging.

### Glossario
- **Saldo reportado:** valor que o jogador digita no dialog, observando a sala/banca diretamente. Verdade de campo.
- **Saldo atual da wallet:** valor que o sistema acredita ter (acumulado de movimentos previos). Estimativa.
- **Delta:** `saldoReportado - saldoAtualWallet`. Pode ser positivo (wallet "ganhou" mais que o sistema sabia), negativo (wallet "perdeu" mais), ou zero.
- **Ajuste auto / auto_session:** transacao gerada automaticamente pela reconciliacao (vs. manual via `WalletTransactionDialog`). Marca de origem = `source='auto_session'`.
- **Idempotencia da reconciliacao:** dada uma `sessionId`, o sistema garante que reconciliacao nao seja persistida em duplicidade (ex: usuario clica F5 ou abre 2 abas). Chave: `(sessionId, source='auto_session')` ja existe → skip.
- **Verdade de campo:** principio de que o numero observado pelo jogador na sala vence sobre qualquer estimativa do sistema. Sistema nao argumenta nem oferece "voce tem certeza?".

## Requisitos Funcionais

### RF-01: Hook do passo de reconciliacao no `handleEndSession`
**Descricao:** Apos o PUT bem-sucedido em `/api/grind-sessions/:id` com `status=completed`, em vez de abrir diretamente `SessionSummaryModal`, abrir primeiro o `WalletReconciliationDialog`. Ao concluir (submit ou skip) abre-se entao o `SessionSummaryModal`.
**Regras de negocio:**
- Se `eligibleWallets.length === 0` (sessao sem nenhuma wallet com atividade), pular dialog → abrir `SessionSummaryModal` direto.
- Se ja existe reconciliacao persistida para esta `sessionId` (RF-08, idempotencia), pular dialog e mostrar toast "Sessao ja foi reconciliada anteriormente" → abrir `SessionSummaryModal`.
- Em caso de erro fatal abrindo o dialog (ex: `GET /api/grind-sessions/:id/reconcilable-wallets` falha), logar console.error, mostrar toast e seguir direto para o summary (nao bloqueia o fluxo de fim de sessao).
**Criterio de aceitacao:**
- [ ] PUT `status=completed` retorna 200 → dialog abre antes do summary.
- [ ] Sessao sem wallets com atividade → dialog NAO abre, summary direto.
- [ ] Reconciliacao ja persistida → dialog NAO abre, toast informativo, summary direto.
- [ ] Falha do endpoint de wallets elegiveis → toast de erro + summary direto (nao bloqueia).

### RF-02: Listagem de wallets elegiveis no dialog
**Descricao:** O dialog mostra uma linha por wallet ATIVA que teve transacao vinculada a `sessionId` durante a sessao. Toggle opcional "Mostrar todas as wallets ativas" inclui wallets sem atividade (uso: jogador conferiu rapido todas).
**Regras de negocio:**
- Default: lista apenas `wallets` com `status='active'` que tem >=1 `wallet_transaction` com `sessionId === activeSession.id`.
- Toggle "Mostrar todas as wallets ativas" → inclui tambem wallets `status='active'` sem atividade na sessao (saldo = saldo conhecido atual; usuario pode reportar valor diferente).
- Wallets `status='archived'` NUNCA aparecem (mesmo com atividade na sessao — caso bizarro de archive durante sessao).
- Cada linha exibe: (a) nome da wallet + bandeira/icone da rede; (b) `nativeCurrency`; (c) "Saldo atual conhecido" formatado; (d) input "Saldo final reportado" pre-preenchido com o saldo conhecido; (e) preview de delta em tempo real (verde/vermelho/cinza).
- Wallets fora da lista atual nao podem ser adicionadas via UI (sem campo "adicionar wallet"). Se jogador quer reconciliar wallet sem atividade, usa o toggle.
**Criterio de aceitacao:**
- [ ] Endpoint `GET /api/grind-sessions/:id/reconcilable-wallets?includeAll=false` retorna apenas wallets ativas com atividade na sessao.
- [ ] Endpoint com `includeAll=true` retorna todas as wallets ativas do usuario.
- [ ] Toggle no dialog faz refetch com novo `includeAll` flag.
- [ ] Cada linha mostra os 5 campos listados.
- [ ] Wallet archived nao aparece em nenhum modo.

### RF-03: Input "Saldo final reportado" e preview de delta
**Descricao:** Para cada wallet listada, input numerico no `nativeCurrency` da wallet com preview de delta em tempo real.
**Regras de negocio:**
- Aceita numero positivo, zero ou negativo (wallet pode ficar negativa; mesmo warning do `WalletTransactionDialog` aplica).
- Aceita ate 2 casas decimais; mais sao truncadas (alinhar com pattern do projeto).
- **Valor com mais de 2 casas decimais** truncado/bloqueado pelo input.
- Preview de delta:
  - `delta > 0` → label "+{delta} (entrada extra)" em verde.
  - `delta < 0` → label "{delta} (saida extra)" em vermelho.
  - `|delta| < 0.01` → label "Sem ajuste" em cinza; linha marcada como skipada (nao gera tx no submit).
- Pre-preenchimento: `reportedBalance` default = `wallet.balance` (saldo atual). Usuario sobrescreve.
- Mostrar `nativeCurrency` como prefixo/suffix (R$, USD, EUR, CNY).
**Criterio de aceitacao:**
- [ ] Input rejeita texto nao numerico.
- [ ] Preview atualiza em tempo real conforme digitacao.
- [ ] Cores e labels conforme regra acima.
- [ ] Linhas com `|delta| < 0.01` sao filtradas no submit (nao geram tx).
- [ ] Pre-preenchimento com `wallet.balance` no mount.

### RF-04: Submit em batch via `POST /api/grind-sessions/:id/reconcile-wallets`
**Descricao:** Botao primario "Confirmar e gerar ajustes" envia em uma unica requisicao a lista de ajustes (apenas linhas com `|delta| >= 0.01`).
**Regras de negocio:**
- Body: `{ adjustments: Array<{ walletId: string; reportedBalance: number; expectedPreviousBalance: number }> }`.
- `expectedPreviousBalance` = saldo da wallet no momento de abrir o dialog (snapshot capturado no mount, igual a `wallet.balance` na resposta de `GET /reconcilable-wallets`).
- Backend itera os ajustes:
  - Para cada um, calcula `delta = reportedBalance - expectedPreviousBalance` no servidor (autoritativo; nao confia no calculo do cliente).
  - Se `|delta| < 0.01` → ignora silenciosamente (skip; nao retorna erro).
  - Caso contrario, chama `walletService.recordTransaction` com:
    - `walletId`
    - `direction = delta > 0 ? 'in' : 'out'`
    - `nativeAmount = Math.abs(delta)`
    - `reason = 'session_result'`
    - `source = 'auto_session'` (RF-09 — novo campo de origem)
    - `sessionId = activeSession.id`
    - `expectedPreviousBalance = adjustment.expectedPreviousBalance`
    - `note = 'Reconciliacao automatica fim de sessao'`
    - `occurredAt = now()`
- **Atomicidade:** cada wallet eh uma TX independente. Em caso de falha em uma (ex: 409 balance_mismatch), as anteriores PERMANECEM persistidas (fail-fast no primeiro erro; resposta carrega `txCreated[]` ate o erro + `failedAt: { walletId, error }`).
- Cliente trata erro: refetch wallets elegiveis (recapturando novos `expectedPreviousBalance`) + remount do dialog com os ajustes ainda pendentes ja preenchidos (reportedBalance preservado, deltas recomputados).
- Resposta de sucesso (200): `{ txCreated: Array<WalletTransaction>, skipped: number }` (skipped = quantos vieram com delta zero).
**Criterio de aceitacao:**
- [ ] Submit com 3 ajustes validos → 3 transacoes criadas + resposta 200 com `txCreated.length === 3`.
- [ ] Submit com 1 delta zero entre 3 ajustes → backend ignora silenciosamente; resposta 200 `txCreated.length === 2, skipped === 1`.
- [ ] Submit que falha na 2a wallet por 409 → 1a tx persistida; resposta 409 carrega `{ code: 'balance_mismatch', txCreated: [tx1], failedAt: { walletId, currentBalance } }`.
- [ ] Cliente em 409 mostra alerta inline + refetch + dialog continua aberto com ajustes pendentes.

### RF-05: Botao "Sem ajuste" / skip total
**Descricao:** Botao secundario "Sem ajuste" fecha o dialog sem chamar `/reconcile-wallets`. Sessao prossegue para `SessionSummaryModal`.
**Regras de negocio:**
- Nao gera nenhuma transacao.
- Nao marca a sessao como "ja reconciliada" (idempotencia RF-08 nao atinge — o usuario poderia, em teoria, reabrir manualmente, mas RF-08 impede; o que NAO acontece eh persistir um marker).
- Telemetria registra o skip (RF-12).
- Aviso explicito no botao (tooltip ou texto pequeno): "Sessao sera fechada sem reconciliar wallets. Voce pode revisar manualmente em Bankroll depois."
**Criterio de aceitacao:**
- [ ] Botao "Sem ajuste" fecha o dialog sem chamar o endpoint.
- [ ] Nenhuma `wallet_transaction` criada.
- [ ] `SessionSummaryModal` abre normalmente apos.

### RF-06: Optimistic concurrency reusada
**Descricao:** Cada ajuste carrega `expectedPreviousBalance` (ADR-038). Backend valida em `walletService.recordTransaction` apos `SELECT FOR UPDATE`. Divergencia → 409 `balance_mismatch`.
**Regras de negocio:**
- `expectedPreviousBalance` capturado no momento de carregar `GET /reconcilable-wallets` (cliente nao toca; backend devolve no payload e cliente reenvia).
- Se 409 ocorrer, cliente refetch automaticamente o endpoint e remonta o dialog (RF-04 ja descreve fluxo).
- Validacao no backend reusa primitive existente (sem re-implementacao).
**Criterio de aceitacao:**
- [ ] Body POST contem `expectedPreviousBalance` para cada ajuste.
- [ ] Backend rejeita ajuste cuja wallet tem balance diferente (epsilon 0.01) com 409 `balance_mismatch`.
- [ ] Cliente refetch + remount preserva `reportedBalance` digitado mas recomputa delta.

### RF-07: Validacao de input (cliente + servidor)
**Descricao:** Garantir que apenas ajustes coerentes sejam aceitos.
**Regras de negocio:**
- `walletId` deve pertencer ao usuario autenticado (`wallet.userId === req.user.userPlatformId`); caso contrario 404 (mascarado por seguranca).
- `walletId` deve estar em `status='active'`; archived → 422 `{code: 'wallet_archived', walletId}`.
- `reportedBalance` deve ser numero finito (rejeita NaN/Infinity); 422 `{code: 'invalid_reported_balance'}`.
- `reportedBalance` permite negativo (wallet pode ficar negativa).
- `expectedPreviousBalance` obrigatorio quando `walletId` esta no body; ausencia → 400 `{code: 'missing_expected_balance'}`.
- `adjustments` array nao vazio; 400 `{code: 'empty_adjustments'}` se vazio. (Cliente nao deveria submeter array vazio — usaria "Sem ajuste".)
- `sessionId` da URL deve existir e pertencer ao usuario; 404 caso contrario.
- Cada `walletId` aparece no maximo 1x no array; duplicata → 400 `{code: 'duplicate_wallet'}`.
- Backend ignora ajustes com `|delta| < 0.01` (RF-04, sem erro).
**Criterio de aceitacao:**
- [ ] Wallet de outro usuario → 404.
- [ ] Wallet archived → 422 `wallet_archived`.
- [ ] `reportedBalance = NaN` → 422 `invalid_reported_balance`.
- [ ] `expectedPreviousBalance` ausente → 400 `missing_expected_balance`.
- [ ] `adjustments = []` → 400 `empty_adjustments`.
- [ ] Mesmo `walletId` 2x no array → 400 `duplicate_wallet`.
- [ ] `sessionId` inexistente → 404.

### RF-08: Idempotencia da reconciliacao
**Descricao:** Reconciliacao para uma `sessionId` so pode ser persistida 1x. Tentativa subsequente eh detectada e bloqueada.
**Regras de negocio:**
- Antes de iterar os ajustes, backend executa: `SELECT id FROM wallet_transactions WHERE session_id = :sessionId AND reason = 'session_result' AND source = 'auto_session' LIMIT 1`.
- Se ja existe pelo menos 1 row → retornar 409 `{code: 'already_reconciled', existingCount: <n>}` SEM criar nada novo.
- Frontend trata 409 `already_reconciled` distintamente de 409 `balance_mismatch`: mostra toast "Esta sessao ja foi reconciliada" + fecha dialog + segue para summary.
- Tambem checado em RF-01 (preflight no `handleEndSession`) para evitar abrir dialog desnecessariamente.
**Criterio de aceitacao:**
- [ ] 2a chamada de `POST /reconcile-wallets` para mesma `sessionId` → 409 `already_reconciled`.
- [ ] Frontend trata o codigo distintamente do `balance_mismatch`.
- [ ] Preflight em RF-01 evita abrir dialog se `existingCount > 0`.

### RF-09: Reuso da coluna existente `wallet_transactions.source`
**Descricao:** **Sem schema delta.** Reusa a coluna `wallet_transactions.source: varchar notNull default 'manual'` ja existente (entregue na Sprint Bankroll-2, RF-05). Reconciliation transactions gravam `source='auto_session'` — valor ja presente no enum `WALLET_TX_SOURCES = ['manual', 'auto_session', 'migration_v1', 'auto_import_csv']` em `shared/wallet-reasons.ts`. Sem migration. Sem alteracao de Zod. Sem alteracao de Drizzle table.
**Regras de negocio:**
- Coluna `source` ja existe (`shared/schema.ts` linha 2390); enum `WalletTxSource` ja exportado em `shared/wallet-reasons.ts`.
- `walletService.recordTransaction` ja aceita `source` no input (entregue em Bankroll-2). Reconciliation passa `source: 'auto_session'` direto.
- Default da coluna em rows manuais permanece `'manual'` (mantido pelo schema existente).
- Helper `transactionSourceLabel(source)` em `client/src/lib/bankrollHelpers.ts` (criar se nao existir): `'manual' → "Manual"`, `'auto_session' → "Reconciliacao automatica"`, demais valores → label generico `"Automatica"`.
- Historico (`BankrollHistoryTable`, `WalletDetailPanel`) exibe badge "Auto" pequeno ao lado do reason quando `source !== 'manual'`.
- Filtro futuro em historico podera usar essa coluna; nao incluido nesta spec.
**Criterio de aceitacao:**
- [ ] Reconciliacao automatica grava EXATAMENTE `source='auto_session'` (nao `'reconciliation'` nem outro valor novo).
- [ ] Schema `wallet_transactions` permanece igual — sem migration nova, sem coluna nova.
- [ ] `walletService.recordTransaction` continua aceitando `source` opcional ja existente; default `'manual'` preservado.
- [ ] Helper PT-BR + badge no historico funcionam para `source='auto_session'`.
- [ ] Suite existente passa sem alteracao (nenhum teste atual quebra; nenhuma mudanca em Zod ou Drizzle).

### RF-10: Espelhamento em `bankroll_snapshots`
**Descricao:** Cada `wallet_transaction` gerada pela reconciliacao eh espelhada em `bankroll_snapshots` pelo mesmo mecanismo HIGH-5 ja existente (Sprint Bankroll-2).
**Regras de negocio:**
- Sem codigo novo: `walletService.recordTransaction` ja faz o mirror automaticamente.
- `bankroll_snapshots.reason = 'session_result'` para essas rows.
- ADR-017 (snapshot[n+1].previous == snapshot[n].new) preservado.
**Criterio de aceitacao:**
- [ ] Apos reconciliacao com 2 ajustes, ha 2 rows novas em `bankroll_snapshots`.
- [ ] `previous` e `new` consecutivos batem por wallet.

### RF-11: i18n PT-BR
**Descricao:** Toda copy nova em PT-BR.
**Regras de negocio:**
- Titulo dialog: "Reconciliar saldo das carteiras".
- Subtitulo: "Confira o saldo final em cada plataforma. Se houver divergencia, sera registrada como ajuste de sessao."
- Linha: "{walletName} - Saldo atual conhecido: {amount}".
- Input: "Saldo final reportado".
- Preview: "+{delta} (entrada extra)" / "{delta} (saida extra)" / "Sem ajuste".
- Botoes: "Confirmar e gerar ajustes" / "Sem ajuste".
- Toggle: "Mostrar todas as wallets ativas".
- Toast sucesso: "{n} ajuste(s) registrado(s)" ou "Nenhum ajuste necessario".
- Toast idempotencia: "Esta sessao ja foi reconciliada anteriormente".
- Alerta 409 `balance_mismatch`: "O saldo da carteira {walletName} mudou em outra aba. Atualizando...".
- Alerta 422 `wallet_archived`: "Carteira {walletName} foi arquivada. Removendo da lista.".
**Criterio de aceitacao:**
- [ ] Nenhuma string hardcoded em ingles na UI nova.
- [ ] Mensagens de erro tambem em PT-BR.

### RF-12: Telemetria
**Descricao:** 3 eventos no telemetry adapter existente (mesmo padrao Tournament Selector / Rakeback).
**Regras de negocio:**

| Evento | Quando | Payload |
|---|---|---|
| `reconcile_dialog_view` | `WalletReconciliationDialog` monta | `{ sessionId, eligibleWalletsCount, includeAll: boolean }` |
| `reconcile_submit_success` | POST 2xx | `{ sessionId, adjustmentsCount, txCreatedCount, skippedCount, totalDeltaUsdEstimate? }` |
| `reconcile_submit_error` | POST 4xx/5xx | `{ sessionId, errorCode, httpStatus, failedAtWalletId? }` |
| `reconcile_skip_total` | usuario clica "Sem ajuste" | `{ sessionId, eligibleWalletsCount }` |

- `totalDeltaUsdEstimate` opcional (nao bloqueante): soma absoluta dos deltas, convertida para USD pelo `fxRate` do snapshot. Se conversao falhar, omitir o campo.
- **Sem PII** (sem `note`, sem nomes de wallet alem de `walletId`).
**Criterio de aceitacao:**
- [ ] Os 4 eventos disparam nos momentos corretos.
- [ ] Payloads sem PII.
- [ ] Telemetria desabilitada por feature flag respeitada.

## User Stories (Given/When/Then)

### US-01: Happy path — reconciliar 2 wallets com delta nao-zero
**Given** sessao ativa `S1` com transacoes em wallet PokerStars BRL e GG USD,
**E** PokerStars BRL tem `balance=1180.00`, sessao registrou `+50` (saldo conhecido = 1230),
**E** GG USD tem `balance=200.00`, sessao registrou `-30` (saldo conhecido = 170),
**When** usuario clica "Encerrar Sessao",
**Then** dialog abre com 2 linhas (PokerStars 1230 e GG 170),
**And** usuario digita `1247.00` em PokerStars (delta `+17`) e `165.00` em GG (delta `-5`),
**And** clica "Confirmar e gerar ajustes",
**Then** POST cria 2 transacoes (`session_result`+`auto_session`+`sessionId=S1`),
**And** PokerStars BRL fica com `balance=1247.00`, GG USD com `balance=165.00`,
**And** `SessionSummaryModal` abre com profit/ROI recalculados.

### US-02: Skip total — usuario nao quer reconciliar
**Given** sessao ativa `S1` com transacoes em 1 wallet,
**When** usuario clica "Encerrar Sessao", dialog abre, clica "Sem ajuste",
**Then** dialog fecha, NENHUMA transacao criada,
**And** `SessionSummaryModal` abre normalmente,
**And** evento `reconcile_skip_total` enviado.

### US-03: Algumas wallets sem ajuste, outras com
**Given** sessao com 3 wallets, jogador digita saldo igual ao conhecido em 1 e diferente em 2,
**When** clica "Confirmar",
**Then** body POST envia 3 itens, mas backend cria apenas 2 transacoes (a com delta zero eh ignorada server-side),
**And** resposta `{ txCreated: 2 itens, skipped: 1 }`,
**And** toast "2 ajustes registrados".

### US-04: 409 balance_mismatch (race entre abas)
**Given** dialog aberto com `expectedPreviousBalance=1180` para PokerStars BRL,
**When** outra aba registra deposito de R$100 → wallet vai a 1280,
**And** usuario submete `reportedBalance=1247` (esperando delta `+67`),
**Then** backend responde 409 `{code: 'balance_mismatch', failedAt: { walletId, currentBalance: 1280 }}`,
**And** cliente faz refetch `GET /reconcilable-wallets`,
**And** dialog remonta com novo `expectedPreviousBalance=1280`,
**And** input mantem `1247` digitado (mas delta agora eh `-33`),
**And** alerta inline mostra "O saldo da carteira PokerStars mudou. Saldo atual: R$ 1.280. Confira e re-submeta.".

### US-05: 409 already_reconciled (idempotencia)
**Given** sessao `S1` ja teve reconciliacao persistida (1 ou mais tx com `auto_session`),
**When** usuario fecha sessao novamente (ex: reabriu o flow por alguma razao) e clica "Confirmar",
**Then** backend responde 409 `{code: 'already_reconciled', existingCount: 2}`,
**And** cliente fecha dialog, mostra toast "Sessao ja foi reconciliada",
**And** abre `SessionSummaryModal`.

### US-06: Wallet archived durante o dialog
**Given** dialog aberto com 2 wallets,
**When** outra aba arquiva a wallet GG USD,
**And** usuario submete ajustes,
**Then** backend processa wallet PokerStars normal, mas para GG retorna 422 `{code: 'wallet_archived', walletId: GGid}`,
**And** cliente mostra alerta "Carteira GG USD foi arquivada. Removendo da lista.",
**And** GG eh removida do dialog,
**And** PokerStars permanece com a tx ja criada (atomicidade por wallet).

### US-07: Sessao sem nenhuma wallet com atividade (toggle off)
**Given** sessao `S1` sem `session_tournaments` em wallets do usuario (ex: sessao apenas registrada para timer),
**When** usuario clica "Encerrar Sessao",
**Then** RF-01 detecta `eligibleWallets.length === 0`,
**And** dialog NAO abre,
**And** `SessionSummaryModal` abre direto.

## Edge Cases

- **Sessao sem wallets com atividade + toggle "todas wallets ativas":** dialog NAO abre por default (RF-01); usuario pode revisar wallets manualmente em `/bankroll` se quiser.
- **Wallet com balance=0 e usuario digita saldo positivo:** funciona — cria tx `direction='in'` com `nativeAmount = reportedBalance`.
- **Wallet com balance positivo e usuario digita 0:** cria tx `direction='out'` com `nativeAmount = oldBalance`.
- **Cross-currency:** **fora de escopo.** Input sempre no `nativeCurrency` da wallet listada.
- **Valor com mais de 2 casas decimais:** truncado para 2 (alinhar com `WalletTransactionDialog`).
- **Conexao cai no meio do submit (timeout):** cliente nao sabe se persistiu; ao retentar pode bater idempotencia (RF-08) — comportamento correto.
- **Multiplas sessoes nao encerradas (raro):** spec presume `activeSession.id` unica; reconciliacao opera apenas sobre a sessao que esta sendo encerrada agora.
- **Wallet nativeCurrency mudou:** nao acontece — wallets sao imutaveis quanto a moeda.
- **Reconciliacao + posterior edicao manual:** edicao manual depois cria nova tx normal (nao toca a tx `auto_session` ja persistida — ledger imutavel ADR-017).
- **Toggle "todas wallets" + clica em "Confirmar" sem digitar nada:** todas linhas com delta zero (pre-preenchimento = balance atual). Backend ignora todas → resposta 200 `{ txCreated: [], skipped: N }` → toast "Nenhum ajuste necessario" + summary abre.
- **`reportedBalance` igual a `expectedPreviousBalance` mas wallet mudou no servidor:** backend recalcula `delta = reportedBalance - currentBalanceServer` (se diferente do client-side), gera 409 `balance_mismatch` antes de criar tx. Cliente refetch — fluxo padrao.

## API Delta

### Novo endpoint `GET /api/grind-sessions/:id/reconcilable-wallets`
**Auth:** requireAuth + ownership da sessao.
**Query:** `?includeAll=true|false` (default false).
**Response 200:**
```json
{
  "sessionId": "ses_abc123",
  "alreadyReconciled": false,
  "wallets": [
    {
      "walletId": "wal_xyz",
      "name": "PokerStars BR",
      "nativeCurrency": "BRL",
      "balance": 1180.00,
      "expectedPreviousBalance": 1180.00,
      "hadActivityInSession": true
    },
    {
      "walletId": "wal_def",
      "name": "GG USD",
      "nativeCurrency": "USD",
      "balance": 200.00,
      "expectedPreviousBalance": 200.00,
      "hadActivityInSession": true
    }
  ]
}
```
**Response 200 (alreadyReconciled):**
```json
{
  "sessionId": "ses_abc123",
  "alreadyReconciled": true,
  "wallets": []
}
```
**Errors:** 404 sessao inexistente / nao do usuario.

### Novo endpoint `POST /api/grind-sessions/:id/reconcile-wallets`
**Auth:** requireAuth + ownership + rate limit (`walletLimiter` reusado).
**Body:**
```json
{
  "adjustments": [
    {
      "walletId": "wal_xyz",
      "reportedBalance": 1247.00,
      "expectedPreviousBalance": 1180.00
    },
    {
      "walletId": "wal_def",
      "reportedBalance": 165.00,
      "expectedPreviousBalance": 200.00
    }
  ]
}
```

**Response 200:**
```json
{
  "txCreated": [
    { "id": "tx_1", "walletId": "wal_xyz", "direction": "in", "nativeAmount": 67.00, ... },
    { "id": "tx_2", "walletId": "wal_def", "direction": "out", "nativeAmount": 35.00, ... }
  ],
  "skipped": 0
}
```

**Response 400:**
- `{code: 'empty_adjustments'}` — array vazio.
- `{code: 'duplicate_wallet', walletId}` — mesma wallet 2x.
- `{code: 'missing_expected_balance', walletId}` — campo ausente.

**Response 404:**
- Sessao inexistente / nao do usuario.
- Wallet inexistente / nao do usuario (mascarado por seguranca).

**Response 409:**
- `{code: 'already_reconciled', existingCount: N}` — RF-08, sessao ja reconciliada.
- `{code: 'balance_mismatch', failedAt: { walletId, currentBalance }, txCreated: [tx ja criadas antes da falha]}` — wallet com balance divergente.

**Response 422:**
- `{code: 'wallet_archived', walletId}` — wallet arquivada.
- `{code: 'invalid_reported_balance', walletId}` — NaN/Infinity.

### Endpoints inalterados
- `PUT /api/grind-sessions/:id` (status=completed) continua funcionando como hoje. Apenas o cliente passa a chamar `/reconcile-wallets` apos.
- `POST /api/wallets/:id/transactions` continua aceitando o mesmo schema; nao usado por este flow (reconciliacao usa o endpoint de batch).

## Modelos de Dados Afetados

**Sem schema delta — reusa `wallet_transactions.source` ja existente.**

A coluna `wallet_transactions.source: varchar notNull default 'manual'` ja foi entregue na Sprint Bankroll-2 (`shared/schema.ts` linha 2390). O enum `WALLET_TX_SOURCES = ['manual', 'auto_session', 'migration_v1', 'auto_import_csv']` ja esta exportado em `shared/wallet-reasons.ts`. Esta spec reusa o valor `'auto_session'` ja existente — sem migration, sem coluna nova, sem novo enum.

`wallets`, `bankroll_snapshots`, `grind_sessions`, `wallet_transactions` permanecem identicos a todos os efeitos de schema.

Arquivos tocados (sem alterar shape de tabelas/Zod):
| Arquivo | Mudanca |
|---|---|
| `shared/wallet-reasons.ts` | Nenhuma — `WALLET_TX_SOURCES` e `WalletTxSource` ja contem `'auto_session'`. |
| `shared/schema.ts` | Nenhuma — coluna `source` ja existe. |
| `server/services/walletService.ts` | Nenhuma alteracao de signature — handler de reconciliacao apenas passa `source: 'auto_session'` no input ja aceito. |
| `client/src/lib/bankrollHelpers.ts` | Adicionar (ou estender) `transactionSourceLabel(source: WalletTxSource): string` mapeando `'auto_session' → "Reconciliacao automatica"`. |

## Cenarios de Teste Derivados

### Happy Path (server)
- [ ] POST com 2 ajustes validos → 2 transacoes criadas com `reason='session_result'`, `source='auto_session'`, `sessionId` correto.
- [ ] Espelhamento em `bankroll_snapshots` ocorre para cada tx.
- [ ] Saldo final da wallet = `reportedBalance`.
- [ ] `txCreated[].direction` correto conforme sinal de delta.

### Happy Path (client)
- [ ] Dialog abre apos `handleEndSession` com PUT 200.
- [ ] Lista renderiza wallets com atividade na sessao.
- [ ] Toggle "Mostrar todas wallets ativas" dispara refetch.
- [ ] Preview de delta atualiza em tempo real.
- [ ] Submit chama endpoint correto + invalida queries `['wallets']` e `['wallets', id, 'transactions']`.
- [ ] Apos submit, `SessionSummaryModal` abre.

### Validacao (server)
- [ ] `adjustments=[]` → 400 `empty_adjustments`.
- [ ] Duplicata `walletId` → 400 `duplicate_wallet`.
- [ ] Falta `expectedPreviousBalance` → 400 `missing_expected_balance`.
- [ ] `reportedBalance=NaN` → 422 `invalid_reported_balance`.
- [ ] Wallet de outro usuario → 404.
- [ ] Wallet archived → 422 `wallet_archived`.
- [ ] Sessao inexistente → 404.
- [ ] Delta zero (epsilon 0.01) → ignorado, contabiliza em `skipped`.

### Regras de Negocio (server)
- [ ] `source='auto_session'` registrado na coluna nova.
- [ ] `sessionId` registrado em `wallet_transactions`.
- [ ] `note='Reconciliacao automatica fim de sessao'` (ou prefixo padronizado).
- [ ] Ledger imutavel preservado: tentar UPDATE/DELETE da tx falha (ja garantido por ADR-017).

### Optimistic Concurrency (server)
- [ ] `expectedPreviousBalance` divergente → 409 `balance_mismatch` no item, fail-fast.
- [ ] Items anteriores ao falho permanecem persistidos (atomicidade por wallet).
- [ ] Race condition simulada: 2 POSTs simultaneos, segundo recebe 409.

### Idempotencia (server)
- [ ] 2a chamada para mesma `sessionId` → 409 `already_reconciled`.
- [ ] `existingCount` reflete numero correto de tx ja persistidas.
- [ ] Nenhuma tx nova criada na 2a chamada.

### Edge Cases (server)
- [ ] Submit com todas linhas com delta zero → 200 `{ txCreated: [], skipped: N }`.
- [ ] Wallet com balance=0 e `reportedBalance=50` → tx `direction='in'`, `nativeAmount=50`.
- [ ] Wallet com balance=200 e `reportedBalance=0` → tx `direction='out'`, `nativeAmount=200`.
- [ ] Wallet com balance positivo e `reportedBalance` negativo → tx `direction='out'`, `nativeAmount=Math.abs(delta)`.
- [ ] Sessao recem-encerrada sem `session_tournaments` em nenhuma wallet do usuario → endpoint `/reconcilable-wallets?includeAll=false` retorna lista vazia.

### Ownership (server)
- [ ] User A nao consegue reconciliar sessao do user B → 404.
- [ ] User A nao consegue ajustar wallet do user B (mesmo dentro de sessao propria) → 404.

### Backward-Compat (server)
- [ ] Suite existente do `walletService.recordTransaction` (sem `source` no body) continua passando.
- [ ] POST `/api/wallets/:id/transactions` legacy nao quebra (campo `source` opcional).
- [ ] `WalletTxReasonP0Schema.parse({reason: 'session_result'})` continua valido.
- [ ] `db:push` nao detecta nenhum diff de schema apos esta feature (sem coluna nova, sem alteracao de tabela).

### UI / Cliente
- [ ] 409 `balance_mismatch` → refetch + remount + dialog continua aberto.
- [ ] 409 `already_reconciled` → dialog fecha + toast + summary abre.
- [ ] 422 `wallet_archived` → wallet removida da lista + alerta.
- [ ] Skip total → nenhuma chamada a `/reconcile-wallets`.
- [ ] Wallet archived nunca aparece no dialog (mesmo com toggle).
- [ ] Preview de delta com cor correta em cada caso.

### Telemetria (RF-12)
- [ ] `reconcile_dialog_view` dispara no mount com payload correto.
- [ ] `reconcile_submit_success` dispara em 2xx com counts corretos.
- [ ] `reconcile_submit_error` dispara em 4xx/5xx com `errorCode`.
- [ ] `reconcile_skip_total` dispara no botao "Sem ajuste".
- [ ] Nenhum payload contem `note` ou nomes de wallet.

## Telemetria

Ver RF-12 + tabela acima. Padronizado pelo telemetry adapter existente (mesmo modelo Tournament Selector / Rakeback). Sem PII.

## Riscos e Mitigacoes

| Risco | Severidade | Mitigacao |
|---|---|---|
| Usuario reporta saldo errado (digitou virgula errada) | Media | Preview de delta em tempo real (RF-03); confirma visualmente antes de submeter; tx imutavel mas usuario pode criar `manual_adjustment` futuro para corrigir |
| Race entre abas (jogador joga em 2 dispositivos) | Media | Optimistic concurrency RF-06 + refetch + remount RF-04 |
| Reconciliacao em duplicata por F5 / network retry | Alta | Idempotencia RF-08 (chave `sessionId+source='auto_session'`) |
| Friccao no fim da sessao (jogador desiste do flow) | Media | Botao "Sem ajuste" preserva fluxo + aviso explicativo (RF-05) |
| Atomicidade parcial confunde usuario (1 tx criada, outra falhou) | Media | Resposta 409 com `txCreated[]` + `failedAt` claro; cliente mostra status por wallet; documentar em help text |
| Wallet archived no meio do dialog | Baixa | RF-07 422 `wallet_archived` + remove da lista (US-06) |
| Reuso incorreto do enum `source` (valor inventado em vez de `'auto_session'`) | Baixa | RF-09 fixa o valor exato; testes de regressao validam string literal `'auto_session'` em rows criadas pela reconciliacao |
| Cross-currency confunde (rakeback USD numa wallet BRL) | Baixa | Cross-currency fora de escopo; input sempre em `nativeCurrency` da wallet |
| Telemetria com PII | Baixa | Auditoria explicita: payloads em RF-12 nao incluem note nem nomes |

## Metricas de Sucesso

- **Adocao do dialog:** % de sessoes encerradas que abrem o dialog (vs. RF-01 skip por idempotencia ou zero wallets). Meta: > 80% das sessoes encerradas com >=1 wallet com atividade abrem o dialog.
- **Conclusao do dialog:** % das sessoes que abriram dialog e clicaram "Confirmar" (vs. "Sem ajuste"). Meta inicial: > 50% no primeiro mes; meta de longo prazo: > 70% (jogador percebe valor).
- **Volume de ajustes gerados:** numero medio de tx `auto_session` por sessao reconciliada. Sinal de saude: 0 a 2 (se for muito alto, indica que registro durante sessao esta sub-otimo).
- **Delta medio normalizado USD:** mediana de `Math.abs(delta) * fxRate` por reconciliacao. Cair ao longo do tempo = jogador melhorou disciplina de logging em sessao. Subir = sintoma de feature mal entendida ou platforma com glitches frequentes.
- **Taxa de 409 balance_mismatch:** < 1% das requisicoes. Acima disso indica race comum (multi-device) e merece investigacao.
- **Taxa de 409 already_reconciled:** < 0.5%. Acima indica retry/F5 frequente; pode merecer UX de feedback mais claro.
- **Tempo medio dialog → submit:** medir tempo entre `reconcile_dialog_view` e `reconcile_submit_success`. Esperado: 10-45s. Acima de 60s = friccao alta.
- **Skip rate:** % das sessoes com dialog aberto que terminam em "Sem ajuste". Acima de 40% = repensar UX ou copy.

## Fora de Escopo

- **Cross-wallet rebalancing** (mover saldo de uma wallet para outra dentro do dialog) — fora.
- **Importacao automatica de saldo** via API da sala / parser de extrato — fora (sem fonte automatizada hoje).
- **Ajuste retroativo de sessoes passadas** (reabrir sessao concluida e reconciliar) — fora.
- **Conversao automatica de moeda** no input — fora; sempre `nativeCurrency`.
- **Editar/deletar tx de reconciliacao apos persistida** — fora; usa CRUD futuro generico de transactions.
- **Categorizar `bonus`, `milestone`, `tournament_leaderboard`** dentro do flow — fora; rakeback ja tem reason proprio (Sprint Bankroll-3); demais ficam YAGNI.
- **Reconciliacao multi-sessao em batch** (fechar 3 sessoes pendentes de uma vez) — fora.
- **Sugerir saldo via OCR / screenshot da sala** — fora (memory veta desktop agent / OCR).
- **Dashboard agregado de reconciliacao** (por plataforma, % de sessoes ajustadas) — possivel sprint futura.
- **Notificacao push se delta acumulado for grande** — fora.
- **Suporte a v1 de bankroll** (`/api/bankroll/snapshot`, `BankrollMovementDialog`) — em deprecation; ignorar.
- **Mudanca em `SessionSummaryModal`** alem de receber sinal de "reconciliacao concluida" — fora; CTAs de cooldown ja especificados em `Docs/specs/cooldown-refactor-plan.md` para sprint futura.

## Dependencias

- **Sprint Bankroll-2** (multi-wallet v2) — entregue (commit `69c03c7`). Provem `walletService.recordTransaction`, `wallet_transactions`, `bankroll_snapshots`, espelhamento HIGH-5.
- **Sprint Bankroll-2.1** (Reportar saldo + ADR-038 optimistic concurrency) — entregue (commit `3c31b28`). **Obrigatorio.** Provem o primitive `expectedPreviousBalance` que esta spec reusa (RF-06).
- **Sprint Bankroll-3** (Reportar rakeback) — entregue (commit `9f6939d`). Convive sem dependencia direta; apenas valida que enum P0 ja esta consolidado.
- **`grind_sessions` + `session_tournaments`** — schemas existentes, sem alteracao.
- **Telemetry adapter** — existente (Tournament Selector / Rakeback). Reusa sem mudanca.

## Notas de Implementacao (sugestoes)

- **Ordem sugerida de implementacao:**
  1. **(Sem passo de schema/Zod)** — coluna `source` e enum `WalletTxSource = 'auto_session'` ja existem (Sprint Bankroll-2). Pular direto para o backend handler.
  2. Implementar handler `GET /api/grind-sessions/:id/reconcilable-wallets` em `server/routes/grind-sessions.ts` (ou onde estiver o grupo).
  3. Implementar handler `POST /api/grind-sessions/:id/reconcile-wallets` reusando `walletService.recordTransaction` em loop, passando `source: 'auto_session'` (valor ja aceito pelo schema/Zod existente).
  4. `WalletReconciliationDialog` componente isolado em `client/src/components/grind-session-live/WalletReconciliationDialog.tsx`.
  5. Hook `useReconcileWallets` em `client/src/hooks/` com `useMutation` + invalidacoes.
  6. Refatorar `handleEndSession` em `GrindSessionLive.tsx` para inserir o passo intermediario.
  7. Helpers PT-BR (`transactionSourceLabel` em `bankrollHelpers.ts`) + badge "Auto" em `BankrollHistoryTable` / `WalletDetailPanel`.
  8. Telemetria RF-12.
- **Reuso direto do enum existente:** importar `WalletTxSource` de `shared/wallet-reasons.ts` e usar literal `'auto_session'`. Nada de criar nova constante.
- **Atomicidade:** considerar usar uma transaction Postgres por wallet (uma BEGIN/COMMIT por chamada de `walletService.recordTransaction`) e iterar fail-fast no handler. NAO envolver todos os ajustes numa unica transaction Postgres — quebra a semantica de "primeiro ajuste sucedido permanece" descrita em RF-04.
- **Idempotencia (RF-08):** checar `wallet_transactions` por `sessionId + reason='session_result' + source='auto_session'` ANTES de iniciar o loop. Em caso de race (2 requests simultaneos), o segundo vai sobrescrever em vez de duplicar — minimizar via `SELECT FOR UPDATE` da `grind_session` ou via UNIQUE constraint composta. Decisao: rodar SELECT preliminar e aceitar window minimal; conflict subsequente sera detectado por idempotencia em retry.
- **Reconcile dialog timing:** considerar mostrar um `LoadingState` ate o `GET /reconcilable-wallets` retornar; nunca abrir dialog vazio.
- **Pre-preenchimento do input:** capturar `expectedPreviousBalance` no momento da resposta do endpoint (nao recalcular client-side); enviar de volta no submit sem modificacao.
- **Atomicidade x UX:** quando ocorre 409 no item N, tx 1 a N-1 ja persistiram. Cliente deve refletir isso: linhas 1..N-1 ficam disabled (com label "Ajuste registrado"); linha N+ continuam editaveis (recomputar delta). UX evita confundir usuario.
- **Confirm modal extra:** considerar (founder decide) um confirmacao opcional antes de "Confirmar e gerar ajustes" se o delta absoluto exceder threshold (ex: > 20% do balance). Fora desta spec — pode virar quick-win futura.

## Q&A Interno (decisoes do founder)

- **Q1:** Por que verdade de campo do usuario vence sempre, sem o sistema argumentar?
  **R:** O jogador conhece a sala/banca melhor do que o sistema. Sistema so consegue ESTIMAR (acumulado de session_tournaments). O numero real esta na sala. Discutir = adicionar friccao sem ganho. Se o jogador errou (digitou virgula errada), pode corrigir manualmente depois com `manual_adjustment` (CRUD futuro de tx).

- **Q2:** Por que `sessionId` obrigatorio ao gerar a tx?
  **R:** `walletService.recordTransaction` ja valida (linha ~348) que `reason='session_result'` exige `sessionId`. Vincula auditoria, permite filtros futuros (historico por sessao), preserva regra existente. Reusar.

- **Q3:** Por que cross-currency esta fora de escopo? Jogador pode ter rakeback em USD em wallet BRL.
  **R:** Input sempre no `nativeCurrency` da wallet. Misturar moedas no dialog explode complexidade (qual fxRate usar? momento da observacao? snapshot atual?). Caso real: jogador escolhe a wallet certa ou cria uma nova wallet na moeda apropriada. **YAGNI** ate ter caso de uso recorrente.

- **Q4:** Ajuste pode ser zero? E se chegar zero no backend?
  **R:** Filtrado client-side (RF-03 desabilita botao se todas as linhas sao zero — nao, na verdade desabilita `salvar` apenas se TODAS sao zero; linhas individuais com zero passam mas server ignora). Backend ignora silenciosamente delta zero (epsilon 0.01) — nao retorna erro nem cria tx. Contabiliza em `skipped` no response.

- **Q5:** Wallets sem atividade na sessao aparecem por default?
  **R:** **Default: nao.** Apenas wallets que tiveram >=1 `wallet_transaction` com `sessionId === activeSession.id`. Toggle "Mostrar todas as wallets ativas" inclui as demais. **Decisao do founder:** propor toggle (RF-02) — implementer pode mexer no default se UX testing indicar outro caminho. Founder confirma toggle existe.

- **Q6:** Atomicidade total (all-or-nothing) vs fail-fast por wallet?
  **R:** **Fail-fast por wallet.** All-or-nothing exigiria envolver todas em transaction Postgres unica + rollback em 409, perdendo informacao parcial. Fail-fast preserva trabalho ja feito e da UX clara: "ajustei 2/3 wallets, atualize a 3a e re-submeta".

- **Q7:** Botao "Sem ajuste" deveria ter confirmacao ("tem certeza? voce nao podera reabrir")?
  **R:** **Nao.** Tooltip/texto explicativo basta. Confirmacao = friccao. Jogador pode ajustar manualmente em `/bankroll` depois — nao eh decisao destrutiva. Idempotencia (RF-08) so trava re-execucao da reconciliacao, nao impede ajustes manuais futuros.

- **Q8:** Por que reusar `source='auto_session'` em vez de criar coluna ou valor novo?
  **R:** A coluna `wallet_transactions.source` (`varchar notNull default 'manual'`) e o enum `WALLET_TX_SOURCES = ['manual', 'auto_session', 'migration_v1', 'auto_import_csv']` ja foram entregues na Sprint Bankroll-2 (RF-05) — `shared/schema.ts` linha 2390 e `shared/wallet-reasons.ts`. Reusar `'auto_session'` evita migration, evita duplicar enums e mantem a semantica correta: `reason='session_result'` descreve O QUE eh o movimento (resultado de sessao); `source='auto_session'` descreve QUEM gerou (handler de reconciliacao automatica vs. registro manual). Filtros futuros (`source !== 'manual'` para "tudo que veio de automacao") ja sao naturalmente suportados.

- **Q9:** Esta spec impacta `Docs/specs/cooldown-refactor-plan.md`?
  **R:** **Sim — a spec do cooldown precisa ser atualizada** para refletir que entre `handleEndSession` e o cooldown CTAs do summary existe agora um passo de reconciliacao. Esta spec NAO mexe no cooldown; apenas insere `WalletReconciliationDialog` antes do `SessionSummaryModal`. Ajuste textual em `cooldown-refactor-plan.md` fica como tarefa de housekeeping dependente desta spec ser aprovada.

- **Q10:** Por que nao reusar `POST /api/wallets/:id/transactions` (1 chamada por wallet do cliente)?
  **R:** Tradeoffs:
  - **(a) N requests do cliente:** rate limit pressure, sem semantica de "operacao reconciliacao" no servidor, mais round-trips.
  - **(b) 1 endpoint batch dedicado em `grind-sessions/:id/reconcile-wallets`:** semantica clara, idempotencia centralizada (RF-08), telemetria server-side mais coerente, chaining transparente do `walletService.recordTransaction` por iteracao.
  **Decisao: (b).** Endpoint dedicado em `grind-sessions` agrupa atomicidade por sessao e centraliza idempotencia. `walletService.recordTransaction` continua sendo o primitive — apenas chamado em loop pelo handler.
