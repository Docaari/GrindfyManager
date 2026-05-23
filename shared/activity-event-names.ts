// =============================================================================
// Sprint MP-VALIDATION / ADR-207 §1 — Canonical event-name list + regex
//
// Convencao: namespace-dotted snake_case (audio.play, lesson.completion_pct_50,
// coach.legacy_redirect.fired, library.progress.upsert). Versionamento opcional
// `.vN` ao final.
// =============================================================================

export const EVENT_NAME_REGEX = /^[a-z]+(\.[a-z0-9_]+)+(\.v[0-9]+)?$/;

export const CANONICAL_EVENT_NAMES: ReadonlyArray<string> = [
  // audio (13 — +3 SPOTIFY-DEEP)
  "audio.play",
  "audio.pause",
  "audio.seek",
  "audio.next",
  "audio.prev",
  "audio.queue_add",
  "audio.queue_remove",
  "audio.lesson_complete",
  "audio.picker_open",
  "audio.spotify_connect_click",
  // Sprint SPOTIFY-DEEP / ADR-208 §7 — 3 events novos.
  "audio.spotify_search_open",
  "audio.spotify_track_add",
  "audio.spotify_playlist_select",
  // lesson (6)
  "lesson.view",
  "lesson.play_start",
  "lesson.completion_pct_25",
  "lesson.completion_pct_50",
  "lesson.completion_pct_75",
  "lesson.completion_pct_100",
  // coach (5)
  "coach.nudge_received",
  "coach.nudge_dismissed",
  "coach.nudge_cta_clicked",
  "coach.chat_message",
  "coach.legacy_redirect.fired",
  // library (1 — RF-05 canary)
  "library.progress.upsert",
] as const;

export function isCanonicalEventName(name: string): boolean {
  return EVENT_NAME_REGEX.test(name);
}
