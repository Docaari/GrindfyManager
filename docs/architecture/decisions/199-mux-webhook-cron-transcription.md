# ADR-199 — Mux Transcription Pipeline Automation (Cron + Webhook + `generated_subtitles`)

**Status:** Accepted
**Date:** 2026-05-22
**Sprint:** Mini Player 3.2 / Wave A / W-A1 + W-A2
**Supersedes / Relates:** ADR-196 (Mux text track ingestion — Opcao A), ADR-072 (Mux integration), ADR-144 (advisory locks), ADR-156 (cron runner gating)

---

## Context

Wave A (commit `7025b58a`) entregou `transcriptionIngestor.ts` + `backfillTranscriptionPreviews` + CLI script `scripts/backfill-transcription-preview.ts`. Em PROD, a pipeline esta **inerte** por 3 razoes:

1. `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` ausentes no `.env` (founder pendente) — `ingestPreviewFromMux` curto-circuita com `reason:'mux_not_configured'`.
2. Tracks `type=text` nao existem em assets do projeto: precisa upload manual VTT no Dashboard Mux **ou** passar `generated_subtitles` no payload de criacao do asset.
3. Sem trigger automatico — CLI manual quebra o contrato "fire-and-forget" do MVP. Quando o founder publica curso novo, ninguem lembra de rodar o script.

Reviewer R1 (Wave A) classificou como follow-up MP3.2 (4 items, ICE 405 — MUST tier).

**Requisitos da decisao:**
- Auto-popular `transcription_preview` sem intervencao humana apos upload de lesson nova.
- Cobrir backlog historico de lessons existentes (`transcription_preview IS NULL`).
- Resiliente a falha Mux (queue API atrasada, asset processing demorado, network blip).
- Sem regressao em ADR-196 (CLI continua funcionando como back-compat / debug tool).

---

## Decision

Adotar **estrategia dual-trigger** com idempotencia forte:

### 1. Upload-time: `generated_subtitles` no payload Mux (W-A1)

Codepath que cria asset Mux (provavelmente em rota admin de criacao de lesson — descobrir via Grep no implementer) passa:

```ts
mux.video.assets.create({
  input: [...],
  playback_policy: ['public'],
  generated_subtitles: [{ language_code: 'pt', name: 'Portugues (auto)' }],
  // se MUX_GENERATED_SUBTITLES_LANGS=pt,en → array com 2 entradas
});
```

- Default `language_code='pt'` (audiencia BR primaria).
- Override via env `MUX_GENERATED_SUBTITLES_LANGS` (CSV, ex: `pt,en`).
- Mux retorna 400 para lang invalido → log warn + cria asset sem caption (best-effort, **NAO bloqueia upload**).
- Idempotente: Mux garante 1 track por language_code (reupload nao duplica).

### 2. Runtime-trigger: Cron diario + Webhook Mux (W-A2)

#### 2.1. Cron diario `0 4 * * *` UTC (~1h BRT)

Registrado em `server/cron/cronRunner.ts`, gated por env `TRANSCRIPTION_INGEST_ENABLED` (default `true`) **e** `MUX_TOKEN_ID` configurado (skip silencioso com 1 log info por boot se ausente).

Logica:
1. SELECT lessons WHERE `transcription_preview IS NULL` AND `mux_asset_id IS NOT NULL` ORDER BY `created_at DESC` LIMIT 100.
2. Para cada lesson: `ingestPreviewFromMux({ assetId, playbackId })` + `sleep(1000)` defensivo contra rate limit Mux.
3. Atualiza UPDATE quando `reason:'ok'`. Lesson com `reason:'no_text_tracks'` fica NULL → re-tentada no proximo run (idempotente).
4. Telemetria: contadores `transcription_ingest_attempted` / `_succeeded` / `_failed_by_reason` via Pino structured log.

Cap 100 lessons/run = ~100s wall-clock + Mux API tempo. NAO bloqueia outros crons (cron runner ja serializa).

#### 2.2. Webhook Mux `POST /api/mux/webhooks`

Endpoint novo, **publico mas HMAC-protected**.

Headers Mux:
- `Mux-Signature: t=<unix>,v1=<hmac_sha256>` — calculado como `HMAC_SHA256(secret, "${t}.${rawBody}")`.

Logica:
1. Lê `process.env.MUX_WEBHOOK_SECRET` (boot fail se webhook endpoint registrado sem env — fail-fast).
2. Valida `Mux-Signature`:
   - Parse `t=` e `v1=`.
   - Reject se `Date.now()/1000 - t > 300` (5min tolerance — replay protection).
   - Compara `crypto.timingSafeEqual(computed, v1)`.
   - Falha → 401 + log warn (NAO log secret ou body completo).
3. Roteia por `event.type`:
   - `video.asset.track.ready` + `track.type === 'text'` → resolve `assetId` via `event.data.asset_id` → busca lesson → chama `ingestPreviewFromMux` sincrono best-effort.
   - Outros events → 200 OK + log debug (no-op).
4. **Sempre responder 200 mesmo em erro interno** (evita Mux retry agressivo). Erro interno → log error + metric.
5. Idempotencia: se lesson ja tem `transcription_preview NOT NULL`, ingestor curto-circuita com `reason:'already_populated'` + log debug.

### 3. CLI mantido como debug/back-compat

`scripts/backfill-transcription-preview.ts` continua funcional. Banner inicial avisa:

```
⚠ DEPRECATED: pipeline automatico ja roda via cron + webhook desde MP3.2.
  Use este script apenas para debug ou backfill explicito (--force).
```

---

## Options Considered

### Opcao 1: Apenas cron diario (sem webhook)

- **Pros:** Simples. Sem endpoint publico. Sem HMAC.
- **Cons:** Latencia 24h pior caso entre upload de curso e preview disponivel. UX feio quando founder publica curso e ve "Sem preview" o dia inteiro.

### Opcao 2: Apenas webhook (sem cron)

- **Pros:** Quase-realtime (<30s pos-Mux finalizar track).
- **Cons:** Sem cobertura para backlog historico (lessons criadas antes do W-A1). Se webhook delivery falhar (Mux retry expira), lesson fica NULL ate alguem reupload. Fragil.

### Opcao 3 (escolhida): Cron + Webhook + `generated_subtitles`

- **Pros:** Webhook cobre happy path (lowlatency). Cron cobre backlog + missed webhooks. `generated_subtitles` garante que Mux SEMPRE gera track. Defense in depth.
- **Cons:** 3 codepaths para manter. HMAC adiciona complexidade ao endpoint. Risco de race entre cron e webhook (mitigado por idempotencia — `already_populated` short-circuit).

### Opcao 4: Polling no client

- **Pros:** Sem backend changes.
- **Cons:** N+1 requests, fragil, gasta API Mux quota. Descartado.

---

## Consequences

### Positivas

- Pipeline completamente autonoma — founder nao precisa rodar CLI nem subir VTT manual.
- Backlog historico coberto automaticamente em <100h (cron 100/dia).
- Defense in depth: 3 camadas independentes (`generated_subtitles` + cron + webhook).
- Telemetria estruturada permite alarme se taxa de falha > threshold.

### Negativas

- **Custo Mux:** `generated_subtitles` adiciona ~$0.02/lesson (Mux auto-caption fee). Para volume atual (<50 lessons), <$1/mes. Documentado para revisitar se passar de 500 lessons.
- **Endpoint publico novo:** superficie de ataque adicional. Mitigado por HMAC + replay protection (5min window).
- **Boot fail novo:** `MUX_WEBHOOK_SECRET` obrigatorio quando webhook endpoint registrado — risco de quebrar deploy se founder esquecer de adicionar. Mitigado por checklist deploy + boot log fail-fast.

### Neutras

- `TRANSCRIPTION_INGEST_ENABLED` permite kill-switch em caso de bug pos-deploy.
- Cap 100/run ajustavel via env futura sem mudanca de codigo (deferido — atual valor cabe MVP).

---

## Implementation Notes

### Boot validation

```ts
// server/index.ts (ou onde Mux client inicializa)
if (process.env.MUX_WEBHOOK_SECRET === undefined && webhookRouteRegistered) {
  throw new Error('MUX_WEBHOOK_SECRET required when /api/mux/webhooks is registered');
}
```

### Handler test contract (lesson #34)

`handleMuxWebhook(req, res, injectedDeps?)` aceita 3o arg opcional para test mocking de `ingestPreviewFromMux` + `storage.getLessonByMuxAssetId` sem `vi.mock('../services/...')` global. Lazy import em prod path.

### Env additions

| Variavel | Default | Required | Descricao |
|---|---|---|---|
| `TRANSCRIPTION_INGEST_ENABLED` | `true` | No | Kill-switch global do cron + webhook ingest |
| `MUX_GENERATED_SUBTITLES_LANGS` | `pt` | No | CSV de language_codes para auto-caption |
| `MUX_WEBHOOK_SECRET` | — | **Yes** quando endpoint registrado | HMAC secret Mux Dashboard |

### Migration impact

Zero. Pipeline opera sobre coluna existente `transcription_preview` (varchar). W-A4 (ADR-201) migra para JSONB de forma aditiva — quando isso landar, ingestor passa a aceitar parametro `lang` e escrever via `jsonb_set`.

---

## Confianca

**Alta.** Padrao estabelecido (cron + webhook + idempotencia) ja usado em `report_jobs` runner (ADR-155) e Stripe webhook (futuro). HMAC pattern bem documentado pela Mux.

## References

- Mux webhook docs: https://docs.mux.com/core/listen-for-webhooks
- ADR-196 (ingestor base) — esta ADR estende sem quebrar contrato existente.
- ADR-144 (advisory locks) — cron runner ja usa `withAdvisoryLock` para evitar double-run em multi-instance.
