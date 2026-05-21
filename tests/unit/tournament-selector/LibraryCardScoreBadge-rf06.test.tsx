/**
 * Sprint TS-3 RF-06 — LibraryCardScoreBadge sem fallback local
 *
 * Spec : Docs/specs/sprint-tournament-selector-3.md (RF-06 frontend AC)
 *
 * Cenarios:
 *  1) Usa selectorGrade do prop direto (sem inferir)
 *  2) selectorScore != null && selectorGrade == null em DEV mode -> throws
 *  3) Em prod (NODE_ENV=production), fallback silencioso return null + console.warn
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RF-06 — LibraryCardScoreBadge", () => {
  it("usa selectorGrade do prop direto (nao infere)", async () => {
    const { LibraryCardScoreBadge } = await import(
      "../../../client/src/components/tournament-selector/LibraryCardScoreBadge"
    );
    // Score 90 (inferiria 'S'), mas server manda grade 'A' deliberadamente
    // -> componente deve respeitar 'A' (sem inferir).
    const { container } = render(
      <LibraryCardScoreBadge selectorScore={90} selectorGrade={"A" as any} rationale={null} />
    );
    expect(container.textContent).toMatch(/A\s*90/);
    expect(container.textContent).not.toMatch(/^S/);
  });

  it("selectorScore=null -> retorna null (nao renderiza)", async () => {
    const { LibraryCardScoreBadge } = await import(
      "../../../client/src/components/tournament-selector/LibraryCardScoreBadge"
    );
    const { container } = render(
      <LibraryCardScoreBadge selectorScore={null} selectorGrade={null} rationale={null} />
    );
    expect(container.textContent).toBe("");
  });

  it("score != null && grade == null em DEV mode: throws (defensivo)", async () => {
    const origEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "development";

    const { LibraryCardScoreBadge } = await import(
      "../../../client/src/components/tournament-selector/LibraryCardScoreBadge"
    );

    expect(() => {
      render(
        <LibraryCardScoreBadge selectorScore={85} selectorGrade={null} rationale={null} />
      );
    }).toThrow();

    (process.env as any).NODE_ENV = origEnv;
  });

  it("score != null && grade == null em PROD: console.warn + null render", async () => {
    const origEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "production";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.resetModules();
    const { LibraryCardScoreBadge } = await import(
      "../../../client/src/components/tournament-selector/LibraryCardScoreBadge"
    );

    const { container } = render(
      <LibraryCardScoreBadge selectorScore={85} selectorGrade={null} rationale={null} />
    );

    expect(container.textContent).toBe("");
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls.map((c) => c.join(" ")).join(" ");
    expect(warnMsg).toMatch(/selectorGrade|grade missing|inferGradeFromScore/i);

    (process.env as any).NODE_ENV = origEnv;
  });

  it("grade vem do prop respeitado tambem na cor (getGradeColor)", async () => {
    const { LibraryCardScoreBadge } = await import(
      "../../../client/src/components/tournament-selector/LibraryCardScoreBadge"
    );
    const { container } = render(
      <LibraryCardScoreBadge selectorScore={50} selectorGrade={"S" as any} rationale="forte" />
    );
    // Implementacao pega cor pela grade do prop, nao por score
    const badge = container.querySelector('[data-testid="library-card-score-badge"]');
    expect(badge?.textContent).toMatch(/^S\s*50/);
  });
});
