/**
 * SpotScreenshotPaster — Sprint F2 W2 (green phase).
 *
 * Spec: Docs/specs/sprint-f2-spot-screenshots.md (RF-01 + RF-07)
 * Flow: Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 1)
 *
 * Captura paste de imagem (Ctrl+V) durante sessao live de grind, valida MIME +
 * tamanho client-side, dispara POST /api/starred-hands/screenshot (multipart)
 * via apiRequest. Mostra contador "X/maxCount prints" + botao fallback file
 * picker. NAO captura paste quando focus em input/textarea/contenteditable.
 *
 * Lessons aplicadas:
 *   #1  hooks primeiro (useEffect APOS destructure de props)
 *   #11 default minimo (counter + paste + file picker; sem acoes extras)
 *   #12 estado persistente: usedCount vem de prop (caller le query)
 */
import { useEffect, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ImagePlus } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { track } from '@/lib/telemetry';

export interface SpotScreenshotPasterProps {
  sessionId: string;
  usedCount: number;
  maxCount?: number;
  sessionTournamentId?: string;
  onUploaded?: (spot: {
    id: string;
    imageUrl: string;
    expiresAt: string;
    sessionTournamentId?: string;
    pastedAt?: string;
  }) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}

const ACCEPTED_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  // contenteditable
  const ce = (el as HTMLElement).getAttribute?.('contenteditable');
  if (ce && ce !== 'false') return true;
  return false;
}

export default function SpotScreenshotPaster(props: SpotScreenshotPasterProps) {
  const {
    sessionId,
    usedCount,
    maxCount = 10,
    sessionTournamentId,
    onUploaded,
    onError,
    disabled = false,
  } = props;

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Refs para evitar stale closures dentro do listener (lesson #1: handler
  // estavel em mount; le valores via ref).
  const usedCountRef = useRef(usedCount);
  const maxCountRef = useRef(maxCount);
  const sessionIdRef = useRef(sessionId);
  const sessionTournamentIdRef = useRef(sessionTournamentId);
  const disabledRef = useRef(disabled);
  const onUploadedRef = useRef(onUploaded);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    usedCountRef.current = usedCount;
  }, [usedCount]);
  useEffect(() => {
    maxCountRef.current = maxCount;
  }, [maxCount]);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    sessionTournamentIdRef.current = sessionTournamentId;
  }, [sessionTournamentId]);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const uploadFile = useCallback(async (file: File, source: 'paste' | 'upload') => {
    const fd = new FormData();
    fd.append('screenshot', file);
    fd.append('sessionId', sessionIdRef.current);
    fd.append('source', source);
    if (sessionTournamentIdRef.current) {
      fd.append('sessionTournamentId', sessionTournamentIdRef.current);
    }

    const startedAt = Date.now();
    try {
      const res = await apiRequest('POST', '/api/starred-hands/screenshot', fd);
      if (res && typeof res === 'object' && res.id && res.imageUrl) {
        // Sprint F2 W4: telemetria spot.pasted apos sucesso 201.
        try {
          track('spot.pasted', {
            sessionId: sessionIdRef.current,
            sessionTournamentId:
              res.sessionTournamentId ?? sessionTournamentIdRef.current ?? null,
            source,
            durationMs: Date.now() - startedAt,
          });
        } catch {
          // telemetry never throws user-facing
        }
        onUploadedRef.current?.(res);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const code = err?.response?.data?.code;

      if (status === 409 || code === 'spot_limit_reached') {
        onErrorRef.current?.('Limite de prints atingido (10/sessao)');
        return;
      }
      if (status === 422 || code === 'no_tournament_in_session') {
        onErrorRef.current?.('Sessao sem torneio em jogo');
        return;
      }
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        'Erro ao salvar print';
      onErrorRef.current?.(typeof msg === 'string' && msg.length > 0 ? msg : 'Erro ao salvar print');
    }
  }, []);

  const processFile = useCallback(
    (file: File, source: 'paste' | 'upload') => {
      if (disabledRef.current) return;

      if (usedCountRef.current >= maxCountRef.current) {
        onErrorRef.current?.('Limite de prints atingido (10/sessao)');
        return;
      }

      if (!ACCEPTED_MIMES.includes(file.type)) {
        onErrorRef.current?.('Formato invalido. Aceitos: PNG, JPG, WebP');
        return;
      }

      if (file.size > MAX_BYTES) {
        onErrorRef.current?.('Imagem maior que 5MB');
        return;
      }

      void uploadFile(file, source);
    },
    [uploadFile],
  );

  // Paste listener global em window (com cleanup garantido).
  useEffect(() => {
    function handlePaste(e: Event) {
      if (disabledRef.current) return;

      // Sprint Spot-Screenshots (2026-05-01): se SpotPasteHandler (F4) estiver
      // montado, defere para ele — evita duplicacao de spot por Ctrl+V.
      if ((globalThis as any).__SPOT_PASTE_HANDLER_F4_ACTIVE__) return;

      // Guard activeElement: se input/textarea/contenteditable focado, ignora.
      if (isEditableTarget(document.activeElement)) return;

      const ev = e as ClipboardEvent;
      const items = ev.clipboardData?.items;
      if (!items) return;

      let foundFile: File | null = null;
      for (let i = 0; i < items.length; i++) {
        const it = items[i] as DataTransferItem;
        if (it.kind === 'file' && typeof it.type === 'string' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            foundFile = f;
            break;
          }
        }
      }

      if (!foundFile) return;
      processFile(foundFile, 'paste');
    }

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [processFile]);

  const handleFilePickerClick = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      processFile(file, 'upload');
    },
    [processFile],
  );

  return (
    <div className="flex items-center gap-2" data-testid="spot-paster-root">
      <Badge
        variant="secondary"
        data-testid="spot-paster-counter"
        className="font-mono"
      >
        {usedCount}/{maxCount} prints
      </Badge>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={handleFilePickerClick}
        data-testid="spot-paster-file-picker"
      >
        <ImagePlus className="w-4 h-4 mr-1" />
        Adicionar print
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={handleFileChange}
        data-testid="spot-paster-file-input"
      />
    </div>
  );
}
