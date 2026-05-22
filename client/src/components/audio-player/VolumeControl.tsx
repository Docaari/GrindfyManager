// VolumeControl — Sprint Mini Player 1 / RF-03 + D5 + D23.
// Tri-modo: click=mute toggle, wheel +-5% (throttle 50ms), hover 200ms=slider.

import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Volume2, Volume1, VolumeX } from "lucide-react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";

const WHEEL_THROTTLE_MS = 50;
const HOVER_REVEAL_MS = 200;
const HOVER_HIDE_MS = 500;
const WHEEL_STEP = 0.05;

interface Props {
  /** When true, suppress the hover-revealed slider (tablet/mobile use click-only). */
  hideSlider?: boolean;
}

export function VolumeControl({ hideSlider = false }: Props) {
  const { volume, isMuted, setVolume, toggleMute } = useAudioPlayer();
  const [sliderVisible, setSliderVisible] = useState(false);
  const lastWheelRef = useRef<number>(0);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effective = isMuted ? 0 : volume;
  const pct = Math.round(effective * 100);

  const Icon =
    isMuted || volume === 0
      ? VolumeX
      : volume < 0.66
        ? Volume1
        : Volume2;

  const ariaLabel = isMuted ? "Mutado" : `Volume ${pct} por cento`;

  function handleWheel(e: React.WheelEvent<HTMLButtonElement>) {
    e.preventDefault();
    const now = Date.now();
    if (now - lastWheelRef.current < WHEEL_THROTTLE_MS) return;
    lastWheelRef.current = now;
    const delta = e.deltaY < 0 ? +WHEEL_STEP : -WHEEL_STEP;
    setVolume(Math.max(0, Math.min(1, volume + delta)));
  }

  function handleMouseEnter() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      // flushSync garante que o re-render aconteca antes de
      // `vi.advanceTimersByTime` retornar nos testes (sem precisar de `act`).
      // Em prod nao impacta UX porque o callback ja roda fora de batch React.
      flushSync(() => {
        setSliderVisible(true);
      });
    }, HOVER_REVEAL_MS);
  }

  // Rearma o hideTimer (cancelando qualquer pendente). flushSync garante que
  // o re-render aconteca antes de `vi.advanceTimersByTime` retornar em testes
  // (sem precisar de `act`); em prod nao impacta UX porque o callback ja roda
  // fora de batch React.
  function rearmHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      flushSync(() => {
        setSliderVisible(false);
      });
    }, HOVER_HIDE_MS);
  }

  function handleMouseLeave() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    rearmHideTimer();
  }

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return (
    <div
      className="relative inline-flex items-center"
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        data-testid="mini-player-volume"
        aria-label={ariaLabel}
        title={ariaLabel}
        className="p-2 hover:bg-white/10 rounded-md text-white"
        onClick={() => toggleMute()}
        onWheel={handleWheel}
        onMouseEnter={handleMouseEnter}
      >
        <Icon className="w-4 h-4" />
      </button>
      {!hideSlider && sliderVisible && (
        <div
          data-testid="mini-player-volume-slider"
          className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900/95 rounded-md transition-opacity duration-200"
          onMouseEnter={() => {
            if (hideTimerRef.current) {
              clearTimeout(hideTimerRef.current);
              hideTimerRef.current = null;
            }
          }}
          onMouseLeave={rearmHideTimer}
        >
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            aria-label="Ajustar volume"
            className="w-24"
          />
        </div>
      )}
    </div>
  );
}
