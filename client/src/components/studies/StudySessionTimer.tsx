import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatTime } from "./utils";

interface StudySessionTimerProps {
  cardId: string;
  onTimeUpdate: (time: number) => void;
}

export function StudySessionTimer({ cardId, onTimeUpdate }: StudySessionTimerProps) {
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [time, setTime] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive && !isPaused) {
      interval = setInterval(() => {
        setTime(time => time + 1);
      }, 1000);
    } else if (!isActive && time !== 0) {
      if (interval) clearInterval(interval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, isPaused, time]);

  const handleStart = () => {
    setIsActive(true);
    setIsPaused(false);
    toast({
      title: "Sessão de estudo iniciada",
      description: "Foque no seu aprendizado!",
    });
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const handleStop = () => {
    setIsActive(false);
    setIsPaused(false);
    onTimeUpdate(time);
    toast({
      title: "Sessão finalizada",
      description: `Tempo total: ${formatTime(time / 60)}`,
    });
    setTime(0);
  };

  const formatTimeDisplay = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-card rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-foreground font-semibold mb-2">Cronômetro de Estudo</h4>
          <div className="text-2xl font-mono text-primary">
            {formatTimeDisplay(time)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isActive ? (
            <Button
              onClick={handleStart}
              className="bg-primary hover:opacity-90 text-primary-foreground"
              size="sm"
            >
              <Play className="w-4 h-4 mr-2" />
              Iniciar
            </Button>
          ) : (
            <>
              <Button
                onClick={handlePause}
                variant="outline"
                className="text-foreground border-border hover:bg-accent"
                size="sm"
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </Button>
              <Button
                onClick={handleStop}
                className="bg-destructive hover:opacity-90 text-destructive-foreground"
                size="sm"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Parar
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
