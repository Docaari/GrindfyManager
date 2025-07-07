import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Play, 
  Clock, 
  Trophy,
  Coffee,
  FileText,
  Target,
  Calendar,
  TrendingUp,
  DollarSign,
  Award,
  Filter,
  BarChart3,
  Users,
  Zap,
  Brain,
  Heart,
  Volume2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import GrindSessionLive from "./GrindSessionLive";

interface SessionHistoryData {
  id: string;
  userId: string;
  date: string;
  duration?: string;
  volume: number;
  profit: number;
  abiMed: number;
  roi: number;
  fts: number;
  cravadas: number;
  energiaMedia: number;
  focoMedio: number;
  confiancaMedia: number;
  inteligenciaEmocionalMedia: number;
  interferenciasMedia: number;
  breakCount: number;
  preparationNotes?: string;
  preparationPercentage?: number;
  dailyGoals?: string;
  finalNotes?: string;
  objectiveCompleted?: boolean;
  status: string;
}

interface DashboardMetrics {
  totalSessions: number;
  totalVolume: number;
  totalProfit: number;
  avgABI: number;
  avgROI: number;
  totalFTs: number;
  totalCravadas: number;
  avgEnergia: number;
  avgFoco: number;
  avgConfianca: number;
  avgInteligenciaEmocional: number;
  avgInterferencias: number;
  avgPreparationPercentage: number;
}

interface FilterState {
  periodo: string;
  customStartDate: string;
  customEndDate: string;
  preparacaoMin: number;
  preparacaoMax: number;
  energiaMin: number;
  energiaMax: number;
  focoMin: number;
  focoMax: number;
  confiancaMin: number;
  confiancaMax: number;
  emocionalMin: number;
  emocionalMax: number;
  interferenciasMin: number;
  interferenciasMax: number;
}

export default function GrindSession() {
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [preparationPercentage, setPreparationPercentage] = useState([50]);
  const [preparationNotes, setPreparationNotes] = useState("");
  const [dailyGoals, setDailyGoals] = useState("");
  const [filters, setFilters] = useState<FilterState>({
    periodo: "30d",
    customStartDate: "",
    customEndDate: "",
    preparacaoMin: 0,
    preparacaoMax: 100,
    energiaMin: 0,
    energiaMax: 10,
    focoMin: 0,
    focoMax: 10,
    confiancaMin: 0,
    confiancaMax: 10,
    emocionalMin: 0,
    emocionalMax: 10,
    interferenciasMin: 0,
    interferenciasMax: 10
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check for active session
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["/api/grind-sessions"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch active sessions");
      return response.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider fresh for 10 seconds
  });

  const activeSession = activeSessions.find((session: any) => session.status === "active");

  // Remove auto-redirect logic - users navigate manually

  // Fetch session history
  const { data: sessionHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ["/api/grind-sessions/history"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions/history", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch session history");
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  // Filter sessions based on current filters
  const filteredSessions = sessionHistory.filter((session: SessionHistoryData) => {
    const sessionDate = new Date(session.date);
    const now = new Date();

    // Period filter
    let periodMatch = false;
    switch (filters.periodo) {
      case "7d":
        periodMatch = sessionDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        periodMatch = sessionDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        periodMatch = sessionDate >= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "1y":
        periodMatch = sessionDate >= new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case "custom":
        const start = filters.customStartDate ? new Date(filters.customStartDate) : new Date(0);
        const end = filters.customEndDate ? new Date(filters.customEndDate) : new Date();
        periodMatch = sessionDate >= start && sessionDate <= end;
        break;
      default:
        periodMatch = true;
    }

    // Mental state filters
    const preparationPercentage = session.preparationPercentage || 0;
    const preparationMatch = preparationPercentage >= filters.preparacaoMin && preparationPercentage <= filters.preparacaoMax;

    const energiaMatch = session.energiaMedia >= filters.energiaMin && session.energiaMedia <= filters.energiaMax;
    const focoMatch = session.focoMedio >= filters.focoMin && session.focoMedio <= filters.focoMax;
    const confiancaMatch = session.confiancaMedia >= filters.confiancaMin && session.confiancaMedia <= filters.confiancaMax;
    const emocionalMatch = session.inteligenciaEmocionalMedia >= filters.emocionalMin && session.inteligenciaEmocionalMedia <= filters.emocionalMax;
    const interferenciasMatch = session.interferenciasMedia >= filters.interferenciasMin && session.interferenciasMedia <= filters.interferenciasMax;

    return periodMatch && preparationMatch && energiaMatch && focoMatch && confiancaMatch && emocionalMatch && interferenciasMatch;
  });

  // Calculate dashboard metrics from filtered sessions
  const dashboardMetrics: DashboardMetrics = {
    totalSessions: filteredSessions.length,
    totalVolume: filteredSessions.reduce((sum, session) => sum + session.volume, 0),
    totalProfit: filteredSessions.reduce((sum, session) => sum + session.profit, 0),
    avgABI: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.abiMed, 0) / filteredSessions.length : 0,
    avgROI: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.roi, 0) / filteredSessions.length : 0,
    totalFTs: filteredSessions.reduce((sum, session) => sum + session.fts, 0),
    totalCravadas: filteredSessions.reduce((sum, session) => sum + session.cravadas, 0),
    avgEnergia: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.energiaMedia, 0) / filteredSessions.length : 0,
    avgFoco: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.focoMedio, 0) / filteredSessions.length : 0,
    avgConfianca: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.confiancaMedia, 0) / filteredSessions.length : 0,
    avgInteligenciaEmocional: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.inteligenciaEmocionalMedia, 0) / filteredSessions.length : 0,
    avgInterferencias: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.interferenciasMedia, 0) / filteredSessions.length : 0,
    avgPreparationPercentage: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + (session.preparationPercentage || 0), 0) / filteredSessions.length : 0
  };

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/grind-sessions", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Sessão iniciada com sucesso!",
        description: "Sua sessão de grind foi iniciada. Boa sorte!",
      });
      setShowStartDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      
      // Redirect to active session page
      setTimeout(() => {
        window.location.href = "/grind-live";
      }, 500);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao iniciar sessão",
        description: error.message || "Algo deu errado ao iniciar a sessão.",
        variant: "destructive",
      });
    },
  });

  const handleStartSession = () => {
    const sessionData = {
      date: new Date().toISOString(),
      status: "active",
      preparationNotes: preparationNotes ? `${preparationPercentage[0]}% - ${preparationNotes}` : `${preparationPercentage[0]}%`,
      dailyGoals: dailyGoals || "",
      skipBreaksToday: false,
    };

    startSessionMutation.mutate(sessionData);
  };

  // Navigation to active session is handled by direct links

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Grind Session</h1>
            <p className="text-gray-400">Gerencie suas sessões de grind e acompanhe seu histórico</p>
          </div>

          <div className="flex gap-3">
            {/* Active Session Indicator */}
            {activeSession && (
              <Button
                onClick={() => window.location.href = "/grind-live"}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-8 py-3 shadow-lg"
              >
                <Play className="w-5 h-5 mr-2" />
                Continuar Sessão Ativa
              </Button>
            )}

            {/* Filters Toggle */}
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="border-gray-600 hover:bg-gray-700"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filtros
            </Button>

            {/* Start Session Button - Only show if no active session */}
            {!activeSession && (
              <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
              <DialogTrigger asChild>
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-8 py-3 shadow-lg"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Iniciar Sessão
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-poker-surface border-gray-700 text-white">
                <DialogHeader>
                  <DialogTitle>Iniciar Nova Sessão</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Prepare-se para sua sessão de grind com notas e objetivos
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="preparation-percentage">Preparação (%)</Label>
                    <div className="flex items-center space-x-4">
                      <Slider
                        value={preparationPercentage}
                        onValueChange={setPreparationPercentage}
                        max={100}
                        step={5}
                        className="flex-1"
                      />
                      <span className="text-poker-accent font-semibold min-w-[3rem]">
                        {preparationPercentage[0]}%
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="preparation-notes">Notas de Preparação</Label>
                    <Textarea
                      id="preparation-notes"
                      value={preparationNotes}
                      onChange={(e) => setPreparationNotes(e.target.value)}
                      placeholder="Escreva sobre seu estado mental, estratégias, objetivos..."
                      className="bg-gray-800 border-gray-600 text-white"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="daily-goals">Objetivos do Dia</Label>
                    <Input
                      id="daily-goals"
                      value={dailyGoals}
                      onChange={(e) => setDailyGoals(e.target.value)}
                      placeholder="Ex: Jogar 20 torneios, lucrar $500..."
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setShowStartDialog(false)}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleStartSession}
                      disabled={startSessionMutation.isPending}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      {startSessionMutation.isPending ? "Iniciando..." : "Iniciar Sessão"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            )}
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <Card className="mb-6 bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Period Filter */}
              <div>
                <Label className="text-gray-300">Período</Label>
                <Select value={filters.periodo} onValueChange={(value) => setFilters({...filters, periodo: value})}>
                  <SelectTrigger className="bg-gray-800 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="7d">Últimos 7 dias</SelectItem>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="90d">Últimos 90 dias</SelectItem>
                    <SelectItem value="1y">Último ano</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Date Range */}
              {filters.periodo === "custom" && (
                <>
                  <div>
                    <Label className="text-gray-300">Data Inicial</Label>
                    <Input
                      type="date"
                      value={filters.customStartDate}
                      onChange={(e) => setFilters({...filters, customStartDate: e.target.value})}
                      className="bg-gray-800 border-gray-600"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">Data Final</Label>
                    <Input
                      type="date"
                      value={filters.customEndDate}
                      onChange={(e) => setFilters({...filters, customEndDate: e.target.value})}
                      className="bg-gray-800 border-gray-600"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Mental State Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-300">Preparação (%)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={filters.preparacaoMin}
                    onChange={(e) => setFilters({...filters, preparacaoMin: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                  <span className="text-gray-400">-</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={filters.preparacaoMax}
                    onChange={(e) => setFilters({...filters, preparacaoMax: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-300">Energia</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.energiaMin}
                    onChange={(e) => setFilters({...filters, energiaMin: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                  <span className="text-gray-400">-</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.energiaMax}
                    onChange={(e) => setFilters({...filters, energiaMax: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-300">Foco</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.focoMin}
                    onChange={(e) => setFilters({...filters, focoMin: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                  <span className="text-gray-400">-</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.focoMax}
                    onChange={(e) => setFilters({...filters, focoMax: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-300">Confiança</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.confiancaMin}
                    onChange={(e) => setFilters({...filters, confiancaMin: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                  <span className="text-gray-400">-</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.confiancaMax}
                    onChange={(e) => setFilters({...filters, confiancaMax: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-300">Inteligência Emocional</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.emocionalMin}
                    onChange={(e) => setFilters({...filters, emocionalMin: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                  <span className="text-gray-400">-</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.emocionalMax}
                    onChange={(e) => setFilters({...filters, emocionalMax: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-300">Interferências</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.interferenciasMin}
                    onChange={(e) => setFilters({...filters, interferenciasMin: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                  <span className="text-gray-400">-</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.interferenciasMax}
                    onChange={(e) => setFilters({...filters, interferenciasMax: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setFilters({
                  periodo: "30d",
                  customStartDate: "",
                  customEndDate: "",
                  preparacaoMin: 0,
                  preparacaoMax: 100,
                  energiaMin: 0,
                  energiaMax: 10,
                  focoMin: 0,
                  focoMax: 10,
                  confiancaMin: 0,
                  confiancaMax: 10,
                  emocionalMin: 0,
                  emocionalMax: 10,
                  interferenciasMin: 0,
                  interferenciasMax: 10
                })}
                className="border-gray-600 hover:bg-gray-700"
              >
                Limpar Filtros
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dashboard Metrics */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-poker-accent" />
          Dashboard ({filteredSessions.length} sessões)
        </h2>

        {/* Performance Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Volume Total</p>
                  <p className="text-2xl font-bold text-blue-400">{dashboardMetrics.totalVolume}</p>
                </div>
                <Users className="w-8 h-8 text-blue-400 opacity-75" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Profit Total</p>
                  <p className={`text-2xl font-bold ${dashboardMetrics.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(dashboardMetrics.totalProfit)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-green-400 opacity-75" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">ABI Médio</p>
                  <p className="text-2xl font-bold text-purple-400">{formatCurrency(dashboardMetrics.avgABI)}</p>
                </div>
                <Target className="w-8 h-8 text-purple-400 opacity-75" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">ROI Médio</p>
                  <p className={`text-2xl font-bold ${dashboardMetrics.avgROI >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {dashboardMetrics.avgROI.toFixed(1)}%
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-yellow-400 opacity-75" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Additional Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Final Tables</p>
                  <p className="text-2xl font-bold text-orange-400">{dashboardMetrics.totalFTs}</p>
                </div>
                <Award className="w-8 h-8 text-orange-400 opacity-75" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Cravadas</p>
                  <p className="text-2xl font-bold text-cyan-400">{dashboardMetrics.totalCravadas}</p>
                </div>
                <Trophy className="w-8 h-8 text-cyan-400 opacity-75" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Preparação Média</p>
                  <p className="text-2xl font-bold text-poker-accent">{dashboardMetrics.avgPreparationPercentage.toFixed(1)}%</p>
                </div>
                <FileText className="w-8 h-8 text-poker-accent opacity-75" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Mental State Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Energia</p>
                  <p className="text-xl font-bold text-red-400">{dashboardMetrics.avgEnergia.toFixed(1)}</p>
                </div>
                <Zap className="w-6 h-6 text-red-400 opacity-75" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Foco</p>
                  <p className="text-xl font-bold text-blue-400">{dashboardMetrics.avgFoco.toFixed(1)}</p>
                </div>
                <Target className="w-6 h-6 text-blue-400 opacity-75" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Confiança</p>
                  <p className="text-xl font-bold text-green-400">{dashboardMetrics.avgConfianca.toFixed(1)}</p>
                </div>
                <TrendingUp className="w-6 h-6 text-green-400 opacity-75" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Int. Emocional</p>
                  <p className="text-xl font-bold text-purple-400">{dashboardMetrics.avgInteligenciaEmocional.toFixed(1)}</p>
                </div>
                <Heart className="w-6 h-6 text-purple-400 opacity-75" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Interferências</p>
                  <p className="text-xl font-bold text-orange-400">{dashboardMetrics.avgInterferencias.toFixed(1)}</p>
                </div>
                <Volume2 className="w-6 h-6 text-orange-400 opacity-75" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Session History */}
      <div className="space-y-3">
        <h2 className="text-2xl font-bold mb-4">Histórico de Sessões</h2>
        {filteredSessions.length === 0 ? (
          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-8 text-center">
              <Trophy className="w-12 h-12 text-gray-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-300 mb-2">Nenhuma Sessão Encontrada</h3>
              <p className="text-gray-500">
                Nenhuma sessão corresponde aos filtros aplicados ou você ainda não tem sessões concluídas.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredSessions.map((session: SessionHistoryData) => (
            <Card key={session.id} className="bg-poker-surface border-gray-700 hover:border-poker-accent/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-poker-accent" />
                      <span className="font-semibold text-white">{formatDate(session.date)}</span>
                    </div>
                    {session.duration && (
                      <div className="flex items-center gap-1 text-sm text-gray-400">
                        <span>Duração: {session.duration}</span>
                      </div>
                    )}
                  </div>
                  <Badge 
                    variant="outline" 
                    className="bg-green-900/20 border-green-600/50 text-green-400"
                  >
                    Concluída
                  </Badge>
                </div>

                {/* Compact Performance Grid */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
                  <div className="text-center bg-blue-900/20 border border-blue-600/30 rounded p-2">
                    <div className="text-sm font-bold text-blue-400">{session.volume}</div>
                    <div className="text-xs text-gray-400">Volume</div>
                  </div>
                  <div className="text-center bg-green-900/20 border border-green-600/30 rounded p-2">
                    <div className={`text-sm font-bold ${session.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(session.profit)}
                    </div>
                    <div className="text-xs text-gray-400">Profit</div>
                  </div>
                  <div className="text-center bg-purple-900/20 border border-purple-600/30 rounded p-2">
                    <div className="text-sm font-bold text-purple-400">{formatCurrency(session.abiMed)}</div>
                    <div className="text-xs text-gray-400">ABI</div>
                  </div>
                  <div className="text-center bg-yellow-900/20 border border-yellow-600/30 rounded p-2">
                    <div className={`text-sm font-bold ${session.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {session.roi.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-400">ROI</div>
                  </div>
                  <div className="text-center bg-orange-900/20 border border-orange-600/30 rounded p-2">
                    <div className="text-sm font-bold text-orange-400">{session.fts}</div>
                    <div className="text-xs text-gray-400">FTs</div>
                  </div>
                  <div className="text-center bg-cyan-900/20 border border-cyan-600/30 rounded p-2">
                    <div className="text-sm font-bold text-cyan-400">{session.cravadas}</div>
                    <div className="text-xs text-gray-400">Cravadas</div>
                  </div>
                </div>

                {/* Mental State - Compact */}
                {session.breakCount > 0 && (
                  <div className="grid grid-cols-5 gap-1 mb-2">
                    <div className="text-center bg-red-900/20 border border-red-600/30 rounded p-1">
                      <div className="text-xs font-semibold text-red-400">{session.energiaMedia.toFixed(1)}</div>
                      <div className="text-xs text-gray-400">Energia</div>
                    </div>
                    <div className="text-center bg-blue-900/20 border border-blue-600/30 rounded p-1">
                      <div className="text-xs font-semibold text-blue-400">{session.focoMedio.toFixed(1)}</div>
                      <div className="text-xs text-gray-400">Foco</div>
                    </div>
                    <div className="text-center bg-green-900/20 border border-green-600/30 rounded p-1">
                      <div className="text-xs font-semibold text-green-400">{session.confiancaMedia.toFixed(1)}</div>
                      <div className="text-xs text-gray-400">Confiança</div>
                    </div>
                    <div className="text-center bg-purple-900/20 border border-purple-600/30 rounded p-1">
                      <div className="text-xs font-semibold text-purple-400">{session.inteligenciaEmocionalMedia.toFixed(1)}</div>
                      <div className="text-xs text-gray-400">Emocional</div>
                    </div>
                    <div className="text-center bg-orange-900/20 border border-orange-600/30 rounded p-1">
                      <div className="text-xs font-semibold text-orange-400">{session.interferenciasMedia.toFixed(1)}</div>
                      <div className="text-xs text-gray-400">Interferências</div>
                    </div>
                  </div>
                )}

                {/* Notes Preview - Compact */}
                {session.preparationNotes && (
                  <div className="mt-2 p-2 bg-gray-800/30 rounded border-l-2 border-poker-accent">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-3 h-3 text-poker-accent" />
                      <span className="text-xs font-medium text-gray-300">Preparação</span>
                      {session.preparationPercentage && (
                        <span className="text-xs text-poker-accent font-medium">
                          {session.preparationPercentage}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-1">
                      {session.preparationNotes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}