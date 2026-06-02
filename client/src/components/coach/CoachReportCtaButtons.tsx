// =============================================================================
// CoachReportCtaButtons — Coach AI UX Overhaul (Wave 2 / #1)
//
// Render compartilhado dos CTAs de um relatorio do Coach. Fecha o loop
// diagnostico -> acao: o relatorio diz "seu ROI em PKO caiu" e o botao leva
// direto a acao (agendar estudo / registrar leak / ajustar grade).
//
// Reusado por:
//   - WeeklyReportView.tsx  (detalhe do relatorio)
//   - CoachAI.tsx ReportsPanel (timeline — antes so mostrava summaryLine)
//
// CTA kind='link' -> <Link href> (rota Wouter registrada — lesson #19).
// CTA kind='tool' -> navega /coach-ai?tab=chat com a tool PRE-ARMADA (NAO
// auto-executa — ADR-146). stopPropagation: a timeline envolve o card num
// container clicavel; o clique no CTA nao deve disparar a navegacao do card.
//
// Lessons: #2 (data-testid estavel), #19 (CTA link casa rota), #23 (Wouter v3).
// =============================================================================

import { Link, useLocation } from 'wouter';

export type CoachReportCta = {
  kind?: 'link' | 'tool' | string;
  label?: string;
  href?: string;
  toolName?: string;
  payloadHint?: Record<string, any> | null;
};

export function CoachReportCtaButtons({
  ctas,
  className,
  testId = 'coach-report-cta',
}: {
  ctas: CoachReportCta[] | undefined | null;
  className?: string;
  // testId do botao/link individual. WeeklyReportView passa 'weekly-report-cta'
  // (compat com a suite legada); a timeline usa o default 'coach-report-cta'.
  testId?: string;
}) {
  const [, setLocation] = useLocation();

  if (!Array.isArray(ctas) || ctas.length === 0) return null;

  const handleTool = (cta: CoachReportCta) => {
    if (cta?.kind === 'tool' && cta.toolName) {
      const hint = encodeURIComponent(
        JSON.stringify({ tool: cta.toolName, payloadHint: cta.payloadHint ?? null }),
      );
      setLocation(`/coach-ai?tab=chat&tool=${cta.toolName}&armed=${hint}`);
    }
  };

  return (
    <div data-testid="coach-report-cta-row" className={className ?? 'flex flex-wrap gap-2'}>
      {ctas.map((cta, i) =>
        cta?.kind === 'link' && typeof cta.href === 'string' ? (
          <Link
            key={i}
            href={cta.href}
            data-testid={testId}
            data-href={cta.href}
            onClick={(e: any) => e.stopPropagation()}
            className="rounded-md border border-gray-600 px-3 py-1 text-xs text-gray-200 hover:bg-gray-700"
          >
            {cta.label ?? 'Abrir'}
          </Link>
        ) : (
          <button
            key={i}
            type="button"
            data-testid={testId}
            onClick={(e) => {
              e.stopPropagation();
              handleTool(cta);
            }}
            className="rounded-md bg-green-600/20 px-3 py-1 text-xs text-green-400 hover:bg-green-600/30"
          >
            {cta?.label ?? 'Ação'}
          </button>
        ),
      )}
    </div>
  );
}

export default CoachReportCtaButtons;
