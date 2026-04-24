/**
 * useBankrollHistory — Hook para historico (RF-04, RF-11)
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest as rawApiRequest } from "@/lib/queryClient";

const apiRequest: (url: string) => Promise<any> = rawApiRequest as any;

export interface BankrollHistoryResp {
  snapshots: Array<{
    id: string;
    occurredAt: string;
    delta: number;
    previousAmount: number;
    newAmount: number;
    reason: string;
    note?: string | null;
    source?: string;
  }>;
  series: Array<{ bucket: string; balance: number; movements: number; delta: number }>;
  summary: {
    totalDeposits: number;
    totalWithdrawals: number;
    totalSessionPnL: number;
    totalManualAdjustments: number;
    netChange: number;
    startBalance: number;
    endBalance: number;
  };
  pagination: { total: number; limit: number; offset: number };
}

export function useBankrollHistory(params?: {
  from?: string;
  to?: string;
  granularity?: "day" | "week" | "month";
  reason?: string;
}) {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  if (params?.granularity) query.set("granularity", params.granularity);
  if (params?.reason) query.set("reason", params.reason);
  const qs = query.toString();
  const url = qs ? `/api/bankroll/history?${qs}` : "/api/bankroll/history";

  return useQuery<BankrollHistoryResp>({
    queryKey: [url],
    queryFn: () => apiRequest(url),
  });
}
