/**
 * SessionSpotsViewerDialog — Sprint Grind-Live Spot Notes (RF-02)
 *
 * Spec: Docs/specs/sprint-grind-live-spot-notes.md
 *
 * Lista todos os prints da sessao corrente. Click thumbnail abre preview
 * com edit de nota + delete (confirm 2-cliques). Read-only para outros
 * campos (type/spot/conclusion vivem em /estudos/spots).
 *
 * Lessons:
 *   #1  hooks first
 *   #2  data-testid: spot-viewer-dialog, spot-viewer-thumb-{id},
 *                    spot-viewer-edit-textarea, spot-viewer-edit-save,
 *                    spot-viewer-delete, spot-viewer-confirm-delete
 *   #11 default minimo
 *   #13 apiRequest retorna JSON parseado
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getSpotImageUrl } from "@/lib/spotConstants";
import { ImageOff, Trash2, ArrowLeft } from "lucide-react";

const MAX_NOTES = 500;

interface SessionSpot {
  id: string;
  notes?: string | null;
  imageUrl?: string | null;
  pastedAt?: string;
  sessionTournamentId?: string | null;
}

interface PendingResponse {
  items: SessionSpot[];
  total: number;
}

export interface SessionSpotsViewerDialogProps {
  open: boolean;
  sessionId: string | null;
  onClose: () => void;
}

export default function SessionSpotsViewerDialog({
  open,
  sessionId,
  onClose,
}: SessionSpotsViewerDialogProps) {
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imgError, setImgError] = useState<Record<string, boolean>>({});

  const queryKey = useMemo(
    () => ["/api/starred-hands/pending", { sessionId }],
    [sessionId],
  );

  const { data, isLoading } = useQuery<PendingResponse>({
    queryKey,
    queryFn: async () => {
      if (!sessionId) return { items: [], total: 0 };
      try {
        const json = await apiRequest(
          "GET",
          `/api/starred-hands/pending?sessionId=${encodeURIComponent(sessionId)}`,
        );
        if (Array.isArray(json)) {
          return { items: json, total: json.length };
        }
        return {
          items: Array.isArray(json?.items) ? json.items : [],
          total: typeof json?.total === "number" ? json.total : 0,
        };
      } catch (err) {
        console.warn("spot-viewer.pending.failed", err);
        return { items: [], total: 0 };
      }
    },
    enabled: open && !!sessionId,
    staleTime: 5_000,
  });

  const items = data?.items ?? [];
  const activeSpot = items.find((s) => s.id === activeId) ?? null;

  useEffect(() => {
    if (!activeSpot) return;
    setDraft(activeSpot.notes ?? "");
    setConfirmingDelete(false);
  }, [activeSpot?.id]);

  useEffect(() => {
    if (!open) {
      setActiveId(null);
      setConfirmingDelete(false);
    }
  }, [open]);

  function handleClose() {
    if (savingNote || deleting) return;
    onClose();
  }

  function backToGrid() {
    setActiveId(null);
    setConfirmingDelete(false);
  }

  async function saveNote() {
    if (!activeSpot || savingNote) return;
    const trimmed = draft.trim();
    setSavingNote(true);
    try {
      await apiRequest(
        "PATCH",
        `/api/starred-hands/${activeSpot.id}/review`,
        { notes: trimmed },
      );
      toast({ title: "Nota atualizada" });
      queryClient.invalidateQueries({ queryKey });
    } catch (err: any) {
      const message =
        err?.response?.data?.message ??
        err?.message ??
        "Erro ao salvar nota";
      toast({
        title: "Erro",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSavingNote(false);
    }
  }

  async function confirmDelete() {
    if (!activeSpot || deleting) return;
    setDeleting(true);
    try {
      await apiRequest(
        "DELETE",
        `/api/starred-hands/${activeSpot.id}/discard`,
      );
      toast({ title: "Print excluido" });
      queryClient.invalidateQueries({ queryKey });
      backToGrid();
    } catch (err: any) {
      const message =
        err?.response?.data?.message ??
        err?.message ??
        "Erro ao excluir print";
      toast({
        title: "Erro",
        description: message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent
        data-testid="spot-viewer-dialog"
        className="bg-card border-gray-700 text-white max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>
            {activeSpot ? "Detalhe do print" : "Prints desta sessao"}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {activeSpot
              ? "Edite a nota ou exclua o print."
              : "Ate 10 prints por sessao. Click em um thumbnail para abrir."}
          </DialogDescription>
        </DialogHeader>

        {!activeSpot && (
          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="text-sm text-gray-400 py-8 text-center">
                Carregando prints...
              </div>
            ) : items.length === 0 ? (
              <div
                data-testid="spot-viewer-empty"
                className="rounded border border-dashed border-gray-700 p-6 text-center text-sm text-gray-400"
              >
                Nenhum print nesta sessao. Cole (Ctrl+V) ou use Adicionar print.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {items.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    data-testid={`spot-viewer-thumb-${s.id}`}
                    onClick={() => setActiveId(s.id)}
                    className="group rounded border border-gray-700 bg-gray-900/70 p-2 text-left hover:border-primary transition-colors"
                  >
                    <div className="aspect-video w-full overflow-hidden rounded bg-gray-800 flex items-center justify-center">
                      {imgError[s.id] ? (
                        <ImageOff className="h-8 w-8 text-gray-600" />
                      ) : (
                        <img
                          src={getSpotImageUrl(s.id)}
                          alt="Spot"
                          loading="lazy"
                          className="h-full w-full object-cover"
                          onError={() =>
                            setImgError((prev) => ({ ...prev, [s.id]: true }))
                          }
                        />
                      )}
                    </div>
                    <div
                      className={`mt-2 text-xs line-clamp-2 ${
                        s.notes ? "text-gray-200" : "text-gray-500 italic"
                      }`}
                    >
                      {s.notes && s.notes.length > 0 ? s.notes : "Sem nota"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSpot && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={backToGrid}
                disabled={savingNote || deleting}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>
            </div>

            <div className="rounded border border-gray-700 bg-gray-900 p-2 flex justify-center">
              {imgError[activeSpot.id] ? (
                <div className="flex flex-col items-center gap-2 py-12 text-gray-500">
                  <ImageOff className="h-10 w-10" />
                  <span className="text-xs">Imagem indisponivel</span>
                </div>
              ) : (
                <img
                  src={getSpotImageUrl(activeSpot.id)}
                  alt="Spot detalhe"
                  className="max-h-[55vh] object-contain"
                  onError={() =>
                    setImgError((prev) => ({ ...prev, [activeSpot.id]: true }))
                  }
                />
              )}
            </div>

            <div className="space-y-1">
              <Textarea
                data-testid="spot-viewer-edit-textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_NOTES))}
                maxLength={MAX_NOTES}
                placeholder="Adicione uma nota sobre este spot."
                rows={3}
                disabled={savingNote || deleting}
                className="bg-gray-800 border-gray-600 text-white resize-none"
              />
              <div className="text-xs text-gray-500 text-right">
                {draft.length} / {MAX_NOTES}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              {confirmingDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  data-testid="spot-viewer-confirm-delete"
                  onClick={confirmDelete}
                  disabled={deleting}
                >
                  {deleting ? "Excluindo..." : "Confirmar exclusao?"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="spot-viewer-delete"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={savingNote || deleting}
                  className="text-red-300 border-red-900 hover:bg-red-950/40"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Excluir
                </Button>
              )}
              <Button
                type="button"
                data-testid="spot-viewer-edit-save"
                onClick={saveNote}
                disabled={savingNote || deleting}
              >
                {savingNote ? "Salvando..." : "Salvar nota"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
