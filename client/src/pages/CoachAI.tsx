// =============================================================================
// CoachAI — Hub do Grindfy AI (Sprint AI-0B / RF-07, ADR-148 + ADR-150).
//
// Layout em 4 tabs URL-persisted (?tab=chat|reports|audit|prefs, default chat):
//   - Chat            — chat unificado (agente unico) + chips de "lente/foco".
//   - Relatorios e avisos — esqueleto/EmptyState (relatorios automaticos = Fase 1).
//   - Historico de acoes  — consome GET /api/coach/audit.
//   - Preferencias    — consome GET / PUT /api/coach/preferences (toggles de nudge).
//
// Lessons aplicaveis: #13 (apiRequest retorna JSON parseado), #27 (Radix Tabs
// reage a onMouseDown — TabsTrigger controlado tem onClick redundante), #29
// (useQuery dentro de QueryClientProvider — paineis), #30 (hook test jsdom).
// =============================================================================

import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import {
  Brain,
  Trophy,
  GraduationCap,
  Send,
  Plus,
  Archive,
  Trash2,
  Search,
  Loader2,
  MessageSquare,
  FileText,
  History,
  Settings,
  Sparkles,
  CalendarCheck,
  X,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { useCoachChat, type CoachType, type ChatMessage } from '@/hooks/useCoachChat';
import { useCoachPageContext } from '@/hooks/useCoachPageContext';
import { useTabFromUrl } from '@/hooks/useTabFromUrl';
import {
  CoachLessonRecommendationCard,
  type CoachLessonRecommendation,
} from '@/components/coach/CoachLessonRecommendationCard';
// Sprint AI-1A follow-up (RF-07): banner de onboarding no topo da aba Chat.
import OnboardingBanner from '@/components/coach/OnboardingBanner';
import { CoachLensChips } from '@/components/coach-ai/CoachLensChips';
import { LENS_PLACEHOLDER } from '@/lib/coachLensMeta';
// Sprint AI-1B — timeline (reports + nudges) + quick suggestions anti-blank-page.
import NudgeCard from '@/components/coach/NudgeCard';
import { getFallbackSuggestions } from '@/lib/quickSuggestionsFallback';
// Sprint Mini Player 2 (CRITICAL-2) — Spotify connection panel em Preferencias.
import { SpotifyConnectionPanel } from '@/components/settings/SpotifyConnectionPanel';
// EST-5 (ADR-224 -> 226) — Revisao semanal (ritual de segunda) + monta PlanningWizard.
import { WeeklyReviewPanel } from '@/components/coach/weekly-review/WeeklyReviewPanel';

const HUB_TABS = ['chat', 'reports', 'review', 'audit', 'prefs'] as const;
type HubTab = (typeof HUB_TABS)[number];

const TAB_META: ReadonlyArray<{ value: HubTab; label: string; icon: any }> = [
  { value: 'chat', label: 'Chat', icon: MessageSquare },
  { value: 'reports', label: 'Relatorios e avisos', icon: FileText },
  { value: 'review', label: 'Revisao semanal', icon: CalendarCheck },
  { value: 'audit', label: 'Historico de acoes', icon: History },
  { value: 'prefs', label: 'Preferencias', icon: Settings },
];

const LENS_OPTIONS = [
  { value: 'mental' as CoachType, icon: Brain, label: 'Mental' },
  { value: 'tournament' as CoachType, icon: Trophy, label: 'Selecao' },
  { value: 'technical' as CoachType, icon: GraduationCap, label: 'Tecnico' },
] as const;

// F3: extract lesson recommendations from message metadata.
function extractLessonRecommendations(message: ChatMessage): CoachLessonRecommendation[] {
  const meta: any = message.metadata;
  if (!meta || typeof meta !== 'object') return [];
  if (Array.isArray(meta.recommendedLessons)) {
    return meta.recommendedLessons as CoachLessonRecommendation[];
  }
  const tools = Array.isArray(meta.toolResults) ? meta.toolResults : [];
  const out: CoachLessonRecommendation[] = [];
  for (const tr of tools) {
    if (tr?.tool === 'recommend_lesson' && Array.isArray(tr?.data?.lessons)) {
      out.push(...tr.data.lessons);
    }
  }
  return out;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const recommendations = !isUser ? extractLessonRecommendations(message) : [];
  return (
    <div className={cn('flex w-full mb-4', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-3 text-sm',
          isUser
            ? 'bg-green-600/20 border border-green-600/30 text-gray-100'
            : 'bg-gray-800 border border-gray-700 text-gray-200'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:text-green-400 prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}
        {recommendations.length > 0 && (
          <div className="mt-3" data-testid="coach-message-recommendations">
            <CoachLessonRecommendationCard lessons={recommendations} />
          </div>
        )}
        <p className="text-xs text-gray-500 mt-1">
          {new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SessionSidebar — lista de conversas anteriores (selecionar/retomar, arquivar,
// deletar com confirmacao, busca). Reaproveitado da CoachAI antiga (Sprint AI-0B
// fix HIGH do reviewer: o hub nao pode perder o registro de sessoes).
// -----------------------------------------------------------------------------
type SessionLike = ReturnType<typeof useCoachChat>['sessions'][number];

function SessionSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewConversation,
  onArchiveSession,
  onDeleteSession,
  isLoading,
}: {
  sessions: SessionLike[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewConversation: () => void;
  onArchiveSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  isLoading: boolean;
}) {
  const [search, setSearch] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => (s.title || 'Nova conversa').toLowerCase().includes(q));
  }, [sessions, search]);

  return (
    <div className="flex flex-col h-full" data-testid="coach-session-sidebar">
      <div className="p-3 border-b border-gray-700 space-y-2">
        <Button
          data-testid="coach-new-conversation"
          onClick={onNewConversation}
          className="w-full bg-green-600 hover:bg-green-500 text-white"
          size="sm"
        >
          <Plus size={16} className="mr-2" />
          Nova conversa
        </Button>
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            data-testid="coach-session-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversa..."
            className="pl-7 h-8 bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8" data-testid="coach-sessions-loading">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 px-3">
              <MessageSquare size={32} className="mx-auto text-gray-600 mb-2" />
              <p className="text-sm text-gray-500">
                {search.trim() ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
              </p>
              {!search.trim() && (
                <p className="text-xs text-gray-600 mt-1">Inicie uma conversa com o Grindfy AI</p>
              )}
            </div>
          ) : (
            filtered.map((session) => (
              <div
                key={session.id}
                data-testid="coach-session-item"
                className={cn(
                  'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                  activeSessionId === session.id
                    ? 'bg-green-600/20 border border-green-600/30'
                    : 'hover:bg-gray-800'
                )}
                onClick={() => onSelectSession(session.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{session.title || 'Nova conversa'}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {session.status === 'archived' && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 border-gray-600 text-gray-500">
                        Arquivada
                      </Badge>
                    )}
                    <span className="text-[10px] text-gray-500">{session.messageCount} msgs</span>
                  </div>
                </div>
                <div className="hidden group-hover:flex items-center gap-1">
                  {session.status === 'active' && (
                    <button
                      data-testid="coach-session-archive"
                      onClick={(e) => { e.stopPropagation(); onArchiveSession(session.id); }}
                      className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300"
                      title="Arquivar"
                    >
                      <Archive size={14} />
                    </button>
                  )}
                  <button
                    data-testid="coach-session-delete"
                    onClick={(e) => { e.stopPropagation(); setPendingDeleteId(session.id); }}
                    className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-red-400"
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent data-testid="coach-session-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta conversa sera removida permanentemente. Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="coach-session-delete-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-testid="coach-session-delete-confirm"
              onClick={() => {
                if (pendingDeleteId) onDeleteSession(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              Apagar conversa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Quick suggestions anti-blank-page (Sprint AI-1B / RF-12, ADR-158)
// -----------------------------------------------------------------------------
type QuickSuggestion = { id: string; text: string; sendOnClick?: boolean };

function QuickSuggestionChips({ route, coachType, onPick }: { route: string; coachType?: CoachType; onPick: (text: string) => void }) {
  // #11 — a lente ativa entra na queryKey + no endpoint, entao trocar de lente
  // re-busca chips sob medida (e o cache do servidor tambem eh por lente).
  const lensQuery = coachType ? `&lens=${encodeURIComponent(coachType)}` : '';
  const { data, isLoading } = useQuery<{ suggestions?: QuickSuggestion[] } | null>({
    queryKey: ['/api/coach/suggestions', route, coachType ?? null],
    queryFn: async () => {
      try {
        return await apiRequest('GET', `/api/coach/suggestions?route=${encodeURIComponent(route)}${lensQuery}`);
      } catch {
        return null; // fallback estatico abaixo
      }
    },
    retry: false,
  });

  if (isLoading) return null; // espera o endpoint settle antes de mostrar (evita flash de fallback)

  const suggestions: QuickSuggestion[] =
    (data && Array.isArray((data as any).suggestions) && (data as any).suggestions.length > 0)
      ? (data as any).suggestions
      : (getFallbackSuggestions(route, coachType) as any);

  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div data-testid="coach-quick-suggestions" className="flex flex-wrap justify-center gap-2 mt-4">
      {suggestions.slice(0, 4).map((s) => (
        <button
          key={s.id}
          type="button"
          data-testid="coach-quick-suggestion-chip"
          onClick={() => onPick(s.text)}
          className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800"
        >
          {s.text}
        </button>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Chat panel — agente unico + chips de lente + sidebar de sessoes
// -----------------------------------------------------------------------------
function ChatPanel() {
  // Sprint AI-0B / RF-03+RF-07: coachType vira "lente inicial". Default
  // 'technical' (consistente com o padrao do /coach — ADR-125).
  const [coachType, setCoachType] = useState<CoachType>('technical');
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sprint AI-0B / RF-04+RF-07: page context da rota /coach-ai = { route, activeCoachType }.
  const pageContext = useCoachPageContext('coach-ai', { activeCoachType: coachType });

  const {
    sessions,
    messages,
    activeSessionId,
    setActiveSessionId,
    isLoadingSessions,
    isStreaming,
    streamedText,
    streamError,
    sendMessage,
    startNewConversation,
    archiveSession,
    deleteSession,
  } = useCoachChat(coachType, { pageContext });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedText]);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming) return;
    setInputValue('');
    sendMessage(trimmed);
  }, [inputValue, isStreaming, sendMessage]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="flex flex-col h-full">
      {/* Sprint AI-1A follow-up: onboarding do Grindfy AI (some quando completo / dispensado). */}
      <OnboardingBanner />
      <div className="flex flex-1 min-h-0">
      {/* Sidebar de conversas (md+; em mobile fica acima do chat). */}
      <div className="hidden md:flex w-60 border-r border-gray-700 bg-gray-800/50 flex-col shrink-0">
        <SessionSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewConversation={startNewConversation}
          onArchiveSession={archiveSession}
          onDeleteSession={deleteSession}
          isLoading={isLoadingSessions}
        />
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <CoachLensChips
          coachType={coachType}
          onChangeCoachType={(value) => {
            // #4 — NAO limpar o input ao trocar de lente (perda de texto digitado).
            setCoachType(value);
          }}
        />

        {/* Sidebar de conversas (mobile — colapsa em barra horizontal de acesso). */}
        <div className="md:hidden border-b border-gray-800 max-h-40 overflow-auto">
          <SessionSidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onNewConversation={startNewConversation}
            onArchiveSession={archiveSession}
            onDeleteSession={deleteSession}
            isLoading={isLoadingSessions}
          />
        </div>

        <ScrollArea className="flex-1 p-4">
          {messages.length === 0 && !streamedText ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center">
              <Sparkles size={48} className="text-green-600/40 mb-4" />
              <h3 className="text-lg font-medium text-gray-300 mb-2">Grindfy AI</h3>
              <p className="text-sm text-gray-500 max-w-md">
                Nao so respondo — eu <span className="text-gray-300">ajo</span> sobre seus dados:
                monto sua grade, registro um foco de leak, calculo seu rake, analiso sua variancia.
                Peca direto, ou comece por aqui:
              </p>
              <QuickSuggestionChips
                route="/coach-ai"
                coachType={coachType}
                onPick={(text) => { setInputValue(text); textareaRef.current?.focus(); }}
              />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {isStreaming && streamedText && (
                <div className="flex w-full mb-4 justify-start">
                  <div className="max-w-[80%] rounded-lg px-4 py-3 text-sm bg-gray-800 border border-gray-700 text-gray-200">
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamedText}</ReactMarkdown>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-xs text-gray-500">digitando...</span>
                    </div>
                  </div>
                </div>
              )}
              {streamError && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/20 border border-red-800/30 text-red-400 text-sm">
                  {streamError}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-gray-700 p-4">
          <div className="max-w-3xl mx-auto flex gap-2">
            <Textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={LENS_PLACEHOLDER[coachType]}
              className="flex-1 bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 resize-none min-h-[44px] max-h-[120px]"
              rows={1}
              disabled={isStreaming}
              maxLength={2000}
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || isStreaming}
              className="bg-green-600 hover:bg-green-500 text-white self-end"
              size="icon"
            >
              {isStreaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </Button>
          </div>
          <p className="text-[10px] text-gray-600 mt-1 text-center">
            Enter para enviar, Shift+Enter para nova linha
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Relatorios e avisos — timeline (reports + nudges) — Sprint AI-1B / RF-08
// -----------------------------------------------------------------------------

// Sprint EST-1 / RF-06 — banner de discoverability (default-ON, dismissable).
// Anuncia a entrega tripla dos relatorios + CTA para a aba Preferencias.
const COACH_REPORT_BANNER_DISMISS_KEY = 'coachReportBanner.dismissed.v1';

function ReportDiscoverabilityBanner({ onGoToPreferences }: { onGoToPreferences: () => void }) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined'
        && window.localStorage?.getItem(COACH_REPORT_BANNER_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    try { window.localStorage?.setItem(COACH_REPORT_BANNER_DISMISS_KEY, '1'); } catch { /* noop */ }
    setDismissed(true);
  };

  return (
    <div
      data-testid="coach-report-banner"
      className="rounded-lg border border-green-600/40 bg-green-600/10 p-4 flex items-start justify-between gap-3"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-green-300">
          Seus relatorios chegam por notificacao, chat e email
        </p>
        <p className="text-xs text-gray-400">
          Ative ou ajuste a entrega por email na aba Preferencias.
        </p>
        <button
          type="button"
          data-testid="coach-report-banner-cta"
          onClick={onGoToPreferences}
          className="mt-1 text-xs font-medium text-green-400 underline"
        >
          Abrir Preferências
        </button>
      </div>
      <button
        type="button"
        data-testid="coach-report-banner-dismiss"
        onClick={handleDismiss}
        aria-label="Dispensar aviso"
        className="text-gray-500 hover:text-gray-300"
      >
        <X size={16} />
      </button>
    </div>
  );
}

type TimelineItem =
  | { kind: 'report'; id: string; reportType: string; periodStart: string; periodEnd: string; status: string; summaryLine?: string; generatedAt?: string; readAt?: string | null; dismissedAt?: string | null }
  | { kind: 'nudge'; id: string; category: string; status: string; title?: string | null; bodyPreview?: string | null; sentAt?: string | null; engagedAt?: string | null; dismissedAt?: string | null; snoozeUntil?: string | null; chatSessionId?: string | null; triggeredByEvent?: string | null };

function ReportsPanel() {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError } = useQuery<{ items?: TimelineItem[] } | null>({
    queryKey: ['/api/coach/timeline'],
    queryFn: () => apiRequest('GET', '/api/coach/timeline'),
    retry: false,
  });

  const items: TimelineItem[] = Array.isArray(data?.items) ? data!.items! : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isError && items.length === 0) {
    return (
      <div
        data-testid="coach-ai-reports-empty"
        className="flex flex-col items-center justify-center h-full py-20 text-center"
      >
        <FileText size={48} className="text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-300 mb-2">Relatorios e avisos</h3>
        <p className="text-sm text-gray-500 max-w-md">
          Seus relatorios semanais e os avisos do Grindfy AI aparecerao aqui.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="coach-timeline-list" className="p-4 space-y-3 overflow-auto">
      <h3 className="text-base font-medium text-gray-300">Relatorios e avisos</h3>
      {isError ? (
        <p className="text-sm text-red-400">Nao foi possivel carregar a timeline.</p>
      ) : null}
      {items.map((it) =>
        it.kind === 'report' ? (
          <button
            key={`r-${it.id}`}
            type="button"
            data-testid="coach-timeline-item-report"
            data-href={`/coach-ai/relatorio/${it.id}`}
            onClick={() => setLocation(`/coach-ai/relatorio/${it.id}`)}
            className="w-full text-left rounded-lg border border-gray-700 bg-gray-800/50 p-4 hover:bg-gray-800"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-200">
                {(it.reportType === 'daily' ? 'Debrief diário'
                  : it.reportType === 'monthly' ? 'Relatório mensal'
                  : it.reportType === 'quarterly' ? 'Revisão trimestral'
                  : 'Relatório semanal')} — {it.periodStart} a {it.periodEnd}
              </span>
              {it.status === 'degraded' ? (
                <span className="shrink-0 rounded-full bg-amber-900/30 px-2 py-0.5 text-[10px] text-amber-300">
                  modo simplificado
                </span>
              ) : null}
            </div>
            {it.summaryLine ? <p className="mt-1 text-xs text-gray-400">{it.summaryLine}</p> : null}
          </button>
        ) : (
          <div key={`n-${it.id}`} data-testid="coach-timeline-item-nudge">
            <NudgeCard nudge={it} />
          </div>
        ),
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Historico de acoes — consome GET /api/coach/audit
// -----------------------------------------------------------------------------
type AuditItem = {
  id: string;
  type?: string;
  description?: string;
  status?: string;
  createdAt?: string;
};

// Aceita tanto array direto quanto { items: [...] } / { data: [...] }.
function extractAuditItems(data: any): AuditItem[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function CoachAuditPanel() {
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ['/api/coach/audit'],
    queryFn: () => apiRequest('GET', '/api/coach/audit'),
  });

  const items = extractAuditItems(data);

  return (
    <div data-testid="coach-audit-panel" className="p-4">
      <h3 className="text-base font-medium text-gray-300 mb-3">Historico de acoes</h3>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-400">Nao foi possivel carregar o historico de acoes.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma acao registrada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              data-testid="coach-audit-item"
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700"
            >
              <span className="text-sm text-gray-200 truncate">{it.description || it.type || it.id}</span>
              <div className="flex items-center gap-2 shrink-0">
                {it.status && (
                  <span className="text-[10px] uppercase text-gray-400 border border-gray-600 rounded px-1">
                    {it.status}
                  </span>
                )}
                {it.createdAt && (
                  <span className="text-[10px] text-gray-500">
                    {new Date(it.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Preferencias de nudge — consome GET / PUT /api/coach/preferences
// -----------------------------------------------------------------------------
const NUDGE_KEYS = ['bSnapshot', 'bLeak', 'bStudy', 'bVolume', 'bGrade', 'bDownswing', 'bLife', 'bMental'] as const;
type NudgeKey = (typeof NUDGE_KEYS)[number];

const NUDGE_LABELS: Record<NudgeKey, string> = {
  bSnapshot: 'Lembrete de snapshot',
  bLeak: 'Avisos de leak',
  bStudy: 'Lembrete de estudo',
  bVolume: 'Acompanhamento de volume',
  bGrade: 'Sugestoes de grade',
  bDownswing: 'Alerta de downswing',
  bLife: 'Vida fora do poker',
  bMental: 'Cuidado mental',
};

type FrozenCategoryEntry = { frozenAt?: string; reason?: string; dismissRate?: number; windowDays?: number };
type PrefsResponse = {
  nudges?: Partial<Record<NudgeKey, boolean>>;
  quietHours?: { startHour?: number; endHour?: number; timezone?: string };
  frequencyCap?: { perDay?: number; perHour?: number };
  frozenCategories?: Record<string, FrozenCategoryEntry>;
  // AI-1B + AI-1C — opt-in dos relatorios automaticos.
  reportWeeklyEnabled?: boolean;
  reportDailyEnabled?: boolean;
  reportMonthlyEnabled?: boolean;
  // EST-1 / RF-06 — opt-in de entrega por email.
  emailWeeklyEnabled?: boolean;
  emailMonthlyEnabled?: boolean;
};

const FROZEN_CATEGORY_LABELS: Record<string, string> = {
  'B-SNAPSHOT': 'Lembrete de snapshot',
  'B-LEAK': 'Avisos de leak',
  'B-STUDY': 'Lembrete de estudo',
  'B-VOLUME': 'Acompanhamento de volume',
  'B-GRADE': 'Sugestoes de grade',
  'B-DOWNSWING': 'Alerta de downswing',
  'B-LIFE': 'Vida fora do poker',
  'B-MENTAL': 'Cuidado mental',
};

function frozenReasonLabel(reason?: string): string {
  if (reason === 'admin') return 'admin';
  if (reason === 'auto_dismiss_rate') return 'voce dispensou a maioria dos avisos';
  return reason || 'pausada';
}

function CoachPreferencesPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<PrefsResponse>({
    queryKey: ['/api/coach/preferences'],
    queryFn: () => apiRequest('GET', '/api/coach/preferences'),
  });

  const frozenCategories = (data?.frozenCategories && typeof data.frozenCategories === 'object')
    ? data.frozenCategories
    : {};
  const frozenEntries = Object.entries(frozenCategories);

  const unfreezeMutation = useMutation({
    mutationFn: (category: string) => apiRequest('POST', '/api/coach/preferences/unfreeze', { category }),
    onSuccess: () => {
      try { queryClient.invalidateQueries({ queryKey: ['/api/coach/preferences'] }); } catch { /* noop */ }
    },
  });

  const [nudges, setNudges] = useState<Record<NudgeKey, boolean>>(() =>
    Object.fromEntries(NUDGE_KEYS.map((k) => [k, true])) as Record<NudgeKey, boolean>,
  );
  const [quietStart, setQuietStart] = useState<number>(21);
  const [quietEnd, setQuietEnd] = useState<number>(9);
  const [perDay, setPerDay] = useState<number>(3);
  const [perHour, setPerHour] = useState<number>(1);
  // Sprint AI-1B + AI-1C — opt-in dos 3 relatorios automaticos.
  const [reportWeekly, setReportWeekly] = useState<boolean>(false);
  const [reportDaily, setReportDaily] = useState<boolean>(false);
  const [reportMonthly, setReportMonthly] = useState<boolean>(false);
  // EST-1 / RF-06 — opt-in de entrega por email (weekly + monthly).
  const [emailWeekly, setEmailWeekly] = useState<boolean>(false);
  const [emailMonthly, setEmailMonthly] = useState<boolean>(false);

  useEffect(() => {
    if (!data) return;
    if (data.nudges) {
      setNudges((prev) => {
        const next = { ...prev };
        for (const k of NUDGE_KEYS) {
          if (typeof data.nudges?.[k] === 'boolean') next[k] = data.nudges[k] as boolean;
        }
        return next;
      });
    }
    if (data.quietHours) {
      if (typeof data.quietHours.startHour === 'number') setQuietStart(data.quietHours.startHour);
      if (typeof data.quietHours.endHour === 'number') setQuietEnd(data.quietHours.endHour);
    }
    if (data.frequencyCap) {
      if (typeof data.frequencyCap.perDay === 'number') setPerDay(data.frequencyCap.perDay);
      if (typeof data.frequencyCap.perHour === 'number') setPerHour(data.frequencyCap.perHour);
    }
    if (typeof data.reportWeeklyEnabled === 'boolean') setReportWeekly(data.reportWeeklyEnabled);
    if (typeof data.reportDailyEnabled === 'boolean') setReportDaily(data.reportDailyEnabled);
    if (typeof data.reportMonthlyEnabled === 'boolean') setReportMonthly(data.reportMonthlyEnabled);
    if (typeof data.emailWeeklyEnabled === 'boolean') setEmailWeekly(data.emailWeeklyEnabled);
    if (typeof data.emailMonthlyEnabled === 'boolean') setEmailMonthly(data.emailMonthlyEnabled);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: any) => apiRequest('PUT', '/api/coach/preferences', payload),
    onSuccess: () => {
      try { queryClient.invalidateQueries({ queryKey: ['/api/coach/preferences'] }); } catch { /* noop */ }
    },
  });

  const handleSave = useCallback(() => {
    saveMutation.mutate({
      nudgeBSnapshot: nudges.bSnapshot,
      nudgeBLeak: nudges.bLeak,
      nudgeBStudy: nudges.bStudy,
      nudgeBVolume: nudges.bVolume,
      nudgeBGrade: nudges.bGrade,
      nudgeBDownswing: nudges.bDownswing,
      nudgeBLife: nudges.bLife,
      nudgeBMental: nudges.bMental,
      quietHoursStart: quietStart,
      quietHoursEnd: quietEnd,
      maxNudgesPerDay: perDay,
      maxNudgesPerHour: perHour,
      reportWeeklyEnabled: reportWeekly,
      reportDailyEnabled: reportDaily,
      reportMonthlyEnabled: reportMonthly,
      emailWeeklyEnabled: emailWeekly,
      emailMonthlyEnabled: emailMonthly,
    });
  }, [nudges, quietStart, quietEnd, perDay, perHour, reportWeekly, reportDaily, reportMonthly, emailWeekly, emailMonthly, saveMutation]);

  return (
    <div data-testid="coach-prefs-panel" className="p-4 space-y-5 max-w-xl">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-medium text-gray-300">Preferencias</h3>
        {isLoading && <Loader2 size={14} className="animate-spin text-gray-500" />}
      </div>
      {isError && (
        <p className="text-xs text-red-400">Falha ao carregar — mostrando valores padrao.</p>
      )}

      <div className="space-y-2">
        {NUDGE_KEYS.map((k) => (
          <label key={k} className="flex items-center justify-between gap-3 text-sm text-gray-300">
            <span>{NUDGE_LABELS[k]}</span>
            <input
              type="checkbox"
              data-testid={`coach-prefs-toggle-${k}`}
              checked={nudges[k]}
              onChange={(e) => setNudges((prev) => ({ ...prev, [k]: e.target.checked }))}
              className="h-4 w-4"
            />
          </label>
        ))}
      </div>

      <div data-testid="coach-prefs-quiet-hours" className="flex items-center gap-3 text-sm text-gray-300">
        <span>Horario silencioso:</span>
        <input
          type="number"
          min={0}
          max={23}
          aria-label="Inicio do horario silencioso"
          value={quietStart}
          onChange={(e) => setQuietStart(Number(e.target.value))}
          className="w-16 bg-gray-800 border border-gray-700 rounded px-1 text-gray-100"
        />
        <span>ate</span>
        <input
          type="number"
          min={0}
          max={23}
          aria-label="Fim do horario silencioso"
          value={quietEnd}
          onChange={(e) => setQuietEnd(Number(e.target.value))}
          className="w-16 bg-gray-800 border border-gray-700 rounded px-1 text-gray-100"
        />
      </div>

      <div data-testid="coach-prefs-caps" className="flex items-center gap-3 text-sm text-gray-300">
        <span>Maximo por dia:</span>
        <input
          type="number"
          min={0}
          max={50}
          aria-label="Maximo de avisos por dia"
          value={perDay}
          onChange={(e) => setPerDay(Number(e.target.value))}
          className="w-16 bg-gray-800 border border-gray-700 rounded px-1 text-gray-100"
        />
        <span>por hora:</span>
        <input
          type="number"
          min={0}
          max={10}
          aria-label="Maximo de avisos por hora"
          value={perHour}
          onChange={(e) => setPerHour(Number(e.target.value))}
          className="w-16 bg-gray-800 border border-gray-700 rounded px-1 text-gray-100"
        />
      </div>

      {/* AI-1B + AI-1C — opt-in dos relatorios automaticos. */}
      <div data-testid="coach-prefs-reports" className="space-y-2 border-t border-gray-800 pt-4">
        <h4 className="text-sm font-medium text-gray-300">Relatorios automaticos</h4>
        <label className="flex items-center justify-between gap-3 text-sm text-gray-300">
          <span>Relatorio semanal (segunda 7h fuso local)</span>
          <input
            type="checkbox"
            data-testid="coach-prefs-toggle-report-weekly"
            checked={reportWeekly}
            onChange={(e) => setReportWeekly(e.target.checked)}
            className="h-4 w-4"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-gray-300">
          <span>Daily Debrief (pos finalizacao de sessao)</span>
          <input
            type="checkbox"
            data-testid="coach-prefs-toggle-report-daily"
            checked={reportDaily}
            onChange={(e) => setReportDaily(e.target.checked)}
            className="h-4 w-4"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-gray-300">
          <span>Relatorio mensal (dia 1 do mes 7h fuso local)</span>
          <input
            type="checkbox"
            data-testid="coach-prefs-toggle-report-monthly"
            checked={reportMonthly}
            onChange={(e) => setReportMonthly(e.target.checked)}
            className="h-4 w-4"
          />
        </label>
        <p className="text-xs text-gray-500">Disponivel para Trial + Pro/Premium. Free nao recebe.</p>
      </div>

      {/* EST-1 / RF-06 — entrega por email dos relatorios (weekly + monthly). */}
      <div data-testid="coach-prefs-emails" className="space-y-2 border-t border-gray-800 pt-4">
        <h4 className="text-sm font-medium text-gray-300">Entrega por email</h4>
        <label className="flex items-center justify-between gap-3 text-sm text-gray-300">
          <span>Relatorio semanal por email</span>
          <input
            type="checkbox"
            data-testid="coach-prefs-toggle-email-weekly"
            checked={emailWeekly}
            onChange={(e) => setEmailWeekly(e.target.checked)}
            className="h-4 w-4"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-gray-300">
          <span>Relatorio mensal por email</span>
          <input
            type="checkbox"
            data-testid="coach-prefs-toggle-email-monthly"
            checked={emailMonthly}
            onChange={(e) => setEmailMonthly(e.target.checked)}
            className="h-4 w-4"
          />
        </label>
      </div>

      {/* Sprint Mini Player 2 (CRITICAL-2) — Integracoes externas. */}
      <div data-testid="coach-prefs-integrations" className="space-y-2 border-t border-gray-800 pt-4">
        <h4 className="text-sm font-medium text-gray-300">Integracoes</h4>
        <SpotifyConnectionPanel />
      </div>

      {data && (
        <div data-testid="coach-prefs-frozen-section" className="space-y-2 border-t border-gray-800 pt-4">
          <h4 className="text-sm font-medium text-gray-300">Categorias pausadas</h4>
          {frozenEntries.length === 0 ? (
            <p className="text-xs text-gray-500">Nenhuma categoria pausada.</p>
          ) : (
            <div className="space-y-2">
              {frozenEntries.map(([cat, entry]) => (
                <div
                  key={cat}
                  data-testid={`coach-prefs-frozen-item-${cat}`}
                  className="flex items-center justify-between gap-3 text-xs text-gray-300"
                >
                  <span>
                    {FROZEN_CATEGORY_LABELS[cat] ?? cat} — pausada (motivo: {frozenReasonLabel(entry?.reason)})
                    {entry?.frozenAt ? ` desde ${String(entry.frozenAt).slice(0, 10)}` : ''}
                  </span>
                  <button
                    type="button"
                    data-testid={`coach-prefs-unfreeze-${cat}`}
                    onClick={() => unfreezeMutation.mutate(cat)}
                    disabled={unfreezeMutation.isPending}
                    className="px-2 py-1 rounded border border-gray-700 text-gray-300"
                  >
                    Reativar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Button
        data-testid="coach-prefs-save"
        onClick={handleSave}
        disabled={saveMutation.isPending}
        className="bg-green-600 hover:bg-green-500 text-white"
        size="sm"
      >
        {saveMutation.isPending ? 'Salvando...' : 'Salvar preferencias'}
      </Button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Hub
// -----------------------------------------------------------------------------
export default function CoachAI() {
  const [activeTab, setActiveTab] = useTabFromUrl(HUB_TABS as unknown as string[], 'chat');
  const urlTab = (HUB_TABS as readonly string[]).includes(activeTab) ? (activeTab as HubTab) : 'chat';

  // Aba otimista: o clique alterna a UI na hora, sem esperar o round-trip da URL
  // (setActiveTab -> setLocation -> re-render). Mantem-se em sincronia com a URL
  // (deep-link ?tab= / back/forward) via o effect abaixo.
  const [localTab, setLocalTab] = useState<HubTab>(urlTab);
  useEffect(() => {
    setLocalTab(urlTab);
  }, [urlTab]);
  const tab = localTab;

  const changeTab = useCallback(
    (v: string) => {
      if ((HUB_TABS as readonly string[]).includes(v)) {
        setLocalTab(v as HubTab);
      }
      setActiveTab(v);
    },
    [setActiveTab],
  );

  return (
    <Tabs value={tab} onValueChange={(v) => changeTab(v)} className="flex flex-col h-full bg-gray-900">
      <div className="border-b border-gray-700 px-4 pt-4 pb-0 flex flex-col gap-3">
        <h1 data-testid="coach-ai-hub-title" className="text-xl font-semibold text-gray-100 flex items-center gap-2">
          <Sparkles size={20} className="text-green-400" />
          Grindfy AI
        </h1>
        <TabsList className="bg-gray-800 border border-gray-700">
          {TAB_META.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              data-testid={`coach-ai-tab-${t.value}`}
              // Lesson #27: Radix Tabs reage a onMouseDown — onClick redundante
              // garante que fireEvent.click (RTL) tambem alterne a aba.
              onClick={() => changeTab(t.value)}
              className="data-[state=active]:bg-green-600/20 data-[state=active]:text-green-400 text-gray-400"
            >
              <t.icon size={16} className="mr-2" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="flex-1 overflow-hidden">
        <TabsContent value="chat" data-testid="coach-ai-tabpanel-chat" className="h-full m-0">
          <ChatPanel />
        </TabsContent>
        <TabsContent value="reports" data-testid="coach-ai-tabpanel-reports" className="h-full m-0 overflow-auto">
          <div className="p-4 pb-0">
            <ReportDiscoverabilityBanner onGoToPreferences={() => setActiveTab('prefs')} />
          </div>
          <ReportsPanel />
        </TabsContent>
        <TabsContent value="review" data-testid="coach-ai-tabpanel-review" className="h-full m-0 overflow-auto">
          <WeeklyReviewPanel />
        </TabsContent>
        <TabsContent value="audit" data-testid="coach-ai-tabpanel-audit" className="h-full m-0 overflow-auto">
          <CoachAuditPanel />
        </TabsContent>
        <TabsContent value="prefs" data-testid="coach-ai-tabpanel-prefs" className="h-full m-0 overflow-auto">
          <CoachPreferencesPanel />
        </TabsContent>
      </div>
    </Tabs>
  );
}
