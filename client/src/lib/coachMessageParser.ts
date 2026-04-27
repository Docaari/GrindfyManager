// =============================================================================
// Coach Message Parser — Sprint Coach-1 / RF-03 + RF-02 (Frontend UX)
// Parseia mensagens do coach extraindo:
//   - [confianca: baixa|media|alta, N=X]
//   - [nao sei: motivo]
//   - [Fonte: <origem>, N=<numero>, janela: <periodo>]   (N e janela opcionais)
//
// Tags malformadas e streaming parcial sao tratados como texto literal (graceful).
//
// Spec original: docs/specs/coach-sprint-1-fundacao-economica.md (RF-03.2)
// Spec citation: Docs/specs/coach-sprint-1-frontend-ux.md (RF-02)
// ADR:  Docs/architecture/decisions/022-coach-confidence-tags-inline-vs-structured.md
// =============================================================================

export type ConfidenceLevel = 'baixa' | 'media' | 'alta';

export type CoachTag =
  | { type: 'confidence'; level: ConfidenceLevel; n: number; position?: number }
  | { type: 'unknown'; reason: string; position?: number };

export interface ParsedCoachMessage {
  cleanText: string;
  tags: CoachTag[];
}

export type CoachBadge =
  | { type: 'confidence'; level: ConfidenceLevel; n: number }
  | { type: 'unknown'; reason: string };

export interface Citation {
  origem: string;
  n?: number;
  janela?: string;
}

export type CoachNode =
  | { kind: 'text'; content: string }
  | { kind: 'badge'; badge: CoachBadge }
  | { kind: 'citation'; citation: Citation };

// Regex estritas (nivel obrigatorio in enum, N obrigatorio como numero inteiro).
// Whitespace tolerante; multi-line disabled para evitar aninhamento.
const CONFIDENCE_REGEX = /\[confianca:\s*(baixa|media|alta)\s*,\s*N\s*=\s*(\d+)\s*\]/gi;
const UNKNOWN_REGEX = /\[nao sei:\s*([^\]\[]+?)\s*\]/gi;

// Citation regex: [Fonte: <origem>(, N=<n>)?(, janela: <janela>)?]
// N e janela podem aparecer em qualquer ordem; usamos uma estrategia de extracao
// flexivel: capturamos o conteudo bruto entre "[Fonte:" e "]" e parseamos por partes.
const CITATION_OPEN = /\[Fonte:\s*([^\]\[]+?)\s*\]/gi;

// Regex combinada para node-based parsing (preserva ordem e posicao).
// Inclui confianca, nao sei E Fonte. A captura de Fonte e feita em "raw mode":
// pega tudo entre "[Fonte:" e o primeiro "]" e parseamos depois.
const COMBINED_REGEX =
  /\[confianca:\s*(baixa|media|alta)\s*,\s*N\s*=\s*(\d+)\s*\]|\[nao sei:\s*([^\]\[]+?)\s*\]|\[Fonte:\s*([^\]\[]+?)\s*\]/gi;

// =============================================================================
// parseCitationContent — parseia o conteudo bruto de uma citation
// Ex: "Dashboard > Por Speed, N=145, janela: 90d" → { origem, n, janela }
// Retorna null se origem ficar vazia (malformed).
// =============================================================================

export function parseCitationContent(raw: string): Citation | null {
  if (!raw || typeof raw !== 'string') return null;

  // Quebra por virgulas. Mas atencao: a origem pode conter ">" que nao e separador.
  // Estrategia: split por "," top-level — NAO filtrar antes de extrair origem
  // (preservamos o slot 0 mesmo vazio para detectar "[Fonte: , N=10]" como malformed).
  const rawParts = raw.split(',').map((p) => p.trim());
  if (rawParts.length === 0) return null;

  // Primeira parte e sempre a origem; se vazia, malformed.
  const origem = rawParts[0];
  if (!origem) return null;

  // Demais partes: filtramos vazios para classificar
  const parts = rawParts.slice(1).filter((p) => p.length > 0);

  let n: number | undefined;
  let janela: string | undefined;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // N=...
    // Nota: `(\d+)` garante inteiro finito apos parseInt; sem check redundante.
    const nMatch = part.match(/^N\s*=\s*(\d+)\s*$/i);
    if (nMatch) {
      n = parseInt(nMatch[1], 10);
      continue;
    }
    // janela: ...
    const janelaMatch = part.match(/^janela\s*:\s*(.+?)\s*$/i);
    if (janelaMatch) {
      janela = janelaMatch[1].trim();
      continue;
    }
    // partes desconhecidas sao ignoradas
  }

  return { origem, n, janela };
}

// =============================================================================
// parseCoachMessage — extrai tags + cleanText
// =============================================================================

export function parseCoachMessage(text: string): ParsedCoachMessage {
  if (!text || typeof text !== 'string') return { cleanText: text || '', tags: [] };

  const tags: CoachTag[] = [];

  // Extrair confidence tags
  // Nota: a regex captura `(\d+)`, entao parseInt sempre devolve inteiro finito;
  // o check Number.isFinite era redundante e foi removido (INFO).
  const confidenceMatches = Array.from(text.matchAll(new RegExp(CONFIDENCE_REGEX.source, 'gi')));
  for (const m of confidenceMatches) {
    const level = m[1].toLowerCase() as ConfidenceLevel;
    const n = parseInt(m[2], 10);
    tags.push({ type: 'confidence', level, n, position: m.index });
  }

  // Extrair unknown tags
  const unknownMatches = Array.from(text.matchAll(new RegExp(UNKNOWN_REGEX.source, 'gi')));
  for (const m of unknownMatches) {
    const reason = (m[1] || '').trim();
    if (!reason) continue;
    tags.push({ type: 'unknown', reason, position: m.index });
  }

  // Ordenar por posicao
  tags.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // cleanText: remove apenas tags validas; preserva malformadas literalmente.
  // Tambem remove citations (assim cleanText copia para clipboard sai limpo).
  let cleanText = text.replace(new RegExp(CONFIDENCE_REGEX.source, 'gi'), '');
  cleanText = cleanText.replace(new RegExp(UNKNOWN_REGEX.source, 'gi'), '');
  // Remove citations validas (origem nao vazia)
  cleanText = cleanText.replace(new RegExp(CITATION_OPEN.source, 'gi'), (full, raw: string) => {
    const parsed = parseCitationContent(raw);
    return parsed ? '' : full;
  });
  // Normalizar espacos duplos deixados pela remocao
  cleanText = cleanText.replace(/[ \t]{2,}/g, ' ');

  return { cleanText, tags };
}

// =============================================================================
// parseConfidenceTags — node-based rendering
// Retorna array alternado de {kind: 'text'|'badge'|'citation'} preservando ordem.
// =============================================================================

export function parseConfidenceTags(text: string): CoachNode[] {
  if (!text || typeof text !== 'string') {
    return [{ kind: 'text', content: text || '' }];
  }

  const nodes: CoachNode[] = [];
  const regex = new RegExp(COMBINED_REGEX.source, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    // Texto antes da tag
    if (start > lastIndex) {
      nodes.push({ kind: 'text', content: text.slice(lastIndex, start) });
    }

    if (match[1] && match[2]) {
      // confidence tag
      const level = match[1].toLowerCase() as ConfidenceLevel;
      const n = parseInt(match[2], 10);
      nodes.push({
        kind: 'badge',
        badge: { type: 'confidence', level, n },
      });
    } else if (match[3]) {
      // unknown tag
      nodes.push({
        kind: 'badge',
        badge: { type: 'unknown', reason: match[3].trim() },
      });
    } else if (match[4]) {
      // citation tag — parseia conteudo
      const parsed = parseCitationContent(match[4]);
      if (parsed) {
        nodes.push({
          kind: 'citation',
          citation: parsed,
        });
      } else {
        // Malformed citation — preservar como texto literal
        nodes.push({ kind: 'text', content: match[0] });
      }
    }

    lastIndex = end;
  }

  // Texto apos a ultima tag
  if (lastIndex < text.length) {
    nodes.push({ kind: 'text', content: text.slice(lastIndex) });
  }

  // Se nao extraiu nada, retorna texto puro
  if (nodes.length === 0) {
    nodes.push({ kind: 'text', content: text });
  }

  return nodes;
}
