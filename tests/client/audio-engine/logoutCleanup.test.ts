// Sprint Mini Player 3.2 / Wave B / W-B2 — Logout cleanup contract.
// ADR-202. RED PHASE — modulo logoutCleanup.ts ainda nao existe.
//
// Decisao founder (registrada na convocacao MP3.2):
//   SOMENTE audio.resume.v1 (e Spotify tokens) limpam no logout.
//   Queue + onboarding.seen.v1 persistem.

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, beforeEach } from "vitest";

describe("clearAudioOnLogout (W-B2 / ADR-202)", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {}
  });

  it("limpa audio.lastSession.v1 / audio.resume.v1 (resume snapshot)", async () => {
    const { clearAudioOnLogout } = await import(
      "../../../client/src/lib/audio-engine/logoutCleanup"
    );

    // Seed snapshot — usar ambas as keys conhecidas para robustez
    localStorage.setItem(
      "audio.lastSession.v1",
      JSON.stringify({
        trackId: "t1",
        currentSeconds: 30,
        isPlaying: false,
        timestamp: Date.now(),
      }),
    );
    localStorage.setItem(
      "audio.resume.v1",
      JSON.stringify({
        trackId: "t1",
        currentSeconds: 30,
        isPlaying: false,
        timestamp: Date.now(),
      }),
    );

    clearAudioOnLogout();

    expect(localStorage.getItem("audio.lastSession.v1")).toBeNull();
    expect(localStorage.getItem("audio.resume.v1")).toBeNull();
  });

  it("NAO limpa audio.queue.v1 (queue persiste — decisao founder)", async () => {
    const { clearAudioOnLogout } = await import(
      "../../../client/src/lib/audio-engine/logoutCleanup"
    );

    localStorage.setItem(
      "audio.queue.v1",
      JSON.stringify({ items: [{ trackId: "x" }] }),
    );

    clearAudioOnLogout();

    expect(localStorage.getItem("audio.queue.v1")).not.toBeNull();
  });

  it("NAO limpa audio.onboarding.seen.v1 (onboarding persiste)", async () => {
    const { clearAudioOnLogout } = await import(
      "../../../client/src/lib/audio-engine/logoutCleanup"
    );

    localStorage.setItem("audio.onboarding.seen.v1", "true");

    clearAudioOnLogout();

    expect(localStorage.getItem("audio.onboarding.seen.v1")).toBe("true");
  });

  it("limpa Spotify OAuth tokens (audio.spotify.oauth.snapshot.v1)", async () => {
    const { clearAudioOnLogout } = await import(
      "../../../client/src/lib/audio-engine/logoutCleanup"
    );

    localStorage.setItem(
      "audio.spotify.oauth.snapshot.v1",
      JSON.stringify({ accessToken: "abc", expiresAt: Date.now() + 1000 }),
    );

    clearAudioOnLogout();

    expect(localStorage.getItem("audio.spotify.oauth.snapshot.v1")).toBeNull();
  });

  it("idempotente — chamar 2x consecutivos nao lanca", async () => {
    const { clearAudioOnLogout } = await import(
      "../../../client/src/lib/audio-engine/logoutCleanup"
    );

    expect(() => {
      clearAudioOnLogout();
      clearAudioOnLogout();
    }).not.toThrow();
  });

  it("safe quando localStorage lanca (best-effort)", async () => {
    const { clearAudioOnLogout } = await import(
      "../../../client/src/lib/audio-engine/logoutCleanup"
    );

    const originalRemove = localStorage.removeItem.bind(localStorage);
    (localStorage as any).removeItem = () => {
      throw new Error("quota");
    };

    expect(() => clearAudioOnLogout()).not.toThrow();

    (localStorage as any).removeItem = originalRemove;
  });
});
