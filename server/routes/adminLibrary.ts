// =============================================================================
// server/routes/adminLibrary.ts — Sprint Biblioteca-1 / RF-04 + RF-11.
//
// Handlers admin:
//   POST /api/admin/library/grant-access
//   POST /api/admin/library/import-manifest (wired no index)
//
// Auth: requireAuth + requirePermission('admin_full') aplicados via middleware
// no router principal — handlers assumem req.user ja validado.
// =============================================================================

import type { Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";

const ALLOWED_SOURCES = ["admin", "purchase", "bundle", "subscription"] as const;
const MAX_LESSONS_PER_GRANT = 500;

const grantSchema = z.object({
  userId: z.string().min(1),
  lessonIds: z
    .array(z.string().min(1))
    .min(1, "lessonIds must not be empty")
    .max(MAX_LESSONS_PER_GRANT, `cap exceeded: max 500 lessons per call`),
  source: z.enum(ALLOWED_SOURCES),
  expiresAt: z
    .union([z.string().datetime(), z.string()])
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
});

export async function handleAdminGrantAccess(req: Request, res: Response) {
  try {
    const parsed = grantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "invalid_input",
        errors: parsed.error.format(),
      });
    }
    const { userId, lessonIds, source, expiresAt } = parsed.data;

    // Verificar se usuario existe (F5: usa getUserById que ja resolve por
    // userPlatformId — o stub redundante getUserByPlatformId foi removido).
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "user_not_found" });
    }

    const grantedBy = (req as any).user?.userPlatformId;

    const result = await storage.bulkGrantLessonAccess({
      userId,
      lessonIds,
      source,
      grantedBy,
      expiresAt: expiresAt ?? null,
    });

    res.status(200).json({
      granted: result?.granted ?? 0,
      alreadyHadAccess: result?.alreadyHadAccess ?? 0,
      errors: result?.errors ?? [],
    });
  } catch (err) {
    console.error("[handleAdminGrantAccess] error", err);
    res.status(500).json({ message: "internal_error" });
  }
}
