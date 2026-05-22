// Sprint Mini Player 3.1 Wave B / TIER 3 #7 — Onboarding tooltip.
// Mostra dica "Aperte ? pra ver atalhos" na primeira vez que o user ve o
// MiniPlayer. Auto-dismiss 8s, click anywhere, ou tecla ?.
// Flag em localStorage `audio.onboarding.seen.v1` — exibe so 1x por dispositivo.

import React, { useEffect, useState } from "react";

const STORAGE_KEY = "audio.onboarding.seen.v1";
const AUTO_DISMISS_MS = 8000;

function readSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // ignore
  }
}

export function MiniPlayerOnboarding() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (readSeen()) return;
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const dismiss = () => {
      setVisible(false);
      writeSeen();
    };
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    const onAnyClick = () => dismiss();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?") dismiss();
    };
    // Reviewer HIGH-2: delay listener attach pra evitar o click que abriu o
    // player ser consumido como dismiss prematuro (visible vira true imediato
    // mas o click original pode propagar no mesmo tick). 300ms cobre o caso.
    const attachTimer = setTimeout(() => {
      document.addEventListener("click", onAnyClick);
      document.addEventListener("keydown", onKey);
    }, 300);
    const onDismissEvent = () => dismiss();
    window.addEventListener("audio.onboarding.dismiss", onDismissEvent);
    return () => {
      clearTimeout(timer);
      clearTimeout(attachTimer);
      document.removeEventListener("click", onAnyClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("audio.onboarding.dismiss", onDismissEvent);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      data-testid="audio-onboarding-tooltip"
      role="status"
      aria-live="polite"
      className="fixed bottom-24 right-6 z-50 max-w-xs rounded-md border border-white/10 bg-blue-600 px-4 py-3 text-sm text-white shadow-lg animate-fade-in"
    >
      <div className="font-semibold">Dica</div>
      <div className="text-xs text-white/90 mt-0.5">
        Aperte <kbd className="font-mono px-1 bg-white/10 rounded">?</kbd> pra
        ver os atalhos do player.
      </div>
    </div>
  );
}

export default MiniPlayerOnboarding;

export const _ONBOARDING_STORAGE_KEY = STORAGE_KEY;
export const _ONBOARDING_AUTO_DISMISS_MS = AUTO_DISMISS_MS;
