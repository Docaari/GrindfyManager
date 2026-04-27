# Spec: Coach IA — Sprint 1 (Fundacao Economica + Feedback Loop)

## Status
Proposta

## Resumo
Sprint Coach-1 do Coach IA v2: implementar prompt caching da Anthropic (-75% custo), thumbs up/down com citations, confidence tags ("o que nao sei") e rate limit tiered por plano (com gate de acesso a cada coach por plano). Objetivo: viabilizar economicamente escalabilidade do coach, abrir loop de feedback de qualidade e transformar o Coach em driver de upgrade.

## Contexto

O Coach IA ja existe em producao (3 coaches: Mental, Torneios, Tecnico) com streaming SSE, rate limit flat 30/h, memoria persistente via `user_ai_profile` e compactacao mensal. Atualmente:

- Custo: ~$0.028/mensagem (sem prompt caching). 1000 msgs/mes = ~$28. Nao escala.
- Rate limit flat (30/h) aberto a todos os planos — nao ha driver de upgrade.
- Sem feedback loop: ninguem sabe se respostas sao uteis, alucinam ou violam persona.
- Sem sinalizacao de confianca: coach afirma tudo com o mesmo peso, mesmo quando amostra e pequena (N<30).
- System prompt ~1500 tokens e reconstruido a cada msg sem aproveitar cache da Anthropic.

O plano estrategico completo vive em `Docs/strategy/2026-04-24-coach-ai-optimization-plan.md`. Este sprint entrega **A1 + D1 + D3 + F4/G1** (top 4 ICE, entrega 1 semana).

Codigo-base:
- `server/routes/coach.ts` — endpoints e SSE streaming (modelo: `claude-sonnet-4-5-20250514`)
- `server/coachContext.ts` — `assembleContext()` separa system de messages
- `server/coachPrompts.ts` — system prompts por coach type (contem SAFETY_RULES compartilhadas)
- `server/coachMemory.ts` — `compactSession`, `checkMonthlyCompaction`, `getCoachProfile` (modelo: `claude-3-5-haiku-20241022`)
- `shared/schema.ts` linhas 1590-1698 — tabelas `chatSessions`, `chatMessages`, `userAiProfile`, `monthlyCoachSummaries`

---

## Usuarios

- **Jogador Free:** 10 mensagens/dia, acesso somente ao Coach Mental. Ve CTA de upgrade quando tenta Tournament/Technical.
- **Jogador Pro:** 50 mensagens/dia, acesso a Coach Mental + Tournament. Ve CTA de upgrade quando tenta Technical.
- **Jogador Premium:** 200 mensagens/dia, acesso aos 3 coaches.
- **Admin / role=admin:** bypass total de rate limit e gate de plano (para QA e suporte).
- **Admin (dashboard):** novo endpoint `/api/admin/coach/feedback-stats` para curadoria de prompts.

---

## Requisitos Funcionais

### RF-01 (A1): Prompt Caching da Anthropic

**Descricao:** Separar o system prompt em dois blocos (estatico cacheado + dinamico nao cacheado) usando a API nativa `cache_control: {type: 'ephemeral'}` da Anthropic. Migrar para modelos mais recentes e aumentar `max_tokens` de respostas.

**Regras de negocio:**
- O campo `system` passa de `string` para `Array<{type: 'text', text: string, cache_control?: {type: 'ephemeral'}}>`.
- **Bloco 1 — Estatico (cacheado, TTL ~5 min):**
  - Base prompt do coach (`getMentalPrompt`/`getTournamentPrompt`/`getTechnicalPrompt` porcao fixa sem dados do usuario)
  - SAFETY_RULES (bloco fixo compartilhado)
  - `user_ai_profile.content` (muda rara vez — compactacao mensal)
  - stats snapshot (dashboard stats geral — reutilizavel entre mensagens)
  - last archived session summary
  - `cache_control: {type: 'ephemeral'}` aplicado APENAS ao ultimo item deste bloco (a API aplica cache ate o breakpoint)
- **Bloco 2 — Dinamico (sem cache):**
  - Contexto especifico por sessao: break feedbacks recentes, active grind session, weekly plan atual, leaks detectados em tempo real, progresso de estudos recente
  - Reescrito a cada requisicao
- **Messages array:** continua identico ao atual (history + current user message).
- **Migracao de modelos:**
  - `claude-sonnet-4-5-20250514` → `claude-sonnet-4-6` em `handleCoachChat`
  - `claude-3-5-haiku-20241022` → `claude-haiku-4-5-20251001` em `coachMemory.ts` (`compactSession`, `checkMonthlyCompaction`)
  - Se qualidade regredir em smoke test, fallback temporario documentado via env `CLAUDE_COACH_MODEL` (default para valor novo)
- **max_tokens:** `1024` → `2048` no chat de resposta.
- **Logging de usage:** capturar do stream (`message.usage` no evento final) e salvar em `chatMessages.metadata` e em colunas dedicadas (ver seccao de schema):
  - `input_tokens`
  - `output_tokens`
  - `cache_creation_input_tokens`
  - `cache_read_input_tokens`
- **Refactor:** extrair para `server/coachSystemBuilder.ts` duas funcoes puras:
  - `buildStaticSystemBlock(coachType, { aiProfile, statsSnapshot, lastSummary }): string`
  - `buildDynamicSystemBlock(coachType, { activeGrind, weeklyPlan, breakFeedbacks, leaks, studyProgress }): string`
- `assembleContext` passa a retornar `{ system: Array<{type, text, cache_control?}>, messages }`.

**Criterios de aceitacao:**
- [ ] Primeira mensagem de uma sessao registra `cache_creation_input_tokens > 0` em `chatMessages`.
- [ ] Segunda mensagem na mesma sessao em janela de 5 min registra `cache_read_input_tokens > 0` e `cache_creation_input_tokens = 0` no bloco estatico.
- [ ] **Cache hit rate >= 60% apos 5 mensagens consecutivas em janela de 5 min** (medido pela razao `cache_read_input_tokens / (cache_read_input_tokens + cache_creation_input_tokens + input_tokens)` do bloco estatico).
- [ ] **Custo medio por mensagem (amortizado em sessao de 5 msgs) <= $0.012 USD** considerando precos publicos Anthropic: Sonnet input $3/1M, cache write $3.75/1M, cache read $0.30/1M, output $15/1M.
- [ ] Latencia P95 do primeiro token SSE nao aumenta mais que +200ms vs linha de base atual (medir antes e depois).
- [ ] `assembleContext` retorna `system` como array com pelo menos 1 bloco marcado com `cache_control: {type: 'ephemeral'}`.
- [ ] Ajuste de `max_tokens=2048` aplicado; teste de snapshot de resposta longa nao trunca em 1024 tokens.
- [ ] Modelos atualizados: `claude-sonnet-4-6` no chat, `claude-haiku-4-5-20251001` em memoria.

---

### RF-02 (D1): Thumbs up/down + Citations

**Descricao:** Permitir usuario sinalizar qualidade de cada resposta do assistant. Instruir o coach (via prompt) a citar fonte dos dados que menciona.

**Regras de negocio:**

#### RF-02.1 — Feedback (thumbs)
- Usuario pode dar `up` ou `down` a qualquer mensagem com `role='assistant'` da qual ele e dono (via `session.userId`).
- Mensagens com `role='user'` nao aceitam feedback (HTTP 400).
- Para remover, usar DELETE; para trocar (up→down), chamar DELETE antes de novo POST (nao ha update in-place — simplifica integridade e telemetria).
- Comentario opcional ao dar feedback: max 500 caracteres, text nullable.
- Um usuario so pode ter um feedback ativo por mensagem (unique constraint na tabela).
- Admin `/api/admin/coach/feedback-stats` retorna:
  - Contagem global de `up`/`down` por coach type
  - Taxa up/total por coach type por semana (ultimas 8 semanas)
  - Top 20 mensagens com `feedback='down'` mais recentes, com `feedback_comment`, `content` truncado 500 chars, `coach_type`, `session_id`, `created_at`
  - Ordenacao: `created_at DESC`

#### RF-02.2 — Citations
- Instrucao no system prompt (bloco estatico): "Quando fizer afirmacoes sobre dados do jogador, SEMPRE cite a fonte no formato `[Fonte: <nome da tela>, N=<amostra>, janela: <periodo>]`".
- Exemplos explicitos no prompt (few-shot):
  - `Seu ROI em Turbos esta em -8% [Fonte: Dashboard > Por Speed, N=145, janela: ultimos 90d]`
  - `Voce tem 3 break feedbacks com foco < 5 nas ultimas 2 semanas [Fonte: Break Feedbacks recentes, N=3, janela: 14d]`
- **Sem tool use nesta sprint.** Citation e formatacao textual enforced via prompt — o contexto dinamico ja informa o N e a janela de cada dado carregado.
- Frontend nao processa citation separadamente nesta sprint (renderiza como texto). Uma possivel "tag visual" futura ja fica destravada pela convencao.

**Endpoints:**
- `POST /api/coach/messages/:id/feedback` — body: `{feedback: 'up'|'down', comment?: string}`. Auth obrigatoria. Ownership: `chatMessages.sessionId → chatSessions.userId === req.user.userPlatformId`. Retorna 201 com `{id, messageId, feedback, comment, createdAt}`.
- `DELETE /api/coach/messages/:id/feedback` — remove feedback do usuario atual naquela mensagem. Retorna 200 `{deleted: true}` ou 404 se nao existia.
- `GET /api/admin/coach/feedback-stats` — admin-only (`req.user.role === 'admin'`). Query params: `?coachType=mental|tournament|technical` (opcional, default: todos). Retorna JSON conforme seccao Admin acima.

**Criterios de aceitacao:**
- [ ] POST feedback em mensagem propria de assistant: 201.
- [ ] POST feedback em mensagem de usuario (`role='user'`): 400 com `{message: 'Nao e possivel dar feedback em mensagem do usuario'}`.
- [ ] POST feedback em mensagem de outro usuario: 403.
- [ ] POST feedback duplicado: 409 com `{message: 'Feedback ja existe. Use DELETE antes de enviar novo.'}`.
- [ ] POST com comment > 500 chars: 400.
- [ ] DELETE em feedback inexistente: 404.
- [ ] DELETE seguido de POST: 201 (fluxo de "trocar voto").
- [ ] `GET /api/admin/coach/feedback-stats` sem role admin: 403.
- [ ] `GET /api/admin/coach/feedback-stats` com admin: JSON com campos `{globalCounts, weeklyRate, topDownMessages}` nao vazios quando houver dados.
- [ ] Prompt atualizado inclui instrucao de citation e pelo menos 2 exemplos few-shot.
- [ ] Teste de integracao: conversa com coach retorna resposta contendo pelo menos uma citation no formato `[Fonte: ...]` quando pergunta envolve dado quantitativo.

---

### RF-03 (D3): Confidence Tags ("O que nao sei")

**Descricao:** Coach deve emitir tags de confianca baseadas em tamanho de amostra, e declarar explicitamente quando um dado nao esta disponivel. Frontend renderiza como badges coloridas.

**Regras de negocio:**

#### RF-03.1 — Tags no output do coach
Instruir no system prompt (bloco estatico) a emitir uma das tags inline ANTES da afirmacao correspondente:
- `[confianca: baixa, N={n}]` quando `N < 30`
- `[confianca: media, N={n}]` quando `30 <= N < 100`
- `[confianca: alta, N={n}]` quando `N >= 100`
- `[nao sei: {motivo}]` quando dado e hand-level ou nao existe no contexto

Exemplos no prompt (few-shot):
- `[confianca: baixa, N=18] Seus turbos estao -12%, mas amostra muito pequena para afirmar tendencia.`
- `[confianca: alta, N=450] Seu ROI em regulares $22 e solidamente +8%.`
- `[nao sei: dado hand-level indisponivel] Nao consigo avaliar sua frequencia de 3bet sem Hand History.`

#### RF-03.2 — Parser e renderizacao no frontend
- Componente novo: `client/src/components/coach/ConfidenceBadge.tsx`.
- Utilitario: `client/src/lib/coachMessageParser.ts` exporta `parseConfidenceTags(text): Array<{kind: 'text'|'badge', content?: string, badge?: ConfidenceBadge}>`.
- Regex:
  - `\[confianca:\s*(baixa|media|alta),\s*N=(\d+)\]`
  - `\[nao sei:\s*([^\]]+)\]`
- Badge visual (Tailwind):
  - `baixa` → amarelo (`bg-yellow-100 text-yellow-900 border-yellow-300`)
  - `media` → azul (`bg-blue-100 text-blue-900 border-blue-300`)
  - `alta` → verde (`bg-green-100 text-green-900 border-green-300`)
  - `nao sei` → cinza (`bg-gray-100 text-gray-700 border-gray-300`)
- Badge mostra: `baixa` | `media` | `alta` com N; `nao sei` com motivo em tooltip.
- Tag malformada ou aninhada → renderizar como texto literal sem badge (graceful degradation).
- Badge e inline (nao quebra linha), precede o texto da afirmacao.

**Criterios de aceitacao:**
- [ ] Prompt inclui as 3 tags e 3+ exemplos few-shot.
- [ ] `parseConfidenceTags("Seu ROI e [confianca: alta, N=450] +8%")` retorna 3 nodes: `text`, `badge`, `text`.
- [ ] `parseConfidenceTags("[nao sei: dado hand-level indisponivel] Nao posso analisar")` retorna 2 nodes: `badge`, `text`.
- [ ] Tag malformada `[confianca: extrema, N=abc]` e preservada como texto literal.
- [ ] Badge `baixa` renderiza com classe amarela; `media` azul; `alta` verde; `nao sei` cinza.
- [ ] Teste de integracao: resposta do coach para pergunta com dado pequeno (N<30) contem `[confianca: baixa, N=...]`.
- [ ] Componente passa teste de acessibilidade basico: `role="status"` + `aria-label` descrevendo o nivel de confianca.

---

### RF-04 (F4 + G1): Rate Limit Tiered + Coach Gate por Plano

**Descricao:** Substituir rate limit flat (30/h global) por tiers baseados em `users.subscriptionPlan`, e gatear acesso a cada coach type por plano. Admin tem bypass total.

**Regras de negocio:**

#### RF-04.1 — Tiers
| Plano | Limite diario (24h rolling) | Coaches acessiveis |
|---|---|---|
| trial / free | 10 msg/dia | Mental |
| pro (`subscriptionPlan='active'` + plan id pro) | 50 msg/dia | Mental + Tournament |
| premium (`subscriptionPlan='active'` + plan id premium) | 200 msg/dia | Mental + Tournament + Technical |
| admin (`users.role='admin'`) | Ilimitado (bypass) | Todos |

**Mapeamento de `users.subscriptionPlan`:**
- `subscriptionPlan='admin'` OU `role='admin'` → tier admin
- `subscriptionPlan='active'` → consultar `user_subscriptions` para descobrir plan tier (basico/pro/premium)
  - Helper `resolveUserTier(userId): Promise<'free'|'pro'|'premium'|'admin'>` centraliza logica
  - Fallback se sem subscription: `free`
- `subscriptionPlan='trial' | 'expired'` → tier `free`
- Quando `subscriptionPlan` nao mapear, default seguro: `free`

#### RF-04.2 — Window
- **24h rolling (nao calendar day).** Contagem: `count(chatMessages where role='user' AND session.userId=? AND createdAt > now() - 24h)`.
- Justificativa: evita abuso de "zerar a meia-noite" e simplifica fuso (nao precisa de user timezone).
- Helper: substituir `countUserMessagesInLastHour` por `countUserMessagesInLastDay(userId): Promise<number>` em `createCoachStorage()`.

#### RF-04.3 — Gate por plano
- Antes de processar chat, verificar `canAccessCoach(tier, coachType)`:
  - `free` → apenas `mental`
  - `pro` → `mental` ou `tournament`
  - `premium` ou `admin` → qualquer
- Se nao puder: HTTP 403 com body `{message: 'Este coach nao esta disponivel no seu plano', upgradeTo: 'pro'|'premium', currentPlan: 'free'|'pro'}`.

#### RF-04.4 — Headers e endpoint de limites
- Em `/api/coach/chat`:
  - Headers de resposta (em 200 E 429): `X-RateLimit-Limit: <limite>`, `X-RateLimit-Remaining: <restante>`, `X-RateLimit-Reset: <unix_timestamp_proxima_janela>`.
  - `Reset` = `createdAt` da mensagem mais antiga na janela + 24h (ou agora + 24h se nao houver mensagens).
- 429 quando atinge limite: body `{message: 'Limite de X mensagens por dia atingido.', limit: X, resetAt: <ISO string>}`.
- Novo endpoint `GET /api/coach/limits`:
  - Auth obrigatoria.
  - Response: `{plan: 'free'|'pro'|'premium'|'admin', dailyLimit: number|'unlimited', messagesUsedToday: number, messagesRemaining: number|'unlimited', resetAt: string|null, accessibleCoaches: Array<'mental'|'tournament'|'technical'>}`
  - Admin retorna `dailyLimit: 'unlimited'`.

#### RF-04.5 — Admin bypass
- `req.user.role === 'admin'` OU `req.user.subscriptionPlan === 'admin'` pula completamente o check de rate limit e o gate de coach.
- Headers ainda retornam `X-RateLimit-Limit: unlimited`.

#### RF-04.6 — Backward-compat
- Sessoes ativas existentes nao sao invalidadas. Apenas novas mensagens sao gated.
- Historico de `chatMessages` nao e afetado.

**Criterios de aceitacao:**
- [ ] Free tenta `/api/coach/chat` com `coachType='technical'`: 403 com `{message, upgradeTo: 'premium', currentPlan: 'free'}`.
- [ ] Pro tenta `/api/coach/chat` com `coachType='technical'`: 403 com `{message, upgradeTo: 'premium', currentPlan: 'pro'}`.
- [ ] Pro com `coachType='tournament'`: 200 (fluxo normal).
- [ ] Premium com qualquer coach: 200.
- [ ] Admin com qualquer coach: 200, sem contar no rate limit.
- [ ] Free apos 10 msgs em 24h: 429 com headers e body corretos.
- [ ] Pro apos 50 msgs em 24h: 429.
- [ ] Premium apos 200 msgs em 24h: 429.
- [ ] `GET /api/coach/limits` retorna contagem correta e `accessibleCoaches` condiz com plano.
- [ ] Admin em `/api/coach/limits`: `dailyLimit: 'unlimited'`.
- [ ] Window rolling: mensagem de 25h atras NAO conta; 23h59min conta.
- [ ] Headers `X-RateLimit-*` presentes em 200 e 429.
- [ ] Nenhuma sessao existente fica orfa ou invalida apos deploy.

---

## Requisitos Nao-Funcionais

- **Performance:** 
  - Latencia P95 do primeiro token SSE NAO pode regredir > +200ms vs linha de base (cache write tem overhead esperado de +10-20% apenas na primeira msg).
  - `GET /api/coach/limits` < 100ms P95.
  - `POST /api/coach/messages/:id/feedback` < 150ms P95.
  - `GET /api/admin/coach/feedback-stats` < 500ms P95 mesmo com 100k mensagens.
- **Custo:** Custo medio por mensagem amortizado em sessao de 5 msgs <= $0.012 USD.
- **Seguranca:** 
  - Endpoint admin `/api/admin/coach/feedback-stats` protegido por `requireAuth` + check explicito de `role='admin'`.
  - Feedback SQL injection-safe (Drizzle queries parametrizadas).
  - Comment sanitizado (trim, max 500 chars, sem HTML rendering).
- **Disponibilidade:** 
  - Falha do Anthropic API com cache habilitado nao deve bloquear retry — SDK ja retry default.
  - Graceful degradation: se `cache_control` falhar parser da Anthropic, logar e enviar sem cache (nao quebrar resposta).
- **Observabilidade:** 
  - Log estruturado de cada mensagem: `{userId, coachType, sessionId, tier, cache_hit_tokens, cache_write_tokens, input_tokens, output_tokens, latencyMs, model}`.
  - Metrica derivada: cache hit rate por hora (dashboard admin).
- **Retrocompatibilidade:** 
  - Zero perda de historico.
  - Zero invalidacao de sessoes ativas.
  - `user_ai_profile` preservado.
  - Sessoes antigas continuam respondendo mesmo sem as novas colunas de usage (default NULL, nao NOT NULL).

---

## Endpoints Previstos

### Novos
| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| POST | `/api/coach/messages/:id/feedback` | Enviar thumbs up/down em mensagem | JWT (owner) |
| DELETE | `/api/coach/messages/:id/feedback` | Remover feedback da mensagem | JWT (owner) |
| GET | `/api/coach/limits` | Consultar rate limit + coaches acessiveis | JWT |
| GET | `/api/admin/coach/feedback-stats` | Dashboard admin de qualidade | JWT + role=admin |

### Modificados
| Metodo | Rota | Mudanca | Auth |
|---|---|---|---|
| POST | `/api/coach/chat` | Adiciona gate de plano, rate limit tiered, headers X-RateLimit-*, grava usage tokens | JWT |

### Nao alterados
| Metodo | Rota | Notas |
|---|---|---|
| GET | `/api/coach/sessions` | Inalterado |
| GET | `/api/coach/sessions/:id/messages` | Inalterado (mas response inclui colunas novas de feedback e usage se existirem) |
| POST | `/api/coach/sessions/:id/archive` | Inalterado |
| DELETE | `/api/coach/sessions/:id` | Inalterado |
| GET/PUT | `/api/coach/profile` | Inalterado |
| GET | `/api/coach/monthly-summaries` | Inalterado |

---

## Modelos de Dados Afetados

### `chatMessages` (alteracao)

Adicionar colunas para telemetria de cache e feedback:

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| input_tokens | integer | nullable, default NULL | Tokens de entrada regulares (nao cache) |
| output_tokens | integer | nullable, default NULL | Tokens de saida |
| cache_creation_input_tokens | integer | nullable, default NULL | Tokens escritos no cache |
| cache_read_input_tokens | integer | nullable, default NULL | Tokens lidos do cache |
| model | varchar(64) | nullable | Modelo usado (ex: `claude-sonnet-4-6`) |
| latency_ms | integer | nullable | Latencia total do stream (null em user messages) |

**Indices novos:**
- `idx_chat_messages_session_created` (sessionId, createdAt) — acelera listagem e compactacao (REPLACE de `idx_chat_messages_session` isolado, se ja existir manter ambos; Drizzle push idempotente)
- `idx_chat_messages_role_created` (role, createdAt) — para queries de rate limit rolling

**Observacao:** `metadata` (jsonb) ja existe — pode ser usado como backup tambem, mas colunas dedicadas sao queryable e indexaveis para dashboard admin.

### `message_feedback` (NOVA tabela)

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | varchar | PK, nanoid | |
| message_id | varchar | FK → chat_messages.id ON DELETE CASCADE | Nao-null |
| user_id | varchar | FK → users.user_platform_id ON DELETE CASCADE | Nao-null |
| feedback | varchar(4) | NOT NULL, CHECK IN ('up','down') | enum |
| comment | text | nullable, max 500 via Zod | |
| created_at | timestamp | default now() | |

**Indices:**
- `uniq_message_feedback_user_message` UNIQUE (`message_id`, `user_id`) — um feedback por par (user, msg)
- `idx_message_feedback_message` (`message_id`) — lookup por msg
- `idx_message_feedback_feedback_created` (`feedback`, `created_at`) — para dashboard admin

**Schema Zod:**
```ts
export const insertMessageFeedbackSchema = createInsertSchema(messageFeedback).omit({
  id: true,
  createdAt: true,
}).extend({
  feedback: z.enum(['up', 'down']),
  comment: z.string().max(500).optional().nullable(),
});
```

### `users` (nao alteracao — reuso)

Colunas existentes `role` e `subscriptionPlan` sao suficientes. Sem mudancas.

### `user_subscriptions` (nao alteracao — reuso)

Consultada via `resolveUserTier` para distinguir pro de premium.

### Migracao

- Rodar via `npm run db:push` (Drizzle push — projeto ja usa esse fluxo, ver secao 5 do CLAUDE.md).
- Drizzle gerencia colunas novas idempotentemente.
- Nenhum backfill necessario: colunas aceitam NULL, `message_feedback` comeca vazia.

---

## Integracoes Externas

| Servico | Proposito | Quando |
|---|---|---|
| Anthropic API (Messages streaming) | Chat streaming + prompt caching | A cada POST /api/coach/chat (cacheado) |
| Anthropic API (Messages sync) | Compactacao mensal (Haiku 4.5) | Cron job mensal existente |

**Sem novos servicos externos.**

---

## Cenarios de Teste Derivados

### RF-01 — Prompt Caching

#### Happy Path
- [ ] Primeira mensagem de sessao: `assembleContext` retorna `system` como array com bloco marcado `cache_control: {type: 'ephemeral'}`.
- [ ] Request a Anthropic envia system em array com cache_control presente (verificado por mock do SDK).
- [ ] Resposta stream completa salva `cache_creation_input_tokens > 0` na msg assistant.
- [ ] Segunda msg dentro de 5 min na mesma sessao: salva `cache_read_input_tokens > 0` e `cache_creation_input_tokens = 0`.

#### Validacao de Input
- [ ] `max_tokens=2048` aplicado no stream request.
- [ ] Modelo `claude-sonnet-4-6` (via env `CLAUDE_COACH_MODEL` com default).

#### Edge Cases
- [ ] Usuario sem `userAiProfile`: bloco estatico ainda existe, cache write funciona.
- [ ] Mensagem disparada apos 6+ min da anterior: cache miss esperado (reconstrucao do cache aceita).
- [ ] Anthropic retorna erro 400 "cache_control malformed": fallback para envio sem cache, log estruturado, resposta ainda funciona.
- [ ] `buildStaticSystemBlock` e `buildDynamicSystemBlock` sao puros (dado mesmo input → mesmo output).

### RF-02 — Thumbs up/down + Citations

#### Happy Path
- [ ] POST `/feedback` com `{feedback: 'up'}` em msg de assistant propria: 201, registro criado.
- [ ] POST com `{feedback: 'down', comment: 'Alucinou sobre ROI'}`: 201, comment salvo.
- [ ] DELETE `/feedback` em feedback existente: 200, registro removido.
- [ ] `GET /api/admin/coach/feedback-stats` com admin: JSON com campos esperados.
- [ ] Prompt enviado a Anthropic contem instrucao de citation e exemplos.

#### Validacao de Input
- [ ] POST com `feedback='maybe'`: 400.
- [ ] POST com `comment` de 501 chars: 400.
- [ ] POST sem body: 400.

#### Regras de Negocio
- [ ] POST em msg com `role='user'`: 400 `{message: 'Nao e possivel dar feedback em mensagem do usuario'}`.
- [ ] POST em msg de outro usuario (session.userId != req.user): 403.
- [ ] POST duplicado (mesmo user+message): 409.
- [ ] DELETE + POST: cria novo registro com sucesso.
- [ ] GET admin com user nao-admin: 403.

#### Edge Cases
- [ ] DELETE em feedback inexistente: 404.
- [ ] `/feedback-stats` sem dados: retorna estrutura vazia mas valida (`{globalCounts: {mental: {up:0, down:0}, ...}}`).
- [ ] Cascata: deletar `chatMessages` remove `messageFeedback` (ON DELETE CASCADE).
- [ ] Prompt integration test: resposta a pergunta com dado quantitativo contem `[Fonte: ...]`.

### RF-03 — Confidence Tags

#### Happy Path
- [ ] Prompt contem as 3 tags e 3+ exemplos.
- [ ] `parseConfidenceTags("Seu ROI [confianca: alta, N=450] esta OK")` retorna 3 nodes (text, badge, text).
- [ ] Badge `alta` usa classe verde.
- [ ] Integration test: pergunta sobre amostra pequena retorna resposta com `[confianca: baixa, ...]`.

#### Validacao de Input (parser)
- [ ] Tag aninhada `[confianca: alta, [confianca: baixa, N=5] N=10]` renderiza como texto literal (graceful).
- [ ] Tag malformada `[confianca: extrema, N=abc]` → texto literal.
- [ ] Tag sem N: `[confianca: alta]` → texto literal.
- [ ] Multiplas tags na mesma resposta: todas parseadas corretamente.

#### Edge Cases
- [ ] Resposta sem tags: renderizada normalmente, sem nodes de badge.
- [ ] Tag no inicio da resposta: primeiro node e badge.
- [ ] Tag no final: ultimo node e badge.
- [ ] Acessibilidade: componente tem `role="status"` + `aria-label`.

### RF-04 — Rate Limit Tiered + Coach Gate

#### Happy Path
- [ ] Free + `coachType='mental'`: 200.
- [ ] Pro + `coachType='tournament'`: 200.
- [ ] Premium + `coachType='technical'`: 200.
- [ ] Admin + qualquer coach: 200.

#### Validacao de Input
- [ ] `GET /api/coach/limits` sem auth: 401.

#### Regras de Negocio
- [ ] Free + `technical`: 403 `{upgradeTo: 'premium', currentPlan: 'free'}`.
- [ ] Pro + `technical`: 403 `{upgradeTo: 'premium', currentPlan: 'pro'}`.
- [ ] Free + `tournament`: 403 `{upgradeTo: 'pro', currentPlan: 'free'}`.
- [ ] Free apos 10 msgs em 24h: 429 com `X-RateLimit-Limit: 10`, `X-RateLimit-Remaining: 0`, `X-RateLimit-Reset` presente.
- [ ] Pro apos 50 msgs: 429.
- [ ] Premium apos 200 msgs: 429.
- [ ] Admin sem limite: 401a msg passa.
- [ ] Janela rolling: msg de 25h atras nao conta.
- [ ] Msg de 23h59min atras conta.

#### Edge Cases
- [ ] `resolveUserTier` com `subscriptionPlan='admin'` OU `role='admin'`: retorna `'admin'`.
- [ ] `resolveUserTier` com `subscriptionPlan='expired'`: retorna `'free'`.
- [ ] `resolveUserTier` com valor nao mapeado: `'free'` (default seguro).
- [ ] Usuario que upgrade de Free → Pro no meio da janela: a proxima msg ja usa o novo limite (50).
- [ ] `/api/coach/limits` admin retorna `dailyLimit: 'unlimited'`, `messagesRemaining: 'unlimited'`, `resetAt: null`.
- [ ] `/api/coach/limits` free que ainda nao mandou msgs: `messagesUsedToday: 0`, `resetAt: null`.
- [ ] Concurrency: 2 requests simultaneos com 1 slot restante — apenas 1 passa, outro recebe 429 (proteger via contagem atomica).

### Dashboard Admin (metricas)

- [ ] Pagina admin consome `/api/admin/coach/feedback-stats` e renderiza sem erro.
- [ ] Custo estimado por dia calculado: `(sum(input_tokens)*3 + sum(cache_read_input_tokens)*0.30 + sum(cache_creation_input_tokens)*3.75 + sum(output_tokens)*15) / 1_000_000` (em USD).
- [ ] Cache hit rate medio renderizado por coach type.
- [ ] Taxa thumbs up/total por coach type (semana).
- [ ] Lista top 20 `feedback_down` com comment e sample de resposta.

---

## Fora de Escopo

Listar explicitamente o que NAO esta neste sprint para evitar scope creep:

- **Tool use / agent actions** (A4 no plano estrategico). Coach NAO executa acoes — so conversa. Fica para Coach-2 ou Coach-3.
- **Citations com tool use estruturado** — nesta sprint sao apenas formatacao textual via prompt. Sem tool use.
- **Contexto dinamico via intent classifier (A2 / RAG)** — contexto continua assemblando todos os dados, so bloco estatico cacheado muda.
- **Embeddings / pgvector (A3)** — sem mudanca de memoria.
- **Notificacoes proativas (B1, B2, B5)** — ficam para Coach-3.
- **Integracao com Tournament Selector e Bankroll (C1, C2)** — Coach-2.
- **A/B testing de prompts (D5)** — depende de D1 + volume.
- **Coach Red Team (D4)** — depende de volume >10k mensagens.
- **Hand history parser / multimodal (A5, E1)** — fase seguinte.
- **Voice interface (C5)** — descartado.
- **Cobrar por mensagem ou overage** — hard limit 429, sem billing variavel nesta sprint.
- **Pagina admin `/admin/coach-analytics` full** — nesta sprint so o endpoint + consumo minimo. UI rica fica para incremento posterior se sinalizado.
- **Migracao de mensagens antigas para colunas de usage** — NULL e aceitavel, sem backfill.

---

## Dependencias

- **Nenhuma feature bloqueante.** Pode iniciar imediatamente.
- `user_subscriptions` e `subscriptionPlans` ja existem e estao populados.
- `users.role` e `users.subscriptionPlan` ja existem.
- Anthropic API key (`ANTHROPIC_API_KEY`) ja configurada em producao.
- Modelos novos (`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) requerem verificacao de disponibilidade na API no momento do deploy; se indisponiveis, fallback via env `CLAUDE_COACH_MODEL` / `CLAUDE_MEMORY_MODEL`.

---

## Plano de Rollout (cada item mergeable independentemente)

Ordem mandatoria (cada etapa isoladamente mensuravel):

### Etapa 1 — RF-01 (Prompt Caching)
1. Criar `server/coachSystemBuilder.ts` com `buildStaticSystemBlock` e `buildDynamicSystemBlock`.
2. Refatorar `assembleContext` para retornar `system: Array<...>` com `cache_control` no estatico.
3. Schema push: adicionar colunas `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `model`, `latency_ms` a `chatMessages`.
4. `handleCoachChat` captura `message.usage` do stream e grava na msg assistant.
5. Migrar modelos (`sonnet-4-6`, `haiku-4-5`) com env fallback.
6. Aumentar `max_tokens` para 2048.
7. Testes unitarios + integracao conforme cenarios RF-01.
8. **Medir e validar criterios:** cache hit rate >= 60%, custo medio <= $0.012/msg.

### Etapa 2 — RF-02 (Thumbs + Citations)
1. Criar tabela `message_feedback` via schema Drizzle + `npm run db:push`.
2. Atualizar prompt com instrucao de citation + exemplos.
3. Endpoints `POST/DELETE /api/coach/messages/:id/feedback`.
4. Endpoint admin `/api/admin/coach/feedback-stats`.
5. Testes conforme cenarios RF-02.

### Etapa 3 — RF-03 (Confidence Tags)
1. Atualizar prompt com instrucoes de `[confianca: ...]` + `[nao sei: ...]` e few-shot.
2. Criar `client/src/lib/coachMessageParser.ts`.
3. Criar `client/src/components/coach/ConfidenceBadge.tsx`.
4. Integrar no componente de chat (renderizacao de mensagens do assistant).
5. Testes unitarios do parser + testes de renderizacao do badge.
6. Teste de integracao end-to-end (pergunta → resposta com tag → renderizacao).

### Etapa 4 — RF-04 (Rate Limit + Gate)
1. Criar `server/coachAccess.ts` com `resolveUserTier`, `getRateLimitForPlan`, `canAccessCoach`.
2. Substituir `countUserMessagesInLastHour` por `countUserMessagesInLastDay`.
3. Atualizar `handleCoachChat` com novo gate + headers + 429 tiered.
4. Endpoint `GET /api/coach/limits`.
5. Frontend: interceptor para 403 exibe modal de upgrade com CTA dinamico por `upgradeTo`.
6. Testes conforme cenarios RF-04.

### Migracoes DB — quando rodar `npm run db:push`
- Apos Etapa 1 passo 3 (colunas de usage)
- Apos Etapa 2 passo 1 (tabela `message_feedback`)
- Comando: `npm run db:push` (projeto ja usa esse fluxo — CLAUDE.md secao 5)
- Local: desenvolvimento (auto-modo mantem deploy local — `memory/deploy_strategy_2026-04-24.md`)
- Rollback: se push falhar, as colunas sao nullable e tabela nova — DROP safe.

### Feature flags (opcional)
- Se desejado, proteger RF-01 via `COACH_PROMPT_CACHE_ENABLED` env (default true). Util se cache API der problema em producao.
- RF-04 sem flag — mudanca de rate limit e imediata na sprint.

---

## Notas de Implementacao (opcional, para Test-Writer e Implementer)

### Precos Anthropic (para calculo de custo)
Modelos Sonnet (valores publicados, sujeitos a mudanca):
- Input regular: $3.00 / 1M tokens
- Cache write (creation): $3.75 / 1M tokens (+25%)
- Cache read: $0.30 / 1M tokens (-90%)
- Output: $15.00 / 1M tokens

### Exemplo de estrutura de `system` array

```ts
const system = [
  {
    type: 'text',
    text: baseCoachPrompt + safetyRules + userProfile + statsSnapshot + lastSummary,
    cache_control: { type: 'ephemeral' },
  },
  {
    type: 'text',
    text: activeGrindBlock + weeklyPlanBlock + breakFeedbacksBlock + leaksBlock,
    // sem cache_control — dinamico
  },
];
```

### Exemplo de captura de usage no stream
```ts
const stream = anthropicClient.messages.stream({ ... });
let usage: any = {};
for await (const event of stream) {
  if (event.type === 'message_start') {
    usage = { ...(event.message as any).usage };
  }
  if (event.type === 'message_delta') {
    usage = { ...usage, ...(event.usage || {}) };
  }
  // ... streaming chunks
}
// Save to chatMessages with usage fields
```

### Helpers sugeridos
- `server/coachAccess.ts`:
  - `resolveUserTier(userId): Promise<Tier>`
  - `getRateLimitForPlan(tier): {daily: number | 'unlimited'}`
  - `canAccessCoach(tier, coachType): boolean`
  - `getAccessibleCoaches(tier): CoachType[]`
  - `getUpgradeTarget(currentTier, requestedCoach): 'pro' | 'premium' | null`

- `server/coachUsage.ts`:
  - `recordMessageUsage(messageId, { usage, model, latencyMs }): Promise<void>`
  - `calculateMessageCost(usage, model): number` (USD)

### Admin dashboard
- Rota sugerida frontend: `/admin/coach-analytics`.
- Nesta sprint, UI minima (tabela + card de custo/dia) suficiente. Refino visual fica fora de escopo.

---

## Verificacao Final

- [x] Cada requisito tem criterios de aceitacao verificaveis.
- [x] Cenarios de teste cobrem happy path, validacao, regras, edge cases.
- [x] Seccao "Fora de Escopo" preenchida.
- [x] Sem ambiguidade — cada regra tem interpretacao unica.
- [x] Spec independente o suficiente para Test-Writer gerar testes sem perguntas adicionais.
- [x] Endpoints listados com metodo, rota, descricao e auth.
- [x] Modelos de dados afetados documentados com campos e constraints.
- [x] Plano de rollout com 4 etapas mergeable.
- [x] Decisao de janela (24h rolling) documentada.
- [x] Fallback de modelo via env documentado.
- [x] Mapeamento `subscriptionPlan` → tier explicito.
