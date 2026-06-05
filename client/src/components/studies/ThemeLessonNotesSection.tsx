/**
 * ThemeLessonNotesSection — Sprint theme-lesson-notes.
 *
 * Lista as notas de aulas vinculadas ao tema + CTA criar/editar/apagar.
 * Integrado na aba "Aulas" do ThemeDetailView.
 *
 * Estrutura:
 *   - Header "Aulas e anotacoes" + botao Nova.
 *   - Lista de cards (titulo da aula, preview, botoes).
 *   - Empty state com CTA "Nova nota".
 *   - ErrorBoundary envolta (lesson #29).
 *
 * Lessons:
 *   #1  hooks first
 *   #2  data-testid estaveis
 *   #13 apiRequest retorna JSON parseado direto
 *   UI PT-BR.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Pencil, Trash2, Plus } from "lucide-react";
import { ThemeLessonNoteDialog } from "./ThemeLessonNoteDialog";

interface ThemeLessonNote {
  id: string;
  lessonId: string;
  title: string;
  content: any[];
  lessonTitle: string;
  courseTitle: string;
  createdAt: string;
  updatedAt: string;
}

interface ThemeLessonNotesSectionProps {
  themeId: string;
  theme: {
    id: string;
    linkedLessons?: string[] | null;
  };
}

function extractTextPreview(blocks: any[], maxLines = 3): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph" && block.props?.text) {
      lines.push(block.props.text);
    } else if (block.type === "heading" && block.props?.text) {
      lines.push(block.props.text);
    } else if (typeof block === "string") {
      lines.push(block);
    }
    if (lines.length >= maxLines) break;
  }
  return lines.join(" / ") || "Sem conteudo";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function ThemeLessonNotesSection({ themeId, theme }: ThemeLessonNotesSectionProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editNote, setEditNote] = useState<ThemeLessonNote | null>(null);
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);

  // Fetch notas.
  const { data: notes = [], isLoading } = useQuery<ThemeLessonNote[]>({
    queryKey: ["/api/study-themes", themeId, "lesson-notes"],
    queryFn: () => apiRequest("GET", `/api/study-themes/${themeId}/lesson-notes`),
    enabled: !!themeId,
    staleTime: 15_000,
  });

  // Criar/atualizar nota.
  const saveMutation = useMutation({
    mutationFn: async (payload: { lessonId: string; title: string; content: any[] }) => {
      return apiRequest("POST", `/api/study-themes/${themeId}/lesson-notes`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/study-themes", themeId, "lesson-notes"] });
      toast({ title: editNote ? "Nota atualizada" : "Nota criada" });
      setDialogOpen(false);
      setEditNote(null);
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao salvar nota",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  // Deletar nota.
  const deleteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/study-themes/${themeId}/lesson-notes/${noteId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/study-themes", themeId, "lesson-notes"] });
      toast({ title: "Nota removida" });
      setDeleteNoteId(null);
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao remover nota",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
      setDeleteNoteId(null);
    },
  });

  const openNewDialog = () => {
    setEditNote(null);
    setDialogOpen(true);
  };

  const openEditDialog = (note: ThemeLessonNote) => {
    setEditNote(note);
    setDialogOpen(true);
  };

  return (
    <ErrorBoundary
      fallback={
        <p className="text-sm text-muted-foreground">
          Nao foi possivel carregar as notas de aulas agora.
        </p>
      }
    >
      <section data-testid="theme-lesson-notes-section" className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" data-testid="section-title">
            Aulas e anotacoes
          </h3>
          <Button
            type="button"
            data-testid="new-note-button"
            size="sm"
            variant="outline"
            onClick={openNewDialog}
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova nota
          </Button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div data-testid="notes-loading" className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando notas…
          </div>
        )}

        {/* Empty state */}
        {!isLoading && notes.length === 0 && (
          <div
            data-testid="notes-empty"
            className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground"
          >
            <p>Nenhuma nota de aula ainda.</p>
            <p className="mt-1">Registre uma aula da Biblioteca e vincule suas anotacoes a este tema.</p>
            <Button
              type="button"
              data-testid="notes-empty-cta"
              size="sm"
              className="mt-3"
              onClick={openNewDialog}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Criar primeira nota
            </Button>
          </div>
        )}

        {/* Notes list */}
        {!isLoading && notes.length > 0 && (
          <div data-testid="notes-list" className="space-y-2">
            {notes.map((note) => (
              <div
                key={note.id}
                data-testid={`note-card-${note.id}`}
                className="rounded border p-3 space-y-2 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        data-testid={`note-title-${note.id}`}
                        className="font-medium text-sm text-foreground"
                      >
                        {note.title}
                      </span>
                      {note.courseTitle && (
                        <span
                          data-testid={`note-course-${note.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          {note.courseTitle}
                        </span>
                      )}
                    </div>
                    <p
                      data-testid={`note-preview-${note.id}`}
                      className="mt-1 text-xs text-muted-foreground line-clamp-2"
                    >
                      {extractTextPreview(note.content)}
                    </p>
                    <p
                      data-testid={`note-date-${note.id}`}
                      className="mt-1 text-[10px] text-gray-600"
                    >
                      Atualizado {formatDate(note.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      data-testid={`note-edit-${note.id}`}
                      aria-label={`Editar nota: ${note.title}`}
                      onClick={() => openEditDialog(note)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      data-testid={`note-delete-${note.id}`}
                      aria-label={`Apagar nota: ${note.title}`}
                      onClick={() => setDeleteNoteId(note.id)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dialog criar/editar */}
        <ThemeLessonNoteDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditNote(null);
          }}
          theme={theme}
          initialNote={
            editNote
              ? {
                  id: editNote.id,
                  lessonId: editNote.lessonId,
                  title: editNote.title,
                  content: editNote.content,
                }
              : null
          }
          onSave={async (data) => {
            await saveMutation.mutateAsync(data);
          }}
        />

        {/* Confirmacao de delete */}
        <AlertDialog
          open={deleteNoteId !== null}
          onOpenChange={(open) => { if (!open) setDeleteNoteId(null); }}
        >
          <AlertDialogContent data-testid="note-delete-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>Remover esta nota?</AlertDialogTitle>
              <AlertDialogDescription>
                A nota de aula sera apagada permanentemente. Esta acao nao pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="note-delete-cancel" disabled={deleteMutation.isPending}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                data-testid="note-delete-confirm-action"
                disabled={deleteMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (deleteNoteId) deleteMutation.mutate(deleteNoteId);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </ErrorBoundary>
  );
}

export default ThemeLessonNotesSection;