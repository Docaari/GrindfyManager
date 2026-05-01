# ADR-068 — Cross-feature recommendations engine: pipeline server-side com priority score formula

- Status: Proposto
- Data: 2026-05-01
- Sprint: Studies-Reform / Fase 3 (Arquitetura)
- Decision owner: autonomous (founder AFK; aplica defaults D3, D4, D11 da spec)
- Related: ADR-067 (URL state pattern em studies), ADR-052 (Coach `read_user_hud_stats` shape — referencia de pipeline server-side), ADR-058 (auto-snapshot — referencia de telemetria + try/catch)
- Spec: `Docs/specs/sprint-studies-reform.md` RF-06, RF-07

## Context

A Sprint Studies-Reform RF-06 introduz uma view dedicada
(`/estudos/recomendacoes`) que centraliza "o que estudar agora" combinando
3 fontes ortogonais que hoje vivem isoladas:

1. **Leaks** detectados pelo `detectLeaks()` (existente em
   `server/studies-v2.ts`) baseado em `tournaments` + `stats_snapshots`.
2. **Spots stale** — `starredHands` com `reviewLater=true` cuja idade
   ultrapassou 7 dias e nao foram vinculados a nenhum tema (RF-05).
3. **Temas dormentes** — `studyThemes` com `progress < 30%` cuja ultima
   visita (`lastVisitedAt` derivada de `studySessions` ou tabela
   `study_tabs.lastVisitedAt`) excedeu 30 dias.

Hoje a UI de Studies trata so leaks (linhas 357-414 de `Studies.tsx`):
chama `detectLeaks()` no client, mapeia para topicos via
`mapLeakToStudyTopic` e renderiza sugestoes que **somem** quando o leak
some — sem celebracao, sem persistencia, sem priorizacao cross-source.

A questao arquitetural e dupla:

1. **Onde rodar o merge das 3 fontes?**
   - Server-side (endpoint dedicado `GET /api/study/recommendations`)?
   - Client-side (3 queries paralelas + reducao no client)?
2. **Como priorizar items de tipos diferentes (`leak` vs `stale_spot` vs
   `dormant_theme`) na mesma lista?**
   - Score formula deterministico ponderado?
   - Ranking heuristico por categoria com round-robin?
   - ML scorer treinado em engagement passado?

A Coach tool `read_theme_with_linked_spots` (RF-07) consome o mesmo
agregado (theme + spots + tabs) — so que apenas para 1 tema por vez. O
core de "ler tema + spots vinculados" e service compartilhado.

### Forcas em jogo

- **Performance UX:** Dashboard (RF-02) e Recomendacoes view (RF-06)
  precisam carregar rapido (<200ms p95). 3 queries client-side em
  paralelo somam latencia de network round-trips.
- **Token budget Coach (RF-07):** `read_theme_with_linked_spots` e tool
  do Coach que vai dentro do prompt cache Anthropic. Lesson #10:
  divergencia silenciosa de prompts quebra cache. Logica de "ler tema +
  spots vinculados" precisa ser **um arquivo unico** consumido pelo
  endpoint REST E pela tool.
- **Re-fetch frequencia:** recomendacoes nao mudam a cada segundo.
  Cache TanStack 5min e suficiente. Activity (theme open, spot review,
  snapshot create) deve invalidar.
- **Cross-user isolation:** todas as queries filtram por `userId`. Spec
  exige check em multipla camadas (Zod + storage + service).
- **Lesson #3 (mock shape real):** test-writer precisa shapes
  estaveis e consistentes com storage real. Service no servidor torna
  shape um **contrato unico**.
- **Lesson #9 (try/catch generico engole erros):** se uma das 3 fontes
  falhar (e.g., `detectLeaks` quebra por sample insuficiente), a outra
  duas devem renderizar — falha por fonte, nao por request inteiro.
- **D4 (default ativo):** spec ja decidiu pipeline server-side com
  cache TanStack 5min. ADR formaliza o porque + formula.
- **D11 (default ativo):** cross-link `?fromStats=leaks` em Themes view
  consome mesmo `attacks_leak_type` que o engine usa internamente. Score
  formula precisa expor `metadata.leak_type` para a UI poder filtrar.

## Opcoes Consideradas

### Opcao A: Client-side aggregation (3 queries paralelas)

`useQueries([leaks, staleSpots, dormantThemes])` no
`RecommendationsView.tsx`, merge + sort no client.

- **Pros:**
  - Sem novo endpoint.
  - Client decide sort/filter dinamicamente.
- **Contras:**
  - **3 round-trips paralelos** = latencia maxima (network slowest).
  - **Logica duplicada:** mesmo merge teria que rodar tambem na Coach
    tool (RF-07) que e server-side. Drift garantido.
  - **N+1 risk:** dormant themes precisa de `lastVisitedAt` derivado
    de `studySessions` — se feito no client, expoe muito raw data.
  - **Cross-user check fragil:** server pode garantir; client e
    "best-effort".
  - **Token budget Coach**: tool teria que reimplementar pipeline =
    cache miss + divergencia.
  - Lesson #3 sofre: 3 mocks separados em vez de 1.

### Opcao B: ML scorer treinado em engagement passado

Modelo simples (logistic regression / gradient boost) treinado em
`user_activity` para prever probabilidade de click.

- **Pros:**
  - Ranking adapta ao usuario.
- **Contras:**
  - **Sample atual <100 pro+ users** — insuficiente para treino
    decente (mesma razao de ADR-063 para direction semantics).
  - **Drift:** modelo precisa retreinar; ops pesado.
  - **Black-box:** debug "por que esse leak veio antes desse spot?"
    fica impossivel.
  - **Tunning:** spec exige inicio simples e iterar (V1 → V2). MVP
    nao precisa ML.

### Opcao C: Round-robin por categoria (sem score numerico)

Lista alterna 1 leak, 1 stale_spot, 1 dormant_theme sem score.

- **Pros:**
  - Trivial de implementar.
- **Contras:**
  - **Nao prioriza severidade:** leak de severidade 9/10 fica em
    posicao igual a leak 2/10 se for categoria "leak".
  - **Quebra UX:** usuario com 5 leaks e 0 dormant themes ve lista
    confusa.
  - **Nao respeita user state** (e.g., bankroll-locked, em tilt).
  - Sem cross-source comparison — spec D4 explicitamente pede merge
    por priority.

### Opcao D: **Server-side `studyRecommendationsService.ts` com pipeline parallel + priority score formula deterministico (ESCOLHIDA)**

Service novo em `server/services/studyRecommendationsService.ts`:

```ts
export type RecommendationType = 'leak' | 'stale_spot' | 'dormant_theme';

export interface Recommendation {
  id: string;                       // determinismo: hash(type + sourceId)
  type: RecommendationType;
  title: string;                    // PT-BR
  description: string;              // 1-line context
  priority_score: number;           // 0-100
  cta_action: 'create_theme' | 'review_spot' | 'open_theme';
  cta_url: string;                  // ex: /estudos/spots/<id>
  metadata: {
    leak_type?: string;             // se type=leak
    leak_severity?: number;
    spot_age_days?: number;
    theme_dormancy_days?: number;
    theme_progress?: number;
  };
}

export async function getRecommendations(
  userId: string,
  limit = 10
): Promise<Recommendation[]> {
  const [leaks, staleSpots, dormantThemes] = await Promise.allSettled([
    getStatsLeaks(userId, 5),
    getStaleSpots(userId, 7),
    getDormantThemes(userId, 30, 30),
  ]);

  const items = [
    ...extractFulfilled(leaks, mapLeakToRecommendation),
    ...extractFulfilled(staleSpots, mapSpotToRecommendation),
    ...extractFulfilled(dormantThemes, mapThemeToRecommendation),
  ];

  return items
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, limit);
}
```

Endpoint:

```ts
// server/routes/study-recommendations.ts
router.get('/api/study/recommendations',
  requireAuth,
  async (req, res) => {
    try {
      const items = await getRecommendations(req.user.userPlatformId, 10);
      res.json({ items });
    } catch (err) {
      console.error('[study-recommendations] failed', { userId: req.user.userPlatformId, err });
      res.status(500).json({ error: 'recommendations_failed' });
    }
  }
);
```

Coach tool (RF-07) reusa **subset** do service:

```ts
// server/coachTools/readThemeWithLinkedSpots.ts
export async function readThemeWithLinkedSpots({ theme_id, theme_name, userId }) {
  const theme = await resolveTheme({ theme_id, theme_name, userId });
  const tabs = await storage.getStudyTabsByTheme(theme.id);
  const linked_spots = await storage.getLinkedSpots(theme.id, { limit: 10 });
  return shapeForCoach(theme, tabs, linked_spots);
}
```

`storage.getLinkedSpots` e mesmo metodo usado por `mapThemeToRecommendation`
para descobrir "spots existentes vinculados" (mostrar count em
metadata). Logica de "ler tema + spots vinculados" reside em **storage**,
consumido tanto pelo service quanto pela tool — sem duplicacao.

- **Pros:**
  - **1 endpoint, 1 round-trip, 1 latencia.**
  - **Pipeline parallel** via `Promise.allSettled` — falha de 1 fonte
    nao bloqueia outras (lesson #9).
  - **Score deterministico:** debug e reproduzivel.
  - **Cross-user check unificado:** todas as 3 fontes filtram por `userId`
    no storage layer.
  - **Cache TanStack 5min:** frontend nao precisa pensar em invalidation
    granular (ver "Activity invalidation hook" abaixo).
  - **Coach tool reusa storage:** zero divergencia.
  - **Shape padronizado:** test-writer mocks 1 service, nao 3 fontes
    + merge logic (lesson #3).
  - **Telemetria por tipo:** logging em service ja sabe a fonte.
- **Contras:**
  - Novo endpoint + service + 4 storage methods.
  - Score formula precisa tunning empirico (V1 simples, V2 iterar).
  - Test surface maior (~12 tests novos no service).

## Decisao

**Adotar Opcao D — service server-side `studyRecommendationsService.ts`
com pipeline `Promise.allSettled` + priority score formula
deterministica.**

### Priority score formula (V1)

```
score = (leakSeverity × 1.5)
      + (spotAgeDays × 0.3)
      + (themeDormancyDays × 0.1)
      + sourceBonus
```

Onde:

| Fonte | Componente | Calculo | Range esperado | sourceBonus |
|---|---|---|---|---|
| `leak` | `leakSeverity × 1.5` | severidade do `detectLeaks()` (0-10) × 1.5 | 0-15 | +5 se severidade>=7 (leak grave) |
| `stale_spot` | `spotAgeDays × 0.3` | `(now - spot.createdAt) / 1d` × 0.3 | 0-30+ (cap 30) | +2 se spot.type ∈ {tilt, leak, mistake} |
| `dormant_theme` | `themeDormancyDays × 0.1` | `(now - lastVisitedAt) / 1d` × 0.1 | 0-30+ (cap 30) | +1 se progress<10% (quase nada feito) |

Resultado normalizado para `0-100` aplicando `Math.min(100, Math.round(score × 2))`.

### Justificativa dos pesos

**Leaks pesa mais (×1.5).** Leak vem de tracking estatistico real
(`detectLeaks` requer 50+ MTTs). Severidade 9 = leak comprovado em 200+
torneios — alta confianca. Spec do research (anti-pattern #2): "sugestao
sem vinculo persistente mata o valor central da feature". Priorizar
leak resolve isso.

**Stale spot peso medio (×0.3).** Idade de spot e proxy de "esqueci
revisar". Importa, mas e acao individual com baixo custo. Bonus +2 se
spot.type indica problema (tilt/leak/mistake) — esses sao mais
acionaveis que `bluff` ou `cbet`.

**Dormant theme peso baixo (×0.1).** "Voce abandonou tema X" e mais
"reminder" que "leak comprovado". Nao quero spammar com temas dormentes
quando o usuario tem 5 leaks ativos. Bonus +1 se `progress<10%` (tema
mal comecado e sinal de friccao no setup, nao de prioridade).

### Score scenarios

| Scenario | Componentes | Score raw | Score final (cap 100) |
|---|---|---|---|
| Leak severidade 9 (PKO ROI -8%) | 9×1.5 + 5 = 18.5 | 18.5 | 37 |
| Leak severidade 5 (steal SB low) | 5×1.5 + 0 = 7.5 | 7.5 | 15 |
| Spot tilt 14d sem tema | 14×0.3 + 2 = 6.2 | 6.2 | 12 |
| Spot bluff 30d sem tema | 30×0.3 + 0 = 9 | 9 | 18 |
| Theme dormente 60d, progress 5% | 30×0.1 + 1 = 4 (cap) | 4 | 8 |
| Theme dormente 90d, progress 25% | 30×0.1 + 0 = 3 (cap) | 3 | 6 |

**Validacao manual** com scenarios acima:

- Lista ordena: leak grave (37) > leak medio (15) > spot bluff stale 30d (18) > spot tilt 14d (12) > theme dormente progress baixo (8) > theme dormente progress medio (6).
- Inversao spot×leak: leak severidade 5 (15) e spot bluff 30d (18) → spot vence. Aceitavel: spot 30d sem tema e ato concreto que o usuario marcou; leak medio severidade 5 e tendencia. **Trade-off conhecido — V2 pode aumentar leak weight**.

### Caching strategy

**TanStack Query 5min stale + invalidation on activity:**

```ts
// client side
const { data: recommendations } = useQuery({
  queryKey: ['study', 'recommendations', userId],
  queryFn: () => fetch('/api/study/recommendations').then(r => r.json()),
  staleTime: 5 * 60 * 1000,    // 5 minutos
  gcTime: 10 * 60 * 1000,       // 10 minutos garbage collect
});
```

**Activity invalidation hook (D3 alinhado com streak bump):**

```ts
// client/src/hooks/useStudyActivityInvalidation.ts
export function useStudyActivityInvalidation() {
  const qc = useQueryClient();
  return {
    onThemeOpen:    () => qc.invalidateQueries({ queryKey: ['study', 'recommendations'] }),
    onSpotReview:   () => qc.invalidateQueries({ queryKey: ['study', 'recommendations'] }),
    onSnapshotCreate: () => qc.invalidateQueries({ queryKey: ['study', 'recommendations'] }),
  };
}
```

Triggers (D3 reaproveitado da streak):

- `ThemeDetail` mount → `onThemeOpen()`
- `starredHands.review` submit → `onSpotReview()`
- Stats Analyzer snapshot create → `onSnapshotCreate()`

Cache server-side: **nao implementado** no MVP. Service e barato (~3 queries
indexadas) e cache TanStack ja absorve maioria dos hits. V2 pode adicionar
Redis se latencia degradar.

### Response shape padronizado

```ts
// GET /api/study/recommendations response
{
  items: Recommendation[],
  generated_at: string,           // ISO8601 — auxilia debug "stale data?"
  source_counts: {                // diagnostico para UI mostrar empty state correto
    leaks: number,                // total leaks ativos (mesmo se descartados por limit)
    stale_spots: number,
    dormant_themes: number,
  }
}
```

`source_counts` permite empty state especifico: "Voce tem 5 leaks
detectados mas nenhum supera severidade 3 — continue jogando".

### Pipeline failure handling

`Promise.allSettled` garante que falha em 1 fonte nao bloqueia outras:

```ts
const results = await Promise.allSettled([leaks, staleSpots, dormantThemes]);

results.forEach((result, idx) => {
  if (result.status === 'rejected') {
    const sourceName = ['leaks', 'stale_spots', 'dormant_themes'][idx];
    console.error(`[study-recommendations] ${sourceName} failed`, result.reason);
    telemetry('study_recommendations_source_failed', { source: sourceName });
  }
});
```

Lesson #9 aplicada: **logar antes do fallback**. Se `detectLeaks` quebrar
(e.g., user com 0 torneios importados), outras 2 fontes ainda alimentam
recomendacoes.

### Cross-user check (defesa em profundidade)

Em 3 camadas:

1. **Route:** `requireAuth` middleware extrai `userId` de JWT.
2. **Service:** todas as funcoes recebem `userId` como primeiro parametro.
3. **Storage:** queries Drizzle sempre `WHERE user_id = ?`.

Coach tool (RF-07) tem check adicional: `theme.userId === conversation.userId`
antes de retornar payload (lesson de cross-tenant security).

### Reuso pelo Coach tool (RF-07)

```ts
// server/coachTools/readThemeWithLinkedSpots.ts
import { storage } from '../storage';

export async function readThemeWithLinkedSpots(input, ctx) {
  const userId = ctx.userPlatformId;

  // resolve theme_id OR theme_name (XOR)
  const theme = input.theme_id
    ? await storage.getStudyTheme(input.theme_id, userId)
    : await storage.getStudyThemeByName(input.theme_name, userId);

  if (!theme) throw new ToolError('theme_not_found', 'Tema nao encontrado.');

  const [tabs, linked_spots] = await Promise.all([
    storage.getStudyTabsByTheme(theme.id, { limit: 5, fields: ['id', 'name', 'content'] }),
    storage.getLinkedSpots(theme.id, { limit: 10, userId }), // mesmo metodo do service
  ]);

  return shapeForCoach({ theme, tabs, linked_spots });
}
```

`storage.getLinkedSpots` e fonte unica de verdade para "spots vinculados a
um tema". Service `studyRecommendationsService` usa para `mapThemeToRecommendation`
(retorna count). Coach tool usa para listar 10 spots em payload. Zero
duplicacao = zero drift = cache Anthropic feliz (lesson #10).

### Token budget para Coach tool

Tool truncada para max 4000 tokens (ADR ja existente no contexto Coach):

- Tabs: max 5 entries, content preview 200 chars cada (~1000 tokens).
- Linked spots: max 10 entries, conclusion preview 200 chars cada (~2000 tokens).
- Theme metadata: ~200 tokens.
- Headers + structure: ~800 tokens.

## Consequencias

### Positivas

- **1 round-trip** carrega recomendacoes (vs 3 paralelos client-side).
- **Pipeline tolerante a falha** — uma fonte quebrada nao mata a tela.
- **Score deterministico** = debug fácil ("por que esse leak veio antes?").
- **Coach tool desacoplada** mas reusa storage layer — cache Anthropic
  preservado.
- **Cross-user isolation** em 3 camadas — defesa em profundidade.
- **Cache TanStack 5min** + activity invalidation = UI sente atualizada
  sem spam de requests.
- **Test surface limpa:** mock 1 service, nao 3 fontes (lesson #3).
- **Empty state inteligente** via `source_counts` (RF-10 alinhado).

### Negativas

- **Score weights tunning empirico:** V1 sao chutes baseados em
  research. Pos-launch, telemetria `studies.recommendation_clicked` vai
  permitir ajustar. Plano explicito de iterar para V2.
- **Novo endpoint + service + 4 storage methods** (linkSpotToTheme,
  unlinkSpotFromTheme, getLinkedSpots, getDormantThemes) — superficie
  de teste cresce.
- **Cap em 30 days para spot/theme age:** spot 90d sem revisao tem score
  igual a 30d. Aceito no MVP — V2 pode log-scale.
- **Server cache nao implementado:** se latencia degradar com user base
  grande, V2 adiciona Redis. Hoje, custo zero.

### Neutras

- **Migration 0021 (D10):** schema novo (`study_theme_spot_links`)
  alimenta `getLinkedSpots`. Se migration nao aplicada, fallback
  documentado em RF-08: tabela vazia, count = 0, score do theme nao
  recebe bonus de "spots vinculados" (que e zero anyway). Service
  funciona, com qualidade ligeiramente menor.
- **`detectLeaks()` existente:** reusado intacto. Nenhuma mudanca
  proposta nesta sprint.

## Telemetria

Eventos disparados pelo service / endpoint / view:

- `study_recommendations_generated` — `{ user_id, items_count, source_counts, latency_ms }` (server)
- `study_recommendations_source_failed` — `{ source, error }` (server, lesson #9)
- `studies.recommendation_clicked` — `{ rec_type, priority_score, position }` (client, alimenta tunning V2)
- `studies.recommendation_dismissed` — `{ rec_type, position }` (client, V2)

## Endpoints / Tool registry

| Tipo | Path / Nome | Descricao | RF |
|---|---|---|---|
| HTTP | `GET /api/study/recommendations` | Top 10 recomendacoes mescladas | RF-06 |
| Coach Tool | `read_theme_with_linked_spots` | Le tema + spots vinculados (Pro+ tier) | RF-07 |
| Storage | `getLinkedSpots(themeId, opts)` | Compartilhado entre service e tool | RF-05/06/07 |
| Storage | `getDormantThemes(userId, progress, dormancyDays)` | Themes filtro+ordenacao | RF-06 |
| Storage | `getStaleSpots(userId, ageDays)` | Spots sem theme link, idade>X | RF-06 |

## Migracao / Versionamento V1 → V2

V1 entrega esta sprint:

- Score formula linear ponderada (validada com 5 scenarios manuais).
- Cache TanStack 5min, sem cache server.
- Top 10 fixo.
- Telemetria pos-launch alimenta tunning V2.

V2 (futuro, fora do escopo Studies-Reform):

- Reweighting baseado em telemetria click rate.
- ML scorer opcional (depende de scale).
- Personalization por tier (Free vs Pro+).
- Cache server-side (Redis) se latencia >200ms p95.
- Source weights configuraveis (e.g., "ignorar dormant themes nesta semana").

## Confianca

**Media-Alta** — Pipeline server-side com `Promise.allSettled` e padrao
estabelecido (ADR-052 ja usa em `read_user_hud_stats`). Score formula
deterministica e simples; weights serao ajustados pos-launch via
telemetria. Risco principal: scenario underweight de leaks medios vs
spots stale (validado manualmente como aceitavel; iterar em V2).

## Notas para subagentes seguintes

- **test-writer (RF-06):** mocks de `getStatsLeaks`, `getStaleSpots`,
  `getDormantThemes` com **shape real do storage** (lesson #3). Tests:
  pipeline retorna lista correta, score calculado por scenario,
  `Promise.allSettled` tolera falha por fonte, cross-user isolation,
  cache invalidation triggers.
- **test-writer (RF-07):** Coach tool retorna shape correto, XOR
  theme_id/theme_name, cross-user isolation, truncacao a 4000 tokens,
  tier gating Pro+, coexistencia com outras tools.
- **implementer:** comecar por `storage.getLinkedSpots` +
  `storage.getDormantThemes` + `storage.getStaleSpots` (dependencias do
  service e da tool). Depois `studyRecommendationsService`. Depois
  endpoint. Depois Coach tool registry.
- **reviewer:** verificar (a) zero duplicacao entre service e tool, (b)
  cross-user check em 3 camadas, (c) telemetria implementada, (d) cache
  invalidation hooks chamados nos triggers D3 corretos.

---

*ADR gerado pelo system-architect em 2026-05-01 como parte da Fase 3 da Sprint Studies-Reform.*
