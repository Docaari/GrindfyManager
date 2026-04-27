# ADR-042: Tool `coach.read_cooldown_history` no Tool Registry com sanitizer agregador + prompt block cacheable

## Status

Proposto

## Data

2026-04-26

> **Nota de numeracao:** A spec `cooldown-refactor-plan.md` (RF-07/RF-10) referencia este ADR como
> "ADR-030" e o ADR-041 menciona "ADR-042" como pendente. ADR-030 ja esta em uso
> (`030-warmup-telemetry-client-only-w1.md`, aceito 2026-04-25). Este ADR recebe o proximo numero
> disponivel **042** apos ADR-041 (Cooldown Sprint 1). O ADR companheiro Sprint 3 sobre o **shape do
> page context** `cooldownLog` recebe o numero seguinte (**043**), em arquivo separado, para nao
> editar `025-coach-page-context-zod-whitelist.md` (ja aceito por outro autor).

## Contexto

Sprint Cooldown-1 (ADR-041) e Sprint Cooldown-2 (ja mergeada, commit 9635530) entregaram, em
ordem:

- Tabela `cooldown_logs` 1:1 com `grind_sessions` + tabela `starred_hands` 1:N com
  `session_tournaments`.
- Endpoints CRUD de cooldown + endpoints de analytics (Sprint 2): `cooldown-compliance`,
  `starred-hands-distribution`, `cooldown-impact`, `top-lessons`.
- Storage methods que ja sustentam essas agregacoes: `getStarredHandsDistribution`,
  `getCooldownComplianceMetrics`, `getCooldownImpact`, `getTopLessons`.

O Coach AI ja tem registry de tools modular (ADR-023) com 5 tools read-only ativas
(`query_dimension`, `find_top_leaks`, `get_tournament_suggestions`, `explain_tournament_score`,
`simulate_bankroll_scenario`), wrapping de tool result em JSON estruturado `{__type:
'ToolResult', ...}` (ADR-024), page context com Zod discriminated union por route (ADR-025),
e prompt cache em 2 blocos — estatico cacheavel + dinamico (ADR-019).

Sprint Cooldown-3 expoe os dados de cool-down ao Coach. Tres pecas sao requeridas pela spec:

1. **Tool nova** `coach.read_cooldown_history` consumida pelo LLM via Tool Use API.
2. **Page context** novo para a rota futura `/grind/history/:id?tab=cooldown` — para que, quando
   o usuario perguntar ao Coach sobre o log que esta abrindo, o contexto da tela ja esteja no
   prompt sem custo de round-trip (escopo de ADR-043, esta ADR cita).
3. **Prompt block** "rituais de cool-down recentes" — agregado das ultimas 5 sessoes — entrando
   no bloco estatico cacheavel do system prompt (ADR-019).

A **pergunta central:** como integrar dados de cool-down ao Coach respeitando seguranca
(notas pessoais sao PII), economia (cache hit em ~90% dos casos), e limpeza arquitetural
(reusar registry, wrapping e cache strategy ja existentes)?

### Restricoes

- **PII em notes.** `starred_hands.notes`, `cooldown_logs.notes`, `abGameAnswers.cGame`,
  `tiltSelfAssessment.action` sao texto livre digitado pelo usuario. Expor cru viola o requisito
  nao-funcional de privacidade da spec ("notas pessoais NAO sao expostas em endpoints de
  analytics ou coach tool — apenas tokenizacao agregada para `top-lessons`").
- **Cache TTL 5min.** O bloco "rituais recentes" so faz sentido cacheado se mudar raramente
  dentro da janela. Ele muda **apenas quando** uma nova sessao com cool-down e completada — em
  sessoes ativas de chat com o coach, isso eh raro (sessoes de poker duram horas, cool-down e
  pos-sessao). Cabe perfeitamente no bloco estatico.
- **Tool registry pattern (ADR-023).** Adicionar tool nao deve refatorar registry; basta criar
  handler em `server/coachTools/handlers/readCooldownHistory.ts` + linha em `index.ts` com
  `registerTool(...)`.
- **Tool wrapping (ADR-024).** Output passa por `{__type: 'ToolResult', tool, ok, data}` antes
  de virar `tool_result.content`. Sanitizer eh pre-wrapping: aplicado dentro do handler, nao
  no wrapper.
- **Tipos no registry.** Tool inputSchema = Zod (`z.object({period: z.enum([...])})`). userId
  vem do contexto (auth), nao do input — segue padrao das tools existentes.
- **Coach 115 fails pre-existentes.** Fora de escopo. Sprint Cooldown-3 nao corrige a suite do
  Coach; apenas adiciona testes especificos da nova tool e do novo page context.

## Opcoes Consideradas

### Opcao A: Tool dedicada com sanitizer agregador + prompt block cacheable (ESCOLHIDA)

Implementar 3 pecas integradas:

1. **Handler em `server/coachTools/handlers/readCooldownHistory.ts`:**

   ```ts
   // input zod
   const inputSchema = z.object({
     period: z.enum(['7d', '30d', '90d']),
   });

   // handler
   async function handler(input: { period: '7d' | '30d' | '90d' }, ctx: { userId: string }) {
     const [compliance, distribution, lessons] = await Promise.all([
       storage.getCooldownComplianceMetrics(ctx.userId, input.period),
       storage.getStarredHandsDistribution(ctx.userId, input.period),
       storage.getTopLessons(ctx.userId, input.period, /* limit */ 10),
     ]);

     // sanitizer agregador — NAO expoe notes brutas
     return {
       totalSessions: compliance.total,
       cooldownCount: compliance.completed,
       starredHands: {
         byType: distribution.reduce((acc, row) => ({ ...acc, [row.type]: row.count }), {}),
         total: distribution.reduce((s, row) => s + row.count, 0),
       },
       recentLessons: lessons.map(l => l.token), // tokens ja agregados, sem texto livre
     };
   }
   ```

2. **Sanitizer:** agrega counts por enum (`type`, `spot`, `triggers`), expoe **tokens** de
   lessons (Sprint 2 ja faz tokenizacao em `getTopLessons` — palavras > 3 chars), **nunca**
   retorna `notes`, `cGame`, `action`, ou `notes` de starred. Resultado e Record<enum, number>
   + array de string tokens curtos.

3. **Prompt block cacheable** em `server/coachSystemBuilder.ts`, secao "Cool-down recentes":

   ```ts
   // dentro do bloco ESTATICO (cache_control: ephemeral)
   if (recentCooldowns.length > 0) {
     systemBlocks.static += '\n\n## Rituais de cool-down recentes (ultimas 5 sessoes):\n';
     systemBlocks.static += formatCooldownDigest(recentCooldowns);
   }
   ```

   `recentCooldowns` vem de novo storage method `getRecentCooldownDigest(userId, limit=5)` que
   retorna agregados por sessao (NAO texto cru): `{sessionId, completedAt, mode,
   blocksCompleted, starredCount, dominantStarredType, hasLesson}`. Tudo enum/number/boolean.

4. **Cache invalidation key:** o bloco depende apenas de `userId`. Quando o usuario completa
   um novo cool-down, `coach_conversations.lastSystemPromptHash` (mecanismo ja existente em
   ADR-019) muda na proxima conversa — cache miss controlado, depois volta a hit.

5. **Page context** (ADR-043): quando o user esta em `/grind/history/:id?tab=cooldown`,
   frontend envia `pageContext: { route: 'cooldown-log', cooldownLogId, sessionId, mode,
   blocksCompleted, completedAt, abGameAnswers? sanitized, tiltSelfAssessment? sanitized,
   starredHandsCount, recentLessonTokens? }`. Sanitizer no schema mesmo (ADR-043 detalha).

- **Pros:**

  - **Segura por design.** Sanitizer na fronteira entre storage e LLM. Notes nunca cruzam.
    OWASP LLM06 (Sensitive Information Disclosure) endereçada estruturalmente.
  - **Cacheavel.** Bloco "rituais recentes" no estatico; muda apenas em conclusao de cool-down
    (raramente dentro da janela de 5min). Cache hit ~90% das mensagens em sessao de chat ativa.
  - **Reuso total.** Storage methods ja existem (Sprint 2). Tool registry ja existe (ADR-023).
    Wrapping ja existe (ADR-024). Page context schema ja eh discriminated union (ADR-025);
    basta acrescentar variante.
  - **Coach decide quando puxar.** Tool e read-only e o LLM so chama se a conversa exigir.
    Nao desperdica tokens por padrao em conversas que nao tocam tilt/cool-down.
  - **Page context complementa tool.** Quando user pergunta "como foi meu cool-down de ontem?"
    e ja esta vendo a tela, o bloco dinamico ja tem o log especifico — coach responde sem
    chamar tool. Tool e para perguntas agregadas (ultimos 30d).
  - **Auditabilidade.** Wrapping `{__type: 'ToolResult', tool: 'read_cooldown_history', ok,
    data}` ja eh logado em `coach_messages.metadata` quando aplicavel.
  - **Custo cognitivo baixo.** 1 handler novo (~100 LOC) + 1 storage method digest (~30 LOC)
    + entradas em registry/index. Espelha ADR-023 fielmente.

- **Contras:**

  - **+1 tool no registry.** Custo cognitivo de manutencao linear; aceito (registry foi feito
    para escala).
  - **Sanitizer drift.** Se schema de cool-down ganhar campo PII novo no futuro (Sprint 4+),
    sanitizer precisa ser atualizado em sincronia. Mitigacao: teste unitario que asserta
    contra schema base — qualquer campo novo nao listado quebra teste.
  - **Cache miss inicial apos cada cool-down completado.** Aceitavel — eh ~1 cache write extra
    por sessao do usuario, custo trivial ($3.75/1M tokens em ~500 tokens estaticos).

### Opcao B: Tool generica `query_logs` que aceita SQL/filter arbitrario

```ts
// LLM constroi: query_logs({ table: 'cooldown_logs', period: '30d', limit: 5 })
```

- **Pros:**
  - Uma tool resolve futuras necessidades sem novas registracoes.
- **Contras:**
  - **Vetor de injecao via filtro.** LLM pode (alucinar) parametros que vazam outras tabelas.
  - **Dificil sanitizar.** Sem schema fixo de output, sanitizer vira dynamic — bug-prone.
  - **Acopla LLM ao schema do banco.** Mudancas em schema quebram comportamento aprendido.
  - **Contradiz ADR-023** (tool registry e modular por dominio com schemas explicitos).
  - **Rejeitada por seguranca + ADR-023.**

### Opcao C: Expor logs brutos via page context (sem tool)

Frontend envia o log inteiro (incluindo notes) como `pageContext.cooldownLog`. Coach le do
prompt diretamente.

- **Pros:**
  - Zero tool nova; menos codigo backend.
- **Contras:**
  - **Notes brutas no prompt.** Notes sao PII textual — entram no system prompt cacheavel.
    Vazamento estrutural via cache logs/audit.
  - **Sanitizer no frontend.** Sanitizar no client e fragil (codigo mudavel pelo proprio
    usuario via devtools). Backend deve ser fonte de verdade.
  - **Limite de tokens.** Notes longas estouram o page context max length (ADR-025 enforce
    limites por campo).
  - **Sem agregacao cross-session.** Page context e da tela atual; coach nao consegue
    responder "quantos tilt voce teve nos ultimos 30 dias?" sem tool.
  - **Rejeitada por PII + falta de agregacao.**

### Opcao D: Dashboards estaticos de cool-down sem Coach (skip RF-07)

Mostrar `cooldown-compliance` + `starred-hands-distribution` + `top-lessons` em widgets do
profile sem expor ao Coach.

- **Pros:**
  - Zero risco de PII no Coach.
- **Contras:**
  - **Coach perde contexto critico.** Uma das hipoteses da spec eh "coach sugere trabalho em
    tilt management baseado em padrao". Sem tool, coach nao sabe que user teve 12 maos tipo
    `tilt` em 30d.
  - **Reduced engagement.** Dashboards estaticos ja existem (Sprint 2 entregou). Sprint 3
    sem Coach integration eh somente deprecation de campos orfaos — desproporcional ao plano
    de 3 dias.
  - **Rejeitada por falhar o objetivo de produto da spec.**

### Opcao E: Bloco "rituais recentes" no DINAMICO em vez de cacheable

Inserir o digest no bloco dinamico (apos breakpoint) para evitar cache write toda vez que
cool-down e adicionado.

- **Pros:**
  - Sem cache miss em conclusao de cool-down.
- **Contras:**
  - **Pior economia.** Bloco dinamico paga preco regular ($3.00/1M) toda mensagem. Bloco
    cacheado paga $0.30/1M apos primeira mensagem. Em sessao de 10 mensagens com mesmo
    digest, dinamico custa 10x mais.
  - **Contradiz ADR-019** que escolheu por bloco estatico para tudo que muda raramente. Cool-
    down muda apenas em conclusao — comportamento equivalente a `userAiProfile`.
  - **Rejeitada por economia.**

## Decisao

**Adotar Opcao A: tool `coach.read_cooldown_history` com sanitizer agregador + bloco "rituais
recentes" no system prompt cacheavel + page context `cooldownLog` (detalhado em ADR-043).**

### Detalhes-chave do design

1. **Tool registration** em `server/coachTools/index.ts`:

   ```ts
   import { readCooldownHistory } from './handlers/readCooldownHistory';
   registerTool(readCooldownHistory);
   ```

2. **Tool descriptor** em `server/coachTools/handlers/readCooldownHistory.ts`:

   ```ts
   export const readCooldownHistory: CoachTool = {
     name: 'read_cooldown_history',
     description:
       'Retorna agregado de rituais de cool-down do usuario nos ultimos 7/30/90 dias. ' +
       'Inclui contagem de sessoes, distribuicao de maos estreladas por tipo, e ' +
       'tokens das licoes mais frequentes. NAO retorna notas pessoais.',
     inputSchema: z.object({
       period: z.enum(['7d', '30d', '90d']),
     }),
     handler: cooldownHistoryHandler, // ver Opcao A item 1
     auditLevel: 'log', // padrao de read tools
     gateByTier: undefined, // disponivel em todos planos
   };
   ```

3. **Storage method novo** `getRecentCooldownDigest(userId, limit=5)` em `server/storage.ts`:

   ```ts
   async getRecentCooldownDigest(userId: string, limit = 5): Promise<CooldownDigestItem[]> {
     // SELECT cooldown_logs JOIN starred_hands aggregated
     // retorna apenas: sessionId, completedAt, mode, blocksCompleted (jsonb),
     //                 starredCount, dominantStarredType, hasLesson (boolean)
     // ORDER BY completedAt DESC LIMIT 5
   }
   ```

   **NAO retorna notes, abGameAnswers.cGame, tiltSelfAssessment.action.**

4. **Builder hook** em `server/coachSystemBuilder.ts`:

   ```ts
   async function buildStaticBlock(userId: string): Promise<string> {
     // ... blocos existentes (base, safety, profile, statsSnapshot, lastSummary)
     const cooldownDigest = await storage.getRecentCooldownDigest(userId, 5);
     if (cooldownDigest.length > 0) {
       parts.push(formatCooldownDigest(cooldownDigest));
     }
     return parts.join('\n\n');
   }
   ```

   `formatCooldownDigest` produz texto markdown estruturado e curto (~150-300 tokens):

   ```
   ## Rituais de cool-down recentes (5 ultimas sessoes)
   - 2026-04-25 (full, blocos: hands+abc): 2 maos estreladas (1 tilt, 1 leak), licao registrada
   - 2026-04-23 (quick): 3 maos estreladas (2 mistake, 1 cooler)
   - 2026-04-20 (full, blocos: hands+abc+tilt): 1 mao estrelada (tilt), licao registrada
   ...
   ```

5. **Cache key** (ADR-019 mecanismo existente): hash do conteudo do bloco estatico ja captura
   o digest. Quando user completa novo cool-down, hash muda na proxima conversa, cache miss
   uma vez, depois volta a hit.

6. **Sanitizer test:** `tests/unit/coach/tools/cooldown-history.test.ts` (mencionado em RF-09)
   asserta:
   - Output **nao contem** os campos `notes`, `cGame`, `action`, `aGame`, `bGame`, `lesson`
     (texto cru).
   - Output **contem** `totalSessions`, `cooldownCount`, `starredHands.byType`,
     `starredHands.total`, `recentLessons` (array de tokens).
   - Wrapping ADR-024 aplicado pelo runner (verificavel em integration test).

7. **Page context cooldownLog** — schema em ADR-043. Resumo: route literal
   `'cooldown-log'`, ids + enums + counts. **Notes excluidas.**

8. **Telemetria/eventos:** evento de tool execution e logado em `coach_messages.metadata`
   sob a chave `tools_used: [{name: 'read_cooldown_history', period: '30d', tookMs}]`. Nome
   estavel para futura analise de custo (ja padronizado pelas demais tools).

9. **Rate limiting:** segue o rate limit global do `/api/coach/chat` (10/min — ADR-020). Tool
   nao adiciona limite proprio.

10. **Rollback:** caso problemas, basta `unregisterTool('read_cooldown_history')` e remover
    `formatCooldownDigest` do builder. Schema de banco intacto. Page context da rota
    `cooldown-log` permanece — frontend simplesmente nao envia.

## Consequencias

### Positivas

- **Coach ganha contexto operacional sobre tilt/cool-down sem expor PII.** Cumpre objetivo de
  produto da spec (US-07: "coach tem acesso ao agregado das ultimas 5 sessoes e usa contexto
  para sugerir trabalho em tilt management").
- **Cache hit ~90% mantido.** Bloco "rituais recentes" cabe no estatico; cache miss apenas
  apos completar cool-down — situacao rara dentro da janela de 5min.
- **Reuso total da arquitetura existente.** Zero refatoracao em ADR-019/023/024/025.
- **Sanitizer estrutural na fronteira backend.** Frontend nao pode bypassar; auditavel em
  testes unitarios.
- **Habilita Sprint 4+ sem refactor.** Padrao para futuras tools de mental (warm-up
  retrospective, sleep tracking) ja estabelecido.

### Negativas

- **Manter sanitizer em sincronia com schema.** Mitigado por teste unitario que falha se
  campo PII novo aparece sem listagem explicita no whitelist do sanitizer.
- **+1 tool no registry.** ~50 tools planejadas no roadmap; aceitavel.
- **Cache miss inicial pos-conclusao de cool-down.** Custo desprezivel.
- **Coach 115 fails pre-existentes nao corrigidos.** Sprint Cooldown-3 adiciona testes da
  tool e do page context novos; corrigir base do Coach eh fora de escopo. Documentado em
  cooldown-index.md.

### Neutras

- **`preparation_logs.{postSessionReview, goalsAchieved, lessonsLearned}` deprecados.**
  Sprint Cooldown-3 marca `@deprecated` no schema (comentario em `shared/schema.ts`) e
  remove DROP COLUMN ao final. Nao afeta Coach diretamente — campos eram orfaos.
- **Correlacao cool-down x performance da proxima sessao.** Endpoint
  `/api/analytics/cooldown-impact` ja existe (Sprint 2). Sprint 3 expoe via tool: handler
  pode opcionalmente incluir delta no output (`{withCooldown: {avgRoi}, withoutCooldown:
  {avgRoi}, delta}`). Dados sao agregados (nao PII), entram no `data`. Ver Q-Arch-1 abaixo.

## Confianca

**Alta.** Padrao "tool dedicada por dominio + sanitizer + bloco cacheavel" ja foi validado em
ADR-023, ADR-024, ADR-019. Storage methods sustentadores existem desde Sprint 2 (commit
9635530). Risco principal — drift schema-sanitizer — mitigado por teste unitario.

## Questoes Tecnicas em Aberto

### Q-Arch-1. Incluir `cooldown-impact` (correlacao ROI) no output da tool?

Spec RF-07 cita "correlacao cool-down x performance da proxima sessao" como objetivo Sprint 3.
Decisao: **adicionar como campo opcional `impact?: { withCooldown: {avgRoi}, withoutCooldown:
{avgRoi}, deltaRoi }`** no output. Sanitizer trivial — sao numeros agregados. Implementer
chama `storage.getCooldownImpact(userId, period)` em paralelo com os outros 3 calls.

### Q-Arch-2. Limite de tokens do digest no system prompt?

Sprint 1 ja tem digest da last archived session (~200 tokens). Cool-down digest cresce com 5
sessoes — alvo: **<=300 tokens**. Implementer trunca dominantStarredType para enum (5-7 chars)
e omite blocos vazios. Validar com count em `tests/unit/coach/system-builder.test.ts`.

### Q-Arch-3. Cool-down em rascunho (`completedAt=null`) entra no digest?

**Nao.** Digest filtra `WHERE completedAt IS NOT NULL` para evitar ruido. Documentado no
storage method.

## Referencias

- **Spec:** `Docs/specs/cooldown-refactor-plan.md` (RF-07, RF-09, RF-10).
- **ADR-019:** `019-coach-prompt-cache-strategy.md` — bloco "rituais recentes" no estatico.
- **ADR-023:** `023-coach-tool-registry-pattern.md` — registry modular reusado.
- **ADR-024:** `024-coach-tool-result-wrapping.md` — wrapping aplicado ao output.
- **ADR-025:** `025-coach-page-context-zod-whitelist.md` — base do schema; ADR-043 estende
  union com `cooldownLog`.
- **ADR-041:** `041-cooldown-dedicated-spec-and-schema.md` — schema de origem.
- **ADR-043 (companheiro):** `043-coach-page-context-cooldown-log.md` — shape do page context.
- **Sequence diagram:** `Docs/architecture/flows/coach/sequence-cooldown-tool.mermaid`.
- **Index:** `Docs/architecture/cooldown-index.md`.
- **OWASP LLM06:2025** — Sensitive Information Disclosure (sanitizer endereca).
