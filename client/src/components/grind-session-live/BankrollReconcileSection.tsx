/**
 * BankrollReconcileSection — Sprint Bankroll-3 RF-9
 *
 * Componente extraido do SessionSummaryModal.tsx para reduzir o modal abaixo
 * de 250 linhas (D7: controlled, sem state interno).
 *
 * Renderiza:
 *   - Lista de wallets com input de saldo reportado.
 *   - Banner amber para missingPlatforms (RF-3 suggestedBindings).
 *
 * Retorna null quando bankrollManagementEnabled=false ou
 * (wallets.length===0 && missingPlatforms.length===0).
 */

import React from "react";

export interface ReconcilableWalletShape {
  walletId: string;
  name?: string;
  platform?: string;
  nativeCurrency?: string;
  expectedClosingBalance?: number | string;
  expectedDelta?: number | string;
  openingBalance?: number | string;
  balance?: number | string;
  expectedPreviousBalance?: number | string;
  contributingTournaments?: string[];
  hadActivityInSession?: boolean;
  tieBreakStrategy?: string;
}

export interface SuggestedBindingShape {
  platform: string;
  suggestedCurrency: string;
  confidence: "site_map" | "alias_group" | "fallback_usd";
}

export interface BankrollReconcileSectionProps {
  wallets: ReconcilableWalletShape[];
  playedPlatforms: string[];
  missingPlatforms: string[];
  suggestedBindings: SuggestedBindingShape[];
  reportedBalances: Record<string, string>;
  onReportedBalanceChange: (walletId: string, value: string) => void;
  onCreateWalletForPlatform: (platform: string, suggestedCurrency?: string) => void;
  isReconciling: boolean;
  bankrollManagementEnabled: boolean;
}

function parseNumber(v: any): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export const BankrollReconcileSection: React.FC<BankrollReconcileSectionProps> = ({
  wallets,
  missingPlatforms,
  suggestedBindings,
  reportedBalances,
  onReportedBalanceChange,
  onCreateWalletForPlatform,
  isReconciling,
  bankrollManagementEnabled,
}) => {
  if (!bankrollManagementEnabled) return null;
  if (wallets.length === 0 && missingPlatforms.length === 0) return null;

  const bindingByPlatform = new Map<string, SuggestedBindingShape>();
  for (const sb of suggestedBindings ?? []) bindingByPlatform.set(sb.platform, sb);

  return (
    <section
      data-testid="bankroll-reconcile-section"
      className="flex flex-col gap-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4"
    >
      <header>
        <h3 className="text-base font-semibold text-zinc-100">Bancas (reconcile)</h3>
        <p className="text-xs text-zinc-400 mt-1">
          Confira o saldo final reportado de cada wallet.
        </p>
      </header>

      {missingPlatforms.length > 0 && (
        <div
          data-testid="missing-platforms-banner"
          className="rounded-md border border-amber-500 bg-amber-900/20 p-3 text-amber-200 text-sm flex flex-col gap-2"
        >
          <strong>Plataformas jogadas sem wallet ativa:</strong>
          <ul className="flex flex-col gap-2">
            {missingPlatforms.map((platform) => {
              const binding = bindingByPlatform.get(platform);
              return (
                <li key={platform} className="flex items-center justify-between gap-3">
                  <span>
                    <strong>{platform}</strong>
                    {binding && (
                      <span className="ml-2 opacity-80">
                        Sugestao: <code className="bg-amber-950/40 px-1 rounded">{binding.suggestedCurrency}</code>
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    data-testid={`missing-platform-cta-${platform}`}
                    onClick={() =>
                      onCreateWalletForPlatform(platform, binding?.suggestedCurrency)
                    }
                    className="px-3 py-1 rounded bg-amber-600 text-white text-xs hover:bg-amber-500"
                  >
                    Cadastrar wallet
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {wallets.length > 0 && (
        <div className="flex flex-col gap-3">
          {wallets.map((w) => {
            const reported = reportedBalances[w.walletId] ?? "";
            const reportedNum = parseNumber(reported);
            const opening = parseNumber(w.openingBalance ?? w.balance);
            const expected = parseNumber(w.expectedClosingBalance);
            const adjustment = reported === "" ? 0 : reportedNum - expected;
            return (
              <div
                key={w.walletId}
                className="rounded-md border border-zinc-700 bg-zinc-800/40 p-3 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">{w.name ?? w.platform ?? w.walletId}</div>
                    <div className="text-xs text-zinc-400">
                      Abertura: {opening.toFixed(2)} {w.nativeCurrency} - Esperado: {expected.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-400" htmlFor={`balance-${w.walletId}`}>
                      Saldo final
                    </label>
                    <input
                      id={`balance-${w.walletId}`}
                      data-testid={`wallet-balance-input-${w.walletId}`}
                      type="number"
                      step="0.01"
                      value={reported}
                      onChange={(e) => onReportedBalanceChange(w.walletId, e.target.value)}
                      disabled={isReconciling}
                      className="w-32 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 disabled:opacity-50"
                    />
                  </div>
                </div>
                <div
                  data-testid={`wallet-adjustment-preview-${w.walletId}`}
                  className="text-xs text-zinc-300"
                >
                  Ajuste: <strong>{adjustment.toFixed(2)} {w.nativeCurrency}</strong>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default BankrollReconcileSection;
