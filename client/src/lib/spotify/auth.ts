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

import { apiRequest, queryClient } from "@/lib/queryClient";
import { saveOAuthSnapshot } from "@/lib/spotify/oauthSnapshot";

// RF-04 — invalida ["spotify-status"] no SUCESSO do connect (postMessage OU
// resolveViaStatusFallback), centralizando a invalidacao no auth.ts para que
// `useSpotifyStatus` (staleTime ~60s) refaca o fetch e o gate visual convirja
// para "conectado" sem F5. Lesson #29: usa o singleton `queryClient`, NAO
// `useQueryClient`. Best-effort — nunca throw.
export function invalidateSpotifyStatus(): void {
  try {
    queryClient.invalidateQueries({ queryKey: ["spotify-status"] });
  } catch {
    // ignore
  }
}

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

/**
 * Snapshot proativo + redirect full-page (ADR-194, MP3 RF-06.1).
 * NAO retorna — page destroy. Promise pendente eh OK porque o callback
 * vai recarregar a app.
 */
function fallbackRedirect(authUrl: string): void {
  try {
    saveOAuthSnapshot(authUrl);
  } catch {
    // ignore
  }
  try {
    window.location.href = authUrl;
  } catch {
    // ignore
  }
}

/**
 * Fallback resiliente a COOP: o accounts.spotify.com pode cortar
 * `window.opener`, entao o `postMessage` do callback nunca chega. Mas o server
 * ja persistiu o token + setou o cookie de sessao no sucesso. Consultamos o
 * status; se conectado, montamos o SpotifyAuthSuccess via refreshAccessToken
 * (o access_token nao volta no status). Retorna null se nao conectado.
 */
export async function resolveViaStatusFallback(): Promise<SpotifyAuthSuccess | null> {
  try {
    const resp = await fetch("/api/audio/spotify/status", {
      credentials: "include",
    });
    if (!resp.ok) return null;
    const s = await resp.json();
    if (s?.connected !== true) return null;
    // CRITICAL: usa silentMode. Um 401 transiente/stale do /refresh durante o
    // poll NAO pode disparar o logout global do apiRequest (que faz
    // window.location.href='/login' + limpa user data) — isso recarregava a
    // pagina e forcava re-login no meio do OAuth. silentMode lanca o erro sem
    // refresh+redirect; tratamos como "ainda nao pronto" (null).
    const r: any = await apiRequest(
      "POST",
      "/api/audio/spotify/refresh",
      undefined,
      { silentMode: true },
    );
    if (!r?.accessToken) return null;
    // RF-04 — sucesso real (conectado + access token): invalida status.
    invalidateSpotifyStatus();
    return {
      accessToken: r.accessToken,
      expiresIn: r.expiresIn,
      displayName: s.displayName ?? "",
      productTier: s.productTier ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function initiateSpotifyAuth(): Promise<SpotifyAuthSuccess> {
  const init = await apiRequest("POST", "/api/audio/spotify/oauth-init");
  const authUrl = (init as any)?.authUrl;
  if (!authUrl) throw new SpotifyAuthError("oauth-init: authUrl ausente");

  // Guard host mismatch: o cookie de sessao OAuth/Spotify e gravado no host do
  // redirect_uri (ex: 127.0.0.1). Se a pagina atual roda em outro host (ex:
  // localhost), os cookies ficam em jars separados e o callback/refresh
  // retornam 401 silenciosamente. Spotify exige 127.0.0.1 (rejeita localhost),
  // entao o app precisa ser acessado no MESMO host do redirect_uri.
  try {
    const redirectHost = new URL(
      new URL(authUrl).searchParams.get("redirect_uri") ?? "",
    ).host;
    if (redirectHost && redirectHost !== window.location.host) {
      throw new SpotifyAuthError(
        `host_mismatch: abra o app em http://${redirectHost} (atual: ${window.location.host}). ` +
          `O Spotify exige 127.0.0.1 e os cookies nao cruzam entre localhost e 127.0.0.1.`,
      );
    }
  } catch (e) {
    if (e instanceof SpotifyAuthError) throw e;
    // URL parse falhou -> segue (best-effort).
  }

  const popup = window.open(
    authUrl,
    "spotify-auth",
    "width=500,height=700,menubar=no,toolbar=no",
  );
  // Sprint MP3 RF-06.1 (D15 + ADR-194): popup === null -> fallback automatico.
  if (!popup) {
    fallbackRedirect(authUrl);
    // Page redirect destroi React. Retorna promise pending.
    return new Promise<SpotifyAuthSuccess>(() => {
      /* never resolves — page navigates away */
    });
  }

  return new Promise<SpotifyAuthSuccess>((resolve, reject) => {
    let resolved = false;
    const expectedOrigin = window.location.origin;
    const startTs = Date.now();
    // Grace inicial: logo apos window.open o popup pode reportar
    // `.closed === true` num race (antes da navegacao cross-site commitar) ou
    // por COOP. NAO tratar isso como cancel/fallback — senao a pagina principal
    // era redirecionada (fallbackRedirect) junto com o popup. Aguarda o popup
    // assentar antes de confiar em `.closed`.
    const CLOSE_GRACE_MS = 1200;

    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== expectedOrigin) return; // security: ignore foreign origins
      const data = ev.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "spotify-oauth-success") {
        resolved = true;
        cleanup();
        // RF-04 — invalida ["spotify-status"] no sucesso via postMessage.
        invalidateSpotifyStatus();
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
      // B-POPUP-HANG: limpa os timers de poll/timeout no fast-path (postMessage).
      try {
        clearInterval(interval);
      } catch {
        // ignore
      }
      try {
        clearTimeout(absoluteTimer);
      } catch {
        // ignore
      }
      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        // ignore
      }
    }

    window.addEventListener("message", onMessage);

    // Best-effort: detecta popup fechado pelo user (cancel). NUNCA redireciona
    // a pagina principal — o popup ja esta aberto; a pagina atual deve
    // permanecer e aguardar o resultado. `.closed` so e confiavel apos a grace
    // inicial (evita falso-positivo do race de abertura/COOP).
    const popupRef = popup;
    let checking = false;

    const succeed = (fb: SpotifyAuthSuccess) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(fb);
    };

    // Poll de status: cobre o caso COOP (opener cortado -> postMessage nunca
    // chega). O server ja setou o cookie de sessao no sucesso, entao o status
    // vira `connected:true` mesmo sem a mensagem.
    const pollStatus = async () => {
      if (resolved || checking) return;
      checking = true;
      try {
        const fb = await resolveViaStatusFallback();
        if (fb) succeed(fb);
      } finally {
        checking = false;
      }
    };

    // B-POPUP-HANG: timeout absoluto. Sob COOP `.closed` pode mentir + o
    // postMessage nunca chega -> sem isto a Promise pendurava o spinner
    // "Conectando..." pra sempre. Aos ~120s resolve via status (se conectou) ou
    // rejeita com erro claro.
    const ABSOLUTE_TIMEOUT_MS = 120_000;
    const absoluteTimer = setTimeout(() => {
      if (resolved) return;
      void (async () => {
        await pollStatus();
        if (!resolved) {
          resolved = true;
          clearInterval(interval);
          window.removeEventListener("message", onMessage);
          try {
            if (popupRef && !popupRef.closed) popupRef.close();
          } catch {
            // ignore
          }
          reject(new SpotifyOAuthCancelledError());
        }
      })();
    }, ABSOLUTE_TIMEOUT_MS);

    // Throttle do poll de status com popup aberto: o `.closed`-check roda a
    // 500ms, mas o `/status`(+/refresh) só a cada OPEN_POLL_INTERVAL_MS pra não
    // spammar `/refresh` 401 enquanto o user não conclui o login (reviewer MED).
    const OPEN_POLL_INTERVAL_MS = 3000;
    let lastOpenPollAt = 0;
    const interval = setInterval(() => {
      if (resolved) {
        clearInterval(interval);
        clearTimeout(absoluteTimer);
        return;
      }
      if (Date.now() - startTs < CLOSE_GRACE_MS) return;
      let isClosed = false;
      try {
        isClosed = !!(popupRef && popupRef.closed);
      } catch {
        isClosed = false;
      }
      if (isClosed) {
        clearInterval(interval);
        clearTimeout(absoluteTimer);
        // Popup fechou: confirma via status UMA vez antes de decidir cancel.
        void (async () => {
          await pollStatus();
          if (!resolved) {
            resolved = true;
            window.removeEventListener("message", onMessage);
            reject(new SpotifyOAuthCancelledError());
          }
        })();
        return;
      }
      // B-POPUP-HANG: popup ainda aberto -> poll periodico do status (respeita o
      // lock `checking`). Sob COOP, `.closed` pode mentir e o postMessage nao
      // chega; o cookie de sessao ja foi setado pelo callback, entao o status
      // converge mesmo sem a mensagem. O lock evita spam concorrente.
      if (!checking && Date.now() - lastOpenPollAt >= OPEN_POLL_INTERVAL_MS) {
        lastOpenPollAt = Date.now();
        void pollStatus();
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
  // D7 (B-DISCONNECT-SYNC): invalida o status DENTRO do helper (apos o POST) —
  // qualquer caller (painel, futuros) fica sincronizado sem replicar a
  // invalidacao. Idempotente.
  invalidateSpotifyStatus();
}
