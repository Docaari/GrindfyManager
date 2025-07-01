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

// User storage table (mandatory for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  subscriptionType: varchar("subscription_type").default("free"),
  timezone: varchar("timezone").default("America/Sao_Paulo"),
  currency: varchar("currency").default("BRL"),
});

export const tournaments = pgTable("tournaments", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
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
  description: text("description").notNull(),
  buyIn: decimal("buy_in").notNull(),
  guaranteed: decimal("guaranteed"),
  templateId: varchar("template_id"), // Optional reference to tournament library
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

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  tournaments: many(tournaments),
  tournamentTemplates: many(tournamentTemplates),
  weeklyPlans: many(weeklyPlans),
  grindSessions: many(grindSessions),
  preparationLogs: many(preparationLogs),
  customGroups: many(customGroups),
  coachingInsights: many(coachingInsights),
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

// Zod schemas
export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
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
insertUserSettingsSchema.extend({
  exchangeRates: z.record(z.string(), z.number()).optional(),
});


// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type TournamentTemplate = typeof tournamentTemplates.$inferSelect;
export type InsertTournamentTemplate = z.infer<typeof insertTournamentTemplateSchema>;
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
