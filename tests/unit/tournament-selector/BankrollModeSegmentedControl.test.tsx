/**
 * Sprint TS-3 RF-04 — Frontend SelectorFilters segmented control 3-way
 *
 * Spec : Docs/specs/sprint-tournament-selector-3.md (RF-04 AC)
 * ADR  : 178 §2.4
 *
 * Cenarios:
 *  1) Render 3 chips com labels "Todos | Avisar | Esconder fora"
 *  2) Click muda value + dispara onChange
 *  3) Persistencia via PUT /api/user-settings debounce 500ms (fake timers)
 *  4) Tooltip por chip explica modo
 *
 * NOTA test-writer: usa `await import(...)` (lesson #14/#26 — vitest 4 + .tsx
 * com `require()` quebra com deps ESM).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

const mockApiRequest = vi.fn();

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

beforeEach(() => {
  mockApiRequest.mockReset();
  mockApiRequest.mockResolvedValue({ ok: true });
  vi.useRealTimers();
});

describe("RF-04 — BankrollModeSegmentedControl", () => {
  it("renderiza 3 chips com labels PT-BR", async () => {
    const mod: any = await import(
      "../../../client/src/components/tournament-selector/BankrollModeSegmentedControl"
    );
    const Component = mod.BankrollModeSegmentedControl ?? mod.default;
    render(<Component value="warn" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /todos/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /avisar/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /esconder fora/i })).toBeTruthy();
  });

  it("marca chip ativo via aria-pressed='true'", async () => {
    const mod: any = await import(
      "../../../client/src/components/tournament-selector/BankrollModeSegmentedControl"
    );
    const Component = mod.BankrollModeSegmentedControl ?? mod.default;
    render(<Component value="hide" onChange={vi.fn()} />);
    const hideBtn = screen.getByRole("button", { name: /esconder fora/i });
    expect(hideBtn.getAttribute("aria-pressed")).toBe("true");
    const warnBtn = screen.getByRole("button", { name: /avisar/i });
    expect(warnBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("click dispara onChange com novo valor", async () => {
    const mod: any = await import(
      "../../../client/src/components/tournament-selector/BankrollModeSegmentedControl"
    );
    const Component = mod.BankrollModeSegmentedControl ?? mod.default;
    const onChange = vi.fn();
    render(<Component value="warn" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /esconder fora/i }));
    expect(onChange).toHaveBeenCalledWith("hide");
  });

  it("persistencia debounce 500ms — PUT /api/user-settings", async () => {
    const mod: any = await import(
      "../../../client/src/components/tournament-selector/BankrollModeSegmentedControl"
    );
    const Component = mod.BankrollModeSegmentedControl ?? mod.default;

    vi.useFakeTimers();

    const { rerender } = render(<Component value="warn" onChange={() => {}} persist />);
    fireEvent.click(screen.getByRole("button", { name: /esconder fora/i }));

    // antes de 500ms — sem PUT
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(mockApiRequest).not.toHaveBeenCalled();

    // pos debounce
    act(() => {
      vi.advanceTimersByTime(200);
    });

    vi.useRealTimers();
    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalled();
    });
    const [method, url, body] = mockApiRequest.mock.calls[0];
    expect(method).toBe("PUT");
    expect(url).toBe("/api/user-settings");
    expect(body).toMatchObject({ tournament_selector_bankroll_mode: "hide" });
  });

  it("cada chip tem tooltip/title explicando o modo (PT-BR)", async () => {
    const mod: any = await import(
      "../../../client/src/components/tournament-selector/BankrollModeSegmentedControl"
    );
    const Component = mod.BankrollModeSegmentedControl ?? mod.default;
    render(<Component value="warn" onChange={vi.fn()} />);

    const all = screen.getByRole("button", { name: /todos/i });
    const warn = screen.getByRole("button", { name: /avisar/i });
    const hide = screen.getByRole("button", { name: /esconder fora/i });

    // tooltip via title OU aria-describedby — implementer escolhe; teste valida presenca
    const hasTooltipHint = (el: HTMLElement) =>
      !!(el.getAttribute("title") || el.getAttribute("aria-describedby") || el.getAttribute("data-tooltip"));
    expect(hasTooltipHint(all)).toBe(true);
    expect(hasTooltipHint(warn)).toBe(true);
    expect(hasTooltipHint(hide)).toBe(true);
  });
});
