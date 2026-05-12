# Spec: Sprint AI-0A — Religar tools do Coach + Citations universais + Auditar xSearch

## Status
Proposta

## Resumo
Primeiro sprint da Fase 0 do plano de melhoria dos agentes de IA. Religar de ponta a ponta a infra de tools do Coach que já existe mas está desconectada: (1) consertar 5 read tools "estrela" que hoje são stubs quebrados no registry; (2) registrar as write tools cujos handlers já estão escritos em `server/coachTools/handlers/` mas não estão no `index.ts` — passando pelo fluxo de confirmação/undo já existente (confirmação SEMPRE na v1); (3) reforçar citations + confidence tags universais no system prompt; (4) auditar o `xSearchProvider` do News e documentar achado + recomendação. Sem features novas, sem schema novo, sem consolidação de coaches (isso é AI-0B).

## Contexto
Auditoria do estrategista (`Docs/strategy/ai-agents-improvement-plan-2026-05-11.md`, Parte 3.1 + ICE D1/D2/C2/I3) descobriu que muita infra do Coach AI foi construída em sprints anteriores (Coach-2A read tools, Coach-2B write tools com confirm/undo, `coachToolRunner`, tabela `coach_actions` com `payload_before`, endpoints `/api/coach/actions/:id/{confirm,cancel,undo}`) mas **não está ligada**:

- O registry `server/coachTools/index.ts` registra apenas: `read_cooldown_history`, `read_user_hud_stats` (v2), `read_user_bankroll_history`, `read_theme_with_linked_stats_and_spots` (+ alias deprecado), `recommend_lesson`. Mais 2 **stubs quebrados** (`find_top_leaks`, `simulate_bankroll_scenario`) que retornam `{ ok: false, code: 'not_implemented' }`. E `query_dimension` / `get_tournament_suggestions` / `explain_tournament_score` **nem aparecem no registry** — só na doc `Docs/api/coach-tools.md`.
- Existem 8 arquivos de handler em `server/coachTools/handlers/`: `logLeakFocus.ts`, `logSessionCompleted.ts`, `logStudySession.ts`, `readCooldownHistory.ts`, `recordWalletTransaction.ts`, `registerTournamentInGrade.ts`, `startGrindSession.ts`, `verifyLeakProgress.ts`. Destes, **só `readCooldownHistory` está registrado**. Os outros 7 (6 write tools + `verifyLeakProgress` que é read) o LLM nem vê.
- Resultado prático: o Coach hoje só consegue ler HUD stats, histórico de bankroll, temas de estudo, cooldown e recomendar uma lesson. Não detecta leaks, não olha ROI por dimensão, não simula banca, não consegue executar nenhuma ação (montar grade, registrar transação, iniciar sessão).
- O wire-up de tools no `/api/coach/chat` (`server/routes/coach.ts` ~linha 342-526) **já existe**: `exportToolsForAnthropic(tier)` passa os tools pra API Anthropic; o stream captura eventos `content_block_start` com `type=tool_use`; para tools com `requiresConfirmation` cria `coach_action` pendente + emite SSE `tool_pending`; para tools sem confirmação executa imediato + emite SSE `tool_result`. Em produção, stubs (`__stub: true`) são filtrados.
- O system prompt já tem regras de citation/confidence (`server/coachSafetyPrompts.ts` — `CITATIONS_RULES`, `CONFIDENCE_RULES`, `CONFIDENCE_AND_CITATIONS_BACKTICKED`) mas: (a) as instruções citam um formato (`[fonte: toolName:key:period]`) que os tools quebrados/não-registrados nunca produzem; (b) não há regra explícita conectando "toda saída de tool deve virar uma citação"; (c) os exemplos few-shot mencionam tools que não existem.
- O `xSearchProvider` (News, ADR-107) usa a xAI Agent Tools API (`x_search`). A defesa anti-alucinação cobre as **URLs** (cross-validação contra `annotations[].url` reais), mas o **título e o resumo** de cada tweet são prosa gerada pelo modelo Grok (não extraídos do tweet original). Risco residual de conteúdo fabricado em `title`/`summary` — vale documentar.

**Prioridade relativa:** P0 da Fase 0. D1 (religar read tools, ICE 8.3) + D2 (registrar write tools, ICE 8.0) + C2 (citations universais, ICE 8.7) + I3 (auditar xSearch, ICE 7.0). É o ponto de partida do roadmap — sem dependências.

## Usuários
- **Jogador (tier `pro` / `premium` / `admin`):** conversa com o Coach; passa a poder pedir análises ("olha meu ROI por site", "quais meus principais leaks", "simula perder 10 buy-ins") e ações ("adiciona esse torneio na minha grade de quarta", "registra esse depósito", "começa uma sessão"). Toda ação propõe → mostra diff → ele confirma → executa → pode desfazer em 5 min.
- **Jogador (tier `free`):** não recebe tools (`exportToolsForAnthropic('free') === []`). Comportamento inalterado neste sprint.
- **Founder / Admin (QA):** valida no marco M2 — Coach realmente olha ROI por site + executa 1 write tool com confirm/undo.
- **Time de manutenção:** consome a errata de ADR para entender o que estava stub/não-registrado e foi religado, e a decisão "confirmação sempre v1".

---

## Requisitos Funcionais

### RF-01: Religar `query_dimension` (read tool)
**Descrição:** Implementar/consertar o handler real de `query_dimension` e registrá-lo no `index.ts` removendo qualquer stub. O LLM chama → handler roteia para o storage de analytics existente → retorna dado citável (com sample size).

**Inputs (Zod):**
```ts
z.object({
  dimension: z.enum(['roi', 'profit', 'volume', 'itm', 'abi', 'fts', 'cravadas']),
  groupBy: z.enum(['site', 'category', 'speed', 'buyinRange', 'dayOfWeek', 'month', 'fieldSize']).optional(),
  filters: z.object({
    site: z.string().optional(),
    category: z.enum(['Vanilla', 'PKO', 'Mystery', 'Satellite']).optional(),
    speed: z.enum(['Normal', 'Turbo', 'Hyper']).optional(),
    dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
  }).optional(),
  period: z.enum(['all', '30d', '90d', 'ytd', '180d']).optional().default('all'),
})
```
> Observação para o test-writer: alinhar os enums de `category`/`speed` ao schema real do projeto (`shared/schema.ts`). O ADR-031 + add-on adicionou `Satellite` ao `type`; `speed` no schema é `Normal | Turbo | Hyper` (a doc antiga em `Docs/api/coach-tools.md` ainda lista `Regular | Turbo | Hyper` — incorreto). System-architect documenta a divergência na errata.

**Output shape (data dentro do wrapper `{__type:'ToolResult', tool, ok, data}`):**
```ts
{
  dimension: string,
  groupBy: string | null,
  rows: Array<{ key: string; value: number; count: number }>,
  totalCount: number,            // total agregado de torneios na janela (vira N pra confidence tag)
  period: string,
  note?: string                  // 'sem dados suficientes' quando rows vazio
}
```

**Storage methods (reusar, NÃO criar novos):**
- sem `groupBy` → `storage.getDashboardStats(userId, period, filters)` (extrair a dimensão pedida do retorno).
- `groupBy: 'site'` → `storage.getAnalyticsBySite(userId, period, filters)`
- `groupBy: 'category'` → `storage.getAnalyticsByCategory(...)`
- `groupBy: 'speed'` → `storage.getAnalyticsBySpeed(...)`
- `groupBy: 'buyinRange'` → `storage.getAnalyticsByBuyinRange(...)` (o de labels antigos, usado no dashboard)
- `groupBy: 'dayOfWeek'` → `storage.getAnalyticsByDayOfWeek(...)`
- `groupBy: 'month'` → `storage.getAnalyticsByMonth(...)`
- `groupBy: 'fieldSize'` → `storage.getAnalyticsByField(...)` (ou `getAnalyticsByFieldSize` se preferir os buckets V2 — system-architect decide; documentar)
- **CRÍTICO:** todos esses métodos já filtram `WHERE grind_session_id IS NULL` (regra §6.1 do CLAUDE.md — histórico do jogador, não sessões /grind-live). Não burlar isso.

**Falta de dado:** `rows: []`, `totalCount: 0`, `note: 'sem dados suficientes'`. Nunca throw, nunca inventar número.

**Gating/audit:** `gateByTier: ['pro', 'premium', 'admin']` · `requiresConfirmation: false` · `auditLevel: 'log'`.

**Critério de aceitação:**
- [ ] `listRegisteredTools()` contém `'query_dimension'` após `import('server/coachTools/index')`.
- [ ] `getTool('query_dimension')!.__stub` é `undefined` (não é stub).
- [ ] Handler com `groupBy: 'site'` chama `storage.getAnalyticsBySite` e devolve `rows` com `{key, value, count}` por site.
- [ ] Handler sem dados retorna `rows: []`, `totalCount: 0`, `note` preenchido — sem throw.
- [ ] Input inválido (`dimension` fora do enum) → erro de validação Zod, sem throw, sem chamada ao storage.
- [ ] `exportToolsForAnthropic('pro')` inclui `query_dimension`; `exportToolsForAnthropic('free')` é `[]`.

---

### RF-02: Religar `find_top_leaks` (read tool — substituir stub)
**Descrição:** Substituir o `findTopLeaksStub` por handler real que chama `detectLeaks(userId, opts)` de `server/coachLeakDetection.ts` (overload `detectLeaks(userId, { period })` → `detectLeaksForUser`). Filtra/ordena por severidade, trunca por `limit`.

**Inputs (Zod):**
```ts
z.object({
  limit: z.number().int().min(1).max(20).default(5),
  minSeverity: z.enum(['low', 'medium', 'high']).default('low'),
  period: z.enum(['30d', '90d', '180d']).optional().default('90d'),
})
```

**Output shape:**
```ts
{
  leaks: Array<{
    severity: 'low' | 'medium' | 'high',
    code: string,                          // ex: 'low_itm_turbos'
    description: string,                   // pt-BR
    evidence: { dimension: string; value: number; n: number }
  }>,
  total: number,                           // total detectado antes do limit
  note?: string                            // quando leaks vazio
}
```

**Storage/serviço:** `detectLeaks(userId, { period })` de `server/coachLeakDetection.ts`. Mapear o shape interno (`Leak` / `CoachLeakSummary`) pro shape acima.

**Falta de dado:** `leaks: []`, `total: 0`, `note: 'dados insuficientes para detectar leaks'`. Sem throw.

**Gating/audit:** `gateByTier: ['pro', 'premium', 'admin']` · `requiresConfirmation: false` · `auditLevel: 'log'`.

**Critério de aceitação:**
- [ ] `getTool('find_top_leaks')!.__stub` é `undefined` (stub removido).
- [ ] Handler chama `detectLeaks` com `userId` do `ctx` (NUNCA do input) e o `period`.
- [ ] `minSeverity: 'medium'` filtra leaks `low`; `limit: 3` trunca em 3; `total` reflete o total antes do truncamento.
- [ ] Sem leaks detectados → `leaks: []`, `total: 0`, `note` preenchido.
- [ ] `evidence.n` é o sample size do leak (usado pelo Coach na confidence tag).
- [ ] Regressão: `tests/unit/coach/tool-registry-cooldown.test.ts` continua passando (a tool `find_top_leaks` permanece listada).

---

### RF-03: Religar `get_tournament_suggestions` (read tool — registrar do zero)
**Descrição:** Implementar handler novo (`server/coachTools/handlers/getTournamentSuggestions.ts`) que reusa a lógica do Tournament Selector (`server/scoring/tournamentScorer.ts` via `computeTournamentScore` + `playerBundleCache.getOrLoad` de `server/services/playerBundle.ts`), ranqueia torneios da library + Suprema para uma data/contexto, trunca por `limit`. Registrar no `index.ts`.

> Observação: a lógica de scoring + montagem da lista vive hoje no route handler `server/routes/tournament-selector.ts` (não num service reutilizável). System-architect decide se extrai um service `tournamentSuggestionsService` (preferível, DRY) ou se o handler chama o que já existe. O test-writer mocka o service/handler — o impedimento técnico é só não duplicar a lógica de scoring.

**Inputs (Zod):**
```ts
z.object({
  date: z.string().optional(),                        // ISO date; default = hoje (timezone do user, fallback UTC)
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  profile: z.enum(['A', 'B', 'C']).optional(),
  maxBuyIn: z.number().positive().optional(),          // em USD
  limit: z.number().int().min(1).max(20).default(10),
})
```

**Output shape:**
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
    rationale: string,              // pt-BR humano
  }>,
  total: number,                    // total disponível antes do limit
  date: string,
  note?: string                     // 'sem torneios disponíveis' ou 'sem histórico — scores cold-start'
}
```

**Storage/serviço:** `playerBundleCache.getOrLoad(userId, lookbackDays)` + `computeTournamentScore(sct, bundle, { lookbackDays })` + storage de library/Suprema (`storage.getTournamentLibraryEntries`, fonte de torneios Suprema). Aplicar filtro `maxBuyIn` (USD), `profile`, ordenar por score desc.

**Falta de dado:** sem torneios → `suggestions: []`, `total: 0`, `note`. Sem histórico do jogador → ainda retorna sugestões (cold-start scores), `note: 'sem histórico — scores baseados em estrutura'`.

**Gating/audit:** `gateByTier: ['pro', 'premium', 'admin']` · `requiresConfirmation: false` · `auditLevel: 'log'`.

**Critério de aceitação:**
- [ ] `listRegisteredTools()` contém `'get_tournament_suggestions'`; não é `__stub`.
- [ ] Handler usa `userId` do `ctx`; `maxBuyIn: 50` exclui torneios com `buyInUSD > 50`.
- [ ] `suggestions` ordenado por `score` decrescente; `total` ≥ `suggestions.length`.
- [ ] Sem torneios → `suggestions: []`, `note` preenchido, sem throw.
- [ ] Não duplica a função `computeTournamentScore` — reusa de `server/scoring/tournamentScorer.ts`.

---

### RF-04: Religar `explain_tournament_score` (read tool — registrar do zero)
**Descrição:** Implementar handler novo (`server/coachTools/handlers/explainTournamentScore.ts`) que localiza um torneio por id (XOR de 3 fontes) e devolve o breakdown por sinal do score. Registrar no `index.ts`.

**Inputs (Zod, XOR via superRefine):**
```ts
z.object({
  tournamentId: z.string().optional(),          // de `tournaments` (histórico jogado)
  libraryTemplateId: z.string().optional(),     // de `tournament_library`
  plannedTournamentId: z.string().optional(),   // de `planned_tournaments`
}).superRefine((val, ctx) => {
  const filled = [val.tournamentId, val.libraryTemplateId, val.plannedTournamentId].filter(Boolean).length;
  if (filled !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Exatamente um dos três IDs deve ser fornecido' });
})
```

**Output shape:**
```ts
{
  tournamentRef: { kind: 'tournament' | 'library' | 'planned'; id: string; name: string; site: string },
  score: number,
  grade: 'S' | 'A' | 'B' | 'C' | 'D',
  confidence: 'low' | 'medium' | 'high',
  breakdown: Array<{
    signalName: string,            // ex: 'playerEdge', 'fieldFit', 'scheduleFit', 'bankrollFit', 'structureFit'
    weight: number,
    value: number,                 // 0-100 do sinal
    contribution: number,          // weight * value
    sampleSize: number,            // n de torneios usados na evidência do sinal
    confidence: 'low' | 'medium' | 'high'
  }>,
  rationale: string                // pt-BR
}
```

**Storage/serviço:** lookup do torneio em `tournaments` / `tournament_library` / `planned_tournaments` (validando ownership: `userId` do `ctx`) + `computeTournamentScore` com flag de breakdown. O `TournamentScoreResult` já expõe `signals` + `rationale`; mapear pro shape acima. Se o id não existir ou não pertencer ao user → erro de handler (`{ ok: false, error: 'handler_error', message: 'tournament_not_found' }`).

**Falta de dado:** torneio inexistente/não acessível → erro de handler com mensagem clara (não throw nu).

**Gating/audit:** `gateByTier: ['pro', 'premium', 'admin']` · `requiresConfirmation: false` · `auditLevel: 'log'`.

**Critério de aceitação:**
- [ ] `listRegisteredTools()` contém `'explain_tournament_score'`; não é `__stub`.
- [ ] Input com 0 ou 2+ IDs → erro de validação Zod, sem chamada ao storage.
- [ ] Input com `libraryTemplateId` válido → `breakdown` com 5 sinais, cada um com `weight`, `value`, `contribution`, `sampleSize`, `confidence`.
- [ ] `tournamentId` de outro usuário → erro de handler `tournament_not_found` (não vaza dado).
- [ ] Não duplica `computeTournamentScore`.

---

### RF-05: Religar `simulate_bankroll_scenario` (read tool — substituir stub)
**Descrição:** Substituir o `simulateBankrollStub` por handler real (`server/coachTools/handlers/simulateBankrollScenario.ts`) que lê a banca consolidada do usuário (`walletService` + `user_settings.bankroll_amount` / `bankroll_rule`), simula um cenário hipotético, e avalia se a regra de banca seria violada. Registrar no `index.ts`.

**Inputs (Zod, com superRefine):**
```ts
z.object({
  scenario: z.enum(['lose_n_buyins', 'profit_amount', 'win_streak', 'lose_streak']),
  value: z.number(),                                  // N buy-ins, ou USD (profit_amount), ou N torneios (streaks)
  buyInUSD: z.number().positive().optional(),
}).superRefine((val, ctx) => {
  if (['lose_n_buyins', 'win_streak', 'lose_streak'].includes(val.scenario) && !val.buyInUSD) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'buyInUSD obrigatório para esse cenário' });
  }
})
```

**Output shape:**
```ts
{
  scenario: string,
  currency: 'USD',
  currentAmount: number,           // banca total USD atual
  newAmount: number,               // após o cenário
  percentChange: number,
  rule: string | null,             // ex: '1pct'
  softLimitUSD: number | null,
  hardLimitUSD: number | null,
  ruleViolated: boolean,
  alertLevel: 'safe' | 'warning' | 'danger',
  recommendation: string,          // pt-BR, tom condicional + disclaimer
  note?: string                    // 'bankroll_nao_configurado'
}
```

**Storage/serviço:** `walletService` para a banca consolidada em USD (ou `storage.getUserSettings` se o bankroll standalone ainda for a fonte — system-architect resolve a fonte canônica e documenta) + `computeThresholds`/`bankrollRules` de `server/scoring/bankrollRules.ts` para soft/hard limits. **Conversão de moeda:** sempre normalizar pra USD antes de comparar com thresholds USD (lesson #6 do CLAUDE.md).

**Falta de dado:** banca não configurada → `currentAmount: 0`, `newAmount: 0`, `ruleViolated: false`, `alertLevel: 'safe'`, `note: 'bankroll_nao_configurado'`, recommendation orientando a configurar.

**Gating/audit:** `gateByTier: ['pro', 'premium', 'admin']` · `requiresConfirmation: false` · `auditLevel: 'log'`.

**Critério de aceitação:**
- [ ] `getTool('simulate_bankroll_scenario')!.__stub` é `undefined` (stub removido).
- [ ] `scenario: 'lose_n_buyins'` sem `buyInUSD` → erro de validação Zod.
- [ ] Cenário que leva a banca abaixo do hard limit → `ruleViolated: true`, `alertLevel: 'danger'`.
- [ ] Banca não configurada → `note: 'bankroll_nao_configurado'`, sem throw.
- [ ] `recommendation` usa tom condicional ("poderia considerar", nunca "você deve") e não dá conselho financeiro/fiscal.
- [ ] Conversão de moeda: banca em BRL é convertida pra USD antes de comparar com thresholds USD.
- [ ] Regressão: `tool-registry-cooldown.test.ts` continua passando.

---

### RF-06: Registrar `register_tournament_in_grade` (write tool — confirm)
**Descrição:** Importar `registerTournamentInGradeTool` (`server/coachTools/handlers/registerTournamentInGrade.ts`) no `index.ts` e registrar via `safeRegister`. O handler já existe (XOR `templateId`/`manualEntry`, auto-fill via `storage.getLibraryTemplate`, `executeConfirmed` cria `planned_tournament`, `undo` deleta, `fetchPayloadBefore` retorna `null`). Não modificar o handler exceto se necessário pra contrato com o runner.

**Inputs (Zod — do handler existente):**
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

**Output (`output` do `executeConfirmed`):** `{ plannedTournamentId, name, site, dayOfWeek, time, message }`.

**Storage:** `storage.getLibraryTemplate`, `storage.createPlannedTournament`, `storage.deletePlannedTournament` (undo).

**Nível de confirmação:** `confirm` — `requiresConfirmation: true`. Fluxo: LLM chama → `coach_action` pendente criado → SSE `tool_pending` → UI mostra diff ("vou adicionar [torneio] na sua grade dia X às Y") → user clica confirmar → `POST /api/coach/actions/:id/confirm` → `confirmCoachAction` roda `fetchPayloadBefore` + `executeConfirmed` numa transação → `undo` disponível por 5 min.

**Falta de dado:** `templateId` que não existe ou não pertence ao user → `executeConfirmed` lança `template_not_accessible` → runner marca `coach_action.status = 'failed'` + retorna `{ ok: false, code: 'execution_failed' }`.

**Gating/audit:** `gateByTier: ['pro', 'premium', 'admin']` · `requiresConfirmation: true` · `auditLevel: 'persist'`.

**Critério de aceitação:**
- [ ] `listRegisteredTools()` contém `'register_tournament_in_grade'`.
- [ ] `getTool('register_tournament_in_grade')!.requiresConfirmation === true`.
- [ ] LLM chamando essa tool no `/api/coach/chat` cria um `coach_action` com `status='pending'` e `toolName='register_tournament_in_grade'` (não executa imediato) + emite SSE `tool_pending`.
- [ ] `confirmCoachAction` num action pending dessa tool: cria a `planned_tournament`, marca `coach_action.status='completed'`, popula `payloadBefore` (null), `payloadAfter`, `affectedEntityType='planned_tournament'`, `undoExpiresAt`.
- [ ] `undoCoachAction` dentro de 5 min: deleta a `planned_tournament`, marca `status='undone'`.
- [ ] `undoCoachAction` após 5 min: `410 undo_window_expired`.
- [ ] Input com `templateId` E `manualEntry` → erro de validação Zod (XOR).
- [ ] Regressão: `tests/coach/write-tools/register-tournament-grade.test.ts` e os outros write-tools tests continuam passando.

---

### RF-07: Registrar `record_wallet_transaction` (write tool — confirm-strict, mexe em dinheiro)
**Descrição:** Importar `recordWalletTransactionTool` no `index.ts` e registrar. Handler já existe (reusa `walletService.recordWalletTransaction`, undo cria reverse-row com delta inverso — NUNCA hard-delete, ADR-058). Por mexer em dinheiro, marcar o nível de confirmação como `confirm-strict`.

**`confirm-strict` — o que muda em relação a `confirm`:** `requiresConfirmation: true` (igual) + uma marcação adicional no tool descriptor (`confirmationLevel: 'strict'`) que o frontend usa pra renderizar um diff mais detalhado (valor, moeda, wallet de origem/destino, saldo antes/depois) e exigir confirmação explícita. **Importante:** `coach_action` na tabela hoje só tem `requires_confirmation` (boolean) — NÃO adicionar coluna nova neste sprint. O nível `strict` vive no tool descriptor em memória (registry); o frontend descobre via `GET /api/coach/actions/:id` se quiser (o `toolName` já basta pra ele saber). System-architect documenta no ADR a decisão de não persistir `confirmationLevel` na v1.

**Inputs (Zod — do handler existente):**
```ts
z.object({
  walletId: z.string(),
  amount: z.number().positive(),
  currency: z.enum(['USD', 'BRL', 'EUR', 'CNY']),
  type: z.enum(['deposit', 'withdrawal', 'rakeback', 'manual_adjustment']),
  reason: z.enum(WALLET_TX_REASONS_P0),               // de @shared/wallet-reasons
  occurredAt: z.string().optional(),
  notes: z.string().max(500).optional(),
})
```

**Output:** `{ ... }` (do `executeConfirmed` existente — verificar shape no handler; expor `walletId`, `delta`, `newBalanceNative`, `newBalanceUSD`, `transactionId`, `message`).

**Storage/serviço:** `walletService.recordWalletTransaction` (com `externalTx` — lesson #194 já tratada no handler). Undo: novo `recordWalletTransaction` com `direction` invertida + `reason: 'manual_adjustment'`.

**Nível de confirmação:** `confirm-strict`.

**Falta de dado:** `walletId` inexistente / de outro user → `executeConfirmed` falha → `coach_action.status='failed'`.

**Gating/audit:** `gateByTier: ['pro', 'premium', 'admin']` · `requiresConfirmation: true` · `auditLevel: 'persist'` · `confirmationLevel: 'strict'`.

**Critério de aceitação:**
- [ ] `listRegisteredTools()` contém `'record_wallet_transaction'`.
- [ ] `getTool('record_wallet_transaction')!.requiresConfirmation === true` e `confirmationLevel === 'strict'`.
- [ ] LLM chamando: cria `coach_action` pending (não executa imediato).
- [ ] `confirmCoachAction`: executa via `walletService`, popula `payloadBefore` (saldo antes), `payloadAfter` (delta + walletId), marca completed.
- [ ] `undoCoachAction`: cria reverse-row (transação com delta inverso), NÃO faz hard-delete; marca `status='undone'`.
- [ ] Regressão: `tests/coach/write-tools/record-wallet-transaction.test.ts` + `wallet-undo-reverse-row.test.ts` continuam passando.

---

### RF-08: Registrar `start_grind_session` (write tool — confirm)
**Descrição:** Importar `startGrindSessionTool` no `index.ts` e registrar. Handler já existe (`mode: 'from_planned' | 'instant'`, `executeConfirmed` cria/ativa `grind_session`, `undo` deleta se instant ou volta pra planned se from_planned).

**Inputs (Zod — do handler existente):**
```ts
z.object({
  mode: z.enum(['from_planned', 'instant']),
  plannedSessionId: z.string().optional(),
  startTime: z.string().optional(),
  notes: z.string().max(500).optional(),
}).superRefine(/* plannedSessionId obrigatório se mode='from_planned' */)
```

**Output:** `{ sessionId, status: 'active', startedAt }`.

**Storage:** `storage.getPlannedSession`, `storage.createGrindSession`, `storage.deleteGrindSession`, `storage.updatePlannedSession`.

**Nível de confirmação:** `confirm`.

**Critério de aceitação:**
- [ ] `listRegisteredTools()` contém `'start_grind_session'`; `requiresConfirmation === true`.
- [ ] `mode: 'from_planned'` sem `plannedSessionId` → erro de validação Zod.
- [ ] Fluxo confirm/undo funciona via `coachToolRunner` (cria sessão; undo deleta / restaura planned).
- [ ] Regressão: `tests/coach/write-tools/start-grind-session.test.ts` continua passando.

---

### RF-09: Registrar `log_session_completed` (write tool — confirm)
**Descrição:** Importar `logSessionCompletedTool` no `index.ts` e registrar. Handler já existe (transita `grind_session` de `active` → `completed`, logging parcial aceito, `undo` restaura `status='active'` + valores anteriores integralmente).

**Inputs (Zod — do handler existente):**
```ts
z.object({
  sessionId: z.string(),
  endTime: z.string().optional(),
  volume: z.number().int().nonnegative().optional(),
  profit: z.number().optional(),
  fts: z.number().int().nonnegative().optional(),
  cravadas: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
})
```

**Output:** `{ sessionId, status: 'completed', durationMinutes, message }`.

**Storage:** `storage.getGrindSession`, `storage.updateGrindSession`.

**Nível de confirmação:** `confirm`.

**Critério de aceitação:**
- [ ] `listRegisteredTools()` contém `'log_session_completed'`; `requiresConfirmation === true`.
- [ ] `executeConfirmed` rejeita sessão de outro user (`unauthorized`) e sessão não-`active` (`session_not_active`).
- [ ] Fluxo confirm/undo via runner; undo restaura `status='active'` + campos anteriores.
- [ ] Regressão: `tests/coach/write-tools/log-session-completed.test.ts` continua passando.

---

### RF-10: Registrar `log_leak_focus` (write tool — confirm)
**Descrição:** Importar `logLeakFocusTool` no `index.ts` e registrar. Handler já existe (cria row em `coach_leak_focus`, UNIQUE `(user, leakCode, targetMonth)` → 409 em duplicata via `executeConfirmed`, undo faz `UPDATE status='abandoned'` — NÃO hard-delete).

**Inputs (Zod — do handler existente):**
```ts
z.object({
  leakCode: z.string(),
  description: z.string().max(200),
  targetMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  baselineStat: z.object({
    statKey: z.string(),
    currentValue: z.number(),
    sampleSize: z.number().int().positive(),
  }),
  studyPlanNotes: z.string().max(1000).optional(),
})
```

**Output:** `{ leakFocusId, leakCode, targetMonth, message }`.

**Storage:** `storage.findCoachLeakFocus`, `storage.createCoachLeakFocus`, `storage.updateCoachLeakFocus`.

**Nível de confirmação:** `confirm`.

**Critério de aceitação:**
- [ ] `listRegisteredTools()` contém `'log_leak_focus'`; `requiresConfirmation === true`.
- [ ] Duplicata `(user, leakCode, targetMonth)` → `executeConfirmed` falha de forma controlada (409 / `duplicate`) → `coach_action.status='failed'`.
- [ ] Fluxo confirm/undo via runner; undo marca `status='abandoned'` (não deleta).
- [ ] Regressão: `tests/coach/write-tools/log-leak-focus.test.ts` continua passando.

---

### RF-11: Registrar `log_study_session` (write tool — confirm)
**Descrição:** Importar `logStudySessionTool` no `index.ts` e registrar. Handler já existe (cria `study_session`, valida ownership do `studyCardId` se fornecido, undo deleta).

**Inputs (Zod — do handler existente):**
```ts
z.object({
  topic: z.enum(['solver', 'hand_review', 'video', 'library', 'mental', 'other']),
  durationMinutes: z.number().int().min(5).max(480),
  date: z.string().optional(),
  studyCardId: z.string().optional(),
  insights: z.string().max(2000).optional(),
  focusScore: z.number().int().min(0).max(10).optional(),
  productivityScore: z.number().int().min(0).max(10).optional(),
})
```

**Output:** `{ studySessionId, topic, durationMinutes, date, message }`.

**Storage:** `storage.getStudyCard`, `storage.createStudySession`, `storage.deleteStudySession`.

**Nível de confirmação:** `confirm`.

**Critério de aceitação:**
- [ ] `listRegisteredTools()` contém `'log_study_session'`; `requiresConfirmation === true`.
- [ ] `studyCardId` de outro user → `executeConfirmed` falha (`unauthorized`).
- [ ] Fluxo confirm/undo via runner; undo deleta a `study_session`.
- [ ] Regressão: `tests/coach/write-tools/log-study-session.test.ts` continua passando.

---

### RF-12: Registrar `verify_leak_progress` (read tool — none)
**Descrição:** Importar `verifyLeakProgressTool` no `index.ts` e registrar. **Não é write tool** — `requiresConfirmation: false`, `auditLevel: 'log'`, tem `handler` (não `executeConfirmed`). Re-roda a query do `baselineStatKey` no storage atual e compara com o baseline registrado em `coach_leak_focus`.

**Inputs (Zod — do handler existente):**
```ts
z.object({
  leakFocusId: z.string().optional(),                 // se omitido, pega o foco ativo do user
})
```

**Output shape:**
```ts
{
  leakFocusId: string,
  leakCode: string,
  description: string,
  baseline: { value: number; sampleSize: number; statKey: string },
  current: { value: number; sampleSize: number; statKey: string },
  delta: number,
  improvementPct: number,
  status: 'improving' | 'stable' | 'regressing' | 'insufficient_sample',
  message: string
} | { error: 'no_active_leak_focus'; ... }
```

**Storage:** `storage.findCoachLeakFocus` + re-query do stat baseline (o handler já tem essa lógica; verificar que os métodos de storage que ele chama existem e estão corretos).

**Falta de dado:** sem foco ativo → `{ error: 'no_active_leak_focus' }` (ou `note`). `currentSample < 30` → `status: 'insufficient_sample'`.

**Gating/audit:** `gateByTier: ['pro', 'premium', 'admin']` · `requiresConfirmation: false` · `auditLevel: 'log'`.

**Critério de aceitação:**
- [ ] `listRegisteredTools()` contém `'verify_leak_progress'`; `requiresConfirmation === false`.
- [ ] Sem `leakFocusId` e sem foco ativo → retorno controlado (`no_active_leak_focus`), sem throw.
- [ ] Como é `requiresConfirmation: false`, o `/api/coach/chat` executa imediato e emite SSE `tool_result` (não cria `coach_action` pending).
- [ ] Regressão: `tests/coach/write-tools/verify-leak-progress.test.ts` continua passando.

---

### RF-13: Limpar `server/coachTools/index.ts` (remover stubs, atualizar exports)
**Descrição:** Remover `findTopLeaksStub`, `simulateBankrollStub`, `stubHandler` e os comentários de "baseline broken". Atualizar o array exportado `coachTools` (usado por testes de introspecção) pra refletir as tools reais. Atualizar o comentário de cabeçalho do arquivo.

**Critério de aceitação:**
- [ ] `server/coachTools/index.ts` não contém mais a string `__stub` nem `stubHandler` nem `not_implemented`.
- [ ] O array `coachTools` exportado contém: `read_cooldown_history`, `read_user_hud_stats` (v2), `read_user_bankroll_history`, `read_theme_with_linked_stats_and_spots` (+ alias), `recommend_lesson`, `query_dimension`, `find_top_leaks`, `get_tournament_suggestions`, `explain_tournament_score`, `simulate_bankroll_scenario`, `register_tournament_in_grade`, `record_wallet_transaction`, `start_grind_session`, `log_session_completed`, `log_leak_focus`, `log_study_session`, `verify_leak_progress` — total 17 tools (16 + alias) = **18 entradas** (com o alias deprecado).
- [ ] O filtro `if (process.env.NODE_ENV === 'production') tools.filter(t => !def.__stub)` em `server/routes/coach.ts` continua funcionando (não quebra; só não tem mais nada pra filtrar) — system-architect decide se simplifica ou mantém defensivo.
- [ ] `npm run check` (tsc) passa sem erro.

---

### RF-14: Reforçar citations + confidence universais no system prompt
**Descrição:** Atualizar os blocos de prompt em `server/coachSafetyPrompts.ts` (`CITATIONS_RULES`, `CONFIDENCE_RULES`, e — se necessário pra não quebrar cache — uma nova constante) pra:
1. Tornar explícito que **toda saída de tool que vira número/afirmação factual na resposta DEVE carregar uma citação** no formato `[fonte: <toolName>:<key>:<period>]` (ex.: `[fonte: query_dimension:roi:30d]`, `[fonte: find_top_leaks:low_itm_turbos:90d]`, `[fonte: simulate_bankroll_scenario:lose_n_buyins:atual]`, `[fonte: get_tournament_suggestions:2026-05-14]`). Para citações de tela/page-context: `[fonte: <route>:<period>]`.
2. Atualizar os exemplos few-shot pra mencionar **apenas as tools que agora existem de fato** (remover/corrigir menções a tools que eram stub).
3. Reforçar a confidence tag: quando a tool retorna sample size (`query_dimension.totalCount`, `find_top_leaks.evidence.n`, `read_user_hud_stats.latestSnapshot.sampleSize`), o Coach DEVE usá-lo na tag `[confianca: baixa|media|alta, N=<n>]` (thresholds: N<30 baixa, 30≤N<100 média, N≥100 alta — boundaries inclusivos como hoje).
4. Quando não há fonte segura → `[fonte: nao verificado]`; quando o dado é hand-level / não existe → `[nao sei: <motivo>]`. Nunca inventar número.
5. Adicionar regra: para outputs que mencionem $/banca/saque/staking/tax → disclaimer condicional ("isto é uma estimativa, não conselho financeiro") + tom condicional ("poderia considerar", nunca "você deve").

**Restrição de cache (lesson #10 do CLAUDE.md):** as constantes de prompt vão no bloco STATIC (cacheado). Mudar o texto quebra o cache key da Anthropic **uma vez** — aceitável. Mas: extrair pra **uma fonte única** (não duplicar literal entre `coachPrompts.ts` legacy e `coachSystemBuilder.ts`). Se uma constante tiver variante "backticked" pra preservar o cache key atual, decidir conscientemente (system-architect documenta) — preferível aceitar a quebra única e ter uma constante só.

**Não-objetivo:** NÃO enriquecer o system prompt com nível do jogador / metas / foco do mês / tom preferido — isso é AI-1A. Aqui é só citations/confidence.

**Critério de aceitação:**
- [ ] `CITATIONS_RULES` (ou a constante equivalente) menciona pelo menos `query_dimension`, `find_top_leaks`, `simulate_bankroll_scenario`, `get_tournament_suggestions`, `explain_tournament_score`, `verify_leak_progress`, `read_user_hud_stats`, `read_user_bankroll_history` como fontes válidas de citação.
- [ ] Nenhum exemplo few-shot menciona uma tool que não está registrada no `index.ts`.
- [ ] Há uma regra explícita "Coach NÃO pode mencionar número derivado de tool sem citação inline".
- [ ] Há regra de confidence tag obrigatória quando a tool retorna sample size, com os 3 thresholds (N<30, 30≤N<100, N≥100).
- [ ] Há regra de disclaimer + tom condicional para outputs financeiros.
- [ ] As constantes têm uma única fonte (sem duplicação literal entre `coachPrompts.ts` e `coachSystemBuilder.ts`).
- [ ] `tests/coach/citations/system-prompt-snapshot.test.ts` é atualizado pelo test-writer pra refletir o novo texto (snapshot test — espera-se que mude; mudança intencional, não regressão).
- [ ] O system prompt continua sendo um array com `cache_control: ephemeral` no bloco estático (não vira string).

---

### RF-15: Auditoria do `xSearchProvider` (deliverable: documento de achado + recomendação)
**Descrição:** Ler `server/services/news/xSearchProvider.ts` (+ `orchestrator.ts`, `categorizeItem.ts`, `dedupeLayers.ts` no que for relevante) e produzir um documento curto (`Docs/architecture/audits/xsearch-provider-audit-2026-05.md`) respondendo:
1. O `xSearchProvider` usa Grok/LLM apenas pra **busca/extract** (URLs reais via `x_search` tool + `annotations`), ou também pra **gerar/resumir/rankear** conteúdo?
2. Achado concreto: o handler hoje pede ao Grok um JSON com `tweet_url` + `title` + `summary` + `published_at`. As URLs são cross-validadas contra `annotations[].url` reais (boa defesa). **Mas `title` e `summary` são prosa autoria do modelo** — não há garantia de que correspondem ao conteúdo real do tweet. Risco residual de conteúdo fabricado em `title`/`summary` (menor que o fiasco de 2026-05-04, mas presente). O ranking server-side (ADR-110) é determinístico (`engagement*0.6 + recency*0.4`) — sem risco aí.
3. Recomendação: opções de mitigação ordenadas por esforço — (a) trocar o prompt pra pedir ao Grok que retorne `title`/`summary` **verbatim** do tweet (ainda LLM, mas com instrução restritiva + flag de "se não conseguir extrair, omitir"); (b) buscar o texto real do tweet via outra fonte e descartar o `summary` do Grok; (c) marcar `summary` como "gerado por IA, pode conter imprecisões" no UI; (d) deixar como está e aceitar o risco (kill-switch `NEWS_FEED_ENABLED` já existe). Indicar se vale virar item de sprint separado (ex.: News-4) ou ficar no backlog.

**Não-objetivo:** NÃO implementar nenhuma das mitigações neste sprint. O deliverable é só o documento. Se o achado for "uso é estritamente seguro", o documento diz isso e fecha.

**Critério de aceitação:**
- [ ] Existe `Docs/architecture/audits/xsearch-provider-audit-2026-05.md` com: resumo do que o provider faz, achado (uso de LLM para `title`/`summary`), avaliação de risco, recomendação ordenada por esforço, e veredito (item de sprint / backlog / aceitar risco).
- [ ] O documento referencia ADR-107 e ADR-110 e a sessão `memory/session_2026-05-04-news-audit-and-news-3.md`.
- [ ] Nenhuma mudança de código no `xSearchProvider` neste sprint (a menos que seja um typo trivial que impeça compilação).

---

## Requisitos Não-Funcionais
- **Confirmação SEMPRE (v1):** nenhuma write tool tem auto-aprovação. Toda write tool tem `requiresConfirmation: true` → cria `coach_action` pendente → exige `POST /confirm` explícito → undo 5 min via `payload_before`. Sem `delete_*` tools nesta v1.
- **Gating de tier:** todas as tools (read e write) têm `gateByTier: ['pro', 'premium', 'admin']`. `free` não recebe tools (`exportToolsForAnthropic('free') === []`). Decisão do founder: read tools = Pro+, write tools = Pro+.
- **Não burlar a regra §6.1 (`tournaments` vs `session_tournaments`):** todo handler de read tool que toca analytics/histórico/performance filtra `WHERE grind_session_id IS NULL` (via os métodos de storage existentes, que já fazem isso).
- **Conversão de moeda:** sempre normalizar pra USD antes de comparar com thresholds USD (`simulate_bankroll_scenario`).
- **Sem throw nu nos handlers de read tool:** falta de dado → `note` no payload + `ok: true`. Erro real → `{ ok: false, error: 'handler_error', message }` (wrapping do `coachToolRunner`/registry — ADR-024). Erro de validação Zod → `{ ok: false, error: 'validation_failed', details }` SEM throw.
- **Limite de 5 tool calls/turn** (ADR-026) — mantido, não mexer.
- **Custo Anthropic:** sem mudança esperada — não há novas chamadas ao modelo; só novos tools disponíveis. O LLM pode chamar mais tools por turn (até 5), o que aumenta levemente latência/custo por conversa que usa tools — aceitável e esperado.
- **DRY de prompts (lesson #10):** constantes de citation/confidence em fonte única.
- **Zero regressão:** os ~8500 testes existentes continuam passando, exceto:
  - `tests/unit/coach/tool-registry-cooldown.test.ts` — continua passando (as tools que ele checa permanecem listadas; o "aceita ausência" vira "presença garantida").
  - `tests/coach/citations/system-prompt-snapshot.test.ts` — **mudança intencional do snapshot** (texto do prompt atualizado).
  - Possível ajuste em `Docs/api/coach-tools.md` (doc, não teste).

---

## Endpoints Previstos
Nenhum endpoint novo. Os de coach actions já existem e são reusados (apenas passam a ser exercitados de verdade quando o LLM chama write tools):

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| POST | /api/coach/chat | Chat com Coach — já passa `tools` por tier; agora com 17 tools reais (era 7 + 2 stubs) | JWT |
| GET | /api/coach/actions/:id | Detalhe de um coach_action (status, input, payloadBefore/After) | JWT |
| POST | /api/coach/actions/:id/confirm | Confirma e executa a write tool pendente (transação + undo window) | JWT |
| POST | /api/coach/actions/:id/cancel | Cancela (expira) um coach_action pendente | JWT |
| POST | /api/coach/actions/:id/undo | Desfaz um coach_action completed dentro de 5 min | JWT |

---

## Modelos de Dados Afetados
**Nenhuma alteração de schema.** Todas as tabelas necessárias já existem:
- `coach_actions` (ADR-077) — `payload_before`, `payload_after`, `status`, `requires_confirmation`, `undo_expires_at`, etc. Já tem tudo. **NÃO** adicionar `confirmation_level` neste sprint (o nível `strict` vive só no tool descriptor em memória).
- `coach_leak_focus` (Coach-2B) — usada por `log_leak_focus` / `verify_leak_progress`.
- `tournaments`, `tournament_library`, `planned_tournaments`, `planned_sessions` (`grind_sessions` com role planned), `grind_sessions`, `study_sessions`, `wallets`, `wallet_transactions`, `user_settings`, `hud_stat_snapshots`.

---

## Integrações Externas
| Serviço | Propósito | Quando |
|---|---|---|
| Anthropic API (Claude Sonnet 4.6, via `COACH_CHAT_MODEL`) | Chat do Coach — recebe os 17 tools serializados via `exportToolsForAnthropic` | A cada `/api/coach/chat` de usuário Pro+ |
| xAI Agent Tools API (`x_search`, Grok) | News feed — **só auditado neste sprint, não modificado** | `refreshNews` cron (gated por `NEWS_FEED_ENABLED`) |

---

## Cenários de Teste Derivados

### Happy Path
- [ ] Usuário Pro pede "olha meu ROI por site" → Coach chama `query_dimension({dimension:'roi', groupBy:'site', period:'30d'})` → handler retorna rows por site → Coach responde com citação `[fonte: query_dimension:roi:30d]` e confidence tag `[confianca: alta, N=265]`.
- [ ] Usuário pede "quais meus principais leaks" → Coach chama `find_top_leaks` → handler chama `detectLeaks(userId, {period:'90d'})` → Coach responde com leaks + evidência + `[fonte: find_top_leaks:<code>:90d]`.
- [ ] Usuário pede "adiciona o Big $22 na minha grade de quarta" → Coach chama `register_tournament_in_grade` → `coach_action` pending criado + SSE `tool_pending` → UI mostra diff → user confirma → `planned_tournament` criada → undo disponível 5 min.
- [ ] Usuário pede "registra um depósito de R$500 na minha wallet X" → Coach chama `record_wallet_transaction` (confirm-strict) → `coach_action` pending + SSE `tool_pending` → UI mostra diff detalhado (valor, moeda, wallet, saldo antes/depois) → user confirma → transação criada via `walletService` → undo cria reverse-row.
- [ ] Usuário pede "simula perder 10 buy-ins de $22" → Coach chama `simulate_bankroll_scenario({scenario:'lose_n_buyins', value:10, buyInUSD:22})` → handler lê banca, compara com thresholds → Coach responde com `newAmount`, `ruleViolated`, `alertLevel`, recomendação condicional + disclaimer.
- [ ] Usuário pede "por que o Sunday Million recebeu esse score?" (passa o `libraryTemplateId`) → Coach chama `explain_tournament_score` → handler retorna breakdown por sinal → Coach explica cada sinal com `sampleSize` e confidence.
- [ ] Usuário pede "começa uma sessão a partir da minha grade de hoje" → Coach chama `start_grind_session({mode:'from_planned', plannedSessionId})` → confirm → sessão ativada.
- [ ] Usuário pede "registra 45 min de estudo de solver hoje" → Coach chama `log_study_session` → confirm → `study_session` criada.
- [ ] Usuário pede "como tá meu progresso no foco de leak?" → Coach chama `verify_leak_progress` (none, executa imediato) → SSE `tool_result` → Coach responde com baseline vs current + status.

### Validação de Input
- [ ] `query_dimension` com `dimension: 'xyz'` → `{ ok: false, error: 'validation_failed' }`, sem chamada ao storage.
- [ ] `explain_tournament_score` com 0 IDs ou 2+ IDs → `validation_failed` (XOR).
- [ ] `simulate_bankroll_scenario` com `scenario: 'lose_n_buyins'` sem `buyInUSD` → `validation_failed`.
- [ ] `register_tournament_in_grade` com `templateId` E `manualEntry` → `validation_failed` (XOR).
- [ ] `start_grind_session` com `mode: 'from_planned'` sem `plannedSessionId` → `validation_failed`.
- [ ] `record_wallet_transaction` com `currency` fora de `[USD, BRL, EUR, CNY]` ou `reason` fora de `WALLET_TX_REASONS_P0` → `validation_failed`.
- [ ] `coachToolRunner.confirmCoachAction` re-valida o `input` persistido via Zod antes de executar (já implementado — testar que continua: input adulterado no DB → `422 input_invalid`).

### Regras de Negócio
- [ ] `find_top_leaks` com `minSeverity: 'high'` só retorna leaks `high`; `total` reflete o total antes do filtro.
- [ ] `get_tournament_suggestions` com `maxBuyIn: 50` exclui torneios com `buyInUSD > 50`.
- [ ] `query_dimension` nunca agrega `session_tournaments` (só `tournaments` com `grind_session_id IS NULL`) — testar que o método de storage chamado é o correto.
- [ ] `simulate_bankroll_scenario` converte banca BRL → USD antes de comparar com thresholds USD.
- [ ] `log_leak_focus` duplicado `(user, leakCode, targetMonth)` → `executeConfirmed` falha de forma controlada → `coach_action.status='failed'`, `errorMessage` setado.
- [ ] `record_wallet_transaction` undo cria reverse-row (delta inverso, `reason: 'manual_adjustment'`), NUNCA hard-delete.
- [ ] `log_session_completed` em sessão de outro user → `unauthorized`; em sessão não-`active` → `session_not_active`.
- [ ] Todas as write tools: `getTool(name).requiresConfirmation === true`; todas as read tools: `=== false`.
- [ ] `exportToolsForAnthropic('free')` é `[]`; `exportToolsForAnthropic('pro')` inclui as 17 tools (16 + alias); `exportToolsForAnthropic('admin')` idem (admin recebe tudo).

### Edge Cases
- [ ] `query_dimension` / `find_top_leaks` / `get_tournament_suggestions` com usuário sem histórico → `rows/leaks/suggestions: []` + `note`, `ok: true`, sem throw.
- [ ] `simulate_bankroll_scenario` com banca não configurada → `note: 'bankroll_nao_configurado'`, `alertLevel: 'safe'`, sem throw.
- [ ] `explain_tournament_score` com `tournamentId` de outro usuário → erro de handler `tournament_not_found` (não vaza dado de outro user).
- [ ] `verify_leak_progress` sem foco ativo → retorno controlado (`no_active_leak_focus`), sem throw.
- [ ] `confirmCoachAction` numa action já `completed` → `409 already_confirmed` (idempotência).
- [ ] `confirmCoachAction` em duas requests simultâneas (race) → uma vence, a outra recebe `409 already_confirmed` (SELECT FOR UPDATE já implementado).
- [ ] `undoCoachAction` após 5 min → `410 undo_window_expired`.
- [ ] `undoCoachAction` numa action `pending` (nunca confirmada) → `409` com o status atual.
- [ ] Tool registry: `import('server/coachTools/index')` duas vezes → `safeRegister` silencia `tool_already_registered`, registry consistente.
- [ ] `_resetRegistry()` em `beforeEach` de teste → as 17 tools "core" são re-registradas (continuam visíveis após reset).
- [ ] Storage indisponível no meio de um handler de read tool → erro logado antes do fallback (lesson #9 — não engolir silenciosamente); handler retorna `{ ok: false, error: 'handler_error' }`.
- [ ] `/api/coach/chat` com side-effect import de `coachTools/index` falhando (schema mockado incompleto em teste) → graceful fallback: `tools: []`, conversa segue sem tools (comportamento já existente — não regredir).
- [ ] Mock de SDK Anthropic em testes de chat: `new Anthropic(...)` em try/catch com fallback (lesson #5 / #35) — não regredir.

---

## Fora de Escopo (não-objetivos explícitos)
- **Consolidar os 3 coaches em "Grindfy AI"** — isso é Sprint AI-0B. Aqui os 3 `coachType` continuam como hoje.
- **Enriquecer o system prompt** com nível do jogador / metas / foco do mês / tom preferido / pool intelligence BR — isso é AI-1A. Aqui só citations/confidence.
- **Page context em novas rotas** (`/bankroll`, `/estudos`, `/stats`, `/biblioteca`, `/upload`) — isso é AI-0B.
- **Tools novas de grade/estudo/diagnóstico** (`bulk_propose_grade`, `schedule_study_block`, `create_study_theme`, `define_career_goal`, `analyze_variance`, `diagnose_plateau`, `compute_grind_study_ratio`, `calculate_effective_rake`, `query_pool_intelligence`, tools de mental, tool bridge OCR) — isso é AI-2A/2B.
- **Relatórios automáticos** (Daily Debrief, Weekly Report, Monthly Report, Quarterly Review) — isso é Fase 1.
- **Anti-fadiga / onboarding / nudges novos** (B-IMPORT, B-DOWNSWING, etc.) — isso é Fase 1.
- **Implementar mitigações do `xSearchProvider`** — só o documento de auditoria neste sprint.
- **Adicionar coluna `confirmation_level` em `coach_actions`** — o nível `strict` vive só no tool descriptor em memória na v1.
- **Auto-aprovação de qualquer write tool** — confirmação sempre na v1.
- **`delete_*` tools** — não existem na v1.
- **Segundo turn do LLM com `tool_result`** (continuar a conversa depois que a tool executou, mandando o resultado de volta pro modelo): hoje o `/api/coach/chat` só emite SSE com o resultado da tool mas não re-invoca o modelo com o `tool_result`. **Documentar como pendência conhecida** mas NÃO implementar neste sprint (o Coach hoje "vê" o resultado da tool via o que ele já gerou no mesmo turn antes do tool_use; o full loop conversacional fica pra um sprint futuro — provavelmente AI-0B ou AI-1B). Test-writer/implementer não precisam tocar nisso.
- **MSW para testes de integração do Coach** (CSRF, refresh, 401) — pendência conhecida (lesson testing #117), fora deste sprint.

---

## Dependências
- Nenhuma. É o sprint de partida da Fase 0.
- Pré-condição: a infra que será religada já existe (registry, runner, `coach_actions`, endpoints de actions, handlers de write tools, leak detection, scorer, walletService, playerBundle, blocos de prompt). Este sprint não cria infra nova — só conecta o que está solto.

---

## Notas de Implementação (sugestões — system-architect refina, implementer executa)
- **Read tools (RF-01..05, RF-12):** preferir extrair services reutilizáveis quando a lógica hoje vive só em route handlers (`query_dimension` → wrapper sobre os `getAnalyticsBy*` do storage; `get_tournament_suggestions` / `explain_tournament_score` → extrair um `tournamentScoringService` da lógica de `server/routes/tournament-selector.ts`). Evita duplicar `computeTournamentScore`. Se extrair for caro demais pro escopo, documentar e chamar o que existe — mas NUNCA copiar a fórmula de scoring.
- **`vi.fn()` não é constructor (lesson #5 / #35):** se algum handler de read tool instanciar um SDK via `new` (improvável aqui — só Anthropic, e isso é no route, não nos handlers), envolver em try/catch com fallback. Para testes que mockam `storage`, lembrar lesson #34: handlers de route que precisam de storage injetável aceitam `injectedStorage?` como argumento opcional — mas os handlers de tool já recebem o `storage` via import direto; os testes de tool mockam `storage` via `vi.mock('../../server/storage')` ou passam um stub. System-architect decide o padrão (preferir o que os write-tools tests existentes já usam, pra consistência).
- **`db.transaction` em testes que mockam storage mas não db (lesson #32):** o `coachToolRunner` já trata isso (`storage.transaction` é o ponto único; em testes o mock simula a fila). Não introduzir `db.transaction` direto nos handlers de tool.
- **Anthropic SDK `new` em try/catch (lesson #35):** o `/api/coach/chat` já tem isso. Não regredir ao mexer no wire-up de tools (mexer pouco — só o `index.ts` ganha mais imports; o route handler já está pronto).
- **Snapshot test de prompt:** `tests/coach/citations/system-prompt-snapshot.test.ts` vai quebrar de propósito (RF-14). O test-writer atualiza o snapshot esperado. Não é regressão — é a mudança esperada.
- **`tool-registry-cooldown.test.ts`:** o test-writer pode endurecer o "aceita ausência" das tools que agora existem de fato (`query_dimension`, `get_tournament_suggestions`, `explain_tournament_score`) — passar a exigir presença. Isso conta como melhoria de cobertura, não modificação que quebra.
- **Doc `Docs/api/coach-tools.md`:** atualizar pra refletir o estado real (17 tools, gating `pro+` em todas, write tools com `requiresConfirmation`, corrigir o enum `speed: Normal|Turbo|Hyper`). System-architect ou implementer atualiza junto com a errata de ADR.
- **Branch:** trabalhar em `feature/sprint-ai-0a` (lesson #24 — `git status` periódico; auto-mode pode trocar branch silenciosamente).

---

## Sugestão de ADRs a criar (para o system-architect)
1. **Errata aos ADRs 023/024 — "Tools que estavam stub/não-registradas, agora ligadas":** documentar que `query_dimension`, `find_top_leaks`, `get_tournament_suggestions`, `explain_tournament_score`, `simulate_bankroll_scenario` saíram do estado stub/ausente e foram religadas; que `register_tournament_in_grade`, `record_wallet_transaction`, `start_grind_session`, `log_session_completed`, `log_leak_focus`, `log_study_session`, `verify_leak_progress` (handlers de Coach-2B) foram registrados no `index.ts`; corrigir a divergência de enums (`speed`) na doc `coach-tools.md`.
2. **ADR — "Confirmação sempre na v1 para write tools do Coach (sem auto-aprovação, sem `delete_*`)":** registrar a decisão do founder. Cobre: toda write tool tem `requiresConfirmation: true`; nível `confirm-strict` para tools que mexem em dinheiro (`record_wallet_transaction`), implementado como flag `confirmationLevel: 'strict'` no tool descriptor em memória (não persistido em `coach_actions` na v1); sem `delete_*` tools; undo 5 min via `payload_before`. Eventual evolução (usuário "confiar" certas tools) fica documentada como futuro, fora da v1.
3. **(Opcional) ADR ou seção de doc — "Padrão de read tool: extração de service vs reuso de route handler":** se o system-architect decidir extrair `tournamentScoringService` (e similares), documentar o padrão. Se não, uma nota em `Docs/api/coach-tools.md` basta.
4. **Documento de auditoria** (não é ADR): `Docs/architecture/audits/xsearch-provider-audit-2026-05.md` (deliverable do RF-15).

---

## Verificação Final (checklist pm-spec)
- [x] Cada RF tem critérios de aceitação verificáveis.
- [x] Cenários de teste cobrem happy path, validação de input, regras de negócio e edge cases.
- [x] Seção "Fora de Escopo" preenchida e detalhada.
- [x] Sem ambiguidade — cada regra tem uma interpretação única (níveis de confirmação, gating, fonte de storage, comportamento em falta de dado).
- [x] Spec é independente o suficiente para o test-writer gerar testes (schemas Zod explícitos, output shapes, storage methods nomeados, comportamentos de erro definidos). Pontos onde o system-architect precisa decidir (extrair service vs reusar route; variante backticked do prompt; fonte canônica da banca para `simulate_bankroll_scenario`) estão sinalizados.
- [x] Endpoints listados (todos pré-existentes; nenhum novo).
- [x] Modelos de dados: nenhuma alteração de schema; tabelas reusadas listadas.
