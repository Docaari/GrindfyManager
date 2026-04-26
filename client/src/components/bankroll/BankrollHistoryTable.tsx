/**
 * BankrollHistoryTable — Tabela de historico (RF-04, RF-11)
 *
 * Sprint Bankroll-3 (RF-06): adiciona data-reason em <tr> + badge dedicado
 * para rakeback (cor amber/dourado).
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  reasonLabel,
  reasonColor,
  transactionSourceLabel,
} from "@/lib/bankrollHelpers";

interface Snapshot {
  id: string;
  occurredAt: string;
  delta: number;
  previousAmount: number;
  newAmount: number;
  reason: string;
  note?: string | null;
  source?: string | null;
}

interface HistoryResp {
  snapshots: Snapshot[];
}

export function BankrollHistoryTable() {
  const { data } = useQuery<HistoryResp>({
    queryKey: ["/api/bankroll/history"],
    queryFn: () => apiRequest("GET", "/api/bankroll/history"),
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
            <tr key={s.id} className="border-b" data-reason={s.reason}>
              <td className="py-2 pr-3">
                {new Date(s.occurredAt).toLocaleDateString("pt-BR")}
              </td>
              <td className="py-2 pr-3">
                {s.reason === "rakeback" ? (
                  <span
                    data-testid="reason-badge-rakeback"
                    className={
                      "inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium " +
                      reasonColor("rakeback")
                    }
                  >
                    {reasonLabel("rakeback")}
                  </span>
                ) : (
                  <span>{reasonLabel(s.reason)}</span>
                )}
                {s.source && s.source !== "manual" && (
                  <span
                    data-testid={`source-badge-auto-${s.id}`}
                    title={transactionSourceLabel(s.source)}
                    className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium text-slate-700 bg-slate-50 border-slate-200"
                  >
                    Auto
                  </span>
                )}
              </td>
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
