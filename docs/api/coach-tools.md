# Coach Tools — Catalogo

Documentacao detalhada de cada tool registrada no Coach v2.

Este arquivo e **vivo**: cresce a cada sprint conforme novas tools sao adicionadas. Cada entrada documenta o que o LLM ve (description), o input schema, o output shape e as politicas de gating/audit.

**Como o LLM consome:** o backend chama `exportToolsForAnthropic(tier)` (ADR-023) que serializa cada `CoachTool` registrada em formato JSONSchema da Anthropic Tool Use API. O LLM recebe `name + description + input_schema` e decide quando chamar com base no contexto da conversa.

**Politicas globais (validas para todas as tools):**
- Output sempre wrapped por `coachToolRunner` em `{__type: 'ToolResult', tool, ok: true, data}` (ADR-024).
- Erro de validacao Zod => `{ok: false, error: 'validation_failed', details: [...]}` SEM throw.
- Erro de handler => `{ok: false, error: 'handler_error', message}` + linha `coach_actions.status='failed'`.
- Limite hard de 5 tool calls por turn (ADR-026).
- Tier `'free'` nao recebe tools (`tools: []`). Pro/premium/admin recebem todas (read **e** write).

---

## Estado canonico do registry — pos-Sprint AI-0A (2026-05-12)

> **ATUALIZADO em AI-0A** (ADR-145). Antes deste sprint, o registry tinha 7 tools reais + 2 stubs quebrados;
> `query_dimension`/`get_tournament_suggestions`/`explain_tournament_score` nem apareciam (so nesta doc); 6 write
> tools tinham handler em `server/coachTools/handlers/` mas nao estavam registradas. Agora o registry tem **17
> tools + 1 alias deprecado** = 18 entradas no array `coachTools` exportado por `server/coachTools/index.ts`.
> **Todas** com `gateByTier: ['pro', 'premium', 'admin']` (free nao recebe tools). As entradas marcadas com a
> tag de enum corrigido refletem o schema real (`shared/schema.ts`), nao a doc original de Coach-2A.

| # | Tool | Tipo | `requiresConfirmation` | `confirmationLevel` | `auditLevel` | Origem |
|---|------|------|------------------------|---------------------|--------------|--------|
| 1 | `read_cooldown_history` | read | false | — | log | Cooldown-3 (ADR-042) |
| 2 | `read_user_hud_stats` (v2) | read | false | — | log | Stats-V2 (ADR-052b/062) |
| 3 | `read_user_bankroll_history` | read | false | — | log | Bankroll-Reports-Detail |
| 4 | `read_theme_with_linked_stats_and_spots` | read | false | — | log | stats-themes-linking-1 (ADR-142) |
| 5 | `read_theme_with_linked_spots` *(alias deprecado, 1 sprint)* | read | false | — | log | ADR-142 |
| 6 | `recommend_lesson` | read | false | — | log | Biblioteca-1 (ADR-075) |
| 7 | `query_dimension` | read | false | — | log | **AI-0A — religada (era ausente)** |
| 8 | `find_top_leaks` | read | false | — | log | **AI-0A — religada (era stub)** |
| 9 | `get_tournament_suggestions` | read | false | — | log | **AI-0A — religada (era ausente)** |
| 10 | `explain_tournament_score` | read | false | — | log | **AI-0A — religada (era ausente)** |
| 11 | `simulate_bankroll_scenario` | read | false | — | log | **AI-0A — religada (era stub)** |
| 12 | `register_tournament_in_grade` | write | **true** | — | persist | **AI-0A — registrada (handler ja existia)** |
| 13 | `record_wallet_transaction` | write | **true** | **`'strict'`** | persist | **AI-0A — registrada (handler ja existia)** |
| 14 | `start_grind_session` | write | **true** | — | persist | **AI-0A — registrada (handler ja existia)** |
| 15 | `log_session_completed` | write | **true** | — | persist | **AI-0A — registrada (handler ja existia)** |
| 16 | `log_leak_focus` | write | **true** | — | persist | **AI-0A — registrada (handler ja existia)** |
| 17 | `log_study_session` | write | **true** | — | persist | **AI-0A — registrada (handler ja existia)** |
| 18 | `verify_leak_progress` | read | false | — | log | **AI-0A — registrada (handler ja existia; NAO e write)** |

**`confirm-strict`** (`confirmationLevel: 'strict'`) eh um campo opcional do `CoachTool` descriptor, **em
memoria** (registry) — **nao** persistido em `coach_actions` na v1 (decisao do founder, ADR-146). Hoje so
`record_wallet_transaction` o usa; o frontend renderiza diff financeiro detalhado para ele (o `toolName` ja
basta para o frontend saber). Write tools = confirmacao SEMPRE na v1 (sem auto-aprovacao), sem `delete_*`
tools, undo 5 min via `payload_before` (ADR-083/146). Undo de `record_wallet_transaction` = reverse-row no
ledger (delta inverso, `reason: 'manual_adjustment'`), NUNCA hard-delete (ADR-058).

### Enums canonicos (correcao da doc Coach-2A — ADR-145)

- `category` (filtro de `query_dimension`, `manualEntry.type` de `register_tournament_in_grade`):
  **`['Vanilla', 'PKO', 'Mystery', 'Satellite']`** (alinhado ao `type` primario pos-ADR-031+add-on).
  *A doc Coach-2A listava `['Vanilla', 'PKO', 'Mystery']` — incompleto.*
- `speed` (filtro de `query_dimension`, `manualEntry.speed`, `groupBy: 'speed'`):
  **`['Normal', 'Turbo', 'Hyper']`** (alinhado a `tournaments.speed`, default `"Normal"`).
  *A doc Coach-2A listava `['Regular', 'Turbo', 'Hyper']` — `Regular` esta ERRADO.*
- `query_dimension.groupBy`: **`['site', 'category', 'speed', 'buyinRange', 'dayOfWeek', 'month', 'fieldSize']`**.
  `groupBy: 'fieldSize'` -> `storage.getAnalyticsByField` (o do dashboard — agrupa por % de eliminacao),
  **nao** `getAnalyticsByFieldSize` (buckets V2 do Stats Analyzer). (ADR-145 §4.)
- `query_dimension.period`: **`['all', '30d', '90d', 'ytd', '180d']`** (default `'all'`).
- `query_dimension.dimension`: **`['roi', 'profit', 'volume', 'itm', 'abi', 'fts', 'cravadas']`** (inalterado).

> As secoes "Tool 1..5" abaixo foram atualizadas em AI-0A para refletir os schemas/enums canonicos (a tabela
> acima + os "Enums canonicos" sao a fonte de verdade). As "Tools 8..18" (write tools + `verify_leak_progress`)
> estao documentadas no final do arquivo a partir dos handlers reais em `server/coachTools/handlers/`.

---

## Tool 1: `query_dimension`

**Description (para LLM):**
> "Consulta uma dimensao analitica do jogador (ROI, profit, volume, ITM%, ABI, FTs, cravadas) com filtros opcionais e agrupamentos."

**Input schema (Zod) — canonico pos-AI-0A (ADR-145):**
```ts
z.object({
  dimension: z.enum(['roi', 'profit', 'volume', 'itm', 'abi', 'fts', 'cravadas']),
  groupBy: z.enum(['site', 'category', 'speed', 'buyinRange', 'dayOfWeek', 'month', 'fieldSize']).optional(),
  filters: z.object({
    site: z.string().optional(),
    category: z.enum(['Vanilla', 'PKO', 'Mystery', 'Satellite']).optional(),  // +Satellite (ADR-031+add-on)
    speed: z.enum(['Normal', 'Turbo', 'Hyper']).optional(),                   // Normal, NAO Regular
    dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
  }).optional(),
  period: z.enum(['all', '30d', '90d', 'ytd', '180d']).optional().default('all'),  // +180d
})
```
> `groupBy: 'fieldSize'` -> `storage.getAnalyticsByField` (o do dashboard — % de eliminacao), nao
> `getAnalyticsByFieldSize` (buckets V2). Demais `groupBy` -> `storage.getAnalyticsBy{Site|Category|Speed|BuyinRange|DayOfWeek|Month}`.
> Sem `groupBy` -> `storage.getDashboardStats` (extrai a `dimension` pedida). TODOS filtram `WHERE grind_session_id IS NULL` (regra §6.1).

**Input exemplo:**
```json
{
  "dimension": "roi",
  "groupBy": "site",
  "period": "30d"
}
```

**Output (data shape):**
```ts
{
  dimension: string,           // ex: 'roi'
  groupBy: string | null,
  rows: Array<{
    key: string,               // ex: 'PokerStars'
    value: number,             // ex: 8.2 (% para roi/itm; USD para profit; int para volume)
    count: number,             // n de torneios na linha
    [extras: string]: any
  }>,
  totalCount: number,          // total agregado de torneios na janela
  period: string,
  note?: string                // 'sem dados suficientes' se rows vazio
}
```

**Output exemplo (sucesso com dados):**
```json
{
  "__type": "ToolResult",
  "tool": "query_dimension",
  "ok": true,
  "data": {
    "dimension": "roi",
    "groupBy": "site",
    "rows": [
      { "key": "PokerStars", "value": 8.2, "count": 142 },
      { "key": "GGPoker", "value": 3.1, "count": 89 },
      { "key": "Suprema", "value": -2.4, "count": 34 }
    ],
    "totalCount": 265,
    "period": "30d"
  }
}
```

**Output exemplo (sem dados):**
```json
{
  "__type": "ToolResult",
  "tool": "query_dimension",
  "ok": true,
  "data": {
    "dimension": "roi",
    "groupBy": "site",
    "rows": [],
    "totalCount": 0,
    "period": "30d",
    "note": "sem dados suficientes"
  }
}
```

**Handler:** `server/coachTools/handlers/queryDimension.ts`. Input validado via `inputSchema.safeParse` no topo (aplica `period='all'` default; `validation_failed` se `dimension` fora do enum). Roteia para `storage.getDashboardStats` (sem `groupBy`) ou `storage.getAnalyticsBy{Site|Category|Speed|BuyinRange|DayOfWeek|Month|Field}` apropriado (`groupBy:'fieldSize'` -> `getAnalyticsByField`, NÃO os buckets V2). Reusa funcoes existentes do projeto — todas filtram `WHERE grind_session_id IS NULL` (regra §6.1). Sem dado => `{ rows:[], totalCount:0, note }`. DB explode => loga + `{ ok:false, error:'handler_error' }` (lesson #9, distinto de "no rows").

**Gate:** `gateByTier: ['pro', 'premium', 'admin']` (ADR-145 — read tools = Pro+; free nao recebe tools).
**Audit:** `'log'` (linha em `coach_actions` sem `result`).

---

## Tool 2: `find_top_leaks`

**Description:**
> "Roda detector de leaks rule-based e devolve os principais problemas tecnicos detectados no jogo do usuario, com severidade e evidencia."

**Input schema:**
```ts
z.object({
  limit: z.number().int().min(1).max(20).optional().default(5),
  minSeverity: z.enum(['low', 'medium', 'high']).optional().default('low'),
})
```

**Input exemplo:**
```json
{ "limit": 3, "minSeverity": "medium" }
```

**Output (data shape):**
```ts
{
  leaks: Array<{
    severity: 'low' | 'medium' | 'high',
    code: string,                         // ex: 'low_itm_in_turbos'
    description: string,                  // pt-BR
    evidence: { dimension: string, value: number, n: number }
  }>,
  total: number,                          // total detectado antes do limit
  note?: string
}
```

**Output exemplo:**
```json
{
  "__type": "ToolResult",
  "tool": "find_top_leaks",
  "ok": true,
  "data": {
    "leaks": [
      {
        "severity": "high",
        "code": "low_itm_turbos",
        "description": "ITM em Turbos abaixo do esperado para o seu volume",
        "evidence": { "dimension": "itm.speed=Turbo", "value": 8.2, "n": 145 }
      },
      {
        "severity": "medium",
        "code": "negative_roi_pko",
        "description": "ROI negativo em PKO sustentado em janela de 90 dias",
        "evidence": { "dimension": "roi.category=PKO", "value": -3.4, "n": 78 }
      }
    ],
    "total": 5
  }
}
```

**Handler:** `server/coachTools/handlers/findTopLeaks.ts`. Input validado via `inputSchema.safeParse` no topo (aplica defaults `limit=5`/`minSeverity=low`/`period=90d`; `validation_failed` se invalido). Chama `detectLeaks(userId, { period, minSeverity:'low' })` (overload async de `server/coachLeakDetection.ts`) com o `userId` do `ctx` — **a janela `period` é propagada** a `detectLeaksForUser`, que a repassa aos `getAnalyticsBy*`/`getDashboardStats` (antes de AI-0A era hardcoded `"all"` — a citação `[fonte: find_top_leaks:<code>:<period>]` agora é fiel). Filtra por `minSeverity`, ordena/trunca por `limit`; `total` reflete o total ANTES do truncamento; `evidence.n` = sample size do leak; `evidence.dimension` derivada do `code` do leak (`roi_by_format`→`categoria`, `weak_site`→`site`, etc. — a fonte `CoachLeakSummary` não expõe dimension). Sem leaks => `note`. `detectLeaks` que explode => loga + `{ ok:false, error:'handler_error' }` (lesson #9).

**Gate:** `gateByTier: ['pro', 'premium', 'admin']` (ADR-145 — Pro+).
**Audit:** `'log'`. `requiresConfirmation: false`.

---

## Tool 3: `get_tournament_suggestions`

**Description:**
> "Consulta o Tournament Selector e devolve sugestoes ranqueadas de torneios para uma data/contexto, com score detalhado por sinal."

**Input schema:**
```ts
z.object({
  date: z.string().optional(),                       // ISO date; default = hoje
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  profile: z.enum(['A', 'B', 'C']).optional(),
  maxBuyIn: z.number().positive().optional(),
  limit: z.number().int().min(1).max(20).optional().default(10),
})
```

**Input exemplo:**
```json
{ "dayOfWeek": 3, "profile": "A", "maxBuyIn": 50, "limit": 5 }
```

**Output (data shape):**
```ts
{
  suggestions: Array<{
    id: string,
    name: string,
    site: string,
    buyIn: number,                  // moeda nativa
    buyInUSD: number,
    type: string | null,
    speed: string | null,
    score: number,                  // 0-100
    grade: 'S' | 'A' | 'B' | 'C' | 'D',
    confidence: 'low' | 'medium' | 'high',
    rationale: string               // pt-BR humano
  }>,
  total: number,
  date: string,
  note?: string                     // 'sem torneios disponiveis' | 'sem historico suficiente — scores baseados na estrutura do torneio'
}
```

**Output exemplo:**
```json
{
  "suggestions": [
    {
      "id": "lib-7",
      "name": "Big $22",
      "site": "PokerStars",
      "buyIn": 22,
      "buyInUSD": 22,
      "type": "PKO",
      "speed": "Normal",
      "score": 87,
      "grade": "S",
      "confidence": "high",
      "rationale": "ROI historico positivo em buy-in similar; horario nobre alinhado ao seu padrao."
    }
  ],
  "total": 12,
  "date": "2026-05-14"
}
```

**Handler:** `server/coachTools/handlers/getTournamentSuggestions.ts` -> `tournamentScoringService.rankTournamentsForContext(userId, opts)` (ADR-147 §1; o service reusa `computeTournamentScore` + os builders de `server/scoring/buildScoringInput.ts` — NÃO duplica a fórmula nem a montagem do SCT). O service: carrega o bundle (`playerBundleCache.getOrLoad`), monta a lista candidata (entries da biblioteca pessoal **+ agenda Suprema do dia** via `getSupremaTournaments`, best-effort — Suprema offline => só a biblioteca), filtra por `dayOfWeek`/`date` e `profile` quando informados, normaliza `buyIn`→USD com os `exchangeRates` do user, aplica `maxBuyIn` (USD), chama `computeTournamentScore` para cada um, ordena por `score` desc. O handler valida input via Zod (`limit=10` default), trunca por `limit`, e emite `note`: `'sem torneios disponiveis'` (lista vazia) ou `'sem historico suficiente — scores baseados na estrutura do torneio'` (todas as sugestoes saiem com `confidence:'low'` — cold-start). Service que explode => loga + `{ ok:false, error:'handler_error' }`.

**Gate:** `gateByTier: ['pro', 'premium', 'admin']` (ADR-145 — Pro+).
**Audit:** `'log'`. `requiresConfirmation: false`.

---

## Tool 4: `explain_tournament_score`

**Description:**
> "Explica em detalhe por que um torneio especifico recebeu o score que recebeu — discriminacao por sinal com peso, contribuicao e confianca."

**Input schema (XOR via superRefine):**
```ts
z.object({
  tournamentId: z.string().optional(),
  libraryTemplateId: z.string().optional(),
  plannedTournamentId: z.string().optional(),
}).superRefine((val, ctx) => {
  const filled = [val.tournamentId, val.libraryTemplateId, val.plannedTournamentId].filter(Boolean).length;
  if (filled !== 1) {
    ctx.addIssue({ code: 'custom', message: 'Exatamente um dos tres IDs deve ser fornecido' });
  }
})
```

**Input exemplo:**
```json
{ "libraryTemplateId": "lib_abc123" }
```

**Output (data shape):**
```ts
{
  tournamentId: string,
  score: number,
  breakdown: Array<{
    signalName: string,
    weight: number,                 // peso normalizado do sinal
    contribution: number,           // pontos contribuidos (weight * sinalScore)
    dataPoints: number,             // n de torneios usados na evidencia
    confidence: 'low' | 'medium' | 'high'
  }>,
  recommendation: 'high' | 'medium' | 'low'
}
```

**Output exemplo:**
```json
{
  "__type": "ToolResult",
  "tool": "explain_tournament_score",
  "ok": true,
  "data": {
    "tournamentId": "lib_abc123",
    "score": 82,
    "breakdown": [
      { "signalName": "playerEdge",  "weight": 0.30, "contribution": 24.0, "dataPoints": 142, "confidence": "high" },
      { "signalName": "fieldFit",    "weight": 0.25, "contribution": 18.5, "dataPoints": 89,  "confidence": "high" },
      { "signalName": "scheduleFit", "weight": 0.15, "contribution": 12.0, "dataPoints": 30,  "confidence": "medium" },
      { "signalName": "bankrollFit", "weight": 0.20, "contribution": 18.0, "dataPoints": 1,   "confidence": "high" },
      { "signalName": "structureFit","weight": 0.10, "contribution": 9.5,  "dataPoints": 12,  "confidence": "low" }
    ],
    "recommendation": "high"
  }
}
```

**Handler:** `server/coachTools/handlers/explainTournamentScore.ts` -> `tournamentScoringService.explainScoreForTournament(userId, ref)` (ADR-147 §1). Valida o XOR via `superRefine` (0/2/3 IDs => `{ ok:false, error:'validation_failed' }` ANTES de chamar o service). O service localiza o torneio em `tournaments` / `tournament_library` / `planned_tournaments` (validando ownership pelo `userId` do `ctx`), chama `computeTournamentScore` e mapeia `result.signals` -> breakdown por sinal (`signalName/weight/value/contribution/sampleSize/confidence`). Id inexistente / de outro user => `{ ok:false, error:'handler_error', message:'tournament_not_found' }`.

**Gate:** `gateByTier: ['pro', 'premium', 'admin']` (ADR-145 — Pro+).
**Audit:** `'log'`. `requiresConfirmation: false`.

---

## Tool 5: `simulate_bankroll_scenario`

**Description:**
> "Simula impacto na banca de um cenario hipotetico (perder N buy-ins, lucrar X, sequencia de wins/losses) e avalia se a regra de banca configurada seria violada."

**Input schema (com superRefine):**
```ts
z.object({
  scenario: z.enum(['lose_n_buyins', 'profit_amount', 'win_streak', 'lose_streak']),
  value: z.number(),
  buyInUSD: z.number().positive().optional(),
}).superRefine((val, ctx) => {
  if ((val.scenario === 'lose_n_buyins' ||
       val.scenario === 'win_streak' ||
       val.scenario === 'lose_streak') && !val.buyInUSD) {
    ctx.addIssue({ code: 'custom', message: 'buyInUSD obrigatorio para esse scenario' });
  }
})
```

**Input exemplo:**
```json
{ "scenario": "lose_n_buyins", "value": 5, "buyInUSD": 22 }
```

**Output (data shape):**
```ts
{
  scenario: string,
  currency: 'USD',                 // sempre USD (lesson #6)
  currentAmount: number,           // banca total USD atual (walletService.getConsolidatedBalance.totalUSD)
  newAmount: number,               // USD apos o cenario
  percentChange: number,           // (newAmount - currentAmount) / currentAmount * 100
  rule: string | null,             // ex '1pct'
  softLimitUSD: number | null,
  hardLimitUSD: number | null,
  ruleViolated: boolean,           // newAmount < hardLimitUSD? (so quando ha hardLimitUSD)
  alertLevel: 'safe' | 'warning' | 'danger',
  recommendation: string,          // pt-BR, tom condicional + disclaimer "nao conselho financeiro"
  note?: 'bankroll_nao_configurado' | 'regra_de_banca_nao_global'
}
```

**Output exemplo (cenario perigoso):**
```json
{
  "scenario": "lose_n_buyins",
  "currency": "USD",
  "currentAmount": 1000,
  "newAmount": -100,
  "percentChange": -110.0,
  "rule": "1pct",
  "softLimitUSD": 10,
  "hardLimitUSD": 15,
  "ruleViolated": true,
  "alertLevel": "danger",
  "recommendation": "Nesse cenario sua banca cairia abaixo do limite minimo da sua regra (1pct). Voce poderia considerar reduzir o buy-in medio ou pausar antes de chegar la — isto e uma estimativa, nao conselho financeiro."
}
```

**Output exemplo (sem banca configurada — v1 sem wallet):**
```json
{
  "scenario": "lose_n_buyins",
  "currency": "USD",
  "currentAmount": 0,
  "newAmount": 0,
  "percentChange": 0,
  "rule": null,
  "softLimitUSD": null,
  "hardLimitUSD": null,
  "ruleViolated": false,
  "alertLevel": "safe",
  "recommendation": "Voce ainda nao configurou sua banca/regra no Grindfy — voce poderia definir isso em /bankroll para que eu consiga simular cenarios. Lembrando que isto e uma estimativa, nao conselho financeiro.",
  "note": "bankroll_nao_configurado"
}
```

**Output exemplo (banca configurada mas sem regra global — modo per_wallet):**
```json
{
  "scenario": "lose_n_buyins",
  "currency": "USD",
  "currentAmount": 4200,
  "newAmount": 4090,
  "percentChange": -2.6,
  "rule": null,
  "softLimitUSD": null,
  "hardLimitUSD": null,
  "ruleViolated": false,
  "alertLevel": "safe",
  "recommendation": "Sua banca consolidada hoje e ~$4200.00 e nesse cenario iria para ~$4090.00 (-2.6%). Voce nao tem uma regra de banca global configurada (suas wallets estao em modo separado), entao nao da pra dizer se algum limite seria violado — voce poderia definir uma regra global em /bankroll. Lembrando que isto e uma estimativa, nao conselho financeiro.",
  "note": "regra_de_banca_nao_global"
}
```

**Handler:** `server/coachTools/handlers/simulateBankrollScenario.ts`. Le a banca consolidada via `walletService.getConsolidatedBalance(userId)` — usa `totalUSD` (já normalizado, FX-aware — ADR-147 §2). **Não há fallback interno** para `user_settings.bankroll_amount`; usuario v1 sem wallet vê `totalUSD: "0.00"`. `softLimitUSD`/`hardLimitUSD` vêm da própria consolidacao (computados a partir da `bankrollRule` — ADR-018, tolerancia 1.5x) **mas só no modo de agregacao `'global'`** — no modo `per_wallet` ambos vêm `null`. Tudo em USD (lesson #6). Casos:
- `totalUSD <= 0` => `note: 'bankroll_nao_configurado'`, `currentAmount: 0`, `alertLevel: 'safe'`, sem throw.
- `totalUSD > 0` mas sem regra global (modo `per_wallet`) => simula mostrando `currentAmount`/`newAmount` reais, `softLimitUSD: null`, `hardLimitUSD: null`, `ruleViolated: false`, `alertLevel: 'safe'`, `note: 'regra_de_banca_nao_global'`.
- `totalUSD > 0` com regra global => simula, `ruleViolated = newAmount < hardLimitUSD`, `alertLevel` em safe/warning/danger.
`walletService` que explode => loga + `{ ok:false, error:'handler_error' }` (lesson #9). Input validado via `inputSchema.safeParse` no topo do handler (`validation_failed` se invalido).

**Gate:** `gateByTier: ['pro', 'premium', 'admin']`.
**Audit:** `'log'`. `requiresConfirmation: false`.

---

## Tool 6: `read_user_hud_stats`

**Sprint:** F3 — Stats Analyzer (2026-04-29)
**ADR:** Docs/architecture/decisions/052-stats-analyzer-coach-tool-integration.md
**Tier gate:** `pro`, `premium`, `admin`
**Audit:** `log`
**Confirmation:** nao requer

### Descricao

Le snapshots HUD recentes do usuario (VPIP, PFR, 3Bet, etc.) do layout
indicado (ou default). Retorna ultimo snapshot, delta vs media historica
do usuario e benchmark populacional estatico (`server/coach/tools/hudStatsBenchmark.ts`).

### Input

```ts
{
  layoutName?: string,      // se omitido, usa layout default; case-insensitive
  statKeys?: string[],      // se omitido, retorna TODOS do layout
}
```

### Output (sucesso)

```ts
{
  __type: "ToolResult",
  tool: "read_user_hud_stats",
  ok: true,
  data: {
    layoutName: "Padrao PT4",
    layoutId: "...",
    latestSnapshot: {
      capturedAt: "2026-04-29T...",
      sampleSize: 1500,
      values: { vpip: 22.5, pfr: 18.0, ... },
    },
    deltaVsAverage: {
      vpip: { current: 22.5, average: 21.0, delta: +1.5 }, ...
    },
    populationBenchmark: {
      vpip: { healthy: [18, 26], current: 22.5, status: "in_range" }, ...
    },
  },
}
```

### Codigos de erro

- `no_layouts`: usuario nao tem layouts configurados. Sugira criar via `/studies`.
- `storage_error`: falha de DB (logado server-side, mensagem generica retornada).

### Sanitizacao

- `notes` (texto livre) NUNCA exposto no output.
- Apenas keys numericas + agregados.
- `populationBenchmark` usa tabela estatica (V1). V2 troca por dados Grindfy agregados.

**Handler:** `server/coach/tools/readUserHudStats.ts`. Builder pure
(`buildHudStatsPayload`) testavel separadamente do storage.

---

## Tool 7: `read_theme_with_linked_stats_and_spots`

**Sprint:** stats-themes-linking-1 (2026-05-08) — extensao da tool `read_theme_with_linked_spots` (Sprint Studies-Reform RF-07 / ADR-068).
**ADR:** `Docs/architecture/decisions/142-coach-tool-unified-read-theme-with-linked-stats-and-spots.md`
**Tier gate:** `pro`, `premium`, `admin`
**Audit:** `log`
**Confirmation:** nao requer

### Renomeacao + alias deprecation

| Nome | Status | Comportamento |
|---|---|---|
| `read_theme_with_linked_stats_and_spots` | **Ativo** (Sprint stats-themes-linking-1) | Tool unificada com payload completo (theme + tabs + linked_spots + stats + summary). |
| `read_theme_with_linked_spots` | **Deprecated alias** | Mesmo handler. Emite `console.warn('[deprecation] read_theme_with_linked_spots — use read_theme_with_linked_stats_and_spots')` por chamada. Mantido por **1 sprint** (sera removido em stats-themes-linking-2). |

Ambos os nomes resolvem para mesmo handler (`readThemeWithLinkedStatsAndSpots`). Description extraida em arquivo dedicado `server/coachTools/readThemeWithLinkedStatsAndSpots.prompts.ts` (lesson #10 — DRY de prompts; divergencia silenciosa quebra cache Anthropic).

### Descricao (LLM ve via `description` do tool descriptor)

> "Le um tema de estudo do usuario com seu contexto completo: tema base, ate 5 abas (preview 200 chars), ate 10 spots vinculados, e **stats HUD linkadas com valores correntes do usuario, alvo e sparkline dos ultimos 30 dias**. Inclui catalog stats e custom user stats. Use stats para diagnosticar leaks especificos com NUMEROS no contexto. Cross-user isolation: 403 se tema for de outro usuario."

### Input schema (Zod, identico ao da tool legada — XOR)

```ts
z.object({
  theme_id: z.string().min(1).optional(),
  theme_name: z.string().min(1).optional(),
}).refine(
  (v) => Boolean(v.theme_id) !== Boolean(v.theme_name),
  { message: 'Forneca theme_id OU theme_name (XOR).' }
)
```

### Output (sucesso)

```ts
{
  __type: 'ToolResult',
  tool: 'read_theme_with_linked_stats_and_spots',
  ok: true,
  data: {
    theme: {
      id: string,
      name: string,
      color: string | null,
      emoji: string,
      progress: number,
      lastVisitedAt: string | null,
    },
    tabs: Array<{ id, name, content_preview }>,    // max 5 (existente Sprint Studies-Reform)
    linked_spots: Array<{                           // max 10 (existente)
      id, conclusion, type, spot, screenshotUrl
    }>,
    stats: Array<{                                  // NOVO Sprint stats-themes-linking-1
      statId: string,
      label: string,                                // pt-BR de STAT_INDEX_BY_ID OU fieldsJson[i].label
      groupId: HudGroupId,
      groupLabel: string,                           // pt-BR de HUD_GROUP_LABELS
      currentValue: number | null,                  // ultimo snapshot value; null se nenhum
      targetMin: number,
      targetMax: number,
      direction: 'higher_better' | 'lower_better' | 'context' | 'neutral',
      unit: 'pct' | 'bb' | 'count',
      sparkline30d: number[],                       // ordem cronologica ASC, max 30 elementos
      isCustom: boolean,                            // true se vier de hudLayouts.fieldsJson
    }>,
    summary: {
      spots_count: number,
      tabs_count: number,
      last_activity_at: string | null,
      stats_count: number,                          // NOVO
      stats_in_range: number,                       // NOVO — direction-aware
      stats_alarm: number,                          // NOVO — direction-aware
    }
  }
}
```

### Empty states graceful (RF-03.4)

| Situacao | Comportamento |
|---|---|
| `theme.linkedStats === []` ou `null` | `stats: []`, `summary.stats_count: 0`. Sem erro. |
| `statId` custom_* mas `fieldsJson[i]` foi deletado do HUD | Omitir do `stats[]`. `console.warn('[read_theme] custom stat orfa', { statId, themeId })`. SEM 500. |
| `statId` catalog mas `STAT_INDEX_BY_ID.get` retorna `undefined` (defensivo) | Omitir + warn. |
| User sem nenhum snapshot | `currentValue: null`, `sparkline30d: []`. UI render placeholder. |

### Codigos de erro

- `Tema nao encontrado` (404 logico): theme_id/theme_name nao resolvido.
- `Acesso negado: tema de outro usuario` (403 logico): `theme.userId !== ctx.userPlatformId`.
- Falha geral: `{ ok: false, code: 'tool_error', message }` (handler envolve em try/catch como Sprint Studies-Reform).

### Fonte de dados

| Campo | Origem |
|---|---|
| `theme.*` | `storage.getStudyTheme(themeId)` ou `storage.getStudyThemeByName(name, userId)`. |
| `tabs[]` | `storage.getStudyTabsByTheme(themeId)`, slice top 5, `previewFromContent` 200 chars. |
| `linked_spots[]` | `storage.getLinkedSpots(themeId)`, slice top 10. |
| `stats[].label/groupId/groupLabel/direction/unit/targetMin/targetMax` | catalog: `STAT_INDEX_BY_ID.get(statId)` + `HUD_GROUP_LABELS`. custom: `hudLayouts.fieldsJson[i]` do user. |
| `stats[].currentValue` | `SELECT (values ->> $statId)::numeric FROM hud_stat_snapshots WHERE user_id=$1 AND values ? $statId ORDER BY captured_at DESC LIMIT 1`. |
| `stats[].sparkline30d` | Query batch jsonb `?|` para todos statIds: `SELECT captured_at, values FROM hud_stat_snapshots WHERE user_id=$1 AND captured_at >= now()-INTERVAL '30 days' AND values ?\| ARRAY[$statIds]::text[] ORDER BY captured_at ASC`. Iterar e indexar por statId em codigo. ADR-142 §2.3. |

**ATENCAO ao implementar:** `hud_stat_snapshots` armazena TODOS os stats num jsonb `values` por snapshot — NAO ha row por (user, stat). Implementer deve usar operadores jsonb (`->>`, `?`, `?|`) e nao assumir coluna `value`.

### Handler

`server/coachTools/readThemeWithLinkedStatsAndSpots.ts` (renomeado de `readThemeWithLinkedSpots.ts`).
- Reusa `inputSchema`, `previewFromContent`, lookup XOR theme_id/theme_name.
- Adiciona builder pure `buildStatsPayload(theme, ctx, options)` testavel separadamente.
- Query batch unica para snapshots evita N+1 (max ~60 rows para 30 dias × ~2 snapshots/dia).
- Deduplicate stats_in_range vs stats_alarm contagem direction-aware.

### Lessons aplicadas

- **#10** — description em arquivo `*.prompts.ts` dedicado.
- **#19/20** — graceful skip de stats orfas (custom field deletado).
- **#21** — sem cache memoria proprio (a tool roda dentro do registry; cache especializado fica em `statsLinkedThemesCache` ADR-141).

---

## Tools 8..17: write tools (Coach-2B handlers, registradas em AI-0A)

Todas seguem o mesmo contrato (ADR-083/146): `requiresConfirmation: true`, `auditLevel: 'persist'`,
`gateByTier: ['pro', 'premium', 'admin']`, handler expoe `fetchPayloadBefore` / `executeConfirmed` / `undo`
(NAO `handler` — o `coachToolRunner` faz o dispatch numa transacao unica). Fluxo: LLM chama => `coach_action`
pendente + SSE `tool_pending` => UI mostra diff => `POST /api/coach/actions/:id/confirm` => executa => undo 5min
via `payload_before`. Sem auto-aprovacao, sem `delete_*` na v1.

### Tool 12: `register_tournament_in_grade`
**Handler:** `server/coachTools/handlers/registerTournamentInGrade.ts`.
**Input (Zod, XOR `templateId` vs `manualEntry`):**
```ts
z.object({
  templateId: z.string().optional(),
  manualEntry: z.object({
    site: z.string(), name: z.string(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    type: z.enum(['Vanilla', 'PKO', 'Mystery', 'Satellite']),
    speed: z.enum(['Normal', 'Turbo', 'Hyper']),
    buyIn: z.number().positive(),
    guaranteed: z.number().nonnegative().optional(),
  }).optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  profile: z.enum(['A', 'B', 'C']).optional().default('A'),
  prioridade: z.number().int().min(1).max(3).optional().default(2),
}).superRefine(/* XOR templateId vs manualEntry */)
```
**Output (`executeConfirmed`):** `{ plannedTournamentId, name, site, dayOfWeek, time, message }`.
**Storage:** `getLibraryTemplate`, `createPlannedTournament`, `deletePlannedTournament` (undo). `payloadBefore = null`.
`templateId` inexistente / de outro user => `executeConfirmed` lanca `template_not_accessible` => `coach_action.status='failed'`.

### Tool 13: `record_wallet_transaction` (`confirmationLevel: 'strict'`)
**Handler:** `server/coachTools/handlers/recordWalletTransaction.ts`. Reusa `walletService.recordWalletTransaction`.
**Input (Zod):**
```ts
z.object({
  walletId: z.string(),
  amount: z.number().positive(),
  currency: z.enum(['USD', 'BRL', 'EUR', 'CNY']),
  type: z.enum(['deposit', 'withdrawal', 'rakeback', 'manual_adjustment']),
  reason: z.enum(WALLET_TX_REASONS_P0),   // @shared/wallet-reasons
  occurredAt: z.string().optional(),
  notes: z.string().max(500).optional(),
})
```
**Output:** `{ transactionId, walletId, walletName, newBalanceNative, newBalanceUSD, message, balanceBefore }`.
**Undo:** novo `recordWalletTransaction` com `direction` invertida + `reason: 'manual_adjustment'` (reverse-row no ledger, ADR-058) — **nunca** hard-delete.
`confirmationLevel: 'strict'` vive apenas no descriptor em memoria (NAO persistido em `coach_actions` na v1 — ADR-146); o frontend renderiza diff financeiro detalhado.

### Tool 14: `start_grind_session`
**Handler:** `server/coachTools/handlers/startGrindSession.ts`.
**Input:** `z.object({ mode: z.enum(['from_planned', 'instant']), plannedSessionId: z.string().optional(), startTime: z.string().optional(), notes: z.string().max(500).optional() }).superRefine(/* plannedSessionId obrigatorio se mode='from_planned' */)`.
**Output:** `{ sessionId, status: 'active', startedAt }`.
**Storage:** `getPlannedSession`, `createGrindSession`, `deleteGrindSession`, `updatePlannedSession`. Undo: deleta (instant) ou restaura planned (from_planned).

### Tool 15: `log_session_completed`
**Handler:** `server/coachTools/handlers/logSessionCompleted.ts`. Transita `grind_session` `active` -> `completed` (logging parcial aceito).
**Input:** `z.object({ sessionId: z.string(), endTime?: z.string(), volume?: z.number().int().nonnegative(), profit?: z.number(), fts?: z.number().int().nonnegative(), cravadas?: z.number().int().nonnegative(), notes?: z.string().max(2000) })`.
**Output:** `{ sessionId, status: 'completed', durationMinutes, message }`. Sessao de outro user => `unauthorized`; nao-`active` => `session_not_active`. Undo restaura `status='active'` + valores anteriores.

### Tool 16: `log_leak_focus`
**Handler:** `server/coachTools/handlers/logLeakFocus.ts`. Cria row em `coach_leak_focus` (UNIQUE `(user, leakCode, targetMonth)` => 409 em duplicata).
**Input:** `z.object({ leakCode: z.string(), description: z.string().max(200), targetMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), baselineStat: z.object({ statKey: z.string(), currentValue: z.number(), sampleSize: z.number().int().positive() }), studyPlanNotes?: z.string().max(1000) })`.
**Output:** `{ leakFocusId, leakCode, targetMonth, message }`. Undo: `UPDATE status='abandoned'` — nao hard-delete.

### Tool 17: `log_study_session`
**Handler:** `server/coachTools/handlers/logStudySession.ts`.
**Input:** `z.object({ topic: z.enum(['solver','hand_review','video','library','mental','other']), durationMinutes: z.number().int().min(5).max(480), date?: z.string(), studyCardId?: z.string(), insights?: z.string().max(2000), focusScore?: z.number().int().min(0).max(10), productivityScore?: z.number().int().min(0).max(10) })`.
**Output:** `{ studySessionId, topic, durationMinutes, date, message }`. `studyCardId` de outro user => `unauthorized`. Undo deleta a `study_session`.

---

## Tool 18: `verify_leak_progress` (read, NAO write)

**Handler:** `server/coachTools/handlers/verifyLeakProgress.ts`. `requiresConfirmation: false`, `auditLevel: 'log'`,
tem `handler` (executa imediato no `/api/coach/chat`, emite SSE `tool_result`). Re-roda a query do `baselineStatKey`
no storage atual e compara com o baseline registrado em `coach_leak_focus`.

**Input:** `z.object({ leakFocusId: z.string().optional() })` — se omitido, pega o foco ativo do user.
**Output:**
```ts
{
  leakFocusId: string, leakCode: string, description: string,
  baseline: { value: number; sampleSize: number; statKey: string },
  current: { value: number; sampleSize: number; statKey: string },
  delta: number, improvementPct: number,
  status: 'improving' | 'stable' | 'regressing' | 'insufficient_sample',
  message: string
} | { note: 'no_active_focus' | 'stat_key_unsupported'; message: string; leakFocusId?: string }
```
Sem foco ativo => `{ note: 'no_active_focus', ... }` (sem throw). `current.sampleSize < 30` => `status: 'insufficient_sample'`.
`current.sampleSize` e o N que o Coach usa na confidence tag.

---

## Referencias

- Spec: `Docs/specs/sprint-ai-0a.md` (AI-0A — religar tools + citations) | `docs/specs/coach-sprint-2a-page-context-and-tools.md` (Coach-2A — read tools originais)
- ADR-023: tool registry pattern
- ADR-024: tool result wrapping
- ADR-026: continuation loop limit
- ADR-083: coachToolRunner — confirm/cancel/undo de write tools
- ADR-145: errata — estado canonico do registry pos-AI-0A
- ADR-146: write tools — confirmacao SEMPRE na v1 (`confirm-strict` em memoria)
- ADR-147: padrao de extracao de service para read tools (`tournamentScoringService`) + fonte unica de citations/confidence
- API geral: `docs/api/coach.md`
- Sequence diagrams: `Docs/architecture/diagrams/coach-ai-0a/` (read-tool-citable, write-tool-confirm-undo, citations-confidence flow)
- Data model: `docs/architecture/data-model.mermaid` (dominio AI Coach Tools)
