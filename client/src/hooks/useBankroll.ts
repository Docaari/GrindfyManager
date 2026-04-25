/**
 * useBankroll — Hook para ler estado da banca (RF-01)
 *
 * MED-2 fix (UX-2 2026-04-25): chamada apiRequest agora usa a assinatura real
 * `(method, url, data?)`. Antes: cast `as any` mascarava bug em runtime
 * (apiRequest("/api/bankroll") setava method="/api/bankroll" e url=undefined,
 * causando fetch(undefined)).
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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
    queryFn: () => apiRequest("GET", "/api/bankroll"),
  });
}
