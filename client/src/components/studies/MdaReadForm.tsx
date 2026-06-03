/**
 * MdaReadForm — Sprint MDA-1 (ADR-230 / RF-07).
 *
 * Form de criar/editar MDA (Tendencias da Populacao) com upload de prints (que o
 * EST-3 ainda nao tem). Theme multi-select (N:N), stat opcional, prints com
 * preview local.
 *
 * Modo CRIACAO (sem `readId`): fluxo 2-passos — POST /api/mda-reads cria o read,
 * depois POST /:id/images por arquivo. Apos salvar, redireciona ao detalhe.
 *
 * Modo EDICAO (`readId` presente): GET /api/mda-reads/:id hidrata os campos +
 * temas + imagens existentes; ao salvar faz PATCH /api/mda-reads/:id (NAO POST,
 * sem duplicata) + sobe prints novos; redireciona ao detalhe /estudos/mda/:id.
 *
 * apiRequest retorna JSON parseado direto (lesson #13). Hooks antes de qualquer
 * early return (lesson #1). UI PT-BR.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/PageHeader";

interface StudyThemeLite {
  id: string;
  name: string;
  userId?: string;
}

interface MdaExistingImage {
  id: string;
  url?: string;
  imageUrl?: string;
  caption?: string;
}

interface MdaReadEdit {
  id: string;
  title?: string;
  spotContext?: string | null;
  filters?: string | null;
  tendencyText?: string | null;
  statId?: string | null;
  themeIds?: string[];
  images?: MdaExistingImage[];
}

interface MdaReadFormProps {
  initialThemeId?: string;
  // Quando presente -> modo edicao (GET hidrata + PATCH ao salvar).
  readId?: string;
}

const MAX_IMAGES = 8;

function previewUrl(file: File): string {
  try {
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      return URL.createObjectURL(file);
    }
  } catch {
    /* jsdom sem createObjectURL — sem preview real, mas a entry aparece */
  }
  return "";
}

export function MdaReadForm({ initialThemeId, readId }: MdaReadFormProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isEdit = !!readId;

  const [title, setTitle] = useState("");
  const [spotContext, setSpotContext] = useState("");
  const [filters, setFilters] = useState("");
  const [tendencyText, setTendencyText] = useState("");
  const [statId, setStatId] = useState("");
  const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>(
    initialThemeId ? [initialThemeId] : [],
  );
  const [files, setFiles] = useState<File[]>([]);
  // Imagens ja persistidas no read (modo edicao) — distintas dos previews locais.
  const [existingImages, setExistingImages] = useState<MdaExistingImage[]>([]);

  // Garante que o initialThemeId pre-selecionado entre quando muda.
  useEffect(() => {
    if (initialThemeId) {
      setSelectedThemeIds((cur) => (cur.includes(initialThemeId) ? cur : [...cur, initialThemeId]));
    }
  }, [initialThemeId]);

  const { data: themesData } = useQuery<StudyThemeLite[]>({
    queryKey: ["/api/study-themes"],
    queryFn: () => apiRequest("GET", "/api/study-themes"),
    staleTime: 30_000,
  });
  const themes: StudyThemeLite[] = Array.isArray(themesData) ? themesData : [];

  // Modo edicao: carrega o read e hidrata os campos uma vez.
  const { data: editRead } = useQuery<MdaReadEdit>({
    queryKey: ["/api/mda-reads", readId],
    queryFn: () => apiRequest("GET", `/api/mda-reads/${readId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!editRead) return;
    setTitle(editRead.title ?? "");
    setSpotContext(editRead.spotContext ?? "");
    setFilters(editRead.filters ?? "");
    setTendencyText(editRead.tendencyText ?? "");
    setStatId(editRead.statId ?? "");
    if (Array.isArray(editRead.themeIds)) setSelectedThemeIds(editRead.themeIds);
    setExistingImages(Array.isArray(editRead.images) ? editRead.images : []);
  }, [editRead]);

  const themeName = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of themes) map.set(t.id, t.name);
    return map;
  }, [themes]);

  const toggleTheme = (id: string) => {
    setSelectedThemeIds((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]));
  };

  const onSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    setFiles((cur) => [...cur, ...list].slice(0, MAX_IMAGES));
  };

  const removeFile = (idx: number) => {
    setFiles((cur) => cur.filter((_f, i) => i !== idx));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        spotContext: spotContext || undefined,
        filters: filters || undefined,
        tendencyText: tendencyText || undefined,
        statId: statId || undefined,
        themeIds: selectedThemeIds,
      };
      // Passo 1: edicao -> PATCH (sem duplicata); criacao -> POST.
      const saved: any = isEdit
        ? await apiRequest("PATCH", `/api/mda-reads/${readId}`, payload)
        : await apiRequest("POST", "/api/mda-reads", payload);
      const savedId = saved?.id ?? readId;
      // Passo 2: sobe os prints novos (1 request por arquivo).
      if (savedId) {
        for (const file of files) {
          const fd = new FormData();
          fd.append("file", file);
          await apiRequest("POST", `/api/mda-reads/${savedId}/images`, fd);
        }
      }
      return { ...(saved ?? {}), id: savedId };
    },
    onSuccess: (saved: any) => {
      // Lesson #21: invalida por prefixo (v5 prefix-match) — a lista do painel do
      // tema (by-theme) e o detalhe do read podem estar stale apos salvar/editar.
      queryClient.invalidateQueries({ queryKey: ["/api/mda-reads/by-theme"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mda-reads"] });
      if (saved?.id) navigate(`/estudos/mda/${saved.id}`);
    },
    onError: (err: any) => {
      // Falha silenciosa antes: o botao reabilitava sem explicacao, e o fluxo
      // 2-passos (read criado + upload de print) podia ter sucesso parcial.
      toast({
        title: "Erro ao salvar MDA",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const canSubmit = title.trim().length > 0 && selectedThemeIds.length >= 1;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    saveMutation.mutate();
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <PageHeader title="Registrar MDA" subtitle="Tendencia da populacao" />
      <form data-testid="mda-read-form" onSubmit={handleSubmit} className="space-y-6">
      {/* Identificacao */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Identificacao</h3>
      <div>
        <label className="text-xs font-medium text-muted-foreground" htmlFor="mda-title">
          Titulo
        </label>
        <input
          id="mda-title"
          data-testid="mda-read-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
          placeholder="BTN vs BB SRP — pop overfolda turn"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground" htmlFor="mda-spot">
          Spot / contexto
        </label>
        <input
          id="mda-spot"
          data-testid="mda-read-spot-input"
          value={spotContext}
          onChange={(e) => setSpotContext(e.target.value)}
          maxLength={200}
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground" htmlFor="mda-filters">
          Filtros aplicados
        </label>
        <input
          id="mda-filters"
          data-testid="mda-read-filters-input"
          value={filters}
          onChange={(e) => setFilters(e.target.value)}
          maxLength={500}
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      </div>

      {/* Tendencia + stat ligada */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Tendencia da populacao</h3>
      <div>
        <label className="text-xs font-medium text-muted-foreground" htmlFor="mda-tendency">
          Tendencia da populacao + como explorar
        </label>
        <textarea
          id="mda-tendency"
          data-testid="mda-read-tendency-input"
          value={tendencyText}
          onChange={(e) => setTendencyText(e.target.value)}
          maxLength={2000}
          rows={3}
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground" htmlFor="mda-stat">
          Stat ligada (opcional)
        </label>
        <input
          id="mda-stat"
          data-testid="mda-read-stat-input"
          value={statId}
          onChange={(e) => setStatId(e.target.value)}
          maxLength={64}
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
          placeholder="ex: vpip"
        />
      </div>
      </div>

      {/* Theme multi-select (N:N) */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="text-sm font-semibold text-foreground">Temas (1 ou mais)</div>
        <div className="flex flex-wrap gap-2">
          {selectedThemeIds.map((id) => (
            <span
              key={id}
              data-testid={`mda-theme-chip-${id}`}
              className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs"
            >
              {themeName.get(id) ?? id}
              <button
                type="button"
                aria-label={`Remover tema ${themeName.get(id) ?? id}`}
                onClick={() => toggleTheme(id)}
                className="text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {themes
            .filter((t) => !selectedThemeIds.includes(t.id))
            .map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid={`mda-theme-option-${t.id}`}
                onClick={() => toggleTheme(t.id)}
                className="rounded border border-dashed px-3 py-1 text-xs hover:bg-muted"
              >
                + {t.name}
              </button>
            ))}
        </div>
      </div>

      {/* Upload de prints */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <label className="text-sm font-semibold text-foreground" htmlFor="mda-image">
          Prints da populacao (max {MAX_IMAGES})
        </label>
        <input
          id="mda-image"
          data-testid="mda-read-image-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={onSelectFiles}
          disabled={files.length >= MAX_IMAGES}
          className="block text-sm"
        />
        {/* Imagens ja salvas (modo edicao) — distintas dos previews locais */}
        {existingImages.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {existingImages.map((img) => {
              const url = img.url ?? img.imageUrl;
              return (
                <div
                  key={img.id}
                  data-testid={`mda-read-existing-image-${img.id}`}
                  className="relative rounded border p-1"
                >
                  {url ? (
                    <img src={url} alt={img.caption ?? ""} className="h-16 w-full rounded object-cover" />
                  ) : (
                    <div className="flex h-16 items-center justify-center text-[10px] text-muted-foreground">
                      {img.caption || img.id}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {files.map((file, idx) => {
            const url = previewUrl(file);
            return (
              <div
                key={`${file.name}-${idx}`}
                data-testid={`mda-read-image-preview-${idx}`}
                className="relative rounded border p-1"
              >
                {url ? (
                  <img src={url} alt={file.name} className="h-16 w-full rounded object-cover" />
                ) : (
                  <div className="flex h-16 items-center justify-center text-[10px] text-muted-foreground">
                    {file.name}
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`Remover print ${idx + 1}`}
                  onClick={() => removeFile(idx)}
                  className="absolute right-1 top-1 rounded bg-background/80 px-1 text-xs"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          data-testid="mda-read-form-submit"
          disabled={!canSubmit || saveMutation.isPending}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saveMutation.isPending ? "Salvando…" : "Salvar MDA"}
        </button>
      </div>
      </form>
    </div>
  );
}

export default MdaReadForm;
