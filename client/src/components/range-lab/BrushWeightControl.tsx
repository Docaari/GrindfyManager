// Peso rapido global do pincel (emenda A9, F5-mindriver, ADR-247 D-F2-1).
// Um controle UNICO (passo de 5%) define a frequencia do PROXIMO pincel — nao
// e campo novo no modelo, e o `defaultFrequency` que `RangeMatrix` ja aceita.
// Um por lado (heroi/vilao): pintar um range inteiro a 50% vira um gesto so.
import { tokens } from "@/lib/ui-tokens";

export interface BrushWeightControlProps {
  value: number; // 0..1
  onChange: (next: number) => void;
  testId?: string;
}

export function BrushWeightControl({
  value,
  onChange,
  testId = "brush-weight-control",
}: BrushWeightControlProps) {
  return (
    <div data-testid={testId} className="flex items-center gap-2">
      <span className={`text-[10px] ${tokens.color.neutral.text} shrink-0`}>
        Peso do pincel:
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        data-testid={`${testId}-input`}
        aria-label="Peso do proximo pincel"
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="flex-1 max-w-[120px]"
      />
      <span className="font-mono text-[10px] w-10 text-right">{Math.round(value * 100)}%</span>
    </div>
  );
}

export default BrushWeightControl;
