// =============================================================================
// Email template helpers — Sprint AI-2B / RF-07.3 (ADR-172)
// XSS escape para texto livre do user (mental hand snippets).
// =============================================================================

export function escapeHtml(s: any): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderFooter(disclaimer: string | undefined, unsubscribeUrl: string): string {
  const safeDisc = escapeHtml(disclaimer ?? "");
  const safeUrl = escapeHtml(unsubscribeUrl);
  return `
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#888;">
      <p>${safeDisc}</p>
      <p><a href="${safeUrl}" style="color:#888;">unsubscribe</a> deste tipo de email.</p>
    </div>
  `;
}

export function formatBrDate(d: string): string {
  // Espera 'YYYY-MM-DD' → 'DD/MM/YYYY'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
