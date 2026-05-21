/**
 * Sprint Estudos-Sessao-1 — RF-08
 *
 * Bloco de notes linkadas a uma sessao. CRUD inline simples (textarea + add
 * + lista cronologica + delete).
 *
 * Lessons aplicadas:
 *   #1  hooks first.
 *   #2  data-testid: notes-block, note-input, note-add-btn, notes-empty-state,
 *       note-row-{id}, note-delete-{id}.
 *   #13 apiRequest retorna JSON parseado direto.
 */

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { track } from '@/lib/telemetry';
import { Trash2 } from 'lucide-react';
import { formatTime } from '@/components/grind-session/helpers';

interface NoteRow {
  id: string;
  studySessionId: string;
  studyCardId: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

interface Props {
  sessionId: string;
  readOnly?: boolean;
}

export function NotesBlock({ sessionId, readOnly }: Props): JSX.Element {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [content, setContent] = useState<string>('');

  const notesQuery = useQuery<NoteRow[]>({
    queryKey: ['/api/study-sessions', sessionId, 'notes'],
    queryFn: () => apiRequest('GET', `/api/study-sessions/${sessionId}/notes`),
  });

  const createMutation = useMutation({
    mutationFn: async (text: string) => {
      return (await apiRequest('POST', `/api/study-sessions/${sessionId}/notes`, {
        content: text,
      })) as NoteRow;
    },
    onSuccess: (note) => {
      track('study_note_created', {
        sessionId,
        length: typeof note?.content === 'string' ? note.content.length : 0,
      });
      setContent('');
      qc.invalidateQueries({ queryKey: ['/api/study-sessions', sessionId, 'notes'] });
    },
    onError: (err: any) => {
      console.error('NotesBlock.create.error', err);
      toast({
        title: 'Erro ao criar nota',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return await apiRequest('DELETE', `/api/study-notes/${noteId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/study-sessions', sessionId, 'notes'] });
    },
    onError: (err: any) => {
      console.error('NotesBlock.delete.error', err);
      toast({
        title: 'Erro ao excluir nota',
        variant: 'destructive',
      });
    },
  });

  function handleAdd(): void {
    const trimmed = content.trim();
    if (!trimmed) return;
    createMutation.mutate(trimmed);
  }

  const notes = notesQuery.data ?? [];

  return (
    <div data-testid="notes-block" className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">Anotacoes</h3>

      {!readOnly ? (
        <div className="space-y-2">
          <textarea
            data-testid="note-input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva uma nota sobre esta sessao..."
            rows={3}
            className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="note-add-btn"
              onClick={handleAdd}
              disabled={createMutation.isPending || !content.trim()}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Adicionar
            </button>
          </div>
        </div>
      ) : null}

      {notes.length === 0 ? (
        <p
          data-testid="notes-empty-state"
          className="text-sm text-muted-foreground py-4 text-center"
        >
          Nenhuma nota nesta sessao ainda. Comece a anotar acima.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {notes.map((n) => (
            <li
              key={n.id}
              data-testid={`note-row-${n.id}`}
              className="flex items-start justify-between gap-2 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                  {n.content}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatTime(n.createdAt)}
                </p>
              </div>
              {!readOnly ? (
                <button
                  type="button"
                  data-testid={`note-delete-${n.id}`}
                  onClick={() => deleteMutation.mutate(n.id)}
                  disabled={deleteMutation.isPending}
                  className="text-muted-foreground hover:text-destructive p-1 rounded"
                  aria-label="Excluir nota"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NotesBlock;
