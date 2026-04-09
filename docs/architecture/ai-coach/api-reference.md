# AI Coach — API Reference

Documentacao completa dos endpoints do AI Coach. Todos os endpoints requerem autenticacao JWT (`requireAuth`).

**Base path:** `/api/coach`
**Route file:** `server/routes/coach.ts`

---

## POST `/api/coach/chat`

**Descricao:** Envia mensagem para um coach e recebe resposta via Server-Sent Events (streaming).
**Auth:** JWT (Bearer token)
**Rate Limit:** 30 mensagens por hora por usuario
**Response Type:** `text/event-stream` (SSE)

**Request:**

| Param | Tipo | Onde | Obrigatorio | Notas |
|-------|------|------|-------------|-------|
| coachType | string | body | Sim | `"mental"`, `"tournament"` ou `"technical"` |
| message | string | body | Sim | Max 2000 caracteres |
| sessionId | string | body | Nao | Se omitido, cria nova sessao (e arquiva a ativa anterior) |

**Body exemplo:**
```json
{
  "coachType": "mental",
  "message": "Estou com dificuldade de manter o foco apos 3 horas de grind. Alguma dica?",
  "sessionId": "abc123nanoid"
}
```

**SSE Events:**

| Event type | Quando | Body exemplo |
|-----------|--------|-------------|
| `text` | Cada chunk de resposta | `data: {"type":"text","content":"Entendo sua "}\n\n` |
| `done` | Resposta completa | `data: {"type":"done","messageId":"msg_xyz"}\n\n` |
| `error` | Erro na Claude API | `data: {"type":"error","message":"Coach temporariamente indisponivel"}\n\n` |

**Respostas HTTP (antes do streaming):**

| Status | Quando | Body exemplo |
|--------|--------|-------------|
| 200 | Streaming iniciado | SSE stream (ver acima) |
| 400 | Input invalido | `{ "message": "Mensagem deve ter no maximo 2000 caracteres" }` |
| 400 | coachType invalido | `{ "message": "coachType deve ser mental, tournament ou technical" }` |
| 400 | sessionId de coachType diferente | `{ "message": "Sessao nao pertence a este coach" }` |
| 401 | Sem token JWT | `{ "message": "Nao autorizado" }` |
| 403 | sessionId de outro usuario | `{ "message": "Acesso negado" }` |
| 429 | Rate limit excedido | `{ "message": "Limite de 30 mensagens por hora atingido" }` |

**Comportamento:**
1. Se `sessionId` nao fornecido, cria nova sessao e arquiva a ativa do mesmo coachType
2. Monta contexto (system prompt + perfil IA + stats + resumos + historico + mensagem)
3. Salva mensagem do usuario imediatamente (antes do streaming)
4. Inicia streaming via SSE
5. Ao concluir, salva resposta do assistant e atualiza token count da sessao
6. Se primeira mensagem da sessao, gera titulo automatico (primeiros 50 chars)
7. Se primeira mensagem do mes, dispara compactacao mensal em background

---

## GET `/api/coach/sessions`

**Descricao:** Lista sessoes de chat do usuario filtradas por tipo de coach.
**Auth:** JWT
**Performance:** < 200ms

**Request:**

| Param | Tipo | Onde | Obrigatorio | Notas |
|-------|------|------|-------------|-------|
| coachType | string | query | Sim | `"mental"`, `"tournament"` ou `"technical"` |

**Request exemplo:**
```
GET /api/coach/sessions?coachType=mental
```

**Resposta:**

| Status | Quando | Body exemplo |
|--------|--------|-------------|
| 200 | Sucesso | Ver abaixo |
| 400 | coachType invalido | `{ "message": "coachType invalido" }` |
| 401 | Sem auth | `{ "message": "Nao autorizado" }` |

**Body 200:**
```json
[
  {
    "id": "abc123",
    "coachType": "mental",
    "title": "Dificuldade de foco apos 3 horas de grind",
    "status": "active",
    "messageCount": 12,
    "tokenCount": 4500,
    "createdAt": "2026-04-08T14:30:00.000Z",
    "updatedAt": "2026-04-08T15:45:00.000Z"
  },
  {
    "id": "def456",
    "coachType": "mental",
    "title": "Preparacao mental para sessao de domingo",
    "status": "archived",
    "messageCount": 8,
    "tokenCount": 3200,
    "createdAt": "2026-04-05T10:00:00.000Z",
    "updatedAt": "2026-04-05T11:20:00.000Z"
  }
]
```

**Notas:**
- Ordenadas por `updatedAt DESC`
- Nao retorna sessoes com status `deleted`
- Nao inclui campo `summary` (economiza payload)

---

## GET `/api/coach/sessions/:id/messages`

**Descricao:** Retorna mensagens de uma sessao com paginacao.
**Auth:** JWT

**Request:**

| Param | Tipo | Onde | Obrigatorio | Notas |
|-------|------|------|-------------|-------|
| id | string | path | Sim | ID da sessao |
| limit | integer | query | Nao | Default: 50, max: 100 |
| offset | integer | query | Nao | Default: 0 |

**Request exemplo:**
```
GET /api/coach/sessions/abc123/messages?limit=50&offset=0
```

**Resposta:**

| Status | Quando | Body exemplo |
|--------|--------|-------------|
| 200 | Sucesso | Ver abaixo |
| 401 | Sem auth | `{ "message": "Nao autorizado" }` |
| 403 | Sessao de outro usuario | `{ "message": "Acesso negado" }` |
| 404 | Sessao nao encontrada | `{ "message": "Sessao nao encontrada" }` |

**Body 200:**
```json
{
  "messages": [
    {
      "id": "msg_001",
      "role": "user",
      "content": "Estou com dificuldade de manter o foco apos 3 horas de grind.",
      "tokenCount": 18,
      "createdAt": "2026-04-08T14:30:00.000Z"
    },
    {
      "id": "msg_002",
      "role": "assistant",
      "content": "Entendo sua dificuldade. Analisando seus break feedbacks das ultimas sessoes...",
      "tokenCount": 250,
      "metadata": {
        "model": "claude-sonnet-4-5-20250514",
        "latency_ms": 1850
      },
      "createdAt": "2026-04-08T14:30:05.000Z"
    }
  ],
  "total": 12,
  "limit": 50,
  "offset": 0
}
```

**Notas:**
- Ordenadas por `createdAt ASC` (mensagens mais antigas primeiro)
- Valida que a sessao pertence ao usuario autenticado

---

## POST `/api/coach/sessions/:id/archive`

**Descricao:** Arquiva uma sessao de chat. Dispara compactacao em background (gera resumo + atualiza perfil IA).
**Auth:** JWT

**Request:**

| Param | Tipo | Onde | Obrigatorio | Notas |
|-------|------|------|-------------|-------|
| id | string | path | Sim | ID da sessao |

**Resposta:**

| Status | Quando | Body exemplo |
|--------|--------|-------------|
| 200 | Sucesso | `{ "message": "Sessao arquivada", "id": "abc123" }` |
| 401 | Sem auth | `{ "message": "Nao autorizado" }` |
| 403 | Sessao de outro usuario | `{ "message": "Acesso negado" }` |
| 404 | Sessao nao encontrada | `{ "message": "Sessao nao encontrada" }` |
| 409 | Sessao ja arquivada | `{ "message": "Sessao ja esta arquivada" }` |

**Comportamento:**
1. Muda status da sessao para `archived`
2. Em background (async): gera resumo via Haiku e atualiza perfil IA

---

## DELETE `/api/coach/sessions/:id`

**Descricao:** Soft-delete de uma sessao (muda status para `deleted`, nao apaga do banco).
**Auth:** JWT

**Request:**

| Param | Tipo | Onde | Obrigatorio | Notas |
|-------|------|------|-------------|-------|
| id | string | path | Sim | ID da sessao |

**Resposta:**

| Status | Quando | Body exemplo |
|--------|--------|-------------|
| 200 | Sucesso | `{ "message": "Sessao removida", "id": "abc123" }` |
| 401 | Sem auth | `{ "message": "Nao autorizado" }` |
| 403 | Sessao de outro usuario | `{ "message": "Acesso negado" }` |
| 404 | Sessao nao encontrada | `{ "message": "Sessao nao encontrada" }` |

**Notas:**
- Soft delete: status muda para `deleted`, dados permanecem no banco
- Sessoes deletadas nao aparecem na listagem

---

## GET `/api/coach/profile`

**Descricao:** Retorna o perfil IA do jogador (informacoes qualitativas acumuladas das conversas).
**Auth:** JWT

**Resposta:**

| Status | Quando | Body exemplo |
|--------|--------|-------------|
| 200 | Sucesso | Ver abaixo |
| 401 | Sem auth | `{ "message": "Nao autorizado" }` |

**Body 200:**
```json
{
  "id": "prof_123",
  "content": "## Objetivos\n- Meta de chegar a $50 ABI ate dezembro 2026\n- Profit mensal target: R$20k\n\n## Estilo\n- Joga tight-aggressive, forte em final tables\n- Prefere fields grandes (500+)\n\n## Contexto\n- Profissional full-time desde 2025\n- Joga 5 dias/semana, folga segunda e sexta\n\n## Decisoes\n- Cortou Turbos em marco 2026 (ROI negativo)\n- Migrou volume de PS para GG em fev 2026\n\n## Leaks\n- Tilt apos bad beats em PKO (trabalhando desde fev)\n- Foco cai apos 3h — implementando tecnica de respiracao\n\n## Preferencias\n- Prefere respostas com dados e numeros\n- Gosta de analogias esportivas",
  "version": 14,
  "tokenCount": 380,
  "updatedAt": "2026-04-07T18:30:00.000Z"
}
```

**Notas:**
- Retorna `null` para `content` se perfil ainda nao foi criado
- Perfil e compartilhado entre os 3 coaches

---

## PUT `/api/coach/profile`

**Descricao:** Edita manualmente o perfil IA do jogador (opcional — normalmente atualizado automaticamente).
**Auth:** JWT

**Request:**

| Param | Tipo | Onde | Obrigatorio | Notas |
|-------|------|------|-------------|-------|
| content | string | body | Sim | Max 2000 caracteres |

**Body exemplo:**
```json
{
  "content": "## Objetivos\n- Meta de $50 ABI ate dezembro 2026\n\n## Estilo\n- Tight-aggressive\n\n## Contexto\n- Full-time, 5 dias/semana"
}
```

**Resposta:**

| Status | Quando | Body exemplo |
|--------|--------|-------------|
| 200 | Sucesso | `{ "message": "Perfil atualizado", "version": 15 }` |
| 400 | Content > 2000 chars | `{ "message": "Perfil deve ter no maximo 2000 caracteres" }` |
| 401 | Sem auth | `{ "message": "Nao autorizado" }` |

**Notas:**
- Incrementa `version` do perfil
- Compactacao futura respeita edicoes manuais (usa como base)

---

## GET `/api/coach/monthly-summaries`

**Descricao:** Retorna resumos mensais do jogador por tipo de coach.
**Auth:** JWT

**Request:**

| Param | Tipo | Onde | Obrigatorio | Notas |
|-------|------|------|-------------|-------|
| coachType | string | query | Nao | Se omitido, retorna de todos os coaches |
| limit | integer | query | Nao | Default: 6 |

**Request exemplo:**
```
GET /api/coach/monthly-summaries?coachType=tournament&limit=3
```

**Resposta:**

| Status | Quando | Body exemplo |
|--------|--------|-------------|
| 200 | Sucesso | Ver abaixo |
| 401 | Sem auth | `{ "message": "Nao autorizado" }` |

**Body 200:**
```json
[
  {
    "id": "ms_001",
    "coachType": "tournament",
    "month": "2026-03",
    "summary": "Em marco, o jogador focou em otimizar game selection. Decisoes principais: (1) cortou Turbos $22 na GG (ROI -8% em 145 torneios), (2) aumentou volume em PKOs $33 na PS (ROI +18%). Leaks trabalhados: over-registration em horarios de field pequeno. Meta de 2000 torneios/mes foi atingida (2.147). ROI geral subiu de 12% para 15%.",
    "sessionsCompacted": 8,
    "tokenCount": 320,
    "createdAt": "2026-04-01T08:15:00.000Z"
  },
  {
    "id": "ms_002",
    "coachType": "tournament",
    "month": "2026-02",
    "summary": "Fevereiro foi mes de transicao: jogador migrou volume principal de PokerStars para GGPoker...",
    "sessionsCompacted": 5,
    "tokenCount": 280,
    "createdAt": "2026-03-02T10:00:00.000Z"
  }
]
```

**Notas:**
- Ordenados por `month DESC` (mais recente primeiro)
- Util para o jogador ver sua evolucao ao longo dos meses

---

## Resumo de Endpoints

| Metodo | Rota | Descricao | Rate Limit |
|--------|------|-----------|------------|
| POST | `/api/coach/chat` | Enviar mensagem (SSE streaming) | 30/hora |
| GET | `/api/coach/sessions` | Listar sessoes por coachType | - |
| GET | `/api/coach/sessions/:id/messages` | Mensagens com paginacao | - |
| POST | `/api/coach/sessions/:id/archive` | Arquivar sessao | - |
| DELETE | `/api/coach/sessions/:id` | Soft-delete sessao | - |
| GET | `/api/coach/profile` | Ver perfil IA | - |
| PUT | `/api/coach/profile` | Editar perfil IA | - |
| GET | `/api/coach/monthly-summaries` | Resumos mensais | - |

**Total:** 8 endpoints (5 da Spec 1 + 3 da Spec 3)
