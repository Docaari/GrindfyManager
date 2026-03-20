import type { Express } from "express";
import { requireAuth } from "../auth";

export async function registerSupremaRoutes(app: Express): Promise<void> {
  const { SupremaCache } = await import("../supremaCache");
  const { fetchSupremaTournaments } = await import("../supremaService");
  const supremaCache = new SupremaCache();

  app.get("/api/suprema/tournaments", requireAuth, async (req, res) => {
    try {
      const date = req.query.date as string;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Parametro date obrigatorio no formato YYYY-MM-DD" });
      }

      const cached = supremaCache.get(date);
      if (cached) {
        return res.json(cached);
      }

      const tournaments = await fetchSupremaTournaments(date);
      supremaCache.set(date, tournaments);
      res.json(tournaments);
    } catch (error: any) {
      res.status(502).json({ message: error.message || "Erro ao buscar torneios da Suprema Poker" });
    }
  });
}
