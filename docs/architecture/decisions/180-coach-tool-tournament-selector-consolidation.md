# ADR-180: Tournament Selector tool no Coach — estender `get_tournament_suggestions` (não criar tool nova) + cache compartilhado + telemetria dual

## Status

Aceito

## Data

2026-05-21

## Sprint

Tournament Selector 3 (`Docs/specs/sprint-tournament-selector-3.md` — RF-02; Q-G + Q-L + Q-M locked 2026-05-21).

## Decision owner

system-architect (Q-G locked após leitura dos 3 handlers; Q-L locked: documentar enum `invokedBy` em JSDoc sem CHECK; Q-M locked: tool é data retrieval, sem custo LLM extra).

## Related

- **Depende de:** ADR-145 (registry canônico Coach Tools), ADR-146 (write tools confirm — `register_tournament_in_grade` para "Adicionar à grade" inline), ADR-147 §1 (`tournamentScoringService` DRY — fonte canônica de scoring), ADR-167 (`isToolEligibleTier` módulo dedicado AI-2A — Trial passa).
- **Reusa:** `rankTournamentsForContext(userId, options)` em `server/services/tournamentScoringService.ts` (chama `computeTournamentScore`), `buildScoringInput.ts` (Sprint AI-0A HIGH-1), telemetria `tournament_selector_logs`, `coach_tool_invocations` (AI-1B).
- **Supersedes (parcial):** ADR-147 §1 mantida; este ADR **estende** `get_tournament_suggestions` em vez de criar tool nova. Texto canônico atualizado: descriptor da tool ganha 3 params + telemetria dual + alias deprecated.
- **Diagrama:** `Docs/architecture/diagrams/ts-3/ts-3-coach-tool-cache-shared.mermaid`.

---

## 1. Contexto

Pivot 2026-04-24 §4d pediu "plugar TS no Coach AI como tool". Plano AI 7/7 SHIPPED (AI-2B), mas a tool de recomendação de torneios **já existe** desde AI-0A. Pm-spec do TS-3 (RF-02) propôs `tournament_selector_recommend` nova; Q-G delegou system-architect investigar overlap antes de criar.

### Estado canônico atual (leitura 2026-05-21)

`B:/grindfy/server/coachTools/handlers/getTournamentSuggestions.ts`:

```ts
inputSchema: { date?, dayOfWeek?, profile?, maxBuyIn?, limit (default 10, max 20) }
handler:
  rankTournamentsForContext(userId, { date, dayOfWeek, profile, maxBuyIn, limit })
  → suggestions[] { id, name, site, buyIn, buyInUSD, type, speed, score, grade, confidence, rationale }
gateByTier: ['pro', 'premium', 'admin']
```

`B:/grindfy/server/coachTools/handlers/explainTournamentScore.ts`:

```ts
inputSchema: XOR (tournamentId | libraryTemplateId | plannedTournamentId)
handler: explainScoreForTournament(...) → breakdown por sinal
gateByTier: ['pro', 'premium', 'admin']
```

**`get_tournament_suggestions` JÁ FAZ O QUE RF-02 PROPÕE.** Reusa `tournamentScoringService` (ADR-147 §1 garante DRY com endpoint `/api/tournament-selector`). `explainTournamentScore` é **ortogonal** — explica score de torneio específico, não recomenda. Confirmado.

### O que falta na tool existente vs RF-02

RF-02 da spec quer:

1. **`bankrollMode` param** (alinhar com RF-04 ADR-178). Hoje: ausente.
2. **`source` param** (`suprema | library | both`, default `both`). Hoje: ausente (service decide).
3. **`alreadyInGrid` flag** no output (UX inline "Adicionar à grade" só faz sentido se NÃO está). Hoje: ausente.
4. **Cache compartilhado** com `/api/tournament-selector` (mesma chave shape — sem isso, widget e tool recomputam quando deveriam hit-cache cross-surface). Hoje: cache do endpoint não é exposto à tool.
5. **Telemetria dual** — `coach_tool_invocations` (já existe via runner ADR-145) + `tournament_selector_logs` com `metadata.invokedBy='coach_tool'`. Hoje: só log do runner.
6. **Tier gate via `isToolEligibleTier`** (AI-2A — Trial passa). Hoje: `gateByTier: ['pro', 'premium', 'admin']` (Trial NÃO passa).

---

## 2. Decisão

### 2.1 Estender `get_tournament_suggestions` (NÃO criar tool nova)

Justificativa: 100% overlap conceitual com RF-02. Criar `tournament_selector_recommend` ortogonal violaria DRY + duplicaria 2 tools com mesma função (LLM confundiria qual chamar). Manter um único ponto canônico.

**Pivot da Q-G:** opção (a) da spec — "estender `getTournamentSuggestions` SE handler atual já usa buildScoringInput + scorer → RF-02 vira 'add cache compartilhado + bankrollMode + telemetria'". Confirmado por leitura.

### 2.2 Mudanças no descriptor da tool

**Input schema (estendido, backward-compat — todos os novos params opcionais):**

```ts
{
  date?: string;
  dayOfWeek?: number;          // existente
  profile?: 'A' | 'B' | 'C';   // existente
  maxBuyIn?: number;           // existente
  limit?: number;              // existente (default 10, max 20)
  // NOVOS:
  source?: 'suprema' | 'library' | 'both';  // default 'both'
  bankrollMode?: 'all' | 'hide' | 'warn';   // default herda user_settings (ADR-178)
  topN?: number;               // alias de limit (UX-friendly nas mensagens do LLM, range 1-10)
}
```

**Output (estendido):**

Cada `suggestion` ganha:

- `bankrollWarning?: { reason: 'above_hard_limit' | 'above_soft_limit', limitUSD, buyInUSD, rulePct } | null` (quando `bankrollMode='warn'`).
- `alreadyInGrid: boolean` (resolvido contra `planned_tournaments` do user + dateado pelo `date` do input).
- `source: 'suprema' | 'library'` (já existe via `id` prefix; explicit field reduz parsing pelo LLM).

**Tier gate:**

Remove `gateByTier: ['pro', 'premium', 'admin']` literal. Substitui por consulta runtime via `isToolEligibleTier(user, 'get_tournament_suggestions')` no runner (ADR-167 pattern). Trial inclui — ADR-167 §"Q-E locked: Trial recebe as 8 tools AI-2A; Free não". Esta tool fica no mesmo set (já era Pro+, agora Trial passa também).

**Description:** atualizar para mencionar `bankrollMode` + Coach pode invocar "diretamente do chat sem abrir Selector".

### 2.3 Cache compartilhado com `/api/tournament-selector`

**Chave canônica:**

```ts
type CacheKey = {
  userId: string;
  date: string;          // YYYY-MM-DD
  sources: 'suprema' | 'library' | 'both';
  bankrollMode: 'all' | 'hide' | 'warn';
};
```

Implementação: extrair cache atual de `server/routes/tournament-selector.ts` para módulo dedicado `server/scoring/tournamentSelectorCache.ts` exportando:

```ts
export function getTournamentSelectorCache(key: CacheKey): TournamentSelectorResult | undefined;
export function setTournamentSelectorCache(key: CacheKey, value: TournamentSelectorResult): void;
export function _resetTournamentSelectorCacheForTests(): void;  // padrão lesson #21
```

TTL 30min, Map in-memory (consistente com cache atual do endpoint — Sprint 1). Widget E tool chamam o mesmo módulo. Cache hit cross-surface garantido.

**Cache miss** dispara `rankTournamentsForContext` → service guarda no cache → ambos consumidores se beneficiam.

**Invalidação:** TTL natural (30min). Não há triggers de invalidação manual hoje (scoring é idempotente; mudança de bankroll do user gera key diferente automaticamente).

### 2.4 Telemetria dual

A tool já registra em `coach_tool_invocations` via `coachToolRunner` (ADR-145). Adicionar **simultaneamente** registro em `tournament_selector_logs` com:

```ts
{
  userId,
  eventType: 'view',
  tournamentExternalId: null,         // view agregada, não 1 torneio específico
  metadata: {
    invokedBy: 'coach_tool',          // novo enum value
    source: input.source ?? 'both',
    bankrollMode: input.bankrollMode ?? <resolved>,
    limit: input.limit,
    suggestionsCount: results.length,
    cacheHit: <boolean>,
  }
}
```

**Q-L locked:** `metadata.invokedBy` documentado em JSDoc como enum `['widget', 'coach_tool', 'admin_dashboard']` SEM CHECK constraint no schema (mantém flexibilidade — futuro `'api_external'` sem migration).

Quando user clica "Adicionar à grade" inline na resposta do Coach, a tool **separada** `register_tournament_in_grade` (ADR-146 — confirm flow) é invocada. Essa tool já loga `add_to_grid` em `tournament_selector_logs`; ganha campo `metadata.invokedBy='coach_tool'` quando contexto é Coach (deduzível pelo path do invoker; default `'widget'` se ausente).

### 2.5 LLM narrative — sem custo extra

Q-M locked: a tool é **data retrieval**. Retorna lista estruturada. O LLM (Sonnet 4.6 / modelo default do Coach via `COACH_MODEL` ADR-021) gera a frase de apresentação ("Olha, você tem 3 grade S hoje...") no turno normal do chat — mesmos tokens que seriam usados em qualquer resposta. Sem chamada LLM extra dentro da tool.

Estimativa: output da tool com 5 torneios + rationale + flags adds ~600-800 tokens. Aceitável; rate-limit do Coach (ADR-020) já cobre.

---

## 3. Alternativas Consideradas

### Alt A — Criar `tournament_selector_recommend` ortogonal

Nova tool em `server/coachTools/handlers/tournamentSelectorRecommend.ts`, `get_tournament_suggestions` continua como está (ou marcada deprecated).

- **Pró:** descriptor focado em UX inline ("Adicionar à grade"). Pode evoluir independentemente.
- **Contra:** 2 tools com 95% overlap. LLM precisa decidir qual chamar — descriptor de uma vs outra é fonte de bugs (LLM já confunde tools próximas — ver lessons sobre tool selection em outros sprints). Duplicação de tier gate logic + cache key + telemetria. **Rejeitado.**

### Alt B — Estender + deprecar nome antigo, expor novo nome `tournament_selector_recommend` como alias

Tool registrada com 2 nomes (`get_tournament_suggestions` + alias `tournament_selector_recommend`).

- **Pró:** semantic alinhada à spec ("recommend" é mais expressivo que "get_suggestions").
- **Contra:** alias é complexidade extra no registry (precisa filtro de duplicatas no system prompt do LLM). ADR-145 marca a tool com 1 alias deprecado (`coach.X`); registry filtra. Adicionar segundo alias por mero refactoring de nome não compensa. **Rejeitado.**

### Alt C — Estender `get_tournament_suggestions` ✅ ESCOLHIDA

Adicionar 3 params (`source`, `bankrollMode`, `topN`), 2 output fields (`bankrollWarning`, `alreadyInGrid`, `source` explicit), trocar tier gate por `isToolEligibleTier`, plugar cache compartilhado, telemetria dual.

- **Pró:** 1 ponto canônico de recomendação. DRY com endpoint via cache compartilhado. Backward-compat (todos os params novos opcionais).
- **Contra:** descriptor cresce — risco de LLM ignorar params novos. Mitigação: description text atualizada com exemplos do uso de `bankrollMode`. Testes cobrem invocação com e sem novos params.

---

## 4. Consequências

### Positivas

- **DRY total**: scoring (ADR-147 §1) + cache (ADR-178 §2.6) + tool + endpoint compartilham 1 fonte canônica.
- **Cache hit cross-surface**: widget calcula uma vez, Coach reusa, e vice-versa. Reduz latência do chat (resposta inline de 200-500ms para <50ms quando widget abriu antes).
- **Trial habilitado** (consistente com AI-2A ADR-167).
- **Telemetria dual** habilita RF-05 (ADR-179) a discriminar adds-via-widget vs adds-via-coach.
- **Sem tool duplicada** — LLM tem 1 caminho claro.

### Negativas

- **Descriptor maior** — risco médio do LLM ignorar params novos. Mitigado por descrição + testes.
- **Cache module extraído** — touch em `server/routes/tournament-selector.ts` (Sprint 1) + criação de `server/scoring/tournamentSelectorCache.ts`. Testes de Sprint 1 podem precisar atualização (mock path).
- **Tier gate runtime** — `isToolEligibleTier` é call por invocação (lookup user + plan); cost desprezível mas existe.

### Neutras

- **Resposta da tool pode crescer** se LLM pede `limit=20` + verbose rationale. Token budget do Coach já gerencia (ADR-019/020).
- **`alreadyInGrid` flag** depende de `planned_tournaments` query — 1 lookup adicional por invocação. Otimização: bulk query `WHERE planned_tournaments.user_id = ? AND date = ? AND tournament_external_id IN (...)` em vez de N queries.

---

## 5. Verificação

- `tests/integration/coach/tools/getTournamentSuggestionsExtended.test.ts` — invoca com `bankrollMode='warn'` + verifica `bankrollWarning` populado em torneios above-hard.
- `tests/integration/coach/tools/cacheSharedWidgetToolHit.test.ts` — widget chama → tool chama com mesma key → 2a chamada é cache hit (assertion no telemetria `cacheHit=true`).
- `tests/integration/coach/tools/telemetryDualLog.test.ts` — invocação da tool gera 1 row em `coach_tool_invocations` E 1 row em `tournament_selector_logs` com `metadata.invokedBy='coach_tool'`.
- `tests/integration/coach/tools/tierGateTrialAllowed.test.ts` — user Trial invoca, recebe results (não recebe `tier_locked`).
- `tests/integration/coach/tools/alreadyInGridFlag.test.ts` — torneio já em `planned_tournaments` retorna `alreadyInGrid: true`.

## Confiança

**Média.** Decisão de **estender vs criar** confiante (Alta) após leitura dos handlers. Cache compartilhado e telemetria dual são padrões conhecidos. Risco médio único: descriptor crescendo afeta tool selection do LLM — mitigação por testes de integração com prompts reais do Coach + métrica de adoção (RF-02 success metric: >5% das mensagens elegíveis Pro+ invocam a tool em 30d).
