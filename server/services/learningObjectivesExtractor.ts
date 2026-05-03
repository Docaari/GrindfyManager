// =============================================================================
// learningObjectivesExtractor — Sprint Biblioteca-2 / RF-09 / ADR-095.
//
// Extrai array de objetivos pedagogicos de HTML de aula. Reconhece variantes:
//   <div class="learning-objectives"><ul><li>...</li></ul></div>
//   <div class="learning_objectives">...</div>
//   <div class="objectives">...</div>
// Case-insensitive class match.
//
// Cap defensivo: 10 items, 200 chars/item. Strip HTML aninhado (<strong>, etc).
// Graceful fallback `[]` em HTML mal-formado (sem </div>).
// =============================================================================

const CONTAINER_REGEX =
  /<div[^>]*class\s*=\s*["'][^"']*\b(learning[-_]objectives|objectives)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i;

const LI_REGEX = /<li[^>]*>([\s\S]*?)<\/li>/gi;

const MAX_ITEMS = 10;
const MAX_LEN_PER_ITEM = 200;

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Extrai learning objectives do HTML.
 * @returns array de strings (max 10 items, 200 chars each); [] quando nao encontrado.
 */
export function extractLearningObjectives(html: string): string[] {
  if (typeof html !== "string" || html.length === 0) return [];
  const containerMatch = html.match(CONTAINER_REGEX);
  if (!containerMatch) return [];
  const inner = containerMatch[2] ?? "";
  const liMatches = [...inner.matchAll(LI_REGEX)];
  return liMatches
    .map((m) => stripHtmlTags(m[1] ?? ""))
    .filter((s) => s.length > 0 && s.length <= MAX_LEN_PER_ITEM)
    .slice(0, MAX_ITEMS);
}
