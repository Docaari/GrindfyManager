# ADR-075 — Coach tool `recommend_lesson` + hard-block de concorrentes no system prompt

- Status: Proposto
- Data: 2026-05-01
- Sprint: Biblioteca-1 (RF-09 + RF-10)
- Decision owner: system-architect (autonomous; ratifica founder D9 + D14 + D15)
- Related: ADR-019 (Coach prompt cache 2 blocos), ADR-023 (tool registry pattern), ADR-024 (tool result wrapping), ADR-052 (HUD stats coach tool integration), ADR-068 (cross-feature recommendations engine), ADR-073 (entitlements — `hasAccess` por lesson)
- Spec: `Docs/specs/biblioteca-spec-1.md` RF-09 + RF-10 + D14 + D15

## Contexto

A Spec 1 da Biblioteca introduz o **loop fechado tracker → biblioteca →
Coach**, diferenciador unico vs concorrentes. Para fechar esse loop:

1. **RF-09:** Coach NAO pode recomendar produto concorrente
   (PokerCoaching, GTO Wizard, RYE, RIO, Upswing, SFW).
2. **RF-10:** Coach DEVE poder recomendar aula Grindfy quando detecta
   leak no chat — via tool nova `recommend_lesson`.

A questao arquitetural e dupla:

- **Como bloquear citacao de concorrentes** sem quebrar o cache da
  Anthropic (lesson #10 — divergencia silenciosa de prompt = cache
  miss caro)?
- **Como modelar a tool `recommend_lesson`** (input/output/ranking/UI
  embed) consistente com tools existentes (`read_user_hud_stats`,
  `read_theme_with_linked_spots`)?

### Forcas em jogo

- **Cache Anthropic:** 90% do cost saving do Coach vem de prompt cache
  hit (ADR-019). Block-list de concorrentes precisa estar no **bloco
  estatico** (cacheado), nao no dinamico (per-request).
- **Lesson #10 (DRY de prompts):** texto de bloqueio precisa estar em
  **um arquivo unico** (`coachSafetyPrompts.ts`) — duplicado em outro
  lugar = drift = cache miss.
- **Audit:** founder precisa garantir Coach nao mencione concorrente —
  test de regressao com prompt fixture lendo `COMPETITOR_BLOCKLIST`
  garante.
- **Ranking de aulas (D14):** match exato categoria > match em tags >
  preferir nao-iniciada > iniciada > completa. Server-side
  determinismo, nao LLM scoring.
- **`hasAccess` por lesson (RF-10):** tool retorna mesmo aulas sem
  grant (CTA "Em breve") — UI mostra capa aspiracional. Aula sem
  grant + recomendacao = trigger de comunicacao "compre quando
  abrir".
- **Tool call com side-effect:** quando tool executa com sucesso,
  evento `coach_recommend` gravado em `library_events` para cada
  lesson — viabiliza analytics de CTR (Spec 5+).
- **Tier gating (ADR-023):** tool so disponivel para Pro+ — Free user
  Coach nao recebe a tool no exposed list (nao ve mesmo se Coach
  tentar invocar).
- **Lesson #4 (Vitest 4):** tests de tool precisam rodar em projeto
  node, nao jsdom.
- **Lesson #11 (default minimo):** se 0 aulas matched (categoria
  vazia), tool retorna `lessons: []` com `ok: true` — Coach NAO
  inventa. UI nao renderiza card.

## Opcoes Consideradas

### Opcao A: Tool dedicated `recommend_lesson` + hard-block via constante exportada em system prompt (ESCOLHIDA)

**Tool registration** em `server/coachTools/index.ts`:

```ts
import { recommendLessonTool } from './recommendLesson';
safeRegister(recommendLessonTool);
```

**Tool def:**
```ts
export const recommendLessonTool: CoachTool = {
  name: 'recommend_lesson',
  description: 'Recomenda ate 3 aulas da Biblioteca Grindfy alinhadas a um leak/topico detectado.',
  inputSchema: z.object({
    leakTopic: z.enum([
      'performance_mental', 'preflop', 'postflop', 'multiway',
      'icm_pre', 'icm_pos', 'final_table', 'exploits', 'special_formats'
    ]),
    urgency: z.enum(['low', 'medium', 'high']).default('medium'),
    maxResults: z.number().int().min(1).max(3).default(3),
  }),
  handler: recommendLessonHandler,
  requiresConfirmation: false,
  auditLevel: 'log',
  gateByTier: ['pro', 'premium', 'admin'],
};
```

**Output schema:**
```ts
{
  __type: 'ToolResult',
  tool: 'recommend_lesson',
  ok: true,
  data: {
    lessons: Array<{
      id: string;
      slug: string;
      courseSlug: string;
      title: string;
      courseTitle: string;
      coverUrl: string;
      durationMinutes: number;
      categoryId: string;
      hasAccess: boolean;
      url: string;  // /biblioteca/curso/:courseSlug/:lessonSlug
    }>;
  }
}
```

**Block-list em `coachSafetyPrompts.ts`:**
```ts
export const COMPETITOR_BLOCKLIST = [
  'GTO Wizard', 'GTOWizard',
  'Raise Your Edge', 'RYE',
  'PokerCoaching', 'Poker Coaching',
  'Run It Once', 'RunItOnce', 'RIO',
  'Upswing', 'Upswing Poker',
  'Solve For Why', 'SFW',
] as const;

export const SAFETY_RULES_COMPETITOR_BLOCK = `
## Marcas de Produtos

Voce NUNCA cita marcas de produtos concorrentes do Grindfy:
${COMPETITOR_BLOCKLIST.join(', ')}.

Se o usuario perguntar sobre uma dessas marcas (ex: "qual aula do GTO
Wizard sobre 4-bet bluff?"), voce:
1. NAO recomenda o produto concorrente.
2. Recomenda conteudo Grindfy equivalente quando existir (use a tool
   recommend_lesson).
3. Se nao houver conteudo Grindfy, ensine o conceito generico (ex:
   "4-bet bluff" e um conceito GTO; explique sem citar a marca).
4. Conceitos genericos (GTO, ICM, MDF, push/fold, ranges) podem ser
   citados livremente.
`.trim();
```

Inserido em `buildStaticSystemBlock()` antes do `SAFETY_RULES_BASE`.
Cache key inclui o hash deste bloco — atualizar lista quebra cache
**uma vez** depois estabiliza.

**Ranking handler** (D14):
```ts
async function recommendLessonHandler(input, ctx) {
  const userId = ctx.user.userPlatformId;
  const { leakTopic, urgency, maxResults } = input;

  // 1. Match exato categoria
  let lessons = await storage.findLessonsByCategory(leakTopic, { limit: maxResults * 3 });

  // 2. Fallback: match em tags
  if (lessons.length < maxResults) {
    const taggedLessons = await storage.findLessonsByTag(leakTopic, {
      excludeIds: lessons.map(l => l.id),
      limit: maxResults - lessons.length,
    });
    lessons = [...lessons, ...taggedLessons];
  }

  // 3. Sort por progresso: nao-iniciada > iniciada > completa
  const progress = await storage.lessonProgressLookup(userId, lessons.map(l => l.id));
  lessons.sort((a, b) => progressRank(progress, a) - progressRank(progress, b));

  // 4. Limit
  lessons = lessons.slice(0, maxResults);

  // 5. Anexar hasAccess
  const access = await storage.lessonAccessLookup(userId, lessons.map(l => l.id));

  // 6. Side-effect: gravar coach_recommend events
  await storage.recordLibraryEvents(lessons.map(l => ({
    userId, lessonId: l.id, eventType: 'coach_recommend',
    metadata: { leakTopic, urgency },
  })));

  return {
    __type: 'ToolResult',
    tool: 'recommend_lesson',
    ok: true,
    data: {
      lessons: lessons.map(l => ({
        id: l.id,
        slug: l.slug,
        courseSlug: l.courseSlug,
        title: l.title,
        courseTitle: l.courseTitle,
        coverUrl: assetUrl(l.coverKey),
        durationMinutes: Math.round((l.audioDurationSeconds || l.videoDurationSeconds || 0) / 60),
        categoryId: l.categoryId,
        hasAccess: access.get(l.id) ?? false,
        url: `/biblioteca/curso/${l.courseSlug}/${l.slug}`,
      })),
    },
  };
}
```

**UI embed:** novo componente `CoachLessonRecommendationCard` em
`client/src/components/Coach/`. `CoachMessage` detecta `tool ===
'recommend_lesson'` e renderiza carousel de cards.

- **Pros:**
  - **Cache-friendly** — block-list no bloco estatico = 1 cache miss
    quando lista atualizar, depois estavel.
  - **Const exportada testavel** — test fixture importa
    `COMPETITOR_BLOCKLIST`, garante presenca em system prompt + ausencia
    em respostas Coach.
  - **Tool segue pattern existente** — mesma surface que
    `read_user_hud_stats` (ADR-052), `read_theme_with_linked_spots`
    (ADR-068). Implementer reusa boilerplate.
  - **Ranking server-side determinista** — sem LLM scoring
    custoso/instavel.
  - **`hasAccess` na response** — UI gating consistente com catalogo.
  - **Side-effect events gravados** — analytics CTR + retention metrics
    desde dia 1.
  - **Tier gating** — Free user sem tool exposed (ADR-023).
  - **Audit log** — `auditLevel: 'log'` registra invocations.

- **Contras:**
  - **Block-list parcial** — Coach pode citar marca via parafrase
    ("aquele site do Doug Polk" = Upswing). Mitigado por: lista
    ampla + monitoramento de logs + iteracao.
  - **Side-effect dentro do tool handler** — pode falhar (storage down)
    e retornar 0 lessons. Wrap em try/catch — events sao best-effort
    (lesson #9 — log antes de fallback).
  - **Cache breakage when blocklist changes** — aceitavel (1 vez por
    update, raro).

### Opcao B: Block-list via post-processing (regex no output do Coach)

Coach gera resposta livremente; backend filtra menciones de
concorrentes via regex antes de devolver ao client.

- **Pros:**
  - Coach prompt nao polui (cache estavel).
  - Defesa em ultima linha.

- **Contras:**
  - **Censura visivel** — usuario ve "[censurado]" ou texto fragmentado.
  - **Coach ainda gerou tokens** — paga LLM cost para mencionar concorrente.
  - **Sem instrucao positiva** — Coach nao recomenda alternativa
    Grindfy; so omite. UX ruim.
  - **Rejeitada por:** UX inferior + custo desnecessario. Block via
    prompt e correto.

### Opcao C: Tool generica `recommend_content` (suporta lessons + spots + temas)

Uma tool unica que recomenda qualquer artefato de estudo (lesson,
study theme, starred hand spot).

- **Pros:**
  - Menos tools no registry — mais cache-friendly do system prompt.
  - Coach decide qual tipo recomendar.

- **Contras:**
  - **Ranking cross-tipo complexo** — comparar lesson vs spot vs theme
    em mesma lista? Diferentes UI cards.
  - **Schema input bloated** — ja existe ADR-068 para `study/recommendations`
    (cross-feature engine). Tool Coach DEVE ser thin wrapper, nao
    duplicate.
  - **Coach confusion** — quando recomendar spot vs lesson? Sem clear
    intent, LLM tropeca.
  - **Rejeitada por:** Coach precisa de **intent claro**. Tool
    dedicada por dominio (lesson) e mais legivel + testavel.

### Opcao D: Coach gera link literal (sem tool, so prompt instruct)

System prompt instrui: "quando detectar leak, gere link
`/biblioteca?leak=X`". Frontend resolve URL.

- **Pros:**
  - Zero tool overhead.
  - Coach generative.

- **Contras:**
  - **Sem hasAccess gating** — Coach pode linkar aula bloqueada.
  - **Sem ranking determinista** — Coach inventa link arbitrario.
  - **Sem analytics** — sem evento `coach_recommend`.
  - **Hallucination** — Coach pode gerar slug que nao existe.
  - **Rejeitada por:** sem garantias de correção. Tool resolve.

## Decisao

**Adotar Opcao A: tool `recommend_lesson` registrada em coachTools com
ranking server-side determinista, side-effect events para analytics,
+ `COMPETITOR_BLOCKLIST` constante exportada de `coachSafetyPrompts.ts`
incluida no bloco estatico do system prompt.**

### Detalhes-chave do design

1. **Tool dedicated** — segue pattern ADR-023, registrada via
   `safeRegister(recommendLessonTool)`.
2. **Schema input rigido** — enum `leakTopic` casa com
   `library-categories.ts` (D13). Compile-time gate via TypeScript.
3. **Ranking determinista** (D14):
   - Match exato `categoryId == leakTopic` (top-tier).
   - Fallback: match em `tags[]` (second-tier).
   - Sort por progresso: nao-iniciada > iniciada > completa.
   - `urgency` parameter logged em metadata mas nao afeta ranking
     (futuro: high urgency prioriza aula curta).
4. **`hasAccess`** anexado via `storage.lessonAccessLookup()` reusing
   helper de RF-05.
5. **Side-effect events** — `coach_recommend` gravado em
   `library_events` para cada lesson retornada. Try/catch wrapper —
   se falhar storage, log error mas nao quebra tool result (best-effort).
6. **Block-list constante**:
   ```ts
   export const COMPETITOR_BLOCKLIST = [...] as const;
   ```
   Exportada de `coachSafetyPrompts.ts`. Tests importam para validar:
   - Presenca em system prompt (`buildStaticSystemBlock` output
     contem cada item).
   - Ausencia em mock Coach response (regression test).
7. **Block via positive instruction** — system prompt nao so proibe
   citar mas instrui a recomendar conteudo Grindfy via tool. Coach
   responde "vou te indicar aulas Grindfy sobre isso" (proativo).
8. **Cache key** inclui hash do bloco static (com block-list). Update
   lista = 1 cache miss, estabiliza.
9. **Tier gating** — `gateByTier: ['pro', 'premium', 'admin']`.
   `exportToolsForAnthropic` filtra por tier do user — Free user
   nem ve a tool.
10. **UI embed** — `CoachLessonRecommendationCard`:
    - Renderiza dentro de `CoachMessage` quando assistant message
      contem tool result.
    - Layout: capa 16:9 + titulo + curso + duracao + CTA.
    - CTA "Assistir agora" se `hasAccess` (target=_blank).
    - CTA "Em breve" cinza desabilitado se nao.
    - Carrossel se `lessons.length > 1`.
11. **Audit:** `auditLevel: 'log'` registra cada invocacao.
12. **Output cap:** maxResults = 3 (D14). Schema enforça.

### Tradeoffs aceitos

| Tradeoff | Aceito por que |
|---|---|
| **Block-list parcial (parafrase escapa)** | Lista cobre nomes literais. Parafrase = monitor logs + iterar. |
| **Cache breakage on blocklist update** | Raro (rebrand de concorrente). Aceitavel. |
| **Side-effect dentro do handler** | Try/catch wrapper isola. Lesson #9 (log antes fallback). |
| **`urgency` parameter no impacto MVP** | Coach pode passar livremente; futuro ranking incorpora. Nao quebra contract. |
| **0 lessons retorna `ok: true` com `lessons: []`** | UI nao renderiza card. Coach trata em prompt-level ("Sem aulas ainda — indique tema X em sugestoes"). |

### Quando rever esta decisao

- **Block-list iteracao** — log de violacoes (Coach mencionou
  concorrente despite block) gera ADR de mitigacao adicional.
- **Spec 2 cross-feature engine** — `read_user_hud_stats` poderia
  invocar `recommend_lesson` automaticamente. Refactor para tool
  composability.
- **Spec 6 marketplace creator** — `recommend_lesson` pode precisar
  filtrar por creator (compradores so veem do creator dele).
- **A/B test:** Coach proativo vs reactive (pergunta "quer
  recomendacao?" vs sempre invoca) — extrair `urgency` parameter.
- **Multi-language** — block-list extensivel para ENG/PT-EN.

## Consequencias

### Positivas

- **Loop fechado** tracker → Coach → biblioteca operacional.
- **Diferenciador unico** vs concorrentes (recomendacao IN-PRODUCT
  nao OUT-PRODUCT).
- **Cache Anthropic estavel** — block-list em static block.
- **Ranking determinista** — sem dependencia de LLM scoring.
- **Analytics CTR** desde dia 1 via events.
- **Tier gating** previne abuse.
- **Audit log** — Compliance/refund support.
- **UI consistent** — card pattern reusado de `read_theme_with_linked_spots`.

### Negativas

- **Block-list mantenance** — atualizar quando concorrente muda nome.
- **Parafrase escape** — Coach pode burlar (mitigado por monitor).
- **Side-effect coupling** — tool tem efeito colateral; refactor cuidadoso.
- **Cache miss on blocklist update.**

### Neutras

- **Decisao revisitavel** — Spec 2 pode adicionar tool variants.
- **`urgency` parameter sem impacto inicial** — espacador para futuro.
- **Lesson learned a registrar:** "block-list de marcas em const
  exportada + system prompt static block + test de regressao
  cobre cache + drift".

## Confianca

**Alta.** Pattern de tool registry comprovado (ADR-023), tool result
wrapping comprovado (ADR-024), HUD stats tool comprovada (ADR-052),
cross-feature engine comprovada (ADR-068). Block-list pattern usado
por OpenAI moderation API (lista interna), Discord moderation,
Anthropic safety filters. Cache-friendly system prompt e padrao
oficial Anthropic.

## Referencias

- **Spec:** `Docs/specs/biblioteca-spec-1.md` RF-09 + RF-10 + D14 + D15
- **ADR-019:** prompt cache 2 blocos.
- **ADR-023:** tool registry pattern.
- **ADR-024:** tool result wrapping.
- **ADR-052:** HUD stats coach tool integration.
- **ADR-068:** cross-feature recommendations engine — pattern de
  pipeline server-side reusado aqui.
- **ADR-073:** entitlements model — `hasAccess` lookup.
- **Lessons learned:**
  - #4 (Vitest 4 test.projects) — tool tests em node project.
  - #5 (`vi.fn()` constructor pitfall) — mock SDK nao se aplica aqui.
  - #9 (try/catch generico engole erros) — side-effect events log antes
    de fallback.
  - #10 (DRY de prompts) — block-list em uma const, cache estavel.
  - #11 (default minimo) — 0 lessons = `ok: true + lessons: []`, UI
    nao "ajuda".
- **Diagramas Mermaid:**
  - `Docs/architecture/diagrams/biblioteca/flow-coach-recommend-lesson.mermaid`
    — sequence Coach → tool → DB → UI.
- **Out of scope:** automatic invoke from stats trigger (Spec 2),
  cross-language block-list (futuro), marketplace creator filter
  (Spec 6).
