import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock } from "lucide-react";
import { getTimeDifference } from './helpers';

interface TimeEditDialogProps {
  editingTimeDialog: {[key: string]: boolean};
  setEditingTimeDialog: React.Dispatch<React.SetStateAction<{[key: string]: boolean}>>;
  timeEditValue: {[key: string]: string};
  setTimeEditValue: React.Dispatch<React.SetStateAction<{[key: string]: string}>>;
  onSaveTime: (tournamentId: string) => void;
  onAdjustTime: (tournamentId: string, minutes: number, autoClose: boolean) => void;
  onSetFixedTime: (tournamentId: string, timeType: 'now' | 'next-hour' | 'plus-30') => void;
}

export default function TimeEditDialog({
  editingTimeDialog,
  setEditingTimeDialog,
  timeEditValue,
  setTimeEditValue,
  onSaveTime,
  onAdjustTime,
  onSetFixedTime,
}: TimeEditDialogProps) {
  return (
    <>
      {Object.keys(editingTimeDialog).map(tournamentId => (
        editingTimeDialog[tournamentId] && (
          <Dialog key={tournamentId} open={true} onOpenChange={() => setEditingTimeDialog({...editingTimeDialog, [tournamentId]: false})}>
            <DialogContent className="sm:max-w-[500px] bg-gray-800 border-gray-700 text-white p-6 rounded-lg">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-white flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-emerald-400" />
                  Editar Horario do Torneio
                </DialogTitle>
                <DialogDescription className="text-gray-400 text-sm">
                  Ajuste o horario do torneio usando os controles abaixo ou teclas de atalho
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Novo Horario com Input Aprimorado */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-300">Novo Horario</label>
                  <div className="flex gap-3">
                    <Input
                      type="time"
                      value={timeEditValue[tournamentId] || '20:00'}
                      onChange={(e) => setTimeEditValue({
                        ...timeEditValue,
                        [tournamentId]: e.target.value
                      })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onSaveTime(tournamentId);
                        } else if (e.key === 'Escape') {
                          setEditingTimeDialog({...editingTimeDialog, [tournamentId]: false});
                        }
                      }}
                      className="flex-1 bg-gray-700 border-gray-600 text-white py-2.5 px-3 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="Ex: 14:30"
                    />

                    {/* Botoes de Horario Fixo */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSetFixedTime(tournamentId, 'now')}
                      className="border-emerald-500 text-emerald-400 hover:bg-emerald-600/20 px-3"
                    >
                      Agora
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSetFixedTime(tournamentId, 'plus-30')}
                      className="border-emerald-500 text-emerald-400 hover:bg-emerald-600/20 px-3"
                    >
                      +30min
                    </Button>
                  </div>

                  {/* Feedback Visual */}
                  <div className="text-xs text-gray-400 flex justify-between">
                    <span>Horario atual: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-emerald-400">
                      {getTimeDifference(timeEditValue[tournamentId] || '20:00')}
                    </span>
                  </div>
                </div>

                {/* Ajustes Rapidos */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-300">Ajustes Rapidos</label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => onAdjustTime(tournamentId, -15, true)}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-sm"
                    >
                      -15min
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onAdjustTime(tournamentId, -5, true)}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-sm"
                    >
                      -5min
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onAdjustTime(tournamentId, 5, true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm"
                    >
                      +5min
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onAdjustTime(tournamentId, 15, true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm"
                    >
                      +15min
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onAdjustTime(tournamentId, 30, true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm"
                    >
                      +30min
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onAdjustTime(tournamentId, 60, true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm"
                    >
                      +60min
                    </Button>
                  </div>
                  <div className="text-xs text-gray-500">
                    Aplicacao automatica: os ajustes sao salvos imediatamente
                  </div>
                </div>
              </div>

              {/* Botoes de Acao */}
              <div className="flex gap-3 pt-6 border-t border-gray-700">
                <Button
                  variant="outline"
                  onClick={() => setEditingTimeDialog({...editingTimeDialog, [tournamentId]: false})}
                  className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => onSaveTime(tournamentId)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Salvar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )
      ))}
    </>
  );
}
