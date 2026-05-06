import { useCallback, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cloud, Upload, File, X, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, uploadWithProgress } from "@/lib/queryClient";
import type { UploadProgress } from "@/lib/queryClient";
import { LogoLoader } from "@/components/LogoLoader";
import {
  formatFileSize as formatFileSizeHelper,
  getUploadPhase,
  formatSpeed,
  estimateTimeRemaining,
} from "@/lib/upload-progress-helpers";

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
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSelectedFile(file);
    setIsAnalyzing(true);
    setAnalysisResult(null);


    try {
      const formData = new FormData();
      formData.append('file', file);

      abortControllerRef.current = new AbortController();
      const response = await uploadWithProgress(
        '/api/check-duplicates',
        formData,
        (progress) => setUploadProgress(progress),
        abortControllerRef.current.signal
      );

      setUploadProgress(null);
      setAnalysisResult(response);
      setIsAnalyzing(false);

    } catch (error: any) {
      setUploadProgress(null);
      setError(`Falha ao detectar duplicatas: ${error.response?.data?.message || error.message || 'Erro desconhecido'}`);
      setIsAnalyzing(false);
    }
  };

  const handleUploadAction = async (action: string) => {
    if (!analysisResult) return;

    setIsUploading(true);

    let response: any;
    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('file', selectedFile);
      }
      formData.append('duplicateAction', action);

      if (action === 'import_new_only') {
        formData.append('duplicateIds', JSON.stringify(analysisResult.duplicates?.map((d: any) => d.tournamentId || d.name) || []));
      }

      abortControllerRef.current = new AbortController();
      response = await uploadWithProgress(
        '/api/upload-with-duplicates',
        formData,
        (progress) => setUploadProgress(progress),
        abortControllerRef.current.signal
      );
    } catch (error: any) {
      setUploadProgress(null);
      const msg = error?.response?.data?.message || error?.message || 'Erro ao processar upload';
      setError(msg);
      setIsUploading(false);
      return;
    }

    setUploadProgress(null);
    setSelectedFile(null);
    setAnalysisResult(null);
    setIsUploading(false);

    try {
      onUploadComplete(response);
    } catch (cbError) {
      console.error('AutoUpload onUploadComplete callback failed:', cbError);
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
              isDragOver ? "border-blue-500 bg-blue-900/20" : "border-gray-300 hover:border-gray-400"
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
              <Upload className="h-5 w-5 animate-spin text-blue-400" />
              <span className="text-lg font-medium">Analisando arquivo...</span>
            </div>
            <p className="text-sm text-gray-400">
              Verificando duplicatas e processando dados
            </p>
            <div className="flex items-center justify-center space-x-2">
              <File className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">{selectedFile?.name}</span>
            </div>
            {uploadProgress && (
              <div className="w-full max-w-md mx-auto space-y-2">
                <div className="flex justify-between text-sm text-gray-400">
                  <span>{getUploadPhase(uploadProgress.percentage) === 'processing' ? 'Processando dados...' : `${uploadProgress.percentage}%`}</span>
                  <span>{formatSpeed(uploadProgress.speed)}</span>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress.percentage}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500">
                  {formatFileSizeHelper(uploadProgress.loaded)} / {formatFileSizeHelper(uploadProgress.total)}
                </div>
              </div>
            )}
            <Button
              onClick={() => { abortControllerRef.current?.abort(); resetUpload(); }}
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300"
            >
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
          </div>
        )}

        {/* Results Phase */}
        {analysisResult && !isAnalyzing && !isUploading && (() => {
          const dupCount = analysisResult.duplicates?.length || 0;
          const newCount = analysisResult.validTournaments?.length || 0;
          const totalCount = analysisResult.totalProcessed || 0;
          const hasDuplicates = dupCount > 0;
          const allDuplicates = newCount === 0 && hasDuplicates;
          return (
          <div className="space-y-6">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Análise Concluída</h3>
              <p className="text-gray-400">Arquivo processado com sucesso</p>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-blue-900/20 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-400">
                  {totalCount}
                </div>
                <div className="text-sm text-gray-400">Torneios encontrados</div>
              </div>
              <div className="bg-orange-900/20 rounded-lg p-4">
                <div className="text-2xl font-bold text-orange-400">
                  {dupCount}
                </div>
                <div className="text-sm text-gray-400">Torneios duplicados</div>
              </div>
              <div className="bg-green-900/20 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">
                  {newCount}
                </div>
                <div className="text-sm text-gray-400">Torneios novos</div>
              </div>
            </div>

            {/* Aviso: duplicados detectados */}
            {hasDuplicates && (
              <div className="p-3 rounded-lg border border-orange-500/40 bg-orange-900/10 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
                <div className="text-sm text-orange-200">
                  <strong>{dupCount}</strong> torneios já existem no histórico e serão ignorados.{' '}
                  {allDuplicates
                    ? 'Não há torneios novos para importar.'
                    : `Apenas os ${newCount} torneios novos serão importados.`}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col space-y-3">
              {!hasDuplicates && (
                <Button
                  onClick={() => handleUploadAction('import_all')}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  size="lg"
                >
                  Importar {totalCount} torneios
                </Button>
              )}
              {hasDuplicates && !allDuplicates && (
                <Button
                  onClick={() => handleUploadAction('import_new_only')}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  size="lg"
                >
                  Importar {newCount} torneios novos
                </Button>
              )}
              {hasDuplicates && (
                <details className="w-full">
                  <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-400 text-center py-2">
                    Opções avançadas
                  </summary>
                  <Button
                    onClick={() => {
                      if (window.confirm(`Forçar reimportação criará ${dupCount} torneios duplicados no histórico. Confirma?`)) {
                        handleUploadAction('import_all');
                      }
                    }}
                    variant="outline"
                    className="w-full mt-2 border-orange-500/40 text-orange-300 hover:bg-orange-900/20"
                    size="sm"
                  >
                    Forçar reimportação ({totalCount} torneios, incluindo {dupCount} duplicados)
                  </Button>
                </details>
              )}
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
          );
        })()}

        {/* Upload Phase */}
        {isUploading && (
          <div className="text-center space-y-4">
            <LogoLoader size="md" label="Importando torneios..." />
            <p className="text-sm text-gray-400">
              Salvando dados no sistema
            </p>
            {uploadProgress && (
              <div className="w-full max-w-md mx-auto space-y-2">
                <div className="flex justify-between text-sm text-gray-400">
                  <span>{getUploadPhase(uploadProgress.percentage) === 'processing' ? 'Processando dados...' : `${uploadProgress.percentage}%`}</span>
                  <span>{formatSpeed(uploadProgress.speed)}</span>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress.percentage}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500">
                  {formatFileSizeHelper(uploadProgress.loaded)} / {formatFileSizeHelper(uploadProgress.total)}
                </div>
              </div>
            )}
            <Button
              onClick={() => { abortControllerRef.current?.abort(); resetUpload(); }}
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300"
            >
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <span className="text-red-400">{error}</span>
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
