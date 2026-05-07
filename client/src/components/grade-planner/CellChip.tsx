/**
 * CellChip — re-export from WeekGrid.tsx.
 *
 * Sprint coach-page-reform-1 RF-06: extracao de CellChip como named export
 * para teste isolado (tests/components/grade-planner/CellChipXDelete.test.tsx).
 *
 * Implementacao real fica em WeekGrid.tsx (preserva contexto do grid).
 */

export { CellChip } from './WeekGrid';
export { CellChip as default } from './WeekGrid';
