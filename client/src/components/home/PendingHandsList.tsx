/**
 * RF-17 — PendingHandsList F8 maos pendentes top 5 (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-17, §5.9 F8, §3 D13
 *
 * 5 cards. Cada um: hero, context, tag, idade relativa.
 * Empty state positivo (sem CTA — anti-friction). CTA rodape "Revisar todas → /estudos".
 */

import React from 'react';
import { Link } from 'wouter';

interface PendingHand {
  id: string;
  hero: string;
  context: string;
  tag: string;
  ageRelative: string;
}

interface Props {
  data: PendingHand[];
}

export default function PendingHandsList({ data }: Props): JSX.Element {
  if (!data || data.length === 0) {
    return (
      <div
        data-testid="home-pending-hands-list"
        className="rounded-lg border border-border bg-card p-4"
      >
        <p className="text-sm text-muted-foreground">
          Nenhuma mao pendente — voce esta em dia
        </p>
      </div>
    );
  }

  const items = data.slice(0, 5);

  return (
    <div
      data-testid="home-pending-hands-list"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h3 className="text-sm font-semibold mb-3">Maos pendentes</h3>
      <ul className="space-y-2">
        {items.map((h) => {
          const href = `/estudos?spot=${encodeURIComponent(h.id)}`;
          return (
            <li key={h.id}>
              <div
                data-testid={`pending-hand-card-${h.id}`}
                className="block px-3 py-2 rounded-md hover:bg-accent transition-colors"
              >
                <Link href={href}>
                  <a
                    href={href}
                    className="block"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm">{h.hero}</span>
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded-md border border-border text-muted-foreground">
                        {h.tag}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {h.context} · {h.ageRelative}
                    </div>
                  </a>
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      <Link href="/estudos">
        <a
          data-testid="pending-hands-cta-revisar-todas"
          href="/estudos"
          className="mt-3 inline-block text-sm text-primary hover:underline"
        >
          Revisar todas →
        </a>
      </Link>
    </div>
  );
}
