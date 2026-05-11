/**
 * Wave D (Fase 3 escalabilidade) — Tests advisoryLock helper.
 *
 * Cobertura:
 *  - hashLockKey: determinismo + range int32
 *  - withAdvisoryLock: fn roda quando got=true
 *  - withAdvisoryLock: fn skipado quando got=false
 *  - withAdvisoryLock: unlock chamado mesmo se fn throw
 *  - withAdvisoryLock: client.release chamado sempre
 *  - withAdvisoryLock: pool ausente -> fallback roda fn (lesson #34)
 *  - withAdvisoryLock: pool.connect falha -> skip silencioso (sem rodar fn)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ../../../server/db para controlar pool em cada teste.
let mockPool: any = null;
vi.mock("../../../server/db", () => ({
  get pool() {
    return mockPool;
  },
  db: {},
}));

import { hashLockKey, withAdvisoryLock } from "../../../server/lib/advisoryLock";

function makeClient(rows: any[], opts: { failQuery?: boolean; failUnlock?: boolean } = {}) {
  const release = vi.fn();
  const query = vi.fn().mockImplementation((sql: string) => {
    if (opts.failQuery && sql.includes("pg_try_advisory_lock")) {
      return Promise.reject(new Error("query failed"));
    }
    if (opts.failUnlock && sql.includes("pg_advisory_unlock")) {
      return Promise.reject(new Error("unlock failed"));
    }
    if (sql.includes("pg_try_advisory_lock")) {
      return Promise.resolve({ rows });
    }
    return Promise.resolve({ rows: [] });
  });
  return { release, query };
}

beforeEach(() => {
  mockPool = null;
  vi.restoreAllMocks();
});

describe("hashLockKey", () => {
  it("eh deterministico para mesmo input", () => {
    expect(hashLockKey("cron:fx-rates")).toBe(hashLockKey("cron:fx-rates"));
  });

  it("retorna valores diferentes para nomes diferentes", () => {
    expect(hashLockKey("cron:fx-rates")).not.toBe(hashLockKey("cron:news"));
  });

  it("retorna int32 (-2^31..2^31-1)", () => {
    const k = hashLockKey("anything");
    expect(Number.isInteger(k)).toBe(true);
    expect(k).toBeGreaterThanOrEqual(-(2 ** 31));
    expect(k).toBeLessThanOrEqual(2 ** 31 - 1);
  });
});

describe("withAdvisoryLock", () => {
  it("roda fn quando pool retorna got=true + chama unlock + release", async () => {
    const client = makeClient([{ got: true }]);
    mockPool = { connect: vi.fn().mockResolvedValue(client) };
    const fn = vi.fn().mockResolvedValue(undefined);

    await withAdvisoryLock("cron:test-A", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    const calls = client.query.mock.calls.map((c: any) => c[0]);
    expect(calls).toContain("SELECT pg_try_advisory_lock($1) AS got");
    expect(calls).toContain("SELECT pg_advisory_unlock($1)");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("nao roda fn quando got=false + log + release", async () => {
    const client = makeClient([{ got: false }]);
    mockPool = { connect: vi.fn().mockResolvedValue(client) };
    const fn = vi.fn();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await withAdvisoryLock("cron:test-B", fn);

    expect(fn).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      "[advisoryLock] skipped — held elsewhere",
      { name: "cron:test-B" },
    );
    // unlock NAO eh chamado quando got=false (logico — nao temos o lock)
    const calls = client.query.mock.calls.map((c: any) => c[0]);
    expect(calls).not.toContain("SELECT pg_advisory_unlock($1)");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("chama unlock mesmo se fn throw + propaga erro", async () => {
    const client = makeClient([{ got: true }]);
    mockPool = { connect: vi.fn().mockResolvedValue(client) };
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(withAdvisoryLock("cron:test-C", fn)).rejects.toThrow("boom");

    const calls = client.query.mock.calls.map((c: any) => c[0]);
    expect(calls).toContain("SELECT pg_advisory_unlock($1)");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("nao explode se unlock falhar (log + continua)", async () => {
    const client = makeClient([{ got: true }], { failUnlock: true });
    mockPool = { connect: vi.fn().mockResolvedValue(client) };
    const fn = vi.fn().mockResolvedValue(undefined);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await withAdvisoryLock("cron:test-D", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("fallback: pool ausente -> roda fn diretamente (lesson #34)", async () => {
    mockPool = null;
    const fn = vi.fn().mockResolvedValue(undefined);

    await withAdvisoryLock("cron:test-E", fn);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fallback opt-out: fallbackWhenPoolMissing=false + pool ausente -> nao roda fn", async () => {
    mockPool = null;
    const fn = vi.fn();

    await withAdvisoryLock("cron:test-F", fn, { fallbackWhenPoolMissing: false });

    expect(fn).not.toHaveBeenCalled();
  });

  it("pool.connect falha -> skip silencioso (nao roda fn)", async () => {
    mockPool = {
      connect: vi.fn().mockRejectedValue(new Error("conn refused")),
    };
    const fn = vi.fn();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await withAdvisoryLock("cron:test-G", fn);

    expect(fn).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(
      "[advisoryLock] pool.connect failed",
      expect.objectContaining({ name: "cron:test-G" }),
    );
  });
});
