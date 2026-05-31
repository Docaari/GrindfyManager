// Sprint SPOTIFY-DEEP / RF-03 + ADR-208 §1 — Helper requireSpotifyAccess.
//
// Centraliza:
//   - Lookup spotify_tokens row.
//   - Tier gate (deve ser feito antes — caller decide via resolveUserTier).
//   - Auto-refresh quando expiresAt < now + 60s.
//   - Marca disconnect em invalid_grant.
//   - Encrypt/save de refresh_token rotacionado (Spotify pode mandar novo).
//
// Lesson #34 — deps injetadas (storage, fetchFn, tokenCrypto, accessCache).
// Lesson #36 — service NAO importa @shared/schema no topo (todo o shape vem via deps).
// Lesson #5/#35 — fetchFn injetado, sem `new` em SDKs.

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const REFRESH_WINDOW_MS = 60_000; // refresh se expira em menos de 60s

export type SpotifyAccessErrorReason =
  | "not_connected"
  | "tier_blocked"
  | "invalid_refresh"
  | "refresh_network"
  | "config_missing";

export class SpotifyAccessError extends Error {
  reason: SpotifyAccessErrorReason;
  constructor(reason: SpotifyAccessErrorReason, message?: string) {
    super(message ?? reason);
    this.name = "SpotifyAccessError";
    this.reason = reason;
    // Garantir prototype para instanceof (TS classes em node antigos).
    Object.setPrototypeOf(this, SpotifyAccessError.prototype);
  }
}

export interface SpotifyTokenRow {
  userId: string;
  refreshTokenEncrypted: string;
  refreshTokenIv: string;
  refreshTokenAuthTag: string;
  accessTokenHash?: string | null;
  expiresAt: Date;
  scopes?: string[] | null;
  disconnectedAt?: Date | null;
  displayName?: string | null;
  displayNameHash?: string | null;
  spotifyUserId?: string | null;
  refreshFailureCount?: number | null;
}

export interface SpotifyAccessDeps {
  storage: {
    getSpotifyToken(userId: string): Promise<SpotifyTokenRow | null>;
    markSpotifyDisconnected(userId: string, reason?: string): Promise<void>;
    incrementRefreshFailureCount?(userId: string): Promise<number>;
    updateRefreshSuccess(
      userId: string,
      patch: { expiresAt: Date; accessTokenHash?: string | null },
    ): Promise<void>;
    upsertSpotifyToken(row: SpotifyTokenRow): Promise<void>;
  };
  fetchFn: typeof fetch;
  tokenCrypto: {
    decryptRefreshToken(input: {
      refreshTokenEncrypted: string;
      refreshTokenIv: string;
      refreshTokenAuthTag: string;
    }): string;
    encryptRefreshToken(refreshToken: string): {
      ciphertext: string;
      iv: string;
      authTag: string;
    };
  };
  accessCache?: {
    get(userId: string): string | null;
    set(userId: string, token: string, ttlMs: number): void;
    invalidate(userId: string): void;
  };
}

export interface AccessResult {
  accessToken: string;
}

/**
 * Resolve access_token valido para chamadas Spotify Web API.
 *
 * Fluxo:
 *  1. Le row spotify_tokens. Sem row OR disconnectedAt → SpotifyAccessError(not_connected).
 *  2. Se accessCache fornecido e retorna hit (cached) → devolve direto sem refresh.
 *  3. Se expiresAt > now+60s → ainda assim chama refresh (nao temos access plaintext at rest).
 *     [Note: cache no caller resolve este caso comum; helper sempre refresca se nao houver cache hit.]
 *  4. Refresh: POST accounts.spotify.com/api/token com refresh_token plain.
 *  5. invalid_grant → mark disconnect + throw invalid_refresh.
 *  6. Network throw → throw refresh_network (NAO marca disconnect).
 *  7. SPOTIFY_CLIENT_ID/SECRET ausentes → throw config_missing.
 *
 * Tier gate eh responsabilidade do caller (handlers chamam resolveUserTier ANTES).
 */
export async function requireSpotifyAccess(
  userId: string,
  deps: SpotifyAccessDeps,
): Promise<AccessResult> {
  // Config check — early para fail fast.
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new SpotifyAccessError("config_missing", "Spotify client creds ausentes");
  }

  // 1. Row check.
  const row = await deps.storage.getSpotifyToken(userId);
  if (!row || row.disconnectedAt) {
    throw new SpotifyAccessError("not_connected", "Spotify nao conectado");
  }

  // 2. Cache hit?
  const cached = deps.accessCache?.get(userId);
  if (cached) {
    return { accessToken: cached };
  }

  // 3+4. Refresh (sempre que sem cache, ja que access_token nao eh persistido).
  //
  // RF-07 / ADR-220 D6 — GOTCHA: distinguir erro de PROGRAMACAO (dep ausente,
  // `tokenCrypto`/`decryptRefreshToken` undefined -> TypeError) de CORRUPCAO REAL
  // do ciphertext (decrypt lanca erro NAO-TypeError, ex. AES-GCM auth fail).
  // So o segundo caso marca disconnect — bug de chamada NAO pode desconectar o
  // usuario (scripts de diagnostico com deps incompletos desconectavam o founder
  // a cada run).
  if (
    !deps.tokenCrypto ||
    typeof deps.tokenCrypto.decryptRefreshToken !== "function"
  ) {
    // Dep ausente / objeto parcial — erro de configuracao, NAO de dados.
    // eslint-disable-next-line no-console
    console.error("spotify.access.config_missing_token_crypto", { userId });
    throw new SpotifyAccessError(
      "config_missing",
      "tokenCrypto dep ausente — erro de configuracao (NAO desconecta)",
    );
  }

  let refreshTokenPlain: string;
  try {
    refreshTokenPlain = deps.tokenCrypto.decryptRefreshToken({
      refreshTokenEncrypted: row.refreshTokenEncrypted,
      refreshTokenIv: row.refreshTokenIv,
      refreshTokenAuthTag: row.refreshTokenAuthTag,
    });
  } catch (err) {
    // RF-07 (refinado): nem todo TypeError eh erro de programacao. O AES-256-GCM
    // do Node lanca TypeError para CORRUPCAO REAL de dados — ex. IV com tamanho
    // invalido ("Invalid initialization vector"), auth tag invalida ("Invalid
    // authentication tag length"/"Unsupported state or unable to authenticate
    // data"). Esses casos sao corrupcao do ciphertext e DEVEM desconectar.
    //
    // So o TypeError de DEP AUSENTE ("is not a function" / "Cannot read
    // properties of undefined") eh erro de config — NAO desconecta (a guarda
    // antes do try ja cobre o caso comum de dep ausente; aqui cobrimos o
    // metodo que existe mas chama algo undefined internamente).
    const msg = String((err as Error)?.message ?? "");
    // Assinaturas de CORRUPCAO real do AES-256-GCM (Node crypto). Especificas —
    // NAO usar "data" cru (muito amplo, casaria com mensagens de config).
    const isCorruption =
      /initialization vector|authenticate data|auth(?:entication)? tag|unsupported state/i.test(
        msg,
      );
    const isDepMissing =
      err instanceof TypeError &&
      !isCorruption &&
      /is not a function|cannot read propert/i.test(msg);
    if (isDepMissing) {
      // eslint-disable-next-line no-console
      console.error("spotify.access.decrypt_typeerror", {
        userId,
        message: msg,
      });
      throw new SpotifyAccessError(
        "config_missing",
        "decryptRefreshToken falhou com TypeError de dep ausente (erro de programacao)",
      );
    }
    // Corrupcao real do ciphertext (TypeError de IV/tag invalida OU erro
    // generico nao-TypeError) — invalid_refresh + disconnect.
    // eslint-disable-next-line no-console
    console.error("spotify.access.decrypt_fail", { userId, message: msg });
    await safeMarkDisconnect(deps.storage, userId, "decrypt_fail");
    throw new SpotifyAccessError("invalid_refresh", "Token nao decriptavel");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshTokenPlain,
    client_id: clientId,
  }).toString();

  let resp: any;
  try {
    resp = await deps.fetchFn(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body,
    } as any);
  } catch (err) {
    // Network throw — NAO marca disconnect.
    // eslint-disable-next-line no-console
    console.error("spotify.access.refresh_network", { userId });
    throw new SpotifyAccessError("refresh_network", "Erro de rede no refresh");
  }

  if (!resp?.ok) {
    let errJson: any = null;
    try {
      errJson = await resp.json();
    } catch {
      // ignore
    }
    if (errJson?.error === "invalid_grant") {
      await safeMarkDisconnect(deps.storage, userId, "invalid_grant");
      throw new SpotifyAccessError("invalid_refresh", "Token revogado");
    }
    // Outro erro upstream (5xx, 4xx generico) — trata como network-ish.
    // eslint-disable-next-line no-console
    console.error("spotify.access.refresh_upstream_fail", {
      userId,
      status: resp.status,
    });
    throw new SpotifyAccessError("refresh_network", "Refresh upstream falhou");
  }

  let json: any;
  try {
    json = await resp.json();
  } catch (err) {
    throw new SpotifyAccessError("refresh_network", "Resposta refresh invalida");
  }

  const newAccessToken: string = json.access_token;
  const expiresIn: number = json.expires_in ?? 3600;
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

  // 5. Save success.
  try {
    await deps.storage.updateRefreshSuccess(userId, {
      expiresAt: newExpiresAt,
      accessTokenHash: null,
    });
  } catch {
    // best-effort
  }

  // 6. Rotation: refresh_token novo no body do response.
  if (json.refresh_token && json.refresh_token !== refreshTokenPlain) {
    try {
      const enc = deps.tokenCrypto.encryptRefreshToken(json.refresh_token);
      await deps.storage.upsertSpotifyToken({
        userId,
        refreshTokenEncrypted: enc.ciphertext,
        refreshTokenIv: enc.iv,
        refreshTokenAuthTag: enc.authTag,
        accessTokenHash: null,
        expiresAt: newExpiresAt,
        scopes: row.scopes ?? [],
        displayName: row.displayName ?? null,
        displayNameHash: row.displayNameHash ?? null,
        spotifyUserId: row.spotifyUserId ?? null,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("spotify.access.rotation_save_fail", { userId });
    }
  }

  // 7. Cache it (TTL slightly less than expiresIn pra evitar race).
  try {
    if (deps.accessCache) {
      deps.accessCache.set(userId, newAccessToken, Math.max(60, expiresIn - 60) * 1000);
    }
  } catch {
    // ignore
  }

  return { accessToken: newAccessToken };
}

async function safeMarkDisconnect(
  storage: SpotifyAccessDeps["storage"],
  userId: string,
  reason: string,
): Promise<void> {
  try {
    await storage.markSpotifyDisconnected(userId, reason);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("spotify.access.mark_disconnect_fail", { userId });
  }
}

// =============================================================================
// Default access-token in-memory cache (singleton).
// Used by handlers when no test cache injected.
// =============================================================================

interface CachedAccess {
  token: string;
  expiresAt: number;
}

class InMemoryAccessCache {
  private store: Map<string, CachedAccess> = new Map();
  get(userId: string): string | null {
    const e = this.store.get(userId);
    if (!e) return null;
    if (e.expiresAt < Date.now()) {
      this.store.delete(userId);
      return null;
    }
    return e.token;
  }
  set(userId: string, token: string, ttlMs: number): void {
    this.store.set(userId, { token, expiresAt: Date.now() + ttlMs });
  }
  invalidate(userId: string): void {
    this.store.delete(userId);
  }
  _resetForTests(): void {
    this.store.clear();
  }
}

export const defaultAccessTokenCache = new InMemoryAccessCache();
