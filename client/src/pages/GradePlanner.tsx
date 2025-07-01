import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Calendar, 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  BarChart3, 
  Clock,
  DollarSign,
  Trophy,
  Users
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const tournamentSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  site: z.string().min(1, "Site é obrigatório"),
  time: z.string().min(1, "Horário é obrigatório"),
  type: z.string().min(1, "Tipo é obrigatório"),
  speed: z.string().min(1, "Velocidade é obrigatória"),
  description: z.string().min(1, "Descrição é obrigatória"),
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
      description: "",
      buyIn: "",
      guaranteed: "",
    },
  });

  // Fetch performance insights by site, buy-in range, and type
  const { data: siteAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-site"],
    queryFn: async () => {
      const response = await fetch("/api/analytics/by-site?period=30d", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch site analytics");
      return response.json();
    },
  });

  const { data: buyinAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-buyin"],
    queryFn: async () => {
      const response = await fetch("/api/analytics/by-buyin?period=30d", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch buyin analytics");
      return response.json();
    },
  });

  const { data: categoryAnalytics } = useQuery({
    queryKey: ["/api/analytics/by-category"],
    queryFn: async () => {
      const response = await fetch("/api/analytics/by-category?period=30d", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch category analytics");
      return response.json();
    },
  });

  // Fetch tournament library for templates
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
    form.setValue("description", template.groupName || "");
    form.setValue("buyIn", template.avgBuyin?.toString() || "");
  };

  const onSubmit = (data: TournamentForm) => {
    createTournamentMutation.mutate(data);
  };

  const getTournamentsForDay = (dayOfWeek: number) => {
    return plannedTournaments?.filter((t: any) => t.dayOfWeek === dayOfWeek) || [];
  };

  const getInsightColor = (roi: any) => {
    const roiNum = parseFloat(roi || 0);
    if (roiNum > 10) return "text-green-400 border-green-400";
    if (roiNum < -5) return "text-red-400 border-red-400";
    return "text-yellow-400 border-yellow-400";
  };

  const getInsightIcon = (roi: any) => {
    const roiNum = parseFloat(roi || 0);
    if (roiNum > 10) return <TrendingUp className="h-4 w-4" />;
    if (roiNum < -5) return <TrendingDown className="h-4 w-4" />;
    return <Target className="h-4 w-4" />;
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
                <Trophy className="h-5 w-5 text-poker-green" />
                Melhores Sites
              </CardTitle>
              <CardDescription className="text-gray-400">
                Sites com melhor ROI nos últimos 30 dias
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

      {/* Weekly Schedule Section */}
      <div>
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-poker-green" />
          Planejamento Semanal
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
          {weekDays.map((day) => (
            <Card key={day.id} className="bg-poker-surface border-gray-700">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-white">{day.name}</CardTitle>
                  <Button
                    onClick={() => handleAddTournament(day.id)}
                    size="sm"
                    className="bg-poker-green hover:bg-poker-green-light text-white h-7 w-7 p-0"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {getTournamentsForDay(day.id).map((tournament: any) => (
                    <div key={tournament.id} className="p-3 bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-3 w-3 text-poker-green" />
                        <span className="text-sm font-medium">{tournament.time}</span>
                        <Badge variant="outline" className="text-xs">
                          {tournament.site}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-300 mb-1">{tournament.description}</p>
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>{tournament.type} • {tournament.speed}</span>
                        <span>${parseFloat(tournament.buyIn).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                  {getTournamentsForDay(day.id).length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">
                      Nenhum torneio planejado
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Add Tournament Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Adicionar Torneio - {selectedDay !== null ? weekDays[selectedDay].name : ''}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Configure um novo torneio para o seu planejamento semanal
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Template Selection */}
              {tournamentLibrary && tournamentLibrary.length > 0 && (
                <div className="space-y-2">
                  <Label>Usar Template da Tournament Library (opcional)</Label>
                  <Select onValueChange={(value) => {
                    const template = tournamentLibrary.find((t: any) => t.id === value);
                    if (template) handleTemplateSelect(template);
                  }}>
                    <SelectTrigger className="bg-gray-800 border-gray-600">
                      <SelectValue placeholder="Selecione um template..." />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-600">
                      {tournamentLibrary.map((template: any) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.groupName} - {template.site} • ${template.avgBuyin?.toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="site"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-gray-800 border-gray-600">
                            <SelectValue placeholder="Selecione o site" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-gray-800 border-gray-600">
                          {sites.map((site) => (
                            <SelectItem key={site} value={site}>{site}</SelectItem>
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
                          placeholder="19:00" 
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-gray-800 border-gray-600">
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-gray-800 border-gray-600">
                          {types.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-gray-800 border-gray-600">
                            <SelectValue placeholder="Selecione a velocidade" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-gray-800 border-gray-600">
                          {speeds.map((speed) => (
                            <SelectItem key={speed} value={speed}>{speed}</SelectItem>
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
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        placeholder="Descrição do torneio..." 
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
                          placeholder="109.00" 
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
        </DialogContent>
      </Dialog>
    </div>
  );
}