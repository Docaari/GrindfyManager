/**
 * GOLD STANDARD — o molde de codigo do Grindfy.
 *
 * Nao faz parte do produto. Existe para ser copiado na FORMA, nao no conteudo.
 * Roda sozinho, sem framework de teste:
 *
 *     npx tsx Docs/padrao/exemplo-padrao.ts
 *     # 14/14 casos
 *
 * O recorte: normalizar o buy-in de um torneio (que chega do parser ou do
 * Postgres em moeda nativa e, no caso do `numeric`, como STRING) para USD, e
 * classificar a banda de ABI. Cabe numa tela e exercita todas as decisoes que
 * se repetem no projeto de verdade: dinheiro, FX, valor ausente, contrato de
 * retorno, degradacao explicita e aviso em vez de silencio.
 *
 * Guia que explica cada decisao: Docs/desenvolvimento/07-GOLD-STANDARD.md
 */

// --------------------------------------------------------------------------
// Constantes no topo, com o motivo ao lado.
// --------------------------------------------------------------------------

/**
 * Bandas de ABI em USD. Fronteira INCLUSIVA no piso e exclusiva no teto:
 * um torneio de exatamente 22 USD e "22-55", nunca "5.5-22". Sem essa regra
 * escrita, cada relatorio classificava a fronteira de um jeito e o mesmo
 * torneio aparecia em duas bandas em telas diferentes.
 */
const ABI_BANDS: ReadonlyArray<{ readonly floor: number; readonly label: string }> = [
  { floor: 0, label: "0-5.5" },
  { floor: 5.5, label: "5.5-22" },
  { floor: 22, label: "22-55" },
  { floor: 55, label: "55-109" },
  { floor: 109, label: "109-215" },
  { floor: 215, label: "215+" },
];

/**
 * Teto de sanidade em USD. OCR e CSV de rede trocam separador e ja produziram
 * buy-in de 1.090.000 a partir de "1,090.00". Valor absurdo precisa ser
 * RECUSADO, nao usado: um unico torneio assim envenena o ABI do mes inteiro.
 */
const MAX_PLAUSIBLE_BUYIN_USD = 100_000;

/** USD nao precisa de cotacao; qualquer outra moeda precisa. */
const BASE_CURRENCY = "USD";

// --------------------------------------------------------------------------
// Contrato de retorno: SEMPRE o mesmo shape, de certo ou de errado.
// Quem chama nunca precisa descobrir se recebeu objeto, excecao ou null.
// --------------------------------------------------------------------------

export type NormalizeBuyinDegradedReason =
  | "buyin_missing"
  | "buyin_unparseable"
  | "buyin_implausible"
  | "fx_rate_missing";

export interface NormalizedBuyin {
  /** USD, ou null quando nao deu para saber. NUNCA zero inventado. */
  readonly usd: number | null;
  /** Banda de ABI, ou null junto com `usd`. */
  readonly band: string | null;
  /** Nomeada, no padrao dos geradores de relatorio do Coach. */
  readonly degradedReason: NormalizeBuyinDegradedReason | null;
  /** Sempre presente, mesmo vazia. Quem chama decide o que mostrar. */
  readonly warnings: readonly string[];
}

export interface NormalizeBuyinInput {
  /** Como chega do pg (`numeric` vira string) ou do parser. */
  readonly amount: string | number | null | undefined;
  readonly currency: string | null | undefined;
  /** Cotacoes por unidade de moeda em USD. Ex.: { BRL: 0.185 }. */
  readonly usdRates: Readonly<Record<string, number>>;
}

// --------------------------------------------------------------------------
// Helpers puros e pequenos. Um proposito cada.
// --------------------------------------------------------------------------

/**
 * Converte o que o pg/parser entrega em numero finito.
 *
 * `numeric` do Postgres chega como string ("12.50"), o parser as vezes entrega
 * number, e valor ausente chega como null, undefined ou "". Aceitar os tres e
 * responsabilidade da FRONTEIRA — o resto do codigo trabalha so com number.
 *
 * Devolve null em vez de NaN de proposito: NaN se propaga em silencio por toda
 * conta que encostar nele; null quebra na hora que alguem tentar somar.
 */
function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Recusa leitura absurda antes de aceitar.
 * Negativo nao existe em buy-in; acima do teto e erro de separador.
 */
function isPlausibleBuyin(usd: number): boolean {
  return usd >= 0 && usd <= MAX_PLAUSIBLE_BUYIN_USD;
}

/** Banda de ABI. Percorre de tras para frente: a primeira que cabe vence. */
function resolveAbiBand(usd: number): string {
  for (let i = ABI_BANDS.length - 1; i >= 0; i -= 1) {
    if (usd >= ABI_BANDS[i].floor) return ABI_BANDS[i].label;
  }
  return ABI_BANDS[0].label;
}

// --------------------------------------------------------------------------
// A funcao publica.
// --------------------------------------------------------------------------

/**
 * Normaliza um buy-in para USD e classifica a banda de ABI.
 *
 * Regra do projeto: dinheiro so se compara na mesma moeda. Todo threshold do
 * Grindfy (bankroll, selector, metas) e em USD; comparar valor nativo com
 * threshold em dolar foi o bug de FX do grind-live, que passou por varias
 * sessoes sem ninguem ver porque o numero errado parecia certo.
 */
export function normalizeBuyinToUsd(input: NormalizeBuyinInput): NormalizedBuyin {
  const warnings: string[] = [];

  const amount = toFiniteNumber(input.amount);
  if (amount === null) {
    // Distingue "nao veio" de "veio quebrado": sao incidentes diferentes e o
    // segundo indica parser errado, nao dado faltando.
    const missing = input.amount === null || input.amount === undefined || input.amount === "";
    const reason: NormalizeBuyinDegradedReason = missing ? "buyin_missing" : "buyin_unparseable";
    warnings.push(
      missing
        ? "buy-in ausente; torneio nao entra em nenhuma metrica de ABI"
        : `buy-in ilegivel (${JSON.stringify(input.amount)}); verificar o parser da rede`,
    );
    return { usd: null, band: null, degradedReason: reason, warnings };
  }

  const currency = (input.currency ?? BASE_CURRENCY).trim().toUpperCase() || BASE_CURRENCY;

  let usd: number;
  if (currency === BASE_CURRENCY) {
    usd = amount;
  } else {
    const rate = input.usdRates[currency];
    // `?? 1` aqui seria o erro classico: trata BRL como dolar e mente sem erro.
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      console.warn(`[buyin] sem cotacao USD para ${currency}; valor nao normalizado`);
      warnings.push(`sem cotacao USD para ${currency}; buy-in nao comparavel`);
      return { usd: null, band: null, degradedReason: "fx_rate_missing", warnings };
    }
    usd = amount * rate;
  }

  if (!isPlausibleBuyin(usd)) {
    warnings.push(
      `buy-in implausivel apos conversao (${usd.toFixed(2)} USD); ` +
        "provavel separador decimal errado no import",
    );
    return { usd: null, band: null, degradedReason: "buyin_implausible", warnings };
  }

  return { usd, band: resolveAbiBand(usd), degradedReason: null, warnings };
}

// --------------------------------------------------------------------------
// Teste embutido. Sem framework, com placar impresso.
// Cada caso diz O QUE PROTEGE — nunca "caso 3".
// --------------------------------------------------------------------------

interface Case {
  readonly protects: string;
  readonly input: NormalizeBuyinInput;
  readonly expect: (result: NormalizedBuyin) => boolean;
}

const RATES = { BRL: 0.185, EUR: 1.09, CNY: 0.14 } as const;

const CASES: readonly Case[] = [
  {
    protects: "USD passa direto, sem cotacao",
    input: { amount: 109, currency: "USD", usdRates: RATES },
    expect: (r) => r.usd === 109 && r.band === "109-215" && r.degradedReason === null,
  },
  {
    protects: "numeric do pg chega como string e e aceito",
    input: { amount: "22.00", currency: "USD", usdRates: RATES },
    expect: (r) => r.usd === 22 && r.band === "22-55",
  },
  {
    protects: "moeda nativa e convertida antes de classificar",
    input: { amount: 500, currency: "BRL", usdRates: RATES },
    expect: (r) => r.usd !== null && Math.abs(r.usd - 92.5) < 1e-9 && r.band === "55-109",
  },
  {
    protects: "moeda em minuscula e com espaco continua valida",
    input: { amount: 100, currency: " eur ", usdRates: RATES },
    expect: (r) => r.usd !== null && Math.abs(r.usd - 109) < 1e-9,
  },
  {
    protects: "moeda ausente assume USD, nao quebra",
    input: { amount: 33, currency: null, usdRates: RATES },
    expect: (r) => r.usd === 33 && r.degradedReason === null,
  },
  {
    protects: "sem cotacao devolve null, NUNCA o valor nativo como se fosse USD",
    input: { amount: 500, currency: "GBP", usdRates: RATES },
    expect: (r) => r.usd === null && r.degradedReason === "fx_rate_missing",
  },
  {
    protects: "cotacao zero e tratada como ausente (divide/multiplica errado)",
    input: { amount: 500, currency: "BRL", usdRates: { BRL: 0 } },
    expect: (r) => r.usd === null && r.degradedReason === "fx_rate_missing",
  },
  {
    protects: "buy-in ausente e distinguido de buy-in ilegivel",
    input: { amount: null, currency: "USD", usdRates: RATES },
    expect: (r) => r.degradedReason === "buyin_missing",
  },
  {
    protects: "texto que nao e numero vira incidente de parser, nao zero",
    input: { amount: "R$ 55,00", currency: "BRL", usdRates: RATES },
    expect: (r) => r.usd === null && r.degradedReason === "buyin_unparseable",
  },
  {
    protects: "string vazia conta como ausente, nao como zero",
    input: { amount: "", currency: "USD", usdRates: RATES },
    expect: (r) => r.usd === null && r.degradedReason === "buyin_missing",
  },
  {
    protects: "freeroll de verdade (0) e valido e cai na primeira banda",
    input: { amount: 0, currency: "USD", usdRates: RATES },
    expect: (r) => r.usd === 0 && r.band === "0-5.5" && r.degradedReason === null,
  },
  {
    protects: "separador errado no import e recusado, nao classificado",
    input: { amount: "1090000", currency: "USD", usdRates: RATES },
    expect: (r) => r.usd === null && r.degradedReason === "buyin_implausible",
  },
  {
    protects: "fronteira de banda e inclusiva no piso",
    input: { amount: 22, currency: "USD", usdRates: RATES },
    expect: (r) => r.band === "22-55",
  },
  {
    protects: "acima do topo cai na banda aberta, sem estourar o array",
    input: { amount: 1050, currency: "USD", usdRates: RATES },
    expect: (r) => r.band === "215+",
  },
];

function run(): void {
  let passed = 0;
  const failures: string[] = [];

  for (const testCase of CASES) {
    const result = normalizeBuyinToUsd(testCase.input);
    if (testCase.expect(result)) {
      passed += 1;
    } else {
      failures.push(`  FALHOU: ${testCase.protects}\n    recebeu: ${JSON.stringify(result)}`);
    }
  }

  // Invariante que nenhum caso individual verifica: toda leitura que falhou
  // AVISOU. E o Artigo IV em forma de teste — silencio e o bug caro daqui.
  let silentFailures = 0;
  for (const testCase of CASES) {
    const result = normalizeBuyinToUsd(testCase.input);
    if (result.usd === null && result.warnings.length === 0) silentFailures += 1;
  }
  if (silentFailures > 0) {
    failures.push(`  FALHOU: ${silentFailures} caso(s) devolveram null sem aviso`);
  } else {
    passed += 1;
  }

  const total = CASES.length + 1;
  if (failures.length > 0) {
    console.error(failures.join("\n"));
  }
  console.log(`${passed}/${total} casos`);
  if (failures.length > 0) process.exitCode = 1;
}

// Roda so quando chamado direto, nunca quando importado por outro modulo.
if (process.argv[1] && process.argv[1].includes("exemplo-padrao")) run();
