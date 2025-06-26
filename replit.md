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
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
Data processing: Follow universal poker site rules for profit calculation and categorization.
```