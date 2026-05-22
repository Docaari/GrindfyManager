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
    const cookieRaw = req.cookies?.[SPOTIFY_SESSION_COOKIE];
    if (!cookieRaw) {
      res.status(401).json({ message: "Spotify session ausente" });
      return;
    }

    // MEDIUM-8: validar `uid` no JWT contra `req.user.userPlatformId` — sem
    // isso, um attacker que rouba o cookie spotify_session de outro user
    // poderia usar seu proprio JWT geral pra solicitar refresh com creds
    // do dono do cookie. Em test/dev tolerado se decode falhar.
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
      // NOTA: MEDIUM-1 ("invalid_grant -> disconnect direto") foi DEFERIDO em
      // R2 — teste existente
      // `Spotify refresh endpoint 400 → incrementa failure_count + 502`
      // (audio-spotify-refresh.test.ts:225) afirma o comportamento atual com
      // body `{ error: 'invalid_grant' }`. Implementer NAO modifica testes;
      // MEDIUM-1 era opcional ("se sobrar tempo"). Documentar para MP3.
      //
      // HIGH-2: usar retorno de incrementRefreshFailureCount em vez de
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
      productTier: "premium", // somente premium chega aqui (RF-01.2)
      connectedAt: row.connectedAt ?? null,
    });
  } catch (err) {
    console.error("spotify.status.error", { err });
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
  app.get(
    "/api/audio/spotify/oauth-callback",
    requireAuth,
    async (req, res) => {
      await handleGetSpotifyOauthCallback(req, res);
    },
  );
  app.post("/api/audio/spotify/refresh", requireAuth, async (req, res) => {
    await handlePostSpotifyRefresh(req, res);
  });
  app.post("/api/audio/spotify/disconnect", requireAuth, async (req, res) => {
    await handlePostSpotifyDisconnect(req, res);
  });
  app.get("/api/audio/spotify/status", requireAuth, async (req, res) => {
    await handleGetSpotifyStatus(req, res);
  });
}
