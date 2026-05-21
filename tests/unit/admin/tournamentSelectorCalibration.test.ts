/**
 * Sprint TS-3 RF-05 — Dashboard admin "Score vs ROI realizado"
 *
 * Spec : Docs/specs/sprint-tournament-selector-3.md (RF-05)
 * ADR  : 179 — tournament-selector-calibration-dashboard
 *
 * Cenarios (server endpoint handler):
 *  1) JWT requerido + requirePermission('admin') — nao-admin retorna 403
 *  2) totalAdds < 50 retorna insufficientData=true + currentVolume + requiredVolume
 *  3) Volume suficiente: 5 buckets S/A/B/C/D com realized + expected + discrepancy
 *  4) Discrepancia > 5pp E adds >= 20 -> warning bucket_off_calibration_<grade>
 *  5) Query respeita CLAUDE.md §6.1 (tournaments.grind_session_id IS NULL)
 *
 * NOTA test-writer: handler precisa aceitar 3o arg `injectedStorage` (lesson #34)
 * para testabilidade. Implementer cria o handler em
 * server/routes/admin/tournamentSelectorCalibration.ts e em handlers.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function adminUser(overrides: any = {}) {
  return {
    userId: "USER-ADMIN",
    subscriptionPlan: "admin",
    permissions: ["admin"],
    role: "admin",
    ...overrides,
  };
}

function regularUser(overrides: any = {}) {
  return {
    userId: "USER-REG",
    subscriptionPlan: "active",
    permissions: [],
    role: "user",
    ...overrides,
  };
}

const mockStorage = {
  // Esperado pelo implementer (ADR-179 §2):
  // Agrega buckets via SQL com JOIN tournament_selector_logs <-> tournaments.
  aggregateSelectorCalibration: vi.fn(),
};

beforeEach(() => {
  Object.values(mockStorage).forEach((m: any) => m.mockReset?.());
});

describe("RF-05 — GET /api/admin/tournament-selector/calibration", () => {
  describe("admin gate", () => {
    it("non-admin retorna 403", async () => {
      const { handleGetSelectorCalibration } = await import(
        "../../../server/routes/admin/tournamentSelectorCalibration"
      );
      const req: any = { query: {}, user: regularUser(), userId: "USER-REG" };
      const res = mockRes();
      await handleGetSelectorCalibration(req, res, mockStorage as any);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("admin passa", async () => {
      mockStorage.aggregateSelectorCalibration.mockResolvedValue({
        totalAdds: 100,
        buckets: [],
      });
      const { handleGetSelectorCalibration } = await import(
        "../../../server/routes/admin/tournamentSelectorCalibration"
      );
      const req: any = { query: {}, user: adminUser(), userId: "USER-ADMIN" };
      const res = mockRes();
      await handleGetSelectorCalibration(req, res, mockStorage as any);
      expect(res.status).not.toHaveBeenCalledWith(403);
    });
  });

  describe("insufficientData flag (ADR-179 §2.4)", () => {
    it("totalAdds < 50 -> insufficientData=true com currentVolume + requiredVolume", async () => {
      mockStorage.aggregateSelectorCalibration.mockResolvedValue({
        totalAdds: 17,
        realizedAdds: 9,
        buckets: [],
      });
      const { handleGetSelectorCalibration } = await import(
        "../../../server/routes/admin/tournamentSelectorCalibration"
      );
      const req: any = { query: { lookbackDays: "90" }, user: adminUser() };
      const res = mockRes();
      await handleGetSelectorCalibration(req, res, mockStorage as any);

      const payload = res.json.mock.calls[0][0];
      expect(payload.insufficientData).toBe(true);
      expect(payload.currentVolume).toBe(17);
      expect(payload.requiredVolume).toBe(50);
      expect(payload.lookbackDays).toBe(90);
    });
  });

  describe("buckets payload — volume suficiente", () => {
    it("retorna 5 buckets S/A/B/C/D com realized + expected + discrepancy", async () => {
      mockStorage.aggregateSelectorCalibration.mockResolvedValue({
        totalAdds: 247,
        realizedAdds: 189,
        buckets: [
          { grade: "S", adds: 87, realized: 71, realizedRoiPct: 14.2 },
          { grade: "A", adds: 95, realized: 78, realizedRoiPct: 8.1 },
          { grade: "B", adds: 40, realized: 25, realizedRoiPct: 3.0 },
          { grade: "C", adds: 18, realized: 10, realizedRoiPct: -2.0 },
          { grade: "D", adds: 7, realized: 5, realizedRoiPct: -10.0 },
        ],
      });

      const { handleGetSelectorCalibration } = await import(
        "../../../server/routes/admin/tournamentSelectorCalibration"
      );
      const req: any = { query: { lookbackDays: "90" }, user: adminUser() };
      const res = mockRes();
      await handleGetSelectorCalibration(req, res, mockStorage as any);

      const payload = res.json.mock.calls[0][0];
      expect(payload.insufficientData).toBeFalsy();
      expect(payload.buckets).toHaveLength(5);
      const sBucket = payload.buckets.find((b: any) => b.grade === "S");
      expect(sBucket.expectedRoiPct).toBeCloseTo(21.25, 1);
      expect(sBucket.discrepancyPct).toBeCloseTo(14.2 - 21.25, 1);
    });

    it("discrepancia > 5pp E adds >= 20 dispara warning bucket_off_calibration_<grade>", async () => {
      mockStorage.aggregateSelectorCalibration.mockResolvedValue({
        totalAdds: 200,
        realizedAdds: 150,
        buckets: [
          // S sub-performando: realized 5%, expected 21.25% => discrepancy ~-16pp, adds=80
          { grade: "S", adds: 80, realized: 60, realizedRoiPct: 5.0 },
          { grade: "A", adds: 60, realized: 40, realizedRoiPct: 13.0 },
          { grade: "B", adds: 40, realized: 30, realizedRoiPct: 5.5 },
          { grade: "C", adds: 15, realized: 12, realizedRoiPct: -1.0 },
          { grade: "D", adds: 5, realized: 4, realizedRoiPct: -14.0 },
        ],
      });

      const { handleGetSelectorCalibration } = await import(
        "../../../server/routes/admin/tournamentSelectorCalibration"
      );
      const req: any = { query: { lookbackDays: "90" }, user: adminUser() };
      const res = mockRes();
      await handleGetSelectorCalibration(req, res, mockStorage as any);

      const payload = res.json.mock.calls[0][0];
      expect(payload.warnings).toEqual(
        expect.arrayContaining([expect.stringMatching(/bucket_off_calibration_S/)])
      );
      // adds < 20 nao emite warning de off-calibration (C tem 15)
      expect(payload.warnings).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/bucket_off_calibration_C/)])
      );
    });
  });

  describe("query — CLAUDE.md §6.1 (historico ≠ session_tournaments)", () => {
    it("storage method recebe filtro grindSessionIdIsNull=true", async () => {
      mockStorage.aggregateSelectorCalibration.mockResolvedValue({
        totalAdds: 100,
        realizedAdds: 80,
        buckets: [],
      });

      const { handleGetSelectorCalibration } = await import(
        "../../../server/routes/admin/tournamentSelectorCalibration"
      );
      const req: any = { query: { lookbackDays: "90" }, user: adminUser() };
      const res = mockRes();
      await handleGetSelectorCalibration(req, res, mockStorage as any);

      expect(mockStorage.aggregateSelectorCalibration).toHaveBeenCalled();
      const args = mockStorage.aggregateSelectorCalibration.mock.calls[0][0];
      // Implementer pode chamar de "excludeSessionTournaments" ou
      // "grindSessionIdIsNull" — teste verifica que a flag esta presente E true.
      const enforcement =
        args?.excludeSessionTournaments === true ||
        args?.grindSessionIdIsNull === true ||
        args?.historicOnly === true;
      expect(enforcement).toBe(true);
    });
  });

  describe("cache (ADR-179 §2.5)", () => {
    it("2 chamadas consecutivas no mesmo lookback batem storage 1 vez (cache hit)", async () => {
      mockStorage.aggregateSelectorCalibration.mockResolvedValue({
        totalAdds: 100,
        realizedAdds: 80,
        buckets: [],
      });

      const { handleGetSelectorCalibration, _resetCalibrationCacheForTests } = await import(
        "../../../server/routes/admin/tournamentSelectorCalibration"
      );
      _resetCalibrationCacheForTests?.();

      const req: any = { query: { lookbackDays: "90" }, user: adminUser() };
      const res1 = mockRes();
      const res2 = mockRes();
      await handleGetSelectorCalibration(req, res1, mockStorage as any);
      await handleGetSelectorCalibration(req, res2, mockStorage as any);
      expect(mockStorage.aggregateSelectorCalibration).toHaveBeenCalledTimes(1);
    });
  });
});
