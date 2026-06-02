/**
 * Fase D #5 — Stop-loss cold-commit (ADR-235 D-3).
 *
 * Zod compartilhado do snapshot `coldStopCommit` (sub-objeto opcional de
 * `warmup_rituals.sessionIntention`). Extraído para LOCKSTEP: importado tanto em
 * `shared/schema.ts` (`insertWarmupRitualSchema`) quanto em
 * `server/routes/warmup-rituals.ts` (handler-level), evitando divergência (lesson #28).
 *
 * Aditivo + opcional (lesson #7): NÃO torna `sessionIntention` required.
 */

import { z } from "zod";

export const coldStopCommitZod = z
  .object({
    committedUsd: z.number().positive(),
    basis: z.enum(["bi", "manual"]),
    nBI: z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
    abiUsdAtCommit: z.number().positive().optional(),
    committedAt: z.string().datetime(),
  })
  .optional()
  .nullable();

export type ColdStopCommit = NonNullable<z.infer<typeof coldStopCommitZod>>;
