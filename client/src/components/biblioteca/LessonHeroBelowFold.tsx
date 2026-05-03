// =============================================================================
// LessonHeroBelowFold - Sprint Bloco-A-Polish / RF-11 + D8
//
// Conteudo abaixo do hero (scroll). Lazy-render via IntersectionObserver:
// nao monta sections ate o usuario scrollar para perto. Reduz cost inicial
// + alinha com pattern Netflix/Disney+.
//
// Sections (todas opcionais — se array vazio, secao omitida):
//   - "O que voce vai aprender": <li> por learningObjective
//   - "Conceitos-chave": chips por keyConcept
//   - "Base cientifica": paragrafo de referencias (MVP geralmente vazio)
//
// Quando todos arrays vazios, retorna null (sem ruido visual).
//
// Lessons aplicadas:
//   #1  hooks-first
//   #2  data-testid estaveis (lesson-hero-below-fold, below-fold-objectives,
//       below-fold-concepts, below-fold-references)
//   #11 default minimo (sem secao "decorativa" sem dado real)
// =============================================================================

import React, { useEffect, useRef, useState } from "react";

export interface LessonHeroBelowFoldProps {
  learningObjectives: string[];
  keyConcepts: string[];
  scientificBasis: string[];
}

export function LessonHeroBelowFold({
  learningObjectives,
  keyConcepts,
  scientificBasis,
}: LessonHeroBelowFoldProps) {
  // ---- HOOKS FIRST (lesson #1) -------------------------------------------
  const [isVisible, setIsVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      // Fallback (raro): sem observer, mostra direto.
      setIsVisible(true);
      return;
    }
    const node = sentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "100px" },
    );
    if (node) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // ---- Computed ----------------------------------------------------------
  const hasObjectives = learningObjectives.length > 0;
  const hasConcepts = keyConcepts.length > 0;
  const hasReferences = scientificBasis.length > 0;
  const hasAnyContent = hasObjectives || hasConcepts || hasReferences;

  // Sentinel placeholder — sempre renderizado pra ativar IntersectionObserver.
  // Quando isVisible=false ou sem conteudo, so o sentinel/placeholder aparece.
  if (!isVisible) {
    return (
      <div
        ref={sentinelRef}
        data-testid="lesson-hero-below-fold-sentinel"
        className="h-screen w-full"
        aria-hidden
      />
    );
  }

  // Visivel mas sem conteudo — nada a mostrar (D11 default minimo).
  if (!hasAnyContent) {
    return null;
  }

  return (
    <section
      data-testid="lesson-hero-below-fold"
      className="px-6 sm:px-8 py-12 max-w-3xl mx-auto space-y-10 text-white"
    >
      {hasObjectives && (
        <div data-testid="below-fold-objectives" className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            O que voce vai aprender
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-300">
            {learningObjectives.map((obj, idx) => (
              <li key={`obj-${idx}`}>{obj}</li>
            ))}
          </ul>
        </div>
      )}

      {hasConcepts && (
        <div data-testid="below-fold-concepts" className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Conceitos-chave</h2>
          <div className="flex flex-wrap gap-2">
            {keyConcepts.map((concept, idx) => (
              <span
                key={`concept-${idx}`}
                className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm text-gray-200"
              >
                {concept}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasReferences && (
        <div data-testid="below-fold-references" className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Base cientifica</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-300 text-sm">
            {scientificBasis.map((ref, idx) => (
              <li key={`ref-${idx}`}>{ref}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default LessonHeroBelowFold;
