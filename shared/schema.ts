import {
  pgTable,
  text,
  varchar,
  decimal,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import {
  TournamentPrimaryTypeSchema,
  SatelliteRewardTypeSchema,
} from "./tournamentTypes";

// Session storage table (mandatory for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (with authentication system)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  userPlatformId: varchar("user_platform_id").unique().notNull(), // Sequential ID: USER-0001, USER-0002, etc.
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  name: varchar("name"), // Full name field
  profileImageUrl: varchar("profile_image_url"),
  password: varchar("password"), // For manual account creation
  username: varchar("username").unique(),
  role: varchar("role").default("user"), // admin, user, moderator
  status: varchar("status").default("pending_verification"), // active, inactive, pending_verification, blocked
  subscriptionPlan: varchar("subscription_plan").default("trial"), // trial, active, expired, admin
  trialEndsAt: timestamp("trial_ends_at"),
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  timezone: varchar("timezone").default("America/Sao_Paulo"),
  currency: varchar("currency").default("USD"),
  // Email verification system
  emailVerified: boolean("email_verified").default(false),
  // Account security system
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  // OAuth integration
  googleId: varchar("google_id"),
  // Stripe integration
  stripeCustomerId: varchar("stripe_customer_id"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastLogin: timestamp("last_login"),
});

// Auth tokens table - email verification and password reset tokens
export const authTokens = pgTable("auth_tokens", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  email: varchar("email").notNull(),
  token: varchar("token").notNull().unique(),
  type: varchar("type").notNull(), // "email_verification" | "password_reset"
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_auth_tokens_token").on(table.token),
  index("idx_auth_tokens_user_type").on(table.userId, table.type),
  index("idx_auth_tokens_expires").on(table.expiresAt),
]);

// Permissions table - all controllable functionalities
export const permissions = pgTable("permissions", {
  id: varchar("id").primaryKey().notNull(),
  name: varchar("name").notNull().unique(),
  description: varchar("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// User permissions relationship table
export const userPermissions = pgTable("user_permissions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  permissionId: varchar("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  granted: boolean("granted").default(true),
  status: varchar("status").default("active"), // active, expired, pending
  expirationDate: timestamp("expiration_date"), // null = permanent
  subscriptionPlan: varchar("subscription_plan"), // basico, premium, pro, custom
  autoRenew: boolean("auto_renew").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscriptions table for managing user subscription plans
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  planType: varchar("plan_type").notNull(), // basic, premium, pro
  status: varchar("status").default("active"), // active, expired, pending, cancelled
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date").notNull(),
  durationDays: integer("duration_days").notNull(), // 30, 90, 365
  autoRenewal: boolean("auto_renewal").default(false),
  paymentStatus: varchar("payment_status").default("pending"), // pending, paid, failed, refunded
  paymentMethodId: varchar("payment_method_id"), // Para futuro (Stripe)
  stripeSubscriptionId: varchar("stripe_subscription_id"), // Para futuro (Stripe)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Engagement metrics table for personalized messaging
export const engagementMetrics = pgTable("engagement_metrics", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  totalSessions: integer("total_sessions").default(0),
  totalTimeMinutes: integer("total_time_minutes").default(0),
  lastLoginDate: timestamp("last_login_date"),
  streakDays: integer("streak_days").default(0),
  avgSessionDuration: integer("avg_session_duration").default(0),
  favoritePage: varchar("favorite_page"),
  subscriptionDaysRemaining: integer("subscription_days_remaining"),
  engagementScore: integer("engagement_score").default(0), // 0-100
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Access logs table for tracking denied access attempts
export const accessLogs = pgTable("access_logs", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").references(() => users.userPlatformId, { onDelete: "cascade" }),
  permissionName: varchar("permission_name"),
  action: varchar("action"), // login_success, login_failed, access_denied, access_granted
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// User activity tracking for advanced analytics
export const userActivity = pgTable("user_activity", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  page: varchar("page").notNull(), // dashboard, grind, warm-up, studies, etc.
  action: varchar("action").notNull(), // page_view, feature_use, session_start, session_end
  feature: varchar("feature"), // upload, filter, export, etc.
  duration: integer("duration"), // session duration in seconds
  metadata: jsonb("metadata"), // additional context data
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Analytics summary for faster queries
export const analyticsDaily = pgTable("analytics_daily", {
  id: varchar("id").primaryKey().notNull(),
  date: timestamp("date").notNull(),
  userId: varchar("user_id").references(() => users.userPlatformId, { onDelete: "cascade" }),
  totalSessions: integer("total_sessions").default(0),
  totalDuration: integer("total_duration").default(0), // in seconds
  pagesVisited: jsonb("pages_visited").$type<string[]>().default([]),
  featuresUsed: jsonb("features_used").$type<string[]>().default([]),
  loginCount: integer("login_count").default(0),
  uploadCount: integer("upload_count").default(0),
  grindSessionsCreated: integer("grind_sessions_created").default(0),
  warmupSessionsCompleted: integer("warmup_sessions_completed").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notifications table for subscription alerts and system messages
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  type: varchar("type").notNull(), // subscription_expiring, subscription_expired, general
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  priority: varchar("priority").notNull(), // low, medium, high
  daysUntilExpiration: integer("days_until_expiration"),
  read: boolean("read").default(false),
  scheduledFor: timestamp("scheduled_for").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tournaments = pgTable("tournaments", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  tournamentId: varchar("tournament_id"), // External tournament ID from poker sites
  name: varchar("name").notNull(),
  buyIn: decimal("buy_in").notNull(),
  prizePool: decimal("prize_pool"),
  position: integer("position"),
  prize: decimal("prize").default("0"),
  datePlayed: timestamp("date_played").notNull(),
  site: varchar("site").notNull(),
  format: varchar("format").notNull(), // MTT, SNG, etc
  // Sprint 1 (ADR-031): modelo ortogonal type primario + modificadores booleanos
  type: varchar("type").default("Vanilla"), // Vanilla | PKO | Mystery | Satellite (SSoT em shared/tournamentTypes.ts)
  category: varchar("category").notNull(), // [DEPRECATED ADR-032] espelho de `type` durante deprecation gradual; remover apos migracao concluida
  speed: varchar("speed").notNull(), // Regular, Turbo, Hyper, etc
  fieldSize: integer("field_size"),
  reentries: integer("reentries").default(0),
  finalTable: boolean("final_table").default(false),
  bigHit: boolean("big_hit").default(false),
  earlyFinish: boolean("early_finish").default(false),
  lateFinish: boolean("late_finish").default(false),
  currency: varchar("currency").default("USD"),
  rake: decimal("rake").default("0"), // Rake paid
  convertedToUSD: boolean("converted_to_usd").default(false), // Currency conversion flag
  // Add-on + Re-entry (ADR-014)
  allowsAddOn: boolean("allows_addon").default(false),
  addOnCost: decimal("addon_cost"),
  addOnTaken: boolean("addon_taken").default(false),
  allowsReentry: boolean("allows_reentry").default(false),
  maxReentries: integer("max_reentries"),
  // Sprint 1 (ADR-031): modificadores ortogonais
  isFlight: boolean("is_flight").default(false),
  isLive: boolean("is_live").default(false),
  // Satellite fields (so quando type=Satellite)
  satelliteRewardType: varchar("satellite_reward_type"), // 'ticket' | 'package' | 'cash' | 'mixed'
  satelliteTicketValue: decimal("satellite_ticket_value"),
  satelliteTargetTemplateId: varchar("satellite_target_template_id"),
  satelliteTargetName: varchar("satellite_target_name"),
  satelliteExtraCash: decimal("satellite_extra_cash"),
  enteredViaSatellite: boolean("entered_via_satellite").default(false),
  // Flight fields (so quando isFlight=true)
  flightDay: varchar("flight_day"), // '1A' | '1B' | ... | 'Final' | '2' | '3' | 'Day 1' | ...
  flightParentId: varchar("flight_parent_id"),
  flightAdvanced: boolean("flight_advanced"),
  // Package fields (so quando isLive=true)
  packageBuyIn: decimal("package_buy_in"),
  packageAccommodation: decimal("package_accommodation"),
  packageTravel: decimal("package_travel"),
  packageMeals: decimal("package_meals"),
  packageOther: decimal("package_other"),
  packageNotes: text("package_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  templateId: varchar("template_id"),
  grindSessionId: varchar("grind_session_id"),
}, (table) => [
  index("idx_tournaments_user_tournament_id").on(table.userId, table.tournamentId),
  index("idx_tournaments_user_name_date_buyin").on(table.userId, table.name, table.datePlayed, table.buyIn),
  index("idx_tournaments_user_date").on(table.userId, table.datePlayed),
  index("idx_tournaments_user_site").on(table.userId, table.site),
  // Sprint 1: indexes parciais para queries dos modulos novos (Selector, dashboard)
  index("tournaments_satellite_target_idx").on(table.satelliteTargetTemplateId),
  index("tournaments_flight_parent_idx").on(table.flightParentId),
  index("tournaments_live_idx").on(table.isLive),
]);

export const tournamentTemplates = pgTable("tournament_templates", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  site: varchar("site").notNull(),
  format: varchar("format").notNull(),
  category: varchar("category").notNull(),
  speed: varchar("speed").notNull(),
  dayOfWeek: jsonb("day_of_week").$type<number[]>().default([]),
  startTime: jsonb("start_time").$type<string[]>().default([]),
  avgBuyIn: decimal("avg_buyin").default("0"),
  avgRoi: decimal("avg_roi").default("0"),
  totalPlayed: integer("total_played").default(0),
  totalProfit: decimal("total_profit").default("0"),
  finalTables: integer("final_tables").default(0),
  bigHits: integer("big_hits").default(0),
  avgFieldSize: integer("avg_field_size"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastPlayed: timestamp("last_played"),
});

export const weeklyPlans = pgTable("weekly_plans", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  weekStart: timestamp("week_start").notNull(),
  title: varchar("title"),
  description: text("description"),
  targetBuyins: decimal("target_buyins"),
  targetProfit: decimal("target_profit"),
  targetVolume: integer("target_volume"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const plannedTournaments = pgTable("planned_tournaments", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 1=Monday, etc.
  profile: varchar("profile").notNull().default("A"), // 'A', 'B' ou 'C' - Profile associated with tournament
  site: varchar("site").notNull(),
  time: varchar("time").notNull(), // e.g. "19:00"
  type: varchar("type").notNull(), // Vanilla | PKO | Mystery | Satellite (Sprint 1 ADR-031)
  category: varchar("category"), // [DEPRECATED ADR-032] espelho de `type`; opcional aqui pois pode nao existir em rows antigas
  speed: varchar("speed").notNull(), // e.g. "Normal", "Turbo", "Hyper"
  name: text("name").notNull(),
  buyIn: decimal("buy_in").notNull(),
  guaranteed: decimal("guaranteed"),
  templateId: varchar("template_id"), // Optional reference to tournament library (legacy)
  libraryTemplateId: varchar("library_template_id"), // FK nullable to tournament_library.id (Q4 — used by Selector to detect alreadyInGrid)
  status: varchar("status").default("upcoming"), // upcoming, registered, active, finished
  startTime: timestamp("start_time"),
  rebuys: integer("rebuys").default(0),
  result: decimal("result").default("0"),
  bounty: decimal("bounty").default("0"),
  position: integer("position"),
  sessionId: varchar("session_id"), // Link to grind session when active
  externalId: varchar("external_id"),
  prioridade: integer("prioridade").default(2), // 1-Alta, 2-Média, 3-Baixa
  isActive: boolean("is_active").default(true),
  lateRegMinutes: integer("late_reg_minutes"),
  startingStack: integer("starting_stack"),
  maxPlayers: integer("max_players"),
  gameType: varchar("game_type"),
  blindLevelMinutes: integer("blind_level_minutes"),
  alertMinutesBefore: integer("alert_minutes_before"),
  // Add-on + Re-entry (ADR-014)
  allowsAddOn: boolean("allows_addon").default(false),
  addOnCost: decimal("addon_cost"),
  allowsReentry: boolean("allows_reentry").default(false),
  maxReentries: integer("max_reentries"),
  // Sprint 1 (ADR-031): modificadores ortogonais
  isFlight: boolean("is_flight").default(false),
  isLive: boolean("is_live").default(false),
  flightDay: varchar("flight_day"),
  flightParentId: varchar("flight_parent_id"),
  // Sprint 1: campos satellite minimos (ticket value + target name) para
  // quando type=Satellite e o usuario adiciona o satelite na grade.
  satelliteRewardType: varchar("satellite_reward_type"),
  satelliteTicketValue: decimal("satellite_ticket_value"),
  satelliteTargetName: varchar("satellite_target_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const grindSessions = pgTable("grind_sessions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  plannedBuyins: decimal("planned_buyins").default("0"),
  actualBuyins: decimal("actual_buyins").default("0"),
  profitLoss: decimal("profit_loss").default("0"),
  duration: integer("duration"), // in minutes
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  status: varchar("status").default("planned"), // planned, active, completed, cancelled
  tournamentsPlayed: integer("tournaments_played").default(0),
  finalTables: integer("final_tables").default(0),
  bigHits: integer("big_hits").default(0),
  notes: text("notes"),
  preparationNotes: text("preparation_notes"), // Notas de preparação
  preparationPercentage: integer("preparation_percentage"), // Percentual de preparação (0-100)
  dailyGoals: text("daily_goals"), // Objetivos do dia
  skipBreaksToday: boolean("skip_breaks_today").default(false), // Pular todos os breaks hoje
  objectiveCompleted: boolean("objective_completed"), // Se cumpriu o objetivo
  finalNotes: text("final_notes"), // Observações finais da sessão
  screenCap: integer("screen_cap"), // Número máximo de telas planejadas para a sessão
  sessionSnapshot: jsonb("session_snapshot"), // Session snapshot data
  // Manual editable metrics for completed sessions
  volume: integer("volume"), // Volume de torneios jogados
  profit: decimal("profit"), // Profit total da sessão
  abiMed: decimal("abi_med"), // ABI médio da sessão
  roi: decimal("roi"), // ROI da sessão
  fts: integer("fts"), // Final tables da sessão
  cravadas: integer("cravadas"), // Cravadas da sessão
  energiaMedia: decimal("energia_media"), // Energia média (dos breaks)
  focoMedio: decimal("foco_medio"), // Foco médio (dos breaks)
  confiancaMedia: decimal("confianca_media"), // Confiança média (dos breaks)
  inteligenciaEmocionalMedia: decimal("inteligencia_emocional_media"), // Int. Emocional média
  interferenciasMedia: decimal("interferencias_media"), // Interferências média
  // Percentuais de tipos de torneios
  vanillaPercentage: decimal("vanilla_percentage"), // Percentual de torneios Vanilla
  pkoPercentage: decimal("pko_percentage"), // Percentual de torneios PKO
  mysteryPercentage: decimal("mystery_percentage"), // Percentual de torneios Mystery
  // Percentuais de velocidades
  normalSpeedPercentage: decimal("normal_speed_percentage"), // Percentual de velocidade Normal
  turboSpeedPercentage: decimal("turbo_speed_percentage"), // Percentual de velocidade Turbo
  hyperSpeedPercentage: decimal("hyper_speed_percentage"), // Percentual de velocidade Hyper
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_grind_sessions_user_status").on(table.userId, table.status),
  index("idx_grind_sessions_user_date").on(table.userId, table.date),
]);

// Break feedback registros durante os breaks
export const breakFeedbacks = pgTable("break_feedbacks", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  sessionId: varchar("session_id"),
  breakTime: timestamp("break_time").notNull(),
  foco: integer("foco").notNull(), // 0-10
  energia: integer("energia").notNull(), // 0-10
  confianca: integer("confianca").notNull(), // 0-10
  inteligenciaEmocional: integer("inteligencia_emocional").notNull(), // 0-10
  interferencias: integer("interferencias").notNull(), // 0-10
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Torneios ativos da sessão (registro em tempo real)
export const sessionTournaments = pgTable("session_tournaments", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  sessionId: varchar("session_id").notNull(),
  site: varchar("site").notNull(),
  name: text("name"),
  time: varchar("time"), // CORREÇÃO: Campo de horário adicionado (ex: "19:00")
  buyIn: decimal("buy_in").notNull(),
  guaranteed: decimal("guaranteed"), // Guaranteed prize pool
  rebuys: integer("rebuys").default(0),
  result: decimal("result").default("0"),
  position: integer("position"),
  bounty: decimal("bounty").default("0"),
  prize: decimal("prize").default("0"),
  fieldSize: integer("field_size"),
  status: varchar("status").default("upcoming"), // upcoming, registered, active, finished
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  fromPlannedTournament: boolean("from_planned_tournament").default(false),
  plannedTournamentId: varchar("planned_tournament_id"),
  type: varchar("type").default("Vanilla"), // Vanilla, PKO, Mystery
  speed: varchar("speed").default("Normal"), // Normal, Turbo, Hyper
  category: varchar("category").default("Vanilla"), // Fallback for type
  prioridade: integer("prioridade").default(2), // 1-Alta, 2-Média, 3-Baixa
  lateRegMinutes: integer("late_reg_minutes"),
  startingStack: integer("starting_stack"),
  maxPlayers: integer("max_players"),
  gameType: varchar("game_type"),
  blindLevelMinutes: integer("blind_level_minutes"),
  alertMinutesBefore: integer("alert_minutes_before"),
  // Add-on + Re-entry (ADR-014)
  allowsAddOn: boolean("allows_addon").default(false),
  addOnCost: decimal("addon_cost"),
  addOnTaken: boolean("addon_taken").default(false),
  allowsReentry: boolean("allows_reentry").default(false),
  maxReentries: integer("max_reentries"),
  reentries: integer("reentries").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const preparationLogs = pgTable("preparation_logs", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  sessionId: varchar("session_id"),
  mentalState: integer("mental_state").notNull(),
  focusLevel: integer("focus_level").notNull(),
  confidenceLevel: integer("confidence_level").notNull(),
  exercisesCompleted: jsonb("exercises_completed").$type<string[]>().default([]),
  warmupCompleted: boolean("warmup_completed").default(false),
  sessionGoals: text("session_goals"),
  notes: text("notes"),
  postSessionReview: text("post_session_review"),
  goalsAchieved: boolean("goals_achieved"),
  lessonsLearned: text("lessons_learned"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === WARMUP RITUALS (Sprint W-1) ===
// Substitui semanticamente preparation_logs para rituais de warm-up cronometrados.
// preparation_logs permanece em uso pelo MentalPrep legado por 60 dias (ADR-029).

export type WarmupBlockSnapshot = {
  blockId: 1 | 2 | 3 | 4 | 5;
  startedAt: string; // ISO
  completedAt: string; // ISO
  durationSeconds: number;
  // Bloco 1
  emotionalCheckScore?: number;
  breathingCyclesCompleted?: number;
  // Bloco 2
  heuristicsRead?: boolean;
  heuristicsSnapshot?: [string, string, string];
  // Bloco 3
  drillCompleted?: boolean;
  drillUrl?: string;
  // Bloco 4
  setupItems?: {
    water: boolean;
    snacks: boolean;
    phoneAirplane: boolean;
    notificationsOff: boolean;
    headphones: boolean;
    light: boolean;
  };
  // Bloco 5: capturado em sessionIntention diretamente
};

export type SessionIntention = {
  focus: string;       // "Foco desta sessão"
  tiltPlan: string;    // "Se sentir tilt, vou"
  stopCriteria: string; // "Vou encerrar quando"
};

export const warmupRituals = pgTable("warmup_rituals", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  durationMinutes: integer("duration_minutes"),
  // version: 'full' = 5 blocos completos | 'aborted' = abandonado
  // (Sprint W-3 adicionara 'minimal' para versao minima 3min)
  version: varchar("version", { length: 16 }).notNull(),
  emotionalCheckScore: integer("emotional_check_score"), // 0-10, nullable se aborted antes do bloco 1
  decisionToPlay: boolean("decision_to_play"), // null = aborted; true = jogou; false = nao jogou
  overrideUsed: boolean("override_used").default(false), // true se score < 6 mas decidiu jogar
  blocksCompleted: jsonb("blocks_completed").$type<WarmupBlockSnapshot[]>().default([]),
  sessionIntention: jsonb("session_intention").$type<SessionIntention | null>(),
  linkedGrindSessionId: varchar("linked_grind_session_id")
    .references(() => grindSessions.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_warmup_rituals_user_completed").on(table.userId, table.completedAt),
  index("idx_warmup_rituals_user_started").on(table.userId, table.startedAt),
]);

export const customGroups = pgTable("custom_groups", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  description: text("description"),
  color: varchar("color"),
  criteria: jsonb("criteria").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customGroupTemplates = pgTable("custom_group_templates", {
  id: varchar("id").primaryKey().notNull(),
  groupId: varchar("group_id").notNull(),
  templateId: varchar("template_id").notNull(),
});

export const coachingInsights = pgTable("coaching_insights", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  type: varchar("type").notNull(), // suggestion, warning, opportunity
  category: varchar("category").notNull(), // roi_optimization, volume_adjustment, etc
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  priority: integer("priority").default(1), // 1=low, 2=medium, 3=high
  data: jsonb("data"),
  read: boolean("read").default(false),
  isApplied: boolean("is_applied").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").unique().notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  bigHitMultiplier: decimal("big_hit_multiplier").default("10"),
  earlyFinishThreshold: decimal("early_finish_threshold").default("0.3"),
  lateFinishThreshold: decimal("late_finish_threshold").default("0.7"),
  emailNotifications: boolean("email_notifications").default(true),
  coachingAlerts: boolean("coaching_alerts").default(true),
  sessionReminders: boolean("session_reminders").default(true),
  defaultChartPeriod: varchar("default_chart_period").default("30d"),
  preferredCurrency: varchar("preferred_currency").default("BRL"),
  darkMode: boolean("dark_mode").default(false),
  exchangeRates: jsonb("exchange_rates").$type<Record<string, number>>().default({}), // e.g. {"CNY": 7.25, "EUR": 0.93}
  lateRegAlertMinutes: integer("late_reg_alert_minutes").default(10),
  lateRegAlertEnabled: boolean("late_reg_alert_enabled").default(true),
  lateRegAlertSound: boolean("late_reg_alert_sound").default(true),
  gradeStartHour: integer("grade_start_hour").default(12),
  gradeEndHour: integer("grade_end_hour").default(3),
  // Bankroll Module (Q8) - reservado em Sprint 1 para Sprint 2 (Bankroll UI)
  // IMPORTANTE: bankrollAmount esta sempre em USD. Buy-ins de outras moedas (ex.: Suprema BRL)
  // sao normalizados para USD via normalizeBuyInToUSD antes de comparar com este threshold.
  bankrollAmount: decimal("bankroll_amount"),
  bankrollRule: varchar("bankroll_rule").default("1pct"),
  // Sprint W-1 (Warm-up): heuristicas semanais e drillUrl customizavel
  weeklyHeuristics: jsonb("weekly_heuristics").$type<[string, string, string] | null>().default(null),
  drillUrl: varchar("drill_url", { length: 500 }).default("https://app.gtowizard.com/"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const studyCards = pgTable("study_cards", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  category: varchar("category").notNull(), // 3bet, 4bet, River Play, ICM, etc.
  priority: varchar("priority").notNull(), // Crítico, Alto, Médio, Baixo
  description: text("description"),
  objectives: text("objectives"),
  currentStat: decimal("current_stat"), // Stat atual
  targetStat: decimal("target_stat"), // Stat target
  deadline: timestamp("deadline"),
  knowledgeScore: integer("knowledge_score").default(0), // 0-100
  timeInvested: integer("time_invested").default(0), // em minutos
  status: varchar("status").default("active"), // active, completed, paused
  // Campos de planejamento semanal
  studyDays: jsonb("study_days").$type<string[]>().default([]), // ["monday", "tuesday", etc.]
  studyStartTime: varchar("study_start_time"), // "10:00"
  studyDuration: integer("study_duration"), // em minutos
  isRecurring: boolean("is_recurring").default(false),
  weeklyFrequency: integer("weekly_frequency"), // quantas vezes por semana
  studyDescription: text("study_description"), // descrição opcional
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const studyMaterials = pgTable("study_materials", {
  id: varchar("id").primaryKey().notNull(),
  studyCardId: varchar("study_card_id").notNull(),
  title: varchar("title").notNull(),
  type: varchar("type").notNull(), // video, article, pdf, file
  url: varchar("url"),
  fileName: varchar("file_name"),
  status: varchar("status").default("not_viewed"), // not_viewed, viewed, completed
  timeSpent: integer("time_spent").default(0), // em minutos
  notes: text("notes"),
  timestampWatched: integer("timestamp_watched").default(0), // para vídeos
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const studyNotes = pgTable("study_notes", {
  id: varchar("id").primaryKey().notNull(),
  studyCardId: varchar("study_card_id").notNull(),
  title: varchar("title"),
  content: text("content").notNull(),
  tags: jsonb("tags").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});



export const studySessions = pgTable("study_sessions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  studyCardId: varchar("study_card_id"),
  date: timestamp("date").notNull(),
  duration: integer("duration").notNull(), // em minutos
  activities: jsonb("activities").$type<string[]>().default([]), // video, notes, flashcards, etc.
  focusScore: integer("focus_score"), // 0-10
  productivityScore: integer("productivity_score"), // 0-10
  insights: text("insights"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Active Days - para controlar quais dias da semana estão ativos na Grade
export const activeDays = pgTable("active_days", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0-6 (Sunday-Saturday)
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Profile States - para controlar qual perfil está ativo por dia (A, B ou null para ambos inativos)
export const profileStates = pgTable("profile_states", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0-6 (Sunday-Saturday)
  activeProfile: varchar("active_profile"), // 'A', 'B', 'C' ou null (para todos inativos)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Bug Reports - sistema de reportar bugs
export const bugReports = pgTable("bug_reports", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  page: varchar("page").notNull(), // dashboard, library, import, etc.
  description: text("description").notNull(),
  urgency: varchar("urgency").default("medium"), // low, medium, high
  type: varchar("type").default("bug"), // bug, suggestion, performance
  status: varchar("status").default("open"), // open, in_progress, resolved, dismissed
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Upload History - histórico de uploads para persistência
export const uploadHistory = pgTable("upload_history", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  filename: varchar("filename").notNull(),
  status: varchar("status").notNull(), // success, error, processing
  tournamentsCount: integer("tournaments_count").default(0),
  errorMessage: text("error_message"),
  uploadDate: timestamp("upload_date").defaultNow(),
  duplicatesFound: integer("duplicates_found").default(0),
  duplicateAction: varchar("duplicate_action"), // import_new_only, import_all, skip_upload
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  tournaments: many(tournaments),
  tournamentTemplates: many(tournamentTemplates),
  weeklyPlans: many(weeklyPlans),
  grindSessions: many(grindSessions),
  preparationLogs: many(preparationLogs),
  customGroups: many(customGroups),
  coachingInsights: many(coachingInsights),
  studyCards: many(studyCards),
  studySessions: many(studySessions),
  activeDays: many(activeDays),
  bugReports: many(bugReports),
  uploadHistory: many(uploadHistory),
  warmupRituals: many(warmupRituals),
  settings: one(userSettings, {
    fields: [users.userPlatformId],
    references: [userSettings.userId],
  }),
}));

export const tournamentsRelations = relations(tournaments, ({ one }) => ({
  user: one(users, {
    fields: [tournaments.userId],
    references: [users.userPlatformId],
  }),
  template: one(tournamentTemplates, {
    fields: [tournaments.templateId],
    references: [tournamentTemplates.id],
  }),
  grindSession: one(grindSessions, {
    fields: [tournaments.grindSessionId],
    references: [grindSessions.id],
  }),
}));

export const tournamentTemplatesRelations = relations(tournamentTemplates, ({ one, many }) => ({
  user: one(users, {
    fields: [tournamentTemplates.userId],
    references: [users.userPlatformId],
  }),
  tournaments: many(tournaments),
  plannedTournaments: many(plannedTournaments),
  customGroupTemplates: many(customGroupTemplates),
}));

export const weeklyPlansRelations = relations(weeklyPlans, ({ one, many }) => ({
  user: one(users, {
    fields: [weeklyPlans.userId],
    references: [users.userPlatformId],
  }),
  plannedTournaments: many(plannedTournaments),
}));

export const plannedTournamentsRelations = relations(plannedTournaments, ({ one }) => ({
  user: one(users, {
    fields: [plannedTournaments.userId],
    references: [users.userPlatformId],
  }),
  template: one(tournamentTemplates, {
    fields: [plannedTournaments.templateId],
    references: [tournamentTemplates.id],
  }),
}));

export const grindSessionsRelations = relations(grindSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [grindSessions.userId],
    references: [users.userPlatformId],
  }),
  tournaments: many(tournaments),
  preparationLogs: many(preparationLogs),
  breakFeedbacks: many(breakFeedbacks),
  sessionTournaments: many(sessionTournaments),
}));

export const preparationLogsRelations = relations(preparationLogs, ({ one }) => ({
  user: one(users, {
    fields: [preparationLogs.userId],
    references: [users.userPlatformId],
  }),
  session: one(grindSessions, {
    fields: [preparationLogs.sessionId],
    references: [grindSessions.id],
  }),
}));

export const warmupRitualsRelations = relations(warmupRituals, ({ one }) => ({
  user: one(users, {
    fields: [warmupRituals.userId],
    references: [users.userPlatformId],
  }),
  grindSession: one(grindSessions, {
    fields: [warmupRituals.linkedGrindSessionId],
    references: [grindSessions.id],
  }),
}));

export const customGroupsRelations = relations(customGroups, ({ one, many }) => ({
  user: one(users, {
    fields: [customGroups.userId],
    references: [users.userPlatformId],
  }),
  templates: many(customGroupTemplates),
}));

export const customGroupTemplatesRelations = relations(customGroupTemplates, ({ one }) => ({
  group: one(customGroups, {
    fields: [customGroupTemplates.groupId],
    references: [customGroups.id],
  }),
  template: one(tournamentTemplates, {
    fields: [customGroupTemplates.templateId],
    references: [tournamentTemplates.id],
  }),
}));

export const coachingInsightsRelations = relations(coachingInsights, ({ one }) => ({
  user: one(users, {
    fields: [coachingInsights.userId],
    references: [users.userPlatformId],
  }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.userPlatformId],
  }),
}));

// Authentication-related relations already defined above

export const permissionsRelations = relations(permissions, ({ many }) => ({
  userPermissions: many(userPermissions),
}));

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(users, {
    fields: [userPermissions.userId],
    references: [users.userPlatformId],
  }),
  permission: one(permissions, {
    fields: [userPermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const accessLogsRelations = relations(accessLogs, ({ one }) => ({
  user: one(users, {
    fields: [accessLogs.userId],
    references: [users.userPlatformId],
  }),
}));

export const breakFeedbacksRelations = relations(breakFeedbacks, ({ one }) => ({
  user: one(users, {
    fields: [breakFeedbacks.userId],
    references: [users.userPlatformId],
  }),
  session: one(grindSessions, {
    fields: [breakFeedbacks.sessionId],
    references: [grindSessions.id],
  }),
}));

export const sessionTournamentsRelations = relations(sessionTournaments, ({ one }) => ({
  user: one(users, {
    fields: [sessionTournaments.userId],
    references: [users.userPlatformId],
  }),
  session: one(grindSessions, {
    fields: [sessionTournaments.sessionId],
    references: [grindSessions.id],
  }),
  plannedTournament: one(plannedTournaments, {
    fields: [sessionTournaments.plannedTournamentId],
    references: [plannedTournaments.id],
  }),
}));

export const studyCardsRelations = relations(studyCards, ({ one, many }) => ({
  user: one(users, {
    fields: [studyCards.userId],
    references: [users.userPlatformId],
  }),
  materials: many(studyMaterials),
  notes: many(studyNotes),

  sessions: many(studySessions),
}));

export const studyMaterialsRelations = relations(studyMaterials, ({ one }) => ({
  studyCard: one(studyCards, {
    fields: [studyMaterials.studyCardId],
    references: [studyCards.id],
  }),
}));

export const studyNotesRelations = relations(studyNotes, ({ one }) => ({
  studyCard: one(studyCards, {
    fields: [studyNotes.studyCardId],
    references: [studyCards.id],
  }),
}));



export const studySessionsRelations = relations(studySessions, ({ one }) => ({
  user: one(users, {
    fields: [studySessions.userId],
    references: [users.userPlatformId],
  }),
  studyCard: one(studyCards, {
    fields: [studySessions.studyCardId],
    references: [studyCards.id],
  }),
}));

export const activeDaysRelations = relations(activeDays, ({ one }) => ({
  user: one(users, {
    fields: [activeDays.userId],
    references: [users.userPlatformId],
  }),
}));

export const profileStatesRelations = relations(profileStates, ({ one }) => ({
  user: one(users, {
    fields: [profileStates.userId],
    references: [users.userPlatformId],
  }),
}));

export const bugReportsRelations = relations(bugReports, ({ one }) => ({
  user: one(users, {
    fields: [bugReports.userId],
    references: [users.userPlatformId],
  }),
}));

export const uploadHistoryRelations = relations(uploadHistory, ({ one }) => ({
  user: one(users, {
    fields: [uploadHistory.userId],
    references: [users.userPlatformId],
  }),
}));

// Subscription system relations
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.userPlatformId],
  }),
}));

export const userActivityRelations = relations(userActivity, ({ one }) => ({
  user: one(users, {
    fields: [userActivity.userId],
    references: [users.userPlatformId],
  }),
}));

export const engagementMetricsRelations = relations(engagementMetrics, ({ one }) => ({
  user: one(users, {
    fields: [engagementMetrics.userId],
    references: [users.userPlatformId],
  }),
}));

// Zod schemas
export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
});

// Authentication schemas
export const insertPermissionSchema = createInsertSchema(permissions).omit({
  id: true,
  createdAt: true,
});

export const insertUserPermissionSchema = createInsertSchema(userPermissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAccessLogSchema = createInsertSchema(accessLogs).omit({
  id: true,
  createdAt: true,
});

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
  rememberMe: z.boolean().optional(),
});

export const createUserSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  username: z.string().min(3, "Username deve ter pelo menos 3 caracteres"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

// =============================================================================
// Add-on + Re-entry (ADR-014) - shared helpers for Zod refinements
// =============================================================================

// Checks if addOnCost is a positive, non-zero decimal value
function isAddOnCostPositive(v: unknown): boolean {
  if (v == null) return false;
  const num = parseFloat(String(v));
  return !isNaN(num) && num > 0;
}

// Apply the cross-field refinements to an insert schema. These checks are
// applied to session_tournaments and tournaments (instance tables). For
// planned_tournaments and tournament_library, only maxReentries >= 0 applies
// (no addOnTaken/reentries instance fields in those tables).
function applyAddOnReaRefinements(schema: any): any {
  return schema
    .refine(
      (d: any) => !d?.addOnTaken || !!d?.allowsAddOn,
      { message: 'addOnTaken so pode ser true se allowsAddOn for true', path: ['addOnTaken'] }
    )
    .refine(
      (d: any) => !d?.addOnTaken || isAddOnCostPositive(d?.addOnCost),
      { message: 'addOnCost deve ser > 0 quando addOnTaken=true', path: ['addOnCost'] }
    )
    .refine(
      (d: any) => ((d?.reentries ?? 0) as number) === 0 || !!d?.allowsReentry,
      { message: 'reentries > 0 so em torneios com allowsReentry=true', path: ['reentries'] }
    )
    .refine(
      (d: any) => d?.maxReentries == null || ((d?.reentries ?? 0) as number) <= (d.maxReentries as number),
      { message: 'reentries excede max permitido (maxReentries)', path: ['reentries'] }
    )
    .refine(
      (d: any) => d?.maxReentries == null || (d.maxReentries as number) >= 0,
      { message: 'maxReentries nao pode ser negativo', path: ['maxReentries'] }
    )
    .refine(
      (d: any) => ((d?.reentries ?? 0) as number) >= 0,
      { message: 'reentries nao pode ser negativo', path: ['reentries'] }
    );
}

// Shared extension for Add-on / Re-entry fields (used by multiple insert schemas)
const addOnReaFieldsSession = {
  allowsAddOn: z.boolean().optional().default(false),
  addOnCost: z.union([z.string(), z.number()]).nullable().optional()
    .transform((v) => v == null ? null : String(v)),
  addOnTaken: z.boolean().optional().default(false),
  allowsReentry: z.boolean().optional().default(false),
  maxReentries: z.number().int().nullable().optional(),
  reentries: z.union([z.number().int(), z.string().transform((s) => parseInt(s, 10) || 0)]).optional().default(0),
};

// Planned/library variants: no addOnTaken and no reentries (instance-only fields)
const addOnReaFieldsConfig = {
  allowsAddOn: z.boolean().optional().default(false),
  addOnCost: z.union([z.string(), z.number()]).nullable().optional()
    .transform((v) => v == null ? null : String(v)),
  allowsReentry: z.boolean().optional().default(false),
  maxReentries: z.number().int().nullable().optional(),
};

// ---------------------------------------------------------------------------
// Sprint 1 — Tournament Types Extension (ADR-031)
//
// Modelo ortogonal: type primario (mutex 4 valores) + modificadores
// booleanos isFlight/isLive. Refinements abaixo garantem coerencia
// cross-field — campos satellite* so quando type=Satellite, flight* so
// quando isFlight=true, package* so quando isLive=true (ou satelite com
// rewardType=package).
// ---------------------------------------------------------------------------

const FLIGHT_DAY_REGEX = /^(Final|Day\s?\d+|\d+[A-Z]?)$/;

// Helper: detecta se valor decimal-like (string ou number) e nao-nulo/zero/vazio
function isPopulatedDecimal(v: unknown): boolean {
  if (v == null || v === '') return false;
  return true;
}

// Helper: detecta se valor (booleano, string, number, etc) e nao-null/undefined
function isPopulatedField(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '';
}

// Sprint 1: extensoes Zod para os campos novos da tabela tournaments.
const tournamentTypeFieldsExtension = {
  // Tipo primario — validado pelo enum SSoT. Optional+default mantem
  // backwards-compat com payloads legados (CSV upload) que enviam apenas
  // `category` — o storage layer normaliza para 'Vanilla' se faltar via
  // normalizeTournamentTypePayload. Tentativas de enviar valores fora do
  // enum (ex: 'Flight', 'Live') sao SEMPRE rejeitadas.
  type: TournamentPrimaryTypeSchema.optional().default('Vanilla'),
  // Modificadores ortogonais
  isFlight: z.boolean().optional().default(false),
  isLive: z.boolean().optional().default(false),
  // Satellite fields
  satelliteRewardType: SatelliteRewardTypeSchema.nullable().optional(),
  satelliteTicketValue: z.union([z.string(), z.number()]).nullable().optional()
    .transform((v) => v == null ? null : String(v)),
  satelliteTargetTemplateId: z.string().nullable().optional(),
  satelliteTargetName: z.string().nullable().optional(),
  satelliteExtraCash: z.union([z.string(), z.number()]).nullable().optional()
    .transform((v) => v == null ? null : String(v)),
  enteredViaSatellite: z.boolean().optional().default(false),
  // Flight fields
  flightDay: z.string().nullable().optional(),
  flightParentId: z.string().nullable().optional(),
  flightAdvanced: z.boolean().nullable().optional(),
  // Package fields (so quando isLive=true ou satellite rewardType=package)
  packageBuyIn: z.union([z.string(), z.number()]).nullable().optional()
    .transform((v) => v == null ? null : String(v)),
  packageAccommodation: z.union([z.string(), z.number()]).nullable().optional()
    .transform((v) => v == null ? null : String(v)),
  packageTravel: z.union([z.string(), z.number()]).nullable().optional()
    .transform((v) => v == null ? null : String(v)),
  packageMeals: z.union([z.string(), z.number()]).nullable().optional()
    .transform((v) => v == null ? null : String(v)),
  packageOther: z.union([z.string(), z.number()]).nullable().optional()
    .transform((v) => v == null ? null : String(v)),
  packageNotes: z.string().nullable().optional(),
};

// Sprint 1: aplica os refinements ortogonais ao schema (type/isFlight/isLive).
// Returns a Zod schema with `superRefine` chained — agnostic ao tipo do schema.
function applyOrthogonalRefinements(schema: any): any {
  return schema.superRefine((d: any, ctx: any) => {
    const type = d?.type;
    const isFlight = d?.isFlight === true;
    const isLive = d?.isLive === true;
    const isSatelliteType = type === 'Satellite';

    // ---- Refinement 1: campos satellite* so quando type=Satellite ----
    const satelliteFields = [
      'satelliteRewardType',
      'satelliteTicketValue',
      'satelliteTargetTemplateId',
      'satelliteTargetName',
      'satelliteExtraCash',
    ] as const;
    if (!isSatelliteType) {
      for (const f of satelliteFields) {
        if (isPopulatedField(d?.[f])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [f],
            message: `Campo ${f} so e permitido quando type=Satellite`,
          });
        }
      }
    } else {
      // type === 'Satellite' — exige rewardType e (template OR name)
      if (!isPopulatedField(d?.satelliteRewardType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['satelliteRewardType'],
          message: 'satelliteRewardType e obrigatorio quando type=Satellite',
        });
      }
      const hasTarget =
        isPopulatedField(d?.satelliteTargetTemplateId) ||
        isPopulatedField(d?.satelliteTargetName);
      if (!hasTarget) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['satelliteTargetName'],
          message:
            'Informe satelliteTargetTemplateId ou satelliteTargetName quando type=Satellite',
        });
      }
    }

    // ---- Refinement 2: campos flight* so quando isFlight=true ----
    const flightFieldsAll = ['flightDay', 'flightParentId', 'flightAdvanced'] as const;
    if (!isFlight) {
      for (const f of flightFieldsAll) {
        if (isPopulatedField(d?.[f])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [f],
            message: `Campo ${f} so e permitido quando isFlight=true`,
          });
        }
      }
    } else {
      // isFlight=true — flightDay e obrigatorio + regex valido
      if (!isPopulatedField(d?.flightDay)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['flightDay'],
          message: 'flightDay e obrigatorio quando isFlight=true',
        });
      } else if (!FLIGHT_DAY_REGEX.test(String(d.flightDay))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['flightDay'],
          message:
            'flightDay invalido (use formatos como "1A", "Day 1", "2", "Final")',
        });
      } else {
        // flightDay valido — valida coerencia com flightAdvanced/position
        const flightDay = String(d.flightDay);
        const isDayLetterPattern = /^\d+[A-Z]$/.test(flightDay);
        const isFinal = flightDay === 'Final';

        // Day letter pattern (1A, 1B, ...) — flightAdvanced e obrigatorio (boolean)
        if (isDayLetterPattern) {
          if (typeof d?.flightAdvanced !== 'boolean') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['flightAdvanced'],
              message: 'flightAdvanced e obrigatorio quando flightDay e formato "Day 1A/B/C"',
            });
          }
        }

        // Day Final — position e obrigatorio
        if (isFinal) {
          if (d?.position == null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['position'],
              message: 'position e obrigatorio quando flightDay=Final',
            });
          }
        }
      }
    }

    // ---- Refinement 3: campos package* so quando isLive=true OU satellite rewardType=package ----
    const packageFields = [
      'packageBuyIn',
      'packageAccommodation',
      'packageTravel',
      'packageMeals',
      'packageOther',
      'packageNotes',
    ] as const;
    const allowPackages =
      isLive || (isSatelliteType && d?.satelliteRewardType === 'package');
    if (!allowPackages) {
      for (const f of packageFields) {
        if (isPopulatedField(d?.[f])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [f],
            message: `Campo ${f} so e permitido quando isLive=true ou satelite com rewardType=package`,
          });
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------

export const insertTournamentSchemaBase = createInsertSchema(tournaments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  ...addOnReaFieldsSession,
  ...tournamentTypeFieldsExtension,
});

export const insertTournamentSchema = applyOrthogonalRefinements(
  applyAddOnReaRefinements(insertTournamentSchemaBase)
);

export const insertTournamentTemplateSchema = createInsertSchema(tournamentTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Sprint 1: extensoes Zod para os campos novos da tabela planned_tournaments.
// Subset dos campos de tournaments — planned nao tem package/satelliteExtraCash/
// satelliteTargetTemplateId/satelliteRewardType nem package* (planejamento mais
// simples; resultados live ficam em tournaments).
const plannedTypeFieldsExtension = {
  type: TournamentPrimaryTypeSchema,
  isFlight: z.boolean().optional().default(false),
  isLive: z.boolean().optional().default(false),
  flightDay: z.string().nullable().optional(),
  flightParentId: z.string().nullable().optional(),
  satelliteRewardType: SatelliteRewardTypeSchema.nullable().optional(),
  satelliteTicketValue: z.union([z.string(), z.number()]).nullable().optional()
    .transform((v) => v == null ? null : String(v)),
  satelliteTargetName: z.string().nullable().optional(),
};

// Refinements ortogonais para planned (subset do tournaments — sem package*
// nem flightAdvanced obrigatorio porque planned e um placeholder, nao um
// resultado).
function applyPlannedOrthogonalRefinements(schema: any): any {
  return schema.superRefine((d: any, ctx: any) => {
    const type = d?.type;
    const isFlight = d?.isFlight === true;
    const isSatelliteType = type === 'Satellite';

    // Satellite ortogonalidade
    const satelliteFields = [
      'satelliteRewardType',
      'satelliteTicketValue',
      'satelliteTargetName',
    ] as const;
    if (!isSatelliteType) {
      for (const f of satelliteFields) {
        if (isPopulatedField(d?.[f])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [f],
            message: `Campo ${f} so e permitido quando type=Satellite`,
          });
        }
      }
    } else {
      if (!isPopulatedField(d?.satelliteRewardType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['satelliteRewardType'],
          message: 'satelliteRewardType e obrigatorio quando type=Satellite',
        });
      }
      if (!isPopulatedField(d?.satelliteTargetName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['satelliteTargetName'],
          message: 'satelliteTargetName e obrigatorio quando type=Satellite (planned)',
        });
      }
    }

    // Flight ortogonalidade
    const flightFieldsAll = ['flightDay', 'flightParentId'] as const;
    if (!isFlight) {
      for (const f of flightFieldsAll) {
        if (isPopulatedField(d?.[f])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [f],
            message: `Campo ${f} so e permitido quando isFlight=true`,
          });
        }
      }
    } else {
      if (!isPopulatedField(d?.flightDay)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['flightDay'],
          message: 'flightDay e obrigatorio quando isFlight=true',
        });
      } else if (!FLIGHT_DAY_REGEX.test(String(d.flightDay))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['flightDay'],
          message: 'flightDay invalido',
        });
      }
    }
  });
}

export const insertPlannedTournamentSchemaBase = createInsertSchema(plannedTournaments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startTime: z.string().optional().transform((str) => str ? new Date(str) : undefined),
  // Sprint 1 RF-01: time validado via regex HH:MM no backend (alinhado ao
  // schema do form RHF — espelha a regra que ja era validada so no front).
  // Relaxado para aceitar segundos opcionais (:SS) para compatibilidade com alguns browsers.
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/, 'Horario invalido (use HH:MM)'),
  // Sprint 1 RF-01: dayOfWeek validado em [0,6]
  dayOfWeek: z.number().int().min(0).max(6),
  lateRegMinutes: z.number().int().min(0).max(999).nullable().optional(),
  startingStack: z.number().int().min(1).nullable().optional(),
  maxPlayers: z.number().int().min(1).nullable().optional(),
  // Sprint 1 RF-01: tolera gameType='' (legacy form fallback) — converte para null.
  // EditDialog antigo enviava '' quando user nao selecionava NLH/PLO; rejeitar
  // ali era 400 ruidoso. Mantem rejeicao de "INVALID"/"PLO5"/qualquer string nao-enum.
  // Nota: isso muda o comportamento previo (suprema-schemas-enriched.test.ts:211
  // espera rejeicao). Esse teste reflete o comportamento LEGADO; a spec do Sprint 1
  // explicitamente relaxa esse contrato.
  gameType: z.preprocess(
    (v) => (v === '' ? null : v),
    z.enum(['NLH', 'PLO']).nullable().optional()
  ),
  blindLevelMinutes: z.number().int().nullable().optional(),
  alertMinutesBefore: z.number().int().min(1).max(120).nullable().optional(),
  ...addOnReaFieldsConfig,
  ...plannedTypeFieldsExtension,
});

export const insertPlannedTournamentSchema = applyPlannedOrthogonalRefinements(
  insertPlannedTournamentSchemaBase.refine(
    (d: any) => d?.maxReentries == null || (d.maxReentries as number) >= 0,
    { message: 'maxReentries nao pode ser negativo', path: ['maxReentries'] }
  )
);

export const insertWeeklyPlanSchema = createInsertSchema(weeklyPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGrindSessionSchema = createInsertSchema(grindSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  date: z.string().transform((str) => new Date(str)),
  endTime: z.string().optional().transform((str) => str ? new Date(str) : undefined),
  startTime: z.string().optional().transform((str) => str ? new Date(str) : undefined),
});

export const insertPreparationLogSchema = createInsertSchema(preparationLogs).omit({
  id: true,
  createdAt: true,
}).extend({
  focusLevel: z.number().int().min(1).max(10),
  confidenceLevel: z.number().int().min(1).max(10),
  notes: z.string().max(200).nullable().optional(),
});

export const insertCustomGroupSchema = createInsertSchema(customGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCoachingInsightSchema = createInsertSchema(coachingInsights).omit({
  id: true,
  createdAt: true,
});

const _insertUserSettingsSchemaBase = createInsertSchema(userSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertUserSettingsSchema = _insertUserSettingsSchemaBase.extend({
  exchangeRates: z.record(z.string(), z.number()).optional(),
  lateRegAlertMinutes: z.number().int().min(1).max(120).optional(),
  gradeStartHour: z.number().int().min(0).max(23).optional(),
  gradeEndHour: z.number().int().min(0).max(23).optional(),
  // Bankroll Module (Q8): aceita string decimal ou number; sempre normaliza para string nao-negativa
  bankrollAmount: z.union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((v) => v == null ? v : String(v))
    .refine((v) => v == null || parseFloat(v) >= 0, { message: 'bankrollAmount nao pode ser negativo' }),
  bankrollRule: z.string().optional(),
  // Sprint W-1: heuristicas semanais — tuple de exatamente 3 strings, cada uma trim+max 280 chars
  weeklyHeuristics: z
    .union([
      z.tuple([
        z.string().trim().min(1).max(280),
        z.string().trim().min(1).max(280),
        z.string().trim().min(1).max(280),
      ]),
      z.null(),
    ])
    .optional(),
  drillUrl: z.string().max(500).optional(),
});

export const insertBreakFeedbackSchema = createInsertSchema(breakFeedbacks).omit({
  id: true,
  createdAt: true,
}).extend({
  foco: z.number().int().min(0).max(10),
  energia: z.number().int().min(0).max(10),
  confianca: z.number().int().min(0).max(10),
  inteligenciaEmocional: z.number().int().min(0).max(10),
  interferencias: z.number().int().min(0).max(10),
});

export const insertSessionTournamentSchemaBase = createInsertSchema(sessionTournaments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  fieldSize: z.union([z.number(), z.string().transform(Number), z.null()]).optional(),
  position: z.union([z.number(), z.string().transform(Number), z.null()]).optional(),
  rebuys: z.union([z.number(), z.string().transform(Number)]).default(0),
  startTime: z.union([z.string(), z.date(), z.null()]).optional(),
  endTime: z.union([z.string(), z.date(), z.null()]).optional(),
  lateRegMinutes: z.number().int().min(0).max(999).nullable().optional(),
  startingStack: z.number().int().min(1).nullable().optional(),
  maxPlayers: z.number().int().min(1).nullable().optional(),
  gameType: z.enum(['NLH', 'PLO']).nullable().optional(),
  blindLevelMinutes: z.number().int().nullable().optional(),
  alertMinutesBefore: z.number().int().min(1).max(120).nullable().optional(),
  ...addOnReaFieldsSession,
});

export const insertSessionTournamentSchema = applyAddOnReaRefinements(insertSessionTournamentSchemaBase);

export const insertStudyCardSchema = createInsertSchema(studyCards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStudyMaterialSchema = createInsertSchema(studyMaterials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStudyNoteSchema = createInsertSchema(studyNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});



export const insertStudySessionSchema = createInsertSchema(studySessions).omit({
  id: true,
  createdAt: true,
});

export const insertActiveDaySchema = createInsertSchema(activeDays).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBugReportSchema = createInsertSchema(bugReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUploadHistorySchema = createInsertSchema(uploadHistory).omit({
  id: true,
  createdAt: true,
  uploadDate: true,
});

export const insertProfileStateSchema = createInsertSchema(profileStates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  activeProfile: z.enum(['A', 'B', 'C', 'OFF']).nullable().optional(),
});

export const insertUserActivitySchema = createInsertSchema(userActivity).omit({
  id: true,
  createdAt: true,
});

export const insertAnalyticsDailySchema = createInsertSchema(analyticsDaily).omit({
  id: true,
  createdAt: true,
});

// Subscription system schemas
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});


export const insertEngagementMetricsSchema = createInsertSchema(engagementMetrics).omit({
  id: true,
  updatedAt: true,
});

// === Warmup Sprint W-1 ===

const sessionIntentionZod = z.object({
  focus: z.string().trim().min(1).max(200),
  tiltPlan: z.string().trim().min(1).max(200),
  stopCriteria: z.string().trim().min(1).max(200),
});

const blocksCompletedZod = z
  .array(z.object({
    blockId: z.number().int().min(1).max(5),
    startedAt: z.string(),
    completedAt: z.string(),
    durationSeconds: z.number().int().min(0),
  }).passthrough())
  .max(5);

const _insertWarmupRitualBase = createInsertSchema(warmupRituals).omit({
  id: true,
  createdAt: true,
});

export const insertWarmupRitualSchema = _insertWarmupRitualBase.extend({
  startedAt: z.union([z.string(), z.date()]).transform((v) =>
    v instanceof Date ? v : new Date(v),
  ),
  completedAt: z
    .union([z.string(), z.date(), z.null()])
    .nullable()
    .optional()
    .transform((v) => {
      if (v == null) return null;
      return v instanceof Date ? v : new Date(v);
    }),
  version: z.enum(["full", "aborted"]),
  emotionalCheckScore: z.number().int().min(0).max(10).nullable().optional(),
  decisionToPlay: z.boolean().nullable().optional(),
  overrideUsed: z.boolean().default(false),
  blocksCompleted: blocksCompletedZod.default([]),
  sessionIntention: sessionIntentionZod.nullable().optional(),
  linkedGrindSessionId: z.string().nullable().optional(),
  durationMinutes: z.number().int().min(0).max(60).nullable().optional(),
});

export type WarmupRitual = typeof warmupRituals.$inferSelect;
export type InsertWarmupRitual = z.infer<typeof insertWarmupRitualSchema>;

// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type TournamentTemplate = typeof tournamentTemplates.$inferSelect;
export type InsertTournamentTemplate = z.infer<typeof insertTournamentTemplateSchema>;
export type PlannedTournament = typeof plannedTournaments.$inferSelect;
export type InsertPlannedTournament = z.infer<typeof insertPlannedTournamentSchema>;
export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
export type InsertWeeklyPlan = z.infer<typeof insertWeeklyPlanSchema>;
export type GrindSession = typeof grindSessions.$inferSelect;
export type InsertGrindSession = z.infer<typeof insertGrindSessionSchema>;
export type PreparationLog = typeof preparationLogs.$inferSelect;
export type InsertPreparationLog = z.infer<typeof insertPreparationLogSchema>;
export type CustomGroup = typeof customGroups.$inferSelect;
export type InsertCustomGroup = z.infer<typeof insertCustomGroupSchema>;
export type CoachingInsight = typeof coachingInsights.$inferSelect;
export type InsertCoachingInsight = z.infer<typeof insertCoachingInsightSchema>;
export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type BreakFeedback = typeof breakFeedbacks.$inferSelect;
export type InsertBreakFeedback = z.infer<typeof insertBreakFeedbackSchema>;
export type SessionTournament = typeof sessionTournaments.$inferSelect;
export type InsertSessionTournament = z.infer<typeof insertSessionTournamentSchema>;
export type StudyCard = typeof studyCards.$inferSelect;
export type InsertStudyCard = z.infer<typeof insertStudyCardSchema>;
export type StudyMaterial = typeof studyMaterials.$inferSelect;
export type InsertStudyMaterial = z.infer<typeof insertStudyMaterialSchema>;
export type StudyNote = typeof studyNotes.$inferSelect;
export type InsertStudyNote = z.infer<typeof insertStudyNoteSchema>;

export type StudySession = typeof studySessions.$inferSelect;
export type InsertStudySession = z.infer<typeof insertStudySessionSchema>;

export type ActiveDay = typeof activeDays.$inferSelect;
export type InsertActiveDay = z.infer<typeof insertActiveDaySchema>;

export type BugReport = typeof bugReports.$inferSelect;
export type InsertBugReport = z.infer<typeof insertBugReportSchema>;

export type UploadHistory = typeof uploadHistory.$inferSelect;
export type InsertUploadHistory = z.infer<typeof insertUploadHistorySchema>;

export type ProfileState = typeof profileStates.$inferSelect;
export type InsertProfileState = z.infer<typeof insertProfileStateSchema>;

// Calendário Inteligente Tables
export const weeklyRoutines = pgTable("weekly_routines", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  weekStart: timestamp("week_start").notNull(),
  blocks: jsonb("blocks").notNull().default("[]"),
  conflicts: jsonb("conflicts").notNull().default("[]"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  isAutoGenerated: boolean("is_auto_generated").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Categorias Customizáveis
export const calendarCategories = pgTable("calendar_categories", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  color: varchar("color").notNull(), // hex color
  icon: varchar("icon"), // lucide icon name
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Compromissos do Calendário
export const calendarEvents = pgTable("calendar_events", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  categoryId: varchar("category_id").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0-6
  
  // Sistema de Recorrência
  recurrenceType: varchar("recurrence_type").notNull().default("none"), // none, daily, weekly
  recurrencePattern: jsonb("recurrence_pattern"), // para padrões complexos
  parentEventId: varchar("parent_event_id"), // para eventos filhos de uma série
  isRecurring: boolean("is_recurring").default(false),
  
  // Metadados
  source: varchar("source").default("manual"), // manual, grade, studies
  metadata: jsonb("metadata"), // dados específicos do tipo
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const studySchedules = pgTable("study_schedules", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  studyCardId: varchar("study_card_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: varchar("start_time").notNull(),
  duration: integer("duration").notNull(), // em minutos
  description: text("description"),
  isRecurring: boolean("is_recurring").default(false),
  weeklyFrequency: integer("weekly_frequency").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas for new tables
export const insertWeeklyRoutineSchema = createInsertSchema(weeklyRoutines);
export const insertStudyScheduleSchema = createInsertSchema(studySchedules);
export const insertCalendarCategorySchema = createInsertSchema(calendarCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Relations for new tables
export const weeklyRoutinesRelations = relations(weeklyRoutines, ({ one }) => ({
  user: one(users, {
    fields: [weeklyRoutines.userId],
    references: [users.userPlatformId],
  }),
}));

export const studySchedulesRelations = relations(studySchedules, ({ one }) => ({
  user: one(users, {
    fields: [studySchedules.userId],
    references: [users.userPlatformId],
  }),
  studyCard: one(studyCards, {
    fields: [studySchedules.studyCardId],
    references: [studyCards.id],
  }),
}));

export const calendarCategoriesRelations = relations(calendarCategories, ({ one, many }) => ({
  user: one(users, {
    fields: [calendarCategories.userId],
    references: [users.userPlatformId],
  }),
  events: many(calendarEvents),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  user: one(users, {
    fields: [calendarEvents.userId],
    references: [users.userPlatformId],
  }),
  category: one(calendarCategories, {
    fields: [calendarEvents.categoryId],
    references: [calendarCategories.id],
  }),
  parentEvent: one(calendarEvents, {
    fields: [calendarEvents.parentEventId],
    references: [calendarEvents.id],
  }),
}));

// Subscription plans table
export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id").primaryKey().notNull(),
  name: varchar("name").notNull(), // Básico, Premium, Pro, Custom
  description: text("description"),
  permissions: text("permissions").array(), // Array of permission IDs
  durationDays: integer("duration_days").default(30),
  price: decimal("price", { precision: 10, scale: 2 }),
  currency: varchar("currency").default("USD"),
  isActive: boolean("is_active").default(true),
  features: text("features").array(),
  stripePriceIdMonthly: varchar("stripe_price_id_monthly"),
  stripePriceIdAnnual: varchar("stripe_price_id_annual"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User subscriptions table
export const userSubscriptions = pgTable("user_subscriptions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  planId: varchar("plan_id").notNull().references(() => subscriptionPlans.id),
  status: varchar("status").default("active"), // active, expired, cancelled, pending
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  autoRenew: boolean("auto_renew").default(false),
  paymentMethod: varchar("payment_method"), // stripe, manual, etc
  paymentId: varchar("payment_id"), // External payment reference
  metadata: jsonb("metadata"), // Additional data for payment gateway
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas for subscription tables
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Relations for subscription tables
export const subscriptionPlansRelations = relations(subscriptionPlans, ({ many }) => ({
  userSubscriptions: many(userSubscriptions),
}));

export const userSubscriptionsRelations = relations(userSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [userSubscriptions.userId],
    references: [users.userPlatformId],
  }),
  plan: one(subscriptionPlans, {
    fields: [userSubscriptions.planId],
    references: [subscriptionPlans.id],
  }),
}));

// Types for new tables
export type WeeklyRoutine = typeof weeklyRoutines.$inferSelect;
export type InsertWeeklyRoutine = z.infer<typeof insertWeeklyRoutineSchema>;
export type StudySchedule = typeof studySchedules.$inferSelect;
export type InsertStudySchedule = z.infer<typeof insertStudyScheduleSchema>;
export type CalendarCategory = typeof calendarCategories.$inferSelect;
export type InsertCalendarCategory = z.infer<typeof insertCalendarCategorySchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type InsertUserSubscription = z.infer<typeof insertUserSubscriptionSchema>;

// Subscription system types
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type UserActivity = typeof userActivity.$inferSelect;
export type InsertUserActivity = z.infer<typeof insertUserActivitySchema>;
export type EngagementMetrics = typeof engagementMetrics.$inferSelect;
export type InsertEngagementMetrics = z.infer<typeof insertEngagementMetricsSchema>;

// Authentication schemas
export const registerSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Senhas não coincidem",
  path: ["confirmPassword"],
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token é obrigatório"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Senhas não coincidem",
  path: ["confirmPassword"],
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Token é obrigatório"),
});

// User update schema
export const updateUserSchema = z.object({
  email: z.string().email("Email inválido").optional(),
  username: z.string().min(2, "Username deve ter pelo menos 2 caracteres").optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  status: z.enum(["active", "inactive", "blocked"]).optional(),
  subscriptionPlan: z.enum(["trial", "active", "expired", "admin"]).optional(),
  permissions: z.array(z.string()).optional(),
});

// Authentication types
export type RegisterData = z.infer<typeof registerSchema>;
export type LoginData = z.infer<typeof loginSchema>;
export type ForgotPasswordData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordData = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailData = z.infer<typeof verifyEmailSchema>;
export type CreateUserData = z.infer<typeof createUserSchema>;
export type UpdateUserData = z.infer<typeof updateUserSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Auth tokens schemas and types
export const insertAuthTokenSchema = createInsertSchema(authTokens).omit({
  id: true,
  createdAt: true,
});
export type AuthToken = typeof authTokens.$inferSelect;
export type InsertAuthToken = z.infer<typeof insertAuthTokenSchema>;

// Study Themes - organized knowledge by poker topic
export const studyThemes = pgTable("study_themes", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  color: varchar("color", { length: 7 }).default("#16a34a"),
  emoji: varchar("emoji", { length: 4 }).default(""),
  isFavorite: boolean("is_favorite").default(false),
  sortOrder: integer("sort_order").default(0),
  progress: integer("progress").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Study Tabs - sections within a theme (Flop, Turn, River, Tendencias, custom)
export const studyTabs = pgTable("study_tabs", {
  id: varchar("id").primaryKey().notNull(),
  themeId: varchar("theme_id").notNull().references(() => studyThemes.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 30 }).notNull(),
  content: jsonb("content").default([]),
  boards: jsonb("boards").default([]),
  ranges: jsonb("ranges").default([]),
  handNotes: jsonb("hand_notes").default([]),
  tags: text("tags").array().default([]),
  isDefault: boolean("is_default").default(false),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Study Themes schemas and types
export const insertStudyThemeSchema = createInsertSchema(studyThemes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type StudyTheme = typeof studyThemes.$inferSelect;
export type InsertStudyTheme = z.infer<typeof insertStudyThemeSchema>;

export const insertStudyTabSchema = createInsertSchema(studyTabs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type StudyTab = typeof studyTabs.$inferSelect;
export type InsertStudyTab = z.infer<typeof insertStudyTabSchema>;

// Tournament Library - curated list of tournaments for grade planning
export const tournamentLibrary = pgTable("tournament_library", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  site: varchar("site").notNull(),
  buyIn: decimal("buy_in").notNull(),
  guaranteed: decimal("guaranteed"),
  time: varchar("time"),
  type: varchar("type"), // PKO, Vanilla, Mystery
  speed: varchar("speed"), // Normal, Turbo, Hyper
  fieldSize: integer("field_size"),
  source: varchar("source").default("manual"), // manual, suprema, grind-live
  externalId: varchar("external_id"),
  deletedAt: timestamp("deleted_at"),
  // Tournament Selector (RF-04/RF-05): dayOfWeek explicito permite scoring no widget e na biblioteca
  dayOfWeek: integer("day_of_week"), // 0=Sunday..6=Saturday, nullable
  // Currency da entry (default USD; necessaria para CRITICAL #7 — bankroll filter normaliza moeda)
  currency: varchar("currency").default("USD"),
  // Add-on + Re-entry (ADR-014)
  allowsAddOn: boolean("allows_addon").default(false),
  addOnCost: decimal("addon_cost"),
  allowsReentry: boolean("allows_reentry").default(false),
  maxReentries: integer("max_reentries"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tournament Library Settings - per-user settings for library/suprema integration
export const tournamentLibrarySettings = pgTable("tournament_library_settings", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").unique().notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  autoImportSuprema: boolean("auto_import_suprema").default(false),
  lastSupremaSync: timestamp("last_suprema_sync"),
  lastSupremaSyncStatus: varchar("last_suprema_sync_status"), // success, error
  createdAt: timestamp("created_at").defaultNow(),
});

// Tournament Library schemas
export const insertTournamentLibrarySchemaBase = createInsertSchema(tournamentLibrary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1),
  buyIn: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }),
  source: z.enum(['manual', 'suprema', 'grind-live']).optional(),
  type: z.enum(['PKO', 'Vanilla', 'Mystery']).nullable().optional(),
  speed: z.enum(['Normal', 'Turbo', 'Hyper']).nullable().optional(),
  deletedAt: z.date().nullable().optional(),
  externalId: z.string().nullable().optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  currency: z.string().default('USD').optional(),
  ...addOnReaFieldsConfig,
});

// Library/planned tables do not have addOnTaken or reentries (instance-only).
// We strip unknown keys (default .strip()) and add a maxReentries check.
export const insertTournamentLibrarySchema = insertTournamentLibrarySchemaBase.refine(
  (d: any) => d?.maxReentries == null || (d.maxReentries as number) >= 0,
  { message: 'maxReentries nao pode ser negativo', path: ['maxReentries'] }
);

export const insertTournamentLibrarySettingsSchema = createInsertSchema(tournamentLibrarySettings).omit({
  id: true,
  createdAt: true,
}).extend({
  lastSupremaSyncStatus: z.enum(['success', 'error']).nullable().optional(),
});

// Tournament Library types
export type TournamentLibrary = typeof tournamentLibrary.$inferSelect;
export type InsertTournamentLibrary = z.infer<typeof insertTournamentLibrarySchema>;
export type TournamentLibrarySettings = typeof tournamentLibrarySettings.$inferSelect;
export type InsertTournamentLibrarySettings = z.infer<typeof insertTournamentLibrarySettingsSchema>;

// =============================================================================
// AI Coach tables
// =============================================================================

export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  coachType: varchar("coach_type").notNull(), // mental, tournament, technical
  title: varchar("title"),
  status: varchar("status").default("active"), // active, archived, deleted
  summary: text("summary"),
  tokenCount: integer("token_count").default(0),
  messageCount: integer("message_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_chat_sessions_user_coach").on(table.userId, table.coachType),
  index("idx_chat_sessions_status").on(table.status),
]);

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().notNull(),
  sessionId: varchar("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  role: varchar("role").notNull(), // user, assistant
  content: text("content").notNull(),
  tokenCount: integer("token_count").default(0),
  metadata: jsonb("metadata"),
  // Sprint Coach-1 / RF-01 — Telemetria de tokens e caching (nullable para retrocompat)
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  cacheCreationInputTokens: integer("cache_creation_input_tokens"),
  cacheReadInputTokens: integer("cache_read_input_tokens"),
  model: varchar("model", { length: 100 }),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_chat_messages_session").on(table.sessionId),
  index("idx_chat_messages_created").on(table.createdAt),
  // Sprint Coach-1 — acelera listagem cronologica + rate limit rolling
  index("idx_chat_messages_session_created").on(table.sessionId, table.createdAt),
  index("idx_chat_messages_role_created").on(table.role, table.createdAt),
]);

// =============================================================================
// Sprint Coach-1 / RF-02 — Message Feedback (thumbs up/down + citations)
// UNIQUE(messageId, userId): um feedback ativo por par usuario-mensagem.
// =============================================================================
export const messageFeedback = pgTable("message_feedback", {
  id: varchar("id").primaryKey().notNull(),
  messageId: varchar("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  feedback: varchar("feedback", { length: 10 }).notNull(), // 'up' | 'down'
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("uniq_message_feedback_user_message").on(table.messageId, table.userId),
  index("idx_message_feedback_message").on(table.messageId),
  index("idx_message_feedback_user_created").on(table.userId, table.createdAt),
  index("idx_message_feedback_feedback_created").on(table.feedback, table.createdAt),
]);

export const userAiProfile = pgTable("user_ai_profile", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").unique().notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  content: text("content").default(""),
  version: integer("version").default(1),
  tokenCount: integer("token_count").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const monthlyCoachSummaries = pgTable("monthly_coach_summaries", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  coachType: varchar("coach_type").notNull(),
  month: varchar("month").notNull(), // YYYY-MM
  summary: text("summary").notNull(),
  sessionsCompacted: integer("sessions_compacted").default(0),
  tokenCount: integer("token_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_monthly_summaries_user_coach_month").on(table.userId, table.coachType, table.month),
]);

// AI Coach insert schemas
const coachTypeEnum = z.enum(["mental", "tournament", "technical"]);
const sessionStatusEnum = z.enum(["active", "archived", "deleted"]);
const messageRoleEnum = z.enum(["user", "assistant"]);

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  coachType: coachTypeEnum,
  status: sessionStatusEnum.optional(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
}).extend({
  role: messageRoleEnum,
  content: z.string().min(1),
});

export const insertUserAiProfileSchema = createInsertSchema(userAiProfile).omit({
  id: true,
  updatedAt: true,
}).extend({
  content: z.string().max(2000).optional(),
  version: z.number().int().optional(),
  tokenCount: z.number().int().optional(),
});

export const insertMonthlyCoachSummarySchema = createInsertSchema(monthlyCoachSummaries).omit({
  id: true,
  createdAt: true,
}).extend({
  coachType: coachTypeEnum,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Formato deve ser YYYY-MM"),
  summary: z.string().min(1),
  sessionsCompacted: z.number().int().optional(),
  tokenCount: z.number().int().optional(),
});

// Chat message request schema (endpoint validation)
export const chatMessageRequestSchema = z.object({
  coachType: coachTypeEnum,
  message: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
});

// Sprint Coach-1 / RF-02 — message feedback schemas
export const insertMessageFeedbackSchema = createInsertSchema(messageFeedback).omit({
  id: true,
  createdAt: true,
}).extend({
  feedback: z.enum(['up', 'down']),
  comment: z.string().max(500).optional().nullable(),
});

// AI Coach types
export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type UserAiProfile = typeof userAiProfile.$inferSelect;
export type InsertUserAiProfile = z.infer<typeof insertUserAiProfileSchema>;
export type MonthlyCoachSummary = typeof monthlyCoachSummaries.$inferSelect;
export type InsertMonthlyCoachSummary = z.infer<typeof insertMonthlyCoachSummarySchema>;
export type MessageFeedback = typeof messageFeedback.$inferSelect;
export type InsertMessageFeedback = z.infer<typeof insertMessageFeedbackSchema>;

// =============================================================================
// Tournament Selector Logs (RF-07)
// Telemetria do Selector: view (cada chamada) e add_to_grid (cada add via Selector).
// =============================================================================
export const tournamentSelectorLogs = pgTable("tournament_selector_logs", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  eventType: varchar("event_type").notNull(), // "view" | "add_to_grid"
  tournamentExternalId: varchar("tournament_external_id"),
  score: integer("score"),
  grade: varchar("grade"),
  confidence: varchar("confidence"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_tsl_user_created").on(table.userId, table.createdAt),
  index("idx_tsl_event_created").on(table.eventType, table.createdAt),
]);

const _insertTournamentSelectorLogSchemaBase = createInsertSchema(tournamentSelectorLogs).omit({
  id: true,
  createdAt: true,
});
export const insertTournamentSelectorLogSchema = _insertTournamentSelectorLogSchemaBase.extend({
  eventType: z.enum(["view", "add_to_grid"]),
  grade: z.enum(["S", "A", "B", "C", "D"]).nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]).nullable().optional(),
  score: z.number().int().min(0).max(100).nullable().optional(),
  tournamentExternalId: z.string().nullable().optional(),
  metadata: z.any().nullable().optional(),
});

export type TournamentSelectorLog = typeof tournamentSelectorLogs.$inferSelect;
export type InsertTournamentSelectorLog = z.infer<typeof insertTournamentSelectorLogSchema>;

// =============================================================================
// Bankroll Snapshots (Sprint 2 - Bankroll Module)
// Fonte: docs/specs/bankroll-management.md (RF-05, RF-11)
//        docs/architecture/decisions/017-bankroll-snapshot-vs-derived.md
//
// Cada mutacao de banca (initial, deposit, withdrawal, session_result,
// manual_adjustment) gera um snapshot auditavel com previousAmount, newAmount e
// delta (sempre != 0). user_settings.bankroll_amount espelha o ultimo newAmount.
// =============================================================================
export const bankrollSnapshots = pgTable("bankroll_snapshots", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  delta: decimal("delta").notNull(),
  previousAmount: decimal("previous_amount").notNull(),
  newAmount: decimal("new_amount").notNull(),
  reason: varchar("reason").notNull(), // initial | deposit | withdrawal | session_result | manual_adjustment
  note: text("note"),
  source: varchar("source").notNull().default("manual"), // manual | auto_session | auto_import
  sessionId: varchar("session_id"), // FK grind_sessions, opcional (reservado p/ auto_session)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_bankroll_snapshots_user_occurred").on(table.userId, table.occurredAt),
  index("idx_bankroll_snapshots_user_reason").on(table.userId, table.reason),
]);

const BANKROLL_REASON_ENUM = z.enum([
  "initial",
  "deposit",
  "withdrawal",
  "session_result",
  "manual_adjustment",
]);
const BANKROLL_SOURCE_ENUM = z.enum(["manual", "auto_session", "auto_import"]);

export const insertBankrollSnapshotSchema = z.object({
  userId: z.string().min(1),
  // delta: string decimal ou number; precisa ser != 0
  delta: z.union([z.string(), z.number()])
    .refine((v) => {
      const n = typeof v === "string" ? parseFloat(v) : v;
      return !Number.isNaN(n) && n !== 0;
    }, { message: "delta nao pode ser zero" }),
  previousAmount: z.union([z.string(), z.number()]),
  newAmount: z.union([z.string(), z.number()]),
  reason: BANKROLL_REASON_ENUM,
  note: z.string().max(500, "note tem limite de 500 caracteres").nullable().optional(),
  source: BANKROLL_SOURCE_ENUM.optional(),
  sessionId: z.string().nullable().optional(),
  occurredAt: z.union([z.date(), z.string()])
    .optional()
    .refine((v) => {
      if (v == null) return true;
      const d = v instanceof Date ? v : new Date(v);
      if (Number.isNaN(d.getTime())) return false;
      return d.getTime() <= Date.now();
    }, { message: "occurredAt nao pode ser no futuro" }),
});

export type BankrollSnapshot = typeof bankrollSnapshots.$inferSelect;
export type InsertBankrollSnapshot = z.infer<typeof insertBankrollSnapshotSchema>;
export type BankrollReason = z.infer<typeof BANKROLL_REASON_ENUM>;
export type BankrollSource = z.infer<typeof BANKROLL_SOURCE_ENUM>;
