/**
 * MentalPrep — Hub Warm-up (Sprint W-1, RF-01, T-13)
 *
 * Refatorado completamente:
 *   - Header "Warm-up" simplificado (sem "Preparação Mental")
 *   - Card primario "Iniciar warm-up (10min)" com botao CTA
 *   - WarmupHistoryCard
 *   - ResumeRitualPrompt (recupera draft de localStorage)
 *   - Subsecao rebaixada "Ferramentas de Apoio" (Meditation/Visualization/AudioLibrary)
 *   - Botao "Iniciar Grind" gated por useWarmupGate
 *
 * Removidos:
 *   - Score 60/40, MentalStateCard (4 sliders), CustomizationDialog,
 *     StatisticsDialog, CorrelationDialog, WarmUpChecklist legado, GoalsCard,
 *     PersonalNotesCard, QuickHistoryCard.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/usePermission";
import { useWarmupGate } from "@/hooks/useWarmupGate";
import AccessDenied from "@/components/AccessDenied";
import { Brain, Play } from "lucide-react";
import { WarmUpRunner } from "@/components/warmup/WarmUpRunner";
import { WarmupHistoryCard } from "@/components/warmup/WarmupHistoryCard";
import { ResumeRitualPrompt } from "@/components/warmup/ResumeRitualPrompt";
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

  // Support tools
  const [showMeditation, setShowMeditation] = useState(false);
  const [showVisualizationSelection, setShowVisualizationSelection] = useState(false);
  const [showVisualizationGuide, setShowVisualizationGuide] = useState(false);
  const [showAudioLibrary, setShowAudioLibrary] = useState(false);
  const [supportToolsOpen, setSupportToolsOpen] = useState(false);

  if (!hasPermission) {
    return (
      <AccessDenied
        featureName="Warm-up"
        description="Acesse ferramentas de warm-up e preparacao mental para suas sessoes."
      />
    );
  }

  const startWarmup = () => {
    setResumeMode(false);
    setShowRunner(true);
  };

  const resumeWarmup = () => {
    setResumeMode(true);
    setShowRunner(true);
  };

  const handleRunnerClose = () => {
    setShowRunner(false);
    setResumeMode(false);
  };

  const handleRunnerComplete = () => {
    setShowRunner(false);
    setResumeMode(false);
    toast({
      title: "Warm-up registrado",
      description: "Bom grind!",
    });
  };

  const handleStartGrind = () => {
    if (!canStartGrind) return;
    setLocation("/grind");
  };

  if (showRunner) {
    return (
      <WarmUpRunner
        onClose={handleRunnerClose}
        onComplete={handleRunnerComplete}
        resume={resumeMode}
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
            Ritual de 10 minutos antes de cada sessao.
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
          <CardTitle className="text-2xl">Iniciar warm-up (10min)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            5 blocos sequenciais: respiracao + check emocional, foco da semana,
            drill PFC, setup fisico, intencao da sessao.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={startWarmup} size="lg">
              <Play className="h-4 w-4 mr-2" />
              Iniciar warm-up (10min)
            </Button>
            <Button
              type="button"
              variant={canStartGrind ? "default" : "outline"}
              size="lg"
              onClick={handleStartGrind}
              disabled={!canStartGrind}
              title={
                canStartGrind
                  ? "Warm-up valido — bom grind"
                  : "Faca warm-up nos ultimos 30 min para iniciar grind"
              }
            >
              Iniciar Grind
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Historico */}
      <WarmupHistoryCard />

      {/* Ferramentas de Apoio (rebaixadas) */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => setSupportToolsOpen((v) => !v)}
        >
          <CardTitle className="text-base">
            Ferramentas de Apoio {supportToolsOpen ? "▾" : "▸"}
          </CardTitle>
        </CardHeader>
        {supportToolsOpen && (
          <CardContent className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMeditation(true)}
            >
              Meditacao guiada
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowVisualizationSelection(true)}
            >
              Visualizacao
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAudioLibrary(true)}
            >
              Biblioteca de audios
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Dialogs (mantidos como ferramentas) */}
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
