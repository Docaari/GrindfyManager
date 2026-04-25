# Bankroll Management — API Endpoints (Sprint 2)

Documentacao dos 4 endpoints HTTP do Sprint 2 (`docs/specs/bankroll-management.md`). Banca sempre em USD; conversao para BRL/outras feita pelo `currencyNormalizer` (Sprint 1) usando `user_settings.exchangeRates`.

Todos os endpoints exigem JWT. Mutacoes (PUT, POST) tem rate limit dedicado de 10 req/min por `userPlatformId`. Leituras (GET) sem rate limit.

---

## GET /api/bankroll

**Descricao:** Retorna estado atual da banca + regra + maxBuyIn derivado.

**Auth:** JWT obrigatorio.

**Response 200 (banca configurada):**
```json
{
  "configured": true,
  "amount": 1000.00,
  "currency": "USD",
  "rule": "1pct",
  "rulePct": 1.0,
  "tolerance": 1.5,
  "softLimitUSD": 10.00,
  "hardLimitUSD": 15.00,
  "maxBuyInUSD": 15.00,
  "maxBuyInDisplay": { "USD": 15.00, "BRL": 75.00 },
  "lastUpdatedAt": "2026-04-25T18:00:00-03:00",
  "snapshotCount": 37
}
```

**Response 200 (banca nao configurada):**
```json
{
  "configured": false,
  "amount": null,
  "rule": "1pct",
  "rulePct": 1.0,
  "softLimitUSD": null,
  "hardLimitUSD": null,
  "maxBuyInUSD": null,
  "lastUpdatedAt": null,
  "snapshotCount": 0
}
```

**Regras:**
- `configured = true` quando `bankrollAmount != null && bankrollAmount > 0`.
- `softLimitUSD = amount * rulePct / 100` (regra estrita).
- `hardLimitUSD = softLimitUSD * 1.5` (tolerancia hardcoded — ADR-018).
- `maxBuyInUSD === hardLimitUSD` (alias historico mantido para compat com Sprint 1).
- `maxBuyInDisplay.BRL` calculado via `exchangeRates.BRL` ou `DEFAULT_EXCHANGE_RATES.BRL`.
- `rule: "custom:X"` retorna `rulePct: X` (X validado 0.1-20.0 com 1 casa decimal).

**Response 401:** Sem JWT.

---

## PUT /api/bankroll

**Descricao:** Atualiza amount e/ou rule. Cria snapshot automaticamente se amount mudou. Operacao atomica (transacao).

**Auth:** JWT obrigatorio.
**Rate limit:** 10 req/min por userPlatformId.

**Request body:**
| Campo | Tipo | Obrigatorio | Notas |
|---|---|---|---|
| amount | number\|null | Sim | USD, >= 0. null desconfigura banca. |
| rule | string | Nao | `1pct` \| `2pct` \| `5pct` \| `custom:X`. Default `1pct`. |
| reason | enum | Condicional | Obrigatorio quando ja existe banca configurada e amount muda. Primeira config forca `initial`. |
| note | string | Nao | Max 500 chars. |

**Body exemplo (primeira config):**
```json
{ "amount": 1000, "rule": "1pct", "reason": "initial" }
```

**Body exemplo (mudanca de amount):**
```json
{
  "amount": 1500,
  "rule": "1pct",
  "reason": "deposit",
  "note": "PIX R$ 7800 transferido em 25/04"
}
```

**Body exemplo (so muda rule, sem snapshot):**
```json
{ "amount": 1000, "rule": "2pct" }
```

**Response 200:** Mesmo shape de `GET /api/bankroll` apos atualizacao.

**Regras de negocio:**
- Apenas rule mudou + amount inalterado: NAO cria snapshot.
- Amount mudou: cria snapshot dentro da transacao com `delta = newAmount - previousAmount`.
- `custom:X`: X em [0.1, 20.0] com 1 casa decimal (Q2). Fora rejeita 400.
- `custom:0.05` ou `custom:25`: 400 com mensagem.
- `custom:3.55` (2 casas): 400.
- Falha em INSERT do snapshot aborta UPDATE da banca (atomicidade).
- Apos commit: `selectorCache.invalidateAllForUser(userId)` + `bankrollCache.invalidateAllForUser(userId)`.
- HIGH-2 fix (UX-2 2026-04-25): pre-cria row de `user_settings` antes do `SELECT FOR UPDATE` para serializar concorrencia em primeira config.

**Response 400:** Validacao Zod falhou (note > 500, amount negativo, rule invalida, custom fora de range, reason ausente em mudanca de amount).

**Response 401:** Sem JWT.

**Response 429:** Rate limit excedido (11a chamada em 60s).

---

## POST /api/bankroll/snapshot

**Descricao:** Registra movimento manual (aporte, saque, ajuste). Endpoint dedicado para operacoes que nao mudam configuracao da regra. NAO idempotente.

**Auth:** JWT obrigatorio.
**Rate limit:** 10 req/min por userPlatformId.

**Request body:**
| Campo | Tipo | Obrigatorio | Notas |
|---|---|---|---|
| delta | number | Sim | USD, != 0. Negativo = saque. |
| reason | enum | Sim | `deposit` \| `withdrawal` \| `session_result` \| `manual_adjustment`. NUNCA `initial` (so PUT). |
| note | string | Nao | Max 500 chars. |
| occurredAt | ISO datetime | Nao | Default now(). NAO permite futuro. |

**Body exemplo (aporte):**
```json
{ "delta": 500, "reason": "deposit", "note": "Saque do BetCris" }
```

**Body exemplo (saque retroativo):**
```json
{
  "delta": -300,
  "reason": "withdrawal",
  "note": "PIX para conta corrente",
  "occurredAt": "2026-04-23T20:30:00-03:00"
}
```

**Response 201:**
```json
{
  "snapshot": {
    "id": "abc123",
    "occurredAt": "2026-04-25T15:30:00-03:00",
    "delta": 500.00,
    "previousAmount": 1000.00,
    "newAmount": 1500.00,
    "reason": "deposit",
    "note": "Saque do BetCris",
    "source": "manual"
  },
  "bankroll": { /* shape do GET /api/bankroll atualizado */ },
  "warning": "bankroll_negative"
}
```

`warning` so aparece quando `newAmount < 0` (Q6: permite com aviso).

**Regras de negocio:**
- `delta = 0` rejeita 400.
- `reason: "initial"` rejeita 400 (so PUT pode usar).
- `occurredAt > now()` rejeita 400.
- Banca nao configurada: 409 `"Configure a banca antes de registrar movimentos"`.
- Banca chega a negativo: aceita com `warning: "bankroll_negative"`.
- 2 requests simultaneos: serializados via `SELECT FOR UPDATE` (ADR-017 garante invariante `snapshot[n+1].previousAmount == snapshot[n].newAmount`).

**Response 400/401/429:** Como acima.

**Response 409:** Banca nao configurada.

---

## GET /api/bankroll/history

**Descricao:** Historico de snapshots com paginacao + serie temporal + summary. Cache TTL 5min por `(userId, from, to, granularity, reason)`.

**Auth:** JWT obrigatorio.

**Query params:**
| Param | Tipo | Default | Notas |
|---|---|---|---|
| from | ISO date | 90 dias atras | Inicio da janela |
| to | ISO date | hoje | Fim da janela |
| granularity | `day`\|`week`\|`month` | `day` | Bucket da serie |
| reason | csv enums | todos | Filtra tipos de movimento |
| limit | int | 100 | Max 500 (capa) |
| offset | int | 0 | Paginacao |

**Exemplos:**
```
GET /api/bankroll/history
GET /api/bankroll/history?from=2026-04-01&to=2026-04-25
GET /api/bankroll/history?granularity=week&reason=deposit,withdrawal
GET /api/bankroll/history?limit=50&offset=100
```

**Response 200:**
```json
{
  "snapshots": [
    {
      "id": "abc123",
      "occurredAt": "2026-04-25T15:30:00-03:00",
      "delta": 500.00,
      "previousAmount": 1000.00,
      "newAmount": 1500.00,
      "reason": "deposit",
      "note": "PIX",
      "source": "manual"
    }
  ],
  "series": [
    {
      "bucket": "2026-04-25",
      "balance": 1500.00,
      "movements": 1,
      "delta": 500.00
    }
  ],
  "summary": {
    "totalDeposits": 2500.00,
    "totalWithdrawals": 300.00,
    "totalSessionPnL": 127.50,
    "totalManualAdjustments": 0.00,
    "netChange": 2327.50,
    "startBalance": 500.00,
    "endBalance": 2827.50
  },
  "pagination": {
    "total": 37,
    "limit": 100,
    "offset": 0
  }
}
```

**Regras:**
- `series[].balance` = saldo ao FINAL do bucket.
- `series` preenchida para TODOS os buckets do range com forward-fill (mesmo sem movimento).
- `summary.totalSessionPnL` soma deltas com `reason="session_result"`.
- Banca nao configurada: estrutura vazia (`snapshots:[], series:[], summary` com zeros).
- `from > to`: 400.
- `limit > 500`: capa em 500 (sem erro).

**Response 200/400/401:** Como acima.

---

## Modelos de dados afetados

### `user_settings` (ja existente, sem alteracoes desde Sprint 1)
- `bankrollAmount` decimal nullable (USD)
- `bankrollRule` varchar default `'1pct'`
- `exchangeRates` jsonb (taxas para conversao display)

### `bankroll_snapshots` (NOVA — Sprint 2)
| Campo | Tipo | Notas |
|---|---|---|
| id | varchar PK | nanoid |
| userId | varchar FK | references users.userPlatformId ON DELETE CASCADE |
| occurredAt | timestamp | NOT NULL, default NOW() |
| delta | decimal | NOT NULL, USD, != 0 |
| previousAmount | decimal | NOT NULL, snapshot do saldo antes |
| newAmount | decimal | NOT NULL, snapshot do saldo depois |
| reason | varchar | NOT NULL, enum app-level |
| note | text | nullable, max 500 chars |
| source | varchar | NOT NULL, default `'manual'` |
| sessionId | varchar FK | nullable, reservado para auto_session (fora do MVP) |
| createdAt | timestamp | default NOW() |

**Indices:**
- `idx_bankroll_snapshots_user_occurred (user_id, occurred_at DESC)` — alvo de queries de history
- `idx_bankroll_snapshots_user_reason (user_id, reason)` — alvo de filtro/summary

**Migration:** `migrations/0002_sprint2_bankroll_snapshots.sql`.

---

## Invariantes (ADR-017)

1. `user_settings.bankroll_amount == ultimo snapshot.new_amount` (cache autoritativo).
2. `snapshot[n+1].previous_amount == snapshot[n].new_amount` (sem drift).
3. `delta != 0` em todo snapshot (Zod valida).
4. `occurred_at <= now()` em todo snapshot (Zod valida).
5. UPDATE user_settings + INSERT bankroll_snapshots sao **atomicos** (transacao).
6. Cascade: DELETE user remove todos seus snapshots.

---

## Integracao com Tournament Selector (Sprint 1, RF-10)

Sprint 2 ativa o filtro latente do Sprint 1. `GET /api/tournament-selector` agora retorna:
- `bankrollConfigured: true` quando banca configurada (era sempre `false` no Sprint 1).
- `bankrollThresholdUSD: softLimit` e `bankrollHardLimitUSD: hardLimit`.
- Cada tournament pode ter warnings:
  - `out_of_bankroll` quando `buyInUSD > hardLimit`. Filtrado se `bankrollFilter=true`.
  - `out_of_bankroll_soft` quando `softLimit < buyInUSD <= hardLimit`. Sempre passa pelo filtro (shot permitido).

Cache do Tournament Selector eh invalidado a cada mutacao de banca (`PUT /api/bankroll`, `POST /api/bankroll/snapshot`).

---

## Referencias

- Spec: `docs/specs/bankroll-management.md`
- Index arquitetura: `docs/architecture/bankroll-index.md`
- ADR-017: `docs/architecture/decisions/017-bankroll-snapshot-vs-derived.md`
- ADR-018: `docs/architecture/decisions/018-bankroll-tolerance-hardcoded.md`
- Sequence configure: `docs/architecture/flows/bankroll/sequence-configure.md`
- Sequence Grind alert: `docs/architecture/flows/bankroll/sequence-grind-alert.md`
- C4 component: `docs/architecture/flows/bankroll/c4-component.mermaid`
- Migration: `migrations/0002_sprint2_bankroll_snapshots.sql`
