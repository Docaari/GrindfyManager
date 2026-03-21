interface Tournament {
  id: string;
  name: string;
  site: string;
  buyIn: string;
  time: string | null;
  [key: string]: any;
}

export function groupTournamentsBySlot(
  tournaments: Tournament[],
  slots: string[],
): Map<string, Tournament[]> {
  const result = new Map<string, Tournament[]>();

  if (tournaments.length === 0) return result;

  const sortedSlots = [...slots].sort();

  for (const t of tournaments) {
    let slotKey: string;

    if (!t.time) {
      slotKey = 'unscheduled';
    } else {
      slotKey = findSlot(t.time, sortedSlots);
    }

    if (!result.has(slotKey)) {
      result.set(slotKey, []);
    }
    result.get(slotKey)!.push(t);
  }

  // Sort each slot by buyIn descending
  for (const [, arr] of result) {
    arr.sort((a, b) => parseFloat(b.buyIn) - parseFloat(a.buyIn));
  }

  return result;
}

function findSlot(time: string, sortedSlots: string[]): string {
  // Find the largest slot <= time (round down)
  let best = sortedSlots[0];
  for (const slot of sortedSlots) {
    if (slot <= time) {
      best = slot;
    } else {
      break;
    }
  }
  return best;
}
