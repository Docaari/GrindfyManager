# ADR-115: Prompt cache strategy para Coach Lesson Recommendations

## Status
Aceito

## Data
2026-05-03

## Contexto

O cron semanal (ADR-112) chama Anthropic Claude **1 vez por user**. Para 1000
users:
- Sem cache: 1000 × ~3000 tokens = 3M tokens/semana só de prompt input.
- Com cache: 1000 × ~300 tokens = 300k tokens/semana (10× menos).

A diferença de custo eh significativa. Anthropic prompt cache (em produção
desde 2024) oferece 90% de desconto em cache hits, com TTL de 5min (default).

A spec (RF-03) declara prompt cache obrigatorio. Este ADR define **exatamente o
que cachear** e **como estruturar os blocos** para garantir hit rate > 90%
durante a janela do cron semanal.

Componentes do prompt:
1. **System prompt** — texto longo, estavel entre todos users da semana
   (estavel inter-semanas tambem, mas catalog muda toda semana).
2. **Catalog lessons** — lista de ate 200 lessons publicadas, formatada como
   markdown. Estavel entre users da mesma semana, muda quando admin publica
   lesson nova.
3. **User input (leaks + analytics + profile)** — varia por user. Nunca
   cacheable.

Janela do cron: ~85min worst case (1000 users × 5s medio). TTL default da
Anthropic cache = 5min. Com cron sequencial sem pausa, cada call refresca o
cache (cada hit estende o TTL para mais 5min). Logo, cache deve permanecer
quente toda a janela.

## Opcoes Consideradas

### Opcao 1: Cache 100% via 2 blocos `cache_control: ephemeral` (escolhido)
Estrutura:
```
[system prompt] ← bloco 1, cache_control ephemeral
[catalog markdown] ← bloco 2, cache_control ephemeral
[user input dinamico] ← sem cache
```

- **Pros:**
  - Hit rate > 90% apos 1o user.
  - Padrao oficial Anthropic SDK (suportado em todos os modelos Claude 3+).
  - System + catalog sao naturalmente estaveis na semana.
- **Contras:**
  - Bloco catalog deve estar antes do bloco user input (cache eh prefix-based).
  - Mudancas no system prompt OU no catalog invalidam o cache. Aceitavel
    porque ambos sao estaveis durante o cron.

### Opcao 2: Cache 1h (extended)
- **Pros:** TTL maior reduz risco de cache-cold.
- **Contras:**
  - Anthropic extended cache (1h) custa 2x mais por miss. Para nosso pattern
    (cron sequencial + 5min TTL refrescado por hit), default 5min ja eh
    suficiente.
  - Sem ganho real.

### Opcao 3: Cache no nivel do servico (Redis externo)
- **Pros:** controle local.
- **Contras:**
  - Cache Anthropic (90% discount) eh transparente. Cache local nao economiza
    tokens — eles ainda viajam.
  - Complexidade desnecessaria.

### Opcao 4: Sem cache (paga full token cost)
- **Contras:** custo absurdamente maior.

## Decisao

**Opcao 1 — 2 blocos `cache_control: ephemeral`** com a estrutura abaixo.

### Estrutura final do prompt

```ts
const messages = await client.messages.create({
  model: process.env.COACH_MODEL ?? "claude-3-5-sonnet-latest",
  max_tokens: 200,
  system: [
    {
      type: "text",
      text: getCoachLessonRecommendationSystemPrompt(),
      cache_control: { type: "ephemeral" },
    },
  ],
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: formatCatalogForPrompt(catalogLessons),
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: formatUserContextForPrompt({
            leaks,
            analytics,
            activeProfile,
            lastConsumedLessonIds,
          }),
        },
      ],
    },
  ],
});
```

### Garantias

1. **System prompt isolado em arquivo dedicado:** `server/coach/prompts/lessonRecommendation.ts`
   exporta `getCoachLessonRecommendationSystemPrompt(): string`. **Nao usar**
   `getCoachSystemPrompt('technical')` direto porque essa funcao injeta
   ferramentas e contexto de chat — adiciona ruido + invalida cache (string
   diferente).

2. **Lesson catalog formatado de forma deterministica:**
   - Ordem estavel: `ORDER BY lesson.createdAt DESC, lesson.id`.
   - Cap 200 lessons.
   - Cada lesson em uma linha com formato `- {id} — {title} — {courseTitle} —
     [{tags joined}]`.
   - Funcao `formatCatalogForPrompt(lessons: CatalogLesson[]): string` pura,
     deterministica.
   - **Hash da string completa** loggada na primeira chamada do cron por
     semana (`console.info("coach.cron.weekly_rec.catalog_hash", { sha256 })`)
     para verificar estabilidade.

3. **System prompt versionado:** quando atualizar o system, registrar versao
   no proprio arquivo (`// version: 2026-05-03-v1`). Mudanca de versao
   invalida cache mas eh esperado (1 cron rodando = 1 cache miss + 999 hits).

4. **User context fora do cache:**
   - `formatUserContextForPrompt` gera string com leaks, analytics, profile.
   - Esta string SEMPRE difere por user — colocar em ultimo bloco SEM
     `cache_control`.

### Validacao em runtime

Apos cada call, logar metricas Anthropic:
```ts
console.info("coach.cron.weekly_rec.tokens", {
  userId,
  inputTokens: response.usage.input_tokens,
  cacheCreationInputTokens: response.usage.cache_creation_input_tokens,
  cacheReadInputTokens: response.usage.cache_read_input_tokens,
  outputTokens: response.usage.output_tokens,
});
```

Esperado:
- Primeiro user: `cache_creation_input_tokens > 2000`,
  `cache_read_input_tokens = 0`.
- Users 2..N: `cache_creation_input_tokens = 0`,
  `cache_read_input_tokens > 2000`.

Se hit rate < 90%, investigar:
- Catalog mudou no meio do cron (admin publicou lesson)? — improvavel as 06h
  segunda. Mitigacao: snapshot do catalog no inicio do cron.
- System prompt formatado de forma nao-deterministica?

### Cache invalidation strategy

Cache da Anthropic eh ephemeral (5min TTL, refrescado a cada hit). Sem acao
manual necessaria. Em caso de mudanca grande no system prompt:
1. Atualizar versao no comentario do arquivo.
2. Deploy.
3. Proxima execucao do cron paga 1 cache miss adicional (~3000 tokens × 1
   user). Aceitavel.

### Cap de catalog (200 lessons)

200 lessons × ~30 tokens/lesson media = 6000 tokens. Junto com system (~1500
tokens) = 7500 tokens cacheados. Custo de cache write = 1.25x normal price uma
vez, mas pago apenas no primeiro user da semana.

Quando catalogo crescer alem de 200 lessons (improvavel no MVP), implementar
estrategia de **cap por relevancia**:
- Filtrar lessons que combinam com leaks do user antes de passar ao Coach
  (reduz catalog para ~50 lessons).
- Trade-off: perde generalidade do Coach mas economiza tokens.
- Re-avaliar quando catalogo passar de 200.

### Fallback se cache falhar

Se Anthropic API retornar erro relacionado a cache (raro, mas documentado),
re-tentar 1x sem `cache_control`. Se ainda falhar, ir para Tier 2 do fallback
(ADR-113).

## Consequencias

**Positivas:**
- Custo Anthropic reduzido em ~85-90% no cron semanal.
- System prompt isolado eh mais facil de versionar e revisar.
- Catalog formatado deterministicamente garante cache hit estavel.
- Logging de tokens permite monitoramento facil de cache health.

**Negativas:**
- Catalog grande (>200 lessons) exige nova estrategia. Documentado migration
  path.
- Mudanca de system prompt invalida cache. Custo aceitavel (1 miss extra/semana).

**Neutras:**
- Cron continua sequencial — cada call refresca o cache, mantendo TTL ativo.
- Anthropic pode mudar pricing/TTL de cache no futuro. Re-avaliar quando
  acontecer.

## Confianca
Alta — pattern oficial documentado em
https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching e ja
usado em outros pontos do sistema (Coach chat principal).
