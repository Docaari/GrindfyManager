import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Award,
  Info,
  ChevronDown,
  TrendingDown,
  Target,
  Zap,
  Settings2,
  BookOpen,
} from "lucide-react";

// ─── Utilities ───────────────────────────────────────────────

function parseNumber(value: string): number {
  const normalized = value.replace(",", ".");
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

function formatChips(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDollar(value: number): string {
  return (
    "$" +
    value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatPct(fraction: number): string {
  return (fraction * 100).toFixed(2) + "%";
}

function formatR(value: number): string {
  return value.toFixed(4);
}

// ─── Calculation: Method 1 (Fixed Conversion) ───────────────

interface Method1Result {
  bountyCapturavel: number;
  bountyFichas: number;
  r: number;
  equityNecessaria: number;
  equityDrop: number;
}

function calcMethod1(
  S0: number,
  B0: number,
  PKO: number,
  Sv: number,
  Bv: number
): Method1Result | null {
  if (S0 <= 0 || B0 <= 0 || PKO <= 0 || Sv <= 0 || Bv <= 0) return null;

  const bountyCapturavel = Bv * 0.5;
  const bountyFichas = (Bv * S0 * PKO) / (2 * B0);
  const r = bountyFichas / Sv;
  const equityNecessaria = 1 / (2 + r);
  const equityDrop = 0.5 - equityNecessaria;

  return { bountyCapturavel, bountyFichas, r, equityNecessaria, equityDrop };
}

// ─── Calculation: Method 2 (Bounty Power) ───────────────────

interface Method2Result {
  bountyPower: number;
  bountyFichas: number;
  equityNecessaria: number;
  equityDrop: number;
  isDynamic: boolean;
}

function calcMethod2(
  S0: number,
  B0: number,
  PKO: number,
  Sv: number,
  Bv: number,
  jogIniciais: number,
  jogRestantes: number
): Method2Result | null {
  if (S0 <= 0 || B0 <= 0 || PKO <= 0 || Sv <= 0 || Bv <= 0) return null;

  let bountyPower: number;
  let isDynamic = false;

  if (
    jogIniciais > 0 &&
    jogRestantes > 0 &&
    jogRestantes <= jogIniciais
  ) {
    const buyinTotal = B0 / PKO;
    const eliminados = jogIniciais - jogRestantes;
    const fichasTotais = jogIniciais * S0;
    const bountyPoolRestante =
      jogIniciais * B0 - eliminados * B0 * 0.5;
    const prizePoolRestante = jogIniciais * (buyinTotal - B0);
    const totalPool = bountyPoolRestante + prizePoolRestante;
    bountyPower = totalPool > 0 ? fichasTotais / totalPool : 0;
    isDynamic = true;
  } else {
    bountyPower = (S0 * PKO) / B0;
  }

  const bountyFichas = Bv * 0.5 * bountyPower;
  const denom = 2 * Sv + bountyFichas;
  const equityNecessaria = denom > 0 ? Sv / denom : 0.5;
  const equityDrop = 0.5 - equityNecessaria;

  return { bountyPower, bountyFichas, equityNecessaria, equityDrop, isDynamic };
}

// ─── Target classification ──────────────────────────────────

function getTargetInfo(dropPct: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (dropPct > 15)
    return {
      label: "Extremamente Lucrativo",
      color: "text-emerald-300",
      bg: "bg-emerald-500/20 border-emerald-500/40",
    };
  if (dropPct > 8)
    return {
      label: "Muito Lucrativo",
      color: "text-emerald-400",
      bg: "bg-emerald-500/15 border-emerald-500/30",
    };
  if (dropPct > 3)
    return {
      label: "Alvo Moderado",
      color: "text-amber-400",
      bg: "bg-amber-500/15 border-amber-500/30",
    };
  return {
    label: "Normal",
    color: "text-gray-400",
    bg: "bg-gray-700/30 border-gray-600/30",
  };
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

// ─── Styled input for the dark poker theme ──────────────────

const inputClasses =
  "bg-gray-800/50 border-gray-700 text-gray-100 font-mono placeholder:text-gray-500 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50 h-9";

// ─── Main Component ─────────────────────────────────────────

export default function BountyCalculator() {
  // Required inputs
  const [s0Input, setS0Input] = useState("10000");
  const [b0Input, setB0Input] = useState("5");
  const [pkoPercent, setPkoPercent] = useState<50 | 66 | 100>(50);
  const [svInput, setSvInput] = useState("10000");
  const [bvInput, setBvInput] = useState("5");

  // Optional inputs (dynamic Bounty Power)
  const [jogIniciaisInput, setJogIniciaisInput] = useState("");
  const [jogRestantesInput, setJogRestantesInput] = useState("");

  // UI state
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Parse values
  const S0 = parseNumber(s0Input);
  const B0 = parseNumber(b0Input);
  const PKO = pkoPercent / 100;
  const Sv = parseNumber(svInput);
  const Bv = parseNumber(bvInput);
  const jogIniciais = parseNumber(jogIniciaisInput);
  const jogRestantes = parseNumber(jogRestantesInput);

  // Calculations
  const method1 = useMemo(
    () => calcMethod1(S0, B0, PKO, Sv, Bv),
    [S0, B0, PKO, Sv, Bv]
  );
  const method2 = useMemo(
    () => calcMethod2(S0, B0, PKO, Sv, Bv, jogIniciais, jogRestantes),
    [S0, B0, PKO, Sv, Bv, jogIniciais, jogRestantes]
  );

  const buyinEstimado = useMemo(
    () => (PKO > 0 ? B0 / PKO : 0),
    [B0, PKO]
  );

  const bountyFactor = useMemo(() => {
    if (B0 <= 0 || S0 <= 0) return 0;
    return (Bv / B0) / (Sv / S0);
  }, [Bv, B0, Sv, S0]);

  const isValid = S0 > 0 && B0 > 0 && Sv > 0 && Bv > 0;

  const dropPct = method1 ? method1.equityDrop * 100 : 0;
  const targetInfo = getTargetInfo(dropPct);

  const pkoOptions: Array<50 | 66 | 100> = [50, 66, 100];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="bg-gray-900 text-gray-200 rounded-xl p-4 sm:p-5 space-y-4 w-full max-w-2xl">
        {/* Header */}
        <div className="text-center space-y-1 pb-1">
          <div className="flex items-center justify-center gap-2">
            <Award className="h-5 w-5 text-emerald-500" />
            <h1 className="text-lg font-bold tracking-tight text-gray-100">
              PKO Drop Equity Calculator
            </h1>
          </div>
          <p className="text-xs text-gray-500">
            Ferramenta de estudo — dois metodos de calculo lado a lado
          </p>
        </div>

        {/* Configuracao do Torneio */}
        <Card className="bg-gray-900 border-gray-800 text-gray-200">
          <CardContent className="p-4 space-y-3">
            <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Configuracao do Torneio
            </Label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center">
                  <Label className="text-xs text-gray-400">
                    Starting Stack (S0)
                  </Label>
                  <InfoTip text="Stack inicial que todos os jogadores recebem ao comecar o torneio. Ex: 10.000 fichas." />
                </div>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={s0Input}
                  onChange={(e) => setS0Input(e.target.value)}
                  placeholder="10000"
                  className={inputClasses}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center">
                  <Label className="text-xs text-gray-400">
                    Bounty Inicial (B0)
                  </Label>
                  <InfoTip text="Valor em dinheiro ($) do bounty no inicio do torneio. Ex: $5.00" />
                </div>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={b0Input}
                  onChange={(e) => setB0Input(e.target.value)}
                  placeholder="5.00"
                  className={inputClasses}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center">
                <Label className="text-xs text-gray-400">% PKO</Label>
                <InfoTip text="Fracao do buy-in destinada ao bounty pool. 50% e o padrao (PokerStars, GGPoker). 66% e usado em alguns torneios." />
              </div>
              <div className="flex gap-2">
                {pkoOptions.map((opt) => (
                  <Button
                    key={opt}
                    variant={pkoPercent === opt ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPkoPercent(opt)}
                    className={`flex-1 font-mono text-xs ${
                      pkoPercent === opt
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                        : "bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                    }`}
                  >
                    {opt}%
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dados do Villain */}
        <Card className="bg-gray-900 border-gray-800 text-gray-200">
          <CardContent className="p-4 space-y-3">
            <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Target className="h-3 w-3" />
              Dados do Villain
            </Label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center">
                  <Label className="text-xs text-gray-400">
                    Stack do Villain (Sv)
                  </Label>
                  <InfoTip text="Stack atual do oponente em fichas. Este e o jogador all-in que voce esta considerando pagar." />
                </div>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={svInput}
                  onChange={(e) => setSvInput(e.target.value)}
                  placeholder="10000"
                  className={inputClasses}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center">
                  <Label className="text-xs text-gray-400">
                    Bounty do Villain (Bv)
                  </Label>
                  <InfoTip text="Valor em dinheiro ($) do bounty atual do oponente. Quanto maior o bounty, maior a Drop Equity." />
                </div>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={bvInput}
                  onChange={(e) => setBvInput(e.target.value)}
                  placeholder="5.00"
                  className={inputClasses}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Optional: Dynamic Bounty Power */}
        <Collapsible open={optionalOpen} onOpenChange={setOptionalOpen}>
          <CollapsibleTrigger asChild>
            <button
              className="flex items-center justify-between w-full py-2.5 px-4 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-700 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Settings2 className="h-3.5 w-3.5" />
                <span className="text-xs">
                  Bounty Power Dinamico (opcional)
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  optionalOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <Card className="bg-gray-900 border-gray-800 text-gray-200">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center">
                      <Label className="text-xs text-gray-400">
                        Jogadores Iniciais
                      </Label>
                      <InfoTip text="Total de entradas no torneio. Necessario para calcular o Bounty Power dinamico." />
                    </div>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={jogIniciaisInput}
                      onChange={(e) => setJogIniciaisInput(e.target.value)}
                      placeholder="200"
                      className={inputClasses}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center">
                      <Label className="text-xs text-gray-400">
                        Jogadores Restantes
                      </Label>
                      <InfoTip text="Jogadores ainda vivos no torneio. Quanto menos restarem, menor o Bounty Power." />
                    </div>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={jogRestantesInput}
                      onChange={(e) => setJogRestantesInput(e.target.value)}
                      placeholder="140"
                      className={inputClasses}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  Preencha ambos os campos para que o Metodo 2 use um Bounty
                  Power dinamico (mais preciso no mid/late game). Sem estes
                  dados, o Metodo 2 usa o Bounty Power do inicio do torneio.
                </p>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Results */}
        {isValid && method1 && method2 && (
          <>
            <div className="pt-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-gray-800" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Resultados
                </span>
                <div className="h-px flex-1 bg-gray-800" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Card Method 1 */}
                <Card className="bg-gray-900 border-gray-800 text-gray-200">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        M1: Drop via Fichas
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <ResultRow
                        label="Bounty capturavel"
                        value={formatDollar(method1.bountyCapturavel)}
                        tooltip="50% do bounty do villain, pago em dinheiro ao elimina-lo."
                      />
                      <ResultRow
                        label="Bounty em fichas"
                        value={formatChips(method1.bountyFichas)}
                        tooltip="Valor do bounty convertido em fichas usando a taxa de cambio fixa do inicio do torneio."
                      />
                      <ResultRow
                        label="r (razao bounty/stack)"
                        value={formatR(method1.r)}
                        tooltip="Razao entre o bounty em fichas e o stack do villain. Quanto maior, maior a Drop Equity."
                      />

                      <div className="border-t border-gray-800 my-2" />

                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 flex items-center">
                            Equity Drop
                            <InfoTip text="Reducao em pontos percentuais na equity minima necessaria para dar call. Quanto maior, melhor para voce." />
                          </span>
                          <span className="font-mono font-bold text-base text-emerald-400">
                            -{formatPct(method1.equityDrop)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 flex items-center">
                            Eq. Necessaria
                            <InfoTip text="Equity minima que voce precisa ter contra o range do villain para justificar o call." />
                          </span>
                          <span className="font-mono font-bold text-base text-gray-100">
                            {formatPct(method1.equityNecessaria)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-gray-500 leading-relaxed mt-1">
                      Usa conversao fixa do inicio. Mais preciso no early/mid
                      game.
                    </p>
                  </CardContent>
                </Card>

                {/* Card Method 2 */}
                <Card className="bg-gray-900 border-gray-800 text-gray-200">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="h-3.5 w-3.5 text-blue-400" />
                      <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        M2: Bounty Power
                      </span>
                      {method2.isDynamic && (
                        <Badge className="text-[9px] px-1.5 py-0 bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/20">
                          Dinamico
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-2 text-xs">
                      <ResultRow
                        label="Bounty Power"
                        value={`${method2.bountyPower.toFixed(2)} ch/$`}
                        tooltip="Fator de conversao: quantas fichas vale $1 de bounty. No inicio, e igual a S0 / Buy-in total."
                      />
                      <ResultRow
                        label="Bounty em fichas (BP)"
                        value={formatChips(method2.bountyFichas)}
                        tooltip="Valor do bounty capturavel (50%) convertido em fichas via Bounty Power."
                      />

                      <div className="border-t border-gray-800 my-2" />

                      <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 flex items-center">
                            Equity Drop
                            <InfoTip text="Drop calculada via Bounty Power. Se dinamico, considera jogadores eliminados." />
                          </span>
                          <span className="font-mono font-bold text-base text-blue-400">
                            -{formatPct(method2.equityDrop)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 flex items-center">
                            Eq. Necessaria
                            <InfoTip text="Equity minima calculada via Bounty Power." />
                          </span>
                          <span className="font-mono font-bold text-base text-gray-100">
                            {formatPct(method2.equityNecessaria)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-gray-500 leading-relaxed mt-1">
                      {method2.isDynamic
                        ? "Usando Bounty Power dinamico estimado com base nos jogadores restantes."
                        : "Usando Bounty Power do inicio (baseline). O BP real diminui ao longo do torneio — a drop real pode ser menor."}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Analysis */}
            <Card className="bg-gray-900 border-gray-800 text-gray-200">
              <CardContent className="p-4 space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Analise
                </Label>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 block">
                      Buy-in Estimado
                    </span>
                    <span className="font-mono text-sm font-semibold text-gray-200">
                      {formatDollar(buyinEstimado)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-center">
                      <span className="text-[10px] text-gray-500">
                        Bounty Factor
                      </span>
                      <InfoTip text="(Bv/B0) / (Sv/S0) — quantos bounties iniciais por starting stack. Valor > 1 indica alvo com bounty acima da media." />
                    </div>
                    <span className="font-mono text-sm font-semibold text-gray-200">
                      {bountyFactor.toFixed(2)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 block">
                      Drop (M1)
                    </span>
                    <span className="font-mono text-sm font-semibold text-emerald-400">
                      -{(method1.equityDrop * 100).toFixed(2)}pp
                    </span>
                  </div>
                </div>

                <div
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-semibold ${targetInfo.bg}`}
                >
                  <Target className={`h-4 w-4 ${targetInfo.color}`} />
                  <span className={targetInfo.color}>{targetInfo.label}</span>
                </div>
              </CardContent>
            </Card>

            {/* Como Interpretar */}
            <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
              <CollapsibleTrigger asChild>
                <button
                  className="flex items-center justify-between w-full py-2.5 px-4 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-700 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span className="text-xs">Como Interpretar</span>
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
                  <CardContent className="p-4 space-y-4 text-xs text-gray-400 leading-relaxed">
                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">
                        O que e Equity Drop?
                      </h4>
                      <p>
                        Em torneios PKO, quando voce cobre o villain e ele esta
                        all-in, se voce vencer recebe 50% do bounty dele em
                        dinheiro. Isso funciona como "dead money" no pot,
                        reduzindo a equity minima para justificar o call. A
                        Equity Drop e exatamente essa reducao.
                      </p>
                    </section>

                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">
                        Metodo 1 vs Metodo 2
                      </h4>
                      <p>
                        <strong className="text-gray-300">Metodo 1</strong>{" "}
                        converte o bounty em fichas usando a taxa de cambio fixa
                        do inicio do torneio (S0 / buy-in). E simples e preciso
                        no early/mid game.
                      </p>
                      <p className="mt-1">
                        <strong className="text-gray-300">Metodo 2</strong>{" "}
                        usa o conceito de Bounty Power (GTO Wizard) — uma
                        conversao dinamica que leva em conta fichas em jogo vs
                        pools restantes. Sem dados opcionais, ambos dao o mesmo
                        resultado. Com dados de jogadores, o M2 e mais preciso
                        no late game.
                      </p>
                    </section>

                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">
                        Bounty Factor
                      </h4>
                      <p>
                        Mede quantos bounties iniciais o villain tem por
                        starting stack. Valor {">"} 1 significa que o bounty
                        cresceu proporcionalmente mais do que o stack — alvo
                        mais lucrativo.
                      </p>
                    </section>

                    <section className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                      <h4 className="font-semibold text-gray-300 mb-1">
                        Exemplo rapido
                      </h4>
                      <p>
                        PKO 50/50, S0=10.000, B0=$5, villain com Sv=10.000 e
                        Bv=$5 (inicio do torneio):
                      </p>
                      <p className="font-mono text-emerald-400 mt-1">
                        r = 0.25 → Drop = 5.56% → Eq. Necessaria = 44.44%
                      </p>
                      <p className="mt-1">
                        Voce precisa de apenas 44.44% de equity (em vez de
                        50%) para dar call lucrativo.
                      </p>
                    </section>

                    <p className="text-[10px] text-gray-500 italic">
                      O Bounty Power real diminui ao longo do torneio. No early
                      game ambos os metodos convergem. No late game, o Metodo 2
                      com dados dinamicos e mais preciso.
                    </p>
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

// ─── Reusable result row ────────────────────────────────────

function ResultRow({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: string;
  tooltip: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400 flex items-center">
        {label}
        <InfoTip text={tooltip} />
      </span>
      <span className="font-mono text-gray-200">{value}</span>
    </div>
  );
}
