import { describe, it, expect } from "vitest";
import {
  MIN_GROUP_VISIBLE,
  GRADE_THRESHOLDS,
  confidenceGradeForVolume,
  GRADE_TOOLTIPS,
  GRADE_COLORS,
} from "../../shared/library-grades";

describe("library-grades — recalibracao de confianca", () => {
  it("thresholds recalibrados (A>=500 .. F>=30)", () => {
    expect(GRADE_THRESHOLDS.A).toBe(500);
    expect(GRADE_THRESHOLDS.B).toBe(200);
    expect(GRADE_THRESHOLDS.C).toBe(100);
    expect(GRADE_THRESHOLDS.D).toBe(50);
    expect(GRADE_THRESHOLDS.F).toBe(30);
  });

  it("MIN_GROUP_VISIBLE = 30", () => {
    expect(MIN_GROUP_VISIBLE).toBe(30);
  });

  it("mapeia volume -> grade", () => {
    expect(confidenceGradeForVolume(800)).toBe("A");
    expect(confidenceGradeForVolume(500)).toBe("A");
    expect(confidenceGradeForVolume(300)).toBe("B");
    expect(confidenceGradeForVolume(150)).toBe("C");
    expect(confidenceGradeForVolume(60)).toBe("D");
    expect(confidenceGradeForVolume(35)).toBe("F");
    expect(confidenceGradeForVolume(10)).toBe("F");
  });

  it("tooltips e cores cobrem todas as grades", () => {
    for (const g of ["A", "B", "C", "D", "F"]) {
      expect(GRADE_TOOLTIPS[g]).toBeTruthy();
      expect(GRADE_COLORS[g]).toBeTruthy();
    }
  });

  it("tooltips refletem os novos numeros (nao 2000+)", () => {
    expect(GRADE_TOOLTIPS.A).toContain("500");
    expect(GRADE_TOOLTIPS.A).not.toContain("2000");
  });
});
