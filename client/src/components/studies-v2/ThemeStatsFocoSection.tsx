/**
 * Sprint stats-themes-linking-1 — re-export shim.
 *
 * Componente real vive em `@/components/study-themes/ThemeStatsFocoSection`.
 * Este shim mantem compat com testes que tentam importar do path alternativo.
 * Lesson #28 aplicada: re-export quando teste mock-a path X mas codigo importa Y.
 */
export {
  ThemeStatsFocoSection,
  default,
} from "@/components/study-themes/ThemeStatsFocoSection";
