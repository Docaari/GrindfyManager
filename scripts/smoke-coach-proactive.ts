// =============================================================================
// Sprint MP-VALIDATION / RF-02 — Smoke CLI Coach proativo end-to-end.
//
// Roda local OU CI. Cria user fake `USER-SMOKE-${ts}`, popula sessions, force
// enqueue Weekly/Daily/Monthly reports, dispara nudges B-DOWNSWING/VOLUME/
// GRADE/GAPCHECK/IMPORT, exercita 3 write tools (bulk_propose_grade,
// schedule_study_block, mark_off_day), valida email pipeline opcional.
//
// CLI flags:
//   --dry-run     mocka LLM calls + skipa email send (default real-mode)
//   --keep-user   skipa cleanup (debug manual)
//   --allow-prod  permite rodar em prod (default bloqueia)
//
// Exit codes:
//   0 OK
//   1 falha qualquer step
//   2 timeout cap 5min
//   3 cleanup fail
//
// Modulo expoe `runSmokeCoachProactive`, `forceNudgesForUser`,
// `exerciseWriteToolsForUser` para testes integration.
// =============================================================================

const CATEGORY_HANDLERS = new Set([
  "B-DOWNSWING",
  "B-VOLUME",
  "B-GRADE",
  "B-GAPCHECK",
  "B-IMPORT",
]);

const WRITE_TOOLS = [
  "bulk_propose_grade",
  "schedule_study_block",
  "mark_off_day",
] as const;

export type SmokeStepName =
  | "createFakeUser"
  | "seedHistory"
  | "enqueueReports"
  | "processReports"
  | "assertReports"
  | "forceNudges"
  | "exerciseTools"
  | "validateEmail"
  | "cleanup";

export interface SmokeStepRecord {
  name: SmokeStepName;
  status: "ok" | "fail" | "skipped";
  durationMs: number;
  error?: string;
  data?: any;
}

export interface SmokeOptions {
  dryRun?: boolean;
  keepUser?: boolean;
  allowProd?: boolean;
  timeoutMs?: number;
}

export interface SmokeResult {
  ok: boolean;
  exitCode: 0 | 1 | 2 | 3;
  steps: SmokeStepRecord[];
  totalMs: number;
  userPlatformId?: string;
}

export interface SmokeDeps {
  createFakeUser?: () => Promise<{ userPlatformId: string }>;
  seedHistory?: (userId: string) => Promise<any>;
  enqueueReports?: (userId: string) => Promise<any>;
  processReports?: (userId: string) => Promise<any>;
  assertReports?: (userId: string) => Promise<any>;
  forceNudges?: (userId: string) => Promise<any>;
  exerciseTools?: (userId: string) => Promise<any>;
  validateEmail?: (userId: string) => Promise<any>;
  cleanup?: (userId: string) => Promise<any>;
}

export interface ForceNudgesArgs {
  userId: string;
  categories: string[];
}

export interface ExerciseToolsArgs {
  userId: string;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "__timeout__"> {
  return new Promise<T | "__timeout__">((resolve) => {
    const t = setTimeout(() => resolve("__timeout__"), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve("__timeout__");
      },
    );
  });
}

async function runStep<T>(
  steps: SmokeStepRecord[],
  name: SmokeStepName,
  fn: (() => Promise<T>) | undefined,
  fallback: T,
): Promise<T> {
  const start = Date.now();
  if (!fn) {
    steps.push({ name, status: "skipped", durationMs: 0 });
    return fallback;
  }
  try {
    const data = await fn();
    steps.push({ name, status: "ok", durationMs: Date.now() - start, data });
    return data;
  } catch (err: any) {
    steps.push({
      name,
      status: "fail",
      durationMs: Date.now() - start,
      error: err?.message ?? String(err),
    });
    throw err;
  }
}

/**
 * Roda o smoke script Coach proativo end-to-end.
 * Pode receber deps mockadas (segundo arg) para testes integration.
 */
export async function runSmokeCoachProactive(
  options: SmokeOptions = {},
  deps: SmokeDeps = {},
): Promise<SmokeResult> {
  const cap = options.timeoutMs ?? 5 * 60 * 1000;
  const start = Date.now();
  const steps: SmokeStepRecord[] = [];

  // Bloqueia prod a menos que `--allow-prod`.
  try {
    if (
      typeof process !== "undefined" &&
      process.env?.NODE_ENV === "production" &&
      !options.allowProd
    ) {
      return {
        ok: false,
        exitCode: 1,
        steps,
        totalMs: Date.now() - start,
      };
    }
  } catch {
    // ignore
  }

  const job = (async (): Promise<SmokeResult> => {
    let userPlatformId = "";
    try {
      const user = await runStep(steps, "createFakeUser", deps.createFakeUser, {
        userPlatformId: `USER-SMOKE-${Date.now()}`,
      });
      userPlatformId = user.userPlatformId;

      await runStep(steps, "seedHistory", deps.seedHistory ? () => deps.seedHistory!(userPlatformId) : undefined, {});
      await runStep(steps, "enqueueReports", deps.enqueueReports ? () => deps.enqueueReports!(userPlatformId) : undefined, {});
      await runStep(steps, "processReports", deps.processReports ? () => deps.processReports!(userPlatformId) : undefined, {});
      await runStep(steps, "assertReports", deps.assertReports ? () => deps.assertReports!(userPlatformId) : undefined, {});
      await runStep(steps, "forceNudges", deps.forceNudges ? () => deps.forceNudges!(userPlatformId) : undefined, {});
      await runStep(steps, "exerciseTools", deps.exerciseTools ? () => deps.exerciseTools!(userPlatformId) : undefined, {});
      await runStep(steps, "validateEmail", deps.validateEmail ? () => deps.validateEmail!(userPlatformId) : undefined, {});
    } catch {
      // ja foi registrado em steps
    } finally {
      if (!options.keepUser && userPlatformId) {
        try {
          await runStep(
            steps,
            "cleanup",
            deps.cleanup ? () => deps.cleanup!(userPlatformId) : undefined,
            {},
          );
        } catch {
          // cleanup falhou — exit code 3 marcado abaixo
        }
      }
    }

    const failed = steps.some((s) => s.status === "fail" && s.name !== "cleanup");
    const cleanupFailed = steps.some((s) => s.status === "fail" && s.name === "cleanup");
    return {
      ok: !failed && !cleanupFailed,
      exitCode: cleanupFailed ? 3 : failed ? 1 : 0,
      steps,
      totalMs: Date.now() - start,
      userPlatformId,
    };
  })();

  const result = await withTimeout(job, cap);
  if (result === "__timeout__") {
    return {
      ok: false,
      exitCode: 2,
      steps,
      totalMs: Date.now() - start,
    };
  }
  return result;
}

/**
 * Dispatch helper: dispara 1 nudge por categoria conhecida.
 */
export async function forceNudgesForUser(
  args: ForceNudgesArgs,
  helpers: { dispatch: (userId: string, category: string) => Promise<any> },
): Promise<{ fired: number; details: Array<{ category: string; status: string }> }> {
  const details: Array<{ category: string; status: string }> = [];
  let fired = 0;
  for (const cat of args.categories ?? []) {
    if (!CATEGORY_HANDLERS.has(cat)) {
      details.push({ category: cat, status: "unknown_category" });
      continue;
    }
    try {
      await helpers.dispatch(args.userId, cat);
      details.push({ category: cat, status: "ok" });
      fired++;
    } catch (err: any) {
      details.push({ category: cat, status: `error:${err?.message ?? "unknown"}` });
    }
  }
  return { fired, details };
}

/**
 * Exercita os 3 write tools cobertos pelo smoke (cap 20 em bulk_propose_grade).
 */
export async function exerciseWriteToolsForUser(
  args: ExerciseToolsArgs,
  helpers: { runTool: (toolName: string, payload: any) => Promise<any> },
): Promise<{ tools: number; results: Record<string, any> }> {
  const tournaments = Array.from({ length: 5 }, (_, i) => ({
    name: `Smoke MTT ${i}`,
    startTime: new Date(Date.now() + (i + 1) * 60 * 60 * 1000).toISOString(),
    buyIn: 5 + i,
    site: "PokerStars",
  }));

  const results: Record<string, any> = {};

  // bulk_propose_grade — strict cap 20.
  results.bulk_propose_grade = await helpers.runTool("bulk_propose_grade", {
    tournaments,
  });

  // schedule_study_block.
  results.schedule_study_block = await helpers.runTool(
    "schedule_study_block",
    {
      themeId: "smoke-theme",
      durationMinutes: 30,
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  );

  // mark_off_day (idempotente).
  results.mark_off_day = await helpers.runTool("mark_off_day", {
    offDate: new Date().toISOString().slice(0, 10),
  });

  return { tools: WRITE_TOOLS.length, results };
}
