import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SessionHistoryData } from "./types";

interface ConflictDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  conflictingSession: SessionHistoryData | null;
  onEditSession: () => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

export default function ConflictDialog({
  isOpen,
  onOpenChange,
  conflictingSession,
  onEditSession,
  onCreateNew,
  onCancel,
}: ConflictDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="grindfy-conflict-modal max-w-md bg-gray-900 border-gray-700">
        <DialogHeader className="space-y-4 pb-4">
          <DialogTitle className="text-white text-lg font-semibold flex items-center gap-2">
            <span className="text-red-400">🎯</span>
            Sessão em Andamento
          </DialogTitle>
          <DialogDescription className="text-gray-300 text-sm leading-relaxed">
            Você já tem uma sessão ativa para hoje. Escolha como deseja continuar:
          </DialogDescription>
        </DialogHeader>

        {conflictingSession && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-500/20 p-2 rounded-full">
                <span className="text-red-400 text-base">📅</span>
              </div>
              <div>
                <p className="text-white font-medium text-sm">
                  Sessão de Hoje
                </p>
                <p className="text-gray-400 text-xs">
                  Iniciada às {new Date(conflictingSession.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Button
            onClick={onEditSession}
            className="w-full bg-[#16a249] hover:bg-[#128a3e] text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-[#16a249]/25"
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-base">🎮</span>
              <span>Ir para Sessão Existente</span>
            </div>
          </Button>

          <Button
            onClick={onCreateNew}
            variant="outline"
            className="w-full bg-[#c25555] hover:bg-[#a84848] border-[#c25555] text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-200"
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-base">➕</span>
              <span>Criar Nova Sessão e Substituir</span>
            </div>
          </Button>

          <Button
            onClick={onCancel}
            variant="ghost"
            className="w-full text-gray-500 hover:text-gray-400 hover:bg-gray-800/50 font-normal py-2 px-4 rounded-lg transition-all duration-200 text-sm"
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm">❌</span>
              <span>Cancelar</span>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
