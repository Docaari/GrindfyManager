// =============================================================================
// MessageCopyButton — Sprint Coach-1 Frontend UX / RF-06
// Botao copy-to-clipboard para mensagens do assistant.
// Click copia o cleanText (sem tags internas) para clipboard e mostra toast.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-06)
// =============================================================================

import * as React from 'react';
import { Copy } from 'lucide-react';
import { parseCoachMessage } from '@/lib/coachMessageParser';
import { useToast } from '@/hooks/use-toast';

export interface MessageCopyButtonProps {
  content: string;
  className?: string;
}

export function MessageCopyButton({
  content,
  className,
}: MessageCopyButtonProps): JSX.Element {
  const { toast } = useToast();

  const handleClick = React.useCallback(() => {
    const { cleanText } = parseCoachMessage(content || '');
    const payload = cleanText.trim();
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(payload);
      }
      toast({ title: 'Copiado' });
    } catch {
      toast({
        title: 'Nao foi possivel copiar',
        variant: 'destructive' as any,
      });
    }
  }, [content, toast]);

  return (
    <button
      type="button"
      aria-label="Copiar mensagem"
      title="Copiar mensagem"
      onClick={handleClick}
      className={
        'inline-flex items-center justify-center p-1 rounded text-gray-500 hover:text-gray-300 opacity-60 hover:opacity-100 transition-opacity' +
        (className ? ' ' + className : '')
      }
    >
      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

export default MessageCopyButton;
