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

export function useCoachChat(coachType: CoachType) {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
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
  const sendMessage = useCallback(async (message: string) => {
    if (isStreaming) return;

    setIsStreaming(true);
    setStreamedText('');
    setStreamError(null);

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

      const body: Record<string, string> = {
        coachType,
        message,
      };
      if (activeSessionId) {
        body.sessionId = activeSessionId;
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
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setStreamError('Streaming nao suportado');
        setIsStreaming(false);
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
              // Streaming complete - refresh data
              setIsStreaming(false);
              setStreamedText('');

              // If we didn't have a session before, set the new one
              if (!activeSessionId && event.sessionId) {
                setActiveSessionId(event.sessionId);
              }

              // Invalidate queries to get fresh data
              queryClient.invalidateQueries({ queryKey: [`/api/coach/sessions?coachType=${coachType}`] });
              if (activeSessionId) {
                queryClient.invalidateQueries({ queryKey: [`/api/coach/sessions/${activeSessionId}/messages`] });
              }
              // Also invalidate messages for any new session
              if (event.sessionId) {
                queryClient.invalidateQueries({ queryKey: [`/api/coach/sessions/${event.sessionId}/messages`] });
                if (!activeSessionId) {
                  setActiveSessionId(event.sessionId);
                }
              }
            } else if (event.type === 'error') {
              setStreamError(event.message);
              setIsStreaming(false);
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
    }
  }, [coachType, activeSessionId, isStreaming, queryClient]);

  // Cancel streaming
  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamedText('');
  }, []);

  // Start a new conversation (clear active session)
  const startNewConversation = useCallback(() => {
    setActiveSessionId(null);
    setStreamedText('');
    setStreamError(null);
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
    sendMessage,
    cancelStream,
    startNewConversation,
    archiveSession: archiveMutation.mutate,
    deleteSession: deleteMutation.mutate,
  };
}
