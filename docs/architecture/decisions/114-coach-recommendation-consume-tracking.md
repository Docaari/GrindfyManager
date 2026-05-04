# ADR-114: Tracking de consumo via 30s ou 80% playback + library_events

## Status
Aceito

## Data
2026-05-03

## Contexto

A recomendacao precisa ser marcada como **consumida** quando o user
efetivamente assistir/ouvir/ler a licao recomendada. Sem trigger automatico, o
ciclo semanal nunca avanca para o estado "consumed" e o card vira "Marcar como
vista" + texto manual — UX ruim e dados de conversao inflados artificialmente
(consume manual eh subutilizado historicamente).

Founder confirmou:
- **Trigger automatico:** auto via 30s OU 80% playback.
- **Mecanismo:** passar `?source=home-coach-rec` nos events do player + endpoint
  backend dispara consume.
- **Tambem:** disparar `library_events` row com `event_type = 'coach_recommend'`
  (enum ja existe em `shared/schema.ts:3582`).

Decisoes tecnicas:

1. **Onde detectar o threshold (frontend vs backend)?**
2. **Como passar o `recommendationId` para o backend?** Query param explicito
   vs derivacao no servidor (lookup `getCoachRecommendationByUserAndLesson`).
3. **Idempotencia** — multiplos `timeupdate` events (video) podem disparar
   consume varias vezes em rapida sucessao.
4. **Diferentes formatos** — video (`<video>`), podcast (`<audio>`), article
   (scroll-based), pdf (?). Cada um tem semantica distinta para "30s ou 80%".

## Opcoes Consideradas

### Opcao 1: Detectar threshold no frontend, POST direto (escolhida)
- **Pros:**
  - Simples. Player ja tem `timeupdate` / scroll events.
  - Thresholds (30s OR 80%) facil de implementar com 2 condicoes.
  - Idempotencia garantida com flag local `hasFiredConsume = true` apos o
    primeiro POST.
  - Backend POST `/api/home/coach-recommendation/:id/consume` ja pega
    idempotencia no banco.
- **Contras:**
  - Cliente precisa saber `recommendationId`. Solucao: backend retorna no GET
    home, frontend passa via query param `?recId=...`.

### Opcao 2: Tracking 100% backend via heartbeat
- **Pros:** controle central.
- **Contras:**
  - Heartbeat a cada N segundos = N requests por user × N players. Custo + DB
    load alto.
  - Dificil tracking de "80%" sem saber duracao total.

### Opcao 3: Lookup backend via `(userId, lessonId, weekStart)`
- **Pros:** sem necessidade de passar `recId` no query.
- **Contras:**
  - 1 query extra por POST. Aceitavel mas evitavel.
  - Race condition: se user tem 2 recs ativas (impossivel pelo UNIQUE, mas
    defensivo) — fica ambiguo.
  - Acopla logica de "qual rec consumir" no servidor, distancia da intencao
    explicita do client.

## Decisao

**Opcao 1 com query param explicito.** Combinacao:

### Frontend

#### URL convention

Card no Home gera CTA com query params:
```
/biblioteca/lesson/{lessonId}?source=home-coach-rec&recId={recommendationId}
```

A pagina `/biblioteca/lesson/:id` le ambos os params no mount:
- Se `source === 'home-coach-rec'` E `recId` presente → ativa o consume tracker.
- Se `source` ausente → comportamento normal (tracking via library_events
  generico, sem coach_recommend tag).

#### Player wiring

Para **video** e **podcast** (`<video>` ou `<audio>` element):
```ts
useEffect(() => {
  if (!sourceIsCoachRec || !recId) return;
  let fired = false;
  const onTimeUpdate = (e: Event) => {
    const el = e.target as HTMLMediaElement;
    if (fired) return;
    const elapsed = el.currentTime;
    const total = el.duration;
    const pct = total > 0 ? elapsed / total : 0;
    if (elapsed >= 30 || pct >= 0.8) {
      fired = true;
      consumeMutation.mutate(recId);
    }
  };
  player.addEventListener('timeupdate', onTimeUpdate);
  return () => player.removeEventListener('timeupdate', onTimeUpdate);
}, [sourceIsCoachRec, recId]);
```

Para **article** (text/markdown render):
- Trigger por scroll: `scrollTop / scrollHeight >= 0.8`.
- Adicionalmente, fallback de 30s timer apos mount caso o scroll nao chegue a
  80% (article curto).

Para **pdf** (raro no MVP): apenas trigger de 30s timer + nenhum scroll
detection no MVP.

#### Idempotencia client-side

Flag `fired = true` apos primeiro POST. Cleanup do listener no unmount evita
re-fire em re-mount.

### Backend

#### Endpoint `POST /api/home/coach-recommendation/:id/consume`

Logica (RF-07 da spec):
1. `requireAuth`.
2. `rec = storage.getCoachRecommendationById(id)`.
3. Validar `rec.userId === req.user.userPlatformId` → 403 se diferente.
4. Idempotencia: se `rec.consumedAt != null`, retornar 200 sem alterar
   (idempotente).
5. Atualizar `consumedAt = NOW()` (apenas, nao mexer em `dismissedAt`).
6. **Inserir row em `library_events`** com:
   ```ts
   {
     userId,
     lessonId: rec.lessonId,
     eventType: 'coach_recommend',  // enum ja existe
     metadata: {
       recId: rec.id,
       source: rec.source,
       weekStartDate: rec.weekStartDate,
       triggeredVia: 'auto' | 'manual',
     },
   }
   ```
7. Tracker server-side:
   `tracker.emit('coach_recommendation_consumed', { userId, lessonId, weekStartDate, source, viaAutomatic })`.
8. Resposta `{ ok: true, consumedAt }`.

#### Query param convention `?source=home-coach-rec`

Eh um marker semantico para tracking de origin. **Convencao reutilizavel** para
outros pontos de entrada futuros:
- `?source=home-coach-rec` — Card Coach IA (este ADR).
- `?source=home-bloco-a` — Bloco A widget (futuro).
- `?source=home-news` — News slot (futuro).
- `?source=biblioteca-search` — busca interna.
- `?source=email-weekly` — email digest (futuro).

`library_events.metadata.source` deve sempre receber este valor para funil
analitico.

### Diferencas por formato

| Formato | Trigger 30s | Trigger 80% | Fallback |
|---|---|---|---|
| video | `<video>` `timeupdate` | `currentTime / duration >= 0.8` | — |
| podcast | `<audio>` `timeupdate` | idem | — |
| article | timer apos mount | `scrollTop / scrollHeight >= 0.8` | scroll para article curto |
| pdf | timer apos mount | NAO implementado | apenas timer |

### Trigger manual

Botao "Marcar como vista" no card visivel apenas se `hasAccess === true`.
Dispara mesma mutation com `triggeredVia: 'manual'`. Usado em fallback raro
quando o usuario quer marcar sem assistir tudo.

## Consequencias

**Positivas:**
- Trigger automatico = conversao real medida sem peso UX (zero clicks
  adicionais).
- `library_events` populado com `event_type = 'coach_recommend'` permite funil
  Coach → consume mensuravel sem schema novo.
- Convencao `?source=...` reutilizavel para outras features.
- Idempotencia em 3 camadas (client flag + backend short-circuit + UNIQUE
  semantica de `consumedAt`).
- POST eh barato — apenas 1 update + 1 insert por user/semana.

**Negativas:**
- Frontend precisa saber `recId` no query param. Adiciona pouco overhead na URL.
- Player precisa wiring por formato. Mitigado por hook compartilhado
  `useCoachRecommendationConsumeTracker(recId, format)`.
- Article scroll detection eh imperfeito (depends de container). Mitigado por
  fallback de 30s timer.

**Neutras:**
- Trigger manual continua disponivel para edge cases (lesson curta, audio
  ouvido em outro device).
- `viaAutomatic: boolean` no metadata permite analise de % auto vs manual.

## Confianca
Alta — padrao consagrado (YouTube watch threshold, Spotify scrobble,
DuoLingo lesson complete) e ja existe enum `coach_recommend` no schema.
