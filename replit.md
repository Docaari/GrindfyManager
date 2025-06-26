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

## Changelog

```
Changelog:
- June 26, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```