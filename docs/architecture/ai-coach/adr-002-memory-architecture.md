# ADR-015: Estrategia de Memoria Persistente com Perfil + Resumos + Compactacao Mensal

> ⚠️ **Nota (2026-05-12, Sprint AI-0B / ADR-148).** Este ADR fala de memoria "compartilhada entre os 3 coaches". Apos o Sprint AI-0B ha **um unico agente "Grindfy AI"** — `user_ai_profile` continua sendo a memoria de longo prazo, agora de um agente so (a transferencia "cross-coach" deixa de ser conceito: o agente unico ja ve tudo). O resto da estrategia (perfil + resumos arquivados + compactacao mensal Haiku) permanece valido. `monthly_coach_summaries.coach_type` permanece (back-compat).
>
> ⚠️ **Nota (2026-05-12, Sprint AI-1A / ADR-151).** A memoria agora tem **dois componentes complementares**, nao um:
> 1. **Prosa (qualitativa)** — `user_ai_profile.content` (text, ≤2000 chars, gerada/mesclada por Haiku ao arquivar sessao) + `monthly_coach_summaries` — descrito por este ADR; **inalterado**.
> 2. **Estruturado (deterministico)** — `users.ai_structured_profile` (JSONB versionado, `schemaVersion: 1`): `{ nivel, nivelConfirmado, metas[], focoDoMes, tomPreferido, padroesConhecidos[], redesPrincipais[], stakesTipico, volumeTipicoMes, tempoJogaSerioMeses, perfilDeclarado, onboardingCompletedAt, onboardingVersion, onboardingDraft, reOnboarding*, ... }` — preenchido pelo onboarding conversacional (wizard guiado — ADR-153), pela deteccao de nivel rule-based (ADR-154) e (futuro AI-2A) por write tools de carreira. O **estruturado e aditivo** — a prosa nao e migrada nem tocada. O system prompt (bloco STATIC, ADR-019) usa o **estruturado** de forma confiavel (`## Perfil Estruturado do Jogador:`, entre `## Perfil do jogador:` e `## Perfil do Jogador (memoria de longo prazo):` — onde "memoria de longo prazo" = a prosa); a prosa entra logo depois como notas qualitativas. Storage: `server/storage/aiStructuredProfile.ts` (`getAiStructuredProfile` normaliza/back-fill — lesson #7/#9; `updateAiStructuredProfile` merge raso + clamp; `isStructuredProfileEmpty`). Sincronizacao `ai_structured_profile.tomPreferido` ↔ `userCoachPreferences.coachTone` (RF-09 — o `PUT /api/coach/preferences` espelha; back-fill lazy no handler de `/api/coach/chat`). Ver `Docs/architecture/decisions/151-ai-structured-profile-jsonb.md` + os diagramas em `Docs/architecture/diagrams/coach-ai-1a/`.
>
> Resumo: **prosa = "como o jogador fala/pensa, o que aconteceu nas conversas" (Haiku); estruturado = "quem o jogador e — nivel, metas, foco, tom, redes" (onboarding/heuristica)**. Co-habitam; nunca se misturam.

## Status
Proposto

## Data
2026-04-08

## Contexto
Os coaches de IA do Grindfy precisam "lembrar" de conversas anteriores para oferecer continuidade e personalizacao. Sem memoria, cada conversa comeca do zero e o jogador precisa re-explicar sua situacao. O desafio e equilibrar tres forcas:

1. **Qualidade:** O coach deve parecer que conhece o jogador (objetivos, estilo, historico de decisoes)
2. **Economia:** Enviar todo o historico de conversas para a API e caro e atinge limites de contexto
3. **Privacidade:** Dados sensiveis nao devem ser enviados desnecessariamente para APIs externas

O jogador pode acumular centenas de mensagens ao longo de semanas. Enviar tudo a cada request rapidamente ultrapassa budgets de tokens e degrada a qualidade das respostas (contexto muito longo dilui informacoes importantes).

## Opcoes Consideradas

### Opcao 1: Enviar historico completo (sem compactacao)
- **Pros:** Simplicidade maxima (zero logica de memoria), nenhuma informacao perdida, facil de implementar
- **Contras:** Custo cresce linearmente com o uso ($$$), atinge limite de contexto em poucas semanas, qualidade degrada com contextos muito longos (needle-in-haystack), latencia aumenta

### Opcao 2: Sliding window (ultimas N mensagens)
- **Pros:** Simples, custo previsivel e fixo, facil de implementar
- **Contras:** Informacoes anteriores a janela sao completamente perdidas, coach "esquece" conversas antigas, nenhuma continuidade de longo prazo, jogador frustrado ao precisar repetir informacoes

### Opcao 3: RAG com embeddings (busca semantica)
- **Pros:** Busca mensagens relevantes por similaridade semantica, teoricamente a melhor qualidade de recall, escala para historicos muito longos
- **Contras:** Requer infraestrutura de embeddings (pgvector ou Pinecone), complexidade significativa, custo de embeddings a cada mensagem, latencia adicional na busca, over-engineering para o volume esperado (~1000 msgs/mes total entre todos usuarios)

### Opcao 4: Perfil persistente + resumos de sessao + compactacao mensal (hierarquico)
- **Pros:** 3 niveis de granularidade (perfil permanente, resumos de sessao, historico recente), custo previsivel e baixo (compactacao usa Haiku), preserva informacoes importantes enquanto descarta ruido, perfil compartilhado entre coaches permite transferencia cross-coach, budget de tokens fixo (~6600/msg), sem infraestrutura adicional (apenas tabelas PostgreSQL)
- **Contras:** Informacoes especificas de conversas antigas podem ser perdidas na sumarizacao, qualidade depende da qualidade dos resumos (se Haiku resumir mal, contexto degrada), logica de compactacao mais complexa de implementar, latencia adicional minima nas compactacoes (background)

## Decisao
Opcao 4: Arquitetura hierarquica de memoria em 3 camadas.

### Camada 1: Perfil Persistente (`user_ai_profile`)
- Um registro por usuario, compartilhado entre os 3 coaches
- Contem informacoes qualitativas: objetivos, estilo, contexto pessoal, historico de decisoes, leaks conhecidos, preferencias
- Atualizado automaticamente apos cada sessao via Haiku
- Max 500 tokens (~2000 chars) — informacoes antigas substituidas por novas
- Analogia: e a "ficha do paciente" que todo medico le antes da consulta

### Camada 2: Resumos de Sessao (`chat_sessions.summary`)
- Gerado automaticamente ao arquivar sessao (ou ao atingir 30 mensagens)
- 3-5 bullet points, max 150 palavras (~200 tokens)
- Resumo da ultima sessao do coach incluido no contexto
- Analogia: sao as "anotacoes da consulta anterior"

### Camada 3: Resumos Mensais (`monthly_coach_summaries`)
- Compactacao lazy (roda na 1a mensagem do mes)
- Agrega todos os resumos de sessao do mes anterior
- Max 300 palavras (~400 tokens), por coach type
- Ate 3 meses mantidos no contexto
- Mensagens com mais de 60 dias deletadas apos compactacao
- Analogia: e o "relatorio trimestral de evolucao"

### Budget total por request

| Camada | Tokens | Fonte |
|--------|--------|-------|
| System prompt | ~1500 | coachPrompts.ts (fixo) |
| AI Profile | ~500 | user_ai_profile (compartilhado) |
| Stats snapshot | ~800 | Queries por coach type |
| Monthly summaries (ate 3) | ~1200 | monthly_coach_summaries |
| Last session summary | ~200 | chat_sessions.summary |
| Historico atual (20 msgs) | ~3000 | chat_messages |
| Mensagem do usuario | ~200 | Input atual |
| **Total input** | **~7400** | Bem dentro do limit Sonnet |

## Consequencias

**Positivas:**
- Coach parece que "conhece" o jogador sem enviar todo o historico
- Custo fixo e previsivel por mensagem (~$0.028 Sonnet + ~$0.001 Haiku/sessao)
- Transferencia cross-coach via perfil compartilhado (Mental aprende sobre tilt, Tecnico usa essa info)
- Sem infraestrutura adicional — apenas PostgreSQL (ja existente)
- Mensagens antigas limpas automaticamente (economia de storage)

**Negativas:**
- Detalhes especificos de conversas antigas podem ser perdidos na sumarizacao
- Se Haiku gerar resumo de baixa qualidade, o contexto futuro e impactado
- Complexidade de implementacao: 3 processos async (session summary, profile update, monthly compaction)
- Latencia minima adicional nas compactacoes de background (~5s sessao, ~15s mensal)

**Neutras:**
- Perfil do jogador e compartilhado — informacao de um coach pode influenciar outro (desejado, mas requer cuidado nos prompts para nao misturar areas)
- Compactacao mensal e lazy (nao precisa de cron), mas significa que a 1a mensagem do mes pode ter latencia ligeiramente maior (compactacao roda em background, nao bloqueia)
- Versioning do perfil (`version` field) permite auditoria de evolucao, mas nao armazena versoes anteriores (apenas a corrente)

## Confianca
Media-Alta — A abordagem e bem estabelecida em sistemas de chat com memoria (similar ao que ChatGPT usa internamente). O risco principal e a qualidade dos resumos do Haiku, que pode ser mitigado com prompts de sumarizacao bem calibrados e validacao manual nos primeiros meses.
