import {
  pgTable,
  pgEnum,
  text,
  varchar,
  decimal,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  numeric,
  real,
  date,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import {
  TournamentPrimaryTypeSchema,
  SatelliteRewardTypeSchema,
} from "./tournamentTypes";
import { LIBRARY_CATEGORY_IDS, type LibraryCategoryId } from "./library-categories";

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
  // Sprint Cooldown-2 — Sleep Gate suave (snooze do dashboard ate manha seguinte)
  dashboardSnoozedUntil: timestamp("dashboard_snoozed_until"),
  // Sprint Studies-Reform RF-12 — streak counter persistente (migration 0021).
  studyStreakDays: integer("study_streak_days").notNull().default(0),
  lastStudyActivityAt: timestamp("last_study_activity_at"),
  // Sprint Estudos-Habito-1 (ADR-128) — daily goal + freezes mensais (migration 0054).
  dailyStudyGoalMinutes: integer("daily_study_goal_minutes").notNull().default(0),
  studyStreakFreezesUsedThisMonth: integer("study_streak_freezes_used_this_month").notNull().default(0),
  lastFreezeResetMonth: varchar("last_freeze_reset_month", { length: 7 }),
  // Sprint home-reform-5 item 11 — Home customization (visibility toggles + flags).
  // Shape em shared/types/homeSettings.ts. JSONB unico (1 row por user, sem joins).
  homeLayoutSettings: jsonb("home_layout_settings"),
  // Sprint AI-1A / RF-01 (ADR-151) — perfil estruturado de IA (memoria de longo
  // prazo estruturada). Shape: AiStructuredProfile (abaixo). Lesson #7: nullable,
  // default '{}'::jsonb; o storage normaliza (back-fill schemaVersion + clamps).
  // Migration 0065.
  aiStructuredProfile: jsonb("ai_structured_profile"),
});

// -----------------------------------------------------------------------------
// AiStructuredProfile — shape do users.ai_structured_profile (ADR-151).
// Versionado (schemaVersion). v1.
// -----------------------------------------------------------------------------
export type AiPlayerLevel =
  | "sem_dados"
  | "iniciando"
  | "micro_ascensao"
  | "mid_consistente"
  | "high_stakes"
  | "recreativo_serio";

export interface AiStructuredProfileMeta {
  id: string;
  texto: string;
  prazo?: "mes" | "trimestre" | null;
  criadaEm: string;
  origem: "onboarding" | "chat" | "manual";
}

export interface AiStructuredProfileOnboardingDraft {
  step: number;
  mode: "full" | "light";
  startedAt: string;
}

export interface AiStructuredProfile {
  schemaVersion: number;
  nivel?: AiPlayerLevel | null;
  nivelConfirmado?: boolean;
  nivelEstimadoEm?: string | null;
  metas?: AiStructuredProfileMeta[];
  focoDoMes?: string | null;
  focoDoMesDefinidoEm?: string | null;
  tomPreferido?: "gentle" | "balanced" | "direct";
  padroesConhecidos?: string[];
  redesPrincipais?: string[];
  stakesTipico?: string | null;
  volumeTipicoMes?: number | null;
  tempoJogaSerioMeses?: number | null;
  perfilDeclarado?: "recreativo_serio" | "semi_pro" | "pro" | null;
  onboardingCompletedAt?: string | null;
  onboardingVersion?: number | null;
  onboardingSkippedAt?: string | null;
  onboardingDraft?: AiStructuredProfileOnboardingDraft | null;
  reOnboardingOfferedAt?: string | null;
  reOnboardingDeclinedAt?: string | null;
  updatedAt?: string;
}

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

// Refresh token rotation state (ADR-143). The refresh token itself stays a JWT;
// this table is the authoritative server-side record that makes it rotatable and
// revocable. token_hash = sha256(rawRefreshJwt) — the raw JWT is never stored.
export const authRefreshTokens = pgTable("auth_refresh_tokens", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash").notNull().unique(),
  familyId: varchar("family_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  revokedReason: varchar("revoked_reason"), // rotated | logout | password_change | reuse_detected | expired
  replacedByHash: varchar("replaced_by_hash"),
  userAgent: varchar("user_agent"),
  ip: varchar("ip"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_auth_refresh_tokens_hash").on(table.tokenHash),
  index("idx_auth_refresh_tokens_user").on(table.userId),
  index("idx_auth_refresh_tokens_family").on(table.familyId),
  index("idx_auth_refresh_tokens_expires").on(table.expiresAt),
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
}, (table) => [
  // Migration 0064 (Fase 3 perf): NotificationService cron + subscription routes.
  index("idx_subscriptions_user_status").on(table.userId, table.status),
]);

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
}, (table) => [
  // Migration 0064 (Fase 3 perf): /api/user-activity feed (Onda 2).
  // PK eh varchar nanoid; sem index composto, backward PK scan filtrava por user_id.
  index("idx_user_activity_user_id").on(table.userId, table.id.desc()),
]);

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
  type: varchar("type").notNull(), // subscription_expiring, subscription_expired, general, ticket_expiring, ticket_expired
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  priority: varchar("priority").notNull(), // low, medium, high
  daysUntilExpiration: integer("days_until_expiration"),
  read: boolean("read").default(false),
  scheduledFor: timestamp("scheduled_for").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  // Sprint D / ADR-184 §2.3 — deep link p/ deep-linking + dedupe `ticket_id=` LIKE.
  // Migration 0075. Nullable p/ rows historicas.
  deepLink: varchar("deep_link"),
}, (table) => [
  // Migration 0064 (Fase 3 perf): polled em todo page load (/api/notifications/unread-count).
  index("idx_notifications_user_created").on(table.userId, table.createdAt.desc()),
  // Partial — alinhado com query da bell dropdown (read=false). Pequena vs composta.
  index("idx_notifications_user_unread").on(table.userId).where(sql`read = false`),
]);

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
  type: varchar("type").default("Vanilla"), // Vanilla | PKO | Mystery | Satellite | Add-on (SSoT em shared/tournamentTypes.ts)
  category: varchar("category").notNull(), // [DEPRECATED ADR-032] espelho de `type` durante deprecation gradual; remover apos migracao concluida
  speed: varchar("speed").notNull(), // Normal, Turbo, Hyper (SSoT: shared/scoring.SPEED_BUCKETS)
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
  // Sprint Flight-1 H6 (ADR-090): flightDay/flightParentId/flightAdvanced
  // REMOVIDOS — colunas dropadas em Migration 0030. Substituidos por
  // tournament_series + seriesId + baggedAt (declarados abaixo).
  // Sprint Flight-1 (ADR-090): single source of truth = tournament_series.
  // FK nullable, ON DELETE SET NULL (orfaniza entries sem deletar historico).
  seriesId: varchar("series_id").references(() => tournamentSeries.id, { onDelete: "set null" }),
  // baggedAt substitui semantica de flightAdvanced=true (ADR-090): timestamp
  // de quando a entry foi marcada como bagged (Day 1 passou).
  baggedAt: timestamp("bagged_at"),
  // Package fields (so quando isLive=true)
  packageBuyIn: decimal("package_buy_in"),
  packageAccommodation: decimal("package_accommodation"),
  packageTravel: decimal("package_travel"),
  packageMeals: decimal("package_meals"),
  packageOther: decimal("package_other"),
  packageNotes: text("package_notes"),
  // Sprint Tickets-1 (RF-01): back-ref para ticket consumido (FK para tickets.id, ON DELETE SET NULL)
  consumedTicketId: varchar("consumed_ticket_id"),
  // Sprint F4 Migration 0014 — campos para PrimeDope simulation (RF-02).
  // Reviewer fix HIGH #4: declaracao migrada para dentro do pgTable para que
  // drizzle-kit (db:push) crie as colunas em ambientes que nao rodam o SQL
  // migration. SQL migration continua existindo para o backfill cascade.
  playersAvg: integer("players_avg"),
  placesPaidAvg: integer("places_paid_avg"),
  rakePct: decimal("rake_pct", { precision: 5, scale: 2 }),
  // Sprint library-evolution Fase 3 (Migration 0081). Tudo nullable/default —
  // back-compat: linhas antigas + parsers que nao setam ficam null. null =
  // "nao veio no CSV" (distinto de 0). duracao habilita $/hora-mesa (Fase 4);
  // deepStack/startingStackBb sao insights de profundidade.
  durationSeconds: integer("duration_seconds"),
  playersPerTable: integer("players_per_table"),
  structure: varchar("structure"), // 'NL' | 'PL' | null
  gameType: varchar("game_type"), // 'Holdem' | 'Omaha' | null
  startingStackBb: integer("starting_stack_bb"),
  deepStack: boolean("deep_stack").default(false),
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
  // Sprint Flight-1 H6 (ADR-090): tournaments_flight_parent_idx REMOVIDO — coluna
  // flight_parent_id dropada em Migration 0030. Use index series_id quando criar.
  index("tournaments_live_idx").on(table.isLive),
  // Migration 0064 (Fase 3 perf): Home "latest upload" timestamp toda load.
  // Partial WHERE grind_session_id IS NULL alinha com CLAUDE.md §6.1.
  index("idx_tournaments_user_created_history")
    .on(table.userId, table.createdAt.desc())
    .where(sql`grind_session_id IS NULL`),
  // Migration 0085: filtro de velocidade + range de field size na Tournament
  // Library (buildFilters inArray(speed) + range field_size + insights bucketing).
  index("idx_tournaments_user_speed").on(table.userId, table.speed),
  index("idx_tournaments_user_field_size").on(table.userId, table.fieldSize),
]);

// =============================================================================
// Sprint library-evolution Fase 5 — saved_tournament_highlights (Migration 0082)
// Cards de FAMILIA que o jogador salvou (do modo Overview ou da /library). Ficam
// fixados no topo da pagina "Torneios", filtrados por plataforma. Guardam um
// SNAPSHOT das metricas + motivos do destaque (ROI medio / baixa variancia /
// $/hora) no momento do save — o card sobrevive mesmo se o historico mudar.
// =============================================================================
export const savedTournamentHighlights = pgTable("saved_tournament_highlights", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
  site: varchar("site").notNull(),
  familyKey: varchar("family_key").notNull(),
  groupName: varchar("group_name"),
  buyInTier: varchar("buy_in_tier"),
  type: varchar("type"),
  // Snapshot das metricas (roi, volume, avgBuyin, profitPerTableHour, etc).
  metrics: jsonb("metrics"),
  // Motivos do destaque: [{ kind, label }] (ROI medio / baixa variancia / $/hora).
  reasons: jsonb("reasons"),
  source: varchar("source").default("overview"), // 'overview' | 'library'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Dedup: nao salvar a mesma familia 2x pro mesmo user.
  uniqueIndex("uq_saved_highlight_user_family").on(table.userId, table.familyKey),
  index("idx_saved_highlight_user_site").on(table.userId, table.site),
]);
export type SavedTournamentHighlight = typeof savedTournamentHighlights.$inferSelect;
export type InsertSavedTournamentHighlight = typeof savedTournamentHighlights.$inferInsert;

// =============================================================================
// Sprint Flight-1 — tournament_series (ADR-090, ADR-091, Migration 0029)
// =============================================================================

// ENUMs Postgres (ADR-091): single | combined; sem 'best' (defer Sprint Flight-2).
export const SERIES_STACK_MODES = ['single', 'combined'] as const;
export const seriesStackModeEnum = pgEnum('series_stack_mode', SERIES_STACK_MODES);

// D4: status do Day 2 — pending (default) / completed / cancelled.
export const SERIES_DAY2_STATUSES = ['pending', 'completed', 'cancelled'] as const;
export const seriesDay2StatusEnum = pgEnum('series_day2_status', SERIES_DAY2_STATUSES);

export const tournamentSeries = pgTable('tournament_series', {
  id: varchar('id').primaryKey().notNull(),
  userId: varchar('user_id')
    .notNull()
    .references(() => users.userPlatformId, { onDelete: 'cascade' }),
  name: varchar('name').notNull(),
  network: varchar('network'),
  totalDay1s: integer('total_day1s').notNull().default(1),
  day2DateTime: timestamp('day2_datetime').notNull(),
  day2Status: seriesDay2StatusEnum('day2_status').notNull().default('pending'),
  stackMode: seriesStackModeEnum('stack_mode').notNull().default('single'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_series_user_status').on(table.userId, table.day2Status),
  index('idx_series_user_datetime').on(table.userId, table.day2DateTime),
  index('idx_series_user_name').on(table.userId, table.name),
]);

export type TournamentSeries = typeof tournamentSeries.$inferSelect;
export type InsertTournamentSeries = typeof tournamentSeries.$inferInsert;

// Zod schemas (drizzle-zod) — defaults aplicados pelo coerce em campos
// opcionais; rejeita totalDay1s negativo (D9 permite 0); restringe enums.
const _insertTournamentSeriesBase = createInsertSchema(tournamentSeries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTournamentSeriesSchema = _insertTournamentSeriesBase.extend({
  name: z.string().trim().min(1, 'name eh obrigatorio'),
  totalDay1s: z.number().int().min(0, 'totalDay1s nao pode ser negativo').optional().default(1),
  day2DateTime: z.union([z.date(), z.string()])
    .transform((v) => (typeof v === 'string' ? new Date(v) : v)),
  day2Status: z.enum(SERIES_DAY2_STATUSES).optional().default('pending'),
  stackMode: z.enum(SERIES_STACK_MODES).optional().default('single'),
  network: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Update schema: omit immutable fields (userId, id) — refinement-style.
export const updateTournamentSeriesSchema = z.object({
  name: z.string().trim().min(1).optional(),
  network: z.string().nullable().optional(),
  totalDay1s: z.number().int().min(0).optional(),
  day2DateTime: z.union([z.date(), z.string()])
    .transform((v) => (typeof v === 'string' ? new Date(v) : v))
    .optional(),
  day2Status: z.enum(SERIES_DAY2_STATUSES).optional(),
  stackMode: z.enum(SERIES_STACK_MODES).optional(),
  notes: z.string().nullable().optional(),
}).strict();

// Sprint F4 — primedope_runs (Migration 0015, ADR-054 cache + audit trail).
// Reviewer fix HIGH #5: FK aponta para users.userPlatformId (padrao do
// projeto — wallets, planned_tournaments, etc.).
export const primedopeRuns = pgTable("primedope_runs", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  profileLetter: varchar("profile_letter", { length: 1 }).notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  multiplier: integer("multiplier").notNull(),
  inputHash: varchar("input_hash", { length: 64 }).notNull(),
  inputJson: jsonb("input_json").notNull(),
  resultJson: jsonb("result_json").notNull(),
  histogramPath: text("histogram_path"),
  randomRunsPath: text("random_runs_path"),
  latencyMs: integer("latency_ms"),
  source: varchar("source", { length: 20 }).notNull(),
  pinned: boolean("pinned").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("primedope_runs_user_profile_day_created_idx").on(
    table.userId,
    table.profileLetter,
    table.dayOfWeek,
    table.createdAt,
  ),
  index("primedope_runs_input_hash_idx").on(table.inputHash),
]);

export const insertPrimedopeRunSchema = createInsertSchema(primedopeRuns).omit({
  id: true,
  createdAt: true,
});

export type PrimedopeRun = typeof primedopeRuns.$inferSelect;
export type InsertPrimedopeRun = typeof primedopeRuns.$inferInsert;

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
}, (table) => [
  // Migration 0064 (Fase 3 perf): /grade-planner weekly list.
  index("idx_weekly_plans_user_week").on(table.userId, table.weekStart.desc()),
]);

export const plannedTournaments = pgTable("planned_tournaments", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 1=Monday, etc.
  profile: varchar("profile").notNull().default("A"), // 'A', 'B' ou 'C' - Profile associated with tournament
  site: varchar("site").notNull(),
  time: varchar("time").notNull(), // e.g. "19:00"
  type: varchar("type").notNull(), // Vanilla | PKO | Mystery | Satellite | Add-on (Sprint 1 ADR-031 + extensao 2026-05-06)
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
  // Horario de registro intencional (HH:MM). Quando preenchido, /grind-live
  // ordena/exibe por este valor; senao usa time + lateRegMinutes.
  registrationTime: varchar("registration_time"),
  // Add-on + Re-entry (ADR-014)
  allowsAddOn: boolean("allows_addon").default(false),
  addOnCost: decimal("addon_cost"),
  allowsReentry: boolean("allows_reentry").default(false),
  maxReentries: integer("max_reentries"),
  // Sprint 1 (ADR-031): modificadores ortogonais
  isFlight: boolean("is_flight").default(false),
  isLive: boolean("is_live").default(false),
  // Sprint Flight-1 H6 (ADR-090): flightDay/flightParentId REMOVIDOS — colunas
  // dropadas em Migration 0030. Use seriesId.
  // Sprint Flight-1 (ADR-090): FK opcional para tournament_series.
  seriesId: varchar("series_id").references(() => tournamentSeries.id, { onDelete: "set null" }),
  // Sprint 1: campos satellite minimos (ticket value + target name) para
  // quando type=Satellite e o usuario adiciona o satelite na grade.
  satelliteRewardType: varchar("satellite_reward_type"),
  satelliteTicketValue: decimal("satellite_ticket_value"),
  satelliteTargetName: varchar("satellite_target_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Migration 0064 (Fase 3 perf): Home subqueries + coach context + grade-planner.
  // storage.getPlannedTournaments(userId, dayOfWeek) filtra (user, day, is_active).
  index("idx_planned_tournaments_user_day").on(table.userId, table.dayOfWeek, table.isActive),
]);

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
  // Lucro reconciliado da banca (USD) — delta saldos das wallets reportado no
  // SessionSummaryModal ("Lucro Total da Sessao"). Nullable: sessoes legadas
  // ou sem reconciliacao caem no fallback profit (P&L de torneios) + snapshots.
  walletProfitUsd: decimal("wallet_profit_usd"),
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
  // Sprint Cooldown-2 — Sleep Gate (Bloco 4)
  planClosed: boolean("plan_closed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_grind_sessions_user_status").on(table.userId, table.status),
  index("idx_grind_sessions_user_date").on(table.userId, table.date),
  // Migration 0064 (Fase 3 perf): getRecentSessions ORDER BY created_at DESC.
  // (user_id, date) nao casa com ordering por created_at quando date != created_at.
  index("idx_grind_sessions_user_created").on(table.userId, table.createdAt.desc()),
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
  type: varchar("type").default("Vanilla"), // Vanilla | PKO | Mystery | Satellite | Add-on (SSoT em shared/tournamentTypes.ts)
  speed: varchar("speed").default("Normal"), // Normal, Turbo, Hyper
  category: varchar("category").default("Vanilla"), // Fallback for type
  prioridade: integer("prioridade").default(2), // 1-Alta, 2-Média, 3-Baixa
  lateRegMinutes: integer("late_reg_minutes"),
  startingStack: integer("starting_stack"),
  maxPlayers: integer("max_players"),
  gameType: varchar("game_type"),
  blindLevelMinutes: integer("blind_level_minutes"),
  alertMinutesBefore: integer("alert_minutes_before"),
  // Horario de registro intencional (HH:MM). Quando preenchido, /grind-live
  // ordena/exibe por este valor; senao usa time + lateRegMinutes.
  registrationTime: varchar("registration_time"),
  // Add-on + Re-entry (ADR-014)
  allowsAddOn: boolean("allows_addon").default(false),
  addOnCost: decimal("addon_cost"),
  addOnTaken: boolean("addon_taken").default(false),
  allowsReentry: boolean("allows_reentry").default(false),
  maxReentries: integer("max_reentries"),
  reentries: integer("reentries").default(0),
  // Sprint 2026-05-07 — modificadores ortogonais ADR-031 + Migration 0051
  isFlight: boolean("is_flight").default(false),
  isLive: boolean("is_live").default(false),
  satelliteRewardType: varchar("satellite_reward_type"),
  satelliteTicketValue: decimal("satellite_ticket_value"),
  satelliteTargetName: varchar("satellite_target_name"),
  // Sprint Tickets-1 (RF-01 + data-model/tickets.md):
  // espelha tournaments.enteredViaSatellite no live (antes da migracao session->tournament)
  enteredViaSatellite: boolean("entered_via_satellite").default(false),
  // back-ref para ticket consumido (FK para tickets.id, ON DELETE SET NULL)
  consumedTicketId: varchar("consumed_ticket_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_session_tournaments_session_user").on(table.sessionId, table.userId),
  // Migration 0064 (Fase 3 perf): getSessionTournaments(userId) sem sessionId
  // (/api/session-tournaments, ROI/sessionsRegistered).
  index("idx_session_tournaments_user_created").on(table.userId, table.createdAt.desc()),
]);

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
  // @deprecated Sprint Cooldown-3 — usar cooldown_logs.abGameAnswers em vez deste campo
  postSessionReview: text("post_session_review"),
  // @deprecated Sprint Cooldown-3 — usar cooldown_logs.abGameAnswers.aGame/bGame em vez deste campo
  goalsAchieved: boolean("goals_achieved"),
  // @deprecated Sprint Cooldown-3 — usar cooldown_logs.abGameAnswers.lesson em vez deste campo
  lessonsLearned: text("lessons_learned"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === WARMUP RITUALS (Sprint W-1) ===
// Substitui semanticamente preparation_logs para rituais de warm-up cronometrados.
// preparation_logs permanece em uso pelo MentalPrep legado por 60 dias (ADR-029).

// Reform 2026-05-05 (ADR-120): nova ordem de blocos.
//   1 = Setup fisico (sem timer)
//   2 = Respiracao + check emocional
//   3 = Foco da semana (heuristicas)
//   4 = Intencao (opcional)
//   5 = Drills GTO/Estudo (PFC)
//
// Snapshots gravados ANTES de 2026-05-05 usam ordem antiga:
//   1 = Emocional, 2 = Heuristicas, 3 = PFC, 4 = Setup, 5 = Intencao.
// Consumers que indexam por blockId devem usar created_at >= 2026-05-05 como
// cutoff para semantica nova. Ver ADR-120 secao "Compatibilidade".
export type WarmupBlockSnapshot = {
  blockId: 1 | 2 | 3 | 4 | 5;
  startedAt: string; // ISO
  completedAt: string; // ISO
  durationSeconds: number;
  // Score emocional (bloco 2 pos-reform; bloco 1 pre-reform)
  emotionalCheckScore?: number;
  breathingCyclesCompleted?: number;
  overrideUsed?: boolean;
  // Heuristicas (bloco 3 pos-reform; bloco 2 pre-reform)
  heuristicsRead?: boolean;
  heuristicsSnapshot?: [string, string, string];
  // PFC drill (bloco 5 pos-reform; bloco 3 pre-reform)
  drillCompleted?: boolean;
  drillUrl?: string;
  // Setup fisico (bloco 1 pos-reform; bloco 4 pre-reform).
  // Pre-reform: shape fixed (water/snacks/phoneAirplane/notificationsOff/headphones/light).
  // Pos-reform: Record<label, boolean> com labels editaveis pelo user, lista em setupItemsList.
  setupItems?: Record<string, boolean> | {
    water: boolean;
    snacks: boolean;
    phoneAirplane: boolean;
    notificationsOff: boolean;
    headphones: boolean;
    light: boolean;
  };
  setupItemsList?: string[]; // pos-reform: lista de labels usada quando user editou
  // Intencao (bloco 4 pos-reform; bloco 5 pre-reform): capturada em sessionIntention da row
  sessionIntention?: { focus: string; tiltPlan: string; stopCriteria: string } | null;
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
  lateRegAlertMinutes: integer("late_reg_alert_minutes").default(1),
  lateRegAlertEnabled: boolean("late_reg_alert_enabled").default(false),
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
  // Reform 2026-05-05 (ADR-120): items custom do Setup Fisico (warm-up bloco 1).
  // null = usa defaults do client (DEFAULT_SETUP_ITEMS). Array de strings; min 3 marcados
  // pra avancar (validacao client-side). User pode add/edit/remove via dialog.
  warmupSetupItems: jsonb("warmup_setup_items").$type<string[] | null>().default(null),
  // Sprint Bankroll-2 (Multi-Wallet Foundation) — RF-06.
  // bankrollAggregationMode: 'global' soma todas wallets em USD; 'per_wallet'
  // (futuro) trata cada wallet com sua propria regra de banca no Selector.
  bankrollAggregationMode: varchar("bankroll_aggregation_mode").default("global"),
  bankrollDisplayCurrency: varchar("bankroll_display_currency", { length: 8 }).default("USD"),
  // Flag de migration v1->v2 — preenchida pelo migrate-v2-multi-wallet script.
  bankrollV2Migrated: boolean("bankroll_v2_migrated").default(false),
  // Onboarding tooltip da pagina /bankroll v2 (visita unica pos-migration).
  lastBankrollPageVisitV2: timestamp("last_bankroll_page_visit_v2"),
  // Sprint Alarmes 2.0 (RF-07) — TTS settings.
  // soundMode: 'tts' (default) | 'beep' (Web Audio API fallback) | 'mute'.
  soundMode: varchar("sound_mode").default("tts"),
  // preferredVoiceURI: null = primeira voz pt-BR disponivel no browser.
  preferredVoiceURI: text("preferred_voice_uri"),
  // alertVolume: 0.0–1.0 (passa direto para SpeechSynthesisUtterance.volume).
  alertVolume: real("alert_volume").default(0.8),
  // alertRepeatCount: numero de repeticoes da narracao (1, 2, 3, 5, 99=loop).
  alertRepeatCount: integer("alert_repeat_count").default(3),
  // alertRepeatGapMs: gap entre repeticoes (2000–30000ms).
  alertRepeatGapMs: integer("alert_repeat_gap_ms").default(3000),
  // ttsRedactBuyIn: P0-2 privacy default — narracao nao revela buy-in.
  ttsRedactBuyIn: boolean("tts_redact_buy_in").default(true),
  // ttsFirstRunSeen: P0-1 — ja viu o onboarding TTS na primeira execucao.
  ttsFirstRunSeen: boolean("tts_first_run_seen").default(false),
  // Sprint B2 (M2): Liga/desliga fluxo multi-wallet + reconcile pos-sessao.
  // Default true para nao afetar usuarios existentes. Quando false: summary
  // nao mostra secao "Bancas", reconcile nao eh tentado, snapshots nao
  // gravados. Banca legada (bankrollAmount + bankrollRule) continua.
  bankrollManagementEnabled: boolean("bankroll_management_enabled").default(true),
  // Sprint Bankroll-3 RF-6: Stop-loss / Stop-win em USD consolidado.
  // Reset diario 00:00 user TZ; lock 12h default.
  stopLossUsd: decimal("stop_loss_usd"),
  stopWinUsd: decimal("stop_win_usd"),
  stopLockUntil: timestamp("stop_lock_until"),
  stopLockDurationHours: integer("stop_lock_duration_hours").notNull().default(12),
  // Sprint Flight-1 RF-16 / D13: toggle "agregar (default) vs expandir entries"
  // nos relatorios para combined-stack series.
  reportsExpandFlightSeries: boolean("reports_expand_flight_series").default(false),
  // Limite de telas (mesas simultaneas) memorizado para a proxima sessao.
  // Usado como pre-fill de grindSessions.screenCap em novas sessoes; pode ser
  // alterado em tempo real clicando no card "Em Andamento" da grind-live.
  defaultScreenCap: integer("default_screen_cap").default(10),
  // Sprint Grind-Live Break Auto-Open (clock-aligned BRT) — RF-06.
  // Spec: Docs/specs/grind-live-break-auto-open.md
  // ADR-124. Toggle persistente do auto-open do BreakFeedbackPopup em XX:54
  // BRT (close em XX:02). Default true para todos (back-fill via DB DEFAULT).
  breakAutoOpenEnabled: boolean("break_auto_open_enabled").default(true).notNull(),
  // Sprint TS-3 RF-04 (ADR-178, migration 0072) — tristate Bankroll Mode no
  // Tournament Selector. 'all' = sem filtro; 'hide' = omite buy-in > hardLimit;
  // 'warn' = mostra com badge (default). CHECK constraint enforced em DB
  // (migration 0072 — fix HIGH-4). Q-E lock: persistido em user_settings
  // (NAO user_coach_preferences).
  tournamentSelectorBankrollMode: varchar("tournament_selector_bankroll_mode", { length: 8 })
    .notNull()
    .default("warn"),
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
  // Sprint Estudos-Sessao-1 RF-01 (migration 0073): studyCardId virou NULLABLE
  // — lesson #7 (deprecation gradual). Notes podem pertencer a um study_card
  // legacy OU a uma study_session. CHECK constraint XOR-fraco no DB garante
  // pelo menos um dos dois links presente.
  studyCardId: varchar("study_card_id"),
  studySessionId: varchar("study_session_id", { length: 21 }),
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
  // Sprint home-reform-4 Item 7 (ADR-117): nullable FK ao tema, SET NULL para
  // preservar audit. Sem back-fill historico (sessoes antigas ficam NULL).
  // LOW-15 reviewer: lazy callback (`() => studyThemes.id`) eh resolvido em
  // runtime, evitando hoisting issue com `studyThemes` declarado abaixo.
  themeId: varchar("theme_id", { length: 21 }).references(() => studyThemes.id, { onDelete: "set null" }),
  date: timestamp("date").notNull(),
  duration: integer("duration").notNull(), // em minutos
  activities: jsonb("activities").$type<string[]>().default([]), // video, notes, flashcards, etc.
  focusScore: integer("focus_score"), // 0-10
  productivityScore: integer("productivity_score"), // 0-10
  insights: text("insights"),
  // Sprint Estudos-Sessao-1 RF-01 (migration 0073): lifecycle de sessao.
  // Default 'active' mantem retro-compat de sessoes legacy.
  status: varchar("status", { length: 16 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Sprint Estudos-Sessao-1 RF-01: lifecycle do study_sessions legacy. Distinto
// do STUDY_SESSION_STATUSES (V2) que vive abaixo com valores 'running'/'completed'.
export const STUDY_SESSION_LEGACY_STATUSES = ['active', 'finished', 'abandoned'] as const;
export type StudySessionLegacyStatus = typeof STUDY_SESSION_LEGACY_STATUSES[number];

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
}, (table) => [
  // Migration 0064 (Fase 3 perf): getProfileStateForDay + getSessionTournamentsByDay.
  index("idx_profile_states_user_day").on(table.userId, table.dayOfWeek),
]);

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
  status: varchar("status").notNull(), // success | failed | processing
  tournamentsCount: integer("tournaments_count").default(0),
  // Incrementado por batch durante processamento async; lido pelo polling.
  processedCount: integer("processed_count").notNull().default(0),
  errorMessage: text("error_message"),
  uploadDate: timestamp("upload_date").defaultNow(),
  duplicatesFound: integer("duplicates_found").default(0),
  duplicateAction: varchar("duplicate_action"), // import_new_only, import_all, skip_upload
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Migration 0064 (Fase 3 perf): /api/upload-history list.
  index("idx_upload_history_user_created").on(table.userId, table.createdAt.desc()),
  // Migration 0074 — status discriminator (low cardinality; baixo custo na tabela).
  index("idx_upload_history_status").on(table.status),
]);

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
  // Sprint home-reform-4 Item 7 (ADR-117): theme relation (nullable).
  theme: one(studyThemes, {
    fields: [studySessions.themeId],
    references: [studyThemes.id],
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
    }
    // Sprint 2 (RF-04 RELAXADO): Satellite NAO exige rewardType nem target.
    // Player pode registrar tipo Satellite e completar target/reward depois;
    // ROI parcial ate la (founder original definiu "tudo opcional de registrar").
    // Orthogonality acima preserva: campos satellite* fora de Satellite continuam rejeitados.

    // ---- Refinement 2: REMOVIDO (Sprint Flight-1 H6, ADR-090) ----
    // Refinement legado validava flightDay/flightAdvanced/flightParentId.
    // Substituido por modelo tournament_series + seriesId + baggedAt.
    // Campos legados continuam aceitos no schema base como nullable().optional()
    // mas sem validacao customizada. Migration 0030 dropa as colunas DB.

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
    }
    // Sprint 2 (RF-04 RELAXADO planned): Satellite planned NAO exige
    // rewardType nem target. Mesma motivacao do schema de tournaments.

    // Sprint Flight-1 H6 (ADR-090): refinement flight* removido em planned.
    // Substituido por seriesId. Ver tournament_series.
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
  // Estado do torneio na grade — enum estrito para impedir corrupcao via API direta.
  status: z.enum(['upcoming', 'registered', 'active', 'finished', 'completed', 'deleted']).optional().default('upcoming'),
  lateRegMinutes: z.number().int().min(0).max(2880).nullable().optional(),
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
  // Sprint Bankroll-2 (RF-06)
  bankrollAggregationMode: z.enum(["global", "per_wallet"]).optional(),
  bankrollDisplayCurrency: z.enum(["USD", "BRL", "EUR", "GBP", "CNY", "USDT", "BTC"]).optional(),
  bankrollV2Migrated: z.boolean().optional(),
  lastBankrollPageVisitV2: z
    .union([z.date(), z.string(), z.null()])
    .transform((v) => (typeof v === "string" ? new Date(v) : v))
    .optional(),
  // Sprint Alarmes 2.0 (RF-07 + RF-08) — TTS settings.
  soundMode: z.enum(["tts", "beep", "mute"]).optional(),
  preferredVoiceURI: z.string().max(255).nullable().optional(),
  alertVolume: z.number().min(0).max(1).optional(),
  alertRepeatCount: z.number().int().min(1).max(99).optional(),
  alertRepeatGapMs: z.number().int().min(2000).max(30000).optional(),
  ttsRedactBuyIn: z.boolean().optional(),
  ttsFirstRunSeen: z.boolean().optional(),
  // Sprint Flight-1 RF-16 / D13.
  reportsExpandFlightSeries: z.boolean().optional(),
  // Limite de telas memorizado (1-24).
  defaultScreenCap: z.number().int().min(1).max(24).optional(),
  // Sprint Grind-Live Break Auto-Open (RF-06): toggle clock-aligned auto-open.
  // Optional + default true — back-fill via DB DEFAULT.
  breakAutoOpenEnabled: z.boolean().optional(),
}).strict();

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
  // Estado do session_tournament — enum estrito.
  status: z.enum(['upcoming', 'registered', 'active', 'finished', 'completed', 'deleted']).optional().default('upcoming'),
  lateRegMinutes: z.number().int().min(0).max(2880).nullable().optional(),
  startingStack: z.number().int().min(1).nullable().optional(),
  maxPlayers: z.number().int().min(1).nullable().optional(),
  gameType: z.enum(['NLH', 'PLO']).nullable().optional(),
  blindLevelMinutes: z.number().int().nullable().optional(),
  alertMinutesBefore: z.number().int().min(1).max(120).nullable().optional(),
  // Sprint 2026-05-07: type SSoT enum (5 valores ADR-031). category continua
  // varchar livre por compat com rows historicos; novos writes recebem enum.
  type: TournamentPrimaryTypeSchema.optional().default('Vanilla'),
  // Sprint 2026-05-07 Migration 0051 — modificadores ortogonais
  isFlight: z.boolean().optional().default(false),
  isLive: z.boolean().optional().default(false),
  satelliteRewardType: SatelliteRewardTypeSchema.nullable().optional(),
  satelliteTicketValue: z.union([z.string(), z.number()]).nullable().optional()
    .transform((v) => v == null ? null : String(v)),
  satelliteTargetName: z.string().nullable().optional(),
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

// Sprint Estudos-Sessao-1 RF-01: studyCardId e studySessionId sao ambos opcionais
// no schema base, mas o refinement XOR-fraco exige pelo menos um presente
// (espelha a CHECK constraint study_notes_link_xor do DB).
export const insertStudyNoteSchema = createInsertSchema(studyNotes)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .refine(
    (data) =>
      (data.studyCardId !== undefined && data.studyCardId !== null) ||
      (data.studySessionId !== undefined && data.studySessionId !== null),
    {
      message: "Note must link to a study_card_id or a study_session_id",
      path: ["studySessionId"],
    },
  );



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
}, (table) => [
  // Migration 0064 (Fase 3 perf): subscription routes + admin lookups.
  index("idx_user_subscriptions_user_status").on(table.userId, table.status),
]);

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

export type AuthRefreshToken = typeof authRefreshTokens.$inferSelect;
export type InsertAuthRefreshToken = typeof authRefreshTokens.$inferInsert;

// Study Themes - organized knowledge by poker topic
// Sprint Estudos-Habito-1 (ADR-127) — extensao com curated taxonomy:
//   slug + is_curated + category + linked_stats + linked_lessons + seeded_at.
export const studyThemes = pgTable("study_themes", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  color: varchar("color", { length: 7 }).default("#16a34a"),
  emoji: varchar("emoji", { length: 4 }).default(""),
  isFavorite: boolean("is_favorite").default(false),
  sortOrder: integer("sort_order").default(0),
  progress: integer("progress").default(0),
  // Sprint Estudos-Habito-1 (ADR-127): curated taxonomy.
  slug: varchar("slug", { length: 60 }),
  isCurated: boolean("is_curated").notNull().default(false),
  category: varchar("category", { length: 32 }),
  linkedStats: jsonb("linked_stats").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  linkedLessons: jsonb("linked_lessons").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  seededAt: timestamp("seeded_at"),
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

// =============================================================================
// Sprint Studies-Reform RF-08 (ADR-067 / ADR-068)
// =============================================================================
// Tabela de ligacao N:N entre temas e spots (starredHands). Usada por:
//   - SpotsView (RF-05) para vincular spots a temas
//   - studyRecommendationsService (RF-06) para excluir spots ja vinculados de stale_spots
//   - Coach tool read_theme_with_linked_spots (RF-07)
//
// UNIQUE (theme_id, spot_id) garante idempotencia em re-link.
// userId redundante (derivavel do theme/spot) mas indexado para queries por usuario.
// =============================================================================
export const studyThemeSpotLinks = pgTable("study_theme_spot_links", {
  id: varchar("id", { length: 21 }).primaryKey().notNull(),
  themeId: varchar("theme_id", { length: 21 })
    .notNull()
    .references(() => studyThemes.id, { onDelete: "cascade" }),
  spotId: varchar("spot_id", { length: 21 })
    .notNull()
    .references(() => starredHands.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 21 }).notNull(),
  reasoningText: text("reasoning_text"),
  linkedAt: timestamp("linked_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_study_theme_spot_links_theme_spot").on(table.themeId, table.spotId),
  index("idx_study_theme_spot_links_theme").on(table.themeId),
  index("idx_study_theme_spot_links_spot").on(table.spotId),
  index("idx_study_theme_spot_links_user").on(table.userId),
]);

export const insertStudyThemeSpotLinkSchema = createInsertSchema(studyThemeSpotLinks).omit({
  id: true,
  linkedAt: true,
});
export type StudyThemeSpotLink = typeof studyThemeSpotLinks.$inferSelect;
export type InsertStudyThemeSpotLink = z.infer<typeof insertStudyThemeSpotLinkSchema>;

// =============================================================================
// Sprint Estudos-Habito-1 (ADR-126) — study_sessions_v2
// =============================================================================
// Tabela nova com schema completo para registro de sessoes de estudo:
//   - 4 modos primarios + escape hatch (drill_gto / tournament_review /
//     hand_review / lesson / other)
//   - 4 sources (manual_post_hoc / manual_live / auto_lesson / auto_grind_finalize)
//   - status running/completed (para cronometro live)
//   - soft delete 24h gate via deleted_at
//   - idempotency auto_lesson via indice partial (ADR-130)
//   - max 1 cronometro live por user via UNIQUE parcial em status='running'
//
// Legado `studySessions` mantido read-only (ADR-126 §2). FocusStatsCard usa
// composer no storage agregando v2 + legacy.
// =============================================================================
export const studySessionsV2 = pgTable("study_sessions_v2", {
  id: varchar("id", { length: 21 }).primaryKey().notNull(),
  userId: varchar("user_id", { length: 21 })
    .notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  mode: varchar("mode", { length: 32 }).notNull(),
  source: varchar("source", { length: 32 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("completed"),
  themeId: varchar("theme_id", { length: 21 })
    .references(() => studyThemes.id, { onDelete: "set null" }),
  tournamentId: varchar("tournament_id"),
  lessonId: varchar("lesson_id"),
  starredHandIds: jsonb("starred_hand_ids").$type<string[]>(),
  drillPlatform: varchar("drill_platform", { length: 32 }),
  drillAccuracy: integer("drill_accuracy"),
  difficultSpots: jsonb("difficult_spots").$type<Array<{ context: string; note: string }>>(),
  // Sprint EST-3 (ADR-222) — stat_analysis + registro enriquecido. Todos nullable
  // (lesson #7): zero quebra para sessoes/modos existentes.
  statId: varchar("stat_id", { length: 64 }),
  statAnalysisEntries: jsonb("stat_analysis_entries").$type<StatAnalysisEntry[]>(),
  handsSolvedCount: integer("hands_solved_count"),
  filtersAnalyzedCount: integer("filters_analyzed_count"),
  lessonInsights: text("lesson_insights"),
  durationMinutes: integer("duration_minutes").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  idlePeriods: jsonb("idle_periods").$type<Array<{ start: string; end: string }>>(),
  notes: text("notes"),
  attachments: jsonb("attachments").$type<Array<{ key: string; url: string }>>(),
  wasProductive: boolean("was_productive"),
  dailyGoalMet: boolean("daily_goal_met").notNull().default(false),
  xpAwarded: integer("xp_awarded").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_ssv2_user_started").on(table.userId, table.startedAt),
  index("idx_ssv2_user_mode_started").on(table.userId, table.mode, table.startedAt),
  index("idx_ssv2_user_registered").on(table.userId, table.registeredAt),
  // Sprint EST-3 (ADR-222 / D-1) — indice parcial para a revisao "por stat dentro
  // do tema". Parcial (so sessoes stat_analysis nao soft-deleted) mantem o custo
  // de write baixo e cobre o caminho quente de getStatAnalysisEntries.
  index("idx_ssv2_stat_analysis_theme_stat")
    .on(table.userId, table.themeId, table.statId)
    .where(sql`mode = 'stat_analysis' AND deleted_at IS NULL`),
]);

// Zod enums explicitos (CHECK constraints DB-level garantem alem do Zod).
export const STUDY_SESSION_MODES = [
  "drill_gto",
  "tournament_review",
  "hand_review",
  "lesson",
  "other",
  // Sprint EST-3 (ADR-222 / RF-01) — analise de uma stat HUD dentro de um tema.
  "stat_analysis",
] as const;
export type StudySessionMode = (typeof STUDY_SESSION_MODES)[number];

// Sprint EST-3 (ADR-222 / RF-02 / D-2) — uma "jogada" analisada dentro de uma
// sessao stat_analysis. `filters` eh string livre (D-2). `id`/`createdAt` sao
// gerados server-side (cliente nao envia). playImageKey/solutionImageKey nullable
// (preenchidos via upload depois — fluxo (a) de D-3).
export interface StatAnalysisEntry {
  id: string;
  filters: string;
  playImageKey: string | null;
  solutionImageKey: string | null;
  errorText: string;
  learnedText: string;
  createdAt: string;
}

export const statAnalysisEntrySchema = z.object({
  id: z.string().optional(),
  filters: z.string().max(500).default(""),
  errorText: z.string().max(1000).default(""),
  learnedText: z.string().max(1000).default(""),
  playImageKey: z.string().nullable().optional(),
  solutionImageKey: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

export const STUDY_SESSION_SOURCES = [
  "manual_post_hoc",
  "manual_live",
  "auto_lesson",
  "auto_grind_finalize",
] as const;
export type StudySessionSource = (typeof STUDY_SESSION_SOURCES)[number];

export const STUDY_SESSION_STATUSES = ["running", "completed"] as const;
export type StudySessionStatus = (typeof STUDY_SESSION_STATUSES)[number];

export type StudySessionV2 = typeof studySessionsV2.$inferSelect;
export type InsertStudySessionV2 = typeof studySessionsV2.$inferInsert;

// Schema Zod com validacao discriminator-based por mode.
export const insertStudySessionV2Schema = z.object({
  userId: z.string(),
  mode: z.enum(STUDY_SESSION_MODES),
  source: z.enum(STUDY_SESSION_SOURCES),
  status: z.enum(STUDY_SESSION_STATUSES).default("completed"),
  themeId: z.string().nullable().optional(),
  tournamentId: z.string().nullable().optional(),
  lessonId: z.string().nullable().optional(),
  starredHandIds: z.array(z.string()).nullable().optional(),
  drillPlatform: z.string().max(32).nullable().optional(),
  drillAccuracy: z.number().int().min(0).max(100).nullable().optional(),
  difficultSpots: z.array(z.object({
    context: z.string().max(200),
    note: z.string().max(500),
  })).max(5).nullable().optional(),
  durationMinutes: z.number().int().min(1).max(1440),
  startedAt: z.coerce.date().nullable().optional(),
  endedAt: z.coerce.date().nullable().optional(),
  idlePeriods: z.array(z.object({
    start: z.string(),
    end: z.string(),
  })).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  attachments: z.array(z.object({
    key: z.string(),
    url: z.string(),
  })).max(5).nullable().optional(),
  wasProductive: z.boolean().nullable().optional(),
  // Sprint EST-3 (ADR-222) — campos novos, todos opcionais (lesson #7).
  statId: z.string().max(64).nullable().optional(),
  statAnalysisEntries: z.array(statAnalysisEntrySchema).max(10).nullable().optional(),
  handsSolvedCount: z.number().int().min(0).max(1000).nullable().optional(),
  filtersAnalyzedCount: z.number().int().min(0).max(1000).nullable().optional(),
  lessonInsights: z.string().max(2000).nullable().optional(),
});

// =============================================================================
// Sprint home-reform-4 Item 7 (ADR-116) — user_focus_stats
// =============================================================================
// Marcacoes mensais de stats foco do user. Escopo mensal via coluna `month`
// (varchar YYYY-MM). UNIQUE (user_id, stat_id, month) DB-level. Limite 3 por
// (user, month) enforced em servico (ADR-116 §2.4).
//
// stat_id NAO eh FK (catalog estatico em shared/hud-stat-catalog.ts).
// study_theme_id CASCADE: deletar tema remove marcacao.
// =============================================================================
export const userFocusStats = pgTable("user_focus_stats", {
  id: varchar("id", { length: 21 }).primaryKey().notNull(),
  userId: varchar("user_id", { length: 21 })
    .notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  statId: varchar("stat_id", { length: 64 }).notNull(),
  // Sprint Estudos-Habito-1 (RF-3.1): nullable agora (migration 0053).
  studyThemeId: varchar("study_theme_id", { length: 21 })
    .references(() => studyThemes.id, { onDelete: "cascade" }),
  month: varchar("month", { length: 7 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_user_focus_stats_user_stat_month").on(
    table.userId,
    table.statId,
    table.month,
  ),
  index("idx_user_focus_stats_user_month").on(table.userId, table.month),
  index("idx_user_focus_stats_theme").on(table.studyThemeId),
]);

export const userFocusStatsRelations = relations(userFocusStats, ({ one }) => ({
  user: one(users, {
    fields: [userFocusStats.userId],
    references: [users.userPlatformId],
  }),
  studyTheme: one(studyThemes, {
    fields: [userFocusStats.studyThemeId],
    references: [studyThemes.id],
  }),
}));

export const insertUserFocusStatSchema = createInsertSchema(userFocusStats, {
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Formato deve ser YYYY-MM"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserFocusStat = typeof userFocusStats.$inferSelect;
export type InsertUserFocusStat = z.infer<typeof insertUserFocusStatSchema>;

// Tournament Library - curated list of tournaments for grade planning
export const tournamentLibrary = pgTable("tournament_library", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  site: varchar("site").notNull(),
  buyIn: decimal("buy_in").notNull(),
  guaranteed: decimal("guaranteed"),
  time: varchar("time"),
  type: varchar("type"), // Vanilla | PKO | Mystery | Satellite | Add-on (SSoT em shared/tournamentTypes.ts)
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
  // Migration 0025: late-reg window preservada no template (antes apenas em
  // planned_tournaments). Permite re-instanciar template com late-reg correto.
  lateRegMinutes: integer("late_reg_minutes"),
  // Horario de registro intencional (HH:MM). Persistido na biblioteca para
  // herdar em planned/session ao instanciar.
  registrationTime: varchar("registration_time"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Migration 0064 (Fase 3 perf): getTournamentLibrary filtra (user, deleted_at IS NULL).
  index("idx_tournament_library_user_active")
    .on(table.userId)
    .where(sql`deleted_at IS NULL`),
]);

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
  source: z.enum(['manual', 'suprema', 'grind-live', 'csv']).optional(),
  // SSoT: TournamentPrimaryTypeSchema (Vanilla|PKO|Mystery|Satellite) — antes
  // era enum local sem Satellite, divergindo de planned_tournaments.
  type: TournamentPrimaryTypeSchema.nullable().optional(),
  speed: z.enum(['Normal', 'Turbo', 'Hyper']).nullable().optional(),
  deletedAt: z.date().nullable().optional(),
  externalId: z.string().nullable().optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  currency: z.string().default('USD').optional(),
  lateRegMinutes: z.number().int().min(0).max(2880).nullable().optional(),
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
  source: varchar("source").notNull().default("manual"), // manual | auto_session | auto_import | migration_v1
  sessionId: varchar("session_id"), // FK grind_sessions, opcional (reservado p/ auto_session)
  // Sprint Bankroll-2 (RF-04) — 4 colunas nullable para multi-wallet.
  // Snapshots pre-v2 ficam null. Snapshots criados pela migration v1->v2 recebem walletId.
  // Snapshots criados em V2 a partir de wallet_transactions replicam dados da tx (audit).
  walletId: varchar("wallet_id"),
  nativeAmount: decimal("native_amount"),
  nativeCurrency: varchar("native_currency", { length: 8 }),
  fxRateUSDPerNative: decimal("fx_rate_usd_per_native"),
  // Sprint Bankroll-3 RF-8: classificacao de origem do snapshot.
  // origin: 'manual' | 'auto-cooldown' | 'transfer' | 'import' | 'migration_v1'.
  // sourceRefId: id da entidade que originou (ex: cooldown_log.id, transfer_group_id).
  origin: varchar("origin", { length: 32 }).notNull().default("manual"),
  sourceRefId: varchar("source_ref_id", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_bankroll_snapshots_user_occurred").on(table.userId, table.occurredAt),
  index("idx_bankroll_snapshots_user_reason").on(table.userId, table.reason),
  index("idx_bankroll_snapshots_wallet").on(table.walletId),
  index("idx_bankroll_snapshots_origin").on(table.origin),
]);

// Sprint Bankroll-Reports-Detail (R2 fix M3): inclui 'manual_report' para
// que insertBankrollSnapshotSchema aceite snapshots disparados pos manual_report
// wallet_transactions. ADR-069.
const BANKROLL_REASON_ENUM = z.enum([
  "initial",
  "deposit",
  "withdrawal",
  "session_result",
  "rakeback",
  "manual_adjustment",
  "manual_report",
]);
const BANKROLL_SOURCE_ENUM = z.enum(["manual", "auto_session", "auto_import"]);

// Sprint Bankroll-3 RF-8: SNAPSHOT_ORIGINS enum (re-declarado aqui para uso
// no schema; tambem exportado mais abaixo junto com walletTransfers).
// Sprint Bankroll-Reports-Detail (RF-04): adiciona 'manual-report' (origin de
// snapshot disparado por manual_report wallet_transaction; ver ADR-069).
const SNAPSHOT_ORIGIN_ENUM = z.enum([
  "manual",
  "auto-cooldown",
  "transfer",
  "import",
  "migration_v1",
  "manual-report",
]);

export const insertBankrollSnapshotSchema = z.object({
  userId: z.string().min(1),
  // delta: string decimal ou number; precisa ser != 0
  // (RF-2 auto-snapshot bypassa este schema chamando storage.insertBankrollSnapshot
  //  diretamente, entao delta=0 eh permitido apenas no path automatico).
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
  // Sprint Bankroll-3 RF-8: origin/sourceRefId.
  origin: SNAPSHOT_ORIGIN_ENUM.optional().default("manual"),
  sourceRefId: z.string().max(64).nullable().optional(),
  occurredAt: z.union([z.date(), z.string()])
    .optional()
    .refine((v) => {
      if (v == null) return true;
      const d = v instanceof Date ? v : new Date(v);
      if (Number.isNaN(d.getTime())) return false;
      // Permite ate 24h grace para skew de timezone client/server (consistencia
      // com txBody em server/routes/wallets.ts).
      return d.getTime() < Date.now() + 24 * 60 * 60 * 1000;
    }, { message: "occurredAt nao pode ser no futuro" }),
});

export type BankrollSnapshot = typeof bankrollSnapshots.$inferSelect;
export type InsertBankrollSnapshot = z.infer<typeof insertBankrollSnapshotSchema>;
export type BankrollReason = z.infer<typeof BANKROLL_REASON_ENUM>;
export type BankrollSource = z.infer<typeof BANKROLL_SOURCE_ENUM>;

// =============================================================================
// Sprint Bankroll-2 — Multi-Wallet Foundation
//
// Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-01, RF-03)
// ADR-034: modelo multi-wallet com FX historico imutavel
// ADR-017: invariantes ledger (transacao + SELECT FOR UPDATE)
// =============================================================================

import {
  WALLET_PLATFORMS,
  WALLET_NATIVE_CURRENCIES,
} from "./wallet-platforms";
import {
  WALLET_TX_REASONS,
  WALLET_TX_DIRECTIONS,
  WALLET_TX_SOURCES,
} from "./wallet-reasons";

// RF-01: tabela wallets — uma carteira por (user, plataforma+moeda).
export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  platform: varchar("platform").notNull(),
  nativeCurrency: varchar("native_currency", { length: 8 }).notNull(),
  // Espelho autoritativo do ultimo wallet_transactions.newNativeBalance.
  balance: decimal("balance").notNull().default("0"),
  status: varchar("status").notNull().default("active"), // 'active' | 'archived'
  // Override do default global. Null = usa user_settings.bankrollRule.
  bankrollRule: varchar("bankroll_rule"),
  color: varchar("color", { length: 7 }), // hex #RRGGBB
  displayOrder: integer("display_order").notNull().default(0),
  isShotPocket: boolean("is_shot_pocket").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_wallets_user_status").on(table.userId, table.status),
  index("idx_wallets_user_platform").on(table.userId, table.platform),
  // RF-01: defesa-em-profundidade contra race condition de criacao de duplicata.
  uniqueIndex("uq_wallets_user_name_active")
    .on(table.userId, table.name)
    .where(sql`status = 'active'`),
]);

// RF-03: tabela wallet_transactions — ledger imutavel.
// fxRateUSDPerNative IMUTAVEL pos-INSERT (validado em service-layer; sem trigger SQL).
// Invariante audit (ADR-017): tx[N+1].previousNativeBalance === tx[N].newNativeBalance por walletId ASC.
export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id").primaryKey().notNull(),
  walletId: varchar("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(), // denormalizado p/ query rapida (idx_wtx_user_*)
  occurredAt: timestamp("occurred_at").notNull(),
  effectiveAt: timestamp("effective_at").notNull(), // = occurredAt no P0
  direction: varchar("direction").notNull(), // 'in' | 'out'
  nativeAmount: decimal("native_amount").notNull(),
  nativeCurrency: varchar("native_currency", { length: 8 }).notNull(),
  // FX CONVENTION: fxRateUSDPerNative significa "1 USD vale N nativeCurrency".
  // Para USD: fxRate = 1.0. usdAmount = nativeAmount / fxRate (ADR-033).
  fxRateUSDPerNative: decimal("fx_rate_usd_per_native").notNull(),
  usdAmount: decimal("usd_amount").notNull(),
  previousNativeBalance: decimal("previous_native_balance").notNull(),
  newNativeBalance: decimal("new_native_balance").notNull(),
  reason: varchar("reason").notNull(), // RF-05 enum
  feeAmount: decimal("fee_amount"), // nullable — pareado com feeCurrency
  feeCurrency: varchar("fee_currency", { length: 8 }),
  sessionId: varchar("session_id").references(() => grindSessions.id, { onDelete: "set null" }),
  note: text("note"),
  source: varchar("source").notNull().default("manual"),
  // Reservados para specs futuras (transfer, staking) — schema-only no P0.
  transferGroupId: varchar("transfer_group_id"),
  stakingDealId: varchar("staking_deal_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_wtx_wallet_occurred").on(table.walletId, table.occurredAt),
  index("idx_wtx_user_reason").on(table.userId, table.reason),
  index("idx_wtx_user_occurred").on(table.userId, table.occurredAt),
  index("idx_wtx_transfer_group").on(table.transferGroupId),
]);

// Wallet pending — Sprint Bankroll-3 RF-5 ativa.
// direction: 'deposit_pending' | 'withdrawal_pending'.
// status: 'pending' | 'cleared' | 'cancelled'.
// Cap 10 pending por wallet (D8).
export const walletPending = pgTable("wallet_pending", {
  id: varchar("id").primaryKey().notNull(),
  walletId: varchar("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  direction: varchar("direction").notNull(),
  nativeAmount: decimal("native_amount").notNull(),
  nativeCurrency: varchar("native_currency", { length: 8 }).notNull(),
  reason: varchar("reason").notNull(),
  status: varchar("status").notNull().default("pending"), // 'pending' | 'cleared' | 'cancelled'
  expectedClearAt: timestamp("expected_clear_at"),
  clearedAt: timestamp("cleared_at"),
  cancelledAt: timestamp("cancelled_at"),
  note: text("note"),
  // Sprint Bankroll-3 RF-5: ID externo herdado para wallet_transactions ao settle.
  externalReference: varchar("external_reference", { length: 120 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_wallet_pending_wallet_status").on(table.walletId, table.status),
]);

// =============================================================================
// Sprint Bankroll-3 RF-4: wallet_transfers (cross-wallet transfer audit table)
// ADR-059. Cada transferencia gera 1 row aqui + 2/3 wallet_transactions
// agrupadas por transfer_group_id.
// =============================================================================

export const TRANSFER_REASONS = [
  "transfer",
  "rebalance",
  "cashout_to_bank",
  "site_to_site",
] as const;

export const walletTransfers = pgTable("wallet_transfers", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  transferGroupId: varchar("transfer_group_id").notNull().unique(),
  fromWalletId: varchar("from_wallet_id")
    .notNull()
    .references(() => wallets.id, { onDelete: "restrict" }),
  toWalletId: varchar("to_wallet_id")
    .notNull()
    .references(() => wallets.id, { onDelete: "restrict" }),
  amountFrom: decimal("amount_from").notNull(),
  amountTo: decimal("amount_to").notNull(),
  fromCurrency: varchar("from_currency", { length: 8 }).notNull(),
  toCurrency: varchar("to_currency", { length: 8 }).notNull(),
  fxRate: decimal("fx_rate"),
  feeAmount: decimal("fee_amount"),
  feeCurrency: varchar("fee_currency", { length: 8 }),
  feeWalletId: varchar("fee_wallet_id").references(() => wallets.id, {
    onDelete: "restrict",
  }),
  reason: varchar("reason").notNull(),
  note: text("note"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_wallet_transfers_user_occurred").on(
    table.userId,
    table.occurredAt,
  ),
  index("idx_wallet_transfers_from_wallet").on(table.fromWalletId),
  index("idx_wallet_transfers_to_wallet").on(table.toWalletId),
]);

export type WalletTransfer = typeof walletTransfers.$inferSelect;

// Sprint Bankroll-Reports-Detail (R2 fix L1): alinha com SNAPSHOT_ORIGIN_ENUM
// interno (ADR-069 — snapshot disparado por manual_report wallet_transaction).
export const SNAPSHOT_ORIGINS = [
  "manual",
  "auto-cooldown",
  "transfer",
  "import",
  "migration_v1",
  "manual-report",
] as const;
export type SnapshotOrigin = typeof SNAPSHOT_ORIGINS[number];

export const PENDING_DIRECTIONS = [
  "deposit_pending",
  "withdrawal_pending",
] as const;
export type PendingDirection = typeof PENDING_DIRECTIONS[number];

export const insertWalletTransferSchema = z.object({
  fromWalletId: z.string().min(1),
  toWalletId: z.string().min(1),
  amountFrom: z.union([z.string(), z.number()]).refine((v) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return Number.isFinite(n) && n > 0;
  }, { message: "amountFrom deve ser maior que zero" }),
  amountTo: z.union([z.string(), z.number()]).optional(),
  fxRate: z.union([z.string(), z.number()]).optional(),
  feeAmount: z.union([z.string(), z.number()]).optional(),
  feeCurrency: z.string().min(3).max(8).optional(),
  feeWalletId: z.string().min(1).optional(),
  reason: z.enum(TRANSFER_REASONS),
  note: z.string().max(500).nullable().optional(),
  occurredAt: z.union([z.date(), z.string()]).optional(),
  confirmFxDiff: z.boolean().optional(),
})
  .refine((d) => d.fromWalletId !== d.toWalletId, {
    message: "fromWalletId e toWalletId devem ser diferentes",
    path: ["toWalletId"],
  })
  .refine((d) => {
    const feeAmountSet = d.feeAmount != null;
    return !feeAmountSet || (d.feeCurrency != null && d.feeWalletId != null);
  }, {
    message: "feeAmount exige feeCurrency e feeWalletId",
    path: ["feeAmount"],
  });

export const insertWalletPendingSchema = z.object({
  walletId: z.string().min(1),
  direction: z.enum(PENDING_DIRECTIONS),
  nativeAmount: z.union([z.string(), z.number()]).refine((v) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return Number.isFinite(n) && n > 0;
  }, { message: "nativeAmount deve ser maior que zero" }),
  nativeCurrency: z.string().min(2).max(8),
  reason: z.string().min(1),
  expectedClearAt: z.union([z.date(), z.string()]).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  externalReference: z.string().max(120).nullable().optional(),
});

export const settlePendingBodySchema = z.object({
  actualNativeAmount: z.union([z.string(), z.number()]).optional(),
  actualOccurredAt: z.union([z.date(), z.string()]).optional(),
  fxRateUSDPerNative: z.union([z.string(), z.number()]).optional(),
  note: z.string().max(500).nullable().optional(),
});

export const updateStopsSchema = z.object({
  stopLossUsd: z.union([z.number(), z.string(), z.null()]).optional(),
  stopWinUsd: z.union([z.number(), z.string(), z.null()]).optional(),
  stopLockDurationHours: z.number().int().min(1).max(72).optional(),
});

// =============================================================================
// Wallets — Zod schemas
// =============================================================================

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const BANKROLL_RULE_REGEX = /^(1pct|2pct|5pct|custom:\d+(\.\d+)?)$/;

export const insertWalletSchema = z.object({
  userId: z.string().min(1),
  // Trim explicito antes da validacao de tamanho.
  name: z.string()
    .transform((s) => s.trim())
    .refine((s) => s.length >= 1 && s.length <= 80, {
      message: "Nome deve ter entre 1 e 80 caracteres",
    }),
  platform: z.enum(WALLET_PLATFORMS),
  nativeCurrency: z.enum(WALLET_NATIVE_CURRENCIES),
  balance: z.union([z.string(), z.number()]).optional(),
  status: z.enum(["active", "archived"]).optional(),
  bankrollRule: z.string().regex(BANKROLL_RULE_REGEX).nullable().optional(),
  color: z.string().regex(HEX_COLOR_REGEX, "Cor deve ser hex #RRGGBB").nullable().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isShotPocket: z.boolean().optional(),
});

export const insertWalletTransactionSchema = z.object({
  walletId: z.string().min(1),
  userId: z.string().min(1),
  occurredAt: z.union([z.date(), z.string()]),
  effectiveAt: z.union([z.date(), z.string()]),
  direction: z.enum(WALLET_TX_DIRECTIONS),
  nativeAmount: z.union([z.string(), z.number()]).refine((v) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return Number.isFinite(n) && n > 0;
  }, { message: "nativeAmount deve ser maior que zero" }),
  nativeCurrency: z.string().min(1).max(8),
  fxRateUSDPerNative: z.union([z.string(), z.number()]).refine((v) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return Number.isFinite(n) && n > 0;
  }, { message: "fxRateUSDPerNative deve ser maior que zero" }),
  usdAmount: z.union([z.string(), z.number()]),
  previousNativeBalance: z.union([z.string(), z.number()]),
  newNativeBalance: z.union([z.string(), z.number()]),
  reason: z.enum(WALLET_TX_REASONS),
  feeAmount: z.union([z.string(), z.number(), z.null()]).optional(),
  feeCurrency: z.union([z.string(), z.null()]).optional(),
  sessionId: z.string().nullable().optional(),
  note: z.string().max(500, "note tem limite de 500 caracteres").nullable().optional(),
  source: z.enum(WALLET_TX_SOURCES).optional(),
  // transferGroupId nullable; quando set deve ser nao-vazio (consistencia com nanoid)
  transferGroupId: z.union([z.string().min(1), z.null()]).optional(),
  stakingDealId: z.union([z.string().min(1), z.null()]).optional(),
}).refine((data) => {
  // feeAmount + feeCurrency: ambos null OU ambos set.
  const feeAmountSet = data.feeAmount != null;
  const feeCurrencySet = data.feeCurrency != null;
  return feeAmountSet === feeCurrencySet;
}, {
  message: "feeAmount e feeCurrency devem ser ambos preenchidos ou ambos null",
  path: ["feeAmount"],
});

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type WalletPending = typeof walletPending.$inferSelect;

// =============================================================================
// Sprint Tickets-1 — Foundation: tabela tickets
//
// Spec: docs/specs/satellite-tickets-management.md (RF-01)
// Data model: docs/architecture/data-model/tickets.md
// ADR-036, ADR-037
// =============================================================================

export const TICKET_STATUSES = ['available', 'used', 'expired', 'cancelled', 'transferred'] as const;
export const TICKET_SOURCES = ['satellite_result', 'manual'] as const;

export const tickets = pgTable("tickets", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  // Source — origem do ticket (XOR via Z7: source=manual => sem source ids; source=satellite_result => exatamente um source id)
  sourceTournamentId: varchar("source_tournament_id"),
  sourceSessionTournamentId: varchar("source_session_tournament_id"),
  // Target — para qual torneio este ticket eh valido (Z1: pelo menos um)
  targetTemplateId: varchar("target_template_id"),
  targetName: varchar("target_name"),
  targetSite: varchar("target_site"),
  // Valor sempre USD (Z4: > 0)
  ticketValueUSD: decimal("ticket_value_usd").notNull(),
  extraCashUSD: decimal("extra_cash_usd"),
  // Status (default 'available')
  status: varchar("status").notNull().default("available"),
  // Used in (Z2 XOR quando status=used)
  usedInTournamentId: varchar("used_in_tournament_id"),
  usedInSessionTournamentId: varchar("used_in_session_tournament_id"),
  // Timestamps
  earnedAt: timestamp("earned_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  usedAt: timestamp("used_at"),
  cancelledAt: timestamp("cancelled_at"),
  // v2 reservados
  transferredAt: timestamp("transferred_at"),
  transferredToUserId: varchar("transferred_to_user_id"),
  // Sprint 2 ready: dedupe da notificacao "expira em 48h"
  notifiedExpiringAt: timestamp("notified_expiring_at"),
  // Observacoes / origem livre
  note: text("note"),
  source: varchar("source").notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_tickets_user_status").on(table.userId, table.status),
  index("idx_tickets_user_target_template").on(table.userId, table.targetTemplateId),
  // idx_tickets_user_expires (parcial em status='available') — criado via SQL na migration
  index("idx_tickets_source_tournament").on(table.sourceTournamentId),
  index("idx_tickets_used_in_tournament").on(table.usedInTournamentId),
]);

// =============================================================================
// insertTicketSchema — Zod refinements (Z1, Z2, Z4, Z5, Z7)
// =============================================================================

const ticketDecimal = z.union([z.string(), z.number()])
  .transform((v) => typeof v === "number" ? String(v) : v);

const ticketDecimalNullable = z.union([z.string(), z.number(), z.null()])
  .nullable()
  .optional()
  .transform((v) => v == null ? v : (typeof v === "number" ? String(v) : v));

const dateLike = z.union([z.date(), z.string(), z.null()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v == null) return v;
    if (v instanceof Date) return v;
    return new Date(v);
  });

export const insertTicketSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1),
  sourceTournamentId: z.string().nullable().optional(),
  sourceSessionTournamentId: z.string().nullable().optional(),
  targetTemplateId: z.string().nullable().optional(),
  targetName: z.string().nullable().optional(),
  targetSite: z.string().nullable().optional(),
  ticketValueUSD: ticketDecimal,
  extraCashUSD: ticketDecimalNullable,
  status: z.enum(TICKET_STATUSES).optional().default("available"),
  usedInTournamentId: z.string().nullable().optional(),
  usedInSessionTournamentId: z.string().nullable().optional(),
  earnedAt: dateLike,
  expiresAt: dateLike,
  usedAt: dateLike,
  cancelledAt: dateLike,
  transferredAt: dateLike,
  transferredToUserId: z.string().nullable().optional(),
  notifiedExpiringAt: dateLike,
  note: z.string().nullable().optional(),
  source: z.enum(TICKET_SOURCES),
})
  // Z4 — ticketValueUSD > 0
  .refine((data) => {
    const n = parseFloat(String(data.ticketValueUSD));
    return Number.isFinite(n) && n > 0;
  }, { message: "ticketValueUSD deve ser maior que 0", path: ["ticketValueUSD"] })
  // extraCashUSD nao-negativo
  .refine((data) => {
    if (data.extraCashUSD == null) return true;
    const n = parseFloat(String(data.extraCashUSD));
    return Number.isFinite(n) && n >= 0;
  }, { message: "extraCashUSD nao pode ser negativo", path: ["extraCashUSD"] })
  // Z1 — pelo menos um target
  .refine((data) => {
    return !!data.targetTemplateId || !!data.targetName;
  }, { message: "Informe pelo menos targetTemplateId ou targetName", path: ["targetName"] })
  // Z5 — expiresAt > earnedAt
  .refine((data) => {
    if (!data.expiresAt) return true;
    const earned = data.earnedAt instanceof Date
      ? data.earnedAt
      : (data.earnedAt ? new Date(data.earnedAt as any) : new Date(0));
    const expires = data.expiresAt as Date;
    return expires.getTime() > earned.getTime();
  }, { message: "expiresAt deve ser maior que earnedAt", path: ["expiresAt"] })
  // Z2 — XOR usedInTournamentId vs usedInSessionTournamentId quando status=used
  .refine((data) => {
    if (data.status !== "used") return true;
    const a = !!data.usedInTournamentId;
    const b = !!data.usedInSessionTournamentId;
    return (a && !b) || (!a && b);
  }, { message: "status=used exige exatamente um entre usedInTournamentId e usedInSessionTournamentId (XOR)", path: ["usedInTournamentId"] })
  // Z2 — usedAt obrigatorio quando status=used
  .refine((data) => {
    if (data.status !== "used") return true;
    return !!data.usedAt;
  }, { message: "status=used exige usedAt", path: ["usedAt"] })
  // Z7 — consistencia source <-> source ids
  .refine((data) => {
    if (data.source === "manual") {
      return !data.sourceTournamentId && !data.sourceSessionTournamentId;
    }
    if (data.source === "satellite_result") {
      return !!data.sourceTournamentId || !!data.sourceSessionTournamentId;
    }
    return true;
  }, { message: "source e source ids inconsistentes", path: ["source"] });

export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type TicketStatus = typeof TICKET_STATUSES[number];
export type TicketSource = typeof TICKET_SOURCES[number];

// =============================================================================
// Sprint Cooldown-1 (MVP) — Cool-down pos-sessao
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-03)
// ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
// =============================================================================

export const COOLDOWN_LOG_MODES = ["full", "quick"] as const;
export const STARRED_HAND_TYPES = [
  "tilt",
  "leak",
  "soulread",
  "hero-call",
  "cooler",
  "mistake",
  "sick",
  "other",
  // Sprint F2 — auto-tag para print colado/upload (paste flow)
  "spot_screenshot",
  // Sprint Spot-Anki-Reentry-3 (ADR-138) — drill GTO orfao criado pelo cron.
  "drill",
] as const;
export const STARRED_HAND_SPOTS = [
  "preflop",
  "flop",
  "turn",
  "river",
  "icm",
  "final-table",
  "bubble",
  "other",
  // Sprint F2 — placeholder ate jogador classificar print
  "screenshot_pending",
] as const;

// Sprint F2 — novos enums para spot screenshots
export const STARRED_HAND_SOURCES = [
  "paste", // Ctrl+V no live grind
  "upload", // file picker fallback
  "manual", // default — cooldown classico Sprint Cooldown-1
] as const;

export const STARRED_HAND_STATUSES = [
  "pending", // default — print recem-colado
  "reviewed", // jogador revisou via cooldown ou studies
  "discarded", // soft delete via DELETE /:id/discard
] as const;

// Sprint Spot-Screenshots — captured_during enum (kebab-case)
// Sprint Spot-Anki-Reentry-3 (ADR-138) — adicionado 'drill_gto' para spots orfaos
// criados pelo cron materializeDrillDifficultSpotsCron a partir de
// study_sessions_v2.difficult_spots.
export const STARRED_HAND_CAPTURED_DURING = ["grind-live", "cooldown", "drill_gto"] as const;

export type AbGameAnswers = {
  aGame: string[];
  bGame: string[];
  cGame: string;
  lesson: string;
};

export type TiltSelfAssessment = {
  feltTilt: number;
  keptTilting: number;
  presence: number;
  triggers: string[];
  action: string;
};

export const cooldownLogs = pgTable("cooldown_logs", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  sessionId: varchar("session_id")
    .notNull()
    .references(() => grindSessions.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMinutes: integer("duration_minutes"),
  mode: varchar("mode").notNull().default("full"), // 'full' | 'quick'
  blocksCompleted: jsonb("blocks_completed").$type<string[]>().default([]),
  abGameAnswers: jsonb("ab_game_answers").$type<AbGameAnswers>(),
  tiltSelfAssessment: jsonb("tilt_self_assessment").$type<TiltSelfAssessment>(),
  sleepIntent: boolean("sleep_intent"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cooldown_user_session").on(table.userId, table.sessionId),
  index("idx_cooldown_user_completed").on(table.userId, table.completedAt),
]);

export const starredHands = pgTable("starred_hands", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  // Sprint Spot-Anki-Reentry-3 (ADR-138) — relaxado para NULLABLE para permitir
  // drill spots orfaos criados pelo cron materializeDrillDifficultSpotsCron.
  sessionId: varchar("session_id")
    .references(() => grindSessions.id, { onDelete: "cascade" }),
  sessionTournamentId: varchar("session_tournament_id")
    .references(() => sessionTournaments.id, { onDelete: "cascade" }),
  cooldownLogId: varchar("cooldown_log_id")
    .references(() => cooldownLogs.id, { onDelete: "set null" }),
  type: varchar("type").notNull(),
  spot: varchar("spot").notNull(),
  notes: text("notes"),
  // Sprint F2 — extensoes para spot screenshots (Migration 0012)
  // Todas nullable exceto reviewLater/source/status (defaults). Lesson #7.
  imageUrl: text("image_url"),
  conclusion: text("conclusion"),
  reviewedAt: timestamp("reviewed_at"),
  reviewLater: boolean("review_later").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  pastedAt: timestamp("pasted_at"),
  source: varchar("source", { length: 20 }).notNull().default("manual"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // Sprint Spot-Screenshots — colunas adicionadas pela migration 0019
  imageKey: varchar("image_key", { length: 255 }),
  imageMime: varchar("image_mime", { length: 50 }),
  imageSize: integer("image_size"),
  imageWidth: integer("image_width"),
  imageHeight: integer("image_height"),
  capturedDuring: varchar("captured_during", { length: 20 }).notNull().default("cooldown"),
  createdAt: timestamp("created_at").defaultNow(),
  // Sprint Spot-Anki-Reentry-3 (RF-1) — campos semanticos para aprendizado.
  // Todas nullable; backfill nao necessario (lesson #7).
  insight: text("insight"),
  decisionCorrect: boolean("decision_correct"),
  confidenceLevel: integer("confidence_level"),
  tags: jsonb("tags").$type<string[]>(),
}, (table) => [
  index("idx_starred_user_session").on(table.userId, table.sessionId),
  index("idx_starred_user_type").on(table.userId, table.type),
  // Sprint F2 — indices novos
  index("idx_starred_user_status").on(table.userId, table.status),
  index("idx_starred_expires").on(table.expiresAt),
  index("idx_starred_session_source").on(table.sessionId, table.source),
  // Sprint Spot-Screenshots — index para cap query (10/sessao)
  index("idx_starred_user_session_captured").on(
    table.userId,
    table.sessionId,
    table.capturedDuring,
  ),
  // Sprint Spot-Anki-Reentry-3 (RF-1.1) — index parcial spots com insight.
  // Drizzle nao expoe WHERE clause em pgTable index API, mas o nome bate com
  // o index criado pela migration 0058 (idx_starred_user_has_insight).
  index("idx_starred_user_has_insight").on(table.userId, table.createdAt),
]);

// =============================================================================
// Sprint Spot-Anki-Reentry-3 (RF-2 + ADR-136) — spot_reentry_cards
// =============================================================================

export const SPOT_REENTRY_SOURCES = [
  "manual_add",
  "drill_gto_difficult_spot",
  "coach_session_insight",
] as const;

export const SPOT_REENTRY_GRADES = ["again", "hard", "good", "easy"] as const;

export const spotReentryCards = pgTable("spot_reentry_cards", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  spotId: varchar("spot_id")
    .notNull()
    .references(() => starredHands.id, { onDelete: "cascade" }),
  source: varchar("source", { length: 32 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // SRS state.
  nextReviewAt: timestamp("next_review_at", { withTimezone: true }).notNull(),
  intervalDays: numeric("interval_days", { precision: 8, scale: 2 }).notNull(),
  easeFactor: numeric("ease_factor", { precision: 3, scale: 2 }).notNull().default("2.50"),
  // Tracking.
  reviewCount: integer("review_count").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  lastReviewAt: timestamp("last_review_at", { withTimezone: true }),
  lastGrade: varchar("last_grade", { length: 8 }),
  // Lifecycle.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_srs_user_next_review").on(table.userId, table.nextReviewAt),
  uniqueIndex("uq_srs_user_spot_active").on(table.userId, table.spotId),
  index("idx_srs_user_last_review").on(table.userId, table.lastReviewAt),
]);

export type SpotReentryCard = typeof spotReentryCards.$inferSelect;
export type SpotReentrySource = (typeof SPOT_REENTRY_SOURCES)[number];
export type SpotReentryGrade = (typeof SPOT_REENTRY_GRADES)[number];

export const spotReentrySourceSchema = z.enum(SPOT_REENTRY_SOURCES);
export const spotReentryGradeSchema = z.enum(SPOT_REENTRY_GRADES);

export const insertSpotReentryCardSchema = z.object({
  userId: z.string().min(1),
  spotId: z.string().min(1),
  source: spotReentrySourceSchema,
  intervalDays: z.number().min(0.01).max(120),
  easeFactor: z.number().min(1.3).max(3.0),
  nextReviewAt: z.union([z.string(), z.date()]),
});

export type InsertSpotReentryCard = z.infer<typeof insertSpotReentryCardSchema>;

// -----------------------------------------------------------------------------
// Zod schemas
// -----------------------------------------------------------------------------

export const cooldownLogModeSchema = z.enum(COOLDOWN_LOG_MODES);
export const starredHandTypeSchema = z.enum(STARRED_HAND_TYPES);
export const starredHandSpotSchema = z.enum(STARRED_HAND_SPOTS);
// Sprint F2 — novos enums Zod
export const starredHandSourceSchema = z.enum(STARRED_HAND_SOURCES);
export const starredHandStatusSchema = z.enum(STARRED_HAND_STATUSES);
// Sprint Spot-Screenshots — captured_during enum schema
export const starredHandCapturedDuringSchema = z.enum(STARRED_HAND_CAPTURED_DURING);

export const abGameAnswersSchema = z.object({
  aGame: z.array(z.string()),
  bGame: z.array(z.string()),
  cGame: z.string().max(2000, "cGame tem limite de 2000 caracteres"),
  lesson: z.string().max(200, "lesson tem limite de 200 caracteres"),
});

export const insertCooldownLogSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  mode: cooldownLogModeSchema,
  blocksCompleted: z.array(z.string()).optional(),
  abGameAnswers: abGameAnswersSchema.optional(),
  notes: z.string().max(500, "notes tem limite de 500 caracteres").nullable().optional(),
}).strict();

export const updateCooldownLogSchema = z.object({
  blocksCompleted: z.array(z.string()).optional(),
  abGameAnswers: abGameAnswersSchema.optional(),
  completedAt: z.union([z.string(), z.date()]).optional(),
  durationMinutes: z.number().int().nonnegative().optional(),
  notes: z.string().max(500, "notes tem limite de 500 caracteres").nullable().optional(),
  // Sprint Cooldown-2 — Bloco 3/4
  tiltSelfAssessment: z
    .object({
      feltTilt: z.number().min(0).max(10),
      keptTilting: z.number().min(0).max(10),
      presence: z.number().min(0).max(10),
      triggers: z.array(z.string()),
      action: z.string().max(500),
    })
    .optional(),
  sleepIntent: z.boolean().nullable().optional(),
}).strict();

export const insertStarredHandSchema = z.object({
  userId: z.string().min(1),
  // Sprint Spot-Anki-Reentry-3 (ADR-138) — sessionId/sessionTournamentId
  // relaxados para nullable (drill spots orfaos do cron).
  sessionId: z.string().min(1).nullable().optional(),
  sessionTournamentId: z.string().min(1).nullable().optional(),
  cooldownLogId: z.string().min(1).nullable().optional(),
  type: starredHandTypeSchema,
  spot: starredHandSpotSchema,
  notes: z.string().max(500, "notes tem limite de 500 caracteres").optional(),
  // Sprint F2 — campos opcionais (lesson #7 schema deprecation gradual).
  // Cooldown-1 cria rows sem esses campos; F2 paste flow preenche.
  imageUrl: z.string().optional(),
  conclusion: z.string().max(500, "conclusion tem limite de 500 caracteres").optional(),
  reviewedAt: z.union([z.string(), z.date()]).optional(),
  reviewLater: z.boolean().optional(),
  expiresAt: z.union([z.string(), z.date()]).optional(),
  pastedAt: z.union([z.string(), z.date()]).optional(),
  source: starredHandSourceSchema.optional(),
  status: starredHandStatusSchema.optional(),
  // Sprint Spot-Screenshots — campos opcionais (lesson #7).
  imageKey: z.string().max(255).nullable().optional(),
  imageMime: z.string().max(50).nullable().optional(),
  imageSize: z.number().int().nonnegative().nullable().optional(),
  imageWidth: z.number().int().nonnegative().nullable().optional(),
  imageHeight: z.number().int().nonnegative().nullable().optional(),
  capturedDuring: starredHandCapturedDuringSchema.optional(),
  // Sprint Spot-Anki-Reentry-3 (RF-1.1) — campos semanticos.
  insight: z.string().max(1000, "insight max 1000 chars").nullable().optional(),
  decisionCorrect: z.boolean().nullable().optional(),
  confidenceLevel: z.number().int().min(1).max(5).nullable().optional(),
  tags: z.array(z.string().max(40)).max(10).nullable().optional(),
}).strict();

// Sprint Spot-Anki-Reentry-3 (RF-1.5) — body do PATCH /api/starred-hands/:id
// extendido com campos semanticos. Tudo opcional (patch parcial). Strict.
//
// Sprint Spot-Anki-Reentry-3 (MEDIUM-2 audit fix) — refine cross-field:
// quando decisionCorrect === false, insight nao pode ser vazio.
// Patch parcial: regra so dispara se decisionCorrect for enviado.
export const updateStarredHandInsightSchema = z.object({
  insight: z.string().max(1000, "insight max 1000 chars").nullable().optional(),
  decisionCorrect: z.boolean().nullable().optional(),
  confidenceLevel: z
    .number()
    .int()
    .min(1, "confidence_level minimo 1")
    .max(5, "confidence_level maximo 5")
    .nullable()
    .optional(),
  tags: z
    .array(z.string().max(40, "tag max 40 chars"))
    .max(10, "max 10 tags por spot")
    .nullable()
    .optional(),
}).strict().refine(
  (data) => {
    // Se decisionCorrect=false foi enviado, insight precisa ter conteudo.
    if (data.decisionCorrect === false) {
      const txt = (data.insight ?? "").trim();
      if (txt.length === 0) return false;
    }
    return true;
  },
  {
    message: "INSIGHT_REQUIRED_WHEN_DECISION_INCORRECT",
    path: ["insight"],
  },
);

// Sprint F2 — body do PATCH /api/starred-hands/:id/review
// Tudo opcional. Conclusion/notes max 500. Strict rejeita campos desconhecidos
// (defesa contra injecao de userId/id/createdAt).
export const updateSpotReviewSchema = z.object({
  conclusion: z.string().max(500, "conclusion tem limite de 500 caracteres").optional(),
  reviewLater: z.boolean().optional(),
  sessionTournamentId: z.string().min(1).optional(),
  type: starredHandTypeSchema.optional(),
  spot: starredHandSpotSchema.optional(),
  notes: z.string().max(500, "notes tem limite de 500 caracteres").optional(),
}).strict();

export type CooldownLog = typeof cooldownLogs.$inferSelect;
export type InsertCooldownLog = z.infer<typeof insertCooldownLogSchema>;
export type UpdateCooldownLog = z.infer<typeof updateCooldownLogSchema>;
export type CooldownLogMode = typeof COOLDOWN_LOG_MODES[number];

export type StarredHand = typeof starredHands.$inferSelect;
export type InsertStarredHand = z.infer<typeof insertStarredHandSchema>;
export type StarredHandType = typeof STARRED_HAND_TYPES[number];
export type StarredHandSpot = typeof STARRED_HAND_SPOTS[number];

// -----------------------------------------------------------------------------
// Sprint Cooldown-2 — Tilt Self-Assessment + Sleep Gate Zod schemas
// -----------------------------------------------------------------------------

export const TILT_TRIGGERS = [
  "cooler",
  "slowroll",
  "big-bluff-fail",
  "downswing",
  "distracao",
  "fome",
  "sono",
  "briga-interpessoal",
  "outro",
] as const;

export const tiltTriggerSchema = z.enum(TILT_TRIGGERS);
export type TiltTrigger = typeof TILT_TRIGGERS[number];

export const tiltSelfAssessmentSchema = z.object({
  feltTilt: z.number().min(0).max(10),
  keptTilting: z.number().min(0).max(10),
  presence: z.number().min(0).max(10),
  triggers: z.array(tiltTriggerSchema),
  action: z.string().max(500, "action tem limite de 500 caracteres"),
});

export const sleepGateInputSchema = z.object({
  sleepIntent: z.boolean(),
  planClosed: z.boolean().optional(),
});

export type SleepGateInput = z.infer<typeof sleepGateInputSchema>;

// =============================================================================
// Sprint Session-End Reconciliation V2 — RF-07 / ADR-046
// session_wallet_snapshots: estado da banca por wallet por sessao
// =============================================================================

export const sessionWalletSnapshots = pgTable("session_wallet_snapshots", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  sessionId: varchar("session_id")
    .notNull()
    .references(() => grindSessions.id, { onDelete: "cascade" }),
  walletId: varchar("wallet_id")
    .notNull()
    .references(() => wallets.id, { onDelete: "cascade" }),
  nativeCurrency: varchar("native_currency", { length: 8 }).notNull(),
  openingBalance: decimal("opening_balance").notNull(),
  closingBalance: decimal("closing_balance"),
  expectedDelta: decimal("expected_delta").notNull(),
  manualAdjustment: decimal("manual_adjustment"),
  contributingTournamentIds: jsonb("contributing_tournament_ids")
    .$type<string[]>()
    .default([]),
  reason: varchar("reason").notNull().default("session_result"),
  walletTransactionId: varchar("wallet_transaction_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_session_wallet_snapshot").on(table.sessionId, table.walletId),
  index("idx_session_wallet_snapshots_user").on(table.userId, table.sessionId),
]);

export const insertSessionWalletSnapshotSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  walletId: z.string().min(1),
  nativeCurrency: z.string().min(1).max(8),
  openingBalance: z.union([z.string(), z.number()]),
  closingBalance: z.union([z.string(), z.number()]).nullable().optional(),
  expectedDelta: z.union([z.string(), z.number()]),
  manualAdjustment: z.union([z.string(), z.number()]).nullable().optional(),
  contributingTournamentIds: z.array(z.string()).default([]),
  reason: z.literal("session_result").default("session_result"),
  walletTransactionId: z.string().nullable().optional(),
}).strict();

export type SessionWalletSnapshot = typeof sessionWalletSnapshots.$inferSelect;
export type InsertSessionWalletSnapshot = z.infer<typeof insertSessionWalletSnapshotSchema>;

// =============================================================================
// Sprint F3 — Stats Analyzer (ADR-051)
// hud_layouts: presets de stats HUD (PT4 / HM3 / customizado)
// hud_stat_snapshots: medicoes pontuais de stats por layout
// =============================================================================

export const STAT_FIELD_GROUPS = [
  "preflop",
  "flop",
  "turn",
  "river",
  "showdown",
  "agg",
  "other",
] as const;

export const HUD_SNAPSHOT_SOURCES = ["manual", "ocr-v2", "handhistory"] as const;

const statFieldZodSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_]*$/, "key must be snake_case"),
  label: z.string().min(1).max(64),
  decimals: z.number().int().min(0).max(4).default(1),
  suffix: z.string().max(8).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  group: z.enum(STAT_FIELD_GROUPS).optional(),
  // Sprint F4 W3 — target range inline + ref ao knowledge base hud_stat_targets.
  targetMin: z.number().optional(),
  targetMax: z.number().optional(),
  targetRef: z.string().max(128).optional(),
});

const sectionZodSchema = z.object({
  label: z.string().min(1).max(64),
  stats: z.array(statFieldZodSchema).min(1),
  sortOrder: z.number().int().min(0),
});

export const hudLayoutSectionsZodSchema = z
  .array(sectionZodSchema)
  .min(1)
  .max(20)
  .superRefine((sections, ctx) => {
    const seen = new Set<string>();
    for (const sec of sections) {
      for (const s of sec.stats) {
        if (seen.has(s.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate stat key: ${s.key}`,
            path: ["sections"],
          });
        }
        seen.add(s.key);
      }
    }
  });

export type HudStatField = z.infer<typeof statFieldZodSchema>;
export type HudSection = z.infer<typeof sectionZodSchema>;

// Sprint Stats-V3 (ADR-064): fields_json holds custom stats + target overrides
// per layout. Schema validacao zod abaixo aceita dois shapes (custom + override).
// Sprint stats-themes-linking-1 (ADR-141 §2.2): linkedThemes adicionado em
// custom fields para write-through unidirecional custom_X -> theme.linkedStats.
export interface HudLayoutFieldEntry {
  // Compartilhado: pode ser id de catalog (override) OU id custom (`custom_*`).
  id: string;
  // Custom-only:
  isCustom?: boolean;
  label?: string;
  group?: string;
  unit?: "pct" | "bb" | "count";
  direction?: "higher_better" | "lower_better" | "context" | "neutral";
  // Compartilhado: targetMin/targetMax (custom) ou targetOverride (catalog override)
  targetMin?: number;
  targetMax?: number;
  targetOverride?: { min: number; max: number } | null;
  // Sprint stats-themes-linking-1 (ADR-141): theme IDs do user. Hard cap 20 backend.
  linkedThemes?: string[];
}

export const hudLayouts = pgTable(
  "hud_layouts",
  {
    id: varchar("id").primaryKey().notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    sections: jsonb("sections").$type<HudSection[]>().notNull(),
    fieldsJson: jsonb("fields_json")
      .$type<HudLayoutFieldEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_hud_layouts_user").on(table.userId),
    uniqueIndex("uq_hud_layouts_default")
      .on(table.userId)
      .where(sql`${table.isDefault} = true`),
  ],
);

// Stats-V3 (ADR-064/RF-05/RF-07): fields_json entries.
// Sprint stats-themes-linking-1 (ADR-141 §2.2): linkedThemes opcional + default
// (lesson #7 — back-compat com layouts existentes que nao tinham o campo).
const hudLayoutFieldEntrySchema = z.object({
  id: z.string().min(1).max(80),
  isCustom: z.boolean().optional(),
  label: z.string().min(1).max(60).optional(),
  group: z.string().min(1).max(60).optional(),
  unit: z.enum(["pct", "bb", "count"]).optional(),
  direction: z
    .enum(["higher_better", "lower_better", "context", "neutral"])
    .optional(),
  targetMin: z.number().optional(),
  targetMax: z.number().optional(),
  targetOverride: z
    .object({ min: z.number(), max: z.number() })
    .nullable()
    .optional(),
  linkedThemes: z.array(z.string()).max(20).optional(),
});

export const insertHudLayoutSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(80),
  isDefault: z.boolean().optional().default(false),
  sections: hudLayoutSectionsZodSchema,
  fieldsJson: z.array(hudLayoutFieldEntrySchema).optional().default([]),
});

export const updateHudLayoutSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  isDefault: z.boolean().optional(),
  sections: hudLayoutSectionsZodSchema.optional(),
  fieldsJson: z.array(hudLayoutFieldEntrySchema).optional(),
  // Aceita snake_case do payload V3 (handlers passam fields_json direto).
  fields_json: z.array(hudLayoutFieldEntrySchema).optional(),
});

export type HudLayout = typeof hudLayouts.$inferSelect;
export type InsertHudLayout = z.infer<typeof insertHudLayoutSchema>;
export type UpdateHudLayout = z.infer<typeof updateHudLayoutSchema>;

export const HUD_CAPTURE_METHODS = ["manual", "paste", "csv", "ocr"] as const;
export type HudCaptureMethod = (typeof HUD_CAPTURE_METHODS)[number];

export const hudStatSnapshots = pgTable(
  "hud_stat_snapshots",
  {
    id: varchar("id").primaryKey().notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    layoutId: varchar("layout_id")
      .notNull()
      .references(() => hudLayouts.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at").defaultNow().notNull(),
    source: varchar("source", { length: 16 }).notNull().default("manual"),
    values: jsonb("values").$type<Record<string, number | null>>().notNull(),
    sampleSize: integer("sample_size"),
    sessionId: varchar("session_id").references(() => grindSessions.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    // Stats-V3: capture lineage + OCR metadata (migration 0020)
    captureMethod: varchar("capture_method", { length: 20 })
      .notNull()
      .default("manual"),
    sourceImageKey: varchar("source_image_key", { length: 255 }),
    ocrConfidence: jsonb("ocr_confidence").$type<Record<string, number>>(),
    ocrRawResponse: jsonb("ocr_raw_response").$type<unknown>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_hud_snapshots_user_layout").on(
      table.userId,
      table.layoutId,
      table.capturedAt,
    ),
  ],
);

// Stats-V3 (ADR-065 / RF-12): audit log de chamadas OCR para rate limit + telemetria.
export const hudOcrAudit = pgTable(
  "hud_ocr_audit",
  {
    id: varchar("id").primaryKey().notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_hud_ocr_audit_user_created").on(table.userId, table.createdAt),
  ],
);

export type HudOcrAuditRow = typeof hudOcrAudit.$inferSelect;

const snapshotValuesZodSchema = z
  .record(z.string().min(1).max(64), z.number().nullable())
  .refine((v) => Object.keys(v).length > 0, {
    message: "values must contain at least one stat",
  });

export const insertHudStatSnapshotSchema = z.object({
  userId: z.string().min(1),
  layoutId: z.string().min(1),
  source: z.enum(HUD_SNAPSHOT_SOURCES).optional().default("manual"),
  capturedAt: z
    .union([z.string(), z.date()])
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  values: snapshotValuesZodSchema,
  sampleSize: z.number().int().positive().optional().nullable(),
  sessionId: z.string().min(1).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type HudStatSnapshot = typeof hudStatSnapshots.$inferSelect;
export type InsertHudStatSnapshot = z.infer<typeof insertHudStatSnapshotSchema>;

// =============================================================================
// Sprint F4 — hud_stat_targets (knowledge base global, ADR-088)
// =============================================================================

export const HUD_STAT_FORMATS = [
  "mtt-6max",
  "mtt-9max",
  "mtt-hu",
  "cash-6max",
  "cash-9max",
  "cash-hu",
] as const;

export const HUD_STAT_STAKE_BUCKETS = ["micro", "low", "mid", "high"] as const;

export const HUD_STAT_TARGET_SOURCES = [
  "founder",
  "gto-wizard",
  "community",
] as const;

export const hudStatTargets = pgTable(
  "hud_stat_targets",
  {
    id: varchar("id").primaryKey().notNull(),
    statKey: varchar("stat_key").notNull(),
    format: varchar("format").notNull(),
    stakeBucket: varchar("stake_bucket").notNull(),
    targetMin: decimal("target_min").notNull(),
    targetMax: decimal("target_max").notNull(),
    source: varchar("source").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_hud_stat_targets").on(
      table.statKey,
      table.format,
      table.stakeBucket,
      table.version,
    ),
    index("idx_hud_stat_targets_lookup").on(
      table.statKey,
      table.format,
      table.stakeBucket,
    ),
  ],
);

export const insertHudStatTargetSchema = z.object({
  statKey: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_]*$/),
  format: z.enum(HUD_STAT_FORMATS),
  stakeBucket: z.enum(HUD_STAT_STAKE_BUCKETS),
  targetMin: z.union([z.string(), z.number()]),
  targetMax: z.union([z.string(), z.number()]),
  source: z.enum(HUD_STAT_TARGET_SOURCES).default("founder"),
  version: z.number().int().positive().default(1),
});

export type HudStatTarget = typeof hudStatTargets.$inferSelect;
export type InsertHudStatTarget = z.infer<typeof insertHudStatTargetSchema>;

// =============================================================================
// Sprint Biblioteca-1 — Schema RF-01 (ADRs 071-076)
// 7 tabelas + 3 enums. Migration numerada (proxima disponivel).
// =============================================================================

// --- Enums ---------------------------------------------------------------
export const libraryAccessSourceEnum = pgEnum("library_access_source", [
  "admin",
  "purchase",
  "bundle",
  "subscription",
]);

export const libraryEventTypeEnum = pgEnum("library_event_type", [
  "view",
  "play",
  "pause",
  "seek",
  "complete",
  "note_create",
  "coach_recommend",
  "access_blocked",
  "prologue_viewed",  // ADR-097 — Sprint Bloco-A-Polish (Migration 0035)
  "prologue_skipped", // ADR-097 — Sprint Bloco-A-Polish (Migration 0035)
]);

export const libraryFormatEnum = pgEnum("library_format", [
  "video",
  "podcast",
  "article",
]);

// --- library_courses -----------------------------------------------------
export const libraryCourses = pgTable(
  "library_courses",
  {
    id: varchar("id").primaryKey().notNull(),
    slug: varchar("slug", { length: 80 }).notNull().unique(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    coverKey: text("cover_key"),
    displayOrder: integer("display_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_library_courses_published").on(table.isPublished, table.displayOrder),
  ],
);

// --- library_modules -----------------------------------------------------
export const libraryModules = pgTable(
  "library_modules",
  {
    id: varchar("id").primaryKey().notNull(),
    courseId: varchar("course_id")
      .notNull()
      .references(() => libraryCourses.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 80 }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    coverKey: text("cover_key"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_library_modules_course_slug").on(table.courseId, table.slug),
    index("idx_library_modules_course").on(table.courseId, table.displayOrder),
  ],
);

// --- library_lessons -----------------------------------------------------
export const libraryLessons = pgTable(
  "library_lessons",
  {
    id: varchar("id").primaryKey().notNull(),
    moduleId: varchar("module_id")
      .notNull()
      .references(() => libraryModules.id, { onDelete: "cascade" }),
    courseId: varchar("course_id")
      .notNull()
      .references(() => libraryCourses.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 80 }).notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    categoryId: varchar("category_id", { length: 40 }).notNull(),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    coverKey: text("cover_key"),
    videoMuxAssetId: text("video_mux_asset_id"),
    videoMuxPlaybackId: text("video_mux_playback_id"),
    videoDurationSeconds: integer("video_duration_seconds"),
    audioKey: text("audio_key"),
    audioDurationSeconds: integer("audio_duration_seconds"),
    audioMimeType: varchar("audio_mime_type", { length: 60 }).default("audio/mp4"),
    articleHtml: text("article_html"),
    articleWordCount: integer("article_word_count"),
    // Sprint Biblioteca-2 / RF-08 + ADR-095: learning_objectives auto-extraidos
    // do HTML pelo manifestImporter; usados em hero da aula + Coach AI tools.
    // Migration 0034 adiciona coluna com default '[]'::jsonb (back-compat).
    learningObjectives: jsonb("learning_objectives")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    displayOrder: integer("display_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    // Sprint Mini Player 3 / RF-04.2 (migration 0078).
    // Primeiros 80 chars do transcription_full + ellipsis (NULL se transcricao
    // ausente). Pre-computado em ingestion para evitar N+1 no UI.
    transcriptionPreview: varchar("transcription_preview", { length: 120 }),
    // Sprint Mini Player 3.2 / W-A4 (migration 0080). Multi-lang previews
    // por language code, e.g.: { "pt": "...", "en": "..." }. Coluna varchar
    // acima (transcriptionPreview) continua como espelho de back-compat
    // para lang='pt' (drop deferred MP3.3+).
    transcriptionPreviews: jsonb("transcription_previews").$type<
      Record<string, string>
    >(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_library_lessons_course_slug").on(table.courseId, table.slug),
    index("idx_library_lessons_module").on(table.moduleId, table.displayOrder),
    index("idx_library_lessons_category").on(table.categoryId, table.isPublished),
  ],
);

// --- library_lesson_assets (placeholder generico para imgs do artigo, etc) ---
export const libraryLessonAssets = pgTable(
  "library_lesson_assets",
  {
    id: varchar("id").primaryKey().notNull(),
    lessonId: varchar("lesson_id")
      .notNull()
      .references(() => libraryLessons.id, { onDelete: "cascade" }),
    assetKey: text("asset_key").notNull(),
    mimeType: varchar("mime_type", { length: 60 }),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_library_lesson_assets_lesson").on(table.lessonId),
  ],
);

// --- user_lesson_access (ADR-073) ---------------------------------------
export const userLessonAccess = pgTable(
  "user_lesson_access",
  {
    id: varchar("id").primaryKey().notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    lessonId: varchar("lesson_id")
      .notNull()
      .references(() => libraryLessons.id, { onDelete: "cascade" }),
    source: libraryAccessSourceEnum("source").notNull(),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
    grantedBy: varchar("granted_by"),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    uniqueIndex("uq_user_lesson_access_user_lesson").on(table.userId, table.lessonId),
    index("idx_user_lesson_access_user").on(table.userId),
  ],
);

// --- library_events -----------------------------------------------------
export const libraryEvents = pgTable(
  "library_events",
  {
    id: varchar("id").primaryKey().notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    lessonId: varchar("lesson_id")
      .notNull()
      .references(() => libraryLessons.id, { onDelete: "cascade" }),
    eventType: libraryEventTypeEnum("event_type").notNull(),
    format: libraryFormatEnum("format"),
    positionSeconds: integer("position_seconds"),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
    eventTimestamp: timestamp("event_timestamp").defaultNow().notNull(),
  },
  (table) => [
    index("idx_library_events_user_lesson_ts").on(
      table.userId,
      table.lessonId,
      table.eventTimestamp,
    ),
    index("idx_library_events_user_ts").on(table.userId, table.eventTimestamp),
  ],
);

// --- library_progress (ADR-074) ----------------------------------------
export const libraryProgress = pgTable(
  "library_progress",
  {
    id: varchar("id").primaryKey().notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    lessonId: varchar("lesson_id")
      .notNull()
      .references(() => libraryLessons.id, { onDelete: "cascade" }),
    format: libraryFormatEnum("format").notNull(),
    lastPositionSeconds: integer("last_position_seconds").notNull().default(0),
    totalDurationSeconds: integer("total_duration_seconds"),
    completedAt: timestamp("completed_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_library_progress_user_lesson_format").on(
      table.userId,
      table.lessonId,
      table.format,
    ),
  ],
);

// --- Relations ----------------------------------------------------------
export const libraryCoursesRelations = relations(libraryCourses, ({ many }) => ({
  modules: many(libraryModules),
  lessons: many(libraryLessons),
}));

export const libraryModulesRelations = relations(libraryModules, ({ one, many }) => ({
  course: one(libraryCourses, {
    fields: [libraryModules.courseId],
    references: [libraryCourses.id],
  }),
  lessons: many(libraryLessons),
}));

export const libraryLessonsRelations = relations(libraryLessons, ({ one, many }) => ({
  module: one(libraryModules, {
    fields: [libraryLessons.moduleId],
    references: [libraryModules.id],
  }),
  course: one(libraryCourses, {
    fields: [libraryLessons.courseId],
    references: [libraryCourses.id],
  }),
  access: many(userLessonAccess),
  events: many(libraryEvents),
  progress: many(libraryProgress),
  assets: many(libraryLessonAssets),
}));

export const userLessonAccessRelations = relations(userLessonAccess, ({ one }) => ({
  user: one(users, {
    fields: [userLessonAccess.userId],
    references: [users.userPlatformId],
  }),
  lesson: one(libraryLessons, {
    fields: [userLessonAccess.lessonId],
    references: [libraryLessons.id],
  }),
}));

export const libraryEventsRelations = relations(libraryEvents, ({ one }) => ({
  user: one(users, {
    fields: [libraryEvents.userId],
    references: [users.userPlatformId],
  }),
  lesson: one(libraryLessons, {
    fields: [libraryEvents.lessonId],
    references: [libraryLessons.id],
  }),
}));

export const libraryProgressRelations = relations(libraryProgress, ({ one }) => ({
  user: one(users, {
    fields: [libraryProgress.userId],
    references: [users.userPlatformId],
  }),
  lesson: one(libraryLessons, {
    fields: [libraryProgress.lessonId],
    references: [libraryLessons.id],
  }),
}));

// =============================================================================
// Sprint UX-Biblioteca-1 / RF-02 — library_access_requests (ADR-103)
// Pedidos de liberacao de acesso alpha (substitui mailto cru).
// Migration 0036_library_access_requests.sql.
// =============================================================================

export const libraryAccessRequestStatusEnum = pgEnum(
  "library_access_request_status",
  ["pending", "approved", "denied"] as const,
);

export const libraryAccessRequests = pgTable(
  "library_access_requests",
  {
    id: varchar("id").primaryKey().notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    subscriptionPlanSnapshot: varchar("subscription_plan_snapshot", { length: 50 }).notNull(),
    reason: text("reason").notNull(),
    status: libraryAccessRequestStatusEnum("status").notNull().default("pending"),
    reviewedBy: varchar("reviewed_by").references(
      () => users.userPlatformId,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at"),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // UNIQUE INDEX parcial WHERE status = 'pending' — idempotencia em nivel
    // de banco (race condition resolvida pelo Postgres com 23505).
    uniqueIndex("uniq_library_access_requests_user_pending")
      .on(table.userId)
      .where(sql`${table.status} = 'pending'`),
    index("idx_library_access_requests_user_status")
      .on(table.userId, table.status, table.createdAt),
    index("idx_library_access_requests_status_created")
      .on(table.status, table.createdAt),
  ],
);

export const libraryAccessRequestsRelations = relations(
  libraryAccessRequests,
  ({ one }) => ({
    user: one(users, {
      fields: [libraryAccessRequests.userId],
      references: [users.userPlatformId],
    }),
    reviewer: one(users, {
      fields: [libraryAccessRequests.reviewedBy],
      references: [users.userPlatformId],
    }),
  }),
);

export const insertLibraryAccessRequestSchema = createInsertSchema(
  libraryAccessRequests,
).omit({
  id: true,
  status: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNotes: true,
  createdAt: true,
  updatedAt: true,
});

export type LibraryAccessRequest = typeof libraryAccessRequests.$inferSelect;
export type InsertLibraryAccessRequest = z.infer<
  typeof insertLibraryAccessRequestSchema
>;

// Expose `_` marker on every library table so smoke tests asserting
// `(table as any)._` continue to validate "is a Drizzle table" without
// depending on internal Drizzle symbols (which are not enumerable / public).
// This does not alter Drizzle behavior — purely a metadata marker.
const _libraryTableMarker = { __drizzleTable: true } as const;
for (const t of [
  libraryCourses,
  libraryModules,
  libraryLessons,
  libraryLessonAssets,
  userLessonAccess,
  libraryEvents,
  libraryProgress,
  libraryAccessRequests,
] as any[]) {
  if (!t._) Object.defineProperty(t, "_", { value: _libraryTableMarker, enumerable: false });
}

// --- Insert schemas (drizzle-zod) ---------------------------------------
// Spec D13: categoryId valida contra enum; tags default [].
// Lesson #7: optional + default em vez de required puro para evitar friction
// em testes / manifest import.

export const insertLibraryCourseSchema = createInsertSchema(libraryCourses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLibraryModuleSchema = createInsertSchema(libraryModules).omit({
  id: true,
  createdAt: true,
});

const _insertLibraryLessonBase = createInsertSchema(libraryLessons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLibraryLessonSchema = _insertLibraryLessonBase.extend({
  // Garantir validacao do enum hard-coded D13
  categoryId: z.enum(LIBRARY_CATEGORY_IDS as readonly [LibraryCategoryId, ...LibraryCategoryId[]]),
  tags: z.array(z.string()).optional().default([]),
  // Sprint Biblioteca-2 / RF-08 + ADR-095: learning_objectives.
  // Optional + default([]) (Lesson #7) — back-compat com inserts antigos.
  // Cap 10 items, cada item entre 1 e 200 chars (D5 + ADR-095).
  learningObjectives: z
    .array(z.string().min(1).max(200))
    .max(10)
    .optional()
    .default([]),
});

export const insertUserLessonAccessSchema = createInsertSchema(userLessonAccess).omit({
  id: true,
  grantedAt: true,
});

export const insertLibraryEventSchema = createInsertSchema(libraryEvents).omit({
  id: true,
  eventTimestamp: true,
});

export const insertLibraryProgressSchema = createInsertSchema(libraryProgress).omit({
  id: true,
  updatedAt: true,
});

export const insertLibraryLessonAssetSchema = createInsertSchema(libraryLessonAssets).omit({
  id: true,
  createdAt: true,
});

// --- Types --------------------------------------------------------------
export type LibraryCourse = typeof libraryCourses.$inferSelect;
export type InsertLibraryCourse = z.infer<typeof insertLibraryCourseSchema>;
export type LibraryModule = typeof libraryModules.$inferSelect;
export type InsertLibraryModule = z.infer<typeof insertLibraryModuleSchema>;
export type LibraryLesson = typeof libraryLessons.$inferSelect;
export type InsertLibraryLesson = z.infer<typeof insertLibraryLessonSchema>;
export type UserLessonAccess = typeof userLessonAccess.$inferSelect;
export type InsertUserLessonAccess = z.infer<typeof insertUserLessonAccessSchema>;
export type LibraryEvent = typeof libraryEvents.$inferSelect;
export type InsertLibraryEvent = z.infer<typeof insertLibraryEventSchema>;
export type LibraryProgress = typeof libraryProgress.$inferSelect;
export type InsertLibraryProgress = z.infer<typeof insertLibraryProgressSchema>;
export type LibraryLessonAsset = typeof libraryLessonAssets.$inferSelect;
export type InsertLibraryLessonAsset = z.infer<typeof insertLibraryLessonAssetSchema>;

// =============================================================================
// Sprint Coach Sprint 0 + Coach-2B — schemas (ADRs 077, 084, 085, 086, 087)
// Migration: migrations/0024_coach_2b_actions_leak_focus.sql
// =============================================================================

// -----------------------------------------------------------------------------
// user_coach_preferences — ADR-084 (RF-01 do Sprint 0)
// -----------------------------------------------------------------------------
export const userCoachPreferences = pgTable("user_coach_preferences", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().unique()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),

  nudgeBSnapshot: boolean("nudge_b_snapshot").notNull().default(true),
  nudgeBLeak: boolean("nudge_b_leak").notNull().default(true),
  nudgeBStudy: boolean("nudge_b_study").notNull().default(true),
  nudgeBVolume: boolean("nudge_b_volume").notNull().default(true),
  nudgeBGrade: boolean("nudge_b_grade").notNull().default(true),
  nudgeBDownswing: boolean("nudge_b_downswing").notNull().default(true),
  nudgeBLife: boolean("nudge_b_life").notNull().default(false),
  nudgeBMental: boolean("nudge_b_mental").notNull().default(false),

  quietHoursStart: integer("quiet_hours_start").notNull().default(21),
  quietHoursEnd: integer("quiet_hours_end").notNull().default(9),

  maxNudgesPerDay: integer("max_nudges_per_day").notNull().default(3),
  maxNudgesPerHour: integer("max_nudges_per_hour").notNull().default(1),

  channelInApp: boolean("channel_in_app").notNull().default(true),
  channelEmail: boolean("channel_email").notNull().default(true),
  channelPush: boolean("channel_push").notNull().default(false),

  coachTone: varchar("coach_tone", { length: 20 }).notNull().default("balanced"),

  // Sprint AI-1A / RF-02 (ADR-152) — estado de auto-congelamento por categoria.
  // Mapa { [category]: { frozenAt, reason: 'auto_dismiss_rate'|'admin'|'manual',
  //   dismissRate?, windowDays? } }. NOT NULL DEFAULT '{}'. Migration 0066.
  frozenCategories: jsonb("frozen_categories").notNull().default(sql`'{}'::jsonb`),

  // Sprint AI-1B (ADR-155/157) — opt-in do Weekly Report + toggles das 2 categorias novas.
  // Migration 0067.
  reportWeeklyEnabled: boolean("report_weekly_enabled").notNull().default(false),
  nudgeBGapcheck: boolean("nudge_b_gapcheck").notNull().default(true),
  nudgeBImport: boolean("nudge_b_import").notNull().default(true),

  // Sprint AI-1C (ADR-159) — opt-in Daily Debrief + Monthly Report. Migration 0068.
  reportDailyEnabled: boolean("report_daily_enabled").notNull().default(false),
  reportMonthlyEnabled: boolean("report_monthly_enabled").notNull().default(false),

  // Sprint AI-2B (migration 0071) — colunas que ja existem no DB fisico mas faltavam
  // no drizzle (schema drift corrigido em EST-1 / RF-01, ADR-223 §Decisao 1).
  // Defaults false aqui (o flip pra true e da migration 0086, nao do drizzle).
  reportQuarterlyEnabled: boolean("report_quarterly_enabled").notNull().default(false),
  emailWeeklyEnabled: boolean("email_weekly_enabled").notNull().default(false),
  emailMonthlyEnabled: boolean("email_monthly_enabled").notNull().default(false),
  emailQuarterlyEnabled: boolean("email_quarterly_enabled").notNull().default(false),
  disclaimerAcceptedAt: timestamp("disclaimer_accepted_at"),

  // Sprint Mini Player 2 (RF-NEW.2) — sleep timer preset. NULL = nao auto-ativa. Migration 0076.
  audioSleepTimerMinutes: integer("audio_sleep_timer_minutes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_user_coach_preferences_user").on(table.userId),
]);

// =============================================================================
// Sprint Mini Player 2 (ADR-190) — spotify_tokens. Migration 0077.
// =============================================================================
// =============================================================================
// Sprint Mini Player 3 (ADR-193) — audio_queue_snapshots. Migration 0078.
// Queue persistence server-side opcional (local primario, server best-effort).
// last-write-wins por `version` int incremental.
// =============================================================================
export const audioQueueSnapshots = pgTable("audio_queue_snapshots", {
  userId: varchar("user_id").primaryKey()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  queue: jsonb("queue_jsonb").notNull().default(sql`'[]'::jsonb`),
  repeatMode: varchar("repeat_mode", { length: 8 }).notNull().default("off"),
  shuffleEnabled: boolean("shuffle_enabled").notNull().default(false),
  shuffledOrder: jsonb("shuffled_order"),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const spotifyTokens = pgTable("spotify_tokens", {
  userId: varchar("user_id").primaryKey()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  refreshTokenIv: varchar("refresh_token_iv", { length: 32 }).notNull(),
  refreshTokenAuthTag: varchar("refresh_token_auth_tag", { length: 32 }).notNull(),
  accessTokenHash: varchar("access_token_hash", { length: 64 }),
  expiresAt: timestamp("expires_at"),
  scopes: jsonb("scopes").notNull().default(sql`'[]'::jsonb`),
  displayName: varchar("display_name"),
  displayNameHash: varchar("display_name_hash", { length: 64 }),
  spotifyUserId: varchar("spotify_user_id"),
  // B-PRODUCTTIER (migration 0084) — me.product do Spotify (premium/free/open).
  productTier: varchar("product_tier"),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  disconnectedAt: timestamp("disconnected_at"),
  lastRefreshAt: timestamp("last_refresh_at"),
  refreshFailureCount: integer("refresh_failure_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const updateCoachPreferencesSchema = z.object({
  nudgeBSnapshot: z.boolean().optional(),
  nudgeBLeak: z.boolean().optional(),
  nudgeBStudy: z.boolean().optional(),
  nudgeBVolume: z.boolean().optional(),
  nudgeBGrade: z.boolean().optional(),
  nudgeBDownswing: z.boolean().optional(),
  nudgeBLife: z.boolean().optional(),
  nudgeBMental: z.boolean().optional(),
  quietHoursStart: z.number().int().min(0).max(23).optional(),
  quietHoursEnd: z.number().int().min(0).max(23).optional(),
  maxNudgesPerDay: z.number().int().min(0).max(10).optional(),
  maxNudgesPerHour: z.number().int().min(0).max(10).optional(),
  channelInApp: z.boolean().optional(),
  channelEmail: z.boolean().optional(),
  channelPush: z.boolean().optional(),
  coachTone: z.enum(["gentle", "balanced", "direct"]).optional(),
  // Sprint AI-1B (ADR-155/157) — opt-in do Weekly Report + toggles novos.
  reportWeeklyEnabled: z.boolean().optional(),
  nudgeBGapcheck: z.boolean().optional(),
  nudgeBImport: z.boolean().optional(),
  // Sprint AI-1C (ADR-159) — opt-in Daily Debrief + Monthly Report.
  reportDailyEnabled: z.boolean().optional(),
  reportMonthlyEnabled: z.boolean().optional(),
  // Sprint EST-1 (ADR-223 §Decisao 1) — opt-ins de email + quarterly report.
  // disclaimerAcceptedAt NAO entra (spoofavel via PUT).
  reportQuarterlyEnabled: z.boolean().optional(),
  emailWeeklyEnabled: z.boolean().optional(),
  emailMonthlyEnabled: z.boolean().optional(),
  emailQuarterlyEnabled: z.boolean().optional(),
  // Sprint Mini Player 2 (RF-NEW.2) — sleep timer preset minutes. Aceita
  // exatamente [15, 30, 45, 60, 90] ou null (desativa). String/numero fora do
  // enum -> 400.
  audioSleepTimerMinutes: z
    .union([
      z.literal(15),
      z.literal(30),
      z.literal(45),
      z.literal(60),
      z.literal(90),
      z.null(),
    ])
    .optional(),
  // Sprint AI-1A / RF-02 — descongelar uma categoria via PUT. Congelamento NUNCA
  // eh setado via PUT (so auto-congelamento ou endpoint admin) — por isso so
  // `unfreezeCategory` (remover), nao `frozenCategories` (mapa cru).
  unfreezeCategory: z.enum([
    "B-SNAPSHOT", "B-LEAK", "B-STUDY", "B-VOLUME", "B-GRADE", "B-DOWNSWING", "B-LIFE", "B-MENTAL",
    "B-GAPCHECK", "B-IMPORT",
  ]).optional(),
}).strict().superRefine((val, ctx) => {
  if (val.maxNudgesPerHour !== undefined && val.maxNudgesPerDay !== undefined
      && val.maxNudgesPerHour > val.maxNudgesPerDay) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxNudgesPerHour"],
      message: "maxNudgesPerHour cannot exceed maxNudgesPerDay",
    });
  }
});

export type UserCoachPreferences = typeof userCoachPreferences.$inferSelect;
export type InsertUserCoachPreferences = typeof userCoachPreferences.$inferInsert;
export type UpdateCoachPreferencesInput = z.infer<typeof updateCoachPreferencesSchema>;

// -----------------------------------------------------------------------------
// coach_nudge_log — ADR-085 (RF-03 do Sprint 0)
// -----------------------------------------------------------------------------
export const coachNudgeLog = pgTable("coach_nudge_log", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),

  category: varchar("category", { length: 32 }).notNull(),
  cycleKey: varchar("cycle_key", { length: 16 }),
  status: varchar("status", { length: 16 }).notNull(),

  titleI18n: varchar("title_i18n", { length: 200 }),
  bodyPreview: text("body_preview"),
  channel: varchar("channel", { length: 16 }).default("in_app"),

  chatSessionId: varchar("chat_session_id"),
  triggeredByEvent: varchar("triggered_by_event", { length: 64 }),

  sentAt: timestamp("sent_at").defaultNow(),
  engagedAt: timestamp("engaged_at"),
  dismissedAt: timestamp("dismissed_at"),
  snoozeUntil: timestamp("snooze_until"),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_coach_nudge_log_user_sent").on(table.userId, table.sentAt),
  index("idx_coach_nudge_log_user_category_cycle")
    .on(table.userId, table.category, table.cycleKey),
  index("idx_coach_nudge_log_category_status_sent")
    .on(table.category, table.status, table.sentAt),
]);

export type CoachNudgeLog = typeof coachNudgeLog.$inferSelect;
export type InsertCoachNudgeLog = typeof coachNudgeLog.$inferInsert;

// -----------------------------------------------------------------------------
// coach_actions — ADR-077 (RF-01 do Coach-2B)
// -----------------------------------------------------------------------------
export const coachActions = pgTable("coach_actions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  chatSessionId: varchar("chat_session_id"),
  messageId: varchar("message_id"),
  toolUseId: varchar("tool_use_id", { length: 64 }),
  toolName: varchar("tool_name", { length: 64 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  input: jsonb("input"),
  result: jsonb("result"),
  errorMessage: text("error_message"),
  payloadBefore: jsonb("payload_before"),
  payloadAfter: jsonb("payload_after"),
  affectedEntityType: varchar("affected_entity_type", { length: 32 }),
  affectedEntityId: varchar("affected_entity_id"),
  requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
  confirmedAt: timestamp("confirmed_at"),
  undoExpiresAt: timestamp("undo_expires_at"),
  undoneAt: timestamp("undone_at"),
  latencyMs: integer("latency_ms"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_coach_actions_user_status")
    .on(table.userId, table.status, table.createdAt),
  index("idx_coach_actions_session").on(table.chatSessionId),
  index("idx_coach_actions_tool")
    .on(table.toolName, table.status, table.createdAt),
  index("idx_coach_actions_undo_window")
    .on(table.userId, table.undoExpiresAt),
  index("idx_coach_actions_pending_cleanup")
    .on(table.status, table.createdAt),
]);

export type CoachAction = typeof coachActions.$inferSelect;
export type InsertCoachAction = typeof coachActions.$inferInsert;

// -----------------------------------------------------------------------------
// coach_leak_focus — RF-05 do Coach-2B (log_leak_focus)
// -----------------------------------------------------------------------------
export const coachLeakFocus = pgTable("coach_leak_focus", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  leakCode: varchar("leak_code", { length: 64 }).notNull(),
  description: text("description").notNull(),
  targetMonth: varchar("target_month", { length: 7 }).notNull(),
  baselineStatKey: varchar("baseline_stat_key", { length: 128 }).notNull(),
  baselineValue: decimal("baseline_value").notNull(),
  baselineSampleSize: integer("baseline_sample_size").notNull(),
  studyPlanNotes: text("study_plan_notes"),
  status: varchar("status", { length: 16 }).default("active"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_coach_leak_focus_user_month").on(table.userId, table.targetMonth),
  uniqueIndex("uniq_coach_leak_focus_user_code_month")
    .on(table.userId, table.leakCode, table.targetMonth),
]);

export type CoachLeakFocus = typeof coachLeakFocus.$inferSelect;
export type InsertCoachLeakFocus = typeof coachLeakFocus.$inferInsert;

// =============================================================================
// coach_lesson_recommendations — Sprint home-reform-4 / Item 4 (ADR-111)
// Migration: migrations/0042_coach_lesson_recommendations.sql
// 1 recomendacao curada por user/semana. Coach IA + fallback determinista.
// =============================================================================

export const coachLessonRecommendations = pgTable(
  "coach_lesson_recommendations",
  {
    id: varchar("id").primaryKey().notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    lessonId: varchar("lesson_id")
      .notNull()
      .references(() => libraryLessons.id, { onDelete: "cascade" }),
    weekStartDate: date("week_start_date").notNull(),
    reason: text("reason").notNull(),
    /** 'coach' | 'fallback_leak_tag' | 'fallback_popular' | 'fallback_recent' | 'manual' */
    source: varchar("source", { length: 20 }).notNull(),
    inputSummary: jsonb("input_summary"),
    chatSessionId: varchar("chat_session_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    dismissedAt: timestamp("dismissed_at"),
    consumedAt: timestamp("consumed_at"),
  },
  (table) => [
    uniqueIndex("uq_coach_rec_user_week").on(table.userId, table.weekStartDate),
    index("idx_coach_rec_user_active").on(
      table.userId,
      table.dismissedAt,
      table.consumedAt,
    ),
    index("idx_coach_rec_lesson").on(table.lessonId),
  ],
);

export const coachLessonRecommendationsRelations = relations(
  coachLessonRecommendations,
  ({ one }) => ({
    user: one(users, {
      fields: [coachLessonRecommendations.userId],
      references: [users.userPlatformId],
    }),
    lesson: one(libraryLessons, {
      fields: [coachLessonRecommendations.lessonId],
      references: [libraryLessons.id],
    }),
  }),
);

export const insertCoachLessonRecommendationSchema = createInsertSchema(
  coachLessonRecommendations,
).omit({
  id: true,
  createdAt: true,
});

export type CoachLessonRecommendation =
  typeof coachLessonRecommendations.$inferSelect;
export type InsertCoachLessonRecommendation =
  typeof coachLessonRecommendations.$inferInsert;

// =============================================================================
// News Feed — Sprint News-1 (ADR-106)
// =============================================================================
// 3 tabelas: news_sources (catalogo gerenciavel), news_items (cache compartilhada),
// user_news_preferences (opt-in granular per category × per platform).
// Migration: 0038_news_feed.sql
// =============================================================================

export const NEWS_CATEGORIES = ["tools", "sites", "gossip", "tournament-results", "studies", "market", "reserved-future"] as const;
export const newsCategorySchema = z.enum(NEWS_CATEGORIES);
export type NewsCategoryEnum = (typeof NEWS_CATEGORIES)[number];

// Sprint News-3 RF-01 — strategy literal union para scrape.
export const SCRAPE_STRATEGIES = [
  "rss",
  "html",
  "x_only",
  "rss_and_x",
  "html_and_x",
  "rss_or_html",
] as const;
export type ScrapeStrategy = (typeof SCRAPE_STRATEGIES)[number];
export const scrapeStrategySchema = z.enum(SCRAPE_STRATEGIES);

export const newsSources = pgTable(
  "news_sources",
  {
    id: varchar("id", { length: 64 }).primaryKey().notNull(),
    category: varchar("category", { length: 32 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    iconUrl: text("icon_url"),
    /** Slug semantico do software/rede ('hand2note', 'pokerstars'). */
    platform: varchar("platform", { length: 64 }).notNull(),
    /** Template de prompt pra Grok (placeholders {{period}}, {{platform}}). */
    queryTemplate: text("query_template"),
    /**
     * Sprint News-3 RF-01 — handle X (sem `@`). Renomeado de `live_search_handle`.
     * Migration 0045 aplica RENAME COLUMN preservando valores existentes.
     */
    xHandle: varchar("x_handle", { length: 64 }),
    /**
     * Homepage da fonte. Usada como fallback quando o URL especifico do item
     * (retornado pelo Grok) retorna 4xx/5xx — evita "Link nao encontrado" no
     * NewsFeed. Migration 0041 (Sprint home-reform-4 item 11).
     */
    homepageUrl: text("homepage_url"),
    /**
     * Sprint News-3 RF-01 — URL do feed RSS/Atom (NULL se source nao tem RSS).
     * Migration 0045.
     */
    rssUrl: text("rss_url"),
    /**
     * Sprint News-3 RF-01 — estrategia de fetch da source. CHECK constraint na
     * migration limita aos 6 valores literais. Default 'html' (legacy mais
     * comum). Migration 0045.
     */
    scrapeStrategy: varchar("scrape_strategy", { length: 32 })
      .notNull()
      .default("html"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_news_sources_category").on(table.category, table.enabled),
    index("idx_news_sources_platform").on(table.platform),
  ],
);

/**
 * Sprint News-3 RF-01 — 15 sources locked (audit `Docs/audits/news-x-handles.md`).
 * Usado pelo migration 0045 UPSERT + por test fixtures.
 */
export const NEWS_3_SOURCES_LOCKED: Array<{
  id: string;
  category: string;
  name: string;
  platform: string;
  scrapeStrategy: ScrapeStrategy;
  rssUrl: string | null;
  homepageUrl: string | null;
  xHandle: string | null;
}> = [
  // gossip
  { id: "mundopoker", category: "gossip", name: "MundoPoker", platform: "mundopoker", scrapeStrategy: "html", rssUrl: null, homepageUrl: "https://mundopoker.com.br", xHandle: null },
  { id: "superpoker", category: "gossip", name: "SuperPoker", platform: "superpoker", scrapeStrategy: "html", rssUrl: null, homepageUrl: "https://superpoker.com.br", xHandle: null },
  // sites
  { id: "888poker", category: "sites", name: "888poker", platform: "888poker", scrapeStrategy: "x_only", rssUrl: null, homepageUrl: null, xHandle: "888poker" },
  { id: "bodog", category: "sites", name: "Bodog/Bovada", platform: "bodog", scrapeStrategy: "x_only", rssUrl: null, homepageUrl: null, xHandle: "IgnitionCasino" },
  { id: "coinpoker", category: "sites", name: "CoinPoker", platform: "coinpoker", scrapeStrategy: "x_only", rssUrl: null, homepageUrl: null, xHandle: "CoinPoker_OFF" },
  { id: "ggpoker", category: "sites", name: "GGPoker", platform: "ggpoker", scrapeStrategy: "html_and_x", rssUrl: null, homepageUrl: "https://ggpoker.com/pt-br/blog/", xHandle: "GGPoker" },
  { id: "partypoker", category: "sites", name: "PartyPoker", platform: "partypoker", scrapeStrategy: "x_only", rssUrl: null, homepageUrl: null, xHandle: "partypoker" },
  { id: "pokerstars", category: "sites", name: "PokerStars", platform: "pokerstars", scrapeStrategy: "html_and_x", rssUrl: null, homepageUrl: "https://www.pokerstars.com/pt-BR/poker/learn/news/?&no_redirect=1", xHandle: "PokerStars" },
  { id: "wpn-acr", category: "sites", name: "WPN/ACR", platform: "wpn-acr", scrapeStrategy: "x_only", rssUrl: null, homepageUrl: null, xHandle: "ACR_POKER" },
  // studies
  { id: "gto-wizard-studies", category: "studies", name: "GTO Wizard - Estudos", platform: "gto-wizard", scrapeStrategy: "rss_or_html", rssUrl: null, homepageUrl: "https://blog.gtowizard.com/articles/", xHandle: null },
  // tools
  { id: "gto-wizard", category: "tools", name: "GTO Wizard - What's New", platform: "gto-wizard", scrapeStrategy: "rss_or_html", rssUrl: null, homepageUrl: "https://blog.gtowizard.com/whats-new-in-gto-wizard/", xHandle: null },
  { id: "hand2note", category: "tools", name: "Hand2Note", platform: "hand2note", scrapeStrategy: "html_and_x", rssUrl: null, homepageUrl: "https://hand2note.com/Blog", xHandle: "hand2note" },
  { id: "hrc", category: "tools", name: "HRC", platform: "hrc", scrapeStrategy: "html", rssUrl: null, homepageUrl: "https://www.holdemresources.net/blog", xHandle: null },
  { id: "jurojin", category: "tools", name: "Jurojin", platform: "jurojin", scrapeStrategy: "html", rssUrl: null, homepageUrl: "https://jurojinpoker.com/pt/blog", xHandle: null },
  { id: "sharkscope", category: "tools", name: "SharkScope", platform: "sharkscope", scrapeStrategy: "x_only", rssUrl: null, homepageUrl: null, xHandle: "sharkscope" },
];

/** Sprint News-3 RF-01 — sources legacy a serem dropadas (DELETE CASCADE). */
export const NEWS_3_SOURCES_DROPPED: string[] = [
  "cravadas-br",
  "chico",
  "ipoker",
  "intuitive-table",
  "holdem-manager",
  "pokertracker",
];

export type NewsSourceRow = typeof newsSources.$inferSelect;
export type InsertNewsSource = typeof newsSources.$inferInsert;

export const newsItems = pgTable(
  "news_items",
  {
    id: varchar("id").primaryKey().notNull(),
    sourceId: varchar("source_id", { length: 64 })
      .notNull()
      .references(() => newsSources.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 32 }).notNull(),
    platform: varchar("platform", { length: 64 }).notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: timestamp("published_at").notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    engagementLikes: integer("engagement_likes"),
    engagementViews: integer("engagement_views"),
    engagementComments: integer("engagement_comments"),
    /** sha256(url + title) — dedup idempotente do cron. */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    tags: jsonb("tags").$type<string[]>(),
    /**
     * Sprint News-3 RF-08.1 — URL canonicalizada para Layer 1 dedupe (indexada).
     * NOT NULL DEFAULT '' permite back-fill gradual sem quebrar inserts existentes.
     */
    urlCanonical: text("url_canonical").notNull().default(""),
    /**
     * Sprint News-3 RF-08.1 — sha256 hex 64 do title fingerprint (Layer 2).
     */
    titleFingerprint: varchar("title_fingerprint", { length: 64 })
      .notNull()
      .default(""),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_news_items_content_hash").on(table.contentHash),
    index("idx_news_items_category_published").on(table.category, table.publishedAt),
    index("idx_news_items_platform").on(table.platform),
    index("idx_news_items_expires").on(table.expiresAt),
    index("idx_news_items_url_canonical_fetched").on(table.urlCanonical, table.fetchedAt),
    index("idx_news_items_title_fingerprint_fetched").on(table.titleFingerprint, table.fetchedAt),
  ],
);

export type NewsItemRow = typeof newsItems.$inferSelect;
export type InsertNewsItem = typeof newsItems.$inferInsert;

export const userNewsPreferences = pgTable(
  "user_news_preferences",
  {
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    category: varchar("category", { length: 32 }).notNull(),
    /** Master da categoria. Default false (opt-in obrigatorio per ADR-106). */
    enabled: boolean("enabled").notNull().default(false),
    /** Toggles per-platform: { 'hand2note': true, 'pokertracker': false }. */
    platformToggles: jsonb("platform_toggles")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_user_news_prefs_user_category").on(table.userId, table.category),
  ],
);

export type UserNewsPreferenceRow = typeof userNewsPreferences.$inferSelect;
export type InsertUserNewsPreference = typeof userNewsPreferences.$inferInsert;

export const newsPreferenceUpdateSchema = z.object({
  category: newsCategorySchema,
  enabled: z.boolean().optional(),
  platformToggles: z.record(z.string(), z.boolean()).optional(),
});
export type NewsPreferenceUpdate = z.infer<typeof newsPreferenceUpdateSchema>;

// =============================================================================
// Sprint FX-1 — system_fx_rates (ADR-121, RF-01).
// Tabela global de FX rates fetched diariamente pelo cron (BCB PTAX + frankfurter).
// PK composta (date, currency) impede duplicatas. Audit trail nativo.
// =============================================================================
export const systemFxRates = pgTable(
  "system_fx_rates",
  {
    date: date("date").notNull(),
    currency: varchar("currency", { length: 8 }).notNull(),
    ratePerUsd: numeric("rate_per_usd", { precision: 18, scale: 8 }).notNull(),
    source: varchar("source", { length: 16 }).notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.date, table.currency] }),
    currencyDateIdx: index("idx_system_fx_rates_currency_date").on(
      table.currency,
      table.date,
    ),
  }),
);

export const systemFxRatesInsertSchema = createInsertSchema(systemFxRates);
export type SystemFxRate = typeof systemFxRates.$inferSelect;
export type SystemFxRateInsert = typeof systemFxRates.$inferInsert;
export type FxSource = "bcb_ptax" | "frankfurter" | "manual" | "fallback";

// =============================================================================
// Sprint Estudos-Coach-Biblio-2 (ADR-132) — study_weekly_plans
// =============================================================================
// 1 plano semanal por user. plan_jsonb embarca 5 dias x 3-4 atividades. UNIQUE
// (user_id, week_start_date) garante idempotency cron + manual via UPSERT.
// completedItemsJsonb = array de itemId completados pelo user. Sources:
// 'coach_auto' (cron segunda 9h UTC) | 'coach_manual' (POST regenerate).
// Migration 0055.
// =============================================================================
export const studyWeeklyPlans = pgTable(
  "study_weekly_plans",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    userId: varchar("user_id", { length: 21 })
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    weekStartDate: date("week_start_date").notNull(),
    planJsonb: jsonb("plan_jsonb").notNull(),
    completedItemsJsonb: jsonb("completed_items_jsonb")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    source: varchar("source", { length: 16 }).notNull(),
    dailyTargetMinutes: integer("daily_target_minutes").notNull(),
    costTokensUsed: integer("cost_tokens_used"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    regeneratedAt: timestamp("regenerated_at", { withTimezone: true }),
    regeneratedCount: integer("regenerated_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_swp_user_week").on(table.userId, table.weekStartDate),
    index("idx_swp_user_generated").on(table.userId, table.generatedAt),
  ],
);

export const STUDY_WEEKLY_PLAN_SOURCES = ["coach_auto", "coach_manual"] as const;
export type StudyWeeklyPlanSource = (typeof STUDY_WEEKLY_PLAN_SOURCES)[number];

export type StudyWeeklyPlan = typeof studyWeeklyPlans.$inferSelect;
export type InsertStudyWeeklyPlan = typeof studyWeeklyPlans.$inferInsert;

export const insertStudyWeeklyPlanSchema = z.object({
  userId: z.string(),
  weekStartDate: z.coerce.date(),
  planJsonb: z.any(),
  completedItemsJsonb: z.array(z.string()).optional().default([]),
  source: z.enum(STUDY_WEEKLY_PLAN_SOURCES),
  dailyTargetMinutes: z.number().int().min(5).max(240),
  costTokensUsed: z.number().int().nullable().optional(),
});

// =============================================================================
// EST-6 (ADR-224) — weekly_planning_sessions
// =============================================================================
// Estado leve de 1 planning session por usuario por semana (chave UTC via
// ymdUtc). UNIQUE (user_id, week_start_date) garante idempotencia — reabrir a
// mesma semana retorna a sessao existente. `steps` jsonb com 4 passos
// (grind/study/lessons/themes); status por passo validado em Zod
// (shared/coach-planning.ts), sem CHECK DB. Migration 0088.
// =============================================================================
export const weeklyPlanningSessions = pgTable(
  "weekly_planning_sessions",
  {
    id: varchar("id").primaryKey().notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    weekStartDate: date("week_start_date").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("in_progress"),
    steps: jsonb("steps").notNull().default(sql`'{}'::jsonb`),
    source: varchar("source", { length: 16 }).notNull().default("coach_manual"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("weekly_planning_sessions_user_week_unique").on(
      table.userId,
      table.weekStartDate,
    ),
  ],
);

export const weeklyPlanningSessionsRelations = relations(
  weeklyPlanningSessions,
  ({ one }) => ({
    user: one(users, {
      fields: [weeklyPlanningSessions.userId],
      references: [users.userPlatformId],
    }),
  }),
);

export type WeeklyPlanningSessionRow = typeof weeklyPlanningSessions.$inferSelect;
export type InsertWeeklyPlanningSession = typeof weeklyPlanningSessions.$inferInsert;

export const insertWeeklyPlanningSessionSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.string().optional(),
  steps: z.any().optional(),
  source: z.string().optional(),
});

// =============================================================================
// Sprint Estudos-Coach-Biblio-2 (ADR-133) — coach_session_insights
// =============================================================================
// Cache 24h + auditoria de insights Coach pos-sessao /grind-live (RF-4). 1 row
// por grind_session_id (UNIQUE) — INSERT ON CONFLICT DO UPDATE race-safe.
// Migration 0056.
// =============================================================================
export const coachSessionInsights = pgTable(
  "coach_session_insights",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    userId: varchar("user_id", { length: 21 })
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    grindSessionId: varchar("grind_session_id", { length: 21 })
      .notNull()
      .references(() => grindSessions.id, { onDelete: "cascade" }),
    insightsJsonb: jsonb("insights_jsonb").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    costTokensUsed: integer("cost_tokens_used"),
    model: varchar("model", { length: 64 }),
    promptVersion: varchar("prompt_version", { length: 32 }),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    regeneratedCount: integer("regenerated_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_csi_session").on(table.grindSessionId),
    index("idx_csi_user_generated").on(table.userId, table.generatedAt),
    index("idx_csi_expires").on(table.expiresAt),
  ],
);

export type CoachSessionInsight = typeof coachSessionInsights.$inferSelect;
export type InsertCoachSessionInsight = typeof coachSessionInsights.$inferInsert;

export const insertCoachSessionInsightSchema = z.object({
  userId: z.string(),
  grindSessionId: z.string(),
  insightsJsonb: z.any(),
  costTokensUsed: z.number().int().nullable().optional(),
  model: z.string().max(64).nullable().optional(),
  promptVersion: z.string().max(32).nullable().optional(),
  tokensIn: z.number().int().nullable().optional(),
  tokensOut: z.number().int().nullable().optional(),
});

// =============================================================================
// Sprint AI-1B — report_jobs / reports (ADR-155/156/157)
// Migration: migrations/0067_report_jobs_reports.sql
// =============================================================================

// -----------------------------------------------------------------------------
// report_jobs — fila de jobs de relatorio (RF-01, ADR-155 §3.1)
// -----------------------------------------------------------------------------
export const reportJobs = pgTable("report_jobs", {
  id: varchar("id", { length: 21 }).primaryKey().notNull(),
  userId: varchar("user_id", { length: 21 }).notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  reportType: varchar("report_type", { length: 16 }).notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  timezone: varchar("timezone", { length: 64 }),
  subscriptionPlanAtEnqueue: varchar("subscription_plan_at_enqueue", { length: 16 }),
  reportId: varchar("report_id", { length: 21 }),
  lastError: text("last_error"),
  enqueuedBy: varchar("enqueued_by", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_report_jobs_due").on(table.status, table.scheduledFor),
  uniqueIndex("uniq_report_jobs_user_type_period").on(table.userId, table.reportType, table.periodStart),
  index("idx_report_jobs_user_status").on(table.userId, table.status),
]);

export type ReportJob = typeof reportJobs.$inferSelect;
export type InsertReportJob = typeof reportJobs.$inferInsert;

export const insertReportJobSchema = z.object({
  id: z.string().max(21),
  userId: z.string().max(21),
  reportType: z.string().max(16).default("weekly"),
  periodStart: z.string(),
  periodEnd: z.string(),
  scheduledFor: z.union([z.date(), z.string()]),
  status: z.string().max(16).default("pending"),
  attempts: z.number().int().default(0),
  maxAttempts: z.number().int().default(3),
  nextAttemptAt: z.union([z.date(), z.string()]).nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
  subscriptionPlanAtEnqueue: z.string().max(16).nullable().optional(),
  reportId: z.string().max(21).nullable().optional(),
  lastError: z.string().nullable().optional(),
  enqueuedBy: z.string().max(32).nullable().optional(),
});

// -----------------------------------------------------------------------------
// reports — relatorios gerados (RF-02, ADR-155 §3.1)
// -----------------------------------------------------------------------------
export const reports = pgTable("reports", {
  id: varchar("id", { length: 21 }).primaryKey().notNull(),
  userId: varchar("user_id", { length: 21 }).notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  reportType: varchar("report_type", { length: 16 }).notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("ready"),
  content: jsonb("content").notNull().default(sql`'{}'::jsonb`),
  markdown: text("markdown"),
  modelUsed: varchar("model_used", { length: 64 }),
  summarizerModelUsed: varchar("summarizer_model_used", { length: 64 }),
  costUsdEstimate: numeric("cost_usd_estimate", { precision: 10, scale: 4 }),
  inputTokens: integer("input_tokens"),
  cacheCreationInputTokens: integer("cache_creation_input_tokens"),
  cacheReadInputTokens: integer("cache_read_input_tokens"),
  outputTokens: integer("output_tokens"),
  degradedReason: varchar("degraded_reason", { length: 64 }),
  readAt: timestamp("read_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_reports_user_generated").on(table.userId, table.generatedAt),
  uniqueIndex("uniq_reports_user_type_period").on(table.userId, table.reportType, table.periodStart),
]);

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

export const insertReportSchema = z.object({
  id: z.string().max(21),
  userId: z.string().max(21),
  reportType: z.string().max(16).default("weekly"),
  periodStart: z.string(),
  periodEnd: z.string(),
  status: z.string().max(16).default("ready"),
  content: z.any().default({}),
  markdown: z.string().nullable().optional(),
  modelUsed: z.string().max(64).nullable().optional(),
  summarizerModelUsed: z.string().max(64).nullable().optional(),
  costUsdEstimate: z.union([z.number(), z.string()]).nullable().optional(),
  inputTokens: z.number().int().nullable().optional(),
  cacheCreationInputTokens: z.number().int().nullable().optional(),
  cacheReadInputTokens: z.number().int().nullable().optional(),
  outputTokens: z.number().int().nullable().optional(),
  degradedReason: z.string().max(64).nullable().optional(),
  readAt: z.union([z.date(), z.string()]).nullable().optional(),
  dismissedAt: z.union([z.date(), z.string()]).nullable().optional(),
});

// -----------------------------------------------------------------------------
// ReportContent — shape do JSONB `reports.content` (RF-05.4). Interface TS pura.
// -----------------------------------------------------------------------------
export interface ReportContentInsight {
  text: string;
  citations: string[];
  confidence?: "high" | "medium" | "low";
}

export interface ReportContentCta {
  label: string;
  kind: "tool" | "link";
  toolName?: string;
  href?: string;
  payloadHint?: Record<string, unknown>;
}

export type ReportContentType = "weekly" | "monthly" | "daily";

export interface ReportContent {
  schemaVersion: number;
  reportType: ReportContentType;
  periodStart: string;
  periodEnd: string;
  dataSufficiency: "ok" | "low";
  level?: AiPlayerLevel | null;
  tone?: "gentle" | "balanced" | "direct";
  header: { title: string; summaryLine: string; comparison?: string };
  // Para reportType='weekly'/'monthly' as 4 sub-secoes basicas sao obrigatorias
  // (mentalOps continua opcional como antes); para 'daily' o gerador preenche
  // sub-secoes com stubs zerados (relatorio curto usa `sessionSummary` para
  // os numeros principais; sub-secoes continuam presentes para back-compat
  // do renderer e dos tests existentes do AI-1B).
  sections: {
    volumeResults: {
      sessionsCompleted: number;
      sessionsPlanned: number;
      tournaments: number;
      itmPct: number | null;
      finalTables: number;
      wins: number;
      roiWeek: number | null;
      roi30d: number | null;
      narrative?: string;
    };
    bankroll: {
      profitByCurrency: Array<{ currency: string; native: number; usd: number }>;
      bankrollStart: number | null;
      bankrollNow: number | null;
      transfers: number;
      withdrawals: number;
      narrative?: string;
    };
    selection: {
      ranThisWeek: boolean | null;
      adherencePct: number | null;
      topCategories: Array<{ label: string; roi: number; n: number }>;
      bottomCategories: Array<{ label: string; roi: number; n: number; suggestBlock: boolean }>;
      narrative?: string;
    };
    study: {
      minutesLogged: number;
      topicsCovered: string[];
      focusOfMonth: string | null;
      focusCoveragePct: number | null;
      recommendedLesson?: { lessonId: string; title: string; reason: string; ctaHref: string } | null;
      narrative?: string;
    };
    mentalOps?: {
      hasWarmupData: boolean;
      warmupSessions: number;
      tiltSessions: number;
      avgFocusRating?: number | null;
      narrative?: string;
    };
  };
  insights: ReportContentInsight[];
  nextWeekPlan: {
    gradeSuggestionHref: string | null;
    studyFocus: string | null;
    recommendedAction: string | null;
    weeklyStudyPlanRef?: { weekStartDate: string } | null;
  };
  cta: ReportContentCta[];
  generation: {
    model: string | null;
    summarizerModel: string | null;
    degraded: boolean;
    degradedReason: string | null;
    costUsdEstimate?: number | null;
  };

  // Sprint AI-1C (ADR-159) — campos novos opcionais. Frontend tolera ausencia;
  // bumps de `schemaVersion` (1 -> 2) ficam a cargo do gerador quando popular
  // qualquer um destes blocos. Lesson #7 (deprecation gradual).

  // RF-05.4 — comparativos mes-a-mes (monthly; weekly pode ter previousPeriod).
  comparatives?: {
    previousPeriod?: { label: string; profit: number | null; roi: number | null; count: number | null };
    last6Months?: Array<{ month: string; profit: number; roi: number | null; count: number }>;
    last12Months?: Array<{ month: string; profit: number; roi: number | null; count: number }>;
    trendNarrative?: string;
  };

  // RF-05.4 — analise de variancia (monthly).
  variance?: {
    bankrollDeltaUsd: number | null;
    estimatedBySkillUsd: number | null;
    estimatedByVarianceUsd: number | null;
    sampleSize: number | null;
    method: "heuristic" | "primedope";
    narrative?: string;
    confidence?: "high" | "medium" | "low";
  };

  // RF-05.4 — leaks resolvidos vs novos no mes (monthly).
  leaksDelta?: {
    resolved: Array<{ code: string; label: string; note?: string }>;
    newSignals: Array<{ code: string; label: string; severity?: string }>;
    activeFocus: Array<{ code: string; label: string; status: string; progressNote?: string }>;
    narrative?: string;
  };

  // RF-05.4 — progresso das metas do `ai_structured_profile` (monthly).
  goalsProgress?: Array<{
    goalId: string;
    texto: string;
    prazo: "mes" | "trimestre" | null;
    estimate: "on_track" | "behind" | "ahead" | "unknown";
    narrative?: string;
  }>;

  // RF-08 — secao "Seu acompanhamento" (weekly/monthly/daily).
  followUp?: {
    activeLeakFocus: Array<{ code: string; label: string; targetMonth: string; status: string; progressNote?: string }>;
    goalsInProgress: Array<{ goalId: string; texto: string; prazo: "mes" | "trimestre" | null }>;
    narrative?: string;
  };

  // RF-03.4 — resumo agregado da(s) sessao(oes) do dia (daily); pode aparecer
  // tambem em 'monthly' agregado, mas o cabecalho do daily eh o principal.
  sessionSummary?: {
    sessionDate: string;
    sessionsCount: number;
    tournamentsCount: number;
    profitUsd: number | null;
    roiPct: number | null;
    itmPct?: number | null;
    finalTables?: number;
    cravadas?: number;
    spotsCount?: number;
    profitByCurrency?: Array<{ currency: string; native: number; usd: number }>;
    narrative?: string;
  };

  // EST-2 (ADR-225) — Weekly Report Data Enrichment. Opcionais (lesson #7);
  // renderer + frontend toleram ausencia. Popular qualquer um => schemaVersion=2.
  mentalState?: ReportMentalState;
  studyWeek?: ReportStudyWeek;
}

// -----------------------------------------------------------------------------
// EST-2 (ADR-225) — sub-shapes de mentalState + studyWeek do Weekly Report.
// -----------------------------------------------------------------------------

/** Uma dimensao mental 0-10 dentro de uma sessao. delta = last - first. */
export interface ReportMentalDim {
  first: number;
  last: number;
  avg: number;   // 1 casa decimal
  delta: number; // last - first, 1 casa decimal
}

export interface ReportMentalSession {
  sessionId: string;
  date: string;               // ISO (data da sessao)
  dims: {
    foco: ReportMentalDim;
    energia: ReportMentalDim;
    confianca: ReportMentalDim;
    inteligenciaEmocional: ReportMentalDim;
    interferencias: ReportMentalDim;
  };
  breakCount: number;         // breaks nesta sessao
}

export interface ReportGrindNote {
  sessionId: string;
  date: string;               // ISO
  finalNotes?: string;        // truncado 500
  preparationNotes?: string;  // truncado 500
  dailyGoals?: string;        // truncado 500
  objectiveCompleted?: boolean;
}

export interface ReportMentalState {
  weeklyAverages: {           // media de TODOS os breaks da semana, por dim (1 casa)
    foco: number | null;
    energia: number | null;
    confianca: number | null;
    inteligenciaEmocional: number | null;
    interferencias: number | null;
  };
  breakCount: number;                 // total de breaks na semana
  totalSessionsWithBreaks: number;    // pode ser > sessions.length (cap 10)
  fatigueSignal: boolean;
  sessions: ReportMentalSession[];    // cap 10, mais recentes
  grindNotes: ReportGrindNote[];      // cap 10; [] se nenhuma nota
  objectiveHitRate: number | null;    // % inteiro; null se nenhum objectiveCompleted definido
  narrative?: string;                 // preenchido pelo LLM
}

export interface ReportStudyWeek {
  sessionCount: number;
  minutesLogged: number;
  handsSolvedTotal: number;
  filtersAnalyzedTotal: number;
  statAnalysisEntriesTotal: number;
  statAnalysisSessionCount: number;
  lessonInsightsCount: number;
  timeByTheme: Array<{ themeId: string; minutes: number }>; // cap 8, minutos desc
  narrative?: string;
}

