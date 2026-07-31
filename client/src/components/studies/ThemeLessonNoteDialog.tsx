/**
 * ThemeLessonNoteDialog — Sprint theme-lesson-notes.
 *
 * Dialog para criar/editar uma nota de aula vinculada ao tema.
 * - Seletor de aula (combobox com busca em /api/library/lessons/search?q=).
 * - Se theme.linkedLessons existe, filtra para essas aulas.
 * - Campo titulo (default = nome da aula selecionada).
 * - NoteEditor BlockNote (studies-v2/NoteEditor).
 * - Salvar / Cancelar.
 *
 * Lessons:
 *   #1  hooks first
 *   #2  data-testid estaveis
 *   #13 apiRequest retorna JSON parseado direto
 *   UI PT-BR.
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Loader2, ChevronDown } from "lucide-react";
import { NoteEditor } from "@/components/studies-v2/NoteEditor";
import type { NoteEditorHandle } from "@/components/studies-v2/NoteEditor";

interface LibraryLessonSearchItem {
  id: string;
  title: string;
  courseTitle: string;
  slug?: string | null;
  courseSlug?: string | null;
}

interface ThemeLessonNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tema atual (pode ter linkedLessons para filtrar aulas). */
  theme: {
    id: string;
    linkedLessons?: string[] | null;
  };
  /** Nota existente para edicao (null = criar). */
  initialNote?: {
    id: string;
    lessonId: string;
    title: string;
    content: any[];
  } | null;
  onSave: (data: {
    lessonId: string;
    title: string;
    content: any[];
  }) => Promise<void>;
}

export function ThemeLessonNoteDialog({
  open,
  onOpenChange,
  theme,
  initialNote,
  onSave,
}: ThemeLessonNoteDialogProps) {
  const { toast } = useToast();
  const isEdit = !!initialNote;
  const editorRef = useRef<NoteEditorHandle>(null);

  const [selectedLesson, setSelectedLesson] = useState<LibraryLessonSearchItem | null>(null);
  const [title, setTitle] = useState("");
  const [lessonQuery, setLessonQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [lessonPopoverOpen, setLessonPopoverOpen] = useState(false);
  // Captura o conteudo do editor apos cada auto-save do NoteEditor.
  const [currentContent, setCurrentContent] = useState<any[]>([]);

  // Busca aulas da Biblioteca.
  const { data: lessons = [] } = useQuery<LibraryLessonSearchItem[]>({
    queryKey: ["/api/library/lessons/search", lessonQuery],
    queryFn: () => apiRequest("GET", `/api/library/lessons/search?q=${encodeURIComponent(lessonQuery)}`),
    enabled: true,
    staleTime: 30_000,
  });

  // Pre-filtra por linkedLessons quando disponivel.

  // Hydrate currentContent quando abre.
  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      setCurrentContent(initialNote?.content ?? []);
    } else {
      setCurrentContent([]);
    }
  }, [open, isEdit, initialNote]);
  const filteredLessons = theme.linkedLessons && theme.linkedLessons.length > 0
    ? lessons.filter((l) => (theme.linkedLessons as string[]).includes(l.id))
    : lessons;

  // Hydrate quando abre em modo edicao.
  useEffect(() => {
    if (!open) return;
    if (isEdit && initialNote) {
      setTitle(initialNote.title);
      setSelectedLesson({
        id: initialNote.lessonId,
        title: initialNote.title,
        courseTitle: "",
      });
      // O NoteEditor usa initialContent; precisamos setar no editor apos mount.
      // Fazemos via ref apos proximo render.
    } else {
      setSelectedLesson(null);
      setTitle("");
    }
  }, [open, isEdit, initialNote]);

  // Atualiza titulo quando aula e selecionada (se vazio).
  const handleSelectLesson = (lesson: LibraryLessonSearchItem) => {
    setSelectedLesson(lesson);
    if (!title) setTitle(lesson.title);
    setLessonPopoverOpen(false);
  };

  const canSave = selectedLesson && title.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || !selectedLesson) return;
    setSaving(true);
    try {
      await onSave({
        lessonId: selectedLesson.id,
        title: title.trim(),
        content: currentContent,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Erro ao salvar nota",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const displayLabel = selectedLesson
    ? `${selectedLesson.courseTitle ? selectedLesson.courseTitle + " / " : ""}${selectedLesson.title}`
    : initialNote
    ? initialNote.title
    : "Selecione uma aula…";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="theme-lesson-note-dialog" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="theme-lesson-note-dialog-title">
            {isEdit ? "Editar nota de aula" : "Nova nota de aula"}
          </DialogTitle>
          <DialogDescription>
            Registre anotações sobre uma aula da Biblioteca vinculada a este tema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Seletor de aula (combobox) */}
          <div className="space-y-1">
            <Label htmlFor="lesson-select" className="text-xs font-medium text-muted-foreground">
              Aula
            </Label>
            <Popover open={lessonPopoverOpen} onOpenChange={setLessonPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  id="lesson-select"
                  data-testid="lesson-select-trigger"
                  disabled={isEdit}
                  className="flex w-full items-center justify-between rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-left hover:border-gray-600 disabled:opacity-50"
                >
                  <span className={selectedLesson || initialNote ? "text-white" : "text-gray-500"}>
                    {displayLabel}
                  </span>
                  {!isEdit && <ChevronDown className="h-4 w-4 text-gray-500" />}
                </button>
              </PopoverTrigger>
              <PopoverContent
                data-testid="lesson-select-popover"
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
              >
                <Command data-testid="lesson-select-command">
                  <CommandInput
                    data-testid="lesson-select-input"
                    placeholder="Buscar aula…"
                    value={lessonQuery}
                    onValueChange={setLessonQuery}
                  />
                  <CommandList>
                    <CommandEmpty data-testid="lesson-select-empty" className="py-4 text-sm text-muted-foreground">
                      Nenhuma aula encontrada.
                    </CommandEmpty>
                    <CommandGroup>
                      {filteredLessons.slice(0, 20).map((lesson) => (
                        <CommandItem
                          key={lesson.id}
                          data-testid={`lesson-option-${lesson.id}`}
                          value={lesson.id}
                          onSelect={() => handleSelectLesson(lesson)}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-foreground">{lesson.title}</span>
                            {lesson.courseTitle && (
                              <span className="text-xs text-muted-foreground">{lesson.courseTitle}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Titulo */}
          <div className="space-y-1">
            <Label htmlFor="note-title" className="text-xs font-medium text-muted-foreground">
              Titulo da nota
            </Label>
            <Input
              id="note-title"
              data-testid="note-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Ex: Range de 3-bet flop c-bet"
              className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
            />
          </div>

          {/* Editor BlockNote */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Anotacoes</Label>
            <div data-testid="note-editor-wrapper" className="rounded border border-gray-700 overflow-hidden">
              <NoteEditor
                key={isEdit ? `edit-${initialNote!.id}` : "new-note"}
                tabId={isEdit ? initialNote!.id : "new-note"}
                initialContent={isEdit ? (initialNote?.content ?? []) : []}
                onSave={(_tabId, content) => {
                  setCurrentContent(content);
                }}
                readOnly={false}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            data-testid="note-dialog-cancel"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            data-testid="note-dialog-save"
            disabled={!canSave || saving}
            onClick={handleSave}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Salvar alteracoes" : "Criar nota"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ThemeLessonNoteDialog;