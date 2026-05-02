// =============================================================================
// recordWalletTransactionTool — Sprint Coach-2B / RF-02 (write tool)
//
// Reusa walletService.recordWalletTransaction (lesson #194 — externalTx).
// Undo cria reverse-row (delta inverso), NUNCA hard-delete (ADR-058).
// =============================================================================

import { z } from "zod";
import { storage } from "../../storage";
import { walletService } from "../../services/walletService";
import { WALLET_TX_REASONS_P0 } from "@shared/wallet-reasons";

export const recordWalletTransactionInputSchema = z.object({
  walletId: z.string(),
  amount: z.number().positive(),
  currency: z.enum(["USD", "BRL", "EUR", "CNY"]),
  type: z.enum(["deposit", "withdrawal", "rakeback", "manual_adjustment"]),
  reason: z.enum(WALLET_TX_REASONS_P0),
  occurredAt: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export type RecordWalletTransactionInput = z.infer<
  typeof recordWalletTransactionInputSchema
>;

const DIRECTION_BY_TYPE: Record<RecordWalletTransactionInput["type"], "in" | "out"> = {
  deposit: "in",
  rakeback: "in",
  manual_adjustment: "in",
  withdrawal: "out",
};

async function fetchPayloadBefore(
  input: RecordWalletTransactionInput,
  ctx: { userId: string },
  _tx: any,
): Promise<any> {
  const wallet = await (storage as any).getWallet(ctx.userId, input.walletId)
    ?? await (storage as any).getWallet(input.walletId);
  return {
    walletId: input.walletId,
    walletBalanceNative: wallet ? Number(wallet.balanceNative ?? 0) : null,
    walletBalanceUSD: wallet ? Number(wallet.balanceUSD ?? wallet.balanceNative ?? 0) : null,
    nativeCurrency: wallet?.nativeCurrency ?? null,
  };
}

async function executeConfirmed(
  input: RecordWalletTransactionInput,
  ctx: { userId: string; actionId?: string },
  txClient: any,
): Promise<{
  payloadAfter: any;
  affectedEntityType: string;
  affectedEntityId: string;
  output: any;
}> {
  const wallet = await (storage as any).getWallet(ctx.userId, input.walletId)
    ?? await (storage as any).getWallet(input.walletId);
  if (!wallet) {
    throw new Error("wallet_not_found");
  }
  if (wallet.userId !== ctx.userId) {
    throw new Error("wallet_not_owned");
  }
  if (wallet.isActive === false || wallet.status === "archived") {
    throw new Error("wallet_inactive");
  }
  if (wallet.nativeCurrency && wallet.nativeCurrency !== input.currency) {
    throw new Error("currency_mismatch");
  }
  const direction = DIRECTION_BY_TYPE[input.type];
  if (
    direction === "out" &&
    Number(wallet.balanceNative ?? 0) < Number(input.amount)
  ) {
    throw new Error("insufficient_balance");
  }

  const result = await (walletService as any).recordWalletTransaction(
    ctx.userId,
    input.walletId,
    {
      direction,
      nativeAmount: input.amount,
      reason: input.reason,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      note: input.notes,
    },
    txClient,
  );

  const balanceBefore = Number(wallet.balanceNative ?? 0);
  const newBalanceNative = Number(result?.wallet?.balanceNative ?? 0);
  const delta = direction === "in" ? Number(input.amount) : -Number(input.amount);

  return {
    payloadAfter: {
      walletId: input.walletId,
      walletBalanceNative: newBalanceNative,
      walletBalanceUSD: Number(result?.wallet?.balanceUSD ?? newBalanceNative),
      delta,
      transactionId: result?.transaction?.id,
    },
    affectedEntityType: "wallet_transaction",
    affectedEntityId: result?.transaction?.id,
    output: {
      transactionId: result?.transaction?.id,
      walletId: input.walletId,
      walletName: wallet.name,
      newBalanceNative,
      newBalanceUSD: Number(result?.wallet?.balanceUSD ?? newBalanceNative),
      message: `Transacao ${input.type} de ${input.amount} ${input.currency} registrada.`,
      balanceBefore,
    },
  };
}

async function undo(
  payloadBefore: any,
  payloadAfter: any,
  ctx: { userId: string; actionId?: string },
  txClient: any,
): Promise<{ reversedEntityType: string; reversedEntityId?: string }> {
  const delta = Number(payloadAfter?.delta ?? 0);
  if (!delta || !payloadAfter?.walletId) {
    throw new Error("undo_invalid_payload");
  }
  const direction = delta > 0 ? "out" : "in";
  const amount = Math.abs(delta);

  const result = await (walletService as any).recordWalletTransaction(
    ctx.userId,
    payloadAfter.walletId,
    {
      direction,
      nativeAmount: amount,
      reason: "manual_adjustment",
      occurredAt: new Date(),
      note: ctx.actionId ? `Desfeito via Coach action ${ctx.actionId}` : "Desfeito via Coach action",
    },
    txClient,
  );

  return {
    reversedEntityType: "wallet_transaction",
    reversedEntityId: result?.transaction?.id,
  };
}

export const recordWalletTransactionTool = {
  name: "record_wallet_transaction",
  description:
    "Registra uma transacao financeira em uma das wallets do usuario. Sempre confirme antes.",
  inputSchema: recordWalletTransactionInputSchema,
  requiresConfirmation: true as const,
  auditLevel: "persist" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  fetchPayloadBefore,
  executeConfirmed,
  undo,
  handler: async () => {
    throw new Error("write_tool_use_executeConfirmed");
  },
};
