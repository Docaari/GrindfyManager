/**
 * Sprint Studies-Reform — RF-06: hook helper para invalidar caches relacionados
 * a atividade de estudos (themes, recommendations, streak, spots).
 *
 * Usado por ThemeDetail / SpotReview / SnapshotCreate etc para forcar refresh
 * apos uma acao do usuario.
 */

import { useQueryClient } from '@tanstack/react-query';

export function useStudyActivityInvalidation() {
  const qc = useQueryClient();

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['/api/study-themes'] });
    qc.invalidateQueries({ queryKey: ['/api/starred-hands'] });
    qc.invalidateQueries({ queryKey: ['study', 'recommendations'] });
    qc.invalidateQueries({ queryKey: ['/api/study/streak'] });
    qc.invalidateQueries({ queryKey: ['/api/dashboard/insights/week'] });
  }

  function invalidateRecommendations() {
    qc.invalidateQueries({ queryKey: ['study', 'recommendations'] });
  }

  function invalidateThemes() {
    qc.invalidateQueries({ queryKey: ['/api/study-themes'] });
  }

  return {
    invalidateAll,
    invalidateRecommendations,
    invalidateThemes,
  };
}

export default useStudyActivityInvalidation;
