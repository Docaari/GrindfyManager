import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { 
  Play, 
  Clock, 
  History, 
  Trophy,
  Coffee,
  FileText,
  Target,
  CheckCircle,
  XCircle,
  Calendar,
  TrendingUp,
  DollarSign
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import GrindSessionLive from "@/pages/GrindSessionLive";

interface SessionHistoryData {
  id: string;
  date: string;
  status: string;
  duration?: string;
  preparationPercentage?: number;
  preparationNotes?: string;
  dailyGoals?: string;
  objectiveCompleted?: boolean;
  finalNotes?: string;
  volume: number;
  profit: number;
  abiMed: number;
  roi: number;
  fts: number;
  cravadas: number;
  breakCount?: number;
  energiaMedia: number;
  focoMedio: number;
  confiancaMedia: number;
  inteligenciaEmocionalMedia: number;
  interferenciasMedia: number;
}

export default function GrindSession() {
  const [location, navigate] = useLocation();
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [preparationPercentage, setPreparationPercentage] = useState([75]);
  const [preparationNotes, setPreparationNotes] = useState("");
  const [dailyGoals, setDailyGoals] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch active sessions
  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["/api/grind-sessions"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json();
    },
  });

  // Fetch session history
  const { data: sessionHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ["/api/grind-sessions/history"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions/history", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch session history");
      const data = await response.json();
      console.log("Session history data:", data);
      return data;
    },
  });

  // Find active session
  const activeSession = sessions?.find((s: any) => s.status === "active");

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async (sessionData: any) => {
      return apiRequest("/api/grind-sessions", {
        method: "POST",
        body: JSON.stringify(sessionData)
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      setShowStartDialog(false);
      toast({
        title: "Sessão Iniciada",
        description: "Sua sessão de grind foi iniciada com sucesso!",
      });
      // Navigate to the grind session (will default to history tab)
      navigate("/grind");
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao iniciar sessão",
        variant: "destructive",
      });
    },
  });

  const handleStartSession = () => {
    if (activeSession) {
      toast({
        title: "Sessão Ativa",
        description: "Você já tem uma sessão ativa. Finalize-a antes de iniciar uma nova.",
        variant: "destructive",
      });
      navigate("/grind");
      return;
    }

    startSessionMutation.mutate({
      preparationPercentage: preparationPercentage[0],
      preparationNotes,
      dailyGoals,
      status: "active",
      startTime: new Date().toISOString(),
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  if (sessionsLoading || historyLoading) {
    return (
      <div className="p-6 text-white">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-poker-accent mx-auto mb-4"></div>
            <p className="text-gray-400">Carregando sessões...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      {/* Active Session Header */}
      {activeSession && (
        <Card className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-green-600/30 mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                <div>
                  <CardTitle className="text-green-400 flex items-center gap-2">
                    <Play className="w-5 h-5" />
                    Sessão Ativa
                  </CardTitle>
                  <CardDescription className="text-sm text-[#000000b3]">
                    Iniciada em {formatDate(activeSession.startTime)}
                  </CardDescription>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => navigate("/grind")}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Continuar Sessão
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Grind Session</h1>
            <p className="text-gray-400">Gerencie suas sessões de grind e acompanhe seu histórico</p>
          </div>
          
          {/* Start Session Button */}
          <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
            <DialogTrigger asChild>
              <Button
                size="lg"
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-8 py-3 shadow-lg"
                disabled={!!activeSession}
              >
                <Play className="w-5 h-5 mr-2" />
                {activeSession ? "Sessão Ativa" : "Iniciar Sessão"}
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
        </div>
      </div>

      {/* Session History */}
      <div className="space-y-4">
        {sessionHistory.length === 0 ? (
          <Card className="bg-poker-surface border-gray-700">
            <CardContent className="p-8 text-center">
              <Trophy className="w-12 h-12 text-gray-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-300 mb-2">Nenhuma Sessão Concluída</h3>
              <p className="text-gray-500">
                Suas sessões concluídas aparecerão aqui com estatísticas detalhadas.
              </p>
            </CardContent>
          </Card>
        ) : (
          sessionHistory.map((session: SessionHistoryData) => (
            <Card key={session.id} className="bg-poker-surface border-gray-700 hover:border-poker-accent/50 transition-colors">
              <CardHeader className="bg-[#1f1f1f] border-b border-gray-600">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2 text-white font-bold">
                      <Clock className="w-5 h-5 text-poker-accent" />
                      {formatDate(session.date)}
                    </CardTitle>
                    <CardDescription className="text-gray-400 mt-1 flex items-center gap-4">
                      <span>Sessão de grind</span>
                      {session.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Duração: {session.duration}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className="bg-green-900/20 border-green-600/50 text-green-400"
                    >
                      Concluída
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              
              {/* Performance Summary Cards - Always Visible */}
              <CardContent className="bg-[#1f1f1f] border-b border-gray-600">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                  <div className="text-center bg-blue-900/20 border border-blue-600/30 rounded-lg p-3">
                    <div className="text-lg font-bold text-blue-400">{session.volume}</div>
                    <div className="text-xs text-gray-400">Volume</div>
                  </div>
                  <div className="text-center bg-green-900/20 border border-green-600/30 rounded-lg p-3">
                    <div className={`text-lg font-bold ${session.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(session.profit)}
                    </div>
                    <div className="text-xs text-gray-400">Profit</div>
                  </div>
                  <div className="text-center bg-purple-900/20 border border-purple-600/30 rounded-lg p-3">
                    <div className="text-lg font-bold text-purple-400">{formatCurrency(session.abiMed)}</div>
                    <div className="text-xs text-gray-400">ABI Médio</div>
                  </div>
                  <div className="text-center bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3">
                    <div className={`text-lg font-bold ${session.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {session.roi.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-400">ROI</div>
                  </div>
                  <div className="text-center bg-orange-900/20 border border-orange-600/30 rounded-lg p-3">
                    <div className="text-lg font-bold text-orange-400">{session.fts}</div>
                    <div className="text-xs text-gray-400">FTs</div>
                  </div>
                  <div className="text-center bg-cyan-900/20 border border-cyan-600/30 rounded-lg p-3">
                    <div className="text-lg font-bold text-cyan-400">{session.cravadas}</div>
                    <div className="text-xs text-gray-400">Cravadas</div>
                  </div>
                </div>

                {/* Mental State Summary */}
                {session.breakCount && session.breakCount > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Coffee className="w-4 h-4 text-poker-accent" />
                      <span className="text-sm font-medium text-gray-300">Estado Mental Médio</span>
                      <span className="text-xs text-gray-500">({session.breakCount} medições)</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                      <div className="text-center bg-red-900/20 border border-red-600/30 rounded-lg p-2">
                        <div className="text-sm font-semibold text-red-400">{(session.energiaMedia || 0).toFixed(1)}</div>
                        <div className="text-xs text-gray-400">Energia</div>
                      </div>
                      <div className="text-center bg-blue-900/20 border border-blue-600/30 rounded-lg p-2">
                        <div className="text-sm font-semibold text-blue-400">{(session.focoMedio || 0).toFixed(1)}</div>
                        <div className="text-xs text-gray-400">Foco</div>
                      </div>
                      <div className="text-center bg-green-900/20 border border-green-600/30 rounded-lg p-2">
                        <div className="text-sm font-semibold text-green-400">{(session.confiancaMedia || 0).toFixed(1)}</div>
                        <div className="text-xs text-gray-400">Confiança</div>
                      </div>
                      <div className="text-center bg-purple-900/20 border border-purple-600/30 rounded-lg p-2">
                        <div className="text-sm font-semibold text-purple-400">{(session.inteligenciaEmocionalMedia || 0).toFixed(1)}</div>
                        <div className="text-xs text-gray-400">Int. Emocional</div>
                      </div>
                      <div className="text-center bg-orange-900/20 border border-orange-600/30 rounded-lg p-2">
                        <div className="text-sm font-semibold text-orange-400">{(session.interferenciasMedia || 0).toFixed(1)}</div>
                        <div className="text-xs text-gray-400">Interferências</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Preparation Notes Preview */}
                {session.preparationNotes && (
                  <div className="mt-4 p-3 bg-gray-800/30 rounded-lg border-l-4 border-poker-accent">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-poker-accent" />
                      <span className="text-sm font-medium text-gray-300">Notas de Preparação</span>
                      {session.preparationPercentage && (
                        <span className="text-xs text-poker-accent font-medium">
                          {session.preparationPercentage}% preparado
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 line-clamp-2">
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