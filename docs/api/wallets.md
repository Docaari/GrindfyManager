# Wallets — API Endpoints (Sprint Bankroll-2)

Documentacao dos endpoints HTTP do Sprint Bankroll-2 (`Docs/specs/bankroll-v2-multi-wallet-foundation.md`).

Banca multi-wallet com FX historico imutavel. Cada wallet tem sua moeda nativa; consolidacao em USD usa convencao ADR-033 (`exchangeRates[ccy] = ccy units per 1 USD`, `usd = native / rate`).

Todos os endpoints exigem JWT (`requireAuth`). Mutacoes (POST, PUT, PATCH): rate limit 10/min por `userPlatformId`. Reads: cache em memoria 30s.

**ADRs aplicados:** ADR-017 (invariantes ledger), ADR-018 (tolerancia 1.5x), ADR-033 (FX), ADR-034 (modelo multi-wallet), ADR-035 (compat v1->v2).

---

## GET /api/wallets

**Descricao:** Lista wallets do usuario + summary consolidado.

**Auth:** JWT obrigatorio.

**Query params:**
| Param | Tipo | Default | Notas |
|---|---|---|---|
| includeArchived | boolean | false | Se true, inclui wallets `status='archived'` |

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
    "aggregationMode": "global",
    "walletCount": 4,
    "shotPocketCount": 0
  },
  "warnings": []
}
```

**Regras:**
- Default oculta `status='archived'`.
- Ordenado por `displayOrder ASC, createdAt ASC`.
- `consolidated.totalUSD = sum(wallet.balance / FX(nativeCurrency))` para `status='active' AND isShotPocket=false`.
- `warnings` inclui `approaching_wallet_limit` se >= 20 wallets ativas.

**Response 401:** Sem JWT.

---

## POST /api/wallets

**Descricao:** Cria wallet. Aceita `initialDeposit` opcional gerando 1 wallet_transaction inicial atomicamente.

**Auth:** JWT obrigatorio.
**Rate limit:** 10/min.

**Request body:**
| Campo | Tipo | Obrigatorio | Notas |
|---|---|---|---|
| name | string | Sim | trim, 1-80 chars, unique entre wallets ativas do usuario |
| platform | enum | Sim | `WALLET_PLATFORMS` (15 valores) |
| nativeCurrency | enum | Sim | `USD\|BRL\|EUR\|GBP\|CNY\|USDT\|BTC` |
| color | string | Nao | hex `#RRGGBB` |
| isShotPocket | boolean | Nao | default `false` |
| bankrollRule | string | Nao | regex `^(1pct\|2pct\|5pct\|custom:\d+(\.\d+)?)$` |
| initialDeposit | object | Nao | `{ amount > 0, note?: max 500 }` |

**Body exemplo (sem deposito):**
```json
{
  "name": "Suprema Clube X",
  "platform": "Suprema",
  "nativeCurrency": "BRL",
  "color": "#3366FF",
  "isShotPocket": false
}
```

**Body exemplo (com deposito inicial):**
```json
{
  "name": "GG Main",
  "platform": "GGNetwork",
  "nativeCurrency": "USD",
  "initialDeposit": { "amount": 500, "note": "transferencia inicial PIX" }
}
```

**Response 201:**
```json
{
  "wallet": {
    "id": "wlt_xyz789",
    "name": "GG Main",
    "platform": "GGNetwork",
    "nativeCurrency": "USD",
    "balance": "500.00",
    "status": "active",
    ...
  },
  "transaction": {
    "id": "wtx_abc123",
    "walletId": "wlt_xyz789",
    "direction": "in",
    "nativeAmount": "500.00",
    "fxRateUSDPerNative": "1.0",
    "usdAmount": "500.00",
    "reason": "deposit",
    ...
  },
  "warnings": []
}
```

**Regras de negocio:**
- Limite hard 50 wallets ativas/usuario: 400 `wallet_limit_reached`.
- Warning `approaching_wallet_limit` em response se a wallet criada e a 20a+.
- Nome duplicado entre ativas: 400 `errNameDuplicate`.
- Plataforma fora do enum: 400.
- nativeCurrency fora do enum: 400.
- bankrollRule invalido: 400.
- initialDeposit.amount <= 0: 400.
- Tudo em 1 transacao com SELECT FOR UPDATE.

**Response 400:** Validacao Zod ou regra de negocio (mensagem em pt-BR).
**Response 401:** Sem JWT.
**Response 429:** Rate limit excedido.

---

## GET /api/wallets/:id

**Descricao:** Detalhe da wallet + ultimas 5 transactions para contexto.

**Auth:** JWT.

**Response 200:**
```json
{
  "wallet": {
    "id": "wlt_xyz789",
    "name": "GG Main",
    ...
  },
  "lastTransactionAt": "2026-04-26T15:00:00Z",
  "recentTransactions": [
    { "id": "wtx_...", "direction": "in", "nativeAmount": "100", ... }
  ]
}
```

**Response 401:** Sem JWT.
**Response 404:** Wallet nao existe ou nao pertence ao usuario.

---

## PUT /api/wallets/:id

**Descricao:** Atualiza wallet. Apenas campos editaveis.

**Auth:** JWT. Rate limit 10/min.

**Request body (parcial):**
| Campo | Tipo | Editavel? |
|---|---|---|
| name | string | Sim |
| color | string | Sim |
| displayOrder | integer | Sim |
| bankrollRule | string | Sim |
| isShotPocket | boolean | Sim |
| platform | enum | NAO (imutavel) |
| nativeCurrency | enum | NAO (imutavel) |
| balance | decimal | NAO (so via wallet_transactions) |
| status | enum | NAO (use PATCH /archive) |

**Response 200:** wallet atualizada.

**Response 400:** Tentativa de mudar campo imutavel ou name duplicado.
**Response 404:** Wallet nao existe.

---

## PATCH /api/wallets/:id/archive

**Descricao:** Arquiva wallet (`status='archived'`). NAO deleta — preserva audit trail.

**Auth:** JWT. Rate limit 10/min.

**Body:** vazio.

**Response 200:**
```json
{
  "wallet": { ..., "status": "archived" },
  "warning": "wallet_archived_with_balance"
}
```

**Regras:**
- Wallet com `balance != 0`: aceita arquivar; retorna `warning: wallet_archived_with_balance`.
- Wallet ja archived: idempotente (200 sem warning).
- Wallet com transactions futuras nao processadas (Sprint futuro): bloqueia 409 `pending_transactions`.

**Response 401:** Sem JWT.
**Response 404:** Wallet nao existe.

---

## DELETE /api/wallets/:id

**Descricao:** **SEMPRE 405**. Wallets nao podem ser deletadas — apenas arquivadas.

**Response 405:**
```json
{
  "error": "method_not_allowed",
  "message": "Wallets nao podem ser deletadas. Use PATCH /api/wallets/:id/archive para preservar historico."
}
```

---

## GET /api/wallets/:id/transactions

**Descricao:** Lista paginada de movimentos + summary por reason.

**Auth:** JWT.
**Cache:** 30s por (walletId, query params).

**Query params:**
| Param | Tipo | Default | Notas |
|---|---|---|---|
| limit | int | 50 | max 200 |
| offset | int | 0 | paginacao |
| from | ISO date | — | filtro inicial |
| to | ISO date | — | filtro final |
| reason | csv enum | todos | filtra reasons |

**Response 200:**
```json
{
  "transactions": [
    {
      "id": "wtx_xyz789",
      "walletId": "wlt_abc123",
      "occurredAt": "2026-04-26T15:00:00Z",
      "effectiveAt": "2026-04-26T15:00:00Z",
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
  "pagination": {
    "total": 142,
    "limit": 50,
    "offset": 0
  },
  "summary": {
    "totalDepositsNative": "5000.00",
    "totalWithdrawalsNative": "1000.00",
    "totalSessionPnLNative": "234.50",
    "totalManualAdjustmentsNative": "0.00",
    "netNative": "4234.50",
    "nativeCurrency": "USD"
  }
}
```

**Response 401:** Sem JWT.
**Response 404:** Wallet nao existe.

---

## POST /api/wallets/:id/transactions

**Descricao:** Registra movimento (deposit, withdrawal, session_result, manual_adjustment).

**Auth:** JWT. Rate limit 10/min.

**Request body:**
| Campo | Tipo | Obrigatorio | Notas |
|---|---|---|---|
| direction | enum | Sim | `in\|out` |
| nativeAmount | number | Sim | > 0 |
| reason | enum | Sim | P0: `deposit\|withdrawal\|session_result\|manual_adjustment` |
| note | string | Nao | max 500 chars |
| occurredAt | ISO datetime | Sim | nao no futuro; nao anterior a ultima tx |
| sessionId | string | Condicional | obrigatorio se reason=`session_result`; deve existir e pertencer ao usuario |

**Body exemplo (deposito):**
```json
{
  "direction": "in",
  "nativeAmount": 500,
  "reason": "deposit",
  "note": "depositos da semana",
  "occurredAt": "2026-04-26T14:00:00Z"
}
```

**Body exemplo (resultado de sessao):**
```json
{
  "direction": "in",
  "nativeAmount": 234.50,
  "reason": "session_result",
  "occurredAt": "2026-04-26T22:00:00Z",
  "sessionId": "ses_abc123"
}
```

**Response 201:**
```json
{
  "transaction": { ... },
  "wallet": { ..., "balance": "1734.50" },
  "warning": null
}
```

`warning` pode ser `wallet_negative` quando `newNativeBalance < 0`.

**Regras de negocio:**
- Wallet `archived`: 409 `wallet_archived`.
- nativeAmount <= 0: 400.
- reason fora de P0 (ex: `transfer_in`): 400 `reason_not_supported_in_p0`.
- occurredAt > now(): 400.
- occurredAt anterior ao ultimo tx: 422 `out_of_order` (proteger ordem temporal).
- Em transacao: SELECT FOR UPDATE wallet → recalcula balance → INSERT tx → UPDATE wallet → INSERT espelho em bankroll_snapshots.
- FX corrente: `user_settings.exchangeRates[ccy] ?? DEFAULT_EXCHANGE_RATES[ccy]` (ADR-033).
- Para `nativeCurrency='USD'`: `fxRateUSDPerNative=1.0`.
- Para `nativeCurrency != 'USD'`: snapshot do FX no insert; IMUTAVEL pos-insert.

**Response 400/401/404/409/422/429:** Validacao, auth, wallet nao existe, archived, ordem temporal, rate limit.

---

## GET /api/bankroll/consolidated (NOVO — substituto moderno do legado)

**Descricao:** Saldo consolidado + breakdown por wallet. Substitui `GET /api/bankroll` para clientes v2.

**Auth:** JWT.
**Cache:** 30s por userId.

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
    },
    {
      "walletId": "wlt_def456",
      "name": "Suprema Clube X",
      "platform": "Suprema",
      "nativeCurrency": "BRL",
      "balanceNative": "5000.00",
      "balanceUSD": "1000.00",
      "share": 0.184,
      "isShotPocket": false
    }
  ],
  "shotPockets": [],
  "lastUpdatedAt": "2026-04-26T15:00:00Z"
}
```

**Regras:**
- `share = balanceUSD / totalUSD` (4 casas decimais).
- Em `aggregationMode='global'`: `softLimitUSD/hardLimitUSD` derivados da soma. Em `per_wallet`: ambos `null` (cliente usa `byWallet[].rule` se presente).
- `shotPockets` listado separadamente (NAO soma a `totalUSD`).
- `displayCurrency` controla `totalDisplayCurrency`. P0 suporta `USD` e `BRL`.

---

## Modelos de Dados Afetados

### Tabelas novas
- `wallets` (RF-01 da spec)
- `wallet_transactions` (RF-03)
- `wallet_pending` (RF-03 — reservada, sem comportamento P0)

### Tabelas modificadas
- `bankroll_snapshots`: 4 colunas nullable (`walletId`, `nativeAmount`, `nativeCurrency`, `fxRateUSDPerNative`).
- `user_settings`: 3 colunas (`bankrollAggregationMode='global'` default, `bankrollDisplayCurrency='USD'` default, `bankrollV2Migrated=false` default), `lastBankrollPageVisitV2` nullable.

### Migration files
- `migrations/00XX_bankroll_v2_multi_wallet.sql` — gerada via `db:push` apos editar `shared/schema.ts`.

---

## Invariantes (ADR-017 transposta)

1. `wallet.balance == ultimo wallet_transactions.newNativeBalance` por walletId (espelho autoritativo).
2. `wallet_transactions[N+1].previousNativeBalance == wallet_transactions[N].newNativeBalance` por walletId ordenado por occurredAt.
3. `fxRateUSDPerNative` IMUTAVEL pos-insert (nunca UPDATE).
4. `nativeCurrency='USD' => fxRateUSDPerNative=1.0`.
5. INSERT em wallet_transactions sempre em transacao com UPDATE wallet.balance.
6. `wallet.status='archived'`: rejeita novas transactions (409).

---

## Integracao com Tournament Selector

`GET /api/tournament-selector` continua filtrando por banca consolidada em USD. Em modo `global` (default):
- `bankrollThresholdUSD = consolidated.softLimitUSD`
- `bankrollHardLimitUSD = consolidated.hardLimitUSD`

Cache do selector e invalidado a cada mutacao de wallet (`POST /api/wallets`, `POST /api/wallets/:id/transactions`, `PUT /api/wallets/:id`, `PATCH /api/wallets/:id/archive`).

Modo `per_wallet` no selector vira **spec separada** (P0 nao reage diferente).

---

## Telemetria (`user_activity`)

Eventos emitidos:
- `bankroll_wallet_created` `{walletId, platform, nativeCurrency}`
- `bankroll_wallet_archived` `{walletId, platform, balanceAtArchive}`
- `bankroll_wallet_edited` `{walletId, fieldsChanged}`
- `bankroll_transaction_recorded` `{walletId, reason, direction, nativeAmount, source}`
- `bankroll_consolidation_viewed` `{walletCount, totalUSD}` (1x/sessao)
- `bankroll_v1_to_v2_migrated` `{userId, walletId, originalAmountUSD}` (1x)

---

## Referencias

- Spec: `Docs/specs/bankroll-v2-multi-wallet-foundation.md`
- Spec QW-1: `Docs/specs/bankroll-v2-qw1-fix-exchange-rates.md`
- ADR-033: `Docs/architecture/decisions/033-fx-rate-convention-units-per-usd.md`
- ADR-034: `Docs/architecture/decisions/034-multi-wallet-with-immutable-fx.md`
- ADR-035: `Docs/architecture/decisions/035-bankroll-v1-to-v2-migration.md`
- Data model: `Docs/architecture/data-model/bankroll-v2.md`
- Class diagram: `Docs/architecture/data-model/bankroll-v2-classes.md`
- C4 component: `Docs/architecture/c4/component-bankroll.md`
- Fluxos: `Docs/architecture/flows/bankroll-multi-wallet.md`
- Bankroll legado: `Docs/api/bankroll.md`
