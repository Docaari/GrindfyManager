import { useCallback, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cloud, Upload, File, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSize?: number; // in MB
  isUploading?: boolean;
  className?: string;
}

export default function FileUpload({
  onFileSelect,
  accept = ".txt,.csv,.xlsx,.xls",
  maxSize = 50,
  isUploading = false,
  className
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxSize * 1024 * 1024) {
      return `File size must be less than ${maxSize}MB`;
    }

    // Check file type
    const allowedExtensions = accept.split(',').map(ext => ext.trim());
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      return `File type not supported. Allowed: ${allowedExtensions.join(', ')}`;
    }

    return null;
  };

  const handleFileSelect = (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSelectedFile(file);
  };

  const handleUpload = () => {
    if (selectedFile) {
      onFileSelect(selectedFile);
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

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setError(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={cn("space-y-4", className)}>
      <Card className={cn(
        "border-2 border-dashed transition-colors cursor-pointer",
        isDragOver ? "border-poker-green bg-poker-green/10" : "border-gray-600",
        isUploading && "pointer-events-none opacity-50"
      )}>
        <CardContent
          className="p-8 text-center"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {!selectedFile ? (
            <>
              <div className="mb-4">
                <Cloud className="h-16 w-16 mx-auto text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Drop your tournament history files here
              </h3>
              <p className="text-gray-400 mb-4">
                Supports {accept} files from major poker sites
              </p>
              <div className="space-y-2">
                <Button
                  onClick={() => document.getElementById('file-input')?.click()}
                  className="bg-poker-green hover:bg-poker-green-light text-white"
                  disabled={isUploading}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Choose Files
                </Button>
                <p className="text-xs text-gray-500">
                  Maximum file size: {maxSize}MB
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-3">
                <File className="h-8 w-8 text-poker-green" />
                <div className="text-left">
                  <p className="text-white font-medium">{selectedFile.name}</p>
                  <p className="text-gray-400 text-sm">{formatFileSize(selectedFile.size)}</p>
                </div>
                <Button
                  onClick={clearSelection}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-red-400"
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <Button
                onClick={handleUpload}
                className="bg-poker-green hover:bg-poker-green-light text-white"
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload File
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-900/20 border border-red-500 rounded-lg">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <input
        id="file-input"
        type="file"
        accept={accept}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={isUploading}
      />
    </div>
  );
}
