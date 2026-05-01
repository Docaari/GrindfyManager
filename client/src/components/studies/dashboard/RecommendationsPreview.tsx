/**
 * Sprint Studies-Reform — RF-02: Recomendacoes preview top 5
 */

import React from 'react';
import { useLocation } from 'wouter';

interface RecItem {
  id: string;
  type: 'leak' | 'stale_spot' | 'dormant_theme';
  title: string;
  description?: string;
  priority_score: number;
  cta_action?: string;
  cta_url?: string;
  metadata?: Record<string, any>;
}

interface RecommendationsPreviewProps {
  items: RecItem[];
}

export function RecommendationsPreview({ items }: RecommendationsPreviewProps) {
  const [, navigate] = useLocation();
  const top = (items ?? []).slice(0, 5);

  if (!top.length) {
    return (
      <div data-testid="recommendations-preview-empty" className="text-xs text-gray-500">
        Voce esta em dia. Continue estudando.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {top.map((r) => (
        <button
          key={r.id}
          type="button"
          data-testid={`dashboard-rec-${r.id}`}
          onClick={() => r.cta_url && navigate(r.cta_url)}
          className="w-full text-left rounded-md border border-gray-700 bg-gray-800/70 px-3 py-2 hover:bg-gray-800"
        >
          <div className="text-sm font-medium text-white">{r.title}</div>
          <div className="text-[11px] text-gray-400">
            score {r.priority_score} · {r.type}
          </div>
        </button>
      ))}
    </div>
  );
}

export default RecommendationsPreview;
