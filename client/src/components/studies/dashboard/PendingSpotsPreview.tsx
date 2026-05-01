/**
 * Sprint Studies-Reform — RF-02: Spots pendentes top 3 preview
 */

import React from 'react';
import { useLocation } from 'wouter';

interface SpotRow {
  id: string;
  type?: string;
  spot?: string;
  conclusion?: string;
  createdAt?: string;
  imageUrl?: string | null;
  reviewLater?: boolean;
}

interface PendingSpotsPreviewProps {
  spots: SpotRow[];
}

export function PendingSpotsPreview({ spots }: PendingSpotsPreviewProps) {
  const [, navigate] = useLocation();
  const top = (spots ?? []).slice(0, 3);

  if (!top.length) {
    return (
      <div data-testid="pending-spots-preview-empty" className="text-xs text-gray-500">
        Sem spots pendentes.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {top.map((s) => (
        <button
          key={s.id}
          type="button"
          data-testid={`dashboard-spot-${s.id}`}
          onClick={() => navigate(`/estudos/spots`)}
          className="w-full text-left rounded-md border border-gray-700 bg-gray-800/70 px-3 py-2 hover:bg-gray-800"
        >
          <div className="text-sm font-medium text-white truncate">
            {s.type ?? 'spot'} {s.spot ? `· ${s.spot}` : ''}
          </div>
          <div className="text-[11px] text-gray-400 truncate">{s.conclusion ?? ''}</div>
        </button>
      ))}
    </div>
  );
}

export default PendingSpotsPreview;
