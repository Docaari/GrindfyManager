# ADR-113: Algoritmo Coach + tiers de fallback determinista

## Status
Aceito

## Data
2026-05-03

## Contexto

O servico `recommendLessonForUser` precisa retornar **sempre uma recomendacao
plausivel** ou `null` (caso catalog esteja vazio). Coach IA via Anthropic eh a
fonte preferida, mas pode falhar por:

- Rate limit / quota Anthropic exausta.
- Timeout > 30s.
- JSON malformado (LLM as vezes retorna texto + JSON).
- `lesson_id` retornado nao pertence ao catalog (alucinacao).
- `reason` em ingles ao inves de pt-BR (R10 da spec).
- Anthropic API down (outage).
- Catalog menor que 1 lesson (cold start da Biblioteca).

Tambem ha cenarios onde **nao vale a pena chamar Anthropic**:

- User recem-cadastrado (< 7 dias, R1 da spec): zero leaks + zero analytics =
  reasoning genrico/alucinado. Custo desnecessario.
- User sem nenhum leak detectado E volume zero na semana.

A questao: **qual ordem de tentativas e qual o nivel minimo de "recomendacao
util"?**

Founder confirmou:
> Coach IA → leak→tag map → popular randomizado → null/empty state.

## Opcoes Consideradas

### Opcao 1: Tier unico (Coach OR null)
- **Pros:** simples.
- **Contras:** outage Anthropic = nenhum user recebe rec. Card sempre vazio.
  Inaceitavel.

### Opcao 2: Tiers em camadas com fallback determinista (escolhido)
- **Pros:** sempre retorna algo (exceto catalog vazio). Resiliente a outage.
  Custo controlavel via short-circuit.
- **Contras:** mais codigo. Mitigado por testes deterministas.

### Opcao 3: ML-based ranking puro (sem Coach IA)
- **Pros:** previsivel, barato.
- **Contras:** sem reasoning natural. "Por que essa licao?" vira template.
  Perde valor diferencial do Coach IA. Fora do escopo MVP.

### Opcao 4: Embeddings + cosine similarity (leak description ↔ lesson description)
- **Pros:** matching semantico bom.
- **Contras:** infraestrutura nova (vector DB ou embeddings cache). Fora do
  MVP. Possivel evolucao futura.

## Decisao

**Opcao 2 — fallback em 4 tiers**, executados em ordem ate o primeiro retornar
um `lessonId` valido:

### Tier 0 — Short-circuit "user sem dados" (R1)

**Condicao:**
```ts
analytics.last7DaysVolume === 0 && leaks.length === 0
```

**Acao:** pular Tier 1 (Coach IA) e ir direto para Tier 3 (popular). Source =
`'fallback_popular'`. Reason template: "Conteudo mais consumido pelos
jogadores essa semana — comece por aqui."

**Justificativa:** sem leaks + sem analytics, Coach gera reasoning generico
("voce deveria estudar fundamentos"). Custo desperdicado. Popular randomizado
eh mais util.

### Tier 1 — Coach IA (preferido)

**Input passado ao Coach:**
```ts
{
  leaks: top 5 (CoachLeakSummary com code + severity + description),
  analytics: { last7DaysRoi, last7DaysVolume, last7DaysProfit, last30DaysRoi },
  activeProfile: 'A' | 'B' | 'C' | null,
  catalogLessons: top 200 lessons publicadas
    excluindo lastConsumedLessonIds (ate 10 ultimas concluidas),
}
```

**System prompt:** versao enxuta de `getCoachSystemPrompt('technical')` SEM
ferramentas — apenas texto. Cache_control aplicado (ADR-115).

**User prompt:** estruturado, pede explicitamente JSON:
```
Voce eh o Coach IA do Grindfy. Escolha 1 licao do catalogo abaixo
que melhor atenda ao leak prioritario do jogador. Considere o perfil
ativo {A|B|C} e o ROI dos ultimos 7 dias.

Leaks ativos: ...
Analytics 7d: ROI X%, Volume Y, Profit Z
Perfil ativo: A

Catalogo (200 licoes):
- lesson_abc — "Defesa de BB contra 3bet" — fundamentos, bb-defense
- lesson_def — "ICM na bolha" — ICM, bubble, mtt
...

Responda APENAS um JSON valido (sem prosa antes ou depois):
{ "lesson_id": "...", "reason": "..." }

Regras do reason: pt-BR, 1-2 frases, max 240 chars, conversacional.
```

**Validacao do output:**
1. `JSON.parse` em try/catch — se falhar, vai para Tier 2.
2. `lesson_id` deve existir em `catalogLessons` — se nao, vai para Tier 2.
3. `reason` deve ter 20-240 chars — se exceder, trunca com `...`. Se < 20,
   substitui por reason fallback template.
4. `reason` em ingles (heuristica: contem "you should", "the lesson", "is
   recommended") → re-prompt 1x. Se ainda em ingles, vai para Tier 2.

**Sucesso:** `source = 'coach'`.

### Tier 2 — Fallback leak→tag (deterministico)

**Pre-requisito:** existe pelo menos 1 leak com `severity === 'high'` OU
`severity === 'medium'`.

**Algoritmo:**
1. Pegar leak prioritario (severity high primeiro, depois medium, primeiro da
   lista se empate).
2. `tags = getTagsForLeakCode(leak.code)` (ver `server/coach/leakToTag.ts` —
   ADR-114).
3. Filtrar `catalogLessons` onde `lesson.tags ∩ tags !== ∅` OR
   `lesson.categoryId === tags[0]`.
4. Excluir `lastConsumedLessonIds`.
5. Se candidatos > 1, escolher o **primeiro** (estavel, deterministico).
6. Se zero candidatos, vai para Tier 3.

**Sucesso:** `source = 'fallback_leak_tag'`. Reason template:
`"Sugestao alinhada ao seu leak '{leak.description}'."` (240 char limit).

### Tier 3 — Fallback popular (com seed-randomizacao por user/semana)

**Algoritmo:**
1. `popularIds = await storage.getMostPopularLessonIds({ sinceDays: 30, limit: 10 })`
   — query agregada em `library_events` com `event_type = 'complete'`.
2. Excluir `lastConsumedLessonIds`.
3. Se restar pelo menos 1: pickar via seed deterministico
   `(userId + weekStartDate) → indice`. Garante diversidade entre users mas
   estabilidade por semana (re-rodar cron na mesma segunda escolhe a mesma).
4. Se zero candidatos, vai para Tier 4.

**Sucesso:** `source = 'fallback_popular'`. Reason template:
`"Conteudo mais consumido pelos jogadores nas ultimas semanas."`

**Seed-randomization (R5 da spec):** evita que 80% dos users free recebam
sempre a mesma lesson. Algoritmo:
```ts
function pickWithSeed<T>(items: T[], seed: string): T {
  const hash = sha256(seed).slice(0, 8); // hex
  const index = parseInt(hash, 16) % items.length;
  return items[index];
}
const lesson = pickWithSeed(popularIds, `${userId}-${weekStart.toISOString()}`);
```

### Tier 4 — Fallback recente (R7 da spec)

**Pre-requisito:** Tiers 1-3 falharam (catalog popular vazio porque Biblioteca
recem-lancada).

**Algoritmo:**
1. `recentIds = await storage.getCatalogLessonsForRecommendation({ limit: 10, orderBy: 'createdAt DESC' })`.
2. Excluir `lastConsumedLessonIds`.
3. Pickar via seed `(userId, weekStartDate)`.

**Sucesso:** `source = 'fallback_recent'`. Reason template:
`"Adicao recente ao catalogo — vale conferir."`

### Tier 5 — Null

Se tier 4 tambem retorna vazio (catalog literalmente vazio), retornar `null`.
Frontend trata como empty state "Sua recomendacao desta semana ainda nao foi
gerada — confira a Biblioteca".

### Diagrama de decisao

Ver `Docs/architecture/coach-recommendation-flow.mermaid`.

## Consequencias

**Positivas:**
- Sempre retorna algo (exceto catalog vazio absoluto).
- Outage Anthropic NAO derruba a feature. Tier 2-4 sao deterministicos e
  baratos.
- Tier 0 economiza custo Anthropic em cold-start de user.
- Seed-randomization (R5) garante diversidade no fallback popular.
- Source granular (`coach` vs `fallback_leak_tag` vs `fallback_popular` vs
  `fallback_recent`) permite analise pos-fato: "qual % das recs vem do Coach
  vs fallback?".

**Negativas:**
- Mais branches de codigo. Mitigado por testes determinsticos por tier
  (test-writer).
- `getTagsForLeakCode` depende de mapping mantido em codigo (ADR-114). Pode
  divergir dos codigos reais que `detectLeaks` emite. Mitigado por audit em
  `server/coachLeakDetection.ts` antes do test-writer.

**Neutras:**
- Tier 4 (recent) eh raro — so dispara em Biblioteca recem-lancada. Aceitavel
  como ultimo recurso.
- Reason templates fixos para tiers 2-4 sao em pt-BR mas curtos. Aceitavel; a
  diferenciacao real esta no Coach IA tier.

## Confianca
Alta — algoritmo simples com fallback chain bem testado em outros sistemas
(Netflix recommender fallback, Spotify Discover Weekly).
