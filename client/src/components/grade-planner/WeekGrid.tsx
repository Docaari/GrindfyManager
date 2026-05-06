import { useState, useMemo } from "react";
import { Draggable } from "react-beautiful-dnd";
import { StrictModeDroppable as Droppable } from "./StrictModeDroppable";
import { Settings, Plus, Eye } from "lucide-react";
import { generateTimeSlots } from "@shared/grade-hours";
import { getDisplayRegistrationTime } from "@shared/grade-time";
import { getCellDisplayInfo } from "@shared/grade-cell-overflow";
import { groupBuyInsByCurrency, formatGroupedBuyIns, formatBuyIn } from "@shared/platform-currency";
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
  // Sprint F4 — drill-down "Ver detalhes" do dia (RF-01).
  // Click no botao abre DayDetailDrawer no GradePlanner. Renderizado apenas
  // quando profile != OFF (dia ativo) — em OFF nao ha agregados a mostrar.
  onShowDayDetails?: (dayOfWeek: number) => void;
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
  onShowDayDetails,
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
      // Bucketing pelo horario de registro (registrationTime explicito ->
      // time + lateRegMinutes -> time). Mesma cascata do home Grade do Dia
      // e /grind-live (TournamentCard primaryTimeLabel).
      const slot = timeToSlot(getDisplayRegistrationTime(t));
      return slot === slotLabel;
    });
  }

  return (
    <div className="flex-1 overflow-x-auto scroll-smooth">
      <div className="min-w-[800px]">
        <table className="w-full border-collapse">
          {/* Header */}
          <thead>
            <tr>
              <th className="w-20 bg-gray-900 border border-gray-700 p-2 text-sm text-gray-400 text-center sticky left-0 z-10">
                <div className="flex items-center justify-center gap-1">
                  <span>Hora</span>
                  {onOpenSettings && (
                    <button
                      onClick={onOpenSettings}
                      className="text-gray-500 hover:text-white transition-colors"
                      title="Configurar horarios"
                    >
                      <Settings className="w-4 h-4" />
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
                    <div className="text-base font-semibold text-white mb-1">{day.short}</div>
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
                            className={`w-9 h-7 rounded text-xs font-bold transition-all focus:ring-2 focus:ring-emerald-400 focus:outline-none ${cls}`}
                            title={profile === "OFF" ? "Dia OFF" : `Perfil ${profile}`}
                          >
                            {profile === "OFF" ? "OFF" : profile}
                          </button>
                        );
                      })}
                    </div>
                    {/* Sprint F4 RF-01: drill-down "Ver detalhes" do dia.
                        Visivel apenas quando profile != OFF (dia ativo). */}
                    {!isOff && onShowDayDetails && (
                      <button
                        type="button"
                        data-testid={`week-grid-day-detail-${day.id}`}
                        onClick={() => onShowDayDetails(day.id)}
                        className="mt-2 inline-flex items-center justify-center gap-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px] font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        title="Ver detalhes do dia"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Detalhes</span>
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {TIME_SLOTS.map((slot) => (
              <tr key={slot}>
                <td className="bg-gray-900 border border-gray-700 p-1 text-sm text-gray-400 text-center font-mono sticky left-0 z-10 w-20">
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
                          className={`border border-gray-700/70 p-2 align-top min-h-[52px] transition-colors group ${
                            isOff
                              ? "bg-gray-800/60 cursor-default border-dashed"
                              : snapshot.isDraggingOver
                                ? "bg-emerald-900/30 border-emerald-600"
                                : cellTournaments.length === 0
                                  ? "bg-gray-800 hover:bg-gray-700 cursor-pointer"
                                  : "bg-gray-800"
                          }`}
                          onClick={() => {
                            if (isOff) return;
                            if (cellTournaments.length === 0) {
                              onClickEmptyCell(day.id, slot);
                            }
                          }}
                        >
                          {isOff ? (
                          <div className="flex items-center justify-center h-full min-h-[36px]">
                            <span className="text-[10px] text-gray-600 font-medium uppercase tracking-wider select-none">OFF</span>
                          </div>
                        ) : cellTournaments.length === 0 ? (
                          /* FP-05: Empty active cell with "+" hint */
                          <div className="flex items-center justify-center h-full min-h-[36px] group">
                            <Plus className="h-4 w-4 text-gray-500 opacity-30 group-hover:opacity-60 transition-opacity" />
                          </div>
                        ) : (
                            <div className="space-y-1.5">
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
          <DaySummaryFooter
            tournaments={tournaments}
            getActiveProfile={getActiveProfile}
          />
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// DaySummaryFooter — Summary row at the bottom of the grid
// =============================================================================

function DaySummaryFooter({
  tournaments,
  getActiveProfile,
}: {
  tournaments: any[];
  getActiveProfile: (dayOfWeek: number) => "A" | "B" | "C" | "OFF" | null;
}) {
  const daySummaries = useMemo(() => {
    return GRID_DAYS.map((day) => {
      const profile = getActiveProfile(day.id);
      const isOff = !profile || profile === "OFF";
      if (isOff) return { isOff: true, buyInDisplay: "", countDisplay: "", pkoDisplay: "", turboDisplay: "" };

      const dayTournaments = tournaments.filter(
        (t: any) => t.dayOfWeek === day.id && t.profile === profile,
      );
      const count = dayTournaments.length;
      if (count === 0) return { isOff: false, buyInDisplay: "", countDisplay: "0 MTTs", pkoDisplay: "", turboDisplay: "" };

      const grouped = groupBuyInsByCurrency(dayTournaments);
      const buyInDisplay = formatGroupedBuyIns(grouped);

      const pkoCount = dayTournaments.filter((t: any) => t.type === "PKO").length;
      const turboCount = dayTournaments.filter(
        (t: any) => t.speed === "Turbo" || t.speed === "Hyper",
      ).length;
      const pkoPct = Math.round((pkoCount / count) * 100);
      const turboPct = Math.round((turboCount / count) * 100);

      return {
        isOff: false,
        buyInDisplay: `${buyInDisplay}`,
        countDisplay: `${count} MTT${count > 1 ? "s" : ""}`,
        pkoDisplay: `PKO ${pkoPct}%`,
        turboDisplay: `T ${turboPct}%`,
      };
    });
  }, [tournaments, getActiveProfile]);

  return (
    <tfoot>
      <tr>
        <td className="bg-gray-900 border border-gray-700 p-2 text-xs text-gray-400 text-center sticky left-0 z-10">
          Resumo
        </td>
        {GRID_DAYS.map((day, idx) => {
          const summary = daySummaries[idx];
          if (summary.isOff) {
            return (
              <td key={day.id} className="bg-gray-800/60 border border-gray-700 border-dashed p-2 text-center">
                <span className="text-sm text-gray-500">&mdash;</span>
              </td>
            );
          }
          return (
            <td key={day.id} className="bg-gray-800/50 border border-gray-700 p-2 text-center">
              <div className="text-xs text-emerald-400 font-semibold leading-tight">
                {summary.buyInDisplay} &middot; {summary.countDisplay}
              </div>
              {(summary.pkoDisplay || summary.turboDisplay) && (
                <div className="text-[11px] text-gray-400 leading-tight">
                  {summary.pkoDisplay} &middot; {summary.turboDisplay}
                </div>
              )}
            </td>
          );
        })}
      </tr>
    </tfoot>
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
            <div>Buy-in: {formatBuyIn(tournament.buyIn || "0", tournament.site)}</div>
            {tournament.time && (
              <div>Registro: {getDisplayRegistrationTime(tournament) || tournament.time}</div>
            )}
            <div>Tipo: {tournament.type || "Vanilla"} | {tournament.speed || "Normal"}</div>
            {tournament.guaranteed && parseFloat(tournament.guaranteed) > 0 && (
              <div>GTD: {formatBuyIn(tournament.guaranteed, tournament.site)}</div>
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
