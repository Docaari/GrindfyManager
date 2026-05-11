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
// P1 (biblioteca-launch-fix): use uma INSTANCIA DEDICADA do DOMPurify (criada
// via factory em cima de JSDOM window proprio) em vez do singleton importado.
// Hooks (uponSanitizeAttribute / uponSanitizeElement) instalados aqui ficam
// isolados. Outros callers que usem `import DOMPurify from "isomorphic-dompurify"`
// continuam vendo o singleton intocado — Coach AI vision, bug-reports e notas
// nao precisam mais de `removeAllHooks()` defensivo.
// =============================================================================

import createDOMPurify from "dompurify";
// @ts-expect-error jsdom sem @types/jsdom instalado; runtime OK, types not critical aqui.
import { JSDOM } from "jsdom";
import { LIBRARY_ASSETS_URL_PREFIX } from "../../shared/library-format-helpers";

// Instancia dedicada — NAO compartilhada com singleton isomorphic-dompurify.
// JSDOM window leve criada uma unica vez no boot (cache estatico).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _localWindow = new JSDOM("<!DOCTYPE html>").window as any;
// `createDOMPurify(window)` retorna nova instance independente da global.
const DOMPurify = createDOMPurify(_localWindow);

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
 * Pre-process HTML antes de sanitize (admin-trusted policy):
 * converte `onclick="..."` (e outros on*) em `data-grindfy-onclick="..."`,
 * que sobrevive ao sanitizer (ALLOW_DATA_ATTR=true) e e re-attached como
 * event listener pelo lesson.js boilerplate dentro do iframe sandbox.
 *
 * Iframe sandbox `allow-scripts` SEM `allow-same-origin` ja contem XSS;
 * este transform preserva interatividade do conteudo Docari sem violar
 * defesa-em-profundidade.
 */
export function preserveInlineHandlers(html: string): string {
  if (!html) return html;
  return html.replace(
    /\s(on(?:click|change|submit|focus|blur|keydown|keyup|mouseover))=("([^"]*)"|'([^']*)')/gi,
    (_m, _attr, _quoted, dq, sq) => {
      const code = dq ?? sq ?? "";
      const escaped = String(code).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      return ` data-grindfy-${_attr.toLowerCase()}="${escaped}"`;
    },
  );
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
