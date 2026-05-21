# ADR-178: Filtro Bankroll do Tournament Selector — boolean → tristate (`all` | `hide` | `warn`)

## Status

Aceito

## Data

2026-05-21

## Sprint

Tournament Selector 3 (`Docs/specs/sprint-tournament-selector-3.md` — RF-04; Q-E + Q-I locked 2026-05-21 founder delegou system-architect).

## Decision owner

system-architect (Q-E locked: persistência em `user_settings.tournament_selector_bankroll_mode` — semântica de TS, não de Coach; Q-I locked: `bankrollRules.ts` só hard/soft hoje — enum `bankrollWarning.reason` mantém apenas 2 valores iniciais, shape extensible).

## Related

- **Depende de:** ADR-018 (tolerância 1.5x hardcoded — softLimit×1.5=hardLimit), Sprint 2 Bankroll (`bankrollRules.ts` em prod desde 2026-04-24), Sprint 1 Tournament Selector (filtro `bankrollFilter` boolean atual em `/api/tournament-selector`).
- **Supersedes:** o parâmetro boolean `bankrollFilter` do endpoint `/api/tournament-selector` (mantido como alias deprecated por back-compat — `true → mode='hide'`, `false → mode='all'`).
- **Reusa:** `bankrollRules.computeThresholds({ amount, rule })` (puro), `walletService.getConsolidatedBalance` (USD FX-aware — ADR-147 §2), telemetria `tournament_selector_logs` (Sprint 1 RF-07).
- **Migration:** 0072 (esta sprint, RF-04 only — ADR-179 não exige migration).
- **Diagrama:** `Docs/architecture/diagrams/ts-3/ts-3-bankroll-tristate-flow.mermaid`.

---

## 1. Contexto

Sprint 1 do Tournament Selector entregou um filtro `bankrollFilter: boolean` no endpoint `/api/tournament-selector`. Comportamento atual:

- `bankrollFilter=true` → omite torneios cujo `buyIn (USD)` > `hardLimit` (hardLimit = softLimit × 1.5, ADR-018).
- `bankrollFilter=false` (default) → nenhum filtro aplicado.

Sprint 2 Bankroll (2026-04-24) entregou `bankrollRules.ts` com `softLimit`/`hardLimit` computados a partir de `(bankrollAmount, rule)`. Pivot 2026-04-24 §4d ("cross-feature explicito") exige usar essa infra no Selector como evolução natural.

**O problema do binário:** O grindeiro power (cohort 1) quer `bankrollFilter=true` (esconde tudo fora). O mid-grinder (cohort 2) quer ver **oportunidades fora do bankroll**, mas com sinal claro — perde-se pra "não deveria estar jogando isso". Hoje a escolha é "ver tudo limpo" ou "esconder", sem meio-termo.

Strategist (2026-05-21) propôs tristate `all | hide | warn`. Q-E delegou system-architect a decidir persistência. Q-I delegou system-architect a confirmar enum de razões de warning.

### Estado de `bankrollRules.ts` (leitura 2026-05-21)

```
B:/grindfy/server/scoring/bankrollRules.ts
- BANKROLL_TOLERANCE = 1.5
- parseRule(rule) → { pct, valid, raw }
- computeThresholds({ amount, rule }) → { softLimitUSD, hardLimitUSD, maxBuyInUSD, rulePct }
```

**Só 2 regras** — `softLimitUSD` (rule pct × amount) e `hardLimitUSD` (softLimit × 1.5). NÃO há kelly, BB%, variance-adjusted, nada. O receio do pm-spec ("Sprint 2 pode ter adicionado regras") **não se confirma**. Enum `bankrollWarning.reason` precisa cobrir apenas:

- `above_hard_limit` (buyInUSD > hardLimitUSD)
- `above_soft_limit` (buyInUSD > softLimitUSD AND buyInUSD ≤ hardLimitUSD)

Shape **fica extensible** (string discriminado, sem CHECK constraint na coluna — coluna não armazena reason, só o `mode`) para suportar `above_<rule>` no futuro sem nova migration.

### Restrições

- **Back-compat obrigatório:** mobile/web antigos em produção continuam mandando `bankrollFilter=true|false`. Endpoint aceita ambos; conversão server-side antes do filtro.
- **Persistência semântica:** Q-E locked → `user_settings.tournament_selector_bankroll_mode` (TS, não Coach). Não consolidar prematuramente em `user_coach_preferences` (já é home de toggles de AI-1B/1C/2B).
- **Default `warn`:** cohort 2 (mid-grinder) é beneficiário principal; cold start (<200 historico) também ganha porque vê o universo sem perder o sinal. Power user (cohort 1) muda para `hide` 1x e persiste.
- **Score NÃO muda com `mode`:** scoring é puro (ADR-015). `bankrollMode` afeta visibilidade + warning anexado, nunca score nem grade. Calibração RF-05 (ADR-179) usa scoring identico para os 3 modos.
- **Cache-key inclui `bankrollMode`:** chave atual `(userId, date, sources)` ganha `bankrollMode` (chave fica `(userId, date, sources, bankrollMode)`) — sem isso, mudar modo no UI retornava cache stale.

---

## 2. Decisão

### 2.1 Schema — migration 0072

```
ALTER TABLE user_settings
  ADD COLUMN tournament_selector_bankroll_mode VARCHAR(8) NOT NULL DEFAULT 'warn'
  CHECK (tournament_selector_bankroll_mode IN ('all', 'hide', 'warn'));
```

`CHECK` constraint garante invariante DB-level. Default `'warn'` aplica também a rows existentes (sem back-fill explícito necessário).

### 2.2 Endpoint contract

`GET /api/tournament-selector` aceita:

- `bankrollMode=all|hide|warn` (novo, prioritário)
- `bankrollFilter=true|false` (alias deprecated — `true → mode='hide'`, `false → mode='all'`)

Resolução:

```
1. Se bankrollMode presente → usa esse valor.
2. Senão se bankrollFilter presente → traduz (true=hide, false=all).
3. Senão lê user_settings.tournament_selector_bankroll_mode.
4. Fallback final 'warn' (coluna pode não existir em testes legados).
```

### 2.3 Payload — `bankrollWarning` field

Quando `mode='warn'` E torneio passa o filtro:

```
type BankrollWarning = {
  reason: 'above_hard_limit' | 'above_soft_limit';  // extensible
  limitUSD: number;
  buyInUSD: number;
  rulePct: number;  // % usado (ex: 2 = 2pct)
};
```

Quando `mode='hide'`: torneios `buyInUSD > hardLimitUSD` são **omitidos** do array.
Quando `mode='all'`: nenhum warning, nenhuma omissão. `bankrollWarning: null` em todos.

**Sem bankroll cadastrado** (`amount IS NULL`): `bankrollWarning: null` sempre, qualquer `mode` se comporta como `all` (não há limite com que comparar).

### 2.4 Persistência via UI

`SelectorFilters.tsx` ganha segmented control 3-way (`Todos | Avisar | Esconder fora`). Mudança dispara debounce 500ms `PUT /api/user-settings { tournament_selector_bankroll_mode: 'warn' }`. Cache `/api/tournament-selector` invalida via `queryClient.invalidateQueries({ queryKey: ['/api/tournament-selector'] })`.

### 2.5 Telemetria

`tournament_selector_logs.metadata` ganha:

```
{ bankrollMode: 'all' | 'hide' | 'warn', ... }
```

em todo evento `eventType='view'`. Telemetria de `add_to_grid` também carrega o `mode` ativo no momento da adição — input para RF-05 (ADR-179) cross-tabular "adds com warning vs adds sem".

### 2.6 Coach Tool (RF-02) herda default

ADR-180 cobre. Resumo: `get_tournament_suggestions` (Coach tool estendida) lê o mesmo `user_settings.tournament_selector_bankroll_mode` quando `bankrollMode` não é passado no input. Cache-key compartilhada com widget garante hit cross-surface.

---

## 3. Alternativas Consideradas

### Alt A — Boolean expandido (mode codificado em string mas só 2 valores reais)

Manter `bankrollFilter: boolean` no schema, expandir só na UI um terceiro estado "warn" calculado client-side (ignora filtro server-side + UI aplica badge).

- **Pró:** zero migration, zero mudança de endpoint.
- **Contra:** lógica de filtro duplicada (server + client). Cache server-side não reflete `mode='warn'`. Telemetria não captura o estado real. Quebra a tese do strategist (sinal claro na arquitetura). **Rejeitado.**

### Alt B — JSON config per-user em `user_coach_preferences`

`user_coach_preferences.tournament_selector_config = { bankrollMode, ... }` JSONB com expansão futura.

- **Pró:** suporta expansão futura (ex: rule custom, time-of-day filter).
- **Contra:** Q-E locked semântica TS ≠ Coach. `user_coach_preferences` virou home de toggles de relatório (AI-1B/1C/2B), não config de UI de feature. Mistura conceitual. **Rejeitado.**

### Alt C — Tristate per-session (não persistido)

Session-only via `localStorage` ou query param sem persistir em DB.

- **Pró:** sem migration, sem endpoint de settings.
- **Contra:** cohort 1 (power user) muda para `hide` 1x e quer permanecer. Re-escolher a cada sessão é fricção que mata o ganho. Cohort 2 idem (default `warn` precisa persistir em DB para overrides individuais). **Rejeitado.**

### Alt D — Tristate persistido em `user_settings` ✅ ESCOLHIDA

Nova coluna `user_settings.tournament_selector_bankroll_mode` com CHECK constraint + default `warn`.

- **Pró:** alinha semântica (TS feature → settings de TS). CHECK constraint protege invariante. Default cobre rows existentes sem back-fill. Endpoint extensible (param query + payload field). Cache-key explicit. Telemetria captura estado real.
- **Contra:** 1 migration nova + atualização de UI components + invalidação de cache em mudança de modo. **Aceitável — custo proporcional ao valor.**

---

## 4. Consequências

### Positivas

- **Cross-feature explícito** (pivot 2026-04-24 §4d entregue na prática). Bankroll Sprint 2 ↔ TS Sprint 1 conectados via 1 coluna + 1 enum.
- **Cohort 2 ganha visibilidade** sem perder sinal. Hipótese mensurável (RF-05 ADR-179): % adds com `bankrollOk=false` cai sob `mode='warn'`.
- **Coach Tool herda** sem código novo (ADR-180 reusa mesma resolução).
- **Telemetria habilita auditoria** de modo escolhido vs comportamento de adds.
- **Score NÃO muda** — calibração RF-05 não é contaminada.

### Negativas

- **Migration nova** (0072) — 1 ALTER TABLE simples, custo baixo. CHECK constraint exige `DROP CONSTRAINT IF EXISTS` em rollback (documentar no down).
- **Cache-key fragmentação**: agora `(userId, date, sources, bankrollMode)`. Memory footprint do cache cresce até 3x (1 entry por modo). Aceitável — TTL 30min, GC natural.
- **Alias `bankrollFilter` cria 2 paths** que precisam de teste de equivalência (`bankrollFilter=true` ⇔ `bankrollMode=hide`). Risco baixo (lógica de tradução é 3 linhas).
- **UI segmented control com 3 modos exige copy claro** — risco UX médio, mitigado por tooltip explicando cada modo (ver spec RF-04 AC).

### Neutras

- **Extensibilidade futura**: shape `bankrollWarning.reason` extensible para `above_<rule>` quando ADR-018 evoluir (kelly, BB%, etc). Hoje só 2 valores; amanhã sem nova ADR se a evolução for aditiva.
- **Frontend `SelectorFilters` ganha responsabilidade de persistir mode** — adiciona PUT request com debounce. Padrão similar a outros toggles persistidos (focusStats, etc).
- **Outros widgets/features** que filtram por bankroll no futuro podem reusar a mesma coluna (`tournament_selector_bankroll_mode`) **ou** introduzir colunas dedicadas (ex: `study_planner_bankroll_mode`). Nomear com prefixo do feature mantém escopo claro.

---

## 5. Verificação

- `tests/unit/tournament-selector/bankrollMode.test.ts` cobre 3 modos × com/sem bankroll cadastrado × 3 níveis de buyIn (within soft, between soft and hard, above hard).
- `tests/unit/tournament-selector/bankrollFilterAliasBackCompat.test.ts` cobre equivalência `bankrollFilter=true ⇔ bankrollMode=hide` + `bankrollFilter=false ⇔ bankrollMode=all` + ambos presentes (precedence: `bankrollMode` ganha).
- `tests/unit/tournament-selector/BankrollModeSegmentedControl.test.tsx` cobre switch entre 3 modos + persistência via PUT.
- Migration 0072 testada via `psql --dry-run` antes do push.
- Telemetria validada via SELECT no `tournament_selector_logs` pós-Sprint (cross-check `metadata.bankrollMode` populado em 100% dos `view`).

## Confiança

**Alta.** Mudança cirúrgica, scoring intocado, back-compat coberto, telemetria habilita auditoria pós-merge. Risco médio único: copy do segmented control — mitigado por tooltip + UX review (reviewer phase).
