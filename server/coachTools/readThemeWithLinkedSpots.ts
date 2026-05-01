// =============================================================================
// Coach Tool: read_theme_with_linked_spots
// Sprint Studies-Reform / RF-07 (D6, ADR-068)
//
// Permite que o Coach AI leia um tema com seus spots vinculados para citar
// conteudo concreto em respostas. Tier gating: Pro+.
//
// Input (XOR):
//   - { theme_id: string }   OU
//   - { theme_name: string } (lookup case-insensitive)
//
// Output:
//   {
//     theme: { id, name, color, emoji, progress, lastVisitedAt },
//     tabs: [{ id, name, content_preview }] up to 5,
//     linked_spots: [{ id, conclusion, type, spot, screenshotUrl }] up to 10,
//     summary: { spots_count, tabs_count, last_activity_at },
//   }
//
// Cross-user isolation: theme.userId precisa bater com ctx.userPlatformId.
// =============================================================================

import { z } from 'zod';
import { storage } from '../storage';

const MAX_TABS = 5;
const MAX_SPOTS = 10;
const CONTENT_PREVIEW_CHARS = 200;

const inputSchema = z
  .object({
    theme_id: z.string().min(1).optional(),
    theme_name: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.theme_id) !== Boolean(v.theme_name), {
    message: 'Forneca theme_id OU theme_name (XOR).',
  });

type ReadThemeInput = z.infer<typeof inputSchema>;

interface ReadThemeContext {
  userPlatformId?: string;
  userId?: string;
}

function previewFromContent(content: any): string {
  if (!content) return '';
  if (Array.isArray(content)) {
    const text = content
      .map((node: any) => {
        if (node && typeof node === 'object' && 'content' in node) {
          return String((node as any).content ?? '');
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');
    return text.slice(0, CONTENT_PREVIEW_CHARS);
  }
  return String(content).slice(0, CONTENT_PREVIEW_CHARS);
}

export async function readThemeWithLinkedSpots(
  rawInput: unknown,
  ctx: ReadThemeContext,
): Promise<any> {
  const input = inputSchema.parse(rawInput) as ReadThemeInput;
  const userId = ctx?.userPlatformId ?? ctx?.userId;
  if (!userId) {
    throw new Error('User context obrigatorio');
  }

  // Lookup theme
  let theme: any = null;
  if (input.theme_id) {
    theme = await (storage as any).getStudyTheme(input.theme_id);
  } else if (input.theme_name) {
    theme = await (storage as any).getStudyThemeByName(input.theme_name, userId);
  }

  if (!theme) {
    throw new Error('Tema nao encontrado');
  }
  if (theme.userId && theme.userId !== userId) {
    throw new Error('Acesso negado: tema de outro usuario');
  }

  const [tabsRaw, linkedSpotsRaw] = await Promise.all([
    (storage as any).getStudyTabsByTheme(theme.id),
    (storage as any).getLinkedSpots(theme.id),
  ]);

  const tabs = (Array.isArray(tabsRaw) ? tabsRaw : []).slice(0, MAX_TABS).map((t: any) => ({
    id: t.id,
    name: t.name,
    content_preview: previewFromContent(t.content),
  }));

  const linkedSpots = (Array.isArray(linkedSpotsRaw) ? linkedSpotsRaw : [])
    .slice(0, MAX_SPOTS)
    .map((s: any) => ({
      id: s.id,
      conclusion: s.conclusion ?? '',
      type: s.type ?? null,
      spot: s.spot ?? null,
      screenshotUrl: s.screenshotUrl ?? s.imageUrl ?? null,
    }));

  return {
    theme: {
      id: theme.id,
      name: theme.name,
      color: theme.color ?? null,
      emoji: theme.emoji ?? '',
      progress: theme.progress ?? 0,
      lastVisitedAt: theme.lastVisitedAt ?? null,
    },
    tabs,
    linked_spots: linkedSpots,
    summary: {
      spots_count: linkedSpots.length,
      tabs_count: tabs.length,
      last_activity_at: theme.lastVisitedAt ?? null,
    },
  };
}

export default readThemeWithLinkedSpots;

// -----------------------------------------------------------------------------
// Tool descriptor (compatible com server/coachTools/registry.ts)
// -----------------------------------------------------------------------------

export const readThemeWithLinkedSpotsTool = {
  name: 'read_theme_with_linked_spots' as const,
  description:
    'Le um tema de estudo do usuario com seus spots vinculados (max 10) e ' +
    'preview das abas (max 5). Use para citar conteudo concreto e spots ' +
    'concretos em respostas do Coach.',
  inputSchema,
  requiresConfirmation: false,
  auditLevel: 'log' as const,
  gateByTier: ['pro', 'premium', 'admin'] as const,
  async handler(input: any, ctx: any) {
    try {
      const data = await readThemeWithLinkedSpots(input, ctx);
      return {
        __type: 'ToolResult',
        tool: 'read_theme_with_linked_spots',
        ok: true,
        data,
      };
    } catch (err) {
      console.error('[read_theme_with_linked_spots] error', {
        userPlatformId: ctx?.userPlatformId ?? ctx?.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        __type: 'ToolResult',
        tool: 'read_theme_with_linked_spots',
        ok: false,
        code: 'tool_error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
