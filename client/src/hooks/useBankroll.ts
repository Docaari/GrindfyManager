/**
 * useBankroll — Hook para ler estado da banca (RF-01)
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest as rawApiRequest } from "@/lib/queryClient";

const apiRequest: (url: string) => Promise<any> = rawApiRequest as any;

export interface BankrollState {
  configured: boolean;
  amount: number | null;
  currency?: string;
  rule?: string;
  rulePct?: number;
  tolerance?: number;
  maxBuyInUSD: number | null;
  softLimitUSD?: number | null;
  hardLimitUSD?: number | null;
  maxBuyInDisplay?: { USD: number | null; BRL?: number };
  snapshotCount?: number;
  lastUpdatedAt?: string | null;
}

export function useBankroll() {
  return useQuery<BankrollState>({
    queryKey: ["/api/bankroll"],
    queryFn: () => apiRequest("/api/bankroll"),
  });
}
