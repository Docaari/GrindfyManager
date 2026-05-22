// Sprint Mini Player 3 / RF-03 — Keyboard shortcuts hook.
// ADR-195. Listener global em document.keydown.
// Gates: isInteractiveTarget + isAdminRoute + displayMode='hidden'.

import { useEffect, useRef } from "react";

export interface UseKeyboardShortcutsOpts {
  toggle: () => void;
  skipBack: (s: number) => void;
  skipForward: (s: number) => void;
  setVolume: (v: number) => void;
  volume: number;
  toggleMute: () => void;
  seek: (s: number) => void;
  durationSeconds: number;
  displayMode: "hidden" | "bar" | "expanded" | "fullscreen";
  setDisplayMode: (m: "bar") => void;
  close: () => void;
  shortcutsHelpOpen: boolean;
  setShortcutsHelpOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  )
    return true;
  if (el.isContentEditable === true) return true;
  const ce =
    typeof el.getAttribute === "function" ? el.getAttribute("contenteditable") : null;
  return ce === "" || ce === "true";
}

function isAdminRoute(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.location?.pathname === "string" &&
    window.location.pathname.startsWith("/admin/")
  );
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function useKeyboardShortcuts(opts: UseKeyboardShortcutsOpts) {
  const {
    toggle,
    skipBack,
    skipForward,
    setVolume,
    volume,
    toggleMute,
    seek,
    durationSeconds,
    displayMode,
    setDisplayMode,
    close,
    setShortcutsHelpOpen,
  } = opts;

  // MP3.1 M3: volume + durationSeconds via ref para evitar re-binding do
  // listener a cada mudanca (volume muda muito com ArrowUp/Down 0..1 em
  // 0.1 steps). Antes: 10 mudancas = 10 addEventListener/removeEventListener.
  // Agora: 1 listener vitalicio enquanto displayMode != 'hidden'.
  const volumeRef = useRef(volume);
  const durationRef = useRef(durationSeconds);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);
  useEffect(() => {
    durationRef.current = durationSeconds;
  }, [durationSeconds]);

  useEffect(() => {
    if (displayMode === "hidden") return;

    const handler = (e: KeyboardEvent) => {
      if (isInteractiveTarget(e.target)) return;
      if (isAdminRoute()) return;

      // MP1 shortcuts (preserved).
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        toggle();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        skipBack(15);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        skipForward(15);
        return;
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMute();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (displayMode === "expanded") {
          setDisplayMode("bar");
        } else {
          close();
        }
        return;
      }

      // MP3 new shortcuts.
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        skipBack(10);
        return;
      }
      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        skipForward(10);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setVolume(clamp01(volumeRef.current + 0.1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setVolume(clamp01(volumeRef.current - 0.1));
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsHelpOpen((prev: boolean) => !prev);
        return;
      }
      // 0..9 numeric seek.
      if (/^[0-9]$/.test(e.key)) {
        const d = durationRef.current;
        if (d > 0) {
          e.preventDefault();
          const digit = parseInt(e.key, 10);
          seek(d * (digit / 10));
        }
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    displayMode,
    toggle,
    skipBack,
    skipForward,
    setVolume,
    toggleMute,
    seek,
    setDisplayMode,
    close,
    setShortcutsHelpOpen,
  ]);
}
