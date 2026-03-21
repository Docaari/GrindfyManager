import { useState, useMemo, useCallback } from "react";
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
  BarChart3,
  Info,
  Plus,
  Minus,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  ChevronDown,
  BookOpen,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface Player {
  id: number;
  name: string;
  stack: number;
}

interface Prize {
  position: number;
  amount: number;
}

interface BFRPResult {
  bf: number;
  rp: number;
  eqMin: number;
}

// ─── Utilities ──────────────────────────────────────────────────────

function parseNumber(value: string): number {
  const normalized = value.replace(",", ".");
  const num = parseFloat(normalized);
  return isNaN(num) || num < 0 ? 0 : num;
}

// ─── InfoTooltip helper ─────────────────────────────────────────────

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

// ─── Styled input for the dark poker theme ──────────────────────────

const inputClasses =
  "bg-gray-800/50 border-gray-700 text-gray-100 font-mono placeholder:text-gray-500 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50 h-9";

// ─── ICM (Malmuth-Harville) — Bitmask DFS, zero array allocations ───

function calculateICM(stacks: number[], prizes: number[]): number[] {
  const N = stacks.length;
  const S = stacks.reduce((a, b) => a + b, 0);
  if (S <= 0 || N === 0) return new Array(N).fill(0);

  const ev = new Float64Array(N);

  const active: number[] = [];
  for (let i = 0; i < N; i++) if (stacks[i] > 0) active.push(i);
  const A = active.length;
  if (A === 0) return new Array(N).fill(0);

  const pr = new Float64Array(A);
  for (let k = 0; k < A; k++) pr[k] = k < prizes.length ? prizes[k] : 0;

  function dfs(mask: number, remSum: number, prob: number, pos: number) {
    const prize = pr[pos];
    for (let ai = 0; ai < A; ai++) {
      if (mask & (1 << ai)) continue;
      const idx = active[ai];
      const si = stacks[idx];
      const p = prob * (si / remSum);
      ev[idx] += p * prize;
      if (pos + 1 < A) {
        dfs(mask | (1 << ai), remSum - si, p, pos + 1);
      }
    }
  }

  dfs(0, S, 1, 0);
  return Array.from(ev);
}

// ─── Bubble Factor & Risk Premium (single pair) ─────────────────────

function computeBFRP(evCurr: number, evWin: number, evLose: number): BFRPResult {
  const gain = evWin - evCurr;
  const loss = evCurr - evLose;

  let bf: number;
  const epsilon = 1e-10 * Math.max(1, evCurr);
  if (Math.abs(gain) < epsilon) {
    bf = loss > 0 ? Infinity : 0;
  } else {
    bf = loss / gain;
  }

  const eqMin = bf === Infinity ? 1 : bf / (bf + 1);
  return { bf, rp: eqMin - 0.5, eqMin };
}

// ─── Full RP Matrix — single baseline + symmetry cache ──────────────

function computeRPMatrix(
  stacks: number[],
  prizes: number[]
): { evBase: number[]; matrix: BFRPResult[][]; conservationError: number } {
  const N = stacks.length;
  const evBase = calculateICM(stacks, prizes);

  const totalEV = evBase.reduce((a, b) => a + b, 0);
  const totalPrizes = prizes.reduce((a, b) => a + b, 0);
  const conservationError = Math.abs(totalEV - totalPrizes);

  const identity: BFRPResult = { bf: 0, rp: 0, eqMin: 0.5 };
  const matrix: BFRPResult[][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => identity)
  );

  const icmCache = new Map<string, number[]>();
  function cachedICM(s: number[]): number[] {
    const key = s.join(",");
    let r = icmCache.get(key);
    if (!r) {
      r = calculateICM(s, prizes);
      icmCache.set(key, r);
    }
    return r;
  }

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (stacks[i] <= 0 || stacks[j] <= 0) continue;
      const eff = Math.min(stacks[i], stacks[j]);

      const sA = [...stacks];
      sA[i] += eff;
      sA[j] -= eff;
      const evA = cachedICM(sA);

      const sB = [...stacks];
      sB[i] -= eff;
      sB[j] += eff;
      const evB = cachedICM(sB);

      matrix[i][j] = computeBFRP(evBase[i], evA[i], evB[i]);
      matrix[j][i] = computeBFRP(evBase[j], evB[j], evA[j]);
    }
  }

  return { evBase, matrix, conservationError };
}

// ─── Color helpers (dark theme) ─────────────────────────────────────

function getRPColor(rp: number): string {
  if (rp <= 0.02) return "text-emerald-400";
  if (rp <= 0.05) return "text-amber-400";
  if (rp <= 0.10) return "text-orange-400";
  return "text-red-400";
}

function getRPBgColor(rp: number): string {
  if (rp <= 0.02) return "bg-emerald-500/15";
  if (rp <= 0.05) return "bg-amber-500/15";
  if (rp <= 0.10) return "bg-orange-500/15";
  return "bg-red-500/15";
}

// ─── Defaults ───────────────────────────────────────────────────────

const DEFAULT_PLAYERS: Player[] = [
  { id: 1, name: "J1", stack: 5000 },
  { id: 2, name: "J2", stack: 3000 },
  { id: 3, name: "J3", stack: 2000 },
];

const DEFAULT_PRIZES: Prize[] = [
  { position: 1, amount: 500 },
  { position: 2, amount: 300 },
  { position: 3, amount: 200 },
];

// ─── Component ──────────────────────────────────────────────────────

export default function RPCalculator() {
  const [players, setPlayers] = useState<Player[]>(DEFAULT_PLAYERS);
  const [prizes, setPrizes] = useState<Prize[]>(DEFAULT_PRIZES);
  const [helpOpen, setHelpOpen] = useState(false);

  const stacks = useMemo(() => players.map(p => p.stack), [players]);
  const prizeAmounts = useMemo(() => prizes.map(p => p.amount), [prizes]);

  const effectivePrizes = useMemo(
    () => prizeAmounts.slice(0, players.length),
    [prizeAmounts, players.length]
  );
  const totalPrizes = useMemo(
    () => effectivePrizes.reduce((a, b) => a + b, 0),
    [effectivePrizes]
  );

  const { evBase, matrix: rpMatrix, conservationError } = useMemo(
    () => computeRPMatrix(stacks, effectivePrizes),
    [stacks, effectivePrizes]
  );

  const totalChips = useMemo(
    () => stacks.reduce((a, b) => a + b, 0),
    [stacks]
  );

  const updatePlayerStack = useCallback((id: number, value: string) => {
    setPlayers(prev => prev.map(p =>
      p.id === id ? { ...p, stack: parseNumber(value) } : p
    ));
  }, []);

  const updatePlayerName = useCallback((id: number, name: string) => {
    setPlayers(prev => prev.map(p =>
      p.id === id ? { ...p, name } : p
    ));
  }, []);

  const updatePrize = useCallback((position: number, value: string) => {
    setPrizes(prev => prev.map(p =>
      p.position === position ? { ...p, amount: parseNumber(value) } : p
    ));
  }, []);

  const addPlayer = useCallback(() => {
    if (players.length >= 9) return;
    const newId = Math.max(...players.map(p => p.id)) + 1;
    setPlayers(prev => [...prev, { id: newId, name: `J${prev.length + 1}`, stack: 1000 }]);
  }, [players.length]);

  const removePlayer = useCallback(() => {
    if (players.length <= 2) return;
    setPlayers(prev => prev.slice(0, -1));
  }, [players.length]);

  const addPrize = useCallback(() => {
    if (prizes.length >= 9 || prizes.length >= players.length) return;
    setPrizes(prev => [...prev, { position: prev.length + 1, amount: 100 }]);
  }, [prizes.length, players.length]);

  const removePrize = useCallback(() => {
    if (prizes.length <= 1) return;
    setPrizes(prev => prev.slice(0, -1));
  }, [prizes.length]);

  const loadExample = useCallback(() => {
    setPlayers([
      { id: 1, name: "Hero", stack: 25000 },
      { id: 2, name: "BTN", stack: 18000 },
      { id: 3, name: "SB", stack: 12000 },
      { id: 4, name: "BB", stack: 8000 },
      { id: 5, name: "UTG", stack: 7000 },
    ]);
    setPrizes([
      { position: 1, amount: 2500 },
      { position: 2, amount: 1500 },
      { position: 3, amount: 1000 },
      { position: 4, amount: 600 },
      { position: 5, amount: 400 },
    ]);
  }, []);

  const reset = useCallback(() => {
    setPlayers(DEFAULT_PLAYERS);
    setPrizes(DEFAULT_PRIZES);
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="bg-gray-900 text-gray-200 rounded-xl p-4 sm:p-5 space-y-4 w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-500" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-gray-100">
                ICM & Risk Premium
              </h1>
              <p className="text-[11px] text-gray-500">
                Modelo Malmuth-Harville — Pressao ICM par-a-par
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadExample}
              className="text-gray-500 hover:text-gray-200"
              title="Carregar Exemplo (5 jogadores)"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
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
        </div>

        {/* Aviso */}
        <div className="flex items-center gap-2 rounded-lg border border-yellow-800/50 bg-yellow-950/30 px-3 py-2 text-xs text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Ferramenta em fase de testes e desenvolvimento.
        </div>

        {/* Jogadores */}
        <Card className="bg-gray-900 border-gray-800 text-gray-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Jogadores ({players.length})
              </Label>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={removePlayer}
                  disabled={players.length <= 2}
                  className="h-7 w-7 p-0 bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 disabled:opacity-30"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addPlayer}
                  disabled={players.length >= 9}
                  className="h-7 w-7 p-0 bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 disabled:opacity-30"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="grid grid-cols-[56px_1fr_68px] gap-2 text-[10px] text-gray-500 font-semibold uppercase tracking-wider px-0.5">
                <span>Nome</span>
                <span>Stack</span>
                <span className="text-right">ICM $</span>
              </div>
              {players.map((player, idx) => (
                <div key={player.id} className="grid grid-cols-[56px_1fr_68px] gap-2 items-center">
                  <Input
                    value={player.name}
                    onChange={(e) => updatePlayerName(player.id, e.target.value)}
                    className={`${inputClasses} text-xs px-2 font-semibold`}
                  />
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={player.stack || ""}
                    onChange={(e) => updatePlayerStack(player.id, e.target.value)}
                    placeholder="Stack"
                    className={inputClasses}
                  />
                  <div className="text-right font-mono text-sm font-bold text-emerald-400">
                    ${evBase[idx]?.toFixed(0) || 0}
                  </div>
                </div>
              ))}
            </div>

            {totalChips > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-gray-800">
                <span className="text-[10px] text-gray-500 flex items-center">
                  Total de fichas
                  <InfoTip text="Soma de todos os stacks. Deve permanecer constante durante o torneio." />
                </span>
                <span className="font-mono text-xs text-gray-300">
                  {totalChips.toLocaleString("pt-BR")}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Premios */}
        <Card className="bg-gray-900 border-gray-800 text-gray-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Premios ({prizes.length})
              </Label>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={removePrize}
                  disabled={prizes.length <= 1}
                  className="h-7 w-7 p-0 bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 disabled:opacity-30"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addPrize}
                  disabled={prizes.length >= 9 || prizes.length >= players.length}
                  className="h-7 w-7 p-0 bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 disabled:opacity-30"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              {prizes.map((prize) => (
                <div key={prize.position} className="grid grid-cols-[40px_1fr] gap-2 items-center">
                  <Badge className="text-[10px] px-1.5 py-0.5 justify-center bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-800">
                    {prize.position}º
                  </Badge>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={prize.amount || ""}
                    onChange={(e) => updatePrize(prize.position, e.target.value)}
                    placeholder="$"
                    className={inputClasses}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-gray-800">
              <span className="text-[10px] text-gray-500 flex items-center">
                Prize Pool Total
                <InfoTip text="Soma de todos os premios. A soma das equidades ICM deve ser igual a este valor (propriedade de conservacao)." />
              </span>
              <span className="font-mono text-sm font-bold text-gray-100">
                ${totalPrizes.toLocaleString("pt-BR")}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Conservation Warning */}
        {conservationError > 0.01 && totalPrizes > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Erro de conservacao: Soma ICM ($
              {evBase.reduce((a, b) => a + b, 0).toFixed(2)}) diferente do Prize Pool ($
              {totalPrizes.toFixed(2)})
            </span>
          </div>
        )}

        {/* Results — ICM Equities */}
        {players.length >= 2 && totalPrizes > 0 && (
          <>
            <div className="pt-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-gray-800" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Matriz Risk Premium
                </span>
                <div className="h-px flex-1 bg-gray-800" />
              </div>

              <Card className="bg-gray-900 border-gray-800 text-gray-200">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Hero (linha) vs Vilao (coluna)
                    </Label>
                    <span className="text-[10px] text-gray-500">
                      Equity adicional necessaria alem de 50%
                    </span>
                  </div>

                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="p-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-800">
                            RP %
                          </th>
                          {players.map((p, j) => (
                            <th
                              key={j}
                              className="p-1.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-800 min-w-[52px]"
                            >
                              {p.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {players.map((playerX, i) => (
                          <tr key={i} className="border-b border-gray-800/50 last:border-0">
                            <td className="p-1.5 text-xs font-semibold text-gray-300">
                              {playerX.name}
                            </td>
                            {players.map((_, j) => {
                              const cell = rpMatrix[i]?.[j];
                              const rp = cell?.rp || 0;
                              return (
                                <td key={j} className="p-1 text-center">
                                  {i === j ? (
                                    <span className="text-gray-700 text-xs">—</span>
                                  ) : (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          className={`px-1.5 py-1 rounded font-mono font-bold cursor-help text-xs ${getRPBgColor(rp)} ${getRPColor(rp)}`}
                                        >
                                          {(rp * 100).toFixed(1)}%
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        className="bg-gray-800 border-gray-700 text-gray-200"
                                      >
                                        <div className="space-y-1 p-1 text-xs">
                                          <p>
                                            <span className="text-gray-400">Bubble Factor:</span>{" "}
                                            <span className="font-mono font-bold text-gray-100">
                                              {cell?.bf === Infinity
                                                ? "\u221E"
                                                : (cell?.bf || 0).toFixed(3)}
                                            </span>
                                          </p>
                                          <p>
                                            <span className="text-gray-400">Eq. Minima:</span>{" "}
                                            <span className="font-mono font-bold text-gray-100">
                                              {((cell?.eqMin || 0.5) * 100).toFixed(1)}%
                                            </span>
                                          </p>
                                          <p>
                                            <span className="text-gray-400">Risk Premium:</span>{" "}
                                            <span className={`font-mono font-bold ${getRPColor(rp)}`}>
                                              +{(rp * 100).toFixed(1)}%
                                            </span>
                                          </p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Legend */}
                  <div className="flex items-center justify-center gap-3 pt-2 border-t border-gray-800">
                    <span className="flex items-center gap-1 text-[10px]">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30" />
                      <span className="text-gray-500">Baixa ≤2%</span>
                    </span>
                    <span className="flex items-center gap-1 text-[10px]">
                      <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/30" />
                      <span className="text-gray-500">Media ≤5%</span>
                    </span>
                    <span className="flex items-center gap-1 text-[10px]">
                      <span className="w-2.5 h-2.5 rounded-sm bg-orange-500/30" />
                      <span className="text-gray-500">Alta ≤10%</span>
                    </span>
                    <span className="flex items-center gap-1 text-[10px]">
                      <span className="w-2.5 h-2.5 rounded-sm bg-red-500/30" />
                      <span className="text-gray-500">Extrema &gt;10%</span>
                    </span>
                  </div>
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
                  <CardContent className="p-4 space-y-3 text-xs text-gray-400 leading-relaxed">
                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">
                        O que e ICM?
                      </h4>
                      <p>
                        O Independent Chip Model (Malmuth-Harville) calcula a equidade em dolares
                        de cada jogador baseado na distribuicao de fichas e na estrutura de premios.
                        Cada ficha tem valor decrescente — quem tem mais fichas tem menos valor
                        marginal por ficha.
                      </p>
                    </section>

                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">
                        Risk Premium
                      </h4>
                      <p>
                        O Risk Premium (RP) e a equity ADICIONAL que o Hero precisa (alem dos 50%
                        de pot odds em fichas) para justificar um all-in contra o Vilao. Um RP de
                        3.9% significa que voce precisa de 53.9% de equity, nao apenas 50%.
                      </p>
                    </section>

                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">
                        Bubble Factor
                      </h4>
                      <p>
                        BF = Perda / Ganho em $EV. Mede a assimetria entre o que voce perde ao
                        ser eliminado vs o que ganha ao dobrar. BF = 1.00 em cash game. Em
                        torneios multi-premiacao, BF {"> "}1.00 (mais a perder do que a ganhar).
                      </p>
                    </section>

                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">
                        Assimetria da Matriz
                      </h4>
                      <p>
                        A matriz e assimetrica: RP[Hero][Vilao] ≠ RP[Vilao][Hero]. O jogador
                        coberto (menor stack) tem RP MUITO maior contra o chip leader, pois
                        arrisca eliminacao total. O chip leader nunca e eliminado, entao seu RP
                        e baixo.
                      </p>
                    </section>

                    <section className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                      <h4 className="font-semibold text-gray-300 mb-1">
                        Exemplo rapido
                      </h4>
                      <p>
                        3 jogadores: J1=5000, J2=3000, J3=2000. Premios: $500/$300/$200.
                      </p>
                      <p className="font-mono text-emerald-400 mt-1">
                        J2 vs J1: RP = 29.9% → Eq. Minima = 79.9%
                      </p>
                      <p className="mt-1">
                        J2 precisa de quase 80% de equity contra J1 para justificar um all-in!
                        Isso porque se J2 perder, e eliminado ($EV = $0), mas se ganhar, vai de
                        $328 para $410 — ganho modesto vs perda total.
                      </p>
                    </section>

                    <p className="text-[10px] text-gray-500 italic">
                      Convencao da industria (ICMIZER, GTO Wizard, HRC): $EV = 0 quando
                      eliminado. Heads-up e winner-take-all sempre dao RP = 0%.
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
