# Spec: Sprint AI-3.1 — Cleanup IA pós-AI-3: contract fixes + DRY (anthropicClient/reportCost) + perf storage + email shell migrate

## Status
Proposta (aguardando aprovação founder)

---

## Resumo

Sprint de cleanup pós-AI-3 (commit `f64223a7` push origin/main em 2026-05-20). **Não adiciona feature nova** — fecha pendências documentadas nos reviewer rounds AI-2B e AI-3 (`memory/session_2026-05-20-ai-3-shipped.md` §"Pendências AI-3.1"):

1. **Contract fixes** — `cgameRecent.confidence` passthrough (HIGH-1), `irpfSummary.byCurrency.profit` rename → `profitNative` com alias deprecated (MEDIUM-1).
2. **Threshold tuning** — sumarização hierárquica Haiku no Monthly/Quarterly hoje usa OR composto (`chars > 20K OR sessions > 100`); muitas sessões "leves" disparam o caminho caro sem necessidade. Trocar para chars-only (MEDIUM-2).
3. **Email shell migrate** — `weeklyReportEmail.ts` + `monthlyReportEmail.ts` migrar para `_renderReportShell` (já criado em AI-3 e usado só pelo quarterly). Formalizar contract `safeBodyHtml` + JSDoc `@safe-html` (MEDIUM-4).
4. **DRY refactor maior** — extrair `server/coach/anthropicClient.ts` (`getAnthropicClient` + `callReportLlm`) consolidando 5 callsites lockstep (A1-H2/H3) + `server/coach/reportCost.ts` (constants Sonnet 4.6 + Haiku 4.5 + `computeReportCost`) consolidando 4 callsites (A1-M1).
5. **Storage helper** — `countGrindSessions` para evitar `getGrindSessions(...).length` no quarterly (A3-H3).
6. **Perf scale (defer-friendly)** — `listUsersForCron` cursor pagination com LIMIT 1000 (A3-H2). Marcado `[DEFER A1-NEXT]` se estimate > 4h.
7. **Dedup** — `getAiStructuredProfile` callsite no quarterly (LOW-4) se `storage.getUserProfile` já trouxer o JSONB no shape correto.

**Não-objetivos:**
- Sem feature nova (sem novo tool, novo nudge, novo report type).
- Sem migration de schema (`countGrindSessions` é só método storage; `byCurrency.profitNative` é só rename de campo de output de tool — não bate em DB).
- Sem mudança de UI exceto consumers do `byCurrency.profit` (RF-02 audita e lista quais migrar agora vs deferir; UI principal `IrpfSummaryPanel` se existir).
- Sem mudança de prompts LLM (já estabilizados em AI-3).
- Sem cleanup de banners verbosos (defer permanente — estética, baixo valor).

---

## Contexto

### Estado atual

- **AI-3 shipped** (commit `f64223a7`): Quarterly LLM real Sonnet 4.6 + summarizer Haiku via `reportSummarizer.ts`; FX cascade delega a adapters reais; `updateCgameRecent` persist best-effort; `enqueueQuarterly` usa `listUsersForCron("subscription_plan IN ('trial','active','admin')")` com UTC pre-check; `shared/brTimezones.ts` extraído; `_renderReportShell.ts` extraído (mas só quarterly usa).
- **Pendências de AI-3** (do session memory + reviewer APPROVED-WITH-NITS):
  - **HIGH-1**: `quarterlyReportGenerator.ts:207-209` força `confidence: "low"` quando `cgameSnapshotPlain.confidence` não é literal `"high"|"medium"|"low"`. Mas o aggregator (`server/services/cgameAggregator.ts`) já retorna confidence calculado; coerção sobrescreve sinal real do aggregator. `normalizeCgameRecent` em `server/storage/aiStructuredProfile.ts` já valida o shape → deve ser fonte de verdade.
  - **MEDIUM-1**: `server/coach/tools/computeIrpfSummary.ts` produz `byCurrency[currency] = { profit, ... }`. Ambíguo: é nativo da moeda ou USD-converted? Hoje é nativo (não convertido), mas nome `profit` sugere base. UI/email consumers podem confundir.
  - **MEDIUM-2**: `reportSummarizer.ts` (ou caller no quarterly/monthly) dispara summarização Haiku quando `chars > 20K OR sessions > 100`. Sessões "leves" sem hands detalhadas inflacionam o count e disparam custo Haiku sem necessidade.
  - **MEDIUM-4**: AI-3 criou `_renderReportShell.ts` e migrou só `quarterlyReportEmail.ts`. Weekly e Monthly continuam com header/CTA/footer duplicados (~70% código repetido).
  - **A1-H2/H3**: 5 generators (weekly, monthly, daily debrief, quarterly, recommendLessonForUser, reportSummarizer) cada um lazy-importa `@anthropic-ai/sdk`, instancia client, chama `messages.create`, captura usage, parse JSON, log lesson #9. Drift entre callsites: tone/level whitelist só no quarterly; retry 3x só em 3 deles; degraded reason naming inconsistente.
  - **A1-M1**: Custo Sonnet 4.6 ($3/M input, $15/M output, $0.30/M cache read, $3.75/M cache write) hardcoded em 4 callsites (`computeCost` em report runner, `computeMonthlyCost`, `computeDailyDebriefCost`, `computeQuarterlyCost`). Risco de drift quando preço atualizar.
  - **A3-H3**: `quarterlyReportGenerator.ts` faz `getGrindSessions(...)` só pra ler `.length` no header `totalSessions` — carrega N linhas full do DB.
  - **A3-H2**: `listUsersForCron` sem LIMIT — full table scan no enqueuer hourly. Phase 1 OK (centenas de users); Phase 2 vira gargalo.
  - **LOW-4**: `quarterlyReportGenerator.ts` chama `getAiStructuredProfile(userId)` separado de `storage.getUserProfile(userId)` quando ambos hitam `users` table.

### Por que esta sprint

- Reviewer rounds AI-2B/AI-3 acumularam 7 NITs sem fix urgente. Sprint pequena evita acúmulo virar pivô de débito técnico.
- DRY extracts (RF-06 + RF-07) reduzem superfície de bug futura — qualquer ajuste em pricing Anthropic ou modelo passa a ser 1 arquivo.
- Contract fixes (RF-01 + RF-02) protegem consumers downstream (`cgameRecent` consumido em system prompt do Coach; `byCurrency.profit` consumido em UI IRPF e email).
- Custo zero em produção (sem migration, sem mudança visível para founder/users).

---

## Usuários

- **Founder/Admins**: nenhum impacto visível (cleanup interno). Custo Haiku potencialmente diminui ~10-30% para usuários com muitas sessões leves.
- **Pro+/Trial users**: nenhum impacto visível (mesma narrativa, mesmo template de email com shell unificado mas HTML idêntico).
- **IDE/Devs**: vida mais fácil — `anthropicClient.callReportLlm` e `computeReportCost` reduzem ~120 linhas de boilerplate por novo report type futuro.

---

## Requisitos Funcionais

### RF-01: HIGH-1 — `cgameRecent.confidence` passthrough no Quarterly

**Descrição:** remover coerção `'low'` forçada em `quarterlyReportGenerator.ts:207-209` e delegar validação para `normalizeCgameRecent` (já existente em `server/storage/aiStructuredProfile.ts`).

**Files tocados:**
- `server/services/quarterlyReportGenerator.ts:200-220` (bloco "RF-03 — trigger updateCgameRecent").
- `server/storage/aiStructuredProfile.ts:updateCgameRecent` — confirmar que `normalizeCgameRecent` aceita undefined confidence e ou (a) preserva o valor original quando válido, ou (b) omite o persist se inválido. Se hoje silenciosamente coage para `'low'`, ajustar para omitir o persist (logar `cgame.persist.confidence_invalid`).

**Regras de negócio:**
- Se `cgameSnapshotPlain.confidence ∈ { 'high', 'medium', 'low' }` → passthrough.
- Se inválido/undefined → `normalizeCgameRecent` decide: opção preferida = omitir persist (não escrever shape ruim em users.ai_structured_profile.cgameRecent). Logar warn.
- Não alterar o shape de output (consumers no Coach system prompt esperam `confidence` literal).

**Critério de aceitação:**
- [ ] Test "quarterly persiste confidence='medium' quando aggregator retorna 'medium'".
- [ ] Test "quarterly não persiste (no-op) quando aggregator retorna confidence inválido".
- [ ] Test existente "persiste com confidence='low' fallback" deve ser REMOVIDO ou re-escrito para refletir comportamento novo (lesson #38 — test mexido com justificativa de contract fix).

---

### RF-02: MEDIUM-1 — `irpfSummary.byCurrency.profit` rename → `profitNative`

**Descrição:** rename do campo de output da tool `compute_irpf_summary` para deixar explícito que valor está em moeda nativa (não USD).

**Files tocados:**
- `server/coach/tools/computeIrpfSummary.ts` — rename `profit` → `profitNative`. Manter alias `profit` deprecated por 1 sprint (return ambos campos com mesmo valor; comentário `// @deprecated remove em AI-3.2`).
- Audit consumers: rodar grep `byCurrency.*profit` em:
  - `client/src/**` (UI IRPF panel, se existir — provavelmente `client/src/components/coach/IrpfSummaryPanel.tsx` ou similar).
  - `server/emails/**` (templates de quarterly que mencionam IRPF block).
  - `server/coach/**` (system prompt builder que cita IRPF).
- Decisão: migrar **UI consumers + email consumers agora** (lendo `profitNative`); deixar coach system prompt builder usar alias `profit` por enquanto (re-visit em AI-3.2 quando remover alias).

**Audit a executar antes do implementer:**
```bash
grep -rn "byCurrency" client/src/ server/ shared/ --include="*.ts" --include="*.tsx"
```
Resultado listado no spec como "consumers identificados: X, Y, Z". Implementer migra apenas os listados.

**Critério de aceitação:**
- [ ] `computeIrpfSummary` retorna `{ byCurrency: { BRL: { profitNative: 1234, profit: 1234, ... } } }` (ambos preenchidos).
- [ ] Test snapshot existente continua verde (alias preserva back-compat).
- [ ] Test novo "profitNative populated" + "profit alias deprecated still populated".
- [ ] UI consumer (se identificado) ler `profitNative` com fallback `profit ?? profitNative`.
- [ ] CHANGELOG no header da tool documenta deprecation com data alvo de remoção.

---

### RF-03: MEDIUM-2 — LLM bundle threshold tuning (chars-only)

**Descrição:** trocar critério OR composto (`chars > 20K OR sessions > 100`) para chars-only no caller de `maybeSummarizeBundle` (`server/services/reportSummarizer.ts` ou diretamente no `quarterlyReportGenerator.ts` + `monthlyReportGenerator.ts`).

**Justificativa:**
- Sessões "leves" sem `session_tournaments` ou com handHistories vazias não contribuem para `chars` significativamente.
- Chars-only é heurística mais direta: limite real do bundle é tokens, e tokens ≈ chars/4.
- Threshold default já é `COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS = 20000` (env var). Manter env var; remover ramo OR `sessions > 100`.

**Files tocados:**
- `server/services/reportSummarizer.ts` — função `maybeSummarizeBundle(bundle, opts?)`. Hoje (provável) calcula `chars = JSON.stringify(bundle).length` e tem segundo critério `sessions = bundle.sessions?.length ?? 0`. Remover segundo critério.
- `server/services/quarterlyReportGenerator.ts` — caller (linha aproximada onde `maybeSummarizeBundle` é invocada). Confirmar que não passa `sessions` count override.
- `server/services/monthlyReportGenerator.ts` — idem.

**Critério de aceitação:**
- [ ] Test "bundle 19K chars + 200 sessions → summarizer NÃO aciona (chars < threshold)".
- [ ] Test "bundle 25K chars + 50 sessions → summarizer aciona".
- [ ] Test existente que assumia `sessions > 100` aciona deve ser ajustado (lesson #38 — contract change).
- [ ] Documentar no comentário do `maybeSummarizeBundle` o trade-off (mais barato em runs com muitas sessões leves; mais arriscado em runs com poucas sessões de hand history densas, mas tokens ainda dentro de 200K context window de Sonnet 4.6).

**Decisão deferida:** se founder preferir refinar critério "sessions" para "sessions com hand history detalhada" em vez de remover, abrir AI-3.2 — esta spec assume chars-only por simplicidade.

---

### RF-04: MEDIUM-4 — Weekly + Monthly email shell migrate

**Descrição:** migrar `weeklyReportEmail.ts` + `monthlyReportEmail.ts` para usar `server/emails/templates/_renderReportShell.ts` (já criado em AI-3 e usado pelo quarterly).

**Files tocados:**
- `server/emails/templates/weeklyReportEmail.ts` — substituir bloco header/CTA/footer inline por chamada a `_renderReportShell({ title, safeBodyHtml, ctaHref, ctaLabel, unsubscribeUrl, disclaimer })`.
- `server/emails/templates/monthlyReportEmail.ts` — idem.
- `server/emails/templates/_renderReportShell.ts`:
  - Rename param `bodyHtml` → `safeBodyHtml` (sinaliza contract: caller garante sanitization).
  - Adicionar JSDoc `@safe-html` no parâmetro + warning explícito: "Caller MUST sanitize. No DOMPurify aqui (server context)."
  - Sem mudança de assinatura visível para o quarterly migrante (param rename é breaking, mas só 3 callsites).

**Audit a executar:**
- Snapshot tests dos 3 emails (weekly/monthly/quarterly) — confirmar HTML idêntico pós-migrate. Diff pixel-by-pixel não necessário; comparar `string.trim()` para tolerar whitespace cosmético.

**Critério de aceitação:**
- [ ] Weekly email test snapshot continua verde (HTML idêntico pré/pós migrate, ignorando whitespace).
- [ ] Monthly email test snapshot idem.
- [ ] Quarterly email test snapshot continua verde (rename param afetou só callsite interno).
- [ ] `_renderReportShell` JSDoc inclui `@safe-html` + warning.
- [ ] Grep `bodyHtml` no codebase retorna 0 hits após rename (sanity check).

---

### RF-05: LOW-4 — Dedup `getAiStructuredProfile` callsite no quarterly

**Descrição:** verificar se `storage.getUserProfile(userId)` já retorna `ai_structured_profile` JSONB no shape esperado; se sim, eliminar a chamada separada de `getAiStructuredProfile` no `quarterlyReportGenerator.ts`.

**Files tocados:**
- `server/services/quarterlyReportGenerator.ts` — gather section. Identificar a chamada explícita `await getAiStructuredProfile(userId)`.
- `server/storage.ts:getUserProfile` — confirmar shape do return (inclui `aiStructuredProfile`? camelCase ou snake_case?).
- Possivelmente `server/storage/aiStructuredProfile.ts` — manter export `getAiStructuredProfile` (outros callsites podem precisar).

**Critério de aceitação:**
- [ ] Se shape ok → eliminar `getAiStructuredProfile` call do quarterly; usar `profile.aiStructuredProfile` (ou equivalente).
- [ ] Se shape NÃO bate (e.g. `getUserProfile` retorna shape diferente, normalizado para UI) → spec NIT documentado como `[DEFER AI-3.2]` no resumo da implementação.
- [ ] Test integration "quarterly gather faz N+1 vs N DB queries" (count via `db.spy` se exists, ou stub spy).

**Estimate:** 30min se shape bate; sub-spec se requer refactor de `getUserProfile`.

---

### RF-06: A1-H2/H3 — Extract `server/coach/anthropicClient.ts`

**Descrição:** consolidar 5 callsites que lazy-importam SDK Anthropic, instanciam client, chamam `messages.create`, parse JSON e logam.

**Novo arquivo:** `server/coach/anthropicClient.ts`

**API:**
```ts
export interface CallReportLlmInput {
  systemPrompt: string;
  userPromptBuilder: (bundle: any, opts: { tone?: string; level?: string }) => string;
  model: string;                      // 'claude-sonnet-4-6-...' | 'claude-haiku-4-5-...'
  bundle: any;
  tone?: string;                      // whitelist: 'neutro'|'incisivo'|'gentil' — validate via shared constant
  level?: string;                     // whitelist: 'iniciante'|'intermediario'|'avancado'
  maxTokens: number;
  parseOnError?: 'fallback-degraded' | 'throw';
  injectedClient?: any;               // para testes
}

export interface CallReportLlmResult {
  content: any;                       // JSON parsed
  usage: { input_tokens, output_tokens, cache_read_input_tokens?, cache_creation_input_tokens? };
  rawText: string;                    // texto bruto antes do JSON.parse
  degradedReason?: 'no_anthropic_key' | 'llm_failed_3x' | 'llm_parse_error';
}

export async function getAnthropicClient(): Promise<any | null>;
export async function callReportLlm(input: CallReportLlmInput): Promise<CallReportLlmResult>;
```

**Comportamento:**
- `getAnthropicClient()`: lazy `import('@anthropic-ai/sdk')` + `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`. Retorna null se sem chave. Try/catch fallback factory call para lesson #5/#35 (mock Anthropic SDK em testes não é construtor-callable em strict mode).
- `callReportLlm()`:
  - Tone/level whitelist validation (shared `WHITELISTED_TONES` + `WHITELISTED_LEVELS` constants exportadas).
  - Retry 3x com backoff exponencial (100ms, 400ms, 1600ms) em erro 429/500/transient.
  - JSON parse com `parseOnError`: `'fallback-degraded'` retorna `{ content: {}, degradedReason: 'llm_parse_error' }`; `'throw'` propaga.
  - Log estruturado lesson #9: `console.warn("anthropicClient.before_fallback", { model, attempt, error })` antes de fallback.

**5 callsites a migrar (lockstep):**
1. `server/services/quarterlyReportGenerator.ts` — substituir bloco LLM call.
2. `server/services/monthlyReportGenerator.ts` — idem.
3. `server/services/dailyDebriefGenerator.ts` — idem.
4. `server/coach/tools/recommendLesson.ts` (ou onde quer que `recommendLessonForUser` chame Anthropic) — idem.
5. `server/services/reportSummarizer.ts` — idem.

**Audit de mocks a executar:**
```bash
grep -rn "vi.mock.*anthropic" tests/ --include="*.ts" --include="*.tsx"
```
Resultado listado no spec como "test files que mockam Anthropic SDK: X, Y, Z". Implementer migra mocks para usar `vi.mock('@/server/coach/anthropicClient', ...)` em vez de `vi.mock('@anthropic-ai/sdk', ...)` quando aplicável. Lessons relevantes: #5, #35, #37.

**Critério de aceitação:**
- [ ] `server/coach/anthropicClient.ts` criado com API acima.
- [ ] 5 callsites migrados.
- [ ] Test unit "callReportLlm com client null → degradedReason='no_anthropic_key'".
- [ ] Test unit "callReportLlm com JSON malformado + parseOnError='fallback-degraded' → degradedReason='llm_parse_error'".
- [ ] Test unit "callReportLlm com 3 falhas 429 → degradedReason='llm_failed_3x'".
- [ ] Test unit "tone fora da whitelist → erro síncrono antes de chamar LLM".
- [ ] Suite coach (1244 tests) continua verde pós-migrate.
- [ ] Build (`npm run check`) exit 0.

**Effort estimate:** ~3h (1h API + 1.5h migrate + 0.5h test/mock sweep).

---

### RF-07: A1-M1 — Extract `server/coach/reportCost.ts`

**Descrição:** consolidar constants de preço Anthropic + função `computeReportCost`.

**Novo arquivo:** `server/coach/reportCost.ts`

**API:**
```ts
export const SONNET_46_PRICE_PER_M = {
  input: 3.00,
  output: 15.00,
  cacheRead: 0.30,
  cacheWrite: 3.75,
} as const;

export const HAIKU_45_PRICE_PER_M = {
  input: 0.80,         // confirmar valor em https://docs.anthropic.com/pricing
  output: 4.00,
  cacheRead: 0.08,
  cacheWrite: 1.00,
} as const;

export type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export type Ratecard = 'sonnet46' | 'haiku45';

export function computeReportCost(usage: AnthropicUsage, ratecard?: Ratecard): number;
```

**Comportamento:**
- Default ratecard = `'sonnet46'`.
- Cost = `(input_tokens * price.input + output_tokens * price.output + (cache_read_input_tokens ?? 0) * price.cacheRead + (cache_creation_input_tokens ?? 0) * price.cacheWrite) / 1_000_000`.
- Return em USD (number, não Decimal — alinhado com `cost_usd_estimate` numeric column).

**4 callsites a migrar:**
1. `computeCost` em `server/jobs/reportJobRunner.ts` ou weekly generator (localizar via grep).
2. `computeMonthlyCost` em `server/services/monthlyReportGenerator.ts`.
3. `computeDailyDebriefCost` em `server/services/dailyDebriefGenerator.ts`.
4. `computeQuarterlyCost` em `server/services/quarterlyReportGenerator.ts`.
- Bonus: se `reportSummarizer.ts` calcula cost separado para Haiku, migrar usando `ratecard='haiku45'`.

**Critério de aceitação:**
- [ ] `reportCost.ts` criado.
- [ ] 4+ callsites migrados.
- [ ] Test unit "Sonnet 4.6 input 1M tokens + output 1M tokens → $18.00".
- [ ] Test unit "Haiku 4.5 com cache → cost reflete preços cache".
- [ ] Test unit "usage sem cache fields → cost = input + output only".
- [ ] Snapshot test em report finalizado: `cost_usd_estimate` igual ao valor pré-migrate (validate equivalence).

**Effort estimate:** ~1.5h.

---

### RF-08: A3-H3 — `storage.countGrindSessions`

**Descrição:** evitar carregar N linhas do DB só para ler `.length`.

**Files tocados:**
- `server/storage.ts` — adicionar método:
  ```ts
  async countGrindSessions(userId: string, rangeArg: { from: Date; to: Date } | null): Promise<number>
  ```
  Implementação: `SELECT COUNT(*) FROM grind_sessions WHERE user_id = $1 AND (range IS NULL OR ended_at BETWEEN $2 AND $3)`.
- `server/services/quarterlyReportGenerator.ts` — substituir `(await storage.getGrindSessions({ userId, from, to })).length` por `await storage.countGrindSessions(userId, { from, to })`.
- Audit similar callsites: grep `getGrindSessions.*length` em `server/services/` + `server/coach/`.

**Critério de aceitação:**
- [ ] Método novo em storage + stub mock helper para tests.
- [ ] Quarterly generator usa count em vez de length.
- [ ] Test integration "countGrindSessions filtra range corretamente".
- [ ] Test integration "countGrindSessions retorna 0 quando user sem sessões".
- [ ] Test legado do quarterly que stubava `getGrindSessions` precisa stub novo `countGrindSessions` (lesson #38).

**Effort estimate:** ~45min.

---

### RF-09: A3-H2 — `listUsersForCron` cursor pagination — `[DEFER A1-NEXT se > 4h]`

**Descrição:** cursor pagination com LIMIT 1000 para escalar enqueuers hourly em Phase 2.

**Files tocados:**
- `server/storage.ts:listUsersForCron(filterSql: string)` — mudar para:
  ```ts
  async listUsersForCron(filterSql: string, opts?: { cursor?: string; limit?: number }): Promise<{ users: UserRow[]; nextCursor?: string }>
  ```
  Cursor = último `userId` da página anterior. Query: `SELECT ... WHERE <filterSql> AND user_id > $cursor ORDER BY user_id LIMIT $limit`.
- 3 callsites a migrar:
  1. `enqueueWeeklyReportJobsTick` em `reportJobRunner.ts`.
  2. `enqueueMonthlyReportJobsTick` idem.
  3. `enqueueQuarterlyReportJobsTick` idem.
- Cada caller vira loop `while (nextCursor) { ... }`.

**Decisão de defer:**
- Se durante test-writer phase ficar claro que loop introduz race conditions com `processReportJobsTick` (jobs sendo enfileirados enquanto outros processam) → DEFER para AI-NEXT.
- Se effort estimate (após test-writer phase) > 4h → DEFER.
- Se DEFER: spec marca como `[DEFER AI-3.2]` e o resto da sprint procede normalmente.

**Critério de aceitação (se NÃO defer):**
- [ ] `listUsersForCron` aceita `{ cursor, limit }`.
- [ ] 3 enqueuers iteram em loop.
- [ ] Test "listUsersForCron retorna nextCursor quando há mais páginas".
- [ ] Test "loop completo processa 1500 users em 2 páginas com cursor".
- [ ] Test "enqueuer ainda emite jobs para todos os elegíveis (count idêntico pré-paginate)".

**Effort estimate:** 4-6h (provável defer).

---

## Requisitos Não-Funcionais

- **Performance:**
  - RF-03 threshold tuning: redução estimada de 10-30% nas chamadas Haiku para users com >100 sessões leves/quarter.
  - RF-08 countGrindSessions: redução de I/O DB no quarterly gather (de N linhas para 1 COUNT).
  - RF-09 (se shipped): suporte a escala 10K+ users sem timeout no enqueuer hourly.
- **Segurança:** sem mudança (RF-06 mantém whitelist tone/level que já existe; RF-04 documenta `@safe-html` contract explícito).
- **Disponibilidade:** sem regressão. Reviewer round deve confirmar que migrate RF-06 não muda comportamento observável (mesmo prompt, mesmo modelo, mesmo retry behavior).
- **Custo:** RF-03 reduz custo Haiku (não estimável sem run real, mas direção certa). RF-07 não afeta custo (só refactor).

---

## Endpoints Previstos

Nenhum endpoint novo. Sprint é refactor + contract fixes internos.

---

## Modelos de Dados Afetados

Nenhuma migration. Sprint não toca schema DB.

**Mudança de shape em output de tool (não-DB):**
- `compute_irpf_summary` output: `byCurrency[currency].profitNative` (novo) + `byCurrency[currency].profit` (alias deprecated). Documentado em `Docs/api/coach-tools.md` após implementação.

---

## Integrações Externas

Sem integração nova. RF-06 consolida call para Anthropic SDK (sem mudar comportamento HTTP).

---

## Cenários de Teste Derivados

### Happy Path
- [ ] Quarterly generator roda em user com cgame confidence='medium' → persiste confidence='medium' (RF-01).
- [ ] `compute_irpf_summary` retorna byCurrency com `profitNative` + `profit` (RF-02).
- [ ] Monthly generator com bundle 25K chars aciona Haiku summarizer (RF-03).
- [ ] Weekly email rendered com `_renderReportShell` → HTML idêntico ao pré-migrate (RF-04).
- [ ] `callReportLlm` retorna content parsed + usage + degradedReason undefined em happy path (RF-06).
- [ ] `computeReportCost(usage, 'sonnet46')` retorna USD esperado (RF-07).
- [ ] `countGrindSessions(userId, range)` retorna count correto (RF-08).

### Validação de Input
- [ ] `callReportLlm` com tone='inválido' → throw síncrono (RF-06).
- [ ] `callReportLlm` com level='inválido' → throw síncrono (RF-06).
- [ ] `computeReportCost` com usage sem `input_tokens` → throw ou 0 (definir).

### Regras de Negócio
- [ ] `normalizeCgameRecent` com confidence='invalid' → omite persist (RF-01).
- [ ] `maybeSummarizeBundle` com chars < threshold + sessions > 100 → NÃO aciona (RF-03).
- [ ] `callReportLlm` retry 3x em 429 → degradedReason='llm_failed_3x' no 3º fail (RF-06).
- [ ] `listUsersForCron` paginate retorna nextCursor (RF-09 se shipped).

### Edge Cases
- [ ] `_renderReportShell` com `safeBodyHtml=''` (vazio) → não quebra (RF-04).
- [ ] Quarterly com 0 sessões → `countGrindSessions` retorna 0 (RF-08).
- [ ] `getAiStructuredProfile` callsite removido + `storage.getUserProfile` retorna `aiStructuredProfile=null` → quarterly fallback OK (RF-05).
- [ ] Mock Anthropic SDK em test usa factory call (não `new`) — confirma lesson #5/#35 ainda coberta após migrate (RF-06).

---

## Fora de Escopo

- Feature nova (sem novo tool, novo report type, novo nudge).
- Mudança visual em UI (exceto rename consumers RF-02).
- Migration de schema DB.
- LLM real para `compute_irpf_summary` (continua determinístico).
- Cleanup banners verbosos pos-cleanup-AI-3.
- UI editor de career goals.
- Migração de enqueuers de hourly cron para cron dedicado.
- Cache `fxCascade` → Redis.
- Hardening de `_renderReportShell.safeBodyHtml` com sanitizer server-side (continua contract: caller sanitiza).

---

## Dependências

- AI-3 shipped (commit f64223a7) — necessário para RF-04 ter `_renderReportShell.ts` para migrar.
- AI-2B shipped — necessário para RF-01 ter `cgameRecent` no shape AiStructuredProfile.
- Nenhuma dependência externa (sem novo pacote npm, sem credencial nova).

---

## Notas de Implementação

### Ordem sugerida (test-writer + implementer)

1. **RF-01 + RF-02 + RF-05** (contract fixes, low blast radius) — ~2h total.
2. **RF-08 + RF-03** (storage helper + threshold tuning) — ~1.5h.
3. **RF-07** (`reportCost.ts` extract — depende de nada, isolado) — ~1.5h.
4. **RF-04** (email shell migrate — depende de RF-07 não ter modificado weekly/monthly cost compute) — ~1.5h.
5. **RF-06** (`anthropicClient.ts` extract — maior blast radius, deixar por último) — ~3h.
6. **RF-09** (cursor pagination — DEFER se estimate > 4h pós-test-writer) — 4-6h.

**Total estimate (sem RF-09):** ~9.5h. **Com RF-09:** ~13.5-15.5h.

### Riscos

- **Mocks Anthropic SDK espalhados** (lessons #5, #35, #37): RF-06 vai cascatar refactor de tests que mockam `@anthropic-ai/sdk`. Audit prévio listado no RF-06 é OBRIGATÓRIO antes do test-writer.
- **1244 testes coach suite**: cada RF deve rodar `npx vitest run server/coach/**` + `server/services/**` antes de commit incremental. Regressão silenciosa em retry behavior do `callReportLlm` é o maior risco.
- **DRY cascade**: RF-06 (anthropicClient) + RF-07 (reportCost) podem afetar callers indiretos. Plano: feature flag opcional `USE_LEGACY_ANTHROPIC_CALL=true` para rollback rápido se reviewer detectar drift de comportamento. Decisão deferida para test-writer phase.
- **Lesson #38 (test modificado)**: RF-01 + RF-03 + RF-08 + RF-09 implicam ajuste de testes existentes (não só adicionar testes novos). Implementer deve documentar cada test modificado no resumo de implementação com justificativa "contract fix por RF-XX".

### Pendências pós-spec

- Decisão final de DEFER RF-09: tomada após test-writer estimar effort. Marcar na spec atualizada.
- Confirmar shape de `storage.getUserProfile` para RF-05 (sub-spec se shape não bate).
- Audit prévio de `byCurrency.*profit` consumers (RF-02) e mocks Anthropic SDK (RF-06) — listar resultados nesta spec antes do test-writer iniciar.

### Próximo passo recomendado pós-aprovação

```
→ Use o agente system-architect para criar:
  - ADR-175 (extract anthropicClient + reportCost: rationale, lockstep migration plan)
  - 2 diagramas Mermaid em Docs/architecture/diagrams/coach-ai-3.1/
    - anthropicClient-sequence.mermaid (callReportLlm flow + retry + fallback)
    - email-shell-migration.mermaid (shell + 3 templates contract)
```
