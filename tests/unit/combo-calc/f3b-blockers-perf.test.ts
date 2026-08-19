// F3b — regressao de tempo do contrafactual do bloqueador no flop.
// Spec  : Docs/specs/range-lab/F3b-decisao.md (RF-03.3, "Custo" / D-F3-13)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//         (D-F3-27, "Obrigacoes de teste", secao Confianca)
//
// POR QUE ESTE ARQUIVO EXISTE SEPARADO
//
// O ADR declara confianca **Media** no custo do contrafactual e **Baixa** na
// estimativa de quantos combos um range real bloqueia — o "~30" veio de um range
// de 15% desenhado a mao. A traducao das contagens de runout para milissegundos
// e EXTRAPOLACAO da medida da F1 (233.640 showdowns em 7,0 ms) e nao foi medida
// nesta frente. O teto fica aqui como obrigacao, nao como presuncao.
//
// E a justificativa do botao da D-F3-13 MUDOU: nao e mais "duas corridas do
// motor" (este desenho evita), e sim "trabalho sincrono na thread principal a
// cada tecla". Por isso o fixture e deliberadamente DESCONFORTAVEL: 97 classes,
// 565 combos do vilao, 64 deles mortos pelo `As 6s` do heroi no flop `Ad 8h 4h`.
//
// O TETO. 1.081 runouts x (1 avaliacao do heroi + ate 64 dos bloqueados) da da
// ordem de 70 mil chamadas a `evalWithBoard`. O caso de aceite da F1 fez ~560
// mil dessas chamadas mais 233.640 comparacoes em 7,0 ms na mesma maquina. 150 ms
// deixa mais de 20x de folga e ainda assim reprova o modo de falha que importa:
// reenumerar o range do vilao (Refutacao 1), rodar o motor de novo (D-F3-27) ou
// avaliar TODOS os combos por runout em vez de so os bloqueados.
//
// Afrouxar o alvo aqui nao e uma das saidas. Se estourar, a saida e a da spec:
// manter a contagem (barata, local) e declarar o delta atras do botao — que ja e
// o desenho fora do river.
import { describe, it, expect } from "vitest";
import { analyzeBlockers } from "@/lib/combo-calc/blockers";
import type { BlockerReport } from "@/lib/combo-calc/blockers";
import {
  FLOP_RUNOUTS_ENUMERATED,
  V3B_WIDE_FLOP,
  WIDE_BLOCKED_COMBOS,
  WIDE_TOTAL_VILLAIN_COMBOS,
  blockedVillainRows,
  runExact,
} from "./f3b-fixtures";

const TETO_MS = 150;
const RUNS = 5;

function analisar(result: ReturnType<typeof runExact>): BlockerReport {
  const out = analyzeBlockers({
    result,
    board: V3B_WIDE_FLOP.board,
    computeDelta: true,
  });
  if ("status" in out && out.status === "unavailable") {
    throw new Error(`o caso de tempo degradou (${out.reason})`);
  }
  return out as BlockerReport;
}

describe("F3b — o contrafactual do flop com range largo cabe na thread principal", () => {
  it("o fixture continua desconfortavel: 565 combos, 64 bloqueados", () => {
    // Sem esta assercao, "ficar rapido" porque o range encolheu passaria no teste
    // de tempo abaixo — que e exatamente o modo de falha que ele deveria pegar.
    const result = runExact(V3B_WIDE_FLOP, "fixture largo");
    expect(result.perVillainCombo.length).toBe(WIDE_TOTAL_VILLAIN_COMBOS);
    expect(blockedVillainRows(result).length).toBe(WIDE_BLOCKED_COMBOS);
  });

  it("o trabalho e feito de verdade: 1.081 runouts e os 64 combos contados", () => {
    const rel = analisar(runExact(V3B_WIDE_FLOP, "trabalho feito"));
    expect(rel.blockedCombos).toBe(WIDE_BLOCKED_COMBOS);
    expect(rel.delta.status).toBe("ok");
    if (rel.delta.status !== "ok") return;
    expect(
      rel.delta.runoutsEnumerated,
      "enumerar menos runouts nao e otimizar: e responder outra pergunta",
    ).toBe(FLOP_RUNOUTS_ENUMERATED);
  });

  it(`a mediana de ${RUNS} corridas fica abaixo de ${TETO_MS} ms`, () => {
    // A corrida do motor fica FORA da medicao: o que esta sob teste e o
    // contrafactual, nao o laco da F1 (que ja tem teto proprio).
    const result = runExact(V3B_WIDE_FLOP, "medicao");

    // Aquecimento: a primeira chamada paga o JIT e as tabelas de modulo.
    analisar(result);

    const amostras: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      const rel = analisar(result);
      amostras.push(performance.now() - t0);
      expect(rel.blockedCombos).toBe(WIDE_BLOCKED_COMBOS);
    }

    const ordenadas = [...amostras].sort((a, b) => a - b);
    const mediana = ordenadas[Math.floor(RUNS / 2)];
    expect(
      mediana,
      `mediana ${mediana.toFixed(2)} ms (corridas: ${amostras
        .map((x) => x.toFixed(2))
        .join(", ")} ms). O teto de ${TETO_MS} ms vem da extrapolacao da F1 ` +
        "(233.640 showdowns em 7,0 ms); estourar aqui e sinal de reenumeracao do " +
        "range ou de segunda corrida do motor, nao de maquina lenta.",
    ).toBeLessThan(TETO_MS);
  }, 120_000);

  it("sem o delta, a contagem e barata: ela nao pode depender do laco de runouts", () => {
    const result = runExact(V3B_WIDE_FLOP, "so contagem");
    const t0 = performance.now();
    const out = analyzeBlockers({
      result,
      board: V3B_WIDE_FLOP.board,
      computeDelta: false,
    });
    const ms = performance.now() - t0;
    if ("status" in out && out.status === "unavailable") throw new Error("degradou sem delta");
    expect((out as BlockerReport).blockedCombos).toBe(WIDE_BLOCKED_COMBOS);
    expect(
      ms,
      `${ms.toFixed(2)} ms so para contar: o laco de runouts rodou mesmo com computeDelta false`,
    ).toBeLessThan(TETO_MS / 3);
  }, 60_000);
});
