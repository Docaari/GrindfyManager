import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Clock, Brain, TrendingUp, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type StudyCard } from "./types";
import { formatTime } from "./utils";
import { StudySessionTimer } from "./StudySessionTimer";

interface StudyProgressTabProps {
  card: StudyCard;
}

export function StudyProgressTab({ card }: StudyProgressTabProps) {
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [timeToAdd, setTimeToAdd] = useState(0);
  const [knowledgeScore, setKnowledgeScore] = useState(card.knowledgeScore || 0);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: correlationData, isLoading } = useQuery({
    queryKey: ['/api/study-correlation', card.id],
    queryFn: () => apiRequest('GET', `/api/study-correlation/${card.id}`),
    enabled: !!card.id,
  });

  const updateProgressMutation = useMutation({
    mutationFn: async (data: { timeToAdd: number; knowledgeScore: number }) => {
      return apiRequest('POST', `/api/study-cards/${card.id}/progress`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-cards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/study-correlation', card.id] });
      toast({
        title: "Progresso atualizado!",
        description: "Dados de estudo atualizados com sucesso.",
      });
      setShowProgressDialog(false);
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar progresso",
        description: "Não foi possível atualizar o progresso do estudo.",
        variant: "destructive",
      });
    },
  });

  const handleUpdateProgress = () => {
    updateProgressMutation.mutate({ timeToAdd, knowledgeScore });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Analisando correlação...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Progresso & Correlação</h3>
        <Button
          onClick={() => setShowProgressDialog(true)}
          className="bg-primary hover:bg-primary/90 text-black font-semibold"
        >
          <TrendingUp className="w-4 h-4 mr-2" />
          Atualizar Progresso
        </Button>
      </div>

      {/* Study Timer */}
      <StudySessionTimer
        cardId={card.id}
        onTimeUpdate={(timeSeconds) => {
          const timeMinutes = Math.floor(timeSeconds / 60);
          updateProgressMutation.mutate({
            timeToAdd: timeMinutes,
            knowledgeScore: card.knowledgeScore || 0,
          });
        }}
      />

      {/* Current Progress */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tempo Investido</p>
                <p className="text-xl font-bold text-foreground">{formatTime(card.timeInvested || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-500/10 rounded-full flex items-center justify-center">
                <Brain className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Conhecimento</p>
                <p className="text-xl font-bold text-green-400">{card.knowledgeScore || 0}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Correlation Analysis */}
      {correlationData && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Análise de Correlação com Desempenho
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="text-sm font-semibold text-foreground mb-3">Antes do Estudo</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Torneios:</span>
                    <span className="text-foreground">{correlationData?.before?.count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ROI:</span>
                    <span className={(correlationData?.before?.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {correlationData?.before?.roi || 0}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lucro:</span>
                    <span className={(correlationData?.before?.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                      ${correlationData?.before?.profit || 0}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h4 className="text-sm font-semibold text-foreground mb-3">Após o Estudo</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Torneios:</span>
                    <span className="text-foreground">{correlationData?.after?.count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ROI:</span>
                    <span className={(correlationData?.after?.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {correlationData?.after?.roi || 0}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lucro:</span>
                    <span className={(correlationData?.after?.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                      ${correlationData?.after?.profit || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Improvement Insights */}
            <div className="p-4 bg-primary/10 rounded-lg">
              <h4 className="text-sm font-semibold text-primary mb-3">Insights de Melhoria</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Melhoria no ROI:</span>
                  <span className={(correlationData?.improvement?.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {(correlationData?.improvement?.roi || 0) >= 0 ? '+' : ''}{correlationData?.improvement?.roi || 0}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Melhoria no Lucro:</span>
                  <span className={(correlationData?.improvement?.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {(correlationData?.improvement?.profit || 0) >= 0 ? '+' : ''}${correlationData?.improvement?.profit || 0}
                  </span>
                </div>
                {correlationData?.insight?.hasImprovement && (
                  <div className="mt-3 p-3 bg-green-900/20 rounded-lg">
                    <p className="text-green-400 text-sm">
                      {correlationData?.insight?.significantImprovement
                        ? '🎯 Melhoria significativa detectada! Este estudo está tendo impacto positivo no seu desempenho.'
                        : '📈 Melhoria detectada. Continue investindo tempo neste estudo.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Update Dialog */}
      <Dialog open={showProgressDialog} onOpenChange={setShowProgressDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Atualizar Progresso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-foreground">Tempo a Adicionar (minutos)</Label>
              <Input
                type="number"
                value={timeToAdd}
                onChange={(e) => setTimeToAdd(parseInt(e.target.value) || 0)}
                className="bg-muted border-border text-foreground"
                placeholder="60"
              />
            </div>
            <div>
              <Label className="text-foreground">Nível de Conhecimento (%)</Label>
              <Input
                type="number"
                value={knowledgeScore}
                onChange={(e) => setKnowledgeScore(parseInt(e.target.value) || 0)}
                className="bg-muted border-border text-foreground"
                min="0"
                max="100"
                placeholder="70"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowProgressDialog(false)}
              className="text-foreground border-border"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpdateProgress}
              disabled={updateProgressMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-black font-semibold"
            >
              {updateProgressMutation.isPending ? 'Salvando...' : 'Atualizar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
