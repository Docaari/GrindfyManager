// F2 — Alt+arrastar fixa UM naipe por gesto (D-F2-5, ADR-247, decisao do
// founder). Depende do drag por pointer events de RF-02.1 (D-F2-1), coberto
// separadamente em range-matrix-drag-pointer.test.tsx — este arquivo NAO
// repete os testes de drag simples, so o comportamento ESPECIFICO de Alt.
//
// Decisao do founder (ja fechada no ADR, nao reaberta aqui): no `pointerdown`
// de um Alt+drag, se ainda nao ha naipe escolhido NESTA SESSAO, abre um
// mini-seletor de 4 naipes antes do drag prosseguir; se ja existe, reusa sem
// perguntar de novo. O naipe escolhido vale para o gesto INTEIRO — toda
// classe tocada recebe `entry.suits` filtrado para aquele UNICO naipe.
//
// Duas coisas que o ADR deixou para o test-writer fechar (nao decidiu ele
// mesmo — "Media" de confianca em D-F2-5, texto explicito: "fica para o
// test-writer fechar como caso de borda"):
//
// 1. ONDE mora `altDragSuit` (estado de sessao). Nao ha prop nova documentada
//    em RangeMatrixProps para isso, e o unico precedente de estado efemero de
//    gesto que a F2 ja criou (`lastCell`, do Shift+clique) mora DENTRO de
//    RangeMatrix, local ao componente — nao no dono do estado (diferente de
//    `history`, que D-F2-2 e explicito que mora fora). Decisao deste arquivo:
//    `altDragSuit` mora DENTRO de RangeMatrix, por instancia — ou seja, o
//    range do heroi e o do vilao podem (no pior caso) perguntar o naipe
//    separadamente um do outro. Isso NAO contradiz o ADR (que fala em "sessao
//    da pagina" mas nao amarra a implementacao a um estado global) e segue o
//    precedente de `lastCell` que a propria F2 ja estabeleceu. Se o
//    implementer preferir levantar isso para o dono do estado (prop
//    controlada, tipo `altDragSuit`/`onAltDragSuitChange`), os testes deste
//    arquivo continuam validos desde que UMA instancia da matriz nao
//    pergunte duas vezes — o que e testado abaixo.
//
// 2. O que acontece se o jogador soltar o ponteiro ENQUANTO o mini-seletor
//    esta aberto (antes de escolher um naipe). Decisao deste arquivo: o
//    gesto e CANCELADO — nenhuma classe recebe `suits`, o mini-seletor
//    fecha, e `altDragSuit` continua null (a proxima tentativa de Alt+drag
//    pergunta de novo). Alternativa descartada: manter o mini-seletor aberto
//    ate o jogador escolher, sem pointer pressionado — rejeitada porque criaria
//    um popover "orfao" sem gesto em andamento para aplicar a escolha.
//
// Contrato assumido (novo em RangeMatrix.tsx):
//   - Alt+pointerdown numa celula abre um mini-seletor SE `altDragSuit` (ou
//     equivalente) ainda nao foi escolhido nesta instancia.
//   - testid do container: `alt-drag-suit-picker`.
//   - testid de cada botao de naipe: `alt-drag-suit-c` | `-d` | `-h` | `-s`.
//   - Escolher um naipe aplica IMEDIATAMENTE `suits: [comboKey(...)]` na
//     celula onde o pointerdown comecou (ela ja fazia parte do gesto).
//   - pointerenter subsequente em outra celula SUITED aplica o MESMO naipe.
//   - Alt+pointerdown seguinte (mesma instancia, `altDragSuit` ja resolvido)
//     NAO reabre o mini-seletor — aplica direto.
//
// Escopo (pedido explicito do prompt desta rodada): so o caso simples de
// classes SUITED (cada naipe = exatamente 1 comboKey, ja que suited so tem 1
// combo por naipe — par e offsuit ficam fora, tem semantica de "naipe" menos
// obvia e nao foram pedidos nesta rodada).
//
// LICOES: #14/#26/#38 (SO `await import`), #2 (data-testid).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React, { useState } from "react";
import type { RangeEntry } from "@/lib/combo-calc/types";
import { comboKey, parseCard } from "@/lib/combo-calc/cards";

const MATRIX_PATH = "../../../client/src/components/range-lab/RangeMatrix";

async function loadRangeMatrix() {
  const mod: any = await import(/* @vite-ignore */ MATRIX_PATH);
  return mod.RangeMatrix ?? mod.default;
}

function makeControlledHarness(RangeMatrix: any) {
  return function ControlledHarness() {
    const [entries, setEntries] = useState<RangeEntry[]>([]);
    return <RangeMatrix entries={entries} onChange={setEntries} testId="alt-drag-matrix" />;
  };
}

async function renderControlled() {
  const RangeMatrix = await loadRangeMatrix();
  const ControlledHarness = makeControlledHarness(RangeMatrix);
  return render(<ControlledHarness />);
}

function card(spec: string) {
  const c = parseCard(spec);
  if (!c) throw new Error(`carta invalida na fixture: ${spec}`);
  return c;
}

/** comboKey do combo suited de `notation` (ex.: "T9s") no naipe `suit` ("s"). */
function suitedComboKey(notation: string, suit: string): string {
  const hi = notation[0];
  const lo = notation[1];
  return comboKey(card(hi + suit), card(lo + suit));
}

function entryOf(entries: RangeEntry[], notation: string): RangeEntry | undefined {
  return entries.find((e) => e.notation === notation);
}

const P = { pointerId: 1, pointerType: "mouse" as const };
const ALT = { ...P, altKey: true };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("F2 D-F2-5 — Alt+drag abre o mini-seletor na PRIMEIRA vez da sessao", () => {
  it("Alt+pointerdown numa celula suited abre o mini-seletor de 4 naipes", async () => {
    await renderControlled();
    fireEvent.pointerDown(screen.getByTestId("range-cell-T9s"), ALT);

    expect(screen.getByTestId("alt-drag-suit-picker")).toBeInTheDocument();
    for (const suit of ["c", "d", "h", "s"]) {
      expect(screen.getByTestId(`alt-drag-suit-${suit}`)).toBeInTheDocument();
    }
  });

  it("pointerdown SEM Alt nao abre o mini-seletor", async () => {
    await renderControlled();
    fireEvent.pointerDown(screen.getByTestId("range-cell-T9s"), P);
    expect(screen.queryByTestId("alt-drag-suit-picker")).toBeNull();
  });
});

describe("F2 D-F2-5 — caso simples: Alt+drag sobre duas celulas suited termina com o MESMO naipe nas duas", () => {
  it("escolhido o naipe, a celula inicial E a tocada pelo drag ganham suits de tamanho 1, com o mesmo naipe", async () => {
    await renderControlled();

    fireEvent.pointerDown(screen.getByTestId("range-cell-T9s"), ALT);
    fireEvent.click(screen.getByTestId("alt-drag-suit-s")); // escolhe espadas
    fireEvent.pointerEnter(screen.getByTestId("range-cell-JTs"), ALT);
    fireEvent.pointerUp(window, P);

    // O harness controlado acumula via onChange — para ler o estado final
    // precisamos que o proprio componente tenha aplicado as DUAS mudancas.
    // `screen` continua montado com o estado mais recente do React.
    const cellT9s = screen.getByTestId("range-cell-T9s");
    const cellJTs = screen.getByTestId("range-cell-JTs");
    // NAO usar /emerald/: a celula sempre carrega "hover:outline-emerald-400"
    // independente de estar ativa. So `bg-emerald-600` marca a classe LIGADA.
    expect(cellT9s.className, "T9s deveria estar pintada apos o Alt+drag").toMatch(/bg-emerald-600/);
    expect(cellJTs.className, "JTs deveria estar pintada apos o Alt+drag").toMatch(/bg-emerald-600/);

    // borda ambar = `entry.suits` presente e nao-vazio (RangeMatrix ja marca
    // isso hoje para o filtro de naipe existente — RF-02.1/D-F2-5 so precisa
    // POPULAR o campo, o indicador visual ja existe).
    expect(
      cellT9s.className,
      "T9s com suits filtrado deveria mostrar a borda ambar de classe parcial",
    ).toMatch(/amber/);
    expect(cellJTs.className).toMatch(/amber/);
  });

  it("as duas classes tocadas tem `suits` de tamanho 1 com o comboKey do MESMO naipe escolhido", async () => {
    let lastEntries: RangeEntry[] = [];
    const RangeMatrix = await loadRangeMatrix();
    function Capture() {
      const [entries, setEntries] = useState<RangeEntry[]>([]);
      lastEntries = entries;
      return (
        <RangeMatrix
          entries={entries}
          onChange={(next: RangeEntry[]) => {
            lastEntries = next;
            setEntries(next);
          }}
          testId="alt-drag-matrix-capture"
        />
      );
    }
    render(<Capture />);

    fireEvent.pointerDown(screen.getByTestId("range-cell-T9s"), ALT);
    fireEvent.click(screen.getByTestId("alt-drag-suit-h")); // escolhe copas
    fireEvent.pointerEnter(screen.getByTestId("range-cell-JTs"), ALT);
    fireEvent.pointerUp(window, P);

    const t9s = entryOf(lastEntries, "T9s");
    const jTs = entryOf(lastEntries, "JTs");
    expect(t9s?.suits, "T9s deveria ter suits com exatamente 1 combo").toHaveLength(1);
    expect(jTs?.suits, "JTs deveria ter suits com exatamente 1 combo").toHaveLength(1);
    expect(t9s?.suits?.[0]).toBe(suitedComboKey("T9s", "h"));
    expect(jTs?.suits?.[0]).toBe(suitedComboKey("JTs", "h"));
  });
});

describe("F2 D-F2-5 — o mini-seletor NAO reaparece dentro da mesma sessao apos a primeira escolha", () => {
  it("um SEGUNDO Alt+drag, apos o naipe ja escolhido, aplica direto sem reabrir o mini-seletor", async () => {
    let lastEntries: RangeEntry[] = [];
    const RangeMatrix = await loadRangeMatrix();
    function Capture() {
      const [entries, setEntries] = useState<RangeEntry[]>([]);
      lastEntries = entries;
      return (
        <RangeMatrix
          entries={entries}
          onChange={(next: RangeEntry[]) => {
            lastEntries = next;
            setEntries(next);
          }}
          testId="alt-drag-matrix-2nd"
        />
      );
    }
    render(<Capture />);

    // Primeiro gesto: escolhe naipe.
    fireEvent.pointerDown(screen.getByTestId("range-cell-T9s"), ALT);
    fireEvent.click(screen.getByTestId("alt-drag-suit-d")); // ouros
    fireEvent.pointerUp(window, P);

    // Segundo gesto, em OUTRA classe: nao deveria reabrir o mini-seletor.
    fireEvent.pointerDown(screen.getByTestId("range-cell-98s"), ALT);
    expect(
      screen.queryByTestId("alt-drag-suit-picker"),
      "o mini-seletor reapareceu no segundo Alt+drag da mesma sessao — deveria reusar altDragSuit",
    ).toBeNull();

    fireEvent.pointerEnter(screen.getByTestId("range-cell-87s"), ALT);
    fireEvent.pointerUp(window, P);

    const c98s = entryOf(lastEntries, "98s");
    const c87s = entryOf(lastEntries, "87s");
    expect(c98s?.suits?.[0]).toBe(suitedComboKey("98s", "d"));
    expect(
      c87s?.suits?.[0],
      "o segundo gesto deveria reusar o MESMO naipe (ouros) escolhido no primeiro, sem perguntar de novo",
    ).toBe(suitedComboKey("87s", "d"));
  });
});

describe("F2 D-F2-5 — decisao deste arquivo: soltar o ponteiro com o mini-seletor ABERTO cancela o gesto", () => {
  it("pointerup antes de escolher um naipe nao pinta nada e fecha o mini-seletor", async () => {
    await renderControlled();

    fireEvent.pointerDown(screen.getByTestId("range-cell-T9s"), ALT);
    expect(screen.getByTestId("alt-drag-suit-picker")).toBeInTheDocument();

    fireEvent.pointerUp(window, P);

    expect(
      screen.queryByTestId("alt-drag-suit-picker"),
      "o mini-seletor deveria fechar quando o gesto e cancelado por pointerup sem escolha",
    ).toBeNull();
    expect(
      screen.getByTestId("range-cell-T9s").className,
      "T9s nao deveria ter sido pintada — o gesto foi cancelado antes de escolher o naipe",
    ).not.toMatch(/bg-emerald-600/);
  });

  it("apos o cancelamento, o PROXIMO Alt+drag pergunta o naipe de novo (altDragSuit continua null)", async () => {
    await renderControlled();

    fireEvent.pointerDown(screen.getByTestId("range-cell-T9s"), ALT);
    fireEvent.pointerUp(window, P); // cancela sem escolher

    fireEvent.pointerDown(screen.getByTestId("range-cell-98s"), ALT);
    expect(
      screen.getByTestId("alt-drag-suit-picker"),
      "depois de um gesto cancelado sem escolha, o proximo Alt+drag deveria perguntar de novo",
    ).toBeInTheDocument();
  });
});
