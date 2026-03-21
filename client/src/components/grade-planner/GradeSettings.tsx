import { useState, useEffect } from "react";
import { validateGradeHours } from "@shared/grade-hours";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";

interface GradeSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStartHour: number;
  currentEndHour: number;
  onSave: (startHour: number, endHour: number) => void;
  isPending?: boolean;
  /** Number of tournaments that would fall outside the new range */
  tournamentsOutOfRange?: number;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${i.toString().padStart(2, "0")}:00`,
}));

export function GradeSettings({
  open,
  onOpenChange,
  currentStartHour,
  currentEndHour,
  onSave,
  isPending = false,
  tournamentsOutOfRange = 0,
}: GradeSettingsProps) {
  const [startHour, setStartHour] = useState(currentStartHour);
  const [endHour, setEndHour] = useState(currentEndHour);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStartHour(currentStartHour);
      setEndHour(currentEndHour);
      setError(null);
    }
  }, [open, currentStartHour, currentEndHour]);

  const handleSave = () => {
    const validation = validateGradeHours(startHour, endHour);
    if (!validation.valid) {
      setError(validation.error || "Configuracao invalida");
      return;
    }
    setError(null);
    onSave(startHour, endHour);
  };

  // Validate on change for immediate feedback
  const validation = validateGradeHours(startHour, endHour);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-emerald-400">Configurar Horarios da Grade</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Start hour */}
          <div className="space-y-1.5">
            <label className="text-sm text-slate-300">Horario de inicio</label>
            <Select
              value={String(startHour)}
              onValueChange={(v) => {
                setStartHour(Number(v));
                setError(null);
              }}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 max-h-[200px]">
                {HOUR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* End hour */}
          <div className="space-y-1.5">
            <label className="text-sm text-slate-300">Horario de fim</label>
            <Select
              value={String(endHour)}
              onValueChange={(v) => {
                setEndHour(Number(v));
                setError(null);
              }}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 max-h-[200px]">
                {HOUR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Validation error */}
          {(error || !validation.valid) && (
            <div className="text-red-400 text-sm flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error || validation.error}
            </div>
          )}

          {/* Warning about tournaments out of range */}
          {tournamentsOutOfRange > 0 && validation.valid && (
            <div className="text-yellow-400 text-sm flex items-center gap-1.5 bg-yellow-900/20 rounded px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {tournamentsOutOfRange} torneio(s) ficara(ao) fora do novo intervalo
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending || !validation.valid}
              className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
            >
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
