import { useCallback, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cloud, Upload, File, X, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

interface AnalysisResult {
  success: boolean;
  analysis: {
    totalTournaments: number;
    duplicates: number;
    ignored: number;
    validTournaments: any[];
    duplicateDetails: any[];
  };
  estimatedTime: string;
}

interface AutoUploadProps {
  onUploadComplete: (result: any) => void;
  accept?: string;
  maxSize?: number;
  className?: string;
}

export default function AutoUpload({
  onUploadComplete,
  accept = ".txt,.csv,.xlsx,.xls",
  maxSize = 50,
  className
}: AutoUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);

  const validateFile = (file: File): string | null => {
    if (file.size > maxSize * 1024 * 1024) {
      return `Arquivo deve ter menos que ${maxSize}MB`;
    }

    const allowedExtensions = accept.split(',').map(ext => ext.trim());
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      return `Tipo de arquivo não suportado. Permitidos: ${allowedExtensions.join(', ')}`;
    }

    return null;
  };

  const handleFileSelect = async (file: File) => {
    console.log('=== ARQUIVO SELECIONADO ===');
    console.log('Arquivo:', file.name);
    
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSelectedFile(file);
    setIsAnalyzing(true);
    setAnalysisResult(null);

    console.log('=== VERIFICAÇÃO DE DUPLICATAS INICIADA ===');
    console.log('Arquivo selecionado:', file.name);
    console.log('Enviando para API de verificação...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiRequest('POST', '/api/check-duplicates', formData);
      
      console.log('Resposta da verificação:', response);
      
      setAnalysisResult(response);
      setIsAnalyzing(false);

    } catch (error: any) {
      console.error('Erro na verificação:', error);
      console.error('Erro detalhado:', error.response?.data);
      setError(`Falha ao detectar duplicatas: ${error.response?.data?.message || error.message || 'Erro desconhecido'}`);
      setIsAnalyzing(false);
    }
  };

  const handleUploadAction = async (action: string) => {
    if (!analysisResult) return;

    console.log(`🔍 USUÁRIO ESCOLHEU: ${action}`);
    setIsUploading(true);

    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('file', selectedFile);
      }
      formData.append('duplicateAction', action);
      
      if (action === 'import_new_only') {
        formData.append('duplicateIds', JSON.stringify(analysisResult.duplicates?.map((d: any) => d.tournamentId || d.name) || []));
      }

      const response = await apiRequest('POST', '/api/upload-with-duplicates', formData);
      
      console.log('Upload finalizado:', response);
      
      onUploadComplete(response);
      
      // Reset state
      setSelectedFile(null);
      setAnalysisResult(null);
      setIsUploading(false);

    } catch (error) {
      console.error('Erro no upload:', error);
      setError('Erro ao processar upload');
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const resetUpload = () => {
    setSelectedFile(null);
    setAnalysisResult(null);
    setError(null);
    setIsAnalyzing(false);
    setIsUploading(false);
  };

  return (
    <Card className={cn("w-full", className)}>
      <CardContent className="p-6 bg-[#303946]">
        {/* File Selection Area */}
        {!selectedFile && (
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              isDragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="flex flex-col items-center space-y-4">
              <Cloud className="h-12 w-12 text-gray-400" />
              <div>
                <p className="text-lg font-medium text-[#ffffff]">Selecione ou arraste um arquivo</p>
                <p className="text-sm text-[#ffffff]">
                  Formatos suportados: CSV, TXT, XLSX (até {maxSize}MB)
                </p>
              </div>
              <input
                type="file"
                accept={accept}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer px-4 py-2 text-white rounded-md hover:bg-blue-700 transition-colors bg-[#16a34a]"
              >
                Escolher Arquivo
              </label>
            </div>
          </div>
        )}

        {/* Analysis Phase */}
        {isAnalyzing && (
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center space-x-2">
              <Upload className="h-5 w-5 animate-spin text-blue-600" />
              <span className="text-lg font-medium">Analisando arquivo... ⏳</span>
            </div>
            <p className="text-sm text-gray-600">
              Verificando duplicatas e processando dados
            </p>
            <div className="flex items-center justify-center space-x-2">
              <File className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">{selectedFile?.name}</span>
            </div>
          </div>
        )}

        {/* Results Phase */}
        {analysisResult && !isAnalyzing && !isUploading && (
          <div className="space-y-6">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Análise Concluída</h3>
              <p className="text-gray-600">Arquivo processado com sucesso</p>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-600">
                  {analysisResult.totalProcessed || 0}
                </div>
                <div className="text-sm text-gray-600">Torneios encontrados</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-orange-600">
                  {analysisResult.duplicates?.length || 0}
                </div>
                <div className="text-sm text-gray-600">Torneios duplicados</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-600">
                  {analysisResult.validTournaments?.length || 0}
                </div>
                <div className="text-sm text-gray-600">Torneios novos</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col space-y-3">
              <Button
                onClick={() => handleUploadAction('import_all')}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                Importar Todos ({analysisResult.totalProcessed || 0} torneios)
              </Button>
              <Button
                onClick={() => handleUploadAction('import_new_only')}
                variant="outline"
                className="w-full"
                size="lg"
              >
                Importar Apenas Não Duplicados ({analysisResult.validTournaments?.length || 0} torneios)
              </Button>
              <Button
                onClick={resetUpload}
                variant="ghost"
                className="w-full"
                size="lg"
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Upload Phase */}
        {isUploading && (
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center space-x-2">
              <Upload className="h-5 w-5 animate-spin text-green-600" />
              <span className="text-lg font-medium">Importando torneios...</span>
            </div>
            <p className="text-sm text-gray-600">
              Salvando dados no sistema
            </p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <span className="text-red-700">{error}</span>
            </div>
            <Button
              onClick={resetUpload}
              variant="outline"
              size="sm"
              className="mt-2"
            >
              Tentar Novamente
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}