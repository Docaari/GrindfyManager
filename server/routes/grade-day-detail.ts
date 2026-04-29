// =============================================================================
// Sprint F4 W1 — server/routes/grade-day-detail.ts
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (RF-01)
// Endpoint: GET /api/grade/day-detail/:profile/:dayOfWeek
// =============================================================================

import { Router, type Response } from "express";
import { requireAuth } from "../auth";
import { getDayDetail } from "../services/dayDetailService";
import { ALLOWED_PROFILE_LETTERS } from "../../shared/primedopeDefaults";

const router = Router();

router.get(
  "/day-detail/:profile/:dayOfWeek",
  requireAuth,
  async (req: any, res: Response) => {
    // CRITICAL fix (reviewer): user_platform_id (USER-XXXX) e o que FKs
    // apontam. Padrao do projeto em wallets.ts/bankroll.ts.
    const userId: string | null = req?.user?.userPlatformId ?? null;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const profileLetter = req.params.profile;
    const dayOfWeek = Number(req.params.dayOfWeek);

    if (
      !ALLOWED_PROFILE_LETTERS.includes(profileLetter) ||
      !Number.isFinite(dayOfWeek) ||
      dayOfWeek < 0 ||
      dayOfWeek > 6
    ) {
      return res
        .status(400)
        .json({ message: "Parametros invalidos (profile/dayOfWeek)." });
    }

    try {
      const result = await getDayDetail({
        userId,
        profileLetter: profileLetter as any,
        dayOfWeek,
      });
      return res.status(200).json(result);
    } catch (err) {
      console.error("[grade-day-detail] failed", err);
      return res
        .status(500)
        .json({ message: "Falha ao calcular detalhe do dia." });
    }
  },
);

export default router;
