/**
 * Utility functions for late registration calculations and display.
 */

export function calculateLateRegDeadline(startTime: Date, lateRegMinutes: number): Date {
  const deadline = new Date(startTime.getTime());
  deadline.setMinutes(deadline.getMinutes() + lateRegMinutes);
  return deadline;
}

export function formatStack(stack: number | null): string | null {
  if (stack === null) return null;
  if (stack >= 1000) {
    const k = stack / 1000;
    // If it's a whole number, show without decimal
    if (Number.isInteger(k)) {
      return `${k}k`;
    }
    return `${k}k`;
  }
  return String(stack);
}

export function getLateRegColor(minutesRemaining: number): string {
  if (minutesRemaining <= 0) return 'expired';
  if (minutesRemaining < 10) return 'red';
  if (minutesRemaining <= 30) return 'yellow';
  return 'green';
}

export function getLateRegStatus(minutesRemaining: number): string {
  if (minutesRemaining <= 0) return 'Late encerrado';
  return `Faltam ${minutesRemaining} min`;
}

export function resolveAlertThreshold(
  tournamentOverride: number | null,
  globalDefault: number,
): number {
  if (tournamentOverride !== null) return tournamentOverride;
  return globalDefault;
}
