/**
 * Sprint Grind-Live Break Auto-Open (clock-aligned BRT)
 *
 * Spec: Docs/specs/grind-live-break-auto-open.md (RF-01)
 * ADR:  Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
 *
 * Toggle Switch shadcn para liga/desliga auto-open de breaks. Persiste em
 * user_settings.break_auto_open_enabled via PATCH otimista. Renderiza apenas
 * quando ha sessao ativa.
 *
 * Lessons:
 *   #1 — hooks primeiro, early return depois.
 *   #2 — data-testid="toggle-break-auto-open" estavel.
 *   #13 — apiRequest retorna JSON parseado direto.
 */

import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface BreakAutoOpenToggleProps {
  hasActiveSession: boolean;
  enabled: boolean;
  onToggle?: (next: boolean) => void;
  disabled?: boolean;
}

export function BreakAutoOpenToggle({
  hasActiveSession,
  enabled,
  onToggle,
  disabled,
}: BreakAutoOpenToggleProps) {
  // Lesson #1: hooks primeiro, early return depois.
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [optimistic, setOptimistic] = React.useState<boolean>(enabled);
  const prevRef = React.useRef<boolean>(enabled);

  // Sync com prop quando muda externamente (ex.: PUT externo do skip-all).
  React.useEffect(() => {
    setOptimistic(enabled);
    prevRef.current = enabled;
  }, [enabled]);

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      // CRITICAL-1 fix: PUT (nao PATCH) — endpoint /api/user-settings expoe
      // PUT como upsert idempotente (server/routes/misc.ts:128). PATCH nao
      // existe e retornaria 404, quebrando a persistencia silenciosamente.
      return apiRequest('PUT', '/api/user-settings', {
        breakAutoOpenEnabled: next,
      });
    },
    onSuccess: (data: any) => {
      // HIGH-1 fix: hidratar React Query cache pos-PUT para que outros
      // consumidores (GrindSessionLive userAlertSettings query) reflitam o
      // novo estado sem esperar invalidate/refetch. Merge defensivo: payload
      // do PUT pode vir parcial dependendo da resposta do servidor.
      queryClient.setQueryData(['/api/user-settings'], (old: any) => ({
        ...(old ?? {}),
        ...(data ?? {}),
      }));
    },
    onError: () => {
      // Rollback otimista.
      setOptimistic(prevRef.current);
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar Auto-Break.',
        variant: 'destructive',
      });
    },
  });

  const handleClick = React.useCallback(() => {
    const next = !optimistic;
    prevRef.current = optimistic;
    setOptimistic(next);
    onToggle?.(next);
    mutation.mutate(next);
  }, [optimistic, onToggle, mutation]);

  if (!hasActiveSession) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-2">
            <Switch
              data-testid="toggle-break-auto-open"
              checked={optimistic}
              onCheckedChange={handleClick}
              disabled={disabled}
              aria-label="Auto-Break"
            />
            <span className="text-xs font-medium text-gray-300 select-none">
              Auto-Break
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Abre o feedback de break automaticamente as XX:54 e fecha as XX:02.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default BreakAutoOpenToggle;
