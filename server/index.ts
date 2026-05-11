import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startSupremaAutoSync } from "./supremaAutoSync";
import { startLibraryCleanup } from "./libraryCleanup";
import { startCoachCrons } from "./coach/cronRunner";
import { cleanupExpiredRefreshTokens } from "./refreshTokenStore";

const app = express();
// Trust the first proxy hop (Coolify / Cloudflare / nginx in front). Without this,
// req.ip resolves to the proxy's address — collapsing every client into one rate-limit
// bucket — and X-Forwarded-* headers are ignored. Single hop only (no chained proxies).
app.set('trust proxy', 1);
// Stripe webhook needs raw body for signature verification — must be BEFORE express.json()
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
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

  // Serve both the API and the client on a single port.
  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
    startSupremaAutoSync();
    startLibraryCleanup();
    startCoachCrons();
    // ADR-143: prune refresh-token rows that have been expired for >30d.
    const refreshTokenCleanup = () => {
      cleanupExpiredRefreshTokens().catch((err) =>
        console.error("auth.refresh_token.cleanup_failed", { err: err?.message ?? String(err) }));
    };
    refreshTokenCleanup();
    setInterval(refreshTokenCleanup, 6 * 60 * 60 * 1000).unref?.();
  });
})();
