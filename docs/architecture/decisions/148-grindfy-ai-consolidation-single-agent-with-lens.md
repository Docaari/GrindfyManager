# ADR-148: Consolidação Grindfy AI — agente único com "lente inicial" (supersedes a separação de personas Mental/Tournament/Technical)

## Status
Aceito

## Data
2026-05-12

## Sprint
AI-0B (`Docs/specs/sprint-ai-0b.md`, RF-01..03, RF-06)

## Decision owner
system-architect (founder liberou autonomia para a fase 0 do plano de melhoria dos agentes — `memory/ai_agents_improvement_plan_2026-05-11.md`)

## Related
- Supersedes/emenda: `Docs/architecture/ai-coach/adr-001-llm-provider.md` §"3 coaches especializados" (a separação de personas), `Docs/architecture/ai-coach/adr-002-memory-architecture.md` §"compartilhado entre os 3 coaches", `Docs/architecture/ai-coach/c4-component.md`, `Docs/architecture/ai-coach/sequence-diagrams.md` (mostram 3 coaches + 3 context loaders).
- Emenda parcial: ADR-021 (não — esse é só seleção de modelo; o que **muda** é `021-coach-gate-by-plan.md` referenciado em `coachAccess.ts`, i.e. o ADR de **gate por plano** — a parte "qual coach por tier" deixa de existir; a parte rate-limit + tools fica). [Nota factual: o arquivo `Docs/architecture/decisions/021-...` no repo é `021-coach-model-selection-via-env.md`; o "ADR-021 gate by plan" citado em `coachAccess.ts` aponta para `021-coach-gate-by-plan.md` que não está no diretório atual — a decisão de gate por plano vivia inline no `coachAccess.ts`/`COACH_ACCESS`. Este ADR é a fonte canônica do gate pós-consolidação.]
- Preserva: ADR-019 (prompt cache 2 blocos — estrutura mantida, conteúdo do STATIC muda), ADR-147 §3 (fonte única de citation/confidence em `coachSafetyPrompts.ts`), ADR-145/146 (registry de tools — inalterado).
- Diagramas: `Docs/architecture/diagrams/coach-ai-0b/system-prompt-structure.mermaid`, `coach-ai-overview.mermaid`.

---

## 1. Contexto

O Coach AI do Grindfy nasceu como **três personas separadas** — Mental, Torneios (Tournament), Técnico (Technical) — cada uma com seu próprio system prompt base (`MENTAL_BASE` / `TOURNAMENT_BASE` / `TECHNICAL_BASE` em `server/coachSystemBuilder.ts`) e cada uma vendo **um pedaço** dos dados:

- **Mental:** break feedbacks, preparation logs, métricas mentais de grind sessions, correlação mental↔resultado.
- **Tournament:** dashboard stats, ROI por dimensão, top/worst templates, planned tournaments, profile states, weekly plan.
- **Technical:** dashboard stats completo (JSON), final table analytics, finish rates, study cards/sessions, coaching insights, leaks detectados.

O bloco DYNAMIC do builder cacheado (ADR-019) tem o gate por `coachType` costurado: weekly plan só entra se `coachType === 'tournament'`; study progress só entra se `coachType === 'technical'`. O bloco STATIC chama `getBasePrompt(coachType)`. O route handler (`server/routes/coach.ts` `handleCoachChat`) escolhe `getMentalPrompt`/`getTournamentPrompt`/`getTechnicalPrompt` (de `server/coachPrompts.ts`) conforme o `coachType`, e bloqueia com `403 tier_locked` quem não tem o coach no seu tier (`COACH_ACCESS`: `free → ['mental']`, `pro → ['mental','tournament']`, `premium`/`admin → todos`).

### Problema

1. **As 3 personas fragmentam o contexto.** Cada coach só vê um pedaço dos dados — impossível cruzar dores sistêmicas (mental + carreira, leak + estudo, selection + plateau, bankroll + vida) que são o **diferenciador** do produto. Pré-AI-0A o detalhe nem vinha por tools; pós-AI-0A vem (17 tools religadas — ADR-145/146/147), mas o **prompt base** ainda fatia o contexto e diz "você é o Coach X".
2. **Confunde o usuário.** "Com qual coach falo sobre meu ROI vs meu tilt?" — quem quer falar de leak + estudo + banca tem que abrir 3 conversas.
3. **3 prompts pra manter** (anti-DRY — lesson #10). Divergência silenciosa entre os 3 bases + entre eles e as constantes de safety é um vetor de bug.
4. **Pré-requisito de quase tudo na Fase 1** do plano (relatórios automáticos, loop fechado, hub `/coach-ai`, onboarding conversacional).

A **pergunta central:** mantemos as 3 personas (com mais tools), ou consolidamos num agente único que "vê tudo" e usa o `coachType` apenas como dica de foco inicial?

### Restrições

- **Zero migração de schema.** `coach_conversations.coach_type` e `chat_sessions.coach_type` existem hoje e são populados — back-compat obrigatório (sessões antigas não podem virar inválidas; listagem por `coachType` continua funcionando).
- **Cache da Anthropic (ADR-019, ADR-147 §3, lesson #10).** O bloco STATIC é cacheado com `cache_control: ephemeral`. Mudar o base prompt quebra o cache key **uma vez**. Lesson #10 manda evitar **divergência silenciosa** (cópias paralelas), não quebra controlada.
- **Não regredir acesso ao chat.** Quem tem chat hoje (todos os tiers — `free` tem o Mental, Pro+ tem mais) continua tendo, agora o agente único.
- **Token budget.** Consolidar não pode significar serializar todo dado do sistema no prompt — isso estoura o budget e mata o cache. "Vê tudo" = "todas as **seções já carregadas**, sem gate por `coachType`" + tools para o detalhe sob demanda.
- **AI-0A já quebrou o cache** (RF-14 reforçou citations/confidence — mudança de texto inevitável). Fazer a consolidação no mesmo ciclo evita uma segunda quebra.

---

## 2. Decisão

**Consolidar os 3 system prompts num único "Grindfy AI" — um copiloto de carreira que cobre mental + selection + técnico + bankroll + estudos. O `coachType` (mental | tournament | technical) permanece no contrato (back-compat, zero migração) mas vira "lente inicial" — uma única linha de dica de foco no system prompt, nada mais. O contexto dinâmico deixa de ser gated por `coachType` (o agente vê todas as seções). O tier gate deixa de gatear "qual coach" — passa a ser só rate limit (10/50/200/∞ msg/dia) + tools (`free` sem tools, Pro+ com).**

### 2.1 System prompt unificado — estrutura

O builder (`server/coachSystemBuilder.ts`) mantém os **dois blocos** do ADR-019. O que muda é o conteúdo.

**Bloco STATIC (cacheado — `cache_control: { type: 'ephemeral' }`), nesta ordem:**

| # | Seção | Origem | Varia com `coachType`? |
|---|---|---|---|
| 1 | `GRINDFY_AI_BASE` (NOVO — base único; ~150-250 tokens; tom de par/companheiro de grind; lista das áreas que cobre; instrução de usar tools para detalhe; instrução de citar fonte; **sem** "você é o Coach Mental/Técnico/de Torneios") | `coachSystemBuilder.ts` (constante nova) | **Não** — corpo idêntico para todo `coachType` |
| 2 | `SAFETY_RULES` | `coachSafetyPrompts.ts` (inalterado) | Não |
| 3 | `SAFETY_RULES_COMPETITOR_BLOCK` (hard-block concorrentes, ADR-075) | `coachSafetyPrompts.ts` (inalterado) | Não |
| 4 | `CITATIONS_RULES` (reforçado no AI-0A, ADR-147) — **exceto** ajustar exemplos few-shot que citem "Coach Mental/Técnico/de Torneios" para "Grindfy AI" | `coachSafetyPrompts.ts` (fonte única) | Não |
| 5 | `CONFIDENCE_RULES` | `coachSafetyPrompts.ts` (inalterado) | Não |
| 6 | Perfil do jogador (nome, plano, criado em, total de torneios) — `inputs.userProfile` se presente | `coachSystemBuilder.ts` (inalterado) | Não |
| 7 | Perfil do jogador (memória de longo prazo) — `inputs.aiProfile` se presente | (inalterado) | Não |
| 8 | Stats snapshot (ROI, profit, volume, ABI) — `inputs.statsSnapshot` se presente | (inalterado) | Não |
| 9 | Resumo da sessão anterior — `inputs.lastSummary` se presente | (inalterado) | Não |

**Conclusão crítica: o bloco STATIC é IDÊNTICO para `coachType` ∈ {mental, tournament, technical}.** Não há mais 3 variantes de cache key — há **uma**. O `coachType` **não toca o STATIC**. (Ver §2.3 — a linha de lente fica no DYNAMIC.)

**Bloco DYNAMIC (NÃO cacheado), nesta ordem:**

| # | Seção | Entra quando | Varia com `coachType`? |
|---|---|---|---|
| 0 | **Linha de lente inicial** (NOVO — uma linha; ver §2.3) — só presente se `coachType` informado | sempre (com mensagem que pode falar de qualquer assunto) | **Sim — é a ÚNICA coisa que varia com `coachType` no prompt inteiro** |
| 1 | Sessão de Grind Ativa — `inputs.activeGrind` | há dado (inalterado) | Não |
| 2 | Break Feedbacks recentes — `inputs.breakFeedbacks` | há dado (inalterado) | Não |
| 3 | Leaks Detectados — `inputs.leaks` | há dado (inalterado) | Não |
| 4 | Plano Semanal Atual — `inputs.weeklyPlan` | há dado — **MUDANÇA: não mais gated por `coachType === 'tournament'`** | **Não (era sim)** |
| 5 | Progresso de Estudo — `inputs.studyProgress` | há dado — **MUDANÇA: não mais gated por `coachType === 'technical'`** | **Não (era sim)** |
| 6 | Contexto da página atual — `buildPageContextSection(inputs.pageContext)` | há page context — **MUDANÇA: passa a ser de fato fornecido (ADR-149)** | Não |

`buildSystemArray` continua: array `[staticBlock, dynamicBlock]` com `cache_control` só no STATIC quando `COACH_PROMPT_CACHE_ENABLED !== 'false'`; string concatenada quando `=== 'false'` (fallback legacy inalterado). O bloco DYNAMIC **nunca** tem `cache_control`.

### 2.2 Assinatura de `getBasePrompt` — vira constante única

`getBasePrompt(coachType)` (que retornava `MENTAL_BASE`/`TOURNAMENT_BASE`/`TECHNICAL_BASE`) é **removido**. Substituído por uma constante exportada `GRINDFY_AI_BASE` (string). `buildStaticSystemBlock(coachType, inputs)` passa a fazer `parts.push(GRINDFY_AI_BASE)` direto — `coachType` continua sendo parâmetro da função (assinatura preservada para não quebrar callers), mas **não é usado** dentro do STATIC. (Mantida a assinatura `buildStaticSystemBlock(coachType, inputs)` para minimizar churn nos testes que a chamam — o parâmetro vira "não usado, presente por compat".)

Opcionalmente, expor um helper `getGrindfyAiBasePrompt(): string` que retorna `GRINDFY_AI_BASE` — útil para o `getSystemPrompt` legacy do `assembleContext` (ver §2.4) e para testes.

### 2.3 `coachType` = "lente inicial" — uma linha no bloco DYNAMIC

- O `coachType` **continua** no body de `POST /api/coach/chat`, validado contra `VALID_COACH_TYPES = ['mental','tournament','technical']` — request sem `coachType` válido → `400` (inalterado). Continua em `chat_sessions.coach_type` e `coach_conversations.coach_type` — zero migração.
- O `coachType` **não** seleciona base prompt (§2.1), **não** gateia contexto (§2.1 DYNAMIC), **não** gateia acesso por tier (§2.5).
- O `coachType` **gera uma única linha** no início do bloco DYNAMIC:

  | `coachType` | Linha de lente (texto canônico — implementer pode refinar o copy, não a semântica) |
  |---|---|
  | `mental` | `Lente inicial: mental game (foco, tilt, preparo, rotina). O jogador abriu o chat com esse foco — comece por aí, mas você pode e deve falar de qualquer assunto (ROI, leaks, banca, estudo, grade) se a conversa pedir.` |
  | `tournament` | `Lente inicial: seleção de torneios e planejamento de grade. O jogador abriu o chat com esse foco — comece por aí, mas você pode e deve falar de qualquer assunto (mental, leaks, banca, estudo) se a conversa pedir.` |
  | `technical` | `Lente inicial: análise técnica e leaks. O jogador abriu o chat com esse foco — comece por aí, mas você pode e deve falar de qualquer assunto (ROI, mental, banca, estudo, grade) se a conversa pedir.` |

- **Por que no DYNAMIC, não no STATIC:** colocar a linha no STATIC criaria 3 variantes de cache key (uma por `coachType`) — trocar de "foco/lente" no hub invalidaria o cache do STATIC. No DYNAMIC, trocar a lente custa zero (o DYNAMIC já é reescrito a cada request). É a opção que faz o cache funcionar melhor. (Trade-off considerado e descartado: STATIC daria cache hit 100% **dentro de uma lente**, mas o cenário de "agente único" é precisamente que o usuário troque de foco no meio — então o DYNAMIC vence.)
- `buildDynamicSystemBlock(coachType, inputs)`: a linha de lente é a **primeira coisa** que `parts.push(...)`, quando `coachType` truthy. Para o `coachType` `'coach-ai'` page-context variant (`{ route: 'coach-ai', activeCoachType? }`), o `activeCoachType` **é** a mesma lente — o frontend manda `coachType` (body) e `pageContext.activeCoachType` consistentes.

### 2.4 Funções legacy — removidas / `@deprecated`

| Símbolo | Local | Decisão | Justificativa |
|---|---|---|---|
| `MENTAL_BASE` / `TOURNAMENT_BASE` / `TECHNICAL_BASE` | `coachSystemBuilder.ts` | **Deletar** | substituídos por `GRINDFY_AI_BASE` |
| `getBasePrompt(coachType)` | `coachSystemBuilder.ts` | **Deletar** (interno; não exportado hoje) | substituído por `GRINDFY_AI_BASE` direto |
| `getMentalPrompt` / `getTournamentPrompt` / `getTechnicalPrompt` | `coachPrompts.ts` | **Deletar** — substituir o import no route por um `getGrindfyAiBasePrompt()` único (ou simplesmente não passar `getSystemPrompt` por-coach: passar uma função que sempre retorna `GRINDFY_AI_BASE`) | são o que mais quebra testes (vários testam os 3 separados); mantê-los é dívida. Test-writer reescreve os testes. |
| `buildMentalContext` / `buildTournamentContext` / `buildTechnicalContext` | `coachContext.ts` | **`@deprecated` ou deletar** — implementer faz `grep` por usos fora de `routes/coach.ts`; se só o route usa → deletar (o route não precisa mais carregar contexto específico por coach: o `buildSystemArray` recebe os dados via os loaders genéricos `getActiveGrind`/`getRecentBreakFeedbacks`/`getDetectedLeaks`/`getWeeklyPlan`/`getStudyProgress`/`getPageContext`). Se há outro consumidor → `@deprecated` por um sprint de transição. | dead-code após a unificação se só o route usa |
| `assembleContext`'s `getSystemPrompt: (coachType: string) => string` loader | `coachContext.ts` | **Manter na interface** mas o caller passa uma função que ignora `coachType` e retorna `GRINDFY_AI_BASE` (ou um fallback mínimo). O `system` final continua vindo de `buildSystemArray` — o `getSystemPrompt` legacy só importa quando `COACH_PROMPT_CACHE_ENABLED=false` (fallback legacy), e mesmo aí o `buildSystemArray` já inclui o base. | minimiza churn da interface; o caminho real é `buildSystemArray` |
| `systemParts` array + ~8 queries inline em `coachContext.ts` (linhas ~91-194) | `coachContext.ts` | **Recomendado remover** (dead-code documentado, desperdiça queries) — implementer verifica com `grep` que nenhum teste depende disso (improvável: não alimenta o `system` final). Se a remoção parecer arriscada, deixar com TODO atualizado. | estamos no arquivo; é dead-code documentado |

### 2.5 Tier gate ajustado — gate por rate limit + tools, não por `coachType`

| Símbolo | Decisão |
|---|---|
| **Acesso ao chat** | Todos os tiers (`free`/`pro`/`premium`/`admin`) acessam o Grindfy AI. **`403 tier_locked` por coach desaparece** de `handleCoachChat`. Não regride: hoje `free` já tem o coach Mental. |
| `getRateLimitForPlan` / `RATE_LIMITS` | **Inalterado** — free 10, pro 50, premium 200, admin ∞ msg/24h (rolling). `429 rate_limited` + headers `X-RateLimit-*` inalterados. |
| `exportToolsForAnthropic(tier)` | **Inalterado** — `free → []` (sem tools); Pro+ → as 17 tools (18 entradas com o alias deprecado) filtradas por `gateByTier: ['pro','premium','admin']` (ADR-145). |
| `canAccessCoach(tier, coachType)` | **Removida ou trivializada** — implementer faz `grep`: se só `handleCoachChat` a usa → deletar e remover a checagem; se há outros usos → manter retornando `true` para qualquer `(tier, coachType)` válido + `@deprecated`. Recomendação: **remover a checagem de `handleCoachChat`** e marcar `@deprecated` (ou deletar) `canAccessCoach`/`getAccessibleCoaches`/`COACH_ACCESS`. |
| `getUpgradeTarget(tier, requestedCoach)` | **Pode ser simplificada** — ainda útil para o `429` (sugerir upgrade para subir o rate limit / desbloquear tools), com semântica nova: `free` → sugere `pro` (mais msg/dia + tools). Manter ou reescrever; não é caminho crítico. |
| `CoachType` / `coachTypeEnum` | **Mantidos** (back-compat — `coachType` ainda existe no body e em colunas). |
| `UpgradeCoachModal.tsx` (frontend) | **Repropósito leve** — texto muda de "coach X bloqueado por tier" → "ferramentas avançadas / mais mensagens disponíveis no Pro". Mostra quando `free` esbarra no rate limit ou quando o agente menciona uma tool que `free` não tem. **Critério mínimo: nenhum fluxo do frontend mostra mais "coach Mental/Técnico/de Torneios bloqueado".** Escopo exato fica com system-architect/test-writer; pode ser apenas esvaziar/renomear. |

**Tabela final (tier → acesso):**

| Tier | Chat (Grindfy AI) | Tools | Rate limit (msg/24h) | Relatórios automáticos |
|---|---|---|---|---|
| `free` | Sim — contexto completo | **Não** (`exportToolsForAnthropic('free') === []`) | 10 | Não (Fase 1; e mesmo lá, só Pro+) |
| `pro` | Sim — contexto completo | Sim — 17 tools (`gateByTier` Pro+) | 50 | (Fase 1 — Pro+) |
| `premium` | Sim — contexto completo | Sim — 17 tools | 200 | (Fase 1 — Pro+) |
| `admin` | Sim — contexto completo | Sim — 17 tools (admin recebe tudo) | ∞ | (Fase 1) |

**Decisão explícita:** **não** gatear partes do contexto por tier. O contexto é texto já carregado; gatear seções por tier seria complexidade sem ganho real na v1. `free` = chat com contexto completo, sem tools de detalhe, rate limit baixo.

### 2.6 Prompt caching — a quebra única é aceita

Mudar `GRINDFY_AI_BASE` (vs os 3 bases anteriores) muda o conteúdo do bloco STATIC → o cache key da Anthropic muda **uma vez** quando este sprint for pra produção (a próxima conversa de cada usuário paga um cache miss; a segunda mensagem da mesma sessão volta a ter cache hit). **Aceitável** — é uma quebra única, planejada. Lesson #10: o problema é **divergência silenciosa** entre cópias, não quebra controlada. Como o AI-0A já quebrou o cache (RF-14) e a consolidação obriga a mudar o base de qualquer jeito, fazer tudo num PR. **Inviolável:** uma fonte única de prompt (sem cópia paralela / variante "backticked" — ADR-147 §3); o bloco STATIC continua array com `cache_control: ephemeral`; o `coachType` muda apenas a linha de lente, **no DYNAMIC**, fora do cache.

Bônus: pós-consolidação há **1 cache key estável** para todo `coachType` (era 3 — Mental, Tournament, Technical — cada um cacheado separadamente). Em tese, melhora o cache hit rate agregado (um usuário que conversa "em foco técnico" e depois "em foco mental" reusa o mesmo STATIC cacheado).

---

## 3. Alternativas consideradas

### A. Manter as 3 personas + adicionar mais tools (status quo + AI-0A)

- **Prós:** zero refactor de prompt; cada coach já tem seu tom calibrado; risco de regressão menor.
- **Contras:** o problema central (fragmentação de contexto, confusão do usuário, 3 prompts pra manter) permanece. O AI-0A religou as tools mas o **prompt base** ainda fatia o contexto e diz "você é o Coach X" — o agente não cruza dores sistêmicas no mesmo turn. Bloqueia a Fase 1 inteira (relatórios, loop fechado, hub). **Descartada** — o plano de melhoria (Parte 4 Tema A, ICE 7.7) é explícito que a consolidação fecha a Fase 0.

### B. Consolidar o prompt mas manter o gate de contexto/acesso por `coachType` (meio-termo)

Base único, mas o DYNAMIC ainda gateia weekly plan/study progress por `coachType`, e o tier ainda bloqueia "qual coach".

- **Prós:** menos mudança no `coachAccess.ts`; preserva a economia de "free não vê study progress".
- **Contras:** o agente único que **não vê tudo** é incoerente — "sou o Grindfy AI mas não tenho seu plano semanal porque você abriu na aba mental"? O usuário não vê mais "abas de coach" (ou vê chips de lente), então o gate de contexto fica invisível e arbitrário. A economia de gatear study progress por tier é marginal (uma seção de texto). **Descartada** — agente único implica contexto único; meio-termo é o pior de dois mundos.

### C. Deletar `coachType` completamente (sem back-compat)

Tirar a coluna `coach_type` de `chat_sessions`/`coach_conversations`, parar de aceitar `coachType` no body.

- **Prós:** modelo mais limpo; nada de "lente" pra explicar.
- **Contras:** **migração de schema** (alterar 2 tabelas com dados em produção); sessões antigas perdem a info de qual foco tinham; a listagem de sessões por `coachType` quebra; `monthly_coach_summaries` e `coach_leak_focus` referenciam `coachType`. Custo alto, benefício baixo — a "lente" é uma linha de prompt, não uma dívida real. **Descartada** — back-compat com zero migração é a restrição; `coachType` como lente é o caminho barato.

### D. Lente no STATIC (3 variantes de cache key)

Colocar a linha de lente no bloco STATIC.

- **Prós:** dentro de uma única lente, cache hit 100% no STATIC.
- **Contras:** 3 variantes de cache key; trocar de foco no hub invalida o cache do STATIC. O cenário "agente único" é exatamente o usuário trocar de foco — então o STATIC perde o cache justo quando mais importa. **Descartada** — a linha no DYNAMIC custa zero (DYNAMIC já é reescrito sempre) e mantém 1 cache key estável.

---

## 4. Consequências

### 4.1 Positivas
- **Contexto unificado** — o agente cruza mental + selection + técnico + bankroll + estudos no mesmo turn. Diferenciador do produto destravado.
- **UX mais simples** — um agente, não 3. O usuário não escolhe "qual coach"; no máximo dá uma dica de foco (chip de lente).
- **Um prompt pra manter** (DRY — lesson #10). Menos vetor de divergência silenciosa. Fonte única de safety/citation/confidence preservada (ADR-147 §3).
- **1 cache key estável** para todo `coachType` (era 3) — cache hit rate agregado tende a melhorar.
- **Pré-requisito da Fase 1 destravado** — relatórios automáticos, loop fechado, hub, onboarding conversacional dependiam disso.
- **Zero migração** — `coachType` continua, vira lente.
- **Não regride acesso** — `free` ganha o agente único (antes tinha só o Mental); Pro+ ganham o agente único + tools.

### 4.2 Negativas
- **Cache key do STATIC quebra uma vez** quando for pra produção (próxima conversa de cada usuário = 1 cache miss). Aceito — quebra única, planejada; o AI-0A já quebrou e a consolidação obriga de qualquer jeito.
- **Bloco STATIC unificado pode ficar um pouco maior** que cada base individual (cobre mais áreas), e o DYNAMIC passa a incluir weekly plan + study progress **sempre** (antes 1 dos 2 por coach). Variação pequena de tokens, dentro do orçamento; sem dados novos volumosos (FT analytics detalhado, ROI por dimensão pré-computado — esses ficam nas tools, não no prompt). Custo esperado: estável ou levemente menor (menos prompts pra cachear).
- **Vários testes quebram de propósito** (ver §5) — snapshot do prompt, testes de `getMentalPrompt`/etc, testes de `buildStaticSystemBlock`/`buildDynamicSystemBlock` que dependiam do gate por `coachType`, testes de `handleCoachChat` que esperavam `403 tier_locked` por coach, testes de `CoachAI.tsx` que dependiam das 3 abas. Test-writer reescreve; implementer não toca em testes.
- **`coachAccess.ts` perde código** (`canAccessCoach`/`getAccessibleCoaches`/`COACH_ACCESS`/`getUpgradeTarget` total/parcialmente removidos ou trivializados). Risco de quebrar imports — mitigado por `grep` antes de deletar.

### 4.3 Neutras
- **`coachType` permanece como conceito** (lente, listagem de sessões, summaries mensais por coach) — back-compat. Sprints futuros podem revisitar se a "lente" deixar de fazer sentido.
- **Segundo turn conversacional do LLM com `tool_result`** continua sendo pendência conhecida (não implementado neste sprint — provavelmente AI-1B). Inalterado.
- **`SessionTracker.tsx`** (componente morto que POSTa em `/api/tournaments` com `grindSessionId`) — não tem relação com este sprint; permanece morto.

---

## 5. O que o test-writer precisa saber

**Testes que quebram de propósito (mudança intencional, NÃO regressão):**

1. **`tests/coach/citations/system-prompt-snapshot.test.ts`** (ou o snapshot equivalente do system prompt) — o texto do base prompt muda (`GRINDFY_AI_BASE` substitui os 3 bases). Reescrever o snapshot. O snapshot agora é o **mesmo corpo de base** para `coachType` ∈ {mental, tournament, technical} (a única diferença permitida é a linha de lente no DYNAMIC).
2. **Testes de `getMentalPrompt` / `getTournamentPrompt` / `getTechnicalPrompt`** (em `tests/coach/...` que testam os 3 separados) — as funções são removidas. Substituir por testes de `GRINDFY_AI_BASE` / `getGrindfyAiBasePrompt()` (um só). Verificar: o base **não contém** as strings `"Coach Mental"`, `"Coach Técnico"`, `"Coach de Torneios"` como apresentação do agente; **contém** uma identidade de "Grindfy AI" copiloto de carreira; menciona as áreas (mental, selection, técnico, bankroll, estudos); instrui usar tools para detalhe; instrui citar fonte.
3. **Testes de `buildStaticSystemBlock(coachType, inputs)`** que dependiam de `coachType` mudar o base — atualizar: `buildStaticSystemBlock('mental', i)` e `buildStaticSystemBlock('technical', i)` produzem o **mesmo corpo de base prompt**. A ordem do STATIC continua: base → `SAFETY_RULES` → `SAFETY_RULES_COMPETITOR_BLOCK` → `CITATIONS_RULES` → `CONFIDENCE_RULES` → perfil → aiProfile → statsSnapshot → lastSummary. `cache_control: { type: 'ephemeral' }` no STATIC quando cache enabled.
4. **Testes de `buildDynamicSystemBlock(coachType, inputs)`** que dependiam do gate por `coachType` — atualizar:
   - `buildDynamicSystemBlock('mental', { weeklyPlan: {...}, studyProgress: [...] })` inclui **ambas** as seções (Plano Semanal **e** Progresso de Estudo) — não mais gated.
   - `buildDynamicSystemBlock('technical', { weeklyPlan: {...} })` inclui a seção de Plano Semanal (antes só `tournament` via).
   - `buildDynamicSystemBlock('mental', {})` (ou com `coachType` informado) inclui a **linha de lente** "Lente inicial: mental game..." como primeira linha. Idem `tournament` → "seleção de torneios e planejamento de grade"; `technical` → "análise técnica e leaks". A linha menciona "pode falar de qualquer assunto".
   - Sessão ativa, break feedbacks, leaks, page context continuam entrando sempre que há dado (inalterado).
   - DYNAMIC **não** tem `cache_control`.
5. **Testes de `assembleContext`** que dependiam do gate por `coachType` ou de `getSystemPrompt` por-coach — atualizar: o `getSystemPrompt` loader pode ser uma função que ignora `coachType` e retorna `GRINDFY_AI_BASE`; o `system` final vem de `buildSystemArray`. Se o dead-code `systemParts` for removido, garantir que nenhum teste o importava.
6. **Testes de `handleCoachChat`** que esperavam `403 tier_locked` para `free` chamando `coachType: 'technical'` (ou `pro` chamando `technical`) — atualizar: agora esses requests retornam `200` (ou `429` se rate-limited). Não há mais `403 tier_locked` por coach. `400` por `coachType` inválido (ou ausente) **continua**.
7. **Testes de `CoachAI.tsx` / `MiniChat.tsx`** que dependiam das 3 abas de coach — atualizar (ver ADR-150 para o hub). Lessons #27 (Radix Tabs reage a `onMouseDown` — `onClick` redundante em `<TabsTrigger>` controlado), #28 (`vi.mock` por path — re-export shim se mockar componente em path diferente), #29 (`useQuery` sem provider → ErrorBoundary local), #30 (hook test jsdom — config-level) aplicáveis.
8. **`coachAccess.ts`** — se `canAccessCoach`/`getAccessibleCoaches`/`COACH_ACCESS` forem removidos, atualizar/remover os testes deles. `getRateLimitForPlan` (10/50/200/∞) **inalterado** — testes ficam. `exportToolsForAnthropic('free') === []` **inalterado**; `exportToolsForAnthropic('pro')` inclui as 17 tools (confirmar contagem com o registry pós-AI-0A — ~18 entradas com alias deprecado).

**Testes novos esperados:**
- `GRINDFY_AI_BASE` não menciona "Coach Mental/Técnico/de Torneios"; menciona "Grindfy AI" + as 5 áreas; instrui tools + citação.
- `buildDynamicSystemBlock` emite a linha de lente correta por `coachType` (3 casos) + "pode falar de qualquer assunto".
- `buildDynamicSystemBlock` inclui weekly plan + study progress para todo `coachType` quando há dado.
- `buildStaticSystemBlock` produz corpo de base idêntico entre os 3 `coachType`s.
- `handleCoachChat` não retorna `403 tier_locked` para nenhum `(tier, coachType)`; retorna `200`/`429`.

**Lessons aplicáveis:** #5/#35 (mock de SDK Anthropic — `new Anthropic(...)` em try/catch com fallback — não regredir ao mexer no route), #10 (DRY de prompts — fonte única), #13 (`apiRequest` retorna JSON parseado), #14/#26 (`await import` em vez de `require` em testes `.tsx`), #24 (`git status` periódico em feature branch — `feature/sprint-ai-0b`).

---

## 6. Confiança

**Alta.** A consolidação é o caminho explicitamente recomendado pelo plano de melhoria (Parte 4 Tema A, ICE 7.7) e fecha a Fase 0. A estrutura de 2 blocos do ADR-019 já existe e é preservada — só o conteúdo do STATIC muda. A quebra de cache é única e planejada (lesson #10 endossa quebra controlada). O `coachType` como lente é zero-migração. Os pontos deixados em aberto pela spec (assinatura de `getBasePrompt`, lente no STATIC vs DYNAMIC, deletar vs `@deprecated` as funções legacy, remover ou não o dead-code, repropósito vs remoção do `UpgradeCoachModal`) estão resolvidos acima. Risco residual — testes legacy quebrando — é esperado e documentado para o test-writer (§5).

## Referências
- Spec: `Docs/specs/sprint-ai-0b.md` (RF-01..03, RF-06, RF-08)
- Plano: `Docs/strategy/ai-agents-improvement-plan-2026-05-11.md` (Parte 4 Tema A), `memory/ai_agents_improvement_plan_2026-05-11.md`
- ADR-019 (prompt cache 2 blocos — estrutura preservada), ADR-147 §3 (fonte única citation/confidence), ADR-145/146 (registry de tools — inalterado), ADR-021 (seleção de modelo via env — inalterado), `021-coach-gate-by-plan` (gate por plano — emendado: a parte "qual coach por tier" deixa de existir)
- `Docs/architecture/ai-coach/adr-001-llm-provider.md` (§3 coaches — superseded pela consolidação), `adr-002-memory-architecture.md` (§"compartilhado entre os 3 coaches" — agora é 1 agente), `c4-component.md`, `sequence-diagrams.md` (atualizados/superseded)
- ADR-149 (page context expandido), ADR-150 (hub /coach-ai)
- Diagramas: `Docs/architecture/diagrams/coach-ai-0b/system-prompt-structure.mermaid`, `coach-ai-overview.mermaid`
- `server/coachSystemBuilder.ts`, `server/coachContext.ts`, `server/coachPrompts.ts`, `server/coachAccess.ts`, `server/routes/coach.ts`, `client/src/components/UpgradeCoachModal.tsx`
- Lessons #5, #10, #13, #24, #27, #28, #29, #30, #35 (`Docs/architecture/lessons-learned.md` / CLAUDE.md §9)
