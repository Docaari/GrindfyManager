import { useState, useMemo } from "react";
import { Search, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { getPlannerSiteColor } from "@/lib/poker-colors";

interface TournamentLibraryProps {
  allTournaments: any[];
  onAddTournament: (tournament: {
    site: string;
    name: string;
    buyIn: string;
    type: string;
    speed: string;
    time: string;
    guaranteed: string;
  }) => void;
}

export function TournamentLibrary({ allTournaments, onAddTournament }: TournamentLibraryProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const grouped = useMemo(() => {
    const tournaments = Array.isArray(allTournaments) ? allTournaments : [];
    if (tournaments.length === 0) return [];

    const frequencyMap = new Map<string, { count: number; tournament: any }>();
    tournaments.forEach((t: any) => {
      const key = `${t.name || ""}-${t.site}-${t.buyIn}`;
      const existing = frequencyMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        frequencyMap.set(key, { count: 1, tournament: t });
      }
    });

    return Array.from(frequencyMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [allTournaments]);

  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    return grouped.filter(({ tournament: t }) => {
      const name = (t.name || "").toLowerCase();
      const site = (t.site || "").toLowerCase();
      const buyIn = (t.buyIn?.toString() || "");
      return name.includes(q) || site.includes(q) || buyIn.includes(q);
    });
  }, [grouped, search]);

  if (collapsed) {
    return (
      <div className="w-10 flex-shrink-0 bg-gray-900 border border-gray-700 rounded-lg flex flex-col items-center py-4">
        <button
          onClick={() => setCollapsed(false)}
          className="text-gray-400 hover:text-white transition-colors"
          title="Expandir biblioteca"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 flex-shrink-0 bg-gray-900 border border-gray-700 rounded-lg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Biblioteca</h3>
        <button
          onClick={() => setCollapsed(true)}
          className="text-gray-400 hover:text-white transition-colors"
          title="Recolher"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-gray-700">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar torneio..."
            className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="text-center text-gray-500 text-xs py-6">
            {grouped.length === 0
              ? "Importe torneios para ver sugestoes"
              : "Nenhum resultado"}
          </div>
        ) : (
          filtered.map(({ tournament: t, count }, i) => (
            <button
              key={i}
              onClick={() =>
                onAddTournament({
                  site: t.site || "",
                  name: t.name || "",
                  buyIn: t.buyIn?.toString() || "0",
                  type: t.format || t.type || "Vanilla",
                  speed: t.speed || "Normal",
                  time: t.time || "",
                  guaranteed: t.guaranteed?.toString() || "",
                })
              }
              className="w-full text-left rounded-md px-2 py-1.5 hover:bg-gray-700 transition-colors group flex items-center gap-2"
            >
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getPlannerSiteColor(t.site)}`} />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-white truncate">{t.name || t.site}</div>
                <div className="text-[10px] text-gray-500">${parseFloat(t.buyIn || "0").toFixed(0)} - {t.site}</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[10px] text-gray-500">{count}x</span>
                <Plus className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
