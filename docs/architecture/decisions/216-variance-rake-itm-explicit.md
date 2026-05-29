# ADR-216 — Rake explícito na calibração + ITM% na UI (fidelidade poker)

**Status:** Accepted
**Date:** 2026-05-29
**Supersedes:** ADR-215 §D7 (que deixou rake apenas informativo e deferiu a calibração pra "VR-4")
**Related:** `server/services/varianceEngine.ts`, `client/src/components/primedope/AggregationWizard.tsx`, `server/routes/primedope.ts`, ADR-211, ADR-215
**Spec / roadmap:** `docs/specs/sprint-variance-calculator-poker-fidelity.md` (VR-CALC-1)

---

## Context

Founder pediu (2026-05-29) pra calculadora MTT (Simulador de Variância,
aba `variance` em GradePlanner) ficar mais fiel ao poker e superar a PrimeDope:
definir **% de ITM** e **% de rake** por torneio, entender como a PrimeDope faz
e implementar na nossa lógica.

### Estado anterior (ADR-215)
- `placesPaidPct` (ITM%, D6) já existia no input da engine mas **não exposto na UI** (default fixo 0.15).
- `rakePct` (D7) existia mas era **apenas informativo** (`totalRakeUsd` no output), **não entrava no cálculo** — ADR-215 deferiu a integração na calibração pra "VR-4" por receio de double-count com o ROI.
- Custo por torneio na engine = `buyIn` (sem rake). Prize pool = `field × buyIn`.

### Pesquisa (PrimeDope / MTTDB)
MTTDB (clone da PrimeDope que **expõe as fórmulas**) confirma o modelo da indústria:
- **Cost** = `buyIn × (1 + rake%)` (ex.: $215 + 7%).
- **Prize pool** = `field × buyIn` (rake **fora** do pool).
- **Payout** = `pool × (P/k)^steepness / Σ` (P = places paid / ITM).
- **ROI** é **líquido**, relativo ao cost. Expected payout = `cost × (1 + ROI)`.
- Fator de escala de calibração: **`α = (1 + rake) × (1 + ROI)`**.

Fontes: `Docs/strategy/mtt-variance-math-study-guide-2026-05-29.md`,
[MTTDB](https://mttdb.com/poker-tools/mtt-variance-calculator/),
[PrimeDope](https://www.primedope.com/tournament-variance-calculator/).

---

## Decisão

### D1. Rake entra no custo E na calibração (resolve o deferral D7)

A engine usa **calibração reversa de skill** (binary search acha o skill que
faz o expected payout bater o alvo). O receio de double-count do ADR-215 se
resolve assim: o ROI é **líquido sobre o cost** e o rake entra explicitamente
no alvo da calibração — não há dupla contagem.

```ts
// calibrateSkill: target de expected-payout (unidades de buy-in/pool)
const target = (1 + rakePct) * (1 + targetROI);   // antes: (1 + targetROI)

// simulação: custo por torneio inclui rake
const cost = 1 + rakePct;
profit = pos <= P ? (payouts[pos-1] - cost) * buyIn : -cost * buyIn;

// totalInvested = custo real
totalInvested = Σ buyIn * (1 + rakePct) * count;
```

**Prova de não-double-count + back-compat:** net ROI = `(E[payout] − cost)/cost`.
Com `E[payout] = (1+rake)(1+ROI)` e `cost = (1+rake)`: net ROI = `ROI` exato.
Com `rakePct = 0`: `target = (1+ROI)`, `cost = 1`, `totalInvested = Σ buyIn·count`
— **idêntico** ao comportamento anterior. Todos os 55 testes legados passam.

### D2. ITM% (`placesPaidPct`) e Rake% (`rakePct`) editáveis por torneio na UI

`AggregationWizard` ganha duas colunas por linha:
- **Rake %** (default 0) — após Buy-in.
- **ITM %** (default 15) — após Field.

UI digita em **percent**; estado/engine guardam **decimal** (÷100 no onChange).
`sanitizeForSimulate` clampa: ITM ∈ [0.05, 0.5], rake ∈ [0, 0.5] (paridade com o
zod do backend, que já aceitava ambos opcionais desde D6/D7).

### D3. Leaks conhecidos apresentados na página

Banner âmbar sempre visível + seção expansível listando o que o modelo **ainda
não** captura (payout sintético, PKO/bounty simplificado, satélite como vanilla,
sem re-entry/late-reg/ICM, field fixo, ROI ponto-fixo, independência entre
torneios, drawdown semanal). Founder: "os leaks conhecidos devem ser
apresentados na página".

---

## Consequências

### Positivas
- Rake passa a afetar **custo + variância + RoR** corretamente (antes só relatório).
- ROI continua sendo **líquido** (semântica PrimeDope) — sem double-count.
- ITM%/rake calibráveis por tipo de torneio direto na UI.
- Transparência: leaks visíveis evitam falsa confiança no número.

### Negativas / Neutras
- `rakePct = 0` (default) → zero mudança de comportamento (back-compat total).
- Sims em cache com rake>0 (não havia) não existem; cache key inclui inputHash.
- Tabela ganhou 2 colunas (overflow-x-auto já presente).

---

## Não incluído (roadmap futuro — `sprint-variance-calculator-poker-fidelity.md`)
- Estrutura de payout real derivada do CSV (vs power-law sintético).
- PKO bounty como fluxo de EV separado.
- Satélite flat-payout.
- Re-entry/rebuy/add-on, late reg, ICM, field variável, incerteza de ROI.
- Import do histórico CSV (Feature A — bloqueado por Torneios + Upload).

---

## Testes
- Engine (`tests/services/varianceEngine.test.ts`): +5 — rake sobe o target de
  calibração, rake=0 idêntico a omitir, totalInvested inclui rake, net ROI
  preservado, escala de custo. 60/60.
- UI (`tests/client/variance/AggregationWizard.test.tsx`): +3 — render ITM/rake,
  conversão percent→decimal no payload, banner de leaks. 20/20.
- Suite variance completa: 214/214. tsc 0.
