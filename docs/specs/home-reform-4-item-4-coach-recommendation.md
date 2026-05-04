# Sub-Spec: home-reform-4 / Item 4 — Recomendacao de Licao Coach IA Semanal

## Status
Proposta

## Resumo Executivo

Substituir o card `LibraryResume` ("Continue assistindo") na zona "Acao Imediata" da Home por um novo card `CoachRecommendationCard` que mostra **uma unica recomendacao de licao** gerada pelo Coach IA na segunda-feira de cada semana (06:00 BRT). A recomendacao e baseada nos dados de performance da semana anterior do user (leaks detectados, ROI, volume, perfil ativo) e usa a Biblioteca (`library_lessons`) como catalogo de licoes elegiveis. O CTA do card depende do entitlement do user — se ja tem acesso, "Assistir agora"; se nao, "Ver detalhes / Comprar". O card respeita o ciclo: 1 recomendacao por semana, dismissivel ou consumivel, com reset toda segunda 06:00 BRT.

Sub-spec necessaria porque: (a) introduz nova tabela + cron novo + 3 endpoints + componente frontend novo; (b) decisao algoritmica sensivel (Coach + fallback) merece ADR dedicado; (c) toca 3 dominios distintos (Coach, Biblioteca, Home).

---

## Objetivos

1. Remover totalmente o `LibraryResume` da Home (Onda 4 item 4) — feature considerada quebrada pelo founder.
2. Entregar **1 recomendacao curada por semana** que seja relevante ao momento real do user (leaks ativos, fase do mes, perfil ativo).
3. Usar Biblioteca como acervo de licoes elegiveis — reaproveita `library_lessons`, `user_lesson_access`, `library_progress`, `library_events`.
4. Marcar conversao (consume) e desconforto (dismiss) para feedback de relevancia futura.
5. Permitir que licoes sem acesso liberado virem **sugestao de compra** (pull comercial alinhado a leak real).
6. Manter o cron simples: 1 job semanal, idempotente, sem retry agressivo.

## Nao-Objetivos

- NAO criar tabela `coach_weekly_reports`. Esta sub-spec deliberadamente reaproveita o que ja existe (`coachLeakDetection.detectLeaks` + analytics agregadas inline) em vez de persistir um snapshot de relatorio. Se um relatorio formal for necessario depois, e refactor separado.
- NAO recomendar mais de 1 licao por semana. Multipla recomendacao e backlog (proximo onda).
- NAO permitir trocar a recomendacao por "outra opcao" no MVP — apenas dismiss + esperar proxima segunda.
- NAO enviar push notification / email com a recomendacao. Apenas card in-app.
- NAO fazer scoring estatistico de relevancia (ICE, embeddings). Coach decide via LLM call. Fallback e simples (popular + ainda nao consumido).
- NAO suportar multi-idioma. Tudo PT-BR.

---

## Requisitos Funcionais

### RF-01 — Tabela `coach_lesson_recommendations`

**Descricao:** Persistir cada recomendacao gerada (1 por user por semana) com auditabilidade (quem gerou, quando, a justificativa, e os ciclos de consumo/dismiss).

**Schema (Drizzle):**

```ts
export const coachLessonRecommendations = pgTable(
  "coach_lesson_recommendations",
  {
    id: varchar("id").primaryKey().notNull(),                     // nanoid
    userId: varchar("user_id").notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    lessonId: varchar("lesson_id").notNull()
      .references(() => libraryLessons.id, { onDelete: "cascade" }),
    weekStartDate: date("week_start_date").notNull(),             // segunda-feira (BRT) que iniciou o ciclo
    reason: text("reason").notNull(),                             // 1-2 frases — justificativa Coach
    source: varchar("source", { length: 20 }).notNull(),          // 'coach' | 'fallback_popular' | 'manual'
    inputSummary: jsonb("input_summary"),                         // { leaks: CoachLeakSummary[], roi, volume, profile, sampleSize } — auditoria
    chatSessionId: varchar("chat_session_id"),                    // opcional, FK soft p/ chat_sessions caso Coach abra discussion
    createdAt: timestamp("created_at").defaultNow().notNull(),
    dismissedAt: timestamp("dismissed_at"),                       // null ate user dismiss
    consumedAt: timestamp("consumed_at"),                         // null ate user consumir
  },
  (t) => [
    uniqueIndex("uq_coach_rec_user_week").on(t.userId, t.weekStartDate),  // 1 rec/semana garantido
    index("idx_coach_rec_user_active").on(t.userId, t.dismissedAt, t.consumedAt),
    index("idx_coach_rec_lesson").on(t.lessonId),
  ],
);
```

**Regras:**
- `(userId, weekStartDate)` UNIQUE — NAO inserir duas recs para mesmo user na mesma semana, mesmo se cron for re-disparado.
- `weekStartDate` sempre = segunda-feira da semana corrente (em fuso BRT). Calculado por helper `getCurrentWeekStartBRT()`.
- `source` enum logico: `'coach'` (Anthropic respondeu) | `'fallback_popular'` (LLM falhou ou usuario sem dados) | `'manual'` (admin gerou via UI futura).
- `inputSummary` = JSONB com snapshot do que foi mostrado ao Coach. Permite auditoria + replay caso a recomendacao pareca errada.
- `chatSessionId` opcional — se quiser que clicar em "Discutir com o Coach" abra a conversa que gerou (fora de escopo no MVP, mas coluna ja prevista).

**Criterio de aceitacao:**
- [ ] Migration SQL versionada (proxima disponivel apos a ultima).
- [ ] Tabela criada com 8 colunas + 3 indices.
- [ ] Insert duplicado (mesmo `(userId, weekStartDate)`) retorna constraint violation.
- [ ] FK `userId` cascade-delete ao deletar user; FK `lessonId` cascade-delete ao deletar licao.
- [ ] `inputSummary` aceita JSONB arbitrario; default `null`.

---

### RF-02 — Cron job `generateCoachRecommendations` (segunda 06:00 BRT)

**Descricao:** Cron in-process (node-cron) que toda segunda-feira 06:00 America/Sao_Paulo itera users elegiveis e gera 1 recomendacao por user.

**Localizacao:** `server/coach/jobs/generateCoachRecommendations.ts` + registro em `server/coach/cronRunner.ts` (mesmo padrao dos outros jobs Coach `processBSnapshot` e `processBStudy`).

**Cron expression:** `0 6 * * 1` com `timezone: "America/Sao_Paulo"`.

**Filtro de users elegiveis:**
- `subscriptionPlan IN ('free', 'pro', 'premium')` — todos os planos pagos + free (free tambem ve o card de "sugestao de compra").
- `is_active = true` (ou seja, usuario nao desativado/banido).
- DEVE iterar via `storage.listUsersForCron(...)` (helper ja existente; ver `processBSnapshot.ts:29`).

**Regras de execucao por user:**
1. Calcular `weekStartDate` = segunda atual em BRT.
2. Verificar via `getCoachRecommendationByUserAndWeek(userId, weekStartDate)` — se ja existe, **pular** (idempotente).
3. Coletar input do Coach:
   - `leaks` = `await detectLeaks(userId, { minSeverity: 'low' })` (top 5).
   - `analyticsByPeriod` = ROI + volume + profit dos ultimos 7 dias (helper `storage.getPerformanceByPeriod` ja existe).
   - `activeProfile` = `userProfile.activeProfile` (A/B/C — ver coachContext).
   - `lastConsumedLessonIds` = ultimas 10 licoes consumidas pelo user via `library_progress` (filtro `completedAt IS NOT NULL`).
   - `accessibleLessonIds` = lessons em `user_lesson_access` para o user.
4. Chamar `recommendLessonForUser({ userId, leaks, analytics, profile, accessibleIds, lastConsumedIds })` (servico novo — ver RF-03).
5. Se servico retornar `{ lessonId, reason, source, chatSessionId? }`, inserir registro.
6. Se retornar `null` (sem licoes elegiveis OU coach + fallback ambos vazios), **nao inserir nada**. Frontend mostra empty state "Sem recomendacao essa semana — confira a Biblioteca".
7. Em caso de erro, log `console.error("coach.cron.weekly_rec.user.error", { userId, err })` e continua proximo user.
8. Final: log agregado `console.info("coach.cron.weekly_rec.done", { generated, skipped, errors })`.

**Janela de execucao:**
- Tempo limite por user: 30s (Anthropic timeout).
- Sequencial (nao paralelo) no MVP — segue padrao dos outros crons Coach.

**Override de execucao manual:**
- Endpoint admin `POST /api/admin/coach/recommendations/regenerate?userId=X&weekStart=YYYY-MM-DD` (RF-08) que dispara `generateForUser(userId, weekStart)` — util para QA + correcao caso recomendacao saia ruim.

**Activation guard:**
- Mesmo guard dos outros crons Coach: `NODE_ENV === 'production' || COACH_CRON_ENABLED === 'true'`.
- Em dev (sem flag), cron nao registra. Endpoint admin manual continua funcional (independente).

**Criterio de aceitacao:**
- [ ] Cron registrado em `server/coach/cronRunner.ts` com expr `0 6 * * 1` + tz `America/Sao_Paulo`.
- [ ] Funcao `generateCoachRecommendationsTick({ now? })` exportada e testavel.
- [ ] Idempotencia: rodar 2x na mesma segunda nao gera duplicata (UNIQUE garante; cron deve chegar com cedo-skip).
- [ ] Iteracao por user nao bloqueia em erro de um user — try/catch por iteracao.
- [ ] Em ambiente sem `COACH_CRON_ENABLED`, cron nao registra (log `coach.cron.disabled`).

---

### RF-03 — Servico `recommendLessonForUser` (algoritmo Coach + fallback)

**Descricao:** Servico novo em `server/coach/recommendLessonForUser.ts` que:
1. Tenta gerar recomendacao via Anthropic Claude (Coach Tournament + Technical mix).
2. Se falhar (rate limit, timeout, JSON malformado, lesson_id invalido), aplica fallback determinista.
3. Retorna `{ lessonId, reason, source, chatSessionId? } | null`.

**Input:**
```ts
interface RecommendInput {
  userId: string;
  leaks: CoachLeakSummary[];      // ate 5 (CoachLeakSummary do coachLeakDetection.ts)
  analytics: {
    last7DaysRoi: number;
    last7DaysVolume: number;
    last7DaysProfit: number;
    last30DaysRoi: number;
  };
  activeProfile: 'A' | 'B' | 'C' | null;
  accessibleLessonIds: string[];   // lessons que o user JA tem acesso
  lastConsumedLessonIds: string[]; // ultimas 10 lessons concluidas (excluir)
  catalogLessons: Array<{          // todas lessons publicadas (cap 200, ordenadas por createdAt)
    id: string;
    title: string;
    courseTitle: string;
    moduleTitle: string;
    categoryId: string;
    tags: string[];
    learningObjectives: string[];   // ja extraidos via Biblioteca-2
    durationSeconds: number | null;
  }>;
}
```

**Algoritmo Coach (preferido):**
1. Montar prompt user + system. System reusa `getCoachSystemPrompt('technical')` enxuto (sem ferramentas — apenas geracao de recomendacao).
2. Prompt user instrui Coach a escolher 1 `lessonId` do `catalogLessons` (excluindo `lastConsumedLessonIds`) que melhor atenda o leak prioritario do user, considerando o `activeProfile`.
3. Coach DEVE responder em JSON estruturado: `{ "lesson_id": "...", "reason": "..." }` (1-2 frases, max 240 chars).
4. Validar:
   - `lesson_id` existe em `catalogLessons` (caso contrario, tratar como falha).
   - `reason` tem 20-240 chars.
5. Se sucesso: `source = 'coach'`.
6. Cache: prompt-cache da Anthropic deve ser usado para system + catalogLessons (sao estaveis na semana). Reduce custo. Ver lesson `claude-api` skill — adicionar `cache_control` em system + 1o bloco de user message.

**Fallback determinista (se Coach falhar):**
1. Filtrar `catalogLessons` excluindo `lastConsumedLessonIds`.
2. Se houver leak `severity = 'high'`, buscar lesson cuja `categoryId` ou `tags` contem o codigo do leak (ex: leak `OVERFOLD_BB` → lesson com tag `bb-defense`). Mapping leak→tag em `server/coach/leakToTag.ts` (artefato novo, ver RF-04).
3. Se nao encontrar match, escolher a lesson mais popular dos ultimos 30 dias (ranking via `library_events` com `event_type = 'complete'`).
4. Se ainda assim vazio, retornar `null` (sem recomendacao — frontend trata empty state).
5. `source = 'fallback_popular'` em qualquer caminho de fallback.
6. `reason` = template fixo: `"Sugestao popular alinhada ao seu leak {LEAK_CODE}."` ou `"Conteudo mais consumido pelos jogadores essa semana."`.

**Output:**
```ts
{
  lessonId: string;
  reason: string;
  source: 'coach' | 'fallback_popular';
  chatSessionId?: string; // futuramente — se quisermos que reason vire chat
} | null
```

**Criterio de aceitacao:**
- [ ] Funcao `recommendLessonForUser(input)` exportada e testavel sem chamar Anthropic real (mock).
- [ ] Quando Coach retorna `lesson_id` invalido (nao esta em catalog), funcao tenta fallback automaticamente.
- [ ] Fallback **nunca** retorna lesson em `lastConsumedLessonIds`.
- [ ] Fallback de leak→tag e deterministico (mesma input = mesma output).
- [ ] Quando catalog tem 0 lessons publicadas, retorna `null` sem crashar.
- [ ] `reason` final no insert nunca excede 240 chars (truncar com `...` se necessario).
- [ ] Prompt cache habilitado (validar via review do claude-api skill).

---

### RF-04 — Mapeamento leak→tag (`server/coach/leakToTag.ts`)

**Descricao:** Tabela estatica em codigo que mapeia codigos de leak (do `coachLeakDetection`) para tags de licao da Biblioteca. Usado pelo fallback determinista (RF-03).

**Estrutura:**
```ts
export const LEAK_TO_TAGS: Record<string, string[]> = {
  // exemplos — ajustar com base nos codigos reais que detectLeaks emite
  EARLY_FINISH_HIGH: ['ICM', 'short-stack', 'bubble'],
  CRAVADAS_LOW: ['final-table', 'heads-up', 'closer'],
  ROI_NEGATIVE_TURBO: ['turbo-strategy', 'shove-fold'],
  ROI_NEGATIVE_HYPER: ['hyper-strategy', 'push-fold'],
  // catch-all para leaks nao mapeados
  DEFAULT: ['fundamentos', 'gestao-mental'],
};
```

**Regras:**
- Pesquisa caso-insensitive de codigo.
- Quando codigo nao esta no mapa, usa `DEFAULT`.
- Pode evoluir sem migration (e arquivo TS).

**Criterio de aceitacao:**
- [ ] Arquivo TS com `LEAK_TO_TAGS` exportado.
- [ ] Helper `getTagsForLeakCode(code: string): string[]` retorna `LEAK_TO_TAGS[code] ?? LEAK_TO_TAGS.DEFAULT`.
- [ ] Cobertura de teste para os 4 codigos mais frequentes que `detectLeaks` emite hoje (auditar `coachLeakDetection.ts` antes do test-writer codificar).

---

### RF-05 — Endpoint `GET /api/home/coach-recommendation`

**Descricao:** Retorna a recomendacao da semana corrente para o user logado. Inclui dados da licao + entitlement check + status de consumo/dismiss.

**Auth:** `requireAuth`.

**Localizacao:** `server/routes/home-coach-recommendation.ts` (novo arquivo). Registrar em `server/routes/index.ts`.

**Logica:**
1. `userId = req.user.userPlatformId`.
2. `weekStartDate = getCurrentWeekStartBRT()`.
3. Buscar `rec = storage.getCoachRecommendationByUserAndWeek(userId, weekStartDate)`.
4. Se `rec` nao existe → resposta `{ recommendation: null, weekStartDate }` com status 200.
5. Se `rec.dismissedAt != null` OR `rec.consumedAt != null` → resposta `{ recommendation: null, status: rec.dismissedAt ? 'dismissed' : 'consumed', weekStartDate }`.
6. Senao, hidratar com lesson + entitlement:
   - `lesson = storage.getLibraryLessonById(rec.lessonId)` (titulo, cover, format, duration, course/module titles).
   - `hasAccess = storage.hasLessonAccess(userId, rec.lessonId)`.
7. Resposta JSON:
```json
{
  "weekStartDate": "2026-05-04",
  "recommendation": {
    "id": "rec_...",
    "lessonId": "lesson_...",
    "lessonTitle": "...",
    "courseTitle": "...",
    "moduleTitle": "...",
    "coverImageUrl": "...",
    "format": "video|podcast|article",
    "durationSeconds": 1800,
    "category": "preflop",
    "reason": "...",
    "source": "coach|fallback_popular",
    "createdAt": "2026-05-04T09:00:00Z",
    "hasAccess": true,
    "ctaTarget": "/biblioteca/lesson/lesson_...?source=home-coach-rec",
    "ctaLabel": "Assistir agora" // ou "Comprar acesso"
  },
  "status": "active"
}
```
8. Cache headers: `Cache-Control: private, max-age=60` (recomendacao muda no maximo 1x/semana).

**Criterio de aceitacao:**
- [ ] Endpoint responde 200 com `{ recommendation: null }` quando nao ha rec na semana.
- [ ] Endpoint responde 200 com `recommendation` populado quando ativa.
- [ ] `hasAccess` correto via `storage.hasLessonAccess`.
- [ ] `ctaLabel` = "Assistir agora" se `hasAccess && format === 'video'`; "Ouvir agora" se `format === 'podcast'`; "Ler agora" se `format === 'article'`; "Comprar acesso" se `!hasAccess`.
- [ ] `ctaTarget` para `hasAccess` aponta para `/biblioteca/lesson/{id}?source=home-coach-rec`. Para `!hasAccess`, aponta para `/biblioteca/lesson/{id}?source=home-coach-rec&intent=purchase`.
- [ ] 401 sem auth.
- [ ] Quando rec existe mas lesson foi despublicada (`isPublished = false`), responder `{ recommendation: null, status: 'lesson_unavailable' }` — frontend trata como empty.

---

### RF-06 — Endpoint `POST /api/home/coach-recommendation/:id/dismiss`

**Descricao:** Marca a recomendacao como dispensada pelo user. Card vira empty state ate a proxima segunda.

**Auth:** `requireAuth`.

**Logica:**
1. `userId = req.user.userPlatformId`.
2. Buscar `rec` por `id`.
3. Validar `rec.userId === userId` (403 se outro user).
4. Se `rec.dismissedAt` ou `rec.consumedAt` ja preenchidos, retornar 200 idempotente sem alterar.
5. Atualizar `dismissedAt = now()`.
6. Emitir tracker server-side: `tracker.emit('coach_recommendation_dismissed', { userId, lessonId, weekStartDate, source })`.
7. Resposta 200 `{ ok: true, dismissedAt }`.

**Criterio de aceitacao:**
- [ ] Dismiss e idempotente.
- [ ] User nao consegue dismissar rec de outro user.
- [ ] Apos dismiss, GET subsequente retorna `recommendation: null, status: 'dismissed'`.

---

### RF-07 — Endpoint `POST /api/home/coach-recommendation/:id/consume`

**Descricao:** Marca a recomendacao como consumida. Trigger automatico (ver abaixo) + opcao manual via botao "Marcar como vista".

**Trigger automatico (preferido):**
- Quando o user clicar em "Assistir agora" no card, frontend abre `/biblioteca/lesson/{id}?source=home-coach-rec`. A pagina de licao detecta `source=home-coach-rec` no query e dispara `POST /api/home/coach-recommendation/{recId}/consume` apos 30s de play (ou 80% de progresso, o que vier primeiro). RecId e passado via query param `?recId=...` ou resolvido no backend via `getCoachRecommendationByUserAndLesson(userId, lessonId, currentWeek)`.
- Para licao tipo `article`, scroll até 80% do conteudo dispara consume.

**Trigger manual:**
- Botao "Marcar como vista" no card (visivel apenas se `hasAccess === true`) — dispara consume direto.

**Auth:** `requireAuth`.

**Logica:**
1. Buscar rec, validar ownership.
2. Idempotente: se ja `consumedAt`, retornar 200 sem alterar.
3. Atualizar `consumedAt = now()`. NAO altera `dismissedAt`.
4. Emitir tracker: `tracker.emit('coach_recommendation_consumed', { userId, lessonId, weekStartDate, source, viaAutomatic: boolean })`.
5. Tambem emitir um `library_events` row com `event_type = 'coach_recommend'` (enum ja existe! ver schema:3582) para rastrear conversao Coach → consumo no funil Biblioteca. Payload metadata: `{ recId, source, weekStartDate }`.
6. Resposta 200 `{ ok: true, consumedAt }`.

**Criterio de aceitacao:**
- [ ] Consume e idempotente.
- [ ] User nao consegue consumir rec de outro user.
- [ ] Apos consume, GET subsequente retorna `recommendation: null, status: 'consumed'`.
- [ ] `library_events` row criada com `event_type = 'coach_recommend'`.
- [ ] Trigger automatico funciona via query param `?source=home-coach-rec` na pagina de lesson.

---

### RF-08 — Endpoint admin `POST /api/admin/coach/recommendations/regenerate`

**Descricao:** Forca regeneracao da recomendacao da semana corrente para um user especifico. Util para QA, suporte a usuario, e correcao caso a recomendacao tenha saido ruim.

**Auth:** `requireAuth` + `requirePermission('admin')`.

**Body:**
```json
{ "userId": "USER-XXXX", "weekStartDate": "2026-05-04" } // weekStartDate opcional, default = semana corrente
```

**Logica:**
1. Resolver `weekStart` (param ou semana corrente BRT).
2. Se ja existe rec para `(userId, weekStart)`, **deletar** antes de regenerar (override total).
3. Chamar `generateForUser(userId, weekStart)`.
4. Resposta: `{ ok: true, recommendation: <novo registro hidratado> }`.

**Criterio de aceitacao:**
- [ ] Apenas admin acessa.
- [ ] Regenera mesmo que ja exista (apaga antiga, gera nova).
- [ ] Audit log: `console.info("coach.admin.weekly_rec.regenerated", { adminUserId, targetUserId, weekStart })`.

---

### RF-09 — Componente `CoachRecommendationCard` (frontend)

**Descricao:** Substitui `LibraryResume` na zona "Acao Imediata" da Home. Mostra a recomendacao ativa OU empty states.

**Localizacao:** `client/src/components/home/CoachRecommendationCard.tsx`.

**Hook:**
```ts
const { data, isLoading, isError } = useQuery<CoachRecommendationResponse>({
  queryKey: ['/api/home/coach-recommendation'],
  queryFn: () => apiRequest('GET', '/api/home/coach-recommendation'),
  staleTime: 60_000,
  refetchOnWindowFocus: false,
});
```

**Estados visuais:**

1. **Loading:** skeleton card altura ~200px, mesmo footprint do LibraryResume.

2. **Sem recomendacao gerada (`recommendation === null && status === undefined/null`):**
   - Titulo: "Recomendacao da Semana"
   - Body: "Sua recomendacao desta semana ainda nao foi gerada. Volte em alguns minutos."
   - CTA secundario: link "Explorar Biblioteca" → `/biblioteca`.

3. **Ja consumida ou dispensada (`status === 'consumed' | 'dismissed'`):**
   - Titulo: "Recomendacao da Semana"
   - Body: `status === 'consumed' ? 'Ja consumida essa semana — proxima na segunda.' : 'Dispensada — proxima recomendacao na segunda.'`
   - CTA: link "Explorar Biblioteca" → `/biblioteca`.

4. **Lesson indisponivel (`status === 'lesson_unavailable'`):**
   - Titulo: "Recomendacao da Semana"
   - Body: "A licao recomendada esta temporariamente indisponivel. Aguarde a proxima segunda."

5. **Ativa (`recommendation` populada):**
   - Header: titulo "Recomendacao da Semana" + tag pequena `[Coach IA]` ou `[Sugestao Popular]` baseada em `source`.
   - Thumbnail (cover) lado esquerdo, ~120x68 desktop / 80x45 mobile.
   - Titulo da licao (2 linhas max, truncate).
   - Linha meta: `{format icon} • {duration formatado mm:ss ou "X min"} • {category}`.
   - Bloco "Por que essa licao?": `reason` em italico ou destacado, max 2 linhas.
   - CTA principal:
     - Se `hasAccess`: botao primario com `ctaLabel` ("Assistir agora" / "Ouvir agora" / "Ler agora").
     - Se `!hasAccess`: botao primario "Ver detalhes" + tag pequena "Sugestao de compra" abaixo.
   - CTA secundario: "Dispensar" (text-button) — abre confirm dialog leve "Dispensar essa recomendacao?".
   - Se `hasAccess`, mostrar tambem text-button "Marcar como vista" abaixo do CTA principal.

**Tracker:**
- `home_coach_rec_view` — 1x mount com rec ativa. Payload: `{ recId, lessonId, source, hasAccess }`.
- `home_coach_rec_cta_click` — clique no CTA principal. Payload: `{ recId, lessonId, source, hasAccess, ctaTarget }`.
- `home_coach_rec_dismiss_click` — clique no botao dispensar (antes do confirm). Payload: `{ recId }`.
- `home_coach_rec_dismiss_confirm` — confirmacao de dispensa.
- `home_coach_rec_mark_consumed_click` — clique manual em "Marcar como vista".

**Mutations:**
- `useMutation` para dismiss → POST `/api/home/coach-recommendation/:id/dismiss`. Optimistic update: setar `recommendation = null, status = 'dismissed'` no cache.
- `useMutation` para consume → POST `/api/home/coach-recommendation/:id/consume`. Optimistic update: setar `recommendation = null, status = 'consumed'`.

**Lessons aplicadas (CLAUDE.md §9):**
- #1 Hooks ANTES de early return.
- #13 `apiRequest` retorna JSON parseado, nao Response.
- #11 Default minimo: NAO inserir CTA decorativo "explorar mais" quando ha rec ativa — spec define CTAs.

**Criterio de aceitacao:**
- [ ] Componente renderiza loading skeleton enquanto query pendente.
- [ ] Renderiza estado correto para cada combinacao de `recommendation` + `status`.
- [ ] CTA principal vai para `ctaTarget` correto.
- [ ] Dismiss + consume disparam mutations + invalidam query.
- [ ] Tracker emit nas acoes acima.
- [ ] `data-testid` estaveis: `home-coach-rec-card`, `home-coach-rec-cta`, `home-coach-rec-dismiss`, `home-coach-rec-mark-consumed`, `home-coach-rec-empty`, `home-coach-rec-loading`.
- [ ] Sem regressoes nos testes do Home (DailyInsight, etc).

---

### RF-10 — Substituicao no `Home.tsx`

**Descricao:** Remover import + uso de `LibraryResume` em `client/src/pages/Home.tsx` linha 38 e linha 360. Adicionar `CoachRecommendationCard` no mesmo lugar.

**Diff esperado:**
```diff
- import LibraryResume from '@/components/home/LibraryResume';
+ import CoachRecommendationCard from '@/components/home/CoachRecommendationCard';

  ...
- <LibraryResume />
+ <CoachRecommendationCard />
```

**Decisao adicional:** Deletar `client/src/components/home/LibraryResume.tsx` + endpoint `server/routes/library-continue.ts` + storage methods `getContinueWatching` se NAO houver outros consumidores.
- Antes de deletar, rodar `Grep` para `LibraryResume`, `library/continue`, `getContinueWatching`. Se outros consumidores existirem (ex: pagina de Biblioteca usa `/api/library/continue` para "continue assistindo na pagina"), MANTER o endpoint mas remover o componente Home.

**Criterio de aceitacao:**
- [ ] `Home.tsx` nao importa `LibraryResume`.
- [ ] `CoachRecommendationCard` esta na mesma posicao do grid (zona Acao Imediata, coluna direita).
- [ ] Layout responsivo nao quebra.
- [ ] Se `LibraryResume` for deletado, nenhum import quebrado em outros arquivos.

---

### RF-11 — Storage methods novos

**Descricao:** Novos metodos em `server/storage.ts` para suportar todas operacoes acima.

**Methods:**
1. `getCoachRecommendationByUserAndWeek(userId, weekStartDate): Promise<CoachLessonRecommendation | null>`.
2. `getCoachRecommendationById(id): Promise<CoachLessonRecommendation | null>`.
3. `createCoachRecommendation(payload): Promise<CoachLessonRecommendation>`.
4. `dismissCoachRecommendation(id): Promise<void>`.
5. `consumeCoachRecommendation(id): Promise<void>`.
6. `deleteCoachRecommendation(id): Promise<void>` (admin override).
7. `hasLessonAccess(userId, lessonId): Promise<boolean>` — verificar se ja existe (Biblioteca-1 deve ter implementado). Se nao, criar.
8. `getLibraryLessonById(lessonId): Promise<LibraryLessonWithMeta | null>` — provavelmente ja existe.
9. `getCatalogLessonsForRecommendation(opts: { limit: number }): Promise<CatalogLesson[]>` — retorna lessons publicadas com metadata enxuta para passar ao Coach (RF-03 input `catalogLessons`).
10. `getLastConsumedLessonIds(userId, limit): Promise<string[]>` — para excluir.
11. `getMostPopularLessonIds(opts: { sinceDays: number, limit: number }): Promise<string[]>` — fallback popular.

**Criterio de aceitacao:**
- [ ] Todos os 11 metodos existem em `storage.ts` ou ja existiam previamente.
- [ ] Cada metodo testado isoladamente (unit ou integration).
- [ ] `getCatalogLessonsForRecommendation` cap default = 200 lessons (limita prompt size).

---

### RF-12 — Helper `getCurrentWeekStartBRT()`

**Descricao:** Helper TS que retorna a `Date` representando a segunda-feira 00:00:00 da semana corrente em fuso `America/Sao_Paulo`.

**Localizacao:** `server/coach/weekHelper.ts` (novo) ou `shared/lib/dateUtils.ts` (compartilhado).

**Comportamento:**
- Input opcional `now: Date` (default `new Date()`).
- Output `Date` (UTC iso interno) que corresponde a segunda 00:00 BRT.
- Lidar com mudancas de horario de verao BRT historicas (Brasil aboliu DST em 2019; valor estavel UTC-3).

**Criterio de aceitacao:**
- [ ] Domingo 23:00 BRT retorna a segunda da SEMANA QUE ESTA TERMINANDO (a recente, nao a futura).
- [ ] Segunda 06:00 BRT (apos cron rodar) retorna **a propria segunda**.
- [ ] Segunda 00:30 BRT retorna **a propria segunda**.

---

## Requisitos Nao-Funcionais

- **Performance cron:** processar 1000 users em < 30 minutos. Sequencial OK no MVP. Cada user max 30s (Anthropic timeout).
- **Custo Anthropic:** prompt cache obrigatorio. Catalog lessons + system prompt devem ser cacheados (mesmas tokens em todos users da mesma semana). Estimativa target: < 1500 tokens nao-cacheados por user.
- **Latencia GET endpoint:** p95 < 150ms. Query + entitlement check + lesson hidratada e barato.
- **Disponibilidade:** falha do Anthropic NAO derruba o cron — fallback determinista garante recomendacao em caso de outage.
- **Idempotencia:** UNIQUE constraint + early-skip no cron + dismiss/consume idempotentes.
- **Observabilidade:** logs `coach.cron.weekly_rec.*` + tracker events nos clicks.
- **Retencao de dados:** rows em `coach_lesson_recommendations` mantidas indefinidamente (auditoria + analise de relevancia futura). Sem TTL.
- **Privacidade:** `inputSummary` JSONB pode conter dados de performance — mesmo grade de sigilo de outros dados Coach. Nao expor em endpoints publicos.

---

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | `/api/home/coach-recommendation` | Retorna rec da semana corrente do user | requireAuth |
| POST | `/api/home/coach-recommendation/:id/dismiss` | Dispensar rec | requireAuth (owner) |
| POST | `/api/home/coach-recommendation/:id/consume` | Marcar consumida | requireAuth (owner) |
| POST | `/api/admin/coach/recommendations/regenerate` | Forcar regenerar | admin |

---

## Modelos de Dados Afetados

### `coach_lesson_recommendations` (NOVA)
Ver RF-01.

### `library_events` (alterada — apenas uso)
- Adicionar emit de event_type `'coach_recommend'` quando consume dispara.
- **NENHUMA migration** — enum `coach_recommend` ja existe (schema:3582).

### Sem alteracoes em outras tabelas.

---

## Integracoes Externas

| Servico | Proposito | Quando |
|---|---|---|
| Anthropic Claude API | Gerar recomendacao + reason | 1x/semana por user no cron |
| (Nenhum outro) | — | — |

---

## Cenarios de Teste Derivados

### Happy Path
- [ ] Cron roda segunda 06:00 BRT, user com leaks ativos recebe rec gerada via Coach (`source = 'coach'`).
- [ ] User abre Home, ve card com lesson recomendada + reason + CTA "Assistir agora".
- [ ] User clica CTA, vai para `/biblioteca/lesson/{id}?source=home-coach-rec`, assiste 30s, consume e marcado, library_events row criada.
- [ ] Na proxima visita a Home, card mostra "Ja consumida essa semana — proxima na segunda".

### Validacao de Input
- [ ] GET sem auth → 401.
- [ ] Dismiss em rec de outro user → 403.
- [ ] Admin regenerate sem permissao → 403.
- [ ] POST com :id invalido → 404.

### Regras de Negocio
- [ ] Cron rodando 2x na mesma segunda nao gera duplicata (UNIQUE).
- [ ] User sem leaks recebe fallback popular.
- [ ] User free sem acesso a lesson recebe card com tag "Sugestao de compra" + CTA "Ver detalhes".
- [ ] Coach retorna lesson_id invalido → fallback automatico.
- [ ] Coach retorna reason > 240 chars → trunca.
- [ ] Lesson recomendada e despublicada apos geracao → GET retorna `status: 'lesson_unavailable'`.
- [ ] User dismiss → GET seguinte retorna `status: 'dismissed'`, sem nova rec ate proxima segunda.
- [ ] User consume → GET seguinte retorna `status: 'consumed'`.

### Edge Cases
- [ ] Anthropic timeout (>30s) → fallback popular + `source = 'fallback_popular'`.
- [ ] Anthropic retorna JSON malformado → fallback.
- [ ] Catalog vazio (nenhuma lesson publicada) → cron nao insere; GET retorna `recommendation: null`.
- [ ] User cadastrado APOS segunda 06:00 → cron proximo nao roda mais essa semana → ate proxima segunda card mostra "Sua recomendacao desta semana ainda nao foi gerada".
- [ ] Lesson sem cover (coverKey null) → frontend mostra placeholder bg-muted.
- [ ] Rec criada sabado, semana vira no domingo 23:59 → GET segunda 00:01 retorna nova semana, rec antiga ignorada.
- [ ] Servidor reiniciado no exato momento do cron (06:00) → cron pode nao executar (node-cron in-process). Mitigacao: endpoint admin manual permite regerar pos-fato.
- [ ] User concluido lesson via outro caminho (nao via card) DURANTE a semana → recomendacao continua ativa (consume so ocorre via flow Home Coach Rec, nao via flow geral Biblioteca).

### Performance / Observabilidade
- [ ] Cron com 1000 users termina < 30min em prod-like.
- [ ] Prompt cache hit > 90% apos 1o user da semana.
- [ ] Tracker events disparam corretamente em cada acao.

---

## Fora de Escopo

- Multipla recomendacao simultanea (ex: 3 lessons na mesma semana).
- Recomendacao de hand history / spot review (apenas lessons da Biblioteca).
- Personalizacao de horario de geracao (ex: user escolhe terca em vez de segunda).
- Push notification ou email com a rec.
- Permitir user "trocar" a rec por outra opcao no MVP.
- Coach abrir chat session pre-fabricado quando user clica no card (coluna `chatSessionId` ja prevista, mas implementacao em proxima onda).
- A/B test de prompts diferentes do Coach.
- Score de relevancia retroativo (ex: medir % de consume vs % de dismiss e ajustar prompt).
- Endpoint para listar historico de recs passadas do user (auditoria via DB query direto enquanto nao houver UI).
- Analytics dashboard "qual licao mais recomendada".

---

## Dependencias

**Pre-requisitos (ja existentes):**
- Schema `library_lessons`, `user_lesson_access`, `library_progress`, `library_events` (Sprint Biblioteca-1 — confirmado em `shared/schema.ts:3635+`).
- Helper `storage.hasLibraryAccess` (Sprint home-reform-1-5 — confirmado em `storage.ts:10210`). Verificar se existe `storage.hasLessonAccess(userId, lessonId)` granular; se nao, criar.
- `coachLeakDetection.detectLeaks(userId, opts)` (Sprint Coach-2B — confirmado em `server/coachLeakDetection.ts`).
- `storage.getPerformanceByPeriod` ou equivalente para analytics 7d (verificar; provavelmente ja existe em `storage.ts`).
- Padrao node-cron + tz America/Sao_Paulo (confirmado em `server/coach/cronRunner.ts` + `server/jobs/refreshNews.ts`).
- Anthropic SDK + `getCoachSystemPrompt` (Sprint Coach-1).
- Tracker `emit` frontend (`@/lib/tracker`).
- `apiRequest` wrapper (`@/lib/queryClient`).

**Pre-requisitos a criar nesta sub-spec:**
- Tabela `coach_lesson_recommendations` (RF-01) + migration.
- Helper `getCurrentWeekStartBRT` (RF-12).
- Mapeamento `LEAK_TO_TAGS` (RF-04).
- Servico `recommendLessonForUser` (RF-03).
- Cron `generateCoachRecommendations` (RF-02).
- 4 endpoints (RF-05-08).
- Componente `CoachRecommendationCard` (RF-09).

**Sem dependencia bloqueante de outros itens do home-reform-4.** Itens 3, 5, 7 podem rodar em paralelo.

---

## Riscos / Decisoes Pendentes

### R1 — User sem dados (recem-cadastrado, < 7 dias)
**Risco:** Coach nao tem leaks, ROI, ou consumo passado para basear a recomendacao. Output do LLM pode ficar generico ou alucinado.
**Mitigacao:** Servico `recommendLessonForUser` detecta `analytics.last7DaysVolume === 0` E `leaks.length === 0` → vai direto pro fallback popular sem chamar Anthropic. Economiza custo + evita reasoning ruim. Source = `'fallback_popular'`.
**Decisao:** Adotada — implementar em RF-03.

### R2 — Multi-week racing (cron roda 06:00 mas user abre Home 05:55 BRT)
**Risco:** User pode ter rec da semana anterior ainda visivel se cron atrasou.
**Mitigacao:** GET endpoint sempre filtra por `weekStartDate = getCurrentWeekStartBRT()`. Recs de semanas anteriores nao aparecem (mesmo que dismissedAt/consumedAt sejam null). Status retornado: `recommendation: null`.
**Decisao:** Adotada.

### R3 — Lesson despublicada apos rec gerada
**Risco:** Coach recomenda lesson `lesson_X`, admin despublica `lesson_X` na quarta. Card quebra.
**Mitigacao:** GET hidrata lesson com `isPublished = true` filter. Se nao encontrada, retorna `status: 'lesson_unavailable'`. Frontend mostra mensagem neutra.
**Decisao:** Adotada — no `getLibraryLessonById` aplicar filtro `isPublished = true` ou retornar metadata + flag.

### R4 — Custo Anthropic em escala
**Risco:** 1000 users × ~3000 tokens/user = 3M tokens/semana. Sem cache, gasto significativo.
**Mitigacao:** Prompt cache em system + catalog. Cache hit > 90% reduz para ~300 tokens/user nao-cached. Custo aceitavel.
**Decisao pendente do founder:** definir hard cap de gasto/semana. Sugestao: env var `COACH_REC_MAX_USERS_PER_WEEK` (default 5000) — cron pula apos atingir cap.

### R5 — Lesson popular = sempre a mesma
**Risco:** Fallback popular pode recomendar a mesma lesson para 80% dos users free → ruim para diversidade.
**Mitigacao:** Adicionar randomizacao com seed `(userId, weekStartDate)` entre top 10 mais populares. Determinista por user/semana, mas distribui carga.
**Decisao:** Adotada — implementar em RF-03 fallback.

### R6 — Trigger consume automatico depende de lesson player
**Risco:** Se a pagina de licao nao tem hook para detectar `?source=home-coach-rec`, consume nunca dispara automaticamente.
**Mitigacao:** Sub-spec inclui pequena alteracao na pagina `/biblioteca/lesson/:id` para ler query param `source` e disparar consume apos 30s ou 80% (RF-07). Verificar se pagina existe e onde adicionar.
**Decisao:** Implementer DEVE auditar pagina de lesson existente antes de modificar. Se ainda nao existe player com hook de progress (ex: Bloco A apenas tem podcast nativo), implementar trigger via `<audio>`/`<video>` `timeupdate` event.

### R7 — Source estatistico do popular
**Risco:** "Popular" depende de `library_events` com `event_type = 'complete'` — se a Biblioteca tem pouca atividade, popular pode ser vazio.
**Mitigacao:** Fallback de fallback: se `getMostPopularLessonIds` retorna vazio, usar lessons mais recentes (`createdAt DESC` limit 10) e seed-randomizar.
**Decisao:** Adotada.

### R8 — Permissoes Coach por plano
**Risco:** Free plan deveria receber recomendacao? Se sim, qual a politica de "sugerir compra"? Founder mencionou que free recebe rec — confirmar.
**Decisao do founder necessaria antes de implementar:** Free recebe rec (com pull comercial)? Ou apenas pro/premium? Default proposto: TODOS os planos recebem (free vira pull de upgrade). Aguardar OK explicito.

### R9 — Card "Sugestao de compra" pode parecer spam
**Risco:** Se 90% das recs do user free vem com tag "Comprar acesso", vira ruido.
**Mitigacao opcional:** Limitar lessons elegiveis para users free apenas as gratuitas em 2 das 4 semanas do mes. Em 2 das 4, mostrar locked com "Sugestao de compra".
**Decisao:** Fora do MVP. Aceitar comportamento inicial (sempre que Coach achar relevante, mostra). Avaliar via tracker apos 4 semanas.

### R10 — Reason em PT-BR vs en
**Risco:** Coach as vezes responde em ingles mesmo system pt-br.
**Mitigacao:** System prompt explicita `Responda em portugues brasileiro. Reason curta, conversacional.`. Validacao opcional: detect ingles (palavras como "you should", "the lesson") e re-prompt 1x. Se falhar de novo, usar reason de fallback template.
**Decisao:** Adotada — re-prompt 1x apenas, sem loops.

---

## Stack Tecnica

**Backend:**
- node-cron 3.x (ja instalado).
- Drizzle ORM + pg.
- Anthropic SDK (`@anthropic-ai/sdk`) — reuso da configuracao Coach existente.
- Zod para validacao de input/output.

**Frontend:**
- React 18 + TanStack Query v5 + Wouter.
- shadcn Card + Button.
- Tailwind + `cn`.
- Tracker `@/lib/tracker`.

**Testing:**
- Vitest 4 + RTL para componente.
- Vitest unit para `recommendLessonForUser` (mock Anthropic).
- Integration test do cron (run com COACH_CRON_ENABLED + db de teste).
- Polyfill localStorage no setup (lesson #15 do CLAUDE.md).

---

## ADRs Sugeridos

- **ADR-111 — Coach Lesson Recommendations: schema + ciclo semanal.** Justifica tabela nova vs reuso de `coach_actions`. Define UNIQUE `(userId, weekStartDate)`. Define ciclo.
- **ADR-112 — Algoritmo Coach + fallback determinista para recomendacao.** Documenta arvore de decisao Coach → fallback leak→tag → fallback popular → null. Inclui prompt cache strategy.
- **ADR-113 — Mapeamento leak→tag em codigo (vs DB-driven).** Justifica manter em TS (versoes, code review, deploy junto). Re-avaliar quando atingir 50+ entradas.
- **ADR-114 — Trigger consume via query param `?source=home-coach-rec` na pagina de licao.** Documenta convencao de tracking de origin para conversao Coach → consumo.
- **ADR-115 — Fallback de "popular" com seed randomizado por (userId, weekStartDate).** Justifica determinismo + diversidade.

---

## Estimativa em Pipeline TDD

| Etapa | Tempo (h) | Notas |
|---|---|---|
| **system-architect** | 1.0 | 5 ADRs + diagrama sequencia cron + diagrama flow GET endpoint |
| **test-writer** | | |
| RF-01 schema migration test | 0.3 | UNIQUE + cascade + insert/select |
| RF-02 cron integration | 0.6 | mock Anthropic + DB real, idempotency |
| RF-03 recommend service unit | 1.0 | 8 cenarios (happy + invalid + fallback + R1) |
| RF-04 leak→tag util | 0.2 | 4 codigos + DEFAULT |
| RF-05 GET endpoint | 0.5 | 6 cenarios estados |
| RF-06 dismiss endpoint | 0.3 | idempotente + 403 + 404 |
| RF-07 consume endpoint | 0.4 | trigger auto + manual + library_events |
| RF-08 admin regenerate | 0.3 | apenas admin + override |
| RF-09 component RTL | 1.0 | 5 estados + tracker emits + mutations |
| RF-10 substituicao Home | 0.2 | snapshot test + import |
| RF-11 storage methods | 0.5 | 11 metodos unit |
| RF-12 weekHelper | 0.2 | 3 cenarios DST/edge |
| **implementer (green)** | 3-4 | trabalho linear, mock Anthropic em test, integracao real em dev |
| **simplify** | 0.3 | revisar duplicidade, prompt cache check |
| **reviewer** | 0.6 | seguranca admin endpoint, ownership checks, lesson #14 hoisting em mocks |
| **TOTAL** | ~10-12h | implementer pode rodar em background autonomous |

Pipeline pode ser dividido em 2 PRs:
1. **PR-A (backend):** RF-01, RF-02, RF-03, RF-04, RF-08, RF-11, RF-12 + ADRs. Inclui cron + servico + storage + admin endpoint. Sem mudancas em UI ainda.
2. **PR-B (frontend):** RF-05, RF-06, RF-07, RF-09, RF-10. Card + endpoints publicos + substituicao Home + (opcional) cleanup LibraryResume.

PR-A pode ser merged primeiro e validado com endpoint admin manual antes do PR-B chegar a producao.

---

## Notas de Implementacao

- **Prompt cache (Anthropic):** seguir skill `claude-api`. System prompt + lista de catalog lessons devem estar em blocos com `cache_control: { type: 'ephemeral' }`. User message com leaks/analytics fica fora do cache.
- **Ordem de chamadas no servico:** sempre tentar Coach primeiro EXCETO no cenario R1 (user sem dados). Isso economiza custo e evita reasoning ruim.
- **JSON output do Coach:** pedir explicitamente `Responda APENAS um JSON valido: { "lesson_id": "...", "reason": "..." }`. Validar via `JSON.parse` em try/catch.
- **Test-writer atencao:** mockar Anthropic com `vi.hoisted` (lesson #14 do CLAUDE.md). Nao usar `const x = vi.fn()` no top-level.
- **Implementer atencao:** ao deletar `LibraryResume`, fazer `Grep` antes pra garantir zero importacao em outros lugares (lesson #17 do CLAUDE.md sobre redeclaracao).
- **Conversao currency:** lesson `coverKey` se for path local segue padrao Spot Storage (ADR-057). Frontend ja resolve via storage backend.
- **Privacy:** `inputSummary` JSONB pode conter PII (ROI, volume). NUNCA expor em endpoints publicos. Apenas admin endpoints retornam (e mesmo assim, redacted).

---

## Verificacao Final (checklist pm-spec)

- [x] Cada RF tem criterios de aceitacao verificaveis.
- [x] Cenarios de teste cobrem happy path, validacao, regras, edge cases, performance.
- [x] "Fora de Escopo" preenchido com 10 itens.
- [x] Dependencias mapeadas (existentes + a criar).
- [x] Riscos/decisoes documentados (R1-R10).
- [x] 4 endpoints listados com metodo + rota + descricao + auth.
- [x] Modelo de dados novo (`coach_lesson_recommendations`) com 8 campos + 3 indices.
- [x] ADRs sugeridos numerados (111-115).
- [x] Estimativa pipeline TDD em horas.
- [x] Decisoes pendentes do founder explicitadas (R4 cap, R8 free plan).

**Aprovacao do founder necessaria antes de chamar system-architect.**

Perguntas explicitas:
1. **R8:** users do plano `free` recebem recomendacao com pull comercial? (default proposto: SIM)
2. **R4:** ha cap de gasto/semana com Anthropic? Se sim, qual numero de users max? (default proposto: 5000)
3. **R6:** confirmar que pagina `/biblioteca/lesson/:id` ja tem player de video/audio/article com hook de progress (necessario para trigger consume automatico)?
4. Confirmar nome do componente: `CoachRecommendationCard` (alternativa: `WeeklyCoachLessonCard`)?
5. Deletar `LibraryResume.tsx` + `library-continue.ts` + `getContinueWatching` ou manter por enquanto (podem ser uteis na pagina Biblioteca)?
