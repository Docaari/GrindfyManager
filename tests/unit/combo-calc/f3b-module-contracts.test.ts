// F3b — contratos ESTRUTURAIS dos quatro modulos novos.
// ADR: Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//      (D-F3-12/23 arvore de dependencia, D-F3-24 o terceiro modulo,
//       D-F3-27 sem segunda corrida, D-F3-28 reentrancia do fastEvaluator)
//
// POR QUE UM TESTE QUE LE O CODIGO-FONTE
//
// Duas decisoes desta frente nao produzem sintoma ate produzirem um numero
// errado, e nenhuma delas e observavel pelo valor de retorno:
//
// 1. `mdf.ts` NAO importa `ev.ts` (D-F3-12). E o que torna `MDF = 1 - alpha do
//    heroi` IMPOSSIVEL DE ESCREVER POR ACIDENTE. O teste de valor ja trava a
//    desigualdade; este trava a tentacao, que e o que volta seis meses depois.
// 2. `blockers.ts` NAO tem `async` interno (D-F3-28). `loadBoard` e estado de
//    MODULO, deliberado, e agora tem DOIS clientes. Quem chama `evalWithBoard`
//    chama `loadBoard` no mesmo bloco sincrono; ceder a thread no meio so quebra
//    sob concorrencia com o runner sincrono de fallback (D14), e ai o sintoma e
//    um numero errado, nao um erro.
//
// 3. E `blockers.ts` nao pode importar o motor: a Refutacao 1 apagou o trabalho
//    que a spec supunha necessario, e uma segunda corrida voltaria a excluir os
//    pares por `collides()` — exatamente os combos que o painel existe para
//    medir.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../../client/src/lib/combo-calc/", import.meta.url));

function fonte(arquivo: string): string {
  return readFileSync(`${RAIZ}${arquivo}`, "utf-8");
}

/** Especificadores de todos os `import` / `export ... from` do arquivo. */
function importsDe(arquivo: string): string[] {
  const texto = fonte(arquivo);
  const out: string[] = [];
  const re = /\b(?:import|export)\b[^;'"]*?\bfrom\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) out.push(m[1]);
  const dinamico = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dinamico.exec(texto)) !== null) out.push(m[1]);
  return out;
}

/** Remove comentarios de linha e de bloco antes de procurar palavra-chave. */
function semComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const MODULOS = ["mdf.ts", "confront.ts", "cascade.ts", "blockers.ts"];

// ── 1. o achado F-1, travado na estrutura ────────────────────

describe("F3b D-F3-12 — mdf.ts nao conhece ev.ts", () => {
  it("nenhum import de `ev` em mdf.ts", () => {
    const especificadores = importsDe("mdf.ts");
    for (const spec of especificadores) {
      expect(
        /(^|\/)ev(\.ts)?$/.test(spec),
        `mdf.ts importa "${spec}". Os dois alphas vao para o MESMO cartao; ` +
          "nome compartilhado e como um vira o outro seis meses depois (achado F-1).",
      ).toBe(false);
    }
  });

  it("mdf.ts nao importa o motor nem os outros modulos da frente", () => {
    // "Modulo de aritmetica minima" da D-F3-12: se ele passar a depender de
    // `confront.ts`, o `blockers.ts` acaba importando `mdf.ts` e a arvore vira
    // ciclo.
    for (const spec of importsDe("mdf.ts")) {
      expect(/engine\//.test(spec), `mdf.ts importa o motor ("${spec}")`).toBe(false);
      expect(
        /(^|\/)(confront|cascade|blockers)(\.ts)?$/.test(spec),
        `mdf.ts importa "${spec}" — a arvore de dependencia da D-F3-24 e rasa e aciclica`,
      ).toBe(false);
    }
  });

  it("a palavra `requiredEquity` nao aparece em mdf.ts", () => {
    expect(
      semComentarios(fonte("mdf.ts")).includes("requiredEquity"),
      "reusar o alpha do heroi como MDF e o achado F-1 voltando pela porta dos fundos",
    ).toBe(false);
  });
});

// ── 2. a arvore de dependencia ───────────────────────────────

describe("F3b D-F3-24 — a arvore dos quatro modulos e rasa e aciclica", () => {
  it("confront.ts nao importa cascade.ts nem blockers.ts", () => {
    for (const spec of importsDe("confront.ts")) {
      expect(
        /(^|\/)(cascade|blockers|mdf)(\.ts)?$/.test(spec),
        `confront.ts importa "${spec}": ele e o modulo COMPARTILHADO, quem depende e o resto`,
      ).toBe(false);
    }
  });

  it("blockers.ts nao importa cascade.ts", () => {
    for (const spec of importsDe("blockers.ts")) {
      expect(/(^|\/)cascade(\.ts)?$/.test(spec), `blockers.ts importa "${spec}"`).toBe(false);
    }
  });

  it("os quatro modulos sao puros: sem React e sem window", () => {
    for (const arquivo of MODULOS) {
      for (const spec of importsDe(arquivo)) {
        expect(
          /^react/.test(spec) || spec.startsWith("@/components"),
          `${arquivo} importa "${spec}": o nucleo puro nao conhece React`,
        ).toBe(false);
      }
      const codigo = semComentarios(fonte(arquivo));
      expect(/\bwindow\./.test(codigo), `${arquivo} toca window`).toBe(false);
      expect(/\bdocument\./.test(codigo), `${arquivo} toca document`).toBe(false);
      expect(/\blocalStorage\b/.test(codigo), `${arquivo} toca localStorage`).toBe(false);
    }
  });
});

// ── 3. sem segunda corrida do motor ──────────────────────────

describe("F3b D-F3-27 — blockers.ts nao roda o motor de novo", () => {
  it("nao importa `engine/run`", () => {
    for (const spec of importsDe("blockers.ts")) {
      expect(
        /engine\/run/.test(spec),
        `blockers.ts importa "${spec}". Rodar o motor de novo voltaria a excluir os ` +
          "pares por collides() — justamente os combos que o painel existe para medir.",
      ).toBe(false);
    }
  });

  it("usa o avaliador rapido, que e quem tem o contrato de bordo carregado", () => {
    const especificadores = importsDe("blockers.ts");
    expect(
      especificadores.some((s) => /fastEvaluator/.test(s)),
      "blockers.ts nao importa fastEvaluator: a enumeracao dos runouts precisa dele",
    ).toBe(true);
  });
});

// ── 4. reentrancia do fastEvaluator ──────────────────────────

describe("F3b D-F3-28 — blockers.ts e sincrono de ponta a ponta", () => {
  it("nao ha `async` no arquivo", () => {
    const codigo = semComentarios(fonte("blockers.ts"));
    expect(
      /\basync\b/.test(codigo),
      "`loadBoard` e estado de modulo: ceder a thread entre ele e o lote de " +
        "`evalWithBoard` faz o segundo cliente ler um bordo que nao e o dele. " +
        "Se um dia precisar ceder, vai para o worker — e ai e mudanca de protocolo.",
    ).toBe(false);
  });

  it("nao ha `await` no arquivo", () => {
    expect(/\bawait\b/.test(semComentarios(fonte("blockers.ts")))).toBe(false);
  });

  it("nao ha `setTimeout`, `queueMicrotask` nem `Promise`", () => {
    const codigo = semComentarios(fonte("blockers.ts"));
    for (const proibido of ["setTimeout", "setInterval", "queueMicrotask", "requestAnimationFrame", "Promise"]) {
      expect(codigo.includes(proibido), `blockers.ts usa ${proibido}: cede a thread`).toBe(false);
    }
  });

  it("o contrato de reentrancia esta ESCRITO no topo do fastEvaluator", () => {
    // O `fastEvaluator` passa a ter dois clientes, e o proximo nao vai ler o ADR.
    const topo = fonte("fastEvaluator.ts").slice(0, 3000);
    expect(
      /loadBoard/.test(topo) && /(sincron|reentr|mesmo bloco)/i.test(topo),
      "o contrato da D-F3-28 nao foi escrito no topo de fastEvaluator.ts",
    ).toBe(true);
  });
});
