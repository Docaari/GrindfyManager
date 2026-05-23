// =============================================================================
// CoachLegacyRedirect — Sprint MP-VALIDATION / RF-04 (ADR-148 + ADR-207)
//
// Redirect logico `/coach*` -> `/coach-ai*` preservando subpath + query + hash.
// Emite `coach.legacy_redirect.fired` 1x/session (sessionStorage dedupe).
// Console.warn em PROD (deprecation 90d ~ 2026-08-22).
// =============================================================================

import { useEffect } from "react";
import { Redirect } from "wouter";
import { emitCoachEvent } from "@/lib/activity-telemetry";

const SESSION_FIRED_KEY = "coach.legacy_redirect.fired";

function readPathSearchHash(): { pathname: string; search: string; hash: string } {
  if (typeof window === "undefined") return { pathname: "/coach", search: "", hash: "" };
  return {
    pathname: window.location.pathname ?? "/coach",
    search: window.location.search ?? "",
    hash: window.location.hash ?? "",
  };
}

function buildTarget(pathname: string, search: string, hash: string): string {
  // Substitui apenas o prefixo `/coach` (sem casar `/coach-ai*`).
  let next = pathname;
  if (next === "/coach" || next.startsWith("/coach/")) {
    next = "/coach-ai" + next.slice("/coach".length);
  } else if (!next.startsWith("/coach-ai")) {
    // Fallback defensivo: rota sem padrao esperado vira `/coach-ai` cru.
    next = "/coach-ai";
  }
  return `${next}${search}${hash}`;
}

export function CoachLegacyRedirect(): JSX.Element | null {
  const { pathname, search, hash } = readPathSearchHash();
  const target = buildTarget(pathname, search, hash);

  // Telemetria + warn — uma vez por sessao via sessionStorage.
  useEffect(() => {
    try {
      let alreadyFired = false;
      try {
        alreadyFired = sessionStorage.getItem(SESSION_FIRED_KEY) === "true";
      } catch {
        // ignore
      }
      if (!alreadyFired) {
        try {
          sessionStorage.setItem(SESSION_FIRED_KEY, "true");
        } catch {
          // ignore
        }
        try {
          void emitCoachEvent("coach.legacy_redirect.fired", {
            from_path: pathname,
            to_path: target,
            referrer:
              typeof document !== "undefined" ? document.referrer || null : null,
          });
        } catch {
          // never throw
        }
        try {
          if (
            typeof process !== "undefined" &&
            process.env?.NODE_ENV === "production"
          ) {
            // eslint-disable-next-line no-console
            console.warn(
              "[DEPRECATED] /coach foi consolidado em /coach-ai. Atualize bookmarks. Rota legacy sera removida em ~2026-08-22.",
            );
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // never throw
    }
  }, [pathname, target]);

  return <Redirect to={target} />;
}

export default CoachLegacyRedirect;
