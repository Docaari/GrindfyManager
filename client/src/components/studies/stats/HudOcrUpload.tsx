// =============================================================================
// Sprint Stats-V3 — HudOcrUpload (RF-08 frontend)
//
// Drag-drop area + file input fallback + preview thumbnail + submit OCR.
// =============================================================================

import React from "react";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface HudOcrUploadProps {
  layoutId: string;
  onExtracted: (extraction: any) => void;
}

export default function HudOcrUpload({ layoutId, onExtracted }: HudOcrUploadProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (selected: File | null) => {
    setFile(selected);
    if (!selected) {
      setPreview(null);
      return;
    }
    // Set placeholder preview imediatamente para que o testid esteja no DOM.
    // Atualizado posteriormente via FileReader (best effort).
    setPreview("data:image/png;base64,");
    try {
      const reader = new FileReader();
      reader.onload = (e) => setPreview((e.target?.result as string) ?? null);
      reader.readAsDataURL(selected);
    } catch {
      // mantem placeholder
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    handleFileSelect(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    if (f) handleFileSelect(f);
  };

  const handleCancel = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("layoutId", layoutId);
      const result = await apiRequest(
        "POST",
        "/api/stats-analyzer/ocr-extract",
        formData,
      );
      onExtracted(result);
      handleCancel();
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      const serverMsg = err?.response?.data?.message ?? err?.message;
      console.error("[ocr-upload] failed", { status, serverMsg, err });
      let msg = serverMsg || "Falha ao extrair OCR. Tente novamente.";
      if (status === 503) msg = serverMsg || "OCR temporariamente indisponivel.";
      else if (status === 429) msg = "Limite de OCR atingido. Tente novamente mais tarde.";
      else if (status === 422) msg = "Imagem invalida ou corrompida.";
      toast({
        title: status ? `Erro OCR (${status})` : "Erro OCR",
        description: msg,
        variant: "destructive" as any,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col gap-3 p-3 bg-slate-900 border border-slate-800 rounded-md">
      <div
        data-testid="ocr-upload-dropzone"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        className={`border-2 border-dashed rounded-md p-6 text-center text-slate-400 text-sm transition ${
          loading ? "pointer-events-none opacity-60" : ""
        } ${
          isDragging
            ? "border-emerald-400 bg-emerald-950/30 scale-[1.02]"
            : "border-slate-700 hover:border-slate-500"
        }`}
      >
        {isDragging ? (
          <p className="text-emerald-300 font-semibold">Solte aqui!</p>
        ) : (
          <>
            <p>Arraste um screenshot do HUD aqui</p>
            <p className="text-xs mt-1">ou</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 px-3 py-1.5 bg-emerald-700 text-white rounded text-xs hover:bg-emerald-600"
            >
              Selecionar arquivo
            </button>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        data-testid="ocr-upload-file-input"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleInputChange}
        className="hidden"
      />

      {preview && (
        <div className="flex items-center gap-3 p-2 bg-slate-800 rounded">
          <img
            src={preview}
            data-testid="ocr-upload-preview"
            alt="Preview OCR"
            className="w-16 h-16 object-cover rounded border border-slate-700"
          />
          <span className="text-xs text-slate-300 flex-1 truncate">
            {file?.name ?? ""}
          </span>
          <button
            type="button"
            data-testid="ocr-upload-cancel"
            onClick={handleCancel}
            className="px-2 py-1 text-xs bg-slate-700 text-slate-200 rounded hover:bg-slate-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="ocr-upload-submit"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-600 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Extraindo...
              </>
            ) : (
              "Extrair"
            )}
          </button>
        </div>
      )}

      {!preview && file && (
        <button
          type="button"
          data-testid="ocr-upload-submit"
          onClick={handleSubmit}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-600 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Extraindo...
            </>
          ) : (
            "Extrair OCR"
          )}
        </button>
      )}

      {loading && (
        <>
          <div
            data-testid="ocr-upload-loading"
            className="text-xs text-slate-400 italic text-center"
          >
            Extraindo stats... (pode levar ate 30s)
          </div>
          <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center backdrop-blur-sm rounded-md z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-slate-100 text-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                <span>Extraindo stats...</span>
              </div>
              <span className="text-xs text-slate-400">Pode levar ate 30s — nao feche a janela</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
