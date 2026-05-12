# ADR-145: Errata aos ADRs 023/024/042/052b/086 — Estado canônico do registry de Coach Tools pós-Sprint AI-0A

## Status
Aceito

## Data
2026-05-12

## Contexto

Os ADRs 023 (registry pattern), 024 (result wrapping), 026 (loop limit), 042 (read_cooldown_history),
052b (read_user_hud_stats) e 086 (citations/confidence inline) descrevem a infra de tools do Coach AI
como se o conjunto de tools "estrela" do Sprint Coach-2A já estivesse ligado. Entre o desenho original
(2026-04-24) e hoje, a baseline real divergiu:

1. **`server/coachTools/index.ts` registrava só 7 tools reais + 2 stubs quebrados.** As tools reais:
   `read_cooldown_history`, `read_user_hud_stats` (v2), `read_user_bankroll_history`,
   `read_theme_with_linked_stats_and_spots` (+ alias deprecado `read_theme_with_linked_spots`),
   `recommend_lesson`. As stubs: `find_top_leaks` e `simulate_bankroll_scenario` retornavam
   `{ ok: false, code: 'not_implemented' }` e eram filtradas em produção pelo flag `__stub`.
   `query_dimension`, `get_tournament_suggestions`, `explain_tournament_score` **não apareciam no registry** —
   só na doc `Docs/api/coach-tools.md`.

2. **8 handlers de write tools de Coach-2B existem em `server/coachTools/handlers/`** mas só
   `readCooldownHistory` estava registrado: `registerTournamentInGrade`, `recordWalletTransaction`,
   `startGrindSession`, `logSessionCompleted`, `logLeakFocus`, `logStudySession` (write) +
   `verifyLeakProgress` (read). Os descriptors já estavam corretos
   (`requiresConfirmation`, `auditLevel`, `gateByTier`, `fetchPayloadBefore`, `executeConfirmed`).
   O LLM nem os via.

3. **Divergências de enum entre a doc e o schema real:**
   - `Docs/api/coach-tools.md` lista `speed: z.enum(['Regular', 'Turbo', 'Hyper'])` — **incorreto**.
     O schema real (`shared/schema.ts`) usa `speed` ∈ `{ Normal, Turbo, Hyper }` (ver `tournaments.speed`
     default `"Normal"`, e a Zod insert schema `z.enum(['Normal', 'Turbo', 'Hyper'])`).
   - `category` na doc lista `['Vanilla', 'PKO', 'Mystery']` — **incompleto**. O ADR-031 + add-on
     adicionou `Satellite` ao `type` primário. O enum canônico para o filtro `category` do tool
     `query_dimension` (e do `manualEntry.type` de `register_tournament_in_grade`) é
     `['Vanilla', 'PKO', 'Mystery', 'Satellite']`.
   - O enum `groupBy` do `query_dimension` na doc não tinha `'fieldSize'`; o canônico inclui.
   - `period` na doc tinha `['all', '30d', '90d', 'ytd']`; o canônico inclui `'180d'`.

4. **ADR-023 §145 menciona `zod-to-json-schema` (lib externa).** A implementação real usa um conversor
   shallow caseiro (`zodToJsonSchemaShallow` em `registry.ts`) — zero deps. Sem mudança neste sprint;
   só registro da divergência para que o ADR-023 não confunda futuros agentes.

Esta errata **não muda nenhuma decisão arquitetural** dos ADRs 023/024/026/042/052b/086 — só corrige a
descrição factual da baseline e fixa o estado canônico do registry após o Sprint AI-0A.

## Decisão

### 1. Registry canônico pós-AI-0A (18 entradas — 17 tools + 1 alias deprecado)

| # | Tool | Tipo | `requiresConfirmation` | `confirmationLevel` | `auditLevel` | `gateByTier` | Origem |
|---|------|------|-----------------------|---------------------|--------------|--------------|--------|
| 1 | `read_cooldown_history` | read | false | — | log | pro/premium/admin | Cooldown-3 (ADR-042) |
| 2 | `read_user_hud_stats` | read | false | — | log | pro/premium/admin | Stats-V2 (ADR-052b/062) |
| 3 | `read_user_bankroll_history` | read | false | — | log | pro/premium/admin | Bankroll-Reports-Detail |
| 4 | `read_theme_with_linked_stats_and_spots` | read | false | — | log | pro/premium/admin | stats-themes-linking-1 (ADR-142) |
| 5 | `read_theme_with_linked_spots` *(alias deprecado)* | read | false | — | log | pro/premium/admin | ADR-142 (1 sprint de transição) |
| 6 | `recommend_lesson` | read | false | — | log | pro/premium/admin | Biblioteca-1 (ADR-075) |
| 7 | `query_dimension` | read | false | — | log | pro/premium/admin | **AI-0A (religada — era ausente)** |
| 8 | `find_top_leaks` | read | false | — | log | pro/premium/admin | **AI-0A (religada — era stub)** |
| 9 | `get_tournament_suggestions` | read | false | — | log | pro/premium/admin | **AI-0A (religada — era ausente)** |
| 10 | `explain_tournament_score` | read | false | — | log | pro/premium/admin | **AI-0A (religada — era ausente)** |
| 11 | `simulate_bankroll_scenario` | read | false | — | log | pro/premium/admin | **AI-0A (religada — era stub)** |
| 12 | `register_tournament_in_grade` | write | **true** | — | persist | pro/premium/admin | **AI-0A (registrada — handler já existia)** |
| 13 | `record_wallet_transaction` | write | **true** | **`'strict'`** | persist | pro/premium/admin | **AI-0A (registrada — handler já existia)** |
| 14 | `start_grind_session` | write | **true** | — | persist | pro/premium/admin | **AI-0A (registrada — handler já existia)** |
| 15 | `log_session_completed` | write | **true** | — | persist | pro/premium/admin | **AI-0A (registrada — handler já existia)** |
| 16 | `log_leak_focus` | write | **true** | — | persist | pro/premium/admin | **AI-0A (registrada — handler já existia)** |
| 17 | `log_study_session` | write | **true** | — | persist | pro/premium/admin | **AI-0A (registrada — handler já existia)** |
| 18 | `verify_leak_progress` | read | false | — | log | pro/premium/admin | **AI-0A (registrada — handler já existia, NÃO é write)** |

`coachStudyPlan` e `coachSessionInsights` (ADR-134) seguem como tools internas de orquestração, expostas
pelo seu próprio sub-módulo conforme o ADR-134 — não fazem parte do array `coachTools` exportado por
`server/coachTools/index.ts` (que é usado por testes de introspecção do core). Estado inalterado neste sprint.

### 2. Enums canônicos (corrigem `Docs/api/coach-tools.md`)

- `category` (filtro de `query_dimension`, `manualEntry.type` de `register_tournament_in_grade`):
  **`['Vanilla', 'PKO', 'Mystery', 'Satellite']`** — alinhado ao `type` primário pós-ADR-031+add-on.
- `speed` (filtro de `query_dimension`, `manualEntry.speed` de `register_tournament_in_grade`,
  `groupBy: 'speed'`): **`['Normal', 'Turbo', 'Hyper']`** — alinhado a `tournaments.speed` (default `"Normal"`).
  `Regular` está **errado** e era um artefato da doc original.
- `query_dimension.groupBy`: **`['site', 'category', 'speed', 'buyinRange', 'dayOfWeek', 'month', 'fieldSize']`**.
- `query_dimension.period`: **`['all', '30d', '90d', 'ytd', '180d']`** (default `'all'`).
- `query_dimension.dimension`: **`['roi', 'profit', 'volume', 'itm', 'abi', 'fts', 'cravadas']`** (inalterado).

### 3. Stubs removidos

`findTopLeaksStub`, `simulateBankrollStub`, `stubHandler`, o comentário "baseline broken" e o flag `__stub`
deixam de existir em `server/coachTools/index.ts`. O flag `__stub` permanece **definido** na interface
`CoachTool` (`registry.ts`) e o filtro defensivo `tools.filter(t => !def.__stub)` no
`server/routes/coach.ts` permanece — barato, não-quebrável, e protege contra um stub futuro acidental.
Decisão: **manter o filtro defensivo**; não simplificar (custo zero, benefício de robustez).

### 4. `query_dimension.groupBy: 'fieldSize'` → usa `storage.getAnalyticsByField`

Decisão tomada (ponto deixado em aberto pela spec, RF-01): o handler de `query_dimension` com
`groupBy: 'fieldSize'` chama **`storage.getAnalyticsByField`** (o que o dashboard usa — agrupa por
percentual de eliminação), **não** `getAnalyticsByFieldSize` (buckets V2 do Stats Analyzer). Justificativa:
(a) `query_dimension` é uma janela de visão geral analítica, consistente com o resto do dashboard que o
jogador conhece; (b) `getAnalyticsByField` é o que está exercitado por mais código e testes; (c) os buckets
V2 (`getAnalyticsByFieldSize`) servem uma feature específica (Stats Analyzer com lookback 180d default) e
trariam um shape de `key` diferente do que o resto das dimensões retorna. Documentado também em
`Docs/api/coach-tools.md`.

## Consequências

### Positivas
- Documentação volta a refletir a baseline real. Test-writer e implementer trabalham sobre fatos, não sobre
  o desenho aspiracional de 2026-04.
- Enums alinhados ao schema — evita o anti-pattern "mock idealizado" (lesson #3) e "convention drift FX"
  (commit recente de CI red sweep).
- O Coach passa de "lê 5 coisas, executa zero" para "lê 11 coisas, executa 6 com confirmação".

### Negativas
- `Docs/api/coach-tools.md` precisa de uma reescrita parcial (feita junto com este sprint — ver lista de
  arquivos atualizados na entrega).
- Snapshot test do system prompt quebra de propósito (RF-14) — mudança intencional, não regressão.

### Neutras
- ADR-023 segue válido como decisão de pattern; só o trecho que cita `zod-to-json-schema` está factualmente
  desatualizado (implementação real é o conversor caseiro). Não vale um ADR só pra isso — esta errata anota.
- O segundo turn conversacional do LLM com `tool_result` (re-invocar o modelo após a tool executar) **não**
  é coberto neste sprint — pendência conhecida documentada na spec, provavelmente AI-0B/AI-1B.

## Confiança

**Alta.** É uma errata de documentação + fixação de estado, não uma decisão nova. Os handlers de write tool
já existem e têm testes; os de read tool reusam serviços/storage existentes; os enums são lidos diretamente
do schema.

## Referências
- Spec: `Docs/specs/sprint-ai-0a.md` (RF-01..13)
- ADR-023 (registry pattern), ADR-024 (result wrapping), ADR-026 (loop limit), ADR-042
  (read_cooldown_history), ADR-052b (read_user_hud_stats), ADR-077 (coach_actions), ADR-083 (confirm/undo),
  ADR-086 (citations/confidence), ADR-134 (study-plan/session-insights tools), ADR-142 (read_theme unificada)
- ADR-146 (write tools — confirmação obrigatória v1), ADR-147 (padrão de extração de service)
- `shared/schema.ts` (`tournaments.speed`, Zod insert schemas)
- `Docs/api/coach-tools.md` (atualizado neste sprint)
