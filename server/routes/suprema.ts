import type { Express } from "express";
import { requireAuth } from "../auth";
import rateLimit from "express-rate-limit";

const supremaRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req: any) => req.user?.id || req.ip,
  message: { message: "Limite de requisições atingido. Tente novamente em 1 minuto." },
});

export async function registerSupremaRoutes(app: Express): Promise<void> {
  const { SupremaCache } = await import("../supremaCache");
  const { fetchSupremaTournaments } = await import("../supremaService");
  const supremaCache = new SupremaCache();

  app.get("/api/suprema/tournaments", requireAuth, supremaRateLimit, async (req, res) => {
    try {
      const date = req.query.date as string;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Parametro date obrigatorio no formato YYYY-MM-DD" });
      }

      // Validate that the date string represents a real date
      const dateObj = new Date(date + "T12:00:00");
      if (isNaN(dateObj.getTime())) {
        return res.status(400).json({ message: "Data invalida" });
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
