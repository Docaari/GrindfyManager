// =============================================================================
// Coach Access — Sprint Coach-1 / RF-04
// Matriz de tiers, gates por plano e resolucao de tier de usuario.
//
// Fontes:
//   - docs/specs/coach-sprint-1-fundacao-economica.md (RF-04)
//   - Docs/architecture/decisions/020-coach-rate-limit-rolling-24h.md
//   - Docs/architecture/decisions/021-coach-gate-by-plan.md
// =============================================================================

import { db } from './db';
import { eq, and, desc } from 'drizzle-orm';
import { userSubscriptions, subscriptionPlans } from '@shared/schema';

export type CoachTier = 'free' | 'pro' | 'premium' | 'admin';
export type CoachType = 'mental' | 'tournament' | 'technical';

// =============================================================================
// getRateLimitForPlan — retorna limite diario por tier
// =============================================================================

const RATE_LIMITS: Record<CoachTier, number> = {
  free: 10,
  pro: 50,
  premium: 200,
  admin: Infinity,
};

export function getRateLimitForPlan(plan: string): number {
  if (plan === 'admin') return Infinity;
  if (plan === 'premium') return 200;
  if (plan === 'pro') return 50;
  // free, trial, expired, desconhecido → 10 (fallback seguro)
  return 10;
}

// =============================================================================
// canAccessCoach — gate por plano
// =============================================================================

const COACH_ACCESS: Record<CoachTier, CoachType[]> = {
  free: ['mental'],
  pro: ['mental', 'tournament'],
  premium: ['mental', 'tournament', 'technical'],
  admin: ['mental', 'tournament', 'technical'],
};

export function canAccessCoach(tier: CoachTier | string, coachType: CoachType | string): boolean {
  const list = COACH_ACCESS[tier as CoachTier];
  if (!list) return false;
  return list.includes(coachType as CoachType);
}

export function getAccessibleCoaches(tier: CoachTier | string): CoachType[] {
  const list = COACH_ACCESS[tier as CoachTier];
  return list ? [...list] : ['mental'];
}

// =============================================================================
// getUpgradeTarget — sugere tier alvo para desbloquear um coach
// =============================================================================

export function getUpgradeTarget(
  currentTier: CoachTier | string,
  requestedCoach: CoachType | string,
): 'pro' | 'premium' | null {
  // Se ja pode acessar, nao ha upgrade
  if (canAccessCoach(currentTier, requestedCoach)) return null;

  // admin ja pode tudo (protegido acima)
  if (currentTier === 'admin') return null;

  // tournament so exige pro no minimo
  if (requestedCoach === 'tournament') return 'pro';

  // technical exige premium
  if (requestedCoach === 'technical') return 'premium';

  // mental e universal — ja coberto no canAccessCoach
  return null;
}

// =============================================================================
// resolveUserTier — mapeia users.subscriptionPlan + role + user_subscriptions
//
// Diferenciacao de erros (polimento backend):
//   - "no rows" (usuario sem subscription)         → return 'free' (legitimo)
//   - Erro de DB (timeout, connection reset, etc)  → console.error + return
//     'free' (fallback seguro para nao bloquear todo o coach por instabilidade
//     transiente; logado em detalhe para que o erro nao desapareca silente).
//
// Cache em memoria (TTL curto): tier muda raramente; cache de 30s evita
// hits redundantes no caminho quente (cada mensagem do coach passa aqui).
// =============================================================================

type UserInput = {
  userPlatformId?: string;
  id?: string;
  role?: string | null;
  subscriptionPlan?: string | null;
} | null | undefined;

interface TierCacheEntry {
  tier: CoachTier;
  expiresAt: number;
}

const TIER_CACHE_TTL_MS = 30_000;
const tierCache = new Map<string, TierCacheEntry>();

// INFO-1/2 — Promise-cache para mitigar thundering herd.
// Quando 5 abas fazem dispatch simultaneo, no miss original todas executavam o
// mesmo LEFT JOIN. Agora cacheamos a Promise no momento do dispatch: a primeira
// chamada faz a query e as demais aguardam o mesmo Promise.
const inflightPromises = new Map<string, Promise<CoachTier>>();

// MEDIUM-2 — Exposed para invalidacao explicita em pontos de mudanca de tier
// (webhook Stripe, endpoints admin de subscription, etc.).
// Limpa tanto o resultado cacheado quanto promessas em flight para esse user.
export function clearUserTierCache(userId: string): void {
  if (!userId) return;
  tierCache.delete(userId);
  inflightPromises.delete(userId);
}

// Exported para testes que precisem garantir estado limpo.
export function clearTierCache(): void {
  tierCache.clear();
  inflightPromises.clear();
}

function getCachedTier(userKey: string): CoachTier | null {
  const entry = tierCache.get(userKey);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    tierCache.delete(userKey);
    return null;
  }
  return entry.tier;
}

function setCachedTier(userKey: string, tier: CoachTier): void {
  tierCache.set(userKey, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
}

export async function resolveUserTier(user: UserInput): Promise<CoachTier> {
  if (!user) return 'free';

  // Admin bypass — role='admin' OU subscriptionPlan='admin'
  // (nao cacheamos admin: e barato e queremos refletir mudanca de role na hora)
  if (user.role === 'admin' || user.subscriptionPlan === 'admin') {
    return 'admin';
  }

  const plan = (user.subscriptionPlan || '').toLowerCase();

  // Trial / expired / vazio → free (sem hit no banco)
  if (plan === 'trial' || plan === 'expired' || plan === 'free' || plan === '') {
    return 'free';
  }

  const userId = user.userPlatformId || user.id;
  if (!userId) return 'free';

  // active → consultar user_subscriptions (com cache e tratamento explicito de
  // erros transientes vs. ausencia de dados).
  if (plan === 'active') {
    const cached = getCachedTier(userId);
    if (cached !== null) return cached;

    // INFO-1/2 — Se ja existe Promise em flight para esse user, aguarda ela
    // (evita thundering herd: N requests concorrentes -> 1 query).
    const existing = inflightPromises.get(userId);
    if (existing) return existing;

    const promise = (async (): Promise<CoachTier> => {
      try {
        // Single round-trip: LEFT JOIN para obter plano + tier numa chamada so.
        // Schema atual nao tem coluna tier direta em userSubscriptions, mas
        // subscriptionPlans tem name (e podemos derivar). Mantemos o JOIN
        // explicito para que adicionar uma coluna tier no futuro seja trivial.
        const rows = await db
          .select({
            subscriptionId: userSubscriptions.id,
            status: userSubscriptions.status,
            planId: userSubscriptions.planId,
            planName: subscriptionPlans.name,
          })
          .from(userSubscriptions)
          .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, userSubscriptions.planId))
          .where(and(
            eq(userSubscriptions.userId, userId),
            eq(userSubscriptions.status, 'active'),
          ))
          .orderBy(desc(userSubscriptions.createdAt))
          .limit(1);

        // "no rows" — caso legitimo: usuario sem subscription ativa.
        if (!rows || rows.length === 0) {
          setCachedTier(userId, 'free');
          return 'free';
        }

        const row = rows[0] as any;
        const planText = (row.planName || '').toString().toLowerCase();

        let tier: CoachTier;
        if (planText.includes('premium')) tier = 'premium';
        else if (planText.includes('pro')) tier = 'pro';
        else tier = 'free';

        setCachedTier(userId, tier);
        return tier;
      } catch (err) {
        // Erro de DB transiente (timeout, connection reset, etc).
        // Logamos detalhes para nao perder o sinal e devolvemos 'free' como
        // fallback seguro — o usuario tem acesso minimo e tenta novamente em
        // ~30s automaticamente (sem cache de erro).
        console.error('[coachAccess] resolveUserTier DB error:', {
          userId,
          message: (err as Error)?.message,
          code: (err as any)?.code,
        });
        return 'free';
      }
    })();

    inflightPromises.set(userId, promise);
    // Limpa a entrada inflight assim que resolver/rejeitar — o resultado
    // bem-sucedido ja foi gravado em tierCache; falhas nao sao cacheadas.
    promise.finally(() => {
      inflightPromises.delete(userId);
    });
    return promise;
  }

  // Plano desconhecido → fallback seguro
  return 'free';
}
