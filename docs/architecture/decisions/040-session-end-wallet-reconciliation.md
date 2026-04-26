# ADR-040: Reconciliacao de banca ao fim da sessao via passo intermediario obrigatorio porem skipavel

## Status
Proposto

## Data
2026-04-26

## Contexto

Hoje a Grind Live registra `session_tournaments` durante a sessao (buyIn / winnings / bounty / addon / rebuy) e atualiza wallets via `walletService.recordTransaction` quando torneios sao logados. Ao final, `handleEndSession` faz `PUT /api/grind-sessions/:id` com `status='completed'` e abre o `SessionSummaryModal`. **Os saldos das wallets durante e ao final da sessao sao apenas estimativas** — soma do que foi logado manualmente ou importado. Multiplas fontes de divergencia operam na pratica:

- Rebuy ou add-on que o jogador esquece de clicar.
- ICM deal final-table que distorce o `winnings` reportado vs. valor real recebido.
- Side action / staking off-the-books indo parar na wallet.
- Fee da sala, bonus surpresa, glitch da plataforma, ajuste de torneio cancelado.

O sistema confia 100% no acumulado calculado e qualquer divergencia se acumula silenciosamente. Em 30/60 dias o dashboard de Bankroll mostra um numero diferente do real. Spec `Docs/specs/session-end-wallet-reconciliation.md` propoe um passo intermediario entre `handleEndSession` e `SessionSummaryModal`: um dialog `WalletReconciliationDialog` onde o jogador confirma o saldo final REAL observado em cada wallet com atividade na sessao. Cada divergencia (`delta = saldoReportado - saldoAtualWallet`) gera automaticamente uma `wallet_transaction` com `reason='session_result'`, `source='auto_session'`, vinculada ao `sessionId`.

A pergunta central: **como integrar essa reconciliacao reusando 100% do ledger existente, com idempotencia por sessao, sem duplicar primitives de optimistic concurrency, e com semantica clara para o caso de falha mid-batch (ja gravamos N-1 ajustes, o N falhou)?**

### Restricoes

- **Sem schema delta.** Coluna `wallet_transactions.source` ja existe (Sprint Bankroll-2, RF-05). Enum `WALLET_TX_SOURCES` em `shared/wallet-reasons.ts` ja inclui `'auto_session'`. Nada de migration nem coluna nova.
- **Reuso integral do ledger imutavel (ADR-017).** Cada ajuste vira `wallet_transaction` + espelho em `bankroll_snapshots`, gerados pelo mesmo `walletService.recordTransaction` que ja existe.
- **Optimistic concurrency obrigatoria (ADR-038).** Cliente envia `expectedPreviousBalance`; backend valida apos `SELECT FOR UPDATE`; divergencia → 409 `balance_mismatch`. O primitive ja existe — esta spec apenas o consome.
- **Verdade de campo do usuario vence.** Sistema nao argumenta nem oferece "voce tem certeza?". O numero observado pelo jogador na sala eh autoritativo. Sistema apenas registra a tx que faz `wallet.balance` igualar `reportedBalance`.
- **Sessao tipica tem 1-3 wallets ativas.** Loop sequencial e suficiente; nao ha pressao de performance que justifique paralelismo.

## Opcoes Consideradas

### Opcao A (ESCOLHIDA): Endpoint batch dedicado `POST /api/grind-sessions/:id/reconcile-wallets`, fail-fast por wallet, reuso de `walletService.recordTransaction`, idempotencia por `(sessionId, source='auto_session')`

Body com array `adjustments[]`. Backend itera; cada item invoca `walletService.recordTransaction({reason:'session_result', source:'auto_session', sessionId, expectedPreviousBalance, direction, nativeAmount, ...})`. Cada wallet roda em sua propria TX Postgres (uma BEGIN/COMMIT por chamada do service). Em caso de falha em uma (ex: 409 `balance_mismatch`, 422 `wallet_archived`), o loop **para no primeiro erro**. As tx anteriores PERMANECEM persistidas. Resposta carrega `txCreated[]` (ate-onde-foi) + `failedAt: { walletId, code, currentBalance? }`.

Antes de iterar: `SELECT id FROM wallet_transactions WHERE session_id=:sessionId AND reason='session_result' AND source='auto_session' LIMIT 1`. Se existir → 409 `already_reconciled` sem criar nada (idempotencia, RF-08).

```ts
// server/routes/grind-sessions.ts (handler)
async function reconcileWallets(req, res) {
  const session = await assertSessionOwnership(req.params.id, req.user.userPlatformId);
  const already = await storage.findReconciliationMarker(session.id);
  if (already.count > 0) return res.status(409).json({ code: 'already_reconciled', existingCount: already.count });

  const txCreated = [];
  for (const adj of req.body.adjustments) {
    const delta = adj.reportedBalance - adj.expectedPreviousBalance;
    if (Math.abs(delta) < 0.01) continue; // skip silencioso
    try {
      const tx = await walletService.recordTransaction({
        userId: req.user.userPlatformId, walletId: adj.walletId,
        direction: delta > 0 ? 'in' : 'out',
        nativeAmount: Math.abs(delta),
        reason: 'session_result', source: 'auto_session',
        sessionId: session.id,
        expectedPreviousBalance: adj.expectedPreviousBalance,
        note: 'Reconciliacao automatica fim de sessao',
      });
      txCreated.push(tx);
    } catch (e) {
      if (e.code === 'balance_mismatch' || e.code === 'wallet_archived') {
        return res.status(e.httpStatus).json({ code: e.code, txCreated, failedAt: { walletId: adj.walletId, ...e.payload } });
      }
      throw e;
    }
  }
  return res.json({ txCreated, skipped: req.body.adjustments.length - txCreated.length });
}
```

**Pros:**
- **Reuso 100% do `walletService.recordTransaction`** (ADR-034) — espelho em `bankroll_snapshots`, `SELECT FOR UPDATE`, ledger imutavel, optimistic concurrency, tudo gratis.
- **Reuso 100% do ADR-038** — `expectedPreviousBalance` ja eh consumido pelo service; handler so passa adiante. Zero codigo de optimistic concurrency duplicado.
- **Semantica clara para o usuario:** ajustes que ja persistiram permanecem; UI mostra status por wallet; usuario re-submete apenas as que faltaram. Nao ha "rollback magico" que invalide trabalho feito.
- **Idempotencia centralizada:** preflight no handler verifica chave `(sessionId, source='auto_session')`. F5, retry de network, multi-tab → 409 `already_reconciled`, sem duplicar.
- **Atomicidade onde importa:** cada wallet eh transacao independente. Falha em wallet B nao desfaz wallet A — preserva trabalho feito quando o fix eh re-submeter so a B.
- **Auditoria gratis:** filtrar `wallet_transactions` por `source='auto_session'` ou por `sessionId` resolve "quanto o sistema corrigiu automaticamente em X sessoes".
- **Endpoint agrupado em `grind-sessions/:id`:** semantica de "operacao reconciliacao por sessao" no servidor, nao no cliente. Telemetria server-side coerente (logs / metrics agregam por sessao).

**Contras:**
- **UX adiciona um passo no fim da sessao.** Mitigacao: dialog eh skipavel via botao "Sem ajuste" (RF-05); preflight pula dialog quando `eligibleWallets.length === 0` (RF-01).
- **Fail-fast permite estado parcial entre wallets.** Mitigacao: idempotencia (RF-08) impede re-criacao do que ja persistiu; UI lista status por wallet ("Ajuste registrado" para wallets pre-falha; "Re-submeter" para a que falhou + posteriores).
- **Cliente precisa lidar com 3 codigos distintos de erro:** 409 `balance_mismatch`, 409 `already_reconciled`, 422 `wallet_archived`. Mitigacao: spec RF-04/RF-08/US-04/US-05/US-06 cobre cada caso explicitamente.

### Opcao B: Atomicidade total (all-or-nothing) via transacao Postgres unica envolvendo todos os ajustes

Backend abre BEGIN, itera todos os ajustes dentro da mesma TX, COMMIT no final. Falha em qualquer um → ROLLBACK total. Resposta sempre `txCreated.length === adjustments.length` ou erro.

**Pros:**
- "Mais limpo" em termos de banco — ou tudo passa ou nada passa.
- Nao expoe ao cliente o conceito de "ajustes parciais".

**Contras:**
- **Logica de rollback complexa para zero ganho de dominio.** Quando wallet B falha por 409 `balance_mismatch` (race com outra aba), o usuario quer **manter** o ajuste da wallet A e re-submeter so a B. All-or-nothing forca o usuario a re-digitar A do zero — friccao gratis.
- **`walletService.recordTransaction` faz espelho em `bankroll_snapshots` por chamada**; envolver multiplas chamadas em uma TX externa quebra a granularidade do espelho ou exige refatoracao do service para aceitar TX externa (acoplamento que nao existe hoje).
- **Race entre abas vira blocker total.** Hoje, com fail-fast, o usuario re-submete apenas a wallet stale. Com all-or-nothing, qualquer race em qualquer wallet zera o progresso.
- **Idempotencia continua sendo necessaria** (F5 entre tentativas), entao a "simplicidade" da TX unica nao elimina a complexidade — apenas a desloca.
- **Rejeitada** — adiciona complexidade de implementacao sem ganho de dominio. UX fica pior. 

### Opcao C: Cliente envia N requests separados para `POST /api/wallets/:id/transactions`

UI itera as wallets do dialog, faz N posts ao endpoint generico de wallet transactions. Cada com `reason='session_result'`, `source='auto_session'`, `sessionId`, `expectedPreviousBalance`.

**Pros:**
- Reusa endpoint generico que ja existe; zero codigo novo no backend.

**Contras:**
- **Sem semantica de "operacao reconciliacao" no servidor.** Idempotencia teria que ser inferida (count de tx com `auto_session` por sessao) — possivel mas frio; sem barreira preflight clara.
- **Rate limit pressure:** `walletLimiter` aplicado por request → 5 wallets = 5 hits. Cliente precisaria sequenciar (latencia somada) ou paralelizar (rate limit choke).
- **Cliente fica complicado:** orquestracao do loop, agregacao de erros, decisao de continuar ou parar mid-batch, reflexao de status por wallet. Tudo coisa que o handler agrupa naturalmente.
- **Telemetria fragmentada:** sem evento server-side de "reconciliacao iniciada/terminada" por sessao; agregacoes futuras (% sessoes reconciliadas) ficam mais caras.
- **Atomicidade so existe wallet por wallet** (`SELECT FOR UPDATE` no service), sem nocao de conjunto-de-ajustes.
- **Rejeitada** — terceiriza para o cliente complexidade que o handler resolve uma vez.

### Opcao D: Coluna nova `wallet_transactions.is_auto_reconciliation: boolean`

Em vez de reusar `source='auto_session'`, adicionar coluna booleana dedicada.

**Pros:**
- Filtro mais explicito.

**Contras:**
- **Migration desnecessaria.** Coluna `source` ja existe e `'auto_session'` ja esta no enum. Adicionar boolean redundante eh debt.
- **Quebra a semantica de `source`** que ja eh usada para distinguir origem (manual vs auto_session vs migration_v1 vs auto_import_csv). Booleano paralelo eh anti-pattern.
- **Mais rows em queries de filtro/agregacao** (precisaria checar 2 colunas).
- **Rejeitada** por reuso e parcimonia.

## Decisao

Adotar **Opcao A**: endpoint batch dedicado `POST /api/grind-sessions/:id/reconcile-wallets` que itera os ajustes em loop sequencial, **fail-fast por wallet**, reusando `walletService.recordTransaction` integralmente. Cada wallet roda em sua propria TX Postgres (mesma granularidade ja existente do service). Idempotencia preflight: `SELECT id FROM wallet_transactions WHERE session_id=:sessionId AND reason='session_result' AND source='auto_session' LIMIT 1`. Reusa `expectedPreviousBalance` (ADR-038) sem refactor. Reusa coluna `wallet_transactions.source = 'auto_session'` (ja existente).

### Detalhes-chave

1. **Fail-fast por wallet:** TX A persiste, TX B falha por 409 → resposta carrega `txCreated:[txA]` + `failedAt:{walletId:B, code, currentBalance}`. Cliente refetch + remount com B+ ainda editaveis; A vira disabled "Ajuste registrado".
2. **Idempotencia em 2 niveis:**
   - Preflight no handler (chave `sessionId+source+reason`).
   - Preflight no `handleEndSession` cliente (RF-01) via `GET /reconcilable-wallets` que devolve `alreadyReconciled: true` → pula dialog.
3. **Skip silencioso de delta zero (epsilon 0.01):** backend ignora linhas com `|delta| < 0.01`, contabiliza em `skipped`. Sem erro, sem tx criada. (RF-04, US-03.)
4. **Source default `null` em rows antigas.** Decisao do implementer alinha com Bankroll-2 (RF-09); helper `transactionSourceLabel(null) = "Manual"`.
5. **Toggle "Mostrar todas wallets ativas" default OFF** (RF-02). Reduz friccao no caso 1-2 wallets ativas.
6. **Telemetria server-side via 4 eventos** (`reconcile_dialog_view`, `reconcile_submit_success`, `reconcile_submit_error`, `reconcile_skip_total`) — payloads sem PII. Reusa adapter existente.
7. **Validacao de ownership obrigatoria:** sessao pertence ao usuario (`grind_sessions.userId`) e cada `walletId` no body pertence ao mesmo usuario (`wallets.userId`). Falha → 404 mascarado.

## Consequencias

### Positivas
- **Dashboard de bankroll fica fiel a realidade.** Divergencias acumuladas silenciosamente passam a ser capturadas no momento natural (fim da sessao, quando o jogador acabou de olhar a sala).
- **Auditoria gratis via `source='auto_session'` + `sessionId`.** Filtros futuros respondem "quanto o sistema corrigiu nas ultimas 30 sessoes?" sem heuristica.
- **Reuso integral de optimistic concurrency (ADR-038).** Multi-aba, multi-device, race com auto-import futuro — todos resolvidos pelo primitive existente. Nao introduz mecanica nova.
- **Reuso integral do ledger imutavel (ADR-017).** Espelho em `bankroll_snapshots` automatico. Invariante `snapshot[n+1].previous == snapshot[n].new` preservada por wallet.
- **Zero schema delta.** Sem migration, sem coluna nova, sem mudanca em Drizzle ou Zod core. Suite existente passa sem alteracao.
- **Backward-compat 100%.** Endpoint generico `POST /api/wallets/:id/transactions` continua funcionando como hoje; nem o modo "Movimento" nem o modo "Reportar saldo" do `WalletTransactionDialog` sao tocados.

### Negativas
- **UX adiciona um passo no fim da sessao** (mitigacao: skipavel; preflight pula quando vazio; dialog so abre quando ha wallets com atividade).
- **Fail-fast permite estado parcial entre wallets** (mitigacao: idempotencia + UI lista status por wallet — wallets ja persistidas viram disabled "Ajuste registrado", as posteriores continuam editaveis).
- **Cliente trata 3 codigos de erro distintos** (mitigacao: spec RF-04/RF-07/RF-08 cobre cada caso; helper de tradutor de codigo → toast PT-BR).
- **Race rara: usuario abre sessao em 2 dispositivos e fecha em ambos quase-simultaneamente.** Mitigacao: idempotencia preflight detecta; segundo POST recebe 409 `already_reconciled` mesmo que o primeiro ainda nao tenha COMMITado totalmente (window minima; aceitavel). Eventual conflict de write em `wallet_transactions` resolvido pelo `SELECT FOR UPDATE` da wallet.

### Neutras
- **Endpoint dedicado em `grind-sessions/:id`** vs colocar em `bankroll/`: escolhi grind-sessions porque o dominio operacional eh "fechar sessao" — bankroll consome o resultado mas nao orquestra o flow.
- **Confirm modal extra para deltas grandes** (>20% do balance, p.ex.) eh quick-win futura; fora desta spec.
- **Dashboard agregado de reconciliacao** (% sessoes ajustadas por plataforma) eh sprint futura — telemetria atual ja captura os eventos para back-fill.

## Confianca

Alta. Reusa 3 ADRs ja entregues (017 ledger imutavel, 034 multi-wallet com FX, 038 optimistic concurrency) e nao introduz mecanica nova — apenas orquestra primitives existentes em loop fail-fast com idempotencia preflight. Risco principal — UX confundir usuario quando estado parcial ocorrer — mitigado por copy clara em RF-11 e status por wallet no dialog (linhas pre-falha viram disabled "Ajuste registrado"). Reversibilidade total: remover handler + spec apenas restaura comportamento atual; nenhum dado migrado.

## Referencias

- Spec: `Docs/specs/session-end-wallet-reconciliation.md` (RF-01 a RF-12, US-01 a US-07).
- ADR-017: ledger imutavel + invariantes de snapshot (preservadas).
- ADR-034: multi-wallet com FX historico — `wallet.balance` autoritativo + `SELECT FOR UPDATE` ja existem.
- ADR-038 (companion): optimistic concurrency via `expectedPreviousBalance` — primitive consumido por esta spec sem refactor.
- ADR-039 (companion): rakeback como `reason` — pattern de reuso de enum + handler centralizado, mesmo modelo aplicado aqui para `source='auto_session'`.
- Sequence: `Docs/architecture/flows/grind/sequence-session-end-reconciliation.mermaid` — fluxo completo backend (happy path, 409 mid-batch, skip, idempotencia).
- Flow UX: `Docs/architecture/flows/grind/flow-session-end-reconciliation-ux.mermaid` — estados do usuario do clique "Encerrar Sessao" ate redirecionamento /grind.
