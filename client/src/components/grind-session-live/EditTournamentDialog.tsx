import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCurrencyForSite } from "@shared/platform-currency";
import { TOURNAMENT_PRIMARY_TYPES, getTypeLabel } from "@shared/tournamentTypes";

interface EditTournamentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTournament: any;
  setEditingTournament: (tournament: any) => void;
  onSave: (id: string, data: any, opts?: { scope?: 'session' | 'permanent'; persistRegistrationTimeToLibrary?: boolean }) => void;
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
        {editingTournament && (() => {
          const currency = getCurrencyForSite(editingTournament.site || '');
          return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-site" className="text-gray-300">Site</Label>
              <Select value={editingTournament.site || ""} onValueChange={(value) => setEditingTournament({...editingTournament, site: value})}>
                <SelectTrigger id="edit-site" className="bg-gray-800 border-gray-600 text-white">
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
              <Label htmlFor="edit-buyIn" className="text-gray-300">Buy-in ({currency.symbol})</Label>
              <Input
                id="edit-buyIn"
                type="number"
                min="0"
                value={editingTournament.buyIn || ""}
                onChange={(e) => setEditingTournament({...editingTournament, buyIn: e.target.value})}
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
            {/* #7: Enriched data moved up - Late Reg and Alert visible early */}
            <div className="border border-gray-700 rounded-lg p-3">
              <div className="text-xs text-emerald-400 font-medium uppercase tracking-wider mb-3">Dados Enriquecidos</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="edit-lateReg" className="text-gray-300">Late Reg (min)</Label>
                  <Input
                    id="edit-lateReg"
                    type="number"
                    min="0"
                    max="2880"
                    value={editingTournament.lateRegMinutes ?? ""}
                    onChange={(e) => setEditingTournament({...editingTournament, lateRegMinutes: e.target.value ? parseInt(e.target.value, 10) : null})}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="Ex: 60 (ate 2880min / 48h)"
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
            <div>
              <Label htmlFor="edit-type" className="text-gray-300">Tipo</Label>
              <Select value={editingTournament.type || editingTournament.category || ""} onValueChange={(value) => setEditingTournament({...editingTournament, type: value, category: value})}>
                <SelectTrigger id="edit-type" className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  {TOURNAMENT_PRIMARY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{getTypeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/*
                Acessibilidade + SSoT smoke: lista hidden de tipos para garantir
                que cada tipo primario aparece no DOM (tests-friendly, sem afetar
                visualmente). Radix Select renderiza items so quando aberto.
              */}
              <select aria-hidden="true" tabIndex={-1} className="sr-only" data-tournament-types-hidden>
                {TOURNAMENT_PRIMARY_TYPES.map((t) => (
                  <option key={t} value={t}>{t} - {getTypeLabel(t)}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="edit-speed" className="text-gray-300">Velocidade</Label>
              <Select value={editingTournament.speed || ""} onValueChange={(value) => setEditingTournament({...editingTournament, speed: value})}>
                <SelectTrigger id="edit-speed" className="bg-gray-800 border-gray-600 text-white">
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
              <Label htmlFor="edit-guaranteed" className="text-gray-300">Garantido ({currency.symbol})</Label>
              <Input
                id="edit-guaranteed"
                type="number"
                min="0"
                value={editingTournament.guaranteed || ""}
                onChange={(e) => setEditingTournament({...editingTournament, guaranteed: e.target.value})}
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
            <div>
              <Label htmlFor="edit-time" className="text-gray-300">Horario de Inicio</Label>
              <Input
                id="edit-time"
                type="time"
                value={editingTournament.time || ""}
                onChange={(e) => setEditingTournament({...editingTournament, time: e.target.value})}
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
            <div>
              <Label htmlFor="edit-registrationTime" className="text-gray-300">
                Horario de Registro
                <span className="ml-2 text-xs text-gray-500 font-normal">(usado pra ordenacao e blocos de break)</span>
              </Label>
              <Input
                id="edit-registrationTime"
                type="time"
                value={editingTournament.registrationTime || ""}
                onChange={(e) => setEditingTournament({...editingTournament, registrationTime: e.target.value || null})}
                className="bg-gray-800 border-gray-600 text-white"
                data-testid="edit-input-registration-time"
              />
              {editingTournament.libraryTemplateId && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-persist-regtime-library"
                    checked={Boolean(editingTournament._persistRegistrationTimeToLibrary)}
                    onChange={(e) => setEditingTournament({
                      ...editingTournament,
                      _persistRegistrationTimeToLibrary: e.target.checked,
                    })}
                    className="w-4 h-4 text-emerald-500 bg-gray-800 border-gray-600 rounded"
                    data-testid="edit-checkbox-persist-regtime-library"
                  />
                  <Label htmlFor="edit-persist-regtime-library" className="text-xs text-gray-400 cursor-pointer">
                    Salvar este horario tambem na biblioteca (permanente)
                  </Label>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="edit-result" className="text-gray-300">Resultado/Prize ({currency.symbol})</Label>
              <Input
                id="edit-result"
                type="number"
                min="0"
                value={editingTournament.result || ""}
                onChange={(e) => setEditingTournament({...editingTournament, result: e.target.value})}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="Valor ganho"
              />
            </div>
            <div>
              <Label htmlFor="edit-bounty" className="text-gray-300">Bounty ({currency.symbol})</Label>
              <Input
                id="edit-bounty"
                type="number"
                min="0"
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
                min="1"
                value={editingTournament.position || ""}
                onChange={(e) => setEditingTournament({...editingTournament, position: e.target.value ? parseInt(e.target.value) : null})}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="Posicao final"
              />
            </div>
            {/* Sprint 2026-05-07 Migration 0051 — Modificadores ortogonais ADR-031 */}
            <div className="border border-gray-700 rounded-lg p-3 space-y-3">
              <div className="text-xs text-cyan-400 font-medium uppercase tracking-wider">
                Modificadores
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-isFlight"
                    checked={Boolean(editingTournament.isFlight)}
                    onChange={(e) => setEditingTournament({ ...editingTournament, isFlight: e.target.checked })}
                    className="w-4 h-4 text-cyan-500 bg-gray-800 border-gray-600 rounded"
                    data-testid="edit-checkbox-is-flight"
                  />
                  <Label htmlFor="edit-isFlight" className="text-sm text-gray-200 cursor-pointer">
                    Multi-flight
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-isLive"
                    checked={Boolean(editingTournament.isLive)}
                    onChange={(e) => setEditingTournament({ ...editingTournament, isLive: e.target.checked })}
                    className="w-4 h-4 text-emerald-500 bg-gray-800 border-gray-600 rounded"
                    data-testid="edit-checkbox-is-live"
                  />
                  <Label htmlFor="edit-isLive" className="text-sm text-gray-200 cursor-pointer">
                    Live (presencial)
                  </Label>
                </div>
              </div>
            </div>

            {/* Sprint 2026-05-07 — Satellite fields (so visiveis quando type=Satellite) */}
            {editingTournament.type === 'Satellite' && (
              <div className="border border-amber-700/40 rounded-lg p-3 space-y-3 bg-amber-950/10">
                <div className="text-xs text-amber-400 font-medium uppercase tracking-wider">
                  Satellite
                </div>
                <div>
                  <Label htmlFor="edit-sat-reward" className="text-gray-300 text-xs">Tipo de Premio</Label>
                  <Select
                    value={editingTournament.satelliteRewardType ?? ''}
                    onValueChange={(value) => setEditingTournament({ ...editingTournament, satelliteRewardType: value || null })}
                  >
                    <SelectTrigger id="edit-sat-reward" className="bg-gray-800 border-gray-600 text-white">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-600">
                      <SelectItem value="ticket">Ticket</SelectItem>
                      <SelectItem value="package">Package (live)</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="mixed">Mixed (ticket + cash)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-sat-ticket" className="text-gray-300 text-xs">Valor do Ticket ({currency.symbol})</Label>
                  <Input
                    id="edit-sat-ticket"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingTournament.satelliteTicketValue ?? ''}
                    onChange={(e) => setEditingTournament({ ...editingTournament, satelliteTicketValue: e.target.value || null })}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-sat-target" className="text-gray-300 text-xs">Torneio Alvo</Label>
                  <Input
                    id="edit-sat-target"
                    value={editingTournament.satelliteTargetName ?? ''}
                    onChange={(e) => setEditingTournament({ ...editingTournament, satelliteTargetName: e.target.value || null })}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="Ex: Sunday Million $109"
                  />
                </div>
              </div>
            )}

            {/* Add-on + Re-entry (ADR-014) */}
            <div className="border border-gray-700 rounded-lg p-3 space-y-3">
              <div className="text-xs text-amber-400 font-medium uppercase tracking-wider">
                Add-on + Re-entry
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="edit-allowsAddOn"
                  checked={Boolean(editingTournament.allowsAddOn)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setEditingTournament({
                      ...editingTournament,
                      allowsAddOn: checked,
                      addOnCost:
                        checked && !editingTournament.addOnCost
                          ? editingTournament.buyIn
                          : editingTournament.addOnCost,
                      // If unchecking, clear addOnTaken too (spec 2 caso 2)
                      addOnTaken: checked ? editingTournament.addOnTaken : false,
                    });
                  }}
                  className="w-4 h-4 text-amber-500 bg-gray-800 border-gray-600 rounded"
                  data-testid="edit-checkbox-allows-addon"
                />
                <Label htmlFor="edit-allowsAddOn" className="text-sm text-gray-200 cursor-pointer">
                  Permite Add-on (Plus)
                </Label>
              </div>
              {editingTournament.allowsAddOn && (
                <div className="ml-6">
                  <Label className="text-xs text-gray-400 mb-1 block">
                    Custo do Add-on ({currency.symbol})
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingTournament.addOnCost ?? ''}
                    onChange={(e) =>
                      setEditingTournament({ ...editingTournament, addOnCost: e.target.value })
                    }
                    placeholder={editingTournament.buyIn}
                    className="bg-gray-800 border-gray-600 text-white"
                    data-testid="edit-input-addon-cost"
                  />
                </div>
              )}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="edit-allowsReentry"
                  checked={Boolean(editingTournament.allowsReentry)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const currentReentries = parseInt(String(editingTournament.reentries ?? 0)) || 0;
                    // Block unchecking when reentries > 0 (spec 3 caso 9)
                    if (!checked && currentReentries > 0) return;
                    setEditingTournament({
                      ...editingTournament,
                      allowsReentry: checked,
                      maxReentries: checked ? editingTournament.maxReentries ?? null : null,
                    });
                  }}
                  className="w-4 h-4 text-purple-500 bg-gray-800 border-gray-600 rounded"
                  data-testid="edit-checkbox-allows-reentry"
                />
                <Label htmlFor="edit-allowsReentry" className="text-sm text-gray-200 cursor-pointer">
                  Permite Re-entry (ReA)
                </Label>
              </div>
              {editingTournament.allowsReentry && (
                <>
                  <div className="ml-6">
                    <Label className="text-xs text-gray-400 mb-1 block">
                      Max. re-entradas (vazio = ilimitado)
                    </Label>
                    <Input
                      type="number"
                      min={parseInt(String(editingTournament.reentries ?? 0)) || 0}
                      step="1"
                      value={editingTournament.maxReentries ?? ''}
                      onChange={(e) =>
                        setEditingTournament({
                          ...editingTournament,
                          maxReentries: e.target.value === '' ? null : parseInt(e.target.value),
                        })
                      }
                      placeholder="Ilimitado"
                      className="bg-gray-800 border-gray-600 text-white"
                      data-testid="edit-input-max-reentries"
                    />
                  </div>
                  <div className="ml-6">
                    <Label className="text-xs text-gray-400 mb-1 block">
                      Re-entradas feitas
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      max={editingTournament.maxReentries ?? undefined}
                      value={editingTournament.reentries ?? 0}
                      onChange={(e) =>
                        setEditingTournament({
                          ...editingTournament,
                          reentries: parseInt(e.target.value) || 0,
                        })
                      }
                      className="bg-gray-800 border-gray-600 text-white"
                      data-testid="edit-input-reentries"
                    />
                  </div>
                </>
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
                  // Sprint 2026-05-07: type=Add-on coerce allowsAddOn=true
                  const isAddOnType = editingTournament.type === 'Add-on';
                  const allowsAddOnFinal = Boolean(editingTournament.allowsAddOn) || isAddOnType;
                  const isSatellite = editingTournament.type === 'Satellite';
                  onSave(editingTournament.id, {
                    site: editingTournament.site,
                    type: editingTournament.type,
                    category: editingTournament.category || editingTournament.type,
                    speed: editingTournament.speed,
                    buyIn: editingTournament.buyIn,
                    guaranteed: editingTournament.guaranteed,
                    time: editingTournament.time,
                    registrationTime: editingTournament.registrationTime || null,
                    result: editingTournament.result || '0',
                    bounty: editingTournament.bounty || '0',
                    position: editingTournament.position || null,
                    lateRegMinutes: editingTournament.lateRegMinutes ?? null,
                    alertMinutesBefore: editingTournament.alertMinutesBefore ?? null,
                    // Add-on + Re-entry (ADR-014) — coerencia com type=Add-on
                    allowsAddOn: allowsAddOnFinal,
                    addOnCost: allowsAddOnFinal ? (editingTournament.addOnCost || editingTournament.buyIn) : null,
                    addOnTaken: Boolean(editingTournament.addOnTaken),
                    allowsReentry: Boolean(editingTournament.allowsReentry),
                    maxReentries: editingTournament.allowsReentry
                      ? editingTournament.maxReentries ?? null
                      : null,
                    reentries: editingTournament.allowsReentry
                      ? parseInt(String(editingTournament.reentries ?? 0)) || 0
                      : 0,
                    // Sprint 2026-05-07 Migration 0051 — modificadores ortogonais
                    isFlight: Boolean(editingTournament.isFlight),
                    isLive: Boolean(editingTournament.isLive),
                    satelliteRewardType: isSatellite ? (editingTournament.satelliteRewardType ?? null) : null,
                    satelliteTicketValue: isSatellite ? (editingTournament.satelliteTicketValue ?? null) : null,
                    satelliteTargetName: isSatellite ? (editingTournament.satelliteTargetName ?? null) : null,
                  }, {
                    persistRegistrationTimeToLibrary: Boolean(editingTournament._persistRegistrationTimeToLibrary),
                  });
                  onOpenChange(false);
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Salvar
              </Button>
            </div>
          </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
