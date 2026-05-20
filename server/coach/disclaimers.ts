// =============================================================================
// disclaimers — Sprint AI-2B / RF-09 (ADR-173 — Q-H locked)
//
// Texto canonico do disclaimer regulatorio do Grindfy. Fonte UNICA (lesson #10
// — DRY de prompts; mudanca propaga a 3 superficies: footer reports + system
// prompt + onboarding step + email templates).
//
// 3 constantes exportadas:
//   - REPORT_DISCLAIMER             — texto longo populado em ReportContent.disclaimer
//                                     (todos os relatorios) + email footer.
//   - DEFLECTION_RULE_REGULATORY    — regra no system prompt: defletir perguntas
//                                     sobre IRPF/tax/staking/contrato/lei/regulamentacao.
//   - FINANCIAL_CAVEAT_RULE         — regra no system prompt: outputs com $/profit/banca
//                                     ganham caveat "informativo — nao garante retorno".
// =============================================================================

export const REPORT_DISCLAIMER =
  "Grindfy e uma ferramenta de analise de performance em poker. Nao somos casa de apostas, advisor financeiro, contador, advogado ou consultor regulatorio. O conteudo gerado por nossos relatorios e pelo Grindfy AI e informativo e baseado em dados que voce forneceu — nao constitui aconselhamento fiscal, juridico ou de investimento. Resultados passados nao preveem resultados futuros e nenhum retorno e garantido. Para questoes de IRPF, declaracao fiscal, staking, contratos ou regulamentacao, consulte um profissional especializado (contador, advogado). Jogue com responsabilidade.";

// Versao curta para system prompt (cache footprint menor).
export const REPORT_DISCLAIMER_SHORT =
  "Grindfy e ferramenta de analise — nao e advisor financeiro, contador, advogado nem casa de apostas. Conteudo informativo: resultados passados nao preveem resultados futuros. Para IRPF/staking/contratos: consulte profissional especializado.";

export const DEFLECTION_RULE_REGULATORY =
  "Quando o usuario perguntar sobre IRPF, declaracao fiscal, tax, fisco, imposto, staking, contrato, regulamentacao, lei ou direito → defletir: 'Nao opino sobre isso — para essa questao especifica consulte um profissional especializado (contador, advogado).' NAO invente numeros fiscais, aliquotas ou orientacoes legais. NAO sugira como declarar.";

export const FINANCIAL_CAVEAT_RULE =
  "Em qualquer output que mencione $/BRL/banca/profit/ROI/lucro/retorno → adicionar a frase 'Conteudo informativo — nao garante retorno futuro.' Resultados passados nao preveem resultados futuros. NUNCA prometa ganhos, retornos ou recuperacao de banca.";
