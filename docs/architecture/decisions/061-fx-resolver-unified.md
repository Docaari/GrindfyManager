# ADR-061: `fxResolver` unificado com cascata users > wallets > constants

## Status
Proposto

## Data
2026-05-01

## Contexto

A convencao QW-1 (ADR-033) define `rates[ccy] = unidades de ccy por 1 USD` (ex: `rates.BRL = 5.0` significa "5 BRL por 1 USD"). Multi-wallet (ADR-034) introduziu hierarquia: cada `wallet.exchangeRates` (jsonb) congela rates no momento do snapshot; `users.exchangeRates` (jsonb) eh fallback global.

Hoje a logica de resolucao FX vive **duplicada** em multiplos callsites no codigo de main:

- `server/csvParser.ts` — converte buy-in/payouts ao importar.
- `server/routes/misc.ts` — varios handlers ad-hoc.
- `server/routes/tournament-selector.ts` — normaliza buy-in para scoring.
- `server/routes/upload.ts` — pos-processo de import.
- `server/scoring/currencyNormalizer.ts` — utilidade dedicada de scoring.
- `server/services/bankrollService.ts` — calcula consolidatedUSD para snapshots.
- `server/services/ticketService.ts` — converte effective buy-in (ADR-036).
- `server/services/walletService.ts` — converte balance reportado.
- `server/storage.ts` — multiplas queries que aplicam FX.

Cada um faz: (1) `await db.select().from(users).where(...)`, (2) `await db.select().from(wallets).where(...)`, (3) merge manual com fallback `{BRL: 5.0, EUR: 0.93, CNY: 7.2, USDT: 1.0}`. Bugs ja apareceram:

- Sprint Bankroll-2.1 lesson learned: 2 callsites mergeavam wallets ANTES de users — ordem invertida → user override perdia.
- Sprint F4 (branch `feature/f4-primedope`): introduziu mais 3 callsites duplicados em `primedopeIntegration.ts`, `dayDetailService.ts`, `primedopeBucketsPrefill.ts` — esses NAO existem ainda em main mas vao bater no merge.
- Cache: cada callsite faz query ao banco em hot path (ex: `currencyNormalizer.normalize` chamado em loop de 200 torneios = 400 queries duplicadas).

A spec `Docs/specs/sprint-bankroll-3.md` RF-11 endereca: criar `server/services/fxResolver.ts` com API unificada e cache em memoria, migrar callsites prioritarios.

A questao arquitetural eh:

1. **Servico central** com cache + cascata explicita (escolha proposta).
2. **Funcao pura** sem cache, chamada com `(userExchangeRates, walletExchangeRates)` carregados pelo caller.
3. **Hook context** (React-style) propagado via async local storage.
4. **Banco materialized view** com rates resolvidos por user.

E **escopo da migracao**: quais callsites refatorar agora vs deixar para sprint posterior?

### Pre-requisitos satisfeitos

- ADR-033 estabelece convencao QW-1 (units per USD).
- ADR-034 estabelece imutabilidade de FX no snapshot.
- `users.exchangeRates` e `wallets.exchangeRates` ja sao jsonb com schema validado (Zod).
- `getCurrencyForSite(site).code` em `shared/platform-currency.ts` mapeia site → currency code.

### Forcas em jogo

- **DRY:** logica de cascata duplicada eh bug factory.
- **Performance:** queries duplicadas em hot path desperdicam DB.
- **Testabilidade:** lock testar 9 callsites diferentes vs 1 servico = pesadelo.
- **Branch reality:** F4 nao esta em main. RF-11 originalmente listou 3 callsites F4 que nao existem em bankroll-3. Precisa pivot.

### Branch reality check

`feature/bankroll-3` saiu de main. F4 vive em `feature/f4-primedope` (nao mergeada). Os 3 callsites listados na spec original (`primedopeIntegration.ts`, `dayDetailService.ts`, `primedopeBucketsPrefill.ts`) **nao existem em bankroll-3**. Refatora-los seria criar arquivos vazios — nao faz sentido.

Os 9 callsites listados acima existem em main (bankroll-3 herda). Decisao desta sprint sobre escopo:

- **Migrar agora (Bankroll-3):** callsites diretamente exercidos por RF-2/RF-4/RF-6/RF-7 — ou seja, `bankrollService`, `walletService`, `ticketService`. Esses sao tocados pelo desenvolvimento Bankroll-3 e ja seriam revisitados.
- **Migrar em sprint posterior:** `csvParser`, `routes/misc`, `routes/tournament-selector`, `routes/upload`, `scoring/currencyNormalizer`, `storage`. Nao tocados por Bankroll-3 — refator preventivo viola "se nao quebrou nao mexa". Issue tracked.
- **F4 callsites** (`primedopeIntegration`, `dayDetailService`, `primedopeBucketsPrefill`): tratado na ramificacao F4 quando merge bankroll-3 ⇄ F4 acontecer. RF-11 cria infra (`fxResolver`); F4 PR followup migra esses 3.

## Decisao

**Adotar opcao 1: criar `server/services/fxResolver.ts` com API unica, cache em memoria por userId (TTL 5min, invalidado em PUT /api/user-settings), cascata explicita users > wallets > constants `FALLBACK_FX_RATES` (D9). Convencao QW-1 mantida. Helpers `convertToUSD`, `convertFromUSD`, `convertBetween`. Migrar nesta sprint apenas `bankrollService`, `walletService`, `ticketService` (callsites tocados por RF-2/RF-4/RF-6/RF-7). Demais callsites ficam como debt RF-11.5 trackeada para sprint futuro. F4 callsites tratados em PR followup pos-merge.**

**Adicionalmente: RF-12 (queryKey userId em hooks F4) NAO se aplica nesta sprint — hooks `useDayDetail`, `usePrimedopeRuns`, `usePrimedopeSimulation` nao existem em bankroll-3. Documentado neste ADR como skip explicito; lesson learned padrao para futuros hooks F4 fica registrada.**

### Detalhes do contrato

**Interface (`server/services/fxResolver.ts`):**

```ts
export interface FxRates {
  rates: Record<string, number>; // QW-1: units per USD; USD = 1
  source: 'user' | 'wallets' | 'fallback' | 'mixed';
  resolvedAt: Date;
}

export const FALLBACK_FX_RATES: Readonly<Record<string, number>> = {
  USD: 1,
  BRL: 5.0,
  EUR: 0.93,
  CNY: 7.2,
  USDT: 1.0,
  GBP: 0.79,
  BTC: 0.000016,
};

export async function resolveExchangeRates(userId: string | null): Promise<FxRates>;
export function convertToUSD(amount: number, currency: string, rates: Record<string, number>): number;
export function convertFromUSD(amountUsd: number, targetCurrency: string, rates: Record<string, number>): number;
export function convertBetween(amount: number, from: string, to: string, rates: Record<string, number>): number;
export function invalidateCache(userId: string): void;
```

**Cascata (D9):**

1. `FALLBACK_FX_RATES` como base.
2. Para cada wallet ativa do user: merge `wallets.exchangeRates` (sobreescreve fallback). Se 2 wallets divergem para mesma currency, usa o mais recente por `updated_at`.
3. `users.exchangeRates` sobreescreve tudo.

`source` reflete origem dominante: `'fallback'` se nem user nem wallets contribuiram, `'user'` se user contribuiu, `'wallets'` se apenas wallets, `'mixed'` se user+wallets contribuiram para currencies diferentes.

**Cache:**

```ts
const cache = new Map<string, { rates: FxRates; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

// resolveExchangeRates verifica cache antes de query.
// Hit: retorna direto. Miss/expired: re-fetch + grava.

// invalidateCache(userId) deleta entry — chamado em:
// - PUT /api/user-settings se body inclui exchangeRates
// - POST /api/wallets se body inclui exchangeRates
// - PUT /api/wallets/:id se body inclui exchangeRates
```

**Helpers:**

```ts
// QW-1: usd = native / rate
export function convertToUSD(amount, currency, rates) {
  const rate = rates[currency] ?? FALLBACK_FX_RATES[currency] ?? 1;
  return amount / rate;
}

export function convertFromUSD(amountUsd, targetCurrency, rates) {
  const rate = rates[targetCurrency] ?? FALLBACK_FX_RATES[targetCurrency] ?? 1;
  return amountUsd * rate;
}

export function convertBetween(amount, from, to, rates) {
  if (from === to) return amount;
  return convertFromUSD(convertToUSD(amount, from, rates), to, rates);
}
```

**Callsites refatorados nesta sprint:**

- `server/services/bankrollService.ts` — `createAutoSnapshot` (RF-2) e operacoes consolidatedUSD usam `fxResolver.resolveExchangeRates(userId)` + `convertToUSD`.
- `server/services/walletService.ts` — operacoes que envolvem cross-currency (RF-4 transfer marketRate validation) usam `fxResolver`.
- `server/services/ticketService.ts` — effective buy-in calc (ADR-036) usa `fxResolver.convertToUSD` em vez de logica inline.

**Callsites NAO refatorados (debt RF-11.5):**

- `server/csvParser.ts` (import flow nao tocado em B3).
- `server/routes/misc.ts` (handlers ad-hoc fora do escopo).
- `server/routes/tournament-selector.ts` (TS sprint dedicado).
- `server/routes/upload.ts` (mesmo pipeline csvParser).
- `server/scoring/currencyNormalizer.ts` (TS dedicado, refactor coordenado com TS-2).
- `server/storage.ts` (queries ad-hoc; refactor risco alto sem necessidade B3).

Issue criada para sprint posterior: "RF-11.5: migrar 6 callsites FX restantes para `fxResolver`".

**Callsites F4 (PR followup):**

- `server/services/primedopeIntegration.ts`
- `server/services/dayDetailService.ts`
- `server/services/primedopeBucketsPrefill.ts`

Quando `feature/f4-primedope` for merged em main e depois em bankroll-3 (ou inverso), esses 3 callsites surgirao. PR followup deve migra-los para `fxResolver` antes de merge final.

**RF-12 skip:**

Hooks `useDayDetail`, `usePrimedopeRuns`, `usePrimedopeSimulation` (`client/src/hooks/`) **nao existem em bankroll-3**. RF-12 fica como instrucao para o PR de F4 followup:

```ts
// Padrao corretivo aplicar quando hooks F4 entrarem em main:
const { data: user } = useQuery<{ userPlatformId: string }>({ queryKey: ['/api/auth/me'] });
const userId = user?.userPlatformId;

const { data } = useQuery({
  queryKey: ['/api/day-detail', userId, date], // userId no queryKey
  queryFn: () => fetchDayDetail(date),
  enabled: !!userId, // nao busca antes de ter userId
});
```

## Opcoes Consideradas

### Opcao 1 (escolhida): Servico central com cache + cascata explicita

- **Pros:**
  - DRY: 1 implementacao, 1 lugar para fix de bug.
  - Cache em memoria reduz queries duplicadas em hot path (ex: dashboard ROI agrega 30 dias = 1 resolve em vez de 30).
  - API explicita (`resolveExchangeRates`, `convertToUSD`) auto-documenta.
  - Cascata centralizada reduz risco de divergencia de ordem.
  - Invalidacao de cache em writes garante freshness sem TTL muito agressivo.
  - Testes unitarios concentrados — cobertura de edge cases (currency unknown, rates vazios) em 1 lugar.
  - Compatibilidade com convencao QW-1 mantida.

- **Contras:**
  - Cache em memoria nao funciona em multi-instance (se app escalar). Mitigado por TTL curto + invalidate em writes; aceitavel para Grindfy single-instance.
  - Refactor exige pelo menos esses 3 callsites prioritarios. Risco de regressao mitigado por testes.

### Opcao 2: Funcao pura sem cache

- **Pros:**
  - Sem state. Trivial de testar.
  - Multi-instance friendly trivialmente.

- **Contras:**
  - Caller precisa carregar `userExchangeRates` e `walletExchangeRates` antes — apenas move o problema.
  - Cada callsite ainda faz queries duplicadas no banco (sem cache).
  - DRY apenas parcial (cascata DRY, query nao).

### Opcao 3: Hook context (async local storage)

- **Pros:**
  - Rates flow naturalmente pelo request lifecycle.
  - Caller nao precisa pensar em userId.

- **Contras:**
  - AsyncLocalStorage Node 14+ tem overhead (~5-10us por get).
  - Setup em middleware Express adiciona indirecao.
  - Nao trivial de testar fora de request context.
  - Solucao em busca de problema — request lifecycle nao eh complicado.

### Opcao 4: Banco materialized view

- **Pros:**
  - Resolved rates sempre disponiveis sem JS logic.
  - Persistente, multi-instance OK.

- **Contras:**
  - Refresh strategy complexa (REFRESH MATERIALIZED VIEW eh pesado).
  - Cascata complexa em PL/pgSQL (mesma critica de ADR-058 trigger).
  - Drift de schema vs Drizzle.
  - Overkill para 4-5 currencies.

## Consequencias

### Positivas

- **DRY estabelecido para FX.** 1 servico, 1 cascata, 1 lugar para fix.
- **Cache reduz queries em hot path.** Dashboard ROI agregando 30 dias usa 1 resolve em vez de N.
- **Convencao QW-1 garantida.** Helpers `convertToUSD/From/Between` impedem inversao acidental.
- **Invalidate em writes** garante freshness sem polling.
- **Cascata explicita documentada.** users > wallets > constants — sem ambiguidade.
- **Migracao seletiva** evita risco de regressao em callsites legados.
- **Issue RF-11.5 trackeada** para sprint futuro.
- **F4 followup claro** quando merge acontecer.
- **RF-12 documentado** como guia para hooks F4 futuros.

### Negativas

- **Cache em memoria nao escala multi-instance.** Mitigado por TTL + invalidate; aceitavel hoje (single-instance Coolify).
- **6 callsites legados continuam duplicando logica.** Debt explicito; sprint futuro coloca todos em `fxResolver`.
- **Cache invalidation tem race window.** Se 2 requests simultaneos: 1 escreve user.exchangeRates + invalidate, 2 le rates antes de invalidate ser visto. Window de ~50ms — aceitavel para uso (rates nao mudam em 50ms).

### Neutras

- **F4 callsites pendentes** ate merge happen. Nada quebra ate la.
- **RF-12 fica para sprint F4 merge.** Padrao corretivo documentado neste ADR como referencia.
- **`source` field opcional** — clientes podem ignorar; util apenas para debugging/telemetria.
- **`BTC` em `FALLBACK_FX_RATES`** apenas placeholder. Crypto live rate eh non-goal Bankroll-3.
- **userId null** (testes, anonymous calls): retorna fallback direto sem query.

## Confianca

**Alta.** Padrao "service central + cache + cascata" eh estabelecido (`storage.ts`, `walletService.ts`). Convencao QW-1 ja documentada e validada. Risco principal (cache stale) tem mitigacao concreta (TTL curto + invalidate em writes). Refactor seletivo limita superfacie de regressao.

## Referencias

- Spec: `Docs/specs/sprint-bankroll-3.md` (RF-11, RF-12 skip, D9)
- ADR-033: FX rate convention (units per USD)
- ADR-034: Multi-wallet com immutable FX
- ADR-036: Tickets effective buy-in
- Diagrama: `Docs/architecture/diagrams/bankroll-3-fx-resolver-cascade.mermaid`
- Service: `server/services/fxResolver.ts` (novo)
- Callsites refactorados: `server/services/{bankrollService,walletService,ticketService}.ts`
- Callsites debt (RF-11.5): `server/{csvParser.ts,routes/misc.ts,routes/tournament-selector.ts,routes/upload.ts,scoring/currencyNormalizer.ts,storage.ts}`
- F4 callsites (PR followup): `server/services/{primedopeIntegration,dayDetailService,primedopeBucketsPrefill}.ts`
- F4 hooks (RF-12 followup): `client/src/hooks/{useDayDetail,usePrimedopeRuns,usePrimedopeSimulation}.ts`
