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
  Gift,
  Info,
  ChevronDown,
  Plus,
  Minus,
  Trash2,
  RotateCcw,
  Sparkles,
  ArrowUpDown,
  BookOpen,
  Package,
  DollarSign,
  Percent,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────

interface Tier {
  id: number;
  value: number;
  quantity: number;
}

// ─── Utilities ───────────────────────────────────────────────

function parseNumber(value: string): number {
  let normalized = value.replace(/\s/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (normalized.includes(",")) {
    const parts = normalized.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = normalized.replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  }
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ─── Presets ─────────────────────────────────────────────────

const DEFAULT_TIERS: Tier[] = [
  { id: 1, value: 10000, quantity: 1 },
  { id: 2, value: 5000, quantity: 2 },
  { id: 3, value: 2000, quantity: 5 },
  { id: 4, value: 1000, quantity: 10 },
  { id: 5, value: 500, quantity: 20 },
  { id: 6, value: 250, quantity: 30 },
  { id: 7, value: 100, quantity: 50 },
];

const EXAMPLE_TIERS: Tier[] = [
  { id: 1, value: 50000, quantity: 1 },
  { id: 2, value: 10000, quantity: 3 },
  { id: 3, value: 5000, quantity: 8 },
  { id: 4, value: 2500, quantity: 15 },
  { id: 5, value: 1000, quantity: 40 },
  { id: 6, value: 500, quantity: 80 },
  { id: 7, value: 250, quantity: 150 },
  { id: 8, value: 100, quantity: 300 },
];

type SortMode = "value" | "probability";

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
  "bg-gray-800/50 border-gray-700 text-gray-100 font-mono placeholder:text-gray-500 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50 h-8 text-sm";

// ─── Main Component ─────────────────────────────────────────

export default function MysteryBountyCalculator() {
  const [tiers, setTiers] = useState<Tier[]>(DEFAULT_TIERS);
  const [sortMode, setSortMode] = useState<SortMode>("value");
  const [showZeros, setShowZeros] = useState(false);
  const [nextId, setNextId] = useState(8);
  const [helpOpen, setHelpOpen] = useState(false);

  const totalEnvelopes = useMemo(() =>
    tiers.reduce((sum, t) => sum + t.quantity, 0),
    [tiers]
  );

  const totalSum = useMemo(() =>
    tiers.reduce((sum, t) => sum + t.quantity * t.value, 0),
    [tiers]
  );

  const expectedValue = useMemo(() =>
    totalEnvelopes > 0 ? totalSum / totalEnvelopes : 0,
    [totalSum, totalEnvelopes]
  );

  const tierStats = useMemo(() => {
    return tiers
      .filter(t => showZeros || t.quantity > 0)
      .map(t => ({
        ...t,
        probability: totalEnvelopes > 0 ? (t.quantity / totalEnvelopes) * 100 : 0,
        subtotal: t.quantity * t.value,
        evContribution: totalEnvelopes > 0 ? (t.quantity * t.value) / totalEnvelopes : 0,
      }))
      .sort((a, b) => {
        if (sortMode === "value") return b.value - a.value;
        return b.probability - a.probability;
      });
  }, [tiers, totalEnvelopes, sortMode, showZeros]);

  const updateTierValue = useCallback((id: number, value: string) => {
    setTiers(prev => prev.map(t =>
      t.id === id ? { ...t, value: parseNumber(value) } : t
    ));
  }, []);

  const updateTierQuantity = useCallback((id: number, value: string) => {
    const qty = parseInt(value) || 0;
    setTiers(prev => prev.map(t =>
      t.id === id ? { ...t, quantity: Math.max(0, qty) } : t
    ));
  }, []);

  const incrementTier = useCallback((id: number) => {
    setTiers(prev => prev.map(t =>
      t.id === id ? { ...t, quantity: t.quantity + 1 } : t
    ));
  }, []);

  const decrementTier = useCallback((id: number) => {
    setTiers(prev => prev.map(t =>
      t.id === id ? { ...t, quantity: Math.max(0, t.quantity - 1) } : t
    ));
  }, []);

  const removeTier = useCallback((id: number) => {
    setTiers(prev => prev.filter(t => t.id !== id));
  }, []);

  const addTier = useCallback(() => {
    setTiers(prev => [...prev, { id: nextId, value: 100, quantity: 1 }]);
    setNextId(prev => prev + 1);
  }, [nextId]);

  const loadExample = useCallback(() => {
    setTiers(EXAMPLE_TIERS);
    setNextId(9);
  }, []);

  const reset = useCallback(() => {
    setTiers([{ id: 1, value: 100, quantity: 1 }]);
    setNextId(2);
  }, []);

  const toggleSort = useCallback(() => {
    setSortMode(prev => prev === "value" ? "probability" : "value");
  }, []);

  const minBounty = useMemo(() => {
    const active = tiers.filter(t => t.quantity > 0);
    return active.length > 0 ? Math.min(...active.map(t => t.value)) : 0;
  }, [tiers]);

  const maxBounty = useMemo(() => {
    const active = tiers.filter(t => t.quantity > 0);
    return active.length > 0 ? Math.max(...active.map(t => t.value)) : 0;
  }, [tiers]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="bg-gray-900 text-gray-200 rounded-xl p-4 sm:p-5 space-y-4 w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-emerald-500" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-gray-100">
                Mystery Bounty Calculator
              </h1>
              <p className="text-[11px] text-gray-500">
                Sorteio uniforme entre envelopes — calcula EV do proximo KO
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadExample}
              className="text-gray-500 hover:text-gray-200"
              title="Carregar Exemplo"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="text-gray-500 hover:text-gray-200"
              title="Limpar"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-gray-900 border-gray-800 text-gray-200">
            <CardContent className="p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-gray-500 mb-1">
                <Package className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium">Envelopes</span>
              </div>
              <div className="text-xl font-bold font-mono text-gray-200">
                {totalEnvelopes}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800 text-gray-200">
            <CardContent className="p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-gray-500 mb-1">
                <DollarSign className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium">Pool Total</span>
              </div>
              <div className="text-xl font-bold font-mono text-gray-200">
                ${formatCurrency(totalSum)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-emerald-500/10 border-emerald-500/30 text-gray-200">
            <CardContent className="p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-emerald-400 mb-1">
                <Percent className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium">Media (EV)</span>
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400">
                ${formatCurrency(expectedValue)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tier Configuration */}
        <Card className="bg-gray-900 border-gray-800 text-gray-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Tiers de Bounty ({tiers.length})
              </Label>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowZeros(!showZeros)}
                  className="h-7 text-[10px] bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                >
                  {showZeros ? "Ocultar Zerados" : "Mostrar Zerados"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addTier}
                  className="h-7 text-[10px] bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Tier
                </Button>
              </div>
            </div>

            {/* Tier grid header */}
            <div className="grid grid-cols-[1fr_70px_90px_72px] gap-2 text-[10px] text-gray-600 font-medium px-1">
              <span>Valor ($)</span>
              <span className="text-center">Qtd</span>
              <span className="text-center">Subtotal</span>
              <span className="text-center">Acoes</span>
            </div>

            {/* Tier rows */}
            <div className="space-y-1.5">
              {tiers
                .filter(t => showZeros || t.quantity > 0)
                .sort((a, b) => b.value - a.value)
                .map((tier) => (
                  <div key={tier.id} className="grid grid-cols-[1fr_70px_90px_72px] gap-2 items-center">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={tier.value || ""}
                      onChange={(e) => updateTierValue(tier.id, e.target.value)}
                      placeholder="Valor"
                      className={inputClasses}
                    />
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={tier.quantity}
                      onChange={(e) => updateTierQuantity(tier.id, e.target.value)}
                      className={`${inputClasses} text-center`}
                    />
                    <div className="text-center font-mono text-xs text-gray-500">
                      ${formatCurrency(tier.quantity * tier.value)}
                    </div>
                    <div className="flex gap-0.5 justify-center">
                      <button
                        onClick={() => decrementTier(tier.id)}
                        disabled={tier.quantity <= 0}
                        className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => incrementTier(tier.id)}
                        className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => removeTier(tier.id)}
                        className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            {totalEnvelopes === 0 && (
              <div className="text-center py-3 text-gray-600 text-xs">
                Adicione tiers (qtd &gt; 0) para calcular.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Probability Table */}
        {totalEnvelopes > 0 && (
          <>
            <div className="pt-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-gray-800" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Probabilidades
                </span>
                <div className="h-px flex-1 bg-gray-800" />
              </div>

              <Card className="bg-gray-900 border-gray-800 text-gray-200">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Distribuicao por Tier
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSort}
                      className="h-7 text-[10px] bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                    >
                      <ArrowUpDown className="h-3 w-3 mr-1" />
                      {sortMode === "value" ? "Por Valor" : "Por Prob."}
                    </Button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="p-2 text-left font-semibold text-gray-500 border-b border-gray-800">Valor</th>
                          <th className="p-2 text-center font-semibold text-gray-500 border-b border-gray-800">Qtd</th>
                          <th className="p-2 text-center font-semibold text-gray-500 border-b border-gray-800">Chance</th>
                          <th className="p-2 text-right font-semibold text-gray-500 border-b border-gray-800">Contrib. EV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tierStats.map((tier) => (
                          <tr key={tier.id} className="border-b border-gray-800/50 last:border-0">
                            <td className="p-2 font-mono font-semibold text-gray-200">
                              ${formatCurrency(tier.value)}
                            </td>
                            <td className="p-2 text-center font-mono text-gray-400">
                              {tier.quantity}
                            </td>
                            <td className="p-2 text-center">
                              <Badge
                                variant="secondary"
                                className={`font-mono text-[10px] px-1.5 py-0 border ${
                                  tier.probability >= 10
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                    : tier.probability >= 5
                                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                    : tier.probability >= 1
                                    ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                                    : "bg-red-500/15 text-red-400 border-red-500/30"
                                }`}
                              >
                                {tier.probability.toFixed(2)}%
                              </Badge>
                            </td>
                            <td className="p-2 text-right font-mono text-gray-500">
                              +${formatCurrency(tier.evContribution)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Min / Max summary */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">Bounty Minimo</span>
                      <span className="font-mono text-xs font-semibold text-gray-300">
                        ${formatCurrency(minBounty)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">Bounty Maximo</span>
                      <span className="font-mono text-xs font-semibold text-gray-300">
                        ${formatCurrency(maxBounty)}
                      </span>
                    </div>
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
                        O que e Mystery Bounty?
                      </h4>
                      <p>
                        Em torneios Mystery Bounty, ao eliminar um jogador voce
                        recebe um envelope aleatorio de um pool pre-definido.
                        Os envelopes tem valores diferentes com quantidades
                        limitadas — nao ha reposicao.
                      </p>
                    </section>

                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">
                        EV (Valor Esperado)
                      </h4>
                      <p>
                        O EV medio e o pool total dividido pelo numero de
                        envelopes. Representa quanto voce espera ganhar, em
                        media, por cada KO. Use este valor para ajustar suas
                        decisoes de call/fold em spots de bounty.
                      </p>
                    </section>

                    <section>
                      <h4 className="font-semibold text-emerald-400 mb-1">
                        Probabilidades
                      </h4>
                      <p>
                        A tabela mostra a chance de tirar cada valor no proximo
                        envelope. Badges coloridos indicam a frequencia:
                        verde (comum), amarelo (moderado), laranja (raro),
                        vermelho (muito raro).
                      </p>
                    </section>

                    <section className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                      <h4 className="font-semibold text-gray-300 mb-1">
                        Dica
                      </h4>
                      <p>
                        Conforme envelopes sao sorteados ao longo do torneio, o
                        pool muda. Atualize as quantidades para refletir os
                        envelopes ja retirados e obter o EV mais preciso para o
                        momento atual.
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
