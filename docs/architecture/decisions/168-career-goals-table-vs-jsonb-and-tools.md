# ADR-168: Metas de carreira em tabela dedicada `career_goals` (não JSONB em `ai_structured_profile.metas`) + universos paralelos para back-compat + 2 tools (`define_career_goal` write/confirm/undo, `evaluate_career_goal` read-only puro) com gating `isToolEligibleTier` + cap 5 ativas por código (env-configurável) + endpoints HTTP CRUD para edição via UI sem passar pelo chat

## Status
Aceito

## Data
2026-05-20

## Sprint
AI-2B (`Docs/specs/sprint-ai-2b.md` — RF-01.1, RF-02; Q-A locked 2026-05-20)

## Decision owner
system-architect (founder locked Q-A em 2026-05-20: tabela dedicada, sem sync forçada com `ai_structured_profile.metas` legacy — recomendação pm-spec aceita)

## Related
- Depende de: ADR-145 (`coachToolRunner` preview→confirm→execute), ADR-146 (confirm-v1 sempre para write tools), ADR-148 (Grindfy AI agente único), ADR-151 (`users.ai_structured_profile.metas` legacy — onboarding wizard AI-1A continua gravando lá), ADR-159 (`reportEligibility.ts` `getReportTier` — quarterly usa o mesmo padrão de gating estrito), ADR-167 (`isToolEligibleTier` em módulo `server/coach/toolEligibility.ts` — reusada pelas 2 tools novas; Trial recebe).
- Reusa: `coach_actions` table (undo via DELETE pela mesma janela de 30min do AI-2A), `getPerformanceByPeriod` (storage — `evaluate_career_goal` para `targetMetric='profit_usd'`), `walletService.getConsolidatedBalance` (USD — para `targetMetric='bankroll_usd'`), `fxResolver` (ADR-163 cascade).
- Sucessor de: nada — primeiro modelo estruturado de metas. Resolve a divida tecnica de "Goal Setting" cancelado no roadmap pivot (memory/roadmap_pivot_2026-04-24.md).
- Diagramas: `Docs/architecture/diagrams/coach-ai-2b/career-goals-flow.mermaid`.

---

## 1. Contexto

Hoje há `users.ai_structured_profile.metas: AiStructuredProfileMeta[]` populada pelo onboarding wizard AI-1A — texto livre (`{ id, texto, prazo: 'mes'|'trimestre'|null, criadaEm, origem }`), **sem `targetValue`, sem `progress`**. Monthly Report (AI-1C) interpreta essas metas via LLM (`goalsProgress` heurístico — confidence baixa). O Quarterly Report (RF-03 AI-2B) precisa de **dados estruturados** para calcular `progressPct` deterministicamente — texto livre não basta. Sem isso, `evaluate_career_goal` viraria interpretação LLM de novo (regressão).

A pergunta central: schema `career_goals` (Q-A); sync com `ai_structured_profile.metas`; gating das 2 tools; cap; endpoints HTTP.

### Restrições

- **Lesson #2 (`data-testid`):** `CareerGoalsPanel` UI usa `data-testid` estáveis (testes RTL evitam heurísticas DOM).
- **Lesson #6 (FX → USD):** `evaluate_career_goal` para `targetMetric ∈ {'profit_usd','bankroll_usd'}` normaliza tudo via FX cascade ANTES de comparar com `targetValue` (USD).
- **Lesson #8 (presença individual de tool):** registry valida `getTool('define_career_goal')` + `getTool('evaluate_career_goal')`, NUNCA `coachTools.length === N`.
- **Lesson #19 (CTAs em rotas existentes):** UI de metas só linka para rotas Wouter registradas (`/coach-ai`, `/coach`, `/estudos`).
- **Lesson #28 (mock paths):** testes que mockam tool registry consomem o path canônico `@/coachTools/index` ou `server/coachTools`.
- **Lesson #34 (`injectedStorage?`):** handlers HTTP novos aceitam 3º arg para testabilidade.
- **`requiresConfirmation: true` (ADR-146):** write tool sempre confirma. `evaluate_career_goal` é read-only puro (`auditLevel: 'log'`).
- **Tier gating (ADR-167):** `isToolEligibleTier(user, 'define_career_goal')` Pro/Premium/Admin/Trial; Free não vê.

### O que está fora de escopo

- Sub-metas / OKRs / decomposição em milestones — flat por enquanto.
- `evaluate_career_goal_with_save` (persiste `progress_note` em DB) — read-only puro; nota fica no markdown do output. Follow-up se valor justificar.
- Sync bidirecional automático com `ai_structured_profile.metas` — opt-in via `define_career_goal` (insere entry resumida 1 frase no JSONB, mas sem trigger).
- UI de timeline histórica das metas (achieved/abandoned) — só lista ativas + delete; histórico via query manual.

---

## 2. Decisão

Adotada: **tabela dedicada `career_goals` (universos paralelos com `ai_structured_profile.metas`)**, 2 tools (1 write + 1 read), endpoints HTTP CRUD, cap 5 ativas, sync opt-in unidirecional (career_goals → metas resumida; nunca o inverso).

### 2.1. Schema (`career_goals`) — RF-01.1

```sql
CREATE TABLE career_goals (
    id                VARCHAR(21) PRIMARY KEY,
    user_id           VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    title             VARCHAR(120) NOT NULL,
    description       TEXT,
    target_metric     VARCHAR(40),               -- enum CHECK: profit_usd|tournaments_count|roi_pct|bankroll_usd|custom
    target_value      NUMERIC,
    target_deadline   DATE,
    horizon           VARCHAR(16) NOT NULL DEFAULT 'trimestre',  -- mes|trimestre|ano|multi_ano
    status            VARCHAR(16) NOT NULL DEFAULT 'active',     -- active|achieved|abandoned|expired
    progress_note     TEXT,                       -- reservado (read-only puro hoje — ver §3)
    achieved_at       TIMESTAMP,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT career_goals_horizon_enum CHECK (horizon IN ('mes','trimestre','ano','multi_ano')),
    CONSTRAINT career_goals_status_enum CHECK (status IN ('active','achieved','abandoned','expired')),
    CONSTRAINT career_goals_target_metric_enum
        CHECK (target_metric IS NULL OR target_metric IN ('profit_usd','tournaments_count','roi_pct','bankroll_usd','custom'))
);
CREATE INDEX idx_career_goals_user_status   ON career_goals(user_id, status);
CREATE INDEX idx_career_goals_user_deadline ON career_goals(user_id, target_deadline);
```

- **Sem UNIQUE.** Cap em código (5 ativas por user, env `COACH_CAREER_GOALS_MAX_ACTIVE`).
- `target_metric` enum CHECK — defensivo. Drizzle Zod mapeia para `z.enum(...)` em `insertCareerGoalSchema`.
- `horizon` default `'trimestre'` (consistente com Quarterly Report que prioriza metas com horizon `trimestre|ano|multi_ano`).
- ON DELETE CASCADE em `user_id` — deletar user limpa metas.

### 2.2. Sync com `ai_structured_profile.metas` legacy

- **Universos paralelos** — `career_goals` é autoritativo para metas estruturadas; `ai_structured_profile.metas` (JSONB) continua sendo populado pelo onboarding wizard AI-1A (texto livre, prazo curto).
- `define_career_goal` execute (após confirm) **opcionalmente** insere 1 entry resumida em `ai_structured_profile.metas` (`{ id: <careerGoalId>, texto: <title resumido 1 frase>, prazo: horizon === 'mes' ? 'mes' : 'trimestre', criadaEm: NOW, origem: 'career_goal' }`). Origem `'career_goal'` é discriminador — leitura unificada (`getAllUserGoals(userId)`) sabe que aquela entry "espelha" uma row formal.
- **Sem trigger inverso.** Edição/delete em `career_goals` NÃO propaga automaticamente; helper de leitura unificada apresenta as 2 fontes sem deduplicar a UI dos relatórios (Monthly olha `metas` legacy; Quarterly olha `career_goals`).
- Helper de leitura unificada: `server/storage/careerGoalsStorage.ts` `getAllUserGoals(userId): Promise<{ structured: CareerGoal[], legacy: AiStructuredProfileMeta[] }>` — Quarterly Report consome `structured`; LLM em chat pode consultar ambos via tool nova (`evaluate_career_goal` aceita IDs de qualquer fonte se quiser unificar — fora de escopo AI-2B).

### 2.3. Tools

#### `define_career_goal` (write, ADR-146 confirm)
- Handler: `server/coachTools/handlers/defineCareerGoal.ts`.
- Input zod `.strict()`: `{ title (max 120), description? (max 1000), targetMetric?, targetValue?, targetDeadline? (YYYY-MM-DD), horizon? default 'trimestre' }`.
- Preview:
  - Conta metas ativas. Se `>= COACH_CAREER_GOALS_MAX_ACTIVE` (default 5) → preview retorna `{ wouldExceedCap: true, oldestActive: { id, title, createdAt } }`; LLM apresenta para o user: "Você já tem 5 metas. Confirmar substitui a mais antiga (`<title>`)? Ou prefere atualizar uma existente?". User decide via 2º round de chat (escolhe `archive_oldest` ou cancela; UI direta passa pelo endpoint PATCH).
- Execute (após confirm):
  - Se `wouldExceedCap && user escolheu archive`: UPDATE oldest ativa SET `status='abandoned'`, `updated_at=NOW`.
  - INSERT em `career_goals` (status='active', `id=nanoid()`).
  - Opcionalmente UPDATE `users.ai_structured_profile` adicionando 1 entry em `metas` (origem='career_goal') — `JSON_BUILD_ARRAY` + `||` JSONB.
- `requiresConfirmation: true`, `auditLevel: 'persist'`, `gateByTier: ['pro','premium','admin']` + Trial via `isToolEligibleTier`.
- Undo: DELETE da row + revert do entry no `ai_structured_profile.metas` (filtra por `origem='career_goal' AND id=<careerGoalId>`). Janela 30min (consistente com AI-2A).

#### `evaluate_career_goal` (read-only puro)
- Handler: `server/coachTools/handlers/evaluateCareerGoal.ts`.
- Input zod: `{ goalId: string }`.
- Output shape:
  ```ts
  {
    goal: { id, title, targetMetric, targetValue, targetDeadline, horizon, status, createdAt },
    progress: {
      currentValue: number | null,    // calc por targetMetric (FX→USD lesson #6)
      progressPct: number | null,     // currentValue / targetValue * 100, clamp [0..100] na UI
      estimate: 'on_track'|'behind'|'ahead'|'unknown',
      daysRemaining: number | null,
      narrative: string,              // 1-2 frases (template determinístico — sem LLM)
      confidence: 'high'|'medium'|'low',
    }
  }
  ```
- **NÃO grava** `progress_note` no DB. Read-only puro — nota só no markdown do output (lesson "default mínimo" #11).
- Calculadora por métrica:
  - `profit_usd` → `getPerformanceByPeriod(userId, createdAt..now)` (filtra `tournaments.grindSessionId IS NULL` §6.1 CLAUDE.md), FX → USD.
  - `bankroll_usd` → `walletService.getConsolidatedBalance(userId)` (já USD).
  - `tournaments_count` → COUNT `tournaments` no período.
  - `roi_pct` → `getPerformanceByPeriod` → `(profit / buyInSum) * 100`.
  - `custom` → `currentValue: null, progressPct: null, narrative: "Meta custom — sem cálculo automático. Atualize manualmente."`, `confidence: 'low'`.
- `estimate`:
  - `progressPct >= 100` → `'on_track'` (atingida ou superada).
  - `progressPct >= (daysElapsed / totalDays) * 100 - 10pp` → `'on_track'`.
  - `progressPct < ... - 25pp` → `'behind'`.
  - `progressPct > ... + 25pp` → `'ahead'`.
  - sample `< 5` torneios → `'unknown'`.
- `confidence`: `sample < 5` → `'low'`; `< 20` → `'medium'`; senão `'high'`.
- `requiresConfirmation: false`, `auditLevel: 'log'`, `gateByTier: ['pro','premium','admin']` + Trial.

### 2.4. Endpoints HTTP (RF-02.3)

| Método | Rota | Auth | Body / Query | Descrição |
|---|---|---|---|---|
| GET | `/api/coach/career-goals` | JWT | `?status=active\|all` (default active) | Lista (cap 50 — segurança). |
| POST | `/api/coach/career-goals` | JWT | `{ title, description?, targetMetric?, targetValue?, targetDeadline?, horizon? }` | Alternativa direta (UI sem chat). Mesma validação Zod do tool; também respeita cap 5. |
| PATCH | `/api/coach/career-goals/:id` | JWT + ownership | `{ title?, description?, targetValue?, targetDeadline?, status?, progressNote? }` | Permite mudar `status` para `'achieved'`/`'abandoned'`/`'expired'`. |
| DELETE | `/api/coach/career-goals/:id` | JWT + ownership | — | Hard delete. |

- Ownership check: `WHERE id=$1 AND user_id=$userPlatformId` → 404 se não encontrado (não 403 — evita leak de existência).
- Handlers aceitam `injectedStorage?` (lesson #34).

### 2.5. UI — `CareerGoalsPanel`

- Hub `/coach-ai` aba "Preferências" ganha subsection "Metas".
- Componente: `client/src/components/coach/CareerGoalsPanel.tsx`.
- Renderiza lista (top 5 ativas) + botão "+ Nova meta" → modal com form Zod-validated → POST.
- Cada meta: botões "Editar" (PATCH inline), "Avaliar progresso" (chama `/api/coach/career-goals/:id/evaluate` — endpoint wrapper que executa `evaluate_career_goal` server-side, NÃO via tool LLM — evita custo), "Marcar como atingida"/"Abandonar" (PATCH `status`).
- `data-testid` estáveis (lesson #2): `career-goals-panel`, `career-goal-card-{id}`, `career-goal-create-button`, `career-goal-form-modal`.

---

## 3. Opções consideradas

### Opção A — Tabela dedicada (universos paralelos, sync opt-in unidirecional) — ESCOLHIDA
**Prós:**
- Queryability — `evaluate_career_goal` calcula `progressPct` SQL-side com tipos certos (NUMERIC).
- `target_deadline` como `DATE` permite filtros `WHERE target_deadline < NOW + INTERVAL '30 days'` (dashboard de metas próximas a expirar).
- Drizzle Zod gera schema válido (`insertCareerGoalSchema`) com `targetMetric` enum tipado.
- ai_structured_profile.metas legacy mantida sem mudança → onboarding wizard AI-1A continua igual (zero risco de regressão).
- Cap 5 ativas em código (env `COACH_CAREER_GOALS_MAX_ACTIVE`) — config-driven.
**Contras:**
- Universos paralelos exigem `getAllUserGoals(userId)` helper para consumidores que precisam visão unificada (Monthly + Quarterly Report). Documentado.
- Sync opt-in unidirecional (`define_career_goal` → metas) pode gerar drift se user edita em ambos os lados. Documentado: `metas` é leitura "informativa" para LLM em chat; `career_goals` é fonte de verdade para relatórios e UI.

### Opção B — Só JSONB em `ai_structured_profile.metas` (estendido com `targetValue` + `targetDeadline` + `status`)
**Prós:**
- Zero migration nova.
- Onboarding wizard escreve direto no formato canônico.
**Contras:**
- JSONB sem CHECK de enum — risco de drift de dados (`targetMetric: 'lucro'` vs `'profit_usd'`).
- Query SQL pesada (`jsonb_array_elements` + cast) — quarterly report itera em loop quando poderia usar SQL puro.
- Sem index — N+1 em `evaluate_career_goal` para múltiplas metas.
- Lesson #36 (storage que mocka `drizzle-orm` parcialmente quebra `@shared/schema`) — qualquer modificação no schema do JSONB exige propagar tipos em vários consumidores.

### Opção C — Tabela dedicada + sync bidirecional automático com trigger
**Prós:**
- Visão unificada — não precisa helper `getAllUserGoals`.
**Contras:**
- Trigger DB ou middleware app — complexidade alta.
- Conflito de "fonte de verdade" — onboarding salva texto livre, depois user "promove" via `define_career_goal`; sync inverso (edit em `metas` propaga para `career_goals`) confuso semanticamente.
- Risco de loop infinito / cascading writes.

---

## 4. Consequências

### Positivas
- Relatório trimestral tem dados estruturados para `progressPct` determinístico.
- UI de edição direta sem passar pelo chat — user gerencia metas fora do fluxo LLM.
- Cap 5 ativas evita "metaploração" (user criando 50 metas sem follow-through — anti-pattern PM).
- Read-only puro de `evaluate_career_goal` mantém princípio "ferramenta não modifica estado sem confirm" (ADR-146).
- Endpoint `evaluate` (wrapper server-side) economiza tokens vs chamar tool LLM em chat.

### Negativas
- Universos paralelos exigem disciplina dos consumidores (Monthly olha legacy, Quarterly olha estruturado, LLM em chat olha unificado via helper).
- Migration 0071 destrutível em rollback (CASCADE delete). Mitigado: rollback simétrico em `0071_rollback.sql` documentado como destrutivo (uso só em dev/staging).

### Neutras
- Cap `COACH_CAREER_GOALS_MAX_ACTIVE` env-configurável — founder ajusta sem deploy. Default 5 (validar em piloto).
- `progress_note` reservado para uso futuro (`evaluate_career_goal_with_save` se valor justificar).

## Confiança
**Alta** — padrão simétrico a `user_off_days` (AI-2A ADR-167) e `study_sessions_v2` (AI-2A ADR-165); founder Q-A locked; helper `getAllUserGoals` cobre divergência legacy.
