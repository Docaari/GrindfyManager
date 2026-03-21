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
  Trophy,
  Target,
  Info,
  ChevronDown,
  Shield,
  AlertTriangle,
  BookOpen,
  TrendingUp,
} from "lucide-react";

// ─── Utilities ───────────────────────────────────────────────

function parseNum(v: string): number {
  const n = parseFloat(v.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function fmtChips(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtPct(fraction: number, dec = 1): string {
  return (fraction * 100).toFixed(dec) + "%";
}

function fmtDec(v: number, dec = 1): string {
  return v.toFixed(dec);
}

// ─── Core Math ───────────────────────────────────────────────

function cocCalc(stack: number, ref: number): number {
  return ref > 0 ? stack / ref : 0;
}

function mRatioCalc(
  stack: number,
  sb: number,
  bb: number,
  ante: number,
  players: number
): number {
  const cost = sb + bb + ante * players;
  return cost > 0 ? stack / cost : 999;
}

function costPerOrbit(
  sb: number,
  bb: number,
  ante: number,
  players: number
): number {
  return sb + bb + ante * players;
}

function elimRatePerOrbit(avgM: number): number {
  if (avgM <= 3) return 5;
  if (avgM <= 5) return 4;
  if (avgM <= 8) return 3;
  if (avgM <= 12) return 2;
  if (avgM <= 20) return 1.5;
  if (avgM <= 30) return 1;
  return 0.5;
}

function estimateOrbitsToEnd(
  remaining: number,
  seats: number,
  avgStack: number,
  orbCost: number
): number {
  const toElim = remaining - seats;
  if (toElim <= 0) return 0;
  const avgM = orbCost > 0 ? avgStack / orbCost : 999;
  return toElim / elimRatePerOrbit(avgM);
}

function survFactor(mRatio: number, orbToEnd: number): number {
  if (orbToEnd <= 0) return 1;
  return Math.min(1, mRatio / orbToEnd);
}

function posFactor(pos: number, remaining: number, seats: number): number {
  if (remaining <= 0 || seats <= 0) return 1;
  const rel = pos / remaining;
  const cutoff = seats / remaining;
  if (rel <= cutoff) {
    return 1.05 + 0.05 * (1 - rel / cutoff);
  }
  const excess = (rel - cutoff) / Math.max(0.01, 1 - cutoff);
  return 0.85 + 0.15 * (1 - Math.min(1, excess));
}

function fieldProbability(
  coc: number,
  relStack: number,
  remaining: number,
  seats: number
): number {
  if (remaining <= seats) return 0.99;
  if (coc <= 0 && relStack <= 0) return 0;

  const proximity = seats / remaining;
  const cocStr = Math.max(0.3, Math.min(4, coc * 2.5));
  const expo = 1 + cocStr;
  const raw = 1 - Math.pow(1 - proximity, expo);
  const logBoost =
    relStack >= 1
      ? 1 + Math.log2(relStack) * 0.15
      : Math.pow(Math.max(0.01, relStack), 0.25);
  const cocP =
    coc >= 1 ? 1 : Math.pow(Math.max(0.01, coc), 0.25);

  return Math.min(0.99, raw * logBoost * cocP);
}

function okearneyGuarantee(
  pos: number,
  seats: number,
  remaining: number
): boolean {
  return seats - pos > remaining - seats;
}

// ─── Status ──────────────────────────────────────────────────

interface Status {
  label: string;
  msg: string;
  rec: string;
  gradient: string;
  accent: string;
}

function getStatus(
  p: number,
  guaranteed: boolean,
  cocAboveTarget: boolean
): Status {
  if (guaranteed) {
    return {
      label: "VAGA GARANTIDA",
      msg: "Folde ABSOLUTAMENTE TUDO. Inclusive AA e KK. Faca STALL!",
      rec: "Nao jogue mais nenhuma mao. Use o maximo de tempo em cada decisao. Sua missao e sobreviver sem agir.",
      gradient: "from-emerald-600 to-emerald-700",
      accent: "text-emerald-400",
    };
  }
  if (cocAboveTarget) {
    return {
      label: "ACIMA DO ALVO",
      msg: "Stack acima do alvo. Folde absolutamente TUDO.",
      rec: "Voce ja tem fichas suficientes. Qualquer risco e desnecessario. Folde tudo e espere as vagas se preencherem.",
      gradient: "from-emerald-600 to-emerald-700",
      accent: "text-emerald-400",
    };
  }
  if (p >= 0.9) {
    return {
      label: "Altissima",
      msg: "Chance altissima. Folde praticamente tudo. So jogue com 90%+ de equity.",
      rec: "Modo ultra-conservador. Faca stall quando possivel. Apenas situacoes extremas justificam risco.",
      gradient: "from-emerald-600 to-emerald-700",
      accent: "text-emerald-400",
    };
  }
  if (p >= 0.7) {
    return {
      label: "Boa Chance",
      msg: "Boa chance. Modo preservacao. Evite spots de alta variancia.",
      rec: "Fold amplos sao corretos. Nao pague all-ins. Fold equity e sua arma principal.",
      gradient: "from-amber-500 to-amber-600",
      accent: "text-amber-400",
    };
  }
  if (p >= 0.5) {
    return {
      label: "Moderada",
      msg: "Chance moderada. Jogue seletivamente. Busque fold equity.",
      rec: "Prefira raise/fold a call. Evite coinflips. Busque fold equity com posicao.",
      gradient: "from-orange-500 to-orange-600",
      accent: "text-orange-400",
    };
  }
  if (p >= 0.3) {
    return {
      label: "Precisa Acumular",
      msg: "Precisa acumular fichas. Busque spots de fold equity com risco controlado.",
      rec: "Amplie range de shove. Busque fold equity. Evite calls marginais — seja o agressor.",
      gradient: "from-red-600 to-red-700",
      accent: "text-red-400",
    };
  }
  return {
    label: "Situacao Critica",
    msg: "Situacao critica. Precisa dobrar urgentemente.",
    rec: "Shove wide em posicao. Com M < 5, any-two pode ser correto. Nao espere — cada orbita custa caro.",
    gradient: "from-red-700 to-red-800",
    accent: "text-red-500",
  };
}

// ─── Helper components ───────────────────────────────────────

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

function MetricRow({
  label,
  value,
  tip,
  highlight,
}: {
  label: string;
  value: string;
  tip: string;
  highlight?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400 flex items-center text-xs">
        {label}
        <InfoTip text={tip} />
      </span>
      <span className={`font-mono text-xs ${highlight ?? "text-gray-200"}`}>
        {value}
      </span>
    </div>
  );
}

const inputCls =
  "bg-gray-800/50 border-gray-700 text-gray-100 font-mono placeholder:text-gray-500 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50 h-9";

type Mode = "targetStack" | "vagasGarantidas";

// ─── Main Component ──────────────────────────────────────────

export default function SatelliteCalculator() {
  const [mode, setMode] = useState<Mode>("targetStack");

  // Shared inputs
  const [stackInput, setStackInput] = useState("15000");
  const [remainingInput, setRemainingInput] = useState("35");
  const [seatsInput, setSeatsInput] = useState("10");
  const [sbInput, setSbInput] = useState("500");
  const [bbInput, setBbInput] = useState("1000");
  const [anteInput, setAnteInput] = useState("100");
  const [tableInput, setTableInput] = useState("9");

  // Mode 1 — Target Stack
  const [buyinInput, setBuyinInput] = useState("100");
  const [vagaInput, setVagaInput] = useState("1000");
  const [startStackInput, setStartStackInput] = useState("5000");

  // Mode 2 — Vagas Garantidas
  const [totalChipsInput, setTotalChipsInput] = useState("500000");
  const [positionInput, setPositionInput] = useState("8");

  // Shared — optional average stack override
  const [avgStackInput, setAvgStackInput] = useState("");

  // UI
  const [blindsOpen, setBlindsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Parsed values
  const stack = parseNum(stackInput);
  const remaining = Math.max(1, Math.floor(parseNum(remainingInput)));
  const seats = Math.max(1, Math.floor(parseNum(seatsInput)));
  const sb = parseNum(sbInput);
  const bb = parseNum(bbInput);
  const ante = parseNum(anteInput);
  const tablePlayers = Math.max(2, Math.floor(parseNum(tableInput)));
  const buyIn = parseNum(buyinInput);
  const vagaValue = parseNum(vagaInput);
  const startStack = parseNum(startStackInput);
  const totalChips = parseNum(totalChipsInput);
  const position = Math.max(1, Math.floor(parseNum(positionInput)));

  // Computed average field stack
  const computedAvgMode1 =
    buyIn > 0 && vagaValue > 0 && startStack > 0 && remaining > 0
      ? (seats * (vagaValue / buyIn) * startStack) / remaining
      : 0;
  const computedAvgMode2 =
    totalChips > 0 && remaining > 0 ? totalChips / remaining : 0;
  const avgFieldStack =
    avgStackInput && parseNum(avgStackInput) > 0
      ? parseNum(avgStackInput)
      : mode === "targetStack"
        ? computedAvgMode1
        : computedAvgMode2;

  // Mode 1 calc
  const mode1 = useMemo(() => {
    if (buyIn <= 0 || vagaValue <= 0 || startStack <= 0 || stack <= 0)
      return null;

    const targetStack = (vagaValue / buyIn) * startStack;
    const coc = cocCalc(stack, targetStack);
    const mR = mRatioCalc(stack, sb, bb, ante, tablePlayers);
    const orbCost = costPerOrbit(sb, bb, ante, tablePlayers);

    const inscPerVaga = vagaValue / buyIn;
    const estTotal = seats * inscPerVaga * startStack;
    const avgStack = remaining > 0 ? estTotal / remaining : 0;
    const orbEnd = estimateOrbitsToEnd(remaining, seats, avgStack, orbCost);
    const sF = survFactor(mR, orbEnd);

    const relStack = avgFieldStack > 0 ? stack / avgFieldStack : 0;

    let thresholdPct: number;
    let thresholdLabel: string;
    if (seats >= 20) {
      thresholdPct = 0.5;
      thresholdLabel = "Mega (20+ vagas)";
    } else if (seats >= 10) {
      thresholdPct = 0.7;
      thresholdLabel = "Medio (~10 vagas)";
    } else {
      thresholdPct = 0.85;
      thresholdLabel = "Pequeno (1-9 vagas)";
    }

    const fProb = fieldProbability(coc, relStack, remaining, seats);
    const mMod = Math.min(1, 0.70 + 0.30 * Math.min(1, mR / 20));
    const prob = Math.max(0, Math.min(0.99, fProb * mMod));
    const estFinalBB = (inscPerVaga * startStack) / 10;

    return {
      targetStack,
      coc,
      mRatio: mR,
      prob,
      orbEnd,
      survF: sF,
      thresholdPct,
      thresholdLabel,
      aboveThreshold: coc >= thresholdPct,
      inscPerVaga,
      estFinalBB,
      estTotal,
      distance: targetStack - stack,
      orbCost,
      relStack,
    };
  }, [
    buyIn, vagaValue, startStack, stack, remaining, seats,
    sb, bb, ante, tablePlayers, avgFieldStack,
  ]);

  // Mode 2 calc
  const mode2 = useMemo(() => {
    if (
      stack <= 0 || totalChips <= 0 || seats <= 0 ||
      remaining <= 0 || position <= 0
    )
      return null;

    const avgCashStack = totalChips / seats;
    const coc = cocCalc(stack, avgCashStack);
    const mR = mRatioCalc(stack, sb, bb, ante, tablePlayers);
    const orbCost = costPerOrbit(sb, bb, ante, tablePlayers);
    const avgStack = totalChips / remaining;
    const orbEnd = estimateOrbitsToEnd(remaining, seats, avgStack, orbCost);
    const sF = survFactor(mR, orbEnd);
    const pF = posFactor(position, remaining, seats);

    const relStack = avgFieldStack > 0 ? stack / avgFieldStack : 0;

    const guaranteed = okearneyGuarantee(position, seats, remaining);
    const distITM = seats - position;
    const outsideITM = remaining - seats;
    const insideITM = position <= seats;

    const bf = seats;
    const eqMin = bf / (bf + 1);
    const rp = (bf / (bf + 1)) * 100 - 50;

    const avgM = orbCost > 0 ? avgStack / orbCost : 999;
    const deepWarn = guaranteed && position > seats * 0.9 && avgM > 20;

    const fProb = fieldProbability(coc, relStack, remaining, seats);
    const mMod = Math.min(1, 0.70 + 0.30 * Math.min(1, mR / 20));
    const prob = guaranteed
      ? 0.99
      : Math.max(0, Math.min(0.98, fProb * mMod * pF));

    return {
      avgCashStack, coc, mRatio: mR, prob, guaranteed,
      distITM, outsideITM, insideITM, orbEnd, survF: sF,
      posF: pF, bf, eqMin, rp, deepWarn, orbCost, relStack,
    };
  }, [stack, totalChips, remaining, seats, position, sb, bb, ante, tablePlayers, avgFieldStack]);

  // Derived status
  const res = mode === "targetStack" ? mode1 : mode2;
  const prob = res
    ? mode === "targetStack" ? mode1!.prob : mode2!.prob
    : 0;
  const guaranteed =
    mode === "vagasGarantidas" && mode2?.guaranteed === true;
  const cocAboveTarget =
    mode === "targetStack" && mode1 != null && mode1.coc >= 1.0;
  const status = res ? getStatus(prob, guaranteed, cocAboveTarget) : null;
  const mR = res
    ? mode === "targetStack" ? mode1!.mRatio : mode2!.mRatio
    : 0;
  const insideITM =
    mode === "vagasGarantidas"
      ? mode2?.insideITM ?? false
      : mode1 ? mode1.coc >= mode1.thresholdPct : false;

  const mCritical = mR < 3;
  const mAlert = mR < 5 && !insideITM;
  const mWarning = mCritical
    ? {
        level: "critical" as const,
        title: "M-RATIO CRITICO",
        msg: `M = ${fmtDec(mR)} — Push-or-fold imediato! Cada orbita custa ${fmtChips(Math.round(res ? (mode === "targetStack" ? mode1!.orbCost : mode2!.orbCost) : 0))} fichas. Qualquer mao razoavel pode ser shove.`,
      }
    : mAlert
      ? {
          level: "alert" as const,
          title: "M-RATIO BAIXO",
          msg: `M = ${fmtDec(mR)} — Risco de ser blinded out! Voce precisa encontrar um spot para shove antes que as blinds te eliminem.`,
        }
      : null;

  const isValid =
    mode === "targetStack"
      ? buyIn > 0 && vagaValue > 0 && startStack > 0 && stack > 0
      : stack > 0 && totalChips > 0 && seats > 0 && remaining > 0 && position > 0;

  // Render
  return (
    <TooltipProvider delayDuration={200}>
      <div className="bg-gray-900 text-gray-200 rounded-xl p-4 sm:p-5 space-y-4 w-full max-w-2xl">
        {/* Header */}
        <div className="text-center space-y-1 pb-1">
          <div className="flex items-center justify-center gap-2">
            <Trophy className="h-5 w-5 text-emerald-500" />
            <h1 className="text-lg font-bold tracking-tight text-gray-100">
              Calculadora de Satelites
            </h1>
          </div>
          <p className="text-xs text-gray-500">
            Probabilidade de vaga — modelo Dara O'Kearney
          </p>
        </div>

        {/* Aviso */}
        <div className="flex items-center gap-2 rounded-lg border border-yellow-800/50 bg-yellow-950/30 px-3 py-2 text-xs text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Ferramenta em fase de testes e desenvolvimento.
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={mode === "targetStack" ? "default" : "outline"}
            size="sm"
            className={`flex-1 text-xs ${
              mode === "targetStack"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                : "bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
            }`}
            onClick={() => setMode("targetStack")}
          >
            <Target className="h-3.5 w-3.5 mr-1.5" />
            Target Stack
          </Button>
          <Button
            variant={mode === "vagasGarantidas" ? "default" : "outline"}
            size="sm"
            className={`flex-1 text-xs ${
              mode === "vagasGarantidas"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                : "bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
            }`}
            onClick={() => setMode("vagasGarantidas")}
          >
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            Vagas Garantidas
          </Button>
        </div>

        {/* Mode 1: Satellite Config */}
        {mode === "targetStack" && (
          <Card className="bg-gray-900 border-gray-800 text-gray-200">
            <CardContent className="p-4 space-y-3">
              <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Configuracao do Satelite
              </Label>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center">
                    <Label className="text-xs text-gray-400">Buy-in ($)</Label>
                    <InfoTip text="Valor do buy-in do satelite. Ex: $50" />
                  </div>
                  <Input type="text" inputMode="decimal" value={buyinInput}
                    onChange={(e) => setBuyinInput(e.target.value)} placeholder="100" className={inputCls} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center">
                    <Label className="text-xs text-gray-400">Vaga ($)</Label>
                    <InfoTip text="Valor do ticket/vaga para o torneio alvo. Ex: $1.000" />
                  </div>
                  <Input type="text" inputMode="decimal" value={vagaInput}
                    onChange={(e) => setVagaInput(e.target.value)} placeholder="1000" className={inputCls} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center">
                    <Label className="text-xs text-gray-400">Stack Ini.</Label>
                    <InfoTip text="Stack inicial que todos recebem ao comecar o satelite." />
                  </div>
                  <Input type="text" inputMode="numeric" value={startStackInput}
                    onChange={(e) => setStartStackInput(e.target.value)} placeholder="5000" className={inputCls} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mode 2: Tournament State */}
        {mode === "vagasGarantidas" && (
          <Card className="bg-gray-900 border-gray-800 text-gray-200">
            <CardContent className="p-4 space-y-3">
              <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Estado do Torneio
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center">
                    <Label className="text-xs text-gray-400">Fichas Totais</Label>
                    <InfoTip text="Total de fichas em jogo (inscritos x stack inicial). Aparece no lobby do torneio." />
                  </div>
                  <Input type="text" inputMode="numeric" value={totalChipsInput}
                    onChange={(e) => setTotalChipsInput(e.target.value)} placeholder="500000" className={inputCls} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center">
                    <Label className="text-xs text-gray-400">Sua Posicao</Label>
                    <InfoTip text="Seu ranking por stack (chip count). 1 = chip leader. Veja no lobby." />
                  </div>
                  <Input type="text" inputMode="numeric" value={positionInput}
                    onChange={(e) => setPositionInput(e.target.value)} placeholder="8" className={inputCls} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Shared: Situacao Atual */}
        <Card className="bg-gray-900 border-gray-800 text-gray-200">
          <CardContent className="p-4 space-y-3">
            <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" />
              Situacao Atual
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center">
                  <Label className="text-xs text-gray-400">Seu Stack</Label>
                  <InfoTip text="Seu stack atual de fichas." />
                </div>
                <Input type="text" inputMode="numeric" value={stackInput}
                  onChange={(e) => setStackInput(e.target.value)} placeholder="15000" className={inputCls} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center">
                  <Label className="text-xs text-gray-400">Stack Medio</Label>
                  <InfoTip text="Stack medio do field (fichas totais / jogadores restantes). Aparece no lobby. Se vazio, estimado automaticamente." />
                </div>
                <Input type="text" inputMode="numeric" value={avgStackInput}
                  onChange={(e) => setAvgStackInput(e.target.value)}
                  placeholder={avgFieldStack > 0 ? fmtChips(Math.round(avgFieldStack)) : "auto"}
                  className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center">
                  <Label className="text-xs text-gray-400">Restantes</Label>
                  <InfoTip text="Total de jogadores ainda vivos no satelite." />
                </div>
                <Input type="text" inputMode="numeric" value={remainingInput}
                  onChange={(e) => setRemainingInput(e.target.value)} placeholder="35" className={inputCls} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center">
                  <Label className="text-xs text-gray-400">Vagas</Label>
                  <InfoTip text="Numero de tickets/vagas que serao distribuidos." />
                </div>
                <Input type="text" inputMode="numeric" value={seatsInput}
                  onChange={(e) => setSeatsInput(e.target.value)} placeholder="10" className={inputCls} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Collapsible: Blinds & Mesa */}
        <Collapsible open={blindsOpen} onOpenChange={setBlindsOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full py-2.5 px-4 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-700 transition-colors">
              <span className="flex items-center gap-2">
                <span className="text-xs">Blinds & Mesa</span>
                {!blindsOpen && (
                  <Badge className="text-[9px] px-1.5 py-0 bg-gray-700/50 text-gray-400 border-gray-600 hover:bg-gray-700/50">
                    {fmtChips(sb)}/{fmtChips(bb)} + {fmtChips(ante)}
                  </Badge>
                )}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${blindsOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <Card className="bg-gray-900 border-gray-800 text-gray-200">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-400">SB</Label>
                    <Input type="text" inputMode="numeric" value={sbInput}
                      onChange={(e) => setSbInput(e.target.value)} placeholder="500" className={inputCls} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-400">BB</Label>
                    <Input type="text" inputMode="numeric" value={bbInput}
                      onChange={(e) => setBbInput(e.target.value)} placeholder="1000" className={inputCls} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-400">Ante</Label>
                    <Input type="text" inputMode="numeric" value={anteInput}
                      onChange={(e) => setAnteInput(e.target.value)} placeholder="100" className={inputCls} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-400">Mesa</Label>
                    <Input type="text" inputMode="numeric" value={tableInput}
                      onChange={(e) => setTableInput(e.target.value)} placeholder="9" className={inputCls} />
                  </div>
                </div>
                <p className="text-[10px] text-gray-500">
                  Afeta a probabilidade via M-Ratio (sobrevivencia em
                  sit-out). Valores incorretos nao invalidam o calculo, mas
                  blinds corretos melhoram a precisao.
                </p>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* RESULTS */}
        {isValid && res && status && (
          <>
            <div className="pt-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-gray-800" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Resultado
                </span>
                <div className="h-px flex-1 bg-gray-800" />
              </div>
            </div>

            {/* Probability */}
            <div className={`p-5 rounded-xl bg-gradient-to-br ${status.gradient} text-white shadow-lg`}>
              <div className="text-center space-y-2">
                <div className="text-xs font-bold uppercase tracking-widest opacity-90">
                  Probabilidade de Vaga
                </div>
                <div className="text-5xl font-black font-mono">
                  {guaranteed || cocAboveTarget ? "99%+" : fmtPct(prob)}
                </div>
                <Badge className={`text-xs px-3 py-0.5 ${
                  guaranteed || cocAboveTarget || prob >= 0.7
                    ? "bg-white/20 text-white border-white/30"
                    : "bg-black/20 text-white/90 border-white/20"
                } hover:bg-white/20`}>
                  {status.label}
                </Badge>
                <p className="text-sm opacity-90 mt-2 leading-relaxed max-w-sm mx-auto">
                  {status.msg}
                </p>
              </div>
            </div>

            {/* M-Ratio Warning */}
            {mWarning && (
              <div className={`p-4 rounded-xl border-2 ${
                mWarning.level === "critical"
                  ? "bg-red-500/15 border-red-500/60"
                  : "bg-amber-500/10 border-amber-500/40"
              }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle className={`h-5 w-5 shrink-0 ${
                    mWarning.level === "critical" ? "text-red-400 animate-pulse" : "text-amber-400"
                  }`} />
                  <span className={`text-sm font-bold tracking-wide ${
                    mWarning.level === "critical" ? "text-red-400" : "text-amber-400"
                  }`}>
                    {mWarning.title}
                  </span>
                </div>
                <p className={`text-xs leading-relaxed ml-7 ${
                  mWarning.level === "critical" ? "text-red-300" : "text-amber-300"
                }`}>
                  {mWarning.msg}
                </p>
              </div>
            )}

            {/* Mode 2: O'Kearney Guarantee */}
            {mode === "vagasGarantidas" && mode2 && (
              <Card className="bg-gray-900 border-gray-800 text-gray-200">
                <CardContent className="p-4 space-y-2">
                  <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="h-3 w-3" />
                    Regra de Garantia (O'Kearney)
                  </Label>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-gray-500 block">Buffer</span>
                      <span className={`font-mono text-sm font-semibold ${mode2.distITM > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {mode2.distITM > 0 ? `+${mode2.distITM}` : mode2.distITM}
                      </span>
                      <span className="text-[10px] text-gray-500 block">ate bolha</span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-gray-500 block">A Eliminar</span>
                      <span className="font-mono text-sm font-semibold text-gray-200">{mode2.outsideITM}</span>
                      <span className="text-[10px] text-gray-500 block">jogadores</span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-gray-500 block">Garantia</span>
                      <span className={`font-mono text-sm font-semibold ${mode2.guaranteed ? "text-emerald-400" : "text-red-400"}`}>
                        {mode2.guaranteed ? "SIM" : "NAO"}
                      </span>
                      <span className="text-[10px] text-gray-500 block">
                        {mode2.distITM} {">"} {mode2.outsideITM} ?
                      </span>
                    </div>
                  </div>
                  {mode2.deepWarn && (
                    <p className="text-[10px] text-amber-400 mt-2">
                      Vaga garantida, mas stacks profundos (M medio alto).
                      Blinds podem demorar a eliminar jogadores. Continue atento.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Key Metrics */}
            <Card className="bg-gray-900 border-gray-800 text-gray-200">
              <CardContent className="p-4 space-y-2">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Metricas Principais
                </Label>

                <MetricRow label="COC"
                  value={fmtPct(mode === "targetStack" ? mode1!.coc : mode2!.coc)}
                  tip="Chance of Cashing (O'Kearney): seu stack / stack alvo. Proxy principal da equity em satelites."
                  highlight={(mode === "targetStack" ? mode1!.coc : mode2!.coc) >= 1 ? "text-emerald-400" : undefined} />
                <MetricRow label="Rel. ao Field"
                  value={`${fmtDec(mode === "targetStack" ? (mode1?.relStack ?? 0) : (mode2?.relStack ?? 0), 2)}x`}
                  tip="Seu stack / stack medio do field. >1 = acima da media (seguro). <1 = abaixo da media (risco)."
                  highlight={
                    (mode === "targetStack" ? (mode1?.relStack ?? 0) : (mode2?.relStack ?? 0)) >= 1
                      ? "text-emerald-400"
                      : (mode === "targetStack" ? (mode1?.relStack ?? 0) : (mode2?.relStack ?? 0)) >= 0.5
                        ? "text-amber-400" : "text-red-400"
                  } />
                <MetricRow label="Stack Medio"
                  value={fmtChips(Math.round(avgFieldStack))}
                  tip="Stack medio atual do field. Calculado de fichas totais / jogadores restantes, ou informado manualmente." />
                <MetricRow label="M-Ratio" value={fmtDec(mR)}
                  tip="Orbitas que seu stack aguenta em sit-out. M < 10 = perigo. M < 5 = critico."
                  highlight={mR < 5 ? "text-red-400" : mR < 10 ? "text-amber-400" : undefined} />

                {mode === "targetStack" && mode1 && (
                  <>
                    <MetricRow label="Stack Alvo" value={fmtChips(mode1.targetStack)}
                      tip="Stack necessario: (Vaga / Buy-in) x Stack Inicial." />
                    <MetricRow label="Distancia"
                      value={mode1.distance <= 0 ? "Atingido!" : `+${fmtChips(mode1.distance)}`}
                      tip="Fichas que faltam para atingir o stack alvo."
                      highlight={mode1.distance <= 0 ? "text-emerald-400" : undefined} />
                    <MetricRow label="Tipo" value={mode1.thresholdLabel}
                      tip="Classificacao pelo numero de vagas. Define o threshold de preservacao." />
                    <MetricRow label="Threshold" value={`${fmtPct(mode1.thresholdPct, 0)} do alvo`}
                      tip="A partir deste % do stack alvo, entre em modo preservacao." />
                  </>
                )}

                {mode === "vagasGarantidas" && mode2 && (
                  <>
                    <MetricRow label="Stack Medio ITM" value={fmtChips(mode2.avgCashStack)}
                      tip="Fichas Totais / Vagas. Stack medio de cada classificado." />
                    <MetricRow label="Posicao"
                      value={`${position}/${remaining} (${mode2.insideITM ? "dentro" : "fora"} das ${seats} vagas)`}
                      tip="Seu ranking atual por chip count."
                      highlight={mode2.insideITM ? "text-emerald-400" : "text-red-400"} />
                  </>
                )}

                <div className="border-t border-gray-800 my-2" />

                <MetricRow label="Sobrevivencia"
                  value={fmtPct(mode === "targetStack" ? mode1!.survF : mode2!.survF)}
                  tip="Probabilidade de sobreviver via sit-out. M-Ratio / orbitas estimadas."
                  highlight={(mode === "targetStack" ? mode1!.survF : mode2!.survF) >= 1 ? "text-emerald-400" : "text-amber-400"} />
                <MetricRow label="Orbitas ate Fim"
                  value={`~${fmtDec(mode === "targetStack" ? mode1!.orbEnd : mode2!.orbEnd)}`}
                  tip="Estimativa de orbitas ate que os jogadores sejam eliminados." />
                {mode === "vagasGarantidas" && mode2 && (
                  <MetricRow label="Fator Posicional" value={`x${fmtDec(mode2.posF, 2)}`}
                    tip="Ajuste por posicao. Dentro = bonus (+5-10%). Fora = penalidade (-5-15%)." />
                )}
              </CardContent>
            </Card>

            {/* Strategic Recommendation */}
            <div className={`p-4 rounded-lg border ${
              guaranteed || cocAboveTarget || prob >= 0.7
                ? "bg-emerald-500/10 border-emerald-500/20"
                : prob >= 0.5
                  ? "bg-amber-500/10 border-amber-500/20"
                  : "bg-red-500/10 border-red-500/20"
            }`}>
              <div className="flex items-start gap-2">
                <Shield className={`h-4 w-4 mt-0.5 shrink-0 ${status.accent}`} />
                <div>
                  <p className="text-xs font-semibold text-gray-200 mb-1">
                    Recomendacao Estrategica
                  </p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {status.rec}
                  </p>
                </div>
              </div>
            </div>

            {/* Collapsible: Bubble Factor (Mode 2) */}
            {mode === "vagasGarantidas" && mode2 && (
              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center justify-between w-full py-2.5 px-4 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-700 transition-colors">
                    <span className="flex items-center gap-2">
                      <span className="text-xs">Bubble Factor & Detalhes</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <Card className="bg-gray-900 border-gray-800 text-gray-200">
                    <CardContent className="p-4 space-y-2">
                      <MetricRow label="Bubble Factor" value={`~${mode2.bf}`}
                        tip="Na bolha do satelite, BF ~ numero de vagas. Quanto maior, mais conservador." />
                      <MetricRow label="Eq. Minima p/ Call" value={fmtPct(mode2.eqMin)}
                        tip="Equity minima para call na bolha: BF / (BF + 1). Em satelites, voce precisa de equity absurda." />
                      <MetricRow label="Risk Premium" value={`${fmtDec(mode2.rp)}pp`}
                        tip="Pontos percentuais acima de 50% para justificar risco." />
                      <MetricRow label="Custo/Orbita" value={fmtChips(mode2.orbCost)}
                        tip="SB + BB + (Ante x Mesa). Custo de uma orbita em sit-out." />
                      <div className="border-t border-gray-800 my-2" />
                      <p className="text-[10px] text-gray-500 leading-relaxed">
                        Com {seats} vagas, voce precisa de{" "}
                        {fmtPct(mode2.eqMin)} de equity para call all-in na
                        bolha. Foldar AA (~85% vs range) pode ser
                        matematicamente correto. A fold equity vale mais que o
                        showdown.
                      </p>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Collapsible: Details (Mode 1) */}
            {mode === "targetStack" && mode1 && (
              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center justify-between w-full py-2.5 px-4 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-700 transition-colors">
                    <span className="flex items-center gap-2">
                      <span className="text-xs">Detalhes & Estimativas</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <Card className="bg-gray-900 border-gray-800 text-gray-200">
                    <CardContent className="p-4 space-y-2">
                      <MetricRow label="Inscritos/Vaga" value={fmtDec(mode1.inscPerVaga, 0)}
                        tip="Valor_da_Vaga / Buy-in. Ratio de inscritos por vaga." />
                      <MetricRow label="Fichas Totais (est.)" value={fmtChips(mode1.estTotal)}
                        tip="Vagas x Inscritos/Vaga x Stack Inicial." />
                      <MetricRow label="BB Final (est.)" value={fmtChips(mode1.estFinalBB)}
                        tip="Bernard Lee: (Inscritos/Vaga x Stack_Inicial) / 10." />
                      <MetricRow label="Custo/Orbita" value={fmtChips(mode1.orbCost)}
                        tip="SB + BB + (Ante x Mesa). Custo de uma orbita em sit-out." />
                      {mode1.aboveThreshold && (
                        <div className="mt-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                          <p className="text-[10px] text-emerald-400">
                            Acima do threshold de preservacao (
                            {fmtPct(mode1.thresholdPct, 0)}). Reduza variancia e
                            preserve seu stack.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Collapsible: How It Works */}
            <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full py-2.5 px-4 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-700 transition-colors">
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span className="text-xs">Como Funciona</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${helpOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <Card className="bg-gray-900 border-gray-800 text-gray-200">
                  <CardContent className="p-4 space-y-4 text-xs text-gray-400 leading-relaxed">
                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">O que e um Satelite?</h4>
                      <p>
                        Torneio qualificatorio onde TODOS os classificados
                        recebem o MESMO premio (ticket). Fichas alem do
                        necessario para sobreviver tem valor marginal zero.
                      </p>
                    </section>
                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">COC — Chance of Cashing</h4>
                      <p>
                        Metrica central de Dara O'Kearney. Target Stack:
                        Stack/Stack_Alvo. Vagas: Stack/(Total/Vagas). Proxy da
                        equity ICM em satelites.
                      </p>
                    </section>
                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">Regra de Garantia</h4>
                      <p>
                        Se (Vagas - Posicao) {">"} (Restantes - Vagas), sua vaga
                        e matematicamente garantida via sit-out. Folde TUDO,
                        inclusive AA, e faca stall.
                      </p>
                    </section>
                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">M-Ratio e Sobrevivencia</h4>
                      <p>
                        M = Stack / (SB + BB + Ante x Mesa). Se M {">"} orbitas
                        ate o fim, voce sobrevive em sit-out. Quanto maior o M,
                        mais seguro.
                      </p>
                    </section>
                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">Bubble Factor</h4>
                      <p>
                        Na bolha, BF ~ numero de vagas. Com 10 vagas: equity
                        minima = 10/11 = 90.9%. Foldar AA (~85% vs range) pode
                        ser correto!
                      </p>
                    </section>
                    <section className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                      <h4 className="font-semibold text-gray-300 mb-1">Principio Fundamental</h4>
                      <p>
                        "Devo continuar jogando ou meu stack ja garante a vaga
                        via sit-out?" Se sim, folde TUDO. Qualquer risco de
                        eliminacao tem custo catastrofico vs. ganho marginal
                        zero.
                      </p>
                    </section>
                    <p className="text-[10px] text-gray-500 italic">
                      Baseado em Dara O'Kearney & Barry Carter ("Satellite
                      Poker Strategy"). Estimativas usam fatores empiricos e
                      podem variar.
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
