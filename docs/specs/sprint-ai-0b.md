# Spec: Sprint AI-0B — Consolidar os 3 coaches num único "Grindfy AI" + page context em mais rotas + hub /coach-ai + tier gate ajustado

## Status
Proposta

## Resumo
Segundo e último sprint da Fase 0 do plano de melhoria dos agentes de IA. Consolidar os três coaches separados (Mental / Tournament / Technical) num **único agente "Grindfy AI"** com um system prompt base único, um bloco de contexto **completo** (o agente vê tudo: dashboard stats, ROI por dimensão, FT analytics, study cards, leaks, break feedbacks, weekly plan, sessão ativa, page context) e as tools (já religadas no AI-0A) para o detalhe sob demanda. `coachType` continua existindo por **back-compat** como "lente inicial" (dica de foco da conversa) — não mais como gate de contexto nem de acesso. Em paralelo: (1) **plugar de fato o page context** no `/api/coach/chat` (a infra do server existe — schema + builder — mas o route handler nunca recebeu o `pageContext` do frontend) e **estendê-lo a 5 rotas novas** (`/bankroll`, `/estudos`, `/stats`, `/biblioteca`, `/upload`); (2) preparar a página `/coach-ai` para virar o **hub do Grindfy AI** (chat unificado + esqueleto/layout para timeline de relatórios/nudges que vêm na Fase 1 + acesso a audit `/api/coach/audit` + preferences de nudge); (3) **ajustar o tier gate** — como não há mais 3 coaches para gatear, o gate passa a ser sobre rate limit (mantido: 10/50/200/∞ msg/dia) + tools (mantido: `free` não recebe tools, Pro+ recebe). Não regredir quem tem acesso ao chat hoje.

**Não entra neste sprint:** relatórios automáticos (Daily/Weekly/Monthly/Quarterly — Fase 1), onboarding/diagnóstico conversacional (Fase 1), anti-fadiga completo / nudges novos (Fase 1), novas tools de grade/estudo/diagnóstico (Fase 2), memória estruturada {nível, metas, focoDoMes, ...} (Fase 1), segundo turn conversacional do LLM com `tool_result` (pendência conhecida).

## Contexto

### Estado atual (confirmado no código, 2026-05-12)

**Três coaches separados.** `server/coachPrompts.ts` exporta `getMentalPrompt` / `getTournamentPrompt` / `getTechnicalPrompt` — três prompts base distintos, cada um vendo um pedaço dos dados:
- **Mental** (`MENTAL_BASE` em `coachSystemBuilder.ts`): break feedbacks, preparation logs, métricas mentais de grind sessions, correlação mental↔resultado. (E um bloco "leaks do coach técnico" só no caminho dead-code de `coachContext.ts`.)
- **Tournament** (`TOURNAMENT_BASE`): dashboard stats, ROI por site/buyin/categoria/speed/dia, top/worst templates, planned tournaments, profile states, weekly plan.
- **Technical** (`TECHNICAL_BASE`): dashboard stats completo (JSON), final table analytics, finish rates, study cards/sessions, coaching insights, leaks detectados.

O builder cacheado (`server/coachSystemBuilder.ts`, ADR-019) já tem a estrutura de 2 blocos — STATIC (cacheado, `cache_control: ephemeral`): base prompt do coach + `SAFETY_RULES` + `SAFETY_RULES_COMPETITOR_BLOCK` + `CITATIONS_RULES` + `CONFIDENCE_RULES` + perfil do jogador + AI profile (memória longo prazo) + stats snapshot + resumo da sessão anterior; DYNAMIC (não cacheado): sessão de grind ativa + break feedbacks + leaks + weekly plan (só `coachType === 'tournament'`) + study progress (só `coachType === 'technical'`) + page context. **A divisão por `coachType` está costurada no DYNAMIC** (weekly plan gated por `=== 'tournament'`, study progress gated por `=== 'technical'`) e no STATIC (`getBasePrompt(coachType)`).

**`coachContext.ts` tem ~100 linhas de dead-code documentado** (o array `systemParts` + ~8 queries inline que ele alimenta) — o system prompt final vem de `buildSystemArray(...)`, não desse array. Comentário no código já reconhece e pede cleanup.

**Page context — server tem a infra, mas o route handler nunca a plugou.** `server/coachPageContext.ts` tem o schema Zod (`pageContextSchema` — discriminated union: `grade-planner`, `grind-live`, `dashboard`, `coach-ai`, `cooldown-log`), o sanitizador (`sanitizePageContext`), o scrubber de injection (`scrubInjectionTokens`) e o formatter (`buildPageContextSection`). `coachSystemBuilder.buildDynamicSystemBlock` chama `buildPageContextSection(inputs.pageContext)` se `inputs.pageContext` existir. **MAS:** `assembleContext` em `coachContext.ts` só recebe `pageContext` via um loader opcional `getPageContext(userId, sessionId)` que o route handler de `/api/coach/chat` (`server/routes/coach.ts` `handleCoachChat`) **nunca fornece** — e o frontend (`client/src/hooks/useCoachChat.ts`) **nunca manda `pageContext` no body**. Resultado: o page context **não funciona hoje na prática**, apesar da infra existir. (ADR-025 e `Docs/api/coach.md` descrevem como se funcionasse.)

**Tier gate (ADR-021).** `server/coachAccess.ts`:
- `COACH_ACCESS`: `free → ['mental']`, `pro → ['mental', 'tournament']`, `premium`/`admin` → todos os 3. `canAccessCoach(tier, coachType)` bloqueia com `403 tier_locked` no route.
- `RATE_LIMITS` / `getRateLimitForPlan`: free 10, pro 50, premium 200, admin ∞ msg/dia (rolling 24h).
- Tools: `exportToolsForAnthropic(tier)` — `tier === 'free'` → `[]`; Pro+ → tools filtradas por `gateByTier` (todas as 17 tools têm `gateByTier: ['pro', 'premium', 'admin']` desde o AI-0A — ADR-145/146).

**Página `/coach-ai`** (`client/src/pages/CoachAI.tsx`, ~415 linhas): chat simples com 3 abas seletoras de coach (Mental / Torneios / Técnico) via `useState`, sidebar de sessões, streaming SSE. **Não é** a página `/coach` (GradePlanner) — essa é o "hub de planejamento" com 4 tabs URL-persisted (planner/selector/flights/variance, ADR-125). A `/coach-ai` ainda **não tem** timeline, audit visível, nem preferences in-page; e o `coachType` é só `useState` local (não URL-persisted). `MiniChat.tsx` é um chat compacto reusável que também tem 3 abas de coach.

**Pós AI-0A (já mergeado):** 17 tools no registry (11 read + 6 write), citations/confidence reforçados no system prompt com fonte única (`server/coachSafetyPrompts.ts`), ADR-145/146/147 fixados, `xSearchProvider` auditado. O `coachType` ainda existe em `coach_conversations` (e em `chat_sessions.coach_type`) — back-compat.

### Por que consolidar (resumo do plano — Parte 4 Tema A)

1. As 3 personas **fragmentam o contexto** — cada coach só vê um pedaço dos dados, impossibilitando cruzar dores sistemicas (mental + vida, leak + estudo, selection + plateau, bankroll + carreira) que são o diferenciador do produto.
2. Confunde o usuário ("com qual coach falo sobre meu ROI vs meu tilt?").
3. Menos prompts pra manter (DRY — lesson #10) — um bloco estático grande cacheado vs 3 separados.
4. Pré-requisito de quase tudo na Fase 1 (relatórios, loop fechado, hub).

**Prioridade relativa:** A1 (consolidar coaches, ICE 7.7) — fecha a Fase 0. Depende do AI-0A (tools religadas + prompt reforçado) — entregue.

## Usuários

- **Jogador (tier `pro` / `premium` / `admin`):** conversa com o **Grindfy AI** (um agente só). O agente "vê tudo" no contexto — pode falar de ROI, leaks, banca, estudos, mental, grade na mesma conversa, sem o usuário escolher "qual coach". O page context (rota atual) chega ao agente quando o usuário abre o chat estando numa página instrumentada (dashboard, grade, grind-live, bankroll, estudos, stats, biblioteca, upload). Tools (já existentes) para o detalhe sob demanda. Audit + preferences acessíveis pelo hub `/coach-ai`.
- **Jogador (tier `free`):** continua tendo chat (não regride — hoje `free` acessa o coach Mental; após a consolidação `free` acessa o Grindfy AI), com rate limit 10 msg/dia, **sem tools** (`exportToolsForAnthropic('free') === []` — inalterado), com contexto montado normalmente. Decisão: o gate de `free` é só rate limit + ausência de tools, **não** "contexto reduzido" (simplicidade > micro-otimização; o contexto é texto já carregado, gatear partes dele por tier seria complexidade extra sem ganho real na v1).
- **Founder / Admin (QA):** valida no marco — abrir `/coach-ai`, mandar uma pergunta de cada "área" (ROI, leak, banca, estudo, mental) **na mesma conversa** e ver o agente responder com contexto de todas; abrir o chat em `/bankroll` e ver o agente mencionar a rota; ver audit + preferences no hub.
- **Time de manutenção:** consome o ADR de consolidação (supersedes a separação de personas) + o ADR de page context expandido + a doc atualizada (`Docs/api/coach.md`).

---

## Requisitos Funcionais

### RF-01: System prompt unificado — bloco STATIC base único (`coachSystemBuilder.ts`)
**Descrição:** Substituir os 3 base prompts (`MENTAL_BASE` / `TOURNAMENT_BASE` / `TECHNICAL_BASE`) e o `getBasePrompt(coachType)` por **um base prompt único** "Grindfy AI" no bloco STATIC. O novo base apresenta o agente como copiloto de carreira único que cobre mental + selection + técnico + bankroll + estudos, com tom de par/companheiro de grind. A função `getBasePrompt` pode (a) sumir e ser substituída por uma constante `GRINDFY_AI_BASE`, ou (b) virar `getBasePrompt(coachType?)` que ignora `coachType` para o corpo e só usa o `coachType` para acrescentar **uma linha de "lente inicial"** (ver RF-03). System-architect decide a assinatura; o critério é: **o corpo do base prompt não varia com `coachType`**.

**Estrutura do bloco STATIC unificado (ordem — preserva o que o AI-0A já fez):**
1. `GRINDFY_AI_BASE` (novo — agente único; ~150-250 tokens; tom calibrado; lista das áreas que cobre; instrução de usar tools para detalhe; instrução de citar fonte; **nada** de "você é o Coach Mental/Técnico/de Torneios").
2. `SAFETY_RULES` (de `coachSafetyPrompts.ts` — inalterado).
3. `SAFETY_RULES_COMPETITOR_BLOCK` (de `coachSafetyPrompts.ts` — hard-block concorrentes, ADR-075 — inalterado).
4. `CITATIONS_RULES` (de `coachSafetyPrompts.ts` — reforçado no AI-0A, ADR-147 — inalterado neste sprint, **exceto** ajustar exemplos few-shot que mencionem "Coach Mental/Técnico/de Torneios" para o agente único — ver RF-03; e qualquer exemplo few-shot já passou pelo AI-0A só mencionando tools que existem).
5. `CONFIDENCE_RULES` (de `coachSafetyPrompts.ts` — inalterado).
6. **(opcional, condicional ao `coachType`)** uma linha de lente inicial — ver RF-03. Decisão de onde colocar (STATIC vs DYNAMIC) em RF-03.
7. Perfil do jogador (nome, plano, criado em, total de torneios) — `inputs.userProfile`, se presente. Inalterado.
8. Perfil do jogador (memória de longo prazo) — `inputs.aiProfile`, se presente. Inalterado.
9. Stats snapshot (ROI, profit, volume, ABI) — `inputs.statsSnapshot`, se presente. Inalterado.
10. Resumo da sessão anterior — `inputs.lastSummary`, se presente. Inalterado.

**Restrição de cache (lesson #10 + ADR-019 + ADR-147 §3):** mudar o base prompt quebra o cache key do bloco STATIC da Anthropic **uma vez** quando este sprint for pra produção. **Aceitável** — é uma quebra única e planejada. Como o AI-0A já quebrou o cache (RF-14), e como a consolidação obriga a mudar o base de qualquer jeito, fazer tudo de uma vez. **Não** introduzir variante "backticked" nem cópia paralela. O bloco STATIC continua sendo um array com `cache_control: { type: 'ephemeral' }` (não vira string). O bloco DYNAMIC continua sem `cache_control`.

**Critério de aceitação:**
- [ ] `coachSystemBuilder.ts` não exporta mais 3 base prompts distintos por coach type — há um único base `GRINDFY_AI_BASE` (ou equivalente).
- [ ] `buildStaticSystemBlock(coachType, inputs)` produz um texto cujo **corpo do base prompt é idêntico para `coachType` ∈ {mental, tournament, technical}** (a única diferença permitida é a linha de lente inicial do RF-03, se ela ficar no STATIC).
- [ ] O texto do base prompt unificado **não contém** as strings "Coach Mental", "Coach Técnico", "Coach de Torneios" como apresentação do agente.
- [ ] O bloco STATIC ainda concatena, nessa ordem: base único → `SAFETY_RULES` → `SAFETY_RULES_COMPETITOR_BLOCK` → `CITATIONS_RULES` → `CONFIDENCE_RULES` → (lente inicial opcional) → perfil → aiProfile → statsSnapshot → lastSummary.
- [ ] `buildSystemArray` continua retornando `SystemBlock[]` com `cache_control: { type: 'ephemeral' }` no bloco STATIC quando `COACH_PROMPT_CACHE_ENABLED !== 'false'`; retorna string concatenada quando `=== 'false'` (fallback legacy inalterado).
- [ ] As constantes de citation/confidence continuam vindo de **fonte única** (`coachSafetyPrompts.ts`) — sem cópia literal em `coachPrompts.ts`.
- [ ] `tests/coach/citations/system-prompt-snapshot.test.ts` (ou o snapshot equivalente) é atualizado pelo test-writer — mudança intencional do texto, não regressão.

---

### RF-02: Bloco DYNAMIC com contexto COMPLETO (o agente vê tudo)
**Descrição:** O bloco DYNAMIC deixa de gatear seções por `coachType`. Hoje: weekly plan só entra se `coachType === 'tournament'`; study progress só entra se `coachType === 'technical'`. Após este sprint: **todas** as seções de contexto entram sempre (quando há dado), independente do `coachType`. As seções dinâmicas, na ordem (cabeçalhos podem ser refinados pelo system-architect):
1. **Sessão de Grind Ativa** — `inputs.activeGrind` (status, profit/loss, foco/energia/confiança médios). Já entra sempre. Inalterado.
2. **Break Feedbacks recentes** — `inputs.breakFeedbacks` (foco, energia, confiança, IE, interferências). Já entra sempre. Inalterado.
3. **Leaks Detectados** — `inputs.leaks` (severidade + descrição). Já entra sempre. Inalterado.
4. **Plano Semanal Atual** — `inputs.weeklyPlan` (target buy-ins, profit, volume). **Mudança:** entra sempre (não mais gated por `coachType === 'tournament'`).
5. **Progresso de Estudo** — `inputs.studyProgress` (categoria/título, knowledge %, status). **Mudança:** entra sempre (não mais gated por `coachType === 'technical'`).
6. **Contexto da página atual** (page context) — `inputs.pageContext` via `buildPageContextSection`. Já entra sempre que presente. **Mudança neste sprint:** passa a ser **de fato fornecido** (ver RF-04/RF-05).

**Loaders novos / ampliados (em `coachContext.ts` `assembleContext` + `routes/coach.ts` `handleCoachChat`):** o `assembleContext` já aceita loaders opcionais (`getAiProfile`, `getActiveGrind`, `getRecentBreakFeedbacks`, `getDetectedLeaks`, `getWeeklyPlan`, `getStudyProgress`, `getPageContext`). Hoje o route handler passa todos **exceto `getPageContext`** (e os loaders existem só se `coachStorage.getX` existir). Para o contexto ser "completo" para todo `coachType`, o route handler deve:
- Fornecer `getPageContext` (ver RF-04) — **novo**.
- Garantir que `getWeeklyPlan` e `getStudyProgress` sejam fornecidos **independente do `coachType`** (hoje são, mas o builder os ignorava por `coachType`; com o builder mudado, eles passam a ser usados).
- Os demais loaders permanecem como estão.

**Dead-code cleanup (oportunista, recomendado mas não obrigatório):** o array `systemParts` + as ~8 queries inline em `coachContext.ts` (linhas ~97-194) podem ser removidos neste sprint (já são dead-code documentado e desperdiçam queries). Se o test-writer/implementer julgar que a remoção amplia o escopo de risco, deixar com um TODO atualizado — mas a recomendação é remover, já que estamos mexendo nesse arquivo. Se remover: garantir que nenhum teste depende desse array (improvável — ele não alimenta o `system` final).

**Não-objetivo:** **não** adicionar dados novos ao contexto que não existem hoje (final table analytics detalhado, top/worst templates, ROI por dimensão como texto pré-computado, etc.) — esses ficam acessíveis via **tools** (já religadas no AI-0A) sob demanda, não no prompt. O contexto "completo" aqui significa "todas as seções que já são carregadas, sem gate por `coachType`" — não "todo dado do sistema serializado no prompt" (isso estouraria o token budget e mataria o cache). Enriquecimento estruturado do contexto (nível, metas, foco do mês) é Fase 1 (AI-1A).

**Critério de aceitação:**
- [ ] `buildDynamicSystemBlock(coachType, inputs)` inclui a seção de **Plano Semanal** sempre que `inputs.weeklyPlan` é truthy — para `coachType` ∈ {mental, tournament, technical} (não mais gated por `=== 'tournament'`).
- [ ] `buildDynamicSystemBlock(coachType, inputs)` inclui a seção de **Progresso de Estudo** sempre que `inputs.studyProgress` é não-vazio — para todo `coachType` (não mais gated por `=== 'technical'`).
- [ ] As seções de sessão ativa, break feedbacks, leaks, page context continuam entrando sempre que há dado (comportamento inalterado).
- [ ] O bloco DYNAMIC **não** tem `cache_control`.
- [ ] `handleCoachChat` em `routes/coach.ts` passa `getPageContext` para `assembleContext` (novo loader — ver RF-04).
- [ ] `handleCoachChat` passa `getWeeklyPlan` e `getStudyProgress` para todo `coachType` (não condiciona por `coachType`).
- [ ] (Se o cleanup for feito) `coachContext.ts` não tem mais o array `systemParts` nem as queries inline que o alimentavam; o `system` final continua vindo de `buildSystemArray`. Nenhum teste quebra por isso.
- [ ] Regressão: testes existentes de `assembleContext` / `buildStaticSystemBlock` / `buildDynamicSystemBlock` são atualizados pelo test-writer onde dependiam do gate por `coachType` — mudança intencional.

---

### RF-03: `coachType` vira "lente inicial" (back-compat) — não gate de contexto nem de acesso
**Descrição:** `coachType` (mental | tournament | technical) **continua existindo** no body do `/api/coach/chat`, em `chat_sessions.coach_type` e em `coach_conversations` — back-compat, zero migração. Mas seu papel muda:
- **Não** seleciona um system prompt diferente (RF-01 — base único).
- **Não** gateia partes do contexto (RF-02 — contexto completo).
- **Não** gateia acesso por tier (RF-06 — todo tier que tem acesso ao chat tem acesso ao agente único).
- **Sim** vira uma **dica de "lente inicial"**: o builder acrescenta **uma linha** no system prompt informando "o usuário abriu o chat na aba/lente X; comece focando em Y, mas você pode (e deve) falar de qualquer assunto se a conversa pedir". Mapeamento sugerido (system-architect refina o texto):
  - `mental` → "lente inicial: mental game (foco, tilt, preparo, rotina)".
  - `tournament` → "lente inicial: seleção de torneios e planejamento de grade".
  - `technical` → "lente inicial: análise técnica e leaks".
- **Decisão de onde colocar a linha de lente:** preferência por colocá-la no bloco **DYNAMIC** (não cacheado) — assim trocar de aba não invalida o cache do STATIC. Se o system-architect preferir no STATIC (uma só linha, 3 variantes de cache), documentar o trade-off no ADR. O critério inviolável: a linha de lente é **a única coisa** que varia com `coachType` no prompt.
- **Validação:** o route handler continua validando `coachType` ∈ `VALID_COACH_TYPES` (`['mental', 'tournament', 'technical']`) — request sem `coachType` válido → `400` (inalterado). O `pageContext` `coach-ai` variant (`{ route: 'coach-ai', activeCoachType? }`) continua válido — `activeCoachType` é a mesma "lente".
- **`coachContext.ts` `buildMentalContext` / `buildTournamentContext` / `buildTechnicalContext`:** essas funções carregam dados específicos por coach (break feedbacks pro mental, ROI por dimensão pro tournament, study cards pro technical). Hoje o route handler chama uma delas conforme `coachType` e passa o resultado pro `getSystemPrompt` legacy (`getMentalPrompt`/etc). **Mudança:** com o base prompt unificado, o `getSystemPrompt` legacy deixa de ser por-coach. Decisão de simplificação: `getSystemPrompt` passa a retornar **um único** prompt (o `GRINDFY_AI_BASE` + safety, equivalente ao que `buildStaticSystemBlock` já monta — ou simplesmente um fallback mínimo, já que o `buildSystemArray` é o caminho real). As funções `buildMentalContext`/`buildTournamentContext`/`buildTechnicalContext` e os exports `getMentalPrompt`/`getTournamentPrompt`/`getTechnicalPrompt` em `coachPrompts.ts`: o system-architect decide entre (a) deletá-las (dead-code após a unificação), ou (b) mantê-las marcadas `@deprecated` por um sprint de transição. Recomendação: **deletar `getMentalPrompt`/`getTournamentPrompt`/`getTechnicalPrompt`** (substituir o import no route por um `getGrindfyAiBasePrompt()` único) — são o que mais quebra testes (vários testam esses 3 separadamente; o test-writer atualiza), e mantê-los é dívida. As `buildXContext` podem ficar `@deprecated` se forem usadas em outros lugares (verificar com grep) — se não, deletar.

**Critério de aceitação:**
- [ ] `coachType` continua aceito no body de `/api/coach/chat` e validado contra `VALID_COACH_TYPES` (request inválido → `400`).
- [ ] O system prompt **não muda de estrutura** entre `coachType`s — só a linha de lente inicial difere.
- [ ] Há uma linha de "lente inicial" no system prompt (STATIC ou DYNAMIC, conforme decisão) que reflete o `coachType` e instrui explicitamente "pode falar de qualquer assunto".
- [ ] `getMentalPrompt` / `getTournamentPrompt` / `getTechnicalPrompt` são removidos (ou `@deprecated` + não usados pelo route) — `routes/coach.ts` não chama mais 3 funções diferentes por `coachType` para montar o prompt.
- [ ] Nenhuma migração de schema (`coach_conversations.coach_type` e `chat_sessions.coach_type` permanecem como estão).
- [ ] Regressão: os testes que testavam `getMentalPrompt`/`getTournamentPrompt`/`getTechnicalPrompt` separados são atualizados/removidos pelo test-writer — mudança intencional, não regressão silenciosa.

---

### RF-04: Plugar o page context no `/api/coach/chat` (frontend → body → server)
**Descrição:** A infra de page context do server existe mas o frontend nunca manda e o route handler nunca lê. Este RF fecha o circuito **para as 4 rotas já no schema** (`grade-planner`, `grind-live`, `dashboard`, `coach-ai`) — o RF-05 adiciona as 5 novas. Partes:

1. **Backend — route handler (`server/routes/coach.ts` `handleCoachChat`):**
   - Ler `req.body.pageContext` (campo opcional, novo).
   - Se presente: validar via `sanitizePageContext(req.body.pageContext)` (de `coachPageContext.ts`). Se inválido (`null` retornado) → `400 { error: 'validation_failed', field: 'pageContext' }` (conforme ADR-025). Se ausente → segue sem page context.
   - Passar `getPageContext: async () => sanitizedPageContext` para `assembleContext` (ou passar o valor já sanitizado por um caminho equivalente — system-architect decide; o importante é que `buildDynamicSystemBlock` receba `inputs.pageContext`).
   - O scrubbing de injection já está embutido em `sanitizePageContext`.

2. **Frontend — `client/src/hooks/useCoachChat.ts`:**
   - Aceitar um parâmetro opcional `pageContext` (ou um getter `getPageContext()`) no hook ou no `sendMessage`. Quando fornecido, incluí-lo no `body` do POST `/api/coach/chat`.
   - Decisão de design: criar um **hook leve** `useCoachPageContext(route, fields)` (ou um helper) que monta o objeto `{ route, ...fields }` conforme o schema, OU passar o objeto direto pelo caller. System-architect decide; preferência por um hook pequeno reusável (`useCoachPageContext`) que cada página chama com os campos relevantes — assim adicionar uma rota nova é trivial. (Reusa o padrão de `useTabFromUrl` de ler estado da página.)
   - O `MiniChat.tsx` e a `CoachAI.tsx` recebem o `pageContext` da página onde estão montados (ou da rota atual, se forem usados embedded). Se `MiniChat` é montado em várias páginas, ele lê a rota atual (Wouter `useLocation`) e monta o page context conforme — mas só para rotas no schema; rota não-instrumentada → não manda `pageContext`.

3. **Sanitização e segurança (inalterado — ADR-025):** schema discriminated union strict (rejeita campos extras), max-length em strings, enums fechados, scrubbing de tokens de injection. Nada novo aqui — só passa a ser exercitado de verdade.

**Critério de aceitação:**
- [ ] `handleCoachChat` lê `req.body.pageContext`; se presente e inválido (rota desconhecida, campo extra, tipo errado) → `400 validation_failed` com `field: 'pageContext'`; se ausente → request prossegue sem page context.
- [ ] `handleCoachChat` passa o `pageContext` sanitizado para `assembleContext` (via `getPageContext` loader ou equivalente), e o bloco DYNAMIC do system prompt inclui a seção "Contexto da página atual" quando há page context válido.
- [ ] `useCoachChat` (ou `sendMessage`) inclui `pageContext` no body do POST quando fornecido pelo caller; quando não fornecido, o body não tem `pageContext` (não manda `undefined`/`null` explícito que estoure o schema — ou se mandar, o schema/handler ignora `undefined`).
- [ ] Page context com string contendo token de injection (`ignore previous instructions`, `<|im_start|>`, etc.) → `sanitizePageContext` substitui por `[redacted]` antes da injeção; request prossegue.
- [ ] Regressão: testes existentes de `useCoachChat` e de `handleCoachChat` continuam passando (page context é aditivo — body sem `pageContext` se comporta como hoje).

---

### RF-05: Page context em 5 rotas novas — `/bankroll`, `/estudos`, `/stats`, `/biblioteca`, `/upload`
**Descrição:** Adicionar 5 variantes ao `pageContextSchema` (discriminated union em `route`) em `server/coachPageContext.ts`, cada uma com campos **mínimos, não-PII, whitelisted** (mesmas regras dos schemas existentes: max-length, enums fechados, ranges plausíveis); estender `buildPageContextSection` com os 5 novos `case`s (o exhaustiveness check do `switch` força isso); e instrumentar as 5 páginas no frontend (via o hook/helper do RF-04). **Importante:** o page context é **inspeção leve da tela** (qual rota, qual filtro/aba ativa, IDs de contexto) — **não** é "carregar todos os dados da página no prompt". O agente, ao ver "usuário está em /bankroll com a wallet X selecionada", **chama a tool** `read_user_bankroll_history` (ou pergunta) para o detalhe. O page context só dá a **dica de onde o usuário está e o que está olhando**.

Para cada rota nova, o que contribui (campos do schema) — system-architect refina nomes/limites:

#### RF-05.1 — `/bankroll` (route literal `'bankroll'`)
- `walletsCount?: number().int().min(0).max(50)` — quantas wallets o usuário tem (inspeção, não os saldos).
- `selectedWalletId?: string().max(50)` — wallet em foco no painel, se houver.
- `activeTab?: z.enum(['resultados', 'movimentacoes', 'wallets', 'snapshots', 'relatorios'])` — aba/sub-view aberta (alinhar aos tabs reais de `WalletActivityPanel` / página Bankroll; system-architect verifica os nomes).
- `dateRange?: z.enum(['7d', '30d', '60d', '90d', 'all'])` — período do filtro, se aplicável.
- **Dado real (fonte server):** quando o agente quiser os números, chama `read_user_bankroll_history` (já existe) ou o contexto carregado já traz o stats snapshot. **NÃO** colocar saldo consolidado no page context (vetor: estaria expondo número via canal que o usuário comprometido controla; e o agente já tem `read_user_bankroll_history` / `simulate_bankroll_scenario`). O page context aqui é só "está na tela de bankroll, olhando a wallet X, aba movimentações, últimos 30d".
- **Formatter (`buildPageContextSection`):** `Rota: bankroll` + linhas com `Wallets: N`, `Wallet em foco: <id>`, `Aba: <tab>`, `Período: <range>`.

#### RF-05.2 — `/estudos` (route literal `'estudos'`)
- `activeTab?: z.enum([...])` — aba da página Estudos (system-architect verifica os nomes reais: hábito/streak, temas, spots/SRS, sessões, etc.).
- `activeThemesCount?: number().int().min(0).max(100)` — quantos temas de estudo o usuário tem ativos.
- `spotsDueCount?: number().int().min(0).max(500)` — quantos spots estão "due" no SRS hoje (inspeção; o número exato vem da tela).
- `studyStreakDays?: number().int().min(0).max(3650)` — streak de estudo atual.
- `focusedThemeId?: string().max(50)` — tema em foco, se houver.
- **Dado real:** o agente já tem `studyProgress` no contexto dinâmico (RF-02) e a tool `read_theme_with_linked_stats_and_spots`. Page context = "está em /estudos, aba spots, 12 spots due, streak 4 dias".
- **Formatter:** `Rota: estudos` + `Aba: <tab>`, `Temas ativos: N`, `Spots due: N`, `Streak: N dias`, `Tema em foco: <id>`.

#### RF-05.3 — `/stats` (route literal `'stats'`)
- `hasSnapshot?: z.boolean()` — o usuário já fez upload de algum HUD snapshot.
- `latestSnapshotId?: string().max(50)` — id do snapshot mais recente, se houver.
- `latestSnapshotStatsCount?: number().int().min(0).max(500)` — quantos stats foram extraídos no último snapshot (inspeção).
- `compareMode?: z.boolean()` — se a tela de 3-way compare está aberta.
- `selectedStatGroup?: string().max(50)` — grupo de stats em foco (alinhar ao catálogo Stats-V2 — system-architect verifica).
- **Dado real:** o agente já tem o stats snapshot resumido no STATIC e a tool `read_user_hud_stats` (v2). Page context = "está em /stats, tem snapshot de 217 stats, comparando, grupo 'Preflop' selecionado".
- **Formatter:** `Rota: stats` + `Snapshot: sim/não`, `Snapshot recente: <id> (N stats)`, `Modo comparação: sim/não`, `Grupo: <group>`.

#### RF-05.4 — `/biblioteca` (route literal `'biblioteca'`)
- `view?: z.enum(['catalogo', 'curso', 'lesson'])` — onde o usuário está dentro da biblioteca.
- `courseSlug?: string().max(100)` — curso aberto, se houver.
- `lessonSlug?: string().max(100)` — lesson aberta, se houver.
- `filterSites?: z.array(z.string().max(50)).max(20)` — chips de plataforma ativos no catálogo (reusa `filterSites[]` do BibliotecaPanel — RF-05 do coach-page-reform-1.5).
- `filterDaysOfWeek?: z.array(z.number().int().min(0).max(6)).max(7)` — chips de dia da semana.
- **Dado real:** o agente já tem a tool `recommend_lesson`. Page context = "está em /biblioteca, na lesson 'X' do curso 'Y'" (útil pro agente saber o que o usuário está estudando agora) ou "está no catálogo filtrando por GGPoker".
- **Formatter:** `Rota: biblioteca` + `View: <view>`, `Curso: <courseSlug>`, `Lesson: <lessonSlug>`, `Filtros plataforma: <sites>`, `Filtros dia: <days>`.
- **Lesson #19 (CTA targets):** este sprint **não** cria CTAs a partir do page context — só informa o agente. Se um sprint futuro fizer o agente sugerir "continue a lesson X", o link deve ser `/biblioteca/curso/${courseSlug}/${lessonSlug}/play?...` (rota Wouter real). Documentar como nota, não implementar.

#### RF-05.5 — `/upload` (route literal `'upload'`)
- `lastImportAt?: z.union([z.string(), z.null()])` — data ISO do último import bem-sucedido (string curta, validada; ou `null`).
- `lastImportNetwork?: z.string().max(50)` — rede do último import (WPN, GG, Stars, etc.).
- `lastImportTournamentsCount?: number().int().min(0).max(100000)` — quantos torneios o último import trouxe.
- `daysSinceLastImport?: number().int().min(0).max(3650)` — quantos dias desde o último import (inspeção; pré-computado no frontend ou derivado de `lastImportAt`).
- `pendingFile?: z.boolean()` — se há um arquivo selecionado mas ainda não enviado.
- **Dado real:** fonte server `storage.getUploadHistory(userId)` (já existe). Page context = "está em /upload, último import foi WPN há 8 dias com 142 torneios" — útil pro agente cobrar import (a "cobrança de import" como nudge é Fase 1, mas o agente já pode comentar no chat se vir o contexto).
- **Formatter:** `Rota: upload` + `Último import: <network> em <date> (N torneios)`, `Dias desde o último import: N`, `Arquivo pendente: sim/não`.

**Comum a todas:**
- Todas as 5 variantes são `.strict()` (rejeitam campos extras) — anti prompt-injection (ADR-025).
- Todos os campos opcionais — uma página pode mandar só `{ route: 'bankroll' }` se não tiver mais nada.
- O `buildPageContextSection` ganha 5 `case`s novos; o `switch` continua exhaustivo (`tsc` força).
- O frontend instrumenta as 5 páginas via o hook/helper do RF-04. Páginas que ainda não têm o `coachType` chat embedded só montam o page context quando o usuário abre o chat (`/coach-ai` ou `MiniChat`) — o page context flui pelo `body` do POST.
- **Não-objetivo:** instrumentar **toda** rota do app. Só essas 5 (+ as 4 que já estavam no schema). Outras rotas (`/grind`, `/calendar`, `/admin/*`, etc.) ficam para sprints futuros se houver demanda.

**Critério de aceitação:**
- [ ] `pageContextSchema` (discriminated union) tem **9 variantes**: as 5 originais (`grade-planner`, `grind-live`, `dashboard`, `coach-ai`, `cooldown-log`) + as 4 novas (`bankroll`, `estudos`, `stats`, `biblioteca`, `upload`) — **wait, são 5 novas**: total **10 variantes** (5 originais + 5 novas). [Nota para o test-writer: 5 + 5 = 10; o `cooldown-log` é uma das 5 "originais" — confirmar contando no schema atual.]
- [ ] Cada nova variante é `.strict()` — campo extra → `safeParse` falha → `sanitizePageContext` retorna `null` → `400 validation_failed`.
- [ ] `buildPageContextSection({ route: 'bankroll', walletsCount: 3, activeTab: 'movimentacoes' })` retorna um texto começando com `## Contexto da pagina atual` + `Rota: bankroll` + as linhas dos campos presentes. Idem para `estudos`, `stats`, `biblioteca`, `upload`.
- [ ] Campo de string acima do limite (ex: `courseSlug` com 200 chars) → `safeParse` falha → `null` → `400`.
- [ ] As 5 páginas frontend (`/bankroll`, `/estudos`, `/stats`, `/biblioteca`, `/upload`) — quando o usuário abre o chat estando nelas — incluem o `pageContext` correto no body do POST `/api/coach/chat`. (Test-writer: testar o hook/helper que monta o objeto, não necessariamente cada página inteira.)
- [ ] Nenhum dado sensível (saldo consolidado, valores de transação, notas, conteúdo de lesson) entra no page context — só inspeção leve (counts, IDs, abas, filtros, datas).
- [ ] `tsc` passa — o `switch` exhaustivo de `buildPageContextSection` cobre as 10 variantes.

---

### RF-06: Tier gate ajustado — gate por rate limit + tools, não mais por `coachType`
**Descrição:** Com a consolidação, não há mais 3 coaches para `canAccessCoach` gatear. A lógica de acesso ao chat passa a ser:
- **Acesso ao chat:** **todos os tiers** (`free`, `pro`, `premium`, `admin`) têm acesso ao Grindfy AI. O `403 tier_locked` por coach desaparece. (Não regride: hoje `free` já tem o coach Mental; após a consolidação `free` tem o agente único.)
- **Rate limit (inalterado):** `getRateLimitForPlan` — free 10, pro 50, premium 200, admin ∞ msg/dia (rolling 24h). O `429 rate_limited` continua igual. Headers `X-RateLimit-*` inalterados.
- **Tools (inalterado):** `exportToolsForAnthropic(tier)` — `free` → `[]` (sem tools); Pro+ → todas as 17 tools filtradas por `gateByTier: ['pro', 'premium', 'admin']`. Mantido. **Decisão (Q5 do founder, contexto):** o gate de tier sobre o agente passa a ser "free = chat com contexto completo mas sem tools de detalhe + rate limit baixo; Pro+ = chat + tools + rate limit maior; premium = rate limit maior ainda". **Não** gatear partes do contexto por tier (o contexto é texto já carregado — gatear seções por tier seria complexidade sem ganho). Relatórios automáticos (Daily/Weekly/Monthly) sendo Pro+ é Fase 1 — não entra aqui.
- **`canAccessCoach` / `getUpgradeTarget` / `getAccessibleCoaches`:** essas funções perdem o sentido com 3 → 1 agente. Decisão: o system-architect escolhe entre (a) deletá-las e remover a chamada de `403 tier_locked` do route handler, ou (b) mantê-las retornando "tudo liberado" (`canAccessCoach` sempre `true`) por um sprint de transição (caso algum outro código as use). Recomendação: **remover a checagem de `canAccessCoach` do `handleCoachChat`** (não há mais coach pra bloquear) e marcar as funções `@deprecated` (ou deletá-las se grep confirmar que só o route as usa). O `getUpgradeTarget` pode ser útil ainda para o `429` (upgrade pra subir o rate limit) — manter ou simplificar.
- **`coachAccess.ts` `CoachType` / `COACH_ACCESS`:** o `CoachType` type-alias pode ficar (back-compat — `coachType` ainda existe no body); o `COACH_ACCESS` map pode ficar ou virar trivial. System-architect decide.
- **`UpgradeCoachModal.tsx` (frontend):** o modal de "faça upgrade pra desbloquear este coach" perde o uso de "coach bloqueado" (não há mais). Decisão: ele pode (a) ser removido / esvaziado, ou (b) ser repropósito para "faça upgrade pra desbloquear as ferramentas do Grindfy AI" (mais msg/dia + tools). Recomendação: **repropósito leve** — mostrar quando `free` esbarra no rate limit ou quando o agente menciona uma tool que `free` não tem. O texto muda de "coach X bloqueado" → "ferramentas avançadas / mais mensagens disponíveis no Pro". System-architect/test-writer decide o escopo exato; o critério mínimo é: **nenhum fluxo do frontend mostra mais "coach Mental/Técnico/de Torneios bloqueado"**.

**Tabela final (tier → acesso):**

| Tier | Acesso ao chat (Grindfy AI) | Tools | Rate limit (msg/24h) | Relatórios automáticos |
|---|---|---|---|---|
| `free` | Sim — contexto completo | **Não** (`exportToolsForAnthropic('free') === []`) | 10 | Não (Fase 1; e mesmo lá, só Pro+) |
| `pro` | Sim — contexto completo | Sim — 17 tools (`gateByTier` Pro+) | 50 | (Fase 1 — Pro+) |
| `premium` | Sim — contexto completo | Sim — 17 tools | 200 | (Fase 1 — Pro+) |
| `admin` | Sim — contexto completo | Sim — 17 tools (admin recebe tudo) | ∞ | (Fase 1) |

**Critério de aceitação:**
- [ ] `handleCoachChat` **não** retorna mais `403 tier_locked` para nenhum `coachType` — todo usuário autenticado de qualquer tier passa pela checagem de acesso (só esbarra em `429` se exceder o rate limit).
- [ ] `getRateLimitForPlan` continua retornando 10/50/200/∞ — inalterado; `429 rate_limited` com headers `X-RateLimit-*` inalterado.
- [ ] `exportToolsForAnthropic('free') === []` (inalterado); `exportToolsForAnthropic('pro')` / `'premium'` / `'admin'` incluem as 17 tools (inalterado).
- [ ] `canAccessCoach` (se mantida) retorna `true` para qualquer `(tier, coachType)` válido; OU foi removida e o route não a chama mais.
- [ ] Nenhum fluxo do frontend mostra "coach X bloqueado por tier" — `UpgradeCoachModal` (se mantido) só fala de tools/rate limit.
- [ ] Regressão: testes que esperavam `403 tier_locked` para `free` chamando coach `technical` (ou `pro` chamando `technical`) são atualizados pelo test-writer — agora esses requests retornam `200` (ou `429` se rate-limited); mudança intencional, não regressão silenciosa.

---

### RF-07: Página `/coach-ai` vira o "hub do Grindfy AI" — chat unificado + esqueleto de timeline + audit + preferences
**Descrição:** Reformar `client/src/pages/CoachAI.tsx` (e `MiniChat.tsx` no que se aplica) para refletir a consolidação e preparar o layout do hub. **Não** implementar features que ainda não existem (timeline de relatórios — não há relatórios; nudges proativos no hub — Fase 1) — só **estruturar o esqueleto/layout** para que a Fase 1 encaixe sem refatorar.

Partes:

1. **Chat unificado (substitui as 3 abas de coach):**
   - As 3 abas seletoras (Mental / Torneios / Técnico) **deixam de ser "qual coach"** — o agente é único. Decisão de UX (system-architect/strategist refina): (a) remover as abas e ter um chat só, com **quick suggestions / chips** contextuais ("Analisar meu ROI por site", "Quais meus leaks?", "Simular: perder 10 buy-ins", "Sugerir grade da semana") — anti-blank-page (C7 do plano, embriãozinho — a versão completa é Fase 1); ou (b) manter 3 chips de "lente" (Mental / Selection / Técnico) que só ajustam o `coachType` enviado (= lente inicial, RF-03) — visualmente mais leve que abas, sem prometer "coaches separados". Recomendação: **(b) com tom de "lente/foco", não "coach"** — 3 chips pequenos "Foco: Mental | Seleção | Técnico" que setam o `coachType`; o título da página vira "Grindfy AI" (não "Coach Mental"). Não regride a capacidade de "começar focado em X". O `coachType` pode (opcionalmente) ser URL-persisted via um hook estilo `useTabFromUrl(['mental','tournament','technical'], 'technical')` — recomendado mas não obrigatório neste sprint (pode ser followup).
   - Empty state e placeholder do textarea passam a falar do "Grindfy AI" (não "Coach Mental/Técnico/de Torneios").
   - `pageContext` do RF-04: a página `/coach-ai` monta `{ route: 'coach-ai', activeCoachType: <coachType> }` e o `MiniChat` (montado em outras páginas) monta o page context da rota onde está. Isso já é o RF-04/RF-05 — aqui só garantir o wiring.

2. **Esqueleto de timeline de relatórios/nudges (placeholder — NÃO funcional):**
   - Adicionar uma área/aba/painel no hub `/coach-ai` rotulada "Relatórios e avisos" (ou similar) que **hoje** mostra um estado vazio explicativo: "Os relatórios automáticos do Grindfy AI (semanal, mensal) vêm em breve." — sem fetch de nada (não há endpoint de relatórios). É só um `EmptyState` com o layout/posição certo, para a Fase 1 (AI-1B) plugar `GET /api/coach/reports` (futuro) sem mexer no layout do hub.
   - Decisão de onde encaixar: o hub `/coach-ai` pode virar um layout com tabs (estilo `/coach`): `Chat` (default) | `Relatórios e avisos` (esqueleto) | `Histórico de ações` (audit — ver item 3) | `Preferências` (ver item 4). System-architect decide se vira tabs URL-persisted (como `/coach` — reusa `useTabFromUrl`) ou um layout de painel lateral. Recomendação: **tabs URL-persisted** (`?tab=chat|reports|audit|prefs`, default `chat`) — consistente com `/coach` (ADR-125) e com o "hub" mental model. Lesson #29/#30 aplicáveis se houver hooks/queries em sub-componentes.

3. **Audit (`/api/coach/audit` — já existe):**
   - O endpoint `GET /api/coach/audit` (lista cronológica de `coach_actions`), `POST /api/coach/audit/:id/dismiss`, `POST /api/coach/audit/export` (JSON) já existem (Sprint Coach-0). Hoje há uma página `/settings/coach-actions` que os consome (verificar — pode estar em `client/src/pages/settings/...`). **Mudança:** trazer essa visão para o hub `/coach-ai` (aba "Histórico de ações") — pode ser **reusar o componente existente** da página de settings (não duplicar). A página `/settings/coach-actions` pode continuar existindo (link redundante) ou virar um redirect — decisão de baixo risco do system-architect; o critério mínimo é: **o hub `/coach-ai` tem uma aba/seção que mostra o audit de ações do Coach** (reusando o componente que já existe).

4. **Preferences de nudge (`/api/coach/preferences` — já existe):**
   - `GET /api/coach/preferences` retorna `{ nudges: { bSnapshot, bLeak, bStudy, bVolume, bGrade, bDownswing, bLife, bMental }, quietHours..., caps... }`; `PUT /api/coach/preferences` salva. Já existem (Sprint Coach-0). Hoje há (provavelmente) UI em settings — verificar. **Mudança:** trazer a UI de toggles + quiet hours + caps para o hub `/coach-ai` (aba "Preferências") — reusar o componente existente se houver, ou criar um simples (8 switches + 2 time inputs + 2 number inputs) que faz `useQuery` no GET e `useMutation` no PUT. O critério mínimo: **o hub `/coach-ai` tem uma aba/seção que mostra e edita as preferências de nudge** (mesmo que a maioria dos nudges ainda não tenha cron — eles vêm na Fase 1; os toggles já existem na infra).

5. **`MiniChat.tsx`:** ajustar para o agente único também (título, 3 chips de lente em vez de 3 coaches, page context da rota onde está montado). Não vira um hub — é só o chat compacto.

**Não-objetivos do RF-07:**
- Implementar a timeline de relatórios funcionalmente (não há relatórios — Fase 1 AI-1B).
- Implementar nudges proativos no hub (Fase 1).
- Implementar onboarding/diagnóstico conversacional no hub (Fase 1).
- Quick suggestions contextuais completas (a versão rica — que muda por página/estado — é Fase 1; aqui no máximo um conjuntinho fixo de chips de exemplo, opcional).
- Mexer na página `/coach` (GradePlanner) — essa é outra página, fora do escopo.

**Critério de aceitação:**
- [ ] `/coach-ai` mostra "Grindfy AI" (não "Coach Mental/Técnico/de Torneios") como título/identidade da página.
- [ ] As 3 abas seletoras de coach foram substituídas por chips de "lente/foco" (Mental/Seleção/Técnico) que setam o `coachType` enviado ao `/api/coach/chat` — ou removidas (decisão do system-architect); em nenhum caso a UI promete "3 coaches separados".
- [ ] O hub `/coach-ai` tem (pelo menos) 4 seções/abas acessíveis: Chat (default), Relatórios e avisos (esqueleto/EmptyState — não funcional), Histórico de ações (consome `GET /api/coach/audit`), Preferências (consome `GET`/`PUT /api/coach/preferences`).
- [ ] A aba "Relatórios e avisos" mostra um EmptyState explicativo — **não** faz fetch de endpoint inexistente; não quebra.
- [ ] A aba "Histórico de ações" lista os `coach_actions` do usuário (reusando o componente que já existe — não duplica a lógica de audit).
- [ ] A aba "Preferências" mostra os 8 toggles de nudge + quiet hours + caps, com GET inicial e PUT no save.
- [ ] `pageContext` é enviado no body do POST `/api/coach/chat` a partir de `/coach-ai` (`{ route: 'coach-ai', activeCoachType }`) e a partir do `MiniChat` (page context da rota onde está montado, se instrumentada).
- [ ] `MiniChat.tsx` não promete "3 coaches" — usa o conceito de lente/foco e o agente único.
- [ ] Empty state e placeholder do textarea de `/coach-ai` e `MiniChat` falam do "Grindfy AI", não dos 3 coaches.
- [ ] Regressão: testes existentes de `CoachAI.tsx` (`auto-scroll`, `delete-confirm`, `prompt-starters`, `session-search`, `skeletons`) são atualizados pelo test-writer onde dependiam das 3 abas de coach — mudança intencional. Lessons #27 (Radix Tabs reage a `onMouseDown`), #28 (`vi.mock` por path), #29 (`useQuery` sem provider → ErrorBoundary), #30 (hook test jsdom) aplicáveis se houver novas tabs/hooks.

---

### RF-08: Atualizar documentação (`Docs/api/coach.md`, `Docs/architecture/ai-coach/`, `Docs/api/coach-tools.md`)
**Descrição:** Atualizar a doc para refletir o agente único:
- `Docs/api/coach.md`: o `/api/coach/chat` agora é "Grindfy AI" (um agente); `coachType` é "lente inicial" (back-compat), não seletor de coach; `pageContext` agora **funciona de fato** e tem **10 variantes** (listar todas, com os campos); o tier gate é só rate limit + tools (sem `403 tier_locked`); rate limits inalterados.
- `Docs/architecture/ai-coach/`: atualizar os diagramas/docs que falam de "3 coaches" / "persona tiered como gate por coach" — agora é 1 agente, contexto completo, lente inicial.
- `Docs/api/coach-tools.md`: nenhuma mudança de tools neste sprint (já corrigido no AI-0A) — só, se mencionar "Coach Mental/Técnico/de Torneios", trocar por "Grindfy AI".
- Adicionar uma nota em `Docs/architecture/lessons-learned.md` se algum padrão novo emergir (page context plugado de fato; consolidação de prompt sem quebrar cache descuidadamente).

**Critério de aceitação:**
- [ ] `Docs/api/coach.md` descreve o agente único, `coachType` como lente, page context com 10 variantes (campos), tier gate só rate limit + tools.
- [ ] Não há mais referência a "Coach Mental / Coach Técnico / Coach de Torneios" como agentes separados na doc de API/arquitetura do coach.
- [ ] Os diagramas em `Docs/architecture/ai-coach/` que mostravam 3 coaches são atualizados ou marcados como superseded (system-architect decide o nível de detalhe).

---

## Requisitos Não-Funcionais
- **Cache da Anthropic (lesson #10, ADR-019, ADR-147 §3):** a consolidação do base prompt quebra o cache key do bloco STATIC **uma vez** quando este sprint for pra produção (próxima conversa de cada usuário paga um cache miss). **Aceitável** — quebra única, planejada, e o RF-01 obriga a mudar o base de qualquer jeito. **Inviolável:** uma fonte única de prompt (sem cópia paralela / variante backticked); o bloco STATIC continua array com `cache_control: ephemeral`; o `coachType` muda **apenas** uma linha de lente inicial (de preferência no DYNAMIC, fora do cache).
- **Anti prompt-injection (ADR-025):** as 5 novas variantes de `pageContextSchema` são `.strict()`, com max-length, enums fechados, ranges plausíveis; o scrubbing de tokens (`scrubInjectionTokens`) roda antes da injeção (já embutido em `sanitizePageContext`). Nenhum dado sensível (saldos, valores, notas, conteúdo de lesson) entra no page context.
- **Zero migração de schema:** `coach_conversations.coach_type` e `chat_sessions.coach_type` permanecem. `coach_actions`, `coach_preferences`, `user_ai_profile`, `monthly_coach_summaries` — inalterados. Nenhuma tabela nova (`reports`/`report_jobs` são Fase 1).
- **Não regredir acesso ao chat:** quem tem acesso ao chat hoje (todos os tiers — `free` ao coach Mental, Pro+ a mais) continua tendo — após a consolidação todos têm o agente único. `free` continua sem tools. Rate limits inalterados.
- **Custo Anthropic:** o bloco STATIC unificado pode ficar um pouco maior que cada base individual (cobre mais áreas) mas substitui 3 → 1, e o contexto dinâmico passa a incluir weekly plan + study progress sempre (antes era 1 dos 2 por coach) — variação pequena de tokens, dentro do orçamento. O contexto **não** ganha dados novos volumosos (FT analytics detalhado, ROI por dimensão pré-computado — esses ficam nas tools). Sem novas chamadas ao modelo. Custo esperado: estável ou levemente menor (menos prompts pra cachear).
- **Page context é inspeção leve, não dump de dados:** o agente vê "onde o usuário está e o que está olhando" — para os números, chama as tools (já religadas no AI-0A). Isso mantém o page context pequeno (não estoura token budget) e seguro (não expõe número via canal controlável pelo cliente).
- **Limite de 5 tool calls/turn (ADR-026):** mantido, não mexer.
- **Segundo turn conversacional do LLM com `tool_result`:** continua sendo **pendência conhecida** — o `/api/coach/chat` ainda não re-invoca o modelo com o `tool_result` após a tool executar. **Não** implementar neste sprint. Documentar como pendência (provavelmente AI-1B). Test-writer/implementer não tocam nisso.
- **Zero regressão** nos ~8500 testes existentes, **exceto** (mudanças intencionais):
  - `tests/coach/citations/system-prompt-snapshot.test.ts` (ou equivalente) — snapshot do prompt muda (base unificado).
  - Testes de `getMentalPrompt` / `getTournamentPrompt` / `getTechnicalPrompt` — removidos/atualizados (as funções saem).
  - Testes de `buildStaticSystemBlock` / `buildDynamicSystemBlock` / `assembleContext` que dependiam do gate por `coachType` — atualizados.
  - Testes de `handleCoachChat` que esperavam `403 tier_locked` por coach — atualizados (agora `200`/`429`).
  - Testes de `CoachAI.tsx` que dependiam das 3 abas de coach — atualizados.
  - Possíveis ajustes em `Docs/api/coach.md` / `Docs/api/coach-tools.md` (doc, não teste).

---

## Endpoints Previstos
**Nenhum endpoint novo.** Todos os endpoints relevantes já existem; alguns mudam de comportamento (page context passa a ser lido; `403 tier_locked` por coach some):

| Método | Rota | Mudança neste sprint | Auth |
|---|---|---|---|
| POST | /api/coach/chat | Lê `req.body.pageContext` (era ignorado); agente único (não 3 coaches); sem `403 tier_locked` por coach; `coachType` = lente inicial | JWT |
| GET | /api/coach/sessions | Inalterado (`coachType` ainda parametriza listagem — back-compat) | JWT |
| GET | /api/coach/audit | Inalterado — consumido também pela aba "Histórico de ações" do hub `/coach-ai` | JWT |
| POST | /api/coach/audit/:id/dismiss | Inalterado | JWT |
| POST | /api/coach/audit/export | Inalterado | JWT |
| GET | /api/coach/preferences | Inalterado — consumido também pela aba "Preferências" do hub `/coach-ai` | JWT |
| PUT | /api/coach/preferences | Inalterado — usado pela aba "Preferências" do hub | JWT |
| GET | /api/coach/profile | Inalterado | JWT |
| PUT | /api/coach/profile | Inalterado | JWT |
| GET | /api/coach/monthly-summaries | Inalterado (`coachType` ainda parametriza — back-compat) | JWT |
| POST | /api/coach/actions/:id/{confirm,cancel,undo} | Inalterado (write tools — AI-0A) | JWT |
| GET | /api/coach/actions/:id | Inalterado | JWT |

**Endpoints futuros (NÃO neste sprint — só anotados para o esqueleto da timeline):** `GET /api/coach/reports`, `GET /api/coach/reports/:id` (Fase 1 AI-1B). A aba "Relatórios e avisos" do hub mostra um EmptyState até esses existirem.

---

## Modelos de Dados Afetados
**Nenhuma alteração de schema.** Confirmado:
- `coach_conversations` / `chat_sessions` — `coach_type` permanece (back-compat, lente inicial). Sem migração.
- `coach_actions`, `coach_preferences`, `user_ai_profile`, `monthly_coach_summaries`, `coach_leak_focus` — inalterados.
- Nenhuma tabela nova (`reports` / `report_jobs` são Fase 1).
- `pageContextSchema` (Zod, runtime, não tabela) ganha 5 variantes — mudança de código, não de schema de banco.

---

## Integrações Externas
| Serviço | Propósito | Mudança |
|---|---|---|
| Anthropic API (Claude Sonnet 4.6, via `COACH_CHAT_MODEL`) | Chat do Grindfy AI — system prompt unificado + contexto completo + page context + 17 tools (Pro+) | Cache key do bloco STATIC quebra uma vez (planejado). Nenhuma chamada nova. |
| Anthropic API (Claude Haiku 4.5, via `COACH_MEMORY_MODEL`) | Sumarização de memória / auto-título | Inalterado |
| xAI Agent Tools API | News feed | Inalterado — fora do escopo deste sprint |

---

## Cenários de Teste Derivados

### Happy Path
- [ ] Usuário Pro abre `/coach-ai`, manda "olha meu ROI por site e me diz se tenho leaks" → o Grindfy AI (agente único) responde com ROI por site (chamando `query_dimension`) **e** leaks (chamando `find_top_leaks`) **na mesma conversa**, com citações inline — sem o usuário ter escolhido "qual coach".
- [ ] Mesma conversa, próxima mensagem: "e como tá meu mental? to tiltando muito" → o agente responde olhando break feedbacks (que já estão no contexto dinâmico) — **mesmo agente, mesma sessão** — sem trocar de coach.
- [ ] Usuário Pro abre o chat estando em `/bankroll` com a wallet X selecionada → o `pageContext` `{ route: 'bankroll', walletsCount: 3, selectedWalletId: 'X', activeTab: 'movimentacoes' }` chega ao agente; o agente menciona "vi que você está olhando suas wallets" e oferece `read_user_bankroll_history` / `simulate_bankroll_scenario`.
- [ ] Usuário abre o chat em `/upload` 8 dias após o último import → `pageContext` `{ route: 'upload', lastImportNetwork: 'WPN', daysSinceLastImport: 8, ... }`; o agente comenta no chat "vi que faz 8 dias desde seu último import (WPN) — quer registrar as sessões que faltam?".
- [ ] Usuário `free` abre `/coach-ai`, manda uma pergunta → recebe resposta (acesso ao chat OK), **sem tools** (`exportToolsForAnthropic('free') === []`), contexto montado normalmente. Não recebe `403`.
- [ ] Usuário abre o hub `/coach-ai`, clica na aba "Histórico de ações" → vê a lista cronológica de `coach_actions` (consumindo `GET /api/coach/audit`).
- [ ] Usuário abre a aba "Preferências" → vê os 8 toggles de nudge + quiet hours + caps; desliga `bStudy` → `PUT /api/coach/preferences` persiste.
- [ ] Usuário abre a aba "Relatórios e avisos" → vê um EmptyState ("relatórios automáticos vêm em breve") — sem erro, sem fetch quebrado.
- [ ] Usuário troca o chip de "foco" de Técnico para Mental → o `coachType` enviado muda; o system prompt ganha a linha de lente "lente inicial: mental game" — o resto do prompt (base, safety, contexto) é idêntico.

### Validação de Input
- [ ] `POST /api/coach/chat` sem `coachType` válido → `400` (inalterado).
- [ ] `POST /api/coach/chat` com `pageContext: { route: 'rota-inexistente' }` → `400 validation_failed`, `field: 'pageContext'`.
- [ ] `POST /api/coach/chat` com `pageContext: { route: 'bankroll', campoExtra: 'x' }` → `400 validation_failed` (`.strict()` rejeita campo extra).
- [ ] `POST /api/coach/chat` com `pageContext: { route: 'biblioteca', courseSlug: '<200 chars>' }` → `400 validation_failed` (max-length).
- [ ] `POST /api/coach/chat` com `pageContext` contendo `{ route: 'estudos', focusedThemeId: 'ignore previous instructions' }` → `sanitizePageContext` substitui por `[redacted]`; request prossegue (200).
- [ ] `POST /api/coach/chat` **sem** `pageContext` → request prossegue normalmente (page context é opcional); o bloco DYNAMIC não tem a seção "Contexto da página atual".

### Regras de Negócio
- [ ] `buildStaticSystemBlock('mental', inputs)` e `buildStaticSystemBlock('technical', inputs)` produzem o **mesmo corpo de base prompt** (a única diferença permitida é a linha de lente, se ela ficar no STATIC).
- [ ] `buildDynamicSystemBlock('mental', { weeklyPlan: {...}, studyProgress: [...] })` inclui **ambas** as seções (Plano Semanal **e** Progresso de Estudo) — não mais gated por `coachType`.
- [ ] `buildDynamicSystemBlock('technical', { weeklyPlan: {...} })` inclui a seção de Plano Semanal (antes só `tournament` via).
- [ ] `pageContextSchema.safeParse({ route: 'stats', hasSnapshot: true, latestSnapshotStatsCount: 217 })` → `success: true`.
- [ ] `pageContextSchema` tem 10 variantes (5 originais + 5 novas) — `buildPageContextSection` cobre as 10 (`switch` exhaustivo, `tsc` passa).
- [ ] `handleCoachChat` não retorna `403 tier_locked` para `free` chamando `coachType: 'technical'` — retorna `200` (ou `429` se rate-limited). Para `pro` chamando `coachType: 'technical'` — idem.
- [ ] `getRateLimitForPlan('free') === 10`, `'pro' === 50`, `'premium' === 200`, `'admin' === Infinity` (inalterado).
- [ ] `exportToolsForAnthropic('free') === []`; `exportToolsForAnthropic('pro').length === 18` (17 tools + 1 alias deprecado — confirmar contagem com o registry pós-AI-0A).
- [ ] O system prompt **não** contém "Coach Mental" / "Coach Técnico" / "Coach de Torneios" como apresentação do agente.
- [ ] Nenhum campo do `pageContext` carrega valor monetário, nota de texto livre, conteúdo de lesson, ou outro dado sensível — só counts/IDs/abas/filtros/datas.

### Edge Cases
- [ ] `assembleContext` chamado sem o loader `getPageContext` (caller legado) → `pageContext` vira `undefined` → bloco DYNAMIC sem a seção; sem throw (graceful — comportamento já existente, não regredir).
- [ ] `buildSystemArray` com `COACH_PROMPT_CACHE_ENABLED=false` → retorna string concatenada (STATIC + DYNAMIC) sem `cache_control` (fallback legacy inalterado).
- [ ] `useCoachChat` chamado sem `pageContext` (caller que não instrumentou a página) → body do POST não tem `pageContext`; comportamento idêntico ao de hoje.
- [ ] `MiniChat` montado numa rota **não** instrumentada (ex: `/calendar`) → não monta `pageContext`; o chat funciona normalmente.
- [ ] Aba "Relatórios e avisos" do hub renderizada sem nenhum endpoint de relatório existindo → EmptyState, sem `useQuery` quebrado, sem erro de console.
- [ ] Aba "Histórico de ações" / "Preferências" renderizadas standalone num teste sem `QueryClientProvider` → o componente que faz `useQuery` é isolado via ErrorBoundary local (lesson #29) ou o teste provê o provider; não dá "No QueryClient set" hard error num teste de layout do hub.
- [ ] Radix Tabs do hub `/coach-ai`: `fireEvent.click(tabTrigger)` num teste RTL não alterna o conteúdo a menos que o `<TabsTrigger>` tenha `onClick` redundante (componente controlado) — lesson #27; o test-writer/implementer trata.
- [ ] Hook `useCoachPageContext` (se criado) testado em `.test.ts` que usa `renderHook` → precisa rodar em jsdom (config-level: incluir no projeto `client`) — lesson #30.
- [ ] `coachType` URL-persisted (se implementado): refresh F5 / bookmark `/coach-ai?focus=mental` mantém a lente; `?focus=invalido` cai no default e limpa o param (estilo `useTabFromUrl`).
- [ ] Cleanup do dead-code de `coachContext.ts` (se feito): nenhum teste existente importava/dependia do array `systemParts`; o `system` final continua vindo de `buildSystemArray`.
- [ ] Mock de SDK Anthropic em testes de chat: `new Anthropic(...)` em try/catch com fallback (lesson #5 / #35) — não regredir ao mexer no route handler.

---

## Fora de Escopo (não-objetivos explícitos)
- **Relatórios automáticos** (Daily Debrief, Weekly Report, Monthly Report, Quarterly Review) e suas tabelas (`reports` / `report_jobs`) e job runner timezone-aware — **Fase 1 (AI-1B / AI-1C)**. Este sprint só prepara o **esqueleto/EmptyState** da aba "Relatórios e avisos" no hub.
- **Onboarding / diagnóstico inicial conversacional** (perfil de jogador, metas, tom, opt-in de nudges via conversa) e banner persistente até completar — **Fase 1 (AI-1A)**.
- **Anti-fadiga completo** (snooze + telemetria + kill switch + re-onboarding leve) e **nudges novos** (B-IMPORT cobrança de import, B-DOWNSWING, B-VOLUME, B-GRADE com cron) — **Fase 1**. (A infra de `nudgeEngine` + os 8 toggles em `coach_preferences` já existem; este sprint só **expõe os toggles** no hub.)
- **Memória estruturada** (`userAiProfile` ganhar campos `{nivel, metas, focoDoMes, tomPreferido, padroesConhecidos}`) e **system prompt enriquecido** com esses campos + pool intelligence BR — **Fase 1 (AI-1A)**. Este sprint mantém o `userAiProfile` como prosa livre no STATIC (inalterado).
- **Detecção de nível automática** (heurística volume + ROI + idade + plano) — **Fase 1 (AI-1A)**.
- **Novas tools** (`bulk_propose_grade`, `schedule_study_block`, `create_study_theme`, `define_career_goal`, `analyze_variance`, `diagnose_plateau`, `compute_grind_study_ratio`, `calculate_effective_rake`, `query_pool_intelligence`, tool bridge OCR, etc.) — **Fase 2 (AI-2A/2B)**. As 17 tools do AI-0A são o conjunto deste sprint.
- **Quick suggestions contextuais ricas** (que mudam por página/estado, anti-blank-page completo) — **Fase 1**. Este sprint no máximo um conjuntinho fixo de chips de exemplo no hub (opcional, não obrigatório).
- **Aposentar os 2 crons de segunda** (coach recommendation 6h BRT + weekly study plan 9h UTC → absorver no Weekly Report) — **Fase 1 (AI-1B)**. Inalterados neste sprint.
- **Segundo turn conversacional do LLM com `tool_result`** (re-invocar o modelo após a tool executar, mandando o resultado de volta) — pendência conhecida; **não** implementar neste sprint. Documentar como tal (provavelmente AI-1B).
- **Adicionar coluna `confirmation_level` a `coach_actions`** — vetado na v1 (ADR-146). Inalterado.
- **`delete_*` tools / auto-aprovação de write tools** — vetados na v1 (ADR-146). Inalterado.
- **Instrumentar page context em toda rota do app** — só as 5 novas (`/bankroll`, `/estudos`, `/stats`, `/biblioteca`, `/upload`) + as 4-5 que já estavam no schema. Outras rotas ficam para o futuro.
- **Mexer na página `/coach` (GradePlanner)** — é outra página (hub de planejamento, ADR-125). Fora do escopo. (Confusão comum: ADR-125 reformou `/coach`, não `/coach-ai`.)
- **MSW para testes de integração do Coach** (CSRF, refresh, 401) — pendência conhecida (lesson testing), fora deste sprint.
- **Auditar / mexer no `xSearchProvider` do News** — feito/auditado no AI-0A; fora daqui.

---

## Dependências
- **Sprint AI-0A** (já mergeado): 17 tools religadas no registry, citations/confidence reforçados com fonte única (`coachSafetyPrompts.ts`), ADR-145/146/147, `xSearchProvider` auditado. Este sprint **assume** que as tools funcionam e que o bloco STATIC já tem `CITATIONS_RULES` + `CONFIDENCE_RULES` de fonte única — não os re-trabalha (só remove menções a "Coach Mental/Técnico/de Torneios" nos exemplos few-shot, se houver).
- **ADR-019** (prompt cache 2 blocos) — pré-condição; este sprint preserva a estrutura, só muda o conteúdo do STATIC.
- **ADR-025** (page context Zod whitelist) — pré-condição; este sprint pluga de fato + estende.
- Infra existente reusada: `coachSystemBuilder.ts`, `coachContext.ts`, `coachPageContext.ts`, `coachAccess.ts`, `coachSafetyPrompts.ts`, `routes/coach.ts`, `useCoachChat.ts`, `CoachAI.tsx`, `MiniChat.tsx`, `useTabFromUrl.ts` (reuso para tabs do hub e `coachType` URL-persisted opcional), endpoints `/api/coach/audit` + `/api/coach/preferences` + componentes de settings que os consomem (reuso).

---

## Notas de Implementação (sugestões — system-architect refina, test-writer escreve testes, implementer executa)
- **Consolidação do prompt — fazer de uma vez (lesson #10):** mudar o base prompt + remover os 3 base prompts + remover `getMentalPrompt`/etc num único PR. Uma quebra de cache, não três. Manter `CITATIONS_RULES`/`CONFIDENCE_RULES`/`SAFETY_RULES`/`SAFETY_RULES_COMPETITOR_BLOCK` exatamente como o AI-0A deixou (fonte única em `coachSafetyPrompts.ts`) — só ajustar exemplos few-shot que citem "Coach Mental/Técnico/de Torneios".
- **`coachType` lente no DYNAMIC, não STATIC (preferência):** colocar a linha "lente inicial: X" no bloco DYNAMIC evita 3 variantes de cache key do STATIC. Se o system-architect preferir no STATIC, documentar o trade-off no ADR.
- **Dead-code de `coachContext.ts`:** o array `systemParts` + as ~8 queries inline (linhas ~97-194) são dead-code documentado; remover neste sprint (estamos no arquivo). Verificar com grep que nenhum teste depende disso. Se a remoção parecer arriscada demais, deixar com TODO atualizado — mas a recomendação é remover.
- **`buildMentalContext` / `buildTournamentContext` / `buildTechnicalContext`:** grep por usos fora de `routes/coach.ts`. Se só o route usa → deletar (o route não precisa mais carregar contexto específico por coach; o `buildSystemArray` recebe os dados via os loaders genéricos). Se há outros usos → `@deprecated`.
- **Page context — hook leve no frontend:** criar `client/src/hooks/useCoachPageContext.ts` (ou um helper) que cada página chama com os campos relevantes e que monta `{ route, ...fields }` conforme o schema; o `useCoachChat` aceita o objeto e o inclui no body. Reusa o padrão de ler estado da página (Wouter `useLocation`, query params, props). Adicionar uma rota nova = uma chamada do hook + uma variante no schema + um `case` no formatter.
- **`pageContext` opcional no body:** não mandar `pageContext: undefined` explícito (alguns parsers reclamam) — só incluir a chave quando há valor. Ou garantir que o handler trate `undefined` como ausente.
- **Hub `/coach-ai` com tabs URL-persisted:** reusar `useTabFromUrl(['chat','reports','audit','prefs'], 'chat')` — consistente com `/coach` (ADR-125). Lessons #27 (`onClick` redundante em `<TabsTrigger>` controlado), #28 (`vi.mock` por path — criar re-export shim se um teste mockar um componente em path diferente), #29 (`useQuery` sem provider → ErrorBoundary local), #30 (hook test jsdom — config-level) aplicáveis.
- **Reusar componentes de audit/preferences:** não duplicar a lógica de `/api/coach/audit` / `/api/coach/preferences` — importar o componente que a página de settings já usa (verificar onde está; provavelmente `client/src/pages/settings/...` ou `client/src/components/coach/...`). Se não houver um componente reusável claro, extrair um.
- **`apiRequest` vs `fetch` (lesson #13):** se algum componente novo do hub usar `apiRequest`, lembrar que ele retorna o JSON parseado, não um `Response`. Mocks em testes precisam retornar o JSON.
- **`vi.fn()` não é constructor (lesson #5/#35):** o `/api/coach/chat` já tem o `new Anthropic(...)` em try/catch — não regredir ao mexer no route.
- **Branch:** trabalhar em `feature/sprint-ai-0b` (lesson #24 — `git status` periódico; auto-mode pode trocar branch silenciosamente).
- **Doc (`Docs/api/coach.md`, `Docs/architecture/ai-coach/`, `coach-tools.md`):** atualizar junto com o sprint (RF-08).

---

## Sugestão de ADRs a criar (para o system-architect)
1. **ADR — "Consolidação Grindfy AI: agente único com lente inicial (supersedes a separação de personas Mental/Tournament/Technical)":** registrar que os 3 system prompts viram 1; que o contexto dinâmico deixa de ser gated por `coachType`; que `coachType` vira "lente inicial" (back-compat, zero migração); que `getMentalPrompt`/`getTournamentPrompt`/`getTechnicalPrompt` são removidos; que `canAccessCoach`/`COACH_ACCESS` perdem o sentido como gate por coach (tier gate vira só rate limit + tools). **Supersedes/atualiza:** ADR-021 (gate por plano — a parte de "qual coach por tier"), e a descrição de "persona tiered" em ADR-019 e nos docs de `ai-coach/`. Documentar a quebra única de cache (aceita).
2. **ADR — "Page context plugado de fato + expandido a 10 rotas":** registrar que a infra de page context (schema + builder + sanitizer — ADR-025) passa a ser **de fato** lida no `/api/coach/chat` (era ignorada); que o frontend (via `useCoachPageContext`) passa a enviar; que 5 rotas novas (`bankroll`, `estudos`, `stats`, `biblioteca`, `upload`) ganham variantes; o princípio "page context é inspeção leve, não dump de dados — os números vêm das tools". **Estende** ADR-025.
3. **(Opcional) ADR ou nota de doc — "Hub /coach-ai: layout de tabs (chat / relatórios / audit / preferences)":** registrar a decisão de estrutura do hub e o esqueleto/EmptyState da timeline de relatórios. Se for uma decisão pequena, uma seção em `Docs/api/coach.md` basta — system-architect decide se vale um ADR.

---

## Verificação Final (checklist pm-spec)
- [x] Cada RF tem critérios de aceitação verificáveis.
- [x] Cenários de teste cobrem happy path, validação de input, regras de negócio e edge cases.
- [x] Seção "Fora de Escopo" preenchida e detalhada (e os não-objetivos do roadmap — relatórios, onboarding, anti-fadiga, novas tools, memória estruturada — listados explicitamente como Fases 1/2).
- [x] Sem ambiguidade — cada regra tem uma interpretação única (base único, contexto completo, `coachType` = lente, page context plugado + 5 rotas novas com campos definidos, tier gate = rate limit + tools, hub = chat + esqueleto + audit + prefs, zero migração). Pontos onde o system-architect decide (assinatura de `getBasePrompt`; lente no STATIC vs DYNAMIC; deletar vs `@deprecated` as funções legacy; remover ou não o dead-code de `coachContext.ts`; estrutura exata do hub — tabs vs painel; repropósito vs remoção do `UpgradeCoachModal`) estão sinalizados.
- [x] Spec é independente o suficiente para o test-writer gerar testes (schemas Zod das novas variantes esboçados com campos e limites; comportamentos do builder; comportamentos do route; comportamentos do hub).
- [x] Endpoints listados (todos pré-existentes; nenhum novo; mudanças de comportamento explicitadas).
- [x] Modelos de dados: nenhuma alteração de schema; tabelas reusadas listadas; `coach_type` permanece (back-compat).
