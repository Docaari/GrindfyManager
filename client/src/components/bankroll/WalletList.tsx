/**
 * WalletList — Sidebar list de carteiras (RF-12)
 *
 * Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md
 * Cards: nome, plataforma, balance native + USD equivalente, color dot.
 * Click seleciona via onSelect. Botao "Nova Carteira" via onCreateClick.
 */
import React from "react";
import { WALLET_PLATFORM_LABELS, type WalletPlatform } from "@shared/wallet-platforms";

export interface WalletListItem {
  id: string;
  name: string;
  platform: string;
  nativeCurrency: string;
  balance: string;
  balanceUSD?: string;
  status: "active" | "archived";
  color?: string | null;
  displayOrder?: number;
  isShotPocket?: boolean;
}

export interface WalletSuggestion {
  label: string;
  name: string;
  platform: WalletPlatform;
  nativeCurrency: string;
}

interface Props {
  wallets: WalletListItem[];
  selectedWalletId: string | null;
  onSelect: (walletId: string) => void;
  onCreateClick: (suggestion?: WalletSuggestion) => void;
}

const DEFAULT_SUGGESTIONS: WalletSuggestion[] = [
  { label: "GG Main", name: "GG Main", platform: "GGNetwork", nativeCurrency: "USD" },
  { label: "Suprema", name: "Suprema Conta Principal", platform: "Suprema", nativeCurrency: "BRL" },
  { label: "Banco BRL", name: "Banco Principal", platform: "OffPlatform_Bank", nativeCurrency: "BRL" },
];

function formatNumber(value: string | number, locale = "pt-BR"): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currencySymbol(ccy: string): string {
  if (ccy === "USD") return "$";
  if (ccy === "BRL") return "R$";
  if (ccy === "EUR") return "€";
  if (ccy === "GBP") return "£";
  return ccy;
}

function platformLabel(platform: string): string {
  return WALLET_PLATFORM_LABELS[platform as WalletPlatform] ?? platform;
}

export function WalletList({ wallets, selectedWalletId, onSelect, onCreateClick }: Props) {
  const active = wallets.filter((w) => w.status === "active");
  const archived = wallets.filter((w) => w.status === "archived");

  return (
    <aside className="w-full md:w-[280px] flex flex-col gap-2 p-3 border-r" data-testid="wallet-list">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Carteiras
        </h2>
        <button
          type="button"
          data-testid="wallet-list-new-button"
          onClick={() => onCreateClick()}
          className="text-xs font-medium px-2 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90"
        >
          + Nova
        </button>
      </div>

      {wallets.length === 0 && (
        // QW-A: empty state com CTA grande + chips de sugestao
        <div
          data-testid="wallet-list-empty"
          className="rounded-md border border-dashed p-5 text-center space-y-3 bg-muted/20"
        >
          <h3 className="text-base font-semibold">Voce ainda nao tem carteiras</h3>
          <p className="text-xs text-muted-foreground">
            Carteiras refletem cada conta sua: GG, Suprema, banco, cripto.
            Adicione uma para comecar.
          </p>
          <button
            type="button"
            data-testid="wallet-list-empty-cta"
            onClick={() => onCreateClick()}
            className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            Criar primeira carteira
          </button>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground pt-1">
            Sugestoes
          </div>
          <div className="flex flex-wrap gap-1 justify-center">
            {DEFAULT_SUGGESTIONS.map((s) => (
              <button
                type="button"
                key={s.label}
                data-testid={`wallet-suggestion-${s.label}`}
                onClick={() => onCreateClick(s)}
                className="text-xs px-2 py-1 rounded border bg-background hover:bg-accent"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {active.map((w) => {
          const selected = selectedWalletId === w.id;
          const symbol = currencySymbol(w.nativeCurrency);
          const showUsdEquiv = w.balanceUSD != null && w.nativeCurrency !== "USD";
          return (
            <button
              type="button"
              key={w.id}
              data-testid={`wallet-item-${w.id}`}
              data-selected={selected ? "true" : "false"}
              onClick={() => onSelect(w.id)}
              className={
                "text-left rounded-md px-3 py-2 border " +
                (selected ? "bg-accent border-primary" : "bg-card hover:bg-accent")
              }
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: w.color ?? "#94a3b8" }}
                />
                <span className="font-medium text-sm truncate">{w.name}</span>
                {w.isShotPocket && (
                  <span
                    className="ml-auto text-[10px] uppercase tracking-wide bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded"
                    title="Shot pocket: carteira reservada para tentativas em buy-ins acima da banca de gestao"
                  >
                    Shot
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {platformLabel(w.platform)}
              </div>
              <div className="text-xs mt-1 flex items-baseline justify-between">
                {/* QW-B: simbolo de moeda explicito + label "~ $X USD" para equivalente */}
                <span data-testid={`wallet-balance-native-${w.id}`}>
                  {symbol} {formatNumber(w.balance)}
                </span>
                {showUsdEquiv && (
                  <span
                    className="text-muted-foreground"
                    data-testid={`wallet-balance-usd-${w.id}`}
                    title="Equivalente em USD (taxa de cambio salva)"
                  >
                    ~ ${formatNumber(w.balanceUSD!)} USD
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {archived.length > 0 && (
        <details data-testid="wallet-list-archived-section" className="mt-3">
          <summary className="text-xs text-muted-foreground cursor-pointer">
            Arquivadas ({archived.length})
          </summary>
          <div className="flex flex-col gap-1 mt-1">
            {archived.map((w) => (
              <button
                type="button"
                key={w.id}
                data-testid={`wallet-item-${w.id}`}
                data-selected={selectedWalletId === w.id ? "true" : "false"}
                onClick={() => onSelect(w.id)}
                className="text-left rounded-md px-3 py-2 border bg-muted/40 opacity-70"
              >
                <div className="text-sm">{w.name}</div>
                <div className="text-xs text-muted-foreground">{platformLabel(w.platform)}</div>
              </button>
            ))}
          </div>
        </details>
      )}
    </aside>
  );
}

export default WalletList;
