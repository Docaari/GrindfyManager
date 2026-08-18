#!/usr/bin/env node
// PreToolUse hook para Write|Edit. NAO bloqueia nada.
// Injeta no contexto as invariantes do arquivo que esta sendo editado e avisa
// quando o texto gravado contem um padrao que ja causou bug conhecido.
// Texto descritivo, nunca imperativo (imperativo dispara defesa anti-injecao).
// Sem acento: roda no console do Windows.

const fs = require('fs');

function readPayload() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

// Zona critica -> invariantes + onde esta o teste.
const ZONES = [
  {
    match: /server[\\/](storage|storage[\\/].*|csvParser)\.ts$|server[\\/]routes[\\/]dashboard\.ts$|server[\\/]scoring[\\/]/i,
    title: 'dominio de dados',
    rule: '.claude/rules/10-dominio-dados.md',
    invariants: [
      'metrica de historico filtra tournaments.grind_session_id IS NULL (CLAUDE.md 6.1); session_tournaments so aparece no detalhe da sessao e no Daily Debrief',
      'dinheiro so se compara em USD; sem cotacao o resultado degrada com reason nomeado, nunca ?? 1',
      'numeric do pg chega como string: converter na fronteira e checar Number.isFinite',
      'regex nova de parser nasce com o caso que resolve e o caso vizinho que ela nao pode quebrar',
    ],
    tests: 'npx vitest run tests/unit tests/integration',
  },
  {
    match: /server[\\/]coach[\\/]|server[\\/]routes[\\/]coach/i,
    title: 'Coach AI',
    rule: '.claude/rules/11-coach-ia.md',
    invariants: [
      'SDK da Anthropic so via server/coach/anthropicClient.ts (retry, timeout, whitelist)',
      'bloco de prompt e conhecimento unico: duplicar quebra o cache da Anthropic',
      'elegibilidade de relatorio via getReportTier; cron lista via planEligibility; subscription_plan e trial|active|expired|admin',
      'degradacao explicita: status degraded + degradedReason nomeado; wrapper que traduz so um reason engole os outros',
    ],
    tests: 'npx vitest run tests/coach',
  },
  {
    match: /shared[\\/]schema\.ts$|migrations[\\/]/i,
    title: 'schema e migrations',
    rule: '.claude/rules/12-schema-migrations.md',
    invariants: [
      'coluna nova nasce nullable sem default quando o back-fill nao e trivial (lesson #7)',
      'toda migration tem par _rollback.sql, e aplicada no local e registrada como PENDENTE PROD no CLAUDE.md',
      'UNIQUE + ON CONFLICT e a ferramenta de idempotencia; enum pequeno fica em Zod, sem CHECK no banco',
      'db:push em producao exige pedido explicito do founder',
    ],
    tests: 'npm run check',
  },
  {
    match: /server[\\/]routes[\\/]|server[\\/]index\.ts$|server[\\/]auth\.ts$/i,
    title: 'rotas Express',
    rule: '.claude/rules/15-rotas-express.md',
    invariants: [
      'Express 4 e ordem-pura: /:id registrado antes engole sub-path de 1 segmento (EST-3, MDA-1)',
      'ordem do handler: requireAuth -> gate de permissao/tier -> schema.parse -> storage',
      'requirePermission legado e fail-OPEN; usar requireGranularPermission (ADR-240)',
      'ownership vai no where da query, nao so no if do handler (IDOR em grind-sessions)',
    ],
    tests: 'npx vitest run tests/integration/routes',
  },
  {
    match: /client[\\/]src[\\/]/i,
    title: 'frontend',
    rule: '.claude/rules/14-frontend-ui.md',
    invariants: [
      'hooks antes de qualquer early return (lesson #1)',
      'espacamento, cor e tipografia saem de @/lib/ui-tokens, nunca valor solto',
      'apiRequest devolve JSON parseado, nao Response (lesson #13)',
      'data-testid estavel em tudo que o teste precisa achar (lesson #2)',
    ],
    tests: 'npx vitest run tests/client',
  },
  {
    match: /tests[\\/]|vitest\.config\.ts$/i,
    title: 'testes',
    rule: '.claude/rules/13-testes.md',
    invariants: [
      'em .test.tsx use await import, nunca require; nao misture os dois quando houver React Context (lessons #14, #26, #38)',
      'mock com o shape REAL do storage (lesson #3)',
      'nome de teste diz o que protege, nao "caso 3"',
    ],
    tests: 'npx vitest run',
  },
];

// Padroes que ja causaram bug. Aviso, nunca bloqueio: falso positivo mata hook.
const SMELLS = [
  {
    re: /from\s*\(\s*tournaments\s*\)|from\(tournaments\)/,
    unless: /grindSessionId|grind_session_id/,
    msg: 'query em tournaments sem filtro de grind_session_id: metrica de historico precisa de IS NULL (CLAUDE.md 6.1)',
  },
  {
    re: /\?\?\s*1\b/,
    unless: null,
    msg: '"?? 1" perto de taxa de cambio trata moeda estrangeira como dolar e mente sem erro (Artigo VI)',
  },
  {
    re: /catch\s*(\([^)]*\))?\s*\{\s*\}/,
    unless: null,
    msg: 'catch vazio: Artigo IV proibe falhar calado; logue antes do fallback (lesson #9)',
  },
  {
    re: /requirePermission\s*\(/,
    unless: /requireGranularPermission/,
    msg: 'requirePermission legado e fail-OPEN; usar requireGranularPermission (ADR-240)',
  },
  {
    re: /new\s+Anthropic\s*\(/,
    unless: null,
    msg: 'instanciar o SDK direto perde retry, cap de timeout e whitelist: usar server/coach/anthropicClient.ts',
  },
  {
    re: /require\(['"][^'"]*\.tsx?['"]\)/,
    unless: null,
    msg: 'require() em teste de componente quebra com deps ESM: usar await import (lessons #14, #26, #38)',
  },
];

function main() {
  const payload = readPayload();
  if (!payload) return;

  const input = payload.tool_input || {};
  const filePath = String(input.file_path || '');
  if (!filePath) return;

  const content = String(input.content || input.new_string || '');

  // Doc e spec CITAM antipadrao de proposito. Rodar SMELLS neles e falso
  // positivo garantido, e falso positivo mata hook.
  const isProse = /\.(md|txt|mermaid)$/i.test(filePath);

  const zone = ZONES.find((z) => z.match.test(filePath));
  const hits = isProse
    ? []
    : SMELLS.filter((s) => s.re.test(content) && (!s.unless || !s.unless.test(content)));

  if (!zone && hits.length === 0) return;

  const lines = [];
  if (zone) {
    lines.push(`Contexto do arquivo (zona critica: ${zone.title} - detalhe em ${zone.rule}):`);
    zone.invariants.forEach((inv) => lines.push(`- ${inv}`));
    lines.push(`Testes da area: ${zone.tests}`);
  }
  if (hits.length > 0) {
    lines.push('Padroes no texto que ja causaram bug conhecido:');
    hits.forEach((h) => lines.push(`- ${h.msg}`));
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: lines.join('\n'),
      },
    }),
  );
}

try {
  main();
} catch {
  // hook nunca derruba a sessao
}
process.exit(0);
