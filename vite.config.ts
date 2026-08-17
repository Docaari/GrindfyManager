import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  // Range Lab F1 (ADR-246 D-F1-7): o motor de equity roda em Web Worker criado
  // como `new Worker(new URL(...), { type: "module" })`. O default do Vite emite
  // o worker em `iife`, que nao casa com `type: "module"` no build de producao —
  // funciona em dev e quebra depois do build. Primeiro worker do projeto.
  worker: {
    format: "es",
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Wave F (Fase 3 perf): vendor split estabiliza cache cross-deploy.
    // index.js compartilhado era 795 KB / 249 KB gz com React/Wouter/Query
    // misturados; agora React+Wouter+Query saem em chunk separado cacheable
    // (hash muda so quando upgrade lib).
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "wouter"],
          "query-vendor": ["@tanstack/react-query"],
        },
      },
    },
    // Wave F: limite raise pra silenciar warning sobre LessonViewer (1.1MB —
    // Mux Player + hls.js — ja eh lazy chunk, nao afeta first paint).
    chunkSizeWarningLimit: 1200,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
