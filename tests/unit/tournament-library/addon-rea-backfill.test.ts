import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Backfill de Add-on/ReA (Spec 1 §4.2)
//
// Script esperado: server/scripts/backfill-addon-rea.ts (nao existe ainda).
//
// Funcao pura esperada (exposta para teste):
//   detectAddonReaFromName(name: string): {
//     allowsAddOn: boolean;
//     allowsReentry: boolean;
//   }
//
// O script de SQL pode ser testado em integracao separadamente; aqui
// testamos a funcao pura que eh usada pelo script E pelo parser E pela
// integracao Suprema (convergencia em um unico ponto).
//
// Regex expected:
//   PLUS_REGEX = /(?<![A-Za-z])plus(?![A-Za-z])|\+\s*add[- ]?on/i
//   REA_REGEX  = /(?<![A-Za-z])(re[- ]?entry|re[- ]?entries|rea|r\/a|reentry)(?![A-Za-z])/i
//
// Blocklist de falsos positivos:
//   - ExpressPlus, Surplus, APlus, PLUSone -> allowsAddOn=false
//
// Modo: TDD - funcao nao existe.
// =============================================================================

// Helpers criados pelo Implementer em shared/addon-rea-detector.ts
import {
  detectAddonReaFromName,
  shouldBackfillRecord,
} from '../../../shared/addon-rea-detector';

// ===========================================================================
// Deteccao de Plus
// ===========================================================================

describe('detectAddonReaFromName - Plus (add-on)', () => {
  it('detecta Plus isolado no inicio', () => {
    const r = detectAddonReaFromName('Plus Sunday $22');
    expect(r.allowsAddOn).toBe(true);
  });

  it('detecta Plus no final', () => {
    const r = detectAddonReaFromName('$22 Deep Plus');
    expect(r.allowsAddOn).toBe(true);
  });

  it('detecta Plus no meio', () => {
    const r = detectAddonReaFromName('Big Plus Sunday $22');
    expect(r.allowsAddOn).toBe(true);
  });

  it('detecta "plus" case-insensitive', () => {
    const r = detectAddonReaFromName('plus daily $22');
    expect(r.allowsAddOn).toBe(true);
  });

  it('detecta "PLUS" maiusculo', () => {
    const r = detectAddonReaFromName('PLUS Championship $100');
    expect(r.allowsAddOn).toBe(true);
  });

  it('detecta "+ add-on" pattern alternativo', () => {
    const r = detectAddonReaFromName('$55 Tournament + Add-on');
    expect(r.allowsAddOn).toBe(true);
  });

  it('detecta "+ Addon" pattern alternativo (sem hifen)', () => {
    const r = detectAddonReaFromName('Sunday Main + Addon $109');
    expect(r.allowsAddOn).toBe(true);
  });

  it('NAO detecta em "Surplus Championship"', () => {
    const r = detectAddonReaFromName('Surplus Championship $50');
    expect(r.allowsAddOn).toBe(false);
  });

  it('NAO detecta em "ExpressPLUS"', () => {
    const r = detectAddonReaFromName('ExpressPLUS $11');
    expect(r.allowsAddOn).toBe(false);
  });

  it('NAO detecta em "APlus"', () => {
    const r = detectAddonReaFromName('APlus Arena $55');
    expect(r.allowsAddOn).toBe(false);
  });

  it('NAO detecta em "PLUSone"', () => {
    const r = detectAddonReaFromName('PLUSone Challenge $22');
    expect(r.allowsAddOn).toBe(false);
  });

  it('NAO detecta em nome neutro "Super Tuesday"', () => {
    const r = detectAddonReaFromName('Super Tuesday $109');
    expect(r.allowsAddOn).toBe(false);
  });

  it('nome vazio retorna false', () => {
    const r = detectAddonReaFromName('');
    expect(r.allowsAddOn).toBe(false);
  });
});

// ===========================================================================
// Deteccao de ReA
// ===========================================================================

describe('detectAddonReaFromName - Re-Entry (ReA)', () => {
  it('detecta "Re-Entry" com hifen', () => {
    const r = detectAddonReaFromName('Re-Entry Masters $22');
    expect(r.allowsReentry).toBe(true);
  });

  it('detecta "Re Entry" com espaco', () => {
    const r = detectAddonReaFromName('Re Entry Sunday $22');
    expect(r.allowsReentry).toBe(true);
  });

  it('detecta "Reentry" colado', () => {
    const r = detectAddonReaFromName('Daily Reentry $11');
    expect(r.allowsReentry).toBe(true);
  });

  it('detecta "Re-Entries" plural', () => {
    const r = detectAddonReaFromName('PKO 3 Re-Entries $22');
    expect(r.allowsReentry).toBe(true);
  });

  it('detecta "ReA"', () => {
    const r = detectAddonReaFromName('Bounty Builder ReA $22');
    expect(r.allowsReentry).toBe(true);
  });

  it('detecta "R/A"', () => {
    const r = detectAddonReaFromName('Sunday Grind R/A $55');
    expect(r.allowsReentry).toBe(true);
  });

  it('case-insensitive para "re-entry"', () => {
    const r = detectAddonReaFromName('daily re-entry $11');
    expect(r.allowsReentry).toBe(true);
  });

  it('NAO detecta em "Really"', () => {
    const r = detectAddonReaFromName('Really Big Sunday $109');
    expect(r.allowsReentry).toBe(false);
  });

  it('NAO detecta em "Reality"', () => {
    const r = detectAddonReaFromName('Reality Check $11');
    expect(r.allowsReentry).toBe(false);
  });

  it('NAO detecta em "Area"', () => {
    const r = detectAddonReaFromName('Area 51 Special $22');
    expect(r.allowsReentry).toBe(false);
  });

  it('NAO detecta em nome neutro', () => {
    const r = detectAddonReaFromName('Super Tuesday $109');
    expect(r.allowsReentry).toBe(false);
  });
});

// ===========================================================================
// Combinacoes
// ===========================================================================

describe('detectAddonReaFromName - combinacoes', () => {
  it('Plus + ReA no mesmo nome', () => {
    const r = detectAddonReaFromName('Plus Re-Entry Sunday $22');
    expect(r.allowsAddOn).toBe(true);
    expect(r.allowsReentry).toBe(true);
  });

  it('nome totalmente neutro: ambos false', () => {
    const r = detectAddonReaFromName('Daily Grind $22');
    expect(r.allowsAddOn).toBe(false);
    expect(r.allowsReentry).toBe(false);
  });

  it('ExpressPLUS (falso positivo Plus) + ReA real', () => {
    // ExpressPLUS eh blocklist, mas ReA eh real
    const r = detectAddonReaFromName('ExpressPLUS Re-Entry $11');
    expect(r.allowsAddOn).toBe(false);
    expect(r.allowsReentry).toBe(true);
  });

  it('Plus real + Area (falso positivo ReA)', () => {
    const r = detectAddonReaFromName('Plus Area 51 Championship $22');
    expect(r.allowsAddOn).toBe(true);
    expect(r.allowsReentry).toBe(false);
  });
});

// ===========================================================================
// Idempotencia do backfill
// ===========================================================================

describe('shouldBackfillRecord - idempotencia', () => {
  it('deve atualizar quando allowsAddOn e undefined e nome tem Plus', () => {
    const r = shouldBackfillRecord({
      name: 'Plus Sunday $22',
      allowsAddOn: undefined,
    });
    expect(r.shouldUpdateAddOn).toBe(true);
  });

  it('NAO deve atualizar quando allowsAddOn ja e true (preserva dado explicito)', () => {
    const r = shouldBackfillRecord({
      name: 'Plus Sunday $22',
      allowsAddOn: true,
    });
    expect(r.shouldUpdateAddOn).toBe(false);
  });

  it('DEVE atualizar quando allowsAddOn e false (default do DB) e nome tem Plus', () => {
    // Spec 1 §4.2 SQL: `WHERE allows_addon IS NOT TRUE` — false/null sao backfilled.
    // Apos db:push, todas as linhas existentes tem o default false; se
    // distinguissemos "false explicito do usuario" de "default do DB" pulariamos
    // 100% do backfill inicial, que e o caso de uso principal do script.
    // Trade-off aceito: re-rodar o backfill pode reativar flags que usuario
    // manualmente desmarcou em torneios cujo nome casa com o regex.
    const r = shouldBackfillRecord({
      name: 'Plus Sunday $22',
      allowsAddOn: false,
    });
    expect(r.shouldUpdateAddOn).toBe(true);
  });

  it('NAO deve atualizar quando nome nao casa com padroes', () => {
    const r = shouldBackfillRecord({
      name: 'Super Tuesday $109',
      allowsAddOn: undefined,
    });
    expect(r.shouldUpdateAddOn).toBe(false);
  });

  it('ReA: NAO deve atualizar quando allowsReentry ja e true', () => {
    const r = shouldBackfillRecord({
      name: 'Re-Entry Masters',
      allowsReentry: true,
    });
    expect(r.shouldUpdateReentry).toBe(false);
  });

  it('ReA: deve atualizar quando allowsReentry e undefined e nome casa', () => {
    const r = shouldBackfillRecord({
      name: 'Re-Entry Masters $22',
      allowsReentry: undefined,
    });
    expect(r.shouldUpdateReentry).toBe(true);
  });
});
