import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, Trash2, Plus, Layers } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { StudyTheme } from './types';

interface ThemeGridProps {
  themes: StudyTheme[];
  onSelectTheme: (theme: StudyTheme) => void;
  onCreateTheme: () => void;
  onToggleFavorite: (themeId: string) => void;
  onDeleteTheme: (themeId: string) => void;
  searchTerm: string;
}

function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const parsed = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    if (isNaN(parsed.getTime())) return '';
    return formatDistanceToNow(parsed, { addSuffix: true, locale: ptBR });
  } catch {
    return '';
  }
}

export function ThemeGrid({
  themes,
  onSelectTheme,
  onCreateTheme,
  onToggleFavorite,
  onDeleteTheme,
  searchTerm,
}: ThemeGridProps) {
  const filteredAndSorted = useMemo(() => {
    let filtered = themes;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = themes.filter((t) =>
        t.name.toLowerCase().includes(term)
      );
    }
    // Favorites first, then by sortOrder
    return [...filtered].sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return a.sortOrder - b.sortOrder;
    });
  }, [themes, searchTerm]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {filteredAndSorted.map((theme) => (
        <Card
          key={theme.id}
          className="group relative bg-gray-800 border-gray-700 hover:border-gray-500 transition-all cursor-pointer overflow-hidden"
          style={{ borderLeftWidth: '4px', borderLeftColor: theme.color }}
          onClick={() => onSelectTheme(theme)}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-2xl flex-shrink-0">{theme.emoji || '📚'}</span>
                <h3 className="text-white font-medium truncate text-sm">
                  {theme.name}
                </h3>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-400 hover:text-yellow-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(theme.id);
                  }}
                >
                  <Star
                    className={`h-4 w-4 ${
                      theme.isFavorite ? 'fill-yellow-400 text-yellow-400' : ''
                    }`}
                  />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-400 hover:text-red-400"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent
                    className="bg-gray-800 border-gray-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-white">
                        Deletar tema
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-gray-400">
                        Tem certeza que deseja deletar &quot;{theme.name}&quot;?
                        Todo o conteudo (abas e anotacoes) sera perdido
                        permanentemente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-gray-700 text-white border-gray-600 hover:bg-gray-600">
                        Cancelar
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => onDeleteTheme(theme.id)}
                      >
                        Deletar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              {/* Always show star if favorited */}
              {theme.isFavorite && (
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 flex-shrink-0 group-hover:hidden" />
              )}
            </div>
            {/* Progress bar */}
            {(theme.progress ?? 0) > 0 && (
              <div className="mb-2">
                <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
                  <span>Progresso</span>
                  <span>{theme.progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${theme.progress}%`,
                      backgroundColor: theme.color,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{formatRelativeDate(theme.updatedAt)}</span>
              <div className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                <span>{theme.tabCount ?? 0} abas</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Create new theme card */}
      <Card
        className="bg-gray-800/50 border-gray-700 border-dashed hover:border-gray-500 hover:bg-gray-800 transition-all cursor-pointer flex items-center justify-center min-h-[120px]"
        onClick={onCreateTheme}
      >
        <CardContent className="p-4 flex flex-col items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <Plus className="h-8 w-8" />
          <span className="text-sm font-medium">Novo Tema</span>
        </CardContent>
      </Card>
    </div>
  );
}
