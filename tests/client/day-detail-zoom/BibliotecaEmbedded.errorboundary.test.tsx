/**
 * Sprint day-detail-3 — MEDIUM-5 BibliotecaEmbedded ErrorBoundary console.warn.
 *
 * Cobre: componentDidCatch deixou de ser no-op silencioso; loga via
 * console.warn pra debug em prod sem quebrar UI (fallback null preservado).
 *
 * Lessons: #14 await import, #29 LocalErrorBoundary isolado.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
  getQueryFn: vi.fn(),
}));

vi.mock("@/lib/activity-telemetry", () => ({
  emitCoachEvent: vi.fn(),
  emitAudioEvent: vi.fn(),
  emitLessonEvent: vi.fn(),
  emitLibraryEvent: vi.fn(),
}));

vi.mock("@/lib/safe-emit", () => ({
  safeEmit: vi.fn(),
  default: vi.fn(),
}));

// Mock LibraryCard (children deps interna).
vi.mock("@/components/grade-planner/LibraryCard", () => ({
  LibraryCard: () => null,
  default: () => null,
}));

let consoleWarnSpy: any;
let consoleErrorSpy: any;

beforeEach(() => {
  consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  // React loga o erro tambem via console.error — silenciamos pra nao poluir stdout.
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

describe("BibliotecaEmbedded — MEDIUM-5 ErrorBoundary console.warn", () => {
  it("componentDidCatch chama console.warn com prefixo + error + stack", async () => {
    const React = await import("react");
    const { render } = await import("@testing-library/react");
    const mod = await import("@/components/grade/BibliotecaEmbedded");

    // Acessa LocalErrorBoundary nao-exportado via render do componente real
    // que lanca dentro do boundary. Estrategia: mockar @tanstack/react-query
    // useQuery pra throw — assim BibliotecaEmbeddedInner explode + boundary captura.
    vi.doMock("@tanstack/react-query", () => ({
      useQuery: () => {
        throw new Error("simulated useQuery failure");
      },
      QueryClient: class {},
      QueryClientProvider: ({ children }: any) => children,
    }));

    // Re-import apos doMock para pegar useQuery throw.
    vi.resetModules();
    const fresh = await import("@/components/grade/BibliotecaEmbedded");
    const Comp =
      (fresh as any).BibliotecaEmbedded ?? (fresh as any).default ?? mod;

    const { container } = render(
      React.createElement(Comp as any, {
        contextFilters: { site: undefined, buyInMin: undefined, buyInMax: undefined, format: undefined },
        dayOfWeek: 2,
        profileLetter: "A",
      }),
    );

    // Boundary fallback null — container vazio.
    expect(container.textContent?.length ?? 0).toBe(0);

    // console.warn invocado com prefixo identificavel.
    const warnCall = consoleWarnSpy.mock.calls.find((c: any[]) =>
      String(c[0] ?? "").includes("BibliotecaEmbedded"),
    );
    expect(warnCall).toBeTruthy();
    expect(String(warnCall![0])).toContain("ErrorBoundary caught");
  });
});
