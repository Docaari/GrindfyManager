# ADR-062 — Coach HUD Stats Grouped Tool Response

- Status: Accepted
- Date: 2026-05-01
- Sprint: Stats-V2 / F2 (precede F10 — Coach tool grouped)
- Decision owner: autonomous (founder AFK; spec defaults Stats-V2 RF-07)
- Related: ADR-052 (V1 tool shape), ADR-058 (catalogo estatico V2), ADR-063 (direction semantics)

## Context

A tool `read_user_hud_stats` foi introduzida na Sprint F3 (ADR-052) com um
shape *flat*: o Coach recebia `latestSnapshot.values` (`Record<key,number>`),
`deltaVsAverage` e `populationBenchmark` lado a lado, sem agrupamento por
area do jogo. Era suficiente para V1 (12 stats, 3 templates simples).

Stats-V2 expande o catalogo para **200+ stats organizadas em 16 grupos
profissionais** (`basics`, `rfi`, `threebet`, `resteal`, `pos_flop_pfr_ip`,
`pos_flop_pfr_oop`, `pos_flop_multiway`, `cbets_by_board`, `caller_pre_flop`,
`threeway_bb`, `bb_defense`, `pos_flop_pfc_ip`, `blind_war_sb`, `blind_war_bb`,
`threebet_pot_ip`, `threebet_pot_oop_vs_lp`). Devolver 200 numeros achatados
inviabiliza o raciocinio do Coach: o LLM nao sabe se `cbet_flop_oop_vs_lp`
pertence a "pos-flop OOP" ou "3bet pot OOP", forca tokens em todo turn, e
perde o conceito de "leak por area".

Tres alternativas foram avaliadas:

1. **Flat list com `group` field por stat** — Coach precisa group-by
   manualmente em cada turn, gasta tokens de raciocinio, perde semantica de
   summary.
2. **DB-side grouping com `GROUP BY` em query** — exige tabela de catalogo
   no DB (rejeitado por ADR-058 — catalogo estatico em codigo). Sem benefit.
3. **Filtrar so off-target server-side** — Coach perde overview, nao pode
   responder "como estao meus basics?" ou "elogie o que esta on target".

A decisao escolhida e *grouped output com summary calculado server-side*,
mantendo todas as 200 stats acessiveis, com flag `not_reported` para
`value=null` (em vez de excluir do payload).

## Decision

### Shape do retorno

```ts
{
  __type: 'ToolResult',
  tool: 'read_user_hud_stats',
  ok: true,
  data: {
    layoutId: string,
    layoutName: string,
    capturedAt: string,            // ISO8601
    sampleSize: number | null,
    groups: [
      {
        id: HudGroupId,             // snake_case enum (16 grupos)
        name: string,               // label PT-BR ("Basicos", "RFI por posicao")
        stats: [
          {
            id: string,             // snake_case (vpip, rfi_co, cbet_flop_ip)
            label: string,          // human-readable ("VPIP", "RFI CO")
            value: number | null,
            target_min: number,
            target_max: number,
            delta: number | null,   // signed; null se value=null
            direction: 'higher_better' | 'lower_better' | 'context' | 'neutral',
            off_target: boolean,    // value fora de [min, max]; false se value=null
            not_reported: boolean   // true se value=null
          }
        ]
      }
    ],
    summary: {
      total_off_target: number,    // contagem de off_target=true (excluindo null)
      total_on_target: number,     // contagem de off_target=false e value!=null
      total_null: number,          // contagem de value=null
      biggest_leak: {
        id: string,
        label: string,
        group: HudGroupId,
        delta: number,
        direction: string
      } | null
    }
  }
}
```

### Inclusao de `value=null` com flag `not_reported`

Stats com `value=null` (nao reportadas no snapshot) **sao incluidas** no
`groups[].stats[]` com `not_reported: true`, `value: null`, `delta: null`,
`off_target: false`. Justificativa:

- Coach pode sugerir ao usuario *o que reportar* ("Voce nao registrou seu
  Steal SB — esse stat e critico para late-stage MTT, considere preencher").
- Permite o LLM raciocinar sobre cobertura ("Voce so registrou 40% dos
  stats do grupo `pos_flop_pfr_ip` — sample insuficiente para diagnostico").
- Custo extra de tokens e marginal (200 entries grouped ~4KB; flat seria
  ~3KB; ganho de contexto compensa).

### `delta` como numero signed

```
delta = value - midpoint(target_min, target_max)
```

Negativo => abaixo do `target_min`. Positivo => acima do `target_max`.
Zero => exatamente no midpoint. **Coach interpreta o sinal segundo
`direction`** (ver ADR-063):
- `higher_better` + `delta > 0` => bom
- `higher_better` + `delta < 0` => leak
- `lower_better` + `delta > 0` => leak
- `lower_better` + `delta < 0` => bom
- `context` => Coach pondera com estilo TAG/LAG do user
- `neutral` => Coach ignora cor, comenta apenas se on/off range

### `direction` repassado para o Coach

A propriedade `direction` (definida em ADR-063) e enviada por stat. O Coach
recebe instrucao via system prompt para interpretar deltas conforme essa
semantica — substitui a heuristica generica V1 (`delta > 0 => bom`) que
dava resposta errada em VPIP, Fold-to-3bet, etc.

### `summary.biggest_leak`

Calculado server-side como `argmax(|delta|)` entre stats com:
- `value !== null`
- `off_target === true`
- `direction !== 'neutral'`
- (para `direction === 'context'`: incluido no ranking apenas se `|delta|`
  exceder 50% do range — heuristica para evitar VPIP +2 ofuscar Fold-vs-3bet
  +20)

Server-side garante que o Coach sempre recebe a mesma resposta para a mesma
pergunta — nao dependemos de o LLM fazer matematica corretamente.

### Stats com `value=null` excluidas de `total_off_target`

`total_off_target` conta SOMENTE entries com `value !== null`. Evita falso
alarme ("Voce tem 80 leaks" quando na verdade 80 stats nao foram reportadas).

## Consequences

### Positivas

- Coach raciocina por area do jogo (basics ok, leaks concentrados em
  pos-flop OOP, etc.) sem precisar fazer group-by no prompt.
- `summary` pre-calculado permite respostas rapidas ("Maior leak: Fold-vs-3bet
  +12pp acima do target").
- `not_reported` flag transforma cobertura em sinal explicito.
- Cache-friendly: shape estavel por layout. Anthropic prompt cache
  preserva hit ratio porque o prefixo do system prompt nao muda; somente
  o payload da tool varia entre snapshots.

### Negativas

- Payload cresce de ~1.5KB (V1 flat 12 stats) para ~4KB (V2 grouped 200
  stats). Tokens estimados ~3000 input por tool call (vs ~400 V1).
- Coach prompt token use sobe ~7x quando tool e chamada. Mitigado por
  cache (mesmo layout retornado em conversas subsequentes resulta em
  prefix overlap parcial — `groups[].id`, `name`, target ranges fixos).
- Stats `not_reported` ocupam tokens sem contribuir com info — mitigado
  pela utilidade ("Coach pode sugerir reportar").

### Neutras

- Migration server-side: handler `readUserHudStats.ts` reescrito para
  aplicar `groupBy(catalog, 'group')` e calcular summary. Sem mudanca
  de schema DB (catalogo e estatico — ADR-058).
- `Docs/api/coach-tools.md` atualizado com novo shape.
- Tests integration `tests/integration/coach/stats-analyzer-coach-tool.test.ts`
  reescritos para fixture com 200 stats.

## Alternativas rejeitadas

### A1 — Flat list com `group` field por stat

Manter array unico `[{ id, label, value, group, ... }, ...]` e deixar o
Coach group-by. Rejeitado: o LLM gasta tokens raciocinando, comete erros
em catalog grande, perde possibilidade de summary server-side ("biggest
leak").

### A2 — DB-side grouping via SQL `GROUP BY`

Persistir catalogo em DB (`hud_stat_catalog`) e fazer query
`SELECT group, jsonb_agg(...) FROM ... GROUP BY group`. Rejeitado por
ADR-058: catalogo deve viver em codigo (versionavel via git, sem drift,
sem migration por nova stat).

### A3 — Retornar so stats off-target

Filtrar server-side para reduzir payload (so envia stats com `off_target=true`).
Rejeitado: Coach perde capacidade de elogiar on-target ("Seus basics estao
solidos"), nao consegue responder "como esta meu jogo de blind war?", e
nao distingue null de on-target.

## Confianca

Alta. Shape testavel, summary determinista, payload size dentro de
budget Anthropic (8K input <<200K limite). Rollback simples — feature
flag `coachStatsGroupedV2` pode reverter para shape V1 se necessario.
