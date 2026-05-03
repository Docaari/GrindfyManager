/**
 * RF-18 — HomeFooter S12 footer minimalista (Sprint home-reform-1).
 *
 * Spec: Docs/specs/home-reform-1.md §RF-18, §5.12 S12
 *
 * 4 elementos: Bug report (modal existente) + Discord + Suporte + versao.
 * Estilo discreto (text-xs, color muted).
 */

import React from 'react';
import BugReportModal from '@/components/BugReportModal';

const APP_VERSION =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof process !== 'undefined' && (process.env as any)?.APP_VERSION) || '1.0.0';

export default function HomeFooter(): JSX.Element {
  return (
    <footer className="flex flex-wrap items-center gap-4 px-4 py-3 text-xs text-muted-foreground">
      <BugReportModal
        currentPage="/"
        trigger={
          <button
            data-testid="home-footer-bug-report"
            className="hover:underline hover:text-foreground"
          >
            Reportar bug
          </button>
        }
      />
      <a
        data-testid="home-footer-discord"
        href="https://discord.gg/grindfy"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline hover:text-foreground"
      >
        Discord
      </a>
      <a
        data-testid="home-footer-suporte"
        href="mailto:suporte@grindfy.com"
        className="hover:underline hover:text-foreground"
      >
        Suporte
      </a>
      <span data-testid="home-footer-versao" className="ml-auto text-muted-foreground">
        v{APP_VERSION}
      </span>
    </footer>
  );
}
