/**
 * MentalPrep — Hub Warm-up.
 *
 * Reform 2026-05-05:
 *   - Selector de duracao (6m / 15m / 30m) antes de iniciar runner
 *   - Ferramentas de Apoio: 1 botao por ferramenta, sempre visivel
 *   - Botao "Iniciar Grind" gated por useWarmupGate
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/usePermission";
import { useWarmupGate } from "@/hooks/useWarmupGate";
import AccessDenied from "@/components/AccessDenied";
import { Brain, Play, Sparkles, Eye, Headphones } from "lucide-react";
import { WarmUpRunner } from "@/components/warmup/WarmUpRunner";
import { WarmupHistoryCard } from "@/components/warmup/WarmupHistoryCard";
import { ResumeRitualPrompt } from "@/components/warmup/ResumeRitualPrompt";
import { DurationSelector } from "@/components/warmup/DurationSelector";
import type { WarmupMode } from "@/components/warmup/durations";
import { readDraftMode } from "@/hooks/useWarmupRitual";
import { MeditationDialog } from "@/components/mental-prep/MeditationDialog";
import { VisualizationDialog } from "@/components/mental-prep/VisualizationDialog";
import { AudioLibraryDialog } from "@/components/mental-prep/AudioLibraryDialog";
import { useToast } from "@/hooks/use-toast";

export default function MentalPrep() {
  const hasPermission = usePermission("mental_prep_access");
  const [, setLocation] = useLocation();
  const { canStartGrind } = useWarmupGate();
  const { toast } = useToast();

  // Runner state
  const [showRunner, setShowRunner] = useState<boolean>(false);
  const [resumeMode, setResumeMode] = useState<boolean>(false);
  const [selectedMode, setSelectedMode] = useState<WarmupMode>("15m");
  const [showDurationSelector, setShowDurationSelector] = useState<boolean>(false);

  // Support tools
  const [showMeditation, setShowMeditation] = useState(false);
  const [showVisualizationSelection, setShowVisualizationSelection] = useState(false);
  const [showVisualizationGuide, setShowVisualizationGuide] = useState(false);
  const [showAudioLibrary, setShowAudioLibrary] = useState(false);

  if (!hasPermission) {
    return (
      <AccessDenied
        featureName="Warm-up"
        description="Acesse ferramentas de warm-up e preparacao mental para suas sessoes."
      />
    );
  }

  const openDurationSelector = () => {
    setShowDurationSelector(true);
  };

  const handleSelectMode = (mode: WarmupMode) => {
    setSelectedMode(mode);
    setShowDurationSelector(false);
    setResumeMode(false);
    setShowRunner(true);
  };

  const resumeWarmup = () => {
    // Recupera mode salvo no draft (sem montar hook) para nao usar default
    // 15m quando o user tinha escolhido outro modo antes da pausa.
    const savedMode = readDraftMode();
    if (savedMode) setSelectedMode(savedMode);
    setResumeMode(true);
    setShowRunner(true);
  };

  const handleRunnerClose = () => {
    setShowRunner(false);
    setResumeMode(false);
  };

  const handleRunnerComplete = (payload?: { success?: boolean; error?: string | null }) => {
    setShowRunner(false);
    setResumeMode(false);
    if (payload?.success === false) {
      toast({
        title: "Warm-up nao registrado",
        description: payload.error ?? "Falha ao salvar. Voce pode tentar de novo ou iniciar grind direto.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Warm-up registrado",
        description: "Bom grind!",
      });
    }
  };

  const handleStartGrind = () => {
    // Reform 2026-05-05 v2: permite iniciar grind sem warmup recente.
    // Se sem warmup valido, exibe toast informativo mas NAO bloqueia.
    if (!canStartGrind) {
      toast({
        title: "Iniciando grind sem warm-up",
        description: "Recomendamos fazer o warm-up antes — mas voce pode prosseguir.",
      });
    }
    setLocation("/grind");
  };

  if (showRunner) {
    return (
      <WarmUpRunner
        onClose={handleRunnerClose}
        onComplete={handleRunnerComplete}
        resume={resumeMode}
        mode={selectedMode}
      />
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 space-y-6 max-w-4xl">
      {/* Header */}
      <header className="flex items-center gap-3">
        <Brain className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Warm-up</h1>
          <p className="text-sm text-muted-foreground">
            Ritual antes de cada sessao. Escolha a duracao ao iniciar.
          </p>
        </div>
      </header>

      {/* Resume prompt (se draft em localStorage) */}
      <ResumeRitualPrompt
        onResume={resumeWarmup}
        onDiscard={() => {
          /* draft ja foi limpo pelo proprio prompt */
        }}
      />

      {/* Card primario */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Iniciar Warm-up</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            5 etapas: setup fisico, respiracao, foco da semana, intencao (opcional)
            e drills GTO/estudo. Tempos adaptados por modo (6m / 15m / 30m).
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={openDurationSelector}
              size="lg"
              data-testid="warmup-start-cta"
            >
              <Play className="h-4 w-4 mr-2" />
              Iniciar Warm-up
            </Button>
            <Button
              type="button"
              variant={canStartGrind ? "default" : "outline"}
              size="lg"
              onClick={handleStartGrind}
              title={
                canStartGrind
                  ? "Warm-up valido — bom grind"
                  : "Sem warm-up recente. Voce pode iniciar mesmo assim."
              }
            >
              Iniciar Grind
              {!canStartGrind && (
                <span className="ml-2 text-xs opacity-70">(sem warm-up)</span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Historico */}
      <WarmupHistoryCard />

      {/* Ferramentas de Apoio (sempre visivel, 1 botao por tool) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ferramentas de Apoio</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowMeditation(true)}
            data-testid="tool-meditation"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Meditacao guiada
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowVisualizationSelection(true)}
            data-testid="tool-visualization"
          >
            <Eye className="w-4 h-4 mr-2" />
            Visualizacao
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAudioLibrary(true)}
            data-testid="tool-audio-library"
          >
            <Headphones className="w-4 h-4 mr-2" />
            Biblioteca de audios
          </Button>
        </CardContent>
      </Card>

      {/* Duration selector */}
      <DurationSelector
        open={showDurationSelector}
        onSelect={handleSelectMode}
        onCancel={() => setShowDurationSelector(false)}
      />

      {/* Dialogs (controlled-only; sem DialogTrigger interno) */}
      <MeditationDialog
        open={showMeditation}
        onOpenChange={setShowMeditation}
      />
      <VisualizationDialog
        showSelection={showVisualizationSelection}
        onSelectionChange={setShowVisualizationSelection}
        showGuide={showVisualizationGuide}
        onGuideChange={setShowVisualizationGuide}
      />
      <AudioLibraryDialog
        open={showAudioLibrary}
        onOpenChange={setShowAudioLibrary}
      />
    </div>
  );
}
