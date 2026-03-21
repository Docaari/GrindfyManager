import { TournamentPill } from "./TournamentPill";

/** Time slots from 12:00 to 03:00 (next day) = 16 rows */
const TIME_SLOTS: string[] = [];
for (let h = 12; h <= 23; h++) {
  TIME_SLOTS.push(`${h.toString().padStart(2, "0")}:00`);
}
for (let h = 0; h <= 3; h++) {
  TIME_SLOTS.push(`${h.toString().padStart(2, "0")}:00`);
}

/** Days ordered Mon-Sun for grid columns. dayOfWeek uses JS convention: 0=Sun, 1=Mon...6=Sat */
const GRID_DAYS = [
  { id: 1, short: "Seg" },
  { id: 2, short: "Ter" },
  { id: 3, short: "Qua" },
  { id: 4, short: "Qui" },
  { id: 5, short: "Sex" },
  { id: 6, short: "Sab" },
  { id: 0, short: "Dom" },
];

const PROFILE_COLORS: Record<string, string> = {
  A: "bg-emerald-600 hover:bg-emerald-700 text-white",
  B: "bg-blue-600 hover:bg-blue-700 text-white",
  C: "bg-orange-600 hover:bg-orange-700 text-white",
};

const PROFILE_COLORS_ACTIVE: Record<string, string> = {
  A: "bg-emerald-600 text-white ring-2 ring-emerald-400",
  B: "bg-blue-600 text-white ring-2 ring-blue-400",
  C: "bg-orange-600 text-white ring-2 ring-orange-400",
};

const PROFILE_COLORS_INACTIVE: Record<string, string> = {
  A: "bg-gray-700 hover:bg-emerald-600/30 text-gray-400 hover:text-white",
  B: "bg-gray-700 hover:bg-blue-600/30 text-gray-400 hover:text-white",
  C: "bg-gray-700 hover:bg-orange-600/30 text-gray-400 hover:text-white",
};

/**
 * Convert a time string "HH:MM" to the slot label it falls into.
 * E.g. "14:30" -> "14:00", "00:15" -> "00:00"
 */
function timeToSlot(time: string): string | null {
  if (!time) return null;
  const parts = time.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  if (isNaN(h)) return null;
  return `${h.toString().padStart(2, "0")}:00`;
}

interface WeekGridProps {
  plannedTournaments: any[];
  viewMode: "compact" | "expanded";
  getActiveProfile: (dayOfWeek: number) => "A" | "B" | "C" | null;
  setActiveProfile: (dayOfWeek: number, profile: "A" | "B" | "C") => void;
  onClickTournament: (tournament: any) => void;
  onClickEmptyCell: (dayOfWeek: number, time: string) => void;
}

export function WeekGrid({
  plannedTournaments,
  viewMode,
  getActiveProfile,
  setActiveProfile,
  onClickTournament,
  onClickEmptyCell,
}: WeekGridProps) {
  const tournaments = Array.isArray(plannedTournaments) ? plannedTournaments : [];

  /** Get tournaments for a given day+slot, filtered by active profile */
  function getTournamentsForCell(dayId: number, slotLabel: string): any[] {
    const activeProfile = getActiveProfile(dayId);
    if (!activeProfile || activeProfile === "C") return [];
    return tournaments.filter((t: any) => {
      if (t.dayOfWeek !== dayId) return false;
      if (t.profile !== activeProfile) return false;
      const slot = timeToSlot(t.time);
      return slot === slotLabel;
    });
  }

  return (
    <div className="flex-1 overflow-x-auto">
      <div className="min-w-[800px]">
        <table className="w-full border-collapse">
          {/* Header */}
          <thead>
            <tr>
              <th className="w-16 bg-gray-900 border border-gray-700 p-2 text-xs text-gray-400 text-center sticky left-0 z-10">
                Hora
              </th>
              {GRID_DAYS.map((day) => {
                const activeProfile = getActiveProfile(day.id);
                const isOff = activeProfile === "C";
                return (
                  <th
                    key={day.id}
                    className={`bg-gray-900 border border-gray-700 p-2 text-center ${isOff ? "opacity-50" : ""}`}
                  >
                    <div className="text-sm font-semibold text-white mb-1">{day.short}</div>
                    <div className="flex justify-center gap-1">
                      {(["A", "B", "C"] as const).map((profile) => {
                        const isActive = activeProfile === profile;
                        const cls = isActive
                          ? PROFILE_COLORS_ACTIVE[profile]
                          : PROFILE_COLORS_INACTIVE[profile];
                        return (
                          <button
                            key={profile}
                            onClick={() => setActiveProfile(day.id, profile)}
                            className={`w-7 h-5 rounded text-[10px] font-bold transition-all ${cls}`}
                            title={profile === "C" ? "Dia OFF" : `Perfil ${profile}`}
                          >
                            {profile === "C" ? "OFF" : profile}
                          </button>
                        );
                      })}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {TIME_SLOTS.map((slot) => (
              <tr key={slot}>
                <td className="bg-gray-900 border border-gray-700 p-1 text-xs text-gray-500 text-center font-mono sticky left-0 z-10 w-16">
                  {slot}
                </td>
                {GRID_DAYS.map((day) => {
                  const activeProfile = getActiveProfile(day.id);
                  const isOff = activeProfile === "C";
                  const cellTournaments = getTournamentsForCell(day.id, slot);

                  return (
                    <td
                      key={`${day.id}-${slot}`}
                      className={`border border-gray-700 p-1 align-top min-h-[40px] transition-colors ${
                        isOff
                          ? "bg-gray-800/30 cursor-default"
                          : cellTournaments.length === 0
                            ? "bg-gray-800 hover:bg-gray-750 cursor-pointer"
                            : "bg-gray-800"
                      }`}
                      onClick={() => {
                        if (isOff) return;
                        if (cellTournaments.length === 0) {
                          onClickEmptyCell(day.id, slot);
                        }
                      }}
                    >
                      {isOff ? null : (
                        <div className="space-y-1">
                          {cellTournaments.map((t: any) => (
                            <TournamentPill
                              key={t.id}
                              tournament={t}
                              compact={viewMode === "compact"}
                              onClick={() => onClickTournament(t)}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
