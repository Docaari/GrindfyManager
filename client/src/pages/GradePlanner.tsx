import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useProfileStates, useUpdateProfileState } from "@/hooks/useProfileStates";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import SupremaImportModal from "@/components/SupremaImportModal";

import { tournamentSchema, type TournamentForm, weekDays, type DayStats, emptyDayStats } from '@/components/grade-planner/types';
import { LoadingScreen } from '@/components/grade-planner/LoadingScreen';
import { WeeklySummaryDashboard } from '@/components/grade-planner/WeeklySummaryDashboard';
import { DayCard } from '@/components/grade-planner/DayCard';
import { PlanningDialog } from '@/components/grade-planner/PlanningDialog';
import { DeleteDialog } from '@/components/grade-planner/DeleteDialog';
import { EditDialog } from '@/components/grade-planner/EditDialog';

export default function GradePlanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<'A' | 'B' | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [tournamentToDelete, setTournamentToDelete] = useState<any>(null);
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(false);
  const [showSupremaModal, setShowSupremaModal] = useState(false);

  // Profile states
  const { data: profileStates, isLoading: profileStatesLoading } = useProfileStates();
  const updateProfileStateMutation = useUpdateProfileState();

  const getActiveProfile = (dayOfWeek: number): 'A' | 'B' | 'C' | null => {
    const state = profileStates?.find((ps: any) => ps.dayOfWeek === dayOfWeek);
    return (state?.activeProfile as 'A' | 'B' | 'C' | null) || null;
  };

  const setActiveProfile = (dayOfWeek: number, profile: 'A' | 'B' | 'C') => {
    const currentActive = getActiveProfile(dayOfWeek);
    const newProfile = currentActive === profile ? null : profile;
    updateProfileStateMutation.mutate({
      dayOfWeek,
      activeProfile: newProfile,
      profileAData: {},
      profileBData: {}
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/profile-states"] });
      },
    });
  };

  const form = useForm<TournamentForm>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: { site: "", time: "", type: "", speed: "", name: "", buyIn: "", guaranteed: "", prioridade: 2 },
  });

  const editForm = useForm<TournamentForm>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: { site: "", time: "", type: "", speed: "", name: "", buyIn: "", guaranteed: "", prioridade: 2 },
  });

  // Fetch active days
  const { data: activeDays } = useQuery({
    queryKey: ["/api/active-days"],
    queryFn: () => apiRequest("GET", "/api/active-days"),
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

  // Fetch tournament suggestions
  const { data: tournamentSuggestions = [] } = useQuery({
    queryKey: ["/api/tournament-suggestions"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/tournament-suggestions");
      return Array.isArray(response) ? response : [];
    },
  });

  // Auto-save mutation
  const autoSaveTournamentMutation = useMutation({
    mutationFn: async (tournament: TournamentForm) => {
      return await apiRequest("POST", "/api/planned-tournaments", tournament);
    },
    onMutate: () => { setSaveStatus('saving'); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      queryClient.refetchQueries({ queryKey: ["/api/planned-tournaments"] });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: () => {
      setSaveStatus('error');
      toast({ title: "Erro ao Salvar", description: "Falha ao salvar torneio automaticamente. Tente novamente.", variant: "destructive" });
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
  });

  // Update tournament mutation
  const updateTournamentMutation = useMutation({
    mutationFn: async (data: { id: string; [key: string]: any }) => {
      const { id, ...updateData } = data;
      return await apiRequest("PUT", `/api/planned-tournaments/${id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      queryClient.refetchQueries({ queryKey: ["/api/planned-tournaments"] });
      toast({ title: "Torneio Atualizado", description: "Torneio atualizado com sucesso" });
      setIsEditDialogOpen(false);
      setEditingTournament(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao Atualizar", description: error.message || "Erro desconhecido ao atualizar torneio", variant: "destructive" });
    },
  });

  // Delete tournament mutation
  const deleteTournamentMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/planned-tournaments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/active-days"] });
      toast({ title: "Torneio Exclu\u00eddo", description: "Torneio exclu\u00eddo com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao Excluir", description: error.message || "Erro desconhecido ao excluir torneio", variant: "destructive" });
    },
  });

  // Toggle active day mutation
  const toggleActiveDayMutation = useMutation({
    mutationFn: async (dayOfWeek: number) => {
      return await apiRequest("POST", "/api/active-days/toggle", { dayOfWeek });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/active-days"] });
      toast({ title: "Dia Atualizado", description: "Status do dia foi alterado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar o status do dia", variant: "destructive" });
    },
  });

  // Loading screen
  if (plannedLoading || profileStatesLoading || !user) {
    return <LoadingScreen />;
  }

  // Generate tournament name
  const generateTournamentName = (data: any) => {
    if (data.name && data.name.trim()) return data.name;
    const buyIn = `$${parseFloat(data.buyIn).toFixed(0)}`;
    const guaranteed = data.guaranteed ? ` $${parseFloat(data.guaranteed).toLocaleString('pt-BR')}` : '';
    return `${buyIn}${guaranteed} ${data.site}`;
  };

  // Form submit handler
  const onSubmit = (data: TournamentForm) => {
    const sanitizedData = {
      dayOfWeek: selectedDay || 0,
      profile: selectedProfile || getActiveProfile(selectedDay || 0) || 'A',
      site: String(data.site || ""),
      time: String(data.time || ""),
      type: String(data.type || ""),
      speed: String(data.speed || ""),
      name: String(data.name || ""),
      buyIn: String(data.buyIn || "0"),
      guaranteed: String(data.guaranteed || "0"),
      prioridade: Number(data.prioridade) || 2,
    };
    autoSaveTournamentMutation.mutate(sanitizedData);
    const persistedSite = sanitizedData.site;
    form.reset();
    form.setValue("site", persistedSite);
    form.setValue("prioridade", 2);
    if (selectedDay !== null) form.setValue("dayOfWeek", selectedDay);
  };

  // Tournament helpers
  const getTournamentsForDay = (dayId: number) => {
    const activeProfile = getActiveProfile(dayId) || 'A';
    const allTournamentsForDay = (Array.isArray(plannedTournaments) ? plannedTournaments : []).filter((t: any) => t.dayOfWeek === dayId);
    return allTournamentsForDay.filter((t: any) => t.profile === activeProfile);
  };

  const getTournamentsForModalProfile = (dayId: number, profileToShow: 'A' | 'B') => {
    const allTournamentsForDay = (Array.isArray(plannedTournaments) ? plannedTournaments : []).filter((t: any) => t.dayOfWeek === dayId);
    return allTournamentsForDay.filter((t: any) => t.profile === profileToShow);
  };

  const getTournamentsForProfile = (dayId: number, profile: 'A' | 'B') => {
    return (Array.isArray(plannedTournaments) ? plannedTournaments : []).filter((t: any) =>
      t.dayOfWeek === dayId && t.profile === profile
    );
  };

  const isDayActiveWithTournaments = (dayOfWeek: number): boolean => {
    const activeProfile = getActiveProfile(dayOfWeek);
    if (!activeProfile) return false;
    return getTournamentsForDay(dayOfWeek).length > 0;
  };

  // Calculate stats for a set of tournaments
  const calculateStats = (tournaments: any[]): DayStats => {
    const totalTournaments = tournaments.length;
    if (totalTournaments === 0) return { ...emptyDayStats };

    const totalBuyIn = tournaments.reduce((sum: number, t: any) => sum + parseFloat(t.buyIn || 0), 0);
    const avgBuyIn = totalBuyIn / totalTournaments;

    const vanillaCount = tournaments.filter((t: any) => t.type === 'Vanilla').length;
    const pkoCount = tournaments.filter((t: any) => t.type === 'PKO').length;
    const mysteryCount = tournaments.filter((t: any) => t.type === 'Mystery').length;
    const normalCount = tournaments.filter((t: any) => t.speed === 'Normal').length;
    const turboCount = tournaments.filter((t: any) => t.speed === 'Turbo').length;
    const hyperCount = tournaments.filter((t: any) => t.speed === 'Hyper').length;

    const tournamentsWithTime = tournaments.filter((t: any) => t.time && t.time.trim() !== '');
    let startTime = null;
    let endTime = null;
    let durationHours = 0;

    if (tournamentsWithTime.length > 0) {
      const times = tournamentsWithTime.map((t: any) => {
        const timeStr = t.time.trim();
        const [hours, minutes] = timeStr.split(':').map(Number);
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
      count: totalTournaments,
      avgBuyIn,
      totalBuyIn,
      vanillaPercentage: (vanillaCount / totalTournaments) * 100,
      pkoPercentage: (pkoCount / totalTournaments) * 100,
      mysteryPercentage: (mysteryCount / totalTournaments) * 100,
      normalPercentage: (normalCount / totalTournaments) * 100,
      turboPercentage: (turboCount / totalTournaments) * 100,
      hyperPercentage: (hyperCount / totalTournaments) * 100,
      avgFieldSize: 0,
      startTime,
      endTime,
      durationHours: Math.round(durationHours * 10) / 10,
    };
  };

  const getDayStats = (dayId: number): DayStats => calculateStats(getTournamentsForDay(dayId));
  const getProfileStats = (dayId: number, profile: 'A' | 'B'): DayStats => calculateStats(getTournamentsForProfile(dayId, profile));

  // Suggestion logic
  const getSuggestedTournaments = () => {
    const currentSite = form.watch("site");
    const currentType = form.watch("type");
    const currentSpeed = form.watch("speed");
    const currentBuyIn = form.watch("buyIn");

    const selectedDayNumber = selectedDay || 0;
    const activeProfile = getActiveProfile(selectedDayNumber);
    const allUserTournaments = Array.isArray(plannedTournaments) ? plannedTournaments : [];
    const userTournaments = activeProfile ? allUserTournaments.filter((t: any) => t.profile === activeProfile) : [];

    const globalSuggestions = (Array.isArray(tournamentSuggestions) ? tournamentSuggestions : []).map((t: any) => ({
      ...t, isGlobal: true, frequency: 1
    }));

    const otherDayTournaments = userTournaments.filter((t: any) => t.dayOfWeek !== selectedDayNumber);
    const suggestedVariations = generateTournamentVariations(Array.isArray(userTournaments) ? userTournaments : []);

    let allPotentialSuggestions = [...otherDayTournaments, ...suggestedVariations, ...globalSuggestions];
    let filteredSuggestions = allPotentialSuggestions;

    if (currentSite && currentSite.trim() !== "") {
      filteredSuggestions = filteredSuggestions.filter((t: any) => t.site === currentSite);
    }
    if (currentType && currentType.trim() !== "") {
      filteredSuggestions = filteredSuggestions.filter((t: any) => t.type === currentType);
    }
    if (currentSpeed && currentSpeed.trim() !== "") {
      filteredSuggestions = filteredSuggestions.filter((t: any) => t.speed === currentSpeed);
    }
    if (currentBuyIn && currentBuyIn.trim() !== "" && !isNaN(parseFloat(currentBuyIn))) {
      const buyInValue = parseFloat(currentBuyIn);
      const tolerance = buyInValue * 0.2;
      filteredSuggestions = filteredSuggestions.filter((t: any) => {
        const tournamentBuyIn = parseFloat(t.buyIn || 0);
        return Math.abs(tournamentBuyIn - buyInValue) <= tolerance;
      });
    }

    const frequencyMap = new Map();
    filteredSuggestions.forEach((t: any) => {
      const key = `${t.site}-${t.type}-${t.speed}-${t.buyIn}`;
      frequencyMap.set(key, (frequencyMap.get(key) || 0) + 1);
    });

    let suggestions = Array.from(frequencyMap.entries())
      .map(([key, frequency]) => {
        const tournament = filteredSuggestions.find((t: any) => `${t.site}-${t.type}-${t.speed}-${t.buyIn}` === key);
        return { ...tournament, frequency };
      })
      .sort((a: any, b: any) => b.frequency - a.frequency)
      .slice(0, 8);

    if (suggestions.length === 0) {
      suggestions = getDefaultSuggestions();
    }
    return suggestions;
  };

  const generateTournamentVariations = (tournaments: any[]) => {
    const variations: any[] = [];
    tournaments.forEach((tournament: any) => {
      ['Normal', 'Turbo', 'Hyper'].forEach(speed => {
        if (speed !== tournament.speed) {
          variations.push({ ...tournament, speed, name: `${tournament.name} (${speed})`, id: `variation-${tournament.id}-${speed}`, frequency: 1 });
        }
      });
      ['Vanilla', 'PKO', 'Mystery'].forEach(type => {
        if (type !== tournament.type) {
          variations.push({ ...tournament, type, name: `${tournament.name} (${type})`, id: `variation-${tournament.id}-${type}`, frequency: 1 });
        }
      });
      const buyIn = parseFloat(tournament.buyIn || 0);
      if (buyIn > 0) {
        [Math.round(buyIn * 0.5), Math.round(buyIn * 1.5), Math.round(buyIn * 2)].forEach(varBuyIn => {
          if (varBuyIn !== buyIn && varBuyIn > 0) {
            variations.push({ ...tournament, buyIn: varBuyIn.toString(), name: `${tournament.name} ($${varBuyIn})`, id: `variation-${tournament.id}-${varBuyIn}`, frequency: 1 });
          }
        });
      }
    });
    return variations.slice(0, 10);
  };

  const getDefaultSuggestions = () => [
    { id: 'default-1', site: 'PokerStars', type: 'Vanilla', speed: 'Normal', buyIn: '11', guaranteed: '10000', name: 'The Hot $11', time: '20:00', frequency: 1 },
    { id: 'default-2', site: 'PokerStars', type: 'PKO', speed: 'Turbo', buyIn: '22', guaranteed: '25000', name: 'PKO Turbo', time: '21:00', frequency: 1 },
    { id: 'default-3', site: 'WPN', type: 'Vanilla', speed: 'Normal', buyIn: '55', guaranteed: '20000', name: 'The Loncar', time: '19:15', frequency: 1 },
    { id: 'default-4', site: 'GGPoker', type: 'Mystery', speed: 'Hyper', buyIn: '33', guaranteed: '15000', name: 'Mystery Hyper', time: '22:00', frequency: 1 },
    { id: 'default-5', site: 'PartyPoker', type: 'Vanilla', speed: 'Normal', buyIn: '109', guaranteed: '50000', name: 'Daily Legend', time: '20:30', frequency: 1 },
  ];

  const suggestions = getSuggestedTournaments();

  // Edit handlers
  const handleEditSubmit = (data: TournamentForm) => {
    if (!editingTournament?.id) {
      toast({ title: "Erro", description: "ID do torneio n\u00e3o encontrado", variant: "destructive" });
      return;
    }
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
    });
  };

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

  const handleDeleteTournament = (tournament: any) => {
    setTournamentToDelete(tournament);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteTournament = () => {
    deleteTournamentMutation.mutate(tournamentToDelete.id);
    setIsDeleteDialogOpen(false);
    setTournamentToDelete(null);
  };

  const handleSelectSuggestion = (suggestion: any) => {
    if (selectedDay !== null) {
      form.setValue("site", suggestion.site);
      form.setValue("type", suggestion.type);
      form.setValue("speed", suggestion.speed);
      form.setValue("buyIn", suggestion.buyIn);
      form.setValue("guaranteed", suggestion.guaranteed || "");
      form.setValue("name", suggestion.name || "");
      form.setValue("time", suggestion.time || "");
    }
  };

  const handleOpenDialog = (dayId: number, profile: 'A' | 'B') => {
    setSelectedDay(dayId);
    setSelectedProfile(profile);
    form.setValue("dayOfWeek", dayId);
    setIsDialogOpen(true);
  };

  return (
    <div className="w-full px-6 py-6">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold mb-2 text-white">Grade </h2>
          <p className="text-gray-400">Planeje sua grade semanal</p>
        </div>
        <Button
          onClick={() => setShowSupremaModal(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Importar Grade Suprema
        </Button>
      </div>

      {/* Weekly Planning Section */}
      <div className="mb-8">
        <WeeklySummaryDashboard
          isDashboardExpanded={isDashboardExpanded}
          isDayActiveWithTournaments={isDayActiveWithTournaments}
          getTournamentsForDay={getTournamentsForDay}
          getDayStats={getDayStats}
        />

        <div className="days-grid">
          {weekDays.map((day) => (
            <DayCard
              key={day.id}
              day={day}
              getActiveProfile={getActiveProfile}
              setActiveProfile={setActiveProfile}
              getProfileStats={getProfileStats}
              getTournamentsForProfile={getTournamentsForProfile}
              onOpenDialog={handleOpenDialog}
            />
          ))}
        </div>
      </div>

      <PlanningDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        selectedDay={selectedDay}
        selectedProfile={selectedProfile}
        form={form}
        onSubmit={onSubmit}
        getDayStats={getDayStats}
        getTournamentsForModalProfile={getTournamentsForModalProfile}
        generateTournamentName={generateTournamentName}
        suggestions={suggestions}
        onSelectSuggestion={handleSelectSuggestion}
        onEditTournament={handleEditTournament}
        onDeleteTournament={handleDeleteTournament}
        saveStatus={saveStatus}
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
        onSubmit={handleEditSubmit}
        onCancel={() => { setIsEditDialogOpen(false); setEditingTournament(null); }}
        isPending={updateTournamentMutation.isPending}
      />

      <SupremaImportModal
        open={showSupremaModal}
        onClose={() => setShowSupremaModal(false)}
        excludeExternalIds={
          (Array.isArray(plannedTournaments) ? plannedTournaments : [])
            .filter((t: any) => t.externalId)
            .map((t: any) => t.externalId)
        }
        onImport={async (tournaments) => {
          const currentDayOfWeek = new Date().getDay();
          const activeProfile = getActiveProfile(currentDayOfWeek) || 'A';
          let importedCount = 0;
          for (const t of tournaments) {
            try {
              await apiRequest("POST", "/api/planned-tournaments", {
                dayOfWeek: currentDayOfWeek,
                profile: activeProfile,
                site: t.site,
                time: t.time,
                type: t.type,
                speed: t.speed,
                name: t.name,
                buyIn: t.buyIn,
                guaranteed: t.guaranteed,
                prioridade: t.prioridade,
                externalId: t.externalId,
                status: "upcoming",
              });
              importedCount++;
            } catch {
              // Skip failed imports silently
            }
          }
          queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
          if (importedCount > 0) {
            toast({
              title: "Importacao Concluida",
              description: `${importedCount} torneios importados da Suprema Poker`,
            });
          }
        }}
      />
    </div>
  );
}
