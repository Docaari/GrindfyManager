import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint AI-1A / RF-06 — System prompt enriquecido: bloco "## Perfil Estruturado do Jogador:"
//
// Modulo alvo: server/coachSystemBuilder.ts
//   - StaticInputs ganha `structuredProfile?: AiStructuredProfile | null`
//   - buildStaticSystemBlock insere "## Perfil Estruturado do Jogador:" ENTRE
//     "## Perfil do jogador:" e "## Perfil do Jogador (memoria de longo prazo):"
//   - formatStructuredProfile(profile, opts?) — funcao NOVA testavel
//       (opts pode trazer reOnboardingDeclinedAt para decidir modo vazio/omitido)
//
// Fontes:
//   - Docs/specs/sprint-ai-1a.md (RF-06 + "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/151-ai-structured-profile-jsonb.md (§7)
//   - Docs/architecture/decisions/154-deteccao-nivel-rule-based.md (Nivel estimado: ...)
//
// Lesson #10: o bloco vai no STATIC cacheado; quebra unica de cache aceita.
// Snapshot legado (tests/coach/citations/system-prompt-snapshot.test.ts) continua
// valido (so faz .toContain) — esta cobertura e aditiva.
// =============================================================================

const POPULATED: any = {
  schemaVersion: 1,
  nivel: 'mid_consistente',
  nivelConfirmado: true,
  metas: [{ id: 'a', texto: 'sair do breakeven', criadaEm: '2026-05-12T00:00:00Z', origem: 'onboarding' }],
  focoDoMes: 'defesa de 3bet',
  tomPreferido: 'direct',
  perfilDeclarado: 'pro',
  stakesTipico: '$5-$22 ABI',
  volumeTipicoMes: 1500,
  tempoJogaSerioMeses: 36,
  redesPrincipais: ['GGPoker', 'Suprema'],
  padroesConhecidos: ['tende a tiltar apos bad-beat'],
};

describe('formatStructuredProfile — modo populado (bullets pt-BR, nunca JSON cru)', () => {
  it('renderiza nivel, metas, foco, tom (com instrucao de aplicar), redes — em pt-BR', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    const text: string = mod.formatStructuredProfile(POPULATED);
    expect(typeof text).toBe('string');
    expect(text).toContain('## Perfil Estruturado do Jogador:');
    // nivel + flag de confirmacao
    expect(text).toMatch(/Nivel estimado:/i);
    expect(text).toMatch(/confirmado pelo jogador/i);
    // metas
    expect(text).toMatch(/sair do breakeven/i);
    // foco
    expect(text).toMatch(/defesa de 3bet/i);
    // tom + instrucao de como aplicar (direct)
    expect(text).toMatch(/Tom preferido:/i);
    expect(text).toMatch(/direct|direto/i);
    // redes
    expect(text).toMatch(/GGPoker/i);
    expect(text).toMatch(/Suprema/i);
    // NAO e JSON cru
    expect(text).not.toMatch(/"schemaVersion"\s*:/);
    expect(text).not.toMatch(/^\s*\{/m);
  });

  it('nivelConfirmado: false -> texto diz "(estimativa — confirme com o jogador antes de assumir)"', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    const text: string = mod.formatStructuredProfile({ ...POPULATED, nivelConfirmado: false });
    expect(text).toMatch(/estimativa.*confirme com o jogador|confirme com o jogador antes de assumir/i);
    expect(text).not.toMatch(/confirmado pelo jogador/i);
  });

  it('perfilDeclarado renderizado quando presente', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    const text: string = mod.formatStructuredProfile({ ...POPULATED, perfilDeclarado: 'recreativo_serio' });
    expect(text).toMatch(/Perfil declarado:/i);
  });

  it('padroesConhecidos renderizados quando presentes', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    const text: string = mod.formatStructuredProfile(POPULATED);
    expect(text).toMatch(/tilt(ar)? apos bad-beat/i);
  });
});

describe('formatStructuredProfile — modo vazio (linha de diagnostico) / omitido', () => {
  it('perfil vazio + reOnboardingDeclinedAt ausente -> linha "ofereca diagnostico rapido" (nao bloco completo, nao JSON)', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    const text: string = mod.formatStructuredProfile({ schemaVersion: 1 });
    expect(typeof text).toBe('string');
    expect(text).toMatch(/diagn[óo]stico r[áa]pido|ofere[çc]a um diagn[óo]stico/i);
    // 3 perguntas mencionadas
    expect(text).toMatch(/3 perguntas|tr[êe]s perguntas/i);
    // nao deve ter o cabecalho de bloco completo de perfil populado
    expect(text).not.toMatch(/Nivel estimado:/i);
  });

  it('perfil vazio + reOnboardingDeclinedAt recente (< 30 dias) -> bloco omitido (string vazia ou sem conteudo)', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    const recent = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
    const text: string = mod.formatStructuredProfile({ schemaVersion: 1 }, { reOnboardingDeclinedAt: recent });
    expect(typeof text).toBe('string');
    expect(text.trim().length).toBe(0);
  });

  it('perfil vazio + reOnboardingDeclinedAt antigo (> 30 dias) -> volta a linha de diagnostico', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    const old = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    const text: string = mod.formatStructuredProfile({ schemaVersion: 1 }, { reOnboardingDeclinedAt: old });
    expect(text).toMatch(/diagn[óo]stico r[áa]pido|ofere[çc]a um diagn[óo]stico/i);
  });
});

describe('buildStaticSystemBlock — bloco do perfil estruturado posicionado e cacheavel', () => {
  it('com structuredProfile populado -> block.text contem "## Perfil Estruturado do Jogador:" com nivel/metas/foco/tom/redes', async () => {
    const { buildStaticSystemBlock } = await import('../../../server/coachSystemBuilder');
    const block = buildStaticSystemBlock('tournament' as any, {
      userProfile: { name: 'Joao', subscriptionPlan: 'pro', totalTournaments: 1500 },
      aiProfile: 'Joga ha 3 anos, prefere MTTs.',
      structuredProfile: POPULATED,
    } as any);
    expect(block.text).toContain('## Perfil Estruturado do Jogador:');
    expect(block.text).toMatch(/Nivel estimado:/i);
    expect(block.text).toMatch(/defesa de 3bet/i);
    expect(block.text).toMatch(/Tom preferido:/i);
  });

  it('o bloco do perfil estruturado aparece ENTRE "## Perfil do jogador:" e "## Perfil do Jogador (memoria de longo prazo):"', async () => {
    const { buildStaticSystemBlock } = await import('../../../server/coachSystemBuilder');
    const block = buildStaticSystemBlock('mental' as any, {
      userProfile: { name: 'Joao', subscriptionPlan: 'pro', totalTournaments: 1500 },
      aiProfile: 'memoria longa aqui',
      structuredProfile: POPULATED,
    } as any);
    const t = block.text;
    const idxBasico = t.indexOf('## Perfil do jogador:');
    const idxEstruturado = t.indexOf('## Perfil Estruturado do Jogador:');
    const idxLongo = t.indexOf('## Perfil do Jogador (memoria de longo prazo):');
    expect(idxBasico).toBeGreaterThanOrEqual(0);
    expect(idxEstruturado).toBeGreaterThanOrEqual(0);
    expect(idxLongo).toBeGreaterThanOrEqual(0);
    expect(idxBasico).toBeLessThan(idxEstruturado);
    expect(idxEstruturado).toBeLessThan(idxLongo);
  });

  it('com structuredProfile vazio (sem reOnboardingDeclinedAt) -> linha de "ofereca diagnostico rapido" no STATIC (nao JSON, nao bloco completo)', async () => {
    const { buildStaticSystemBlock } = await import('../../../server/coachSystemBuilder');
    const block = buildStaticSystemBlock('technical' as any, { structuredProfile: { schemaVersion: 1 } } as any);
    expect(block.text).toMatch(/diagn[óo]stico r[áa]pido|ofere[çc]a um diagn[óo]stico/i);
    expect(block.text).not.toMatch(/Nivel estimado:/i);
  });

  it('com structuredProfile vazio + reOnboardingDeclinedAt recente -> bloco do perfil estruturado OMITIDO (nem a linha de oferta)', async () => {
    const { buildStaticSystemBlock } = await import('../../../server/coachSystemBuilder');
    const recent = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
    const block = buildStaticSystemBlock('technical' as any, {
      structuredProfile: { schemaVersion: 1, reOnboardingDeclinedAt: recent },
    } as any);
    expect(block.text).not.toMatch(/## Perfil Estruturado do Jogador:/);
    expect(block.text).not.toMatch(/ofere[çc]a um diagn[óo]stico/i);
  });

  it('sem structuredProfile (undefined) -> bloco do perfil estruturado ausente; o resto do prompt intacto', async () => {
    const { buildStaticSystemBlock } = await import('../../../server/coachSystemBuilder');
    const block = buildStaticSystemBlock('mental' as any, {});
    expect(block.text).not.toMatch(/## Perfil Estruturado do Jogador:/);
    // os blocos de safety/citations continuam
    const { CITATIONS_RULES } = await import('../../../server/coachSafetyPrompts') as any;
    expect(block.text).toContain(CITATIONS_RULES);
  });

  it('block.cache_control = ephemeral mesmo com o bloco do perfil estruturado (cacheavel)', async () => {
    const { buildStaticSystemBlock } = await import('../../../server/coachSystemBuilder');
    const block = buildStaticSystemBlock('tournament' as any, { structuredProfile: POPULATED } as any);
    expect(block.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('buildStaticSystemBlock e estavel — mesmo structuredProfile -> mesmo block.text (cacheavel dentro da sessao)', async () => {
    const { buildStaticSystemBlock } = await import('../../../server/coachSystemBuilder');
    const a = buildStaticSystemBlock('mental' as any, { structuredProfile: POPULATED } as any);
    const b = buildStaticSystemBlock('technical' as any, { structuredProfile: POPULATED } as any);
    // o bloco STATIC e identico entre coachType (1 cache key) — AI-0B garantiu isso;
    // o perfil estruturado nao quebra essa propriedade.
    expect(a.text).toBe(b.text);
  });
});
