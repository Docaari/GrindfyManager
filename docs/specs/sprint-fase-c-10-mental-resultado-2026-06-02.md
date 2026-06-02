# Spec: Fase C #10 — Insight Mental ↔ Resultado (sinais mentais × P&L)

## Status
Proposta

## Resumo
Cruza sinais MENTAIS já capturados (tilt tipado, foco/energia da sessão, A-game vs B/C-game)
com o RESULTADO (P&L em USD) das sessões de grind, gerando insights acionáveis do tipo
"quando você tilta do tipo X, seu resultado médio cai para Y". Read-only, agregação pura,
exibido na aba **Mental** do perfil. Para jogadores MTT que querem ver se o estado mental
realmente correlaciona com performance — hoje os sinais mentais existem mas **não** são
cruzados com resultado.

## Contexto
Board ICE 7.0. Âncora do curso: **D1** (taxonomia de tilt — folk model, nota epistêmica
de honestidade estatística) + **C2** (processo vs resultado; não confundir variância com tilt).

Sequência Fase C: #4 tilt tipado (SHIPPED — `getTiltTypeDistribution`, aba Mental) → #10
(este sprint) cruza esses sinais com P&L. É a peça que transforma a captura mental
(já existente, isolada) em **insight de performance**.

**Por que agora:** os 4 sinais mentais já estão capturados e expostos como distribuições
isoladas na aba Mental (Fase B + Fase C #4). O gap é não cruzá-los com o que importa para o
jogador profissional: o dinheiro. Este sprint fecha esse loop sem capturar nada novo.

**Restrição de honestidade (não-negociável — curso D1 + lesson #11):** com amostra pequena,
correlação é ruído. A spec exige `dataSufficiency` por bucket e degradação graciosa.
NÃO inventar significância estatística (sem p-value, sem "correlação forte"); apenas
mostrar média/mediana por bucket vs baseline, com aviso explícito de amostra.

## Usuários
- **Jogador MTT (Trial/Pro/Premium/Admin)**: abre a aba Mental do perfil, escolhe o período
  (7d/30d/90d) e lê os cards de cruzamento mental×P&L para guiar ajuste de rotina.
- **NÃO há tier gate** (paridade com os widgets Fase B/#4 da aba Mental, que não gateiam leitura).

---

## Decisões de Produto (TRAVADAS)

| # | Decisão | Escolha travada | Justificativa |
|---|---------|-----------------|---------------|
| D1 | Fonte de P&L por sessão | **`grind_sessions.profit`** (decimal, tratado como USD-equivalente em prod — ver §"Fonte de P&L") | Já é o número de P&L por sessão usado por `getVarianceVsExpected`/`getCooldownImpactMetrics`. Evita re-agregar `session_tournaments` (que NÃO tem coluna `currency`). FX→USD via `fxResolver` quando o mock/registro trouxer `currency`/`pnlNative`. |
| D2 | Quais cruzamentos | **3 cards** (RF-01/02/03): (a) tilt type × P&L, (b) foco da sessão × P&L, (c) A-game vs B/C-game × P&L | Os 3 mais acionáveis e com join limpo (todos por `grind_sessions.id`). |
| D3 | Métrica honesta | média **e** mediana de P&L por bucket vs baseline geral; `dataSufficiency:"low"` quando N_bucket < `MIN_SESSIONS_PER_BUCKET=4`. SEM p-value/significância. | Lesson #11 + nota epistêmica D1. Amostra pequena → "colete mais", não fabrica correlação. |
| D4 | Apresentação | aba **Mental** do perfil (`MentalAnalyticsTab`), 1 card por insight, 1 endpoint por insight (espelha o padrão Fase B/#4). | Lugar natural; sem dashboard novo. |
| D5 | PII | texto livre (`tiltSelfAssessment.action`, `break_feedbacks.notes`, `abGameAnswers.cGame/lesson`) **NUNCA** lido para a agregação/resposta. Só enums, números e buckets. | Lesson Fase B R5 / PII-safe. |
| D6 | Migration | **Nenhuma**. Tudo já capturado. Read-only puro, sem schema novo. | Confirmado: `grind_sessions`, `cooldown_logs`, `break_feedbacks` já existem com todos os campos. |
| D7 | Período | reusa `resolvePeriod` (7d/30d/90d, default 30d) e `setCacheHeader` (`private, max-age=300`). | Paridade com `cooldownAnalytics.ts`. |
| D8 | Janela temporal | corte por `grind_sessions.date >= cutoff` (mesma regra de `countCompletedSessionsInPeriod`/§6.1), status `'completed'`. | Sinal mental é por sessão de grind; usa o mesmo recorte dos widgets vizinhos. |
| D9 | Baseline | P&L médio/mediano de **todas** as sessões completed elegíveis do período (mesmo conjunto de sessões usado nos buckets), independente do sinal. | Cada bucket é comparado contra o conjunto total para isolar o efeito do sinal. |

### Deferido (marcar para o architect / fora deste sprint)
- **Significância estatística** (intervalo de confiança, t-test, shrinkage): fora. Só média/mediana + N. Pode virar Fase C #10.1 se founder pedir.
- **Cruzamento com `session_tournaments` por torneio** (P&L por buy-in dentro da sessão × estado): fora. Granularidade de sessão basta.
- **Tilt × resultado do PRÓXIMO torneio** (efeito de arrasto intra-sessão): fora.
- **Warm-up compliance × P&L**: fora deste sprint (warm-up é lead measure de processo; o cruzamento de processo×resultado já existe parcial em `cooldown-impact`). Documentar como candidato #10.1.
- **Insight em texto via LLM**: fora. Cards determinísticos.

---

## Fonte de P&L (REGRA CRÍTICA — confirmada no código de `B:/grindfy-fc10`)

> Confirmação CLAUDE.md §6.1: P&L por sessão NÃO usa o histórico `tournaments` (dashboard/analytics).
> O sinal mental é por sessão de grind ao vivo, então o cruzamento usa o nível de sessão.

**Decisão (D1): usar `grind_sessions.profit`.** Achados que justificam:
- `grind_sessions` tem colunas de nível de sessão: `profit` (decimal), `roi` (decimal),
  `walletProfitUsd` (reconciliação de banca), e agregados mentais já calculados
  (`focoMedio`, `energiaMedia`, `confiancaMedia`, `inteligenciaEmocionalMedia`, `interferenciasMedia`).
- `session_tournaments` **NÃO tem coluna `currency`** (verificado em `shared/schema.ts:712`).
  Re-agregar P&L por torneio exigiria resolver a moeda por contexto de sessão/wallet — risco
  alto e fora de escopo. Por isso o cruzamento usa o P&L já consolidado da sessão.
- Precedente exato: `getVarianceVsExpected` (`storage.ts:13259`) trata `row.profit` como
  USD-equivalente em prod e aplica FX só quando o registro/mocks trazem `currency`/`pnlNative`:
  `Number(row?.pnlNative ?? row?.profit ?? row?.profitLoss ?? 0)` + `convertToUSD(pnlNative, currency, fxRates)`
  com `fxResolver` (`FALLBACK_FX_RATES`, `resolveExchangeRates`, `convertToUSD`).

**Contrato de P&L USD por sessão (helper compartilhado — RF-05):**
1. `pnlNative = Number(row.pnlNative ?? row.profit ?? row.profitLoss ?? 0)`.
2. `currency = String(row.currency ?? row.siteCurrency ?? 'USD')`.
3. `pnlUsd = convertToUSD(pnlNative, currency, fxRates)`; se `!Number.isFinite(pnlUsd)` → `0`
   (lesson #6 — FX→USD antes de comparar; lesson #9 — log antes do fallback quando `resolveExchangeRates` falha).
4. `fxRates` resolvido 1× por request (`resolveExchangeRates(userId)`, fallback `FALLBACK_FX_RATES`).

**Join mental → sessão:**
- `cooldown_logs.sessionId` → FK NOT NULL para `grind_sessions.id`, UNIQUE `(userId, sessionId)`
  (1 cooldown por sessão). Tilt e A/B/C-game vivem em `cooldown_logs`.
- `break_feedbacks.sessionId` → `grind_sessions.id` (N breaks por sessão). Foco/energia/etc 0-10.
  Atalho: `grind_sessions.focoMedio` já é a média dos breaks da sessão — usar quando presente;
  senão agregar de `break_feedbacks` (RF-02 §método).

---

## Requisitos Funcionais

### RF-01: Insight "Tilt × Resultado"
**Descrição:** Para cada tipo de tilt registrado no período, mostra o P&L USD médio/mediano das
sessões em que o jogador tiltou daquele tipo, comparado ao baseline geral do período.

**Regras de negócio:**
- Endpoint `GET /api/analytics/mental-result/tilt?period=7d|30d|90d`.
- Conjunto base = `grind_sessions` do user, `status='completed'`, `date >= cutoff`.
- P&L USD por sessão via helper RF-05.
- Para cada sessão, achar o `cooldown_logs` da sessão (join por `sessionId`, `completedAt != null`).
  Bucket da sessão = `tiltSelfAssessment.tiltType` **quando** explícito, válido (`isValidTiltType`)
  E houve tilt declarado (`feltTilt > 0 || keptTilting > 0`). Senão a sessão NÃO entra em nenhum
  bucket de tilt (mas entra no baseline).
- 1 sessão → no máximo 1 bucket de tilt (UNIQUE garante 1 cooldown/sessão; D-4 Fase C #4: só
  `tiltType` explícito, sem heurística para legados).
- Por bucket: `n` (sessões), `avgPnlUsd`, `medianPnlUsd`, `deltaVsBaseline = avgPnlUsd - baseline.avgPnlUsd`,
  `dataSufficiency` (`"low"` se `n < MIN_SESSIONS_PER_BUCKET`).
- Baseline = todas as sessões do conjunto base com P&L USD (`avgPnlUsd`, `medianPnlUsd`, `n`).
- Ordenação: bucket por `deltaVsBaseline` ascendente (pior primeiro — o tilt mais caro no topo);
  desempate por `tiltType` asc (determinístico — lesson #8/estável).
- `dataSufficiency` agregado da resposta = `"low"` quando baseline.n < `MIN_SESSIONS_OVERALL=8`.

**Critério de aceitação:**
- [ ] Endpoint retorna `{ period, baseline, buckets[], dataSufficiency }` (contrato §"Contrato de saída").
- [ ] Sessão com cooldown sem `tiltType` explícito conta no baseline mas em nenhum bucket.
- [ ] `deltaVsBaseline` = `bucket.avgPnlUsd - baseline.avgPnlUsd` com FX→USD aplicado.
- [ ] Bucket com `n < 4` traz `dataSufficiency:"low"`.
- [ ] `action`/`notes` jamais aparecem na resposta (só enums/números).

---

### RF-02: Insight "Foco da Sessão × Resultado"
**Descrição:** Agrupa sessões por faixa de foco médio e mostra P&L USD médio/mediano por faixa vs baseline.

**Regras de negócio:**
- Endpoint `GET /api/analytics/mental-result/focus?period=...`.
- Conjunto base idem RF-01.
- Foco da sessão: `Number(grind_sessions.focoMedio)` quando presente e finito; senão média dos
  `break_feedbacks.foco` (0-10) da sessão via `getBreakFeedbacksBySessionIds`. Sessão sem
  nenhum dado de foco → fora dos buckets (mas no baseline).
- **Buckets de foco (3 faixas fixas, 0-10):** `baixo` (foco < 5), `medio` (5 ≤ foco < 7.5),
  `alto` (foco ≥ 7.5). Faixas como constante nomeada `FOCUS_BUCKETS` (literais, não inventar limiares fora disto).
- Por bucket: `n`, `avgPnlUsd`, `medianPnlUsd`, `deltaVsBaseline`, `dataSufficiency`.
- Ordenação dos buckets: ordem fixa `alto`, `medio`, `baixo` (leitura "quanto melhor o foco, melhor o resultado").
- Não copiar `break_feedbacks.notes` (PII — D5).

**Critério de aceitação:**
- [ ] 3 buckets sempre presentes na resposta na ordem fixa (mesmo com `n=0` em algum, `avgPnlUsd=null`, `dataSufficiency:"low"`).
- [ ] Usa `focoMedio` quando finito; cai para média de `break_feedbacks.foco` quando ausente.
- [ ] Sessão sem foco algum não entra em nenhum bucket mas conta no baseline.
- [ ] FX→USD aplicado; baseline = mesmo conjunto base.

---

### RF-03: Insight "A-game vs B/C-game × Resultado"
**Descrição:** Compara P&L USD das sessões em que o jogador classificou o journal predominante
como A-game vs B/C-game.

**Regras de negócio:**
- Endpoint `GET /api/analytics/mental-result/abgame?period=...`.
- Conjunto base idem RF-01; join via `cooldown_logs.abGameAnswers` (`completedAt != null`).
- **Classificação da sessão (2 buckets):**
  - Contar itens não-vazios em `abGameAnswers.aGame` (`aCount`) e `abGameAnswers.bGame` (`bCount`),
    e presença de `cGame` não-vazio (`hasC`). Reusar a lógica de contagem de `getAbGameDistribution`
    (itens string não-vazios; arrays não-array → 0, lesson #11).
  - Bucket `a_dominant` quando `aCount > bCount && aCount > 0 && !hasC` (sessão limpa, A-game predominante).
  - Bucket `bc_present` quando `bCount > 0 || hasC` (houve B-game e/ou C-game registrado).
  - Sessão com journal vazio (sem a/b/c/lesson) → fora dos buckets (no baseline).
  - Se uma sessão se qualificar para ambos os critérios, **`bc_present` vence** (sinal de risco
    domina — conservador; documentar para test-writer).
- Por bucket: `n`, `avgPnlUsd`, `medianPnlUsd`, `deltaVsBaseline`, `dataSufficiency`.
- Ordenação fixa: `a_dominant`, `bc_present`.
- `cGame`/`lesson` (texto) NÃO entram na resposta (D5).

**Critério de aceitação:**
- [ ] 2 buckets sempre presentes na ordem fixa.
- [ ] Sessão com `bCount>0` E `aCount>bCount` cai em `bc_present` (regra de prioridade).
- [ ] Journal vazio não bucketiza; conta no baseline.
- [ ] Sem texto livre na resposta.

---

### RF-04: Superfície UI — cards na aba Mental
**Descrição:** Renderiza 3 cards novos em `MentalAnalyticsTab.tsx`, um por insight, reagindo ao
seletor de período existente (7d/30d/90d).

**Regras de negócio:**
- 3 `useQuery` novos (queryKeys `["mental-analytics","mental-result-tilt"|"...-focus"|"...-abgame", period]`),
  via `apiRequest("GET", ...)` (lesson #13 — `apiRequest` já retorna JSON).
- Cada card:
  - Título claro + lista de buckets com `label` (PT-BR), `n`, `avgPnlUsd` formatado USD, e delta
    vs baseline (verde positivo / vermelho negativo).
  - Para tilt, `label` vem de `getTiltType(tiltType).label`.
  - Estado de loading (`Skeleton`), erro (mensagem PT-BR + `data-testid` de erro), vazio
    (`baseline.n === 0` → "Sem sessões com P&L nesse período. Registre sessões para gerar o insight.").
  - Quando `dataSufficiency === "low"` (agregado ou por bucket), mostra aviso
    "Amostra pequena, continue registrando." (sem fabricar conclusão — lesson #11).
- `data-testid` estáveis (lesson #2): `mental-result-tilt`, `mental-result-focus`,
  `mental-result-abgame` + `-error` + `-empty` variantes.
- Hooks antes de qualquer early return (lesson #1). Erros entram no agregado `anyError` existente.

**Critério de aceitação:**
- [ ] 3 cards renderizam com `data-testid` estáveis.
- [ ] Mudar período refaz as 3 queries.
- [ ] Empty/loading/erro/low-sample cobertos sem fabricar números.
- [ ] Delta positivo verde, negativo vermelho.

---

### RF-05: Helper compartilhado de P&L USD por sessão
**Descrição:** Função pura/utilitária reusada pelos 3 endpoints para normalizar P&L de uma sessão para USD.

**Regras de negócio:**
- Recebe lista de rows de `grind_sessions` + `fxRates` resolvido; devolve `Array<{ sessionId, pnlUsd }>`.
- Aplica o contrato de §"Fonte de P&L" (pnlNative ?? profit ?? profitLoss; currency ?? siteCurrency ?? 'USD';
  `convertToUSD`; `!Number.isFinite → 0`).
- `resolveExchangeRates(userId)` chamado 1× por request com try/catch (log antes do fallback — lesson #9).
- Helpers de estatística puros: `mean(nums)`, `median(nums)` (mediana = média dos 2 centrais em N par),
  `bucketStats(pnlList)` → `{ n, avgPnlUsd, medianPnlUsd, dataSufficiency }` (`avgPnlUsd`/`medianPnlUsd`
  = `null` quando `n===0`; `dataSufficiency:"low"` quando `n < MIN_SESSIONS_PER_BUCKET`).

**Critério de aceitação:**
- [ ] FX→USD correto (não-USD com cotação ausente cai no fallback nativo→USD, logado).
- [ ] `median` correto para N par e ímpar.
- [ ] `bucketStats` com `n=0` retorna `avgPnlUsd:null, medianPnlUsd:null, dataSufficiency:"low"`.

---

## Requisitos Não-Funcionais
- **Performance:** cada endpoint faz no máximo 3 queries (sessões + cooldown_logs do conjunto + opcional break_feedbacks); agregação em JS. Cache `private, max-age=300`. Sem N+1: buscar cooldown_logs/break_feedbacks por `sessionIds` em batch (`getBreakFeedbacksBySessionIds`).
- **Segurança:** `requireAuth` + ownership por `userId` em TODA query (`eq(...userId)`). 401 sem user.
- **Honestidade estatística:** nenhuma resposta afirma significância; só médias/medianas + `n` + `dataSufficiency`.
- **PII:** zero texto livre na resposta (auditável — só números/enums/buckets).
- **Disponibilidade:** FX indisponível → fallback nativo→USD (lesson #6/#9), nunca 500 por falta de cotação.

---

## Endpoints Previstos
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | /api/analytics/mental-result/tilt | RF-01 — tilt type × P&L | JWT |
| GET | /api/analytics/mental-result/focus | RF-02 — foco da sessão × P&L | JWT |
| GET | /api/analytics/mental-result/abgame | RF-03 — A-game vs B/C-game × P&L | JWT |

Registrados em `server/routes/cooldownAnalytics.ts` via `registerCooldownAnalyticsRoutes`,
seguindo o padrão `handleX(req,res)` + `userIdOf`/`resolvePeriod`/`setCacheHeader` + try/catch
com `console.error` (lesson #9). Storage methods novos: `getTiltVsResult`, `getFocusVsResult`,
`getAbGameVsResult` (read-only, espelham `getTiltTypeDistribution`/`getAbGameDistribution`).

---

## Modelos de Dados Afetados
**Nenhum.** Read-only puro. SEM migration (D6). Tabelas lidas (já existentes):

| Tabela | Campos lidos | Papel |
|---|---|---|
| grind_sessions | `id`, `userId`, `status`, `date`, `profit` (+ `pnlNative`/`currency`/`siteCurrency` via mocks), `focoMedio` | P&L USD por sessão + foco agregado |
| cooldown_logs | `sessionId`, `completedAt`, `tiltSelfAssessment` (feltTilt/keptTilting/tiltType), `abGameAnswers` (aGame/bGame/cGame) | Bucket tilt + A/B/C-game |
| break_feedbacks | `sessionId`, `foco` (0-10) | Foco fallback quando `focoMedio` ausente |

**Tipos novos (shared ou server `storage.ts` interface, paridade com `TiltTypeDistribution`):**
```ts
interface BucketStat {
  n: number;
  avgPnlUsd: number | null;
  medianPnlUsd: number | null;
  dataSufficiency: "ok" | "low";
}
interface MentalResultResponse<K extends string> {
  period: "7d" | "30d" | "90d";
  baseline: BucketStat;                 // todas as sessões com P&L do período
  buckets: Array<BucketStat & { key: K; deltaVsBaseline: number | null }>;
  dataSufficiency: "ok" | "low";        // "low" quando baseline.n < MIN_SESSIONS_OVERALL
}
// tilt:   K = TiltTypeId
// focus:  K = "alto" | "medio" | "baixo"
// abgame: K = "a_dominant" | "bc_present"
```
`deltaVsBaseline = bucket.avgPnlUsd - baseline.avgPnlUsd` (ou `null` se algum lado `null`).

**Constantes nomeadas:** `MIN_SESSIONS_PER_BUCKET = 4`, `MIN_SESSIONS_OVERALL = 8`,
`FOCUS_BUCKETS = [{key:'alto',min:7.5},{key:'medio',min:5},{key:'baixo',min:0}]`.

---

## Integrações Externas
| Serviço | Propósito | Quando |
|---|---|---|
| `server/services/fxResolver` | `convertToUSD` / `resolveExchangeRates` / `FALLBACK_FX_RATES` | Normalizar P&L nativo→USD por request |

Nenhuma API externa nova. `fxResolver` já é o resolvedor canônico (ADR-163).

---

## Cenários de Teste Derivados

### Happy Path
- [ ] RF-01: 10 sessões completed, 3 tiltaram `injustice` (P&L médio -$40) vs baseline (-$5) → bucket `injustice` no topo (delta -$35), `dataSufficiency:"ok"` (n=3 < 4 → na verdade "low"; usar n≥4 no fixture happy).
- [ ] RF-02: sessões com `focoMedio` alto rendem mais que baixo → 3 buckets com deltas coerentes.
- [ ] RF-03: sessões `a_dominant` com P&L > `bc_present` → delta positivo em a_dominant.
- [ ] RF-04: 3 cards renderizam com labels PT-BR e deltas coloridos.

### Validação de Input
- [ ] `period` inválido (`?period=1y`) → 400 com mensagem PT-BR (reusa `resolvePeriod`).
- [ ] sem `period` → default 30d.
- [ ] sem auth → 401.

### Regras de Negócio
- [ ] Sessão com cooldown sem `tiltType` explícito → conta no baseline, fora de bucket de tilt (RF-01).
- [ ] Sessão com `feltTilt=0 && keptTilting=0` → não vira bucket de tilt (sem tilt declarado).
- [ ] RF-03 prioridade: sessão `aCount=3, bCount=1` → `bc_present` (B-game presente domina).
- [ ] `deltaVsBaseline` calculado em USD após FX (não em nativo).
- [ ] Foco usa `focoMedio` quando finito; senão média de `break_feedbacks.foco`.

### Edge Cases (para o test-writer)
- [ ] **Amostra pequena:** baseline.n=2 → `dataSufficiency:"low"` no agregado; cards mostram "Amostra pequena".
- [ ] **Bucket abaixo do mínimo:** bucket com n=2 → `dataSufficiency:"low"` no bucket, sem suprimir o card.
- [ ] **FX ausente:** sessão `currency='BRL'` sem cotação → fallback nativo→USD com `console.warn` (lesson #9), nunca 500.
- [ ] **Sessão sem mental:** sessão completed sem cooldown_log e sem break_feedbacks → só no baseline, em nenhum bucket dos 3 insights.
- [ ] **Sessão sem P&L:** `profit=null`/`profitLoss=null` → `pnlUsd=0` (não derruba a média com NaN); entra no conjunto com 0.
- [ ] **Empate no baseline / delta zero:** `avgPnlUsd === baseline.avgPnlUsd` → `deltaVsBaseline=0` (não null).
- [ ] **N par na mediana:** 4 valores → média dos 2 centrais.
- [ ] **`abGameAnswers.aGame` não-array** (lixo) → conta 0 itens (lesson #11), não quebra.
- [ ] **Período sem nenhuma sessão completed:** `baseline.n=0`, `avgPnlUsd:null`, todos buckets vazios, `dataSufficiency:"low"`; UI mostra empty state.
- [ ] **`focoMedio` = "0"** (string decimal válida, foco real baixo) → bucketiza em `baixo` (não confundir com ausente; ausente = `null`/não-finito).
- [ ] **Determinismo de ordenação:** dois tilt types com mesmo `deltaVsBaseline` → desempate por `tiltType` asc.
- [ ] **Ownership:** sessões de outro user nunca entram (toda query com `eq(userId)`).

### Mock-shape (lesson #3 — 3 bugs CRITICAL passaram por mock idealizado)
- [ ] Mocks de `grind_sessions` rows usam o shape REAL: `profit` é `decimal` (string em prod, ex `"-40.00"`); o helper faz `Number(...)`.
- [ ] Mocks de `cooldown_logs` trazem `tiltSelfAssessment` como objeto jsonb com `feltTilt`/`keptTilting`/`tiltType` (não inventar campos).
- [ ] Mock de `convertToUSD`/`resolveExchangeRates` retorna o shape `{ rates: Record<string,number> }` (igual `getVarianceVsExpected`).

---

## Fora de Escopo
- Captura de QUALQUER sinal novo (read-only puro).
- Dashboard novo / nova página (só cards na aba Mental existente).
- Fase C #4 tilt tipado (já SHIPPED — este sprint só consome `tiltType`).
- Stop-loss / regras de banca (#5 Fase D).
- Motor de aderência (Fase A — já shipado, não tocado).
- Significância estatística (p-value, IC, t-test, shrinkage) — deferido #10.1.
- Cruzamento por torneio (`session_tournaments` granular) — granularidade de sessão basta.
- Insight em texto via LLM.
- Warm-up compliance × P&L — candidato #10.1.

## Dependências
- Fase C #4 (`getTiltTypeDistribution`, `tiltSelfAssessment.tiltType`, `getTiltType`/`isValidTiltType`) — SHIPPED nesta worktree.
- Fase B (`getAbGameDistribution`, padrão de contagem de itens A/B/C) — SHIPPED.
- `server/services/fxResolver` (`convertToUSD`/`resolveExchangeRates`/`FALLBACK_FX_RATES`) — existente (ADR-163).
- `storage.getBreakFeedbacksBySessionIds` — existente.
- `MentalAnalyticsTab.tsx` — existente (aba Mental).

## Notas de Implementação (para o architect / implementer)
- Pipeline TDD: spec → **system-architect** (ADR-233 + diagrama de sequência) → test-writer → implementer → /simplify → reviewer.
- **Próximo ADR livre: 233** (232 = Fase C #4).
- Reusar literalmente `userIdOf`/`resolvePeriod`/`setCacheHeader`/`VALID_PERIODS` de `cooldownAnalytics.ts` (não duplicar).
- Storage methods read-only espelhando `getTiltTypeDistribution`: 1 scan de `grind_sessions` (conjunto base), 1 scan de `cooldown_logs` por `sessionIds`, 1 scan opcional de `break_feedbacks` por `sessionIds`. Agregação em JS.
- Padrão Fase B (D-B2): rotas importam `storage` e testam via `vi.mock('../storage')` — **não** `injectedStorage` (paridade `cooldownAnalytics.ts`, não lesson #34).
- Lessons obrigatórias: #3 (validar shape real do storage antes de mockar), #6 (FX→USD antes de comparar), #9 (log antes do fallback), #11 (não fabricar dado de array-lixo/significância), #8 (testar presença de bucket, não `length` absoluta), #1 (hooks antes de early return), #2/#13 (data-testid + `apiRequest` retorna JSON).
- **Verify browser é parte do "done":** após green + review, abrir a aba Mental no app e confirmar os 3 cards renderizando com dados reais (loading/empty/low-sample/erro). Sinalizar pendência de verify até feito (extensão de browser pode estar off).
