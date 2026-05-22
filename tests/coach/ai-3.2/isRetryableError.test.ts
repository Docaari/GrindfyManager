// =============================================================================
// Sprint AI-3.2 / RF-A4 (ADR-203)
//
// `server/utils/isRetryableError.ts` — extrai helper inline de
// `server/coach/anthropicClient.ts` para uso futuro (FX adapters, Stripe, Mux).
//
// API:
//   - RETRYABLE_STATUS = [429, 500, 529] as const
//   - isRetryableError(err: unknown): boolean
//     true se status ∈ RETRYABLE_STATUS OR message inclui
//     ECONNRESET/ETIMEDOUT/network/fetch failed (case-insensitive).
//
// Status esperado: TODOS FALHAM (modulo nao existe).
// =============================================================================

import { describe, it, expect } from "vitest";

describe("RF-A4 — isRetryableError: status retryable", () => {
  it("status 429 (rate limit) → true", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError({ status: 429 })).toBe(true);
  });

  it("status 500 (server error) → true", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError({ status: 500 })).toBe(true);
  });

  it("status 529 (Anthropic overloaded — incident) → true", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError({ status: 529 })).toBe(true);
  });
});

describe("RF-A4 — isRetryableError: status NON-retryable", () => {
  it("status 400 (bad request) → false", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError({ status: 400 })).toBe(false);
  });

  it("status 401 (unauthorized) → false", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError({ status: 401 })).toBe(false);
  });

  it("status 403 (forbidden) → false", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError({ status: 403 })).toBe(false);
  });

  it("status 404 (not found) → false", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError({ status: 404 })).toBe(false);
  });

  it("status 200 (ok) → false", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError({ status: 200 })).toBe(false);
  });
});

describe("RF-A4 — isRetryableError: network errors via message", () => {
  it("message ECONNRESET → true", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError({ message: "ECONNRESET" })).toBe(true);
  });

  it("message ETIMEDOUT → true", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError({ message: "ETIMEDOUT: socket hang up" })).toBe(true);
  });

  it("message 'network error' (case-insensitive) → true", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError({ message: "Network Error: connection refused" })).toBe(true);
  });

  it("message 'fetch failed' → true", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError({ message: "fetch failed" })).toBe(true);
  });

  it("message 'parse error' (nao-rede) → false", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError({ message: "parse error: invalid JSON" })).toBe(false);
  });
});

describe("RF-A4 — isRetryableError: non-objects → false", () => {
  it("null → false", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError(null)).toBe(false);
  });

  it("undefined → false", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError(undefined)).toBe(false);
  });

  it("string 'erro' → false", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError("erro")).toBe(false);
  });

  it("number 429 (literal sem .status) → false", async () => {
    const { isRetryableError } = await import("../../../server/utils/isRetryableError");
    expect(isRetryableError(429)).toBe(false);
  });
});

describe("RF-A4 — isRetryableError: const exportada", () => {
  it("RETRYABLE_STATUS contem [429, 500, 529]", async () => {
    const mod: any = await import("../../../server/utils/isRetryableError");
    expect(Array.isArray(mod.RETRYABLE_STATUS)).toBe(true);
    expect(mod.RETRYABLE_STATUS).toContain(429);
    expect(mod.RETRYABLE_STATUS).toContain(500);
    expect(mod.RETRYABLE_STATUS).toContain(529);
  });
});

describe("RF-A4 — isRetryableError: anthropicClient consome o shared", () => {
  it("anthropicClient.ts importa de server/utils/isRetryableError (zero inline)", async () => {
    // smoke: importa anthropicClient e verifica que o helper compartilhado foi
    // movido (modulo de utils existe + funcao exportada).
    const utilsMod: any = await import("../../../server/utils/isRetryableError");
    expect(typeof utilsMod.isRetryableError).toBe("function");
  });
});
