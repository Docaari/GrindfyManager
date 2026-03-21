/**
 * Library Filters — client-side filtering for tournament library
 */

import { getCurrencyForSite } from './platform-currency';

interface LibraryTournament {
  id: string;
  name: string;
  site: string;
  buyIn: string;
  time: string | null;
  type: string | null;
  speed: string | null;
  [key: string]: any;
}

interface LibraryFilters {
  search?: string;
  minBuyIn?: number;
  maxBuyIn?: number;
  types?: string[];
  speeds?: string[];
  sites?: string[];
  currencies?: string[];
  startTime?: string; // "HH:mm"
  endTime?: string;   // "HH:mm"
}

/**
 * Filters tournament library items based on provided filters.
 * All filters are AND (must all match). Empty/undefined filters pass all items.
 */
export function filterLibraryTournaments(
  tournaments: LibraryTournament[],
  filters: LibraryFilters | undefined | null
): LibraryTournament[] {
  if (!filters) return tournaments;

  return tournaments.filter((t) => {
    // Search filter (case-insensitive partial match on name or $buyIn)
    if (filters.search && filters.search.trim() !== '') {
      const searchLower = filters.search.toLowerCase();
      const nameMatch = t.name.toLowerCase().includes(searchLower);
      const buyInFormatted = `$${t.buyIn}`.toLowerCase();
      const buyInMatch = buyInFormatted.includes(searchLower);
      if (!nameMatch && !buyInMatch) {
        return false;
      }
    }

    // Buy-in range
    if (filters.minBuyIn !== undefined) {
      if (parseFloat(t.buyIn) < filters.minBuyIn) {
        return false;
      }
    }

    if (filters.maxBuyIn !== undefined) {
      if (parseFloat(t.buyIn) > filters.maxBuyIn) {
        return false;
      }
    }

    // Type multi-select
    if (filters.types && filters.types.length > 0) {
      if (!t.type || !filters.types.includes(t.type)) {
        return false;
      }
    }

    // Speed multi-select
    if (filters.speeds && filters.speeds.length > 0) {
      if (!t.speed || !filters.speeds.includes(t.speed)) {
        return false;
      }
    }

    // Site multi-select
    if (filters.sites && filters.sites.length > 0) {
      if (!filters.sites.includes(t.site)) {
        return false;
      }
    }

    // Currency multi-select
    if (filters.currencies && filters.currencies.length > 0) {
      const siteCurrency = getCurrencyForSite(t.site);
      if (!filters.currencies.includes(siteCurrency.code)) {
        return false;
      }
    }

    // Time range
    if (filters.startTime || filters.endTime) {
      if (t.time === null) {
        return false;
      }

      if (filters.startTime && filters.endTime && filters.endTime < filters.startTime) {
        // Nocturnal range (e.g. 22:00 -> 02:00): use OR logic
        if (t.time < filters.startTime && t.time > filters.endTime) {
          return false;
        }
      } else {
        if (filters.startTime && t.time < filters.startTime) {
          return false;
        }

        if (filters.endTime && t.time > filters.endTime) {
          return false;
        }
      }
    }

    return true;
  });
}
