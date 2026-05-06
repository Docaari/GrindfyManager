/**
 * Sprint Grind-Live Break Auto-Open (clock-aligned BRT)
 *
 * Spec: Docs/specs/grind-live-break-auto-open.md (RF-05)
 * ADR:  Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
 *
 * Handler para "Pular Todos os Breaks Hoje" — alem do skipBreaksToday em
 * memoria, persiste breakAutoOpenEnabled = false em user_settings via PATCH
 * otimista. Reativacao = user clica toggle manualmente.
 */

export interface SkipAllBreaksTodayDeps {
  apiRequest: (method: string, url: string, body?: any) => Promise<any>;
  setSkipBreaksToday: (b: boolean) => void;
  setShowBreakDialog: (b: boolean) => void;
  wasAutoOpenedRef: { current: boolean };
  setQueryData: (key: string | unknown[], updater: any) => void;
  getQueryData: (key: string | unknown[]) => any;
  toast: (opts: {
    title: string;
    description?: string;
    variant?: "default" | "destructive" | null;
  }) => unknown;
}

const QUERY_KEY = ['/api/user-settings'];

export async function handleSkipAllBreaksToday(
  deps: SkipAllBreaksTodayDeps,
): Promise<void> {
  // Snapshot do estado anterior para rollback.
  const prev = deps.getQueryData(QUERY_KEY);

  // Otimismo: UI passa a OFF imediatamente.
  deps.setQueryData(QUERY_KEY, (old: any) => ({
    ...(old ?? {}),
    breakAutoOpenEnabled: false,
  }));

  // Estado em memoria.
  deps.setSkipBreaksToday(true);
  deps.setShowBreakDialog(false);
  deps.wasAutoOpenedRef.current = false;

  try {
    // CRITICAL-1 fix: PUT (nao PATCH) — endpoint /api/user-settings so
    // expoe PUT como upsert (server/routes/misc.ts:128). PATCH retornaria
    // 404 e quebraria a persistencia do skip-all silenciosamente.
    const data = await deps.apiRequest('PUT', '/api/user-settings', {
      breakAutoOpenEnabled: false,
    });
    // HIGH-1 fix: hidratar cache com resposta do PUT (merge defensivo).
    deps.setQueryData(QUERY_KEY, (old: any) => ({
      ...(old ?? {}),
      ...(data ?? { breakAutoOpenEnabled: false }),
    }));
    deps.toast({
      title: 'Auto-Break desativado',
      description: 'Reative quando quiser via toggle.',
    });
  } catch {
    // Rollback otimista.
    deps.setQueryData(QUERY_KEY, () => prev ?? { breakAutoOpenEnabled: true });
    deps.toast({
      title: 'Erro',
      description: 'Falha ao desativar Auto-Break. Tente novamente.',
      variant: 'destructive',
    });
  }
}
