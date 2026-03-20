import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupSubscriptionProcessing } from "../subscriptionMiddleware";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { registerAuthRoutes } from "./auth";
import { registerAdminRoutes } from "./admin";
import { registerDashboardRoutes } from "./dashboard";
import { registerAnalyticsRoutes } from "./analytics";
import { registerTournamentRoutes } from "./tournaments";
import { registerGradePlannerRoutes } from "./grade-planner";
import { registerGrindSessionRoutes } from "./grind-sessions";
import { registerUploadRoutes } from "./upload";
import { registerStudiesRoutes } from "./studies";
import { registerCalendarRoutes } from "./calendar";
import { registerSubscriptionRoutes } from "./subscriptions";
import { registerNotificationRoutes } from "./notifications";
import { registerBugReportRoutes } from "./bug-reports";
import { registerMiscRoutes } from "./misc";
import { registerSupremaRoutes } from "./suprema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check — before all middleware (no auth, no CSRF, no rate limit)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Cookie parser middleware (must be before routes)
  app.use(cookieParser());

  // 1. Security headers with Helmet
  const isProduction = process.env.NODE_ENV === 'production';
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: isProduction
          ? ["'self'", "'unsafe-inline'"]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // 2. General API rate limiting
  const apiRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per window
    message: {
      message: 'Muitas requisições. Tente novamente em alguns minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for static assets
      return req.url.includes('/assets/') || req.url.includes('/favicon.ico');
    }
  });

  // Apply rate limiting to all API routes
  app.use('/api', apiRateLimit);

  // 3. CSRF Protection via Double-Submit Cookie
  function csrfProtection(req: any, res: any, next: any) {
    // Skip CSRF for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    // Skip CSRF for auth login/register (no session yet)
    if (req.path === '/api/auth/login' || req.path === '/api/auth/register') return next();
    // Skip CSRF for webhooks (use their own verification)
    if (req.path.startsWith('/api/webhooks/')) return next();
    // Skip CSRF for CSRF token endpoint itself
    if (req.path === '/api/csrf-token') return next();

    const cookieToken = req.cookies?.grindfy_csrf_token;
    const headerToken = req.headers['x-csrf-token'] as string;

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return res.status(403).json({ message: 'Invalid CSRF token' });
    }

    next();
  }

  app.use('/api', csrfProtection);

  // Auth middleware
  // await setupAuth(app); // COMENTADO: Replit Auth removido para evitar conflito com sistema JWT

  // SUBSCRIPTION SYSTEM IMPLEMENTATION
  // Configure subscription processing
  setupSubscriptionProcessing();

  // Register all route modules in order
  registerAuthRoutes(app);
  registerAdminRoutes(app);
  registerDashboardRoutes(app);
  registerAnalyticsRoutes(app);
  registerTournamentRoutes(app);
  registerGradePlannerRoutes(app);
  registerGrindSessionRoutes(app);
  registerUploadRoutes(app);
  registerStudiesRoutes(app);
  registerCalendarRoutes(app);
  registerSubscriptionRoutes(app);
  registerNotificationRoutes(app);
  registerBugReportRoutes(app);
  registerMiscRoutes(app);
  await registerSupremaRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
