// =============================================================================
// Sprint Stats-V2 — StatsWizardPostImport (RF-08, lesson #11)
//
// Modal mostrado pos-import quando usuario nao tem snapshots/layouts.
// 4 templates V2: mttDefault (recomendado), mttCashCompact, tournamentEarly,
// tournamentLate.
//
// IMPORTANTE: NAO auto-submit (lesson #11). Click no card so seleciona;
// user precisa clicar em "Aplicar" ou "Customizar" explicitamente.
// =============================================================================

import { useState } from "react";
import {
  HUD_STAT_CATALOG,
  type StatField,
} from "../../../../shared/hud-stat-catalog";

export interface WizardTemplate {
  id: string;
  name: string;
  description: string;
  fields: StatField[];
  recommended?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingSnapshotsCount: number;
  existingLayoutsCount: number;
  hasCustomLayout?: boolean;
  onApplyTemplate: (template: WizardTemplate) => void;
  onCustomize: (template: WizardTemplate) => void;
  // MEDIUM-1 UX: bypassa skip conditions (existingSnapshotsCount/hasCustomLayout)
  // quando user clica em "/studies > Configurar" para reabrir o wizard.
  forceOpen?: boolean;
}

// -----------------------------------------------------------------------------
// Templates V2
// -----------------------------------------------------------------------------

// MINOR-1 reviewer: BB nao tem RFI (eh sempre o ultimo a agir pre-flop). Em
// vez de rfi_bb (id inexistente), inclui rfi_sb_short como variante curta
// frequente em torneios.
const COMPACT_IDS = new Set([
  "vpip", "pfr", "wwsf_pct", "wtsd", "wsd",
  "threebet_pf", "fold_to_3bet", "fourbet_pf",
  "rfi_ep", "rfi_co", "rfi_btn", "rfi_sb", "rfi_sb_short",
  "threebet_total", "threebet_btn", "threebet_sb", "threebet_bb",
  "fold_vs_threebet_oop", "cbet_flop_ip", "cbet_flop_oop", "fold_vs_cbet_oop",
  "second_barrel_vs_bb", "third_barrel_vs_bb",
  "bb_defend_vs_steal", "bb_3bet_vs_steal", "bb_fold_vs_steal",
  "bb_fold_vs_btn", "bb_fold_vs_co",
  "sb_steal_attempt", "bb_per_100",
]);

const EARLY_GROUPS = new Set([
  "basics", "rfi", "threebet", "bb_defense", "blind_war_bb",
]);

const LATE_GROUPS = new Set(["basics", "resteal", "threebet"]);
const LATE_EXTRAS = new Set([
  "rfi_btn", "rfi_sb_short", "rfi_sb", "rfi_btn_short", "rfi_co_short",
]);

const TEMPLATES: WizardTemplate[] = [
  {
    id: "mttDefault",
    name: "MTT Default",
    // LOW-1 UX: contagem dinamica em vez de "200+" hardcoded.
    description: `Catalogo completo recomendado para MTT (${HUD_STAT_CATALOG.length} stats).`,
    fields: HUD_STAT_CATALOG,
    recommended: true,
  },
  {
    id: "mttCashCompact",
    name: "MTT/Cash Compact",
    description: "Top 30 stats mais usados.",
    fields: HUD_STAT_CATALOG.filter((s) => COMPACT_IDS.has(s.id)),
  },
  {
    id: "tournamentEarly",
    name: "Tournament Early Stage",
    description: "Foco em jogo profundo (basics + rfi + threebet + bb_defense + blind_war_bb).",
    fields: HUD_STAT_CATALOG.filter((s) => EARLY_GROUPS.has(s.group)),
  },
  {
    id: "tournamentLate",
    name: "Tournament Late Stage (push/fold)",
    description: "Foco em short stack (basics + resteal + threebet curto + push/fold).",
    fields: HUD_STAT_CATALOG.filter(
      (s) => LATE_GROUPS.has(s.group) || LATE_EXTRAS.has(s.id),
    ),
  },
];

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export default function StatsWizardPostImport({
  open,
  onOpenChange,
  existingSnapshotsCount,
  existingLayoutsCount,
  hasCustomLayout = false,
  onApplyTemplate,
  onCustomize,
  forceOpen = false,
}: Props) {
  // Hooks SEMPRE antes de early return (lesson #1)
  const [selectedId, setSelectedId] = useState<string>("mttDefault");

  // Skip conditions (RF-08): nao monta wizard se ja tem snapshot OU layout custom
  // MEDIUM-1 UX: forceOpen sobrescreve as skip conditions (reabrir manual).
  if (!forceOpen) {
    if (existingSnapshotsCount > 0) return null;
    if (existingLayoutsCount > 0 && hasCustomLayout) return null;
  }
  if (!open) return null;

  const selectedTemplate =
    TEMPLATES.find((t) => t.id === selectedId) ?? TEMPLATES[0];

  return (
    <div
      data-testid="stats-wizard-post-import"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
    >
      <div className="w-full max-w-3xl rounded-lg border border-border bg-card p-6 max-h-[90vh] overflow-y-auto">
        <header className="mb-4">
          <h2 id="wizard-title" className="text-lg font-semibold">
            Configurar Stats Analyzer
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Escolha um template para comecar. Voce pode customizar depois.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {TEMPLATES.map((template) => {
            const isSelected = template.id === selectedId;
            const isRecommended = template.recommended;
            return (
              <button
                key={template.id}
                type="button"
                data-testid={`wizard-template-${template.id}`}
                data-default={isRecommended ? "true" : "false"}
                onClick={() => setSelectedId(template.id)}
                className={`text-left rounded border p-3 transition-colors ${
                  isSelected
                    ? "ring-2 ring-primary border-primary"
                    : isRecommended
                      ? "ring-2 ring-primary/40 border-primary"
                      : "border-border hover:border-primary/50"
                }`}
                aria-pressed={isSelected}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-medium text-sm">{template.name}</h3>
                  {isRecommended ? (
                    <span className="text-xs bg-primary text-background px-2 py-0.5 rounded-full">
                      Recomendado
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{template.description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {template.fields.length} stats
                </p>
              </button>
            );
          })}
        </div>

        <footer className="flex items-center justify-between gap-2">
          <button
            type="button"
            data-testid="wizard-skip"
            onClick={() => onOpenChange(false)}
            className="text-sm text-muted-foreground hover:text-foreground"
            title="Voce pode reabrir em /studies > Configurar"
            aria-label="Pular por agora — voce pode reabrir em /studies > Configurar"
          >
            Pular por agora
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="wizard-customize"
              onClick={() => onCustomize(selectedTemplate)}
              className="rounded border border-border px-3 py-2 text-sm hover:border-primary"
            >
              Customizar
            </button>
            <button
              type="button"
              data-testid="wizard-confirm"
              onClick={() => onApplyTemplate(selectedTemplate)}
              className="rounded bg-primary px-3 py-2 text-sm text-background font-medium"
            >
              Aplicar template
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
