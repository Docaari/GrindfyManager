# Grindfy - Poker Tournament Tracker

## Overview

Grindfy is a comprehensive poker tournament tracking application built for poker players to manage, analyze, and optimize their tournament performance. The application provides dashboard analytics, tournament library management, weekly planning, grind session tracking, mental preparation tools, coaching insights, and data import capabilities.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: React Query (TanStack Query) for server state management
- **Styling**: Tailwind CSS with custom poker theme variables
- **UI Components**: Radix UI primitives with custom shadcn/ui components
- **Build Tool**: Vite with custom configuration for development and production

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **Authentication**: Replit Auth with OpenID Connect integration
- **Session Management**: Express sessions with PostgreSQL storage
- **API Design**: RESTful API with structured error handling and logging middleware

### Database Architecture
- **Database**: PostgreSQL (Neon serverless)
- **ORM**: Drizzle ORM with type-safe queries
- **Schema**: Comprehensive schema for users, tournaments, templates, planning, and coaching data
- **Migrations**: Drizzle Kit for schema management and migrations

## Key Components

### Authentication System
- Replit Auth integration with OpenID Connect
- Session-based authentication with PostgreSQL session store
- Protected routes with authentication middleware
- User profile management with subscription tiers

### Tournament Management
- Tournament creation, editing, and deletion
- Tournament templates for recurring events
- Advanced filtering and search capabilities
- ROI calculations and performance metrics
- CSV/Excel data import functionality

### Dashboard Analytics
- Real-time performance metrics (profit/loss, ROI, tournament count)
- Interactive profit charts with cumulative tracking
- Configurable time periods (7d, 30d, 90d, 1y)
- Visual performance indicators and trends

### Planning System
- Weekly tournament planning with calendar view
- Template-based tournament scheduling
- Session tracking with real-time timers
- Goal setting and progress monitoring

### Mental Preparation Tools
- Pre-session mental state tracking
- Preparation checklists and routines
- Focus area identification
- Session goal setting and reflection

### Coaching Integration
- AI-powered coaching insights
- Performance analysis and recommendations
- Custom coaching feedback system
- Progress tracking and improvement areas

## Data Flow

1. **Authentication Flow**: User authenticates via Replit Auth → Session established → User profile loaded
2. **Tournament Data Flow**: User creates/imports tournaments → Data stored in PostgreSQL → Analytics computed → Dashboard updated
3. **Planning Flow**: User creates weekly plans → Templates selected → Sessions scheduled → Progress tracked
4. **Analytics Flow**: Tournament data aggregated → Metrics calculated → Charts generated → Dashboard displayed

## External Dependencies

### Core Dependencies
- **Authentication**: Replit Auth with OpenID Connect
- **Database**: Neon PostgreSQL serverless database
- **File Processing**: Multer for file uploads, CSV parser for data import
- **Charts**: Recharts for data visualization
- **Forms**: React Hook Form with Zod validation

### UI Dependencies
- **Component Library**: Radix UI primitives
- **Styling**: Tailwind CSS with PostCSS
- **Icons**: Lucide React icons
- **Notifications**: Custom toast system

### Development Dependencies
- **Build**: Vite with React plugin
- **TypeScript**: Full type safety across frontend and backend
- **Database Tools**: Drizzle Kit for migrations and schema management

## Deployment Strategy

### Development Environment
- Replit-based development with hot module reloading
- Vite dev server with Express backend proxy
- PostgreSQL database provisioning via Replit

### Production Deployment
- **Build Process**: Vite build for frontend, esbuild for backend bundling
- **Deployment Target**: Replit Autoscale with containerized deployment
- **Environment Variables**: Database URL, session secrets, auth configuration
- **Static Assets**: Served via Express with Vite-built assets

### Database Management
- **Schema Versioning**: Drizzle migrations for schema changes
- **Connection Pooling**: Neon serverless connection management
- **Backup Strategy**: Automated backups via Neon platform

## Data Interpretation Rules

### Universal CSV Parsing Rules (Applied to All Sites)

#### Profit Calculation
- Profit = Resultado (Winnings) - Rake
- This formula applies universally across all poker sites

#### Tournament Categorization (Priority Order)
1. **Mystery** (Highest Priority): Name contains "Mystery"
2. **PKO** (Second Priority): 
   - Flags/Bandeira contains "Bounty" OR
   - Name contains "Progressive", "Knockout", "KO", "Bounty", or "PKO"
3. **Vanilla** (Default): All other tournaments

#### Speed Classification
- **Hyper**: "Super Turbo" in speed field
- **Turbo**: "Turbo" in speed field  
- **Normal**: "Normal" in speed field or default

#### Currency Conversion
- When currency ≠ USD (CNY, EUR, etc.), convert all monetary values using configured exchange rates
- Exchange rates configurable in Settings menu
- Convert: Buy-in, Rake, Resultado, Premiação

#### Final Table Detection
- Position ≤ 9 OR Position ≤ 10% of field size

#### Big Hit Detection  
- Profit > 10x Buy-in

## Changelog

```
Changelog:
- June 26, 2025. Initial setup
- June 26, 2025. Implemented universal data interpretation rules for all poker sites
- June 26, 2025. Corrected profit calculations: Resultado - Rake (not subtracting buy-in twice)
- June 26, 2025. Standardized categorization: Mystery > PKO > Vanilla priority order
- June 26, 2025. Expanded Module 3 (Tournament Library) with advanced filtering and analysis
- June 26, 2025. Updated dashboard to display all PRD 3.1 indicators: Contagem, Lucro, ABI, ROI, ITM, Reentradas, etc.
- June 26, 2025. Enhanced schema with all required fields from Prisma reference document
- June 26, 2025. Fixed CSV parser to handle Brazilian format with leading spaces in column names
- June 26, 2025. Successfully imported 552 tournaments from GGNetwork CSV file
- June 26, 2025. Reorganized dashboard layout: 3 main indicators (larger), 6 secondary, 5 tertiary for clear performance view
- June 26, 2025. All 15 dashboard indicators now calculating correctly with real tournament data
- June 26, 2025. **MODULE 3.2 COMPLETED**: Full CSV import system with validation, multi-site support, and accurate calculations
- June 26, 2025. Fixed dashboard calculation precision: Stake Médio, Finalização Precoce/Tardia percentages, Média Participantes
- June 26, 2025. Successfully imported and verified 384 WPN tournaments with 100% data accuracy
- June 26, 2025. System ready for multi-site CSV testing (PokerStars, 888poker, PartyPoker, etc.)
- June 26, 2025. Fixed app startup error: TypeError in coaching recommendations (ROI calculation)
- June 26, 2025. Added quick period filter buttons: 7/30/90/365 days, Month-to-date, Year-to-date, All time
- June 26, 2025. Enhanced button styling with poker-themed colors and smooth transitions
- June 26, 2025. Fixed date calculation logic for month/year period filters to prevent "Invalid time value" errors
- June 26, 2025. Set default dashboard period to 30 days as requested
- June 26, 2025. **COIN NETWORK SUPPORT ADDED**: Implemented full TXT file import for Coin network with Withdrawal/Deposit pairing logic
- June 26, 2025. Added intelligent format detection (CSV vs TXT) in upload system 
- June 26, 2025. Coin parser correctly handles tournament name extraction, speed classification, and profit calculations per specification
- June 26, 2025. **UPDATED COIN IMPORT LOGIC**: Implemented flexible pairing algorithm for Withdrawal/Deposit matching with non-duplication prevention
- June 26, 2025. Fixed "Torneios Recentes" section to properly respond to dashboard filters by ensuring correct data sorting and filtering
- June 26, 2025. **BODOG NETWORK SUPPORT ADDED**: Implemented Excel (.xlsx) file import for Bodog network with Buy-In/Payout pairing using Reference ID matching
- June 26, 2025. **BODOG DEDUPLICATION PERFECTED**: Implemented multi-level deduplication - Reference ID uniqueness in parser + database-level verification to prevent any duplicate tournaments
- June 26, 2025. **BODOG REFERENCE ID SYSTEM**: Enhanced tournament names to include Reference ID [REF123] format for precise duplicate detection and prevention
- January 01, 2025. **COINPOKER CSV SUPPORT ADDED**: Implemented full CSV parser for CoinPoker with transaction pairing logic following specific rules: NL Hold'em filtering, buy-in/result pairing, USDT as USD conversion
- January 01, 2025. **UPLOAD HISTORY PAGE PORTUGUESE TRANSLATION**: Completely translated Upload History page to Portuguese including all sections, status messages, and help content
- January 01, 2025. **ENHANCED HELP SECTION**: Updated help section with specific Sharkscope CSV export instructions for each poker site and added CoinPoker manual process instructions
- January 01, 2025. **DISCORD CONTACT BUTTON**: Added Discord contact button in help section (to be configured later) for user support
- January 01, 2025. **POKER SITE ICONS INTEGRATION**: Added real poker site logos to Upload History page with fallback system for failed image loads
- January 01, 2025. **BODOG XLSX PARSER ENHANCEMENT**: Updated Bodog parser with improved date conversion (jun. 27/25 format), standardized tournament naming ($X Vanilla format), and better file format support documentation
- January 01, 2025. **GRADE PLANNER COMPLETE REDESIGN**: Replaced Grade Coach with comprehensive Grade Planner featuring performance insights cards, weekly tournament planning with popup interface, smart suggestions system, and detailed tournament management
- January 01, 2025. **PERFORMANCE INSIGHTS ENHANCEMENT**: Updated insights cards with detailed metrics (Volume, Lucro Total, Lucro Médio, ROI) in grid format - Sites and Buy-in ranges show 6 items in 3x2 grid, Types card is compact with 3 items, Buy-in ranges ordered by volume for better sampling
- January 01, 2025. **GRIND SESSION LIVE FIXES**: Fixed critical tournament workflow issues - corrected status transitions (Upcoming → Registered → Finished), implemented proper site color coding matching Grade Planner, resolved schema validation errors for session tournament creation, and enhanced tournament organization logic
- January 01, 2025. **SESSION TOURNAMENT VALIDATION**: Enhanced server-side validation to handle null values and string-to-number conversions properly, ensuring smooth tournament creation and updates during live sessions
- January 07, 2025. **GRIND SESSION LIVE COMPLETE FUNCTIONALITY**: Fixed critical tournament workflow - corrected tournament status transitions (Upcoming → Registered → Completed), implemented proper edit dialog with Site/Type/Speed/Buy-in/Guaranteed/Time fields, resolved schema validation for startTime field conversion from string to Date, and completed full tournament management system for live sessions
- January 07, 2025. **GRIND SESSION COMPACT DESIGN**: Implemented compact card layout for session tournaments - reduced padding and heights, optimized field sizing (Bounty: 14px width, Prize: 16px width, Position: 12px width), removed number input spinners, repositioned undo button as small icon in top-right corner, improved rebuy button contrast with amber background, enhanced button visibility for "Próximos" section with better color contrast
- January 07, 2025. **BREAK MANAGEMENT SYSTEM OVERHAUL**: Redesigned break system to trigger notifications at minute 54 (instead of 55), completely rebuilt break management dialog to focus only on registered break feedbacks, removed programmed breaks section, added prominent "Gerar Novo Report" button for manual break reporting, improved UX with real-time feedback display and enhanced visual design with poker theme compatibility
- January 07, 2025. **SESSION FINALIZATION POPUP REDESIGNED**: Enhanced popup design with improved contrast, bold white titles on dark backgrounds, better spacing, and consistent poker theme styling for all cards and headers
- January 07, 2025. **COMPLETE SESSION HISTORY SYSTEM**: Implemented comprehensive session history with dedicated API endpoint `/api/grind-sessions/history` that calculates all statistics (Volume, Profit, ABI Med, ROI, FTs, Cravadas, break averages), enhanced cards display all key metrics at-a-glance, detailed tabs for Performance/Mental State/Preparation/Objectives with rich information including preparation percentages, break feedback averages, objective completion status, and final notes
- January 08, 2025. **PREPARATION PERCENTAGE FIELD SEPARATION**: Fixed preparation notes capture system to properly store preparation percentage as separate numeric field (preparationPercentage) instead of combining with text notes, added database schema field, updated session creation to capture both percentage and notes independently, enhanced session cards to display preparation percentage indicator with filtering capability, applied requested Filter button styling with text-[#000000] class
- January 08, 2025. **SESSION CONFLICT DIALOG SYSTEM**: Implemented comprehensive conflict detection system for session creation - when user tries to create session on existing session day, shows dialog with three options: "Editar Sessão Existente" (opens edit dialog), "Criar Nova Sessão e Substituir" (deletes old session and creates new), "Cancelar Ação" (closes dialog). System checks session history by date comparison and provides clear session information display with volume/profit preview
- January 08, 2025. **WARM UP PHASE 2 COMPLETE**: Implemented full Phase 2 features including Timer de Meditação (5-30min configurável), Guia de Visualização (5 steps com navegação automática/manual), Biblioteca de Áudios (3 categorias: motivacional, hipnose, foco) with favorites system, all integrated via elegant modal dialogs with comprehensive controls and educational content
- January 08, 2025. **SOPHISTICATED WARM UP → SESSION INTEGRATION**: Implemented complete integration flow - Warm Up data automatically transfers to session creation, conflict detection for same-day sessions, structured observations formatting (score, activities, mental state), localStorage-based data transfer with automatic cleanup, seamless user experience from preparation to grind session start
- January 08, 2025. **COMPREHENSIVE STUDIES PAGE OVERHAUL**: Implemented advanced studies management system with study session timer (play/pause/stop controls), correlation analysis between study effort and tournament performance, intelligent notifications for weekly study goals (8h target), smart recommendations engine based on priority/progress/time invested, achievement system with badges for milestones, advanced analytics showing study streaks and category performance rankings, CSV export functionality for external analysis, gamification elements to increase user engagement
- January 08, 2025. **STUDIES ANALYTICS & GAMIFICATION**: Enhanced studies page with streak calculation system, category performance analysis, achievement unlocking (Centúria, Dedicado, Consistência, Expert, Finalizador badges), real-time progress tracking with visual indicators, meta completion notifications, and comprehensive dashboard statistics showing active cards, time invested, knowledge scores, and completion rates
- January 08, 2025. **STUDIES WEEKLY PLANNING SYSTEM**: Implemented comprehensive weekly study planning functionality with multiple day selection (Monday-Sunday checkboxes), study time configuration (start time + duration), recurring study toggle with weekly frequency settings, optional study descriptions (e.g., "Aula da Apollo", "Teoria ICM"), new "Planejamento" tab in study card details showing configured schedule, database schema extension with studyDays, studyStartTime, studyDuration, isRecurring, weeklyFrequency, and studyDescription fields, future-ready for intelligent calendar integration
- January 08, 2025. **FLASHCARDS REMOVAL & ENDPOINT FIXES**: Completely removed flashcards functionality as requested, corrected API endpoints for materials and notes (now using /api/study-cards/:id/materials and /api/study-cards/:id/notes), cleaned up schema, storage, and route files, reduced study card detail tabs from 5 to 4 (removed flashcards tab), fixed "Add Material" and "Add Annotation" buttons that were not working due to incorrect endpoint URLs
- January 08, 2025. **GRADE PLANNER EDIT/DELETE FUNCTIONALITY**: Fixed critical bugs in tournament edit and delete functionality - corrected apiRequest syntax for proper authentication, enhanced data validation for numeric fields (buyIn, guaranteed), implemented separate edit form to avoid conflicts, added comprehensive logging for debugging, confirmed PUT and DELETE endpoints working correctly with proper error handling
- January 08, 2025. **SMART SUGGESTIONS SYSTEM CORRECTION**: Fixed suggestions system to exclusively use tournaments from weekly grid instead of tournament library - sources data from both saved and pending tournaments from other days of the week, applies real-time filtering based on form values, sorts by frequency of use, provides intelligent empty state messages depending on whether grid has tournaments or not
- January 08, 2025. **FORM PERSISTENCE ENHANCEMENT**: Implemented selective form field persistence after adding tournaments - keeps Site, Type, Buy-in, and Speed filled for sequential tournament entry, clears Time, Guaranteed, and Name fields as required, added "Limpar Todos" button to reset entire form when needed, enhances user experience for bulk tournament planning
- January 08, 2025. **GRADE PLANNER WEEKLY DASHBOARD**: Implemented comprehensive weekly dashboard at top of "Planejamento Semanal" section displaying Volume e Investimento (total tournaments, buy-in value, ABI), Tamanho do Field (average participants), Tipos de Torneio (Vanilla/PKO/Mystery counts with percentages), Velocidade (Normal/Turbo/Hyper counts with percentages), automatically updates when tournaments are added/removed from daily cards
- January 08, 2025. **GRADE PLANNER ESTIMATED GRIND TIMES**: Added automatic grind session time calculation to daily cards based on tournament times (earliest start time to latest + 3h duration), displays estimated session times prominently in card headers, integrated weekly total grind time into dashboard, cards show placeholder "–" when no times available, enhances planning visibility and future calendar integration readiness
- January 08, 2025. **GRADE PLANNER CARD VISUAL ENHANCEMENT**: Redesigned daily planning cards with improved hierarchy - prominent day titles, highlighted grind session times in header with gradient background, organized information into grouped sections (Volume, Tipos, Velocidades) with icons and better spacing, enhanced hover effects and professional styling following Grindfy design system, improved responsive layout for desktop and tablet
- January 08, 2025. **GRADE PLANNER CARD LAYOUT OPTIMIZATION**: Completely reorganized daily card layout with two main groups - Group 1 (Volume metrics: Total Investido, ABI Médio, Participantes, Tipo Predominante, Velocidade Predominante) and Group 2 (Sessão de Grind: horário início-fim, tempo estimado), improved typography with larger fonts for key values, added clear visual separation between groups, enhanced readability and information hierarchy following user feedback
- January 08, 2025. **CALENDÁRIO INTELIGENTE IMPLEMENTATION**: Implemented complete intelligent calendar system in Weekly Planner with automatic routine generation based on Grade and Studies data, follows PRD specification with 15-min warmup, 3-hour rest periods, conflict detection, visual differentiation for activity types (grind/warmup/rest/study), database schema with weeklyRoutines and studySchedules tables, API endpoints for routine generation and management, comprehensive UI with tabs for intelligent vs manual planning, color-coded blocks and conflict alerts
- January 08, 2025. **UNIFIED CALENDAR SYSTEM**: Unified calendar system by removing separate tabs and integrating "Gerar Nova Rotina" button to populate Advanced Calendar directly with editable Grind and Study events, automatic cleanup of old generated events, complete integration between intelligent routine generation and drag-and-drop calendar interface, events created as editable cards with proper authentication and database persistence
- January 08, 2025. **CALENDAR TIMESTAMP VALIDATION**: Implemented robust timestamp validation system to prevent "Invalid time value" errors - added comprehensive input validation for time formats, enhanced error handling with try-catch blocks, improved createTimestamp function with boundary checking, implemented validateTimestamp helper function, added automatic event cleanup system to prevent duplicates during routine generation
- January 08, 2025. **POPUP DESIGN ENHANCEMENT**: Redesigned "Novo Compromisso" popup dialog with Grindfy theme - dark gray background (bg-gray-900), white text throughout, properly styled input fields with gray-800 backgrounds, red focus states matching platform colors, improved labels with gray-300 text, enhanced buttons with red primary colors, better spacing and visual hierarchy for improved UX
- January 08, 2025. **CALENDAR EVENT VISUALIZATION FIX**: Fixed calendar event rendering to show single continuous cards instead of multiple 15-minute segments - events now display as unified blocks spanning their full duration, implemented proper height calculation based on event duration, improved visual hierarchy with proper z-index layering
- January 08, 2025. **ENHANCED GERAR NOVA ROTINA FUNCTIONALITY**: Completely rebuilt "Gerar Nova Rotina" system to integrate Grade and Studies data - automatically pulls tournament schedules from Grade page, creates Grind session cards with automatic 15-minute Warm-up periods, integrates study schedules from Studies page, includes automatic cleanup of existing routine events before creating new ones, provides proper categorization and visual differentiation for each activity type
- January 08, 2025. **GERAR NOVA ROTINA DEMO DATA**: Implemented example data to demonstrate calendar event creation system - creates sample Study sessions (Monday 14:00-16:00, Thursday 15:30-17:30), Grind sessions with Warm-up (Tuesday 19:00-22:00, Friday 20:00-23:30), proper event categorization, and database persistence to showcase the intelligent routine generation functionality
- January 08, 2025. **GERAR NOVA ROTINA REAL DATA INTEGRATION**: Implemented real data integration system - automatically pulls planned tournaments from Grade page (plannedTournaments table) by date matching, retrieves study schedules from studySchedules table and study cards with studyDays configuration, creates proper Grind sessions with tournament count and timing, generates Study sessions with accurate titles and descriptions, comprehensive logging for debugging data flow
- January 10, 2025. **SESSION FINALIZATION VALIDATION BUG FIX**: Fixed critical bug where "Finalizar Sessão" button bypassed validation checks by calling setShowSessionSummary(true) directly instead of handleSessionFinalization() function - now properly validates pending tournaments before allowing session completion
- January 10, 2025. **PROFIT CALCULATION DISCREPANCY FIX**: Corrected profit calculation inconsistency between live session stats and final session summary - calculateFinalSessionStats() was missing bounty component in profit calculation, now uses consistent formula: (result + bounty) - totalInvested across both functions
- January 10, 2025. **BOUNTY CALCULATION CONSISTENCY FIX**: Resolved critical bounty calculation inconsistency between active sessions and session history - fixed server-side session history endpoint to include bounties in profit calculation using formula: (totalResult + totalBounties) - totalBuyins, ensuring identical calculations across frontend active sessions and backend history data
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
Data processing: Follow universal poker site rules for profit calculation and categorization.
```