import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useProfileStates, useUpdateProfileState } from "@/hooks/useProfileStates";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { getPlannerSiteColor, getPlannerTypeColor, getPlannerSpeedColor } from "@/lib/poker-colors";
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
import SupremaImportModal from "@/components/SupremaImportModal";
import { Download } from "lucide-react";

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

// Color mapping functions imported from @/lib/poker-colors
const getSiteColor = getPlannerSiteColor;
const getTypeColor = getPlannerTypeColor;
const getSpeedColor = getPlannerSpeedColor;

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
  const [selectedProfile, setSelectedProfile] = useState<'A' | 'B' | null>(null);
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
  const [showSupremaModal, setShowSupremaModal] = useState(false);

  // Fetch profile states from backend
  const { data: profileStates, isLoading: profileStatesLoading } = useProfileStates();
  const updateProfileStateMutation = useUpdateProfileState();
  
  // Get active profile for a specific day (pode retornar null se todos estão inativos)
  const getActiveProfile = (dayOfWeek: number): 'A' | 'B' | 'C' | null => {
    const state = profileStates?.find(ps => ps.dayOfWeek === dayOfWeek);
    return (state?.activeProfile as 'A' | 'B' | 'C' | null) || null;
  };
  
  // Update active profile for a specific day (com toggle: clicar no ativo desativa)
  const setActiveProfile = (dayOfWeek: number, profile: 'A' | 'B' | 'C') => {
    const currentActive = getActiveProfile(dayOfWeek);
    
    // Se clicar no perfil que já está ativo, desativar (ambos inativos)
    const newProfile = currentActive === profile ? null : profile;
    
    updateProfileStateMutation.mutate({
      dayOfWeek,
      activeProfile: newProfile,
      profileAData: {},
      profileBData: {}
    }, {
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: ["/api/profile-states"] });
      },
      onError: (error) => {
      }
    });
  };

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
    queryFn: () => apiRequest('GET', '/api/analytics/by-site?period=all'),
  });

  const { data: buyinAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-buyin", "all"],
    queryFn: () => apiRequest('GET', '/api/analytics/by-buyin?period=all'),
  });

  const { data: categoryAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-category", "all"],
    queryFn: () => apiRequest('GET', '/api/analytics/by-category?period=all'),
  });

  // Fetch tournament library - use 'all' period to get complete dataset
  const { data: tournamentLibrary } = useQuery({
    queryKey: ["/api/tournament-library", "all"],
    queryFn: () => apiRequest("GET", "/api/tournament-library?period=all"),
  });

  // Fetch active days
  const { data: activeDays } = useQuery({
    queryKey: ["/api/active-days"],
    queryFn: () => apiRequest("GET", "/api/active-days"),
  });

  // Fetch planned tournaments (isolados por usuário)
  const plannedQuery = useQuery({
    queryKey: ["/api/planned-tournaments"],
    enabled: !!user?.userPlatformId, // Only run when user is authenticated
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/planned-tournaments");
        return Array.isArray(response) ? response : [];
      } catch (error) {
        return [];
      }
    },
  });

  const plannedTournaments = plannedQuery.data || [];
  const plannedError = plannedQuery.error;
  const plannedLoading = plannedQuery.isLoading;

  // Loading Screen Component
  const LoadingScreen = () => (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center transition-all duration-500 ease-in-out">
      <div className="text-center animate-fadeIn">
        {/* Logo Container with pulse animation */}
        <div className="mb-8">
          <div className="w-32 h-32 mx-auto bg-emerald-600 rounded-full flex items-center justify-center mb-4 animate-pulse">
            <Calendar className="w-16 h-16 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide">Grindfy</h1>
          <h2 className="text-xl text-emerald-400 font-semibold">Grade Planner</h2>
        </div>
        
        {/* Loading Text */}
        <div className="mb-8">
          <p className="text-lg text-slate-300 mb-4 animate-pulse">Carregando dados do usuário</p>
          
          {/* Loading Animation */}
          <div className="flex justify-center space-x-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>
        
        {/* Additional Info */}
        <div className="text-sm text-slate-400 max-w-md mx-auto">
          <p className="leading-relaxed">Preparando sua grade de torneios e configurações personalizadas...</p>
        </div>
      </div>
    </div>
  );





  // Fetch tournament suggestions (pool global)
  const { data: tournamentSuggestions = [] } = useQuery({
    queryKey: ["/api/tournament-suggestions"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/tournament-suggestions");
      return Array.isArray(response) ? response : [];
    },
  });

  // Auto-save mutation for seamless experience
  const autoSaveTournamentMutation = useMutation({
    mutationFn: async (tournament: TournamentForm) => {
      
      const response = await apiRequest("POST", "/api/planned-tournaments", tournament);
      
      return response;
    },
    onMutate: () => {
      setIsSaving(true);
      setSaveStatus('saving');
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      
      // Forçar re-fetch imediato
      queryClient.refetchQueries({ queryKey: ["/api/planned-tournaments"] });
      
      setIsSaving(false);
      setSaveStatus('saved');
      
      // Debug: Verificar se lista foi atualizada
      setTimeout(() => {
        const currentData = queryClient.getQueryData(["/api/planned-tournaments"]);
      }, 2000);
      
      // Show saved status briefly
      setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    },
    onError: (error: Error) => {
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
      
      const promises = tournaments.map((tournament, index) => {
        
        return apiRequest("POST", "/api/planned-tournaments", tournament).then(res => {
          if (!res.ok) {
            throw new Error(`Failed to save tournament ${index + 1}: ${res.status} ${res.statusText}`);
          }
          return res.json();
        }).catch(error => {
          throw error;
        });
      });
      
      return Promise.all(promises);
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      setIsDialogOpen(false);
      toast({
        title: "Torneios Salvos",
        description: "Todos os torneios foram salvos com sucesso",
      });
    },
    onError: (error: Error) => {
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
      const { id, ...updateData } = data;
      
      try {
        const response = await apiRequest("PUT", `/api/planned-tournaments/${id}`, updateData);
        return response;
      } catch (error) {
        throw error;
      }
    },
    onSuccess: (data) => {
      
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
      
      try {
        const response = await apiRequest("DELETE", `/api/planned-tournaments/${id}`);
        return response;
      } catch (error) {
        throw error;
      }
    },
    onSuccess: (data) => {
      
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
      const response = await apiRequest("POST", "/api/active-days/toggle", { dayOfWeek });
      return response;
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

  // Show loading screen while critical data is loading (after all hooks declared)
  if (plannedLoading || profileStatesLoading || !user) {
    return <LoadingScreen />;
  }

  const onSubmit = (data: TournamentForm) => {
    // Sanitize and validate data before saving
    const sanitizedData = {
      dayOfWeek: selectedDay || 0,
      profile: selectedProfile || getActiveProfile(selectedDay || 0) || 'A', // Use selected profile for editing or active profile as fallback
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
  };

  // Function to generate suggestions based on existing tournaments with intelligent fallbacks
  const getSuggestedTournaments = () => {
    
    // Get current form values for filtering
    const currentSite = form.watch("site");
    const currentType = form.watch("type");
    const currentSpeed = form.watch("speed");
    const currentBuyIn = form.watch("buyIn");
    
    
    // FONTE 1: Torneios próprios do usuário filtrados por perfil ativo
    const selectedDayNumber = selectedDay || 0;
    const activeProfile = getActiveProfile(selectedDayNumber);
    const allUserTournaments = Array.isArray(plannedTournaments) ? plannedTournaments : [];
    // Se activeProfile for null, não mostrar torneios (ambos perfis inativos)
    const userTournaments = activeProfile ? allUserTournaments.filter(t => t.profile === activeProfile) : [];
    
    // FONTE 2: Sugestões globais de outros usuários (pool compartilhado)
    const globalSuggestions = (Array.isArray(tournamentSuggestions) ? tournamentSuggestions : []).map(t => ({
      ...t,
      isGlobal: true, // Marcador para distinção visual
      frequency: 1
    }));
    
    
    // STRATEGY 1: Tournaments from other days (filtered by active profile)
    const otherDayTournaments = userTournaments.filter(t => 
      t.dayOfWeek !== selectedDayNumber
    );
    
    // STRATEGY 2: Variations of same day tournaments (filtered by active profile)
    const sameDayTournaments = userTournaments.filter(t => 
      t.dayOfWeek === selectedDayNumber
    );
    
    // STRATEGY 3: Generate variations of existing tournaments
    const suggestedVariations = generateTournamentVariations(Array.isArray(userTournaments) ? userTournaments : []);
    
    
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
    }
    
    // Filter by type if selected
    if (currentType && currentType.trim() !== "") {
      filteredSuggestions = filteredSuggestions.filter(t => t.type === currentType);
    }
    
    // Filter by speed if selected
    if (currentSpeed && currentSpeed.trim() !== "") {
      filteredSuggestions = filteredSuggestions.filter(t => t.speed === currentSpeed);
    }
    
    // Filter by similar buy-in range if specified (+/- 20%)
    if (currentBuyIn && currentBuyIn.trim() !== "" && !isNaN(parseFloat(currentBuyIn))) {
      const buyInValue = parseFloat(currentBuyIn);
      const tolerance = buyInValue * 0.2; // 20% tolerance
      filteredSuggestions = filteredSuggestions.filter(t => {
        const tournamentBuyIn = parseFloat(t.buyIn || 0);
        return Math.abs(tournamentBuyIn - buyInValue) <= tolerance;
      });
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
      suggestions = getDefaultSuggestions();
    }
    
    
    return suggestions;
  };

  // Generate variations of existing tournaments
  const generateTournamentVariations = (tournaments: any[]) => {
    const variations: any[] = [];
    
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
    
    if (!editingTournament?.id) {
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

    updateTournamentMutation.mutate(updateData);
  };

  // Handle edit tournament
  const handleEditTournament = (tournament: any) => {
    
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
    // Use the active profile for this day to get the correct tournaments
    const activeProfile = getActiveProfile(dayId) || 'A'; // Fallback to A if null
    const allTournamentsForDay = (Array.isArray(plannedTournaments) ? plannedTournaments : []).filter((t: any) => t.dayOfWeek === dayId);
    const savedTournaments = allTournamentsForDay.filter((t: any) => t.profile === activeProfile);
    
    // DEBUG: Show profile distribution for this day
    const profileACCount = allTournamentsForDay.filter((t: any) => t.profile === 'A').length;
    const profileBCount = allTournamentsForDay.filter((t: any) => t.profile === 'B').length;
    const noProfileCount = allTournamentsForDay.filter((t: any) => !t.profile).length;
    
    
    // No more pending tournaments with auto-save - only saved tournaments
    return savedTournaments;
  };

  // NEW: Function to get tournaments for specific profile (for editing modal)
  const getTournamentsForModalProfile = (dayId: number, profileToShow: 'A' | 'B') => {
    const allTournamentsForDay = (Array.isArray(plannedTournaments) ? plannedTournaments : []).filter((t: any) => t.dayOfWeek === dayId);
    const specificProfileTournaments = allTournamentsForDay.filter((t: any) => t.profile === profileToShow);
    
    
    return specificProfileTournaments;
  };

  // Get tournaments for specific day and profile
  const getTournamentsForProfile = (dayId: number, profile: 'A' | 'B') => {
    const savedTournaments = (Array.isArray(plannedTournaments) ? plannedTournaments : []).filter((t: any) => 
      t.dayOfWeek === dayId && t.profile === profile
    );
    
    return savedTournaments;
  };

  // Check if a day is active (default to true if not found)
  const isDayActive = (dayOfWeek: number): boolean => {
    if (!activeDays) return true; // Default to active if no data
    const dayConfig = activeDays.find((d: any) => d.dayOfWeek === dayOfWeek);
    return dayConfig ? dayConfig.isActive : true; // Default to active if not found
  };

  // NEW: Check if a day has tournaments with active profiles (for weekly dashboard)
  const isDayActiveWithTournaments = (dayOfWeek: number): boolean => {
    const activeProfile = getActiveProfile(dayOfWeek);
    if (!activeProfile) return false; // No active profile
    
    const tournaments = getTournamentsForDay(dayOfWeek);
    return tournaments.length > 0; // Has tournaments with active profile
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

  // Calculate profile-specific statistics using real tournament data
  const getProfileStats = (dayId: number, profile: 'A' | 'B') => {
    const tournaments = getTournamentsForProfile(dayId, profile);
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
    
    // With auto-save, all tournaments are saved - just delete directly
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

        {/* Weekly Dashboard - Dashboard Semanal Compacto */}
        <div className="dashboard-compact expanded">
          <div className="weekly-dashboard-header">
            <h3 className="weekly-dashboard-title">📈 Resumo da Semana</h3>
            <div className="weekly-dashboard-subtitle">Visão geral dos torneios planejados</div>
          </div>
          
          <div className="dashboard-summary grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full">
            <div className="weekly-summary-card">
              <div className="weekly-card-icon">
                🎯
              </div>
              <div className="weekly-card-value">
                {(() => {
                  const activeDayTournaments = weekDays
                    .filter(day => isDayActiveWithTournaments(day.id))
                    .flatMap(day => getTournamentsForDay(day.id));
                  return activeDayTournaments.length;
                })()}
              </div>
              <div className="weekly-card-label">Torneios</div>
              <div className="weekly-card-sublabel">Planejados</div>
            </div>
            <div className="weekly-summary-card">
              <div className="weekly-card-icon">
                💰
              </div>
              <div className="weekly-card-value">
                ${(() => {
                  const activeDayTournaments = weekDays
                    .filter(day => isDayActiveWithTournaments(day.id))
                    .flatMap(day => getTournamentsForDay(day.id));
                  return activeDayTournaments.reduce((sum: number, t: any) => sum + (parseFloat(t.buyIn) || 0), 0).toFixed(0);
                })()}
              </div>
              <div className="weekly-card-label">Investimento</div>
              <div className="weekly-card-sublabel">Total</div>
            </div>
            {/* NOVO: ABI */}
            <div className="weekly-summary-card">
              <div className="weekly-card-icon">
                📊
              </div>
              <div className="weekly-card-value">
                ${(() => {
                  const activeDayTournaments = weekDays
                    .filter(day => isDayActiveWithTournaments(day.id))
                    .flatMap(day => getTournamentsForDay(day.id));
                  const totalBuyIn = activeDayTournaments.reduce((sum: number, t: any) => sum + (parseFloat(t.buyIn) || 0), 0);
                  const count = activeDayTournaments.length;
                  return count > 0 ? (totalBuyIn / count).toFixed(2) : '0.00';
                })()}
              </div>
              <div className="weekly-card-label">ABI</div>
              <div className="weekly-card-sublabel">Médio</div>
            </div>
            {/* NOVO: Média Participantes */}
            <div className="weekly-summary-card">
              <div className="weekly-card-icon">
                👥
              </div>
              <div className="weekly-card-value">
                {(() => {
                  const activeDayTournaments = weekDays
                    .filter(day => isDayActiveWithTournaments(day.id))
                    .flatMap(day => getTournamentsForDay(day.id));
                  const tournamentsWithGuaranteed = activeDayTournaments.filter((t: any) => t.guaranteed && parseFloat(t.guaranteed) > 0);
                  if (tournamentsWithGuaranteed.length === 0) return 'N/A';
                  
                  // Debug: Calcular participantes individuais
                  const participantsList = tournamentsWithGuaranteed.map((t: any) => {
                    const guaranteed = parseFloat(t.guaranteed) || 0;
                    const buyIn = parseFloat(t.buyIn) || 0;
                    const participants = buyIn > 0 ? Math.round(guaranteed / buyIn) : 0;
                    return participants;
                  });
                  
                  
                  const totalParticipants = tournamentsWithGuaranteed.reduce((sum: number, t: any) => {
                    const guaranteed = parseFloat(t.guaranteed) || 0;
                    const buyIn = parseFloat(t.buyIn) || 0;
                    return sum + (buyIn > 0 ? Math.round(guaranteed / buyIn) : 0);
                  }, 0);
                  return Math.round(totalParticipants / tournamentsWithGuaranteed.length);
                })()}
              </div>
              <div className="weekly-card-label">Média Participantes</div>
              <div className="weekly-card-sublabel">Estimativa</div>
            </div>
            {/* NOVO: Tempo Total */}
            <div className="weekly-summary-card">
              <div className="weekly-card-icon">
                ⏱️
              </div>
              <div className="weekly-card-value">
                {(() => {
                  const totalHours = weekDays
                    .filter(day => isDayActiveWithTournaments(day.id))
                    .reduce((sum, day) => {
                      const stats = getDayStats(day.id);
                      return sum + (stats.durationHours || 0);
                    }, 0);
                  return totalHours > 0 ? `${totalHours.toFixed(1)}h` : '0h';
                })()}
              </div>
              <div className="weekly-card-label">Tempo Total</div>
              <div className="weekly-card-sublabel">Sessões</div>
            </div>
          </div>

          {/* NOVA SEÇÃO: Gráficos de Pizza e Sites Ativos */}
          <div className="pie-chart-section grid gap-4 mb-6 w-full">
            {/* Gráfico de Tipos */}
            <div className="weekly-summary-card">
              <div className="weekly-card-icon">
                🎲
              </div>
              <h3 className="weekly-card-label mb-3">Tipos</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(() => {
                        const activeDayTournaments = weekDays
                          .filter(day => isDayActiveWithTournaments(day.id))
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
                          .filter(day => isDayActiveWithTournaments(day.id))
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
                    .filter(day => isDayActiveWithTournaments(day.id))
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
            <div className="weekly-summary-card">
              <div className="weekly-card-icon">
                ⚡
              </div>
              <h3 className="weekly-card-label mb-3">Velocidades</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(() => {
                        const activeDayTournaments = weekDays
                          .filter(day => isDayActiveWithTournaments(day.id))
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
                          .filter(day => isDayActiveWithTournaments(day.id))
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
                    .filter(day => isDayActiveWithTournaments(day.id))
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
            <div className="lg:col-span-2 weekly-summary-card">
              <div className="weekly-card-icon">
                🎰
              </div>
              <h3 className="weekly-card-label mb-3">Sites Ativos</h3>
              <div className="grid grid-cols-2 gap-4">
                {(() => {
                  const activeDayTournaments = weekDays
                    .filter(day => isDayActiveWithTournaments(day.id))
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
                        .filter(day => isDayActiveWithTournaments(day.id))
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
                        .filter(day => isDayActiveWithTournaments(day.id))
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
                        .filter(day => isDayActiveWithTournaments(day.id))
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
                        .filter(day => isDayActiveWithTournaments(day.id))
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
                        .filter(day => isDayActiveWithTournaments(day.id))
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
                        .filter(day => isDayActiveWithTournaments(day.id))
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
                    .filter(day => isDayActiveWithTournaments(day.id))
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
                      <span>{count as number} ({totalTournaments > 0 ? ((count as number) / totalTournaments * 100).toFixed(0) : 0}%)</span>
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
                        .filter(day => isDayActiveWithTournaments(day.id))
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
                        .filter(day => isDayActiveWithTournaments(day.id))
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
            const isActive = isDayActiveWithTournaments(day.id);
            
            // NOVO: Criar três versões do card para cada dia (incluindo Perfil C "Dia OFF")
            const profiles: Array<{ profileId: string; profileName: string; profileType: 'A' | 'B' | 'C'; isMainProfile: boolean }> = [
              { profileId: `${day.id}-A`, profileName: "Perfil A", profileType: 'A', isMainProfile: true },
              { profileId: `${day.id}-B`, profileName: "Perfil B", profileType: 'B', isMainProfile: false },
              { profileId: `${day.id}-C`, profileName: "Dia OFF", profileType: 'C', isMainProfile: false }
            ];
            
            return (
              <div key={day.id} className="day-column">
                {profiles.map((profile, index) => {
                  // Use real tournament data for each profile (Perfil C sempre retorna 0 torneios)
                  const profileStats = profile.profileType === 'C' 
                    ? { count: 0, totalBuyIn: 0, avgBuyIn: 0, startTime: null, endTime: null, durationHours: 0, vanillaPercentage: 0, pkoPercentage: 0, mysteryPercentage: 0, normalPercentage: 0, turboPercentage: 0, hyperPercentage: 0 }
                    : getProfileStats(day.id, profile.profileType);
                  
                  const currentActiveProfile = getActiveProfile(day.id);
                  const isProfileActive = currentActiveProfile === profile.profileType;
                  
                  return (
                    <div 
                      key={profile.profileId} 
                      className={`weekly-summary-card day-card profile-card ${
                        profile.profileType === 'A' ? 'main-profile' : 
                        profile.profileType === 'B' ? 'secondary-profile' : 'day-off-profile'
                      } ${isProfileActive ? 'active' : 'inactive'} ${profile.profileType === 'C' ? 'cursor-default' : 'cursor-pointer'}`}
                      onClick={() => {
                        // Perfil C não permite adicionar torneios
                        if (profile.profileType === 'C') {
                          return;
                        }
                        
                        setSelectedDay(day.id);
                        setSelectedProfile(profile.profileType as 'A' | 'B');
                        form.setValue("dayOfWeek", day.id);
                        setIsDialogOpen(true);
                      }}
                    >
                      {profile.profileType === 'C' ? (
                        // Compact layout for "Dia OFF" profile
                        <>
                          <div className="day-header">
                            <div className="day-name">{day.name} {profile.profileName}</div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveProfile(day.id, profile.profileType);
                              }}
                              className={`radio-btn ${isProfileActive ? 'active' : 'inactive'}`}
                              title={isProfileActive ? 'Perfil ativo' : `Ativar ${profile.profileName}`}
                            >
                              <div className={`radio-dot ${isProfileActive ? 'active' : ''}`}></div>
                            </button>
                          </div>
                          <div className="empty-day-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                            <div className="empty-message" style={{ fontSize: '1rem', fontWeight: '600' }}>
                              {isProfileActive ? '🟡 Dia OFF Ativo' : '⚪ Dia OFF'}
                            </div>
                          </div>
                        </>
                      ) : (
                        // Full layout for profiles A and B
                        <>
                          <div className="day-header">
                            <div className="day-name">{day.name} {profile.profileName}</div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveProfile(day.id, profile.profileType);
                              }}
                              className={`radio-btn ${isProfileActive ? 'active' : 'inactive'}`}
                              title={isProfileActive ? 'Perfil ativo' : `Ativar ${profile.profileName}`}
                            >
                              <div className={`radio-dot ${isProfileActive ? 'active' : ''}`}></div>
                            </button>
                          </div>
                          
                          {profileStats.count > 0 ? (
                            <>
                              {/* Área 1 - Informações Principais */}
                              <div className="day-main-info">
                                <div className="day-investment">
                                  ${profileStats.totalBuyIn.toFixed(0)}
                                </div>
                                <div className="day-metrics">
                                  <div className="metrics-line">
                                    {profileStats.count} {profileStats.count === 1 ? 'torneio' : 'torneios'} | ABI: ${profileStats.avgBuyIn.toFixed(2)}
                                  </div>
                                  <div className="metrics-line">
                                    {profileStats.startTime && profileStats.endTime ? (
                                      <>
                                        {profileStats.startTime} — {profileStats.endTime} ({profileStats.durationHours.toFixed(1)}h)
                                      </>
                                    ) : (
                                      'Horários não definidos'
                                    )}
                                  </div>
                                  <div className="metrics-line">
                                    {(() => {
                                      const types = [
                                        { name: 'Vanilla', percentage: profileStats.vanillaPercentage },
                                        { name: 'PKO', percentage: profileStats.pkoPercentage },
                                        { name: 'Mystery', percentage: profileStats.mysteryPercentage }
                                      ];
                                      const predominantType = types.reduce((prev, current) => 
                                        (prev.percentage > current.percentage) ? prev : current
                                      );
                                      
                                      const speeds = [
                                        { name: 'Normal', percentage: profileStats.normalPercentage },
                                        { name: 'Turbo', percentage: profileStats.turboPercentage },
                                        { name: 'Hyper', percentage: profileStats.hyperPercentage }
                                      ];
                                      const predominantSpeed = speeds.reduce((prev, current) => 
                                        (prev.percentage > current.percentage) ? prev : current
                                      );
                                      
                                      return `${predominantType.name} (${predominantType.percentage.toFixed(0)}%) ${predominantSpeed.name} (${predominantSpeed.percentage.toFixed(0)}%)`;
                                    })()}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Área 2 - Sites */}
                              <div className="day-sites-section">
                                <div className="sites-header">Sites</div>
                                <div className="sites-list">
                                  {(() => {
                                    const profileTournaments = getTournamentsForProfile(day.id, profile.profileType);
                                    const siteStats = profileTournaments.reduce((acc: any, t: any) => {
                                      const site = t.site || 'Unknown';
                                      const buyIn = parseFloat(t.buyIn) || 0;
                                      acc[site] = (acc[site] || 0) + buyIn;
                                      return acc;
                                    }, {});
                                    
                                    return Object.entries(siteStats).map(([site, total]) => (
                                      <div key={site} className="site-item">
                                        <div className="site-name">{site}</div>
                                        <div className="site-amount">${(total as number).toFixed(0)}</div>
                                      </div>
                                    ));
                                  })()}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="empty-day-content">
                              <div className="empty-message">
                                {isProfileActive ? 'Adicionar Torneio' : (currentActiveProfile === null ? 'Ambos Perfis Inativos' : 'Perfil Inativo')}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {/* Day Planning Dialog - New 2-Column Layout */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-5xl max-h-[90vh] p-0 flex flex-col">
          
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
                const tournaments = selectedDay !== null && selectedProfile !== null ? getTournamentsForModalProfile(selectedDay, selectedProfile) : [];
                
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
                const tournaments = selectedDay !== null && selectedProfile !== null ? getTournamentsForModalProfile(selectedDay, selectedProfile) : [];
                
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

                // Field size analysis - Calculate Field Médio (guaranteed ÷ buyIn) for each tournament
                const fieldSizes = tournaments.reduce((acc, tournament) => {
                  const guaranteed = parseFloat(tournament.guaranteed || '0');
                  const buyIn = parseFloat(tournament.buyIn || '1');
                  
                  // Skip tournaments without guaranteed or buyIn data
                  if (guaranteed <= 0 || buyIn <= 0) {
                    return acc;
                  }
                  
                  // Calculate Field Médio (estimated participants)
                  const fieldMedio = Math.round(guaranteed / buyIn);
                  
                  // Categorize by field size ranges
                  if (fieldMedio < 100) acc.small++;
                  else if (fieldMedio <= 400) acc.medium++;
                  else if (fieldMedio <= 1000) acc.large++;
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
                            <span className="text-xs text-emerald-400 font-medium">${(investment as number).toFixed(0)}</span>
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
          <div className="overflow-y-auto flex-1">
          <div className="grid grid-cols-[3fr_2fr] gap-6 p-6 min-h-[300px]">
            
            {/* COLUNA ESQUERDA - Torneios Planejados (60%) */}
            <div className="flex flex-col bg-slate-900 border border-slate-600 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-white">Torneios Planejados</h3>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto">
                {(() => {
                  const tournaments = selectedDay !== null && selectedProfile !== null ? getTournamentsForModalProfile(selectedDay, selectedProfile) : [];
                  
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
                      tournaments: (breakTournaments as any[]).sort((a: any, b: any) => a.time.localeCompare(b.time))
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
                        {tournaments.map((tournament: any) => (
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
                              <div className="text-right text-xs">
                                <div className="text-sm font-bold text-emerald-400">
                                  Buy-in: ${tournament.buyIn}
                                </div>
                                {tournament.guaranteed && (
                                  <div className="text-slate-300">
                                    Garantido: ${tournament.guaranteed}
                                  </div>
                                )}
                                {tournament.guaranteed && tournament.buyIn && (
                                  <div className="text-slate-400">
                                    Field Médio: +/- {Math.round(parseFloat(tournament.guaranteed) / parseFloat(tournament.buyIn))}
                                  </div>
                                )}
                              </div>
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
                          <div className="text-right text-xs">
                            <div className="text-sm font-bold text-emerald-400">
                              Buy-in: ${suggestion.buyIn}
                            </div>
                            {suggestion.guaranteed && (
                              <div className="text-slate-300">
                                Garantido: ${suggestion.guaranteed}
                              </div>
                            )}
                            {suggestion.guaranteed && suggestion.buyIn && (
                              <div className="text-slate-400">
                                Field Médio: +/- {Math.round(parseFloat(suggestion.guaranteed) / parseFloat(suggestion.buyIn))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* Footer fixo */}
          <div className="border-t border-slate-700 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Save className="w-4 h-4" />
              {saveStatus === 'saving' ? (
                <span>Salvando...</span>
              ) : saveStatus === 'saved' ? (
                <span className="text-emerald-400">Alterações salvas automaticamente</span>
              ) : saveStatus === 'error' ? (
                <span className="text-red-400">Erro ao salvar</span>
              ) : (
                <span>Alterações salvas automaticamente</span>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
            >
              Fechar
            </Button>
          </div>

        </DialogContent>
      </Dialog>
      {/* Resto do código permanece igual */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-sm">
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
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4 max-h-[80vh] overflow-y-auto">
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

      {/* Suprema Import Modal */}
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
            } catch (err) {
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
