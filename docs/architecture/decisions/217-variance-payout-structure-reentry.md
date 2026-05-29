# ADR-217 — Payout structure + re-entry + satélite + calculadora sem bankroll

**Status:** Accepted
**Date:** 2026-05-29
**Related:** ADR-211 (engine nativa), ADR-215 (math), ADR-216 (rake/ITM), `server/services/varianceEngine.ts`, `client/src/components/primedope/AggregationWizard.tsx`, `PrimedopePanel.tsx`
**Spec:** `docs/specs/sprint-variance-calculator-poker-fidelity.md`

---

## Context

Founder pediu a "versão final excelente" da calculadora MTT: achar tudo que não
funciona + gaps de fidelidade poker + implementar. Análise geral encontrou:

1. **Funcional:** a calculadora ficava **totalmente escondida** quando o usuário
   não tinha wallet (`bankrollUsd <= 0` → empty state). Mas bankroll só é
   necessário pro Risk of Ruin — a simulação de variância funciona sem ele.
2. **Leak (ADR-215 #2):** satélite tratado como vanilla (payout power-law) — na
   real é payout **flat** (N assentos de valor igual), variância muito menor.
3. **Gap:** estrutura de payout não escolhível (só o alpha automático por field).
4. **Gap:** re-entry/rebuy não modelado — custo real subestimado.
5. **Test debt pré-existente:** `PrimedopeResult.native` (testids drawdown
   desatualizados) + `primedope-smoke` (payload no formato externo morto pré-VR-1)
   falhavam independente desta mudança.

---

## Decisões

### D1. Calculadora funciona sem bankroll (fix funcional)
`PrimedopePanel` não esconde mais o wizard quando `bankrollUsd <= 0`. Mostra um
hint ("cadastre wallets pra liberar o Risk of Ruin") e renderiza a calculadora
normalmente. RoR continua opt-in via bankroll.

### D2. Payout structure por grupo (`payoutStructure?`)
`'standard'` (default, alpha por field — comportamento atual) | `'flat'`
(alpha × 0.6, mais ITM efetivo) | `'topheavy'` (alpha × 1.35, mais concentrado)
| `'satellite'` (payout **flat**: cada assento pago = `pool / nº assentos`;
variância só de cashar ou não). Resolve o leak do satélite. UI: dropdown no
painel "Avançado" por grupo; trocar a estrutura ajusta o **ITM% default**
(Padrão 15%, Flat 20%, Top-Heavy 12%, Satélite 10%) salvo se o user já
customizou o ITM.

### D3. Re-entry por grupo (`avgEntries?`, default 1)
Bullets médios por torneio (1 = sem re-entry; 1.6 = re-entra ~60%). Generaliza
o custo: `costFactor = (1+rake) × avgEntries`. Calibração:
`target = (1+rake) × avgEntries × (1+ROI)`. `totalInvested = buyIn × costFactor
× count`. Net ROI preservado, sem double-count. Default (1) = back-compat.

### D4. Test debt pré-existente corrigido
- `PrimedopeResult.native`: testids alinhados ao `DrawdownCard` real
  (`drawdown-card` + `drawdown-{tipico|preparar|pior}`).
- `primedope-smoke`: payload migrado pro formato nativo (`groups` + `weeks`),
  `source: 'native'`, evento `variance_simulation_run`.

---

## Back-compat
Todos os campos novos (`payoutStructure`, `avgEntries`) são **opcionais** com
default = comportamento anterior. Os 60 testes pré-ADR-217 da engine passam sem
mudança. `payoutStructure='standard'` + `avgEntries=1` → idêntico.

## Consequências
- Calculadora utilizável por qualquer usuário (sem wallet).
- Satélite com variância correta (flat) — antes superestimava long-tail.
- Estrutura + re-entry calibráveis por tipo de torneio (UI painel Avançado).
- Suite variance 279/279 verde (era 1 fail pré-existente + features novas).

## Não incluído (roadmap — research-gated)
- PKO bounty como fluxo de EV separado (alpha-flatten continua interim).
- ICM / deals de mesa final. Field variável (regen de payout caro).
- Payout real derivado do CSV. Ver spec §2.2/§2.4.

## Testes
Engine +6 (satélite flat, flat/topheavy alpha, avgEntries calibração + custo,
net ROI combinado). UI +4 (painel avançado render, toggle, estrutura→ITM,
payload). Panel +1 (sem-bankroll usável). Total 279/279, tsc 0.
