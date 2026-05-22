# ADR-193: Queue UI persistence model = localStorage primario + server snapshot best-effort

## Status

Aceito — 2026-05-22.

Cobre Sprint Mini Player 3 (MP3) RF-05.5 + RF-05.6 + decisoes D11/D14 da spec.

## Data

2026-05-22

## Contexto

Sprint MP3 introduz Queue UI persistente: o user empilha ate 50 items (lessons + tracks Spotify), reordena via drag-and-drop, ativa repeat (off/all/one) e shuffle. A spec MP3 secao 5 RF-05 define que a queue precisa sobreviver:

1. **Reload da pagina** — fechar/abrir tab.
2. **Multi-tab** — abrir Grindfy em 2 tabs do mesmo browser.
3. **Cross-device (best-effort)** — desktop + mobile/segundo dispositivo no MP4+.

ADR-189 ja travou que a queue e **homogenea por driver**: o Engine nao precisa orquestrar itens cross-source. A decisao restante e: onde mora o estado canonico da queue?

Forcas em jogo:

1. **Offline-first do desktop pro grindeiro MTT.** Persona principal opera offline-friendly (sessoes 7-11h, redes flutuando). Persistencia que depende de roundtrip server quebra UX.
2. **Spotify Web Playback SDK exige device unico por user.** Multi-tab queue nao deve "duplicar device" — uma tab pode disputar; cross-tab sync via `storage` event natural do browser.
3. **Server source-of-truth aumenta complexidade.** Conflict resolution (offline edits + remote edits + reordering) ja foi resolvido em mercado via CRDT/OT, mas e overkill para queue de 50 items.
4. **Cap 50 items (D10) + strip de `audioUrl` (Q-N/R-05.4) -> payload pequeno.** Serializado ~5-15KB; localStorage suporta sem dor.
5. **WebSocket / SSE custo operacional.** Grindfy nao tem infra WebSocket atual (Coach AI usa SSE para streaming, mas e per-request). Manter um canal persistente so para queue sync e overkill.
6. **Lesson MP1.2 (#29):** ErrorBoundary local em features secundarias — queue UI nao pode quebrar app inteiro se localStorage corrupt.

### Benchmark de mercado (strategist report MP3)

| Player | Persistence model |
|---|---|
| Spotify desktop | Server-side (account-bound), pull on boot, push on mutation. Offline degrades para "ultimo snapshot conhecido". |
| YouTube Music | Server-side primario + localStorage cache. |
| Apple Music | Server-side primario. Multi-tab nao recomendado. |
| Tidal | Server-side. |
| Plex / Roon / Spotify Connect | Local-first (zone/player); server e secundario. |

Grindfy persona desktop + offline-first se aproxima do modelo Plex/Roon — local primario.

## Opcoes Consideradas

### Opcao 1: Server-only (POST a cada mutation, GET na boot)

- **Pros:**
  - Cross-device sync gratis.
  - Single source of truth.
- **Contras:**
  - Offline = queue inutilizavel.
  - Latencia 100-300ms em cada drag-reorder.
  - Falha de rede silenciosa quebra UX (usuario nao sabe se mutation persistiu).
  - WebSocket OR polling para cross-tab.

### Opcao 2: WebSocket bidirectional sync (CRDT-ish)

- **Pros:**
  - Real-time multi-tab + cross-device.
- **Contras:**
  - Infra nova (WebSocket server + reconnect logic + heartbeats).
  - Custo dev 5-10x maior do que escopo MP3.
  - CRDT/OT complexidade nao justificada para queue 50 items.

### Opcao 3: Polling (GET periodico + LWW)

- **Pros:**
  - Sem WebSocket.
- **Contras:**
  - Overhead constante (GET 30s).
  - Latency 30s pra cross-tab.
  - Mobile bateria.

### Opcao 4 (escolhida): localStorage primario + server snapshot best-effort + cross-tab `storage` event

- **Pros:**
  - **Offline-first**: queue funciona sem rede.
  - **Mutation latency 0ms**: localStorage write sincrono + UI optimistic.
  - **Server e secundario**: POST best-effort, falhas swallowed + console.warn (RNF-03). Server hospeda snapshot para boot apos clear de localStorage OR MP4 cross-device.
  - **Cross-tab via browser nativo**: `storage` event fired automaticamente no outro tab quando localStorage muda. Zero infra adicional.
  - **Conflict resolution simples**: `version` int incremental + last-write-wins (D14).
  - **Cap 50 + strip audioUrl**: payload ~5-15KB serializado, localStorage saudavel.
- **Contras:**
  - Server snapshot pode ficar stale se POST falha multi-vezes consecutivas. Mitigacao: reconcile na proxima boot le ambos local + server, local wins se version >= server.
  - Cross-device sync precisa de uma reconciliacao explicita no boot (compromise — defer MP4).
  - Conflict raro entre 2 tabs editando simultaneamente: ultimo write vence; mitigacao via debounce 500ms + version aumentando.

## Decisao

**Queue UI persiste em localStorage como source-of-truth client + server snapshot best-effort em `audio_queue_snapshots` (user_id PK). Cross-tab via `storage` event listener com debounce 500ms. Conflict = last-write-wins por `version` int.**

### Modelo concreto

**Client (localStorage key `audio.queue.v1`):**

```jsonc
{
  "version": 7,
  "queue": [
    { "id": "nano-xyz", "trackId": "lesson-abc", "source": "library", "title": "...", "coverUrl": "...", "courseTitle": "...", "durationSeconds": 1234, "addedAt": 1716000000000 }
  ],
  "repeatMode": "all",
  "shuffleEnabled": false,
  "shuffledOrder": null,
  "updatedAt": 1716000000000
}
```

**Server (`audio_queue_snapshots` PK `user_id`):**

```sql
CREATE TABLE audio_queue_snapshots (
  user_id varchar PRIMARY KEY REFERENCES users(user_platform_id) ON DELETE CASCADE,
  queue_jsonb jsonb NOT NULL DEFAULT '[]'::jsonb,
  repeat_mode varchar(8) NOT NULL DEFAULT 'off' CHECK (repeat_mode IN ('off','all','one')),
  shuffle_enabled boolean NOT NULL DEFAULT false,
  shuffled_order jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamp DEFAULT NOW() NOT NULL
);
```

### Fluxo de escrita (mutation)

1. User dispatcha mutation (add/remove/reorder/clearQueue/setRepeatMode/toggleShuffle).
2. Context atualiza state in-memory imediatamente (optimistic UI).
3. Debounce 500ms apos ultima mutation:
   - `localStorage.setItem('audio.queue.v1', JSON.stringify({ ...state, version: prevVersion + 1, updatedAt: Date.now() }))`.
   - `POST /api/audio/queue` em background com mesmo payload + `version` novo. Timeout 3s. Falha = `console.warn` (RNF-03).
4. Browser nativamente emite `storage` event nas outras tabs.

### Fluxo de leitura (boot do AudioPlayerProvider)

1. Le `localStorage.audio.queue.v1`. Se parse falha -> fallback `[]` + clear key (lesson #15 polyfill MemoryStorage).
2. Em paralelo, GET `/api/audio/queue` (timeout 3s, falha = ignore).
3. Reconcile:
   - Se local presente -> usa local (offline-first; **local wins por padrao**).
   - Se local ausente + server presente -> hydrate local com payload server + bump local version.
   - Se ambos ausentes -> queue vazia.

### Cross-tab (storage event listener)

```ts
window.addEventListener('storage', (e) => {
  if (e.key !== 'audio.queue.v1' || !e.newValue) return;
  const incoming = JSON.parse(e.newValue);
  if (incoming.version > currentVersion) {
    // Outro tab fez write mais recente. Reload state.
    setState(incoming);
  }
  // else: nosso state e mais novo; ignora (LWW).
});
```

### Conflict resolution

- `version` int auto-increment local por mutation.
- Tab A faz mutation -> version 8 -> setItem + POST.
- Tab B le storage event -> version 8 > seu 7 -> reload state. OK.
- Race: Tab A e B mutam quase simultaneo (debounce 500ms):
  - Ambos chegam a version 8 (paralelo).
  - Browser serializa setItem; o ultimo a chamar setItem vence localmente.
  - Outro tab recebe storage event e re-sincroniza.
  - Server POST: 2 requests com version 8 chegam; backend faz UPSERT por user_id; ultimo wins.
  - **Aceitavel:** mutations rapidas simultaneas em 2 tabs podem perder operacao rara. Documentar como known limitation (R-05.2).

### Strip audioUrl no persist

Signed URLs Mux expiram (~24h). Persistir `audioUrl` em localStorage gera quebra apos restore. Decisao: persistir apenas `trackId` + metadata leve (title, coverUrl, durationSeconds, courseTitle, spotifyUri). No skip-to-item, `playTrack` precisa fazer lookup (GET endpoint OU TanStack cache) para rebuild signed URL. Latency extra 200-500ms primeira play apos restore — aceitavel (R-05.4).

## Consequencias

### Positivas

- **Offline-first:** queue funciona sem rede, alinhado com persona MTT.
- **Mutation latency zero:** optimistic UI mais drag-and-drop fluido (lesson MP1: persona power espera paridade Spotify).
- **Cross-tab gratis:** browser ja faz storage event sem WebSocket.
- **Conflict simples:** version int + LWW; cap 50 items + debounce 500ms mantem rate de conflict raro.
- **Server e secundario:** falhas de rede nao afetam UX; preserva snapshot para boot apos clear de localStorage ou MP4 cross-device.
- **Migration 0078 PK simples:** UPSERT por user_id, sem complexidade de tabela de events ou journal.
- **Reaproveita lessons MP1+MP2:** ErrorBoundary local (lesson #29) ao redor do QueuePanel; createLocalStorageState helper (biblioteca-enrich) padronizado.

### Negativas

- **Cross-device sync nao e real-time** (defer MP4): user que muda no desktop precisa abrir Grindfy no mobile e dar reload para puxar snapshot.
- **Rare race em 2 tabs simultaneas perde mutacao**: documentado como known limitation R-05.2.
- **Signed URL rebuild latency 200-500ms** primeira play apos restore (R-05.4).
- **localStorage 5MB limite:** cap 50 + strip audioUrl mantem payload pequeno (5-15KB), mas se MP4+ aumentar para 200 items, revisitar.

### Neutras

- Cookie httpOnly Spotify (ADR-190) nao se aplica aqui — queue nao tem secret.
- ADR-191 (telemetria user_activity) cobre eventos da queue se quisermos instrumentar (defer).

## Confianca

Alta. Decisao consistente com:

- Persona desktop offline-first (memory MP1+MP2).
- Lessons MP1.2 (#29 ErrorBoundary local) + biblioteca-enrich (createLocalStorageState).
- Benchmark Plex/Roon (local-first).
- Strategist 6 modos pre-MP3.

Trade-off cross-device documentado e aceito; MP4 pode evoluir para "pull on boot + push on mutation com WebSocket opt-in" se demand emergir.

## Referencias

- ADR-189 (queue homogenea + driver switch explicito).
- ADR-191 (telemetria audio reuse `user_activity`).
- Spec `Docs/specs/sprint-mini-player-3.md` secao 5 RF-05 + Q-A..Q-N (D9..D14, Q-B/Q-N).
- Diagrama `Docs/architecture/diagrams/mini-player-3/queue-ui-component-tree.mermaid`.
- Lesson #15 (polyfill MemoryStorage em setup.ts node env).
- Lesson #29 (ErrorBoundary local em features secundarias).
- Memory `session_2026-05-18-biblioteca-enrich.md` (`createLocalStorageState` factory).
