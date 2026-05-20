# ADR-169: Quarterly Career Review — opt-in Pro+/Trial via `getReportTier` (AI-1C ADR-159) + branch novo `isReportEligible(userId, 'quarterly')` em `reportEligibility.ts` + enqueuer estendendo o tick hourly existente (jan/abr/jul/out dia 1 às 7h locais do user, sem cron dedicado) + `quarterlyReportGenerator.ts` reusando `reportGeneratorShared.ts` (DRY com weekly/monthly/daily, sem duplicar `persistReport`/`sanitizeHref`/`computeCost`/`callLlm`) + sumarização hierárquica Haiku (ADR-159 §sumarizador) quase sempre disparada (bundle trimestral > 20K chars) + `ReportContent` v3 com 5 seções novas (`irpfSummary` BR-only via PTAX médio do trimestre via `fxCascade.getAveragePtaxForRange`, `cgameSnapshot` AI-2B RF-05, `mentalHandHighlights` top 3 do trimestre, `careerGoalsProgress` via `evaluate_career_goal` interno) + disclaimer regulatório obrigatório no footer (ADR-173)

## Status
Aceito

## Data
2026-05-20

## Sprint
AI-2B (`Docs/specs/sprint-ai-2b.md` — RF-03, RF-04; Q-B + Q-C locked 2026-05-20)

## Decision owner
system-architect (founder locked Q-B em 2026-05-20: estender enqueuer hourly, sem cron dedicado; Q-C locked: "Resumo fiscal informativo" via PTAX médio + disclaimer "informativo, não substitui contador", sem cálculo de imposto devido)

## Related
- Depende de: ADR-159 (AI-1C — `report_jobs`/`reports` pipeline + `reportEligibility.ts` `getReportTier`/`isReportEligible` + `reportGeneratorShared.ts` helpers DRY + `hierarchicalSummarizer.ts` Haiku); ADR-160 (`bulk_query_dimensions` — Quarterly Generator usa em loop para Q-1/Q-2/Q-4 comparativos sem N round-trips); ADR-161 (`ReportContent.followUp` block); ADR-163 (`fxResolver` cascade — base do `fxCascade`); ADR-168 (`career_goals` — input do `careerGoalsProgress`); ADR-170 (C-game/Inchworm aggregator — input do `cgameSnapshot`); ADR-171 (`mental_hand_history` — input do `mentalHandHighlights`); ADR-173 (Disclaimer regulatório — footer obrigatório).
- Reusa: `enqueueReportJobsTick` (hourly tick AI-1B), `processReportJobsTick` (despacha por `job.reportType`), `monthlyReportGenerator.ts` (modelo de comparativos vs N períodos atrás), `varianceAnalysis.ts` (`detectLeaks` + heurística de variância — extraída do monthly em AI-2A ADR-166), `fxCascade.ts` (BCB PTAX preferencial para BRL).
- Sucessor de: nada — primeiro report trimestral. `report_type='quarterly'` já reservado em AI-1C ADR-159 (varchar(16) livre, sem ALTER).
- Diagramas: `Docs/architecture/diagrams/coach-ai-2b/quarterly-report-pipeline.mermaid`.

---

## 1. Contexto

O Quarterly Career Review é o **único report trimestral** do plano de IA. Diferentemente do Weekly (cron semanal) ou Monthly (cron mensal), trimestral é raro (4x/ano por user) mas caro (~$0.18 estimado vs ~$0.11 monthly) — bundle do trimestre é 3x o monthly e quase sempre dispara sumarização hierárquica Haiku (ADR-159).

A pergunta central: trigger (Q-B); modelo de gating (`isReportEligible('quarterly')`); seções (`ReportContent` v3 — `schemaVersion: 3` lesson #7); seção IRPF (Q-C); preço/modelo; idempotência.

### Restrições

- **Lesson #7 (`schemaVersion` bump + optional + default):** alargar `ReportContent` para incluir 5 campos opcionais novos (`irpfSummary`, `cgameSnapshot`, `mentalHandHighlights`, `careerGoalsProgress`, `disclaimer`); `schemaVersion 2 → 3`; frontend `ReportView` tolera 1, 2, 3.
- **Lesson #6 (FX → USD):** todos os números do bundle em USD antes de compor; conversão para BRL feita SÓ na seção `irpfSummary` via PTAX médio.
- **Lesson #5/#35 (`new AnthropicCtor` try/catch):** fail-soft mantido — sem `ANTHROPIC_API_KEY` → degraded determinístico (sem prosa, conteúdo estruturado).
- **Lesson #10 (DRY prompt):** prompt único em `server/coach/prompts/quarterlyReport.ts` consumindo `GRINDFY_AI_BASE` + `CITATIONS_RULES` STATIC com `cache_control: ephemeral`.
- **Lesson #11 (default mínimo):** seções vazias → omitir, não inventar texto. `irpfSummary` ausente para users não-BR. `careerGoalsProgress` ausente se 0 metas com `horizon ∈ {trimestre,ano,multi_ano}`.
- **Lesson #19 (CTAs em rotas):** CTAs do quarterly só apontam para tools/rotas existentes.
- **Boundary de mês/trimestre + TZ:** enqueuer hourly itera users com `iterateUsersWithTimezone`; `period_start` = 1º dia do trimestre anterior **no UTC do servidor** (deriva do fuso do user); processor revalida.
- **`COACH_NUDGES_ENABLED=false`:** kill switch global desliga enqueuer + processor (consistente com AI-1B/1C).

### O que está fora de escopo

- Cálculo de imposto devido / alíquotas / "como declarar" — só extrato informativo (Q-C lock).
- Trimestres móveis (qualquer 3 meses) — só trimestres civis (Q1/Q2/Q3/Q4).
- Comparativos vs Q+1 (futuro) — só Q-1, Q-2, mesmo Q do ano anterior.
- LLM gerando `goalsProgress` para metas em `ai_structured_profile.metas` legacy — Quarterly Report olha SÓ `career_goals` (ADR-168). Monthly continua olhando legacy (AI-1C inalterado).
- Onboarding wizard para Quarterly (igual ao Weekly/Monthly — opt-in por preference).

---

## 2. Decisão

Adotada: **enqueuer hourly estendido + gerador `quarterlyReportGenerator.ts` + `ReportContent` v3 com 5 seções novas + `compute_irpf_summary` tool ad-hoc**.

### 2.1. Trigger (Q-B)

- `enqueueReportJobsTick(now)` em `server/jobs/reportJobRunner.ts` (já tick hourly AI-1B + monthly AI-1C) ganha branch novo:
  ```ts
  if (getLocalHour(user, now) === 7
      && getLocalDate(user, now).getUTCDate() === 1
      && [0, 3, 6, 9].includes(getLocalDate(user, now).getUTCMonth()) // jan=0, abr=3, jul=6, out=9
      && await isReportEligible(userId, 'quarterly')) {
    const { periodStart, periodEnd } = computePreviousQuarterRange(user, now);
    await storage.insertReportJob({
      userId, reportType: 'quarterly', periodStart, periodEnd,
      enqueuedBy: 'cron_enqueuer'
    });
    // ON CONFLICT (user_id, report_type, period_start) DO NOTHING — UNIQUE garante 1/user/trimestre
  }
  ```
- `computePreviousQuarterRange(user, now)`:
  - Mês atual local = 1 (jan) → Q4 anterior (out-dez do ano anterior).
  - Mês atual local = 4 (abr) → Q1 (jan-mar).
  - Mês atual local = 7 (jul) → Q2 (abr-jun).
  - Mês atual local = 10 (out) → Q3 (jul-set).
- Idempotência: `report_jobs` UNIQUE `(user_id, report_type, period_start)` garante 1 quarterly job por user por trimestre. Em rerun do tick na mesma hora, ON CONFLICT no-op.

### 2.2. Gating (`isReportEligible(userId, 'quarterly')`)

- `server/coach/reportEligibility.ts` `PREF_FIELD_BY_KIND` ganha `quarterly: 'reportQuarterlyEnabled'`.
- `isReportEligible(userId, type)` agora aceita `'weekly'|'daily'|'monthly'|'quarterly'`. Retorna `true` se `getReportTier(user) ∈ {'free','eligible'}` (Free nunca passa em report — `getReportTier` retorna `'free'` mas pref OFF; `eligible` para Trial OU pro/premium/admin) **AND** pref correspondente está `true`.
- `getReportTier` em si **não muda** (consistente com AI-1C — gateia rate limit + tools; relatório usa nesse helper canônico).

### 2.3. Processor

- `processReportJobsTick` (AI-1C já despacha por `job.reportType`) ganha case `'quarterly'` → `(await import("../services/quarterlyReportGenerator")).generateQuarterlyReport({ userId, periodStart, periodEnd, injectedStorage? })`.
- Processor revalida `isReportEligible` (downgrade → `status='skipped'`; consistente com AI-1C).

### 2.4. Gerador `quarterlyReportGenerator.ts` — estrutura

Reusa `reportGeneratorShared.ts` (extraído em AI-1C):

```ts
import { persistReport, sanitizeHref, computeCost, callLlm, resolveStorage } from "./reportGeneratorShared";
import { summarizeBundleHierarchical } from "../coach/hierarchicalSummarizer";
import { buildReportFollowUp } from "./reportGeneratorShared";
import { varianceAnalysis } from "../coach/varianceAnalysis"; // ADR-166
import { fxCascade } from "../../shared/fxCascade";
import { aggregateCgameForPeriod, getInchwormSeries } from "./cgameAggregator"; // ADR-170
import { listMentalHandsForRange, selectTopHighlights } from "./mentalHandsSelector"; // ADR-171
import { listCareerGoalsActive, evaluateCareerGoal } from "./careerGoalsService"; // ADR-168

export async function generateQuarterlyReport({ userId, periodStart, periodEnd, injectedStorage }: Args) {
  const storage = resolveStorage(injectedStorage);

  // 1. Bundle (read-heavy)
  const bundle = await buildQuarterlyBundle(storage, userId, periodStart, periodEnd);

  // 2. Sumarização hierárquica Haiku (quase sempre dispara)
  const summarized = await summarizeBundleHierarchical({ bundle, reportType: 'quarterly' });

  // 3. C-game / Inchworm
  const cgameSnapshot = await aggregateCgameForPeriod(userId, { start: periodStart, end: periodEnd });
  cgameSnapshot.inchwormSeries = await getInchwormSeries(userId, 6);
  cgameSnapshot.movement = await computeCgameMovement(userId, currentRange, prevRange);

  // 4. Mental hand highlights (top 3)
  const mentalHandHighlights = selectTopHighlights(await listMentalHandsForRange(userId, periodStart, periodEnd), 3);

  // 5. Career goals progress (somente metas com horizon ∈ {trimestre,ano,multi_ano})
  const goals = await listCareerGoalsActive(userId);
  const goalsForQuarterly = goals.filter(g => ['trimestre','ano','multi_ano'].includes(g.horizon));
  const careerGoalsProgress = await Promise.all(goalsForQuarterly.map(g => evaluateCareerGoal(g.id, userId)));

  // 6. IRPF summary (BR-only)
  const irpfSummary = await buildIrpfSummary(userId, periodStart, periodEnd);

  // 7. Follow-up block (ADR-161)
  const followUp = await buildReportFollowUp(storage, userId);

  // 8. LLM narrative (Sonnet 4.6, max_tokens 4000)
  const llmResult = await callLlm({
    model: process.env.COACH_MODEL ?? 'claude-sonnet-4-6',
    systemParts: [GRINDFY_AI_BASE, CITATIONS_RULES, QUARTERLY_REPORT_PROMPT],
    userPayload: { summarized, cgameSnapshot, mentalHandHighlights, careerGoalsProgress, irpfSummary, followUp },
    maxTokens: 4000,
  });

  // 9. Compor content v3 + markdown + disclaimer
  const content: ReportContent = {
    schemaVersion: 3,
    reportType: 'quarterly',
    period: { start: periodStart, end: periodEnd },
    ...llmResult.sections, // 14+ seções estruturadas
    cgameSnapshot,
    mentalHandHighlights,
    careerGoalsProgress,
    irpfSummary,
    followUp,
    disclaimer: REPORT_DISCLAIMER, // ADR-173
  };

  const markdown = renderMarkdownBase(content) + renderDisclaimerFooter(content.disclaimer);

  // 10. Persist
  await persistReport(storage, {
    userId, reportType: 'quarterly', periodStart, periodEnd,
    content, markdown, status: llmResult.degraded ? 'degraded' : 'ready',
    model: llmResult.model, summarizerModelUsed: summarized.summarizerModelUsed,
    costUsdEstimate: computeCost(llmResult.usage, summarized.usage),
  });

  return { status: 'ready', content, markdown };
}
```

### 2.5. Seções do `content` v3

| # | Seção | Fonte | Notas |
|---|---|---|---|
| 1 | Cabeçalho | bundle agregado | Tom = `tomPreferido` do user. |
| 2-6 | Mesmas do monthly (volume, bankroll, selection, study, mental) | LLM | Trimestre vs monthly = sample 3x maior. |
| 7 | Evolução intra-trimestre | série mensal dos 3 meses | Linkar para Monthly Reports do trimestre se existirem. |
| 8 | Comparativos vs Q-1, Q-2, mesmo Q ano anterior | `bulk_query_dimensions` (ADR-160) | Reusa pattern do monthly. |
| 9 | Análise de variância trimestral | `varianceAnalysis.ts` (ADR-166) | Sample maior → confidence mais alto. |
| 10 | Leaks: evolução trimestral | `detectLeaks` + `coach_leak_focus` | Resolvidos/novos/ativos. |
| 11 | Progresso das metas | `evaluate_career_goal` interno | Só `career_goals` (ADR-168), só horizon ∈ {trimestre,ano,multi_ano}. |
| 12 | C-game / Inchworm movimento trimestral | `cgameAggregator` (ADR-170) | %A/%B/%C + movimento vs Q anterior. |
| 13 | Mental Hand History highlights | `mental_hand_history` (ADR-171) | Top 3 por intensidade/recência. |
| 14 | **Resumo fiscal informativo (IRPF)** | `fxCascade.getAveragePtaxForRange` | BR-only. Disclaimer Q-C obrigatório. |
| 15 | Plano dos próximos 90 dias | LLM | Sugestão de foco; NÃO monta grade (AI-2A faz). |
| 16 | Follow-ups abertos | `buildReportFollowUp` (ADR-161) | Leaks ativos + metas em progresso + foco do mês. |
| 17 | CTAs | rotas Wouter registradas | Lesson #19 — só rotas que existem. |
| 18 | Disclaimer regulatório footer | `REPORT_DISCLAIMER` (ADR-173) | Sempre presente. |

### 2.6. IRPF summary (Q-C) — `compute_irpf_summary` tool + seção no quarterly

**Shape (consumido pelo gerador E pela tool ad-hoc):**
```ts
type IrpfSummary = {
  profitUsd: number,                  // P&L total do trimestre USD (FX cascade lesson #6)
  profitBrl: number,                  // profitUsd * avgPtax
  avgPtax: number,                    // PTAX médio do período via BCB
  period: { start: string, end: string },
  byCurrency: Array<{
    currency: string,                 // 'USD' | 'BRL' | 'EUR' | ...
    profit: number,                   // em moeda nativa
    convertedUsd: number,
    convertedBrl: number,
  }>,
  rakebackGrossUsd: number,           // wallet_transactions.reason='rakeback' (ADR-039)
  disclaimer: string,                 // texto Q-H locked
}
```

- **BR-only:** seção incluída no quarterly se `users.country === 'BR'` OU `users.timezone` começa com `America/` (`America/Sao_Paulo`, `America/Manaus`, etc.). Caso contrário, `irpfSummary: undefined` → markdown omite a seção.
- `fxCascade.getAveragePtaxForRange(from, to)`: novo método em `shared/fxCascade.ts` — se não existir, criar (média simples dos rates diários BCB no range; fallback `frankfurter` se BCB falhar; mesmo cache 24h).
- **Tool ad-hoc `compute_irpf_summary` (RF-04):**
  - Handler: `server/coachTools/handlers/computeIrpfSummary.ts`.
  - Input: `{ period: { start, end } }`.
  - Output: shape `IrpfSummary` + 1 disclaimer prominente.
  - `requiresConfirmation: false`, `auditLevel: 'log'`.
  - Gating: Pro+/Trial via `isToolEligibleTier`.
  - User pode chamar fora do quarterly para reconciliação pontual.

### 2.7. Custo / modelo

- **Sonnet 4.6** para narrative (`process.env.COACH_MODEL ?? 'claude-sonnet-4-6'`); `max_tokens 4000`.
- **Haiku** (sumarização hierárquica): bundle quase sempre > 20K chars → dispara `summarizeBundleHierarchical`. `summarizer_model_used` populado.
- Custo estimado: ~$0.18 por quarterly (~3x monthly). 4x/ano = ~$0.72 anual por Pro user com opt-in.
- Cost gravado em `reports.cost_usd_estimate` + `tokens_input/output`.
- Fail-soft: sem `ANTHROPIC_API_KEY` → degraded determinístico, content v3 estruturado preenchido, narrative ausente, status='degraded'. Mesma robustez AI-1C (lesson #5/#35).

### 2.8. Idempotência + retries

- `report_jobs` UNIQUE `(user_id, 'quarterly', period_start)` garante 1/user/trimestre.
- Retry exponencial herdado de AI-1B/1C: status `pending`→`running`→`done`/`failed`/`skipped`; `next_attempt_at` exponencial 5min/15min/1h/4h; após 3 tentativas → `failed` final (mesma policy).

---

## 3. Opções consideradas

### Opção A — Enqueuer hourly estendido + reuso do pipeline AI-1B/1C — ESCOLHIDA
**Prós:**
- TZ-aware (jan/abr/jul/out às 7h local do user).
- Reusa `report_jobs`/`reports`/retry/audit.
- Consistente com Weekly/Monthly — 1 só tick a debugar.
- `bulk_query_dimensions` (ADR-160) já existe para comparativos.
**Contras:**
- Branch a mais no hourly tick — código complexo. Mitigado: extrair `enqueueQuarterlyReports(now)` helper chamado pelo mesmo tick (sub-função, não tick separado — clareza > duplicação).

### Opção B — Cron dedicado `0 7 1 1,4,7,10 *`
**Prós:**
- Simples — 1 cron por tipo.
**Contras:**
- Sem fuso (UTC fixo) — user em `America/Sao_Paulo` recebe às 4h local.
- Não respeita user com timezone diferente.
- Quebra pattern consistente com weekly/monthly (todos no enqueuer hourly).

### Opção C — Trigger event-driven (igual Daily Debrief)
**Prós:**
- Sem polling.
**Contras:**
- Não há evento natural — Quarterly é puramente temporal (data civil). Forçar evento (ex: "1º login do trimestre") seria UX confusa (user recebe quando logar, não em data fixa).
- Lesson "default mínimo" #11 — não inventar trigger artificial.

---

## 4. Consequências

### Positivas
- 4x/ano por user com opt-in → custo baixo (~$0.72/year/user).
- Visão estratégica de carreira que weekly/monthly não dão (comparativos vs Q-1, Q-2, mesmo Q ano anterior).
- IRPF summary informativo desbloqueia 1 use case real (jogador BR no fim do trimestre quer extrato pro contador).
- Reuso máximo do pipeline AI-1B/1C — manutenção centralizada.

### Negativas
- Boundary de mês × timezone × DST exige cuidado (TZ-aware via `iterateUsersWithTimezone` — herdado, mas testar para Q1 jan/2027 com user em fuso `America/Sao_Paulo` que tem DST removido).
- Sumarização Haiku quase sempre dispara → custo extra (já considerado nos ~$0.18).
- ⚠️ `irpfSummary` é informativo, NÃO substitui contador — disclaimer canônico (ADR-173) obrigatório no footer + texto explícito na seção 14 + system prompt deflete "como declarar".

### Neutras
- `ReportContent` v3 com schemaVersion bump (lesson #7) — frontend `ReportView` tolera 1/2/3.
- `compute_irpf_summary` tool ad-hoc dá ao user controle direto fora do trimestre.

## Confiança
**Alta** — pipeline AI-1B/1C robusto há semanas; `reportGeneratorShared.ts` validou DRY; Sonnet 4.6 + Haiku sumarização stack provada; IRPF informativo blindado por disclaimer canônico.
