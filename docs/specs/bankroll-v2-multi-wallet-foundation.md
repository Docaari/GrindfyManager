# Spec: Multi-Wallet Foundation (Sprint Bankroll-2 — Escopo P0)

## Status
Proposta — depende de QW-1 (`Docs/specs/bankroll-v2-qw1-fix-exchange-rates.md`) ter mergeado primeiro

## Resumo
Introduzir suporte a N carteiras heterogeneas por usuario (uma por rede de poker, mais wallets off-platform), cada uma com sua moeda nativa, balance autoritativo e ledger auditavel de transacoes (`wallet_transactions`). Migrar usuarios v1 (banca unica USD) para v2 com 1 wallet "default" automatica preservando historico. Manter `GET /api/bankroll` legado funcionando como wrapper sobre saldo consolidado derivado das wallets. Esta spec NAO inclui transferencia cross-wallet, pending transactions, stop-loss configuravel, auto-snapshot pos-sessao, nem dashboard ROI por wallet — todos viram specs proprias dentro do mesmo Sprint Bankroll-2.

## Contexto
**Posicao no roadmap:** Sprint Bankroll-2, escopo P0 (item #1 do ICE rank, score 18.0). Plano detalhado em `Docs/strategy/bankroll-v2-plan-2026-04-25.md`.

**Por que agora:**
1. Banca unica em USD do v1 nao reflete realidade do MTT pro brasileiro: a maioria opera em 2-5 redes/contas com moedas distintas (BRL Suprema, USD GG/Stars, USDT CoinPoker, BRL banco).
2. Forca usuario a converter mentalmente toda interacao (HIGH-1 do plano), gerando friccao alta e abandono de tracking (dor #10).
3. Concentracao de risco em uma rede e ponto cego que so multi-wallet expoe (dor #4).
4. Pre-requisito para todas as outras specs do Sprint Bankroll-2: transferencia, pending, stop-loss, auto-snapshot, ROI por wallet.

**Premissas herdadas (NAO renegociaveis):**
- QW-1 (fix exchangeRates) ja merged. Convencao FX: `rates[ccy] = N` -> "1 USD vale N unidades de ccy". Conversao native -> USD: `usd = native / rate`.
- Banca consolidada em USD continua sendo a fonte de verdade para Tournament Selector, Coach AI e regras de buy-in (em modo `global` — default).
- Snapshots historicos pre-v2 preservados intactos em `bankroll_snapshots`.
- IDs `nanoid`. UserId = `userPlatformId` (USER-XXXX). Drizzle ORM. Atomicidade transacional obrigatoria (ADR-017).
- UI em pt-BR.

**Integracao com QW-1:** Esta spec assume que `currencyNormalizer.normalizeBuyInToUSD` ja faz `native / rate` corretamente. Tudo neste documento usa essa convencao.

## Usuarios

- **Jogador BR existente (ja tem `bankrollAmount > 0`):** No primeiro acesso pos-deploy, encontra automaticamente uma wallet "Banca Padrao USD" criada pela migration v1->v2 com seu balance preservado. Pode adicionar Suprema BRL, GG USD, CoinPoker USDT etc. via UI.
- **Jogador novo (sem bankroll v1):** Onboarding aponta para `/bankroll` onde pode criar primeira wallet escolhendo plataforma + moeda nativa.
- **Tournament Selector (consumidor interno):** Continua filtrando por `consolidatedUSD = soma(wallets.balance / FX)` em modo global (default). Em modo `per_wallet` (config futura), filtra por wallet da rede do torneio. Esta spec entrega o helper `getConsolidatedBalance` mas o consumo `per_wallet` no Selector vira spec separada.
- **Coach AI:** Continua lendo `bankrollAmount` consolidado via tool existente; transparente para o agente.
- **Sistema de auditoria/contador (futuro):** Le `wallet_transactions` ordenado por `occurredAt` por wallet — invariantes de saldo garantem reconciliacao bate-a-bate.

## Requisitos Funcionais

### RF-01: Schema Drizzle — Tabela `wallets`

**Descricao:** Nova tabela representando cada carteira do jogador. Balance e o ESPELHO autoritativo do ultimo `wallet_transactions.newNativeBalance` para a wallet (recomputado apos cada tx em transacao).

**Schema (Drizzle):**

```typescript
export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  platform: varchar("platform").notNull(),               // enum (RF-02)
  nativeCurrency: varchar("native_currency", { length: 8 }).notNull(),
  balance: decimal("balance").notNull().default("0"),    // moeda nativa
  status: varchar("status").notNull().default("active"), // 'active' | 'archived'
  bankrollRule: varchar("bankroll_rule"),                // override do default; null = usa user_settings.defaultBankrollRule
  color: varchar("color", { length: 7 }),                // hex; opcional UI
  displayOrder: integer("display_order").notNull().default(0),
  isShotPocket: boolean("is_shot_pocket").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_wallets_user_status").on(table.userId, table.status),
  index("idx_wallets_user_platform").on(table.userId, table.platform),
  uniqueIndex("uq_wallets_user_name_active").on(table.userId, table.name).where(sql`status = 'active'`),
]);
```

**Regras de negocio:**
- `name` unico por usuario entre wallets ATIVAS (pode reaproveitar nome em wallet arquivada).
- `name` minimo 1 char, maximo 80; trim antes de salvar.
- `nativeCurrency` deve ser uma das suportadas: `USD`, `BRL`, `EUR`, `GBP`, `CNY`, `USDT`, `BTC` (mesma lista do `DEFAULT_EXCHANGE_RATES` pos-QW-1).
- `bankrollRule` segue mesma regex de `user_settings.bankrollRule`: `^(1pct|2pct|5pct|custom:\d+(\.\d+)?)$` ou null.
- `balance` nunca editado diretamente — apenas via wallet_transactions.
- `status='archived'` impede registrar novas transactions e reduz visibilidade no UI; preservacao historica.
- `isShotPocket=true`: wallet excluida do calculo de banca core (consolidacao).
- `displayOrder`: posicao na lista UI (0 = primeira).

**Criterios de aceitacao:**
- [ ] Tabela criada via `db:push` sem erros.
- [ ] FK `userId -> users.userPlatformId` ON DELETE CASCADE funciona.
- [ ] Indices `idx_wallets_user_status` e `idx_wallets_user_platform` presentes.
- [ ] Constraint unica `(userId, name) WHERE status='active'` impede duplicata.
- [ ] Insert com `nativeCurrency` invalido falha em validacao Zod (RF-04).

---

### RF-02: Enum de plataformas suportadas

**Descricao:** Lista canonica de plataformas para o campo `wallets.platform`. Inclui redes de poker do `csvParser` e categorias off-platform.

**Lista canonica (constante exportada):**

```typescript
// shared/wallet-platforms.ts
export const WALLET_PLATFORMS = [
  // Redes de poker
  "Suprema",
  "GGNetwork",
  "PokerStars",
  "WPN",
  "888",
  "PartyPoker",
  "CoinPoker",
  "Chico",
  "Revolution",
  "iPoker",
  // Off-platform
  "OffPlatform_Bank",       // conta bancaria
  "OffPlatform_Crypto",     // exchange / wallet cripto
  "OffPlatform_Staker",     // dinheiro com staker / makeup
  "OffPlatform_Other",      // generico
  // Migration v1 -> v2
  "GenericUSD",             // wallet criada automaticamente para usuarios v1
] as const;

export type WalletPlatform = typeof WALLET_PLATFORMS[number];
```

**Regras de negocio:**
- Validacao Zod: `z.enum(WALLET_PLATFORMS)`.
- `GenericUSD` reservado para migration; UI permite criar mas mostra label "Generica" — usuario pode editar wallet para uma plataforma especifica depois.

**Criterios de aceitacao:**
- [ ] Constante exportada de `shared/wallet-platforms.ts`.
- [ ] Schema Zod `WalletPlatformSchema` aceita os 15 valores.
- [ ] Insert com plataforma fora da lista falha em 400.

---

### RF-03: Schema Drizzle — Tabela `wallet_transactions`

**Descricao:** Ledger imutavel por wallet. Cada movimento e uma linha; FX no momento da transacao e CONGELADO. Substitui o uso de `bankroll_snapshots` para movimentos de wallet (snapshots legados ficam intactos como audit trail global).

**Schema (Drizzle):**

```typescript
export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id").primaryKey().notNull(),
  walletId: varchar("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),  // denormalizado p/ query
  occurredAt: timestamp("occurred_at").notNull(),
  effectiveAt: timestamp("effective_at").notNull(), // = occurredAt no P0 (pending vira spec separada)
  direction: varchar("direction").notNull(),       // 'in' | 'out'
  nativeAmount: decimal("native_amount").notNull(),
  nativeCurrency: varchar("native_currency", { length: 8 }).notNull(),
  fxRateUSDPerNative: decimal("fx_rate_usd_per_native").notNull(), // IMUTAVEL pos-criacao
  usdAmount: decimal("usd_amount").notNull(),     // = nativeAmount / fxRateUSDPerNative na nova convencao QW-1
  previousNativeBalance: decimal("previous_native_balance").notNull(),
  newNativeBalance: decimal("new_native_balance").notNull(),
  reason: varchar("reason").notNull(),             // enum (RF-05)
  feeAmount: decimal("fee_amount"),                // nullable
  feeCurrency: varchar("fee_currency", { length: 8 }),
  sessionId: varchar("session_id").references(() => grindSessions.id, { onDelete: "set null" }),
  note: text("note"),                              // max 500 chars
  source: varchar("source").notNull().default("manual"), // 'manual' | 'auto_session' | 'migration_v1' | 'auto_import_csv'
  createdAt: timestamp("created_at").defaultNow(),
  // Reservados para specs futuras (transfer, staking) — nao implementar comportamento agora
  transferGroupId: varchar("transfer_group_id"),   // P1 (transferencia)
  stakingDealId: varchar("staking_deal_id"),       // Sprint Bankroll-3
}, (table) => [
  index("idx_wtx_wallet_occurred").on(table.walletId, table.occurredAt),
  index("idx_wtx_user_reason").on(table.userId, table.reason),
  index("idx_wtx_user_occurred").on(table.userId, table.occurredAt),
  index("idx_wtx_transfer_group").on(table.transferGroupId),
]);
```

**Regras de negocio:**
- `nativeAmount` sempre positivo. `direction` define sinal logico.
- `usdAmount` derivado obrigatorio: `usdAmount = nativeAmount / fxRateUSDPerNative` (convencao QW-1). Cache para queries rapidas; nao confiar so no derivado em invariantes.
- `fxRateUSDPerNative` **IMUTAVEL** apos insert. Trigger ou validacao no service-layer impede UPDATE.
- Para `nativeCurrency === 'USD'`, `fxRateUSDPerNative = 1.0`.
- `previousNativeBalance` e `newNativeBalance` sao CHAVE de auditoria — invariante: `wallet_transactions[N+1].previousNativeBalance == wallet_transactions[N].newNativeBalance` por `walletId` ordenando por `occurredAt`. Equivalente ADR-017.
- `effectiveAt = occurredAt` no P0 (campo dedicado para preparar pending tx em spec futura).
- `transferGroupId` e `stakingDealId` ficam null no P0 (so esquema; sem comportamento).
- Insert SEMPRE em transacao com SELECT FOR UPDATE da wallet + UPDATE balance + INSERT tx.

**Criterios de aceitacao:**
- [ ] Tabela criada com 4 indices presentes.
- [ ] FK `walletId -> wallets.id` ON DELETE CASCADE.
- [ ] FK `sessionId -> grindSessions.id` ON DELETE SET NULL (sessao deletada nao apaga ledger).
- [ ] Tentativa de UPDATE em `fxRateUSDPerNative` rejeitada (validacao no service).
- [ ] Insert com `direction` invalida falha em 400.
- [ ] Insert sem transacao quebra invariante (teste prova).

---

### RF-04: Schema Drizzle — Modificacoes em `bankroll_snapshots`

**Descricao:** Adicionar 4 colunas opcionais (nullable) para suportar referencia a wallet + FX historico, mantendo total compatibilidade com snapshots v1.

**Migration:**

```sql
ALTER TABLE bankroll_snapshots ADD COLUMN wallet_id varchar NULL;
ALTER TABLE bankroll_snapshots ADD COLUMN native_amount decimal NULL;
ALTER TABLE bankroll_snapshots ADD COLUMN native_currency varchar(8) NULL;
ALTER TABLE bankroll_snapshots ADD COLUMN fx_rate_usd_per_native decimal NULL;
CREATE INDEX idx_bankroll_snapshots_wallet ON bankroll_snapshots(wallet_id);
```

**Drizzle:**

```typescript
// adicionar a bankrollSnapshots em shared/schema.ts:
walletId: varchar("wallet_id"),                  // nullable
nativeAmount: decimal("native_amount"),          // nullable
nativeCurrency: varchar("native_currency", { length: 8 }), // nullable
fxRateUSDPerNative: decimal("fx_rate_usd_per_native"),     // nullable
```

**Regras de negocio:**
- Snapshots pre-v2: 4 colunas ficam null (preservacao).
- Snapshots criados pela migration (RF-08) recebem `walletId` da default wallet.
- Snapshots criados em V2 a partir de wallet_transactions: replicam dados da tx para auditoria global.

**Criterios de aceitacao:**
- [ ] Migration aplica via `db:push`.
- [ ] Snapshots existentes continuam funcionando em `GET /api/bankroll/history`.
- [ ] Indice em `wallet_id` presente.

---

### RF-05: Enum de reasons (`wallet_transactions.reason`)

**Descricao:** Lista canonica de motivos de movimento. Subset suportado no P0.

```typescript
// shared/wallet-reasons.ts
export const WALLET_TX_REASONS = [
  "deposit",
  "withdrawal",
  "session_result",
  "manual_adjustment",
  // Reservados (specs futuras dentro do Sprint Bankroll-2):
  "transfer_in",        // P1 — transferencia cross-wallet
  "transfer_out",       // P1
  "fee",                // P1 — fee separado da transferencia
  "fx_adjustment",      // P1
  // Reservados (Sprint Bankroll-3):
  "staking_payout",
  "staking_buyin",
  "makeup_clear",
] as const;
export const WALLET_TX_REASONS_P0 = ["deposit", "withdrawal", "session_result", "manual_adjustment"] as const;
```

**Regras de negocio P0:**
- Endpoint `POST /api/wallets/:id/transactions` aceita SOMENTE `WALLET_TX_REASONS_P0`.
- Schema da tabela aceita todos (forward-compat); validacao no Zod do endpoint restringe ao subset.

**Criterios de aceitacao:**
- [ ] Endpoint recusa `transfer_in` em P0 com 400.
- [ ] Endpoint aceita os 4 motivos P0.

---

### RF-06: Schema Drizzle — Modificacoes em `user_settings`

**Descricao:** Adicionar 2 colunas para configuracao de banca consolidada.

```typescript
// adicionar a userSettings em shared/schema.ts:
bankrollAggregationMode: varchar("bankroll_aggregation_mode").default("global"), // 'global' | 'per_wallet'
bankrollDisplayCurrency: varchar("bankroll_display_currency", { length: 8 }).default("USD"), // 'USD' | 'BRL' | etc.
```

**Migration:**

```sql
ALTER TABLE user_settings ADD COLUMN bankroll_aggregation_mode varchar DEFAULT 'global';
ALTER TABLE user_settings ADD COLUMN bankroll_display_currency varchar(8) DEFAULT 'USD';
```

**Regras de negocio:**
- Default `global` preserva mental model do v1 (banca consolidada em USD).
- `bankrollDisplayCurrency` controla a moeda secundaria exibida no widget. P0 suporta `USD` e `BRL`; demais ficam reservadas.
- No P0, mode `per_wallet` aceita ser SETADO mas a logica do Tournament Selector nao reage diferente — adicao de comportamento `per_wallet` no Selector vira spec separada.

**Criterios de aceitacao:**
- [ ] Colunas adicionadas via migration.
- [ ] Usuarios existentes ganham `aggregationMode='global'` e `displayCurrency='USD'` automaticamente (default).
- [ ] PATCH em `/api/user/settings` (existente) aceita os 2 novos campos.

---

### RF-07: Service layer — `walletService.ts`

**Descricao:** Camada de servico em `server/services/walletService.ts` com toda a logica de negocio. Routes apenas validam input e delegam.

**Funcoes publicas:**

```typescript
export const walletService = {
  // CRUD
  createWallet(userId, input): Promise<Wallet>;
  getWallet(userId, walletId): Promise<Wallet | null>;
  listWallets(userId, opts): Promise<Wallet[]>;
  updateWallet(userId, walletId, patch): Promise<Wallet>;
  archiveWallet(userId, walletId): Promise<Wallet>;
  // Transactions
  recordWalletTransaction(userId, walletId, input): Promise<{ tx: WalletTransaction; wallet: Wallet }>;
  listWalletTransactions(userId, walletId, filters): Promise<{ items, pagination }>;
  // Aggregation
  getConsolidatedBalance(userId): Promise<ConsolidatedBalance>;
  // Migration
  migrateUserV1toV2(userId): Promise<{ created: boolean; walletId?: string }>;
};
```

**Regras de negocio:**
- `createWallet`: validar nome unico por usuario entre ativas; validar `nativeCurrency` e `platform`; balance inicial = 0; opcional registrar tx `deposit` no mesmo request se input incluir `initialDeposit`.
- `recordWalletTransaction`:
  - Recusa se `wallet.status='archived'` (409 Conflict).
  - SELECT FOR UPDATE em `wallets` -> calcula `prev = balance` -> `next = direction === 'in' ? prev + nativeAmount : prev - nativeAmount`.
  - Pega FX corrente: se `nativeCurrency === 'USD'`, rate=1.0; senao consulta `user_settings.exchangeRates[ccy] ?? DEFAULT_EXCHANGE_RATES[ccy]` (ja na convencao QW-1).
  - INSERT em `wallet_transactions` com `previousNativeBalance=prev`, `newNativeBalance=next`, `fxRateUSDPerNative=rate`.
  - UPDATE em `wallets.balance = next`.
  - Tudo em UMA transacao (ADR-017).
  - Cria entrada espelho em `bankroll_snapshots` (compat v1) com `walletId`, `nativeAmount`, `nativeCurrency`, `fxRateUSDPerNative`, e `delta` em USD = `usdAmount * (direction==='in'?1:-1)`.
  - Recusa `next < 0` apenas se wallet flag `allowNegative=false` (default true para flexibilidade — registra com warning igual v1).
- `getConsolidatedBalance`:
  - Soma `wallet.balance / FX(wallet.nativeCurrency)` para todas wallets `status='active'` AND `isShotPocket=false`.
  - Retorna shape `{ totalUSD, totalDisplayCurrency, displayCurrency, byWallet: [{walletId, name, platform, balanceNative, balanceUSD, share}], shotPockets: [...similar...] }`.
  - Cache em memoria por userId, TTL 30s, invalida em qualquer mutacao de wallet.
- `migrateUserV1toV2`: idempotente. Se usuario nao tem wallets E `user_settings.bankrollAmount > 0`: cria wallet `name="Banca Padrao USD"`, `platform="GenericUSD"`, `nativeCurrency="USD"`, `balance=bankrollAmount`. Backfill: para todos `bankroll_snapshots` desse usuario sem `walletId`, set `walletId=defaultWallet.id` em UMA transacao.

**Criterios de aceitacao:**
- [ ] `createWallet` em transacao + retorna wallet com balance=0.
- [ ] `recordWalletTransaction` mantem invariante `tx[N+1].previousNativeBalance == tx[N].newNativeBalance` (teste com 100 transacoes ordenadas).
- [ ] `recordWalletTransaction` recusa em wallet arquivada com 409.
- [ ] `getConsolidatedBalance` exclui wallets `archived` e `isShotPocket`.
- [ ] `migrateUserV1toV2` idempotente (re-execucao nao cria wallet duplicada).
- [ ] FX historico preservado: tx criada hoje com BRL=5.0, daqui a 30 dias com BRL=4.5, query em tx antiga mostra 5.0 ainda.

---

### RF-08: Migration v1 -> v2

**Descricao:** Script idempotente em `server/scripts/migrate-v2-multi-wallet.ts` que executa `walletService.migrateUserV1toV2` para cada usuario com `bankrollAmount > 0`. Roda manual no deploy.

**Estrategia:**
1. SELECT users com `user_settings.bankroll_amount IS NOT NULL AND bankroll_amount > 0`.
2. Para cada usuario:
   - Verificar se ja tem wallet ativa (idempotencia). Se sim: pular.
   - Em uma transacao: criar wallet default; backfill `walletId` em snapshots desse usuario.
3. Log estruturado (`console.info`) com `userId`, `walletId criada`, `snapshots backfilled`.
4. Modo dry-run via `BANKROLL_V2_DRY_RUN=true`.

**Rollback:**
- Script `server/scripts/rollback-v2-multi-wallet.ts`: deleta wallets criadas com `source=migration_v1`, restaura `bankroll_snapshots.walletId=NULL` para snapshots backfilled. Mantem snapshot historicos.

**Regras de negocio:**
- Migration NAO cria wallet_transaction inicial — preserva o snapshot v1 como audit trail. Decisao: snapshots existentes JA representam o ledger; criar tx duplicaria.
- Migration NAO toca em `userSettings.bankrollAmount` — fica como espelho (sera atualizado no futuro pelas mudancas de balance da default wallet).

**Criterios de aceitacao:**
- [ ] Usuario com banca 1000 USD apos migration: 1 wallet "Banca Padrao USD" com balance 1000.
- [ ] Snapshots desse usuario tem `walletId=defaultWallet.id`.
- [ ] Re-execucao da migration: 0 wallets criadas (idempotente).
- [ ] Modo dry-run: 0 escritas, log mostra delta planejado.
- [ ] Usuario sem banca v1: nenhuma wallet criada.
- [ ] Rollback: wallet deletada e snapshots desbackfilled.

---

### RF-09: API Endpoints — CRUD de Wallets

Todos os endpoints exigem JWT (`requireAuth`). Mutacoes (POST, PUT, PATCH): rate limit 10/min por userPlatformId. Reads: cache em memoria 30s.

#### `GET /api/wallets`

**Descricao:** Lista wallets do usuario.

**Query params:** `includeArchived` (boolean, default false).

**Response 200:**
```json
{
  "wallets": [
    {
      "id": "wlt_abc123",
      "name": "GG Main",
      "platform": "GGNetwork",
      "nativeCurrency": "USD",
      "balance": "1234.50",
      "status": "active",
      "bankrollRule": null,
      "color": "#FF5733",
      "displayOrder": 0,
      "isShotPocket": false,
      "createdAt": "2026-04-25T10:00:00Z",
      "updatedAt": "2026-04-26T15:00:00Z",
      "lastTransactionAt": "2026-04-26T15:00:00Z"
    }
  ],
  "consolidated": {
    "totalUSD": "5432.10",
    "totalDisplayCurrency": "27160.50",
    "displayCurrency": "BRL",
    "aggregationMode": "global"
  }
}
```

**Criterios:** sem auth -> 401; default oculta archived; ordenado por `displayOrder ASC, createdAt ASC`.

#### `POST /api/wallets`

**Body:**
```json
{
  "name": "Suprema Clube X",
  "platform": "Suprema",
  "nativeCurrency": "BRL",
  "color": "#3366FF",
  "isShotPocket": false,
  "bankrollRule": null,
  "initialDeposit": { "amount": 5000, "note": "transferencia inicial PIX" }
}
```

**Response 201:** wallet criada + tx inicial se `initialDeposit` presente.

**Validacoes:**
- `name`: trim, 1-80 chars, unico entre wallets ativas do usuario.
- `platform`: enum valido.
- `nativeCurrency`: enum valido.
- `bankrollRule`: regex valida ou null.
- `initialDeposit.amount`: > 0.
- Erros: 400 com mensagem clara em pt-BR.

#### `GET /api/wallets/:id`

Retorna wallet com `lastTransactionAt` + `recentTransactions` (ultimas 5 para contexto rapido).

**Errors:** 404 se nao existe ou nao pertence ao usuario.

#### `PUT /api/wallets/:id`

**Body (parcial):** `name`, `color`, `displayOrder`, `bankrollRule`, `isShotPocket`.

**NAO permitido alterar:** `platform`, `nativeCurrency`, `balance`, `status` (use `archive` endpoint).

**Validacoes:** 400 se tenta mudar campos imutaveis.

#### `PATCH /api/wallets/:id/archive`

**Comportamento:** seta `status='archived'`. Wallet preserva todas as transactions e historico. Nao deleta.

**Restricoes:**
- Wallet com `balance != 0`: aceita arquivar mas registra warning em response (`warning: "wallet_archived_with_balance"`).
- Pendente em spec futura: bloquear arquivamento se wallet tem `pending` transactions ativas.

**Response 200:** wallet atualizada.

#### `DELETE /api/wallets/:id`

**Comportamento:** **Recusa** com 405 Method Not Allowed em P0. Mensagem: "Wallets nao podem ser deletadas. Use PATCH /archive para preservar historico."

---

### RF-10: API Endpoints — Wallet Transactions

#### `GET /api/wallets/:id/transactions`

**Query params:**
- `limit` (default 50, max 200)
- `offset` (default 0)
- `from`, `to` (datas YYYY-MM-DD opcionais)
- `reason` (csv: `deposit,withdrawal,...`)

**Response 200:**
```json
{
  "transactions": [
    {
      "id": "wtx_xyz789",
      "walletId": "wlt_abc123",
      "occurredAt": "2026-04-26T15:00:00Z",
      "direction": "in",
      "nativeAmount": "100.00",
      "nativeCurrency": "USD",
      "fxRateUSDPerNative": "1.0",
      "usdAmount": "100.00",
      "previousNativeBalance": "1134.50",
      "newNativeBalance": "1234.50",
      "reason": "deposit",
      "note": "PIX recebido",
      "source": "manual",
      "createdAt": "2026-04-26T15:00:01Z"
    }
  ],
  "pagination": { "total": 142, "limit": 50, "offset": 0 },
  "summary": {
    "totalDepositsNative": "5000.00",
    "totalWithdrawalsNative": "1000.00",
    "totalSessionPnLNative": "234.50",
    "netNative": "4234.50",
    "nativeCurrency": "USD"
  }
}
```

**Cache:** 30s por (walletId, query params).

#### `POST /api/wallets/:id/transactions`

**Body:**
```json
{
  "direction": "in",
  "nativeAmount": 500,
  "reason": "deposit",
  "note": "depositos da semana",
  "occurredAt": "2026-04-26T14:00:00Z",
  "sessionId": null
}
```

**Validacoes:**
- `direction`: `in` | `out`.
- `nativeAmount`: > 0.
- `reason`: subset P0 (`deposit`, `withdrawal`, `session_result`, `manual_adjustment`).
- `occurredAt`: nao no futuro; nao anterior ao `occurredAt` da ultima tx (proteger invariante MED-6 do plano).
- `sessionId`: se preenchido, deve existir e pertencer ao usuario; reason deve ser `session_result`.
- `note`: max 500 chars.

**Response 201:**
```json
{
  "transaction": { ... },
  "wallet": { ... balance atualizado ... },
  "warning": null  // ou "wallet_negative" se balance < 0
}
```

**Erros:**
- 400 se input invalido.
- 404 se wallet nao existe.
- 409 se wallet arquivada.
- 422 se `occurredAt` anterior a ultima tx.
- 429 se rate limit excedido.

---

### RF-11: API Endpoint — Banca Consolidada

#### `GET /api/bankroll/consolidated`

**Descricao:** Substituto moderno do `GET /api/bankroll`. Retorna saldo consolidado + breakdown por wallet.

**Response 200:**
```json
{
  "aggregationMode": "global",
  "displayCurrency": "BRL",
  "totalUSD": "5432.10",
  "totalDisplayCurrency": "27160.50",
  "rule": "1pct",
  "rulePct": 1.0,
  "tolerance": 1.5,
  "softLimitUSD": "54.32",
  "hardLimitUSD": "81.48",
  "byWallet": [
    {
      "walletId": "wlt_abc123",
      "name": "GG Main",
      "platform": "GGNetwork",
      "nativeCurrency": "USD",
      "balanceNative": "1234.50",
      "balanceUSD": "1234.50",
      "share": 0.227,
      "isShotPocket": false
    }
  ],
  "shotPockets": [],
  "lastUpdatedAt": "2026-04-26T15:00:00Z"
}
```

**Regras:**
- `share` = `balanceUSD / totalUSD` (4 casas decimais).
- Em `aggregationMode='global'`: `softLimit/hardLimit` derivados da soma. Em `per_wallet`: ambos retornam `null` no consolidated (cada wallet tem sua regra; UI usa `byWallet[].rule` se disponivel — vira spec separada).
- `shotPockets` listado separadamente (nao soma ao total).

#### `GET /api/bankroll` (legado)

**Comportamento P0:** Continua funcionando. Implementacao virou wrapper:
- Le `consolidatedUSD` via `getConsolidatedBalance`.
- Mapeia para shape v1: `amount = totalUSD`, `currency = "USD"`, `rule = user_settings.bankrollRule`, `maxBuyInUSD/Display` derivado.
- Adiciona campo NOVO `aggregationMode` + `walletCount` para clientes que ja saibam consumir.

**Compat:** clientes v1 (BankrollWidget atual, Tournament Selector, Coach AI) continuam funcionando sem mudanca de codigo no consumidor.

---

### RF-12: UI — Componentes a criar/modificar

**Pagina `/bankroll`:** Layout 2-painéis. Sidebar esquerda (250px): lista de wallets + botao "Nova carteira". Main area direita: detalhe da wallet selecionada (transactions + saldo + acoes).

**Componentes novos:**

| Arquivo | Responsabilidade |
|---|---|
| `client/src/components/bankroll/WalletList.tsx` | Sidebar list. Mostra wallets ativas (e archived em accordion colapsado). Card por wallet: nome, plataforma, balance native + USD equivalente, color dot. Click seleciona. |
| `client/src/components/bankroll/WalletDetailPanel.tsx` | Detalhe da wallet selecionada. Header: nome + plataforma + balance grande. Tabs: "Movimentos" (lista paginada de transactions) \| "Configuracao" (edit/archive). |
| `client/src/components/bankroll/WalletCreateDialog.tsx` | Modal de criacao. Form: name, platform select, nativeCurrency select, color picker, bankrollRule (opcional), isShotPocket toggle, initialDeposit (opcional). Validacao real-time. |
| `client/src/components/bankroll/WalletEditDialog.tsx` | Modal de edicao. Form com campos editaveis (RF-09). |
| `client/src/components/bankroll/WalletArchiveDialog.tsx` | Confirmacao de arquivamento. Mostra warning se balance != 0. |
| `client/src/components/bankroll/WalletTransactionDialog.tsx` | Modal de registro de movimento. Reutiliza UX do `BankrollMovementDialog` mas no contexto de uma wallet especifica. Inclui preview "novo saldo: X" antes de submeter. |
| `client/src/components/bankroll/WalletTransactionsTable.tsx` | Lista paginada de wallet_transactions. Colunas: data, direction, nativeAmount + currency, reason badge, note, balance after. |
| `client/src/components/bankroll/ConsolidatedBalanceCard.tsx` | Card no topo da pagina mostrando totalUSD + totalDisplayCurrency + ruleInfo. |

**Componentes modificados:**

| Arquivo | Mudanca |
|---|---|
| `client/src/pages/Bankroll.tsx` (ou equivalente atual) | Refatora para layout 2-painés com `WalletList` + `WalletDetailPanel` + `ConsolidatedBalanceCard`. Mantem fallback para usuario sem wallets (CTA "Criar primeira carteira"). |
| `client/src/components/bankroll/BankrollWidget.tsx` | Atualiza para mostrar saldo consolidado (`totalUSD`/`totalDisplayCurrency`). Adiciona breakdown sumario (top 3 wallets por share). Mantem CTA "Configurar" para usuario sem wallet. |
| `client/src/components/bankroll/BankrollMovementDialog.tsx` | **Mantido funcionando legado** (compat v1), mas em pagina `/bankroll` v2 prioriza `WalletTransactionDialog`. Pode virar deprecated em spec futura. |
| `client/src/components/bankroll/BankrollHistoryTable.tsx` | Adiciona coluna `walletId/walletName` (quando snapshot tem walletId). Mantem comportamento legado para snapshots sem walletId. |

**Regras de UX:**
- Selecionar wallet: deep-link via query param `?walletId=...`.
- Empty state: "Voce ainda nao criou nenhuma carteira" + CTA grande.
- Onboarding tooltip na primeira visita pos-migration: "Voce tinha banca de $X em USD. Criamos uma carteira 'Banca Padrao USD' automaticamente. Adicione mais carteiras para refletir cada plataforma."
- Confirmacao de arquivamento e destrutiva (modal com botao vermelho).
- Color picker: 8 cores predefinidas + custom hex.
- Form de criacao: feedback inline para nome duplicado.

---

### RF-13: i18n pt-BR

**Strings principais (lista nao-exaustiva):**

```typescript
// shared/i18n/wallet-strings.ts
export const WALLET_I18N = {
  pageTitle: "Banca",
  walletList: "Carteiras",
  newWallet: "Nova Carteira",
  emptyState: "Voce ainda nao criou nenhuma carteira",
  emptyStateCTA: "Criar primeira carteira",
  totalConsolidated: "Banca consolidada",
  // Form fields
  fieldName: "Nome",
  fieldPlatform: "Plataforma",
  fieldNativeCurrency: "Moeda nativa",
  fieldColor: "Cor",
  fieldRule: "Regra de banca",
  fieldShotPocket: "Pocket de shot",
  fieldInitialDeposit: "Deposito inicial",
  // Tx
  txDirection: "Direcao",
  txDirectionIn: "Entrada",
  txDirectionOut: "Saida",
  txReasonDeposit: "Deposito",
  txReasonWithdrawal: "Saque",
  txReasonSession: "Resultado de sessao",
  txReasonManual: "Ajuste manual",
  // Actions
  actionEdit: "Editar",
  actionArchive: "Arquivar",
  actionRecordTx: "Registrar movimento",
  // Errors
  errNameRequired: "Nome e obrigatorio",
  errNameDuplicate: "Ja existe uma carteira ativa com este nome",
  errAmountPositive: "Valor deve ser maior que zero",
  errOccurredAtPast: "Data nao pode ser anterior ao ultimo movimento",
  // Warnings
  warnArchiveWithBalance: "Esta carteira tem saldo {amount}. Tem certeza que quer arquivar?",
  warnNegativeBalance: "Saldo da carteira ficou negativo",
};
```

**Criterios:**
- [ ] Todas as strings de UI consultam `WALLET_I18N`.
- [ ] Nao ha hardcoded strings em ingles na UI.
- [ ] Mensagens de erro em endpoints retornam pt-BR.

---

### RF-14: Telemetria (`user_activity`)

**Eventos emitidos:**
- `bankroll_wallet_created` `{walletId, platform, nativeCurrency}`
- `bankroll_wallet_archived` `{walletId, platform, balanceAtArchive}`
- `bankroll_wallet_edited` `{walletId, fieldsChanged}`
- `bankroll_transaction_recorded` `{walletId, reason, direction, nativeAmount, nativeCurrency, source}`
- `bankroll_consolidation_viewed` `{walletCount, totalUSD}` (uma vez por sessao)
- `bankroll_v1_to_v2_migrated` `{userId, walletId, originalAmountUSD}` (uma vez)

**Criterios:**
- [ ] Eventos persistidos em `user_activity` via helper existente.
- [ ] Nenhum dado financeiro sensivel alem de valor exposto em logs externos.

---

## Requisitos Nao-Funcionais

- **Performance:** `GET /api/wallets` < 100ms p95. `GET /api/wallets/:id/transactions` com 1000 tx em < 200ms p95 (paginacao + indices).
- **Atomicidade:** Toda mutacao em wallet + tx em UMA transacao SQL com SELECT FOR UPDATE da wallet (espelha ADR-017).
- **Concorrencia:** Dois POST simultaneos em `/api/wallets/:id/transactions`: SELECT FOR UPDATE serializa; segundo aguarda; invariante preservada.
- **Seguranca:** Todos endpoints `requireAuth`. Wallet so acessivel pelo proprio dono (verificacao em service por `userId`). Inserir/editar com `userId` de outro usuario -> 404.
- **Disponibilidade:** Migration v1->v2 nao bloqueia servico (transacao por usuario). Rollback disponivel.
- **Observabilidade:** Logs estruturados em service layer com `userId`, `walletId`, `action`. Erros sempre com stack trace.

## Endpoints Previstos

| Metodo | Rota | Auth | Rate Limit |
|---|---|---|---|
| GET | `/api/wallets` | JWT | sem (cache 30s) |
| POST | `/api/wallets` | JWT | 10/min |
| GET | `/api/wallets/:id` | JWT | sem |
| PUT | `/api/wallets/:id` | JWT | 10/min |
| PATCH | `/api/wallets/:id/archive` | JWT | 10/min |
| DELETE | `/api/wallets/:id` | JWT | 10/min (sempre 405) |
| GET | `/api/wallets/:id/transactions` | JWT | sem |
| POST | `/api/wallets/:id/transactions` | JWT | 10/min |
| GET | `/api/bankroll/consolidated` | JWT | sem |
| GET | `/api/bankroll` (legado) | JWT | sem |

## Modelos de Dados Afetados

Resumo (detalhes em RF-01, RF-03, RF-04, RF-06):

### Novas tabelas
- `wallets` (RF-01)
- `wallet_transactions` (RF-03)

### Tabelas modificadas
- `bankroll_snapshots`: 4 colunas nullable adicionadas (`walletId`, `nativeAmount`, `nativeCurrency`, `fxRateUSDPerNative`)
- `user_settings`: 2 colunas adicionadas (`bankrollAggregationMode`, `bankrollDisplayCurrency`)

### Drizzle migration files
- `migrations/00XX_bankroll_v2_multi_wallet.sql` — gerada via `drizzle-kit push` apos editar `shared/schema.ts`.

## Integracoes Externas

Nenhuma. Tudo local.

## Cenarios de Teste Derivados (Given/When/Then)

### Happy Paths
1. **Criar primeira wallet** — *Given* usuario sem wallets *When* POST /api/wallets com dados validos *Then* 201 + wallet retornada com balance=0.
2. **Registrar deposito** — *Given* wallet ativa com balance 100 *When* POST tx `direction=in, amount=50` *Then* 201 + balance=150 + tx com `previousNativeBalance=100, newNativeBalance=150`.
3. **Listar wallets ordenadas** — *Given* 3 wallets com `displayOrder 0,1,2` *When* GET /api/wallets *Then* retorna na ordem 0,1,2.
4. **Consolidacao multi-currency** — *Given* wallets `[USD 1000, BRL 5000@5.0, USDT 100]` *When* GET /api/bankroll/consolidated *Then* `totalUSD = 1000 + 1000 + 100 = 2100`.

### Migration v1 -> v2
5. **Migrar usuario v1** — *Given* usuario com `bankrollAmount=1000 USD` e 5 snapshots *When* migration roda *Then* 1 wallet "Banca Padrao USD" criada com balance=1000 + 5 snapshots backfilled com walletId.
6. **Re-execucao idempotente** — *Given* usuario ja migrado *When* migration roda novamente *Then* 0 wallets criadas + 0 snapshots tocados.

### Compat v1
7. **GET /api/bankroll legado** — *Given* usuario migrado com 1 wallet USD 1000 *When* GET /api/bankroll *Then* response shape v1: `{configured: true, amount: 1000, ...}` + campo novo `aggregationMode: 'global'`.

### Validacoes
8. **Nome duplicado** — *Given* wallet ativa "GG Main" *When* POST /api/wallets `name='GG Main'` *Then* 400 com `errNameDuplicate`.
9. **Plataforma invalida** — *Given* qualquer estado *When* POST `platform='invalid'` *Then* 400.
10. **Reason fora de P0** — *Given* qualquer estado *When* POST tx `reason='transfer_in'` *Then* 400 "reason nao suportado em P0".
11. **occurredAt no passado** — *Given* wallet com tx em 2026-04-26 *When* POST tx `occurredAt=2026-04-25` *Then* 422 "data anterior ao ultimo movimento".

### Atomicidade
12. **Concorrencia em wallet** — *Given* 10 tx simultaneas POST na mesma wallet *Then* todas processadas serialmente; balance final correto; invariante de ledger preservada.
13. **FX rate imutavel** — *Given* tx criada com BRL=5.0 *When* `user_settings.exchangeRates.BRL` muda para 4.5 *Then* tx antiga ainda mostra `fxRateUSDPerNative=5.0`.

### Edge Cases
14. **Wallet arquivada nao aceita tx** — *Given* wallet `status=archived` *When* POST tx *Then* 409.
15. **Wallet com isShotPocket=true** — *Given* shot pocket com 500 USD *When* GET /api/bankroll/consolidated *Then* nao soma a `totalUSD`; aparece em `shotPockets[]`.
16. **DELETE recusado** — *Given* qualquer wallet *When* DELETE /api/wallets/:id *Then* 405.
17. **Saldo negativo permitido** — *Given* wallet com balance 100 *When* POST tx `direction=out, amount=200` *Then* 201 + balance=-100 + warning `wallet_negative`.

### Compatibilidade reversa
18. **Tournament Selector funciona** — *Given* usuario migrado com 1 wallet *When* GET /api/tournament-selector *Then* funciona normalmente; `bankrollFilter` aplicado em USD consolidado.
19. **Coach AI funciona** — *Given* usuario com wallet *When* Coach pergunta "qual minha banca?" *Then* responde com `consolidatedUSD` via tool atual sem mudanca.
20. **BankrollWidget legado** — *Given* widget no Dashboard *When* renderiza pos-migration *Then* mostra saldo consolidado + breakdown top 3 wallets.

### Telemetria
21. **Evento de criacao** — *Given* novo POST /api/wallets *Then* `user_activity` recebe `bankroll_wallet_created` em <1s.

### UI
22. **Empty state** — *Given* usuario novo sem wallets *When* abre /bankroll *Then* ve CTA "Criar primeira carteira".
23. **Onboarding tooltip** — *Given* usuario migrado abre /bankroll pela primeira vez *Then* ve tooltip explicando wallet automatica.
24. **Color picker** — *Given* form de criacao *When* seleciona cor *Then* preview atualiza ao vivo.

## Fora de Escopo

- **Transferencia cross-wallet** com fee + FX (gera 2 tx via transferGroupId). Vira spec proxima dentro do Sprint Bankroll-2.
- **Pending transactions** (saque/deposito em transito com auto-clear). Vira spec proxima.
- **Stop-loss / stop-win configuravel** com lock funcional no Grind Live. Vira spec proxima.
- **Auto-snapshot pos-sessao** (sessao terminou -> cria tx `session_result`). Vira spec proxima.
- **Dashboard de evolucao por wallet** com graficos + ROI por plataforma. Vira spec proxima.
- **Modo `per_wallet` no Tournament Selector** (filtro por banca da rede do torneio). Vira spec proxima.
- **Cotacao live de cripto** (CoinGecko). Sprint Bankroll-3.
- **Import CSV de extrato de rede.** Sprint Bankroll-3.
- **Staking + makeup tracking.** Sprint Bankroll-3.
- **Export contabil/IR.** Sprint Bankroll-3.
- **DELETE de wallet** (sempre 405 — preservacao historica obrigatoria).
- **DELETE de wallet_transaction** (sempre fora de escopo no Sprint Bankroll-2).
- **API de pagamento, integracao com PSPs.** Veto explicito do plano.
- **Cotacao manual editavel via UI** (editar `user_settings.exchangeRates`). Vira QW separado se priorizado.

## Dependencias

- **QW-1 (fix exchangeRates)** — DEVE estar mergeado primeiro. Multi-wallet usa `currencyNormalizer` na convencao QW-1 para calcular `usdAmount` em cada tx.
- **System-Architect**: cria diagramas C4 + ER + sequence diagrams (transaction flow) + ADR-034 (multi-wallet vs single-bankroll trade-off) + ADR-035 (FX historico imutavel) antes do Test-Writer.

## Notas de Implementacao

- **Ordem de implementacao sugerida:**
  1. Tests TDD (Test-Writer): suite cobrindo RF-01 ate RF-14. Esperado red completo.
  2. Schema Drizzle (RF-01, RF-03, RF-04, RF-06).
  3. `walletService.ts` (RF-07).
  4. Endpoints (RF-09, RF-10, RF-11).
  5. Migration script (RF-08).
  6. UI components (RF-12, RF-13).
  7. Telemetria (RF-14).
- **Cache:** Aproveitar padrao do `bankrollCache` ja existente. Criar `walletCache` analogo.
- **Decimal precision:** Usar `decimal.js` ou string manipulation para calculos com 2 casas (USD/BRL) ou 8 casas (cripto). Evitar float JS.
- **Estimativa:** 5-7 dias-dev (escopo P0). Quebrado: 1d schema + service core, 2d endpoints + tests, 1d migration, 2d UI, 1d polish/edge cases.
- **Risco maior:** UI 2-painés e novidade no projeto. Considerar prototype rapido ou referencia visual.

## Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| Migration falha em usuario com snapshots corrompidos pre-existentes | LOW | HIGH | Migration por usuario (transacao isolada); usuario com erro fica em v1; log + alerta ao admin. |
| BankrollWidget legado quebra apos migration | MED | MED | `GET /api/bankroll` legado mantido como wrapper. Tests de regressao especificos no PR. |
| Concorrencia gera race condition em balance | LOW | HIGH | SELECT FOR UPDATE em todas mutacoes; tests com 10 tx simultaneas. |
| User experience de 2 paineis confunde mobile | MED | MED | Layout responsive: mobile colapsa em accordion (sidebar embaixo, detail em cima). Decidir em arquitetura. |
| Tournament Selector cache stale apos mudanca de wallet | MED | MED | Invalidar `selectorCache.invalidateAllForUser` em qualquer mutacao de wallet (mesmo padrao do v1). |
| Escopo cresce com criatividade UX -> sprint desliza | HIGH | MED | Cortar UI polish para spec separada de UX. P0 entrega CRUD funcional + minimo viavel. |
| Tests existentes do bankroll v1 quebram | HIGH (esperado) | LOW | Atualizar suite no PR; mapear arquivos: `tests/unit/bankroll/*`, `tests/integration/bankroll/*`. |

---

## Open Questions (consolidadas das duas specs)

Ver lista no final do conjunto (na resposta ao founder).
