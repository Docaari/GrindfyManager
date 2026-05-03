/**
 * RF-05 / RF-19 — NewsSlot (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-05, §3 D17, §5.13 S15
 * ADR-100 §2 (D)
 *
 * Onda 1: sempre renderiza null (enabled=false ou items=[]). Onda 3 introduz
 * cards visiveis quando provider real (xAI Grok) chegar.
 */

import React from 'react';
import type { NewsItem } from '@shared/types/news';

interface NewsSlotProps {
  enabled: boolean;
  items: NewsItem[];
}

export default function NewsSlot({ enabled, items }: NewsSlotProps): JSX.Element | null {
  // Onda 1 (D17): se desabilitado OU sem items, retorna null (sem placeholder).
  if (!enabled) return null;
  if (!items || items.length === 0) return null;

  // Onda 3 contract: items > 0 renderiza container visivel.
  return (
    <div data-testid="home-news-slot" className="rounded-lg border p-4">
      <h3 className="text-sm font-semibold mb-2">Noticias</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="text-sm">
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
