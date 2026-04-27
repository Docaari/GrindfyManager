/**
 * Bankroll — Pagina /bankroll v2 (RF-11/RF-12)
 *
 * Layout 2-paineis: WalletList (sidebar) + WalletDetailPanel (detalhe).
 * Fallback: usuario sem wallets v ainda usa stack v1 (BankrollWidget +
 * BankrollHistoryTable + BankrollMovementDialog).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BankrollWidget } from "@/components/bankroll/BankrollWidget";
import { BankrollHistoryTable } from "@/components/bankroll/BankrollHistoryTable";
import { BankrollMovementDialog } from "@/components/bankroll/BankrollMovementDialog";
import { WalletList, type WalletListItem, type WalletSuggestion } from "@/components/bankroll/WalletList";
import { WalletDetailPanel } from "@/components/bankroll/WalletDetailPanel";
import { WalletCreateDialog } from "@/components/bankroll/WalletCreateDialog";
import { RakebackDialog } from "@/components/bankroll/RakebackDialog";
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
  const [legacyDialogOpen, setLegacyDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<
    { name?: string; platform?: WalletPlatform; nativeCurrency?: string } | undefined
  >(undefined);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);

  // Sprint Bankroll-3 (RF-04): RakebackDialog state
  const [rakebackDialogOpen, setRakebackDialogOpen] = useState(false);
  const [rakebackSource, setRakebackSource] = useState<"page_header" | "wallet_menu">(
    "page_header",
  );
  const [rakebackPreSelectedWalletId, setRakebackPreSelectedWalletId] = useState<
    string | undefined
  >(undefined);

  const { data: consolidated } = useQuery<ConsolidatedResponse>({
    queryKey: ["/api/bankroll/consolidated"],
    queryFn: async () => {
      const r = await fetch("/api/bankroll/consolidated", { credentials: "include" });
      if (!r.ok) throw new Error("consolidated_unavailable");
      return r.json();
    },
    staleTime: 30_000,
  });

  const { data: walletsResp } = useQuery<{ wallets: any[] }>({
    queryKey: ["/api/wallets"],
    queryFn: async () => {
      const r = await fetch("/api/wallets?includeArchived=true", { credentials: "include" });
      if (!r.ok) throw new Error("wallets_unavailable");
      return r.json();
    },
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

  // Auto-selecionar primeira wallet quando lista carrega.
  useEffect(() => {
    if (selectedWalletId == null && walletItems.length > 0) {
      const firstActive = walletItems.find((w) => w.status === "active");
      if (firstActive) setSelectedWalletId(firstActive.id);
    }
  }, [walletItems, selectedWalletId]);

  const selectedWallet = walletItems.find((w) => w.id === selectedWalletId) ?? null;
  const hasWallets = walletItems.length > 0;

  function handleCreateClick(suggestion?: WalletSuggestion) {
    setCreatePrefill(
      suggestion
        ? { name: suggestion.name, platform: suggestion.platform, nativeCurrency: suggestion.nativeCurrency }
        : undefined,
    );
    setCreateDialogOpen(true);
  }

  function openRakebackFromHeader() {
    setRakebackSource("page_header");
    setRakebackPreSelectedWalletId(undefined);
    setRakebackDialogOpen(true);
  }

  function openRakebackForWallet(walletId: string) {
    setRakebackSource("wallet_menu");
    setRakebackPreSelectedWalletId(walletId);
    setRakebackDialogOpen(true);
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Banca</h1>
          <p className="text-xs text-muted-foreground">
            {hasWallets
              ? `${consolidated?.walletCount ?? walletItems.filter((w) => w.status === "active").length} carteira(s) ativa(s)`
              : "Configuracao inicial — adicione sua primeira carteira"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openRakebackFromHeader}
            className="px-3 py-2 text-sm rounded border surface-warning surface-interactive"
            data-testid="bankroll-rakeback-trigger-header"
            title="Registrar rakeback recebido"
          >
            Reportar rakeback
          </button>
          <button
            onClick={() => setLegacyDialogOpen(true)}
            className="px-3 py-2 text-sm rounded border hover:bg-accent"
            data-testid="bankroll-legacy-movement-button"
            title="Registrar aporte/saque consolidado (modo legado)"
          >
            Aporte/saque legado
          </button>
          <button
            onClick={() => handleCreateClick()}
            className="px-4 py-2 rounded bg-primary text-primary-foreground"
            data-testid="bankroll-new-wallet-button"
          >
            + Nova carteira
          </button>
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
            {selectedWallet ? (
              <WalletDetailPanel
                wallet={selectedWallet as any}
                onRakebackClick={() => openRakebackForWallet(selectedWallet.id)}
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

      <section>
        <h2 className="text-lg font-semibold mb-3">Historico consolidado</h2>
        <BankrollHistoryTable />
      </section>

      <BankrollMovementDialog open={legacyDialogOpen} onOpenChange={setLegacyDialogOpen} />
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
        source={rakebackSource}
      />
    </div>
  );
}
