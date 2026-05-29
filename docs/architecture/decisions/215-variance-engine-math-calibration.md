# ADR-215 — Variance Engine Math Calibration

**Status:** Accepted
**Date:** 2026-05-29
**Supersedes (partial):** ADR-211 §percentile, §histogram
**Related:** `server/services/varianceEngine.ts`, `client/src/components/primedope/PrimedopePanel.tsx`, ADR-211 (native MC engine), ADR-212 (aggregate tiers)
**Research:** `memory/research_variance_2026-05-29.md`

---

## Context

O PrimeDope variance simulation (engine native em `server/services/varianceEngine.ts`)
recebeu pedido do founder pra ser **"mais preciso e robusto"** com **"mais
entendimento matematico"** (2026-05-29). Pesquisa em 6 topicos (PrimeDope
original, ITM%, RoR, percentile interp, power-law alpha, histogram sizing)
identificou divergencias entre a implementacao atual e o consenso da industria
+ best practices estatisticas.

### Estado atual (ADR-211)

- `percentile(sorted, p)` usa `Math.floor(sorted.length * p / 100)` — sem
  interpolacao linear. Erro de ate ±1 bucket em N=10K, visivel em p99.85.
- Sem **Risk of Ruin** computado (resultado expoe so `profitablePct`).
- Sem **confidence interval no EV** (EV e estimativa MC mas reportado como
  numero exato).
- Sem **mediana ROI** (so EV ROI calculado externamente em PrimedopeResult).
- `placesPaid = round(fieldSize * 0.15)` **hardcoded** — ITM real varia 10-25%
  por estrutura.
- `rake` **inexistente como input** — implicitamente embutido no ROI alvo.
- `alpha` PKO usa `*= 0.65` multiplier — convencao industria sugere `-= 0.3`
  (subtracao no expoente, nao escala).
- Histograma usa `max(1000, round(range/15/1000)*1000)` — bucket count fixo 15,
  sem adapter pra distribuicao skewed long-tail.
- Drawdown granularidade **semanal** — DD intra-semana ignorado (sessao real
  tem 20-40 torneios em algumas horas).

---

## Decisoes

### D1. Percentile = NIST R7 (linear interp)

Substituir `Math.floor`-based percentile por linear interpolation Type 7
(Hyndman & Fan 1996, default do Excel `PERCENTILE.INC` / numpy / pandas / R /
Postgres `percentile_cont`).

```ts
function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const h = ((n - 1) * p) / 100;       // p em [0,100]
  const k = Math.floor(h);
  const d = h - k;
  if (k + 1 >= n) return sorted[n - 1];
  return sorted[k] + d * (sorted[k + 1] - sorted[k]);
}
```

**Justificativa:** paridade Excel (founder/dev pode validar manualmente),
sempre dentro do range observado, padrao de facto em DS/finance.
**Regressao test:** `percentile([1,2,3,4,5], 25) === 2.0` (R7) — distingue de
R6 que daria 1.5.

### D2. Risk of Ruin (MC empirico)

Adicionar `riskOfRuin` ao result, computado durante simulation loop:

```ts
// Por simulacao, rastrear minimo cumulativo
let minCum = 0;
let cum = 0;
for (week...) {
  cum += weekProfits[w];
  if (cum < minCum) minCum = cum;
}
// Ruin = minCum <= -bankrollUsd
ruinCount += minCum <= -bankrollUsd ? 1 : 0;
```

Input: `bankrollUsd` (opcional — se omitido, RoR nao calculado).
Output: `riskOfRuin: { pct, bankrollUsd, ruinSims, totalSims }`.

**Justificativa:** Malmuth closed-form (`exp(-2·WR·BR/SD²)`) assume gaussian
+ tempo infinito; long-tail MTT viola ambos. PrimeDope/MTTDB/Chen-Ankenman
convergem em MC empirico pra MTT (research §3).

**Sanity check opcional (futuro):** computar tambem Malmuth closed-form; se
divergencia > 30%, sinaliza skew distorceu — reportar so MC.

### D3. Confidence Interval no EV

EV reportado e estimativa MC com erro `±1.96·σ/√N` (95% CI normal — vale aqui
porque media de N>1000 amostras converge a gaussiana por CLT, mesmo a
distribuicao base sendo skewed).

```ts
const evStdErr = stdDev / Math.sqrt(simCount);
const evCi95 = { lower: ev - 1.96 * evStdErr, upper: ev + 1.96 * evStdErr };
```

Output: `evCi95: { lower, upper, stdErr }`.

**Justificativa:** comunica precisao real da estimativa. EV=$1234 vs
EV=$1234±$87 — segundo eh informacao acionavel.

### D4. Mediana ROI ao lado de Mean ROI

Result ja tem `percentiles.p50` (mediana de profit USD). Frontend calcula ROI
medio como `ev/totalInvested`. Adicionar tambem `medianROI = p50/totalInvested`
no proprio result (evitar recalculo no client + garantir paridade).

Output: `roi: { mean, median }` (substituindo nada — adiciona).

**Justificativa:** distribuicao MTT P&L e skewed long-tail; mean > median
sempre. Player precisa saber qual cenario "vejo mais frequentemente"
(median) vs "esperado a longo prazo" (mean).

### D5. Histogram = Freedman-Diaconis com clamp UI

Substituir bucket logic atual por:

```ts
function chooseBucketSize(sorted: number[]): number {
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const range = max - min;
  if (range <= 0 || n < 100) {
    // Sturges fallback (n pequeno ou degenerado)
    const k = Math.ceil(Math.log2(Math.max(n, 2))) + 1;
    return range / k;
  }
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  if (iqr <= 0) return range / 15; // fallback
  const h = (2 * iqr) / Math.pow(n, 1 / 3); // Freedman-Diaconis
  const kRaw = Math.ceil(range / h);
  const k = Math.min(60, Math.max(10, kRaw)); // clamp UI
  return range / k;
}
```

**Justificativa:** FD usa IQR (robusto a outliers — long-tail MTT nao infla
IQR como infla sigma do Scott). Default numpy.histogram_bin_edges. Clamp
[10,60] evita histogramas inutilizaveis pra UI quando N grande (50K) +
extreme skew (bounty hits) geram 200+ bins.

### D6. ITM% parametrizavel por bucket (override opcional)

Schema input ganha campo opcional `placesPaidPct` por bucket:

```ts
interface VarianceGroup {
  // ... existentes
  placesPaidPct?: number; // 0.10 a 0.30; default 0.15
}
```

`generatePayouts` aceita `placesPaidPct` opcional; default 0.15 mantem
backward-compat.

**Justificativa:** consenso industria 15-20% Standard, 10-30% extremos.
Permite usuario calibrar pra estrutura especifica (Flat=0.25, Steep=0.10).

### D7. Rake explicito + EV liquido

Schema input ganha campo opcional `rakePct` por bucket:

```ts
interface VarianceGroup {
  // ... existentes
  rakePct?: number; // 0.05 a 0.15 tipico; default 0
}
```

Quando `rakePct > 0`, EV final do bucket fica:
```
ev_bruto = (payout - 1) * buyIn
ev_liquido = ev_bruto - rakePct * buyIn // rake ja descontado do payout? NAO — rake e custo de entrada
```

**Atencao:** No modelo PrimeDope original `cost = buyIn * (1 + rakePct)`. No
nosso engine, rake esta implicitamente embutido na calibracao reversa do
skill (binary search ajusta skill pra atingir ROI alvo, e ROI ja considera
rake). **Para preservar back-compat**, rake fica como input INFORMATIVO no
output (`rakeUsd: number`) por enquanto, sem mudar o calculo de payout.

**Follow-up (sprint VR-4):** integrar rake no calculo de skill calibration
explicitamente, separando "edge bruto" de "edge liquido".

### D8. PKO alpha: subtracao, nao escala

Atual: `if (isPKO) alpha *= 0.65;` (multiplica)
Novo: `if (isPKO) alpha = Math.max(0.8, alpha - 0.3);` (subtrai, com floor)

**Justificativa:** convencao industria (research §5) sugere subtracao no
expoente porque o achatamento PKO e aditivo (metade do prize pool vira
bounty, distribui mais uniformemente o resto). Multiplicacao por 0.65 e
agressivo demais pra fields pequenos (alpha=2.0 vira 1.3, mas alpha=1.3
vira 0.845 — quase linear, irreal).

**Migration**: comparar output antes/depois pra Sunday Million PKO field 3000:
- Atual: alpha=1.3, PKO=0.845 → top-heavy bem fraco
- Novo: alpha=1.3, PKO=1.0 (floor) → ainda achatado, mas plausivel

### D9. Intra-week drawdown (DEFER)

DD granularidade semanal subestima DD real (sessoes intra-semana podem ter
swings de 5-10 buy-ins). Schema input poderia ganhar `sessionsPerWeek` pra
splitar count em sessoes.

**Decisao:** **DEFER pra sprint VR-4.** Mudanca de schema + recalibracao
testes + UI nova. ADR-215 foca em precision matematica do output existente;
intra-week DD muda granularidade — escopo separado.

---

## Consequencias

### Positivas

- **Precision:** percentile R7 + RoR explicito + EV CI dao numeros que o
  founder pode comparar com Excel/numpy diretamente.
- **Transparencia:** mediana ROI revela skew (gap mean-median). Hoje
  escondido.
- **Flexibilidade:** ITM% + rake parametrizaveis permitem calibrar por
  estrutura sem hardcode.
- **UI estavel:** histograma FD com clamp [10,60] sempre renderiza bem.
- **Sem breaking change forte:** todos os campos novos sao OPCIONAIS no
  schema; defaults mantem comportamento atual.

### Negativas

- **PKO output muda:** simulacoes PKO existentes (em cache) vao diferir.
  Mitigacao: cache key inclui inputHash que ja muda quando logica de calculo
  muda (pendente: bump version no `computeInputHash`).
- **Test churn:** ~5-10 testes do varianceEngine vao precisar atualizar
  assertions de percentile (linear interp da numeros levemente diferentes).
- **Cost:** RoR adiciona O(weeks) overhead por simulacao (rastrear minCum).
  Mensuravel mas pequeno (~5% slowdown em 10K sims).

### Neutras

- Backward-compat preservado: inputs sem `placesPaidPct`/`rakePct` rodam
  identicos ao atual (exceto PKO D8 e percentile D1).

---

## Implementacao

Sprint atual (VR-3.1):
1. D1 percentile R7
2. D2 RoR (opcional `bankrollUsd` input)
3. D3 EV CI95
4. D4 medianROI
5. D5 histogram FD
6. D8 PKO subtracao
7. Tests cobrindo cada decisao
8. Schema input: D6 (`placesPaidPct?`) + D7 (`rakePct?`) ambos opcionais com
   defaults — quebra de schema zero
9. UI PrimedopeResult: mostrar RoR + EV±CI + mediana

Sprint futura (VR-4):
- D9 intra-week DD
- Rake calibration no skill binary-search
- Sanity check Malmuth vs MC

---

## Sources

Resumo em `memory/research_variance_2026-05-29.md`. Principais:

- [PrimeDope variance calculator](https://www.primedope.com/tournament-variance-calculator/)
- [PrimeDope RoR formula (Malmuth)](https://www.primedope.com/poker-risk-of-ruin-formula/)
- [MTTDB MTT variance calculator (PrimeDope clone, expoes formulas)](https://mttdb.com/poker-tools/mtt-variance-calculator/)
- [NIST percentile types handbook](https://www.itl.nist.gov/div898/handbook/prc/section2/prc262.htm)
- [Hyndman & Fan 1996 — Sample quantiles in statistical packages](https://www.tandfonline.com/doi/abs/10.1080/00031305.1996.10473566)
- [Wikipedia Histogram (FD, Sturges, Scott)](https://en.wikipedia.org/wiki/Histogram)
- [GTO Wizard — Payout structures impact ICM](https://blog.gtowizard.com/how-payout-structures-impact-icm/)
- [Sire 2007 — Universal statistical properties of poker tournaments (arxiv)](https://arxiv.org/abs/physics/0703122)
- [stochastic-poker-models open-source ref](https://github.com/nfolinsb/stochastic-poker-models)
- Bill Chen & Jerrod Ankenman — Mathematics of Poker (ConJelCo 2006), cap 22

---

## Notas

- "Sileo Chen formula" mencionada no prompt original do user **nao existe** —
  provavel confusao com Bill Chen (Mathematics of Poker). Documentado em
  `research_variance_2026-05-29.md` §3.
- PrimeDope nao publica constantes; engineering reverso via inputs/outputs e
  viavel mas custoso. varianceEngine.ts ja diverge intencionalmente (binary
  search skill) e sera mais preciso que PrimeDope publico apos D1-D8.
