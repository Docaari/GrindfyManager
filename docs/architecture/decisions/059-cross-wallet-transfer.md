# ADR-059: Cross-wallet transfer via tabela `wallet_transfers` + 2 rows em `wallet_transactions`

## Status
Proposto

## Data
2026-05-01

## Contexto

A Sprint Bankroll-2 (commit `69c03c7`) entregou multi-wallet com 4 moedas (USD/BRL/EUR/CNY/USDT) e ledger imutavel via `wallet_transactions` (ADR-017, ADR-034, ADR-038). FX freeze segue convencao QW-1 (`rates[ccy] = unidades de ccy por 1 USD`, ADR-033).

QA real do founder com 6 wallets (Suprema BRL, GG USD, OffPlatform_Bank BRL Itau, OffPlatform_Bank USD Wise, OffPlatform_Crypto USDT Binance, CoinPoker USDT) revelou friccao critica: **mover dinheiro entre wallets exige hack manual**.

Cenario tipico: jogador BR transfere R$5.000 da conta Itau (OffPlatform_Bank BRL) para Suprema (BRL) via PIX. Hoje precisa:

1. Criar `withdrawal` de R$5.000 na wallet Itau (note: "Transferencia PIX → Suprema").
2. Criar `deposit` de R$5.000 na wallet Suprema (note: "Recebido de Itau").
3. Esperar nao errar typo entre as duas notes.
4. Reconciliar manualmente em snapshots — se errar amount, snapshots ficam off.

Cross-currency e pior: USDT 200 da Binance para conta GG USD exige FX rate manual + 2 transactions manuais. Sem auditoria conjunta, sem garantia de que `amountFrom * fxRate === amountTo`.

A spec `Docs/specs/sprint-bankroll-3.md` RF-4 endereca isso com endpoint `POST /api/wallets/transfers` que orquestra os dois lados em 1 transacao server-side. A questao arquitetural eh **como modelar o transfer no schema**:

1. **Apenas 2 rows em `wallet_transactions` agrupadas por `transfer_group_id`** (sem tabela dedicada).
2. **Tabela dedicada `wallet_transfers` + 2 rows em `wallet_transactions` (espelho)** — escolha proposta.
3. **Tabela dedicada `wallet_transfers` substituindo as transactions** (tabela paralela).
4. **JSONB `transfer_metadata` na primeira transaction** apontando para a outra.

### Pre-requisitos satisfeitos

- `wallet_transactions` ja tem reasons `transfer_in` e `transfer_out` em `WALLET_TX_REASONS` (ADR-039).
- `walletService.recordTransaction` ja eh atomic com `expectedVersion` (ADR-038).
- Drizzle suporta transactions encadeadas via `db.transaction(async (tx) => ...)`.
- `users.exchangeRates` + `wallets.exchangeRates` ja existem para FX cascata (ADR-033, ADR-034) — sera unificado em `fxResolver` (ADR-061).

### Forcas em jogo

- **Auditoria:** transferencia eh evento de negocio com pares de moeda, FX rate aplicada, fee opcional. Precisa ser questionavel ("quanto saiu da Itau?", "qual rate usei?") sem reconstruir do zero.
- **Integridade referencial:** wallet com transfer historico nao pode ser deletada acidentalmente.
- **Compatibilidade ledger:** ledger imutavel (ADR-017) eh source of truth para saldos. Qualquer modelagem deve preservar.
- **Cross-currency obrigatorio:** transferencias inter-moeda exigem FX rate explicito (D4) + confirmacao se diff > 5% (D11).
- **Fee opcional:** PIX gratuito mas swift fee, crypto network fee, etc.

## Decisao

**Adotar opcao 2: tabela dedicada `wallet_transfers` (1 row por transfer) + 2-3 rows espelho em `wallet_transactions` (transfer_out, transfer_in, opcional transfer_fee), agrupadas via `transfer_group_id` em ambas tabelas. FK `from_wallet_id`/`to_wallet_id` ON DELETE RESTRICT (D1). Cross-currency exige `fxRate` explicito (D4). Diff > 5% vs market (resolved via fxResolver) exige confirmacao via `?confirmFxDiff=true` (D11).**

### Detalhes do contrato

**Schema (`migrations/0017_wallet_transfers.sql`):**

```sql
CREATE TABLE wallet_transfers (
  id VARCHAR PRIMARY KEY NOT NULL,
  user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  transfer_group_id VARCHAR NOT NULL UNIQUE,
  from_wallet_id VARCHAR NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  to_wallet_id VARCHAR NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  amount_from DECIMAL NOT NULL,
  amount_to DECIMAL NOT NULL,
  from_currency VARCHAR(8) NOT NULL,
  to_currency VARCHAR(8) NOT NULL,
  fx_rate DECIMAL,
  fee_amount DECIMAL,
  fee_currency VARCHAR(8),
  fee_wallet_id VARCHAR REFERENCES wallets(id) ON DELETE RESTRICT,
  reason VARCHAR NOT NULL,
  note TEXT,
  occurred_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_different_wallets CHECK (from_wallet_id <> to_wallet_id),
  CONSTRAINT chk_amounts_positive CHECK (amount_from > 0 AND amount_to > 0)
);

CREATE INDEX idx_wallet_transfers_user_occurred ON wallet_transfers (user_id, occurred_at DESC);
CREATE INDEX idx_wallet_transfers_from_wallet ON wallet_transfers (from_wallet_id);
CREATE INDEX idx_wallet_transfers_to_wallet ON wallet_transfers (to_wallet_id);
```

`wallet_transactions` ja tem `external_reference` (Bankroll-2). RF-4 reusa para gravar `transfer_group_id` em ambas as txs do par. Adicionar reason `'transfer_fee'` em `WALLET_TX_REASONS` (`shared/wallet-reasons.ts`).

**Endpoint `POST /api/wallets/transfers`:**

Body validado via Zod:

```ts
{
  fromWalletId: string,
  toWalletId: string, // != fromWalletId via Zod refine
  amountFrom: number, // > 0
  amountTo?: number, // calculado se omitido
  fxRate?: number, // obrigatorio se cross-currency
  feeAmount?: number,
  feeCurrency?: string,
  feeWalletId?: string, // pode ser from, to ou 3a wallet
  reason: 'transfer' | 'rebalance' | 'cashout_to_bank' | 'site_to_site',
  note?: string,
  occurredAt?: Date,
}
```

Pipeline server-side:

1. Carrega `fromWallet`, `toWallet`, `feeWallet?` (1 SELECT).
2. Valida ownership, ambas active, NAO archived.
3. Same-currency: `amountTo` defaulta para `amountFrom`. `fxRate` ignorado.
4. Cross-currency:
   - `fxRate` obrigatorio (sem fallback automatico — D4).
   - `amountTo` calculado: `amountFrom * fxRate` (se omitido) OU validado vs `amountFrom * fxRate` (se fornecido, diff > 0.5% retorna 400).
   - Resolve `marketRate` via `fxResolver.resolveExchangeRates(userId)` (ADR-061).
   - Se `Math.abs(fxRate - marketRate) / marketRate > 0.05` (5%): exige `?confirmFxDiff=true` (D11). Sem flag = 422 com payload explicativo.
5. Inicia transaction Drizzle:
   - INSERT `wallet_transfers` com novo `transfer_group_id` (nanoid).
   - INSERT `wallet_transactions` (transfer_out) na from + UPDATE `wallets.balance` da from (decrement, expectedVersion check via ADR-038).
   - INSERT `wallet_transactions` (transfer_in) na to + UPDATE `wallets.balance` da to (increment, expectedVersion check).
   - Se `feeAmount > 0` e `feeWalletId === fromWalletId`: fee debita junto com `transfer_out` (somando ao amount).
   - Se `feeAmount > 0` e `feeWalletId !== fromWalletId`: INSERT extra `wallet_transactions` com `reason='transfer_fee'`.
6. COMMIT. Retorna 201 com `{transfer, transactions: [outTx, inTx, feeTx?]}`.

**Endpoints derivados:**

- `GET /api/wallets/transfers?walletId=X&limit=50` — lista historico (`from_wallet_id=X OR to_wallet_id=X`), `ORDER BY occurred_at DESC`.
- `GET /api/wallets/transfers/:transferId` — detalhe + JOIN com 2-3 transactions associadas.

**FK ON DELETE RESTRICT (D1):**

Wallet com transfer historico NAO pode ser hard-deleted. Tentativa retorna 409 com `{code: 'WALLET_HAS_TRANSFERS', count}`. Jogador precisa archive (status='archived') primeiro. Archive nao apaga; apenas esconde da UI.

**FX confirmation (D11):**

Erro de digitacao classico: `fxRate=50` ao inves de `5.0` para BRL. Sem confirmacao, ledger fica off por 10x. D11 exige re-submit com `?confirmFxDiff=true` quando diff > 5%, dando ao jogador chance de revisar.

## Opcoes Consideradas

### Opcao 1: Apenas 2 rows em `wallet_transactions` agrupadas por `transfer_group_id` (sem tabela dedicada)

- **Pros:**
  - Zero schema novo. Apenas adicionar `transfer_group_id` (varchar) em `wallet_transactions` ou reusar `external_reference`.
  - Ledger continua sendo source of truth unico.
  - Queries simples: `SELECT * FROM wallet_transactions WHERE transfer_group_id = ?`.

- **Contras:**
  - Sem dado conjunto de transferencia: precisa reconstruir `fxRate`, `feeAmount`, `reason` cruzando 2-3 rows. Ineficiente e fragil (typo em note quebra reconstrucao).
  - FX rate vive em apenas 1 dos lados (qual? out ou in?). Convencao implicita = bug latente.
  - Impossivel adicionar constraint "transfer_in deve ter transfer_out par" puramente no banco — vira validacao app-level fragil.
  - Auditoria "qual transferencia teve fxRate divergente?" exige scan + GROUP BY em ledger inteiro.
  - Reverter transferencia (cancel + reembolso) exige criar 2 rows novas opostas — flow complexo sem tabela mestra para apontar.

### Opcao 2 (escolhida): Tabela `wallet_transfers` + espelho em `wallet_transactions`

- **Pros:**
  - Dado conjunto: 1 row em `wallet_transfers` carrega `fxRate`, `feeAmount`, `feeCurrency`, `reason`, `note`, ambos amounts. Auditoria trivial.
  - Espelho em `wallet_transactions` preserva ledger imutavel como source of truth para saldos. Sem dual write divergente — `wallet_transfers` eh metadado.
  - `transfer_group_id` em ambas tabelas permite JOIN bidirecional.
  - FK ON DELETE RESTRICT em `from_wallet_id`/`to_wallet_id` impede delete acidental de wallet com historico.
  - CHECK constraints (`chk_different_wallets`, `chk_amounts_positive`) previnem dados absurdos no banco.
  - Indices dedicados (user_occurred, from_wallet, to_wallet) suportam queries de listagem.
  - Espelho preserva compatibilidade com toda infra existente (snapshots, dashboard, balance calc).
  - Fee em wallet 3a vira tx separada — ledger continua granular.

- **Contras:**
  - Dual write: insert em 2 tabelas (3 com fee). Mitigado por transaction Drizzle.
  - Schema novo + migration. Trabalho aceito vs ganho de auditoria.
  - Risco de divergencia entre `wallet_transfers.amount_from` e `wallet_transactions.amount` do espelho. Mitigado por servico unico (`walletService.createTransfer`) que escreve ambos juntos — sem path alternativo.

### Opcao 3: Tabela `wallet_transfers` SUBSTITUINDO transactions

- **Pros:**
  - Sem duplicacao. Source of truth unico.
  - Schema mais limpo conceitualmente.

- **Contras:**
  - Quebra ledger imutavel (ADR-017). `wallets.balance` calc precisaria UNION wallet_transactions + wallet_transfers — query complexa em todo lugar.
  - Snapshots, dashboard, optimistic concurrency, todos os caminhos que leem ledger precisariam reescrita.
  - Transferencias e events de "movimento de dinheiro" como qualquer deposit/withdrawal — pertence ao ledger por natureza.
  - Refactor enorme para ganho marginal.

### Opcao 4: JSONB `transfer_metadata` na primeira tx + ponteiro pra outra

- **Pros:**
  - Sem tabela nova.
  - Dado conjunto vive na primeira tx.

- **Contras:**
  - Postgres JSONB queries sao OK mas index/constraint sao chatos. `transfer_group_id` virtual em JSONB.
  - "Primeira tx" eh convencao implicita — qual lado vai primeiro? out ou in?
  - Ponteiro para outra tx = FK virtual sem enforcement.
  - Mistura responsabilidades: tx eh lancamento de ledger; metadata de transferencia eh outro conceito. Acoplar ambos em JSONB invita confusao.
  - Schema evolution dolorosa (adicionar campo em JSONB exige migration de dados).

## Consequencias

### Positivas

- **Auditoria conjunta trivial.** `SELECT * FROM wallet_transfers WHERE id=?` retorna tudo o que precisa pra reconstruir transferencia.
- **Ledger imutavel preservado.** `wallet_transactions` continua sendo source of truth para saldos — toda infra existente (snapshots, dashboard, balance) funciona sem mudanca.
- **FK RESTRICT impede acidentes.** Delete de wallet com historico falha cedo no banco, nao em produzir bug latente.
- **CHECK constraints validam dados absurdos.** `from != to`, amounts positivos garantidos pelo Postgres.
- **FX explicito + confirmacao 5%.** Dois guard rails contra erro de digitacao FX.
- **Fee em wallet 3a suportado.** Ex: SWIFT fee em conta intermediaria. Vira tx separada `transfer_fee`.
- **Reuso `fxResolver` (ADR-061).** Cross-validation com market rate via cascata users > wallets > constants.
- **Endpoints de listagem/detalhe gratuitos.** Tabela dedicada simplifica `GET /transfers?walletId=`.

### Negativas

- **Dual write em 2-3 tabelas.** Performance impactada em ~10-20ms vs single insert. Aceitavel.
- **Risco de divergencia entre `wallet_transfers` e espelho.** Mitigado por servico unico. Adicionar integration test que valida `wallet_transfers.amount_from === SUM(wallet_transactions.amount WHERE transfer_group_id=? AND reason='transfer_out')`.
- **Mais 1 tabela para deployer/devs novos entenderem.** Documentado em data-model-index e diagrama ER.
- **FK RESTRICT pode confundir jogador casual.** UI deve sugerir "Archive a wallet ao inves de deletar" quando 409.

### Neutras

- **Reverter transferencia eh out-of-scope.** Por enquanto, jogador cria transferencia oposta manual. Sprint futuro pode adicionar `POST /transfers/:id/reverse` que cria par espelhado com note "reversal of X".
- **Origin de snapshot 'transfer'** opcional (ADR-058 RF-2 / RF-8). Implementer decide; default NAO grava snapshot por transfer (transfers ja sao auditaveis via `wallet_transfers`).
- **Transferencias com `occurredAt` no passado** aceitas ate 30 dias (consistencia com `wallet_transactions`). Mais antigo retorna 400.

## Confianca

**Alta.** Padrao "tabela mestra + espelho em ledger imutavel" e estabelecido (`session_wallet_snapshots` + `wallet_transactions` em ADR-046). FX confirmacao via `?confirmFxDiff=true` mimica padrao Stripe (idempotency keys, confirmacao explicita). Risco principal (divergencia entre tabelas) tem mitigacao concreta (servico unico + integration test).

## Referencias

- Spec: `Docs/specs/sprint-bankroll-3.md` (RF-4, D1, D4, D11)
- ADR-017: Bankroll snapshot vs derived (ledger imutavel)
- ADR-033: FX rate convention (units per USD)
- ADR-034: Multi-wallet com immutable FX
- ADR-038: Wallet tx optimistic concurrency
- ADR-039: Rakeback as wallet tx reason (padrao reasons enum)
- ADR-046: `session_wallet_snapshots` table (padrao tabela mestra + espelho)
- ADR-061: `fxResolver` unificado (resolve marketRate)
- Diagrama: `Docs/architecture/diagrams/bankroll-3-wallet-transfers-er.mermaid`
- Migration: `migrations/0017_wallet_transfers.sql`
- Schema: `shared/schema.ts` (`walletTransfers` table)
- Service: `server/services/walletService.ts` (`createTransfer` extension)
