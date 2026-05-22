// Sprint Mini Player 3.2 / W-B5 (ADR-198) — PT-BR error mapping.
//
// Mapeia codigos de erro browser/HTTP/driver para mensagens PT-BR amigaveis
// exibidas no error banner do MiniPlayerBar.
//
// Telemetria mantem o codigo tecnico (granular). UI mostra a versao PT-BR.

export interface AudioErrorLike {
  code?: string | null;
  message?: string | null;
  httpStatus?: number | null;
}

const FALLBACK_MESSAGE = "Erro ao carregar audio. Tente novamente.";

/**
 * Mapeia um erro de audio (codigo tecnico) para mensagem amigavel PT-BR.
 *
 * Aceita objeto AudioErrorLike OU string simples (back-compat).
 * Fallback generico quando codigo nao mapeado.
 */
export function mapAudioErrorToMessage(
  error: AudioErrorLike | string | null | undefined,
): string {
  if (!error) return FALLBACK_MESSAGE;

  let code: string | null = null;
  let httpStatus: number | null = null;
  if (typeof error === "string") {
    code = error;
  } else if (typeof error === "object") {
    code = error.code ?? null;
    httpStatus = error.httpStatus ?? null;
  }

  // DEMUXER_ERROR_*: formato nao suportado.
  if (code && /^DEMUXER_ERROR_/i.test(code)) {
    return "Formato de audio nao suportado.";
  }
  // MEDIA_ELEMENT_ERROR network.
  if (code && /MEDIA_ELEMENT_ERROR_NETWORK/i.test(code)) {
    return "Falha de rede. Verifique sua conexao.";
  }
  // HTTP status / code aliases.
  if (
    code === "track_not_found" ||
    code === "http_404" ||
    httpStatus === 404
  ) {
    return "Faixa nao encontrada.";
  }
  if (code === "http_403" || httpStatus === 403) {
    return "Sem permissao para esta faixa.";
  }
  if (
    code === "http_500" ||
    code === "http_503" ||
    httpStatus === 500 ||
    httpStatus === 503
  ) {
    return "Servidor indisponivel. Tente novamente em instantes.";
  }
  if (code === "buffering_timeout") {
    return "Audio demorou a carregar. Tente novamente.";
  }
  return FALLBACK_MESSAGE;
}

/** @internal Test-only export. */
export const _AUDIO_ERROR_FALLBACK_MESSAGE = FALLBACK_MESSAGE;
