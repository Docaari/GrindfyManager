# HUD V2 — Strategy & Adaptation Plan (founder print analysis)

Source: print founder `Screenshot_1.png` (HUD popup MTT 6-max profissional, 140 stats em 13 secoes).
Catalogo bruto: `Docs/research/hud-popup-catalog-2026-04-29.md`.
Analise estrategica: 2026-04-29 (strategist agent).

## TL;DR

- **Schema atual nao suporta** target-as-range (vs validation min/max), sample size por stat, hierarquia 2 niveis, ou volume 140 stats.
- **NAO importar 140 stats num template unico** — sample size insuficiente vira UX ruim. Pareto 80/20: 30 stats core (Tier S+A) entregam 80% do valor coaching.
- **OCR Claude Vision viavel** — tabular limpo, risco principal = subscrito sample size (font 60% menor). Prompt few-shot resolve.
- **4 sprints (~6 semanas)** entregam adaptacao completa, incremental, zero big-bang.

## Gap Analysis (criticos)

| Gap | Schema atual | Real | Severidade |
|-----|-------------|------|------------|
| Target como range (`28-30`) | `StatField.min/max` confunde validation com target | Range estrategico GTO | CRITICA |
| Sample size por stat | Global no snapshot | Subscrito por linha (`99 _2`) | CRITICA |
| Hierarquia secao > sub-secao | 1 nivel | "BB Defense > river > XR + bet + bet" | ALTA |
| Volume 140 stats | 3 templates 9-13 | UX colapsa | ALTA |
| Targets como knowledge base | Inline em StatField | GTO-derived universal por formato/stake | ALTA |

## Top 10 stats core (Pareto 80/20)

VPIP, PFR, RFi BTN, RFi CO, 3bet total, Fold vs 3bet OOP, BB fold vs steal, BB XF vs cbet, Cbet flop IP, WWSF.

## Tier ranking (ICE) por secao

| Tier | Secoes | Stats |
|------|--------|-------|
| S | Basics, RFi posicao, 3bet, Resteal | ~22 |
| A | Pos Flop PFR IP, BB Defense | ~27 |
| B | PFR OOP, 3bet pots IP/OOP, PFC IP | ~34 |
| C | Multiway, Blind War SB+BB | ~51 |

S+A = 49 stats = 35% do total mas 80% do valor coaching.

## Template strategy

**Manter** 3 templates V1 + adicionar tier-based:
- `MTT 6-max Core` (~30 stats Tier S+A) — default novo onboarding
- `MTT 6-max Pro` (~70 stats S+A+B) — usuarios 10k+ maos
- `MTT 6-max Elite` (140 stats — print founder) — power users

**Killer feature:** bibliotecas modulares. Importar secao isolada (so "Blind War" sem o resto). PT4/HM3 nao tem isso.

## Schema deltas necessarios

```ts
// Nova tabela: hud_stat_targets (knowledge base global)
{
  id, statKey, format ('mtt-6max'|'cash-6max'|...),
  stakeBucket ('low'|'mid'|'high'), targetMin, targetMax,
  source ('founder'|'gto-wizard'|'community'), version
}

// StatField refactor
{
  key, label, decimals, suffix,
  inputMin: 0, inputMax: 100,    // renomeado — validation
  group?, subGroup?,              // NOVO — hierarquia 2 niveis
  targetRef?: 'mtt-6max-low'      // FK pra hud_stat_targets
}

// hud_stat_snapshots.values
// ANTES: Record<key, number | null>
// DEPOIS: Record<key, { value: number | null, sampleSize: number | null }>
```

Migracao gradual (lesson #7): Zod `optional + default` + back-fill storage. Snapshots V1 continuam validos.

## Sprint breakdown (4 waves)

| Sprint | Tempo | Escopo | Entregavel |
|--------|-------|--------|------------|
| F4 | 1 sem | Schema migration + targets refactor | hud_stat_targets table, StatField split (input vs target), snapshots aceitam formato novo + legado, Coach tool dewighta stats com n<30 |
| F5 | 1.5 sem | UI sub-secoes + template Core 30 stats | Hierarquia 2 niveis renderiza, template MTT 6-max Core, founder valida iteracao |
| F6 | 2 sem | OCR Claude Vision V2 | Pipeline upload→Vision extract→review→save, layout fingerprint cache, sample size handling, manual fallback |
| F7 | 1.5 sem | Templates Pro/Elite + modular libs | 70-stat e 140-stat templates, "importar secao", marketplace interno |

**Total:** ~6 semanas, 4 entregaveis testaveis, zero big-bang.

## OCR V2 prompt strategy

```
Pipeline:
upload PNG -> Claude Vision com prompt few-shot ->
{section, subsection?, statName, targetMin, targetMax, heroValue, sampleSize?} ->
diff vs template existente -> founder review screen ('isso e VPIP? confirma') ->
salva snapshot + atualiza layout fingerprint cache
```

Custo estimado: 3-5k tokens/print (ICE 8 — alto valor, custo baixo).

Riscos:
1. Subscrito sample size (font 60% menor) — confusao "99 _2" com "992". Mitigacao: prompt explicito + validar com 10 prints reais.
2. Sub-secoes (bold/italic) — few-shot examples necessarios.
3. Alignment primeiro uso — review screen manual, cache fingerprint depois.

## Recomendacao final

1. **Founder valida ranking ICE** das secoes antes de F5 escolher cortes finais.
2. **NAO mergear F3 + F4 num sprint so** — schema migration tem risco proprio, isole.
3. **Acionar pm-spec** pra Sprint F4 (escopo bem definido).
4. **Acionar system-architect** pra ADR sobre `hud_stat_targets` global vs inline.

## Decisoes pendentes founder

- [ ] Aceita ranking ICE do strategist (S/A/B/C tiers)?
- [ ] Confirma roadmap 4 sprints (F4/F5/F6/F7) ou prefere consolidar?
- [ ] Manter os 3 templates V1 ou substitui-los pelo Core 30-stats novo?
- [ ] OCR V2 prioridade alta (sprint F6) ou pode adiar pra Q3?
- [ ] `hud_stat_targets` versionado por formato + stake bucket — granularidade OK ou simplificar?
