import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

export interface MatchableTicket {
  id: string;
  ticketValueUSD: string | number;
  targetTemplateId: string | null;
  targetName: string | null;
  targetSite: string | null;
  earnedAt: string | null;
  expiresAt: string | null;
  note?: string | null;
}

export interface RegisterPaymentDialogProps {
  tournament: any;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onConfirmCash: () => void;
  onConfirmTicket: (ticketId: string) => void;
}

function ticketsMatch(ticket: MatchableTicket, t: any): boolean {
  if (ticket.targetTemplateId && t?.templateId && ticket.targetTemplateId === t.templateId) {
    return true;
  }
  const tn = String(t?.name ?? "").trim().toLowerCase();
  const tknm = String(ticket.targetName ?? "").trim().toLowerCase();
  if (!tn || !tknm) return false;
  if (tn !== tknm) return false;
  const ts = String(t?.site ?? "").trim().toLowerCase();
  const tks = String(ticket.targetSite ?? "").trim().toLowerCase();
  // Site nao obrigatorio: se ambos vazios ou iguais, OK
  if (!ts && !tks) return true;
  return ts === tks;
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "sem expiracao";
  const d = new Date(iso);
  const now = Date.now();
  const ms = d.getTime() - now;
  const days = Math.round(ms / 86400000);
  if (days < 0) return "expirado";
  if (days === 0) return "expira hoje";
  if (days === 1) return "expira amanha";
  return `expira em ${days}d`;
}

export function useTicketMatchesForTournament(tournament: any): MatchableTicket[] {
  const { data } = useQuery({
    queryKey: ["/api/tickets", { status: "available" }],
    queryFn: async () => apiRequest("GET", "/api/tickets?status=available") as Promise<any>,
    staleTime: 30_000,
  });
  return useMemo(() => {
    const tickets: MatchableTicket[] = (data?.tickets as any[]) ?? [];
    return tickets.filter((t) => ticketsMatch(t, tournament));
  }, [data, tournament]);
}

export function RegisterPaymentDialog({
  tournament,
  open,
  onOpenChange,
  onConfirmCash,
  onConfirmTicket,
}: RegisterPaymentDialogProps) {
  const matches = useTicketMatchesForTournament(tournament);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default seleciona o primeiro (FIFO, ordem do backend)
  const effectiveSelected = selectedId ?? matches[0]?.id ?? null;

  if (matches.length === 0) {
    // Sem match: dialog vazio (parent deveria nao abrir, mas fallback)
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-gray-900 border border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar torneio</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400">Sem ticket disponivel para este torneio.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              data-testid="register-payment-cash"
              onClick={() => { onOpenChange(false); onConfirmCash(); }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Pagar com cash
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border border-gray-700 text-white max-w-md" data-testid="register-payment-dialog">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Como deseja pagar?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-zinc-400">
            {tournament?.name ?? ""} {tournament?.site ? `· ${tournament.site}` : ""}
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Tickets disponiveis ({matches.length})
            </p>
            {matches.map((tk) => {
              const isSel = effectiveSelected === tk.id;
              return (
                <label
                  key={tk.id}
                  data-testid={`register-payment-ticket-option-${tk.id}`}
                  className={`flex items-center justify-between border rounded p-2 cursor-pointer ${isSel ? "border-emerald-500 bg-emerald-900/20" : "border-zinc-700 bg-zinc-800/40 hover:bg-zinc-800"}`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="register-payment-ticket"
                      value={tk.id}
                      checked={isSel}
                      onChange={() => setSelectedId(tk.id)}
                      className="accent-emerald-500"
                    />
                    <div>
                      <div className="text-sm font-medium">${Number(tk.ticketValueUSD).toFixed(2)}</div>
                      <div className="text-xs text-zinc-400">{formatExpiry(tk.expiresAt)}</div>
                    </div>
                  </div>
                  {tk.targetName && (
                    <div className="text-xs text-zinc-400 max-w-[10rem] truncate text-right">
                      {tk.targetName}
                    </div>
                  )}
                </label>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              data-testid="register-payment-confirm-ticket"
              onClick={() => {
                if (effectiveSelected) {
                  onOpenChange(false);
                  onConfirmTicket(effectiveSelected);
                }
              }}
              disabled={!effectiveSelected}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              Pagar com ticket
            </Button>
            <Button
              data-testid="register-payment-confirm-cash"
              variant="outline"
              onClick={() => { onOpenChange(false); onConfirmCash(); }}
              className="bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700"
            >
              Pagar com cash
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default RegisterPaymentDialog;
