// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1 / ADR-188 - displayMode FSM pure transition functions
//
// Spec: Docs/specs/sprint-mini-player-1.md RF-04 + RF-07 + RF-13
// ADR: Docs/architecture/decisions/188-mini-player-displaymode-fsm.md
//
// Target: client/src/lib/audio-engine/displayModeFsm.ts (NAO EXISTE)
//
// Funcoes puras (testaveis sem React):
//   canExpand(current) - true se current !== null
//   nextOnEsc(mode) - expanded -> bar, bar -> hidden, hidden -> hidden
//   nextOnClose(mode) - sempre 'hidden'
//   nextOnPlayTrack(mode) - hidden -> bar, demais preservados
//   nextOnFullscreenEnter(mode) - sempre 'hidden'
//   nextOnFullscreenExit(modeBefore, hasCurrent) - 'bar' se hasCurrent, 'hidden' senao
//
// Roda em projeto "client" (jsdom) por estar em tests/client/mini-player/, mas
// nao usa DOM - puro TS.
// =============================================================================

import { describe, it, expect } from 'vitest';

describe('displayModeFsm pure transitions (ADR-188)', () => {
  describe('canExpand', () => {
    it('retorna true quando current !== null', async () => {
      const { canExpand } = require('@/lib/audio-engine/displayModeFsm');
      expect(canExpand({ source: 'library', trackId: 'x', title: 't' })).toBe(true);
    });

    it('retorna false quando current === null', async () => {
      const { canExpand } = require('@/lib/audio-engine/displayModeFsm');
      expect(canExpand(null)).toBe(false);
    });
  });

  describe('nextOnEsc', () => {
    it('expanded -> bar', async () => {
      const { nextOnEsc } = require('@/lib/audio-engine/displayModeFsm');
      expect(nextOnEsc('expanded')).toBe('bar');
    });

    it('bar -> hidden', async () => {
      const { nextOnEsc } = require('@/lib/audio-engine/displayModeFsm');
      expect(nextOnEsc('bar')).toBe('hidden');
    });

    it('hidden -> hidden (no-op)', async () => {
      const { nextOnEsc } = require('@/lib/audio-engine/displayModeFsm');
      expect(nextOnEsc('hidden')).toBe('hidden');
    });
  });

  describe('nextOnClose', () => {
    it('qualquer estado -> hidden', async () => {
      const { nextOnClose } = require('@/lib/audio-engine/displayModeFsm');
      expect(nextOnClose('hidden')).toBe('hidden');
      expect(nextOnClose('bar')).toBe('hidden');
      expect(nextOnClose('expanded')).toBe('hidden');
    });
  });

  describe('nextOnPlayTrack', () => {
    it('hidden -> bar (auto-show)', async () => {
      const { nextOnPlayTrack } = require('@/lib/audio-engine/displayModeFsm');
      expect(nextOnPlayTrack('hidden')).toBe('bar');
    });

    it('bar -> bar (preserva)', async () => {
      const { nextOnPlayTrack } = require('@/lib/audio-engine/displayModeFsm');
      expect(nextOnPlayTrack('bar')).toBe('bar');
    });

    it('expanded -> expanded (preserva quando troca via LessonPicker)', async () => {
      const { nextOnPlayTrack } = require('@/lib/audio-engine/displayModeFsm');
      expect(nextOnPlayTrack('expanded')).toBe('expanded');
    });
  });

  describe('nextOnFullscreenEnter', () => {
    it('qualquer estado -> hidden (Q-H / D22)', async () => {
      const { nextOnFullscreenEnter } = require('@/lib/audio-engine/displayModeFsm');
      expect(nextOnFullscreenEnter('bar')).toBe('hidden');
      expect(nextOnFullscreenEnter('expanded')).toBe('hidden');
      expect(nextOnFullscreenEnter('hidden')).toBe('hidden');
    });
  });

  describe('nextOnFullscreenExit', () => {
    it('com hasCurrent=true e modeBefore!==hidden -> bar (restore)', async () => {
      const { nextOnFullscreenExit } = require('@/lib/audio-engine/displayModeFsm');
      expect(nextOnFullscreenExit('bar', true)).toBe('bar');
      expect(nextOnFullscreenExit('expanded', true)).toBe('bar');
    });

    it('com hasCurrent=false -> hidden (sem track, nao restora)', async () => {
      const { nextOnFullscreenExit } = require('@/lib/audio-engine/displayModeFsm');
      expect(nextOnFullscreenExit('bar', false)).toBe('hidden');
      expect(nextOnFullscreenExit('expanded', false)).toBe('hidden');
    });

    it('com modeBefore=hidden -> hidden mesmo com current', async () => {
      const { nextOnFullscreenExit } = require('@/lib/audio-engine/displayModeFsm');
      expect(nextOnFullscreenExit('hidden', true)).toBe('hidden');
    });
  });
});
