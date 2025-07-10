import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, Target, Trophy, DollarSign, TrendingUp, Coffee, FileText, CheckCircle, XCircle, Edit3, Trash2, Save, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  // Percentuais de tipos de torneios
  vanillaPercentage: number;
  pkoPercentage: number;
  mysteryPercentage: number;
  // Percentuais de velocidades
  normalSpeedPercentage: number;
  turboSpeedPercentage: number;
  hyperSpeedPercentage: number;
}

export default function SessionHistory() {
  const [filterPeriod, setFilterPeriod] = useState("30");
  const [editingSession, setEditingSession] = useState<SessionHistoryData | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<SessionHistoryData | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["/api/grind-sessions/history"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions/history", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch session history");
      const data = await response.json();
      
      // Debug logging to verify percentage data
      console.log("SESSION HISTORY DEBUG - Raw data from API:", data);
      data.forEach((session: any) => {
        console.log(`Session ${session.id} percentages:`, {
          date: session.date,
          id: session.id,
          volume: session.volume,
          vanillaPercentage: session.vanillaPercentage,
          pkoPercentage: session.pkoPercentage,
          mysteryPercentage: session.mysteryPercentage,
          normalSpeedPercentage: session.normalSpeedPercentage,
          turboSpeedPercentage: session.turboSpeedPercentage,
          hyperSpeedPercentage: session.hyperSpeedPercentage,
          typeofVanilla: typeof session.vanillaPercentage,
          typeofPko: typeof session.pkoPercentage,
          typeofMystery: typeof session.mysteryPercentage,
          typeofNormal: typeof session.normalSpeedPercentage,
          typeofTurbo: typeof session.turboSpeedPercentage,
          typeofHyper: typeof session.hyperSpeedPercentage
        });
      });
      
      return data;
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SessionHistoryData> }) => {
      const response = await fetch(`/api/grind-sessions/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update session: ${response.statusText}`);
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      toast({
        title: "Sessão atualizada!",
        description: "As alterações foram salvas com sucesso.",
      });
      setIsEditDialogOpen(false);
      setEditingSession(null);
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar sessão",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
      console.error("Error updating session:", error);
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      console.log("Attempting to delete session with ID:", id);
      const response = await fetch(`/api/grind-sessions/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Delete failed with status:", response.status, "Error:", errorText);
        throw new Error(`Failed to delete session: ${response.statusText}`);
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      toast({
        title: "Sessão excluída!",
        description: "A sessão foi removida permanentemente.",
      });
      setIsDeleteDialogOpen(false);
      setSessionToDelete(null);
    },
    onError: (error) => {
      console.error("Delete mutation error:", error);
      toast({
        title: "Erro ao excluir sessão",
        description: "Não foi possível remover a sessão.",
        variant: "destructive",
      });
    },
  });

  const handleEditSession = (session: SessionHistoryData) => {
    setEditingSession({ ...session });
    setIsEditDialogOpen(true);
  };

  const handleDeleteSession = (session: SessionHistoryData) => {
    console.log("handleDeleteSession called with session:", session.id);
    setSessionToDelete(session);
    setIsDeleteDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingSession) return;
    
    updateSessionMutation.mutate({
      id: editingSession.id,
      data: {
        preparationPercentage: editingSession.preparationPercentage,
        preparationNotes: editingSession.preparationNotes,
        dailyGoals: editingSession.dailyGoals,
        finalNotes: editingSession.finalNotes,
        objectiveCompleted: editingSession.objectiveCompleted,
      },
    });
  };

  const handleConfirmDelete = () => {
    if (!sessionToDelete) {
      console.error("No session to delete");
      return;
    }
    console.log("Confirming delete for session:", sessionToDelete.id);
    deleteSessionMutation.mutate(sessionToDelete.id);
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

  if (isLoading) {
    return (
      <div className="p-6 text-white">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-poker-accent mx-auto mb-4"></div>
            <p className="text-gray-400">Carregando histórico de sessões...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Histórico de Sessões</h1>
        <p className="text-gray-400">Acompanhe o histórico completo das suas sessões de grind</p>
      </div>

      {/* Filter Controls */}
      <Card className="bg-poker-surface border-gray-700 mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-poker-accent" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div>
              <Label htmlFor="period">Período (dias)</Label>
              <Input
                id="period"
                type="number"
                value={filterPeriod}
                onChange={(e) => setFilterPeriod(e.target.value)}
                className="bg-gray-800 border-gray-600 text-white w-24"
                min="1"
                max="365"
              />
            </div>
            <Button className="bg-poker-accent hover:bg-poker-accent/80">
              Aplicar Filtro
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sessions List */}
      <div className="space-y-4">
        {sessions.length === 0 ? (
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
          sessions.map((session: SessionHistoryData) => {
            console.log("Rendering session:", session.id, "with buttons");
            return (
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
                    <div className="flex items-center gap-3 ml-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            console.log("Edit button clicked for session:", session.id);
                            handleEditSession(session);
                          }}
                          className="h-9 w-9 p-0 border-gray-600 hover:bg-poker-accent/20 bg-gray-700 text-white hover:border-poker-accent"
                          title="Editar sessão"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log("Delete button clicked for session:", session.id);
                            handleDeleteSession(session);
                          }}
                          className="h-9 w-9 p-0 border-gray-600 text-red-400 hover:bg-red-500/20 bg-gray-700 hover:border-red-400"
                          title="Excluir sessão"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Badge 
                        variant="outline" 
                        className="bg-green-900/20 border-green-600/50 text-green-400 whitespace-nowrap"
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

                {/* Tournament Type and Speed Percentages - Always visible */}
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-4 h-4 text-poker-accent" />
                    <span className="text-sm font-medium text-gray-300">Distribuição da Grade Executada</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Tournament Types */}
                    <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-600/50">
                      <h5 className="text-xs font-semibold text-gray-300 mb-2">Tipos de Torneio</h5>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center bg-blue-900/20 border border-blue-600/30 rounded p-2">
                          <div className="text-sm font-bold text-blue-400">
                            {session.vanillaPercentage || 0}%
                          </div>
                          <div className="text-xs text-gray-400">Vanilla</div>
                        </div>
                        <div className="text-center bg-red-900/20 border border-red-600/30 rounded p-2">
                          <div className="text-sm font-bold text-red-400">
                            {session.pkoPercentage || 0}%
                          </div>
                          <div className="text-xs text-gray-400">PKO</div>
                        </div>
                        <div className="text-center bg-purple-900/20 border border-purple-600/30 rounded p-2">
                          <div className="text-sm font-bold text-purple-400">
                            {session.mysteryPercentage || 0}%
                          </div>
                          <div className="text-xs text-gray-400">Mystery</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Tournament Speeds */}
                    <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-600/50">
                      <h5 className="text-xs font-semibold text-gray-300 mb-2">Velocidades</h5>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center bg-green-900/20 border border-green-600/30 rounded p-2">
                          <div className="text-sm font-bold text-green-400">
                            {session.normalSpeedPercentage || 0}%
                          </div>
                          <div className="text-xs text-gray-400">Normal</div>
                        </div>
                        <div className="text-center bg-orange-900/20 border border-orange-600/30 rounded p-2">
                          <div className="text-sm font-bold text-orange-400">
                            {session.turboSpeedPercentage || 0}%
                          </div>
                          <div className="text-xs text-gray-400">Turbo</div>
                        </div>
                        <div className="text-center bg-yellow-900/20 border border-yellow-600/30 rounded p-2">
                          <div className="text-sm font-bold text-yellow-400">
                            {session.hyperSpeedPercentage || 0}%
                          </div>
                          <div className="text-xs text-gray-400">Hyper</div>
                        </div>
                      </div>
                    </div>
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
              
              <CardContent className="bg-[#1f1f1f]">
                <Tabs defaultValue="performance" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 bg-gray-800">
                    <TabsTrigger value="performance" className="data-[state=active]:bg-poker-accent">
                      Performance
                    </TabsTrigger>
                    <TabsTrigger value="mental" className="data-[state=active]:bg-poker-accent">
                      Estado Mental
                    </TabsTrigger>
                    <TabsTrigger value="preparation" className="data-[state=active]:bg-poker-accent">
                      Preparação
                    </TabsTrigger>
                    <TabsTrigger value="objectives" className="data-[state=active]:bg-poker-accent">
                      Objetivos
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="performance" className="mt-4">
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-white mb-3">Detalhes da Performance</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <div className="text-2xl font-bold text-blue-400">{session.volume}</div>
                          <div className="text-sm text-gray-400">Torneios Jogados</div>
                          <div className="text-xs text-gray-500 mt-1">Volume total da sessão</div>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <div className={`text-2xl font-bold ${session.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(session.profit)}
                          </div>
                          <div className="text-sm text-gray-400">Lucro Líquido</div>
                          <div className="text-xs text-gray-500 mt-1">Resultado - Investimento</div>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <div className="text-2xl font-bold text-purple-400">{formatCurrency(session.abiMed)}</div>
                          <div className="text-sm text-gray-400">ABI Médio</div>
                          <div className="text-xs text-gray-500 mt-1">Average buy-in da sessão</div>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <div className={`text-2xl font-bold ${session.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {session.roi.toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-400">ROI da Sessão</div>
                          <div className="text-xs text-gray-500 mt-1">Return on Investment</div>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <div className="text-2xl font-bold text-orange-400">{session.fts}</div>
                          <div className="text-sm text-gray-400">Final Tables</div>
                          <div className="text-xs text-gray-500 mt-1">Mesas finais atingidas</div>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <div className="text-2xl font-bold text-cyan-400">{session.cravadas}</div>
                          <div className="text-sm text-gray-400">Cravadas</div>
                          <div className="text-xs text-gray-500 mt-1">Prêmios &gt; 10x buy-in</div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="mental" className="mt-4">
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-white mb-3">Estado Mental Durante a Sessão</h4>
                      {session.breakCount && session.breakCount > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                          <div className="bg-red-900/20 border border-red-600/30 p-4 rounded-lg">
                            <div className="text-3xl font-bold text-red-400">{(session.energiaMedia || 0).toFixed(1)}</div>
                            <div className="text-sm text-gray-400">Energia Média</div>
                            <div className="text-xs text-gray-500 mt-1">{session.breakCount} medições</div>
                          </div>
                          <div className="bg-blue-900/20 border border-blue-600/30 p-4 rounded-lg">
                            <div className="text-3xl font-bold text-blue-400">{(session.focoMedio || 0).toFixed(1)}</div>
                            <div className="text-sm text-gray-400">Foco Médio</div>
                            <div className="text-xs text-gray-500 mt-1">{session.breakCount} medições</div>
                          </div>
                          <div className="bg-green-900/20 border border-green-600/30 p-4 rounded-lg">
                            <div className="text-3xl font-bold text-green-400">{(session.confiancaMedia || 0).toFixed(1)}</div>
                            <div className="text-sm text-gray-400">Confiança Média</div>
                            <div className="text-xs text-gray-500 mt-1">{session.breakCount} medições</div>
                          </div>
                          <div className="bg-purple-900/20 border border-purple-600/30 p-4 rounded-lg">
                            <div className="text-3xl font-bold text-purple-400">{(session.inteligenciaEmocionalMedia || 0).toFixed(1)}</div>
                            <div className="text-sm text-gray-400">Int. Emocional Média</div>
                            <div className="text-xs text-gray-500 mt-1">{session.breakCount} medições</div>
                          </div>
                          <div className="bg-orange-900/20 border border-orange-600/30 p-4 rounded-lg">
                            <div className="text-3xl font-bold text-orange-400">{(session.interferenciasMedia || 0).toFixed(1)}</div>
                            <div className="text-sm text-gray-400">Interferências Média</div>
                            <div className="text-xs text-gray-500 mt-1">{session.breakCount} medições</div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Coffee className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                          <h3 className="text-lg font-semibold text-gray-300 mb-2">Nenhum Break Feedback</h3>
                          <p className="text-gray-500">Não foram registrados break feedbacks nesta sessão.</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="preparation" className="mt-4">
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-white mb-3">Preparação da Sessão</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <Label className="text-sm text-gray-400">Nível de Preparação</Label>
                          <div className="text-3xl font-bold text-poker-accent mt-1">
                            {session.preparationPercentage || 0}%
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                            <div 
                              className="bg-poker-accent h-2 rounded-full" 
                              style={{ width: `${session.preparationPercentage || 0}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <Label className="text-sm text-gray-400">Observações de Preparação</Label>
                          <div className="text-white mt-1">
                            {session.preparationNotes || "Nenhuma observação registrada"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="objectives" className="mt-4">
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-white mb-3">Objetivos e Conclusões</h4>
                      <div className="space-y-4">
                        {session.dailyGoals && (
                          <div className="bg-gray-800 p-4 rounded-lg">
                            <Label className="text-sm text-gray-400">Objetivos da Sessão</Label>
                            <div className="text-white mt-1">
                              {session.dailyGoals}
                            </div>
                          </div>
                        )}
                        
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm text-gray-400">Objetivo Cumprido</Label>
                            {session.objectiveCompleted !== undefined ? (
                              <div className="flex items-center gap-2">
                                {session.objectiveCompleted ? (
                                  <>
                                    <CheckCircle className="w-6 h-6 text-green-400" />
                                    <span className="text-green-400 font-semibold text-lg">Sim</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-6 h-6 text-red-400" />
                                    <span className="text-red-400 font-semibold text-lg">Não</span>
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-500">Não informado</span>
                            )}
                          </div>
                        </div>

                        {session.finalNotes && (
                          <div className="bg-gray-800 p-4 rounded-lg">
                            <Label className="text-sm text-gray-400">Observações Finais</Label>
                            <div className="text-white mt-1">
                              {session.finalNotes}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
            );
          })
        )}
      </div>

      {/* Edit Session Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Editar Sessão</DialogTitle>
          </DialogHeader>
          {editingSession && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="preparationPercentage" className="text-sm text-gray-400">
                  Nível de Preparação (%)
                </Label>
                <Input
                  id="preparationPercentage"
                  type="number"
                  min="0"
                  max="100"
                  value={editingSession.preparationPercentage || 0}
                  onChange={(e) =>
                    setEditingSession({ ...editingSession, preparationPercentage: parseInt(e.target.value) || 0 })
                  }
                  className="bg-gray-800 border-gray-600 text-white mt-1"
                />
              </div>

              <div>
                <Label htmlFor="preparationNotes" className="text-sm text-gray-400">
                  Observações de Preparação
                </Label>
                <Textarea
                  id="preparationNotes"
                  value={editingSession.preparationNotes || ""}
                  onChange={(e) =>
                    setEditingSession({ ...editingSession, preparationNotes: e.target.value })
                  }
                  className="bg-gray-800 border-gray-600 text-white mt-1"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="dailyGoals" className="text-sm text-gray-400">
                  Objetivos da Sessão
                </Label>
                <Textarea
                  id="dailyGoals"
                  value={editingSession.dailyGoals || ""}
                  onChange={(e) =>
                    setEditingSession({ ...editingSession, dailyGoals: e.target.value })
                  }
                  className="bg-gray-800 border-gray-600 text-white mt-1"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="finalNotes" className="text-sm text-gray-400">
                  Observações Finais
                </Label>
                <Textarea
                  id="finalNotes"
                  value={editingSession.finalNotes || ""}
                  onChange={(e) =>
                    setEditingSession({ ...editingSession, finalNotes: e.target.value })
                  }
                  className="bg-gray-800 border-gray-600 text-white mt-1"
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="objectiveCompleted"
                  checked={editingSession.objectiveCompleted || false}
                  onChange={(e) =>
                    setEditingSession({ ...editingSession, objectiveCompleted: e.target.checked })
                  }
                  className="rounded"
                />
                <Label htmlFor="objectiveCompleted" className="text-sm text-gray-400">
                  Objetivo cumprido
                </Label>
              </div>

              <div className="flex justify-end space-x-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveEdit}
                  disabled={updateSessionMutation.isPending}
                  className="bg-poker-accent hover:bg-poker-accent/80"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateSessionMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Session Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-red-400">Excluir Sessão</DialogTitle>
          </DialogHeader>
          {sessionToDelete && (
            <div className="space-y-4">
              <p className="text-gray-300">
                Tem certeza que deseja excluir a sessão de{" "}
                <span className="font-semibold text-white">
                  {formatDate(sessionToDelete.date)}
                </span>
                ?
              </p>
              <div className="bg-red-900/20 border border-red-600/30 p-4 rounded-lg">
                <p className="text-red-300 text-sm">
                  ⚠️ Esta ação é irreversível. Todos os dados desta sessão, incluindo torneios,
                  break feedbacks e estatísticas serão permanentemente removidos.
                </p>
              </div>
              <div className="flex justify-end space-x-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteDialogOpen(false)}
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmDelete}
                  disabled={deleteSessionMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleteSessionMutation.isPending ? "Excluindo..." : "Excluir"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}