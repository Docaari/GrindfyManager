import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProfileStates, useUpdateProfileState } from "@/hooks/useProfileStates";
import { DragDropContext, type DropResult } from "react-beautiful-dnd";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { validateDrop, mapLibraryToPlanned, calculateMove } from "@shared/drag-drop-utils";
import { checkOffToggleWarning } from "@shared/grade-off-toggle";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { tournamentSchema, type TournamentForm, weekDays } from '@/components/grade-planner/types';
import { LoadingScreen } from '@/components/grade-planner/LoadingScreen';
import { WeeklySummaryBar } from '@/components/grade-planner/WeeklySummaryBar';
import { WeekGrid } from '@/components/grade-planner/WeekGrid';
import { BibliotecaPanel } from '@/components/grade-planner/BibliotecaPanel';
import { ProfileComparison } from '@/components/grade-planner/ProfileComparison';
import { GradeSettings } from '@/components/grade-planner/GradeSettings';
import { DeleteDialog } from '@/components/grade-planner/DeleteDialog';
import { EditDialog } from '@/components/grade-planner/EditDialog';

export default function GradePlanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  // State
  const [editingTournament, setEditingTournament] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [tournamentToDelete, setTournamentToDelete] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'compact' | 'expanded'>('compact');
  const [libraryCollapsed, setLibraryCollapsed] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingEnrichedFields, setPendingEnrichedFields] = useState<{ lateRegMinutes?: number | null; alertMinutesBefore?: number | null } | null>(null);
  const [mobileTab, setMobileTab] = useState<string>("grade");

  // Profile states
  const { data: profileStates, isLoading: profileStatesLoading } = useProfileStates();
  const updateProfileStateMutation = useUpdateProfileState();

  const getActiveProfile = (dayOfWeek: number): 'A' | 'B' | 'C' | 'OFF' | null => {
    const state = profileStates?.find((ps: any) => ps.dayOfWeek === dayOfWeek);
    const profile = state?.activeProfile;
    if (!profile) return null;
    if (profile === 'OFF') return 'OFF';
    if (profile === 'A' || profile === 'B' || profile === 'C') return profile;
    return null;
  };

  const setActiveProfile = (dayOfWeek: number, profile: 'A' | 'B' | 'C' | 'OFF') => {
    // Check OFF toggle warning
    if (profile === 'OFF') {
      const warning = checkOffToggleWarning(
        dayOfWeek,
        (plannedTournaments || []).map((t: any) => ({ ...t, isActive: true }))
      );
      if (warning.needsWarning) {
        const confirm = window.confirm(
          `Este dia possui ${warning.tournamentCount} torneio(s). Ao mudar para OFF, eles serao ocultados (nao deletados). Deseja continuar?`
        );
        if (!confirm) return;
      }
    }

    updateProfileStateMutation.mutate({
      dayOfWeek,
      activeProfile: profile,
      profileAData: {},
      profileBData: {}
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/profile-states"] });
      },
    });
  };

  const editForm = useForm<TournamentForm>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: { site: "", time: "", type: "", speed: "", name: "", buyIn: "", guaranteed: "", prioridade: 2 },
  });

  // Fetch planned tournaments
  const plannedQuery = useQuery({
    queryKey: ["/api/planned-tournaments"],
    enabled: !!user?.userPlatformId,
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/planned-tournaments");
        return Array.isArray(response) ? response : [];
      } catch {
        return [];
      }
    },
  });

  const plannedTournaments = plannedQuery.data || [];
  const plannedLoading = plannedQuery.isLoading;

  // Fetch grade hours
  const { data: gradeHours } = useQuery({
    queryKey: ["/api/grade-planner/hours"],
    queryFn: () => apiRequest("GET", "/api/grade-planner/hours"),
  });

  const gradeStartHour = gradeHours?.gradeStartHour ?? 12;
  const gradeEndHour = gradeHours?.gradeEndHour ?? 3;

  // Mutations
  const addPlannedMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/planned-tournaments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao adicionar torneio a grade", variant: "destructive" });
    },
  });

  const updateTournamentMutation = useMutation({
    mutationFn: async (data: { id: string; [key: string]: any }) => {
      const { id, ...updateData } = data;
      return await apiRequest("PUT", `/api/planned-tournaments/${id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      toast({ title: "Torneio Atualizado", description: "Torneio atualizado com sucesso" });
      setIsEditDialogOpen(false);
      setEditingTournament(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao Atualizar", description: error.message || "Erro desconhecido ao atualizar torneio", variant: "destructive" });
    },
  });

  const deleteTournamentMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/planned-tournaments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/active-days"] });
      toast({ title: "Torneio Excluido", description: "Torneio excluido com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao Excluir", description: error.message || "Erro desconhecido ao excluir torneio", variant: "destructive" });
    },
  });

  const updateHoursMutation = useMutation({
    mutationFn: async ({ gradeStartHour, gradeEndHour }: { gradeStartHour: number; gradeEndHour: number }) => {
      return await apiRequest("PUT", "/api/grade-planner/hours", { gradeStartHour, gradeEndHour });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grade-planner/hours"] });
      toast({ title: "Horarios Atualizados" });
      setIsSettingsOpen(false);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar horarios", variant: "destructive" });
    },
  });

  // Generate tournament name
  const generateTournamentName = (data: any) => {
    if (data.name && data.name.trim()) return data.name;
    const buyIn = `$${parseFloat(data.buyIn).toFixed(0)}`;
    const guaranteed = data.guaranteed ? ` $${parseFloat(data.guaranteed).toLocaleString('pt-BR')}` : '';
    return `${buyIn}${guaranteed} ${data.site}`;
  };

  // Tournament helpers
  const getTournamentsForDay = (dayId: number) => {
    const activeProfile = getActiveProfile(dayId);
    if (!activeProfile || activeProfile === 'OFF') return [];
    return (Array.isArray(plannedTournaments) ? plannedTournaments : []).filter(
      (t: any) => t.dayOfWeek === dayId && t.profile === activeProfile
    );
  };

  const isDayActiveWithTournaments = (dayOfWeek: number): boolean => {
    const activeProfile = getActiveProfile(dayOfWeek);
    if (!activeProfile || activeProfile === 'OFF') return false;
    return getTournamentsForDay(dayOfWeek).length > 0;
  };

  // Calculate stats for summary bar
  const calculateStats = (tournaments: any[]) => {
    const totalTournaments = tournaments.length;
    if (totalTournaments === 0) return {
      count: 0, avgBuyIn: 0, totalBuyIn: 0,
      vanillaPercentage: 0, pkoPercentage: 0, mysteryPercentage: 0,
      normalPercentage: 0, turboPercentage: 0, hyperPercentage: 0,
      avgFieldSize: 0, startTime: null, endTime: null, durationHours: 0,
    };

    const totalBuyIn = tournaments.reduce((sum: number, t: any) => sum + parseFloat(t.buyIn || 0), 0);
    const avgBuyIn = totalBuyIn / totalTournaments;

    const tournamentsWithTime = tournaments.filter((t: any) => t.time && t.time.trim() !== '');
    let startTime = null;
    let endTime = null;
    let durationHours = 0;

    if (tournamentsWithTime.length > 0) {
      const times = tournamentsWithTime.map((t: any) => {
        const [hours, minutes] = t.time.trim().split(':').map(Number);
        return hours * 60 + minutes;
      });
      const earliestMinutes = Math.min(...times);
      const latestMinutes = Math.max(...times);
      const earliestHours = Math.floor(earliestMinutes / 60);
      const earliestMins = earliestMinutes % 60;
      startTime = `${earliestHours.toString().padStart(2, '0')}:${earliestMins.toString().padStart(2, '0')}`;
      const endMinutes = latestMinutes + (3 * 60);
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      endTime = `${(endHours % 24).toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
      durationHours = (endMinutes - earliestMinutes) / 60;
    }

    return {
      count: totalTournaments, avgBuyIn, totalBuyIn,
      vanillaPercentage: 0, pkoPercentage: 0, mysteryPercentage: 0,
      normalPercentage: 0, turboPercentage: 0, hyperPercentage: 0,
      avgFieldSize: 0, startTime, endTime,
      durationHours: Math.round(durationHours * 10) / 10,
    };
  };

  const getDayStats = (dayId: number) => calculateStats(getTournamentsForDay(dayId));

  // Edit handlers
  const handleEditTournament = (tournament: any) => {
    setEditingTournament(tournament);
    editForm.reset({
      site: tournament.site || "",
      time: tournament.time || "",
      type: tournament.type || "",
      speed: tournament.speed || "",
      name: tournament.name || "",
      buyIn: tournament.buyIn?.toString() || "",
      guaranteed: tournament.guaranteed?.toString() || "",
      prioridade: Number(tournament.prioridade) || 2,
    });
    setTimeout(() => setIsEditDialogOpen(true), 50);
  };

  const handleEditSubmit = (data: TournamentForm) => {
    if (!editingTournament?.id) {
      toast({ title: "Erro", description: "ID do torneio nao encontrado", variant: "destructive" });
      return;
    }
    const enriched = pendingEnrichedFields || {};
    updateTournamentMutation.mutate({
      id: editingTournament.id,
      dayOfWeek: editingTournament.dayOfWeek,
      site: String(data.site || ""),
      time: String(data.time || ""),
      type: String(data.type || ""),
      speed: String(data.speed || ""),
      name: String(data.name || ""),
      buyIn: String(data.buyIn || "0"),
      guaranteed: String(data.guaranteed || "0"),
      prioridade: Number(data.prioridade) || 2,
      ...('lateRegMinutes' in enriched ? { lateRegMinutes: enriched.lateRegMinutes } : {}),
      ...('alertMinutesBefore' in enriched ? { alertMinutesBefore: enriched.alertMinutesBefore } : {}),
    });
    setPendingEnrichedFields(null);
  };

  const handleDeleteTournament = (tournament: any) => {
    setTournamentToDelete(tournament);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteTournament = () => {
    deleteTournamentMutation.mutate(tournamentToDelete.id);
    setIsDeleteDialogOpen(false);
    setTournamentToDelete(null);
  };

  const handleRemoveTournament = (id: string) => {
    deleteTournamentMutation.mutate(id);
  };

  const handleClickTournament = (tournament: any) => {
    handleEditTournament(tournament);
  };

  const handleClickEmptyCell = (dayOfWeek: number, time: string) => {
    const activeProfile = getActiveProfile(dayOfWeek);
    if (!activeProfile || activeProfile === 'OFF') return;
    // Quick inline add: create a minimal tournament
    // For now, open the edit form pre-filled
    const newTournament = {
      dayOfWeek,
      time,
      profile: activeProfile,
      site: "",
      type: "",
      speed: "",
      name: "",
      buyIn: "",
      guaranteed: "",
      prioridade: 2,
    };
    setEditingTournament(newTournament);
    editForm.reset({
      site: "",
      time,
      type: "",
      speed: "",
      name: "",
      buyIn: "",
      guaranteed: "",
      prioridade: 2,
    });
    // Use the edit dialog for new inline add too (submit will POST)
    setTimeout(() => setIsEditDialogOpen(true), 50);
  };

  // Override edit submit to handle new tournaments (no id)
  const handleFormSubmit = (data: TournamentForm) => {
    if (editingTournament?.id) {
      // Existing tournament - update
      handleEditSubmit(data);
    } else {
      // New tournament - create
      const activeProfile = getActiveProfile(editingTournament?.dayOfWeek ?? 0);
      addPlannedMutation.mutate({
        dayOfWeek: editingTournament?.dayOfWeek ?? 0,
        profile: activeProfile || 'A',
        site: String(data.site || ""),
        time: String(data.time || ""),
        type: String(data.type || ""),
        speed: String(data.speed || ""),
        name: String(data.name || ""),
        buyIn: String(data.buyIn || "0"),
        guaranteed: String(data.guaranteed || "0"),
        prioridade: Number(data.prioridade) || 2,
      }, {
        onSuccess: () => {
          setIsEditDialogOpen(false);
          setEditingTournament(null);
          toast({ title: "Torneio Adicionado", description: "Torneio adicionado a grade" });
        },
      });
    }
  };

  // =========================================================================
  // Drag & Drop handler
  // =========================================================================
  const handleDragEnd = useCallback((result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;

    // Parse destination droppable ID: "cell-{dayOfWeek}-{time}"
    const destParts = destination.droppableId.split("-");
    if (destParts[0] !== "cell" || destParts.length < 3) return;

    const destDayOfWeek = parseInt(destParts[1], 10);
    const destTime = destParts.slice(2).join("-"); // Handle "HH:00" format
    const destProfile = getActiveProfile(destDayOfWeek);

    // Validate the drop
    const validation = validateDrop(
      {},
      { dayOfWeek: destDayOfWeek, time: destTime, profile: destProfile }
    );

    if (!validation.allowed) {
      toast({
        title: "Drop nao permitido",
        description: validation.reason || "Operacao invalida",
        variant: "destructive",
      });
      return;
    }

    // Determine source type
    if (draggableId.startsWith("library-")) {
      // Dragging from library to grid
      const libraryId = draggableId.replace("library-", "");
      // We need to find the library tournament data from the query cache
      const libraryData = queryClient.getQueryData<any[]>(["/api/tournament-library"]);
      const libraryTournament = (libraryData || []).find((t: any) => t.id === libraryId);

      if (!libraryTournament) return;

      const planned = mapLibraryToPlanned(libraryTournament, {
        dayOfWeek: destDayOfWeek,
        time: destTime,
        profile: destProfile!,
      });

      addPlannedMutation.mutate(planned);
    } else if (draggableId.startsWith("cell-")) {
      // Dragging from one cell to another (reposition)
      const tournamentId = draggableId.replace("cell-", "");
      const tournament = plannedTournaments.find((t: any) => t.id === tournamentId);

      if (!tournament) return;

      const move = calculateMove(tournament, destDayOfWeek, destTime);

      if (Object.keys(move.updates).length > 0) {
        updateTournamentMutation.mutate({
          id: tournamentId,
          ...move.updates,
        });
      }
    }
  }, [plannedTournaments, getActiveProfile, queryClient, addPlannedMutation, updateTournamentMutation, toast]);

  // Loading screen (must be AFTER all hooks)
  if (plannedLoading || profileStatesLoading || !user) {
    return <LoadingScreen />;
  }

  // =========================================================================
  // Render
  // =========================================================================

  const gradeContent = (
    <WeekGrid
      plannedTournaments={plannedTournaments}
      viewMode={viewMode}
      getActiveProfile={getActiveProfile}
      setActiveProfile={setActiveProfile}
      onClickTournament={handleClickTournament}
      onClickEmptyCell={handleClickEmptyCell}
      onRemoveTournament={handleRemoveTournament}
      gradeStartHour={gradeStartHour}
      gradeEndHour={gradeEndHour}
      onOpenSettings={() => setIsSettingsOpen(true)}
    />
  );

  const bibliotecaContent = (
    <BibliotecaPanel
      collapsed={libraryCollapsed && !isMobile}
      onToggleCollapsed={() => setLibraryCollapsed(!libraryCollapsed)}
    />
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="w-full px-6 py-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-white">Grade</h2>
            <p className="text-gray-400 text-sm">Planeje sua grade semanal</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode(viewMode === 'compact' ? 'expanded' : 'compact')}
              className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
              title={viewMode === 'compact' ? 'Modo expandido' : 'Modo compacto'}
            >
              {viewMode === 'compact' ? (
                <Maximize2 className="h-4 w-4" />
              ) : (
                <Minimize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Summary Bar */}
        <WeeklySummaryBar
          getTournamentsForDay={getTournamentsForDay}
          getDayStats={getDayStats}
          isDayActiveWithTournaments={isDayActiveWithTournaments}
        />

        {/* Main layout */}
        {isMobile ? (
          // Mobile: Tabs
          <Tabs value={mobileTab} onValueChange={setMobileTab} className="w-full">
            <TabsList className="w-full bg-gray-800 border border-gray-700 mb-4">
              <TabsTrigger value="biblioteca" className="flex-1 text-sm">Biblioteca</TabsTrigger>
              <TabsTrigger value="grade" className="flex-1 text-sm">Grade</TabsTrigger>
            </TabsList>
            <TabsContent value="biblioteca" className="mt-0">
              <div className="h-[calc(100vh-280px)]">
                {bibliotecaContent}
              </div>
            </TabsContent>
            <TabsContent value="grade" className="mt-0">
              {gradeContent}
            </TabsContent>
          </Tabs>
        ) : (
          // Desktop: Split panels
          <div className="flex gap-4">
            {bibliotecaContent}
            {gradeContent}
          </div>
        )}

        {/* Profile Comparison */}
        <ProfileComparison />

        {/* ============================================================= */}
        {/* Dialogs */}
        {/* ============================================================= */}

        <GradeSettings
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          currentStartHour={gradeStartHour}
          currentEndHour={gradeEndHour}
          onSave={(start, end) => updateHoursMutation.mutate({ gradeStartHour: start, gradeEndHour: end })}
          isPending={updateHoursMutation.isPending}
        />

        <DeleteDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          tournament={tournamentToDelete}
          onConfirm={confirmDeleteTournament}
          generateTournamentName={generateTournamentName}
        />

        <EditDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          editForm={editForm}
          onSubmit={handleFormSubmit}
          onCancel={() => { setIsEditDialogOpen(false); setEditingTournament(null); setPendingEnrichedFields(null); }}
          isPending={updateTournamentMutation.isPending || addPlannedMutation.isPending}
          editingTournament={editingTournament}
          onUpdateEnrichedFields={(fields) => setPendingEnrichedFields(fields)}
        />
      </div>
    </DragDropContext>
  );
}
