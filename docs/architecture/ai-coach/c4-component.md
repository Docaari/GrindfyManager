# AI Coach — C4 Component Diagram

Diagrama de componentes mostrando a arquitetura interna do AI Coach e como se integra ao sistema existente do Grindfy.

## Diagrama

```mermaid
graph TB
    user["Jogador<br/><i>Browser</i>"]

    subgraph frontend["Frontend React (client/src/)"]
        coachPage["Coach AI Page<br/><i>/coach-ai<br/>Layout: sidebar sessoes + area chat<br/>3 abas: Mental, Torneios, Tecnico</i>"]
        miniChat["Mini-Chat Flutuante<br/><i>Widget fixed bottom-right<br/>350x500px, seletor de coach<br/>Compartilha sessao com pagina dedicada</i>"]
        coachTabs["Coach Tabs<br/><i>Componente de abas<br/>Brain (Mental), Trophy (Torneios),<br/>GraduationCap (Tecnico)</i>"]
        chatUI["Chat UI Components<br/><i>MessageList, MessageInput,<br/>SessionList, StreamingIndicator<br/>react-markdown + remark-gfm</i>"]
        sidebar["Sidebar.tsx<br/><i>Entrada 'Coach IA' na secao GRIND<br/>Icone: MessageSquare</i>"]
    end

    subgraph backend["Backend Express (server/)"]
        coachRoutes["Coach Routes<br/><i>server/routes/coach.ts<br/>registerCoachRoutes(app)<br/>5 endpoints, requireAuth</i>"]

        subgraph coachCore["Coach Core"]
            contextAssembly["Context Assembly<br/><i>server/coachContext.ts<br/>assembleContext(userId, coachType, sessionId)<br/>Queries paralelas, budget de tokens</i>"]
            coachPrompts["Coach Prompts<br/><i>server/coachPrompts.ts<br/>getMentalPrompt(ctx)<br/>getTournamentPrompt(ctx)<br/>getTechnicalPrompt(ctx)</i>"]
            memoryService["Memory Service<br/><i>server/coachMemory.ts<br/>compactSession(sessionId)<br/>updateProfile(userId, summary)<br/>checkMonthlyCompaction(userId, coachType)</i>"]
            leakDetection["Leak Detection<br/><i>server/coachLeaks.ts<br/>8 regras rule-based<br/>Apenas Coach Tecnico</i>"]
        end

        subgraph contextLoaders["Context Loaders (server/coachContext.ts)"]
            mentalLoader["buildMentalContext()<br/><i>break_feedbacks (10)<br/>preparation_logs (5)<br/>grind_sessions metricas<br/>correlacao mental-resultado<br/>weekly_routines</i>"]
            tournamentLoader["buildTournamentContext()<br/><i>dashboard stats<br/>analytics by site/buyin/<br/>category/speed/day/field<br/>top 10 melhores/piores templates<br/>grade atual, perfis ativos</i>"]
            technicalLoader["buildTechnicalContext()<br/><i>17 core metrics<br/>FT analytics<br/>study_cards + sessions<br/>coaching_insights<br/>leaks pre-computados (8 tipos)</i>"]
        end

        existingStorage["storage.ts<br/><i>Camada de dados existente<br/>getDashboardStats()<br/>getAnalyticsBySite()<br/>getTournamentLibrary()<br/>etc.</i>"]
    end

    subgraph external["Sistemas Externos"]
        claudeSonnet["Claude API — Sonnet<br/><i>claude-sonnet-4-5-20250514<br/>Chat interativo (streaming)<br/>~6600 tokens input/msg</i>"]
        claudeHaiku["Claude API — Haiku<br/><i>claude-haiku-4-5-20251001<br/>Compactacao (background)<br/>Session summary, profile update,<br/>monthly compaction</i>"]
        db[("PostgreSQL 16<br/><i>Neon Serverless<br/>Tabelas: chat_sessions,<br/>chat_messages, user_ai_profile,<br/>monthly_coach_summaries</i>")]
    end

    %% Frontend connections
    user -->|"HTTPS"| coachPage
    user -->|"HTTPS"| miniChat
    coachPage --> coachTabs
    coachPage --> chatUI
    miniChat --> chatUI
    sidebar -->|"Navegacao /coach-ai"| coachPage

    %% Frontend to Backend
    chatUI -->|"POST /api/coach/chat<br/>SSE streaming response"| coachRoutes
    chatUI -->|"GET /api/coach/sessions<br/>GET /api/coach/sessions/:id/messages"| coachRoutes
    chatUI -->|"POST /api/coach/sessions/:id/archive<br/>DELETE /api/coach/sessions/:id"| coachRoutes

    %% Backend internal
    coachRoutes -->|"Monta contexto<br/>por coachType"| contextAssembly
    contextAssembly -->|"System prompt<br/>com dados injetados"| coachPrompts
    contextAssembly -->|"Dados mental game"| mentalLoader
    contextAssembly -->|"Dados game selection"| tournamentLoader
    contextAssembly -->|"Dados estrategia + leaks"| technicalLoader
    technicalLoader -->|"8 regras de leak"| leakDetection

    contextAssembly -->|"Perfil IA + resumos"| db
    mentalLoader -->|"Queries existentes"| existingStorage
    tournamentLoader -->|"Queries existentes"| existingStorage
    technicalLoader -->|"Queries existentes"| existingStorage
    existingStorage -->|"SQL via Drizzle ORM"| db

    coachRoutes -->|"Streaming: client.messages.stream()"| claudeSonnet
    coachRoutes -->|"Ao arquivar sessao"| memoryService
    memoryService -->|"Sumarizacao + profile update"| claudeHaiku
    memoryService -->|"CRUD sessoes, perfil, resumos mensais"| db
```

## Componentes por Camada

### Frontend

| Componente | Arquivo | Responsabilidade |
|-----------|---------|-----------------|
| Coach AI Page | `client/src/pages/CoachAI.tsx` | Pagina dedicada com layout sidebar + chat, 3 abas |
| Mini-Chat | `client/src/components/MiniChat.tsx` | Widget flutuante, visivel em paginas protegidas exceto /coach-ai |
| Coach Tabs | `client/src/components/CoachTabs.tsx` | Abas de selecao de coach com icones |
| Chat UI | `client/src/components/chat/` | MessageList, MessageInput, SessionList, StreamingIndicator |
| Sidebar entry | `client/src/components/Sidebar.tsx` | Link "Coach IA" na secao GRIND |

### Backend

| Componente | Arquivo | Responsabilidade |
|-----------|---------|-----------------|
| Coach Routes | `server/routes/coach.ts` | 5 endpoints HTTP, rate limiting, validacao |
| Context Assembly | `server/coachContext.ts` | Orquestra queries paralelas, monta contexto Claude API |
| Coach Prompts | `server/coachPrompts.ts` | System prompts dos 3 coaches (constantes com template literals) |
| Memory Service | `server/coachMemory.ts` | Compactacao de sessoes, atualizacao de perfil, compactacao mensal |
| Leak Detection | `server/coachLeaks.ts` | 8 regras rule-based para Coach Tecnico |
| Context Loaders | Funcoes em `coachContext.ts` | buildMentalContext, buildTournamentContext, buildTechnicalContext |

### Externos

| Componente | Uso | Budget |
|-----------|-----|--------|
| Claude Sonnet | Chat interativo (streaming) | ~6600 tokens input, ~500 output / msg |
| Claude Haiku | Compactacao (background) | ~2000 tokens input / compactacao |
| PostgreSQL 16 (Neon) | 4 tabelas novas + leitura de ~15 tabelas existentes | Indices otimizados |

## Fluxo de Dados Resumido

```
Jogador → Chat UI → Coach Routes → Context Assembly → Claude Sonnet → SSE → Chat UI → Jogador
                                         ↓
                              Context Loaders (paralelo)
                              ├── Coach Prompts (system prompt)
                              ├── user_ai_profile (perfil IA)
                              ├── monthly_coach_summaries (resumos mensais)
                              ├── chat_sessions.summary (ultima sessao)
                              ├── chat_messages (historico 20 msgs)
                              └── Stats por coach type (DB queries)

Ao arquivar → Memory Service → Claude Haiku → session summary + profile update → DB
1x/mes      → Memory Service → Claude Haiku → monthly summary → DB → cleanup msgs >60d
```
