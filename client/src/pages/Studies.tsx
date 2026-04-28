import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { usePermission } from '@/hooks/usePermission';
import AccessDenied from '@/components/AccessDenied';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Plus, Search, AlertCircle, RefreshCw, Clock, Flame, ChevronDown, ChevronUp, AlertTriangle, Lightbulb } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ThemeGrid } from '@/components/studies-v2/ThemeGrid';
import { ThemeDetail } from '@/components/studies-v2/ThemeDetail';
import { CreateThemeDialog } from '@/components/studies-v2/CreateThemeDialog';
import { SearchResults } from '@/components/studies-v2/SearchResults';
import PendingSpotsTab from '@/components/studies/PendingSpotsTab';
import type { StudyTheme } from '@/components/studies-v2/types';
import { getStudyTemplates } from '@/lib/study-suggestions-helpers';
import { getMasteryLevel, calculateThemeProgress } from '@/lib/study-progress-helpers';

interface SearchResult {
  tabId: string;
  tabName: string;
  tabTags: string[] | null;
  themeId: string;
  themeName: string;
  themeEmoji: string;
  themeColor: string;
}

export default function Studies() {
  const hasPermission = usePermission('studies_access');
  const [selectedTheme, setSelectedTheme] = useState<StudyTheme | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDialogInitial, setCreateDialogInitial] = useState<{ name?: string; color?: string; emoji?: string }>({});
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(true);
  const [templatesExpanded, setTemplatesExpanded] = useState<boolean | null>(null); // null = auto
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

  // FP-16: Fetch study suggestions based on leaks
  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery<any[]>({
    queryKey: ['/api/study/suggestions'],
    staleTime: 5 * 60 * 1000,
  });

  // FP-17: Fetch study stats (mini-dashboard)
  const { data: studyStats } = useQuery<{ hoursThisMonth: number; themesInProgress: number; streakDays: number }>({
    queryKey: ['/api/study/stats'],
    staleTime: 5 * 60 * 1000,
  });

  // FP-16: Templates
  const studyTemplates = getStudyTemplates();

  // Auto-collapse templates if user has >= 3 themes
  const isTemplatesExpanded = templatesExpanded !== null ? templatesExpanded : (themes.length < 3);

  // Global search query
  const {
    data: searchResults = [],
    isFetching: isSearching,
  } = useQuery<SearchResult[]>({
    queryKey: ['/api/study-themes/search', globalSearchTerm],
    queryFn: async () => {
      if (!globalSearchTerm || globalSearchTerm.length < 2) return [];
      const res = await fetch(
        `/api/study-themes/search?q=${encodeURIComponent(globalSearchTerm)}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: globalSearchTerm.length >= 2,
  });

  const isSearchMode = globalSearchTerm.length >= 2;

  // Create theme mutation
  const createThemeMutation = useMutation({
    mutationFn: async (data: { name: string; color: string; emoji: string }) => {
      return await apiRequest('POST', '/api/study-themes', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-themes'] });
      setShowCreateDialog(false);
      setCreateDialogInitial({});
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

  const handleSearchResultSelect = useCallback(
    (themeId: string, _tabId: string) => {
      const theme = themes.find((t) => t.id === themeId);
      if (theme) {
        setSelectedTheme(theme);
        setGlobalSearchTerm('');
        setSearchTerm('');
      }
    },
    [themes]
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setGlobalSearchTerm(searchTerm);
    }
  };

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
            Nao foi possivel carregar seus temas de estudo. Tente novamente.
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

        {/* FP-17: Mini-dashboard de estudos */}
        {studyStats && (
          <div className="mb-6">
            {studyStats.hoursThisMonth === 0 && studyStats.themesInProgress === 0 && studyStats.streakDays === 0 ? (
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 text-center">
                <Lightbulb className="w-5 h-5 text-yellow-400 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Comece a estudar hoje para acompanhar seu progresso aqui.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-800/80 border border-gray-700/50 rounded-lg p-4 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-blue-400" />
                  <div>
                    <div className="text-lg font-bold text-white">{studyStats.hoursThisMonth}h</div>
                    <div className="text-xs text-gray-400">estudadas este mes</div>
                  </div>
                </div>
                <div className="bg-gray-800/80 border border-gray-700/50 rounded-lg p-4 flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-green-400" />
                  <div>
                    <div className="text-lg font-bold text-white">{studyStats.themesInProgress}</div>
                    <div className="text-xs text-gray-400">temas em progresso</div>
                  </div>
                </div>
                <div className="bg-gray-800/80 border border-gray-700/50 rounded-lg p-4 flex items-center gap-3">
                  <Flame className="w-5 h-5 text-orange-400" />
                  <div>
                    <div className="text-lg font-bold text-white">
                      {studyStats.streakDays} {studyStats.streakDays >= 7 ? '🔥' : ''}
                    </div>
                    <div className="text-xs text-gray-400">dias de streak</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FP-16: Sugestoes baseadas em leaks */}
        {suggestionsLoading && (
          <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 bg-gray-700 rounded-lg" />
            ))}
          </div>
        )}
        {!suggestionsLoading && suggestions.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setSuggestionsExpanded(!suggestionsExpanded)}
              className="flex items-center gap-2 text-sm text-gray-300 hover:text-white mb-3 transition-colors"
            >
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="font-medium">Sugerido para Voce</span>
              {suggestionsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {suggestionsExpanded && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {suggestions.map((s: any, idx: number) => (
                  <Card key={idx} className="bg-gray-800/80 border-gray-700/50">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-semibold text-white">{s.suggestedTopic}</h4>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            s.severity >= 4 ? 'text-red-400 border-red-600/40' :
                            s.severity === 3 ? 'text-yellow-400 border-yellow-600/40' :
                            'text-green-400 border-green-600/40'
                          }`}
                        >
                          {s.severity}/5
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400 mb-3 line-clamp-2">
                        {s.description?.substring(0, 100)}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs bg-gray-700/50 border-gray-600 hover:bg-gray-600 text-white"
                        onClick={() => {
                          setCreateDialogInitial({ name: s.suggestedTopic });
                          setShowCreateDialog(true);
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Criar Tema
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FP-16: Templates de estudo */}
        <div className="mb-6">
          <button
            onClick={() => setTemplatesExpanded(!isTemplatesExpanded)}
            className="flex items-center gap-2 text-sm text-gray-300 hover:text-white mb-3 transition-colors"
          >
            <BookOpen className="w-4 h-4 text-poker-accent" />
            <span className="font-medium">Templates</span>
            {isTemplatesExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {isTemplatesExpanded && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {studyTemplates.map((tpl) => {
                const alreadyCreated = themes.some(
                  (t) => t.name.toLowerCase() === tpl.name.toLowerCase()
                );
                return (
                  <Card key={tpl.id} className="bg-gray-800/60 border-gray-700/40">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white">{tpl.name}</span>
                        {alreadyCreated && (
                          <Badge variant="outline" className="text-[9px] text-gray-400 border-gray-600">
                            Ja criado
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 mb-2 line-clamp-1">{tpl.description}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full text-[11px] h-7 text-gray-300 hover:text-white hover:bg-gray-700"
                        disabled={alreadyCreated}
                        onClick={() => {
                          setCreateDialogInitial({ name: tpl.name });
                          setShowCreateDialog(true);
                        }}
                      >
                        {alreadyCreated ? 'Ja criado' : 'Criar a partir deste template'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Sprint F2 RF-10: Spots Pendentes */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-300 mb-3">
            <BookOpen className="w-4 h-4 text-poker-accent" />
            <span className="font-medium">Spots Pendentes</span>
          </div>
          <PendingSpotsTab />
        </div>

        {/* Search bar */}
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Buscar temas... (Enter para busca global)"
            className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
          />
          {searchTerm.length >= 2 && (
            <div className="flex items-center gap-2 mt-1">
              <button
                className="text-[11px] text-blue-400 hover:text-blue-300"
                onClick={() => setGlobalSearchTerm(searchTerm)}
              >
                Buscar em todo o conteudo
              </button>
              {isSearchMode && (
                <button
                  className="text-[11px] text-gray-500 hover:text-gray-300"
                  onClick={() => {
                    setGlobalSearchTerm('');
                    setSearchTerm('');
                  }}
                >
                  Limpar busca
                </button>
              )}
            </div>
          )}
        </div>

        {/* Search results or theme grid */}
        {isSearchMode ? (
          <SearchResults
            results={searchResults}
            onSelectResult={handleSearchResultSelect}
            searchTerm={globalSearchTerm}
          />
        ) : (
          <ThemeGrid
            themes={themes}
            onSelectTheme={setSelectedTheme}
            onCreateTheme={() => setShowCreateDialog(true)}
            onToggleFavorite={(id) => toggleFavoriteMutation.mutate(id)}
            onDeleteTheme={(id) => deleteThemeMutation.mutate(id)}
            searchTerm={searchTerm}
          />
        )}

        {/* Create theme dialog */}
        <CreateThemeDialog
          open={showCreateDialog}
          onOpenChange={(open) => {
            setShowCreateDialog(open);
            if (!open) setCreateDialogInitial({});
          }}
          onCreateTheme={(data) => createThemeMutation.mutate(data)}
          initialName={createDialogInitial.name}
          initialColor={createDialogInitial.color}
          initialEmoji={createDialogInitial.emoji}
        />
      </div>
    </div>
  );
}
