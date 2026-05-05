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
import { registerStudiesV2Routes } from "./studies-v2";
import { registerTournamentLibraryRoutes } from "./tournament-library";
import { registerCoachRoutes } from "./coach";
import { registerTournamentSelectorRoutes } from "./tournament-selector";
import { registerBankrollRoutes } from "./bankroll";
import { registerWalletRoutes } from "./wallets";
import { registerWarmupRitualsRoutes } from "./warmup-rituals";
import { registerTicketRoutes } from "./tickets";
import { registerCooldownRoutes } from "./cooldown";
import { registerCooldownAnalyticsRoutes } from "./cooldownAnalytics";
import { registerStatsAnalyzerRoutes } from "./statsAnalyzer";
import { registerStarredHandsRoutes } from "./starred-hands";
import { registerStudyRecommendationsRoutes } from "./study-recommendations";
import { registerStudyThemeSpotLinkRoutes } from "./study-theme-spot-links";
import { registerStudyMiscRoutes } from "./study-misc";
import { registerLibraryRoutes } from "./library-register";
import { registerTournamentSeriesRoutes } from "./tournament-series";
import { registerAllJobs } from "../jobs";
import { spotStorage } from "../lib/spotStorage";
import primedopeRouter from "./primedope";
import gradeDayDetailRouter from "./grade-day-detail";
// Sprint home-reform-1 (RF-01, RF-02): operations cockpit + news stub.
import { registerHomeRoutes } from "./home";
import { registerNewsRoutes } from "./news";
// Sprint home-reform-1-5 (RF-28): /api/library/continue.
import { registerLibraryContinueRoutes } from "./library-continue";
// Sprint home-reform-4 / Item 4: /api/home/coach-recommendation/*.
import { registerHomeCoachRecRoutes } from "./home-coach-recommendation";
// Sprint home-reform-4 / Item 7: /api/home/focus-stats + /api/focus-stats/*.
import { registerHomeFocusStatsRoutes } from "./home-focus-stats";
import { registerFocusStatsRoutes } from "./focus-stats";
// Sprint home-reform-5 item 11: /api/home/settings (engrenagem).
import { registerHomeSettingsRoutes } from "./home-settings";
// Sprint FX-1: /api/fx/current (user-level) + /api/admin/fx/* (admin-only).
import { registerFxRoutes } from "./fx";
import { registerAdminFxRoutes } from "./adminFx";

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
        connectSrc: ["'self'", "ws:", "wss:", "https://api.stripe.com"],
        frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
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
    // Note: req.path is relative to mount point '/api', so '/api/auth/login' becomes '/auth/login'
    if (req.path === '/auth/login' || req.path === '/auth/register') return next();
    // Skip CSRF for other public auth endpoints
    if (req.path === '/auth/forgot-password' || req.path === '/auth/reset-password' || req.path === '/auth/verify-email' || req.path === '/auth/resend-verification' || req.path === '/auth/send-verification' || req.path === '/auth/refresh' || req.path === '/auth/verify-reset-token') return next();
    // Skip CSRF for webhooks (use their own verification)
    if (req.path.startsWith('/webhooks/')) return next();
    // Skip CSRF for CSRF token endpoint itself
    if (req.path === '/csrf-token') return next();

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
  registerTournamentSeriesRoutes(app);
  registerGradePlannerRoutes(app);
  registerGrindSessionRoutes(app);
  registerUploadRoutes(app);
  registerStudiesRoutes(app);
  registerStudiesV2Routes(app);
  registerCalendarRoutes(app);
  registerSubscriptionRoutes(app);
  registerNotificationRoutes(app);
  registerBugReportRoutes(app);
  registerTournamentLibraryRoutes(app);
  registerCoachRoutes(app);
  registerTournamentSelectorRoutes(app);
  registerBankrollRoutes(app);
  registerWalletRoutes(app);
  registerWarmupRitualsRoutes(app);
  registerTicketRoutes(app);
  registerCooldownRoutes(app);
  registerCooldownAnalyticsRoutes(app);
  registerStatsAnalyzerRoutes(app);
  // Sprint F2 — print de spots durante grind. Vive em arquivo dedicado para
  // nao colidir com cooldown.ts (rotas distintas: /:id/discard vs /:id).
  registerStarredHandsRoutes(app);
  // Sprint Studies-Reform — RF-05 (theme-spot links) + RF-06 (recommendations) + RF-12 (streak) + dashboard
  registerStudyRecommendationsRoutes(app);
  registerStudyThemeSpotLinkRoutes(app);
  registerStudyMiscRoutes(app);
  // Sprint Biblioteca-1 RF-03/04/05/06/11 — endpoints biblioteca + admin
  registerLibraryRoutes(app);

  // Sprint F4 (PrimeDope variance simulation + drill-down) — routers default-export.
  app.use("/api/primedope", primedopeRouter);
  app.use("/api/grade", gradeDayDetailRouter);

  // Sprint home-reform-1 (RF-01 + RF-02): /api/home/overview + /api/news.
  registerHomeRoutes(app);
  registerNewsRoutes(app);
  // Sprint home-reform-1-5 (RF-28): /api/library/continue.
  registerLibraryContinueRoutes(app);
  // Sprint home-reform-4 / Item 4: /api/home/coach-recommendation/*.
  registerHomeCoachRecRoutes(app);
  // Sprint home-reform-4 / Item 7: /api/home/focus-stats + /api/focus-stats/*.
  registerHomeFocusStatsRoutes(app);
  registerFocusStatsRoutes(app);
  // Sprint home-reform-5 item 11: /api/home/settings (engrenagem).
  registerHomeSettingsRoutes(app);
  // Sprint FX-1: /api/fx/current + /api/admin/fx/*.
  registerFxRoutes(app);
  registerAdminFxRoutes(app);

  registerMiscRoutes(app);
  await registerSupremaRoutes(app);

  // Sprint F2 — health check do storage de prints + agenda cron de purge.
  // Falha no health check eh logada mas NAO crasha o boot (graceful degradation).
  try {
    const health = await spotStorage.healthCheck();
    if (!health.ok) {
      console.error("spot.storage.health_check_failed", health);
    } else {
      console.info("spot.storage.health_check_ok", health);
    }
  } catch (err: any) {
    console.error("spot.storage.health_check_error", { err: err?.message ?? err });
  }
  await registerAllJobs();

  const httpServer = createServer(app);
  return httpServer;
}
