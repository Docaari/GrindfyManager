/**
 * Sprint FX-1 RF-02: FxFetchError — erro tipado dos adapters.
 *
 * Codigos:
 *   - WEEKEND_NO_QUOTE: BCB retorna value:[] em fim de semana
 *   - HTTP_ERROR: provider HTTP 4xx/5xx
 *   - NETWORK_ERROR: fetch reject (timeout, ECONNRESET)
 *   - INVALID_BODY: shape inesperado (sem rates / value)
 */

export type FxErrorCode =
  | "WEEKEND_NO_QUOTE"
  | "HTTP_ERROR"
  | "NETWORK_ERROR"
  | "INVALID_BODY";

export type FxProvider = "bcb_ptax" | "frankfurter";

export class FxFetchError extends Error {
  public readonly code: FxErrorCode;
  public readonly provider: FxProvider;
  public readonly cause?: unknown;

  constructor(opts: {
    code: FxErrorCode;
    provider: FxProvider;
    message?: string;
    cause?: unknown;
  }) {
    super(opts.message ?? `${opts.provider} fetch error: ${opts.code}`);
    this.name = "FxFetchError";
    this.code = opts.code;
    this.provider = opts.provider;
    this.cause = opts.cause;
  }
}
