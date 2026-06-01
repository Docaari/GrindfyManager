// =============================================================================
// WeeklyReportView — Sprint AI-1B / RF-08.3 (ADR-157)
//
// Pagina /coach-ai/relatorio/:id. Faz useQuery(GET /api/coach/reports/:id) e
// renderiza: o markdown via ReactMarkdown + remarkGfm + as secoes estruturadas
// do ReportContent + os 3 insights + nextWeekPlan + os CTAs. CTA kind='link' ->
// <Link href> (rota Wouter REGISTRADA). CTA kind='tool' -> navega /coach-ai?tab=chat
// com a tool pre-armada (NAO auto-executa — ADR-146). status='degraded' -> aviso
// "modo simplificado" (sem prosa dos insights).
//
// Lessons: #1 (hooks primeiro), #2 (data-testid), #13 (apiRequest JSON), #19
//   (CTAs link casam com rotas Wouter), #23 (Wouter v3 <Link href><a> ok), #29
//   (useQuery dentro de QueryClientProvider).
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiRequest } from "@/lib/queryClient";

const SECTION_LABELS: Record<string, string> = {
  volumeResults: "Volume + Resultados",
  bankroll: "Bankroll",
  selection: "Seleção",
  study: "Estudos",
  mentalOps: "Mental + Operacional",
};

function Section({ id, content }: { id: string; content: any }) {
  return (
    <section data-testid={`weekly-report-section-${id}`} className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
      <h3 className="text-sm font-medium text-gray-200">{SECTION_LABELS[id] ?? id}</h3>
      <pre className="mt-2 whitespace-pre-wrap text-[11px] text-gray-400">{JSON.stringify(content, null, 2)}</pre>
    </section>
  );
}

export default function WeeklyReportView() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const reportId = params?.id;

  const { data: report, isLoading } = useQuery<any>({
    queryKey: ["/api/coach/reports", reportId],
    queryFn: () => apiRequest("GET", `/api/coach/reports/${reportId}`),
    enabled: !!reportId,
    retry: false,
  });

  if (!report) {
    return (
      <div data-testid="weekly-report-loading" className="p-6 text-gray-300">
        {isLoading ? "Carregando relatório…" : "Relatório não encontrado."}
      </div>
    );
  }

  const content: any = report.content ?? {};
  const sections: any = content.sections ?? {};
  const isDegraded = report.status === "degraded" || content?.generation?.degraded === true;
  // Render only sections that actually exist. Weekly reports carry all of them;
  // daily/monthly carry none — sem isso o componente despejava JSON vazio (`undefined`)
  // das secoes weekly para relatorios daily/monthly.
  const sectionIds = ["volumeResults", "bankroll", "selection", "study", "mentalOps"]
    .filter((id) => sections[id] != null);

  const handleCta = (cta: any) => {
    if (cta?.kind === "tool" && cta.toolName) {
      // ADR-146 — NAO auto-executa. Navega pro chat com a tool pre-armada.
      const hint = encodeURIComponent(JSON.stringify({ tool: cta.toolName, payloadHint: cta.payloadHint ?? null }));
      setLocation(`/coach-ai?tab=chat&tool=${cta.toolName}&armed=${hint}`);
    }
  };

  return (
    <div data-testid="weekly-report-view" className="mx-auto max-w-3xl space-y-4 p-6">
      {isDegraded ? (
        <div data-testid="weekly-report-degraded-notice" className="rounded-md bg-amber-900/20 border border-amber-800/30 p-3 text-sm text-amber-300">
          Este relatório foi gerado em modo simplificado — os números estão completos abaixo.
        </div>
      ) : null}

      <div data-testid="weekly-report-markdown" className="prose prose-invert prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.markdown ?? content?.header?.title ?? ""}</ReactMarkdown>
      </div>

      <div className="space-y-3">
        {sectionIds.map((id) => (
          <Section key={id} id={id} content={sections[id]} />
        ))}
      </div>

      {!isDegraded && Array.isArray(content.insights) && content.insights.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-200">Insights</h3>
          {content.insights.map((ins: any, i: number) => (
            <div key={i} data-testid="weekly-report-insight" className="rounded-md border border-gray-700 bg-gray-800/40 p-2 text-xs text-gray-300">
              {ins?.text}
              {Array.isArray(ins?.citations) && ins.citations.length ? (
                <span className="ml-1 text-gray-500">{ins.citations.join(" ")}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* AI-1C — sessionSummary (daily) */}
      {content.sessionSummary ? (
        <div data-testid="report-session-summary" className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 text-xs text-gray-300">
          <h3 className="text-sm font-medium text-gray-200">Resumo da sessão</h3>
          <p className="mt-1">Sessões: {content.sessionSummary.sessionsCount}; Torneios: {content.sessionSummary.tournamentsCount}</p>
          {content.sessionSummary.profitUsd != null ? (
            <p className="mt-1">Lucro: ${content.sessionSummary.profitUsd.toFixed(2)} USD{content.sessionSummary.roiPct != null ? ` (ROI ${content.sessionSummary.roiPct.toFixed(1)}%)` : ""}</p>
          ) : null}
          {content.sessionSummary.spotsCount != null ? (
            <p className="mt-1">Spots registrados: {content.sessionSummary.spotsCount}</p>
          ) : null}
        </div>
      ) : null}

      {/* AI-1C — comparatives (monthly) */}
      {content.comparatives?.previousPeriod ? (
        <div data-testid="report-comparatives" className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 text-xs text-gray-300">
          <h3 className="text-sm font-medium text-gray-200">Comparativo mês anterior</h3>
          <p className="mt-1">
            {content.comparatives.previousPeriod.label}: ${(content.comparatives.previousPeriod.profit ?? 0).toFixed(2)} USD
            {content.comparatives.previousPeriod.roi != null ? ` (ROI ${content.comparatives.previousPeriod.roi.toFixed(1)}%)` : ""}
          </p>
          {content.comparatives.trendNarrative ? <p className="mt-1 text-gray-400">{content.comparatives.trendNarrative}</p> : null}
        </div>
      ) : null}

      {/* AI-1C — followUp (weekly/monthly/daily) */}
      {content.followUp && (content.followUp.activeLeakFocus?.length || content.followUp.goalsInProgress?.length) ? (
        <div data-testid="report-follow-up" className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 text-xs text-gray-300">
          <h3 className="text-sm font-medium text-gray-200">Seu acompanhamento</h3>
          {content.followUp.activeLeakFocus?.length ? (
            <div className="mt-2">
              <p className="text-gray-400">Foco de leak ativo:</p>
              <ul className="mt-1 list-disc pl-5">
                {content.followUp.activeLeakFocus.map((f: any, i: number) => (
                  <li key={`leak-${i}`}>
                    {f.label || f.code}
                    {f.status ? ` — ${f.status}` : ""}
                    {f.progressNote ? ` (${f.progressNote})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {content.followUp.goalsInProgress?.length ? (
            <div className="mt-2">
              <p className="text-gray-400">Metas em progresso:</p>
              <ul className="mt-1 list-disc pl-5">
                {content.followUp.goalsInProgress.map((g: any, i: number) => (
                  <li key={`goal-${i}`}>
                    {g.texto}
                    {g.prazo ? ` — ${g.prazo}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {content.followUp.narrative ? <p className="mt-2 text-gray-400">{content.followUp.narrative}</p> : null}
        </div>
      ) : null}

      {/* AI-1C — variance (monthly) */}
      {content.variance ? (
        <div data-testid="report-variance" className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 text-xs text-gray-300">
          <h3 className="text-sm font-medium text-gray-200">Variância (heurística)</h3>
          {content.variance.estimatedBySkillUsd != null ? (
            <>
              <p className="mt-1">Estimativa por skill: ${content.variance.estimatedBySkillUsd.toFixed(2)} USD</p>
              <p className="mt-1">Estimativa por variância: ${(content.variance.estimatedByVarianceUsd ?? 0).toFixed(2)} USD</p>
            </>
          ) : (
            <p className="mt-1 text-gray-400">Sem dados suficientes para decomposição skill/variância.</p>
          )}
          <p className="mt-1 text-gray-500">Confidence: {content.variance.confidence} (n={content.variance.sampleSize ?? 0})</p>
        </div>
      ) : null}

      {content.nextWeekPlan ? (
        <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 text-xs text-gray-300">
          <h3 className="text-sm font-medium text-gray-200">{content.reportType === "monthly" ? "Plano do próximo mês" : content.reportType === "daily" ? "Próximo passo" : "Plano da próxima semana"}</h3>
          {content.nextWeekPlan.recommendedAction ? <p className="mt-1">{content.nextWeekPlan.recommendedAction}</p> : null}
          {content.nextWeekPlan.studyFocus ? <p className="mt-1">Foco de estudo: {content.nextWeekPlan.studyFocus}</p> : null}
        </div>
      ) : null}

      {Array.isArray(content.cta) && content.cta.length ? (
        <div className="flex flex-wrap gap-2">
          {content.cta.map((cta: any, i: number) =>
            cta?.kind === "link" && typeof cta.href === "string" ? (
              <Link
                key={i}
                href={cta.href}
                data-testid="weekly-report-cta"
                data-href={cta.href}
                className="rounded-md border border-gray-600 px-3 py-1 text-xs text-gray-200 hover:bg-gray-700"
              >
                {cta.label}
              </Link>
            ) : (
              <button
                key={i}
                type="button"
                data-testid="weekly-report-cta"
                onClick={() => handleCta(cta)}
                className="rounded-md bg-green-600/20 px-3 py-1 text-xs text-green-400 hover:bg-green-600/30"
              >
                {cta?.label ?? "Ação"}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export { WeeklyReportView };
