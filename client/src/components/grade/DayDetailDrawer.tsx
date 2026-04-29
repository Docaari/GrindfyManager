// =============================================================================
// Sprint F4 W1 — DayDetailDrawer (RF-01 drill-down)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (RF-01, RF-22)
// Diagrama: Docs/architecture/flow-day-detail-drawer.mermaid
// =============================================================================

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useDayDetail } from "@/hooks/useDayDetail";
import { EmptyState } from "@/components/empty-state";
import { emit as trackerEmit } from "@/lib/tracker";

interface DayDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileLetter: "A" | "B" | "C";
  dayOfWeek: number;
  onEdit?: () => void;
}

const DAYS_PT = [
  "Domingo",
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado",
];

function formatUsd(v: number): string {
  return `$${(v ?? 0).toFixed(2)}`;
}

export function DayDetailDrawer({
  open,
  onOpenChange,
  profileLetter,
  dayOfWeek,
  onEdit,
}: DayDetailDrawerProps): React.ReactElement {
  const query = useDayDetail({ open, profileLetter, dayOfWeek });

  // Telemetria ao abrir
  React.useEffect(() => {
    if (open) {
      try {
        trackerEmit("day_detail_drawer_open", {
          profileLetter,
          dayOfWeek,
          source: "WeekGrid",
        });
      } catch {}
    }
  }, [open, profileLetter, dayOfWeek]);

  const data = query.data;
  const total = data?.cards?.totalTournaments ?? 0;
  const isEmpty = !!data && total === 0;
  const cards = data?.cards ?? {
    totalTournaments: 0,
    abiUsd: 0,
    investmentUsd: 0,
    bankrollNeeded: 0,
  };
  const format = data?.format ?? { pctPKO: 0, pctTurbo: 0, pctVanilla: 0 };
  const volume = data?.volume ?? [];
  const bankroll = data?.bankroll ?? [];
  const list = data?.list ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader className="sticky top-0 z-10 bg-background pb-3">
          <SheetTitle>
            Detalhes do dia — {DAYS_PT[dayOfWeek] ?? `Dia ${dayOfWeek}`} (Perfil {profileLetter})
          </SheetTitle>
        </SheetHeader>

        {!data ? (
          <div
            className="py-8 text-center text-sm text-muted-foreground"
          >
            Carregando...
          </div>
        ) : (
        <div data-testid="day-detail-drawer">
        {isEmpty ? (
          <div data-testid="day-detail-empty">
            <EmptyState
              icon="CalendarOff"
              title="Nenhum torneio planejado neste dia."
              description="Adicione torneios pela WeekGrid."
              action={{
                label: "Adicionar torneios",
                onClick: () => {
                  onOpenChange(false);
                  onEdit?.();
                },
              }}
            />
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* 4 cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div
                data-testid="day-detail-card-total"
                className="rounded-md border border-border bg-card p-3"
              >
                <div className="text-xs text-muted-foreground">Total torneios</div>
                <div className="text-xl font-semibold">{cards.totalTournaments}</div>
              </div>
              <div
                data-testid="day-detail-card-abi"
                className="rounded-md border border-border bg-card p-3"
              >
                <div className="text-xs text-muted-foreground">ABI</div>
                <div className="text-xl font-semibold">{formatUsd(cards.abiUsd)}</div>
              </div>
              <div
                data-testid="day-detail-card-investment"
                className="rounded-md border border-border bg-card p-3"
              >
                <div className="text-xs text-muted-foreground">Investimento</div>
                <div className="text-xl font-semibold">{formatUsd(cards.investmentUsd)}</div>
              </div>
              <div
                data-testid="day-detail-card-bankroll"
                className="rounded-md border border-border bg-card p-3"
              >
                <div className="text-xs text-muted-foreground">Banca necessaria</div>
                <div className="text-xl font-semibold">{formatUsd(cards.bankrollNeeded)}</div>
              </div>
            </div>

            {/* Pie format */}
            <div
              data-testid="day-detail-format-pie"
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="mb-2 text-sm font-medium">Distribuicao por formato</div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>PKO: {(format.pctPKO ?? 0).toFixed(0)}%</div>
                <div>Vanilla: {(format.pctVanilla ?? 0).toFixed(0)}%</div>
                <div>Turbo: {(format.pctTurbo ?? 0).toFixed(0)}%</div>
              </div>
            </div>

            {/* Bar volume */}
            <div
              data-testid="day-detail-volume-bar"
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="mb-2 text-sm font-medium">Volume por plataforma</div>
              <ul className="space-y-1 text-xs">
                {volume.map((v) => (
                  <li key={v.site} className="flex justify-between">
                    <span>{v.site}</span>
                    <span>{v.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Bankroll table */}
            <div
              data-testid="day-detail-bankroll-table"
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="mb-2 text-sm font-medium">Banca por plataforma</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left">Plataforma</th>
                    <th className="text-right">Saldo USD</th>
                    <th className="text-right">Investimento</th>
                    <th className="text-right">Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {bankroll.map((b) => (
                    <tr key={b.site}>
                      <td>{b.site}</td>
                      <td className="text-right">{formatUsd(b.balanceUsd)}</td>
                      <td className="text-right">{formatUsd(b.dayInvestmentUsd)}</td>
                      <td className="text-right">{b.coveragePct.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* List */}
            <div
              data-testid="day-detail-list"
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="mb-2 text-sm font-medium">Torneios planejados</div>
              <ul className="space-y-1 text-xs">
                {list.map((t) => (
                  <li key={t.id ?? `${t.name}-${t.time}`}>
                    <span className="font-medium">{t.name ?? t.site}</span>
                    {" — "}
                    <span>{t.site}</span>
                    {t.type ? <> · <span>{t.type}</span></> : null}
                    {t.speed ? <> · <span>{t.speed}</span></> : null}
                    {" · "}
                    <span>{formatUsd(t.buyinUsd)}</span>
                    {" × "}
                    <span>{t.count}</span>
                    {t.time ? <> · <span>{t.time}</span></> : null}
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA Editar */}
            <div className="pt-2">
              <Button
                data-testid="day-detail-cta-edit"
                variant="default"
                onClick={() => {
                  onOpenChange(false);
                  onEdit?.();
                }}
              >
                Editar grade do dia
              </Button>
            </div>
          </div>
        )}
        </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default DayDetailDrawer;
