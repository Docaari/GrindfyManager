// =============================================================================
// Sprint F3 — Stats Analyzer / Wizard primeiro uso (RF-08)
// Spec: Docs/specs/sprint-f3-stats-analyzer.md
//
// Decisao autonoma DA-6 (founder AFK): em vez de auto-seed server-side
// (que escolheria PT4 default sem perguntar), o wizard cliente pede ao
// usuario qual template deseja antes de criar o layout.
// =============================================================================

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HUD_LAYOUT_TEMPLATES } from "./templates";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSeeded?: () => void;
}

export default function StatsWizardFirstUse({ open, onOpenChange, onSeeded }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>("pt4");

  const seedMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const t = HUD_LAYOUT_TEMPLATES.find((x) => x.id === templateId);
      if (!t) throw new Error("Template desconhecido.");
      return apiRequest("POST", "/api/hud-layouts", {
        name: t.template.name,
        isDefault: true,
        sections: t.template.sections,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hud-layouts"] });
      toast({ title: "Layout criado", description: "Pronto pra registrar snapshots." });
      onOpenChange(false);
      onSeeded?.();
    },
    onError: (err: any) => {
      toast({
        title: "Erro",
        description: err?.message ?? "Falha ao criar layout.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        data-testid="stats-wizard-first-use"
      >
        <DialogHeader>
          <DialogTitle>Bem-vindo ao Stats Analyzer</DialogTitle>
          <DialogDescription>
            Escolha um template inicial para suas stats HUD. Voce pode customizar
            ou criar layouts adicionais depois.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-4">
          {HUD_LAYOUT_TEMPLATES.map((t) => {
            const active = selected === t.id;
            return (
              <Card
                key={t.id}
                data-testid={`wizard-template-${t.id}`}
                onClick={() => setSelected(t.id)}
                className={`cursor-pointer transition-colors ${
                  active
                    ? "bg-poker-accent/15 border-poker-accent"
                    : "bg-gray-800/60 border-gray-700/40 hover:bg-gray-800"
                }`}
              >
                <CardContent className="p-4">
                  <h4 className="text-sm font-semibold text-white mb-1">
                    {t.template.name}
                  </h4>
                  <p className="text-xs text-gray-400">{t.description}</p>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {t.template.sections.reduce((acc, s) => acc + s.stats.length, 0)}{" "}
                    stats
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="wizard-cancel"
          >
            Pular
          </Button>
          <Button
            onClick={() => seedMutation.mutate(selected)}
            disabled={seedMutation.isPending}
            data-testid="wizard-confirm"
            className="bg-poker-accent text-black"
          >
            {seedMutation.isPending ? "Criando..." : "Comecar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
