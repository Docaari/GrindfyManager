# ADR-196 — Transcription Preview Ingestion via Mux Text Tracks

**Status:** Accepted
**Date:** 2026-05-22
**Sprint:** Mini Player 3.1 / Wave A / HIGH-1
**Supersedes / Relates:** ADR-072 (Mux Video Integration), ADR-193 (Queue UI Persistence)

## Context

A coluna `library_lessons.transcription_preview` foi adicionada na migration
0078 (Sprint Mini Player 3) para alimentar metadata em `LessonPickerDialog`
(preview textual de 80 chars + ellipsis). Migration 0078 incluiu um backfill
best-effort condicional a existencia da coluna `transcription_full` —
coluna esta que **nunca foi criada** (designada apenas no spec). Resultado:
`transcription_preview` ficou **sempre NULL** em producao. UI ja trata o
NULL como fallback (sem mostrar preview), mas o feature ficou inerte.

Reviewer Wave A identificou como HIGH-1 a ausencia de pipeline de fonte.

## Decision

Adotar **Opcao A: Mux text tracks** como fonte canonica para o preview.
Mux ja armazena closed captions (auto-generated VOD ou uploaded pelo
founder via Dashboard) em VTT, acessivel via:

- `GET /video/v1/assets/:asset_id` (Mux REST API) → retorna `tracks[]`
  com `type='text'`, `text_type` (subtitles|captions), `text_source`,
  `id`, `status`.
- `GET https://stream.mux.com/{playback_id}/text/{track_id}.vtt` → baixa
  o VTT cru.

### Pipeline

1. **`server/services/transcriptionIngestor.ts`** — funcao
   `ingestPreviewFromMux({ assetId, playbackId })` resolve cliente Mux
   (lazy + env-gated), busca o asset, filtra tracks de texto `ready`,
   prioriza `subtitles` sobre `captions` e `uploaded` sobre `generated_vod`,
   baixa o VTT, extrai texto e trunca a 80 chars + `…` (unicode U+2026
   alinhado a Migration 0079).
2. **`server/storage/transcriptionPreviewStorage.ts:backfillTranscriptionPreviews`**
   — itera lessons com `transcription_preview IS NULL`, chama o ingestor,
   UPDATE best-effort. Reporta `{ updated, skipped, failed, reasons }`.
3. **`scripts/backfill-transcription-preview.ts`** — CLI one-shot
   (`tsx --env-file=.env`); founder roda manualmente apos primeira release
   ou apos publicar novo curso.

### Fallback (Opcao B, DEFERIDO MP3.2)

Whisper local (`whisper-node`) ou OpenAI Whisper API quando o asset Mux
nao tem text tracks (`reason='no_text_tracks'`). Estimativa: ~5-10s por
lesson de 10min CPU local; $0.006/min via OpenAI. Defer porque:

- Founder ainda nao configurou Mux text tracks (auto-gen ou upload).
- Sem volume de cursos justificando custo OpenAI ainda.
- Custo de adicionar dep + cron processor + idempotencia (avoid re-run).

Quando ativar: adicionar `transcriptionIngestor.fallbackProviders` array
+ tentar em ordem. Estrategia ja modelada (modulo retorna `reason`
discriminado por failure type).

## Consequences

### Positive
- Pipeline minimo viavel sem novas deps em runtime (`@mux/mux-node` ja
  presente). Custo zero adicional.
- Idempotente: backfill so toca lessons com `transcription_preview IS NULL`.
- Storage / ingestor desacoplados (testable separadamente).
- Graceful degrade: sem env Mux ou sem text track → coluna fica NULL +
  UI mostra fallback (status quo).

### Negative
- **Dependencia operacional:** cada lesson precisa ter text track gerada
  no Mux. Auto-generated VOD captions Mux requer `video.assets.create`
  com `generated_subtitles: [{ language_code: 'pt' | 'en' }]` (defer:
  pipeline de upload ainda eh manual via Dashboard).
- Sem cron automatico ainda — founder roda CLI manual. MP3.2 pode
  agendar.
- Auto-gen captions Mux tem qualidade variavel (especialmente em PT-BR
  com girias de poker — "shove", "open-raise", "ICM"). Preview pode ficar
  estranho mas eh truncado em 80 chars, dano limitado.

### Neutral
- Migration 0079 padroniza ellipsis para U+2026 (`…`) — preview novo ja
  usa este char; backfill apenas atualiza linhas antigas (no-op enquanto
  nenhuma lesson tem preview).

## Test Strategy

`tests/server/mini-player-3-1-a/transcriptionIngestor.test.ts`:
- `extractTextFromVtt` strips headers, NOTE blocks, cue ids, timestamps,
  inline tags.
- `truncatePreview` boundary in space, ellipsis suffix.
- `ingestPreviewFromMux` happy path (mocked mux client + fetchVtt).
- Reason codes para failures (no_asset, no_playback_id, no_text_tracks,
  mux_not_configured, fetch_failed, empty_transcript).

`tests/server/mini-player-3-1-a/backfillTranscriptionPreviews.test.ts`:
- Orchestrator pega lessons sem preview, chama ingestor, UPDATE quando ok.
- Skip + reason tracking quando ingestor falha.
- `lessonIds` filter + `limit`.

## Open Questions / Follow-Ups

- **Q1 (MP3.2):** Habilitar `generated_subtitles` no fluxo de upload Mux
  (provider `uploadAsset`)? Hoje founder sobe video sem subtitles — Mux
  nao gera auto.
- **Q2 (MP3.2):** Cron diario que descobre lessons novas + chama backfill?
  Ou trigger event-driven via webhook Mux (`video.asset.track.ready`)?
- **Q3 (MP3.2):** Whisper fallback worth it considerando custo + qualidade
  vs Mux auto-gen?
- **Q4:** Multi-language preview (PT-BR + EN)? Hoje pega primeiro track
  ordenado por preferencia; nao distingue idioma.
