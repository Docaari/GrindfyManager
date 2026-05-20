# ADR-167: Coach nudges B-DOWNSWING (drawdown ≥15% janela 7d, hourly tick com cooldown semanal) + B-VOLUME (terça 11h local do user, projeção linear vs baseline 4w) + B-GRADE (domingo 18h local, planned próxima semana < 3) + `isToolEligibleTier(user, tool)` em módulo dedicado `server/coach/toolEligibility.ts` (separado de `resolveUserTier` — Trial recebe as 8 tools AI-2A; Free não; `resolveUserTier` não muda); ticks gateados por `COACH_NUDGES_ENABLED` (kill switch absoluto ADR-152); schema novo migration 0070 (`user_off_days` + `tournament_pool_intelligence` 12 rows seed BR Q-F locked)

## Status
Aceito

## Data
2026-05-20

## Sprint
AI-2A (`Docs/specs/sprint-ai-2a.md`, RF-01, RF-08, RF-09, RF-10, Requisitos Não-Funcionais §Tier gating estrito)

## Decision owner
system-architect (founder locked 2026-05-20: Q-D `user_off_days` tabela nova; Q-E Trial recebe as tools via `isToolEligibleTier`; Q-F 12 rows seed `tournament_pool_intelligence`; Q-H B-DOWNSWING drawdown ≥15% janela 7d single signal; Q-I B-VOLUME terça 11h local + B-GRADE domingo 18h local).

## Related
- Depende de: ADR-152 (kill switch global `COACH_NUDGES_ENABLED` — gateia os 3 nudges + auto-freeze + categorias frozen), ADR-085 (`shouldSendNudge` 8 checks + safe-deny + `cycleKey`), ADR-087 (job runner timezone-aware — `iterateUsersWithTimezone` filtra por hora local), ADR-144 (`withAdvisoryLock` para ticks), ADR-155/157 (`planEligibility.ts` `LIST_USERS_FOR_CRON_PRO_PLUS` consumido pelos ticks), ADR-159 (`reportEligibility.ts` `getReportTier` — `isToolEligibleTier` segue padrão simétrico mas inverso: tools incluem Trial; relatórios também), ADR-039 (`wallet_transactions.reason='rakeback'`), ADR-061/121/163 (FX cascade canônica via `fxResolver`).
- Reusa: `server/coach/nudgeEngine.ts` (categorias `B-DOWNSWING`/`B-VOLUME`/`B-GRADE` já registradas, `CATEGORY_TOGGLE_MAP`), `server/storage/coachSignalsStorage.ts` (helpers AI-1B), `server/coach/cronRunner.ts` (registro de novos crons hourly), `walletService.getConsolidatedBalance`/`getConsolidatedBalanceAt` (USD FX-aware), `server/coach/planEligibility.ts` (`resolveEligiblePlanTier` — Trial passa direto, mesmo padrão usado aqui), `server/coachAccess.ts` (`resolveUserTier` — **não muda**; usado por `isToolEligibleTier` apenas para gate de free).
- Sucessor de: nada — primeiro batch de nudges proativos pós-AI-1B; primeiro módulo dedicado de tool eligibility.
- Diagramas: `Docs/architecture/diagrams/coach-ai-2a/nudge-jobs-schedule.mermaid`, `tier-gating-decision.mermaid`, `pool-intelligence-er.mermaid`.

---

## 1. Contexto

O AI-2A entrega 3 frentes acopladas:

1. **Schema novo (RF-01, migration 0070):**
   - `user_off_days` (tabela nova, Q-D locked) — consumida por `mark_off_day` tool (ADR-165) e `bulk_propose_grade` (ADR-165 §2.1 — `listOffDaysForUser` filtra dias na geração).
   - `tournament_pool_intelligence` (tabela nova) — consumida por `query_pool_intelligence` tool (ADR-166 §2.5). 12 rows seed BR (Q-F locked) inseridas inline na migration 0070.

2. **3 nudges proativos (RF-08/09/10):**
   - **B-DOWNSWING** — drawdown ≥15% em janela 7d (Q-H locked, single signal — substituiu "5 sessões consecutivas negativas OR drawdown" do plano canônico). Cron hourly `0 * * * *`, cooldown semanal `cycleKey='YYYY-WW'`.
   - **B-VOLUME** — terça-feira 11h no fuso do user (Q-I locked). Projeção linear de volume da semana corrente vs baseline 4 semanas anteriores; trigger quando `projectedWeekVolume < baseline * 0.5` (50% drop, env-configurável `COACH_VOLUME_DROP_PCT=50`).
   - **B-GRADE** — domingo 18h no fuso do user (Q-I locked; plano canônico dizia sábado; founder aceitou domingo 18h por alinhar com planning da semana seguinte). Trigger quando `count(planned_tournaments WHERE week_start = next_monday) < 3`.

3. **`isToolEligibleTier(user, tool)` em módulo dedicado (Requisitos Não-Funcionais §Tier gating estrito, Q-E locked):**
   - Função canônica de elegibilidade das tools, **separada** de `resolveUserTier`.
   - **`resolveUserTier` NÃO muda** — continua gateando rate limit (Trial → free lá, mantém) e o conjunto de tools "antigas" (AI-0A/0B/1A/1B/1C).
   - `isToolEligibleTier(user, tool)` consultado por `listToolsForUser` para filtrar a lista enviada ao LLM. Trial recebe as 8 tools AI-2A (consistente com `getReportTier` AI-1C); Free não.
   - Rate limit do Trial nas chamadas das tools AI-2A = Pro-like (mais generoso que Free); rate limit geral de chat do Trial permanece como hoje.

A pergunta central: **(a)** schema das 2 tabelas novas (migration 0070 — definitivo); **(b)** cron + tick + threshold de cada um dos 3 nudges; **(c)** helpers novos em `coachSignalsStorage.ts`; **(d)** módulo `toolEligibility.ts` — shape, lógica, integração com registry; **(e)** kill switch — os 3 ticks novos respeitam `COACH_NUDGES_ENABLED=false` (não registrados); **(f)** ownership/safe-deny: erro em 1 user não trava o tick para os outros.

### Restrições

- **Lesson #6 (USD):** B-DOWNSWING compara `currentBankrollUsd` vs `refBankrollUsd` (snapshot em `now - 7d`). FX cascade `fxResolver.resolveExchangeRates(userId)` (ADR-163). `walletService.getConsolidatedBalance(userId)` já em USD; `getConsolidatedBalanceAt(userId, atDate)` retorna USD histórico (helper novo — ver §3).
- **Lesson #9 (logar antes de fallback):** tick lê `for user of eligibleUsers`, cada iteração em `try/catch` com `console.error` + skip user específico. `getDrawdownInWindow` retorna `null` quando `sampleConfidence='low'` (sem snapshot histórico razoável) — tick pula esse user.
- **Lesson #10 (DRY):** body dos 3 nudges não duplica o esqueleto de iteração `LIST_USERS_FOR_CRON_PRO_PLUS` + `iterateUsersWithTimezone` (ADR-087). Helper `iterateUsersForLocalTime(localHour, localDayOfWeek?, callback)` — extrair se ainda não existir (provável já existe em AI-1B B-VOLUME no plano; senão criar).
- **Lesson #11 (default mínimo):** tick gera body interpretativo só quando tem dado real (`narrative` template baseado em métricas reais). Não inventa body genérico.
- **Lesson #17 (`grep "const X"`):** ao adicionar `isToolEligibleTier` em `toolEligibility.ts`, confirmar que não há nome conflitante em `coachAccess.ts` (já tem `resolveUserTier`, `clearUserTierCache`; `isToolEligibleTier` é novo).
- **ADR-152 (kill switch absoluto):** `COACH_NUDGES_ENABLED=false` → `cronRunner.startCoachCrons()` não registra os 3 ticks novos. `shouldSendNudge` (CHECK 0) também bloqueia se algum tick foi registrado e a flag mudou em runtime.
- **ADR-085 (`shouldSendNudge`):** cada tick consulta antes de persistir em `coach_nudge_log` — frequency cap + quiet hours + snooze + auto-freeze já cobertos.
- **ADR-087 (timezone-aware):** ticks rodam hourly `0 * * * *` (UTC) e filtram por `iterateUsersWithTimezone((user, localHour, localDayOfWeek) => localHour === target && localDayOfWeek === target)`. Pacing 200ms entre users (ADR-085).

---

## 2. Decisões

### 2.1 Schema (RF-01, migration 0070)

**Tabela `user_off_days`:**
```sql
CREATE TABLE user_off_days (
    id            VARCHAR(21) PRIMARY KEY,
    user_id       VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    off_date      DATE        NOT NULL,
    reason        TEXT,
    source        VARCHAR(32) NOT NULL DEFAULT 'coach_tool',
    created_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    CONSTRAINT user_off_days_user_date_unique UNIQUE (user_id, off_date)
);
CREATE INDEX idx_user_off_days_user_date ON user_off_days(user_id, off_date);
```
- `source ∈ {'coach_tool','manual_ui','cron_default'}` — snapshot da origem (auditoria).
- UNIQUE `(user_id, off_date)` garante `mark_off_day` idempotente (`ON CONFLICT DO NOTHING`).

**Tabela `tournament_pool_intelligence`:**
```sql
CREATE TABLE tournament_pool_intelligence (
    id                   VARCHAR(21)  PRIMARY KEY,
    site                 VARCHAR(32)  NOT NULL,
    tournament_pattern   VARCHAR(120) NOT NULL,
    buy_in_min           NUMERIC,
    buy_in_max           NUMERIC,
    field_avg            INTEGER,
    field_volatility     NUMERIC,
    pool_quality         VARCHAR(16),
    notes                TEXT,
    updated_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT pool_quality_enum CHECK (pool_quality IS NULL OR pool_quality IN ('soft','medium','tough'))
);
CREATE INDEX idx_pool_intel_site ON tournament_pool_intelligence(site);
CREATE INDEX idx_pool_intel_pattern_trgm ON tournament_pool_intelligence(tournament_pattern);
```

**Seed Q-F locked (12 rows BR):** ver `migrations/0070_ai_2a_offdays_pool_intel.sql` linhas 86-100. Padrão: WPN (4) + GG (4) + Stars (2) + Party (1) + Bodog (1). `pool_quality` curado manualmente. Sub-bloco pode ser movido para `scripts/seed-pool-intelligence.sql` (founder roda manualmente) — o handler `query_pool_intelligence` tolera tabela vazia (ADR-166 §2.5).

**Sem mudança em `user_coach_preferences`** — toggles `nudgeBDownswing`/`nudgeBVolume`/`nudgeBGrade` **já existem** (`shared/schema.ts:4501-4504`, NOT NULL DEFAULT true). AI-2A não migra essa tabela.

### 2.2 Nudge B-DOWNSWING (RF-08, Q-H locked)

**Job:** `server/coach/jobs/bDownswing.ts`.
**Cron registrado em `cronRunner.ts`:** `cron.schedule("0 * * * *", () => withAdvisoryLock("nudge_bdownswing_tick", bDownswingTick))` — hourly, com lock para evitar duplicação em múltiplas instâncias futuras (ADR-144).
**Categoria nudge:** `'B-DOWNSWING'` (já existe em `nudgeEngine.ts:28`).
**Toggle:** `userCoachPreferences.nudgeBDownswing` (default true).

**Algoritmo (`bDownswingTick({ now, injectedStorage })`):**
1. Se `process.env.COACH_NUDGES_ENABLED === 'false'` → log + return (defesa em profundidade; cron não deveria estar registrado).
2. `eligibleUsers = await listUsersForCron(LIST_USERS_FOR_CRON_PRO_PLUS)` — Trial + Pro/Premium/Admin (ADR-155).
3. Para cada user (pacing 200ms):
   ```ts
   try {
     // Toggle check
     const prefs = await storage.getCoachPreferences(user.id);
     if (!prefs.nudgeBDownswing) continue;

     // Drawdown calc
     const windowDays = Number(process.env.COACH_DOWNSWING_WINDOW_DAYS ?? 7);
     const thresholdPct = Number(process.env.COACH_DOWNSWING_DRAWDOWN_PCT ?? 15);
     const drawdown = await getDrawdownInWindow(user.id, windowDays, injectedStorage);
     if (!drawdown || drawdown.sampleConfidence === 'low') {
       console.log('coach.nudge.b_downswing.skip', { userId: user.id, reason: 'no_baseline' });
       continue;
     }
     if (drawdown.drawdownPct < thresholdPct) continue;

     // cycleKey semanal (1 nudge/semana max)
     const cycleKey = `${now.getUTCFullYear()}-W${getWeekNumber(now)}`;
     const verdict = await shouldSendNudge({
       userId: user.id,
       category: 'B-DOWNSWING',
       cycleKey,
       now,
     });
     if (!verdict.canSend) continue;

     // Persist nudge
     await persistCoachNudgeLog({
       userId: user.id,
       category: 'B-DOWNSWING',
       cycleKey,
       status: 'sent',
       title: 'Sua banca caiu nos últimos 7 dias',
       body: `Sua banca caiu ${drawdown.drawdownPct.toFixed(1)}% nos últimos ${windowDays} dias (de $${drawdown.refBankrollUsd.toFixed(0)} para $${drawdown.currentBankrollUsd.toFixed(0)}). Vamos analisar se é variância ou leak?`,
       cta: { kind: 'tool', target: 'analyze_variance' },
       triggeredByEvent: 'drawdown_window_check',
     });
   } catch (err) {
     console.error('coach.nudge.b_downswing.error', { userId: user.id, err });
   }
   ```

**Helper novo em `coachSignalsStorage.ts`:**
```ts
async function getDrawdownInWindow(userId: string, windowDays: number, injectedStorage?: any): Promise<{
  refBankrollUsd: number,
  currentBankrollUsd: number,
  drawdownPct: number,
  refDate: Date,
  sampleConfidence: 'high' | 'low',
} | null>
```
Fonte: `walletService.getConsolidatedBalanceAt(userId, now - windowDays)` (helper novo — usa snapshots históricos em `bankroll_snapshots`; quando sem snapshot razoável, usa o `bankroll_snapshots` mais antigo no range ou retorna `sampleConfidence='low'` para tick skipar). FX cascade canônica via `fxResolver` (ADR-163). Safe-deny em erro.

### 2.3 Nudge B-VOLUME (RF-09, Q-I locked terça 11h local)

**Job:** `server/coach/jobs/bVolume.ts`.
**Cron:** `cron.schedule("0 * * * *", () => withAdvisoryLock("nudge_bvolume_tick", bVolumeTick))` — hourly UTC, filtra `localDayOfWeek === 2` (terça-feira; 0=domingo no pattern Date.getUTCDay) + `localHour === 11`.

**Algoritmo:**
1. Kill switch + `eligibleUsers` (igual B-DOWNSWING).
2. `iterateUsersWithTimezone((user, localHour, localDayOfWeek) => localHour === 11 && localDayOfWeek === 2)` — filtra os que estão em terça 11h local **agora**.
3. Para cada user:
   ```ts
   const prefs = await storage.getCoachPreferences(user.id);
   if (!prefs.nudgeBVolume) continue;

   const dropPct = Number(process.env.COACH_VOLUME_DROP_PCT ?? 50);
   const currentSoFar = await countTournamentsThisWeek(user.id);
   const baseline = await avgWeeklyTournaments(user.id, 4);
   if (baseline.sampleSize < 2) continue;  // sem baseline confiável

   const daysElapsed = getDayOfWeekLocal(user, now);  // 1 (segunda) ... 7 (domingo)
   const projectedWeekVolume = currentSoFar * (7 / Math.max(daysElapsed, 1));

   if (projectedWeekVolume >= baseline.avg * (1 - dropPct / 100)) continue;

   const cycleKey = `${now.getUTCFullYear()}-W${getWeekNumber(now)}`;
   const verdict = await shouldSendNudge({ userId: user.id, category: 'B-VOLUME', cycleKey, now });
   if (!verdict.canSend) continue;

   await persistCoachNudgeLog({
     userId: user.id,
     category: 'B-VOLUME',
     cycleKey,
     status: 'sent',
     title: 'Sua semana está com volume baixo',
     body: `Você jogou ${currentSoFar} torneios até aqui — sua semana está projetada para ${projectedWeekVolume.toFixed(0)}. Sua média é ${baseline.avg.toFixed(0)}. Está tudo bem? Quer ajustar a grade?`,
     cta: { kind: 'tool', target: 'bulk_propose_grade' },
     triggeredByEvent: 'volume_baseline_drop',
   });
   ```

**Helpers novos:**
- `countTournamentsThisWeek(userId)` → number (do `tournaments` filtrado `grind_session_id IS NULL` + `date >= localMondayThisWeek`).
- `avgWeeklyTournaments(userId, weeks=4)` → `{ avg: number, sampleSize: number }` (médias das 4 semanas anteriores; `sampleSize` = quantas semanas tinham dado).

### 2.4 Nudge B-GRADE (RF-10, Q-I locked domingo 18h local)

**Job:** `server/coach/jobs/bGrade.ts`.
**Cron:** `cron.schedule("0 * * * *", () => withAdvisoryLock("nudge_bgrade_tick", bGradeTick))` — hourly, filtra `localDayOfWeek === 0` (domingo) + `localHour === 18`.

**Algoritmo:**
1. Kill switch + `eligibleUsers` + `iterateUsersWithTimezone(localHour === 18 && localDayOfWeek === 0)`.
2. Para cada user:
   ```ts
   const prefs = await storage.getCoachPreferences(user.id);
   if (!prefs.nudgeBGrade) continue;

   const nextWeekStart = nextMondayLocal(user, now);
   const plannedCount = await countPlannedTournamentsForWeek(user.id, nextWeekStart);
   if (plannedCount >= 3) continue;  // grade não vazia

   // Aderência da semana que passou (opcional, enriquece body)
   const adherence = await getGradeAdherenceForWeek(user.id, lastWeekStart(now));

   const cycleKey = `${now.getUTCFullYear()}-W${getWeekNumber(now)}`;
   const verdict = await shouldSendNudge({ userId: user.id, category: 'B-GRADE', cycleKey, now });
   if (!verdict.canSend) continue;

   await persistCoachNudgeLog({
     userId: user.id,
     category: 'B-GRADE',
     cycleKey,
     status: 'sent',
     title: 'Sua próxima semana está sem grade',
     body: `Você tem ${plannedCount} torneios planejados para a próxima semana${adherence ? ` (aderência da semana passada: ${adherence.adherencePct.toFixed(0)}%)` : ''}. Quer que eu sugira uma grade?`,
     cta: { kind: 'tool', target: 'bulk_propose_grade' },
     triggeredByEvent: 'grade_empty_check',
   });
   ```

**Helpers novos:**
- `countPlannedTournamentsForWeek(userId, weekStart)` → number (count em `planned_tournaments WHERE week_start_date = $weekStart`).
- `getGradeAdherenceForWeek(userId, weekStart)` → `{ planned, played, adherencePct }` (compara `planned_tournaments` da semana com `tournaments` jogados na mesma semana — best-effort match por nome+site+dayOfWeek).

### 2.5 `isToolEligibleTier(user, tool)` em `server/coach/toolEligibility.ts` (Q-E locked)

**Módulo novo:** `server/coach/toolEligibility.ts`. Separado de `coachAccess.ts` (`resolveUserTier` — não muda) e `reportEligibility.ts` (`getReportTier` AI-1C — padrão simétrico).

**Shape:**
```ts
// server/coach/toolEligibility.ts
import { resolveUserTier } from "../coachAccess";

const AI_2A_TOOLS = new Set([
  'bulk_propose_grade',
  'schedule_study_block',
  'create_study_theme',
  'mark_off_day',
  'analyze_variance',
  'diagnose_plateau',
  'compute_grind_study_ratio',
  'calculate_effective_rake',
  'query_pool_intelligence',
]);

export async function isToolEligibleTier(
  user: { id: string, subscriptionPlan?: string },
  toolName: string,
  options?: { injectedStorage?: any }
): Promise<boolean> {
  // Trial passa direto (consistente com getReportTier — ADR-159)
  if (user.subscriptionPlan === 'trial') return true;

  // Free e expired nunca recebem
  if (user.subscriptionPlan === 'free' || user.subscriptionPlan === 'expired') return false;

  // 'active' ou 'admin' → re-resolve via resolveUserTier
  // (active pode ser pro/premium dependendo de user_subscriptions JOIN subscription_plans)
  try {
    const tier = await resolveUserTier(user.id);
    return tier === 'pro' || tier === 'premium' || tier === 'admin';
  } catch (err) {
    console.error('coach.tool_eligibility.error', { userId: user.id, toolName, err });
    return false;  // safe-deny
  }
}

export async function listEligibleToolsForUser(
  user: { id: string, subscriptionPlan?: string },
  allTools: Array<{ name: string }>,
  options?: { injectedStorage?: any }
): Promise<Array<{ name: string }>> {
  const filtered: Array<{ name: string }> = [];
  for (const tool of allTools) {
    // Só filtra AI-2A tools por aqui; outras tools (AI-0A/0B/1A/1B/1C) continuam via resolveUserTier
    if (AI_2A_TOOLS.has(tool.name)) {
      if (await isToolEligibleTier(user, tool.name, options)) filtered.push(tool);
    } else {
      filtered.push(tool);  // tools antigas — gateadas no descriptor.gateByTier via registry
    }
  }
  return filtered;
}
```

**Integração com registry:** `server/coachTools/registry.ts` `listToolsForUser(userId)` (já existente) chama `listEligibleToolsForUser` ao final do pipeline. Tools AI-2A definidas com `gateByTier: ['pro','premium','admin']` continuam declarando o gating no descritor (defesa em profundidade); o módulo `toolEligibility.ts` é a fonte canônica para o caso Trial.

**`resolveUserTier` não muda:**
- Continua retornando `'free' | 'pro' | 'premium' | 'admin'` (Trial → `'free'` lá, como hoje).
- Continua gateando rate limit do chat (Free rate limit estrito).
- Tools AI-2A ganharam o módulo dedicado porque a regra "Trial recebe" é diferente da regra de rate limit.

**Rate limit das tools AI-2A no Trial:** Pro-like. Implementação: o middleware `coachToolRateLimit` (se existir; se não, criar) lê `subscriptionPlan` direto — `'trial'` → bucket Pro; `'free'/'expired'` → bucket Free (já é rejeitado no `isToolEligibleTier`). Rate limit geral de chat do Trial permanece como hoje (segue `resolveUserTier`).

### 2.6 Kill switch + cronRunner

**`server/coach/cronRunner.ts` `startCoachCrons()`:**
```ts
if (process.env.COACH_NUDGES_ENABLED === 'false') {
  console.log('coach.cronRunner.disabled', { reason: 'COACH_NUDGES_ENABLED=false' });
  return;
}

// ... crons existentes (B-SNAPSHOT, B-STUDY (deprecated), B-GAPCHECK, B-IMPORT) ...

// AI-2A nudges
cron.schedule("0 * * * *", () => withAdvisoryLock("nudge_bdownswing_tick", () => bDownswingTick({ now: new Date() })));
cron.schedule("0 * * * *", () => withAdvisoryLock("nudge_bvolume_tick", () => bVolumeTick({ now: new Date() })));
cron.schedule("0 * * * *", () => withAdvisoryLock("nudge_bgrade_tick", () => bGradeTick({ now: new Date() })));
```

Defesa em profundidade: cada tick também faz o check `if (process.env.COACH_NUDGES_ENABLED === 'false') return;` no início (lesson da AI-1A `cron-kill-switch.test.ts`).

---

## 3. Opções descartadas

### 3.1 B-DOWNSWING "5 sessões consecutivas negativas OR drawdown ≥15%" (plano canônico original)
- **Prós:** sinal duplo, cobre mais casos.
- **Contras:** "5 sessões consecutivas negativas" é frágil — user que joga 1 sessão grande por semana pode ter 5 negativas em ROI mas drawdown <5% (sessões pequenas) e ser ignorado; ou user que joga 10 sessões pequenas por dia pode acumular drawdown alto sem nenhuma sessão "tecnicamente negativa". Drawdown ≥15% em janela 7d é robusto a ambos.
- **Decisão:** single signal drawdown ≥15% em janela 7d (Q-H locked). Env vars antigos `COACH_DOWNSWING_THRESHOLD_SESSIONS`/`COACH_DOWNSWING_THRESHOLD_PCT` **deprecadas** (não lidas).

### 3.2 B-VOLUME/B-GRADE como cron específico (não hourly + filter)
- **Prós:** cron expr direto (`0 11 * * 2` para B-VOLUME terça 11h) — menos overhead.
- **Contras:** não suporta fuso do user — `0 11 * * 2` UTC é 8h BRT, 12h CET. ADR-087 já estabeleceu o pattern hourly + filter local. Consistência > micro-otimização.
- **Decisão:** hourly + `iterateUsersWithTimezone` filter.

### 3.3 B-GRADE sábado (plano canônico) em vez de domingo
- **Prós:** alinha com fim de semana (user já em modo "weekend").
- **Contras:** sábado 18h muitos jogadores estão jogando ou descansando; domingo 18h é o slot natural de "planning da próxima semana" (segunda começa em <14h).
- **Decisão:** domingo 18h local (Q-I locked). Env config futura permitirá ajuste.

### 3.4 `isToolEligibleTier` dentro de `coachAccess.ts` (não módulo separado)
- **Prós:** menos arquivos.
- **Contras:** `coachAccess.ts` mistura rate limit + tools + tier; já está grande. Separar módulos por responsabilidade (rate limit → `coachAccess`; reports → `reportEligibility`; tools → `toolEligibility`) é o pattern estabelecido pelo AI-1C.
- **Decisão:** módulo dedicado `server/coach/toolEligibility.ts`.

### 3.5 Trial não recebe as tools AI-2A (default conservador)
- **Prós:** monetização — Trial é incentivo a virar Pro.
- **Contras:** Trial é período de avaliação; bloquear tools cruciais ("monta minha grade") frustra o trial → não converte. Founder explicitamente Q-E locked: Trial recebe.
- **Decisão:** Trial recebe via `isToolEligibleTier === true` (Q-E locked).

### 3.6 Migration 0070 separa em 2 arquivos (offdays + pool intelligence)
- **Prós:** rollback granular.
- **Contras:** ambas tabelas são da Sprint AI-2A; rollback conjunto é o caso real. Tabelas pequenas, sem dependência circular.
- **Decisão:** 1 migration `0070_ai_2a_offdays_pool_intel.sql` + 1 rollback `0070_..._rollback.sql`.

---

## 4. Consequências

### Positivas
- 3 nudges fecham as principais lacunas de proatividade da Fase 2: bankroll preservation (B-DOWNSWING), volume tracking (B-VOLUME), planning continuity (B-GRADE).
- `isToolEligibleTier` desacopla a regra de tools da regra de rate limit — Trial passa nas tools sem ganhar rate limit Pro de chat (Q-E sem ambiguidade).
- Schema novo isolado em migration única — fácil de rollback se Sprint AI-2A precisar reverter.
- 12 rows pool intelligence dão imediato valor ao `query_pool_intelligence` em vez de tool vazia esperando seed.

### Negativas
- 3 ticks hourly novos: ~3 jobs extra por hora no scheduler. Mitigação: `withAdvisoryLock` evita duplicação; pacing 200ms; ticks só agem em users em hora local específica (filtra <1% dos eligibles por hora).
- `isToolEligibleTier` adiciona uma camada — agora há 3 funções de "tier" (`resolveUserTier`, `getReportTier`, `isToolEligibleTier`). Mitigação: cada uma tem propósito claro documentado em README + diagrama `tier-gating-decision.mermaid`.
- B-DOWNSWING precisa de `bankroll_snapshots` com pelo menos 1 row em `now - 7d` para baseline. Users sem snapshot histórico → `sampleConfidence='low'` → tick skipa silenciosamente. Mitigação: nudge B-SNAPSHOT (AI-1A) já incentiva o user a manter snapshots.

### Neutras
- `nudgeBDownswing`/`nudgeBVolume`/`nudgeBGrade` toggles default true — users que não querem podem desligar via `/coach-ai` aba Preferências.
- Pool intelligence é manualmente curado — manutenção futura é trabalho contínuo (deferred admin UI Sprint AI-2B).

---

## 5. Notas de implementação

- **Ordem sugerida (test-writer → implementer):**
  1. Migration 0070 + storage helpers (`getDrawdownInWindow`, `countTournamentsThisWeek`, `avgWeeklyTournaments`, `countPlannedTournamentsForWeek`, `getGradeAdherenceForWeek`, `listOffDaysForUser`, `getRecentStatsUpload`, `queryTournamentPoolIntelligence`).
  2. `toolEligibility.ts` + integração com `listToolsForUser`.
  3. B-DOWNSWING tick + cron + tests.
  4. B-VOLUME tick + cron + tests.
  5. B-GRADE tick + cron + tests.
  6. `cronRunner.ts` register + kill switch test.
- **Env vars novas:**
  - `COACH_DOWNSWING_DRAWDOWN_PCT` (default `15`)
  - `COACH_DOWNSWING_WINDOW_DAYS` (default `7`)
  - `COACH_VOLUME_DROP_PCT` (default `50`)
  - `COACH_GRADE_ADHERENCE_PCT` (default `50` — usado no body do B-GRADE, não no trigger)
- **Storage layer adicional:**
  - `walletService.getConsolidatedBalanceAt(userId, atDate)` — **novo**, USD histórico via `bankroll_snapshots` ou fallback derivado de transações.
  - `iterateUsersForLocalTime({ localHour, localDayOfWeek?, callback })` — wrapper sobre `iterateUsersWithTimezone` para reduzir boilerplate dos 3 ticks (se ainda não existe).
- **Telemetria:** cada tick loga `coach.nudge.<category>.{skip,sent,error}` para dashboards (founder pode monitorar via `coach_nudge_log` agrupado por `triggered_by_event`).

---

## 6. Plano de Verificação

- [ ] Migration 0070 cria `user_off_days` + `tournament_pool_intelligence` + 12 rows seed; rollback drop limpo.
- [ ] `isToolEligibleTier({ subscriptionPlan: 'trial' }, 'bulk_propose_grade')` → `true`.
- [ ] `isToolEligibleTier({ subscriptionPlan: 'free' }, 'bulk_propose_grade')` → `false`.
- [ ] `isToolEligibleTier({ subscriptionPlan: 'active' })` com `resolveUserTier === 'pro'` → `true`.
- [ ] `isToolEligibleTier({ subscriptionPlan: 'expired' })` → `false`.
- [ ] `resolveUserTier` snapshot inalterado (regressão zero).
- [ ] B-DOWNSWING tick: user com drawdown 7d ≥15% → 1 nudge enfileirado; 14.9% → no-op.
- [ ] B-DOWNSWING: user sem snapshot histórico → `sampleConfidence='low'`, tick skipa.
- [ ] B-DOWNSWING: 1 nudge/semana max (`cycleKey` semanal).
- [ ] B-VOLUME tick: terça 11h local user com projection <50% baseline → nudge; >=50% → no-op.
- [ ] B-VOLUME: baseline `sampleSize < 2` → no-op.
- [ ] B-GRADE tick: domingo 18h local user com `planned < 3` next week → nudge; `>=3` → no-op.
- [ ] B-GRADE: aderência da semana passada incluída no body quando disponível.
- [ ] FX cascade ADR-163 aplicada em B-DOWNSWING (lesson #6).
- [ ] `COACH_NUDGES_ENABLED=false` → 3 ticks não registrados; e se registrados, o early-return bloqueia execução.
- [ ] Free → 3 ticks pulam (filtro `LIST_USERS_FOR_CRON_PRO_PLUS`).
- [ ] Erro em 1 user no tick não trava os outros (try/catch + log).
- [ ] `query_pool_intelligence` retorna 12 rows BR após migration 0070.
- [ ] `mark_off_day` cria row em `user_off_days`; `ON CONFLICT DO NOTHING` para idempotência.

---

## Migration SQL (cópia para referência rápida — versão canônica em `migrations/0070_ai_2a_offdays_pool_intel.sql`)

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS user_off_days (
    id            VARCHAR(21) PRIMARY KEY,
    user_id       VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    off_date      DATE        NOT NULL,
    reason        TEXT,
    source        VARCHAR(32) NOT NULL DEFAULT 'coach_tool',
    created_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    CONSTRAINT user_off_days_user_date_unique UNIQUE (user_id, off_date)
);
CREATE INDEX IF NOT EXISTS idx_user_off_days_user_date ON user_off_days(user_id, off_date);

CREATE TABLE IF NOT EXISTS tournament_pool_intelligence (
    id                   VARCHAR(21)  PRIMARY KEY,
    site                 VARCHAR(32)  NOT NULL,
    tournament_pattern   VARCHAR(120) NOT NULL,
    buy_in_min           NUMERIC,
    buy_in_max           NUMERIC,
    field_avg            INTEGER,
    field_volatility     NUMERIC,
    pool_quality         VARCHAR(16),
    notes                TEXT,
    updated_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT pool_quality_enum CHECK (pool_quality IS NULL OR pool_quality IN ('soft','medium','tough'))
);
CREATE INDEX IF NOT EXISTS idx_pool_intel_site ON tournament_pool_intelligence(site);
CREATE INDEX IF NOT EXISTS idx_pool_intel_pattern_trgm ON tournament_pool_intelligence(tournament_pattern);

-- Seed 12 rows BR (Q-F locked) — ver migration completa
-- INSERT INTO tournament_pool_intelligence VALUES (...) ON CONFLICT (id) DO NOTHING;

COMMIT;
```
