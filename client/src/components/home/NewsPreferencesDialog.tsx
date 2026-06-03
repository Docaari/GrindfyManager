/**
 * NewsPreferencesDialog — ADR-106 §2.3.
 *
 * Modal de preferencias de noticias. Aberto por gear icon em cada NewsSection.
 * 3 abas: Mercado / Fofocas / Resultados. Cada aba: master switch da categoria
 * + lista de plataformas/veiculos com switch individual.
 *
 * Plataformas detectadas via CSV imports do user aparecem com badge "Voce joga aqui".
 */

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/queryClient";
import type {
  NewsSource,
  UserNewsPreferencesResponse,
  NewsSourceCatalogEntry,
} from "@shared/types/news";

interface NewsPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Aba inicialmente ativa. */
  defaultCategory?: NewsSource;
}

interface DraftCategory {
  enabled: boolean;
  toggles: Record<string, boolean>;
}

const CATEGORY_LABELS: Record<string, string> = {
  sites: "Sites",
  tools: "Ferramentas",
  studies: "Estudos",
  gossip: "Fofocas",
  "tournament-results": "Resultados",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  sites:
    "Anuncios oficiais das redes de poker (PokerStars, GG, WPN/ACR, PartyPoker, 888, etc): lancamentos, mudancas, promos.",
  tools:
    "Atualizacoes de softwares de poker (Hand2Note, PT4, HM3, HRC, Jurojin, GTO Wizard, SharkScope): novas versoes, features, bugfixes.",
  studies:
    "Artigos tecnicos e materiais de estudo (GTO Wizard blog + perfil X). Foco em ranges, ICM, MTT theory.",
  gossip: "Pautas hypadas do MundoPoker e SuperPoker. Sem resultados de torneios.",
  "tournament-results": "Cravadas e ITM grandes de brasileiros.",
};

export function NewsPreferencesDialog({
  open,
  onOpenChange,
  defaultCategory = "sites",
}: NewsPreferencesDialogProps) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<NewsSource>(defaultCategory);
  const [draft, setDraft] = useState<Record<string, DraftCategory>>({});

  const { data, isLoading } = useQuery<UserNewsPreferencesResponse>({
    queryKey: ["/api/news/preferences"],
    queryFn: async () => {
      const r = await fetch("/api/news/preferences", { credentials: "include" });
      if (!r.ok) throw new Error("falha preferences");
      return r.json();
    },
    enabled: open,
  });

  useEffect(() => {
    if (!data) return;
    const initial: Record<string, DraftCategory> = {};
    for (const cat of ["sites", "tools", "studies", "gossip", "tournament-results"] as NewsSource[]) {
      const pref = data.preferences.find((p) => p.category === cat);
      initial[cat] = {
        enabled: pref?.enabled ?? false,
        toggles: pref?.platformToggles ?? {},
      };
    }
    setDraft(initial);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (updates: any[]) => {
      const csrf = getCsrfToken();
      const r = await fetch("/api/news/preferences", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify({ updates }),
      });
      if (!r.ok) throw new Error("save falhou");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/news/preferences"] });
      qc.invalidateQueries({ queryKey: ["/api/news"] });
      onOpenChange(false);
    },
  });

  function toggleCategoryEnabled(cat: string, value: boolean) {
    setDraft((prev) => ({
      ...prev,
      [cat]: { ...(prev[cat] ?? { enabled: false, toggles: {} }), enabled: value },
    }));
  }

  function togglePlatform(cat: string, platformId: string, value: boolean) {
    setDraft((prev) => ({
      ...prev,
      [cat]: {
        ...(prev[cat] ?? { enabled: false, toggles: {} }),
        toggles: { ...(prev[cat]?.toggles ?? {}), [platformId]: value },
      },
    }));
  }

  function handleSave() {
    const updates = Object.entries(draft).map(([category, d]) => ({
      category,
      enabled: d.enabled,
      platformToggles: d.toggles,
    }));
    saveMutation.mutate(updates);
  }

  const detectedSet = useMemo(
    () => new Set((data?.detectedPlatforms ?? []).map((p) => p.toLowerCase())),
    [data?.detectedPlatforms],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        data-testid="news-preferences-dialog"
      >
        <DialogHeader>
          <DialogTitle>Preferencias de Noticias</DialogTitle>
          <DialogDescription>
            Ative as categorias e plataformas que deseja acompanhar. Atualizamos toda
            segunda-feira 12:00 BRT com as top 5 noticias.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as NewsSource)}>
            <TabsList className="grid grid-cols-5">
              <TabsTrigger value="sites">{CATEGORY_LABELS.sites}</TabsTrigger>
              <TabsTrigger value="tools">{CATEGORY_LABELS.tools}</TabsTrigger>
              <TabsTrigger value="studies">{CATEGORY_LABELS.studies}</TabsTrigger>
              <TabsTrigger value="gossip">{CATEGORY_LABELS.gossip}</TabsTrigger>
              <TabsTrigger value="tournament-results">
                {CATEGORY_LABELS["tournament-results"]}
              </TabsTrigger>
            </TabsList>

            {(["sites", "tools", "studies", "gossip", "tournament-results"] as NewsSource[]).map((cat) => (
              <TabsContent key={cat} value={cat} className="space-y-4 pt-4">
                <div className="flex items-start justify-between gap-4 p-3 rounded-md border bg-muted/30">
                  <div>
                    <div className="text-sm font-semibold">Receber {CATEGORY_LABELS[cat]}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {CATEGORY_DESCRIPTIONS[cat]}
                    </p>
                  </div>
                  <Switch
                    checked={draft[cat]?.enabled ?? false}
                    onCheckedChange={(v) => toggleCategoryEnabled(cat, v)}
                    data-testid={`news-pref-master-${cat}`}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Plataformas
                  </div>
                  {(data.catalog?.[cat] ?? []).length === 0 ? (
                    <div className="text-xs text-muted-foreground py-4 text-center">
                      Nenhuma fonte cadastrada nesta categoria.
                    </div>
                  ) : (
                    <ul className="space-y-1">
                      {(data.catalog?.[cat] ?? [] as NewsSourceCatalogEntry[]).map((src: any) => {
                        const detected = detectedSet.has(String(src.platform ?? src.id).toLowerCase());
                        const enabled = draft[cat]?.toggles?.[src.id] ?? false;
                        return (
                          <li
                            key={src.id}
                            className="flex items-center justify-between gap-3 p-2 rounded hover:bg-muted/40"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm flex items-center gap-2">
                                <span>{src.name}</span>
                                {detected && (
                                  <span className="text-[10px] uppercase border border-primary text-primary rounded-md px-1.5 py-0.5">
                                    Voce joga aqui
                                  </span>
                                )}
                              </div>
                              {src.description && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {src.description}
                                </div>
                              )}
                            </div>
                            <Switch
                              checked={enabled}
                              onCheckedChange={(v) => togglePlatform(cat, src.id, v)}
                              disabled={!draft[cat]?.enabled}
                              data-testid={`news-pref-platform-${src.id}`}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending || isLoading}
            data-testid="news-pref-save"
          >
            Salvar preferencias
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NewsPreferencesDialog;
