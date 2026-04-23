/**
 * State machine helpers for tournament lifecycle (ADR-014).
 *
 * Pure functions (no side effects) used by:
 *   - TournamentCard (render button state via guards)
 *   - GrindSessionLive handlers (apply transitions)
 *   - Tests (assert invariants)
 *
 * States: upcoming -> registered -> finished (with loops)
 *
 * Transitions:
 *   upcoming   -> registered  (REGISTRAR)
 *   registered -> registered  (REBUY: rebuys++)
 *   registered -> registered  (ADD-ON: addOnTaken=true)
 *   registered -> finished    (GG / FINISH)
 *   finished   -> registered  (RE-ENTRY: reentries++)
 *
 * Guards (see ADR-014 Invariantes):
 *   canAddOn(t)   := status==registered && allowsAddOn && !addOnTaken
 *                    && addOnCost != null && addOnCost > 0
 *   canReentry(t) := status==finished && allowsReentry
 *                    && (maxReentries==null || reentries < maxReentries)
 *   canRebuy(t)   := status==registered
 */

function parseNum(value: any): number {
  if (value == null) return 0;
  const n = parseFloat(String(value));
  return isNaN(n) ? 0 : n;
}

function parseIntSafe(value: any): number {
  if (value == null) return 0;
  const n = parseInt(String(value), 10);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export function canAddOn(t: any): boolean {
  if (!t) return false;
  if (t.status !== 'registered') return false;
  if (!t.allowsAddOn) return false;
  if (t.addOnTaken) return false;
  if (t.addOnCost == null) return false;
  return parseNum(t.addOnCost) > 0;
}

export function canReentry(t: any): boolean {
  if (!t) return false;
  if (t.status !== 'finished') return false;
  if (!t.allowsReentry) return false;
  const reentries = parseIntSafe(t.reentries);
  const max = t.maxReentries;
  if (max == null) return true;
  return reentries < max;
}

export function canRebuy(t: any): boolean {
  if (!t) return false;
  return t.status === 'registered';
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export function applyRegister(t: any): any {
  if (!t) throw new Error('applyRegister: tournament missing');
  return {
    ...t,
    status: 'registered',
    reentries: parseIntSafe(t.reentries),
    addOnTaken: Boolean(t.addOnTaken),
  };
}

export function applyRebuy(t: any): any {
  if (!canRebuy(t)) {
    throw new Error('applyRebuy: cannot rebuy (status must be registered)');
  }
  return {
    ...t,
    rebuys: parseIntSafe(t.rebuys) + 1,
  };
}

export function applyAddOn(t: any): any {
  if (!canAddOn(t)) {
    throw new Error('applyAddOn: guard failed (check allowsAddOn, addOnCost, addOnTaken, status)');
  }
  return {
    ...t,
    addOnTaken: true,
  };
}

export function applyFinish(t: any, result?: { prize?: string; bounty?: string; position?: number | null }): any {
  if (!t) throw new Error('applyFinish: tournament missing');
  if (t.status !== 'registered') {
    throw new Error('applyFinish: tournament must be registered to finish');
  }
  const out: any = {
    ...t,
    status: 'finished',
  };
  if (result) {
    if (result.prize !== undefined) out.prize = String(result.prize);
    if (result.bounty !== undefined) out.bounty = String(result.bounty);
    if (result.position !== undefined) out.position = result.position;
  }
  return out;
}

/**
 * Null-safe min for position (best position is the lowest number).
 */
function minPositionNullSafe(
  a: number | null | undefined,
  b: number | null | undefined
): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.min(a, b);
}

/**
 * Apply re-entry transition. Decision C (RD-1): accumulate prize/bounty,
 * position keeps the best (minimum) across entries.
 *
 * V1 frontend normally does NOT send prize/bounty/position in payload — but
 * backend is defensive. If newData is empty, existing fields are preserved.
 */
export function applyReentry(
  t: any,
  newData?: { prize?: string | number | null; bounty?: string | number | null; position?: number | null }
): any {
  if (!canReentry(t)) {
    throw new Error('applyReentry: guard failed (check allowsReentry, maxReentries, status)');
  }
  const nextReentries = parseIntSafe(t.reentries) + 1;

  // Acumulacao (decisao C) — soma prize/bounty quando novo valor fornecido
  let prize = t.prize ?? '0';
  let bounty = t.bounty ?? '0';
  let position: number | null = t.position ?? null;

  if (newData) {
    if (newData.prize !== undefined && newData.prize !== null) {
      prize = String(parseNum(t.prize) + parseNum(newData.prize));
    }
    if (newData.bounty !== undefined && newData.bounty !== null) {
      bounty = String(parseNum(t.bounty) + parseNum(newData.bounty));
    }
    if (newData.position !== undefined) {
      position = minPositionNullSafe(t.position, newData.position);
    }
  }

  return {
    ...t,
    status: 'registered',
    reentries: nextReentries,
    endTime: null,
    prize,
    bounty,
    position,
  };
}
