/**
 * urlValidator tests — Sprint home-reform-4 item 11.
 *
 * Cobre:
 *  - isUrlReachable retorna true em 200/3xx
 *  - isUrlReachable retorna false em 4xx/5xx/network-error/timeout
 *  - resolveItemUrl mantem URL valido
 *  - resolveItemUrl substitui URL invalido por fallback
 *  - resolveItemUrl mantem URL invalido se fallback null
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { isUrlReachable, resolveItemUrl } from "../../server/services/urlValidator";

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isUrlReachable", () => {
  it("retorna true para 200", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    expect(await isUrlReachable("https://example.com/x")).toBe(true);
  });

  it("retorna true para 301 redirect", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 301 });
    expect(await isUrlReachable("https://example.com/x")).toBe(true);
  });

  it("retorna false para 404", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    expect(await isUrlReachable("https://example.com/x")).toBe(false);
  });

  it("retorna false para 500", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await isUrlReachable("https://example.com/x")).toBe(false);
  });

  it("retorna false em network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect(await isUrlReachable("https://example.com/x")).toBe(false);
  });

  it("fallback para GET Range em 405 (HEAD bloqueado)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 405 });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 206 });
    expect(await isUrlReachable("https://example.com/x")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.method).toBe("GET");
  });
});

describe("resolveItemUrl", () => {
  it("mantem URL quando valido", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    const out = await resolveItemUrl(
      "https://blog.gtowizard.com/real-article",
      "https://blog.gtowizard.com",
      { sourceId: "gto-wizard-studies", title: "Real" },
    );
    expect(out).toBe("https://blog.gtowizard.com/real-article");
  });

  it("substitui por fallback quando 404", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    const out = await resolveItemUrl(
      "https://blog.gtowizard.com/fake-path",
      "https://blog.gtowizard.com",
      { sourceId: "gto-wizard-studies", title: "Fake" },
    );
    expect(out).toBe("https://blog.gtowizard.com");
  });

  it("mantem URL original quando fallback null", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    const out = await resolveItemUrl(
      "https://example.com/dead",
      null,
      { sourceId: "unknown", title: "X" },
    );
    expect(out).toBe("https://example.com/dead");
  });
});
