# Bankroll v2 — Fluxos Multi-Wallet

**Sprint:** Bankroll-2 (Multi-Wallet Foundation)
**ADRs:** ADR-033, ADR-034, ADR-035
**Data:** 2026-04-25

Tres fluxos sequence diagram cobrindo as interacoes criticas do Bankroll v2: criacao de wallet com primeiro deposito, migracao v1->v2 e consumo do endpoint legado por clientes existentes.

---

## Fluxo A — Criacao de wallet + primeiro deposito

**Trigger:** Usuario clica "Nova Carteira" em `/bankroll`.

**Atores:** UI → API → walletService → DB → caches → response.

**Pre-condicoes:**
- Usuario autenticado (JWT).
- Usuario tem < 50 wallets ativas (limite hard).
- Spec: RF-09 + RF-10 da `bankroll-v2-multi-wallet-foundation.md`.

```mermaid
sequenceDiagram
    actor User
    participant UI as WalletCreateDialog
    participant API as POST /api/wallets
    participant Auth as requireAuth
    participant RL as RateLimit 10/min
    participant Svc as walletService
    participant DB as PostgreSQL
    participant Cache as walletCache + bankrollCache + selectorCache
    participant Tel as user_activity

    User->>UI: Preenche nome, plataforma,<br/>moeda nativa, initialDeposit
    UI->>API: POST /api/wallets {name, platform, nativeCurrency, initialDeposit}

    API->>Auth: valida JWT
    Auth-->>API: userId
    API->>RL: check rate limit
    alt Rate limit excedido
        RL-->>UI: 429 Too Many Requests
    end

    API->>API: Zod validate body
    alt Validacao falhou
        API-->>UI: 400 erros pt-BR
    end

    API->>Svc: createWallet(userId, input)

    Note over Svc,DB: Transacao atomica
    Svc->>DB: BEGIN
    Svc->>DB: SELECT count(*) FROM wallets WHERE userId=X AND status='active'
    DB-->>Svc: count

    alt count >= 50
        Svc->>DB: ROLLBACK
        Svc-->>API: 400 wallet_limit_reached
        API-->>UI: 400 com mensagem
    end

    Svc->>DB: SELECT 1 FROM wallets WHERE userId=X AND status='active' AND name=Y
    DB-->>Svc: existing?
    alt name duplicado
        Svc->>DB: ROLLBACK
        Svc-->>API: 400 errNameDuplicate
        API-->>UI: 400 com mensagem
    end

    Svc->>DB: INSERT INTO wallets (id, userId, name, platform, nativeCurrency, balance=0, ...)
    DB-->>Svc: walletId

    alt initialDeposit presente
        Svc->>Svc: pega FX corrente<br/>(user_settings.exchangeRates[ccy] ?? DEFAULT)
        Note over Svc: ADR-033: usdAmount = nativeAmount / fxRate
        Svc->>DB: SELECT FOR UPDATE wallets WHERE id=walletId
        Svc->>DB: INSERT INTO wallet_transactions<br/>(walletId, direction='in', nativeAmount,<br/>fxRateUSDPerNative, usdAmount,<br/>previousNativeBalance=0, newNativeBalance=initialDeposit,<br/>reason='deposit', source='manual')
        Svc->>DB: UPDATE wallets SET balance=initialDeposit
        Svc->>DB: INSERT INTO bankroll_snapshots<br/>(espelho compat v1: walletId, nativeAmount, fxRate, delta_USD, ...)
    end

    Svc->>DB: COMMIT
    DB-->>Svc: ok

    Svc->>Cache: invalidateAllForUser(userId)<br/>(walletCache, bankrollCache, selectorCache)
    Svc->>Tel: emit bankroll_wallet_created<br/>+ bankroll_transaction_recorded (se initialDeposit)

    Svc-->>API: { wallet, transaction?, warnings: [...] }

    alt count == 19 apos insert
        API->>API: adiciona warning approaching_wallet_limit
    end

    API-->>UI: 201 Created
    UI-->>User: Wallet criada,<br/>balance atualizado, lista refresh
```

**Cenarios de erro derivados:**
- Limite 50 wallets atingido → 400 `wallet_limit_reached`.
- Nome duplicado entre ativas → 400 `errNameDuplicate`.
- Plataforma invalida → 400.
- nativeCurrency invalida → 400.
- initialDeposit.amount <= 0 → 400.
- Falha em qualquer step da transacao → ROLLBACK (atomicidade).

---

## Fluxo B — Migracao v1->v2 ao primeiro acesso

**Trigger:** Script manual `tsx server/scripts/migrate-v2-multi-wallet.ts` rodado em deploy. (Alternativamente, lazy migration na primeira chamada de `GET /api/bankroll` foi REJEITADA — ver ADR-035 Opcao D.)

**Atores:** Admin → Script → walletService → DB.

**Pre-condicoes:**
- QW-1 (ADR-033) ja deployed (FX correto).
- Schema v2 ja aplicado (`db:push` rodado).
- Backup do DB feito.

```mermaid
sequenceDiagram
    actor Admin
    participant Script as migrate-v2-multi-wallet.ts
    participant DB as PostgreSQL
    participant Svc as walletService
    participant Log as console.info estruturado

    Admin->>Script: tsx server/scripts/migrate-v2-multi-wallet.ts<br/>(BANKROLL_V2_DRY_RUN=true|false)

    Script->>DB: SELECT users with userSettings.bankrollAmount > 0<br/>AND bankrollV2Migrated IS NOT TRUE
    DB-->>Script: list[N usuarios]

    Script->>Log: info "starting migration", count=N, dryRun=...

    loop Para cada usuario
        Script->>Svc: migrateUserV1toV2(userId)

        Note over Svc,DB: Transacao por usuario
        Svc->>DB: BEGIN
        Svc->>DB: SELECT FOR UPDATE user_settings WHERE userId=X
        DB-->>Svc: bankrollAmount, bankrollRule, bankrollV2Migrated

        alt ja migrado (idempotencia)
            Svc->>DB: ROLLBACK
            Svc-->>Script: { skipped: true, reason: 'already_migrated' }
        end

        Svc->>DB: SELECT count(*) FROM wallets WHERE userId=X
        DB-->>Svc: walletCount

        alt walletCount > 0 (defesa em profundidade)
            Svc->>DB: UPDATE user_settings SET bankrollV2Migrated=true
            Svc->>DB: COMMIT
            Svc-->>Script: { skipped: true, reason: 'has_existing_wallets' }
        end

        alt dryRun
            Svc->>Log: info "would create wallet", userId, originalAmount
            Svc->>DB: ROLLBACK
            Svc-->>Script: { dryRun: true, planned: {...} }
        else
            Svc->>DB: INSERT INTO wallets<br/>(name='Banca Padrao USD', platform='GenericUSD',<br/>nativeCurrency='USD', balance=bankrollAmount,<br/>status='active', isShotPocket=false)
            DB-->>Svc: walletId

            Note over Svc,DB: Backfill retroativo<br/>NAO criar wallet_transactions<br/>(snapshots ja sao audit trail v1)
            Svc->>DB: UPDATE bankroll_snapshots<br/>SET walletId=defaultWallet.id<br/>WHERE userId=X AND walletId IS NULL
            DB-->>Svc: backfillCount

            Svc->>DB: UPDATE user_settings SET bankrollV2Migrated=true
            Svc->>DB: COMMIT

            Svc->>Log: info "migrated", {userId, walletId,<br/>snapshotsBackfilled, originalAmount, durationMs}
            Svc-->>Script: { created: true, walletId, snapshotsBackfilled }
        end
    end

    Script->>Log: info "migration complete",<br/>{total, migrated, skipped, errors}
    Script-->>Admin: Exit 0 ou 1
```

**Cenarios de erro derivados:**
- Snapshots corrompidos pre-existentes → transacao rolla back para o usuario afetado; outros prosseguem; log + alerta admin.
- DB desconectado mid-run → script para; idempotencia permite re-execucao segura.
- BANKROLL_V2_DRY_RUN=true → 0 escritas; output mostra delta planejado.

**Pos-migration (UI):**

```mermaid
sequenceDiagram
    actor User
    participant UI as /bankroll page
    participant API as GET /api/wallets
    participant Svc as walletService

    User->>UI: Abre /bankroll pela primeira vez pos-migration
    UI->>API: GET /api/wallets?includeArchived=false
    API->>Svc: listWallets(userId)
    Svc-->>API: { wallets: [defaultWallet], consolidated: {...} }
    API-->>UI: 200 com wallets

    UI->>UI: Detecta lastBankrollPageVisitV2 == null<br/>+ bankrollV2Migrated == true
    UI-->>User: Tooltip: "Voce tinha banca de $X em USD.<br/>Criamos uma carteira 'Banca Padrao USD' automaticamente.<br/>Adicione mais carteiras para refletir cada plataforma."

    User->>UI: Dismiss tooltip
    UI->>API: PATCH /api/user/settings<br/>{lastBankrollPageVisitV2: now()}
    API-->>UI: 200
```

---

## Fluxo C — GET /api/bankroll legado servindo cliente v1

**Trigger:** Tournament Selector, Coach AI ou BankrollWidget chamam `GET /api/bankroll` para obter banca em USD.

**Atores:** Cliente legado (TS / Coach / Widget) → API → walletService → DB.

**Pre-condicoes:**
- Usuario migrado (`bankrollV2Migrated=true`) OU usuario novo sem wallets ainda.
- Spec: RF-11 da `bankroll-v2-multi-wallet-foundation.md`.

```mermaid
sequenceDiagram
    participant TS as Tournament Selector / Coach AI / BankrollWidget
    participant API as GET /api/bankroll (legado)
    participant Auth as requireAuth
    participant CacheBR as bankrollCache TTL 30s
    participant Svc as walletService
    participant DB as PostgreSQL

    TS->>API: GET /api/bankroll
    API->>Auth: valida JWT
    Auth-->>API: userId

    API->>CacheBR: get(userId)
    alt Cache hit
        CacheBR-->>API: cached state
        API-->>TS: 200 cached
    else Cache miss
        API->>Svc: getConsolidatedBalance(userId)

        Svc->>DB: SELECT wallets WHERE userId=X<br/>AND status='active' AND isShotPocket=false
        DB-->>Svc: activeWallets

        Svc->>DB: SELECT user_settings WHERE userId=X
        DB-->>Svc: { bankrollRule, exchangeRates,<br/>bankrollAggregationMode, bankrollDisplayCurrency }

        loop Para cada wallet ativa
            Svc->>Svc: balanceUSD = wallet.balance / FX(wallet.nativeCurrency)
            Note over Svc: ADR-033: usd = native / rate
        end

        Svc->>Svc: totalUSD = sum(balanceUSD)<br/>shotPockets = wallets isShotPocket=true (separado)

        Svc-->>API: { totalUSD, byWallet, shotPockets,<br/>aggregationMode, displayCurrency }

        Note over API: Mapeia para shape v1
        API->>API: amount = totalUSD<br/>currency = "USD"<br/>rule = userSettings.bankrollRule<br/>softLimitUSD = totalUSD * rulePct / 100<br/>hardLimitUSD = softLimitUSD * 1.5 (ADR-018)<br/>maxBuyInUSD = hardLimitUSD<br/>maxBuyInDisplay.BRL = hardLimitUSD * exchangeRates.BRL<br/>aggregationMode = NEW<br/>walletCount = byWallet.length (NEW)

        API->>CacheBR: set(userId, state, ttl=30s)
        API-->>TS: 200 v1-shape + 2 campos novos
    end

    TS->>TS: Aplica logica nativa<br/>(filter por hardLimitUSD,<br/>responde "qual minha banca?",<br/>renderiza widget)
```

**Comportamento por consumidor:**

| Consumidor | Le | Comportamento |
|---|---|---|
| **Tournament Selector** | `hardLimitUSD`, `bankrollFilter` | Filtra torneios `buyInUSD > hardLimitUSD`. Cache do selector invalida em qualquer mutacao de wallet. |
| **Coach AI** | `amount`, `currency`, `rule`, `walletCount` | Tool `get_bankroll_status` responde "voce tem $X consolidados em N carteiras". |
| **BankrollWidget legado** | shape v1 completo + `walletCount` | Renderiza saldo consolidado; em v2 adiciona breakdown top 3 wallets como nota. |

**Cenarios derivados:**
- Usuario sem wallets (novo OU sem `bankrollAmount` v1) → `totalUSD=0, walletCount=0`, shape `{configured: false, ...}`.
- Usuario com 1 wallet (post-migration default) → totalUSD=balance daquela wallet.
- Usuario com 4 wallets multi-currency → totalUSD = soma convertida; byWallet com share de cada.
- Mode `per_wallet` setado → API ainda retorna `softLimitUSD`/`hardLimitUSD` em modo global (Tournament Selector P0 nao reage diferente).

---

## Cenarios de Teste Derivados (alto nivel)

### Fluxo A — Criacao + deposito
- [ ] Happy path: criar wallet com initialDeposit USD → wallet com balance, 1 wallet_tx, 1 snapshot espelho.
- [ ] Happy path: criar wallet sem initialDeposit → balance=0, sem wallet_tx.
- [ ] Limite: 50a wallet ativa rejeitada com 400.
- [ ] Warning: 20a wallet retorna `warnings: ['approaching_wallet_limit']`.
- [ ] Concorrencia: 2 POST simultaneos com mesmo nome → SELECT FOR UPDATE serializa, segundo retorna 400.
- [ ] FX historico: criar wallet BRL com initialDeposit, mudar `exchangeRates.BRL`, primeira tx mantem `fxRate` original.

### Fluxo B — Migracao v1->v2
- [ ] Usuario v1 com bankrollAmount > 0 → wallet default criada com balance correto.
- [ ] Snapshots existentes recebem walletId retroativo.
- [ ] Re-execucao: 0 wallets criadas (idempotencia).
- [ ] DRY_RUN=true: 0 escritas, log mostra delta planejado.
- [ ] Usuario sem bankrollAmount → pulado.
- [ ] Rollback: `rollback-v2-multi-wallet.ts` deleta wallet + restaura snapshots.walletId=NULL.

### Fluxo C — GET /api/bankroll legado
- [ ] Tournament Selector recebe `hardLimitUSD` consolidado em modo global.
- [ ] Coach AI recebe shape v1 + `walletCount`.
- [ ] Cache hit em request consecutivo (TTL 30s).
- [ ] Cache invalida em POST /api/wallets/:id/transactions.
- [ ] Usuario sem wallets → `configured: false`.
- [ ] Usuario com shot pocket → totalUSD nao soma; widget legado nao ve.

---

## Referencias

- ADR-033: convencao FX `units per 1 USD`.
- ADR-034: modelo multi-wallet com FX historico imutavel.
- ADR-035: compatibilidade v1->v2 e migracao.
- Spec: `Docs/specs/bankroll-v2-multi-wallet-foundation.md`.
- Data model ER: `Docs/architecture/data-model/bankroll-v2.md`.
- C4 component: `Docs/architecture/c4/component-bankroll.md`.
- API docs: `Docs/api/wallets.md`, `Docs/api/bankroll.md`.
