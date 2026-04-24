/**
 * BankrollHistoryTable — Tabela de historico (RF-04, RF-11)
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest as rawApiRequest } from "@/lib/queryClient";

const apiRequest: (url: string) => Promise<any> = rawApiRequest as any;

interface Snapshot {
  id: string;
  occurredAt: string;
  delta: number;
  previousAmount: number;
  newAmount: number;
  reason: string;
  note?: string | null;
  source?: string;
}

interface HistoryResp {
  snapshots: Snapshot[];
}

const REASON_LABEL: Record<string, string> = {
  initial: "Inicial",
  deposit: "Aporte",
  withdrawal: "Saque",
  session_result: "Sessao",
  manual_adjustment: "Ajuste",
};

export function BankrollHistoryTable() {
  const { data } = useQuery<HistoryResp>({
    queryKey: ["/api/bankroll/history"],
    queryFn: () => apiRequest("/api/bankroll/history"),
  });

  const rows = data?.snapshots ?? [];

  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">Nenhum movimento registrado.</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-3">Data</th>
            <th className="py-2 pr-3">Motivo</th>
            <th className="py-2 pr-3 text-right">Delta</th>
            <th className="py-2 pr-3 text-right">Novo saldo</th>
            <th className="py-2">Nota</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b">
              <td className="py-2 pr-3">
                {new Date(s.occurredAt).toLocaleDateString("pt-BR")}
              </td>
              <td className="py-2 pr-3">{REASON_LABEL[s.reason] ?? s.reason}</td>
              <td
                className={
                  "py-2 pr-3 text-right " + (Number(s.delta) >= 0 ? "text-green-600" : "text-red-600")
                }
              >
                {Number(s.delta) >= 0 ? "+" : ""}
                {Number(s.delta).toFixed(2)}
              </td>
              <td className="py-2 pr-3 text-right">{Number(s.newAmount).toFixed(2)}</td>
              <td className="py-2">{s.note ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default BankrollHistoryTable;
