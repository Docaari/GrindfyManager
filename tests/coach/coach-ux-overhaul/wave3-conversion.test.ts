// =============================================================================
// Wave 3 (#6 + GAP-quarterly) — teaser de tool no Free + entrega quarterly.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFreeToolTeaser } from "../../../server/routes/coach";

describe("#6 — buildFreeToolTeaser", () => {
  it("intencao de grade -> teaser com link /subscriptions", () => {
    const t = buildFreeToolTeaser("monta minha grade de amanha");
    expect(t).toBeTruthy();
    expect(t).toContain("/subscriptions");
    expect(t!.toLowerCase()).toContain("pro");
  });

  it("intencao de leak -> teaser", () => {
    expect(buildFreeToolTeaser("quais meus 3 maiores leaks?")).toBeTruthy();
  });

  it("intencao de rake / variancia -> teaser", () => {
    expect(buildFreeToolTeaser("qual meu rake efetivo?")).toBeTruthy();
    expect(buildFreeToolTeaser("analisa minha variancia do mes")).toBeTruthy();
  });

  it("conversa sem intencao de tool -> null (sem upsell)", () => {
    expect(buildFreeToolTeaser("oi, tudo bem?")).toBeNull();
    expect(buildFreeToolTeaser("o que e ICM?")).toBeNull();
  });
});

describe("GAP-quarterly — deliverReport trata quarterly (in-app + chat + email)", () => {
  beforeEach(() => vi.resetModules());

  it("quarterly -> notificacao in-app + msg no chat + email report_quarterly", async () => {
    const sendReportEmail = vi.fn(async () => ({ status: "sent" }));
    vi.doMock("../../../server/services/reportEmailSender", () => ({ sendReportEmail }));
    const storage: any = {
      markReportDelivered: vi.fn(async () => true),
      unmarkReportDelivered: vi.fn(async () => {}),
      createNotification: vi.fn(async () => ({ id: "n1" })),
      getOrCreateReportChatSession: vi.fn(async () => ({ id: "rs" })),
      insertChatMessage: vi.fn(async () => ({ id: "m1" })),
    };
    const { deliverReport } = await import("../../../server/services/reportDelivery");
    await deliverReport({ reportId: "rep-q", userId: "USER-1", reportType: "quarterly" as any }, storage);

    expect(storage.createNotification).toHaveBeenCalledTimes(1);
    expect(String(storage.createNotification.mock.calls[0][0].title)).toMatch(/trimestral/i);
    expect(storage.insertChatMessage).toHaveBeenCalledTimes(1);
    expect(sendReportEmail).toHaveBeenCalledTimes(1);
    expect(sendReportEmail.mock.calls[0][0].kind).toBe("report_quarterly");
  });
});
