import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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

export default function GradePlanner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [pendingTournaments, setPendingTournaments] = useState<TournamentForm[]>([]); // Local state for unsaved tournaments
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
      const promises = tournaments.map(tournament => 
        apiRequest("POST", "/api/planned-tournaments", tournament).then(res => res.json())
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
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
      toast({
        title: "Erro ao Salvar",
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
    form.setValue("type", template.category || "");
    form.setValue("speed", template.speed || "");
    form.setValue("name", template.groupName || "");
    form.setValue("buyIn", template.avgBuyin?.toString() || "");
  };

  // Smart suggestion system
  const getSuggestedTournaments = () => {
    if (!tournamentLibrary) return [];
    
    const currentSite = form.watch("site");
    const currentType = form.watch("type");
    const currentSpeed = form.watch("speed");
    
    return tournamentLibrary
      .filter((tournament: any) => {
        // Filter based on filled fields
        if (currentSite && tournament.site !== currentSite) return false;
        if (currentType && tournament.category !== currentType) return false;
        if (currentSpeed && tournament.speed !== currentSpeed) return false;
        return true;
      })
      .sort((a: any, b: any) => {
        // Sort by volume (most played tournaments first)
        return parseInt(b.volume || 0) - parseInt(a.volume || 0);
      })
      .slice(0, 5); // Top 5 suggestions
  };

  // Generate tournament name based on the new format
  const generateTournamentName = (data: TournamentForm) => {
    if (data.name && data.name.trim()) {
      return data.name;
    }
    
    // Format: $109 25.000 WPN (Type BuyIn Guaranteed Site)
    const buyIn = `$${parseFloat(data.buyIn).toFixed(0)}`;
    const guaranteed = data.guaranteed ? ` ${parseFloat(data.guaranteed).toLocaleString('pt-BR')}` : '';
    const site = data.site;
    
    return `${data.type} ${buyIn}${guaranteed} ${site}`;
  };

  const onSubmit = (data: TournamentForm) => {
    // Add to pending tournaments list (local state)
    const tournamentWithId = {
      ...data,
      id: `temp-${Date.now()}`, // Temporary ID for local display
      name: generateTournamentName(data)
    };
    
    setPendingTournaments(prev => [...prev, data]);
    setHasUnsavedChanges(true);
    
    // Reset form for next tournament
    form.reset();
    if (selectedDay !== null) {
      form.setValue("dayOfWeek", selectedDay);
    }
    
    toast({
      title: "Torneio Adicionado à Lista",
      description: "Clique em 'Salvar Alterações' para confirmar",
    });
  };

  // Function to save all pending tournaments
  const handleSaveAll = () => {
    if (pendingTournaments.length > 0) {
      saveAllTournamentsMutation.mutate(pendingTournaments);
    }
  };

  const getTournamentsForDay = (dayId: number) => {
    const savedTournaments = plannedTournaments?.filter((t: any) => t.dayOfWeek === dayId) || [];
    const pendingForDay = pendingTournaments.filter((t: any) => t.dayOfWeek === dayId);
    
    // Combine saved and pending tournaments, add temp IDs to pending ones
    const pendingWithIds = pendingForDay.map((t, index) => ({
      ...t,
      id: `temp-${dayId}-${index}`,
      name: generateTournamentName(t),
      isPending: true
    }));
    
    return [...savedTournaments, ...pendingWithIds];
  };

  // Calculate tournament field size estimate
  const calculateEstimatedFieldSize = (guaranteed: string, buyIn: string) => {
    if (!guaranteed || !buyIn) return 0;
    const guaranteedNum = parseFloat(guaranteed);
    const buyInNum = parseFloat(buyIn);
    const rakeAdjustedBuyIn = buyInNum * 0.9; // Assuming 10% rake
    return Math.round(guaranteedNum / rakeAdjustedBuyIn);
  };

  // Calculate comprehensive day statistics
  const getDayStats = (dayId: number) => {
    const tournaments = getTournamentsForDay(dayId);
    const totalTournaments = tournaments.length;
    
    if (totalTournaments === 0) {
      return {
        count: 0,
        avgBuyIn: 0,
        totalBuyIns: 0,
        vanillaPercentage: 0,
        pkoPercentage: 0,
        mysteryPercentage: 0,
        normalPercentage: 0,
        turboPercentage: 0,
        hyperPercentage: 0,
        avgFieldSize: 0
      };
    }
    
    const totalBuyIns = tournaments.reduce((sum, t) => sum + parseFloat(t.buyIn || 0), 0);
    const avgBuyIn = totalBuyIns / totalTournaments;
    
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
    
    return {
      count: totalTournaments,
      avgBuyIn,
      totalBuyIns,
      vanillaPercentage: (vanillaCount / totalTournaments) * 100,
      pkoPercentage: (pkoCount / totalTournaments) * 100,
      mysteryPercentage: (mysteryCount / totalTournaments) * 100,
      normalPercentage: (normalCount / totalTournaments) * 100,
      turboPercentage: (turboCount / totalTournaments) * 100,
      hyperPercentage: (hyperCount / totalTournaments) * 100,
      avgFieldSize: Math.round(avgFieldSize)
    };
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
    <div className="p-6 text-white">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Grade Planner</h2>
        <p className="text-gray-400">Planeje sua grade semanal com insights baseados em performance</p>
      </div>
      {/* Performance Insights Section */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-poker-green" />
          Insights de Performance
        </h3>
        
        {/* Single Row with 5 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Site Performance */}
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-poker-green" />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">Top 3 Sites (ICD)</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <div className="text-sm">
                        <p className="font-semibold mb-1">Ordenado por ICD</p>
                        <p>Combina lucro médio com volume para rankeamento mais confiável</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredSiteAnalytics.length > 0 ? (
                  filteredSiteAnalytics.slice(0, 3).map((site: any, index: number) => (
                    <div key={index} className={`p-2 rounded border ${getInsightColor(site.roi)}`}>
                      <div className="mb-1">
                        <span className="font-medium text-xs text-white">{site.site}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-400">ICD: </span>
                          <span className="text-green-400 font-semibold">{site.icd?.toFixed(2) || '0.00'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">ROI: </span>
                          <span className={`font-semibold ${Number(site.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {Number(site.roi || 0).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Vol: </span>
                          <span className="text-white">{site.volume}x</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Profit: </span>
                          <span className={`font-semibold ${Number(site.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ${Number(site.profit || 0).toFixed(0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Necessário 100+ jogos</p>
                    <p className="text-xs">por site</p>
                  </div>
                )}
                
                {/* Ver Mais Button */}
                {filteredSiteAnalytics.length > 3 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-gray-400 hover:text-white">
                        <Eye className="h-3 w-3 mr-1" />
                        Ver mais ({filteredSiteAnalytics.length - 3})
                      </Button>
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
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tournament Type Performance */}
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-poker-green" />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">Top 3 Tipos (ICD)</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <div className="text-sm">
                        <p className="font-semibold mb-1">Ordenado por ICD</p>
                        <p>Combina lucro médio com volume para rankeamento mais confiável</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredCategoryAnalytics.length > 0 ? (
                  filteredCategoryAnalytics.slice(0, 3).map((category: any, index: number) => (
                    <div key={index} className={`p-2 rounded border ${getInsightColor(category.roi)}`}>
                      <div className="mb-1">
                        <span className="font-medium text-xs text-white">{category.category}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-400">ICD: </span>
                          <span className="text-green-400 font-semibold">{category.icd?.toFixed(2) || '0.00'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">ROI: </span>
                          <span className={`font-semibold ${Number(category.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {Number(category.roi || 0).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Vol: </span>
                          <span className="text-white">{category.volume}x</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Profit: </span>
                          <span className={`font-semibold ${Number(category.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ${Number(category.profit || 0).toFixed(0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Necessário 100+ jogos</p>
                    <p className="text-xs">por tipo</p>
                  </div>
                )}
                
                {/* Ver Mais Button */}
                {filteredCategoryAnalytics.length > 3 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-gray-400 hover:text-white">
                        <Eye className="h-3 w-3 mr-1" />
                        Ver mais ({filteredCategoryAnalytics.length - 3})
                      </Button>
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
                )}
              </div>
            </CardContent>
          </Card>

          {/* Buy-in Range Performance */}
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-poker-green" />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">Top 3 Faixas (ICD)</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <div className="text-sm">
                        <p className="font-semibold mb-1">Ordenado por ICD</p>
                        <p>Combina lucro médio com volume para rankeamento mais confiável</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredBuyinAnalytics.length > 0 ? (
                  filteredBuyinAnalytics
                    .slice(0, 3)
                    .map((range: any, index: number) => (
                      <div key={index} className={`p-2 rounded border ${getInsightColor(range.roi)}`}>
                        <div className="mb-1">
                          <span className="font-medium text-xs text-white">{range.buyinRange}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-400">ICD: </span>
                            <span className="text-green-400 font-semibold">{range.icd?.toFixed(2) || '0.00'}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">ROI: </span>
                            <span className={`font-semibold ${Number(range.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {Number(range.roi || 0).toFixed(1)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">Vol: </span>
                            <span className="text-white">{range.volume}x</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Profit: </span>
                            <span className={`font-semibold ${Number(range.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              ${Number(range.profit || 0).toFixed(0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Necessário 100+ jogos</p>
                    <p className="text-xs">por faixa</p>
                  </div>
                )}
                
                {/* Ver Mais Button */}
                {filteredBuyinAnalytics.length > 3 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-gray-400 hover:text-white">
                        <Eye className="h-3 w-3 mr-1" />
                        Ver mais ({filteredBuyinAnalytics.length - 3})
                      </Button>
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
                )}
              </div>
            </CardContent>
          </Card>

          {/* Dicas Rápidas */}
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <Target className="h-4 w-4 text-poker-green" />
                Dicas Rápidas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Focus Section */}
                <div className="p-2 rounded border border-green-500/30 bg-green-500/10">
                  <div className="flex items-center gap-1 mb-2">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    <span className="font-medium text-xs text-green-400">Focar em:</span>
                  </div>
                  {filteredSiteAnalytics
                    .filter((site: any) => Number(site.roi || 0) > 10)
                    .slice(0, 1)
                    .map((site: any, index: number) => (
                      <div key={index} className="mb-2">
                        <div className="text-xs text-gray-300">Site: <span className="text-green-400 font-medium">{site.site}</span></div>
                      </div>
                    ))}
                  {filteredCategoryAnalytics
                    .filter((cat: any) => Number(cat.roi || 0) > 10)
                    .slice(0, 1)
                    .map((cat: any, index: number) => (
                      <div key={`cat-${index}`} className="mb-2">
                        <div className="text-xs text-gray-300">Tipo: <span className="text-green-400 font-medium">{cat.category}</span></div>
                      </div>
                    ))}
                  {filteredBuyinAnalytics
                    .filter((range: any) => Number(range.roi || 0) > 10)
                    .slice(0, 1)
                    .map((range: any, index: number) => (
                      <div key={`buyin-${index}`} className="mb-2">
                        <div className="text-xs text-gray-300">ABI: <span className="text-green-400 font-medium">{range.buyinRange}</span></div>
                      </div>
                    ))}
                  <p className="text-xs text-gray-400 leading-tight">
                    Sua melhor performance está nessas categorias. Continue focando nelas.
                  </p>
                </div>

                {/* Avoid Section */}
                <div className="p-2 rounded border border-red-500/30 bg-red-500/10">
                  <div className="flex items-center gap-1 mb-2">
                    <X className="h-3 w-3 text-red-500" />
                    <span className="font-medium text-xs text-red-400">Evitar:</span>
                  </div>
                  {filteredSiteAnalytics
                    .filter((site: any) => Number(site.roi || 0) < -5)
                    .slice(0, 1)
                    .map((site: any, index: number) => (
                      <div key={index} className="mb-2">
                        <div className="text-xs text-gray-300">Site: <span className="text-red-400 font-medium">{site.site}</span></div>
                      </div>
                    ))}
                  {filteredCategoryAnalytics
                    .filter((cat: any) => Number(cat.roi || 0) < -5)
                    .slice(0, 1)
                    .map((cat: any, index: number) => (
                      <div key={`cat-avoid-${index}`} className="mb-2">
                        <div className="text-xs text-gray-300">Tipo: <span className="text-red-400 font-medium">{cat.category}</span></div>
                      </div>
                    ))}
                  {filteredBuyinAnalytics
                    .filter((range: any) => Number(range.roi || 0) < -5)
                    .slice(0, 1)
                    .map((range: any, index: number) => (
                      <div key={`buyin-avoid-${index}`} className="mb-2">
                        <div className="text-xs text-gray-300">ABI: <span className="text-red-400 font-medium">{range.buyinRange}</span></div>
                      </div>
                    ))}
                  <p className="text-xs text-gray-400 leading-tight">
                    Performance negativa nessas áreas. Considere revisar sua estratégia.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Melhores Torneios */}
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-poker-green" />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">Top 3 Torneios (ICD)</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <div className="text-sm">
                        <p className="font-semibold mb-2">ICD - Índice de Confiança de Desempenho</p>
                        <p className="mb-2">Fórmula: Lucro Médio × (1 - e^(-0.1 × Volume))</p>
                        <p>Combina lucro médio com confiabilidade baseada no volume de jogos. Quanto mais jogos, maior a confiança no resultado.</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredTournamentLibrary.length > 0 ? (
                  filteredTournamentLibrary
                    .sort((a: any, b: any) => (b.icd || 0) - (a.icd || 0)) // Garantir ordenação por ICD
                    .slice(0, 3) // Pegar os top 3
                    .map((tournament: any, index: number) => (
                      <div key={index} className="p-2 rounded border border-green-500/30 bg-green-500/10">
                        <div className="mb-1">
                          <span className="font-medium text-xs text-white truncate block">
                            {tournament.groupName || tournament.name}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-400">ICD: </span>
                            <span className="text-green-400 font-semibold">{tournament.icd?.toFixed(2) || '0.00'}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">ROI: </span>
                            <span className={`font-semibold ${Number(tournament.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {Number(tournament.roi || 0).toFixed(1)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">Vol: </span>
                            <span className="text-white">{tournament.volume || tournament.count}x</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Profit: </span>
                            <span className={`font-semibold ${Number(tournament.avgProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              ${Number(tournament.avgProfit || 0).toFixed(0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Necessário 50+ jogos</p>
                    <p className="text-xs">por torneio</p>
                  </div>
                )}
                
                {/* Ver Mais Button */}
                {filteredTournamentLibrary.length > 3 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-gray-400 hover:text-white">
                        <Eye className="h-3 w-3 mr-1" />
                        Ver mais ({filteredTournamentLibrary.filter((t: any) => (t.volume || t.count) >= 50).length - 3})
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-poker-surface border-gray-700 max-w-3xl max-h-[80vh]">
                      <DialogHeader>
                        <DialogTitle className="text-white">Todos os Torneios (Ordenado por ICD)</DialogTitle>
                        <DialogDescription className="text-gray-400">
                          Ranking completo de torneios baseado no Índice de Confiança de Desempenho
                        </DialogDescription>
                        <div className="text-sm text-yellow-400 bg-yellow-500/10 p-2 rounded border border-yellow-500/30 mt-2">
                          📋 Nota: Exibindo apenas torneios com 50+ jogos registrados para maior confiabilidade estatística
                        </div>
                      </DialogHeader>
                      <ScrollArea className="h-[60vh] pr-4">
                        <div className="space-y-3">
                          {filteredTournamentLibrary
                            .filter((tournament: any) => (tournament.volume || tournament.count) >= 50)
                            .map((tournament: any, index: number) => (
                            <div key={index} className="p-4 rounded-lg border border-gray-700 bg-gray-800/50">
                              <div className="flex justify-between items-start mb-3">
                                <div>
                                  <h3 className="font-semibold text-white">{tournament.groupName || tournament.name}</h3>
                                  <div className="flex gap-2 mt-1">
                                    <Badge variant="outline" className="text-xs">{tournament.site}</Badge>
                                    <Badge variant="outline" className="text-xs">{tournament.category}</Badge>
                                  </div>
                                </div>
                                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                  #{index + 1}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div>
                                  <div className="text-gray-400">ICD</div>
                                  <div className="text-yellow-400 font-bold text-lg">{tournament.icd?.toFixed(2) || calculateICD(tournament.avgProfit || 0, tournament.volume || tournament.count || 0).toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-gray-400">Volume</div>
                                  <div className="text-white font-semibold">{tournament.volume || tournament.count} jogos</div>
                                </div>
                                <div>
                                  <div className="text-gray-400">Profit Total</div>
                                  <div className={`font-semibold ${Number(tournament.totalProfit || tournament.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    ${Number(tournament.totalProfit || tournament.profit || 0).toFixed(0)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-gray-400">ROI</div>
                                  <div className={`font-semibold ${Number(tournament.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {Number(tournament.roi || 0).toFixed(1)}%
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* ICD Explanation Note */}
        <div className="mt-6 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-yellow-500/20 text-yellow-400 mt-0.5">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div>
              <h4 className="font-semibold text-yellow-400 mb-2">📊 Sobre o Índice de Confiança de Desempenho (ICD)</h4>
              <div className="text-sm text-gray-300 space-y-2">
                <p>
                  <strong>O que é:</strong> O ICD combina seu lucro médio com o volume de jogos para criar um rankeamento mais confiável que o ROI isolado.
                </p>
                <p>
                  <strong>Fórmula:</strong> <code className="bg-gray-800 px-2 py-1 rounded text-yellow-400">Lucro Médio × (1 - e^(-0.1 × Volume))</code>
                </p>
                <p>
                  <strong>Por que usar:</strong> Sites/torneios com poucos jogos podem ter ROI alto por sorte. O ICD penaliza amostras pequenas, priorizando resultados com mais dados estatísticos.
                </p>
                <p>
                  <strong>Exemplo:</strong> Um torneio com ROI 50% em 10 jogos terá ICD menor que um torneio com ROI 20% em 100 jogos, pois o segundo é mais confiável.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Weekly Planning Section */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-poker-green" />
          Planejamento Semanal
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
          {weekDays.map((day) => {
            const stats = getDayStats(day.id);
            return (
              <Card 
                key={day.id} 
                className="bg-poker-surface border-gray-700 cursor-pointer hover:border-poker-green transition-colors"
                onClick={() => {
                  setSelectedDay(day.id);
                  form.setValue("dayOfWeek", day.id);
                  setIsDialogOpen(true);
                }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg text-white">{day.name}</CardTitle>
                    <Badge variant="secondary" className="bg-poker-green text-white">
                      {stats.count}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {stats.count > 0 ? (
                    <div className="space-y-2">
                      {/* Tournament Types Row */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                          <div className="text-gray-400">Vanilla</div>
                          <div className="text-white font-semibold">{stats.vanillaPercentage.toFixed(0)}%</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-400">PKO</div>
                          <div className="text-white font-semibold">{stats.pkoPercentage.toFixed(0)}%</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-400">Mystery</div>
                          <div className="text-white font-semibold">{stats.mysteryPercentage.toFixed(0)}%</div>
                        </div>
                      </div>

                      {/* Speed Types Row */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                          <div className="text-gray-400">Normal</div>
                          <div className="text-white font-semibold">{stats.normalPercentage.toFixed(0)}%</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-400">Turbo</div>
                          <div className="text-white font-semibold">{stats.turboPercentage.toFixed(0)}%</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-400">Hyper</div>
                          <div className="text-white font-semibold">{stats.hyperPercentage.toFixed(0)}%</div>
                        </div>
                      </div>

                      {/* Separator */}
                      <div className="border-t border-gray-600 pt-2">
                        {/* ABI Médio */}
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">ABI Médio</span>
                          <span className="text-xs font-semibold text-poker-green">
                            ${stats.avgBuyIn.toFixed(2)}
                          </span>
                        </div>
                        
                        {/* Média de Participantes */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">Média Participantes</span>
                          <span className="text-xs font-semibold text-blue-400">
                            {stats.avgFieldSize || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="w-8 h-8 mx-auto mb-2 bg-gray-700 rounded-full flex items-center justify-center">
                        <Plus className="h-4 w-4 text-gray-500" />
                      </div>
                      <p className="text-xs text-gray-500">Nenhum torneio</p>
                      <p className="text-xs text-gray-500">planejado</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
      {/* Day Planning Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-7xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-xl text-poker-green">
              {selectedDay !== null ? weekDays.find(d => d.id === selectedDay)?.name : ''} - Planejamento de Torneios
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Gerencie os torneios do dia. Use as sugestões inteligentes para preenchimento rápido.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[75vh] overflow-hidden">
            {/* Tournament List - Left Column */}
            <div className="space-y-4 flex flex-col">
              <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-poker-green" />
                Torneios Planejados
              </h4>
              
              <div className="space-y-2 flex-1 overflow-y-auto pr-2">
                {selectedDay !== null && createTournamentListWithBreaks(getTournamentsForDay(selectedDay)).map((item: any) => {
                  if (item.type === 'break') {
                    return (
                      <div key={item.id} className="flex items-center gap-2 py-1">
                        <div className="flex-1 h-px bg-gray-600"></div>
                        <span className="text-xs text-gray-500 px-2">{item.time}</span>
                        <div className="flex-1 h-px bg-gray-600"></div>
                      </div>
                    );
                  } else {
                    // Tournament card - compact design with pending indicator
                    const isPending = item.isPending;
                    return (
                      <div key={item.id} className={`p-3 rounded-lg border transition-colors relative ${
                        isPending 
                          ? 'bg-yellow-900/20 border-yellow-600/50 hover:border-yellow-500' 
                          : 'bg-gray-800 border-gray-600 hover:border-gray-500'
                      }`}>
                        {isPending && (
                          <div className="absolute top-1 right-1">
                            <Badge className="text-xs bg-yellow-600 text-white px-1.5 py-0.5">
                              Pendente
                            </Badge>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-poker-green flex-shrink-0" />
                            <span className="font-semibold text-sm text-white">{item.time}</span>
                            <Badge className={`text-xs px-1.5 py-0.5 text-white ${getSiteColor(item.site)}`}>
                              {item.site}
                            </Badge>
                          </div>
                          <span className="font-semibold text-sm text-poker-green">${parseFloat(item.buyIn).toFixed(2)}</span>
                        </div>
                        
                        <h5 className="font-medium text-white text-sm mb-1 leading-tight pr-12">{item.name}</h5>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-200">
                              {item.type}
                            </Badge>
                            <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-200">
                              {item.speed}
                            </Badge>
                          </div>
                          {item.guaranteed && (
                            <span className="text-xs text-poker-green font-medium">
                              GTD: ${parseFloat(item.guaranteed).toFixed(0)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }
                })}
                {selectedDay !== null && getTournamentsForDay(selectedDay).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Nenhum torneio planejado para este dia</p>
                    <p className="text-xs text-gray-400">Use o formulário ao lado para adicionar torneios</p>
                  </div>
                )}
              </div>
            </div>

            {/* Add Tournament Form - Right Column */}
            <div className="space-y-4 flex flex-col h-full">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Plus className="h-5 w-5 text-poker-green" />
                  Adicionar Torneio
                </h4>
              </div>

              {/* Smart Suggestions */}
              {getSuggestedTournaments().length > 0 && (
                <div className="space-y-2 flex-shrink-0">
                  <Label className="text-sm text-poker-green">💡 Sugestões Inteligentes</Label>
                  <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2">
                    {getSuggestedTournaments().map((suggestion: any, index: number) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        onClick={() => handleTemplateSelect(suggestion)}
                        className="justify-start text-left h-auto p-3 border-gray-600 hover:border-poker-green bg-gray-800 hover:bg-gray-750 text-white"
                      >
                        <div className="flex flex-col items-start w-full">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs bg-poker-green text-white px-1.5 py-0.5">
                              {suggestion.site}
                            </Badge>
                            <Badge variant="outline" className="text-xs border-gray-500 text-gray-300 px-1.5 py-0.5">
                              {suggestion.category}
                            </Badge>
                          </div>
                          <span className="text-xs font-medium text-white mb-1">{suggestion.groupName}</span>
                          <span className="text-xs text-gray-400">Volume: {suggestion.volume} • ROI: {Number(suggestion.roi || 0).toFixed(1)}%</span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 flex-1 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="site"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Site</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                                <SelectValue placeholder="Selecione..." className="text-white" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-gray-800 border-gray-600">
                              {sites.map((site) => (
                                <SelectItem key={site} value={site} className="text-white">
                                  {site}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="time"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Horário de Registro</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="time" 
                              className="bg-gray-800 border-gray-600"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                                <SelectValue placeholder="Selecione..." className="text-white" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-gray-800 border-gray-600">
                              {types.map((type) => (
                                <SelectItem key={type} value={type} className="text-white">
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="speed"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Velocidade</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                                <SelectValue placeholder="Selecione..." className="text-white" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-gray-800 border-gray-600">
                              {speeds.map((speed) => (
                                <SelectItem key={speed} value={speed} className="text-white">
                                  {speed}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome (opcional)</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="Nome do torneio..." 
                            className="bg-gray-800 border-gray-600"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="buyIn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Buy-in ($)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              step="0.01"
                              placeholder="55.00" 
                              className="bg-gray-800 border-gray-600"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="guaranteed"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Garantido ($) - Opcional</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              step="0.01"
                              placeholder="100000.00" 
                              className="bg-gray-800 border-gray-600"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-between pt-4 border-t border-gray-700 mt-4 flex-shrink-0">
                    <div className="flex gap-3">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => {
                          setPendingTournaments([]);
                          setHasUnsavedChanges(false);
                          setIsDialogOpen(false);
                        }}
                        className="border-gray-500 text-gray-200 hover:bg-gray-700 hover:border-gray-400 bg-gray-800"
                      >
                        Fechar
                      </Button>
                      {hasUnsavedChanges && (
                        <Button 
                          type="button"
                          onClick={handleSaveAll}
                          disabled={saveAllTournamentsMutation.isPending}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6"
                        >
                          {saveAllTournamentsMutation.isPending ? "Salvando..." : `Salvar Alterações (${pendingTournaments.length})`}
                        </Button>
                      )}
                    </div>
                    <Button 
                      type="submit" 
                      className="bg-poker-green hover:bg-green-600 text-white font-medium px-6"
                    >
                      Adicionar à Lista
                    </Button>
                  </div>
                </form>
              </Form>

              {/* Day Statistics */}
              {selectedDay !== null && (
                <div className="space-y-3 flex-shrink-0 mt-4">
                  <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-poker-green" />
                    Estatísticas do Dia
                  </h4>
                  
                  <Card className="bg-gray-800 border-gray-600">
                    <CardContent className="p-4">
                      {(() => {
                        const stats = getDayStats(selectedDay);
                        return stats.count > 0 ? (
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            {/* Tournament Types */}
                            <div className="space-y-2">
                              <div className="text-gray-400 font-medium mb-2">Tipos de Torneio</div>
                              <div className="flex justify-between">
                                <span className="text-gray-300">Vanilla:</span>
                                <span className="text-white font-semibold">{stats.vanillaPercentage.toFixed(1)}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-300">PKO:</span>
                                <span className="text-white font-semibold">{stats.pkoPercentage.toFixed(1)}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-300">Mystery:</span>
                                <span className="text-white font-semibold">{stats.mysteryPercentage.toFixed(1)}%</span>
                              </div>
                            </div>

                            {/* Tournament Speeds */}
                            <div className="space-y-2">
                              <div className="text-gray-400 font-medium mb-2">Velocidades</div>
                              <div className="flex justify-between">
                                <span className="text-gray-300">Normal:</span>
                                <span className="text-white font-semibold">{stats.normalPercentage.toFixed(1)}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-300">Turbo:</span>
                                <span className="text-white font-semibold">{stats.turboPercentage.toFixed(1)}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-300">Hyper:</span>
                                <span className="text-white font-semibold">{stats.hyperPercentage.toFixed(1)}%</span>
                              </div>
                            </div>

                            {/* Average Metrics */}
                            <div className="col-span-2 space-y-2 border-t border-gray-600 pt-3 mt-3">
                              <div className="flex justify-between">
                                <span className="text-gray-300">ABI Médio:</span>
                                <span className="text-poker-green font-semibold">${stats.avgBuyIn.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-300">Média de Participantes:</span>
                                <span className="text-blue-400 font-semibold">{stats.avgFieldSize || 'N/A'}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-gray-500">
                            <div className="w-8 h-8 mx-auto mb-2 bg-gray-700 rounded-full flex items-center justify-center">
                              <BarChart3 className="h-4 w-4 text-gray-500" />
                            </div>
                            <p className="text-xs">Adicione torneios para ver estatísticas</p>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}