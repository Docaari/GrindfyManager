// =============================================================================
// useCoachRecommendationConsume — Sprint home-reform-4 / Item 4 / RF-07.
//
// Cobertura:
//   - source != home-coach-rec -> nao dispara
//   - source == home-coach-rec, video timeupdate atinge 30s -> dispara
//   - 80% completion -> dispara
//   - dispara apenas 1x mesmo com multiplos timeupdate
//   - article (sem mediaRef) + scroll 80% -> dispara
//
// Lessons aplicadas:
//   #2  data-testid nao se aplica (hook puro) — checagem por mock calls
//   #5  vi.fn() ok (apiRequest nao usa `new`)
//   #13 apiRequest mock retorna JSON parseado
// =============================================================================
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React, { useRef } from "react";

// =============================================================================
// Mock apiRequest — capturamos chamadas para asserts.
// =============================================================================
const apiRequestMock = vi.fn();
vi.mock("@/lib/queryClient", async () => {
  const actual = await vi.importActual<any>("@/lib/queryClient");
  return {
    ...actual,
    apiRequest: (...args: any[]) => apiRequestMock(...args),
  };
});

// =============================================================================
// Mock wouter useSearch — controlado por variavel ambient.
// =============================================================================
let currentSearch = "";
vi.mock("wouter", () => ({
  useSearch: () => currentSearch,
  useLocation: () => ["/", vi.fn()],
}));

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ ok: true });
  currentSearch = "";
});

// =============================================================================
// Helpers — fake media element com event listener manual + currentTime mutavel.
// =============================================================================
function makeFakeMedia(initial: { duration?: number } = {}): {
  el: any;
  fire: (current: number) => void;
} {
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const el: any = {
    currentTime: 0,
    duration: initial.duration ?? 1800,
    addEventListener(event: string, cb: any) {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    },
    removeEventListener(event: string, cb: any) {
      listeners[event] = (listeners[event] ?? []).filter((x) => x !== cb);
    },
  };
  function fire(current: number) {
    el.currentTime = current;
    (listeners["timeupdate"] ?? []).forEach((cb) => cb({ target: el }));
  }
  return { el, fire };
}

// =============================================================================
// Async helper — flush microtasks (apiRequest .then resolve).
// =============================================================================
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// =============================================================================
// Tests
// =============================================================================
describe("useCoachRecommendationConsume", () => {
  describe("source != home-coach-rec", () => {
    it("nao dispara quando source ausente", async () => {
      currentSearch = "";
      const { el, fire } = makeFakeMedia();
      const mediaRef = { current: el };
      const { useCoachRecommendationConsume } = await import(
        "../useCoachRecommendationConsume"
      );

      renderHook(() => useCoachRecommendationConsume({ mediaRef }));
      fire(60);
      await flush();
      expect(apiRequestMock).not.toHaveBeenCalled();
    });

    it("nao dispara quando source != home-coach-rec", async () => {
      currentSearch = "?source=outra-rota&recId=REC-1";
      const { el, fire } = makeFakeMedia();
      const mediaRef = { current: el };
      const { useCoachRecommendationConsume } = await import(
        "../useCoachRecommendationConsume"
      );

      renderHook(() => useCoachRecommendationConsume({ mediaRef }));
      fire(60);
      await flush();
      expect(apiRequestMock).not.toHaveBeenCalled();
    });

    it("nao dispara quando recId ausente", async () => {
      currentSearch = "?source=home-coach-rec";
      const { el, fire } = makeFakeMedia();
      const mediaRef = { current: el };
      const { useCoachRecommendationConsume } = await import(
        "../useCoachRecommendationConsume"
      );

      renderHook(() => useCoachRecommendationConsume({ mediaRef }));
      fire(60);
      await flush();
      expect(apiRequestMock).not.toHaveBeenCalled();
    });
  });

  describe("video/audio — timeupdate triggers", () => {
    it("dispara quando currentTime atinge 30s (threshold absoluto)", async () => {
      currentSearch = "?source=home-coach-rec&recId=REC-30";
      const { el, fire } = makeFakeMedia({ duration: 1800 });
      const mediaRef = { current: el };
      const { useCoachRecommendationConsume } = await import(
        "../useCoachRecommendationConsume"
      );

      renderHook(() => useCoachRecommendationConsume({ mediaRef }));
      fire(29.5); // abaixo do threshold
      await flush();
      expect(apiRequestMock).not.toHaveBeenCalled();

      fire(30.1); // cruzou o threshold
      await flush();
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
      const [method, url, body] = apiRequestMock.mock.calls[0];
      expect(method).toBe("POST");
      expect(String(url)).toContain("/api/home/coach-recommendation/REC-30/consume");
      expect(body).toEqual({ triggeredVia: "auto" });
    });

    it("dispara quando completion >= 80% (mesmo abaixo de 30s no caso curto)", async () => {
      currentSearch = "?source=home-coach-rec&recId=REC-80PCT";
      // duration curta para 80% acontecer antes de 30s
      const { el, fire } = makeFakeMedia({ duration: 20 });
      const mediaRef = { current: el };
      const { useCoachRecommendationConsume } = await import(
        "../useCoachRecommendationConsume"
      );

      renderHook(() => useCoachRecommendationConsume({ mediaRef }));
      // 80% de 20s = 16s
      fire(15.5);
      await flush();
      expect(apiRequestMock).not.toHaveBeenCalled();

      fire(16.1);
      await flush();
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
      const [, url] = apiRequestMock.mock.calls[0];
      expect(String(url)).toContain("REC-80PCT");
    });

    it("dispara apenas 1x mesmo com multiplos timeupdate", async () => {
      currentSearch = "?source=home-coach-rec&recId=REC-IDEMP";
      const { el, fire } = makeFakeMedia({ duration: 1800 });
      const mediaRef = { current: el };
      const { useCoachRecommendationConsume } = await import(
        "../useCoachRecommendationConsume"
      );

      renderHook(() => useCoachRecommendationConsume({ mediaRef }));
      fire(31);
      fire(32);
      fire(60);
      fire(120);
      fire(1500);
      await flush();
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("article (sem mediaRef) — scroll trigger", () => {
    // Helper: stuba scrollHeight/innerHeight/scrollY no jsdom existente.
    function stubScrollGeometry(
      scrollHeight: number,
      innerHeight: number,
      scrollY: number,
    ) {
      Object.defineProperty(document.documentElement, "scrollHeight", {
        configurable: true,
        get: () => scrollHeight,
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        get: () => innerHeight,
      });
      Object.defineProperty(window, "scrollY", {
        configurable: true,
        get: () => scrollY,
      });
    }

    function fireScroll() {
      window.dispatchEvent(new Event("scroll"));
    }

    it("dispara quando scroll atinge 80% do conteudo", async () => {
      currentSearch = "?source=home-coach-rec&recId=REC-ARTICLE";

      // doc 2000, viewport 800 -> 80% threshold em scrollY=800
      stubScrollGeometry(2000, 800, 0);
      const { useCoachRecommendationConsume } = await import(
        "../useCoachRecommendationConsume"
      );

      renderHook(() => useCoachRecommendationConsume({}));
      // mount inicial: scrollY=0 -> ratio = 800/2000 = 0.4
      await flush();
      expect(apiRequestMock).not.toHaveBeenCalled();

      stubScrollGeometry(2000, 800, 700); // ratio = 1500/2000 = 0.75
      fireScroll();
      await flush();
      expect(apiRequestMock).not.toHaveBeenCalled();

      stubScrollGeometry(2000, 800, 850); // ratio = 1650/2000 = 0.825
      fireScroll();
      await flush();
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
      const [, url] = apiRequestMock.mock.calls[0];
      expect(String(url)).toContain("REC-ARTICLE");
    });

    it("scroll < 80% NAO dispara", async () => {
      currentSearch = "?source=home-coach-rec&recId=REC-NO-FIRE";
      stubScrollGeometry(2000, 800, 0);
      const { useCoachRecommendationConsume } = await import(
        "../useCoachRecommendationConsume"
      );

      renderHook(() => useCoachRecommendationConsume({}));
      await flush();

      stubScrollGeometry(2000, 800, 100);
      fireScroll();
      await flush();
      expect(apiRequestMock).not.toHaveBeenCalled();
    });
  });
});
