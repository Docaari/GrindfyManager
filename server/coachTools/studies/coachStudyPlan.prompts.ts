/**
 * Sprint Estudos-Coach-Biblio-2 — RF-3 Coach study plan prompts.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-3.1
 * ADR  : 134 (DRY de prompts — lesson #10)
 *
 * System prompt unico, cacheado via cache_control: ephemeral (ADR-019).
 * User block montado pelo orquestrator com context per-user.
 */

export const COACH_STUDY_PLAN_PROMPT_VERSION = "v1";

export const COACH_STUDY_PLAN_SYSTEM_PROMPT = `Voce eh o Coach AI da Grindfy, especialista em performance de poker MTT.
Sua tarefa: gerar um PLANO DE ESTUDO SEMANAL personalizado de 5 dias (Seg-Sex) usando context do jogador.

Regras de output:
- Responda APENAS via tool_use 'coachStudyPlan' (output JSON estruturado).
- 5 dias EXATOS: mon, tue, wed, thu, fri. NAO incluir sab/dom.
- 3-4 atividades por dia. Soma de minutos por dia ~= daily_target_minutes (margem +/-15%).
- Distribuicao recomendada por semana:
  * 2 drills GTO em 2 dias diferentes
  * 2 aulas Biblioteca (uma de revisao, uma de progressao)
  * 1 hand_review com starredHands criticos
  * 1 snapshot_review (foco stats)
  * 1 theory_read (pode linkar externo)
- Para type=lesson: lessonId obrigatorio e DEVE pertencer ao whitelist de availableLessons.
- Para type=hand_review: handIds podem citar starredHands recentes.
- ctaTarget: URL Wouter relativa (ex: /biblioteca/curso/X/Y/play) ou null.
- reasoning: 1 frase em PT-BR explicando por que essa atividade.
- estimatedMinutes: integer entre 5 e 120.
- Idioma do title/description/reasoning: portugues do Brasil.

Anti-hallucinacao:
- NAO invente lessonId. So escolha dentro de availableLessons.
- NAO invente themeId. So escolha dentro de availableThemes.
- Se tiver duvida entre 2 atividades, prefira a que ataca o maior leak.
`;

export interface StudyPlanUserContext {
  focusStats: Array<{ statId: string; statName: string; themeName?: string }>;
  leaks: Array<{ statId: string; statName: string; severity: number; delta: number }>;
  availableLessons: Array<{
    id: string;
    title: string;
    courseSlug: string;
    lessonSlug: string;
  }>;
  availableThemes: Array<{ id: string; name: string }>;
  starredHandsRecent: Array<{ id: string; label?: string }>;
  avgDurationMinutes: number | null;
  dailyTargetMinutes: number;
  weekStartDate: string; // YYYY-MM-DD
}

export function buildStudyPlanUserBlock(ctx: StudyPlanUserContext): string {
  const focusBlock =
    ctx.focusStats.length > 0
      ? ctx.focusStats
          .map((s) => `- ${s.statName} (${s.statId})`)
          .join("\n")
      : "(nenhuma)";
  const leaksBlock =
    ctx.leaks.length > 0
      ? ctx.leaks
          .map(
            (l) =>
              `- ${l.statName} severity=${l.severity} delta=${l.delta}`,
          )
          .join("\n")
      : "(nenhum leak detectado)";
  const lessonsBlock =
    ctx.availableLessons.length > 0
      ? ctx.availableLessons
          .map((l) => `- id=${l.id} | ${l.title}`)
          .join("\n")
      : "(catalogo vazio)";
  const themesBlock =
    ctx.availableThemes.length > 0
      ? ctx.availableThemes.map((t) => `- id=${t.id} | ${t.name}`).join("\n")
      : "(sem temas curated)";
  const handsBlock =
    ctx.starredHandsRecent.length > 0
      ? ctx.starredHandsRecent
          .map((h) => `- id=${h.id}${h.label ? ` | ${h.label}` : ""}`)
          .join("\n")
      : "(sem maos criticas)";

  return `Contexto do jogador:

Stats foco do mes:
${focusBlock}

Leaks recentes (top):
${leaksBlock}

Aulas disponiveis (whitelist — use apenas estes IDs em type=lesson):
${lessonsBlock}

Temas disponiveis (whitelist — use apenas estes IDs em themeId):
${themesBlock}

Spots criticos recentes:
${handsBlock}

Tempo medio diario (rolling 7d): ${
    ctx.avgDurationMinutes != null
      ? `${ctx.avgDurationMinutes.toFixed(0)} min`
      : "(sem historico)"
  }
Meta diaria: ${ctx.dailyTargetMinutes} min
Semana: ${ctx.weekStartDate} (segunda)

Gere o plano semanal estruturado via tool 'coachStudyPlan'.`;
}
