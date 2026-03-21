import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Keyboard,
  Columns2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Tag,
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
import { BoardWidget, type BoardData } from './BoardWidget';
import { RangeGrid, type RangeData } from './RangeGrid';
import { HandNotation, type HandNoteData } from './HandNotation';
import { ShortcutsDialog } from './ShortcutsDialog';

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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [comparisonTab, setComparisonTab] = useState<{
    themeId: string;
    tabId: string;
  } | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showImageUrl, setShowImageUrl] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const noteEditorRef = useRef<{ insertImageUrl: (url: string) => void } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch tabs for this theme
  const { data: tabs = [] } = useQuery<StudyTab[]>({
    queryKey: [`/api/study-themes/${theme.id}/tabs`],
  });

  // Fetch all themes for comparison selector
  const { data: allThemes = [] } = useQuery<StudyTheme[]>({
    queryKey: ['/api/study-themes'],
    enabled: showCompare,
  });

  // Fetch comparison tabs
  const { data: comparisonTabs = [] } = useQuery<StudyTab[]>({
    queryKey: [`/api/study-themes/${comparisonTab?.themeId}/tabs`],
    enabled: !!comparisonTab?.themeId,
  });

  const comparisonActiveTab =
    comparisonTabs.find((t) => t.id === comparisonTab?.tabId) ?? null;

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

  // Save tools data mutation (boards, ranges, handNotes)
  const saveToolsMutation = useMutation({
    mutationFn: async (data: {
      id: string;
      boards?: BoardData[];
      ranges?: RangeData[];
      handNotes?: HandNoteData[];
    }) => {
      const { id, ...rest } = data;
      return await apiRequest('PUT', `/api/study-tabs/${id}`, rest);
    },
    onError: () => {
      toast({
        title: 'Erro ao salvar',
        description: 'Nao foi possivel salvar as ferramentas. Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  // Save tags mutation
  const saveTagsMutation = useMutation({
    mutationFn: async ({ id, tags }: { id: string; tags: string[] }) => {
      return await apiRequest('PUT', `/api/study-tabs/${id}`, { tags });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/study-themes/${theme.id}/tabs`],
      });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Erro ao salvar tags.',
        variant: 'destructive',
      });
    },
  });

  // Update progress mutation
  const updateProgressMutation = useMutation({
    mutationFn: async (progress: number) => {
      return await apiRequest('PUT', `/api/study-themes/${theme.id}`, { progress });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-themes'] });
    },
  });

  const handleSaveContent = useCallback(
    (tabId: string, content: any[]) => {
      saveContentMutation.mutate({ id: tabId, content });
    },
    [saveContentMutation]
  );

  const handleBoardsChange = useCallback(
    (boards: BoardData[]) => {
      if (!activeTab) return;
      saveToolsMutation.mutate({ id: activeTab.id, boards });
    },
    [activeTab, saveToolsMutation]
  );

  const handleRangesChange = useCallback(
    (ranges: RangeData[]) => {
      if (!activeTab) return;
      saveToolsMutation.mutate({ id: activeTab.id, ranges });
    },
    [activeTab, saveToolsMutation]
  );

  const handleHandNotesChange = useCallback(
    (handNotes: HandNoteData[]) => {
      if (!activeTab) return;
      saveToolsMutation.mutate({ id: activeTab.id, handNotes });
    },
    [activeTab, saveToolsMutation]
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

  const handleAddTag = () => {
    if (!activeTab || !tagInput.trim()) return;
    const newTags = [...(activeTab.tags || []), tagInput.trim()];
    saveTagsMutation.mutate({ id: activeTab.id, tags: newTags });
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    if (!activeTab) return;
    const newTags = (activeTab.tags || []).filter((t) => t !== tag);
    saveTagsMutation.mutate({ id: activeTab.id, tags: newTags });
  };

  const handleInsertImageUrl = () => {
    if (!imageUrl.trim()) return;
    if (noteEditorRef.current) {
      noteEditorRef.current.insertImageUrl(imageUrl.trim());
    }
    setImageUrl('');
    setShowImageUrl(false);
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
                <span className="mr-1">{theme.emoji || '\uD83D\uDCDA'}</span>
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

        {/* Header actions */}
        <div className="flex items-center gap-1">
          {/* Progress slider */}
          <div className="flex items-center gap-2 mr-2">
            <span className="text-[10px] text-gray-500">Progresso</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={theme.progress ?? 0}
              onChange={(e) => updateProgressMutation.mutate(Number(e.target.value))}
              className="w-20 h-1 accent-green-500"
              title={`${theme.progress ?? 0}%`}
            />
            <span className="text-[10px] text-gray-400 w-8">
              {theme.progress ?? 0}%
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className={`h-7 text-xs px-2 ${
              showCompare
                ? 'text-blue-400 bg-blue-500/10'
                : 'text-gray-400 hover:text-white'
            }`}
            onClick={() => {
              setShowCompare(!showCompare);
              if (showCompare) setComparisonTab(null);
            }}
            title="Comparar com outra aba"
          >
            <Columns2 className="h-3 w-3 mr-1" />
            Comparar
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-400 hover:text-white"
            onClick={() => setShowShortcuts(true)}
            title="Atalhos do editor"
          >
            <Keyboard className="h-4 w-4" />
          </Button>

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

      {/* Tags section */}
      {activeTab && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Tag className="h-3 w-3 text-gray-500 flex-shrink-0" />
          {(activeTab.tags || []).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 text-[11px]"
            >
              {tag}
              <button
                className="text-gray-500 hover:text-red-400"
                onClick={() => handleRemoveTag(tag)}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {editingTags ? (
            <div className="flex items-center gap-1">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTag();
                  if (e.key === 'Escape') {
                    setEditingTags(false);
                    setTagInput('');
                  }
                }}
                placeholder="Nova tag..."
                className="h-5 w-24 text-[11px] bg-gray-800 border-gray-600 text-white"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4"
                onClick={handleAddTag}
              >
                <Check className="h-2.5 w-2.5 text-green-400" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4"
                onClick={() => {
                  setEditingTags(false);
                  setTagInput('');
                }}
              >
                <X className="h-2.5 w-2.5 text-gray-400" />
              </Button>
            </div>
          ) : (
            <button
              className="text-[11px] text-gray-500 hover:text-gray-300"
              onClick={() => setEditingTags(true)}
            >
              + tag
            </button>
          )}
        </div>
      )}

      {/* Ferramentas section (collapsible) */}
      {activeTab && (
        <div className="mb-4">
          <button
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 mb-2"
            onClick={() => setShowTools(!showTools)}
          >
            {showTools ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            Ferramentas
          </button>

          {showTools && (
            <div className="space-y-4 bg-gray-900/30 rounded-lg p-3 border border-gray-800">
              {/* Board Widget */}
              <div>
                <h4 className="text-xs font-medium text-gray-400 mb-2">
                  Boards
                </h4>
                <BoardWidget
                  boards={(activeTab.boards as BoardData[]) || []}
                  onChange={handleBoardsChange}
                />
              </div>

              {/* Range Grid */}
              <div>
                <h4 className="text-xs font-medium text-gray-400 mb-2">
                  Ranges
                </h4>
                <RangeGrid
                  ranges={(activeTab.ranges as RangeData[]) || []}
                  onChange={handleRangesChange}
                />
              </div>

              {/* Hand Notation */}
              <div>
                <h4 className="text-xs font-medium text-gray-400 mb-2">
                  Notacao de Maos
                </h4>
                <HandNotation
                  handNotes={(activeTab.handNotes as HandNoteData[]) || []}
                  onChange={handleHandNotesChange}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Image URL insert */}
      {activeTab && (
        <div className="flex items-center gap-2 mb-2">
          {showImageUrl ? (
            <div className="flex items-center gap-1">
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleInsertImageUrl();
                  if (e.key === 'Escape') {
                    setShowImageUrl(false);
                    setImageUrl('');
                  }
                }}
                placeholder="https://..."
                className="h-6 w-64 text-xs bg-gray-800 border-gray-600 text-white"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleInsertImageUrl}
              >
                <Check className="h-3 w-3 text-green-400" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  setShowImageUrl(false);
                  setImageUrl('');
                }}
              >
                <X className="h-3 w-3 text-gray-400" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] text-gray-500 hover:text-gray-300 px-2"
              onClick={() => setShowImageUrl(true)}
            >
              <ImageIcon className="h-3 w-3 mr-1" />
              Colar URL de imagem
            </Button>
          )}
        </div>
      )}

      {/* Editor area (with optional comparison split) */}
      <div className="flex-1 min-h-0">
        {showCompare ? (
          <div className="grid grid-cols-2 gap-4 h-full">
            {/* Left side - current tab */}
            <div className="flex flex-col min-h-0 border border-gray-700 rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-xs text-gray-300 font-medium">
                {theme.emoji} {theme.name} / {activeTab?.name || '---'}
              </div>
              <div className="flex-1 min-h-0">
                {activeTab ? (
                  <NoteEditor
                    key={activeTab.id}
                    ref={noteEditorRef}
                    tabId={activeTab.id}
                    initialContent={activeTab.content ?? []}
                    onSave={handleSaveContent}
                  />
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-500">
                    <p>Selecione uma aba.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right side - comparison */}
            <div className="flex flex-col min-h-0 border border-gray-700 rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
                <Select
                  value={comparisonTab?.themeId || ''}
                  onValueChange={(val) =>
                    setComparisonTab({ themeId: val, tabId: '' })
                  }
                >
                  <SelectTrigger className="h-6 text-xs bg-gray-900 border-gray-600 text-gray-300 w-36">
                    <SelectValue placeholder="Tema..." />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {allThemes.map((t) => (
                      <SelectItem
                        key={t.id}
                        value={t.id}
                        className="text-gray-300 text-xs"
                      >
                        {t.emoji} {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {comparisonTab?.themeId && (
                  <Select
                    value={comparisonTab?.tabId || ''}
                    onValueChange={(val) =>
                      setComparisonTab((prev) =>
                        prev ? { ...prev, tabId: val } : null
                      )
                    }
                  >
                    <SelectTrigger className="h-6 text-xs bg-gray-900 border-gray-600 text-gray-300 w-28">
                      <SelectValue placeholder="Aba..." />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {comparisonTabs.map((t) => (
                        <SelectItem
                          key={t.id}
                          value={t.id}
                          className="text-gray-300 text-xs"
                        >
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex-1 min-h-0">
                {comparisonActiveTab ? (
                  <NoteEditor
                    key={`compare-${comparisonActiveTab.id}`}
                    tabId={comparisonActiveTab.id}
                    initialContent={comparisonActiveTab.content ?? []}
                    onSave={() => {}}
                    readOnly
                  />
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
                    <p>Selecione um tema e aba para comparar.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab ? (
          <NoteEditor
            key={activeTab.id}
            ref={noteEditorRef}
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

      {/* Shortcuts dialog */}
      <ShortcutsDialog
        open={showShortcuts}
        onOpenChange={setShowShortcuts}
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
