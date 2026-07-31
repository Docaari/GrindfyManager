/**
 * ADR-243 — faixas de TAMANHO DE FIELD.
 *
 * A aba agrupava por percentual de eliminação (Top 5%, 5-10%, …), respondendo
 * "quão longe eu fui" em vez de "como performo conforme o tamanho do campo".
 */
import { describe, it, expect } from "vitest";
import {
  FIELD_SIZE_BUCKETS,
  FIELD_SIZE_BUCKET_COLORS,
  bucketForFieldSize,
  fieldSizeBucketLabel,
  fieldSizeBucketSqlCase,
} from "../../../shared/field-size-buckets";

describe("faixas de tamanho de field", () => {
  it("são as cinco definidas, do menor para o maior campo", () => {
    expect(FIELD_SIZE_BUCKETS.map((b) => b.label)).toEqual([
      "Low (<200)",
      "Medium (200-500)",
      "Big (500-1500)",
      "Big Big (1500-5000)",
      "Giant (5000+)",
    ]);
  });

  it("classifica pelos limites, com a borda pertencendo à faixa de cima", () => {
    expect(fieldSizeBucketLabel(1)).toBe("Low (<200)");
    expect(fieldSizeBucketLabel(199)).toBe("Low (<200)");
    expect(fieldSizeBucketLabel(200)).toBe("Medium (200-500)");
    expect(fieldSizeBucketLabel(499)).toBe("Medium (200-500)");
    expect(fieldSizeBucketLabel(500)).toBe("Big (500-1500)");
    expect(fieldSizeBucketLabel(1499)).toBe("Big (500-1500)");
    expect(fieldSizeBucketLabel(1500)).toBe("Big Big (1500-5000)");
    expect(fieldSizeBucketLabel(4999)).toBe("Big Big (1500-5000)");
    expect(fieldSizeBucketLabel(5000)).toBe("Giant (5000+)");
    expect(fieldSizeBucketLabel(15424)).toBe("Giant (5000+)");
  });

  it("field ausente ou inválido não entra em faixa nenhuma", () => {
    for (const v of [null, undefined, "", 0, -5, "abc", NaN]) {
      expect(bucketForFieldSize(v as any)).toBeNull();
    }
  });

  it("não há buraco nem sobreposição entre faixas", () => {
    for (let n = 1; n <= 6000; n += 7) {
      const hits = FIELD_SIZE_BUCKETS.filter(
        (b) => n >= b.min && (b.max === null || n < b.max),
      );
      expect(hits).toHaveLength(1);
    }
  });

  it("cada faixa tem cor própria", () => {
    const cores = Object.values(FIELD_SIZE_BUCKET_COLORS);
    expect(cores).toHaveLength(FIELD_SIZE_BUCKETS.length);
    expect(new Set(cores).size).toBe(cores.length);
  });

  it("o SQL gerado usa os mesmos limites do código", () => {
    const sql = fieldSizeBucketSqlCase("field_size");
    expect(sql).toContain("WHEN field_size >= 0 AND field_size < 200 THEN 'Low (<200)'");
    expect(sql).toContain("WHEN field_size >= 5000 THEN 'Giant (5000+)'");
    expect(sql).toContain("ELSE NULL");
    for (const b of FIELD_SIZE_BUCKETS) expect(sql).toContain(b.label);
  });
});
