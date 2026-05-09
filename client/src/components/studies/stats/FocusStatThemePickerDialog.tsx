/**
 * Sprint home-reform-4 / Item 7 — RF-05.
 *
 * Dialog para selecao de tema ao marcar uma stat como foco do mes.
 *
 * Spec : Docs/specs/home-reform-4-item-7-focus-stats.md §RF-05
 * ADRs : 116, 118
 *
 * Lessons aplicadas:
 *   #1  hooks ANTES de early return
 *   #2  data-testid estaveis
 *   #11 sem actions decorativas
 *   #13 apiRequest retorna JSON parseado direto
 *
 * MEDIUM-4 reviewer: migrado para Radix Dialog (DialogContent/DialogHeader/...).
 * Ganha aria-modal, focus trap, Escape-to-close e overlay focus restore.
 */

import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
// CRITICAL-1 reviewer: section "Temas relacionados" reusa reverse lookup
// /api/stats/:statId/linked-themes para mostrar temas que ja linkam esta stat.
// Ajuda user a decidir entre "criar tema novo" ou "marcar foco em tema existente".
import { RelatedThemesSection } from "@/components/stats/RelatedThemesSection";

interface StudyTheme {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  emoji: string | null;
  progress: number | null;
}

interface Props {
  open: boolean;
  statId: string;
  statLabel: string;
  onOpenChange: (open: boolean) => void;
  onConfirmed?: () => void;
}

export default function FocusStatThemePickerDialog(props: Props): JSX.Element | null {
  const { open, statId, statLabel, onOpenChange, onConfirmed } = props;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);

  const { data: themes } = useQuery<StudyTheme[]>({
    queryKey: ["/api/study-themes"],
    queryFn: () => apiRequest("GET", "/api/study-themes"),
    enabled: open,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (themeId: string) => {
      return await apiRequest("POST", "/api/focus-stats", {
        statId,
        studyThemeId: themeId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/home/focus-stats"] });
      toast({
        title: "Stat marcada como foco do mes",
        description: statLabel,
      });
      onConfirmed?.();
      onOpenChange(false);
    },
    onError: (err: any) => {
      const code = err?.code ?? err?.message ?? "";
      if (typeof code === "string" && /LIMIT/i.test(code)) {
        toast({
          title: "Limite atingido",
          description: "Voce ja tem 3 stats foco neste mes.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao marcar foco",
          description: "Tente novamente em instantes.",
          variant: "destructive",
        });
      }
    },
  });

  if (!open) return null;

  const themeList = Array.isArray(themes) ? themes : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="focus-stat-dialog"
        aria-label="Selecionar tema de estudo"
        className="max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Marcar {statLabel} como foco</DialogTitle>
          <DialogDescription>
            Vincule esta stat a um tema de estudo para acompanhar o tempo
            dedicado no mes.
          </DialogDescription>
        </DialogHeader>

        {/* CRITICAL-1 reviewer: temas relacionados a esta stat (reverse lookup).
            Polish #7: chip click fecha dialog ANTES de navegar — evita overlay
            preso sobre /estudos/:slug. Cmd/Ctrl/middle continuam abrindo nova
            aba via <a href> sem fechar (preserva contexto stat aqui). */}
        <div className="border-b border-border pb-3 mb-3">
          <RelatedThemesSection
            statId={statId}
            onNavigate={(slug) => {
              onOpenChange(false);
              setLocation(`/estudos/${slug}`);
            }}
          />
        </div>

        {themeList.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Voce ainda nao tem temas de estudo cadastrados.
            </p>
            <Link href="/estudos/temas/novo">
              <a
                href="/estudos/temas/novo"
                className="inline-flex px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent"
              >
                Criar tema
              </a>
            </Link>
          </div>
        ) : (
          <>
            <div role="listbox" className="max-h-64 overflow-auto space-y-1">
              {themeList.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  data-testid={`focus-stat-theme-option-${theme.id}`}
                  role="option"
                  aria-selected={selectedThemeId === theme.id}
                  onClick={() => setSelectedThemeId(theme.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md border text-left text-sm transition ${
                    selectedThemeId === theme.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {theme.emoji ? (
                    <span className="text-base" aria-hidden>
                      {theme.emoji}
                    </span>
                  ) : null}
                  <span className="flex-1 truncate">{theme.name}</span>
                </button>
              ))}
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="button"
                data-testid="focus-stat-confirm"
                disabled={!selectedThemeId || createMutation.isPending}
                onClick={() => {
                  if (selectedThemeId) {
                    createMutation.mutate(selectedThemeId);
                  }
                }}
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Confirmar
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
