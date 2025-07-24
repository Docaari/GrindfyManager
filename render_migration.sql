-- =============================================================================
-- GRINDFY RENDER DEPLOYMENT MIGRATION
-- Complete PostgreSQL Database Schema Recreation
-- Compatible with Render PostgreSQL Environment
-- Date: January 25, 2025
-- =============================================================================

-- Begin transaction for atomic deployment
BEGIN;

-- =============================================================================
-- 1. SESSION STORAGE TABLE (Required for Express session management)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR NOT NULL PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);

-- Index for session cleanup
CREATE INDEX IF NOT EXISTS IDX_session_expire ON sessions USING btree (expire);

-- =============================================================================
-- 2. USERS TABLE (Core authentication and profile data)
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_platform_id VARCHAR NOT NULL UNIQUE, -- Sequential: USER-0001, USER-0002, etc.
    email VARCHAR NOT NULL UNIQUE,
    first_name VARCHAR,
    last_name VARCHAR,
    name VARCHAR,
    profile_image_url VARCHAR,
    password VARCHAR,
    username VARCHAR UNIQUE,
    role VARCHAR DEFAULT 'user',
    status VARCHAR DEFAULT 'pending_verification',
    subscription_type VARCHAR DEFAULT 'free',
    subscription_plan VARCHAR DEFAULT 'basico',
    timezone VARCHAR DEFAULT 'America/Sao_Paulo',
    currency VARCHAR DEFAULT 'BRL',
    email_verified BOOLEAN DEFAULT false,
    email_verification_token VARCHAR,
    password_reset_token VARCHAR,
    password_reset_expires TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    google_id VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- =============================================================================
-- 3. PERMISSIONS TABLE (System permissions)
-- =============================================================================
CREATE TABLE IF NOT EXISTS permissions (
    id VARCHAR NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE,
    description VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 4. USER_PERMISSIONS TABLE (User-permission relationships)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_permissions (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    permission_id VARCHAR NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted BOOLEAN DEFAULT true,
    status VARCHAR DEFAULT 'active',
    expiration_date TIMESTAMP,
    subscription_plan VARCHAR,
    auto_renew BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, permission_id)
);

-- =============================================================================
-- 5. SUBSCRIPTIONS TABLE (Subscription management)
-- =============================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    plan_type VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'active',
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP NOT NULL,
    duration_days INTEGER NOT NULL,
    auto_renewal BOOLEAN DEFAULT false,
    payment_status VARCHAR DEFAULT 'pending',
    payment_method_id VARCHAR,
    stripe_subscription_id VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 6. USER_ACTIVITIES TABLE (Activity tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_activities (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    activity_type VARCHAR NOT NULL,
    page VARCHAR,
    session_duration INTEGER,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 7. ENGAGEMENT_METRICS TABLE (User engagement analytics)
-- =============================================================================
CREATE TABLE IF NOT EXISTS engagement_metrics (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    total_sessions INTEGER DEFAULT 0,
    total_time_minutes INTEGER DEFAULT 0,
    last_login_date TIMESTAMP,
    streak_days INTEGER DEFAULT 0,
    avg_session_duration INTEGER DEFAULT 0,
    favorite_page VARCHAR,
    subscription_days_remaining INTEGER,
    engagement_score INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 8. ACCESS_LOGS TABLE (Security and audit logging)
-- =============================================================================
CREATE TABLE IF NOT EXISTS access_logs (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    action VARCHAR NOT NULL,
    resource VARCHAR,
    ip_address VARCHAR,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 9. USER_ACTIVITY TABLE (Detailed activity analytics)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_activity (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    activity_type VARCHAR NOT NULL,
    activity_data JSONB,
    page VARCHAR,
    session_id VARCHAR,
    ip_address VARCHAR,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 10. ANALYTICS_DAILY TABLE (Daily analytics aggregation)
-- =============================================================================
CREATE TABLE IF NOT EXISTS analytics_daily (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    page_views INTEGER DEFAULT 0,
    session_duration INTEGER DEFAULT 0,
    tournaments_created INTEGER DEFAULT 0,
    uploads_completed INTEGER DEFAULT 0,
    features_used JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

-- =============================================================================
-- 11. NOTIFICATIONS TABLE (System notifications)
-- =============================================================================
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    title VARCHAR NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR DEFAULT 'info',
    priority VARCHAR NOT NULL,
    days_until_expiration INTEGER,
    read BOOLEAN DEFAULT false,
    scheduled_for TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 12. TOURNAMENTS TABLE (Main tournament data)
-- =============================================================================
CREATE TABLE IF NOT EXISTS tournaments (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    tournament_id VARCHAR,
    name VARCHAR NOT NULL,
    buy_in DECIMAL NOT NULL,
    prize_pool DECIMAL,
    position INTEGER,
    prize DECIMAL DEFAULT 0,
    date_played TIMESTAMP NOT NULL,
    site VARCHAR NOT NULL,
    format VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    speed VARCHAR NOT NULL,
    field_size INTEGER,
    reentries INTEGER DEFAULT 0,
    final_table BOOLEAN DEFAULT false,
    big_hit BOOLEAN DEFAULT false,
    early_finish BOOLEAN DEFAULT false,
    late_finish BOOLEAN DEFAULT false,
    currency VARCHAR DEFAULT 'BRL',
    rake DECIMAL DEFAULT 0,
    converted_to_usd BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    template_id VARCHAR,
    grind_session_id VARCHAR
);

-- =============================================================================
-- 13. TOURNAMENT_TEMPLATES TABLE (Tournament templates)
-- =============================================================================
CREATE TABLE IF NOT EXISTS tournament_templates (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    site VARCHAR NOT NULL,
    format VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    speed VARCHAR NOT NULL,
    day_of_week JSONB DEFAULT '[]'::jsonb,
    start_time JSONB DEFAULT '[]'::jsonb,
    avg_buyin DECIMAL DEFAULT 0,
    avg_roi DECIMAL DEFAULT 0,
    total_played INTEGER DEFAULT 0,
    total_profit DECIMAL DEFAULT 0,
    final_tables INTEGER DEFAULT 0,
    big_hits INTEGER DEFAULT 0,
    avg_field_size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_played TIMESTAMP
);

-- =============================================================================
-- 14. WEEKLY_PLANS TABLE (Weekly planning)
-- =============================================================================
CREATE TABLE IF NOT EXISTS weekly_plans (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    week_start TIMESTAMP NOT NULL,
    title VARCHAR,
    description TEXT,
    target_buyins DECIMAL,
    target_profit DECIMAL,
    target_volume INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 15. PLANNED_TOURNAMENTS TABLE (Tournament planning)
-- =============================================================================
CREATE TABLE IF NOT EXISTS planned_tournaments (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    profile VARCHAR NOT NULL DEFAULT 'A',
    site VARCHAR NOT NULL,
    time VARCHAR NOT NULL,
    type VARCHAR NOT NULL,
    speed VARCHAR NOT NULL,
    name TEXT NOT NULL,
    buy_in DECIMAL NOT NULL,
    guaranteed DECIMAL,
    template_id VARCHAR,
    status VARCHAR DEFAULT 'upcoming',
    start_time TIMESTAMP,
    rebuys INTEGER DEFAULT 0,
    result DECIMAL DEFAULT 0,
    bounty DECIMAL DEFAULT 0,
    position INTEGER,
    session_id VARCHAR,
    prioridade INTEGER DEFAULT 2,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 16. GRIND_SESSIONS TABLE (Grind session tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS grind_sessions (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    date TIMESTAMP NOT NULL,
    planned_buyins DECIMAL DEFAULT 0,
    actual_buyins DECIMAL DEFAULT 0,
    profit_loss DECIMAL DEFAULT 0,
    duration INTEGER,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR DEFAULT 'planned',
    tournaments_played INTEGER DEFAULT 0,
    final_tables INTEGER DEFAULT 0,
    big_hits INTEGER DEFAULT 0,
    notes TEXT,
    preparation_notes TEXT,
    preparation_percentage INTEGER,
    daily_goals TEXT,
    skip_breaks_today BOOLEAN DEFAULT false,
    objective_completed BOOLEAN,
    final_notes TEXT,
    screen_cap INTEGER,
    session_snapshot JSONB,
    volume INTEGER,
    profit DECIMAL,
    abi_med DECIMAL,
    roi DECIMAL,
    fts INTEGER,
    cravadas INTEGER,
    energia_media DECIMAL,
    foco_medio DECIMAL,
    confianca_media DECIMAL,
    inteligencia_emocional_media DECIMAL,
    interferencias_media DECIMAL,
    vanilla_percentage DECIMAL,
    pko_percentage DECIMAL,
    mystery_percentage DECIMAL,
    normal_speed_percentage DECIMAL,
    turbo_speed_percentage DECIMAL,
    hyper_speed_percentage DECIMAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 17. BREAK_FEEDBACKS TABLE (Break feedback during sessions)
-- =============================================================================
CREATE TABLE IF NOT EXISTS break_feedbacks (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    session_id VARCHAR,
    break_time TIMESTAMP NOT NULL,
    foco INTEGER NOT NULL,
    energia INTEGER NOT NULL,
    confianca INTEGER NOT NULL,
    inteligencia_emocional INTEGER NOT NULL,
    interferencias INTEGER NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 18. SESSION_TOURNAMENTS TABLE (Live session tournaments)
-- =============================================================================
CREATE TABLE IF NOT EXISTS session_tournaments (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    session_id VARCHAR NOT NULL,
    site VARCHAR NOT NULL,
    name TEXT,
    time VARCHAR,
    buy_in DECIMAL NOT NULL,
    guaranteed DECIMAL,
    rebuys INTEGER DEFAULT 0,
    result DECIMAL DEFAULT 0,
    position INTEGER,
    bounty DECIMAL DEFAULT 0,
    prize DECIMAL DEFAULT 0,
    field_size INTEGER,
    status VARCHAR DEFAULT 'upcoming',
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    from_planned_tournament BOOLEAN DEFAULT false,
    planned_tournament_id VARCHAR,
    type VARCHAR DEFAULT 'Vanilla',
    speed VARCHAR DEFAULT 'Normal',
    category VARCHAR DEFAULT 'Vanilla',
    prioridade INTEGER DEFAULT 2,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 19. PREPARATION_LOGS TABLE (Session preparation tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS preparation_logs (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    session_id VARCHAR,
    mental_state INTEGER NOT NULL,
    focus_level INTEGER NOT NULL,
    confidence_level INTEGER NOT NULL,
    exercises_completed JSONB DEFAULT '[]'::jsonb,
    warmup_completed BOOLEAN DEFAULT false,
    session_goals TEXT,
    notes TEXT,
    post_session_review TEXT,
    goals_achieved BOOLEAN,
    lessons_learned TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 20. CUSTOM_GROUPS TABLE (Custom tournament groups)
-- =============================================================================
CREATE TABLE IF NOT EXISTS custom_groups (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    description TEXT,
    color VARCHAR,
    criteria JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 21. CUSTOM_GROUP_TEMPLATES TABLE (Group template relationships)
-- =============================================================================
CREATE TABLE IF NOT EXISTS custom_group_templates (
    id VARCHAR NOT NULL PRIMARY KEY,
    group_id VARCHAR NOT NULL,
    template_id VARCHAR NOT NULL
);

-- =============================================================================
-- 22. COACHING_INSIGHTS TABLE (AI coaching insights)
-- =============================================================================
CREATE TABLE IF NOT EXISTS coaching_insights (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    type VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    description TEXT NOT NULL,
    priority INTEGER DEFAULT 1,
    data JSONB,
    read BOOLEAN DEFAULT false,
    is_applied BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- =============================================================================
-- 23. USER_SETTINGS TABLE (User preferences)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_settings (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL UNIQUE REFERENCES users(user_platform_id) ON DELETE CASCADE,
    big_hit_multiplier DECIMAL DEFAULT 10,
    early_finish_threshold DECIMAL DEFAULT 0.3,
    late_finish_threshold DECIMAL DEFAULT 0.7,
    email_notifications BOOLEAN DEFAULT true,
    coaching_alerts BOOLEAN DEFAULT true,
    session_reminders BOOLEAN DEFAULT true,
    default_chart_period VARCHAR DEFAULT '30d',
    preferred_currency VARCHAR DEFAULT 'BRL',
    dark_mode BOOLEAN DEFAULT false,
    exchange_rates JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 24. STUDY_CARDS TABLE (Study management)
-- =============================================================================
CREATE TABLE IF NOT EXISTS study_cards (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    title VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    priority VARCHAR NOT NULL,
    description TEXT,
    objectives TEXT,
    current_stat DECIMAL,
    target_stat DECIMAL,
    deadline TIMESTAMP,
    knowledge_score INTEGER DEFAULT 0,
    time_invested INTEGER DEFAULT 0,
    status VARCHAR DEFAULT 'active',
    study_days JSONB DEFAULT '[]'::jsonb,
    study_start_time VARCHAR,
    study_duration INTEGER,
    is_recurring BOOLEAN DEFAULT false,
    weekly_frequency INTEGER,
    study_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 25. STUDY_MATERIALS TABLE (Study materials)
-- =============================================================================
CREATE TABLE IF NOT EXISTS study_materials (
    id VARCHAR NOT NULL PRIMARY KEY,
    study_card_id VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    type VARCHAR NOT NULL,
    url VARCHAR,
    file_name VARCHAR,
    status VARCHAR DEFAULT 'not_viewed',
    time_spent INTEGER DEFAULT 0,
    notes TEXT,
    timestamp_watched INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 26. STUDY_NOTES TABLE (Study notes)
-- =============================================================================
CREATE TABLE IF NOT EXISTS study_notes (
    id VARCHAR NOT NULL PRIMARY KEY,
    study_card_id VARCHAR NOT NULL,
    title VARCHAR,
    content TEXT NOT NULL,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 27. STUDY_SESSIONS TABLE (Study session tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS study_sessions (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    study_card_id VARCHAR,
    date TIMESTAMP NOT NULL,
    duration INTEGER NOT NULL,
    activities JSONB DEFAULT '[]'::jsonb,
    focus_score INTEGER,
    productivity_score INTEGER,
    insights TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 28. ACTIVE_DAYS TABLE (Active day management)
-- =============================================================================
CREATE TABLE IF NOT EXISTS active_days (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 29. PROFILE_STATES TABLE (Profile state management)
-- =============================================================================
CREATE TABLE IF NOT EXISTS profile_states (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    active_profile VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 30. BUG_REPORTS TABLE (Bug reporting system)
-- =============================================================================
CREATE TABLE IF NOT EXISTS bug_reports (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    page VARCHAR NOT NULL,
    description TEXT NOT NULL,
    urgency VARCHAR DEFAULT 'medium',
    type VARCHAR DEFAULT 'bug',
    status VARCHAR DEFAULT 'open',
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 31. UPLOAD_HISTORY TABLE (CSV upload tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS upload_history (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    filename VARCHAR NOT NULL,
    status VARCHAR NOT NULL,
    tournaments_count INTEGER DEFAULT 0,
    error_message TEXT,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duplicates_found INTEGER DEFAULT 0,
    duplicate_action VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 32. WEEKLY_ROUTINES TABLE (Calendar system)
-- =============================================================================
CREATE TABLE IF NOT EXISTS weekly_routines (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    week_start TIMESTAMP NOT NULL,
    blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
    conflicts JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_auto_generated BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 33. CALENDAR_CATEGORIES TABLE (Calendar categories)
-- =============================================================================
CREATE TABLE IF NOT EXISTS calendar_categories (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    color VARCHAR NOT NULL,
    icon VARCHAR,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 34. CALENDAR_EVENTS TABLE (Calendar events)
-- =============================================================================
CREATE TABLE IF NOT EXISTS calendar_events (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    category_id VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    day_of_week INTEGER NOT NULL,
    recurrence_type VARCHAR NOT NULL DEFAULT 'none',
    recurrence_pattern JSONB,
    parent_event_id VARCHAR,
    is_recurring BOOLEAN DEFAULT false,
    source VARCHAR DEFAULT 'manual',
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 35. STUDY_SCHEDULES TABLE (Study scheduling)
-- =============================================================================
CREATE TABLE IF NOT EXISTS study_schedules (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    study_card_id VARCHAR NOT NULL,
    day_of_week INTEGER NOT NULL,
    start_time VARCHAR NOT NULL,
    duration INTEGER NOT NULL,
    description TEXT,
    is_recurring BOOLEAN DEFAULT false,
    weekly_frequency INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 36. SUBSCRIPTION_PLANS TABLE (Subscription management)
-- =============================================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL,
    description TEXT,
    permissions TEXT[],
    duration_days INTEGER DEFAULT 30,
    price DECIMAL(10,2),
    currency VARCHAR DEFAULT 'USD',
    is_active BOOLEAN DEFAULT true,
    features TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 37. USER_SUBSCRIPTIONS TABLE (User subscription tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id VARCHAR NOT NULL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    plan_id VARCHAR NOT NULL REFERENCES subscription_plans(id),
    status VARCHAR DEFAULT 'active',
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP,
    auto_renew BOOLEAN DEFAULT false,
    payment_method VARCHAR,
    payment_id VARCHAR,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- PERFORMANCE INDEXES
-- =============================================================================

-- User identification and authentication
CREATE INDEX IF NOT EXISTS idx_users_user_platform_id ON users(user_platform_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Tournament data
CREATE INDEX IF NOT EXISTS idx_tournaments_user_id ON tournaments(user_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_date_played ON tournaments(date_played);
CREATE INDEX IF NOT EXISTS idx_tournaments_site ON tournaments(site);
CREATE INDEX IF NOT EXISTS idx_tournaments_category ON tournaments(category);
CREATE INDEX IF NOT EXISTS idx_tournaments_speed ON tournaments(speed);

-- Session tracking
CREATE INDEX IF NOT EXISTS idx_grind_sessions_user_id ON grind_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_grind_sessions_date ON grind_sessions(date);
CREATE INDEX IF NOT EXISTS idx_grind_sessions_status ON grind_sessions(status);

-- Analytics and activities
CREATE INDEX IF NOT EXISTS idx_user_activities_user_id ON user_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_created_at ON user_activities(created_at);
CREATE INDEX IF NOT EXISTS idx_user_activities_activity_type ON user_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_engagement_metrics_user_id ON engagement_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_user_date ON analytics_daily(user_id, date);

-- Upload and data management
CREATE INDEX IF NOT EXISTS idx_upload_history_user_id ON upload_history(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_history_upload_date ON upload_history(upload_date);

-- Calendar and scheduling
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_day_of_week ON calendar_events(day_of_week);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);

-- Study management
CREATE INDEX IF NOT EXISTS idx_study_cards_user_id ON study_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON study_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_date ON study_sessions(date);

-- Security and access
CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);

-- Notifications and coaching
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_coaching_insights_user_id ON coaching_insights(user_id);

-- =============================================================================
-- UNIQUE CONSTRAINTS (Additional to primary keys)
-- =============================================================================

-- Prevent duplicate user permissions
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_permissions_unique 
ON user_permissions(user_id, permission_id);

-- Prevent duplicate daily analytics
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_daily_unique 
ON analytics_daily(user_id, date);

-- Prevent duplicate engagement metrics per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_engagement_metrics_user_unique 
ON engagement_metrics(user_id);

-- Prevent duplicate user settings
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_user_unique 
ON user_settings(user_id);

-- =============================================================================
-- COMMIT TRANSACTION
-- =============================================================================

COMMIT;

-- =============================================================================
-- POST-DEPLOYMENT VERIFICATION QUERIES
-- =============================================================================

-- Uncomment these lines to verify deployment after migration:

-- -- Verify table count (should be 37 tables)
-- SELECT COUNT(*) as total_tables 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- -- Verify foreign key constraints are properly set
-- SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY' 
--   AND tc.table_schema = 'public'
--   AND ccu.column_name = 'user_platform_id'
-- ORDER BY tc.table_name;

-- -- Verify indexes are created
-- SELECT schemaname, tablename, indexname 
-- FROM pg_indexes 
-- WHERE schemaname = 'public' 
-- ORDER BY tablename, indexname;

-- =============================================================================
-- DEPLOYMENT NOTES
-- =============================================================================

-- 1. This migration is designed for Render PostgreSQL environment
-- 2. All foreign keys reference users.user_platform_id for data isolation
-- 3. Sequential user IDs (USER-0001, USER-0002) ensure unique identification
-- 4. IF NOT EXISTS clauses make this migration idempotent and safe to re-run
-- 5. Comprehensive indexing for optimal query performance
-- 6. Auto-populated tables will be filled by application middleware/jobs
-- 7. Calendar categories will be auto-created on first user access

-- Expected result: 37 tables with proper relationships and 31+ foreign key constraints to users.user_platform_id