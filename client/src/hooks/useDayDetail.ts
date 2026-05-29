// =============================================================================
// Sprint F4 W1 — useDayDetail hook (RF-01)
//
// useQuery -> GET /api/grade/day-detail/:profile/:dayOfWeek
// queryKey: ['day-detail', profileLetter, dayOfWeek]
// staleTime: 60_000 (1min)
// enabled: open && both valid
//
// Reviewer fix HIGH #2: usar apiRequest para refresh-on-401 + Content-Type
// padrao do projeto. GET nao precisa CSRF mas usa o mesmo helper para
// uniformidade.
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface DayDetailCards {
  totalTournaments: number;
  abiUsd: number;
  investmentUsd: number;
  bankrollNeeded: number;
  medianFieldSize?: number;
}

export interface DayDetailFormat {
  pctPKO: number;
  pctTurbo: number;
  pctVanilla: number;
  pctMystery?: number;
  pctSatellite?: number;
}

export interface DayDetailVolumeItem {
  site: string;
  count: number;
}

export interface DayDetailBankrollItem {
  site: string;
  balanceUsd: number;
  dayInvestmentUsd: number;
  coveragePct: number;
}

// RF-01: breakdown por plataforma (card expansivel "Plataformas").
export interface DayDetailPlatformItem {
  site: string;
  count: number;
  investedUsd: number;
  abiUsd: number;
}

export interface DayDetailListItem {
  id?: string;
  name?: string;
  site: string;
  type?: string;
  speed?: string;
  buyinUsd: number;
  count: number;
  time?: string;
  prioridade?: number;
  maxLate?: string | null;
  guaranteedUsd?: number;
  estimatedField?: number;
}

export interface DayDetailResponse {
  cards: DayDetailCards;
  format: DayDetailFormat;
  volume: DayDetailVolumeItem[];
  bankroll: DayDetailBankrollItem[];
  platforms?: DayDetailPlatformItem[];
  list: DayDetailListItem[];
}

interface UseDayDetailOptions {
  open: boolean;
  profileLetter: "A" | "B" | "C";
  dayOfWeek: number;
}

export function useDayDetail({
  open,
  profileLetter,
  dayOfWeek,
}: UseDayDetailOptions) {
  return useQuery<DayDetailResponse, Error>({
    queryKey: ["day-detail", profileLetter, dayOfWeek],
    enabled:
      open &&
      typeof profileLetter === "string" &&
      typeof dayOfWeek === "number" &&
      dayOfWeek >= 0 &&
      dayOfWeek <= 6,
    staleTime: 60_000,
    queryFn: async () => {
      return (await apiRequest(
        "GET",
        `/api/grade/day-detail/${profileLetter}/${dayOfWeek}`,
      )) as DayDetailResponse;
    },
  });
}

export default useDayDetail;
