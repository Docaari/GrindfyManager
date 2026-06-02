// =============================================================================
// Sprint Fase C #4 — Catalogo de Tilt Tipado (7 tipos) + antidoto
//
// Spec: Docs/specs/sprint-fase-c-4-tilt-tipado-2026-06-02.md (RF-01/RF-02)
// ADR : Docs/architecture/decisions/232-fase-c-4-tilt-tipado-7-tipos-antidoto.md
//
// Catalogo estatico dos 7 tipos da taxonomia de Tendler (curso D1 §2.4 + §15.1).
// Fonte unica consumida por backend (validacao + agregacao + antidoto) e frontend
// (seletor + exibicao). Paridade com shared/hud-stat-catalog.ts (tupla `as const`
// -> z.enum + helpers getX/isValidX).
//
// Conteudo (label/description/antidote) derivado LITERALMENTE do curso D1
// (D1 §2.4 tabela canonica + §15.1 gatilho de pico + antidoto contextualizados ao
// MTT). Test-writer e implementer NAO inventam texto de poker.
//
// Versionado via git (sem persistencia DB — paridade hud-stat-catalog ADR-058).
//
// IMPORTANTE (import circular): este modulo importa SOMENTE o tipo TiltTrigger de
// shared/schema (type-only, erased em runtime). NAO importa schema.ts em valor.
// =============================================================================

import { z } from "zod";
import type { TiltTrigger } from "./schema";

export const TILT_TYPE_IDS = [
  "running_bad",
  "injustice",
  "hate_losing",
  "mistake",
  "entitlement",
  "revenge",
  "desperation",
] as const;

export const tiltTypeSchema = z.enum(TILT_TYPE_IDS);

export type TiltTypeId = (typeof TILT_TYPE_IDS)[number];

export interface TiltTypeMeta {
  id: TiltTypeId;
  label: string; // PT-BR (curso D1 §2.4)
  description: string; // contextual ("nesta fase..."), nunca de identidade (A4)
  defaultTrigger: TiltTrigger | null; // mapeia p/ TILT_TRIGGERS quando ha 1:1
  antidote: string; // literal do curso §15.1
}

// Conteudo literal do curso D1 §2.4 (definicoes) + §15.1 (gatilho + antidoto MTT).
export const TILT_TYPE_CATALOG: TiltTypeMeta[] = [
  {
    id: "running_bad",
    label: "Tilt da Fase Ruim",
    description:
      "Seca de deep runs (2-4 semanas sem cravada, grafico negativo); voce atribui o tilt ao downswing. Nao e um tilt em si — e o guarda-chuva que revela qual dos outros 6 esta ativo nesta fase.",
    defaultTrigger: "downswing",
    antidote:
      "Inversao causal: \"dos outros 6 tipos, qual aparece com mais forca nesta fase?\" e tratar ESSE. O downswing revelou, nao criou.",
  },
  {
    id: "injustice",
    label: "Tilt de Injustica",
    description:
      "Cooler ou suckout perto da bubble, na bubble ou em FT — o ICM amplifica a sensacao de injustica.",
    defaultTrigger: "cooler",
    antidote:
      "Logic statement de variancia ensaiado p/ alto ICM: \"este all-in tinha equity X; perde-lo e amostra de uma distribuicao que escolhi; a bubble nao muda a matematica da carta\". Aplicar ANTES de registrar o proximo.",
  },
  {
    id: "hate_losing",
    label: "Tilt de Odio a Derrota",
    description:
      "Bust apos deep run, ou bust em FT — a dor do quase-premio quando o resultado escapa nas etapas finais.",
    defaultTrigger: null,
    antidote:
      "Reframe de bust como custo operacional do MTT: a maioria das entradas nao cobra (fato estrutural, nao falha). O lucro e liquido, depois dos busts.",
  },
  {
    id: "mistake",
    label: "Tilt de Erro",
    description:
      "Erro proprio revelado em revisao (shove mal dimensionado, call de ICM errado, misclick critico). Risco: confundir azar com erro.",
    defaultTrigger: null,
    antidote:
      "Auto-compaixao; separar processo de outcome (liga C7). O erro vira dado p/ a proxima sessao de estudo, nao veredicto sobre o jogador.",
  },
  {
    id: "entitlement",
    label: "Tilt de Direito",
    description:
      "Perder para um recreational que jogou um range \"impossivel\" e floupou — a sensacao de que o poker te devia aquele pote.",
    defaultTrigger: null,
    antidote:
      "Correcao de calibracao: \"quero que recreationals joguem assim e ganhem as vezes — e dai que vem meu EV. O poker nao deve nada.\"",
  },
  {
    id: "revenge",
    label: "Tilt de Vinganca",
    description:
      "Um vilao especifico te deu suckout e reaparece; voce passa a checar a stack dele antes da sua, jogando contra a pessoa e nao contra o range.",
    defaultTrigger: "briga-interpessoal",
    antidote:
      "Antidoto mecanico: trocar de mesa, ocultar HUD do vilao, ou encerrar a sessao. \"Minha estrategia se define pelo plano que estudei, nao pela pessoa na minha frente.\"",
  },
  {
    id: "desperation",
    label: "Tilt de Desespero",
    description:
      "Late reg de high roller fora do schedule p/ \"recuperar o dia\" (ABI acima do confortavel + edge reduzido + estado comprometido).",
    defaultTrigger: null,
    antidote:
      "Stop-loss mecanico inegociavel, definido a frio (em BIs ou horas). O jogador em desespero NAO pode decidir parar; a regra e tomada antecipadamente.",
  },
];

// Espelha STAT_INDEX_BY_ID (hud-stat-catalog.ts).
export const TILT_TYPE_INDEX: Map<string, TiltTypeMeta> = new Map(
  TILT_TYPE_CATALOG.map((m) => [m.id, m]),
);

// Espelha getStatById — retorna undefined para id invalido.
export function getTiltType(id: string): TiltTypeMeta | undefined {
  return TILT_TYPE_INDEX.get(id);
}

export function isValidTiltType(id: string): boolean {
  return TILT_TYPE_INDEX.has(id);
}

// -----------------------------------------------------------------------------
// RF-02 — heuristica pura suggestTiltType (deterministica, sem I/O)
//
// Precedencia (primeiro match vence — por regra, nao por posicao no array):
//   1. briga-interpessoal               -> revenge
//   2. cooler | slowroll | big-bluff-fail -> injustice
//   3. downswing                        -> running_bad
//   4. nenhum mapeavel E keptTilting>=7 -> desperation
//   5. caso contrario                   -> null (nao chuta)
//
// distracao/fome/sono/outro NAO mapeiam (estados aversivos genericos — Berkowitz:
// somam afeto negativo, nao sao um tipo).
// -----------------------------------------------------------------------------

const DESPERATION_KEPT_TILTING_THRESHOLD = 7;

export interface SuggestTiltTypeInput {
  triggers: string[];
  feltTilt?: number;
  keptTilting?: number;
  presence?: number;
}

export function suggestTiltType(a: SuggestTiltTypeInput): TiltTypeId | null {
  const triggers = Array.isArray(a?.triggers) ? a.triggers : [];
  const has = (t: string) => triggers.includes(t);

  if (has("briga-interpessoal")) return "revenge";
  if (has("cooler") || has("slowroll") || has("big-bluff-fail")) return "injustice";
  if (has("downswing")) return "running_bad";

  const keptTilting = typeof a?.keptTilting === "number" ? a.keptTilting : 0;
  if (keptTilting >= DESPERATION_KEPT_TILTING_THRESHOLD) return "desperation";

  return null;
}
