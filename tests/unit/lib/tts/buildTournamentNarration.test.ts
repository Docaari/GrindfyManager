/**
 * Test-Writer (Modo TDD - Red Phase) — Sprint Alarmes 2.0
 *
 * Spec: Docs/specs/alarmes-2-0-tts.md
 *  - RF-05 Helper de narracao de torneio com redacao binaria (P1-7)
 *  - DP-03 RESOLVIDA: toggle binario sem threshold
 *
 * Modulo testado: client/src/lib/tournamentNarration.ts (NAO existe — red phase)
 *
 * Assinatura esperada:
 *   buildTournamentNarration(
 *     t: { site: string; name: string; buyIn: string },
 *     opts: { redactBuyIn: boolean }
 *   ): string
 *
 * Importante:
 *  - Param `redactThresholdUSD` REMOVIDO em P1-7.
 *  - Helper PURO: nao chama normalizeBuyInToUSD, nao depende de FX.
 */

import { describe, it, expect } from 'vitest';

// Modulo NAO existe — implementer cria.
import { buildTournamentNarration } from '../../../../client/src/lib/tournamentNarration';

describe('buildTournamentNarration (RF-05)', () => {
  describe('Modo normal (redactBuyIn: false)', () => {
    it('formato base: "{site}, {name}, buy-in {valor}"', () => {
      const result = buildTournamentNarration(
        { site: 'Suprema', name: 'Sunday Plus', buyIn: '100' },
        { redactBuyIn: false }
      );
      expect(result).toBe('Suprema, Sunday Plus, buy-in 100');
    });

    it('site WPN + buy-in 55', () => {
      const result = buildTournamentNarration(
        { site: 'WPN', name: 'Loncar', buyIn: '55' },
        { redactBuyIn: false }
      );
      expect(result).toBe('WPN, Loncar, buy-in 55');
    });

    it('site com acento -> preserva caracter especial valido', () => {
      const result = buildTournamentNarration(
        { site: 'Próximo', name: 'Daily Bigode', buyIn: '22' },
        { redactBuyIn: false }
      );
      expect(result).toContain('Próximo');
      expect(result).toContain('Daily Bigode');
      expect(result).toContain('22');
    });
  });

  describe('Modo discreto (P1-7) — redactBuyIn: true', () => {
    it('formato discreto: "{site}, {name}, atencao" — NUNCA narra valor', () => {
      const result = buildTournamentNarration(
        { site: 'Suprema', name: 'Sunday Plus', buyIn: '100' },
        { redactBuyIn: true }
      );
      expect(result).toBe('Suprema, Sunday Plus, atencao');
      expect(result).not.toContain('100');
      expect(result).not.toContain('buy-in');
    });

    it('buyIn 5 (baixo) -> ainda omite valor', () => {
      const result = buildTournamentNarration(
        { site: 'Suprema', name: 'Sunday Plus', buyIn: '5' },
        { redactBuyIn: true }
      );
      expect(result).toBe('Suprema, Sunday Plus, atencao');
      expect(result).not.toMatch(/\b5\b/);
    });

    it('buyIn 215 (alto) -> ainda omite valor', () => {
      const result = buildTournamentNarration(
        { site: 'WPN', name: 'Loncar', buyIn: '215' },
        { redactBuyIn: true }
      );
      expect(result).toBe('WPN, Loncar, atencao');
      expect(result).not.toContain('215');
    });
  });

  describe('Sanitizacao', () => {
    it('remove caracteres < > & (anti-injection visual)', () => {
      const result = buildTournamentNarration(
        { site: 'Suprema', name: '<Sunday> & Plus', buyIn: '100' },
        { redactBuyIn: false }
      );
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('&');
    });

    it('trim de espacos no nome e site', () => {
      const result = buildTournamentNarration(
        { site: '  Suprema  ', name: '  Sunday Plus  ', buyIn: '100' },
        { redactBuyIn: false }
      );
      // Verificar normalizacao — sem leading/trailing spaces.
      expect(result.startsWith(' ')).toBe(false);
      expect(result.endsWith(' ')).toBe(false);
      expect(result).toContain('Suprema, Sunday Plus');
    });

    it('name com mais de 60 chars truncado em 60 + "..."', () => {
      const longName =
        'Tournament Name That Is Way Too Long For Comfortable TTS Narration In Five Seconds Limit';
      expect(longName.length).toBeGreaterThan(60);

      const result = buildTournamentNarration(
        { site: 'Suprema', name: longName, buyIn: '100' },
        { redactBuyIn: false }
      );

      // Truncamento deve aparecer.
      expect(result).toContain('...');
      // Nao deve conter o nome inteiro.
      expect(result).not.toContain(longName);
    });
  });

  describe('Edge cases (formato variado de buyIn)', () => {
    it('buyIn "100" (numero puro)', () => {
      const result = buildTournamentNarration(
        { site: 'A', name: 'B', buyIn: '100' },
        { redactBuyIn: false }
      );
      expect(result).toContain('100');
    });

    it('buyIn "100.00" (decimais)', () => {
      const result = buildTournamentNarration(
        { site: 'A', name: 'B', buyIn: '100.00' },
        { redactBuyIn: false }
      );
      // Helper deve produzir narracao com algum representante do valor (nao crashar).
      expect(result).toMatch(/buy-in/);
      expect(result.length).toBeGreaterThan(0);
    });

    it('buyIn vazio + modo normal -> narracao sem buy-in (so site + name)', () => {
      const result = buildTournamentNarration(
        { site: 'Suprema', name: 'Sunday Plus', buyIn: '' },
        { redactBuyIn: false }
      );
      // Sem buy-in mencionado — fallback para "{site}, {name}".
      expect(result).toContain('Suprema');
      expect(result).toContain('Sunday Plus');
      expect(result).not.toMatch(/buy-in\s*$/);
    });

    it('name vazio + modo normal -> fallback "Torneio"', () => {
      const result = buildTournamentNarration(
        { site: 'Suprema', name: '', buyIn: '100' },
        { redactBuyIn: false }
      );
      expect(result).toContain('Torneio');
    });
  });
});
