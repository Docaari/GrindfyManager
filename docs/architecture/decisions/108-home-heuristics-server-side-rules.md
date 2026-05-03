# ADR-108: Heuristicas server-side via funcoes puras (Sprint home-reform-2 Onda 2)

## Status
Aceito

## Data
2026-05-03

## Contexto

A Sprint home-reform-1 (Onda 1) entregou o cockpit de Home com cache 30s e
`Promise.allSettled` para subqueries paralelas. A Sprint home-reform-1.5 entregou
um rule engine **client-side** (`dailyInsight`) reagindo a payload ja consolidado
para mostrar uma micro-recomendacao no card de DailyInsight (ADR-106).

Onda 2 introduz um bloco novo `<HeuristicsCard>` que deve mostrar **ate 3
heuristicas** de natureza diferente: comparacoes entre periodos (ROI 30d vs 60d),
agregacoes por dia da semana (best/worst day), e pace de cash vs baseline
historico. Essas regras precisam dados que **nao cabem no rule engine
client-side** porque exigem:

- Performance multi-periodo (30d e 60d) — duas queries com agregacao no DB.
- Agrupamento por dia da semana das ultimas 60 sessoes.
- Lifetime cash + meses ativos para baseline pace.

Levar isso pro client implicaria expor sessoes brutas (vazamento de dado e
custo de transferencia) ou pre-agregar em formatos rigidos. Mais natural rodar
no server, ja com inputs agregados em maos.

A pergunta arquitetural foi: **como modelar o motor de regras server-side?**

## Opcoes Consideradas

### Opcao 1: Servico puro com funcoes TypeScript
- Arquivo unico `server/services/homeHeuristics.ts` exporta
  `computeHeuristics(input: HeuristicsInput): Heuristic[]`.
- Cada regra = funcao pura. Testavel em isolamento, sem I/O.
- `home.ts` injeta inputs ja agregados (vindos de `getDashboardPerformance`,
  `getRecentSessions`, `getQuickStats`, `variance`, `todayDayOfWeek`).
- Thresholds em constants exportadas (`ROI_DROP_PP=5`, `DAY_OF_WEEK_DIFF_PP=10`,
  `CASH_PACE_RATIO=1.2/0.8`).
- **Pros:** zero cerimonia, super testavel (lesson #3 — mock idealizado nao se
  aplica porque nao ha I/O), debugavel via stepping no Vitest, 100% type-safe.
- **Contras:** cada nova regra exige PR + redeploy. Sem tweaking dinamico.

### Opcao 2: Motor declarativo (DSL/JSON config)
- Regras descritas em JSON: `{ id, when: <expr>, then: { message, severity, ctaHref } }`.
- Avaliacao via interpretador minimo ou lib (`json-logic-js`, `expr-eval`).
- **Pros:** novas regras sem deploy. Possibilidade de admin UI futura.
- **Contras:** complexidade alta para 4 regras simples; expressoes JSON ilegiveis
  em PR; debug terrivel; precisa whitelist de funcoes (security); over-engineering
  pro escopo Onda 2.

### Opcao 3: Tabela `home_heuristic_rules` + admin CRUD
- Mover regras pro DB. Admin UI edita.
- **Pros:** runtime tweaks; A/B testing nativo.
- **Contras:** Onda 2 nao precisa disso. Sem caso de uso real ainda. Custo de
  building admin UI > beneficio. Avaliar quando houver >10 regras.

### Opcao 4: Rule engine externo (json-rules-engine, nools)
- Lib npm ja resolveu o problema.
- **Pros:** features prontas (forward chaining, priority).
- **Contras:** sobrecarga de aprendizado para 4 regras; bundle size; outra
  dependencia para auditar; testes ficam acoplados a API da lib.

## Decisao

**Opcao 1.** Implementar `server/services/homeHeuristics.ts` como servico
puro com 4 funcoes-regra:

1. `roi-30d-vs-60d-drop` (caution) — disparado quando `perf60d.roi - perf30d.roi >= 5pp`.
2. `best-day-of-week` (positive) — dia da semana com ROI medio +10pp acima da
   media nas ultimas 60 sessoes (sample >=5).
3. `worst-day-of-week-warning` (caution) — dia da semana atual coincide com pior
   dia historico, diff <= -10pp.
4. `cash-pace-vs-baseline` (info ou positive) — cash 30d / (cashLifetime / monthsLifetime)
   > 1.2 (positive) ou < 0.8 (caution).

Ordem fixa de prioridade. Top 3 disparadas retornam.

**Inputs pre-agregados** vindos do orchestrator `home.ts`:
- `quickStats` (ja consultado em Onda 1 via `getQuickStats`).
- `performance30d` (ja consultado em Onda 1) e `performance60d` (subquery NOVA
  via `getDashboardPerformance(userId, '60d')`).
- `recentSessions` (ja consultado em Onda 1 — lookback 60 sessoes; aceito que
  Onda 1 retorna 5 e Onda 2 expande para 60 quando `withSessionsForHeuristics=true`).
- `variance` (subquery NOVA — input opcional para regras futuras Onda 3).
- `todayDayOfWeek` (vem do calculo timezone-aware D14).

## Consequencias

**Positivas:**
- Codigo simples, testavel, sem dependencias novas.
- Ordem de prioridade explicita no codigo (nao escondida em motor).
- Cada regra tem fixture isolada — fail rapido se thresholds mudam.
- Reutiliza `getDashboardPerformance` (ja testado em Onda 1).

**Negativas:**
- Toda nova regra = 1 PR + deploy. Aceito porque Onda 2 nao prioriza tweak
  rapido (founder-only, escopo travado).
- Thresholds duplicam-se entre frontend (cores severity) e backend (valores).
  Mitigado exportando constants num arquivo `shared/home-heuristics-thresholds.ts`
  futuramente (nao bloqueia Onda 2).

**Neutras:**
- Onda 3 pode substituir por motor declarativo ou LLM-based **se** > 10 regras
  e tweaking dinamico virar prioridade. Migracao = trocar implementacao do
  servico, mantendo assinatura `computeHeuristics(input): Heuristic[]`.
- Possivel evolucao: persistir ultima heuristica vista por user em
  `analytics_events` para nao re-mostrar a mesma 5x.

## Pontos de Extensao Onda 3+

- Substituir por LLM prompt-based: input vira "contexto agregado em texto",
  output JSON estruturado validado por Zod. Cache por hash do input.
- Adicionar regras stat-based (ex: "VPIP saiu de target em 3 sessoes"). Requer
  ja ter `topDeltas` calculado — input ja disponivel.
- Persistir analytics: `home_heuristic_impressions(userId, ruleId, shownAt)` com
  pruning para dedup nas proximas 24h.

## Confianca

Alta. Padrao bem-estabelecido em Grindfy (`scoring/`, `coachTools/`, `homeHeuristics`
segue mesmo molde). Sem novidade arquitetural; risco baixo.

## Referencias

- Spec: `Docs/specs/home-reform-2.md` §3 B12, §5 RF-34.
- ADR-106: Home Daily Insight Rule Engine (cliente, complementar).
- ADR-099: Home Operations Cockpit Pattern (contexto da Home).
- Lessons Learned #3, #9: pureza facilita teste; logar antes de fallback.
