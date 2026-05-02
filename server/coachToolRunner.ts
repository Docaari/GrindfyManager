// =============================================================================
// Coach Tool Runner — Sprint Coach-2B / RF-01 (ADR-083)
//
// Orquestra confirm/cancel/undo de write tools. Usa transaction unica
// (lesson #194) — ownership do commit/rollback fica aqui, NUNCA em handler.
//
// 4 funcoes publicas:
//   - confirmCoachAction(actionId, ctx, user)
//   - cancelCoachAction(actionId, user)
//   - undoCoachAction(actionId, ctx, user)
//   - getCoachActionForUser(actionId, user)
// =============================================================================

import { storage } from "./storage";
import { getTool } from "./coachTools/registry";

const UNDO_WINDOW_MS = 5 * 60 * 1000; // 5 minutos (ADR-083)

export interface CoachActionUserContext {
  userPlatformId: string;
}

export interface CoachActionToolContext {
  userId: string;
  chatSessionId?: string;
  messageId?: string;
  actionId: string;
}

export type ConfirmResult =
  | {
      ok: true;
      action: any;
      payloadAfter: any;
      affectedEntityType: string;
      affectedEntityId: string;
      undoExpiresAt: Date;
    }
  | {
      ok: false;
      status: number;
      code: string;
      details?: any;
    };

export type CancelResult =
  | { ok: true }
  | { ok: false; status: number; code: string };

export type UndoResult =
  | { ok: true; reversedEntityType?: string; reversedEntityId?: string }
  | { ok: false; status: number; code: string };

// ---------------------------------------------------------------------------

export async function confirmCoachAction(
  actionId: string,
  user: CoachActionUserContext,
): Promise<ConfirmResult> {
  const action = await (storage as any).getCoachAction(actionId);
  if (!action) return { ok: false, status: 404, code: "not_found" };
  if (action.userId !== user.userPlatformId) {
    return { ok: false, status: 403, code: "forbidden" };
  }

  if (action.status === "completed" || action.status === "executing") {
    // executing = race: outro confirm ja esta processando.
    return { ok: false, status: 409, code: "already_confirmed" };
  }
  if (action.status === "expired" || action.status === "cancelled") {
    return { ok: false, status: 409, code: "expired" };
  }
  if (action.status === "undone") {
    return { ok: false, status: 409, code: "already_undone" };
  }
  if (action.status !== "pending") {
    return { ok: false, status: 409, code: "already_confirmed" };
  }

  const tool: any = getTool(action.toolName);
  if (!tool) {
    return { ok: false, status: 422, code: "tool_not_registered" };
  }

  const ctx: CoachActionToolContext = {
    userId: user.userPlatformId,
    chatSessionId: action.chatSessionId,
    messageId: action.messageId,
    actionId,
  };

  try {
    const result = await (storage as any).transaction(async (txClient: any) => {
      // Race condition real (Postgres FOR UPDATE):
      // Em producao, txClient.__rawTx eh o drizzle tx; usamos ele para
      // SELECT ... FOR UPDATE atomico antes de mutar. Em testes (mock sem
      // __rawTx), pulamos a re-checagem (mock ja simula lock via fila).
      const isProdTx =
        process.env.NODE_ENV !== "test" &&
        txClient &&
        typeof txClient === "object" &&
        "__rawTx" in txClient;
      if (isProdTx) {
        const rawTx: any = txClient.__rawTx;
        // SELECT FOR UPDATE — segura row contra outro confirm paralelo.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { sql } = require("drizzle-orm");
        const lockedRows = await rawTx.execute(
          sql`SELECT id, status FROM coach_actions WHERE id = ${actionId} FOR UPDATE`,
        );
        const fresh = Array.isArray(lockedRows)
          ? lockedRows[0]
          : (lockedRows?.rows?.[0] ?? lockedRows);
        if (!fresh || fresh.status !== "pending") {
          const err: any = new Error("status_changed");
          err.code = "already_confirmed";
          throw err;
        }
      }
      await (storage as any).updateCoachAction(
        actionId,
        { status: "executing" },
        { tx: txClient },
      );
      const payloadBefore =
        typeof tool.fetchPayloadBefore === "function"
          ? await tool.fetchPayloadBefore(action.input, ctx, txClient)
          : null;
      await (storage as any).updateCoachAction(
        actionId,
        { payloadBefore },
        { tx: txClient },
      );
      const out = await tool.executeConfirmed(action.input, ctx, txClient);
      const confirmedAt = new Date();
      const undoExpiresAt = new Date(confirmedAt.getTime() + UNDO_WINDOW_MS);
      await (storage as any).updateCoachAction(
        actionId,
        {
          payloadAfter: out.payloadAfter,
          affectedEntityType: out.affectedEntityType,
          affectedEntityId: out.affectedEntityId,
          status: "completed",
          confirmedAt,
          undoExpiresAt,
          result: out.output ?? null,
        },
        { tx: txClient },
      );
      return {
        payloadAfter: out.payloadAfter,
        affectedEntityType: out.affectedEntityType,
        affectedEntityId: out.affectedEntityId,
        undoExpiresAt,
      };
    });
    const updatedAction = await (storage as any).getCoachAction(actionId);
    return {
      ok: true,
      action: updatedAction ?? action,
      payloadAfter: result.payloadAfter,
      affectedEntityType: result.affectedEntityType,
      affectedEntityId: result.affectedEntityId,
      undoExpiresAt: result.undoExpiresAt,
    };
  } catch (err: any) {
    if (err && err.code === "already_confirmed") {
      return { ok: false, status: 409, code: "already_confirmed" };
    }
    console.error("coach.tool.confirm.error", { actionId, err });
    try {
      await (storage as any).updateCoachAction(actionId, {
        status: "failed",
        errorMessage: err?.message || "execution_failed",
      });
    } catch (logErr) {
      console.error("coach.tool.confirm.update_failed_status_failed", { logErr });
    }
    return {
      ok: false,
      status: 422,
      code: "execution_failed",
      details: err?.message,
    };
  }
}

export async function cancelCoachAction(
  actionId: string,
  user: CoachActionUserContext,
): Promise<CancelResult> {
  const action = await (storage as any).getCoachAction(actionId);
  if (!action) return { ok: false, status: 404, code: "not_found" };
  if (action.userId !== user.userPlatformId) {
    return { ok: false, status: 403, code: "forbidden" };
  }
  if (action.status !== "pending") {
    return { ok: false, status: 409, code: action.status };
  }
  await (storage as any).updateCoachAction(actionId, { status: "expired" });
  return { ok: true };
}

export async function undoCoachAction(
  actionId: string,
  user: CoachActionUserContext,
): Promise<UndoResult> {
  const action = await (storage as any).getCoachAction(actionId);
  if (!action) return { ok: false, status: 404, code: "not_found" };
  if (action.userId !== user.userPlatformId) {
    return { ok: false, status: 403, code: "forbidden" };
  }
  if (action.status === "undone") {
    return { ok: false, status: 409, code: "already_undone" };
  }
  if (action.status !== "completed") {
    return { ok: false, status: 409, code: action.status };
  }
  if (action.undoExpiresAt && new Date(action.undoExpiresAt).getTime() <= Date.now()) {
    return { ok: false, status: 410, code: "undo_window_expired" };
  }

  const tool: any = getTool(action.toolName);
  if (!tool || typeof tool.undo !== "function") {
    return { ok: false, status: 422, code: "tool_not_undoable" };
  }

  const ctx: CoachActionToolContext = {
    userId: user.userPlatformId,
    chatSessionId: action.chatSessionId,
    messageId: action.messageId,
    actionId,
  };

  try {
    const reversed = await (storage as any).transaction(async (txClient: any) => {
      // Race condition real: SELECT FOR UPDATE para evitar 2 undos paralelos.
      const isProdTx =
        process.env.NODE_ENV !== "test" &&
        txClient &&
        typeof txClient === "object" &&
        "__rawTx" in txClient;
      if (isProdTx) {
        const rawTx: any = txClient.__rawTx;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { sql } = require("drizzle-orm");
        const lockedRows = await rawTx.execute(
          sql`SELECT id, status, undo_expires_at FROM coach_actions WHERE id = ${actionId} FOR UPDATE`,
        );
        const fresh = Array.isArray(lockedRows)
          ? lockedRows[0]
          : (lockedRows?.rows?.[0] ?? lockedRows);
        if (!fresh || fresh.status !== "completed") {
          const err: any = new Error("status_changed");
          err.code = "already_undone";
          throw err;
        }
        const expiresAt = fresh.undo_expires_at ?? fresh.undoExpiresAt;
        if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
          const err: any = new Error("undo_window_expired");
          err.code = "undo_window_expired";
          throw err;
        }
      }
      const out = await tool.undo(
        action.payloadBefore,
        action.payloadAfter,
        ctx,
        txClient,
      );
      await (storage as any).updateCoachAction(
        actionId,
        { status: "undone", undoneAt: new Date() },
        { tx: txClient },
      );
      return out || {};
    });
    return {
      ok: true,
      reversedEntityType: reversed?.reversedEntityType,
      reversedEntityId: reversed?.reversedEntityId,
    };
  } catch (err: any) {
    console.error("coach.tool.undo.error", { actionId, err });
    return {
      ok: false,
      status: 422,
      code: "undo_failed",
    };
  }
}

export async function getCoachActionForUser(
  actionId: string,
  user: CoachActionUserContext,
): Promise<{ ok: true; action: any } | { ok: false; status: number; code: string }> {
  const action = await (storage as any).getCoachAction(actionId);
  if (!action) return { ok: false, status: 404, code: "not_found" };
  if (action.userId !== user.userPlatformId) {
    return { ok: false, status: 403, code: "forbidden" };
  }
  return { ok: true, action };
}
