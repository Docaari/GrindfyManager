// SpotifyAudioDriver — Sprint Mini Player 2 (RF-01.3 + RF-01.4 + RF-01.5).
//
// Real implementation: Web Playback SDK (Spotify.Player) + REST API.
// access_token em closure ref (NUNCA em storage).
// Token refresh proativo: setTimeout 5min antes do expiry.
// Reconnect retry exponencial 1s/2s/4s em not_ready/auth_error.
//
// Lessons aplicadas: #5/#35 (new SDK em try/catch fallback factory), #34 (deps
// injetadas).

import { loadSpotifySDK } from "@/lib/spotify/sdkLoader";
import type {
  AudioDriverEvent,
  AudioTrack,
  AudioTrackSource,
  IAudioSourceDriver,
} from "./types";

const SPOTIFY_API = "https://api.spotify.com/v1";

export class SpotifyReconnectFailedError extends Error {
  constructor() {
    super("Spotify reconnect failed apos 3 tentativas");
    this.name = "SpotifyReconnectFailedError";
    Object.setPrototypeOf(this, SpotifyReconnectFailedError.prototype);
  }
}

export interface SpotifyAudioDriverDeps {
  accessToken: string;
  expiresIn: number;
  refresh: () => Promise<{ accessToken: string; expiresIn: number }>;
  sdkLoader?: () => Promise<any>;
  fetchFn?: typeof fetch;
  telemetry?: (
    action: string,
    payload: Record<string, unknown>,
    options?: { feature?: string; duration?: number },
  ) => void;
  onPremiumRequired?: (displayName?: string) => void;
  onTokenRefreshed?: (accessToken: string, expiresIn: number) => void;
  onReconnectFailed?: () => void;
}

type Listener = (data?: any) => void;

export class SpotifyAudioDriver implements IAudioSourceDriver {
  readonly source: AudioTrackSource = "spotify";

  deviceId: string | null = null;

  private accessToken: string;
  private expiresIn: number;
  private readonly refreshFn: () => Promise<{
    accessToken: string;
    expiresIn: number;
  }>;
  private readonly sdkLoaderFn: () => Promise<any>;
  private readonly fetchFn: typeof fetch;
  private readonly telemetry?: (
    action: string,
    payload: Record<string, unknown>,
    options?: { feature?: string; duration?: number },
  ) => void;
  private readonly onReconnectFailed?: () => void;
  private readonly onTokenRefreshed?: (accessToken: string, expiresIn: number) => void;

  private player: any = null;
  private SDK: any = null;
  private currentTrack: AudioTrack | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  private currentTime = 0;
  private duration = 0;

  private readonly handlers: Record<string, Set<Listener>> = {
    timeupdate: new Set(),
    ended: new Set(),
    durationchange: new Set(),
    error: new Set(),
  };

  constructor(deps: SpotifyAudioDriverDeps) {
    this.accessToken = deps.accessToken;
    this.expiresIn = deps.expiresIn;
    this.refreshFn = deps.refresh;
    this.sdkLoaderFn = deps.sdkLoader ?? (loadSpotifySDK as any);
    this.fetchFn =
      deps.fetchFn ??
      (typeof fetch !== "undefined" ? fetch : (undefined as any));
    this.telemetry = deps.telemetry;
    this.onReconnectFailed = deps.onReconnectFailed;
    this.onTokenRefreshed = deps.onTokenRefreshed;
  }

  /** Telemetry never throws — used in 6+ call sites across driver lifecycle. */
  private safeTelemetry(
    action: string,
    payload: Record<string, unknown>,
    options?: { feature?: string; duration?: number },
  ): void {
    if (!this.telemetry) return;
    try {
      this.telemetry(action, payload, options);
    } catch {
      // ignore
    }
  }

  /**
   * Fire-and-forget PUT to Spotify Web API with bearer auth. Used by
   * play/pause/seek — UI state is driven by player_state_changed events,
   * not by REST response.
   *
   * HIGH-1: erros nao sao mais silenciosos — 401 dispara reconnect, !ok
   * emite evento `error` + telemetria, network throw cai em catch+telemetria.
   */
  private spotifyApiPut(path: string, body?: unknown): void {
    if (!this.deviceId) return;
    const init: RequestInit = {
      method: "PUT",
      headers: body
        ? {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          }
        : { Authorization: `Bearer ${this.accessToken}` },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    try {
      const p = this.fetchFn(`${SPOTIFY_API}${path}`, init);
      if (p && typeof (p as any).then === "function") {
        (p as Promise<Response>)
          .then((r) => {
            if (!r) return;
            if (r.status === 401) {
              this.safeTelemetry("spotify_api_error", {
                path,
                status: 401,
              });
              this.tryReconnect(0);
              return;
            }
            if (!r.ok) {
              const err = new Error(
                `Spotify API ${r.status} ${path}`,
              );
              this.safeTelemetry("spotify_api_error", {
                path,
                status: r.status,
              });
              this.emit("error", err);
            }
          })
          .catch((err) => {
            this.safeTelemetry("spotify_api_error", {
              path,
              network: true,
              message: String(err?.message ?? err),
            });
            this.emit("error", err);
          });
      }
    } catch (err) {
      this.safeTelemetry("spotify_api_error", {
        path,
        sync_throw: true,
        message: String((err as any)?.message ?? err),
      });
      this.emit("error", err);
    }
  }

  // -------------------------------------------------------------------------
  // Connect
  // -------------------------------------------------------------------------
  async connect(): Promise<void> {
    if (this.destroyed) return;
    this.SDK = await this.sdkLoaderFn();
    const PlayerCtor = this.SDK?.Player;
    const ctorArg = {
      name: "Grindfy",
      getOAuthToken: (cb: (token: string) => void) => {
        cb(this.accessToken);
      },
      volume: 1.0,
    };

    // Lesson #5/#35: vi.fn() arrow nao eh new-callable em strict mode. Para
    // evitar double-counting do mock (new throw -> counted -> fallback counted),
    // detectamos via Reflect.construct + checagem do prototype. Para classes
    // reais (Spotify.Player), usar Reflect.construct. Para mocks vi.fn() (arrow
    // sem prototype.constructor proprio), chamar como factory.
    let player: any;
    const proto = (PlayerCtor as any).prototype;
    const isProperConstructor =
      typeof PlayerCtor === "function" &&
      !!proto &&
      proto.constructor === PlayerCtor &&
      // arrow vi.fn() has prototype but constructor === vi.fn (still PlayerCtor),
      // distinguir checando se tem keys/methods.
      Object.getOwnPropertyNames(proto).length > 1;
    if (isProperConstructor) {
      player = Reflect.construct(PlayerCtor, [ctorArg]);
    } else {
      player = PlayerCtor(ctorArg);
    }
    this.player = player;

    // Attach SDK listeners.
    const onReady = (data: any) => {
      this.deviceId = data?.device_id ?? null;
      this.safeTelemetry("spotify_connected", { deviceId: this.deviceId });
    };
    const onNotReady = (_data: any) => {
      this.tryReconnect(0);
    };
    const onStateChanged = (state: any) => {
      if (!state) return;
      if (typeof state.position === "number") {
        this.currentTime = state.position / 1000;
        this.emit("timeupdate", { currentTime: this.currentTime });
      }
      if (typeof state.duration === "number" && state.duration !== this.duration * 1000) {
        this.duration = state.duration / 1000;
        this.emit("durationchange", { duration: this.duration });
      }
      // Detect "ended": position >= duration AND paused
      if (
        state.paused === true &&
        typeof state.position === "number" &&
        typeof state.duration === "number" &&
        state.duration > 0 &&
        state.position >= state.duration
      ) {
        this.emit("ended", {});
      }
    };
    const onPlaybackError = (data: any) => {
      this.emit("error", data ?? {});
    };
    const onAuthError = () => {
      this.tryReconnect(0);
    };

    try {
      this.player.addListener("ready", onReady);
      this.player.addListener("not_ready", onNotReady);
      this.player.addListener("player_state_changed", onStateChanged);
      this.player.addListener("playback_error", onPlaybackError);
      this.player.addListener("authentication_error", onAuthError);
      this.player.addListener("initialization_error", onPlaybackError);
      this.player.addListener("account_error", onPlaybackError);
    } catch {
      // ignore
    }

    await this.player.connect();
    // Schedule proactive token refresh.
    this.scheduleRefresh(this.expiresIn);
  }

  // -------------------------------------------------------------------------
  // Token refresh
  // -------------------------------------------------------------------------
  private scheduleRefresh(expiresIn: number): void {
    if (this.destroyed) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const fireInMs = Math.max(0, (expiresIn - 300) * 1000);
    this.refreshTimer = setTimeout(() => {
      this.performRefreshWithRetry(0);
    }, fireInMs);
  }

  private async performRefreshWithRetry(attempt: number): Promise<void> {
    if (this.destroyed) return;
    try {
      const result = await this.refreshFn();
      this.accessToken = result.accessToken;
      this.expiresIn = result.expiresIn;
      this.safeTelemetry("spotify_token_refreshed", {
        success: true,
        retryCount: attempt,
      });
      if (this.onTokenRefreshed) {
        try {
          this.onTokenRefreshed(result.accessToken, result.expiresIn);
        } catch {
          // ignore
        }
      }
      this.scheduleRefresh(result.expiresIn);
      return;
    } catch {
      // fall-through to retry/backoff
    }
    if (attempt >= 2) {
      // 3 tentativas (0,1,2) -> falha.
      if (this.onReconnectFailed) {
        try {
          this.onReconnectFailed();
        } catch {
          // ignore
        }
      }
      this.safeTelemetry("spotify_token_refresh_failed", {
        attemptCount: attempt + 1,
      });
      return;
    }
    const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s
    setTimeout(() => {
      this.performRefreshWithRetry(attempt + 1);
    }, backoffMs);
  }

  // -------------------------------------------------------------------------
  // Reconnect
  // -------------------------------------------------------------------------
  private tryReconnect(attempt: number): void {
    if (this.destroyed) return;
    if (attempt >= 3) {
      if (this.onReconnectFailed) {
        try {
          this.onReconnectFailed();
        } catch {
          // ignore
        }
      }
      this.safeTelemetry("spotify_reconnect_failed", { attempts: attempt });
      return;
    }
    const delays = [1000, 2000, 4000];
    const delay = delays[attempt] ?? 4000;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      if (this.destroyed) return;
      try {
        const ok = await this.player?.connect?.();
        if (ok === false) {
          this.tryReconnect(attempt + 1);
          return;
        }
        this.safeTelemetry("spotify_reconnect_success", {
          attempts: attempt + 1,
        });
      } catch {
        this.tryReconnect(attempt + 1);
      }
    }, delay);
  }

  // -------------------------------------------------------------------------
  // IAudioSourceDriver
  // -------------------------------------------------------------------------
  async load(track: AudioTrack): Promise<void> {
    this.currentTrack = track;
  }

  async play(): Promise<void> {
    if (!this.deviceId || !this.currentTrack) return;
    const device = encodeURIComponent(this.deviceId);
    this.spotifyApiPut(`/me/player/play?device_id=${device}`, {
      uris: [this.currentTrack.trackId],
    });
  }

  pause(): void {
    if (!this.deviceId) return;
    const device = encodeURIComponent(this.deviceId);
    this.spotifyApiPut(`/me/player/pause?device_id=${device}`);
  }

  seek(seconds: number): void {
    if (!this.deviceId) return;
    const positionMs = Math.max(0, Math.floor(seconds * 1000));
    const device = encodeURIComponent(this.deviceId);
    this.spotifyApiPut(
      `/me/player/seek?position_ms=${positionMs}&device_id=${device}`,
    );
  }

  setVolume(v: number): void {
    try {
      this.player?.setVolume?.(v);
    } catch {
      // ignore
    }
  }

  setSpeed(_rate: number): void {
    // Spotify nao suporta variable speed — no-op.
    // eslint-disable-next-line no-console
    console.warn("Spotify driver: setSpeed unsupported");
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getDuration(): number {
    return this.duration;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.player?.disconnect?.();
    } catch {
      // ignore
    }
    this.player = null;
    for (const ev of Object.keys(this.handlers)) {
      this.handlers[ev as AudioDriverEvent].clear();
    }
  }

  on(event: AudioDriverEvent, handler: Listener): () => void {
    const set = this.handlers[event];
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  private emit(event: AudioDriverEvent, data: any): void {
    const set = this.handlers[event];
    if (!set) return;
    for (const cb of Array.from(set)) {
      try {
        cb(data);
      } catch {
        // ignore
      }
    }
  }
}
