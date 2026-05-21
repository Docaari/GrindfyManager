// =============================================================================
// _renderReportShell — Sprint AI-3 / RF-05.3 (ADR-174 §2.5)
// Sprint AI-3.1 / RF-04 (ADR-176) — rename `bodyHtml` -> `safeBodyHtml` com
// JSDoc @safe-html contract + migracao de weekly/monthly (era so quarterly).
//
// Shell HTML comum dos 3 templates de relatorio (weekly/monthly/quarterly).
// Cada template injeta apenas o miolo (`safeBodyHtml`); shell cuida do header
// (saudacao escapada), CTA e footer (disclaimer + unsubscribe).
//
// API:
//   renderReportShell({userName, subject, intro, safeBodyHtml, ctaLabel, ctaUrl,
//                      disclaimer?, unsubscribeUrl}): { html, text }
//
// @safe-html CONTRACT
// O parametro `safeBodyHtml` eh interpolado literal no HTML do shell. CALLER
// DEVE SANITIZAR. Nao ha DOMPurify aqui (server context); use `escapeHtml`
// em todo campo vindo de user-content. Texto literal de template eh
// safe-by-construction.
//
// Lesson #16: DOMPurify-safe — userName escapado (XSS).
// =============================================================================

import { escapeHtml } from "./_helpers";

export interface RenderReportShellArgs {
  userName: string;
  subject: string;
  intro: string;
  /**
   * HTML body do email. CALLER MUST SANITIZE.
   * @safe-html
   * Sem DOMPurify aqui (server context). Caller deve usar `escapeHtml` em todo
   * campo vindo de user-content; texto literal de template eh safe by construction.
   */
  safeBodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  disclaimer?: string;
  unsubscribeUrl: string;
}

export interface RenderReportShellResult {
  html: string;
  text: string;
}

export function renderReportShell(args: RenderReportShellArgs): RenderReportShellResult {
  const safeName = escapeHtml(args.userName);
  const safeIntro = escapeHtml(args.intro);
  const safeCtaLabel = escapeHtml(args.ctaLabel);
  const safeCtaUrl = escapeHtml(args.ctaUrl);
  const safeDisclaimer = escapeHtml(args.disclaimer ?? "");
  const safeUnsubscribeUrl = escapeHtml(args.unsubscribeUrl);

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h1>Olá ${safeName},</h1>
      <p>${safeIntro}</p>
      ${args.safeBodyHtml || ""}
      <p style="margin-top:24px;">
        <a href="${safeCtaUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">
          ${safeCtaLabel}
        </a>
      </p>
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#888;">
        ${args.disclaimer ? `<p>${safeDisclaimer}</p>` : ""}
        <p><a href="${safeUnsubscribeUrl}" style="color:#888;">unsubscribe</a> deste tipo de email.</p>
      </div>
    </div>
  `;

  // Plain-text: extrai conteúdo limpo (sem tags).
  const stripTags = (s: string): string => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const bodyText = stripTags(args.safeBodyHtml || "");
  const textLines = [
    `Olá ${args.userName},`,
    "",
    args.intro,
  ];
  if (bodyText) {
    textLines.push("");
    textLines.push(bodyText);
  }
  textLines.push("");
  textLines.push(`${args.ctaLabel}: ${args.ctaUrl}`);
  if (args.disclaimer) {
    textLines.push("");
    textLines.push(args.disclaimer);
  }
  textLines.push("");
  textLines.push(`Unsubscribe: ${args.unsubscribeUrl}`);
  const text = textLines.join("\n");

  return { html, text };
}
