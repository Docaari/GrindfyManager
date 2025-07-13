import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Calendar, 
  Clock, 
  Plus, 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Target,
  X,
  Eye,
  ExternalLink,
  Power,
  PowerOff,
  GripVertical,
  Move3D,
  Edit,
  Trash2,
  Save,
  MoreVertical,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const tournamentSchema = z.object({
  dayOfWeek: z.number(),
  site: z.string().min(1, "Site é obrigatório"),
  time: z.string().min(1, "Horário é obrigatório"),
  type: z.string().min(1, "Tipo é obrigatório"),
  speed: z.string().min(1, "Velocidade é obrigatória"),
  name: z.string().optional(),
  buyIn: z.string().min(1, "Buy-in é obrigatório"),
  guaranteed: z.string().optional(),
  prioridade: z.coerce.number().min(1).max(3).default(2), // 1-Alta, 2-Média, 3-Baixa (z.coerce converts string to number)
});

type TournamentForm = z.infer<typeof tournamentSchema>;

const weekDays = [
  { id: 0, name: "Domingo", short: "Dom" },
  { id: 1, name: "Segunda", short: "Seg" },
  { id: 2, name: "Terça", short: "Ter" },
  { id: 3, name: "Quarta", short: "Qua" },
  { id: 4, name: "Quinta", short: "Qui" },
  { id: 5, name: "Sexta", short: "Sex" },
  { id: 6, name: "Sábado", short: "Sab" },
];

const sites = [
  "PokerStars", "PartyPoker", "888poker", "GGPoker", "WPN", 
  "iPoker", "CoinPoker", "Chico", "Revolution", "Bodog"
];

const types = ["PKO", "Vanilla", "Mystery"];
const speeds = ["Normal", "Turbo", "Hyper"];
const prioridades = [
  { value: 1, label: "Alta", color: "bg-red-600" },
  { value: 2, label: "Média", color: "bg-yellow-600" },
  { value: 3, label: "Baixa", color: "bg-green-600" }
];

// Site color mapping function
const getSiteColor = (site: string) => {
  const colors: {[key: string]: string} = {
    "PokerStars": "bg-red-600",
    "PartyPoker": "bg-orange-600", 
    "888poker": "bg-blue-600",
    "GGPoker": "bg-red-800",
    "WPN": "bg-green-800",
    "iPoker": "bg-orange-400",
    "CoinPoker": "bg-pink-600",
    "Chico": "bg-white",
    "Revolution": "bg-pink-800",
    "Bodog": "bg-red-400"
  };
  return colors[site] || "bg-gray-600";
};

// Type color mapping function
const getTypeColor = (type: string) => {
  const colors: {[key: string]: string} = {
    "Vanilla": "bg-blue-600",
    "PKO": "bg-orange-600",
    "Mystery": "bg-green-600"
  };
  return colors[type] || "bg-gray-600";
};

// Speed color mapping function
const getSpeedColor = (speed: string) => {
  const colors: {[key: string]: string} = {
    "Normal": "bg-green-600",
    "Turbo": "bg-yellow-600",
    "Hyper": "bg-red-600"
  };
  return colors[speed] || "bg-gray-600";
};

// Priority color mapping function
const getPrioridadeColor = (prioridade: number) => {
  const colors: {[key: number]: string} = {
    1: "bg-red-600", // Alta
    2: "bg-yellow-600", // Média
    3: "bg-green-600" // Baixa
  };
  return colors[prioridade] || "bg-yellow-600";
};

// Priority label mapping function
const getPrioridadeLabel = (prioridade: number) => {
  const labels: {[key: number]: string} = {
    1: "Alta",
    2: "Média", 
    3: "Baixa"
  };
  return labels[prioridade] || "Média";
};

export default function GradePlanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [pendingTournaments, setPendingTournaments] = useState<TournamentForm[]>([]); // Local state for unsaved tournaments
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editingTournament, setEditingTournament] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [tournamentToDelete, setTournamentToDelete] = useState<any>(null);
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(false);

  const form = useForm<TournamentForm>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: {
      site: "",
      time: "",
      type: "",
      speed: "",
      name: "",
      buyIn: "",
      guaranteed: "",
      prioridade: 2, // Média por padrão
    },
  });

  // Edit form for editing tournaments
  const editForm = useForm<TournamentForm>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: {
      site: "",
      time: "",
      type: "",
      speed: "",
      name: "",
      buyIn: "",
      guaranteed: "",
      prioridade: 2, // Média por padrão
    },
  });

  // Fetch performance analytics - use 'all' period to get complete dataset
  const { data: siteAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-site", "all"],
    queryFn: async () => {
      const response = await fetch("/api/analytics/by-site?period=all", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch site analytics");
      return response.json();
    },
  });

  const { data: buyinAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-buyin", "all"],
    queryFn: async () => {
      const response = await fetch("/api/analytics/by-buyin?period=all", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch buyin analytics");
      return response.json();
    },
  });

  const { data: categoryAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-category", "all"],
    queryFn: async () => {
      const response = await fetch("/api/analytics/by-category?period=all", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch category analytics");
      return response.json();
    },
  });

  // Fetch tournament library - use 'all' period to get complete dataset
  const { data: tournamentLibrary } = useQuery({
    queryKey: ["/api/tournament-library", "all"],
    queryFn: async () => {
      const response = await fetch("/api/tournament-library?period=all", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch tournament library");
      return response.json();
    },
  });

  // Fetch active days
  const { data: activeDays } = useQuery({
    queryKey: ["/api/active-days"],
    queryFn: async () => {
      const response = await fetch("/api/active-days", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch active days");
      return response.json();
    },
  });

  // Fetch planned tournaments
  const { data: plannedTournaments } = useQuery({
    queryKey: ["/api/planned-tournaments"],
    queryFn: async () => {
      const response = await fetch("/api/planned-tournaments", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch planned tournaments");
      return response.json();
    },
  });

  // Batch save mutation for better performance
  const saveAllTournamentsMutation = useMutation({
    mutationFn: async (tournaments: TournamentForm[]) => {
      console.log("🔍 SAVE DEBUG - Starting save process");
      console.log("🔍 SAVE DEBUG - Number of tournaments to save:", tournaments.length);
      console.log("🔍 SAVE DEBUG - Tournaments data:", tournaments);
      
      const promises = tournaments.map((tournament, index) => {
        console.log(`🔍 SAVE DEBUG - Processing tournament ${index + 1}:`, tournament);
        
        return apiRequest("/api/planned-tournaments", {
          method: "POST",
          body: JSON.stringify(tournament)
        }).then(res => {
          console.log(`🔍 SAVE DEBUG - Response status for tournament ${index + 1}:`, res.status);
          if (!res.ok) {
            console.error(`🔍 SAVE DEBUG - Error response for tournament ${index + 1}:`, res.status, res.statusText);
            throw new Error(`Failed to save tournament ${index + 1}: ${res.status} ${res.statusText}`);
          }
          return res.json();
        }).catch(error => {
          console.error(`🔍 SAVE DEBUG - Error saving tournament ${index + 1}:`, error);
          throw error;
        });
      });
      
      return Promise.all(promises);
    },
    onSuccess: (results) => {
      console.log("🔍 SAVE DEBUG - All tournaments saved successfully:", results);
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      setPendingTournaments([]);
      setHasUnsavedChanges(false);
      setIsDialogOpen(false);
      toast({
        title: "Torneios Salvos",
        description: "Todos os torneios foram salvos com sucesso",
      });
    },
    onError: (error: Error) => {
      console.error("🔍 SAVE DEBUG - Error in save process:", error);
      toast({
        title: "Erro ao Salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update tournament mutation
  const updateTournamentMutation = useMutation({
    mutationFn: async (data: { id: string; [key: string]: any }) => {
      console.log("Calling API with data:", data);
      const { id, ...updateData } = data;
      const response = await apiRequest(`/api/planned-tournaments/${id}`, {
        method: "PUT",
        body: JSON.stringify(updateData),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      toast({
        title: "Torneio Atualizado",
        description: "Torneio atualizado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao Atualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete tournament mutation
  const deleteTournamentMutation = useMutation({
    mutationFn: async (id: string) => {
      console.log("Deleting tournament with ID:", id);
      const response = await apiRequest(`/api/planned-tournaments/${id}`, {
        method: "DELETE",
      });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all related queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/active-days"] });
      
      toast({
        title: "Torneio Excluído",
        description: "Torneio excluído com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao Excluir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddTournament = (dayOfWeek: number) => {
    setSelectedDay(dayOfWeek);
    form.setValue("dayOfWeek", dayOfWeek);
    setIsDialogOpen(true);
  };

  const handleTemplateSelect = (template: any) => {
    setSelectedTemplate(template);
    form.setValue("site", template.site || "");
    form.setValue("type", template.category || template.type || "");
    form.setValue("speed", template.speed || "");
    form.setValue("name", template.groupName || template.name || "");
    form.setValue("buyIn", template.avgBuyin?.toString() || template.buyIn?.toString() || "");
    form.setValue("guaranteed", template.guaranteed?.toString() || "");
  };



  // Generate tournament name based on the new format
  const generateTournamentName = (data: TournamentForm) => {
    if (data.name && data.name.trim()) {
      return data.name;
    }
    
    // Format: $109 $25.000 WPN (BuyIn Guaranteed Site)
    const buyIn = `$${parseFloat(data.buyIn).toFixed(0)}`;
    const guaranteed = data.guaranteed ? ` $${parseFloat(data.guaranteed).toLocaleString('pt-BR')}` : '';
    const site = data.site;
    
    return `${buyIn}${guaranteed} ${site}`;
  };

  // Toggle active day mutation
  const toggleActiveDayMutation = useMutation({
    mutationFn: async (dayOfWeek: number) => {
      const response = await apiRequest("/api/active-days/toggle", {
        method: "POST",
        body: JSON.stringify({ dayOfWeek })
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/active-days"] });
      toast({
        title: "Dia Atualizado",
        description: "Status do dia foi alterado com sucesso",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: "Falha ao atualizar o status do dia",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TournamentForm) => {
    // Sanitize and validate data before adding to pending list
    const sanitizedData = {
      dayOfWeek: selectedDay || 0,
      site: String(data.site || ""),
      time: String(data.time || ""),
      type: String(data.type || ""),
      speed: String(data.speed || ""),
      name: String(data.name || ""),
      buyIn: String(data.buyIn || "0"),
      guaranteed: String(data.guaranteed || "0"),
      prioridade: Number(data.prioridade) || 2, // Convert string to number, default to 2 (Média)
    };
    
    // Add to pending tournaments list (local state)
    setPendingTournaments(prev => [...prev, sanitizedData]);
    setHasUnsavedChanges(true);
    
    // Store only site to persist
    const persistedSite = sanitizedData.site;
    
    // Reset form completely first
    form.reset();
    
    // Then restore only the site and priority
    form.setValue("site", persistedSite);
    form.setValue("prioridade", 2); // Reset to Média (default)
    if (selectedDay !== null) {
      form.setValue("dayOfWeek", selectedDay);
    }
    
    // All other fields remain cleared: time, type, speed, buyIn, guaranteed, name
    
    toast({
      title: "Torneio Adicionado à Lista",
      description: "Clique em 'Salvar Alterações' para confirmar",
    });
  };

  // Function to save all pending tournaments
  const handleSaveAll = () => {
    console.log("🔍 SAVE DEBUG - handleSaveAll called");
    console.log("🔍 SAVE DEBUG - Pending tournaments length:", pendingTournaments.length);
    console.log("🔍 SAVE DEBUG - Pending tournaments:", pendingTournaments);
    
    if (pendingTournaments.length > 0) {
      console.log("🔍 SAVE DEBUG - Calling saveAllTournamentsMutation.mutate");
      saveAllTournamentsMutation.mutate(pendingTournaments);
    } else {
      console.log("🔍 SAVE DEBUG - No pending tournaments to save");
    }
  };

  // Function to generate suggestions based on existing tournaments with dynamic filtering
  const getSuggestedTournaments = () => {
    if (!plannedTournaments || !user) return [];
    
    // Get current form values for filtering
    const currentSite = form.watch("site");
    const currentType = form.watch("type");
    const currentSpeed = form.watch("speed");
    const currentBuyIn = form.watch("buyIn");
    
    // Get all tournaments from other days
    const otherDayTournaments = plannedTournaments.filter(t => 
      t.userId === user.id && t.dayOfWeek !== selectedDay
    );
    
    // Apply dynamic filters based on form values
    let filteredTournaments = otherDayTournaments;
    
    // Filter by site if selected
    if (currentSite && currentSite.trim() !== "") {
      filteredTournaments = filteredTournaments.filter(t => t.site === currentSite);
    }
    
    // Filter by type if selected
    if (currentType && currentType.trim() !== "") {
      filteredTournaments = filteredTournaments.filter(t => t.type === currentType);
    }
    
    // Filter by speed if selected
    if (currentSpeed && currentSpeed.trim() !== "") {
      filteredTournaments = filteredTournaments.filter(t => t.speed === currentSpeed);
    }
    
    // Filter by similar buy-in range if specified (+/- 20%)
    if (currentBuyIn && currentBuyIn.trim() !== "" && !isNaN(parseFloat(currentBuyIn))) {
      const buyInValue = parseFloat(currentBuyIn);
      const tolerance = buyInValue * 0.2; // 20% tolerance
      filteredTournaments = filteredTournaments.filter(t => {
        const tournamentBuyIn = parseFloat(t.buyIn || 0);
        return Math.abs(tournamentBuyIn - buyInValue) <= tolerance;
      });
    }
    
    // Group by tournament characteristics and count frequency
    const frequencyMap = new Map();
    filteredTournaments.forEach(t => {
      const key = `${t.site}-${t.type}-${t.speed}-${t.buyIn}`;
      if (frequencyMap.has(key)) {
        frequencyMap.set(key, frequencyMap.get(key) + 1);
      } else {
        frequencyMap.set(key, 1);
      }
    });
    
    // Convert to suggestions array and sort by frequency
    const suggestions = Array.from(frequencyMap.entries())
      .map(([key, frequency]) => {
        const tournament = filteredTournaments.find(t => 
          `${t.site}-${t.type}-${t.speed}-${t.buyIn}` === key
        );
        return {
          ...tournament,
          frequency
        };
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 8); // Increase to 8 suggestions for better variety
    
    return suggestions;
  };

  // Get suggestions with dynamic filtering
  const suggestions = getSuggestedTournaments();

  // Handle edit tournament submission
  const handleEditSubmit = (data: TournamentForm) => {
    console.log('Edit submit data:', data);
    updateTournamentMutation.mutate({
      id: editingTournament?.id,
      data: {
        site: data.site,
        time: data.time,
        type: data.type,
        speed: data.speed,
        name: data.name,
        buyIn: parseFloat(data.buyIn) || 0,
        guaranteed: data.guaranteed ? parseFloat(data.guaranteed) : null,
        prioridade: data.prioridade || 2,
      },
    });
  };

  // Handle edit tournament
  const handleEditTournament = (tournament: any) => {
    setEditingTournament(tournament);
    editForm.reset({
      site: tournament.site,
      time: tournament.time,
      type: tournament.type,
      speed: tournament.speed,
      name: tournament.name,
      buyIn: tournament.buyIn?.toString() || "",
      guaranteed: tournament.guaranteed?.toString() || "",
      prioridade: tournament.prioridade || 2,
    });
    setIsEditDialogOpen(true);
  };

  // Handle delete tournament
  const handleDeleteTournament = (tournament: any) => {
    setTournamentToDelete(tournament);
    setIsDeleteDialogOpen(true);
  };

  // Handle select suggestion
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

  // Function to clear all form fields
  const handleClearAllForm = () => {
    form.reset({
      site: "",
      time: "",
      type: "",
      speed: "",
      name: "",
      buyIn: "",
      guaranteed: "",
      prioridade: 2, // Média por padrão
      dayOfWeek: selectedDay || 0,
    });
    
    toast({
      title: "Formulário Limpo",
      description: "Todos os campos foram resetados",
    });
  };

  const getTournamentsForDay = (dayId: number) => {
    const savedTournaments = plannedTournaments?.filter((t: any) => t.dayOfWeek === dayId) || [];
    const pendingForDay = pendingTournaments.filter((t: any) => t.dayOfWeek === dayId);
    
    // Combine saved and pending tournaments, add temp IDs to pending ones
    const pendingWithIds = pendingForDay.map((t, index) => ({
      ...t,
      id: `temp-${dayId}-${index}`,
      dayOfWeek: dayId, // Ensure dayOfWeek is set for proper identification
      name: generateTournamentName(t),
      isPending: true
    }));
    
    return [...savedTournaments, ...pendingWithIds];
  };

  // Check if a day is active (default to true if not found)
  const isDayActive = (dayOfWeek: number): boolean => {
    if (!activeDays) return true; // Default to active if no data
    const dayConfig = activeDays.find((d: any) => d.dayOfWeek === dayOfWeek);
    return dayConfig ? dayConfig.isActive : true; // Default to active if not found
  };

  // Calculate tournament field size estimate
  const calculateEstimatedFieldSize = (guaranteed: string, buyIn: string) => {
    if (!guaranteed || !buyIn) return 0;
    const guaranteedNum = parseFloat(guaranteed);
    const buyInNum = parseFloat(buyIn);
    const rakeAdjustedBuyIn = buyInNum * 0.9; // Assuming 10% rake
    return Math.round(guaranteedNum / rakeAdjustedBuyIn);
  };

  // Calculate comprehensive day statistics including estimated grind session times
  const getDayStats = (dayId: number) => {
    const tournaments = getTournamentsForDay(dayId);
    const totalTournaments = tournaments.length;
    
    if (totalTournaments === 0) {
      return {
        count: 0,
        avgBuyIn: 0,
        totalBuyIn: 0,
        vanillaPercentage: 0,
        pkoPercentage: 0,
        mysteryPercentage: 0,
        normalPercentage: 0,
        turboPercentage: 0,
        hyperPercentage: 0,
        avgFieldSize: 0,
        startTime: null,
        endTime: null,
        durationHours: 0
      };
    }
    
    const totalBuyIn = tournaments.reduce((sum, t) => sum + parseFloat(t.buyIn || 0), 0);
    const avgBuyIn = totalBuyIn / totalTournaments;
    
    // Calculate type percentages
    const vanillaCount = tournaments.filter(t => t.type === 'Vanilla').length;
    const pkoCount = tournaments.filter(t => t.type === 'PKO').length;
    const mysteryCount = tournaments.filter(t => t.type === 'Mystery').length;
    
    // Calculate speed percentages
    const normalCount = tournaments.filter(t => t.speed === 'Normal').length;
    const turboCount = tournaments.filter(t => t.speed === 'Turbo').length;
    const hyperCount = tournaments.filter(t => t.speed === 'Hyper').length;
    
    // Calculate average field size
    const fieldSizes = tournaments
      .filter(t => t.guaranteed && t.buyIn)
      .map(t => calculateEstimatedFieldSize(t.guaranteed, t.buyIn))
      .filter(size => size > 0);
    
    const avgFieldSize = fieldSizes.length > 0 
      ? fieldSizes.reduce((sum, size) => sum + size, 0) / fieldSizes.length 
      : 0;
    
    // Calculate estimated grind session times
    const tournamentsWithTime = tournaments.filter(t => t.time && t.time.trim() !== '');
    let startTime = null;
    let endTime = null;
    let durationHours = 0;
    
    if (tournamentsWithTime.length > 0) {
      // Find earliest and latest times
      const times = tournamentsWithTime.map(t => {
        const timeStr = t.time.trim();
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes; // Convert to minutes for easy comparison
      });
      
      const earliestMinutes = Math.min(...times);
      const latestMinutes = Math.max(...times);
      
      // Convert back to time format
      const earliestHours = Math.floor(earliestMinutes / 60);
      const earliestMins = earliestMinutes % 60;
      const latestHours = Math.floor(latestMinutes / 60);
      const latestMins = latestMinutes % 60;
      
      startTime = `${earliestHours.toString().padStart(2, '0')}:${earliestMins.toString().padStart(2, '0')}`;
      
      // Add 3 hours to the latest tournament time for estimated end time
      const endMinutes = latestMinutes + (3 * 60); // Add 3 hours
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      
      endTime = `${(endHours % 24).toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
      
      // Calculate duration in hours
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
      avgFieldSize: Math.round(avgFieldSize),
      startTime,
      endTime,
      durationHours: Math.round(durationHours * 10) / 10 // Round to 1 decimal place
    };
  };

  // Function to recalculate times after reordering (5 minutes earlier than next tournament)
  const recalculateTimesAfterReorder = (tournaments: any[], sourceIndex: number, destinationIndex: number) => {
    if (!tournaments.length) return tournaments;
    
    const reorderedWithNewTimes = [...tournaments];
    
    // If moving down (to later position)
    if (destinationIndex > sourceIndex) {
      const targetTournament = reorderedWithNewTimes[destinationIndex];
      if (targetTournament) {
        const targetTime = parseTime(targetTournament.time);
        const newTime = targetTime - 5; // 5 minutes earlier
        reorderedWithNewTimes[sourceIndex].time = formatTime(Math.max(0, newTime));
      }
    }
    // If moving up (to earlier position)
    else if (destinationIndex < sourceIndex) {
      const targetTournament = reorderedWithNewTimes[destinationIndex];
      if (targetTournament) {
        const targetTime = parseTime(targetTournament.time);
        const newTime = targetTime - 5; // 5 minutes earlier
        reorderedWithNewTimes[sourceIndex].time = formatTime(Math.max(0, newTime));
      }
    }
    
    return reorderedWithNewTimes;
  };

  // Helper function to parse time string to minutes
  const parseTime = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Helper function to format minutes back to time string
  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  // Function to get breaks that should appear between tournaments
  const getBreaksBetweenTournaments = (tournaments: any[]) => {
    if (!tournaments.length) return [];
    
    const sortedTournaments = tournaments.sort((a, b) => a.time.localeCompare(b.time));
    const breaks: any[] = [];
    
    for (let i = 0; i < sortedTournaments.length - 1; i++) {
      const currentTournament = sortedTournaments[i];
      const nextTournament = sortedTournaments[i + 1];
      
      const currentHour = parseInt(currentTournament.time.split(':')[0]);
      const nextHour = parseInt(nextTournament.time.split(':')[0]);
      
      // Add break if tournaments are in different hours
      if (nextHour > currentHour) {
        breaks.push({
          type: 'break',
          time: `${currentHour.toString().padStart(2, '0')}:55`,
          id: `break-${currentHour}`,
          afterTournamentId: currentTournament.id
        });
      }
    }
    
    return breaks;
  };

  // Function to create time breaks (XX:55) between tournaments in different hours
  const createTournamentListWithBreaks = (tournaments: any[]) => {
    if (!tournaments.length) return [];
    
    const sortedTournaments = tournaments.sort((a, b) => a.time.localeCompare(b.time));
    const result: any[] = [];
    
    for (let i = 0; i < sortedTournaments.length; i++) {
      const currentTournament = sortedTournaments[i];
      result.push({ ...currentTournament, type: 'tournament' });
      
      // Check if we need a break after this tournament
      const nextTournament = sortedTournaments[i + 1];
      if (nextTournament) {
        const currentHour = parseInt(currentTournament.time.split(':')[0]);
        const nextHour = parseInt(nextTournament.time.split(':')[0]);
        
        // Add break if tournaments are in different hours
        if (nextHour > currentHour) {
          result.push({
            type: 'break',
            time: `${currentHour.toString().padStart(2, '0')}:55`,
            id: `break-${currentHour}`
          });
        }
      }
    }
    
    return result;
  };

  // Handle drag and drop reordering
  const handleDragEnd = (result: any) => {
    setIsDragging(false);
    
    if (!result.destination || !selectedDay) return;
    
    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;
    
    if (sourceIndex === destinationIndex) return;
    
    // Get current tournaments for the selected day
    const currentTournaments = getTournamentsForDay(selectedDay);
    
    // Reorder tournaments
    const reorderedTournaments = Array.from(currentTournaments);
    const [removed] = reorderedTournaments.splice(sourceIndex, 1);
    reorderedTournaments.splice(destinationIndex, 0, removed);
    
    // Calculate new time for the dragged tournament (5 minutes earlier than target)
    const tournamentsWithNewTimes = [...reorderedTournaments];
    const draggedTournament = tournamentsWithNewTimes[destinationIndex];
    
    if (destinationIndex < reorderedTournaments.length - 1) {
      // If not the last tournament, set time 5 minutes earlier than next tournament
      const nextTournament = tournamentsWithNewTimes[destinationIndex + 1];
      if (nextTournament) {
        const nextTime = parseTime(nextTournament.time);
        const newTime = nextTime - 5; // 5 minutes earlier
        draggedTournament.time = formatTime(Math.max(0, newTime));
      }
    } else if (destinationIndex > 0) {
      // If last tournament, set time 5 minutes after previous tournament
      const previousTournament = tournamentsWithNewTimes[destinationIndex - 1];
      if (previousTournament) {
        const previousTime = parseTime(previousTournament.time);
        const newTime = previousTime + 5; // 5 minutes later
        draggedTournament.time = formatTime(newTime);
      }
    }
    
    // Update both saved and pending tournaments
    const updatedPendingTournaments = pendingTournaments.map(t => {
      if (t.dayOfWeek === selectedDay) {
        const updatedTournament = tournamentsWithNewTimes.find(ut => 
          ut.isPending && ut.id === `temp-${selectedDay}-${pendingTournaments.indexOf(t)}`
        );
        if (updatedTournament) {
          return { ...t, time: updatedTournament.time };
        }
      }
      return t;
    });
    
    setPendingTournaments(updatedPendingTournaments);
    setHasUnsavedChanges(true);
    
    // Update saved tournaments that were reordered
    const draggedTournamentSaved = tournamentsWithNewTimes.find(t => 
      !t.isPending && t.id === draggedTournament.id
    );
    
    if (draggedTournamentSaved) {
      updateTournamentMutation.mutate({
        id: draggedTournamentSaved.id,
        time: draggedTournamentSaved.time
      });
    }
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };



  // Handle save edited tournament
  const handleSaveEditedTournament = (data: any) => {
    console.log("Saving edited tournament:", data);
    console.log("Editing tournament:", editingTournament);
    
    if (editingTournament.isPending) {
      // Update pending tournament in local state
      const updatedPendingTournaments = pendingTournaments.map(t => 
        t.id === editingTournament.id ? { ...t, ...data } : t
      );
      setPendingTournaments(updatedPendingTournaments);
      setHasUnsavedChanges(true);
      
      toast({
        title: "Torneio Atualizado",
        description: "Torneio pendente atualizado com sucesso",
      });
    } else {
      // Update saved tournament via API - prepare data properly
      const updateData = {
        id: data.id,
        dayOfWeek: typeof data.dayOfWeek === 'number' ? data.dayOfWeek : parseInt(data.dayOfWeek) || 0,
        site: String(data.site || ""),
        time: String(data.time || ""),
        type: String(data.type || ""),
        speed: String(data.speed || ""),
        name: String(data.name || ""),
        buyIn: String(data.buyIn || "0"),
        guaranteed: String(data.guaranteed || "0"),
      };
      
      console.log("Updating tournament with data:", updateData);
      updateTournamentMutation.mutate(updateData);
    }
    
    setIsEditDialogOpen(false);
    setEditingTournament(null);
  };

  // Confirm delete tournament
  const confirmDeleteTournament = () => {
    console.log("Deleting tournament:", tournamentToDelete);
    
    if (tournamentToDelete.isPending) {
      // Remove pending tournament from local state by matching the tournament data
      const updatedPendingTournaments = pendingTournaments.filter((t, index) => {
        const tempId = `temp-${tournamentToDelete.dayOfWeek}-${index}`;
        return tempId !== tournamentToDelete.id;
      });
      setPendingTournaments(updatedPendingTournaments);
      setHasUnsavedChanges(updatedPendingTournaments.length > 0);
      
      toast({
        title: "Torneio Excluído",
        description: "Torneio pendente excluído com sucesso",
      });
    } else {
      // Delete saved tournament via API
      console.log("Deleting saved tournament with ID:", tournamentToDelete.id);
      deleteTournamentMutation.mutate(tournamentToDelete.id);
    }
    
    setIsDeleteDialogOpen(false);
    setTournamentToDelete(null);
  };

  const getInsightColor = (roi: string | number) => {
    const roiNum = Number(roi || 0);
    if (roiNum > 15) return "border-green-500 bg-green-500/10";
    if (roiNum > 0) return "border-yellow-500 bg-yellow-500/10";
    return "border-red-500 bg-red-500/10";
  };

  const getInsightIcon = (roi: string | number) => {
    const roiNum = Number(roi || 0);
    if (roiNum > 15) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (roiNum > 0) return <TrendingUp className="h-4 w-4 text-yellow-500" />;
    return <Target className="h-4 w-4 text-red-500" />;
  };

  // ICD (Índice de Confiança de Desempenho) calculation
  const calculateICD = (avgProfit: number, volume: number, alpha: number = 0.1) => {
    return avgProfit * (1 - Math.exp(-alpha * volume));
  };

  // Filter data with minimum 50 tournaments for tournament library (Top 3 Torneios)
  const getFilteredData = (data: any[], minVolume: number = 100) => {
    return data.filter((item: any) => {
      const volume = parseInt(item.volume || item.count || 0);
      return volume >= minVolume;
    });
  };

  // Specific filter for tournament library with lower minimum
  const getFilteredTournamentData = (data: any[], minVolume: number = 50) => {
    return data.filter((item: any) => {
      const volume = parseInt(item.volume || item.count || 0);
      return volume >= minVolume;
    });
  };

  // Calculate ICD and sort by it
  const calculateAndSortByICD = (data: any[]) => {
    return data.map((item: any) => {
      const avgProfit = Number(item.avgProfit || (item.profit || 0) / (item.volume || item.count || 1));
      const volume = parseInt(item.volume || item.count || 0);
      const icd = calculateICD(avgProfit, volume);
      return { ...item, avgProfit, icd };
    }).sort((a: any, b: any) => b.icd - a.icd);
  };

  // Get filtered analytics with minimum sample size and sorted by ICD
  const filteredSiteAnalytics = calculateAndSortByICD(getFilteredData(Array.isArray(siteAnalytics) ? siteAnalytics : []));
  const filteredCategoryAnalytics = calculateAndSortByICD(getFilteredData(Array.isArray(categoryAnalytics) ? categoryAnalytics : []));
  const filteredBuyinAnalytics = calculateAndSortByICD(getFilteredData(Array.isArray(buyinAnalytics) ? buyinAnalytics : []));
  const filteredTournamentLibrary = calculateAndSortByICD(getFilteredTournamentData(Array.isArray(tournamentLibrary) ? tournamentLibrary : []));

  return (
    <div className="container mx-auto p-6 max-w-[1600px]">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2 text-white">Grade </h2>
        <p className="text-gray-400">Planeje sua grade semanal</p>
      </div>
      {/* Performance Insights Section */}
      <div className="mb-8">
        
        {/* Single Row with 3 Cards - Compact Design */}
        <div className="insights-grid-reduced">
          {/* Site Performance */}
          <Card className="insight-card fade-in bg-poker-surface border-gray-700 h-[120px] relative hover:transform hover:translate-y-[-2px] hover:border-poker-green hover:shadow-[0_8px_25px_rgba(0,255,136,0.1)] transition-all duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-poker-green" />
                  <span>🥇 Top Sites</span>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="absolute top-3 right-3 bg-poker-green/10 rounded-full px-2 py-1 text-xs text-poker-green hover:bg-poker-green/20 transition-all duration-300">
                      Ver +
                    </button>
                  </DialogTrigger>
                  <DialogContent className="bg-poker-surface border-gray-700 max-w-2xl max-h-[80vh]">
                    <DialogHeader>
                      <DialogTitle className="text-white">Todos os Sites (Ordenado por ICD)</DialogTitle>
                      <DialogDescription className="text-gray-400">
                        Ranking completo de sites baseado no Índice de Confiança de Desempenho
                      </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-[60vh] pr-4">
                      <div className="space-y-3">
                        {filteredSiteAnalytics.map((site: any, index: number) => (
                          <div key={index} className="p-4 rounded-lg border border-gray-700 bg-gray-800/50">
                            <div className="flex justify-between items-start mb-3">
                              <h3 className="font-semibold text-white">{site.site}</h3>
                              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                #{index + 1}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <div className="text-gray-400">ICD</div>
                                <div className="text-yellow-400 font-bold text-lg">{site.icd?.toFixed(2) || '0.00'}</div>
                              </div>
                              <div>
                                <div className="text-gray-400">Volume</div>
                                <div className="text-white font-semibold">{site.volume} jogos</div>
                              </div>
                              <div>
                                <div className="text-gray-400">Profit Total</div>
                                <div className={`font-semibold ${Number(site.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  ${Number(site.profit || 0).toFixed(0)}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-400">ROI</div>
                                <div className={`font-semibold ${Number(site.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {Number(site.roi || 0).toFixed(1)}%
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {filteredSiteAnalytics.length > 0 ? (
                <div>
                  <div className="insight-main text-lg font-semibold text-white mb-2">
                    {filteredSiteAnalytics[0].site}
                  </div>
                  <div className="text-base text-poker-green font-medium">
                    ROI: {Number(filteredSiteAnalytics[0].roi || 0).toFixed(1)}%
                  </div>
                </div>
              ) : (
                <div className="text-center py-2 text-gray-500">
                  <BarChart3 className="h-6 w-6 mx-auto mb-1 opacity-50" />
                  <p className="text-xs">Necessário 100+ jogos</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tournament Type Performance */}
          <Card className="bg-poker-surface border-gray-700 h-[120px] relative hover:transform hover:translate-y-[-2px] hover:border-poker-green hover:shadow-[0_8px_25px_rgba(0,255,136,0.1)] transition-all duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-poker-green" />
                  <span>🎯 Top Tipos</span>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="absolute top-3 right-3 bg-poker-green/10 rounded-full px-2 py-1 text-xs text-poker-green hover:bg-poker-green/20 transition-all duration-300">
                      Ver +
                    </button>
                  </DialogTrigger>
                  <DialogContent className="bg-poker-surface border-gray-700 max-w-2xl max-h-[80vh]">
                    <DialogHeader>
                      <DialogTitle className="text-white">Todos os Tipos (Ordenado por ICD)</DialogTitle>
                      <DialogDescription className="text-gray-400">
                        Ranking completo de tipos de torneio baseado no Índice de Confiança de Desempenho
                      </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-[60vh] pr-4">
                      <div className="space-y-3">
                        {filteredCategoryAnalytics.map((category: any, index: number) => (
                          <div key={index} className="p-4 rounded-lg border border-gray-700 bg-gray-800/50">
                            <div className="flex justify-between items-start mb-3">
                              <h3 className="font-semibold text-white">{category.category}</h3>
                              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                #{index + 1}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <div className="text-gray-400">ICD</div>
                                <div className="text-yellow-400 font-bold text-lg">{category.icd?.toFixed(2) || '0.00'}</div>
                              </div>
                              <div>
                                <div className="text-gray-400">Volume</div>
                                <div className="text-white font-semibold">{category.volume} jogos</div>
                              </div>
                              <div>
                                <div className="text-gray-400">Profit Total</div>
                                <div className={`font-semibold ${Number(category.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  ${Number(category.profit || 0).toFixed(0)}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-400">ROI</div>
                                <div className={`font-semibold ${Number(category.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {Number(category.roi || 0).toFixed(1)}%
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {filteredCategoryAnalytics.length > 0 ? (
                <div>
                  <div className="text-lg font-semibold text-white mb-2">
                    {filteredCategoryAnalytics[0].category}
                  </div>
                  <div className="text-base text-poker-green font-medium">
                    ROI: {Number(filteredCategoryAnalytics[0].roi || 0).toFixed(1)}%
                  </div>
                </div>
              ) : (
                <div className="text-center py-2 text-gray-500">
                  <Users className="h-6 w-6 mx-auto mb-1 opacity-50" />
                  <p className="text-xs">Necessário 100+ jogos</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Buy-in Range Performance */}
          <Card className="bg-poker-surface border-gray-700 h-[120px] relative hover:transform hover:translate-y-[-2px] hover:border-poker-green hover:shadow-[0_8px_25px_rgba(0,255,136,0.1)] transition-all duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-poker-green" />
                  <span>💰 Top Faixas</span>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="absolute top-3 right-3 bg-poker-green/10 rounded-full px-2 py-1 text-xs text-poker-green hover:bg-poker-green/20 transition-all duration-300">
                      Ver +
                    </button>
                  </DialogTrigger>
                  <DialogContent className="bg-poker-surface border-gray-700 max-w-2xl max-h-[80vh]">
                    <DialogHeader>
                      <DialogTitle className="text-white">Todas as Faixas (Ordenado por ICD)</DialogTitle>
                      <DialogDescription className="text-gray-400">
                        Ranking completo de faixas de buy-in baseado no Índice de Confiança de Desempenho
                      </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-[60vh] pr-4">
                      <div className="space-y-3">
                        {filteredBuyinAnalytics.map((range: any, index: number) => (
                          <div key={index} className="p-4 rounded-lg border border-gray-700 bg-gray-800/50">
                            <div className="flex justify-between items-start mb-3">
                              <h3 className="font-semibold text-white">{range.buyinRange}</h3>
                              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                #{index + 1}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <div className="text-gray-400">ICD</div>
                                <div className="text-yellow-400 font-bold text-lg">{range.icd?.toFixed(2) || '0.00'}</div>
                              </div>
                              <div>
                                <div className="text-gray-400">Volume</div>
                                <div className="text-white font-semibold">{range.volume} jogos</div>
                              </div>
                              <div>
                                <div className="text-gray-400">Profit Total</div>
                                <div className={`font-semibold ${Number(range.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  ${Number(range.profit || 0).toFixed(0)}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-400">ROI</div>
                                <div className={`font-semibold ${Number(range.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {Number(range.roi || 0).toFixed(1)}%
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {filteredBuyinAnalytics.length > 0 ? (
                <div>
                  <div className="text-lg font-semibold text-white mb-2">
                    {filteredBuyinAnalytics[0].buyinRange}
                  </div>
                  <div className="text-base text-poker-green font-medium">
                    ROI: {Number(filteredBuyinAnalytics[0].roi || 0).toFixed(1)}%
                  </div>
                </div>
              ) : (
                <div className="text-center py-2 text-gray-500">
                  <DollarSign className="h-6 w-6 mx-auto mb-1 opacity-50" />
                  <p className="text-xs">Necessário 100+ jogos</p>
                </div>
              )}
            </CardContent>
          </Card>




        </div>
        

      </div>
      {/* Weekly Planning Section */}
      <div className="mb-8">

        {/* Weekly Dashboard - Dashboard Semanal Compacto */}
        <div className={`dashboard-compact ${isDashboardExpanded ? 'expanded' : ''}`}>
          <div className="dashboard-header">
            <div className="dashboard-title">📈 Resumo da Semana</div>
            <button 
              className="expand-btn" 
              onClick={() => setIsDashboardExpanded(!isDashboardExpanded)}
            >
              {isDashboardExpanded ? 'Recolher' : 'Expandir'}
            </button>
          </div>
          
          <div className="dashboard-summary">
            <div className="summary-item">
              <div className="summary-value">
                {(() => {
                  const activeDayTournaments = weekDays
                    .filter(day => isDayActive(day.id))
                    .flatMap(day => getTournamentsForDay(day.id));
                  return activeDayTournaments.length;
                })()}
              </div>
              <div className="summary-label">Torneios</div>
            </div>
            <div className="summary-item">
              <div className="summary-value">
                ${(() => {
                  const activeDayTournaments = weekDays
                    .filter(day => isDayActive(day.id))
                    .flatMap(day => getTournamentsForDay(day.id));
                  return activeDayTournaments.reduce((sum: number, t: any) => sum + (parseFloat(t.buyIn) || 0), 0).toFixed(0);
                })()}
              </div>
              <div className="summary-label">Investimento</div>
            </div>
            <div className="summary-item">
              <div className="summary-value">
                {(() => {
                  const totalHours = weekDays
                    .filter(day => isDayActive(day.id))
                    .reduce((sum, day) => {
                      const stats = getDayStats(day.id);
                      return sum + (stats.durationHours || 0);
                    }, 0);
                  return totalHours > 0 ? `${totalHours.toFixed(1)}h` : '0h';
                })()}
              </div>
              <div className="summary-label">Grind</div>
            </div>
            <div className="summary-item">
              <div className="summary-value">
                {(() => {
                  const activeDayTournaments = weekDays
                    .filter(day => isDayActive(day.id))
                    .flatMap(day => getTournamentsForDay(day.id));
                  const vanillaCount = activeDayTournaments.filter((t: any) => t.type === 'Vanilla').length;
                  const percentage = activeDayTournaments.length > 0 ? (vanillaCount / activeDayTournaments.length * 100).toFixed(0) : '0';
                  return `${percentage}%`;
                })()}
              </div>
              <div className="summary-label">Vanilla</div>
            </div>
          </div>
          
          <div className={`dashboard-expanded ${isDashboardExpanded ? 'visible' : ''}`}>
            <div className="expanded-grid">
              <div className="expanded-section">
                <h4>🎯 Tipos de Torneio</h4>
                <div className="expanded-item">
                  <span>Vanilla</span>
                  <span>
                    {(() => {
                      const activeDayTournaments = weekDays
                        .filter(day => isDayActive(day.id))
                        .flatMap(day => getTournamentsForDay(day.id));
                      const vanillaCount = activeDayTournaments.filter((t: any) => t.type === 'Vanilla').length;
                      const percentage = activeDayTournaments.length > 0 ? (vanillaCount / activeDayTournaments.length * 100).toFixed(0) : '0';
                      return `${vanillaCount} (${percentage}%)`;
                    })()}
                  </span>
                </div>
                <div className="expanded-item">
                  <span>PKO</span>
                  <span>
                    {(() => {
                      const activeDayTournaments = weekDays
                        .filter(day => isDayActive(day.id))
                        .flatMap(day => getTournamentsForDay(day.id));
                      const pkoCount = activeDayTournaments.filter((t: any) => t.type === 'PKO').length;
                      const percentage = activeDayTournaments.length > 0 ? (pkoCount / activeDayTournaments.length * 100).toFixed(0) : '0';
                      return `${pkoCount} (${percentage}%)`;
                    })()}
                  </span>
                </div>
                <div className="expanded-item">
                  <span>Mystery</span>
                  <span>
                    {(() => {
                      const activeDayTournaments = weekDays
                        .filter(day => isDayActive(day.id))
                        .flatMap(day => getTournamentsForDay(day.id));
                      const mysteryCount = activeDayTournaments.filter((t: any) => t.type === 'Mystery').length;
                      const percentage = activeDayTournaments.length > 0 ? (mysteryCount / activeDayTournaments.length * 100).toFixed(0) : '0';
                      return `${mysteryCount} (${percentage}%)`;
                    })()}
                  </span>
                </div>
              </div>
              
              <div className="expanded-section">
                <h4>⚡ Velocidade</h4>
                <div className="expanded-item">
                  <span>Normal</span>
                  <span>
                    {(() => {
                      const activeDayTournaments = weekDays
                        .filter(day => isDayActive(day.id))
                        .flatMap(day => getTournamentsForDay(day.id));
                      const normalCount = activeDayTournaments.filter((t: any) => t.speed === 'Normal').length;
                      const percentage = activeDayTournaments.length > 0 ? (normalCount / activeDayTournaments.length * 100).toFixed(0) : '0';
                      return `${normalCount} (${percentage}%)`;
                    })()}
                  </span>
                </div>
                <div className="expanded-item">
                  <span>Turbo</span>
                  <span>
                    {(() => {
                      const activeDayTournaments = weekDays
                        .filter(day => isDayActive(day.id))
                        .flatMap(day => getTournamentsForDay(day.id));
                      const turboCount = activeDayTournaments.filter((t: any) => t.speed === 'Turbo').length;
                      const percentage = activeDayTournaments.length > 0 ? (turboCount / activeDayTournaments.length * 100).toFixed(0) : '0';
                      return `${turboCount} (${percentage}%)`;
                    })()}
                  </span>
                </div>
                <div className="expanded-item">
                  <span>Hyper</span>
                  <span>
                    {(() => {
                      const activeDayTournaments = weekDays
                        .filter(day => isDayActive(day.id))
                        .flatMap(day => getTournamentsForDay(day.id));
                      const hyperCount = activeDayTournaments.filter((t: any) => t.speed === 'Hyper').length;
                      const percentage = activeDayTournaments.length > 0 ? (hyperCount / activeDayTournaments.length * 100).toFixed(0) : '0';
                      return `${hyperCount} (${percentage}%)`;
                    })()}
                  </span>
                </div>
              </div>
              
              <div className="expanded-section">
                <h4>🌐 Volume por Site</h4>
                {(() => {
                  const activeDayTournaments = weekDays
                    .filter(day => isDayActive(day.id))
                    .flatMap(day => getTournamentsForDay(day.id));
                  const siteCount = activeDayTournaments.reduce((acc: any, t: any) => {
                    const site = t.site || 'Não definido';
                    acc[site] = (acc[site] || 0) + 1;
                    return acc;
                  }, {});
                  
                  const sortedSites = Object.entries(siteCount)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .slice(0, 3); // Show top 3 sites
                  
                  const totalTournaments = activeDayTournaments.length;
                  
                  if (sortedSites.length === 0) {
                    return (
                      <div className="expanded-item">
                        <span>Nenhum torneio nos dias ativos</span>
                        <span>-</span>
                      </div>
                    );
                  }
                  
                  return sortedSites.map(([site, count]) => (
                    <div key={site} className="expanded-item">
                      <span>{site}</span>
                      <span>{count} ({totalTournaments > 0 ? ((count as number) / totalTournaments * 100).toFixed(0) : 0}%)</span>
                    </div>
                  ));
                })()}
              </div>
              
              <div className="expanded-section">
                <h4>📊 Detalhes Adicionais</h4>
                <div className="expanded-item">
                  <span>ABI Semanal</span>
                  <span>
                    ${(() => {
                      const activeDayTournaments = weekDays
                        .filter(day => isDayActive(day.id))
                        .flatMap(day => getTournamentsForDay(day.id));
                      const totalBuyIn = activeDayTournaments.reduce((sum: number, t: any) => sum + (parseFloat(t.buyIn) || 0), 0);
                      const count = activeDayTournaments.length;
                      return count > 0 ? (totalBuyIn / count).toFixed(2) : '0.00';
                    })()}
                  </span>
                </div>
                <div className="expanded-item">
                  <span>Média de Participantes</span>
                  <span>
                    {(() => {
                      const activeDayTournaments = weekDays
                        .filter(day => isDayActive(day.id))
                        .flatMap(day => getTournamentsForDay(day.id));
                      const tournamentsWithGuaranteed = activeDayTournaments.filter((t: any) => t.guaranteed && parseFloat(t.guaranteed) > 0);
                      if (tournamentsWithGuaranteed.length === 0) return 'N/A';
                      const totalParticipants = tournamentsWithGuaranteed.reduce((sum: number, t: any) => {
                        const guaranteed = parseFloat(t.guaranteed) || 0;
                        const buyIn = parseFloat(t.buyIn) || 0;
                        return sum + (buyIn > 0 ? Math.round(guaranteed / buyIn) : 0);
                      }, 0);
                      return Math.round(totalParticipants / tournamentsWithGuaranteed.length);
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="days-grid">
          {weekDays.map((day) => {
            const stats = getDayStats(day.id);
            const isActive = isDayActive(day.id);
            return (
              <div 
                key={day.id} 
                className={`day-card fade-in ${isActive ? 'active' : 'inactive'} cursor-pointer`}
                onClick={() => {
                  setSelectedDay(day.id);
                  form.setValue("dayOfWeek", day.id);
                  setIsDialogOpen(true);
                }}
              >
                {/* Header com nome do dia + status */}
                {/* Header com nome do dia e toggle de ativação */}
                <div className="day-header">
                  <div className="day-name">{day.name}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleActiveDayMutation.mutate(day.id);
                    }}
                    className="toggle-btn active pt-[1px] pb-[1px] mt-[-27px] mb-[-27px] ml-[14px] mr-[14px] pl-[6px] pr-[6px]"
                    disabled={toggleActiveDayMutation.isPending}
                    title={isActive ? 'Desativar dia' : 'Ativar dia'}
                  >
                    {isActive ? (
                      <Power className="h-4 w-4" />
                    ) : (
                      <PowerOff className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {/* Status indicator visual */}
                <div className={`day-status-indicator ${isActive ? 'active' : 'inactive'}`}></div>
                {stats.count > 0 ? (
                  <>
                    {/* Volume e investimento - seção principal */}
                    <div className="day-metrics-section">
                      <div className="metrics-header">
                        <span className="metrics-count">
                          {stats.count} {stats.count === 1 ? 'torneio' : 'torneios'}
                        </span>
                        <div className="day-investment">${stats.totalBuyIn.toFixed(2)}</div>
                      </div>
                      
                      <div className="metrics-details">
                        <span>ABI: ${stats.avgBuyIn.toFixed(2)}</span>
                        <span>•</span>
                        <span>{stats.avgFieldSize || 'N/A'} participantes</span>
                      </div>
                    </div>
                    
                    {/* Configuração dos torneios - tipos e velocidades */}
                    <div className="day-config-section">
                      <div className="config-badges">
                        {(() => {
                          const types = [
                            { name: 'Vanilla', percentage: stats.vanillaPercentage, class: 'vanilla' },
                            { name: 'PKO', percentage: stats.pkoPercentage, class: 'pko' },
                            { name: 'Mystery', percentage: stats.mysteryPercentage, class: 'mystery' }
                          ];
                          const predominantType = types.reduce((prev, current) => 
                            (prev.percentage > current.percentage) ? prev : current
                          );
                          
                          const speeds = [
                            { name: 'Normal', percentage: stats.normalPercentage },
                            { name: 'Turbo', percentage: stats.turboPercentage },
                            { name: 'Hyper', percentage: stats.hyperPercentage }
                          ];
                          const predominantSpeed = speeds.reduce((prev, current) => 
                            (prev.percentage > current.percentage) ? prev : current
                          );
                          
                          return (
                            <>
                              <div className={`type-badge ${predominantType.class}`}>
                                {predominantType.name}
                              </div>
                              <div className="type-badge speed-badge">
                                {predominantSpeed.name}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    
                    {/* Cronograma da sessão - seção de destaque final */}
                    <div className="day-schedule-section">
                      {stats.startTime && stats.endTime ? (
                        <>
                          <div className="schedule-time">
                            {stats.startTime} — {stats.endTime}
                          </div>
                          <div className="schedule-duration">
                            {stats.durationHours}h de grind
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="schedule-time no-schedule">
                            Horários não definidos
                          </div>
                          <div className="schedule-hint">
                            Configure os horários dos torneios
                          </div>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="empty-day-content">
                    
                    
                    
                    
                    {/* Botão de ação */}
                    <button 
                      className="empty-action-btn add-tournament pt-[-3px] pb-[-3px] mt-[98px] mb-[98px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isActive) {
                          toggleActiveDayMutation.mutate(day.id);
                        }
                      }}
                      disabled={toggleActiveDayMutation.isPending}
                    >
                      {isActive ? 'Adicionar Torneio' : 'Ativar Dia'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* Day Planning Dialog - New 3-Column Layout */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-[1400px] min-h-[80vh] p-6">
          {/* Header da Modal */}
          <DialogHeader className="h-16 px-4 border-b border-slate-700 flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="text-xl text-emerald-400">
                {selectedDay !== null ? weekDays.find(d => d.id === selectedDay)?.name : ''} - Planejamento de Torneios
              </DialogTitle>
            </div>
            <button 
              onClick={() => setIsDialogOpen(false)}
              className="w-8 h-8 rounded hover:bg-slate-700 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>

          {/* Dashboard do Dia */}
          <div className="p-4 mb-6 bg-slate-900 border border-slate-700 rounded-lg">
            <div className="grid grid-cols-4 gap-4">
              {(() => {
                const dayStats = selectedDay !== null ? getDayStats(selectedDay) : null;
                return dayStats ? (
                  <>
                    <div className="p-3 bg-slate-800 border border-slate-600 rounded-md text-center">
                      <div className="text-lg font-bold text-emerald-400 mb-1">{dayStats.count}</div>
                      <div className="text-xs text-slate-400 uppercase tracking-wide">Torneios</div>
                    </div>
                    <div className="p-3 bg-slate-800 border border-slate-600 rounded-md text-center">
                      <div className="text-lg font-bold text-emerald-400 mb-1">${dayStats.totalBuyIn.toFixed(0)}</div>
                      <div className="text-xs text-slate-400 uppercase tracking-wide">Buy-in Total</div>
                    </div>
                    <div className="p-3 bg-slate-800 border border-slate-600 rounded-md text-center">
                      <div className="text-lg font-bold text-emerald-400 mb-1">${dayStats.avgBuyIn.toFixed(0)}</div>
                      <div className="text-xs text-slate-400 uppercase tracking-wide">ABI</div>
                    </div>
                    <div className="p-3 bg-slate-800 border border-slate-600 rounded-md text-center">
                      <div className="text-lg font-bold text-emerald-400 mb-1">
                        {dayStats.startTime && dayStats.endTime ? `${dayStats.durationHours}h` : '–'}
                      </div>
                      <div className="text-xs text-slate-400 uppercase tracking-wide">Tempo Total</div>
                    </div>
                  </>
                ) : (
                  Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="p-3 bg-slate-800 border border-slate-600 rounded-md text-center">
                      <div className="text-lg font-bold text-emerald-400 mb-1">0</div>
                      <div className="text-xs text-slate-400 uppercase tracking-wide">–</div>
                    </div>
                  ))
                );
              })()}
            </div>
          </div>

          {/* Layout Principal - 3 Colunas */}
          <div className="grid grid-cols-[2fr_1.5fr_1.5fr] gap-5 h-[calc(80vh-200px)]">
            {/* COLUNA 1 - Lista de Torneios */}
            <div className="flex flex-col bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              {/* Header da Coluna */}
              <div className="p-4 bg-slate-800 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-white">Torneios Planejados</h4>
                  <div className="text-sm text-emerald-400 font-medium">
                    {selectedDay !== null ? getDayStats(selectedDay).count : 0} torneios
                  </div>
                </div>
              </div>
              
              {/* Lista de Torneios */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {selectedDay !== null && getTournamentsForDay(selectedDay).map((tournament, index) => (
                  <div
                    key={tournament.id}
                    className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-emerald-400 transition-all duration-200"
                  >
                    {/* Header do Card */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-600 text-white text-xs px-2 py-1">
                          {tournament.time || '00:00'}
                        </Badge>
                        <Badge className={`text-xs px-2 py-1 text-white ${getSiteColor(tournament.site)}`}>
                          {tournament.site}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 hover:bg-slate-600"
                          onClick={() => handleEditTournament(tournament)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 hover:bg-red-600"
                          onClick={() => handleDeleteTournament(tournament)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Nome do Torneio */}
                    <h5 className="font-medium text-white text-sm mb-2 leading-tight">
                      {tournament.name || generateTournamentName(tournament)}
                    </h5>

                    {/* Tags e Garantido */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs px-2 py-1 text-white ${getTypeColor(tournament.type)}`}>
                          {tournament.type}
                        </Badge>
                        <Badge className={`text-xs px-2 py-1 text-white ${getSpeedColor(tournament.speed)}`}>
                          {tournament.speed}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <div className="text-emerald-400 font-semibold">${parseFloat(tournament.buyIn || 0).toFixed(2)}</div>
                        {tournament.guaranteed && (
                          <div className="text-xs text-slate-400">${parseFloat(tournament.guaranteed).toFixed(0)} GTD</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {selectedDay !== null && getTournamentsForDay(selectedDay).length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Nenhum torneio planejado para este dia</p>
                    <p className="text-sm">Use o formulário para adicionar torneios</p>
                  </div>
                )}
              </div>
            </div>

            {/* COLUNA 2 - Sugestões */}
            <div className="flex flex-col bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              {/* Header da Coluna */}
              <div className="p-4 bg-slate-800 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-white">Sugestões da Grade Semanal</h4>
                  <div className="text-sm text-emerald-400 font-medium">
                    {suggestions.length} {suggestions.length === 1 ? 'sugestão' : 'sugestões'}
                  </div>
                </div>
                {(() => {
                  const hasFilters = form.watch("site") || form.watch("type") || form.watch("speed") || form.watch("buyIn");
                  if (hasFilters) {
                    return (
                      <p className="text-xs text-slate-400 mt-1">
                        Filtradas pelos campos preenchidos
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
              
              {/* Lista de Sugestões */}
              <div className="flex-1 p-4 overflow-y-auto max-h-[600px]">
                <div className="space-y-1">
                  {suggestions.map((suggestion, index) => {
                    // Calculate compatibility score
                    const currentSite = form.watch("site");
                    const currentType = form.watch("type");
                    const currentSpeed = form.watch("speed");
                    const currentBuyIn = form.watch("buyIn");
                    
                    let compatibilityMatches = 0;
                    let totalFields = 0;
                    
                    if (currentSite) { totalFields++; if (suggestion.site === currentSite) compatibilityMatches++; }
                    if (currentType) { totalFields++; if (suggestion.type === currentType) compatibilityMatches++; }
                    if (currentSpeed) { totalFields++; if (suggestion.speed === currentSpeed) compatibilityMatches++; }
                    if (currentBuyIn) { 
                      totalFields++; 
                      const buyInValue = parseFloat(currentBuyIn);
                      const suggestionBuyIn = parseFloat(suggestion.buyIn || 0);
                      const tolerance = buyInValue * 0.2;
                      if (Math.abs(suggestionBuyIn - buyInValue) <= tolerance) compatibilityMatches++;
                    }
                    
                    const isHighCompatibility = totalFields > 0 && compatibilityMatches === totalFields;
                    const compatibilityPercentage = totalFields > 0 ? Math.round((compatibilityMatches / totalFields) * 100) : 0;
                    
                    return (
                      <div
                        key={index}
                        className={`p-2 bg-[#1a1a1a]/50 rounded border transition-all duration-200 cursor-pointer group hover:shadow-md hover:shadow-[#00ff88]/20 hover:scale-[1.01] transform suggestion-card ${
                          compatibilityPercentage >= 75 ? 'high-match' :
                          compatibilityPercentage >= 50 ? 'medium-match' :
                          'border-[#333333]/40 hover:border-[#00ff88]/60 hover:bg-[#1a1a1a]/80'
                        }`}
                        onClick={() => handleSelectSuggestion(suggestion)}
                      >
                        {/* Layout Horizontal Compacto: [Site] [Tipo][Velocidade] $Buy-in • Gtd */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1">
                            {/* Site - Principal identificador */}
                            <span className="font-medium text-white text-sm min-w-[80px]">
                              {suggestion.site}
                            </span>
                            
                            {/* Badges de Tipo e Velocidade */}
                            <div className="flex items-center gap-1">
                              <span className={`px-2 py-0.5 rounded text-xs text-white ${getTypeColor(suggestion.type)}`}>
                                {suggestion.type}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-xs text-white ${getSpeedColor(suggestion.speed)}`}>
                                {suggestion.speed}
                              </span>
                            </div>
                          </div>
                          
                          {/* Buy-in e Guaranteed */}
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-[#00ff88]">
                              ${suggestion.buyIn}
                            </span>
                            {suggestion.guaranteed && (
                              <span className="text-gray-400">
                                • ${suggestion.guaranteed}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {suggestions.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <Plus className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    {(() => {
                      const hasAnyFormValues = form.watch("site") || form.watch("type") || form.watch("speed") || form.watch("buyIn");
                      const hasOtherDayTournaments = plannedTournaments?.filter(t => t.userId === user?.id && t.dayOfWeek !== selectedDay).length > 0;
                      
                      if (hasAnyFormValues && hasOtherDayTournaments) {
                        return (
                          <>
                            <p>Nenhuma sugestão compatível</p>
                            <p className="text-sm">Tente ajustar os filtros ou limpar campos</p>
                          </>
                        );
                      } else if (!hasOtherDayTournaments) {
                        return (
                          <>
                            <p>Nenhuma sugestão disponível</p>
                            <p className="text-sm">Adicione torneios em outros dias da semana</p>
                          </>
                        );
                      } else {
                        return (
                          <>
                            <p>Preencha os campos</p>
                            <p className="text-sm">Para ver sugestões inteligentes</p>
                          </>
                        );
                      }
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* COLUNA 3 - Formulário */}
            <div className="flex flex-col bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              {/* Header da Coluna */}
              <div className="p-4 bg-slate-800 border-b border-slate-700">
                <h4 className="text-lg font-semibold text-white">Novo Torneio</h4>
              </div>
              
              {/* Formulário */}
              <div className="flex-1 p-4 overflow-y-auto">
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  {/* Site */}
                  <div>
                    <label className="block mb-2 font-medium text-slate-200">Site</label>
                    <select
                      {...form.register("site")}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                    >
                      <option value="">Selecione um site</option>
                      {sites.map((site) => (
                        <option key={site} value={site}>{site}</option>
                      ))}
                    </select>
                  </div>

                  {/* Horário */}
                  <div>
                    <label className="block mb-2 font-medium text-slate-200">Horário de Registro</label>
                    <input
                      type="time"
                      {...form.register("time")}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                    />
                  </div>

                  {/* Tipo */}
                  <div>
                    <label className="block mb-2 font-medium text-slate-200">Tipo</label>
                    <select
                      {...form.register("type")}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                    >
                      <option value="">Selecione um tipo</option>
                      {types.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  {/* Velocidade */}
                  <div>
                    <label className="block mb-2 font-medium text-slate-200">Velocidade</label>
                    <select
                      {...form.register("speed")}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                    >
                      <option value="">Selecione a velocidade</option>
                      {speeds.map((speed) => (
                        <option key={speed} value={speed}>{speed}</option>
                      ))}
                    </select>
                  </div>

                  {/* Nome */}
                  <div>
                    <label className="block mb-2 font-medium text-slate-200">Nome (opcional)</label>
                    <input
                      type="text"
                      {...form.register("name")}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                      placeholder="Nome do torneio"
                    />
                  </div>

                  {/* Buy-in */}
                  <div>
                    <label className="block mb-2 font-medium text-slate-200">Buy-in</label>
                    <input
                      type="number"
                      step="0.01"
                      {...form.register("buyIn")}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                      placeholder="0.00"
                    />
                  </div>

                  {/* Garantido */}
                  <div>
                    <label className="block mb-2 font-medium text-slate-200">Garantido (opcional)</label>
                    <input
                      type="number"
                      step="0.01"
                      {...form.register("guaranteed")}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                      placeholder="0.00"
                    />
                  </div>

                  {/* Prioridade */}
                  <div>
                    <label className="block mb-2 font-medium text-slate-200">Prioridade</label>
                    <select
                      {...form.register("prioridade")}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-emerald-400"
                    >
                      <option value={2}>Média (padrão)</option>
                      <option value={1}>Alta</option>
                      <option value={3}>Baixa</option>
                    </select>
                  </div>

                  {/* Botões */}
                  <div className="sticky bottom-0 bg-slate-900 p-4 border-t border-slate-700 -mx-4 flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                      onClick={() => form.reset()}
                    >
                      Limpar Todos
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-slate-900 font-semibold"
                    >
                      Adicionar Torneio
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Resto do código permanece igual */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-400">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-300">
              Tem certeza que deseja excluir este torneio?
            </p>
            {tournamentToDelete && (
              <div className="mt-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                <p className="text-sm text-gray-300">
                  <strong>Nome:</strong> {tournamentToDelete.name || generateTournamentName(tournamentToDelete)}
                </p>
                <p className="text-sm text-gray-300">
                  <strong>Site:</strong> {tournamentToDelete.site}
                </p>
                <p className="text-sm text-gray-300">
                  <strong>Buy-in:</strong> ${parseFloat(tournamentToDelete.buyIn || 0).toFixed(2)}
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteTournament}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Edit Tournament Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-poker-green">Editar Torneio</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Site */}
            <div>
              <label className="block mb-2 font-medium text-gray-300">Site</label>
              <select
                {...editForm.register("site")}
                className="w-full p-3 bg-gray-800 border border-gray-700 rounded-md text-gray-300 focus:outline-none focus:border-poker-green"
              >
                <option value="">Selecione um site</option>
                {sites.map((site) => (
                  <option key={site} value={site}>{site}</option>
                ))}
              </select>
            </div>

            {/* Horário */}
            <div>
              <label className="block mb-2 font-medium text-gray-300">Horário</label>
              <input
                type="time"
                {...editForm.register("time")}
                className="w-full p-3 bg-gray-800 border border-gray-700 rounded-md text-gray-300 focus:outline-none focus:border-poker-green"
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="block mb-2 font-medium text-gray-300">Tipo</label>
              <select
                {...editForm.register("type")}
                className="w-full p-3 bg-gray-800 border border-gray-700 rounded-md text-gray-300 focus:outline-none focus:border-poker-green"
              >
                <option value="">Selecione um tipo</option>
                {types.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Velocidade */}
            <div>
              <label className="block mb-2 font-medium text-gray-300">Velocidade</label>
              <select
                {...editForm.register("speed")}
                className="w-full p-3 bg-gray-800 border border-gray-700 rounded-md text-gray-300 focus:outline-none focus:border-poker-green"
              >
                <option value="">Selecione a velocidade</option>
                {speeds.map((speed) => (
                  <option key={speed} value={speed}>{speed}</option>
                ))}
              </select>
            </div>

            {/* Nome */}
            <div>
              <label className="block mb-2 font-medium text-gray-300">Nome (opcional)</label>
              <input
                type="text"
                {...editForm.register("name")}
                className="w-full p-3 bg-gray-800 border border-gray-700 rounded-md text-gray-300 focus:outline-none focus:border-poker-green"
                placeholder="Nome do torneio"
              />
            </div>

            {/* Buy-in */}
            <div>
              <label className="block mb-2 font-medium text-gray-300">Buy-in</label>
              <input
                type="number"
                step="0.01"
                {...editForm.register("buyIn")}
                className="w-full p-3 bg-gray-800 border border-gray-700 rounded-md text-gray-300 focus:outline-none focus:border-poker-green"
                placeholder="0.00"
              />
            </div>

            {/* Garantido */}
            <div>
              <label className="block mb-2 font-medium text-gray-300">Garantido (opcional)</label>
              <input
                type="number"
                step="0.01"
                {...editForm.register("guaranteed")}
                className="w-full p-3 bg-gray-800 border border-gray-700 rounded-md text-gray-300 focus:outline-none focus:border-poker-green"
                placeholder="0.00"
              />
            </div>

            {/* Prioridade */}
            <div>
              <label className="block mb-2 font-medium text-gray-300">Prioridade</label>
              <select
                {...editForm.register("prioridade")}
                className="w-full p-3 bg-gray-800 border border-gray-700 rounded-md text-gray-300 focus:outline-none focus:border-poker-green"
              >
                <option value={2}>Média (padrão)</option>
                <option value={1}>Alta</option>
                <option value={3}>Baixa</option>
              </select>
            </div>

            {/* Botões */}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                className="bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                onClick={editForm.handleSubmit(handleEditSubmit)}
                className="bg-poker-green hover:bg-green-700 text-white"
              >
                Salvar Alterações
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
