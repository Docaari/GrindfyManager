# ADR-205: Sprint AI-3.2 — `AbortSignal.timeout` cap absoluto em `callReportLlm` (worst-case ~182s incident Anthropic mitigation)

## Status

Aceito

## Data

2026-05-22

## Sprint

AI-3.2 (`Docs/specs/sprint-ai-3.2.md`) — RF-D6 do Cluster D (Perf + observability). Subdecisão de ADR-203 (decisão pai do sprint). Recebe ADR dedicado por:

1. **Mudança observable não-trivial** — adiciona `degradedReason='llm_timeout'` ao schema (não-breaking, mas precisa estar documentado).
2. **Trade-off cap value (60s default) vs ambient timeouts SDK Anthropic** discutido com risk register dedicado.
3. **Nova env var `COACH_LLM_TIMEOUT_MS`** com semântica documentada em CLAUDE.md §4.

## Decision owner

system-architect — cap value e env var name locked pelo spec; implementer não negocia.

## Related

- **Pai:** ADR-203 (Sprint AI-3.2 — wave 2 cleanup).
- **Depende de:** ADR-176 (AI-3.1) — exige `server/coach/anthropicClient.ts` com `callReportLlm` + retry 3x exponencial 100/400/1600ms + log lesson #9 antes do fallback.
- **Reusa:** `RETRYABLE_STATUS` const exportado de `server/utils/isRetryableError.ts` (RF-A4 desta mesma sprint), `degradedReason` discriminated union de `CallReportLlmResult` (ADR-176 §2.7).
- **Diagrama:** `Docs/architecture/diagrams/coach-ai-3-2/abortsignal-cap-flow.mermaid` — flow do retry chain com `AbortController` + cap absoluto + degraded reason `llm_timeout` distinto de `llm_failed_3x`.

---

## 1. Contexto

AI-3.1 (ADR-176) introduziu retry 3x exponencial (100/400/1600ms) em `callReportLlm`. Worst-case wall-clock por chamada Anthropic em incidente (e.g. Anthropic flapping 5xx/timeout):

```
attempt 1 (fail) → sleep 100ms
attempt 2 (fail) → sleep 400ms
attempt 3 (fail) → sleep 1600ms
total backoff = 2100ms
+ 3x request timeouts SDK (default ~30s cada attempt antes de erro)
≈ 3 × 30s + 2.1s = ~92s por callReportLlm
```

**Por job de relatório:**

- Quarterly: 1 chamada principal Sonnet 4.6 + opcionalmente 1 sumarização Haiku 4.5 = até 2 callReportLlm.
- Monthly: 1 chamada principal + opcional summarizer = até 2.
- Daily: 1 chamada.
- Recommend lesson: 1 chamada.

**Worst-case por job em incidente:** `2 × 92s ≈ 184s/job` (quarterly tipicamente). `processReportJobsTick` roda a cada 15min (900s). Em pior cenário, 1 job de quarterly enorme + Anthropic flapping pode consumir 20% do ciclo de processamento + bloquear outros jobs na mesma tick. Em ondas de jobs concorrentes (e.g. dia 1 do mês 7h local agregando dezenas de Pro+ users), `processReportJobsTick` pode acumular backlog se cada job for 3min em vez dos ~10-30s esperados (p95).

### Hoje (pré-ADR-205)

- Retry interno do `callReportLlm` esgota até 3 tentativas.
- SDK Anthropic tem timeout próprio (~30s default).
- **Sem cap absoluto.** Anthropic outage prolongado (rare) pode pendurar 1 job por dezenas de segundos sem fail-fast.
- `degradedReason` ∈ { `no_anthropic_key`, `llm_failed_3x`, `llm_parse_error` }. Não distingue Anthropic outage (rede longa) de bug normal (parse error rápido) — observability ruim.

### Restrições

- **`degradedReason='llm_timeout'` é adição não-breaking.** Reports já tratam degraded como branch genérica (status `'degraded'` + degradedReason informativo no `content.degradedReason`). UI Coach (`ReportView`) já mostra fallback narrative — paridade preservada.
- **Cap NÃO afeta retries individuais.** Cada attempt mantém timeout próprio do SDK (~30s). Cap é wall-clock total da chamada `callReportLlm` (todas as retries + backoffs incluídos).
- **Env var `COACH_LLM_TIMEOUT_MS` opcional.** Default 60s (>3× p95 esperado de ~15s). Configurável via `.env` para debug/incident response (founder pode bumar para 120s temporariamente se incidente Anthropic exigir mais tolerância).
- **Lesson #9 (log antes do fallback) preservado.** Quando timeout dispara, `console.warn('anthropicClient.before_fallback', { reason: 'timeout', elapsedMs, cap })` antes de retornar `degradedReason='llm_timeout'`.
- **Sem mudança em behaviors adjacentes:** `parseOnError` semantics inalteradas, retry policy inalterada, whitelist tone/level inalterada.
- **`AbortSignal.timeout(ms)` nativo Node 17.3+** (já é dependência do projeto via Node 20 — ver `package.json` engines). Sem polyfill necessário.

### O que está fora de escopo

- **Cap diferenciado por generator** — todos usam mesmo cap. Caso quarterly precise de 90s (bundle maior), founder reconfig via env (não code).
- **Cap por attempt individual** — SDK Anthropic já faz isso (~30s default). Sobrepor seria fragile.
- **Métricas Prometheus/StatsD** — observability ganho aqui é via `console.warn` log. Métricas formais defer AI-3.3 ou demanda explícita.
- **Retry adaptive baseado em status code Anthropic Status Page** — overkill.

---

## 2. Decisão

`server/coach/anthropicClient.ts` ganha `AbortSignal.timeout(cap)` global. API:

### 2.1 Assinatura do helper interno

```ts
// server/coach/anthropicClient.ts

const DEFAULT_LLM_TIMEOUT_MS = 60_000;

function resolveLlmTimeoutMs(): number {
  const envValue = process.env.COACH_LLM_TIMEOUT_MS;
  if (!envValue) return DEFAULT_LLM_TIMEOUT_MS;
  const parsed = Number.parseInt(envValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LLM_TIMEOUT_MS;
  return parsed;
}

export async function callReportLlm(input: CallReportLlmInput): Promise<CallReportLlmResult> {
  const cap = resolveLlmTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cap);

  try {
    // ... existing retry loop ...
    // Pos-reviewer CRITICAL-1 (fix wave AI-3.2): `signal` vai no SEGUNDO arg
    // (RequestOptions) — passar no body do SDK Anthropic é silentmente
    // ignorado e o cap NUNCA dispara.
    //   await client.messages.create(
    //     { model, max_tokens, system, messages },
    //     { signal: controller.signal },
    //   );
    // ...
  } catch (err) {
    if (controller.signal.aborted) {
      console.warn('anthropicClient.before_fallback', {
        reason: 'timeout',
        elapsedMs: /* computar via Date.now() - start */,
        cap,
      });
      return {
        content: {},
        usage: 0,
        degradedReason: 'llm_timeout',
      };
    }
    // ... existing error handling for llm_failed_3x / llm_parse_error ...
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### 2.2 Discriminated union update

```ts
export type CallReportLlmDegradedReason =
  | 'no_anthropic_key'
  | 'llm_failed_3x'
  | 'llm_parse_error'
  | 'llm_timeout'; // NOVO em AI-3.2 RF-D6
```

### 2.3 Env var documentada

`CLAUDE.md §4 — Variáveis de Ambiente` ganha entrada:

> - `COACH_LLM_TIMEOUT_MS` — (opcional) cap absoluto wall-clock em ms para chamadas `callReportLlm` (Sonnet 4.6 + Haiku 4.5). Default `60000` (60s). Bumar para 90000 ou 120000 em incidente Anthropic prolongado. Quando o cap dispara, retorna `degradedReason='llm_timeout'` em vez de `llm_failed_3x` (distingue Anthropic outage de erro normal de retry exhaust). Ver ADR-205.

### 2.4 Behavior matrix

| Cenário | Antes (AI-3.1) | Após (AI-3.2) |
|---|---|---|
| Happy path Sonnet 4.6 ~5s | ✅ resolve OK | ✅ resolve OK (idêntico) |
| Anthropic 429 → 429 → 200 (retry sucesso ~3s) | ✅ resolve com retry | ✅ idêntico |
| Anthropic 500 × 3 (retry exhaust ~92s) | ❌ `llm_failed_3x` após ~92s | ❌ `llm_timeout` após 60s (fail-fast) |
| Anthropic timeout SDK 30s + 1 retry (~32s) | ❌ `llm_failed_3x` após ~32s | ❌ idêntico (ainda dentro do cap) |
| Anthropic hang infinito | ❌ pendura indefinido (depende do SDK timeout) | ❌ `llm_timeout` após 60s garantido |
| Parse error JSON inválido (rápido ~3s) | ❌ `llm_parse_error` | ❌ idêntico |

### 2.5 Tests

Cria/amplia `tests/coach/anthropicClient.timeout.test.ts`:

- **Happy path cap não dispara:** mock `messages.create` resolve em 100ms → cap 60s não dispara → resolve OK.
- **Timeout dispara:** mock `messages.create` que sleep 5s + env `COACH_LLM_TIMEOUT_MS=100` → cap dispara → retorna `degradedReason='llm_timeout'` + log `anthropicClient.before_fallback` com `{ reason: 'timeout' }`.
- **Cap configurable:** env `COACH_LLM_TIMEOUT_MS=30000` → cap 30s em vez de 60s default.
- **Cap inválido fallback default:** env `COACH_LLM_TIMEOUT_MS=invalid` → usa default 60s.
- **Cap zero/negativo fallback default:** env `COACH_LLM_TIMEOUT_MS=0` → usa default; `COACH_LLM_TIMEOUT_MS=-1` → idem.
- **Retry exhaust antes do cap:** mock 500 × 3 (com backoff 100/400/1600ms = ~2.1s total) + cap 60s → retorna `llm_failed_3x` (NÃO `llm_timeout` — retry esgotou primeiro).
- **Timeout durante backoff:** mock 500 × 3 com SDK timeout muito longo (sleep 30s cada) + cap 60s → cap dispara durante attempt 2 → `llm_timeout`.

### 2.6 Lessons aplicáveis

- **#9 (log antes do fallback):** `console.warn('anthropicClient.before_fallback', { reason: 'timeout', elapsedMs, cap })` antes de retornar degraded. Distingue de outros fallbacks via campo `reason`.
- **#5/#35 (`new AnthropicCtor` ctor):** preservado em `getAnthropicClient` (ADR-176 §2.7). AbortSignal passa via opção `signal` do SDK; não interfere com ctor.
- **#37 (`node-cron` import estático):** NÃO aplica — `AbortController` é nativo Node 20.

---

## 3. Consequências

### Positivas

- **Worst-case wall-clock per-job ≤ 60s.** Em incidente Anthropic, `processReportJobsTick` (15min) não fica pendurado por 1 job patológico. Outros jobs na fila processam normalmente.
- **Observability ganho real.** `degradedReason='llm_timeout'` distingue Anthropic outage (rede longa) de retry exhaust (`llm_failed_3x`). Admin metrics `GET /api/admin/coach/report-cost-metrics` futuramente pode breakdown por `degradedReason` para detectar incidente Anthropic vs bug interno.
- **Founder reconfigurable em incidente.** `COACH_LLM_TIMEOUT_MS=120000` deploy de emergência (env-only, sem code change) caso Anthropic exija mais tolerância temporária.
- **`AbortController` nativo Node 20.** Sem polyfill, sem dep nova.
- **Fail-fast.** Usuários veem narrativa fallback degraded em ≤60s em vez de esperar ~92s+.

### Negativas

- **`llm_timeout` é novo `degradedReason`.** UI/admin metrics precisam tratar como branch genérica (já tratam — não-breaking). Documentar em CLAUDE.md §6 (lista de degraded reasons).
- **Cap pode disparar em bundles legítimos enormes.** Mitigação: cap default 60s é >3× p95 esperado de ~15s. Bundles enormes hoje param via threshold de sumarização AI-3.1 (chars > 20K dispara Haiku — reduz tokens antes do Sonnet). Caso ainda assim quebre, founder reconfig env.
- **`AbortError` propagação no SDK Anthropic.** `messages.create({ ..., signal })` quando abortado throw `AbortError`. Catch handler precisa distinguir `controller.signal.aborted === true` (timeout local) vs outras causes (e.g. parent abort futuro). Test cobre.
- **Mocks Anthropic SDK existentes precisam aceitar `{ signal }` arg.** Lesson #3 audit: revisar `tests/coach/*Generator.test.ts` para garantir que mocks de `messages.create` não falhem por arg extra. Mitigação: vi.fn() mocks ignoram args desconhecidos por default; baixo risco.

### Neutras

- **Sem mudança de schema, migration, prompt LLM ou ratecard.**
- **Tests novos** em `tests/coach/anthropicClient.timeout.test.ts` (~7 cases).
- **CLAUDE.md §4 ganha 1 entrada (`COACH_LLM_TIMEOUT_MS`).** CLAUDE.md §6 ganha menção a `llm_timeout` na lista de degraded reasons.

---

## 4. Risk register

| Risco | Likelihood | Impact | Mitigação |
|---|---|---|---|
| Cap dispara em bundle legítimo grande (e.g. user power Pro+ com hand history detalhada > threshold sumarização) | L | M | Default 60s é >3× p95 esperado; founder reconfig env em incidente; sumarização AI-3.1 já reduz bundle pré-Sonnet |
| `AbortError` não tratado em outro callsite (e.g. error handler genérico classifica como `llm_failed_3x`) | M | L | Test cobre `controller.signal.aborted === true` branch explicitamente; lesson #9 log distingue via `reason: 'timeout'` |
| Mocks Anthropic SDK em tests legados quebram por arg `{ signal }` extra | L | L | vi.fn() ignora args desconhecidos; lesson #3 audit pré-implementer; teste smoke pós-merge cobre weekly+monthly+daily+quarterly |
| `COACH_LLM_TIMEOUT_MS` inválido (string non-numeric, zero, negativo) silenciosamente cai para default sem alertar | M | L | Falback explícito documentado no JSDoc; teste cobre cada caso inválido; logs `anthropicClient.config.timeout_invalid` opcional (defer AI-3.3) |
| Cap interage mal com sumarização Haiku encadeada (cap = total wall-clock incluindo Haiku + Sonnet) | L | M | Cada `callReportLlm` tem cap próprio (não compartilhado). 2 chamadas sequenciais = 2 × 60s = 120s worst-case por job — ainda dentro do ciclo 15min `processReportJobsTick` |

---

## 5. Verificação pós-merge

- [ ] `AbortSignal.timeout(cap)` aplicado em todas as chamadas via `callReportLlm` (grep `messages.create` em `anthropicClient.ts` mostra `signal` arg).
- [ ] `degradedReason='llm_timeout'` adicionado ao discriminated union `CallReportLlmDegradedReason`.
- [ ] `tests/coach/anthropicClient.timeout.test.ts` cobre os 7 cases listados.
- [ ] Env `COACH_LLM_TIMEOUT_MS` documentada em CLAUDE.md §4.
- [ ] CLAUDE.md §6 menciona `llm_timeout` na lista de degraded reasons (junto com `no_anthropic_key`/`llm_failed_3x`/`llm_parse_error`).
- [ ] Suite coach (1300+) verde.
- [ ] Suite server (9700+) verde — paridade comportamental confirmada (happy path inalterado; degraded fallback agora pode ser `llm_timeout` em vez de `llm_failed_3x` para outage prolongado).
- [ ] `tsc` exit 0.
- [ ] Diagrama `abortsignal-cap-flow.mermaid` linkado em CLAUDE.md §10 ou em `Docs/api/coach.md`.

---

## 6. Pós-deploy observability

Founder/admin pode validar pós-deploy via:

```sql
-- Quantos reports caíram em llm_timeout nos últimos 7 dias?
SELECT
  report_type,
  COUNT(*) FILTER (WHERE content->>'degradedReason' = 'llm_timeout') AS timeouts,
  COUNT(*) FILTER (WHERE content->>'degradedReason' = 'llm_failed_3x') AS retry_exhausts,
  COUNT(*) FILTER (WHERE content->>'degradedReason' = 'llm_parse_error') AS parse_errors,
  COUNT(*) FILTER (WHERE status = 'ready') AS healthy,
  COUNT(*) AS total
FROM reports
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY report_type
ORDER BY report_type;
```

Esperado pós-deploy normal: `timeouts ≈ 0` (Anthropic estável). Em incidente: `timeouts` sobe — sinal claro para investigar status page Anthropic + considerar bump de `COACH_LLM_TIMEOUT_MS`.
