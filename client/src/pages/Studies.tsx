import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/usePermission";
import AccessDenied from "@/components/AccessDenied";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Plus, Download, AlertCircle, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { type StudyCard, type StudyDashboardStats } from "@/components/studies/types";
import {
  formatTime,
  calculateWeeklyProgress,
  calculateDailyRecommendations,
  calculateStudyEfficiency,
  generatePersonalizedRecommendations,
  calculateStudyStreak,
  calculateCategoryPerformance,
  calculateAchievements,
} from "@/components/studies/utils";
import { StudyStatsCards } from "@/components/studies/StudyStatsCards";
import { StudyNotifications } from "@/components/studies/StudyNotifications";
import { StudyAnalytics } from "@/components/studies/StudyAnalytics";
import { StudyAchievements } from "@/components/studies/StudyAchievements";
import { StudyFilters } from "@/components/studies/StudyFilters";
import { StudySmartRecommendations } from "@/components/studies/StudySmartRecommendations";
import { StudyCardGrid } from "@/components/studies/StudyCardGrid";
import { StudyCardDetail } from "@/components/studies/StudyCardDetail";
import { CreateStudyCardForm, type CreateStudyCardData } from "@/components/studies/CreateStudyCardForm";

export default function Studies() {
  const hasPermission = usePermission('studies_access');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<StudyCard | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch study cards
  const { data: studyCards = [], isLoading, isError, refetch } = useQuery<StudyCard[]>({
    queryKey: ["/api/study-cards"],
  });

  const createStudyCardMutation = useMutation({
    mutationFn: async (data: CreateStudyCardData) => {
      return await apiRequest('POST', '/api/study-cards', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-cards'] });
      toast({
        title: "Sucesso!",
        description: "Card de estudo criado com sucesso.",
      });
      setShowCreateDialog(false);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao criar card de estudo. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const dashboardStats = useMemo<StudyDashboardStats>(() => ({
    totalCards: studyCards.length,
    activeCards: studyCards.filter((card: StudyCard) => card.status === 'active').length,
    completedCards: studyCards.filter((card: StudyCard) => card.status === 'completed').length,
    totalTimeInvested: studyCards.reduce((total: number, card: StudyCard) => total + (card.timeInvested || 0), 0),
    avgKnowledgeScore: studyCards.length > 0
      ? Math.round(studyCards.reduce((total: number, card: StudyCard) => total + (card.knowledgeScore || 0), 0) / studyCards.length)
      : 0,
    weeklyTime: studyCards.reduce((total: number, card: StudyCard) => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return card.updatedAt && new Date(card.updatedAt) > weekAgo ? total + (card.timeInvested || 0) : total;
    }, 0),
    monthlyTime: studyCards.reduce((total: number, card: StudyCard) => {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return card.updatedAt && new Date(card.updatedAt) > monthAgo ? total + (card.timeInvested || 0) : total;
    }, 0),
  }), [studyCards]);

  const filteredCards = useMemo(() => studyCards.filter((card: StudyCard) => {
    const matchesCategory = !selectedCategory || selectedCategory === "all" || card.category === selectedCategory;
    const matchesSearch = !searchQuery ||
      card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [studyCards, selectedCategory, searchQuery]);

  const studyStreak = useMemo(() => calculateStudyStreak(studyCards), [studyCards]);
  const categoryPerformance = useMemo(() => calculateCategoryPerformance(studyCards), [studyCards]);
  const achievements = useMemo(() => calculateAchievements(studyCards, dashboardStats, studyStreak), [studyCards, dashboardStats, studyStreak]);
  const weeklyProgress = useMemo(() => calculateWeeklyProgress(studyCards), [studyCards]);
  const dailyRecommendations = useMemo(() => calculateDailyRecommendations(studyCards), [studyCards]);
  const studyEfficiency = useMemo(() => calculateStudyEfficiency(studyCards), [studyCards]);
  const personalizedRecommendations = useMemo(() => generatePersonalizedRecommendations(studyCards), [studyCards]);

  const handleExportStudyData = useCallback(() => {
    if (studyCards.length === 0) {
      toast({ title: "Nenhum dado para exportar", variant: "destructive" });
      return;
    }

    const csvData = studyCards.map((card: StudyCard) => ({
      Titulo: card.title,
      Categoria: card.category,
      Prioridade: card.priority,
      Status: card.status,
      'Tempo Investido (min)': card.timeInvested || 0,
      'Score Conhecimento': card.knowledgeScore || 0,
      'Data Criacao': card.createdAt ? new Date(card.createdAt).toLocaleDateString('pt-BR') : '',
      'Ultima Atualizacao': card.updatedAt ? new Date(card.updatedAt).toLocaleDateString('pt-BR') : '',
      Objetivos: card.objectives || '',
      Descricao: card.description || ''
    }));

    const csvContent = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map((row: Record<string, any>) => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `grindfy_estudos_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Dados exportados!",
      description: "Arquivo CSV baixado com sucesso.",
    });
  }, [studyCards, toast]);

  if (!hasPermission) {
    return <AccessDenied featureName="Estudos" description="Acesse o centro de estudos e desenvolvimento" currentPlan="free" requiredPlan="pro" pageName="Estudos" onViewPlans={() => { window.location.href = '/subscriptions'; }} />;
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-poker-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h3 className="text-xl font-semibold text-white">Erro ao carregar estudos</h3>
          <p className="text-gray-400">Não foi possível carregar seus dados de estudo.</p>
          <Button onClick={() => refetch()} variant="outline" className="text-white border-gray-600">
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-poker-bg text-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <Skeleton className="h-9 w-48 bg-gray-700 mb-2" />
              <Skeleton className="h-5 w-72 bg-gray-700" />
            </div>
            <Skeleton className="h-10 w-32 bg-gray-700" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="bg-poker-surface border-gray-700">
                <CardHeader className="pb-3"><Skeleton className="h-4 w-24 bg-gray-700" /></CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 bg-gray-700 mb-1" />
                  <Skeleton className="h-3 w-20 bg-gray-700" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Card key={i} className="bg-poker-surface border-gray-700">
                <CardHeader className="pb-3">
                  <Skeleton className="h-5 w-32 bg-gray-700 mb-2" />
                  <Skeleton className="h-4 w-48 bg-gray-700" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-2 w-full bg-gray-700 mb-4" />
                  <Skeleton className="h-4 w-24 bg-gray-700" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-poker-bg text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-poker-accent" />
              Estudos
            </h1>
            <p className="text-gray-400 mt-2">
              Centro de conhecimento e desenvolvimento contínuo
            </p>
          </div>

          <div className="flex items-center gap-3">
            {studyCards.length > 0 && (
              <Button
                variant="outline"
                onClick={handleExportStudyData}
                className="text-white border-gray-600 hover:bg-gray-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </Button>
            )}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="hover:bg-poker-accent/90 text-black font-semibold bg-[#16a249]">
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Estudo
                </Button>
              </DialogTrigger>
            </Dialog>
          </div>
        </div>

        {/* Dashboard Stats */}
        <StudyStatsCards stats={dashboardStats} />

        {/* Create Study Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-[600px] bg-poker-surface border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white">Criar Novo Cartão de Estudo</DialogTitle>
              <DialogDescription className="text-gray-400">
                Organize seu aprendizado com objetivos claros e métricas mensuráveis
              </DialogDescription>
            </DialogHeader>
            <CreateStudyCardForm
              onClose={() => setShowCreateDialog(false)}
              onSubmit={createStudyCardMutation.mutate}
            />
          </DialogContent>
        </Dialog>

        {/* Study Notifications */}
        <StudyNotifications stats={dashboardStats} dailyRecommendations={dailyRecommendations} />

        {/* Advanced Analytics */}
        {studyCards.length > 0 && (
          <StudyAnalytics
            studyStreak={studyStreak}
            categoryPerformance={categoryPerformance}
            weeklyProgress={weeklyProgress}
            studyEfficiency={studyEfficiency}
            personalizedRecommendations={personalizedRecommendations}
          />
        )}

        {/* Achievements Section */}
        <StudyAchievements achievements={achievements} />

        {/* Filters and Search */}
        <StudyFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />

        {/* Study Recommendations */}
        {studyCards.length > 0 && (
          <StudySmartRecommendations
            studyCards={studyCards}
            onSelectCard={setSelectedCard}
          />
        )}

        {/* Study Cards Grid */}
        <StudyCardGrid
          filteredCards={filteredCards}
          searchQuery={searchQuery}
          selectedCategory={selectedCategory}
          onSelectCard={setSelectedCard}
          onCreateNew={() => setShowCreateDialog(true)}
        />
      </div>

      {/* Study Card Detail Dialog */}
      <Dialog open={!!selectedCard} onOpenChange={() => setSelectedCard(null)}>
        <DialogContent className="sm:max-w-[800px] bg-poker-surface border-gray-700">
          {selectedCard && (
            <StudyCardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
