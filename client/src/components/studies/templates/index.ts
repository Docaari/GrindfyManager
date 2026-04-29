// Sprint F3 — Templates index (D2)
export { pt4DefaultTemplate } from "./pt4Default";
export { hm3DefaultTemplate } from "./hm3Default";
export { genericMttTemplate } from "./genericMtt";

import { pt4DefaultTemplate } from "./pt4Default";
import { hm3DefaultTemplate } from "./hm3Default";
import { genericMttTemplate } from "./genericMtt";

export const HUD_LAYOUT_TEMPLATES = [
  { id: "pt4", description: "Stats core do PokerTracker 4", template: pt4DefaultTemplate },
  { id: "hm3", description: "Stats core do Hold'em Manager 3", template: hm3DefaultTemplate },
  { id: "mtt", description: "Set minimo MTT 6-max", template: genericMttTemplate },
] as const;
