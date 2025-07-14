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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  name: varchar("name"), // Full name field
  profileImageUrl: varchar("profile_image_url"),
  password: varchar("password"), // For manual account creation
  username: varchar("username").unique(),
  role: varchar("role").default("user"), // admin, user, moderator
  status: varchar("status").default("pending_verification"), // active, inactive, pending_verification, blocked
  subscriptionType: varchar("subscription_type").default("free"),
  timezone: varchar("timezone").default("America/Sao_Paulo"),
  currency: varchar("currency").default("BRL"),
  // Email verification system
  emailVerified: boolean("email_verified").default(false),
  emailVerificationToken: varchar("email_verification_token"),
  // Password reset system
  passwordResetToken: varchar("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  // OAuth integration
  googleId: varchar("google_id"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastLogin: timestamp("last_login"),
});

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
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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

// User activity tracking table for engagement metrics
export const userActivities = pgTable("user_activities", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityType: varchar("activity_type").notNull(), // login, logout, grind_session, upload, study_session, page_view
  page: varchar("page"), // dashboard, grind, studies, etc.
  sessionDuration: integer("session_duration"), // em minutos
  metadata: jsonb("metadata"), // dados adicionais da atividade
  createdAt: timestamp("created_at").defaultNow(),
});

// Engagement metrics table for personalized messaging
export const engagementMetrics = pgTable("engagement_metrics", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
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
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
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
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(), // subscription_expiring, subscription_expired, general
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  priority: varchar("priority").notNull(), // low, medium, high
  daysUntilExpiration: integer("days_until_expiration"),
  isRead: boolean("is_read").default(false),
  scheduledFor: timestamp("scheduled_for").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tournaments = pgTable("tournaments", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
  tournamentId: varchar("tournament_id"), // External tournament ID from poker sites
  name: varchar("name").notNull(),
  buyIn: decimal("buy_in").notNull(),
  prizePool: decimal("prize_pool"),
  position: integer("position"),
  prize: decimal("prize").default("0"),
  datePlayed: timestamp("date_played").notNull(),
  site: varchar("site").notNull(),
  format: varchar("format").notNull(), // MTT, SNG, etc
  category: varchar("category").notNull(), // Vanilla, PKO, Mystery, etc
  speed: varchar("speed").notNull(), // Regular, Turbo, Hyper, etc
  fieldSize: integer("field_size"),
  reentries: integer("reentries").default(0),
  finalTable: boolean("final_table").default(false),
  bigHit: boolean("big_hit").default(false),
  earlyFinish: boolean("early_finish").default(false),
  lateFinish: boolean("late_finish").default(false),
  currency: varchar("currency").default("BRL"),
  rake: decimal("rake").default("0"), // Rake paid
  convertedToUSD: boolean("converted_to_usd").default(false), // Currency conversion flag
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  templateId: varchar("template_id"),
  grindSessionId: varchar("grind_session_id"),
});

export const tournamentTemplates = pgTable("tournament_templates", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
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
  userId: varchar("user_id").notNull(),
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
  userId: varchar("user_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 1=Monday, etc.
  site: varchar("site").notNull(),
  time: varchar("time").notNull(), // e.g. "19:00"
  type: varchar("type").notNull(), // e.g. "PKO", "Vanilla", "Mystery"
  speed: varchar("speed").notNull(), // e.g. "Normal", "Turbo", "Hyper"
  name: text("name").notNull(),
  buyIn: decimal("buy_in").notNull(),
  guaranteed: decimal("guaranteed"),
  templateId: varchar("template_id"), // Optional reference to tournament library
  status: varchar("status").default("upcoming"), // upcoming, registered, active, finished
  startTime: timestamp("start_time"),
  rebuys: integer("rebuys").default(0),
  result: decimal("result").default("0"),
  bounty: decimal("bounty").default("0"),
  position: integer("position"),
  sessionId: varchar("session_id"), // Link to grind session when active
  prioridade: integer("prioridade").default(2), // 1-Alta, 2-Média, 3-Baixa
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const grindSessions = pgTable("grind_sessions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
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
});

// Break feedback registros durante os breaks
export const breakFeedbacks = pgTable("break_feedbacks", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
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
  userId: varchar("user_id").notNull(),
  sessionId: varchar("session_id").notNull(),
  site: varchar("site").notNull(),
  name: text("name"),
  buyIn: decimal("buy_in").notNull(),
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const preparationLogs = pgTable("preparation_logs", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
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

export const customGroups = pgTable("custom_groups", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
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
  userId: varchar("user_id").notNull(),
  type: varchar("type").notNull(), // suggestion, warning, opportunity
  category: varchar("category").notNull(), // roi_optimization, volume_adjustment, etc
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  priority: integer("priority").default(1), // 1=low, 2=medium, 3=high
  data: jsonb("data"),
  isRead: boolean("is_read").default(false),
  isApplied: boolean("is_applied").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").unique().notNull(),
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const studyCards = pgTable("study_cards", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
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
  userId: varchar("user_id").notNull(),
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
  userId: varchar("user_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0-6 (Sunday-Saturday)
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Bug Reports - sistema de reportar bugs
export const bugReports = pgTable("bug_reports", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  filename: varchar("filename").notNull(),
  status: varchar("status").notNull(), // success, error, processing
  tournamentsCount: integer("tournaments_count").default(0),
  errorMessage: text("error_message"),
  uploadDate: timestamp("upload_date").defaultNow(),
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
  settings: one(userSettings, {
    fields: [users.id],
    references: [userSettings.userId],
  }),
}));

export const tournamentsRelations = relations(tournaments, ({ one }) => ({
  user: one(users, {
    fields: [tournaments.userId],
    references: [users.id],
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
    references: [users.id],
  }),
  tournaments: many(tournaments),
  plannedTournaments: many(plannedTournaments),
  customGroupTemplates: many(customGroupTemplates),
}));

export const weeklyPlansRelations = relations(weeklyPlans, ({ one, many }) => ({
  user: one(users, {
    fields: [weeklyPlans.userId],
    references: [users.id],
  }),
  plannedTournaments: many(plannedTournaments),
}));

export const plannedTournamentsRelations = relations(plannedTournaments, ({ one }) => ({
  user: one(users, {
    fields: [plannedTournaments.userId],
    references: [users.id],
  }),
  template: one(tournamentTemplates, {
    fields: [plannedTournaments.templateId],
    references: [tournamentTemplates.id],
  }),
}));

export const grindSessionsRelations = relations(grindSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [grindSessions.userId],
    references: [users.id],
  }),
  tournaments: many(tournaments),
  preparationLogs: many(preparationLogs),
  breakFeedbacks: many(breakFeedbacks),
  sessionTournaments: many(sessionTournaments),
}));

export const preparationLogsRelations = relations(preparationLogs, ({ one }) => ({
  user: one(users, {
    fields: [preparationLogs.userId],
    references: [users.id],
  }),
  session: one(grindSessions, {
    fields: [preparationLogs.sessionId],
    references: [grindSessions.id],
  }),
}));

export const customGroupsRelations = relations(customGroups, ({ one, many }) => ({
  user: one(users, {
    fields: [customGroups.userId],
    references: [users.id],
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
    references: [users.id],
  }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id],
  }),
}));

// Authentication-related relations already defined above

export const permissionsRelations = relations(permissions, ({ many }) => ({
  userPermissions: many(userPermissions),
}));

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(users, {
    fields: [userPermissions.userId],
    references: [users.id],
  }),
  permission: one(permissions, {
    fields: [userPermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const accessLogsRelations = relations(accessLogs, ({ one }) => ({
  user: one(users, {
    fields: [accessLogs.userId],
    references: [users.id],
  }),
}));

export const breakFeedbacksRelations = relations(breakFeedbacks, ({ one }) => ({
  user: one(users, {
    fields: [breakFeedbacks.userId],
    references: [users.id],
  }),
  session: one(grindSessions, {
    fields: [breakFeedbacks.sessionId],
    references: [grindSessions.id],
  }),
}));

export const sessionTournamentsRelations = relations(sessionTournaments, ({ one }) => ({
  user: one(users, {
    fields: [sessionTournaments.userId],
    references: [users.id],
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
    references: [users.id],
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
    references: [users.id],
  }),
  studyCard: one(studyCards, {
    fields: [studySessions.studyCardId],
    references: [studyCards.id],
  }),
}));

export const activeDaysRelations = relations(activeDays, ({ one }) => ({
  user: one(users, {
    fields: [activeDays.userId],
    references: [users.id],
  }),
}));

export const bugReportsRelations = relations(bugReports, ({ one }) => ({
  user: one(users, {
    fields: [bugReports.userId],
    references: [users.id],
  }),
}));

export const uploadHistoryRelations = relations(uploadHistory, ({ one }) => ({
  user: one(users, {
    fields: [uploadHistory.userId],
    references: [users.id],
  }),
}));

// Subscription system relations
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export const userActivitiesRelations = relations(userActivities, ({ one }) => ({
  user: one(users, {
    fields: [userActivities.userId],
    references: [users.id],
  }),
}));

export const engagementMetricsRelations = relations(engagementMetrics, ({ one }) => ({
  user: one(users, {
    fields: [engagementMetrics.userId],
    references: [users.id],
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

export const insertTournamentSchema = createInsertSchema(tournaments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTournamentTemplateSchema = createInsertSchema(tournamentTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlannedTournamentSchema = createInsertSchema(plannedTournaments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startTime: z.string().optional().transform((str) => str ? new Date(str) : undefined),
});

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

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBreakFeedbackSchema = createInsertSchema(breakFeedbacks).omit({
  id: true,
  createdAt: true,
});

export const insertSessionTournamentSchema = createInsertSchema(sessionTournaments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  fieldSize: z.union([z.number(), z.string().transform(Number), z.null()]).optional(),
  position: z.union([z.number(), z.string().transform(Number), z.null()]).optional(),
  rebuys: z.union([z.number(), z.string().transform(Number)]).default(0),
  startTime: z.union([z.string(), z.date(), z.null()]).optional(),
  endTime: z.union([z.string(), z.date(), z.null()]).optional(),
});
insertUserSettingsSchema.extend({
  exchangeRates: z.record(z.string(), z.number()).optional(),
});

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

export const insertUserActivitiesSchema = createInsertSchema(userActivities).omit({
  id: true,
  createdAt: true,
});

export const insertEngagementMetricsSchema = createInsertSchema(engagementMetrics).omit({
  id: true,
  updatedAt: true,
});

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

// Calendário Inteligente Tables
export const weeklyRoutines = pgTable("weekly_routines", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
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
  userId: varchar("user_id").notNull(),
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
  userId: varchar("user_id").notNull(),
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
  userId: varchar("user_id").notNull(),
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
    references: [users.id],
  }),
}));

export const studySchedulesRelations = relations(studySchedules, ({ one }) => ({
  user: one(users, {
    fields: [studySchedules.userId],
    references: [users.id],
  }),
  studyCard: one(studyCards, {
    fields: [studySchedules.studyCardId],
    references: [studyCards.id],
  }),
}));

export const calendarCategoriesRelations = relations(calendarCategories, ({ one, many }) => ({
  user: one(users, {
    fields: [calendarCategories.userId],
    references: [users.id],
  }),
  events: many(calendarEvents),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  user: one(users, {
    fields: [calendarEvents.userId],
    references: [users.id],
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User subscriptions table
export const userSubscriptions = pgTable("user_subscriptions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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
    references: [users.id],
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
export type UserActivity = typeof userActivities.$inferSelect;
export type InsertUserActivity = z.infer<typeof insertUserActivitiesSchema>;
export type EngagementMetrics = typeof engagementMetrics.$inferSelect;
export type InsertEngagementMetrics = z.infer<typeof insertEngagementMetricsSchema>;

// Authentication schemas
export const registerSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
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
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").optional(),
  email: z.string().email("Email inválido").optional(),
  role: z.enum(["admin", "user", "moderator"]).optional(),
  status: z.enum(["active", "inactive", "pending_verification", "blocked"]).optional(),
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
