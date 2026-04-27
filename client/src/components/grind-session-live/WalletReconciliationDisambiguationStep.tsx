/**
 * WalletReconciliationDisambiguationStep — RF-13 (P3 / F-04).
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *
 * Step extra exibido ANTES do dialog principal de reconciliacao quando
 * pelo menos 1 site da sessao tem 2+ wallets candidatas. User escolhe entre:
 *   - wallet unica (single)
 *   - distribuir proporcionalmente (proportional, default ADR-045)
 *   - personalizado (custom)
 *
 * Skip do step via 'Continuar com default' = proporcional default.
 *
 * NAO renderiza nada quando siteCandidates esta vazio.
 */
import React from "react";

export interface DisambiguationWalletEntry {
  walletId: string;
  name: string;
  balance: number;
  nativeCurrency: string;
}

export interface DisambiguationSiteCandidate {
  site: string;
  wallets: DisambiguationWalletEntry[];
}

export interface WalletReconciliationDisambiguationStepProps {
  open: boolean;
  siteCandidates: DisambiguationSiteCandidate[];
  onChoice: (
    site: string,
    choice: "single" | "proportional" | "custom",
    walletId?: string,
  ) => void;
  onContinueWithDefault: () => void;
}

export function WalletReconciliationDisambiguationStep({
  open,
  siteCandidates,
  onChoice,
  onContinueWithDefault,
}: WalletReconciliationDisambiguationStepProps) {
  if (!open) return null;
  if (!Array.isArray(siteCandidates) || siteCandidates.length === 0) return null;

  return (
    <div
      data-testid="reconcile-disambiguation-step"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-background rounded-lg border shadow-lg w-full max-w-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">
            Como atribuir os resultados quando ha mais de uma carteira?
          </h2>
          <p className="text-sm text-muted-foreground">
            Detectamos sites com 2 ou mais carteiras ativas. Escolha como o delta
            esperado deve ser distribuido em cada um.
          </p>
        </div>

        {siteCandidates.map((sc) => (
          <div
            key={sc.site}
            data-testid={`reconcile-disambiguation-section-${sc.site}`}
            className="border rounded p-3 space-y-2"
          >
            <div className="text-sm font-medium">{sc.site}</div>
            <div className="space-y-1">
              {sc.wallets.map((w) => (
                <button
                  key={w.walletId}
                  type="button"
                  data-testid={`reconcile-disambiguation-option-single-${w.walletId}`}
                  onClick={() => onChoice(sc.site, "single", w.walletId)}
                  className="w-full text-left px-3 py-2 rounded border hover:bg-accent text-sm"
                >
                  {w.name} ({w.balance.toFixed(2)} {w.nativeCurrency})
                </button>
              ))}
              <button
                type="button"
                data-testid={`reconcile-disambiguation-option-proportional-${sc.site}`}
                onClick={() => onChoice(sc.site, "proportional", undefined)}
                className="w-full text-left px-3 py-2 rounded border hover:bg-accent text-sm"
              >
                Distribuir proporcionalmente (default)
              </button>
              <button
                type="button"
                data-testid={`reconcile-disambiguation-option-custom-${sc.site}`}
                onClick={() => onChoice(sc.site, "custom", undefined)}
                className="w-full text-left px-3 py-2 rounded border hover:bg-accent text-sm"
              >
                Personalizado (eu defino na proxima tela)
              </button>
            </div>
          </div>
        ))}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            data-testid="reconcile-disambiguation-continue"
            onClick={onContinueWithDefault}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 text-sm"
          >
            Continuar com default
          </button>
        </div>
      </div>
    </div>
  );
}

export default WalletReconciliationDisambiguationStep;
