/**
 * MdaReadsSection — Sprint MDA-1 (ADR-230 / RF-05).
 *
 * Lista os MDAs (Tendencias da Populacao) tagueados a um tema. Usado em
 * ThemeDetailView (abaixo de StatAnalysisReviewList) e reusado pelo
 * MdaPopulationPanel durante a sessao de estudo (modo compacto).
 *
 * Carrega GET /api/mda-reads/by-theme?themeId= (apiRequest retorna JSON parseado
 * direto — lesson #13). Card -> /estudos/mda/:id; CTA -> registrar?themeId=.
 * Estado vazio: placeholder PT-BR + CTA (sem acoes default decorativas — #11).
 */

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface MdaImageView {
  id: string;
  url?: string;
  imageUrl?: string;
  caption?: string;
}

interface MdaReadView {
  id: string;
  title: string;
  statId?: string | null;
  tendencyText?: string | null;
  images?: MdaImageView[];
}

interface MdaReadsSectionProps {
  themeId: string;
  compact?: boolean;
}

function truncate(text: string | null | undefined, max = 120): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function MdaReadsSection({ themeId, compact = false }: MdaReadsSectionProps) {
  const [, navigate] = useLocation();

  const { data } = useQuery<MdaReadView[]>({
    queryKey: ["/api/mda-reads/by-theme", themeId],
    queryFn: () => apiRequest("GET", `/api/mda-reads/by-theme?themeId=${themeId}`),
    enabled: !!themeId,
  });
  const reads: MdaReadView[] = Array.isArray(data) ? data : [];

  const goRegister = () => navigate(`/estudos/mda/registrar?themeId=${themeId}`);

  return (
    <section data-testid="mda-reads-section" className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">MDA da populacao</h3>
        <button
          type="button"
          data-testid="mda-reads-register-cta"
          onClick={goRegister}
          className="rounded border border-dashed px-3 py-1 text-xs hover:bg-muted"
        >
          Registrar MDA
        </button>
      </div>

      {reads.length === 0 ? (
        <div data-testid="mda-reads-empty" className="rounded border border-dashed p-4 text-sm text-muted-foreground">
          Nenhum MDA registrado para este tema ainda. Capture a tendencia da
          populacao deste spot e consulte enquanto estuda.
        </div>
      ) : (
        <div className={compact ? "space-y-2" : "grid gap-3 sm:grid-cols-2"}>
          {reads.map((read) => {
            const thumb = (read.images ?? [])[0];
            const thumbUrl = thumb?.url ?? thumb?.imageUrl;
            return (
              <button
                key={read.id}
                type="button"
                data-testid={`mda-read-card-${read.id}`}
                onClick={() => navigate(`/estudos/mda/${read.id}`)}
                className="flex w-full items-start gap-3 rounded border p-3 text-left hover:bg-muted"
              >
                {thumbUrl && (
                  <img
                    src={thumbUrl}
                    alt={read.title}
                    className="h-12 w-12 shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{read.title}</span>
                    {read.statId && (
                      <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-600">
                        {read.statId}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {truncate(read.tendencyText)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default MdaReadsSection;
