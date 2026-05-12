import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint AI-0B / RF-01 + RF-02 + RF-03 — buildStaticSystemBlock /
// buildDynamicSystemBlock no agente unico.
// Spec: Docs/specs/sprint-ai-0b.md §RF-01, §RF-02, §RF-03
// ADR-148 §2.1, §2.3, §5 (itens 3 e 4).
//
// Mudancas no codigo:
//   - buildStaticSystemBlock(coachType, inputs): corpo do base prompt IDENTICO
//     entre coachType ∈ {mental, tournament, technical}. Ordem do STATIC:
//     GRINDFY_AI_BASE -> SAFETY_RULES -> SAFETY_RULES_COMPETITOR_BLOCK ->
//     CITATIONS_RULES -> CONFIDENCE_RULES -> perfil -> aiProfile ->
//     statsSnapshot -> lastSummary. cache_control: ephemeral.
//   - buildDynamicSystemBlock(coachType, inputs): primeira linha = linha de
//     "lente inicial" por coachType (3 textos distintos, todos com "qualquer
//     assunto"); weekly plan E study progress entram SEMPRE (nao mais gated por
//     coachType). Sem cache_control.
//
// Lessons aplicaveis: #10 (DRY), #14/#26 (await import).
// =============================================================================

const STATIC_INPUTS = {
  userProfile: { name: 'Player X', subscriptionPlan: 'pro', createdAt: '2025-01-01', totalTournaments: 500 },
  aiProfile: 'jogador agressivo, prefere PKO',
  statsSnapshot: { roi: 15.5, profit: 12000, volume: 500, abi: 33 },
  lastSummary: 'na sessao passada falamos de tilt em bolha',
};

describe('buildStaticSystemBlock — corpo do base unico identico entre coachType (RF-01)', () => {
  for (const coachType of ['mental', 'tournament', 'technical'] as const) {
    it(`buildStaticSystemBlock('${coachType}', inputs) inclui GRINDFY_AI_BASE literal`, async () => {
      const { buildStaticSystemBlock, GRINDFY_AI_BASE }: any = await import('../../../server/coachSystemBuilder');
      const block = buildStaticSystemBlock(coachType, STATIC_INPUTS as any);
      expect(block.text).toContain(GRINDFY_AI_BASE);
    });
  }

  it('mental e technical produzem o MESMO texto de bloco STATIC (mesmos inputs)', async () => {
    const { buildStaticSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const a = buildStaticSystemBlock('mental', STATIC_INPUTS as any);
    const b = buildStaticSystemBlock('technical', STATIC_INPUTS as any);
    expect(a.text).toBe(b.text);
  });

  it('mental e tournament produzem o MESMO texto de bloco STATIC (mesmos inputs)', async () => {
    const { buildStaticSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const a = buildStaticSystemBlock('mental', STATIC_INPUTS as any);
    const b = buildStaticSystemBlock('tournament', STATIC_INPUTS as any);
    expect(a.text).toBe(b.text);
  });

  it('o bloco STATIC NAO apresenta "Coach Mental/Tecnico/de Torneios" como identidade', async () => {
    const { buildStaticSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const block = buildStaticSystemBlock('technical', STATIC_INPUTS as any);
    expect(block.text).not.toMatch(/Coach\s+Mental/i);
    expect(block.text).not.toMatch(/Coach\s+T[eé]cnico/i);
    expect(block.text).not.toMatch(/Coach\s+de\s+Torneios/i);
  });

  it('ordem do bloco STATIC: base -> SAFETY_RULES -> COMPETITOR_BLOCK -> CITATIONS_RULES -> CONFIDENCE_RULES', async () => {
    const { buildStaticSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const { SAFETY_RULES, SAFETY_RULES_COMPETITOR_BLOCK, CITATIONS_RULES, CONFIDENCE_RULES }: any =
      await import('../../../server/coachSafetyPrompts');
    const { GRINDFY_AI_BASE }: any = await import('../../../server/coachSystemBuilder');

    const text = buildStaticSystemBlock('mental', STATIC_INPUTS as any).text;
    const iBase = text.indexOf(GRINDFY_AI_BASE);
    const iSafety = text.indexOf(SAFETY_RULES);
    const iComp = text.indexOf(SAFETY_RULES_COMPETITOR_BLOCK);
    const iCit = text.indexOf(CITATIONS_RULES);
    const iConf = text.indexOf(CONFIDENCE_RULES);
    expect(iBase).toBeGreaterThanOrEqual(0);
    expect(iSafety).toBeGreaterThan(iBase);
    expect(iComp).toBeGreaterThan(iSafety);
    expect(iCit).toBeGreaterThan(iComp);
    expect(iConf).toBeGreaterThan(iCit);
  });

  it('perfil / aiProfile / statsSnapshot / lastSummary entram DEPOIS de CONFIDENCE_RULES', async () => {
    const { buildStaticSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const { CONFIDENCE_RULES }: any = await import('../../../server/coachSafetyPrompts');
    const text = buildStaticSystemBlock('mental', STATIC_INPUTS as any).text;
    const iConf = text.indexOf(CONFIDENCE_RULES);
    expect(text.indexOf('Player X')).toBeGreaterThan(iConf);
    expect(text.indexOf('jogador agressivo, prefere PKO')).toBeGreaterThan(iConf);
    expect(text.indexOf('15.5')).toBeGreaterThan(iConf);
    expect(text.indexOf('na sessao passada falamos de tilt em bolha')).toBeGreaterThan(iConf);
  });

  it('cache_control = ephemeral no bloco STATIC', async () => {
    const { buildStaticSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const block = buildStaticSystemBlock('tournament', {} as any);
    expect(block.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('o bloco STATIC NAO contem a linha de lente inicial nem a secao de page context', async () => {
    const { buildStaticSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const text = buildStaticSystemBlock('mental', STATIC_INPUTS as any).text;
    expect(text).not.toMatch(/Lente inicial/i);
    expect(text).not.toContain('## Contexto da pagina atual');
  });
});

describe('buildDynamicSystemBlock — linha de lente inicial por coachType (RF-03)', () => {
  it("coachType 'mental' -> primeira linha menciona mental game e 'qualquer assunto'", async () => {
    const { buildDynamicSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const dyn = buildDynamicSystemBlock('mental', {} as any);
    const firstLine = dyn.text.split('\n').filter((l: string) => l.trim().length > 0)[0] || '';
    expect(firstLine).toMatch(/Lente inicial/i);
    expect(firstLine.toLowerCase()).toMatch(/mental/);
    expect(dyn.text.toLowerCase()).toMatch(/qualquer assunto/);
  });

  it("coachType 'tournament' -> linha de lente menciona selecao de torneios / grade", async () => {
    const { buildDynamicSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const dyn = buildDynamicSystemBlock('tournament', {} as any);
    const firstLine = dyn.text.split('\n').filter((l: string) => l.trim().length > 0)[0] || '';
    expect(firstLine).toMatch(/Lente inicial/i);
    expect(firstLine.toLowerCase()).toMatch(/sele[cç][aã]o|grade|torneio/);
  });

  it("coachType 'technical' -> linha de lente menciona analise tecnica / leaks", async () => {
    const { buildDynamicSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const dyn = buildDynamicSystemBlock('technical', {} as any);
    const firstLine = dyn.text.split('\n').filter((l: string) => l.trim().length > 0)[0] || '';
    expect(firstLine).toMatch(/Lente inicial/i);
    expect(firstLine.toLowerCase()).toMatch(/t[eé]cnic|leak/);
  });

  it('as 3 linhas de lente sao textos DISTINTOS entre si', async () => {
    const { buildDynamicSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const m = buildDynamicSystemBlock('mental', {} as any).text.split('\n').filter((l: string) => l.trim())[0];
    const t = buildDynamicSystemBlock('tournament', {} as any).text.split('\n').filter((l: string) => l.trim())[0];
    const x = buildDynamicSystemBlock('technical', {} as any).text.split('\n').filter((l: string) => l.trim())[0];
    expect(m).not.toBe(t);
    expect(t).not.toBe(x);
    expect(m).not.toBe(x);
  });

  it('bloco DYNAMIC NAO tem cache_control', async () => {
    const { buildDynamicSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const dyn = buildDynamicSystemBlock('mental', { weeklyPlan: { targetBuyins: 100 } } as any);
    expect(dyn.cache_control).toBeUndefined();
  });
});

describe('buildDynamicSystemBlock — contexto completo, sem gate por coachType (RF-02)', () => {
  it("buildDynamicSystemBlock('mental', { weeklyPlan, studyProgress }) inclui AMBAS as secoes", async () => {
    const { buildDynamicSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const dyn = buildDynamicSystemBlock('mental', {
      weeklyPlan: { targetBuyins: 120, targetProfit: 3000, targetVolume: 200 },
      studyProgress: [{ category: '3bet pots', knowledgeScore: 40, status: 'in_progress' }],
    } as any);
    expect(dyn.text).toMatch(/Plano Semanal/i);
    expect(dyn.text).toMatch(/Progresso de Estudo/i);
  });

  it("buildDynamicSystemBlock('technical', { weeklyPlan }) inclui o Plano Semanal (antes so 'tournament' via)", async () => {
    const { buildDynamicSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const dyn = buildDynamicSystemBlock('technical', {
      weeklyPlan: { targetBuyins: 90, targetProfit: 2000, targetVolume: 150 },
    } as any);
    expect(dyn.text).toMatch(/Plano Semanal/i);
  });

  it("buildDynamicSystemBlock('tournament', { studyProgress }) inclui o Progresso de Estudo (antes so 'technical' via)", async () => {
    const { buildDynamicSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const dyn = buildDynamicSystemBlock('tournament', {
      studyProgress: [{ category: 'ICM bolha', knowledgeScore: 25, status: 'started' }],
    } as any);
    expect(dyn.text).toMatch(/Progresso de Estudo/i);
  });

  it('sessao ativa / break feedbacks / leaks continuam entrando sempre que ha dado', async () => {
    const { buildDynamicSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const dyn = buildDynamicSystemBlock('mental', {
      activeGrind: { status: 'active', profitLoss: -50 },
      breakFeedbacks: [{ foco: 7, energia: 6, confianca: 8 }],
      leaks: [{ severity: 'high', description: 'overfold em bolha' }],
    } as any);
    expect(dyn.text).toMatch(/Sessao de Grind Ativa/i);
    expect(dyn.text).toMatch(/Break Feedbacks/i);
    expect(dyn.text).toMatch(/Leaks Detectados/i);
  });

  // Sprint AI-0B fix (reviewer MEDIUM): activeTab 'movements' (key real do
  // WalletActivityPanel). Antes: 'movimentacoes'.
  it('pageContext valido injetado entra como secao "## Contexto da pagina atual" no DYNAMIC', async () => {
    const { buildDynamicSystemBlock }: any = await import('../../../server/coachSystemBuilder');
    const dyn = buildDynamicSystemBlock('mental', {
      pageContext: { route: 'bankroll', walletsCount: 3, activeTab: 'movements' },
    } as any);
    expect(dyn.text).toContain('## Contexto da pagina atual');
    expect(dyn.text).toMatch(/Rota:\s*bankroll/);
  });
});

describe('buildSystemArray — fallback legacy COACH_PROMPT_CACHE_ENABLED=false', () => {
  it('=== false retorna string concatenada sem cache_control', async () => {
    const prev = process.env.COACH_PROMPT_CACHE_ENABLED;
    process.env.COACH_PROMPT_CACHE_ENABLED = 'false';
    try {
      const { buildSystemArray }: any = await import('../../../server/coachSystemBuilder');
      const result = buildSystemArray('mental', STATIC_INPUTS as any, { weeklyPlan: { targetBuyins: 50 } } as any);
      expect(typeof result).toBe('string');
    } finally {
      if (prev === undefined) delete process.env.COACH_PROMPT_CACHE_ENABLED;
      else process.env.COACH_PROMPT_CACHE_ENABLED = prev;
    }
  });

  it('!== false retorna array [staticBlock, dynamicBlock] com cache_control so no STATIC', async () => {
    const prev = process.env.COACH_PROMPT_CACHE_ENABLED;
    delete process.env.COACH_PROMPT_CACHE_ENABLED;
    try {
      const { buildSystemArray }: any = await import('../../../server/coachSystemBuilder');
      const result = buildSystemArray('mental', STATIC_INPUTS as any, { weeklyPlan: { targetBuyins: 50 } } as any);
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(result[1]?.cache_control).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.COACH_PROMPT_CACHE_ENABLED;
      else process.env.COACH_PROMPT_CACHE_ENABLED = prev;
    }
  });
});
