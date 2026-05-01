# ADR-063 — Stat Direction Semantics (`higher_better` / `lower_better` / `context` / `neutral`)

- Status: Accepted
- Date: 2026-05-01
- Sprint: Stats-V2 / F2 (precede F8 — comparator direction colors)
- Decision owner: autonomous (founder AFK; spec default Stats-V2 RF-06)
- Related: ADR-058 (catalogo estatico V2), ADR-062 (coach grouped response)

## Context

V1 (Sprint F3) implementou comparator de snapshots com heuristica simples:
seta `↑green` quando `delta > 0`, seta `↓red` quando `delta < 0`. Isso
funciona para um subconjunto de stats (`WWSF`, `BB/100`, `CBet IP success`)
mas falha catastroficamente em casos comuns:

- **VPIP (TAG)**: `delta = +5pp` significa o jogador esta jogando MAIS maos
  que o ideal — V1 colorava verde (errado).
- **Fold vs 3bet**: `delta = +5pp` significa o jogador foldou MAIS contra
  3bets (do hero perspective: passive leak, perde EV). V1 colorava verde.
- **AF (aggression factor)**: depende totalmente do estilo. Sem semantica
  V1 colorava aleatoriamente.
- **Sample size**: aumentar e bom em geral, mas comparar `delta` nao faz
  sentido como "ganho" — e meta-info.

Sem semantica explicita, o comparator gera **feedback enganoso** e o Coach
herda o erro porque le os mesmos deltas. Stats-V2 introduz 200+ entries —
multiplicar erro por 200 e inaceitavel.

Tres alternativas foram avaliadas:

1. **ML inferir direction** dinamicamente da populacao Grindfy. Rejeitado:
   sample atual <100 pro+ insuficiente; introduz drift; inviavel para V2
   (DEBT-V3).
2. **Manter so 2 cores green/red** sem direction. Rejeitado: forca o usuario
   a *saber de cor* qual stat e qual; perde nuance de stats `context`.
3. **User override por stat** (toggle "this stat is good when higher").
   Rejeitado: friccao UX, viola lesson #11 (user nao deve ter que
   configurar default sensato).

A decisao escolhida e **declarar `direction` por stat no catalogo estatico**,
com 4 valores possiveis e regras explicitas de cor + tooltip.

## Decision

### Enum `direction`

Cada `StatField` no catalogo (`shared/hud-stat-catalog.ts`) declara um dos
4 valores:

| direction | Significado | Stats tipicas |
|---|---|---|
| `higher_better` | Aumentar e sempre bom (do hero perspective) | `wwsf`, `bb_per_100`, `cbet_flop_ip_success`, `steal_btn_success`, `won_at_showdown_pct`, `c_bet_turn_success` |
| `lower_better` | Diminuir e sempre bom (do hero perspective) | `fold_vs_steal_bb`, `fold_vs_3bet`, `fold_vs_cbet_ip`, `wtsd_when_lose`, `c_bet_river_lose_after_call` |
| `context` | Depende do estilo do jogador (TAG/LAG/REC) | `vpip`, `pfr`, `3bet_pf`, `flop_aggression`, `turn_aggression`, `4bet_pf` |
| `neutral` | Nao tem direcao boa/ruim — apenas info | `af`, `sample_size`, `hands_played`, `tournaments_played` |

### Regras de cor no comparator

Para cada stat exibida no comparator/heatmap, a cor segue esta tabela:

| Estado | direction | Cor | Tooltip |
|---|---|---|---|
| on-target (delta entre min e max) | qualquer | **green** | "Dentro do range alvo" |
| off-target | `higher_better` + `delta > 0` | **green** | "Acima do alvo (bom)" |
| off-target | `higher_better` + `delta < 0` | **red** | "Abaixo do alvo (leak)" |
| off-target | `lower_better` + `delta > 0` | **red** | "Acima do alvo (leak)" |
| off-target | `lower_better` + `delta < 0` | **green** | "Abaixo do alvo (bom)" |
| off-target | `context` | **orange** | "Depende do seu estilo (TAG ideal X-Y, LAG Z-W) — Coach interpreta" |
| off-target | `neutral` | **gray** | "Stat informativo, sem direcao boa/ruim" |
| `value === null` | qualquer | **gray** | "Nao registrado neste snapshot" |

### `delta` calculation

```
delta = value - midpoint(target_min, target_max)
```

Sinal e magnitude usados acima. `direction` afeta apenas a *cor*; o
`delta` numerico e neutro (sempre `value - midpoint`).

### Tooltip strings em PT-BR (fixos)

Centralizados em `shared/stat-direction-tooltips.ts`:

```ts
export const DIRECTION_TOOLTIP_PT: Record<Direction, string> = {
  higher_better: 'Quanto maior, melhor (alvo: {min}-{max}{unit})',
  lower_better:  'Quanto menor, melhor (alvo: {min}-{max}{unit})',
  context:       'Depende do estilo (TAG ideal {min}-{max}{unit}, LAG difere)',
  neutral:       'Stat informativo — sem direcao boa/ruim'
};
```

Resolver via template substitution no client.

### Default `context` no backfill

Stats sem `direction` explicito (V1 layouts ou import legado) recebem
`direction: 'context'` no backfill (Stats-V2 RF-09). Lado seguro: comparator
exibe orange ("ambiguo") em vez de green/red errado. Forca documentacao
explicita por stat antes de colorir.

### Coach interpretation

O system prompt do Coach (Stats-V2 F10) recebe instrucao explicita:

> Stats vem com `direction`. Interprete:
> - `higher_better`: delta+ => elogie. delta- => leak.
> - `lower_better`: delta+ => leak. delta- => elogie.
> - `context`: explique trade-off (TAG/LAG) antes de classificar.
> - `neutral`: comente so se relevante para a pergunta.

Combinado com ADR-062 (grouped response), o Coach raciocina coerentemente
sobre 200 stats sem errar a direcao.

## Consequences

### Positivas

- Comparator e heatmap colorem coerentemente (zero falsos positivos do
  tipo "VPIP +5 verde").
- Coach raciocina com semantica explicita — feedback de leak nao confunde
  jogador.
- Catalogo torna-se documentacao viva: cada stat carrega *como interpretar*.
- Tooltips em PT-BR explicam direcao para usuario novato.

### Negativas

- 200+ stats precisam `direction` declarado explicitamente (sem default
  inferido — `context` e o seguro mas nao o ideal).
- Esforco inicial: classificar cada stat. Mitigado por templates por
  grupo (todo `bb_defense.fold_*` => `lower_better`; todo `rfi.*` =>
  `context`; etc.).
- Onboarding de developer: precisa entender 4 categorias antes de adicionar
  stat ao catalogo. Mitigado por exemplos no comentario do enum.

### Neutras

- Validation Zod refinement em `hud_layouts.fields_json`: `direction`
  obrigatorio (Stats-V2 RF-10).
- Tests unit (Stats-V2 RF-06 AC-6.1 a AC-6.4) cobrem cada combinacao
  direction x delta-sign.
- Storybook (futuro) ganha doc visual das 4 categorias.

## Alternativas rejeitadas

### A1 — ML inferir direction dinamicamente

Treinar modelo na populacao Grindfy (winners vs losers) para inferir se
`stat ↑` correlaciona com win-rate. Rejeitado:
- Sample atual insuficiente (<100 pro+, MVP).
- Bias de selecao (winners reportam mais).
- Nao explica *por que* (caixa-preta — UX ruim).
- DEBT-V3 quando user base >1k pro+.

### A2 — So 2 cores (green/red) sem direction

Manter heuristica simples e treinar usuario. Rejeitado:
- Dispara feedback errado em ~30% dos stats (`context` + `lower_better`).
- Coach ainda erra (mesma raiz).
- UX hostil ("aprenda quais sao bons quando aumentam").

### A3 — User override por stat (toggle "good when higher")

Permitir cada user configurar direction por stat. Rejeitado:
- Friccao UX (200 toggles).
- Lesson #11 (defaults sensatos > config burden).
- Sem ganho — direcao e propriedade do *stat*, nao do user.

## Confianca

Alta. Modelo de 4 categorias e padrao na industria de poker stats
analyzers (PT4, HM3 usam variantes equivalentes). Validavel por unit
tests determinista. Reversivel: catalogo em codigo, mudar `direction`
de uma stat e PR de 1 linha.
