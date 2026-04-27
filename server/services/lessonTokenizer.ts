/**
 * Lesson Tokenizer — Sprint Cooldown-2
 *
 * Spec: Docs/specs/cooldown-refactor-plan.md (RF-06 endpoint /top-lessons)
 * ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
 *
 * Tokeniza texto livre (cooldownLogs.abGameAnswers.lesson) em palavras agregadas
 * para word cloud. SEM PII: retorna apenas tokens > 3 chars (palavras isoladas)
 * com count, top 30 ordenados desc.
 */

const TOP_N = 30;

// Stopwords PT-BR comuns. Mantido enxuto — vai expandindo conforme necessidade.
const STOPWORDS = new Set<string>([
  "de",
  "do",
  "da",
  "dos",
  "das",
  "no",
  "na",
  "nos",
  "nas",
  "em",
  "ao",
  "aos",
  "com",
  "por",
  "para",
  "pelo",
  "pela",
  "pelos",
  "pelas",
  "que",
  "uma",
  "uns",
  "umas",
  "este",
  "esta",
  "estes",
  "estas",
  "esse",
  "essa",
  "esses",
  "essas",
  "isto",
  "isso",
  "aquele",
  "aquela",
  "mais",
  "menos",
  "muito",
  "pouco",
  "sobre",
  "como",
  "quando",
  "onde",
  "porque",
  "pois",
  "mas",
  "tem",
  "tinha",
  "foi",
  "fui",
  "ser",
  "estar",
  "seu",
  "sua",
  "seus",
  "suas",
  "meu",
  "minha",
  "meus",
  "minhas",
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
]);

export interface LessonToken {
  token: string;
  count: number;
}

export function tokenizeLessons(lessons: string[]): LessonToken[] {
  if (!Array.isArray(lessons) || lessons.length === 0) return [];

  const counts = new Map<string, number>();

  for (const raw of lessons) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Quebra em palavras: separa por whitespace + pontuacao basica
    const words = trimmed
      .toLowerCase()
      .split(/[\s.,;:!?()\[\]{}"'\-/\\]+/)
      .filter(Boolean);

    for (const w of words) {
      if (w.length <= 3) continue; // > 3 chars = pelo menos 4 chars
      if (STOPWORDS.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }

  const result: LessonToken[] = Array.from(counts.entries()).map(
    ([token, count]) => ({ token, count }),
  );
  result.sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));
  return result.slice(0, TOP_N);
}
