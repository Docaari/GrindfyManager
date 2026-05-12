# ADR-147: Read tools do Coach — padrão de extração de service vs reuso de route handler; fonte canônica de banca para `simulate_bankroll_scenario`; variante "backticked" do prompt

## Status
Aceito

## Data
2026-05-12

## Contexto

O Sprint AI-0A liga 5 read tools "estrela" do Coach. Algumas reusam lógica que hoje vive **só** em route
handlers (não em serviços reutilizáveis). A spec (RF-01..05, RF-14, "Notas de Implementação") deixou três
decisões em aberto para o system-architect:

1. **`get_tournament_suggestions` / `explain_tournament_score`** precisam da lógica de scoring do Tournament
   Selector. Hoje a montagem da lista + o cálculo vivem em `server/routes/tournament-selector.ts`, que importa
   `computeTournamentScore` de `server/scoring/tournamentScorer.ts` e `playerBundleCache.getOrLoad` de
   `server/services/playerBundle.ts`. O handler de tool deve (a) extrair um service reutilizável, OU (b)
   chamar o route handler / reimplementar a montagem? **Restrição inviolável:** nunca duplicar a fórmula
   `computeTournamentScore`.

2. **`simulate_bankroll_scenario`** precisa da "banca consolidada do usuário em USD". Há duas fontes possíveis:
   `walletService` (`getConsolidatedBalance` — multi-wallet, FX-aware, ADR-033/034) ou
   `user_settings.bankroll_amount` (bankroll standalone v1, em uma única moeda). Qual é a canônica?

3. **Os blocos de prompt de citation/confidence** (`CITATIONS_RULES`, `CONFIDENCE_RULES`,
   `CONFIDENCE_AND_CITATIONS` e a variante `CONFIDENCE_AND_CITATIONS_BACKTICKED`) hoje têm uma variante
   "backticked" criada para preservar o cache key exato do bloco estático em produção. RF-14 manda reforçar
   essas regras. Mantém a variante backticked (preserva cache key, mas duplica texto) ou unifica (aceita uma
   quebra de cache única, fonte realmente única)? Lembrar lesson #10 (DRY de prompts / cache da Anthropic).

## Decisão

### 1. Extrair `tournamentScoringService` (preferível — DRY)

**Extrair** um service `server/services/tournamentScoringService.ts` (ou
`server/scoring/tournamentScoringService.ts`) com duas funções puras de orquestração:

```ts
// Reusa computeTournamentScore + playerBundleCache; NÃO reimplementa nada.
async function rankTournamentsForContext(userId, opts): Promise<RankedSuggestion[]>
async function explainScoreForTournament(userId, ref): Promise<ScoreBreakdown>
```

- `rankTournamentsForContext`: carrega o bundle (`playerBundleCache.getOrLoad`), monta a lista candidata
  (library entries + torneios Suprema via `storage`), chama `computeTournamentScore(sct, bundle, {lookbackDays})`
  para cada um, aplica filtros (`maxBuyIn` em USD, `profile`, `date`/`dayOfWeek`), ordena por score desc.
- `explainScoreForTournament`: localiza o torneio na fonte correta (`tournaments` / `tournament_library` /
  `planned_tournaments`, validando ownership `userId`), chama `computeTournamentScore` com a flag de breakdown,
  mapeia `TournamentScoreResult.signals` + `rationale` para o shape `{ signalName, weight, value, contribution,
  sampleSize, confidence }`.

**Quem usa o service:**
- `server/coachTools/handlers/getTournamentSuggestions.ts` → `rankTournamentsForContext`
- `server/coachTools/handlers/explainTournamentScore.ts` → `explainScoreForTournament`

**O que foi extraído (Sprint AI-0A, pós-reviewer HIGH-1):** os **builders de `ScoringInputTournament`**
(bucketização de buy-in→USD, `buyInBucket`, `timeOfDayBucket`, `fieldBucket`, `mapCategory`, `mapSpeed`,
`dayOfWeekFromDate`) saíram de inline em `server/routes/tournament-selector.ts` para o módulo
compartilhado `server/scoring/buildScoringInput.ts` (`buildLibraryScoringInput` / `buildSupremaScoringInput`).
**Os dois consumidores** — o route do Tournament Selector e o `tournamentScoringService` do Coach — montam
o SCT pelo mesmo builder. Isto era a raiz do bug HIGH-1: o service montava um SCT "casca" (passava
`undefined` nos buckets, `buyIn` em moeda nativa não convertida) → o scorer ignorava o sinal de buy-in
(virava prior 50) e os bonus de cold-start de field/time. Agora o SCT é montado corretamente nos dois lados.
- **Não** foi feito o refactor mais agressivo (transformar o route inteiro do Tournament Selector numa casca
  fina sobre o service) — o route mantém seu próprio loop de scoring (que tem responsabilidades extras:
  `alreadyInGrid`, bandas de bankroll, filtros `minScore`/`minSample`). Isso é um **TODO** documentado.
  O contrato crítico do ADR está satisfeito: `computeTournamentScore` (a fórmula) **não** é duplicado em
  lugar nenhum, e a **montagem do SCT** agora é DRY (um único módulo).

**Justificativa:** o ADR-016 já estabelece o padrão "endpoint agregado em vez de N chamadas"; o ADR-023 já
prevê handlers de tool importando livremente de qualquer módulo do projeto. O risco da refatoração do route
quebrar testes existentes do Tournament Selector foi mitigado limitando a extração aos builders puros (módulo
sem efeitos colaterais), que os testes de integração do route não mockam — eles passam intactos. O que
**nunca** é aceito: copiar `computeTournamentScore` ou a montagem do SCT para dentro do handler/service —
e isso continua respeitado.

### 2. Fonte canônica de banca para `simulate_bankroll_scenario` = `walletService.getConsolidatedBalance().totalUSD` (USD)

> **Errata (Sprint AI-0A, pós-reviewer):** a versão anterior deste §2 dizia que `getConsolidatedBalance`
> faz "fallback interno para `user_settings.bankroll_amount`" — **isso é factualmente errado**. O método
> só agrega o que está em `wallets`/`wallet_transactions`; um usuário v1 sem wallet vê `totalUSD: "0.00"`.
> Não há cascata para o setting standalone. O texto abaixo já está corrigido.

- **Fonte:** `walletService.getConsolidatedBalance(userId)` — retorna a banca consolidada das wallets do
  usuário, já normalizada para USD (FX-aware, ADR-033/034). SSoT do Bankroll v2 (multi-wallet). O cenário
  hipotético (perder N buy-ins, etc.) é aplicado sobre o `totalUSD` consolidado. **Não há fallback** para
  `user_settings.bankroll_amount` dentro do handler nem dentro de `getConsolidatedBalance`.
- **Thresholds (soft/hard limit):** vêm do **próprio** `getConsolidatedBalance` — ele retorna
  `softLimitUSD`/`hardLimitUSD` (computados a partir da `bankrollRule` via `computeThresholds` /
  `BANKROLL_TOLERANCE` de `server/scoring/bankrollRules.ts`) **mas apenas no modo de agregação `'global'`**.
  No modo `per_wallet` ambos vêm `null` mesmo com banca configurada. Comparações sempre em USD (lesson #6).
- **Banca não configurada (`totalUSD <= 0` — típico de usuário v1 sem wallet):** handler retorna
  `currentAmount: 0, newAmount: 0, ruleViolated: false, alertLevel: 'safe', note: 'bankroll_nao_configurado'`,
  recommendation orientando a configurar. Sem throw. (A migração v1→v2 que cria a wallet inicial é outro
  fluxo — não é responsabilidade desta tool.)
- **Banca > 0 mas sem regra global (modo `per_wallet`):** handler **não** trata como "não configurada" —
  simula mostrando `currentAmount`/`newAmount`/`percentChange` reais, `softLimitUSD: null`,
  `hardLimitUSD: null`, `ruleViolated: false`, `alertLevel: 'safe'`, `note: 'regra_de_banca_nao_global'`,
  recommendation explicando que não há regra global para avaliar violação.

**Justificativa:** `walletService` é a SSoT do bankroll desde o ADR-034; usar o setting standalone como
fonte seria um retrocesso e ignoraria wallets em múltiplas moedas. O usuário v1 que ainda não tem wallet
simplesmente recebe `bankroll_nao_configurado` — comportamento aceitável (a tool não inventa banca a
partir do setting legado). Lesson #6 (normalizar para USD cedo) aplica-se diretamente.

### 3. Unificar os blocos de citation/confidence — aceitar a quebra de cache única, fonte realmente única

- **Remover** a variante `CONFIDENCE_AND_CITATIONS_BACKTICKED` e o `CONFIDENCE_AND_CITATIONS` legado como
  duas variantes do mesmo conteúdo. Consolidar em **um único conjunto de constantes** em
  `server/coachSafetyPrompts.ts` (`CITATIONS_RULES` + `CONFIDENCE_RULES` reforçadas — ou um único bloco
  combinado), importado por **ambos** `coachPrompts.ts` (legacy) e `coachSystemBuilder.ts` (cacheado). Sem
  variante backticked. Se algum ponto histórico envolvia os exemplos em backticks só por estética/markdown,
  padronizar num formato só.
- **Custo:** o cache key do bloco estático da Anthropic muda **uma vez** quando este sprint for pra produção
  (próxima conversa de cada usuário paga um cache miss). Aceitável — é uma quebra única, planejada, e o RF-14
  já muda o texto de qualquer jeito (não há como reforçar as regras sem mudar o texto). Lesson #10 manda
  evitar **divergência silenciosa** entre cópias — a solução certa é uma fonte só, não duas mantidas em
  paralelo.
- O system prompt continua sendo um **array** com `cache_control: { type: 'ephemeral' }` no bloco estático
  (não vira string) — só o conteúdo do bloco muda.

**Justificativa:** manter duas variantes literais do mesmo texto é exatamente o que a lesson #10 alerta
contra (divergência silenciosa quebra cache de forma imprevisível). Uma fonte única + uma quebra de cache
controlada e única é estritamente melhor que duas cópias + risco perpétuo de drift.

### Conteúdo do reforço de RF-14 (resumo — detalhe no diagrama de fluxo e na spec)

1. **Citação inline obrigatória** para todo número factual derivado de tool/contexto:
   `[fonte: <toolName>:<key>:<period>]` (ex.: `[fonte: query_dimension:roi:30d]`,
   `[fonte: find_top_leaks:low_itm_turbos:90d]`, `[fonte: simulate_bankroll_scenario:lose_n_buyins:atual]`,
   `[fonte: get_tournament_suggestions:2026-05-14]`, `[fonte: explain_tournament_score:<id>]`,
   `[fonte: verify_leak_progress:<leakCode>:atual]`). Para page-context: `[fonte: <route>:<period>]`.
   Sem fonte segura → `[fonte: nao verificado]`. Dado hand-level / inexistente → `[nao sei: <motivo>]`.
   Regra explícita: "Coach NÃO pode mencionar número derivado de tool sem citação inline".
2. **Exemplos few-shot** só mencionam tools que estão de fato no registry pós-AI-0A (ver ADR-145 §1).
   Remover/corrigir qualquer menção a tool que era stub.
3. **Confidence tag obrigatória** quando a tool retorna sample size (`query_dimension.totalCount`,
   `find_top_leaks.evidence.n`, `read_user_hud_stats.latestSnapshot.sampleSize`, `verify_leak_progress.current.sampleSize`):
   `[confianca: baixa|media|alta, N=<n>]` — thresholds N<30 baixa, 30≤N<100 média, N≥100 alta (boundaries
   inclusivos, como hoje).
4. **Disclaimer financeiro condicional** para outputs que mencionem $/banca/saque/staking/tax: "isto é uma
   estimativa, não conselho financeiro" + tom condicional ("poderia considerar", nunca "você deve").

## Consequências

### Positivas
- `tournamentScoringService` extraído ⇒ `computeTournamentScore` tem **um** caller-orquestrador, reusado por
  route + 2 tools. DRY de verdade.
- Banca via `walletService` ⇒ a simulação reflete a banca real multi-wallet, não o setting v1 stale.
- Uma fonte de prompt ⇒ fim do risco de drift; cache miss único e planejado.

### Negativas
- Refatorar `tournament-selector.ts` para usar o service tem risco de regressão nos testes do Selector —
  mitigado (mesmo comportamento) e com fallback aceito (handler usa o service, route migra depois com TODO).
- Uma quebra de cache da Anthropic (próxima conversa de cada usuário). Aceito.

### Neutras
- Se o `getConsolidatedBalance` mudar de assinatura no futuro, o handler de simulação muda junto — custo
  baixo, é uma chamada só.

## Confiança

**Alta** para (2) e (3) — decisões diretas alinhadas a ADRs existentes (034) e a uma lesson (#10).
**Média-alta** para (1) — a extração do service é o caminho certo mas a refatoração do route é o ponto de
risco; o fallback aceito ("handler usa service novo, route migra depois") tira o risco do caminho crítico
do sprint.

## Referências
- Spec: `Docs/specs/sprint-ai-0a.md` (RF-03, RF-04, RF-05, RF-14, "Notas de Implementação")
- ADR-015 (scoring linear), ADR-016 (endpoint agregado / bundle), ADR-023 (registry — handlers importam
  livremente), ADR-033/034 (FX / multi-wallet — banca canônica), ADR-019/115 (prompt cache 2 blocos),
  ADR-086 (citations/confidence inline), ADR-145 (estado canônico do registry), ADR-146 (write tools v1)
- `server/scoring/tournamentScorer.ts` (`computeTournamentScore`), `server/services/playerBundle.ts`,
  `server/routes/tournament-selector.ts`, `server/services/walletService.ts` (`getConsolidatedBalance`),
  `server/scoring/bankrollRules.ts`, `server/coachSafetyPrompts.ts`
- Lessons #6 (normalizar USD antes de comparar thresholds), #10 (DRY de prompts / cache Anthropic)
