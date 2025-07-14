import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import FileUpload from "@/components/FileUpload";
import { Upload, CheckCircle, AlertCircle, FileText, Database, Trash2, MessageCircle, ChevronDown, Calendar, AlertTriangle } from "lucide-react";
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentStep, setCurrentStep] = useState<{key: string, label: string}>({key: 'idle', label: 'Aguardando arquivo...'});

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
      // 🔍 ETAPA 2.1: DEBUGGING - Construindo FormData
      const formData = new FormData();
      formData.append('file', file);
      
      console.log('🔍 ETAPA 2.1 DEBUG - FormData criado:', {
        arquivo: file.name,
        tamanho: file.size,
        conteudoFormData: formData.has('file')
      });

      console.log('🔍 ETAPA 2.1 DEBUG - Fazendo requisição para /api/upload-history...');
      
      const response = await fetch("/api/upload-history", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      // 🔍 ETAPA 2.2: DEBUGGING - Verificando resposta da API
      console.log('🔍 ETAPA 2.2 DEBUG - Resposta da API:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok
      });

      if (!response.ok) {
        const error = await response.json();
        console.log('🔍 ETAPA 2.2 DEBUG - Erro na resposta:', error);
        throw new Error(error.message || "Upload failed");
      }

      const data = await response.json();
      
      // 🔍 ETAPA 3.1: DEBUGGING - Dados recebidos do backend
      console.log('🔍 ETAPA 3.1 DEBUG - Dados recebidos do backend:', {
        count: data.count,
        skipped: data.skipped,
        errors: data.errors,
        databaseErrors: data.databaseErrors,
        filename: data.filename,
        dadosCompletos: data
      });

      return data;
    },
    onSuccess: (data) => {
      // 🔍 ETAPA 4.1: DEBUGGING - Processando sucesso
      console.log('🔍 ETAPA 4.1 DEBUG - Upload bem-sucedido:', {
        importados: data.count || 0,
        erros: data.databaseErrors || 0,
        duplicados: data.skipped || 0,
        nomeArquivo: data.filename || selectedFile?.name
      });
      
      setIsUploading(false);
      setUploadProgress(100);
      setCurrentStep({key: 'completed', label: 'Upload concluído!'});

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
        filename: data.filename || selectedFile?.name || "poker_history.csv",
        status: "success",
        tournamentsCount: data.count || 0,
        uploadDate: new Date().toISOString()
      };
      
      // 🔍 ETAPA 4.1: DEBUGGING - Adicionando ao histórico
      console.log('🔍 ETAPA 4.1 DEBUG - Adicionando ao histórico:', newHistoryItem);

      setUploadHistory(prev => [newHistoryItem, ...prev]);

      // 🔍 ETAPA 4.2: DEBUGGING - Invalidando cache
      console.log('🔍 ETAPA 4.2 DEBUG - Invalidando cache das queries...');
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/performance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-buyin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-category"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-day"] });
      
      console.log('🔍 ETAPA 4.2 DEBUG - Cache invalidado, dados devem ser recarregados');

      // Show detailed success message
      const sitesDetected = data.sites ? data.sites.join(", ") : "";

      toast({
        title: "Upload Concluído",
        description: `${data.count} torneios importados. Sites: ${sitesDetected}`,
      });

      // Reset state after showing success
      setTimeout(() => {
        setUploadProgress(0);
        setSelectedFile(null);
        setCurrentStep({key: 'idle', label: 'Aguardando arquivo...'});
      }, 2000);

      // Hide upload result after 10 seconds
      setTimeout(() => setUploadResult(null), 10000);
    },
    onError: (error: Error) => {
      // 🔍 ETAPA 8.1: DEBUGGING - Tratamento de erro
      console.log('🔍 ETAPA 8.1 DEBUG - Erro no upload:', {
        mensagem: error.message,
        stack: error.stack,
        nome: error.name,
        arquivo: selectedFile?.name
      });
      
      setIsUploading(false);
      setUploadProgress(0);
      setCurrentStep({key: 'error', label: 'Erro no upload'});

      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });

      // Reset state after error
      setTimeout(() => {
        setCurrentStep({key: 'idle', label: 'Aguardando arquivo...'});
      }, 3000);
    },
  });

  const uploadSteps = [
    { key: 'validating', label: 'Validando arquivo...' },
    { key: 'processing', label: 'Processando dados...' },
    { key: 'saving', label: 'Salvando no banco...' }
  ];

  const handleFileUpload = async (file: File) => {
    // 🔍 ETAPA 1.1: DEBUGGING - Verificar se arquivo foi selecionado
    console.log('🔍 ETAPA 1.1 DEBUG - Arquivo selecionado:', {
      nome: file.name,
      tamanho: file.size,
      tipo: file.type,
      ultimaModificacao: new Date(file.lastModified).toLocaleString()
    });
    
    setSelectedFile(file);
    setIsUploading(true);
    setUploadProgress(0);
    setCurrentStep(uploadSteps[0]);

    // 🔍 ETAPA 1.2: DEBUGGING - Validações frontend
    console.log('🔍 ETAPA 1.2 DEBUG - Validações frontend:', {
      tamanhoValido: file.size <= 50 * 1024 * 1024, // 50MB
      formatoValido: ['.txt', '.csv', '.xlsx', '.xls'].some(ext => file.name.toLowerCase().endsWith(ext)),
      tamanhoMB: (file.size / (1024 * 1024)).toFixed(2)
    });

    // Simulate progress with steps
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev < 30) {
          setCurrentStep(uploadSteps[0]);
        } else if (prev < 70) {
          setCurrentStep(uploadSteps[1]);
        } else if (prev < 90) {
          setCurrentStep(uploadSteps[2]);
        }
        
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    // 🔍 ETAPA 2.1: DEBUGGING - Antes de fazer a chamada da API
    console.log('🔍 ETAPA 2.1 DEBUG - Iniciando chamada da API:', {
      endpoint: '/api/upload-history',
      metodo: 'POST',
      arquivo: file.name,
      timestamp: new Date().toISOString()
    });

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

        {/* Preview do arquivo selecionado */}
        {selectedFile && !isUploading && (
          <div className="mt-4 p-4 bg-gray-700 rounded-lg">
            <p className="text-sm text-gray-300">Arquivo selecionado:</p>
            <p className="text-white font-medium">{selectedFile.name}</p>
            <p className="text-xs text-gray-400">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
        )}

        {/* Progress bar melhorado com etapas */}
        {isUploading && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>{currentStep.label}</span>
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
                  <div key={site.name} className="flex flex-col items-center p-2 bg-gray-800/50 rounded-lg hover:bg-gray-700/50 transition-colors">
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

        {/* Nota informativa */}
        <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3 text-sm mt-4">
          <p className="text-yellow-300">
            <strong>Nota:</strong> Alguns sites como CoinPoker e Bodog podem ter resultados de Lucro Total, ROI e Lucro Médio levemente imprecisos, mas funcionam bem para análise de desempenho individual.
          </p>
        </div>
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

              <div className="mt-3 pt-3 border-t border-gray-600">
                <p className="text-sm font-medium text-white mb-2">Principais Sites:</p>
                <div className="space-y-1 text-xs text-gray-400">
                  <p><span className="text-white font-medium">PokerStars/GGPoker:</span> CSV do Sharkscope</p>
                  <p><span className="text-white font-medium">CoinPoker:</span> CSV do histórico manual</p>
                  <p><span className="text-white font-medium">Bodog:</span> XLSX do suporte</p>
                </div>
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

      {/* Granular Data Cleanup Section */}
      <GranularDataCleanup />

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

// Granular Data Cleanup Component
function GranularDataCleanup() {
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [quickPeriod, setQuickPeriod] = useState<string>('');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available sites
  const { data: sites } = useQuery({
    queryKey: ["/api/tournaments/sites"],
    queryFn: async () => {
      const response = await fetch("/api/tournaments/sites", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch sites");
      return response.json();
    },
  });

  // Preview count mutation
  const previewMutation = useMutation({
    mutationFn: async (filters: { sites: string[]; dateFrom?: string; dateTo?: string }) => {
      const response = await fetch("/api/tournaments/bulk-delete/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(filters),
      });
      if (!response.ok) throw new Error("Failed to get preview");
      return response.json();
    },
    onSuccess: (data) => {
      setPreviewCount(data.count);
    },
  });

  // Bulk delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (filters: { sites: string[]; dateFrom?: string; dateTo?: string; confirmation: string }) => {
      const response = await fetch("/api/tournaments/bulk-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(filters),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete tournaments");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Limpeza concluída",
        description: `${data.deletedCount} torneios foram removidos com sucesso.`,
      });
      
      // Reset form
      setSelectedSites([]);
      setDateFrom('');
      setDateTo('');
      setConfirmation('');
      setPreviewCount(null);
      setQuickPeriod('');
      
      // Invalidate all tournament-related queries
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
    },
    onError: (error) => {
      toast({
        title: "Erro na limpeza",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle quick period selection
  const handleQuickPeriod = (period: string) => {
    setQuickPeriod(period);
    const now = new Date();
    let from = new Date();
    
    switch (period) {
      case 'last-month':
        from.setMonth(now.getMonth() - 1);
        break;
      case 'last-3-months':
        from.setMonth(now.getMonth() - 3);
        break;
      case 'last-year':
        from.setFullYear(now.getFullYear() - 1);
        break;
      default:
        return;
    }
    
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(now.toISOString().split('T')[0]);
  };

  // Handle preview
  const handlePreview = () => {
    if (!selectedSites.length && !dateFrom && !dateTo) {
      toast({
        title: "Filtros necessários",
        description: "Selecione pelo menos um site ou período.",
        variant: "destructive",
      });
      return;
    }

    previewMutation.mutate({
      sites: selectedSites,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
  };

  // Handle deletion
  const handleDelete = () => {
    if (confirmation !== 'CONFIRMAR') {
      toast({
        title: "Confirmação necessária",
        description: 'Digite "CONFIRMAR" para prosseguir.',
        variant: "destructive",
      });
      return;
    }

    if (previewCount === null) {
      toast({
        title: "Preview necessário",
        description: "Clique em 'Visualizar' antes de deletar.",
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    deleteMutation.mutate({
      sites: selectedSites,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      confirmation,
    });
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <Trash2 className="h-5 w-5 text-red-400" />
        <h2 className="text-xl font-semibold text-white">Limpeza Granular de Dados</h2>
      </div>
      <p className="text-gray-400 mb-6">Remover dados específicos por site ou período</p>

      <div className="space-y-6">
        {/* Site Selection */}
        <div>
          <Label className="text-white mb-2 block">Filtrar por Site</Label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="all-sites"
                checked={selectedSites.length === sites?.length}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedSites(sites?.map((s: any) => s.site) || []);
                  } else {
                    setSelectedSites([]);
                  }
                }}
              />
              <Label htmlFor="all-sites" className="text-white font-medium">
                Todos os sites
              </Label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-3">
              {sites?.map((site: any) => (
                <div key={site.site} className="flex items-center space-x-2">
                  <Checkbox
                    id={site.site}
                    checked={selectedSites.includes(site.site)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedSites([...selectedSites, site.site]);
                      } else {
                        setSelectedSites(selectedSites.filter(s => s !== site.site));
                      }
                    }}
                  />
                  <Label htmlFor={site.site} className="text-gray-300 text-sm">
                    {site.site} ({site.count})
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Date Range Selection */}
        <div>
          <Label className="text-white mb-2 block">Filtrar por Período</Label>
          <div className="space-y-3">
            {/* Quick Period Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickPeriod('last-month')}
                className={`border-gray-600 text-gray-300 hover:bg-gray-800 ${quickPeriod === 'last-month' ? 'bg-gray-800' : ''}`}
              >
                Último mês
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickPeriod('last-3-months')}
                className={`border-gray-600 text-gray-300 hover:bg-gray-800 ${quickPeriod === 'last-3-months' ? 'bg-gray-800' : ''}`}
              >
                Últimos 3 meses
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickPeriod('last-year')}
                className={`border-gray-600 text-gray-300 hover:bg-gray-800 ${quickPeriod === 'last-year' ? 'bg-gray-800' : ''}`}
              >
                Último ano
              </Button>
            </div>

            {/* Custom Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300 text-sm mb-1 block">Data inicial</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-300 text-sm mb-1 block">Data final</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preview Section */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-600">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium">Preview da Operação</h3>
            <Button
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
            >
              {previewMutation.isPending ? 'Carregando...' : 'Visualizar'}
            </Button>
          </div>
          
          {previewCount !== null && (
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <span className="text-yellow-300">
                Serão removidos <strong>{previewCount}</strong> torneios
              </span>
            </div>
          )}
        </div>

        {/* Confirmation Section */}
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
          <Label className="text-red-400 font-medium mb-2 block">
            Confirmação Obrigatória
          </Label>
          <p className="text-red-300 text-sm mb-3">
            Esta ação não pode ser desfeita. Digite "CONFIRMAR" para prosseguir.
          </p>
          <div className="flex gap-3">
            <Input
              placeholder="Digite CONFIRMAR"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="bg-gray-800 border-red-500/50 text-white flex-1"
            />
            <Button
              onClick={handleDelete}
              disabled={isDeleting || confirmation !== 'CONFIRMAR' || previewCount === null}
              className="bg-red-600 hover:bg-red-700 text-white px-6"
            >
              {isDeleting ? 'Removendo...' : 'Remover Dados'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}