# Sprint Mini Player 3.3 — Polish & Hardening Pos-Cluster

## Status

**Proposta** — 2026-05-22. Aguardando aprovacao founder.

Sprint **polish/hardening pos-cluster MP3.2**. **ZERO feature nova.** Fecha tech-debt residual + dois follow-throughs de ADRs ja merged (199-201). Cap 1-2d (founder pediu "polish low risk").

Pronta para `system-architect` apos founder priorizar tier list ICE (ver §11).

---

## Origem

- **Cluster MP shipped:** MP1 (`9d2957ac`/`bfdb22cc`) + MP1.1 + MP1.2/1.3 (`10516ab2`) + MP2 (`0fb31bb8`) + MP3 (`b1e8793c`) + MP3.1 Wave A (`7025b58a`) + MP3.1 Wave B (`8bb6b4c5`/`86fa9e89`) + MP3.2 (`15e36cdf`).
- **Ultimo commit cluster:** `15e36cdf` (MP3.2 — 43 files, +4672/-35). MP3.2 spec em `Docs/specs/sprint-mini-player-3-2.md` define base.
- **Memory anchors:**
  - `memory/session_2026-05-22-marathon-mp3.2-ai3.2-deploy.md` — MP3.2 shipped + defer list MP3.3
  - `memory/session_2026-05-22-mp3.1-wave-a-hardening.md` — Wave A defer items
  - `memory/session_2026-05-22-mp3.1-wave-b-ux-tier3.md` — Wave B defer items
- **ADRs vivos cluster Mini Player:** 187-202 (transcription + audio surface). 203-205 sao AI-3.2 (off-cluster).
- **Proximos numeros disponiveis:**
  - ADR: **206** (proximo livre apos 205 abortsignal-llm-cap)
  - Migration: **0081** (apos 0080 transcription_previews_jsonb)
- **Branch alvo:** novo `feature/mini-player-3-3-polish` saido de `main` @ `15e36cdf`.

---

## Persona-alvo

Mesma persona dos sprints MP1-MP3.2. **MP3.3 nao introduz cohort novo nem feature visivel ao usuario** — polish interno + completar follow-through de decisoes tomadas em MP3.2.

---

## 1. Sumario Executivo

**Objetivo.** Fechar **13 testes test-harness OOM** que ficaram defer-MP3.3 em MP3.2 (impedment lesson #14/#26/#38 ESM/CJS + `useEffect[ctx]` loop), completar 2 follow-throughs de ADRs ja merged (199 multi-lang upload Mux + 201 multi-lang previews JSONB), tomar decisao explicita sobre Whisper fallback (ADR-200 hoje "Proposed → DEFER"), e limpar 8 itens LOW/INFO residuais dos reviewers MP3.1/MP3.2.

**Tese.** MP3.2 entregou 83/91 verde + 593/600 sibling suites + tsc 0 + zero regressao, mas deixou 15 testes test-harness em `.skip` (efetivo: 13 distintos — 2 duplicados entre arquivos) + ADR-200 Whisper como placeholder no codigo. Esses itens **nao bloqueiam producao** (cluster esta deploy-ready per `Docs/deploy/sprint-deploy-readiness.md`), mas viraram cauda de tech-debt. MP3.3 e o **sprint de fechamento do cluster** antes do founder migrar foco para outro modulo.

**Constraints duros.**
- **ZERO feature nova ao usuario** — toda mudanca eh refactor de test, doc, JSDoc, ou env CSV expansion.
- **Zero mudanca em `LessonViewer` / `PodcastPlayer`** (Biblioteca-1).
- **Zero breaking change** em `AudioPlayerContext` API publica ou `IAudioSourceDriver`.
- **Zero migration nova** (Cluster A so refactor de test; Cluster B so reusa coluna JSONB 0080 ja shipped).
- **Sprint cap 1-2d** efetivo (~12-16h trabalho). Se passar de 16h, descope Cluster B ou Cluster C.
- **Zero regressao baseline** cluster MP (~593 suites Wave A baseline + 83/91 MP3.2).

**6 Clusters em 1 linha:**

- **Cluster A (HIGH, M, 6-8h) Tests OOM fix — 13 testes** — Refactor `useEffect(() => { ctx.playTrack(...) }, [ctx])` loop em 3 arquivos test + migrar `require()` → `await import` em `dialog-aria-label-dedup.test.tsx` (lesson #14/#26/#38).
- **Cluster B (MEDIUM, M, 4-6h) Multi-lang completar (ADR-201 follow-through)** — `MUX_GENERATED_SUBTITLES_LANGS` CSV expand para `pt,en` + ingestor itera multi-lang tracks + UI fallback chain `[userLang, 'pt', 'en', first]`.
- **Cluster C (LOW, S, 2h) Whisper decisao explicita (ADR-200 follow-through)** — Documentar criterios ativacao (>=3 NULL >7d OR demanda founder) + status ADR-200 "Proposed → DEFER" → "Accepted — DEFER" + manter codigo placeholder. **NAO implementar Whisper real.**
- **Cluster D (INFO, XS, 2h) LOW/INFO residual MP3.2** — 5 itens trivia: CLAUDE.md env doc (`WHISPER_*`), `logoutCleanup.ts` cleanup, `defaultListCandidates` promover, ADR-200 status, JSDoc `@internal` consistency.
- **Cluster E (LOW, S, 2h) Wave B follow-ups residual** — 2 itens: `retryCurrent` race lock cleanup unmount (MEDIUM-2 MP3.2), webhook log transient vs internal (MEDIUM-3 MP3.2). MEDIUM-4 cron-vs-webhook ja resolvido HIGH-3 — apenas confirmar.
- **Cluster F (LOW, S, 2h) Backfill CLI subtitle regeneration** — Flag CLI `--regenerate-subtitles` no `scripts/backfill-transcription-preview.ts` pede Mux gerar tracks novas para legacy lessons sem tracks.

**Total breakdown:** A (8h MUST) + B (6h SHOULD) + C (2h MUST) + D (2h MUST) + E (2h NICE) + F (2h NICE) = **~22h max**. Pacote MUST (A+C+D) = ~12h = sprint cap 1-2d.

**Out of scope MP3.3 (defer indefinido OR MP4+):**
- Whisper real implementation (ADR-200 fica DEFER ate demanda emergir — Cluster C decide gating).
- Cross-device sync Spotify, Equalizer, Lyrics, Voice control.
- Mobile Queue UI responsivo.
- Drop coluna varchar `transcription_preview` (carregar legacy permanente por enquanto).
- Reescrita `Reflect.construct` MP2 INFO-3.
- Reviewer R2 round novo (esse sprint nao tem novidade de implementacao critica suficiente — Cluster A eh test-only, Cluster B eh CSV+iteracao, demais sao docs).

---

## 2. Contexto e Motivacao

### 2.1 Cluster A — 13 tests OOM bloqueando cobertura completa

MP3.2 documentou 15 testes test-harness defer-MP3.3 com 2 padroes de impedimento (lesson #14/#26/#38):

**Padrao 1 — `useEffect[ctx]` infinite loop OOM (12 testes em 3 arquivos):**

```tsx
// ANTI-PATTERN nos test files atuais:
function TestHarness() {
  const ctx = useAudioPlayer();
  useEffect(() => {
    ctx.playTrack({ ... });  // dispara update no context
  }, [ctx]);                 // ctx muda apos playTrack → re-dispara → OOM
}
```

3 arquivos com esse padrao:
- `tests/client/mini-player/retryCurrent.race-lock.test.tsx` — 3 testes
- `tests/client/mini-player/onboarding-help-interaction.test.tsx` — 3 testes
- `tests/client/mini-player/keyboard-shortcuts-input-gate.test.tsx` — 7 testes (numeric seek 0-9 + space + j/l + outros)

**Padrao 2 — `require()` em test `.tsx` com componente ESM (1 teste):**

```tsx
// ANTI-PATTERN em dialog-aria-label-dedup.test.tsx:
const Mod = require('../../client/src/components/audio-player/LessonPickerDialog');
// Vitest 4 + ESM deps → "Cannot find package '@/lib'" ou similar
```

1 teste em `tests/client/mini-player/dialog-aria-label-dedup.test.tsx` (LessonPickerDialog).

**Impacto se nao fechar:**
- 13/(83+~327 baseline mini-player) = ~3.2% cobertura faltando em sub-area UX importante (race lock + onboarding + input gate + a11y dialog).
- Lesson #14/#26/#38 ja sao recorrentes — sem fix, prox sprint reproduz o mesmo padrao.
- `vitest run` mostra `.skip` highlight, ruido em CI dashboards.

### 2.2 Cluster B — ADR-201 follow-through incompleto

MP3.2 shipou migration 0080 (`transcription_previews JSONB`) + ingestor escreve `{ pt: "..." }` + storage le com fallback chain. **Mas:**

1. `MUX_GENERATED_SUBTITLES_LANGS` env (W-A1) atualmente lida como single string `'pt'` no `createMuxAssetWithSubtitles`. Code path NAO itera CSV.
2. Ingestor `transcriptionIngestor.ts` filtra `tracks` mas processa apenas 1 lang por chamada (loop nao existe para multi-track ready).
3. UI lookup ja tem fallback chain `[userLang, 'pt', 'en', firstAvailable]` (per ADR-201) mas **so foi exercitado com `pt`** ate hoje. Se asset Mux gerar `en` em paralelo, ingestor sobrescreve ou ignora — comportamento nao deterministico.

**Estado real:** ADR-201 documenta o modelo multi-lang mas o pipeline so produz multi-lang quando a env CSV expandir + ingestor iterar. Cluster B fecha essa lacuna.

**Impacto se nao fechar:**
- Schema multi-lang virtual — coluna existe mas nao popula em multiplos langs.
- Persona cohort "EN-speaking BR poker player" (existe — alguns aulas Coach narrative em ingles) nao tem preview EN ate Cluster B.
- Backfill CLI Cluster F depende disso para fazer sentido (regen subtitles em multi-lang).

### 2.3 Cluster C — Whisper ADR-200 limbo

ADR-200 atualmente esta `Status: Proposed → DEFER` (per W-A3 ja merged em MP3.2 como placeholder + Cluster F decision lifted). Codigo em `server/services/whisperFallback.ts` (se shipou) ou helper retorna `'whisper_not_implemented'`.

**Sintomas do limbo:**
- ADR diz "DEFER" mas tem codigo placeholder no repo — dev novo entra e nao sabe se devia implementar.
- Sem criterio de ativacao escrito, decisao "implementar agora vs depois" eh sempre re-litigada.
- Custo ~$0.006/min OpenAI Whisper API (sem CPU overhead local). Founder precisa decisao binaria.

**Cluster C nao implementa Whisper.** So formaliza:
1. Promover ADR-200 status para `Accepted — DEFER ate criterios de ativacao`.
2. Definir criterios em ADR (ex: ">= 3 lessons NULL ha >7d apos asset Mux ready, OR demanda explicita founder com plano de custo OpenAI definido").
3. Documentar custo estimado (~$0.006/min — `whisper-1` model OpenAI).
4. Documentar gating ENV `WHISPER_FALLBACK_ENABLED=true` ja existe — mantem.
5. Sub-task no backlog: "Implementar Whisper real quando criterios ativarem" — vira issue futura.

### 2.4 Cluster D — LOW/INFO residual MP3.2 reviewer

Reviewer R1/R2 MP3.2 deixou 5 itens trivia defer:

| Item | O que e | Effort |
|---|---|---|
| D1 | `WHISPER_PROVIDER`/`WHISPER_MODEL` env vars sem doc em CLAUDE.md §4 | 15min |
| D2 | `logoutCleanup.ts` lista `audio.resume.v1` mas snapshot ja foi clear em MP3.2 W-B2 — string nunca foi escrita; remover ou comentar | 15min |
| D3 | `defaultListCandidates` (cron `0 4 * * *` UTC) retorna `[]` em fallback — promover `_listCandidatesForTests` test-only para production-grade `listLessonsNeedingTranscription` | 1h |
| D4 | ADR-200 status "Proposed → DEFER" → "Accepted — DEFER" (Cluster C cobre essa parte, D4 e duplicate-pointer) | 0h (Cluster C) |
| D5 | JSDoc `@internal` consistency em test-only exports (`_RESUME_*`, `_ONBOARDING_*`, `MemoryStorage`, etc) — Wave B INFO-1 ja parcialmente shipped MP3.2; verificar gaps | 30min |

Total ~2h. Trivial, mas evita re-litigacao futura.

### 2.5 Cluster E — Wave B follow-ups residual

3 itens MEDIUM/INFO documentados em Wave B reviewer R1 (MP3.1) que NAO foram tratados em MP3.2:

| Item | Status MP3.2 | Acao MP3.3 |
|---|---|---|
| E1 (MEDIUM-2) `retryCurrent` race lock cleanup unmount | Race lock shipou (MEDIUM-1) mas cleanup unmount nao | clearTimeout em useEffect cleanup + `retryInProgressRef.current = false` em close() |
| E2 (MEDIUM-3) Webhook log distinguir transient (5xx) vs internal (validation/parse) | Webhook log generico | Log separado + telemetria distinta para alarmistica |
| E3 (MEDIUM-4) Cron-vs-webhook write path divergence | Resolvido em MP3.2 fix wave HIGH-3 | Confirmar via test snapshot — sem nova mudanca |

### 2.6 Cluster F — Backfill CLI regen subtitles

`scripts/backfill-transcription-preview.ts` atualmente itera lessons NULL + Mux ja tem tracks ready → ingest preview. **Mas:** lessons criadas antes de Wave A (sem `generated_subtitles` no upload Mux) nao tem tracks. Esse caminho ainda exige founder rodar manual no Mux Dashboard.

Cluster F: flag CLI `--regenerate-subtitles` que faz `POST /video/v1/assets/:id/tracks` (Mux API) com `text_source: 'generated_vod'` + `language_code: 'pt'` para cada lesson sem track text ready. Depois cron normal pega.

**Impacto se nao fechar:** Founder fica refem do Mux Dashboard manual para legacy lessons (~50-100 aulas estimadas).

---

## 3. Decisoes Arquiteturais Esperadas (ADRs)

Sistema-architect criara apos aprovacao desta spec. Numeros reservados:

- **ADR-206** — Test harness anti-patterns ESM/CJS + `useEffect[ctx]` loop. Documenta os 2 padroes (lessons #14/#26/#38) com codigo "antes/depois" canonico. Vira referencia obrigatoria para todo test futuro de hook/context.
- **ADR-207** — Multi-language transcription upload + ingestion pipeline (follow-through ADR-199/201). Define CSV expand contract + ingestor iteracao multi-track + UI lookup ordem.
- **ADR-208** — Whisper fallback gating policy (substitui status "Proposed → DEFER" do ADR-200). Define criterios ativacao + custo OpenAI Whisper API + decisao "API hosted vs local binary" pendente quando ativarmos.

Diagramas em `Docs/architecture/diagrams/mini-player-3-3/`:

1. `test-harness-useeffect-loop-fix.mermaid` — flowchart "useEffect[ctx] OOM" → `useRef` flag OR `[]` deps → estavel.
2. `multilang-ingestion-flow.mermaid` — sequence Mux multi-track ready → ingestor itera langs → JSONB `{pt, en}` populated.
3. `whisper-gating-decision-tree.mermaid` — flowchart criterios ativacao → ENV flag → API call.

---

## 4. Requisitos Funcionais

### Cluster A — Tests OOM fix

---

#### RF-A1: useEffect[ctx] loop refactor em 3 arquivos

**Prioridade:** HIGH
**Effort:** M (4-5h)
**Refs:** Lessons #14/#26/#38, ADR-206 (novo)

**Descricao.** Refactor o `useEffect` que dispara `ctx.playTrack` (ou similar mutacao de context) para nao re-disparar em loop. 2 estrategias canonicas (escolher por teste):

1. **`[]` deps + `useRef` flag** — dispara 1x no mount, marca ref pra nao re-disparar.
2. **Imperative call em test body** — `act(() => { ctx.playTrack(...) })` sem useEffect.

**Regras de negocio:**
- Implementer **NAO modifica codigo de producao** (`AudioPlayerContext`, `MiniPlayerBar`, etc). Mudanca eh 100% em test files.
- Cada teste reativado deve passar individualmente (`vitest run path/to/file.test.tsx`).
- Suite completa nao pode regredir (~339 mini-player verde mantem).
- ADR-206 criada antes do refactor — descreve padrao canonico para futuros tests.

**Criterio de aceitacao:**
- [ ] `tests/client/mini-player/retryCurrent.race-lock.test.tsx` — 3 testes verde sem OOM.
- [ ] `tests/client/mini-player/onboarding-help-interaction.test.tsx` — 3 testes verde sem OOM.
- [ ] `tests/client/mini-player/keyboard-shortcuts-input-gate.test.tsx` — 7 testes verde sem OOM.
- [ ] Suite completa `npx vitest run tests/client/mini-player/` verde sem timeout/heap issue.
- [ ] `vitest run` cold start < 60s (sem retencao de memoria).

**Modulos afetados:**
- 3 test files acima (test-only).

---

#### RF-A2: `require()` → `await import` em dialog-aria-label-dedup

**Prioridade:** HIGH
**Effort:** S (1-2h)
**Refs:** Lesson #14/#26, ADR-206

**Descricao.** Migrar `require('../../client/src/components/audio-player/LessonPickerDialog')` para `await import(...)` em `tests/client/mini-player/dialog-aria-label-dedup.test.tsx`. Vitest 4 + ESM dep transitiva (`@/lib`, `@radix-ui/*`) quebra com `require()` sync mas funciona com dynamic `import()`.

**Regras de negocio:**
- Test deve ser `async` no `it(...)` que faz import.
- Se test usa render imediato apos import, encapsular em `await act(async () => {...})`.
- Considerar alternativa shim re-export (`@/components/audio-player/LessonPickerDialogShim` que reexporta) se `await import` complicar — decidir caso a caso.

**Criterio de aceitacao:**
- [ ] `dialog-aria-label-dedup.test.tsx` 1 teste verde sem `require()`.
- [ ] LessonPickerDialog renderiza com Radix DialogTitle + sem aria-label redundante (regra original do teste).
- [ ] `tsc 0` mantido.

**Modulos afetados:**
- `tests/client/mini-player/dialog-aria-label-dedup.test.tsx`.
- (opcional) `client/src/components/audio-player/LessonPickerDialogShim.tsx` se shim necessario.

---

### Cluster B — Multi-lang completar (ADR-201 follow-through)

---

#### RF-B1: CSV expand `MUX_GENERATED_SUBTITLES_LANGS` no upload

**Prioridade:** MEDIUM
**Effort:** S (2h)
**Refs:** ADR-199, ADR-201, ADR-207 (novo)

**Descricao.** Atualmente `createMuxAssetWithSubtitles` (server/services/muxClient.ts ou equivalente) le `process.env.MUX_GENERATED_SUBTITLES_LANGS` como string single. Refator para split CSV + map para array Mux `generated_subtitles: [{ language_code, name }]`.

**Regras de negocio:**
- Default `'pt'` (single) se env ausente.
- Parse `'pt,en'` → `[{ language_code: 'pt', name: 'Portugues (auto)' }, { language_code: 'en', name: 'English (auto)' }]`.
- Whitelist langs: `pt`, `en`, `es` (futuro). Reject outros com warn (Mux limita supported langs).
- Trim whitespace + lowercase normalize: `' PT , EN '` → `['pt','en']`.
- Mux 400 (lang invalido em qualquer item do array) → tentar sem o lang invalido + warn (best-effort). Se todos invalidos → criar asset sem caption + warn.

**Criterio de aceitacao:**
- [ ] Test: env `'pt'` → 1 entry no payload `generated_subtitles`.
- [ ] Test: env `'pt,en'` → 2 entries no payload.
- [ ] Test: env ausente → default `[{ language_code: 'pt', ... }]`.
- [ ] Test: env `'pt,xx'` (xx invalido) → 1 entry valido `pt` + warn log para `xx`.
- [ ] Test: env `' PT , EN '` (whitespace) → 2 entries `['pt','en']`.

**Modulos afetados:**
- `server/services/muxClient.ts` (ou onde upload Mux acontece — confirmar via Grep).
- `tests/server/mini-player-3-3/muxClient.csvLangs.test.ts` (NEW).

---

#### RF-B2: Ingestor itera multi-lang tracks por asset

**Prioridade:** MEDIUM
**Effort:** M (2-3h)
**Refs:** ADR-201, ADR-207

**Descricao.** `transcriptionIngestor.ts:ingestPreviewFromMux` atualmente pega `tracks.find(...)` (primeiro track text ready). Refator para iterar TODOS os tracks `type=text` + `status=ready` + `text_source ∈ {generated_vod, uploaded}` + escrever 1 entry JSONB por lang.

**Regras de negocio:**
- Para cada track ready: extract VTT → preview truncated → `writeTranscriptionPreview(lessonId, lang, preview)` (per lang).
- Ordem prioritaria langs: `subtitles` > `captions` (per ADR-196).
- Se 2 tracks mesmo lang (improvavel mas possivel), prefere `subtitles` source primeiro; se ainda empate, prefere o mais recente (`created_at` DESC).
- Idempotente: re-rodar ingestor com mesmo asset NAO duplica + NAO sobrescreve preview existente do mesmo lang (skip + log debug).
- Telemetria: `transcription_ingest_succeeded` incrementa 1x por lang ingested (nao 1x por asset).

**Criterio de aceitacao:**
- [ ] Test: asset com 2 tracks ready `['pt','en']` → 2 escritas JSONB `{ pt: "...", en: "..." }`.
- [ ] Test: asset com 1 track `pt` + 1 track `pt` (duplicado) → 1 escrita (skip 2a).
- [ ] Test: asset com 1 track `en` ja existente em JSONB + nova ingestao → no-op (idempotente).
- [ ] Test: nenhum track ready → return `reason:'no_tracks_ready'`.
- [ ] Telemetria conta corretamente (mock spy).

**Modulos afetados:**
- `server/services/transcriptionIngestor.ts`.
- `server/storage/transcriptionPreviewStorage.ts` (verificar `writeTranscriptionPreview` aceita lang param — ADR-201 ja shipou).
- `tests/server/mini-player-3-3/transcriptionIngestor.multilang.test.ts` (NEW).

---

#### RF-B3: UI lang selector toggle (default user.preferredLanguage)

**Prioridade:** LOW
**Effort:** S (1-2h)
**Refs:** ADR-201, ADR-207

**Descricao.** Hoje `serializeLessonForApi` escolhe preview via `user.preferredLanguage` (server-side, ADR-201). Se multiplos langs disponiveis (`{pt: ..., en: ...}`), UI pode oferecer toggle para usuario escolher manualmente.

**Regras de negocio:**
- API GET `/api/library/lessons/:slug` retorna `transcriptionPreview: string | null` (mantido — back-compat) **+ `transcriptionPreviewLangs: string[]`** (novo campo, lista de langs disponiveis).
- UI (LessonPickerDialog OR ContentBlock que mostra preview) renderiza toggle so se `transcriptionPreviewLangs.length > 1`.
- Selector minimal: 2-3 chips inline `[PT] [EN]` — click muda preview exibido.
- Selector NAO persiste preferencia user — eh ad-hoc no momento. (Preferencia persistida fica fora-de-escopo MP3.3.)
- Default selecionado = `user.preferredLanguage` se presente nos langs, senao primeiro da lista.

**Criterio de aceitacao:**
- [ ] API endpoint retorna `transcriptionPreviewLangs` array.
- [ ] Test backend: 0 langs → `[]`; 1 lang → `['pt']`; 2 langs → `['pt','en']`.
- [ ] UI: 1 lang → sem toggle, preview direto.
- [ ] UI: 2 langs → 2 chips visiveis, click muda preview text.
- [ ] Default chip selecionado bate com `user.preferredLanguage`.

**Modulos afetados:**
- `server/routes/library.ts` (ou onde `serializeLessonForApi` esta).
- `client/src/components/audio-player/LessonPickerDialog.tsx` (ou onde preview render).
- `tests/server/mini-player-3-3/library.previewLangs.test.ts` (NEW).
- `tests/client/mini-player-3-3/preview-lang-toggle.test.tsx` (NEW).

**NOTA:** Se RF-B3 mostrar gulf de implementacao > 2h, founder pode descopar. Sem RF-B3, ADR-201 funcional (server escolhe lang), so falta toggle UX que pode ser MP4+.

---

### Cluster C — Whisper decisao explicita

---

#### RF-C1: Promover ADR-200 + documentar criterios ativacao

**Prioridade:** LOW (mas estritamente necessaria para fechar limbo)
**Effort:** S (1h)
**Refs:** ADR-200, ADR-208 (novo)

**Descricao.** Atualizar ADR-200 status `Proposed → DEFER` para `Accepted — DEFER ate criterios ativacao`. Criar ADR-208 (ou Addendum em ADR-200) com:

1. Criterios de ativacao explicitos:
   - `(SELECT COUNT(*) FROM library_lessons WHERE transcription_previews IS NULL AND mux_asset_id IS NOT NULL AND created_at < NOW() - INTERVAL '7 days') >= 3` — automacao via cron de monitor (sem trigger automatico).
   - OR demanda explicita founder com aprovacao de custo (US$ ~$0.006/min * volume estimado).
2. Implementacao prevista quando ativar:
   - **Decisao "API hosted" vs "local binary"** — preferir API OpenAI Whisper hosted (`whisper-1` model) por simplicidade Docker.
   - Cost gate: ENV `WHISPER_COST_BUDGET_USD_MONTHLY` (default `10`). Cron skip se total acumulado > budget.
   - Gating ENV: `WHISPER_FALLBACK_ENABLED=true` (default `false`).
3. Codigo placeholder atual (`server/services/whisperFallback.ts` se existe) mantido inerte — retorna `reason:'whisper_disabled'`.

**Regras de negocio:**
- ADR muda status documentalmente (zero linhas de codigo TS).
- ADR-208 vira issue futura "Implementar Whisper real" — adicionar ao backlog `Docs/strategy/` ou similar.

**Criterio de aceitacao:**
- [ ] ADR-200 status atualizado para `Accepted — DEFER`.
- [ ] ADR-208 criada com criterios + custo + decisao API-hosted-vs-local.
- [ ] CLAUDE.md §10 menciona ADR-208 em "Pendencias tecnicas conhecidas".
- [ ] `server/services/whisperFallback.ts` (se existe) mantem retorno graceful.

**Modulos afetados:**
- `Docs/architecture/decisions/200-whisper-local-fallback.md` (status change).
- `Docs/architecture/decisions/208-whisper-gating-policy.md` (NEW).
- `CLAUDE.md` §10 (atualizar).

---

### Cluster D — LOW/INFO residual MP3.2

---

#### RF-D1: Doc env vars Whisper em CLAUDE.md §4

**Prioridade:** INFO
**Effort:** XS (15min)
**Refs:** Cluster C, MP3.2 LOW-1

**Descricao.** Adicionar em CLAUDE.md §4 (Variaveis de Ambiente):
- `WHISPER_FALLBACK_ENABLED` — gate global (default `false`).
- `WHISPER_PROVIDER` — `'openai'` (futuro) — quando RF-C1 ativar.
- `WHISPER_MODEL` — `'whisper-1'` (OpenAI default).
- `WHISPER_COST_BUDGET_USD_MONTHLY` — `10` (budget cap).

**Criterio de aceitacao:**
- [ ] 4 envs documentadas em CLAUDE.md §4 com descricao + default + ref ADR-208.

**Modulos afetados:**
- `CLAUDE.md`.

---

#### RF-D2: Cleanup `logoutCleanup.ts` lista `audio.resume.v1`

**Prioridade:** INFO
**Effort:** XS (15min)
**Refs:** MP3.2 W-B2 LOW-2

**Descricao.** `logoutCleanup.ts` (ou util equivalente) lista `audio.resume.v1` como chave a limpar. Mas em MP3.2 W-B2 foi mostrado que essa chave **nunca eh escrita** (snapshot persiste em outra chave OR limpa imediatamente). Remover ou comentar com TODO link.

**Regras de negocio:**
- Verificar via Grep se `audio.resume.v1` ainda existe em algum write path. Se nao, remover linha.
- Se existe (lesson #15 polyfill testes), comentar `// TODO: confirmar — historicamente nao usado, manter ate verificar PROD logs`.

**Criterio de aceitacao:**
- [ ] `logoutCleanup.ts` corrigido (remover OR comentar).
- [ ] Test snapshot atualizado se aplicavel.

**Modulos afetados:**
- `client/src/lib/audio-engine/logoutCleanup.ts` (ou path equivalente).

---

#### RF-D3: Promover `defaultListCandidates` para production-grade

**Prioridade:** LOW
**Effort:** S (1h)
**Refs:** MP3.2 W-A2 LOW-3

**Descricao.** Cron `0 4 * * *` UTC usa `defaultListCandidates` (export `_listCandidatesForTests`) que retorna `[]` em fallback. Promover para funcao production-grade `listLessonsNeedingTranscription(opts: { limit: number })` em storage layer.

**Regras de negocio:**
- Query: `SELECT id, mux_asset_id FROM library_lessons WHERE transcription_previews IS NULL AND mux_asset_id IS NOT NULL ORDER BY created_at DESC LIMIT $1`.
- Cap padrao `limit=100` (per W-A2 cap).
- Export named `listLessonsNeedingTranscription` (sem underscore prefix — production-grade).
- Manter `_listCandidatesForTests` como wrapper test-only se algum teste depender da sigla.

**Criterio de aceitacao:**
- [ ] `server/storage/transcriptionPreviewStorage.ts` exporta `listLessonsNeedingTranscription`.
- [ ] Cron chama essa funcao em vez de `defaultListCandidates`.
- [ ] Test integration: insert 5 lessons (3 NULL + 2 com preview) → funcao retorna 3.

**Modulos afetados:**
- `server/storage/transcriptionPreviewStorage.ts`.
- `server/cron/cronRunner.ts` (ou `server/cron/transcriptionIngest.ts`).
- `tests/server/mini-player-3-3/listLessonsNeedingTranscription.test.ts` (NEW).

---

#### RF-D4: JSDoc `@internal` consistency em test-only exports

**Prioridade:** INFO
**Effort:** XS (30min)
**Refs:** MP3.2 INFO-1, Wave B INFO-1

**Descricao.** Wave B parcialmente shipou `@internal` em alguns exports (`_RESUME_*`, `_ONBOARDING_*`). MP3.2 deixou gap. Sweep + adicionar `@internal` em todos test-only exports do cluster MP:

Lista alvo (Grep `^export (const|function) _` + manual review):
- `_RESUME_TTL_MS`, `_RESUME_THROTTLE_MS` em `resumeSession.ts` (MP3.1 Wave B shipped).
- `_ONBOARDING_TIMEOUT_MS`, `_ONBOARDING_ATTACH_DELAY_MS` em `MiniPlayerOnboarding.tsx` (MP3.1 Wave B shipped).
- `_listCandidatesForTests` em transcriptionPreviewStorage.ts (MP3.2).
- `MemoryStorage` em `tests/setup.ts` (polyfill lesson #15).
- `_resetForTests()` em qualquer service do cluster MP.

**Criterio de aceitacao:**
- [ ] Cada export listado tem `/** @internal Test-only ... */` JSDoc.
- [ ] tsc 0 mantido.
- [ ] Lint pass (se ESLint enforce @internal annotations).

**Modulos afetados:**
- Lista acima (touch leve).

---

### Cluster E — Wave B follow-ups residual

---

#### RF-E1: `retryCurrent` race lock cleanup unmount

**Prioridade:** LOW
**Effort:** XS (1h)
**Refs:** MP3.2 MEDIUM-2

**Descricao.** Race lock shipou em MP3.1 (`retryInProgressRef`). Cleanup unmount NAO. Se Provider desmontar (e.g. logout) durante retry pendente, ref fica zumbi (proximo mount herda).

**Regras de negocio:**
- `useEffect` cleanup em AudioPlayerContext:
  ```tsx
  useEffect(() => {
    return () => {
      retryInProgressRef.current = false;
      if (retrySafetyTimeoutRef.current) clearTimeout(retrySafetyTimeoutRef.current);
    };
  }, []);
  ```
- Garantir reset tambem em `close()` (idempotente).

**Criterio de aceitacao:**
- [ ] Test: unmount Provider durante retry pendente → ref reseta + timer limpa.
- [ ] Test: re-mount apos cleanup → retry funciona normal (lock liberado).
- [ ] Zero memory leak.

**Modulos afetados:**
- `client/src/contexts/AudioPlayerContext.tsx`.

---

#### RF-E2: Webhook log distinguir transient vs internal

**Prioridade:** LOW
**Effort:** XS (1h)
**Refs:** MP3.2 MEDIUM-3

**Descricao.** Webhook Mux atualmente loga generico em error path. Distinguir:
- **Transient** (5xx Mux, network timeout) → log `warn` + retry next webhook (Mux retry automatico).
- **Internal** (validation, parse error, DB conflict) → log `error` + responder 200 anyway (evita Mux retry loop) + alarmistica.

**Regras de negocio:**
- Util `classifyError(err): 'transient' | 'internal'` em handler webhook.
- Telemetria: `mux_webhook_error_transient` vs `mux_webhook_error_internal`.

**Criterio de aceitacao:**
- [ ] Test: Mux retorna 503 → log `warn` + telemetria `transient`.
- [ ] Test: payload parse error → log `error` + telemetria `internal` + responde 200.

**Modulos afetados:**
- `server/routes/muxWebhooks.ts`.

---

#### RF-E3: Confirmar cron-vs-webhook write path divergence resolved

**Prioridade:** INFO
**Effort:** XS (15min)
**Refs:** MP3.2 MEDIUM-4

**Descricao.** MP3.2 fix wave HIGH-3 resolveu divergence cron-vs-webhook em write path. RF-E3 eh apenas **confirmacao via test snapshot** — sem nova mudanca de codigo.

**Criterio de aceitacao:**
- [ ] Test ja existente (ou novo se faltar) valida que cron e webhook escrevem usando MESMA funcao `writeTranscriptionPreview`.
- [ ] Snapshot in code review confirmando paridade.

**Modulos afetados:**
- `tests/server/mini-player-3-3/cron-webhook-paridade.test.ts` (NEW se faltar).

---

### Cluster F — Backfill CLI regen subtitles

---

#### RF-F1: Flag `--regenerate-subtitles` no backfill script

**Prioridade:** LOW
**Effort:** S (2h)
**Refs:** ADR-199, MP3.2 W-A2

**Descricao.** Adicionar flag CLI `--regenerate-subtitles` em `scripts/backfill-transcription-preview.ts`. Quando flag presente, antes de tentar ingest:

1. Se lesson tem `mux_asset_id` mas Mux nao tem track `type=text` ready → chamar Mux API `POST /video/v1/assets/:asset_id/tracks` com `text_source: 'generated_vod', language_code: $lang` (loop sobre `MUX_GENERATED_SUBTITLES_LANGS`).
2. Aguardar processing Mux (timeout 5min por lesson — Mux gera caption em background ~1-3min).
3. Ingest preview apos track ready.

**Regras de negocio:**
- Flag opt-in (sem flag, comportamento atual mantido — skip lessons sem track).
- Cap CLI `--limit N` ja existe — respeitar.
- Mux 409 (track ja existe pra esse lang) → skip + log debug.
- Mux 400 (lang invalido) → log warn + continua proxima lesson.
- Log progress por lesson: `[1/50] lesson=abc123 asset=xyz789 langs=[pt,en] status=requesting_tracks`.

**Criterio de aceitacao:**
- [ ] `npx tsx scripts/backfill-transcription-preview.ts --regenerate-subtitles --limit 5` funciona.
- [ ] Test mock Mux: lesson sem track → POST /tracks chamado → polling track ready → ingest.
- [ ] Test mock Mux 409 → skip + log + sem erro.

**Modulos afetados:**
- `scripts/backfill-transcription-preview.ts`.
- `server/services/muxClient.ts` (extensao: `requestGeneratedTrack(assetId, lang)`).
- `tests/server/mini-player-3-3/backfill-regen-subtitles.test.ts` (NEW).

---

## 5. Requisitos Nao-Funcionais

- **Zero breaking changes** em API publica do cluster MP (AudioPlayerContext, IAudioSourceDriver, endpoints existentes).
- **Zero migration nova** (Cluster B reusa coluna JSONB 0080).
- **Zero regressao baseline** cluster MP (~593/600 sibling suites + 339 mini-player + 83 MP3.2 + 116 library — todos manter verde).
- **Performance:** Cluster A nao deve aumentar tempo total `vitest run tests/client/mini-player/` em > 5%.
- **Cobertura:** apos Cluster A, defer-list MP3.3 cai de 13 testes para 0 (`.skip` count zero em mini-player suite).
- **Doc:** ADRs 206-208 + CLAUDE.md §4 + §10 atualizados.

---

## 6. Endpoints Previstos

| Metodo | Rota | Descricao | Auth | Cluster |
|---|---|---|---|---|
| GET | `/api/library/lessons/:slug` | **CAMPO NOVO** `transcriptionPreviewLangs: string[]` | existing | B (RF-B3) |

Nenhum endpoint novo. Apenas extensao campo opcional em endpoint existente.

---

## 7. Modelos de Dados Afetados

Nenhuma migration nova. Cluster B reusa `library_lessons.transcription_previews` (JSONB) shipada em migration 0080 (MP3.2). Cluster B so popula multiplos keys (`{ pt: ..., en: ... }`) onde antes populava 1 (`{ pt: ... }`).

---

## 8. Integracoes Externas

| Servico | Proposito | Quando |
|---|---|---|
| Mux REST API | `POST /video/v1/assets/:id/tracks` (request generated track) | F1 — backfill regen subtitles |
| Mux REST API | List tracks multi-lang | B2 — ingestor itera |

Nenhuma integracao nova. Endpoints Mux ja consumidos em MP3.2.

---

## 9. Cenarios de Teste Derivados

### Happy Path
- [ ] A1: 3 testes `retryCurrent.race-lock` verdes apos refactor.
- [ ] A1: 3 testes `onboarding-help-interaction` verdes.
- [ ] A1: 7 testes `keyboard-shortcuts-input-gate` verdes.
- [ ] A2: 1 teste `dialog-aria-label-dedup` verde com `await import`.
- [ ] B1: env `'pt,en'` → 2 entries no payload Mux.
- [ ] B2: asset 2 tracks ready → JSONB `{ pt, en }`.
- [ ] B3: API retorna `transcriptionPreviewLangs: ['pt','en']`; UI mostra 2 chips.
- [ ] F1: CLI `--regenerate-subtitles` request track + ingest.

### Validacao de Input / Edge
- [ ] B1: env `'pt,xx'` → 1 entry `pt` + warn.
- [ ] B1: env `' PT , EN '` → `['pt','en']`.
- [ ] B2: re-ingest mesmo lang → no-op idempotente.
- [ ] F1: Mux 409 (track ja existe) → skip + log.

### Regras de Negocio
- [ ] C1: ADR-200 status `Accepted — DEFER` documentado.
- [ ] C1: ADR-208 com criterios ativacao escritos.
- [ ] D3: `listLessonsNeedingTranscription` query correta com cap 100.
- [ ] E1: unmount durante retry → ref reset + timer limpa.
- [ ] E2: Mux 503 → telemetria transient; parse error → telemetria internal.

### Edge Cases
- [ ] A1: useEffect refactor nao introduz race condition entre tests (run paralelo OK).
- [ ] B2: 2 tracks mesmo lang `pt` → escolhe `subtitles > captions` per ADR-196.
- [ ] B3: API retorna `[]` quando nenhum preview → UI nao renderiza toggle.
- [ ] F1: lesson sem `mux_asset_id` → skip + log.

### Regressao baseline (manter verde)
- [ ] ~339 mini-player suites verde (mantem MP3.1).
- [ ] 83 MP3.2 verde.
- [ ] 116 library verde.
- [ ] 593+ sibling suites verde (AI-3.2 + coach baseline).
- [ ] `tsc --noEmit` exit 0.
- [ ] `npx vitest run` cold start < 60s.

---

## 10. Fora de Escopo

- Whisper REAL implementation (Cluster C eh decision-only — implementacao defer ate criterios ativarem).
- Cross-device sync Spotify (`playback_state` endpoint).
- Equalizer / Lyrics / Voice control.
- Mobile Queue UI responsivo.
- Floating icon position UI.
- Resume-after-Coach.
- Drop coluna varchar `transcription_preview` (manter legacy permanente por enquanto).
- Reflect.construct refactor (INFO-3 MP2, LOW).
- Lang preference user-persistente (RF-B3 selector eh ad-hoc, sem write `user_preferences.preferredLanguage`).
- Migration nova de schema.
- Mudanca em qualquer ADR pre-187 (cluster MP scoped).
- Auditoria de seguranca pos-MP3.2 (separar em sprint Security se demanda).

---

## 11. Tier List ICE — Priorizacao Recomendada

Score ICE = (Impact * Confidence * Ease) escala 1-10. Founder pode cortar Cluster B+F sem perder valor critico — pacote MUST (A+C+D) eh suficiente pra "fechar cluster".

| Item | Impact | Confidence | Ease | ICE | Recomendacao |
|---|---|---|---|---|---|
| **A1** useEffect loop refactor (12 tests) | 8 | 9 | 7 | **504** | **MUST** (cobertura faltando + lesson recorrente) |
| **A2** require → await import (1 test) | 5 | 9 | 9 | **405** | **MUST** (cheap, lesson recorrente) |
| **C1** ADR-200 → Accepted DEFER + ADR-208 | 7 | 10 | 10 | **700** | **MUST** (decisao bloqueada ha sprints) |
| **D1** Doc env Whisper CLAUDE.md | 4 | 10 | 10 | **400** | **MUST** (par com C1) |
| **D4** JSDoc @internal sweep | 3 | 10 | 10 | **300** | **MUST** (trivial, ja parcial) |
| **E1** retryCurrent unmount cleanup | 5 | 9 | 9 | **405** | **SHOULD** (correctness niche) |
| **D2** logoutCleanup audio.resume.v1 | 3 | 9 | 10 | **270** | **SHOULD** (cosmetica) |
| **D3** listLessonsNeedingTranscription | 4 | 8 | 7 | **224** | **SHOULD** (production-grade) |
| **E2** Webhook log transient vs internal | 5 | 8 | 7 | **280** | **SHOULD** (operacional) |
| **B1** CSV expand env | 5 | 8 | 8 | **320** | **NICE** (multi-lang habilita) |
| **B2** Ingestor multi-lang | 5 | 7 | 7 | **245** | **NICE** (depende B1) |
| **F1** CLI regenerate-subtitles | 6 | 7 | 6 | **252** | **NICE** (legacy backfill — founder dependent) |
| **E3** Cron-vs-webhook confirm | 2 | 10 | 10 | **200** | **NICE** (so test snapshot) |
| **B3** UI lang selector chips | 4 | 6 | 5 | **120** | **CUT/DEFER** (UX subjetivo, sem demanda imediata) |

**Pacote MUST (5 items, ~10-12h):** A1, A2, C1, D1, D4 → fecha lessons recorrentes + decisao Whisper + docs minimas.

**Pacote MUST+SHOULD (9 items, ~16-18h):** + E1, D2, D3, E2 → fecha tambem reviewer MP3.2 cleanup.

**Pacote completo (13 items, ~22-26h):** + B1, B2, F1, E3 (-B3) → fecha tambem multi-lang follow-through + backfill CLI.

**Pacote completo + B3 (14 items, ~24-28h):** + B3 → fecha UI lang selector tambem.

**Recomendacao Auto Mode:** executar **MUST+SHOULD (9 items, ~16h)** = cap 1.5 dia. Cluster B (multi-lang) descopado para MP3.4 OR rolado para sprint future quando demanda EN emergir. Cluster F (backfill) descopado para script manual ad-hoc founder.

**Recomendacao Founder explicita:** se Founder quiser cluster MP "100% feature-complete", executar **pacote completo sem B3** (13 items, ~22h, 2 dias).

---

## 12. Dependencias

- MP3.2 merged em `main` (commit `15e36cdf` — confirmado per memory marathon).
- Migration 0080 (transcription_previews JSONB) aplicada em PROD — pendente founder psql.
- `MUX_TOKEN_ID` + `MUX_TOKEN_SECRET` + `MUX_WEBHOOK_SECRET` no `.env` PROD — pendente founder.
- ADRs 206-208 criados pelo `system-architect` apos aprovacao desta spec.
- Branch novo `feature/mini-player-3-3-polish` saindo de `main` @ `15e36cdf` (lesson #24 — confirmar HEAD antes commit).

---

## 13. Notas de Implementacao (opcional)

- **A1 useEffect refactor padrao canonico** — preferir `useRef<boolean>(false)` flag + `useEffect(() => { if (firedRef.current) return; firedRef.current = true; ctx.playTrack(...) }, [])`. Evita `[ctx]` deps inteiramente.
- **A2 dynamic import** — `const { LessonPickerDialog } = await import('@/components/audio-player/LessonPickerDialog'); render(<LessonPickerDialog ... />)`. Eh `it('...', async () => { ... })`.
- **B1 CSV parse util** — pode reusar `shared/csv.ts` se existe; senao `value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)`. Whitelist `['pt','en','es']` em const.
- **B2 ingestor loop** — `for (const track of tracksByPriority) { await writeTranscriptionPreview(lessonId, track.lang, preview, { ifAbsent: true }); }`. Adicionar `ifAbsent` flag em storage funcao se ainda nao tem.
- **C1 ADR template** — usar formato Michael Nygard padrao (Context, Decision, Consequences, Alternatives Considered). ADR-208 referencia ADR-200 como predecessor + status.
- **D3 query** — usar Drizzle helper se existe `getLibraryLessonsByCondition` ou similar; senao raw query com `sql\`\``.
- **E1 cleanup pattern** — todo `useRef` que armazena state mutavel + todo `setTimeout` armazenado precisa cleanup em `useEffect(() => () => {...}, [])`.
- **F1 polling Mux** — Mux processa generated_vod em ~1-3min. Polling cap 5min com sleep 10s entre chamadas. Idempotente: se track ready entre polls, retorna imediato.

---

## 14. Verificacao Final

- [x] Cada RF tem prioridade, effort, criterio de aceitacao, refs.
- [x] Cenarios de teste cobrem happy / validacao / regras / edge / regressao baseline.
- [x] Fora de escopo preenchido.
- [x] Tier list ICE para founder priorizar (MUST/SHOULD/NICE/CUT).
- [x] Numeros ADR (206-208) reservados.
- [x] Migration nao necessaria (reusa 0080).
- [x] Diagramas sugeridos listados (3 mermaid).
- [x] Modulos afetados por RF.
- [x] Sem ambiguidade em decisoes default propostas (B1 whitelist langs, B2 idempotencia, C1 OpenAI API hosted).
- [x] Branch alvo + base commit definidos (`feature/mini-player-3-3-polish` saindo de `main@15e36cdf`).
- [x] Sprint cap (1-2d) bate com pacote MUST recomendado (~12-16h).
