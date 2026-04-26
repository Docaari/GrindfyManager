/**
 * HIGH-2 reviewer fix — badge "Auto" no historico (RF-09)
 *
 * Spec: Docs/specs/session-end-wallet-reconciliation.md (RF-09)
 *
 * Asserts:
 *  - source='manual' (ou ausente) -> NAO renderiza badge "Auto"
 *  - source='auto_session'        -> renderiza badge "Auto" + tooltip "Reconciliacao automatica"
 *  - source='auto_import_csv'     -> renderiza badge "Auto" + tooltip "Automatica" (fallback generico)
 *  - source=null                  -> NAO renderiza badge (default Manual)
 *  - source=undefined             -> NAO renderiza badge (default Manual)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BankrollHistoryTable } from "../BankrollHistoryTable";

const apiRequestMock = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
  },
  getCsrfToken: () => null,
}));

beforeEach(() => {
  apiRequestMock.mockReset();
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const baseSnapshot = {
  occurredAt: "2026-04-26T18:30:00Z",
  delta: 50,
  previousAmount: 1000,
  newAmount: 1050,
  reason: "session_result",
  note: null,
};

describe("<BankrollHistoryTable> — source badge (HIGH-2, RF-09)", () => {
  it('source="manual" NAO renderiza badge "Auto"', async () => {
    apiRequestMock.mockResolvedValue({
      snapshots: [{ id: "snap_man", ...baseSnapshot, source: "manual" }],
    });

    render(wrap(<BankrollHistoryTable />));

    await waitFor(() => {
      // Linha existe
      expect(document.querySelector('tr[data-reason="session_result"]')).toBeTruthy();
    });
    expect(screen.queryByTestId("source-badge-auto-snap_man")).toBeFalsy();
  });

  it('source=null NAO renderiza badge (default Manual)', async () => {
    apiRequestMock.mockResolvedValue({
      snapshots: [{ id: "snap_null", ...baseSnapshot, source: null }],
    });

    render(wrap(<BankrollHistoryTable />));

    await waitFor(() => {
      expect(document.querySelector('tr[data-reason="session_result"]')).toBeTruthy();
    });
    expect(screen.queryByTestId("source-badge-auto-snap_null")).toBeFalsy();
  });

  it("source ausente (undefined) NAO renderiza badge (default Manual)", async () => {
    apiRequestMock.mockResolvedValue({
      snapshots: [{ id: "snap_undef", ...baseSnapshot }],
    });

    render(wrap(<BankrollHistoryTable />));

    await waitFor(() => {
      expect(document.querySelector('tr[data-reason="session_result"]')).toBeTruthy();
    });
    expect(screen.queryByTestId("source-badge-auto-snap_undef")).toBeFalsy();
  });

  it('source="auto_session" renderiza badge "Auto" + tooltip "Reconciliacao automatica"', async () => {
    apiRequestMock.mockResolvedValue({
      snapshots: [
        { id: "snap_auto", ...baseSnapshot, source: "auto_session" },
      ],
    });

    render(wrap(<BankrollHistoryTable />));

    await waitFor(() => {
      const badge = screen.getByTestId("source-badge-auto-snap_auto");
      expect(badge).toBeTruthy();
      expect(badge.textContent).toBe("Auto");
      expect(badge.getAttribute("title")).toBe("Reconciliacao automatica");
    });
  });

  it('source desconhecido (ex: "auto_import_csv") renderiza badge com tooltip generico "Automatica"', async () => {
    apiRequestMock.mockResolvedValue({
      snapshots: [
        { id: "snap_csv", ...baseSnapshot, source: "auto_import_csv" },
      ],
    });

    render(wrap(<BankrollHistoryTable />));

    await waitFor(() => {
      const badge = screen.getByTestId("source-badge-auto-snap_csv");
      expect(badge).toBeTruthy();
      expect(badge.textContent).toBe("Auto");
      expect(badge.getAttribute("title")).toBe("Automatica");
    });
  });

  it("rakeback + auto_session: badge de rakeback E badge Auto coexistem", async () => {
    apiRequestMock.mockResolvedValue({
      snapshots: [
        { id: "snap_rb_auto", ...baseSnapshot, reason: "rakeback", source: "auto_session" },
      ],
    });

    render(wrap(<BankrollHistoryTable />));

    await waitFor(() => {
      expect(screen.getByTestId("reason-badge-rakeback")).toBeTruthy();
      expect(screen.getByTestId("source-badge-auto-snap_rb_auto")).toBeTruthy();
    });
  });
});
