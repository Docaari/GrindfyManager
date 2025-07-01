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
} from "lucide-react";

const tournamentSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  site: z.string().min(1, "Site é obrigatório"),
  time: z.string().min(1, "Horário é obrigatório"),
  type: z.string().min(1, "Tipo é obrigatório"),
  speed: z.string().min(1, "Velocidade é obrigatória"),
  name: z.string().min(1, "Nome é obrigatório"),
  buyIn: z.string().min(1, "Buy-in é obrigatório"),
  guaranteed: z.string().optional(),
  templateId: z.string().optional(),
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

export default function GradePlanner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

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

  // Fetch performance analytics
  const { data: siteAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-site"],
  });

  const { data: buyinAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-buyin"],
  });

  const { data: categoryAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-category"],
  });

  // Fetch tournament library
  const { data: tournamentLibrary } = useQuery({
    queryKey: ["/api/tournament-library"],
    queryFn: async () => {
      const response = await fetch("/api/tournament-library", {
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

  const createTournamentMutation = useMutation({
    mutationFn: async (tournamentData: TournamentForm) => {
      const response = await apiRequest("POST", "/api/planned-tournaments", tournamentData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Torneio Adicionado",
        description: "Torneio foi adicionado ao seu planejamento semanal",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
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

  const onSubmit = (data: TournamentForm) => {
    createTournamentMutation.mutate(data);
  };

  const getTournamentsForDay = (dayId: number) => {
    return plannedTournaments?.filter((t: any) => t.dayOfWeek === dayId) || [];
  };

  const getInsightColor = (roi: string) => {
    const roiNum = parseFloat(roi || 0);
    if (roiNum > 15) return "border-green-500 bg-green-500/10";
    if (roiNum > 0) return "border-yellow-500 bg-yellow-500/10";
    return "border-red-500 bg-red-500/10";
  };

  const getInsightIcon = (roi: string) => {
    const roiNum = parseFloat(roi || 0);
    if (roiNum > 15) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (roiNum > 0) return <TrendingUp className="h-4 w-4 text-yellow-500" />;
    return <Target className="h-4 w-4 text-red-500" />;
  };

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
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Site Performance */}
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-poker-green" />
                Sites
              </CardTitle>
              <CardDescription className="text-gray-400">
                Melhores sites por ROI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {siteAnalytics?.slice(0, 3).map((site: any, index: number) => (
                  <div key={index} className={`p-3 rounded-lg border ${getInsightColor(site.roi)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getInsightIcon(site.roi)}
                        <span className="font-medium">{site.site}</span>
                      </div>
                      <Badge variant={parseFloat(site.roi || 0) > 0 ? "default" : "destructive"} className="text-xs">
                        {parseFloat(site.roi || 0) > 0 ? '+' : ''}{parseFloat(site.roi || 0).toFixed(1)}%
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {site.count} torneios • ${parseFloat(site.profit || 0) > 0 ? '+' : ''}{parseFloat(site.profit || 0).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Buy-in Range Performance */}
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-poker-green" />
                Faixas de Buy-in
              </CardTitle>
              <CardDescription className="text-gray-400">
                Melhores faixas de buy-in por ROI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {buyinAnalytics?.slice(0, 3).map((range: any, index: number) => (
                  <div key={index} className={`p-3 rounded-lg border ${getInsightColor(range.roi)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getInsightIcon(range.roi)}
                        <span className="font-medium">{range.buyinRange}</span>
                      </div>
                      <Badge variant={parseFloat(range.roi || 0) > 0 ? "default" : "destructive"} className="text-xs">
                        {parseFloat(range.roi || 0) > 0 ? '+' : ''}{parseFloat(range.roi || 0).toFixed(1)}%
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {range.count} torneios • ${parseFloat(range.profit || 0) > 0 ? '+' : ''}{parseFloat(range.profit || 0).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tournament Type Performance */}
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-poker-green" />
                Tipos de Torneio
              </CardTitle>
              <CardDescription className="text-gray-400">
                Performance por categoria de torneio
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {categoryAnalytics?.slice(0, 3).map((category: any, index: number) => (
                  <div key={index} className={`p-3 rounded-lg border ${getInsightColor(category.roi)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getInsightIcon(category.roi)}
                        <span className="font-medium">{category.category}</span>
                      </div>
                      <Badge variant={parseFloat(category.roi || 0) > 0 ? "default" : "destructive"} className="text-xs">
                        {parseFloat(category.roi || 0) > 0 ? '+' : ''}{parseFloat(category.roi || 0).toFixed(1)}%
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {category.count} torneios • ${parseFloat(category.profit || 0) > 0 ? '+' : ''}{parseFloat(category.profit || 0).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Weekly Planning Section */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-poker-green" />
          Planejamento Semanal
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
          {weekDays.map((day) => (
            <Card 
              key={day.id} 
              className="bg-poker-surface border-gray-700 cursor-pointer hover:border-poker-green transition-colors"
              onClick={() => {
                setSelectedDay(day.id);
                setIsDialogOpen(true);
              }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-white">{day.name}</CardTitle>
                  <Badge variant="secondary" className="bg-poker-green text-white">
                    {getTournamentsForDay(day.id).length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {getTournamentsForDay(day.id).slice(0, 2).map((tournament: any) => (
                    <div key={tournament.id} className="p-2 bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-3 w-3 text-poker-green" />
                        <span className="text-xs font-medium">{tournament.time}</span>
                        <Badge variant="outline" className="text-xs">
                          {tournament.site}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-300 truncate">{tournament.name}</p>
                    </div>
                  ))}
                  {getTournamentsForDay(day.id).length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">
                      Nenhum torneio planejado
                    </p>
                  )}
                  {getTournamentsForDay(day.id).length > 2 && (
                    <p className="text-xs text-poker-green text-center">
                      +{getTournamentsForDay(day.id).length - 2} mais...
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Day Planning Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-6xl max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-xl text-poker-green">
              {selectedDay !== null ? weekDays[selectedDay].name : ''} - Planejamento de Torneios
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Gerencie os torneios do dia. Use as sugestões inteligentes para preenchimento rápido.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-h-[65vh] overflow-hidden">
            {/* Tournament List - Left Column */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-poker-green" />
                Torneios Planejados
              </h4>
              
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {selectedDay !== null && getTournamentsForDay(selectedDay)
                  .sort((a: any, b: any) => a.time.localeCompare(b.time))
                  .map((tournament: any) => (
                  <div key={tournament.id} className="p-4 bg-gray-800 rounded-lg border border-gray-600">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-poker-green" />
                        <span className="font-semibold">{tournament.time}</span>
                        <Badge variant="outline" className="text-xs">
                          {tournament.site}
                        </Badge>
                      </div>
                    </div>
                    <h5 className="font-medium text-white mb-1">{tournament.name}</h5>
                    <div className="flex items-center justify-between text-sm text-gray-400">
                      <span>{tournament.type} • {tournament.speed}</span>
                      <span className="font-medium">${parseFloat(tournament.buyIn).toFixed(2)}</span>
                    </div>
                    {tournament.guaranteed && (
                      <p className="text-xs text-poker-green mt-1">
                        Garantido: ${parseFloat(tournament.guaranteed).toFixed(2)}
                      </p>
                    )}
                  </div>
                ))}
                {selectedDay !== null && getTournamentsForDay(selectedDay).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Nenhum torneio planejado para este dia</p>
                    <p className="text-sm">Use o formulário ao lado para adicionar torneios</p>
                  </div>
                )}
              </div>
            </div>

            {/* Add Tournament Form - Right Column */}
            <div className="space-y-4 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Plus className="h-5 w-5 text-poker-green" />
                  Adicionar Torneio
                </h4>
              </div>

              {/* Smart Suggestions */}
              {getSuggestedTournaments().length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm text-poker-green">💡 Sugestões Inteligentes</Label>
                  <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                    {getSuggestedTournaments().map((suggestion: any, index: number) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        onClick={() => handleTemplateSelect(suggestion)}
                        className="justify-start text-left h-auto p-2 border-gray-600 hover:border-poker-green"
                      >
                        <div className="flex flex-col items-start">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs">{suggestion.site}</Badge>
                            <span className="text-xs text-poker-green">{suggestion.volume} jogados</span>
                          </div>
                          <span className="text-sm truncate">{suggestion.groupName}</span>
                          <span className="text-xs text-gray-400">{suggestion.category} • {suggestion.speed}</span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="site"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Site</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-gray-800 border-gray-600">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-gray-800 border-gray-600">
                              {sites.map((site) => (
                                <SelectItem key={site} value={site}>
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
                          <FormLabel>Horário</FormLabel>
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
                              <SelectTrigger className="bg-gray-800 border-gray-600">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-gray-800 border-gray-600">
                              {types.map((type) => (
                                <SelectItem key={type} value={type}>
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
                              <SelectTrigger className="bg-gray-800 border-gray-600">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-gray-800 border-gray-600">
                              {speeds.map((speed) => (
                                <SelectItem key={speed} value={speed}>
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
                        <FormLabel>Nome</FormLabel>
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

                  <div className="flex justify-end gap-3 pt-4">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsDialogOpen(false)}
                      className="border-gray-600 text-white hover:bg-gray-800"
                    >
                      Cancelar
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createTournamentMutation.isPending}
                      className="bg-poker-green hover:bg-poker-green-light text-white"
                    >
                      {createTournamentMutation.isPending ? "Salvando..." : "Adicionar Torneio"}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}