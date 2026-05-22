# Sprint Mini Player 3.2 — Wave A + Wave B Follow-ups (Polish & Hardening)

## Status

**Proposta** — 2026-05-22. Aguardando aprovacao founder.

Sprint **polish/hardening pos-cluster**. Sem features novas grandes. Consolida todos os follow-ups documentados nas sessoes:

- Wave A (commit `7025b58a`) — 4 follow-ups transcription infra
- Wave B (commit `8bb6b4c5` em `feature/mini-player-3-1-ux-wave-b`) — 7 follow-ups UX/reviewer

Pronta para `system-architect` apos founder priorizar tier list ICE (ver §11).

---

## Origem

- **Memory anchors:**
  - `memory/session_2026-05-22-mp3.1-wave-a-hardening.md`
  - `memory/session_2026-05-22-mp3.1-wave-b-ux-tier3.md`
  - `memory/session_2026-05-22-mini-player-2-3-marathon.md`
  - `memory/session_2026-05-22-mini-player-1.2-shipped.md`
- **ADRs vivos cluster Mini Player:**
  - 187 AudioSourceEngine
  - 188 FSM + z-index
  - 189 audio queue homogenea
  - 190 Spotify token storage AES-256-GCM
  - 191 telemetria audio via user_activity
  - 192 audio_focus_lost deferred
  - 193 queue UI persistence (localStorage v1 + server snapshot)
  - 194 OAuth popup fallback (sessionStorage snapshot + redirect)
  - 195 keyboard shortcuts contract
  - 196 transcription preview ingestion (Mux text tracks — Opcao A)
  - 197 resume cross-session (7d TTL + throttle 10s)
  - 198 audio error recovery + buffering UI
- **Proximos numeros disponiveis:**
  - ADR: **199** (proximo livre apos 198)
  - Migration: **0080** (apos 0079 ellipsis backfill da Wave A)
- **Branch atual em main:** `8bb6b4c5` (Wave B merged ja em main pelo founder — confirmado no git status do system-reminder).

---

## Persona-alvo

Mesma persona dos sprints MP1-MP3.1: jogador profissional MTT desktop, Spotify Premium conectado, fluxo grind 7-11h com Coach narrative + musica de fundo. MP3.2 polish nao introduz novo cohort — consolida UX para o cohort existente.

---

## 1. Sumario Executivo

**Objetivo.** Fechar **todos os 11 follow-ups documentados** (4 Wave A + 7 Wave B) que ficaram defer-MP3.2 nas sessoes anteriores. Garantir que cluster Mini Player chegue ao "feature-complete" em estado polish, sem cauda de tech-debt visivel ao usuario nem dead code de debug em PROD.

**Tese.** MP3.1 entregou 339 testes verdes + tsc 0 + zero regressao, mas o reviewer R1 da Wave B documentou 2 HIGH (corrigidos pre-merge) + 3 MEDIUM + 3 LOW + 3 INFO que viraram MP3.2 backlog. Em paralelo, Wave A deixou a pipeline de transcription dependente de CLI manual + Mux Dashboard upload + filtro estreito (`type=text` only). MP3.2 fecha esses dois bolsoes: **infraestrutura de transcription** (W-A1..W-A4) + **UX hardening pos-reviewer** (W-B1..W-B7).

**Constraints duros.**
- Zero mudanca em `LessonViewer` / `PodcastPlayer` (Biblioteca-1).
- Surface `AudioPlayerContext` ganha SO additions (ex: novo `retryInProgressRef` interno) — zero breaking change publico.
- `IAudioSourceDriver` interface NAO muda.
- ADR-189 (queue homogenea) + ADR-193 (queue UI persistence) inalterados.
- Zero regressao baseline cluster Mini Player (~339 tests verdes a manter).
- Migration 0080 (W-A4) e ADITIVA — sem breaking; coluna nova com DEFAULT NULL ou JSONB `{}`.
- Sem suporte mobile novo (Queue UI continua `hidden md:inline-flex`).

**11 RFs em 1 linha:**

- **W-A1 (M, 2d) Mux `generated_subtitles` upload em uploadAsset** — Estender ingestor + upload path para aceitar `generated_subtitles: ['en','pt']` no `POST /video/v1/assets` do Mux. Hoje upload manual via Dashboard.
- **W-A2 (L, 3-4d) Cron + webhook trigger ingestor** — Substituir CLI manual por (a) cron diario `0 4 * * *` UTC + (b) Mux webhook `video.asset.track.ready` -> enfileira ingest job.
- **W-A3 (L, 4-5d) Whisper local fallback** — Quando Mux nao tem track `ready` em 24h OU qualidade ruim (PT-BR poker slang), fallback `openai-whisper` local (CPU-friendly model `small`).
- **W-A4 (M, 2d) Multi-lang transcription previews** — Migrar `library_lessons.transcription_preview` (varchar) -> `transcription_previews` (JSONB `{ "en": "...", "pt": "..." }`) + UI mostra preview no idioma do user OR primeiro disponivel.
- **W-B1 (S, 4h) MEDIUM-1 retryCurrent race lock** — `retryInProgressRef` flag em `AudioPlayerContext` impede 2x dispatch quando user clica Retry rapido durante reload.
- **W-B2 (S, 4h) MEDIUM-3 clearResumeSnapshot on logout + drop window flag PROD** — Hook em logout flow chama `clearResumeSnapshot()`. `window.__audioPlayerLastResumeSnapshot` so em DEV (gate `import.meta.env.DEV`).
- **W-B3 (XS, 2h) LOW-1 stopPropagation no onboarding "?" click** — Click no help icon NAO dispara outside-click dismiss do tooltip.
- **W-B4 (S, 4h) LOW-2 input click gate em keyboard shortcuts** — Space/J/L/0-9 ignoram quando foco em `<input>`/`<textarea>`/`[contenteditable]`. **Verificar: parte ja existe em `isInteractiveTarget` da ADR-195.** RF cobre gap (onboarding-keys + numeric seek).
- **W-B5 (S, 1d) LOW-3 PT-BR error mapping** — `loadError` mensagens browser (`DEMUXER_ERROR_*`, `MEDIA_ELEMENT_ERROR`, 404/403) -> mensagens PT-BR amigaveis ("Faixa nao encontrada", "Falha ao carregar audio").
- **W-B6 (XS, 1h) INFO-1 JSDoc @internal** — Adicionar `@internal` em exports `_RESUME_*`, `_ONBOARDING_*`, `MemoryStorage`, `_resetForTests` e similares (test-only helpers).
- **W-B7 (XS, 1h) INFO-2 dropar aria-label redundante Radix Dialog** — Radix `DialogPrimitive.Title` ja gera `aria-labelledby` — remover `aria-label` duplicado em `ShortcutsHelpPopover` + `LessonPickerDialog`.

**Out of scope MP3.2 (defer MP4+ se demanda emergir):**
- Cross-device sync Spotify (`playback_state` endpoint).
- Equalizer / Lyrics / Voice control.
- Mobile Queue UI responsivo.
- Floating icon position UI.
- Resume-after-Coach.
- Reflect.construct refactor (INFO-3 MP2, LOW).

---

## 2. Contexto e Motivacao

### 2.1 Wave A — Transcription pipeline esta inerte na pratica

Wave A shipou `transcriptionIngestor.ts` + `backfillTranscriptionPreviews` + CLI script. Mas em PROD:

1. **MUX_TOKEN_ID/SECRET nao no `.env`** — founder pendente. Ate isso, `ingestPreviewFromMux` retorna `reason:'mux_not_configured'`.
2. **Tracks `type=text` nao existem em assets do Mux do projeto** — geradas apenas se founder upload manual VTT OU se passar `generated_subtitles` no upload (W-A1).
3. **Nenhum trigger automatico** — CLI script `scripts/backfill-transcription-preview.ts` precisa rodar manualmente. (W-A2)
4. **Sem fallback** — Se Mux falhar OR preview vier ruim PT-BR poker slang, nao tem plano B. (W-A3)
5. **Single language** — Schema atual e `varchar` (1 preview por lesson). Multi-lang aulas (ex: Coach narrative en + pt) sobrescreveriam. (W-A4)

### 2.2 Wave B — Reviewer R1 deixou 8 itens defer-MP3.2

R1 documento: 0 CRIT + 2 HIGH (corrigidos pre-merge) + **3 MEDIUM + 3 LOW + 3 INFO defer-MP3.2** (1 INFO ja coberto por testes adicionais — efetivo: **7 RFs**).

Lista textual da memory `session_2026-05-22-mp3.1-wave-b-ux-tier3.md`:

> - MEDIUM-1 retryCurrent race lock guard (`inFlightRef` check-and-increment)
> - MEDIUM-3 `clearResumeSnapshot()` no logout flow + nao expor `window.__audioPlayerLastResumeSnapshot` em PROD
> - LOW-1 `stopPropagation` no onboarding keydown `?` (evita ghost focus popover)
> - LOW-2 onboarding click target gate (input/textarea NAO deve dismissar)
> - LOW-3 mapear error messages browser (ex: `DEMUXER_ERROR_*`) pra PT-BR amigavel
> - INFO-1 JSDoc `@internal` nos exports `_RESUME_*` / `_ONBOARDING_*`
> - INFO-2 remover `aria-label` redundante do Radix Dialog Content (Title ja serve)

Risco mantido em PROD se nao limparmos:
- **MEDIUM-1** — race condition em rede instavel; cobre user MTT que perdeu conexao e clicou Retry 2x. Pode duplicar telemetria `audio_track_error` ou triplicar tentativa contra `retryCount` cap.
- **MEDIUM-3** — `localStorage.audio.resume.v1` persiste apos logout. Outro user no mesmo dispositivo (caso shared device) ve last track do anterior. **Sec/Privacy nit, nao critico.**
- **LOW-3** — UX feio (mensagens en/tecnica). Persona MTT BR le `DEMUXER_ERROR_NO_SUPPORTED_STREAMS` e abandona.

---

## 3. Decisoes Arquiteturais Esperadas (ADRs)

Sistema-architect criara apos aprovacao desta spec. Numeros reservados:

- **ADR-199** — Mux transcription pipeline automation (cron + webhook + `generated_subtitles` upload param). Substitui Opcao "manual CLI" implicita em ADR-196. Define schedule + idempotencia + retry policy.
- **ADR-200** — Whisper local fallback strategy (modelo, threshold de qualidade, custo CPU/latencia, gate ENV `WHISPER_ENABLED`). Decide entre `openai-whisper` Python subprocess vs `whisper.cpp` binary.
- **ADR-201** — Multi-language transcription schema migration (varchar -> JSONB `{lang: preview}` + lookup logic + back-compat).
- **ADR-202 (opcional)** — Logout integration contract para audio context (define quais clears rodam em logout: resume snapshot + queue + onboarding flag — ou nao). Pode virar so um ponto na ADR-188.

Diagramas em `Docs/architecture/diagrams/mini-player-3-2/`:

1. `transcription-pipeline-cron-webhook.mermaid` — sequence Mux event -> webhook -> queue -> ingestor -> storage.
2. `whisper-fallback-decision-tree.mermaid` — flowchart Mux track ready? -> Whisper? -> NULL.
3. `multilang-preview-lookup.mermaid` — flowchart user lang -> fallback chain.
4. `logout-audio-cleanup-sequence.mermaid` — sequence logout -> clearResumeSnapshot + clearQueue + clearOnboarding.
5. `error-message-i18n-mapping.mermaid` — class diagram error code -> PT-BR string.

---

## 4. Requisitos Funcionais

### Bloco Wave A — Transcription Infrastructure

---

#### W-A1: Mux `generated_subtitles` upload param

**Prioridade:** MEDIUM
**Effort:** M (2d)
**Refs:** ADR-196, ADR-199 (novo)

**Descricao.** Estender o codepath de upload de assets Mux (provavelmente em rota admin ou onboarding de aulas) para incluir `generated_subtitles: [{ language_code: 'pt', name: 'Portugues (auto)' }]` no payload do `POST /video/v1/assets` (Mux API). Garante que toda lesson nova gere auto-caption sem intervencao manual no Dashboard.

**Regras de negocio:**
- Idioma default `pt` (audiencia primaria BR).
- Permitir array `['pt','en']` via env `MUX_GENERATED_SUBTITLES_LANGS` (CSV) — default `pt`.
- Se Mux retornar erro 400 (lingua nao suportada), logar warn + criar asset sem caption (best-effort, nao bloquear upload).
- **Idempotencia:** Reupload do mesmo asset NAO recria caption (Mux ja garante 1 track per language).

**Criterio de aceitacao:**
- [ ] Asset criado via codepath atualizado tem `tracks[]` com `type='text'`, `text_source='generated_vod'`, `language_code='pt'` (verificavel via `GET /video/v1/assets/:id` apos ~5min processing).
- [ ] Env `MUX_GENERATED_SUBTITLES_LANGS` override funciona (test e2e mock).
- [ ] Failure path: Mux 400 -> asset criado sem caption + log warn.
- [ ] Ingestor `ingestPreviewFromMux` consome auto-gen track sem mudancas (track ja prioriza `subtitles > captions` per ADR-196).

**Modulos afetados:**
- `server/services/muxClient.ts` (ou onde upload Mux acontece — descobrir via Grep).
- `server/storage/libraryLessonStorage.ts` (se asset_id e armazenado la).

---

#### W-A2: Cron + webhook trigger ingestor

**Prioridade:** HIGH
**Effort:** L (3-4d)
**Refs:** ADR-196, ADR-199 (novo)

**Descricao.** Substituir CLI manual `scripts/backfill-transcription-preview.ts` por dois triggers automatizados rodando em paralelo:

1. **Cron diario** `0 4 * * *` UTC — varre lessons com `transcription_preview IS NULL` AND `mux_asset_id IS NOT NULL` (cap 100 por run, paginado por `created_at DESC`).
2. **Webhook Mux** `POST /api/mux/webhooks` recebe `video.asset.track.ready` event -> identifica lesson via `passthrough` ou lookup `mux_asset_id` -> ingest sincrono best-effort (idempotente).

**Regras de negocio:**
- Webhook verifica HMAC signature Mux (`Mux-Signature` header). Reject se invalido -> 401.
- Cron skip se `MUX_TOKEN_ID` nao configurado (graceful, log info uma vez por boot).
- Cron + webhook idempotentes: se `transcription_preview` ja NOT NULL e webhook chega, no-op + log debug.
- Webhook responde 200 mesmo em failure interno (evita Mux retry infinito) — log error.
- Cron gated por `COACH_NUDGES_ENABLED`? **Nao** — transcription nao e nudge. Mas gated por env `TRANSCRIPTION_INGEST_ENABLED` (default `true`).
- Telemetria: incrementar contador `transcription_ingest_attempted` / `transcription_ingest_succeeded` / `transcription_ingest_failed` (reutilizar `user_activity` enum se cabivel OR via Pino log + metric).

**Criterio de aceitacao:**
- [ ] Cron registrado em `server/cron/cronRunner.ts` (ou local equivalente) gated por env.
- [ ] Webhook endpoint `POST /api/mux/webhooks` valida HMAC + roteia por event type.
- [ ] Test: 3 lessons com `transcription_preview NULL` + tracks ready -> cron run -> 3 NOT NULL.
- [ ] Test: webhook chega 2x mesmo asset -> 2a chamada no-op.
- [ ] Test: HMAC invalido -> 401.
- [ ] CLI `scripts/backfill-transcription-preview.ts` mantido (back-compat) com warning de deprecation.

**Modulos afetados:**
- `server/cron/cronRunner.ts` (novo schedule).
- `server/routes/muxWebhooks.ts` (novo).
- `server/services/transcriptionIngestor.ts` (extensao — sem breaking).
- `.env.example` + CLAUDE.md (`TRANSCRIPTION_INGEST_ENABLED`, `MUX_WEBHOOK_SECRET`).

---

#### W-A3: Whisper local fallback

**Prioridade:** LOW
**Effort:** L (4-5d)
**Refs:** ADR-196, ADR-200 (novo)

**Descricao.** Quando Mux nao tem track `ready` apos 24h (lesson criada mas Mux falhou OR queue Mux atrasada) OU quando preview Mux for `< 10 chars` (heuristica de track ruim), gerar transcricao localmente via Whisper. Trigger pelo cron de W-A2 com flag `WHISPER_FALLBACK_ENABLED=true` (default `false` pra nao surpreender deploy).

**Regras de negocio:**
- Baixar audio do Mux via `https://stream.mux.com/{playback_id}/audio.m4a` (Mux fornece audio-only).
- Rodar `whisper.cpp` (binario, sem dependencia Python) ou `openai-whisper` (Python subprocess) — **decidir em ADR-200**.
- Modelo padrao: `small` (~470MB, ~2x realtime CPU). Override via env `WHISPER_MODEL`.
- Language hint: `pt` default, override por lesson se metadata sinalizar.
- Timeout 5min por lesson (10min lesson em 2x realtime). Se exceder, abort + log.
- Output: VTT-like text -> mesmo `extractTextFromVtt` + `truncatePreview` da ADR-196.
- **Custo:** estimado ~$0 (CPU local), ~5min/lesson serial. Trade-off documentado em ADR-200.

**Criterio de aceitacao:**
- [ ] Lesson com Mux track NULL apos 24h + Whisper enabled -> ingest fallback gera preview.
- [ ] Env `WHISPER_FALLBACK_ENABLED=false` -> codepath nunca executado.
- [ ] Test mock subprocess: whisper retorna texto -> preview corretamente truncado.
- [ ] Timeout 5min respeitado (kill subprocess + log).
- [ ] Fallback NAO sobrescreve preview Mux ja existente.

**Modulos afetados:**
- `server/services/whisperFallback.ts` (novo).
- `server/services/transcriptionIngestor.ts` (extensao — decision tree).
- `.env.example` + CLAUDE.md (`WHISPER_FALLBACK_ENABLED`, `WHISPER_MODEL`, `WHISPER_BINARY_PATH`).
- `package.json` (dependencia opcional `node-whisper` ou similar — **decidir ADR-200**).

**Risco:** dependencia native binary complica Docker build. Avaliar em ADR-200 se vale o effort.

---

#### W-A4: Multi-language transcription previews

**Prioridade:** LOW
**Effort:** M (2d)
**Refs:** ADR-196, ADR-201 (novo), migration 0080

**Descricao.** Migrar `library_lessons.transcription_preview` (varchar) -> `library_lessons.transcription_previews` (JSONB `{ "pt": "...", "en": "..." }`). UI consulta user preferred lang OR fallback chain `[user_lang, 'pt', 'en', primeira chave existente]`.

**Regras de negocio:**
- Migration 0080 **aditiva** — cria coluna nova JSONB, popula a partir da varchar antiga assumindo `pt` default, mantem coluna antiga por 1 sprint (deprecated, drop em MP3.3 OR pode ficar permanente como cache para legacy reads).
- Storage layer le JSONB com fallback `.pt ?? .en ?? Object.values(obj)[0] ?? null`.
- API endpoint `GET /api/library/lessons/:slug` retorna **`transcriptionPreview: string | null`** (string, nao objeto — UI nao precisa saber lang). Server escolhe via user.preferredLanguage do JWT/profile.
- Ingestor (Mux + Whisper) escreve sempre por lang especifico: `transcription_previews = jsonb_set(transcription_previews, '{pt}', '"texto..."')`.

**Criterio de aceitacao:**
- [ ] Migration 0080 + rollback existem e testam idempotentes.
- [ ] Ingestor com `lang='en'` escreve em `.en` sem sobrescrever `.pt`.
- [ ] Endpoint retorna preview no lang do user (mock 2 users diff lang).
- [ ] Lessons antigas (so varchar) ainda funcionam apos migration (back-fill seed `pt`).
- [ ] LessonPickerDialog renderiza preview sem mudanca de API publica (continua string).

**Modulos afetados:**
- `migrations/0080_transcription_previews_jsonb.sql` + `_rollback.sql`.
- `shared/schema.ts` (campo Drizzle JSONB).
- `server/services/transcriptionIngestor.ts` (parametro `lang`).
- `server/storage/transcriptionPreviewStorage.ts` (write via jsonb_set).
- `server/storage/libraryLessonStorage.ts` (read com fallback chain).
- Endpoint `/api/library/lessons/:slug` (selecao lang).

---

### Bloco Wave B — UX Hardening Pos-Reviewer

---

#### W-B1: MEDIUM-1 retryCurrent race lock

**Prioridade:** MEDIUM
**Effort:** S (4h)
**Refs:** ADR-198

**Descricao.** Adicionar `retryInProgressRef` em `AudioPlayerContext` para impedir 2 dispatches simultaneos de `retryCurrent`. Atualmente, click rapido 2x no Retry CTA durante reload pode disparar 2x `playTrack`, incrementando `retryCount` para 2 em 1 tentativa de usuario.

**Regras de negocio:**
- Lock check-and-set sincrono via `useRef` (nao state, evita re-render).
- Lock liberado em: `onCanPlay` (success), `onError` (fail), OR timeout 30s (safety net).
- Telemetria `audio_track_error` continua granular (sem double-count por race).

**Criterio de aceitacao:**
- [ ] Click 2x rapido em Retry -> `playTrack` chamado 1x apenas (test fake timers + spy).
- [ ] Retry funciona normalmente apos lock liberado (success path).
- [ ] Lock liberado em error path (proximo retry funciona).
- [ ] Safety timeout 30s (test fake timers).

**Modulos afetados:**
- `client/src/contexts/AudioPlayerContext.tsx`.

---

#### W-B2: MEDIUM-3 clearResumeSnapshot on logout + drop window flag PROD

**Prioridade:** MEDIUM
**Effort:** S (4h)
**Refs:** ADR-197, ADR-202 (opcional novo)

**Descricao.** Dois sub-itens:

1. Hook em logout flow chama `clearResumeSnapshot()` (export ja existe em `resumeSession.ts`). Privacy: shared device nao ve last track do user anterior. Idealmente tambem limpa `audio.queue.v1` + `audio.onboarding.seen.v1` (decidir em ADR-202).
2. `window.__audioPlayerLastResumeSnapshot` (atualmente exposto sempre) gated por `import.meta.env.DEV`. PROD nao expoe debug surface.

**Regras de negocio:**
- Logout pode acontecer de varios paths: button click, JWT expiry handler (apiRequest 401), admin force-logout. Centralizar em hook ou util `useLogout` se ainda nao existe.
- `clearResumeSnapshot()` e idempotente — safe chamar mesmo se ja vazio.
- Decision: limpar tambem queue + onboarding? **Default proposto**: sim queue (continha lessonIds do user), nao onboarding (UX preference, pode persistir cross-user — discutir em ADR-202).

**Criterio de aceitacao:**
- [ ] Logout via UI button -> `localStorage.audio.resume.v1` removido.
- [ ] Logout via 401 handler -> idem.
- [ ] `window.__audioPlayerLastResumeSnapshot` undefined em PROD build (test grep dist OR mock `import.meta.env.PROD=true`).
- [ ] Em DEV continua exposto (test mock `DEV=true`).

**Modulos afetados:**
- `client/src/contexts/AudioPlayerContext.tsx` (window expose gate).
- `client/src/lib/audio-engine/resumeSession.ts` (idempotency confirmar).
- Logout entry points (descobrir via Grep `clearAuth` / `logout` em client/src/).

---

#### W-B3: LOW-1 stopPropagation no onboarding "?" click

**Prioridade:** LOW
**Effort:** XS (2h)
**Refs:** Wave B reviewer LOW-1

**Descricao.** Click no help icon "?" do MiniPlayerBar (que abre `ShortcutsHelpPopover`) NAO deve disparar outside-click handler do `MiniPlayerOnboarding` tooltip (dismiss prematuro). Adicionar `e.stopPropagation()` no onClick do icon.

**Regras de negocio:**
- Tambem aplicavel ao keydown `?` shortcut — se onboarding aberto, primeiro dismiss onboarding, depois abre help (ou inverso — definir order).
- **Decisao default proposta:** "?" sempre abre help; onboarding auto-dismiss aceita esse click como qualquer outro (NAO bloqueia abertura do help).

**Criterio de aceitacao:**
- [ ] Onboarding visivel + click no help icon "?" -> help abre + onboarding fecha (ordem definida).
- [ ] Ghost focus popover (sintoma original) nao reproduz.

**Modulos afetados:**
- `client/src/components/audio-player/MiniPlayerBar.tsx`.
- `client/src/components/audio-player/MiniPlayerOnboarding.tsx`.

---

#### W-B4: LOW-2 input click gate em keyboard shortcuts

**Prioridade:** LOW
**Effort:** S (4h)
**Refs:** ADR-195, Wave B reviewer LOW-2

**Descricao.** Verificar que Space/J/L/0-9 (numeric seek) NAO disparam quando foco em `<input>`, `<textarea>`, `[contenteditable=true]`, ou inside Radix Dialog/Popover. ADR-195 ja menciona `isInteractiveTarget` gate — confirmar cobertura COMPLETA para shortcuts MP3 (numeric seek) + onboarding "?" key. Adicionar testes que faltam.

**Regras de negocio:**
- `isInteractiveTarget(event.target)` checa `tagName ∈ {INPUT, TEXTAREA, SELECT}` + `contentEditable` + `closest('[role=dialog]')`.
- Aplicavel a TODOS shortcuts MP1/MP3 (Space/M/Esc/J/L/0-9/?/Up/Down).
- Pode estender check para foco dentro de search bar do CommandPalette (Coach).

**Criterio de aceitacao:**
- [ ] Test: foco em `<input>` + Space -> input recebe espaco, audio NAO toggla.
- [ ] Test: foco em search dentro de Radix Popover + "5" -> input recebe "5", audio NAO seek para 50%.
- [ ] Test: foco em `<textarea>` + "?" -> textarea recebe "?", onboarding/help NAO abre.

**Modulos afetados:**
- `client/src/hooks/useKeyboardShortcuts.tsx`.

---

#### W-B5: LOW-3 PT-BR error mapping

**Prioridade:** LOW
**Effort:** S (1d)
**Refs:** ADR-198, Wave B reviewer LOW-3

**Descricao.** Mapear codigos de erro browser (`DEMUXER_ERROR_NO_SUPPORTED_STREAMS`, `MEDIA_ELEMENT_ERROR`, `NETWORK_ERROR`, HTTP 404/403/500) para mensagens PT-BR amigaveis exibidas no error banner do `MiniPlayerBar`.

**Regras de negocio:**
- Centralizar em util `audioErrorMessages.ts` (`mapAudioErrorToMessage(error: AudioError): string`).
- Telemetria continua o erro tecnico (granular, ja per ADR-198). UI mostra a versao PT-BR.
- Fallback generico: "Erro ao carregar audio. Tente novamente." quando codigo nao mapeado.

**Mapeamento minimo:**
| Codigo / Tipo | Mensagem PT-BR |
|---|---|
| `DEMUXER_ERROR_*` | "Formato de audio nao suportado." |
| `MEDIA_ELEMENT_ERROR_NETWORK` | "Falha de rede. Verifique sua conexao." |
| HTTP 404 | "Faixa nao encontrada." |
| HTTP 403 | "Sem permissao para esta faixa." |
| HTTP 500/503 | "Servidor indisponivel. Tente novamente em instantes." |
| `buffering_timeout` | "Audio demorou a carregar. Tente novamente." |
| (default) | "Erro ao carregar audio. Tente novamente." |

**Criterio de aceitacao:**
- [ ] Util `mapAudioErrorToMessage` cobre 7+ casos do mapeamento.
- [ ] `MiniPlayerBar` error banner mostra PT-BR.
- [ ] Telemetria `audio_track_error` mantem reason granular (en/tecnico) — back-compat ADR-198.

**Modulos afetados:**
- `client/src/lib/audio-engine/audioErrorMessages.ts` (novo).
- `client/src/components/audio-player/MiniPlayerBar.tsx`.

---

#### W-B6: INFO-1 JSDoc @internal em test-only exports

**Prioridade:** INFO (NIT)
**Effort:** XS (1h)
**Refs:** Wave B reviewer INFO-1

**Descricao.** Adicionar `@internal` JSDoc + comentario explanatorio em exports que existem apenas para tests:

- `_RESUME_TTL_MS`, `_RESUME_THROTTLE_MS` em `resumeSession.ts`.
- `_ONBOARDING_TIMEOUT_MS`, `_ONBOARDING_ATTACH_DELAY_MS` em `MiniPlayerOnboarding.tsx`.
- `MemoryStorage` em `tests/setup.ts` (lesson #15 polyfill localStorage).
- `_resetForTests()` em qualquer service que tenha.

**Criterio de aceitacao:**
- [ ] Cada export listado tem `/** @internal Test-only ... */` JSDoc.
- [ ] Type-check passa (tsc 0).

**Modulos afetados:**
- Lista acima.

---

#### W-B7: INFO-2 dropar aria-label redundante Radix Dialog

**Prioridade:** INFO (NIT)
**Effort:** XS (1h)
**Refs:** Wave B reviewer INFO-2

**Descricao.** Radix `DialogPrimitive.Title` ja gera `aria-labelledby` automaticamente apontando para o titulo. `aria-label` adicional em `DialogPrimitive.Content` e redundante e pode confundir screen readers (double announcement).

Remover de:
- `ShortcutsHelpPopover.tsx` (migrado pra Radix em Wave B INFO-1).
- `LessonPickerDialog.tsx` (se aplicavel — verificar).

**Criterio de aceitacao:**
- [ ] Component nao tem `aria-label` no Content; tem `<DialogTitle>` interno.
- [ ] Test a11y RTL: `getByRole('dialog', { name: /atalhos/i })` ainda passa (labelledby funciona).

**Modulos afetados:**
- `client/src/components/audio-player/ShortcutsHelpPopover.tsx`.
- `client/src/components/audio-player/LessonPickerDialog.tsx`.

---

## 5. Requisitos Nao-Funcionais

- **Zero breaking changes** em API publica do `AudioPlayerContext` ou `IAudioSourceDriver`.
- **Migration 0080 aditiva** — novo coluna JSONB sem drop da varchar antiga nesta sprint.
- **Performance:** cron transcription cap 100 lessons/run com 1s sleep entre Mux API calls (rate limit defensivo). Webhook responde <500ms.
- **Privacy/Sec:** PROD nao expoe `window.__audioPlayerLastResumeSnapshot`. Mux webhook valida HMAC.
- **A11y:** error banner mantem `role=alert`. Dialog/Popover sem aria-label redundante.
- **i18n:** error messages em PT-BR (ja idioma UI default).

---

## 6. Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| POST | `/api/mux/webhooks` | Recebe events Mux (track.ready) — W-A2 | HMAC signature |

Nenhum endpoint REST publico novo alem do webhook. Wave B itens sao 100% client-side.

---

## 7. Modelos de Dados Afetados

### `library_lessons` (alteracao — W-A4)

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `transcription_preview` | varchar | nullable, DEPRECATED | Mantida MP3.2 para back-compat. Drop MP3.3+. |
| `transcription_previews` | JSONB | nullable | **NOVA** — `{ lang: previewString }`. Default `NULL`. |

Migration 0080:
- ADD COLUMN `transcription_previews JSONB`
- Backfill `UPDATE library_lessons SET transcription_previews = jsonb_build_object('pt', transcription_preview) WHERE transcription_preview IS NOT NULL`
- Rollback: DROP COLUMN.

---

## 8. Integracoes Externas

| Servico | Proposito | Quando |
|---|---|---|
| Mux REST API | List tracks, download VTT, configure `generated_subtitles` | W-A1 upload, W-A2 cron + webhook |
| Mux Webhooks | Push event `video.asset.track.ready` | W-A2 |
| Whisper (local binary) | Fallback transcription | W-A3 (gated env) |

---

## 9. Cenarios de Teste Derivados

### Happy Path
- [ ] W-A1: Upload lesson via codepath atualizado -> Mux gera track `pt` auto.
- [ ] W-A2: Lesson criada + Mux webhook chega -> `transcription_preview` populado <30s.
- [ ] W-A2: Cron diario varre 50 NULL lessons -> 50 NOT NULL (com mock Mux).
- [ ] W-A3: Lesson com Mux track NULL 24h + WHISPER_FALLBACK_ENABLED -> preview via Whisper.
- [ ] W-A4: User EN ve preview EN; user PT ve preview PT.
- [ ] W-B1: Retry click 1x -> 1 dispatch.
- [ ] W-B2: Logout -> snapshot limpo + queue limpa (decidir onboarding).
- [ ] W-B3: Click "?" durante onboarding -> help abre, no ghost focus.
- [ ] W-B4: Foco em input + Space -> texto digitado, audio nao toggla.
- [ ] W-B5: Erro 404 Mux track -> banner mostra "Faixa nao encontrada".

### Validacao de Input / Edge
- [ ] W-A1: Mux 400 lang invalido -> asset criado sem caption + warn.
- [ ] W-A2: HMAC invalido -> 401.
- [ ] W-A2: Webhook chega 2x mesmo asset -> no-op 2a vez.
- [ ] W-A4: Lesson sem nenhum preview -> UI mostra fallback "Sem preview disponivel" (ou esconde slot).

### Regras de Negocio
- [ ] W-A2: cron skip quando `MUX_TOKEN_ID` ausente.
- [ ] W-A2: cron gated por `TRANSCRIPTION_INGEST_ENABLED=false`.
- [ ] W-A3: gated por `WHISPER_FALLBACK_ENABLED=false` default.
- [ ] W-A3: timeout 5min mata subprocess.
- [ ] W-B1: Click 2x rapido -> 1 dispatch + lock liberado em 30s safety.
- [ ] W-B2: `window.__audio...` undefined em PROD build.
- [ ] W-B4: Foco em Radix dialog input -> shortcuts ignorados.

### Edge Cases
- [ ] W-A4: Backfill migration idempotente (rodar 2x).
- [ ] W-A4: JSONB key conflict (`pt` ja existe + ingest novo) -> sobrescreve com warn.
- [ ] W-B1: Retry 3x falha consecutiva -> banner mostra "Maximo de tentativas excedido" (ja existe ADR-198, regressao).
- [ ] W-B5: Erro nao mapeado -> fallback generico.

### Regressao baseline (manter verde)
- [ ] 339/339 mini-player suites continuam verdes.
- [ ] tsc 0.
- [ ] Library 116/116.
- [ ] Coach + server baseline.

---

## 10. Fora de Escopo

- Cross-device Spotify sync.
- Equalizer / Lyrics / Voice.
- Mobile Queue UI.
- Floating icon position.
- Resume-after-Coach.
- Drop coluna varchar `transcription_preview` (defer MP3.3).
- Whisper modelo `medium`/`large` (custo proibitivo CPU local).
- Multi-lang UI selector (user usa lang do profile — sem dropdown novo).
- Reescrita `Reflect.construct` MP2 INFO-3 (LOW, defer indefinido).

---

## 11. Tier List ICE — Priorizacao Recomendada

Score ICE = (Impact * Confidence * Ease) onde escala 1-10. Founder pode cortar tudo abaixo do score 100 sem perder valor critico.

| Item | Impact | Confidence | Ease | ICE | Recomendacao |
|---|---|---|---|---|---|
| **W-A2** Cron + webhook trigger | 9 | 9 | 5 | **405** | **MUST** (sem isso transcription nunca popula em PROD) |
| **W-B1** Race lock retry | 7 | 9 | 9 | **567** | **MUST** (correctness, cheap fix) |
| **W-B5** PT-BR error mapping | 7 | 10 | 8 | **560** | **MUST** (UX persona BR) |
| **W-B4** Input gate shortcuts | 7 | 9 | 8 | **504** | **MUST** (correctness teclado) |
| **W-A1** Mux `generated_subtitles` | 8 | 8 | 7 | **448** | **SHOULD** (unlock W-A2 sem upload manual) |
| **W-B2** Logout clear + window gate | 6 | 9 | 7 | **378** | **SHOULD** (privacy/sec NIT) |
| **W-B3** stopPropagation onboarding | 5 | 9 | 10 | **450** | **SHOULD** (visivel ao user, trivial) |
| **W-A4** Multi-lang JSONB | 5 | 7 | 6 | **210** | **NICE** (futuro-proof, sem demanda imediata) |
| **W-B7** aria-label redundante | 4 | 8 | 10 | **320** | **NICE** (a11y polish, trivial) |
| **W-B6** JSDoc @internal | 3 | 10 | 10 | **300** | **NICE** (docs, trivial) |
| **W-A3** Whisper fallback | 6 | 5 | 3 | **90** | **CUT/DEFER** (Docker complexity vs demanda baixa hoje) |

**Pacote MUST (4 items, ~2-3d total):** W-A2, W-B1, W-B4, W-B5.
**Pacote MUST+SHOULD (7 items, ~5-6d total):** + W-A1, W-B2, W-B3.
**Pacote completo (11 items, ~12-15d total):** + W-A4, W-B6, W-B7, W-A3.

Recomendacao: **executar MUST+SHOULD (7 items) em 1 sprint** + jogar W-A4 + W-B6 + W-B7 em sprint de polish geral pos-cluster + W-A3 vira backlog "se demanda emergir".

---

## 12. Dependencias

- Wave A merge em `main` confirmado (commit `7025b58a` ja em main per founder).
- Wave B merge em `main` confirmado (commit `8bb6b4c5` ja em main).
- `MUX_TOKEN_ID` + `MUX_TOKEN_SECRET` no `.env` PROD — pendente founder (per memory Wave A).
- Migration 0079 (ellipsis backfill) aplicada em PROD — pendente founder psql.
- ADRs 199-201 (202 opcional) criados pelo `system-architect` apos aprovacao desta spec.

---

## 13. Notas de Implementacao (opcional)

- **W-A2 cron schedule:** sugerir `0 4 * * *` UTC (1h BRT) — baixo trafego. Cap 100 lessons/run + sleep 1s entre Mux calls -> ~100s + Mux API tempo (~10ms).
- **W-A3 Whisper binary:** preferir `whisper.cpp` (statico, single binary, sem Python) vs `openai-whisper` (Python venv complica Docker). ADR-200 decide.
- **W-B1 race lock pattern:** `useRef<boolean>(false)` + check-and-set. NAO usar state (re-render desnecessario + race ainda possivel entre render e click).
- **W-B2 logout entry points:** Grep `clearAuth\|signOut\|logout` em `client/src/` antes de implementar — pode haver 3-4 entry points hoje.
- **W-B4 isInteractiveTarget:** confirmar implementacao atual cobre Radix Popover/Dialog (`closest('[role=dialog]')` + `closest('[data-radix-popper-content-wrapper]')`).
- **W-B5 mapping util:** pequeno (~30 linhas). Tests via tabela `cases.forEach(...)`.

---

## 14. Verificacao Final

- [x] Cada RF tem prioridade, effort, criterio de aceitacao, refs.
- [x] Cenarios de teste cobrem happy / validacao / regras / edge / regressao.
- [x] Fora de escopo preenchido.
- [x] Tier list ICE para founder priorizar.
- [x] Numeros ADR/migration reservados.
- [x] Diagramas sugeridos listados.
- [x] Modulos afetados por RF.
- [x] Sem ambiguidade em decisoes default propostas (W-B2 queue clear, W-B3 click order).
