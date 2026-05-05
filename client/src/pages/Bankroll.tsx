/**
 * Bankroll — Pagina /bankroll (Bankroll-Reform 2026-05-05)
 *
 * Header: titulo "Banca" + count carteiras ativas (sem botoes de acao).
 * BankrollWidget: card "Banca atual" + ABI count + ABI configurado clickavel.
 * Layout 2-paineis: WalletList sidebar + WalletDetailPanel.
 *   - WalletList expoe "+ Nova carteira" (botao 5/5).
 *   - WalletDetailPanel expoe 4 botoes (Registrar movimento, Reportar saldo,
 *     Reportar rakeback, Transferir) + Editar/Arquivar secundarios.
 * BankrollHistoryTable: 10 ultimos + "Ver mais" expande.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { BankrollWidget } from "@/components/bankroll/BankrollWidget";
import { BankrollHistoryTable } from "@/components/bankroll/BankrollHistoryTable";
import { WalletList, type WalletListItem, type WalletSuggestion } from "@/components/bankroll/WalletList";
import { WalletDetailPanel } from "@/components/bankroll/WalletDetailPanel";
import { OverallWalletPanel } from "@/components/bankroll/OverallWalletPanel";
import { WalletCreateDialog } from "@/components/bankroll/WalletCreateDialog";
import { RakebackDialog } from "@/components/bankroll/RakebackDialog";
import { TransferDialog } from "@/components/bankroll/TransferDialog";
import { WalletTransactionDialog } from "@/components/bankroll/WalletTransactionDialog";
import { Wallet } from "lucide-react";
import type { WalletPlatform } from "@shared/wallet-platforms";

interface ConsolidatedWalletEntry {
  walletId: string;
  name: string;
  platform: string;
  nativeCurrency: string;
  balanceNative: string;
  balanceUSD?: string;
  fxRateUSDPerNative?: string;
  share?: number;
}

interface ConsolidatedResponse {
  totalUSD: string;
  walletCount: number;
  aggregationMode: "global" | "per_wallet";
  byWallet: ConsolidatedWalletEntry[];
}

export default function BankrollPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<
    { name?: string; platform?: WalletPlatform; nativeCurrency?: string } | undefined
  >(undefined);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);

  // Sprint Bankroll-3 (RF-04): RakebackDialog state. Source sempre 'wallet_menu'
  // pos-bankroll-reform (founder removeu botoes do header).
  const [rakebackDialogOpen, setRakebackDialogOpen] = useState(false);
  const [rakebackPreSelectedWalletId, setRakebackPreSelectedWalletId] = useState<
    string | undefined
  >(undefined);

  // Sprint Bankroll-3 (RF-04 wiring): TransferDialog state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferDefaultFromId, setTransferDefaultFromId] = useState<string | undefined>(
    undefined,
  );

  // Bankroll-Reform 2026-05-05 (LOW-7): single mount de WalletTransactionDialog.
  // mode=null -> fechado; 'movement' ou 'balance' aberto no respectivo modo.
  const [txDialogMode, setTxDialogMode] = useState<"movement" | "balance" | null>(null);

  const { data: consolidated } = useQuery<ConsolidatedResponse>({
    queryKey: ["/api/bankroll/consolidated"],
    // RF-04 (G4): apiRequest injeta CSRF, faz refresh+redirect em 401 e
    // ja retorna o JSON parseado (lanca Error se !ok internamente).
    queryFn: () => apiRequest("GET", "/api/bankroll/consolidated"),
    staleTime: 30_000,
  });

  const { data: walletsResp } = useQuery<{ wallets: any[] }>({
    queryKey: ["/api/wallets"],
    queryFn: () => apiRequest("GET", "/api/wallets?includeArchived=true"),
    staleTime: 30_000,
  });

  const walletItems: WalletListItem[] = useMemo(() => {
    const list = walletsResp?.wallets ?? [];
    const byId = new Map<string, ConsolidatedWalletEntry>();
    consolidated?.byWallet?.forEach((w) => byId.set(w.walletId, w));
    return list.map((w: any) => ({
      id: w.id,
      name: w.name,
      platform: w.platform,
      nativeCurrency: w.nativeCurrency,
      balance: w.balance,
      balanceUSD: byId.get(w.id)?.balanceUSD,
      status: w.status,
      color: w.color ?? null,
      displayOrder: w.displayOrder,
      isShotPocket: w.isShotPocket,
    }));
  }, [walletsResp, consolidated]);

  // Auto-selecionar "Geral" como default quando ha pelo menos 1 wallet.
  useEffect(() => {
    if (selectedWalletId == null && walletItems.length > 0) {
      setSelectedWalletId("__overall__");
    }
  }, [walletItems, selectedWalletId]);

  const isOverallSelected = selectedWalletId === "__overall__";
  const selectedWallet = isOverallSelected
    ? null
    : walletItems.find((w) => w.id === selectedWalletId) ?? null;
  const hasWallets = walletItems.length > 0;

  function handleCreateClick(suggestion?: WalletSuggestion) {
    setCreatePrefill(
      suggestion
        ? { name: suggestion.name, platform: suggestion.platform, nativeCurrency: suggestion.nativeCurrency }
        : undefined,
    );
    setCreateDialogOpen(true);
  }

  function openRakebackForWallet(walletId: string) {
    setRakebackPreSelectedWalletId(walletId);
    setRakebackDialogOpen(true);
  }

  function openTransferDialog(fromWalletId?: string) {
    setTransferDefaultFromId(fromWalletId);
    setTransferDialogOpen(true);
  }

  // Filtra apenas wallets ativas para transferencia (TransferDialog rejeita
  // wallets archived no backend, mas a UI nao deve oferecer a opcao).
  const transferableWallets = useMemo(
    () => walletItems.filter((w) => w.status === "active"),
    [walletItems],
  );
  const canTransfer = transferableWallets.length >= 2;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <header className="flex items-center gap-3 rounded-lg border bg-card p-5">
        <div className="h-10 w-10 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
          <Wallet className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Banca</h1>
          <p className="text-xs text-muted-foreground">
            {hasWallets
              ? `${consolidated?.walletCount ?? walletItems.filter((w) => w.status === "active").length} carteira(s) ativa(s)`
              : "Configuracao inicial — adicione sua primeira carteira"}
          </p>
        </div>
      </header>

      <BankrollWidget />

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex flex-col md:flex-row min-h-[400px]">
          <WalletList
            wallets={walletItems}
            selectedWalletId={selectedWalletId}
            onSelect={setSelectedWalletId}
            onCreateClick={handleCreateClick}
          />
          <div className="flex-1">
            {isOverallSelected ? (
              <OverallWalletPanel wallets={walletItems as any} />
            ) : selectedWallet ? (
              <WalletDetailPanel
                wallet={selectedWallet as any}
                onRakebackClick={() => openRakebackForWallet(selectedWallet.id)}
                onRegisterMovementClick={() => setTxDialogMode("movement")}
                onReportBalanceClick={() => setTxDialogMode("balance")}
                onTransferClick={() => openTransferDialog(selectedWallet.id)}
                canTransfer={canTransfer}
              />
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {hasWallets
                  ? "Selecione uma carteira a esquerda."
                  : "Crie sua primeira carteira para comecar."}
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold mb-3">Historico consolidado</h2>
        <BankrollHistoryTable />
      </section>

      <WalletCreateDialog
        open={createDialogOpen}
        onOpenChange={(o) => {
          setCreateDialogOpen(o);
          if (!o) setCreatePrefill(undefined);
        }}
        prefill={createPrefill}
      />
      <RakebackDialog
        open={rakebackDialogOpen}
        onOpenChange={setRakebackDialogOpen}
        wallets={walletItems as any}
        preSelectedWalletId={rakebackPreSelectedWalletId}
        source="wallet_menu"
      />
      <TransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        wallets={transferableWallets as any}
        defaultFromWalletId={transferDefaultFromId}
      />
      {/* Bankroll-Reform 2026-05-05 (LOW-7): unico dialog de transaction
          montado para a wallet selecionada. mode controla aba inicial.
          modo balance standalone (sem sessionId) auto-deriva reason='manual_report'. */}
      {txDialogMode != null && selectedWallet && (
        <WalletTransactionDialog
          open={txDialogMode != null}
          onOpenChange={(o) => {
            if (!o) setTxDialogMode(null);
          }}
          wallet={selectedWallet as any}
          initialMode={txDialogMode}
        />
      )}
    </div>
  );
}
