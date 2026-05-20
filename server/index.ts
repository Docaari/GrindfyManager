import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startSupremaAutoSync, stopSupremaAutoSync } from "./supremaAutoSync";
import { startLibraryCleanup, stopLibraryCleanup } from "./libraryCleanup";
import { startCoachCrons } from "./coach/cronRunner";
import { cleanupExpiredRefreshTokens } from "./refreshTokenStore";
import { pool } from "./db";
import cron from "node-cron";

const app = express();
// Trust the first proxy hop (Coolify / Cloudflare / nginx in front). Without this,
// req.ip resolves to the proxy's address — collapsing every client into one rate-limit
// bucket — and X-Forwarded-* headers are ignored. Single hop only (no chained proxies).
app.set('trust proxy', 1);
// Stripe webhook needs raw body for signature verification — must be BEFORE express.json()
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
// Wave C (Fase 3 perf): gzip compression. /api/home/overview + /api/dashboard/*
// retornam JSON 20-80KB; gzip reduz ~60-70%. Apos express.raw (Stripe webhook
// nao deve ser comprimido — assinatura quebraria) e antes de express.json.
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Auth endpoints return JWTs (access + refresh) in the response body. Capturing them
// into the request logger risks leaking long-lived tokens into log aggregators.
const SENSITIVE_BODY_LOG_PREFIXES = ['/api/auth/'];

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const skipBodyLog = SENSITIVE_BODY_LOG_PREFIXES.some((p) => path.startsWith(p));
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  if (!skipBodyLog) {
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  const isProd = process.env.NODE_ENV === 'production';
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const rawMessage = err.message || "Internal Server Error";
    // In production, only echo intentional client-facing errors (4xx). 5xx errors
    // may carry stack traces, SQL fragments, or connection strings — return a generic
    // message and keep the detail in the server log only.
    const message = isProd && status >= 500 ? "Internal Server Error" : rawMessage;

    // Log mas NAO re-throw: re-throw apos res.json crashava o processo,
    // derrubando o dev server (Vite middleware) a cada 500 — cascateava em
    // "Failed to fetch dynamically imported module" para todas paginas.
    console.error(`[express:error] ${req.method} ${req.path} ->`, err);

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Wave C (Fase 3 infra): keepAliveTimeout > proxy idle (Cloudflare ~100s)
  // evita 502 esporadico quando Node fecha socket keep-alive antes do proxy.
  // headersTimeout sempre > keepAliveTimeout (regra Node).
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  // Serve both the API and the client on a single port.
  const port = parseInt(process.env.PORT || "3000", 10);
  // HOST env permite override do bind (default 0.0.0.0 — aceita conexoes em
  // todas as interfaces). Em ambientes com proxy reverso local, setar HOST=127.0.0.1
  // restringe o bind para loopback.
  const host = process.env.HOST || "0.0.0.0";
  let refreshTokenInterval: NodeJS.Timeout | undefined;
  server.listen({
    port,
    host,
  }, () => {
    log(`serving on port ${port}`);
    startSupremaAutoSync();
    startLibraryCleanup();
    startCoachCrons();
    // ADR-143: prune refresh-token rows that have been expired for >30d.
    // Wave D (ADR-144): advisory lock cross-replica.
    const refreshTokenCleanup = async () => {
      try {
        const { withAdvisoryLock } = await import("./lib/advisoryLock");
        await withAdvisoryLock("cron:refresh-token-cleanup", cleanupExpiredRefreshTokens);
      } catch (err) {
        console.error("auth.refresh_token.cleanup_failed", {
          err: (err as any)?.message ?? String(err),
        });
      }
    };
    refreshTokenCleanup();
    refreshTokenInterval = setInterval(refreshTokenCleanup, 6 * 60 * 60 * 1000);
    refreshTokenInterval.unref?.();
  });

  // Wave C (Fase 3 infra): graceful shutdown — SIGTERM/SIGINT.
  // Coolify/k8s enviam SIGTERM em todo redeploy. Sem handler:
  //   - in-flight requests morrem mid-response (5xx em rolling deploy)
  //   - pool conns vazam (Neon pool segura ate server-side timeout)
  //   - crons mid-tick perdem state
  // Handler:
  //   1. server.close() para de aceitar new conns + drena in-flight
  //   2. clearInterval(refresh-token cleanup)
  //   3. stopSupremaAutoSync + stopLibraryCleanup (clearInterval intervals deles)
  //   4. cron.getTasks().stop() — para todos node-cron jobs (server/jobs/* +
  //      coach/cronRunner) sem precisar handle por job; getTasks() (node-cron 3.x)
  //      retorna o registry global de ScheduledTask
  //   5. pool.end() fecha conexoes pg limpo
  //   6. force-exit 10s se algo travar (timer.unref nao bloqueia exit normal)
  let shuttingDown = false;
  const shutdown = (sig: string) => {
    if (shuttingDown) return; // idempotente em re-trigger
    shuttingDown = true;
    log(`${sig} received — draining`, "shutdown");
    const force = setTimeout(() => {
      console.error("[shutdown] forced exit after 10s — server.close stuck");
      process.exit(1);
    }, 10_000);
    force.unref?.();

    server.close(async (err?: Error) => {
      if (err) console.error("[shutdown] server.close error", err);
      try {
        if (refreshTokenInterval) clearInterval(refreshTokenInterval);
        stopSupremaAutoSync();
        stopLibraryCleanup();
        // node-cron jobs (server/jobs/* + coach/cronRunner): para todos via
        // o registry global. getTasks() existe no node-cron 3.x.
        try {
          const tasks = cron.getTasks?.();
          if (tasks) for (const t of tasks.values()) (t as any)?.stop?.();
        } catch (e2) {
          console.error("[shutdown] cron.getTasks().stop error", e2);
        }
      } catch (e) {
        console.error("[shutdown] cron stop error", e);
      }
      try {
        await pool.end();
      } catch (e) {
        console.error("[shutdown] pool.end error", e);
      }
      log("clean exit", "shutdown");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})();
