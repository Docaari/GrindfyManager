import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Plus, X } from "lucide-react";

interface WorkspaceMember {
  id: string;
  userId: string;
}
interface Workspace {
  id: string;
  name: string;
  createdBy: string | null;
  members: WorkspaceMember[];
}

/**
 * Painel admin de workspaces (Fase 4) — gateado server-side por
 * requireGranularPermission(workspace_admin). Lista workspaces + membros, cria
 * workspace, vincula/desvincula contas. Espelha PremiumCuratorPanel.
 */
export function WorkspaceAdminPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [memberDraft, setMemberDraft] = useState<Record<string, string>>({});

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ["/api/admin/workspaces"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/workspaces")) as Workspace[],
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/admin/workspaces"] });

  const createWorkspace = useMutation({
    mutationFn: async (name: string) =>
      apiRequest("POST", "/api/admin/workspaces", { name }),
    onSuccess: () => {
      setNewName("");
      invalidate();
      toast({ title: "Workspace criado" });
    },
    onError: () => toast({ title: "Não foi possível criar o workspace", variant: "destructive" }),
  });

  const addMember = useMutation({
    mutationFn: async ({ workspaceId, userId }: { workspaceId: string; userId: string }) =>
      apiRequest("POST", `/api/admin/workspaces/${workspaceId}/members`, { userId }),
    onSuccess: (_d, vars) => {
      setMemberDraft((prev) => ({ ...prev, [vars.workspaceId]: "" }));
      invalidate();
      toast({ title: "Conta vinculada" });
    },
    onError: (e: any) => {
      // 409 -> conta já está em um workspace (UNIQUE user_id).
      const conflict = e?.conflict === "already_in_workspace" || /409/.test(String(e?.message));
      toast({
        title: conflict ? "Conta já está em um workspace" : "Não foi possível vincular a conta",
        variant: "destructive",
      });
    },
  });

  const removeMember = useMutation({
    mutationFn: async ({ workspaceId, userId }: { workspaceId: string; userId: string }) =>
      apiRequest("DELETE", `/api/admin/workspaces/${workspaceId}/members/${userId}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Conta desvinculada" });
    },
    onError: () => toast({ title: "Não foi possível desvincular a conta", variant: "destructive" }),
  });

  const items = workspaces ?? [];

  return (
    <div data-testid="workspace-admin-panel" className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-blue-400" />
        <h3 className="text-lg font-bold">Workspaces de contas</h3>
      </div>

      {/* Criar workspace */}
      <div className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome do workspace"
          data-testid="ws-create-name"
          className="bg-gray-800 border-gray-700 text-white"
        />
        <Button
          type="button"
          size="sm"
          data-testid="ws-create-btn"
          disabled={!newName.trim() || createWorkspace.isPending}
          onClick={() => createWorkspace.mutate(newName.trim())}
          className="shrink-0 gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Criar workspace
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          Nenhum workspace criado ainda.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((ws) => (
            <div
              key={ws.id}
              data-testid={`workspace-${ws.id}`}
              className="bg-gray-800/40 border border-gray-700 rounded-lg p-3 space-y-2"
            >
              <div className="text-white font-medium text-sm">{ws.name}</div>

              {/* Membros */}
              {ws.members.length === 0 ? (
                <p className="text-xs text-gray-500">Sem contas vinculadas.</p>
              ) : (
                <div className="space-y-1">
                  {ws.members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between bg-gray-900/40 rounded px-2 py-1"
                    >
                      <span className="text-xs text-gray-300 truncate">{m.userId}</span>
                      <button
                        type="button"
                        data-testid={`ws-remove-member-${m.userId}`}
                        onClick={() => removeMember.mutate({ workspaceId: ws.id, userId: m.userId })}
                        disabled={removeMember.isPending}
                        className="text-gray-500 hover:text-red-400 shrink-0"
                        aria-label="Desvincular conta"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Adicionar conta */}
              <div className="flex items-center gap-2 pt-1">
                <Input
                  value={memberDraft[ws.id] ?? ""}
                  onChange={(e) => setMemberDraft((prev) => ({ ...prev, [ws.id]: e.target.value }))}
                  placeholder="ID da conta (USER-XXXX)"
                  className="bg-gray-800 border-gray-700 text-white text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid={`ws-add-member-${ws.id}`}
                  disabled={!(memberDraft[ws.id] ?? "").trim() || addMember.isPending}
                  onClick={() =>
                    addMember.mutate({ workspaceId: ws.id, userId: (memberDraft[ws.id] ?? "").trim() })
                  }
                  className="shrink-0 gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar conta
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WorkspaceAdminPanel;
