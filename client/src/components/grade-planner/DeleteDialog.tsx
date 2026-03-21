import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournament: any;
  onConfirm: () => void;
  generateTournamentName: (data: any) => string;
}

export function DeleteDialog({
  open,
  onOpenChange,
  tournament,
  onConfirm,
  generateTournamentName,
}: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-red-400">Confirmar Exclus&#227;o</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-gray-300">
            Tem certeza que deseja excluir este torneio?
          </p>
          {tournament && (
            <div className="mt-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
              <p className="text-sm text-gray-300">
                <strong>Nome:</strong> {tournament.name || generateTournamentName(tournament)}
              </p>
              <p className="text-sm text-gray-300">
                <strong>Site:</strong> {tournament.site}
              </p>
              <p className="text-sm text-gray-300">
                <strong>Buy-in:</strong> ${parseFloat(tournament.buyIn || 0).toFixed(2)}
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Excluir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
