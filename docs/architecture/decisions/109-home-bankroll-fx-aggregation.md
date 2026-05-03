# ADR-109: Bankroll FX aggregation no Home reusa `walletService.getConsolidatedBalance` (Sprint home-reform-2 Onda 2)

## Status
Aceito

## Data
2026-05-03

## Contexto

A Sprint home-reform-1 entregou o stub `storage.getCurrentBankroll(userId)`
retornando apenas `{ walletsCount }` (placeholder). Onda 2 precisa popular o card
"Banca" do StatusStrip com:

- `totalUsd` — saldo consolidado de todas wallets do user em USD.
- `walletsCount` — numero de wallets ativas.
- `bisAvailable` — buy-ins disponiveis (`floor(totalUsd / softLimitUSD)`).
- `deltaPct7d` — variacao percentual vs 7 dias atras.
- `sparkline` — 7 pontos USD (1 por dia, ultimos 7 dias).

A conversao de saldos para USD precisa respeitar a **cascata FX** ja documentada
em ADR-033 (`exchangeRates` em unidades nativas por 1 USD): ordem
`users.exchangeRates` > `wallets.exchangeRates` > `DEFAULT_EXCHANGE_RATES`. O
servico `walletService.getConsolidatedBalance(userId)` ja **resolve toda essa
cascata** em producao (Sprint Bankroll-2, ADR-034).

A pergunta arquitetural foi: **`storage.getCurrentBankroll` deve recalcular FX
do zero ou delegar para o servico ja existente?**

## Opcoes Consideradas

### Opcao 1: Delegar para `walletService.getConsolidatedBalance(userId)` + queries auxiliares para delta/sparkline
- `storage.getCurrentBankroll`:
  1. Chama `walletService.getConsolidatedBalance(userId)` → `{ totalUSD, wallets, ... }`.
  2. Chama `storage.getBankrollSnapshots(userId, { from: now-7d })` para delta + sparkline.
  3. Compoe `bisAvailable` via `computeThresholds` (ja em uso em
     `walletService` — ADR-018 thresholds hardcoded).
- **Pros:**
  - FX cascata respeitada automaticamente. Zero divergencia com o resto do app.
  - SSOT (single source of truth) para "como calcular saldo USD".
  - Se FX rules mudarem (new currency, new fallback), Home herda gratis.
  - `walletService` ja testado a fundo (Sprint Bankroll-2).
- **Contras:**
  - Acoplamento `home → walletService` (cross-domain).
  - 2 queries em vez de 1 (`getActiveWalletsByUser` ja roda dentro do service).
    Aceito porque budget D6 < 500ms preserva (todas paralelas).

### Opcao 2: Recalcular FX direto em `storage.getCurrentBankroll`
- Repetir a logica `nativeToUSD` + cascata em wrapper proprio.
- **Pros:** desacoplamento; 1 query a menos (combine wallets + settings em SQL).
- **Contras:**
  - **Quebra SSOT.** Se cascata FX mudar, dois lugares para atualizar.
  - Risco alto de divergencia silenciosa (lesson #6: "sempre normalizar para USD
    antes de comparar com thresholds USD").
  - Re-implementar `parseDecimal`, `nativeToUSD`, fallback chain — codigo morto.

### Opcao 3: Cachear `bankroll_summary` em tabela dedicada
- Cron diario popula `bankroll_summary(userId, totalUsd, deltaPct7d, sparkline, computedAt)`.
- Home le do cache.
- **Pros:** latencia minima (1 query indexada).
- **Contras:**
  - Over-engineering Onda 2. Latencia atual ja cabe no budget < 500ms.
  - Stale data (cron nao roda em mudanca de wallet).
  - Mais 1 tabela + cron — superficie de bug.
  - Avaliar quando `walletService.getConsolidatedBalance` virar gargalo medivel.

### Opcao 4: Chamar HTTP interno `/api/bankroll/summary`
- Reutiliza o endpoint REST existente.
- **Pros:** zero acoplamento de codigo.
- **Contras:** custo de HTTP loop interno (200-300ms extra), perda de
  type-safety, headers/auth replicados. Anti-pattern em monolito.

## Decisao

**Opcao 1.** `storage.getCurrentBankroll(userId)` delega para
`walletService.getConsolidatedBalance(userId)` e calcula delta/sparkline via
queries auxiliares paralelas:

```ts
async function getCurrentBankroll(userId: string) {
  const [consolidated, snapshots7d] = await Promise.all([
    walletService.getConsolidatedBalance(userId),       // FX cascata + bisAvailable
    storage.getBankrollSnapshots(userId, { from: now-7d }),  // delta + sparkline
  ]);

  if (consolidated.walletsCount === 0) return null;

  const deltaPct7d = computeDeltaPct(consolidated.totalUSD, snapshots7d);
  const sparkline  = buildSparkline7d(snapshots7d, consolidated.totalUSD);
  const bisAvailable = consolidated.bisAvailable ?? null;

  return {
    totalUsd: consolidated.totalUSD,
    walletsCount: consolidated.walletsCount,
    bisAvailable,
    deltaPct7d,
    sparkline,
  };
}
```

Helpers `computeDeltaPct` e `buildSparkline7d` ficam no proprio
`storage.ts` (privados, sem novo service). Snapshots ja existem (ADR-017).

## Consequencias

**Positivas:**
- FX cascata garantida pela camada autoritativa (Sprint Bankroll-2 ADR-034).
- Mudancas em FX rules (nova moeda, novo fallback) propagam automaticamente.
- `bisAvailable` reusa `computeThresholds` (ADR-018).
- 2 queries paralelas via `Promise.all` cabem no timeout 800ms (`Promise.allSettled` global).

**Negativas:**
- Acoplamento `home → walletService`. Aceitavel: `walletService` e contrato
  estavel ha 6 sprints; mudanca breaking exigiria release coordenado.
- Camada `storage` chamando service e leve violacao de "storage = SQL puro";
  porem o `walletService` ja faz so leitura aqui (sem side-effects).

**Neutras:**
- Sprint follow-up pode introduzir cache `bankroll_summary_cache` se latencia
  subir > 200ms p95 — migracao = mudar implementacao mantendo assinatura.
- Sprint follow-up pode mover essa logica de `storage.getCurrentBankroll` para
  `bankrollService.getCurrentForHome(userId)` se outras paginas pedirem mesmo
  shape.

## Implementacao

- `getActiveWalletsByUser` ja roda dentro de `getConsolidatedBalance`.
- `storage.getBankrollSnapshots(userId, { from, to })` ja existe (Bankroll-3).
- `storage.getUserSettings(userId)` ja roda dentro de `getConsolidatedBalance`
  (acesso a `exchangeRates`).
- Total: **3 queries por chamada** (wallets, settings, snapshots) — paralelizadas
  via `Promise.all` interno ao service + 1 query adicional (snapshots) externa.

## Confianca

Alta. ADR-033 e ADR-034 ja consolidaram contrato FX. `walletService` esta em
producao desde 2026-04-26 sem incidente. Risco baixo.

## Referencias

- Spec: `Docs/specs/home-reform-2.md` §3 B10.3, §5 RF-32.
- ADR-033: FX rate convention units-per-USD.
- ADR-034: Multi-Wallet com FX historico imutavel.
- ADR-017: Bankroll snapshot vs derived.
- ADR-018: Bankroll tolerance hardcoded.
- ADR-099: Home Operations Cockpit Pattern.
- Lessons Learned #6: sempre normalizar para USD antes de comparar com
  thresholds USD.
