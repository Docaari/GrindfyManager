// =============================================================================
// Wave 2 (#1 + #2) — loop de acao dos relatorios + aha moment do onboarding.
//
// #1: GET /api/coach/timeline inclui top-2 CTAs do relatorio (acionaveis direto).
// #2: POST /api/coach/onboarding/complete cria 1a sessao de chat + insight + retorna chatSessionId.
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import { handleGetCoachTimeline } from "../../../server/routes/coachAi1b";
import { handleCompleteOnboarding } from "../../../server/routes/coachAi1a";

function mockRes() {
  const res: any = { statusCode: 0, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  return res;
}

describe("#1 — timeline expoe CTAs do relatorio", () => {
  it("report item carrega top-2 ctas de content.cta", async () => {
    const report = {
      id: "rep-1",
      reportType: "weekly",
      periodStart: "2026-05-19",
      periodEnd: "2026-05-25",
      status: "ready",
      generatedAt: "2026-05-26T07:00:00.000Z",
      content: {
        header: { summaryLine: "Semana ok." },
        cta: [
          { kind: "tool", label: "Registrar leak PKO", toolName: "log_leak_focus" },
          { kind: "link", label: "Agendar estudo", href: "/estudos" },
          { kind: "link", label: "Terceiro (deve sair)", href: "/x" },
        ],
      },
    };
    const storage = {
      listReportsForUser: vi.fn(async () => [report]),
      listNudgeLogForUser: vi.fn(async () => []),
    };
    const req: any = { user: { userPlatformId: "USER-1" }, query: {} };
    const res = mockRes();
    await handleGetCoachTimeline(req, res, storage);
    expect(res.statusCode).toBe(200);
    const item = res.body.items.find((i: any) => i.kind === "report");
    expect(item).toBeTruthy();
    expect(Array.isArray(item.ctas)).toBe(true);
    expect(item.ctas.length).toBe(2); // top-2
    expect(item.ctas[0].toolName).toBe("log_leak_focus");
    expect(item.ctas[1].href).toBe("/estudos");
  });

  it("report sem cta -> ctas:[] (sem crash)", async () => {
    const storage = {
      listReportsForUser: vi.fn(async () => [{ id: "r2", reportType: "daily", periodStart: "d", periodEnd: "d", status: "ready", content: {} }]),
      listNudgeLogForUser: vi.fn(async () => []),
    };
    const req: any = { user: { userPlatformId: "USER-1" }, query: {} };
    const res = mockRes();
    await handleGetCoachTimeline(req, res, storage);
    const item = res.body.items.find((i: any) => i.kind === "report");
    expect(item.ctas).toEqual([]);
  });
});

describe("#2 — onboarding complete cria 1o insight", () => {
  function makeOnboardingStorage() {
    const profileState: any = {};
    const calls: any = { messages: [], sessions: [] };
    return {
      calls,
      updateAiStructuredProfile: vi.fn(async (_uid: string, patch: any) => {
        Object.assign(profileState, patch);
        return { ...profileState };
      }),
      upsertCoachPreferences: vi.fn(async (_uid: string, patch: any) => ({ ...patch })),
      createChatSession: vi.fn(async (input: any) => {
        calls.sessions.push(input);
        return { id: "sess-new" };
      }),
      insertChatMessage: vi.fn(async (input: any) => {
        calls.messages.push(input);
        return { id: "msg-1" };
      }),
    };
  }

  it("grava perfil, cria sessao+mensagem assistant e retorna chatSessionId", async () => {
    const storage = makeOnboardingStorage();
    const req: any = {
      user: { userPlatformId: "USER-1" },
      body: {
        tomPreferido: "balanced",
        focoDoMes: "PKO de buy-in alto",
        metas: [{ texto: "subir de stake", prazo: "mes" }],
        nivel: "mid_consistente",
      },
    };
    const res = mockRes();
    await handleCompleteOnboarding(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body.chatSessionId).toBe("sess-new");
    expect(storage.createChatSession).toHaveBeenCalledTimes(1);
    expect(storage.calls.messages.length).toBe(1);
    const msg = storage.calls.messages[0];
    expect(msg.role).toBe("assistant");
    // insight referencia foco + oferece acao (leaks).
    expect(msg.content).toMatch(/PKO/);
    expect(msg.content.toLowerCase()).toMatch(/leaks/);
  });

  it("falha ao criar chat NAO derruba o onboarding (chatSessionId=null, 200)", async () => {
    const storage = makeOnboardingStorage();
    storage.createChatSession = vi.fn(async () => { throw new Error("db down"); });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req: any = {
      user: { userPlatformId: "USER-1" },
      body: { tomPreferido: "direct" },
    };
    const res = mockRes();
    await handleCompleteOnboarding(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body.chatSessionId).toBeNull();
    expect(res.body.structuredProfile).toBeTruthy();
    errSpy.mockRestore();
  });
});
