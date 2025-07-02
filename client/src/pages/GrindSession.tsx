import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GrindSessionLive from "@/pages/GrindSessionLive";
import { Play, Square, Plus, Clock, TrendingUp, Target, Zap, History } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function GrindSession() {
  const [activeSession, setActiveSession] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["/api/grind-sessions"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json();
    },
  });

  const formatCurrency = (num: number | string) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(num));
  };

  if (isLoading) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Grind Session</h2>
          <p className="text-gray-400">Loading your session data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Grind Session</h2>
        <p className="text-gray-400">Gerencie suas sessões de grind em tempo real</p>
      </div>

      <Tabs defaultValue="live" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-poker-surface border border-gray-700">
          <TabsTrigger value="live" className="data-[state=active]:bg-poker-green data-[state=active]:text-white">
            <Zap className="w-4 h-4 mr-2" />
            Sessão Ao Vivo
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-poker-green data-[state=active]:text-white">
            <History className="w-4 h-4 mr-2" />
            Histórico de Sessões
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-6">
          <GrindSessionLive />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <div className="space-y-6">
            <Card className="bg-poker-surface border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Histórico de Sessões</CardTitle>
                <CardDescription className="text-gray-400">
                  Consulte suas sessões anteriores e resultados
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sessions && sessions.length > 0 ? (
                  <div className="space-y-4">
                    {sessions.filter((s: any) => s.status === "completed").map((session: any) => (
                      <div key={session.id} className="p-4 border border-gray-700 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <div className="text-white font-semibold">
                            {new Date(session.date).toLocaleDateString()}
                          </div>
                          <Badge variant="outline" className="text-gray-400">
                            {session.status === "completed" ? "Finalizada" : session.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-gray-400">Duração:</span>
                            <div className="text-white">
                              {session.duration ? `${Math.floor(session.duration / 60)}h ${session.duration % 60}m` : "N/A"}
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-400">Buy-ins:</span>
                            <div className="text-white">{formatCurrency(session.actualBuyins || 0)}</div>
                          </div>
                          <div>
                            <span className="text-gray-400">Resultado:</span>
                            <div className={parseFloat(session.profitLoss || "0") >= 0 ? "text-green-400" : "text-red-400"}>
                              {parseFloat(session.profitLoss || "0") >= 0 ? "+" : ""}
                              {formatCurrency(session.profitLoss || 0)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-400 py-8">
                    <History className="h-12 w-12 mx-auto mb-4" />
                    <p>Nenhuma sessão finalizada encontrada</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}