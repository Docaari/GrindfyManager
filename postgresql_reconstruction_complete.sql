-- GRINDFY COMPLETE DATABASE RECONSTRUCTION SCRIPT
-- PostgreSQL Production Database for Render Deployment
-- 38 Tables Total with Proper Foreign Key Relationships using users.user_platform_id
-- Created: January 25, 2025

-- =================================================================================
-- CRITICAL FK PATTERN: ALL foreign keys use users.user_platform_id (NOT users.id)
-- =================================================================================

BEGIN;

-- 1. SESSIONS TABLE (Express session storage)
CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR PRIMARY KEY NOT NULL,
    sess JSONB NOT NULL,
    expire TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON sessions (expire);

-- 2. USERS TABLE (Main user table with unique user_platform_id)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_platform_id VARCHAR UNIQUE NOT NULL, -- Critical: Sequential IDs (USER-0001, USER-0002, etc.)
    email VARCHAR UNIQUE NOT NULL,
    username VARCHAR,
    name VARCHAR,
    first_name VARCHAR,
    last_name VARCHAR,
    password_hash VARCHAR,
    email_verified BOOLEAN DEFAULT false,
    email_verification_token VARCHAR,
    email_verification_expires TIMESTAMP,
    password_reset_token VARCHAR,
    password_reset_expires TIMESTAMP,
    refresh_token VARCHAR,
    refresh_token_expires TIMESTAMP,
    status VARCHAR DEFAULT 'active',
    subscription_plan VARCHAR DEFAULT 'basico', -- basico, premium, pro, admin
    subscription_status VARCHAR DEFAULT 'active',
    subscription_expires TIMESTAMP,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. PERMISSIONS TABLE (Authentication system)
CREATE TABLE IF NOT EXISTS permissions (
    id VARCHAR PRIMARY KEY NOT NULL,
    name VARCHAR UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. USER_PERMISSIONS TABLE (Many-to-many user permissions)
CREATE TABLE IF NOT EXISTS user_permissions (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    permission_id VARCHAR NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_by VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, permission_id)
);

-- 5. SUBSCRIPTIONS TABLE (Subscription tracking)
CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    stripe_customer_id VARCHAR,
    stripe_subscription_id VARCHAR,
    plan VARCHAR NOT NULL DEFAULT 'basico',
    status VARCHAR DEFAULT 'active',
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    trial_end TIMESTAMP,
    cancel_at_period_end BOOLEAN DEFAULT false,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. USER_ACTIVITIES TABLE (Activity tracking)
CREATE TABLE IF NOT EXISTS user_activities (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    activity_type VARCHAR NOT NULL,
    description TEXT,
    metadata JSONB,
    ip_address VARCHAR,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. ENGAGEMENT_METRICS TABLE (Analytics tracking)
CREATE TABLE IF NOT EXISTS engagement_metrics (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    date DATE NOT NULL,
    page_views INTEGER DEFAULT 0,
    session_duration INTEGER DEFAULT 0,
    actions_performed INTEGER DEFAULT 0,
    features_used JSONB DEFAULT '[]',
    last_active_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

-- 8. ACCESS_LOGS TABLE (System access logging)
CREATE TABLE IF NOT EXISTS access_logs (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    action VARCHAR NOT NULL,
    resource VARCHAR,
    ip_address VARCHAR,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. USER_ACTIVITY TABLE (Analytics daily tracking)
CREATE TABLE IF NOT EXISTS user_activity (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    activity_type VARCHAR NOT NULL,
    activity_data JSONB,
    page VARCHAR,
    session_id VARCHAR,
    ip_address VARCHAR,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. ANALYTICS_DAILY TABLE (Daily analytics aggregation)
CREATE TABLE IF NOT EXISTS analytics_daily (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    date DATE NOT NULL,
    page_views INTEGER DEFAULT 0,
    session_duration INTEGER DEFAULT 0,
    tournaments_created INTEGER DEFAULT 0,
    uploads_completed INTEGER DEFAULT 0,
    features_used JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

-- 11. NOTIFICATIONS TABLE (System notifications)
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    title VARCHAR NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR DEFAULT 'info',
    priority VARCHAR NOT NULL,
    days_until_expiration INTEGER,
    read BOOLEAN DEFAULT false,
    scheduled_for TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. TOURNAMENTS TABLE (Main tournament data)
CREATE TABLE IF NOT EXISTS tournaments (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    tournament_id VARCHAR,
    name VARCHAR NOT NULL,
    buy_in NUMERIC NOT NULL,
    prize_pool NUMERIC,
    position INTEGER,
    prize NUMERIC DEFAULT 0,
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
    rake NUMERIC DEFAULT 0,
    converted_to_usd BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    template_id VARCHAR,
    grind_session_id VARCHAR
);

-- 13. TOURNAMENT_TEMPLATES TABLE (Tournament templates)
CREATE TABLE IF NOT EXISTS tournament_templates (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    name VARCHAR NOT NULL,
    site VARCHAR NOT NULL,
    format VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    speed VARCHAR NOT NULL,
    day_of_week JSONB DEFAULT '[]',
    start_time JSONB DEFAULT '[]',
    avg_buyin NUMERIC DEFAULT 0,
    avg_roi NUMERIC DEFAULT 0,
    total_played INTEGER DEFAULT 0,
    total_profit NUMERIC DEFAULT 0,
    final_tables INTEGER DEFAULT 0,
    big_hits INTEGER DEFAULT 0,
    avg_field_size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_played TIMESTAMP
);

-- 14. WEEKLY_PLANS TABLE (Weekly planning)
CREATE TABLE IF NOT EXISTS weekly_plans (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    week_start TIMESTAMP NOT NULL,
    title VARCHAR,
    description TEXT,
    target_buyins NUMERIC,
    target_profit NUMERIC,
    target_volume INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. PLANNED_TOURNAMENTS TABLE (Tournament planning)
CREATE TABLE IF NOT EXISTS planned_tournaments (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    day_of_week INTEGER NOT NULL,
    profile VARCHAR NOT NULL DEFAULT 'A',
    site VARCHAR NOT NULL,
    time VARCHAR NOT NULL,
    type VARCHAR NOT NULL,
    speed VARCHAR NOT NULL,
    name TEXT NOT NULL,
    buy_in NUMERIC NOT NULL,
    guaranteed NUMERIC,
    template_id VARCHAR,
    status VARCHAR DEFAULT 'upcoming',
    start_time TIMESTAMP,
    rebuys INTEGER DEFAULT 0,
    result NUMERIC DEFAULT 0,
    bounty NUMERIC DEFAULT 0,
    position INTEGER,
    session_id VARCHAR,
    prioridade INTEGER DEFAULT 2,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. GRIND_SESSIONS TABLE (Grind session tracking)
CREATE TABLE IF NOT EXISTS grind_sessions (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    date TIMESTAMP NOT NULL,
    planned_buyins NUMERIC DEFAULT 0,
    actual_buyins NUMERIC DEFAULT 0,
    profit_loss NUMERIC DEFAULT 0,
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
    profit NUMERIC,
    abi_med NUMERIC,
    roi NUMERIC,
    fts INTEGER,
    cravadas INTEGER,
    energia_media NUMERIC,
    foco_medio NUMERIC,
    confianca_media NUMERIC,
    inteligencia_emocional_media NUMERIC,
    interferencias_media NUMERIC,
    vanilla_percentage NUMERIC,
    pko_percentage NUMERIC,
    mystery_percentage NUMERIC,
    normal_speed_percentage NUMERIC,
    turbo_speed_percentage NUMERIC,
    hyper_speed_percentage NUMERIC,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 17. BREAK_FEEDBACKS TABLE (Break feedback during sessions)
CREATE TABLE IF NOT EXISTS break_feedbacks (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
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

-- 18. SESSION_TOURNAMENTS TABLE (Live session tournaments)
CREATE TABLE IF NOT EXISTS session_tournaments (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    session_id VARCHAR NOT NULL,
    site VARCHAR NOT NULL,
    name TEXT,
    time VARCHAR,
    buy_in NUMERIC NOT NULL,
    guaranteed NUMERIC,
    rebuys INTEGER DEFAULT 0,
    result NUMERIC DEFAULT 0,
    position INTEGER,
    bounty NUMERIC DEFAULT 0,
    prize NUMERIC DEFAULT 0,
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

-- 19. PREPARATION_LOGS TABLE (Session preparation tracking)
CREATE TABLE IF NOT EXISTS preparation_logs (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    session_id VARCHAR,
    mental_state INTEGER NOT NULL,
    focus_level INTEGER NOT NULL,
    confidence_level INTEGER NOT NULL,
    exercises_completed JSONB DEFAULT '[]',
    warmup_completed BOOLEAN DEFAULT false,
    session_goals TEXT,
    notes TEXT,
    post_session_review TEXT,
    goals_achieved BOOLEAN,
    lessons_learned TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 20. CUSTOM_GROUPS TABLE (Custom tournament groups)
CREATE TABLE IF NOT EXISTS custom_groups (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    name VARCHAR NOT NULL,
    description TEXT,
    color VARCHAR,
    criteria JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 21. CUSTOM_GROUP_TEMPLATES TABLE (Group template relationships)
CREATE TABLE IF NOT EXISTS custom_group_templates (
    id VARCHAR PRIMARY KEY NOT NULL,
    group_id VARCHAR NOT NULL,
    template_id VARCHAR NOT NULL
);

-- 22. COACHING_INSIGHTS TABLE (AI coaching insights)
CREATE TABLE IF NOT EXISTS coaching_insights (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
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

-- 23. USER_SETTINGS TABLE (User preferences)
CREATE TABLE IF NOT EXISTS user_settings (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR UNIQUE NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    big_hit_multiplier NUMERIC DEFAULT 10,
    early_finish_threshold NUMERIC DEFAULT 0.3,
    late_finish_threshold NUMERIC DEFAULT 0.7,
    email_notifications BOOLEAN DEFAULT true,
    coaching_alerts BOOLEAN DEFAULT true,
    session_reminders BOOLEAN DEFAULT true,
    default_chart_period VARCHAR DEFAULT '30d',
    preferred_currency VARCHAR DEFAULT 'BRL',
    dark_mode BOOLEAN DEFAULT false,
    exchange_rates JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 24. STUDY_CARDS TABLE (Study management)
CREATE TABLE IF NOT EXISTS study_cards (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    title VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    priority VARCHAR NOT NULL,
    description TEXT,
    objectives TEXT,
    current_stat NUMERIC,
    target_stat NUMERIC,
    deadline TIMESTAMP,
    knowledge_score INTEGER DEFAULT 0,
    time_invested INTEGER DEFAULT 0,
    status VARCHAR DEFAULT 'active',
    study_days JSONB DEFAULT '[]',
    study_start_time VARCHAR,
    study_duration INTEGER,
    is_recurring BOOLEAN DEFAULT false,
    weekly_frequency INTEGER,
    study_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 25. STUDY_MATERIALS TABLE (Study materials)
CREATE TABLE IF NOT EXISTS study_materials (
    id VARCHAR PRIMARY KEY NOT NULL,
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

-- 26. STUDY_NOTES TABLE (Study notes)
CREATE TABLE IF NOT EXISTS study_notes (
    id VARCHAR PRIMARY KEY NOT NULL,
    study_card_id VARCHAR NOT NULL,
    title VARCHAR,
    content TEXT NOT NULL,
    tags JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 27. STUDY_SESSIONS TABLE (Study session tracking)
CREATE TABLE IF NOT EXISTS study_sessions (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    study_card_id VARCHAR,
    date TIMESTAMP NOT NULL,
    duration INTEGER NOT NULL,
    activities JSONB DEFAULT '[]',
    focus_score INTEGER,
    productivity_score INTEGER,
    insights TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 28. ACTIVE_DAYS TABLE (Active day management)
CREATE TABLE IF NOT EXISTS active_days (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    day_of_week INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 29. PROFILE_STATES TABLE (Profile state management)
CREATE TABLE IF NOT EXISTS profile_states (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    day_of_week INTEGER NOT NULL,
    active_profile VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 30. BUG_REPORTS TABLE (Bug reporting system)
CREATE TABLE IF NOT EXISTS bug_reports (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    page VARCHAR NOT NULL,
    description TEXT NOT NULL,
    urgency VARCHAR DEFAULT 'medium',
    type VARCHAR DEFAULT 'bug',
    status VARCHAR DEFAULT 'open',
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 31. UPLOAD_HISTORY TABLE (CSV upload tracking) -- CRITICAL FK FIX
CREATE TABLE IF NOT EXISTS upload_history (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FIXED: was users.id
    filename VARCHAR NOT NULL,
    status VARCHAR NOT NULL,
    tournaments_count INTEGER DEFAULT 0,
    error_message TEXT,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duplicates_found INTEGER DEFAULT 0,
    duplicate_action VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 32. WEEKLY_ROUTINES TABLE (Calendar system)
CREATE TABLE IF NOT EXISTS weekly_routines (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    week_start TIMESTAMP NOT NULL,
    blocks JSONB NOT NULL DEFAULT '[]',
    conflicts JSONB NOT NULL DEFAULT '[]',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_auto_generated BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 33. CALENDAR_CATEGORIES TABLE (Calendar categories) -- Hard-coded IDs required
CREATE TABLE IF NOT EXISTS calendar_categories (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
    name VARCHAR NOT NULL,
    color VARCHAR NOT NULL,
    icon VARCHAR,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 34. CALENDAR_EVENTS TABLE (Calendar events)
CREATE TABLE IF NOT EXISTS calendar_events (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
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

-- 35. STUDY_SCHEDULES TABLE (Study scheduling)
CREATE TABLE IF NOT EXISTS study_schedules (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
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

-- 36. SUBSCRIPTION_PLANS TABLE (Subscription management)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR PRIMARY KEY NOT NULL,
    name VARCHAR NOT NULL,
    description TEXT,
    permissions TEXT[],
    duration_days INTEGER DEFAULT 30,
    price NUMERIC(10,2),
    currency VARCHAR DEFAULT 'USD',
    is_active BOOLEAN DEFAULT true,
    features TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 37. USER_SUBSCRIPTIONS TABLE (User subscription tracking)
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id VARCHAR PRIMARY KEY NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE, -- FK pattern
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

-- =================================================================================
-- CRITICAL CALENDAR CATEGORIES INITIALIZATION
-- =================================================================================
-- These hard-coded category IDs are used by the application logic
-- Must be created for each user or system will fail

-- Note: These will be auto-populated by the application middleware
-- when users first access calendar functionality. The application expects:
-- cat-1 = Grind sessions (green)
-- cat-2 = Warm-up activities (yellow) 
-- cat-3 = Study sessions (blue)
-- cat-4 = Rest periods (gray)

-- =================================================================================
-- INDEXES FOR PERFORMANCE
-- =================================================================================
CREATE INDEX IF NOT EXISTS idx_users_user_platform_id ON users(user_platform_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_tournaments_user_id ON tournaments(user_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_date_played ON tournaments(date_played);
CREATE INDEX IF NOT EXISTS idx_tournaments_site ON tournaments(site);
CREATE INDEX IF NOT EXISTS idx_grind_sessions_user_id ON grind_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_grind_sessions_date ON grind_sessions(date);
CREATE INDEX IF NOT EXISTS idx_user_activities_user_id ON user_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_created_at ON user_activities(created_at);
CREATE INDEX IF NOT EXISTS idx_engagement_metrics_user_date ON engagement_metrics(user_id, date);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_user_date ON analytics_daily(user_id, date);
CREATE INDEX IF NOT EXISTS idx_upload_history_user_id ON upload_history(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_day_of_week ON calendar_events(day_of_week);

-- =================================================================================
-- AUTO-POPULATED TABLES NOTICE
-- =================================================================================
-- The following tables are populated automatically by background jobs/middleware:
-- - access_logs (populated by authentication middleware)
-- - user_activities (populated by activity tracking)
-- - engagement_metrics (populated by daily job from user_activities)
-- - analytics_daily (populated by daily aggregation job)
-- - notifications (populated by coaching insights system)
-- - coaching_insights (populated by AI analysis jobs)
-- =================================================================================

COMMIT;

-- =================================================================================
-- POST-DEPLOYMENT VERIFICATION QUERIES
-- =================================================================================
-- Run these queries after deployment to verify table creation:

-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
-- SELECT COUNT(*) as total_tables FROM information_schema.tables WHERE table_schema = 'public';
-- Expected result: 38 tables

-- Verify foreign key constraints:
-- SELECT tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
-- JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
-- WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
-- ORDER BY tc.table_name, tc.constraint_name;

-- Expected: All user_id foreign keys should reference users(user_platform_id)