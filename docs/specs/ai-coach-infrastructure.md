# Spec: AI Coach Infrastructure

## Status
Proposta

## Resumo
Infraestrutura compartilhada para os 3 coaches de IA do Grindfy: chat UI (pagina dedicada + mini-chat flutuante), integracao com Claude API, armazenamento de conversas, pipeline de montagem de contexto e sistema de streaming de respostas. Esta spec NAO define as personas dos coaches — apenas a fundacao tecnica que todos compartilham.

## Contexto
O Grindfy quer oferecer 3 coaches de IA especializados (Mental, Selecao de Torneios, Tecnico) que conversam com o jogador usando seus dados reais da plataforma. Nenhuma infraestrutura de chat ou LLM existe atualmente no projeto. Esta spec cria a base sobre a qual as Specs 2 (Personas) e 3 (Memoria Persistente) serao construidas.

**Decisoes ja tomadas pelo dev:**
- LLM: Claude API (Anthropic) como provedor principal
- UI: Pagina dedicada + mini-chat flutuante
- 3 coaches separados (Mental, Torneios/Grade, Tecnico)
- Feature gating: sera definido depois dos testes (por enquanto, acessivel a todos usuarios autenticados)

## Usuarios
- **Jogador (qualquer plano):** Envia mensagens para os coaches, recebe respostas baseadas em seus dados
- **Admin:** Visualiza metricas de uso dos coaches (futuro, fora de escopo desta spec)

## Requisitos Funcionais

### RF-01: Modelos de Dados do Chat
**Descricao:** Criar tabelas para armazenar sessoes de chat e mensagens individuais.
**Regras de negocio:**
- Cada sessao de chat pertence a 1 usuario e 1 tipo de coach (`mental`, `tournament`, `technical`)
- Mensagens tem role `user` ou `assistant`
- Sessoes tem status: `active`, `archived`
- Uma sessao ativa por coach por usuario (ao iniciar nova sessao, a anterior e arquivada automaticamente)
- Mensagens armazenam o token count estimado (para controle de custo)
- Sessoes armazenam um resumo compactado (`summary`) para uso como contexto em sessoes futuras (preenchido pela Spec 3)
**Criterio de aceitacao:**
- [ ] Tabela `chat_sessions` criada com campos: id, userId, coachType, title, status, summary, tokenCount, createdAt, updatedAt
- [ ] Tabela `chat_messages` criada com campos: id, sessionId, role, content, tokenCount, metadata (jsonb), createdAt
- [ ] Indices em userId+coachType e sessionId
- [ ] Zod schemas de insert gerados com `createInsertSchema`
- [ ] Foreign keys com onDelete cascade (sessao → usuario, mensagem → sessao)

### RF-02: Endpoint de Envio de Mensagem (Streaming)
**Descricao:** Endpoint que recebe a mensagem do usuario, monta o contexto, chama a Claude API e retorna a resposta via Server-Sent Events (streaming).
**Regras de negocio:**
- Autenticacao obrigatoria (`requireAuth`)
- Request body: `{ sessionId?: string, coachType: "mental" | "tournament" | "technical", message: string }`
- Se `sessionId` nao fornecido, criar nova sessao automaticamente
- Se `sessionId` fornecido, validar que pertence ao usuario e ao coachType correto
- Montar contexto na seguinte ordem (pipeline):
  1. **System prompt** do coach (fixo por tipo — vira da Spec 2, por enquanto usar prompt generico)
  2. **Perfil do usuario** (dados basicos: nome, plano, data de registro, total de torneios)
  3. **Snapshot de stats** (top-level stats do dashboard: ROI, profit, volume, ABI — carregados do banco)
  4. **Resumo da sessao anterior** (campo `summary` da ultima sessao arquivada deste coach, se existir)
  5. **Historico da sessao atual** (ultimas 20 mensagens da sessao corrente)
  6. **Mensagem do usuario** (a mensagem atual)
- Chamar Claude API com model `claude-sonnet-4-5-20250514` (custo-beneficio para chat)
- Streaming via SSE: cada chunk de texto enviado ao client como `data: {"type":"text","content":"..."}\n\n`
- Ao finalizar, enviar `data: {"type":"done","messageId":"..."}\n\n`
- Salvar mensagem do usuario e resposta completa do assistant no banco apos streaming
- Calcular e salvar token count estimado (chars / 4 como aproximacao)
- Em caso de erro da API, enviar `data: {"type":"error","message":"..."}\n\n` e salvar log
- Rate limit: 30 mensagens por hora por usuario
- Tamanho maximo da mensagem: 2000 caracteres
**Criterio de aceitacao:**
- [ ] POST `/api/coach/chat` aceita mensagem e retorna SSE stream
- [ ] Cria sessao automaticamente se nao fornecida
- [ ] Valida ownership da sessao
- [ ] Monta contexto com as 6 camadas na ordem correta
- [ ] Streaming funciona em tempo real (chunks aparecem progressivamente)
- [ ] Mensagens salvas no banco apos conclusao
- [ ] Token count estimado salvo por mensagem e acumulado na sessao
- [ ] Rate limit de 30/hora funciona
- [ ] Mensagens > 2000 chars rejeitadas com 400
- [ ] Erros da Claude API retornados gracefully via SSE

### RF-03: Endpoints de Gestao de Sessoes
**Descricao:** CRUD basico para sessoes e historico de mensagens.
**Regras de negocio:**
- Listar sessoes do usuario filtradas por coachType, ordenadas por updatedAt DESC
- Buscar mensagens de uma sessao (com paginacao: limit/offset)
- Arquivar sessao (mudar status para `archived`)
- Deletar sessao (soft delete: muda status para `deleted`, nao apaga do banco)
- Titulo da sessao: gerado automaticamente a partir da primeira mensagem do usuario (primeiros 50 chars)
**Criterio de aceitacao:**
- [ ] GET `/api/coach/sessions?coachType=mental` retorna sessoes do usuario
- [ ] GET `/api/coach/sessions/:id/messages?limit=50&offset=0` retorna mensagens paginadas
- [ ] POST `/api/coach/sessions/:id/archive` arquiva sessao
- [ ] DELETE `/api/coach/sessions/:id` soft-delete
- [ ] Titulo auto-gerado a partir da 1a mensagem
- [ ] Todos endpoints validam ownership (usuario so acessa suas proprias sessoes)

### RF-04: Pagina Dedicada do Coach (`/coach-ai`)
**Descricao:** Pagina com layout de chat dividida em 3 abas (uma por coach), com lista de sessoes na lateral e area de conversa principal.
**Regras de negocio:**
- Layout: sidebar esquerda com lista de sessoes + area principal de chat
- 3 abas no topo: "Mental" (icone Brain), "Torneios" (icone Trophy), "Tecnico" (icone GraduationCap)
- Trocar de aba carrega sessoes daquele coach
- Clicar em sessao carrega mensagens
- Botao "Nova Conversa" cria sessao nova (arquiva a atual automaticamente)
- Area de input na parte inferior com botao de enviar e suporte a Enter
- Mensagens do assistant renderizadas com Markdown (suporte a tabelas, listas, negrito, code blocks)
- Indicador de "digitando..." durante streaming
- Scroll automatico para ultima mensagem
- Responsivo: em mobile, sidebar de sessoes vira drawer
- Rota: `/coach-ai` (diferente de `/coach` que e o Grade Planner)
- Adicionar ao Sidebar na secao "GRIND" com icone `MessageSquare` e label "Coach IA"
**Criterio de aceitacao:**
- [ ] Pagina renderiza com 3 abas funcionais
- [ ] Lista de sessoes carrega por coach type
- [ ] Chat funciona com streaming (texto aparece progressivamente)
- [ ] Markdown renderizado corretamente nas respostas
- [ ] Indicador de loading durante streaming
- [ ] Scroll automatico funciona
- [ ] Botao "Nova Conversa" funciona
- [ ] Responsivo em mobile
- [ ] Entrada no Sidebar funciona e navega corretamente

### RF-05: Mini-Chat Flutuante
**Descricao:** Widget de chat compacto acessivel de qualquer pagina, fixo no canto inferior direito.
**Regras de negocio:**
- Botao circular flutuante no canto inferior direito (icone MessageSquare, cor verde tema do Grindfy)
- Ao clicar, expande para mini-chat (350px largura x 500px altura)
- Mini-chat tem: seletor de coach (3 icones), area de mensagens compacta, input
- Usa a MESMA sessao ativa do coach selecionado (compartilhada com a pagina dedicada)
- Botao para "Abrir em tela cheia" que navega para `/coach-ai` com o coach correto selecionado
- Fechavel (volta a ser apenas o botao)
- NAO aparece na pagina `/coach-ai` (redundante)
- NAO aparece em paginas publicas (login, register, landing)
- Posicao: `fixed bottom-4 right-4 z-50`
**Criterio de aceitacao:**
- [ ] Botao flutuante aparece em todas paginas protegidas exceto `/coach-ai`
- [ ] Expande para mini-chat funcional ao clicar
- [ ] Seletor de coach com 3 opcoes funciona
- [ ] Compartilha sessao com pagina dedicada
- [ ] Botao "Abrir em tela cheia" navega corretamente
- [ ] Fechavel e re-abrivel
- [ ] Nao aparece em paginas publicas
- [ ] Nao obstrui conteudo importante (posicionamento correto)

## Requisitos Nao-Funcionais
- **Performance:** Primeiro token do streaming deve aparecer em < 2s. Endpoint de listagem de sessoes em < 200ms.
- **Seguranca:** Chave da Claude API armazenada em variavel de ambiente (`ANTHROPIC_API_KEY`), nunca exposta ao client. Mensagens do usuario sanitizadas antes de enviar ao LLM (sem injection de system prompts). Rate limiting por usuario.
- **Custo:** Model `claude-sonnet-4-5-20250514` (mais barato que Opus). Token count rastreado por mensagem e sessao para monitoramento futuro de custos.
- **Resiliencia:** Se Claude API estiver fora, retornar erro amigavel ("Coach temporariamente indisponivel, tente novamente em alguns minutos"). Nao perder a mensagem do usuario — salvar mesmo se a resposta falhar.

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|--------|------|-----------|------|
| POST | `/api/coach/chat` | Enviar mensagem e receber resposta (SSE streaming) | JWT |
| GET | `/api/coach/sessions` | Listar sessoes do usuario (query: coachType) | JWT |
| GET | `/api/coach/sessions/:id/messages` | Mensagens de uma sessao (query: limit, offset) | JWT |
| POST | `/api/coach/sessions/:id/archive` | Arquivar sessao | JWT |
| DELETE | `/api/coach/sessions/:id` | Soft-delete sessao | JWT |

## Modelos de Dados Afetados

### chat_sessions (novo)
| Campo | Tipo | Constraints | Notas |
|-------|------|-------------|-------|
| id | varchar | PK, not null | nanoid() |
| userId | varchar | FK → users.userPlatformId, not null, onDelete cascade | |
| coachType | varchar | not null | enum: 'mental', 'tournament', 'technical' |
| title | varchar | | Auto-gerado da 1a mensagem (50 chars) |
| status | varchar | not null, default 'active' | enum: 'active', 'archived', 'deleted' |
| summary | text | | Resumo compactado (preenchido pela Spec 3) |
| tokenCount | integer | default 0 | Total de tokens acumulados na sessao |
| messageCount | integer | default 0 | Total de mensagens na sessao |
| createdAt | timestamp | defaultNow() | |
| updatedAt | timestamp | defaultNow() | |

**Indices:** `idx_chat_sessions_user_coach` em (userId, coachType), `idx_chat_sessions_status` em (status)

### chat_messages (novo)
| Campo | Tipo | Constraints | Notas |
|-------|------|-------------|-------|
| id | varchar | PK, not null | nanoid() |
| sessionId | varchar | FK → chat_sessions.id, not null, onDelete cascade | |
| role | varchar | not null | enum: 'user', 'assistant' |
| content | text | not null | Conteudo da mensagem |
| tokenCount | integer | default 0 | Tokens estimados desta mensagem |
| metadata | jsonb | | Dados extras (ex: model usado, latency, erro) |
| createdAt | timestamp | defaultNow() | |

**Indices:** `idx_chat_messages_session` em (sessionId), `idx_chat_messages_created` em (createdAt)

## Integracoes Externas

| Servico | Proposito | Quando |
|---------|-----------|--------|
| Claude API (Anthropic) | Gerar respostas dos coaches | A cada mensagem do usuario |

**Variavel de ambiente necessaria:** `ANTHROPIC_API_KEY`
**Dependencia npm:** `@anthropic-ai/sdk`

## Cenarios de Teste Derivados

### Happy Path
- [ ] Usuario envia mensagem, recebe resposta via streaming
- [ ] Usuario cria nova sessao automaticamente ao enviar 1a mensagem
- [ ] Usuario lista sessoes por tipo de coach
- [ ] Usuario navega entre sessoes e ve historico
- [ ] Usuario usa mini-chat e depois continua na pagina dedicada (mesma sessao)
- [ ] Usuario arquiva sessao e inicia nova

### Validacao de Input
- [ ] Mensagem vazia → 400
- [ ] Mensagem > 2000 chars → 400
- [ ] coachType invalido → 400
- [ ] sessionId de outro usuario → 403
- [ ] sessionId de coachType diferente → 400
- [ ] Sem token de auth → 401

### Regras de Negocio
- [ ] Rate limit: 31a mensagem em 1 hora → 429
- [ ] Nova sessao arquiva a anterior automaticamente
- [ ] Titulo gerado da 1a mensagem (max 50 chars)
- [ ] Token count acumulado corretamente na sessao
- [ ] Soft delete nao apaga dados, muda status

### Edge Cases
- [ ] Claude API timeout → erro amigavel via SSE, mensagem do usuario preservada
- [ ] Claude API rate limit → retry com backoff ou erro amigavel
- [ ] Conexao SSE cortada pelo client → resposta salva mesmo assim (fire-and-forget save)
- [ ] Sessao sem mensagens → nao aparece na lista (ou aparece vazia)
- [ ] Usuario sem torneios (stats vazias) → coach funciona com contexto minimo
- [ ] Mensagem com caracteres especiais / markdown / emojis → tratada corretamente
- [ ] Multiplas abas abertas no browser → SSE nao conflita

## Fora de Escopo
- **Personas/system prompts dos 3 coaches** → Spec 2
- **Memoria persistente e compactacao de contexto** → Spec 3
- **Feature gating por plano de assinatura** → sera definido apos testes
- **Metricas de uso para admin** → feature futura
- **Parser de hand histories** → feature futura separada
- **Voice input/output** → nao planejado
- **Upload de imagens no chat** → nao planejado
- **Compartilhamento de conversas** → nao planejado

## Dependencias
- Nenhuma feature existente precisa ser modificada (aditivo)
- Necessario: `ANTHROPIC_API_KEY` configurada no `.env`
- Necessario: `npm install @anthropic-ai/sdk`

## Notas de Implementacao
- **SSE pattern:** Usar `res.setHeader('Content-Type', 'text/event-stream')` + `res.write()` no Express. Claude SDK suporta streaming nativo via `client.messages.stream()`.
- **Context assembly:** Criar um modulo `server/coachContext.ts` que monta o array de messages para a Claude API. Cada "camada" de contexto e uma funcao que retorna string (ex: `buildUserProfile(userId)`, `buildStatsSnapshot(userId)`). Isso permite que a Spec 2 adicione camadas especificas por coach.
- **Markdown rendering:** Usar `react-markdown` com plugins `remark-gfm` (tabelas) e `rehype-highlight` (code blocks) no frontend.
- **Route file:** Criar `server/routes/coach.ts` com `registerCoachRoutes(app)` seguindo o padrao existente.
- **Sidebar:** Adicionar na secao "GRIND" do Sidebar.tsx, entre "Grade" e "Grind".
