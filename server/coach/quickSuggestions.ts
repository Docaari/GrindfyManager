// =============================================================================
// quickSuggestions — Sprint AI-1B / RF-12 (ADR-158)
//
// Mapa estatico por rota -> 2-4 sugestoes de pergunta (anti-blank-page). Um
// check leve de estado (downswing / sem-dados) refina o set do /dashboard.
// Cache server-side TTL 30s por (user, route) — lesson #21 + _resetForTests.
// Nao-LLM (custo zero, latencia zero).
// =============================================================================

type Suggestion = { id: string; text: string; sendOnClick: true };

function s(id: string, text: string): Suggestion {
  return { id, text, sendOnClick: true };
}

const GENERIC: Suggestion[] = [
  s("g-week", "O que mudou na minha semana?"),
  s("g-leaks", "Quais meus leaks principais?"),
  s("g-next", "Sugira meu próximo passo"),
];

const NO_DATA: Suggestion[] = [
  s("nd-import", "Como importo meus torneios?"),
  s("nd-what", "O que o Grindfy faz?"),
  s("nd-start", "Por onde eu começo?"),
];

// Mapa estatico rota -> sugestoes base (ADR-158 §3.3).
const BY_ROUTE: Record<string, Suggestion[]> = {
  "/dashboard": [
    s("d-roi", "Como está meu ROI por site?"),
    s("d-leaks", "Quais meus leaks principais?"),
    s("d-focus", "Sugira foco de estudo pra essa semana"),
  ],
  "/inicio": [
    s("d-roi", "Como está meu ROI por site?"),
    s("d-leaks", "Quais meus leaks principais?"),
    s("d-focus", "Sugira foco de estudo pra essa semana"),
  ],
  "/bankroll": [
    s("bk-banca", "Como está minha banca?"),
    s("bk-sacar", "Quanto posso sacar com segurança?"),
    s("bk-sim", "Simular: e se eu perder 10 buy-ins?"),
  ],
  // `/coach` eh a rota REGISTRADA do Grade Planner (lesson #19). `/grade-planner`
  // e `/grade` ficam como aliases inofensivos (so a chave do mapa — nao eh href).
  "/coach": [
    s("gp-sug", "Sugira uma grade pra essa semana"),
    s("gp-cabe", "Esses torneios cabem na minha banca?"),
    s("gp-hora", "Qual o melhor horário pra eu jogar?"),
  ],
  "/grade-planner": [
    s("gp-sug", "Sugira uma grade pra essa semana"),
    s("gp-cabe", "Esses torneios cabem na minha banca?"),
    s("gp-hora", "Qual o melhor horário pra eu jogar?"),
  ],
  "/grade": [
    s("gp-sug", "Sugira uma grade pra essa semana"),
    s("gp-cabe", "Esses torneios cabem na minha banca?"),
    s("gp-hora", "Qual o melhor horário pra eu jogar?"),
  ],
  "/grind": [
    s("gr-last", "Como foi minha última sessão?"),
    s("gr-spot", "Tem algum spot que vale revisar?"),
    s("gr-mental", "Como está meu mental hoje?"),
  ],
  "/grind-live": [
    s("gr-last", "Como foi minha última sessão?"),
    s("gr-spot", "Tem algum spot que vale revisar?"),
    s("gr-mental", "Como está meu mental hoje?"),
  ],
  "/estudos": [
    s("es-what", "O que devo estudar agora?"),
    s("es-prog", "Como está meu progresso no foco do mês?"),
    s("es-min", "Quanto tempo de estudo eu registrei?"),
  ],
  "/biblioteca": [
    s("bi-rec", "Qual aula você recomenda pra mim?"),
    s("bi-foco", "Tem conteúdo sobre o meu foco do mês?"),
  ],
  // stats vivem em `/estudos/stats` (rota `/estudos/:rest*`); `/stats` eh alias.
  "/estudos/stats": [
    s("st-batem", "Meus stats batem com o esperado?"),
    s("st-fora", "Algum stat fora do padrão?"),
  ],
  "/stats": [
    s("st-batem", "Meus stats batem com o esperado?"),
    s("st-fora", "Algum stat fora do padrão?"),
  ],
  "/coach-ai": [
    s("ca-week", "O que mudou na minha semana?"),
    s("ca-leaks", "Quais meus leaks?"),
    s("ca-next", "Sugira meu próximo passo"),
  ],
};

const DASHBOARD_DOWNSWING: Suggestion[] = [
  s("dd-perdendo", "Por que estou perdendo essa semana?"),
  s("dd-var", "Isso é variância ou erro?"),
  s("dd-leaks", "Quais meus leaks principais agora?"),
];

const CACHE_TTL_MS = 30_000;
const _cache = new Map<string, { value: Suggestion[]; expiresAt: number }>();

export function _resetSuggestionsCacheForTests(): void {
  _cache.clear();
}

function normalizeRoute(route: string | undefined | null): string {
  const r = (route ?? "").trim();
  if (!r) return "/coach-ai";
  // strip query/leading
  return r.split("?")[0];
}

function staticFor(route: string): Suggestion[] {
  const r = normalizeRoute(route);
  return BY_ROUTE[r] ?? GENERIC;
}

/** Lesson #19 — fallback estatico (sem state). Exportado pro frontend reusar a forma. */
export function staticSuggestionsForRoute(route: string | undefined | null): Suggestion[] {
  return staticFor(route ?? "");
}

export async function computeSuggestions(
  userId: string | undefined,
  route: string | undefined,
  _ctx?: any,
  injectedStorage?: any,
): Promise<Suggestion[]> {
  const r = normalizeRoute(route);
  const cacheKey = `${userId ?? "anon"}|${r}`;
  const cached = _cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let result: Suggestion[] = staticFor(r);

  // check leve de estado — so onde adiciona valor. Safe-degrade (lesson #9).
  try {
    let store: any = injectedStorage;
    if (!store) {
      const mod = await import("../storage");
      store = (mod as any).storage;
    }
    if (store && userId) {
      // sem-dados (qualquer rota)? confirma via dashboard stats — independente
      // de getLastUploadAt ter retornado null ou nao, o sinal canonico eh
      // "tem torneios nos ultimos 30d?".
      let hasData = true;
      try {
        const stats = await store.getDashboardStats?.(userId, "30d");
        const tournaments = Number(stats?.totalTournaments ?? stats?.tournaments ?? 0);
        if (tournaments === 0) hasData = false;
      } catch {
        // fica com hasData=true (safe — prefere o set por rota a empurrar onboarding).
      }
      if (!hasData) {
        result = NO_DATA;
      } else if (r === "/dashboard" || r === "/inicio") {
        // downswing? (ROI negativo na semana ou leaks high)
        try {
          const weekStats = await store.getDashboardStats?.(userId, "7d");
          const roiWeek = Number(weekStats?.roi ?? 0);
          const profitWeek = Number(weekStats?.totalProfit ?? weekStats?.profit ?? 0);
          let highLeaks = false;
          try {
            const leaks = await store.detectLeaks?.(userId, { minSeverity: "high" });
            highLeaks = !!(leaks?.hasHighSeverity)
              || (Array.isArray(leaks?.leaks) && leaks.leaks.some((l: any) => l?.severity === "high"));
          } catch {
            highLeaks = false;
          }
          if (roiWeek < 0 || profitWeek < 0 || highLeaks) {
            result = DASHBOARD_DOWNSWING;
          }
        } catch {
          // mantem o set base.
        }
      }
    }
  } catch (err) {
    console.error("coach.quick_suggestions.error", { userId, route: r, err });
    result = staticFor(r);
  }

  // clamp 2-4.
  const clamped = result.slice(0, 4);
  const finalResult = clamped.length >= 2 ? clamped : staticFor(r).slice(0, 4);
  _cache.set(cacheKey, { value: finalResult, expiresAt: Date.now() + CACHE_TTL_MS });
  return finalResult;
}

export const QUICK_SUGGESTIONS_BY_ROUTE = BY_ROUTE;
