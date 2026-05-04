// =============================================================================
// useCoachRecommendationConsume — Sprint home-reform-4 / Item 4 / RF-07.
//
// Hook que detecta `?source=home-coach-rec&recId=...` na URL e dispara
// POST /api/home/coach-recommendation/:recId/consume quando:
//   - mediaRef video/audio: currentTime >= 30s OR currentTime/duration >= 0.8
//   - article (sem mediaRef): scroll Y / scrollHeight >= 0.8
//
// Idempotencia client-side via hasFiredRef (alem da idempotencia backend).
//
// Lessons aplicadas:
//   #1  hooks-first
//   #13 apiRequest retorna JSON parseado (POST sem corpo aqui)
//   #11 spec define gatilhos exatos — nao adicionar heuristicas extras
// =============================================================================
import { useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface UseCoachRecommendationConsumeOptions {
  /** Optional ref to <video> ou <audio> element. Quando ausente, modo article (scroll). */
  mediaRef?: { current: HTMLMediaElement | null };
  /** Override search string (testes). Default: useSearch() do wouter. */
  search?: string;
  /** Threshold de completion (0-1). Default 0.8. */
  completionThreshold?: number;
  /** Threshold absoluto em segundos (media). Default 30. */
  absoluteSecondsThreshold?: number;
  /** Callback opcional pos-fire (testes/telemetria). */
  onFired?: (recId: string) => void;
}

function parseSource(search: string): {
  source: string | null;
  recId: string | null;
} {
  try {
    const cleaned = (search ?? "").replace(/^\?/, "");
    const params = new URLSearchParams(cleaned);
    return {
      source: params.get("source"),
      recId: params.get("recId"),
    };
  } catch {
    return { source: null, recId: null };
  }
}

export function useCoachRecommendationConsume(
  options: UseCoachRecommendationConsumeOptions = {},
): { hasFired: boolean } {
  const wouterSearch = useSearch();
  const search = options.search ?? wouterSearch ?? "";
  const completionThreshold = options.completionThreshold ?? 0.8;
  const absoluteSecondsThreshold = options.absoluteSecondsThreshold ?? 30;

  const hasFiredRef = useRef(false);
  const onFiredRef = useRef(options.onFired);
  onFiredRef.current = options.onFired;

  const { source, recId } = parseSource(search);
  const active = source === "home-coach-rec" && !!recId;

  function fire(): void {
    if (hasFiredRef.current) return;
    if (!recId) return;
    hasFiredRef.current = true;
    apiRequest(
      "POST",
      `/api/home/coach-recommendation/${encodeURIComponent(recId)}/consume`,
      { triggeredVia: "auto" },
    )
      .then(() => {
        onFiredRef.current?.(recId);
      })
      .catch((err) => {
        // Falha no consume nao deve quebrar UX — log e segue.
        console.warn(
          "[useCoachRecommendationConsume] consume failed",
          err,
        );
      });
  }

  // Media listener (video/audio)
  useEffect(() => {
    if (!active) return;
    const el = options.mediaRef?.current;
    if (!el) return;

    function handleTimeUpdate() {
      if (hasFiredRef.current) return;
      if (!el) return;
      const current = Number(el.currentTime);
      const duration = Number(el.duration);
      if (!Number.isFinite(current)) return;

      if (current >= absoluteSecondsThreshold) {
        fire();
        return;
      }
      if (
        Number.isFinite(duration) &&
        duration > 0 &&
        current / duration >= completionThreshold
      ) {
        fire();
      }
    }

    el.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      el.removeEventListener("timeupdate", handleTimeUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, options.mediaRef?.current, recId, absoluteSecondsThreshold, completionThreshold]);

  // Scroll listener (article — sem mediaRef)
  useEffect(() => {
    if (!active) return;
    if (options.mediaRef?.current) return; // mediaRef tem precedencia

    function handleScroll() {
      if (hasFiredRef.current) return;
      try {
        const scrollY =
          (typeof window !== "undefined" && window.scrollY) ||
          (typeof document !== "undefined" &&
            (document.documentElement?.scrollTop ?? 0)) ||
          0;
        const viewportH =
          (typeof window !== "undefined" && window.innerHeight) || 0;
        const docH =
          (typeof document !== "undefined" &&
            document.documentElement?.scrollHeight) ||
          0;
        const scrollable = Math.max(0, docH - viewportH);
        if (scrollable <= 0) return;
        const ratio = (scrollY + viewportH) / docH;
        if (ratio >= completionThreshold) {
          fire();
        }
      } catch {
        // ignore
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("scroll", handleScroll, { passive: true });
      // checa imediatamente em caso de pagina ja estar com scroll suficiente
      handleScroll();
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("scroll", handleScroll);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, options.mediaRef?.current, recId, completionThreshold]);

  return { hasFired: hasFiredRef.current };
}

export default useCoachRecommendationConsume;
