import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Sprint Spot-Screenshots — controls embutidos no TournamentCard
// Spec: Docs/specs/spot-screenshots.md (RF-02 botao captura; RF-04 dropzone)

const SPOT_MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

interface Props {
  tournamentId: string;
  active: boolean;
  currentSpotsForTournament: number;
  currentSpotsForSession: number;
  onUpload: (
    buffer: ArrayBuffer,
    mimeType: string,
    tournamentId: string,
  ) => void;
}

export function TournamentCardSpotControls(props: Props) {
  const {
    tournamentId,
    active,
    currentSpotsForTournament,
    currentSpotsForSession,
    onUpload,
  } = props;
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const tournamentCapReached = currentSpotsForTournament >= 3;
  const sessionCapReached = currentSpotsForSession >= 10;
  const disabled = !active || tournamentCapReached || sessionCapReached;

  const tooltip = sessionCapReached
    ? "Cap de 10 spots por sessao atingido"
    : tournamentCapReached
      ? "Este torneio ja tem 3 spots (limite atingido)"
      : "Capturar spot";

  async function handleFile(file: File) {
    if (!ALLOWED_MIMES.has(file.type)) {
      toast({
        title: "Formato nao suportado",
        description: `Aceitos: PNG, JPEG, WEBP. Recebido: ${file.type || "?"}.`,
        variant: "destructive",
      });
      return;
    }
    if (file.size > SPOT_MAX_FILE_SIZE) {
      toast({
        title: "Imagem grande demais",
        description: "Tamanho maximo: 5MB.",
        variant: "destructive",
      });
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      onUpload(buffer, file.type, tournamentId);
    } catch (err) {
      console.error("[TournamentCardSpotControls] arrayBuffer failed:", err);
      toast({
        title: "Erro ao ler imagem",
        variant: "destructive",
      });
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      toast({
        title: "Multiplos arquivos",
        description: "Apenas o primeiro arquivo foi processado.",
      });
    }
    handleFile(files[0]);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  function onCameraClick() {
    if (disabled) return;
    inputRef.current?.click();
  }

  return (
    <div
      data-testid="spot-dropzone"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      data-drag-over={dragOver ? "true" : "false"}
      style={{
        display: "inline-flex",
        gap: 8,
        alignItems: "center",
        padding: dragOver ? 4 : 0,
        border: dragOver ? "2px dashed #3b82f6" : "2px dashed transparent",
        borderRadius: 4,
        transition: "border-color 0.1s ease",
      }}
    >
      <input
        ref={inputRef}
        data-testid="spot-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onChange}
        style={{ display: "none" }}
      />
      <button
        type="button"
        data-testid="spot-camera-button"
        disabled={disabled}
        title={tooltip}
        aria-label={tooltip}
        onClick={onCameraClick}
        style={{
          padding: "4px 8px",
          background: "transparent",
          border: "1px solid #444",
          borderRadius: 4,
          color: disabled ? "#666" : "#bbb",
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: 14,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Camera size={14} />
        <span style={{ opacity: 0.7 }}>
          {currentSpotsForTournament}/3
        </span>
      </button>
    </div>
  );
}
