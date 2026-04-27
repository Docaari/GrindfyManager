# Coach Tools — Catalogo

Documentacao detalhada de cada tool registrada no Coach v2.

Este arquivo e **vivo**: cresce a cada sprint conforme novas tools sao adicionadas. Cada entrada documenta o que o LLM ve (description), o input schema, o output shape e as politicas de gating/audit.

**Como o LLM consome:** o backend chama `exportToolsForAnthropic(tier)` (ADR-023) que serializa cada `CoachTool` registrada em formato JSONSchema da Anthropic Tool Use API. O LLM recebe `name + description + input_schema` e decide quando chamar com base no contexto da conversa.

**Politicas globais (validas para todas as tools):**
- Output sempre wrapped por `coachToolRunner` em `{__type: 'ToolResult', tool, ok: true, data}` (ADR-024).
- Erro de validacao Zod => `{ok: false, error: 'validation_failed', details: [...]}` SEM throw.
- Erro de handler => `{ok: false, error: 'handler_error', message}` + linha `coach_actions.status='failed'`.
- Limite hard de 5 tool calls por turn (ADR-026).
- Tier `'free'` nao recebe tools (`tools: []`). Pro/premium/admin recebem todas.

**Indice de tools (Sprint Coach-2A):**

| # | Nome | Categoria | Audit | Tier gate |
|---|---|---|---|---|
| 1 | `query_dimension` | Analytics | log | (todos) |
| 2 | `find_top_leaks` | Tecnico | log | (todos) |
| 3 | `get_tournament_suggestions` | Selector | log | (todos) |
| 4 | `explain_tournament_score` | Selector | log | (todos) |
| 5 | `simulate_bankroll_scenario` | Bankroll | log | (todos) |

Tier gate `(todos)` significa `gateByTier === undefined` no registry — todos os tiers exceto `'free'` recebem (free nao tem tool use).

---

## Tool 1: `query_dimension`

**Description (para LLM):**
> "Consulta uma dimensao analitica do jogador (ROI, profit, volume, ITM%, ABI, FTs, cravadas) com filtros opcionais e agrupamentos."

**Input schema (Zod):**
```ts
z.object({
  dimension: z.enum(['roi', 'profit', 'volume', 'itm', 'abi', 'fts', 'cravadas']),
  groupBy: z.enum(['site', 'category', 'speed', 'buyinRange', 'dayOfWeek', 'month', 'fieldSize']).optional(),
  filters: z.object({
    site: z.string().optional(),
    category: z.enum(['Vanilla', 'PKO', 'Mystery']).optional(),
    speed: z.enum(['Regular', 'Turbo', 'Hyper']).optional(),
    dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
  }).optional(),
  period: z.enum(['all', '30d', '90d', 'ytd']).optional().default('all'),
})
```

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

**Handler:** roteia para `storage.getDashboardStats` (sem `groupBy`) ou `storage.getAnalyticsBy{Site|Category|Speed|BuyinRange|Day|Month|Field}` apropriado. Reusa funcoes existentes do projeto.

**Gate:** `gateByTier: undefined` (disponivel em pro/premium/admin).
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

**Handler:** chama `detectLeaks(userId)` de `server/coachLeakDetection.ts`. Filtra/ordena por severidade. Trunca por `limit`.

**Gate:** `gateByTier: undefined`.
**Audit:** `'log'`.

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
    name: string,
    site: string,
    buyIn: number,
    type: string,
    score: number,                  // 0-100
    signals: object,                // breakdown por sinal (interno do scorer)
    signalsExplanation: string      // pt-BR humano
  }>,
  total: number,
  note?: string
}
```

**Output exemplo:**
```json
{
  "__type": "ToolResult",
  "tool": "get_tournament_suggestions",
  "ok": true,
  "data": {
    "suggestions": [
      {
        "name": "Big $22",
        "site": "PokerStars",
        "buyIn": 22,
        "type": "Vanilla",
        "score": 87,
        "signals": { "playerEdge": 18, "fieldFit": 22, "scheduleFit": 15, "bankrollFit": 18, "structureFit": 14 },
        "signalsExplanation": "ROI historico positivo em buy-in similar; field size dentro do alvo; horario nobre alinhado ao perfil A; banca confortavel."
      }
    ],
    "total": 12
  }
}
```

**Handler:** chama servico de `server/scoring/tournamentScorer.ts` (Sprint Tournament Selector 1, ja entregue). Repassa `userId` do `ctx`.

**Gate:** `gateByTier: undefined`.
**Audit:** `'log'`.

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

**Handler:** localiza o torneio pelo id apropriado (lookup em `tournaments` / `tournament_library` / `planned_tournaments`), chama scorer com flag de breakdown completo.

**Gate:** `gateByTier: undefined`.
**Audit:** `'log'`.

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
  currentAmount: number,           // USD atual de user_settings.bankroll_amount
  newAmount: number,               // USD apos o cenario
  percentChange: number,           // (newAmount - currentAmount) / currentAmount * 100
  ruleViolated: boolean,           // hard limit batido?
  alertLevel: 'safe' | 'warning' | 'danger',
  recommendation: string           // pt-BR
}
```

**Output exemplo (cenario perigoso):**
```json
{
  "__type": "ToolResult",
  "tool": "simulate_bankroll_scenario",
  "ok": true,
  "data": {
    "scenario": "lose_n_buyins",
    "currentAmount": 1100,
    "newAmount": 990,
    "percentChange": -10.0,
    "ruleViolated": true,
    "alertLevel": "danger",
    "recommendation": "Perder 5 buy-ins de $22 levaria sua banca para $990 (-10%), violando o hard limit da regra '1pct'. Considere reduzir o buy-in alvo ou pausar a sessao se esse cenario se materializar."
  }
}
```

**Output exemplo (sem banca configurada):**
```json
{
  "__type": "ToolResult",
  "tool": "simulate_bankroll_scenario",
  "ok": true,
  "data": {
    "scenario": "lose_n_buyins",
    "currentAmount": 0,
    "newAmount": 0,
    "percentChange": 0,
    "ruleViolated": false,
    "alertLevel": "safe",
    "recommendation": "Voce ainda nao configurou sua banca. Ative bankroll management em Configuracoes para receber simulacoes precisas.",
    "note": "bankroll_nao_configurado"
  }
}
```

**Handler:** novo arquivo `server/coachTools/handlers/simulateBankrollScenario.ts`. Le `user_settings.bankroll_amount` + `user_settings.bankroll_rule` (Sprint Bankroll Management — `docs/specs/bankroll-management.md`). Calcula novo saldo e compara com soft/hard limits (ADR-018, tolerancia 1.5x).

**Gate:** `gateByTier: undefined`.
**Audit:** `'log'`.

---

## Sprints futuros (placeholder)

Espaco reservado para tools dos proximos sprints:

- **Sprint Coach-2B (write tools com confirmacao):**
  - `register_tournament_in_grade`
  - `start_grind_session`
  - `update_bankroll_rule`
  - `archive_chat_session`
  - `update_planned_tournament`

- **Sprint Coach-2C (autonomia + hand history):**
  - `parse_hand`
  - `analyze_spot`
  - `compare_with_solver`
  - `propose_session_plan`
  - `flag_tilt_risk`

Cada sprint deste catalogo crescera com a documentacao acima por tool.

---

## Referencias

- Spec: `docs/specs/coach-sprint-2a-page-context-and-tools.md` (RF-03)
- ADR-023: tool registry pattern
- ADR-024: tool result wrapping
- ADR-026: continuation loop limit
- API geral: `docs/api/coach.md`
- Sequence diagram: `docs/architecture/sequence-coach-tool-use.mermaid`
- Data model: `docs/architecture/data-model.mermaid` (dominio AI Coach Tools)
