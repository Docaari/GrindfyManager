/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint VR-1 — RF-05: Dead code removal assertions
 *
 * Spec  : Docs/specs/sprint-variance-reform.md (RF-05)
 * ADR   : 211 (variance native monte carlo engine)
 *
 * Purpose: Assert that dead code from the PrimeDope external dependency has
 *          been removed. These tests scan production source files to confirm
 *          absence of specific patterns, classes, functions, and URLs.
 *
 * What should be GONE after RF-05:
 *   - References to primedope.com in production files
 *   - Semaphore class in primedopeIntegration.ts
 *   - Rate limiting functions (checkRateLimit, noteSimulateCall, clearSimulateCall)
 *   - Chart proxy route (GET /chart/:hash)
 *   - Dead constants (CONCURRENT_FETCHES, FETCH_TIMEOUT_MS, etc.)
 *   - Footer "Powered by PrimeDope.com" in PrimedopePanel.tsx
 *
 * What should REMAIN:
 *   - resolveExchangeRates, nativeToUsd, computeInputHash, buildHashableInput
 *   - CACHE_TTL_MS (adjusted to 5min), RETENTION_DAYS
 *   - NETWORK_DEFAULTS_ROI, NETWORK_DEFAULTS_RAKE, etc.
 *
 * Approach: Read source files and assert content absence/presence.
 *
 * Lessons applied:
 *   #3  shape REAL — test actual file content
 *
 * Status RED: All dead code still exists in current codebase.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Read a source file safely. Returns empty string if file doesn't exist
 * (which is acceptable — e.g., if the entire file was deleted).
 */
function readSourceFile(relativePath: string): string {
  const fullPath = path.join(ROOT, relativePath);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    // File deleted entirely is also valid for "dead code removed"
    return '';
  }
}

// ---------------------------------------------------------------------------
// RF-05: Dead code removal assertions
// ---------------------------------------------------------------------------

describe('RF-05 — Dead code removal', () => {
  describe('no references to primedope.com in production files', () => {
    it('primedopeIntegration.ts does not reference primedope.com', () => {
      const content = readSourceFile(
        'server/services/primedopeIntegration.ts'
      );
      expect(content).not.toContain('primedope.com');
      expect(content).not.toContain('PRIMEDOPE_URL');
    });

    it('PrimedopePanel.tsx does not reference primedope.com (no footer)', () => {
      const content = readSourceFile(
        'client/src/components/primedope/PrimedopePanel.tsx'
      );
      expect(content.toLowerCase()).not.toContain('primedope.com');
      expect(content.toLowerCase()).not.toContain('powered by');
    });

    it('no production file under server/ references primedope.com URL', () => {
      const files = [
        'server/services/primedopeIntegration.ts',
        'server/routes/primedope.ts',
        'server/services/primedopeBucketsPrefill.ts',
      ];
      for (const f of files) {
        const content = readSourceFile(f);
        expect(content).not.toContain('primedope.com/prime.php');
        expect(content).not.toContain('www.primedope.com');
      }
    });
  });

  describe('Semaphore class removed', () => {
    it('primedopeIntegration.ts does not contain Semaphore class', () => {
      const content = readSourceFile(
        'server/services/primedopeIntegration.ts'
      );
      expect(content).not.toContain('class Semaphore');
      expect(content).not.toContain('new Semaphore');
    });
  });

  describe('rate limiting removed', () => {
    it('routes/primedope.ts does not contain checkRateLimit', () => {
      const content = readSourceFile('server/routes/primedope.ts');
      expect(content).not.toContain('checkRateLimit');
    });

    it('routes/primedope.ts does not contain noteSimulateCall', () => {
      const content = readSourceFile('server/routes/primedope.ts');
      expect(content).not.toContain('noteSimulateCall');
    });

    it('routes/primedope.ts does not contain clearSimulateCall', () => {
      const content = readSourceFile('server/routes/primedope.ts');
      expect(content).not.toContain('clearSimulateCall');
    });

    it('shared/primedopeDefaults.ts does not export RATE_LIMIT_PER_USER_MS', () => {
      const content = readSourceFile('shared/primedopeDefaults.ts');
      expect(content).not.toContain('RATE_LIMIT_PER_USER_MS');
    });
  });

  describe('chart proxy route removed', () => {
    it('routes/primedope.ts does not register GET /chart/:hash', () => {
      const content = readSourceFile('server/routes/primedope.ts');
      // Should not have a route handler for chart/:hash
      expect(content).not.toMatch(/router\.(get|all)\s*\(\s*['"]\/chart\/:hash['"]/);
      // Also check for getChartFsPath or saveChartFromUrl
      expect(content).not.toContain('getChartFsPath');
    });
  });

  describe('dead constants removed from primedopeDefaults.ts', () => {
    it('does not export CONCURRENT_FETCHES', () => {
      const content = readSourceFile('shared/primedopeDefaults.ts');
      expect(content).not.toContain('CONCURRENT_FETCHES');
    });

    it('does not export FETCH_TIMEOUT_MS', () => {
      const content = readSourceFile('shared/primedopeDefaults.ts');
      expect(content).not.toContain('FETCH_TIMEOUT_MS');
    });

    it('does not export RETRY_BACKOFF_MS', () => {
      const content = readSourceFile('shared/primedopeDefaults.ts');
      expect(content).not.toContain('RETRY_BACKOFF_MS');
    });

    it('does not export RETRY_MAX_ATTEMPTS', () => {
      const content = readSourceFile('shared/primedopeDefaults.ts');
      expect(content).not.toContain('RETRY_MAX_ATTEMPTS');
    });
  });

  describe('dead functions removed from primedopeIntegration.ts', () => {
    it('does not export fetchPrimedopeOnce', () => {
      const content = readSourceFile(
        'server/services/primedopeIntegration.ts'
      );
      expect(content).not.toContain('fetchPrimedopeOnce');
    });

    it('does not export fetchPrimedopeWithRetry', () => {
      const content = readSourceFile(
        'server/services/primedopeIntegration.ts'
      );
      expect(content).not.toContain('fetchPrimedopeWithRetry');
    });

    it('does not export saveChartFromUrl', () => {
      const content = readSourceFile(
        'server/services/primedopeIntegration.ts'
      );
      expect(content).not.toContain('saveChartFromUrl');
    });

    it('does not export getChartFsPath', () => {
      const content = readSourceFile(
        'server/services/primedopeIntegration.ts'
      );
      expect(content).not.toContain('getChartFsPath');
    });
  });

  describe('kept functions still present', () => {
    it('resolveExchangeRates still exists', () => {
      const content = readSourceFile(
        'server/services/primedopeIntegration.ts'
      );
      // If file still exists, these should be present
      if (content.length > 0) {
        expect(content).toContain('resolveExchangeRates');
      }
    });

    it('computeInputHash still exists', () => {
      const content = readSourceFile(
        'server/services/primedopeIntegration.ts'
      );
      if (content.length > 0) {
        expect(content).toContain('computeInputHash');
      }
    });

    it('CACHE_TTL_MS still exists in primedopeDefaults.ts', () => {
      const content = readSourceFile('shared/primedopeDefaults.ts');
      expect(content).toContain('CACHE_TTL_MS');
    });

    it('NETWORK_DEFAULTS_ROI still exists', () => {
      const content = readSourceFile('shared/primedopeDefaults.ts');
      expect(content).toContain('NETWORK_DEFAULTS_ROI');
    });
  });

  describe('CACHE_TTL_MS adjusted to 5 minutes', () => {
    it('CACHE_TTL_MS value is 5 minutes (300000ms)', () => {
      const content = readSourceFile('shared/primedopeDefaults.ts');
      // Check that CACHE_TTL_MS is set to 5 * 60 * 1000 = 300000
      // or expressed as 5 * 60_000 or 300_000
      expect(content).toMatch(
        /CACHE_TTL_MS\s*[:=]\s*(300[_]?000|5\s*\*\s*60\s*\*\s*1000|5\s*\*\s*60_000)/
      );
    });
  });

  describe('AbortController removed from hook', () => {
    it('usePrimedopeSimulation.ts does not reference AbortController', () => {
      const content = readSourceFile(
        'client/src/hooks/usePrimedopeSimulation.ts'
      );
      expect(content).not.toContain('AbortController');
      expect(content).not.toContain('acRef');
    });

    it('usePrimedopeSimulation.ts does not use raw fetch with signal', () => {
      const content = readSourceFile(
        'client/src/hooks/usePrimedopeSimulation.ts'
      );
      expect(content).not.toContain('signal:');
      expect(content).not.toContain('signal :');
    });
  });
});
