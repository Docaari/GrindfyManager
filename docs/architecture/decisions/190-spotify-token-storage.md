# ADR-190: Spotify token storage = httpOnly cookie via server proxy

## Status

Aceito — 2026-05-22.

**Substitui o D3 da spec MP2** (que propunha localStorage encrypted como MVP, defer httpOnly cookie pra MP3). Founder + arquiteto decidiram inverter: httpOnly cookie ja em MP2, sem fase intermediaria.

## Data

2026-05-22

## Contexto

O Sprint Mini Player 2 (MP2) introduz `SpotifyAudioDriver` real (ADR-189) com OAuth 2.0 PKCE flow. O fluxo OAuth produz dois tokens com sensibilidade radicalmente diferentes:

- **`access_token`** — short-lived (60min). Suficiente pra fazer chamadas REST do Spotify Web API + alimentar o Web Playback SDK via callback `getOAuthToken(cb => cb(token))`.
- **`refresh_token`** — long-lived (sem expiracao explicita; revogavel pelo user em `spotify.com/account/apps`). Permite gerar novos `access_token` sem reautenticar.

A spec MP2 D3 propunha armazenar **ambos** em `localStorage` com encryption AES-GCM (Web Crypto API), key derivada server-side. Trade-offs documentados em Q-A (httpOnly cookie defer MP3 por custo backend).

Forcas em jogo que reabrem a decisao:

1. **`refresh_token` em localStorage = XSS catastrofico.** Qualquer payload XSS exfiltra refresh_token uma vez -> attacker tem acesso persistente ao Spotify do user ate user revogar manualmente em spotify.com. Encryption client-side **nao mitiga XSS** — codigo malicioso roda no mesmo origin, tem acesso ao crypto key.
2. **Lesson #16 (DOMPurify ALLOWED_TAGS).** Codebase ja tem historico de surface XSS subestimada (Sprint Biblioteca-2). Cada vetor novo (`<iframe>`, `<style>`, sanitizeCoverUrl) custou rounds adicionais de reviewer.
3. **Compliance.** OWASP A07:2021 (Identification and Authentication Failures) classifica long-lived tokens em localStorage como vulneravel. Auditoria futura de SOC2 / pen-test vai apontar.
4. **Custo backend revisado.** A spec estimou httpOnly cookie em "3-5d a mais". Re-analise: os endpoints ja seguem o pattern de `auth.ts` (JWT refresh rotation, ADR-143). Migration `spotify_tokens` e trivial. **Custo real: ~1-2d.** O delta vs localStorage encrypted (que tambem precisa Web Crypto helpers + IV/auth tag handling) e ~0.5-1d.
5. **Refresh token NUNCA precisa chegar ao client.** O client so precisa do `access_token` em memoria pra alimentar `getOAuthToken` callback do SDK + chamadas REST. Refresh acontece via `POST /api/audio/spotify/refresh` (server lê cookie httpOnly + faz refresh com Spotify + retorna novo access_token JSON).
6. **Multi-tab / multi-device.** httpOnly cookie permite que abas multiplas do Grindfy compartilhem o refresh proativo automaticamente (cookie e domain-wide). localStorage tambem (mesmo domain), mas com risco de race em encrypt/decrypt simultaneo.

### Threat model resumido

| Vetor | localStorage encrypted | httpOnly cookie |
|---|---|---|
| XSS exfiltra `refresh_token` | **VULN** (codigo malicioso decripta com a mesma key) | **MITIGADO** (cookie httpOnly inacessivel a JS) |
| XSS exfiltra `access_token` em memoria | VULN (60min de janela) | VULN (60min de janela — mesmo risco) |
| CSRF em endpoint de refresh | N/A | **MITIGADO** (sameSite=lax/strict + state) |
| Server compromise rouba refresh_token | VULN (DB) | VULN (DB) — mesmo risco |
| User revoga em spotify.com | OK | OK |
| Token leak via DevTools (operador malicioso) | VULN (localStorage visivel) | **MITIGADO** (cookie httpOnly nao listado em Application -> Local Storage) |

Conclusao: httpOnly cookie reduz a **superficie de ataque do `refresh_token` de "qualquer XSS"** para "comprometer o server". Diferenca de magnitude.

## Opcoes Consideradas

### Opcao 1: localStorage encrypted (Web Crypto AES-GCM)

`access_token` + `refresh_token` em `localStorage`, ciphertext via AES-GCM, key derivada server-side.

- **Pros:**
  - Zero endpoints backend novos.
  - Implementacao 100% client-side.
- **Contras:**
  - Encryption nao mitiga XSS — attacker code roda no mesmo origin e decripta com a key.
  - `refresh_token` long-lived expoe attack window indefinida.
  - OWASP / SOC2 apontariam.
  - Lesson Grindfy: cada vetor XSS subestimado custou rounds de reviewer.

### Opcao 2: sessionStorage (sem encryption)

`access_token` + `refresh_token` em `sessionStorage` (limpa ao fechar tab).

- **Pros:**
  - Reduz janela de exposicao (so durante a sessao do tab).
- **Contras:**
  - User precisa re-OAuth a cada vez que abre o app. Friccao alta — quebra US-05 (token refresh transparente).
  - Ainda vulneravel a XSS durante a sessao.

### Opcao 3 (escolhida): httpOnly cookie via server proxy

`refresh_token` NUNCA chega ao client. Armazenado em `spotify_tokens` table (refresh_token AES-256 encrypted). Cookie httpOnly carrega session reference. `access_token` short-lived enviado pro client via JSON em endpoints `/oauth-init` (apos OAuth) e `/refresh` (apos refresh proativo).

- **Pros:**
  - `refresh_token` inacessivel a JS (mitiga XSS catastrofico).
  - `access_token` short-lived em memoria: janela XSS = max 60min.
  - Compliance OWASP A07.
  - SameSite + CSRF state mitiga CSRF nos endpoints de refresh.
  - Server controla revocation: user clica "Desconectar" -> `disconnected_at = NOW()` -> proximo refresh falha + UI prompt.
  - Multi-tab share automatico (cookie domain-wide).
- **Contras:**
  - 4 endpoints backend novos (`/oauth-init`, `/oauth-callback`, `/refresh`, `/disconnect`).
  - Migration `spotify_tokens` table.
  - Encryption key (env var) precisa estar setada em prod — falha de deploy se ausente.
  - Custo dev: ~1-2d incremento vs Opcao 1 (mas amortizado por seguranca).

## Decisao

**`refresh_token` NUNCA chega ao client. Armazenado server-side em `spotify_tokens` (encrypted at rest). `access_token` short-lived enviado via JSON response, mantido em memoria React (NUNCA em localStorage/sessionStorage). Session reference (cookie httpOnly assinado) liga client -> linha na tabela.**

### Endpoints novos

| Endpoint | Auth | Descricao |
|---|---|---|
| `POST /api/audio/spotify/oauth-init` | JWT | Gera `state` + `code_verifier` server-side. Persiste em sessionStorage temporario (Map in-memory TTL 10min, OK pra single-instance — mover pra Redis se scale). Retorna `{ authUrl, state }` pro client redirecionar/popup. **Cookie httpOnly `spotify_oauth_session` setado** com session id assinado JWT (TTL 10min). |
| `GET /api/audio/spotify/oauth-callback?code=&state=` | Cookie httpOnly | Le cookie + valida state contra sessionStorage server-side + troca code+verifier por tokens via `POST https://accounts.spotify.com/api/token`. Persiste `refresh_token` encrypted em `spotify_tokens`. Retorna HTML pequeno que faz `window.opener.postMessage({ accessToken, expiresIn, displayName })` + `window.close()`. Cookie `spotify_session` (httpOnly, sameSite=lax, secure em prod, TTL = duracao da OAuth grant). |
| `POST /api/audio/spotify/refresh` | JWT + cookie httpOnly | Le cookie -> busca `refresh_token` decrypted em `spotify_tokens` -> `POST https://accounts.spotify.com/api/token grant_type=refresh_token`. Atualiza `access_token_hash` + `expires_at` na tabela. Retorna `{ accessToken, expiresIn }` JSON. Rotation se Spotify devolver novo `refresh_token` (raro mas spec OAuth permite). |
| `POST /api/audio/spotify/disconnect` | JWT + cookie httpOnly | Marca `disconnected_at = NOW()` em `spotify_tokens`. Limpa cookie httpOnly. Retorna 204. |

### Migration 0077 — tabela `spotify_tokens`

```sql
CREATE TABLE spotify_tokens (
  user_id varchar PRIMARY KEY REFERENCES users(user_platform_id) ON DELETE CASCADE,
  refresh_token_encrypted text NOT NULL,
  refresh_token_iv varchar(32) NOT NULL,
  refresh_token_auth_tag varchar(32) NOT NULL,
  access_token_hash varchar(64),
  expires_at timestamp,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_name varchar,
  display_name_hash varchar(64),
  spotify_user_id varchar,
  connected_at timestamp DEFAULT NOW() NOT NULL,
  disconnected_at timestamp,
  last_refresh_at timestamp,
  refresh_failure_count integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT NOW() NOT NULL,
  updated_at timestamp DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_spotify_tokens_connected ON spotify_tokens(connected_at DESC) WHERE disconnected_at IS NULL;
```

Rollback inverso (DROP TABLE).

### Encryption details

- **Algorithm**: AES-256-GCM (Node crypto stdlib).
- **Key**: 32 bytes hex em env var `SPOTIFY_TOKEN_ENCRYPTION_KEY`. **Boot fail** se ausente (lesson AI-2B Q-F UNSUBSCRIBE_SECRET_MISSING).
- **IV**: 12 bytes random por token, armazenado em coluna `refresh_token_iv`.
- **Auth tag**: 16 bytes, armazenado em coluna `refresh_token_auth_tag`.
- **Ciphertext**: base64 em `refresh_token_encrypted`.
- Helper em `server/services/spotifyTokenCrypto.ts` exporta `encryptRefreshToken(plaintext) -> {ciphertext, iv, authTag}` + `decryptRefreshToken(row) -> plaintext`.

### Client-side flow

```typescript
// client/src/lib/spotify/auth.ts
async function initiateSpotifyAuth() {
  const { authUrl, state } = await apiRequest('POST', '/api/audio/spotify/oauth-init');
  const popup = window.open(authUrl, 'spotify-auth', 'width=500,height=700');

  // Listener no parent escuta postMessage do popup pos-callback
  return new Promise((resolve, reject) => {
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data.type === 'spotify-oauth-success') {
        // accessToken + expiresIn + displayName chegam aqui (cookie httpOnly setado pelo server)
        resolve(event.data);
      }
    });
  });
}

async function refreshAccessToken(): Promise<{ accessToken: string; expiresIn: number }> {
  // Cookie httpOnly enviado automaticamente. Server le, faz refresh, retorna access_token novo.
  return apiRequest('POST', '/api/audio/spotify/refresh');
}

async function disconnectSpotify(): Promise<void> {
  await apiRequest('POST', '/api/audio/spotify/disconnect');
  // Cookie limpo pelo server. Driver destruido client-side.
}
```

`access_token` mantido em closure do `SpotifyAudioDriver` (React state ou ref). NUNCA persiste em storage.

### Refresh proativo (D4 spec MP2)

Client agenda `setTimeout(refreshAccessToken, (expiresIn - 300) * 1000)` (5min antes de expirar). Falha 3x consecutivas (1s/2s/4s exponencial) -> `disconnect()` + UI prompt.

## Consequencias

### Positivas

- `refresh_token` inacessivel a XSS. **Superficie de ataque reduzida a "comprometer o server"** (alinhado com JWT refresh rotation ADR-143).
- `access_token` em memoria: janela XSS = max 60min, comparavel a JWT access token do proprio Grindfy.
- Server controla revocation: user clica "Desconectar" no Grindfy -> `disconnected_at = NOW()` -> proxima tentativa de refresh do client falha + prompt reconectar.
- Compliance OWASP A07. Auditoria futura passa cleanly.
- Pattern reusavel pra futuros providers OAuth (Apple Music, YouTube em MP4+).
- Multi-tab share automatico via cookie domain-wide. Sem race de localStorage encrypted.

### Negativas

- 4 endpoints novos no backend (test coverage + reviewer + manutencao).
- Migration nova (0077) + tabela nova + rollback.
- `SPOTIFY_TOKEN_ENCRYPTION_KEY` precisa ser provisionada em todos os ambientes (dev/staging/prod). Documentar em CLAUDE.md + `.env.example` + checklist de deploy.
- Custo dev: ~1-2d incremento vs Opcao 1.
- Em-memory session map pro OAuth state (10min TTL) e single-instance — mover pra Redis se Grindfy escalar pra multi-instance (post-MVP).

### Neutras

- Spec MP2 D3 + Q-A revisadas: localStorage encrypted **descartado**. Migration 0077 (que estava "RESERVADA Q-F audio_telemetry") agora vira `spotify_tokens`. Telemetria audio NAO precisa migration nova (ADR-191 reusa `user_activity`).
- `SpotifyTokensStorage` (`server/storage/spotifyTokensStorage.ts`) sera novo modulo com pattern Drizzle padrao do projeto.

## Confianca

Alta. Decisao alinha com:
- Threat model claro (XSS catastrofico via refresh_token long-lived).
- Lesson Grindfy historica (cada vetor XSS subestimado custou rounds).
- Pattern ja estabelecido no projeto (ADR-143 JWT refresh rotation, encryption AES-256).
- Custo dev revisado (~1-2d incremento, amortizado por seguranca).
- Compliance forward-looking.

## Referencias

- ADR-143 (JWT refresh token rotation — pattern de encryption + cookie httpOnly ja estabelecido).
- ADR-189 (Audio queue strategy homogenea — esta decisao acopla ao Spotify driver real).
- ADR-191 (Telemetria audio reuse `user_activity`).
- Spec `Docs/specs/sprint-mini-player-2.md` D3 + Q-A (revisados).
- OWASP Top 10 2021 A07 (Identification and Authentication Failures).
- Spotify OAuth docs: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- Diagrama `Docs/architecture/diagrams/mini-player-2/spotify-oauth-pkce-sequence.mermaid`.
