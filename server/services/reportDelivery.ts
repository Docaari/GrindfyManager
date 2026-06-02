// =============================================================================
// reportDelivery — Sprint EST-1 (ADR-223 §Decisão 5 + 6) — RF-03/04/07.
//
// Orquestra a ENTREGA TRIPLA de um relatório (weekly/daily/monthly):
//   in-app → chat → email. Cada canal em try/catch isolado; best-effort, NUNCA
//   lança (lesson #9 — log antes de qualquer fallback).
//
//   - in-app: claim atômico markReportDelivered(reportId,'inApp') → createNotification.
//             em erro → log + unmarkReportDelivered (libera re-tentativa).
//   - chat:   claim markReportDelivered(reportId,'chat') → getOrCreateReportChatSession
//             + insertChatMessage (role=assistant, template PT-BR por tipo).
//             em erro → log + unmark.
//   - email:  só weekly/monthly → sendReportEmail (idempotência própria via email_log;
//             NÃO faz unmark — o email_log é a barreira real). daily não tem email.
//             quarterly NÃO é tratado aqui (fica no AI-2B).
//
// O gating de elegibilidade/opt-in é responsabilidade do reportJobRunner (upstream);
// aqui o foco é a orquestração dos canais (lesson #34 — injectedStorage por composição).
// =============================================================================

import { sendReportEmail } from "./reportEmailSender";

// Coach AI UX Overhaul (Wave 3 / GAP-quarterly) — quarterly entra na entrega
// tripla (antes recebia SO email via reportJobRunner; faltava in-app + chat).
type ReportType = "weekly" | "daily" | "monthly" | "quarterly";

const DEEP_LINK_PREFIX = "/coach-ai/relatorio/";

function deepLink(reportId: string): string {
  return `${DEEP_LINK_PREFIX}${reportId}`;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Template PT-BR da notificação in-app por tipo de relatório.
const NOTIF_TEMPLATES: Record<ReportType, { title: string; message: string }> = {
  daily: {
    title: "Seu debrief de hoje está pronto",
    message: "Fechei o resumo da sua sessão de hoje. Confira no Coach AI.",
  },
  monthly: {
    title: "Seu relatório mensal está pronto",
    message: "A retrospectiva do mês chegou. Abra no Coach AI.",
  },
  weekly: {
    title: "Seu relatório semanal está pronto",
    message: "Terminei seus números da semana e os próximos passos. Veja no Coach AI.",
  },
  quarterly: {
    title: "Sua revisão trimestral está pronta",
    message: "Fechei a revisão de carreira do trimestre. Abra no Coach AI.",
  },
};

// Template PT-BR da mensagem de chat por tipo (recebe o deep link já montado).
const CHAT_TEMPLATES: Record<ReportType, (link: string) => string> = {
  daily: (link) => `Fechei seu debrief de hoje — confira o resumo da sessão em ${link}`,
  monthly: (link) => `Seu relatório mensal está pronto — abra a retrospectiva do mês em ${link}`,
  weekly: (link) =>
    `Terminei seu relatório semanal — veja seus números da semana e os próximos passos em ${link}`,
  quarterly: (link) =>
    `Sua revisão trimestral de carreira está pronta — abra em ${link}`,
};

const EMAIL_KIND_BY_TYPE: Record<
  ReportType,
  "report_weekly" | "report_monthly" | "report_quarterly" | null
> = {
  weekly: "report_weekly",
  monthly: "report_monthly",
  quarterly: "report_quarterly",
  daily: null, // daily não tem email
};

// Canal best-effort com claim atômico: marca → executa → em erro desmarca (libera
// re-tentativa). Cada etapa isolada; nunca lança. Compartilhado por in-app e chat.
async function deliverChannel(
  storage: any,
  reportId: string,
  userId: string,
  channel: "inApp" | "chat",
  act: () => Promise<void>,
): Promise<void> {
  try {
    const claimed = await storage.markReportDelivered(reportId, channel);
    if (!claimed) return;
    try {
      await act();
    } catch (err) {
      console.error(`reportDelivery.${channel}.error`, { reportId, userId, err: errMessage(err) });
      try {
        await storage.unmarkReportDelivered(reportId, channel);
      } catch (unmarkErr) {
        console.error(`reportDelivery.${channel}.unmark.error`, { reportId, err: unmarkErr });
      }
    }
  } catch (err) {
    console.error(`reportDelivery.${channel}.claim.error`, {
      reportId,
      userId,
      err: errMessage(err),
    });
  }
}

export async function deliverReport(
  args: { reportId: string; userId: string; reportType: ReportType },
  injectedStorage?: any,
): Promise<void> {
  const { reportId, userId, reportType } = args;
  const storage = injectedStorage ?? (await import("../storage")).storage;

  // --- Canal 1: in-app -------------------------------------------------------
  await deliverChannel(storage, reportId, userId, "inApp", async () => {
    const { title, message } = NOTIF_TEMPLATES[reportType];
    await storage.createNotification({
      userId,
      type: "coach_report",
      title,
      message,
      priority: "medium",
      deepLink: deepLink(reportId),
    });
  });

  // --- Canal 2: chat ---------------------------------------------------------
  await deliverChannel(storage, reportId, userId, "chat", async () => {
    const session = await storage.getOrCreateReportChatSession(userId);
    await storage.insertChatMessage({
      chatSessionId: session.id,
      role: "assistant",
      content: CHAT_TEMPLATES[reportType](deepLink(reportId)),
    });
  });

  // --- Canal 3: email (só weekly/monthly; daily não tem email) ---------------
  const emailKind = EMAIL_KIND_BY_TYPE[reportType];
  if (emailKind) {
    try {
      const result: any = await sendReportEmail({ reportId, userId, kind: emailKind }, storage);
      // Ledger best-effort (observabilidade — NÃO é barreira; a idempotência real do
      // email é o email_log). Só marca no caminho de sucesso real ('sent').
      if (result?.status === "sent") {
        try {
          await storage.markReportDelivered(reportId, "email");
        } catch {
          /* nunca lança — ledger é só observabilidade */
        }
      }
    } catch (err) {
      // email tem idempotência própria via email_log — NÃO faz unmark.
      console.error("reportDelivery.email.error", { reportId, userId, err: errMessage(err) });
    }
  }
}
