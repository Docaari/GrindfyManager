/**
 * Tournament Selector — Time-of-day bucketizer (RF-06)
 *
 * Funcao pura `getTimeOfDayBucket(hhmm: string)` que mapeia "HH:mm" para
 * um dos 5 buckets:
 *
 *   madrugada    00:00 - 05:59
 *   manha        06:00 - 11:59
 *   tarde        12:00 - 17:59
 *   noite-cedo   18:00 - 20:59
 *   noite-nobre  21:00 - 23:59
 */

import { TIME_OF_DAY_BUCKETS } from "./scoringConstants";
import type { TimeOfDayBucket } from "../../shared/scoring";

const HHMM_REGEX = /^(\d{1,2}):(\d{2})$/;

export function getTimeOfDayBucket(hhmm: string): TimeOfDayBucket {
  if (!hhmm || typeof hhmm !== "string") {
    throw new Error(`Invalid time format: "${hhmm}" (expected HH:mm)`);
  }

  const match = HHMM_REGEX.exec(hhmm);
  if (!match) {
    throw new Error(`Invalid time format: "${hhmm}" (expected HH:mm)`);
  }

  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);

  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time value: "${hhmm}" (hour=${hour} minute=${minute})`);
  }

  for (const b of TIME_OF_DAY_BUCKETS) {
    if (hour >= b.startHour && hour <= b.endHour) {
      return b.bucket as TimeOfDayBucket;
    }
  }

  // Should never reach here given complete coverage 0-23
  throw new Error(`No bucket for hour ${hour}`);
}
