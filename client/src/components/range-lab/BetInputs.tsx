// Pote, call e big blind (F1 / RF-01.5). Alpha e derivado, nunca digitado.
import { tokens } from "@/lib/ui-tokens";

const INPUT_CLASS =
  "w-full rounded bg-gray-800/50 border border-gray-700 text-gray-100 font-mono text-sm px-2 py-1.5 placeholder:text-gray-500";

export interface BetInputsProps {
  potInput: string;
  callInput: string;
  bbInput: string;
  onChange: (next: { potInput: string; callInput: string; bbInput: string }) => void;
}

/** alpha = call / (pote + call). Pote ja inclui a aposta do oponente. */
export function alphaOf(potCurrent: number, callAmount: number): number {
  const finalPot = potCurrent + callAmount;
  return finalPot > 0 ? callAmount / finalPot : 0;
}

export function parseAmount(raw: string): number {
  const n = parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function BetInputs({ potInput, callInput, bbInput, onChange }: BetInputsProps) {
  const alpha = alphaOf(parseAmount(potInput), parseAmount(callInput));

  return (
    <div data-testid="range-lab-bet-inputs" className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className={`block text-xs ${tokens.color.neutral.text}`}>Pote atual</span>
          <input
            inputMode="decimal"
            value={potInput}
            onChange={(e) => onChange({ potInput: e.target.value, callInput, bbInput })}
            className={INPUT_CLASS}
          />
        </label>
        <label className="space-y-1">
          <span className={`block text-xs ${tokens.color.neutral.text}`}>Call</span>
          <input
            inputMode="decimal"
            value={callInput}
            onChange={(e) => onChange({ potInput, callInput: e.target.value, bbInput })}
            className={INPUT_CLASS}
          />
        </label>
        <label className="space-y-1">
          <span className={`block text-xs ${tokens.color.neutral.text}`}>BB (opc.)</span>
          <input
            inputMode="decimal"
            value={bbInput}
            placeholder="—"
            onChange={(e) => onChange({ potInput, callInput, bbInput: e.target.value })}
            className={INPUT_CLASS}
          />
        </label>
      </div>
      <p className={`text-xs ${tokens.color.neutral.text}`}>
        Equity necessaria (alpha):{" "}
        <span className={`font-mono ${tokens.color.action.text}`}>
          {(alpha * 100).toFixed(2)}%
        </span>
      </p>
    </div>
  );
}

export default BetInputs;
