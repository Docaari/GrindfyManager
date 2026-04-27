// =============================================================================
// MessageFeedbackActions — Sprint Coach-1 Frontend UX / RF-03
// Botoes de feedback (thumbs up / thumbs down) no footer das bubbles do assistant.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-03)
// =============================================================================

import * as React from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useCoachFeedback } from '@/hooks/useCoachFeedback';

export interface MessageFeedbackActionsProps {
  messageId: string;
  isUserMessage?: boolean;
  className?: string;
}

export function MessageFeedbackActions({
  messageId,
  isUserMessage,
  className,
}: MessageFeedbackActionsProps): JSX.Element | null {
  // HIGH-1 fix: hooks DEVEM ser chamados antes de qualquer early-return para
  // respeitar Rules of Hooks. O early-return baseado em `isUserMessage` foi
  // movido para depois das chamadas de hooks (logo antes do JSX final).
  const { feedback, sendFeedback, removeFeedback } = useCoachFeedback(messageId);
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const [comment, setComment] = React.useState('');

  const isUpActive = feedback === 'up';
  const isDownActive = feedback === 'down';

  const handleUpClick = React.useCallback(() => {
    if (isUpActive) {
      removeFeedback();
    } else {
      // Substitui ou adiciona
      sendFeedback('up');
    }
  }, [isUpActive, sendFeedback, removeFeedback]);

  const handleDownClick = React.useCallback(() => {
    if (isDownActive) {
      removeFeedback();
      return;
    }
    setPopoverOpen(true);
  }, [isDownActive, removeFeedback]);

  const handleSkip = React.useCallback(() => {
    sendFeedback('down');
    setPopoverOpen(false);
    setComment('');
  }, [sendFeedback]);

  const handleSubmit = React.useCallback(() => {
    // HIGH-3 fix: trim defensivo a 500 chars no submit. O atributo `maxLength`
    // do Textarea bloqueia digitacao mas NAO bloqueia paste programatico.
    const safeComment = (comment || '').slice(0, 500);
    sendFeedback('down', safeComment || undefined);
    setPopoverOpen(false);
    setComment('');
  }, [sendFeedback, comment]);

  // HIGH-1: early return apos os hooks (em vez de antes).
  if (isUserMessage) return null;

  return (
    <div
      className={
        'inline-flex items-center gap-1' + (className ? ' ' + className : '')
      }
    >
      <button
        type="button"
        aria-label="Gostei"
        aria-pressed={isUpActive}
        data-active={isUpActive}
        onClick={handleUpClick}
        className={
          'p-1 rounded transition-colors ' +
          (isUpActive
            ? 'text-green-400 hover:text-green-300'
            : 'text-gray-500 hover:text-gray-300')
        }
      >
        <ThumbsUp className="h-4 w-4" aria-hidden="true" />
      </button>

      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Resposta ruim — thumbs down"
            aria-pressed={isDownActive}
            data-active={isDownActive}
            onClick={handleDownClick}
            className={
              'p-1 rounded transition-colors ' +
              (isDownActive
                ? 'text-red-400 hover:text-red-300'
                : 'text-gray-500 hover:text-gray-300')
            }
          >
            <ThumbsDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 bg-gray-800 border-gray-700" align="start">
          <div className="space-y-3">
            <p className="text-sm text-gray-200 font-medium">
              O que poderia ser melhor?
            </p>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              placeholder="Comentario (opcional)"
              className="bg-gray-900 border-gray-700 text-gray-100 resize-none"
              rows={3}
            />
            <p className="text-xs text-gray-500 text-right">{comment.length}/500</p>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleSkip}
                className="border-gray-700 text-gray-300"
              >
                Pular
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                className="bg-green-600 hover:bg-green-500 text-white"
              >
                Enviar feedback
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default MessageFeedbackActions;
