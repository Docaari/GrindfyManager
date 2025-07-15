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
  const [duplicateModal, setDuplicateModal] = useState<{
    show: boolean;
    validTournaments: any[];
    duplicateTournaments: any[];
    duplicateCount: number;
    totalProcessed: number;
    duplicatesBySite: Record<string, number>;
    fileName: string;
  } | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();

  // Upload with duplicates mutation
  const uploadWithDuplicatesMutation = useMutation({
    mutationFn: async ({ file, duplicateAction, duplicateIds }: { 
      file: File; 
      duplicateAction: string; 
      duplicateIds?: string[] 
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('duplicateAction', duplicateAction);
      if (duplicateIds) {
        formData.append('duplicateIds', JSON.stringify(duplicateIds));
      }
      
      const response = await fetch('/api/upload-with-duplicates', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setUploadResult({
        imported: data.imported || 0,
        duplicates: data.duplicates || 0,
        errors: 0,
        show: true
      });
      
      setDuplicateModal(null);
      setSelectedFile(null);
      setCurrentStep({key: 'completed', label: 'Upload concluído'});
      
      toast({
        title: "Upload concluído",
        description: `${data.imported} torneios importados`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
    },
    onError: (error) => {
      toast({
        title: "Erro no upload",
        description: "Falha ao processar o arquivo",
        variant: "destructive",
      });
      console.error('Upload error:', error);
    },
  });

  // Handle duplicate decision
  const handleDuplicateDecision = (action: 'import_new_only' | 'import_all' | 'skip_upload') => {
    if (!selectedFile || !duplicateModal) return;
    
    let duplicateIds: string[] = [];
    
    if (action === 'import_new_only') {
      duplicateIds = duplicateModal.duplicateTournaments.map(t => t.tournamentId || t.name);
    }
    
    uploadWithDuplicatesMutation.mutate({
      file: selectedFile,
      duplicateAction: action,
      duplicateIds: duplicateIds.length > 0 ? duplicateIds : undefined
    });
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Histórico de Upload</h1>
      </div>

      {/* File Upload Section */}
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Torneios
          </CardTitle>
          <CardDescription className="text-gray-300">
            Faça upload de arquivos CSV ou Excel para importar seus torneios
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUpload
            onFileSelect={(file) => {
              setSelectedFile(file);
              setCurrentStep({key: 'file_selected', label: 'Arquivo selecionado'});
            }}
            onUpload={(file) => {
              // This will be handled by the duplicate check system
              console.log('File uploaded:', file.name);
            }}
            isUploading={isUploading}
            progress={uploadProgress}
            currentStep={currentStep}
          />
        </CardContent>
      </Card>

      {/* Duplicate Modal */}
      {duplicateModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">Duplicatas Encontradas</h2>
            </div>
            
            <div className="space-y-4">
              <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
                <h3 className="font-semibold text-yellow-400 mb-2">Resumo da Análise</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Total Processado:</span>
                    <span className="text-white ml-2">{duplicateModal.totalProcessed}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Duplicatas:</span>
                    <span className="text-yellow-400 ml-2">{duplicateModal.duplicateCount}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Novos:</span>
                    <span className="text-green-400 ml-2">{duplicateModal.validTournaments.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Arquivo:</span>
                    <span className="text-white ml-2">{duplicateModal.fileName}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-2">Duplicatas por Site</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(duplicateModal.duplicatesBySite).map(([site, count]) => (
                    <div key={site} className="flex justify-between">
                      <span className="text-gray-400">{site}:</span>
                      <span className="text-yellow-400">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-gray-300 text-sm">
                  Escolha como deseja proceder com as duplicatas encontradas:
                </p>
                
                <div className="space-y-2">
                  <Button 
                    onClick={() => handleDuplicateDecision('import_new_only')}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    disabled={uploadWithDuplicatesMutation.isPending}
                  >
                    Importar Apenas Novos ({duplicateModal.validTournaments.length} torneios)
                  </Button>
                  
                  <Button 
                    onClick={() => handleDuplicateDecision('import_all')}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={uploadWithDuplicatesMutation.isPending}
                  >
                    Importar Todos ({duplicateModal.totalProcessed} torneios)
                  </Button>
                  
                  <Button 
                    onClick={() => handleDuplicateDecision('skip_upload')}
                    variant="outline"
                    className="w-full border-gray-600 text-gray-300 hover:bg-gray-800"
                    disabled={uploadWithDuplicatesMutation.isPending}
                  >
                    Cancelar Upload
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
  const [isDeleting, setIsDeleting] = useState(false);
  const [quickPeriod, setQuickPeriod] = useState<string>('');
  
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
        description: `${data.deleted} torneios removidos com sucesso`,
      });
      
      // Reset form
      setSelectedSites([]);
      setDateFrom('');
      setDateTo('');
      setConfirmation('');
      setPreviewCount(null);
      setQuickPeriod('');
      
      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
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
    <Card className="bg-gray-900 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Limpeza Granular de Dados
        </CardTitle>
        <CardDescription className="text-gray-300">
          Remove torneios específicos por site e período
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Site Selection */}
        <div>
          <Label className="text-gray-300 mb-2 block">Sites</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
                <Label htmlFor={site.site} className="text-sm text-gray-300">
                  {site.site} ({site.count})
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-gray-300 mb-2 block">Data Inicial</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-gray-800 border-gray-600 text-white"
            />
          </div>
          <div>
            <Label className="text-gray-300 mb-2 block">Data Final</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-gray-800 border-gray-600 text-white"
            />
          </div>
        </div>

        {/* Preview */}
        <div className="flex gap-2">
          <Button
            onClick={() => previewMutation.mutate({ sites: selectedSites, dateFrom, dateTo })}
            disabled={selectedSites.length === 0 || previewMutation.isPending}
            variant="outline"
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            {previewMutation.isPending ? 'Calculando...' : 'Visualizar'}
          </Button>
          
          {previewCount !== null && (
            <div className="flex items-center gap-2 px-3 py-2 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <span className="text-yellow-400 text-sm">
                {previewCount} torneios serão removidos
              </span>
            </div>
          )}
        </div>

        {/* Confirmation */}
        {previewCount !== null && previewCount > 0 && (
          <div className="space-y-2">
            <Label className="text-gray-300 mb-2 block">
              Digite "CONFIRMAR" para prosseguir
            </Label>
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="CONFIRMAR"
              className="bg-gray-800 border-gray-600 text-white"
            />
            <Button
              onClick={() => deleteMutation.mutate({ 
                sites: selectedSites, 
                dateFrom, 
                dateTo, 
                confirmation 
              })}
              disabled={confirmation !== 'CONFIRMAR' || deleteMutation.isPending}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? 'Removendo...' : 'Remover Dados'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}