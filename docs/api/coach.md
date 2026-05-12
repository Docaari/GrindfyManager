# Coach IA — API Endpoints (Sprints Coach-1 + Coach-2A + AI-0A + AI-0B)

Documentacao dos endpoints afetados pelos sprints:
- **Coach-1** (`docs/specs/coach-sprint-1-fundacao-economica.md`) — fundacao economica + UX (entregue).
- **Coach-2A** (`docs/specs/coach-sprint-2a-page-context-and-tools.md`) — page context + read tools (entregue).
- **AI-0A** (`Docs/specs/sprint-ai-0a.md`) — 17 tools religadas no registry + citations/confidence reforcados (entregue — ADR-145/146/147).
- **AI-0B** (`Docs/specs/sprint-ai-0b.md`) — **consolidacao Grindfy AI (agente unico)** + page context plugado de fato + 5 rotas novas + hub `/coach-ai` + tier gate ajustado (ADR-148/149/150). Ver bloco "## Sprint AI-0B" abaixo.

Endpoints nao listados aqui (`/api/coach/sessions`, `/api/coach/profile`, `/api/coach/monthly-summaries`, `/api/coach/sessions/:id/archive`, `/api/coach/sessions/:id` DELETE) permanecem inalterados (continuam aceitando `coachType` como parametro — back-compat, "lente inicial").

Para a documentacao detalhada de cada tool (input schema, output, exemplos), ver: **[coach-tools.md](./coach-tools.md)**.

---

## Sprint AI-0B — o que muda (resumo; detalhe nos ADRs 148/149/150)

> **Agente unico "Grindfy AI" — supersedes a separacao de personas Mental/Tournament/Technical (ADR-148).**
> - `POST /api/coach/chat` deixa de selecionar 1 de 3 system prompts — ha **um base unico** (`GRINDFY_AI_BASE`); contexto **completo** (o agente ve tudo: dashboard stats, leaks, weekly plan, study progress, sessao ativa, break feedbacks, page context — sem gate por `coachType`); tools (17, Pro+) para o detalhe sob demanda.
> - **`coachType` (mental | tournament | technical) continua no body** (validado contra `VALID_COACH_TYPES` — `400` se invalido/ausente), em `chat_sessions.coach_type` e `coach_conversations.coach_type` — **back-compat, zero migracao**. Papel novo: **"lente inicial"** — uma unica linha no bloco DINAMICO do system prompt ("o jogador abriu o chat com foco em X; comece por ai, mas pode falar de qualquer assunto"). Nao gateia contexto nem acesso.
> - **`pageContext` passa a FUNCIONAR de fato** (ADR-149) — a infra existia (schema Zod + sanitizer + formatter em `coachPageContext.ts`) mas o route handler nunca lia `req.body.pageContext` e o frontend nunca enviava. Agora `handleCoachChat` le `req.body.pageContext`, valida via `sanitizePageContext` (`400 { error: 'validation_failed', field: 'pageContext' }` se invalido), e injeta no bloco DINAMICO. O frontend envia via o hook novo `useCoachPageContext`.
> - **`pageContext` ganha 10 variantes** (5 originais + 5 novas): `grade-planner`, `grind-live`, `dashboard`, `coach-ai`, `cooldown-log` + **`bankroll`, `estudos`, `stats`, `biblioteca`, `upload`**. Todas `.strict()`, campos opcionais, max-length em strings, enums fechados, ranges plausiveis. Principio: **inspecao leve (counts/IDs/abas/filtros/datas) — NUNCA valores monetarios, notas livres, conteudo de lesson; os numeros vem das tools.**
> - **Tier gate ajustado (ADR-148 §2.5)** — **acaba o `403 tier_locked` por coach.** Todos os tiers (`free`/`pro`/`premium`/`admin`) acessam o Grindfy AI. O gate vira **so rate limit** (10/50/200/∞ msg/24h — inalterado) + **tools** (`free` → sem tools / `exportToolsForAnthropic('free') === []`; Pro+ → 17 tools — inalterado). `canAccessCoach` removida/trivializada. `UpgradeCoachModal` reproposito → "ferramentas avancadas / mais mensagens no Pro" (sem "coach X bloqueado").
> - **Hub `/coach-ai` (ADR-150)** — vira tabs URL-persisted `?tab=chat|reports|audit|prefs` (default `chat`): Chat (agente unico + chips de lente + page context `{ route: 'coach-ai', activeCoachType }`), Relatorios e avisos (EmptyState — esqueleto; `GET /api/coach/reports` e Fase 1), Historico de acoes (consome `GET /api/coach/audit` — endpoint existente), Preferencias (consome `GET/PUT /api/coach/preferences` — endpoint existente; 8 toggles de nudge + quiet hours + caps).
> - **Zero endpoint novo. Zero migracao de schema.** Endpoints futuros so anotados: `GET /api/coach/reports`, `GET /api/coach/reports/:id` (Fase 1 AI-1B).
>
> **Status: ENTREGUE (Sprint AI-0B).** As secoes detalhadas abaixo foram atualizadas: nao ha mais `403 tier_locked` em `POST /api/coach/chat` (RF-06); `pageContext` tem 10 variantes (5 originais + `bankroll`/`estudos`/`stats`/`biblioteca`/`upload`); o agente eh unico (`GRINDFY_AI_BASE`) com `coachType` como lente inicial; Pro+ recebe 17 tools (pos-AI-0A). O bloco "## Sprint AI-0B" acima continua sendo o resumo canonico.

---

## POST /api/coach/chat

**Descricao:** Envia mensagem ao Grindfy AI (agente unico) e recebe resposta via SSE streaming. Aplica prompt caching (ADR-019), rate limit tiered por plano (ADR-020) e (Sprint AI-0B) page context plugado de fato + tools (17, Pro+).

**Auth:** JWT obrigatorio.

**Modificacoes Sprint Coach-1:**
- Novos headers de resposta `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (em 200 e 429).
- Resposta 429 tiered (10/50/200 msg/dia conforme plano).
- Grava `usage` (cache_read/creation/input/output tokens) em `chat_messages`.

**Modificacoes Sprint Coach-2A / AI-0A:**
- Campo opcional `pageContext` no body (validado por Zod discriminated union — ADR-025).
- Stream SSE emite 6 event types relacionados a tool use (ver "Stream SSE format" abaixo).
- Tier `'free'` sem tools (`tools: []` na chamada Anthropic). Pro/premium/admin recebem 17 tools (pos-AI-0A).
- Tool calls auditadas em `coach_actions` / `coach_nudge_log` (ADR-023).
- Limite hard de 5 tool calls por turn de usuario (ADR-026).

**Modificacoes Sprint AI-0B (ADR-148/149/150):**
- `coachType` deixa de selecionar 1 de 3 system prompts — base unico `GRINDFY_AI_BASE`; contexto completo (sem gate por `coachType`). `coachType` continua no body (validado contra `VALID_COACH_TYPES` — `400` se invalido/ausente) mas vira **"lente inicial"** (uma linha no bloco DINAMICO do system prompt).
- **Nao ha mais `403 tier_locked` por coach** — todo tier autenticado acessa o Grindfy AI; o tier so afeta rate limit (429) + tools (`free` → `[]`).
- `pageContext` ganha 5 variantes novas (`bankroll`, `estudos`, `stats`, `biblioteca`, `upload`) — total 10. Validado/sanitizado por `sanitizePageContext`; invalido → `400 { error: 'validation_failed', field: 'pageContext' }`.

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| coachType | string | body | Sim | `'mental'` \| `'tournament'` \| `'technical'` |
| message | string | body | Sim | 1-2000 chars |
| sessionId | string | body | Nao | Se omitido, cria nova sessao (arquiva anterior) |
| pageContext | object | body | Nao | Sprint Coach-2A. Validado por discriminated union em `route`. Ver shapes abaixo. |

**Shapes validos de `pageContext` (ADR-025 + ADR-149) — 10 variantes (discriminated union por `route`, todas `.strict()`):**

```ts
// --- 5 originais (Coach-2A + Cooldown-3) ---
// /grade-planner
{ route: 'grade-planner', day?: 0..6, profile?: 'A'|'B'|'C',
  activeFilters?: { site?: string, category?: string, speed?: string },
  focusedTournamentId?: string }

// /grind-live
{ route: 'grind-live', activeSessionId?: string,
  sessionStatus?: 'active'|'paused'|'completed'|'archived',
  registeredTournamentsCount?: number, currentProfit?: number }

// /dashboard
{ route: 'dashboard',
  dateRange?: '7d'|'30d'|'60d'|'90d'|'all',
  activeFilters?: { site?: string, category?: string, speed?: string } }

// /coach-ai
{ route: 'coach-ai', activeCoachType?: 'mental'|'tournament'|'technical' }

// /cooldown-log (ADR-043) — ver schema completo em server/coachPageContext.ts

// --- 5 novas (Sprint AI-0B / ADR-149) — inspecao leve, NUNCA valores monetarios/notas/conteudo ---
// /bankroll  (activeTab = keys reais do WalletActivityPanel)
{ route: 'bankroll', walletsCount?: number(0..50), selectedWalletId?: string(<=50),
  activeTab?: 'results'|'movements',
  dateRange?: '7d'|'30d'|'60d'|'90d'|'all' }

// /estudos  (activeTab = ViewKey real de Studies.tsx)
{ route: 'estudos', activeTab?: 'dashboard'|'temas'|'tema-detail'|'stats'|'spots'|'recomendacoes'|'reentry',
  activeThemesCount?: number(0..100), spotsDueCount?: number(0..500),
  studyStreakDays?: number(0..3650), focusedThemeId?: string(<=50) }

// /stats
{ route: 'stats', hasSnapshot?: boolean, latestSnapshotId?: string(<=50),
  latestSnapshotStatsCount?: number(0..500), compareMode?: boolean,
  selectedStatGroup?: string(<=50) }

// /biblioteca
{ route: 'biblioteca', view?: 'catalogo'|'curso'|'lesson',
  courseSlug?: string(<=100), lessonSlug?: string(<=100),
  filterSites?: string[](<=20, each <=50), filterDaysOfWeek?: number[](<=7, each 0..6) }

// /upload
{ route: 'upload', lastImportAt?: string(<=50)|null, lastImportNetwork?: string(<=50),
  lastImportTournamentsCount?: number(0..100000), daysSinceLastImport?: number(0..3650),
  pendingFile?: boolean }
```

`pageContext` ausente => request prossegue sem secao "Contexto da pagina atual" no system prompt.
`pageContext` com `route` desconhecido OU campo extra (`.strict()`) OU tipo/range invalido => HTTP 400 `{ error: 'validation_failed', field: 'pageContext' }`.
`pageContext` com strings contendo tokens de injection (`ignore previous instructions`, `<|im_start|>`, etc.) => `sanitizePageContext` substitui por `[redacted]` ANTES da injecao no prompt; request prossegue.

**Body exemplo (Sprint Coach-2A):**
```json
{
  "coachType": "tournament",
  "message": "qual meu ROI por site nos ultimos 30 dias?",
  "sessionId": "abc123",
  "pageContext": {
    "route": "grade-planner",
    "day": 3,
    "profile": "A",
    "activeFilters": { "site": "PokerStars" }
  }
}
```

**Headers de resposta (todas respostas exceto 401):**
| Header | Valor | Notas |
|---|---|---|
| `X-RateLimit-Limit` | `10` \| `50` \| `200` \| `unlimited` | Limite diario do plano |
| `X-RateLimit-Remaining` | integer \| `unlimited` | Restante na janela |
| `X-RateLimit-Reset` | ISO 8601 string \| omitted | createdAt da msg mais antiga na janela + 24h |

**Respostas:**

| Status | Quando | Body exemplo |
|---|---|---|
| 200 | Stream SSE iniciado | `text/event-stream` chunks |
| 400 | Input invalido (`coachType` invalido/ausente, `message` invalida, `pageContext` invalido) | `{"message": "coachType invalido"}` ou `{"error": "validation_failed", "field": "pageContext"}` |
| 401 | Sem auth | `{"message": "Nao autenticado"}` |
| 404 | sessionId nao existe | `{"message": "Sessao nao encontrada"}` |
| 409 | N/A nesta rota | — |
| 429 | Limite diario atingido (rate limit por tier) | `{"code": "rate_limited", "limit": 10, "used": 10, "currentPlan": "free", "upgradeTo": "pro", "resetAt": "2026-04-25T14:30:00Z"}` |

**Sprint AI-0B (ADR-148 / RF-06):** **nao ha mais `403 tier_locked` por `coachType`.** A consolidacao no agente unico "Grindfy AI" elimina o gate por coach — todo tier autenticado tem acesso. O unico bloqueio de uso eh o `429` (rate limit por tier: 10/50/200/∞ msg/24h) — o body do `429` traz `upgradeTo` (`free`→`pro`, `pro`→`premium`) para a UI sugerir upgrade (mais mensagens + tools).

**Bypass admin:** `req.user.role === 'admin'` OU `req.user.subscriptionPlan === 'admin'` resolve tier `admin` → rate limit `unlimited`. Headers retornam `X-RateLimit-Limit: unlimited`.

**Stream SSE format (200) — Sprint Coach-1 baseline:**
```
data: {"type":"chunk","content":"Entendo que voce..."}
data: {"type":"chunk","content":" esta frustrado."}
...
data: {"type":"done","messageId":"msg_xyz","sessionId":"abc123","usage":{"input_tokens":120,"output_tokens":380,"cache_read_input_tokens":1100,"cache_creation_input_tokens":0}}
```

**Stream SSE format (Sprint Coach-2A — eventos novos de tool use):**

Quando o LLM emite `tool_use` durante o stream, o backend emite os seguintes eventos intercalados aos `chunk` de texto:

| Event type | Quando | Payload |
|---|---|---|
| `tool_use_start` | LLM iniciou um content_block do tipo tool_use | `{type, toolUseId, toolName}` |
| `tool_use_input_delta` | input_json_delta acumulando | `{type, toolUseId, partial}` |
| `tool_use_input_done` | content_block_stop do tool_use; input final parseado | `{type, toolUseId, input}` (input ja como objeto JSON) |
| `tool_executing` | backend acabou de chamar `executeTool()` | `{type, toolUseId}` |
| `tool_completed` | tool retornou (sucesso ou falha) | `{type, toolUseId, success, result?, error?}` (result truncado a ~2000 chars para UI) |
| `tool_limit_reached` | tentativa da 6a tool no mesmo turn (ADR-026) | `{type, limit: 5}` |

Exemplo de stream com 1 tool call bem-sucedida:
```
data: {"type":"chunk","content":"Vou consultar"}
data: {"type":"chunk","content":" seu ROI por site."}
data: {"type":"tool_use_start","toolUseId":"tu_01abc","toolName":"query_dimension"}
data: {"type":"tool_use_input_delta","toolUseId":"tu_01abc","partial":"{\"dimens"}
data: {"type":"tool_use_input_delta","toolUseId":"tu_01abc","partial":"ion\":\"roi\""}
data: {"type":"tool_use_input_done","toolUseId":"tu_01abc","input":{"dimension":"roi","groupBy":"site","period":"30d"}}
data: {"type":"tool_executing","toolUseId":"tu_01abc"}
data: {"type":"tool_completed","toolUseId":"tu_01abc","success":true,"result":{"__type":"ToolResult","tool":"query_dimension","ok":true,"data":{"rows":[...]}}}
data: {"type":"chunk","content":"\n\nSeu ROI agregado..."}
data: {"type":"done","messageId":"msg_xyz","sessionId":"abc123","usage":{...}}
```

Exemplo de stream com tool error:
```
data: {"type":"tool_use_start","toolUseId":"tu_02xyz","toolName":"simulate_bankroll_scenario"}
data: {"type":"tool_use_input_done","toolUseId":"tu_02xyz","input":{"scenario":"lose_n_buyins","value":5}}
data: {"type":"tool_executing","toolUseId":"tu_02xyz"}
data: {"type":"tool_completed","toolUseId":"tu_02xyz","success":false,"error":"validation_failed"}
data: {"type":"chunk","content":"Tive um problema ao simular..."}
data: {"type":"done","messageId":"msg_xyz",...}
```

Exemplo de stream batendo tool limit:
```
data: {"type":"tool_completed","toolUseId":"tu_05","success":true,...}
data: {"type":"tool_limit_reached","limit":5}
data: {"type":"chunk","content":"\n\nResumindo o que ja consultei..."}
data: {"type":"done","messageId":"msg_xyz",...}
```

**Exemplo de persistencia em `chat_messages`:**
- Primeira msg da sessao: `cache_creation_input_tokens > 0`, `cache_read_input_tokens = 0`.
- Segunda msg em <5 min: `cache_creation_input_tokens = 0`, `cache_read_input_tokens > 0` (hit).

**Exemplo de persistencia em `coach_actions` (Sprint Coach-2A):**
- 1 linha por tool executada no turn.
- `status='completed'` com `latency_ms > 0` em sucesso.
- `status='failed'` com `error_message` preenchido em erro de handler/validacao.
- `auditLevel='log'` (todas tools deste sprint) => `result IS NULL`; so input + status + latency.
- Tools nao executadas por bater limite (ADR-026) NAO geram linha (foram abortadas antes do `executeTool`).

---

## POST /api/coach/messages/:id/feedback

**Descricao:** Registra thumbs up/down em mensagem de assistant. Ownership via `chat_sessions.user_id === req.user.userPlatformId`. Cada usuario so pode ter 1 feedback por mensagem (UNIQUE constraint).

**Auth:** JWT obrigatorio.

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| id | string | URL path | Sim | `chat_messages.id` |
| feedback | string | body | Sim | `'up'` \| `'down'` |
| comment | string \| null | body | Nao | Max 500 chars (Zod validated) |

**Body exemplo:**
```json
{
  "feedback": "down",
  "comment": "Alucinou sobre meu ROI em Turbos — disse +12% mas meu dashboard mostra +3%"
}
```

**Respostas:**

| Status | Quando | Body exemplo |
|---|---|---|
| 201 | Feedback criado | `{"id":"fb_xyz","messageId":"msg_xyz","feedback":"down","comment":"...","createdAt":"2026-04-24T18:32:00Z"}` |
| 400 | Body invalido (feedback != 'up'\|'down', comment > 500) | `{"message":"Feedback invalido"}` |
| 400 | Mensagem com `role='user'` (proibido) | `{"message":"Nao e possivel dar feedback em mensagem do usuario"}` |
| 401 | Sem auth | `{"message":"Nao autenticado"}` |
| 403 | Mensagem de outro usuario | `{"message":"Acesso negado"}` |
| 404 | Mensagem nao existe | `{"message":"Mensagem nao encontrada"}` |
| 409 | Feedback duplicado (UNIQUE violado) | `{"message":"Feedback ja existe. Use DELETE antes de enviar novo."}` |

**Para trocar voto (up -> down):** DELETE seguido de POST. Sem update in-place (simplifica integridade + telemetria).

---

## DELETE /api/coach/messages/:id/feedback

**Descricao:** Remove feedback do usuario atual na mensagem. Se nao existir, retorna 404.

**Auth:** JWT obrigatorio.

**Request:**
| Param | Tipo | Onde | Obrigatorio |
|---|---|---|---|
| id | string | URL path | Sim |

**Respostas:**

| Status | Quando | Body exemplo |
|---|---|---|
| 200 | Feedback removido | `{"deleted": true}` |
| 401 | Sem auth | `{"message":"Nao autenticado"}` |
| 404 | Nao existia feedback do usuario nessa msg | `{"message":"Feedback nao encontrado"}` |

---

## GET /api/coach/limits

**Descricao:** Retorna estado atual de rate limit + lista de coaches acessiveis para o plano do usuario autenticado.

**Auth:** JWT obrigatorio.

**Request:** sem parametros.

**Respostas:**

| Status | Quando | Body exemplo |
|---|---|---|
| 200 | OK | Ver exemplos abaixo |
| 401 | Sem auth | `{"message":"Nao autenticado"}` |

**Body response shape:**
```ts
{
  plan: 'free' | 'pro' | 'premium' | 'admin',
  dailyLimit: number | 'unlimited',
  messagesUsedToday: number,
  messagesRemaining: number | 'unlimited',
  resetAt: string | null,  // ISO 8601; null para admin ou se nao ha msgs na janela
  // Sprint AI-0B (RF-06): nao ha mais gate por coach — as 3 "lentes" estao
  // sempre todas disponiveis para todo tier (campo mantido por back-compat de UI).
  accessibleCoaches: Array<'mental' | 'tournament' | 'technical'>
}
```

**Exemplo Free com 3 msgs usadas:**
```json
{
  "plan": "free",
  "dailyLimit": 10,
  "messagesUsedToday": 3,
  "messagesRemaining": 7,
  "resetAt": "2026-04-25T14:30:00Z",
  "accessibleCoaches": ["mental", "tournament", "technical"]
}
```

**Exemplo Pro sem msgs (primeira sessao do dia):**
```json
{
  "plan": "pro",
  "dailyLimit": 50,
  "messagesUsedToday": 0,
  "messagesRemaining": 50,
  "resetAt": null,
  "accessibleCoaches": ["mental", "tournament", "technical"]
}
```

**Exemplo Admin:**
```json
{
  "plan": "admin",
  "dailyLimit": "unlimited",
  "messagesUsedToday": 42,
  "messagesRemaining": "unlimited",
  "resetAt": null,
  "accessibleCoaches": ["mental", "tournament", "technical"]
}
```

**Performance:** < 100ms P95.

---

## GET /api/admin/coach/feedback-stats

**Descricao:** Dashboard admin de qualidade do Coach. Agrega feedback (up/down) por coach type + semana, e lista as top 20 mensagens com `feedback='down'` recentes para curadoria de prompts.

**Auth:** JWT obrigatorio + `req.user.role === 'admin'`.

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| coachType | string | query | Nao | `'mental'` \| `'tournament'` \| `'technical'`. Default: todos. |
| weeks | integer | query | Nao | Quantas semanas no weeklyRate. Default: 8. |

**Respostas:**

| Status | Quando | Body exemplo |
|---|---|---|
| 200 | OK | Ver abaixo |
| 401 | Sem auth | `{"message":"Nao autenticado"}` |
| 403 | Nao-admin | `{"message":"Acesso negado"}` |

**Body response shape:**
```ts
{
  globalCounts: {
    mental: {up: number, down: number},
    tournament: {up: number, down: number},
    technical: {up: number, down: number}
  },
  weeklyRate: Array<{
    week: string,         // ISO date (Monday)
    coachType: 'mental' | 'tournament' | 'technical',
    up: number,
    total: number,        // up + down (denominador)
    upRate: number        // up / total (0-1)
  }>,
  topDownMessages: Array<{
    id: string,                    // message_feedback.id
    messageId: string,             // chat_messages.id
    userId: string,                // user_platform_id
    coachType: string,
    sessionId: string,
    contentPreview: string,        // chat_messages.content truncado 500
    comment: string | null,        // feedback_comment
    createdAt: string              // ISO
  }>
}
```

**Exemplo:**
```json
{
  "globalCounts": {
    "mental": {"up": 142, "down": 18},
    "tournament": {"up": 89, "down": 22},
    "technical": {"up": 31, "down": 9}
  },
  "weeklyRate": [
    {"week": "2026-04-21", "coachType": "mental", "up": 22, "total": 24, "upRate": 0.917},
    {"week": "2026-04-14", "coachType": "mental", "up": 18, "total": 21, "upRate": 0.857}
  ],
  "topDownMessages": [
    {
      "id": "fb_abc",
      "messageId": "msg_xyz",
      "userId": "USER-0042",
      "coachType": "tournament",
      "sessionId": "sess_123",
      "contentPreview": "Seu ROI em Hypers esta +15%...",
      "comment": "Numero nao bate com meu dashboard",
      "createdAt": "2026-04-24T18:32:00Z"
    }
  ]
}
```

**Performance:** < 500ms P95 com 100k mensagens (indice `(feedback, created_at DESC)`).

---

## GET /api/admin/coach/tools-metrics (Sprint Coach-2A — RF-07)

**Descricao:** Metricas agregadas de uso de tools do Coach v2: total de chamadas, sessoes que usaram tools, breakdown por tool (calls, error rate, latencia avg, latencia p95) e serie temporal por dia. Alimenta secao "Tool usage" da pagina admin `AdminCoachAnalytics`.

**Auth:** JWT obrigatorio + `requirePermission('admin_full')`.

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| days | integer | query | Nao | 1..90, default 7. Janela de agregacao. |

**Respostas:**

| Status | Quando | Body exemplo |
|---|---|---|
| 200 | OK | Ver abaixo |
| 400 | `days` < 1 ou > 90 | `{"message":"days deve estar entre 1 e 90"}` |
| 401 | Sem auth | `{"message":"Nao autenticado"}` |
| 403 | Sem permissao admin_full | `{"message":"Acesso negado"}` |

**Body response shape:**
```ts
{
  totalCalls: number,             // soma de linhas em coach_actions na janela
  totalToolUseSessions: number,   // distinct chat_session_id com >= 1 tool na janela
  byTool: Array<{
    name: string,
    calls: number,
    errorRate: number,            // 0..1, status='failed' / total
    avgLatencyMs: number,
    p95LatencyMs: number          // percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
  }>,
  byDay: Array<{
    date: string,                 // YYYY-MM-DD
    calls: number,
    errors: number
  }>
}
```

**Exemplo:**
```json
{
  "totalCalls": 1247,
  "totalToolUseSessions": 312,
  "byTool": [
    { "name": "query_dimension",        "calls": 624, "errorRate": 0.012, "avgLatencyMs": 145, "p95LatencyMs": 320 },
    { "name": "find_top_leaks",         "calls": 318, "errorRate": 0.003, "avgLatencyMs": 220, "p95LatencyMs": 480 },
    { "name": "get_tournament_suggestions", "calls": 201, "errorRate": 0.020, "avgLatencyMs": 310, "p95LatencyMs": 590 },
    { "name": "explain_tournament_score",   "calls": 76, "errorRate": 0.013, "avgLatencyMs": 180, "p95LatencyMs": 420 },
    { "name": "simulate_bankroll_scenario", "calls": 28, "errorRate": 0.000, "avgLatencyMs": 95,  "p95LatencyMs": 210 }
  ],
  "byDay": [
    { "date": "2026-04-23", "calls": 187, "errors": 3 },
    { "date": "2026-04-22", "calls": 204, "errors": 5 },
    { "date": "2026-04-21", "calls": 178, "errors": 2 }
  ]
}
```

**Performance:** < 500ms P95 com 1M linhas em `coach_actions` (indices `idx_coach_actions_tool` + `idx_coach_actions_user_status`).

---

## Modelo de Dados Afetado

### Tabela `chat_messages` — colunas novas (Sprint Coach-1)

| Coluna | Tipo | Constraints | Proposito |
|---|---|---|---|
| `input_tokens` | integer | nullable | Tokens de input regulares (fora do cache) |
| `output_tokens` | integer | nullable | Tokens de output do modelo |
| `cache_creation_input_tokens` | integer | nullable | Tokens escritos no cache (+25% custo, 1a msg) |
| `cache_read_input_tokens` | integer | nullable | Tokens lidos do cache (-90% custo, 2a+) |
| `model` | varchar(64) | nullable | Modelo usado (ex: `claude-sonnet-4-6`) |
| `latency_ms` | integer | nullable | Latencia total do stream (null em user msgs) |
| `feedback` | varchar(10) | nullable | Desnormalizacao de `message_feedback.feedback` |
| `feedback_comment` | text | nullable | Desnormalizacao, max 500 via Zod |

**Indices novos:**
- `idx_chat_messages_session_created (session_id, created_at)`
- `idx_chat_messages_role_created (role, created_at)` — para rate limit rolling 24h

### Tabela `coach_actions` — NOVA (Sprint Coach-2A)

| Coluna | Tipo | Constraints | Proposito |
|---|---|---|---|
| `id` | varchar | PK, nanoid | |
| `user_id` | varchar | FK users.id ON DELETE CASCADE, NOT NULL | Ownership |
| `chat_session_id` | varchar | nullable | FK soft para `chat_sessions.id` (nao enforced) |
| `message_id` | varchar | nullable | id da `chat_messages` que disparou a tool |
| `tool_use_id` | varchar | nullable | id retornado pela Anthropic Tool Use API |
| `tool_name` | varchar | NOT NULL | match com `CoachTool.name` (ADR-023) |
| `status` | varchar | NOT NULL | `pending` \| `executing` \| `completed` \| `failed` \| `undone` |
| `input` | jsonb | nullable | params validados pelo Zod schema da tool |
| `result` | jsonb | nullable | output ja wrapped (ADR-024); truncado a 32KB; so com `auditLevel='persist'` |
| `error_message` | text | nullable | preenchido com `status='failed'` |
| `payload_before` | jsonb | nullable | estado antes (Sprint 2B+ undo); null neste sprint |
| `requires_confirmation` | boolean | DEFAULT false | sempre false em read tools (Sprint 2A) |
| `latency_ms` | integer | nullable | medido por `coachToolRunner` via `performance.now()` |
| `executed_at` | timestamp | nullable | set ao iniciar handler |
| `undone_at` | timestamp | nullable | Sprint 2B+ |
| `created_at` | timestamp | DEFAULT now() NOT NULL | |

**Indices:**
- `idx_coach_actions_session (chat_session_id)` — agrupar tools por conversa.
- `idx_coach_actions_user_status (user_id, status, created_at DESC)` — listar tools de um user.
- `idx_coach_actions_tool (tool_name, status, created_at DESC)` — telemetria por tool (RF-07).

### Tabela `message_feedback` — NOVA (Sprint Coach-1)

| Coluna | Tipo | Constraints | Proposito |
|---|---|---|---|
| `id` | varchar | PK, nanoid | |
| `message_id` | varchar | FK chat_messages.id ON DELETE CASCADE, NOT NULL | |
| `user_id` | varchar | FK users.user_platform_id ON DELETE CASCADE, NOT NULL | |
| `feedback` | varchar(10) | NOT NULL CHECK IN ('up','down') | |
| `comment` | text | nullable, max 500 via Zod | |
| `created_at` | timestamp | defaultNow | |

**Indices:**
- `uniq_message_feedback_user_message UNIQUE (message_id, user_id)`
- `idx_message_feedback_message (message_id)`
- `idx_message_feedback_user_created (user_id, created_at DESC)`
- `idx_message_feedback_feedback_created (feedback, created_at DESC)` — dashboard admin

---

## Calculadora de Custo (referencia)

Precos publicos Anthropic — Sonnet (sujeitos a mudanca):
- Input regular: **$3.00 / 1M tokens**
- Cache write: **$3.75 / 1M tokens** (+25%)
- Cache read: **$0.30 / 1M tokens** (-90%)
- Output: **$15.00 / 1M tokens**

```ts
function calculateMessageCost(usage: {
  input_tokens: number,
  output_tokens: number,
  cache_creation_input_tokens: number,
  cache_read_input_tokens: number
}): number {
  return (
    usage.input_tokens * 3 +
    usage.cache_creation_input_tokens * 3.75 +
    usage.cache_read_input_tokens * 0.30 +
    usage.output_tokens * 15
  ) / 1_000_000;
}
```

**Meta Sprint Coach-1:** custo amortizado em sessao de 5 msgs <= $0.012 USD.

---

## Referencias

- Spec Coach-1: `docs/specs/coach-sprint-1-fundacao-economica.md`
- Spec Coach-2A: `docs/specs/coach-sprint-2a-page-context-and-tools.md`
- ADR-019: prompt cache strategy (estatico cacheado + dinamico)
- ADR-020: rate limit rolling 24h
- ADR-021: model selection via env
- ADR-022: confidence tags inline
- ADR-023: tool registry pattern modular (Coach-2A)
- ADR-024: tool result wrapping JSON `__type: 'ToolResult'` (Coach-2A)
- ADR-025: page context Zod discriminated union (Coach-2A)
- ADR-026: continuation loop limit 5 tools/turn (Coach-2A)
- Sequence diagrams: `docs/architecture/sequence-coach-chat-cached.mermaid`, `docs/architecture/sequence-message-feedback.mermaid`, `docs/architecture/sequence-coach-tool-use.mermaid`, `docs/architecture/sequence-coach-page-context.mermaid`
- Tools detalhadas: `docs/api/coach-tools.md`
- Data model: `docs/architecture/data-model.mermaid` (dominio AI Coach + AI Coach Tools)

---

## Sprint AI-1A — anti-fadiga completo + onboarding conversacional + deteccao de nivel + perfil estruturado

> ADRs: **151** (perfil estruturado JSONB), **152** (anti-fadiga — snooze + telemetria + auto-congelamento + kill switch), **153** (onboarding wizard guiado), **154** (deteccao de nivel rule-based). Diagramas: `Docs/architecture/diagrams/coach-ai-1a/`. Spec: `Docs/specs/sprint-ai-1a.md`.

### Onboarding conversacional (wizard guiado — ADR-153)

#### `GET /api/coach/onboarding`
- **Auth:** JWT.
- **Resposta 200:** `{ completed: boolean, mode: 'full'|'light'|null, draft: { step, mode, startedAt }|null, structuredProfile: AiStructuredProfile, levelEstimate: LevelEstimate|null, hasImport: boolean }`.
  - `completed` ⟺ `users.ai_structured_profile.onboardingCompletedAt != null`.
  - `mode` — `full` se nunca completou; `light` se `isStructuredProfileEmpty(profile)` E conta antiga; `null` se ja completou. O frontend pode passar `?mode=` ao abrir o wizard.
  - `draft` — `ai_structured_profile.onboardingDraft` (o wizard retoma do `step`); `null` se nao iniciou.
  - `levelEstimate` — resultado de `estimatePlayerLevel` (mesmo de `GET /api/coach/level-estimate`); `null` se erro ao carregar.
  - `hasImport` — `true` se ja importou historico (`getUploadHistory`/contagem de torneios > 0).

#### `PATCH /api/coach/onboarding`
- **Auth:** JWT. **Body:** sub-schema Zod do step atual (campos parciais) **OU** `{ skip: true }`.
  - Campos aceitos (subset por step): `perfilDeclarado` (`'recreativo_serio'|'semi_pro'|'pro'`), `stakesTipico` (≤50), `volumeTipicoMes` (number), `tempoJogaSerioMeses` (number), `redesPrincipais` (string[], cada ≤50 — clampado, nao `400`), `nivel` (`PlayerLevel`), `nivelConfirmado` (boolean), `metas` (≤3, cada `{ texto: ≤200, prazo?: 'mes'|'trimestre' }`), `focoDoMes` (≤200), `tomPreferido` (`'gentle'|'balanced'|'direct'`), `step` (1-6 full / 1-3 light), `mode` (`'full'|'light'`).
- **Efeito:** `updateAiStructuredProfile(userId, delta)` (merge raso — arrays substituem por completo; seta `updatedAt`; clampa tamanhos) + atualiza `onboardingDraft = { step, mode, startedAt }`. `{ skip: true }` → seta `onboardingSkippedAt = now` (NAO altera `onboardingCompletedAt`).
- **Erros:** `400` — `tomPreferido` fora do enum; meta > 200 chars; `step` fora de range; `nivel` fora do enum.
- **Resposta 200:** `{ structuredProfile, draft }`.

#### `POST /api/coach/onboarding/complete`
- **Auth:** JWT. **Body:** agregado — `tomPreferido` obrigatorio; `metas`/`focoDoMes` opcionais; `nudges` (8 toggles `bSnapshot`/`bLeak`/`bStudy`/`bVolume`/`bGrade`/`bDownswing`/`bLife`/`bMental` — booleans) + `quietHours: { startHour, endHour }` (0-23) — vem do step 6.
- **Efeito:** `onboardingCompletedAt = now`, `onboardingVersion = 1`, limpa `onboardingDraft`; `updateAiStructuredProfile({ tomPreferido, ... })`; `upsertCoachPreferences({ coachTone: tomPreferido, nudgeBSnapshot: ..., quietHoursStart: ..., quietHoursEnd: ... })` (RF-09 sincronizacao — grava nos dois lugares).
- **Resposta 200:** `{ structuredProfile, preferences }`.

#### `GET /api/coach/level-estimate`
- **Auth:** JWT. **Efeito:** carrega `getDashboardStats(userId, 'all')` + `getDashboardStats(userId, '90d')` + `getAnalyticsBySite(userId, 'all')` + `users.createdAt` (→ `accountAgeMonths`) + `users.subscriptionPlan`; conversao USD aplicada antes (lesson #6); chama `estimatePlayerLevel`. **Nao persiste** (idempotente).
- **Resposta 200:** `{ nivel, confidence: 'low'|'medium'|'high', humanLabel, evidence: { abiUSD, volumeAllTime, volumeLast90d, roiAllTime, distinctNetworks, accountAgeMonths }, note?: string }`.
  - Niveis: `sem_dados` (volume<30 ou ABI null) / `iniciando` / `micro_ascensao` / `mid_consistente` / `high_stakes` / `recreativo_serio`. `note` preenchido quando `sem_dados`. Usuario sem nenhum torneio → `sem_dados`, sem throw (lesson #9).

### Anti-fadiga — telemetria de nudge in-app (ADR-152)

#### `GET /api/coach/nudges`
- **Auth:** JWT. **Query:** `?status=sent|engaged|dismissed|snoozed|unsubscribed`, `?category=B-SNAPSHOT|...`, `?limit=N`.
- **Resposta 200:** `{ nudges: CoachNudgeLog[] }` — so do usuario logado (nao vaza); ordenado `sentAt desc`. Cada row: `id`, `category`, `cycleKey`, `status`, `titleI18n`, `bodyPreview`, `channel`, `chatSessionId`, `triggeredByEvent` (incl. `'auto_freeze_notice'` — o frontend renderiza diferente), `sentAt`, `engagedAt`, `dismissedAt`, `snoozeUntil`, `createdAt`.

#### `POST /api/coach/nudges/:id/dismiss`
- **Auth:** JWT. **Ownership:** `getNudgeLogById(id).userId === req.user.userPlatformId` senao `404`.
- **Efeito:** `updateNudgeLogStatus(id, 'dismissed', { dismissedAt: now })` + `checkAndFreezeCategory(userId, row.category)` (se `sent >= 3` na janela de 7d E `dismissRate > 0.5` → congela + cria row de aviso `triggeredByEvent='auto_freeze_notice'`). **Idempotente** — re-dismiss = no-op. **Resposta 200:** `{ nudge }`.

#### `POST /api/coach/nudges/:id/snooze`
- **Auth:** JWT. **Body:** `{ duration: 'short' | 'long' }` — `short` = `now + 1 dia`, `long` = `now + 30 dias`. `400` se invalido.
- **Efeito:** `updateNudgeLogStatus(id, 'snoozed', { snoozeUntil })`. Depois: `shouldSendNudge(userId, { category: row.category })` → `{ allow: false, reason: 'category_snoozed' }` ate expirar (engine CHECK 1.6 via `getActiveSnoozeForCategory`). **Resposta 200:** `{ nudge }`.

#### `POST /api/coach/nudges/:id/engage`
- **Auth:** JWT. **Efeito:** `updateNudgeLogStatus(id, 'engaged', { engagedAt: now })`. Idempotente. **Resposta 200:** `{ nudge }`.

#### `POST /api/coach/nudges/:id/unsubscribe`
- **Auth:** JWT. **Efeito:** `updateNudgeLogStatus(id, 'unsubscribed')` + `upsertCoachPreferences({ nudgeB<Cat>: false })` (desliga o toggle) + `checkAndFreezeCategory`. **Resposta 200:** `{ nudge, preferences }`.

#### `POST /api/coach/preferences/unfreeze`
- **Auth:** JWT. **Body:** `{ category: NudgeCategory }` (enum dos 8 `B-*` — `400` se inexistente).
- **Efeito:** remove `frozenCategories[category]` (no-op se nao existe). **Resposta 200:** `{ preferences }`.

#### `POST /api/admin/coach/freeze-category`
- **Auth:** JWT + `requirePermission('admin')` — `403` se nao-admin.
- **Body:** `{ userId, category: NudgeCategory, action: 'freeze' | 'unfreeze' }`.
- **Efeito:** `freeze` → `frozenCategories[category] = { frozenAt: now, reason: 'admin' }`; `unfreeze` → remove. **Resposta 200:** `{ ok: true, frozenCategories }`.

#### `GET /api/coach/preferences` — estendido
- O response (`buildPrefsResponse`) ganha **`frozenCategories: Record<NudgeCategory, { frozenAt: string; reason: 'auto_dismiss_rate'|'admin'|'manual'; dismissRate?: number; windowDays?: number }>`** (vazio `{}` ou com entradas). Os 8 toggles + quiet hours + caps + `coachTone` inalterados. A aba "Preferencias" do hub `/coach-ai` renderiza uma secao "Categorias pausadas" + botao "Reativar" (`POST /api/coach/preferences/unfreeze`).

#### `PUT /api/coach/preferences` — estendido
- Ganha o campo opcional **`unfreezeCategory?: NudgeCategory`** — se presente, remove `frozenCategories[unfreezeCategory]`. **NAO** aceita `frozenCategories: {...}` no body (Zod `.strict()` → `400`; congelamento so via auto-congelamento ou `POST /api/admin/coach/freeze-category`).
- Quando o body inclui `coachTone`, o handler **tambem** chama `updateAiStructuredProfile(userId, { tomPreferido: coachTone })` (espelha — RF-09 sincronizacao).

### nudgeEngine — 8 checks (ADR-152, estende ADR-085)

Ordem do `shouldSendNudge(userId, ctx)`: **(0)** kill switch global `COACH_NUDGES_ENABLED === 'false'` → `nudges_globally_disabled` (absoluto — nem `isCritical` bypassa); **(1)** categoria toggle off → `category_disabled`; **(1.5)** categoria congelada (`prefs.frozenCategories[ctx.category]`) → `category_frozen` (bypass se `isCritical`); **(1.6)** snooze ativo (`getActiveSnoozeForCategory > now`) → `category_snoozed` (bypass se `isCritical`); **(2)** quiet hours → `quiet_hours` (bypass se `isCritical`) — inalterado; **(3)** daily cap → `daily_cap_reached` — inalterado; **(4)** hourly cap → `hourly_cap_reached` — inalterado; **(5)** one-shot per cycle → `already_sent_this_cycle` — inalterado; senao `ALLOW`. Erro em qualquer step → safe-deny `engine_error` com `console.error` (lesson #9). O `cronRunner` nao registra os schedules de B-SNAPSHOT, B-STUDY e `generateCoachRecommendations` se `COACH_NUDGES_ENABLED === 'false'` (o cleanup de pending coach_actions continua). Nudges ja `sent` permanecem quando o kill switch aciona (o kill switch para de gerar novos; nao apaga).

### Perfil estruturado no system prompt (ADR-151 §7)

O bloco STATIC cacheado ganha `## Perfil Estruturado do Jogador:` entre `## Perfil do jogador:` (nome/plano/total torneios) e `## Perfil do Jogador (memoria de longo prazo):` (a prosa). Populado: linhas curtas pt-BR (nivel + flag de confirmacao, perfil declarado, stakes/volume/tempo, redes, metas, foco, tom + instrucao de como aplicar, padroes — so declarados). Vazio (`isStructuredProfileEmpty`) E re-onboarding nao recusado recentemente (`reOnboardingDeclinedAt` ausente ou >30d): 1 linha instruindo a oferecer um diagnostico rapido (3 perguntas). Vazio mas re-onboarding recusado recentemente: bloco omitido. Vai no array STATIC com `cache_control: ephemeral`; quebra unica de cache aceita (lesson #10 + ADR-019).

### Referencias AI-1A

- ADR-151: `Docs/architecture/decisions/151-ai-structured-profile-jsonb.md`
- ADR-152: `Docs/architecture/decisions/152-anti-fadiga-snooze-telemetry-autofreeze-killswitch.md`
- ADR-153: `Docs/architecture/decisions/153-onboarding-conversacional-wizard-guiado.md`
- ADR-154: `Docs/architecture/decisions/154-deteccao-nivel-rule-based.md`
- Diagramas: `Docs/architecture/diagrams/coach-ai-1a/{onboarding-flow,nudge-engine-checks,system-prompt-structure,structured-profile-and-nudge-telemetry-er}.mermaid`
- Spec: `Docs/specs/sprint-ai-1a.md`
- Memoria estruturada (delta sobre ADR-015/AI-002): `Docs/architecture/ai-coach/adr-002-memory-architecture.md` (nota AI-1A no topo)

---

## Sprint AI-1B — Relatorios automaticos + hub timeline + gap-check/B-IMPORT + quick suggestions (ADR-155/156/157/158)

### `GET /api/coach/timeline` (NOVO — ADR-157)
- **Auth:** JWT. So itens do user logado. Handler com `injectedStorage?` (lesson #34).
- **Query:** `?limit=` (default 30, max 100 — clampa, nao 400), `?cursor=` (opcional — timestamp ISO; paginacao por `generated_at`/`sent_at`).
- **Resposta 200:** `{ items: TimelineItem[], nextCursor?: string }`. `TimelineItem` = union discriminada por `kind`:
  - `{ kind: 'report', id, reportType, periodStart, periodEnd, status, summaryLine, generatedAt, readAt, dismissedAt }` — `summaryLine` = `content.header.summaryLine` do `reports` row; `status` `'ready'|'degraded'`.
  - `{ kind: 'nudge', id, category, status, title, bodyPreview, sentAt, engagedAt, dismissedAt, snoozeUntil, chatSessionId, triggeredByEvent }` — vem de `coach_nudge_log`.
- Ordenado por timestamp desc (merge in-memory de 2 SELECTs — pegar `LIMIT+1` de cada, merge, cortar no `limit`, `nextCursor` = timestamp do ultimo). O `ReportsPanel` (aba `?tab=reports` do hub) consome via `useQuery(['/api/coach/timeline'])`; vazio → EmptyState (`data-testid="coach-ai-reports-empty"`).

### `GET /api/coach/reports/:id` (NOVO — ADR-157)
- **Auth:** JWT. Handler `injectedStorage?`.
- **Resposta 200:** `{ id, reportType, periodStart, periodEnd, status, content, markdown, generatedAt, costUsdEstimate? }`. `content` = `ReportContent`; `markdown` nullable (o frontend usa quando presente).
- **Efeito:** marca `read_at = now` na 1a leitura (idempotente — so se null). **404** se nao existe; **403** se de outro user.
- (Opcional:) `POST /api/coach/reports/:id/dismiss` → seta `dismissed_at`.
- **Render:** rota `/coach-ai/relatorio/:id` → `WeeklyReportView.tsx` (ReactMarkdown + remarkGfm); 8 secoes + 3 insights + plano + CTAs (`kind:'link'`→navega rota Wouter **registrada** lesson #19; `kind:'tool'`→fluxo da tool com confirm, NAO auto-executa ADR-146); `status='degraded'`→aviso "modo simplificado".

### `ReportContent` (shape de `reports.content` — interface TS em `shared/schema.ts`, `schemaVersion: 1`)
Ver o detalhe completo no diagrama `Docs/architecture/diagrams/coach-ai-1b/weekly-report-structure.mermaid` e na linha de `reports` em `Docs/architecture/data-model-index.md`. Resumo: `{ schemaVersion, reportType, periodStart, periodEnd, dataSufficiency: 'ok'|'low', level?, tone?, header: { title, summaryLine, comparison? }, sections: { volumeResults, bankroll (USD normalizado — lesson #6), selection, study, mentalOps? (ausente se opt-out/sem warm-up — Q6) }, insights: Array<{ text, citations: string[], confidence? }> (3 quando 'ok'; [] ou 1 item quando degraded/low), nextWeekPlan: { gradeSuggestionHref, studyFocus, recommendedAction, weeklyStudyPlanRef? }, cta: Array<{ label, kind: 'tool'|'link', toolName?, href?, payloadHint? }> (toolName so ∈ tools AI-0A; href so rota Wouter registrada — NUNCA bulk_propose_grade/schedule_study_block/define_career_goal/mark_off_day), generation: { model, summarizerModel, degraded, degradedReason } }`. `markdown` armazenado e o render canonico da epoca. Versionamento via `schemaVersion` + tolerancia a campos ausentes no frontend (lesson #7).

### `GET /api/coach/suggestions` (NOVO — ADR-158, nao-LLM)
- **Auth:** JWT. Handler `injectedStorage?`.
- **Query:** `?route=<route>` (rota desconhecida/vazio → set generico, **200** nao 400); opcional campos de page context.
- **Resposta 200:** `{ suggestions: Array<{ id, text, sendOnClick: true }> }` 2-4 itens.
- **Logica:** `computeSuggestions(userId, route, ctx, storage)` em `server/coach/quickSuggestions.ts` — mapa estatico rota→sugestoes + check leve de estado (1-2 queries baratas: `getDashboardStats('7d')`/`detectLeaks` p/ downswing; `getLastUploadAt` p/ "sem dados") cacheado TTL ~30s por user (`_resetSuggestionsCacheForTests()` exportado, chamado em `beforeEach` dos testes). Erro → cai pras genericas por rota (safe). Variantes (resumo): downswing→"Por que estou perdendo essa semana?"; sem dados→"Como importo meus torneios?"; `/bankroll`→"Quanto posso sacar com seguranca?"; `/grade-planner`→"Sugira uma grade pra essa semana"; `/grind`→"Como foi minha ultima sessao?"; `/estudos`→"O que devo estudar agora?"; `/biblioteca`→"Qual aula voce recomenda?"; `/stats`→"Algum stat fora do padrao?"; `/coach-ai`→"O que mudou na minha semana?". Mapa completo no ADR-158 §3.3.
- **Frontend:** `ChatPanel`/`MiniChat` renderizam os chips quando `messages.length === 0` (clicar preenche o input + foco — ou envia); endpoint falha → fallback estatico `client/src/lib/quickSuggestionsFallback.ts`. Substitui o conceito legado de "prompt starters" por-coach.

### `GET /api/coach/preferences` — estendido (ADR-155/157)
- `buildPrefsResponse` ganha **`reportWeeklyEnabled: boolean`** (default `false`), **`nudgeBGapcheck: boolean`** (default `true`), **`nudgeBImport: boolean`** (default `true`). A aba "Preferencias" do hub ganha o toggle "Relatorio semanal do Grindfy AI" (**so visivel pra Pro+**; Free: linha desabilitada/nada) + os 2 toggles de categoria novos.

### `PUT /api/coach/preferences` — estendido (ADR-155/157)
- Ganha os campos opcionais **`reportWeeklyEnabled?`**, **`nudgeBGapcheck?`**, **`nudgeBImport?`** (zod `.strict()`). `unfreezeCategory` enum aceita `'B-GAPCHECK'`/`'B-IMPORT'`. Mesmo se um Free setar `reportWeeklyEnabled=true` via API direta, o enqueuer nao enfileira (revalida o plano — defesa em profundidade).

### Job runner timezone-aware (ADR-155 — `server/jobs/reportJobRunner.ts`)
- **Enqueuer `enqueueWeeklyReportJobsTick({ now })`** — `0 * * * *`. `COACH_NUDGES_ENABLED === 'false'` → return cedo. `withAdvisoryLock("cron:report-job-enqueuer", ...)`. Pra cada user de `listUsersForCron("subscription_plan IN ('pro','premium')")` com `isWeeklyReportEligible` (Pro+ && `prefs.reportWeeklyEnabled === true`; safe-deny em erro), se `getLocalHour(now, user.timezone) === 7 && é segunda no fuso do user`: `INSERT INTO report_jobs (report_type='weekly', status='pending', period_start = segunda da SEMANA QUE ACABOU no fuso do user, period_end = period_start+6d, scheduled_for = now, timezone = user.timezone, subscription_plan_at_enqueue = user.plan, enqueued_by = 'cron_enqueuer') ON CONFLICT (user_id, report_type, period_start) DO NOTHING`. `try/catch` por user (lesson #9).
- **Processor `processReportJobsTick({ now })`** — `*/15 * * * *`. `COACH_NUDGES_ENABLED === 'false'` → return cedo. `withAdvisoryLock("cron:report-job-runner", ...)`. `SELECT ... LIMIT 25` jobs `pending` due (`scheduled_for <= now AND (next_attempt_at IS NULL OR next_attempt_at <= now)`) `ORDER BY scheduled_for ASC`. Pra cada job: claim atomico `UPDATE report_jobs SET status='running', attempts=attempts+1, updated_at=now WHERE id=? AND status='pending' RETURNING *` (0 rows → outro runner pegou; pula). Revalida elegibilidade (downgrade/opt-out → `status='skipped'`, `last_error='no_longer_eligible'`). Idempotencia (ja existe `reports` row → `status='done'`, `report_id=<existente>`, NAO regera/NAO chama LLM). Senao `generateWeeklyReport({ userId, periodStart, periodEnd })` → ok: UPSERT `reports` row (`'ready'|'degraded'`), job `'done'`, `report_id=<novo>`; falha: `console.error('report.job.error', ...)` (lesson #9) + `last_error`; `attempts < max_attempts` → `'pending'`, `next_attempt_at = now + backoff(attempts)` (`1`→+15min, `2`→+1h, `3`→+4h); `attempts >= max_attempts` → fail-soft: UPSERT `reports` row `'degraded'`, `degraded_reason='llm_failed_3x'` (ou `'no_anthropic_key'` na 1a tentativa — nao re-tenta), job `'done'` (nunca `'failed'` permanente). Pacing 200ms. Registrado via `server/jobs/index.ts` → `registerAllJobs()`; ativacao `NODE_ENV === 'production' || COACH_CRON_ENABLED === 'true'`.

### Gerador do Weekly Report (ADR-155/156 — `server/services/weeklyReportGenerator.ts`)
`generateWeeklyReport({ userId, periodStart, periodEnd, injectedStorage? }): Promise<{ content: ReportContent; markdown: string; status: 'ready'|'degraded'; model: string|null; usage? }>`. Modelo: `process.env.COACH_MODEL ?? <constante canonica do projeto — ver coachSystemBuilder.ts / ADR-021>`. Passos: (1) bundle de dados da semana (queries de storage — TODA query de historico filtra `grind_session_id IS NULL`, CLAUDE.md §6.1); (2) bundle grande → sumariza via Haiku — grava `summarizer_model_used` (Q3); (3) back-fill `coach_lesson_recommendations` — `recommendLessonForUser(...)` + `storage.createCoachRecommendation({ ..., weekStartDate: getCurrentWeekStartBRT(now) })` (idempotente — chave BRT mantida); (4) back-fill `study_weekly_plans` — `generateWeeklyStudyPlan({ userId, source: 'coach_auto', weekStartDate: utcMondayOfWeek(now) })` (UPSERT — chave UTC mantida); (3)+(4) `try/catch` (lesson #9 — nao derruba o relatorio); (5) sonnet (`new AnthropicCtor(...)` em `try/catch` com fallback factory — lesson #5/#35) com bundle + perfil estruturado (`nivel`/`tomPreferido`) + `CITATIONS_RULES` + o prompt unico `server/coach/prompts/weeklyReport.ts` (lesson #10; `cache_control: ephemeral` — ADR-019) → narrativas das secoes 1-5 + EXATAMENTE 3 insights data-grounded (`citations.length >= 1`) + `nextWeekPlan`; (6) monta o `ReportContent` + markdown derivado; (7) calcula `cost_usd_estimate` + loga `coach.report.tokens`. Falha do passo 5 → caminho **deterministico** (secoes 1-5 so numeros, `insights = []` ou 1 item, `nextWeekPlan` so com links/refs, `cta` so links, `generation.degraded = true`, `degradedReason`). `dataSufficiency='low'` (volume=0/sem dados) → minimalista, `status='ready'` (NAO `degraded`), header convidando a importar, CTA `/upload`, NAO chama o LLM pra 3 insights — custo ≈ 0. Tudo idempotente (UPSERT por chave de semana).

### Categorias de nudge novas (ADR-157)
- **`B-GAPCHECK`** — gap-check D-3 pre-Weekly. `gapCheckTick({ now })` (`0 * * * *`, filtra hora local util + "hoje é sexta no fuso do user" — D-3 antes da entrega de segunda 7h). `withAdvisoryLock("cron:coach-gap-check", ...)`. Pra cada user Pro+ com `isWeeklyReportEligible` (gap-check so pra quem recebe o report): **check de estado real** (queries no momento — nunca flag stale, lesson #9 / risco R5): nao importou essa semana E tem sessoes? / sessoes da semana sem reconciliacao? / snapshot de bankroll pendente? / 0min de estudo E tem foco ativo? / escolheu foco mas nao atualizou stats (HUD)? Se **algum** → 1 nudge gentil listando os itens faltantes (links `/upload`, `/grind`, `/bankroll`, `/estudos`, `/stats`); `cycleKey = YYYY-WW` (ISO week da semana do report) → `shouldSendNudge(userId, { category: 'B-GAPCHECK', cycleKey, now })` 1×/ciclo; `createNudgeLog({ category: 'B-GAPCHECK', status: 'sent', triggeredByEvent: 'gap_check_d3', cycleKey, bodyPreview, chatSessionId? })`. Se **nenhum** → nao manda nada. Toggle `userCoachPreferences.nudge_b_gapcheck` (`NOT NULL DEFAULT true`); `nudgeBGapcheck` no `updateCoachPreferencesSchema`; `'B-GAPCHECK'` em `NudgeCategory`/`CATEGORY_TOGGLE_MAP`/`unfreezeCategory`; auto-freeze (ADR-152) cobre.
- **`B-IMPORT`** — cobranca de import standalone. `bImportTick({ now })` (`0 * * * *`, filtra hora local — padrao `processBStudy`). `withAdvisoryLock("cron:coach-b-import", ...)`. Pra cada user Pro+ (consistente com B-STUDY): `lastImportAt = storage.getLastUploadAt(userId)`; `N = COACH_BIMPORT_DAYS` env (default 5). Se `now - lastImportAt < N dias` (ou nunca importou E sem sessoes) → skip. `sessionsInPeriod = storage.countGrindSessionsSince(userId, lastImportAt ?? now-Ndias)`; se `=== 0` → skip (nao esta jogando). Se `lastImportAt` muito antigo (ou null) E `sessionsInPeriod > 0` → 1 nudge gentil ("Voce registrou N sessoes nas ultimas semanas mas nao importou nenhum CSV...") com link `/upload`; `cycleKey = YYYY-WW` → `shouldSendNudge` 1×/semana; `createNudgeLog({ category: 'B-IMPORT', status: 'sent', triggeredByEvent: 'b_import_check', cycleKey, bodyPreview, chatSessionId? })`. Toggle `userCoachPreferences.nudge_b_import` (`NOT NULL DEFAULT true`); `nudgeBImport`; `'B-IMPORT'` em `NudgeCategory`/`CATEGORY_TOGGLE_MAP`/`unfreezeCategory`; auto-freeze cobre.
- Ambas distintas — um user pode receber as duas na mesma semana (sujeito aos caps do anti-fadiga). Ticks em `server/coach/jobs/`, gated por `COACH_NUDGES_ENABLED`.

### Gating (ADR-155)
`COACH_NUDGES_ENABLED === 'false'` desliga o enqueuer + o processor de relatorios + os ticks de gap-check/B-IMPORT (relatorios contam como "proatividade" — sem flag nova; o user ja controla via o opt-in `report_weekly_enabled`). Jobs ja enfileirados ficam parados enquanto a flag esta off; quando volta, o processor pega os atrasados (`scheduled_for <= now`). (Opcional:) `COACH_BIMPORT_DAYS` env (default 5).

### Aposentadoria dos 2 crons de segunda (ADR-156)
`generateCoachRecommendations` (`0 6 * * 1` BRT em `cronRunner.ts`) e `generateWeeklyStudyPlan` (`0 9 * * 1` UTC via `jobs/index.ts`) — **agendamento desligado** (modulos viram dead code agendado, comentario "DEPRECATED — absorbido pelo Weekly Report (ADR-156)"; a logica e reaproveitada pelo gerador do report). `coach_lesson_recommendations` e `study_weekly_plans` **continuam preenchidas** — agora pelo `generateWeeklyReport` (chaves de semana mantidas: `getCurrentWeekStartBRT()` pra rec, `utcMondayOfWeek` pro plano — back-compat com `GET /api/home/coach-recommendation` + `StudyWeeklyPlanCard`). **Trade-off:** Free perde a rec de lesson automatica semanal (Pro+ sem opt-in tambem — rec via chat / tool `recommend_lesson` on-demand; follow-up "cron leve pra todos" documentado se inaceitavel). 3 nocoes de "semana" coexistem (report = fuso do user/semana que acabou; rec = BRT/semana corrente; plano = UTC/semana corrente).

### Referencias AI-1B
- ADR-155: `Docs/architecture/decisions/155-relatorios-automaticos-report-jobs-runner-tz-aware.md`
- ADR-156: `Docs/architecture/decisions/156-aposentadoria-crons-segunda-absorvidos-weekly-report.md`
- ADR-157: `Docs/architecture/decisions/157-hub-timeline-report-render-bgapcheck-bimport.md`
- ADR-158: `Docs/architecture/decisions/158-quick-suggestions-anti-blank-page.md`
- Diagramas: `Docs/architecture/diagrams/coach-ai-1b/{report-job-runner-flow,weekly-report-structure,hub-timeline-flow,report-tables-er,gapcheck-bimport-flow}.mermaid`
- Spec: `Docs/specs/sprint-ai-1b.md`
