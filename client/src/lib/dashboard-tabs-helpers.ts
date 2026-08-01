// Dashboard tabs helpers (FP-12)

export interface TabDefinition {
  id: string;
  label: string;
}

const PRIMARY_TABS: TabDefinition[] = [
  { id: 'evolution', label: 'Geral' },
  { id: 'por-site', label: 'Site' },
  { id: 'por-abi', label: 'ABI' },
  { id: 'por-tipo', label: 'Tipo' },
];

const SECONDARY_TABS: TabDefinition[] = [
  { id: 'velocidade', label: 'Velocidade' },
  { id: 'por-periodo', label: 'Periodo' },
  { id: 'por-participantes', label: 'Participantes' },
  { id: 'por-posicao', label: 'Posicao' },
  { id: 'reentradas', label: 'Reentradas' },
];

const SECONDARY_IDS = new Set(SECONDARY_TABS.map(t => t.id));
const ALL_TABS = [...PRIMARY_TABS, ...SECONDARY_TABS];
const TAB_LABEL_MAP = new Map(ALL_TABS.map(t => [t.id, t.label]));

export function getPrimaryTabs(): TabDefinition[] {
  return PRIMARY_TABS.map(t => ({ ...t }));
}

export function getSecondaryTabs(): TabDefinition[] {
  return SECONDARY_TABS.map(t => ({ ...t }));
}

export function getAllTabs(): TabDefinition[] {
  return ALL_TABS.map(t => ({ ...t }));
}

export function isSecondaryTab(tabId: string): boolean {
  return SECONDARY_IDS.has(tabId);
}

export function getTabLabel(tabId: string): string {
  return TAB_LABEL_MAP.get(tabId) || '';
}

export function isValidTab(tabId: string): boolean {
  return TAB_LABEL_MAP.has(tabId);
}
