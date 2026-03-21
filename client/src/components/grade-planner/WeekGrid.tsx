import { useState } from "react";
import { Draggable } from "react-beautiful-dnd";
import { StrictModeDroppable as Droppable } from "./StrictModeDroppable";
import { Settings } from "lucide-react";
import { generateTimeSlots } from "@shared/grade-hours";
import { getCellDisplayInfo } from "@shared/grade-cell-overflow";
import { TournamentChip } from "./TournamentChip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sites, types, speeds } from "./types";

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

const PROFILE_COLORS_ACTIVE: Record<string, string> = {
  A: "bg-emerald-600 text-white ring-2 ring-emerald-400",
  B: "bg-blue-600 text-white ring-2 ring-blue-400",
  C: "bg-orange-600 text-white ring-2 ring-orange-400",
  OFF: "bg-gray-600 text-white ring-2 ring-gray-400",
};

const PROFILE_COLORS_INACTIVE: Record<string, string> = {
  A: "bg-gray-700 hover:bg-emerald-600/30 text-gray-400 hover:text-white",
  B: "bg-gray-700 hover:bg-blue-600/30 text-gray-400 hover:text-white",
  C: "bg-gray-700 hover:bg-orange-600/30 text-gray-400 hover:text-white",
  OFF: "bg-gray-700 hover:bg-gray-600 text-gray-500 hover:text-gray-300",
};

const MAX_VISIBLE_CHIPS = 3;

/**
 * Convert a time string "HH:MM" to the slot label it falls into.
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
  getActiveProfile: (dayOfWeek: number) => "A" | "B" | "C" | "OFF" | null;
  setActiveProfile: (dayOfWeek: number, profile: "A" | "B" | "C" | "OFF") => void;
  onClickTournament: (tournament: any) => void;
  onClickEmptyCell: (dayOfWeek: number, time: string) => void;
  onRemoveTournament?: (id: string) => void;
  onAddInline?: (data: { dayOfWeek: number; time: string; site: string; name: string; buyIn: string }) => void;
  gradeStartHour: number;
  gradeEndHour: number;
  onOpenSettings?: () => void;
}

export function WeekGrid({
  plannedTournaments,
  viewMode,
  getActiveProfile,
  setActiveProfile,
  onClickTournament,
  onClickEmptyCell,
  onRemoveTournament,
  onAddInline,
  gradeStartHour,
  gradeEndHour,
  onOpenSettings,
}: WeekGridProps) {
  const tournaments = Array.isArray(plannedTournaments) ? plannedTournaments : [];
  const TIME_SLOTS = generateTimeSlots(gradeStartHour, gradeEndHour);

  /** Get tournaments for a given day+slot, filtered by active profile */
  function getTournamentsForCell(dayId: number, slotLabel: string): any[] {
    const activeProfile = getActiveProfile(dayId);
    if (!activeProfile || activeProfile === "OFF") return [];
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
                <div className="flex items-center justify-center gap-1">
                  <span>Hora</span>
                  {onOpenSettings && (
                    <button
                      onClick={onOpenSettings}
                      className="text-gray-500 hover:text-white transition-colors"
                      title="Configurar horarios"
                    >
                      <Settings className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </th>
              {GRID_DAYS.map((day) => {
                const activeProfile = getActiveProfile(day.id);
                const isOff = activeProfile === "OFF" || !activeProfile;
                return (
                  <th
                    key={day.id}
                    className={`bg-gray-900 border border-gray-700 p-2 text-center ${isOff ? "opacity-50" : ""}`}
                  >
                    <div className="text-sm font-semibold text-white mb-1">{day.short}</div>
                    <div className="flex justify-center gap-1">
                      {(["A", "B", "C", "OFF"] as const).map((profile) => {
                        const isActive = activeProfile === profile || (!activeProfile && profile === "OFF");
                        const cls = isActive
                          ? PROFILE_COLORS_ACTIVE[profile]
                          : PROFILE_COLORS_INACTIVE[profile];
                        return (
                          <button
                            key={profile}
                            onClick={() => setActiveProfile(day.id, profile)}
                            className={`w-7 h-5 rounded text-[10px] font-bold transition-all ${cls}`}
                            title={profile === "OFF" ? "Dia OFF" : `Perfil ${profile}`}
                          >
                            {profile === "OFF" ? "OFF" : profile}
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
                  const isOff = activeProfile === "OFF" || !activeProfile;
                  const cellTournaments = getTournamentsForCell(day.id, slot);
                  const displayInfo = getCellDisplayInfo(cellTournaments, MAX_VISIBLE_CHIPS);
                  const droppableId = `cell-${day.id}-${slot}`;

                  return (
                    <Droppable key={droppableId} droppableId={droppableId} isDropDisabled={isOff}>
                      {(provided, snapshot) => (
                        <td
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`border border-gray-700 p-1 align-top min-h-[40px] transition-colors ${
                            isOff
                              ? "bg-gray-800/30 cursor-default opacity-40"
                              : snapshot.isDraggingOver
                                ? "bg-emerald-900/30 border-emerald-600"
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
                            <div className="space-y-0.5">
                              {displayInfo.visible.map((t: any, idx: number) => (
                                <Draggable
                                  key={t.id}
                                  draggableId={`cell-${t.id}`}
                                  index={idx}
                                >
                                  {(dragProvided) => (
                                    <div
                                      ref={dragProvided.innerRef}
                                      {...dragProvided.draggableProps}
                                      {...dragProvided.dragHandleProps}
                                    >
                                      <CellChip
                                        tournament={t}
                                        onClick={() => onClickTournament(t)}
                                        onRemove={onRemoveTournament}
                                      />
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {displayInfo.hasOverflow && (
                                <OverflowIndicator
                                  count={displayInfo.overflow}
                                  tournaments={cellTournaments.slice(MAX_VISIBLE_CHIPS)}
                                  onClickTournament={onClickTournament}
                                  onRemove={onRemoveTournament}
                                />
                              )}
                            </div>
                          )}
                          {provided.placeholder}
                        </td>
                      )}
                    </Droppable>
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

// =============================================================================
// CellChip — Tournament chip inside a grid cell with popover
// =============================================================================

function CellChip({
  tournament,
  onClick,
  onRemove,
}: {
  tournament: any;
  onClick: () => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div>
          <TournamentChip tournament={tournament} onClick={onClick} />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="bg-gray-800 border-gray-600 text-white w-56 p-3"
        side="right"
        align="start"
      >
        <div className="space-y-2">
          <div className="font-semibold text-sm">
            {tournament.name || tournament.site}
          </div>
          <div className="text-xs text-gray-300 space-y-1">
            <div>Site: {tournament.site}</div>
            <div>Buy-in: ${parseFloat(tournament.buyIn || "0").toFixed(2)}</div>
            {tournament.time && <div>Horario: {tournament.time}</div>}
            <div>Tipo: {tournament.type || "Vanilla"} | {tournament.speed || "Normal"}</div>
            {tournament.guaranteed && parseFloat(tournament.guaranteed) > 0 && (
              <div>GTD: ${parseFloat(tournament.guaranteed).toLocaleString("pt-BR")}</div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              Editar
            </Button>
            {onRemove && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 bg-red-900/30 border-red-800 text-red-400 hover:bg-red-900/50 flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(tournament.id);
                }}
              >
                Remover
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// OverflowIndicator — "+N torneios" chip with expandable popover
// =============================================================================

function OverflowIndicator({
  count,
  tournaments,
  onClickTournament,
  onRemove,
}: {
  count: number;
  tournaments: any[];
  onClickTournament: (t: any) => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="w-full text-center text-[10px] text-gray-400 hover:text-white bg-gray-700/50 rounded py-0.5 transition-colors">
          +{count} torneio{count > 1 ? "s" : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="bg-gray-800 border-gray-600 text-white w-64 p-2 max-h-[300px] overflow-y-auto"
        side="right"
        align="start"
      >
        <div className="text-xs font-medium text-gray-400 mb-2">
          {count} torneio{count > 1 ? "s" : ""} adiciona{count > 1 ? "is" : "l"}
        </div>
        <div className="space-y-1">
          {tournaments.map((t: any) => (
            <div key={t.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-700">
              <div className="flex-1 min-w-0" onClick={() => onClickTournament(t)}>
                <TournamentChip tournament={t} />
              </div>
              {onRemove && (
                <button
                  onClick={() => onRemove(t.id)}
                  className="text-gray-500 hover:text-red-400 flex-shrink-0"
                >
                  <span className="text-[10px]">X</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
