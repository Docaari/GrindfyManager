import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint Flight-1 — RF-05: detectFlightCandidate helper
//
// Spec : Docs/specs/sprint-flight-1.md (RF-05, D7)
// ADR  : 090 (helper alimenta auto-link RF-08 e modal RF-09)
//
// Localizacao esperada: server/csvParser.ts OU server/flightDetector.ts.
// Implementer escolhe; teste importa do caminho dedicado novo.
//
// Contrato (D7):
//   detectFlightCandidate(name: string | null | undefined): {
//     isFlightCandidate: boolean;
//     baseName: string;
//     flightDay: string | null;
//   }
//
// Regex base (case-insensitive):
//   \b(flight|phase|stage|day\s*1[a-z]?|\b1[a-z]\b)\b
// =============================================================================

import { detectFlightCandidate } from '../../../server/flightDetector';

describe('detectFlightCandidate — happy paths (RF-05)', () => {
  it('detecta "Day 1A" como flight candidate', () => {
    const r = detectFlightCandidate('Sunday Million Phased Day 1A — $215');
    expect(r.isFlightCandidate).toBe(true);
    expect(r.flightDay).toMatch(/1A/i);
    expect(r.baseName).toContain('Sunday Million Phased');
  });

  it('detecta "Day 1B" como flight candidate', () => {
    const r = detectFlightCandidate('Sunday Million Phased Day 1B — $215');
    expect(r.isFlightCandidate).toBe(true);
    expect(r.flightDay).toMatch(/1B/i);
  });

  it('detecta "1A" sem prefixo Day como flight candidate', () => {
    const r = detectFlightCandidate('Bigger $109 1A');
    expect(r.isFlightCandidate).toBe(true);
  });

  it('detecta "1C" sem prefixo Day como flight candidate', () => {
    const r = detectFlightCandidate('Bigger $109 1C');
    expect(r.isFlightCandidate).toBe(true);
  });

  it('detecta "Phase 1" como flight candidate', () => {
    const r = detectFlightCandidate('Bigger $109 Phase 1');
    expect(r.isFlightCandidate).toBe(true);
  });

  it('detecta "Phase 2" como flight candidate', () => {
    const r = detectFlightCandidate('Bigger $109 Phase 2');
    expect(r.isFlightCandidate).toBe(true);
  });

  it('detecta "Stage 1" como flight candidate', () => {
    const r = detectFlightCandidate('Venom Stage 1');
    expect(r.isFlightCandidate).toBe(true);
  });

  it('detecta "Stage 3" como flight candidate', () => {
    const r = detectFlightCandidate('Venom Stage 3');
    expect(r.isFlightCandidate).toBe(true);
  });

  it('detecta "Flight 3" como flight candidate', () => {
    const r = detectFlightCandidate('WPT Online Flight 3');
    expect(r.isFlightCandidate).toBe(true);
  });

  it('detecta "Day 2" como flight candidate (necessario para auto-link RF-08)', () => {
    const r = detectFlightCandidate('Sunday Million Phased Day 2 — $215');
    expect(r.isFlightCandidate).toBe(true);
    expect(r.flightDay).toMatch(/Day\s*2|2/i);
  });

  it('case-insensitive: "PHASE 1" funciona', () => {
    const r = detectFlightCandidate('BIG GAME PHASE 1');
    expect(r.isFlightCandidate).toBe(true);
  });

  it('case-insensitive: "phased day 1a" funciona', () => {
    const r = detectFlightCandidate('sunday million phased day 1a');
    expect(r.isFlightCandidate).toBe(true);
  });
});

describe('detectFlightCandidate — false negatives (NAO sao flight)', () => {
  it('"Sunday $5 Bounty Hunter" -> NAO eh flight', () => {
    const r = detectFlightCandidate('Sunday $5 Bounty Hunter');
    expect(r.isFlightCandidate).toBe(false);
    expect(r.flightDay).toBeNull();
  });

  it('"Bigger $33" -> NAO eh flight', () => {
    const r = detectFlightCandidate('Bigger $33');
    expect(r.isFlightCandidate).toBe(false);
  });

  it('"WCOOP Main" -> NAO eh flight (sem keyword)', () => {
    const r = detectFlightCandidate('WCOOP Main Event');
    expect(r.isFlightCandidate).toBe(false);
  });
});

describe('detectFlightCandidate — false positives possiveis (modal interativo trata)', () => {
  // Ver D7: sao falsos positivos esperados; sistema mostra modal e founder
  // marca "nao eh flight". Aqui apenas documentamos o comportamento.
  it('"Day 1 of the Year Freeroll" PODE disparar (D7 — false positive aceitavel)', () => {
    const r = detectFlightCandidate('Day 1 of the Year Freeroll');
    // Documentamos o output atual do regex sem julgar:
    expect(typeof r.isFlightCandidate).toBe('boolean');
  });

  it('"Stage Hands Open" PODE disparar (D7 — false positive aceitavel)', () => {
    const r = detectFlightCandidate('Stage Hands Open');
    expect(typeof r.isFlightCandidate).toBe('boolean');
  });
});

describe('detectFlightCandidate — extracao de baseName', () => {
  it('"Sunday Million Phased Day 1A — $215" -> baseName="Sunday Million Phased"', () => {
    const r = detectFlightCandidate('Sunday Million Phased Day 1A — $215');
    expect(r.baseName.trim()).toBe('Sunday Million Phased');
  });

  it('"Bigger $109 Phase 1" -> baseName="Bigger $109"', () => {
    const r = detectFlightCandidate('Bigger $109 Phase 1');
    expect(r.baseName.trim()).toBe('Bigger $109');
  });

  it('"Venom Stage 3" -> baseName="Venom"', () => {
    const r = detectFlightCandidate('Venom Stage 3');
    expect(r.baseName.trim()).toBe('Venom');
  });

  it('"Sunday $5 Bounty Hunter" (nao flight) -> baseName preserva nome', () => {
    const r = detectFlightCandidate('Sunday $5 Bounty Hunter');
    expect(r.baseName).toBe('Sunday $5 Bounty Hunter');
  });
});

describe('detectFlightCandidate — edge cases (RF-05)', () => {
  it('nome vazio retorna {isFlightCandidate:false, baseName:"", flightDay:null}', () => {
    const r = detectFlightCandidate('');
    expect(r.isFlightCandidate).toBe(false);
    expect(r.baseName).toBe('');
    expect(r.flightDay).toBeNull();
  });

  it('nome null retorna {isFlightCandidate:false, baseName:"", flightDay:null}', () => {
    const r = detectFlightCandidate(null as any);
    expect(r.isFlightCandidate).toBe(false);
    expect(r.baseName).toBe('');
    expect(r.flightDay).toBeNull();
  });

  it('nome undefined retorna {isFlightCandidate:false, baseName:"", flightDay:null}', () => {
    const r = detectFlightCandidate(undefined as any);
    expect(r.isFlightCandidate).toBe(false);
    expect(r.baseName).toBe('');
    expect(r.flightDay).toBeNull();
  });

  it('multiplos matches captura primeiro flightDay', () => {
    const r = detectFlightCandidate('Sunday Phase 1 Stage 2');
    expect(r.isFlightCandidate).toBe(true);
    expect(r.flightDay).toMatch(/Phase 1|1/i);
  });

  it('nome com acentos/unicode funciona (regex unicode-safe)', () => {
    const r = detectFlightCandidate('Phased Brasileirão Day 1A');
    expect(r.isFlightCandidate).toBe(true);
  });

  it('keyword com whitespace inconsistente: "Day1A" (sem espaco)', () => {
    const r = detectFlightCandidate('Sunday Million Phased Day1A');
    expect(r.isFlightCandidate).toBe(true);
  });

  it('keyword com whitespace inconsistente: "Day  1A" (multiplos espacos)', () => {
    const r = detectFlightCandidate('Sunday Million Phased Day  1A');
    expect(r.isFlightCandidate).toBe(true);
  });
});

describe('detectFlightCandidate — performance (regex compilado)', () => {
  it('1000 invocacoes em < 100ms (regex pre-compilado)', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      detectFlightCandidate('Sunday Million Phased Day 1A');
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
