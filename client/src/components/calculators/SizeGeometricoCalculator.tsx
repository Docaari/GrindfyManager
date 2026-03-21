import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Layers,
  Info,
  ChevronDown,
  BookOpen,
  RotateCcw,
} from "lucide-react";

// ─── Utilities ───────────────────────────────────────────────

function parseNumber(value: string): number {
  const normalized = value.replace(",", ".");
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

function roundTo(value: number, precision: number): number {
  return Math.round(value / precision) * precision;
}

// ─── Types ───────────────────────────────────────────────────

interface BetResult {
  street: string;
  bet: number;
  percent: number;
}

// ─── Calculation ─────────────────────────────────────────────

function calculateGeometricBets(pot: number, stack: number, barrels: number): BetResult[] | null {
  if (pot <= 0 || stack <= 0 || barrels < 2 || barrels > 3) {
    return null;
  }

  const r = (Math.pow(1 + (2 * stack) / pot, 1 / barrels) - 1) / 2;
  const streetNames = barrels === 2 ? ["Turn", "River"] : ["Flop", "Turn", "River"];
  const results: BetResult[] = [];
  let currentPot = pot;

  for (let i = 0; i < barrels; i++) {
    const betExact = r * currentPot;
    const betRounded = roundTo(betExact, 0.5);
    results.push({
      street: streetNames[i],
      bet: betRounded,
      percent: r * 100,
    });
    currentPot = currentPot + 2 * betRounded;
  }

  return results;
}

// ─── InfoTooltip helper ─────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center ml-1">
          <Info className="h-3.5 w-3.5 text-gray-500 hover:text-emerald-400 transition-colors cursor-help" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[260px] text-xs bg-gray-800 border-gray-700 text-gray-200"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Styled input ────────────────────────────────────────────

const inputClasses =
  "bg-gray-800/50 border-gray-700 text-gray-100 font-mono placeholder:text-gray-500 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50 h-9";

// ─── Main Component ─────────────────────────────────────────

export default function SizeGeometricoCalculator() {
  const [potInput, setPotInput] = useState("8.5");
  const [stackInput, setStackInput] = useState("92.5");
  const [barrels, setBarrels] = useState<2 | 3>(2);
  const [helpOpen, setHelpOpen] = useState(false);

  const pot = parseNumber(potInput);
  const stack = parseNumber(stackInput);

  const results = useMemo(() => {
    return calculateGeometricBets(pot, stack, barrels);
  }, [pot, stack, barrels]);

  const isValid = pot > 0 && stack > 0;
  const spr = pot > 0 ? stack / pot : 0;

  const potPresets = [0.5, 1, 5, 10];
  const stackPresets = [5, 10, 25, 50];

  const reset = () => {
    setPotInput("8.5");
    setStackInput("92.5");
    setBarrels(2);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="bg-gray-900 text-gray-200 rounded-xl p-4 sm:p-5 space-y-4 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-emerald-500" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-gray-100">
                Size Geometrico
              </h1>
              <p className="text-[11px] text-gray-500">
                Calcula bet sizes para fazer all-in geometricamente em N streets
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            className="text-gray-500 hover:text-gray-200"
            title="Resetar"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* Inputs */}
        <Card className="bg-gray-900 border-gray-800 text-gray-200">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center">
                  <Label className="text-xs text-gray-400">Pot Atual (BB)</Label>
                  <InfoTip text="Tamanho atual do pot em big blinds. Inclui todas as apostas ja feitas." />
                </div>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={potInput}
                  onChange={(e) => setPotInput(e.target.value)}
                  placeholder="8.5"
                  className={inputClasses}
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {potPresets.map((preset) => (
                    <Button
                      key={preset}
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px] font-mono bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                      onClick={() => setPotInput((pot + preset).toString())}
                    >
                      +{preset}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center">
                  <Label className="text-xs text-gray-400">Stack Efetivo (BB)</Label>
                  <InfoTip text="Stack efetivo (menor stack envolvido) em big blinds. Este e o valor total que voce quer colocar no pot." />
                </div>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={stackInput}
                  onChange={(e) => setStackInput(e.target.value)}
                  placeholder="92.5"
                  className={inputClasses}
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {stackPresets.map((preset) => (
                    <Button
                      key={preset}
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px] font-mono bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                      onClick={() => setStackInput((stack + preset).toString())}
                    >
                      +{preset}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Barrel selector */}
            <div className="space-y-1.5">
              <div className="flex items-center">
                <Label className="text-xs text-gray-400">Barris</Label>
                <InfoTip text="Numero de streets restantes para apostar. 2 barris = Turn + River. 3 barris = Flop + Turn + River." />
              </div>
              <div className="flex gap-2">
                {([2, 3] as const).map((opt) => (
                  <Button
                    key={opt}
                    variant={barrels === opt ? "default" : "outline"}
                    size="sm"
                    onClick={() => setBarrels(opt)}
                    className={`flex-1 font-mono text-xs ${
                      barrels === opt
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                        : "bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                    }`}
                  >
                    {opt} Barris
                  </Button>
                ))}
              </div>
            </div>

            {/* SPR indicator */}
            {isValid && (
              <div className="flex items-center justify-between pt-1 border-t border-gray-800">
                <span className="text-[10px] text-gray-500 flex items-center">
                  SPR (Stack-to-Pot Ratio)
                  <InfoTip text="Razao entre o stack efetivo e o pot atual. SPR baixo = spot mais comprometido." />
                </span>
                <span className="font-mono text-xs text-gray-300">
                  {spr.toFixed(1)}x
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {isValid && results && (
          <>
            <div className="pt-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-gray-800" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Resultado
                </span>
                <div className="h-px flex-1 bg-gray-800" />
              </div>

              {/* Main result */}
              <Card className="bg-emerald-500/10 border-emerald-500/30 text-gray-200">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-col items-center justify-center space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80">
                      Aposte Agora — {results[0].street}
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-black font-mono tracking-tighter text-emerald-400">
                        {results[0].bet.toFixed(1)}
                      </span>
                      <span className="text-lg font-bold text-emerald-400/70">BB</span>
                      <span className="ml-2 text-xs font-mono font-medium bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">
                        {results[0].percent.toFixed(0)}% pot
                      </span>
                    </div>
                  </div>

                  {/* Next streets */}
                  {results.length > 1 && (
                    <div className="border-t border-emerald-500/20 pt-2">
                      <div className="flex items-center justify-center gap-4">
                        {results.slice(1).map((r) => (
                          <div key={r.street} className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] font-bold uppercase text-gray-500">
                              {r.street}
                            </span>
                            <span className="text-sm font-bold font-mono text-gray-200">
                              {r.bet.toFixed(1)} bb
                            </span>
                            <span className="text-[10px] font-mono text-gray-500">
                              {r.percent.toFixed(0)}% pot
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Street breakdown */}
              <Card className="bg-gray-900 border-gray-800 text-gray-200 mt-3">
                <CardContent className="p-4 space-y-2">
                  <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Breakdown por Street
                  </Label>
                  {(() => {
                    let runningPot = pot;
                    return results.map((r) => {
                      const potBefore = runningPot;
                      const potAfter = runningPot + 2 * r.bet;
                      runningPot = potAfter;
                      return (
                        <div
                          key={r.street}
                          className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-300 w-10">{r.street}</span>
                            <span className="text-[10px] text-gray-500">
                              pot {potBefore.toFixed(1)} → {potAfter.toFixed(1)} bb
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-emerald-400">
                              {r.bet.toFixed(1)} bb
                            </span>
                            <span className="text-[10px] font-mono text-gray-500">
                              ({r.percent.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </CardContent>
              </Card>
            </div>

            {/* Como Interpretar */}
            <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
              <CollapsibleTrigger asChild>
                <button
                  className="flex items-center justify-between w-full py-2.5 px-4 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-700 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span className="text-xs">O que e Size Geometrico?</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      helpOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <Card className="bg-gray-900 border-gray-800 text-gray-200">
                  <CardContent className="p-4 space-y-3 text-xs text-gray-400 leading-relaxed">
                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">
                        Conceito
                      </h4>
                      <p>
                        O size geometrico encontra o percentual de pot unico
                        que, apostado em cada street restante, coloca exatamente
                        todo o stack efetivo no meio. E a forma mais eficiente
                        de fazer all-in em multiplas streets.
                      </p>
                    </section>

                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">
                        Quando usar
                      </h4>
                      <p>
                        Use quando voce quer planejar uma linha de valor ou
                        blefe em multiplas streets e precisa saber quanto
                        apostar em cada uma para colocar todo o stack. Muito
                        util em spots com nuts advantage ou quando voce quer
                        polarizar.
                      </p>
                    </section>

                    <section className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                      <h4 className="font-semibold text-gray-300 mb-1">
                        Exemplo
                      </h4>
                      <p>
                        Pot = 8.5 bb, Stack = 92.5 bb, 2 barris:
                      </p>
                      <p className="font-mono text-emerald-400 mt-1">
                        Turn: ~20.5 bb (241%) → River: ~49.5 bb (241%)
                      </p>
                      <p className="mt-1">
                        O percentual e o mesmo em ambas as streets — essa e a
                        propriedade geometrica.
                      </p>
                    </section>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
