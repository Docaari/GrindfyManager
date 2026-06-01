# ADR-224: Next-Week Planning Flow (EST-6) — orquestrador backend stateless-ish + estado leve + UI conversacional

## Status
Aceito

## Data
2026-06-01

## Contexto

Spec: `Docs/specs/estudo-ia-overhaul-2026-06-01/est-6-spec.md`. EST-6 é a etapa final do ritual de segunda (EST-5, ainda não implementado), mas entrega **standalone e pluggável**: o mentor (Coach AI) conduz o jogador, passo a passo, a montar o plano da **próxima** semana em 4 sub-decisões — grind, estudo, aulas, temas-foco. As 4 ações de escrita já existem como write-tools AI-2A (`bulk_propose_grade`, `schedule_study_block`, `recommend_lesson`, `mark_off_day`). EST-6 **orquestra**, não recria.

Forças em jogo:
- **Pluggabilidade EST-5:** o estado `planning` do EST-5 precisa abrir o flow e saber quando ele terminou — exige um ponto de entrada backend reutilizável (`startPlanning`) + um sinal de conclusão consultável.
- **Idempotência por semana** com 2 convenções de chave coexistindo (UTC para `study_weekly_plans` e `weekly_planning_sessions`; BRT para `coach_lesson_recommendations` — CLAUDE.md §10, NÃO unificar).
- **Risco de colisão de rota** (EST-3 sofreu: `GET /api/coach/:id` legado shadowando sub-paths).
- **Risco de regressão de tests** (lessons #14/#26/#29/#34/#38).

Este ADR fixa as decisões DEC-1..DEC-5 da spec e resolve as 6 "Decisões abertas para o System-Architect".

---

## Decisões

### DEC-1 — Orquestrador backend + estado leve persistido + UI conversacional no chat

**Decisão:** orquestrador backend em `server/coach/planning/weeklyPlanningOrchestrator.ts` que define os 4 passos como uma **lista ordenada de sub-decisões** (não uma state machine pesada), persiste um **estado leve** em `weekly_planning_sessions`, e é consumido por uma UI conversacional/wizard **embutida no chat do `/coach-ai`** (cards de step com CTAs), nunca uma página Wouter separada (lesson #19).

**Rejeitado:**
- State machine própria persistida com transições rígidas — over-engineering para 4 passos lineares + colide conceitualmente com a máquina do EST-5.
- Stateless puro derivando de `study_weekly_plans` + `planned_tournaments` — não distingue "pulado" de "ainda não feito", sem reentrada idempotente confiável, sem sinal limpo de "concluído" pro EST-5 (ver DEC-5).

### DEC-2 — Mapa `:step` → tool / persistência

| `:step` | Sub-decisão | Mecanismo de `propose` | Mecanismo de `confirm` | Confirmação |
|---|---|---|---|---|
| `grind` | Dias + horas de grind | `bulkProposeGradeTool.fetchPayloadBefore(input, ctx, tx)` → preview (não persiste) | `bulkProposeGradeTool.executeConfirmed(input, ctx, tx)` → `planned_tournaments` | requiresConfirmation |
| `study` | Blocos de estudo | derivado (sugestão de N blocos; LLM opcional) | **loop** `scheduleStudyBlockTool.executeConfirmed(block, ctx, tx)` por bloco + `storage.upsertStudyWeeklyPlan({...})` (UTC) | requiresConfirmation por bloco |
| `lessons` | Aulas a assistir | `recommendLessonTool.handler(input, ctx)` (read — retorna lessons da whitelist curated) | `storage.createCoachRecommendation({userId, lessonId, weekStartDate(BRT), reason, source})` por aula confirmada | write leve, sem confirm destrutiva |
| `themes` | Temas-foco | `storage.getStatsLeaks(userId, n)` + `user_focus_stats` (read-only) | nenhum write novo — consolida no resumo | seleção exibida no resumo |

> **`mark_off_day` é ação AUXILIAR do passo `grind`** (não um `:step` próprio): se o jogador disser "quero folga na quarta", o orquestrador chama `markOffDayTool.executeConfirmed` ANTES de re-rodar o preview do grind; a folga vira conflict `off_day` no preview seguinte (visto em `bulkProposeGrade.buildPreview`).

**Resolução da decisão aberta #6** (mapeamento documentado): o mapa acima é canônico. Note dois pontos não-óbvios que o test-writer DEVE assertar:

1. **`recommend_lesson` NÃO persiste `coach_lesson_recommendations`.** O tool atual (`server/coachTools/recommendLesson.ts`) apenas retorna `data.lessons[]` e grava eventos `coach_recommend`. A persistência em `coach_lesson_recommendations` é feita pelo orquestrador via `storage.createCoachRecommendation(...)` no `confirmStep('lessons')`. O tool serve como **fonte da whitelist + ranking**; o orquestrador filtra os `lessonId` confirmados e grava. (Anti-alucinação: só grava `lessonId` que veio do retorno do tool — whitelist enforce.)
2. **`schedule_study_block.fetchPayloadBefore` retorna `null`** (preview não-LLM). O preview de blocos no passo `study` é montado pelo orquestrador (sugestão determinística a partir de leaks/focus + curated themes/lessons), não pelo tool. O tool só executa.

### DEC-3 — Idempotência: 1 planning session por semana, reusando chaves existentes

- `weekly_planning_sessions` UNIQUE `(user_id, week_start_date)`. `week_start_date` = DATE UTC via `ymdUtc()` (ver "Chaves de semana" abaixo). Reabrir a mesma semana retorna a sessão existente (não recria, não reseta passos confirmados).
- Passo `study`: **UPSERT** em `study_weekly_plans` pela chave UTC existente (`storage.upsertStudyWeeklyPlan` já faz `onConflictDoUpdate` em `(userId, weekStartDate)`), `source='coach_manual'`. Não cria chave nova.
- Passo `lessons`: grava em `coach_lesson_recommendations` pela chave **BRT** (ver "Chaves de semana"). Para garantir UPSERT-like sem alterar schema: o orquestrador faz **delete-then-insert** das recs daquele `(user_id, week_start_date BRT, source='coach_manual')` antes de inserir o conjunto novo confirmado (re-recomendar não acumula).

### DEC-4 — Tier gating herdado (defense in depth)

- `startPlanning` valida `await getReportTier(user) !== 'free'` (`server/coach/reportEligibility.ts`). Trial/Pro/Premium/Admin = `eligible`; free/expired = `free` → 403.
- Cada tool de escrita revalida seu próprio `gateByTier: ['pro','premium','admin']` no `executeConfirmed`. Trial passa pelo gate de entrada mas os tools usam `isToolEligibleTier` (Trial passa). Free nunca chega, mas o tool nega de qualquer forma.

### DEC-5 — Tabela nova `weekly_planning_sessions` (migration 0088)

Migration nova (não stateless). Custo: 1 migration + rollback. Ganho: estado explícito, idempotência por `(user_id, week_start_date)`, e o contrato `status` que EST-5 consome. Tabela pequena (1 row/usuário/semana). SQL exato em "Migration plan" abaixo.

---

## Resolução das Decisões Abertas

### #1 — Re-propor passo já confirmado (por passo)

- **`grind`:** confiar no **dedup `already_in_grade`** do `bulkProposeGrade.buildPreview` (linha que casa `site+name+time+dayOfWeek` contra `planned_tournaments` existentes). Re-propor não chama `undo`; o `executeConfirmed` simplesmente pula o que já existe (vira conflict `already_in_grade`, não cria duplicata). **Exceção:** se o jogador pedir explicitamente "refazer a grade do zero", o orquestrador chama `bulkProposeGradeTool.undo(before, {createdIds}, ctx, tx)` com os `createdIds` salvos em `steps.grind.createdIds` ANTES de re-propor. Default = dedup.
- **`study`:** re-**UPSERT** do `study_weekly_plans` (a chave UTC dedup naturalmente) + criar **só blocos novos** (`schedule_study_block` cria 1 row por chamada; o orquestrador não re-cria blocos cujo `sessionId` já está em `steps.study.sessionIds`). Blocos antigos não são apagados salvo "refazer" explícito (que chama `scheduleStudyBlockTool.undo` por `sessionId`).
- **`lessons`:** delete-then-insert do conjunto `(user_id, week_start_date BRT, source='coach_manual')` (ver DEC-3).
- **`themes`:** read-only, idempotente por natureza.

### #2 — Colisão de rota `/api/coach/planning/*`

**Investigação realizada** (`grep -n "app.(get|post)" server/routes/coach.ts` + `server/routes/coachAi1b.ts`): NÃO existe rota catch-all `/api/coach/:x` de 1 segmento. As rotas paramétricas existentes são todas de 2+ segmentos com prefixo distinto: `/api/coach/sessions/:id/...`, `/api/coach/actions/:id`, `/api/coach/nudges/:id/...`, `/api/coach/reports/:id`, `/api/coach/audit/:id/dismiss`. **`/api/coach/planning/...` tem prefixo `planning` dedicado e NÃO é shadowado por nenhuma rota existente** — Express casa por path completo, e nenhum padrão existente casa `planning` como valor de `:id`/`:x`.

**Decisão:** registrar os 5 endpoints de EST-6 em **arquivo novo `server/routes/coachPlanning.ts`** com `export function registerCoachPlanningRoutes(app, requireAuth)`, chamado **dentro de `registerCoachRoutes` ANTES de `registerCoachAi1bRoutes(app, requireAuth)`** (linha 1072 de `coach.ts`). Motivo de arquivo novo (vs adicionar em coach.ts): isolamento do módulo + ordem de registro explícita e auditável. Ordem segura porque os prefixos são disjuntos, mas registrar antes do AI-1B elimina qualquer ambiguidade futura caso AI-1B ganhe uma rota mais genérica.

**Ordem de registro exata** (a prescrever ao implementer, em `coach.ts:registerCoachRoutes`):
```
... rotas coach existentes ...
registerCoachPlanningRoutes(app, requireAuth);   // EST-6 — ANTES do AI-1B
registerCoachAi1bRoutes(app, requireAuth);       // já existente (linha 1072)
```

**Guard test obrigatório** (`tests/integration/routes/est-6-route-collision.test.ts`): registrar o app real (via `registerCoachRoutes`) e assertar que `POST /api/coach/planning/start` e `GET /api/coach/planning/2026-06-08` NÃO caem em handler de `/api/coach/reports/:id` nem `/api/coach/:x`. O guard test monta o app de verdade (não chama handler direto) — handler-direct é cego a colisão (lição do EST-3). Assert: resposta vem do handler de planning (ex.: shape `{ session: {...steps...} }`), não `{ report: ... }`.

### #3 — Como o resumo (RF-06) é postado no chat

**Reusar o padrão de entrega do EST-1**, NÃO criar novo emissor. EST-1 (`server/services/reportDelivery.ts:deliverReport`) usa:
```
const session = await storage.getOrCreateReportChatSession(userId);
await storage.insertChatMessage({ chatSessionId: session.id, role: "assistant", content });
```
EST-6 RF-06 reusa **exatamente** essas duas chamadas de storage para postar o resumo do plano como turno do mentor. NÃO usar `deliverReport` (que é específico de relatórios com `reportId` + email + notif). EST-6 chama diretamente `getOrCreateReportChatSession` + `insertChatMessage` (role=`assistant`). O `coachType` do canal de relatórios é o do `getOrCreateReportChatSession` (technical) — não é parâmetro do `insertChatMessage`. Encapsular em helper local `postPlanningSummaryToChat(userId, summaryText, injectedStorage)` no orquestrador.

### #4 — Shape exato de `steps` jsonb

Definido em "Contrato de tipos" abaixo. Zod + tipo TypeScript compartilhado em **`shared/coach-planning.ts`** (novo arquivo — compartilhado entre orquestrador, handlers e schema Drizzle/Zod).

### #5 — `source` enum

`source: 'coach_manual' | 'est5_ritual'`. `coach_manual` = jogador via chat `/coach-ai` (default). `est5_ritual` = chamado pelo estado `planning` do EST-5. **EST-5 passa flag explícita:** `startPlanning(userId, weekStartDate, { source: 'est5_ritual' })`. O default de `opts.source` é `'coach_manual'`. O valor é gravado em `weekly_planning_sessions.source` na criação (não muda em reentrada — idempotência preserva o `source` original).

### #6 — Mapa `:step` → tool

Resolvido em DEC-2 (tabela canônica).

---

## Chaves de semana (UTC vs BRT — NÃO unificar)

| Tabela | Convenção | Helper |
|---|---|---|
| `weekly_planning_sessions.week_start_date` | **UTC** (próxima segunda 00:00 UTC) | `ymdUtc(date)` |
| `study_weekly_plans.week_start_date` | **UTC** | mesmo `ymdUtc` (storage usa `dateToYmdUtc`) |
| `coach_lesson_recommendations.week_start_date` | **BRT** | `brtMondayYmd(date)` |

**`ymdUtc` hoje é privado** em `server/services/studyWeeklyPlanService.ts:85`. **Decisão:** extrair para util compartilhado **`server/coach/planning/weekKeys.ts`** com:
- `ymdUtc(d: Date): string` — `YYYY-MM-DD` em UTC (idêntico ao atual; `studyWeeklyPlanService` passa a importar deste módulo para evitar drift — DRY).
- `nextMondayUtc(from: Date = new Date()): Date` — próxima segunda 00:00 UTC.
- `brtMondayYmd(d: Date): string` — segunda da semana no fuso `America/Sao_Paulo` (UTC-3), `YYYY-MM-DD`. Usado SÓ para a chave BRT de `coach_lesson_recommendations`.

> O `weekStartDate` aceito pelos endpoints (`:weekStartDate` = `YYYY-MM-DD`) é sempre a **chave UTC**. A conversão para BRT (passo `lessons`) é feita internamente: a partir da `week_start_date` UTC da sessão, deriva-se a segunda BRT correspondente via `brtMondayYmd`. Guard test por tabela (RF: "Drift de chave de semana").

---

## Contrato de tipos (`shared/coach-planning.ts`)

```typescript
import { z } from "zod";

export const PLANNING_STEP_KEYS = ["grind", "study", "lessons", "themes"] as const;
export type PlanningStepKey = (typeof PLANNING_STEP_KEYS)[number];

export const PLANNING_STEP_STATUSES = ["pending", "proposed", "confirmed", "skipped"] as const;
export type PlanningStepStatus = (typeof PLANNING_STEP_STATUSES)[number];

export const PLANNING_SESSION_STATUSES = ["in_progress", "completed", "abandoned"] as const;
export type PlanningSessionStatus = (typeof PLANNING_SESSION_STATUSES)[number];

export const PLANNING_SOURCES = ["coach_manual", "est5_ritual"] as const;
export type PlanningSource = (typeof PLANNING_SOURCES)[number];

// --- Estado por passo --------------------------------------------------------
const baseStep = z.object({
  status: z.enum(PLANNING_STEP_STATUSES),
  proposedAt: z.string().nullable().optional(),
  confirmedAt: z.string().nullable().optional(),
});

export const grindStepSchema = baseStep.extend({
  createdIds: z.array(z.string()).optional(),   // planned_tournaments ids (executeConfirmed)
  offDays: z.array(z.string()).optional(),      // YYYY-MM-DD marcados via mark_off_day
});

export const studyStepSchema = baseStep.extend({
  sessionIds: z.array(z.string()).optional(),   // study_sessions_v2 ids (status=planned)
  weeklyPlanSynced: z.boolean().optional(),      // UPSERT study_weekly_plans feito
});

export const lessonsStepSchema = baseStep.extend({
  lessonIds: z.array(z.string()).optional(),     // lessonId confirmados (whitelist curated)
  recIds: z.array(z.string()).optional(),        // coach_lesson_recommendations ids gravados
});

export const themesStepSchema = baseStep.extend({
  focus: z.array(z.object({
    statId: z.string(),
    statName: z.string(),
    severity: z.string().optional(),
    source: z.enum(["leaks", "focus_stats", "fallback"]).optional(),
  })).optional(),
});

export const planningStepsSchema = z.object({
  grind: grindStepSchema,
  study: studyStepSchema,
  lessons: lessonsStepSchema,
  themes: themesStepSchema,
});
export type PlanningSteps = z.infer<typeof planningStepsSchema>;

// Estado inicial: 4 passos pending.
export function initialPlanningSteps(): PlanningSteps {
  const pending = { status: "pending" as const };
  return { grind: { ...pending }, study: { ...pending }, lessons: { ...pending }, themes: { ...pending } };
}

// --- Request schemas (endpoints) ---------------------------------------------
export const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const startPlanningBodySchema = z.object({
  weekStartDate: z.string().regex(YMD_REGEX).optional(), // default = nextMondayUtc()
  source: z.enum(PLANNING_SOURCES).optional().default("coach_manual"),
});

export const stepParamSchema = z.enum(PLANNING_STEP_KEYS);

// propose/confirm aceitam payload livre por passo (validado pelo tool no confirm).
export const proposeStepBodySchema = z.object({}).passthrough();
export const confirmStepBodySchema = z.object({}).passthrough();
```

**Status de sessão derivado:** `status='completed'` ⟺ todos os 4 passos ∈ `{confirmed, skipped}`. Caso contrário `in_progress`. `abandoned` reservado (não setado por EST-6; futuro EST-5 pode usar).

---

## Contrato do orquestrador (`server/coach/planning/weeklyPlanningOrchestrator.ts`)

```typescript
interface PlanningCtx {
  userId: string;
  injectedStorage?: any;   // lesson #34 — composição em testes
}

// Ponto de entrada PLUGGÁVEL (HTTP + EST-5).
export async function startPlanning(
  userId: string,
  weekStartDate?: string,                       // YYYY-MM-DD UTC; default nextMondayUtc()
  opts?: { source?: PlanningSource; injectedStorage?: any },
): Promise<{ session: WeeklyPlanningSession }>;  // idempotente: retorna existente se já houver

export async function getPlanningSession(
  userId: string,
  weekStartDate: string,
  injectedStorage?: any,
): Promise<WeeklyPlanningSession | null>;

// Cada passo recebe (input livre, ctx). `fetchPayloadBefore` do tool é o "propose".
export async function proposeStep(
  step: PlanningStepKey,
  weekStartDate: string,
  input: unknown,
  ctx: PlanningCtx,
): Promise<{ preview: any; step: PlanningStepKey; status: PlanningStepStatus }>;

export async function confirmStep(
  step: PlanningStepKey,
  weekStartDate: string,
  input: unknown,
  ctx: PlanningCtx,
): Promise<{ session: WeeklyPlanningSession; stepResult: any }>;

export async function skipStep(
  step: PlanningStepKey,
  weekStartDate: string,
  ctx: PlanningCtx,
): Promise<{ session: WeeklyPlanningSession }>;
```

- `confirmStep` despacha por `step`: `grind`→`bulkProposeGradeTool.executeConfirmed(input, {userId, injectedStorage}, tx)`; `study`→loop `scheduleStudyBlockTool.executeConfirmed(block, ctx, tx)` + `upsertStudyWeeklyPlan`; `lessons`→`recommendLessonTool.handler` (whitelist) seguido de `createCoachRecommendation` por aula; `themes`→read-only `getStatsLeaks`.
- O `tx` passado aos tools segue o padrão "fallback gentil" (lesson #32): `confirmStep` NÃO precisa de `db.transaction` (operações são tool-internas idempotentes); passa `tx = undefined` aos tools (que aceitam `_tx` e ignoram). Documentado para o test-writer não esperar transação.
- Após cada `confirm`/`skip`, recomputa `status` da sessão; se virar `completed`, chama `postPlanningSummaryToChat`.

---

## Consequências

**Positivas:**
- Contrato estável de "planning concluído" (`status='completed'`) que EST-5 consome via `getPlanningSession` ou diretamente do retorno do orquestrador.
- Idempotência forte (UNIQUE + UPSERT) sem unificar UTC/BRT.
- Reuso total dos tools AI-2A e do canal de chat do EST-1 — zero duplicação de emissor/escrita.
- Guard test de colisão de rota previne a regressão que o EST-3 sofreu.

**Negativas:**
- 1 migration nova (estado a manter; back-fill desnecessário — tabela nasce vazia).
- Acoplamento implícito com EST-5 no contrato de `status` — mitigado por teste com mock de EST-5 chamando `startPlanning`/`getPlanningSession` direto.
- `recommend_lesson` tool e a persistência em `coach_lesson_recommendations` ficam em camadas diferentes (tool=whitelist, orquestrador=persistência) — exige doc clara (feita aqui) pra test-writer não assertar persistência no tool.

**Neutras:**
- `ymdUtc` extraído para `weekKeys.ts`; `studyWeeklyPlanService` passa a importar (refactor pequeno, mesmo comportamento).
- Custo LLM acumulado (preview grade + sugestão blocos) reusa tools já cacheados; passos `lessons`/`themes` majoritariamente determinísticos.

## Confiança
Alta — todas as dependências (tools AI-2A, `getReportTier`, `upsertStudyWeeklyPlan`, `createCoachRecommendation`, `getStatsLeaks`, canal de chat) estão SHIPPED e tiveram assinaturas verificadas no código. A colisão de rota foi investigada e descartada com ordem de registro prescrita + guard test.
