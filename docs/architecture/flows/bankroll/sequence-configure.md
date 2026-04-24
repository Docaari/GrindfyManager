# Sequence: Configuracao de Banca (`PUT /api/bankroll`)

Fluxo atomico de atualizacao de banca (primeira configuracao ou mudanca de valor). Garante transacao + snapshot + invalidacao de cache.

## Atores
- **Jogador** (frontend)
- **Settings.tsx** (UI)
- **BankrollMovementDialog.tsx** (UI)
- **routes/bankroll.ts** (HTTP handler)
- **bankrollService** (dominio)
- **bankrollRules** (puro)
- **storage** (Drizzle + transacao)
- **selectorCache** (invalidacao)
- **PostgreSQL**

## Cenario A: Primeira configuracao

```mermaid
sequenceDiagram
    autonumber
    actor J as Jogador
    participant UI as Settings.tsx
    participant R as routes/bankroll.ts
    participant S as bankrollService
    participant BR as bankrollRules
    participant ST as storage
    participant DB as PostgreSQL
    participant SC as selectorCache

    J->>UI: input amount=1000, rule="1pct", clica Salvar
    UI->>UI: valida localmente (amount>0, rule matches regex)
    UI->>R: PUT /api/bankroll {amount:1000, rule:"1pct", reason:"initial"}
    R->>R: rate-limit check (10/min por userId)
    R->>R: JWT auth + ownership implicito (req.user.userPlatformId)
    R->>S: updateBankroll(userId, {amount:1000, rule:"1pct", reason:"initial"})

    S->>BR: parseRule("1pct") -> {pct:1.0, valid:true}
    BR-->>S: {pct:1.0}

    S->>ST: BEGIN transaction
    S->>ST: SELECT bankroll_amount FROM user_settings WHERE user_id=? FOR UPDATE
    ST->>DB: SELECT ... FOR UPDATE
    DB-->>ST: {bankroll_amount: null}
    ST-->>S: previousAmount = null (-> 0 para calculo de delta)

    S->>S: valida reason: primeira configuracao forca "initial" (spec RF-02)
    S->>ST: UPDATE user_settings SET bankroll_amount=1000, bankroll_rule='1pct', updated_at=NOW() WHERE user_id=?
    ST->>DB: UPDATE user_settings ...
    DB-->>ST: ok

    S->>ST: INSERT INTO bankroll_snapshots (id, user_id, occurred_at, delta, previous_amount, new_amount, reason, source) VALUES (nanoid, ?, NOW(), 1000, 0, 1000, 'initial', 'manual')
    ST->>DB: INSERT ...
    DB-->>ST: {id: "abc123..."}

    S->>ST: COMMIT
    ST->>DB: COMMIT
    DB-->>ST: ok

    S->>SC: invalidateUserSelectorCache(userId)
    SC-->>S: ok (fire-and-forget)

    S->>BR: computeThresholds({amount:1000, rule:"1pct"}) -> {softLimitUSD: 10, hardLimitUSD: 15}
    BR-->>S: {softLimitUSD: 10, hardLimitUSD: 15, maxBuyInUSD: 15}

    S-->>R: {configured:true, amount:1000, rule:"1pct", rulePct:1.0, maxBuyInUSD:15, snapshot:{id, delta:1000, ...}}
    R-->>UI: 200 OK {bankroll shape}
    UI->>UI: React Query invalidateQueries(['bankroll']) + (['bankrollHistory'])
    UI->>J: Toast "Banca configurada" + refresh do card
```

## Cenario B: Atualizar apenas `rule` (amount inalterado)

```mermaid
sequenceDiagram
    autonumber
    actor J as Jogador
    participant UI as Settings.tsx
    participant R as routes/bankroll.ts
    participant S as bankrollService
    participant ST as storage
    participant DB as PostgreSQL
    participant SC as selectorCache

    J->>UI: muda select de "1pct" para "2pct", clica Salvar
    UI->>R: PUT /api/bankroll {amount:1000, rule:"2pct"}  (amount nao mudou)
    R->>S: updateBankroll(userId, {amount:1000, rule:"2pct"})

    S->>ST: BEGIN transaction
    S->>ST: SELECT bankroll_amount FROM user_settings WHERE user_id=? FOR UPDATE
    ST-->>S: {bankroll_amount: 1000}
    S->>S: amount inalterado (1000==1000) -> NAO cria snapshot

    S->>ST: UPDATE user_settings SET bankroll_rule='2pct', updated_at=NOW() WHERE user_id=?
    ST-->>S: ok
    S->>ST: COMMIT

    S->>SC: invalidateUserSelectorCache(userId)
    S-->>R: {configured:true, amount:1000, rule:"2pct", rulePct:2.0, maxBuyInUSD:30, ...}
    R-->>UI: 200 OK
```

## Cenario C: Registrar aporte (`POST /api/bankroll/snapshot`)

```mermaid
sequenceDiagram
    autonumber
    actor J as Jogador
    participant UI as BankrollMovementDialog.tsx
    participant R as routes/bankroll.ts
    participant S as bankrollService
    participant ST as storage
    participant DB as PostgreSQL
    participant SC as selectorCache

    J->>UI: abre dialog, preenche delta=500, reason="deposit", note="PIX"
    UI->>R: POST /api/bankroll/snapshot {delta:500, reason:"deposit", note:"PIX"}
    R->>R: rate-limit 10/min
    R->>S: recordSnapshot(userId, {delta:500, reason:"deposit", note:"PIX"})

    S->>ST: BEGIN transaction
    S->>ST: SELECT bankroll_amount FROM user_settings WHERE user_id=? FOR UPDATE
    ST-->>S: {bankroll_amount: 1000}
    S->>S: newAmount = 1000 + 500 = 1500
    S->>S: if (newAmount < 0) log warning (Q6: permite negativo)

    S->>ST: UPDATE user_settings SET bankroll_amount=1500, updated_at=NOW() WHERE user_id=?
    S->>ST: INSERT INTO bankroll_snapshots (delta:500, previous_amount:1000, new_amount:1500, reason:'deposit', note:'PIX', source:'manual', occurred_at:NOW())
    S->>ST: COMMIT

    S->>SC: invalidateUserSelectorCache(userId)
    S-->>R: {snapshot:{...}, bankroll:{amount:1500, ...}}
    R-->>UI: 201 Created
    UI->>UI: invalidateQueries(['bankroll', 'bankrollHistory'])
    UI->>J: Toast "Aporte registrado" + atualiza card + tabela
```

## Invariantes garantidas pelo fluxo

1. **Atomicidade:** UPDATE + INSERT sempre na mesma transacao. Falha em uma aborta a outra. `user_settings.bankroll_amount` nunca fica dessincronizado com ultimo snapshot.
2. **Serializacao:** `SELECT ... FOR UPDATE` previne race em `previousAmount` (Q-Arch-3).
3. **Side-effects nao-transacionais apos commit:** cache invalidation acontece DEPOIS do commit. Se der erro na invalidacao (cache sem conexao), banca ja foi persistida — proximo request do Selector usa cache stale mas eventualmente expira (TTL 30min).
4. **Idempotencia do cache:** `invalidateUserSelectorCache` e idempotente — chamada 2x nao quebra.
5. **Ordem temporal:** `occurred_at` usa `NOW()` servidor, evitando clock skew do cliente. Usuario pode informar `occurredAt` no body (apenas para `POST /snapshot`, retroativo permitido, futuro proibido).

## Cenarios de erro

| Cenario | Resposta | Fluxo |
|---------|----------|-------|
| JWT invalido | 401 | middleware bloqueia |
| Rate limit (>10 req/min) | 429 | `rateLimiter` antes do handler |
| `amount < 0` | 400 `"bankrollAmount nao pode ser negativo"` | validacao Zod |
| `rule: "custom:0.05"` (< 0.1) | 400 `"Custom rule deve estar entre 0.1% e 20%"` | `parseRule` retorna invalid |
| `reason` obrigatorio nao fornecido em usuario ja configurado | 400 `"reason obrigatorio"` | service valida antes da transacao |
| Falha no INSERT do snapshot | 500 + rollback | transacao aborta, UPDATE nao persiste |
| Falha em `invalidateUserSelectorCache` | 200 OK + log warning | side-effect nao crítico |
| 2 requests simultaneos de POST /snapshot | ambos completam em serie via FOR UPDATE | segundo le `previousAmount` atualizado do primeiro |

## Dados Persistidos por Cenario

### Cenario A (primeira config)
- `user_settings.bankroll_amount`: null -> 1000
- `user_settings.bankroll_rule`: '1pct' (default) -> '1pct' (confirma)
- `bankroll_snapshots`: **1 row nova** `{delta:1000, previousAmount:0, newAmount:1000, reason:'initial', source:'manual'}`

### Cenario B (rule only)
- `user_settings.bankroll_rule`: '1pct' -> '2pct'
- `bankroll_snapshots`: **sem insert**

### Cenario C (aporte)
- `user_settings.bankroll_amount`: 1000 -> 1500
- `bankroll_snapshots`: **1 row nova** `{delta:500, previousAmount:1000, newAmount:1500, reason:'deposit', note:'PIX', source:'manual'}`
