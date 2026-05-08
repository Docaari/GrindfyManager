# ADR-131 — Auto-trigger Mux 80%: client-side com idempotency server-side (vs webhook)

- Status: Aceito
- Data: 2026-05-08
- Sprint: estudos-coach-biblio-2
- Decision owner: system-architect
- Related: spec `Docs/specs/estudos-coach-biblio-2.md` §RF-1, ADR-126 (study_sessions_v2), ADR-130 (auto_lesson idempotency 24h), ADR-114 (consume tracking via library_events)
- Diagramas: `Docs/architecture/feature-flow-mux-auto-trigger.mermaid`

---

## 1. Contexto

RF-1 do sprint Estudos-Coach-Biblio-2 define o gatilho **"aula assistida 80% = study session registrada"**. Tres caminhos possiveis para detectar o threshold:

1. **Client-side**: hook React (`useLessonStudyAutoLog`) escuta `timeupdate` do `<mux-player>` (lesson #20 — wirar via container `querySelector`). Quando `currentTime/duration >= 0.80`, faz `POST /api/study-sessions` com `source='auto_lesson'`.
2. **Server-side via webhook Mux**: configurar Mux Data webhook (`video.viewing.complete` ou similar) que aponta para endpoint Grindfy. Server cruza `mux_view_id` com `library_lessons.mux_playback_id` + recupera user via session token.
3. **Server-side via polling do `library_lesson_progress`**: Sprint Biblioteca-1 ja registra progresso periodicamente (Mux Player chama endpoint `/api/library-progress`). Adicionar listener no handler para disparar study session quando `progress_pct` cruza 0.80.

A pergunta arquitetural: **onde colocar o trigger?** Trade-offs sao trust (client mente sobre `currentTime`?), latencia (webhook tem cold start), complexidade (manter ngrok-like infra para webhook em dev) e idempotency (multiple sources poderiam criar duplicatas).

A spec ja antecipa a resposta em §RF-1.1 ("hook client-side com `firedThisMount`") e §RF-1.2 ("`themeId` derivado server-side; `durationMinutes` cap server-side"). Mas precisamos formalizar **por que** client-side eh a escolha certa, nao apenas pragmatica.

---

## 2. Decisao

**Trigger client-side via hook `useLessonStudyAutoLog` + validacao + cap + idempotency server-side. Webhook Mux nao implementado.**

Cliente NAO eh trusted source. Server faz:

1. **Cap de `durationMinutes`**: `min(client.durationMinutes, lessonRuntime/60)`. Anti-inflate.
2. **Derivacao de `themeId`**: lookup server `study_themes.linkedLessons @> [lessonId] AND is_curated=true`. Cliente nao envia (mesmo se enviar, ignora).
3. **Validacao de `lessonId`**: existe + `is_published=true` + pertence a curso ativo.
4. **Idempotency 24h** (ADR-130): SELECT `study_sessions_v2` WHERE `user_id=X AND lesson_id=L AND source='auto_lesson' AND deleted_at IS NULL AND registered_at > now() - interval '24 hours'` FOR UPDATE. Se `new.duration_minutes > existing.duration_minutes`, UPDATE; senao no-op; senao INSERT.
5. **Ownership implicit** via `requireAuth` — `user_id` vem do JWT, nao do body.

O cliente apenas detecta o threshold + chama endpoint. Falha de network = silent (lesson #9). Re-mount do player reseta `firedThisMount` mas server faz UPDATE idempotente.

### 2.1 Por que NAO webhook Mux

- **Cold start**: webhook latency 200-1000ms. User ja saiu da pagina antes do toast aparecer.
- **Cross-environment**: webhook precisa endpoint publico em dev (ngrok) — friccao para todos os devs.
- **Mapeamento user**: webhook nao carrega userId no payload. Precisariamos persistir map `mux_view_id → user_id` (mais 1 tabela ou index em `library_lesson_progress`).
- **Mux Data tier**: a API de webhook completion eh feature paga (Mux Plus+). Sprint 2 eh feature delivery — sem upgrade pago.
- **Reentry**: ja existe `library_lesson_progress` polling client-side (Sprint Biblioteca-1). Reusar trigger sem dependencia externa eh mais simples.

### 2.2 Por que NAO listener no `library_lesson_progress` handler

- Acopla 2 features (consume tracking de progresso vs auto-log estudo). Sprint Biblioteca-1 dono de progress; Sprint 2 dono de auto-log. Manter responsabilidades separadas.
- Endpoint `/api/library-progress` (se existe) chama com `progress_pct` em multipla granularidade (5%, 10%, 25%, etc.). Listener no handler dispararia em cada cruzamento de 80%, exigindo de-dupe local antes do nosso de-dupe 24h. Complicacao desnecessaria.
- Hook client-side eh trivial (`<mux-player>` ja emite `timeupdate`); `firedThisMount` em useRef garante 1 chamada por mount.

### 2.3 Validacao adicional defesa-em-profundidade

Apesar do trigger ser client, server enforce **3 camadas anti-fraude**:

1. **Rate limit endpoint**: 60/min per user (suficiente para uso real, bloqueia spam).
2. **Cap por aula por dia**: max 1 INSERT por (user, lesson) em 24h (ADR-130 idempotency natural cap).
3. **Cap em `durationMinutes`**: `min(payload, lessonRuntime/60 + 5min tolerance)`. User nao pode reportar 90min para aula de 12min.

### 2.4 Falhas explicitas

| Falha | Comportamento |
|---|---|
| `lessonId` invalido | 400 LESSON_NOT_FOUND. Cliente silent. |
| `lessonId` despublicada | 400 LESSON_NOT_PUBLISHED. Cliente silent. |
| Network error client | Hook log warn dev. Sem toast erro. Sem retry. |
| `setting.studyHabit.autoLogLessons=false` | Hook NAO dispara. Inerte. |
| Mux Player runtime=0 (live ou bug) | Hook divide-by-zero protegido client. No-op. |
| Server 500 | Cliente log warn. Sem toast erro. Re-mount eventual fara UPDATE idempotente. |

---

## 3. Opcoes Consideradas

### Opcao A: Webhook Mux (`video.viewing.complete`)

- **Pros:** server eh source of truth; client nao pode forjar threshold; survives tab close; Mux Data eh feature pronta.
- **Cons:** latency cold start; precisa endpoint publico em dev; requer Mux Plus+ tier (custo +); precisa persistir `mux_view_id → user_id` mapping (mais infra); toast UX quebra (server nao tem canal direto para toast — precisaria SSE/websocket); single source of failure (webhook fora = trigger nao roda).

### Opcao B: Listener no handler `library_lesson_progress`

- **Pros:** server-side; reusa infraestrutura Sprint Biblioteca-1; sem dependencia Mux paga.
- **Cons:** acopla 2 features (progress tracking vs auto-log estudo); endpoint emite multiplas granularidades de progress (5%, 10%, etc.) que disparariam handler em cada cruzamento de 80%; complicacao de-dupe alem do 24h ja necessario; toast precisaria SSE para client saber que foi registrado.

### Opcao C (escolhida): Trigger client-side + cap/validacao/idempotency server-side

- **Pros:** zero dependencia externa nova; toast UX trivial (resposta sincrona); reusa `useEffect` + `<mux-player>` pattern existente (lesson #20); falha de network = silent (lesson #9 OK); server enforce 3 camadas anti-fraude; idempotency garante re-mounts safe.
- **Cons:** cliente pode forjar threshold (`durationMinutes` no body) — mitigado por cap `min(payload, lessonRuntime/60+5)` no server; nao captura caso "user fechou tab antes de 80%" (mas ninguem captura — nem webhook em modo "abandoned").

---

## 4. Consequencias

**Positivas:**
- Hook simples de reusar em todos os MuxPlayer containers (Wouter routes `/biblioteca/curso/:courseSlug/:lessonSlug/play` + variantes).
- Toast UX sincrono (fetch resposta imediata).
- Sem novo schema, sem novo endpoint admin.
- Idempotency 24h (ADR-130) ja resolve race condition multi-tab (FOR UPDATE).
- Setting `studyHabit.autoLogLessons` opt-out trivial — hook checa e returns inerte.

**Negativas:**
- Cliente pode tentar forjar `durationMinutes` no body — server cap mitiga.
- User pode skip 0%→90% via seek e disparar (aceitavel pela spec — comportamento documentado).
- Re-mount do player + progresso > 80% dispara segundo POST — server faz UPDATE idempotente (no-op real).

**Neutras:**
- Telemetria `auto_log_lesson_triggered` `{ userId, lessonId, durationMinutes }` server-side (ja eh ponto natural).
- Integracao com `library_lesson_progress` continua independente — duas features coexistem sem acoplamento.

---

## 5. Confianca

**Alta.** Pattern client-trigger + server-validation eh o default em web apps. Lesson #20 (player wirar via container) ja foi aplicada com sucesso em sprints anteriores (home-reform-4 RF-07). Idempotency 24h ja foi validada no Sprint 1 (ADR-130). Cap server-side eh trivial.

Caso de borda nao coberto (Mux runtime=0) eh aceitavel: hook protege, server retorna 400 silent, sem disrupcao.

Caso webhook Mux vire necessario futuro (ex: medir abandonamento), pode-se adicionar como **trigger complementar** sem remover o client trigger. Server faz UPDATE idempotente em ambos.

---

## 6. Anexos

- Diagrama sequencia: `Docs/architecture/feature-flow-mux-auto-trigger.mermaid`
- Spec: `Docs/specs/estudos-coach-biblio-2.md` §RF-1
- Sprint 1 idempotency: ADR-130
