import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { SessionHistoryData } from "./types";
import { localFormatCurrency } from "./helpers";

interface DeleteSessionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sessionToDelete: SessionHistoryData | null;
  onConfirmDelete: () => void;
  isDeleting: boolean;
}

export default function DeleteSessionDialog({
  isOpen,
  onOpenChange,
  sessionToDelete,
  onConfirmDelete,
  isDeleting,
}: DeleteSessionDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] bg-poker-surface border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Excluir Sessão</DialogTitle>
          <DialogDescription className="text-gray-400">
            Tem certeza que deseja excluir permanentemente esta sessão?
          </DialogDescription>
        </DialogHeader>

        {sessionToDelete && (
          <div className="space-y-4">
            <div className="bg-gray-800 border border-gray-600 rounded p-4">
              <p className="text-white font-medium">
                Sessão de {formatDate(sessionToDelete.date)}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Volume: {sessionToDelete.volume} | Profit: {localFormatCurrency(sessionToDelete.profit)}
              </p>
            </div>

            <div className="bg-red-900/20 border border-red-600/50 rounded p-3">
              <p className="text-red-400 text-sm">
                ⚠️ Esta ação não pode ser desfeita. Todos os dados da sessão, incluindo torneios e feedbacks de breaks, serão permanentemente excluídos.
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-gray-600 text-gray-300 hover:bg-gray-700"
              >
                Cancelar
              </Button>
              <Button
                onClick={onConfirmDelete}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeleting ? "Excluindo..." : "Excluir Permanentemente"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
