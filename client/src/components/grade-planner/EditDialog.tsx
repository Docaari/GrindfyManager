import * as React from "react";
import { UseFormReturn } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { sites, types, speeds, type TournamentForm } from './types';
import { getCurrencyForSite } from '@shared/platform-currency';
import { Switch } from "@/components/ui/switch";

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editForm: UseFormReturn<TournamentForm>;
  onSubmit: (data: TournamentForm) => void;
  onCancel: () => void;
  isPending: boolean;
  editingTournament?: any;
  onUpdateEnrichedFields?: (fields: { lateRegMinutes?: number | null; alertMinutesBefore?: number | null }) => void;
  showDayPicker?: boolean;
}

export function EditDialog({
  open,
  onOpenChange,
  editForm,
  onSubmit,
  onCancel,
  isPending,
  editingTournament,
  onUpdateEnrichedFields,
}: EditDialogProps) {
  const [lateRegValue, setLateRegValue] = React.useState<string>('');
  const [alertValue, setAlertValue] = React.useState<string>('');

  React.useEffect(() => {
    if (editingTournament) {
      setLateRegValue(editingTournament.lateRegMinutes != null ? String(editingTournament.lateRegMinutes) : '');
      setAlertValue(editingTournament.alertMinutesBefore != null ? String(editingTournament.alertMinutesBefore) : '');
    }
  }, [editingTournament]);

  const selectedSite = editForm.watch('site');
  const currencySymbol = selectedSite ? getCurrencyForSite(selectedSite).symbol : '$';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-emerald-400">Editar Torneio</DialogTitle>
        </DialogHeader>

        <Form {...editForm}>
          <form onSubmit={editForm.handleSubmit((data) => {
            if (onUpdateEnrichedFields) {
              const lateReg = lateRegValue.trim() === '' ? null : parseInt(lateRegValue);
              const alert = alertValue.trim() === '' ? null : parseInt(alertValue);
              onUpdateEnrichedFields({
                lateRegMinutes: lateReg !== null && !isNaN(lateReg) && lateReg >= 0 && lateReg <= 999 ? lateReg : null,
                alertMinutesBefore: alert !== null && !isNaN(alert) && alert >= 1 && alert <= 120 ? alert : null,
              });
            }
            onSubmit(data);
          })} className="space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Site */}
            <FormField
              control={editForm.control}
              name="site"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Site</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Selecione um site" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {sites.map((site) => (
                        <SelectItem key={site} value={site}>{site}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Buy-in */}
            <FormField
              control={editForm.control}
              name="buyIn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Buy-in ({currencySymbol})</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        {currencySymbol}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400 pl-9"
                        placeholder="0.00"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Time */}
            <FormField
              control={editForm.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Hor&#225;rio</FormLabel>
                  <FormControl>
                    <Input
                      type="time"
                      {...field}
                      className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Name */}
            <FormField
              control={editForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Nome (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400"
                      placeholder="Nome do torneio"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Type */}
            <FormField
              control={editForm.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Tipo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Selecione um tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {types.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Speed */}
            <FormField
              control={editForm.control}
              name="speed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Velocidade</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Selecione a velocidade" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {speeds.map((speed) => (
                        <SelectItem key={speed} value={speed}>{speed}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Guaranteed */}
            <FormField
              control={editForm.control}
              name="guaranteed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Garantido ({currencySymbol}) (opcional)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        {currencySymbol}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400 pl-9"
                        placeholder="0.00"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Priority */}
            <FormField
              control={editForm.control}
              name="prioridade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Prioridade</FormLabel>
                  <Select onValueChange={(value) => field.onChange(Number(value))} value={String(field.value)}>
                    <FormControl>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Selecione a prioridade" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="1">Alta</SelectItem>
                      <SelectItem value="2">M&#233;dia</SelectItem>
                      <SelectItem value="3">Baixa</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Sprint 2026-05-07: Modificadores + Add-on + Satellite condicional */}
            <div className="space-y-3 border-t border-slate-700 pt-4">
              <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Modificadores</div>

              {/* isFlight + isLive sempre visiveis */}
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={editForm.control}
                  name="isFlight"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <Switch
                        checked={Boolean(field.value)}
                        onCheckedChange={field.onChange}
                        id="edit-isflight"
                      />
                      <Label htmlFor="edit-isflight" className="cursor-pointer text-slate-200 text-sm m-0">
                        Multi-flight (Day 1A/1B...)
                      </Label>
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="isLive"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <Switch
                        checked={Boolean(field.value)}
                        onCheckedChange={field.onChange}
                        id="edit-islive"
                      />
                      <Label htmlFor="edit-islive" className="cursor-pointer text-slate-200 text-sm m-0">
                        Live (presencial)
                      </Label>
                    </FormItem>
                  )}
                />
              </div>

              {/* Add-on toggle */}
              <FormField
                control={editForm.control}
                name="allowsAddOn"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <Switch
                      checked={Boolean(field.value)}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        if (checked && !editForm.getValues('addOnCost')) {
                          editForm.setValue('addOnCost', editForm.getValues('buyIn') || '');
                        }
                      }}
                      id="edit-allowsaddon"
                    />
                    <Label htmlFor="edit-allowsaddon" className="cursor-pointer text-slate-200 text-sm m-0">
                      Permite Add-on (Plus)
                    </Label>
                  </FormItem>
                )}
              />
              {Boolean(editForm.watch('allowsAddOn')) && (
                <FormField
                  control={editForm.control}
                  name="addOnCost"
                  render={({ field }) => (
                    <FormItem className="ml-10">
                      <FormLabel className="text-slate-300 text-xs">Custo do Add-on ({currencySymbol})</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value)}
                          className="bg-slate-800 border-slate-700 text-slate-200"
                          placeholder={editForm.watch('buyIn') || '0.00'}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              {/* Re-entry toggle */}
              <FormField
                control={editForm.control}
                name="allowsReentry"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <Switch
                      checked={Boolean(field.value)}
                      onCheckedChange={field.onChange}
                      id="edit-allowsreentry"
                    />
                    <Label htmlFor="edit-allowsreentry" className="cursor-pointer text-slate-200 text-sm m-0">
                      Permite Re-entry (ReA)
                    </Label>
                  </FormItem>
                )}
              />
              {Boolean(editForm.watch('allowsReentry')) && (
                <FormField
                  control={editForm.control}
                  name="maxReentries"
                  render={({ field }) => (
                    <FormItem className="ml-10">
                      <FormLabel className="text-slate-300 text-xs">Max. re-entradas (vazio = ilimitado)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={field.value == null ? '' : String(field.value)}
                          onChange={(e) => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                          className="bg-slate-800 border-slate-700 text-slate-200"
                          placeholder="Ilimitado"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              {/* Satellite fields — so quando type=Satellite */}
              {editForm.watch('type') === 'Satellite' && (
                <div className="border-t border-amber-700/30 bg-amber-950/10 -mx-2 mt-2 px-2 py-3 rounded space-y-3">
                  <div className="text-xs text-amber-400 font-medium uppercase tracking-wider">Satellite</div>
                  <FormField
                    control={editForm.control}
                    name="satelliteRewardType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300 text-xs">Tipo de Premio</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ''}>
                          <FormControl>
                            <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="ticket">Ticket</SelectItem>
                            <SelectItem value="package">Package (live)</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="mixed">Mixed (ticket + cash)</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="satelliteTicketValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300 text-xs">Valor do Ticket ({currencySymbol})</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value)}
                            className="bg-slate-800 border-slate-700 text-slate-200"
                            placeholder="0.00"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="satelliteTargetName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300 text-xs">Torneio Alvo</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ''}
                            className="bg-slate-800 border-slate-700 text-slate-200"
                            placeholder="Ex: Sunday Million $109"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            {/* Enriched fields */}
            {editingTournament && (
              <div className="space-y-4 border-t border-slate-700 pt-4">
                <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Dados Enriquecidos</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-slate-200 text-sm">Late Reg (min)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="999"
                      value={lateRegValue}
                      onChange={(e) => setLateRegValue(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400"
                      placeholder="Ex: 60"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-200 text-sm">Alerta (min antes)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="120"
                      value={alertValue}
                      onChange={(e) => setAlertValue(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400"
                      placeholder="Default: 10min"
                    />
                  </div>
                </div>
                {/* Read-only enriched info */}
                {(editingTournament.startingStack || editingTournament.maxPlayers || editingTournament.gameType || editingTournament.blindLevelMinutes) && (
                  <div className="text-xs text-slate-400 space-y-1">
                    {editingTournament.gameType && <div>Tipo de Jogo: <span className="text-slate-200">{editingTournament.gameType}</span></div>}
                    {editingTournament.startingStack && <div>Stack Inicial: <span className="text-slate-200">{editingTournament.startingStack}</span></div>}
                    {editingTournament.maxPlayers && <div>Max Jogadores: <span className="text-slate-200">{editingTournament.maxPlayers}</span></div>}
                    {editingTournament.blindLevelMinutes && <div>Nivel de Blind: <span className="text-slate-200">{editingTournament.blindLevelMinutes}min</span></div>}
                  </div>
                )}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                {isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Salvando...
                  </div>
                ) : (
                  'Salvar Altera\u00e7\u00f5es'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
