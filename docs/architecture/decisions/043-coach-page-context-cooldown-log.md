# ADR-043: Page context `cooldownLog` — extensao da Zod discriminated union do Coach com sanitizer no schema

## Status

Proposto

## Data

2026-04-26

> **Nota de numeracao:** ADR companheiro de ADR-042 (Sprint Cooldown-3, tool registry para
> cool-down). Spec `cooldown-refactor-plan.md` referencia ambos como "ADR-029/030"; numeros ja
> ocupados (ADR-029 warmup-no-dual-write, ADR-030 warmup-telemetry). Este ADR usa **043** apos
> ADR-042. Arquivo separado de `025-coach-page-context-zod-whitelist.md` (ja aceito) por
> convencao do projeto: ADR aceito nao eh editado para nao perder rastro do raciocinio
> original; novas variantes do mesmo padrao ganham ADRs proprios.

## Contexto

ADR-025 estabeleceu Zod discriminated union por `route` para o `pageContext` injetado no system
prompt do Coach. Quatro rotas instrumentadas em Sprint 2A:

- `grade-planner`, `grind-live`, `dashboard`, `coach-ai`.

Sprint Cooldown-3 introduz uma nova rota: o usuario abre o **historico de uma sessao
especifica** com a aba "Cool-down" ativa (rota futura `/grind/history/:id?tab=cooldown`) e
inicia uma conversa com o Coach perguntando sobre aquele log. Para o Coach responder com
precisao sem chamar a tool `read_cooldown_history` (ADR-042) — que eh agregada — o `pageContext`
deve carregar o **shape do log especifico** que o usuario esta vendo.

A **pergunta central:** qual o shape do `cooldownLog` no `pageContext`, e como sanitizar PII
nesse shape considerando que `cooldown_logs` carrega notes pessoais (`notes`, `abGameAnswers.
cGame`, `tiltSelfAssessment.action`) + starred hands com `notes`?

### Restricoes

- **Compatibilidade com ADR-025.** Schema novo eh uma variante adicional na discriminatedUnion.
  Sem refactor das outras 4 variantes.
- **OWASP LLM06 (Sensitive Information Disclosure).** Notes textuais NAO podem entrar no system
  prompt — vazam em logs/auditoria/cache snapshots da Anthropic.
- **OWASP LLM01 (Prompt Injection).** Strings free-form digitadas pelo usuario sao vetor.
  Schema deve preferir enums e booleans; quando texto for inevitavel, length-cap rigorosa +
  sanitize regex.
- **Token budget.** Page context entra no bloco DINAMICO (ADR-019); cada token paga preco full.
  Alvo: <=200 tokens para um cooldownLog completo.
- **DX.** Adicionar variante segue padrao ADR-025: novo `z.object` + entrada na union + novo
  formatter no builder + exhaustiveness check do tsc.

## Opcoes Consideradas

### Opcao A: Schema sanitizado no proprio Zod — counts + booleans + enums + ids (ESCOLHIDA)

```ts
// server/coachContext.ts (extensao da union existente)

const cooldownLogContext = z.object({
  route: z.literal('cooldown-log'),
  cooldownLogId: z.string().max(50),
  sessionId: z.string().max(50),
  mode: z.enum(['full', 'quick']),
  blocksCompleted: z.array(z.enum(['hands', 'abc', 'tilt', 'sleep', 'quick'])).max(5),
  completedAt: z.string().datetime().nullable(), // ISO; null = rascunho
  // sanitizers no schema:
  abGameAnswers: z
    .object({
      hasAGame: z.boolean(),       // presence-only
      hasBGame: z.boolean(),
      hasCGame: z.boolean(),
      hasLesson: z.boolean(),
      // NAO inclui aGame[], bGame[], cGame, lesson (texto livre)
    })
    .optional(),
  tiltSelfAssessment: z
    .object({
      feltTilt: z.number().int().min(0).max(10),
      keptTilting: z.number().int().min(0).max(10),
      presence: z.number().int().min(0).max(10),
      triggersCount: z.number().int().min(0).max(20), // count, NAO array
      dominantTrigger: z
        .enum([
          'cooler', 'slowroll', 'big-bluff-fail', 'downswing',
          'distracao', 'fome', 'sono', 'briga-interpessoal', 'outro',
        ])
        .optional(),
      // NAO inclui action (texto livre), NAO inclui triggers[] (preserva so dominant)
    })
    .optional(),
  starredHandsCount: z.number().int().min(0).max(50),
  starredHandsByType: z
    .record(
      z.enum(['tilt', 'leak', 'soulread', 'hero-call', 'cooler', 'mistake', 'sick', 'other']),
      z.number().int().min(0).max(50)
    )
    .optional(),
  recentLessonTokens: z.array(z.string().max(30)).max(10).optional(), // top 10 tokens curtos
});

// adicionar na union
export const pageContextSchema = z.discriminatedUnion('route', [
  gradePlannerContext,
  grindLiveContext,
  dashboardContext,
  coachAIContext,
  cooldownLogContext, // <-- NOVO
]);
```

**Backend** (`server/routes/coach.ts`) recebe esse shape. Frontend monta o page context **a
partir do log carregado**, **excluindo notes** antes de enviar (`useCoachPageContext` hook).

**Builder** (`server/coachSystemBuilder.ts`) adiciona case no switch:

```ts
case 'cooldown-log':
  return formatCooldownLog(ctx);
```

`formatCooldownLog` produz markdown:

```
## Voce esta vendo o cool-down da sessao {sessionId}
- Modo: full | quick
- Blocos completos: hands, abc
- Concluido em: 2026-04-25T22:14:00Z (ou "em rascunho" se null)
- Maos estreladas: 3 (tilt: 2, leak: 1)
- Tilt self-report: feltTilt 6/10, keptTilting 4/10, presence 5/10, gatilho dominante: distracao
- A/B/C journal: aGame registrado, cGame registrado, licao registrada
```

- **Pros:**

  - **Zero PII.** Schema **estruturalmente impede** notes brutas. Validation_failed se frontend
    enviar campo nao listado (Zod `.strict()` ja eh comportamento default em discriminated
    union).
  - **Tipagem end-to-end.** TypeScript exhaustiveness em `formatCooldownLog`. Adicionar campo
    no schema forca atualizacao no formatter.
  - **Token budget controlado.** Counts + enums + booleans = ~150-200 tokens em pior caso.
  - **Reuso total de ADR-025.** So adiciona 1 variante. Sanitize regex existente continua
    sendo aplicado em strings free-form residuais (ex: `recentLessonTokens` pode conter
    palavras que precisam de sanitize residual).
  - **Coach decide proxima acao.** Se usuario pergunta "por que essa licao?" e licao nao esta
    no contexto (so token), Coach pode chamar tool `read_cooldown_history` para profundidade —
    mas raramente precisa.
  - **Auditavel.** Schema eh contrato. Reviewer le e sabe exatamente o que cruza fronteira.
  - **Defesa em profundidade:** schema (estrutura) + sanitize (regex residual) + tool wrap
    (ADR-024) + system rule (ADR-024).

- **Contras:**

  - **Boilerplate.** ~50 LOC de schema + ~30 LOC de formatter. Aceito; segue padrao ADR-025.
  - **Sanitizer drift.** Adicionar campo PII novo no schema base de cool-down (Sprint 4+) sem
    atualizar este schema vaza por _omissao_? Nao — Zod schema eh whitelist; campos novos sao
    rejeitados silenciosamente pelo Zod (`.strict()` default em discriminatedUnion). Risco
    real eh o contrario: dev incluir campo PII no schema sem perceber. Mitigacao: teste
    unitario asserta blacklist explicita (`expect(schema.shape).not.toContainKey('notes')`).

### Opcao B: Schema com strings free-form + sanitize regex agressivo

```ts
const cooldownLogContext = z.object({
  route: z.literal('cooldown-log'),
  cooldownLogId: z.string().max(50),
  sessionId: z.string().max(50),
  mode: z.enum(['full', 'quick']),
  notesPreview: z.string().max(200).optional(), // sanitizado por regex
  abGameNotesPreview: z.string().max(500).optional(),
  // ...
});
```

- **Pros:**
  - Coach ve texto real, podendo responder com mais nuance.
- **Contras:**
  - **PII vaza.** Sanitize regex remove tokens conhecidos mas nao remove conteudo emocional
    (notas como "minha esposa brigou comigo" passam pelo regex).
  - **Logs Anthropic.** Page context entra no prompt; Anthropic ve. Mesmo com termos de
    privacidade, expor PII desnecessariamente eh risco evitavel.
  - **Cache snapshots.** Page context vai pro bloco dinamico (nao cache), ok aqui — mas o
    pattern abre precedente para outras paginas.
  - **Token budget estoura.** 200+500+500 chars por log = ~300-500 tokens.
  - **Rejeitada por privacidade + budget.**

### Opcao C: Sanitize manual no frontend antes de enviar

Frontend chama `sanitizeCoolDownLogForCoach(log)` que strip notes; backend valida shape simples
sem sanitizers no schema.

- **Pros:**
  - Codigo backend mais simples.
- **Contras:**
  - **Frontend nao eh fonte de verdade.** Atacante pode bypassar via curl direto ao endpoint.
  - **Backend deve validar invariantes de privacidade.** Padrao do projeto (todas validacoes
    estao no backend, ver `shared/schema.ts`).
  - **Quebra padrao ADR-025** (whitelist Zod no backend).
  - **Rejeitada por seguranca.**

### Opcao D: Nao instrumentar — tool resolve tudo

Sprint 3 entrega so tool agregada (ADR-042). Quando usuario abre tela de cool-down, frontend
nao envia page context novo; coach chama tool se precisar.

- **Pros:**
  - Menos codigo.
- **Contras:**
  - **Latencia em conversas tela-aware.** Cada pergunta sobre o log atual forca tool call —
    round trip extra de ~500ms-1s.
  - **Coach nao sabe que usuario esta na tela.** Pergunta "por que essa licao?" sem contexto
    parece random.
  - **Spec RF-07** menciona explicitamente "page context novo `pageContext.cooldownLog`".
  - **Rejeitada por UX e fidelidade a spec.**

## Decisao

**Adotar Opcao A: extender `pageContextSchema` com variante `cooldownLog` que sanitiza PII no
schema (counts + booleans + enums + ids + tokens curtos), e implementar `formatCooldownLog` no
builder com exhaustiveness check.**

### Detalhes-chave do design

1. **Localizacao do schema:** `server/coachContext.ts` (mesma localizacao das outras 4
   variantes — ADR-025 padrao).

2. **Localizacao do formatter:** `server/coachSystemBuilder.ts`, funcao
   `buildPageContextSection(ctx)` ja existente. Adicionar case `cooldown-log`.

3. **Frontend hook:** `client/src/hooks/useCoachPageContext.ts` ja existente (Sprint 2A) —
   adicionar branch para detecar rota `/grind/history/:id?tab=cooldown` e montar shape
   sanitizado **lendo o log carregado pela page e mapeando para os booleans/counts**.

   ```ts
   function buildCooldownLogContext(log: CoolDownLogView): PageContext {
     return {
       route: 'cooldown-log',
       cooldownLogId: log.id,
       sessionId: log.sessionId,
       mode: log.mode,
       blocksCompleted: log.blocksCompleted,
       completedAt: log.completedAt?.toISOString() ?? null,
       abGameAnswers: log.abGameAnswers
         ? {
             hasAGame: (log.abGameAnswers.aGame?.length ?? 0) > 0,
             hasBGame: (log.abGameAnswers.bGame?.length ?? 0) > 0,
             hasCGame: !!log.abGameAnswers.cGame?.trim(),
             hasLesson: !!log.abGameAnswers.lesson?.trim(),
           }
         : undefined,
       tiltSelfAssessment: log.tiltSelfAssessment
         ? {
             feltTilt: log.tiltSelfAssessment.feltTilt,
             keptTilting: log.tiltSelfAssessment.keptTilting,
             presence: log.tiltSelfAssessment.presence,
             triggersCount: log.tiltSelfAssessment.triggers.length,
             dominantTrigger: pickDominantTrigger(log.tiltSelfAssessment.triggers),
           }
         : undefined,
       starredHandsCount: log.starredHands.length,
       starredHandsByType: aggregateByType(log.starredHands),
       recentLessonTokens: tokenizeLesson(log.abGameAnswers?.lesson ?? '').slice(0, 10),
     };
   }
   ```

   **`tokenizeLesson` reusa logica de `getTopLessons`** (Sprint 2 storage) — palavras > 3
   chars, lowercase, sem stopwords. Garante que tokens individuais nao sao texto coerente
   reconstruivel.

4. **Backend validacao:** ja existe via `pageContextSchema.safeParse(req.body.pageContext)`
   em `server/routes/coach.ts`. Sem mudanca nesse codigo — a discriminated union resolve o
   case novo automaticamente.

5. **Sanitize residual:** funcao `sanitizePageContext(ctx)` ja existente em ADR-025 — recursao
   em strings remove tokens conhecidos. Aplicada apos parse, antes de injetar no prompt.
   Para `cooldownLogContext`, strings residuais sao `cooldownLogId`, `sessionId`, e
   `recentLessonTokens[]`. Tokens de licao sao ja palavras curtas — sanitize remove qualquer
   `<|im_start|>`-like token residual.

6. **Token budget enforcement:** `formatCooldownLog` produz markdown denso. Teste asserta
   `output.length < 1500` (~200 tokens conservador). Se algum dia estourar, truncar
   `recentLessonTokens` ou omitir starred hands se contagem == 0.

7. **Privacy test:** `tests/unit/coach/page-context.test.ts` (Sprint 2A) ganha asserts:
   - **Negative:** `pageContextSchema.safeParse({route:'cooldown-log', notes: 'x'})` falha.
   - **Negative:** `pageContextSchema.safeParse({route:'cooldown-log', abGameAnswers:
     {cGame: 'x'}})` falha.
   - **Positive:** shape valido passa.
   - **Frontend builder:** `buildCooldownLogContext(mockLogWithNotes)` retorna objeto **sem**
     campos `notes`, `cGame`, `lesson` (texto cru) — apenas counts/booleans/tokens.

8. **Page context complementa tool (ADR-042).** Ambos podem coexistir em uma mensagem:
   - Page context: log atual da tela (especifico).
   - Tool call: agregado de 30d (geral).
   - Bloco "rituais recentes" no system: 5 ultimas (panorama).

   Coach decide qual fonte usar. Padrao Anthropic — multi-source resolution e nativo.

9. **Rollback:** remover entrada da union + remover case do switch + remover branch no hook.
   Schema de banco intacto.

## Consequencias

### Positivas

- **PII estruturalmente impossivel de vazar via page context.** Schema rejeita campos
  textuais. Defesa em profundidade preservada.
- **Tipagem end-to-end.** Frontend, backend, builder e formatter compartilham tipo derivado de
  Zod (via `shared/` se necessario).
- **UX coach melhor.** Quando usuario esta vendo log e pergunta "por que essa licao?", coach
  ja tem contexto. Sem round-trip extra.
- **Token budget controlado.** Estimativa <=200 tokens worst case.
- **Reuso de ADR-025.** Padrao discriminated union escala linearmente.

### Negativas

- **Boilerplate.** Aceito (segue ADR-025).
- **Tokens da licao podem reconstruir frase.** Mitigacao: top-10 tokens, ordem nao preservada,
  stopwords removidas. Tokens isolados nao sao prosa coerente. Nivel de exposicao
  comparavel ao endpoint `top-lessons` ja vivo desde Sprint 2.

### Neutras

- **Frontend hook precisa ler log antes de montar context.** Aceito — pagina ja precisa
  do log para renderizar; reuso da query.
- **`triggersCount` + `dominantTrigger`** em vez de array completo. Coach pergunta "qual
  gatilho?" e recebe so o dominante. Se precisar mais profundidade, chama
  `read_cooldown_history` (ADR-042).
- **`recentLessonTokens` redundante com bloco "rituais recentes"** do system (ADR-042). Aceito
  — system tem ate 5 sessoes; page context tem so o log atual. Granularidade complementar.

## Confianca

**Alta.** Padrao ADR-025 ja foi validado em 4 variantes (grade-planner, grind-live, dashboard,
coach-ai). Cool-down log eh a 5a — extensao natural. Sanitizer no schema eh estrutural,
nao depende de runtime checks fragis. Risco principal — dev adicionar campo PII no schema —
endereçado por teste blacklist explicita.

## Referencias

- **Spec:** `Docs/specs/cooldown-refactor-plan.md` (RF-07 page context novo).
- **ADR-025:** `025-coach-page-context-zod-whitelist.md` — base do padrao.
- **ADR-042 (companheiro):** `042-cooldown-coach-tool-registry.md` — tool agregada.
- **ADR-019:** `019-coach-prompt-cache-strategy.md` — page context vai no bloco dinamico.
- **ADR-041:** `041-cooldown-dedicated-spec-and-schema.md` — schema base de cooldown_logs.
- **Sequence diagram:** `Docs/architecture/flows/coach/sequence-cooldown-tool.mermaid`
  (branch "page context").
- **OWASP LLM01:2025** — Prompt Injection (whitelist enderecada).
- **OWASP LLM06:2025** — Sensitive Information Disclosure (sanitizer estrutural endereca).
