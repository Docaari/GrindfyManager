// useMiniPlayerHeight — Sprint Mini Player 1 / RF-11 / ADR-188.
// Altura efetiva da MiniPlayerBar: hidden=0, mobile<768=64, tablet=72, desktop>=1024=80.
// Tambem seta `--mini-player-height` em :root para layouts que reservam espaco
// via `padding-bottom: var(--mini-player-height)`.

import { useEffect, useState } from "react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";

function detectViewportHeight(): number {
  if (typeof window === "undefined") return 80;
  const w = window.innerWidth ?? 1024;
  if (w >= 1024) return 80;
  if (w >= 768) return 72;
  return 64;
}

export function useMiniPlayerHeight(): number {
  const { displayMode } = useAudioPlayer();
  const [viewportHeight, setViewportHeight] = useState<number>(detectViewportHeight);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportHeight(detectViewportHeight());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const height = displayMode === "hidden" ? 0 : viewportHeight;

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
