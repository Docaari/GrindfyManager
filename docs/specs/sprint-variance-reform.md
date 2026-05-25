# Spec: Variance Calculator Reform (VR-1 / VR-2 / VR-3)

## Status
Proposta

## Resumo
Substituir calculadora de variancia MTT quebrada (dependencia externa PrimeDope.com) por engine Monte Carlo nativo, com agregacao inteligente por tier, ROI historico real e visualizacao moderna. 3 fases sequenciais.

## Contexto

A calculadora atual (`POST /api/primedope/simulate`) faz request para `https://www.primedope.com/prime.php?p=tournament-variance-calculator` — endpoint que NAO e API publica (e a pagina web deles). Resultado: sempre falha com 4xx/5xx. Charts sao stubs vazios. Rate limiting artificial (1 req/10s) existe por causa da dependencia externa. Wizard mostra torneios por dia individual sem agregacao, ROI usa heuristica generica por rede, field size default 1000. Ferramenta inutilizavel.

Algoritmo Monte Carlo ja validado em `scripts/variance-sim.mjs` — roda 10K simulacoes x 1440 torneios em 0.3s no Node.js. Dados reais do user confirmam: 120 torneios/semana, $6000/semana investido, ROI historico por tier disponivel na tabela `tournaments`.

## Usuarios
- **Jogador (unico):** configura grupos, roda simulacao, analisa variancia/drawdown do seu schedule trimestral

---

# FASE 1 (VR-1): Engine Nativo Monte Carlo

## RF-01: Simulador Monte Carlo server-side

**Descricao:** Implementar engine Monte Carlo em `server/services/varianceEngine.ts` que substitui o fetch externo ao PrimeDope.com. Reutilizar algoritmo validado de `scripts/variance-sim.mjs`.

**Algoritmo (fonte de verdade — `variance-sim.mjs`):**
1. Gerar payout structure por grupo: `placesPaid = round(field * 0.15)`, power-law com alpha variavel por field size (< 300 → 2.0, < 1000 → 1.7, < 3000 → 1.5, >= 3000 → 1.3). PKO: `alpha *= 0.65`. Min cash = 1.5x buy-in, deficit redistribuido dos top 10%.
2. Calibrar skill factor via binary search (200 iteracoes): `pos = ceil(N * u^skill)` onde u ~ U(0,1). Skill > 1 = edge positivo, < 1 = negativo. Target: `EV = 1 + ROI`.
3. Simular: para cada torneio, gerar posicao aleatoria, lookup payout. Profit = `(payout[pos-1] - 1) * buyIn` se ITM, senao `-buyIn`.
4. Agregar por semana para drawdown (peak-to-valley).
5. Repetir N simulacoes (default 10.000).

**Input (`SimulationInput`):**
```typescript
interface VarianceSimulationInput {
  groups: Array<{
    name: string;
    buyIn: number;      // USD
    field: number;      // avg field size
    roi: number;        // decimal (0.15 = 15%)
    count: number;      // total torneios no periodo
    isPKO: boolean;
  }>;
  weeks: number;          // 1 | 4 | 12 | 52
  simulations?: number;   // default 10000
}
```

**Output (`VarianceSimulationResult`):**
```typescript
interface VarianceSimulationResult {
  // Resumo
  ev: number;                    // lucro medio esperado USD
  stdDev: number;                // desvio padrao USD
  profitablePct: number;         // % simulacoes lucrativas
  totalTournaments: number;
  totalInvested: number;         // investimento total USD

  // Bandas de confianca (percentis)
  percentiles: {
    p0_15: number;   // pior caso 1/667
    p2_5: number;    // pessimista 1/40
    p15: number;     // ruim 1/7
    p30: number;
    p50: number;     // mediana
    p70: number;
    p85: number;     // bom 1/7
    p97_5: number;   // otimista 1/40
    p99_85: number;  // melhor caso 1/667
  };

  // Drawdown
  drawdown: {
    mean: number;
    median: number;
    p95: number;
    p99: number;
    worst: number;
  };

  // Contribuicao por grupo
  groupContributions: Array<{
    name: string;
    count: number;
    invested: number;
    expectedProfit: number;
  }>;

  // Histograma (para Recharts na Fase 3)
  histogram: Array<{
    bucketStart: number;  // ex: -10000
    bucketEnd: number;    // ex: -5000
    count: number;
  }>;

  // Meta
  simulationsRun: number;
  elapsedMs: number;
}
```

**Regras de negocio:**
- Bucket size do histograma: auto-calculado como `max(1000, round(range / 15 / 1000) * 1000)` onde range = max - min dos resultados.
- Simulacoes default 10.000, clamp [1000, 50000].
- `weeks` determina total de torneios: `group.count` ja eh o total pro periodo (wizard calcula `perWeek * weeks` antes de enviar).
- Engine nao depende de nenhum servico externo.

**Criterio de aceitacao:**
- [ ] `POST /api/variance/simulate` retorna resultado valido em < 2s para 10K simulacoes x 3000 torneios
- [ ] Output contem todos os campos de `VarianceSimulationResult`
- [ ] Resultados sao reproduziveis com seed fixa (opcional via input `seed?: number`)
- [ ] Engine roda sem dependencia de rede/API externa

---

## RF-02: Refatorar endpoint simulate

**Descricao:** Manter rota `POST /api/primedope/simulate` (backward-compat) mas adicionar alias `POST /api/variance/simulate` que chama o engine nativo. Remover fetch externo, semaphore, retry logic e rate limiting artificial.

**Regras de negocio:**
- `POST /api/primedope/simulate` continua funcionando (redireciona internamente para engine nativo).
- `POST /api/variance/simulate` e o endpoint canonico.
- Rate limiting removido (simulacao local e barata — 0.3s).
- Semaphore removido (nao ha mais request externo).
- Cache mantida na tabela `primedope_runs`: se input hash identico e run < 5min (TTL reduzido de 30min), retorna cached.
- Campo `source` no resultado: `'native'` (novo), `'cache'` (existente).
- Resultado persistido em `primedope_runs` com `source = 'native'`.

**Criterio de aceitacao:**
- [ ] `POST /api/variance/simulate` retorna resultado do engine nativo
- [ ] `POST /api/primedope/simulate` retorna mesmo resultado (backward-compat)
- [ ] Cache hit retorna resultado anterior se inputHash identico e < 5min
- [ ] Sem fetch externo ao PrimeDope.com em nenhum code path
- [ ] `source: 'native'` no resultado quando recem-calculado

---

## RF-03: Atualizar PrimedopeResult para output nativo

**Descricao:** Adaptar `PrimedopeResult.tsx` para renderizar o novo formato `VarianceSimulationResult`. Manter layout existente (4 KPI cards + CI table + bankroll percentiles) mas popular com dados reais do engine.

**Mapeamento de campos:**
- Card EV: `result.ev`
- Card ROI: `(result.ev / result.totalInvested * 100)` — calculado no client
- Card SD: `result.stdDev`
- Card RoR: **removido** (engine nativo nao calcula RoR — requer bankroll input; substituir por `profitablePct` "Chance de Lucro")
- Tabela CI: mapear `percentiles.p2_5/p15/p50/p85/p97_5` nas 3 faixas (70% = p15..p85, 95% = p2_5..p97_5, 99.7% = p0_15..p99_85)
- Bankroll percentiles: **substituir** por drawdown card (drawdown.median, p95, worst)

**Regras de negocio:**
- Se `result.profitablePct < 50`: exibir badge "Alto risco" vermelho
- Se `result.profitablePct >= 90`: badge "Baixo risco" verde
- Senao: badge "Risco moderado" amarelo

**Criterio de aceitacao:**
- [ ] 4 KPI cards renderizam com dados reais (EV, ROI calc, SD, Chance de Lucro)
- [ ] Tabela CI mostra 3 faixas (70%, 95%, 99.7%) com valores de `percentiles`
- [ ] Drawdown section mostra median, p95, worst
- [ ] Badge de risco exibido baseado em `profitablePct`
- [ ] Loading skeleton durante simulacao
- [ ] Error block para erros genericos (nao mais 502/upstream)

---

## RF-04: Atualizar hook usePrimedopeSimulation

**Descricao:** Refatorar `usePrimedopeSimulation.ts` para chamar `POST /api/variance/simulate`. Remover logica de AbortController (simulacao rapida, nao precisa cancelar). Remover rate limiting client-side.

**Regras de negocio:**
- Mutation chama `/api/variance/simulate`.
- Invalidar query `["home-overview"]` apos sucesso (paridade existente).
- Toast de sucesso com `profitablePct` e `ev` formatado.
- Toast de erro generico (sem tratamento especial de 429/502).

**Criterio de aceitacao:**
- [ ] Hook chama endpoint `/api/variance/simulate`
- [ ] Sucesso invalida home overview
- [ ] Sem AbortController, sem rate limit check client-side
- [ ] Error handling simplificado

---

## RF-05: Limpar codigo morto

**Descricao:** Remover todo codigo relacionado ao fetch externo PrimeDope.

**Arquivos/trechos a remover:**
- `primedopeIntegration.ts`: `PRIMEDOPE_URL`, `Semaphore` class, `fetchPrimedopeOnce`, `fetchPrimedopeWithRetry`, `saveChartFromUrl`, `getChartFsPath`. Manter: `resolveExchangeRates`, `nativeToUsd`, `computeInputHash`, `buildHashableInput`.
- `server/routes/primedope.ts`: `GET /chart/:hash` (charts eram stubs). Rate limit functions (`checkRateLimit`, `noteSimulateCall`, `clearSimulateCall`) e state.
- `shared/primedopeDefaults.ts`: remover `PRIMEDOPE_LIMITS.CONCURRENT_FETCHES`, `FETCH_TIMEOUT_MS`, `RETRY_BACKOFF_MS`, `RETRY_MAX_ATTEMPTS`. Manter: `CACHE_TTL_MS` (ajustar para 5min), `RETENTION_DAYS`, `RATE_LIMIT_PER_USER_MS` (remover).
- `PrimedopePanel.tsx`: footer "Powered by PrimeDope.com".

**Criterio de aceitacao:**
- [ ] Zero referencias a `primedope.com` em qualquer arquivo de producao
- [ ] Classe Semaphore removida
- [ ] Rate limiting removido (server + client)
- [ ] Chart proxy route removida
- [ ] Footer atribuicao removido
- [ ] tsc 0 apos remocao

---

# FASE 2 (VR-2): Agregacao Inteligente + ROI Historico

**Dependencia:** VR-1 completa.

## RF-06: Endpoint historical-stats

**Descricao:** `GET /api/variance/historical-stats` retorna ROI e field size medio por tier x tipo, calculados do historico real do user (tabela `tournaments`, `grind_session_id IS NULL`).

**Query (logica validada em sessao — deduplicar + ajustar re-entry):**
```sql
WITH deduped AS (
  SELECT DISTINCT ON (name, site, buy_in, prize, field_size, position, date_played::date)
    buy_in, prize, field_size, type
  FROM tournaments
  WHERE grind_session_id IS NULL AND buy_in >= 10 AND currency = 'USD'
    AND user_id = $1
  ORDER BY name, site, buy_in, prize, field_size, position, date_played::date, date_played
)
SELECT
  tier, type, COUNT(*), AVG(buy_in), AVG(field_size),
  SUM(prize) / NULLIF(SUM(buy_in) + SUM(GREATEST(0, -(prize + buy_in))), 0) as roi_adjusted
FROM deduped
GROUP BY tier, type
```

**Tiers (buckets fixos):**
- `high`: buy_in >= 100
- `mid`: buy_in >= 50 AND < 100
- `low`: buy_in >= 22 AND < 50
- `entry`: buy_in >= 10 AND < 22

**Output:**
```typescript
interface HistoricalStats {
  tiers: Array<{
    tier: 'high' | 'mid' | 'low' | 'entry';
    type: 'Vanilla' | 'PKO' | 'Mystery';
    count: number;           // torneios deduplicados
    avgBuyIn: number;
    avgField: number;
    roiAdjusted: number;     // decimal, ajustado re-entry
  }>;
  totals: {
    tournaments: number;
    dateRange: { from: string; to: string }; // ISO dates
    duplicatesRemoved: number;
  };
}
```

**Regras de negocio:**
- Deduplicar por `(name, site, buy_in, prize, field_size, position, date_played::date)` — remove duplicatas de timezone offset.
- ROI ajustado: `SUM(prize) / (SUM(buy_in) + SUM(GREATEST(0, -(prize + buy_in))))` — contabiliza custo de re-entries.
- Tiers com < 20 torneios: retornar mas marcar `lowSample: true`.
- Cache no server: 1h (historico muda raramente — so com upload novo).
- Invalidar cache apos `POST /api/upload` (upload de CSV).

**Criterio de aceitacao:**
- [ ] Endpoint retorna tiers com ROI ajustado e field size do historico real
- [ ] Deduplicacao remove ~40% dos registros duplicados
- [ ] Re-entries (prize < -buy_in) contabilizadas no denominador do ROI
- [ ] Tiers com < 20 torneios marcados `lowSample: true`
- [ ] Response < 500ms (query otimizada com DISTINCT ON)
- [ ] Cache 1h, invalidado apos upload

---

## RF-07: Modo de agregacao no wizard

**Descricao:** Substituir selector "Perfil + Dia + Multiplicador" por modo unificado: "Simular por Periodo". User escolhe Perfil (A/B/C) + Periodo (1 semana / 1 mes / 1 trimestre / 1 ano). Sistema agrega TODOS os dias daquele perfil.

**Comportamento:**
1. User seleciona Perfil A + Trimestre (12 semanas).
2. Sistema busca `planned_tournaments WHERE profile = 'A'` de TODOS os dias.
3. Agrupa por tier x tipo (RF-06 tiers).
4. Para cada grupo: `count = torneios_na_grade / 7 * dias_perfil_A * weeks`. Exemplo: 62 torneios Mid Vanilla na grade / 7 = 8.86/dia * 4 dias_A_por_semana * 12 semanas = 425.
5. Popula ROI e field do historico (RF-06). Se nao tem historico, fallback para `NETWORK_DEFAULTS_ROI`.
6. Mostra tabela agrupada (6-10 rows maximo, nao 263).
7. User pode editar ROI, field, count de qualquer grupo antes de simular.
8. Botao "Simular" envia grupos para `POST /api/variance/simulate`.

**Selector de periodo:**
| Label | Valor `weeks` |
|-------|--------------|
| 1 Semana | 1 |
| 1 Mes | 4 |
| 1 Trimestre | 12 |
| 1 Ano | 52 |

**Regras de negocio:**
- Dias por perfil: contar quantos dias da semana tem `planned_tournaments` com aquele profile. Exemplo: Profile A em dias 0,1,2,3,4,5 = 6 dias.
- Se user nao tem `planned_tournaments` no profile selecionado: mostrar empty state "Adicione torneios na aba Grade para simular."
- Campo "Investimento diario" (input numerico opcional): se preenchido, escala buy-ins proporcionalmente para casar com o total. Exemplo: investimento real $1500/dia mas grade soma $1200/dia → scale factor 1.25 aplicado em todos buy-ins.
- Manter seletor "Dia especifico" como modo alternativo (toggle "Por dia" vs "Por periodo") para backward-compat.
- Badge `≈est` permanece nos campos preenchidos por heuristica/default.
- Badge `≈hist` (novo, azul) para campos preenchidos por historico real.

**Criterio de aceitacao:**
- [ ] Wizard agrega torneios de todos os dias do perfil selecionado
- [ ] Tabela mostra 6-10 grupos (tier x tipo), nao 263 rows individuais
- [ ] ROI e field populados do historico via RF-06
- [ ] Periodo 1 semana/mes/trimestre/ano ajusta count de cada grupo
- [ ] User pode editar qualquer campo antes de simular
- [ ] Campo "Investimento diario" escala buy-ins proporcionalmente
- [ ] Empty state quando nao ha torneios no perfil
- [ ] Modo "Por dia" disponivel via toggle

---

## RF-08: Endpoint buckets-aggregate

**Descricao:** `GET /api/variance/buckets-aggregate` retorna grupos agregados por tier x tipo para um perfil, com ROI/field do historico ou defaults.

**Query params:** `profileLetter=A&weeks=12`

**Output:**
```typescript
interface AggregatedBuckets {
  groups: Array<{
    name: string;           // "Mid Vanilla", "High PKO", etc
    tier: string;
    type: string;
    buyIn: number;          // avg buy-in USD do grupo
    field: number;          // avg field (historico ou default)
    roi: number;            // decimal (historico ou default)
    countPerWeek: number;   // torneios/semana neste grupo
    count: number;          // total = countPerWeek * weeks
    isPKO: boolean;
    source: 'historical' | 'default';  // de onde veio ROI/field
    lowSample: boolean;     // < 20 torneios no historico
  }>;
  meta: {
    profileLetter: string;
    weeks: number;
    daysInProfile: number;       // quantos dias tem esse perfil
    tournamentsPerWeek: number;  // soma de countPerWeek
    weeklyInvestment: number;    // soma de buyIn * countPerWeek
  };
}
```

**Regras de negocio:**
- Merger: `Satellite` e `Add-on` → contabilizar em `Vanilla` do mesmo tier.
- Tier names PT-BR: `{ high: 'High', mid: 'Mid', low: 'Low', entry: 'Entry' }`.
- Nome do grupo: `"${tier} ${type}"` → "Mid Vanilla", "High PKO", etc.
- `isPKO`: true se type = 'PKO'.
- Grupos com count = 0 nao incluidos.

**Criterio de aceitacao:**
- [ ] Retorna grupos agregados por tier x tipo
- [ ] ROI/field do historico quando disponivel, default quando nao
- [ ] `source` indica origem de cada grupo
- [ ] `meta.weeklyInvestment` soma corretamente
- [ ] Satellites/Add-on mergeados em Vanilla

---

# FASE 3 (VR-3): UX Polish + Visualizacao

**Dependencia:** VR-2 completa.

## RF-09: Histograma de resultados

**Descricao:** Renderizar histograma de distribuicao de lucro usando Recharts `BarChart`. Dados de `result.histogram`.

**Visual:**
- Eixo X: faixas de lucro (ex: "-$10k..-5k", "+$0k..5k")
- Eixo Y: quantidade de simulacoes
- Cores: barras vermelhas para faixas negativas, verdes para positivas
- Linha vertical tracejada na mediana (p50)
- Tooltip mostra: faixa, count, % do total

**Criterio de aceitacao:**
- [ ] BarChart renderiza com dados do `histogram` array
- [ ] Cores vermelha/verde por sinal do lucro
- [ ] Linha mediana tracejada
- [ ] Tooltip com faixa + count + %
- [ ] Responsive (colapsa em mobile)

---

## RF-10: Cards de cenario visual

**Descricao:** 3 cards lado a lado (grid 3 cols) mostrando cenarios Pessimista / Mediana / Otimista.

**Layout por card:**
```
[icone] PESSIMISTA (2.5%)
-$3.171
"1 a cada 40 trimestres"
```

**Dados:**
| Card | Percentil | Cor | Label odds |
|------|----------|-----|-----------|
| Pessimista | p2_5 | Vermelho (text-red-500) | "1 a cada 40 {periodo}" |
| Mediana | p50 | Azul (text-blue-500) | "Resultado tipico" |
| Otimista | p97_5 | Verde (text-emerald-500) | "1 a cada 40 {periodo}" |

`{periodo}` = "semanas" / "meses" / "trimestres" / "anos" baseado em `weeks`.

**Criterio de aceitacao:**
- [ ] 3 cards renderizam com dados corretos dos percentiles
- [ ] Cores consistentes (red/blue/green)
- [ ] Label de odds contextualizado pelo periodo
- [ ] Valor formatado como USD com sinal (+/-)

---

## RF-11: Card de drawdown

**Descricao:** Card dedicado explicando drawdown esperado durante o periodo.

**Layout:**
```
DRAWDOWN ESPERADO
"A maior queda pico-a-vale que voce pode esperar durante o periodo"

Tipico:     $2.787    (mediano)
Preparar:   $6.737    (95% dos casos)
Pior raro:  $18.273   (extremo)

[barra visual mostrando proporcao tipico/preparar/pior]
```

**Criterio de aceitacao:**
- [ ] Card mostra 3 niveis de drawdown (median, p95, worst)
- [ ] Texto explicativo contextual
- [ ] Barra visual de proporcao entre niveis

---

## RF-12: Contribuicao por grupo

**Descricao:** Tabela/lista mostrando quanto cada grupo contribui para o EV total.

**Layout:**
| Grupo | Torneios | Investido | EV |
|-------|----------|-----------|-----|
| G2 Mid Van+Myst | 336 | $24.192 | +$3.730 |
| G4 Low Van+Myst | 408 | $14.280 | +$2.142 |
| ... | | | |
| **TOTAL** | **1440** | **$71.988** | **+$10.798** |

**Regras de negocio:**
- Ordenar por EV absoluto decrescente (maior contribuidor primeiro).
- EV negativo em vermelho, positivo em verde.
- Barra de progresso relativa mostrando proporcao do EV de cada grupo.

**Criterio de aceitacao:**
- [ ] Tabela mostra todos os grupos com torneios, investido e EV
- [ ] Ordenado por |EV| desc
- [ ] Total na ultima linha
- [ ] Cores verde/vermelho por sinal do EV

---

## RF-13: Dias em PT-BR + totalizador

**Descricao:** Corrigir labels de dias para PT-BR e adicionar totalizador na tabela de buckets.

**Mapeamento dias:**
```typescript
const DIAS_PT_BR = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
```

**Totalizador:** linha final da tabela de buckets mostrando:
- Count total (soma)
- Investimento total (soma de buyIn * count)
- ABI medio (investimento / count)

**Criterio de aceitacao:**
- [ ] Selector de dia mostra nomes em PT-BR (modo "Por dia")
- [ ] Totalizador na tabela de buckets com count total, investimento total, ABI

---

## RF-14: Curvas de equity (20 random paths)

**Descricao:** Grafico de linhas (Recharts LineChart) mostrando 20 caminhos aleatorios de equity acumulada ao longo das semanas, mais bandas de confianca 70%/95%.

**Dados necessarios (novo campo no output do engine):**
```typescript
// Adicionar ao VarianceSimulationResult:
equityCurves: {
  paths: number[][];     // 20 arrays, cada um com `weeks` valores (equity acumulada por semana)
  bands: {
    p2_5: number[];      // percentil 2.5% por semana
    p15: number[];       // percentil 15% por semana
    p85: number[];       // percentil 85% por semana
    p97_5: number[];     // percentil 97.5% por semana
  };
};
```

**Visual:**
- 20 linhas finas semi-transparentes (paths aleatorios)
- Area sombreada entre p15 e p85 (banda 70%)
- Area mais clara entre p2_5 e p97_5 (banda 95%)
- Linha zero horizontal tracejada
- Eixo X: semanas (1..12)
- Eixo Y: profit acumulado USD

**Regras de negocio:**
- Selecionar 20 paths deterministicamente (indices 0, 500, 1000... para reprodutibilidade).
- Bandas calculadas por semana: para cada semana w, sortear todos os resultados parciais e pegar percentis.
- Engine nativo precisa trackear equity acumulada por semana para cada simulacao (ja faz no drawdown calc — extender).

**Criterio de aceitacao:**
- [ ] LineChart renderiza 20 paths com opacidade 0.15
- [ ] Areas sombreadas para bandas 70% e 95%
- [ ] Linha zero horizontal
- [ ] Eixo X em semanas, Y em USD
- [ ] Responsive

---

## Requisitos Nao-Funcionais

- **Performance:** Engine nativo < 2s para 10K simulacoes x 3000 torneios. Endpoint historical-stats < 500ms.
- **Seguranca:** Endpoints requerem `requireAuth`. userId extraido de `req.user.userPlatformId` (padrao do projeto).
- **Compatibilidade:** `POST /api/primedope/simulate` continua funcionando (alias). Frontend detecta formato automaticamente.
- **Dados:** Query historico respeita regra 6.1 — `WHERE grind_session_id IS NULL` (so historico, nao sessoes).

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth | Fase |
|--------|------|-----------|------|------|
| POST | /api/variance/simulate | Roda simulacao Monte Carlo nativa | JWT | VR-1 |
| POST | /api/primedope/simulate | Alias backward-compat → engine nativo | JWT | VR-1 |
| GET | /api/variance/historical-stats | ROI + field por tier x tipo do historico | JWT | VR-2 |
| GET | /api/variance/buckets-aggregate | Grupos agregados + meta para wizard | JWT | VR-2 |

## Modelos de Dados Afetados

### primedope_runs (alteracao)
| Campo | Tipo | Alteracao |
|-------|------|----------|
| source | varchar | Novo valor `'native'` (alem de `'primedope'`/`'cache'`) |

Sem migration necessaria (varchar livre). Sem tabela nova.

## Cenarios de Teste Derivados

### VR-1 — Engine
- [ ] 10K simulacoes x 6 grupos x 12 semanas retorna resultado valido em < 2s
- [ ] EV proximo do valor teorico (ROI * investido, tolerancia 10%)
- [ ] Percentis sao monotonicamente crescentes (p2_5 < p15 < p50 < p85 < p97_5)
- [ ] Drawdown.median < drawdown.p95 < drawdown.worst
- [ ] Histograma cobre 100% das simulacoes (sum counts = simulations)
- [ ] Cache hit retorna mesmo resultado quando hash identico e < 5min
- [ ] PKO groups tem variancia menor que Vanilla equivalente (alpha * 0.65)
- [ ] ROI negativo calibra corretamente (skill < 1)
- [ ] Seed fixa produz resultado identico

### VR-2 — Agregacao
- [ ] Historical-stats deduplicata ~40% dos registros de teste
- [ ] ROI ajustado contabiliza re-entries (prize < -buy_in)
- [ ] Tiers com < 20 torneios marcados lowSample
- [ ] Buckets-aggregate agrupa 263 planned_tournaments em ~8 grupos
- [ ] Satellites e Add-on mergeados em Vanilla
- [ ] Investimento diario escala buy-ins proporcionalmente
- [ ] Empty state quando perfil sem torneios

### VR-3 — Visualizacao
- [ ] Histograma renderiza com cores red/green por sinal
- [ ] 3 cards cenario mostram pessimista/mediana/otimista
- [ ] Drawdown card mostra 3 niveis
- [ ] Curvas equity renderizam 20 paths + bandas
- [ ] Dias em PT-BR no selector
- [ ] Totalizador mostra soma correta

## Fora de Escopo
- Risk of Ruin (requer modelagem de bankroll — feature futura)
- Simulacao multi-player / comparativo entre jogadores
- Exportar PDF/imagem (defer para sprint futuro)
- Integracao com Sharkscope ou outros providers externos
- Recalcular variancia automaticamente apos upload (cron — feature futura)
- Field size por rede (Suprema vs Stars etc) — agregacao por tier e suficiente

## Dependencias
- VR-1: Nenhuma (pode comecar imediatamente)
- VR-2: VR-1 completa (engine nativo precisa existir)
- VR-3: VR-2 completa (dados agregados necessarios para visualizacao)

## Notas de Implementacao
- Engine: extrair logica de `scripts/variance-sim.mjs` para `server/services/varianceEngine.ts`. Manter script como referencia/validacao.
- Payout alpha: campo configurable no input (futuro) mas hardcoded por enquanto.
- Histograma: engine calcula server-side (nao enviar 10K resultados pro client).
- Equity curves: trackear equity acumulada por semana dentro do loop de simulacao existente (ja calcula drawdown por semana — extender array).
- Dedup query: `DISTINCT ON` do PostgreSQL e otimizado mas pode ser lento em tabelas grandes. Considerar materialized view se > 100K rows.
