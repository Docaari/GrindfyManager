// Sprint Mini Player 2 (RF-01.1 / RF-01.4 / RF-01.6) — client-side OAuth helpers.
//
// ADR-190: refresh_token NUNCA chega ao client. Server proxy via cookie httpOnly.
//
// Exporta:
//  - initiateSpotifyAuth(): Promise<{accessToken, expiresIn, displayName, productTier}>
//  - refreshAccessToken(): Promise<{accessToken, expiresIn}>
//  - disconnectSpotify(): Promise<void>
//  - generatePkceVerifier()
//  - generatePkceChallenge(verifier)
//  - Classes: SpotifyPremiumRequiredError, SpotifyAuthError, SpotifyPopupBlockedError,
//             SpotifyOAuthCancelledError

import { apiRequest } from "@/lib/queryClient";

// ============================================================================
// Errors
// ============================================================================

export class SpotifyPremiumRequiredError extends Error {
  displayName: string;
  email?: string;
  constructor(displayName: string, email?: string) {
    super("Spotify Premium required");
    this.name = "SpotifyPremiumRequiredError";
    this.displayName = displayName;
    this.email = email;
    Object.setPrototypeOf(this, SpotifyPremiumRequiredError.prototype);
  }
}

export class SpotifyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyAuthError";
    Object.setPrototypeOf(this, SpotifyAuthError.prototype);
  }
}

export class SpotifyPopupBlockedError extends Error {
  constructor() {
    super("Spotify OAuth popup blocked");
    this.name = "SpotifyPopupBlockedError";
    Object.setPrototypeOf(this, SpotifyPopupBlockedError.prototype);
  }
}

export class SpotifyOAuthCancelledError extends Error {
  constructor() {
    super("Spotify OAuth cancelled");
    this.name = "SpotifyOAuthCancelledError";
    Object.setPrototypeOf(this, SpotifyOAuthCancelledError.prototype);
  }
}

// ============================================================================
// PKCE helpers
// ============================================================================

const URL_SAFE_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

function randomBytesArray(len: number): Uint8Array {
  const out = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(out);
  } else {
    for (let i = 0; i < len; i++) out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

export function generatePkceVerifier(): string {
  const bytes = randomBytesArray(64);
  let out = "";
  for (const b of bytes) {
    out += URL_SAFE_CHARS[b % URL_SAFE_CHARS.length];
  }
  return out;
}

function base64urlFromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  // btoa fallback for jsdom + browser
  const b64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function generatePkceChallenge(verifier: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return base64urlFromBuffer(hash);
  }
  // Node fallback
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto2 = (await import("crypto")).default ?? (await import("crypto"));
  const hash = (crypto2 as any).createHash("sha256").update(verifier).digest();
  return hash
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// ============================================================================
// OAuth flow
// ============================================================================

export interface SpotifyAuthSuccess {
  accessToken: string;
  expiresIn: number;
  displayName: string;
  productTier?: string;
}

export async function initiateSpotifyAuth(): Promise<SpotifyAuthSuccess> {
  const init = await apiRequest("POST", "/api/audio/spotify/oauth-init");
  const authUrl = (init as any)?.authUrl;
  if (!authUrl) throw new SpotifyAuthError("oauth-init: authUrl ausente");

  const popup = window.open(
    authUrl,
    "spotify-auth",
    "width=500,height=700,menubar=no,toolbar=no",
  );
  if (!popup) {
    throw new SpotifyPopupBlockedError();
  }

  return new Promise<SpotifyAuthSuccess>((resolve, reject) => {
    let resolved = false;
    const expectedOrigin = window.location.origin;

    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== expectedOrigin) return; // security: ignore foreign origins
      const data = ev.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "spotify-oauth-success") {
        resolved = true;
        cleanup();
        resolve({
          accessToken: data.accessToken,
          expiresIn: data.expiresIn,
          displayName: data.displayName,
          productTier: data.productTier,
        });
      } else if (data.type === "spotify-oauth-premium-required") {
        resolved = true;
        cleanup();
        reject(new SpotifyPremiumRequiredError(data.displayName ?? "", data.email));
      } else if (data.type === "spotify-oauth-error") {
        resolved = true;
        cleanup();
        reject(new SpotifyAuthError(data.reason ?? "oauth_failed"));
      }
    };

    function cleanup() {
      window.removeEventListener("message", onMessage);
      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        // ignore
      }
    }

    window.addEventListener("message", onMessage);

    // Best-effort: detect popup closed by user (cancel).
    const popupRef = popup;
    const interval = setInterval(() => {
      try {
        if (popupRef && popupRef.closed && !resolved) {
          clearInterval(interval);
          window.removeEventListener("message", onMessage);
          reject(new SpotifyOAuthCancelledError());
        } else if (resolved) {
          clearInterval(interval);
        }
      } catch {
        // cross-origin or closed
      }
    }, 500);
  });
}

export async function refreshAccessToken(): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const res: any = await apiRequest("POST", "/api/audio/spotify/refresh");
  return { accessToken: res?.accessToken, expiresIn: res?.expiresIn };
}

export async function disconnectSpotify(): Promise<void> {
  await apiRequest("POST", "/api/audio/spotify/disconnect");
}
