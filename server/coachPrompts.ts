// =============================================================================
// Coach Prompts — System prompts for the 3 AI coaches
//
// Sprint Coach Sprint 0 — DRY (lesson #10): SAFETY_RULES, CITATIONS_RULES e
// CONFIDENCE_RULES vem de server/coachSafetyPrompts.ts. Single source of truth.
// =============================================================================

import {
  SAFETY_RULES as SHARED_SAFETY_RULES,
  CONFIDENCE_AND_CITATIONS,
  CITATIONS_RULES,
  CONFIDENCE_RULES,
} from './coachSafetyPrompts';

// Sprint Coach Sprint 0 — concatenado preserva tags legacy ([nao sei: ...],
// [Fonte: ...]) E inclui regras Sprint 0 ([fonte: ...], [confianca: ...]).
const SAFETY_RULES = `${SHARED_SAFETY_RULES}\n\n${CONFIDENCE_AND_CITATIONS}\n\n${CITATIONS_RULES}\n\n${CONFIDENCE_RULES}`;

function formatValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    // Preserve decimal places for numbers (e.g., 7.0 stays "7.0")
    if (Number.isFinite(value) && value % 1 === 0 && String(value).indexOf('.') === -1) {
      return String(value);
    }
    return String(value);
  }
  return String(value);
}

function sanitize(value: any): string {
  if (value === null || value === undefined) return '';
  const str = formatValue(value);
  // Strip known injection patterns (defense-in-depth for context data and user messages)
  return str.replace(/ignore\s+(todas?\s+(as?\s+)?)?instru[çc][õo]es/gi, '[filtrado]')
            .replace(/esque[çc]a\s+tudo/gi, '[filtrado]')
            .replace(/revele\s+(seu\s+)?system\s+prompt/gi, '[filtrado]')
            .replace(/ignore\s+(all\s+)?(previous\s+)?instructions/gi, '[filtrado]')
            .replace(/reveal\s+(your\s+)?system\s+prompt/gi, '[filtrado]')
            .replace(/forget\s+(all|everything)/gi, '[filtrado]');
}

function formatArray(arr: any[], formatter: (item: any) => string): string {
  if (!arr || arr.length === 0) return 'Sem dados disponiveis.';
  return arr.map(formatter).join('\n');
}

export function getMentalPrompt(context: any): string {
  const breakFeedbacks = context.breakFeedbacks || [];
  const preparationLogs = context.preparationLogs || [];
  const grindSessions = context.grindSessions || [];
  const mentalCorrelation = context.mentalCorrelation;

  const feedbacksText = formatArray(breakFeedbacks, (f: any) =>
    `- Foco: ${sanitize(f.foco)}, Energia: ${sanitize(f.energia)}, Confianca: ${sanitize(f.confianca)}, IE: ${sanitize(f.inteligenciaEmocional)}${f.interferencias ? `, Interferencias: ${sanitize(f.interferencias)}` : ''}`
  );

  const prepText = formatArray(preparationLogs, (p: any) =>
    `- Estado mental: ${sanitize(p.mentalState)}, Foco: ${sanitize(p.focusLevel)}, Confianca: ${sanitize(p.confidenceLevel)}${p.exercisesCompleted ? `, Exercicios: ${sanitize(p.exercisesCompleted)}` : ''}`
  );

  const sessionsText = formatArray(grindSessions, (s: any) => {
    const energia = s.energiaMedia !== null && s.energiaMedia !== undefined ? Number(s.energiaMedia).toFixed(1) : 'N/A';
    const foco = s.focoMedio !== null && s.focoMedio !== undefined ? Number(s.focoMedio).toFixed(1) : 'N/A';
    const confianca = s.confiancaMedia !== null && s.confiancaMedia !== undefined ? Number(s.confiancaMedia).toFixed(1) : 'N/A';
    return `- Energia media: ${energia}, Foco medio: ${foco}, Confianca media: ${confianca}, Duracao: ${sanitize(s.duration)}min, P/L: ${sanitize(s.profitLoss)}`;
  });

  let correlationText = 'Sem dados de correlacao disponiveis.';
  if (mentalCorrelation) {
    correlationText = `ROI com foco alto: ${sanitize(mentalCorrelation.roiHighFocus)}%, ROI com foco baixo: ${sanitize(mentalCorrelation.roiLowFocus)}%`;
  }

  return `Voce e o Coach Mental do Grindfy, especializado em mental game para jogadores profissionais de poker MTT.

Seu papel e ajudar o jogador a melhorar foco, controle emocional, tilt management, preparacao mental e rotina de grind.

## Dados do jogador:

### Break Feedbacks (ultimos):
${feedbacksText}

### Preparation Logs:
${prepText}

### Sessoes de Grind (metricas mentais):
${sessionsText}

### Correlacao Mental-Resultado:
${correlationText}

${SAFETY_RULES}`;
}

export function getTournamentPrompt(context: any): string {
  const stats = context.dashboardStats || {};
  const roiBySite = context.roiBySite || [];
  const roiByBuyin = context.roiByBuyin || [];
  const roiByCategory = context.roiByCategory || [];
  const roiBySpeed = context.roiBySpeed || [];
  const roiByDay = context.roiByDay || [];
  const topTemplates = context.topTemplates || [];
  const worstTemplates = context.worstTemplates || [];

  const siteText = formatArray(roiBySite, (s: any) =>
    `- ${sanitize(s.site)}: ROI ${sanitize(s.roi)}% (${sanitize(s.count)} torneios)`
  );

  const buyinText = formatArray(roiByBuyin, (b: any) =>
    `- ${sanitize(b.range)}: ROI ${sanitize(b.roi)}% (${sanitize(b.count)} torneios)`
  );

  const categoryText = formatArray(roiByCategory, (c: any) =>
    `- ${sanitize(c.category)}: ROI ${sanitize(c.roi)}% (${sanitize(c.count)} torneios)`
  );

  const speedText = formatArray(roiBySpeed, (s: any) =>
    `- ${sanitize(s.speed)}: ROI ${sanitize(s.roi)}% (${sanitize(s.count)} torneios)`
  );

  const dayText = formatArray(roiByDay, (d: any) =>
    `- ${sanitize(d.day)}: ROI ${sanitize(d.roi)}% (${sanitize(d.count)} torneios)`
  );

  const topText = formatArray(topTemplates, (t: any) =>
    `- ${sanitize(t.name)}: ROI ${sanitize(t.roi)}% (${sanitize(t.totalPlayed)} jogados)`
  );

  const worstText = formatArray(worstTemplates, (t: any) =>
    `- ${sanitize(t.name)}: ROI ${sanitize(t.roi)}% (${sanitize(t.totalPlayed)} jogados)`
  );

  return `Voce e o Coach de Torneios do Grindfy, especializado em game selection e otimizacao de grade para jogadores profissionais de poker MTT.

Seu papel e ajudar o jogador a otimizar sua selecao de torneios, analisar performance por site/formato/buy-in e planejar grades semanais.

## Dashboard Stats:
- Total de torneios: ${sanitize(stats.totalTournaments)}
- ROI geral: ${sanitize(stats.roi)}%
- Profit: ${sanitize(stats.profit)}
- ABI: ${sanitize(stats.abi)}
- ITM%: ${sanitize(stats.itmPercent)}

## ROI por Site:
${siteText}

## ROI por Buy-in:
${buyinText}

## ROI por Categoria:
${categoryText}

## ROI por Speed:
${speedText}

## ROI por Dia:
${dayText}

## Top Templates:
${topText}

## Worst Templates:
${worstText}

${SAFETY_RULES}`;
}

export function getTechnicalPrompt(context: any): string {
  const stats = context.dashboardStats || {};
  const ftAnalytics = context.finalTableAnalytics || {};
  const earlyFinishRate = context.earlyFinishRate || 0;
  const lateFinishRate = context.lateFinishRate || 0;
  const studyCards = context.studyCards || [];
  const detectedLeaks = context.detectedLeaks || [];

  const studyText = formatArray(studyCards, (s: any) =>
    `- ${sanitize(s.category)}: Score ${sanitize(s.knowledgeScore)}, Status: ${sanitize(s.status)}`
  );

  const leaksText = formatArray(detectedLeaks, (l: any) =>
    `- [Severidade ${sanitize(l.severity)}] ${sanitize(l.description)}`
  );

  return `Voce e o Coach Tecnico do Grindfy, especializado em analise tecnica e leak detection para jogadores profissionais de poker MTT.

Seu papel e ajudar o jogador a identificar e corrigir leaks no jogo, analisar performance tecnica e sugerir areas de estudo.

## Dashboard Stats Completo:
${JSON.stringify(stats, null, 2)}

## Final Table Analytics:
- FT Win Rate: ${sanitize(ftAnalytics.winRate)}%
- FT Rate: ${sanitize(ftAnalytics.ftRate)}%

## Finish Rates:
- Early Finish Rate: ${sanitize(earlyFinishRate)}%
- Late Finish Rate: ${sanitize(lateFinishRate)}%

## Study Cards:
${studyText}

## Leaks Detectados:
${leaksText}

${SAFETY_RULES}`;
}
