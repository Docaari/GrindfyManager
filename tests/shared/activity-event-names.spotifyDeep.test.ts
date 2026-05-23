/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint SPOTIFY-DEEP / RF-04 + RF-02 — 3 eventos canonicos novos.
 *
 * Adiciona em shared/activity-event-names.ts::CANONICAL_EVENT_NAMES:
 *   - audio.spotify_search_open
 *   - audio.spotify_track_add
 *   - audio.spotify_playlist_select
 *
 * Cada um deve passar `isCanonicalEventName` (regex namespace-dotted).
 */
import { describe, it, expect } from "vitest";

describe("activity-event-names — Spotify Deep canonical (RF-04 + RF-02)", () => {
  it("audio.spotify_search_open em CANONICAL_EVENT_NAMES", async () => {
    const mod = await import("@shared/activity-event-names");
    expect((mod as any).CANONICAL_EVENT_NAMES).toContain("audio.spotify_search_open");
  });

  it("audio.spotify_track_add em CANONICAL_EVENT_NAMES", async () => {
    const mod = await import("@shared/activity-event-names");
    expect((mod as any).CANONICAL_EVENT_NAMES).toContain("audio.spotify_track_add");
  });

  it("audio.spotify_playlist_select em CANONICAL_EVENT_NAMES", async () => {
    const mod = await import("@shared/activity-event-names");
    expect((mod as any).CANONICAL_EVENT_NAMES).toContain("audio.spotify_playlist_select");
  });

  it("regex isCanonicalEventName valida os 3 nomes", async () => {
    const mod = await import("@shared/activity-event-names");
    const isOk = (mod as any).isCanonicalEventName;
    expect(typeof isOk).toBe("function");
    expect(isOk("audio.spotify_search_open")).toBe(true);
    expect(isOk("audio.spotify_track_add")).toBe(true);
    expect(isOk("audio.spotify_playlist_select")).toBe(true);
  });

  it("ja existentes (regression guard) permanecem em CANONICAL_EVENT_NAMES", async () => {
    const mod = await import("@shared/activity-event-names");
    expect((mod as any).CANONICAL_EVENT_NAMES).toContain("audio.spotify_connect_click");
    expect((mod as any).CANONICAL_EVENT_NAMES).toContain("audio.picker_open");
  });
});
