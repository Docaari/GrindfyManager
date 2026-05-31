// SpotifyAudioDriver — Sprint Mini Player 2 (RF-01.3 + RF-01.4 + RF-01.5).
//
// Real implementation: Web Playback SDK (Spotify.Player) + REST API.
// access_token em closure ref (NUNCA em storage).
// Token refresh proativo: setTimeout 5min antes do expiry.
// Reconnect retry exponencial 1s/2s/4s em not_ready/auth_error.
//
// Lessons aplicadas: #5/#35 (new SDK em try/catch fallback factory), #34 (deps
// injetadas).

import { loadSpotifySDK, SpotifySdkLoadError } from "@/lib/spotify/sdkLoader";
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
  private readonly onPremiumRequired?: (displayName?: string) => void;

  private player: any = null;
  private SDK: any = null;
  private currentTrack: AudioTrack | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  // RF-01.4 — play() chamado antes do evento `ready` (deviceId null) enfileira;
  // o handler `ready` flusha. Evita o no-op silencioso do play pre-ready.
  private pendingPlay = false;

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
    // CRITICAL: `fetch` precisa ser invocado com `this === window/globalThis`.
    // Guardar a referência crua e chamar `this.fetchFn(...)` faz `this` virar a
    // instância do driver → "Failed to execute 'fetch' on 'Window': Illegal
    // invocation" em produção (todo play/pause/seek quebrava). Mocks vi.fn() não
    // ligam pro `this`, então os testes não pegavam (lesson #3). `.bind` preserva
    // o tracking de chamadas do mock.
    const rawFetch =
      deps.fetchFn ??
      (typeof fetch !== "undefined" ? fetch : (undefined as any));
    this.fetchFn =
      typeof rawFetch === "function"
        ? (rawFetch.bind(globalThis) as typeof fetch)
        : rawFetch;
    this.telemetry = deps.telemetry;
    this.onReconnectFailed = deps.onReconnectFailed;
    this.onTokenRefreshed = deps.onTokenRefreshed;
    this.onPremiumRequired = deps.onPremiumRequired;
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
              // eslint-disable-next-line no-console
              console.error(
                "[SpotifyAudioDriver] play API não-ok:",
                r.status,
                path,
              );
              // Best-effort: loga o corpo do erro do Spotify (reason/message).
              try {
                (r as any).clone?.().json?.().then?.((b: any) => {
                  // eslint-disable-next-line no-console
                  console.error("[SpotifyAudioDriver] play API body:", b);
                }).catch?.(() => {});
              } catch {
                // ignore
              }
              this.safeTelemetry("spotify_api_error", {
                path,
                status: r.status,
              });
              this.emit("error", err);
            }
          })
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.error(
              "[SpotifyAudioDriver] play fetch REJEITOU (rede/CORS/CSP):",
              path,
              err?.message ?? err,
            );
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
    // RF-01.7 — SDK falhou ao carregar (adblock/timeout) NAO pode travar a UI
    // nem deixar uma promise rejeitada non-handled. Sinaliza erro (telemetria +
    // onReconnectFailed) e retorna. Lesson #9: logue antes do swallow.
    try {
      this.SDK = await this.sdkLoaderFn();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("spotify.driver.sdk_load_failed", {
        message: String((err as any)?.message ?? err),
      });
      this.safeTelemetry("spotify_sdk_load_error", {
        message: String((err as any)?.message ?? err),
        isLoadError: err instanceof SpotifySdkLoadError,
      });
      if (this.onReconnectFailed) {
        try {
          this.onReconnectFailed();
        } catch {
          // ignore
        }
      }
      this.emit("error", err);
      return;
    }
    // LOW — corpo abrangente em try/catch: construcao do player, attach de
    // listeners, activateElement e `await this.player.connect()` nao podem deixar
    // uma promise rejeitada non-handled (a factory chama `driver.connect()`
    // fire-and-forget). Qualquer throw vira telemetria + sinal de erro graciosos.
    // Lesson #9: logue antes do swallow.
    try {
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
      // eslint-disable-next-line no-console
      console.info(
        "[SpotifyAudioDriver] SDK ready — device 'Grindfy' registrado, device_id=",
        this.deviceId,
      );
      this.safeTelemetry("spotify_connected", { deviceId: this.deviceId });
      // RF-01.4 — flush de play enfileirado antes do `ready`.
      if (this.pendingPlay && this.deviceId) {
        this.pendingPlay = false;
        void this.play();
      }
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
      // Log explícito (lesson #9): a mensagem do SDK (ex: EME/DRM, track
      // indisponível, region) é o sinal real — sem isso vira só "erro ao
      // carregar audio" sem causa.
      // eslint-disable-next-line no-console
      console.error(
        "[SpotifyAudioDriver] playback/init error:",
        data?.message ?? data,
      );
      this.safeTelemetry("spotify_playback_error", {
        message: String(data?.message ?? "playback_error"),
      });
      this.emit("error", data ?? {});
    };
    const onAuthError = () => {
      this.tryReconnect(0);
    };
    // RF-01.7 — account_error (conta nao-Premium) -> onPremiumRequired (UI monta
    // mensagem PT-BR) + telemetria. NAO so emite `error` cru.
    const onAccountError = (data: any) => {
      this.safeTelemetry("spotify_account_error", {
        message: String(data?.message ?? "account_error"),
      });
      if (this.onPremiumRequired) {
        try {
          this.onPremiumRequired(undefined);
        } catch {
          // ignore
        }
      }
      this.emit("error", data ?? {});
    };

    try {
      this.player.addListener("ready", onReady);
      this.player.addListener("not_ready", onNotReady);
      this.player.addListener("player_state_changed", onStateChanged);
      this.player.addListener("playback_error", onPlaybackError);
      this.player.addListener("authentication_error", onAuthError);
      this.player.addListener("initialization_error", onPlaybackError);
      this.player.addListener("account_error", onAccountError);
    } catch {
      // ignore
    }

    // RF-01.3 — connect() roda dentro do gesto do usuario (factory fire-and-forget
    // no primeiro play). Ativar o elemento de midia AQUI satisfaz a politica de
    // autoplay/EME (user-activation) ANTES do player.connect()/play(). Best-effort,
    // nunca throw — alguns browsers/mocks nao expoem activateElement.
    await this.activateElement();

    await this.player.connect();
    // Schedule proactive token refresh.
    this.scheduleRefresh(this.expiresIn);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("spotify.driver.connect_failed", {
        message: String((err as any)?.message ?? err),
      });
      this.safeTelemetry("spotify_api_error", {
        path: "connect",
        connect_failed: true,
        message: String((err as any)?.message ?? err),
      });
      if (this.onReconnectFailed) {
        try {
          this.onReconnectFailed();
        } catch {
          // ignore
        }
      }
      this.emit("error", err);
      return;
    }
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
  /**
   * RF-01.3 — activateElement no gesto do usuario (autoplay/EME user-activation).
   * Chama `player.activateElement()` quando o SDK expoe; no-op gracioso quando
   * nao (alguns mocks/browsers nao expoem). NUNCA throw.
   */
  async activateElement(): Promise<void> {
    try {
      const fn = this.player?.activateElement;
      if (typeof fn === "function") {
        await fn.call(this.player);
      }
    } catch {
      // ignore — best-effort gesture activation.
    }
  }

  async load(track: AudioTrack): Promise<void> {
    this.currentTrack = track;
  }

  async play(): Promise<void> {
    // RF-01.7 — sem track carregada nao ha o que tocar (no-op, nao enfileira).
    if (!this.currentTrack) return;
    // RF-01.4 — play antes do `ready` (deviceId null) enfileira; flusha no ready.
    // Isso eh fluxo NORMAL (nao erro): emite evento dedicado `spotify_play_queued`
    // em vez de `spotify_api_error` (que fica reservado pra deviceId ausente APOS
    // ready — ver spotifyApiPut). Mislabel anterior poluia metricas de erro.
    if (!this.deviceId) {
      this.pendingPlay = true;
      this.safeTelemetry("spotify_play_queued", {
        path: "/me/player/play",
        trackId: this.currentTrack.trackId,
      });
      return;
    }
    this.safeTelemetry("spotify_play", { trackId: this.currentTrack.trackId });
    const device = encodeURIComponent(this.deviceId);
    this.spotifyApiPut(`/me/player/play?device_id=${device}`, {
      uris: [this.currentTrack.trackId],
    });
  }

  pause(): void {
    this.safeTelemetry("spotify_pause", {});
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
