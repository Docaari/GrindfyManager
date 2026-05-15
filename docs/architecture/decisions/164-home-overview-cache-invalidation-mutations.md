# ADR-164: Cache Invalidation `home-overview` em Mutations Correlatas (Sprint Variance-1)

## Status
Aceito

## Data
2026-05-15

## Sprint
Variance-1 (`Docs/specs/sprint-variance-1.md`, RF-03 + RF-07)

## Decision owner
system-architect (Sprint Variance-1, decisao alinhada com lesson #21 — cache invalidator publico)

## Related
- Depende de: ADR-162 (variance KPI usa cache `/api/home/overview`), ADR-061 (`fxResolver`).
- Reusa: `server/routes/home.ts:77` (`export const invalidateHomeOverviewCache = clearHomeOverviewCache`), `server/routes/grind-sessions.ts` (handler PUT), `server/routes/upload.ts` (handler POST).
- Sucessor de: nenhum. Estende lesson #21 documentada em CLAUDE.md §9 (originalmente para `focusStats`).
- Sera substituido por: nenhum previsto.

---

## 1. Contexto

O endpoint `GET /api/home/overview` (`server/routes/home.ts`) usa cache server-side TTL 30s scoped por user (`home-overview-cache`, ja com helper publico `invalidateHomeOverviewCache(userId)` em `home.ts:77`). Cache evita 17+ queries por hit do dashboard.

ADR-162 introduz dependencia da variancia em **estado dinamico**:
- `actualUsd` = soma P&L 90d das sessoes — muda quando user **conclui sessao**.
- `actualUsd` tambem reage a **uploads CSV** (importacao de torneios passados).
- `expectedUsd`/`sigmaUsd` reage a **nova simulacao PrimeDope** (cache `primedope_runs`).

Sem invalidacao explicita, user que:
1. Conclui sessao no `/grind-live` → volta pra `/inicio` → VarianceCard mostra dado **stale por ate 30s** (TTL natural).
2. Roda simulacao no `/coach-ai?tab=variance` → volta pra `/inicio` → VarianceCard ainda em `expectedSource: 'fallback-zero'` (cache server + cache TanStack Query client).

**Lesson #21 (`home-reform-4 Audit Round 2`):** "Cache server-side TTL precisa de invalidator publico chamado por mutations". Pattern ja estabelecido com `invalidateFocusStatsCache` (item 7 home-reform-4).

A pergunta: **quais 3 mutations invalidar, e como (server vs client)?**

---

## 2. Decisao

### 2.1 Triggers de invalidacao

| # | Trigger | Camada | Implementacao |
|---|---------|--------|---------------|
| 1 | `PUT /api/grind-sessions/:id` com `status='completed'` | **Server** | Apos commit do storage, chamar `invalidateHomeOverviewCache(userId)` |
| 2 | `POST /upload` (success) | **Server** | Apos persistencia bem-sucedida do CSV, chamar `invalidateHomeOverviewCache(userId)` |
| 3 | `usePrimedopeSimulation.onSuccess` (apos POST `/api/primedope/simulate`) | **Client** | `queryClient.invalidateQueries({ queryKey: ['/api/home/overview'] })` |

### 2.2 Server-side — `invalidateHomeOverviewCache(userId)`

Helper publico ja exportado em `server/routes/home.ts:77`:

```ts
// home.ts (existente — naozapode mudar assinatura)
export const invalidateHomeOverviewCache = clearHomeOverviewCache;
```

**Onde plugar:**

#### Trigger 1 — `PUT /api/grind-sessions/:id`

`server/routes/grind-sessions.ts` — handler `handleUpdateGrindSession` (mesmo que ja recebeu o gancho do **Daily Debrief** AI-1C, ADR-159). Adicionar **apos** o commit do storage (storage retorna a session atualizada), **antes** de `res.json(...)`:

```ts
// Sprint Variance-1 RF-03
if (updatedSession.status === 'completed') {
  invalidateHomeOverviewCache(userId);
}
```

Best-effort: nao envolver em try/catch separado (helper eh sync, in-memory Map `delete` — nao pode falhar).

#### Trigger 2 — `POST /upload`

`server/routes/upload.ts` — handler do CSV import. Apos persistir torneios (com sucesso), adicionar:

```ts
// Sprint Variance-1 RF-03
invalidateHomeOverviewCache(userId);
```

Localizar fim do handler apos `storage.createTournaments(...)` ou equivalente.

### 2.3 Client-side — `usePrimedopeSimulation.onSuccess`

`client/src/hooks/usePrimedopeSimulation.ts` ja usa `useMutation` com `setQueryData` no cache TanStack Query. Adicionar invalidacao do home-overview no `onSuccess` (encadeado com o existente `setQueryData`):

```ts
const queryClient = useQueryClient();

return useMutation({
  mutationFn: ...,
  onSuccess: (result) => {
    // ja existente — setQueryData do primedope cache
    queryClient.setQueryData(['primedope-cache', userId, profileLetter, dayOfWeek], result);

    // Sprint Variance-1 RF-07 — invalidar home-overview pra VarianceCard mostrar 'primedope-cache'
    queryClient.invalidateQueries({ queryKey: ['/api/home/overview'] });
  },
  ...
});
```

### 2.4 Por que **client-side** para PrimeDope simulate

PrimeDope simulate **nao roda** no server route do home-overview — eh um endpoint dedicado (`POST /api/primedope/simulate`). Para o server saber que precisa invalidar, teria que:
- (a) Hook server-side num post-commit do `primedope/simulate` route — possivel, mas duplica logica (server + client invalidar).
- (b) WebSocket / Server-Sent Events — overkill para esta funcionalidade.
- (c) **Client-side invalidate** (escolhido) — TanStack Query ja gerencia cache do `/api/home/overview` no front; invalidate forca refetch automatico.

**Hibrido:** Server-side cobre triggers 1 + 2 (sessao + upload — mudam `actualUsd`). Client-side cobre trigger 3 (simulate — muda `expectedUsd`).

---

## 3. Opcoes Consideradas

### 3.1 Opcao A — So TTL natural (30s) sem invalidate explicito
**Pros:**
- Zero codigo novo.

**Contras:**
- Janela stale ate 30s apos mutation.
- UX ruim: user conclui sessao, abre `/inicio`, VarianceCard nao reflete a sessao.
- Lesson #21 violada.

**Rejeitada.**

### 3.2 Opcao B — Server-side invalidate em **todas** as 3 mutations (inclusive PrimeDope simulate via post-commit hook)
**Pros:**
- Invalidacao "completa" no servidor.

**Contras:**
- Duplica logica (server invalida + client tambem precisa invalidar TanStack Query cache local).
- Adiciona ponto de falha (post-commit hook do simulate route).
- PrimeDope simulate **ja** retorna result que vai pro `setQueryData` client-side — invalidate adicional do `/api/home/overview` cabe naturalmente no `onSuccess`.

**Rejeitada.**

### 3.3 Opcao C — Hibrido server + client **(escolhida)**
**Pros:**
- Server invalida sessao + upload (eventos dominio importantes).
- Client invalida simulate (event-local ao componente, TanStack Query nativo).
- Lesson #21 respeitada.
- TTL 30s vira **backstop** (nao primary mechanism).

**Contras:**
- 2 camadas para entender.

**Aceita.**

### 3.4 Opcao D — WebSocket invalidation broadcast
**Pros:**
- Real-time multi-tab.

**Contras:**
- Overkill para single-user feature.
- Infra nova.

**Rejeitada (overengineering).**

---

## 4. Consequencias

### 4.1 Positivas
- Janela stale = 0s para os 3 triggers principais (sessao, upload, simulate).
- TTL 30s **continua valido** como backstop (outras mutations menores, multi-device sync).
- Padrao consistente com `invalidateFocusStatsCache` (home-reform-4 item 7).
- Lesson #21 reforcada — "expor invalidator publico, chamar em mutations".

### 4.2 Negativas
- 2 invalidates server-side novos (`grind-sessions.ts` + `upload.ts`) = aumenta cobertura de teste necessaria (lesson #19 — testar que invalidate eh chamado).
- Client-side invalidate em `usePrimedopeSimulation` requer access ao `queryClient` (provavel ja injetado via `useQueryClient()`).

### 4.3 Neutras
- Nenhuma mudanca de schema.
- Nenhuma migration.
- Nenhuma mudanca em performance (invalidate eh O(1) — `Map.delete`).
- Apenas 4 linhas de codigo novo em 3 arquivos.

---

## 5. Confianca
**Alta.** Pattern ja em producao com `focusStats` (home-reform-4 item 7). `invalidateHomeOverviewCache` ja exportado e testado. TanStack Query `invalidateQueries` eh API estavel.

---

## 6. Plano de Reversao
Se invalidacao causar refetch excessivo (improvavel — frequencia de sessao+upload+simulate eh baixa per-user):
1. Manter triggers 1 + 2 (server) — sao eventos raros (5-20/dia por user pro).
2. Remover trigger 3 (client) se PrimeDope simulate gerar storm de refetches.

Reversao parcial = 3 linhas removidas, sem migration.

---

## 7. Cenarios de Teste Derivados

| Cenario | Resultado esperado |
|---------|---------------------|
| User conclui sessao via PUT `/grind-sessions/:id` (`status='completed'`) | Proxima GET `/api/home/overview` recomputa variance (sem 30s wait). |
| User faz upload CSV bem-sucedido | Proxima GET `/api/home/overview` recomputa variance. |
| User roda simulacao PrimeDope | VarianceCard reidrata com `expectedSource: 'primedope-cache'` apos refetch automatico. |
| User completa sessao mas com `status='paused'` (nao `completed`) | NAO invalida cache (status check no handler). |
| 2 GETs consecutivos sem mutation | Segundo GET hit cache (TTL 30s respeitado). |
| User completa sessao + faz upload + roda simulacao no mesmo segundo | 3 invalidates (idempotentes). |

---

## 8. Referencias
- Spec: `Docs/specs/sprint-variance-1.md` RF-03 + RF-07.
- Cache helper: `server/routes/home.ts:77` (`invalidateHomeOverviewCache`).
- Triggers:
  - `server/routes/grind-sessions.ts` (handler `handleUpdateGrindSession` — ja recebe gancho Daily Debrief AI-1C).
  - `server/routes/upload.ts` (handler CSV import).
  - `client/src/hooks/usePrimedopeSimulation.ts` (`useMutation.onSuccess`).
- Lesson #21 (cache server-side TTL precisa invalidator publico).
- Precedente: `invalidateFocusStatsCache` (home-reform-4 item 7).
