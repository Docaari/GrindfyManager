# ADR-134 — Coach tools `coachStudyPlan` e `coachSessionInsights` em `coachToolRunner` modular

- Status: Aceito
- Data: 2026-05-08
- Sprint: estudos-coach-biblio-2
- Decision owner: system-architect
- Related: spec `Docs/specs/estudos-coach-biblio-2.md` §RF-3 + §RF-4, ADR-023 (tool registry pattern), ADR-024 (tool result wrapping), ADR-025 (page context whitelist), ADR-026 (continuation loop limit), ADR-115 (recommendation prompt cache)

---

## 1. Contexto

Sprint Estudos-Coach-Biblio-2 introduz **2 chamadas Coach novas** com output JSON estruturado:

- **`coachStudyPlan`** (RF-3): gera plano semanal de estudo. Input: userContext (focusStats, leaks, avgDuration, recentLessons, starredHandsRecent). Output: `StudyWeeklyPlan` shape (5 dias x 3-4 atividades).
- **`coachSessionInsights`** (RF-4): analisa sessao /grind-live finalizada. Input: sessionContext (tournaments, spots, focusStats). Output: `SessionInsights` shape (summary, topHands, suggestedLessons, spotsToReview, focusStatsHighlight).

Ambas precisam:
1. **Output JSON validado por Zod** (anti-alucinacao + schema rigido).
2. **System prompts longos** com instrucoes deterministicas.
3. **Lazy load por contexto de pagina** — `coachStudyPlan` so carrega para `/estudos`; `coachSessionInsights` so para `/grind-live/:id/recap`.
4. **Custo tracking** (`cost_tokens_used` persistido).
5. **Retry 1x se Zod fail** com prompt corretivo.

Tres opcoes de organizacao:

1. **Tools dentro do `coachToolRunner.ts` existente** seguindo ADR-023 (tool registry modular por dominio).
2. **Servico separado fora do coach pipeline** — chamada Anthropic direta sem passar pelo runner, pq sao tools internas (nao expostas ao chat).
3. **Funcoes Anthropic SDK direto** sem framework de tool registry.

A spec sugere reusar infra existente (lesson #10 — DRY de prompts). Sprint Coach-2A (ADR-023) ja documentou pattern modular `server/coachTools/<domain>/` com index central. Adicionar 2 tools eh extensao natural.

---

## 2. Decisao

**Adicionar `coachStudyPlan` e `coachSessionInsights` como tools no registry existente (ADR-023), em modulos dedicados sob `server/coachTools/`. Lazy-load por page context (ADR-025). System prompts em arquivos dedicados extraindo lesson #10 (DRY de prompts).**

### 2.1 Estrutura de arquivos

```
server/
├── coachToolRunner.ts                  (existente — registry index)
├── coachTools/
│   ├── studies/
│   │   ├── coachStudyPlan.ts           (NOVO — tool def + handler)
│   │   ├── coachStudyPlan.prompts.ts   (NOVO — system + user blocks)
│   │   └── coachStudyPlan.schema.ts    (NOVO — Zod schema StudyWeeklyPlan)
│   └── grind-live/
│       ├── coachSessionInsights.ts     (NOVO)
│       ├── coachSessionInsights.prompts.ts
│       └── coachSessionInsights.schema.ts
└── services/
    ├── studyWeeklyPlanService.ts       (NOVO — orquestrator: collect ctx + call tool + persist)
    └── coachSessionInsightsService.ts  (NOVO — orquestrator: cache check + call tool + persist)
```

### 2.2 Padrao de tool definition

```ts
// server/coachTools/studies/coachStudyPlan.ts
import { COACH_STUDY_PLAN_SYSTEM_PROMPT, buildStudyPlanUserBlock } from './coachStudyPlan.prompts'
import { StudyWeeklyPlanSchema } from './coachStudyPlan.schema'

export const coachStudyPlanTool = {
  name: 'coachStudyPlan',
  description: 'Gera plano de estudo semanal personalizado baseado em focus stats, leaks recentes, aulas relevantes e starred hands criticos. Output: 5 dias x 3-4 atividades estruturadas.',
  page_context: ['estudos'],          // ADR-025 — lazy load por route
  audit_level: 'persist',             // ADR-024 — wraps result em coach_actions
  cache_strategy: 'ephemeral_system', // ADR-019 — system prompt cached
  input_schema: {
    type: 'object',
    properties: {
      userContext: { type: 'object', /* shape em RF-3.1 */ },
      weekStartDate: { type: 'string' /* ISO date */ }
    },
    required: ['userContext', 'weekStartDate']
  },
  output_schema: StudyWeeklyPlanSchema,
  systemPromptBlock: COACH_STUDY_PLAN_SYSTEM_PROMPT,
  handler: async (input) => { /* delegate to studyWeeklyPlanService */ }
}
```

### 2.3 Servicos orquestradores (separados das tools)

A tool em si soh **define contrato + chama Anthropic + valida Zod + retry**. **Persistencia + cache + side effects** ficam em servicos:

- `studyWeeklyPlanService.generatePlan(userId, weekStartDate, source)`:
  1. Coleta context (focusStats, leaks via `getStatsLeaks`, avgDuration, recentLessons, starredHandsRecent).
  2. Calcula `daily_target_minutes` (clamp 15-120; default 30 se sem historico).
  3. Chama tool `coachStudyPlan` com context + weekStartDate.
  4. Valida output Zod. Retry 1x se invalido.
  5. Valida `lessonId`/`themeId` reais (anti-hallucinacao).
  6. UPSERT `study_weekly_plans` (UNIQUE `(user_id, week_start_date)`).
  7. Telemetria `study_plan_generated`.

- `coachSessionInsightsService.getOrGenerate(userId, sessionId, force)`:
  1. Ownership + finalized check.
  2. Cache check (ADR-133): `SELECT FROM coach_session_insights WHERE grind_session_id=$1 AND expires_at > now()`. Se hit + !force, return.
  3. Coleta context (session, tournaments, spots/starredHands, focusStats).
  4. Chama tool `coachSessionInsights`.
  5. Valida Zod. Retry 1x.
  6. Valida `handId` ∈ spots da sessao (anti-hallucinacao).
  7. UPSERT `coach_session_insights` (UNIQUE `grind_session_id`, ON CONFLICT DO UPDATE).
  8. Telemetria `coach_session_insights_generated`.

### 2.4 Determinismo: pattern matching fora do Coach

Decisao chave: **mapping `leak → tema → lesson` NAO eh tarefa do Coach**. Coach gera narrativa + ordem; lookup de aulas/temas eh deterministico via `study_themes.linkedLessons` + `linkedStats` (lesson #11 — apresentar dado, nao decorar).

Workflow para cada tool:
1. Servico colhe **dados estruturados** (leaks com IDs reais; lessons curated com IDs reais).
2. Passa lista enxuta `["lesson_abc", "lesson_xyz"]` no user block como **whitelist disponivel**.
3. Coach so escolhe **dentro do whitelist** + gera title/description/reasoning. Output validado contra whitelist.

Anti-hallucination dupla camada:
- Zod valida shape.
- App valida `lessonId IN providedWhitelist`. Se invalido, retry 1x; se persistir, log + usar primeiro do whitelist com `reasoning` template.

### 2.5 Cache de prompt (ADR-019/115)

System prompts grandes (>1k tokens) marcados `cache_control: ephemeral`. Hit rate alvo > 90% (mesma instrucao para todos os users + same sprint).

User blocks dinamicos NAO cacheados (context per-user).

### 2.6 Continuation loop

Tools geram output JSON em **uma chamada** (sem chained tool calls). ADR-026 limit de 5 nao se aplica — `coachStudyPlan` e `coachSessionInsights` sao **single-turn structured output**, nao multi-step.

Se Anthropic retornar `tool_use` multi-step (improvavel com instrucao "output JSON struct"), abortar com 500 + log estruturado.

---

## 3. Opcoes Consideradas

### Opcao A: Tools dentro do registry (ADR-023)

- **Pros:** consistencia com 5+ tools existentes (Coach-2A); reusa lazy-load page context (ADR-025); reusa wrapping audit (ADR-024); reusa prompt cache (ADR-019); zero infra nova.
- **Cons:** registry crescendo — atualmente ~6 tools, +2 = 8. Aceitavel.

### Opcao B: Servico isolado fora do tool registry

- Chamada Anthropic SDK direto em `studyWeeklyPlanService.ts` sem passar pelo runner.
- **Pros:** desacopla das outras tools; mais flexivel para mudar SDK.
- **Cons:** duplica logica de retry/Zod/cache control; perde audit trail (ADR-024); perde page context lazy load (ADR-025); divergencia de pattern com Sprints anteriores.

### Opcao C (escolhida): Registry + servicos orquestradores

- Tool no registry = contrato + chamada + validacao.
- Servico orquestrador = collect context + cache + persist + side effects.
- **Pros:** combinacao melhor das duas; tools focadas; servicos proximos do dominio (estudos / grind-live); fac de testar (mock da tool no service test).
- **Cons:** 2 camadas — exige clareza de responsabilidade. Spec ja documenta.

---

## 4. Consequencias

**Positivas:**
- Reuso completo de infra Coach Sprint 2A (ADR-023/024/025/026/019).
- Audit trail automatico via wrapping result.
- Lazy load por page context — chat normal nao carrega tools de plano semanal.
- Retry 1x + Zod rigid valida output anti-alucinacao.
- System prompt cached — custo amortizado.
- Anti-hallucination dupla (Zod + whitelist enforce).

**Negativas:**
- 6 arquivos novos (3 por tool: `.ts`, `.prompts.ts`, `.schema.ts`) — overhead organizacional, mas ADR-023 ja exige modularidade por dominio.
- 2 servicos novos em `server/services/` — mas eh padrao existente (storage layer + service layer ja existe).

**Neutras:**
- Tools nao expostas no chat user-facing — sao internal tools chamadas pelos servicos. ADR-025 page context list permite restricao. Adicionar `internal: true` flag no tool def caso registry future precise.
- Output JSON estruturado eh feature Anthropic estavel (Tool Use). Sem dependencia experimental.

---

## 5. Confianca

**Alta.** ADR-023 ja validou pattern modular para Coach-2A (5+ tools shippadas). Lesson #10 (DRY de prompts) coberta com extracao em `.prompts.ts`. Lesson #14 (vi.hoisted) coberta com pattern de mock em test setup. Risco principal eh hallucinacao (R1, R5 spec); cobertura via Zod + whitelist enforce + retry.

Pattern "Coach gera narrativa, app faz mapping" eh aplicacao direta de lesson #11 (apresentar dado, nao decorar). Concorrentes que dependem 100% de LLM para mapping sofrem com alucinacao; Grindfy enforce determinismo onde possivel.

---

## 6. Anexos

- Diagramas: `Docs/architecture/feature-flow-weekly-plan.mermaid`, `feature-flow-session-insights.mermaid`
- ADR base do registry: ADR-023
- Tool result wrapping: ADR-024
- Page context whitelist: ADR-025
- Spec: `Docs/specs/estudos-coach-biblio-2.md` §RF-3, §RF-4
- API doc esperada: `Docs/api/coach-tools.md` (atualizar com 2 tools novas)
