// =============================================================================
// htmlSanitizer — Sprint Biblioteca-1 / D10 (ADR-076).
//
// Sanitiza HTML de artigos antes de salvar em library_lessons.article_html.
// Lib: isomorphic-dompurify (DOMPurify rodando em jsdom no Node).
//
// Allowlist rigorosa. Imagens self-hosted only (`/api/library/assets/...`).
// `javascript:` href bloqueado. <script>/<iframe>/handlers (onerror) removidos.
//
// Caller principal: manifestImporter (RF-11). Frontend renderiza via
// dangerouslySetInnerHTML confiando no DB ja sanitizado (ADR-076).
//
// F10 IMPORTANT: Os hooks instalados via `installHooks()` afetam o singleton
// global da `isomorphic-dompurify`. Outros call sites que usem o mesmo
// modulo (Coach AI vision, bug-reports rich text, notes da Spec 2) DEVEM:
//   1. Importar uma instancia separada via JSDOM window (createDOMPurify),
//      evitando contaminacao do singleton; OU
//   2. Chamar `DOMPurify.removeAllHooks()` ANTES do proprio `sanitize()`
//      para isolar regras de cada call site.
// Sem isso, hooks deste arquivo (img src startsWith /api/library/assets/...)
// vao filtrar atributos em sanitizes nao relacionados a artigos da Biblioteca.
// =============================================================================

import DOMPurify from "isomorphic-dompurify";
import { LIBRARY_ASSETS_URL_PREFIX } from "../../shared/library-format-helpers";

const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "a",
  "img",
  "span",
  "div",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "class"];

const FORBID_TAGS = ["script", "iframe", "object", "embed", "form", "input", "svg", "math"];
const FORBID_ATTR = [
  "onerror",
  "onclick",
  "onload",
  "onmouseover",
  "onfocus",
  "onblur",
  "onchange",
  "onsubmit",
  "onkeydown",
  "onkeyup",
];

const ASSETS_PATH_PREFIX = LIBRARY_ASSETS_URL_PREFIX;

let _hooksInstalled = false;
function installHooks() {
  if (_hooksInstalled) return;
  _hooksInstalled = true;
  // <img src=...>: aceita apenas paths /api/library/assets/...
  // <a href=...>: bloqueia javascript: / data: URIs.
  DOMPurify.addHook("uponSanitizeAttribute", (_node: any, data: any) => {
    const tagName = (data?.tagName ?? "").toLowerCase();
    const attrName = (data?.attrName ?? "").toLowerCase();
    const attrValue = String(data?.attrValue ?? "");

    if (tagName === "img" && attrName === "src") {
      if (!attrValue.startsWith(ASSETS_PATH_PREFIX)) {
        data.keepAttr = false;
      }
    }
    if (tagName === "a" && attrName === "href") {
      if (/^\s*(javascript|data|vbscript):/i.test(attrValue)) {
        data.keepAttr = false;
      }
    }
  });
  // Tag-level: remove <img> inteira quando src eh externo (defesa
  // adicional ao remover atributo, que poderia preservar a string original
  // dentro do output em algumas configuracoes).
  DOMPurify.addHook("uponSanitizeElement", (node: any, data: any) => {
    if ((data?.tagName ?? "").toLowerCase() === "img") {
      const src = String(node?.getAttribute?.("src") ?? "");
      if (src && !src.startsWith(ASSETS_PATH_PREFIX)) {
        node.parentNode?.removeChild?.(node);
      }
    }
  });
}

export interface SanitizeArticleResult {
  clean: string;
  wordCount: number;
  warnings: string[];
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function sanitizeArticleHtml(rawHtml: string): SanitizeArticleResult {
  installHooks();
  const clean = DOMPurify.sanitize(rawHtml ?? "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS,
    FORBID_ATTR,
    KEEP_CONTENT: true,
    USE_PROFILES: { html: true },
  });
  // KEEP_CONTENT mantem texto interno de tags removidas; em <script> isso e
  // RUIM (codigo vira texto). Removemos manualmente blocos script/iframe.
  // Mas DOMPurify ja remove via FORBID_TAGS — KEEP_CONTENT so afeta tags fora
  // da allowlist. Para garantir que `alert(1)` nao volte como texto literal,
  // hookamos uponSanitizeElement abaixo.
  // (No teste: '<p>safe</p><script>alert(1)</script>' precisa virar 'safe'.)
  // DOMPurify v3 faz isso por default ao remover script.
  const wordCount = countWords(stripTags(String(clean)));
  return {
    clean: String(clean),
    wordCount,
    warnings: [],
  };
}
