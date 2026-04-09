import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { useLocation } from 'wouter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  Brain,
  Trophy,
  GraduationCap,
  Send,
  Plus,
  Menu,
  Archive,
  Trash2,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { useCoachChat, type CoachType, type ChatMessage } from '@/hooks/useCoachChat';

const COACH_TABS = [
  { value: 'mental' as CoachType, label: 'Mental', icon: Brain },
  { value: 'tournament' as CoachType, label: 'Torneios', icon: Trophy },
  { value: 'technical' as CoachType, label: 'Tecnico', icon: GraduationCap },
] as const;

function coachLabel(type: CoachType): string {
  switch (type) {
    case 'mental': return 'Mental';
    case 'tournament': return 'Torneios';
    case 'technical': return 'Tecnico';
  }
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-1">
          {new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

function StreamingBubble({ text }: { text: string }) {
  return (
    <div className="flex w-full mb-4 justify-start">
      <div className="max-w-[80%] rounded-lg px-4 py-3 text-sm bg-gray-800 border border-gray-700 text-gray-200">
        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:text-green-400 prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {text}
          </ReactMarkdown>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-gray-500">digitando...</span>
        </div>
      </div>
    </div>
  );
}

function SessionSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewConversation,
  onArchiveSession,
  onDeleteSession,
  isLoading,
  coachType,
}: {
  sessions: ReturnType<typeof useCoachChat>['sessions'];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewConversation: () => void;
  onArchiveSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  isLoading: boolean;
  coachType: CoachType;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-700">
        <Button
          onClick={onNewConversation}
          className="w-full bg-green-600 hover:bg-green-500 text-white"
          size="sm"
        >
          <Plus size={16} className="mr-2" />
          Nova Conversa
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 px-3">
              <MessageSquare size={32} className="mx-auto text-gray-600 mb-2" />
              <p className="text-sm text-gray-500">
                Nenhuma conversa ainda
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Inicie uma conversa com o Coach {coachLabel(coachType)}
              </p>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                  activeSessionId === session.id
                    ? 'bg-green-600/20 border border-green-600/30'
                    : 'hover:bg-gray-800'
                )}
                onClick={() => onSelectSession(session.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">
                    {session.title || 'Nova conversa'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {session.status === 'archived' && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 border-gray-600 text-gray-500">
                        Arquivada
                      </Badge>
                    )}
                    <span className="text-[10px] text-gray-500">
                      {session.messageCount} msgs
                    </span>
                  </div>
                </div>
                <div className="hidden group-hover:flex items-center gap-1">
                  {session.status === 'active' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onArchiveSession(session.id); }}
                      className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300"
                      title="Arquivar"
                    >
                      <Archive size={14} />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
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
    </div>
  );
}

export default function CoachAI() {
  const [coachType, setCoachType] = useState<CoachType>('mental');
  const [inputValue, setInputValue] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    sessions,
    messages,
    activeSessionId,
    setActiveSessionId,
    isLoadingSessions,
    isLoadingMessages,
    isStreaming,
    streamedText,
    streamError,
    sendMessage,
    startNewConversation,
    archiveSession,
    deleteSession,
  } = useCoachChat(coachType);

  // Auto-scroll to bottom when messages change or during streaming
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

  const handleTabChange = useCallback((value: string) => {
    setCoachType(value as CoachType);
    setInputValue('');
  }, []);

  const sidebarContent = (
    <SessionSidebar
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={(id) => {
        setActiveSessionId(id);
        setMobileSidebarOpen(false);
      }}
      onNewConversation={() => {
        startNewConversation();
        setMobileSidebarOpen(false);
      }}
      onArchiveSession={archiveSession}
      onDeleteSession={deleteSession}
      isLoading={isLoadingSessions}
      coachType={coachType}
    />
  );

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Coach Tabs */}
      <div className="border-b border-gray-700 px-4 pt-4 pb-0 flex items-center gap-3">
        {/* Mobile sidebar toggle */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden text-gray-400 hover:text-white">
              <Menu size={20} />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-gray-800 border-gray-700 p-0">
            {sidebarContent}
          </SheetContent>
        </Sheet>

        <Tabs value={coachType} onValueChange={handleTabChange} className="flex-1">
          <TabsList className="bg-gray-800 border border-gray-700">
            {COACH_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="data-[state=active]:bg-green-600/20 data-[state=active]:text-green-400 text-gray-400"
              >
                <tab.icon size={16} className="mr-2" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex w-64 border-r border-gray-700 bg-gray-800 flex-col">
          {sidebarContent}
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            {isLoadingMessages && activeSessionId ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            ) : messages.length === 0 && !streamedText && !activeSessionId ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-center">
                {COACH_TABS.map((tab) =>
                  tab.value === coachType ? (
                    <tab.icon key={tab.value} size={48} className="text-green-600/40 mb-4" />
                  ) : null
                )}
                <h3 className="text-lg font-medium text-gray-300 mb-2">
                  Coach {coachLabel(coachType)}
                </h3>
                <p className="text-sm text-gray-500 max-w-md">
                  Inicie uma conversa com o Coach {coachLabel(coachType)}.
                  {coachType === 'mental' && ' Receba suporte sobre foco, tilt, disciplina e preparo mental.'}
                  {coachType === 'tournament' && ' Analise sua grade, selecao de torneios e decisoes de volume.'}
                  {coachType === 'technical' && ' Discuta estrategia, ICM, ranges e conceitos tecnicos.'}
                </p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {isStreaming && streamedText && (
                  <StreamingBubble text={streamedText} />
                )}
                {isStreaming && !streamedText && (
                  <div className="flex items-center gap-2 mb-4 ml-2">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-gray-500">Coach digitando...</span>
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

          {/* Input Area */}
          <div className="border-t border-gray-700 p-4">
            <div className="max-w-3xl mx-auto flex gap-2">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Mensagem para o Coach ${coachLabel(coachType)}...`}
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
                {isStreaming ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Send size={18} />
                )}
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
