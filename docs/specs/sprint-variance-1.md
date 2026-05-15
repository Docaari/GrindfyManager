# Spec: Sprint Variance-1 — Wiring do Sistema de Variancia (PrimeDope ↔ Home)

## Status
Proposta

## Arquitetura

ADRs aprovados (2026-05-15):

| ADR | Cobre |
|-----|-------|
| [162](../architecture/decisions/162-variance-kpi-primedope-cache-fallback-heuristic.md) | RF-01 + RF-02 — algoritmo de `getVarianceVsExpected` (primedope-cache vs fallback heuristico), shape de retorno, sanitize defensivo no route |
| [163](../architecture/decisions/163-fx-cascade-shared-resolver-canonical.md) | Decisao de reusar `fxResolver.resolveExchangeRates` canonico (NAO criar `fx.ts` novo extraindo de `primedopeIntegration.ts`) |
| [164](../architecture/decisions/164-home-overview-cache-invalidation-mutations.md) | RF-03 + RF-07 — invalidacao hibrida server (sessao + upload) + client (primedope simulate) |

Diagramas Mermaid em `Docs/architecture/diagrams/sprint-variance-1/`:

1. **`variance-data-flow.mermaid`** — fluxo end-to-end (GET /api/home/overview → storage → branch primedope/fallback → VarianceCard render branch).
2. **`variance-query-sequence.mermaid`** — sequencia detalhada de queries (cache hit vs miss; primedope hit vs fallback heuristico).
3. **`variance-cache-invalidation.mermaid`** — 3 triggers (PUT grind-sessions, POST upload, primedope simulate) → invalidator (server + client) → refetch.
4. **`variance-component-tree.mermaid`** — componentes frontend afetados (VarianceCard, EmptyPerformanceCluster, dailyInsight rule, PrimedopePanel, hook).

## Resumo
Este sprint corrige a falha estrutural do sistema de variancia: o calculo nunca renderiza no `/inicio` porque `storage.getVarianceVsExpected` retorna `null` hardcoded desde Onda 2 (`server/storage.ts:11664-11668`). O sprint religa a Surface A (PrimedopePanel em `/coach-ai?tab=variance`) na Surface B (VarianceCard em `/inicio`) implementando o storage de verdade, adiciona empty-state com CTA para o simulador, propaga contexto da grade para o PrimedopePanel, integra invalidacao de cache em sessoes/uploads e adiciona uma rule "tough-stretch" no Insight do Dia para casos de variancia muito negativa.

## Contexto
Auditoria conjunta strategist + reviewer (2026-05-15) identificou que o "sistema de variance calculator" reportado pelo founder como "nao funcionando" e na verdade duas ilhas isoladas sem ponte:

1. **Surface A (PrimedopePanel)** — funciona, persiste em `primedope_runs` (migration 0015, ADR-054), so acessivel via aba terciaria `Variance Calculator (Beta)` em `client/src/pages/GradePlanner.tsx:959-977`.
2. **Surface B (VarianceCard)** — UI pronta em `client/src/components/home/VarianceCard.tsx:48-88`, gate render `sessionsCount >= 20`, mas nunca recebe `data !== null` porque o storage e stub.
3. **Ponte ausente** — `server/storage.ts:11664-11668` documentado como TODO Onda 3 / AI-2A em CLAUDE.md §10. Bug latente desde home-reform-2.

**Premissa preservada:** `server/scoring/tournamentScorer.ts` NAO usa PrimeDope (zero refs). Tournament Selector continua heuristico independente. A decisao "PrimeDope alimenta scoring" fica fora deste sprint (escopo AI-2A).

## Usuarios
- **Jogador Pro/Premium ativo (>=20 sessoes em 90d):** ve VarianceCard real em `/inicio` com status lucky/normal/unlucky.
- **Jogador Pro/Premium ativo sem simulacao PrimeDope:** ve VarianceCard com empty-state e CTA "Abrir simulador".
- **Jogador novo (<20 sessoes):** VarianceCard fica hidden silencioso (gate no storage). Cluster vazio renderiza `EmptyPerformanceCluster` (comportamento atual).
- **Jogador planejando grade:** PrimedopePanel recebe `profileLetter` + `dayOfWeek` da grade aberta e habilita prefill de buckets via `server/services/primedopeBucketsPrefill.ts`.

## Requisitos Funcionais

### RF-01: Implementar `getVarianceVsExpected(userId)` real
**Descricao:** Substituir o stub em `server/storage.ts:11664-11668` por implementacao funcional que agrega P&L em USD das ultimas 90 dias e cruza com cache PrimeDope mais recente do user.

**Regras de negocio:**
- Janela temporal fixa: `created_at >= NOW() - INTERVAL '90 days'`.
- Filtrar `grind_sessions` por `status = 'completed'` e `user_id = $1`.
- Agregar P&L por sessao em USD via cascade FX usando `server/services/fxResolver.ts` (ja existente — usar `resolveFxForUser(userId)`, NAO refatorar `resolveExchangeRates` de `primedopeIntegration.ts:122-157`; ja existe consolidado em `fxResolver.ts` — lesson #6 FX antes de threshold USD).
- Gate `sessionsCount < 20` → retornar `null` (gate unico no storage, NAO no client). VarianceCard ja gate-checa redundante em `VarianceCard.tsx:50`, mas o storage e a fonte de verdade.
- Lookup primedope: `SELECT result_json, created_at FROM primedope_runs WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '90 days' ORDER BY created_at DESC LIMIT 1`.
- Validar shape do `result_json` antes de extrair campos. Usar zod schema:
  ```ts
  z.object({ data: z.object({ ev: z.number(), stdDev: z.number() }).passthrough() }).passthrough()
  ```
  (campos `data.ev` e `data.stdDev` confirmados em `client/src/components/primedope/PrimedopeResult.tsx:273,287`).
- Se `primedope_runs` row valida existe e `result_json.data.ev` e `result_json.data.stdDev` sao numeros finitos:
  - `expectedUsd = result_json.data.ev`
  - `sigmaUsd = result_json.data.stdDev`
  - `expectedSource = 'primedope-cache'`
- Senao (sem run / shape invalido):
  - `expectedUsd = 0`
  - `sigmaUsd = 1.5 * stddev(daily_pnl_usd)` (desvio-padrao amostral dos P&L diarios das 90 dias)
  - `expectedSource = 'fallback-zero'`
- Calculos derivados:
  - `actualUsd = sum(pnl_usd)` das sessoes 90d.
  - `deviationUsd = actualUsd - expectedUsd`.
  - `sigmaMultiple = sigmaUsd > 0 ? deviationUsd / sigmaUsd : 0`.
  - Clamp `sigmaMultiple` em `[-10, 10]` (defesa contra outlier extremo).
  - Sanitize `NaN` / `Infinity` / `-Infinity` em todos os campos numericos → coerce para `0`.
- Status:
  - `sigmaMultiple >= 1` → `'lucky'`
  - `sigmaMultiple <= -1` → `'unlucky'`
  - senao → `'normal'`
- Retornar shape exato consumido por `server/routes/home.ts:722-736` → `VarianceCard`:
  ```ts
  {
    sessionsCount: number,
    actualUsd: number,
    expectedUsd: number,
    expectedSource: 'primedope-cache' | 'fallback-zero',
    deviationUsd: number,
    sigmaUsd: number,
    sigmaMultiple: number,
    status: 'lucky' | 'normal' | 'unlucky',
    period: '90d'
  }
  ```

**Criterio de aceitacao:**
- [ ] User com 25 sessoes 90d e 1 row `primedope_runs` valido recebe shape com `expectedSource === 'primedope-cache'`.
- [ ] User com 25 sessoes sem `primedope_runs` recebe shape com `expectedSource === 'fallback-zero'`.
- [ ] User com 19 sessoes recebe `null`.
- [ ] User com 0 sessoes recebe `null`.
- [ ] User com sessoes em BRL/EUR ve `actualUsd` convertido via `fxResolver` (lesson #6).
- [ ] `primedope_runs.result_json` com shape quebrado (sem `data.ev`) faz fallback para `'fallback-zero'` sem throw.
- [ ] `sigmaMultiple` nunca retorna `NaN`, `Infinity` ou fora de `[-10, 10]`.

---

### RF-02: Sanitize defensivo em `server/routes/home.ts`
**Descricao:** Endurecer o mapeamento de `varianceResult` em `server/routes/home.ts:722-736` para nao confiar em shape do storage (defesa em profundidade).

**Regras de negocio:**
- `expectedSource` strict parse: aceita literal `'primedope-cache'` OU `'fallback-zero'`. Qualquer outro valor (incluindo `undefined`, `null`, `string` arbitraria) → coerce para `'fallback-zero'`.
- `Number.isFinite(x)` check em todos os campos numericos (`actualUsd`, `expectedUsd`, `deviationUsd`, `sigmaUsd`, `sigmaMultiple`). Falha de check → coerce para `0`.
- `sessionsCount` parse com `Math.max(0, Math.floor(...))`.
- `status` strict parse: aceita `'lucky'` ou `'unlucky'`, default `'normal'` (logica atual ja correta — manter).
- `period`: literal `'90d'` (ja correto).

**Criterio de aceitacao:**
- [ ] Storage retornando `expectedSource: 'bogus'` resulta em `'fallback-zero'` no body.
- [ ] Storage retornando `sigmaMultiple: NaN` resulta em `0` no body.
- [ ] Storage retornando `sessionsCount: -5` resulta em `0` no body.
- [ ] Storage retornando `null` continua resultando em `variance: null` (sem crash).

---

### RF-03: Invalidacao de cache server-side em mutations relevantes
**Descricao:** O cache `home-overview-cache` (TTL 30s, user-scoped) deve ser invalidado quando o user conclui uma sessao de grind OU completa um upload CSV — esses dois eventos mudam `actualUsd` da variancia.

**Regras de negocio:**
- `PUT /api/grind-sessions/:id` quando o body tem `status: 'completed'`: chamar `invalidateHomeOverviewCache(userId)` apos commit do storage. Localizar handler em `server/routes/grind-sessions.ts` (handler de update).
- `POST /upload`: idem, chamar invalidator apos persistencia bem-sucedida (handler em `server/routes/upload.ts` ou `routes/tournaments.ts` — descobrir via grep durante implementacao).
- Se o invalidator publico ja existe em `server/services/homeCache.ts` ou similar, reutilizar. Caso contrario, expor `invalidateHomeOverviewCache(userId: string): void` no service do home-overview.
- Lesson #21 aplicada: invalidator deve ser **publico** (exported), chamado pelas mutations, NAO confiar em TTL.

**Criterio de aceitacao:**
- [ ] Concluir sessao via PUT `/api/grind-sessions/:id` invalida cache e proxima GET `/api/home/overview` recomputa variance.
- [ ] Upload CSV idem.
- [ ] Cache continua valido entre GETs sem mutation no meio (TTL respeitado).

---

### RF-04: VarianceCard empty-state quando `expectedSource === 'fallback-zero'`
**Descricao:** Quando o storage retorna `expectedSource: 'fallback-zero'` (user tem >=20 sessoes mas nunca simulou no PrimeDope), VarianceCard deve renderizar um mini-card com CTA para o simulador, em vez de renderizar dados sem contexto.

**Regras de negocio:**
- `VarianceCard.tsx` recebe `data` com shape valido (incluindo `expectedSource: 'fallback-zero'`).
- Quando `data.expectedSource === 'fallback-zero'`:
  - Renderiza card data-testid `home-variance-empty-card`.
  - Titulo: "Simule sua grade para liberar a Variancia esperada".
  - Corpo curto: "Sem simulacao PrimeDope nos ultimos 90 dias. Variancia esperada e desvio dependem da grade simulada."
  - CTA secundaria (label `Abrir simulador`, `href="/coach-ai?tab=variance"`).
  - Emit tracker `home_variance_fallback_view` (novo) na primeira renderizacao (mesma logica `useRef` que o emit atual de `home_variance_view`).
  - NAO renderiza os numeros `actualUsd`/`expectedUsd`/`sigmaMultiple` (seriam ruido sem baseline real).
- Quando `data.expectedSource === 'primedope-cache'`: comportamento atual preservado (renderiza card lucky/normal/unlucky com numeros e emit `home_variance_view`).
- Quando `sessionsCount < 20` (storage retorna `null`): comportamento atual preservado (return `null`, cluster vazio gera `EmptyPerformanceCluster`).

**Criterio de aceitacao:**
- [ ] User com 25 sessoes sem `primedope_runs` ve mini-card empty-state com CTA.
- [ ] CTA aponta para `/coach-ai?tab=variance`.
- [ ] Tracker `home_variance_fallback_view` emite apenas 1x por mount.
- [ ] User com 25 sessoes + `primedope_runs` recente ve VarianceCard com numeros (sem regressao).
- [ ] User com 10 sessoes ve `null` (sem mini-card).

---

### RF-05: Rule "tough-stretch" em `dailyInsight.ts`
**Descricao:** Adicionar uma regra no engine `computeDailyInsight` que detecta variancia muito negativa e mostra card empatico com CTA pro chat do Coach.

**Regras de negocio:**
- Tipo novo: `'tough-stretch'` adicionado ao union `DailyInsightType` em `client/src/lib/home/dailyInsight.ts:28-34`.
- Ordem de prioridade: inserir **entre** `study-gap` (regra 4) e `celebration` (regra 5).
- Condicao: `data.variance !== null && data.variance.status === 'unlucky' && data.variance.sigmaMultiple <= -1.5`.
- Conteudo:
  - title: "Sequencia dificil"
  - body: "Sua variancia 90d esta em {{sigmaMultiple.toFixed(1)}}σ abaixo do esperado. Isso e estatisticamente normal — quer conversar com o Coach?"
  - cta: `{ label: 'Falar com Coach', href: '/coach-ai?tab=chat' }`
  - severity: `'critical'`
  - emoji: codepoint apropriado (ex: `0x1f9d8` lotus reutilizavel, OU criar `0x1f4c9` chart-down). Manter convencao codepoint (lesson lint).
- Cooldown: 2 dias via `localStorage` chave `daily-insight-cooldown:tough-stretch:{userId}`. Cooldown ativo bloqueia a rule (cai pra proxima da ordem).
- Lesson #15 polyfill `MemoryStorage` em `tests/setup.ts` ja aplicado — testes podem usar `localStorage.setItem`/`getItem`.

**Criterio de aceitacao:**
- [ ] User com `variance.sigmaMultiple = -1.8` recebe insight `'tough-stretch'`.
- [ ] User com `variance.sigmaMultiple = -0.9` (unlucky mas nao critico) NAO recebe; cai pra proxima rule.
- [ ] User com `variance.sigmaMultiple = -2.5` e cooldown ativo NAO recebe; cai pra proxima rule.
- [ ] User com `variance === null` (gate <20 sessoes) NAO recebe.
- [ ] CTA aponta para `/coach-ai?tab=chat`.

---

### RF-06: Propagar contexto da grade ao PrimedopePanel
**Descricao:** `PrimedopePanel` recebe hoje apenas `userId` e `bankrollUsd` em `GradePlanner.tsx:971-974`. Para habilitar prefill de buckets (`server/services/primedopeBucketsPrefill.ts` ja existe), o panel precisa do profile letter + day of week da grade ativa.

**Regras de negocio:**
- Em `GradePlanner.tsx`, detectar `activeDayProfile` da grade atualmente exibida (variavel ja existente no escopo do componente — verificar nome durante implementacao).
- Calcular `dayOfWeek` (0=domingo..6=sabado) usando helper `getTodayDayOfWeek()` ou equivalente no projeto.
- Passar como props ao `PrimedopePanel`:
  ```tsx
  <PrimedopePanel
    userId={user?.userPlatformId ?? ''}
    bankrollUsd={bankrollUsd}
    profileLetter={activeDayProfile?.profile ?? null}
    dayOfWeek={getTodayDayOfWeek()}
  />
  ```
- `PrimedopePanel.tsx` aceita novas props (opcionais, `null`-tolerant). Quando ambas presentes, chama `primedopeBucketsPrefill` para preencher buckets iniciais. Quando ausentes, comportamento atual (form vazio).
- NAO mudar layout/visual do panel. Apenas adicao de prefill silencioso.

**Criterio de aceitacao:**
- [ ] User abre `/grade-planner` com grade profile A do dia 3 e clica "Variance Calculator" → buckets pre-preenchidos com torneios do profile A / dia 3.
- [ ] User abre `/coach-ai?tab=variance` direto (fora do GradePlanner) → comportamento atual, form vazio.
- [ ] Props `null` nao causam crash do panel.

---

### RF-07: Invalidacao client-side pos-simulacao
**Descricao:** Apos uma simulacao PrimeDope bem-sucedida, o React Query do `/api/home/overview` deve ser invalidado para que VarianceCard re-renderize com `expectedSource: 'primedope-cache'` ao inves de `'fallback-zero'`.

**Regras de negocio:**
- Localizar hook `useCreatePrimedopeSimulation` (provavelmente em `client/src/hooks/` ou `client/src/components/primedope/`).
- Adicionar `onSuccess` ao `useMutation`:
  ```ts
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/home/overview'] });
    queryClient.invalidateQueries({ queryKey: ['/api/home/variance'] }); // se existir endpoint separado
  }
  ```
- Lesson #13 (apiRequest retorna JSON): nao impacta — apenas wrap de invalidate em callback.

**Criterio de aceitacao:**
- [ ] Apos rodar simulacao no PrimedopePanel, voltar para `/inicio` mostra VarianceCard com `expectedSource: 'primedope-cache'` (sem refresh manual).
- [ ] Cache do home-overview e invalidado tanto server-side (RF-03) quanto client-side (RF-07).

---

### RF-08: CTA secundaria em `EmptyPerformanceCluster`
**Descricao:** O cluster vazio (`EmptyPerformanceCluster.tsx`) hoje so mostra texto "Insights de performance liberados apos 30 sessoes". Adicionar CTA secundaria apenas quando `sessionsCount >= 5` (nao polui onboarding zerado).

**Regras de negocio:**
- Em `client/src/components/home/EmptyPerformanceCluster.tsx`, adicionar bloco condicional:
  ```tsx
  {sessionsCount >= 5 && (
    <a data-testid="empty-cluster-variance-cta" href="/coach-ai?tab=variance" className="...">
      Simular variancia
    </a>
  )}
  ```
- Estilo: link secundario discreto (texto pequeno, cor muted, sem border heavy). Manter compatibilidade com tokens UI (lesson `Docs/conventions/ui-patterns.md`).
- NAO usar `<Link>` Wouter v3 se nao houver QueryClientProvider no path (lesson #29). Se cluster ja vive sob provider, usar Link normal.

**Criterio de aceitacao:**
- [ ] User com `sessionsCount = 0` ve cluster sem CTA.
- [ ] User com `sessionsCount = 8` ve cluster com CTA "Simular variancia".
- [ ] CTA aponta para `/coach-ai?tab=variance`.

---

### RF-09: Rename label da aba Variance Calculator
**Descricao:** Renomear "Variance Calculator (Beta)" para "Simulador PrimeDope" em `client/src/pages/GradePlanner.tsx:959-968` + adicionar tooltip explicativo.

**Regras de negocio:**
- TabsTrigger label/header: "Simulador PrimeDope" (remover sufixo Beta — feature passa a ser referenciada como ponte de variance, nao mais beta).
- Tooltip / subtexto: "Estima variancia esperada via Monte Carlo (PrimeDope.com)".
- `data-testid` existente (`coach-variance-panel`) **NAO muda** (testes existentes dependem dele).
- Strings PT-BR (convencao §8).

**Criterio de aceitacao:**
- [ ] Aba mostra label "Simulador PrimeDope" sem "Beta".
- [ ] Tooltip / subtexto explicativo aparece.
- [ ] Testes existentes que selecionam por `data-testid="coach-variance-panel"` continuam passando.
- [ ] Testes que buscam por texto "Variance Calculator" precisam ser atualizados (responsabilidade do test-writer; documentar).

---

## Requisitos Nao-Funcionais
- **Performance:** `getVarianceVsExpected` deve responder em < 200ms p95 com user de 200 sessoes 90d. Index ja existe em `grind_sessions (user_id, status)` e `primedope_runs_user_profile_day_created_idx`.
- **Robustez:** Falha de FX (`fxResolver` lanca) → fallback para `actualUsd = 0` (NAO crash). Logar via `console.warn` com `userId` parcial.
- **Compatibilidade:** Shape de retorno do storage deve casar **exatamente** com `HomeOverviewBody['variance']` em `server/routes/home.ts:722-736` para nao quebrar serializer.
- **Sanidade numerica:** Toda saida do storage passa por `Number.isFinite` antes de serializar. Sem `NaN` / `Infinity` no body JSON.

## Endpoints Previstos
Nenhum endpoint novo. Apenas reuso de existentes:

| Metodo | Rota | Mudanca |
|---|---|---|
| GET | /api/home/overview | Passa a retornar `variance !== null` quando user tem >=20 sessoes |
| PUT | /api/grind-sessions/:id | Invalida home-overview-cache no commit (RF-03) |
| POST | /upload | Invalida home-overview-cache no commit (RF-03) |

## Modelos de Dados Afetados
**Nenhuma migration nova.** Schema atual suficiente:

- `grind_sessions` — campos consumidos: `id`, `user_id`, `status`, `created_at` (ou `started_at`/`ended_at` se mais semantico para 90d), agregacao de P&L em USD via lookup das `session_tournaments` joinadas + FX (logica equivalente a `getRecentSessions` existente, reuso).
- `primedope_runs` — campos consumidos: `result_json.data.ev`, `result_json.data.stdDev`, `created_at`.
- `users.exchange_rates`, `wallets.exchange_rates`, `system_fx_rates` — consumidos via `fxResolver`.

## Integracoes Externas
Nenhuma. PrimeDope ja integrado via `server/services/primedopeIntegration.ts`.

## Cenarios de Teste Derivados

### Happy Path
- [ ] User Pro com 30 sessoes 90d + 1 `primedope_run` recente → VarianceCard renderiza com `status` baseado em sigma, tracker `home_variance_view` emite.
- [ ] User Pro com 30 sessoes 90d sem `primedope_run` → VarianceCard empty-state com CTA, tracker `home_variance_fallback_view` emite.
- [ ] User completa simulacao PrimeDope → home-overview invalidado client+server → proxima carga mostra `primedope-cache`.

### Validacao de Input / Defesa
- [ ] `primedope_runs.result_json` com `data: null` → fallback-zero sem throw.
- [ ] `primedope_runs.result_json` com `data.ev: 'string'` → fallback-zero (zod parse falha gracioso).
- [ ] FX cascade lanca → `actualUsd = 0`, log warn, sem crash.
- [ ] `sigmaUsd = 0` → `sigmaMultiple = 0` (sem divisao por zero).
- [ ] P&L com NaN em alguma sessao → coerce para 0, agregacao prossegue.

### Regras de Negocio
- [ ] `sessionsCount = 19` → storage retorna `null`, card hidden.
- [ ] `sessionsCount = 20` → storage retorna shape valido, card renderiza.
- [ ] `sigmaMultiple = 0.99` → status `'normal'`.
- [ ] `sigmaMultiple = 1.0` → status `'lucky'`.
- [ ] `sigmaMultiple = -1.0` → status `'unlucky'`.
- [ ] `sigmaMultiple = 50` (extremo) → clamp para `10`.

### Edge Cases
- [ ] User com sessoes 100% BRL → `actualUsd` convertido corretamente (lesson #6).
- [ ] User sem `users.exchange_rates` configurado → fallback para `system_fx_rates` via `fxResolver`.
- [ ] `primedope_runs` com row de 91 dias atras → NAO usado (filtro 90d), fallback-zero.
- [ ] Race: simulacao salva enquanto home-overview busca → proxima GET (apos invalidacao) recupera.
- [ ] User com `variance.sigmaMultiple = -1.5` exato → rule tough-stretch dispara (boundary inclusivo).

### Rule "tough-stretch" (RF-05)
- [ ] Cooldown frio + sigma -1.8 + nao ha hands pendentes / roi-decline → tough-stretch ganha.
- [ ] Cooldown frio + sigma -1.8 + tem 3 starred hands → pending-hands ganha (prioridade maior).
- [ ] Cooldown ativo (last shown 1d atras) → cai pra celebration ou fallback.
- [ ] Sigma -1.4 (acima do threshold) → cai pra proxima rule.

## Fora de Escopo
- **PrimeDope alimentando Tournament Selector** (`server/scoring/tournamentScorer.ts`). Decisao explicitamente diferida para AI-2A. Nenhuma mudanca em `scoring/` ou `selectorCache.ts`.
- **Endpoint dedicado `/api/home/variance`**. Variance continua dentro de `/api/home/overview` (premissa home-reform-2 preservada).
- **Histograma / random runs visiveis em `/inicio`**. Continua exclusivo do PrimedopePanel em `/coach-ai`.
- **Quarterly variance**. Reservado para AI-2B (`career-deep-dive`).
- **Migration nova ou ALTER em `primedope_runs`**. Schema atual suficiente.
- **Refactor de `resolveExchangeRates` em `primedopeIntegration.ts:122-157`**. Ja existe `fxResolver.ts` consolidado; nao duplicar nem extrair de novo. Spec original pedia extracao, mas o servico ja existe — usar como esta.
- **Nudge proativo "B-VARIANCE"** via cron. Variance entra no Insight do Dia (RF-05) + Weekly Report (ja existe). Nao criar nudge dedicado.
- **Mudar gate `>=20 sessoes`**. Manter threshold de home-reform-2.

## Dependencias
- `server/services/fxResolver.ts` (ja existente, ADR-061 + ADR-121).
- `server/services/primedopeBucketsPrefill.ts` (ja existente).
- `client/src/components/home/VarianceCard.tsx` (ja existente, expande).
- `client/src/lib/home/dailyInsight.ts` (ja existente, expande).
- `client/src/pages/GradePlanner.tsx` (ja existente, edita props + label).
- `client/src/components/primedope/PrimedopePanel.tsx` (ja existente, aceita novas props).
- Schema `primedope_runs` (migration 0015 ja aplicada).

## Notas de Implementacao
- **Ordem sugerida de implementacao:**
  1. RF-01 (storage) — desbloqueia tudo o resto.
  2. RF-02 (sanitize routes) — defesa em profundidade pos-RF-01.
  3. RF-03 (invalidacao server-side) — necessario antes de RF-07.
  4. RF-04 (empty-state card) — torna RF-01 fallback util.
  5. RF-07 (invalidacao client-side) — fecha o loop simulacao → home.
  6. RF-06 (props GradePlanner → PrimedopePanel) — independente.
  7. RF-08 (CTA cluster vazio) — independente.
  8. RF-09 (rename label) — cosmetico, ultimo.
  9. RF-05 (tough-stretch) — depende de RF-01 retornar `variance !== null`.

- **Lessons aplicaveis (do CLAUDE.md §9):**
  - **#1 hooks first** — `VarianceCard` em RF-04 mantem `useRef` + `useEffect` ANTES do early return. Nao quebrar Rules of Hooks ao adicionar branch `expectedSource`.
  - **#2 data-testid estavel** — `home-variance-card` preserva; novo `home-variance-empty-card` e `empty-cluster-variance-cta` adicionados.
  - **#6 FX antes de threshold USD** — agregacao P&L em USD obrigatoria ANTES de cruzar com `expectedUsd`/`sigmaUsd` (que ja vem em USD do PrimeDope).
  - **#11 spec eh fonte de verdade** — VarianceCard nao adiciona logica extra alem do que esta nesta spec; status/threshold seguem RF-01.
  - **#13 apiRequest retorna JSON** — RF-07 hook `useCreatePrimedopeSimulation` ja usa pattern atual, so adicionar `onSuccess`.
  - **#14 / #26 require() vs await import** — testes que precisam carregar VarianceCard / EmptyPerformanceCluster usam `await import(...)`, NAO `require()`.
  - **#21 cache server-side TTL precisa invalidator publico** — RF-03 expoe `invalidateHomeOverviewCache(userId)` chamado por mutations; nao depender de TTL 30s.
  - **#28 vi.mock por path exato** — testes que mockam `fxResolver` precisam mockar o path real importado pelo storage (`server/services/fxResolver`), nao alias.
  - **#32 db.transaction fallback** — RF-01 NAO precisa de transaction (read-only). Sem aplicacao.

- **Telemetria nova:**
  - `home_variance_fallback_view` (RF-04) — quando empty-state card renderiza pela primeira vez no mount.
  - Tracker existente `home_variance_view` (mantido) — apenas quando card "real" com numeros renderiza.

- **Risco de regressao:**
  - Mudar `getVarianceVsExpected` de `null` para shape pode quebrar testes que assumem `variance === null` no body. Auditar `tests/server/routes/home*.test.ts` antes de implementar.
  - Mudar label da aba (RF-09) quebra testes que buscam por texto "Variance Calculator". `data-testid` preservado mitiga, mas pode haver testes por texto.

- **Plano de teste sugerido para o test-writer:**
  - Unit `storage.getVarianceVsExpected`: 8 cenarios (happy primedope, happy fallback, <20 sessoes, shape quebrado, FX mix BRL, sigmaUsd=0, sigmaMultiple clamp, NaN sanitize).
  - Unit `dailyInsight` rule tough-stretch: 5 cenarios (boundary -1.5, abaixo do threshold, cooldown ativo, variance null, priority vs pending-hands).
  - Integration route `/api/home/overview`: 3 cenarios (variance primedope-cache, variance fallback-zero, variance null).
  - Component `VarianceCard`: 3 cenarios (renderiza real, renderiza empty-state, retorna null).
  - Component `EmptyPerformanceCluster`: 2 cenarios (com CTA >=5, sem CTA <5).
  - Hook `useCreatePrimedopeSimulation` onSuccess: 1 cenario (invalida `['/api/home/overview']`).
