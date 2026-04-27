# Spec: Coach Sprint 2A — Page Context + Read Tools

## Status
Proposta

## Resumo
Primeiro sprint do Coach v2 (agente executor) escopado em READ-ONLY. Entrega Nivel A (Page Context Injection automatica) + infra-estrutura de Tool Use (registry pattern + 5 read tools + integracao streaming Anthropic) + frontend para renderizar tool calls inline no chat. Sem mutacoes, sem multimodal, sem voz. Foco em provar que o coach consegue usar dados reais sem o usuario precisar explicar onde esta nem reformular perguntas como SQL.

## Contexto

Sprint Coach-1 ja entregue (4157 testes green) com fundacao economica e UX:
- Rate limit tiered (free/pro/premium/admin), gate por plano, prompt caching com bloco estatico vs dinamico
- Thumbs feedback, citations `[FATO #N]`, confidence tags, admin analytics dashboard

Estado atual do coach (limitacoes):
- O usuario precisa **descrever onde esta** ("estou na grade planejando quarta") — coach ignora a pagina.
- O coach **nao consulta dados sob demanda** — depende do bloco estatico (assembleContext) que carrega tudo de uma vez na primeira mensagem da sessao.
- Perguntas como "qual meu ROI por site nos ultimos 90 dias?" recebem respostas vagas porque o snapshot estatico nao tem essa dimensao em formato direto.

Este sprint resolve as duas lacunas:

1. **Page Context Injection (RF-01, RF-06):** o coach sabe automaticamente onde voce esta. Trocou de pagina, o contexto se atualiza. Mensagem nova ja chega com a rota e parametros relevantes.
2. **Tool Use Read-Only (RF-02 a RF-05):** o coach consulta os dados que precisa via tools, sob demanda, durante o stream. Resultado renderizado inline no chat como cards.

Restricoes claras: **sem mutacoes neste sprint**. Se o usuario pedir "agenda esse torneio na minha grade", o coach responde com instrucao manual, nao executa. Tools de mutacao sao Sprint Coach-2B+.

Prioridade: ALTA. Esta na trilha critica do roadmap pos-pivot (Coach v2 substitui Sprints 3 e 4 cancelados). Descongela o caminho para Sprint 2B (write tools com confirmacao) e 2C (autonomia gradual).

## Usuarios

- **Usuario free/pro/premium (jogador):** ganha um coach que "sabe onde voce esta" e "puxa os numeros que precisa" sem voce reformular pergunta como query.
- **Admin:** ganha visibilidade de quais tools sao mais usadas, quais quebram mais, qual a latencia delas — input para investimento futuro.
- **Implementer (proximos sprints):** ganha um registry pattern reusavel que comporta as write tools dos sprints 2B+ sem refactor.

## Requisitos Funcionais

### RF-01: Page Context Injection

**Descricao:** Coach recebe automaticamente contexto da pagina aberta (rota, params relevantes, filtros ativos, entidade focada) injetado no system prompt dinamico — sem o usuario precisar explicar onde esta.

**Regras de negocio:**

1. Frontend mantem state global de `pageContext` via React Context (padrao do projeto, sem dep nova).
2. Cada pagina-alvo emite seu contexto especifico via hook `useCoachPageContext(context)` em `useEffect` ao montar e ao mudar params relevantes.
3. `useCoachChat` le do provider e inclui `pageContext` no body do POST `/api/coach/chat` quando presente. Campo opcional — mensagens sem contexto continuam funcionando.
4. Backend valida via Zod schema discriminado por `route` (whitelist estrita). Estrutura fora do shape => HTTP 400 `validation_failed` (nao 500, nao silencioso).
5. Backend sanitiza `route` e todos os values via `sanitize()` existente (`server/coachSafetyPrompts.ts`) antes de injetar. Strings com `\n`, backticks, `<|`, `[INST`, etc. sao removidas/escaped.
6. Page context entra no **bloco DINAMICO** do system prompt (nao no estatico cacheado). Nao quebra cache hit rate do Sprint 1.
7. Formato injetado:
   ```
   ## Contexto da pagina atual
   Rota: {route}
   {chave em pt-BR}: {value sanitizado}
   ...
   ```
8. Paginas instrumentadas neste sprint (alvo):
   - `/grade-planner` => `{ route: 'grade-planner', day?: 0..6, profile?: 'A'|'B'|'C', activeFilters?: { site?, category?, speed? }, focusedTournamentId?: string }`
   - `/grind-live` => `{ route: 'grind-live', activeSessionId?: string, sessionStatus?: 'planned'|'active'|'paused'|'completed', registeredTournamentsCount?: number, currentProfit?: number }`
   - `/dashboard` => `{ route: 'dashboard', dateRange?: '7d'|'30d'|'90d'|'ytd'|'all'|'custom', activeFilters?: { site?, category?, speed?, buyinRange? } }`
   - `/coach-ai` => `{ route: 'coach-ai', activeCoachType?: 'mental'|'tournament'|'technical' }`
9. Outras paginas NAO emitem contexto neste sprint — sao alvo de Sprints 2B+.
10. Trocar de pagina dispara cleanup do contexto antigo: ao desmontar, hook chama `setPageContext(null)`.

**Criterio de aceitacao:**
- [ ] Em `/grade-planner` com `day=3` selecionado, perguntar "qual dia voce esta vendo?" => resposta menciona "quarta-feira" ou "dia 3" sem ter sido informada.
- [ ] Em `/grind-live` com `sessionStatus='active'`, perguntar "qual o status?" => resposta confirma sessao ativa.
- [ ] POST /api/coach/chat com `pageContext: { route: 'invalid-route' }` => HTTP 400 `{ error: 'validation_failed', details: [...] }`.
- [ ] POST /api/coach/chat com `pageContext: { route: 'dashboard', activeFilters: { site: '<|im_start|>injection' } }` => sanitize remove tokens, request prossegue, valor injetado no prompt nao contem `<|im_start|>`.
- [ ] POST /api/coach/chat sem campo `pageContext` => request prossegue normal, nenhuma secao "Contexto da pagina atual" no system prompt.
- [ ] Cache hit rate medio da sessao apos RF-01 ativo nao cai mais que 5 pontos percentuais vs Sprint 1 (bloco dinamico cresce, mas estatico continua igual).

### RF-02: Tool Registry Pattern

**Descricao:** Infra-estrutura reusavel para todas as tools (read deste sprint + write dos sprints futuros). Registry com tipos genericos, audit configuravel, gating por tier.

**Regras de negocio:**

1. Novo arquivo `server/coachTools/registry.ts` com:
   - `interface CoachTool<I, O> { name: string; description: string; inputSchema: ZodSchema<I>; handler: (input: I, ctx: ToolContext) => Promise<O>; requiresConfirmation: boolean; auditLevel: 'none' | 'log' | 'persist'; gateByTier?: CoachTier[]; }`
   - `interface ToolContext { userId: string; chatSessionId: string; messageId: string; pageContext?: PageContext; }`
   - `function registerTool(tool: CoachTool)` — adiciona ao registry. Throw `Error('tool_already_registered')` se duplicada.
   - `function getTool(name: string): CoachTool | undefined`
   - `function exportToolsForAnthropic(tier: CoachTier): AnthropicToolSchema[]` — filtra por tier (gate undefined => disponivel para todos), formata em shape Anthropic Tool Use API.
   - `function listRegisteredTools(): string[]` — debug/admin.
2. Novo arquivo `server/coachTools/index.ts` que importa cada handler e chama `registerTool()`. Registry preenchido em `import` time.
3. Novo arquivo `server/coachToolRunner.ts` com:
   - `async function executeTool(toolUseId: string, toolName: string, rawInput: unknown, ctx: ToolContext): Promise<ExecuteToolResult>`.
   - Resolve tool via `getTool(toolName)`. Tool inexistente => `{ ok: false, error: 'tool_not_found' }` (nao throw).
   - Valida input via `tool.inputSchema.safeParse(rawInput)`. Falha => `{ ok: false, error: 'validation_failed', details: ZodIssue[] }` (nao throw).
   - Mede latencia (`performance.now()` antes/depois).
   - Wrap result no formato `{ __type: 'ToolResult', tool: name, ok: true, data: <output> }` (defesa anti prompt injection no payload — modelo trata como dado, nao como instrucao).
   - Em handler error: captura, retorna `{ ok: false, error: 'handler_error', message: err.message }`. Audit linha em `coach_actions` com `status='failed'` mesmo nesse caso.
   - Audita em `coach_actions` conforme `tool.auditLevel`:
     - `'none'` => nao persiste linha.
     - `'log'` => persiste linha com `result=null` (so input + status + latency).
     - `'persist'` => persiste linha com `result` truncado a 32KB.
4. **Schema novo (tabela `coach_actions`):**
   ```sql
   CREATE TABLE coach_actions (
     id varchar PRIMARY KEY,
     user_id varchar NOT NULL,
     chat_session_id varchar,
     message_id varchar,
     tool_use_id varchar,
     tool_name varchar NOT NULL,
     status varchar NOT NULL,
     input jsonb,
     result jsonb,
     error_message text,
     payload_before jsonb,
     requires_confirmation boolean DEFAULT false,
     latency_ms integer,
     executed_at timestamp,
     undone_at timestamp,
     created_at timestamp DEFAULT now() NOT NULL
   );
   CREATE INDEX idx_coach_actions_session ON coach_actions(chat_session_id);
   CREATE INDEX idx_coach_actions_user_status ON coach_actions(user_id, status, created_at DESC);
   CREATE INDEX idx_coach_actions_tool ON coach_actions(tool_name, status, created_at DESC);
   ```
5. `payload_before` fica null para tools deste sprint (so faz sentido em mutation tools — Sprint 2B usa).
6. Foreign key `user_id` referencia `users.id` com `ON DELETE CASCADE`.

**Criterio de aceitacao:**
- [ ] `registerTool({ name: 'foo', ... })` chamado duas vezes => segunda chamada throw `tool_already_registered`.
- [ ] `exportToolsForAnthropic('free')` retorna apenas tools com `gateByTier` undefined ou contendo `'free'`. Tools com `gateByTier: ['premium']` ficam de fora.
- [ ] `executeTool('id1', 'unknown_tool', {}, ctx)` => `{ ok: false, error: 'tool_not_found' }` sem throw.
- [ ] `executeTool('id1', 'query_dimension', { dimension: 'invalid' }, ctx)` => `{ ok: false, error: 'validation_failed', details: [...] }`.
- [ ] Apos `executeTool` bem-sucedida em tool com `auditLevel='log'`, query em `coach_actions` retorna 1 linha com `status='completed'`, `latency_ms > 0`, `result IS NULL`.
- [ ] Handler que throw => linha em `coach_actions` com `status='failed'`, `error_message` preenchido, latencia capturada mesmo assim.

### RF-03: Cinco Read Tools

**Descricao:** Cinco tools read-only registradas via `registerTool()`, cobrindo as consultas mais frequentes em conversas reais com o coach. Cada tool tem schema Zod, handler chamando storage existente, output estruturado e wrapping `ToolResult`.

**Regras de negocio:**

#### Tool 1: `query_dimension`

- Description (para LLM): "Consulta uma dimensao analitica do jogador (ROI, profit, volume, ITM%, ABI, FTs, cravadas) com filtros opcionais e agrupamentos."
- Input schema:
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
- Handler: roteia para `storage.getDashboardStats` (sem groupBy) ou `storage.getAnalyticsBy{Site|Category|Speed|BuyinRange|Day|Month|Field}` apropriado. Reusa funcoes existentes.
- Output:
  ```ts
  {
    dimension: string,
    groupBy: string | null,
    rows: Array<{ key: string, value: number, count: number, [extras]: any }>,
    totalCount: number,
    period: string,
    note?: string  // ex: "sem dados suficientes" se rows vazio
  }
  ```
- `gateByTier`: undefined (todos os tiers, e read).
- `auditLevel`: `'log'`.

#### Tool 2: `find_top_leaks`

- Description: "Roda detector de leaks rule-based e devolve os principais problemas tecnicos detectados no jogo do usuario, com severidade e evidencia."
- Input:
  ```ts
  z.object({
    limit: z.number().int().min(1).max(20).optional().default(5),
    minSeverity: z.enum(['low', 'medium', 'high']).optional().default('low'),
  })
  ```
- Handler: chama `detectLeaks(userId)` de `server/coachLeakDetection.ts` (existente). Filtra/ordena por severidade. Trunca por `limit`.
- Output:
  ```ts
  {
    leaks: Array<{
      severity: 'low' | 'medium' | 'high',
      code: string,
      description: string,
      evidence: { dimension: string, value: number, n: number }
    }>,
    total: number,
    note?: string
  }
  ```
- `gateByTier`: undefined.
- `auditLevel`: `'log'`.

#### Tool 3: `get_tournament_suggestions`

- Description: "Consulta o Tournament Selector e devolve sugestoes ranqueadas de torneios para uma data/contexto, com score detalhado por sinal."
- Input:
  ```ts
  z.object({
    date: z.string().optional(),  // ISO date; default = hoje
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    profile: z.enum(['A', 'B', 'C']).optional(),
    maxBuyIn: z.number().positive().optional(),
    limit: z.number().int().min(1).max(20).optional().default(10),
  })
  ```
- Handler: chama servico do Tournament Selector existente em `server/scoring/tournamentScorer.ts` (Sprint 1 ja entregue). Repassa `userId` do `ctx`.
- Output:
  ```ts
  {
    suggestions: Array<{
      name: string,
      site: string,
      buyIn: number,
      type: string,
      score: number,
      signals: object,
      signalsExplanation: string
    }>,
    total: number,
    note?: string
  }
  ```
- `gateByTier`: undefined.
- `auditLevel`: `'log'`.

#### Tool 4: `explain_tournament_score`

- Description: "Explica em detalhe por que um torneio especifico recebeu o score que recebeu — discriminacao por sinal com peso, contribuicao e confianca."
- Input (XOR validado por `superRefine`):
  ```ts
  z.object({
    tournamentId: z.string().optional(),
    libraryTemplateId: z.string().optional(),
    plannedTournamentId: z.string().optional(),
  }).superRefine((val, ctx) => {
    const filled = [val.tournamentId, val.libraryTemplateId, val.plannedTournamentId].filter(Boolean).length;
    if (filled !== 1) ctx.addIssue({ code: 'custom', message: 'Exatamente um dos tres IDs deve ser fornecido' });
  })
  ```
- Handler: localiza o torneio pelo id apropriado, chama scorer com flag de breakdown completo.
- Output:
  ```ts
  {
    tournamentId: string,
    score: number,
    breakdown: Array<{
      signalName: string,
      weight: number,
      contribution: number,
      dataPoints: number,
      confidence: 'low' | 'medium' | 'high'
    }>,
    recommendation: 'high' | 'medium' | 'low'
  }
  ```
- `gateByTier`: undefined.
- `auditLevel`: `'log'`.

#### Tool 5: `simulate_bankroll_scenario`

- Description: "Simula impacto na banca de um cenario hipotetico (perder N buy-ins, lucrar X, sequencia de wins/losses) e avalia se a regra de banca configurada seria violada."
- Input:
  ```ts
  z.object({
    scenario: z.enum(['lose_n_buyins', 'profit_amount', 'win_streak', 'lose_streak']),
    value: z.number(),
    buyInUSD: z.number().positive().optional(),  // obrigatorio para scenarios baseados em buy-ins
  }).superRefine((val, ctx) => {
    if ((val.scenario === 'lose_n_buyins' || val.scenario === 'win_streak' || val.scenario === 'lose_streak') && !val.buyInUSD) {
      ctx.addIssue({ code: 'custom', message: 'buyInUSD obrigatorio para esse scenario' });
    }
  })
  ```
- Handler: novo arquivo `server/coachTools/handlers/bankroll.ts`. Le `bankroll_amount` + `bankroll_rule` do user (das tabelas de Bankroll Management — spec ja existente). Calcula resultado.
- Output:
  ```ts
  {
    scenario: string,
    currentAmount: number,
    newAmount: number,
    percentChange: number,
    ruleViolated: boolean,
    alertLevel: 'safe' | 'warning' | 'danger',
    recommendation: string  // pt-BR
  }
  ```
- `gateByTier`: undefined.
- `auditLevel`: `'log'`.

**Regras comuns a todas as 5 tools:**

1. Schema Zod valida input antes do handler.
2. Output sempre wrapped por `coachToolRunner` em `{ __type: 'ToolResult', tool, ok: true, data }`.
3. Handler nao throw em caso de dados ausentes — retorna estrutura vazia + `note: 'sem dados suficientes'`. Throw so para erros de infra (banco fora, etc.).
4. Linha em `coach_actions` com `auditLevel='log'` (so latencia + status + input).
5. `userId` usado para ownership — todas as queries filtram por `ctx.userId` no storage.

**Criterio de aceitacao:**

- [ ] Para cada tool: input valido + dados presentes => output com `data` correto, `note` ausente.
- [ ] Para cada tool: input valido + sem dados => output com `data` vazio (rows: [], leaks: [], etc.) + `note: 'sem dados suficientes'`. NAO throw.
- [ ] Para cada tool: input invalido (schema violation) => `executeTool` retorna `{ ok: false, error: 'validation_failed' }`. Handler nao chamado.
- [ ] `query_dimension` com `dimension: 'roi', groupBy: 'site'` retorna rows com `key` em formato esperado (nome do site).
- [ ] `explain_tournament_score` com 0 ou 2 IDs => validation_failed.
- [ ] `simulate_bankroll_scenario` com `scenario: 'lose_n_buyins'` sem `buyInUSD` => validation_failed.
- [ ] `simulate_bankroll_scenario` com cenario que viola regra de banca => `ruleViolated: true`, `alertLevel: 'danger'`, recommendation em pt-BR.
- [ ] Auditoria: `coach_actions` tem 1 linha por execucao com `status` correto e `latency_ms > 0`.

### RF-04: Anthropic Tool Use Streaming Integration

**Descricao:** Handler do chat (`server/routes/coach.ts`) suporta tool use durante o stream SSE — coach decide chamar tool, runner executa, conversa continua, repete ate resposta final ou limite de tools.

**Regras de negocio:**

1. Apos `resolveUserTier`, chamar `exportToolsForAnthropic(tier)` e passar como `tools: [...]` no `messages.stream({...})`.
2. Loop de eventos novo no stream parser:
   - `content_block_start` com `type: 'tool_use'` => capturar `tool_use_id`, `name`. Emitir SSE `tool_use_start`.
   - `content_block_delta` com `type: 'input_json_delta'` => acumular `partial_json`. Emitir SSE `tool_use_input_delta`.
   - `content_block_stop` para tool_use => parsear input JSON acumulado. Emitir SSE `tool_use_input_done`.
   - `message_stop` com `stop_reason: 'tool_use'` => para cada tool_use no message: emitir SSE `tool_executing`, chamar `executeTool()`, emitir SSE `tool_completed` com result truncado.
3. **Continuation:** apos executar todas as tools do turn, fazer novo `messages.stream()` com:
   ```ts
   messages: [
     ...prevMessages,
     { role: 'assistant', content: [...textBlocks, ...toolUseBlocks] },
     { role: 'user', content: toolResults.map(r => ({ type: 'tool_result', tool_use_id: r.toolUseId, content: JSON.stringify(r.result), is_error: !r.ok })) }
   ]
   ```
4. Loop ate LLM nao chamar mais tool ou limite atingido. **Limite hard: 5 tool calls totais por turn de usuario** (anti-runaway). Sexta tentativa => abortar continuation, retornar texto que o LLM ja produziu + warning SSE `tool_limit_reached`.
5. Tool result enviado de volta ao LLM truncado a **4000 tokens** (estimativa: 16000 chars). Se output maior, truncar e adicionar `__truncated: true` no payload.
6. **Tier gating:** tier `'free'` recebe `tools: []` (sem tools). Pro/premium/admin recebem todas as 5.
7. SSE events emitidos para frontend:
   ```
   data: { "type": "tool_use_start", "toolUseId": "...", "toolName": "..." }
   data: { "type": "tool_use_input_delta", "toolUseId": "...", "partial": "..." }
   data: { "type": "tool_use_input_done", "toolUseId": "...", "input": {...} }
   data: { "type": "tool_executing", "toolUseId": "..." }
   data: { "type": "tool_completed", "toolUseId": "...", "success": true, "result": {...} }
   data: { "type": "tool_limit_reached", "limit": 5 }
   ```
8. Cache do system prompt com `cache_control` mantem-se intacto. `tools: [...]` adicionada como parametro top-level — Anthropic permite cachear system + tools em prefix cache (validar com smoke).
9. Nao quebrar features Sprint 1: confidence tags, citations, memory, autotitle, sanitize de mensagem do user, rate limit. Tools sao **adicao**, nao substituicao.

**Criterio de aceitacao:**
- [ ] Smoke: usuario pergunta "qual meu ROI por site?" => coach chama `query_dimension(dimension='roi', groupBy='site')` => recebe result => responde com texto formatado em pt-BR.
- [ ] Multi-tool: usuario pergunta "quais meus 3 maiores leaks e quais torneios sugere pra hoje?" => coach chama `find_top_leaks` E `get_tournament_suggestions` na mesma resposta (mesmo turn ou turns encadeados).
- [ ] Limite: simular cenario que faria coach loopar => no maximo 5 tools executadas, depois SSE `tool_limit_reached` emitido, coach finaliza com texto.
- [ ] Tier free: tools enviadas no payload Anthropic = [] (verificavel via mock SDK).
- [ ] Cache: hit rate medio em sessao com 3+ mensagens nao regrede mais que 5 pontos vs Sprint 1 baseline.
- [ ] Latencia primeiro chunk de texto em conversa sem tool call: nao regredir mais que 200ms vs Sprint 1.
- [ ] Tool error em runtime => SSE `tool_completed` com `success: false`, coach recebe tool_result com `is_error: true` e responde graceful em pt-BR.

### RF-05: Frontend CoachToolCard

**Descricao:** Componente novo que renderiza tool calls inline no chat com 4 estados visuais (streaming-input, executing, completed, failed), renderers especificos por tool e fallback raw JSON.

**Regras de negocio:**

1. Componente `client/src/components/coach/CoachToolCard.tsx`:
   - Props: `{ toolUseId: string, toolName: string, status: 'streaming-input' | 'executing' | 'completed' | 'failed', input?: object, result?: object, error?: string }`.
   - Estados visuais (Tailwind + shadcn primitives, sem dep nova):
     - `streaming-input`: chip pequeno arredondado com Lucide spinner + "Coach esta preparando consulta..."
     - `executing`: chip com spinner pulsando + "Executando {label-pt-BR-da-tool}..."
     - `completed`: card colapsado com header "Resultado: {label}" + chevron expandivel. Body renderiza componente especifico.
     - `failed`: card vermelho (border-red-500/20, bg-red-500/5) com icone + mensagem amigavel pt-BR + colapso opcional para detalhe tecnico.
   - Acessibilidade: `role="status"`, `aria-live="polite"` no container.
2. Mapa de labels pt-BR por tool:
   - `query_dimension` => "Analise por dimensao"
   - `find_top_leaks` => "Detector de leaks"
   - `get_tournament_suggestions` => "Sugestoes de torneios"
   - `explain_tournament_score` => "Detalhamento de score"
   - `simulate_bankroll_scenario` => "Simulacao de banca"
3. Renderers especificos (subcomponentes):
   - `<QueryDimensionRenderer data={...} />` => mini-tabela responsiva (max 10 linhas, scroll vertical apos isso).
   - `<LeaksRenderer data={...} />` => lista bullet com badge de severidade colorida (low=cinza, medium=ambar, high=vermelho — cores ja existentes no projeto).
   - `<TournamentSuggestionsRenderer data={...} />` => mini-cards horizontais com scroll-x (`overflow-x-auto`).
   - `<TournamentScoreRenderer data={...} />` => barras de contribuicao por sinal (Recharts BarChart pequeno, 200px altura).
   - `<BankrollScenarioRenderer data={...} />` => mini KPI card "Saldo: $X => $Y (Δ {percent}%)" com cor por `alertLevel`.
   - Fallback `<RawJsonRenderer data={...} />` => `<pre>` com JSON.stringify pretty (max-height 300px scroll) para tools desconhecidas.
4. Hook novo `client/src/hooks/useCoachToolEvents.ts`:
   - Recebe stream SSE do `useCoachChat` (extender, nao substituir).
   - Mantem map `toolUseId -> { toolName, status, input, result, error }`.
   - Atualiza state ao receber cada SSE type.
   - Expor `toolEvents: Array<ToolEvent>` ordenado por ordem de aparicao no stream.
5. Posicionamento no chat: tool cards renderizados **inline na bolha do assistente**, intercalados com chunks de texto na ordem em que aparecem no stream (texto -> tool -> texto -> tool).
6. Result enviado via SSE truncado a `~2000 chars` (UI). Se truncado, renderer mostra "[ver completo]" link que abre dialog com payload completo (so admin/dev) — em prod usuarios finais nao veem link.

**Criterio de aceitacao:**
- [ ] Stream com 1 tool call renderiza inline: chip streaming-input => executing => card completed. Sem layout shift abrupto.
- [ ] Stream com tool failed => card vermelho com mensagem pt-BR ("Nao foi possivel consultar suas estatisticas agora").
- [ ] Cada um dos 5 renderers especificos exibe formato apropriado (tabela, bullets, cards, barras, KPI).
- [ ] Tool desconhecida => fallback `RawJsonRenderer`.
- [ ] `aria-live="polite"` testavel via screen reader simulado (assertion presente).
- [ ] Tests: 5 renderers (1 cada) + 1 happy path completo + 1 failed state + 1 acessibilidade.

### RF-06: useCoachPageContext Hook + Instrumentar 4 Paginas

**Descricao:** Provider React Context global de pageContext + hook para paginas emitirem + 4 paginas instrumentadas.

**Regras de negocio:**

1. Novo arquivo `client/src/contexts/CoachPageContext.tsx`:
   - `CoachPageContext = createContext<{ pageContext: PageContext | null, setPageContext: (ctx: PageContext | null) => void }>()`.
   - `<CoachPageContextProvider>` wrapper em `App.tsx` ao redor das rotas.
2. Novo arquivo `client/src/hooks/useCoachPageContext.ts`:
   - `function useCoachPageContext(context: PageContext | null)`.
   - Em `useEffect([context])`, chama `setPageContext(context)`.
   - Em cleanup do effect (return), chama `setPageContext(null)` para limpar quando desmonta.
3. `useCoachChat` (existente) le `pageContext` do provider via `useContext(CoachPageContext)` e adiciona ao body do POST `/api/coach/chat` quando nao null.
4. Paginas instrumentadas:
   - `client/src/pages/GradePlanner.tsx` => `useCoachPageContext({ route: 'grade-planner', day: selectedDay, profile: activeProfile, activeFilters: filters, focusedTournamentId: focusedId })`
   - `client/src/pages/GrindSessionLive.tsx` => `useCoachPageContext({ route: 'grind-live', activeSessionId: session?.id, sessionStatus: session?.status, registeredTournamentsCount: tournaments?.length, currentProfit: stats?.profit })`
   - `client/src/pages/Dashboard.tsx` => `useCoachPageContext({ route: 'dashboard', dateRange: filters.dateRange, activeFilters: { site: filters.site, category: filters.category, ... } })`
   - `client/src/pages/CoachAI.tsx` => `useCoachPageContext({ route: 'coach-ai', activeCoachType: activeCoach })`
5. Cada hook chamado em useEffect dependendo dos values relevantes — re-emite quando filtro/sessao muda.

**Criterio de aceitacao:**
- [ ] Navegando de `/dashboard` para `/grade-planner`: pageContext muda automaticamente. Mensagem nova enviada apos navegar carrega novo contexto.
- [ ] Mudar `selectedDay` em GradePlanner: pageContext re-emitido com novo day. Proxima mensagem reflete.
- [ ] Desmontar pagina (navegar para fora) => pageContext volta para null. Proxima mensagem em pagina nao instrumentada nao tem campo pageContext.
- [ ] Tests: 4 instrumentacoes (uma por pagina) + 1 transition test (mount A -> mount B substitui contexto).

### RF-07: Telemetria Basica

**Descricao:** Endpoint admin que agrega dados de `coach_actions` para visibilidade de uso e saude das tools, integrado a pagina admin existente `AdminCoachAnalytics`.

**Regras de negocio:**

1. Novo endpoint `GET /api/admin/coach/tools-metrics?days=7`:
   - Auth: `requireAuth` + `requirePermission('admin_full')`.
   - Query param `days`: 1..90, default 7.
   - Response shape:
     ```ts
     {
       totalCalls: number,
       totalToolUseSessions: number,  // sessoes distintas que usaram pelo menos 1 tool
       byTool: Array<{
         name: string,
         calls: number,
         errorRate: number,  // 0..1
         avgLatencyMs: number,
         p95LatencyMs: number
       }>,
       byDay: Array<{
         date: string,  // YYYY-MM-DD
         calls: number,
         errors: number
       }>
     }
     ```
2. Queries SQL usam indices criados em RF-02 (`idx_coach_actions_tool`, `idx_coach_actions_user_status`).
3. p95 calculado via `percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)` — Postgres nativo.
4. Pagina `client/src/pages/AdminCoachAnalytics.tsx` ganha nova secao "Tool usage" (abaixo das secoes existentes do Sprint 1):
   - Tabela com top 5 tools (sortable: calls, errorRate, avgLatencyMs).
   - Mini grafico Recharts LineChart com `byDay`.
   - Selector de janela: 1d, 7d, 30d, 90d.

**Criterio de aceitacao:**
- [ ] GET com auth admin retorna 200 + shape correto.
- [ ] GET com auth nao-admin retorna 403.
- [ ] GET com `days=0` ou `days=91` retorna 400.
- [ ] Pagina admin renderiza secao Tool usage com dados.
- [ ] Tests: shape da response, gate admin, p95 calculado corretamente em fixture.

## Requisitos Nao-Funcionais

- **Performance:**
  - Latencia primeiro chunk de texto em conversa **sem** tool call: nao regredir mais que +200ms vs Sprint 1 baseline.
  - Latencia handler de tool individual: p95 < 500ms para `query_dimension` e `find_top_leaks` (consultas em dados ja indexados).
  - Cache hit rate medio em sessao com 3+ mensagens: nao cair mais que 5 pontos percentuais vs Sprint 1.
- **Seguranca:**
  - Sanitize aplicada a todo `pageContext` (chave + valor) antes de injetar no prompt.
  - Tool result wrapped em `__type: 'ToolResult'` antes de enviar de volta ao LLM (defesa anti prompt injection via dados — se um nome de torneio contiver `<|im_start|>`, modelo trata como string de dado, nao como instrucao).
  - Tool input validado por Zod antes do handler (sem SQL injection — storage usa Drizzle parametrizado, mas validacao adicional em camada coach).
  - Tier `'free'` nao tem acesso a tools (zero exposicao).
  - Linhas `coach_actions` com `auditLevel='persist'` truncam result a 32KB (sem result blobs ilimitados no banco).
- **Custo:**
  - Tool result truncado a max 4000 tokens antes de continuation request ao LLM.
  - Limite de 5 tool calls por turn de usuario (anti-runaway).
- **Disponibilidade:**
  - Tool error em runtime nao bloqueia conversa: coach recebe tool_result com `is_error: true` e responde graceful em pt-BR.
  - Falha de db ao auditar (tabela `coach_actions`) nao bloqueia execucao da tool — log em stderr e prossegue.
- **Acessibilidade:**
  - `role="status"`, `aria-live="polite"` em todos os tool cards no chat.
  - Renderers usam componentes shadcn ja acessiveis.
- **Compatibilidade retro:**
  - 4157 testes Sprint 1 continuam green.
  - Mensagens sem `pageContext` continuam funcionando.
  - Conversas com tier free continuam funcionando (sem tools).

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| POST | `/api/coach/chat` | Chat handler existente — extender com `pageContext` (body) + tool use streaming | JWT |
| GET | `/api/admin/coach/tools-metrics?days=N` | Metricas agregadas de uso de tools | JWT + admin_full |

## Modelos de Dados Afetados

### `coach_actions` (nova tabela)

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | varchar | PK, gerado via nanoid | |
| `user_id` | varchar | FK -> users.id ON DELETE CASCADE, NOT NULL | Ownership |
| `chat_session_id` | varchar | NULL | FK soft (sessoes podem nao existir como tabela ainda) |
| `message_id` | varchar | NULL | id da mensagem do coach que gerou a tool call |
| `tool_use_id` | varchar | NULL | id retornado pela Anthropic |
| `tool_name` | varchar | NOT NULL | match com `CoachTool.name` |
| `status` | varchar | NOT NULL | 'pending' \| 'executing' \| 'completed' \| 'failed' \| 'undone' |
| `input` | jsonb | NULL | Params validados |
| `result` | jsonb | NULL | Output (so com auditLevel='persist'); truncado a 32KB |
| `error_message` | text | NULL | Preenchido com status='failed' |
| `payload_before` | jsonb | NULL | Estado antes (para undo futuro Sprint 2B+) — null neste sprint |
| `requires_confirmation` | boolean | DEFAULT false | False neste sprint (so read tools) |
| `latency_ms` | integer | NULL | Medido por toolRunner |
| `executed_at` | timestamp | NULL | Set pelo runner ao iniciar handler |
| `undone_at` | timestamp | NULL | Sprint 2B+ |
| `created_at` | timestamp | DEFAULT now() NOT NULL | |

**Indices:**
- `idx_coach_actions_session` em `(chat_session_id)` — agrupar tools por conversa.
- `idx_coach_actions_user_status` em `(user_id, status, created_at DESC)` — listar tools de um user.
- `idx_coach_actions_tool` em `(tool_name, status, created_at DESC)` — telemetria por tool.

## Integracoes Externas

| Servico | Proposito | Quando |
|---|---|---|
| Anthropic Messages API (existente) | Stream com `tools: [...]` parametro novo | Em todo POST `/api/coach/chat` para tier != free |

## Cenarios de Teste Derivados

### Happy Path
- [ ] Usuario em `/grade-planner` com `day=3` pergunta "qual meu ROI por site?" => coach reconhece pagina + chama `query_dimension(roi, site)` + responde com texto formatado citando "na sua grade de quarta-feira".
- [ ] Usuario em `/coach-ai` pergunta "quais meus maiores leaks?" => coach chama `find_top_leaks` => renderer leaks aparece inline => texto interpreta resultados.
- [ ] Multi-tool: "quais meus 3 leaks e quais torneios sugere pra hoje?" => 2 tools executadas no mesmo turn ou em turns encadeados, ambos cards renderizados.

### Validacao de Input
- [ ] POST chat com `pageContext: { route: 'foo' }` => 400 validation_failed.
- [ ] Tool input com schema violation => `executeTool` retorna `validation_failed`, handler nao chamado.
- [ ] `explain_tournament_score` com 0 IDs => validation_failed.
- [ ] `explain_tournament_score` com 2 IDs => validation_failed.
- [ ] `simulate_bankroll_scenario` com `lose_n_buyins` sem `buyInUSD` => validation_failed.
- [ ] `query_dimension` com `dimension: 'unknown'` => validation_failed.

### Regras de Negocio
- [ ] Tier free: payload Anthropic tem `tools: []`, conversa funciona.
- [ ] Tier pro/premium: `tools` populadas com 5 schemas.
- [ ] Limite 5 tools por turn: simular looping => no maximo 5 executadas, SSE `tool_limit_reached` emitido.
- [ ] Tool result com 50KB => truncado a 4000 tokens (~16KB) com flag `__truncated: true`.
- [ ] Sanitize: `pageContext.activeFilters.site = '<|im_start|>injection'` => valor injetado no prompt nao contem o token.
- [ ] Audit: cada execucao gera 1 linha em `coach_actions` com latencia + status.

### Edge Cases
- [ ] Usuario sem tournaments (zero data): `query_dimension` retorna rows: [] + `note: 'sem dados suficientes'`. Coach responde graceful.
- [ ] Usuario sem leaks: `find_top_leaks` retorna leaks: [] + note. Coach parabeniza usuario.
- [ ] `simulate_bankroll_scenario` com user sem `bankroll_amount` configurado => coach orienta a configurar.
- [ ] Tool handler throw exception => SSE `tool_completed` com `success: false`, linha em `coach_actions` com `status='failed'`, coach recebe is_error=true e responde "tive um problema ao consultar".
- [ ] Cache: usar `cache_control` continua funcionando com `tools: [...]` no payload (smoke).
- [ ] Falha do banco em audit: tool ainda executa, log em stderr.
- [ ] Trocar de pagina durante stream (corrida): pageContext do request original ja foi enviado, novo nao afeta esse turn.

### Page Context Especifico
- [ ] `/grade-planner` com `day` undefined => secao no prompt nao tem linha "Dia" (so chaves preenchidas).
- [ ] `/grind-live` sem sessao => contexto emitido com `activeSessionId: undefined` => secao no prompt simples.
- [ ] Navegar de `/dashboard` para `/coach-ai`: pageContext sai de dashboard-shape e entra em coach-ai-shape.

### Frontend
- [ ] CoachToolCard com 5 tools renderiza renderer correto para cada.
- [ ] Tool desconhecida (nome nao mapeado) => `RawJsonRenderer` fallback.
- [ ] Estado streaming-input -> executing -> completed: transicoes sem layout shift.
- [ ] Estado failed: card vermelho com mensagem amigavel pt-BR.
- [ ] aria-live="polite" presente.

### Telemetria Admin
- [ ] GET `/api/admin/coach/tools-metrics?days=7` com auth admin => 200 + shape correto.
- [ ] GET sem permissao admin => 403.
- [ ] GET com `days=0` => 400.
- [ ] p95 calculado corretamente em fixture com latencias [10, 20, 30, 40, 50, 60, 70, 80, 90, 1000] => p95 ~ 1000.
- [ ] Pagina AdminCoachAnalytics renderiza secao "Tool usage".

## Fora de Escopo

- **Mutacoes:** nenhuma tool deste sprint modifica estado. Tools como `register_tournament_in_grade`, `start_grind_session`, `update_bankroll_rule` ficam para Sprint 2B.
- **Confirmation flow UI:** `requiresConfirmation: true` definido no registry mas nao testado neste sprint (todas as tools sao read).
- **Undo manual:** campo `undone_at` existe no schema mas nao tem fluxo nem UI.
- **Multimodal:** sem suporte a screenshot, audio, video. Sprint Coach v2 Pacote 8.
- **Voz:** nao ha STT/TTS.
- **Hand history parser tool:** Sprint 2C+.
- **Coach proativo / autonomo:** Nivel C — sprints futuros.
- **Page context em paginas alem das 4 instrumentadas:** outras paginas continuam sem contexto neste sprint.
- **Command palette / shortcuts:** nao introduzidos.
- **Persistencia de chat sessions como tabela formal:** `chat_session_id` e string solto neste sprint, sem FK.
- **Render rich diff/comparativos visuais entre sugestoes:** renderers sao minimos.
- **Streaming de tool input parcial visivel ao usuario com texto rico:** `tool_use_input_delta` so emitido para spinner; nao ha render parcial do JSON.

## Dependencias

- **Sprint Coach-1 (entregue):** rate limit tiered, gate por plano, prompt caching, sanitize.
- **Sprint Tournament Selector Sprint 1 (entregue):** `server/scoring/tournamentScorer.ts` necessario para `get_tournament_suggestions` e `explain_tournament_score`.
- **Spec Bankroll Management (em progresso):** `bankroll_amount` + `bankroll_rule` no schema do user. Se ainda nao implementado, `simulate_bankroll_scenario` retorna note "configure bankroll antes".
- **Detector de leaks (entregue):** `server/coachLeakDetection.ts` necessario para `find_top_leaks`.
- **Storage analytics (entregue):** `getDashboardStats`, `getAnalyticsBy*` funcoes existentes para `query_dimension`.
- **Anthropic SDK (instalado):** versao deve suportar tool use API. Verificar `@anthropic-ai/sdk` >= 0.30.

## Notas de Implementacao (sugestoes para Implementer)

- **Plano de rollout sugerido (sub-sprints internos):**
  1. **RF-01 standalone:** Page Context end-to-end (frontend hook + provider + backend Zod + sanitize + injection no prompt). Mergeavel sem nada mais. Garante valor imediato.
  2. **RF-02 + RF-03 + RF-04:** Tools infra + 5 read tools + integracao streaming. Internamente divisivel: registry + 1 tool minima primeiro, depois as outras 4.
  3. **RF-05:** Frontend rendering. Pode ser desenvolvido em paralelo com RF-04 (mock SSE).
  4. **RF-06:** Instrumentar 4 paginas (depende de RF-01 base).
  5. **RF-07:** Admin metrics (depende de RF-02 + RF-03).
- **Schema `coach_actions`:** adicionar em `shared/schema.ts` seguindo padrao das outras tabelas (varchar PK, indices, tipo `pgTable`). Migracao via `npm run db:push`.
- **Tool registry:** preferir registro explicito em `server/coachTools/index.ts` com import statico — evita surpresas de tree-shaking.
- **Sanitize de pageContext:** aplicar recursivamente (key + value), nao so top-level.
- **Anthropic tool schema format:** seguir docs oficiais — input_schema deve ser JSONSchema valido (zod-to-json-schema).
- **Continuation loop:** cuidar para nao acumular tool_result blocks indefinidamente em memoria — cada turn de tool tem ate 5 results.
- **Cache de tools:** Anthropic suporta cache_control em tools array. Avaliar adicionar para reduzir custo (Sprint 1 mostrou ganho).
- **Idempotencia:** se Anthropic emite mesmo tool_use_id duas vezes (rede), runner deve detectar via lookup em coach_actions e retornar resultado anterior. Nao critico mas defensivo.

## Manual Steps Pos-Implementacao

1. **Schema migration:**
   ```bash
   npm run db:push
   ```
   Confirmar que `coach_actions` foi criada e os 3 indices presentes.

2. **Env vars:** nenhuma variavel nova obrigatoria neste sprint. Reutiliza `ANTHROPIC_API_KEY` existente.

3. **Smoke test manual (sequencia minima):**
   - [ ] Logar como user pro/premium. Ir em `/dashboard`. Abrir coach. Perguntar "qual meu ROI por site nos ultimos 30 dias?". Verificar:
     - [ ] Card de tool aparece inline.
     - [ ] Renderer `query_dimension` mostra tabela.
     - [ ] Resposta texto cita o resultado.
   - [ ] Ir em `/grade-planner`, selecionar quarta-feira. Perguntar "qual dia voce esta vendo?". Resposta menciona quarta sem ter sido informada.
   - [ ] Perguntar "quais meus 3 maiores leaks e que torneios voce sugere pra hoje?". Verificar:
     - [ ] 2 tool cards aparecem (find_top_leaks + get_tournament_suggestions).
     - [ ] Resposta integra ambos.
   - [ ] Logar como user free. Abrir coach. Verificar:
     - [ ] Mesma pergunta nao dispara tool (resposta vem so com base no bloco estatico).
   - [ ] Logar como admin. Ir em `/admin/coach`. Verificar secao "Tool usage" com dados das execucoes anteriores.

4. **Validar regressao:**
   ```bash
   npm test
   ```
   - [ ] Os 4157+ testes do Sprint 1 continuam green.
   - [ ] Novos testes deste sprint adicionados e green.

5. **Validar performance:**
   - [ ] Comparar latencia primeiro chunk em sessao tipica vs baseline Sprint 1. Aceitar regressao ate +200ms.
   - [ ] Medir cache hit rate em 10 sessoes de teste. Verificar queda < 5pp.

6. **Verificar logs:**
   - [ ] Apos algumas conversas com tools, query manual: `SELECT tool_name, COUNT(*), AVG(latency_ms) FROM coach_actions GROUP BY tool_name;`. Verificar que esta capturando.

## Resumo de Entregaveis Tecnicos

- **Backend:** `server/coachTools/registry.ts`, `server/coachTools/index.ts`, `server/coachToolRunner.ts`, `server/coachTools/handlers/{queryDimension,findTopLeaks,getTournamentSuggestions,explainTournamentScore,bankroll}.ts`, atualizacao `server/routes/coach.ts` (tool use streaming), atualizacao `server/coachContext.ts` (pageContext schema + injection), novo endpoint admin em `server/routes/admin.ts`, atualizacao `shared/schema.ts` (`coach_actions`).
- **Frontend:** `client/src/contexts/CoachPageContext.tsx`, `client/src/hooks/useCoachPageContext.ts`, `client/src/hooks/useCoachToolEvents.ts`, `client/src/components/coach/CoachToolCard.tsx` (+ 5 renderers), instrumentacao em `GradePlanner.tsx`, `GrindSessionLive.tsx`, `Dashboard.tsx`, `CoachAI.tsx`, atualizacao `AdminCoachAnalytics.tsx` (secao Tool usage).
- **Tests:** ~50 novos testes cobrindo RF-01 (8) + RF-02 (10) + RF-03 (15) + RF-04 (8) + RF-05 (8) + RF-06 (5) + RF-07 (4).
