import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, Target, Trophy, DollarSign, TrendingUp, Coffee, FileText, CheckCircle, XCircle, Edit, Trash2, Eye } from "lucide-react";

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

export default function SessionHistory() {
  const [filterPeriod, setFilterPeriod] = useState("30");
  const [editingSession, setEditingSession] = useState<SessionHistoryData | null>(null);
  const [editForm, setEditForm] = useState({
    preparationPercentage: 0,
    preparationNotes: "",
    dailyGoals: "",
    finalNotes: "",
    objectiveCompleted: false,
    // Session statistics - editable
    volume: 0,
    profit: 0,
    abiMed: 0,
    roi: 0,
    fts: 0,
    cravadas: 0
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["/api/grind-sessions/history"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions/history", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch session history");
      return response.json();
    },
  });

  // Edit session mutation
  const editSessionMutation = useMutation({
    mutationFn: async ({ sessionId, data }: { sessionId: string, data: any }) => {
      const response = await fetch(`/api/grind-sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update session");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
      setEditingSession(null);
      toast({
        title: "Sessão atualizada",
        description: "As informações da sessão foram atualizadas com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao atualizar a sessão.",
        variant: "destructive",
      });
    },
  });

  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch(`/api/grind-sessions/${sessionId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete session");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
      toast({
        title: "Sessão excluída",
        description: "A sessão foi excluída com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao excluir a sessão.",
        variant: "destructive",
      });
    },
  });

  const handleEditSession = (session: SessionHistoryData) => {
    setEditingSession(session);
    setEditForm({
      preparationPercentage: session.preparationPercentage || 0,
      preparationNotes: session.preparationNotes || "",
      dailyGoals: session.dailyGoals || "",
      finalNotes: session.finalNotes || "",
      objectiveCompleted: session.objectiveCompleted || false,
      volume: session.volume || 0,
      profit: session.profit || 0,
      abiMed: session.abiMed || 0,
      roi: session.roi || 0,
      fts: session.fts || 0,
      cravadas: session.cravadas || 0
    });
  };

  const handleSaveEdit = () => {
    if (!editingSession) return;
    
    editSessionMutation.mutate({
      sessionId: editingSession.id,
      data: editForm
    });
  };

  const handleDeleteSession = (sessionId: string) => {
    deleteSessionMutation.mutate(sessionId);
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
          sessions.map((session: SessionHistoryData) => (
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
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditSession(session)}
                        className="h-8 px-2 border-gray-600 hover:bg-gray-700 text-gray-400 hover:text-white"
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 border-red-600/50 hover:bg-red-700/20 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-poker-surface border-gray-700">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-white">Confirmar Exclusão</AlertDialogTitle>
                            <AlertDialogDescription className="text-gray-400">
                              Tem certeza que deseja excluir esta sessão? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-gray-700 text-gray-300 hover:bg-gray-600">
                              Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteSession(session.id)}
                              className="bg-red-700 hover:bg-red-800 text-white"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
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
          ))
        )}
      </div>

      {/* Edit Session Modal */}
      <Dialog open={editingSession !== null} onOpenChange={() => setEditingSession(null)}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Editar Sessão</DialogTitle>
            <DialogDescription className="text-gray-400">
              Edite as informações da sessão de {editingSession && formatDate(editingSession.date)}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 max-h-[600px] overflow-y-auto">
            {/* Session Statistics Section */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-300">Estatísticas da Sessão</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">Volume</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editForm.volume}
                    onChange={(e) => setEditForm({...editForm, volume: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">Profit (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.profit}
                    onChange={(e) => setEditForm({...editForm, profit: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">ABI Médio (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.abiMed}
                    onChange={(e) => setEditForm({...editForm, abiMed: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">ROI (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={editForm.roi}
                    onChange={(e) => setEditForm({...editForm, roi: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">FTs</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editForm.fts}
                    onChange={(e) => setEditForm({...editForm, fts: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">Cravadas</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editForm.cravadas}
                    onChange={(e) => setEditForm({...editForm, cravadas: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Preparation Section */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-300">Preparação</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-gray-400">Porcentagem de Preparação:</Label>
                  <span className="text-sm text-white font-medium">{editForm.preparationPercentage}%</span>
                </div>
                <Input
                  type="range"
                  min="0"
                  max="100"
                  value={editForm.preparationPercentage}
                  onChange={(e) => setEditForm({...editForm, preparationPercentage: Number(e.target.value)})}
                  className="w-full"
                />
                <Textarea
                  placeholder="Observações sobre a preparação..."
                  value={editForm.preparationNotes}
                  onChange={(e) => setEditForm({...editForm, preparationNotes: e.target.value})}
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-500"
                  rows={3}
                />
              </div>
            </div>

            {/* Daily Goals Section */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-300">Objetivos Diários</Label>
              <Textarea
                placeholder="Descreva os objetivos definidos para esta sessão..."
                value={editForm.dailyGoals}
                onChange={(e) => setEditForm({...editForm, dailyGoals: e.target.value})}
                className="bg-gray-800 border-gray-600 text-white placeholder-gray-500"
                rows={3}
              />
            </div>

            {/* Objective Completion */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-300">Conclusão dos Objetivos</Label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="objective-completed"
                  checked={editForm.objectiveCompleted}
                  onChange={(e) => setEditForm({...editForm, objectiveCompleted: e.target.checked})}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-poker-accent"
                />
                <Label htmlFor="objective-completed" className="text-sm text-gray-300">
                  Objetivos foram completados
                </Label>
              </div>
            </div>

            {/* Final Notes Section */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-300">Observações Finais</Label>
              <Textarea
                placeholder="Reflexões e observações sobre a sessão..."
                value={editForm.finalNotes}
                onChange={(e) => setEditForm({...editForm, finalNotes: e.target.value})}
                className="bg-gray-800 border-gray-600 text-white placeholder-gray-500"
                rows={4}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button 
              variant="outline" 
              onClick={() => setEditingSession(null)}
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={editSessionMutation.isPending}
              className="bg-poker-accent hover:bg-poker-accent/80 text-white"
            >
              {editSessionMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}