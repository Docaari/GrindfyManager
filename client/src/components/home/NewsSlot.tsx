/**
 * RF-05 / RF-19 — NewsSlot (Sprint home-reform-1).
 * RF-24       — NewsSlot visivel "em breve" (Sprint home-reform-1-5).
 *
 * Spec: Docs/specs/home-reform-1.md RF-05, RF-19
 *     + Docs/specs/home-reform-1-5.md RF-24, D1.5-6, D-FOUNDER-5
 * ADR-100 + Onda 1.5 update (placeholder visivel substitui null).
 *
 * Onda 1.5: quando enabled=false OU items=[], renderiza placeholder visivel
 * com badge "Em breve" + texto descritivo (anti-confusao "feature ausente").
 * Quando items.length > 0, renderiza container real Onda 3.
 */

import React from 'react';
import { tokens } from '@/lib/ui-tokens';
import type { NewsItem } from '@shared/types/news';

interface NewsSlotProps {
  enabled: boolean;
  items: NewsItem[];
}

function NewsPlaceholder(): JSX.Element {
  return (
    <div
      data-testid="home-news-slot-placeholder"
      className={`rounded-lg border border-dashed ${tokens.color.neutral.border} bg-card p-4 opacity-70`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold">Noticias do mercado</h3>
        <span
          className={`text-[10px] uppercase border ${tokens.color.neutral.border} text-muted-foreground rounded-md px-1.5 py-0.5`}
        >
          Em breve
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Acompanharemos lancamentos de redes, atualizacoes de software (PT4 / HM3 / SharkScope)
        e movimentacoes relevantes do circuito MTT.
      </p>
    </div>
  );
}

export default function NewsSlot({ enabled, items }: NewsSlotProps): JSX.Element {
  // Onda 1.5 (D1.5-6): se desabilitado OU sem items, renderiza placeholder visivel.
  if (!enabled) return <NewsPlaceholder />;
  if (!items || items.length === 0) return <NewsPlaceholder />;

  // Onda 3 contract: items > 0 renderiza container real.
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
