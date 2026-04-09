// =============================================================================
// FP-15: Logica de persistencia do warm-up (DB vs localStorage)
// =============================================================================

interface WarmupData {
  mentalState: number;
  focusLevel: number;
  confidenceLevel: number;
  exercisesCompleted: string[];
  warmupCompleted: boolean;
  sessionGoals?: string;
  createdAt?: string; // ISO date
}

/**
 * Decide se deve usar dados do banco em vez do localStorage.
 * Retorna true se DB tem dados e e mais recente (ou local nao tem createdAt).
 */
export function shouldUseDBWarmup(dbData: WarmupData | null, localData: WarmupData | null): boolean {
  if (!dbData) return false;
  if (!localData) return true;

  // If local has no createdAt, prefer DB
  if (!localData.createdAt) return true;
  if (!dbData.createdAt) return false;

  return new Date(dbData.createdAt).getTime() >= new Date(localData.createdAt).getTime();
}

/**
 * Verifica se o warm-up esta dentro do periodo maximo (default 4 horas).
 */
export function isWarmupRecent(warmupDate: string, maxHours: number = 4): boolean {
  const warmupTime = new Date(warmupDate).getTime();
  const now = Date.now();
  const diffHours = (now - warmupTime) / (1000 * 60 * 60);
  return diffHours <= maxHours;
}

/**
 * Merge dados de warm-up do banco e localStorage, priorizando DB.
 * Campos faltando no DB sao preenchidos com dados do local.
 */
export function mergeWarmupSources(dbData: WarmupData | null, localData: WarmupData | null): WarmupData | null {
  if (!dbData && !localData) return null;
  if (!dbData) return localData;
  if (!localData) return dbData;

  // Merge: DB values take priority, fallback to local for missing fields
  return {
    mentalState: dbData.mentalState,
    focusLevel: dbData.focusLevel,
    confidenceLevel: dbData.confidenceLevel,
    exercisesCompleted: dbData.exercisesCompleted,
    warmupCompleted: dbData.warmupCompleted,
    sessionGoals: dbData.sessionGoals ?? localData.sessionGoals,
    createdAt: dbData.createdAt ?? localData.createdAt,
  };
}
