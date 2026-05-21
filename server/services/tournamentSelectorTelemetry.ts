// =============================================================================
// tournamentSelectorTelemetry — Sprint TS-3 (ADR-178 §2.5 + ADR-180 §2.4)
//
// Wrapper async/fire-and-forget para escrever em `tournament_selector_logs`.
// Wraps storage.insertSelectorLog para nao bloquear request + nao explodir
// quando o storage estiver indisponivel (lesson #9 logging).
//
// `metadata.invokedBy` (Q-L documentado em JSDoc, sem CHECK):
//   ['widget', 'coach_tool', 'admin_dashboard']
// =============================================================================

import type { SelectorLogEvent } from "../../shared/scoring";

export interface LogSelectorEventInput {
  userId: string;
  eventType: "view" | "add_to_grid";
  tournamentExternalId?: string | null;
  score?: number | null;
  grade?: any;
  confidence?: any;
  /**
   * metadata.invokedBy ∈ {'widget','coach_tool','admin_dashboard'} (JSDoc enum;
   * sem CHECK no DB para extensibilidade futura — ex: 'api_external').
   */
  metadata?: Record<string, any> | null;
}

export async function logSelectorEvent(input: LogSelectorEventInput): Promise<void> {
  try {
    const { storage } = await import("../storage");
    const event: SelectorLogEvent = {
      userId: input.userId,
      eventType: input.eventType,
      tournamentExternalId: input.tournamentExternalId ?? null,
      score: input.score ?? null,
      grade: input.grade ?? null,
      confidence: input.confidence ?? null,
      metadata: input.metadata ?? null,
    };
    await storage.insertSelectorLog(event as any);
  } catch (err) {
    console.error("selectorTelemetry.logSelectorEvent failed:", err);
  }
}
