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
      <DialogContent className="max-w-md mx-auto bg-gray-900 border border-gray-700 p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-white">Editar Torneio</DialogTitle>
        </DialogHeader>
        {editingTournament && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-site" className="text-gray-300">Site</Label>
              <Select value={editingTournament.site || ""} onValueChange={(value) => setEditingTournament({...editingTournament, site: value})}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue placeholder="Selecione o site" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
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
                  <SelectItem value="Suprema">Suprema</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-type" className="text-gray-300">Tipo</Label>
              <Select value={editingTournament.type || editingTournament.category || ""} onValueChange={(value) => setEditingTournament({...editingTournament, type: value, category: value})}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="Vanilla">Vanilla</SelectItem>
                  <SelectItem value="PKO">PKO</SelectItem>
                  <SelectItem value="Mystery">Mystery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-speed" className="text-gray-300">Velocidade</Label>
              <Select value={editingTournament.speed || ""} onValueChange={(value) => setEditingTournament({...editingTournament, speed: value})}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue placeholder="Selecione a velocidade" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="Turbo">Turbo</SelectItem>
                  <SelectItem value="Hyper">Hyper</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-buyIn" className="text-gray-300">Buy-in ($)</Label>
              <Input
                id="edit-buyIn"
                type="number"
                value={editingTournament.buyIn || ""}
                onChange={(e) => setEditingTournament({...editingTournament, buyIn: e.target.value})}
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
            <div>
              <Label htmlFor="edit-guaranteed" className="text-gray-300">Garantido ($)</Label>
              <Input
                id="edit-guaranteed"
                type="number"
                value={editingTournament.guaranteed || ""}
                onChange={(e) => setEditingTournament({...editingTournament, guaranteed: e.target.value})}
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
            <div>
              <Label htmlFor="edit-time" className="text-gray-300">Horario</Label>
              <Input
                id="edit-time"
                type="time"
                value={editingTournament.time || ""}
                onChange={(e) => setEditingTournament({...editingTournament, time: e.target.value})}
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
            <div>
              <Label htmlFor="edit-result" className="text-gray-300">Resultado/Prize ($)</Label>
              <Input
                id="edit-result"
                type="number"
                value={editingTournament.result || ""}
                onChange={(e) => setEditingTournament({...editingTournament, result: e.target.value})}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="Valor ganho"
              />
            </div>
            <div>
              <Label htmlFor="edit-bounty" className="text-gray-300">Bounty ($)</Label>
              <Input
                id="edit-bounty"
                type="number"
                value={editingTournament.bounty || ""}
                onChange={(e) => setEditingTournament({...editingTournament, bounty: e.target.value})}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="Valor de bounty"
              />
            </div>
            <div>
              <Label htmlFor="edit-position" className="text-gray-300">Posicao</Label>
              <Input
                id="edit-position"
                type="number"
                value={editingTournament.position || ""}
                onChange={(e) => setEditingTournament({...editingTournament, position: e.target.value ? parseInt(e.target.value) : null})}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="Posicao final"
              />
            </div>
            {/* Enriched fields */}
            <div className="border-t border-gray-700 pt-4">
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-3">Dados Enriquecidos</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="edit-lateReg" className="text-gray-300">Late Reg (min)</Label>
                  <Input
                    id="edit-lateReg"
                    type="number"
                    min="0"
                    max="999"
                    value={editingTournament.lateRegMinutes ?? ""}
                    onChange={(e) => setEditingTournament({...editingTournament, lateRegMinutes: e.target.value ? parseInt(e.target.value) : null})}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="Ex: 60"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-alert" className="text-gray-300">Alerta (min antes)</Label>
                  <Input
                    id="edit-alert"
                    type="number"
                    min="1"
                    max="120"
                    value={editingTournament.alertMinutesBefore ?? ""}
                    onChange={(e) => setEditingTournament({...editingTournament, alertMinutesBefore: e.target.value ? parseInt(e.target.value) : null})}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="Default: 10min"
                  />
                </div>
              </div>
              {(editingTournament.startingStack || editingTournament.maxPlayers || editingTournament.gameType || editingTournament.blindLevelMinutes) && (
                <div className="text-xs text-gray-400 mt-3 space-y-1">
                  {editingTournament.gameType && <div>Tipo de Jogo: <span className="text-white">{editingTournament.gameType}</span></div>}
                  {editingTournament.startingStack && <div>Stack Inicial: <span className="text-white">{editingTournament.startingStack}</span></div>}
                  {editingTournament.maxPlayers && <div>Max Jogadores: <span className="text-white">{editingTournament.maxPlayers}</span></div>}
                  {editingTournament.blindLevelMinutes && <div>Nivel de Blind: <span className="text-white">{editingTournament.blindLevelMinutes}min</span></div>}
                </div>
              )}
            </div>
            <div className="flex space-x-2 mt-6">
              <Button
                onClick={() => onOpenChange(false)}
                variant="outline"
                className="flex-1 bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600"
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
                    position: editingTournament.position || null,
                    lateRegMinutes: editingTournament.lateRegMinutes ?? null,
                    alertMinutesBefore: editingTournament.alertMinutesBefore ?? null,
                  });
                  onOpenChange(false);
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
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
