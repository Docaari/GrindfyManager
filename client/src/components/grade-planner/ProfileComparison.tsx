import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getProfileColor, getProfileLabel } from "@shared/grade-profile-utils";
import { formatGroupedBuyIns } from "@shared/platform-currency";

interface ProfileMetrics {
  totalBuyIn: number;
  totalBuyInByCurrency: Record<string, number>;
  tournamentCount: number;
  avgFieldSize: number | null;
  speedDistribution: Record<string, number>;
  typeDistribution: Record<string, number>;
  siteDistribution: Record<string, number>;
  timeRange: { start: string; end: string } | null;
  hasData: boolean;
}

type ProfileComparisonResult = Record<"A" | "B" | "C", ProfileMetrics>;

const PROFILE_HEADER_COLORS: Record<string, string> = {
  A: "bg-emerald-600/20 border-emerald-600 text-emerald-400",
  B: "bg-blue-600/20 border-blue-600 text-blue-400",
  C: "bg-amber-600/20 border-amber-600 text-amber-400",
};

function formatDistribution(dist: Record<string, number>): string {
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "-";
  return entries
    .map(([key, pct]) => `${key} ${Math.round(pct)}%`)
    .join(", ");
}

function MetricRow({ label, values }: { label: string; values: [string, string, string] }) {
  return (
    <tr className="border-b border-gray-700/50">
      <td className="py-1.5 pr-3 text-gray-400 text-xs font-medium">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="py-1.5 px-3 text-xs text-gray-200 text-center">
          {v}
        </td>
      ))}
    </tr>
  );
}

export function ProfileComparison() {
  const [expanded, setExpanded] = useState(false);

  const { data: comparison } = useQuery<ProfileComparisonResult>({
    queryKey: ["/api/grade-planner/profile-comparison"],
    queryFn: () => apiRequest("GET", "/api/grade-planner/profile-comparison"),
  });

  if (!comparison) return null;

  const profiles = ["A", "B", "C"] as const;

  const getValue = (profile: typeof profiles[number], getter: (m: ProfileMetrics) => string): string => {
    const m = comparison[profile];
    if (!m.hasData) return "Sem dados";
    return getter(m);
  };

  return (
    <div className="mt-4 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
      {/* Toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-800/50 transition-colors"
      >
        <span className="text-sm font-medium text-gray-300">Comparar Perfis</span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-700">
          <table className="w-full mt-3">
            <thead>
              <tr>
                <th className="text-left text-xs text-gray-500 pb-2 w-[140px]">Metrica</th>
                {profiles.map((p) => (
                  <th key={p} className="pb-2 text-center">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${PROFILE_HEADER_COLORS[p]}`}>
                      {getProfileLabel(p)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <MetricRow
                label="Total Buy-in"
                values={profiles.map((p) =>
                  getValue(p, (m) =>
                    m.totalBuyInByCurrency && Object.keys(m.totalBuyInByCurrency).length > 0
                      ? formatGroupedBuyIns(m.totalBuyInByCurrency)
                      : `$${m.totalBuyIn.toFixed(0)}`
                  )
                ) as [string, string, string]}
              />
              <MetricRow
                label="Torneios"
                values={profiles.map((p) =>
                  getValue(p, (m) => String(m.tournamentCount))
                ) as [string, string, string]}
              />
              <MetricRow
                label="Field Medio"
                values={profiles.map((p) =>
                  getValue(p, (m) =>
                    m.avgFieldSize != null ? Math.round(m.avgFieldSize).toString() : "-"
                  )
                ) as [string, string, string]}
              />
              <MetricRow
                label="Velocidade"
                values={profiles.map((p) =>
                  getValue(p, (m) => formatDistribution(m.speedDistribution))
                ) as [string, string, string]}
              />
              <MetricRow
                label="Tipo"
                values={profiles.map((p) =>
                  getValue(p, (m) => formatDistribution(m.typeDistribution))
                ) as [string, string, string]}
              />
              <MetricRow
                label="Sites"
                values={profiles.map((p) =>
                  getValue(p, (m) => formatDistribution(m.siteDistribution))
                ) as [string, string, string]}
              />
              <MetricRow
                label="Horario"
                values={profiles.map((p) =>
                  getValue(p, (m) =>
                    m.timeRange ? `${m.timeRange.start} - ${m.timeRange.end}` : "-"
                  )
                ) as [string, string, string]}
              />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
