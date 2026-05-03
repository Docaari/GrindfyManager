import React, { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface AccessRequestDialogUser {
  id?: string;
  userPlatformId?: string;
  email?: string;
  username?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  subscriptionPlan: string;
}

export interface AccessRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AccessRequestDialogUser;
  onSubmitted?: (result: { id: string; status: string; createdAt: string }) => void;
}

const NAME_MIN = 2;
const NAME_MAX = 120;
const REASON_MIN = 20;
const REASON_MAX = 1000;

const formSchema = z.object({
  name: z.string().trim().min(NAME_MIN).max(NAME_MAX),
  reason: z.string().trim().min(REASON_MIN).max(REASON_MAX),
});

function resolveDefaultName(user: AccessRequestDialogUser): string {
  if (user.name && user.name.trim().length > 0) return user.name;
  const parts: string[] = [];
  if (user.firstName) parts.push(user.firstName);
  if (user.lastName) parts.push(user.lastName);
  const joined = parts.join(" ").trim();
  if (joined.length > 0) return joined;
  return user.username ?? "";
}

export function AccessRequestDialog({
  open,
  onOpenChange,
  user,
  onSubmitted,
}: AccessRequestDialogProps) {
  const { toast } = useToast();
  const defaultName = useMemo(() => resolveDefaultName(user), [user]);
  const [name, setName] = useState<string>(defaultName);
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<{ name?: string; reason?: string }>({});
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setReason("");
      setErrors({});
      setSubmitting(false);
    }
  }, [open, defaultName]);

  useEffect(() => {
    if (!open) return;
    textareaRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        onOpenChangeRef.current(false);
        return;
      }
      if (ev.key === "Tab" && formRef.current) {
        const focusables = formRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), button:not([disabled])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (ev.shiftKey && active === first) {
          ev.preventDefault();
          last.focus();
        } else if (!ev.shiftKey && active === last) {
          ev.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;

    const parsed = formSchema.safeParse({ name, reason });
    if (!parsed.success) {
      const fieldErrors: { name?: string; reason?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "name" && !fieldErrors.name) {
          fieldErrors.name = nameMessage(issue.code, issue.message);
        }
        if (key === "reason" && !fieldErrors.reason) {
          fieldErrors.reason = reasonMessage(issue.code, issue.message);
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const result = await apiRequest(
        "POST",
        "/api/library/access-requests",
        { name: parsed.data.name, reason: parsed.data.reason },
      );
      toast({
        title: "Pedido enviado",
        description: "Retorno em ate 24h por email.",
      });
      if (onSubmitted && result) onSubmitted(result);
      onOpenChange(false);
    } catch (err: any) {
      const status: number | undefined = err?.response?.status;
      if (status === 409) {
        toast({
          title: "Pedido ja em analise",
          description: "Voce ja tem um pedido pendente. Aguarde o retorno.",
        });
        onOpenChange(false);
      } else if (status === 429) {
        toast({
          title: "Muitas tentativas",
          description: "Aguarde um pouco antes de tentar novamente.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Falha ao enviar",
          description: "Tente novamente em instantes.",
          variant: "destructive",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Render ------------------------------------------------------------
  return (
    <div
      data-testid="access-request-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="access-request-dialog-title"
      className="fixed inset-0 z-[110] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/80" aria-hidden />
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-lg mx-4 p-6 rounded-lg bg-gray-900 border border-gray-700 shadow-xl space-y-4"
      >
        <header className="space-y-1">
          <h2
            id="access-request-dialog-title"
            className="text-lg font-semibold text-white"
          >
            Pedir liberacao de acesso
          </h2>
          <p className="text-xs text-gray-400">
            Resposta em ate 24h por email.
          </p>
        </header>

        {/* Nome */}
        <div className="space-y-1">
          <label
            htmlFor="access-request-name-input"
            className="block text-sm text-gray-300"
          >
            Nome
          </label>
          <input
            id="access-request-name-input"
            data-testid="access-request-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX + 10}
            className="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {errors.name && (
            <p
              data-testid="access-request-name-error"
              className="text-xs text-red-400"
            >
              {errors.name}
            </p>
          )}
        </div>

        {/* Plano atual (chip read-only) */}
        <div className="space-y-1">
          <p className="block text-sm text-gray-300">Plano atual</p>
          <span
            data-testid="access-request-plan-chip"
            className="inline-block px-3 py-1 rounded-full bg-gray-800 border border-gray-700 text-xs font-medium text-gray-200"
          >
            {user.subscriptionPlan}
          </span>
        </div>

        {/* Motivo */}
        <div className="space-y-1">
          <label
            htmlFor="access-request-reason-textarea"
            className="block text-sm text-gray-300"
          >
            Motivo
          </label>
          <textarea
            ref={textareaRef}
            id="access-request-reason-textarea"
            data-testid="access-request-reason-textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={5}
            placeholder="Conte rapidamente: por que quer acesso e o que pretende estudar primeiro?"
            className="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {errors.reason && (
            <p
              data-testid="access-request-reason-error"
              className="text-xs text-red-400"
            >
              {errors.reason}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            data-testid="access-request-cancel"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-md text-sm font-medium text-gray-300 hover:text-white border border-gray-600 hover:bg-gray-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            data-testid="access-request-submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-green-500 hover:bg-green-400 text-black disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Enviando..." : "Enviar pedido"}
          </button>
        </div>
      </form>
    </div>
  );
}

function nameMessage(code: string, fallback: string): string {
  if (code === "too_small") return `Nome deve ter no minimo ${NAME_MIN} caracteres.`;
  if (code === "too_big") return `Nome deve ter no maximo ${NAME_MAX} caracteres.`;
  return fallback;
}

function reasonMessage(code: string, fallback: string): string {
  if (code === "too_small")
    return `Motivo muito curto. Minimo de ${REASON_MIN} caracteres.`;
  if (code === "too_big")
    return `Motivo muito longo. Maximo de ${REASON_MAX} caracteres.`;
  return fallback;
}

export default AccessRequestDialog;
