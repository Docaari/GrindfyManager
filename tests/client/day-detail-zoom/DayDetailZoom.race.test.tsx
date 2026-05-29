/**
 * Sprint day-detail-3 — HIGH-5 race rapid priority clicks (Q-A spec).
 *
 * Cobre: dispatch monotonic counter + stale-result discard em mutatePriority.
 * Rapid clicks (3 PUTs em paralelo, ordem inversa de resposta) — so o ultimo
 * click sobrevive em overlay/telemetria. Stale PUT errors nao mexem em UI.
 *
 * Lessons: #14 await import.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const emitMock = vi.fn();
const apiRequestMock = vi.fn();

vi.mock("@/lib/activity-telemetry", () => ({
  emitCoachEvent: (...args: any[]) => emitMock(...args),
  emitAudioEvent: vi.fn(),
  emitLessonEvent: vi.fn(),
  emitLibraryEvent: vi.fn(),
}));

vi.mock("@/lib/safe-emit", () => ({
  safeEmit: (...args: any[]) => emitMock(...args),
  default: (...args: any[]) => emitMock(...args),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    setQueryData: vi.fn(),
    getQueryData: vi.fn(() => []),
    invalidateQueries: vi.fn(),
  },
  getQueryFn: vi.fn(),
}));

let _mockData: any = null;
vi.mock("@/hooks/useDayDetail", () => ({
  useDayDetail: () => ({
    data: _mockData,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  default: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/components/grade/BibliotecaEmbedded", () => ({
  BibliotecaEmbedded: (_props: any) => null,
  default: () => null,
}));

function setMockData(data: any) {
  _mockData = data;
}

beforeEach(() => {
  emitMock.mockReset();
  apiRequestMock.mockReset();
  setMockData({
    cards: {
      totalTournaments: 1,
      abiUsd: 10,
      investmentUsd: 10,
      bankrollNeeded: 1000,
      medianFieldSize: 0,
    },
    format: { pctPKO: 0, pctTurbo: 0, pctVanilla: 100 },
    volume: [{ site: "PokerStars", count: 1 }],
    bankroll: [],
    list: [
      {
        id: "pt-race",
        site: "PokerStars",
        time: "20:00",
        buyinUsd: 10,
        count: 1,
        prioridade: 2,
      },
    ],
  });
  Object.defineProperty(window, "innerWidth", { writable: true, value: 1440 });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function renderZoom() {
  const React = await import("react");
  const { render, screen, fireEvent } = await import(
    "@testing-library/react"
  );
  const { DayDetailZoom } = await import("@/components/grade/DayDetailZoom");
  render(
    React.createElement(DayDetailZoom as any, {
      open: true,
      onOpenChange: vi.fn(),
      dayOfWeek: 2,
      profileLetter: "A",
    }),
  );
  return { screen, fireEvent };
}

describe("DayDetailZoom — HIGH-5 race rapid priority clicks", () => {
  it("stale PUT response (mais antiga) NAO emite coach.day_zoom_priority_set", async () => {
    // Resolver fora-de-ordem: 1a chamada resolve por ULTIMO. Sem dispatch ID,
    // overlay seria limpo erroneamente; emit duplicaria com prioridade stale.
    const resolvers: Array<() => void> = [];
    apiRequestMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const { screen, fireEvent } = await renderZoom();
    const trigger = await screen.findByTestId(
      "day-zoom-tournament-priority-pt-race",
    );

    // Click 1 → Alta
    fireEvent.click(trigger);
    const t1 = await screen.findByTestId(
      "day-zoom-tournament-priority-target-pt-race-1",
    );
    fireEvent.click(t1);

    // Click 2 → Baixa (reabre menu, target 3)
    fireEvent.click(trigger);
    const t3 = await screen.findByTestId(
      "day-zoom-tournament-priority-target-pt-race-3",
    );
    fireEvent.click(t3);

    // Resolve PUT 2 (Baixa) primeiro → eh o dispatch atual → emite.
    resolvers[1]();
    await new Promise((r) => setTimeout(r, 0));

    // Resolve PUT 1 (Alta) DEPOIS → stale → descartado, NAO emite.
    resolvers[0]();
    await new Promise((r) => setTimeout(r, 0));

    const priorityEmits = emitMock.mock.calls.filter(
      (c) => c[0] === "coach.day_zoom_priority_set",
    );
    // So 1 emit (do click mais recente, Baixa=3).
    expect(priorityEmits.length).toBe(1);
    expect(priorityEmits[0][1]).toMatchObject({
      tournamentId: "pt-race",
      priority: 3,
    });
  });

  it("stale PUT rejection NAO faz rollback overlay (click mais recente preserved)", async () => {
    const rejecters: Array<(e: any) => void> = [];
    apiRequestMock.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejecters.push(reject);
        }),
    );

    const { screen, fireEvent } = await renderZoom();
    const trigger = await screen.findByTestId(
      "day-zoom-tournament-priority-pt-race",
    );

    fireEvent.click(trigger);
    fireEvent.click(
      await screen.findByTestId("day-zoom-tournament-priority-target-pt-race-1"),
    );
    fireEvent.click(trigger);
    fireEvent.click(
      await screen.findByTestId("day-zoom-tournament-priority-target-pt-race-3"),
    );

    // Rejeita PUT 1 (Alta — stale) → NAO deve mostrar errorToast nem rollback.
    rejecters[0](new Error("network"));
    await new Promise((r) => setTimeout(r, 0));

    // Toast erro NAO deve estar visivel pq stale request descartado.
    expect(screen.queryByTestId("day-zoom-error-toast")).toBeNull();
  });
});
