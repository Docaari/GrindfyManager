// Upload progress helper functions (FP-02)

export type UploadPhase = 'preparing' | 'uploading' | 'processing' | 'complete';

export function calculateUploadProgress(loaded: number, total: number): number {
  if (total <= 0) return 0;
  const pct = Math.floor((loaded / total) * 100);
  return Math.min(pct, 100);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function estimateTimeRemaining(loaded: number, total: number, elapsedMs: number): number | null {
  if (elapsedMs <= 0) return null;
  if (total <= 0) return null;
  if (loaded <= 0) return null;
  if (loaded >= total) return 0;
  const speed = loaded / elapsedMs; // bytes per ms
  const remaining = total - loaded;
  return Math.ceil(remaining / speed / 1000);
}

export function getUploadPhase(progress: number): UploadPhase {
  if (progress <= 0) return 'preparing';
  if (progress > 100) return 'complete';
  if (progress === 100) return 'processing';
  return 'uploading';
}

export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return '0 KB/s';
  if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}
