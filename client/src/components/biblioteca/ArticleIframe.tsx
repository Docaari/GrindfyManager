// =============================================================================
// ArticleIframe — Sprint Biblioteca-2 / RF-06 + ADR-092 + ADR-094.
//
// Renderiza o HTML rico do artigo da aula em <iframe sandbox="allow-scripts">
// SEM allow-same-origin. Conteudo via srcdoc. Comunicacao com parent via
// postMessage whitelist (resize + scroll-depth).
//
// data-testid: library-article-iframe (estavel — Lesson #2).
//
// Lessons:
//   #1 hooks-first cleanup (removeEventListener em unmount).
//   #2 data-testid estavel.
//   #13 apiRequest retorna JSON parseado direto.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  parseLibraryMessage,
  clampHeight,
  clampPercent,
} from "@/lib/library/iframePostMessage";

export interface ArticleBundle {
  html: string;
  stylesUrl: string;
  scriptsUrl: string;
  version: string;
  meta: {
    title: string;
    learningObjectives: string[];
  };
}

export interface ArticleIframeProps {
  lessonId: string;
  userPlatformId?: string;
  /** Disparado quando child reporta scroll-depth via postMessage (0-100). */
  onScrollDepth?: (percent: number) => void;
  /** Altura inicial em px (default 800). */
  initialHeight?: number;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJsonForScript(v: unknown): string {
  return JSON.stringify(v ?? "")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function buildSrcdoc(bundle: ArticleBundle, userPlatformId?: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(bundle.meta.title)}</title>
  <link rel="stylesheet" href="${escapeHtml(bundle.stylesUrl)}">
  <script>
    window.__GRINDFY_LIBRARY = {
      userPlatformId: ${safeJsonForScript(userPlatformId)},
      lessonTitle: ${safeJsonForScript(bundle.meta.title)}
    };
  </script>
</head>
<body>
${bundle.html}
<script src="${escapeHtml(bundle.scriptsUrl)}" defer></script>
</body>
</html>`;
}

export function ArticleIframe({
  lessonId,
  userPlatformId,
  onScrollDepth,
  initialHeight = 800,
}: ArticleIframeProps) {
  // ---- HOOKS FIRST (lesson #1) ---------------------------------------------
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeHeight, setIframeHeight] = useState<number>(initialHeight);
  const onScrollDepthRef = useRef(onScrollDepth);
  onScrollDepthRef.current = onScrollDepth;

  const bundleQuery = useQuery<ArticleBundle>({
    queryKey: ["library-article-bundle", lessonId],
    queryFn: () =>
      apiRequest("GET", `/api/library/lessons/${lessonId}/article-bundle`),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // ADR-094: postMessage listener. event.source validation eh CRITICA.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Source validation (ADR-094) — iframe sem allow-same-origin nao
      // consegue forjar source.
      if (
        !iframeRef.current ||
        event.source !== iframeRef.current.contentWindow
      ) {
        return;
      }
      const msg = parseLibraryMessage(event.data);
      if (!msg) return;
      if (msg.type === "grindfy:library:resize") {
        setIframeHeight(clampHeight(msg.payload.height));
      } else if (msg.type === "grindfy:library:scroll") {
        const cb = onScrollDepthRef.current;
        if (cb) cb(clampPercent(msg.payload.percent));
      }
    }
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const srcdoc = useMemo(() => {
    if (!bundleQuery.data) return null;
    return buildSrcdoc(bundleQuery.data, userPlatformId);
  }, [bundleQuery.data, userPlatformId]);

  // ---- Early returns AFTER hooks (lesson #1) -------------------------------
  if (bundleQuery.isLoading || !srcdoc) {
    if (bundleQuery.isError) {
      return (
        <div
          data-testid="library-article-iframe-error"
          className="p-4 text-center text-sm text-red-400"
        >
          Erro ao carregar artigo. Tente novamente.
        </div>
      );
    }
    return (
      <div
        data-testid="library-article-iframe-loading"
        className="w-full h-96 bg-gray-800 rounded-lg animate-pulse"
        aria-label="Carregando artigo"
      />
    );
  }

  return (
    <iframe
      ref={iframeRef}
      data-testid="library-article-iframe"
      // ADR-092: SOMENTE allow-scripts. NUNCA allow-same-origin/popups/forms.
      sandbox="allow-scripts"
      srcDoc={srcdoc}
      title={`Aula: ${bundleQuery.data?.meta.title ?? ""}`}
      aria-label={bundleQuery.data?.meta.title ?? "Artigo da aula"}
      className="w-full border-0 bg-white rounded-lg"
      style={{ height: `${iframeHeight}px` }}
    />
  );
}

export default ArticleIframe;
