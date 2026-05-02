// =============================================================================
// CoachMessageContent — Sprint Coach-1 Frontend UX / RF-01 + RF-02
// Componente que substitui <ReactMarkdown> direto nas bubbles do assistant.
// Consome parseConfidenceTags() e renderiza:
//   - texto normal: <ReactMarkdown> com remark-gfm
//   - badge.type='confidence': <ConfidenceBadge>
//   - badge.type='unknown':    <UnknownBadge>
//   - kind='citation':         <CitationChip>
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-01, RF-02)
//
// MEDIUM-6 fix: paliativo para listas/headings/blockquotes. Quando uma tag
// aparece dentro de uma linha que comeca com construct block-level
// (`-`, `*`, `+`, `1.`, `#`, `>`), o splitting por tags quebrava a renderizacao
// do markdown (listas re-iniciavam numeracao, headings perdiam hierarquia).
// Solucao: agrupamos linhas que possuem construct block-level e renderizamos
// o trecho INTEIRO como markdown unico SEM splittar por tags — tags ficam
// como texto literal nesse caso. Limitacao documentada: tags fora de
// constructos markdown estruturados sao parseadas; dentro de listas/
// headings/blockquotes ficam como texto literal (paliativo bem feito;
// refactor com remark plugin seria a solucao definitiva).
// =============================================================================

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseConfidenceTags } from '@/lib/coachMessageParser';
import { ConfidenceBadge, UnknownBadge } from './ConfidenceBadge';
import { CitationChip } from './CitationChip';

export interface CoachMessageContentProps {
  content?: string;
  /** Sprint Coach Sprint 0 RF-04/05: alias para `content`. */
  text?: string;
  className?: string;
}

// Splita o conteudo em segmentos: texto markdown comum vs blocos de codigo
// (fenced ```...``` e inline `code`). Tags dentro de code blocks NAO sao
// parseadas — sao preservadas como texto literal.
type Segment = { kind: 'parse' | 'literal'; content: string };

function splitByCodeBlocks(content: string): Segment[] {
  if (!content) return [{ kind: 'parse', content: '' }];
  const segments: Segment[] = [];
  // Regex captura fenced (```...```) e inline (`...`)
  const codeRe = /(```[\s\S]*?```|`[^`\n]*`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = codeRe.exec(content)) !== null) {
    if (match.index > lastIdx) {
      segments.push({ kind: 'parse', content: content.slice(lastIdx, match.index) });
    }
    segments.push({ kind: 'literal', content: match[0] });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < content.length) {
    segments.push({ kind: 'parse', content: content.slice(lastIdx) });
  }
  if (segments.length === 0) {
    segments.push({ kind: 'parse', content });
  }
  return segments;
}

// MEDIUM-6: detecta linhas que comecam com block-level markdown construct.
// Listas: `- `, `* `, `+ `, `<num>. `; headings: `# ` a `###### `; blockquote: `> `.
const BLOCK_LINE_RE = /^[\s]*(?:[-*+] |\d+\. |#{1,6} |> )/;

function lineHasBlockConstruct(line: string): boolean {
  return BLOCK_LINE_RE.test(line);
}

// MEDIUM-6: Splita um segmento "parse" em sub-segmentos: trechos com
// constructs block-level (renderizados como markdown unico, sem split por tags)
// e trechos comuns (parseados normalmente para extrair tags inline).
//
// Heuristica: agrupa linhas consecutivas, marcando o grupo como "block" se
// ALGUMA linha tem construct block-level. Trechos com construct block-level
// renderizam tags como texto literal — limitacao paliativa documentada.
type SubSegment = { kind: 'inline' | 'block'; content: string };

function splitByBlockConstructs(text: string): SubSegment[] {
  if (!text) return [{ kind: 'inline', content: '' }];

  // Quebra preservando os \n para reconstruir o texto fielmente.
  const lines = text.split('\n');
  const groups: SubSegment[] = [];
  let currentBuf: string[] = [];
  let currentKind: 'inline' | 'block' = 'inline';

  const flush = () => {
    if (currentBuf.length === 0) return;
    groups.push({ kind: currentKind, content: currentBuf.join('\n') });
    currentBuf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBlock = lineHasBlockConstruct(line);
    // Linhas em branco fluem com o grupo anterior (preservam separacao
    // de paragrafos do markdown sem trocar de kind).
    const lineKind: 'inline' | 'block' = isBlock ? 'block' : 'inline';

    if (currentBuf.length === 0) {
      currentKind = lineKind;
      currentBuf.push(line);
      continue;
    }

    // Linha vazia: mantem o grupo atual.
    if (line.trim() === '') {
      currentBuf.push(line);
      continue;
    }

    // Se proxima linha e de tipo diferente, flush e troca.
    if (lineKind !== currentKind) {
      flush();
      currentKind = lineKind;
      currentBuf.push(line);
    } else {
      currentBuf.push(line);
    }
  }
  flush();

  if (groups.length === 0) {
    groups.push({ kind: 'inline', content: text });
  }
  return groups;
}

export function CoachMessageContent({
  content,
  text,
  className,
}: CoachMessageContentProps): JSX.Element {
  const effective = content ?? text ?? '';
  const segments = React.useMemo(() => splitByCodeBlocks(effective), [effective]);

  return (
    <div className={className}>
      {segments.map((seg, segIdx) => {
        if (seg.kind === 'literal') {
          // Code block — preserva como markdown sem parsear tags internas
          return (
            <ReactMarkdown key={`lit-${segIdx}`} remarkPlugins={[remarkGfm]}>
              {seg.content}
            </ReactMarkdown>
          );
        }

        // MEDIUM-6: dentro de um segmento "parse", separamos block-constructs
        // de trechos inline. Block-constructs sao renderizados como markdown
        // unico (preservando estrutura), com tags ficando como texto literal.
        const subSegments = splitByBlockConstructs(seg.content);

        return (
          <React.Fragment key={`seg-${segIdx}`}>
            {subSegments.map((sub, subIdx) => {
              if (sub.kind === 'block') {
                // Renderiza markdown inteiro — tags ficam como texto literal
                // (limitacao paliativa documentada; refactor com remark plugin
                // seria a solucao definitiva).
                if (!sub.content.trim()) {
                  return <ReactMarkdown
                    key={`block-${segIdx}-${subIdx}`}
                    remarkPlugins={[remarkGfm]}
                  >
                    {sub.content}
                  </ReactMarkdown>;
                }
                return (
                  <ReactMarkdown
                    key={`block-${segIdx}-${subIdx}`}
                    remarkPlugins={[remarkGfm]}
                  >
                    {sub.content}
                  </ReactMarkdown>
                );
              }
              // Inline: parse de tags + render mixed.
              const nodes = parseConfidenceTags(sub.content);
              return (
                <React.Fragment key={`inline-${segIdx}-${subIdx}`}>
                  {nodes.map((node, idx) => {
                    if (node.kind === 'text') {
                      if (!node.content) return null;
                      return (
                        <ReactMarkdown
                          key={`text-${segIdx}-${subIdx}-${idx}`}
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // Inline rendering: paragraphs viram spans para preservar fluxo
                            p: ({ node: _node, ...props }) => <span {...props} />,
                          }}
                        >
                          {node.content}
                        </ReactMarkdown>
                      );
                    }
                    if (node.kind === 'badge') {
                      if (node.badge.type === 'confidence') {
                        return (
                          <ConfidenceBadge
                            key={`badge-${segIdx}-${subIdx}-${idx}`}
                            level={node.badge.level}
                            n={node.badge.n}
                          />
                        );
                      }
                      return (
                        <UnknownBadge
                          key={`badge-${segIdx}-${subIdx}-${idx}`}
                          reason={node.badge.reason}
                        />
                      );
                    }
                    if (node.kind === 'citation') {
                      return (
                        <CitationChip
                          key={`cit-${segIdx}-${subIdx}-${idx}`}
                          source={node.citation.origem}
                          n={node.citation.n}
                          window={node.citation.janela}
                        />
                      );
                    }
                    return null;
                  })}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default CoachMessageContent;
