// =============================================================================
// buildTicketsContext — Sprint D / RF-03.3 (ADR-185)
//
// Coach AI context block DINAMICO (sem cache_control) — injecao CONDICIONAL:
//   - keyword gate: `ticket | satelite | grade | selecionar torneio` (NFKD lower).
//   - surface gate: `tournament-selector | grade-planner`.
//
// Early return null quando 0 tickets ativos (lesson #11 default minimo).
// Sem `getActiveTicketsByUser` no storage -> null (defensive, lesson #34).
// =============================================================================

const KEYWORDS = ["ticket", "satelite", "grade", "selecionar torneio"];

export interface TicketsContextInput {
  userId: string;
  recentUserText?: string;
  pageContext?: { surface?: string } | null;
}

export interface TicketsContextBlock {
  text: string;
  ticketCount: number;
  totalValueUsd: number;
}

function normalize(s: string): string {
  // NIT-1 fix: regex em escape unicode-explicit (combining diacritical marks
  // U+0300..U+036F). Antes usava literal combining chars no source — fragil
  // a copy/paste / encoding shifts.
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

function shouldInject(input: TicketsContextInput): boolean {
  const surface = input.pageContext?.surface;
  if (surface === "tournament-selector" || surface === "grade-planner") return true;
  const raw = input.recentUserText ?? "";
  if (!raw) return false;
  const txt = normalize(raw);
  return KEYWORDS.some((k) => txt.includes(k));
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function toValueUsd(t: any): number {
  return typeof t.valueUsd === "number" ? t.valueUsd : parseFloat(String(t.valueUsd)) || 0;
}

function daysUntilLabel(expiresAt: string | Date): string {
  // NIT-2 fix: granularidade humana — `0 dia(s)` -> "hoje" / "ja expirou".
  const ms = (expiresAt instanceof Date ? expiresAt : new Date(expiresAt)).getTime() - Date.now();
  if (ms <= 0) return "ja expirou";
  const days = Math.floor(ms / MS_PER_DAY);
  if (days === 0) return "hoje";
  if (days === 1) return "em 1 dia";
  return `em ${days} dias`;
}

function formatBlock(tickets: any[]): TicketsContextBlock {
  // Tickets sem `expiresAt` ficam por ultimo; demais em ordem crescente.
  const sorted = [...tickets].sort((a, b) => {
    if (!a.expiresAt && !b.expiresAt) return 0;
    if (!a.expiresAt) return 1;
    if (!b.expiresAt) return -1;
    return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
  });
  const total = sorted.reduce((sum, t) => sum + toValueUsd(t), 0);
  const lines: string[] = [
    "## Inventario de tickets ativos",
    `Total: ${sorted.length} tickets (~$${total.toFixed(2)} USD).`,
  ];
  const top3 = sorted.slice(0, 3);
  if (top3.length > 0) {
    lines.push("Proximos a expirar:");
    for (const t of top3) {
      const exp = t.expiresAt ? daysUntilLabel(t.expiresAt) : "sem data";
      lines.push(`- ${t.sourceName ?? "ticket"} ($${toValueUsd(t).toFixed(2)}) — ${exp}`);
    }
  }
  return { text: lines.join("\n"), ticketCount: sorted.length, totalValueUsd: total };
}

export async function buildTicketsContext(
  input: TicketsContextInput
): Promise<TicketsContextBlock | null> {
  if (!shouldInject(input)) return null;
  // Lazy import (lesson #36) — modulo de teste pode mockar storage parcial
  // sem precisar dos exports do @shared/schema.
  const { storage } = await import("../../storage");
  const fn = (storage as any)?.getActiveTicketsByUser;
  if (typeof fn !== "function") return null;
  let tickets: any[];
  try {
    tickets = (await fn.call(storage, input.userId)) ?? [];
  } catch (err) {
    console.error("buildTicketsContext.getActiveTicketsByUser.error", { err });
    return null;
  }
  if (!Array.isArray(tickets) || tickets.length === 0) return null;
  return formatBlock(tickets);
}
