import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getCsrfToken } from '@/lib/queryClient';

export type CoachType = 'mental' | 'tournament' | 'technical';

export interface ChatSession {
  id: string;
  coachType: CoachType;
  title: string;
  status: 'active' | 'archived' | 'deleted';
  messageCount: number;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokenCount: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

interface MessagesResponse {
  messages: ChatMessage[];
  total: number;
  limit: number;
  offset: number;
}

export interface UseCoachChatOptions {
  /** Sprint AI-0B / RF-04 — page context da rota onde o chat esta montado.
   *  Quando fornecido, vai no body do POST /api/coach/chat. Omitido quando
   *  undefined (nao manda a chave). */
  pageContext?: Record<string, any>;
}

export interface SendMessageOptions {
  pageContext?: Record<string, any>;
}

export function useCoachChat(coachType: CoachType, options?: UseCoachChatOptions) {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
  // Render otimista: a mensagem do usuario aparece NA HORA (antes de persistir /
  // antes do 1o token), independente da query de mensagens / activeSessionId.
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch sessions for the current coach type
  const {
    data: sessions = [],
    isLoading: isLoadingSessions,
  } = useQuery<ChatSession[]>({
    queryKey: [`/api/coach/sessions?coachType=${coachType}`],
    staleTime: 30 * 1000,
  });

  // Fetch messages for the active session
  const {
    data: messagesData,
    isLoading: isLoadingMessages,
  } = useQuery<MessagesResponse>({
    queryKey: [`/api/coach/sessions/${activeSessionId}/messages?limit=100&offset=0`],
    enabled: !!activeSessionId,
    staleTime: 10 * 1000,
  });

  const messages = messagesData?.messages ?? [];

  // Archive session
  const archiveMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest('POST', `/api/coach/sessions/${sessionId}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/sessions?coachType=${coachType}`] });
    },
  });

  // Delete session
  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest('DELETE', `/api/coach/sessions/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/sessions?coachType=${coachType}`] });
      if (activeSessionId) {
        setActiveSessionId(null);
      }
    },
  });

  // Send message with SSE streaming
  const sendMessage = useCallback(async (message: string, sendOpts?: SendMessageOptions) => {
    if (isStreaming) return;

    setIsStreaming(true);
    setStreamedText('');
    setStreamError(null);
    setPendingUserMessage(message); // feedback visual imediato

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const csrf = getCsrfToken();
      if (csrf) {
        headers['X-CSRF-Token'] = csrf;
      }

      const body: Record<string, any> = {
        coachType,
        message,
      };
      if (activeSessionId) {
        body.sessionId = activeSessionId;
      }
      // Sprint AI-0B / RF-04 — page context: prioridade ao opts do sendMessage,
      // fallback para o pageContext passado ao hook. Omitido (sem a chave) quando
      // ambos undefined.
      const pageContext = sendOpts?.pageContext ?? options?.pageContext;
      if (pageContext !== undefined) {
        body.pageContext = pageContext;
      }

      const response = await fetch('/api/coach/chat', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Erro ao enviar mensagem' }));
        setStreamError(errorData.message || `Erro ${response.status}`);
        setIsStreaming(false);
        setPendingUserMessage(null);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setStreamError('Streaming nao suportado');
        setIsStreaming(false);
        setPendingUserMessage(null);
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'text') {
              accumulated += event.content;
              setStreamedText(accumulated);
            } else if (event.type === 'done') {
              // Streaming complete. NAO limpamos streamedText/pendingUserMessage
              // de imediato — primeiro garantimos que a query de mensagens ja
              // tem a versao persistida (evita "flash" de tela vazia, sobretudo
              // em sessao nova). So entao trocamos o render otimista pelo real.
              setIsStreaming(false);

              const sid = activeSessionId || event.sessionId || null;
              if (!activeSessionId && event.sessionId) {
                setActiveSessionId(event.sessionId);
              }

              queryClient.invalidateQueries({ queryKey: [`/api/coach/sessions?coachType=${coachType}`] });
              if (sid) {
                try {
                  await queryClient.invalidateQueries({ queryKey: [`/api/coach/sessions/${sid}/messages`] });
                } catch { /* segue pro clear de qualquer forma */ }
              }
              setStreamedText('');
              setPendingUserMessage(null);
            } else if (event.type === 'error') {
              setStreamError(event.message);
              setIsStreaming(false);
              setPendingUserMessage(null);
            }
          } catch {
            // Ignore malformed JSON
          }
        }
      }

      // If we never got a "done" event
      if (isStreaming) {
        setIsStreaming(false);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setStreamError(err.message || 'Erro de conexao');
      }
      setIsStreaming(false);
      setPendingUserMessage(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachType, activeSessionId, isStreaming, queryClient, options?.pageContext]);

  // Cancel streaming
  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamedText('');
    setPendingUserMessage(null);
  }, []);

  // Start a new conversation (clear active session)
  const startNewConversation = useCallback(() => {
    setActiveSessionId(null);
    setStreamedText('');
    setStreamError(null);
    setPendingUserMessage(null);
  }, []);

  return {
    sessions,
    messages,
    activeSessionId,
    setActiveSessionId,
    isLoadingSessions,
    isLoadingMessages,
    isStreaming,
    streamedText,
    streamError,
    pendingUserMessage,
    sendMessage,
    cancelStream,
    startNewConversation,
    archiveSession: archiveMutation.mutate,
    deleteSession: deleteMutation.mutate,
  };
}
