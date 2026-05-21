/**
 * Sprint TS-3 RF-05 — Calibration Dashboard frontend
 *
 * Spec : Docs/specs/sprint-tournament-selector-3.md (RF-05 frontend AC)
 * ADR  : 179 §3.2 + §4 (a11y exception documentada)
 *
 * Cenarios:
 *  1) Renderiza tabela 5 grades com cor por discrepancy
 *  2) Admin gate via useUserRole — non-admin nao renderiza/redireciona
 *  3) Toggle lookback 30/90/180 dispara re-fetch
 *  4) insufficientData mostra "Aguardando volume telemetria — atual N de 50"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockUseUserRole = vi.fn();
const mockNavigate = vi.fn();
const mockApiRequest = vi.fn();

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => mockUseUserRole(),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

vi.mock("wouter", async () => {
  const real: any = await vi.importActual("wouter");
  return {
    ...real,
    useLocation: () => ["/admin/tournament-selector-calibration", mockNavigate],
  };
});

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  mockUseUserRole.mockReset();
  mockNavigate.mockReset();
  mockApiRequest.mockReset();
});

describe("RF-05 — CalibrationDashboard frontend", () => {
  it("admin ve tabela 5 grades com discrepancy colorida", async () => {
    mockUseUserRole.mockReturnValue({ isAdmin: true, role: "admin" });
    mockApiRequest.mockResolvedValue({
      lookbackDays: 90,
      totalAdds: 250,
      realizedAdds: 180,
      buckets: [
        { grade: "S", adds: 80, realized: 60, realizedRoiPct: 14.2, expectedRoiPct: 21.25, discrepancyPct: -7.05 },
        { grade: "A", adds: 70, realized: 50, realizedRoiPct: 12.5, expectedRoiPct: 13.5, discrepancyPct: -1.0 },
        { grade: "B", adds: 50, realized: 40, realizedRoiPct: 5.5, expectedRoiPct: 6.0, discrepancyPct: -0.5 },
        { grade: "C", adds: 30, realized: 20, realizedRoiPct: -2.0, expectedRoiPct: -1.5, discrepancyPct: -0.5 },
        { grade: "D", adds: 20, realized: 10, realizedRoiPct: -14.0, expectedRoiPct: -15.0, discrepancyPct: 1.0 },
      ],
      warnings: ["bucket_off_calibration_S"],
    });

    const { default: CalibrationDashboard } = await import(
      "../../../client/src/pages/admin/CalibrationDashboard"
    );
    render(withClient(<CalibrationDashboard />));

    await waitFor(() => {
      expect(screen.getByTestId("calibration-table")).toBeTruthy();
    });
    // 5 linhas de bucket
    expect(screen.getByTestId("calibration-row-S")).toBeTruthy();
    expect(screen.getByTestId("calibration-row-A")).toBeTruthy();
    expect(screen.getByTestId("calibration-row-B")).toBeTruthy();
    expect(screen.getByTestId("calibration-row-C")).toBeTruthy();
    expect(screen.getByTestId("calibration-row-D")).toBeTruthy();
    // S esta off (discrepancy > 5pp) -> deve ter classe/data-attr de alerta
    const sRow = screen.getByTestId("calibration-row-S");
    expect(sRow.className).toMatch(/red|warn|alert|delta/i);
  });

  it("non-admin redireciona (useLocation navigate -> /inicio)", async () => {
    mockUseUserRole.mockReturnValue({ isAdmin: false, role: "user" });

    const { default: CalibrationDashboard } = await import(
      "../../../client/src/pages/admin/CalibrationDashboard"
    );
    render(withClient(<CalibrationDashboard />));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/inicio");
    });
  });

  it("toggle lookback 30/90/180 dispara re-fetch", async () => {
    mockUseUserRole.mockReturnValue({ isAdmin: true, role: "admin" });
    mockApiRequest.mockResolvedValue({
      lookbackDays: 90,
      totalAdds: 100,
      realizedAdds: 80,
      buckets: [],
      warnings: [],
    });

    const { default: CalibrationDashboard } = await import(
      "../../../client/src/pages/admin/CalibrationDashboard"
    );
    render(withClient(<CalibrationDashboard />));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    const before = mockApiRequest.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /180/i }));

    await waitFor(() => {
      expect(mockApiRequest.mock.calls.length).toBeGreaterThan(before);
    });
    const lastCall = mockApiRequest.mock.calls.at(-1);
    expect(lastCall?.[1]).toMatch(/lookbackDays=180/);
  });

  it("insufficientData renderiza mensagem 'Aguardando volume telemetria'", async () => {
    mockUseUserRole.mockReturnValue({ isAdmin: true, role: "admin" });
    mockApiRequest.mockResolvedValue({
      insufficientData: true,
      currentVolume: 17,
      requiredVolume: 50,
      lookbackDays: 90,
    });

    const { default: CalibrationDashboard } = await import(
      "../../../client/src/pages/admin/CalibrationDashboard"
    );
    render(withClient(<CalibrationDashboard />));

    await waitFor(() => {
      const msg = screen.getByTestId("calibration-empty-insufficient");
      expect(msg.textContent).toMatch(/aguardando volume/i);
      expect(msg.textContent).toMatch(/17/);
      expect(msg.textContent).toMatch(/50/);
    });
  });
});
