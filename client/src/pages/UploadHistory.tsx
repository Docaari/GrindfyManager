import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import FileUpload from "@/components/FileUpload";
import { Upload, CheckCircle, AlertCircle, FileText, Database, Trash2, MessageCircle } from "lucide-react";
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

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Upload Histórico de Torneios</h2>
        <p className="text-gray-400">Importe seus dados de torneios dos sites de poker</p>
      </div>

      {/* Upload Section */}
      <Card className="bg-poker-surface border-gray-700 mb-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload de Arquivo
          </CardTitle>
          <CardDescription className="text-gray-400">
            Envie seus arquivos de histórico de torneios (.txt, .csv, .xlsx)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileUpload
            onFileSelect={handleFileUpload}
            isUploading={isUploading}
            accept=".txt,.csv,.xlsx,.xls"
          />
          
          {isUploading && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Enviando...</span>
                <span className="text-sm text-white">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supported Sites */}
      <Card className="bg-poker-surface border-gray-700 mb-6">
        <CardHeader>
          <CardTitle className="text-white">Sites de Poker Suportados</CardTitle>
          <CardDescription className="text-gray-400">
            Suportamos arquivos de histórico de torneios destes principais sites de poker
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
            {supportedSites.map((site) => (
              <div key={site.name} className="flex flex-col items-center p-3 bg-gray-800 rounded-lg">
                <div className="w-12 h-12 mb-2 flex items-center justify-center">
                  {site.isEmoji ? (
                    <div className="text-2xl">{site.iconSrc}</div>
                  ) : (
                    <img 
                      src={site.iconSrc} 
                      alt={`${site.name} logo`}
                      className="w-10 h-10 object-contain rounded-lg"
                      onError={(e) => {
                        // Fallback to emoji if image fails to load
                        const target = e.target as HTMLImageElement;
                        target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="24">🎯</text></svg>';
                      }}
                    />
                  )}
                </div>
                <span className="text-sm text-white text-center">{site.name}</span>
                <div className="flex items-center mt-1">
                  <CheckCircle className="h-3 w-3 text-green-400 mr-1" />
                  <span className="text-xs text-green-400">Suportado</span>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-yellow-900 border border-yellow-600 rounded-lg p-4 text-sm">
            <p className="text-yellow-300">
              <strong>Nota:</strong> Alguns sites não Sharkeaveis como CoinPoker e Bodog podem ter resultados de Lucro Total, ROI, Lucro Médio levemente errados, mas funcionam bem para análise de desempenho em torneios isolados.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Upload History */}
      <Card className="bg-poker-surface border-gray-700 mb-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Database className="h-5 w-5" />
            Histórico de Upload
          </CardTitle>
          <CardDescription className="text-gray-400">
            Uploads de arquivos recentes e seu status de processamento
          </CardDescription>
        </CardHeader>
        <CardContent>
          {uploadHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum histórico de upload ainda</p>
              <p className="text-sm">Faça upload do seu primeiro arquivo de histórico de torneios acima</p>
            </div>
          ) : (
            <div className="space-y-3">
              {uploadHistory.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Result Summary */}
      {uploadResult?.show && (
        <Card className="bg-green-900/20 border-green-500/30 mb-6">
          <CardHeader>
            <CardTitle className="text-green-400 flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Resultado do Upload
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {/* Current Database Stats */}
      <Card className="bg-poker-surface border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Estatísticas do Banco de Dados</CardTitle>
          <CardDescription className="text-gray-400">
            Estado atual do seu banco de dados de torneios
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-poker-gold mb-1">
                {tournaments?.length?.toLocaleString() || 0}
              </div>
              <div className="text-sm text-gray-400">Total de Torneios</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white mb-1">
                {uploadHistory.filter(h => h.status === "success").length}
              </div>
              <div className="text-sm text-gray-400">Uploads Bem-sucedidos</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white mb-1">
                {siteStats?.reduce((sum: number, site: any) => sum + parseInt(site.volume || 0), 0).toLocaleString() || 0}
              </div>
              <div className="text-sm text-gray-400">Torneios por Site</div>
            </div>
          </div>

          {/* Sites Checklist */}
          <div className="border-t border-gray-600 pt-6">
            <h3 className="text-white font-semibold mb-4">Sites Importados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {supportedSites.map((site) => {
                const siteData = siteStats?.find((s: any) => s.site === site.dbName);
                const hasData = siteData && parseInt(siteData.volume) > 0;
                
                return (
                  <div key={site.name} className={`flex items-center justify-between p-3 rounded-lg border ${
                    hasData ? 'bg-green-500/10 border-green-500/30' : 'bg-gray-800/50 border-gray-700'
                  }`}>
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 flex items-center justify-center">
                        {site.isEmoji ? (
                          <div className="text-lg">{site.iconSrc}</div>
                        ) : (
                          <img 
                            src={site.iconSrc} 
                            alt={`${site.name} logo`}
                            className="w-6 h-6 object-contain rounded"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="16">🎯</text></svg>';
                            }}
                          />
                        )}
                      </div>
                      <div>
                        <span className="text-white text-sm font-medium">{site.name}</span>
                        {hasData && (
                          <div className="text-xs text-green-400">
                            {parseInt(siteData.volume).toLocaleString()} torneios
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center">
                      {hasData ? (
                        <CheckCircle className="h-4 w-4 text-green-400" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-gray-600"></div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card className="bg-poker-surface border-gray-700 mt-6">
        <CardHeader>
          <CardTitle className="text-white">Precisa de Ajuda?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-gray-400">
            <p>
              <strong className="text-white">File Formats:</strong> .csv, .xlsx
            </p>
            <p>
              <strong className="text-white">PokerStars:</strong> Export CSV do Sharkscope
            </p>
            <p>
              <strong className="text-white">PartyPoker:</strong> Export CSV do Sharkscope
            </p>
            <p>
              <strong className="text-white">888poker:</strong> Export CSV do Sharkscope
            </p>
            <p>
              <strong className="text-white">GGPoker:</strong> Export CSV do Sharkscope
            </p>
            <p>
              <strong className="text-white">WPN:</strong> Export CSV do Sharkscope
            </p>
            <p>
              <strong className="text-white">iPoker:</strong> Export CSV do Sharkscope
            </p>
            <p>
              <strong className="text-white">CoinPoker:</strong> Copie o histórico de transação do site CoinPoker, cole numa planilha e salve o arquivo em formato CSV.
            </p>
            <p>
              <strong className="text-white">Bodog:</strong> Solicite o .xlsx do período para o Suporte da Bodog e faça o upload
            </p>
            <div className="mt-6 pt-4 border-t border-gray-600">
              <Button 
                className="w-full bg-discord hover:bg-discord-hover text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
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
        </CardContent>
      </Card>
    </div>
  );
}
