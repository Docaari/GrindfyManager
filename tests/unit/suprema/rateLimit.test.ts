/**
 * Sprint TS-3 RF-01 — Fix `supremaSyncRateLimit.keyGenerator` por `userPlatformId`
 *
 * Spec : Docs/specs/sprint-tournament-selector-3.md (RF-01)
 * ADR  : N/A (cirurgia trivial — alinhar com padrao do resto do codebase)
 *
 * Cenarios:
 *  1) dois userPlatformId em mesmo IP usam buckets separados
 *  2) sem auth cai pro req.ip
 *  3) mesmo userPlatformId em IPs diferentes compartilha bucket
 *
 * Grep guard estatico verificando que o anti-pattern `req.user?.id || req.ip`
 * NAO aparece nos routes do dominio suprema apos o fix.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("RF-01 — supremaSyncRateLimit keyGenerator", () => {
  describe("source code guard (grep regressao)", () => {
    it("NAO encontra 'req.user?.id || req.ip' em server/routes/suprema*.ts", () => {
      const routesDir = path.resolve(__dirname, "../../../server/routes");
      const files = fs.readdirSync(routesDir).filter((f) => /^suprema.*\.ts$/.test(f));
      expect(files.length).toBeGreaterThan(0); // sanity — pelo menos suprema.ts existe

      const offenders: { file: string; line: number; text: string }[] = [];
      for (const f of files) {
        const content = fs.readFileSync(path.join(routesDir, f), "utf8");
        content.split(/\r?\n/).forEach((line, idx) => {
          if (/req\.user\?\.id\s*\|\|\s*req\.ip/.test(line)) {
            offenders.push({ file: f, line: idx + 1, text: line.trim() });
          }
        });
      }

      expect(offenders).toEqual([]);
    });

    it("encontra `req.user?.userPlatformId || req.ip` em server/routes/suprema.ts", () => {
      const supremaRoutes = path.resolve(__dirname, "../../../server/routes/suprema.ts");
      const content = fs.readFileSync(supremaRoutes, "utf8");
      expect(content).toMatch(/req\.user\?\.userPlatformId\s*\|\|\s*req\.ip/);
    });
  });

  describe("keyGenerator behavior", () => {
    /**
     * Implementer: o keyGenerator deve viver isolado e ser importavel em testes.
     * Hoje o codigo declara o limiter inline (anonymous), entao o test-writer
     * NAO consegue importar — implementer precisa extrair para uma funcao
     * nomeada e exportada (`supremaKeyGenerator`) que estes testes consomem.
     */
    it("dois userPlatformId distintos no mesmo IP geram chaves diferentes", async () => {
      const { supremaKeyGenerator } = await import("../../../server/routes/suprema");
      const reqA = { user: { userPlatformId: "USER-AAAA", id: "internal-1" }, ip: "10.0.0.1" } as any;
      const reqB = { user: { userPlatformId: "USER-BBBB", id: "internal-2" }, ip: "10.0.0.1" } as any;
      const keyA = supremaKeyGenerator(reqA);
      const keyB = supremaKeyGenerator(reqB);
      expect(keyA).not.toBe(keyB);
      expect(keyA).toBe("USER-AAAA");
      expect(keyB).toBe("USER-BBBB");
    });

    it("sem auth (sem req.user) cai pro req.ip", async () => {
      const { supremaKeyGenerator } = await import("../../../server/routes/suprema");
      const req = { ip: "192.168.1.5" } as any;
      expect(supremaKeyGenerator(req)).toBe("192.168.1.5");
    });

    it("mesmo userPlatformId em IPs distintos compartilha bucket (mesma chave)", async () => {
      const { supremaKeyGenerator } = await import("../../../server/routes/suprema");
      const reqA = { user: { userPlatformId: "USER-AAAA" }, ip: "10.0.0.1" } as any;
      const reqB = { user: { userPlatformId: "USER-AAAA" }, ip: "200.200.200.200" } as any;
      expect(supremaKeyGenerator(reqA)).toBe(supremaKeyGenerator(reqB));
    });

    it("req.user existe mas userPlatformId ausente -> fallback ip (defensivo)", async () => {
      const { supremaKeyGenerator } = await import("../../../server/routes/suprema");
      const req = { user: { id: "internal-only" }, ip: "172.16.0.9" } as any;
      // userPlatformId ausente -> falsy -> cai pro ip
      expect(supremaKeyGenerator(req)).toBe("172.16.0.9");
    });
  });
});
