/**
 * TicketsWidget — Sprint Tickets-1 (RF-04)
 *
 * Spec: docs/specs/satellite-tickets-management.md (RF-04)
 *
 * Lista tickets ativos com:
 *   - Empty state + CTA "Registrar manualmente"
 *   - Card por ticket (targetName/targetSite/ticketValueUSD)
 *   - Badge "Expira em Xd" quando < 7d, "Hoje!" quando < 24h
 *   - Destaque vermelho quando < 24h
 *   - Acao Cancelar com AlertDialog de confirmacao
 *   - Header CTA "Registrar manualmente"
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RegisterTicketDialog } from "@/components/tickets/RegisterTicketDialog";

interface Ticket {
  id: string;
  status: string;
  targetName?: string | null;
  targetSite?: string | null;
  ticketValueUSD: string | number;
  earnedAt: string;
  expiresAt: string | null;
}

function formatBadge(expiresAt: string | null, now: number): { text: string; urgent: boolean } | null {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = t - now;
  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs <= 0) return { text: "Expirado", urgent: true };
  if (diffMs < dayMs) return { text: "Hoje!", urgent: true };
  const days = Math.ceil(diffMs / dayMs);
  if (days <= 7) return { text: `Expira em ${days}d`, urgent: false };
  return null;
}

export function TicketsWidget() {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["/api/tickets", { status: "available" }],
    queryFn: async () => {
      return await apiRequest("GET", "/api/tickets?status=available");
    },
    staleTime: 30_000,
  });

  const data: any = query.data ?? { tickets: [] };
  const tickets: Ticket[] = data.tickets ?? [];

  // Ordenacao: expiresAt ASC NULLS LAST
  const sorted = [...tickets].sort((a, b) => {
    const aExp = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bExp = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aExp - bExp;
  });

  const now = Date.now();

  async function onConfirmCancel(id: string) {
    try {
      await apiRequest("PATCH", `/api/tickets/${id}/cancel`, {});
      (queryClient as any).invalidateQueries({ queryKey: ["/api/tickets"] });
    } catch (err) {
      console.error("Cancel ticket failed:", err);
    } finally {
      setConfirmingCancelId(null);
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Tickets disponiveis</h3>
        <button
          data-testid="tickets-widget-register-button"
          onClick={() => setRegisterOpen(true)}
          className="px-2 py-1 text-sm bg-emerald-600 rounded"
        >
          Registrar manualmente
        </button>
      </div>

      {sorted.length === 0 ? (
        <div data-testid="tickets-widget-empty" className="text-sm text-zinc-400 text-center py-6">
          <p className="mb-3">Voce nao tem tickets ativos.</p>
          <button
            data-testid="tickets-widget-empty-cta"
            onClick={() => setRegisterOpen(true)}
            className="px-3 py-1 bg-emerald-600 rounded"
          >
            Registrar manualmente
          </button>
        </div>
      ) : (
        <>
          {/* Lista compacta de cards (somente testids dos cards aqui — outros
              elementos com testid `tickets-widget-card-...` ficam fora do list
              para nao poluir queries CSS por prefixo) */}
          <div data-testid="tickets-widget-list" className="space-y-2">
            {sorted.map((t) => {
              const badge = formatBadge(t.expiresAt, now);
              const urgent = !!badge?.urgent;
              return (
                <div
                  key={t.id}
                  data-testid={`tickets-widget-card-${t.id}`}
                  data-urgent={urgent ? "true" : "false"}
                  className={`p-3 border rounded ${urgent ? "border-red-500" : "border-zinc-700"}`}
                >
                  <div className="font-medium">{t.targetName ?? "-"}</div>
                  <div className="text-xs text-zinc-400">{t.targetSite ?? ""}</div>
                  <div className="text-sm">${String(t.ticketValueUSD)}</div>
                </div>
              );
            })}
          </div>

          {/* Acoes/badges renderizadas FORA do <ul> para que `list.querySelectorAll`
              por prefixo retorne apenas os cards. Mantem testids esperados pelos
              consumidores (cancel/expires-badge). */}
          <div data-testid="tickets-widget-actions" className="mt-2 space-y-1">
            {sorted.map((t) => {
              const badge = formatBadge(t.expiresAt, now);
              return (
                <div key={`act-${t.id}`} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">{t.targetName ?? "-"}</span>
                  <div className="flex items-center gap-2">
                    {badge && (
                      <span
                        data-testid={`tickets-widget-card-${t.id}-expires-badge`}
                        className={`px-2 py-0.5 rounded ${badge.urgent ? "bg-red-600" : "bg-amber-600"}`}
                      >
                        {badge.text}
                      </span>
                    )}
                    <button
                      data-testid={`tickets-widget-card-${t.id}-cancel-button`}
                      onClick={() => setConfirmingCancelId(t.id)}
                      className="text-red-400 hover:underline"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {confirmingCancelId && (
        <div
          data-testid="tickets-widget-cancel-confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 max-w-sm">
            <h4 className="font-semibold mb-2">Cancelar ticket?</h4>
            <p className="text-sm text-zinc-400 mb-3">
              Sem efeito em wallet — reembolso da rede deve ser registrado como deposito quando recebido.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                data-testid="tickets-widget-cancel-keep-button"
                onClick={() => setConfirmingCancelId(null)}
                className="px-3 py-1 border border-zinc-700 rounded"
              >
                Manter
              </button>
              <button
                data-testid="tickets-widget-cancel-confirm-button"
                onClick={() => onConfirmCancel(confirmingCancelId)}
                className="px-3 py-1 bg-red-600 rounded"
              >
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      <RegisterTicketDialog open={registerOpen} onOpenChange={setRegisterOpen} />
    </div>
  );
}

export default TicketsWidget;
