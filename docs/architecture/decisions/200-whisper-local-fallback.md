# ADR-200 — Whisper Local Transcription Fallback Strategy

**Status:** **Proposed — DEFER (backlog)**
**Date:** 2026-05-22
**Sprint:** Mini Player 3.2 / Wave A / W-A3 (planejado, NAO shipped)
**Supersedes / Relates:** ADR-196 (Mux text tracks — fonte primaria), ADR-199 (auto-pipeline cron+webhook)

---

## Context

ADR-196 + ADR-199 cobrem 95% do happy path: Mux gera caption automatica via `generated_subtitles`, webhook ou cron ingere, `transcription_preview` populado em <24h.

**Cenarios nao cobertos:**

1. **Mux track NUNCA fica ready.** Asset criado mas Mux falhou auto-caption (raro, ~0.5% rate per Mux SLA). Lesson fica com preview NULL indefinidamente.
2. **Qualidade ruim PT-BR poker slang.** Mux auto-caption usa modelo generico (provavelmente Google Speech-to-Text ou similar). Termos de poker em PT-BR (`bolar`, `flat`, `c-bet`, `ICM`, `bubble`) sao traduzidos errado ou pulados. Preview vira inutil.
3. **Janela ressaca apos upload.** Lesson criada hoje 14h, founder espera mostrar pro usuario ate 16h. Mux auto-caption demora 5-30min. Webhook resolve, mas ha gap.

**Pergunta:** vale implementar fallback local via Whisper?

---

## Decision

**DEFER** Whisper local fallback. Manter `transcription_preview = NULL` quando Mux falha — UI ja trata graceful (`LessonPickerDialog` mostra slot vazio sem erro). Ativar W-A3 apenas se:

- **Criterio A (demanda):** ≥3 lessons em PROD com `transcription_preview NULL` por >7 dias (medido via dashboard admin futuro).
- **Criterio B (UX):** founder reporta >2 cursos onde preview Mux veio inutil por qualidade (slang/jargao).
- **Criterio C (escala):** projeto ultrapassa 500 lessons → custo de manter NULLs cresce, vale investir.

Quando criterio satisfeito, ativar via env `WHISPER_FALLBACK_ENABLED=true` (default `false` permanente). Codepath e modular — ingestor ja modela `reason` discriminado (ADR-196 §"Fallback") para permitir registrar `fallbackProviders` array.

---

## Options Considered

### Opcao 1: `openai-whisper` (Python subprocess)

- **Pros:** Modelo de referencia. Best-in-class quality. Active development.
- **Cons:**
  - Requer Python venv no container Docker → bloating ~500MB.
  - Subprocess overhead + JSON marshaling para Node.
  - Lesson #38 / #14 / #26 ja documentaram fragilidade de runtime bridging em projetos Node-only.

### Opcao 2: `whisper.cpp` (binary nativo C++)

- **Pros:** Single binary, ~100MB. Sem Python. Suporte CPU (sem GPU). Reading direto VTT-like output.
- **Cons:**
  - Build em-Docker requer compilacao C++ (ou prebuilt binary multi-arch).
  - Modelo `small` ~470MB, modelo `medium` ~1.5GB. Container deploy fica pesado.
  - 2x realtime na CPU = lesson de 10min toma ~5min processando. Cap 100 lessons/dia = ~8h CPU.

### Opcao 3: OpenAI Whisper API (cloud)

- **Pros:** Sem build/deploy issue. ~$0.006/min audio. Quality consistente.
- **Cons:**
  - Custo recorrente (50 lessons * 10min * $0.006 = $3/lote). Pequeno mas existe.
  - Dependencia externa adicional + API key + rate limit + privacy footprint.
  - Latencia ~5-10s por lesson + network.

### Opcao 4 (escolhida): DEFER ate criterio emergir

- **Pros:** Mantem MP3.2 enxuto. Zero risco regressao. Codepath modular permite plug-in futuro.
- **Cons:** Lessons com Mux falho ficam NULL — UX nao otima, mas nao quebrada.

---

## Trade-off Analysis (caso decida ativar)

| Aspecto | `whisper.cpp` local | OpenAI API |
|---|---|---|
| Custo upfront | Build complexity | API key setup |
| Custo recorrente | $0 (CPU compartilhada) | ~$0.006/min |
| Privacy | Audio nao sai do server | Audio enviado pra OpenAI |
| Quality PT-BR poker | `small`: regular / `medium`: bom | Excelente |
| Docker image size | +100-600MB | +0 |
| Latencia | ~5min/lesson (small) | ~10s/lesson |
| Failure mode | Subprocess timeout/OOM | API 429/500 |

**Recomendacao quando ativar:** OpenAI Whisper API. Trade-off (custo baixo vs build complexity) favorece cloud para projeto de scale atual. Privacy NAO e issue critico (audio ja em Mux/streaming publico via playback_id).

---

## Consequences

### Positivas (do DEFER)

- MP3.2 shipping rapido (sem 4-5d effort W-A3).
- Sem risco de Docker build quebrar (lesson historica: deps nativas custaram horas em sprints passados).
- Mantem opcao aberta — codepath modular ja existe.

### Negativas (do DEFER)

- Lessons com Mux falho continuam NULL ate criterio emergir.
- Quando ativar, sprint dedicado (1 sprint W-A3 + 1 sprint estabilizacao).

### Neutras

- Pipeline ADR-199 ja registra `reason:'no_text_tracks'` por lesson → dashboard futuro pode listar lessons orfas facilmente.

---

## Implementation Notes (quando ativar)

### Trigger logic (extensao ingestor)

```ts
// transcriptionIngestor.ts
async function ingestPreviewFromMux({ assetId, playbackId, lang }) {
  const muxResult = await tryMuxTracks(...);
  if (muxResult.ok) return muxResult;

  if (process.env.WHISPER_FALLBACK_ENABLED === 'true' &&
      muxResult.reason === 'no_text_tracks' &&
      lessonAgeDays(lesson) >= 1) {  // 24h grace
    return await tryWhisperFallback({ playbackId, lang });
  }

  return muxResult;  // NULL path
}
```

### Audio download

```
GET https://stream.mux.com/{playback_id}/audio.m4a
```
Mux fornece audio-only stream sem signing token (public playback).

### Quality threshold

Se preview gerado <10 chars OU contem >50% non-ascii noise → considerar `reason:'whisper_low_quality'` e nao gravar. Permite re-tentar com modelo melhor no futuro.

### Timeout

5min subprocess timeout. SIGKILL apos. Lesson volta pra NULL → re-tenta no proximo cron (idempotente).

### Env additions

| Variavel | Default | Required | Descricao |
|---|---|---|---|
| `WHISPER_FALLBACK_ENABLED` | `false` | No | Master switch fallback |
| `WHISPER_PROVIDER` | `openai_api` | No | `openai_api` ou `whisper_cpp` |
| `WHISPER_MODEL` | `whisper-1` (API) ou `small` (cpp) | No | Modelo override |
| `WHISPER_BINARY_PATH` | `/usr/local/bin/whisper` | No | Path do binary (so `whisper_cpp`) |
| `OPENAI_API_KEY` | — | Yes se `WHISPER_PROVIDER=openai_api` | API key |

---

## Confianca

**Media-baixa.** Decisao reversivel a baixo custo (DEFER vs ativar). Confianca alta em manter codepath modular para futuro; baixa em qualquer estimativa de qualidade real ate testar com poker slang BR concreto.

## References

- ADR-196 §"Fallback (Opcao B, DEFERIDO MP3.2)" — esta ADR formaliza o defer.
- ADR-199 — pipeline primaria. Fallback hooks no decision tree do ingestor.
- Whisper.cpp: https://github.com/ggerganov/whisper.cpp
- OpenAI Whisper API: https://platform.openai.com/docs/guides/speech-to-text
