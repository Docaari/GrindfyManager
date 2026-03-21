import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EditTournamentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTournament: any;
  setEditingTournament: (tournament: any) => void;
  onSave: (id: string, data: any) => void;
}

export default function EditTournamentDialog({
  open,
  onOpenChange,
  editingTournament,
  setEditingTournament,
  onSave,
}: EditTournamentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md mx-auto bg-blue-900 border-blue-600">
        <DialogHeader>
          <DialogTitle className="text-blue-100">Editar Torneio</DialogTitle>
        </DialogHeader>
        {editingTournament && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-site" className="text-blue-200">Site</Label>
              <Select value={editingTournament.site || ""} onValueChange={(value) => setEditingTournament({...editingTournament, site: value})}>
                <SelectTrigger className="bg-blue-800 border-blue-600 text-white">
                  <SelectValue placeholder="Selecione o site" />
                </SelectTrigger>
                <SelectContent className="bg-blue-800 border-blue-600">
                  <SelectItem value="PokerStars">PokerStars</SelectItem>
                  <SelectItem value="GGNetwork">GGNetwork</SelectItem>
                  <SelectItem value="PartyPoker">PartyPoker</SelectItem>
                  <SelectItem value="888Poker">888Poker</SelectItem>
                  <SelectItem value="WPN">WPN</SelectItem>
                  <SelectItem value="iPoker">iPoker</SelectItem>
                  <SelectItem value="Chico">Chico</SelectItem>
                  <SelectItem value="CoinPoker">CoinPoker</SelectItem>
                  <SelectItem value="Revolution">Revolution</SelectItem>
                  <SelectItem value="Bodog">Bodog</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-type" className="text-blue-200">Tipo</Label>
              <Select value={editingTournament.type || editingTournament.category || ""} onValueChange={(value) => setEditingTournament({...editingTournament, type: value, category: value})}>
                <SelectTrigger className="bg-blue-800 border-blue-600 text-white">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent className="bg-blue-800 border-blue-600">
                  <SelectItem value="Vanilla">Vanilla</SelectItem>
                  <SelectItem value="PKO">PKO</SelectItem>
                  <SelectItem value="Mystery">Mystery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-speed" className="text-blue-200">Velocidade</Label>
              <Select value={editingTournament.speed || ""} onValueChange={(value) => setEditingTournament({...editingTournament, speed: value})}>
                <SelectTrigger className="bg-blue-800 border-blue-600 text-white">
                  <SelectValue placeholder="Selecione a velocidade" />
                </SelectTrigger>
                <SelectContent className="bg-blue-800 border-blue-600">
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="Turbo">Turbo</SelectItem>
                  <SelectItem value="Hyper">Hyper</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-buyIn" className="text-blue-200">Buy-in ($)</Label>
              <Input
                id="edit-buyIn"
                type="number"
                value={editingTournament.buyIn || ""}
                onChange={(e) => setEditingTournament({...editingTournament, buyIn: e.target.value})}
                className="bg-blue-800 border-blue-600 text-white"
              />
            </div>
            <div>
              <Label htmlFor="edit-guaranteed" className="text-blue-200">Garantido ($)</Label>
              <Input
                id="edit-guaranteed"
                type="number"
                value={editingTournament.guaranteed || ""}
                onChange={(e) => setEditingTournament({...editingTournament, guaranteed: e.target.value})}
                className="bg-blue-800 border-blue-600 text-white"
              />
            </div>
            <div>
              <Label htmlFor="edit-time" className="text-blue-200">Horario</Label>
              <Input
                id="edit-time"
                type="time"
                value={editingTournament.time || ""}
                onChange={(e) => setEditingTournament({...editingTournament, time: e.target.value})}
                className="bg-blue-800 border-blue-600 text-white"
              />
            </div>
            <div>
              <Label htmlFor="edit-result" className="text-blue-200">Resultado/Prize ($)</Label>
              <Input
                id="edit-result"
                type="number"
                value={editingTournament.result || ""}
                onChange={(e) => setEditingTournament({...editingTournament, result: e.target.value})}
                className="bg-blue-800 border-blue-600 text-white"
                placeholder="Valor ganho"
              />
            </div>
            <div>
              <Label htmlFor="edit-bounty" className="text-blue-200">Bounty ($)</Label>
              <Input
                id="edit-bounty"
                type="number"
                value={editingTournament.bounty || ""}
                onChange={(e) => setEditingTournament({...editingTournament, bounty: e.target.value})}
                className="bg-blue-800 border-blue-600 text-white"
                placeholder="Valor de bounty"
              />
            </div>
            <div>
              <Label htmlFor="edit-position" className="text-blue-200">Posicao</Label>
              <Input
                id="edit-position"
                type="number"
                value={editingTournament.position || ""}
                onChange={(e) => setEditingTournament({...editingTournament, position: e.target.value ? parseInt(e.target.value) : null})}
                className="bg-blue-800 border-blue-600 text-white"
                placeholder="Posicao final"
              />
            </div>
            <div className="flex space-x-2 mt-6">
              <Button
                onClick={() => onOpenChange(false)}
                variant="outline"
                className="flex-1 border-blue-600 text-blue-200 hover:bg-blue-800"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  onSave(editingTournament.id, {
                    site: editingTournament.site,
                    type: editingTournament.type,
                    category: editingTournament.category || editingTournament.type,
                    speed: editingTournament.speed,
                    buyIn: editingTournament.buyIn,
                    guaranteed: editingTournament.guaranteed,
                    time: editingTournament.time,
                    result: editingTournament.result || '0',
                    bounty: editingTournament.bounty || '0',
                    position: editingTournament.position || null
                  });
                  onOpenChange(false);
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
