# Spec: AI Coach — Persistent Memory & Context Compaction

## Status
Proposta

## Resumo
Sistema de memoria persistente para os coaches de IA do Grindfy. Permite que os coaches "lembrem" de conversas anteriores, acumulem conhecimento sobre o jogador ao longo do tempo, e transfiram insights entre sessoes de chat e entre meses. Inclui compactacao automatica de contexto para economia de tokens e eficacia.

## Contexto
Sem memoria, cada conversa com o coach comeca do zero — o jogador precisa re-explicar sua situacao a cada sessao. Com memoria, o coach evolui: "Na nossa ultima conversa voce mencionou que queria reduzir Turbos — como foi essa semana?" ou "Seu foco costumava cair apos 3h, mas nas ultimas 3 sessoes voce manteve acima de 7 ate 4h — parece que a tecnica de respiracao esta funcionando."

**Desafio tecnico:** Conversas acumulam tokens rapidamente. Enviar todo o historico para a Claude API e caro e atinge limites de contexto. Precisamos de um sistema de compactacao que preserve informacoes importantes e descarte o ruido.

**Principios de design:**
1. **Economia:** Minimizar tokens enviados por request sem perder qualidade
2. **Eficacia:** Coach deve parecer que "conhece" o jogador, mesmo sem todo o historico
3. **Privacidade:** Dados sensiveis nunca saem do banco — apenas resumos anonimizados vao para a API

## Usuarios
- **Jogador:** Experimenta continuidade nas conversas (coach "lembra" do que foi discutido)
- **Sistema (automatico):** Compactacao roda automaticamente sem intervencao do usuario

## Requisitos Funcionais

### RF-01: Perfil do Jogador (AI Profile)
**Descricao:** Tabela que armazena um perfil persistente do jogador, construido e atualizado automaticamente a partir das conversas e dados da plataforma. Este perfil e injetado no contexto de TODOS os coaches.
**Regras de negocio:**
- Um perfil por usuario (1:1 com users)
- O perfil contem informacoes qualitativas sobre o jogador que nao existem nos dados estruturados:
  - **Objetivos declarados** (ex: "quer chegar a $50 ABI ate dezembro", "meta de 20k/mes")
  - **Estilo de jogo auto-descrito** (ex: "jogo tight", "meu forte e FT", "tenho problema com tilt")
  - **Contexto pessoal relevante** (ex: "joga part-time, trabalha de manha", "profissional full-time")
  - **Historico de decisoes** (ex: "decidiu cortar Turbos em marco", "mudou de site de PS para GG")
  - **Leaks conhecidos e progresso** (ex: "leak principal: tilt apos bad beat em PKO — trabalhando nisso desde fev")
  - **Preferencias de interacao** (ex: "prefere respostas curtas", "gosta de analogias")
- O perfil e atualizado ao final de cada sessao de chat (via compactacao — RF-03)
- Tamanho maximo: 500 tokens (~2000 chars). Informacoes mais antigas sao compactadas/substituidas pelas mais recentes.
- O perfil e compartilhado entre os 3 coaches (mental, torneios, tecnico)
**Criterio de aceitacao:**
- [ ] Tabela `user_ai_profile` criada com campos: id, userId (unique), content (text), version (integer), tokenCount, updatedAt
- [ ] Perfil injetado no contexto de todos os coaches (entre system prompt e stats)
- [ ] Perfil atualizado automaticamente apos cada sessao
- [ ] Tamanho respeitado (max 500 tokens / ~2000 chars)
- [ ] Perfil compartilhado entre os 3 coaches

### RF-02: Resumo de Sessao (Session Summary)
**Descricao:** Ao arquivar uma sessao de chat, gerar automaticamente um resumo compactado dos pontos principais discutidos. O resumo fica salvo no campo `summary` de `chat_sessions` (criado na Spec 1).
**Regras de negocio:**
- Resumo gerado automaticamente quando:
  - Usuario inicia nova sessao (a anterior e arquivada — trigger)
  - Usuario arquiva sessao manualmente
  - Sessao atinge 30 mensagens (compactacao preventiva)
- Geracao do resumo: Enviar o historico da sessao para Claude API com prompt de sumarizacao:
  ```
  Resuma esta conversa em 3-5 bullet points. Foque em:
  - Decisoes tomadas pelo jogador
  - Insights ou leaks identificados
  - Compromissos ou metas definidos
  - Informacoes pessoais relevantes compartilhadas
  Maximo 150 palavras.
  ```
- Model para sumarizacao: `claude-haiku-4-5-20251001` (mais barato, suficiente para resumos)
- Resumo salvo no campo `summary` da sessao
- O resumo da ultima sessao arquivada de cada coach e incluido no contexto da proxima sessao
**Criterio de aceitacao:**
- [ ] Resumo gerado automaticamente ao arquivar sessao
- [ ] Resumo gerado ao atingir 30 mensagens (sem arquivar — salva no campo summary e trunca historico no contexto)
- [ ] Resumo de max 150 palavras / ~200 tokens
- [ ] Model Haiku usado para sumarizacao (economia)
- [ ] Resumo da sessao anterior incluido no contexto da proxima

### RF-03: Atualizacao do Perfil (Profile Update)
**Descricao:** Apos gerar o resumo da sessao, atualizar o perfil do jogador com novas informacoes aprendidas na conversa.
**Regras de negocio:**
- Apos gerar o resumo (RF-02), enviar para Claude (Haiku):
  ```
  Perfil atual do jogador:
  {current_profile}

  Resumo da sessao recente:
  {session_summary}

  Atualize o perfil do jogador incorporando novas informacoes da sessao.
  Regras:
  - Mantenha informacoes que continuam relevantes
  - Atualize informacoes que mudaram (ex: se o jogador mudou de meta)
  - Adicione novas informacoes importantes
  - Remova informacoes obsoletas ou contraditas
  - Maximo 2000 caracteres
  - Formato: bullet points organizados por categoria (Objetivos, Estilo, Contexto, Decisoes, Leaks, Preferencias)
  ```
- Incrementar `version` do perfil a cada atualizacao
- Se o perfil nao existia, criar um novo
- Processo assincrono (nao bloqueia o usuario): roda em background apos arquivar sessao
**Criterio de aceitacao:**
- [ ] Perfil atualizado automaticamente apos cada sessao
- [ ] Novas informacoes incorporadas, informacoes obsoletas removidas
- [ ] Version incrementado a cada atualizacao
- [ ] Processo roda em background (nao bloqueia UX)
- [ ] Perfil criado automaticamente se nao existia

### RF-04: Compactacao Mensal
**Descricao:** No inicio de cada mes, compactar todas as sessoes do mes anterior em um unico resumo mensal, e usar esse resumo como base de contexto para sessoes futuras.
**Regras de negocio:**
- Tabela `monthly_coach_summaries` armazena resumos mensais por usuario e coach type
- Compactacao roda automaticamente quando o usuario envia a 1a mensagem do mes (lazy — nao precisa de cron)
- Processo:
  1. Buscar todas as sessoes arquivadas do mes anterior para aquele coach
  2. Concatenar seus resumos (summaries)
  3. Enviar para Claude (Haiku) com prompt:
     ```
     Resuma a evolucao deste jogador no ultimo mes baseado nestas conversas com o coach {type}:
     {all_session_summaries}
     
     Foque em: evolucao, decisoes importantes, leaks trabalhados, metas alcancadas/abandonadas.
     Maximo 300 palavras.
     ```
  4. Salvar como `monthly_coach_summaries` entry
- Apos compactacao, sessoes antigas podem ter seu historico de mensagens limpo (manter apenas a sessao com summary, deletar `chat_messages` com mais de 60 dias)
- O resumo mensal mais recente e incluido no contexto (alem do resumo da ultima sessao)
- Manter historico de ate 3 meses de resumos mensais no contexto (alem do mais recente)
**Criterio de aceitacao:**
- [ ] Tabela `monthly_coach_summaries` criada
- [ ] Compactacao roda na 1a mensagem do mes (lazy trigger)
- [ ] Resumo mensal de max 300 palavras
- [ ] Mensagens com mais de 60 dias limpas apos compactacao
- [ ] Resumo mensal incluido no contexto das sessoes seguintes
- [ ] Ate 3 meses de historico de resumos mantidos

### RF-05: Transferencia Cross-Coach
**Descricao:** Informacoes importantes aprendidas em um coach podem ser uteis para outros. O perfil do jogador (RF-01) e o mecanismo de transferencia — ele e compartilhado entre os 3 coaches.
**Regras de negocio:**
- O perfil do jogador (`user_ai_profile`) e unico e compartilhado
- Quando o Coach Mental aprende que o jogador "tem problemas de tilt apos PKOs", o Coach Tecnico tambem sabe (via perfil)
- Quando o Coach de Torneios descobre que o jogador "quer focar em fields grandes", o Coach Tecnico pode orientar estudos de ICM para fields grandes
- NAO ha transferencia de historico de mensagens entre coaches — apenas o perfil
- O resumo mensal e POR coach (cada coach tem seu historico)
**Criterio de aceitacao:**
- [ ] Perfil unico e compartilhado entre os 3 coaches
- [ ] Informacao registrada num coach aparece no contexto de outro
- [ ] Historico de mensagens permanece isolado por coach
- [ ] Resumos mensais sao por coach type

## Requisitos Nao-Funcionais
- **Economia:** Compactacao usa Haiku (~$0.25/M tokens input, ~$1.25/M output), nao Sonnet. Uma compactacao de sessao custa ~$0.001. Mensal ~$0.005 por usuario.
- **Performance:** Compactacao de sessao em background (<5s). Compactacao mensal em background (<15s). Nao deve impactar a experiencia de chat.
- **Consistencia:** Se a compactacao falhar, nao perder dados — manter sessoes originais e tentar novamente na proxima oportunidade.
- **Privacidade:** Perfil nao contem dados pessoais identificaveis (nome, email). Usa apenas informacoes de poker/jogo.

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|--------|------|-----------|------|
| GET | `/api/coach/profile` | Ver perfil IA do jogador | JWT |
| PUT | `/api/coach/profile` | Editar perfil manualmente (opcional) | JWT |
| GET | `/api/coach/monthly-summaries` | Ver resumos mensais | JWT |

## Modelos de Dados Afetados

### user_ai_profile (novo)
| Campo | Tipo | Constraints | Notas |
|-------|------|-------------|-------|
| id | varchar | PK, not null | nanoid() |
| userId | varchar | FK → users.userPlatformId, unique, not null, onDelete cascade | 1:1 |
| content | text | not null, default '' | Perfil em texto estruturado (bullet points) |
| version | integer | not null, default 1 | Incrementado a cada atualizacao |
| tokenCount | integer | default 0 | Tokens estimados do perfil |
| updatedAt | timestamp | defaultNow() | |

**Indices:** `idx_ai_profile_user` em (userId) — unique

### monthly_coach_summaries (novo)
| Campo | Tipo | Constraints | Notas |
|-------|------|-------------|-------|
| id | varchar | PK, not null | nanoid() |
| userId | varchar | FK → users.userPlatformId, not null, onDelete cascade | |
| coachType | varchar | not null | enum: 'mental', 'tournament', 'technical' |
| month | varchar | not null | Formato: 'YYYY-MM' (ex: '2026-04') |
| summary | text | not null | Resumo mensal compactado |
| sessionsCompacted | integer | default 0 | Quantas sessoes foram compactadas |
| tokenCount | integer | default 0 | Tokens do resumo |
| createdAt | timestamp | defaultNow() | |

**Indices:** `idx_monthly_summary_user_coach_month` em (userId, coachType, month) — unique

### chat_sessions (alteracao — campo ja existe da Spec 1)
- Campo `summary` (text) — preenchido pela compactacao desta spec

## Integracoes Externas
| Servico | Proposito | Quando |
|---------|-----------|--------|
| Claude API — Haiku | Sumarizacao de sessoes e atualizacao de perfil | Ao arquivar sessao, 1x/mes |

## Cenarios de Teste Derivados

### Happy Path
- [ ] Sessao arquivada → resumo gerado automaticamente
- [ ] Perfil criado na 1a sessao, atualizado nas seguintes
- [ ] 2a sessao recebe resumo da 1a no contexto
- [ ] Informacao do Coach Mental aparece no contexto do Coach Tecnico (via perfil)
- [ ] Compactacao mensal gera resumo agregado
- [ ] Mensagens velhas limpas apos compactacao mensal

### Validacao de Input
- [ ] Perfil editado manualmente > 2000 chars → truncado ou rejeitado
- [ ] Sessao com 0 mensagens → nao gera resumo

### Regras de Negocio
- [ ] Compactacao mensal roda apenas 1x (idempotente — se ja existe resumo do mes, nao roda de novo)
- [ ] Perfil max 500 tokens — informacoes antigas substituidas por novas
- [ ] Resumo de sessao max 150 palavras
- [ ] Resumo mensal max 300 palavras
- [ ] Mensagens > 60 dias deletadas apos compactacao (nunca antes)

### Edge Cases
- [ ] Compactacao falha (Claude API fora) → sessao mantida intacta, retry na proxima oportunidade
- [ ] Usuario com 100+ sessoes no mes → compactacao agrupa resumos em batches
- [ ] Perfil corrupto/vazio → coach funciona sem perfil (graceful degradation)
- [ ] Primeiro mes de uso → sem compactacao mensal, sem resumo anterior
- [ ] Usuario edita perfil manualmente e depois compactacao roda → compactacao respeita edicoes manuais

## Fora de Escopo
- **Exportacao do perfil IA** → nao planejado
- **Perfil editavel por admin** → nao planejado
- **Busca semantica em historico de conversas** → possivel extensao futura (embeddings)
- **Feedback explicito do usuario sobre qualidade** (like/dislike em mensagens) → feature futura
- **Analytics de uso de tokens** (dashboard de custo por usuario) → feature futura

## Dependencias
- Spec 1 (AI Coach Infrastructure) — tabelas `chat_sessions` e `chat_messages` existentes
- Spec 2 (Coach Personas) — recomendado mas nao bloqueante (compactacao funciona com qualquer prompt)

## Notas de Implementacao

### Diagrama do fluxo de memoria

```
Mensagem do usuario
       │
       ▼
┌─────────────────────┐
│ Context Assembly     │
│                     │
│ 1. System prompt    │
│ 2. AI Profile ◄────────── user_ai_profile (compartilhado)
│ 3. Stats snapshot   │
│ 4. Monthly summary ◄────── monthly_coach_summaries (por coach)
│ 5. Last session     │
│    summary ◄────────────── chat_sessions.summary (ultima arquivada)
│ 6. Current history  │
│    (20 msgs max)    │
│ 7. User message     │
└─────────┬───────────┘
          │
          ▼
    Claude API (Sonnet)
          │
          ▼
    Resposta streaming
          │
          ▼
    Salvar mensagens
          │
          ▼ (ao arquivar sessao)
┌─────────────────────┐
│ Compactacao          │
│                     │
│ 1. Gerar session    │
│    summary (Haiku)  │
│ 2. Atualizar AI     │
│    profile (Haiku)  │
│ 3. Se novo mes:     │
│    compact monthly  │
│    (Haiku)          │
│ 4. Limpar msgs      │
│    > 60 dias        │
└─────────────────────┘
```

### Budget de tokens por request (com memoria)

| Camada | Tokens | Custo estimado |
|--------|--------|----------------|
| System prompt | ~1500 | fixo |
| AI Profile | ~500 | compartilhado |
| Stats snapshot | ~800 | por coach |
| Monthly summary | ~400 | por coach |
| Last session summary | ~200 | por coach |
| Historico (20 msgs) | ~3000 | variavel |
| Mensagem do usuario | ~200 | variavel |
| **Total input** | **~6600** | **~$0.02/msg (Sonnet)** |
| **Resposta** | **~500** | **~$0.008/msg (Sonnet)** |
| **Total por mensagem** | | **~$0.028** |

Para 1000 mensagens/mes (todos usuarios): ~$28/mes em API costs.
