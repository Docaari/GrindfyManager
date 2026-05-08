/**
 * Sprint Themes-V2 (2026-05-08) — caracterizacao do catalog v2
 *
 * Spec : taxonomia v2 de 20 temas / 3 categorias (preflop/postflop/multiway)
 * ADR  : 127 (refactored)
 *
 * Cobertura:
 *   - CURATED_STUDY_THEMES export tem 20 entries
 *   - Por categoria: preflop=8, postflop=9, multiway=3
 *   - Cada tema tem slug unico kebab-case + name PT-BR + color hex
 *   - Cada tema com category enum valido (preflop|postflop|multiway)
 *   - LEGACY_CURATED_SLUGS_V1 com 30 slugs antigos (referencia migration 0059)
 */

import { describe, it, expect } from 'vitest';

import {
  CURATED_STUDY_THEMES,
  CURATED_STUDY_THEMES_BY_CATEGORY,
  LEGACY_CURATED_SLUGS_V1,
} from '../../server/seeds/study-themes-seed';

describe('Curated themes seed v2', () => {
  it('exporta 20 themes total', () => {
    expect(CURATED_STUDY_THEMES).toHaveLength(20);
  });

  it('preflop tem 8 themes', () => {
    expect(CURATED_STUDY_THEMES_BY_CATEGORY.preflop).toHaveLength(8);
  });

  it('postflop tem 9 themes', () => {
    expect(CURATED_STUDY_THEMES_BY_CATEGORY.postflop).toHaveLength(9);
  });

  it('multiway tem 3 themes', () => {
    expect(CURATED_STUDY_THEMES_BY_CATEGORY.multiway).toHaveLength(3);
  });

  it('cada theme tem slug em kebab-case', () => {
    for (const t of CURATED_STUDY_THEMES) {
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('todos slugs sao unicos cross-categoria', () => {
    const slugs = CURATED_STUDY_THEMES.map((t) => t.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('todos themes tem category valida no enum v2', () => {
    const validCategories = new Set(['preflop', 'postflop', 'multiway']);
    for (const t of CURATED_STUDY_THEMES) {
      expect(validCategories.has(t.category)).toBe(true);
    }
  });

  it('todos themes tem linkedStats array', () => {
    for (const t of CURATED_STUDY_THEMES) {
      expect(Array.isArray(t.linkedStats)).toBe(true);
    }
  });

  it('todos themes tem linkedLessonSlugs array', () => {
    for (const t of CURATED_STUDY_THEMES) {
      expect(Array.isArray(t.linkedLessonSlugs)).toBe(true);
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

  it('preflop-rfi existe e tem >=1 linkedStat', () => {
    const rfi = CURATED_STUDY_THEMES.find((t) => t.slug === 'preflop-rfi');
    expect(rfi).toBeDefined();
    expect(rfi?.category).toBe('preflop');
    expect(rfi?.linkedStats.length).toBeGreaterThan(0);
  });

  it('postflop-srp-ip-vs-bb existe', () => {
    const t = CURATED_STUDY_THEMES.find((x) => x.slug === 'postflop-srp-ip-vs-bb');
    expect(t).toBeDefined();
    expect(t?.category).toBe('postflop');
  });

  it('multiway-bb-oop existe e tem linkedStats threeway_bb group', () => {
    const t = CURATED_STUDY_THEMES.find((x) => x.slug === 'multiway-bb-oop');
    expect(t).toBeDefined();
    expect(t?.category).toBe('multiway');
    expect(t?.linkedStats).toContain('bb_defense_3way');
  });

  it('LEGACY_CURATED_SLUGS_V1 tem 30 slugs antigos (referencia soft-drop)', () => {
    expect(LEGACY_CURATED_SLUGS_V1).toHaveLength(30);
    expect(LEGACY_CURATED_SLUGS_V1).toContain('preflop-rfi-tight');
    expect(LEGACY_CURATED_SLUGS_V1).toContain('mental-tilt-control');
    expect(LEGACY_CURATED_SLUGS_V1).toContain('icm-bubble-play');
  });
});
