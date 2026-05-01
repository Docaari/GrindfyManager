import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Sprint Spot-Screenshots — useSpotUpload(sessionId)
// Spec: Docs/specs/spot-screenshots.md (RF-05)
// Mutation hook: envia multipart/form-data quando imageBuffer presente, JSON
// puro caso contrario. Erros classificados via status + body.code -> toast.

export interface SpotUploadInput {
  tournamentId: string;
  type: string;
  spot: string;
  notes?: string;
  imageBuffer?: ArrayBuffer | Buffer | Uint8Array;
  mimeType?: string;
  capturedDuring?: "grind-live" | "cooldown";
}

function bufferToBlob(
  data: ArrayBuffer | Buffer | Uint8Array,
  mime: string,
): Blob {
  if (data instanceof ArrayBuffer) {
    return new Blob([data], { type: mime });
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    const ab = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    );
    return new Blob([ab], { type: mime });
  }
  return new Blob([data as Uint8Array], { type: mime });
}

function extractStatusCode(err: any): number | undefined {
  return err?.status ?? err?.response?.status;
}

function extractBodyCode(err: any): string | undefined {
  return err?.body?.code ?? err?.response?.data?.code;
}

export function useSpotUpload(sessionId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: SpotUploadInput) => {
      const {
        tournamentId,
        type,
        spot,
        notes,
        imageBuffer,
        mimeType,
        capturedDuring,
      } = input;

      if (imageBuffer && mimeType) {
        const formData = new FormData();
        const blob = bufferToBlob(imageBuffer, mimeType);
        const ext =
          mimeType === "image/png"
            ? "png"
            : mimeType === "image/jpeg"
              ? "jpg"
              : mimeType === "image/webp"
                ? "webp"
                : "bin";
        formData.append("file", blob, `spot.${ext}`);
        formData.append("sessionId", sessionId);
        formData.append("sessionTournamentId", tournamentId);
        formData.append("type", type);
        formData.append("spot", spot);
        if (notes) formData.append("notes", notes);
        if (capturedDuring) formData.append("capturedDuring", capturedDuring);

        return apiRequest("POST", "/api/starred-hands", formData);
      }

      return apiRequest("POST", "/api/starred-hands", {
        sessionId,
        sessionTournamentId: tournamentId,
        type,
        spot,
        notes,
        capturedDuring,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["starred-hands", sessionId],
      });
    },
    onError: (err: any) => {
      const status = extractStatusCode(err);
      const code = extractBodyCode(err);

      if (status === 413) {
        toast({
          title: "Imagem grande demais",
          description: "Limite maximo: 5MB.",
          variant: "destructive",
        });
        return;
      }

      if (status === 409 && code === "session_completed") {
        toast({
          title: "Sessao concluida",
          description: "Nao eh possivel adicionar spots em sessao concluida.",
          variant: "destructive",
        });
        return;
      }

      if (
        (status === 409 || status === 400) &&
        (code === "star_limit_reached" || code === "session_spot_limit_reached")
      ) {
        toast({
          title: "Limite de spots atingido",
          description:
            code === "star_limit_reached"
              ? "Maximo 3 spots por torneio."
              : "Maximo 10 spots por sessao.",
          variant: "destructive",
        });
        return;
      }

      if (status === 400) {
        toast({
          title: "Erro ao salvar spot",
          description: err?.body?.message ?? err?.message ?? "Body invalido",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Erro ao salvar spot",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    },
  });
}
