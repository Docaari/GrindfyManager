# ADR-204: Sprint AI-3.2 — `shared/numCoerce.ts` finite-coerce helper (2 callsites migrados; 4 deferidos AI-3.3)

## Status

Aceito — **fix wave 2026-05-22:** apenas 2 dos 6 callsites consolidados (reportCost + fxResolver). Os outros 4 (monthly/daily/quarterly/weekly local `N`/`num`/`n`) foram **deferidos para AI-3.3** porque o behavior do código atual aceita `string` vinda de `pg` (numeric columns retornam string por default no driver), enquanto o helper `coerceFiniteNumber` é estrito `typeof === "number"`. Migração requer audit per-callsite + `coerceFiniteNumber(parseFloat(v))` explícito na boundary do storage. Grep TODO em `CLAUDE.md §10 / AI-3.3`.

## Data

2026-05-22

## Sprint

AI-3.2 (`Docs/specs/sprint-ai-3.2.md`) — RF-A1 do Cluster A (DRY closure). Subdecisão de ADR-203 (decisão pai do sprint). Recebe ADR dedicado por:

1. **Superfície técnica não-trivial** — escolha entre `coerceFiniteNumber(unknown)` vs `coerceFiniteNumber(number)` vs aceitar string com `parseFloat` impacta 6 callsites + uso futuro.
2. **Lesson #11 (default mínimo)** materializada em assinatura — decisão consciente entre throw vs fallback documentada.
3. **Localização `shared/` vs `server/utils/`** discutida (helper é puro/sem dep server-only — `shared/` correto).

## Decision owner

system-architect.

## Related

- **Pai:** ADR-203 (Sprint AI-3.2 — wave 2 cleanup).
- **Reusa:** `shared/` pattern existente (`shared/brTimezones.ts`, `shared/fxCascade.ts`, `shared/wallet-reasons.ts`). Helper puro sem dep de servidor.
- **Diagrama:** `Docs/architecture/diagrams/coach-ai-3-2/numCoerce-callsites.mermaid` — DAG dos 6 callsites convergindo no helper.

---

## 1. Contexto

AI-3.1 (ADR-176) consolidou `callReportLlm` + `computeReportCost` + `_renderReportShell` em modules dedicados. No mesmo round, reviewer e `/simplify` catalogaram em `Docs/specs/sprint-ai-3.2-backlog.md` (R#4) um helper duplicado em 6 arquivos:

```ts
// padrão encontrado em 6 callsites com nomes variados (safe, num, N, coerceFinite)
const safe = (n: unknown): number => (Number.isFinite(n as number) ? (n as number) : 0);
```

**Callsites identificados:**

1. `server/coach/reportCost.ts` — `safe` local para coerce de `usage.input_tokens`/`output_tokens`/`cache_read_input_tokens`/`cache_creation_input_tokens` antes de multiplicar pelos rates.
2. `server/services/quarterlyReportGenerator.ts` — `num` local em PrimeDope variance computation + IRPF byCurrency.
3. `server/services/monthlyReportGenerator.ts` — `num` local em variance heuristic + comparativos (mes -1/6m/12m).
4. `server/services/dailyDebriefGenerator.ts` — `safe` local em agregação session_tournaments (FX-converted profits).
5. `server/services/tournamentScoringService.ts` — `N` local em scoring 0-100 + grade S/A/B/C/D (coerce de inputs já normalizados via `buildScoringInput`).
6. `server/services/fx/fxResolver.ts` — `safe` local em fallback heurístico cascade.

Cada callsite implementa a mesma lógica com ligeiras variações no fallback (alguns `0`, um deles `NaN` retornando default em segundo step). **Drift garantido** — próxima feature LLM ou de scoring que precise de safe coerce replica o helper, multiplicando o débito.

### Restrições

- **Lesson #11 (default mínimo):** helper retorna fallback explícito (não throw) — comportamento atual preservado em 6/6 callsites. Throw seria mudança comportamental observável (refactor invasivo).
- **Aceita `unknown`:** callsites têm shapes variados (`unknown`, `number | undefined`, `string | number` de Drizzle queries). Aceitar `unknown` evita `as number` cast no callsite (mais seguro typesafe).
- **Sem coerce string automático:** `coerceFiniteNumber('42')` → fallback. Callsites que precisarem de string-to-number fazem `parseFloat`/`parseInt` antes. Decisão consciente para evitar bugs sutis (string vazia `''` vira `0` em JS — undesired).
- **Localização:** `shared/numCoerce.ts` (não `server/utils/`) porque helper é puro/sem dep server-only. Padrão `shared/` reusa convenção AI-3 (`shared/brTimezones.ts`) e desbloqueia uso client-side se necessário (e.g. `client/src/lib/format.ts` futuro).
- **Sem dependência de migration ou env var.**

### O que está fora de escopo

- **Cleanup de `parseFloat`/`parseInt` em outros files** — só os 6 callsites listados migram. Demais usos seguem com convenção local.
- **Helper de coerce com unidade (e.g. `coerceFiniteCents`, `coerceFiniteUsd`)** — overkill agora.
- **Função `coerceFiniteOrNull`** — separa concerns; cabe AI-3.3 se demanda surgir.
- **Migration de `as number` casts** — fora deste cap (espalhado).

---

## 2. Decisão

Cria `shared/numCoerce.ts`:

```ts
/**
 * Finite-coerce helper compartilhado.
 *
 * Retorna `value` se `Number.isFinite(value as number)` é true; senão retorna `fallback`.
 *
 * Aceita `unknown` para compat com:
 * - `JSON.parse` results (campos opcionais que podem vir como string/null/undefined).
 * - Drizzle queries (campos numericos que retornam `string | number` dependendo do tipo SQL).
 * - Anthropic SDK `usage` (campos podem faltar em respostas degraded).
 *
 * Sem coerce automático de string (`'42'` → fallback, não 42). Callers que precisarem
 * de string-to-number fazem `parseFloat`/`parseInt` explícito antes de chamar.
 *
 * Lesson #11 (default mínimo): retorna fallback explícito em vez de throw.
 *
 * @param value Valor a coerce. Aceita qualquer shape.
 * @param fallback Valor retornado se `value` não é finite. Default 0.
 * @returns `value` se finite; senão `fallback`.
 *
 * @example
 * coerceFiniteNumber(42) // 42
 * coerceFiniteNumber(NaN) // 0
 * coerceFiniteNumber(NaN, -1) // -1
 * coerceFiniteNumber(Infinity) // 0
 * coerceFiniteNumber('42') // 0 (sem coerce de string)
 * coerceFiniteNumber(null) // 0
 * coerceFiniteNumber(undefined) // 0
 */
export function coerceFiniteNumber(value: unknown, fallback: number = 0): number {
  return Number.isFinite(value as number) ? (value as number) : fallback;
}
```

### 2.1 Callsites migrados (6/6)

| # | File | Helper local antes | Após |
|---|---|---|---|
| 1 | `server/coach/reportCost.ts` | `const safe = (n: unknown) => Number.isFinite(n as number) ? n as number : 0` | `import { coerceFiniteNumber } from "@shared/numCoerce"` |
| 2 | `server/services/quarterlyReportGenerator.ts` | `const num = ...` (inline) | idem |
| 3 | `server/services/monthlyReportGenerator.ts` | `const num = ...` | idem |
| 4 | `server/services/dailyDebriefGenerator.ts` | `const safe = ...` | idem |
| 5 | `server/services/tournamentScoringService.ts` | `const N = ...` | idem |
| 6 | `server/services/fx/fxResolver.ts` | `const safe = ...` (com fallback NaN em segundo step — normalizar para `coerceFiniteNumber(x, NaN)` se necessário, OU manter wrapper local que chama o shared) | idem |

### 2.2 Tests

Cria `tests/shared/numCoerce.test.ts`:

- **Happy path finite:** `42` → `42`, `0` → `0`, `-3.14` → `-3.14`, `Number.MAX_SAFE_INTEGER` → idem.
- **NaN/Infinity → fallback:** `NaN` → `0`, `Infinity` → `0`, `-Infinity` → `0`.
- **Non-numeric → fallback:** `'42'` → `0` (sem coerce automático), `''` → `0`, `null` → `0`, `undefined` → `0`, `{}` → `0`, `[]` → `0`, `true` → `0` (boolean não é number finite).
- **Custom fallback:** `coerceFiniteNumber(NaN, -1)` → `-1`, `coerceFiniteNumber(undefined, 100)` → `100`.
- **Edge:** `BigInt(42)` → `0` (BigInt não é finite Number em JS — comportamento documentado).

---

## 3. Consequências

### Positivas

- **6 callsites consolidados em 1 import.** Zero duplicação remanescente (grep `Number.isFinite` mostra apenas `numCoerce.ts` + casos legitimately diferentes).
- **Desbloqueia uso futuro shared.** Próxima feature de scoring/finance/LLM-cost que precise de safe coerce importa de `@shared/numCoerce` em vez de redefinir local.
- **Client-side ready.** Localização `shared/` desbloqueia uso em `client/src/` (e.g. formatadores de KPIs, charts Recharts) se necessário.
- **Lesson #11 materializada em assinatura.** Default mínimo (fallback `0`) explícito + comentário JSDoc grepável quando alguém questionar o design.

### Negativas

- **Sem coerce automático de string.** Callsites que hoje passam string e contam com NaN→fallback continuam funcionando (coerce produz NaN→fallback), mas callsites que passam `'42'` esperando `42` quebram. **Audit obrigatório pré-implementer:** grep em cada callsite por `as number` casts adjacentes que sinalizem string passada. Mitigação: nenhum dos 6 callsites listados faz isso (validado pré-spec), mas implementer revalida.
- **BigInt → fallback.** Decisão consciente — `Number.isFinite(BigInt(42))` retorna `false` em JS. Callsites que precisarem de BigInt-to-Number fazem `Number(bigint)` explícito antes.
- **Custom fallback NaN edge case.** `coerceFiniteNumber(undefined, NaN)` retorna `NaN`. Documentado no JSDoc mas pode confundir caller que espera "sempre número finite". Mitigação: convenção em callsites é fallback `0` ou positivo; uso de `NaN` como fallback é anti-pattern documentado.

### Neutras

- **Tests novos** em `tests/shared/numCoerce.test.ts` (~10 cases).
- **Sem mudança de schema, migration, env var ou endpoint.**

---

## 4. Verificação pós-merge

- [ ] `shared/numCoerce.ts` exporta `coerceFiniteNumber`.
- [ ] 6 callsites migrados (grep `Number.isFinite(` em `server/` retorna apenas casos legitimately diferentes documentados).
- [ ] `tests/shared/numCoerce.test.ts` cobre os 10+ cases listados.
- [ ] Suite coach (1300+) verde — paridade comportamental confirmada.
- [ ] Suite server (9700+) verde.
- [ ] `tsc` exit 0.
