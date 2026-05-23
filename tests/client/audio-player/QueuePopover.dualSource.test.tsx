// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint SPOTIFY-DEEP / RF-05 — QueuePopover dual-source UI
//
// Estende QueuePopover existente (MP3). Adiciona:
//   - data-testid="queue-badge-library" (invisivel/sem badge nas rows library)
//   - data-testid="queue-badge-spotify" (badge verde nas rows spotify)
//   - cover spotify host whitelist (i.scdn.co, mosaic.scdn.co, wrapped-images.spotifycdn.com)
//   - drag-reorder mistura library+spotify (sem regressao)
// =============================================================================

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

beforeEach(() => {
  vi.clearAllMocks();
});

function loadQueue() {
  return require("@/components/audio-player/QueuePopover");
}

function makeQueueItem(idx: number, source: "library" | "spotify", cover?: string | null) {
  return {
    id: `qi-${idx}`,
    addedAt: Date.now() - idx * 1000,
    track: {
      source,
      trackId: source === "spotify" ? `spotify:track:t${idx}` : `lesson-${idx}`,
      title: `Track ${idx}`,
      audioUrl: source === "library" ? `/audio/${idx}.mp3` : undefined,
      coverUrl: cover ?? (source === "spotify" ? `https://i.scdn.co/${idx}` : `/img/${idx}.jpg`),
      durationSeconds: 180,
    },
  };
}

function renderQueue(items: any[]) {
  const { QueuePopover } = loadQueue();
  return render(
    <QueuePopover
      open={true}
      onOpenChange={() => {}}
      queue={items}
      repeatMode="off"
      shuffleEnabled={false}
      onRemove={() => {}}
      onReorder={() => {}}
      onClear={() => {}}
      onSkip={() => {}}
      onRepeatChange={() => {}}
      onToggleShuffle={() => {}}
    />,
  );
}

describe("QueuePopover — dual-source UI (RF-05)", () => {
  it("rows spotify mostram badge data-testid='queue-badge-spotify'", async () => {
    renderQueue([
      makeQueueItem(0, "spotify"),
      makeQueueItem(1, "spotify"),
    ]);
    await waitFor(() => {
      const badges = screen.queryAllByTestId("queue-badge-spotify");
      expect(badges.length).toBe(2);
    });
  });

  it("rows library NAO mostram badge spotify", async () => {
    renderQueue([makeQueueItem(0, "library"), makeQueueItem(1, "library")]);
    await waitFor(() => {
      expect(screen.queryAllByTestId("queue-badge-spotify").length).toBe(0);
    });
  });

  it("queue mista renderiza badges corretos por source", async () => {
    renderQueue([
      makeQueueItem(0, "library"),
      makeQueueItem(1, "spotify"),
      makeQueueItem(2, "library"),
      makeQueueItem(3, "spotify"),
    ]);
    await waitFor(() => {
      expect(screen.queryAllByTestId("queue-badge-spotify").length).toBe(2);
    });
  });

  it("cover host i.scdn.co renderiza (sanitize aceita)", async () => {
    renderQueue([
      makeQueueItem(0, "spotify", "https://i.scdn.co/image/abc"),
    ]);
    await waitFor(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      const ok = imgs.some((img) => (img.getAttribute("src") ?? "").includes("i.scdn.co"));
      expect(ok).toBe(true);
    });
  });

  it("cover host malicioso evil.com NAO renderiza (sanitize bloqueia)", async () => {
    renderQueue([
      makeQueueItem(0, "spotify", "https://evil.com/cover.jpg"),
    ]);
    await waitFor(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      const leaked = imgs.some((img) => (img.getAttribute("src") ?? "").includes("evil.com"));
      expect(leaked).toBe(false);
    });
  });

  it("badge contem texto 'Spotify' (aria/title) ou role visivel", async () => {
    renderQueue([makeQueueItem(0, "spotify")]);
    await waitFor(() => {
      const badge = screen.getByTestId("queue-badge-spotify");
      const txt = (badge.textContent ?? "") + (badge.getAttribute("aria-label") ?? "") + (badge.getAttribute("title") ?? "");
      expect(txt.toLowerCase()).toContain("spotify");
    });
  });

  it("header counter agrega ambos sources", async () => {
    renderQueue([
      makeQueueItem(0, "library"),
      makeQueueItem(1, "spotify"),
      makeQueueItem(2, "spotify"),
    ]);
    await waitFor(() => {
      // texto "Fila (3)" ou data-testid="queue-count"
      const txt = document.body.textContent ?? "";
      expect(txt).toMatch(/\b3\b/);
    });
  });
});
