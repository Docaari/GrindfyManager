import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Testes TDD: Funcoes utilitarias de late registration
//
// Funcoes que AINDA NAO EXISTEM — serao criadas pelo Implementer em:
//   client/src/lib/lateRegUtils.ts (ou similar)
//
// Funcoes a implementar:
//   - calculateLateRegDeadline(startTime: Date, lateRegMinutes: number): Date
//   - formatStack(stack: number | null): string | null
//   - getLateRegColor(minutesRemaining: number): string
//   - getLateRegStatus(minutesRemaining: number): string
//   - resolveAlertThreshold(tournamentOverride: number | null, globalDefault: number): number
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Import das funcoes que AINDA NAO EXISTEM
// ---------------------------------------------------------------------------
import {
  calculateLateRegDeadline,
  formatStack,
  getLateRegColor,
  getLateRegStatus,
  resolveAlertThreshold,
} from '../../../client/src/lib/lateRegUtils';

// =============================================================================
// Grupo 1: calculateLateRegDeadline (RF-05, RF-06)
// =============================================================================

describe('calculateLateRegDeadline', () => {

  it('deve calcular deadline: 19:00 + 60min = 20:00', () => {
    const startTime = new Date('2026-03-19T19:00:00');
    const deadline = calculateLateRegDeadline(startTime, 60);

    expect(deadline.getHours()).toBe(20);
    expect(deadline.getMinutes()).toBe(0);
  });

  it('deve calcular deadline: 19:30 + 90min = 21:00', () => {
    const startTime = new Date('2026-03-19T19:30:00');
    const deadline = calculateLateRegDeadline(startTime, 90);

    expect(deadline.getHours()).toBe(21);
    expect(deadline.getMinutes()).toBe(0);
  });

  it('deve calcular deadline que cruza meia-noite: 23:00 + 120min = 01:00', () => {
    const startTime = new Date('2026-03-19T23:00:00');
    const deadline = calculateLateRegDeadline(startTime, 120);

    expect(deadline.getHours()).toBe(1);
    expect(deadline.getMinutes()).toBe(0);
    // Deve ser dia seguinte
    expect(deadline.getDate()).toBe(20);
  });

  it('deve calcular deadline: 23:30 + 90min = 01:00 (cruza meia-noite)', () => {
    const startTime = new Date('2026-03-19T23:30:00');
    const deadline = calculateLateRegDeadline(startTime, 90);

    expect(deadline.getHours()).toBe(1);
    expect(deadline.getMinutes()).toBe(0);
    expect(deadline.getDate()).toBe(20);
  });

  it('deve retornar Date valido para 0 minutos (deadline = startTime)', () => {
    const startTime = new Date('2026-03-19T19:00:00');
    const deadline = calculateLateRegDeadline(startTime, 0);

    expect(deadline.getTime()).toBe(startTime.getTime());
  });

  it('deve preservar o objeto Date original (nao mutar)', () => {
    const startTime = new Date('2026-03-19T19:00:00');
    const originalTime = startTime.getTime();
    calculateLateRegDeadline(startTime, 60);

    expect(startTime.getTime()).toBe(originalTime);
  });

  it('deve lidar com valores grandes: 19:00 + 300min = 00:00 (dia seguinte)', () => {
    const startTime = new Date('2026-03-19T19:00:00');
    const deadline = calculateLateRegDeadline(startTime, 300);

    expect(deadline.getHours()).toBe(0);
    expect(deadline.getMinutes()).toBe(0);
    expect(deadline.getDate()).toBe(20);
  });
});

// =============================================================================
// Grupo 2: formatStack (RF-04, RF-06)
// =============================================================================

describe('formatStack', () => {

  it('deve formatar 10000 como "10k"', () => {
    expect(formatStack(10000)).toBe('10k');
  });

  it('deve formatar 15000 como "15k"', () => {
    expect(formatStack(15000)).toBe('15k');
  });

  it('deve formatar 5000 como "5k"', () => {
    expect(formatStack(5000)).toBe('5k');
  });

  it('deve formatar 1000 como "1k" (limite exato)', () => {
    expect(formatStack(1000)).toBe('1k');
  });

  it('deve formatar 500 como "500" (abaixo de 1000, sem "k")', () => {
    expect(formatStack(500)).toBe('500');
  });

  it('deve formatar 100 como "100"', () => {
    expect(formatStack(100)).toBe('100');
  });

  it('deve retornar null para stack null', () => {
    expect(formatStack(null)).toBeNull();
  });

  it('deve formatar 2500 como "2.5k" (nao inteiro em milhares)', () => {
    expect(formatStack(2500)).toBe('2.5k');
  });

  it('deve formatar 20000 como "20k"', () => {
    expect(formatStack(20000)).toBe('20k');
  });

  it('deve formatar 999 como "999" (logo abaixo de 1000)', () => {
    expect(formatStack(999)).toBe('999');
  });
});

// =============================================================================
// Grupo 3: getLateRegColor (RF-06)
// =============================================================================

describe('getLateRegColor', () => {

  // -------------------------------------------------------------------------
  // Verde: mais de 30 minutos restantes
  // -------------------------------------------------------------------------
  it('deve retornar "green" quando faltam mais de 30 minutos', () => {
    expect(getLateRegColor(31)).toBe('green');
  });

  it('deve retornar "green" quando faltam 60 minutos', () => {
    expect(getLateRegColor(60)).toBe('green');
  });

  // -------------------------------------------------------------------------
  // Amarelo: entre 10 e 30 minutos (inclusive)
  // -------------------------------------------------------------------------
  it('deve retornar "yellow" quando faltam exatamente 30 minutos (limite)', () => {
    expect(getLateRegColor(30)).toBe('yellow');
  });

  it('deve retornar "yellow" quando faltam 15 minutos', () => {
    expect(getLateRegColor(15)).toBe('yellow');
  });

  it('deve retornar "yellow" quando faltam exatamente 10 minutos (limite)', () => {
    expect(getLateRegColor(10)).toBe('yellow');
  });

  // -------------------------------------------------------------------------
  // Vermelho: menos de 10 minutos e > 0
  // -------------------------------------------------------------------------
  it('deve retornar "red" quando faltam 9 minutos', () => {
    expect(getLateRegColor(9)).toBe('red');
  });

  it('deve retornar "red" quando faltam 5 minutos', () => {
    expect(getLateRegColor(5)).toBe('red');
  });

  it('deve retornar "red" quando falta 1 minuto', () => {
    expect(getLateRegColor(1)).toBe('red');
  });

  // -------------------------------------------------------------------------
  // Encerrado: 0 ou negativo
  // -------------------------------------------------------------------------
  it('deve retornar "expired" quando faltam 0 minutos (encerrado)', () => {
    expect(getLateRegColor(0)).toBe('expired');
  });

  it('deve retornar "expired" quando valor e negativo (ja passou)', () => {
    expect(getLateRegColor(-5)).toBe('expired');
  });
});

// =============================================================================
// Grupo 4: getLateRegStatus — texto descritivo (RF-05, RF-06)
// =============================================================================

describe('getLateRegStatus', () => {

  it('deve retornar texto com minutos restantes quando > 0', () => {
    const status = getLateRegStatus(32);
    expect(status).toContain('32');
    expect(status).toMatch(/faltam|min/i);
  });

  it('deve retornar "Late encerrado" quando minutos <= 0', () => {
    const status = getLateRegStatus(0);
    expect(status).toMatch(/encerrado/i);
  });

  it('deve retornar "Late encerrado" quando minutos sao negativos', () => {
    const status = getLateRegStatus(-10);
    expect(status).toMatch(/encerrado/i);
  });
});

// =============================================================================
// Grupo 5: resolveAlertThreshold — hierarquia de alertas (RF-09)
// =============================================================================

describe('resolveAlertThreshold', () => {

  it('deve usar override do torneio quando != null', () => {
    const threshold = resolveAlertThreshold(5, 10);
    expect(threshold).toBe(5);
  });

  it('deve usar default global quando override e null', () => {
    const threshold = resolveAlertThreshold(null, 10);
    expect(threshold).toBe(10);
  });

  it('deve usar override=1 (minimo permitido)', () => {
    const threshold = resolveAlertThreshold(1, 10);
    expect(threshold).toBe(1);
  });

  it('deve usar override=120 (maximo permitido)', () => {
    const threshold = resolveAlertThreshold(120, 10);
    expect(threshold).toBe(120);
  });

  it('deve usar default=20 quando override e null', () => {
    const threshold = resolveAlertThreshold(null, 20);
    expect(threshold).toBe(20);
  });

  it('deve usar default=30 quando override e null', () => {
    const threshold = resolveAlertThreshold(null, 30);
    expect(threshold).toBe(30);
  });

  it('deve usar override=15 mesmo quando default e diferente (30)', () => {
    const threshold = resolveAlertThreshold(15, 30);
    expect(threshold).toBe(15);
  });
});
