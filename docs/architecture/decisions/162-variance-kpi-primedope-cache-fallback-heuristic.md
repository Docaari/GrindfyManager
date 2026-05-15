# ADR-162: Variance KPI — Integracao PrimeDope-Cache + Fallback Heuristico (Sprint Variance-1)

## Status
Aceito

## Data
2026-05-15

## Sprint
Variance-1 (`Docs/specs/sprint-variance-1.md`, RF-01 + RF-02)

## Decision owner
system-architect (Sprint Variance-1, founder validou foco "religar o KPI", auditoria conjunta strategist+reviewer 2026-05-15).

## Related
- Depende de: ADR-054 (PrimeDope como provider externo — `primedope_runs` ja persiste `result_json.data.{ev,stdDev}`), ADR-061 (`fxResolver` unificado), ADR-121 (`system_fx_rates` global), ADR-017 (snapshots vs derived — neste caso, a variancia eh **derivada** read-only, sem snapshot novo).
- Reusa: `server/services/fxResolver.ts` (`resolveExchangeRates(userId)`), `server/storage.ts` (`getDashboardStats`, `getGrindSessions`, `getSessionTournaments`), `client/src/components/home/VarianceCard.tsx` (UI ja pronta, gate `sessionsCount >= 20`), `server/routes/home.ts:412+722-736` (consumer ja mapeado).
- Sucessor de: nenhum (substitui o stub `null` em `server/storage.ts:11664-11668` documentado como TODO Onda 3 / AI-2A em CLAUDE.md §10).
- Sera substituido (parcialmente) por: AI-2A — quando `variance.method` migrar de `heuristic` para `primedope` em **todos** os caminhos. Esta ADR mantem fallback heuristico como **always-on** mesmo apos AI-2A (caso PrimeDope esteja indisponivel).
- Diagramas: `Docs/architecture/diagrams/sprint-variance-1/{variance-data-flow,variance-query-sequence,variance-cache-invalidation,variance-component-tree}.mermaid`.

---

## 1. Contexto

A auditoria conjunta strategist + reviewer (2026-05-15) descobriu que o "sistema de variance calculator" reportado pelo founder como "nao funcionando" sao na verdade **duas ilhas isoladas**:

1. **Surface A — PrimedopePanel** em `/coach-ai?tab=variance` (renomeado de `/grade-planner` apos coach-page-reform-1 ADR-125). Funciona, persiste em `primedope_runs` (migration 0027, ADR-054 — Sprint F4), retorna `result_json.data.ev` (expected value em USD) + `result_json.data.stdDev` (desvio-padrao em USD) por simulacao Monte Carlo. **Mas o user precisa entrar na aba terciaria e rodar uma simulacao manualmente.**

2. **Surface B — VarianceCard** em `/inicio` (cluster Performance, home-reform-2). UI 100% pronta em `client/src/components/home/VarianceCard.tsx:48-88`, branch render por `data.status ∈ {lucky, normal, unlucky}`, gate `sessionsCount >= 20`, tracker `home_variance_view`. **Mas nunca recebe `data !== null` porque o storage e stub.**

3. **Ponte ausente** — `server/storage.ts:11664-11668`:
   ```ts
   async getVarianceVsExpected(_userId: string): Promise<any> {
     // TODO Onda 3: filtra grind_sessions 90d, lookup primedope_simulations cache.
     // Onda 2: retorna null (bloco oculto).
     return null;
   }
   ```

   Stub desde home-reform-2. Endpoint `/api/home/overview` (`server/routes/home.ts:412+722-736`) ja consome o shape correto, mas como o storage retorna `null`, o body sempre tem `variance: null` → VarianceCard nunca renderiza.

A pergunta arquitetural: **como religar a Surface A na Surface B sem depender do user ter rodado uma simulacao no PrimeDope?**

3 opcoes principais:

- **(A) Esperar AI-2A** — defer a feature ate ter `tournamentScorer.ts` consumindo PrimeDope nativo. Trade-off: KPI fica quebrado por 2-3 meses; founder ja reportou o bug.
- **(B) Forcar simulacao** — gate VarianceCard como `null` ate user simular. Trade-off: KPI invisivel pra 90%+ dos users (ninguem simula proativamente); falha de discoverability.
- **(C) Cache + fallback heuristico (escolhida)** — `getVarianceVsExpected` le **primeiro** `primedope_runs` ultimos 90d; se nao houver, calcula `sigmaUsd = 1.5 * stddev(daily_pnl_usd)` como fallback heuristico. Card sempre renderiza para users >= 20 sessoes (mas com empty-state CTA "Simular variancia" quando fallback).

### Restricoes

- **Lesson #6 (FX antes de threshold USD):** agregacao P&L em USD obrigatoria via `fxResolver.resolveExchangeRates`. Sessoes BRL/EUR convertidas antes de cruzar com `expectedUsd`/`sigmaUsd` (que ja vem em USD do PrimeDope).
- **Lesson #9 (logar antes de fallback granular):** shape quebrado em `primedope_runs.result_json` (sem `data.ev`/`data.stdDev`, ou tipos invalidos) → log warn + cai pro fallback heuristico, NAO throw.
- **Lesson #11 (spec eh fonte de verdade):** storage retorna **shape unico**, com `expectedSource` discriminando origem. VarianceCard decide UI com base em `expectedSource` (sem logica adicional no storage).
- **Lesson #21 (cache invalidator publico):** ja existe `invalidateHomeOverviewCache(userId)` em `server/routes/home.ts:77` (ADR de home-reform-4 item 7). RF-03 do sprint chama em mutations correlatas — coberto por ADR-164.
- **Gate `>=20 sessoes` unico no storage:** redundancia em `VarianceCard.tsx:50` mantida (defesa em profundidade), mas o storage **e fonte de verdade**.
- **Defesa numerica:** todos os campos sanitizados — `Number.isFinite` check, `NaN`/`Infinity` → `0`, `sigmaMultiple` clamp `[-10, 10]`.

---

## 2. Decisao

### 2.1 Algoritmo de `getVarianceVsExpected(userId)`

```text
1. Coletar sessoes 90d:
   SELECT id, started_at, ended_at, status, currency, ...
   FROM grind_sessions
   WHERE user_id = $1
     AND status = 'completed'
     AND created_at >= NOW() - INTERVAL '90 days'

2. Gate sessionsCount < 20 -> return null.

3. Resolver FX rates via fxResolver.resolveExchangeRates(userId):
   - cascade: users.exchangeRates -> wallets.exchangeRates -> system_fx_rates -> FX_FALLBACK_CONSTANTS.

4. Calcular P&L por sessao em USD (usa session_tournaments joinadas + FX):
   - dailyPnlUsd[]: agrupar por data (YYYY-MM-DD UTC).
   - actualUsd = sum(dailyPnlUsd).

5. Lookup PrimeDope cache:
   SELECT result_json, created_at
   FROM primedope_runs
   WHERE user_id = $1
     AND created_at >= NOW() - INTERVAL '90 days'
   ORDER BY created_at DESC
   LIMIT 1

6. Validar shape via zod:
   z.object({ data: z.object({ ev: z.number(), stdDev: z.number() }).passthrough() }).passthrough()

7. Branch:
   - Se row valida + ev/stdDev finitos:
       expectedUsd = result_json.data.ev
       sigmaUsd = result_json.data.stdDev
       expectedSource = 'primedope-cache'
   - Senao (sem row OU shape quebrado):
       log warn (sem expor userId completo)
       expectedUsd = 0
       sigmaUsd = 1.5 * stddev(dailyPnlUsd)
       expectedSource = 'fallback-zero'

8. Derivados:
   deviationUsd = actualUsd - expectedUsd
   sigmaMultiple = sigmaUsd > 0 ? deviationUsd / sigmaUsd : 0
   clamp(sigmaMultiple, -10, 10)
   sanitize: NaN/Infinity -> 0

9. Status:
   sigmaMultiple >= 1  -> 'lucky'
   sigmaMultiple <= -1 -> 'unlucky'
   else                -> 'normal'

10. Retornar shape exato consumido por home.ts:722-736.
```

### 2.2 Shape de retorno

```ts
type VarianceResult = {
  sessionsCount: number;                                    // >= 20 sempre
  actualUsd: number;                                        // P&L 90d em USD
  expectedUsd: number;                                      // 0 se fallback
  expectedSource: 'primedope-cache' | 'fallback-zero';     // discriminador
  deviationUsd: number;                                     // actualUsd - expectedUsd
  sigmaUsd: number;                                         // do PrimeDope OU 1.5 * stddev
  sigmaMultiple: number;                                    // clamp [-10, 10]
  status: 'lucky' | 'normal' | 'unlucky';
  period: '90d';
} | null;
```

### 2.3 RF-02: Sanitize defensivo no routes/home.ts

Endurecer o mapeamento existente em `home.ts:722-736`:
- `expectedSource` strict parse: aceita literal `'primedope-cache'` OU `'fallback-zero'`; qualquer outro → coerce `'fallback-zero'`.
- `Number.isFinite(x)` check em todos campos numericos → coerce `0` se falha.
- `sessionsCount` parse com `Math.max(0, Math.floor(...))`.
- `status` mantem logica atual (`'lucky'`/`'unlucky'` ou `'normal'` default).

Defesa em profundidade — storage **ja** sanitiza, mas o route **nao confia** no shape do storage.

### 2.4 Fallback heuristico — por que `1.5 * stddev`

- `stddev(daily_pnl_usd)` mede dispersao real do P&L diario do user (sample-based).
- Multiplicador `1.5` aproxima o desvio cumulativo de 90 dias para um user com volume tipico (`sqrt(N)` scaling onde `N ≈ 60` sessoes ativas → ~7.7; mas usamos um proxy mais conservador).
- Nao pretende substituir Monte Carlo — explicitamente **fallback heuristico** (`expectedSource: 'fallback-zero'` informa o front a renderizar empty-state).
- Trade-off vs PrimeDope:
  - PrimeDope: usa distribuicao real de payouts MTT + variancia per-torneio.
  - Heuristica: usa apenas P&L agregado, ignora field_size/payout_structure. Subestima sigma para volumes baixos, superestima para variancia muito assimetrica.
- Aceitavel porque: (a) RF-04 esconde os numeros quando `expectedSource === 'fallback-zero'` — renderiza CTA "Simular variancia"; (b) o caminho real (PrimeDope) ainda eh a fonte preferida.

---

## 3. Opcoes Consideradas

### 3.1 Opcao A — Deprecar feature ate AI-2A
**Pros:**
- Zero codigo novo neste sprint.
- Aguarda PrimeDope nativo (Monte Carlo embedded) para estimativa precisa.

**Contras:**
- KPI quebrado por meses, founder ja reportou.
- VarianceCard codigo morto em producao.
- Lessons #11 (spec source of truth) violada — UI documentada mas nao funcional.

**Rejeitada:** prazo inaceitavel.

### 3.2 Opcao B — Forcar simulacao manual antes de renderizar
**Pros:**
- KPI sempre preciso (so renderiza com PrimeDope real).
- Sem fallback heuristico para manter.

**Contras:**
- Discoverability ruim: ninguem simula proativamente (PrimedopePanel em aba terciaria).
- KPI invisivel pra 90%+ dos users.
- VarianceCard fica `null` na maioria dos casos = cluster vazio.

**Rejeitada:** falha de UX.

### 3.3 Opcao C — Cache + fallback heuristico **(escolhida)**
**Pros:**
- KPI renderiza para todos users >= 20 sessoes.
- `expectedSource` discriminador permite UI diferenciada (numeros reais vs CTA).
- Fallback heuristico ainda informativo (status `lucky`/`normal`/`unlucky` baseado em P&L diario real).
- Compativel com AI-2A: quando PrimeDope nativo entrar, `expectedSource: 'primedope-cache'` cobre mais users automaticamente.

**Contras:**
- Heuristica `1.5 * stddev` e proxy, nao Monte Carlo.
- 2 caminhos no storage (cache vs fallback) — complexidade extra.

**Aceita.**

### 3.4 Opcao D — Math no client (calcular variancia no front)
**Pros:**
- Sem mudanca de storage.

**Contras:**
- Duplicacao logica (FX cascade no front?).
- Lesson #6 violada (cliente nao deveria fazer FX).
- Latencia: 200+ session_tournaments pra agregar no front.

**Rejeitada:** arquitetura ruim.

---

## 4. Consequencias

### 4.1 Positivas
- VarianceCard renderiza para todos users qualificados (>= 20 sessoes).
- Empty-state CTA com `expectedSource: 'fallback-zero'` (RF-04) leva o user pro PrimedopePanel — descoberta dirigida.
- Codigo morto eliminado (stub `return null` substituido por implementacao real).
- AI-2A herda a estrutura: trocar lookup `primedope_runs` por `tournamentScorer.runSimulation` quando engine nativo existir.
- Defesa em profundidade (sanitize storage + route) reduz risco de regressao por shape quebrado.

### 4.2 Negativas
- Mais 1 query (`primedope_runs` lookup) no endpoint `/api/home/overview` — mitigado pelo cache TTL 30s (`home-overview-cache`) e indice existente `(user_id, profile_letter, day_of_week, created_at DESC)`.
- Heuristica fallback nao eh Monte Carlo — pode dar false negative (`status: 'normal'` quando variancia real seria `unlucky`).
- 2 fontes de verdade na mente do dev (cache vs fallback) — documentar no CLAUDE.md §10 (followup).

### 4.3 Neutras
- Shape do storage retro-compativel com `home.ts:722-736` (ja mapeia campos certos — apenas trocando o stub).
- Telemetria nova `home_variance_fallback_view` (RF-04) — emit 1x por mount, sem custo.

---

## 5. Confianca
**Alta.** O shape de retorno ja esta consumido pelo route e UI; o algoritmo eh determinista; testes derivados (8 cenarios storage + 3 route + 3 component) cobrem boundaries (`sessionsCount 19/20`, `sigmaMultiple 0.99/1.0/-1.0`, clamp 50→10, FX BRL/EUR mix, shape `data.ev: 'string'` → fallback).

---

## 6. Plano de Reversao
Se o fallback heuristico se mostrar ruidoso em producao (false positives em `'unlucky'` que confundem users), **opcao de rollback**:
1. Modificar branch da secao 7 do algoritmo: quando `expectedSource === 'fallback-zero'`, retornar `null` (esconde card inteiro).
2. RF-04 (empty-state) ja cobre o caso `>=20 sessoes sem simulacao` — apenas o card sumiria.

Reversao = 5 linhas. Sem migration, sem rollback de schema.

---

## 7. Referencias
- Spec: `Docs/specs/sprint-variance-1.md` RF-01 + RF-02.
- Stub original: `server/storage.ts:11664-11668`.
- Consumer: `server/routes/home.ts:412+722-736`.
- UI: `client/src/components/home/VarianceCard.tsx:48-88`.
- Lessons #6, #9, #11, #21 (`CLAUDE.md §9`).
