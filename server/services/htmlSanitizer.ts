// =============================================================================
// htmlSanitizer — Sprint Biblioteca-1 / D10 (ADR-076) + Biblioteca-2 / RF-02 (ADR-093).
//
// Sanitiza HTML de artigos antes de salvar em library_lessons.article_html.
// Lib: isomorphic-dompurify (DOMPurify rodando em jsdom no Node).
//
// Spec 2 (ADR-093) — DUAL POLICY:
//   - 'admin-trusted'  -> allowlist expandida (HTML rico Docari Bloco A).
//                         Permite <section>, <nav>, <button>, <style>, <article>,
//                         <details>, <summary>, <table>, etc + data-* + aria-*.
//                         Bloqueia <script>, atributo style, handlers inline,
//                         <iframe>, javascript: URLs.
//   - 'user-content'   -> allowlist rigorosa (ADR-076 inalterada). DEFAULT.
//
// IMPORTANT (Lesson #7 + #11): default = 'user-content' (safe-by-default).
// Caller sem policy preserva comportamento atual (zero regressao).
//
// Caller principal trusted: manifestImporter (RF-09) -> 'admin-trusted'.
// Outros callers (notas usuario, bug reports) -> 'user-content' (default).
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

export type SanitizePolicy = "admin-trusted" | "user-content";

const ALLOWED_TAGS_USER_CONTENT = [
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

// Spec 2 / ADR-093: tags adicionadas para HTML rico Docari Bloco A.
const ALLOWED_TAGS_ADMIN_TRUSTED = [
  ...ALLOWED_TAGS_USER_CONTENT,
  "section",
  "nav",
  "button",
  "style",
  "article",
  "aside",
  "figure",
  "figcaption",
  "header",
  "footer",
  "details",
  "summary",
  "mark",
  "sup",
  "sub",
  "time",
  "abbr",
  "cite",
  "q",
  "kbd",
  "var",
  "samp",
  "caption",
  "colgroup",
  "col",
  "tfoot",
];

const ALLOWED_ATTR_USER_CONTENT = ["href", "src", "alt", "title", "class"];

// Spec 2 / ADR-093: id, role, type, tabindex aceitos em admin-trusted.
// data-* + aria-* habilitados via flag ALLOW_DATA_ATTR / ALLOW_ARIA_ATTR.
const ALLOWED_ATTR_ADMIN_TRUSTED = [
  ...ALLOWED_ATTR_USER_CONTENT,
  "id",
  "role",
  "type",
  "tabindex",
  // hidden eh atributo booleano sem valor; mantemos pra <div hidden>.
  "hidden",
  // Em admin-trusted permitimos `lang` em elementos top-level + attr-name HTML.
  "lang",
];

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
  // Atributo `style` bloqueado em AMBAS policies (defesa contra
  // payload exotico `background:url(javascript:...)`); CSS deve vir
  // de classes + arquivo dedicado (Spec 2 / RF-03).
  "style",
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

/**
 * Sanitiza HTML de artigo de aula da Biblioteca.
 *
 * @param rawHtml HTML cru.
 * @param policy 'admin-trusted' (allowlist expandida — manifest import) ou
 *   'user-content' (allowlist rigorosa, default — notas usuario, bug reports).
 *   Default = 'user-content' (safe-by-default per ADR-093).
 * @returns { clean, wordCount, warnings[] }
 */
export function sanitizeArticleHtml(
  rawHtml: string,
  policy: SanitizePolicy = "user-content",
): SanitizeArticleResult {
  installHooks();
  const isTrusted = policy === "admin-trusted";
  // ATENCAO: NAO usar `USE_PROFILES: { html: true }` em conjunto com
  // ALLOWED_TAGS — DOMPurify trata profile como union, ou seja, profile
  // sobrescreve allowlist. Para allowlist rigorosa controlada usamos apenas
  // ALLOWED_TAGS + ALLOWED_ATTR. Vetores XSS comuns ficam em FORBID_*.
  const config: any = {
    ALLOWED_TAGS: isTrusted ? ALLOWED_TAGS_ADMIN_TRUSTED : ALLOWED_TAGS_USER_CONTENT,
    ALLOWED_ATTR: isTrusted ? ALLOWED_ATTR_ADMIN_TRUSTED : ALLOWED_ATTR_USER_CONTENT,
    FORBID_TAGS,
    FORBID_ATTR,
    KEEP_CONTENT: true,
  };
  if (isTrusted) {
    // DOMPurify v3 trata <style> como tag perigosa por default mesmo em
    // ALLOWED_TAGS. Para admin-trusted (Spec 2 / ADR-093) precisamos forcar
    // via ADD_TAGS que sobrescreve o blocklist interno.
    config.ADD_TAGS = ["style"];
    // FORCE_BODY garante que a entrada eh tratada como body fragment, mas
    // <style> dentro de body eh aceito quando ADD_TAGS inclui.
    config.FORCE_BODY = true;
  }
  if (isTrusted) {
    config.ALLOW_DATA_ATTR = true;
    config.ALLOW_ARIA_ATTR = true;
  } else {
    // Em user-content explicitamente desabilitamos data-/aria- (default DOMPurify
    // permite ambos). Lesson #7 — preservamos comportamento ADR-076 inalterado.
    config.ALLOW_DATA_ATTR = false;
    config.ALLOW_ARIA_ATTR = false;
  }
  const clean = DOMPurify.sanitize(rawHtml ?? "", config);
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
