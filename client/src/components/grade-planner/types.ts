import { z } from "zod";
import { TOURNAMENT_PRIMARY_TYPES } from "@shared/tournamentTypes";

export const tournamentSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  site: z.string().min(1, "Site e obrigatorio"),
  // Relaxado para aceitar segundos opcionais (:SS) para compatibilidade com alguns browsers
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/, "Horario invalido (use HH:MM)"),
  type: z.string().min(1, "Tipo e obrigatorio"),
  speed: z.string().min(1, "Velocidade e obrigatoria"),
  name: z.string().optional(),
  buyIn: z.string().min(1, "Buy-in e obrigatorio"),
  guaranteed: z.string().optional(),
  prioridade: z.coerce.number().min(1).max(3).default(2),

  // Estrutura
  gameType: z.enum(["NLH", "PLO"]).nullable().optional(),
  startingStack: z.union([z.string(), z.number()]).nullable().optional(),
  maxPlayers: z.union([z.string(), z.number()]).nullable().optional(),
  blindLevelMinutes: z.union([z.string(), z.number()]).nullable().optional(),

  // Horario de registro final ("Max Late") — HH:MM. Editavel no modal canonico.
  registrationTime: z.string().nullable().optional(),

  // Late Reg / Alerta
  lateRegMinutes: z.union([z.string(), z.number()]).nullable().optional(),
  alertMinutesBefore: z.union([z.string(), z.number()]).nullable().optional(),

  // Add-on
  allowsAddOn: z.boolean().optional().default(false),
  addOnCost: z.string().nullable().optional(),

  // Re-entry
  allowsReentry: z.boolean().optional().default(false),
  maxReentries: z.union([z.string(), z.number()]).nullable().optional(),

  // Modificadores ortogonais (ADR-031)
  isFlight: z.boolean().optional().default(false),
  isLive: z.boolean().optional().default(false),

  // Campos Satellite (so quando type=Satellite)
  satelliteRewardType: z.enum(['ticket', 'package', 'cash', 'mixed']).nullable().optional(),
  satelliteTicketValue: z.string().nullable().optional(),
  satelliteTargetName: z.string().nullable().optional(),
});

export type TournamentForm = z.infer<typeof tournamentSchema>;

export const weekDays = [
  { id: 0, name: "Domingo", short: "Dom" },
  { id: 1, name: "Segunda", short: "Seg" },
  { id: 2, name: "Terça", short: "Ter" },
  { id: 3, name: "Quarta", short: "Qua" },
  { id: 4, name: "Quinta", short: "Qui" },
  { id: 5, name: "Sexta", short: "Sex" },
  { id: 6, name: "Sábado", short: "Sab" },
];

export const sites = [
  "PokerStars", "PartyPoker", "888poker", "GGPoker", "WPN",
  "iPoker", "CoinPoker", "Chico", "Bodog", "WPT Global"
];

// SSoT: re-export literal de shared/tournamentTypes (ordem do SSoT preservada).
export const types = [...TOURNAMENT_PRIMARY_TYPES];
export const speeds = ["Normal", "Turbo", "Hyper"];
export const gameTypes = ["NLH", "PLO"] as const;

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
  medianFieldSize: number | null;
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
  medianFieldSize: null,
  startTime: null,
  endTime: null,
  durationHours: 0,
};
