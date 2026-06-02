# ADR-233: Fase C #10 — Cruzar sinais mentais com resultado (mental × P&L)

## Status
Aceito

## Data
2026-06-02

## Contexto

Fase C #4 (ADR-232) shipou a captura/exibição dos sinais mentais como **distribuições
isoladas** na aba Mental (`MentalAnalyticsTab`): tilt tipado (`getTiltTypeDistribution`),
A/B/C-game (`getAbGameDistribution`, Fase B), foco/energia agregados. O dado existe mas
**nunca foi cruzado com o resultado financeiro** — o jogador não consegue ver se o estado
mental correlaciona com o P&L.

A spec (`Docs/specs/sprint-fase-c-10-mental-resultado-2026-06-02.md`) trava 3 cruzamentos
read-only por sessão de grind: tilt × P&L (RF-01), foco × P&L (RF-02), A-game vs B/C-game ×
P&L (RF-03). Cada um compara buckets contra um baseline geral do período, com média **e**
mediana, N por bucket e `dataSufficiency` — **sem** p-value, IC ou afirmação de significância
(curso D1 nota epistêmica + lesson #11: amostra pequena é ruído, não correlação).

### Forças em jogo
- **Fonte de P&L:** `grind_sessions.profit` é o número de P&L por sessão já usado por
  `getVarianceVsExpected` (`storage.ts:13263`). `session_tournaments` **não tem coluna
  `currency`** (`schema.ts:712`), então re-agregar por torneio exigiria resolver moeda por
  contexto — risco alto, fora de escopo. CLAUDE.md §6.1: o sinal mental é por sessão de grind
  ao vivo → o cruzamento usa o nível de sessão (não o histórico `tournaments`).
- **FX → USD:** `convertToUSD`/`resolveExchangeRates`/`FALLBACK_FX_RATES` em
  `server/services/fxResolver.ts` (ADR-163). `getVarianceVsExpected` resolve FX 1× por request
  com try/catch (log antes do fallback — lesson #9) e trata `row.profit` como USD-equiv,
  aplicando FX só quando `currency`/`pnlNative` aparecem (via mocks; o schema real de
  `grind_sessions` não tem essas colunas).
- **Pureza testável:** `server/coach/leaks/detectLeaks.ts` (ADR-231) é o precedente canônico —
  helper puro, sem `drizzle-orm`/`@shared/schema`/`storage`/`db`, sem `new Date()`, recebe os
  conjuntos já lidos. Isso isolou bugs e evitou mock idealizado (lesson #3/#36).
- **Honestidade:** os widgets vizinhos já carregam `dataSufficiency:"ok"|"low"` e degradam
  graciosamente; este sprint mantém paridade.

## Opções Consideradas

### D-1: Quantos métodos/endpoints

#### Opção 1A: 1 método `getMentalResultInsights(userId, period)` retornando os 3 cruzamentos
- **Prós:** 1 scan de `grind_sessions` + 1 de `cooldown_logs` + (opcional) 1 de `break_feedbacks`
  por request — FX resolvido 1× — reaproveita o array de P&L USD por sessão entre os 3 buckets-sets.
  Mais barato; menos round-trips; 1 superfície de teste de storage.
- **Contras:** divergência da spec (que lista 3 endpoints/3 métodos); resposta maior; quebra a
  paridade literal de "1 endpoint por insight" da Fase B/#4. O cliente teria de pegar tudo de uma vez.

#### Opção 1B: 3 métodos + 3 endpoints (espelho literal Fase B/#4)
- **Prós:** paridade exata com `cooldownAnalytics.ts` (1 handler/1 método por widget); cada `useQuery`
  bate seu endpoint; cache independente por insight; menor blast radius por mudança.
- **Contras:** 3× o I/O (cada endpoint re-scaneia `grind_sessions` + re-resolve FX); duplicação do
  conjunto base e do helper de P&L em cada chamada. Em 90d, 3 scans redundantes.

### D-2: Como ligar mental → sessão → P&L
- `cooldown_logs.sessionId` (FK NOT NULL → `grind_sessions.id`, UNIQUE `(userId, sessionId)`):
  tilt e A/B/C-game. 1 cooldown/sessão garantido pelo UNIQUE → 1 sessão entra em no máx. 1 bucket.
- `break_feedbacks.sessionId` (N por sessão) + `foco` (integer 0-10): fallback de foco quando
  `grind_sessions.focoMedio` (decimal, média dos breaks) é ausente/não-finito.
- Conjunto base: `grind_sessions` `eq(userId)` + `status='completed'` + `gte(date, cutoff)` —
  exatamente o recorte de `countCompletedSessionsInPeriod` (D8 da spec; difere do recorte de
  `getTiltTypeDistribution`, que filtra por `cooldownLogs.startedAt` — aqui o conjunto é
  ancorado na **sessão**, porque o P&L é por sessão).

### D-3: Fronteira FX
- Opção: helper puro chama `convertToUSD` internamente → arrastaria `fxResolver` pro módulo puro,
  quebrando o isolamento (lesson #36).
- Opção (escolhida): o **storage** resolve `fxRates` 1× (try/catch + log antes do fallback —
  lesson #9), converte cada sessão para USD (lesson #6 — FX antes de comparar com thresholds USD)
  e passa `Array<{ sessionId, pnlUsd, focusValue, tiltType|null, abGameBucket|null }>` pré-computado
  ao helper puro. O helper só faz buckets/média/mediana/delta/`dataSufficiency`.

### D-4: Helper puro isolado
- Opção (escolhida): módulo `server/coach/mental/mentalResultInsights.ts` (paridade
  `server/coach/leaks/`) sem `drizzle-orm`/`@shared/schema`/`storage`/`db`, sem `new Date()`.
  Importa só catálogos puros (`shared/tilt-types` para validação, se preciso) e constantes locais.

### D-5: Rota
- Opção (escolhida): reusar `server/routes/cooldownAnalytics.ts` (`userIdOf`/`resolvePeriod`/
  `setCacheHeader`/`VALID_PERIODS`), padrão `vi.mock('../storage')` (Fase B D-B2, **não** `injectedStorage`).

### D-6: UI
- Opção: 1 card consolidado vs 3 cards (espelho dos widgets existentes).

### D-7: Mediana/empate/vazio
- Convenções de borda para média/mediana/delta.

## Decisão

| # | Decisão |
|---|---------|
| **D-1** | **1 método de storage `getMentalResultInsights(userId, period)` que retorna os 3 cruzamentos juntos** (1 scan de sessões + 1 de cooldown_logs + 1 opcional de break_feedbacks, FX 1×) **+ 3 endpoints finos** que selecionam o sub-bloco da resposta. Compromisso entre 1A (custo) e 1B (paridade de superfície): o I/O barato da 1A com a granularidade de endpoint da 1B. Os 3 handlers chamam o mesmo método e devolvem `result.tilt` / `result.focus` / `result.abgame`. Caching `private, max-age=300` por endpoint cobre a redundância de chamada repetida no mesmo período. |
| **D-2** | Conjunto base = `grind_sessions` `eq(userId)` + `status='completed'` + `gte(date, cutoff)` (paridade `countCompletedSessionsInPeriod`). 1 scan. Buscar `cooldown_logs` por `inArray(sessionId, baseSessionIds)` + `eq(userId)` (tilt + abGame). Para foco: usar `grind_sessions.focoMedio` quando finito; senão `getBreakFeedbacksBySessionIds(userId, sessionIds)` e média de `foco`. Lookup por `Map<sessionId, ...>`. Join em JS (sem N+1). |
| **D-3** | **Storage resolve FX e converte para USD antes de chamar o helper.** `fxRates = resolveExchangeRates(userId)` (try/catch + `console.warn` antes do fallback `FALLBACK_FX_RATES` — lesson #9); `pnlUsd = convertToUSD(Number(pnlNative ?? profit ?? profitLoss ?? 0), currency ?? siteCurrency ?? 'USD', fxRates)`, `!Number.isFinite → 0`. Helper recebe P&L já em USD → permanece puro/determinístico. |
| **D-4** | **Confirmada a separação:** helper puro em `server/coach/mental/mentalResultInsights.ts` (sem drizzle/schema/storage/db, sem `new Date()`), recebe as linhas de sessão já normalizadas. Storage faz I/O + FX + monta o input do helper + chama. Paridade `server/coach/leaks/detectLeaks.ts`. |
| **D-5** | **3 endpoints aninhados** em `cooldownAnalytics.ts`: `GET /api/analytics/mental-result/tilt|focus|abgame?period=`. São rotas estáticas (sem path param) — **sem colisão** com as rotas existentes independente da ordem (Express 4 casa estáticas exatas). Registrados em `registerCooldownAnalyticsRoutes`. |
| **D-6** | **3 cards** na `MentalAnalyticsTab` (paridade visual com os 6 widgets existentes), via 3 `useQuery` (1 por endpoint), `data-testid` estáveis. Degradação graciosa loading/erro/empty/low-sample. |
| **D-7** | `mean([]) = null`/`median([]) = null` (refletido em `avgPnlUsd`/`medianPnlUsd` quando `n===0`); **mediana com N par = média dos 2 centrais**; `deltaVsBaseline = bucket.avgPnlUsd - baseline.avgPnlUsd`, **`0` quando iguais** (empate ≠ null), **`null`** só quando algum lado é `null` (bucket vazio ou baseline vazio); bucket vazio sempre presente na resposta com `n:0, avgPnlUsd:null, dataSufficiency:"low"`. |

### Contratos

```ts
// shared (ou server) — espelho de TiltTypeDistribution
interface BucketStat {
  n: number;
  avgPnlUsd: number | null;
  medianPnlUsd: number | null;
  dataSufficiency: "ok" | "low";        // "low" quando n < MIN_SESSIONS_PER_BUCKET (4)
}
interface MentalResultBuckets<K extends string> {
  period: "7d" | "30d" | "90d";
  baseline: BucketStat;                  // todas as sessões com P&L USD do período
  buckets: Array<BucketStat & { key: K; deltaVsBaseline: number | null }>;
  dataSufficiency: "ok" | "low";         // "low" quando baseline.n < MIN_SESSIONS_OVERALL (8)
}
// tilt:   K = TiltTypeId
// focus:  K = "alto" | "medio" | "baixo"
// abgame: K = "a_dominant" | "bc_present"

interface MentalResultInsights {
  tilt:   MentalResultBuckets<TiltTypeId>;
  focus:  MentalResultBuckets<"alto" | "medio" | "baixo">;
  abgame: MentalResultBuckets<"a_dominant" | "bc_present">;
}

// STORAGE — I/O + FX + orquestração
getMentalResultInsights(userId: string, period: "7d" | "30d" | "90d"): Promise<MentalResultInsights>;

// HELPER PURO — server/coach/mental/mentalResultInsights.ts (sem drizzle/schema/storage/db)
interface SessionPnlRow {
  sessionId: string;
  pnlUsd: number;                        // já convertido pelo storage (D-3)
  tiltType: TiltTypeId | null;           // null quando sem tilt declarado/válido
  focusValue: number | null;            // focoMedio finito OU média de break_feedbacks.foco; null se ausente
  abGameBucket: "a_dominant" | "bc_present" | null;  // null quando journal vazio
}
function buildMentalResultInsights(
  rows: SessionPnlRow[],
  period: "7d" | "30d" | "90d",
): MentalResultInsights;
// helpers puros internos: mean(nums)|null, median(nums)|null (N par = média dos 2 centrais),
// bucketStats(pnlList): BucketStat, deltaVs(bucketAvg, baselineAvg): number|null

// Constantes nomeadas (no helper):
const MIN_SESSIONS_PER_BUCKET = 4;
const MIN_SESSIONS_OVERALL = 8;
const FOCUS_BUCKETS = [
  { key: "alto",  min: 7.5 },
  { key: "medio", min: 5   },
  { key: "baixo", min: 0   },
] as const;
```

**Regras de bucketização (no storage, ao montar `SessionPnlRow`):**
- `tiltType`: do `cooldown_logs.tiltSelfAssessment` da sessão — só quando `isValidTiltType(tiltType)`
  E houve tilt declarado (`feltTilt>0 || keptTilting>0`); senão `null` (entra no baseline, em
  nenhum bucket de tilt). `action`/`triggers`/`notes` **nunca** lidos (D5/PII).
- `abGameBucket`: contar itens não-vazios de `aGame`/`bGame` (reusar lógica `countItems` de
  `getAbGameDistribution` — array não-array → 0, lesson #11) + presença de `cGame`/`lesson`.
  `bc_present` quando `bCount>0 || hasC`; `a_dominant` quando `aCount>bCount && aCount>0 && !hasC`;
  **`bc_present` vence** em conflito (sinal de risco domina). Journal vazio → `null`.
- `focusValue`: `Number(focoMedio)` quando finito; senão média de `break_feedbacks.foco`; senão `null`.
- `pnlUsd`: sempre presente (sessão sem P&L → `0`, não NaN).

**Ordenação:**
- tilt: buckets por `deltaVsBaseline` ascendente (pior/mais caro no topo); desempate `tiltType` asc.
  `null` de delta (sem baseline) ordena por `key` asc.
- focus: ordem fixa `alto`, `medio`, `baixo`.
- abgame: ordem fixa `a_dominant`, `bc_present`.

## Consequências

**Positivas:**
- 1 scan de sessões por request alimenta os 3 cruzamentos; FX resolvido 1× — barato.
- Helper puro isolado → testável sem mock de DB/FX, sem flakiness de `new Date()` (lesson #36).
- Honestidade estatística garantida por construção (só média/mediana + N + `dataSufficiency`).
- Zero migration; reaproveita rota, helpers de período, FX e `getBreakFeedbacksBySessionIds`.

**Negativas:**
- Divergência consciente da spec em D-1 (a spec sugere 3 métodos): mantemos 3 endpoints, mas 1
  método de storage. O test-writer deve testar o método único + os 3 handlers selecionando o sub-bloco.
- Resposta do método único é maior; os endpoints fatiam, mas o storage sempre computa os 3.
- P&L = `grind_sessions.profit` (USD-equiv) herda a imprecisão de moeda quando não há `currency`
  no registro real — aceito (precedente `getVarianceVsExpected`).

**Neutras:**
- Recorte por `grind_sessions.date` (não `cooldownLogs.startedAt`) difere dos widgets Fase C #4 —
  intencional (ancoragem na sessão, fonte do P&L).
- `session_tournaments` granular permanece fora (deferido #10.1, junto com p-value/IC/shrinkage,
  tilt × próximo torneio e warm-up × P&L).

## Confiança
Alta — leitura pura sobre dados já capturados, padrões (leaks/cooldownAnalytics/fxResolver)
confirmados no código desta worktree; sem schema novo; honestidade travada pela spec.
