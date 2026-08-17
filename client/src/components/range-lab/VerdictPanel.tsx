// Veredito do Range Lab (F1 / RF-01.5, ADR-246 D-F1-4 e D-F1-8).
//
// Este painel carrega sozinho duas regras de produto:
//
//  1. NUMERO ERRADO PERDE PARA NUMERO AUSENTE. Resultado degradado vira empty
//     state — nunca um FOLD vermelho de 0%. Foi esse o "-13,8 fichas" fantasma
//     que a F0 tirou da tela, e a uniao discriminada do motor existe para que a
//     tela nao consiga faze-lo voltar por descuido.
//  2. NUMERO DE MONTE CARLO SEM INTERVALO E BUG (decisao D5). A margem sai
//     DENTRO do mesmo bloco do numero, nao ao lado: assim nao ha caminho de
//     layout que mostre um sem o outro.
import { AlertTriangle } from "lucide-react";
import type {
  EngineDegradedReason,
  EngineResult,
} from "@/lib/combo-calc/engine/types";
import { comboKey, rankChar } from "@/lib/combo-calc/cards";
import { tokens } from "@/lib/ui-tokens";

const SUIT_GLYPH: Record<string, string> = {
  c: String.fromCodePoint(0x2663),
  d: String.fromCodePoint(0x2666),
  h: String.fromCodePoint(0x2665),
  s: String.fromCodePoint(0x2660),
};

/** A razao tecnica nunca chega ao jogador — ele le o que fazer, nao o codigo. */
const DEGRADED_MESSAGE: Record<EngineDegradedReason, string> = {
  empty_hero_range: "Escolha a sua mao (ou pinte o seu range) para ver o veredito.",
  empty_villain_range: "Pinte ao menos uma classe com peso no range do oponente.",
  no_valid_pairs:
    "Nenhuma mao do oponente sobrevive as cartas ja conhecidas — os dois lados disputam as mesmas cartas.",
};

const DECISION_LABEL = {
  call: "CALL (+EV)",
  fold: "FOLD (-EV)",
  breakeven: "BREAK-EVEN",
} as const;

function fmtPct(fraction: number, decimals = 1): string {
  if (!Number.isFinite(fraction)) return "—";
  return (fraction * 100).toFixed(decimals) + "%";
}

function fmtChips(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

export interface VerdictPanelProps {
  result: EngineResult | null;
  progress: number;
  running: boolean;
}

export function VerdictPanel({ result, progress, running }: VerdictPanelProps) {
  if (running) {
    return (
      <div data-testid="range-lab-progress" className="space-y-2 py-6">
        <p className={`text-xs text-center ${tokens.color.neutral.text}`}>
          Calculando… {Math.round(Math.max(0, Math.min(1, progress)) * 100)}%
        </p>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }}
          />
        </div>
      </div>
    );
  }

  // O portao e `status !== "ok"`, NAO a razao especifica: `EngineDegradedReason`
  // e uma uniao feita para crescer, e uma guarda por razao deixaria a razao de
  // amanha pintar o banner vermelho com numero inventado.
  if (!result || result.status !== "ok") {
    return (
      <div data-testid="range-lab-empty-state" className="py-8 text-center space-y-1">
        <p className={`text-sm ${tokens.color.neutral.text}`}>
          {result ? DEGRADED_MESSAGE[result.reason] : "Monte o spot para ver o veredito."}
        </p>
        <p className="text-[10px] text-muted-foreground">
          Bordo (3 a 5 cartas), a sua mao, o range do oponente com peso, pote e call.
        </p>
      </div>
    );
  }

  const isMonteCarlo = result.mode === "monte_carlo" && result.confidence != null;
  const degradedCombos = result.perHeroCombo.filter((c) => c.degradedReason !== null);
  const bannerTone =
    result.decision === "call"
      ? "bg-emerald-600"
      : result.decision === "breakeven"
        ? "bg-amber-600"
        : "bg-red-600";

  return (
    <div className="space-y-3">
      <div
        data-testid="range-lab-verdict-banner"
        className={`rounded-xl px-4 py-3 text-white shadow-lg ${bannerTone}`}
      >
        <div className="text-center space-y-1">
          <div className="text-xs font-bold uppercase tracking-widest opacity-90">
            {DECISION_LABEL[result.decision]}
          </div>
          {/*
            A margem e FILHA deste bloco de proposito. Renderizar so o numero em
            qualquer outro lugar da tela quebra o teste — e essa e a intencao:
            criterio de aceite 4 nao pode depender de disciplina de layout.
          */}
          <div data-testid="range-lab-equity" className="space-y-0.5">
            <div className="text-3xl font-black font-mono">
              {fmtPct(result.heroRangeEquity)}
            </div>
            {isMonteCarlo && result.confidence && (
              <div data-testid="range-lab-mc-margin" className="text-[11px] opacity-90">
                aproximado: margem de {"±"}
                {fmtPct(result.confidence.halfWidth, 2)} (95% de confianca,{" "}
                {result.samples?.toLocaleString("pt-BR")} amostras)
              </div>
            )}
          </div>
          <div className="text-xs opacity-90">
            equity contra alpha {fmtPct(result.requiredEquity, 2)}
          </div>
          <p className="text-sm opacity-90">
            EV do call:{" "}
            <span className="font-mono font-bold">
              {result.evCall >= 0 ? "+" : ""}
              {fmtChips(result.evCall)}
            </span>{" "}
            fichas
          </p>
        </div>
      </div>

      {degradedCombos.length > 0 && (
        <div
          data-testid="range-lab-degraded-combos"
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${tokens.color.warn.border} ${tokens.color.warn.bg} ${tokens.color.warn.text}`}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            {degradedCombos.length} mao(s) sua(s) ficaram fora da conta porque nao
            sobrou nenhuma mao do oponente para enfrentar:{" "}
            <span className="font-mono">
              {degradedCombos
                .map((c) =>
                  c.combo
                    .map((card) => `${rankChar(card.rank)}${SUIT_GLYPH[card.suit]}`)
                    .join(""),
                )
                .join(", ")}
            </span>
            . Elas nao valem 0% — elas nao tem numero.
          </span>
        </div>
      )}

      <ul className="space-y-1">
        {result.perHeroCombo.slice(0, 8).map((c) => (
          <li
            key={comboKey(c.combo[0], c.combo[1])}
            className="flex items-center justify-between text-xs font-mono"
          >
            <span>
              {c.combo
                .map((card) => `${rankChar(card.rank)}${SUIT_GLYPH[card.suit]}`)
                .join("")}
            </span>
            <span className={c.equity === null ? tokens.color.neutral.text : ""}>
              {/* Combo sem oponente mostra um traco. Zero seria numero inventado. */}
              {c.equity === null ? "sem oponente" : fmtPct(c.equity)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default VerdictPanel;
