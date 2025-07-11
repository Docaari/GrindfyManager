import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import FileUpload from "@/components/FileUpload";
import { Upload, CheckCircle, AlertCircle, FileText, Database, Trash2, MessageCircle, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UploadHistory {
  id: string;
  filename: string;
  status: "success" | "error" | "processing";
  tournamentsCount: number;
  uploadDate: string;
  errorMessage?: string;
}

export default function UploadHistory() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>([]);
  const [uploadResult, setUploadResult] = useState<{
    imported: number;
    errors: number;
    duplicates: number;
    show: boolean;
  } | null>(null);
  const [showAllSites, setShowAllSites] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tournaments } = useQuery({
    queryKey: ["/api/tournaments"],
    queryFn: async () => {
      const response = await fetch("/api/tournaments", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch tournaments");
      return response.json();
    },
  });

  const { data: siteStats } = useQuery({
    queryKey: ["/api/analytics/by-site", "all"],
    queryFn: async () => {
      const response = await fetch("/api/analytics/by-site?period=all", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch site stats");
      return response.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch("/api/upload-history", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setIsUploading(false);
      setUploadProgress(100);

      // Show upload result summary
      setUploadResult({
        imported: data.count || 0,
        errors: data.databaseErrors || 0,
        duplicates: data.skipped || 0,
        show: true
      });

      // Add to upload history with detailed info
      const newHistoryItem: UploadHistory = {
        id: Date.now().toString(),
        filename: data.filename || "poker_history.csv",
        status: "success",
        tournamentsCount: data.count || 0,
        uploadDate: new Date().toISOString()
      };

      setUploadHistory(prev => [newHistoryItem, ...prev]);

      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/performance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-buyin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-category"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-day"] });

      // Show detailed success message
      const sitesDetected = data.sites ? data.sites.join(", ") : "";

      toast({
        title: "Upload Concluído",
        description: `${data.count} torneios importados. Sites: ${sitesDetected}`,
      });

      // Reset progress after showing success
      setTimeout(() => setUploadProgress(0), 2000);

      // Hide upload result after 10 seconds
      setTimeout(() => setUploadResult(null), 10000);
    },
    onError: (error: Error) => {
      setIsUploading(false);
      setUploadProgress(0);

      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    uploadMutation.mutate(file);
  };

  const handleDeleteHistory = (id: string) => {
    setUploadHistory(prev => prev.filter(item => item.id !== id));
    toast({
      title: "Histórico Excluído",
      description: "Item do histórico de upload foi removido",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      case "processing":
        return <div className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />;
      default:
        return <FileText className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-600 text-white">Sucesso</Badge>;
      case "error":
        return <Badge className="bg-red-600 text-white">Erro</Badge>;
      case "processing":
        return <Badge className="bg-blue-600 text-white">Processando</Badge>;
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const supportedSites = [
    { name: "PokerStars", dbName: "PokerStars", iconSrc: "/assets/Pokerstars_1751384684151.png" },
    { name: "PartyPoker", dbName: "PartyPoker", iconSrc: "/assets/PartyPoker_1751384684151.png" },
    { name: "888poker", dbName: "888poker", iconSrc: "/assets/888.ico" },
    { name: "GGNetwork", dbName: "GGNetwork", iconSrc: "/assets/GGPoker_1751384684150.png" },
    { name: "WPN Network", dbName: "WPN", iconSrc: "/assets/WPN_1751384684151.jpeg" },
    { name: "iPoker Network", dbName: "iPoker", iconSrc: "/assets/iPoker_1751384684150.jpeg" },
    { name: "CoinPoker", dbName: "CoinPoker", iconSrc: "/assets/Coinpoker_1751384741999.png" },
    { name: "Chico Network", dbName: "Chico", iconSrc: "/assets/Chico_1751384684150.png" },
    { name: "Revolution", dbName: "Revolution", iconSrc: "/assets/Revolution_1751384684151.png" },
    { name: "Bodog", dbName: "Bodog", iconSrc: "🎲", isEmoji: true }
  ];

  // Separar sites com/sem dados
  const sitesWithData = supportedSites.filter(site => {
    const siteData = siteStats?.find((s: any) => s.site === site.dbName);
    return siteData && parseInt(siteData.volume) > 0;
  });

  const sitesWithoutData = supportedSites.filter(site => {
    const siteData = siteStats?.find((s: any) => s.site === site.dbName);
    return !siteData || parseInt(siteData.volume) === 0;
  });

  // Histórico limitado
  const displayedHistory = showAllHistory ? uploadHistory : uploadHistory.slice(0, 10);

  return (
    <div className="p-6 text-white space-y-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2 text-white">Upload Histórico de Torneios</h2>
        <p className="text-gray-400">Importe seus dados de torneios dos sites de poker</p>
      </div>

      {/* ETAPA 1 & 2: Área de Upload - EXPANDIDA */}
      <section className="bg-gray-800 rounded-xl p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload de Arquivo
          </h3>
          <p className="text-gray-400 mt-1">
            Envie seus arquivos de histórico de torneios (.txt, .csv, .xlsx)
          </p>
        </div>

        <div className="border-2 border-dashed border-gray-600 rounded-xl p-8 md:p-12 text-center min-h-[200px] md:min-h-[250px] flex flex-col justify-center">
          <FileUpload
            onFileSelect={handleFileUpload}
            isUploading={isUploading}
            accept=".txt,.csv,.xlsx,.xls"
          />
        </div>

        {isUploading && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Processando arquivo...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-[#24c25e] h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* ETAPA 3: Sites de Poker - COMPACTADO */}
      <section className="bg-gray-800 rounded-xl p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Sites de Poker Suportados</h3>
        
        {/* Sites COM dados - Destaque */}
        {sitesWithData.length > 0 && (
          <div className="mb-6">
            <h4 className="text-md font-medium text-white mb-3">Sites com Dados Importados</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {sitesWithData.map((site) => {
                const siteData = siteStats?.find((s: any) => s.site === site.dbName);
                return (
                  <div key={site.name} className="flex items-center p-3 bg-[#24c25e]/10 border border-[#24c25e]/30 rounded-lg">
                    <div className="w-8 h-8 mr-3 flex items-center justify-center">
                      {site.isEmoji ? (
                        <div className="text-xl">{site.iconSrc}</div>
                      ) : (
                        <img 
                          src={site.iconSrc} 
                          alt={`${site.name} logo`}
                          className="w-8 h-8 object-contain rounded-lg"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="20">🎯</text></svg>';
                          }}
                        />
                      )}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{site.name}</p>
                      <p className="text-[#24c25e] text-xs">
                        {siteData?.volume || 0} torneios
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sites SEM dados - Colapsável */}
        {sitesWithoutData.length > 0 && (
          <div>
            <button 
              onClick={() => setShowAllSites(!showAllSites)}
              className="flex items-center text-gray-400 hover:text-white transition-colors mb-3"
            >
              <span>Sites Disponíveis ({sitesWithoutData.length})</span>
              <ChevronDown className={`ml-2 w-4 h-4 transition-transform ${showAllSites ? 'rotate-180' : ''}`} />
            </button>
            
            {showAllSites && (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {sitesWithoutData.map((site) => (
                  <div key={site.name} className="flex flex-col items-center p-2 bg-gray-800/50 rounded-lg">
                    <div className="w-6 h-6 mb-1 flex items-center justify-center">
                      {site.isEmoji ? (
                        <div className="text-lg">{site.iconSrc}</div>
                      ) : (
                        <img 
                          src={site.iconSrc} 
                          alt={`${site.name} logo`}
                          className="w-6 h-6 object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="16">🎯</text></svg>';
                          }}
                        />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 text-center">{site.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Layout 2 colunas - ETAPA 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {/* ETAPA 5: Histórico de Upload - Otimizado */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <Database className="h-5 w-5" />
              Histórico de Upload
            </h3>
            
            {displayedHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum histórico de upload ainda</p>
                <p className="text-sm">Faça upload do seu primeiro arquivo de histórico de torneios acima</p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedHistory.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(item.status)}
                      <div>
                        <p className="text-white font-medium">{item.filename}</p>
                        <p className="text-sm text-gray-400">
                          {new Date(item.uploadDate).toLocaleDateString()} às{" "}
                          {new Date(item.uploadDate).toLocaleTimeString()}
                        </p>
                        {item.errorMessage && (
                          <p className="text-sm text-red-400 mt-1">{item.errorMessage}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      {getStatusBadge(item.status)}
                      {item.status === "success" && (
                        <div className="text-right">
                          <p className="text-white font-mono">{item.tournamentsCount.toLocaleString()}</p>
                          <p className="text-xs text-gray-400">torneios</p>
                        </div>
                      )}
                      <Button
                        onClick={() => handleDeleteHistory(item.id)}
                        variant="ghost"
                        size="sm"
                        className="text-gray-400 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {/* Botão para ver histórico completo */}
                {uploadHistory.length > 10 && (
                  <div className="text-center mt-4">
                    <button 
                      onClick={() => setShowAllHistory(!showAllHistory)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                    >
                      {showAllHistory ? 'Mostrar Menos' : `Ver Todos (${uploadHistory.length})`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          {/* ETAPA 4: Sidebar com Estatísticas */}
          <div className="bg-gray-800 rounded-xl p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Estatísticas Resumidas</h3>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-[#24c25e]">
                  {tournaments?.length?.toLocaleString() || 0}
                </p>
                <p className="text-sm text-gray-400">Total de Torneios</p>
              </div>
              
              <div className="text-center">
                <p className="text-2xl font-bold text-[#24c25e]">
                  {sitesWithData.length}
                </p>
                <p className="text-sm text-gray-400">Sites Ativos</p>
              </div>
              
              <div className="text-center">
                <p className="text-2xl font-bold text-[#24c25e]">
                  {uploadHistory.filter(h => h.status === "success").length}
                </p>
                <p className="text-sm text-gray-400">Uploads Concluídos</p>
              </div>
            </div>
          </div>

          {/* Seção de ajuda contextual */}
          <div className="bg-gray-800 rounded-xl p-6 mt-6">
            <h3 className="text-lg font-semibold text-white mb-4">Ajuda Rápida</h3>
            
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-white">Formatos Aceitos:</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="px-2 py-1 bg-[#24c25e]/20 text-[#24c25e] text-xs rounded">.csv</span>
                  <span className="px-2 py-1 bg-[#24c25e]/20 text-[#24c25e] text-xs rounded">.txt</span>
                  <span className="px-2 py-1 bg-[#24c25e]/20 text-[#24c25e] text-xs rounded">.xlsx</span>
                </div>
              </div>
              
              <div>
                <p className="text-sm font-medium text-white">Tamanho Máximo:</p>
                <p className="text-xs text-gray-400">50MB por arquivo</p>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-600">
                <Button 
                  className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  onClick={() => {
                    // Discord contact will be configured in the future
                    console.log("Discord contact feature will be implemented");
                  }}
                >
                  <MessageCircle className="h-4 w-4" />
                  Entrar em Contato no Discord
                </Button>
                <p className="text-xs text-gray-500 text-center mt-2">
                  Botão será configurado em breve
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Result Summary */}
      {uploadResult?.show && (
        <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-6 mt-6">
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
    </div>
  );
}