// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint EST-1 / RF-03 + RF-04 + RF-07 — server/services/reportDelivery.ts (NOVO).
//
//   export async function deliverReport(
//     args: { reportId: string; userId: string; reportType: 'weekly'|'daily'|'monthly' },
//     injectedStorage?: any,
//   ): Promise<void>
//
// Best-effort, NUNCA lança. Orquestra 3 canais em ordem in-app → chat → email,
// cada um em try/catch isolado (lesson #9 — log antes de fallback).
//
//   in-app: markReportDelivered(reportId,'inApp') → se true: createNotification({
//     userId, type:'coach_report', title, message, priority:'medium',
//     deepLink:'/coach-ai/relatorio/'+reportId }). Em erro → log + unmarkReportDelivered.
//   chat: markReportDelivered(reportId,'chat') → se true: getOrCreateReportChatSession(userId)
//     + insertChatMessage({ chatSessionId, role:'assistant', content }).
//     content PT-BR por reportType, contém o deep link. Em erro → log + unmark.
//   email: só weekly/monthly → sendReportEmail({ reportId, userId,
//     kind:'report_weekly'|'report_monthly' }, storage). daily NÃO tem email.
//     quarterly NÃO é disparado por deliverReport (reportType não inclui quarterly).
//
// Fontes:
//   - Docs/specs/.../EST-1-coach-weekly-delivery.md (RF-03/04/07 + Cenários)
//   - Docs/architecture/decisions/222-...md (Decisão 4 templates + Decisão 5 ordem/canais)
//
// Status esperado: RED — server/services/reportDelivery.ts NÃO existe → import lança /
//   deliverReport is not a function.
//
// Lessons: #9 (log antes de fallback; cada canal isolado), #34 (injectedStorage por
//   composição — sem vi.mock('../storage')), #3 (mock shape real dos métodos storage).
// Anthropic NÃO é usado aqui (post determinístico — sem SDK).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// sendReportEmail é importado por reportDelivery.ts — mockamos o módulo do sender.
const sendReportEmailMock = vi.fn();
vi.mock("../../../server/services/reportEmailSender", () => ({
  sendReportEmail: sendReportEmailMock,
}));

async function loadDeliver() {
  const mod: any = await import("../../../server/services/reportDelivery");
  return mod.deliverReport;
}

// Storage mock — shape REAL dos métodos (lesson #3).
function makeStorage(overrides: Partial<Record<string, any>> = {}) {
  return {
    markReportDelivered: vi.fn(async () => true),
    unmarkReportDelivered: vi.fn(async () => undefined),
    createNotification: vi.fn(async () => ({ id: "notif-1" })),
    getOrCreateReportChatSession: vi.fn(async () => ({ id: "sess-1" })),
    insertChatMessage: vi.fn(async () => ({ id: "msg-1" })),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendReportEmailMock.mockResolvedValue({ status: "sent" });
});

// ---------------------------------------------------------------------------
// (a) Happy path — 3 canais quando tudo marca true
// ---------------------------------------------------------------------------
describe("EST-1 — deliverReport happy path (weekly, todos os canais marcam true)", () => {
  it("cria notif in-app com deepLink /coach-ai/relatorio/<id>", async () => {
    const deliverReport = await loadDeliver();
    const storage = makeStorage();
    await deliverReport({ reportId: "rep-1", userId: "USER-0001", reportType: "weekly" }, storage);

    expect(storage.createNotification).toHaveBeenCalledTimes(1);
    const notif = storage.createNotification.mock.calls[0][0];
    expect(notif.userId).toBe("USER-0001");
    expect(notif.type).toBe("coach_report");
    expect(notif.priority).toBe("medium");
    expect(notif.deepLink).toBe("/coach-ai/relatorio/rep-1");
    expect(typeof notif.title).toBe("string");
    expect(notif.title.length).toBeGreaterThan(0);
    expect(typeof notif.message).toBe("string");
  });

  it("posta no chat 1 mensagem role=assistant contendo o deep link", async () => {
    const deliverReport = await loadDeliver();
    const storage = makeStorage();
    await deliverReport({ reportId: "rep-1", userId: "USER-0001", reportType: "weekly" }, storage);

    expect(storage.getOrCreateReportChatSession).toHaveBeenCalledWith("USER-0001");
    expect(storage.insertChatMessage).toHaveBeenCalledTimes(1);
    const msg = storage.insertChatMessage.mock.calls[0][0];
    expect(msg.role).toBe("assistant");
    expect(msg.chatSessionId).toBe("sess-1");
    expect(msg.content).toContain("/coach-ai/relatorio/rep-1");
  });

  it("dispara sendReportEmail com kind report_weekly", async () => {
    const deliverReport = await loadDeliver();
    const storage = makeStorage();
    await deliverReport({ reportId: "rep-1", userId: "USER-0001", reportType: "weekly" }, storage);

    expect(sendReportEmailMock).toHaveBeenCalledTimes(1);
    const emailArgs = sendReportEmailMock.mock.calls[0][0];
    expect(emailArgs).toMatchObject({ reportId: "rep-1", userId: "USER-0001", kind: "report_weekly" });
  });

  it("marca claim de cada canal via markReportDelivered (inApp + chat)", async () => {
    const deliverReport = await loadDeliver();
    const storage = makeStorage();
    await deliverReport({ reportId: "rep-1", userId: "USER-0001", reportType: "weekly" }, storage);

    const channels = storage.markReportDelivered.mock.calls.map((c: any[]) => c[1]);
    expect(channels).toContain("inApp");
    expect(channels).toContain("chat");
  });
});

// ---------------------------------------------------------------------------
// (b) Idempotência — markReportDelivered false ⇒ não repete o efeito colateral
// ---------------------------------------------------------------------------
describe("EST-1 — idempotência (canal já entregue)", () => {
  it("inApp já marcado (mark→false) NÃO chama createNotification de novo", async () => {
    const deliverReport = await loadDeliver();
    const storage = makeStorage({
      markReportDelivered: vi.fn(async (_id: string, channel: string) =>
        channel === "inApp" ? false : true,
      ),
    });
    await deliverReport({ reportId: "rep-1", userId: "USER-0001", reportType: "weekly" }, storage);

    expect(storage.createNotification).not.toHaveBeenCalled();
    // chat ainda entrega (claim true)
    expect(storage.insertChatMessage).toHaveBeenCalledTimes(1);
  });

  it("chat já marcado (mark→false) NÃO posta segunda mensagem", async () => {
    const deliverReport = await loadDeliver();
    const storage = makeStorage({
      markReportDelivered: vi.fn(async (_id: string, channel: string) =>
        channel === "chat" ? false : true,
      ),
    });
    await deliverReport({ reportId: "rep-1", userId: "USER-0001", reportType: "weekly" }, storage);

    expect(storage.insertChatMessage).not.toHaveBeenCalled();
    expect(storage.getOrCreateReportChatSession).not.toHaveBeenCalled();
    expect(storage.createNotification).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// (c) Erro num canal não impede os outros + faz unmark (compensação)
// ---------------------------------------------------------------------------
describe("EST-1 — isolamento de falha (best-effort) + unmark", () => {
  it("createNotification lança → chat e email ainda são tentados", async () => {
    const deliverReport = await loadDeliver();
    const storage = makeStorage({
      createNotification: vi.fn(async () => {
        throw new Error("notif boom");
      }),
    });
    await deliverReport({ reportId: "rep-1", userId: "USER-0001", reportType: "weekly" }, storage);

    expect(storage.insertChatMessage).toHaveBeenCalledTimes(1);
    expect(sendReportEmailMock).toHaveBeenCalledTimes(1);
  });

  it("erro no in-app → unmark do canal inApp (libera claim p/ re-tentativa)", async () => {
    const deliverReport = await loadDeliver();
    const storage = makeStorage({
      createNotification: vi.fn(async () => {
        throw new Error("notif boom");
      }),
    });
    await deliverReport({ reportId: "rep-1", userId: "USER-0001", reportType: "weekly" }, storage);

    expect(storage.unmarkReportDelivered).toHaveBeenCalledWith("rep-1", "inApp");
  });

  it("erro no chat (insertChatMessage lança) → unmark do canal chat + in-app intacto", async () => {
    const deliverReport = await loadDeliver();
    const storage = makeStorage({
      insertChatMessage: vi.fn(async () => {
        throw new Error("chat boom");
      }),
    });
    await deliverReport({ reportId: "rep-1", userId: "USER-0001", reportType: "weekly" }, storage);

    expect(storage.unmarkReportDelivered).toHaveBeenCalledWith("rep-1", "chat");
    // in-app entregou e NÃO foi desmarcado
    expect(storage.createNotification).toHaveBeenCalledTimes(1);
    const unmarkedChannels = storage.unmarkReportDelivered.mock.calls.map((c: any[]) => c[1]);
    expect(unmarkedChannels).not.toContain("inApp");
  });
});

// ---------------------------------------------------------------------------
// (d) reportType='daily' NÃO chama sendReportEmail (daily não tem email)
// ---------------------------------------------------------------------------
describe("EST-1 — daily não tem email", () => {
  it("reportType=daily entrega in-app + chat mas NÃO chama sendReportEmail", async () => {
    const deliverReport = await loadDeliver();
    const storage = makeStorage();
    await deliverReport({ reportId: "rep-d", userId: "USER-0001", reportType: "daily" }, storage);

    expect(storage.createNotification).toHaveBeenCalledTimes(1);
    expect(storage.insertChatMessage).toHaveBeenCalledTimes(1);
    expect(sendReportEmailMock).not.toHaveBeenCalled();
  });

  it("conteúdo do chat daily usa template próprio (menciona debrief) com o deep link", async () => {
    const deliverReport = await loadDeliver();
    const storage = makeStorage();
    await deliverReport({ reportId: "rep-d", userId: "USER-0001", reportType: "daily" }, storage);

    const content = storage.insertChatMessage.mock.calls[0][0].content as string;
    expect(content).toContain("/coach-ai/relatorio/rep-d");
    expect(content.toLowerCase()).toContain("debrief");
  });
});

// ---------------------------------------------------------------------------
// (e) monthly → kind report_monthly
// ---------------------------------------------------------------------------
describe("EST-1 — monthly mapeia kind report_monthly", () => {
  it("reportType=monthly chama sendReportEmail com kind report_monthly", async () => {
    const deliverReport = await loadDeliver();
    const storage = makeStorage();
    await deliverReport({ reportId: "rep-m", userId: "USER-0001", reportType: "monthly" }, storage);

    expect(sendReportEmailMock).toHaveBeenCalledTimes(1);
    expect(sendReportEmailMock.mock.calls[0][0].kind).toBe("report_monthly");
  });
});

// ---------------------------------------------------------------------------
// (f) NUNCA lança — mesmo com storage explodindo em tudo
// ---------------------------------------------------------------------------
describe("EST-1 — deliverReport nunca lança (best-effort)", () => {
  it("storage que lança em todos os métodos não propaga exceção", async () => {
    const deliverReport = await loadDeliver();
    const boom = vi.fn(async () => {
      throw new Error("everything down");
    });
    const storage = makeStorage({
      markReportDelivered: boom,
      createNotification: boom,
      getOrCreateReportChatSession: boom,
      insertChatMessage: boom,
    });
    sendReportEmailMock.mockRejectedValue(new Error("email down"));

    await expect(
      deliverReport({ reportId: "rep-x", userId: "USER-0001", reportType: "weekly" }, storage),
    ).resolves.toBeUndefined();
  });

  it("sendReportEmail rejeitando não derruba deliverReport", async () => {
    const deliverReport = await loadDeliver();
    const storage = makeStorage();
    sendReportEmailMock.mockRejectedValue(new Error("smtp down"));

    await expect(
      deliverReport({ reportId: "rep-y", userId: "USER-0001", reportType: "weekly" }, storage),
    ).resolves.toBeUndefined();
    // in-app + chat ainda entregaram antes do email
    expect(storage.createNotification).toHaveBeenCalledTimes(1);
    expect(storage.insertChatMessage).toHaveBeenCalledTimes(1);
  });
});
