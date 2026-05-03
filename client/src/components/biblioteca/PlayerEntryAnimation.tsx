// =============================================================================
// PlayerEntryAnimation - Sprint Bloco-A-Polish / RF-05 + D11
//
// Wrapper de fade-in para a entrada do player (LessonViewer) apos cross-fade
// do hero. Mantem consistencia visual quando navegamos via /play.
//
// Animation:
//   - Fade-in 500ms (delay 200ms para esperar paint inicial)
//   - Reduced motion: instant (D11)
//   - Background bg-black para evitar flash branco entre paginas
//
// data-testid: player-entry-animation
// =============================================================================

import React, { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export interface PlayerEntryAnimationProps {
  children: ReactNode;
}

export function PlayerEntryAnimation({ children }: PlayerEntryAnimationProps) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      data-testid="player-entry-animation"
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : { duration: 0.5, delay: 0.2, ease: "easeOut" }
      }
      className="bg-black min-h-screen"
    >
      {children}
    </motion.div>
  );
}

export default PlayerEntryAnimation;
