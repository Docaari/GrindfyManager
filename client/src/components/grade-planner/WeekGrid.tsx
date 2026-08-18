import { useState, useMemo, useEffect, useRef } from "react";
import { useDragToScroll } from "@/hooks/useDragToScroll";
import { Draggable } from "react-beautiful-dnd";
import { StrictModeDroppable as Droppable } from "./StrictModeDroppable";
import { Settings, Plus, Eye, X, Eraser } from "lucide-react";
import { generateTimeSlots } from "@shared/grade-hours";
import { getDisplayRegistrationTime } from "@shared/grade-time";
import { sortCellByTime } from "@shared/grade-cell-overflow";
import { groupBuyInsByCurrency, formatGroupedBuyIns, getCurrencyForSite } from "@shared/platform-currency";
import { TournamentChip } from "./TournamentChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { DayHoverTooltip } from "@/components/grade/DayHoverTooltip";
import { useToast } from "@/hooks/use-toast";

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
  // Limpar dia: remove todos os torneios do dia no perfil ativo. So aparece
  // quando o dia tem torneios; a confirmacao vive no GradePlanner.
  onClearDay?: (dayOfWeek: number) => void;
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
  onClearDay,
}: WeekGridProps) {
  const tournaments = Array.isArray(plannedTournaments) ? plannedTournaments : [];
  const TIME_SLOTS = generateTimeSlots(gradeStartHour, gradeEndHour);
  const { toast } = useToast();
  // Pan-to-scroll horizontal: agarrar area vazia e arrastar para ver as
  // colunas da direita (Dom/Sab). Nao briga com drag-and-drop de torneios
  // (rbd) nem com clique em celula. Ver useDragToScroll.
  const { ref: panRef, handlers: panHandlers } = useDragToScroll<HTMLDivElement>();

  // hooks ANTES de early return (lesson #1).
  const anyProfileActive = useMemo(() => {
    return GRID_DAYS.some((d) => {
      const p = getActiveProfile(d.id);
      return p && p !== "OFF";
    });
  }, [getActiveProfile]);

  const showEmptyState = tournaments.length === 0 && !anyProfileActive;
  const todayJsDay = new Date().getDay();
  const targetEmptyDay = GRID_DAYS.find((d) => d.id === todayJsDay)?.id ?? 0;

  // Resumo do dia (buy-in total, # MTTs, % PKO, % Turbo) — exibido no topo de
  // cada coluna junto do botao "Detalhes" (antes ficava no rodape da tabela).
  const daySummaries = useMemo(() => {
    const map: Record<number, { buyInDisplay: string; abiDisplay: string; countDisplay: string; pkoDisplay: string; turboDisplay: string } | null> = {};
    for (const day of GRID_DAYS) {
      const profile = getActiveProfile(day.id);
      if (!profile || profile === "OFF") { map[day.id] = null; continue; }
      const dayTournaments = tournaments.filter((t: any) => t.dayOfWeek === day.id && t.profile === profile);
      const count = dayTournaments.length;
      if (count === 0) { map[day.id] = { buyInDisplay: "", abiDisplay: "", countDisplay: "0 MTTs", pkoDisplay: "", turboDisplay: "" }; continue; }
      const grouped = groupBuyInsByCurrency(dayTournaments);
      const buyInDisplay = formatGroupedBuyIns(grouped);
      // ABI por moeda: total da moeda / # torneios daquela moeda.
      const countByCcy: Record<string, number> = {};
      for (const t of dayTournaments) {
        const num = parseFloat(t.buyIn);
        if (isNaN(num)) continue;
        const code = getCurrencyForSite(t.site).code;
        countByCcy[code] = (countByCcy[code] || 0) + 1;
      }
      const abiGrouped: Record<string, number> = {};
      for (const code of Object.keys(grouped)) {
        if (countByCcy[code]) abiGrouped[code] = grouped[code] / countByCcy[code];
      }
      const abiDisplay = formatGroupedBuyIns(abiGrouped);
      const pkoCount = dayTournaments.filter((t: any) => t.type === "PKO").length;
      const turboCount = dayTournaments.filter((t: any) => t.speed === "Turbo" || t.speed === "Hyper").length;
      map[day.id] = {
        buyInDisplay,
        abiDisplay,
        countDisplay: `${count} MTT${count > 1 ? "s" : ""}`,
        pkoDisplay: `PKO ${Math.round((pkoCount / count) * 100)}%`,
        turboDisplay: `T ${Math.round((turboCount / count) * 100)}%`,
      };
    }
    return map;
  }, [tournaments, getActiveProfile]);

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

  if (showEmptyState) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[300px]">
        <EmptyState
          area="grade-planner-empty"
          telemetryContext="week_grid_empty"
          title="Sua grade esta vazia"
          description="Ative um perfil A/B/C e clique em uma celula para adicionar torneios."
          ctaLabel="Ativar Perfil A"
          ctaAction={() => setActiveProfile(targetEmptyDay, "A")}
          secondaryCTA={{
            label: "Ver tour rapido",
            onClick: () => {
              toast({
                title: "Tour rapido — Grade Planner",
                description: "1. Ative perfil A/B/C no header  2. Clique celula vazia para adicionar torneio  3. Use o Selector para sugestoes ICE.",
              });
            },
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={panRef}
      {...panHandlers}
      className="flex-1 overflow-x-auto scroll-smooth cursor-grab"
    >
      {/* table-fixed + min-w baixo: as 7 colunas dividem a largura disponivel
          em partes iguais, entao Dom aparece sem scroll horizontal. O nome do
          torneio e quem cede espaco (abreviado no chip). */}
      <div className="min-w-[680px]">
        <table className="w-full table-fixed border-collapse">
          {/* Header */}
          <thead>
            <tr>
              <th className="w-14 bg-gray-900 border border-gray-700 p-1 text-sm text-gray-400 text-center sticky left-0 top-0 z-20">
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
                    className={`bg-gray-900 border border-gray-700 p-1.5 text-center sticky top-0 z-10 ${isOff ? "opacity-50" : ""}`}
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
                            className={`w-7 h-6 rounded text-xs font-bold transition-all focus:ring-2 focus:ring-emerald-400 focus:outline-none ${cls}`}
                            title={profile === "OFF" ? "Dia OFF" : `Perfil ${profile}`}
                          >
                            {profile === "OFF" ? "OFF" : profile}
                          </button>
                        );
                      })}
                    </div>
                    {/* Resumo do dia + drill-down "Detalhes" (Sprint F4 RF-01).
                        Visivel apenas quando profile != OFF (dia ativo). */}
                    {!isOff && (() => {
                      const s = daySummaries[day.id];
                      return (
                        <div className="mt-2 flex flex-col items-center gap-1">
                          {s && (s.buyInDisplay || s.countDisplay) && (
                            <div className="leading-tight">
                              <span className="text-[10px] text-emerald-400 font-semibold">
                                {s.buyInDisplay}{s.buyInDisplay ? " · " : ""}{s.countDisplay}
                                {s.abiDisplay ? ` · ABI ${s.abiDisplay}` : ""}
                              </span>
                              {(s.pkoDisplay || s.turboDisplay) && (
                                <span className="text-[10px] text-gray-400">
                                  {" · "}{s.pkoDisplay} · {s.turboDisplay}
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                          {onShowDayDetails && (
                            <DayHoverTooltip
                              dayOfWeek={day.id}
                              profileLetter={(() => {
                                const p = getActiveProfile(day.id);
                                return p && p !== 'OFF' ? p as 'A' | 'B' | 'C' : 'A';
                              })()}
                            >
                              <button
                                type="button"
                                data-testid={`week-grid-day-detail-${day.id}`}
                                onClick={() => onShowDayDetails(day.id)}
                                className="inline-flex items-center justify-center gap-1 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                title="Ver detalhes do dia"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Detalhes</span>
                              </button>
                            </DayHoverTooltip>
                          )}
                          {onClearDay && (s?.countDisplay ?? "0 MTTs") !== "0 MTTs" && (
                            <button
                              type="button"
                              data-testid={`week-grid-day-clear-${day.id}`}
                              onClick={() => onClearDay(day.id)}
                              className="inline-flex items-center justify-center gap-1 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 transition-colors hover:border-red-700/70 hover:bg-red-950/40 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-400"
                              title="Remover todos os torneios deste dia"
                            >
                              <Eraser className="h-3.5 w-3.5" />
                              <span>Limpar</span>
                            </button>
                          )}
                          </div>
                        </div>
                      );
                    })()}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {TIME_SLOTS.map((slot) => (
              <tr key={slot}>
                <td className="bg-gray-900 border border-gray-700 p-0.5 text-xs text-gray-400 text-center font-mono sticky left-0 z-10 w-14">
                  {slot}
                </td>
                {GRID_DAYS.map((day) => {
                  const activeProfile = getActiveProfile(day.id);
                  const isOff = activeProfile === "OFF" || !activeProfile;
                  const cellTournaments = getTournamentsForCell(day.id, slot);
                  // Todos os torneios do slot, em ordem de horario (prioridade
                  // so desempata). A ordem precisa casar com a regra de drop:
                  // soltar abaixo de um 11:30 vira 11:31.
                  const cellList = sortCellByTime(cellTournaments);
                  const droppableId = `cell-${day.id}-${slot}`;

                  return (
                    <Droppable key={droppableId} droppableId={droppableId} isDropDisabled={isOff}>
                      {(provided, snapshot) => (
                        <td
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`border border-gray-700/70 p-1 align-top min-h-[44px] transition-colors group ${
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
                            <div className={viewMode === "expanded" ? "space-y-1.5" : "space-y-1"}>
                              {cellList.map((t: any, idx: number) => (
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
                                        compact={viewMode !== "expanded"}
                                      />
                                    </div>
                                  )}
                                </Draggable>
                              ))}
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
// Sprint coach-page-reform-1 RF-06: hover X delete com gate 1s anti-misclick.
// Exportado como named export para teste isolado.
// =============================================================================

export function CellChip({
  tournament,
  onClick,
  onRemove,
  compact = true,
}: {
  tournament: any;
  onClick: () => void;
  onRemove?: (id: string) => void;
  compact?: boolean;
}) {
  // hovering = mouse dentro do chip mas gate ainda nao completou.
  // isArmed = gate de 1s completou. Mouseleave apos armed preserva.
  const [hovering, setHovering] = useState(false);
  const [isArmed, setIsArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Reset gate quando o chip e reusado para outro torneio (drag-drop, virtual list).
  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHovering(false);
    setIsArmed(false);
  }, [tournament.id]);

  const handleMouseEnter = () => {
    if (timerRef.current !== null || isArmed) return;
    setHovering(true);
    timerRef.current = setTimeout(() => {
      setIsArmed(true);
      timerRef.current = null;
    }, 1000);
  };

  const handleMouseLeave = () => {
    if (isArmed) return; // Preserva armed apos saida.
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHovering(false);
  };

  const handleXClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isArmed) {
      // Grace period — noop.
      return;
    }
    if (onRemove) {
      onRemove(tournament.id);
    }
  };

  // Sem popover: hover mostra o tooltip do chip (nome completo, buy-in, GTD,
  // participantes estimados) e o clique abre direto o modal de edicao — o
  // popover duplicava as duas coisas e roubava o clique.
  return (
        <div
          className="group relative"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <TournamentChip tournament={tournament} onClick={onClick} compact={compact} />
          {onRemove && (
            <button
              type="button"
              data-testid={`tournament-chip-x-delete-${tournament.id}`}
              aria-label={
                isArmed ? 'Remover torneio' : 'Remover torneio (aguarde 1s)'
              }
              aria-disabled={!isArmed}
              title={isArmed ? 'Remover torneio' : 'Aguarde 1s'}
              onClick={handleXClick}
              // Importante: NAO usar `group-hover:` aqui — class*="group" matchearia
              // este botao em testes que fazem `closest('[class*="group"]')`. Em vez
              // disso, controlamos visibilidade via opacity inline (via armedAt e isArmed).
              style={{
                opacity: !hovering && !isArmed ? 0 : isArmed ? 1 : 0.4,
                pointerEvents: !hovering && !isArmed ? 'none' : undefined,
              }}
              className={
                'absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-600 ' +
                'flex items-center justify-center text-white transition-opacity ' +
                (isArmed ? 'cursor-pointer' : 'cursor-not-allowed')
              }
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
  );
}
