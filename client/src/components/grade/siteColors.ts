// =============================================================================
// Sprint day-detail-manage-2 — Site color tokens
//
// Mapeamento determinístico site -> classes Tailwind (badge bg/text/border)
// para chips visuais. Fallback hash-based para sites desconhecidos.
// =============================================================================

const KNOWN: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  PokerStars: {
    bg: "bg-red-500/15",
    text: "text-red-300",
    border: "border-red-500/30",
    dot: "bg-red-400",
  },
  GGNetwork: {
    bg: "bg-rose-500/15",
    text: "text-rose-300",
    border: "border-rose-500/30",
    dot: "bg-rose-400",
  },
  GGPoker: {
    bg: "bg-rose-500/15",
    text: "text-rose-300",
    border: "border-rose-500/30",
    dot: "bg-rose-400",
  },
  WPN: {
    bg: "bg-blue-500/15",
    text: "text-blue-300",
    border: "border-blue-500/30",
    dot: "bg-blue-400",
  },
  ACR: {
    bg: "bg-blue-500/15",
    text: "text-blue-300",
    border: "border-blue-500/30",
    dot: "bg-blue-400",
  },
  PartyPoker: {
    bg: "bg-orange-500/15",
    text: "text-orange-300",
    border: "border-orange-500/30",
    dot: "bg-orange-400",
  },
  "888poker": {
    bg: "bg-amber-500/15",
    text: "text-amber-300",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
  },
  Bodog: {
    bg: "bg-yellow-500/15",
    text: "text-yellow-300",
    border: "border-yellow-500/30",
    dot: "bg-yellow-400",
  },
  CoinPoker: {
    bg: "bg-cyan-500/15",
    text: "text-cyan-300",
    border: "border-cyan-500/30",
    dot: "bg-cyan-400",
  },
  Chico: {
    bg: "bg-purple-500/15",
    text: "text-purple-300",
    border: "border-purple-500/30",
    dot: "bg-purple-400",
  },
  Revolution: {
    bg: "bg-fuchsia-500/15",
    text: "text-fuchsia-300",
    border: "border-fuchsia-500/30",
    dot: "bg-fuchsia-400",
  },
  iPoker: {
    bg: "bg-teal-500/15",
    text: "text-teal-300",
    border: "border-teal-500/30",
    dot: "bg-teal-400",
  },
};

const FALLBACK_PALETTE: Array<{
  bg: string;
  text: string;
  border: string;
  dot: string;
}> = [
  {
    bg: "bg-emerald-500/15",
    text: "text-emerald-300",
    border: "border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  {
    bg: "bg-indigo-500/15",
    text: "text-indigo-300",
    border: "border-indigo-500/30",
    dot: "bg-indigo-400",
  },
  {
    bg: "bg-pink-500/15",
    text: "text-pink-300",
    border: "border-pink-500/30",
    dot: "bg-pink-400",
  },
  {
    bg: "bg-sky-500/15",
    text: "text-sky-300",
    border: "border-sky-500/30",
    dot: "bg-sky-400",
  },
  {
    bg: "bg-lime-500/15",
    text: "text-lime-300",
    border: "border-lime-500/30",
    dot: "bg-lime-400",
  },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getSiteColors(site: string | null | undefined): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  if (!site)
    return {
      bg: "bg-gray-700/40",
      text: "text-gray-300",
      border: "border-gray-600/40",
      dot: "bg-gray-400",
    };
  if (KNOWN[site]) return KNOWN[site];
  const idx = hashString(site) % FALLBACK_PALETTE.length;
  return FALLBACK_PALETTE[idx];
}
