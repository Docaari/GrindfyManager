// useMiniPlayerHeight — Sprint Mini Player 1 / RF-11 / ADR-188.
// Altura efetiva da MiniPlayerBar: hidden=0, mobile<768=64, tablet=72, desktop>=1024=80.
// Tambem seta `--mini-player-height` em :root para layouts que reservam espaco
// via `padding-bottom: var(--mini-player-height)`.
//
// Sprint MP-MODERN / RF-06 — quando !activeTrack (empty state), altura reduz
// para 48px (vs 80 ativo) pois o player so renderiza 2 CTAs compactos.

import { useEffect, useState } from "react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";

// Sprint MP-MODERN / RF-06 — constantes exportadas para layouts externos +
// helpers de teste (ver tests/client/audio-player/empty-state-cta.test.tsx).
export const MINI_PLAYER_HEIGHT_EMPTY = 48;
export const MINI_PLAYER_HEIGHT_ACTIVE = 80;

export function getMiniPlayerHeight(active: boolean): number {
  return active ? MINI_PLAYER_HEIGHT_ACTIVE : MINI_PLAYER_HEIGHT_EMPTY;
}

function detectViewportHeight(): number {
  if (typeof window === "undefined") return 80;
  const w = window.innerWidth ?? 1024;
  if (w >= 1024) return 80;
  if (w >= 768) return 72;
  return 64;
}

export function useMiniPlayerHeight(): number {
  const ctx = useAudioPlayer() as any;
  const displayMode = ctx?.displayMode;
  const activeTrack = ctx?.activeTrack ?? null;
  const [viewportHeight, setViewportHeight] = useState<number>(detectViewportHeight);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportHeight(detectViewportHeight());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  let height: number;
  if (displayMode === "hidden") {
    height = 0;
  } else if (!activeTrack) {
    // RF-06 — empty state: bar reduced.
    height = MINI_PLAYER_HEIGHT_EMPTY;
  } else {
    height = viewportHeight;
  }

  useEffect(() => {
    if (typeof document === "undefined") return;
    try {
      document.documentElement.style.setProperty("--mini-player-height", `${height}px`);
    } catch {
      // ignore
    }
  }, [height]);

  return height;
}
