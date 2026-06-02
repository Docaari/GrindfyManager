/**
 * MdaReadDetailView — Sprint MDA-1 (ADR-230 / RF-07).
 *
 * Detalhe de um MDA: prints + campos + temas tagueados (chips) + acoes
 * editar/excluir. Excluir -> soft delete (DELETE /api/mda-reads/:id) com
 * confirmacao (AlertDialog). Imagem privada via <img src=URL servivel> (o
 * backend serve com requireAuth + ownership, Cache-Control private max-age=300).
 *
 * apiRequest retorna JSON parseado direto (lesson #13).
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

interface MdaImageView {
  id: string;
  url?: string;
  imageUrl?: string;
  caption?: string;
}

interface MdaReadDetail {
  id: string;
  title: string;
  statId?: string | null;
  spotContext?: string | null;
  filters?: string | null;
  tendencyText?: string | null;
  themeIds?: string[];
  images?: MdaImageView[];
}

interface StudyThemeLite {
  id: string;
  name: string;
}

interface MdaReadDetailViewProps {
  readId: string;
}

export function MdaReadDetailView({ readId }: MdaReadDetailViewProps) {
  const [, navigate] = useLocation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: read } = useQuery<MdaReadDetail>({
    queryKey: ["/api/mda-reads", readId],
    queryFn: () => apiRequest("GET", `/api/mda-reads/${readId}`),
    enabled: !!readId,
  });

  // INFO-1: mapa id->nome de tema p/ exibir o nome (nao o id cru) nos chips.
  const { data: themesData } = useQuery<StudyThemeLite[]>({
    queryKey: ["/api/study-themes"],
    queryFn: () => apiRequest("GET", "/api/study-themes"),
  });
  const themeName = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of Array.isArray(themesData) ? themesData : []) map.set(t.id, t.name);
    return map;
  }, [themesData]);

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/mda-reads/${readId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mda-reads/by-theme"] });
      setConfirmOpen(false);
      navigate("/estudos");
    },
  });

  if (!read) {
    return <div data-testid="mda-read-detail-loading" className="p-4 text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div data-testid="mda-read-detail" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{read.title}</h1>
          {read.statId && (
            <span className="mt-1 inline-block rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600">
              {read.statId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="mda-read-edit-btn"
            onClick={() => navigate(`/estudos/mda/registrar?id=${read.id}`)}
            className="rounded border px-3 py-1 text-sm hover:bg-muted"
          >
            Editar
          </button>
          <button
            type="button"
            data-testid="mda-read-delete-btn"
            onClick={() => setConfirmOpen(true)}
            className="rounded border border-destructive px-3 py-1 text-sm text-destructive hover:bg-destructive/10"
          >
            Excluir
          </button>
        </div>
      </div>

      {/* Temas tagueados */}
      <div className="flex flex-wrap gap-2">
        {(read.themeIds ?? []).map((themeId) => (
          <span
            key={themeId}
            data-testid={`mda-detail-theme-chip-${themeId}`}
            className="rounded-full border bg-muted px-3 py-1 text-xs"
          >
            {themeName.get(themeId) ?? themeId}
          </span>
        ))}
      </div>

      {/* Campos */}
      {read.spotContext && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">Spot</div>
          <p className="text-sm">{read.spotContext}</p>
        </div>
      )}
      {read.filters && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">Filtros</div>
          <p className="text-sm">{read.filters}</p>
        </div>
      )}
      {read.tendencyText && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">Tendencia</div>
          <p className="text-sm whitespace-pre-wrap">{read.tendencyText}</p>
        </div>
      )}

      {/* Prints */}
      <div className="grid gap-3 sm:grid-cols-2">
        {(read.images ?? []).map((img) => {
          const url = img.url ?? img.imageUrl;
          return (
            <figure key={img.id} className="space-y-1">
              <img
                data-testid={`mda-read-image-${img.id}`}
                src={url}
                alt={img.caption ?? read.title}
                className="w-full rounded border"
              />
              {img.caption && (
                <figcaption className="text-xs text-muted-foreground">{img.caption}</figcaption>
              )}
            </figure>
          );
        })}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este MDA?</AlertDialogTitle>
            <AlertDialogDescription>
              O MDA sera removido (soft delete) e nao aparecera mais nos temas
              tagueados. Esta acao pode ser revertida pelo suporte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <button
              type="button"
              data-testid="mda-read-delete-cancel"
              onClick={() => setConfirmOpen(false)}
              className="rounded border px-3 py-1 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              data-testid="mda-read-delete-confirm"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="rounded bg-destructive px-3 py-1 text-sm text-destructive-foreground disabled:opacity-50"
            >
              Excluir
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default MdaReadDetailView;
