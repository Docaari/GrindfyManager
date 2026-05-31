// Sprint Mini Player 2 (RF-01.3) — lazy load Spotify Web Playback SDK.
//
// Idempotente; timeout 5s -> SpotifySdkLoadError.

export class SpotifySdkLoadError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "Spotify Web Playback SDK falhou ao carregar (verifique adblock / conexao).",
    );
    this.name = "SpotifySdkLoadError";
    Object.setPrototypeOf(this, SpotifySdkLoadError.prototype);
  }
}

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";
const TIMEOUT_MS = 5000;

let loadingPromise: Promise<any> | null = null;

export function loadSpotifySDK(): Promise<any> {
  // SDK already loaded
  if ((globalThis as any).Spotify) {
    return Promise.resolve((globalThis as any).Spotify);
  }
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-spotify-sdk]");
    let script: HTMLScriptElement;
    if (existing) {
      script = existing as HTMLScriptElement;
    } else {
      script = document.createElement("script");
      script.src = SDK_SRC;
      script.async = true;
      script.setAttribute("data-spotify-sdk", "true");
      document.head.appendChild(script);
    }

    const timeout = setTimeout(() => {
      // B-SDKLOADER: re-checa window.Spotify antes de rejeitar — se o SDK foi
      // seteado externamente apos o timeout, resolve em vez de manter erro.
      const SDK = (globalThis as any).Spotify;
      if (SDK) {
        resolve(SDK);
        return;
      }
      // B-SDKLOADER: reseta loadingPromise para permitir retry numa 2a chamada
      // (sem herdar eternamente a promise rejeitada).
      loadingPromise = null;
      reject(new SpotifySdkLoadError());
    }, TIMEOUT_MS);

    (globalThis as any).onSpotifyWebPlaybackSDKReady = () => {
      clearTimeout(timeout);
      const SDK = (globalThis as any).Spotify;
      if (!SDK) {
        loadingPromise = null;
        reject(new SpotifySdkLoadError("Spotify global ausente apos callback"));
        return;
      }
      resolve(SDK);
    };
  });

  return loadingPromise;
}

export function _resetForTests(): void {
  loadingPromise = null;
}
