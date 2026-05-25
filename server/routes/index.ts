import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupSubscriptionProcessing } from "../subscriptionMiddleware";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { pool } from "../db";

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
import { registerAdminSelectorCalibrationRoutes } from "./admin/tournamentSelectorCalibration";
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
import varianceRouter from "./variance";
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
// Sprint Estudos-Habito-1: /api/study-sessions + /api/users/me/study-habit + auto-suggest.
import { registerStudySessionsRoutes } from "./study-sessions";
import { registerFocusStatsAutoSuggestRoutes } from "./focus-stats-auto-suggest";
// Sprint Estudos-Coach-Biblio-2: /api/biblioteca/recommendations, /api/study-weekly-plan, /api/coach/session-insights.
import { registerBibliotecaRecommendationsRoutes } from "./biblioteca-recommendations";
import { registerStudyWeeklyPlanRoutes } from "./study-weekly-plan";
import { registerCoachSessionInsightsRoutes } from "./coach-session-insights";
// Sprint Spot-Anki-Reentry-3 — RF-1/2/4: insight extension + reentry endpoints.
import { registerStarredHandsExtendedRoutes } from "./starred-hands-extended";
import { registerSpotReentryRoutes } from "./spot-reentry";
import { registerReentryRoutes } from "./reentry";
// Sprint Mini Player 2 (ADR-190/191).
import { registerSpotifyAudioRoutes } from "./spotifyAudio";
import { registerUserActivityRoutes } from "./userActivity";
// Sprint MP-VALIDATION RF-03 — admin audio metrics panel.
import { registerAdminAudioMetricsRoutes } from "./adminAudioMetrics";
// Sprint Mini Player 3 / RF-05.5+RF-05.6 — POST/GET /api/audio/queue (ADR-193).
// MP3.1 R1 fix CRITICAL-3: handlers existiam mas rota nunca registrada.
import { registerAudioQueueRoutes } from "./audioQueue";

export async function registerRoutes(app: Express): Promise<Server> {
  // Wave C (Fase 3 obs): split liveness vs readiness.
  // /api/health = liveness probe (processo up — sem DB). Dockerfile HEALTHCHECK
  // + render.yaml continuam apontando aqui. Sempre 200 enquanto processo vivo.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // /api/ready = readiness probe (DB reachable). LoadBalancer / UptimeRobot
  // devem apontar aqui em prod. 503 quando pool wedged ou DB inalcancavel.
  // Race com timeout 2s — pool hung nao prende a probe.
  app.get('/api/ready', async (_req, res) => {
    const timeoutMs = 2000;
    let timer: NodeJS.Timeout | undefined;
    try {
      const ping = pool.query('SELECT 1');
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('ready check timeout')), timeoutMs);
      });
      await Promise.race([ping, timeout]);
      res.json({ status: 'ready', timestamp: new Date().toISOString() });
    } catch (err: any) {
      res.status(503).json({
        status: 'unready',
        error: err?.message ?? String(err),
        timestamp: new Date().toISOString(),
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  });

  // Cookie parser middleware (must be before routes)
  app.use(cookieParser());

  // 1. Security headers with Helmet
  const isProduction = process.env.NODE_ENV === 'production';
  // Outbound origins the SPA legitimately talks to (XHR/fetch/EventSource/WebSocket).
  // Vite HMR needs ws:/wss: in dev only — production must not advertise it.
  const connectSrc = [
    "'self'",
    "https://api.stripe.com",
    // Mux video playback + Mux Data beacons
    "https://stream.mux.com",
    "https://*.mux.com",
    "https://*.litix.io",
    // Coach / news LLM providers (defensive — calls are proxied server-side today,
    // but keep the allowlist ready so client-side streaming wouldn't be CSP-blocked)
    "https://api.anthropic.com",
    "https://api.x.ai",
    // Google OAuth token/userinfo endpoints
    "https://accounts.google.com",
    "https://oauth2.googleapis.com",
    "https://www.googleapis.com",
  ];
  if (!isProduction) {
    connectSrc.push("ws:", "wss:");
  }
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: isProduction
          ? ["'self'", "'unsafe-inline'"]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc,
        frameSrc: [
          "'self'",
          "https://js.stripe.com",
          "https://hooks.stripe.com",
          // Mux Player renders the video element inside its own iframe
          "https://stream.mux.com",
        ],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "blob:", "https://stream.mux.com", "https://*.mux.com"],
        workerSrc: ["'self'", "blob:"],
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
      if (req.url.includes('/assets/') || req.url.includes('/favicon.ico')) return true;
      // Wave G (Fase 3 load test): bypass quando LOADTEST_BYPASS_RATELIMIT=true.
      // NUNCA setado em prod — so pra rodar scripts/load/run-loadtest.mjs sem
      // bater no teto de 1000 req/15min de um unico IP.
      if (process.env.LOADTEST_BYPASS_RATELIMIT === 'true') return true;
      return false;
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
  registerAdminSelectorCalibrationRoutes(app);
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
  // Sprint VR-1: /api/variance is canonical; /api/primedope is backward-compat alias.
  app.use("/api/primedope", primedopeRouter);
  app.use("/api/variance", primedopeRouter);
  app.use("/api/variance", varianceRouter);
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

  // Sprint Estudos-Habito-1: study sessions v2 + auto-suggest.
  // Note: aliases /api/users/me/home-layout-settings foram removidos — use
  // canonical /api/home/settings (registrado acima).
  registerStudySessionsRoutes(app);
  registerFocusStatsAutoSuggestRoutes(app);

  // Sprint Estudos-Coach-Biblio-2 — RF-2/3/4 endpoints.
  registerBibliotecaRecommendationsRoutes(app);
  registerStudyWeeklyPlanRoutes(app);
  registerCoachSessionInsightsRoutes(app);

  // Sprint Spot-Anki-Reentry-3 — RF-1/2/4: insight extension + spot/reentry routes.
  registerStarredHandsExtendedRoutes(app);
  registerSpotReentryRoutes(app);
  registerReentryRoutes(app);

  // Sprint Mini Player 2 (ADR-190/191).
  registerSpotifyAudioRoutes(app);
  registerUserActivityRoutes(app);
  // Sprint Mini Player 3 (ADR-193) — MP3.1 R1 fix CRITICAL-3.
  registerAudioQueueRoutes(app);
  // Sprint MP-VALIDATION RF-03.
  registerAdminAudioMetricsRoutes(app);

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
