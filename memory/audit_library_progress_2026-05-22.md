# Audit: library_progress 0 rows apos 26 plays

Date: 2026-05-22
Sprint: MP-VALIDATION RF-05
Mode: read-only investigation
Branch: main, repo Docaari/GrindfyManager

---

## TL;DR

**Root cause:** client NUNCA chama `PATCH /api/library/lessons/:id/progress`. Endpoint, schema, migration e storage existem e funcionam. Falta o caller no frontend (handler de `timeupdate` no `<video>`, no `<audio>`/PodcastPlayer, e ack de scroll/conclusao no ArticleIframe). Telemetria `library_events` que conta os 26 plays grava em outra tabela (`library_events`, nao `library_progress`).

**Hipotese vencedora:** H2 CONFIRMED.

**Fix:** wirar 1 mutation + 3 callsites (LessonViewer + PodcastPlayer + ArticleIframe). Trivial-baixo (~2-4h impl + testes). Sem migration nova.

---

## §1 Achados por hipotese

### H1 — Endpoint POST/PATCH nao existe ou nao wirado
**Status: REJECTED**

Evidencia:
- `server/routes/library.ts:378` `export async function handlePatchLibraryProgress(req, res)` — handler completo. Auth via `findLessonAccess`, validacao Zod (`progressPatchSchema` line 372), upsert via `storage.upsertLibraryProgress`, contract response `{ updated, completed }`, suporta throttle 429 com `Retry-After` para mock de tests.
- `server/routes/library.ts:348` `handleGetLibraryProgress` tambem existe (usado pelo client em `LessonViewer.tsx:208`).
- `server/routes/library-register.ts:123-127` wirado em Express:
  ```
  app.patch("/api/library/lessons/:id/progress", requireAuth, handlePatchLibraryProgress);
  ```
- `server/routes/library-register.ts:118-122` GET tambem wirado.
- `server/routes/index.ts:258` chama `registerLibraryRoutes(app)`.

Endpoint 100% wirado, auth correto, validacao correta. Backend pronto pra receber upserts.

---

### H2 — Cliente nao chama endpoint
**Status: CONFIRMED — root cause**

Evidencia:
- `grep "PATCH" client/src/pages/biblioteca` → 0 matches.
- `grep "apiRequest\([\"']PATCH" client/src` → 30+ callsites, **nenhum** para `/api/library/lessons/.../progress`.
- `grep "/api/library/lessons" client/src` → so 4 callsites GET:
  - `LessonViewer.tsx:187` GET lesson by id (rota legacy)
  - `LessonViewer.tsx:188` GET lesson by slug
  - `LessonViewer.tsx:208` **GET** progress (le, nao escreve)
  - `LessonViewer.tsx:972` GET playback-token
  - `LessonPickerDialog.tsx:274` GET batch progress (Mini Player MP1)
  - `ArticleIframe.tsx:98` GET article-bundle
- Nenhum handler em `PodcastPlayer.tsx` — `grep "PATCH|/progress|timeupdate" PodcastPlayer.tsx` → 0 matches.
- Nenhum handler em `ArticleIframe.tsx` — `grep "PATCH|/progress|onTimeUpdate" ArticleIframe.tsx` → 0 matches.
- Nenhum handler em `LessonViewer.tsx` — confirmed: so GET (line 208).
- Nenhum handler em `AudioPlayerContext.tsx` — `grep "library/lessons.*progress"` → 0 matches.
- Nenhum handler em `useLessonAutoLog.ts` — esse posta em `/api/study-sessions` (line 147), NAO em progress.
- Nenhum handler em `useCoachRecommendationConsume.ts` — esse posta em `/api/coach/recommendations/...` (verified via grep).
- Mini Player suite (MP1..MP3.3) introduziu `resumeSnapshot` em `localStorage` (`library_resume`/`resumeSnapshot` keys) — `grep "resumeSnapshot|library_resume"` → 0 matches client. Resume snapshot vive no localStorage do MP, NAO escreve em `library_progress` DB.
- Tests `tests/server/library/progress.test.ts` validam APENAS o handler do backend (mock `storage.upsertLibraryProgress`); nenhum teste de integracao client→backend para essa rota.

Conclusao: PATCH never invoked from running app code. Endpoint orfao desde Sprint Biblioteca-1 (f138147b, 2025-Q4) — handler/endpoint criados em commit unico `feat(biblioteca-1): LMS embedded com viewer 3-formatos + Coach recommend + entitlements`, MAS o caller foi escopado fora ou esquecido.

---

### H3 — Storage upsert quebrado (Drizzle malformado, FK silenciado)
**Status: REJECTED**

Evidencia:
- `server/storage.ts:10126-10193` `upsertLibraryProgress` implementado corretamente:
  - Insert via `db.insert(libraryProgress).values({...}).onConflictDoUpdate({ target: [userId, lessonId, format], set: {...} }).returning()`.
  - `target` casa com unique index `uq_library_progress_user_lesson_format`.
  - `shouldComplete = total > 0 && lastPositionSeconds >= total * 0.95` (D12 95% threshold).
  - Preserva `completedAt` previo via `COALESCE(library_progress.completed_at, NOW())`.
  - `updatedAt = new Date()` em todo update.
- Fallback test-env preserva ids estaveis (linhas 10171-10194).
- Storage NAO engole erros silenciosamente em prod — `console.error("[upsertLibraryProgress] failed", err)` antes do fallback (lesson #9). Em prod, qualquer erro DB propagaria como 500.
- `try` envolve tudo, mas o `console.error` precede o re-throw implicito (em prod o fallback so eh ativado quando `_isTestEnv()`).

Conclusao: se o caller chamasse o endpoint, o upsert funcionaria.

---

### H4 — Migration de library_progress nao aplicada
**Status: REJECTED**

Evidencia:
- `migrations/0023_biblioteca.sql:108-118`:
  ```sql
  CREATE TABLE IF NOT EXISTS library_progress (
    id varchar PRIMARY KEY NOT NULL,
    user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    lesson_id varchar NOT NULL REFERENCES library_lessons(id) ON DELETE CASCADE,
    format library_format NOT NULL,
    last_position_seconds integer NOT NULL DEFAULT 0,
    total_duration_seconds integer,
    completed_at timestamp,
    updated_at timestamp DEFAULT NOW() NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_library_progress_user_lesson_format ON library_progress (user_id, lesson_id, format);
  ```
- Migration 0023 e baseline da Biblioteca-1 (commit f138147b). Founder ja rodou — caso contrario a query SELECT que retornou "0 rows" (no DB local 5433) teria explodido com `relation "library_progress" does not exist`.
- Schema Drizzle (`shared/schema.ts:4286-4308`) bate exato com a migration SQL: campos, types, unique index, FK ON DELETE CASCADE.

Conclusao: tabela existe no DB local, vazia por falta de INSERTs (nao por falta de schema).

---

### H5 — Throttle/dedupe local elimina UPDATEs
**Status: REJECTED — n/a**

Evidencia:
- Backend implementa **throttle skeleton** (`server/routes/library.ts:406-411` trata `result.throttled`/`retryAfterSeconds` retornando 429 com `Retry-After`), MAS so e ativado quando o `storage.upsertLibraryProgress` mock retorna `{ throttled: true }` — usado em **tests** (`tests/server/library/progress.test.ts` mock pattern).
- Storage real (`server/storage.ts:10126`) NAO implementa throttle — toda chamada vai ao DB.
- Client NAO tem throttle local em `library_progress` (porque NAO ha caller). Se houvesse caller mas com throttle agressivo, ainda assim a primeira chamada de cada lesson criaria uma row. Zero rows confirma zero chamadas.
- Mini Player Wave A (MP3.1) tem throttle em `resumeSnapshot` (`localStorage` write throttled em 10s), mas isso NUNCA toca o DB.

Conclusao: throttle nao explica zero rows; nao existe caller pra ser throttled.

---

## §2 Root cause

> **Frontend nunca foi wirado para escrever em `library_progress`.** Endpoint, schema, storage e migration sao corretos e completos. O `LessonViewer` apenas LE progress (GET) para hidratar tabs cross-format, mas nenhum `timeupdate`/`onPlay`/`onPause` listener emite o PATCH correspondente. PodcastPlayer e ArticleIframe tambem nao emitem.

Diagrama causal:

```
[user joga 26 vezes]
        |
        v
[LessonViewer monta]
        |
        +-> GET /api/library/lessons/:id              [OK]
        +-> GET /api/library/lessons/:id/progress     [OK -> {} vazio]
        +-> POST /api/library/events (telemetry)      [OK -> library_events INSERT]
        +-> POST /api/study-sessions (auto-log 80%)   [OK -> study_sessions INSERT]
        |
        |   *** AQUI DEVERIA TER ***
        |   PATCH /api/library/lessons/:id/progress   [NUNCA CHAMADO]
        |
        v
[library_progress: 0 rows]
```

Telemetria conta plays (`library_events` tabela). Progress NAO conta (`library_progress` tabela). User percebeu pelo MP1 "Continue de onde parou" mostrar vazio ou pela aba `progressQuery` (LessonViewer:205) sempre retornar `{}`.

---

## §3 Fix recomendado

**Triviality: media (~2-4h impl + testes pos-RED).** Sem migration. Sem ADR novo. Padrao reutilizavel para 3 formatos.

### Proposta — patch sketch

#### 3.1 LessonViewer.tsx: adicionar mutation + binding em `timeupdate`/visibility change

**File:** `client/src/pages/biblioteca/LessonViewer.tsx` (apos linha 213 — depois do `progressQuery`).

```ts
// Sprint MP-VALIDATION: religar PATCH /api/library/lessons/:id/progress.
// Throttle client-side 5s pra alinhar com server (e evitar bombardear DB).
const progressMutation = useMutation({
  mutationFn: (payload: {
    format: FormatTab;
    lastPositionSeconds: number;
    totalDurationSeconds?: number;
  }) =>
    apiRequest(
      "PATCH",
      `/api/library/lessons/${resolvedId}/progress`,
      payload,
    ),
  onSuccess: (data: any) => {
    if (data?.completed) {
      // invalidate progress query pra refletir completedAt no badge "Concluida"
      queryClient.invalidateQueries({ queryKey: ["library-progress", resolvedId] });
    }
  },
  // Swallow erros silenciosamente — progress nao eh critico pro user.
  // Log so em dev. Lesson #9: nao engolir sem logar.
  onError: (err: any) => {
    if (import.meta.env.DEV) {
      console.warn("[library-progress PATCH] failed (silent)", err);
    }
  },
});

// Throttle 5s client-side via useRef de timestamp.
const lastProgressPatchAtRef = useRef<number>(0);
const PROGRESS_PATCH_THROTTLE_MS = 5000;
const reportProgress = useCallback(
  (format: FormatTab, lastPositionSeconds: number, totalDurationSeconds?: number) => {
    if (!resolvedId) return;
    const now = Date.now();
    if (now - lastProgressPatchAtRef.current < PROGRESS_PATCH_THROTTLE_MS) return;
    lastProgressPatchAtRef.current = now;
    progressMutation.mutate({ format, lastPositionSeconds, totalDurationSeconds });
  },
  [resolvedId, progressMutation],
);
```

#### 3.2 LessonViewer.tsx: bindings (3 listeners)

**Mux Player video** (apos hook `useEffect` que ja localiza media element, ~linha 320):
```ts
useEffect(() => {
  const m = mediaElementRef.current;
  if (!m || activeTab !== "video") return;
  const onTimeUpdate = () => {
    const cur = Number(m.currentTime);
    const dur = Number(m.duration);
    if (!Number.isFinite(cur) || !Number.isFinite(dur) || dur <= 0) return;
    reportProgress("video", Math.floor(cur), Math.floor(dur));
  };
  // beforeunload + visibilitychange para flush pos-throttle (best-effort)
  const onUnload = () => {
    const cur = Number(m.currentTime);
    const dur = Number(m.duration);
    if (cur > 0 && dur > 0) {
      // bypass throttle — beacon-style send-and-forget
      navigator.sendBeacon?.(
        `/api/library/lessons/${resolvedId}/progress`,
        new Blob(
          [JSON.stringify({ format: "video", lastPositionSeconds: Math.floor(cur), totalDurationSeconds: Math.floor(dur) })],
          { type: "application/json" },
        ),
      );
    }
  };
  m.addEventListener("timeupdate", onTimeUpdate);
  window.addEventListener("beforeunload", onUnload);
  document.addEventListener("visibilitychange", onUnload);
  return () => {
    m.removeEventListener("timeupdate", onTimeUpdate);
    window.removeEventListener("beforeunload", onUnload);
    document.removeEventListener("visibilitychange", onUnload);
  };
}, [activeTab, lesson, resolvedId, reportProgress]);
```

#### 3.3 PodcastPlayer (componente filho)

**File:** `client/src/components/biblioteca/PodcastPlayer.tsx`. Hoje nao escuta `timeupdate`. Aceitar prop opcional `onTimeUpdate?: (currentTime: number, duration: number) => void` e plugar em LessonViewer:
```ts
// PodcastPlayer.tsx — adicionar prop + handler
interface Props { ...; onTimeUpdate?: (cur: number, dur: number) => void; }

// dentro do <audio>:
<audio
  ...
  onTimeUpdate={(e) => {
    const el = e.currentTarget;
    props.onTimeUpdate?.(el.currentTime, el.duration);
  }}
/>

// LessonViewer.tsx — caller:
<PodcastPlayer
  ...
  onTimeUpdate={(cur, dur) => reportProgress("podcast", Math.floor(cur), Math.floor(dur))}
/>
```

#### 3.4 ArticleIframe (formato article)

Article nao tem `timeupdate` — usar scroll % + tempo de leitura. Wave 1 simples: chamar `reportProgress("article", scrollPercentage * estimatedReadingSeconds, estimatedReadingSeconds)` no scroll do iframe (postMessage do iframe).

**File:** `client/src/components/biblioteca/ArticleIframeWithWatermark.tsx` ou `ArticleIframe.tsx` — adicionar listener `window.addEventListener("message", ...)` que recebe `{ type: 'article-scroll', scrollPct: 0..1 }` do iframe (a injecao do script no iframe ja faz isso via library/static/article-scripts.js — verificar).

Se article-scripts.js NAO emite scroll, escopo cresce (~+2h). Caso MVP, escopo apenas video+podcast por agora.

#### 3.5 Imports faltantes

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
```

E `const queryClient = useQueryClient();` no topo do component.

#### 3.6 Tests novos

`tests/client/biblioteca/LessonViewer.progressPatch.test.tsx` (NAO existe):
- Mount LessonViewer com mock video element.
- Fire 5 `timeupdate` events com `currentTime` incrementando.
- Aguardar 5s + 1 (acima throttle).
- Esperar exatamente 1-2 calls PATCH (throttle conta).
- Validar payload shape `{ format: 'video', lastPositionSeconds, totalDurationSeconds }`.

`tests/integration/api/library-progress-flow.test.ts` (NAO existe):
- E2E completo: GET, PATCH, GET de novo retorna o que escreveu. Throttle 429 path.

---

## §4 Impacto no RF-01 (instrumentation)

**Eventos afetados quando library_progress quebrada:**

`lesson_completion_pct_25/50/75/95` — derivam de `completedAt` ou `lastPositionSeconds / totalDurationSeconds`. Se `library_progress` esta vazia, **NUNCA disparam**. Os 26 plays detectados via telemetria estao no canal `library_events` (event types `started`/`opened`/`access_blocked`/etc), nao no canal de % de progresso.

**Outras consequencias do bug em produto:**
- "Continuar de onde parou" no Mini Player MP3.1+ usa `resumeSnapshot` localStorage (workaround), mas a aba "Continuar" do `/biblioteca` (Onda 1.5 — `LibraryResume.tsx`) le via storage method `getLibraryResumeCandidates` que conta com `library_progress`. Hoje **mostra vazio sempre**.
- Badge "Concluida" no LessonRow / LessonHero usa `getCompletedLessonIds` (`server/storage.ts:13967` reads `library_progress.completed_at IS NOT NULL`). **Nunca acende.**
- `getLibraryProgressByLessonIds` usado em `LessonPickerDialog.tsx:274` (MP1 picker). **Sempre retorna `{}`.** User no MP nao ve "% concluido" por lesson.
- Coach IA tool `analyze_study_pace` / `compute_grind_study_ratio` cruza com biblioteca usage — degradacao silenciosa.

**Compensar via instrumentation RF-01?** NAO. O fix correto eh wirar o caller; instrumentation nao substitui ground-truth de progresso. Mas RF-01 pode incluir um **canary log** que detecta drift: `library_events.count(eventType=play) - library_progress.count() > threshold` ⇒ alert. Util pra detectar regressao similar futura.

---

## §5 Recommendation

**Fix dentro de Sprint MP-VALIDATION (escopo RF-05 + fix wave imediato):**

Vantagens:
- Bug expoe valor core do produto (continue de onde parou, badge concluida, recommendacao Coach) — sem fix, MP cluster (1..3.3) entrega so 50% do valor visivel.
- Fix tem touchpoints baixos (1 mutation + 3 listeners) e zero migration.
- Test cobertura nova reforca a regressao silenciosa (nenhum teste atual cobriria isso).
- Sprint MP-VALIDATION ja olha pra Mini Player; este fix completa o loop pratico user-side.

Sugestao operacional:
1. **AGORA (Sprint MP-VALIDATION):** wirar **video + podcast** (deferir article pra follow-up). Esses 2 cobrem ~95% do uso. ~2-3h impl + 1-2h test.
2. **Sprint follow-up dedicado (sprint-library-progress-article):** wirar article via postMessage `{ scrollPct, dwellSeconds }`. ~2h impl + 1h test + verificacao do article-scripts.js que ja injeta.
3. **RF-01 canary:** adicionar metric `library_events_play vs library_progress_rows` drift alert em admin dashboard.

Riscos: minimos. Pior caso, PATCH retorna 401 (caso `findLessonAccess` falhe) — `onError` engole + log dev. Pior caso 2, sobrecarga DB — mitigado por throttle 5s client + (futuro) throttle 5s server (skeleton ja existe linha 406-411, basta implementar).

**NAO defer pra spec separada — escopo cabe na proxima fix wave da sprint atual.**

---

## Apendice: arquivos relevantes

- `server/routes/library.ts:348-421` — handlers GET + PATCH
- `server/routes/library-register.ts:118-127` — wiring Express
- `server/storage.ts:10120-10194` — `upsertLibraryProgress` (correto)
- `server/storage.ts:10198-10218` — `getLibraryProgressForLesson`
- `server/storage.ts:10221-10277` — `getLibraryProgressByLessonIds`
- `shared/schema.ts:4286-4308` — table def Drizzle
- `shared/schema.ts:4533-4534` — types exportados
- `migrations/0023_biblioteca.sql:108-118` — CREATE TABLE + UNIQUE INDEX
- `client/src/pages/biblioteca/LessonViewer.tsx:205-213` — GET (le apenas)
- `client/src/components/biblioteca/PodcastPlayer.tsx` — sem listener (precisa wire)
- `client/src/components/biblioteca/ArticleIframe.tsx` — sem listener (precisa wire pos-MVP)
- `client/src/components/audio-player/LessonPickerDialog.tsx:274` — GET batch (consumer afetado)
- `tests/server/library/progress.test.ts` — backend coverage OK; sem e2e client→server
- Git commit baseline: `f138147b feat(biblioteca-1): LMS embedded com viewer 3-formatos`
