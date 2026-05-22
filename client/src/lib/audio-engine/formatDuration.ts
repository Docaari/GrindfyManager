// Sprint Mini Player 3 / RF-04.1 — formatDuration helper.
// 0..3599 -> "M:SS"; 3600+ -> "H:MM:SS"; invalido -> "--:--".

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "--:--";
  if (!Number.isFinite(seconds)) return "--:--";
  if (seconds < 0) return "--:--";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
  if (h > 0) {
    return `${h}:${pad2(m)}:${pad2(s)}`;
  }
  return `${m}:${pad2(s)}`;
}
