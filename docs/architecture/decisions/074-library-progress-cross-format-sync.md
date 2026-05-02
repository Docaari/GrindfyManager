# ADR-074 — Sync de progresso cross-format por SEGUNDOS absolutos, nao percentual

- Status: Proposto
- Data: 2026-05-01
- Sprint: Biblioteca-1 (RF-08)
- Decision owner: system-architect (formaliza founder D5 da spec)
- Related: ADR-073 (entitlements — pre-requisito para tracking), Spec 4 (refund 25% calcula consumo via mesma tabela)
- Spec: `Docs/specs/biblioteca-spec-1.md` RF-08 + D5 + D12

## Contexto

A Spec 1 entrega **Viewer Unificado 3-Formatos** (RF-08): video Mux +
podcast M4A + artigo HTML para a mesma aula, com **sincronizacao de
progresso entre formatos**. User assiste 12min do podcast no carro,
abre o video em casa, espera continuar exatamente onde parou.

Implementacoes possiveis de "exatamente onde parou":

- **Por percentual** — 50% do podcast = 50% do video.
- **Por segundos absolutos** — 720s no podcast = 720s no video.
- **Por marcadores semanticos** — "introducao", "exemplo 1", "exemplo
  2"... markers explicitos pelo creator.
- **Por subtitulo/transcript** — cross-reference frase exata.

Realidade do conteudo:
- **Podcast NotebookLM** gerado de artigo HTML — duracao ~25min para
  artigo de 4000 palavras.
- **Video MP4** com narracao + slides — duracao ~22min para mesmo
  conteudo (narrador mais conciso que speech sintetico).
- **Artigo HTML** com headers, paragrafos, code blocks — leitura
  estimada ~12min.

**Duracao DIFERE entre formatos.** Mesmo conteudo. Mesma sequencia
narrativa.

### Forcas em jogo

- **UX expectativa:** user espera retomar "onde parou" — nao 50% do
  novo formato com 30s de margem.
- **Refund 25%** (Spec 4 D5):
  - Calculo: `sum(lastPositionSeconds) / sum(totalDurationSeconds)` por
    user × curso.
  - Comparacao com threshold 25%.
  - Segundos absolutos sao **a unidade ideal** para refund — % derivado
    e estimativa de consumo.
- **Multiplos formatos com duracoes diferentes:**
  - Podcast 25min × Video 22min × Artigo 12min — % nao mapeia 1:1.
  - 720s podcast = 48% (720/1500); video em 720s = 54.5% (720/1320);
    artigo em 720s = 100%+ (720/720 = exato fim, ou alem).
  - Se sync por %, podcast 50% (~12.5min) = video 50% (~11min) — pula
    ~1.5min de conteudo.
  - Se sync por segundos, podcast 12.5min = video 12.5min — pula 0s.
- **Lesson #6 (conversao):** "sempre normalizar para [unidade canonica]
  antes de comparar". Tempo absoluto e canonico; % e derivado.
- **Lesson #11 (default minimo):** se segundo > totalDuration do
  formato destino, NAO recalcular ou pular para fim — fallback simples
  (open at start). Componente nao "ajuda".
- **Performance:** segundo absoluto e int4 em DB; % e float — int eh
  mais barato em compare/index.
- **Storage:** `library_progress(userId, lessonId, format, lastPositionSeconds)` —
  format e enum, position e int4. 1 row por (user × lesson × format).

## Opcoes Consideradas

### Opcao A: Sync por SEGUNDOS absolutos com fallback "abre no inicio" se exceder duracao do destino (ESCOLHIDA)

```ts
// Trocando tab Podcast (lastPosition=720s, totalDur=1500s) → Video (totalDur=1320s)
const newPosition = oldFormatProgress.lastPositionSeconds <= newFormatTotalDur
  ? oldFormatProgress.lastPositionSeconds
  : 0; // fallback abre no inicio
```

Schema:
```sql
CREATE TABLE library_progress (
  id varchar PRIMARY KEY,
  user_id varchar NOT NULL,
  lesson_id varchar NOT NULL,
  format library_format NOT NULL,  -- 'video' | 'podcast' | 'article'
  last_position_seconds integer DEFAULT 0,
  total_duration_seconds integer,  -- snapshot da duracao no momento
  completed_at timestamp,
  updated_at timestamp DEFAULT NOW(),
  UNIQUE (user_id, lesson_id, format)
);
```

`completedAt` populado quando `lastPositionSeconds >= totalDurationSeconds * 0.95`.

Cliente envia PATCH a cada 15s (throttled) ou em pause/seek/close.
Server upsert atomico via `INSERT ... ON CONFLICT DO UPDATE`.

- **Pros:**
  - **UX preserva ponto narrativo** — 12min e 12min em qualquer
    formato, sem deriva.
  - **Refund 25% trivial** — calcular `% = sum(positions) / sum(durations)`.
  - **Storage int4** — barato.
  - **Simplicidade** — sem mapeamento %, sem markers, sem lookup
    semantico.
  - **Fallback comportamento previsivel** — se exceder, abre no
    inicio (lesson #11 default minimo).
  - **Test triviall** — fixar `totalDuration` por formato + simular seek
    cross-tab.

- **Contras:**
  - **Deriva narrativa** — se podcast tem intro 30s mais longa que
    video, podcast em 30s = "apos intro" mas video em 30s = "no meio
    da intro". Aceitavel para MVP — conteudo bruto Docari nao tem
    desfasamentos grandes.
  - **Sem markers semanticos** — feature futura (Spec 5 ou 6 com
    bookmarks).

### Opcao B: Sync por PERCENTUAL

```ts
const pct = oldProgress.lastPositionSeconds / oldProgress.totalDurationSeconds;
const newPosition = Math.floor(pct * newFormatTotalDur);
```

- **Pros:**
  - Resilient a desfasamentos de duracao (1500s podcast 50% = 11min
    video se totalDur 22min — pula ponto narrativo mas continua "no
    meio").
  - Bigger picture preservada.

- **Contras:**
  - **Pula conteudo** — 50% video pode ser ~12.5min do video (mesmo
    com duracao maior do podcast). Usuario ve trecho diferente do
    onde parou.
  - **Refund computa** — refund threshold 25% precisa converter %
    consumido para tempo absoluto OU comparar % de cada formato
    separadamente. Complexa.
  - **Bug de retomada** — usuario que ouviu so a intro do podcast (5%)
    pula 5% do video — `5% × 1320s = 66s` — pula a intro toda do video.
  - **Rejeitada por:** UX inferior + refund mais complexo. % e
    derivacao, nao canonical.

### Opcao C: Markers semanticos (Spec futura)

Creator anota timestamps de "introducao", "exemplo 1", "conclusao" em
cada formato. Sync usa marker mais proximo.

- **Pros:**
  - Sync semantico — usuario sempre retoma em "exemplo 2", nao em
    timestamp arbitrario.
  - Power user: jump direto entre markers.

- **Contras:**
  - **Trabalho de creator alto** — anotar markers por formato (3x
    aulas).
  - **MVP aceleracao zero** — alpha tester ganha 0 valor adicional vs
    Opcao A.
  - **Rejeitada para MVP**, mas guardada como **Spec 5+ feature** —
    schema atual permite extensao via tabela `library_lesson_markers`.

### Opcao D: Sub-titulo/transcript cross-reference

Usar transcript do podcast para identificar frase em video/artigo.
NLP medio.

- **Pros:**
  - Preciso ao caracter.
  - Power feature.

- **Contras:**
  - **Custo dev altissimo** — pipeline transcript + alignment.
  - **Custo runtime** — query embedding por seek.
  - **Rejeitada por:** ROI zero em MVP. Considerar Spec 7+ se demanda
    real existir.

## Decisao

**Adotar Opcao A: sync por SEGUNDOS absolutos. Fallback "abre no
inicio" se segundo destino exceder `totalDurationSeconds` do novo
formato. `completedAt` populado em 95% threshold.**

### Detalhes-chave do design

1. **Schema:** `library_progress(userId, lessonId, format,
   lastPositionSeconds INT, totalDurationSeconds INT, completedAt
   timestamp, updatedAt timestamp)`. Composite unique
   `(userId, lessonId, format)`.
2. **Snapshot de duracao:** `totalDurationSeconds` populado no PATCH
   quando cliente envia `totalDurationSeconds` (default = duracao
   atual do formato em `library_lessons`). Permite calcular % mesmo
   se lesson update muda duracao no futuro (denormalizado).
3. **Upsert atomico:**
   ```sql
   INSERT INTO library_progress (...)
   VALUES (...)
   ON CONFLICT (user_id, lesson_id, format)
   DO UPDATE SET
     last_position_seconds = EXCLUDED.last_position_seconds,
     total_duration_seconds = COALESCE(EXCLUDED.total_duration_seconds, library_progress.total_duration_seconds),
     completed_at = CASE
       WHEN EXCLUDED.last_position_seconds >= library_progress.total_duration_seconds * 0.95
            AND library_progress.completed_at IS NULL
       THEN NOW()
       ELSE library_progress.completed_at
     END,
     updated_at = NOW();
   ```
4. **Throttle cliente** — debounce 15s em play continuo. Send em
   `pause/seek/close`. Reduces volume PATCH.
5. **Throttle servidor** — rejeita PATCH se ultimo update do mesmo
   `(user, lesson, format)` foi < 5s. Retorna `429 Retry-After: 5`.
   Defesa em depth contra bug de cliente.
6. **Sync trocando tab:**
   ```ts
   // user trocou tab podcast → video
   const podcastProg = progressMap.podcast;
   const videoTotalDur = lesson.formats.video?.durationSeconds;
   const startPosition = podcastProg && videoTotalDur && podcastProg.lastPositionSeconds <= videoTotalDur
     ? podcastProg.lastPositionSeconds
     : 0;
   videoPlayer.currentTime = startPosition;
   ```
   Componente `LessonViewer` calcula `startPosition` no `useEffect` de
   mudanca de tab.
7. **`completedAt` 95% threshold** — gating Spec 4 refund:
   - User assistiu 26% do curso → `completedAt` null em todas as
     lessons → refund elegivel (< 25%? sim, calcular agregado).
   - User assistiu 100% do curso → `completedAt` populado em 95%+ das
     lessons → `% = sum(min(positions, durations)) / sum(durations)` >
     95% → refund nao elegivel.
8. **Performance:**
   - Index `(user_id, lesson_id, format)` (composite unique ja serve).
   - Query catalogo: JOIN `library_progress` por user_id em batch.
   - PATCH p95 < 50ms.

### Tradeoffs aceitos

| Tradeoff | Aceito por que |
|---|---|
| **Deriva narrativa em desfasamentos grandes** | Conteudo bruto Docari (revisado pelo founder) sem desfasamentos extremos. Spec 5+ trata via markers. |
| **Sem markers semanticos** | Custo creator alto + MVP aceleracao zero. Schema permite extensao. |
| **Snapshot duracao** | Denormalizacao aceita para trabilidade — duracao snapshotted preserva % calculation se lesson editada. |
| **5s server throttle** | Defesa em profundidade — cliente bem comportado nao bate. |
| **`completedAt` 95% threshold (nao 100%)** | UX — credits/outro nao precisa ser assistido. Industria padrao (Netflix usa ~93%). |

### Quando rever esta decisao

- **Conteudo creator (Spec 6 marketplace)** — outro autor pode ter
  desfasamentos grandes; spec novo adiciona markers.
- **Demand de "Continue exatamente da frase X"** — Opcao D entra como
  Spec 7+.
- **Refund job (Spec 4)** muda formula de % — esta ADR atualizada.

## Consequencias

### Positivas

- **UX preserva ponto narrativo** — 12min e 12min em qualquer formato.
- **Refund 25% trivial calcular.**
- **Storage barato** (int4 + composite unique).
- **Upsert atomico** sem race condition.
- **Test fixture trivial.**
- **Schema extensivel para markers** futuros sem migration dolorosa
  (nova tabela `library_lesson_markers`).

### Negativas

- **Deriva narrativa** em desfasamentos grandes (mitigada por revisao
  founder do conteudo).
- **Sem markers semanticos** no MVP.
- **Snapshot duracao** = denormalizacao (aceitavel).

### Neutras

- **Decisao revisitavel** quando Spec 5+ adicionar bookmarks ou
  markers.
- **Lesson learned a registrar:** "sync cross-format por unidade
  canonica (segundos), nao derivada (%); fallback simples (open at
  start) > smart recalc".

## Confianca

**Alta.** Padrao usado por Audible (cross-device sync por segundos),
Coursera (entre video/transcript), Khan Academy (entre video/exercise).
% sync e anti-pattern documentado em UX podcasts/edTech research.

## Referencias

- **Spec:** `Docs/specs/biblioteca-spec-1.md` RF-08 + D5 + D12
- **ADR-073:** `Docs/architecture/decisions/073-library-entitlements-model.md`
  — pre-requisito (lesson access antes de tracking progress).
- **Lessons learned:**
  - #6 (normalizar para unidade canonica antes de comparar) — segundos
    sao canonicos.
  - #11 (default minimo em componentes) — fallback "abre no inicio" se
    exceder, NAO recalcula.
  - #12 (estado persistente em React Query cache) — `progressMap` carregado
    no mount sobrevive a tab switch.
- **Diagramas Mermaid:**
  - `Docs/architecture/diagrams/biblioteca/flow-viewer-3-format-sync.mermaid`
    — sequence diagram do switch.
  - `Docs/architecture/diagrams/biblioteca/data-model.mermaid` —
    `library_progress` schema.
- **Out of scope:** markers semanticos (Spec 5+), transcript-based
  alignment (Spec 7+), download offline (PWA Spec 6).
