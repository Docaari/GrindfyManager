import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Clock, Target, Trophy, DollarSign, TrendingUp, Coffee, FileText, CheckCircle, XCircle } from "lucide-react";

interface SessionHistoryData {
  id: string;
  date: string;
  status: string;
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
  energiaMedia: number;
  focoMedio: number;
  confiancaMedia: number;
  inteligenciaEmocionalMedia: number;
}

export default function SessionHistory() {
  const [filterPeriod, setFilterPeriod] = useState("30");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["/api/grind-sessions/history"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch session history");
      const sessions = await response.json();
      
      // Filter only completed sessions and calculate stats
      return sessions
        .filter((session: any) => session.status === "completed")
        .map((session: any) => ({
          ...session,
          volume: 0, // Will be calculated from API
          profit: 0,
          abiMed: 0,
          roi: 0,
          fts: 0,
          cravadas: 0,
          energiaMedia: 0,
          focoMedio: 0,
          confiancaMedia: 0,
          inteligenciaEmocionalMedia: 0,
        }));
    },
  });

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
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-poker-accent" />
                      {formatDate(session.date)}
                    </CardTitle>
                    <CardDescription className="text-gray-400 mt-1">
                      Sessão de grind • ID: {session.id.slice(0, 8)}...
                    </CardDescription>
                  </div>
                  <Badge 
                    variant="outline" 
                    className="bg-green-900/20 border-green-600/50 text-green-400"
                  >
                    Concluída
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
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
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-400">{session.volume}</div>
                        <div className="text-sm text-gray-400">Volume</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${session.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(session.profit)}
                        </div>
                        <div className="text-sm text-gray-400">Profit</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-400">{formatCurrency(session.abiMed)}</div>
                        <div className="text-sm text-gray-400">ABI Médio</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${session.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {session.roi.toFixed(1)}%
                        </div>
                        <div className="text-sm text-gray-400">ROI</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-400">{session.fts}</div>
                        <div className="text-sm text-gray-400">FTs</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-cyan-400">{session.cravadas}</div>
                        <div className="text-sm text-gray-400">Cravadas</div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="mental" className="mt-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-400">{session.energiaMedia.toFixed(1)}</div>
                        <div className="text-sm text-gray-400">Média de Energia</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-400">{session.focoMedio.toFixed(1)}</div>
                        <div className="text-sm text-gray-400">Média de Foco</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-400">{session.confiancaMedia.toFixed(1)}</div>
                        <div className="text-sm text-gray-400">Média de Confiança</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-400">{session.inteligenciaEmocionalMedia.toFixed(1)}</div>
                        <div className="text-sm text-gray-400">Média de Int. Emocional</div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="preparation" className="mt-4">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm text-gray-400">Nível de Preparação</Label>
                        <div className="text-xl font-semibold text-white">
                          {session.preparationPercentage || 0}%
                        </div>
                      </div>
                      {session.preparationNotes && (
                        <div>
                          <Label className="text-sm text-gray-400">Observações de Preparação</Label>
                          <div className="text-white bg-gray-800 p-3 rounded-md mt-1">
                            {session.preparationNotes}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="objectives" className="mt-4">
                    <div className="space-y-4">
                      {session.dailyGoals && (
                        <div>
                          <Label className="text-sm text-gray-400">Objetivos da Sessão</Label>
                          <div className="text-white bg-gray-800 p-3 rounded-md mt-1">
                            {session.dailyGoals}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3">
                        <Label className="text-sm text-gray-400">Objetivo Cumprido:</Label>
                        {session.objectiveCompleted !== undefined ? (
                          <div className="flex items-center gap-2">
                            {session.objectiveCompleted ? (
                              <>
                                <CheckCircle className="w-5 h-5 text-green-400" />
                                <span className="text-green-400 font-medium">Sim</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-5 h-5 text-red-400" />
                                <span className="text-red-400 font-medium">Não</span>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500">Não informado</span>
                        )}
                      </div>

                      {session.finalNotes && (
                        <div>
                          <Label className="text-sm text-gray-400">Observações Finais</Label>
                          <div className="text-white bg-gray-800 p-3 rounded-md mt-1">
                            {session.finalNotes}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}