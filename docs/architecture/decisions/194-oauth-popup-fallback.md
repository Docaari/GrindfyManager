# ADR-194: Spotify OAuth popup fallback = sessionStorage snapshot + full-page redirect

## Status

Aceito — 2026-05-22.

Cobre Sprint Mini Player 3 (MP3) RF-06.1 + decisoes D15/D16 da spec.

## Data

2026-05-22

## Contexto

MP2 entregou OAuth Spotify funcional via popup (`window.open(authUrl, '_blank', 'popup')` + `postMessage` callback). Strategist auditoria UX pre-MP3 identificou que **popup blocked e a #1 friccao de onboarding**:

- Chrome com popup blocker agressivo (default em ~30%+ instalacoes pos-Chrome 100).
- Safari iOS bloqueia popups de eventos nao-sincronos (qualquer hop async entre user click e `window.open`).
- Firefox Strict mode habilitado por default em algumas builds enterprise.

Comportamento atual (`client/src/lib/spotify/auth.ts:initiateSpotifyAuth`):

1. `const popup = window.open(authUrl, '_blank', '...');`
2. Se `popup === null` -> throw `SpotifyPopupBlockedError`.
3. UI captura erro e mostra mensagem "Permita popups, depois clique novamente".
4. User precisa: (a) achar config popups, (b) habilitar para spotify.com, (c) recarregar pagina, (d) clicar novamente.

Onboarding perdido. Strategist estima 3-7% dos users desistem nesse ponto (data qualitativa, sem instrumentacao quantitativa — pendente).

### Restricoes do problema

1. **`window.open` deve ser chamado sincronamente dentro do user gesture** (mesmo handler de click). Qualquer `await` ou `setTimeout` antes quebra Safari.
2. **Safari iOS quirk:** popup pode abrir e fechar imediatamente (<1.5s) sem disparar `postMessage` se o user navegou pra Spotify mas backed out. Detect via polling `popup.closed`.
3. **Snapshot precisa sobreviver full-page redirect** — localStorage e options, mas sessionStorage e melhor (auto-clear na sessao browser).
4. **TTL razoavel:** user autoriza em 10-60s tipico. Considerar 10min de tolerancia (2FA + redigitar senha + Spotify Premium upgrade no meio).
5. **Restore deve ser idempotente:** snapshot consumido 1x apos callback success; falha de parse = silent (queue local sobrevive independente).

### Benchmark de mercado

| App | Fallback |
|---|---|
| Spotify Wrapped 2024 (web) | popup primario; sem fallback automatico — UX assume desktop saudavel. |
| Soundcloud | popup primario + redirect manual via link no error UI. |
| Discord OAuth (web) | redirect-first sempre (sem popup). Trade-off: perde scroll state. |
| Slack OAuth | popup primario + redirect fallback automatico (detect popup blocked). |
| Notion OAuth | popup primario; falha = mostra link "abrir em nova aba". |

Slack faz exatamente o que MP3 quer fazer.

## Opcoes Consideradas

### Opcao 1: Popup-only (manter MP2 atual)

- **Pros:** UX feliz path 95% (desktop saudavel) preserva scroll/state.
- **Contras:** perde 3-7% users em popup blocked. UX recovery e manual + lenta.

### Opcao 2: Redirect-only sempre (full-page navigate)

- **Pros:** 100% funciona em qualquer browser/blocker.
- **Contras:**
  - Perde scroll position + state in-memory de 95% users que nao precisavam.
  - Implementation: snapshot SEMPRE save antes do auth — overhead constante.
  - UX "tela some, redireciona, volta" e mais brusco que popup.

### Opcao 3: Popup primario + erro UI com botao "redirect" manual

- **Pros:** preserva feliz path + da escape pra blocked.
- **Contras:**
  - 2 cliques pro user em vez de 1.
  - Friccao cognitiva: "popup nao abriu, agora preciso clicar de novo?".
  - Strategist UX score baixo.

### Opcao 4 (escolhida): Popup primario + detect blocked + redirect automatico transparente

Detect 2 conditions:

- **(a)** `popup === null` (Chrome popup blocker — synchronous detection).
- **(b)** `popup.closed === true && !resolved` em **< 1.5s** (Safari async-close threshold — `setTimeout` polling).

Em ambos: salva snapshot em `sessionStorage.spotify_oauth_snapshot` + `window.location.href = authUrl`.

- **Pros:**
  - 100% feliz path para 95% users (popup OK).
  - 100% feliz path para 3-7% blocked (redirect transparente).
  - Zero acao manual do user.
  - Snapshot preserva activeTrack + scrollY + queue version para restore.
- **Contras:**
  - Implementacao adiciona snapshot helper (oauthSnapshot.ts) + callback page detection mode (popup vs page).
  - Safari edge case: popup.closed pode ser `false` mesmo quando bloqueado. Mitigacao: 1.5s timeout cobre 90% Safari cases.
  - User com TTL > 10min de autorizacao perde state (snapshot expira). Aceitavel.

## Decisao

**Popup primario + detect popup blocked OR closed <1.5s + sessionStorage snapshot + `window.location.href = authUrl` (full-page redirect). Snapshot TTL 10min. Restore no callback page.**

### Fluxo detalhado

```
User click "Conectar Spotify"
  |
  | (1) saveOAuthSnapshot(authUrl) [PROACTIVE — salva ANTES de window.open]
  |     snapshot = {
  |       activeTrackId: window.__audioPlayerActiveTrackId ?? null,
  |       scrollY: window.scrollY,
  |       queueVersion: parseInt(localStorage['audio.queue.v1'])?.version ?? 0,
  |       timestamp: Date.now(),
  |       authUrl,
  |     }
  |     sessionStorage.setItem('spotify_oauth_snapshot', JSON.stringify(snapshot))
  |
  v
const popup = window.open(authUrl, '_blank', '...')
  |
  | Branch (a): popup === null
  |   -> sessionStorage snapshot ja salvo
  |   -> window.location.href = authUrl
  |   -> [browser navega; estado react perdido; queue local intacta]
  |   -> /spotify-callback page mount:
  |       - restoreOAuthSnapshot() -> if (Date.now() - snap.timestamp > 10min) return null
  |       - if (window.opener === null || window.opener === window): mode = 'redirect'
  |       - setTimeout(() => window.scrollTo(0, snap.scrollY), 100)
  |       - redirect /  (home)
  |       - AudioPlayerProvider boot re-hydrate queue from localStorage
  |
  | Branch (b): popup !== null
  |   -> setTimeout(() => {
  |        if (popup.closed && !resolved) {
  |          // Safari async-close
  |          window.location.href = authUrl
  |        }
  |      }, 1500)
  |   -> aguarda postMessage normal
  |   -> resolved = true ao receber postMessage
  |
  v
Apos OAuth success (qualquer branch):
  -> sessionStorage.removeItem('spotify_oauth_snapshot')
  -> connectSpotify() chamado
```

### TTL 10min

- Timer comeca em `snapshot.timestamp` (set ANTES do `window.open`).
- `restoreOAuthSnapshot()` checa: `Date.now() - timestamp > 10 * 60_000` -> return null + clear key.
- Cobre cenarios reais: digitar senha, 2FA, eventual Premium upgrade.
- Acima de 10min: assume abandono; user precisa clicar conectar novamente.

### Restore behavior

- `scrollY` -> `window.scrollTo(0, snapshot.scrollY)` (com `setTimeout 100ms` para garantir DOM montado).
- `activeTrackId` -> NAO auto-play (UX sanity: user precisa clicar play novamente). Apenas info.
- `queueVersion` -> consumido por sanity check no boot; localStorage `audio.queue.v1` ja se auto-hydrata via AudioPlayerProvider boot (ADR-193).
- `authUrl` -> debug/telemetria; nao usado para re-navegar.

### Snapshot NAO contem secrets

- Sem `access_token`, `refresh_token`, JWT, ou cookie.
- `activeTrackId` e `coverUrl` sao publicos (lessons/tracks). `scrollY` e `timestamp` sao numeros.
- `authUrl` contem state CSRF (rotacionado por OAuth init endpoint) + `code_challenge` PKCE. Estes ja sao publicos por design OAuth — nao secret.
- XSS risk: snapshot exposto via sessionStorage so e legivel pelo origin; sessionStorage nao persiste alem da tab session. Aceitavel.

## Consequencias

### Positivas

- **Onboarding recovery**: 3-7% users blocked agora completam fluxo.
- **Feliz path inalterado**: 95% users com popup OK nao percebem mudanca.
- **Sem UI dialog adicional**: redirect e transparente.
- **Cross-browser**: Chrome blocker (synchronous null) + Safari async-close (1.5s polling) ambos cobertos.
- **Snapshot helper isolado** (`oauthSnapshot.ts`): unit-testavel + reutilizavel se MP4 adicionar outros OAuth flows.
- **TTL 10min**: cobre cenarios reais sem prender snapshot velho indefinidamente.

### Negativas

- **Full-page redirect perde React state in-memory** dos 3-7% blocked: queue volta via localStorage (ADR-193), activeTrack precisa user re-click play, scroll restaurado.
- **Safari edge case** (popup.closed false mas bloqueado) nao 100% coberto: founder verify manual em iOS Safari (RF-06 acceptance criteria).
- **Snapshot save proactive (antes de window.open)**: adiciona ~1ms de overhead em feliz path. Aceitavel.
- **`window.__audioPlayerActiveTrackId` global**: precisa de attach explicito no AudioPlayerProvider (lesson #29 pattern: expor refs minimas globalmente para snapshots cross-redirect).

### Neutras

- ADR-193 (queue localStorage primario) ja garante queue sobrevive ao redirect.
- ADR-190 (cookie httpOnly Spotify session) nao impacta — snapshot e separado de cookies.
- spotify-callback.tsx ganha logic de detection mode (popup vs page). Sem novo endpoint.

## Confianca

Alta. Decisao consistente com:

- Slack OAuth pattern (referencia direta).
- Strategist UX audit pre-MP3 (popup blocked = #1 friccao onboarding).
- Lesson #15 (sessionStorage polyfill em setup.ts MemoryStorage).
- Lesson #29 (ErrorBoundary local + snapshot helpers isolados).

Verify manual em Safari iOS no checklist RF-06.

## Referencias

- ADR-190 (Spotify token storage = httpOnly cookie).
- ADR-193 (queue UI persistence = localStorage primario).
- Spec `Docs/specs/sprint-mini-player-3.md` secao 5 RF-06 + D15/D16/D17 + Q-F.
- Diagrama `Docs/architecture/diagrams/mini-player-3/oauth-popup-fallback-sequence.mermaid`.
- Lesson #15 (MemoryStorage polyfill jsdom + node).
- Memory `session_2026-05-22-mini-player-1.3-shipped.md` (MEDIUM-1 "sem silent no-op" pattern aplicado em error states UI).
- RFC 6749 (OAuth 2.0 — state CSRF + PKCE code_challenge sao publicos).
