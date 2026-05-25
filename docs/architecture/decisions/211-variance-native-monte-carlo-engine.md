# ADR-211: Substituir dependencia externa PrimeDope por engine Monte Carlo nativo

## Status

Aceito — supersedes ADR-054 (status alterado para "Substituido por ADR-211")

## Data

2026-05-25

## Contexto

A calculadora de variancia MTT integrada no Sprint F4 (ADR-054) dependia de um fetch externo a `primedope.com/prime.php?p=tournament-variance-calculator`. Esse endpoint **nunca foi uma API publica** -- e a pagina web deles. Resultado pratico desde o deploy: **sempre falha com 4xx/5xx**. Charts sao stubs vazios. Rate limiting artificial de 1 req/10s existe por causa do fetch externo. A Semaphore class limita 3 requests concorrentes ao PrimeDope. Nenhuma simulacao real foi executada com sucesso desde a integracao.

Enquanto isso, o algoritmo Monte Carlo foi validado em `scripts/variance-sim.mjs`: roda 10.000 simulacoes x 1.440 torneios em ~0.3s no Node.js, produzindo resultados estatisticamente solidos (EV, desvio padrao, percentis, drawdown). Dados reais do user confirmam: ~120 torneios/semana, ~$6.000/semana investido, ROI historico por tier disponivel na tabela `tournaments`.

### Forcas em jogo

- **PrimeDope nunca funcionou em producao.** Endpoint retorna 4xx/5xx consistentemente. Todo o codigo de retry, semaphore, rate limiting e fallback-stale e dead weight que nunca serviu.
- **Engine nativo ja esta validado.** O script `variance-sim.mjs` demonstra que o algoritmo e viavel, rapido (~0.3s) e produz resultados coerentes.
- **Complexidade de manutencao.** O fetch externo exige: Semaphore, AbortController, retry com backoff, fallback stale 24h, rate limit 1/10s, telemetria de erro upstream, chart proxy route -- tudo para um servico que nao responde.
- **Interface plugavel da ADR-054 funcionou.** `runSimulation()` e o contrato; trocar a implementacao interna nao quebra nenhum consumidor.

## Opcoes Consideradas

### Opcao 1: Manter PrimeDope e continuar tentando (DESCARTADA)

- **Pros:** Zero trabalho.
- **Contras:** Feature continua morta. Codigo dead-weight polui codebase. Users veem erro sempre. Atribuicao obrigatoria "Powered by PrimeDope.com" para servico que nao funciona.

### Opcao 2: Engine Monte Carlo nativo server-side (ESCOLHIDA)

Implementar `server/services/varianceEngine.ts` com o algoritmo validado em `variance-sim.mjs`. Endpoint canonico `POST /api/variance/simulate` + alias backward-compat `POST /api/primedope/simulate`. Remover todo codigo de fetch externo, semaphore, retry, rate limit.

- **Pros:**
  - **Funciona.** Simulacao executa em ~0.3s, sem dependencia de rede.
  - **Resultados ricos.** EV, stdDev, 9 percentis, drawdown (mean/median/p95/p99/worst), histograma, contribuicao por grupo, metadata (simulationsRun, elapsedMs).
  - **Simplicidade.** Remove ~300 linhas de codigo morto (Semaphore, fetch, retry, rate limit, chart proxy).
  - **Reprodutibilidade.** Seed opcional permite resultados deterministicos para testes.
  - **Zero custo operacional.** Sem fetch externo, sem latencia de rede, sem risco de downtime de terceiro.
  - **Extensibilidade.** Facil adicionar equity curves (VR-3), ajustar payout structures, adicionar formatos (Mystery, Satellite).

- **Contras:**
  - **Calibracao propria.** Sem ground truth externo para validar os resultados. Mitigacao: runs historicos salvos em `primedope_runs` (nunca funcionaram) nao servem como baseline, mas o script `variance-sim.mjs` foi validado manualmente contra a teoria (EV = ROI * invested). Confianca alta na calibracao via binary search (200 iteracoes converge para 6 decimais).
  - **Payout structure simplificada.** Power-law com alpha variavel e uma aproximacao da distribuicao real de payouts MTT. Mitigacao: alpha varia por field size (2.0/1.7/1.5/1.3) e PKO flattening (*0.65) seguem benchmarks da comunidade (2p2, Reddit /r/poker).

### Opcao 3: Substituir por outro provider externo (HRC API, Sharkscope) (DESCARTADA)

- **Pros:** Ground truth externo validado.
- **Contras:** Nenhum provider oferece API publica para variance simulation MTT. HRC e ICMizer sao solvers de ICM/push-fold, nao variance schedulers. Voltaria a depender de terceiro sem SLA.

## Decisao

**Adotar Opcao 2: engine Monte Carlo nativo em `server/services/varianceEngine.ts`.**

### Algoritmo (fonte de verdade: `scripts/variance-sim.mjs`)

**Passo 1 -- Gerar payout structure por grupo:**
- `placesPaid = round(field * 0.15)` (min 1)
- Alpha power-law variavel por field size:
  - `field < 300` -> alpha = 2.0
  - `field < 1000` -> alpha = 1.7
  - `field < 3000` -> alpha = 1.5
  - `field >= 3000` -> alpha = 1.3
- PKO: `alpha *= 0.65` (curva mais flat -- bounties reduzem top-heaviness)
- Distribuicao normalizada: `payout[i] = (raw[i] / rawSum) * fieldSize` (em multiplos de buy-in)
- Min cash enforced: `payout[last..] >= 1.5x buy-in`, deficit redistribuido dos top 10%

**Passo 2 -- Calibrar skill factor via binary search (200 iteracoes):**
- Modelo de posicao: `pos = ceil(N * u^skill)` onde `u ~ U(0,1)`
- Skill > 1 = edge positivo (mais provavel terminar em posicoes altas)
- Skill < 1 = edge negativo
- Target: `EV = 1 + ROI` (payout medio em multiplos de buy-in)
- Binary search em [0.01, 20.0], convergencia ~6 decimais

**Passo 3 -- Simular:**
- Para cada simulacao (default 10.000):
  - Para cada grupo, para cada torneio: gerar posicao aleatoria via `ceil(field * random()^skill)`
  - Se ITM (pos <= placesPaid): profit = `(payout[pos-1] - 1) * buyIn`
  - Se busted: profit = `-buyIn`
  - Agregar por semana para drawdown (peak-to-valley)
- Coletar resultado total por simulacao

**Passo 4 -- Agregar estatisticas:**
- EV = media dos resultados
- StdDev = desvio padrao
- Percentis: p0.15, p2.5, p15, p30, p50, p70, p85, p97.5, p99.85
- Drawdown: mean, median, p95, p99, worst
- Histograma: buckets auto-calculados `max(1000, round(range / 15 / 1000) * 1000)`
- Contribuicao por grupo: `buyIn * roi * count`
- Metadata: simulationsRun, elapsedMs

### Performance esperada

| Cenario | Torneios | Simulacoes | Tempo estimado |
|---------|----------|------------|----------------|
| 1 semana, 6 grupos, 120 torneios | 120 | 10.000 | ~30ms |
| 12 semanas, 6 grupos, 1.440 torneios | 1.440 | 10.000 | ~300ms |
| 52 semanas, 6 grupos, 6.240 torneios | 6.240 | 10.000 | ~1.3s |
| Pior caso: 50.000 sims, 3.000 torneios | 3.000 | 50.000 | ~4.5s |

Benchmark: 10K sims x 1440 torneios = 14.4M samples em ~0.3s (medido no script). Float64Array para resultados e drawdowns evita GC pressure.

### Contrato de tipos

**Input:**
```typescript
interface VarianceSimulationInput {
  groups: Array<{
    name: string;
    buyIn: number;       // USD
    field: number;       // avg field size
    roi: number;         // decimal (0.15 = 15%)
    count: number;       // total torneios no periodo
    isPKO: boolean;
  }>;
  weeks: number;           // 1 | 4 | 12 | 52
  simulations?: number;    // default 10000, clamp [1000, 50000]
  seed?: number;           // opcional, para reprodutibilidade
}
```

**Output:**
```typescript
interface VarianceSimulationResult {
  ev: number;
  stdDev: number;
  profitablePct: number;
  totalTournaments: number;
  totalInvested: number;
  percentiles: {
    p0_15: number; p2_5: number; p15: number; p30: number;
    p50: number; p70: number; p85: number; p97_5: number;
    p99_85: number;
  };
  drawdown: {
    mean: number; median: number; p95: number;
    p99: number; worst: number;
  };
  groupContributions: Array<{
    name: string; count: number;
    invested: number; expectedProfit: number;
  }>;
  histogram: Array<{
    bucketStart: number; bucketEnd: number; count: number;
  }>;
  simulationsRun: number;
  elapsedMs: number;
  source: 'native' | 'cache';
}
```

### Endpoint

- **Canonico:** `POST /api/variance/simulate` -- auth JWT, Zod validation, chama engine nativo.
- **Alias:** `POST /api/primedope/simulate` -- backward-compat, redireciona internamente para o engine nativo. Mesmo handler, mesma validacao.
- **Cache:** hash SHA-256 do input; se hash identico e run < 5min, retorna cached com `source: 'cache'`. Persistido em `primedope_runs` com `source = 'native'`.
- **Sem rate limit:** simulacao local custa ~0.3s, nao ha razao para throttle.
- **Sem semaphore:** sem fetch externo, sem contencao de recursos.

### Codigo removido (RF-05)

| Arquivo | O que sai | O que fica |
|---------|-----------|------------|
| `server/services/primedopeIntegration.ts` | `PRIMEDOPE_URL`, `Semaphore` class, `fetchPrimedopeOnce`, `fetchPrimedopeWithRetry`, `saveChartFromUrl`, `getChartFsPath` | `resolveExchangeRates`, `nativeToUsd`, `computeInputHash`, `buildHashableInput` |
| `server/routes/primedope.ts` | `GET /chart/:hash`, `checkRateLimit`, `noteSimulateCall`, `clearSimulateCall`, rate limit state | Demais endpoints (simulate rewirado, runs, pin, buckets-prefill) |
| `shared/primedopeDefaults.ts` | `CONCURRENT_FETCHES`, `FETCH_TIMEOUT_MS`, `RETRY_BACKOFF_MS`, `RETRY_MAX_ATTEMPTS`, `RATE_LIMIT_PER_USER_MS` | `CACHE_TTL_MS` (ajustado para 5min), `RETENTION_DAYS`, network defaults, helpers |
| `client/src/components/primedope/PrimedopePanel.tsx` | Footer "Powered by PrimeDope.com" | Todo o resto |
| `client/src/hooks/usePrimedopeSimulation.ts` | AbortController ref/cleanup, raw fetch com signal | Mutation via apiRequest para `/api/variance/simulate` |
| `client/src/components/primedope/PrimedopeResult.tsx` | `riskOfRuinPct` card, `minBankroll` section, tipo `SimulationResultData` antigo | Cards EV/ROI/SD/Chance de Lucro, tabela CI com percentiles, drawdown card |

### Dados

Sem migration SQL necessaria. O campo `source` em `primedope_runs` e `varchar` livre -- o novo valor `'native'` nao requer ALTER. `CACHE_TTL_MS` ajustado de 30min para 5min (simulacao local e barata, cache longo nao e necessario).

## Consequencias

### Positivas

- **Feature funciona pela primeira vez.** Simulacao roda em ~0.3s sem falha.
- **Codebase mais simples.** ~300 linhas de dead code removidas (Semaphore, fetch, retry, rate limit, chart proxy).
- **Zero dependencia externa.** Sem risco de downtime de terceiro, sem latencia de rede.
- **Extensivel.** VR-2 (agregacao historica) e VR-3 (equity curves, histograma visual) sao incrementais ao engine.
- **Reprodutibilidade.** Seed fixa para testes deterministicos.

### Negativas

- **Payout structure e aproximacao.** Power-law nao e identica a distribuicao real de payouts de cada rede. Mitigacao: alpha variavel por field size e suficiente para variance analysis (nao e um solver de ICM).
- **Sem validacao cruzada com provider externo.** PrimeDope nunca respondeu, entao nao ha baseline comparativo. Mitigacao: validacao teorica (`EV ~ ROI * invested`, percentis monotonicos, drawdown bounds).

### Neutras

- **`primedope_runs` mantida.** Tabela continua funcionando como cache/audit; novos runs gravados com `source='native'`. Renomear para `simulation_runs` pode ser feito em sprint futuro sem impacto funcional.
- **ADR-054 marcada como Substituida.** Referencia historica preservada.

## Confianca

**Alta.** O algoritmo esta validado em script standalone. A interface plugavel da ADR-054 (`runSimulation`) e mantida. O PrimeDope nunca funcionou em producao -- nao ha risco de regressao funcional. A remocao de codigo morto simplifica a codebase.

## Referencias

- **Spec:** `Docs/specs/sprint-variance-reform.md` (RF-01..RF-05)
- **Script de referencia:** `scripts/variance-sim.mjs` (algoritmo fonte de verdade)
- **ADR-054:** `054-primedope-external-provider-vs-native-engine.md` (decisao original, agora substituida)
- **ADR-033:** `033-fx-rate-convention-units-per-usd.md` (convencao FX mantida)
- **ADR-162:** `162-variance-kpi-primedope-cache-fallback-heuristic.md` (KPI home -- nao afetado por VR-1, engine fornece dados melhores)
- **Diagramas:** `Docs/architecture/diagrams/variance-reform/`
