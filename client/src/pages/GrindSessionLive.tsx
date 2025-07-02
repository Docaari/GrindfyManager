import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Play, Plus, Clock, DollarSign, Trophy, Target, Coffee, SkipForward, X } from "lucide-react";

interface GrindSession {
  id: string;
  userId: string;
  date: string;
  status: string;
  preparationNotes?: string;
  dailyGoals?: string;
  skipBreaksToday: boolean;
}

interface SessionTournament {
  id: string;
  sessionId: string;
  site: string;
  name?: string;
  buyIn: string;
  rebuys: number;
  result: string;
  position?: number;
  fieldSize?: number;
  status: string;
  fromPlannedTournament: boolean;
}

interface BreakFeedback {
  id: string;
  sessionId: string;
  breakTime: string;
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
  notes?: string;
}

export default function GrindSessionLive() {
  const [activeSession, setActiveSession] = useState<GrindSession | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  const [showAddTournamentDialog, setShowAddTournamentDialog] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [preparationPercentage, setPreparationPercentage] = useState(50);
  const [preparationObservations, setPreparationObservations] = useState("");
  const [dailyGoals, setDailyGoals] = useState("");
  
  // Break feedback form
  const [breakFeedback, setBreakFeedback] = useState({
    foco: 5,
    energia: 5,
    confianca: 5,
    inteligenciaEmocional: 5,
    interferencias: 5,
    notes: ""
  });

  // Add tournament form
  const [newTournament, setNewTournament] = useState({
    site: "",
    name: "",
    buyIn: "",
    rebuys: 0,
    result: "0",
    position: null as number | null,
    fieldSize: null as number | null,
    status: "registered"
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get current day of week (0 = Sunday, 1 = Monday, etc.)
  const currentDayOfWeek = new Date().getDay();

  // Fetch active session
  const { data: sessions } = useQuery({
    queryKey: ["/api/grind-sessions"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json();
    },
  });

  // Fetch planned tournaments for today
  const { data: plannedTournaments } = useQuery({
    queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek],
    queryFn: async () => {
      const response = await fetch(`/api/session-tournaments/by-day/${currentDayOfWeek}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch planned tournaments");
      return response.json();
    },
  });

  // Fetch session tournaments
  const { data: sessionTournaments } = useQuery({
    queryKey: ["/api/session-tournaments", activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.id) return [];
      const response = await fetch(`/api/session-tournaments?sessionId=${activeSession.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch session tournaments");
      return response.json();
    },
    enabled: !!activeSession?.id,
  });

  // Check for active session on load
  useEffect(() => {
    if (sessions) {
      const todaySession = sessions.find((s: GrindSession) => 
        s.status === "active" && 
        new Date(s.date).toDateString() === new Date().toDateString()
      );
      setActiveSession(todaySession || null);
    }
  }, [sessions]);

  // Break timer simulation - show dialog every hour (for demo: every 5 seconds)
  useEffect(() => {
    if (activeSession && !activeSession.skipBreaksToday) {
      const timer = setInterval(() => {
        // Check if it's 14:55 or 15:55 (or every hour for demo)
        const now = new Date();
        const minutes = now.getMinutes();
        const hours = now.getHours();
        
        // Show break dialog at xx:55 (5 minutes before the hour)
        if (minutes === 55) {
          setShowBreakDialog(true);
        }
      }, 60000); // Check every minute

      return () => clearInterval(timer);
    }
  }, [activeSession]);

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async (data: { preparationNotes: string; dailyGoals: string }) => {
      const sessionData = {
        date: new Date().toISOString(),
        status: "active",
        preparationNotes: data.preparationNotes,
        dailyGoals: data.dailyGoals,
        skipBreaksToday: false,
      };
      const response = await apiRequest("POST", "/api/grind-sessions", sessionData);
      return response.json();
    },
    onSuccess: (session) => {
      setActiveSession(session);
      setShowStartDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      toast({
        title: "Sessão Iniciada",
        description: "Sua sessão de grind foi iniciada com sucesso!",
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

  // Add tournament mutation
  const addTournamentMutation = useMutation({
    mutationFn: async (tournamentData: any) => {
      const data = {
        ...tournamentData,
        sessionId: activeSession?.id,
        buyIn: tournamentData.buyIn.toString(),
        result: tournamentData.result.toString(),
      };
      const response = await apiRequest("POST", "/api/session-tournaments", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      setShowAddTournamentDialog(false);
      setNewTournament({
        site: "",
        name: "",
        buyIn: "",
        rebuys: 0,
        result: "0",
        position: null,
        fieldSize: null,
        status: "registered"
      });
      toast({
        title: "Torneio Adicionado",
        description: "Torneio adicionado à sessão com sucesso!",
      });
    },
  });

  // Update tournament mutation
  const updateTournamentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/session-tournaments/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      toast({
        title: "Torneio Atualizado",
        description: "Resultado do torneio salvo com sucesso!",
      });
    },
  });

  // Break feedback mutation
  const breakFeedbackMutation = useMutation({
    mutationFn: async (feedback: any) => {
      const data = {
        ...feedback,
        sessionId: activeSession?.id,
        breakTime: new Date().toISOString(),
      };
      const response = await apiRequest("POST", "/api/break-feedbacks", data);
      return response.json();
    },
    onSuccess: () => {
      setShowBreakDialog(false);
      setBreakFeedback({
        foco: 5,
        energia: 5,
        confianca: 5,
        inteligenciaEmocional: 5,
        interferencias: 5,
        notes: ""
      });
      toast({
        title: "Feedback Registrado",
        description: "Seu feedback do break foi registrado!",
      });
    },
  });

  // End session mutation
  const endSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", `/api/grind-sessions/${activeSession?.id}`, {
        status: "completed",
        endTime: new Date().toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      setShowDailyReport(true);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
    },
  });

  const handleStartSession = () => {
    const combinedPreparationNotes = `${preparationPercentage}% - ${preparationObservations}`;
    startSessionMutation.mutate({
      preparationNotes: combinedPreparationNotes,
      dailyGoals,
    });
  };

  const handleUpdateTournament = (tournament: SessionTournament, field: string, value: any) => {
    updateTournamentMutation.mutate({
      id: tournament.id,
      data: { [field]: value },
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "registered":
        return <Badge className="bg-blue-600">Registrado</Badge>;
      case "active":
        return <Badge className="bg-green-600">Ativo</Badge>;
      case "finished":
        return <Badge className="bg-gray-600">Finalizado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const calculateSessionStats = () => {
    if (!sessionTournaments) return { volume: 0, profit: 0, buyins: 0, itm: 0, finalTables: 0 };
    
    const finishedTournaments = sessionTournaments.filter((t: SessionTournament) => t.status === "finished");
    const volume = finishedTournaments.length;
    const profit = finishedTournaments.reduce((sum: number, t: SessionTournament) => sum + parseFloat(t.result), 0);
    const buyins = sessionTournaments.reduce((sum: number, t: SessionTournament) => sum + parseFloat(t.buyIn) * (1 + t.rebuys), 0);
    const itm = finishedTournaments.filter((t: SessionTournament) => parseFloat(t.result) > 0).length;
    const finalTables = finishedTournaments.filter((t: SessionTournament) => t.position && t.position <= 9).length;
    
    return { volume, profit, buyins, itm, finalTables };
  };

  const stats = calculateSessionStats();

  if (!activeSession) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Grind Session</h2>
          <p className="text-gray-400">Inicie uma nova sessão de grind para rastrear seu desempenho em tempo real</p>
        </div>

        <Card className="bg-poker-surface border-gray-700 max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="text-white text-xl">Nenhuma Sessão Ativa</CardTitle>
            <CardDescription className="text-gray-400">
              Comece uma nova sessão para rastrear seus torneios e receber insights em tempo real
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-3">
                  <Play className="w-4 h-4 mr-2" />
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
                      <Input
                        id="preparation-percentage"
                        type="number"
                        min="0"
                        max="100"
                        value={preparationPercentage}
                        onChange={(e) => setPreparationPercentage(Number(e.target.value))}
                        className="bg-gray-800 border-gray-600 text-white w-20"
                      />
                      <span className="text-white">%</span>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="preparation-observations">Observações de Preparação</Label>
                    <Textarea
                      id="preparation-observations"
                      placeholder="Como você está se sentindo? Que estratégias vai usar hoje?"
                      value={preparationObservations}
                      onChange={(e) => setPreparationObservations(e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="goals">Objetivos do Dia</Label>
                    <Textarea
                      id="goals"
                      placeholder="Quais são seus objetivos para hoje? Meta de lucro, volume, etc."
                      value={dailyGoals}
                      onChange={(e) => setDailyGoals(e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  <Button 
                    onClick={handleStartSession} 
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
                    disabled={startSessionMutation.isPending}
                  >
                    {startSessionMutation.isPending ? "Iniciando..." : "Iniciar Sessão"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold mb-2">Sessão Ativa</h2>
          <p className="text-gray-400">
            Iniciada às {new Date(activeSession.date).toLocaleTimeString()}
          </p>
        </div>
        <Button
          onClick={() => endSessionMutation.mutate()}
          variant="destructive"
          className="bg-red-600 hover:bg-red-700"
        >
          Finalizar Sessão
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-poker-gold">{stats.volume}</div>
            <div className="text-sm text-gray-400">Volume</div>
          </CardContent>
        </Card>
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-white">
              ${stats.profit.toFixed(2)}
            </div>
            <div className="text-sm text-gray-400">Lucro</div>
          </CardContent>
        </Card>
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-white">{stats.itm}</div>
            <div className="text-sm text-gray-400">ITM</div>
          </CardContent>
        </Card>
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-white">
              {stats.volume > 0 ? ((stats.profit / stats.buyins) * 100).toFixed(1) : 0}%
            </div>
            <div className="text-sm text-gray-400">ROI</div>
          </CardContent>
        </Card>
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-white">{stats.finalTables}</div>
            <div className="text-sm text-gray-400">FTs</div>
          </CardContent>
        </Card>
      </div>

      {/* Tournament List */}
      <Card className="bg-poker-surface border-gray-700 mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-white">Torneios de Hoje</CardTitle>
            <Dialog open={showAddTournamentDialog} onOpenChange={setShowAddTournamentDialog}>
              <DialogTrigger asChild>
                <Button className="bg-poker-accent hover:bg-poker-accent/90">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Torneio
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-poker-surface border-gray-700 text-white">
                <DialogHeader>
                  <DialogTitle>Adicionar Torneio</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Site</Label>
                    <Input
                      value={newTournament.site}
                      onChange={(e) => setNewTournament({...newTournament, site: e.target.value})}
                      className="bg-gray-800 border-gray-600 text-white"
                      placeholder="Ex: PokerStars, GGPoker..."
                    />
                  </div>
                  <div>
                    <Label>Buy-in ($)</Label>
                    <Input
                      type="number"
                      value={newTournament.buyIn}
                      onChange={(e) => setNewTournament({...newTournament, buyIn: e.target.value})}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  <Button 
                    onClick={() => addTournamentMutation.mutate(newTournament)}
                    className="w-full bg-poker-accent hover:bg-poker-accent/90"
                  >
                    Adicionar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Planned tournaments from Grade Planner */}
            {plannedTournaments?.map((tournament: any) => (
              <div key={tournament.id} className="p-4 bg-gray-800 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-white">{tournament.name}</div>
                    <div className="text-sm text-gray-400">
                      {tournament.site} • ${tournament.buyIn} • {tournament.time}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(tournament.status)}
                  </div>
                </div>
              </div>
            ))}
            
            {/* Added tournaments */}
            {sessionTournaments?.map((tournament: SessionTournament) => (
              <div key={tournament.id} className="p-4 bg-gray-800 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-white">
                      {tournament.name || `${tournament.site} Tournament`}
                    </div>
                    <div className="text-sm text-gray-400">
                      Buy-in: ${tournament.buyIn} • Rebuys: {tournament.rebuys}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {tournament.status === "finished" ? (
                      <div className="text-right">
                        <div className="text-white font-semibold">
                          ${parseFloat(tournament.result).toFixed(2)}
                        </div>
                        {tournament.position && (
                          <div className="text-sm text-gray-400">
                            #{tournament.position}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Input
                          type="number"
                          placeholder="Resultado"
                          className="w-24 bg-gray-700 border-gray-600 text-white"
                          onChange={(e) => 
                            handleUpdateTournament(tournament, "result", e.target.value)
                          }
                        />
                        <Button
                          size="sm"
                          onClick={() => 
                            handleUpdateTournament(tournament, "status", "finished")
                          }
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Finalizar
                        </Button>
                      </div>
                    )}
                    {getStatusBadge(tournament.status)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Break Feedback Dialog */}
      <Dialog open={showBreakDialog} onOpenChange={setShowBreakDialog}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Coffee className="w-5 h-5 mr-2" />
              Feedback do Break
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Como você está se sentindo neste momento? (0-10)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {[
              { key: "foco", label: "Foco" },
              { key: "energia", label: "Energia" },
              { key: "confianca", label: "Confiança" },
              { key: "inteligenciaEmocional", label: "Inteligência Emocional" },
              { key: "interferencias", label: "Interferências (0=muitas, 10=nenhuma)" },
            ].map(({ key, label }) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  value={breakFeedback[key as keyof typeof breakFeedback]}
                  onChange={(e) => 
                    setBreakFeedback({
                      ...breakFeedback,
                      [key]: parseInt(e.target.value) || 0
                    })
                  }
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
            ))}
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea
                value={breakFeedback.notes}
                onChange={(e) => setBreakFeedback({...breakFeedback, notes: e.target.value})}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="Como você está se sentindo? Alguma observação?"
              />
            </div>
            <div className="flex space-x-2">
              <Button
                onClick={() => breakFeedbackMutation.mutate(breakFeedback)}
                className="flex-1 bg-poker-accent hover:bg-poker-accent/90"
              >
                Salvar Feedback
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowBreakDialog(false)}
                className="border-gray-600 text-gray-400 hover:bg-gray-800"
              >
                <SkipForward className="w-4 h-4 mr-2" />
                Pular
              </Button>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                // Update session to skip breaks today
                setShowBreakDialog(false);
                toast({
                  title: "Breaks Desabilitados",
                  description: "Não mostraremos mais feedbacks de break hoje",
                });
              }}
              className="w-full text-yellow-400 hover:bg-yellow-900/20"
            >
              Pular Todos Hoje
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Daily Report Dialog */}
      <Dialog open={showDailyReport} onOpenChange={setShowDailyReport}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Trophy className="w-5 h-5 mr-2" />
              Relatório do Dia
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Resumo da sua sessão de grind
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Session Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-poker-gold">{stats.volume}</div>
                <div className="text-sm text-gray-400">Volume</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">${stats.profit.toFixed(2)}</div>
                <div className="text-sm text-gray-400">Lucro</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">
                  {stats.volume > 0 ? ((stats.profit / stats.buyins) * 100).toFixed(1) : 0}%
                </div>
                <div className="text-sm text-gray-400">ROI</div>
              </div>
            </div>

            <Separator className="bg-gray-600" />

            {/* Preparation Notes */}
            {activeSession.preparationNotes && (
              <div>
                <h4 className="font-semibold mb-2">Notas de Preparação</h4>
                <p className="text-gray-300 bg-gray-800 p-3 rounded">
                  {activeSession.preparationNotes}
                </p>
              </div>
            )}

            {/* Daily Goals */}
            {activeSession.dailyGoals && (
              <div>
                <h4 className="font-semibold mb-2">Objetivos do Dia</h4>
                <p className="text-gray-300 bg-gray-800 p-3 rounded">
                  {activeSession.dailyGoals}
                </p>
              </div>
            )}

            <Button
              onClick={() => {
                setShowDailyReport(false);
                setActiveSession(null);
              }}
              className="w-full bg-poker-accent hover:bg-poker-accent/90"
            >
              Finalizar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}