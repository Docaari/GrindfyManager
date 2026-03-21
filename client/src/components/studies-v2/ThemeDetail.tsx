import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Plus,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { StudyTheme, StudyTab } from './types';
import { NoteEditor } from './NoteEditor';
import { CreateTabDialog } from './CreateTabDialog';

interface ThemeDetailProps {
  theme: StudyTheme;
  onBack: () => void;
  onRenameTheme: (id: string, name: string) => void;
}

export function ThemeDetail({ theme, onBack, onRenameTheme }: ThemeDetailProps) {
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [showCreateTab, setShowCreateTab] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');
  const [deleteTabTarget, setDeleteTabTarget] = useState<StudyTab | null>(null);
  const [editingThemeName, setEditingThemeName] = useState(false);
  const [themeName, setThemeName] = useState(theme.name);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch tabs for this theme
  const { data: tabs = [] } = useQuery<StudyTab[]>({
    queryKey: [`/api/study-themes/${theme.id}/tabs`],
  });

  // Set first tab as active if none selected
  if (tabs.length > 0 && !activeTabId) {
    setActiveTabId(tabs[0].id);
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // Create tab mutation
  const createTabMutation = useMutation({
    mutationFn: async (data: { name: string; content?: any[] }) => {
      return await apiRequest('POST', `/api/study-themes/${theme.id}/tabs`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/study-themes/${theme.id}/tabs`],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/study-themes'] });
      setShowCreateTab(false);
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Erro ao criar aba.',
        variant: 'destructive',
      });
    },
  });

  // Rename tab mutation
  const renameTabMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return await apiRequest('PUT', `/api/study-tabs/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/study-themes/${theme.id}/tabs`],
      });
      setEditingTabId(null);
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Erro ao renomear aba.',
        variant: 'destructive',
      });
    },
  });

  // Delete tab mutation
  const deleteTabMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/study-tabs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/study-themes/${theme.id}/tabs`],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/study-themes'] });
      // If deleted tab was active, switch to first
      if (deleteTabTarget?.id === activeTabId) {
        setActiveTabId(null);
      }
      setDeleteTabTarget(null);
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Erro ao deletar aba.',
        variant: 'destructive',
      });
    },
  });

  // Save tab content mutation
  const saveContentMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: any[] }) => {
      return await apiRequest('PUT', `/api/study-tabs/${id}`, { content });
    },
    onError: () => {
      toast({
        title: 'Erro ao salvar',
        description: 'Nao foi possivel salvar o conteudo. Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const handleSaveContent = useCallback(
    (tabId: string, content: any[]) => {
      saveContentMutation.mutate({ id: tabId, content });
    },
    [saveContentMutation]
  );

  const handleToggleFocus = () => {
    setFocusMode(!focusMode);
    if (!focusMode) {
      document.body.classList.add('studies-focus-mode');
    } else {
      document.body.classList.remove('studies-focus-mode');
    }
  };

  const handleStartRenameTab = (tab: StudyTab) => {
    setEditingTabId(tab.id);
    setEditingTabName(tab.name);
  };

  const handleConfirmRenameTab = () => {
    if (editingTabId && editingTabName.trim()) {
      renameTabMutation.mutate({ id: editingTabId, name: editingTabName.trim() });
    }
  };

  const handleThemeNameSave = () => {
    if (themeName.trim() && themeName.trim() !== theme.name) {
      onRenameTheme(theme.id, themeName.trim());
    }
    setEditingThemeName(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with breadcrumb and actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 hover:text-white flex-shrink-0"
            onClick={() => {
              if (focusMode) {
                document.body.classList.remove('studies-focus-mode');
              }
              onBack();
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-gray-400 min-w-0">
            <button
              onClick={() => {
                if (focusMode) {
                  document.body.classList.remove('studies-focus-mode');
                }
                onBack();
              }}
              className="hover:text-white transition-colors"
            >
              Estudos
            </button>
            <span>/</span>
            {editingThemeName ? (
              <div className="flex items-center gap-1">
                <Input
                  value={themeName}
                  onChange={(e) => setThemeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleThemeNameSave();
                    if (e.key === 'Escape') {
                      setThemeName(theme.name);
                      setEditingThemeName(false);
                    }
                  }}
                  className="h-6 w-40 bg-gray-800 border-gray-600 text-white text-sm"
                  maxLength={50}
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleThemeNameSave}
                >
                  <Check className="h-3 w-3 text-green-400" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    setThemeName(theme.name);
                    setEditingThemeName(false);
                  }}
                >
                  <X className="h-3 w-3 text-gray-400" />
                </Button>
              </div>
            ) : (
              <button
                className="text-white font-medium hover:underline truncate max-w-[200px]"
                onClick={() => setEditingThemeName(true)}
                title="Clique para renomear"
              >
                <span className="mr-1">{theme.emoji || '📚'}</span>
                {theme.name}
              </button>
            )}
            {activeTab && (
              <>
                <span>/</span>
                <span className="text-gray-300 truncate max-w-[150px]">
                  {activeTab.name}
                </span>
              </>
            )}
          </nav>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-gray-400 hover:text-white"
          onClick={handleToggleFocus}
          title={focusMode ? 'Sair do modo foco' : 'Modo foco'}
        >
          {focusMode ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Tabs bar */}
      <div className="flex items-center gap-1 border-b border-gray-700 mb-4 overflow-x-auto pb-px">
        {tabs.map((tab) => (
          <div key={tab.id} className="flex items-center group relative">
            {editingTabId === tab.id ? (
              <div className="flex items-center gap-1 px-2 py-1.5">
                <Input
                  value={editingTabName}
                  onChange={(e) => setEditingTabName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmRenameTab();
                    if (e.key === 'Escape') setEditingTabId(null);
                  }}
                  className="h-6 w-24 bg-gray-800 border-gray-600 text-white text-xs"
                  maxLength={30}
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={handleConfirmRenameTab}
                >
                  <Check className="h-3 w-3 text-green-400" />
                </Button>
              </div>
            ) : (
              <button
                className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                  activeTabId === tab.id
                    ? 'border-current text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
                style={
                  activeTabId === tab.id ? { color: theme.color } : undefined
                }
                onClick={() => setActiveTabId(tab.id)}
              >
                {tab.name}
              </button>
            )}

            {/* Tab context menu (only for non-default tabs) */}
            {!tab.isDefault && editingTabId !== tab.id && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white -ml-1"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-gray-800 border-gray-700">
                  <DropdownMenuItem
                    className="text-gray-200 focus:bg-gray-700 focus:text-white cursor-pointer"
                    onClick={() => handleStartRenameTab(tab)}
                  >
                    <Pencil className="h-3 w-3 mr-2" />
                    Renomear
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-red-400 focus:bg-gray-700 focus:text-red-300 cursor-pointer"
                    onClick={() => setDeleteTabTarget(tab)}
                  >
                    <Trash2 className="h-3 w-3 mr-2" />
                    Deletar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}

        {/* Add tab button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-gray-400 hover:text-white flex-shrink-0"
          onClick={() => setShowCreateTab(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor area */}
      <div className="flex-1 min-h-0">
        {activeTab ? (
          <NoteEditor
            key={activeTab.id}
            tabId={activeTab.id}
            initialContent={activeTab.content ?? []}
            onSave={handleSaveContent}
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <p>Nenhuma aba disponivel. Crie uma nova aba para comecar.</p>
          </div>
        )}
      </div>

      {/* Create tab dialog */}
      <CreateTabDialog
        open={showCreateTab}
        onOpenChange={setShowCreateTab}
        onCreateTab={(name, content) => {
          createTabMutation.mutate({ name, content });
        }}
      />

      {/* Delete tab confirmation */}
      <AlertDialog
        open={!!deleteTabTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTabTarget(null);
        }}
      >
        <AlertDialogContent className="bg-gray-800 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Deletar aba
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Tem certeza que deseja deletar a aba &quot;{deleteTabTarget?.name}
              &quot;? Todo o conteudo sera perdido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-700 text-white border-gray-600 hover:bg-gray-600">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deleteTabTarget) {
                  deleteTabMutation.mutate(deleteTabTarget.id);
                }
              }}
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
