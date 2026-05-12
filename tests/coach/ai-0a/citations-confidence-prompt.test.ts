import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint AI-0A — RF-14: citations + confidence universais no system prompt
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-14)
// ADR  : 147 §3 — unificar blocos (remover variante BACKTICKED); fonte unica.
//        145 §1 — exemplos few-shot so citam tools que existem no registry.
// Diagrama: Docs/architecture/diagrams/coach-ai-0a/flow-citations-confidence-system-prompt.mermaid
//
// TDD red-phase: hoje os exemplos do prompt citam tools que eram stub
// (find_top_leaks), a variante CONFIDENCE_AND_CITATIONS_BACKTICKED ainda eh
// exportada/usada por coachSystemBuilder, e nao ha regra explicita conectando
// "todo numero de tool => citacao inline" no formato canonico. Este sprint muda
// o texto (Lesson #10: snapshot muda de proposito — recriar, nao preservar).
//
// Lessons:
//   - #10: snapshot muda de proposito — atualizar/recriar, nao preservar antigo.
//   - #25/#23: cuidado com inconsistencia logica; nada de Wouter aqui.
//   - #14: await import.
// =============================================================================

const TOOLS_QUE_DEVEM_APARECER_COMO_FONTE = [
  'query_dimension',
  'find_top_leaks',
  'simulate_bankroll_scenario',
  'get_tournament_suggestions',
  'explain_tournament_score',
  'verify_leak_progress',
  'read_user_hud_stats',
  'read_user_bankroll_history',
] as const;

// Tools que NAO existem no registry pos-AI-0A (nenhuma menção a elas nos exemplos).
const TOOLS_INEXISTENTES = [
  'find_leaks',          // nome errado (e find_top_leaks)
  'bulk_propose_grade',  // AI-2A
  'analyze_variance',    // AI-2A
  'diagnose_plateau',    // AI-2A
] as const;

async function getCitationsRules(): Promise<string> {
  const mod: any = await import('../../../server/coachSafetyPrompts');
  return String(mod.CITATIONS_RULES ?? '');
}
async function getConfidenceRules(): Promise<string> {
  const mod: any = await import('../../../server/coachSafetyPrompts');
  return String(mod.CONFIDENCE_RULES ?? '');
}

describe('AI-0A · CITATIONS_RULES — fontes validas mencionam as tools religadas (RF-14)', () => {
  it('CITATIONS_RULES menciona explicitamente cada tool citavel (query_dimension, find_top_leaks, simulate_bankroll_scenario, get_tournament_suggestions, explain_tournament_score, verify_leak_progress, read_user_hud_stats, read_user_bankroll_history)', async () => {
    const rules = await getCitationsRules();
    for (const t of TOOLS_QUE_DEVEM_APARECER_COMO_FONTE) {
      expect(rules, `CITATIONS_RULES deve mencionar ${t}`).toMatch(new RegExp(t));
    }
  });

  it('CITATIONS_RULES define o formato [fonte: <toolName>:<key>:<period>]', async () => {
    const rules = await getCitationsRules();
    expect(rules).toMatch(/\[fonte:\s*<?\s*toolName/i);
    // Exemplo concreto canonico (ADR-147 §3).
    expect(rules).toMatch(/\[fonte:\s*query_dimension:roi:30d\]/);
  });

  it('CITATIONS_RULES tem regra explicita "Coach NAO pode mencionar numero derivado de tool sem citacao inline"', async () => {
    const rules = await getCitationsRules().then((s) => s.toLowerCase());
    expect(rules).toMatch(/coach\s+n[ãa]o\s+pode\s+mencionar.*sem\s+(fonte|cita)/i);
  });

  it('CITATIONS_RULES cobre page-context [fonte: <route>:<period>] e "nao verificado" e "[nao sei: ...]"', async () => {
    const rules = await getCitationsRules();
    expect(rules).toMatch(/\[fonte:\s*<?\s*route/i);
    expect(rules.toLowerCase()).toMatch(/n[ãa]o\s+verificado/);
    expect(rules.toLowerCase()).toMatch(/\[n[ãa]o\s+sei/);
  });

  it('CITATIONS_RULES tem disclaimer financeiro condicional + tom condicional para outputs de $/banca/saque/staking/tax', async () => {
    const rules = await getCitationsRules().then((s) => s.toLowerCase());
    expect(rules).toMatch(/estimativa.*n[ãa]o.*conselho financeiro|n[ãa]o.*conselho financeiro/i);
    // tom condicional
    expect(rules).toMatch(/poder|consider|nunca\s+["']?voc[êe]\s+deve/i);
    // mencao a algum dos contextos financeiros
    expect(rules).toMatch(/banca|saque|staking|tax/);
  });
});

describe('AI-0A · CONFIDENCE_RULES — thresholds + sample size aware (RF-14)', () => {
  it('documenta os 3 thresholds N<30 / 30<=N<100 / N>=100 (boundaries inclusivos)', async () => {
    const rules = await getConfidenceRules();
    expect(rules).toMatch(/N\s*<\s*30/);
    expect(rules).toMatch(/30\s*<=\s*N\s*<\s*100|30\s*<=\s*N/);
    expect(rules).toMatch(/N\s*>=\s*100/);
    expect(rules.toLowerCase()).toMatch(/inclus/);
  });

  it('lista as tools que retornam sample size (query_dimension.totalCount, find_top_leaks.evidence.n, read_user_hud_stats.latestSnapshot.sampleSize, verify_leak_progress.current.sampleSize)', async () => {
    const rules = await getConfidenceRules();
    expect(rules).toMatch(/query_dimension\.totalCount/);
    expect(rules).toMatch(/find_top_leaks\.evidence\.n/);
    expect(rules).toMatch(/read_user_hud_stats\.latestSnapshot\.sampleSize/);
    expect(rules).toMatch(/verify_leak_progress\.current\.sampleSize/);
  });

  it('instrui omitir a tag quando N indisponivel (nao inventar)', async () => {
    const rules = await getConfidenceRules().then((s) => s.toLowerCase());
    expect(rules).toMatch(/omit|n[ãa]o\s+inventar/);
  });
});

describe('AI-0A · exemplos few-shot so citam tools que existem no registry pos-AI-0A (ADR-145 §1)', () => {
  it('parametrizado: nenhuma tool inexistente aparece em CITATIONS_RULES nem CONFIDENCE_RULES', async () => {
    const blob = `${await getCitationsRules()}\n${await getConfidenceRules()}`;
    for (const t of TOOLS_INEXISTENTES) {
      expect(blob, `prompt nao deve mencionar a tool inexistente ${t}`).not.toMatch(new RegExp(`\\b${t}\\b`));
    }
  });

  it('parametrizado: toda mencao de tool em [fonte: X:...] corresponde a uma tool registrada', async () => {
    const blob = `${await getCitationsRules()}\n${await getConfidenceRules()}`;
    const { _resetRegistry, listRegisteredTools } = await import('../../../server/coachTools/registry');
    _resetRegistry();
    await import('../../../server/coachTools/index');
    const registered = new Set(listRegisteredTools());

    // Captura nomes tipo `[fonte: query_dimension:...]` ou `query_dimension.totalCount`.
    const matches = new Set<string>();
    const re1 = /\[fonte:\s*([a-z_]+):/g;
    const re2 = /\b([a-z_]+)\.(totalCount|evidence|latestSnapshot|current)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re1.exec(blob))) matches.add(m[1]);
    while ((m = re2.exec(blob))) matches.add(m[1]);
    // 'route' e 'dashboard'/'tournament-library' nao sao tools — sao page-context. Filtra-os.
    const PAGE_CONTEXT_TOKENS = new Set(['route', 'dashboard', 'tournament', 'tournament-library']);
    for (const name of matches) {
      if (PAGE_CONTEXT_TOKENS.has(name)) continue;
      // Permitir tambem 'nao' de "[fonte: nao verificado]" (capturado por re1 como 'nao verificado'? nao — re1 exige ':'); ignora.
      expect(
        registered.has(name),
        `prompt cita "${name}" como fonte de tool mas ela nao esta no registry`,
      ).toBe(true);
    }
  });
});

describe('AI-0A · variante backticked removida; fonte unica (ADR-147 §3)', () => {
  it('CONFIDENCE_AND_CITATIONS_BACKTICKED NAO eh mais exportada de coachSafetyPrompts', async () => {
    const mod: any = await import('../../../server/coachSafetyPrompts');
    expect(mod.CONFIDENCE_AND_CITATIONS_BACKTICKED).toBeUndefined();
  });

  it('coachSystemBuilder NAO importa mais CONFIDENCE_AND_CITATIONS_BACKTICKED (codigo-fonte)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'server/coachSystemBuilder.ts'), 'utf8');
    expect(src).not.toMatch(/BACKTICKED/);
  });

  // REESCRITO no Sprint AI-0B — apos a consolidacao (ADR-148) o coachPrompts.ts
  // legacy nao tem mais os 3 prompts por coach; pode nem referenciar mais as
  // constantes. A fonte unica de CITATIONS_RULES/CONFIDENCE_RULES eh
  // coachSafetyPrompts.ts, consumida pelo coachSystemBuilder.ts. Validamos que o
  // builder (caminho real) referencia as constantes e NAO copia o texto literal.
  it('coachSystemBuilder usa as constantes de fonte unica (CITATIONS_RULES + CONFIDENCE_RULES) — sem copia literal', async () => {
    const fsMod = await import('node:fs');
    const pathMod = await import('node:path');
    const builderSrc = fsMod.readFileSync(pathMod.resolve(process.cwd(), 'server/coachSystemBuilder.ts'), 'utf8');
    expect(builderSrc).toMatch(/CITATIONS_RULES/);
    expect(builderSrc).toMatch(/CONFIDENCE_RULES/);
    // coachPrompts.ts NAO deve conter copia literal das constantes (se ainda
    // referenciar, deve ser por import — nao por re-declaracao de `const
    // CITATIONS_RULES = ...`).
    const promptsSrc = fsMod.readFileSync(pathMod.resolve(process.cwd(), 'server/coachPrompts.ts'), 'utf8');
    expect(promptsSrc).not.toMatch(/const\s+CITATIONS_RULES\s*=/);
    expect(promptsSrc).not.toMatch(/const\s+CONFIDENCE_RULES\s*=/);
  });
});

describe('AI-0A · system prompt continua sendo array com cache_control ephemeral no bloco estatico (RF-14)', () => {
  it('buildStaticSystemBlock retorna { text, cache_control: { type: "ephemeral" } } e inclui CITATIONS_RULES + CONFIDENCE_RULES literais', async () => {
    const { buildStaticSystemBlock } = await import('../../../server/coachSystemBuilder');
    const { CITATIONS_RULES, CONFIDENCE_RULES } = await import('../../../server/coachSafetyPrompts') as any;
    const block: any = buildStaticSystemBlock('tournament', { aiProfile: null, statsSnapshot: null, lastSummary: null });
    expect(block.cache_control).toEqual({ type: 'ephemeral' });
    expect(typeof block.text).toBe('string');
    expect(block.text).toContain(CITATIONS_RULES);
    expect(block.text).toContain(CONFIDENCE_RULES);
  });

  // REESCRITO no Sprint AI-0B — getTournamentPrompt removido (consolidacao
  // agente unico, ADR-148). O base unico GRINDFY_AI_BASE / buildStaticSystemBlock
  // continua consumindo CITATIONS_RULES de fonte unica (coachSafetyPrompts.ts).
  it('Grindfy AI base unico inclui o texto literal de CITATIONS_RULES (DRY — sem copy-paste)', async () => {
    const { buildStaticSystemBlock, GRINDFY_AI_BASE } = await import('../../../server/coachSystemBuilder') as any;
    const { CITATIONS_RULES } = await import('../../../server/coachSafetyPrompts') as any;
    const block: any = buildStaticSystemBlock('tournament', {});
    expect(block.text).toContain(CITATIONS_RULES);
    expect(GRINDFY_AI_BASE).not.toMatch(/Coach\s+de\s+Torneios/i);
  });
});

describe('AI-0A · snapshot do system prompt (RF-14 — recriado, lesson #10)', () => {
  it('snapshot do bloco estatico cacheado (tournament)', async () => {
    const { buildStaticSystemBlock } = await import('../../../server/coachSystemBuilder');
    const block: any = buildStaticSystemBlock('tournament', { aiProfile: null, statsSnapshot: null, lastSummary: null });
    // Inline snapshot — quando o implementer reforcar o texto (RF-14), este
    // snapshot vai falhar; e ENTAO o implementer/test-writer atualiza a string
    // esperada. Aqui o "esperado" e o estado-alvo: contem as regras novas.
    // Como ainda nao existe, asseguramos as propriedades estruturais que o
    // estado-alvo DEVE ter (snapshot semantico, nao byte-a-byte fragil):
    expect(block.text).toMatch(/\[fonte:\s*query_dimension:roi:30d\]/);
    expect(block.text).toMatch(/find_top_leaks/);
    expect(block.text).toMatch(/\[confianca:/);
    expect(block.text).toMatch(/N\s*<\s*30/);
    expect(block.text).toMatch(/n[ãa]o.*conselho financeiro/i);
    // E NAO contem mais menção a tool inexistente.
    expect(block.text).not.toMatch(/\bbulk_propose_grade\b/);
  });
});
