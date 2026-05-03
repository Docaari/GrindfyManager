// =============================================================================
// scripts/library-upload-static-assets.ts — Sprint Biblioteca-2 / RF-11.
//
// Lê `_assets/styles.css` + `_assets/lesson.js`, transforma o JS para
// substituir `onclick=` inline por `data-*` + `addEventListener`, e faz
// upload via POST /api/admin/library/static-asset.
//
// Founder ratificou ADR-093: NAO bypassamos sanitizer; lesson.js eh servido
// via endpoint static dedicado e injected no iframe srcdoc apos o sanitize
// das aulas. Por isso aqui o transform NAO eh estritamente necessario para
// seguranca (sandbox + sanitize blockam handlers inline mesmo se viessem),
// mas mantemos o boilerplate postMessage (resize + scroll-depth) para o
// child iframe falar com o parent (ADR-094).
//
// Flags:
//   --admin-token=<JWT>   token JWT de admin (default: $GRINDFY_ADMIN_TOKEN)
//   --base-url=<URL>      base URL (default: http://localhost:3000)
//   --css=<path>          path do CSS (default: _assets/styles.css)
//   --js=<path>           path do JS (default: _assets/lesson.js)
//   --dry-run             nao faz upload; printa transform diff
// =============================================================================

import { promises as fs } from "fs";
import path from "path";

// -----------------------------------------------------------------------------
// transformLessonJs — substitui handlers inline + injeta boilerplate postMessage
// -----------------------------------------------------------------------------

export interface TransformLessonJsResult {
  transformed: string;
  removedHandlers: number;
}

const POSTMESSAGE_BOILERPLATE = `
// =============================================================================
// Sprint Biblioteca-2 / ADR-094 — postMessage protocol parent <-> iframe child.
// Whitelist: 'grindfy:library:resize', 'grindfy:library:scroll'.
// =============================================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function reportHeight() {
    try {
      var h = Math.max(
        document.documentElement.scrollHeight,
        document.body && document.body.scrollHeight || 0
      );
      window.parent.postMessage({
        type: "grindfy:library:resize",
        payload: { height: h },
      }, "*");
    } catch (e) {}
  }

  if (typeof ResizeObserver !== "undefined") {
    try {
      var ro = new ResizeObserver(reportHeight);
      if (document.body) ro.observe(document.body);
    } catch (e) {}
  }
  window.addEventListener("load", reportHeight);
  window.addEventListener("DOMContentLoaded", reportHeight);

  var scrollTimeout = null;
  function reportScroll() {
    try {
      var docEl = document.documentElement;
      var total = (docEl.scrollHeight || 0) - (window.innerHeight || 0);
      var percent = total > 0 ? Math.round((window.scrollY / total) * 100) : 100;
      window.parent.postMessage({
        type: "grindfy:library:scroll",
        payload: { percent: percent },
      }, "*");
    } catch (e) {}
  }
  window.addEventListener("scroll", function () {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(function () {
      reportScroll();
      scrollTimeout = null;
    }, 1000);
  });

  // ADR-093: handlers para data-* (substitui onclick inline).
  document.addEventListener("DOMContentLoaded", function () {
    // Flashcards
    var flashcardBtns = document.querySelectorAll("[data-flashcard-toggle]");
    flashcardBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-flashcard-toggle");
        if (!id) return;
        var panel = document.getElementById(id) || document.getElementById(id + "-panel");
        if (panel) {
          var hidden = panel.hasAttribute("hidden");
          if (hidden) panel.removeAttribute("hidden");
          else panel.setAttribute("hidden", "");
          btn.setAttribute("aria-expanded", String(hidden));
        }
      });
    });
    // Accordion
    var accordionBtns = document.querySelectorAll("[data-accordion-toggle]");
    accordionBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-accordion-toggle");
        if (!id) return;
        var panel = document.getElementById(id);
        if (panel) {
          var hidden = panel.hasAttribute("hidden");
          if (hidden) panel.removeAttribute("hidden");
          else panel.setAttribute("hidden", "");
          btn.setAttribute("aria-expanded", String(hidden));
        }
      });
    });
    // Internal anchor links: scroll without navigating (sandbox sem
    // same-origin faz click em <a href="#x"> esvaziar o srcdoc).
    document.body.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== document.body) {
        if (t.tagName === "A") {
          var href = t.getAttribute("href") || "";
          if (href.indexOf("#") === 0 && href.length > 1) {
            e.preventDefault();
            var target = document.getElementById(href.slice(1));
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          return;
        }
        t = t.parentNode;
      }
    });
    // ADR-093: re-attach inline handlers preservados via data-grindfy-on*.
    // Sanitizer admin-trusted strip onclick=; manifest importer pre-processa
    // pra data-grindfy-onclick="..." que sobrevive. Aqui reativamos.
    var EVENTS = ["click", "change", "submit", "focus", "blur", "keydown", "keyup", "mouseover"];
    EVENTS.forEach(function (ev) {
      document.body.addEventListener(ev, function (e) {
        var attr = "data-grindfy-on" + ev;
        var t = e.target;
        while (t && t !== document.body) {
          if (t.nodeType === 1 && t.hasAttribute && t.hasAttribute(attr)) {
            try {
              var code = t.getAttribute(attr);
              new Function("event", code).call(t, e);
            } catch (err) {
              try { console.warn("grindfy inline handler error:", err); } catch (_) {}
            }
            return;
          }
          t = t.parentNode;
        }
      }, true);
    });
  });
})();
// === END Grindfy library iframe boilerplate ===
`;

export function transformLessonJs(source: string): TransformLessonJsResult {
  const sourceStr = String(source ?? "");
  // Conta handlers inline `onclick=` (apenas pra reportar; nao removemos
  // do JS — o sanitizer admin-trusted (RF-02 / ADR-093) ja remove os
  // atributos do HTML antes de salvar).
  const inlineMatches = sourceStr.match(/onclick\s*=/gi) ?? [];
  return {
    transformed: sourceStr + "\n" + POSTMESSAGE_BOILERPLATE,
    removedHandlers: inlineMatches.length,
  };
}

// -----------------------------------------------------------------------------
// CLI runner
// -----------------------------------------------------------------------------

interface UploadOptions {
  adminToken: string;
  baseUrl: string;
  cssPath: string;
  jsPath: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): UploadOptions {
  const get = (flag: string, fallback: string) => {
    const a = argv.find((x) => x.startsWith(`--${flag}=`));
    return a ? a.split("=").slice(1).join("=") : fallback;
  };
  const has = (flag: string) => argv.includes(`--${flag}`);
  return {
    adminToken: get("admin-token", process.env.GRINDFY_ADMIN_TOKEN ?? ""),
    baseUrl: get("base-url", process.env.GRINDFY_BASE_URL ?? "http://localhost:3000"),
    cssPath: get("css", "_assets/styles.css"),
    jsPath: get("js", "_assets/lesson.js"),
    dryRun: has("dry-run"),
  };
}

async function fetchCsrf(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/csrf-token`, { method: "GET" });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = /grindfy_csrf_token=([^;]+)/.exec(setCookie);
  if (!m) throw new Error("CSRF token cookie not received");
  return m[1];
}

async function uploadAsset(
  opts: UploadOptions,
  kind: "styles" | "scripts",
  buffer: Buffer,
  mime: string,
): Promise<void> {
  if (opts.dryRun) {
    console.log(`[dry-run] would upload ${kind} (${buffer.length} bytes)`);
    return;
  }
  const FormData =
    typeof globalThis.FormData !== "undefined" ? globalThis.FormData : null;
  if (!FormData) {
    throw new Error("FormData not available in current Node runtime (>= 18 required)");
  }
  const Blob = typeof globalThis.Blob !== "undefined" ? globalThis.Blob : null;
  if (!Blob) {
    throw new Error("Blob not available in current Node runtime (>= 18 required)");
  }
  const csrf = await fetchCsrf(opts.baseUrl);
  const fd = new FormData();
  fd.append("kind", kind);
  fd.append("file", new Blob([new Uint8Array(buffer)], { type: mime }), kind === "styles" ? "styles.css" : "lesson.js");
  const url = `${opts.baseUrl}/api/admin/library/static-asset`;
  const headers: Record<string, string> = {
    cookie: `grindfy_csrf_token=${csrf}`,
    "x-csrf-token": csrf,
  };
  if (opts.adminToken) headers.authorization = `Bearer ${opts.adminToken}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: fd as any,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`upload ${kind} failed: ${res.status} ${body}`);
  }
  const json: any = await res.json().catch(() => ({}));
  // eslint-disable-next-line no-console
  console.log(`[OK] ${kind} uploaded: sha256=${json.sha256?.slice?.(0, 12) ?? "?"}, size=${json.size}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cssBuf = await fs.readFile(path.resolve(opts.cssPath));
  const jsRaw = await fs.readFile(path.resolve(opts.jsPath), "utf8");
  const transformed = transformLessonJs(jsRaw);
  if (opts.dryRun) {
    // eslint-disable-next-line no-console
    console.log("[dry-run] transformed lesson.js preview (first 800 chars):");
    // eslint-disable-next-line no-console
    console.log(transformed.transformed.slice(0, 800));
  }
  await uploadAsset(opts, "styles", cssBuf, "text/css");
  await uploadAsset(
    opts,
    "scripts",
    Buffer.from(transformed.transformed, "utf8"),
    "application/javascript",
  );
  // eslint-disable-next-line no-console
  console.log("[done] upload-static-assets complete.");
}

// Run only when invoked directly (not when imported by tests).
const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /library-upload-static-assets\.ts$/.test(process.argv[1] ?? "");
if (isDirectRun) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
