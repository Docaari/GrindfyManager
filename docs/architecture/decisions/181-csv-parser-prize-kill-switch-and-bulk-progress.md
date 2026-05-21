# ADR-181: CSV parser `prize = NET` canonico via kill-switch `CSV_PARSER_NEW_PRIZE_SEMANTICS` + bulk-import progress via coluna nova `upload_history.processed_count`

## Status

Aceito

## Data

2026-05-21

## Sprint

Backend Tech-Debt Sweep (`Docs/specs/sprint-backend-sweep.md` — RF-01.01 prize semantics + RF-02 bulk progresso). Q-A..Q-N respondidas inline na spec (auto-mode 2026-05-21).

## Decision owner

system-architect — Q-B locked: kill-switch env flag (vs migration big-bang vs coluna boolean por row). Q-D + Q-K locked: coluna nova `processed_count` + polling 2s (vs reuso `tournaments_count`, vs Redis, vs SSE).

## Related

- **Depende de:** spec origem `fix-csv-parser.md` (8 problemas, problema 2 `parseDate` shipped) + `fix-bulk-import-performance.md` (RF-01..RF-04 shipped — batch dup check + `createTournamentsBatch` + indexes + multer 10MB; só RF-05 progresso aberto).
- **Reusa:** `server/csvParser.ts` (PokerCSVParser, 1737 LOC, 10 redes parseiam), `parseCSVWithDuplicateCheck` (batch dup check via `findExistingTournamentIds` + `findExistingTournamentsByFields`), `createTournamentsBatch` (batch 500/insert, ADR shipped UX-QW-2 era), `idx_upload_history_user_created` (migration 0064).
- **Sucessor de:** —. Primeiro ADR sweep tech-debt csvParser + bulk-import.
- **Diagramas:**
  - `Docs/architecture/diagrams/backend-sweep/csvparser-prize-flow.mermaid` — flowchart: CSV → parser detecta rede → branch IF `CSV_PARSER_NEW_PRIZE_SEMANTICS` THEN `prize = NET canonico via lookup table por rede` ELSE legacy. Dashboard branch idem.
  - `Docs/architecture/diagrams/backend-sweep/bulk-import-progress-sequence.mermaid` — sequence: Client → POST `/api/upload-history` (count > 5000) → INSERT `status='processing' processed_count=0` → 202 Accepted → background loop `createTournamentsBatch` + UPDATE `processed_count += 500` → Client polling `GET /api/upload-history/:id` (2s) → response `{status, processed_count, total}`.

---

## 1. Contexto

### 1.1 Prize semantics divergente entre redes (RF-01.01)

PokerStars CSV `Result` ja eh net profit (`-buyIn` ja descontado pela rede). GGPoker `Result` eh **gross winnings** (sem descontar buyIn). WPN/Party/Chico/Coin/iPoker/Bodog/888/Revolution variam (auditoria parcial — spec RF-01 lista hipoteses; founder autorizou Q-A deduzir das fixtures `tests/fixtures/test_*` existentes).

Codigo atual `ParsedTournament.prize` carrega o valor "Result" raw de cada rede sem normalizacao. Dashboard (`client/src/pages/Dashboard.tsx`, `DynamicCharts.tsx`) calcula `profit = prize - buyIn` universalmente — formula que ESTA CORRETA pra GGPoker mas DUPLICA o desconto pra PokerStars (resultando em `profit = -110` quando real eh `-55` num bust de $55).

200K+ rows ja no banco com `prize` calculado pela formula antiga (divergente por rede). Mudar `prize = NET canonico` quebra historico:

- **Opcao A (migration big-bang):** rewrite 200K+ rows aplicando formula nova por rede. Irreversivel sem snapshot. Risco: formula errada em rede X corrompe 50K rows sem caminho de volta.
- **Opcao B (coluna `prize_is_net` boolean por row):** schema mudanca + back-fill por rede. Branches em consumer (dashboard precisa `IF prize_is_net THEN profit = prize ELSE profit = prize - buyIn`). Permanente.
- **Opcao C (kill-switch env flag `CSV_PARSER_NEW_PRIZE_SEMANTICS`):** default `false` — rows novos shipam com semantica legacy ate flag virar `true`. Quando founder ativa, novos uploads usam canonico. Dados historicos NAO migrados ate founder rodar migration manual (spec separada futura). Reversivel (toggle flag); zero risco em prod ate ativacao deliberada.

### 1.2 Bulk-import progresso (RF-02)

`fix-bulk-import-performance.md` RF-05 pediu feedback de progresso pra uploads grandes (>5K torneios). Hoje upload de 18K torneios:

- Frontend faz POST `/api/upload-history` com CSV.
- Backend processa sincrono (batch insert 500/loop) — duration ~30-60s.
- Frontend trava em loading spinner sem dado nenhum ate response final.

Tres caminhos para feedback:

- **Opcao A (reuso `tournaments_count`):** coluna ja existe `integer DEFAULT 0`. Pode atualizar incrementalmente. Problema: campo semanticamente eh **count final** (display em `/upload-history`) — sobrescrever no meio mistura "em progresso" com "concluido". Ambiguo pra UI/queries existentes.
- **Opcao B (Redis pub/sub progresso):** infra nova. SSE/WebSocket por upload. Custo elevado pra UX-only feature.
- **Opcao C (coluna nova `processed_count integer DEFAULT 0 NOT NULL`):** distinta de `tournaments_count` (final). Update incremental durante batch. Polling `GET /api/upload-history/:id` cada 2s retorna `{status, processed_count, tournaments_count}`. Sem infra nova. Migration trivial (ALTER TABLE ADD COLUMN com default).

### Restricoes

- **Sem migration de dados historicos** — Q-B explicit. Kill-switch `false` default = prod permanece comportamento atual ate founder rodar migration manual de backfill (spec separada futura). Migration 0074 SO adiciona coluna em `upload_history` (RF-02), NAO toca `tournaments`.
- **Backward compat parser** — quando flag `false`, comportamento parser identico ao atual (zero regressao em uploads novos com rows legados no DB).
- **Frontend reuso** — `FilmagemUpload.tsx` + `AutoUpload.tsx` ganham polling logic; sem novo component. Timeout client 5min (150 polls × 2s = 300s).
- **Threshold async path:** `count > 5000` torneios → 202 Accepted + background. `count <= 5000` → sync path inalterado (regressao zero).
- **Polling vs SSE:** Q-K locked = polling. SSE adicionaria infra (express middleware + connection state) — custo nao justifica UX-only.
- **Indice `idx_upload_history_status`** — adicionado em migration 0074 pra polling read frequente (lookup por `status='processing'` em ticks de monitoramento futuros). `idx_upload_history_user_created` (migration 0064) ja cobre /upload-history list.
- **Rollback path 0074:** drop coluna + drop indice — reversivel.
- **Lessons criticas:**
  - **#9** (log antes do fallback): parser branch `CSV_PARSER_NEW_PRIZE_SEMANTICS=true` loga `csvParser.new_prize_semantics.applied` no upload — auditavel se founder reportar discrepancia. Background job loga `upload_history.batch_failed` antes de marcar `status='failed'`.
  - **#33** (JSONB array remove): nao aplica (sem mudanca em jsonb).
  - **#3** (mock shape real): test-writer audita shape REAL de `upload_history` row apos migration antes de mockar storage.
  - **#34** (`injectedStorage`): rotas POST `/api/upload-history` + GET `/api/upload-history/:id` aceitam `injectedStorage?` (terceiro arg) para testes — pattern AI-2A.
  - **#38** (test modificado com justificativa): testes de `csv-parser.test.ts` ganham casos `prize_semantics=new` separados; legacy continua suite intacta.

### O que esta fora de escopo

- Migration de dados historicos (200K+ rows `tournaments` com prize legacy) — sera spec separada futura quando founder ativar flag em prod.
- Refatoracao do parser CSV inteiro (1737 LOC monoclasse) — out of scope.
- Adicionar novas redes de poker.
- SSE pra progresso (defer permanente — polling cobre UX-only need).
- LLM-narrative no progresso ("80% processado, ETA 12s") — UI estatica `processed/total` suficiente.
- Reusar `processed_count` pra Coach AI nudges ("voce subiu 200 torneios essa semana") — out of scope.
- Cleanup historico de uploads `status='processing'` orfaos (background job morto, row stuck) — pode ser adicionado em sprint futura via cleanup tick.
- Migracao dos consumers `prize`/`profit` no client (parar de subtrair buyIn) **com flag OFF** — apenas alteracao codigo defensivo `profit = prize_is_net ? prize : (prize - buyIn)` no Dashboard alvo, gateado pelo mesmo env (lido via endpoint `/api/config` ou via fetch da preference). Implementer phase escolhe entre injecao via cookie/env-exposed ou hardcode `false` ate sprint futura.

---

## 2. Decisao

Adotada: **2 sub-decisoes alinhadas com RF-01.01 + RF-02 do spec.** Sem cluster — cada sub-decisao independente, blast radius isolado.

### 2.1 Kill-switch env flag `CSV_PARSER_NEW_PRIZE_SEMANTICS` (RF-01.01)

- **Default:** `false` (legacy semantics). Toggle via `.env` em prod quando founder rodar migration manual de backfill (futura).
- **Lookup table prize por rede** (canonico quando flag `true`):

```ts
// server/csvParser.ts — novo helper
const PRIZE_FORMULA_BY_NETWORK: Record<string, (row: CSVRow, buyIn: number) => number> = {
  pokerstars: (row, _buyIn) => parseFloat(row.Result), // ja eh NET
  ggnetwork:  (row, buyIn)  => parseFloat(row.Result) - buyIn, // GROSS → subtrai
  wpn:        (row, buyIn)  => parseFloat(row.Result) - buyIn, // hipotese — validar fixture
  partypoker: (row, buyIn)  => parseFloat(row.Result) - buyIn,
  chico:      (row, buyIn)  => parseFloat(row.Result) - buyIn,
  '888poker': (row, buyIn)  => parseFloat(row.Result) - buyIn,
  ipoker:     (row, buyIn)  => parseFloat(row.Result) - buyIn,
  bodog:      (row, buyIn)  => parseFloat(row.Result) - buyIn,
  coinpoker:  (row, buyIn)  => parseFloat(row.Result) - buyIn,
  revolution: (row, buyIn)  => parseFloat(row.Result) - buyIn,
};

// Branch no parser de cada rede:
const useNewSemantics = process.env.CSV_PARSER_NEW_PRIZE_SEMANTICS === 'true';
const network = normalizeNetwork(siteValue); // R1-02 case-insensitive
const prize = useNewSemantics
  ? PRIZE_FORMULA_BY_NETWORK[network](row, buyIn)
  : parseFloat(row.Result); // legacy raw
```

- **Dashboard consumer (`client/src/pages/Dashboard.tsx` + helpers):**

```ts
// Branch espelhado — leitura via prop / config injetado pelo backend
const useNewSemantics = config.csvParserNewPrizeSemantics === true;
const profit = useNewSemantics ? tournament.prize : (tournament.prize - tournament.buyIn);
```

- **Trade-off do kill-switch vs migration big-bang:** kill-switch economiza migration arriscada agora (200K+ rows com formula incerta por rede ate validar fixtures), mantem reversibilidade (toggle 1 env var), e disconnecta o shipping do parser do shipping da migration. Custo: prod fica em estado "modo legacy" ate flag virar — risco residual aceito (zero atualmente porque parser ja roda legacy hoje).
- **Migration futura:** quando founder validar formulas com CSVs reais (Q-A) + decidir backfill, sprint dedicada vai (a) rodar SELECT por rede pra recalcular `prize` em batch; (b) UPDATE incremental com snapshot pra rollback; (c) ativar flag `true` em prod. Out of scope agora.
- **Logging defensivo (lesson #9):** `csvParser.new_prize_semantics.applied` log com `{userId, network, count}` por upload quando flag ativa. Auditavel.

### 2.2 Bulk-import progresso via coluna nova `upload_history.processed_count` + polling 2s (RF-02)

- **Migration 0074** adiciona `processed_count integer NOT NULL DEFAULT 0` + `idx_upload_history_status`.
- **POST `/api/upload-history` flow novo:**

```ts
// server/routes/upload.ts (esqueleto)
const tournaments = parser.parseCSV(content); // sync
if (tournaments.length <= 5000) {
  // SYNC PATH (inalterado)
  const result = await processSync(tournaments);
  return res.json({ imported: result.imported, duplicates: result.duplicates });
}

// ASYNC PATH (RF-02 novo)
const uploadHistoryId = nanoid();
await storage.createUploadHistory({
  id: uploadHistoryId,
  userId,
  filename,
  status: 'processing',
  tournamentsCount: tournaments.length, // estimativa final
  processedCount: 0,
});
res.status(202).json({
  uploadHistoryId,
  estimatedTournaments: tournaments.length,
  status: 'processing',
});

// Background (fire-and-forget; tracked via upload_history)
processAsyncBatches(uploadHistoryId, tournaments)
  .catch(err => storage.updateUploadHistory(uploadHistoryId, { status: 'failed', errorMessage: err.message }));
```

- **Background loop:**

```ts
async function processAsyncBatches(uploadHistoryId, tournaments) {
  const BATCH = 500;
  for (let i = 0; i < tournaments.length; i += BATCH) {
    const batch = tournaments.slice(i, i + BATCH);
    try {
      await storage.createTournamentsBatch(batch);
      await storage.updateUploadHistory(uploadHistoryId, {
        processedCount: Math.min(i + BATCH, tournaments.length),
      });
    } catch (err) {
      console.error('upload_history.batch_failed', { uploadHistoryId, batchStart: i, err });
      // Continua proximos batches — falha parcial documentada
    }
  }
  await storage.updateUploadHistory(uploadHistoryId, { status: 'success' });
}
```

- **GET `/api/upload-history/:id` flow novo:** retorna `{id, status, processedCount, tournamentsCount, ...}`. Front polling 2s ate `status !== 'processing'` ou timeout 5min.
- **Frontend (FilmagemUpload.tsx + AutoUpload.tsx):**

```ts
const uploadResponse = await postUpload(file);
if (uploadResponse.status === 202) {
  const { uploadHistoryId, estimatedTournaments } = uploadResponse.body;
  startPolling(uploadHistoryId, estimatedTournaments, { intervalMs: 2000, timeoutMs: 300_000 });
} else {
  // sync path — display result imediato
}
```

- **Trade-off coluna nova vs reuso `tournaments_count`:** coluna nova preserva semantica clara — `processed_count` = atual durante loop; `tournaments_count` = final apos `status='success'`. Queries `/upload-history` list nao precisam mudar. Custo: 1 coluna + 1 indice. Tradeoff aceito vs ambiguidade de reusar `tournaments_count`.
- **Trade-off polling vs SSE:** polling 2s = simples + cabe no setup atual (sem WebSocket infra). Carga DB: 1 SELECT por user por 2s durante upload (max ~150 SELECTs/upload). Indice `(user_id, status)` opcional pra ticks de monitoramento futuros — incluso na 0074 por baixo custo de manter.
- **Failure mode partial-batch:** batch X falha → log + segue. `processed_count` reflete o que conseguiu. `status='success'` final mesmo com batches falhos (UI mostra `processed < total` como warning). Trade-off: founder pode reupload manualmente os faltantes. Alternativa "marcar failed se qualquer batch falhar" foi rejeitada — preserve work parcial e melhor que perder tudo.

---

## 3. Opcoes consideradas

### Opcao A — Kill-switch env flag + coluna `processed_count` — ESCOLHIDA

**Pros:**
- Prize semantics: reversivel (toggle 1 env var); zero risco em prod; desconecta shipping parser do shipping migration historica.
- Bulk progresso: semantica clara (`processed_count` vs `tournaments_count` final); migration trivial; sem infra nova; polling cabe no setup atual.
- Blast radius isolado por feature.

**Contras:**
- Kill-switch adiciona dead code potencial (branch legacy persiste); mitigado por: remover branch quando migration historica shipar + flag virar default `true` permanente.
- Polling carrega DB linear com count de uploads concorrentes; tolerable em escala atual (<100 users); revisit Phase 2.

### Opcao B — Migration big-bang prize semantics + reuso `tournaments_count`

**Rejeitada:**
- Migration big-bang em 200K+ rows com formula incerta por rede (fixtures parciais) = risco alto + irreversivel sem snapshot.
- Reuso `tournaments_count` introduz ambiguidade temporal (mid-process vs final) — quebra UI/queries `/upload-history` que assume valor final.

### Opcao C — Coluna `prize_is_net` boolean por row + Redis pub/sub progresso

**Rejeitada:**
- `prize_is_net` por row exige back-fill + branches permanentes em consumers (`IF prize_is_net THEN ...`) — debito permanente.
- Redis pub/sub adiciona infra (1 client lib + connection + retry logic) pra UX-only feature; custo nao justifica.

### Opcao D — SSE em `/api/upload-history/:id/stream` em vez de polling

**Rejeitada:**
- SSE adiciona express middleware + connection state + heartbeat — infra nao usada em outro lugar do projeto.
- Vantagem real eh push (~100ms vs 2s polling) — UX nao precisa dessa granularidade pra upload de 30-60s.
- Caso scale Phase 2 demandar (>1K uploads concorrentes), revisitar.

### Opcao E — Logger detalhado no progresso (`{batchStart, batchEnd, durationMs, ...}` por batch)

**Rejeitada parcial:**
- Logger basico (`upload_history.batch_failed`) mantido pela lesson #9. Logger detalhado por batch (`batch_completed` cada 500) seria ruido em log production.
- Reviewable adicao futura se debugging exigir.

### Opcao F — Hibrida: kill-switch `CSV_PARSER_NEW_PRIZE_SEMANTICS` + migration eager com snapshot

**Rejeitada:**
- Combina pior de ambos: complexidade do flag + risco da migration. Snapshot table dobra storage temporariamente.
- Defer permanente — flag isolado eh suficiente.

---

## 4. Consequencias

### Positivas

- **Prize semantics canonico opt-in:** founder controla shipping sem migration arriscada agora. Quando validar fixtures, ativa flag em sprint dedicada.
- **Bulk progresso UX-OK:** uploads de 18K torneios mostram progresso real (`{processed}/{total}` cada 2s) em vez de spinner cego.
- **Coluna `processed_count` extensivel:** pattern reusavel pra outros bulk jobs futuros (report jobs, study seed jobs).
- **Failure parcial preserva trabalho:** batch X falha → batches Y+1..N continuam. Founder reupload faltantes manualmente.
- **Indice `idx_upload_history_status` reutilizavel:** ticks de monitoramento futuro (cleanup `processing` orfaos, dashboard admin) ganham scan O(rows-com-status-X).
- **Zero regressao em uploads <=5000:** sync path inalterado; cliente legado nao polla nada.

### Negativas

- **Branch legacy persiste no codigo:** ate migration historica shipar + flag default virar `true`, parser tem 2 caminhos. Lesson histórica feature flags pode virar debito permanente.
- **Dashboard tem branch espelhado:** consumer precisa ler config pra escolher formula. Adiciona prop drilling.
- **Polling carga DB:** 1 SELECT por 2s por upload concorrente. Tolerable Phase 1; revisit Phase 2.
- **`processed_count` pode ficar stuck:** background job morto deixa row `processing` orfa. Cleanup tick futuro precisa rodar (defer permanente ate first incident).
- **Frontend timeout client (5min):** uploads >5min em casos extremos resultam em abort com upload concluindo em background. UX confusa — front exibe "expirado" mas DB tem `success`. Mitigado por: refresh manual da `/upload-history` mostra estado real.

### Riscos mitigados

- **Lesson #9** (log antes do fallback): branch new-semantics loga aplicacao; background job loga batch failures.
- **Lesson #3** (mock shape real): test-writer audita shape pos-migration de `upload_history` antes de mockar.
- **Lesson #34** (`injectedStorage`): rotas POST/GET aceitam 3o arg pra testes sem `vi.mock('../storage')`.
- **Lesson #38** (test modificado com justificativa): test-writer separa `prize_semantics=new` cases sem alterar legacy suite.

### Neutras

- **Background fire-and-forget:** Promise sem await — orfao na lista de promises pendentes. Aceitavel em Node single-process; revisit se cluster mode shipar.
- **Threshold 5000 torneios** = heuristic. Pode ser ajustado via env futuro se observacao de prod indicar valor diferente.
- **Ratecard prize formula por rede** = hipoteses iniciais. Cada validacao com CSV real ajusta o `PRIZE_FORMULA_BY_NETWORK` em sprint dedicada.

## Confianca

**Alta** — kill-switch desconecta risco temporal (parser ship now, migration historica futura); coluna nova preserva semantica clara; polling cabe no stack atual sem nova infra. Blast radius isolado por feature (parser branch + storage update + frontend polling — sem touch shared). Suite csv-parser (78 testes) cobre regressao em branch legacy; testes novos cobrem branch new. Reviewer round confirma equivalencia observable quando flag `false` default em prod.
