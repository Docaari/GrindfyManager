/**
 * StudyQuickLogFab — Sprint Estudos-Habito-1 (RF-1.6).
 *
 * FAB sticky bottom-right em /estudos/* que abre StudyLogDialog com pre-fill.
 *
 * data-testid: study-quick-log-fab
 */

import * as React from "react";
import { StudyLogDialog } from "./StudyLogDialog";

export function StudyQuickLogFab() {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        data-testid="study-quick-log-fab"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 px-5 py-3 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-shadow"
        style={{ position: "fixed" }}
        aria-label="Acabei de estudar"
      >
        + Acabei!
      </button>
      {open && (
        <StudyLogDialog open={open} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export default StudyQuickLogFab;
