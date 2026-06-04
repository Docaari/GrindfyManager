// =============================================================================
// WigBanner — a WIG (Meta Global) como NORTE do placar (ADR-241 M9). Banner
// full-width, distinto das medidas. Hierarquia 4DX: "por que" (WIG) acima do
// "como" (medidas). RF-06: lag (current) so com horizon >= quarter.
// =============================================================================

import { Compass } from "lucide-react";
import { statusVisual, horizonAtLeastQuarter, HORIZON_LABEL } from "@/components/metas/metaUi";

export interface WigBannerData {
  careerGoalId: string;
  title: string;
  horizon: string;
  current: number | null;
  target: number;
  expectedNow: number | null;
  status: string;
}

export function WigBanner({ wig }: { wig: WigBannerData }) {
  const meta = statusVisual(wig.status);
  const showLag = horizonAtLeastQuarter(wig.horizon);
  return (
    <div
      data-testid={`wig-row-${wig.careerGoalId}`}
      className="rounded-xl border border-primary/30 bg-primary/5 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-primary/15 p-2 text-primary">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-primary/80">Meta global (WIG)</p>
            <h3 className="text-lg font-semibold leading-tight text-foreground">{wig.title}</h3>
            <p className="text-xs text-muted-foreground">Horizonte: {HORIZON_LABEL[wig.horizon] ?? wig.horizon}</p>
            {showLag ? (
              <p className="mt-1 text-sm text-muted-foreground" data-testid={`wig-lag-value-${wig.careerGoalId}`}>
                Progresso: <strong className="text-foreground">{wig.current ?? "—"}</strong> / {wig.target}
              </p>
            ) : null}
          </div>
        </div>
        <span
          data-testid={`wig-status-${wig.careerGoalId}`}
          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.pill}`}
        >
          <span className="sr-only">{wig.status}</span>
          <span aria-hidden="true">{meta.label}</span>
        </span>
      </div>
    </div>
  );
}

export default WigBanner;
