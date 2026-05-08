/**
 * Test-Writer (Modo TDD - Red Phase / Caracterizacao)
 *
 * Sprint Estudos-Habito-1 — ADR-127 curated themes seed
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-3.3
 * ADR  : 127
 *
 * Cobertura:
 *   - CURATED_STUDY_THEMES export tem 30 entries
 *   - Por categoria: preflop=8, postflop=8, icm=6, mental=5, specific=3
 *   - Cada tema tem slug unico (kebab-case)
 *   - Cada tema com category enum valido
 *   - linkedStats: array de strings (pode ser vazio)
 *   - linkedLessonSlugs: array de strings
 *   - Slugs unicos cross-categoria (sem duplicate global)
 *   - Mental themes tem heavy linkedLessons (Bloco A integration)
 *
 * Status: Caracterizacao (file ja existe). Documenta o que foi entregue.
 */

import { describe, it, expect } from 'vitest';

import {
  CURATED_STUDY_THEMES,
  CURATED_STUDY_THEMES_BY_CATEGORY,
} from '../../server/seeds/study-themes-seed';

describe('Curated themes seed (ADR-127)', () => {
  it('exporta 30 themes total', () => {
    expect(CURATED_STUDY_THEMES).toHaveLength(30);
  });

  it('preflop tem 8 themes', () => {
    expect(CURATED_STUDY_THEMES_BY_CATEGORY.preflop).toHaveLength(8);
  });

  it('postflop tem 8 themes', () => {
    expect(CURATED_STUDY_THEMES_BY_CATEGORY.postflop).toHaveLength(8);
  });

  it('icm tem 6 themes', () => {
    expect(CURATED_STUDY_THEMES_BY_CATEGORY.icm).toHaveLength(6);
  });

  it('mental tem 5 themes', () => {
    expect(CURATED_STUDY_THEMES_BY_CATEGORY.mental).toHaveLength(5);
  });

  it('specific tem 3 themes', () => {
    expect(CURATED_STUDY_THEMES_BY_CATEGORY.specific).toHaveLength(3);
  });

  it('cada theme tem slug em kebab-case (lower + dashes)', () => {
    for (const t of CURATED_STUDY_THEMES) {
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('todos slugs sao unicos cross-categoria', () => {
    const slugs = CURATED_STUDY_THEMES.map((t) => t.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('todos themes tem category valida no enum', () => {
    const validCategories = new Set(['preflop', 'postflop', 'icm', 'mental', 'specific']);
    for (const t of CURATED_STUDY_THEMES) {
      expect(validCategories.has(t.category)).toBe(true);
    }
  });

  it('todos themes tem linkedStats array (pode ser vazio)', () => {
    for (const t of CURATED_STUDY_THEMES) {
      expect(Array.isArray(t.linkedStats)).toBe(true);
    }
  });

  it('todos themes tem linkedLessonSlugs array', () => {
    for (const t of CURATED_STUDY_THEMES) {
      expect(Array.isArray(t.linkedLessonSlugs)).toBe(true);
    }
  });

  it('Mental themes tem >=1 linkedLessonSlug (integracao Bloco A)', () => {
    for (const t of CURATED_STUDY_THEMES_BY_CATEGORY.mental) {
      expect(t.linkedLessonSlugs.length).toBeGreaterThan(0);
    }
  });

  it('ICM themes tem >=1 linkedStat (auto-suggest base)', () => {
    for (const t of CURATED_STUDY_THEMES_BY_CATEGORY.icm) {
      expect(t.linkedStats.length).toBeGreaterThan(0);
    }
  });

  it('cada theme tem name nao-vazio em PT-BR', () => {
    for (const t of CURATED_STUDY_THEMES) {
      expect(t.name).toBeTruthy();
      expect(t.name.length).toBeGreaterThan(0);
    }
  });

  it('cada theme tem color hex 7 chars', () => {
    for (const t of CURATED_STUDY_THEMES) {
      expect(t.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('icm-bubble-play existe e tem linkedLessonSlugs apontando para a6 ou similar', () => {
    const icmBubble = CURATED_STUDY_THEMES.find((t) => t.slug === 'icm-bubble-play');
    expect(icmBubble).toBeDefined();
    expect(icmBubble?.category).toBe('icm');
    expect(icmBubble?.linkedLessonSlugs.length).toBeGreaterThan(0);
  });
});
