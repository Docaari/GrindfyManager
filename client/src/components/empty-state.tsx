// =============================================================================
// Sprint F4 W1 — EmptyState compartilhado (RF-22)
//
// Reusado em DayDetailDrawer, PrimedopeWizard, PrimedopePanel.
// =============================================================================

import * as React from "react";
import { Button } from "@/components/ui/button";

type IconName =
  | "CalendarOff"
  | "Plus"
  | "X"
  | "Inbox"
  | "Wallet"
  | "AlertCircle"
  | string;

interface EmptyStateProps {
  icon: React.ReactNode | IconName;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

function renderIcon(icon: React.ReactNode | IconName): React.ReactNode {
  if (typeof icon !== "string") return icon;
  // Renderiza um placeholder leve (sem dependencia) — projeto usa lucide em outros
  // contextos mas o nome eh texto pra evitar import dinamico.
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
      data-icon={icon}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12h8" />
      </svg>
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      data-testid="empty-state"
      className={
        "flex flex-col items-center justify-center gap-3 py-8 text-center " +
        (className ?? "")
      }
    >
      <div data-testid="empty-state-icon" aria-hidden="true">
        {renderIcon(icon)}
      </div>
      <h3
        data-testid="empty-state-title"
        className="text-base font-semibold text-foreground"
      >
        {title}
      </h3>
      {description ? (
        <p
          data-testid="empty-state-description"
          className="max-w-prose text-sm text-muted-foreground"
        >
          {description}
        </p>
      ) : null}
      {action ? (
        <Button
          data-testid="empty-state-cta"
          onClick={action.onClick}
          variant="default"
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export default EmptyState;
