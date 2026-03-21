import { z } from "zod";

export const tournamentSchema = z.object({
  dayOfWeek: z.number(),
  site: z.string().min(1, "Site e obrigatorio"),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Horario invalido (use HH:MM)"),
  type: z.string().min(1, "Tipo e obrigatorio"),
  speed: z.string().min(1, "Velocidade e obrigatoria"),
  name: z.string().optional(),
  buyIn: z.string().min(1, "Buy-in e obrigatorio"),
  guaranteed: z.string().optional(),
  prioridade: z.coerce.number().min(1).max(3).default(2),
});

export type TournamentForm = z.infer<typeof tournamentSchema>;

export const weekDays = [
  { id: 0, name: "Domingo", short: "Dom" },
  { id: 1, name: "Segunda", short: "Seg" },
  { id: 2, name: "Ter\u00e7a", short: "Ter" },
  { id: 3, name: "Quarta", short: "Qua" },
  { id: 4, name: "Quinta", short: "Qui" },
  { id: 5, name: "Sexta", short: "Sex" },
  { id: 6, name: "S\u00e1bado", short: "Sab" },
];

export const sites = [
  "PokerStars", "PartyPoker", "888poker", "GGPoker", "WPN",
  "iPoker", "CoinPoker", "Chico", "Revolution", "Bodog"
];

export const types = ["PKO", "Vanilla", "Mystery"];
export const speeds = ["Normal", "Turbo", "Hyper"];

export interface DayStats {
  count: number;
  avgBuyIn: number;
  totalBuyIn: number;
  vanillaPercentage: number;
  pkoPercentage: number;
  mysteryPercentage: number;
  normalPercentage: number;
  turboPercentage: number;
  hyperPercentage: number;
  avgFieldSize: number;
  startTime: string | null;
  endTime: string | null;
  durationHours: number;
}

export const emptyDayStats: DayStats = {
  count: 0,
  avgBuyIn: 0,
  totalBuyIn: 0,
  vanillaPercentage: 0,
  pkoPercentage: 0,
  mysteryPercentage: 0,
  normalPercentage: 0,
  turboPercentage: 0,
  hyperPercentage: 0,
  avgFieldSize: 0,
  startTime: null,
  endTime: null,
  durationHours: 0,
};
