/**
 * SSoT do "horario de registro" exibido em UIs (home Grade do Dia, grade
 * planner /coach, /grind-live). Cascata identica a `getRegDeadlineLabel`
 * em grind-session-live/TournamentCard.tsx (consolidado aqui pra reuso).
 *
 * Cascata:
 *   1. registrationTime explicito (HH:MM) — intencao do jogador.
 *   2. time + lateRegMinutes — deadline do late reg (registro fecha aqui).
 *   3. time cru — fallback (sem lateReg ou sem reg explicit).
 */

interface DisplayRegistrationInput {
  time?: string | null;
  lateRegMinutes?: number | null;
  registrationTime?: string | null;
}

export function getDisplayRegistrationTime(t: DisplayRegistrationInput): string {
  const reg = t.registrationTime;
  if (reg && typeof reg === 'string' && reg.trim() !== '') return reg.trim();

  const time = typeof t.time === 'string' ? t.time : '';
  const lateReg = typeof t.lateRegMinutes === 'number' && t.lateRegMinutes > 0 ? t.lateRegMinutes : 0;

  if (!time) return '';
  if (lateReg <= 0) return time;

  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;

  const total = h * 60 + m + lateReg;
  const hh = ((Math.floor(total / 60)) % 24 + 24) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
