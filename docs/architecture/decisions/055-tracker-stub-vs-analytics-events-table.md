# ADR-055: `tracker.ts` stub minimo via console.log vs tabela `analytics_events` persistida

## Status

Aceito (interim — divida tecnica registrada para sprint futuro)

## Data

2026-04-28

## Contexto

A spec Sprint F4 (`Docs/specs/sprint-f4-primedope-grade-detail.md`, Parte F — Telemetria)
exige emissao de **5 eventos** durante operacao normal:

| Evento | Trigger | Payload |
|---|---|---|
| `primedope_simulation_run` | apos run com sucesso | `{ profileLetter, dayOfWeek, multiplier, bucketCount, latencyMs, source, cacheHit }` |
| `primedope_simulation_error` | erro fatal (4xx, 5xx exausto, timeout queue) | `{ errorType, statusCode, latencyMs }` |
| `primedope_chart_proxy_miss` | chart 404 fs | `{ hash }` |
| `day_detail_drawer_open` | drawer aberto | `{ dayOfWeek, profileLetter, totalCost, abi, tournamentCount }` |
| `primedope_run_pinned` | pin/unpin run | `{ runId, pinned }` |

Eventos sao consumidos em W2 pelo dashboard `/admin/primedope-stats` (P50/P95 latencia,
cache hit rate, error rate, top 10 perfis simulados, distribution `source`).

### Restricoes

- **Helper centralizado nao existe.** Inspecionando `server/utils/`, nao ha `tracker.ts`,
  `analytics.ts`, `metrics.ts` ou similar. Eventos hoje sao emitidos via `console.log`
  ad-hoc com prefix `[track]` em alguns lugares (ex: `server/coachContext.ts`,
  `server/services/walletService.ts`) — sem padrao consistente.
- **Tabela `analytics_events` nao existe.** Schema atual em `shared/schema.ts` (~1300
  linhas) tem `analytics_daily` (resumo agregado) e `engagement_metrics`
  (metricas pre-computadas), mas nada que receba eventos crus.
- **Dashboard W2 ja precisa ler dados.** `/admin/primedope-stats` em W2 (4 dias apos W0)
  precisa de fonte estruturada para agregacoes (P50/P95, count by source, etc.).
- **Sprint F4 escopo total ~105h.** Adicionar tabela + queries + dashboard ja consome
  ~12h em W2; criar `analytics_events` schema generico + dashboard reusavel adiciona
  ~16h+ (schema, indices, queries pre-agregadas, retencao, GDPR considerations).
- **Dependencias externas (PostHog, Amplitude, Mixpanel) custam $.** Free tier para teste,
  mas adicionar SDK + env vars + privacy considerations (PII anonimization, opt-out,
  cookie consent) eh trabalho extra fora do escopo F4.
- **Founder so quer "ver os numeros" em W2.** Dashboard admin nao precisa ser realtime;
  agregacoes hourly/daily sao suficientes.

### Forcas em jogo

- **Velocidade > completude** em sprint focado em produto (PrimeDope integration). Adiar
  schema generico para sprint dedicado a telemetria/observability evita scope creep.
- **Reversibilidade.** Stub via `console.log` permite migrar para tabela depois sem
  refazer call sites — interface `tracker.emit(event, payload)` permanece.
- **Logs ja sao parsable.** Servidor escreve logs estruturados (`console.info`,
  `console.warn`, `console.error`); `console.log('[track] EVENT_NAME {json}')` eh
  consumivel via grep/regex/awk para protótipo de dashboard.
- **Founder ainda nao deployou.** Producao nao existe; logs locais sao a unica fonte. Em
  F3 (deploy) com PaaS (Vercel/Railway), logs sao agregados pela plataforma — agregacao
  basica via UI ou export CSV.

## Opcoes Consideradas

### Opcao A: `tracker.ts` stub minimo via `console.log` (ESCOLHIDA — interim)

Criar `server/utils/tracker.ts`:

```ts
export function emit(event: string, payload: Record<string, unknown>): void {
  console.log('[track]', event, JSON.stringify(payload));
}
```

Call sites:

```ts
import { emit } from '@/utils/tracker';

emit('primedope_simulation_run', {
  profileLetter, dayOfWeek, multiplier, bucketCount,
  latencyMs, source, cacheHit
});
```

Output:
```
[track] primedope_simulation_run {"profileLetter":"A","dayOfWeek":2,"multiplier":4,"bucketCount":12,"latencyMs":2840,"source":"primedope","cacheHit":false}
```

**Dashboard W2** consome via:
- Dev local: `tail -f server.log | grep '\[track\]'` + script Node parsing JSON.
- Producao futura (F3+): platform logs (Vercel/Railway dashboard) ou shipping para
  CloudWatch/Datadog se relevante.

**Migracao para tabela** (sprint futuro, ADR proprio):
1. Criar `analytics_events` table (id, user_id, event_name, payload jsonb, created_at).
2. Modificar `tracker.emit` para `INSERT INTO analytics_events`.
3. Call sites permanecem identicos (interface `emit(event, payload)`).
4. Migration de logs historicos opcional (parser regex → INSERT batch).

- **Pros:**
  - **Zero schema delta.** Sem migration, sem indices, sem retencao policy.
  - **Zero dep externa.** Sem SDK PostHog/Amplitude.
  - **Interface estavel.** `emit(event, payload)` permanece; trocar implementation no
    futuro nao afeta call sites.
  - **Desbloqueia W0 imediato.** Service `primedopeIntegration.ts` ja chama
    `emit(...)` na entrega.
  - **Observavel localmente.** Dev ve eventos no terminal durante `npm run dev`.
  - **Compativel com lessons learned #9.** Logs estruturados, parsable, distinguem
    eventos de erros (`console.error` ainda usado para erros).
  - **Facilmente migravel.** Quando founder pedir agregacoes complexas, swap por
    INSERT atras da mesma interface.

- **Contras:**
  - **Sem queries agregadas.** Dashboard W2 vira workaround (parser de log) ou e adiado
    ate sprint de telemetria persistida.
  - **Logs sao volateis.** Server restart limpa log file (em dev). Producao depende de
    log shipping.
  - **Sem GDPR/PII control.** Logs incluem `userId`, `profileLetter` etc. Aceitavel em
    dev; em producao, log retention policy do PaaS dita prazo.
  - **Performance.** `console.log` em alta concorrencia (nao esperada em F4 — rate limit
    1/10s/user) pode virar bottleneck I/O. Aceitavel para volume F4.
  - **Sem rastreamento por user-id agregado.** Dashboard "top 10 perfis simulados" exige
    parsing offline. Aceito para W2; ADR futuro paga schema.

### Opcao B: Tabela `analytics_events` desde W0 + dashboard W2 com queries reais

Schema:

```sql
CREATE TABLE analytics_events (
  id varchar(21) PRIMARY KEY,
  user_id varchar(21) REFERENCES users(id) ON DELETE CASCADE,
  event_name varchar(100) NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_events_name_created ON analytics_events (event_name, created_at DESC);
CREATE INDEX idx_analytics_events_user_created ON analytics_events (user_id, created_at DESC);
```

`tracker.emit` via INSERT.

- **Pros:**
  - **Queries SQL reais** para dashboard.
  - **Persistencia.** Restart nao perde eventos.
  - **Padrao para futuras telemetrias** (Coach, Bankroll, Studies).
  - **Aggregations agendaveis** (cron, materialized views).

- **Contras:**
  - **+1 tabela + 2 indices** para 5 eventos especificos de F4. Schema bloat se outros
    sprints nao seguirem padrao.
  - **Performance INSERT** em endpoint hot (`/api/primedope/simulate`) adiciona ~1-5ms.
    Aceitavel mas mensuravel.
  - **Retention policy** vira preocupacao imediata. 5 eventos/req × 100 reqs/dia × 100
    users = 50k rows/dia. Em 1 ano = 18M rows. Cron de purge necessario.
  - **GDPR compliance.** PII em payload exige opt-out, anonymization, retention.
  - **+8h em W0** (schema, migration, queries). +8h em W2 (dashboard real).
  - **Rejeitada por: scope creep em sprint focado em PrimeDope integration; aceitavel em
    sprint dedicado a observability.**

### Opcao C: SDK externo (PostHog free / Amplitude free / Mixpanel free)

Adicionar SDK servidor (e/ou client) para shipping eventos para SaaS terceiro.

```ts
import { PostHog } from 'posthog-node';
const posthog = new PostHog(process.env.POSTHOG_API_KEY);
posthog.capture({ distinctId: userId, event: 'primedope_simulation_run', properties: ... });
```

- **Pros:**
  - **Dashboard pronto** (free tier).
  - **Queries flexiveis** sem SQL.
  - **Cohort analysis, funnels, retention** out-of-box.
  - **Migracao trivial.** Zero schema, zero queries.

- **Contras:**
  - **Dep externa premature.** Stack Grindfy ainda nao tem analytics tools; F4 nao deveria
    forcar essa decisao.
  - **PII shipping** para terceiro exige privacy review (LGPD/GDPR).
  - **Vendor lock-in.** Eventos historicos ficam no provider; export-back custa.
  - **Free tier limita** events/mo (PostHog: 1M events/mo gratis). Pode estourar com Coach
    + Bankroll + PrimeDope juntos.
  - **Latency.** Cliente HTTP outbound em endpoint hot adiciona ~50-100ms (mitigavel via
    batching, mas SDK setup nao trivial).
  - **+4h em W0 setup + privacy doc.**
  - **Rejeitada por: decisao estrategica (analytics vendor) deve ser sprint dedicado, nao
    side effect de F4.**

### Opcao D: Hibrido — `tracker.emit` faz dual-write console.log + INSERT condicional

```ts
export function emit(event: string, payload: Record<string, unknown>): void {
  console.log('[track]', event, JSON.stringify(payload));
  if (process.env.ANALYTICS_PERSIST === '1') {
    db.insert(analyticsEvents).values({ ... });
  }
}
```

- **Pros:**
  - Pode-se ligar persistencia em prod sem alterar call sites.

- **Contras:**
  - **Schema ainda precisa existir.** Migration ja paga em W0.
  - **Complexidade dual-write.** Bug em tabela quebra log. Bug em log perde events.
  - **Rejeitada por: schema bloat sem ganho imediato; dual-write e "paying for both
    options" sem decidir nenhuma.**

## Decisao

**Adotar Opcao A: criar `server/utils/tracker.ts` com stub minimo via `console.log`.
Migracao para tabela `analytics_events` ou SDK externo eh divida tecnica registrada,
escopo de sprint futuro dedicado a observability.**

### Detalhes-chave do design

1. **Path:** `server/utils/tracker.ts`
2. **Implementacao:**
   ```ts
   export function emit(
     event: string,
     payload: Record<string, unknown>
   ): void {
     console.log('[track]', event, JSON.stringify(payload));
   }
   ```
3. **Call sites em F4:**
   - `server/services/primedopeIntegration.ts` — emit `primedope_simulation_run`,
     `primedope_simulation_error`, `primedope_chart_proxy_miss`, `primedope_run_pinned`.
   - `client/src/components/grade/DayDetailDrawer.tsx` — emit `day_detail_drawer_open`
     no client (via fetch helper ou inline `console.log` similar). Pode ter shim
     `client/src/lib/tracker.ts` espelho.
4. **Convencao de naming:** `<dominio>_<acao>` em snake_case (PostHog/Mixpanel-friendly
   se migrar).
5. **Payload shape:** `Record<string, unknown>` (flexivel). Convencao: incluir
   `userId` quando disponivel (mas evitar email/PII textual).
6. **Dashboard W2 strategy:**
   - Em dev: script Node lendo `server.log` parsing prefix `[track]` + JSON.
   - Em F3 (deploy futuro): platform logs (Vercel Functions logs / Railway logs)
     consultaveis via UI da plataforma. Export CSV se necessario.
7. **Migracao para tabela** (futuro):
   - ADR novo registrando swap.
   - Modificar `emit` para `INSERT INTO analytics_events (event_name, payload, created_at,
     user_id) VALUES (...)`.
   - Manter `console.log` em DEV para observabilidade local.
   - Optional: parser de log historico → INSERT batch para preservar dados pre-migracao.
8. **Migracao para SDK externo** (futuro):
   - ADR novo. Avaliar PostHog vs Amplitude vs Mixpanel.
   - Modificar `emit` para client.capture(...).

### Tradeoffs aceitos

| Tradeoff | Aceito por que |
|---|---|
| **Sem queries agregadas em W2** | Dashboard W2 vira workaround (parser log) ou adia ate sprint dedicado. |
| **Logs volateis em dev** | Aceitavel; restart raro durante dev. |
| **Sem GDPR/PII control** | Aceitavel pre-deploy; F3 paga policy quando deploy entrar. |
| **Performance log I/O** | Volume F4 baixo (rate limit 1/10s/user). |
| **Migration futura paga schema** | Aceitavel; interface `emit(event, payload)` reduz custo da migracao. |

### Quando rever esta decisao

- **Founder pede dashboard real-time:** ADR novo escolhe (a) tabela, (b) SDK externo.
- **Logs nao parsaveis** por volume: schema-first vira mandatorio.
- **GDPR compliance** exigido por deploy em UE: schema + retention policy mandatorio.
- **Multiplas features dependem de eventos** (>= 3 sprints): consolidar em
  `analytics_events` ou SDK.
- **PrimeDope quebra silenciosamente** + dashboard nao detecta: schema agregavel ajudaria
  alertar (mas mesmo log + parser detecta — nao e blocker).

## Consequencias

### Positivas

- **W0 desbloqueado imediato.** Sem migration, sem schema design.
- **Interface estavel** (`emit(event, payload)`) → migracao futura nao afeta call sites.
- **Logs estruturados** parsaveis localmente para protótipo de dashboard W2.
- **Zero scope creep.** Decisao de telemetria vendor adiada para sprint dedicado.
- **Compatibilidade com lessons learned.** Padrao log + JSON e padrao do projeto.

### Negativas

- **Dashboard W2 vira workaround.** Parser de log + script Node ad-hoc. Aceitavel para
  validacao inicial.
- **Logs volateis** em ambientes sem log shipping. Aceitavel pre-deploy.
- **Sem cohort analysis nativo.** Dashboard W2 mostra agregacoes simples (P50/P95, count
  by source); analise por user-cohort exige migrar para tabela ou SDK.
- **Divida tecnica explicita.** Documentada aqui + em "Out of scope" da spec F4. ADR
  futuro deve fechar.

### Neutras

- **Decisao revisitavel.** ADR novo quando founder pedir agregacoes complexas.
- **Naming convention `<dominio>_<acao>`** facilita migracao para SDK terceiro
  (PostHog/Amplitude esperam mesmo padrao).

## Confianca

**Alta.** Stub e minimal, reversivel via mesma interface. Tradeoffs documentados.
Migracao paga em sprint dedicado e cheap relativo ao trabalho de F4.

## Referencias

- **Spec:** `Docs/specs/sprint-f4-primedope-grade-detail.md` (Parte F — Telemetria, Parte
  E — Components Novos `server/utils/tracker.ts`).
- **Lessons learned:** `Docs/architecture/lessons-learned.md#9` (try/catch generico
  engole erros: log antes de fallback) — `tracker.emit` usa mesmo padrao log
  estruturado.
- **ADR-054:** `054-primedope-external-provider-vs-native-engine.md` — telemetria 4xx do
  PrimeDope alerta troca de schema.
- **Diagramas Mermaid:**
  - `Docs/architecture/sequence-primedope-simulation.mermaid` — `tracker.emit` calls
    inline no fluxo.
- **Memoria:** `memory/deploy_strategy_2026-04-24.md` — manter local; F3 paga schema +
  log shipping.
