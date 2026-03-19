import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import AutoUpload from "@/components/AutoUpload";
import { Upload, CheckCircle, AlertCircle, FileText, Database, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";

interface UploadHistory {
  id: string;
  filename: string;
  status: "success" | "error" | "processing";
  tournamentsCount: number;
  uploadDate: string;
  errorMessage?: string;
}

export default function UploadHistory() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    imported: number;
    errors: number;
    duplicates: number;
    show: boolean;
  } | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();

  // Fetch upload history
  const uploadHistoryQuery = useQuery({
    queryKey: ["/api/upload-history"],
    enabled: isAuthenticated,
    queryFn: async () => {
      return apiRequest('GET', '/api/upload-history');
    },
  });

  // Fetch upload statistics
  const uploadStatsQuery = useQuery({
    queryKey: ["/api/upload-stats"],
    enabled: isAuthenticated,
    queryFn: async () => {
      return apiRequest('GET', '/api/upload-stats');
    },
  });

  // Fetch site statistics
  const siteStatsQuery = useQuery({
    queryKey: ["/api/tournaments/sites"],
    enabled: isAuthenticated,
    queryFn: async () => {
      return apiRequest('GET', '/api/tournaments/sites');
    },
  });

  // Delete upload mutation
  const deleteUploadMutation = useMutation({
    mutationFn: async (uploadId: string) => {

      const response = await apiRequest('DELETE', `/api/upload-history/${uploadId}`);

      return response;
    },
    onSuccess: () => {
      toast({
        title: "Upload excluído",
        description: "O upload foi removido com sucesso",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/upload-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments/sites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: "Não foi possível excluir o upload",
        variant: "destructive",
      });
    },
  });

  // Page-level loading state
  if (uploadHistoryQuery.isLoading && siteStatsQuery.isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6 flex justify-center items-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
          <p className="text-gray-400">Carregando dados de upload...</p>
        </div>
      </div>
    );
  }

  // Page-level error state
  if (uploadHistoryQuery.isError && siteStatsQuery.isError) {
    return (
      <div className="max-w-7xl mx-auto p-6 flex justify-center items-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
          <p className="text-red-400 text-lg font-semibold">Erro ao carregar dados</p>
          <p className="text-gray-400">Não foi possível carregar o histórico de uploads.</p>
          <Button
            onClick={() => {
              uploadHistoryQuery.refetch();
              siteStatsQuery.refetch();
            }}
            className="bg-poker-gold hover:bg-poker-gold/80 text-black"
          >
            Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header Section */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-white">Histórico de Upload</h1>
        <p className="text-gray-400 text-lg">Gerencie e monitore suas importações de torneios</p>
      </div>

      {/* File Upload Section - Modernized */}
      <Card className="bg-poker-surface border-gray-700 shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-white flex items-center justify-center gap-3 text-xl">
            <Upload className="h-6 w-6 text-poker-gold" />
            Importar Torneios
          </CardTitle>
          <CardDescription className="text-gray-300 text-base">
            Faça upload de arquivos CSV ou Excel para importar seus dados de torneios
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <AutoUpload
            onUploadComplete={(result) => {
              setIsUploading(false);

              // Invalidate ALL related queries to ensure fresh data

              // Upload page queries
              queryClient.invalidateQueries({ queryKey: ['/api/upload-history'] });
              queryClient.invalidateQueries({ queryKey: ['/api/upload-stats'] });
              queryClient.invalidateQueries({ queryKey: ['/api/tournaments/sites'] });

              // Dashboard queries
              queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
              queryClient.invalidateQueries({ queryKey: ['/api/tournaments'] });
              queryClient.invalidateQueries({ queryKey: ['/api/analytics/by-site'] });
              queryClient.invalidateQueries({ queryKey: ['/api/analytics/by-category'] });
              queryClient.invalidateQueries({ queryKey: ['/api/analytics/by-speed'] });
              queryClient.invalidateQueries({ queryKey: ['/api/analytics/by-buyin'] });
              queryClient.invalidateQueries({ queryKey: ['/api/analytics/by-month'] });
              queryClient.invalidateQueries({ queryKey: ['/api/analytics/by-field'] });
              queryClient.invalidateQueries({ queryKey: ['/api/analytics/final-table'] });
              queryClient.invalidateQueries({ queryKey: ['/api/debug/date-range'] });


              toast({
                title: "Sucesso",
                description: result.message || "Upload realizado com sucesso",
                variant: "default",
              });
            }}
          />
        </CardContent>
      </Card>

      {/* Estatísticas Resumidas - Cards Modernos */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white text-center">Estatísticas Resumidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-poker-surface border-gray-700 shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-[1.02]">
            <CardHeader className="text-center pb-3">
              <div className="mx-auto w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mb-2">
                <Database className="h-6 w-6 text-blue-400" />
              </div>
              <CardTitle className="text-white text-lg font-semibold">Total de Torneios</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-3xl font-bold text-white mb-2">
                {Array.isArray(siteStatsQuery.data)
                  ? siteStatsQuery.data.reduce((total: number, site: any) => total + parseInt(site.count || 0), 0)
                  : 0}
              </div>
              <p className="text-sm text-gray-400">
                Torneios importados
              </p>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700 shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-[1.02]">
            <CardHeader className="text-center pb-3">
              <div className="mx-auto w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mb-2">
                <CheckCircle className="h-6 w-6 text-green-400" />
              </div>
              <CardTitle className="text-white text-lg font-semibold">Sites Ativos</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-3xl font-bold text-white mb-2">
                {Array.isArray(siteStatsQuery.data)
                  ? siteStatsQuery.data.filter((site: any) => parseInt(site.count || 0) > 0).length
                  : 0}
              </div>
              <p className="text-sm text-gray-400">
                Sites com dados
              </p>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700 shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-[1.02]">
            <CardHeader className="text-center pb-3">
              <div className="mx-auto w-12 h-12 bg-poker-gold/20 rounded-full flex items-center justify-center mb-2">
                <Upload className="h-6 w-6 text-poker-gold" />
              </div>
              <CardTitle className="text-white text-lg font-semibold">Uploads Concluídos</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-3xl font-bold text-white mb-2">
                {Array.isArray(uploadHistoryQuery.data)
                  ? uploadHistoryQuery.data.filter((upload: any) => upload.status === 'success').length
                  : 0}
              </div>
              <p className="text-sm text-gray-400">
                Imports realizados
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Histórico de Uploads - Modernizado */}
      <Card className="bg-poker-surface border-gray-700 shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-white flex items-center justify-center gap-3 text-xl">
            <Database className="h-6 w-6 text-poker-gold" />
            Histórico de Uploads
          </CardTitle>
          <CardDescription className="text-gray-300 text-base">
            Visualize e gerencie todos os seus uploads anteriores
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {uploadHistoryQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          ) : uploadHistoryQuery.data?.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum upload encontrado</p>
              <p className="text-sm">Faça seu primeiro upload usando o formulário acima</p>
            </div>
          ) : (
            <div className="space-y-4">
              {uploadHistoryQuery.data?.map((upload: any) => (
                <Card key={upload.id} className="bg-gray-800 border-gray-600 hover:bg-gray-750 transition-colors duration-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            upload.status === 'success' ? 'bg-green-500/20' : 'bg-red-500/20'
                          }`}>
                            {upload.status === 'success' ? (
                              <CheckCircle className="h-5 w-5 text-green-400" />
                            ) : (
                              <AlertCircle className="h-5 w-5 text-red-400" />
                            )}
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-semibold text-lg">{upload.filename}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-sm text-gray-400">
                              <strong>{upload.tournamentsCount}</strong> torneios
                            </span>
                            <span className="text-sm text-gray-400">•</span>
                            <span className="text-sm text-gray-400">
                              {new Date(upload.uploadDate).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          {upload.errorMessage && (
                            <p className="text-sm text-red-400 mt-2 bg-red-900/20 p-2 rounded">{upload.errorMessage}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Badge
                          variant={upload.status === 'success' ? 'default' : 'destructive'}
                          className={`${upload.status === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} px-3 py-1`}
                        >
                          {upload.status === 'success' ? 'Sucesso' : 'Erro'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteUploadMutation.mutate(upload.id)}
                          disabled={deleteUploadMutation.isPending}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Result Summary */}
      {uploadResult?.show && (
        <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-6">
          <h3 className="text-green-400 flex items-center gap-2 text-lg font-semibold mb-4">
            <CheckCircle className="h-5 w-5" />
            Resultado do Upload
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-500/10 rounded-lg">
              <div className="text-2xl font-bold text-green-400 mb-1">
                {uploadResult.imported}
              </div>
              <div className="text-sm text-green-300">Torneios Importados</div>
            </div>
            <div className="text-center p-4 bg-yellow-500/10 rounded-lg">
              <div className="text-2xl font-bold text-yellow-400 mb-1">
                {uploadResult.duplicates}
              </div>
              <div className="text-sm text-yellow-300">Duplicados Ignorados</div>
            </div>
            <div className="text-center p-4 bg-red-500/10 rounded-lg">
              <div className="text-2xl font-bold text-red-400 mb-1">
                {uploadResult.errors}
              </div>
              <div className="text-sm text-red-300">Erros de Importação</div>
            </div>
          </div>
        </div>
      )}

      {/* Granular Data Cleanup Section */}
      <GranularDataCleanup />
    </div>
  );
}

// Granular Data Cleanup Component
function GranularDataCleanup() {
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available sites
  const { data: sites } = useQuery({
    queryKey: ["/api/tournaments/sites"],
    queryFn: async () => {
      return apiRequest('GET', '/api/tournaments/sites');
    },
  });

  // Preview count mutation
  const previewMutation = useMutation({
    mutationFn: async (filters: { sites: string[]; dateFrom?: string; dateTo?: string }) => {
      return apiRequest('POST', '/api/tournaments/bulk-delete/preview', filters);
    },
    onSuccess: (data) => {
      setPreviewCount(data.count);
    },
  });

  // Bulk delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (filters: { sites: string[]; dateFrom?: string; dateTo?: string; confirmation: string }) => {
      return apiRequest('POST', '/api/tournaments/bulk-delete', filters);
    },
    onSuccess: (data) => {
      toast({
        title: "Limpeza concluída",
        description: `${data.deletedCount} torneios removidos com sucesso`,
      });

      // Reset form
      setSelectedSites([]);
      setDateFrom('');
      setDateTo('');
      setConfirmation('');
      setPreviewCount(null);

      // Invalidate all related caches
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments/sites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/upload-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
    },
    onError: (error) => {
      toast({
        title: "Erro na limpeza",
        description: "Falha ao remover torneios",
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="bg-poker-surface border-gray-700 shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-white flex items-center justify-center gap-3 text-xl">
          <Trash2 className="h-6 w-6 text-red-400" />
          Limpeza Granular de Dados
        </CardTitle>
        <CardDescription className="text-gray-300 text-base">
          Remove torneios específicos por site e período com segurança
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        {/* Site Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-gray-300">Sites</Label>
            {Array.isArray(sites) && sites.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-400 hover:text-white"
                onClick={() => {
                  const allSites = sites.map((s: any) => s.site);
                  setSelectedSites(selectedSites.length === allSites.length ? [] : allSites);
                }}
              >
                {selectedSites.length === (sites?.length || 0) ? 'Desmarcar Todos' : 'Selecionar Todos'}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Array.isArray(sites) ? sites.map((site: any) => (
              <div key={site.site} className="flex items-center space-x-2">
                <Checkbox
                  id={`cleanup-${site.site}`}
                  checked={selectedSites.includes(site.site)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSites([...selectedSites, site.site]);
                    } else {
                      setSelectedSites(selectedSites.filter(s => s !== site.site));
                    }
                  }}
                />
                <Label htmlFor={`cleanup-${site.site}`} className="text-sm text-gray-300 cursor-pointer">
                  {site.site} ({site.count} torneios)
                </Label>
              </div>
            )) : (
              <div className="text-gray-400">Carregando sites...</div>
            )}
          </div>
        </div>

        {/* Período de Datas - Modernizado */}
        <div className="space-y-3">
          <Label className="text-white text-lg font-semibold">Filtrar por Período</Label>
          <Card className="bg-gray-800 border-gray-600 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm font-medium">Data Inicial</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-gray-900 border-gray-600 text-white focus:border-poker-gold focus:ring-poker-gold"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm font-medium">Data Final</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-gray-900 border-gray-600 text-white focus:border-poker-gold focus:ring-poker-gold"
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Botão de Visualização - Modernizado */}
        <div className="flex flex-col gap-4">
          <Button
            onClick={() => previewMutation.mutate({ sites: selectedSites, dateFrom, dateTo })}
            disabled={selectedSites.length === 0 || previewMutation.isPending}
            className="bg-poker-gold hover:bg-poker-gold/80 text-black font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {previewMutation.isPending ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                Calculando...
              </div>
            ) : (
              'Visualizar Dados para Remoção'
            )}
          </Button>

          {previewCount !== null && (
            <Card className="bg-yellow-900/20 border-yellow-500/30 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-yellow-400 font-semibold text-lg">
                    {previewCount} torneios serão removidos
                  </p>
                  <p className="text-yellow-300 text-sm">
                    Esta ação é irreversível. Confirme antes de prosseguir.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Confirmação Final - Modernizada */}
        {previewCount !== null && previewCount > 0 && (
          <Card className="bg-red-900/20 border-red-500/30 p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-400" />
              </div>
              <h3 className="text-red-400 font-bold text-lg">Confirmação Obrigatória</h3>
              <p className="text-red-300 text-sm">
                Esta ação removerá permanentemente {previewCount} torneios do sistema
              </p>
            </div>

            <div className="space-y-3">
              <Label className="text-gray-300 text-sm font-medium block text-center">
                Digite <strong className="text-red-400">"CONFIRMAR"</strong> para prosseguir
              </Label>
              <Input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="CONFIRMAR"
                className="bg-gray-900 border-red-500/50 text-white text-center font-mono focus:border-red-400 focus:ring-red-400"
              />
            </div>

            <Button
              onClick={() => deleteMutation.mutate({
                sites: selectedSites,
                dateFrom,
                dateTo,
                confirmation
              })}
              disabled={confirmation !== 'CONFIRMAR' || deleteMutation.isPending}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {deleteMutation.isPending ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Removendo Dados...
                </div>
              ) : (
                'Confirmar Remoção de Dados'
              )}
            </Button>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
