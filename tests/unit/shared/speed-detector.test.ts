/**
 * Tests for shared/speed-detector.ts (Sprint torneios-library-grouping).
 * Bug corrigido: Hyper sub-detectado (so "SUPER TURBO" virava Hyper).
 */
import { describe, it, expect } from "vitest";
import {
  classifySpeed,
  detectSpeedFromName,
  fastestSpeed,
} from "../../../shared/speed-detector";

describe("classifySpeed — Hyper", () => {
  it("detecta Hyper em variantes que antes caiam em Turbo", () => {
    expect(classifySpeed("$22 Hyper")).toBe("Hyper");
    expect(classifySpeed("Bounty Hyper-Turbo")).toBe("Hyper");
    expect(classifySpeed("Hyperturbo $5")).toBe("Hyper");
    expect(classifySpeed("Super Turbo")).toBe("Hyper");
    expect(classifySpeed("Ultra Turbo Deepstack")).toBe("Hyper");
    expect(classifySpeed("3-Speed")).toBe("Hyper");
  });
  it("usa coluna speed + nome combinados", () => {
    expect(classifySpeed("HYPER", "Daily $11")).toBe("Hyper");
    expect(classifySpeed("", "Sunday Hyper")).toBe("Hyper");
  });
});

describe("classifySpeed — Turbo / Normal", () => {
  it("Turbo + sinonimos de site", () => {
    expect(classifySpeed("$22 Turbo")).toBe("Turbo");
    expect(classifySpeed("Bolt $5")).toBe("Turbo");
    expect(classifySpeed("Sprint")).toBe("Turbo");
    expect(classifySpeed("Flash Deal")).toBe("Turbo");
    expect(classifySpeed("Torneio Rapido")).toBe("Turbo");
  });
  it("Normal default", () => {
    expect(classifySpeed("Sunday Million")).toBe("Normal");
    expect(classifySpeed("")).toBe("Normal");
    expect(classifySpeed(null, undefined)).toBe("Normal");
  });
});

describe("detectSpeedFromName / fastestSpeed", () => {
  it("detectSpeedFromName delega ao classify", () => {
    expect(detectSpeedFromName("Hyper Bounty")).toBe("Hyper");
    expect(detectSpeedFromName("Regular MTT")).toBe("Normal");
  });
  it("fastestSpeed escolhe o mais rapido", () => {
    expect(fastestSpeed("Normal", "Hyper")).toBe("Hyper");
    expect(fastestSpeed("Turbo", "Normal")).toBe("Turbo");
    expect(fastestSpeed("Normal", "Normal")).toBe("Normal");
    expect(fastestSpeed("", "Turbo")).toBe("Turbo");
  });
});
