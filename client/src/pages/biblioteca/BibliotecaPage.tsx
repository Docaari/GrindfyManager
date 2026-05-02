// =============================================================================
// BibliotecaPage - Sprint Biblioteca-1 / RF-07 + UX Round Implementer.
//
// Pagina raiz `/biblioteca`. Hero + grid de cursos via CourseCard.
//
// UX Round Implementer:
//   F5  - empty state rico (gradient + categorias + "avise-me")
//   F11 - banner alpha sticky com link "Pedir liberacao"
//   F13 - grid 5 colunas no xl viewport
// =============================================================================

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { CourseCard } from "@/components/biblioteca/CourseCard";
import { LIBRARY_CATEGORIES } from "@shared/library-categories";

interface CourseListItem {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  lessonCount: number;
  hasAnyAccess: boolean;
  accessibleLessonsCount?: number;
  totalDurationMinutes?: number;
  primaryCategory?: string | null;
}

const ALPHA_BANNER_KEY = "library:alpha:dismissed";
const NOTIFY_KEY = "library:notify:requested";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(ALPHA_BANNER_KEY) === "true";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(ALPHA_BANNER_KEY, "true");
  } catch {
    // ignore
  }
}

function readNotifyRequested(): boolean {
  try {
    return localStorage.getItem(NOTIFY_KEY) === "true";
  } catch {
    return false;
  }
}

function writeNotifyRequested(): void {
  try {
    localStorage.setItem(NOTIFY_KEY, "true");
  } catch {
    // ignore
  }
}

export function BibliotecaPage() {
  // Hooks first (lesson #1).
  const { data, isLoading } = useQuery<CourseListItem[]>({
    queryKey: ["library-courses"],
    queryFn: async () => {
      return await apiRequest("GET", "/api/library/courses");
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const [bannerDismissed, setBannerDismissed] = useState<boolean>(readDismissed);
  const [notifyRequested, setNotifyRequested] = useState<boolean>(
    readNotifyRequested,
  );

  function handleDismissBanner() {
    writeDismissed();
    setBannerDismissed(true);
  }

  function handleNotifyClick() {
    writeNotifyRequested();
    setNotifyRequested(true);
    // Fire-and-forget: register intent. Endpoint may not exist yet; ignore
    // failure - localStorage flag preserves the user's intent.
    apiRequest(
      "POST",
      "/api/library/events",
      {
        lessonId: "library_notify",
        eventType: "view",
        metadata: { intent: "notify_when_published" },
      },
      { silentMode: true },
    ).catch(() => {});
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* F11: alpha banner */}
      {!bannerDismissed && (
        <div
          data-testid="library-alpha-banner"
          className="mb-4 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3"
        >
          <p className="text-sm text-amber-200">
            Estamos em alpha. Acesso liberado manualmente.{" "}
            <a
              href="mailto:suporte@grindfy.com?subject=Liberar%20acesso%20Biblioteca"
              data-testid="library-alpha-banner-cta"
              className="underline hover:text-amber-100 font-medium"
            >
              Pedir liberacao
            </a>
          </p>
          <button
            type="button"
            onClick={handleDismissBanner}
            data-testid="library-alpha-banner-dismiss"
            aria-label="Fechar aviso"
            className="text-amber-300 hover:text-amber-100"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <header className="mb-6">
        <h1
          data-testid="library-page-title"
          className="text-3xl font-bold text-white"
        >
          Biblioteca Grindfy
        </h1>
        <p className="text-gray-400 mt-1">
          Cursos para evoluir cada area do seu jogo
        </p>
      </header>

      {/* F-A1.3: skeleton grid while courses load (6 placeholders). */}
      {isLoading && (
        <div
          data-testid="library-courses-skeleton"
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              data-testid="library-course-card-skeleton"
              className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden"
            >
              <div className="aspect-video w-full bg-gray-800 animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 rounded bg-gray-800 animate-pulse" />
                <div className="h-3 w-full rounded bg-gray-800/70 animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-gray-800/70 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && (!data || data.length === 0) && (
        <div
          data-testid="library-empty-state"
          className="text-center py-16 space-y-6"
        >
          <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500/30 to-green-700/20 border border-green-500/40 flex items-center justify-center">
            <GraduationCap size={36} className="text-green-300" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-white">Em breve</h2>
            <p className="text-gray-400 max-w-md mx-auto">
              Em breve: cursos sobre Mentalidade, ICM, Postflop e mais.
            </p>
          </div>
          <div
            data-testid="library-empty-state-categories"
            className="flex flex-wrap items-center justify-center gap-2 max-w-2xl mx-auto"
          >
            {LIBRARY_CATEGORIES.map((cat) => (
              <span
                key={cat.id}
                className="px-3 py-1 rounded-full text-xs font-medium border"
                style={{
                  color: cat.color,
                  borderColor: `${cat.color}55`,
                  backgroundColor: `${cat.color}10`,
                }}
              >
                {cat.label}
              </span>
            ))}
          </div>
          <div>
            <button
              type="button"
              onClick={handleNotifyClick}
              data-testid="library-empty-state-notify"
              disabled={notifyRequested}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                notifyRequested
                  ? "bg-gray-700 text-gray-300 cursor-default"
                  : "bg-green-600 text-white hover:bg-green-500"
              }`}
            >
              {notifyRequested
                ? "Te avisamos quando lancar"
                : "Avise-me quando lancar"}
            </button>
          </div>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Estamos em alpha - alpha testers recebem cursos liberados manualmente.
            Use o suporte para pedir liberacao.
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <div
          data-testid="library-courses-grid"
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
        >
          {data.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}

export default BibliotecaPage;
