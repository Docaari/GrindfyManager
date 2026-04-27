import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-3 — Deprecation marker em preparation_logs
//
// Spec : Docs/specs/cooldown-refactor-plan.md (RF-07 + RF-10 deprecation)
// ADR  : Docs/architecture/decisions/042-cooldown-coach-tool-registry.md
//        (Q-Arch-7 — apenas marker @deprecated; NAO drop column)
// Index: Docs/architecture/cooldown-index.md (secao "Modulos backend Sprint
//        Cooldown-3")
//
// Sprint 3 marca campos orfaos como @deprecated. NAO drop column (operacao
// destrutiva exige aprovacao explicita do founder).
//
// Verifica:
//   1. Schema preparationLogs ainda exporta tudo (backward-compat).
//   2. Comentarios @deprecated presentes no SOURCE de shared/schema.ts em
//      postSessionReview, goalsAchieved, lessonsLearned (file read + grep).
//   3. Insert/Select desses campos ainda funciona (schema valido).
//
// IMPORTANT: red phase — Implementer ainda nao adicionou markers; testes 2
// falham por ausencia de comentario @deprecated.
// =============================================================================

import {
  preparationLogs,
  insertPreparationLogSchema,
} from '../../../shared/schema';

const SCHEMA_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'shared',
  'schema.ts',
);

// =============================================================================
// Backward-compat — schema continua exportando
// =============================================================================

describe('preparationLogs — backward compat preservada', () => {
  it('tabela preparationLogs ainda eh exportada', () => {
    expect(preparationLogs).toBeDefined();
  });

  it('insertPreparationLogSchema ainda eh exportado', () => {
    expect(insertPreparationLogSchema).toBeDefined();
    expect(typeof insertPreparationLogSchema.parse).toBe('function');
  });

  it('parse aceita postSessionReview (nao quebrou — somente deprecated)', () => {
    const r = insertPreparationLogSchema.safeParse({
      id: 'pl_x',
      userId: 'USER-0001',
      sessionId: 'sess_x',
      mentalState: 7,
      focusLevel: 7,
      confidenceLevel: 7,
      postSessionReview: 'review legado',
    });
    expect(r.success).toBe(true);
  });

  it('parse aceita lessonsLearned (nao quebrou — somente deprecated)', () => {
    const r = insertPreparationLogSchema.safeParse({
      id: 'pl_y',
      userId: 'USER-0001',
      sessionId: 'sess_y',
      mentalState: 7,
      focusLevel: 7,
      confidenceLevel: 7,
      lessonsLearned: 'licao legada',
    });
    expect(r.success).toBe(true);
  });

  it('parse aceita goalsAchieved (nao quebrou — somente deprecated)', () => {
    const r = insertPreparationLogSchema.safeParse({
      id: 'pl_z',
      userId: 'USER-0001',
      sessionId: 'sess_z',
      mentalState: 7,
      focusLevel: 7,
      confidenceLevel: 7,
      goalsAchieved: true,
    });
    expect(r.success).toBe(true);
  });
});

// =============================================================================
// Marker @deprecated presente em SOURCE
// =============================================================================

describe('preparationLogs — comentario @deprecated presente em shared/schema.ts', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  });

  function findDeprecatedNearField(src: string, fieldName: string): boolean {
    // Busca o campo na definicao da tabela preparation_logs.
    // Heuristica: dentro de uma janela de 200 chars antes da declaracao do campo,
    // procura por "@deprecated" (em comentario JSDoc ou inline //).
    const re = new RegExp(`(${fieldName})\\s*:\\s*(text|boolean)`, 'g');
    const match = re.exec(src);
    if (!match) return false;
    const idx = match.index;
    const window = src.slice(Math.max(0, idx - 200), idx);
    return /@deprecated/i.test(window);
  }

  it('postSessionReview tem marker @deprecated proximo na declaracao', () => {
    expect(findDeprecatedNearField(source, 'postSessionReview')).toBe(true);
  });

  it('goalsAchieved tem marker @deprecated proximo na declaracao', () => {
    expect(findDeprecatedNearField(source, 'goalsAchieved')).toBe(true);
  });

  it('lessonsLearned tem marker @deprecated proximo na declaracao', () => {
    expect(findDeprecatedNearField(source, 'lessonsLearned')).toBe(true);
  });
});
