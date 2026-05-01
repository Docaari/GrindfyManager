import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

// Sprint Spot-Screenshots — <SpotPasteHandler />
// Spec: Docs/specs/spot-screenshots.md (RF-01, EC-01..05)
// Listener global em `paste` no document. Ignora paste em inputs/textareas
// (deixa navegador colar texto normal). Detecta imagem no clipboard, valida MIME
// e cap; auto-attach para 1 torneio ativo, dialog seletor para >1.

const SPOT_MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface SpotPasteHandlerTournament {
  id: string;
  name?: string;
  buyIn: string | number;
  site?: string;
}

interface SpotPasteHandlerProps {
  activeTournaments: SpotPasteHandlerTournament[];
  sessionId: string;
  currentSpotCount: number;
  onUpload: (
    buffer: ArrayBuffer,
    mimeType: string,
    tournamentId: string,
  ) => void;
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function findImageFile(clipboardData: any): File | null {
  if (!clipboardData) return null;
  const items = clipboardData.items;
  if (!items || items.length === 0) {
    const files = clipboardData.files;
    if (files && files[0] && files[0].type?.startsWith("image/")) {
      return files[0];
    }
    return null;
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item?.kind === "file" && typeof item.type === "string" && item.type.startsWith("image/")) {
      const f = item.getAsFile?.();
      if (f) return f;
    }
  }
  return null;
}

export function SpotPasteHandler(props: SpotPasteHandlerProps) {
  const { activeTournaments, currentSpotCount, onUpload } = props;
  const { toast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingPaste, setPendingPaste] = useState<{
    buffer: ArrayBuffer;
    mime: string;
  } | null>(null);

  const handleAttach = useCallback(
    (buffer: ArrayBuffer, mime: string, tournamentId: string) => {
      onUpload(buffer, mime, tournamentId);
    },
    [onUpload],
  );

  // Marker global para SpotScreenshotPaster (F2) detectar SpotPasteHandler (F4)
  // ativo e nao processar paste duas vezes (evita spot duplicado).
  useEffect(() => {
    (globalThis as any).__SPOT_PASTE_HANDLER_F4_ACTIVE__ = true;
    return () => {
      delete (globalThis as any).__SPOT_PASTE_HANDLER_F4_ACTIVE__;
    };
  }, []);

  useEffect(() => {
    async function onPaste(event: ClipboardEvent) {
      if (isInputFocused()) return;

      const file = findImageFile((event as any).clipboardData);
      if (!file) return;

      // Cap de spots/sessao
      if (currentSpotCount >= 10) {
        toast({
          title: "Limite atingido",
          description: "Maximo 10 spots/sessao.",
          variant: "destructive",
        });
        return;
      }

      // 0 torneios ativos
      if (activeTournaments.length === 0) {
        toast({
          title: "Sem torneios ativos",
          description: "Adicione um torneio antes de colar prints.",
          variant: "destructive",
        });
        return;
      }

      // MIME whitelist
      if (!ALLOWED_MIMES.has(file.type)) {
        toast({
          title: "Formato nao suportado",
          description: "Aceitos: PNG, JPEG, WEBP.",
          variant: "destructive",
        });
        return;
      }

      if (file.size > SPOT_MAX_FILE_SIZE) {
        toast({
          title: "Imagem grande demais",
          description: "Limite maximo: 5MB.",
          variant: "destructive",
        });
        return;
      }

      // Carrega buffer (async)
      let buffer: ArrayBuffer;
      try {
        buffer = await file.arrayBuffer();
      } catch (err) {
        console.error("[SpotPasteHandler] arrayBuffer failed:", err);
        toast({
          title: "Erro ao ler imagem",
          variant: "destructive",
        });
        return;
      }

      event.preventDefault?.();

      if (activeTournaments.length === 1) {
        handleAttach(buffer, file.type, activeTournaments[0].id);
        return;
      }

      // >1 torneios -> dialog seletor
      setPendingPaste({ buffer, mime: file.type });
      setPickerOpen(true);
    }

    document.addEventListener("paste", onPaste as any);
    return () => {
      document.removeEventListener("paste", onPaste as any);
    };
  }, [activeTournaments, currentSpotCount, handleAttach, toast]);

  if (!pickerOpen || !pendingPaste) return null;

  return (
    <div
      data-testid="spot-tournament-picker-dialog"
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: 8,
          padding: 24,
          minWidth: 320,
          color: "#fff",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>
          Anexar print a qual torneio?
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {activeTournaments.map((t) => (
            <button
              key={t.id}
              data-testid={`spot-tournament-picker-option-${t.id}`}
              onClick={() => {
                handleAttach(pendingPaste.buffer, pendingPaste.mime, t.id);
                setPickerOpen(false);
                setPendingPaste(null);
              }}
              style={{
                padding: "8px 12px",
                background: "#2a2a2a",
                border: "1px solid #444",
                borderRadius: 4,
                color: "#fff",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {t.name ?? `Torneio ${t.id}`} {" "}
              <span style={{ opacity: 0.6 }}>
                {t.site ? `· ${t.site}` : ""} · ${t.buyIn}
              </span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button
            data-testid="spot-tournament-picker-cancel"
            onClick={() => {
              setPickerOpen(false);
              setPendingPaste(null);
            }}
            style={{
              padding: "6px 12px",
              background: "transparent",
              border: "1px solid #555",
              borderRadius: 4,
              color: "#bbb",
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
