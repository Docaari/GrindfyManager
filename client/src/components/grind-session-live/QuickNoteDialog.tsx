/**
 * QuickNoteDialog — Sprint Grind-Live Spot Notes (RF-01)
 *
 * Spec: Docs/specs/sprint-grind-live-spot-notes.md
 *
 * Abre apos upload de print em /grind-live. Captura nota textual quente
 * (max 500). Salvar -> PATCH /api/starred-hands/:id/review { notes }. Pular
 * fecha sem PATCH. ESC = Pular. Textarea vazia + Salvar = Pular.
 *
 * Lessons:
 *   #1  hooks first
 *   #2  data-testid: spot-note-dialog, spot-note-input, spot-note-save, spot-note-skip
 *   #11 default minimo (so note save/skip)
 *   #13 apiRequest retorna JSON parseado
 */
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getSpotImageUrl } from "@/lib/spotConstants";

const MAX_NOTES = 500;

export interface QuickNoteSpot {
  id: string;
  imageUrl?: string;
}

export interface QuickNoteDialogProps {
  spot: QuickNoteSpot | null;
  sessionId?: string;
  onClose: () => void;
}

export default function QuickNoteDialog({
  spot,
  sessionId,
  onClose,
}: QuickNoteDialogProps) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (spot) {
      setNotes("");
      setSubmitting(false);
      // Re-foca quando proximo item da fila assume (dialog continua aberto,
      // Radix nao re-dispara onOpenAutoFocus). Usa rAF para esperar o reset
      // de submitting/notes liberar o disabled da textarea.
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [spot?.id]);

  function handleSkip() {
    if (submitting) return;
    onClose();
  }

  async function handleSave() {
    if (!spot || submitting) return;
    const trimmed = notes.trim();
    if (!trimmed) {
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("PATCH", `/api/starred-hands/${spot.id}/review`, {
        notes: trimmed,
      });
      toast({
        title: "Nota salva",
        description: "Anotacao registrada no print.",
      });
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/starred-hands/pending", { sessionId }],
        });
      }
      onClose();
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? err?.message ?? "Erro ao salvar nota";
      toast({
        title: "Erro",
        description: message,
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  const open = !!spot;
  const imageSrc = spot ? getSpotImageUrl(spot.id) : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleSkip();
      }}
    >
      <DialogContent
        data-testid="spot-note-dialog"
        className="bg-poker-surface border-gray-700 text-white max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          textareaRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Anotar contexto do print</DialogTitle>
          <DialogDescription className="text-gray-400">
            Registre a duvida ou leitura quente. Pode pular se preferir
            revisitar depois.
          </DialogDescription>
        </DialogHeader>

        {spot && (
          <div className="flex justify-center">
            <img
              src={imageSrc}
              alt="Print do spot"
              loading="lazy"
              className="max-h-40 rounded border border-gray-700 object-contain"
            />
          </div>
        )}

        <div className="space-y-1">
          <Textarea
            ref={textareaRef}
            data-testid="spot-note-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES))}
            maxLength={MAX_NOTES}
            placeholder="Qual a borda de call aqui?, Vilao agro, etc."
            rows={4}
            disabled={submitting}
            className="bg-gray-800 border-gray-600 text-white resize-none"
          />
          <div className="text-xs text-gray-500 text-right">
            {notes.length} / {MAX_NOTES}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            data-testid="spot-note-skip"
            onClick={handleSkip}
            disabled={submitting}
          >
            Pular
          </Button>
          <Button
            type="button"
            data-testid="spot-note-save"
            onClick={handleSave}
            disabled={submitting}
          >
            {submitting ? "Salvando..." : "Salvar nota"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
