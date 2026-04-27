import { describe, it, expect } from 'vitest';
import { applyAddonReaAutoDetect } from '../../../server/routes/grade-planner';

// =============================================================================
// Server-side autodetect Plus/ReA — fix B1+B2 (2026-04-27)
//
// Espelha resolveAddonReaPayload do client. Garante que o handler do POST/PUT
// /api/planned-tournaments aplica deteccao por regex no nome quando o caller
// nao envia flag explicita. Reproduz bug do founder: planned criado sem flag
// resultava em session_tournament sem flag -> botao Add-on invisivel.
// =============================================================================

describe('applyAddonReaAutoDetect', () => {
  it('nome "Plus" sem flag -> allowsAddOn=true, addOnCost=buyIn', () => {
    const payload: any = { name: 'Sunday Plus', buyIn: '50' };
    applyAddonReaAutoDetect(payload);
    expect(payload.allowsAddOn).toBe(true);
    expect(payload.addOnCost).toBe('50');
  });

  it('nome "Re-Entry" sem flag -> allowsReentry=true', () => {
    const payload: any = { name: 'Big Re-Entry $100', buyIn: '100' };
    applyAddonReaAutoDetect(payload);
    expect(payload.allowsReentry).toBe(true);
  });

  it('caller envia allowsAddOn=false explicito -> nao sobrescreve', () => {
    const payload: any = { name: 'Sunday Plus', buyIn: '50', allowsAddOn: false };
    applyAddonReaAutoDetect(payload);
    expect(payload.allowsAddOn).toBe(false);
    expect(payload.addOnCost).toBeUndefined();
  });

  it('caller envia allowsAddOn=true e addOnCost custom -> respeita', () => {
    const payload: any = { name: 'Plus', buyIn: '50', allowsAddOn: true, addOnCost: '20' };
    applyAddonReaAutoDetect(payload);
    expect(payload.allowsAddOn).toBe(true);
    expect(payload.addOnCost).toBe('20');
  });

  it('nome neutro nao gera flag', () => {
    const payload: any = { name: 'Daily $5', buyIn: '5' };
    applyAddonReaAutoDetect(payload);
    expect(payload.allowsAddOn).toBeUndefined();
    expect(payload.allowsReentry).toBeUndefined();
  });

  it('nome vazio: no-op', () => {
    const payload: any = { name: '', buyIn: '50' };
    applyAddonReaAutoDetect(payload);
    expect(payload.allowsAddOn).toBeUndefined();
  });

  it('nome ausente: no-op', () => {
    const payload: any = { buyIn: '50' };
    applyAddonReaAutoDetect(payload);
    expect(payload.allowsAddOn).toBeUndefined();
  });

  it('blocklist: "Surplus" nao gera flag (false positive defensivo)', () => {
    const payload: any = { name: 'Surplus Sunday', buyIn: '20' };
    applyAddonReaAutoDetect(payload);
    expect(payload.allowsAddOn).toBeUndefined();
  });

  it('regressao founder: "Plus" Suprema R$15 -> flags propagadas', () => {
    const payload: any = { name: 'Plus', site: 'Suprema', buyIn: '15' };
    applyAddonReaAutoDetect(payload);
    expect(payload.allowsAddOn).toBe(true);
    expect(payload.addOnCost).toBe('15');
  });

  it('Plus sem buyIn -> allowsAddOn=true mas addOnCost permanece unset', () => {
    const payload: any = { name: 'Sunday Plus' };
    applyAddonReaAutoDetect(payload);
    expect(payload.allowsAddOn).toBe(true);
    expect(payload.addOnCost).toBeUndefined();
  });
});
