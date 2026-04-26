/**
 * WalletDetailPanel — Detalhe da wallet selecionada (RF-12).
 *
 * Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md
 * Header: nome + plataforma + balance grande.
 * Tabs: "Movimentos" (lista paginada) | "Configuracao" (edit/archive).
 */
import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { WalletTransactionDialog } from "./WalletTransactionDialog";
import { WalletEditDialog } from "./WalletEditDialog";

interface WalletProp {
  id: string;
  name: string;
  platform: string;
  nativeCurrency: string;
  balance: string;
  status: "active" | "archived";
  bankrollRule?: string | null;
  color?: string | null;
  displayOrder?: number;
  isShotPocket?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface Props {
  wallet: WalletProp;
  // Sprint Bankroll-3 (RF-04): callback do parent para abrir RakebackDialog
  // com wallet pre-selecionada (source='wallet_menu').
  onRakebackClick?: () => void;
}

function currencySymbol(ccy: string): string {
  if (ccy === "USD") return "$";
  if (ccy === "BRL") return "R$";
  if (ccy === "EUR") return "€";
  if (ccy === "GBP") return "£";
  return ccy;
}

function formatBalance(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function WalletDetailPanel({ wallet, onRakebackClick }: Props) {
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const archived = wallet.status === "archived";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  async function handleArchiveSubmit() {
    if (archiving) return;
    setArchiving(true);
    try {
      await apiRequest("PATCH", `/api/wallets/${wallet.id}/archive`);
      await queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      await queryClient.invalidateQueries({ queryKey: [`/api/wallets/${wallet.id}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/bankroll/consolidated"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/bankroll"] });
      setArchiveConfirmOpen(false);
      toast({ title: "Carteira arquivada", description: wallet.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao arquivar carteira";
      toast({ title: "Erro", description: message, variant: "destructive" });
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div data-testid="wallet-detail-panel" className="flex-1 p-4 space-y-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold">{wallet.name}</h1>
          <p className="text-sm text-muted-foreground">{wallet.platform}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold">
            {currencySymbol(wallet.nativeCurrency)} {formatBalance(wallet.balance)}
          </div>
          <div className="text-xs text-muted-foreground">{wallet.nativeCurrency}</div>
        </div>
      </header>

      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="wallet-detail-record-tx-button"
          onClick={() => setTxDialogOpen(true)}
          disabled={archived}
          className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Registrar movimento
        </button>
        <button
          type="button"
          data-testid="wallet-detail-edit-button"
          onClick={() => setEditDialogOpen(true)}
          disabled={archived}
          className="px-3 py-2 text-sm rounded-md border hover:bg-accent disabled:opacity-50"
        >
          Editar
        </button>
        <button
          type="button"
          data-testid="wallet-detail-archive-button"
          onClick={() => setArchiveConfirmOpen(true)}
          disabled={archived}
          className="px-3 py-2 text-sm rounded-md border hover:bg-accent disabled:opacity-50"
        >
          Arquivar
        </button>
        {onRakebackClick && (
          <button
            type="button"
            data-testid="wallet-detail-rakeback-trigger"
            onClick={onRakebackClick}
            disabled={archived}
            className="px-3 py-2 text-sm rounded-md border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            title="Reportar rakeback recebido nesta carteira"
          >
            Reportar rakeback
          </button>
        )}
      </div>

      {archived && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Esta carteira esta arquivada. Movimentos novos nao sao aceitos.
        </div>
      )}

      <div className="border rounded-md p-4 text-sm text-muted-foreground">
        Lista de movimentos sera renderizada aqui (WalletTransactionsTable).
      </div>

      {txDialogOpen && (
        <WalletTransactionDialog
          open={txDialogOpen}
          onOpenChange={setTxDialogOpen}
          wallet={wallet as any}
        />
      )}
      {editDialogOpen && (
        <WalletEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          wallet={wallet as any}
        />
      )}
      {archiveConfirmOpen && (
        <ArchiveConfirmDialog
          wallet={wallet}
          onCancel={() => setArchiveConfirmOpen(false)}
          onConfirm={handleArchiveSubmit}
          submitting={archiving}
        />
      )}
    </div>
  );
}

function ArchiveConfirmDialog({
  wallet,
  onCancel,
  onConfirm,
  submitting,
}: {
  wallet: WalletProp;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const balance = parseFloat(wallet.balance);
  const hasBalance = Number.isFinite(balance) && balance > 0;
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div
      data-testid="wallet-archive-confirm"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-background rounded-lg border shadow-lg p-6 space-y-3 max-w-md">
        <h3 className="text-lg font-semibold">Arquivar carteira?</h3>
        <p className="text-sm text-muted-foreground">
          Carteira ficara visivel apenas em modo arquivado. Historico preservado.
        </p>
        {hasBalance && (
          // QW-F: warning explicito quando ha saldo + checkbox "entendi"
          <div
            data-testid="wallet-archive-balance-warning"
            className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2"
          >
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Esta carteira ainda tem saldo:
              <strong className="ml-1">
                {currencySymbol(wallet.nativeCurrency)} {formatBalance(wallet.balance)}
              </strong>
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Movimente o saldo antes de arquivar para nao perder visibilidade
              do dinheiro na banca consolidada.
            </p>
            <label className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200 cursor-pointer">
              <input
                type="checkbox"
                data-testid="wallet-archive-acknowledge"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              Confirmo que entendi
            </label>
          </div>
        )}
        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            data-testid="wallet-archive-confirm-cancel"
            onClick={onCancel}
            className="px-3 py-2 text-sm rounded-md border hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="wallet-archive-confirm-submit"
            onClick={onConfirm}
            disabled={submitting || (hasBalance && !acknowledged)}
            className="px-3 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Arquivando..." : "Arquivar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WalletDetailPanel;
