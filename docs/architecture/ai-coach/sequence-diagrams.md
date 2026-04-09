# AI Coach — Sequence Diagrams

Diagramas de sequencia dos 3 fluxos principais do sistema de AI Coach.

---

## 1. Envio de Mensagem (Chat Streaming)

Fluxo completo: usuario envia mensagem, backend monta contexto, chama Claude API via streaming, retorna resposta via SSE, salva no banco.

```mermaid
sequenceDiagram
    actor User as Jogador
    participant UI as Chat Page / Mini-Chat
    participant API as POST /api/coach/chat
    participant RateLimit as Rate Limiter
    participant Sessions as Session Manager
    participant Context as Context Assembly<br/>(coachContext.ts)
    participant Prompts as Coach Prompts<br/>(coachPrompts.ts)
    participant DB as PostgreSQL
    participant Claude as Claude API<br/>(Sonnet)

    User->>UI: Digita mensagem e envia
    UI->>API: POST /api/coach/chat<br/>{ coachType, sessionId?, message }
    API->>API: requireAuth — valida JWT

    API->>RateLimit: Verifica 30 msgs/hora
    alt Rate limit excedido
        RateLimit-->>API: 429 Too Many Requests
        API-->>UI: { error: "Limite de mensagens atingido" }
        UI-->>User: Toast de erro
    end

    API->>API: Valida input (Zod)<br/>message <= 2000 chars, coachType valido

    alt sessionId nao fornecido
        API->>Sessions: Criar nova sessao
        Sessions->>DB: SELECT sessao ativa do mesmo coachType
        DB-->>Sessions: Sessao ativa existente (ou null)
        opt Sessao ativa encontrada
            Sessions->>DB: UPDATE status = 'archived'<br/>(trigger de compactacao async)
        end
        Sessions->>DB: INSERT chat_sessions<br/>(nanoid, userId, coachType, status='active')
        DB-->>Sessions: Nova sessao criada
        Sessions-->>API: sessionId
    else sessionId fornecido
        API->>DB: SELECT chat_sessions WHERE id AND userId
        DB-->>API: Sessao encontrada
        API->>API: Valida ownership + coachType match
    end

    API->>DB: INSERT chat_messages<br/>(role='user', content, tokenCount)
    DB-->>API: Mensagem do usuario salva

    API->>Context: assembleContext(userId, coachType, sessionId)

    par Queries paralelas
        Context->>Prompts: getXxxPrompt(coachType)
        Prompts-->>Context: System prompt do coach

        Context->>DB: SELECT user_ai_profile WHERE userId
        DB-->>Context: Perfil IA (ou null)

        Context->>DB: Queries de stats por coachType
        Note right of DB: Mental: break_feedbacks, preparation_logs,<br/>grind_sessions, weekly_routines<br/>Torneios: dashboard stats, analytics by site/buyin/<br/>category/speed/day, templates, grade<br/>Tecnico: stats completo, FT analytics,<br/>study_cards, leaks pre-computados
        DB-->>Context: Stats snapshot formatado

        Context->>DB: SELECT monthly_coach_summaries<br/>WHERE userId AND coachType<br/>ORDER BY month DESC LIMIT 3
        DB-->>Context: Resumos mensais (0-3)

        Context->>DB: SELECT summary FROM chat_sessions<br/>WHERE userId AND coachType AND status='archived'<br/>ORDER BY updatedAt DESC LIMIT 1
        DB-->>Context: Resumo da sessao anterior (ou null)

        Context->>DB: SELECT * FROM chat_messages<br/>WHERE sessionId<br/>ORDER BY createdAt DESC LIMIT 20
        DB-->>Context: Historico da sessao atual (0-20 msgs)
    end

    Context-->>API: { system: string, messages: Message[] }

    API->>UI: res.setHeader('Content-Type', 'text/event-stream')
    API->>Claude: client.messages.stream()<br/>model: claude-sonnet-4-5-20250514<br/>system + messages

    loop Cada chunk de texto
        Claude-->>API: StreamEvent (text delta)
        API-->>UI: data: {"type":"text","content":"chunk..."}\n\n
        UI-->>User: Texto aparece progressivamente
    end

    Claude-->>API: StreamEvent (message_stop)

    API->>DB: INSERT chat_messages<br/>(role='assistant', content=full_response, tokenCount)
    API->>DB: UPDATE chat_sessions<br/>SET tokenCount += total, messageCount += 2, updatedAt

    opt Primeira mensagem da sessao
        API->>DB: UPDATE chat_sessions SET title = message.substring(0, 50)
    end

    opt Primeira mensagem do mes (lazy trigger)
        API->>API: Verificar se existe monthly_summary do mes anterior
        Note right of API: Se nao existe, disparar<br/>compactacao mensal async<br/>(ver diagrama 3)
    end

    API-->>UI: data: {"type":"done","messageId":"xxx"}\n\n
    UI-->>User: Indicador de streaming desaparece

    alt Erro da Claude API
        Claude-->>API: Error (timeout, rate limit, etc.)
        API-->>UI: data: {"type":"error","message":"Coach temporariamente indisponivel"}\n\n
        Note right of API: Mensagem do usuario ja foi salva<br/>(nao se perde)
        UI-->>User: Mensagem de erro amigavel
    end
```

---

## 2. Compactacao de Sessao (Archive Trigger)

Fluxo executado em background quando uma sessao e arquivada. Gera resumo da sessao e atualiza o perfil IA do jogador.

```mermaid
sequenceDiagram
    participant Trigger as Archive Trigger<br/>(nova sessao criada OU<br/>archive manual OU<br/>30 mensagens atingidas)
    participant Memory as Memory Service<br/>(coachMemory.ts)
    participant DB as PostgreSQL
    participant Haiku as Claude API<br/>(Haiku)

    Trigger->>Memory: compactSession(sessionId)
    Note right of Memory: Processo assincrono<br/>(nao bloqueia o usuario)

    Memory->>DB: SELECT * FROM chat_messages<br/>WHERE sessionId<br/>ORDER BY createdAt ASC
    DB-->>Memory: Todas as mensagens da sessao

    alt Sessao com 0 mensagens
        Memory-->>Memory: Abort — nada a compactar
    end

    Memory->>Memory: Formatar historico como texto

    Memory->>Haiku: Prompt de sumarizacao:<br/>"Resuma esta conversa em 3-5 bullet points.<br/>Foque em: decisoes, insights, leaks,<br/>compromissos, info pessoal.<br/>Max 150 palavras."
    Haiku-->>Memory: Resumo da sessao (~200 tokens)

    Memory->>DB: UPDATE chat_sessions<br/>SET summary = resumo,<br/>status = 'archived'
    DB-->>Memory: Sessao atualizada

    %% Fase 2: Atualizar perfil IA
    Memory->>DB: SELECT content FROM user_ai_profile<br/>WHERE userId
    DB-->>Memory: Perfil atual (ou null)

    alt Perfil nao existe
        Memory->>DB: INSERT user_ai_profile<br/>(userId, content='', version=1)
        DB-->>Memory: Perfil criado vazio
    end

    Memory->>Haiku: Prompt de atualizacao de perfil:<br/>"Perfil atual: {current_profile}<br/>Resumo da sessao: {session_summary}<br/>Atualize incorporando novas info.<br/>Mantenha relevantes, remova obsoletas.<br/>Max 2000 chars. Formato bullet points<br/>por categoria: Objetivos, Estilo,<br/>Contexto, Decisoes, Leaks, Preferencias"
    Haiku-->>Memory: Perfil atualizado

    Memory->>Memory: Truncar se > 2000 chars

    Memory->>DB: UPDATE user_ai_profile<br/>SET content = novo_perfil,<br/>version = version + 1,<br/>tokenCount = estimado,<br/>updatedAt = now()
    DB-->>Memory: Perfil salvo

    alt Falha em qualquer etapa
        Memory->>Memory: Log erro (console.error)<br/>Sessao mantida intacta<br/>Retry na proxima oportunidade
    end
```

---

## 3. Compactacao Mensal (Lazy Trigger)

Executado na primeira mensagem do mes. Agrega resumos de todas as sessoes do mes anterior em um unico resumo mensal, e limpa mensagens antigas.

```mermaid
sequenceDiagram
    participant Chat as POST /api/coach/chat<br/>(lazy trigger)
    participant Memory as Memory Service<br/>(coachMemory.ts)
    participant DB as PostgreSQL
    participant Haiku as Claude API<br/>(Haiku)

    Chat->>Memory: checkMonthlyCompaction(userId, coachType)

    Memory->>Memory: Calcular mes anterior (YYYY-MM)

    Memory->>DB: SELECT id FROM monthly_coach_summaries<br/>WHERE userId AND coachType<br/>AND month = mesAnterior
    DB-->>Memory: Resultado

    alt Resumo mensal ja existe
        Memory-->>Chat: Skip — ja compactado (idempotente)
    end

    Memory->>DB: SELECT id, summary FROM chat_sessions<br/>WHERE userId AND coachType<br/>AND status = 'archived'<br/>AND createdAt BETWEEN inicio_mes AND fim_mes<br/>AND summary IS NOT NULL
    DB-->>Memory: Sessoes arquivadas do mes anterior

    alt Nenhuma sessao no mes anterior
        Memory-->>Chat: Skip — nada a compactar
    end

    Memory->>Memory: Concatenar todos os summaries

    alt Muitas sessoes (>20)
        Memory->>Memory: Dividir em batches de 20
        loop Cada batch
            Memory->>Haiku: Resumir batch
            Haiku-->>Memory: Resumo parcial
        end
        Memory->>Memory: Resumo final dos parciais
    end

    Memory->>Haiku: Prompt de compactacao mensal:<br/>"Resuma a evolucao deste jogador<br/>no ultimo mes baseado nestas conversas<br/>com o coach {type}:<br/>{all_session_summaries}<br/>Foque em: evolucao, decisoes,<br/>leaks trabalhados, metas.<br/>Max 300 palavras."
    Haiku-->>Memory: Resumo mensal (~400 tokens)

    Memory->>DB: INSERT monthly_coach_summaries<br/>(userId, coachType, month, summary,<br/>sessionsCompacted, tokenCount)
    DB-->>Memory: Resumo mensal salvo

    %% Limpeza de mensagens antigas (>60 dias)
    Memory->>DB: DELETE FROM chat_messages<br/>WHERE sessionId IN (<br/>  SELECT id FROM chat_sessions<br/>  WHERE userId AND createdAt < now() - 60 days<br/>)
    DB-->>Memory: Mensagens antigas removidas
    Note right of DB: Sessoes mantidas (com summary)<br/>Apenas chat_messages deletadas

    alt Falha em qualquer etapa
        Memory->>Memory: Log erro<br/>Retry na proxima mensagem do usuario<br/>(idempotente — verifica se ja existe)
    end

    Memory-->>Chat: Compactacao concluida
```

---

## Notas

- **Modelos Claude usados:**
  - Chat (streaming): `claude-sonnet-4-5-20250514` — custo-beneficio para respostas interativas
  - Compactacao (background): `claude-haiku-4-5-20251001` — mais barato, suficiente para sumarizacao
- **Todos os processos de compactacao sao async** — nao bloqueiam a UX do usuario
- **Idempotencia:** Compactacao mensal verifica se ja existe antes de executar
- **Resiliencia:** Falhas nao perdem dados — sessoes e mensagens originais sao mantidas ate compactacao bem-sucedida
- **Limpeza:** Mensagens com mais de 60 dias sao deletadas apenas apos compactacao mensal bem-sucedida
