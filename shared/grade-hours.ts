/**
 * Grade Hours — utility functions for time slot generation and validation
 */

/**
 * Generates an array of time slots from startHour (inclusive) to endHour (exclusive).
 * Wraps around midnight when endHour < startHour.
 * Each slot is formatted as "HH:00".
 */
export function generateTimeSlots(startHour: number, endHour: number): string[] {
  const slots: string[] = [];
  let hour = startHour;

  // Calculate total hours (wrapping around midnight)
  let total: number;
  if (endHour > startHour) {
    total = endHour - startHour;
  } else {
    total = 24 - startHour + endHour;
  }

  for (let i = 0; i < total; i++) {
    const h = (hour + i) % 24;
    slots.push(h.toString().padStart(2, '0') + ':00');
  }

  return slots;
}

/**
 * Validates that startHour and endHour form a valid grade range.
 * Rules:
 * - start !== end (0 hours not allowed)
 * - Minimum 4 hours
 * - Maximum 20 hours
 */
export function validateGradeHours(
  startHour: number,
  endHour: number
): { valid: boolean; error?: string } {
  if (startHour === endHour) {
    return { valid: false, error: 'Start and end hours cannot be the same' };
  }

  let totalHours: number;
  if (endHour > startHour) {
    totalHours = endHour - startHour;
  } else {
    totalHours = 24 - startHour + endHour;
  }

  if (totalHours < 4) {
    return { valid: false, error: 'Grade must span at least 4 hours' };
  }

  if (totalHours > 20) {
    return { valid: false, error: 'Grade must span at most 20 hours' };
  }

  return { valid: true };
}
