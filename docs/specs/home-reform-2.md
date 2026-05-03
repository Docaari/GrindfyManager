# Spec: Home Reform Onda 2 (home-reform-2)

## Status
Proposta — pipeline TDD autonomo, founder AFK.

## 1. Visao Geral

Onda 2 da reforma da Home cobre 6 blocos prioritarios que **substituem stubs vazios da Onda 1** por dados reais e adicionam **3 novos cards inteligentes** (Stats Top Deltas, Variance Check, Tournament Recommendations + Heuristics). Tudo entra como **extensao do payload `/api/home/overview`** (zero migration nova; reutiliza schema existente). D14 timezone-aware fecha um gap conhecido da Onda 1.

**Premissas inalteradas (Ondas 1 e 1.5):**
- Endpoint unico `/api/home/overview` com cache in-memory 30s per-userId (ADR-102).
- Subqueries via `Promise.allSettled` + timeout 800ms cada (graceful degradation).
- `userState` (`empty | power`) + `profile` (`upload-only | session-only | hybrid | new`) ja resolvidos.
- Sidebar/Header/StatusStrip ja entregues.

**O que muda nesta Onda:**
- 5 stubs em `server/storage.ts` (`getProfileStateForDay`, `getCurrentBankroll`, `getActiveCooldown`, `getActiveFlightSeries`, `getPendingStarredHands`) viram **implementacoes reais** com queries Drizzle.
- 3 subqueries novas (`topDeltas`, `variance`, `tournamentRecommendations`) entram em `Promise.allSettled` no handler.
- 1 helper computado server-side `heuristics` (motor simples baseado em quickStats + recentSessions + variance).
- Timezone-aware via `users.timezone` (campo ja existe no schema, default `America/Sao_Paulo`).
- 4 componentes React novos em `client/src/components/home/`.

**Foco entregavel:** ~1 sessao auto. Sem features irreversiveis. Zero migration.

---

## 2. Defaults Aceitos (auto mode founder AFK)

| Decisao | Default escolhido | Justificativa |
|---|---|---|
| Top Deltas: lookback | `last 30d snapshots vs lifetime baseline` | Reutiliza periodo de `getDashboardPerformance`; baseline lifetime evita ruido de 1 sessao recente. |
| Top Deltas: filtro de stat | `apenas stats com sampleSize >= 100 em ambas medicoes` | ADR-089 ja exige amostra minima por stat. |
| Top Deltas: severity threshold | `>20% absoluto = high; 10-20 = medium; 5-10 = low; <5 = ignorado` | Empirico, ajustavel via constants em `shared/`. |
| Variance: minimo de sessoes | `>=20 sessoes finalizadas com PnL` | Spec do bloco. Senao bloco inteiro fica oculto. |
| Variance: comparador | `actual ROI vs expected ROI (PrimeDope cache se houver, senao baseline simples = 0%)` | PrimeDope ja roda em F4; cache hit reutilizado. Sem cache, fallback simples. |
| Variance: status thresholds | `deviation > +1.5 sigma = lucky; -1.5 a +1.5 = normal; < -1.5 = unlucky` | 1.5 sigma e padrao bem-aceito em poker analytics. |
| TournamentRecommendations: filtro | `score >= 70 AND grade in [S, A, B] AND startTime hoje futuro` | Threshold do Tournament Selector. |
| TournamentRecommendations: limite | `top 3` | Spec do bloco. Ordenacao: score DESC, depois startTime ASC. |
| Heuristics: limite | `max 3` | Espaco limitado no card; redutor de cognitive load. |
| Heuristics: severities suportadas | `info \| caution \| positive` | Compativel com Tailwind tokens existentes (`text-amber-*`, `text-emerald-*`, `text-zinc-*`). |
| Heuristics: regras Onda 2 | 4 regras simples: `roi-30d-vs-60d-drop`, `best-day-of-week`, `worst-day-of-week-warning`, `cash-pace-vs-baseline` | Auditavel em `server/services/homeHeuristics.ts`. |
| Bankroll FX aggregation | Reutilizar `walletService.getConsolidatedBalance(userId)` (ja resolve FX cascata ADR-033) | Evita duplicar logica FX. ADR-033 ja documentado. |
| Bankroll deltaPct7d | `(currentTotalUSD - balance7daysAgoUSD) / balance7daysAgoUSD * 100` via `bankroll_snapshots` agregados por dia | Reutiliza `getBankrollSnapshots` filtrado por intervalo. |
| Bankroll sparkline | 7 pontos (1 por dia ultimos 7 dias) usando snapshots agregados | Comeca consistente com sparkline ROI 30d (Onda 1). |
| Bankroll bisAvailable | `floor(totalUSD / softLimitUSD)` se bankroll configurado, senao null | Reutiliza `computeThresholds` ja em uso. |
| Pending starred hands status filter | `WHERE status IN ('pending')` | `status` enum ja inclui pending (default). |
| Pending starred hands limit | 5 (mesmo da Onda 1) | Mantem contrato visual. |
| Cooldown active | `WHERE completedAt IS NULL ORDER BY startedAt DESC LIMIT 1` | Cooldown sem `completedAt` = ativo (semantica Sprint Cooldown-3). |
| Flight active | `WHERE day2Status='pending' AND day2DateTime > now() ORDER BY day2DateTime ASC LIMIT 1` | Series com Day 2 pendente futuro. |
| ProfileStateForDay | Retornar `{ profile, plannedCount, firstStartTime, stopLoss, stopTime, hasWarmupToday }` consultando `profile_states` (se tabela existe; senao null) | Onda 1 ja consome esse shape; Onda 2 popula. |
| Timezone | Ler `users.timezone` (default `America/Sao_Paulo`); fallback final `America/Sao_Paulo` | Schema ja tem o campo. |
| Cache invalidation | Manter TTL 30s. Onda 2 nao adiciona invalidacao explicita; eventual consistency aceitavel. | Founder ok com 30s lag (Onda 1 D4). |

---

## 3. Blocos B7-B12

### B7. Stats Analyzer Top 3 Deltas (RF-29)

**Fonte de dados:** `hud_stat_snapshots` (Drizzle) + `hud_layouts.sections` para target ranges.

**Comportamento backend:**
- Subquery `topDeltas` em `home.ts` chamando novo wrapper `storage.getStatsTopDeltas(userId, opts?)`.
- Wrapper:
  1. Busca todos snapshots do user nos ultimos 30d (capturedAt >= now - 30d).
  2. Busca um baseline = snapshot mais antigo do user dentro do mesmo layout (lifetime). Se nao existir baseline >30d antes do mais recente, **bloco oculto** (`topDeltas: []`).
  3. Para cada stat key presente em ambos com `sampleSize >= 100`, calcula delta absoluto: `|recent.value - baseline.value|`.
  4. Ordena por delta absoluto DESC, retorna top 3.
  5. Severity: `>20 = high`, `10-20 = medium`, `5-10 = low`, `<5 ignorado` (filtra fora).
- Output:
  ```ts
  topDeltas: Array<{
    stat: string;          // e.g. "vpip"
    statLabel: string;     // e.g. "VPIP" (resolvido via hud_stat_targets.label se houver)
    baseline: number;
    current: number;
    delta: number;         // signed (current - baseline)
    deltaAbs: number;      // |delta|
    severity: 'high' | 'medium' | 'low';
    direction: 'positive' | 'negative' | 'neutral';   // baseado em target range se houver
    period: '30d';
  }>
  ```
- **Direction**: usa `hudStatTargets` (existe via `hud_stat_targets` table) — se delta empurra valor para dentro de target = positive; saindo de target = negative; sem target = neutral.

**Comportamento frontend:** componente `<StatsTopDeltas>` em `client/src/components/home/`.
- Render: lista 3 chips. Cada chip: label + valor atual + arrow + delta + cor por severity/direction.
- Empty state (`topDeltas.length === 0`): texto "Importe HUD para ver insights" + CTA `<Link href="/stats-analyzer">Abrir Stats Analyzer</Link>`.
- Loading: skeleton.
- Error (subquery falhou e veio `null`): bloco renderiza vazio (nao quebra).

**Tracker events:** `home.statsTopDeltas.viewed` (impressao), `home.statsTopDeltas.clicked` (click em chip).

---

### B8. Variance Check PrimeDope (RF-30)

**Fonte de dados:** `grind_sessions` finalizadas com `profit` + cache `primedope_simulations` (ja existe via `primedopeIntegration.ts`).

**Comportamento backend:**
- Subquery `variance` chamando `storage.getVarianceVsExpected(userId)` novo wrapper.
- Wrapper:
  1. Conta sessoes finalizadas com PnL nos ultimos 90d. Se `< 20`, retorna `null` (bloco oculto).
  2. Soma PnL real (USD via FX cascata ADR-033).
  3. Calcula `expected`:
     - Tenta ler ultimo `primedope_simulations` em cache do user (busca via `getLatestPrimedopeSimulation(userId)` se disponivel).
     - Se cache hit: `expected = cache.medianRoi * sumBuyinsUsd`.
     - Se cache miss: `expected = 0` (assume zero-EV); retorna campo extra `expectedSource: 'fallback-zero'`.
  4. Calcula `deviation = (actual - expected)`. Sigma = stddev de PnL por sessao (formula populacional simples).
  5. `status`:
     - `deviation > 1.5 * sigma` → `lucky`
     - `-1.5 * sigma <= deviation <= 1.5 * sigma` → `normal`
     - `deviation < -1.5 * sigma` → `unlucky`
- Output:
  ```ts
  variance: {
    sessionsCount: number;
    actualUsd: number;
    expectedUsd: number;
    expectedSource: 'primedope-cache' | 'fallback-zero';
    deviationUsd: number;
    sigmaUsd: number;
    sigmaMultiple: number;       // deviation / sigma (sinalizado)
    status: 'lucky' | 'normal' | 'unlucky';
    period: '90d';
  } | null
  ```

**Comportamento frontend:** componente `<VarianceCard>`.
- Render quando `variance !== null`: badge status (verde/zinc/ambar), valores actual e expected, sigma multiple com 1 decimal.
- `variance === null`: bloco oculto inteiramente (nao reservar espaco).
- Tooltip explicando "running good/bad nao significa skill"; link para `/stats-analyzer/variance` (placeholder se nao existir).
- Tracker: `home.variance.viewed`, `home.variance.tooltip.opened`.

---

### B9. Tournament Selector Top 3 Hoje (RF-31)

**Fonte de dados:** chamada interna a `handleTournamentSelector` (importacao direta da funcao em `server/routes/tournament-selector.ts`).

**Comportamento backend:**
- Subquery `tournamentRecommendations` em `home.ts` chama:
  ```ts
  await handleTournamentSelector({
    userId,
    date: todayIso,
    sources: 'suprema,library',
    minScore: 70,
    bankrollFilter: false,
    lookbackDays: 180,
  });
  ```
- Filtra `tournaments` pelo grade in `['S', 'A', 'B']` e `startTime > now`.
- Top 3 por `score DESC` + tiebreaker `startTime ASC`.
- Output:
  ```ts
  tournamentRecommendations: Array<{
    id: string;
    name: string;
    buyinUsd: number;
    buyinNative: number;
    currency: string;
    score: number;       // 0-100
    grade: 'S' | 'A' | 'B';
    startTime: string;   // ISO
    platform: string;
    alreadyInGrid: boolean;
  }>
  ```
- Edge: handleTournamentSelector falhou → array vazio + bloco mostra "configure grade" empty state.
- Edge: gradePlanner vazio (planejados zero) ainda gera recomendacoes (Suprema basta).

**Comportamento frontend:** componente `<TournamentRecommendations>`.
- Lista 3 cards horizontais: nome trim 40 chars, badge grade colorido, buyin (USD primario, nativa secundaria), startTime formatado HH:mm via timezone do user (vem como Date no client).
- CTA por card: "Adicionar a Grade" (POST `/api/planned-tournaments` ja existe; opcional Onda 3).
- Empty state (`tournamentRecommendations.length === 0`):
  - Se planejados de hoje > 0: texto "Sem recomendacoes acima de score 70 hoje".
  - Senao: "Configure sua grade para ver recomendacoes" + CTA `<Link href="/grade-planner">Abrir Grade</Link>`.
- Tracker: `home.tournamentRec.viewed`, `home.tournamentRec.cta.clicked` (com payload {grade, score}).

**RNF:** Subquery interna NAO chama HTTP (chama funcao diretamente). Suprema scraping respeita timeout 800ms global. Fallback `[]` se ultrapassar.

---

### B10. Storage stubs reais — 5 wrappers (RF-32)

Substituicao completa em `server/storage.ts` linhas 9515-9563 (mesmas assinaturas, valores reais).

**B10.1 `getPendingStarredHands(userId, limit=5)`**
- Query Drizzle:
  ```sql
  SELECT id, hero, context, tag, created_at, type, spot
  FROM starred_hands
  WHERE user_id = $1 AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT $2
  ```
- Map para shape consumido pela Home:
  ```ts
  { id, hero, context, tag, ageRelative }
  ```
  - `hero`: `notes ?? type` (sem campo hero hoje; usa tipo).
  - `context`: derivado de `spot` + `type`.
  - `ageRelative`: `formatDistanceToNow(createdAt)` (lib `date-fns` ja em uso).
- Erro: throw para que `home.ts` capture via `Promise.allSettled` e retorne null.

**B10.2 `getProfileStateForDay(userId, dayOfWeek)`**
- Verificar se tabela `profile_states` existe (Grade Planner). Se sim, query simples:
  ```sql
  SELECT profile_letter, planned_count, first_start_time, stop_loss_amount,
         stop_loss_currency, stop_time, has_warmup_today
  FROM profile_states
  WHERE user_id = $1 AND day_of_week = $2
  LIMIT 1
  ```
- Se tabela NAO existir (Grade Planner pre-Onda-2): manter `return null` mas adicionar log estruturado uma unica vez por boot. Onda 2 NAO cria a tabela.
- Map:
  ```ts
  {
    profile: 'A'|'B'|'C'|'OFF'|null,
    stopLoss: { amount, currency } | null,
    stopTime: string | null,
    hasWarmupToday: boolean,
  }
  ```
- **Decisao auto:** se `profile_states` table nao existe, deixar wrapper inalterado (return null). Spec testa apenas o caminho com tabela existente. Re-confirmar via Glob na fase architect.

**B10.3 `getCurrentBankroll(userId)`**
- Reutilizar `walletService.getConsolidatedBalance(userId)` (ja resolve FX).
- Se `walletCount === 0`: retornar `null` (sinal "wallets nao configurados").
- Se walletCount > 0:
  ```ts
  {
    totalUsd: number,
    walletsCount: number,
    bisAvailable: number | null,   // floor(totalUsd / softLimitUSD) ou null se bankroll nao configurado
    deltaPct7d: number | null,     // computado via bankroll_snapshots
    sparkline: number[],            // 7 pontos USD (1 por dia ultimos 7d)
  }
  ```
- `deltaPct7d`:
  - Buscar `bankroll_snapshots` `WHERE userId AND occurredAt >= now - 7d`.
  - `balance7daysAgo = max(occurredAt < now - 7d).newAmount` (ou `currentTotalUsd - sum(deltas 7d)`).
  - `delta = (current - balance7daysAgo) / balance7daysAgo * 100`. Se balance7daysAgo === 0 → null.
- `sparkline`:
  - Particionar 7 dias: para cada dia `d` em `[now-6d ... now]`, pegar ultimo snapshot `<=` fim do dia. Ordenado ASC. Tamanho fixo 7. Se snapshots insuficientes, repetir ultimo valor conhecido.

**B10.4 `getActiveCooldown(userId)`**
- Query:
  ```sql
  SELECT id, mode, started_at, completed_at, session_id
  FROM cooldown_logs
  WHERE user_id = $1 AND completed_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1
  ```
- Se vazio → null.
- Se row encontrada:
  ```ts
  {
    active: true,
    until: string | null,   // started_at + 30min default; computado server-side
    type: 'manual' | 'stop-loss' | 'time-stop',  // mapear a partir de mode/blocksCompleted
    cooldownId: string,
    sessionId: string,
  }
  ```
- Mapeamento `type`: schema atual `mode` = `'full' | 'quick'`. Onda 2 usa heuristica simples: `mode === 'quick' → 'time-stop'`, senao `'manual'`. Caso `stop-loss` seria detectado via `blocksCompleted` flags em sprint dedicado; aceito gap.

**B10.5 `getActiveFlightSeries(userId)`**
- Query:
  ```sql
  SELECT id, name, day2_datetime, total_day1s, stack_mode
  FROM tournament_series
  WHERE user_id = $1 AND day2_status = 'pending' AND day2_datetime > now()
  ORDER BY day2_datetime ASC
  LIMIT 1
  ```
- Se vazio → null.
- Se row:
  ```ts
  {
    active: true,
    seriesTitle: string,        // name
    nextDayStartTime: string,   // day2_datetime ISO
    currentStackBb: number,     // 0 (placeholder; calcular via planned_tournaments.baggedAt requer Sprint dedicado)
    day: 2,                     // sempre 2 (Onda 2 nao trata Day 3+)
  }
  ```
- **Aceito gap:** `currentStackBb` retorna 0 (frontend ja oculta quando 0). Sprint Flight-2 popula real.

---

### B11. D14 timezone-aware (RF-33)

**Backend:** `home.ts` linha 261-263 (calculo dayOfWeek + todayIso).
- Antes (Onda 1):
  ```ts
  const today = new Date();
  const dayOfWeek = today.getDay();
  const todayIso = today.toISOString().slice(0, 10);
  ```
- Depois (Onda 2):
  ```ts
  const userTimezone = await storage.getUserTimezone(userId) ?? 'America/Sao_Paulo';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: userTimezone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const todayIso = `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}-${parts.find(p=>p.type==='day').value}`;
  // dayOfWeek a partir de Date construido na timezone
  const dayOfWeek = new Date(`${todayIso}T12:00:00Z`).getUTCDay();
  ```

**Storage helper novo:** `storage.getUserTimezone(userId): Promise<string | null>`.
- Query: `SELECT timezone FROM users WHERE user_platform_id = $1`.
- Cache: in-memory simples (Map<userId, {tz, expiresAt}>) com TTL 5min para evitar 1 query extra a cada request.

**Frontend:** o payload ja vem com `todayIso` e `userTimezone` em `meta` para uso de formatacao.
- Adicionar campo `meta.userTimezone: string` no payload `/api/home/overview`.
- Componentes que renderizam horario (NextTournamentCountdown, TournamentRecommendations) consomem esse campo e formatam via `Intl.DateTimeFormat`.

**Edge cases:**
- Timezone invalido em `users.timezone`: catch erro do `Intl.DateTimeFormat`, fallback `America/Sao_Paulo`, log estruturado.
- Coluna `timezone` ausente em row: fallback default. (schema ja garante via `default('America/Sao_Paulo')`).

---

### B12. Heuristicas server-side (RF-34)

**Servico novo:** `server/services/homeHeuristics.ts`.

**Input:**
```ts
interface HeuristicsInput {
  userId: string;
  quickStats: { totalTournaments: number; totalSessions: number; activeDays: number; currentStreakDays: number };
  performance30d: { roi: number; itm: number; cash: number };
  performance60d: { roi: number; itm: number; cash: number };
  recentSessions: Array<{ date: string; pnlUsd: number }>;
  variance: { status: 'lucky'|'normal'|'unlucky'; sigmaMultiple: number } | null;
  todayDayOfWeek: number;
}
```

**Output:**
```ts
heuristics: Array<{
  id: string;            // estavel para tracking
  message: string;       // PT-BR, max 100 chars
  severity: 'info' | 'caution' | 'positive';
  ctaHref: string | null;
}>
```

**Regras Onda 2 (em ordem de prioridade; pega top 3 disparados):**

1. **`roi-30d-vs-60d-drop` (severity: caution)**
   - Trigger: `performance60d.roi - performance30d.roi >= 5` (queda absoluta de 5pp).
   - Mensagem: `"ROI 30d caiu ${(60d-30d).toFixed(1)} pp vs 60d. Revisar selecao de torneios."`
   - CTA: `/tournament-selector`.

2. **`best-day-of-week` (severity: positive)**
   - Trigger: nas ultimas 60 sessoes, identificar dia da semana com maior ROI medio (>=5 sessoes na sample). Se diferenca p/ media geral >= 10pp, dispara.
   - Mensagem: `"${diaPt} costuma ser seu melhor dia (ROI ${roiDia.toFixed(1)}%)."`
   - CTA: `/dashboard?period=60d`.

3. **`worst-day-of-week-warning` (severity: caution)**
   - Trigger: dia da semana com pior ROI nas ultimas 60 sessoes (>=5 sessoes na sample). Diff <= -10pp vs media e o dia da semana atual e esse dia.
   - Mensagem: `"${diaPt} historicamente teve ROI ${roiDia.toFixed(1)}%. Considere reduzir exposicao."`
   - CTA: `/grade-planner`.

4. **`cash-pace-vs-baseline` (severity: info ou positive)**
   - Trigger: total cash 30d vs media historica. `cash30d / (cashLifetime / monthsLifetime) > 1.2` → positive `"Pace de cash 20%+ acima da media."`. < 0.8 → caution `"Pace de cash 20%+ abaixo da media."`.
   - CTA: `/dashboard`.

**Frontend:** componente `<HeuristicsCard>`.
- Render: lista vertical de ate 3 heuristicas.
- Cada item: icone por severity + mensagem + chevron CTA opcional.
- Empty state: bloco oculto se array vazio (NAO render placeholder).
- Tracker: `home.heuristics.viewed`, `home.heuristics.clicked` (payload {id, severity}).

**RNF:** Servico puro, testavel isolado. NAO faz I/O. `home.ts` injeta inputs ja agregados.

---

## 4. Escopo OUT (Onda 3+)

- Coach Insight diario backend cron + Anthropic API.
- News real xAI Grok integration.
- Goal tracker (metas semanais/mensais).
- Customizacao layout home (toggle blocos / drag-drop).
- Push notifications de heuristicas (`web push`).
- Heuristicas avancadas (combo de stats + bankroll + tilt).
- Day 3+ flights (multi-dia). Onda 2 trata apenas Day 2.
- `currentStackBb` real em flight banner (placeholder 0).
- Cooldown `stop-loss` detection automatica (mapeamento mode atual nao distingue).

---

## 5. Requisitos Funcionais

### RF-29 — Stats Analyzer Top 3 Deltas

**Descricao:** Exibir top 3 stats com maior delta absoluto entre snapshot mais recente (30d) e baseline lifetime.

**Regras de negocio:**
- Apenas stats com `sampleSize >= 100` em ambos snapshots.
- Severity high (>20), medium (10-20), low (5-10), <5 ignorado.
- Direction baseada em target range (`hud_stat_targets.targetMin/Max`): empurrar p/ dentro = positive; sair = negative.
- Empty state se `< 1 snapshot 30d` ou nenhum stat passou filtro.

**Criterios de aceite:**
- [ ] `topDeltas` e array de no maximo 3 entradas.
- [ ] Cada entrada tem campos: `stat, statLabel, baseline, current, delta, deltaAbs, severity, direction, period`.
- [ ] Ordenacao por `deltaAbs DESC`.
- [ ] User sem snapshots 30d retorna `topDeltas: []`.
- [ ] User com snapshots mas nenhum acima do threshold retorna `topDeltas: []`.
- [ ] Componente `<StatsTopDeltas>` renderiza skeleton em loading, empty CTA quando array vazio.
- [ ] Componente nao quebra quando subquery falha (recebe undefined/null).
- [ ] Tracker `home.statsTopDeltas.viewed` dispara apos mount com `count >= 1`.
- [ ] Tracker `home.statsTopDeltas.clicked` dispara em click de chip com payload `{stat, severity}`.

---

### RF-30 — Variance Check PrimeDope

**Descricao:** Calcular se ROI atual de 90d esta dentro de banda esperada (PrimeDope simulation cache OR fallback zero-EV).

**Regras de negocio:**
- Bloco oculto se `< 20 sessoes finalizadas com PnL` em 90d.
- `expected` = simulated medianRoi * sumBuyinsUsd se cache PrimeDope hit; senao 0 com `expectedSource: 'fallback-zero'`.
- Sigma = stddev populacional de PnL por sessao em USD.
- Status: `lucky` se sigmaMultiple > 1.5; `normal` se [-1.5, 1.5]; `unlucky` se < -1.5.

**Criterios de aceite:**
- [ ] User com 19 sessoes em 90d: `variance: null`.
- [ ] User com 20 sessoes em 90d: `variance.sessionsCount === 20`.
- [ ] Cache hit PrimeDope: `variance.expectedSource === 'primedope-cache'`.
- [ ] Cache miss: `variance.expectedSource === 'fallback-zero'`, `expectedUsd === 0`.
- [ ] Sigma multiple correto (testavel com fixture de 20 sessoes).
- [ ] Status correto para deviation > 1.5 sigma (lucky).
- [ ] Componente `<VarianceCard>` oculto quando `variance === null`.
- [ ] Tracker `home.variance.viewed` dispara apenas quando renderizado.

---

### RF-31 — Tournament Selector Top 3 Hoje

**Descricao:** Exibir top 3 torneios recomendados para hoje com score >= 70 e grade S/A/B.

**Regras de negocio:**
- Reusa `handleTournamentSelector({date: todayIso, sources: 'suprema,library', minScore: 70, lookbackDays: 180})`.
- Filtra `grade in ['S', 'A', 'B']` e `startTime > now`.
- Top 3 por `score DESC` + tiebreaker `startTime ASC`.

**Criterios de aceite:**
- [ ] User sem grade configurada e Suprema disponivel: ainda retorna top 3 (Suprema basta).
- [ ] User sem grade e Suprema falhou: `tournamentRecommendations: []`.
- [ ] Cada item tem `id, name, buyinUsd, buyinNative, currency, score, grade, startTime, platform, alreadyInGrid`.
- [ ] `score >= 70` e `grade in [S,A,B]` para todos retornados.
- [ ] `startTime` do primeiro item >= now (sem torneios passados).
- [ ] Componente renderiza 3 cards.
- [ ] Empty state com CTA correto (sem grade vs sem score>=70 hoje).
- [ ] Tracker `home.tournamentRec.viewed` (count >=1) e `home.tournamentRec.cta.clicked` com payload.

---

### RF-32 — Storage stubs reais (5 wrappers)

**Descricao:** Substituir 5 stubs em `server/storage.ts` por queries Drizzle reais.

**Regras de negocio:** Listadas em §3 B10.

**Criterios de aceite:**
- [ ] `getPendingStarredHands` retorna array com shape `{id, hero, context, tag, ageRelative}`.
- [ ] Filtra `status = 'pending'`.
- [ ] `getCurrentBankroll`: walletCount=0 retorna null; walletCount>0 retorna shape completo.
- [ ] `deltaPct7d` calculado quando ha snapshots dos ultimos 7d; null caso contrario.
- [ ] `sparkline` tem exatamente 7 elementos.
- [ ] `getActiveCooldown` retorna null se nao ha cooldown ativo; retorna `{active: true, ...}` caso contrario.
- [ ] `getActiveFlightSeries` retorna null se nao ha series com day2 pendente futuro; retorna `{active: true, ...}` caso contrario.
- [ ] `getProfileStateForDay`: caminho com tabela `profile_states` retorna shape; caminho sem tabela retorna null sem throw.
- [ ] Todos wrappers logam erro estruturado em catch antes de re-throw (Lesson #9).

---

### RF-33 — Timezone-aware computation

**Descricao:** Calcular `todayIso` e `dayOfWeek` baseado em `users.timezone` em vez de servidor local.

**Regras de negocio:**
- Ler `users.timezone`. Default `America/Sao_Paulo`.
- Cache in-memory 5min para timezone.
- Fallback `America/Sao_Paulo` em caso de timezone invalido.

**Criterios de aceite:**
- [ ] User com `timezone='America/New_York'`: `todayIso` reflete data local NY (no boundary das 23h Sao_Paulo).
- [ ] User com timezone NULL: usa default `America/Sao_Paulo`.
- [ ] User com timezone string invalida (`'Foo/Bar'`): fallback default + log estruturado.
- [ ] `meta.userTimezone` presente no payload.
- [ ] Cache evita 2 queries para mesmo user em janela de 5min.

---

### RF-34 — Heuristicas server-side

**Descricao:** Servico `homeHeuristics.ts` puro que recebe inputs agregados e retorna ate 3 heuristicas.

**Regras de negocio:** 4 regras listadas em §3 B12. Ordem fixa de prioridade. Top 3 retornadas.

**Criterios de aceite:**
- [ ] Servico testavel isoladamente (sem I/O).
- [ ] Input `performance30d.roi=10, performance60d.roi=20` dispara `roi-30d-vs-60d-drop` com mensagem correta.
- [ ] Input com 5+ sessoes em domingo com ROI 30pp acima da media dispara `best-day-of-week`.
- [ ] Pior dia da semana SO dispara se `todayDayOfWeek === piorDia`.
- [ ] `cash-pace-vs-baseline` calcula corretamente meses lifetime.
- [ ] `heuristics.length <= 3`.
- [ ] Cada item tem `id, message, severity, ctaHref`.
- [ ] Mensagens em PT-BR.
- [ ] Componente `<HeuristicsCard>` oculto se array vazio.
- [ ] Tracker `home.heuristics.viewed` dispara apenas com `count >= 1`.
- [ ] Tracker `home.heuristics.clicked` payload `{id, severity}`.

---

### RF-35 — Payload extension `/api/home/overview`

**Descricao:** Estender body de `/api/home/overview` adicionando 4 campos novos sem quebrar consumers existentes.

**Regras de negocio:**
- Campos NOVOS: `topDeltas`, `variance`, `tournamentRecommendations`, `heuristics`.
- Campo `meta` ganha `userTimezone: string`.
- Cache TTL inalterado (30s). Cache key inalterado (per-userId).
- Subqueries novas seguem `Promise.allSettled` + timeout 800ms (graceful degradation).

**Criterios de aceite:**
- [ ] Payload contem todos campos da Onda 1 + Onda 2.
- [ ] Campos novos sao `null` ou `[]` quando subquery falha (nunca undefined).
- [ ] `meta.userTimezone` sempre presente (default `America/Sao_Paulo`).
- [ ] `meta.subqueryTimingsMs` inclui timings das 4 subqueries novas.
- [ ] Latencia total p95 < 1500ms (RNF Onda 1 mantida).
- [ ] Cache hit retorna mesmos campos com `meta.cacheHit: true`.
- [ ] Backward compat: clients da Onda 1 nao quebram (campos novos ignorados).

---

## 6. Requisitos Nao-Funcionais

- **Perf:** p95 < 1500ms total endpoint. Cada subquery nova respeita timeout 800ms.
- **A11y:** Componentes novos atendem WCAG AA: contrast >=4.5, aria-label em chips, focus visible, semantica semantica (lista de heuristicas em `<ul>`, etc).
- **Mobile:** Layout responsivo. Componentes novos cabem em viewport 360px (chips em grid 1 col mobile, 3 col desktop).
- **Tokens UI:** Reutilizar `@/lib/ui-tokens` + Tailwind. Severity colors:
  - `info` = `text-zinc-300`
  - `caution` = `text-amber-300`
  - `positive` = `text-emerald-300`
  - `negative` = `text-rose-300`
- **i18n:** UI em PT-BR. Mensagens de heuristics em PT-BR. Stat labels podem manter ingles (compativel com Hand2Note).
- **Telemetria:** Cada componente novo emite `viewed` em mount e `clicked`/`cta.clicked` em interacao.
- **Cache:** in-memory cache de timezone com TTL 5min e CAP 5000 entries (LRU-ish). Sem persistencia.
- **Error handling:** Subqueries que falham retornam null/[]. Frontend nao quebra. Logs estruturados com `[home/overview] subquery=NAME failed:` (Onda 1).
- **Testabilidade:** Heuristics service e wrappers de storage testaveis isoladamente. Componentes React com `data-testid` estavel (Lesson #2).

---

## 7. Modelo de Dados

**Zero migration nova.** Todas tabelas usadas ja existem:

| Tabela | Uso Onda 2 | Notas |
|---|---|---|
| `users` | `timezone` para B11 | Campo ja existe. |
| `wallets` | Aggregation via `walletService.getConsolidatedBalance` | B10.3. |
| `wallet_transactions` | Implicito via service | B10.3. |
| `bankroll_snapshots` | Calculo deltaPct7d + sparkline | B10.3. |
| `cooldown_logs` | B10.4 | Filtra `completed_at IS NULL`. |
| `tournament_series` | B10.5 | Filtra `day2_status='pending' AND day2_datetime > now()`. |
| `starred_hands` | B10.1 | Filtra `status='pending'`. |
| `hud_stat_snapshots` | B7 (topDeltas) | Filtra `captured_at >= now-30d`. |
| `hud_stat_targets` | B7 (direction) | Lookup label + target range. |
| `grind_sessions` | B8 (variance) | Filtra `status='completed' AND profit IS NOT NULL`. |
| `tournaments` (Suprema cache?) | B9 (via handleTournamentSelector) | Reuso indireto. |
| `planned_tournaments` | B9 (alreadyInGrid) | Reuso indireto. |
| `primedope_simulations` (se existir) | B8 (expected) | Cache lookup. |
| `profile_states` (se existir) | B10.2 | Conditional; gap aceito se ausente. |

**Validacao previa pelo system-architect:** confirmar via Glob existencia de `profile_states` e `primedope_simulations` tables. Se nao existirem, ajustar B8 e B10.2 para fallback documentado.

---

## 8. API

### `/api/home/overview` (extensao)

**Method/Path:** GET `/api/home/overview` (inalterado).

**Auth:** `requireAuth` (JWT) — inalterado.

**Response body novo (extensao):**

```ts
interface HomeOverviewBody {
  // Onda 1 + 1.5 (preservados)
  userState: 'empty' | 'power';
  profile: 'upload-only' | 'session-only' | 'hybrid' | 'new';
  profileMeta: { totalUploads: number; totalSessions: number; sessionTournamentCount: number; detectedAt: string };
  statusStrip: { banca, roi30d, today, pendencias };
  today: { profile, plannedCount, firstStartTime, stopLoss, stopTime, hasWarmupToday } | null;
  banners: { cooldown, flight };
  nextTournament: { startTime, name, buyin, currency, platform } | null;
  lifetime: { totalTournaments, totalSessions, activeDays, currentStreakDays };
  recentSessions: Array<{ id, date, pnlUsd, tournamentCount, primaryPlatform, status }> | null;
  performance: { roi, itm, cash, sparkline, period } | null;
  pendingHands: Array<{ id, hero, context, tag, ageRelative }>;
  news: { enabled, items };

  // Onda 2 NOVO
  topDeltas: Array<{
    stat: string; statLabel: string;
    baseline: number; current: number;
    delta: number; deltaAbs: number;
    severity: 'high' | 'medium' | 'low';
    direction: 'positive' | 'negative' | 'neutral';
    period: '30d';
  }>;
  variance: {
    sessionsCount: number;
    actualUsd: number; expectedUsd: number;
    expectedSource: 'primedope-cache' | 'fallback-zero';
    deviationUsd: number; sigmaUsd: number; sigmaMultiple: number;
    status: 'lucky' | 'normal' | 'unlucky';
    period: '90d';
  } | null;
  tournamentRecommendations: Array<{
    id: string; name: string;
    buyinUsd: number; buyinNative: number; currency: string;
    score: number; grade: 'S' | 'A' | 'B';
    startTime: string; platform: string;
    alreadyInGrid: boolean;
  }>;
  heuristics: Array<{
    id: string; message: string;
    severity: 'info' | 'caution' | 'positive';
    ctaHref: string | null;
  }>;

  meta: {
    generatedAt: string;
    cacheHit: boolean;
    subqueryTimingsMs: Record<string, number>;
    userTimezone: string;   // Onda 2 NOVO
  };
}
```

**Status codes:**
- 200 OK — payload completo.
- 401 Unauthorized — token ausente/invalido.
- 500 — erro fatal (subqueries falham individualmente sem 500 graças a `Promise.allSettled`).

**Sem novos endpoints.** Onda 2 apenas estende.

---

## 9. Frontend — Arvore de Componentes Novos

```
client/src/components/home/
├── StatsTopDeltas.tsx        (NOVO — RF-29)
├── VarianceCard.tsx          (NOVO — RF-30)
├── TournamentRecommendations.tsx  (NOVO — RF-31)
├── HeuristicsCard.tsx        (NOVO — RF-34)
├── __tests__/
│   ├── StatsTopDeltas.test.tsx       (NOVO)
│   ├── VarianceCard.test.tsx         (NOVO)
│   ├── TournamentRecommendations.test.tsx  (NOVO)
│   └── HeuristicsCard.test.tsx       (NOVO)
```

**Pagina afetada:** `client/src/pages/HomePage.tsx` (assumindo nome) — adicionar 4 imports + integracao no grid existente.

**Layout sugerido (desktop, 12 cols):**
```
Linha 1 (Onda 1): StatusStrip (12)
Linha 2 (Onda 1): Today (4) | NextTournament (4) | Banners (4)
Linha 3 (Onda 1): Lifetime (3) | RecentSessions (5) | PendingHands (4)
Linha 4 (Onda 1+2): PerformanceMini (4) | StatsTopDeltas NEW (4) | VarianceCard NEW (4)
Linha 5 (Onda 2): TournamentRecommendations NEW (8) | HeuristicsCard NEW (4)
Linha 6 (Onda 1): LibraryResume (4) | DailyInsight (4) | NewsSlot (4)
Linha 7: HomeFooter (12)
```

**Mobile:** stack vertical. Cada card 100% width.

**Order tracker contract:** Cada componente novo dispara `home.<bloco>.viewed` em mount com `count` quando aplicavel. Click events:
- StatsTopDeltas: `home.statsTopDeltas.clicked` `{stat, severity}`.
- VarianceCard: `home.variance.tooltip.opened`.
- TournamentRecommendations: `home.tournamentRec.cta.clicked` `{grade, score}`.
- HeuristicsCard: `home.heuristics.clicked` `{id, severity}`.

---

## 10. ADRs Propostos

### ADR-108: Heuristicas Home server-side rule engine
- **Decisao:** Implementar 4 regras heuristicas como funcoes puras em `server/services/homeHeuristics.ts` em vez de motor declarativo (DSL/JSON config).
- **Contexto:** Onda 2 inicia com 4 regras simples; spec evolui. Motor declarativo seria over-engineering nesse escopo.
- **Consequencias:**
  - Pro: testavel, debugavel, baixa cerimonia.
  - Con: cada nova regra exige PR; nao permite tweaking sem deploy.
  - Mitigacao: thresholds em constants exportadas para facilitar tuning.

### ADR-109: Bankroll FX aggregation reusa walletService
- **Decisao:** `storage.getCurrentBankroll` delega para `walletService.getConsolidatedBalance` em vez de recalcular FX.
- **Contexto:** ADR-033 ja define cascata FX (users.exchangeRates > wallets.exchangeRates > constantes). Duplicar quebraria SSOT.
- **Consequencias:**
  - Pro: FX cascata respeitada automaticamente; sem divergencia.
  - Con: acoplamento home → walletService.
  - Mitigacao: `walletService.getConsolidatedBalance` ja e contrato estavel (Sprint Bankroll-2).

---

## 11. Sequencia de Implementacao (sub-tasks)

Ordem sugerida para o pipeline TDD (cada etapa e atomica e push-able):

### Sub-task A — Storage wrappers reais (B10) + timezone helper (B11)
- Implementar 5 wrappers reais em `server/storage.ts`.
- Implementar `storage.getUserTimezone(userId)` com cache.
- Substituir computacao timezone-aware em `home.ts`.
- Testes unit (vitest node project): 1 teste por wrapper + 2 para timezone (cache hit, fallback invalid).
- Esperado: 9-12 testes novos.

### Sub-task B — Stats Top Deltas (B7)
- Implementar `storage.getStatsTopDeltas(userId)`.
- Adicionar subquery em `home.ts`.
- Estender payload type.
- Componente `<StatsTopDeltas>` + testes RTL.
- Esperado: 6-8 testes (3 storage + 4 component).

### Sub-task C — Variance Check (B8)
- Implementar `storage.getVarianceVsExpected(userId)`.
- Lookup PrimeDope cache (best-effort, fallback zero-EV).
- Adicionar subquery em `home.ts`.
- Componente `<VarianceCard>` + testes.
- Esperado: 6-8 testes.

### Sub-task D — Tournament Recommendations (B9)
- Importacao direta de `handleTournamentSelector` em `home.ts`.
- Filtro grade in [S,A,B] + minScore 70 + slice top 3.
- Componente `<TournamentRecommendations>` + testes.
- Esperado: 5-7 testes.

### Sub-task E — Heuristics service (B12)
- Servico `server/services/homeHeuristics.ts` (puro).
- Adicionar perf60d ao subqueries (`getDashboardPerformance(userId, '60d')`) para regra 1.
- Integrar em `home.ts` com inputs ja agregados.
- Componente `<HeuristicsCard>` + testes.
- Esperado: 8-10 testes (4 regra + 4 component).

### Sub-task F — Integration + payload extension (RF-35)
- Estender shape de `HomeOverviewBody` em `home.ts`.
- Adicionar tipos compartilhados em `shared/types/home.ts` (se nao existir, criar minimal).
- Ajustar `HomePage.tsx` para renderizar os 4 novos componentes.
- Teste integration end-to-end (1 teste cobrindo payload completo).
- Esperado: 3-5 testes integration.

### Sub-task G — ADR + diagramas
- ADR-108 + ADR-109.
- Diagrama Mermaid `Docs/architecture/diagrams/home-reform-2-flow.mermaid` (subqueries + fallbacks).
- Atualizar `Docs/architecture/decisions/README.md`.

### Sub-task H — Reviewer + simplify + commit + push
- `/simplify` antes de reviewer.
- Reviewer round 1; fixes.
- Reviewer round 2 (target APPROVED).
- Commit caveman + push origin.

**Total esperado:** ~40-50 testes novos. Tempo ~1 sessao auto.

---

## 12. Definition of Done (DoD)

- [ ] 5 wrappers em `server/storage.ts` retornam dados reais (RF-32).
- [ ] `home.ts` chama `storage.getUserTimezone` e usa Intl.DateTimeFormat (RF-33).
- [ ] Payload `/api/home/overview` inclui `topDeltas, variance, tournamentRecommendations, heuristics, meta.userTimezone`.
- [ ] 4 componentes React novos em `client/src/components/home/` com testes RTL.
- [ ] Servico `homeHeuristics.ts` puro com 4 regras + testes unit.
- [ ] Subqueries novas respeitam timeout 800ms + Promise.allSettled.
- [ ] Empty states corretos para cada bloco (CTA quando aplicavel).
- [ ] Tracker events emitidos conforme spec.
- [ ] ADR-108 e ADR-109 escritos.
- [ ] Diagrama Mermaid Onda 2 criado.
- [ ] `npm run check` passa.
- [ ] `npx vitest run` total verde + zero regressao.
- [ ] Reviewer APPROVED ou APPROVED-WITH-NITS (NITs P0/P1 fixados).
- [ ] Commit caveman + push origin main.
- [ ] Memory file `memory/session_2026-05-03-home-reform-2.md` criado.

---

## 13. Pergunta Residual Nao-Bloqueante

**Q1 (auto-decidida):** Se `profile_states` table NAO existe no schema atual (Grade Planner pre-Onda 2), `getProfileStateForDay` continua retornando null. Onda 2 nao cria a tabela. Confirmar via Glob na fase architect; se decisao for criar, mover pra Onda 3.

**Default escolhido em auto mode:** manter `return null` se tabela ausente. Onda 2 NAO bloqueia em ausencia de Grade Planner consolidado.
