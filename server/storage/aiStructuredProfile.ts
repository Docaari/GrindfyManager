// =============================================================================
// AI Structured Profile Storage — Sprint AI-1A / RF-01 (ADR-151)
//
// users.ai_structured_profile (jsonb, nullable, migration 0065).
//
// - normalizeAiStructuredProfile(raw): pura — null/{} -> { schemaVersion: 1 };
//     clamps (metas a 3, padroes/redes a 10, strings ao max); versionamento lazy.
// - isStructuredProfileEmpty(profile): pura — true se sem nivel confirmado, sem
//     metas (nao-vazias), sem focoDoMes, sem tomPreferido, sem onboardingCompletedAt.
// - getAiStructuredProfile(userId, injectedDb?): le + normaliza; TTL cache 30s;
//     erro de DB -> log + default safe { schemaVersion: 1 } (lesson #9).
// - updateAiStructuredProfile(userId, patch, injectedDb?): merge raso (arrays
//     substituem); seta updatedAt; clampa; persiste; invalida cache.
// - _resetAiStructuredProfileCacheForTests(): limpa cache (lesson #19/#21).
//
// Nota (testes): este modulo NAO importa `@shared/schema` no topo — o schema
// importa `relations` de `drizzle-orm` e alguns testes mockam `drizzle-orm`
// apenas com { eq, and, sql }. A tabela `users` eh carregada lazy com fallback
// para um placeholder (o mock do `db` ignora os args do `.from()`/`.where()`).
// =============================================================================

import { db as defaultDb } from "../db";
import { eq } from "drizzle-orm";

// AiStructuredProfile (re-declarado local para nao carregar @shared/schema no topo;
// mesma forma de shared/schema.ts).
export type AiPlayerLevel =
  | "sem_dados" | "iniciando" | "micro_ascensao" | "mid_consistente" | "high_stakes" | "recreativo_serio";
export interface AiStructuredProfileMeta {
  id: string;
  texto: string;
  prazo?: "mes" | "trimestre" | null;
  criadaEm: string;
  origem: "onboarding" | "chat" | "manual";
}
export interface AiStructuredProfileOnboardingDraft {
  step: number;
  mode: "full" | "light";
  startedAt: string;
}
export interface AiStructuredProfile {
  schemaVersion: number;
  nivel?: AiPlayerLevel | null;
  nivelConfirmado?: boolean;
  nivelEstimadoEm?: string | null;
  metas?: AiStructuredProfileMeta[];
  focoDoMes?: string | null;
  focoDoMesDefinidoEm?: string | null;
  tomPreferido?: "gentle" | "balanced" | "direct";
  padroesConhecidos?: string[];
  redesPrincipais?: string[];
  stakesTipico?: string | null;
  volumeTipicoMes?: number | null;
  tempoJogaSerioMeses?: number | null;
  perfilDeclarado?: "recreativo_serio" | "semi_pro" | "pro" | null;
  onboardingCompletedAt?: string | null;
  onboardingVersion?: number | null;
  onboardingSkippedAt?: string | null;
  onboardingDraft?: AiStructuredProfileOnboardingDraft | null;
  reOnboardingOfferedAt?: string | null;
  reOnboardingDeclinedAt?: string | null;
  updatedAt?: string;
}

const SCHEMA_VERSION = 1;

const MAX_METAS = 3;
const MAX_META_TEXTO = 200;
const MAX_FOCO = 200;
const MAX_PADROES = 10;
const MAX_PADRAO = 120;
const MAX_REDES = 10;
const MAX_REDE = 50;
const MAX_STAKES = 50;

const CACHE_TTL_MS = 30_000;
const profileCache = new Map<string, { value: AiStructuredProfile; expiresAt: number }>();

// Tabela `users` carregada lazy. Placeholder com a coluna usada — o mock do `db`
// ignora os args do builder, entao em testes isso eh suficiente.
let _usersTable: any = { userPlatformId: { name: "user_platform_id" }, aiStructuredProfile: { name: "ai_structured_profile" } };
let _usersResolved = false;
async function getUsersTable(): Promise<any> {
  if (_usersResolved) return _usersTable;
  _usersResolved = true;
  try {
    const mod: any = await import("@shared/schema");
    if (mod?.users) _usersTable = mod.users;
  } catch {
    // mantem placeholder (ambiente de teste que mocka drizzle-orm sem relations).
  }
  return _usersTable;
}

function clampString(s: any, max: number): string | undefined {
  if (typeof s !== "string") return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function clampStringArray(arr: any, maxItems: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(arr)) return undefined;
  return arr
    .filter((x) => typeof x === "string")
    .slice(0, maxItems)
    .map((x: string) => (x.length > maxLen ? x.slice(0, maxLen) : x));
}

/** Pura — back-fill schemaVersion + clamps + versionamento lazy. */
export function normalizeAiStructuredProfile(raw: any): AiStructuredProfile {
  if (raw == null || typeof raw !== "object") {
    return { schemaVersion: SCHEMA_VERSION };
  }
  const out: AiStructuredProfile = { schemaVersion: SCHEMA_VERSION };

  if (typeof raw.schemaVersion === "number" && raw.schemaVersion >= 1) {
    out.schemaVersion = raw.schemaVersion;
  }
  if (out.schemaVersion < SCHEMA_VERSION) out.schemaVersion = SCHEMA_VERSION;

  if (raw.nivel != null) out.nivel = raw.nivel;
  if (typeof raw.nivelConfirmado === "boolean") out.nivelConfirmado = raw.nivelConfirmado;
  if (raw.nivelEstimadoEm != null) out.nivelEstimadoEm = String(raw.nivelEstimadoEm);

  if (Array.isArray(raw.metas)) {
    out.metas = raw.metas
      .filter((m: any) => m && typeof m === "object")
      .slice(0, MAX_METAS)
      .map((m: any) => ({
        id: typeof m.id === "string" ? m.id : "",
        texto: clampString(m.texto, MAX_META_TEXTO) ?? "",
        prazo: m.prazo === "mes" || m.prazo === "trimestre" ? m.prazo : m.prazo == null ? m.prazo : null,
        criadaEm: typeof m.criadaEm === "string" ? m.criadaEm : new Date().toISOString(),
        origem:
          m.origem === "onboarding" || m.origem === "chat" || m.origem === "manual" ? m.origem : "manual",
      }));
  }

  const foco = clampString(raw.focoDoMes, MAX_FOCO);
  if (foco !== undefined) out.focoDoMes = foco;
  if (raw.focoDoMesDefinidoEm != null) out.focoDoMesDefinidoEm = String(raw.focoDoMesDefinidoEm);

  if (raw.tomPreferido === "gentle" || raw.tomPreferido === "balanced" || raw.tomPreferido === "direct") {
    out.tomPreferido = raw.tomPreferido;
  }

  const padroes = clampStringArray(raw.padroesConhecidos, MAX_PADROES, MAX_PADRAO);
  if (padroes !== undefined) out.padroesConhecidos = padroes;

  const redes = clampStringArray(raw.redesPrincipais, MAX_REDES, MAX_REDE);
  if (redes !== undefined) out.redesPrincipais = redes;

  const stakes = clampString(raw.stakesTipico, MAX_STAKES);
  if (stakes !== undefined) out.stakesTipico = stakes;

  if (typeof raw.volumeTipicoMes === "number") out.volumeTipicoMes = raw.volumeTipicoMes;
  if (typeof raw.tempoJogaSerioMeses === "number") out.tempoJogaSerioMeses = raw.tempoJogaSerioMeses;
  if (
    raw.perfilDeclarado === "recreativo_serio" ||
    raw.perfilDeclarado === "semi_pro" ||
    raw.perfilDeclarado === "pro"
  ) {
    out.perfilDeclarado = raw.perfilDeclarado;
  }

  if (raw.onboardingCompletedAt != null) out.onboardingCompletedAt = String(raw.onboardingCompletedAt);
  if (typeof raw.onboardingVersion === "number") out.onboardingVersion = raw.onboardingVersion;
  if (raw.onboardingSkippedAt != null) out.onboardingSkippedAt = String(raw.onboardingSkippedAt);
  if (raw.onboardingDraft && typeof raw.onboardingDraft === "object") {
    const d = raw.onboardingDraft;
    out.onboardingDraft = {
      step: typeof d.step === "number" ? d.step : 1,
      mode: d.mode === "light" ? "light" : "full",
      startedAt: typeof d.startedAt === "string" ? d.startedAt : new Date().toISOString(),
    };
  } else if (raw.onboardingDraft === null) {
    out.onboardingDraft = null;
  }
  if (raw.reOnboardingOfferedAt != null) out.reOnboardingOfferedAt = String(raw.reOnboardingOfferedAt);
  if (raw.reOnboardingDeclinedAt != null) out.reOnboardingDeclinedAt = String(raw.reOnboardingDeclinedAt);
  if (raw.updatedAt != null) out.updatedAt = String(raw.updatedAt);

  return out;
}

/** Pura — perfil "vazio" para fins de gatilho de re-onboarding (RF-07.3 / RF-06). */
export function isStructuredProfileEmpty(profile: any): boolean {
  if (profile == null || typeof profile !== "object") return true;
  if (profile.nivelConfirmado === true) return false;
  if (Array.isArray(profile.metas) && profile.metas.length > 0) return false;
  if (typeof profile.focoDoMes === "string" && profile.focoDoMes.trim().length > 0) return false;
  if (
    profile.tomPreferido === "gentle" ||
    profile.tomPreferido === "balanced" ||
    profile.tomPreferido === "direct"
  ) {
    return false;
  }
  if (profile.onboardingCompletedAt != null) return false;
  return true;
}

function resolveDb(injectedDb?: any): any {
  return injectedDb ?? defaultDb;
}

export async function getAiStructuredProfile(
  userId: string,
  injectedDb?: any,
): Promise<AiStructuredProfile> {
  const cached = profileCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  try {
    const db = resolveDb(injectedDb);
    const usersTable = await getUsersTable();
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.userPlatformId, userId))
      .limit(1);
    const row = Array.isArray(rows) ? rows[0] : undefined;
    const raw = row ? (row as any).aiStructuredProfile : null;
    const value = normalizeAiStructuredProfile(raw);
    profileCache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (err) {
    console.error("coach.ai_structured_profile.read.error", { userId, err });
    return { schemaVersion: SCHEMA_VERSION };
  }
}

export async function updateAiStructuredProfile(
  userId: string,
  patch: Partial<AiStructuredProfile>,
  injectedDb?: any,
): Promise<AiStructuredProfile> {
  let current: AiStructuredProfile;
  try {
    current = await getAiStructuredProfile(userId, injectedDb);
  } catch {
    current = { schemaVersion: SCHEMA_VERSION };
  }
  // merge raso — arrays substituem por completo (nao append automatico).
  const merged: any = {
    ...current,
    ...patch,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  const normalized = normalizeAiStructuredProfile(merged);
  normalized.updatedAt = merged.updatedAt;
  if (patch.onboardingDraft === null) normalized.onboardingDraft = null;

  try {
    const db = resolveDb(injectedDb);
    const usersTable = await getUsersTable();
    await db
      .update(usersTable)
      .set({ aiStructuredProfile: normalized } as any)
      .where(eq(usersTable.userPlatformId, userId));
  } catch (err) {
    console.error("coach.ai_structured_profile.write.error", { userId, err });
  }
  profileCache.delete(userId);
  return normalized;
}

export function _resetAiStructuredProfileCacheForTests(): void {
  profileCache.clear();
}
