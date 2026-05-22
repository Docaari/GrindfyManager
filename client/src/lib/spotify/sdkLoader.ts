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
      reject(new SpotifySdkLoadError());
    }, TIMEOUT_MS);

    (globalThis as any).onSpotifyWebPlaybackSDKReady = () => {
      clearTimeout(timeout);
      const SDK = (globalThis as any).Spotify;
      if (!SDK) {
        reject(new SpotifySdkLoadError("Spotify global ausente apos callback"));
        return;
      }
      resolve(SDK);
    };

    // Re-check after timeout — caso Spotify ja tenha sido seteado externamente.
  });

  return loadingPromise;
}

export function _resetForTests(): void {
  loadingPromise = null;
}
