CREATE TABLE "break_feedbacks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"session_id" varchar,
	"break_time" timestamp NOT NULL,
	"foco" integer NOT NULL,
	"energia" integer NOT NULL,
	"confianca" integer NOT NULL,
	"inteligencia_emocional" integer NOT NULL,
	"interferencias" integer NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coaching_insights" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"category" varchar NOT NULL,
	"title" varchar NOT NULL,
	"description" text NOT NULL,
	"priority" integer DEFAULT 1,
	"data" jsonb,
	"is_read" boolean DEFAULT false,
	"is_applied" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "custom_group_templates" (
	"id" varchar PRIMARY KEY NOT NULL,
	"group_id" varchar NOT NULL,
	"template_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_groups" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"color" varchar,
	"criteria" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "grind_sessions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"date" timestamp NOT NULL,
	"planned_buyins" numeric DEFAULT '0',
	"actual_buyins" numeric DEFAULT '0',
	"profit_loss" numeric DEFAULT '0',
	"duration" integer,
	"start_time" timestamp,
	"end_time" timestamp,
	"status" varchar DEFAULT 'planned',
	"tournaments_played" integer DEFAULT 0,
	"final_tables" integer DEFAULT 0,
	"big_hits" integer DEFAULT 0,
	"notes" text,
	"preparation_notes" text,
	"preparation_percentage" integer,
	"daily_goals" text,
	"skip_breaks_today" boolean DEFAULT false,
	"objective_completed" boolean,
	"final_notes" text,
	"session_snapshot" jsonb,
	"volume" integer,
	"profit" numeric,
	"abi_med" numeric,
	"roi" numeric,
	"fts" integer,
	"cravadas" integer,
	"energia_media" numeric,
	"foco_medio" numeric,
	"confianca_media" numeric,
	"inteligencia_emocional_media" numeric,
	"interferencias_media" numeric,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "planned_tournaments" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"day_of_week" integer NOT NULL,
	"site" varchar NOT NULL,
	"time" varchar NOT NULL,
	"type" varchar NOT NULL,
	"speed" varchar NOT NULL,
	"name" text NOT NULL,
	"buy_in" numeric NOT NULL,
	"guaranteed" numeric,
	"template_id" varchar,
	"status" varchar DEFAULT 'upcoming',
	"start_time" timestamp,
	"rebuys" integer DEFAULT 0,
	"result" numeric DEFAULT '0',
	"bounty" numeric DEFAULT '0',
	"position" integer,
	"session_id" varchar,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "preparation_logs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"session_id" varchar,
	"mental_state" integer NOT NULL,
	"focus_level" integer NOT NULL,
	"confidence_level" integer NOT NULL,
	"exercises_completed" jsonb DEFAULT '[]'::jsonb,
	"warmup_completed" boolean DEFAULT false,
	"session_goals" text,
	"notes" text,
	"post_session_review" text,
	"goals_achieved" boolean,
	"lessons_learned" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_tournaments" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"session_id" varchar NOT NULL,
	"site" varchar NOT NULL,
	"name" text,
	"buy_in" numeric NOT NULL,
	"rebuys" integer DEFAULT 0,
	"result" numeric DEFAULT '0',
	"position" integer,
	"bounty" numeric DEFAULT '0',
	"prize" numeric DEFAULT '0',
	"field_size" integer,
	"status" varchar DEFAULT 'upcoming',
	"start_time" timestamp,
	"end_time" timestamp,
	"from_planned_tournament" boolean DEFAULT false,
	"planned_tournament_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_cards" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"title" varchar NOT NULL,
	"category" varchar NOT NULL,
	"priority" varchar NOT NULL,
	"description" text,
	"objectives" text,
	"current_stat" numeric,
	"target_stat" numeric,
	"deadline" timestamp,
	"knowledge_score" integer DEFAULT 0,
	"time_invested" integer DEFAULT 0,
	"status" varchar DEFAULT 'active',
	"study_days" jsonb DEFAULT '[]'::jsonb,
	"study_start_time" varchar,
	"study_duration" integer,
	"is_recurring" boolean DEFAULT false,
	"weekly_frequency" integer,
	"study_description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "study_materials" (
	"id" varchar PRIMARY KEY NOT NULL,
	"study_card_id" varchar NOT NULL,
	"title" varchar NOT NULL,
	"type" varchar NOT NULL,
	"url" varchar,
	"file_name" varchar,
	"status" varchar DEFAULT 'not_viewed',
	"time_spent" integer DEFAULT 0,
	"notes" text,
	"timestamp_watched" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "study_notes" (
	"id" varchar PRIMARY KEY NOT NULL,
	"study_card_id" varchar NOT NULL,
	"title" varchar,
	"content" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"study_card_id" varchar,
	"date" timestamp NOT NULL,
	"duration" integer NOT NULL,
	"activities" jsonb DEFAULT '[]'::jsonb,
	"focus_score" integer,
	"productivity_score" integer,
	"insights" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tournament_templates" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"site" varchar NOT NULL,
	"format" varchar NOT NULL,
	"category" varchar NOT NULL,
	"speed" varchar NOT NULL,
	"day_of_week" jsonb DEFAULT '[]'::jsonb,
	"start_time" jsonb DEFAULT '[]'::jsonb,
	"avg_buyin" numeric DEFAULT '0',
	"avg_roi" numeric DEFAULT '0',
	"total_played" integer DEFAULT 0,
	"total_profit" numeric DEFAULT '0',
	"final_tables" integer DEFAULT 0,
	"big_hits" integer DEFAULT 0,
	"avg_field_size" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_played" timestamp
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"buy_in" numeric NOT NULL,
	"prize_pool" numeric,
	"position" integer,
	"prize" numeric DEFAULT '0',
	"date_played" timestamp NOT NULL,
	"site" varchar NOT NULL,
	"format" varchar NOT NULL,
	"category" varchar NOT NULL,
	"speed" varchar NOT NULL,
	"field_size" integer,
	"reentries" integer DEFAULT 0,
	"final_table" boolean DEFAULT false,
	"big_hit" boolean DEFAULT false,
	"early_finish" boolean DEFAULT false,
	"late_finish" boolean DEFAULT false,
	"currency" varchar DEFAULT 'BRL',
	"rake" numeric DEFAULT '0',
	"converted_to_usd" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"template_id" varchar,
	"grind_session_id" varchar
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"big_hit_multiplier" numeric DEFAULT '10',
	"early_finish_threshold" numeric DEFAULT '0.3',
	"late_finish_threshold" numeric DEFAULT '0.7',
	"email_notifications" boolean DEFAULT true,
	"coaching_alerts" boolean DEFAULT true,
	"session_reminders" boolean DEFAULT true,
	"default_chart_period" varchar DEFAULT '30d',
	"preferred_currency" varchar DEFAULT 'BRL',
	"dark_mode" boolean DEFAULT false,
	"exchange_rates" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"subscription_type" varchar DEFAULT 'free',
	"timezone" varchar DEFAULT 'America/Sao_Paulo',
	"currency" varchar DEFAULT 'BRL',
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weekly_plans" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"week_start" timestamp NOT NULL,
	"title" varchar,
	"description" text,
	"target_buyins" numeric,
	"target_profit" numeric,
	"target_volume" integer,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");