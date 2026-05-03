# ADR-102 — `/api/home/overview` Cache Strategy: Promise.allSettled + 30s in-memory per-userId, sem Redis em Onda 1

- Status: Proposto
- Data: 2026-05-03
- Sprint: home-reform-1 (Onda 1 da reforma da Home)
- Decision owner: system-architect (formaliza founder D3, D4, D5, D6, D14 da Spec home-reform-1)
- Related: ADR-099 (cockpit pattern), ADR-100 (news flag), ADR-101 (sidebar IA), ADR-016 (bundle aggregation pattern player-bundle)
- Spec: `Docs/specs/home-reform-1.md` §3 D3-D6/D14, §10.1, RF-01, RNF-01, RNF-08, RNF-10

---

## 1. Contexto

### 1.1. Diagnostico

A Home reformada (ADR-099) tem **8 sub-blocos com fonte de dados distinta** (`statusStrip`, `today`, `banners.cooldown`, `banners.flight`, `nextTournament`, `lifetime`, `recentSessions`, `performance`, `pendingHands`, `news`). Em implementacao naive, cada bloco faz sua propria query TanStack Query no mount → **8-10 round-trips HTTP** por carregamento da Home.

Numeros aproximados em ambiente dev (1 user, ~1k torneios, ~50 sessoes):
- Cada round-trip: ~80-150ms (auth middleware + query + serializa + JSON parse cliente).
- 8 paralelos no browser: limitado a ~6 simultaneos por origem (Chrome) → 2 batches → 250-400ms total.
- Auth middleware roda 8 vezes (carrega user, valida JWT, etc.) — desperdicio.

ADR-016 (bundle aggregation) ja precedeu padrao similar para `/dashboard` com `/api/analytics/player-bundle` (7 chamadas paralelas → 1 endpoint composto). A reforma da Home **estende esse padrao** para um cockpit ainda mais agregador.

### 1.2. Forcas

- **D3 — Endpoint composto e fonte unica**: frontend faz 1 unica query TanStack Query com `queryKey: ['/api/home/overview']`. Sub-blocos consumem `data?.statusStrip`, `data?.today` etc.
- **D4 — Cache server-side 30s in-memory per-userId**: aceitar staleness ate 30s. Sem Redis em Onda 1.
- **D5 — Orquestracao via `storage.ts` direto, NAO HTTP-loopback**: PM-Spec recomendou direto (mais performatico, menos round-trips). Pendencia residual deixada para o architect confirmar.
- **D6 — Performance budget**: <500ms p95 em ambiente dev (1 user, ~1k torneios, ~50 sessoes). Cache hit <50ms p95.
- **D14 — Timezone-aware**: backend usa `userTimezone` se disponivel no JWT/profile, fallback `America/Sao_Paulo`. Calcula `dayOfWeek` (0-6) e busca `profile_states` correspondente + `planned_tournaments WHERE start_time::date = today`.
- **Subquery falha != response 500**: D5 explicito — `Promise.allSettled` por subquery; se uma falha, retorna `null` para aquele sub-bloco e sucesso geral 200. Frontend trata `null` como empty/error state local do bloco (graceful degradation).
- **Cache strictly per-userId**: RNF-10 — chave do Map = userId, **NAO** IP/sessao. User A nunca recebe dados do user B.

### 1.3. Pendencia residual deixada pelo PM-Spec (D5: storage direto vs HTTP loopback)

PM-Spec deixou para o architect confirmar ou desviar.

Argumentos pro storage direto (escolhido):
- Sem auth middleware rodando 8 vezes.
- Sem JSON serializacao/deserializacao 8 vezes.
- Sem TCP loopback (mesma maquina, mesmo node process).
- Reuso direto de funcoes ja testadas em `storage.ts`.
- Padrao ADR-016 (player-bundle) ja faz isso.

Argumentos pro HTTP-loopback:
- Cada endpoint individual continua exposto e re-utilizavel em outros contextos sem refactor.
- Cache HTTP (Cache-Control headers) automatizado.
- Logging por endpoint preservado.

Decisao: **storage direto**. Razoes em §2.1.

---

## 2. Decisao

### 2.1. Endpoint composto via `Promise.allSettled` + storage.ts direto

`GET /api/home/overview` em `B:\grindfy\server\routes\home.ts`:

1. Auth: `requireAuth` middleware (JWT obrigatorio).
2. Cache check: `Map<userId, { data, expiresAt }>` lookup. Se hit e nao expirou, retornar cached com `meta.cacheHit: true`.
3. Cache miss: orquestrar 8 subqueries via `Promise.allSettled`:
   ```ts
   const subqueries = [
     storage.getQuickStats(userId),
     storage.getDashboardPerformance(userId, '30d'),
     storage.getRecentSessions(userId, 5),
     storage.getPendingStarredHands(userId, 5),
     storage.getPlannedTournamentsForDate(userId, today, userTimezone),
     storage.getProfileStateForDay(userId, dayOfWeek),
     storage.getCurrentBankroll(userId),
     storage.getActiveCooldown(userId),
     storage.getActiveFlightSeries(userId),
     // news vem via fetchNewsItems (ADR-100, NAO via HTTP loopback)
     fetchNewsItems('poker-software', 5),
   ];
   const results = await Promise.allSettled(subqueries);
   ```
4. Cada subquery individual com timeout 800ms (via `Promise.race` com `setTimeout`):
   ```ts
   const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
     Promise.race([
       p,
       new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
     ]);
   ```
   Subquery que excede 800ms vira `null`. NAO derruba o endpoint inteiro.
5. Compose response: mapeia `results[i].status === 'fulfilled' ? results[i].value : null` para cada campo.
6. Determinar `userState`:
   ```ts
   const userState = (quickStats?.totalTournaments ?? 0) >= 50 && (quickStats?.totalSessions ?? 0) >= 5 ? 'power' : 'empty';
   ```
7. Cache store: `cache.set(userId, { data: response, expiresAt: now + 30_000 })`.
8. Logging estruturado (RNF-08): `[home/overview] userId=X total=Yms cacheHit=Z subqueries={ statusStrip:Xms, today:Yms, ... }` por request. Sem PII.
9. Return 200 com schema `HomeOverviewResponse` (RF-01) + `meta.cacheHit`, `meta.generatedAt`, `meta.subqueryTimingsMs`.

### 2.2. Resolucao da pendencia residual D5: storage direto

**Decisao do architect: storage.ts direto, sem HTTP-loopback.**

Justificativa principal:
- Performance: HTTP-loopback adiciona ~30-80ms por subquery (auth middleware + JSON serialize/parse). 8 subqueries * 50ms = 400ms desperdicados — viola budget D6 (<500ms p95).
- Simplicidade: `storage.ts` ja expoe funcoes testadas. Reuso direto evita duplicacao de logica (ADR-016 player-bundle ja faz isso).
- Auth: roda 1 vez no `requireAuth` do `/api/home/overview`, nao 8 vezes nos sub-endpoints loopback.
- News: `fetchNewsItems` exportado de `server/routes/news.ts` (ADR-100 §2.2 ponto de extensao 1) — chamado direto.

**Trade-off aceito:** funcoes `storage.ts` precisam ter assinaturas estaveis pos-Onda 1 (mudanca em assinatura quebra `home.ts`). Mitigado: mesmas funcoes ja sao consumidas por dashboard, library, coach etc. — testes existentes garantem estabilidade.

### 2.3. Cache strategy 30s in-memory per-userId

**Estrutura:**
```ts
const homeOverviewCache = new Map<string, { data: HomeOverviewResponse; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;
```

**Lookup:**
```ts
const cached = homeOverviewCache.get(userId);
if (cached && cached.expiresAt > Date.now()) {
  return { ...cached.data, meta: { ...cached.data.meta, cacheHit: true } };
}
```

**Invalidacao:**
- **Por TTL**: automatica (lookup verifica `expiresAt`).
- **Por evento**: NAO em Onda 1 (D4 explicito). Aceitar staleness ate 30s.
- **Cleanup periodico**: opcional (Map leak < 1MB para 1000 users; aceitar para Onda 1). Ondas futuras podem adicionar cleanup setInterval cada 5min.

**Boundary per-userId (RNF-10):**
- Chave do Map e estritamente `userId` (string nanoid). Nunca IP, nunca sessao.
- Test integration: 2 users diferentes, cada um chama `/api/home/overview`, cache independente. Verificar via `cacheHit: false` na 1a chamada de cada.

**Invalidacao manual em testes:**
- Export funcao `clearHomeOverviewCache(userId?: string)` para uso em testes integration. Em prod, nao chamado.

### 2.4. Performance budget (D6 + RNF-01)

| Metrica | Budget | Cenario |
|---|---|---|
| Total response time (cold cache) | < 500ms p95 | 1 user, ~1k torneios, ~50 sessoes |
| Total response time (cache hit) | < 50ms p95 | Lookup Map + JSON serialize |
| Subquery individual | < 800ms (timeout hard) | Subquery > 800ms vira `null` |
| Concurrent users (cold) | < 700ms p95 | 5 users simultaneos chamando /api/home/overview |

Validacao via test integration medindo timings (vitest node project). Test de carga: 10 calls sequenciais, p95 < 500ms.

### 2.5. Alternativas avaliadas

#### A) HTTP-loopback (chamar proprios endpoints HTTP)
- Pros: cache HTTP automatizado, endpoints individuais re-utilizaveis.
- Contras: +30-80ms por subquery (auth middleware 8 vezes + JSON x2). Viola budget D6.
- **Rejeitado.**

#### B) Redis cache
- Pros: cache distribuido (multi-replica).
- Contras: dependencia nova (Onda 1 e single-replica em dev). Custo operacional. Overengineered para 30s TTL.
- **Rejeitado para Onda 1**, possivel em Onda 3 se rollout horizontal exigir.

#### C) GraphQL com DataLoader
- Pros: fetch sob demanda do client, dedup automatico.
- Contras: stack inteiro novo. Conflita com REST + Drizzle existente. Overengineered.
- **Rejeitado.**

#### D) Sem cache (server sempre executa subqueries)
- Pros: dados sempre frescos.
- Contras: budget 500ms a cada navegacao. User que retorna `/` em <30s paga subqueries inteiras de novo.
- **Rejeitado.**

#### E) Cache distribuido em-memoria (LRU multi-instancia)
- Pros: cap de memoria.
- Contras: Onda 1 e single-replica. LRU adiciona complexidade. Map simples chega.
- **Adiado**, considerar em Onda 3 se rollout horizontal.

#### F) Server-Sent Events / WebSocket push
- Pros: invalidacao por evento real-time.
- Contras: stack nova. 30s staleness e aceitavel para overview.
- **Rejeitado para Onda 1**, considerar em Onda 3.

### 2.6. Frontend cache (TanStack Query)

`staleTime: 30_000` (espelha cache server-side). `refetchOnWindowFocus: true` (revalida ao retornar foco).

```ts
const { data, isLoading, isError } = useQuery<HomeOverviewResponse>({
  queryKey: ['/api/home/overview'],
  queryFn: () => apiRequest('GET', '/api/home/overview'),
  staleTime: 30_000,
  refetchOnWindowFocus: true,
});
```

F6 toggle de periodo dispara query separada (excecao bem-comportada — escolhe periodo diferente de 30d):
```ts
const { data: perfData } = useQuery({
  queryKey: ['/api/dashboard/performance', { period: f6Range }],
  queryFn: () => apiRequest('GET', `/api/dashboard/performance?period=${f6Range}`),
  enabled: f6Range !== '30d', // 30d ja vem no overview
});
```

### 2.7. Cache headers HTTP

`Cache-Control: private, max-age=30` no response (espelha 30s server-side). `private` evita cache em proxies compartilhados.

### 2.8. Logging server-side (RNF-08)

Cada request emite log estruturado:
```
[home/overview] userId=USER-1234 total=287ms cacheHit=false subqueries={"statusStrip":85,"today":42,"performance":120,"recentSessions":78,"pendingHands":35,"banners.cooldown":18,"banners.flight":22,"nextTournament":40,"lifetime":55,"news":3}
```

- Nivel `info` por request bem-sucedido.
- Nivel `error` por subquery falhada (com stack). Distingue `null` por timeout (warn) vs `null` por throw (error).
- Sem PII: nao logar email, nome real, payload completo.

### 2.9. Arquivos tocados/criados (binding contract)

- `B:\grindfy\server\routes\home.ts` (NOVO — handler `GET /api/home/overview`).
- `B:\grindfy\server\routes\index.ts` (registrar `home.ts`).
- `B:\grindfy\server\storage.ts` — possivelmente extender com funcoes especificas que ainda nao existem (`getActiveCooldown`, `getActiveFlightSeries`, `getProfileStateForDay`). Test-writer mapeia quais.
- `B:\grindfy\Docs\api\endpoints-index.md` (atualizar com novos endpoints).
- `B:\grindfy\Docs\api\endpoints.md` (ou novo `home.md`) — documentar schema completo.

---

## 3. Opcoes Consideradas

### Opcao A — HTTP-loopback (chamar proprios endpoints via fetch interno)

**Pros:** endpoints individuais re-utilizaveis, cache HTTP automatizado.
**Contras:** +400ms total (auth middleware 8x), viola budget D6. **REJEITADA.**

### Opcao B — Storage direto + Promise.allSettled + cache 30s in-memory per-userId (ESCOLHIDA)

**Pros:**
- Performance: <500ms p95 cold, <50ms hit.
- Reuso direto de `storage.ts` testado.
- Cache simples, zero dependencia externa.
- Per-userId boundary garante isolation (RNF-10).
- Graceful degradation por subquery (D5).
- ADR-016 (player-bundle) ja validou padrao.

**Contras:**
- Funcoes `storage.ts` viram contrato implicito de `home.ts` (mudanca de assinatura quebra). Mitigado por testes ja existentes.
- Cache in-memory nao escala horizontal (Onda 1 single-replica — aceitavel).

### Opcao C — Redis cache em Onda 1

**Pros:** cache distribuido.
**Contras:** dependencia nova, overengineered para 30s TTL. **REJEITADA para Onda 1.**

---

## 4. Consequencias

### 4.1. Positivas

- **8-10 round-trips → 1 round-trip** (frontend faz 1 query, backend orquestra).
- **<500ms p95 cold, <50ms hit** — UX rapida.
- **Graceful degradation**: subquery falha → campo `null`, response 200 — banner/bloco mostra empty/error state local.
- **Per-userId boundary** garante seguranca (RNF-10).
- **Padrao replicavel** para futuros cockpits (ADR-016 player-bundle ja precedeu).

### 4.2. Negativas

- **Staleness ate 30s**: user faz acao (importa CSV, registra wallet), Home pode mostrar dados velhos por ate 30s. Aceito (R2 §15 spec). Refetch on focus mitiga.
- **Funcoes `storage.ts` viram contrato implicito**: mudanca quebra `home.ts`. Mitigado por testes existentes.
- **Cache in-memory nao escala horizontal**: rollout multi-replica em Onda 3 pode exigir Redis.
- **Cleanup periodico do Map deferido**: aceitar leak <1MB para 1000 users em Onda 1.

### 4.3. Neutras

- **Cache headers `Cache-Control: private, max-age=30`** alinhados com server-side.
- **F6 toggle 7d/30d/90d/YTD** quebra a regra "1 query por Home" — aceito como excecao bem-comportada (query secundaria so quando toggle != 30d).
- **Onda 3 pode trocar cache backend** (Redis, Memcached) sem mudar contrato HTTP — `Map` e detalhe de implementacao.

---

## 5. Confianca

**Alta.** Decisao alinhada com D3-D6 + D14 (founder explicito). Padrao ADR-016 (player-bundle) ja validou storage direto + Promise.allSettled. Risco principal (staleness 30s) aceito explicitamente em R2 da spec. Per-userId boundary testavel.

---

## 6. Notas de Implementacao

- **`Promise.allSettled` (NAO `Promise.all`)**: garante que 1 subquery falhar nao derruba o endpoint inteiro.
- **Timeout via `Promise.race` com `setTimeout` 800ms**: subquery > 800ms vira `null`. Test-writer cobre o caso.
- **`fetchNewsItems` exportado de `news.ts`** (ADR-100): chamado direto, NAO via HTTP loopback.
- **`clearHomeOverviewCache(userId?)` exportado para testes**: integration tests podem forcar cache miss entre cases.
- **Logging estruturado** (RNF-08): `console.log` em formato JSON-like; sem framework externo. Sem PII.
- **`meta.subqueryTimingsMs`** retornado em todas as respostas (mesmo cache hit) — facilita debug em prod.
- Reviewer checklist:
  - [ ] `Promise.allSettled` em vez de `Promise.all`.
  - [ ] Timeout 800ms por subquery via race.
  - [ ] Cache key estritamente `userId` (nao IP, nao sessao).
  - [ ] `requireAuth` middleware na rota.
  - [ ] `Cache-Control: private, max-age=30` no response.
  - [ ] Logging estruturado sem PII.
  - [ ] Funcoes `storage.ts` reusadas (sem duplicacao de queries).
  - [ ] `fetchNewsItems` importado de `news.ts`, nao loopback HTTP.
- Test-writer cobre: schema valido, 401 sem JWT, cache hit (2a chamada `cacheHit: true`), per-userId isolation (user A nao recebe dados de user B), subquery timeout 800ms vira `null`, subquery throw vira `null` 200, performance < 500ms p95.
