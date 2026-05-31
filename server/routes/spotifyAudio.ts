// Sprint Mini Player 2 (ADR-190) — Spotify OAuth + token refresh + disconnect.
//
// 5 endpoints expostos via handlers exportados (lesson #34 — testaveis via injetar storage).
//
//  - POST /api/audio/spotify/oauth-init     (RF-01.1)
//  - GET  /api/audio/spotify/oauth-callback (RF-01.1 + RF-01.2 Premium gate)
//  - POST /api/audio/spotify/refresh        (RF-01.4)
//  - POST /api/audio/spotify/disconnect     (RF-01.6)
//  - GET  /api/audio/spotify/status         (consumido pelo SpotifyConnectionPanel)
//
// Refresh token: AES-256-GCM at rest. NUNCA chega ao client. Cookie httpOnly +
// JWT signed liga session -> linha em spotify_tokens.

import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
// HIGH-4 fix (lesson #37): import estatico em vez de require() runtime.
// `defaultAccessTokenCache` eh singleton in-memory; importavel direto sem
// quebrar bundle esbuild prod (ESM).
import { defaultAccessTokenCache } from "../services/spotifyAccess";
// CRITICAL-1 fix: resolveEligiblePlanTier mapeia subscription_plan='trial'
// corretamente — resolveUserTier (coachAccess) trata trial como 'free'.
import { resolveEligiblePlanTier } from "../coach/planEligibility";
// B-COVER-1 / ADR-221 §D6 — SSoT da allowlist de cover (sufixo).
import { sanitizeSpotifyCover } from "@shared/spotifyCoverHosts";

const SPOTIFY_OAUTH_SESSION_COOKIE = "spotify_oauth_session";
const SPOTIFY_SESSION_COOKIE = "spotify_session";
const OAUTH_SESSION_TTL_SEC = 600;
const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_ME_URL = "https://api.spotify.com/v1/me";
const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
  // Necessarios pra GET /me/playlists devolver playlists privadas/colaborativas.
  // Sem eles a aba "Minhas playlists" volta vazia.
  "playlist-read-private",
  "playlist-read-collaborative",
];

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function generateCodeVerifier(): string {
  // 64 random bytes => ~86 base64url chars (within 43-128 RFC range).
  return base64url(randomBytes(48));
}

function generateCodeChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

function generateState(): string {
  // 32 chars hex = 16 bytes.
  return randomBytes(24).toString("hex"); // 48 chars hex (>=32)
}

function hashDisplayName(name: string): string {
  return createHash("sha256").update(name).digest("hex").slice(0, 32);
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // CRITICAL-5: never permit hardcoded dev fallback in production.
      throw new Error(
        "JWT_SECRET ausente em producao — Spotify OAuth desabilitado",
      );
    }
    // eslint-disable-next-line no-console
    console.warn(
      "[spotifyAudio] JWT_SECRET ausente — usando dev fallback (NODE_ENV != production)",
    );
    return "dev-jwt-secret";
  }
  return secret;
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function setOauthSessionCookie(res: Response, sessionId: string): void {
  const token = jwt.sign({ sid: sessionId }, jwtSecret(), {
    expiresIn: OAUTH_SESSION_TTL_SEC,
  });
  res.cookie(SPOTIFY_OAUTH_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    maxAge: OAUTH_SESSION_TTL_SEC * 1000,
    path: "/",
  });
}

function setSpotifySessionCookie(res: Response, userId: string): void {
  const token = jwt.sign({ uid: userId }, jwtSecret(), { expiresIn: "30d" });
  res.cookie(SPOTIFY_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
  });
}

function clearSpotifySessionCookie(res: Response): void {
  res.clearCookie(SPOTIFY_SESSION_COOKIE, { path: "/" });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * CRITICAL-7: escape JSON pra interpolar com seguranca dentro de <script>.
 * `displayName` do Spotify pode conter `</script>...<script>...` ou marcadores
 * HTML comment fechando o bloco prematuramente. Padrao SSR conhecido (e.g.
 * Express ejs, React renderToString) — substitui `<`, `-->`, U+2028, U+2029.
 */
function escapeScriptJson(payload: unknown): string {
  return JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/-->/g, "--\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function renderOauthCallbackHtml(
  payload: Record<string, unknown>,
  origin: string,
): string {
  const safe = escapeScriptJson(payload);
  const safeOrigin = escapeScriptJson(origin);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Spotify</title></head>
<body><script>
try {
  if (window.opener) {
    window.opener.postMessage(${safe}, ${safeOrigin});
  }
} catch (e) {}
window.close();
</script>
<p>${escapeHtml((payload as any).type ?? "")}</p>
</body></html>`;
}

function sendOauthError(
  res: any,
  status: number,
  reason: string,
  origin: string,
): void {
  res
    .status(status)
    .send(
      renderOauthCallbackHtml(
        { type: "spotify-oauth-error", reason },
        origin,
      ),
    );
}

// =============================================================================
// POST /api/audio/spotify/oauth-init
// =============================================================================
export async function handlePostSpotifyOauthInit(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      console.error("spotify.oauth.init.config_missing", {
        hasClient: !!clientId,
        hasRedirect: !!redirectUri,
      });
      res.status(500).json({ message: "Spotify config ausente" });
      return;
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();
    const sessionId = randomBytes(16).toString("hex");

    const { putOauthSession } = await import("../services/spotifyOauthSessions");
    putOauthSession(sessionId, {
      userId,
      codeVerifier,
      state,
      createdAt: Date.now(),
    });

    setOauthSessionCookie(res, sessionId);

    const url = new URL(SPOTIFY_AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("state", state);

    res.status(200).json({ authUrl: url.toString(), state });
  } catch (err) {
    console.error("spotify.oauth.init.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// =============================================================================
// GET /api/audio/spotify/oauth-callback
// =============================================================================
export async function handleGetSpotifyOauthCallback(
  req: any,
  res: any,
  deps?: { storage?: any; fetchFn?: any },
): Promise<void> {
  const fetchFn = deps?.fetchFn ?? (globalThis as any).fetch;
  const storage =
    deps?.storage ?? (await import("../storage/spotifyTokensStorage"));
  const origin =
    (req.headers?.origin as string) ??
    (req.headers?.host
      ? `${req.protocol || "http"}://${req.headers.host}`
      : "*");

  try {
    const cookieRaw = req.cookies?.[SPOTIFY_OAUTH_SESSION_COOKIE];
    if (!cookieRaw) {
      sendOauthError(res, 401, "session_missing", origin);
      return;
    }

    // Decode session id (JWT signed). CRITICAL-6: nao aceitar cookie raw em
    // prod — fallback raw deixava qualquer string ser interpretada como
    // sessionId valido. Em test/dev (NODE_ENV != production) tolerado pra
    // facilitar test setup sem JWT real.
    let sessionId: string | null = null;
    try {
      const decoded = jwt.verify(cookieRaw, jwtSecret()) as any;
      sessionId = decoded?.sid ?? null;
    } catch {
      if (process.env.NODE_ENV !== "production") {
        sessionId = cookieRaw;
      } else {
        sendOauthError(res, 401, "invalid_cookie", origin);
        return;
      }
    }
    if (!sessionId) {
      sendOauthError(res, 401, "invalid_cookie", origin);
      return;
    }

    const { getOauthSession, deleteOauthSession } = await import(
      "../services/spotifyOauthSessions"
    );
    const session = getOauthSession(sessionId);
    if (!session) {
      sendOauthError(res, 401, "session_expired", origin);
      return;
    }

    const queryCode = String(req.query?.code ?? "");
    const queryState = String(req.query?.state ?? "");
    if (!queryCode || queryState !== session.state) {
      sendOauthError(res, 400, "state_mismatch", origin);
      return;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      sendOauthError(res, 500, "config_missing", origin);
      return;
    }

    // Token exchange.
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code: queryCode,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: session.codeVerifier,
    }).toString();
    const tokenResp = await fetchFn(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body: tokenBody,
    });
    if (!tokenResp?.ok) {
      sendOauthError(res, 502, "token_exchange_failed", origin);
      return;
    }
    const tokenJson = await tokenResp.json();

    // Me API — Premium gate.
    const meResp = await fetchFn(SPOTIFY_ME_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!meResp?.ok) {
      sendOauthError(res, 502, "me_fetch_failed", origin);
      return;
    }
    const me = await meResp.json();

    if (me?.product !== "premium") {
      deleteOauthSession(sessionId);
      res.status(200).send(
        renderOauthCallbackHtml(
          {
            type: "spotify-oauth-premium-required",
            displayName: me?.display_name ?? null,
          },
          origin,
        ),
      );
      return;
    }

    // Premium OK -> persiste tokens.
    const { encryptRefreshToken } = await import(
      "../services/spotifyTokenCrypto"
    );
    const enc = encryptRefreshToken(tokenJson.refresh_token);
    const displayName = me?.display_name ?? null;
    await storage.upsertSpotifyToken({
      userId: session.userId,
      refreshTokenEncrypted: enc.ciphertext,
      refreshTokenIv: enc.iv,
      refreshTokenAuthTag: enc.authTag,
      accessTokenHash: createHash("sha256")
        .update(tokenJson.access_token)
        .digest("hex"),
      expiresAt: new Date(Date.now() + (tokenJson.expires_in ?? 3600) * 1000),
      scopes: (tokenJson.scope || "").split(" ").filter(Boolean),
      displayName,
      displayNameHash: displayName ? hashDisplayName(displayName) : null,
      spotifyUserId: me?.id ?? null,
      // B-PRODUCTTIER (migration 0084): persiste me.product (premium hoje, mas
      // o status passa a refletir o real em vez de hardcode).
      productTier: me?.product ?? null,
    });

    deleteOauthSession(sessionId);
    setSpotifySessionCookie(res, session.userId);

    res.status(200).send(
      renderOauthCallbackHtml(
        {
          type: "spotify-oauth-success",
          accessToken: tokenJson.access_token,
          expiresIn: tokenJson.expires_in,
          displayName,
        },
        origin,
      ),
    );
  } catch (err) {
    console.error("spotify.oauth.callback.error", { err });
    sendOauthError(res, 500, "internal", origin);
  }
}

// =============================================================================
// POST /api/audio/spotify/refresh
// =============================================================================
export async function handlePostSpotifyRefresh(
  req: any,
  res: any,
  deps?: { storage?: any; fetchFn?: any },
): Promise<void> {
  const fetchFn = deps?.fetchFn ?? (globalThis as any).fetch;
  const storage =
    deps?.storage ?? (await import("../storage/spotifyTokensStorage"));
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    // O cookie spotify_session e REDUNDANTE pra identidade: requireAuth (JWT
    // grindfy) ja autentica o dono, e a token row e buscada por `userId`.
    // Exigir o cookie criava um modo de falha (cookie limpo / nao cruza
    // localhost<->127.0.0.1 / COOP) onde /status dizia connected (DB row) mas
    // /refresh dava 401. Quando o cookie ESTA presente, ainda validamos o
    // mismatch (defesa contra cookie roubado de outro user — MEDIUM-8). Quando
    // ausente, prosseguimos com o userId do JWT (o proprio dono).
    const cookieRaw = req.cookies?.[SPOTIFY_SESSION_COOKIE];
    if (cookieRaw) {
      try {
        const decoded = jwt.verify(cookieRaw, jwtSecret()) as any;
        if (decoded?.uid && decoded.uid !== userId) {
          res.status(401).json({ message: "Spotify session mismatch" });
          return;
        }
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          res.status(401).json({ message: "Spotify session invalida" });
          return;
        }
        // dev/test: tolera (cookie pode ser stub em test setup)
      }
    }

    const row = await storage.getSpotifyToken(userId);
    if (!row) {
      res.status(404).json({ message: "Spotify nao conectado" });
      return;
    }
    if (row.disconnectedAt) {
      clearSpotifySessionCookie(res);
      res.status(401).json({ message: "Spotify desconectado" });
      return;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(500).json({ message: "Spotify config ausente" });
      return;
    }

    const { decryptRefreshToken, encryptRefreshToken } = await import(
      "../services/spotifyTokenCrypto"
    );
    let refreshTokenPlain: string;
    try {
      refreshTokenPlain = decryptRefreshToken({
        refreshTokenEncrypted: row.refreshTokenEncrypted,
        refreshTokenIv: row.refreshTokenIv,
        refreshTokenAuthTag: row.refreshTokenAuthTag,
      });
    } catch (err) {
      console.error("spotify.refresh.decrypt.error", { userId, err });
      res.status(500).json({ message: "Erro interno" });
      return;
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTokenPlain,
      client_id: clientId,
    }).toString();

    const resp = await fetchFn(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body,
    });
    if (!resp?.ok) {
      // Sprint Mini Player 3 / RF-01 + D1 + Q-M (ADR-195):
      // `invalid_grant` -> disconnect direto. NAO incrementa failure_count.
      // Distingue do path generico (502 + increment + >=3 disconnect).
      const errJson = await resp.json().catch(() => null);
      if (errJson?.error === "invalid_grant") {
        await storage.markSpotifyDisconnected(userId, "invalid_grant");
        clearSpotifySessionCookie(res);
        res
          .status(401)
          .json({ message: "Spotify token revogado. Reconecte." });
        return;
      }
      // B-DISCONNECT-3X: 5xx upstream = transitorio (hiccup da Spotify). NAO
      // incrementa o failure_count (nao caminha rumo ao disconnect permanente).
      // Devolve 502 ao client; a proxima tentativa pode recuperar.
      if (resp.status >= 500) {
        res.status(502).json({ message: "Spotify indisponivel (transitorio)" });
        return;
      }
      // Path generico (4xx nao-invalid_grant): incrementa + 502 (ou 401 apos 3 fails).
      // HIGH-2 (MP2): usar retorno de incrementRefreshFailureCount em vez de
      // ler row.refreshFailureCount + 1 (stale em requisicoes concorrentes).
      const newCount = await storage.incrementRefreshFailureCount(userId);
      const failureCount = Number.isFinite(newCount)
        ? newCount
        : (row.refreshFailureCount ?? 0) + 1;
      if (failureCount >= 3) {
        await storage.markSpotifyDisconnected(userId, "refresh_failed_3x");
        clearSpotifySessionCookie(res);
        res.status(401).json({ message: "Spotify refresh failed 3 vezes" });
        return;
      }
      res.status(502).json({ message: "Spotify refresh falhou" });
      return;
    }
    const json = await resp.json();
    const accessToken = json.access_token;
    const expiresIn = json.expires_in ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const accessTokenHash = createHash("sha256")
      .update(accessToken)
      .digest("hex");

    await storage.updateRefreshSuccess(userId, {
      expiresAt,
      accessTokenHash,
    });

    // Rotation — Spotify pode mandar refresh_token novo.
    if (json.refresh_token && json.refresh_token !== refreshTokenPlain) {
      const enc = encryptRefreshToken(json.refresh_token);
      await storage.upsertSpotifyToken({
        userId,
        refreshTokenEncrypted: enc.ciphertext,
        refreshTokenIv: enc.iv,
        refreshTokenAuthTag: enc.authTag,
        accessTokenHash,
        expiresAt,
        scopes: row.scopes ?? [],
        displayName: row.displayName ?? null,
        displayNameHash: row.displayNameHash ?? null,
        spotifyUserId: row.spotifyUserId ?? null,
      });
    }

    // NUNCA expoe refresh_token na resposta.
    res.status(200).json({ accessToken, expiresIn });
  } catch (err) {
    console.error("spotify.refresh.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// =============================================================================
// POST /api/audio/spotify/disconnect
// =============================================================================
export async function handlePostSpotifyDisconnect(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  const storage =
    injectedStorage ?? (await import("../storage/spotifyTokensStorage"));
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    // Idempotente — chama markDisconnected mesmo se nao existir / ja desconectado.
    const row = await storage.getSpotifyToken(userId);
    if (row && !row.disconnectedAt) {
      await storage.markSpotifyDisconnected(userId, "user_initiated");
    }
    clearSpotifySessionCookie(res);
    res.status(204).end();
  } catch (err) {
    console.error("spotify.disconnect.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// =============================================================================
// GET /api/audio/spotify/status
// =============================================================================
export async function handleGetSpotifyStatus(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  const storage =
    injectedStorage ?? (await import("../storage/spotifyTokensStorage"));
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    const row = await storage.getSpotifyToken(userId);
    if (!row || row.disconnectedAt) {
      res.status(200).json({ connected: false });
      return;
    }
    res.status(200).json({
      connected: true,
      displayName: row.displayName ?? null,
      // B-PRODUCTTIER: reflete o tier persistido na row; back-compat (rows antigas
      // sem a coluna) cai pro default "premium" (so premium conectou ate hoje).
      // Sem migration/persistencia ainda (deferido) — fallback cobre.
      productTier: row.productTier ?? "premium",
      connectedAt: row.connectedAt ?? null,
    });
  } catch (err) {
    console.error("spotify.status.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// =============================================================================
// Sprint SPOTIFY-DEEP / RF-03 + ADR-208 — Catalog proxy handlers (3 endpoints).
// =============================================================================

import { z } from "zod";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

// Cache singleton (per-process) — pode ser invalidado via invalidateSpotifyCache.
let _catalogCacheSingleton: any = null;
async function getDefaultCatalogCache() {
  if (_catalogCacheSingleton) return _catalogCacheSingleton;
  const mod = await import("../services/spotifyCatalogCache");
  _catalogCacheSingleton = mod.defaultSpotifyCatalogCache;
  return _catalogCacheSingleton;
}

let _tokenBucketSingleton: any = null;
async function getDefaultTokenBucket() {
  if (_tokenBucketSingleton) return _tokenBucketSingleton;
  const mod = await import("../services/spotifyRateLimit");
  _tokenBucketSingleton = mod.defaultSpotifyTokenBucket;
  return _tokenBucketSingleton;
}

/**
 * Sprint SPOTIFY-DEEP / RF-03 — invalidacao explicita do cache de catalog.
 * Chamado em disconnect handler + disponivel pra testes/debugging.
 *
 * R1 fix HIGH-4 (lesson #37): import estatico de defaultAccessTokenCache via
 * topo do arquivo — `require()` runtime nao resolve em bundle esbuild ESM
 * prod. Logamos erros explicitamente (lesson #9) em vez de try/catch silenc.
 */
export function invalidateSpotifyCache(userId: string): void {
  if (_catalogCacheSingleton) {
    try {
      _catalogCacheSingleton.invalidate(userId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("spotify.cache.invalidate.catalog_fail", { userId, err });
    }
  }
  try {
    defaultAccessTokenCache.invalidate(userId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("spotify.cache.invalidate.access_fail", { userId, err });
  }
}

// B-COVER-1 / ADR-221 §D6: allowlist por SUFIXO (SSoT shared) — paridade
// client sanitize. Capas custom de playlist (image-cdn-ak.spotifycdn.com) passam.
function sanitizeCoverFromSpotify(url: string | null | undefined): string | null {
  return sanitizeSpotifyCover(url);
}

function normalizeTrack(track: any): any {
  if (!track) return null;
  // B-EPISODE-1 / ADR-221: episodios projetam capa em `images` (top-level) e
  // preview em `audio_preview_url`; tracks normais usam album.images / preview_url.
  const isEpisode = track.type === "episode";
  const coverUrlRaw = isEpisode
    ? (track.images?.[0]?.url ?? null)
    : (track.album?.images?.[0]?.url ?? null);
  const previewUrlRaw = isEpisode
    ? (track.audio_preview_url ?? null)
    : (track.preview_url ?? null);
  const fallbackUriPrefix = isEpisode ? "spotify:episode:" : "spotify:track:";
  return {
    trackId: track.uri ?? (track.id ? `${fallbackUriPrefix}${track.id}` : ""),
    title: track.name ?? "",
    artists: Array.isArray(track.artists)
      ? track.artists.map((a: any) => a?.name ?? "").filter(Boolean)
      : [],
    durationSec: Math.round((track.duration_ms ?? 0) / 1000),
    previewUrl: previewUrlRaw,
    coverUrl: sanitizeCoverFromSpotify(coverUrlRaw),
    album: track.album?.name ?? "",
  };
}

function normalizePlaylist(pl: any): any {
  if (!pl) return null;
  const coverUrlRaw =
    Array.isArray(pl.images) && pl.images[0]?.url ? pl.images[0].url : null;
  // B-PLCOUNT-1 / RF-01: trackCount = number | null. null = total desconhecido
  // (API nao mandou tracks.total); 0 = vazio comprovado; n = presente. NUNCA
  // colapsar undefined em 0 ("0 tracks" mentiroso).
  const totalRaw = pl.tracks?.total;
  const trackCount = typeof totalRaw === "number" ? totalRaw : null;
  return {
    playlistId: pl.id ?? "",
    name: pl.name ?? "",
    trackCount,
    coverUrl: sanitizeCoverFromSpotify(coverUrlRaw),
    ownerName: pl.owner?.display_name ?? null,
    isCollaborative: !!pl.collaborative,
    isPublic: !!pl.public,
  };
}

/**
 * R1 fix CRITICAL-1: usa resolveEligiblePlanTier (planEligibility.ts) em vez
 * de resolveUserTier (coachAccess.ts). resolveUserTier mapeia
 * subscription_plan='trial' -> 'free' (bug AI-1B latent), bloqueando todos os
 * trials server-side. resolveEligiblePlanTier devolve 'trial'|'pro'|'premium'|
 * 'admin'|null corretamente. `inject` (test override) preservado p/ compat.
 *
 * Passa `subscriptionPlanRaw` (req.user.subscriptionPlan) p/ short-circuit
 * sincrono em 'trial'/'admin'/'pro'/'premium' sem hit DB. Em 'active' eh
 * resolvido async via resolveUserTier internamente.
 */
async function resolveTier(
  userId: string,
  subscriptionPlanRaw: string | null | undefined,
  inject?: (user: any) => Promise<string>,
): Promise<string> {
  if (inject) {
    return inject({
      userPlatformId: userId,
      subscriptionPlan: subscriptionPlanRaw,
    } as any);
  }
  try {
    const tier = await resolveEligiblePlanTier(userId, subscriptionPlanRaw);
    return tier ?? "free";
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("spotify.tier.resolve_fail", {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return "free"; // safe-deny (lesson #9)
  }
}

const ALLOWED_TIERS = new Set(["pro", "premium", "admin", "trial"]);

interface CatalogDeps {
  storage?: any;
  fetchFn?: any;
  resolveUserTier?: (user: any) => Promise<string>;
  tokenBucket?: { consume: (userId: string) => any };
  cache?: { get: any; set: any; invalidate: any };
  tokenCrypto?: any;
  // R1 fix CRITICAL-2: accessCache injetavel p/ tests bypass refresh.
  // Default = defaultAccessTokenCache singleton (in-memory cross-restart cold).
  accessCache?: {
    get: (userId: string) => string | null;
    set: (userId: string, token: string, ttlMs: number) => void;
    invalidate: (userId: string) => void;
  };
}

async function resolveCatalogDeps(deps?: CatalogDeps) {
  const fetchFn = deps?.fetchFn ?? (globalThis as any).fetch;
  const storage =
    deps?.storage ?? (await import("../storage/spotifyTokensStorage"));
  const tokenBucket = deps?.tokenBucket ?? (await getDefaultTokenBucket());
  const cache = deps?.cache ?? (await getDefaultCatalogCache());
  const tokenCrypto =
    deps?.tokenCrypto ?? (await import("../services/spotifyTokenCrypto"));
  // R1 fix CRITICAL-2: accessCache default = singleton in-memory.
  const accessCache = deps?.accessCache ?? defaultAccessTokenCache;
  return { fetchFn, storage, tokenBucket, cache, tokenCrypto, accessCache };
}

async function gateAndAccess(
  userId: string,
  subscriptionPlanRaw: string | null | undefined,
  deps: Awaited<ReturnType<typeof resolveCatalogDeps>>,
  resolveTierFn?: (user: any) => Promise<string>,
): Promise<
  | { tokenOk: true; accessToken: string }
  | { tokenOk: false; status: number; message: string }
> {
  const tier = (
    await resolveTier(userId, subscriptionPlanRaw, resolveTierFn)
  ).toLowerCase();
  if (!ALLOWED_TIERS.has(tier)) {
    try {
      const row = await deps.storage.getSpotifyToken(userId);
      if (!row || row.disconnectedAt) {
        return {
          tokenOk: false,
          status: 403,
          message: "Spotify nao conectado",
        };
      }
    } catch {
      // best-effort
    }
    return {
      tokenOk: false,
      status: 403,
      message: "Premium Grindfy necessario (spotify_deep_requires_pro_plus)",
    };
  }

  let row: any;
  try {
    row = await deps.storage.getSpotifyToken(userId);
  } catch {
    row = null;
  }
  if (!row || row.disconnectedAt) {
    return { tokenOk: false, status: 403, message: "Spotify nao conectado" };
  }

  // R1 fix CRITICAL-2: SEMPRE refresh quando access cache cold. Branch
  // placeholder `accessToken: ""` (que confiava no token DB) causava 502
  // pos-restart porque access_token NAO eh persistido plaintext (so hash).
  // Custo: ~200ms 1x por sessao. Cache cross-restart eh follow-up MP3.4.
  const accessCache = deps.accessCache;
  const cached = accessCache.get(userId);
  if (cached) return { tokenOk: true, accessToken: cached };

  try {
    const accessMod = await import("../services/spotifyAccess");
    const { accessToken } = await accessMod.requireSpotifyAccess(userId, {
      storage: deps.storage,
      fetchFn: deps.fetchFn,
      tokenCrypto: deps.tokenCrypto,
      accessCache,
    });
    return { tokenOk: true, accessToken };
  } catch (err: any) {
    const reason = err?.reason ?? "unknown";
    if (reason === "not_connected") {
      return { tokenOk: false, status: 403, message: "Spotify nao conectado" };
    }
    if (reason === "invalid_refresh") {
      return {
        tokenOk: false,
        status: 401,
        message: "Spotify token revogado. Reconecte.",
      };
    }
    if (reason === "config_missing") {
      return { tokenOk: false, status: 500, message: "Spotify config ausente" };
    }
    return { tokenOk: false, status: 502, message: "Spotify indisponivel" };
  }
}

const SearchQuerySchema = z.object({
  q: z.string().min(2).max(200),
  type: z.literal("track").optional().default("track"),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function handleSpotifySearch(
  req: any,
  res: any,
  injectedDeps?: CatalogDeps,
): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    const parsed = SearchQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "Query invalido" });
      return;
    }
    const { q, type, limit } = parsed.data;

    const deps = await resolveCatalogDeps(injectedDeps);
    const cacheKey = { q, type, limit };
    const cached = deps.cache.get(userId, "search", cacheKey);
    if (cached) {
      res.status(200).json({ ...cached, cached: true });
      return;
    }

    const gate = await gateAndAccess(
      userId,
      req.user?.subscriptionPlan ?? null,
      deps,
      injectedDeps?.resolveUserTier,
    );
    if (!gate.tokenOk) {
      res.status(gate.status).json({ message: gate.message });
      return;
    }

    const bucketRes = deps.tokenBucket.consume(userId);
    if (!bucketRes?.allowed) {
      res.status(429).json({
        message: "Rate limit local",
        retryAfterMs: bucketRes?.retryAfterMs ?? 1000,
      });
      return;
    }

    const upstream = new URL(`${SPOTIFY_API_BASE}/search`);
    upstream.searchParams.set("q", q);
    upstream.searchParams.set("type", type);
    upstream.searchParams.set("limit", String(limit));
    upstream.searchParams.set("market", "from_token");

    let resp: any;
    try {
      resp = await deps.fetchFn(upstream.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${gate.accessToken}` },
      } as any);
    } catch {
      // eslint-disable-next-line no-console
      console.error("[spotifyCatalog] search network fail");
      res.status(502).json({ message: "Spotify indisponivel" });
      return;
    }

    if (!resp?.ok) {
      const status = resp?.status ?? 502;
      if (status === 429) {
        const retryAfterHeader =
          (typeof resp.headers?.get === "function"
            ? resp.headers.get("retry-after") ?? resp.headers.get("Retry-After")
            : null) ?? null;
        if (retryAfterHeader) {
          try {
            res.setHeader("Retry-After", String(retryAfterHeader));
          } catch {
            // ignore
          }
        }
        res.status(429).json({
          message: "Spotify rate-limit",
          retryAfter: retryAfterHeader,
          retryAfterMs:
            retryAfterHeader && /^\d+$/.test(String(retryAfterHeader))
              ? Number(retryAfterHeader) * 1000
              : undefined,
        });
        return;
      }
      res.status(502).json({ message: "Spotify indisponivel" });
      return;
    }

    let json: any;
    try {
      json = await resp.json();
    } catch {
      res.status(502).json({ message: "Spotify indisponivel" });
      return;
    }
    const items = json?.tracks?.items ?? [];
    const normalized = { tracks: items.map(normalizeTrack).filter(Boolean) };
    deps.cache.set(userId, "search", cacheKey, normalized);
    res.status(200).json({ ...normalized, cached: false });
  } catch {
    // eslint-disable-next-line no-console
    console.error("[spotifyCatalog] search handler error");
    res.status(500).json({ message: "Erro interno" });
  }
}

const PlaylistsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(50),
  offset: z.coerce.number().int().min(0).max(100_000).optional().default(0),
});

export async function handleSpotifyListPlaylists(
  req: any,
  res: any,
  injectedDeps?: CatalogDeps,
): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    const parsed = PlaylistsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "Query invalido" });
      return;
    }
    const { limit, offset } = parsed.data;

    const deps = await resolveCatalogDeps(injectedDeps);
    const cacheKey = { limit, offset };
    const cached = deps.cache.get(userId, "playlists", cacheKey);
    if (cached) {
      res.status(200).json({ ...cached, cached: true });
      return;
    }

    const gate = await gateAndAccess(
      userId,
      req.user?.subscriptionPlan ?? null,
      deps,
      injectedDeps?.resolveUserTier,
    );
    if (!gate.tokenOk) {
      res.status(gate.status).json({ message: gate.message });
      return;
    }

    const bucketRes = deps.tokenBucket.consume(userId);
    if (!bucketRes?.allowed) {
      res.status(429).json({
        message: "Rate limit local",
        retryAfterMs: bucketRes?.retryAfterMs ?? 1000,
      });
      return;
    }

    const upstream = new URL(`${SPOTIFY_API_BASE}/me/playlists`);
    upstream.searchParams.set("limit", String(limit));
    if (offset > 0) upstream.searchParams.set("offset", String(offset));
    // B-PLCOUNT-1 / RF-01: pedir tracks.total explicitamente (sem fields a API
    // 2026 pode omitir -> trackCount viraria null em todos). Mantem demais
    // campos consumidos por normalizePlaylist.
    upstream.searchParams.set(
      "fields",
      "items(id,name,images,owner.display_name,collaborative,public,tracks.total),total,limit,offset",
    );

    let resp: any;
    try {
      resp = await deps.fetchFn(upstream.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${gate.accessToken}` },
      } as any);
    } catch {
      // eslint-disable-next-line no-console
      console.error("[spotifyCatalog] playlists network fail");
      res.status(502).json({ message: "Spotify indisponivel" });
      return;
    }

    if (!resp?.ok) {
      const status = resp?.status ?? 502;
      if (status === 429) {
        const retryAfterHeader =
          (typeof resp.headers?.get === "function"
            ? resp.headers.get("retry-after") ?? resp.headers.get("Retry-After")
            : null) ?? null;
        if (retryAfterHeader) {
          try {
            res.setHeader("Retry-After", String(retryAfterHeader));
          } catch {
            // ignore
          }
        }
        res.status(429).json({
          message: "Spotify rate-limit",
          retryAfter: retryAfterHeader,
        });
        return;
      }
      res.status(502).json({ message: "Spotify indisponivel" });
      return;
    }

    let json: any;
    try {
      json = await resp.json();
    } catch {
      res.status(502).json({ message: "Spotify indisponivel" });
      return;
    }
    const items = (json?.items ?? []).map(normalizePlaylist).filter(Boolean);
    const total = json?.total ?? items.length;
    const normalized = {
      playlists: items,
      total,
      truncated: total > items.length,
    };
    deps.cache.set(userId, "playlists", cacheKey, normalized);
    res.status(200).json({ ...normalized, cached: false });
  } catch {
    // eslint-disable-next-line no-console
    console.error("[spotifyCatalog] playlists handler error");
    res.status(500).json({ message: "Erro interno" });
  }
}

const PlaylistIdSchema = z.string().regex(/^[a-zA-Z0-9]{22}$/);
const PlaylistTracksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(50),
  // B-PAGINATE-1: aceita offset para o paginador (client itera offset crescente).
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export async function handleSpotifyPlaylistTracks(
  req: any,
  res: any,
  injectedDeps?: CatalogDeps,
): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    const idParsed = PlaylistIdSchema.safeParse(req.params?.id);
    if (!idParsed.success) {
      res.status(400).json({ message: "playlistId invalido" });
      return;
    }
    const playlistId = idParsed.data;
    const qParsed = PlaylistTracksQuerySchema.safeParse(req.query ?? {});
    if (!qParsed.success) {
      res.status(400).json({ message: "Query invalido" });
      return;
    }
    const { limit, offset } = qParsed.data;

    const deps = await resolveCatalogDeps(injectedDeps);
    const cacheKey = { playlistId, limit, offset };
    const cached = deps.cache.get(userId, "playlist_tracks", cacheKey);
    if (cached) {
      res.status(200).json({ ...cached, cached: true });
      return;
    }

    const gate = await gateAndAccess(
      userId,
      req.user?.subscriptionPlan ?? null,
      deps,
      injectedDeps?.resolveUserTier,
    );
    if (!gate.tokenOk) {
      res.status(gate.status).json({ message: gate.message });
      return;
    }

    const bucketRes = deps.tokenBucket.consume(userId);
    if (!bucketRes?.allowed) {
      res.status(429).json({
        message: "Rate limit local",
        retryAfterMs: bucketRes?.retryAfterMs ?? 1000,
      });
      return;
    }

    // Spotify deprecou GET /playlists/{id}/tracks na migração de 2026-03-09 →
    // 403 Forbidden para apps em Development Mode. O substituto é /items, que
    // generaliza track→item (playlists podem conter tracks OU episódios). O
    // campo de cada entrada passou de `track` para `item`. Ver ADR-220.
    // B-EPISODE-1: projeta `type` (distingue track/episode) + os campos
    // especificos de episode (`images` top-level, `audio_preview_url`) alem dos
    // de track (album.images, preview_url). normalizeTrack escolhe a fonte por type.
    const fields =
      "items(item(id,name,uri,type,duration_ms,preview_url,audio_preview_url,images,album(name,images),artists(name))),total,limit";
    const upstream = new URL(
      `${SPOTIFY_API_BASE}/playlists/${playlistId}/items`,
    );
    upstream.searchParams.set("limit", String(limit));
    if (offset > 0) upstream.searchParams.set("offset", String(offset));
    upstream.searchParams.set("fields", fields);

    let resp: any;
    try {
      resp = await deps.fetchFn(upstream.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${gate.accessToken}` },
      } as any);
    } catch {
      // eslint-disable-next-line no-console
      console.error("[spotifyCatalog] playlist_tracks network fail");
      res.status(502).json({ message: "Spotify indisponivel" });
      return;
    }

    if (!resp?.ok) {
      const status = resp?.status ?? 502;
      if (status === 404) {
        res
          .status(404)
          .json({ message: "Playlist nao encontrada ou sem acesso" });
        return;
      }
      if (status === 429) {
        const retryAfterHeader =
          (typeof resp.headers?.get === "function"
            ? resp.headers.get("retry-after") ?? resp.headers.get("Retry-After")
            : null) ?? null;
        if (retryAfterHeader) {
          try {
            res.setHeader("Retry-After", String(retryAfterHeader));
          } catch {
            // ignore
          }
        }
        res.status(429).json({
          message: "Spotify rate-limit",
          retryAfter: retryAfterHeader,
        });
        return;
      }
      res.status(502).json({ message: "Spotify indisponivel" });
      return;
    }

    let json: any;
    try {
      json = await resp.json();
    } catch {
      res.status(502).json({ message: "Spotify indisponivel" });
      return;
    }
    const rawItems = json?.items ?? [];
    const tracksNormalized = rawItems
      // /items usa `item`; fallback `track` para back-compat de cache/respostas
      // antigas. Episódios (type='episode') também caem aqui mas normalizeTrack
      // extrai os campos comuns (id/name/uri/duration).
      .map((it: any) => normalizeTrack(it?.item ?? it?.track))
      .filter(Boolean);
    const total = json?.total ?? tracksNormalized.length;
    const normalized = {
      tracks: tracksNormalized,
      total,
      truncated: total > tracksNormalized.length,
    };
    deps.cache.set(userId, "playlist_tracks", cacheKey, normalized);
    res.status(200).json({ ...normalized, cached: false });
  } catch {
    // eslint-disable-next-line no-console
    console.error("[spotifyCatalog] playlist_tracks handler error");
    res.status(500).json({ message: "Erro interno" });
  }
}

// =============================================================================
// Route registration
// =============================================================================
export function registerSpotifyAudioRoutes(app: Express): void {
  app.post("/api/audio/spotify/oauth-init", requireAuth, async (req, res) => {
    await handlePostSpotifyOauthInit(req, res);
  });
  // NAO usa requireAuth: o callback eh um redirect top-level cross-site do
  // popup (accounts.spotify.com -> nosso callback). O cookie de auth da
  // plataforma (grindfy_access_token, 15min) frequentemente nao chega nesse
  // momento (expirou durante o OAuth dance ou o browser dropa em cross-site),
  // o que disparava 401 "Token de acesso necessario" cru no popup. A identidade
  // do usuario eh carregada pelo cookie de sessao OAuth assinado
  // (SPOTIFY_OAUTH_SESSION_COOKIE -> session.userId) + validacao do param state
  // (CSRF). Mesmo padrao do callback do Google OAuth.
  app.get(
    "/api/audio/spotify/oauth-callback",
    async (req, res) => {
      await handleGetSpotifyOauthCallback(req, res);
    },
  );
  app.post("/api/audio/spotify/refresh", requireAuth, async (req, res) => {
    await handlePostSpotifyRefresh(req, res);
  });
  app.post("/api/audio/spotify/disconnect", requireAuth, async (req, res) => {
    await handlePostSpotifyDisconnect(req, res);
    try {
      const userId = req.user?.userPlatformId;
      if (userId) invalidateSpotifyCache(userId);
    } catch {
      // ignore
    }
  });
  app.get("/api/audio/spotify/status", requireAuth, async (req, res) => {
    await handleGetSpotifyStatus(req, res);
  });
  // Sprint SPOTIFY-DEEP / RF-03.
  app.get("/api/audio/spotify/search", requireAuth, async (req, res) => {
    await handleSpotifySearch(req, res);
  });
  app.get(
    "/api/audio/spotify/me/playlists",
    requireAuth,
    async (req, res) => {
      await handleSpotifyListPlaylists(req, res);
    },
  );
  app.get(
    "/api/audio/spotify/playlists/:id/tracks",
    requireAuth,
    async (req, res) => {
      await handleSpotifyPlaylistTracks(req, res);
    },
  );
}
