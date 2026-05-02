-- Sprint Biblioteca-1 — RF-01 (ADRs 071-076)
-- 7 tabelas + 3 enums

DO $$ BEGIN
  CREATE TYPE library_access_source AS ENUM ('admin', 'purchase', 'bundle', 'subscription');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE library_event_type AS ENUM (
    'view', 'play', 'pause', 'seek', 'complete',
    'note_create', 'coach_recommend', 'access_blocked'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE library_format AS ENUM ('video', 'podcast', 'article');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS library_courses (
  id varchar PRIMARY KEY NOT NULL,
  slug varchar(80) NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  description text,
  cover_key text,
  display_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT NOW() NOT NULL,
  updated_at timestamp DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_library_courses_published ON library_courses (is_published, display_order);

CREATE TABLE IF NOT EXISTS library_modules (
  id varchar PRIMARY KEY NOT NULL,
  course_id varchar NOT NULL REFERENCES library_courses(id) ON DELETE CASCADE,
  slug varchar(80) NOT NULL,
  title text NOT NULL,
  description text,
  cover_key text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_library_modules_course_slug ON library_modules (course_id, slug);
CREATE INDEX IF NOT EXISTS idx_library_modules_course ON library_modules (course_id, display_order);

CREATE TABLE IF NOT EXISTS library_lessons (
  id varchar PRIMARY KEY NOT NULL,
  module_id varchar NOT NULL REFERENCES library_modules(id) ON DELETE CASCADE,
  course_id varchar NOT NULL REFERENCES library_courses(id) ON DELETE CASCADE,
  slug varchar(80) NOT NULL,
  title text NOT NULL,
  subtitle text,
  category_id varchar(40) NOT NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  cover_key text,
  video_mux_asset_id text,
  video_mux_playback_id text,
  video_duration_seconds integer,
  audio_key text,
  audio_duration_seconds integer,
  audio_mime_type varchar(60) DEFAULT 'audio/mp4',
  article_html text,
  article_word_count integer,
  display_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT NOW() NOT NULL,
  updated_at timestamp DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_library_lessons_course_slug ON library_lessons (course_id, slug);
CREATE INDEX IF NOT EXISTS idx_library_lessons_module ON library_lessons (module_id, display_order);
CREATE INDEX IF NOT EXISTS idx_library_lessons_category ON library_lessons (category_id, is_published);

CREATE TABLE IF NOT EXISTS library_lesson_assets (
  id varchar PRIMARY KEY NOT NULL,
  lesson_id varchar NOT NULL REFERENCES library_lessons(id) ON DELETE CASCADE,
  asset_key text NOT NULL,
  mime_type varchar(60),
  size_bytes integer,
  created_at timestamp DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_library_lesson_assets_lesson ON library_lesson_assets (lesson_id);

CREATE TABLE IF NOT EXISTS user_lesson_access (
  id varchar PRIMARY KEY NOT NULL,
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  lesson_id varchar NOT NULL REFERENCES library_lessons(id) ON DELETE CASCADE,
  source library_access_source NOT NULL,
  granted_at timestamp DEFAULT NOW() NOT NULL,
  granted_by varchar,
  expires_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_lesson_access_user_lesson ON user_lesson_access (user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_user_lesson_access_user ON user_lesson_access (user_id);

CREATE TABLE IF NOT EXISTS library_events (
  id varchar PRIMARY KEY NOT NULL,
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  lesson_id varchar NOT NULL REFERENCES library_lessons(id) ON DELETE CASCADE,
  event_type library_event_type NOT NULL,
  format library_format,
  position_seconds integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  event_timestamp timestamp DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_library_events_user_lesson_ts ON library_events (user_id, lesson_id, event_timestamp);
CREATE INDEX IF NOT EXISTS idx_library_events_user_ts ON library_events (user_id, event_timestamp);

CREATE TABLE IF NOT EXISTS library_progress (
  id varchar PRIMARY KEY NOT NULL,
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  lesson_id varchar NOT NULL REFERENCES library_lessons(id) ON DELETE CASCADE,
  format library_format NOT NULL,
  last_position_seconds integer NOT NULL DEFAULT 0,
  total_duration_seconds integer,
  completed_at timestamp,
  updated_at timestamp DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_library_progress_user_lesson_format ON library_progress (user_id, lesson_id, format);
