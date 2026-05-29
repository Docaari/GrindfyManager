import { describe, it, expect } from "vitest";
import {
  parseDurationToSeconds,
  normalizeStructure,
  normalizeGame,
} from "../../server/csvParser";
import { detectStackDepthFromName } from "../../shared/tournament-type-detector";

describe("parseDurationToSeconds", () => {
  it("numero puro = segundos", () => {
    expect(parseDurationToSeconds("4980")).toBe(4980);
    expect(parseDurationToSeconds(1770)).toBe(1770);
  });
  it("formato 1h 23m", () => {
    expect(parseDurationToSeconds("1h 23m")).toBe(3600 + 23 * 60);
    expect(parseDurationToSeconds("1h23m45s")).toBe(3600 + 23 * 60 + 45);
    expect(parseDurationToSeconds("83m")).toBe(83 * 60);
  });
  it("formato hh:mm:ss e mm:ss", () => {
    expect(parseDurationToSeconds("01:23:00")).toBe(3600 + 23 * 60);
    expect(parseDurationToSeconds("83:00")).toBe(83 * 60);
  });
  it("vazio/invalido -> null", () => {
    expect(parseDurationToSeconds("")).toBeNull();
    expect(parseDurationToSeconds(null)).toBeNull();
    expect(parseDurationToSeconds(undefined)).toBeNull();
    expect(parseDurationToSeconds("abc")).toBeNull();
  });
});

describe("normalizeStructure / normalizeGame", () => {
  it("estrutura", () => {
    expect(normalizeStructure("No Limit")).toBe("NL");
    expect(normalizeStructure("Pot Limit")).toBe("PL");
    expect(normalizeStructure("")).toBeNull();
    expect(normalizeStructure(null)).toBeNull();
  });
  it("jogo", () => {
    expect(normalizeGame("H")).toBe("Holdem");
    expect(normalizeGame("Holdem")).toBe("Holdem");
    expect(normalizeGame("O")).toBe("Omaha");
    expect(normalizeGame("")).toBeNull();
  });
});

describe("detectStackDepthFromName", () => {
  it("[10BB] -> stack 10, deep false (bounty turbo)", () => {
    const r = detectStackDepthFromName("Bounty Builder [10BB] Turbo");
    expect(r.startingStackBb).toBe(10);
    expect(r.deepStack).toBe(false);
  });
  it("10 BB com espaco", () => {
    expect(detectStackDepthFromName("Speed Racer Bounty 10 BB").startingStackBb).toBe(10);
  });
  it("Deepstack keyword -> deep true, stack null", () => {
    const r = detectStackDepthFromName("Sunday Deepstack");
    expect(r.deepStack).toBe(true);
    expect(r.startingStackBb).toBeNull();
  });
  it("100bb >= threshold 50 -> deep true", () => {
    const r = detectStackDepthFromName("Big 100bb Event");
    expect(r.startingStackBb).toBe(100);
    expect(r.deepStack).toBe(true);
  });
  it("sem stack/keyword -> null + false", () => {
    const r = detectStackDepthFromName("Anniversary $33 NLHE");
    expect(r.startingStackBb).toBeNull();
    expect(r.deepStack).toBe(false);
  });
  it("tolera null", () => {
    expect(detectStackDepthFromName(null)).toEqual({ startingStackBb: null, deepStack: false });
  });
});
