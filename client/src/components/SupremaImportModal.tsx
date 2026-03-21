import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, Lock } from "lucide-react";

interface SupremaImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (tournaments: any[]) => void;
  excludeExternalIds?: string[];
  /** Specific date to fetch tournaments for (YYYY-MM-DD). Defaults to today. */
  selectedDate?: string;
  /** Label shown in the modal header, e.g. "Segunda 24/03" */
  dayLabel?: string;
}

interface RawPokerbyteTournament {
  id: number;
  liga: number;
  ligaName: string;
  name: string;
  date: string;
  guaranteed: number;
  buyin: number;
  late: number;
  status: string;
  tournament: number;
  moneyPrefix: string;
  stack: number;
  temponivelmMeta: number;
  type: string;
  maxPl: number;
  isKO: number;
}

interface MappedTournament {
  externalId: string;
  name: string;
  site: string;
  time: string;
  buyIn: string;
  guaranteed: string;
  type: string;
  speed: string;
  dayOfWeek: number;
  status: string;
  prioridade: number;
  startTime: Date;
  buyInNum: number;
  entries: number;
}

function mapSpeed(temponivelmMeta: number | null | undefined): string {
  if (temponivelmMeta == null || temponivelmMeta === 0) return "Normal";
  if (temponivelmMeta <= 6) return "Hyper";
  if (temponivelmMeta <= 10) return "Turbo";
  return "Normal";
}

function mapRawTournament(input: RawPokerbyteTournament): MappedTournament {
  const dateStr = input.date || "";
  const startTime = new Date(dateStr.replace(" ", "T"));
  const timePart = dateStr.split(" ")[1] || "00:00:00";
  const [hours, minutes] = timePart.split(":");
  const time = `${hours}:${minutes}`;
  const buyInNum = input.buyin ?? 0;

  return {
    externalId: `suprema-${input.id}`,
    name: input.name || "",
    site: "Suprema",
    time,
    buyIn: String(buyInNum),
    guaranteed: String(input.guaranteed ?? 0),
    type: input.isKO === 1 ? "PKO" : "Vanilla",
    speed: mapSpeed(input.temponivelmMeta),
    dayOfWeek: startTime.getDay(),
    status: "upcoming",
    prioridade: 2,
    startTime,
    buyInNum,
    entries: 1,
  };
}

type BuyInFilter = "Low" | "Mid" | "High";
type TypeFilter = "NLH" | "PLO";

function formatGuaranteed(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return "";
  if (num >= 1000) {
    return `R$ ${(num / 1000).toFixed(num % 1000 === 0 ? 0 : 1)}K GTD`;
  }
  return `R$ ${num} GTD`;
}

function getSpeedBadgeColor(speed: string): string {
  if (speed === "Turbo") return "bg-yellow-600";
  if (speed === "Hyper") return "bg-red-600";
  return "bg-green-600";
}

export default function SupremaImportModal({
  open,
  onClose,
  onImport,
  excludeExternalIds = [],
  selectedDate,
  dayLabel,
}: SupremaImportModalProps) {
  const [rawTournaments, setRawTournaments] = useState<MappedTournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [buyInFilters, setBuyInFilters] = useState<Set<BuyInFilter>>(new Set());
  const [typeFilters, setTypeFilters] = useState<Set<TypeFilter>>(new Set());
  const [entryCountMap, setEntryCountMap] = useState<Record<string, number>>({});

  const dateToFetch = useMemo(() => {
    if (selectedDate) return selectedDate;
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, [selectedDate]);

  const dateFormatted = useMemo(() => {
    if (dayLabel) return dayLabel;
    const d = selectedDate ? new Date(selectedDate + "T12:00:00") : new Date();
    return d.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }, [selectedDate, dayLabel]);

  const fetchTournaments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest("GET", `/api/suprema/tournaments?date=${dateToFetch}`);
      const mapped = Array.isArray(data) ? data.map(mapRawTournament) : [];
      mapped.sort((a, b) => a.time.localeCompare(b.time));
      setRawTournaments(mapped);
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.message || "Erro ao buscar torneios da Suprema Poker");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchTournaments();
    } else {
      setRawTournaments([]);
      setSelectedIds(new Set());
      setBuyInFilters(new Set());
      setTypeFilters(new Set());
      setEntryCountMap({});
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dateToFetch]);

  const excludeSet = useMemo(() => new Set(excludeExternalIds), [excludeExternalIds]);

  const filteredTournaments = useMemo(() => {
    return rawTournaments.filter((t) => {
      if (buyInFilters.size > 0) {
        const bi = t.buyInNum;
        const matchesLow = buyInFilters.has("Low") && bi < 20;
        const matchesMid = buyInFilters.has("Mid") && bi >= 20 && bi <= 100;
        const matchesHigh = buyInFilters.has("High") && bi > 100;
        if (!matchesLow && !matchesMid && !matchesHigh) return false;
      }
      if (typeFilters.size > 0) {
        const isNLH = t.type !== "PLO";
        const matchesNLH = typeFilters.has("NLH") && isNLH;
        const matchesPLO = typeFilters.has("PLO") && !isNLH;
        if (!matchesNLH && !matchesPLO) return false;
      }
      return true;
    });
  }, [rawTournaments, buyInFilters, typeFilters]);

  const selectableTournaments = useMemo(
    () => filteredTournaments.filter((t) => !excludeSet.has(t.externalId)),
    [filteredTournaments, excludeSet]
  );

  const allSelectableSelected =
    selectableTournaments.length > 0 &&
    selectableTournaments.every((t) => selectedIds.has(t.externalId));

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableTournaments.map((t) => t.externalId)));
    }
  };

  const toggleTournament = (externalId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(externalId)) {
        next.delete(externalId);
      } else {
        next.add(externalId);
      }
      return next;
    });
  };

  const toggleBuyInFilter = (filter: BuyInFilter) => {
    setBuyInFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  };

  const toggleTypeFilter = (filter: TypeFilter) => {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  };

  const handleImport = () => {
    const selected = rawTournaments
      .filter((t) => selectedIds.has(t.externalId))
      .map((t) => ({ ...t, entries: entryCountMap[t.externalId] || 1 }));
    onImport(selected);
    onClose();
  };

  const setEntryCount = (externalId: string, count: number) => {
    const clamped = Math.max(1, Math.min(10, count));
    setEntryCountMap((prev) => ({ ...prev, [externalId]: clamped }));
  };

  const selectedCount = selectedIds.size;
  const totalEntries = Array.from(selectedIds).reduce(
    (sum, id) => sum + (entryCountMap[id] || 1),
    0
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-emerald-400 flex items-center gap-2">
            Importar Torneios Suprema — {dateFormatted}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Selecione os torneios da Suprema Poker para adicionar ao planejamento
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 py-2 border-b border-slate-700">
          <span className="text-sm text-gray-400 self-center mr-1">Buy-in:</span>
          {(["Low", "Mid", "High"] as BuyInFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => toggleBuyInFilter(f)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                buyInFilters.has(f)
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-700 text-gray-300 hover:bg-slate-600"
              }`}
            >
              {f === "Low" ? "Low <$20" : f === "Mid" ? "Mid $20-$100" : "High >$100"}
            </button>
          ))}
          <span className="text-sm text-gray-400 self-center ml-2 mr-1">Tipo:</span>
          {(["NLH", "PLO"] as TypeFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => toggleTypeFilter(f)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                typeFilters.has(f)
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-700 text-gray-300 hover:bg-slate-600"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="space-y-3 p-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded bg-slate-700" />
                  <Skeleton className="h-10 flex-1 rounded bg-slate-700" />
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <p className="text-red-400 text-sm text-center">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchTournaments}
                className="border-slate-600 text-gray-300 hover:bg-slate-700"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar novamente
              </Button>
            </div>
          )}

          {!loading && !error && filteredTournaments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-gray-400 text-sm">Nenhum torneio encontrado para esta data</p>
            </div>
          )}

          {!loading && !error && filteredTournaments.length > 0 && (
            <div className="space-y-1">
              {/* Select all */}
              <div className="flex items-center gap-3 px-2 py-2 border-b border-slate-700">
                <Checkbox
                  checked={allSelectableSelected}
                  onCheckedChange={toggleSelectAll}
                  disabled={selectableTournaments.length === 0}
                  className="border-slate-500 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                />
                <span className="text-sm text-gray-300">Selecionar todos</span>
              </div>

              {/* Tournament list */}
              {filteredTournaments.map((t) => {
                const isExcluded = excludeSet.has(t.externalId);
                const isSelected = selectedIds.has(t.externalId);

                return (
                  <div
                    key={t.externalId}
                    className={`flex items-center gap-3 px-2 py-2 rounded transition-colors ${
                      isExcluded
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-slate-700/50 cursor-pointer"
                    }`}
                    onClick={() => {
                      if (!isExcluded) toggleTournament(t.externalId);
                    }}
                  >
                    {isExcluded ? (
                      <Lock className="h-4 w-4 text-gray-500 shrink-0" />
                    ) : (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleTournament(t.externalId)}
                        className="border-slate-500 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{t.time}</span>
                        <span className="text-sm text-gray-200 truncate">
                          ${t.buyIn} {t.name}
                        </span>
                        {t.guaranteed && parseFloat(t.guaranteed) > 0 && (
                          <span className="text-xs text-emerald-400">
                            {formatGuaranteed(t.guaranteed)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 ${
                            t.type === "PKO" ? "bg-orange-600" : "bg-blue-600"
                          } text-white border-0`}
                        >
                          {t.type}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 ${getSpeedBadgeColor(t.speed)} text-white border-0`}
                        >
                          {t.speed}
                        </Badge>
                        {isExcluded && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 bg-slate-600 text-gray-300 border-0"
                          >
                            Ja importado
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Multi-entry controls */}
                    {!isExcluded && (
                      <div
                        className="flex items-center gap-1 shrink-0 ml-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="w-5 h-5 flex items-center justify-center rounded bg-slate-600 text-gray-300 hover:bg-slate-500 text-xs font-bold"
                          onClick={() => setEntryCount(t.externalId, (entryCountMap[t.externalId] || 1) - 1)}
                          disabled={(entryCountMap[t.externalId] || 1) <= 1}
                        >
                          -
                        </button>
                        <span className="text-xs text-white w-4 text-center font-medium">
                          {entryCountMap[t.externalId] || 1}
                        </span>
                        <button
                          type="button"
                          className="w-5 h-5 flex items-center justify-center rounded bg-slate-600 text-gray-300 hover:bg-slate-500 text-xs font-bold"
                          onClick={() => setEntryCount(t.externalId, (entryCountMap[t.externalId] || 1) + 1)}
                          disabled={(entryCountMap[t.externalId] || 1) >= 10}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-700">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-600 text-gray-300 hover:bg-slate-700"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedCount === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Importar Selecionados ({totalEntries}{totalEntries !== selectedCount ? ` de ${selectedCount} torneios` : ''})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
