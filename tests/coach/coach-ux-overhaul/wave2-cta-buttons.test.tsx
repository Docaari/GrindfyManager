// =============================================================================
// Wave 2 (#1) — CoachReportCtaButtons (componente compartilhado de CTA).
// link -> anchor com href; tool -> button. Vazio -> null.
// =============================================================================

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoachReportCtaButtons } from "@/components/coach/CoachReportCtaButtons";

describe("CoachReportCtaButtons", () => {
  it("ctas vazio/undefined -> nao renderiza nada", () => {
    const { container } = render(<CoachReportCtaButtons ctas={[]} />);
    expect(container.firstChild).toBeNull();
    const { container: c2 } = render(<CoachReportCtaButtons ctas={undefined} />);
    expect(c2.firstChild).toBeNull();
  });

  it("renderiza link (anchor com data-href) e tool (button)", () => {
    render(
      <CoachReportCtaButtons
        ctas={[
          { kind: "link", label: "Agendar estudo", href: "/estudos" },
          { kind: "tool", label: "Registrar leak", toolName: "log_leak_focus" },
        ]}
      />,
    );
    const ctas = screen.getAllByTestId("coach-report-cta");
    expect(ctas.length).toBe(2);
    const link = ctas.find((el) => el.getAttribute("data-href") === "/estudos");
    expect(link).toBeTruthy();
    const tool = ctas.find((el) => el.tagName.toLowerCase() === "button");
    expect(tool).toBeTruthy();
    expect(tool?.textContent).toMatch(/Registrar leak/);
  });
});
