// F3b / D-F3-16 + D-F3-32 — as frases nascem de funcao pura, nao de JSX.
// Spec  : Docs/specs/range-lab/F3b-decisao.md ("A tela (D-F3-16)", criterio 3 e 6)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md (D-F3-32)
//
// POR QUE ISTO E TESTE UNITARIO E NAO RTL
//
// A D-F3-16 e requisito de aceite: "numero nunca aparece solto; sempre em frase,
// com sujeito, com a consequencia escrita". Requisito de aceite que so existe
// dentro de JSX so se testa cacando texto no DOM — o anti-padrao da licao #2.
// As frases moram em `uiRules.ts`, que ja e o modulo desse genero no Range Lab
// (`describeSpotReadiness`, com PT-BR dentro e teste unitario proprio). NAO ha
// modulo de copy novo: um segundo lugar para a mesma coisa e como a divergencia
// entra.
//
// CONTRATO assumido (o implementer acrescenta isto a `uiRules.ts`):
//
//   export type MdfCopy =
//     | { status: "ok"; headline: string; heroEquityLine: string; defenseLine: string;
//         mdfLine: string; balanceLine: string | null; action: string;
//         formulaTooltip: string }
//     | { status: "degraded"; reason: MdfDegradedReason; headline: string;
//         action: string; formulaTooltip: string };
//   export function describeMdf(input: {
//     mdf: MdfResult; requiredEquity: number; balance: BluffBalance | null;
//   }): MdfCopy;
//
//   export function describeCascadeStep(step: CascadeStep): { label: string; note: string | null };
//   export function describeBlockerUnavailable(
//     availability: Extract<BlockerAvailability, { available: false }>,
//   ): string;
//
// O teste de UI verifica FIACAO; este verifica COPY. Nenhum dos dois faz o
// trabalho do outro.
import { describe, it, expect } from "vitest";
import { describeMdf, describeCascadeStep, describeBlockerUnavailable } from "@/lib/combo-calc/uiRules";
import { computeMdf, computeBluffBalance } from "@/lib/combo-calc/mdf";
import type { MdfOk } from "@/lib/combo-calc/mdf";

/** Sujeito da frase: sem isto, "33%" na tela nao diz de quem e. */
const SUJEITO = /\b(voc[eê]|vc|seu|sua|ele|dele)\b/i;
const FORMULA = /B\s*\/\s*\(\s*P\s*\+\s*B\s*\)/;

function camposDeTexto(copy: unknown): Array<[string, string]> {
  return Object.entries(copy as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
}

function mdfOk(pot: number, call: number): MdfOk {
  const out = computeMdf(pot, call);
  if (out.status !== "ok") throw new Error(`computeMdf(${pot}, ${call}) degradou`);
  return out;
}

/** O cartao do exemplo da spec: pote antes da aposta 20, aposta 10. */
function copyDoExemplo(comBalance = true) {
  const m = mdfOk(30, 10);
  return describeMdf({
    mdf: m,
    requiredEquity: 0.25,
    balance: comBalance
      ? computeBluffBalance(m, { value: 18, bluff: 4, chop: 0, unknown: 0 })
      : null,
  });
}

// ── nenhuma porcentagem sem dono ─────────────────────────────

describe("F3b D-F3-16 — toda porcentagem vem com sujeito na MESMA frase", () => {
  it("nenhum campo tem '%' sem dizer de quem ele e", () => {
    // Numero solto ao lado de rotulo curto ("alpha 25% · MDF 67%") e por onde a
    // confusao entra: sao tres porcentagens parecidas no mesmo cartao.
    const copy = copyDoExemplo();
    for (const [campo, texto] of camposDeTexto(copy)) {
      if (!texto.includes("%")) continue;
      expect(
        SUJEITO.test(texto),
        `campo ${campo} carrega porcentagem sem sujeito: "${texto}"`,
      ).toBe(true);
    }
  });

  it("as tres frases existem e cada uma carrega a sua porcentagem", () => {
    const copy = copyDoExemplo();
    expect(copy.status).toBe("ok");
    if (copy.status !== "ok") return;
    for (const campo of ["heroEquityLine", "defenseLine", "mdfLine"] as const) {
      expect(copy[campo], `${campo} vazio`).toBeTruthy();
      expect(copy[campo].includes("%"), `${campo} sem porcentagem`).toBe(true);
    }
  });

  it("os tres numeros do exemplo da spec aparecem: 25%, 33% e 67%", () => {
    // Sem isto, um cartao com tres frases bonitas e nenhum numero passaria.
    const copy = copyDoExemplo();
    if (copy.status !== "ok") throw new Error("copy degradada num caso valido");
    expect(copy.heroEquityLine, "a equity que VOCE precisa para pagar").toMatch(/25([.,]\d+)?\s*%/);
    expect(copy.defenseLine, "quanto o blefe DELE precisa funcionar").toMatch(/33([.,]\d+)?\s*%/);
    expect(copy.mdfLine, "o MDF").toMatch(/6[67]([.,]\d+)?\s*%/);
  });

  it("as frases do heroi e do vilao NAO usam o mesmo sujeito", () => {
    // As duas porcentagens vizinhas sao de donos diferentes; e a unica coisa que
    // impede o jogador de somar 25% com 67% com os olhos.
    const copy = copyDoExemplo();
    if (copy.status !== "ok") return;
    expect(/\b(voc[eê]|seu|sua)\b/i.test(copy.heroEquityLine)).toBe(true);
    expect(/\b(ele|dele)\b/i.test(copy.defenseLine)).toBe(true);
  });
});

// ── a formula so no tooltip ──────────────────────────────────

describe("F3b D-F3-16 — a formula vive no tooltip e em lugar nenhum mais", () => {
  it("`B / (P + B)` aparece em formulaTooltip", () => {
    const copy = copyDoExemplo();
    if (copy.status !== "ok") throw new Error("copy degradada num caso valido");
    expect(copy.formulaTooltip).toMatch(FORMULA);
  });

  it("e NAO vaza para nenhum outro campo", () => {
    const copy = copyDoExemplo();
    for (const [campo, texto] of camposDeTexto(copy)) {
      if (campo === "formulaTooltip") continue;
      expect(FORMULA.test(texto), `a formula vazou para a face do cartao (${campo}): "${texto}"`).toBe(
        false,
      );
    }
  });
});

// ── o veredito e frase de acao ───────────────────────────────

describe("F3b D-F3-16 — o veredito final e acao, nao numero", () => {
  it("`action` nao contem digito nenhum", () => {
    for (const comBalance of [true, false]) {
      const copy = copyDoExemplo(comBalance);
      expect(
        /\d/.test(copy.action),
        `action carrega numero ("${copy.action}"): o veredito e "da pra foldar mais", nao "5"`,
      ).toBe(false);
      expect(copy.action.length, "action vazia").toBeGreaterThan(0);
    }
  });

  it("blefe de menos e blefe de mais produzem acoes DIFERENTES", () => {
    const m = mdfOk(30, 10);
    const falta = describeMdf({
      mdf: m,
      requiredEquity: 0.25,
      balance: computeBluffBalance(m, { value: 18, bluff: 4, chop: 0, unknown: 0 }),
    });
    const sobra = describeMdf({
      mdf: m,
      requiredEquity: 0.25,
      balance: computeBluffBalance(m, { value: 18, bluff: 14, chop: 0, unknown: 0 }),
    });
    expect(
      falta.action,
      "o mesmo veredito para 'faltam blefes' e 'blefa demais' apaga a frente inteira",
    ).not.toBe(sobra.action);
  });

  it("sem corrida, o bloco de value/blefe fica null e o cartao continua de pe", () => {
    // As tres porcentagens NAO dependem do motor: saem de pote e call. Esconder o
    // cartao atras do resultado seria perda gratuita (D-F3-34).
    const copy = copyDoExemplo(false);
    expect(copy.status).toBe("ok");
    if (copy.status !== "ok") return;
    expect(copy.balanceLine).toBeNull();
    expect(copy.mdfLine.includes("%")).toBe(true);
  });

  it("a linha de balanco cita a massa de value, os blefes necessarios e o que falta", () => {
    const copy = copyDoExemplo();
    if (copy.status !== "ok") return;
    const linha = copy.balanceLine ?? "";
    expect(linha).toMatch(/18/); // combos de value
    expect(linha).toMatch(/\b9\b/); // blefes necessarios
    expect(linha).toMatch(/\b5\b/); // o que falta
  });
});

// ── criterio 3: estado sem numero ────────────────────────────

describe("F3b criterio 3 — com P <= 0 nenhuma frase carrega digito", () => {
  const CASOS: Array<[string, number, number]> = [
    ["aposta maior que o pote", 10, 100],
    ["aposta igual ao pote", 10, 10],
    ["pote NaN", NaN, 10],
    ["pote Infinity", Infinity, 10],
  ];

  for (const [nome, pot, call] of CASOS) {
    it(`${nome}: o cartao vira frase de estado, sem numero`, () => {
      const copy = describeMdf({
        mdf: computeMdf(pot, call),
        requiredEquity: 0.25,
        balance: null,
      });
      expect(copy.status).toBe("degraded");
      for (const [campo, texto] of camposDeTexto(copy)) {
        expect(
          /\d/.test(texto),
          `campo ${campo} carrega digito no estado degradado: "${texto}". ` +
            "Zero seria pior que vazio, e um NaN que passa vira cartao de tracinhos.",
        ).toBe(false);
        expect(texto.includes("NaN"), `campo ${campo} escreveu NaN`).toBe(false);
        expect(texto.includes("undefined"), `campo ${campo} escreveu undefined`).toBe(false);
      }
    });
  }

  it("o estado degradado explica o que fazer, nao so que quebrou", () => {
    const copy = describeMdf({ mdf: computeMdf(10, 100), requiredEquity: 0.25, balance: null });
    expect(copy.status).toBe("degraded");
    expect(copy.headline.length, "frase de estado vazia").toBeGreaterThan(10);
    expect(copy.action.length).toBeGreaterThan(0);
  });
});

// ── rotulos da cascata ───────────────────────────────────────

describe("F3b F-4 — fora do river o rotulo diz `massa efetiva`, nao `combos que perdem`", () => {
  it("degrau 5 com base effective escreve massa efetiva", () => {
    // No flop nao existe "combo que perde", existe combo com equity. Foi assim
    // que o `breakevenFrequency` da F0 anunciou 0,42 contra 0,20 real (D11).
    const texto = describeCascadeStep({
      id: "loses_to_hero",
      status: "ok",
      mass: 12.5,
      combos: null,
      basis: "effective",
    });
    const junto = `${texto.label} ${texto.note ?? ""}`.toLowerCase();
    expect(junto).toContain("massa efetiva");
    expect(
      junto.includes("combos que perdem"),
      "a base efetiva nao produz contagem de combos: o rotulo estaria mentindo",
    ).toBe(false);
  });

  it("degrau 5 com base discrete pode falar em combos", () => {
    const texto = describeCascadeStep({
      id: "loses_to_hero",
      status: "ok",
      mass: 1,
      combos: 1,
      basis: "discrete",
    });
    const junto = `${texto.label} ${texto.note ?? ""}`.toLowerCase();
    expect(junto.includes("massa efetiva")).toBe(false);
  });

  it("cada degrau tem rotulo proprio e nao repetido", () => {
    const ids = ["nominal", "declared", "after_board_removal", "after_mutual_removal"] as const;
    const rotulos = ids.map(
      (id) => describeCascadeStep({ id, status: "ok", mass: 10, combos: 10, basis: null }).label,
    );
    for (const rotulo of rotulos) {
      expect(rotulo.length, "degrau sem rotulo").toBeGreaterThan(0);
      expect(rotulo.includes("undefined")).toBe(false);
    }
    expect(new Set(rotulos).size, "dois degraus com o mesmo rotulo").toBe(ids.length);
  });

  it("degrau indisponivel explica a razao e nao inventa numero", () => {
    for (const reason of ["no_result", "engine_degraded"] as const) {
      const texto = describeCascadeStep({
        id: "after_mutual_removal",
        status: "unavailable",
        reason,
      });
      expect(texto.note, `razao ${reason} sem nota`).toBeTruthy();
      expect(
        /\b0\b/.test(texto.note ?? ""),
        "escrever zero aqui seria ler 'as suas cartas mataram o range inteiro'",
      ).toBe(false);
    }
  });
});

// ── o motivo do bloqueador ───────────────────────────────────

describe("F3b D-F3-30 — a frase do bloqueador indisponivel e especifica", () => {
  it("hero_is_range cita a CONTAGEM de combos do range", () => {
    // "seu range tem 4 combos; o bloqueador precisa de uma mao so" em vez do
    // generico "indisponivel", que faz o jogador achar que quebrou.
    const frase = describeBlockerUnavailable({
      available: false,
      reason: "hero_is_range",
      heroCombos: 4,
    });
    expect(frase).toMatch(/\b4\b/);
    expect(SUJEITO.test(frase), "a frase nao diz de quem e o range").toBe(true);
    expect(frase.includes("undefined")).toBe(false);
  });

  it("as tres razoes produzem frases diferentes", () => {
    const frases = (["no_result", "engine_degraded", "hero_is_range"] as const).map((reason) =>
      describeBlockerUnavailable({ available: false, reason, heroCombos: reason === "hero_is_range" ? 4 : 0 }),
    );
    for (const frase of frases) expect(frase.length).toBeGreaterThan(0);
    expect(new Set(frases).size, "duas razoes com a mesma frase").toBe(3);
  });

  it("sem resultado, a frase nao inventa contagem", () => {
    const frase = describeBlockerUnavailable({
      available: false,
      reason: "no_result",
      heroCombos: 0,
    });
    expect(/\b0\b/.test(frase), "'seu range tem 0 combos' e ruido, nao explicacao").toBe(false);
  });
});
