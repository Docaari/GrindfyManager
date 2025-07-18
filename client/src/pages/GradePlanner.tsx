import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
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
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

// Custom tooltip component for Recharts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-700 border border-slate-600 rounded p-2 text-white text-sm">
        <p>{`${payload[0].name}: ${payload[0].value}`}</p>
      </div>
    );
  }
  return null;
};

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
  // Auto-save states - no need for pending tournaments anymore
  const [isDragging, setIsDragging] = useState(false);
  const [editingTournament, setEditingTournament] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
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

  // Fetch planned tournaments (isolados por usuário)
  const { data: plannedTournaments } = useQuery({
    queryKey: ["/api/planned-tournaments"],
    queryFn: async () => {
      console.log("🔍 BUSCANDO TORNEIOS PRÓPRIOS - userPlatformId:", localStorage.getItem('grindfy_user_id'));
      const response = await apiRequest("GET", "/api/planned-tournaments");
      console.log("🔍 TORNEIOS PRÓPRIOS - Response:", response);
      console.log("🔍 DADOS RETORNADOS - Lista de torneios:", response.length ? response : "LISTA VAZIA");
      return response;
    },
  });

  // Fetch tournament suggestions (pool global)
  const { data: tournamentSuggestions } = useQuery({
    queryKey: ["/api/tournament-suggestions"],
    queryFn: async () => {
      console.log("🔍 BUSCANDO SUGESTÕES GLOBAIS - Pool comum");
      const response = await apiRequest("GET", "/api/tournament-suggestions");
      console.log("🔍 SUGESTÕES GLOBAIS - Response:", response);
      return response;
    },
  });

  // Auto-save mutation for seamless experience
  const autoSaveTournamentMutation = useMutation({
    mutationFn: async (tournament: TournamentForm) => {
      console.log("🔍 ANTES DE SALVAR - userPlatformId:", localStorage.getItem('grindfy_user_id'));
      console.log("🔍 DADOS ENVIADOS - Payload completo:", tournament);
      
      const response = await apiRequest("POST", "/api/planned-tournaments", tournament);
      console.log("🔍 RESPOSTA API - Response completa:", response);
      
      return response;
    },
    onMutate: () => {
      setIsSaving(true);
      setSaveStatus('saving');
    },
    onSuccess: (result) => {
      console.log("🔍 TORNEIO SALVO COM SUCESSO - ID:", result.id);
      console.log("🔍 INVALIDANDO CACHE - Triggering re-fetch");
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      
      // Forçar re-fetch imediato
      queryClient.refetchQueries({ queryKey: ["/api/planned-tournaments"] });
      
      setIsSaving(false);
      setSaveStatus('saved');
      
      // Debug: Verificar se lista foi atualizada
      setTimeout(() => {
        console.log("🔍 FRONTEND ATUALIZADO - Verificando lista após 2s");
        const currentData = queryClient.getQueryData(["/api/planned-tournaments"]);
        console.log("🔍 FRONTEND ATUALIZADO - Dados atuais no cache:", currentData);
        console.log("🔍 FRONTEND ATUALIZADO - Quantidade na lista:", currentData?.length || 0);
      }, 2000);
      
      // Show saved status briefly
      setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    },
    onError: (error: Error) => {
      console.error("🔍 ERRO AO SALVAR - Error completo:", error);
      setIsSaving(false);
      setSaveStatus('error');
      
      toast({
        title: "Erro ao Salvar",
        description: "Falha ao salvar torneio automaticamente. Tente novamente.",
        variant: "destructive",
      });
      
      // Reset error status after 3 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    },
  });

  // Batch save mutation for better performance (legacy - kept for compatibility)
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
      console.log("🔧 UPDATE DEBUG - Calling API with data:", data);
      const { id, ...updateData } = data;
      
      try {
        const response = await apiRequest("PUT", `/api/planned-tournaments/${id}`, updateData);
        console.log("🔧 UPDATE DEBUG - API response:", response);
        return response;
      } catch (error) {
        console.error("🚨 UPDATE ERROR - API request failed:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("✅ UPDATE SUCCESS - Tournament updated successfully:", data);
      
      // Invalidate and refetch queries
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      queryClient.refetchQueries({ queryKey: ["/api/planned-tournaments"] });
      
      toast({
        title: "Torneio Atualizado",
        description: "Torneio atualizado com sucesso",
      });
      
      // Close dialog after successful update
      setIsEditDialogOpen(false);
      setEditingTournament(null);
    },
    onError: (error: Error) => {
      console.error("🚨 UPDATE ERROR - Mutation failed:", error);
      toast({
        title: "Erro ao Atualizar",
        description: error.message || "Erro desconhecido ao atualizar torneio",
        variant: "destructive",
      });
    },
  });

  // Delete tournament mutation
  const deleteTournamentMutation = useMutation({
    mutationFn: async (id: string) => {
      console.log("🗑️ DELETE DEBUG - Starting deletion for tournament ID:", id);
      
      try {
        const response = await apiRequest("DELETE", `/api/planned-tournaments/${id}`);
        console.log("🗑️ DELETE DEBUG - API response:", response);
        return response;
      } catch (error) {
        console.error("🚨 DELETE ERROR - API request failed:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("✅ DELETE SUCCESS - Tournament deleted successfully:", data);
      
      // Invalidate all related queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/active-days"] });
      
      toast({
        title: "Torneio Excluído",
        description: "Torneio excluído com sucesso",
      });
    },
    onError: (error: Error) => {
      console.error("🚨 DELETE ERROR - Mutation failed:", error);
      toast({
        title: "Erro ao Excluir",
        description: error.message || "Erro desconhecido ao excluir torneio",
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
    // Sanitize and validate data before saving
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
    
    // Auto-save immediately instead of adding to pending list
    autoSaveTournamentMutation.mutate(sanitizedData);
    
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
  };

  // Legacy function - no longer needed with auto-save
  const handleSaveAll = () => {
    console.log("🔍 SAVE DEBUG - handleSaveAll called (legacy - not needed with auto-save)");
  };

  // Function to generate suggestions based on existing tournaments with intelligent fallbacks
  const getSuggestedTournaments = () => {
    console.log("🔍 ALGORITMO DE SUGESTÕES - Iniciando cálculo de sugestões");
    console.log("🔍 ALGORITMO DE SUGESTÕES - plannedTournaments:", plannedTournaments?.length || 0);
    console.log("🔍 ALGORITMO DE SUGESTÕES - tournamentSuggestions:", tournamentSuggestions?.length || 0);
    console.log("🔍 ALGORITMO DE SUGESTÕES - user:", user?.userPlatformId || 'undefined');
    console.log("🔍 ALGORITMO DE SUGESTÕES - selectedDay:", selectedDay);
    
    // Get current form values for filtering
    const currentSite = form.watch("site");
    const currentType = form.watch("type");
    const currentSpeed = form.watch("speed");
    const currentBuyIn = form.watch("buyIn");
    
    console.log("🔍 FILTROS APLICADOS - currentSite:", currentSite);
    console.log("🔍 FILTROS APLICADOS - currentType:", currentType);
    console.log("🔍 FILTROS APLICADOS - currentSpeed:", currentSpeed);
    console.log("🔍 FILTROS APLICADOS - currentBuyIn:", currentBuyIn);
    
    // FONTE 1: Torneios próprios do usuário (isolados)
    const userTournaments = plannedTournaments || [];
    
    // FONTE 2: Sugestões globais de outros usuários (pool compartilhado)
    const globalSuggestions = (tournamentSuggestions || []).map(t => ({
      ...t,
      isGlobal: true, // Marcador para distinção visual
      frequency: 1
    }));
    
    console.log("🔍 FONTE 1 - Torneios próprios:", userTournaments.length);
    console.log("🔍 FONTE 2 - Pool global:", globalSuggestions.length);
    
    // STRATEGY 1: Tournaments from other days (original logic)
    const otherDayTournaments = userTournaments.filter(t => 
      t.dayOfWeek !== (selectedDay || 0)
    );
    
    // STRATEGY 2: Variations of same day tournaments (different times/buy-ins)
    const sameDayTournaments = userTournaments.filter(t => 
      t.dayOfWeek === (selectedDay || 0)
    );
    
    // STRATEGY 3: Generate variations of existing tournaments
    const suggestedVariations = generateTournamentVariations(userTournaments);
    
    console.log("🔍 ESTRATÉGIAS - Outros dias:", otherDayTournaments.length);
    console.log("🔍 ESTRATÉGIAS - Mesmo dia:", sameDayTournaments.length);
    console.log("🔍 ESTRATÉGIAS - Variações:", suggestedVariations.length);
    console.log("🔍 ESTRATÉGIAS - Globais:", globalSuggestions.length);
    
    // Combine all potential suggestions with priority
    let allPotentialSuggestions = [
      ...otherDayTournaments,
      ...suggestedVariations,
      ...globalSuggestions // Adicionar pool global
    ];
    
    // Apply dynamic filters based on form values
    let filteredSuggestions = allPotentialSuggestions;
    
    // Filter by site if selected
    if (currentSite && currentSite.trim() !== "") {
      filteredSuggestions = filteredSuggestions.filter(t => t.site === currentSite);
      console.log("🔍 FILTROS APLICADOS - Após filtro site:", filteredSuggestions.length);
    }
    
    // Filter by type if selected
    if (currentType && currentType.trim() !== "") {
      filteredSuggestions = filteredSuggestions.filter(t => t.type === currentType);
      console.log("🔍 FILTROS APLICADOS - Após filtro type:", filteredSuggestions.length);
    }
    
    // Filter by speed if selected
    if (currentSpeed && currentSpeed.trim() !== "") {
      filteredSuggestions = filteredSuggestions.filter(t => t.speed === currentSpeed);
      console.log("🔍 FILTROS APLICADOS - Após filtro speed:", filteredSuggestions.length);
    }
    
    // Filter by similar buy-in range if specified (+/- 20%)
    if (currentBuyIn && currentBuyIn.trim() !== "" && !isNaN(parseFloat(currentBuyIn))) {
      const buyInValue = parseFloat(currentBuyIn);
      const tolerance = buyInValue * 0.2; // 20% tolerance
      filteredSuggestions = filteredSuggestions.filter(t => {
        const tournamentBuyIn = parseFloat(t.buyIn || 0);
        return Math.abs(tournamentBuyIn - buyInValue) <= tolerance;
      });
      console.log("🔍 FILTROS APLICADOS - Após filtro buy-in:", filteredSuggestions.length);
    }
    
    // Group by tournament characteristics and count frequency
    const frequencyMap = new Map();
    filteredSuggestions.forEach(t => {
      const key = `${t.site}-${t.type}-${t.speed}-${t.buyIn}`;
      if (frequencyMap.has(key)) {
        frequencyMap.set(key, frequencyMap.get(key) + 1);
      } else {
        frequencyMap.set(key, 1);
      }
    });
    
    console.log("🔍 FREQUÊNCIA MAP - Chaves geradas:", Array.from(frequencyMap.keys()));
    console.log("🔍 FREQUÊNCIA MAP - Valores:", Array.from(frequencyMap.entries()));
    
    // Convert to suggestions array and sort by frequency
    let suggestions = Array.from(frequencyMap.entries())
      .map(([key, frequency]) => {
        const tournament = filteredSuggestions.find(t => 
          `${t.site}-${t.type}-${t.speed}-${t.buyIn}` === key
        );
        return {
          ...tournament,
          frequency
        };
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 8);
    
    // FALLBACK: If no suggestions, provide defaults
    if (suggestions.length === 0) {
      console.log("🔍 FALLBACK - Sem sugestões encontradas, usando padrões");
      suggestions = getDefaultSuggestions();
    }
    
    console.log("🔍 SUGESTÕES GERADAS - Quantidade:", suggestions.length);
    console.log("🔍 SUGESTÕES GERADAS - Array completo:", suggestions);
    
    return suggestions;
  };

  // Generate variations of existing tournaments
  const generateTournamentVariations = (tournaments: any[]) => {
    const variations = [];
    
    tournaments.forEach(tournament => {
      // Speed variations
      const speeds = ['Normal', 'Turbo', 'Hyper'];
      speeds.forEach(speed => {
        if (speed !== tournament.speed) {
          variations.push({
            ...tournament,
            speed,
            name: `${tournament.name} (${speed})`,
            id: `variation-${tournament.id}-${speed}`,
            frequency: 1
          });
        }
      });
      
      // Type variations
      const types = ['Vanilla', 'PKO', 'Mystery'];
      types.forEach(type => {
        if (type !== tournament.type) {
          variations.push({
            ...tournament,
            type,
            name: `${tournament.name} (${type})`,
            id: `variation-${tournament.id}-${type}`,
            frequency: 1
          });
        }
      });
      
      // Buy-in variations (±50%)
      const buyIn = parseFloat(tournament.buyIn || 0);
      if (buyIn > 0) {
        const variations_buyins = [
          Math.round(buyIn * 0.5),
          Math.round(buyIn * 1.5),
          Math.round(buyIn * 2)
        ];
        
        variations_buyins.forEach(varBuyIn => {
          if (varBuyIn !== buyIn && varBuyIn > 0) {
            variations.push({
              ...tournament,
              buyIn: varBuyIn.toString(),
              name: `${tournament.name} ($${varBuyIn})`,
              id: `variation-${tournament.id}-${varBuyIn}`,
              frequency: 1
            });
          }
        });
      }
    });
    
    return variations.slice(0, 10); // Limit variations
  };

  // Default suggestions when no data available
  const getDefaultSuggestions = () => {
    return [
      {
        id: 'default-1',
        site: 'PokerStars',
        type: 'Vanilla',
        speed: 'Normal',
        buyIn: '11',
        guaranteed: '10000',
        name: 'The Hot $11',
        time: '20:00',
        frequency: 1
      },
      {
        id: 'default-2',
        site: 'PokerStars',
        type: 'PKO',
        speed: 'Turbo',
        buyIn: '22',
        guaranteed: '25000',
        name: 'PKO Turbo',
        time: '21:00',
        frequency: 1
      },
      {
        id: 'default-3',
        site: 'WPN',
        type: 'Vanilla',
        speed: 'Normal',
        buyIn: '55',
        guaranteed: '20000',
        name: 'The Loncar',
        time: '19:15',
        frequency: 1
      },
      {
        id: 'default-4',
        site: 'GGPoker',
        type: 'Mystery',
        speed: 'Hyper',
        buyIn: '33',
        guaranteed: '15000',
        name: 'Mystery Hyper',
        time: '22:00',
        frequency: 1
      },
      {
        id: 'default-5',
        site: 'PartyPoker',
        type: 'Vanilla',
        speed: 'Normal',
        buyIn: '109',
        guaranteed: '50000',
        name: 'Daily Legend',
        time: '20:30',
        frequency: 1
      }
    ];
  };

  // Get suggestions with dynamic filtering
  const suggestions = getSuggestedTournaments();

  // Handle edit tournament submission
  const handleEditSubmit = (data: TournamentForm) => {
    console.log('🔧 EDIT SUBMIT - Data received:', data);
    console.log('🔧 EDIT SUBMIT - editingTournament:', editingTournament);
    
    if (!editingTournament?.id) {
      console.error('🚨 EDIT ERROR - No tournament ID found');
      toast({
        title: "Erro",
        description: "ID do torneio não encontrado",
        variant: "destructive",
      });
      return;
    }

    const updateData = {
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
    };

    console.log("🔧 EDIT SUBMIT - Sending update data:", updateData);
    updateTournamentMutation.mutate(updateData);
  };

  // Handle edit tournament
  const handleEditTournament = (tournament: any) => {
    console.log("🔧 EDIT DEBUG - Opening edit modal for tournament:", tournament);
    
    setEditingTournament(tournament);
    
    // Reset form with tournament data
    const formData = {
      site: tournament.site || "",
      time: tournament.time || "",
      type: tournament.type || "",
      speed: tournament.speed || "",
      name: tournament.name || "",
      buyIn: tournament.buyIn?.toString() || "",
      guaranteed: tournament.guaranteed?.toString() || "",
      prioridade: Number(tournament.prioridade) || 2,
    };
    
    console.log("🔧 EDIT DEBUG - Form data being set:", formData);
    
    editForm.reset(formData);
    
    // Wait for form to be reset then open dialog
    setTimeout(() => {
      setIsEditDialogOpen(true);
    }, 50);
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
    
    // No more pending tournaments with auto-save - only saved tournaments
    return savedTournaments;
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
    
    // With auto-save, drag and drop operations directly update saved tournaments
    
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



  

  // Confirm delete tournament
  const confirmDeleteTournament = () => {
    console.log("Deleting tournament:", tournamentToDelete);
    
    // With auto-save, all tournaments are saved - just delete directly
    console.log("Deleting tournament with ID:", tournamentToDelete.id);
    deleteTournamentMutation.mutate(tournamentToDelete.id);
    
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
    <div className="w-full px-6 py-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2 text-white">Grade </h2>
        <p className="text-gray-400">Planeje sua grade semanal</p>
      </div>

      {/* Weekly Planning Section */}
      <div className="mb-8">

        {/* Weekly Dashboard - Dashboard Semanal Compacto */}
        <div className={'dashboard-compact ' + (isDashboardExpanded ? 'expanded' : '')}>
          <div className="dashboard-header">
            <div className="dashboard-title">📈 Resumo da Semana</div>
            <button 
              className="expand-btn" 
              onClick={() => setIsDashboardExpanded(!isDashboardExpanded)}
            >
              {isDashboardExpanded ? 'Recolher' : 'Expandir'}
            </button>
          </div>
          
          <div className="dashboard-summary grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full">
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
            {/* NOVO: ABI */}
            <div className="summary-item">
              <div className="summary-value">
                ${(() => {
                  const activeDayTournaments = weekDays
                    .filter(day => isDayActive(day.id))
                    .flatMap(day => getTournamentsForDay(day.id));
                  const totalBuyIn = activeDayTournaments.reduce((sum: number, t: any) => sum + (parseFloat(t.buyIn) || 0), 0);
                  const count = activeDayTournaments.length;
                  return count > 0 ? (totalBuyIn / count).toFixed(2) : '0.00';
                })()}
              </div>
              <div className="summary-label">ABI</div>
            </div>
            {/* NOVO: Média Participantes */}
            <div className="summary-item">
              <div className="summary-value">
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
              </div>
              <div className="summary-label">Média Participantes</div>
            </div>
            {/* NOVO: Tempo Total */}
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
              <div className="summary-label">Tempo Total</div>
            </div>
          </div>

          {/* NOVA SEÇÃO: Gráficos de Pizza e Sites Ativos */}
          <div className="pie-chart-section grid gap-4 mb-6 w-full">
            {/* Gráfico de Tipos */}
            <div className="bg-slate-700 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-3">Tipos</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(() => {
                        const activeDayTournaments = weekDays
                          .filter(day => isDayActive(day.id))
                          .flatMap(day => getTournamentsForDay(day.id));
                        
                        const typeStats = activeDayTournaments.reduce((acc: any, t: any) => {
                          const type = t.type || 'Unknown';
                          acc[type] = (acc[type] || 0) + 1;
                          return acc;
                        }, {});

                        return Object.entries(typeStats).map(([type, count]) => ({
                          name: type,
                          value: count,
                          color: type === 'Mystery' ? '#ec4899' : type === 'PKO' ? '#f97316' : '#3b82f6'
                        }));
                      })()}
                      cx="50%"
                      cy="50%"
                      outerRadius={40}
                      dataKey="value"
                    >
                      {(() => {
                        const activeDayTournaments = weekDays
                          .filter(day => isDayActive(day.id))
                          .flatMap(day => getTournamentsForDay(day.id));
                        
                        const typeStats = activeDayTournaments.reduce((acc: any, t: any) => {
                          const type = t.type || 'Unknown';
                          acc[type] = (acc[type] || 0) + 1;
                          return acc;
                        }, {});

                        const typeChartData = Object.entries(typeStats).map(([type, count]) => ({
                          name: type,
                          value: count,
                          color: type === 'Mystery' ? '#ec4899' : type === 'PKO' ? '#f97316' : '#3b82f6'
                        }));

                        return typeChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ));
                      })()}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 text-xs">
                {(() => {
                  const activeDayTournaments = weekDays
                    .filter(day => isDayActive(day.id))
                    .flatMap(day => getTournamentsForDay(day.id));
                  
                  const typeStats = activeDayTournaments.reduce((acc: any, t: any) => {
                    const type = t.type || 'Unknown';
                    acc[type] = (acc[type] || 0) + 1;
                    return acc;
                  }, {});

                  const total = activeDayTournaments.length;
                  
                  return Object.entries(typeStats).map(([type, count]) => {
                    const percentage = total > 0 ? Math.round((count as number) / total * 100) : 0;
                    return (
                      <div key={type} className="flex justify-between">
                        <span className="text-slate-300">{type}</span>
                        <span className="text-slate-300">{percentage}%</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Gráfico de Velocidades */}
            <div className="bg-slate-700 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-3">Velocidades</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(() => {
                        const activeDayTournaments = weekDays
                          .filter(day => isDayActive(day.id))
                          .flatMap(day => getTournamentsForDay(day.id));
                        
                        const speedStats = activeDayTournaments.reduce((acc: any, t: any) => {
                          const speed = t.speed || 'Unknown';
                          acc[speed] = (acc[speed] || 0) + 1;
                          return acc;
                        }, {});

                        return Object.entries(speedStats).map(([speed, count]) => ({
                          name: speed,
                          value: count,
                          color: speed === 'Normal' ? '#10b981' : speed === 'Turbo' ? '#f59e0b' : '#ef4444'
                        }));
                      })()}
                      cx="50%"
                      cy="50%"
                      outerRadius={40}
                      dataKey="value"
                    >
                      {(() => {
                        const activeDayTournaments = weekDays
                          .filter(day => isDayActive(day.id))
                          .flatMap(day => getTournamentsForDay(day.id));
                        
                        const speedStats = activeDayTournaments.reduce((acc: any, t: any) => {
                          const speed = t.speed || 'Unknown';
                          acc[speed] = (acc[speed] || 0) + 1;
                          return acc;
                        }, {});

                        const speedChartData = Object.entries(speedStats).map(([speed, count]) => ({
                          name: speed,
                          value: count,
                          color: speed === 'Normal' ? '#10b981' : speed === 'Turbo' ? '#f59e0b' : '#ef4444'
                        }));

                        return speedChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ));
                      })()}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 text-xs">
                {(() => {
                  const activeDayTournaments = weekDays
                    .filter(day => isDayActive(day.id))
                    .flatMap(day => getTournamentsForDay(day.id));
                  
                  const speedStats = activeDayTournaments.reduce((acc: any, t: any) => {
                    const speed = t.speed || 'Unknown';
                    acc[speed] = (acc[speed] || 0) + 1;
                    return acc;
                  }, {});

                  const total = activeDayTournaments.length;
                  
                  return Object.entries(speedStats).map(([speed, count]) => {
                    const percentage = total > 0 ? Math.round((count as number) / total * 100) : 0;
                    return (
                      <div key={speed} className="flex justify-between">
                        <span className="text-slate-300">{speed}</span>
                        <span className="text-slate-300">{percentage}%</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Sites Ativos - 2 colunas */}
            <div className="lg:col-span-2 bg-slate-700 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-3">Sites Ativos</h3>
              <div className="grid grid-cols-2 gap-4">
                {(() => {
                  const activeDayTournaments = weekDays
                    .filter(day => isDayActive(day.id))
                    .flatMap(day => getTournamentsForDay(day.id));
                  
                  const siteStats = activeDayTournaments.reduce((acc: any, t: any) => {
                    const site = t.site || 'Unknown';
                    const buyIn = parseFloat(t.buyIn) || 0;
                    acc[site] = {
                      count: (acc[site]?.count || 0) + 1,
                      investment: (acc[site]?.investment || 0) + buyIn
                    };
                    return acc;
                  }, {});

                  const sortedSites = Object.entries(siteStats)
                    .sort(([, a], [, b]) => (b as any).count - (a as any).count);

                  const getSiteColor = (site: string) => {
                    const colorMap: { [key: string]: string } = {
                      'PokerStars': 'bg-red-500',
                      'GGPoker': 'bg-orange-500',
                      'WPN': 'bg-blue-500',
                      'CoinPoker': 'bg-green-500',
                      'Chico': 'bg-purple-500',
                      'PartyPoker': 'bg-pink-500',
                      'Bodog': 'bg-yellow-500',
                      'Unknown': 'bg-gray-500'
                    };
                    return colorMap[site] || 'bg-gray-500';
                  };

                  return sortedSites.map(([site, stats]) => (
                    <div key={site} className="flex items-center justify-between p-2 bg-slate-600 rounded">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${getSiteColor(site)}`}></div>
                        <span className="text-sm text-white">{site}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-emerald-400">${(stats as any).investment.toFixed(0)}</div>
                        <div className="text-xs text-slate-300">{(stats as any).count} torneios</div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
          
          <div className={'dashboard-expanded ' + (isDashboardExpanded ? 'visible' : '')}>
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
            
            // NOVO: Criar duas versões do card para cada dia
            const profiles = [
              { profileId: `${day.id}-A`, profileName: "Perfil A", isMainProfile: true },
              { profileId: `${day.id}-B`, profileName: "Perfil B", isMainProfile: false }
            ];
            
            return (
              <div key={day.id} className="day-column">
                {profiles.map((profile, index) => (
                  <div 
                    key={profile.profileId} 
                    className={`day-card fade-in ${profile.isMainProfile && isActive ? 'active' : 'inactive'} cursor-pointer profile-card ${profile.isMainProfile ? 'main-profile' : 'secondary-profile'}`}
                    onClick={() => {
                      setSelectedDay(day.id);
                      form.setValue("dayOfWeek", day.id);
                      setIsDialogOpen(true);
                    }}
                  >
                    {/* Header com nome do dia + perfil */}
                    <div className="day-header">
                      <div className="day-name">{day.name} {profile.profileName}</div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // TODO: Implementar lógica radio button
                          toggleActiveDayMutation.mutate(day.id);
                        }}
                        className={`toggle-btn ${profile.isMainProfile && isActive ? 'active' : 'inactive'} pt-[1px] pb-[1px] mt-[-27px] mb-[-27px] ml-[14px] mr-[14px] pl-[6px] pr-[6px]`}
                        disabled={toggleActiveDayMutation.isPending}
                        title={profile.isMainProfile && isActive ? 'Desativar perfil' : 'Ativar perfil'}
                      >
                        {profile.isMainProfile && isActive ? (
                          <Power className="h-4 w-4" />
                        ) : (
                          <PowerOff className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {/* Status indicator visual */}
                    <div className={`day-status-indicator ${profile.isMainProfile && isActive ? 'active' : 'inactive'}`}></div>
                    {stats.count > 0 ? (
                      <>
                        {/* Volume e investimento - seção principal */}
                        <div className="day-metrics-section">
                          <div className="metrics-header">
                            <span className="metrics-count">
                              {Math.ceil(stats.count / 2)} {Math.ceil(stats.count / 2) === 1 ? 'torneio' : 'torneios'}
                            </span>
                            <div className="day-investment">${(stats.totalBuyIn / 2).toFixed(2)}</div>
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
                                  <div className="config-row">
                                    <span className="config-label">Tipos:</span>
                                    <Badge className={`config-badge ${predominantType.class}`}>
                                      {predominantType.name} {predominantType.percentage}%
                                    </Badge>
                                  </div>
                                  <div className="config-row">
                                    <span className="config-label">Velocidades:</span>
                                    <Badge className={`config-badge ${predominantSpeed.name.toLowerCase()}`}>
                                      {predominantSpeed.name} {predominantSpeed.percentage}%
                                    </Badge>
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
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {/* Day Planning Dialog - New 2-Column Layout */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-[1600px] min-h-[85vh] p-0">
          
          {/* Header Expandido */}
          <div className="p-6 border-b border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-2xl text-emerald-400 mb-6">
                {selectedDay !== null ? weekDays.find(d => d.id === selectedDay)?.name : ''} - Planejamento de Torneios
              </DialogTitle>
            </DialogHeader>

            {/* Métricas Principais - 6 Colunas */}
            <div className="grid grid-cols-6 gap-4 mb-6">
              {(() => {
                const dayStats = selectedDay !== null ? getDayStats(selectedDay) : null;
                const tournaments = selectedDay !== null ? getTournamentsForDay(selectedDay) : [];
                
                // Calculate breaks
                const breaks = tournaments.reduce((acc, tournament) => {
                  if (tournament.time) {
                    const [hour, minute] = tournament.time.split(':').map(Number);
                    const breakHour = minute >= 55 ? hour + 1 : hour;
                    const breakKey = `${breakHour}:55`;
                    acc.add(breakKey);
                  }
                  return acc;
                }, new Set());

                // Calculate time range
                const times = tournaments.map(t => t.time).filter(Boolean).sort();
                const timeRange = times.length > 0 ? `${times[0]} - ${times[times.length - 1]}` : '–';

                // Calculate total time
                const totalTime = (() => {
                  if (times.length === 0) return '–';
                  const startTime = times[0];
                  const endTime = times[times.length - 1];
                  const [startHour, startMinute] = startTime.split(':').map(Number);
                  const [endHour, endMinute] = endTime.split(':').map(Number);
                  const totalMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute) + 180; // +3h duration
                  return `${Math.floor(totalMinutes / 60)}h${totalMinutes % 60 > 0 ? `${totalMinutes % 60}m` : ''}`;
                })();

                return (
                  <>
                    <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
                      <div className="text-2xl font-bold text-emerald-400 mb-1">
                        {dayStats?.count || 0}
                      </div>
                      <div className="text-sm text-slate-400">Torneios</div>
                    </div>
                    <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
                      <div className="text-2xl font-bold text-emerald-400 mb-1">
                        ${dayStats?.totalBuyIn?.toFixed(0) || '0'}
                      </div>
                      <div className="text-sm text-slate-400">Buy-in Total</div>
                    </div>
                    <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
                      <div className="text-2xl font-bold text-emerald-400 mb-1">
                        ${dayStats?.avgBuyIn?.toFixed(0) || '0'}
                      </div>
                      <div className="text-sm text-slate-400">ABI</div>
                    </div>
                    <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
                      <div className="text-2xl font-bold text-emerald-400 mb-1">
                        {timeRange}
                      </div>
                      <div className="text-sm text-slate-400">Horário</div>
                    </div>
                    <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
                      <div className="text-2xl font-bold text-emerald-400 mb-1">
                        {totalTime}
                      </div>
                      <div className="text-sm text-slate-400">Tempo Total</div>
                    </div>
                    <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-center">
                      <div className="text-2xl font-bold text-emerald-400 mb-1">
                        {breaks.size}
                      </div>
                      <div className="text-sm text-slate-400">Breaks</div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Análise Detalhada - 4 Colunas */}
            <div className="grid grid-cols-4 gap-6">
              {(() => {
                const tournaments = selectedDay !== null ? getTournamentsForDay(selectedDay) : [];
                
                // Sites analysis
                const siteStats = tournaments.reduce((acc, tournament) => {
                  const site = tournament.site || 'Unknown';
                  const buyIn = parseFloat(tournament.buyIn || '0');
                  acc[site] = (acc[site] || 0) + buyIn;
                  return acc;
                }, {} as Record<string, number>);

                // Type analysis for pie chart
                const typeStats = tournaments.reduce((acc, tournament) => {
                  const type = tournament.type || 'Unknown';
                  acc[type] = (acc[type] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);

                const typeChartData = Object.entries(typeStats).map(([type, count]) => ({
                  name: type,
                  value: count,
                  color: type === 'Mystery' ? '#ec4899' : type === 'PKO' ? '#f97316' : '#3b82f6'
                }));

                // Speed analysis for pie chart
                const speedStats = tournaments.reduce((acc, tournament) => {
                  const speed = tournament.speed || 'Unknown';
                  acc[speed] = (acc[speed] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);

                const speedChartData = Object.entries(speedStats).map(([speed, count]) => ({
                  name: speed,
                  value: count,
                  color: speed === 'Normal' ? '#10b981' : speed === 'Turbo' ? '#f59e0b' : '#ef4444'
                }));

                // Field size analysis
                const fieldSizes = tournaments.reduce((acc, tournament) => {
                  const guaranteed = parseInt(tournament.guaranteed || '0');
                  if (guaranteed < 100) acc.small++;
                  else if (guaranteed <= 400) acc.medium++;
                  else if (guaranteed <= 1000) acc.large++;
                  else acc.huge++;
                  return acc;
                }, { small: 0, medium: 0, large: 0, huge: 0 });

                return (
                  <>
                    {/* Sites */}
                    <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-3">Sites</h4>
                      <div className="space-y-2">
                        {Object.entries(siteStats).map(([site, investment]) => (
                          <div key={site} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${getSiteColor(site)}`}></div>
                              <span className="text-xs text-slate-300">{site}</span>
                            </div>
                            <span className="text-xs text-emerald-400 font-medium">${investment.toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tipos - Gráfico Pizza */}
                    <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-3">Tipos</h4>
                      <div className="h-24">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={typeChartData}
                              cx="50%"
                              cy="50%"
                              outerRadius={30}
                              dataKey="value"
                            >
                              {typeChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip content={<CustomTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Velocidades - Gráfico Pizza */}
                    <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-3">Velocidades</h4>
                      <div className="h-24">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={speedChartData}
                              cx="50%"
                              cy="50%"
                              outerRadius={30}
                              dataKey="value"
                            >
                              {speedChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip content={<CustomTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Field Size */}
                    <div className="p-4 bg-slate-900 border border-slate-600 rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-3">Field Size</h4>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300">&lt; 100:</span>
                          <span className="text-emerald-400">{fieldSizes.small}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300">100-400:</span>
                          <span className="text-emerald-400">{fieldSizes.medium}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300">400-1000:</span>
                          <span className="text-emerald-400">{fieldSizes.large}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300">&gt; 1000:</span>
                          <span className="text-emerald-400">{fieldSizes.huge}</span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Layout Principal - 2 Colunas (60% / 40%) */}
          <div className="grid grid-cols-[3fr_2fr] gap-6 p-6 h-[calc(85vh-400px)]">
            
            {/* COLUNA ESQUERDA - Torneios Planejados (60%) */}
            <div className="flex flex-col bg-slate-900 border border-slate-600 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-white">Torneios Planejados</h3>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto">
                {(() => {
                  const tournaments = selectedDay !== null ? getTournamentsForDay(selectedDay) : [];
                  
                  // Group tournaments by breaks
                  const tournamentsByBreak = tournaments.reduce((acc, tournament) => {
                    if (tournament.time) {
                      const [hour, minute] = tournament.time.split(':').map(Number);
                      const breakHour = minute >= 55 ? hour + 1 : hour;
                      const breakKey = `${breakHour}:55`;
                      if (!acc[breakKey]) {
                        acc[breakKey] = [];
                      }
                      acc[breakKey].push(tournament);
                    }
                    return acc;
                  }, {} as Record<string, any[]>);

                  // Sort groups by break time
                  const sortedBreaks = Object.entries(tournamentsByBreak)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([breakTime, breakTournaments]) => ({
                      breakTime,
                      tournaments: breakTournaments.sort((a, b) => a.time.localeCompare(b.time))
                    }));

                  if (sortedBreaks.length === 0) {
                    return (
                      <div className="text-center text-slate-400 py-8">
                        <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhum torneio planejado para este dia</p>
                      </div>
                    );
                  }

                  return sortedBreaks.map(({ breakTime, tournaments }) => (
                    <div key={breakTime} className="mb-6">
                      {/* Break Header */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-px bg-slate-600 flex-1"></div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Clock className="w-3 h-3" />
                          <span>Break {breakTime}</span>
                          <span className="bg-slate-600 px-2 py-1 rounded-full">
                            {tournaments.length}
                          </span>
                        </div>
                        <div className="h-px bg-slate-600 flex-1"></div>
                      </div>

                      {/* Tournament Cards */}
                      <div className="space-y-2">
                        {tournaments.map((tournament) => (
                          <div key={tournament.id} className="bg-slate-600 rounded-md p-2">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-white">{tournament.time}</span>
                                <div className={`w-2 h-2 rounded-full ${getSiteColor(tournament.site)}`}></div>
                                <span className="text-xs text-slate-300">{tournament.site}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 hover:bg-slate-500"
                                  onClick={() => handleEditTournament(tournament)}
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 hover:bg-red-600"
                                  onClick={() => handleDeleteTournament(tournament)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            
                            <div className="text-xs text-white mb-1 truncate">
                              {tournament.name || generateTournamentName(tournament)}
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <Badge 
                                  className={`text-xs px-1 py-0.5 text-white ${getTypeColor(tournament.type)}`}
                                >
                                  {tournament.type}
                                </Badge>
                                <Badge 
                                  className={`text-xs px-1 py-0.5 text-white ${getSpeedColor(tournament.speed)}`}
                                >
                                  {tournament.speed}
                                </Badge>
                              </div>
                              <span className="text-sm font-bold text-emerald-400">${tournament.buyIn}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* COLUNA DIREITA - Novo Torneio + Sugestões (40%) */}
            <div className="flex flex-col space-y-4">
              
              {/* Novo Torneio - Parte Superior */}
              <div className="bg-slate-900 border border-slate-600 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Novo Torneio</h3>
                
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Site</label>
                      <select 
                        {...form.register("site")}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                      >
                        <option value="">Selecione um site</option>
                        {sites.map(site => (
                          <option key={site} value={site}>{site}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Horário</label>
                      <input
                        type="time"
                        {...form.register("time")}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Tipo</label>
                      <select 
                        {...form.register("type")}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                      >
                        <option value="">Tipo</option>
                        {types.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Velocidade</label>
                      <select 
                        {...form.register("speed")}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                      >
                        <option value="">Velocidade</option>
                        {speeds.map(speed => (
                          <option key={speed} value={speed}>{speed}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Nome</label>
                    <input
                      type="text"
                      {...form.register("name")}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                      placeholder="Nome do torneio"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Buy-in</label>
                      <input
                        type="number"
                        step="0.01"
                        {...form.register("buyIn")}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Garantido</label>
                      <input
                        type="number"
                        {...form.register("guaranteed")}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Prioridade</label>
                    <select 
                      {...form.register("prioridade")}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm"
                    >
                      <option value={2}>Média (padrão)</option>
                      <option value={1}>Alta</option>
                      <option value={3}>Baixa</option>
                    </select>
                  </div>
                  
                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => form.reset()}
                      className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                    >
                      Limpar Todos
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Adicionar
                    </Button>
                  </div>
                </form>
              </div>

              {/* Sugestões - Parte Inferior */}
              <div className="bg-slate-900 border border-slate-600 rounded-lg p-4 flex-1">
                <h3 className="text-lg font-semibold text-white mb-4">Sugestões</h3>
                
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {suggestions.length === 0 ? (
                    <div className="text-center text-slate-400 py-4">
                      <p className="text-sm">Nenhuma sugestão disponível</p>
                    </div>
                  ) : (
                    suggestions.map((suggestion) => (
                      <div 
                        key={suggestion.id}
                        className="bg-slate-600 rounded-md p-2 cursor-pointer hover:bg-slate-500 transition-colors"
                        onClick={() => handleSelectSuggestion(suggestion)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-white">{suggestion.time}</span>
                            <div className={`w-2 h-2 rounded-full ${getSiteColor(suggestion.site)}`}></div>
                            <span className="text-xs text-slate-300">{suggestion.site}</span>
                            <span className="text-xs text-slate-400">{suggestion.name}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Badge 
                              className={`text-xs px-1 py-0.5 text-white ${getTypeColor(suggestion.type)}`}
                            >
                              {suggestion.type}
                            </Badge>
                            <Badge 
                              className={`text-xs px-1 py-0.5 text-white ${getSpeedColor(suggestion.speed)}`}
                            >
                              {suggestion.speed}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-emerald-400">${suggestion.buyIn}</span>
                            <div className="text-xs text-slate-400">${suggestion.guaranteed} GTD</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
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
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-400">Editar Torneio</DialogTitle>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              {/* Site */}
              <FormField
                control={editForm.control}
                name="site"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-200">Site</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                          <SelectValue placeholder="Selecione um site" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {sites.map((site) => (
                          <SelectItem key={site} value={site}>{site}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Horário */}
              <FormField
                control={editForm.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-200">Horário</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        {...field}
                        className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Tipo */}
              <FormField
                control={editForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-200">Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                          <SelectValue placeholder="Selecione um tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {types.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Velocidade */}
              <FormField
                control={editForm.control}
                name="speed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-200">Velocidade</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                          <SelectValue placeholder="Selecione a velocidade" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {speeds.map((speed) => (
                          <SelectItem key={speed} value={speed}>{speed}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Nome */}
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-200">Nome (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400"
                        placeholder="Nome do torneio"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Buy-in */}
              <FormField
                control={editForm.control}
                name="buyIn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-200">Buy-in</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400"
                        placeholder="0.00"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Garantido */}
              <FormField
                control={editForm.control}
                name="guaranteed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-200">Garantido (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400"
                        placeholder="0.00"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Prioridade */}
              <FormField
                control={editForm.control}
                name="prioridade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-200">Prioridade</FormLabel>
                    <Select onValueChange={(value) => field.onChange(Number(value))} value={String(field.value)}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                          <SelectValue placeholder="Selecione a prioridade" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="1">Alta</SelectItem>
                        <SelectItem value="2">Média</SelectItem>
                        <SelectItem value="3">Baixa</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Botões */}
              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    console.log('🔧 EDIT CANCEL - Closing edit dialog');
                    setIsEditDialogOpen(false);
                    setEditingTournament(null);
                  }}
                  className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={updateTournamentMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                >
                  {updateTournamentMutation.isPending ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Salvando...
                    </div>
                  ) : (
                    'Salvar Alterações'
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
