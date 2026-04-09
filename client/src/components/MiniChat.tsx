import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { useLocation } from 'wouter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Brain,
  Trophy,
  GraduationCap,
  MessageSquare,
  Maximize2,
  X,
  Send,
  Loader2,
} from 'lucide-react';
import { useCoachChat, type CoachType, type ChatMessage } from '@/hooks/useCoachChat';

const HIDDEN_PATHS = [
  '/coach-ai',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/landing',
  '/registration-confirmation',
];

const COACH_OPTIONS = [
  { value: 'mental' as CoachType, icon: Brain, label: 'Mental' },
  { value: 'tournament' as CoachType, icon: Trophy, label: 'Torneios' },
  { value: 'technical' as CoachType, icon: GraduationCap, label: 'Tecnico' },
] as const;

function MiniMessage({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex w-full mb-2', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-xs',
          isUser
            ? 'bg-green-600/20 border border-green-600/30 text-gray-100'
            : 'bg-gray-800 border border-gray-700 text-gray-200'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-xs max-w-none prose-p:my-0.5 prose-headings:my-1 prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0 prose-code:text-green-400 prose-pre:bg-gray-900 prose-pre:text-[10px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MiniChat() {
  const [location, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [coachType, setCoachType] = useState<CoachType>('mental');
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isStreaming,
    streamedText,
    streamError,
    sendMessage,
  } = useCoachChat(coachType);

  // Don't render on hidden paths
  const shouldHide = HIDDEN_PATHS.some((path) =>
    location === path || location.startsWith(path + '/')
  );

  // Auto-scroll
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

  const handleOpenFullscreen = useCallback(() => {
    setIsOpen(false);
    setLocation('/coach-ai');
  }, [setLocation]);

  if (shouldHide) return null;

  // Floating button only
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-green-600 hover:bg-green-500 text-white shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105"
        title="Coach IA"
      >
        <MessageSquare size={22} />
      </button>
    );
  }

  // Expanded mini-chat
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[350px] h-[500px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800/50">
        {/* Coach selector */}
        <div className="flex items-center gap-1">
          {COACH_OPTIONS.map((coach) => (
            <button
              key={coach.value}
              onClick={() => setCoachType(coach.value)}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                coachType === coach.value
                  ? 'bg-green-600/20 text-green-400'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'
              )}
              title={coach.label}
            >
              <coach.icon size={16} />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenFullscreen}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
            title="Abrir em tela cheia"
          >
            <Maximize2 size={14} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
            title="Fechar"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 p-3">
        {messages.length === 0 && !streamedText ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <MessageSquare size={28} className="text-green-600/30 mb-2" />
            <p className="text-xs text-gray-500">
              Envie uma mensagem para o Coach
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MiniMessage key={msg.id} message={msg} />
            ))}
            {isStreaming && streamedText && (
              <div className="flex w-full mb-2 justify-start">
                <div className="max-w-[85%] rounded-lg px-3 py-2 text-xs bg-gray-800 border border-gray-700 text-gray-200">
                  <div className="prose prose-invert prose-xs max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {streamedText}
                    </ReactMarkdown>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] text-gray-500">digitando...</span>
                  </div>
                </div>
              </div>
            )}
            {isStreaming && !streamedText && (
              <div className="flex items-center gap-1 ml-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
            {streamError && (
              <div className="mb-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-800/30 text-red-400 text-[10px]">
                {streamError}
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-gray-700 p-2">
        <div className="flex gap-1.5">
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mensagem..."
            className="flex-1 bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 resize-none min-h-[36px] max-h-[80px] text-xs py-2"
            rows={1}
            disabled={isStreaming}
            maxLength={2000}
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isStreaming}
            className="bg-green-600 hover:bg-green-500 text-white self-end h-9 w-9"
            size="icon"
          >
            {isStreaming ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
