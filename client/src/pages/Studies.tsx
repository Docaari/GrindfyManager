import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { usePermission } from '@/hooks/usePermission';
import AccessDenied from '@/components/AccessDenied';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { BookOpen, Plus, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ThemeGrid } from '@/components/studies-v2/ThemeGrid';
import { ThemeDetail } from '@/components/studies-v2/ThemeDetail';
import { CreateThemeDialog } from '@/components/studies-v2/CreateThemeDialog';
import type { StudyTheme } from '@/components/studies-v2/types';

export default function Studies() {
  const hasPermission = usePermission('studies_access');
  const [selectedTheme, setSelectedTheme] = useState<StudyTheme | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all themes
  const {
    data: themes = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<StudyTheme[]>({
    queryKey: ['/api/study-themes'],
  });

  // Create theme mutation
  const createThemeMutation = useMutation({
    mutationFn: async (data: { name: string; color: string; emoji: string }) => {
      return await apiRequest('POST', '/api/study-themes', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-themes'] });
      setShowCreateDialog(false);
      toast({
        title: 'Tema criado',
        description: 'Novo tema de estudo criado com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Erro ao criar tema de estudo.',
        variant: 'destructive',
      });
    },
  });

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (themeId: string) => {
      const theme = themes.find((t) => t.id === themeId);
      if (!theme) return;
      return await apiRequest('PUT', `/api/study-themes/${themeId}`, {
        isFavorite: !theme.isFavorite,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-themes'] });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar favorito.',
        variant: 'destructive',
      });
    },
  });

  // Delete theme mutation
  const deleteThemeMutation = useMutation({
    mutationFn: async (themeId: string) => {
      return await apiRequest('DELETE', `/api/study-themes/${themeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-themes'] });
      toast({
        title: 'Tema deletado',
        description: 'Tema e todo seu conteudo foram removidos.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Erro ao deletar tema.',
        variant: 'destructive',
      });
    },
  });

  // Rename theme mutation
  const renameThemeMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return await apiRequest('PUT', `/api/study-themes/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-themes'] });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Erro ao renomear tema.',
        variant: 'destructive',
      });
    },
  });

  const handleRenameTheme = useCallback(
    (id: string, name: string) => {
      renameThemeMutation.mutate({ id, name });
    },
    [renameThemeMutation]
  );

  if (!hasPermission) {
    return (
      <AccessDenied
        featureName="Estudos"
        description="Organize seu conhecimento de poker por temas e spots"
        currentPlan="free"
        requiredPlan="pro"
        pageName="Estudos"
        onViewPlans={() => {
          window.location.href = '/subscriptions';
        }}
      />
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-poker-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h3 className="text-xl font-semibold text-white">
            Erro ao carregar estudos
          </h3>
          <p className="text-gray-400">
            Nao foi possivel carregar seus temas de estudo.
          </p>
          <Button
            onClick={() => refetch()}
            variant="outline"
            className="text-white border-gray-600"
          >
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-3">
                  <Skeleton className="h-5 w-32 bg-gray-700" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-3 w-24 bg-gray-700" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Theme detail view
  if (selectedTheme) {
    return (
      <div className="min-h-screen bg-poker-bg text-white p-6">
        <div className="max-w-7xl mx-auto">
          <ThemeDetail
            theme={selectedTheme}
            onBack={() => setSelectedTheme(null)}
            onRenameTheme={handleRenameTheme}
          />
        </div>
      </div>
    );
  }

  // Theme grid view (main)
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
              Organize seu conhecimento de poker por temas e spots
            </p>
          </div>

          <Button
            onClick={() => setShowCreateDialog(true)}
            className="hover:bg-poker-accent/90 text-black font-semibold bg-[#16a249]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Tema
          </Button>
        </div>

        {/* Search bar */}
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar temas..."
            className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
          />
        </div>

        {/* Theme grid */}
        <ThemeGrid
          themes={themes}
          onSelectTheme={setSelectedTheme}
          onCreateTheme={() => setShowCreateDialog(true)}
          onToggleFavorite={(id) => toggleFavoriteMutation.mutate(id)}
          onDeleteTheme={(id) => deleteThemeMutation.mutate(id)}
          searchTerm={searchTerm}
        />

        {/* Create theme dialog */}
        <CreateThemeDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onCreateTheme={(data) => createThemeMutation.mutate(data)}
        />
      </div>
    </div>
  );
}
