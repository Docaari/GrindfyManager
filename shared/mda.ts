// =============================================================================
// shared/mda.ts — MDA-1 / ADR-230
//
// Tipos + Zod compartilhados do registro de MDA (Mass Data Analysis /
// Tendencias da Populacao). Card de referencia (sem tempo/XP), tagueado a N
// temas (N:N). Fonte unica de verdade do shape dos prints + dos request schemas.
//
// Padrao `coach-planning.ts` (mantem schema.ts enxuto). As tabelas Drizzle
// (mdaReads / mdaReadThemes) ficam em shared/schema.ts importando estes tipos.
// =============================================================================

import { z } from "zod";

// --- MdaImage (print da populacao no array jsonb) ----------------------------
export interface MdaImage {
  id: string;
  key: string;
  caption: string;
}

export const mdaImageSchema = z.object({
  id: z.string(),
  key: z.string(),
  caption: z.string().max(120),
});

// --- insertMdaReadSchema (create) --------------------------------------------
// Para o create permitimos `images` sem `id` (storage gera via nanoid). O cap
// (max 8) vale para o array recebido.
const insertImageSchema = z.object({
  id: z.string().optional(),
  key: z.string(),
  caption: z.string().max(120).optional().default(""),
});

export const insertMdaReadSchema = z.object({
  title: z.string().min(1).max(120),
  spotContext: z.string().max(200).optional(),
  filters: z.string().max(500).optional(),
  tendencyText: z.string().max(2000).optional(),
  statId: z.string().max(64).optional(),
  themeIds: z.array(z.string()).min(1).max(20),
  images: z.array(insertImageSchema).max(8).optional(),
});
export type InsertMdaRead = z.infer<typeof insertMdaReadSchema>;

// --- patchMdaReadSchema (.strict()) ------------------------------------------
// Campos opcionais; `themeIds` (quando presente) substitui o conjunto de tags.
export const patchMdaReadSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    spotContext: z.string().max(200).optional(),
    filters: z.string().max(500).optional(),
    tendencyText: z.string().max(2000).optional(),
    statId: z.string().max(64).optional(),
    themeIds: z.array(z.string()).min(1).max(20).optional(),
    images: z.array(insertImageSchema).max(8).optional(),
  })
  .strict();
export type PatchMdaRead = z.infer<typeof patchMdaReadSchema>;
