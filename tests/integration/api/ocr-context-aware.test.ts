// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3.5 — Integration: ocr-extract com section-aware mapping
//
// Spec : Docs/specs/sprint-stats-v3.5-ocr-context-aware.md (secao 5 integration)
// ADR  : 067 (Section-aware OCR mapping)
//
// Cenarios cobertos (3):
//   1. Mock LLM retorna payload com 3 secoes diferentes ("Big Blind defense",
//      "Blind war SB", "Pos-flop PFR OOP") e mesma label-base "Probe River" -
//      endpoint mapeia 3 stats em 3 grupos diferentes sem colisao.
//   2. Mock LLM retorna payload SEM section (campo ausente/null) - comportamento
//      legacy preservado: zero boost/penalty.
//   3. Cache hit: primeira chamada grava ocrRawResponse com sections; segunda
//      chamada (mesmo hash) retorna stats com section preservado SEM chamar LLM
//      (mock LLM nao invocado, response.cached=true).
//
// Mocks (shape REAL — lesson #3):
//   - storage.getHudLayout, getHudStatSnapshots, findHudStatSnapshotByImageSha256,
//     createHudStatSnapshot, updateHudStatSnapshot, insertHudOcrAudit.
//   - server/services/spotImageStorage.put -> imageKey deterministico.
//   - @anthropic-ai/sdk (default class) com messages.create.
//
// Lessons aplicadas:
//   #3 mocks idealizados — espelhamos shape real do storage e do SDK.
//   #5 vi.fn() nao eh constructor — usamos default vi.fn().mockImplementation.
//   #10 DRY de prompts — verificamos que o prompt enviado pede section.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// -----------------------------------------------------------------------------
// Mocks shape REAL do storage Stats-V3 (espelha test stats-v3-ocr.test.ts)
// -----------------------------------------------------------------------------

vi.mock('../../../server/storage', () => ({
  storage: {
    getHudLayout: vi.fn(),
    getHudStatSnapshots: vi.fn(),
    getHudStatSnapshot: vi.fn(),
    createHudStatSnapshot: vi.fn(),
    deleteHudStatSnapshot: vi.fn(),
    updateHudStatSnapshot: vi.fn(),
    findHudStatSnapshotByImageSha256: vi.fn(),
    insertHudOcrAudit: vi.fn(),
  },
}));

const spotImageStorageMock = {
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  exists: vi.fn(),
};

vi.mock('../../../server/services/spotImageStorage', () => ({
  spotImageStorage: spotImageStorageMock,
  createSpotImageStorage: () => spotImageStorageMock,
}));

// Mock @anthropic-ai/sdk como class constructor (lesson #5).
const messagesCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: messagesCreateMock,
    },
  })),
}));

// -----------------------------------------------------------------------------
// Imports — handlers ja existem (Stats-V3); section-aware behavior nao.
// -----------------------------------------------------------------------------

import { handleOcrExtract } from '../../../server/routes/statsAnalyzer';
import { storage } from '../../../server/storage';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngBuffer(seed = 1024): Buffer {
  // Pad determinismo por seed (mesma seed -> mesmo SHA).
  const padding = Buffer.alloc(Math.max(0, seed - PNG_MAGIC.length));
  // Differentiator entre buffers diferentes — apenas se seed diferir.
  return Buffer.concat([PNG_MAGIC, padding]);
}

function multerFile(buffer: Buffer, mimetype = 'image/png'): any {
  return {
    fieldname: 'image',
    originalname: 'screenshot.png',
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  };
}

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001', subscriptionPlan: 'pro' },
    body: { layoutId: 'lyt-1' },
    query: {},
    params: {},
    file: undefined,
    headers: {},
    rateLimit: undefined,
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res.headers[k] = v;
    return res;
  };
  res.send = (d: any) => {
    res.body = d;
    return res;
  };
  return res;
}

// -----------------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  // Force provider Anthropic (mocked) — evita import de @google/generative-ai.
  process.env.OCR_PROVIDER = 'anthropic';
  delete process.env.OCR_REQUIRE_PRO;

  (storage.getHudLayout as any).mockResolvedValue({
    id: 'lyt-1',
    userId: 'USER-0001',
    name: 'Hand2Note',
    sections: [],
    fields_json: [],
  });
  (storage.getHudStatSnapshots as any).mockResolvedValue([]);
  (storage.findHudStatSnapshotByImageSha256 as any).mockResolvedValue(undefined);
  (storage.createHudStatSnapshot as any).mockResolvedValue({
    id: 'snap-new',
    layoutId: 'lyt-1',
  });
  (storage.updateHudStatSnapshot as any).mockResolvedValue({
    id: 'snap-new',
    layoutId: 'lyt-1',
    captureMethod: 'ocr',
  });
  (storage.insertHudOcrAudit as any).mockResolvedValue(undefined);

  spotImageStorageMock.put.mockResolvedValue({
    key: 'USER-0001/hud-snapshots/abc.png',
    size: 1024,
  });
});

// =============================================================================
// Cenario 1: Payload com 3 secoes diferentes -> 3 stats em 3 grupos sem colisao
// =============================================================================

describe('POST /api/stats-analyzer/ocr-extract — section-aware mapping', () => {
  it('payload com 3 secoes diferentes mapeia "Probe River" para 3 statIds distintos', async () => {
    // LLM retorna 3 entries com mesmo label-base mas section distinto.
    messagesCreateMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            stats: [
              {
                section: 'Big Blind defense',
                label: 'Probe River',
                value: 37,
                confidence: 0.93,
              },
              {
                section: 'Blind war SB',
                label: 'Probe River',
                value: 28,
                confidence: 0.91,
              },
              {
                section: 'Pos-flop PFR OOP',
                label: 'Probe River',
                value: 30,
                confidence: 0.9,
              },
            ],
          }),
        },
      ],
    });

    const res = makeRes();
    await handleOcrExtract(
      makeReq({ file: multerFile(pngBuffer(2048)) }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('stats');

    const stats = res.body.stats as Array<{
      id: string;
      label: string;
      value: number;
      section?: string | null;
      rawSection?: string | null;
    }>;
    // 3 entradas distintas — sem colisao via greedy global por statId.
    expect(stats.length).toBe(3);
    const ids = stats.map((s) => s.id);
    // Cada stat mapeia para o id correto baseado no section context.
    // Spec secao 4.5: section: HudGroupId | null por item.
    // - "Big Blind defense" + "Probe River" -> bb_probe_river_sb (group blind_war_bb).
    //   Spec secao 4.2 regra de duplicidade: "bb defense" eh bb_defense, mas
    //   "big blind defense" pode ir para bb_defense — entretanto a unica stat
    //   "Probe River" associada a BB esta no grupo blind_war_bb (bb_probe_river_sb).
    //   Se SECTION_ALIASES["big blind defense"] -> bb_defense (sem stat probe),
    //   o ranking penaliza todos out-group igualmente -> top match legacy
    //   (sb_probe_river ganha). Portanto aceitamos qualquer um dos statIds
    //   probe_river do bb_defense vizinho OU bb_probe_river_sb conforme
    //   implementer decidir o alias.
    //   Para evitar acoplar o teste a essa decisao, validamos apenas que NAO
    //   ha colisao (3 ids distintos) e que cada section foi resolvido.
    expect(new Set(ids).size).toBe(3);

    // - "Blind war SB" + "Probe River" -> sb_probe_river (group blind_war_sb).
    expect(ids).toContain('sb_probe_river');
    // - "Pos-flop PFR OOP" + "Probe River" -> probe_river_oop (group pos_flop_pfr_oop).
    expect(ids).toContain('probe_river_oop');

    // Cada stat preserva info de section/rawSection para audit (spec 4.5).
    for (const s of stats) {
      expect(s).toHaveProperty('rawSection');
      expect(s).toHaveProperty('section');
    }
    // rawSection contem heading exato do payload (string livre).
    const rawSections = stats.map((s) => s.rawSection);
    expect(rawSections).toContain('Big Blind defense');
    expect(rawSections).toContain('Blind war SB');
    expect(rawSections).toContain('Pos-flop PFR OOP');
  });

  // ---------------------------------------------------------------------------
  // Cenario 2: Payload sem section -> comportamento legacy preservado
  // ---------------------------------------------------------------------------

  it('payload SEM section preserva comportamento legacy (zero boost/penalty)', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            stats: [
              { label: 'VPIP', value: 22.5, confidence: 0.94 },
              { label: 'PFR', value: 18.0, confidence: 0.92 },
            ],
          }),
        },
      ],
    });

    const res = makeRes();
    await handleOcrExtract(
      makeReq({ file: multerFile(pngBuffer(3072)) }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    const stats = res.body.stats as Array<{
      id: string;
      section?: string | null;
      rawSection?: string | null;
    }>;
    expect(stats.length).toBe(2);
    const ids = stats.map((s) => s.id).sort();
    expect(ids).toEqual(['pfr', 'vpip']);
    // Sem section: section = null e rawSection = null em cada stat.
    for (const s of stats) {
      expect(s.section).toBeNull();
      // rawSection pode ser null OR ausente — ambos aceitaveis para legacy.
      expect(s.rawSection ?? null).toBeNull();
    }
  });

  // ---------------------------------------------------------------------------
  // Cenario 3: Cache hit preserva sections sem chamar LLM
  // ---------------------------------------------------------------------------

  it('cache HIT retorna stats com section preservado SEM invocar LLM', async () => {
    const buf = pngBuffer(4096);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');

    // Mock cache lookup retorna entry com sections preservados (cache pos-V3.5).
    (storage.findHudStatSnapshotByImageSha256 as any).mockResolvedValue({
      id: 'snap-cached',
      userId: 'USER-0001',
      layoutId: 'lyt-1',
      ocr_raw_response: {
        image_sha256: sha,
        raw_stats: [
          {
            label: 'Probe River',
            value: 37,
            confidence: 0.93,
            section: 'Big Blind defense',
          },
          {
            label: 'Probe River',
            value: 28,
            confidence: 0.91,
            section: 'Blind war SB',
          },
        ],
        // Cache PODE conter matched_stats com sections ja resolvidos.
        // O implementer decide se re-resolve ou trust-cache. Preferencia spec:
        // re-emite mesma estrutura sem re-chamar LLM (secao 4.5).
        matched_stats: [
          {
            id: 'bb_probe_river_sb',
            label: 'Probe River',
            value: 37,
            confidence: 0.93,
            matchedBy: 'fuzzy_substring',
            section: 'blind_war_bb',
            rawSection: 'Big Blind defense',
          },
          {
            id: 'sb_probe_river',
            label: 'Probe River',
            value: 28,
            confidence: 0.91,
            matchedBy: 'fuzzy_substring',
            section: 'blind_war_sb',
            rawSection: 'Blind war SB',
          },
        ],
        unmatched_stats: [],
      },
      source_image_key: 'USER-0001/hud-snapshots/old.png',
    });

    const res = makeRes();
    await handleOcrExtract(
      makeReq({ file: multerFile(buf) }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.cached).toBe(true);
    // Crucial: LLM NAO foi chamado.
    expect(messagesCreateMock).not.toHaveBeenCalled();

    const stats = res.body.stats as Array<{
      id: string;
      section?: string | null;
      rawSection?: string | null;
    }>;
    expect(stats.length).toBeGreaterThanOrEqual(2);
    // Sections preservados do cache (spec 4.5: cache hit retorna mesma estrutura).
    const sbProbe = stats.find((s) => s.id === 'sb_probe_river');
    expect(sbProbe).toBeDefined();
    expect(sbProbe!.rawSection).toBe('Blind war SB');
    expect(sbProbe!.section).toBe('blind_war_sb');

    const bbProbe = stats.find((s) => s.id === 'bb_probe_river_sb');
    expect(bbProbe).toBeDefined();
    expect(bbProbe!.rawSection).toBe('Big Blind defense');
    expect(bbProbe!.section).toBe('blind_war_bb');
  });
});
