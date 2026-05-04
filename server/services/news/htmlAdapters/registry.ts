/**
 * HTML adapter registry — Sprint News-3 RF-05/RF-05.1.
 *
 * Mapeia source.id para adapter dedicado. Sources sem adapter retornam null
 * (Orchestrator/BlogScraperProvider tratam como "pending" + log warn + []).
 */

import type { AdapterItem } from "./_shared";
import { scrapeMundoPoker } from "./scrapeMundoPoker";
import { scrapeSuperPoker } from "./scrapeSuperPoker";
import { scrapeGgPoker } from "./scrapeGgPoker";
import { scrapePokerStars } from "./scrapePokerStars";
import { scrapeHand2Note } from "./scrapeHand2Note";
import { scrapeHrc } from "./scrapeHrc";
import { scrapeJurojin } from "./scrapeJurojin";
import { scrapeGtoWizardArticles } from "./scrapeGtoWizardArticles";
import { scrapeGtoWizardWhatsNew } from "./scrapeGtoWizardWhatsNew";

export type HtmlAdapter = (html: string, baseUrl: string) => AdapterItem[];

const ADAPTERS: Record<string, HtmlAdapter> = {
  mundopoker: scrapeMundoPoker,
  superpoker: scrapeSuperPoker,
  ggpoker: scrapeGgPoker,
  pokerstars: scrapePokerStars,
  hand2note: scrapeHand2Note,
  hrc: scrapeHrc,
  jurojin: scrapeJurojin,
  "gto-wizard-studies": scrapeGtoWizardArticles,
  "gto-wizard": scrapeGtoWizardWhatsNew,
};

export function getHtmlAdapter(sourceId: string): HtmlAdapter | null {
  return ADAPTERS[sourceId] ?? null;
}

export {
  scrapeMundoPoker,
  scrapeSuperPoker,
  scrapeGgPoker,
  scrapePokerStars,
  scrapeHand2Note,
  scrapeHrc,
  scrapeJurojin,
  scrapeGtoWizardArticles,
  scrapeGtoWizardWhatsNew,
};
